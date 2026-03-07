# 🇿🇦 Matchday — Sports Broadcast Tracker

A progressive web app (PWA) that shows live and upcoming sports events with South African broadcast information. Runs locally, works on your iPhone from the home screen.

---

## Features

- **Live Now Hero Strip** — pinned scroller showing all events live or starting within the hour
- **Match Reminders** — browser notifications at 5, 10, 15, 30, or 60 minutes before kickoff
- **Search** — instant fuzzy search across event titles, leagues, sports, and broadcasters
- Day and sport filters
- SA broadcasters: SuperSport, DStv, SABC Sport, Showmax
- PWA — installable on iPhone as a home screen app
- SAST clock

---

## Quick Start (Local)

### 1. Prerequisites
- [Node.js 18+](https://nodejs.org/) — download and install if you don't have it
- [Git](https://git-scm.com/) — for version control

### 2. Clone & Install

```bash
# Clone your repo (after pushing to GitHub)
git clone https://github.com/YOUR_USERNAME/matchday.git
cd matchday

# Install dependencies
npm install
```

### 3. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The server will auto-reload when you save changes (thanks to nodemon).

---

## Using on Your iPhone (Same WiFi)

While the dev server is running:

1. **Find your computer's local IP address:**
   - Mac: `ifconfig | grep "inet "` — look for something like `192.168.1.x`
   - Windows: `ipconfig` — look for `IPv4 Address`

2. **On your iPhone**, open Safari and go to:
   ```
   http://192.168.1.x:3000
   ```
   *(replace with your actual IP)*

3. **Install as home screen app:**
   - Tap the **Share** button (box with arrow)
   - Tap **"Add to Home Screen"**
   - Tap **"Add"**

The app will now appear on your home screen and behave like a native app, with full-screen mode and no browser chrome.

---

## Project Structure

```
matchday/
├── public/                 # Everything served to the browser
│   ├── index.html          # The entire app (HTML + CSS + JS)
│   ├── manifest.json       # PWA manifest (app name, icons, theme)
│   ├── sw.js               # Service worker (offline caching)
│   └── icons/              # App icons (add your PNG icons here)
│       ├── icon-72.png
│       ├── icon-192.png
│       └── icon-512.png
├── server.js               # Express server
├── generate-icons.js       # Helper to generate placeholder icons
├── package.json
├── .gitignore
└── README.md
```

---

## Setting Up GitHub

### First time setup

```bash
# Inside the matchday folder
git init
git add .
git commit -m "Initial commit — Matchday PWA"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/matchday.git
git branch -M main
git push -u origin main
```

### Daily workflow

```bash
# After making changes
git add .
git commit -m "Add: description of what you changed"
git push
```

---

## Adding Real Icons

The app needs PNG icons for the PWA to work properly on iPhone.

**Option A — Generate SVG placeholders:**
```bash
node generate-icons.js
```
This creates SVG icons in `public/icons/`. They work but aren't ideal for iPhone.

**Option B — Use a real icon (recommended):**
1. Create a 512×512 PNG image with your logo/design
2. Go to [realfavicongenerator.net](https://realfavicongenerator.net/)
3. Upload your image
4. Download the package
5. Copy the PNG files into `public/icons/`

---

## Connecting Real API Data

The app currently uses hardcoded demo events. To replace with live data:

### Recommended APIs (free to start)

| API | Free Tier | Best For |
|-----|-----------|---------|
| [TheSportsDB](https://www.thesportsdb.com/api.php) | Yes | Broad sport coverage, TV info |
| [TVmaze](https://www.tvmaze.com/api) | No key needed | TV schedule listings |
| [API-Sports](https://api-sports.io/) | 100 req/day | 30+ sports, detailed broadcast data |

### How to wire it up

1. Get an API key from TheSportsDB or API-Sports
2. Create a `.env` file in the project root:
   ```
   SPORTS_API_KEY=your_key_here
   TVMAZE_API_KEY=optional
   ```
3. Add fetch logic to `server.js` in the `/api/events` route
4. Update `index.html` to call `fetch('/api/events')` instead of using the hardcoded `EVENTS` array

---

## Deploying Online (so you can use it away from home WiFi)

Once you're ready to access from anywhere:

### Railway (easiest, free tier)
1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your `matchday` repo
4. Done — Railway detects Node.js and deploys automatically
5. You'll get a URL like `matchday.railway.app`

### Render (also free)
1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`

---

## Roadmap (next features)

- [ ] SuperSport channel number mapper (SS1, SS2, SS3...)
- [ ] Timeline view toggle (cards ↔ time-of-day list)
- [ ] Overlap/conflict detector
- [ ] Real API integration
- [ ] Push notifications via service worker (for when app is closed)

---

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, fast on mobile
- **Backend:** Node.js + Express
- **PWA:** Web App Manifest + Service Worker
- **Fonts:** Bebas Neue, DM Sans, Space Mono (Google Fonts)
- **Hosting:** Works on Railway, Render, Fly.io, or any Node host
