const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { runCalendarUpdate, formatDateYMD, VALID_SHOW_TYPES } = require('./scraperEngine');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_DB = {
  appConfig: {
    projectName: 'go2enjoy.com',
    ownerEmail: '',
    googleClientId: '',
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
    if (!Array.isArray(parsed.concertVenues)) {
      parsed.concertVenues = [];
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
}

// GET full state
app.get('/api/state', (req, res) => {
  const db = loadDb();
  res.json(db);
});

// PUT Part 1: App Configuration
app.put('/api/app-config', (req, res) => {
  const db = loadDb();
  const { activeCity, cities } = req.body;
  if (activeCity) db.appConfig.activeCity = activeCity;
  if (cities && typeof cities === 'object') {
    db.appConfig.cities = cities;
  }
  saveDb(db);
  res.json({ ok: true, appConfig: db.appConfig });
});

// POST add or update a single city
app.post('/api/app-config/city', (req, res) => {
  const db = loadDb();
  const { name, urls } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'El nombre de la ciudad es obligatorio' });
  }
  const cleanName = name.trim();
  const cleanUrls = Array.isArray(urls)
    ? urls.map(u => u.trim()).filter(Boolean)
    : String(urls || '').split('\n').map(u => u.trim()).filter(Boolean);

  db.appConfig.cities[cleanName] = {
    name: cleanName,
    urls: cleanUrls
  };
  saveDb(db);
  res.json({ ok: true, city: db.appConfig.cities[cleanName], appConfig: db.appConfig });
});

// PUT General Festival URLs (scanned for all cities, filtered per selected city)
app.put('/api/app-config/festivals', (req, res) => {
  const db = loadDb();
  const raw = req.body?.festivalUrls;
  const cleanUrls = Array.isArray(raw)
    ? raw.map(u => String(u || '').trim()).filter(Boolean)
    : String(raw || '').split('\n').map(u => u.trim()).filter(Boolean);
  db.appConfig.festivalUrls = cleanUrls;
  saveDb(db);
  res.json({ ok: true, festivalUrls: db.appConfig.festivalUrls, appConfig: db.appConfig });
});

// PUT Google Client ID for Google Drive OAuth
app.put('/api/app-config/google-client-id', (req, res) => {
  const db = loadDb();
  db.appConfig.googleClientId = String(req.body?.googleClientId || '').trim();
  saveDb(db);
  res.json({ ok: true, googleClientId: db.appConfig.googleClientId, appConfig: db.appConfig });
});

// POST Restore daily cache loaded from Google Drive (1 single file go2enjoy_cache.json)
app.post('/api/cache/restore', (req, res) => {
  const db = loadDb();
  const { city, entry } = req.body || {};
  if (!city || !entry || !Array.isArray(entry.events)) {
    return res.status(400).json({ ok: false, error: 'Datos de caché inválidos' });
  }
  if (!db.cityCache) db.cityCache = {};
  db.cityCache[city] = entry;
  db.calendarEvents = entry.events;
  db.concertVenues = entry.concertVenues || [];
  db.concertFestivals = entry.concertFestivals || [];
  db.theaterVenues = entry.theaterVenues || [];
  db.exhibitionVenues = entry.exhibitionVenues || [];
  db.concertStyles = entry.concertStyles || [];
  db.lastUpdateMeta = entry.meta || null;
  saveDb(db);
  res.json({ ok: true });
});

// POST Google User Login (stores active Google/Gmail account for Calendar & AI)
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Introduce un correo de Google / Gmail válido' });
  }
  const db = loadDb();
  db.userProfile.email = email;
  saveDb(db);
  res.json({ ok: true, email });
});

// PUT Part 2: User Preferences Profile
app.put('/api/user-profile', (req, res) => {
  const db = loadDb();
  const { selectedCity, preferences, email } = req.body;
  if (selectedCity) db.userProfile.selectedCity = selectedCity;
  if (email) db.userProfile.email = email;
  if (preferences?.A) {
    db.userProfile.preferences = {
      A: {
        showTypes: (preferences.A.showTypes || VALID_SHOW_TYPES).filter(t => VALID_SHOW_TYPES.includes(t)),
        selectedVenues: Array.isArray(preferences.A.selectedVenues) ? preferences.A.selectedVenues : []
      }
    };
  }
  saveDb(db);
  res.json({ ok: true, userProfile: db.userProfile });
});

// POST Trigger AI Web & URL Update ("Botón Actualizar")
app.post('/api/calendar/update', async (req, res) => {
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

    const cityName = db.userProfile.selectedCity || db.appConfig.activeCity || 'Zaragoza';
    const cityConfig = db.appConfig.cities[cityName] || {
      name: cityName,
      urls: []
    };

    const todayYMD = formatDateYMD(new Date());
    const festivalUrls = db.appConfig.festivalUrls || [];
    const urlsKey = JSON.stringify({ city: cityConfig.urls || [], festivals: festivalUrls });
    const forceRefresh = req.body.forceRefresh === true;
    if (!db.cityCache) db.cityCache = {};

    const cachedEntry = db.cityCache[cityName];
    if (!forceRefresh && cachedEntry && cachedEntry.date === todayYMD && cachedEntry.urlsKey === urlsKey) {
      db.calendarEvents = cachedEntry.events || [];
      db.concertVenues = cachedEntry.concertVenues || [];
      db.concertFestivals = cachedEntry.concertFestivals || [];
      db.theaterVenues = cachedEntry.theaterVenues || [];
      db.exhibitionVenues = cachedEntry.exhibitionVenues || [];
      db.concertStyles = cachedEntry.concertStyles || [];
      const cachedLogs = [
        `⚡ Caché diaria (${todayYMD}) para ${cityName}: datos recuperados sin volver a acceder a internet.`,
        ...(cachedEntry.meta?.logs || [])
      ];
      db.lastUpdateMeta = { ...(cachedEntry.meta || {}), logs: cachedLogs };
      saveDb(db);
      return res.json({
        ok: true,
        cached: true,
        events: db.calendarEvents,
        concertVenues: db.concertVenues,
        concertFestivals: db.concertFestivals,
        theaterVenues: db.theaterVenues,
        exhibitionVenues: db.exhibitionVenues,
        concertStyles: db.concertStyles,
        cityCache: db.cityCache,
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

    // Sobrescribir la entrada de la ciudad con los datos de hoy (descartando fechas antiguas)
    db.cityCache[cityName] = {
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

    db.calendarEvents = updateResult.events;
    db.concertVenues = updateResult.concertVenues || [];
    db.concertFestivals = updateResult.concertFestivals || [];
    db.theaterVenues = updateResult.theaterVenues || [];
    db.exhibitionVenues = updateResult.exhibitionVenues || [];
    db.concertStyles = updateResult.concertStyles || [];
    db.lastUpdateMeta = meta;

    saveDb(db);
    res.json({
      ok: true,
      cached: false,
      events: db.calendarEvents,
      concertVenues: db.concertVenues,
      concertFestivals: db.concertFestivals,
      theaterVenues: db.theaterVenues,
      exhibitionVenues: db.exhibitionVenues,
      concertStyles: db.concertStyles,
      cityCache: db.cityCache,
      meta: db.lastUpdateMeta
    });
  } catch (err) {
    console.error('Error in /api/calendar/update:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 go2enjoy.com server running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
