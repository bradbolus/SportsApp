/**
 * server.js — Matchday Sports Broadcast Tracker
 * Sources:
 *   BallDontLie (free): NBA, NFL, F1, PGA Golf
 *   TheSportsDB (free v1): Soccer, Rugby, Cricket
 */

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

const BDL_KEY  = process.env.BDL_KEY || '';
const TSDB_KEY = '123';

const cache    = new Map();
const CACHE_MS = 15 * 60 * 1000;
function getCache(k) {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) { cache.delete(k); return null; }
  return e.data;
}
function setCache(k, d) { cache.set(k, { data: d, ts: Date.now() }); }

function fetchJSON(hostname, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, path: urlPath, method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Matchday/2.0)', ...headers },
    };
    function doReq(opts, hops = 0) {
      if (hops > 5) return reject(new Error('Too many redirects'));
      https.request(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const loc = res.headers.location;
            const url = loc.startsWith('http') ? new URL(loc) : new URL(loc, `https://${opts.hostname}`);
            return doReq({ ...opts, hostname: url.hostname, path: url.pathname + url.search }, hops + 1);
          } catch (e) { return reject(e); }
        }
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${opts.hostname}${opts.path}`));
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error(`JSON parse failed (${res.statusCode}) ${opts.hostname}${opts.path.slice(0,50)}: ${raw.slice(0, 120)}`)); }
        });
      }).on('error', reject).end();
    }
    doReq(options);
  });
}

function bdl(p)  { return fetchJSON('api.balldontlie.io', p, { 'Authorization': BDL_KEY }); }
function tsdb(p) { return fetchJSON('www.thesportsdb.com', p); }

function getSABroadcasters(sport, league) {
  const l = (league || '').toLowerCase();
  if (l.includes('premier league') || l.includes('epl'))             return ['SuperSport PSL', 'DStv Now'];
  if (l.includes('dstv prem') || l.includes('psl'))                  return ['SuperSport PSL', 'SABC Sport', 'DStv Now'];
  if (l.includes('champions league'))                                 return ['SuperSport UCL', 'DStv Now'];
  if (l.includes('la liga'))                                          return ['SuperSport La Liga', 'DStv Now'];
  if (l.includes('bundesliga') || l.includes('serie a') || l.includes('ligue')) return ['SuperSport Football', 'DStv Now'];
  if (l.includes('urc') || l.includes('united rugby') || l.includes('super rugby')) return ['SuperSport Rugby', 'DStv Now'];
  if (l.includes('currie') || l.includes('springbok'))               return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('rugby championship') || l.includes('six nations') || l.includes('rugby world')) return ['SuperSport Rugby', 'SABC Sport', 'DStv Now'];
  if (l.includes('formula') || l.includes('grand prix') || l.includes('f1')) return ['SuperSport Motorsport', 'DStv Now'];
  if (l.includes('pga') || l.includes('golf') || l.includes('masters')) return ['SuperSport Golf', 'DStv Now'];
  if (l.includes('nba') || l.includes('nfl'))                        return ['SuperSport Variety', 'DStv Now'];
  if (l.includes('cricket') || l.includes('ipl') || l.includes('protea')) return ['SuperSport Cricket', 'DStv Now'];
  const d = { Soccer:'SuperSport Football', Rugby:'SuperSport Rugby', Cricket:'SuperSport Cricket', F1:'SuperSport Motorsport', Golf:'SuperSport Golf', NBA:'SuperSport Variety', NFL:'SuperSport Variety' };
  return d[sport] ? [d[sport], 'DStv Now'] : ['DStv Now'];
}

function tsdbEvent(e, sport, dateStr) {
  const time = e.strTimestamp ? new Date(e.strTimestamp).toISOString()
             : e.dateEvent    ? new Date(`${e.dateEvent}T${e.strTime || '12:00:00'}`).toISOString()
             : `${dateStr}T12:00:00Z`;
  return {
    id: `${sport.toLowerCase()}_${e.idEvent}`,
    sport,
    title: (e.strAwayTeam && e.strHomeTeam) ? `${e.strAwayTeam} vs ${e.strHomeTeam}` : e.strEvent || 'Match',
    league: e.strLeague || sport,
    venue: e.strVenue || e.strCountry || 'TBC',
    time,
    duration: sport === 'Cricket' ? 480 : sport === 'Rugby' ? 110 : 105,
    broadcasters: getSABroadcasters(sport, e.strLeague || ''),
  };
}

async function fetchNBA(dateStr) {
  const k = `nba_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await bdl(`/v1/games?dates[]=${dateStr}&per_page=50`);
    const r = (d?.data || []).map(g => ({
      id: `nba_${g.id}`, sport: 'NBA',
      title: `${g.visitor_team?.full_name || 'Away'} vs ${g.home_team?.full_name || 'Home'}`,
      league: 'NBA', venue: g.home_team?.city || 'TBC',
      time: g.datetime ? new Date(g.datetime).toISOString() : `${dateStr}T00:00:00Z`,
      duration: 150, status: g.status,
      broadcasters: getSABroadcasters('NBA', 'nba'),
    }));
    console.log(`[NBA] ${dateStr} -> ${r.length}`); setCache(k, r); return r;
  } catch (e) { console.error('[NBA]', e.message); return []; }
}

async function fetchNFL(dateStr) {
  const k = `nfl_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await bdl(`/nfl/v1/games?dates[]=${dateStr}&per_page=50`);
    const r = (d?.data || []).map(g => ({
      id: `nfl_${g.id}`, sport: 'NFL',
      title: `${g.away_team?.full_name || 'Away'} vs ${g.home_team?.full_name || 'Home'}`,
      league: 'NFL', venue: g.venue || g.home_team?.city || 'TBC',
      time: g.date_time ? new Date(g.date_time).toISOString() : `${dateStr}T00:00:00Z`,
      duration: 210, status: g.status,
      broadcasters: getSABroadcasters('NFL', 'nfl'),
    }));
    console.log(`[NFL] ${dateStr} -> ${r.length}`); setCache(k, r); return r;
  } catch (e) { console.error('[NFL]', e.message); return []; }
}

async function fetchF1(dateStr) {
  const k = `f1_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await tsdb(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Motorsport`);
    const all = d?.events || [];
    // Filter to F1 only
    const events = all.filter(e => (e.strLeague || '').toLowerCase().includes('formula'));
    console.log(`[F1] TSDB ${dateStr} -> ${events.length} (of ${all.length} motorsport)`);
    const r = events.map(e => tsdbEvent(e, 'F1', dateStr));
    setCache(k, r); return r;
  } catch (e) { console.error('[F1]', e.message); return []; }
}

async function fetchGolf(dateStr) {
  const k = `golf_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await bdl(`/pga/v1/tournaments?season=${dateStr.slice(0,4)}&per_page=100`);
    const r = (d?.data || [])
      .filter(t => {
        const s = (t.start_date || '').slice(0,10);
        const e = (t.end_date   || '').slice(0,10);
        return s && e && dateStr >= s && dateStr <= e;
      })
      .map(t => ({
        id: `golf_${t.id}`, sport: 'Golf',
        title: t.name || 'PGA Tournament',
        league: 'PGA Tour', venue: t.course || t.venue || t.location || 'TBC',
        time: `${dateStr}T10:00:00Z`,
        duration: 480,
        broadcasters: getSABroadcasters('Golf', 'pga golf'),
      }));
    console.log(`[Golf] ${dateStr} -> ${r.length} active`); setCache(k, r); return r;
  } catch (e) { console.error('[Golf]', e.message); return []; }
}

async function fetchSoccer(dateStr) {
  const k = `soccer_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await tsdb(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Soccer`);
    const r = (d?.events || []).map(e => tsdbEvent(e, 'Soccer', dateStr));
    console.log(`[Soccer] TSDB ${dateStr} -> ${r.length}`); setCache(k, r); return r;
  } catch (e) { console.error('[Soccer]', e.message); return []; }
}

async function fetchRugby(dateStr) {
  const k = `rugby_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await tsdb(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Rugby`);
    const r = (d?.events || []).map(e => tsdbEvent(e, 'Rugby', dateStr));
    console.log(`[Rugby] TSDB ${dateStr} -> ${r.length}`); setCache(k, r); return r;
  } catch (e) { console.error('[Rugby]', e.message); return []; }
}

async function fetchCricket(dateStr) {
  const k = `cricket_${dateStr}`; const hit = getCache(k); if (hit) return hit;
  try {
    const d = await tsdb(`/api/v1/json/${TSDB_KEY}/eventsday.php?d=${dateStr}&s=Cricket`);
    const r = (d?.events || []).map(e => tsdbEvent(e, 'Cricket', dateStr));
    console.log(`[Cricket] TSDB ${dateStr} -> ${r.length}`); setCache(k, r); return r;
  } catch (e) { console.error('[Cricket]', e.message); return []; }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, fp) {
    if (fp.endsWith('sw.js')) { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Cache-Control', 'no-cache'); }
    if (fp.endsWith('manifest.json')) res.setHeader('Content-Type', 'application/manifest+json');
  }
}));

app.get('/api/events', async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`[/api/events] date=${dateStr}`);
    const settled = await Promise.allSettled([
      fetchNBA(dateStr), fetchNFL(dateStr), fetchF1(dateStr), fetchGolf(dateStr),
      fetchSoccer(dateStr), fetchRugby(dateStr), fetchCricket(dateStr),
    ]);
    const get = r => r.status === 'fulfilled' ? r.value : [];
    let events = settled.flatMap(get);
    const seen = new Set();
    events = events.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    if (req.query.sport) events = events.filter(e => e.sport.toLowerCase() === req.query.sport.toLowerCase());
    events.sort((a, b) => new Date(a.time) - new Date(b.time));
    console.log(`[/api/events] returning ${events.length}`);
    res.json({ status: 'ok', date: dateStr, count: events.length, events });
  } catch (err) {
    console.error('[/api/events]', err);
    res.status(500).json({ status: 'error', message: err.message, events: [] });
  }
});

app.get('/api/health', (_req, res) => res.json({
  status: 'ok', timestamp: new Date().toISOString(),
  bdlKeySet: !!BDL_KEY, bdlKeyPreview: BDL_KEY ? BDL_KEY.slice(0,8)+'...' : 'NOT SET',
  cacheSize: cache.size, sources: ['BallDontLie (NBA/NFL/F1/Golf)', 'TheSportsDB (Soccer/Rugby/Cricket)']
}));

app.get('/api/test', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const out = { date: today };
  const tests = [
    ['nba',     () => bdl(`/v1/games?dates[]=${today}&per_page=3`)],
    ['nfl',     () => bdl(`/nfl/v1/games?dates[]=${today}&per_page=3`)],
    ['f1',      () => tsdb(`/api/v1/json/123/eventsday.php?d=${today}&s=Motorsport`)],
    ['golf',    () => bdl(`/pga/v1/tournaments?season=${today.slice(0,4)}&per_page=3`)],
    ['soccer',  () => tsdb(`/api/v1/json/123/eventsday.php?d=${today}&s=Soccer`)],
    ['rugby',   () => tsdb(`/api/v1/json/123/eventsday.php?d=${today}&s=Rugby`)],
    ['cricket', () => tsdb(`/api/v1/json/123/eventsday.php?d=${today}&s=Cricket`)],
  ];
  for (const [name, fn] of tests) {
    try {
      const d = await fn();
      out[name] = d?.data?.length !== undefined ? `${d.data.length} items` 
                : d?.events !== null && d?.events ? `${d.events.length} events`
                : d?.events === null ? 'null (no events today)'
                : JSON.stringify(d).slice(0, 80);
    } catch (e) { out[name] = `ERR: ${e.message.slice(0, 100)}`; }
  }
  res.json(out);
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('\n  ⚽  MATCHDAY  🇿🇦');
  console.log(`  🚀  http://localhost:${PORT}`);
  console.log(`  🔑  BDL: ${BDL_KEY ? '✅' : '❌ NOT SET'} | TSDB: free\n`);
});

module.exports = app;
