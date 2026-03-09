/**
 * server.js — Matchday Sports Broadcast Tracker
 * Sources:
 *   - BallDontLie API (NBA, NFL, Soccer, F1, PGA Golf)
 *   - TheSportsDB v1 free (Rugby, Cricket)
 */

const express = require('express');
const path    = require('path');
const https   = require('https');
const http    = require('http');

const app  = express();
const PORT = process.env.PORT || 3000;

const BDL_KEY = process.env.BDL_KEY || '';
const TSDB_KEY = '1'; // TheSportsDB free public key

// ─── CACHE (15 min) ───────────────────────────────────────────────
const cache    = new Map();
const CACHE_MS = 15 * 60 * 1000;
function getCache(k) {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) { cache.delete(k); return null; }
  return e.data;
}
function setCache(k, d) { cache.set(k, { data: d, ts: Date.now() }); }

// ─── HTTP HELPER ──────────────────────────────────────────────────
function fetchJSON(hostname, urlPath, headers = {}, useHttp = false) {
  return new Promise((resolve, reject) => {
    const lib = useHttp ? http : https;
    const options = { hostname, path: urlPath, method: 'GET', headers: { 'Accept': 'application/json', ...headers } };
    lib.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse failed for ${hostname}${urlPath}: ${raw.slice(0,200)}`)); }
      });
    }).on('error', reject).end();
  });
}

// BallDontLie helper
function bdlFetch(path) {
  return fetchJSON('api.balldontlie.io', path, { 'Authorization': BDL_KEY });
}

// TheSportsDB helper
function tsdbFetch(path) {
  return fetchJSON('www.thesportsdb.com', path);
}

// ─── SA BROADCASTERS ─────────────────────────────────────────────
function getSABroadcasters(sport, league = '') {
  const l = (league || '').toLowerCase();
  if (l.includes('premier league') || l.includes('epl'))             return ['SuperSport PSL', 'DStv Now'];
  if (l.includes('dstv prem') || l.includes('psl'))                  return ['SuperSport PSL', 'SABC Sport', 'DStv Now'];
  if (l.includes('champions league') || l.includes('ucl'))           return ['SuperSport UCL', 'DStv Now'];
  if (l.includes('la liga'))                                          return ['SuperSport La Liga', 'DStv Now'];
  if (l.includes('bundesliga'))                                       return ['SuperSport Football', 'DStv Now'];
  if (l.includes('serie a'))                                          return ['SuperSport Football', 'DStv Now'];
  if (l.includes('ligue 1'))                                          return ['SuperSport Football', 'DStv Now'];
  if (l.includes('mls'))                                              return ['SuperSport Variety', 'DStv Now'];
  if (l.includes('urc') || l.includes('united rugby'))               return ['SuperSport Rugby', 'DStv Now'];
  if (l.includes('currie') || l.includes('springbok'))               return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('rugby championship') || l.includes('rugby world')) return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('six nations'))                                      return ['SuperSport Rugby', 'DStv Now'];
  if (l.includes('formula') || l.includes('grand prix') || l.includes('f1')) return ['SuperSport Motorsport', 'DStv Now'];
  if (l.includes('pga') || l.includes('masters') || l.includes('golf'))      return ['SuperSport Golf', 'DStv Now'];
  if (l.includes('nba'))                                              return ['SuperSport Variety', 'DStv Now'];
  if (l.includes('nfl'))                                              return ['SuperSport Variety', 'DStv Now'];
  if (l.includes('ipl') || l.includes('cricket'))                    return ['SuperSport Cricket', 'DStv Now'];
  if (l.includes('protea') || l.includes('south africa'))            return ['SuperSport Cricket', 'SABC Sport', 'DStv Now'];
  const defaults = {
    Soccer: ['SuperSport Football', 'DStv Now'],
    Rugby:  ['SuperSport Rugby', 'DStv Now'],
    Cricket:['SuperSport Cricket', 'DStv Now'],
    F1:     ['SuperSport Motorsport', 'DStv Now'],
    Golf:   ['SuperSport Golf', 'DStv Now'],
    NBA:    ['SuperSport Variety', 'DStv Now'],
    NFL:    ['SuperSport Variety', 'DStv Now'],
  };
  return defaults[sport] || ['DStv Now'];
}

// ─── NBA (BallDontLie) ────────────────────────────────────────────
async function fetchNBA(dateStr) {
  const key = `nba_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const data = await bdlFetch(`/v1/games?dates[]=${dateStr}&per_page=50`);
    const games = data?.data || [];
    console.log(`[NBA] ${dateStr} -> ${games.length} games`);
    const results = games.map(g => ({
      id:           `nba_${g.id}`,
      sport:        'NBA',
      title:        `${g.visitor_team?.full_name || g.visitor_team?.name} vs ${g.home_team?.full_name || g.home_team?.name}`,
      league:       'NBA',
      venue:        g.home_team?.city || 'TBC',
      time:         g.datetime || g.date ? new Date(g.datetime || `${g.date}T00:00:00Z`).toISOString() : `${dateStr}T00:00:00Z`,
      duration:     150,
      status:       g.status,
      broadcasters: getSABroadcasters('NBA', 'NBA'),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[NBA]', err.message);
    return [];
  }
}

// ─── NFL (BallDontLie) ────────────────────────────────────────────
async function fetchNFL(dateStr) {
  const key = `nfl_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const data = await bdlFetch(`/nfl/v1/games?dates[]=${dateStr}&per_page=50`);
    const games = data?.data || [];
    console.log(`[NFL] ${dateStr} -> ${games.length} games`);
    const results = games.map(g => ({
      id:           `nfl_${g.id}`,
      sport:        'NFL',
      title:        `${g.away_team?.full_name || g.away_team?.name || 'Away'} vs ${g.home_team?.full_name || g.home_team?.name || 'Home'}`,
      league:       'NFL',
      venue:        g.venue || g.home_team?.city || 'TBC',
      time:         g.date_time ? new Date(g.date_time).toISOString() : `${dateStr}T00:00:00Z`,
      duration:     210,
      status:       g.status,
      broadcasters: getSABroadcasters('NFL', 'NFL'),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[NFL]', err.message);
    return [];
  }
}

// ─── SOCCER (BallDontLie — EPL, UCL, La Liga, Bundesliga, Serie A, Ligue 1) ──
const SOCCER_LEAGUES = [
  { key: 'epl',         path: '/epl/v2/games',         name: 'English Premier League' },
  { key: 'ucl',         path: '/ucl/v1/games',          name: 'UEFA Champions League'  },
  { key: 'laliga',      path: '/laliga/v1/games',       name: 'La Liga'                },
  { key: 'bundesliga',  path: '/bundesliga/v1/games',   name: 'Bundesliga'             },
  { key: 'seriea',      path: '/seriea/v1/games',       name: 'Serie A'                },
  { key: 'ligue1',      path: '/ligue1/v1/games',       name: 'Ligue 1'                },
];

async function fetchSoccer(dateStr) {
  const key = `soccer_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  const results = [];
  for (const league of SOCCER_LEAGUES) {
    try {
      const data = await bdlFetch(`${league.path}?dates[]=${dateStr}&per_page=50`);
      const games = data?.data || [];
      console.log(`[Soccer:${league.key}] ${dateStr} -> ${games.length} games`);
      games.forEach(g => {
        const home = g.home_team?.name || g.home_team?.full_name || 'Home';
        const away = g.away_team?.name || g.away_team?.full_name || 'Away';
        const dt = g.datetime || g.date_time || g.date;
        results.push({
          id:           `soccer_${league.key}_${g.id}`,
          sport:        'Soccer',
          title:        `${away} vs ${home}`,
          league:       g.league_name || league.name,
          venue:        g.venue || home || 'TBC',
          time:         dt ? new Date(dt).toISOString() : `${dateStr}T00:00:00Z`,
          duration:     105,
          status:       g.status,
          broadcasters: getSABroadcasters('Soccer', league.name),
        });
      });
    } catch (err) {
      console.error(`[Soccer:${league.key}]`, err.message);
    }
  }
  setCache(key, results);
  return results;
}

// ─── F1 (BallDontLie) ────────────────────────────────────────────
async function fetchF1(dateStr) {
  const key = `f1_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const year = dateStr.slice(0, 4);
    // Get all events for this season, filter to this date
    const data = await bdlFetch(`/f1/v1/events?season=${year}&per_page=50`);
    const events = data?.data || [];
    console.log(`[F1] season=${year} total events=${events.length}`);
    // Also fetch sessions for this date
    const sessData = await bdlFetch(`/f1/v1/sessions?per_page=50&season=${year}`);
    const sessions = (sessData?.data || []).filter(s => {
      const d = s.date_start || s.date || '';
      return d.startsWith(dateStr);
    });
    console.log(`[F1] sessions on ${dateStr} -> ${sessions.length}`);
    const results = sessions.map(s => ({
      id:           `f1_${s.id}`,
      sport:        'F1',
      title:        `F1: ${s.session_name || s.type || 'Session'} — ${s.event_name || s.circuit_short_name || 'Grand Prix'}`,
      league:       'Formula 1',
      venue:        s.circuit_short_name || s.location || 'TBC',
      time:         s.date_start ? new Date(s.date_start).toISOString() : `${dateStr}T00:00:00Z`,
      duration:     s.type === 'Race' ? 120 : 60,
      broadcasters: getSABroadcasters('F1', 'Formula 1'),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[F1]', err.message);
    return [];
  }
}

// ─── PGA GOLF (BallDontLie) ───────────────────────────────────────
async function fetchGolf(dateStr) {
  const key = `golf_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const year = dateStr.slice(0, 4);
    const data = await bdlFetch(`/pga/v1/tournaments?season=${year}&per_page=50`);
    const tournaments = data?.data || [];
    // Filter to tournaments active on this date
    const active = tournaments.filter(t => {
      const start = t.start_date || t.date;
      const end   = t.end_date;
      if (!start) return false;
      if (end) return dateStr >= start.slice(0,10) && dateStr <= end.slice(0,10);
      return start.slice(0,10) === dateStr;
    });
    console.log(`[Golf] ${dateStr} -> ${active.length} active tournaments`);
    const results = active.map(t => ({
      id:           `golf_${t.id}`,
      sport:        'Golf',
      title:        t.name || t.tournament_name || 'PGA Tournament',
      league:       'PGA Tour',
      venue:        t.course || t.venue || t.location || 'TBC',
      time:         t.start_date ? new Date(t.start_date).toISOString() : `${dateStr}T12:00:00Z`,
      duration:     480,
      broadcasters: getSABroadcasters('Golf', 'PGA'),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[Golf]', err.message);
    return [];
  }
}

// ─── RUGBY (TheSportsDB) ──────────────────────────────────────────
// TheSportsDB league IDs for rugby
const RUGBY_TSDB_LEAGUES = [
  { id: '4699', name: 'URC' },
  { id: '4655', name: 'Six Nations' },
  { id: '4653', name: 'Rugby Championship' },
  { id: '4961', name: 'Currie Cup' },
];

async function fetchRugby(dateStr) {
  const key = `rugby_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  const results = [];
  try {
    // TheSportsDB: events on a specific day
    const data = await tsdbFetch(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Rugby`);
    const events = data?.events || [];
    console.log(`[Rugby] TheSportsDB ${dateStr} -> ${events.length} events`);
    events.forEach(e => {
      const home = e.strHomeTeam || '';
      const away = e.strAwayTeam || '';
      results.push({
        id:           `rugby_${e.idEvent}`,
        sport:        'Rugby',
        title:        home && away ? `${away} vs ${home}` : e.strEvent || 'Match',
        league:       e.strLeague || 'Rugby',
        venue:        e.strVenue || e.strCountry || 'TBC',
        time:         e.strTimestamp || e.dateEvent ? new Date(e.strTimestamp || `${e.dateEvent}T${e.strTime || '00:00:00'}`).toISOString() : `${dateStr}T00:00:00Z`,
        duration:     110,
        broadcasters: getSABroadcasters('Rugby', e.strLeague || ''),
      });
    });
  } catch (err) {
    console.error('[Rugby]', err.message);
  }
  setCache(key, results);
  return results;
}

// ─── CRICKET (TheSportsDB) ────────────────────────────────────────
async function fetchCricket(dateStr) {
  const key = `cricket_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const data = await tsdbFetch(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Cricket`);
    const events = data?.events || [];
    console.log(`[Cricket] TheSportsDB ${dateStr} -> ${events.length} events`);
    const results = events.map(e => ({
      id:           `cricket_${e.idEvent}`,
      sport:        'Cricket',
      title:        e.strHomeTeam && e.strAwayTeam ? `${e.strAwayTeam} vs ${e.strHomeTeam}` : e.strEvent || 'Match',
      league:       e.strLeague || 'Cricket',
      venue:        e.strVenue || e.strCountry || 'TBC',
      time:         e.strTimestamp ? new Date(e.strTimestamp).toISOString() : `${dateStr}T00:00:00Z`,
      duration:     480,
      broadcasters: getSABroadcasters('Cricket', e.strLeague || ''),
    }));
    setCache(key, results);
    return results;
  } catch (err) {
    console.error('[Cricket]', err.message);
    return [];
  }
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
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`[/api/events] date=${dateStr}`);

    const [nba, nfl, soccer, f1, golf, rugby, cricket] = await Promise.allSettled([
      fetchNBA(dateStr),
      fetchNFL(dateStr),
      fetchSoccer(dateStr),
      fetchF1(dateStr),
      fetchGolf(dateStr),
      fetchRugby(dateStr),
      fetchCricket(dateStr),
    ]);

    const get = r => r.status === 'fulfilled' ? r.value : [];
    let events = [
      ...get(nba), ...get(nfl), ...get(soccer),
      ...get(f1),  ...get(golf), ...get(rugby), ...get(cricket),
    ];

    // Deduplicate
    const seen = new Set();
    events = events.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });

    // Sport filter
    if (req.query.sport) {
      events = events.filter(e => e.sport.toLowerCase() === req.query.sport.toLowerCase());
    }

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
    bdlKeySet: !!BDL_KEY,
    bdlKeyPreview: BDL_KEY ? BDL_KEY.slice(0,8)+'...' : 'NOT SET',
    cacheSize: cache.size,
    sources: ['BallDontLie (NBA/NFL/Soccer/F1/Golf)', 'TheSportsDB (Rugby/Cricket)']
  });
});

// ─── GET /api/test ─────────────────────────────────────────────────
app.get('/api/test', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const [nba, rugby] = await Promise.all([
      bdlFetch(`/v1/games?dates[]=${today}&per_page=5`),
      tsdbFetch(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${today}&s=Rugby`),
    ]);
    res.json({
      nba_count: nba?.data?.length ?? 'error',
      nba_errors: nba?.error,
      rugby_count: rugby?.events?.length ?? 0,
      rugby_null: rugby?.events === null,
    });
  } catch (err) {
    res.json({ error: err.message });
  }
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
  console.log(`  🔑  BDL key: ${BDL_KEY ? '✅ set' : '❌ NOT SET'}`);
  console.log(`  📡  Sources: BallDontLie + TheSportsDB`);
  console.log('');
});

module.exports = app;
