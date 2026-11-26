const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runCalendarUpdate, formatDateYMD, VALID_SHOW_TYPES } = require('./scraperEngine');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CITIES_DIR = path.join(DATA_DIR, 'cities');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const USER_PROFILES_PATH = path.join(DATA_DIR, 'user_profiles.json');
const SHARED_ATTENDANCE_PATH = path.join(DATA_DIR, 'shared_attendance.json');
const COMMUNITY_EVENTS_PATH = path.join(DATA_DIR, 'community_events.json');
const ACCESS_LOGS_PATH = path.join(DATA_DIR, 'access_logs.json');
const DEFAULT_GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '108535358368-9rfnr7kk4iklcp6qd7rq9cu5luivr2l2.apps.googleusercontent.com';

const ADMIN_COOKIE_NAME = 'go2enjoy_admin_session';
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminLoginAttempts = new Map();
const serverStats = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  apiRequests: 0,
  recentErrors: []
};

// =========================================================================
// GITHUB DATA-STORE SYNC (PERSISTENCIA EN RAMA DEDICADA `data-store`)
// =========================================================================
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPO = String(process.env.GITHUB_REPO || 'gaudiramone/go2enjoy').trim();
const GITHUB_DATA_BRANCH = String(process.env.GITHUB_DATA_BRANCH || 'data-store').trim();
const GITHUB_SYNC_FILES = [
  'config.json',
  'db.json',
  'user_profiles.json',
  'shared_attendance.json',
  'community_events.json',
  'access_logs.json'
];

const githubDataStoreState = {
  enabled: Boolean(GITHUB_TOKEN && GITHUB_REPO.includes('/')),
  repo: GITHUB_REPO,
  branch: GITHUB_DATA_BRANCH,
  initialized: false,
  lastSyncAt: null,
  lastError: null,
  fileShas: new Map(),
  timers: new Map(),
  queues: new Map()
};

async function githubApi(endpoint, options = {}) {
  const url = `https://api.github.com${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'go2enjoy-server',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

async function ensureGitHubDataBranch() {
  if (!githubDataStoreState.enabled) return false;
  const refPath = `/repos/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(GITHUB_DATA_BRANCH)}`;
  const check = await githubApi(refPath);
  if (check.ok) return true;
  if (check.status !== 404) {
    throw new Error(`Error comprobando rama ${GITHUB_DATA_BRANCH}: HTTP ${check.status}`);
  }

  const repoInfo = await githubApi(`/repos/${GITHUB_REPO}`);
  const baseBranch = repoInfo.json?.default_branch || 'main';
  const baseRef = await githubApi(`/repos/${GITHUB_REPO}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  const baseSha = baseRef.json?.object?.sha;
  if (!baseSha) {
    throw new Error(`No se encontró SHA base de la rama ${baseBranch}`);
  }

  const create = await githubApi(`/repos/${GITHUB_REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${GITHUB_DATA_BRANCH}`,
      sha: baseSha
    })
  });
  if (!create.ok && create.status !== 422) {
    throw new Error(`No se pudo crear la rama ${GITHUB_DATA_BRANCH}: HTTP ${create.status}`);
  }
  console.log(`✅ Rama GitHub '${GITHUB_DATA_BRANCH}' lista en ${GITHUB_REPO}`);
  return true;
}

function encodeDataRelPath(relPath) {
  return String(relPath).split('/').map(encodeURIComponent).join('/');
}

async function pullFileFromGitHub(fileName) {
  const relEncoded = encodeDataRelPath(fileName);
  const res = await githubApi(`/repos/${GITHUB_REPO}/contents/data/${relEncoded}?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`);
  if (res.status === 404) {
    const localPath = path.join(DATA_DIR, fileName);
    if (fs.existsSync(localPath)) {
      await pushFileToGitHub(fileName);
    }
    return;
  }
  if (!res.ok) {
    throw new Error(`Pull ${fileName} falló: HTTP ${res.status}`);
  }
  let base64Content = res.json?.content || '';
  if (!base64Content && res.json?.sha) {
    // GitHub Contents API devuelve content vacío para ficheros > 1 MB; usar Git Blobs API
    const blobRes = await githubApi(`/repos/${GITHUB_REPO}/git/blobs/${encodeURIComponent(res.json.sha)}`);
    if (!blobRes.ok || !blobRes.json?.content) {
      throw new Error(`Pull blob ${fileName} falló: HTTP ${blobRes.status}`);
    }
    base64Content = blobRes.json.content;
  }
  if (!base64Content) {
    throw new Error(`Pull ${fileName} sin contenido (HTTP ${res.status})`);
  }
  const decoded = Buffer.from(String(base64Content).replace(/\n/g, ''), 'base64').toString('utf8');
  const localPath = path.join(DATA_DIR, fileName);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, decoded, 'utf8');
  githubDataStoreState.fileShas.set(fileName, res.json.sha);
  githubDataStoreState.lastSyncAt = new Date().toISOString();
}

async function pushFileToGitHub(fileName, retryOnConflict = true) {
  if (!githubDataStoreState.enabled) return;
  const localPath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(localPath)) return;

  const relEncoded = encodeDataRelPath(fileName);
  const contentB64 = fs.readFileSync(localPath).toString('base64');
  let sha = githubDataStoreState.fileShas.get(fileName);
  if (!sha) {
    const existing = await githubApi(`/repos/${GITHUB_REPO}/contents/data/${relEncoded}?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`);
    if (existing.ok && existing.json?.sha) {
      sha = existing.json.sha;
      githubDataStoreState.fileShas.set(fileName, sha);
    }
  }

  const body = {
    message: `chore(data-store): update data/${fileName}`,
    content: contentB64,
    branch: GITHUB_DATA_BRANCH,
    ...(sha ? { sha } : {})
  };
  const putRes = await githubApi(`/repos/${GITHUB_REPO}/contents/data/${relEncoded}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  if (putRes.status === 409 && retryOnConflict) {
    githubDataStoreState.fileShas.delete(fileName);
    return pushFileToGitHub(fileName, false);
  }
  if (!putRes.ok) {
    throw new Error(`Push ${fileName} falló: HTTP ${putRes.status} ${putRes.json?.message || ''}`);
  }
  if (putRes.json?.content?.sha) {
    githubDataStoreState.fileShas.set(fileName, putRes.json.content.sha);
  }
  githubDataStoreState.lastSyncAt = new Date().toISOString();
  githubDataStoreState.lastError = null;
}

function scheduleGitHubSync(fileName, delayMs = 300) {
  if (!githubDataStoreState.enabled) return;
  const prevTimer = githubDataStoreState.timers.get(fileName);
  if (prevTimer) clearTimeout(prevTimer);

  const timer = setTimeout(() => {
    githubDataStoreState.timers.delete(fileName);
    const prevChain = githubDataStoreState.queues.get(fileName) || Promise.resolve();
    const nextChain = prevChain
      .then(() => pushFileToGitHub(fileName))
      .catch(err => {
        githubDataStoreState.lastError = `${fileName}: ${err.message}`;
        console.error(`⚠️ GitHub data-store sync (${fileName}):`, err.message);
      });
    githubDataStoreState.queues.set(fileName, nextChain);
  }, delayMs);
  githubDataStoreState.timers.set(fileName, timer);
}

async function initGitHubDataStore() {
  if (!githubDataStoreState.enabled) {
    console.log('ℹ️ GitHub data-store desactivado (configura GITHUB_TOKEN para activarlo).');
    return;
  }
  try {
    await ensureGitHubDataBranch();
    for (const fileName of GITHUB_SYNC_FILES) {
      await pullFileFromGitHub(fileName);
    }
    const citiesRes = await githubApi(`/repos/${GITHUB_REPO}/contents/data/cities?ref=${encodeURIComponent(GITHUB_DATA_BRANCH)}`);
    if (citiesRes.ok && Array.isArray(citiesRes.json)) {
      for (const item of citiesRes.json) {
        if (item?.type === 'file' && item.name?.endsWith('.json')) {
          await pullFileFromGitHub(`cities/${item.name}`);
        }
      }
    }
    // Ejecutar migración automática de db.json si todavía contenía cityCache o appConfig
    loadAppConfig();
    loadDb();
    githubDataStoreState.initialized = true;
    githubDataStoreState.lastError = null;
    console.log(`☁️ GitHub data-store sincronizado (${GITHUB_REPO} @ ${GITHUB_DATA_BRANCH})`);
  } catch (err) {
    githubDataStoreState.lastError = err.message;
    console.error('⚠️ Error inicializando GitHub data-store:', err.message);
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  serverStats.totalRequests += 1;
  if (req.path.startsWith('/api/')) {
    serverStats.apiRequests += 1;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_DB = {
  appConfig: {
    projectName: 'go2enjoy.com',
    ownerEmail: '',
    googleClientId: DEFAULT_GOOGLE_CLIENT_ID,
    festivalUrls: [],
    activeCity: 'Zaragoza',
    cities: {
      Zaragoza: {
        name: 'Zaragoza',
        urls: [
          'https://vivezaragoza.es/'
        ]
      },
      Madrid: {
        name: 'Madrid',
        urls: [
          'https://www.esmadrid.com/agenda-madrid',
          'https://www.esmadrid.com/agenda-musica-madrid',
          'https://www.esmadrid.com/agenda-musicales',
          'https://madridenvivo.com/'
        ]
      },
      Barcelona: {
        name: 'Barcelona',
        urls: ['https://guia.barcelona.cat/es']
      }
    }
  },
  userProfile: {
    email: '',
    alias: '',
    avatar: '😎',
    avatarImage: '',
    hideAlias: false,
    hideEmail: false,
    politicalPhrase: '',
    politicalScale: null,
    religion: '',
    religionPractice: '',
    appearance: '',
    sexuality: '',
    seekingPerson: '',
    seekingRelation: '',
    photos: ['', '', ''],
    socialLinks: {
      instagram: '',
      tiktok: '',
      x: '',
      facebook: '',
      youtube: '',
      linkedin: '',
      web: ''
    },
    profileCalendar: [],
    selectedCity: 'Zaragoza',
    preferences: {
      A: {
        showTypes: ['Conciertos', 'Teatro', 'Cine', 'Exposiciones'],
        selectedVenues: []
      }
    }
  },
  concertVenues: [],
  concertFestivals: [],
  theaterVenues: [],
  exhibitionVenues: [],
  calendarEvents: [],
  cityCache: {},
  lastUpdateMeta: null
};

function loadDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.userProfile?.preferences?.A?.showTypes) {
      parsed.userProfile = DEFAULT_DB.userProfile;
    } else {
      parsed.userProfile.preferences = {
        A: {
          showTypes: parsed.userProfile.preferences.A.showTypes
            .map(t => (t === 'Concierto' ? 'Conciertos' : t))
            .filter(t => VALID_SHOW_TYPES.includes(t)),
          selectedVenues: Array.isArray(parsed.userProfile.preferences.A.selectedVenues)
            ? parsed.userProfile.preferences.A.selectedVenues
            : []
        }
      };
      if (parsed.userProfile.preferences.A.showTypes.length === 0) {
        parsed.userProfile.preferences.A.showTypes = [...VALID_SHOW_TYPES];
      }
    }
    let needsCompactSave = false;
    if (parsed.cityCache && typeof parsed.cityCache === 'object' && Object.keys(parsed.cityCache).length > 0) {
      for (const [cityKey, entry] of Object.entries(parsed.cityCache)) {
        if (entry && Array.isArray(entry.events)) {
          saveCityCacheEntry(cityKey, entry);
        }
      }
      parsed.cityCache = {};
      needsCompactSave = true;
    }
    if (Array.isArray(parsed.calendarEvents) && parsed.calendarEvents.length > 0) {
      parsed.calendarEvents = [];
      parsed.concertVenues = [];
      parsed.concertFestivals = [];
      parsed.theaterVenues = [];
      parsed.exhibitionVenues = [];
      parsed.concertStyles = [];
      needsCompactSave = true;
    }
    if (parsed.appConfig) {
      if (!fs.existsSync(CONFIG_PATH)) {
        saveAppConfig(parsed.appConfig);
      }
      delete parsed.appConfig;
      needsCompactSave = true;
    }
    if (needsCompactSave) {
      saveDb(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('Error loading DB, using default:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function saveDb(dbData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
  scheduleGitHubSync('db.json', 500);
}

function loadUserProfiles() {
  try {
    if (!fs.existsSync(USER_PROFILES_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(USER_PROFILES_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUserProfiles(profiles) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(USER_PROFILES_PATH, JSON.stringify(profiles, null, 2), 'utf8');
  scheduleGitHubSync('user_profiles.json', 300);
}

function normalizeAppConfig(raw) {
  const base = JSON.parse(JSON.stringify(DEFAULT_DB.appConfig));
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    googleClientId: raw.googleClientId || base.googleClientId,
    festivalUrls: Array.isArray(raw.festivalUrls) ? raw.festivalUrls : base.festivalUrls,
    activeCity: raw.activeCity || base.activeCity,
    cities: raw.cities && typeof raw.cities === 'object' ? raw.cities : base.cities
  };
}

function saveAppConfig(appConfig) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const normalized = normalizeAppConfig(appConfig);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf8');
  scheduleGitHubSync('config.json', 300);
  return normalized;
}

function loadAppConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return normalizeAppConfig(parsed);
    }
    // Migración automática desde db.json si config.json aún no existe
    if (fs.existsSync(DB_PATH)) {
      const dbParsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (dbParsed?.appConfig && typeof dbParsed.appConfig === 'object') {
        return saveAppConfig(dbParsed.appConfig);
      }
    }
  } catch (err) {
    console.error('Error loading config.json, using default:', err.message);
  }
  return normalizeAppConfig(null);
}

function getCitySlug(cityName) {
  const normalized = String(cityName || 'unknown')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'unknown';
}

function getCityCacheRelPath(cityName) {
  return `cities/${getCitySlug(cityName)}.json`;
}

function saveCityCacheEntry(cityName, entry) {
  if (!cityName || !entry) return;
  if (!fs.existsSync(CITIES_DIR)) {
    fs.mkdirSync(CITIES_DIR, { recursive: true });
  }
  const rel = getCityCacheRelPath(cityName);
  const payload = { city: cityName, ...entry };
  fs.writeFileSync(path.join(DATA_DIR, rel), JSON.stringify(payload, null, 2), 'utf8');
  scheduleGitHubSync(rel, 400);
}

function loadCityCacheEntry(cityName) {
  if (!cityName) return null;
  try {
    const full = path.join(DATA_DIR, getCityCacheRelPath(cityName));
    if (!fs.existsSync(full)) return null;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function loadAllCityCaches() {
  const out = {};
  try {
    if (!fs.existsSync(CITIES_DIR)) return out;
    for (const file of fs.readdirSync(CITIES_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(CITIES_DIR, file), 'utf8'));
        const cityKey = parsed?.city || parsed?.meta?.city || file.replace(/\.json$/i, '');
        if (cityKey) out[cityKey] = parsed;
      } catch {}
    }
  } catch {}
  return out;
}

// GET full state (without leaking any user's personal profile)
app.get('/api/state', (req, res) => {
  const db = loadDb();
  const appConfig = loadAppConfig();
  const cityCache = loadAllCityCaches();
  const activeCity = db.userProfile?.selectedCity || appConfig.activeCity || 'Zaragoza';
  const activeEntry = cityCache[activeCity] || loadCityCacheEntry(activeCity);

  res.json({
    ...db,
    appConfig,
    cityCache,
    calendarEvents: activeEntry?.events || db.calendarEvents || [],
    concertVenues: activeEntry?.concertVenues || db.concertVenues || [],
    concertFestivals: activeEntry?.concertFestivals || db.concertFestivals || [],
    theaterVenues: activeEntry?.theaterVenues || db.theaterVenues || [],
    exhibitionVenues: activeEntry?.exhibitionVenues || db.exhibitionVenues || [],
    concertStyles: activeEntry?.concertStyles || db.concertStyles || [],
    lastUpdateMeta: activeEntry?.meta || db.lastUpdateMeta || null,
    userProfile: {
      ...DEFAULT_DB.userProfile,
      selectedCity: activeCity,
      preferences: db.userProfile?.preferences || DEFAULT_DB.userProfile.preferences
    }
  });
});

// PUT Part 1: App Configuration (solo Admin)
app.put('/api/app-config', requireAdmin, (req, res) => {
  const appConfig = loadAppConfig();
  const { activeCity, cities } = req.body;
  if (activeCity) appConfig.activeCity = activeCity;
  if (cities && typeof cities === 'object') {
    appConfig.cities = cities;
  }
  const saved = saveAppConfig(appConfig);
  res.json({ ok: true, appConfig: saved });
});

// POST add or update a single city (solo Admin)
app.post('/api/app-config/city', requireAdmin, (req, res) => {
  const appConfig = loadAppConfig();
  const { name, urls } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la ciudad es obligatorio' });
  }
  const cleanName = name.trim();
  const cleanUrls = Array.isArray(urls)
    ? urls.map(u => u.trim()).filter(Boolean)
    : String(urls || '').split('\n').map(u => u.trim()).filter(Boolean);

  appConfig.cities[cleanName] = {
    name: cleanName,
    urls: cleanUrls
  };
  const saved = saveAppConfig(appConfig);
  res.json({ ok: true, city: saved.cities[cleanName], appConfig: saved });
});

// PUT General Festival URLs (solo Admin)
app.put('/api/app-config/festivals', requireAdmin, (req, res) => {
  const appConfig = loadAppConfig();
  const raw = req.body?.festivalUrls;
  const cleanUrls = Array.isArray(raw)
    ? raw.map(u => String(u || '').trim()).filter(Boolean)
    : String(raw || '').split('\n').map(u => u.trim()).filter(Boolean);
  appConfig.festivalUrls = cleanUrls;
  const saved = saveAppConfig(appConfig);
  res.json({ ok: true, festivalUrls: saved.festivalUrls, appConfig: saved });
});

// PUT Google Client ID for Google Drive OAuth (solo Admin)
app.put('/api/app-config/google-client-id', requireAdmin, (req, res) => {
  const appConfig = loadAppConfig();
  appConfig.googleClientId = String(req.body?.googleClientId || '').trim();
  const saved = saveAppConfig(appConfig);
  res.json({ ok: true, googleClientId: saved.googleClientId, appConfig: saved });
});

// POST Restore daily cache loaded from Google Drive (1 single file go2enjoy_cache.json)
app.post('/api/cache/restore', (req, res) => {
  const db = loadDb();
  const { city, entry } = req.body || {};
  if (!city || !entry || !Array.isArray(entry.events)) {
    return res.status(400).json({ ok: false, error: 'Datos de caché inválidos' });
  }
  saveCityCacheEntry(city, entry);
  db.lastUpdateMeta = entry.meta || null;
  saveDb(db);
  res.json({ ok: true });
});

function getMadridTodayYMD() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // "YYYY-MM-DD"
}

function filterNonPastProfileCalendar(list) {
  if (!Array.isArray(list)) return [];
  const todayYMD = getMadridTodayYMD();
  return list.filter(item => {
    if (!item) return false;
    const d = String(item.date || item.rangeEnd || '').trim();
    return Boolean(d) && d >= todayYMD;
  });
}

function sanitizeProfileCalendarResponse(profile) {
  if (!profile) return null;
  return {
    ...profile,
    profileCalendar: filterNonPastProfileCalendar(profile.profileCalendar)
  };
}

function getClientIp(req) {
  const fwd = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req?.socket?.remoteAddress || 'unknown';
}

function loadAccessLogs() {
  try {
    if (!fs.existsSync(ACCESS_LOGS_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(ACCESS_LOGS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordAccessLog({ type, email = '', city = '', detail = '', req = null }) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const logs = loadAccessLogs();
    const now = new Date();
    const madridTime = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(now);
    logs.unshift({
      timestamp: now.toISOString(),
      madridTime,
      type: String(type || 'activity'),
      email: String(email || '').trim().toLowerCase(),
      city: String(city || '').trim(),
      ip: req ? getClientIp(req) : '',
      userAgent: req ? String(req.headers['user-agent'] || '').slice(0, 120) : '',
      detail: String(detail || '').slice(0, 200)
    });
    fs.writeFileSync(ACCESS_LOGS_PATH, JSON.stringify(logs.slice(0, 300), null, 2), 'utf8');
    scheduleGitHubSync('access_logs.json', 15000);
  } catch {}
}

// POST Google User Login (returns isolated profile for that email if any)
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Introduce un correo de Google / Gmail válido' });
  }
  const profiles = loadUserProfiles();
  recordAccessLog({ type: 'login', email, city: profiles[email]?.selectedCity || '', detail: 'Inicio de sesión usuario', req });
  res.json({ ok: true, email, userProfile: sanitizeProfileCalendarResponse(profiles[email]) });
});

// GET isolated profile by email
app.get('/api/user-profile', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.json({ ok: true, userProfile: null });
  const profiles = loadUserProfiles();
  res.json({ ok: true, userProfile: sanitizeProfileCalendarResponse(profiles[email]) });
});

// PUT Part 2: User Preferences & Isolated Profile by email
app.put('/api/user-profile', (req, res) => {
  const db = loadDb();
  const {
    selectedCity,
    preferences,
    email,
    alias,
    avatar,
    avatarImage,
    politicalPhrase,
    politicalScale,
    religion,
    religionPractice,
    appearance,
    sexuality,
    seekingPerson,
    seekingRelation,
    photos,
    socialLinks,
    profileCalendar
  } = req.body;
  if (selectedCity) db.userProfile.selectedCity = selectedCity;
  if (preferences?.A) {
    db.userProfile.preferences = {
      A: {
        showTypes: (preferences.A.showTypes || VALID_SHOW_TYPES).filter(t => VALID_SHOW_TYPES.includes(t)),
        selectedVenues: Array.isArray(preferences.A.selectedVenues) ? preferences.A.selectedVenues : []
      }
    };
  }
  saveDb(db);

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  let savedProfile = null;
  if (normalizedEmail) {
    const profiles = loadUserProfiles();
    const target = profiles[normalizedEmail] || { ...DEFAULT_DB.userProfile, email: normalizedEmail };
    target.email = normalizedEmail;
    if (typeof alias === 'string') target.alias = alias.trim();
    if (typeof avatar === 'string' && avatar.trim()) target.avatar = avatar.trim();
    if (typeof avatarImage === 'string') target.avatarImage = avatarImage;
    if (typeof politicalPhrase === 'string') target.politicalPhrase = politicalPhrase.trim();
    if (politicalScale === null || (Number.isInteger(Number(politicalScale)) && Number(politicalScale) >= 1 && Number(politicalScale) <= 5)) {
      target.politicalScale = politicalScale === null ? null : Number(politicalScale);
    }
    if (typeof religion === 'string') target.religion = religion.trim();
    if (typeof religionPractice === 'string') target.religionPractice = religionPractice.trim();
    if (typeof appearance === 'string') target.appearance = appearance.trim();
    if (typeof sexuality === 'string') target.sexuality = sexuality.trim();
    else if (Array.isArray(sexuality)) target.sexuality = sexuality[0] ? String(sexuality[0]) : '';
    if (typeof seekingPerson === 'string') target.seekingPerson = seekingPerson.trim();
    else if (Array.isArray(seekingPerson)) target.seekingPerson = seekingPerson[0] ? String(seekingPerson[0]) : '';
    if (typeof seekingRelation === 'string') target.seekingRelation = seekingRelation.trim();
    else if (Array.isArray(seekingRelation)) target.seekingRelation = seekingRelation[0] ? String(seekingRelation[0]) : '';
    if (Array.isArray(photos)) {
      target.photos = [0, 1, 2].map(i => (typeof photos[i] === 'string' ? photos[i] : ''));
    }
    if (socialLinks && typeof socialLinks === 'object') {
      target.socialLinks = {
        instagram: String(socialLinks.instagram || '').trim(),
        tiktok: String(socialLinks.tiktok || '').trim(),
        x: String(socialLinks.x || '').trim(),
        facebook: String(socialLinks.facebook || '').trim(),
        youtube: String(socialLinks.youtube || '').trim(),
        linkedin: String(socialLinks.linkedin || '').trim(),
        web: String(socialLinks.web || '').trim()
      };
    }
    if (Array.isArray(profileCalendar)) {
      target.profileCalendar = filterNonPastProfileCalendar(profileCalendar);
    }
    profiles[normalizedEmail] = target;
    saveUserProfiles(profiles);
    savedProfile = target;
    recordAccessLog({
      type: 'profile_save',
      email: normalizedEmail,
      city: target.selectedCity || '',
      detail: `Perfil actualizado (${Array.isArray(target.profileCalendar) ? target.profileCalendar.length : 0} apuntes)`,
      req
    });
  }

  res.json({ ok: true, userProfile: savedProfile || db.userProfile });
});

function loadSharedAttendance() {
  try {
    if (!fs.existsSync(SHARED_ATTENDANCE_PATH)) {
      return { events: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(SHARED_ATTENDANCE_PATH, 'utf8'));
    if (!parsed || typeof parsed.events !== 'object') return { events: {} };
    return parsed;
  } catch {
    return { events: {} };
  }
}

function saveSharedAttendance(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SHARED_ATTENDANCE_PATH, JSON.stringify(data, null, 2), 'utf8');
  scheduleGitHubSync('shared_attendance.json', 300);
}

// GET public attendees for an event
app.get('/api/events/attendance', (req, res) => {
  const eventKey = String(req.query.key || '').trim();
  if (!eventKey) {
    return res.json({ ok: true, attendees: [] });
  }
  const store = loadSharedAttendance();
  const attendees = Array.isArray(store.events[eventKey]) ? store.events[eventKey] : [];
  res.json({ ok: true, attendees });
});

// PUT publish/update public attendance for an event
app.put('/api/events/attendance', (req, res) => {
  const eventKey = String(req.body?.eventKey || '').trim();
  const userId = String(req.body?.userId || '').trim();
  const chosenDate = String(req.body?.chosenDate || '').trim();
  const profile = req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : null;

  if (!eventKey || !userId || !profile) {
    return res.status(400).json({ ok: false, error: 'eventKey, userId y profile son obligatorios' });
  }

  const store = loadSharedAttendance();
  if (!Array.isArray(store.events[eventKey])) {
    store.events[eventKey] = [];
  }
  const list = store.events[eventKey];
  const entry = {
    userId,
    chosenDate,
    updatedAt: new Date().toISOString(),
    profile
  };
  const existingIdx = list.findIndex(item => item.userId === userId);
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.push(entry);
  }
  saveSharedAttendance(store);
  res.json({ ok: true, attendees: list });
});

// DELETE remove public attendance for an event
app.delete('/api/events/attendance', (req, res) => {
  const eventKey = String(req.body?.eventKey || '').trim();
  const userId = String(req.body?.userId || '').trim();
  if (!eventKey || !userId) {
    return res.status(400).json({ ok: false, error: 'eventKey y userId son obligatorios' });
  }
  const store = loadSharedAttendance();
  const list = Array.isArray(store.events[eventKey]) ? store.events[eventKey] : [];
  store.events[eventKey] = list.filter(item => item.userId !== userId);
  if (store.events[eventKey].length === 0) {
    delete store.events[eventKey];
  }
  saveSharedAttendance(store);
  res.json({ ok: true, attendees: store.events[eventKey] || [] });
});

function getMadridCutoffYMD(daysAgo = 30) {
  const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(cutoffDate); // "YYYY-MM-DD"
}

function pruneExpiredCommunityEvents(store, retentionDays = 30) {
  if (!store || typeof store.cities !== 'object') return false;
  const cutoffYMD = getMadridCutoffYMD(retentionDays);
  let changed = false;
  for (const [cityName, list] of Object.entries(store.cities)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter(ev => !ev?.date || ev.date >= cutoffYMD);
    if (kept.length !== list.length) {
      store.cities[cityName] = kept;
      changed = true;
    }
  }
  return changed;
}

function loadCommunityEvents() {
  try {
    if (!fs.existsSync(COMMUNITY_EVENTS_PATH)) {
      return { cities: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(COMMUNITY_EVENTS_PATH, 'utf8'));
    if (!parsed || typeof parsed.cities !== 'object') return { cities: {} };
    if (pruneExpiredCommunityEvents(parsed, 30)) {
      saveCommunityEvents(parsed);
    }
    return parsed;
  } catch {
    return { cities: {} };
  }
}

function saveCommunityEvents(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(COMMUNITY_EVENTS_PATH, JSON.stringify(data, null, 2), 'utf8');
  scheduleGitHubSync('community_events.json', 300);
}

// GET paid community events by city
app.get('/api/community-events', (req, res) => {
  const startMs = Date.now();
  const city = String(req.query.city || '').trim();
  if (!city) {
    return res.json({
      ok: true,
      city: '',
      events: [],
      meta: {
        fileName: path.basename(COMMUNITY_EVENTS_PATH),
        filePath: COMMUNITY_EVENTS_PATH,
        fileExists: fs.existsSync(COMMUNITY_EVENTS_PATH),
        city: '',
        totalInCity: 0,
        activeCount: 0,
        loadTimeMs: Date.now() - startMs,
        loadedAt: new Date().toISOString(),
        allCityRecords: []
      }
    });
  }
  const store = loadCommunityEvents();
  const list = Array.isArray(store.cities[city]) ? store.cities[city] : [];
  const nowParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date()); // "YYYY-MM-DD HH:MM"
  const sorted = [...list]
    .filter(ev => Boolean(ev?.date))
    .map(ev => {
      const evKey = `${ev.date} ${(ev.time || '23:59').padStart(5, '0')}`;
      return { ...ev, isPast: evKey < nowParts };
    })
    .sort((a, b) => {
      const ka = `${a.date || '9999-99-99'} ${(a.time || '23:59').padStart(5, '0')}`;
      const kb = `${b.date || '9999-99-99'} ${(b.time || '23:59').padStart(5, '0')}`;
      if (ka !== kb) return ka.localeCompare(kb);
      return (a.title || '').localeCompare(b.title || '', 'es');
    });
  const activeCount = sorted.filter(ev => !ev.isPast).length;
  res.json({
    ok: true,
    city,
    events: sorted,
    meta: {
      fileName: path.basename(COMMUNITY_EVENTS_PATH),
      filePath: COMMUNITY_EVENTS_PATH,
      fileExists: fs.existsSync(COMMUNITY_EVENTS_PATH),
      city,
      totalInCity: list.length,
      activeCount,
      loadTimeMs: Date.now() - startMs,
      loadedAt: new Date().toISOString(),
      allCityRecords: list
    }
  });
});

// POST create a paid community event in a city
app.post('/api/community-events', (req, res) => {
  const { city, title, date, time, venue, price, category, description, url, creatorEmail, creatorAlias, creatorAvatar, paid } = req.body || {};
  const cityName = String(city || '').trim();
  const eventCategory = String(category || 'Eventos').trim();
  const eventTitle = String(title || '').trim();
  const eventDate = String(date || '').trim();
  if (!paid) {
    return res.status(402).json({ ok: false, error: 'El evento debe estar pagado para publicarse.' });
  }
  if (!cityName || !eventTitle || !eventDate) {
    return res.status(400).json({ ok: false, error: 'Ciudad, evento y fecha son obligatorios.' });
  }
  if (eventDate < getMadridTodayYMD()) {
    return res.status(400).json({ ok: false, error: 'No se pueden guardar eventos con fecha pasada.' });
  }

  const store = loadCommunityEvents();
  if (!Array.isArray(store.cities[cityName])) {
    store.cities[cityName] = [];
  }
  const newEv = {
    id: 'ce_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    city: cityName,
    title: eventTitle,
    date: eventDate,
    time: String(time || '20:00').trim(),
    venue: String(venue || cityName).trim(),
    venueTag: eventCategory.toUpperCase().slice(0, 18),
    venueColor: '#ec4899',
    price: String(price || 'Consultar').trim(),
    subType: 'EVENTO',
    description: String(description || '').trim(),
    url: String(url || '').trim(),
    actionLabel: 'Ir a Más info',
    creatorEmail: String(creatorEmail || '').trim().toLowerCase(),
    creatorAlias: String(creatorAlias || '').trim(),
    creatorAvatar: String(creatorAvatar || '🍸').trim(),
    paid: true,
    createdAt: new Date().toISOString()
  };
  store.cities[cityName].push(newEv);
  saveCommunityEvents(store);
  recordAccessLog({
    type: 'community_event',
    email: newEv.creatorEmail,
    city: cityName,
    detail: `Evento creado: ${newEv.title} (${newEv.venueTag})`,
    req
  });
  res.json({ ok: true, event: newEv });
});

// GET read-only cached events for a city (usuarios normales, sin scraping)
app.get('/api/city-events', (req, res) => {
  const appConfig = loadAppConfig();
  const cityName = String(req.query.city || appConfig.activeCity || 'Zaragoza').trim();
  const entry = loadCityCacheEntry(cityName);
  res.json({
    ok: true,
    city: cityName,
    cached: Boolean(entry),
    events: entry?.events || [],
    concertVenues: entry?.concertVenues || [],
    concertFestivals: entry?.concertFestivals || [],
    theaterVenues: entry?.theaterVenues || [],
    exhibitionVenues: entry?.exhibitionVenues || [],
    concertStyles: entry?.concertStyles || [],
    meta: entry?.meta || {
      city: cityName,
      logs: [`ℹ️ ${cityName} aún no tiene eventos generados por el administrador.`]
    }
  });
});

// POST Trigger AI Web & URL Update (solo Admin)
app.post('/api/calendar/update', requireAdmin, async (req, res) => {
  try {
    const db = loadDb();
    if (req.body.preferences?.A) {
      db.userProfile.preferences = {
        A: {
          showTypes: (req.body.preferences.A.showTypes || VALID_SHOW_TYPES).filter(t => VALID_SHOW_TYPES.includes(t)),
          selectedVenues: Array.isArray(req.body.preferences.A.selectedVenues) ? req.body.preferences.A.selectedVenues : []
        }
      };
    }
    if (req.body.selectedCity) {
      db.userProfile.selectedCity = req.body.selectedCity;
    }
    if (req.body.userEmail) {
      db.userProfile.email = String(req.body.userEmail).trim().toLowerCase();
    }

    const appConfig = loadAppConfig();
    const cityName = db.userProfile.selectedCity || appConfig.activeCity || 'Zaragoza';
    const cityConfig = appConfig.cities[cityName] || {
      name: cityName,
      urls: []
    };

    const todayYMD = formatDateYMD(new Date());
    const festivalUrls = appConfig.festivalUrls || [];
    const urlsKey = JSON.stringify({ city: cityConfig.urls || [], festivals: festivalUrls });
    const forceRefresh = req.body.forceRefresh === true;

    const cachedEntry = loadCityCacheEntry(cityName);
    if (!forceRefresh && cachedEntry && cachedEntry.date === todayYMD && cachedEntry.urlsKey === urlsKey) {
      const cachedLogs = [
        `⚡ Caché diaria (${todayYMD}) para ${cityName}: datos recuperados sin volver a acceder a internet.`,
        ...(cachedEntry.meta?.logs || [])
      ];
      db.lastUpdateMeta = { ...(cachedEntry.meta || {}), logs: cachedLogs };
      saveDb(db);
      return res.json({
        ok: true,
        cached: true,
        events: cachedEntry.events || [],
        concertVenues: cachedEntry.concertVenues || [],
        concertFestivals: cachedEntry.concertFestivals || [],
        theaterVenues: cachedEntry.theaterVenues || [],
        exhibitionVenues: cachedEntry.exhibitionVenues || [],
        concertStyles: cachedEntry.concertStyles || [],
        cityCache: loadAllCityCaches(),
        meta: db.lastUpdateMeta
      });
    }

    const updateResult = await runCalendarUpdate({
      cityConfig,
      festivalUrls,
      preferences: db.userProfile.preferences,
      userEmail: db.userProfile.email,
      referenceDate: new Date()
    });

    const meta = {
      updatedAt: updateResult.updatedAt,
      city: updateResult.city,
      referenceDate: updateResult.referenceDate,
      oneYearHorizon: updateResult.oneYearHorizon,
      totalScanned: updateResult.totalScanned,
      totalMatched: updateResult.totalMatched,
      logs: updateResult.logs
    };

    // Guardar la caché de esta ciudad en su propio fichero data/cities/<ciudad>.json
    const newCityEntry = {
      date: todayYMD,
      urlsKey,
      events: updateResult.events,
      concertVenues: updateResult.concertVenues || [],
      concertFestivals: updateResult.concertFestivals || [],
      theaterVenues: updateResult.theaterVenues || [],
      exhibitionVenues: updateResult.exhibitionVenues || [],
      concertStyles: updateResult.concertStyles || [],
      meta
    };
    saveCityCacheEntry(cityName, newCityEntry);

    db.lastUpdateMeta = meta;
    saveDb(db);
    res.json({
      ok: true,
      cached: false,
      events: newCityEntry.events,
      concertVenues: newCityEntry.concertVenues,
      concertFestivals: newCityEntry.concertFestivals,
      theaterVenues: newCityEntry.theaterVenues,
      exhibitionVenues: newCityEntry.exhibitionVenues,
      concertStyles: newCityEntry.concertStyles,
      cityCache: loadAllCityCaches(),
      meta: db.lastUpdateMeta
    });
  } catch (err) {
    console.error('Error in /api/calendar/update:', err);
    serverStats.recentErrors.unshift({ timestamp: new Date().toISOString(), route: '/api/calendar/update', message: err.message });
    serverStats.recentErrors = serverStats.recentErrors.slice(0, 50);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =========================================================================
// PANEL DE ADMINISTRACIÓN (DOBLE CAPA: GOOGLE OAUTH VERIFICADO + CLAVE)
// =========================================================================
function getAdminAllowedEmails() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || '');
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  const out = {};
  header.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}

function signAdminSession(email) {
  const payload = Buffer.from(JSON.stringify({
    email,
    exp: Date.now() + ADMIN_SESSION_TTL_MS
  })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAdminSession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || !parsed.email || !parsed.exp || Date.now() > parsed.exp) return null;
    const allowed = getAdminAllowedEmails();
    if (allowed.length > 0 && !allowed.includes(String(parsed.email).toLowerCase())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getAdminSessionFromReq(req) {
  const cookies = parseCookies(req);
  return verifyAdminSession(cookies[ADMIN_COOKIE_NAME]);
}

function requireAdmin(req, res, next) {
  const session = getAdminSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Acceso no autorizado. Inicia sesión de administrador.' });
  }
  req.adminSession = session;
  next();
}

function setAdminSessionCookie(req, res, token) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(req, res) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ];
  if (isHttps) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function timingSafePasswordMatch(input, expected) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/session', (req, res) => {
  const session = getAdminSessionFromReq(req);
  const allowedEmails = getAdminAllowedEmails();
  const hasPassword = Boolean(getAdminPassword());
  res.json({
    ok: true,
    authenticated: Boolean(session),
    email: session ? session.email : null,
    configReady: {
      hasEmails: allowedEmails.length > 0,
      hasPassword
    },
    googleClientId: DEFAULT_GOOGLE_CLIENT_ID
  });
});

app.post('/api/admin/login', async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const attempt = adminLoginAttempts.get(ip);
  if (attempt && attempt.lockUntil && now < attempt.lockUntil) {
    const mins = Math.ceil((attempt.lockUntil - now) / 60000);
    return res.status(429).json({ ok: false, error: `Demasiados intentos fallidos. Espera ${mins} min.` });
  }

  const allowedEmails = getAdminAllowedEmails();
  const adminPassword = getAdminPassword();
  if (allowedEmails.length === 0 || !adminPassword) {
    return res.status(503).json({
      ok: false,
      error: 'Configura ADMIN_EMAILS y ADMIN_PASSWORD en las variables de entorno del servidor (Faable).'
    });
  }

  const idToken = String(req.body?.idToken || '').trim();
  const password = String(req.body?.password || '');

  const registerFailure = (reason) => {
    const prev = adminLoginAttempts.get(ip) || { count: 0, lockUntil: 0 };
    const nextCount = prev.count + 1;
    const lockUntil = nextCount >= 5 ? now + 15 * 60 * 1000 : 0;
    adminLoginAttempts.set(ip, { count: nextCount, lockUntil });
    recordAccessLog({ type: 'admin_login_failed', detail: reason, req });
  };

  if (!idToken || !password) {
    registerFailure('Falta token de Google o contraseña');
    return res.status(400).json({ ok: false, error: 'Se requiere verificación con Google y contraseña de administrador.' });
  }

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!verifyRes.ok) {
      registerFailure('Token de Google inválido o caducado');
      return res.status(401).json({ ok: false, error: 'Token de Google inválido o caducado. Vuelve a iniciar sesión con Google.' });
    }
    const tokenInfo = await verifyRes.json();
    const verifiedEmail = String(tokenInfo.email || '').trim().toLowerCase();
    const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
    const audOk = tokenInfo.aud === DEFAULT_GOOGLE_CLIENT_ID;

    if (!emailVerified || !audOk || !allowedEmails.includes(verifiedEmail)) {
      registerFailure(`Email Google no autorizado: ${verifiedEmail || 'desconocido'}`);
      return res.status(403).json({ ok: false, error: 'Esta cuenta de Google no tiene permisos de administrador.' });
    }

    if (!timingSafePasswordMatch(password, adminPassword)) {
      registerFailure(`Contraseña incorrecta para ${verifiedEmail}`);
      return res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta.' });
    }

    adminLoginAttempts.delete(ip);
    const token = signAdminSession(verifiedEmail);
    setAdminSessionCookie(req, res, token);
    recordAccessLog({ type: 'admin_login', email: verifiedEmail, detail: 'Acceso al panel de administración', req });
    res.json({ ok: true, email: verifiedEmail });
  } catch (err) {
    registerFailure(`Error verificando Google: ${err.message}`);
    res.status(500).json({ ok: false, error: 'Error verificando credenciales: ' + err.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  clearAdminSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const mem = process.memoryUsage();
  const db = loadDb();
  const profiles = loadUserProfiles();
  const ceStartMs = Date.now();
  const community = loadCommunityEvents();
  const ceLoadTimeMs = Date.now() - ceStartMs;
  const attendance = loadSharedAttendance();
  const accessLogs = loadAccessLogs();

  const walkDataDir = (dir, prefix = '') => {
    if (!fs.existsSync(dir)) return [];
    let out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out = out.concat(walkDataDir(full, rel));
      } else if (entry.isFile()) {
        const st = fs.statSync(full);
        out.push({
          name: rel,
          isFile: true,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString()
        });
      }
    }
    return out;
  };

  const files = walkDataDir(DATA_DIR).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  const users = Object.entries(profiles).map(([email, p]) => ({
    email,
    alias: p?.alias || '',
    selectedCity: p?.selectedCity || '',
    savedEventsCount: Array.isArray(p?.profileCalendar) ? p.profileCalendar.length : 0
  }));

  const communityCities = {};
  let totalCommunityEvents = 0;
  Object.entries(community.cities || {}).forEach(([city, list]) => {
    const count = Array.isArray(list) ? list.length : 0;
    communityCities[city] = count;
    totalCommunityEvents += count;
  });

  const attendanceKeys = Object.keys(attendance.events || {});
  const totalAttendanceEntries = attendanceKeys.reduce((acc, k) => acc + (attendance.events[k]?.length || 0), 0);

  res.json({
    ok: true,
    adminEmail: req.adminSession.email,
    server: {
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: serverStats.startedAt,
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024)
      },
      totalRequests: serverStats.totalRequests,
      apiRequests: serverStats.apiRequests,
      githubSync: {
        enabled: githubDataStoreState.enabled,
        repo: githubDataStoreState.repo,
        branch: githubDataStoreState.branch,
        initialized: githubDataStoreState.initialized,
        lastSyncAt: githubDataStoreState.lastSyncAt,
        lastError: githubDataStoreState.lastError,
        syncedFiles: Array.from(githubDataStoreState.fileShas.keys())
      }
    },
    stats: {
      totalUsers: users.length,
      totalProfileEvents: users.reduce((acc, u) => acc + u.savedEventsCount, 0),
      totalCommunityEvents,
      communityCities,
      totalAttendanceKeys: attendanceKeys.length,
      totalAttendanceEntries,
      cachedCities: Object.keys(loadAllCityCaches())
    },
    files,
    users,
    appConfig: loadAppConfig(),
    communityEventsLog: {
      fileName: path.basename(COMMUNITY_EVENTS_PATH),
      fileExists: fs.existsSync(COMMUNITY_EVENTS_PATH),
      loadTimeMs: ceLoadTimeMs,
      cities: community.cities || {}
    },
    accessLogs: accessLogs.slice(0, 100),
    recentErrors: serverStats.recentErrors
  });
});

app.get('/api/admin/file', requireAdmin, (req, res) => {
  const rawName = String(req.query.name || '').trim();
  if (!rawName || rawName.includes('..')) {
    return res.status(400).json({ ok: false, error: 'Nombre de fichero inválido.' });
  }
  const baseDir = path.resolve(DATA_DIR);
  const fullPath = path.resolve(baseDir, rawName);
  if (!fullPath.startsWith(baseDir + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return res.status(404).json({ ok: false, error: 'Fichero no encontrado.' });
  }
  try {
    if (req.query.download === '1') {
      return res.download(fullPath, path.basename(fullPath));
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ ok: true, name: rawName, sizeBytes: Buffer.byteLength(content, 'utf8'), content });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/export-month', requireAdmin, (req, res) => {
  const defaultMonth = getMadridTodayYMD().slice(0, 7); // "YYYY-MM"
  const rawMonth = String(req.query.month || defaultMonth).trim();
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : defaultMonth;

  const community = loadCommunityEvents();
  const profiles = loadUserProfiles();
  const attendance = loadSharedAttendance();
  const accessLogs = loadAccessLogs();

  const communityEventsByCity = {};
  let totalCommunityEvents = 0;
  for (const [cityName, list] of Object.entries(community.cities || {})) {
    if (!Array.isArray(list)) continue;
    const matched = list.filter(ev => String(ev?.date || '').startsWith(month));
    if (matched.length > 0) {
      communityEventsByCity[cityName] = matched;
      totalCommunityEvents += matched.length;
    }
  }

  const usersMonth = Object.entries(profiles).map(([email, p]) => {
    const monthEvents = Array.isArray(p?.profileCalendar)
      ? p.profileCalendar.filter(ev => String(ev?.date || '').startsWith(month))
      : [];
    return {
      email,
      alias: p?.alias || '',
      selectedCity: p?.selectedCity || '',
      monthEventsCount: monthEvents.length,
      monthEvents
    };
  });

  const attendanceMonth = {};
  for (const [eventKey, entries] of Object.entries(attendance.events || {})) {
    if (!Array.isArray(entries)) continue;
    const matched = entries.filter(e =>
      String(e?.chosenDate || '').startsWith(month) ||
      String(e?.updatedAt || '').startsWith(month) ||
      eventKey.startsWith(month)
    );
    if (matched.length > 0) {
      attendanceMonth[eventKey] = matched;
    }
  }

  const logsMonth = accessLogs.filter(l =>
    String(l?.madridTime || l?.timestamp || '').startsWith(month)
  );

  const exportPayload = {
    app: 'go2enjoy.com',
    month,
    exportedAt: new Date().toISOString(),
    exportedBy: req.adminSession.email,
    summary: {
      totalCommunityEvents,
      totalUsers: usersMonth.length,
      totalAttendanceEvents: Object.keys(attendanceMonth).length,
      totalAccessLogs: logsMonth.length
    },
    communityEvents: communityEventsByCity,
    sharedAttendance: attendanceMonth,
    users: usersMonth,
    accessLogs: logsMonth
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="go2enjoy-export-${month}.json"`);
  res.send(JSON.stringify(exportPayload, null, 2));
});

if (require.main === module) {
  (async () => {
    await initGitHubDataStore();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 go2enjoy.com server running on http://0.0.0.0:${PORT}`);
    });
  })();
}

module.exports = app;
