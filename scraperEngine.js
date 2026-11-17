const cheerio = require('cheerio');

const SPANISH_MONTHS = {
  enero: 0, ene: 0,
  febrero: 1, feb: 1,
  marzo: 2, mar: 2,
  abril: 3, abr: 3,
  mayo: 4, may: 4,
  junio: 5, jun: 5,
  julio: 6, jul: 6,
  agosto: 7, ago: 7,
  septiembre: 8, sep: 8, set: 8,
  octubre: 9, oct: 9,
  noviembre: 10, nov: 10,
  diciembre: 11, dic: 11
};

const DAY_NAMES_TO_INDEX = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, miércoles: 3, mie: 3, mié: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sábado: 6, sab: 6, sáb: 6
};

const VALID_SHOW_TYPES = ['Conciertos', 'Teatro', 'Cine', 'Exposiciones'];

const VENUE_COLOR_PALETTE = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#3b82f6', // Blue
  '#84cc16', // Lime
  '#d946ef', // Fuchsia
  '#e11d48', // Rose
  '#0ea5e9'  // Sky
];

// Catálogo de Salas de Concierto y Espacios Escénicos reales
const KNOWN_VENUE_META = [
  { match: ['auditorio', 'princesa leonor', 'mozart', 'galve'], tag: 'AUDITORIO ZGZ', name: 'Auditorio de Zaragoza', color: '#6366f1' },
  { match: ['rock & blues', 'rock and blues', 'rock&blues', 'rock-blues'], tag: 'ROCK & BLUES', name: 'Rock & Blues Café', color: '#f59e0b' },
  { match: ['sala lopez', 'sala lópez', 'salalopez', 'lopez', 'lópez'], tag: 'SALA LÓPEZ', name: 'Sala López', color: '#10b981' },
  { match: ['oasis', 'salaoasis'], tag: 'SALA OASIS', name: 'Sala Oasis', color: '#ec4899' },
  { match: ['creedence'], tag: 'SALA CREEDENCE', name: 'Sala Creedence', color: '#ef4444' },
  { match: ['la ley seca', 'ley seca'], tag: 'LA LEY SECA', name: 'La Ley Seca', color: '#8b5cf6' },
  { match: ['principe felipe', 'príncipe felipe'], tag: 'PRÍNCIPE FELIPE', name: 'Pabellón Príncipe Felipe', color: '#06b6d4' },
  { match: ['lata de bombillas', 'lata bombillas', 'lata gourmet'], tag: 'LATA BOMBILLAS', name: 'La Lata de Bombillas', color: '#84cc16' },
  // Unificamos "La Casa del Loco" y "Loco Zaragoza" bajo el TAG solicitado [LOCO ZARAGOZA] para evitar duplicados
  { match: ['casa del loco', 'loco zaragoza', 'locozaragoza'], tag: 'LOCO ZARAGOZA', name: 'La Casa del Loco (Loco Zaragoza)', color: '#f97316' },
  { match: ['teatro de las esquinas', 'esquinas'], tag: 'TEATRO ESQUINAS', name: 'Teatro de las Esquinas', color: '#d946ef' },
  { match: ['campana de los perdidos', 'campana perdidos', 'campana underground'], tag: 'LA CAMPANA', name: 'La Campana Underground', color: '#14b8a6' },
  { match: ['boveda', 'bóveda'], tag: 'LA BÓVEDA', name: 'La Bóveda del Albergue', color: '#0ea5e9' },
  { match: ['refugio del crapula', 'refugio del crápula'], tag: 'REFUGIO CRÁPULA', name: 'El Refugio del Crápula', color: '#a855f7' },
  { match: ['sala z', 'salaz'], tag: 'SALA Z', name: 'Sala Z', color: '#22c55e' },
  { match: ['sala utopia', 'utopia'], tag: 'SALA UTOPÍA', name: 'Sala Utopía', color: '#eab308' },
  { match: ['moliner 7'], tag: 'MOLINER 7', name: 'Moliner 7', color: '#06b6d4' },
  { match: ['belushi'], tag: 'BELUSHI', name: 'Belushi', color: '#f43f5e' },
  { match: ['sala genius', 'genius'], tag: 'SALA GENIUS', name: 'Sala Genius', color: '#3b82f6' },
  { match: ['sala corleone', 'corleone'], tag: 'SALA CORLEONE', name: 'Sala Corleone', color: '#ef4444' },
  { match: ['espacio joven ibercaja', 'fundacion ibercaja', 'fundación ibercaja', 'patio de la infanta', 'ibercaja'], tag: 'IBERCAJA', name: 'Fundación / Espacio Ibercaja', color: '#3b82f6' },
  { match: ['caixaforum'], tag: 'CAIXAFORUM', name: 'CaixaForum Zaragoza', color: '#0284c7' },
  { match: ['el tunel', 'el túnel'], tag: 'EL TÚNEL', name: 'El Túnel (Centro de Artes)', color: '#7c3aed' },
  { match: ['centro civico', 'centro cívico', 'centros civicos', 'centros cívicos'], tag: 'CENTRO CÍVICO', name: 'Centros Cívicos Zaragoza', color: '#e11d48' },
  { match: ['teatro principal'], tag: 'TEATRO PRINCIPAL', name: 'Teatro Principal', color: '#f43f5e' },
  { match: ['teatro de la estacion', 'teatro de la estación'], tag: 'T. LA ESTACIÓN', name: 'Teatro de la Estación', color: '#fb7185' },
  { match: ['teatro del mercado'], tag: 'T. DEL MERCADO', name: 'Teatro del Mercado', color: '#e11d48' },
  { match: ['teatro arbole', 'teatro arbolé'], tag: 'TEATRO ARBOLÉ', name: 'Teatro Arbolé', color: '#f97316' },
  { match: ['sotano magico', 'sótano mágico'], tag: 'EL SÓTANO MÁGICO', name: 'El Sótano Mágico', color: '#a855f7' },
  { match: ['sala venecia'], tag: 'SALA VENECIA', name: 'Sala Venecia', color: '#ec4899' },
  { match: ['palacio de congresos'], tag: 'PALACIO CONGRESOS', name: 'Palacio de Congresos', color: '#14b8a6' },
  { match: ['iglesia de san pablo', 'san pablo'], tag: 'IGLESIA SAN PABLO', name: 'Iglesia de San Pablo', color: '#0ea5e9' },
  { match: ['filmoteca'], tag: 'FILMOTECA', name: 'Filmoteca de Zaragoza', color: '#eab308' },
  { match: ['pablo serrano', 'iaacc'], tag: 'IAACC P. SERRANO', name: 'IAACC Pablo Serrano', color: '#10b981' },
  { match: ['museo goya'], tag: 'MUSEO GOYA', name: 'Museo Goya', color: '#f59e0b' },
  { match: ['la lonja'], tag: 'LA LONJA', name: 'La Lonja', color: '#06b6d4' },
  { match: ['palacio de sastago', 'palacio de sástago'], tag: 'PALACIO SÁSTAGO', name: 'Palacio de Sástago', color: '#8b5cf6' },
  { match: ['centro de historias'], tag: 'CENTRO HISTORIAS', name: 'Centro de Historias', color: '#ec4899' },
  { match: ['etopia'], tag: 'ETOPIA', name: 'Etopia Centro de Arte', color: '#14b8a6' },
  { match: ['paraninfo'], tag: 'PARANINFO', name: 'Paraninfo Universidad de Zaragoza', color: '#3b82f6' },
  { match: ['pablo gargallo'], tag: 'M. PABLO GARGALLO', name: 'Museo Pablo Gargallo', color: '#84cc16' },
  { match: ['alma mater'], tag: 'ALMA MATER', name: 'Alma Mater Museum', color: '#d946ef' },
  { match: ['torreon fortea', 'torreón fortea'], tag: 'TORREÓN FORTEA', name: 'Torreón Fortea', color: '#f97316' },
  { match: ['morlanes'], tag: 'CASA MORLANES', name: 'Casa de los Morlanes', color: '#22c55e' },
  // Salas y espacios de Madrid
  { match: ['movistar arena', 'wizink'], tag: 'MOVISTAR ARENA', name: 'Movistar Arena', color: '#6366f1' },
  { match: ['la riviera'], tag: 'LA RIVIERA', name: 'La Riviera', color: '#ec4899' },
  { match: ['cafe central', 'café central'], tag: 'CAFÉ CENTRAL', name: 'Café Central', color: '#f59e0b' },
  { match: ['teatro flamenco madrid'], tag: 'T. FLAMENCO MAD', name: 'Teatro Flamenco Madrid', color: '#f97316' },
  { match: ['nuevo teatro alcala', 'nuevo teatro alcalá'], tag: 'TEATRO ALCALÁ', name: 'Nuevo Teatro Alcalá', color: '#e11d48' },
  { match: ['circo price'], tag: 'CIRCO PRICE', name: 'Teatro Circo Price', color: '#d946ef' },
  { match: ['teatro real'], tag: 'TEATRO REAL', name: 'Teatro Real', color: '#8b5cf6' },
  { match: ['teatro espanol', 'teatro español'], tag: 'TEATRO ESPAÑOL', name: 'Teatro Español', color: '#ef4444' },
  { match: ['sala el sol', 'el sol'], tag: 'SALA EL SOL', name: 'Sala El Sol', color: '#eab308' },
  { match: ['clamores'], tag: 'SALA CLAMORES', name: 'Sala Clamores', color: '#06b6d4' },
  { match: ['galileo'], tag: 'GALILEO GALILEI', name: 'Sala Galileo Galilei', color: '#10b981' },
  { match: ['siroco'], tag: 'SIROCO', name: 'Sala Siroco', color: '#84cc16' },
  { match: ['villanos'], tag: 'SALA VILLANOS', name: 'Sala Villanos', color: '#f43f5e' },
  { match: ['museo del prado'], tag: 'MUSEO DEL PRADO', name: 'Museo del Prado', color: '#3b82f6' },
  { match: ['reina sofia', 'reina sofía'], tag: 'REINA SOFÍA', name: 'Museo Reina Sofía', color: '#14b8a6' },
  { match: ['thyssen'], tag: 'THYSSEN', name: 'Museo Thyssen-Bornemisza', color: '#0ea5e9' },
  { match: ['matadero'], tag: 'MATADERO', name: 'Matadero Madrid', color: '#a855f7' }
];

const INVALID_VENUE_PATTERNS = /consultar\s*precio|no\s*publica\s*el\s*precio|cons[uú]ltalo\s*en\s*su\s*web|inscripci[oó]n|gratis|entrada\s*libre|agotado|sold\s*out|desde\s+\d|a\s+partir\s+de|taquilla|anticipada|invitaci[oó]n|por\s+confirmar|\btba\b|comprar\s*entradas|ver\s*web|hora\s*por\s*confirmar|todas\s*las\s*edades|p[uú]blico|precio|€|\beuros?\b|^\d+[,.]?\d*\s*€?|^otros\s+escenarios|^otras\s+salas|^zaragoza$|^madrid$|^barcelona$|^hoy$/i;

function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isInvalidVenueString(str) {
  const s = (str || '').trim();
  if (!s || s.length < 3 || s.length > 48) return true;
  return INVALID_VENUE_PATTERNS.test(s);
}

function resolveVenueTagAndColor(rawVenue, city = 'Zaragoza', onlyKnownPresets = false) {
  let clean = (rawVenue || '')
    .split('★')[0]
    .split('·')[0]
    .replace(/^Sala de Música\.?\s*/i, 'Sala ')
    .replace(/&#038;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const norm = normalizeText(clean);
  for (const preset of KNOWN_VENUE_META) {
    if (preset.match.some(m => norm.includes(normalizeText(m)))) {
      return {
        venueName: preset.name,
        venueTag: preset.tag,
        venueColor: preset.color
      };
    }
  }

  if (onlyKnownPresets || isInvalidVenueString(clean)) {
    return {
      venueName: `Otros Escenarios (${city})`,
      venueTag: 'OTROS ESCENARIOS',
      venueColor: '#64748b'
    };
  }

  const shortTag = clean
    .toUpperCase()
    .replace(/^(SALA DE MÚSICA|CENTRO CÍVICO|ESPACIO JOVEN)\s+/i, '')
    .slice(0, 18)
    .trim();

  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  const color = VENUE_COLOR_PALETTE[hash % VENUE_COLOR_PALETTE.length];

  return {
    venueName: clean,
    venueTag: shortTag || 'OTROS ESCENARIOS',
    venueColor: color
  };
}

function normalizeShowType(typeStr) {
  const n = normalizeText(typeStr);
  if (n.startsWith('teatro') || n.includes('teatro') || n.includes('escena')) return 'Teatro';
  if (n.startsWith('concierto') || n.includes('musica') || n.includes('concierto')) return 'Conciertos';
  if (n.startsWith('cine') || n.includes('cartelera') || n.includes('filmoteca') || n.includes('pelicula')) return 'Cine';
  if (n.startsWith('exposicion') || n.includes('exposicion') || n.includes('museo')) return 'Exposiciones';
  return null;
}

function formatDateYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(baseDate, days) {
  const d = new Date(baseDate.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function parseSpanishDateText(text, urlSlug, referenceDate) {
  const ref = new Date(referenceDate.getTime());
  ref.setHours(12, 0, 0, 0);
  const raw = (text || '').trim();
  const combined = `${raw} ${urlSlug || ''}`;

  const isoMatch = combined.match(/\b(202\d)-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const dt = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12, 0, 0);
    if (!isNaN(dt.getTime())) return dt;
  }

  if (/\bhoy\b/i.test(raw)) return new Date(ref.getTime());
  if (/\bmañana\b/i.test(raw)) return addDays(ref, 1);

  const monthRegex = /(\d{1,2})\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\b/i;
  const mMatch = combined.match(monthRegex);
  if (mMatch) {
    const dayNum = parseInt(mMatch[1], 10);
    const monthName = mMatch[2].toLowerCase();
    const monthIdx = SPANISH_MONTHS[monthName];
    if (monthIdx !== undefined) {
      let year = ref.getFullYear();
      let candidate = new Date(year, monthIdx, dayNum, 12, 0, 0);
      if (candidate.getTime() < ref.getTime() - 2 * 86400000) {
        candidate = new Date(year + 1, monthIdx, dayNum, 12, 0, 0);
      }
      return candidate;
    }
  }

  const shortMatch = raw.match(/\b(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-záéíóú]*\.?\s+(\d{1,2})\b/i);
  if (shortMatch) {
    const dayNum = parseInt(shortMatch[2], 10);
    let year = ref.getFullYear();
    let month = ref.getMonth();
    let candidate = new Date(year, month, dayNum, 12, 0, 0);
    if (candidate.getTime() < ref.getTime() - 86400000) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      candidate = new Date(year, month, dayNum, 12, 0, 0);
    }
    return candidate;
  }

  for (const [dayName, dayIdx] of Object.entries(DAY_NAMES_TO_INDEX)) {
    const rgx = new RegExp(`\\b${dayName}\\b`, 'i');
    if (rgx.test(raw)) {
      const currentDay = ref.getDay();
      const diff = (dayIdx - currentDay + 7) % 7;
      return addDays(ref, diff);
    }
  }

  return new Date(ref.getTime());
}

function extractTimeFromText(text) {
  const m = (text || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '19:30';
}

const STYLE_DETECTION_RULES = [
  { label: 'Rock', tag: 'ROCK', color: '#ef4444', keywords: ['rock', 'rock & roll', 'rock and roll', 'hard rock', 'garage rock', 'rockabilly', 'surf rock', 'rock progresivo', 'prog rock', 'tributo a nirvana', 'grunge', 'hombres g', 'bunbury', 'psicodélico', 'psicodelico', 'rickenbacker', 'extremoduro', 'the police', 'creedence', 'canto del loco', 'tierra santa', 'linkin park', 'guitarra eléctrica', 'power pop', 'def con dos', 'lois', 'banda de rock'] },
  { label: 'Jazz', tag: 'JAZZ', color: '#f59e0b', keywords: ['jazz', 'swing', 'bebop', 'saxo', 'saxofón', 'cuarteto de jazz', 'trío de jazz', 'd’rivera', 'chris potter', 'improvisación', 'big band', 'bossa nova'] },
  { label: 'Blues', tag: 'BLUES', color: '#3b82f6', keywords: ['blues', 'rhythm and blues', 'r&b', 'mojothunder', 'armónica'] },
  { label: 'Soul / Funk', tag: 'SOUL / FUNK', color: '#eab308', keywords: ['soul', 'funk', 'funky', 'motown', 'gospel', 'derobert', 'groove', 'afrobeat'] },
  { label: 'Clásica', tag: 'CLÁSICA', color: '#6366f1', keywords: ['clásica', 'clasica', 'filarmónica', 'filarmonica', 'sinfónica', 'sinfonica', 'sinfónico', 'sinfonico', 'orquesta', 'cámara', 'chamber', 'opera', 'ópera', 'coro', 'coral', 'polifónica', 'mozart', 'beethoven', 'bach', 'vivaldi', 'chopin', 'piano', 'violín', 'chelo', 'soprano', 'barroco', 'zarzuela', 'banda de música', 'recital lírico', 'banda sonora', 'bso'] },
  { label: 'Indie / Alternativo', tag: 'INDIE / ALT', color: '#10b981', keywords: ['indie', 'alternativo', 'alternative', 'shoegaze', 'post-punk', 'post punk', 'post-rock', 'psych', 'temples', 'lata gourmet', 'neo-psicodélico', 'the smiths', 'sobrezero', 'new wave', 'dream pop'] },
  { label: 'Punk', tag: 'PUNK', color: '#e11d48', keywords: ['punk', 'punk rock', 'hardcore', 'motosierras', 'zumbidos', 'gbh', 'kamikazes', 'insurrectos', 'kalumnia', 'nerve agent', 'ska-punk'] },
  { label: 'Metal / Heavy', tag: 'METAL / HEAVY', color: '#7c3aed', keywords: ['metal', 'heavy', 'heavy metal', 'thrash', 'death metal', 'black metal', 'metalcore', 'nu metal', 'metallica', 'system of a down', 'alien steel', 'bloodorn'] },
  { label: 'Pop', tag: 'POP', color: '#ec4899', keywords: ['pop', 'synthpop', 'synth pop', 'techno pop', 'melódico', 'mercedes cañas', 'bombai', 'ruslana', 'éxitos', 'pop español', 'indie pop'] },
  { label: 'Urbano / Rap', tag: 'URBANO / RAP', color: '#8b5cf6', keywords: ['rap', 'hip hop', 'hip-hop', 'hiphop', 'trap', 'urbano', 'urbana', 'reguetón', 'regueton', 'reggaeton', 'flow 2000', 'abhir', 'l\'haine', 'lhaine', 'ziro', 'freestyle'] },
  { label: 'Electrónica', tag: 'ELECTRÓNICA', color: '#06b6d4', keywords: ['electrónica', 'electronica', 'electronic', 'house', 'techno', 'dj', 'dj set', 'club', 'fiesta', 'party', 'edm', 'ambient', 'experimental', 'acid house', 'trip hop', 'sintetizador', 'darkwave', 'industrial', 'drum and bass', 'trance'] },
  { label: 'Flamenco', tag: 'FLAMENCO', color: '#f97316', keywords: ['flamenco', 'copla', 'rumba', 'cante', 'tablao', 'guitarra española', 'jondura', 'estopa', 'melendi'] },
  { label: 'Folk / Cantautor', tag: 'FOLK / CANTAUTOR', color: '#84cc16', keywords: ['folk', 'cantautor', 'canción de autor', 'trova', 'acústico', 'acustico', 'acoustic', 'tradicional', 'jota', 'celta', 'raíz', 'country', 'bluegrass', 'rupatrupa', 'bladimir ros'] },
  { label: 'Latino / Mestizaje', tag: 'LATINO / SKA', color: '#14b8a6', keywords: ['salsa', 'bachata', 'cumbia', 'merengue', 'reggae', 'ska', 'latino', 'balkan', 'balcánica', 'gypsy', 'tango', 'bolero', 'irregular roots', 'mestizaje'] }
];

function matchStyleRule(text) {
  const norm = normalizeText(text || '');
  if (!norm) return '';
  for (const rule of STYLE_DETECTION_RULES) {
    for (const kw of rule.keywords) {
      const kwNorm = normalizeText(kw);
      const rgx = new RegExp(`(^|[^a-z0-9])${kwNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      if (rgx.test(norm)) {
        return rule.label;
      }
    }
  }
  return '';
}

function extractStyleFromDescription(title, descriptionText) {
  // Priorizar el título explícito del concierto antes que el texto largo de la página
  const fromTitle = matchStyleRule(title);
  if (fromTitle) return fromTitle;
  return matchStyleRule(descriptionText);
}

function resolveStyleTagAndColor(styleLabel) {
  if (!styleLabel) {
    return {
      styleName: 'Otros / Sin especificar',
      styleTag: 'SIN ESPECIFICAR',
      styleColor: '#64748b'
    };
  }
  const found = STYLE_DETECTION_RULES.find(r => r.label === styleLabel);
  if (found) {
    return {
      styleName: found.label,
      styleTag: found.tag,
      styleColor: found.color
    };
  }
  return {
    styleName: styleLabel,
    styleTag: styleLabel.toUpperCase(),
    styleColor: '#6366f1'
  };
}

function cleanArtistOrGroupName(rawTitle) {
  return (rawTitle || '')
    .replace(/&#8211;/g, '–')
    .replace(/&#038;/g, '&')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s+en\s+(concierto|zaragoza|sala\s+.*)$/i, '')
    .replace(/^concierto\s+(de\s+)?/i, '')
    .trim();
}

/**
 * Crea una huella normalizada del nombre del artista/grupo para evitar duplicar el mismo concierto
 * cuando llega tanto desde locozaragozadiscoteca.com como desde vivezaragoza.es o aragonenvivo.com
 */
function buildArtistDedupFingerprint(rawTitle) {
  const norm = normalizeText(cleanArtistOrGroupName(rawTitle))
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(tributo|homenaje)\s+a\b.*$/g, ' ')
    .replace(/\+.*$/g, ' ')
    .replace(/\b(tributo|homenaje|concierto|gira|tour|festival|zaragoza|madrid|presenta|en\s+vivo|entrada\s+libre)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return norm.split(/\s+/).slice(0, 3).join(' ');
}

function classifyShowTypeFromText(title, text, fallbackType) {
  const norm = normalizeText(`${title} ${text}`);

  if (/\bmusical(es)?\b/.test(norm) || norm.includes('teatro') || norm.includes('zarzuela') || norm.includes('cabaret') || norm.includes('comedia') || norm.includes('comedy') || norm.includes('escena') || norm.includes('monologo') || norm.includes('dramaturgia') || norm.includes('muestra internacional de teatro')) {
    return 'Teatro';
  }
  if (norm.includes('cine') || norm.includes('filmoteca') || norm.includes('pelicula') || norm.includes('proyeccion') || norm.includes('cortometraje') || norm.includes('documental')) {
    return 'Cine';
  }
  if (norm.includes('exposicion') || norm.includes('muestra de arte') || norm.includes('museo') || norm.includes('galeria') || norm.includes('pintura') || norm.includes('escultura') || norm.includes('fotografia')) {
    return 'Exposiciones';
  }
  if (norm.includes('concierto') || norm.includes('musica') || norm.includes('rock') || norm.includes('jazz') || norm.includes('pop') || norm.includes('orquesta') || norm.includes('banda') || norm.includes('acustico') || norm.includes('recital') || norm.includes('auditorio') || norm.includes('coro') || norm.includes('flamenco') || norm.includes('tributo')) {
    return 'Conciertos';
  }
  if (fallbackType && VALID_SHOW_TYPES.includes(fallbackType)) {
    return fallbackType;
  }
  return null;
}

async function fetchHtmlWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) go2enjoy-calendar-bot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    if (/iso-8859|latin1|windows-1252/i.test(ct)) {
      return new TextDecoder('windows-1252').decode(buf);
    }
    const utf8 = new TextDecoder('utf-8').decode(buf);
    if (/charset=["']?(iso-8859-1|windows-1252)/i.test(utf8.slice(0, 1500))) {
      return new TextDecoder('windows-1252').decode(buf);
    }
    return utf8;
  } finally {
    clearTimeout(timer);
  }
}

function getCleanHostname(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, '');
  } catch (_) {
    return 'web';
  }
}

/**
 * Escanea directamente la página oficial de La Casa del Loco / Loco Zaragoza:
 * https://www.locozaragozadiscoteca.com/
 * Asigna el TAG [LOCO ZARAGOZA] y extrae todos los conciertos de 2026 y 2027 con su enlace directo de entradas/info.
 */
async function scrapeLocoZaragoza(baseUrl, city, referenceDate) {
  const targetUrl = baseUrl || 'https://www.locozaragozadiscoteca.com/';
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);

    let currentYear = referenceDate.getFullYear();
    const dateStartRegex = /^(lun|mar|mi[eé]|jue|vie|s[aá]b|dom)[a-záéíóú]*\.?\s+(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b\s*(.*)$/i;

    const elements = $('h1, h2, h3, h4, a').toArray();
    let pendingEvent = null;

    const flushPending = () => {
      if (!pendingEvent) return;
      const vMeta = resolveVenueTagAndColor('Loco Zaragoza', city);
      const style = extractStyleFromDescription(pendingEvent.title, pendingEvent.title);
      const finalUrl = pendingEvent.url || targetUrl;

      events.push({
        id: `loco-${Buffer.from(pendingEvent.title + pendingEvent.date).toString('base64').slice(0, 20)}-${pendingEvent.date}`,
        title: pendingEvent.title,
        artistName: cleanArtistOrGroupName(pendingEvent.title),
        musicStyle: style,
        date: pendingEvent.date,
        time: pendingEvent.time || '21:00',
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag,     // [LOCO ZARAGOZA]
        venueColor: vMeta.venueColor,
        url: finalUrl,
        isTicketUrl: Boolean(pendingEvent.url),
        section: 'A',
        subType: 'Conciertos',
        hasOriginalSource: true,
        prioritySource: 3,            // Prioridad máxima frente a agregadores para evitar duplicados
        sourceName: getCleanHostname(finalUrl),
        price: /entrada\s*libre|gratis/i.test(pendingEvent.title) ? 'Entrada libre' : 'Ver entradas'
      });
      pendingEvent = null;
    };

    for (const el of elements) {
      const tag = (el.tagName || '').toLowerCase();
      const text = $(el).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;

      // Detectar cambio de bloque de año (ej: "# 2027")
      if (/^202[6-9]$/.test(text)) {
        flushPending();
        currentYear = parseInt(text, 10);
        continue;
      }

      if (tag === 'h4') {
        const m = text.match(dateStartRegex);
        if (m) {
          flushPending();
          const dayNum = parseInt(m[2], 10);
          const monthName = m[3].toLowerCase();
          const monthIdx = SPANISH_MONTHS[monthName];
          const artistPart = (m[4] || '').trim();

          if (monthIdx !== undefined && artistPart) {
            let yearToUse = currentYear;
            let dt = new Date(yearToUse, monthIdx, dayNum, 12, 0, 0);
            if (dt.getTime() < referenceDate.getTime() - 5 * 86400000 && yearToUse === referenceDate.getFullYear()) {
              yearToUse += 1;
              dt = new Date(yearToUse, monthIdx, dayNum, 12, 0, 0);
            }
            pendingEvent = {
              date: formatDateYMD(dt),
              title: artistPart,
              time: '21:00',
              url: null
            };
          }
        } else if (pendingEvent) {
          // Continuación del nombre del grupo en un h4 siguiente, ej: "(Tributo a Extremoduro)" o "+ LOS FURTIVOS"
          pendingEvent.title = `${pendingEvent.title} ${text}`.replace(/\s+/g, ' ').trim();
        }
      } else if (tag === 'a' && pendingEvent) {
        const href = $(el).attr('href');
        if (href && href.startsWith('http') && /comprar\s+entradas|m[aá]s\s+info|entradas/i.test(text)) {
          pendingEvent.url = href;
          // Extraer hora si viene en la URL de entradas (ej: sessions/12-03-2027-20-00)
          const timeInUrl = href.match(/-(\d{2})-(\d{2})$/);
          if (timeInUrl) {
            pendingEvent.time = `${timeInUrl[1]}:${timeInUrl[2]}`;
          }
          flushPending();
        }
      }
    }
    flushPending();

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

/**
 * Escanea directamente la página oficial de Sala López:
 * https://salalopez.com/eventos/
 * Asigna el TAG [SALA LÓPEZ] y extrae conciertos con su enlace de entradas/info, evitando duplicados con otros agregadores.
 */
async function scrapeSalaLopez(baseUrl, city, referenceDate) {
  const targetUrl = baseUrl || 'https://salalopez.com/eventos/';
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);
    const vMeta = resolveVenueTagAndColor('Sala López', city);

    $('.dmach-grid-item').each((_, card) => {
      const acfValues = $(card)
        .find('.dmach-acf-value')
        .map((__, el) => $(el).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);

      if (acfValues.length === 0) return;

      let title = '';
      let price = 'Ver entradas';
      let dateStr = '';
      let timeStr = '21:00';

      for (const val of acfValues) {
        const dMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dMatch) {
          dateStr = `${dMatch[3]}-${dMatch[2].padStart(2, '0')}-${dMatch[1].padStart(2, '0')}`;
          continue;
        }
        const tMatch = val.match(/HORARIO:\s*(\d{1,2}:\d{2})/i) || val.match(/\b(\d{1,2}:\d{2})\s*HS?\b/i);
        if (tMatch) {
          timeStr = tMatch[1].padStart(5, '0');
          continue;
        }
        if (/anticip|taquilla|€|gratis|libre/i.test(val)) {
          price = val;
          continue;
        }
        if (!title) {
          title = val;
        }
      }

      if (!title || !dateStr) return;

      let ticketUrl = targetUrl;
      $(card).find('a.et_pb_button, a').each((__, aEl) => {
        const txt = $(aEl).text().replace(/\s+/g, ' ').trim();
        const href = $(aEl).attr('href');
        if (!href || !href.startsWith('http')) return;
        if (/autorizacion|menores|\.pdf|\.zip/i.test(txt + ' ' + href)) return;
        if (/comprar\s+entradas|m[aá]s\s+info|m[aá]s\s+datos|entradas/i.test(txt)) {
          ticketUrl = href;
        }
      });

      const style = extractStyleFromDescription(title, title);
      events.push({
        id: `salalopez-${Buffer.from(title + dateStr).toString('base64').slice(0, 20)}-${dateStr}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle: style,
        date: dateStr,
        time: timeStr,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag, // [SALA LÓPEZ]
        venueColor: vMeta.venueColor,
        url: ticketUrl,
        isTicketUrl: ticketUrl !== targetUrl,
        section: 'A',
        subType: 'Conciertos',
        hasOriginalSource: true,
        prioritySource: 1,
        sourceName: getCleanHostname(ticketUrl),
        price
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

/**
 * Escanea directamente la página oficial de Rock & Blues Café:
 * https://www.rockandbluescafe.com/conciertos/
 * Asigna el TAG [ROCK & BLUES] y extrae todos los conciertos en una sola pasada sin navegación extra.
 */
async function scrapeRockAndBlues(baseUrl, city, referenceDate) {
  const targetUrl = baseUrl || 'https://www.rockandbluescafe.com/conciertos/';
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);
    const vMeta = resolveVenueTagAndColor('Rock & Blues', city);
    const seenUrls = new Set();

    $('a').each((_, aEl) => {
      const href = $(aEl).attr('href') || '';
      const slugMatch = href.match(/\/conciertos\/.+-(\d{2})-(\d{2})-(\d{4})\/?$/);
      if (!slugMatch) return;

      const fullUrl = new URL(href, targetUrl).toString();
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const title = $(aEl).find('h3.rb-event-title, h3').first().text().replace(/\s+/g, ' ').trim();
      if (!title) return;

      const cycleText = $(aEl).find('.rb-event-cycle').first().text().replace(/\s+/g, ' ').trim();
      const ribbonText = $(aEl).find('.rb-ribbon').first().text().replace(/\s+/g, ' ').trim();
      const dateText = $(aEl).find('.rb-event-date').first().text().replace(/\s+/g, ' ').trim();

      const dateStr = `${slugMatch[3]}-${slugMatch[2]}-${slugMatch[1]}`;
      const timeStr = extractTimeFromText(dateText || '21:00');
      const style = extractStyleFromDescription(title, `${title} ${cycleText}`);

      events.push({
        id: `rb-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${dateStr}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle: style,
        date: dateStr,
        time: timeStr,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag, // [ROCK & BLUES]
        venueColor: vMeta.venueColor,
        url: fullUrl,
        section: 'A',
        subType: 'Conciertos',
        hasOriginalSource: true,
        prioritySource: 1,
        sourceName: getCleanHostname(fullUrl),
        price: /libre|gratis/i.test(ribbonText) ? 'Acceso libre' : (ribbonText || 'Ver web')
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

/**
 * Escanea directamente la página oficial del Auditorio de Zaragoza:
 * https://auditoriozaragoza.com/
 * Extrae los eventos del calendario con ?occurrence=YYYY-MM-DD en una sola pasada sin navegación extra.
 */
async function scrapeAuditorioZaragoza(baseUrl, city, referenceDate) {
  const targetUrl = baseUrl || 'https://auditoriozaragoza.com/';
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);
    $('noscript').remove();
    const vMeta = resolveVenueTagAndColor('Auditorio de Zaragoza', city);
    const seenKeys = new Set();

    $('a[href*="occurrence="]').each((_, aEl) => {
      const href = $(aEl).attr('href') || '';
      const occMatch = href.match(/occurrence=(\d{4}-\d{2}-\d{2})/);
      if (!occMatch) return;

      const dateStr = occMatch[1];
      const title = $(aEl).text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 2) return;

      const fullUrl = new URL(href, targetUrl).toString();
      const dedupKey = `${normalizeText(title)}|${dateStr}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const containerText = $(aEl).parent().parent().text().replace(/\s+/g, ' ').trim();
      const timeStr = extractTimeFromText(containerText);
      const showType = classifyShowTypeFromText(title, containerText, 'Conciertos') || 'Conciertos';
      const style = showType === 'Conciertos' ? extractStyleFromDescription(title, containerText) : '';

      events.push({
        id: `aud-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${dateStr}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle: style,
        date: dateStr,
        time: timeStr,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag, // [AUDITORIO ZGZ]
        venueColor: vMeta.venueColor,
        url: fullUrl,
        section: 'A',
        subType: showType,
        hasOriginalSource: true,
        prioritySource: 1,
        sourceName: getCleanHostname(fullUrl),
        price: 'Ver web'
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeAragonEnVivo(baseUrl, city, referenceDate) {
  const eventsUrl = new URL('/eventos/', baseUrl).toString();
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(eventsUrl, 9000);
    const $ = cheerio.load(html);

    $('script[type="application/ld+json"]').each((_, sEl) => {
      try {
        const parsed = JSON.parse($(sEl).html());
        const list = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

        for (const item of list) {
          if (item['@type'] !== 'Event' || !item.name || !item.url) continue;

          const cleanTitle = item.name.replace(/&#8211;/g, '–').replace(/&#038;/g, '&').trim();
          const rawDesc = (item.description || '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          const rawVenueName = (item.location?.name || '').replace(/&#038;/g, '&').trim();
          const venueDesc = (item.location?.description || '').replace(/<[^>]+>/g, ' ');

          let dateStr = formatDateYMD(referenceDate);
          let timeStr = '20:00';
          if (item.startDate) {
            const m = String(item.startDate).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
            if (m) {
              dateStr = m[1];
              timeStr = m[2];
            }
          }

          const showType = classifyShowTypeFromText(cleanTitle, `${rawDesc} ${rawVenueName} ${venueDesc}`, 'Conciertos');
          const vMeta = resolveVenueTagAndColor(rawVenueName, city);
          const musicStyle = extractStyleFromDescription(cleanTitle, `${rawDesc} ${venueDesc}`);

          events.push({
            id: `aev-${Buffer.from(item.url).toString('base64').slice(0, 22)}-${dateStr}`,
            title: cleanTitle,
            artistName: cleanArtistOrGroupName(cleanTitle),
            musicStyle,
            date: dateStr,
            time: timeStr,
            venue: vMeta.venueName,
            venueTag: vMeta.venueTag,
            venueColor: vMeta.venueColor,
            url: item.url,
            section: 'A',
            subType: showType || 'Conciertos',
            hasOriginalSource: true,
            sourceName: 'aragonenvivo.com',
            price: item.offers?.price ? String(item.offers.price) : 'Ver web'
          });
        }
      } catch (_) {}
    });

    return { ok: true, targetUrl: eventsUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl: eventsUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeViveZaragozaSection(baseUrl, pathSuffix, fixedShowType, city, referenceDate) {
  const targetUrl = new URL(pathSuffix, baseUrl).toString();
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);

    $('a[href*="/hoy/evento/"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href) return;
      const fullUrl = new URL(href, baseUrl).toString();

      let title = $a.find('h3, h2, .font-semibold.text-gray-900, .font-bold.text-gray-900').first().text().trim();
      if (!title) {
        title = $a.attr('title') || $a.find('img').attr('alt') || '';
      }
      title = title.replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) return;

      const allText = $a.text().replace(/\s+/g, ' ').trim();
      const showType = classifyShowTypeFromText(title, allText, fixedShowType);
      if (!showType) return;

      const time = extractTimeFromText(allText);
      const dateObj = parseSpanishDateText(allText, href, referenceDate);

      let venue = '';
      const pTags = $a.find('span.truncate, p');
      pTags.each((__, pEl) => {
        if (venue) return;
        const pTxt = $(pEl).text().replace(/\s+/g, ' ').trim();
        let candidate = pTxt
          .split('★')[0]
          .split('·')[0]
          .replace(/^(Gratis|Consultar\s*precio|Entrada\s*libre|Agotado|Sold\s*out)\s*/i, '')
          .trim();
        if (candidate && candidate !== title && !/\b(hoy|lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/i.test(candidate) && !isInvalidVenueString(candidate)) {
          venue = candidate;
        }
      });

      const vMeta = resolveVenueTagAndColor(venue, city);
      // Evitar que el nombre de la sala (p.ej. "Rock & Blues") falsee el estilo musical
      const textWithoutVenue = venue ? allText.split(venue).join(' ') : allText;
      const musicStyle = showType === 'Conciertos' ? extractStyleFromDescription(title, textWithoutVenue) : '';

      events.push({
        id: `vz-${Buffer.from(fullUrl).toString('base64').slice(0, 22)}-${formatDateYMD(dateObj)}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle,
        date: formatDateYMD(dateObj),
        time,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag,
        venueColor: vMeta.venueColor,
        url: fullUrl,
        section: 'A',
        subType: showType,
        prioritySource: 2,
        sourceName: getCleanHostname(baseUrl),
        price: /gratis/i.test(allText) ? 'Gratis' : ((allText.match(/\d+\s*€/) || ['Ver web'])[0])
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeViveZaragoza(baseUrl, selectedShowTypes, city, referenceDate) {
  const cleanBase = (baseUrl || 'https://vivezaragoza.es').replace(/\/$/, '');
  const sectionsToScan = [];
  if (selectedShowTypes.includes('Conciertos')) {
    sectionsToScan.push({ path: '/conciertos', fixedType: 'Conciertos' });
  }
  if (selectedShowTypes.includes('Teatro')) {
    sectionsToScan.push({ path: '/teatro', fixedType: 'Teatro' });
  }
  if (selectedShowTypes.includes('Cine')) {
    sectionsToScan.push({ path: '/cartelera', fixedType: 'Cine' });
  }
  if (selectedShowTypes.includes('Exposiciones')) {
    sectionsToScan.push({ path: '/exposiciones', fixedType: 'Exposiciones' });
  }
  sectionsToScan.push({ path: '/', fixedType: null });

  const results = await Promise.all(
    sectionsToScan.map(sec => scrapeViveZaragozaSection(cleanBase, sec.path, sec.fixedType, city, referenceDate))
  );

  const events = [];
  let okCount = 0;
  for (const r of results) {
    if (r.ok) {
      okCount++;
      events.push(...r.events);
    }
  }
  return {
    ok: okCount > 0,
    targetUrl: `${cleanBase}/`,
    count: events.length,
    events,
    error: okCount === 0 ? 'No se pudo acceder a Vive Zaragoza' : undefined
  };
}

async function scrapeEsMadrid(targetUrl, city, referenceDate) {
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);
    $('noscript').remove();
    const seenUrls = new Set();

    const fixedByUrl = /agenda-teatro|agenda-musicales/i.test(targetUrl)
      ? 'Teatro'
      : (/agenda-musica/i.test(targetUrl)
          ? 'Conciertos'
          : (/agenda-exposiciones/i.test(targetUrl) ? 'Exposiciones' : null));

    $('.node-event').each((_, el) => {
      const $node = $(el);
      const rawText = $node.text().replace(/\s+/g, ' ').trim();
      if (!rawText || /^finalizado\b/i.test(rawText)) return;

      const href = $node.find('a[href*="/agenda/"]').first().attr('href') || $node.find('a').first().attr('href');
      if (!href) return;
      const fullUrl = new URL(href, targetUrl).toString();
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      const title = (
        $node.find('h2, h3, h4, .field-name-title a').first().text().trim() ||
        $node.find('img').attr('alt') ||
        $node.find('a').filter((__, a) => $(a).text().trim().length > 2).first().text().trim()
      ).replace(/\s+/g, ' ').trim();
      if (!title || title.length < 3) return;

      // Extraer lugar y fecha de paréntesis tipo "(Movistar Arena. 5 noviembre)" o "(Varios locales. 2 oct a 30 nov)"
      let rawVenue = '';
      let dateContext = rawText;
      const parenMatch = rawText.match(/\(([^()]+)\)\s*$/);
      if (parenMatch) {
        const inside = parenMatch[1].trim();
        const dotIdx = inside.indexOf('.');
        if (dotIdx > 0) {
          rawVenue = inside.slice(0, dotIdx).trim();
          dateContext = inside.slice(dotIdx + 1).trim();
        } else {
          dateContext = inside;
        }
      }

      const dateObj = parseSpanishDateText(dateContext, href, referenceDate);
      const refDayStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0);
      const effectiveDate = dateObj.getTime() < refDayStart.getTime() ? referenceDate : dateObj;
      const timeStr = extractTimeFromText(rawText);
      const vMeta = resolveVenueTagAndColor(rawVenue, city);
      const showType = fixedByUrl || classifyShowTypeFromText(title, rawText, 'Conciertos') || 'Conciertos';
      const cleanVenue = rawVenue || '';
      const textForStyle = cleanVenue ? rawText.split(cleanVenue).join(' ') : rawText;
      const musicStyle = showType === 'Conciertos' ? extractStyleFromDescription(title, textForStyle) : '';

      events.push({
        id: `esm-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${formatDateYMD(effectiveDate)}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle,
        date: formatDateYMD(effectiveDate),
        time: timeStr,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag,
        venueColor: vMeta.venueColor,
        url: fullUrl,
        actionLabel: 'Ir a Más info',
        section: 'A',
        subType: showType,
        hasOriginalSource: true,
        prioritySource: 2,
        sourceName: getCleanHostname(fullUrl),
        price: /gratis|gratuito|entrada libre/i.test(rawText) ? 'Gratis' : 'Ver web'
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeMadridEnVivo(targetUrl, city, referenceDate) {
  const events = [];
  const seenKeys = new Set();

  const pagesToFetch = [{ url: targetUrl, explicitDate: null }];
  const isRootOrAgenda = /madridenvivo\.com\/(agenda-de-conciertos-y-espectaculo\/?)?$/i.test(targetUrl);
  if (isRootOrAgenda) {
    // Consultar los próximos 14 días de agenda diaria (?fecha=DD-MM-YYYY) en paralelo
    for (let offset = 0; offset < 14; offset++) {
      const dt = addDays(referenceDate, offset);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      pagesToFetch.push({
        url: `https://madridenvivo.com/agenda-de-conciertos-y-espectaculo/?fecha=${dd}-${mm}-${yyyy}`,
        explicitDate: formatDateYMD(dt)
      });
    }
  }

  try {
    const htmlList = await runWithConcurrency(pagesToFetch, 6, async (p) => {
      try {
        return { ...p, html: await fetchHtmlWithTimeout(p.url, 9000) };
      } catch (_) {
        return { ...p, html: '' };
      }
    });

    for (const page of htmlList) {
      if (!page.html) continue;
      const $ = cheerio.load(page.html);
      $('noscript').remove();

      // 1. Tarjetas de listado completo (.item-evento) en /agenda-de-conciertos-y-espectaculo/?fecha=DD-MM-YYYY
      $('.item-evento').each((_, cardEl) => {
        const $c = $(cardEl);
        const href = $c.find('a[href*="/evento/"]').first().attr('href') || '';
        if (!href) return;
        const fullUrl = new URL(href, page.url).toString();

        const title = (
          $c.find('.item-evento__nombre__enlace').first().text() ||
          $c.find('.item-evento__nombre').first().text() ||
          ''
        ).replace(/\s+/g, ' ').trim();
        if (!title || title.length < 2) return;

        const genreText = ($c.find('.item-evento__generos__enlace, .item-evento__generos').first().text() || '').replace(/\s+/g, ' ').trim();
        const rawVenue = (
          $c.find('.item-evento__sala__enlace').first().text() ||
          $c.find('.item-evento__sala').first().text() ||
          ''
        ).replace(/\s+/g, ' ').trim();
        const timeRaw = ($c.find('.item-evento__pases').first().text() || '').replace(/\s+/g, ' ').trim();
        const priceRaw = ($c.find('.item-evento__anticipada__texto').first().text() || '').replace(/\s+/g, ' ').trim();

        const dateStr = page.explicitDate || formatDateYMD(parseSpanishDateText(title, href, referenceDate));
        const dedupKey = `${fullUrl}|${dateStr}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        const timeStr = extractTimeFromText(timeRaw);
        const vMeta = resolveVenueTagAndColor(rawVenue, city);
        const showType = classifyShowTypeFromText(title, `${genreText} ${rawVenue}`, 'Conciertos') || 'Conciertos';
        const musicStyle = showType === 'Conciertos'
          ? (extractStyleFromDescription(title, genreText) || mapExternalGenreToStyleLabel(genreText))
          : '';

        events.push({
          id: `mev-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${dateStr}`,
          title,
          artistName: cleanArtistOrGroupName(title),
          musicStyle,
          date: dateStr,
          time: timeStr,
          venue: vMeta.venueName,
          venueTag: vMeta.venueTag,
          venueColor: vMeta.venueColor,
          url: fullUrl,
          actionLabel: 'Ir a Más info',
          section: 'A',
          subType: showType,
          hasOriginalSource: true,
          prioritySource: 1,
          sourceName: getCleanHostname(fullUrl),
          price: priceRaw || 'Ver web'
        });
      });

      // 2. Tarjetas destacadas en portada (a[href*="/evento/"] con .destacados-titulo)
      if (!page.explicitDate) {
        $('a[href*="/evento/"]').each((_, aEl) => {
          const $a = $(aEl);
          const href = $a.attr('href') || '';
          if (!href) return;
          const fullUrl = new URL(href, page.url).toString();

          const title = ($a.find('.destacados-titulo, h2, h3').first().text() || '').replace(/\s+/g, ' ').trim();
          if (!title || title.length < 2) return;

          const dateText = ($a.find('.destacados-fecha').first().text() || $a.text()).replace(/\s+/g, ' ').trim();
          const dateObj = parseSpanishDateText(dateText, href, referenceDate);
          const dateStr = formatDateYMD(dateObj);

          const dedupKey = `${fullUrl}|${dateStr}`;
          if (seenKeys.has(dedupKey)) return;
          seenKeys.add(dedupKey);

          const rawVenue = ($a.find('.sala_destacado').first().text() || '').replace(/\s+/g, ' ').trim();
          const timeRaw = ($a.find('.destacados-sala-hora').first().text() || $a.text()).replace(/\s+/g, ' ').trim();
          const timeStr = extractTimeFromText(timeRaw);

          const vMeta = resolveVenueTagAndColor(rawVenue, city);
          const showType = classifyShowTypeFromText(title, `${rawVenue} ${timeRaw}`, 'Conciertos') || 'Conciertos';
          const musicStyle = showType === 'Conciertos' ? extractStyleFromDescription(title, title) : '';

          events.push({
            id: `mev-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${dateStr}`,
            title,
            artistName: cleanArtistOrGroupName(title),
            musicStyle,
            date: dateStr,
            time: timeStr,
            venue: vMeta.venueName,
            venueTag: vMeta.venueTag,
            venueColor: vMeta.venueColor,
            url: fullUrl,
            actionLabel: 'Ir a Más info',
            section: 'A',
            subType: showType,
            hasOriginalSource: true,
            prioritySource: 1,
            sourceName: getCleanHostname(fullUrl),
            price: 'Ver web'
          });
        });
      }
    }

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeConciertosClub(targetUrl, city, referenceDate) {
  const events = [];
  const seenKeys = new Set();

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 25000);
    const $ = cheerio.load(html);

    $('.wrap').each((_, wrapEl) => {
      const $w = $(wrapEl);
      const $nombre = $w.find('a.nombre').first();
      const href = $nombre.attr('href');
      if (!href) return;

      const fullUrl = new URL(href, targetUrl).toString();
      const title = $nombre.text().replace(/\s+/g, ' ').trim();
      if (!title || title.length < 2) return;

      const wrapText = $w.text().replace(/\s+/g, ' ').trim();
      const dtMatch = wrapText.match(/(\d{2})\/(\d{2})\/(\d{2})\s*(\d{2}:\d{2})?/);

      let dateStr = '';
      let timeStr = extractTimeFromText(wrapText);

      if (dtMatch) {
        dateStr = `20${dtMatch[3]}-${dtMatch[2]}-${dtMatch[1]}`;
        if (dtMatch[4]) timeStr = dtMatch[4];
      } else {
        const dayHeader = (
          $w.closest('article').find('.tit_wrap').first().text() ||
          $w.closest('ul.list').prev().text() ||
          ''
        ).replace(/\s+/g, ' ').trim();
        if (!dayHeader) return;
        const parsedDate = parseSpanishDateText(dayHeader, href, referenceDate);
        dateStr = formatDateYMD(parsedDate);
      }

      const dedupKey = `${fullUrl}|${dateStr}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const rawStyle = ($w.find('span.estilo').first().text() || '').replace(/^\s*\/\s*/, '').replace(/\s+/g, ' ').trim();
      const rawVenueFull = ($w.find('a.local').first().text() || '').replace(/\s+/g, ' ').trim();
      const rawVenue = rawVenueFull.split(/\.\s+/)[0].trim();

      const vMeta = resolveVenueTagAndColor(rawVenue, city);
      const musicStyle = extractStyleFromDescription(title, rawStyle) || mapExternalGenreToStyleLabel(rawStyle);

      events.push({
        id: `cc-${Buffer.from(fullUrl).toString('base64').slice(0, 20)}-${dateStr}`,
        title,
        artistName: cleanArtistOrGroupName(title),
        musicStyle,
        date: dateStr,
        time: timeStr,
        venue: vMeta.venueName,
        venueTag: vMeta.venueTag,
        venueColor: vMeta.venueColor,
        url: fullUrl,
        actionLabel: 'Ir a Más info',
        section: 'A',
        subType: 'Conciertos',
        hasOriginalSource: true,
        prioritySource: 1,
        sourceName: getCleanHostname(fullUrl),
        price: 'Ver web'
      });
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

function resolveFestivalTagAndColor(rawName) {
  let clean = String(rawName || 'Festival').replace(/\s+/g, ' ').trim();
  if (clean.includes('|')) {
    const parts = clean.split('|').map(p => p.trim()).filter(Boolean);
    const nonGeneric = parts.find(p => !/^(conciertos|agenda|eventos|programaci[oó]n|inicio|home)$/i.test(p));
    clean = nonGeneric || parts[0] || clean;
  }
  clean = clean.replace(/\s+-\s+.*$/, '').trim();
  const norm = normalizeText(clean);
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash * 31 + norm.charCodeAt(i)) >>> 0;
  }
  const color = VENUE_COLOR_PALETTE[hash % VENUE_COLOR_PALETTE.length];
  const tag = clean.toUpperCase().slice(0, 22).trim() || 'FESTIVAL';
  return { festivalName: clean, festivalTag: tag, festivalColor: color };
}

function eventMatchesCity(locationText, targetCity) {
  const cityNorm = normalizeText(targetCity);
  if (!cityNorm) return true;
  return normalizeText(locationText).includes(cityNorm);
}

/**
 * Escanea una URL general de Festivales (multi-ciudad) y devuelve solo los conciertos que suceden en la ciudad seleccionada.
 */
async function scrapeFestivalUrl(targetUrl, targetCity, referenceDate) {
  const events = [];
  const seenKeys = new Set();

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 12000);
    const $ = cheerio.load(html);
    const h1Text = ($('h1').first().text() || '').replace(/\s+/g, ' ').trim();
    const titleTagText = ($('title').text() || '').replace(/\s+/g, ' ').trim();
    const isGenericH1 = /^(conciertos|agenda|eventos|programaci[oó]n|inicio|home)$/i.test(h1Text);
    const pageTitle = (!isGenericH1 && h1Text) ? h1Text : (titleTagText || h1Text || getCleanHostname(targetUrl));

    // 1. Extraer eventos desde Schema.org JSON-LD (Event / MusicEvent / Festival)
    $('script[type="application/ld+json"]').each((_, sEl) => {
      try {
        const parsed = JSON.parse($(sEl).html());
        const nodes = parsed['@graph'] ? parsed['@graph'] : (Array.isArray(parsed) ? parsed : [parsed]);
        for (const item of nodes) {
          const t = String(item['@type'] || '');
          if (!/Event|Festival/i.test(t) || !item.name) continue;

          const title = String(item.name).replace(/\s+/g, ' ').trim();
          const desc = String(item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const locObj = Array.isArray(item.location) ? item.location[0] : item.location;
          const locName = String(locObj?.name || '').trim();
          const locCity = typeof locObj?.address === 'string'
            ? locObj.address
            : [locObj?.address?.streetAddress, locObj?.address?.addressLocality, locObj?.address?.addressRegion]
                .filter(Boolean)
                .join(' ');
          const locationCheckStr = `${locCity} ${locName} ${title} ${desc} ${item.url || ''}`;
          if (!eventMatchesCity(locationCheckStr, targetCity)) continue;

          const itemUrl = item.url ? new URL(item.url, targetUrl).toString() : targetUrl;
          let dateStr = formatDateYMD(referenceDate);
          let timeStr = '20:00';
          if (item.startDate) {
            const m = String(item.startDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}:\d{2})/);
            if (m) {
              dateStr = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
              timeStr = m[4].padStart(5, '0');
            } else {
              dateStr = formatDateYMD(parseSpanishDateText(String(item.startDate), '', referenceDate));
            }
          }

          const dedupKey = `${itemUrl}|${dateStr}|${normalizeText(title)}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          const festSourceName = item.superEvent?.name || (/festival/i.test(title) ? title : pageTitle);
          const fMeta = resolveFestivalTagAndColor(festSourceName);
          const vMeta = resolveVenueTagAndColor(locName || locCity, targetCity);
          const musicStyle = extractStyleFromDescription(title, desc);

          events.push({
            id: `fest-${Buffer.from(itemUrl + title).toString('base64').slice(0, 18)}-${dateStr}`,
            title,
            artistName: cleanArtistOrGroupName(title),
            musicStyle,
            date: dateStr,
            time: timeStr,
            venue: vMeta.venueName,
            venueTag: vMeta.venueTag,
            venueColor: vMeta.venueColor,
            isFestival: true,
            festivalName: fMeta.festivalName,
            festivalTag: fMeta.festivalTag,
            festivalColor: fMeta.festivalColor,
            url: itemUrl,
            actionLabel: 'Ir a Más info',
            section: 'A',
            subType: 'Conciertos',
            hasOriginalSource: true,
            prioritySource: 2,
            sourceName: getCleanHostname(itemUrl),
            price: item.offers?.price !== undefined ? (item.offers.price === 0 ? 'Gratis' : `${item.offers.price} €`) : 'Ver web'
          });
        }
      } catch (_) {}
    });

    // 2. Respaldo HTML si la página de festivales lista tarjetas/enlaces con fechas y ciudad
    if (events.length === 0) {
      $('article, .event, .card, .wrap, .item-evento, li').each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text.length < 15 || text.length > 450) return;
        if (!eventMatchesCity(text, targetCity)) return;

        const $link = $el.find('a').first();
        const href = $link.attr('href');
        if (!href) return;
        const fullUrl = new URL(href, targetUrl).toString();
        const title = ($el.find('h2, h3, h4, .nombre, a').first().text() || '').replace(/\s+/g, ' ').trim();
        if (!title || title.length < 3) return;

        const dateObj = parseSpanishDateText(text, href, referenceDate);
        const dateStr = formatDateYMD(dateObj);
        const dedupKey = `${fullUrl}|${dateStr}|${normalizeText(title)}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        const fMeta = resolveFestivalTagAndColor(/festival/i.test(title) ? title : pageTitle);
        const vMeta = resolveVenueTagAndColor(targetCity, targetCity);
        events.push({
          id: `fest-${Buffer.from(fullUrl + title).toString('base64').slice(0, 18)}-${dateStr}`,
          title,
          artistName: cleanArtistOrGroupName(title),
          musicStyle: extractStyleFromDescription(title, text),
          date: dateStr,
          time: extractTimeFromText(text),
          venue: vMeta.venueName,
          venueTag: vMeta.venueTag,
          venueColor: vMeta.venueColor,
          isFestival: true,
          festivalName: fMeta.festivalName,
          festivalTag: fMeta.festivalTag,
          festivalColor: fMeta.festivalColor,
          url: fullUrl,
          actionLabel: 'Ir a Más info',
          section: 'A',
          subType: 'Conciertos',
          hasOriginalSource: true,
          prioritySource: 2,
          sourceName: getCleanHostname(fullUrl),
          price: 'Ver web'
        });
      });
    }

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

async function scrapeGenericUrl(targetUrl, city, referenceDate) {
  const events = [];

  try {
    const html = await fetchHtmlWithTimeout(targetUrl, 9000);
    const $ = cheerio.load(html);

    // Extraer eventos estándar Schema.org JSON-LD sin navegación extra
    $('script[type="application/ld+json"]').each((_, sEl) => {
      try {
        const parsed = JSON.parse($(sEl).html());
        const nodes = parsed['@graph'] ? parsed['@graph'] : (Array.isArray(parsed) ? parsed : [parsed]);
        for (const item of nodes) {
          if (item['@type'] !== 'Event' || !item.name) continue;
          const title = String(item.name).replace(/\s+/g, ' ').trim();
          const desc = String(item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const itemUrl = item.url ? new URL(item.url, targetUrl).toString() : targetUrl;
          let dateStr = formatDateYMD(referenceDate);
          let timeStr = '20:00';
          if (item.startDate) {
            const m = String(item.startDate).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
            if (m) {
              dateStr = m[1];
              timeStr = m[2];
            } else {
              dateStr = formatDateYMD(parseSpanishDateText(String(item.startDate), '', referenceDate));
            }
          }
          const rawVenue = item.location?.name || '';
          const vMeta = resolveVenueTagAndColor(rawVenue, city);
          const showType = classifyShowTypeFromText(title, `${desc} ${rawVenue}`, 'Conciertos');
          const musicStyle = showType === 'Conciertos' ? extractStyleFromDescription(title, desc) : '';

          events.push({
            id: `gen-${Buffer.from(itemUrl + title).toString('base64').slice(0, 20)}-${dateStr}`,
            title,
            artistName: cleanArtistOrGroupName(title),
            musicStyle,
            date: dateStr,
            time: timeStr,
            venue: vMeta.venueName,
            venueTag: vMeta.venueTag,
            venueColor: vMeta.venueColor,
            url: itemUrl,
            section: 'A',
            subType: showType || 'Conciertos',
            hasOriginalSource: true,
            prioritySource: 2,
            sourceName: getCleanHostname(itemUrl),
            price: item.offers?.price !== undefined ? (item.offers.price === 0 ? 'Gratis' : `${item.offers.price} €`) : 'Ver web'
          });
        }
      } catch (_) {}
    });

    return { ok: true, targetUrl, count: events.length, events };
  } catch (err) {
    return { ok: false, targetUrl, error: err.message, count: 0, events: [] };
  }
}

function filterEventsByUserProfile(candidateEvents, preferences, referenceDate) {
  const refStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0);
  const oneYearLimit = addDays(refStart, 365);
  oneYearLimit.setHours(23, 59, 59, 999);

  const rawSelected = preferences?.A?.showTypes || VALID_SHOW_TYPES;
  const selectedShowTypes = rawSelected.map(normalizeShowType).filter(Boolean);
  const selectedVenueTags = preferences?.A?.selectedVenues || [];

  // Ordenar candidatos para que las fuentes directas de sala (prioritySource=1) se procesen primero que los agregadores
  const sortedCandidates = [...candidateEvents].sort((a, b) => (b.prioritySource || 0) - (a.prioritySource || 0));

  const accepted = [];
  const seenExactTitleKeys = new Set();
  const seenVenueArtistKeys = new Set();

  for (const ev of sortedCandidates) {
    if ((ev.sourceName || '').includes('bing.com') && ev.venueTag === 'OTROS ESCENARIOS') {
      continue;
    }

    const normalizedSub = normalizeShowType(ev.subType);
    if (!normalizedSub || !selectedShowTypes.includes(normalizedSub)) continue;

    if (normalizedSub === 'Conciertos' && Array.isArray(selectedVenueTags) && selectedVenueTags.length > 0) {
      if (!selectedVenueTags.includes(ev.venueTag)) continue;
    }

    const [y, m, d] = (ev.date || '').split('-').map(Number);
    const evDate = new Date(y, m - 1, d, 12, 0, 0);
    if (isNaN(evDate.getTime())) continue;

    if (evDate.getTime() < refStart.getTime() || evDate.getTime() > oneYearLimit.getTime()) {
      continue;
    }

    ev.subType = normalizedSub;
    ev.section = 'A';

    if (normalizedSub === 'Conciertos') {
      const sMeta = resolveStyleTagAndColor(ev.musicStyle);
      ev.styleTag = sMeta.styleTag;
      ev.styleColor = sMeta.styleColor;
    }

    // Deduplicación 1: Mismo día y título normalizado
    const titleKey = `${ev.date}|${normalizeText(ev.title).slice(0, 40)}`;
    if (seenExactTitleKeys.has(titleKey)) continue;

    // Deduplicación 2: Mismo día + misma Sala (TAG) + misma huella de Artista/Grupo
    const artistFp = buildArtistDedupFingerprint(ev.title);
    const venueArtistKey = `${ev.date}|${ev.venueTag || ''}|${artistFp}`;
    if (artistFp.length >= 3 && seenVenueArtistKeys.has(venueArtistKey)) {
      continue;
    }

    seenExactTitleKeys.add(titleKey);
    if (artistFp.length >= 3) {
      seenVenueArtistKeys.add(venueArtistKey);
    }

    accepted.push(ev);
  }

  accepted.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return accepted;
}

function extractVenuesCatalogByType(allEvents, showType) {
  const venueMap = new Map();
  for (const ev of allEvents) {
    if (normalizeShowType(ev.subType) !== showType) continue;
    const tag = ev.venueTag || 'OTROS ESCENARIOS';
    if (!venueMap.has(tag)) {
      venueMap.set(tag, {
        tag,
        name: ev.venue || tag,
        color: ev.venueColor || '#6366f1',
        count: 0
      });
    }
    venueMap.get(tag).count += 1;
  }
  return Array.from(venueMap.values()).sort((a, b) => b.count - a.count);
}

function extractConcertVenuesCatalog(allEvents) {
  return extractVenuesCatalogByType(allEvents, 'Conciertos');
}

function extractTheaterVenuesCatalog(allEvents) {
  return extractVenuesCatalogByType(allEvents, 'Teatro');
}

function extractExhibitionVenuesCatalog(allEvents) {
  return extractVenuesCatalogByType(allEvents, 'Exposiciones');
}

/**
 * Extrae el catálogo de Estilos Musicales detectados en las descripciones de los conciertos (con su TAG, Color y contador)
 */
function extractConcertStylesCatalog(allEvents) {
  const styleMap = new Map();
  for (const ev of allEvents) {
    if (normalizeShowType(ev.subType) !== 'Conciertos') continue;
    const sMeta = resolveStyleTagAndColor(ev.musicStyle);
    const tag = sMeta.styleTag;
    if (!styleMap.has(tag)) {
      styleMap.set(tag, {
        tag,
        name: sMeta.styleName,
        color: sMeta.styleColor,
        count: 0
      });
    }
    styleMap.get(tag).count += 1;
  }
  return Array.from(styleMap.values()).sort((a, b) => b.count - a.count);
}

function extractConcertFestivalsCatalog(allEvents) {
  const festMap = new Map();
  for (const ev of allEvents) {
    if (normalizeShowType(ev.subType) !== 'Conciertos' || !ev.isFestival) continue;
    const tag = ev.festivalTag || 'FESTIVAL';
    if (!festMap.has(tag)) {
      festMap.set(tag, {
        tag,
        name: ev.festivalName || tag,
        color: ev.festivalColor || '#ec4899',
        count: 0
      });
    }
    festMap.get(tag).count += 1;
  }
  return Array.from(festMap.values()).sort((a, b) => b.count - a.count);
}

async function runCalendarUpdate({ cityConfig, festivalUrls = [], preferences, userEmail, referenceDate = new Date() }) {
  const logs = [];
  const city = cityConfig.name || 'Zaragoza';
  const urls = Array.isArray(cityConfig.urls)
    ? cityConfig.urls.map(u => String(u || '').trim()).filter(Boolean)
    : [];
  const cleanFestivalUrls = Array.isArray(festivalUrls)
    ? festivalUrls.map(u => String(u || '').trim()).filter(Boolean)
    : [];

  const rawSelected = preferences?.A?.showTypes || VALID_SHOW_TYPES;
  const selectedShowTypes = [...new Set(rawSelected.map(normalizeShowType).filter(Boolean))];

  if (userEmail) {
    logs.push(`👤 Usuario Google activo (Agenda e IA): ${userEmail}`);
  }
  logs.push(`🚀 Iniciando búsqueda de Espectáculos (A) para ${city}`);
  logs.push(`🔗 URLs configuradas para ${city}: ${urls.join(', ') || 'Ninguna'}`);
  if (cleanFestivalUrls.length > 0) {
    logs.push(`🎪 URLs generales de Festivales: ${cleanFestivalUrls.join(', ')}`);
  }
  logs.push(`🎭 Tipos seleccionados: ${selectedShowTypes.join(', ') || 'Ninguno'}`);

  if (selectedShowTypes.length === 0 || (urls.length === 0 && cleanFestivalUrls.length === 0)) {
    if (urls.length === 0 && cleanFestivalUrls.length === 0) {
      logs.push(`⚠️ No hay URLs definidas en la caja de "URLs principales para esta ciudad".`);
    }
    return {
      updatedAt: new Date().toISOString(),
      city,
      referenceDate: formatDateYMD(referenceDate),
      oneYearHorizon: formatDateYMD(addDays(referenceDate, 365)),
      totalScanned: 0,
      totalMatched: 0,
      logs,
      concertVenues: [],
      theaterVenues: [],
      exhibitionVenues: [],
      concertStyles: [],
      concertFestivals: [],
      events: []
    };
  }

  const allCollected = [];

  const scrapeResults = await Promise.all(
    urls.map(async (rawUrl) => {
      const cleanBase = rawUrl.replace(/\/$/, '');

      if (cleanBase.includes('vivezaragoza.es')) {
        const res = await scrapeViveZaragoza(rawUrl, selectedShowTypes, city, referenceDate);
        return { label: 'Vive Zaragoza', res };
      }
      if (cleanBase.includes('locozaragozadiscoteca.com')) {
        const res = await scrapeLocoZaragoza(rawUrl, city, referenceDate);
        return { label: 'Sala [LOCO ZARAGOZA]', res };
      }
      if (cleanBase.includes('salalopez.com')) {
        const res = await scrapeSalaLopez(rawUrl, city, referenceDate);
        return { label: 'Sala [SALA LÓPEZ]', res };
      }
      if (cleanBase.includes('rockandbluescafe.com')) {
        const res = await scrapeRockAndBlues(rawUrl, city, referenceDate);
        return { label: 'Sala [ROCK & BLUES]', res };
      }
      if (cleanBase.includes('auditoriozaragoza.com')) {
        const res = await scrapeAuditorioZaragoza(rawUrl, city, referenceDate);
        return { label: 'Sala [AUDITORIO ZGZ]', res };
      }
      if (cleanBase.includes('aragonenvivo.com')) {
        const res = await scrapeAragonEnVivo(cleanBase, city, referenceDate);
        return { label: 'Aragón en Vivo', res };
      }
      if (cleanBase.includes('esmadrid.com')) {
        const res = await scrapeEsMadrid(rawUrl, city, referenceDate);
        return { label: 'esMADRID', res };
      }
      if (cleanBase.includes('madridenvivo.com')) {
        const res = await scrapeMadridEnVivo(rawUrl, city, referenceDate);
        return { label: 'Madrid en Vivo', res };
      }
      if (cleanBase.includes('conciertos.club') || cleanBase.includes('escenaensevilla.es') || cleanBase.includes('conciertosengranada.es')) {
        const res = await scrapeConciertosClub(rawUrl, city, referenceDate);
        const label = cleanBase.includes('escenaensevilla.es')
          ? 'Escena en Sevilla'
          : (cleanBase.includes('conciertosengranada.es') ? 'Conciertos en Granada' : 'Conciertos.club');
        return { label, res };
      }
      const res = await scrapeGenericUrl(rawUrl, city, referenceDate);
      return { label: getCleanHostname(rawUrl), res };
    })
  );

  for (const { label, res } of scrapeResults) {
    if (res.ok) {
      logs.push(`✓ Escaneado ${label} (${res.targetUrl}): ${res.count} eventos extraídos`);
      allCollected.push(...res.events);
    } else {
      logs.push(`⚠ Aviso en ${label} (${res.targetUrl}): ${res.error}`);
    }
  }

  // Escanear siempre el apartado general de Festivales y filtrar los que suceden en la ciudad seleccionada
  if (cleanFestivalUrls.length > 0 && selectedShowTypes.includes('Conciertos')) {
    const festResults = await Promise.all(
      cleanFestivalUrls.map(fUrl => scrapeFestivalUrl(fUrl, city, referenceDate))
    );
    for (const fr of festResults) {
      if (fr.ok) {
        logs.push(`🎪 Escaneado Festival (${fr.targetUrl}) para ${city}: ${fr.count} eventos en esta ciudad`);
        allCollected.push(...fr.events);
      } else {
        logs.push(`⚠ Aviso en Festival (${fr.targetUrl}): ${fr.error}`);
      }
    }
  }

  // Resolver una única vez la ficha de Vive Zaragoza (fecha, hora, lugar "Dónde", precio y enlace directo Más info / Comprar entradas)
  const vzEvents = allCollected.filter(e => e.url && e.url.includes('vivezaragoza.es/hoy/evento/'));
  if (vzEvents.length > 0) {
    await runWithConcurrency(vzEvents, 20, async (ev) => {
      const det = await fetchEventDetailOnClick(ev.url);
      ev.url = det.actionUrl || ev.url;
      ev.actionLabel = det.actionLabel || 'Ir a Más info';
      ev.sourceName = getCleanHostname(ev.url);
      if (det.date) ev.date = det.date;
      if (det.time) ev.time = det.time;
      if (det.price) ev.price = det.price;
      if (det.venue && !isInvalidVenueString(det.venue)) {
        const vMeta = resolveVenueTagAndColor(det.venue, city);
        ev.venue = vMeta.venueName;
        ev.venueTag = vMeta.venueTag;
        ev.venueColor = vMeta.venueColor;
      }
      if (ev.subType === 'Conciertos' && !ev.musicStyle && det.description) {
        const cleanVenue = ev.venue && !ev.venue.startsWith('Otros Escenarios') ? ev.venue : '';
        const textForStyle = cleanVenue ? det.description.split(cleanVenue).join(' ') : det.description;
        const fromDesc = extractStyleFromDescription(ev.title, textForStyle);
        if (fromDesc) ev.musicStyle = fromDesc;
      }
    });
  }

  // Clasificar estilos musicales con IA
  if (selectedShowTypes.includes('Conciertos')) {
    const aiStats = await classifyConcertStylesWithAI(allCollected, city);
    logs.push(`🤖 IA Estilos Musicales: ${aiStats.classified} conciertos catalogados (${aiStats.viaAi} por IA, ${aiStats.totalConcerts - aiStats.classified} sin especificar).`);
  }

  const allShowFiltered = filterEventsByUserProfile(
    allCollected,
    { A: { showTypes: selectedShowTypes, selectedVenues: [] } },
    referenceDate
  );
  const concertVenues = extractConcertVenuesCatalog(allShowFiltered);
  const theaterVenues = extractTheaterVenuesCatalog(allShowFiltered);
  const exhibitionVenues = extractExhibitionVenuesCatalog(allShowFiltered);
  const concertStyles = extractConcertStylesCatalog(allShowFiltered);
  const concertFestivals = extractConcertFestivalsCatalog(allShowFiltered);
  logs.push(`🎸 Salas con conciertos detectadas: ${concertVenues.map(v => `[${v.tag}: ${v.count}]`).join(', ')}`);
  if (concertFestivals.length > 0) {
    logs.push(`🎪 Festivales en ${city}: ${concertFestivals.map(f => `[${f.tag}: ${f.count}]`).join(', ')}`);
  }
  logs.push(`🎭 Teatros / Salas detectadas: ${theaterVenues.map(v => `[${v.tag}: ${v.count}]`).join(', ')}`);
  logs.push(`🖼️ Salas de Exposiciones detectadas: ${exhibitionVenues.map(v => `[${v.tag}: ${v.count}]`).join(', ')}`);
  logs.push(`🎵 Estilos musicales detectados en la descripción: ${concertStyles.map(s => `[${s.tag}: ${s.count}]`).join(', ')}`);

  const finalEvents = filterEventsByUserProfile(allCollected, preferences, referenceDate);
  logs.push(`🎯 Total eventos únicos añadidos al calendario (sin duplicados): ${finalEvents.length}`);

  return {
    updatedAt: new Date().toISOString(),
    city,
    referenceDate: formatDateYMD(referenceDate),
    oneYearHorizon: formatDateYMD(addDays(referenceDate, 365)),
    totalScanned: allCollected.length,
    totalMatched: finalEvents.length,
    concertVenues,
    theaterVenues,
    exhibitionVenues,
    concertStyles,
    concertFestivals,
    logs,
    events: finalEvents
  };
}

const clickedDetailCache = new Map();
const artistGenreCache = new Map();

function mapExternalGenreToStyleLabel(genreRaw) {
  const g = normalizeText(genreRaw);
  if (!g) return '';
  if (g.includes('rock') || g.includes('grunge') || g.includes('rockabilly')) return 'Rock';
  if (g.includes('jazz') || g.includes('swing') || g.includes('bossa')) return 'Jazz';
  if (g.includes('blues')) return 'Blues';
  if (g.includes('soul') || g.includes('funk') || g.includes('r&b') || g.includes('gospel')) return 'Soul / Funk';
  if (g.includes('classical') || g.includes('clasica') || g.includes('opera') || g.includes('orchestra')) return 'Clásica';
  if (g.includes('alternative') || g.includes('indie') || g.includes('shoegaze') || g.includes('new wave')) return 'Indie / Alternativo';
  if (g.includes('punk') || g.includes('hardcore')) return 'Punk';
  if (g.includes('metal') || g.includes('heavy')) return 'Metal / Heavy';
  if (g.includes('pop') || g.includes('synth')) return 'Pop';
  if (g.includes('hip-hop') || g.includes('hip hop') || g.includes('rap') || g.includes('trap') || g.includes('urbano') || g.includes('reggaeton')) return 'Urbano / Rap';
  if (g.includes('electronic') || g.includes('electronica') || g.includes('dance') || g.includes('house') || g.includes('techno') || g.includes('ambient')) return 'Electrónica';
  if (g.includes('flamenco') || g.includes('rumba') || g.includes('copla')) return 'Flamenco';
  if (g.includes('folk') || g.includes('singer/songwriter') || g.includes('cantautor') || g.includes('country') || g.includes('acoustic')) return 'Folk / Cantautor';
  if (g.includes('latin') || g.includes('salsa') || g.includes('reggae') || g.includes('ska') || g.includes('cumbia')) return 'Latino / Mestizaje';
  return '';
}

function extractArtistQueryForAI(rawTitle) {
  let clean = cleanArtistOrGroupName(rawTitle || '');
  const tributeMatch = clean.match(/tributo\s+a\s+([^()]+)/i) || clean.match(/homenaje\s+a\s+([^()]+)/i);
  if (tributeMatch) {
    clean = tributeMatch[1].trim();
  }
  clean = clean
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(en\s+zaragoza|concierto|gira|tour|presenta|ciclo|festival|202\d)\b/gi, ' ')
    .split(/[-–|+:]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

async function lookupArtistGenreWithItunes(artistName) {
  const query = extractArtistQueryForAI(artistName);
  if (!query || query.length < 2) return '';
  if (artistGenreCache.has(query)) return artistGenreCache.get(query);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const res = await fetch(
      `https://itunes.apple.com/search?entity=musicArtist&limit=1&term=${encodeURIComponent(query)}`,
      { signal: controller.signal, headers: { 'User-Agent': 'go2enjoy-bot/1.0' } }
    );
    clearTimeout(timer);
    if (!res.ok) {
      artistGenreCache.set(query, '');
      return '';
    }
    const json = await res.json();
    const primaryGenre = json?.results?.[0]?.primaryGenreName || '';
    const mapped = mapExternalGenreToStyleLabel(primaryGenre);
    artistGenreCache.set(query, mapped);
    return mapped;
  } catch (_) {
    artistGenreCache.set(query, '');
    return '';
  }
}

async function batchClassifyWithGemini(concerts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || concerts.length === 0) return new Map();

  const validStyles = STYLE_DETECTION_RULES.map(r => r.label);
  const items = concerts.slice(0, 180).map((c, idx) => `${idx}: ${c.title}`).join('\n');
  const prompt = `Clasifica cada concierto de esta lista en UNO de estos estilos exactos: ${validStyles.join(', ')}. Si no estás seguro, pon "". Responde SOLO un JSON objeto {"0": "Estilo", ...}.\n\n${items}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    clearTimeout(timer);
    if (!res.ok) return new Map();
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);
    const out = new Map();
    for (const [k, v] of Object.entries(parsed)) {
      if (validStyles.includes(v)) out.set(Number(k), v);
    }
    return out;
  } catch (_) {
    return new Map();
  }
}

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function classifyConcertStylesWithAI(events, city = 'Zaragoza') {
  const concerts = events.filter(e => normalizeShowType(e.subType) === 'Conciertos');

  // 1. Corregir sala si quedó en "Otros escenarios" leyendo el campo "Dónde" en la ficha de Vive Zaragoza
  const unknownVenueVz = concerts.filter(
    e => e.venueTag === 'OTROS ESCENARIOS' && e.url && e.url.includes('vivezaragoza.es/hoy/evento/')
  );
  if (unknownVenueVz.length > 0) {
    await runWithConcurrency(unknownVenueVz, 12, async (ev) => {
      const det = await fetchEventDetailOnClick(ev.url);
      if (det.venue && !isInvalidVenueString(det.venue)) {
        const vMeta = resolveVenueTagAndColor(det.venue, city);
        ev.venue = vMeta.venueName;
        ev.venueTag = vMeta.venueTag;
        ev.venueColor = vMeta.venueColor;
      }
    });
  }

  // 2. Clasificar estilos pendientes con IA (Gemini si hay GEMINI_API_KEY + base musical inteligente iTunes)
  const pending = concerts.filter(e => !e.musicStyle);
  let viaAi = 0;

  if (pending.length > 0) {
    const geminiMap = await batchClassifyWithGemini(pending);
    geminiMap.forEach((styleLabel, idx) => {
      if (pending[idx] && styleLabel) {
        pending[idx].musicStyle = styleLabel;
        viaAi++;
      }
    });

    const stillPending = pending.filter(e => !e.musicStyle);
    await runWithConcurrency(stillPending, 20, async (ev) => {
      const style = await lookupArtistGenreWithItunes(ev.title);
      if (style) {
        ev.musicStyle = style;
        viaAi++;
      }
    });
  }

  const classified = concerts.filter(e => Boolean(e.musicStyle)).length;
  return { totalConcerts: concerts.length, classified, viaAi };
}

/**
 * Obtiene bajo demanda (al hacer click en un evento) la descripción, el lugar ("Dónde") y el enlace directo
 * del botón "Más info" o "Comprar entradas" sin pasar por vivezaragoza.es en el botón final.
 */
async function fetchEventDetailOnClick(eventUrl) {
  if (!eventUrl || !/^https?:\/\//i.test(eventUrl)) {
    return { description: 'Sin descripción disponible.', actionLabel: 'Ir a Más info', actionUrl: eventUrl || '#', venue: '' };
  }
  if (clickedDetailCache.has(eventUrl)) {
    return clickedDetailCache.get(eventUrl);
  }

  try {
    const html = await fetchHtmlWithTimeout(eventUrl, 7000);
    const $ = cheerio.load(html);

    let infoUrl = null;
    let ticketUrl = null;
    let ldDescription = '';
    let exactVenue = '';
    let exactDate = '';
    let exactTime = '';
    let exactPrice = '';

    // Extraer "Dónde" explícitamente de la ficha
    $('article dt').each((_, dtEl) => {
      if (/d[oó]nde/i.test($(dtEl).text())) {
        const ddText = $(dtEl).next('dd').find('a').first().text().trim() ||
                       $(dtEl).next('dd').clone().children().remove().end().text().trim();
        if (ddText && !isInvalidVenueString(ddText)) {
          exactVenue = ddText;
        }
      }
    });
    if (!exactVenue) {
      const lugarText = $('article a[href*="/hoy/lugar/"]').first().text().trim();
      if (lugarText && !isInvalidVenueString(lugarText)) {
        exactVenue = lugarText;
      }
    }

    $('article a, main a, a.btn, a.button, a.et_pb_button').each((_, aEl) => {
      const txt = $(aEl).text().replace(/\s+/g, ' ').trim();
      const href = $(aEl).attr('href');
      if (!href || !href.startsWith('http')) return;
      if (href.includes('calendar.google.com') || href.includes('vivezaragoza.es')) return;
      if (/facebook\.com\/sharer|twitter\.com\/intent|whatsapp\.com|t\.me\/share/i.test(href)) return;

      if (/m[aá]s\s+info|m[aá]s\s+informaci[oó]n|m[aá]s\s+datos|web\s+oficial|ver\s+en/i.test(txt)) {
        if (!infoUrl) infoUrl = href;
      } else if (/comprar\s+entradas|entradas|tickets/i.test(txt)) {
        if (!ticketUrl) ticketUrl = href;
      }
    });

    $('script[type="application/ld+json"]').each((_, sEl) => {
      try {
        const parsed = JSON.parse($(sEl).html());
        const nodes = parsed['@graph'] ? parsed['@graph'] : (Array.isArray(parsed) ? parsed : [parsed]);
        for (const node of nodes) {
          if (node['@type'] === 'Event') {
            if (node.description && !ldDescription) {
              ldDescription = String(node.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            }
            if (!exactVenue && node.location?.name && !isInvalidVenueString(node.location.name)) {
              exactVenue = node.location.name;
            }
            if (node.startDate) {
              const isoD = String(node.startDate).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
              if (isoD) {
                exactDate = isoD[1];
                exactTime = isoD[2];
              }
            }
            if (node.offers?.price !== undefined) {
              exactPrice = node.offers.price === 0 ? 'Gratis' : `${node.offers.price} €`;
            }
            if (!ticketUrl && node.offers?.url && !String(node.offers.url).includes('vivezaragoza.es')) {
              ticketUrl = node.offers.url;
            }
          }
        }
      } catch (_) {}
    });

    const pText = $('article p, .entry-content p').map((_, p) => $(p).text().trim()).get().filter(t => t.length > 25).join(' ').replace(/\s+/g, ' ').trim();
    const metaDesc = ($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '').trim();
    const rawDesc = (pText || ldDescription || metaDesc || 'Sin descripción disponible.').trim();
    const description = rawDesc.length > 650 ? rawDesc.slice(0, 647) + '...' : rawDesc;

    let actionLabel = 'Ir a Más info';
    let actionUrl = eventUrl;
    if (infoUrl) {
      actionLabel = 'Ir a Más info';
      actionUrl = infoUrl;
    } else if (ticketUrl) {
      actionLabel = 'Comprar entradas';
      actionUrl = ticketUrl;
    }

    const result = { description, actionLabel, actionUrl, venue: exactVenue, date: exactDate, time: exactTime, price: exactPrice };
    clickedDetailCache.set(eventUrl, result);
    return result;
  } catch (_) {
    return { description: 'Sin descripción disponible.', actionLabel: 'Ir a Más info', actionUrl: eventUrl, venue: '', date: '', time: '', price: '' };
  }
}

module.exports = {
  runCalendarUpdate,
  filterEventsByUserProfile,
  fetchEventDetailOnClick,
  scrapeAragonEnVivo,
  scrapeLocoZaragoza,
  scrapeSalaLopez,
  scrapeRockAndBlues,
  scrapeAuditorioZaragoza,
  scrapeEsMadrid,
  scrapeMadridEnVivo,
  scrapeConciertosClub,
  scrapeFestivalUrl,
  scrapeGenericUrl,
  resolveVenueTagAndColor,
  resolveStyleTagAndColor,
  resolveFestivalTagAndColor,
  extractConcertVenuesCatalog,
  extractTheaterVenuesCatalog,
  extractExhibitionVenuesCatalog,
  extractConcertStylesCatalog,
  extractConcertFestivalsCatalog,
  parseSpanishDateText,
  formatDateYMD,
  addDays,
  VALID_SHOW_TYPES
};
