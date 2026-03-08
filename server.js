/**
 * server.js — Matchday Sports Broadcast Tracker
 * Data: API-Sports (api-sports.io) — free tier, 100 req/day
 * Run: npm install && npm run dev
 */

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── API KEY ──────────────────────────────────────────────────────
const API_KEY = process.env.API_SPORTS_KEY || '';

// API-Sports base URLs (one per sport)
const APIS = {
  football: 'v3.football.api-sports.io',
  rugby:    'v1.rugby.api-sports.io',
  cricket:  'v1.cricket.api-sports.io',
  formula1: 'v1.formula-1.api-sports.io',
};

// ─── CACHE (10 min) ───────────────────────────────────────────────
const cache    = new Map();
const CACHE_MS = 10 * 60 * 1000;

function getCache(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) { cache.delete(key); return null; }
  return e.data;
}
function setCache(key, data) { cache.set(key, { data, ts: Date.now() }); }

// ─── HTTP (with API-Sports header auth) ───────────────────────────
function fetchJSON(host, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path,
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'Accept': 'application/json',
      }
    };
    https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject).end();
  });
}

// ─── SA BROADCASTERS ─────────────────────────────────────────────
function getSABroadcasters(sport, league = '') {
  const l = league.toLowerCase();
  if (l.includes('premier league') || l.includes('epl'))            return ['SuperSport PSL', 'DStv Now'];
  if (l.includes('dstv prem') || l.includes('psl') || l.includes('south africa premier')) return ['SuperSport PSL', 'SABC Sport', 'DStv Now'];
  if (l.includes('champions league') || l.includes('ucl'))          return ['SuperSport UCL', 'DStv Now'];
  if (l.includes('la liga'))                                         return ['SuperSport La Liga', 'DStv Now'];
  if (l.includes('bundesliga'))                                      return ['SuperSport Football', 'DStv Now'];
  if (l.includes('serie a'))                                         return ['SuperSport Football', 'DStv Now'];
  if (l.includes('urc') || l.includes('united rugby'))              return ['SuperSport Rugby', 'DStv Now'];
  if (l.includes('currie') || l.includes('springbok'))              return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('rugby championship') || l.includes('rugby world')) return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('formula') || l.includes('grand prix') || l.includes('f1')) return ['SuperSport Motorsport', 'DStv Now'];
  if (l.includes('pga') || l.includes('masters') || l.includes('open championship')) return ['SuperSport Golf', 'DStv Now'];
  if (l.includes('atp') || l.includes('wta') || l.includes('wimbledon') || l.includes('slam')) return ['SuperSport Tennis', 'DStv Now'];
  if (l.includes('nba'))                                             return ['SuperSport Variety', 'DStv Now'];
  if (l.includes('ipl') || l.includes('india') || l.includes('cricket sa') || l.includes('protea')) return ['SuperSport Cricket', 'SABC Sport', 'DStv Now'];
  const defaults = {
    Soccer:     ['SuperSport Football', 'DStv Now'],
    Rugby:      ['SuperSport Rugby', 'DStv Now'],
    Cricket:    ['SuperSport Cricket', 'DStv Now'],
    Tennis:     ['SuperSport Tennis', 'DStv Now'],
    F1:         ['SuperSport Motorsport', 'DStv Now'],
    Golf:       ['SuperSport Golf', 'DStv Now'],
    Basketball: ['SuperSport Variety', 'DStv Now'],
    Football:   ['SuperSport Variety', 'DStv Now'],
  };
  return defaults[sport] || ['DStv Now'];
}

const DURATIONS = {
  Soccer: 105, Rugby: 110, Cricket: 480, Tennis: 150,
  F1: 120, Golf: 480, Basketball: 150, Football: 210, Baseball: 200
};

// ─── LEAGUE IDs for the sports we care about ──────────────────────
// Football (soccer) league IDs on API-Football
const FOOTBALL_LEAGUES = [
  { id: 207,  name: 'DStv Premiership',       sport: 'Soccer' },
  { id: 39,   name: 'English Premier League', sport: 'Soccer' },
  { id: 140,  name: 'La Liga',                sport: 'Soccer' },
  { id: 2,    name: 'UEFA Champions League',  sport: 'Soccer' },
  { id: 61,   name: 'Ligue 1',                sport: 'Soccer' },
  { id: 78,   name: 'Bundesliga',             sport: 'Soccer' },
  { id: 135,  name: 'Serie A',                sport: 'Soccer' },
];

// Rugby league IDs on API-Rugby
const RUGBY_LEAGUES = [
  { id: 5,   name: 'United Rugby Championship' },
  { id: 6,   name: 'Rugby Championship'        },
  { id: 11,  name: 'Currie Cup'                },
  { id: 1,   name: 'Six Nations'               },
  { id: 3,   name: 'Rugby World Cup'           },
];

// ─── FETCH: Football fixtures by date ────────────────────────────
async function fetchFootball(dateStr) {
  const key = `football_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;

  const results = [];
  for (const league of FOOTBALL_LEAGUES) {
    try {
      const data = await fetchJSON(
        APIS.football,
        `/fixtures?date=${dateStr}&league=${league.id}&season=${getSeason('Soccer')}`
      );
      const fixtures = data?.response || [];
      fixtures.forEach((f, i) => {
        const home = f.teams?.home?.name || '';
        const away = f.teams?.away?.name || '';
        const timeUTC = f.fixture?.date || `${dateStr}T00:00:00+00:00`;
        results.push({
          id:           String(f.fixture?.id || `fb_${league.id}_${i}`),
          sport:        'Soccer',
          title:        home && away ? `${home} vs ${away}` : f.fixture?.referee || 'Match',
          league:       f.league?.name || league.name,
          venue:        f.fixture?.venue?.name || f.fixture?.venue?.city || 'TBC',
          time:         new Date(timeUTC).toISOString(),
          duration:     105,
          broadcasters: getSABroadcasters('Soccer', f.league?.name || league.name),
        });
      });
    } catch (err) {
      console.error(`[Football league ${league.id}]`, err.message);
    }
  }
  setCache(key, results);
  return results;
}

// ─── FETCH: Rugby fixtures by date ───────────────────────────────
async function fetchRugby(dateStr) {
  const key = `rugby_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;

  const results = [];
  for (const league of RUGBY_LEAGUES) {
    try {
      const data = await fetchJSON(
        APIS.rugby,
        `/games?date=${dateStr}&league=${league.id}&season=${getSeason('Rugby')}`
      );
      const games = data?.response || [];
      games.forEach((g, i) => {
        const home = g.teams?.home?.name || '';
        const away = g.teams?.away?.name || '';
        const timeUTC = g.date ? `${g.date}T${g.time || '00:00'}:00Z` : `${dateStr}T00:00:00Z`;
        results.push({
          id:           String(g.id || `rug_${league.id}_${i}`),
          sport:        'Rugby',
          title:        home && away ? `${home} vs ${away}` : 'Match',
          league:       g.league?.name || league.name,
          venue:        g.country?.name || 'TBC',
          time:         new Date(timeUTC).toISOString(),
          duration:     110,
          broadcasters: getSABroadcasters('Rugby', g.league?.name || league.name),
        });
      });
    } catch (err) {
      console.error(`[Rugby league ${league.id}]`, err.message);
    }
  }
  setCache(key, results);
  return results;
}

// ─── FETCH: F1 races by date ──────────────────────────────────────
async function fetchF1(dateStr) {
  const key = `f1_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;

  try {
    const season = new Date(dateStr).getFullYear();
    const data   = await fetchJSON(APIS.formula1, `/races?season=${season}`);
    const races  = (data?.response || []).filter(r => r.date === dateStr || r.date?.startsWith(dateStr));
    const results = races.map((r, i) => ({
      id:           String(r.id || `f1_${i}`),
      sport:        'F1',
      title:        r.competition?.name || r.name || 'Grand Prix',
      league:       'Formula 1',
      venue:        r.circuit?.name || r.competition?.location?.city || 'TBC',
      time:         r.date ? new Date(`${r.date}T${r.time || '00:00:00'}`).toISOString() : `${dateStr}T00:00:00Z`,
      duration:     120,
      broadcasters: getSABroadcasters('F1', 'Formula 1'),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[F1]', err.message);
    return [];
  }
}

// ─── FETCH: Cricket by date ───────────────────────────────────────
async function fetchCricket(dateStr) {
  const key = `cricket_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;

  try {
    const data  = await fetchJSON(APIS.cricket, `/fixtures?date=${dateStr}`);
    const games = data?.response || [];
    const results = games.map((g, i) => {
      const home = g.teams?.home?.name || '';
      const away = g.teams?.away?.name || '';
      return {
        id:           String(g.id || `cr_${i}`),
        sport:        'Cricket',
        title:        home && away ? `${home} vs ${away}` : g.name || 'Match',
        league:       g.league?.name || 'Cricket',
        venue:        g.venue?.name || g.country?.name || 'TBC',
        time:         g.date ? new Date(g.date).toISOString() : `${dateStr}T00:00:00Z`,
        duration:     480,
        broadcasters: getSABroadcasters('Cricket', g.league?.name || ''),
      };
    });
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[Cricket]', err.message);
    return [];
  }
}

// ─── SEASON HELPER ────────────────────────────────────────────────
function getSeason(sport) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (sport === 'Soccer') {
    // European leagues run Aug-May, so Jan-Jul = previous year's season
    return month >= 8 ? year : year - 1;
  }
  if (sport === 'Rugby') {
    // URC/Currie Cup run roughly the same as football
    return month >= 8 ? year : year - 1;
  }
  // F1, Cricket default to calendar year
  return year;
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, fp) {
    if (fp.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
    }
    if (fp.endsWith('manifest.json')) res.setHeader('Content-Type', 'application/manifest+json');
  }
}));

// ─── GET /api/events ──────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      status: 'error',
      message: 'API_SPORTS_KEY environment variable not set. Add it to your .env file or Render config.',
      events: []
    });
  }

  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`[/api/events] date=${dateStr}`);

    // Fetch all sports in parallel
    const [football, rugby, f1, cricket] = await Promise.allSettled([
      fetchFootball(dateStr),
      fetchRugby(dateStr),
      fetchF1(dateStr),
      fetchCricket(dateStr),
    ]);

    const getValue = r => r.status === 'fulfilled' ? r.value : [];
    let events = [
      ...getValue(football),
      ...getValue(rugby),
      ...getValue(f1),
      ...getValue(cricket),
    ];

    // Deduplicate by id
    const seen = new Set();
    events = events.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id); return true;
    });

    // Sport filter
    if (req.query.sport) {
      events = events.filter(e => e.sport.toLowerCase() === req.query.sport.toLowerCase());
    }

    // Sort by time
    events.sort((a, b) => new Date(a.time) - new Date(b.time));

    console.log(`[/api/events] returning ${events.length} events`);
    res.json({ status: 'ok', date: dateStr, count: events.length, events });

  } catch (err) {
    console.error('[/api/events]', err);
    res.status(500).json({ status: 'error', message: err.message, events: [] });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apiKeySet: !!API_KEY,
    cacheSize: cache.size
  });
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ⚽  MATCHDAY — Sports Broadcast Tracker  🇿🇦');
  console.log(`  🚀  http://localhost:${PORT}`);
  console.log(`  🔑  API key: ${API_KEY ? '✅ set' : '❌ NOT SET — add API_SPORTS_KEY to .env'}`);
  console.log('');
});

module.exports = app;
