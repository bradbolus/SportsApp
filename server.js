/**
 * server.js — Matchday Sports Broadcast Tracker
 * Data: TheSportsDB (free, no API key needed)
 * Run: npm install && npm run dev
 */

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

const TSDB_V2 = 'https://www.thesportsdb.com/api/v2/json';
const TSDB_V1 = 'https://www.thesportsdb.com/api/v1/json/3';

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

// ─── HTTP ─────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Matchday/1.0' } }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse failed')); }
      });
    }).on('error', reject);
  });
}

// ─── SPORT NORMALISE ─────────────────────────────────────────────
function normaliseSport(s = '') {
  const v = s.toLowerCase();
  if (v.includes('soccer') || (v.includes('football') && !v.includes('american') && !v.includes('rugby'))) return 'Soccer';
  if (v.includes('american football') || v.includes('nfl')) return 'Football';
  if (v.includes('rugby'))      return 'Rugby';
  if (v.includes('cricket'))    return 'Cricket';
  if (v.includes('tennis'))     return 'Tennis';
  if (v.includes('motorsport') || v.includes('formula') || v.includes('f1')) return 'F1';
  if (v.includes('golf'))       return 'Golf';
  if (v.includes('basketball')) return 'Basketball';
  if (v.includes('baseball'))   return 'Baseball';
  return s || 'Sport';
}

// ─── SA BROADCASTERS ─────────────────────────────────────────────
function getSABroadcasters(sport, league = '') {
  const l = league.toLowerCase();
  if (l.includes('premier league') || l.includes('epl'))   return ['SuperSport PL', 'DStv Now'];
  if (l.includes('champions league') || l.includes('ucl')) return ['SuperSport UCL', 'DStv Now'];
  if (l.includes('la liga'))    return ['SuperSport La Liga', 'DStv Now'];
  if (l.includes('bundesliga')) return ['SuperSport Football', 'DStv Now'];
  if (l.includes('serie a'))    return ['SuperSport Football', 'DStv Now'];
  if (l.includes('dstv prem') || l.includes('psl') || l.includes('south africa')) return ['SuperSport PSL', 'SABC Sport', 'DStv Now'];
  if (l.includes('urc') || l.includes('united rugby'))     return ['SuperSport Rugby', 'DStv Now'];
  if (l.includes('currie') || l.includes('springbok'))     return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('formula') || l.includes('grand prix'))   return ['SuperSport Motorsport', 'DStv Now'];
  if (l.includes('pga') || l.includes('masters'))          return ['SuperSport Golf', 'DStv Now'];
  if (l.includes('atp') || l.includes('wta') || l.includes('wimbledon')) return ['SuperSport Tennis', 'DStv Now'];
  if (l.includes('nba'))  return ['SuperSport Variety', 'DStv Now'];
  const defaults = {
    Soccer: ['SuperSport Football', 'DStv Now'], Rugby: ['SuperSport Rugby', 'DStv Now'],
    Cricket: ['SuperSport Cricket', 'DStv Now'], Tennis: ['SuperSport Tennis', 'DStv Now'],
    F1: ['SuperSport Motorsport', 'DStv Now'],   Golf: ['SuperSport Golf', 'DStv Now'],
    Basketball: ['SuperSport Variety', 'DStv Now'], Football: ['SuperSport Variety', 'DStv Now'],
  };
  return defaults[sport] || ['DStv Now'];
}

// ─── FETCH TV SCHEDULE ────────────────────────────────────────────
async function fetchTSDBTV(dateStr) {
  const key = `tv_${dateStr}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const url  = `${TSDB_V2}/filter/tv/day/${dateStr}`;
    console.log(`[TSDB] GET ${url}`);
    const data = await fetchJSON(url);
    const events = data?.event || data?.events || [];
    console.log(`[TSDB] ${events.length} events for ${dateStr}`);
    setCache(key, events);
    return events;
  } catch (err) {
    console.error('[TSDB TV]', err.message);
    return [];
  }
}

// ─── FETCH LEAGUE FIXTURES ────────────────────────────────────────
async function fetchTSDBLeague(leagueId) {
  const key = `league_${leagueId}`;
  const hit = getCache(key);
  if (hit) return hit;
  try {
    const data   = await fetchJSON(`${TSDB_V1}/eventsnextleague.php?id=${leagueId}`);
    const events = data?.events || [];
    setCache(key, events);
    return events;
  } catch (err) {
    console.error(`[TSDB League ${leagueId}]`, err.message);
    return [];
  }
}

const LEAGUES = [
  { id: '4347', sport: 'Soccer',  name: 'DStv Premiership' },
  { id: '4328', sport: 'Soccer',  name: 'English Premier League' },
  { id: '4335', sport: 'Soccer',  name: 'La Liga' },
  { id: '4480', sport: 'Soccer',  name: 'UEFA Champions League' },
  { id: '4551', sport: 'Rugby',   name: 'United Rugby Championship' },
  { id: '4549', sport: 'Rugby',   name: 'Currie Cup' },
  { id: '4424', sport: 'F1',      name: 'Formula 1' },
  { id: '4452', sport: 'Tennis',  name: 'ATP Tour' },
  { id: '4380', sport: 'Golf',    name: 'PGA Tour' },
];

const DURATIONS = { Soccer: 105, Rugby: 110, Cricket: 240, Tennis: 150, F1: 120, Golf: 480, Basketball: 150, Football: 210, Baseball: 200 };

// ─── NORMALISE EVENT ─────────────────────────────────────────────
function normaliseEvent(raw, idx) {
  const sport    = normaliseSport(raw.strSport || raw.strCategory || '');
  const homeTeam = raw.strHomeTeam || '';
  const awayTeam = raw.strAwayTeam || '';
  const title    = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : (raw.strEvent || 'Event');
  const league   = raw.strLeague || raw.strFilename || sport;

  let time = new Date();
  const dateStr = raw.strDate || raw.dateEvent || '';
  const timeStr = raw.strTime || '00:00:00';
  if (dateStr) time = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ':00' : timeStr}Z`);

  return {
    id:           String(raw.idEvent || `gen_${idx}`),
    sport,
    title,
    league,
    venue:        raw.strVenue || raw.strCountry || 'TBC',
    time:         time.toISOString(),
    duration:     DURATIONS[sport] || 120,
    broadcasters: getSABroadcasters(sport, league),
  };
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

    // 1. TV schedule for this date
    const tvRaw = await fetchTSDBTV(dateStr);

    // 2. League fixtures for this date
    const leagueResults = await Promise.allSettled(LEAGUES.map(l => fetchTSDBLeague(l.id)));
    const leagueFlat    = leagueResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(ev => (ev.dateEvent || ev.strDate || '').startsWith(dateStr));

    // 3. Merge, deduplicate by idEvent
    const tvIds  = new Set(tvRaw.map(e => e.idEvent));
    const allRaw = [...tvRaw, ...leagueFlat.filter(e => !tvIds.has(e.idEvent))];

    // 4. Normalise
    const seen = new Set();
    let events = allRaw
      .map((raw, i) => normaliseEvent(raw, i))
      .filter(ev => {
        const k = `${ev.title}_${ev.time}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });

    // 5. Sport filter
    if (req.query.sport) {
      events = events.filter(e => e.sport.toLowerCase() === req.query.sport.toLowerCase());
    }

    // 6. Sort by time
    events.sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json({ status: 'ok', date: dateStr, count: events.length, events });

  } catch (err) {
    console.error('[/api/events]', err);
    res.status(500).json({ status: 'error', message: err.message, events: [] });
  }
});

// ─── GET /api/health ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), cacheSize: cache.size });
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
  console.log(`  📱  On your phone: ipconfig → IPv4 → http://<ip>:${PORT}`);
  console.log('  📡  Data: TheSportsDB (free, no key required)');
  console.log('');
});

module.exports = app;
