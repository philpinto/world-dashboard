# World Dashboard

A real-time global monitoring dashboard that tracks flights, ships, earthquakes, fires, volcanoes, radiation, space weather, and conflict zones on an interactive world map. Built for wall-mounted displays where anyone can walk up and instantly understand what's happening across the planet.

![Dashboard Preview](https://img.shields.io/badge/status-live-brightgreen) ![Python](https://img.shields.io/badge/python-3.9+-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Live Flight Tracking** — 10K+ aircraft via OpenSky Network with military detection from ADSB.fi/Airplanes.live
- **Ship Tracking** — Global vessel positions via AISStream.io WebSocket with vessel type classification
- **Earthquake Monitoring** — Real-time USGS seismic data with magnitude-based visualization
- **Satellite Fire Detection** — NASA FIRMS/VIIRS thermal hotspots worldwide
- **Volcano Tracking** — 1,200+ Holocene volcanoes from the Smithsonian Global Volcanism Program
- **Radiation Monitoring** — Safecast citizen-science sensor network
- **Space Weather** — NOAA SWPC solar wind, Kp index, geomagnetic storm scales
- **Ocean Buoys** — NOAA NDBC wave height, wind, temperature data
- **Conflict Detection** — USGS seismic explosions + NASA thermal anomalies in active war zones
- **Hurricane Tracking** — GDACS worldwide tropical cyclone alerts
- **Wartime Mode** — Military-only filter showing military aircraft, naval vessels, and conflict zones
- **Threat Assessment** — Composite score from earthquakes, radiation, space weather, hurricanes, and breaking news headlines
- **Breaking News Ticker** — BBC, Al Jazeera, GDACS, USGS, and ReliefWeb headlines
- **Day/Night Terminator** — Real-time solar shadow overlay
- **Country Filter** — Click any country to filter flights and ships to that nation
- **Aircraft Photos** — Planespotters.net images with country flags in popups
- **Search** — Ctrl+K to find any callsign, vessel, or location
- **Measure Tool** — Press M to measure distances between points
- **Bookmarkable URLs** — Share specific map views via URL hash

## Quick Start

### Prerequisites

- Python 3.9+
- pip

### 1. Clone the repo

```bash
git clone https://github.com/philpinto/world-dashboard.git
cd world-dashboard
```

### 2. Install dependencies

```bash
pip install -r server/requirements.txt
```

### 3. Set up API keys

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your API keys (or create `credentials.json` — see below):

| Key | Required | Free? | Where to get it |
|-----|----------|-------|-----------------|
| `OPENSKY_CLIENT_ID` | Yes | Yes | [OpenSky Network](https://opensky-network.org) — Create account, go to Account page, create API client |
| `OPENSKY_CLIENT_SECRET` | Yes | Yes | Same as above — client secret is generated with the client ID |
| `AISSTREAM_API_KEY` | Optional | Yes | [AISStream.io](https://aisstream.io) — Sign in with GitHub to get a free API key |
| `FIRMS_MAP_KEY` | Optional | Yes | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/) — Enter your email, key is sent instantly |

**Option A: `.env` file** (recommended)
```bash
OPENSKY_CLIENT_ID=your-email@example.com-api-client
OPENSKY_CLIENT_SECRET=your-client-secret-here
AISSTREAM_API_KEY=your-aisstream-key
FIRMS_MAP_KEY=your-firms-key
```

**Option B: `credentials.json` file**
```json
{
  "clientId": "your-email@example.com-api-client",
  "clientSecret": "your-client-secret-here",
  "aisStreamApiKey": "your-aisstream-key",
  "firmsMapKey": "your-firms-key"
}
```

### 4. Create data directory

```bash
mkdir -p server/data
```

### 5. Run the server

```bash
python3 -m uvicorn server.app:app --host 0.0.0.0 --port 8080
```

Open http://localhost:8080 in your browser.

### What works without API keys

Even without any API keys, these layers work out of the box (no auth required):

- Earthquakes (USGS)
- Volcanoes (Smithsonian)
- Space Weather (NOAA SWPC)
- Ocean Buoys (NOAA NDBC)
- Radiation (Safecast)
- Breaking News (BBC, Al Jazeera, GDACS, USGS)
- Day/Night Terminator
- Threat Assessment

## Production Deployment

### systemd service

```bash
sudo cp deploy/world-dashboard.service /etc/systemd/system/
# Edit the service file to match your paths and username
sudo nano /etc/systemd/system/world-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable --now world-dashboard
```

### nginx reverse proxy

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/world-dashboard
# Edit server_name to your domain
sudo ln -s /etc/nginx/sites-available/world-dashboard /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Firewall

```bash
sudo ufw allow 8080/tcp
```

## Architecture

```
world-dashboard/
├── index.html              # Main SPA
├── css/dashboard.css        # Dark theme styles
├── js/
│   ├── map.js              # Leaflet map + day/night terminator
│   ├── flags.js            # Country flag lookups (ICAO hex, MMSI)
│   ├── icons.js            # SVG icon factories for all marker types
│   ├── popups.js           # Detail popup builders with photos
│   ├── military.js         # Wartime mode + military detection
│   ├── search.js           # Ctrl+K search bar
│   ├── urlstate.js         # Bookmarkable URL hash state
│   ├── measure.js          # Click-to-measure distance tool
│   ├── countryfilter.js    # Click country to filter flights/ships
│   ├── layers.js           # Core rendering engine + data fetching
│   └── panels.js           # Intel panel + keyboard shortcuts
├── server/
│   ├── app.py              # FastAPI backend with all endpoints
│   ├── cache.py            # In-memory TTL cache
│   ├── config.py           # Credential loading (env vars + JSON fallback)
│   ├── requirements.txt    # Python dependencies
│   └── collectors/
│       ├── flights.py      # OpenSky + ADSB.fi + Airplanes.live
│       ├── ships.py        # AISStream.io WebSocket
│       ├── earthquakes.py  # USGS GeoJSON feeds
│       ├── fires.py        # NASA FIRMS/VIIRS (multi-satellite)
│       ├── weather.py      # NOAA SWPC space weather
│       ├── buoys.py        # NOAA NDBC ocean stations
│       ├── volcanoes.py    # Smithsonian GVP
│       ├── radiation.py    # Safecast sensors
│       ├── hurricanes.py   # GDACS tropical cyclones
│       ├── news.py         # BBC, Al Jazeera, GDACS, USGS, ReliefWeb RSS
│       └── conflicts.py    # USGS explosions + FIRMS thermal in war zones
└── deploy/
    ├── world-dashboard.service  # systemd unit
    └── nginx.conf               # Reverse proxy config
```

## Data Sources

| Layer | Source | Auth | Refresh |
|-------|--------|------|---------|
| Flights | OpenSky Network | OAuth2 (free) | 60s |
| Military tags | ADSB.fi + Airplanes.live | None | 5 min |
| Ships | AISStream.io | API key (free) | WebSocket real-time |
| Earthquakes | USGS | None | 60s |
| Fires | NASA FIRMS | MAP_KEY (free) | 10 min |
| Volcanoes | Smithsonian GVP | None | 1 hour |
| Space Weather | NOAA SWPC | None | 60s |
| Buoys | NOAA NDBC | None | 5 min |
| Radiation | Safecast | None | 5 min |
| Hurricanes | GDACS | None | 10 min |
| News | BBC/Al Jazeera/GDACS/USGS | None | 5 min |
| Conflicts | USGS + FIRMS | None/MAP_KEY | 5 min |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` or `/` | Open search |
| `I` | Toggle intel panel |
| `M` | Measure distance tool |
| `F` | Toggle fullscreen |
| `Escape` | Close search/measure/filter |

## License

MIT
