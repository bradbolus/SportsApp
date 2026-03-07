/**
 * server.js — Matchday local dev + production server
 *
 * Usage:
 *   Development:  npm run dev   (uses nodemon for auto-reload)
 *   Production:   npm start
 *
 * Serves the /public folder as a static site.
 * Later: add /api routes here to fetch real broadcast data.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────

// Parse JSON request bodies (for future API routes)
app.use(express.json());

// Serve everything in /public as static files
// Important: set correct MIME types for PWA files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // Service worker must be served from root scope
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
    }
    // Manifest
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
  }
}));

// ─── API ROUTES (placeholder — connect real APIs here later) ──────

/**
 * GET /api/events
 * Returns all events. Future: accepts ?date=&sport=&country= params
 * and fetches from TheSportsDB / TVmaze / API-Sports
 */
app.get('/api/events', (req, res) => {
  res.json({
    status: 'demo',
    message: 'Connect a real API in server.js to populate live data.',
    count: 0,
    events: [],
  });
});

/**
 * GET /api/health
 * Simple healthcheck endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────
// Send index.html for any unmatched routes (supports future routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ███╗   ███╗ █████╗ ████████╗ ██████╗██╗  ██╗██████╗  █████╗ ██╗   ██╗');
  console.log('  ████╗ ████║██╔══██╗╚══██╔══╝██╔════╝██║  ██║██╔══██╗██╔══██╗╚██╗ ██╔╝');
  console.log('  ██╔████╔██║███████║   ██║   ██║     ███████║██║  ██║███████║ ╚████╔╝ ');
  console.log('  ██║╚██╔╝██║██╔══██║   ██║   ██║     ██╔══██║██║  ██║██╔══██║  ╚██╔╝  ');
  console.log('  ██║ ╚═╝ ██║██║  ██║   ██║   ╚██████╗██║  ██║██████╔╝██║  ██║   ██║   ');
  console.log('  ╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ');
  console.log('');
  console.log(`  🇿🇦 Sports Broadcast Tracker — South Africa`);
  console.log(`  🚀 Running at: http://localhost:${PORT}`);
  console.log(`  📱 On your phone (same WiFi): http://<your-local-ip>:${PORT}`);
  console.log('');
  console.log('  To find your local IP:');
  console.log('    Mac/Linux: ifconfig | grep "inet "');
  console.log('    Windows:   ipconfig');
  console.log('');
});

module.exports = app;
