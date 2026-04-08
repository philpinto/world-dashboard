/* ===== layers.js — Data layer management, fetching, rendering, and refresh ===== */
/* Depends on: map.js, flags.js, icons.js, popups.js, military.js              */

// Canvas renderer for performance with 10K+ markers
const canvasRenderer = L.canvas({ padding: 0.5 });

const LAYERS = {
    flights:     { name: 'Flights',     color: '#00bcd4', group: null, enabled: true,  count: 0, total: 0, data: null },
    earthquakes: { name: 'Earthquakes', color: '#ff6b35', group: null, enabled: true,  count: 0, total: 0, data: null },
    ships:       { name: 'Ships',       color: '#4caf50', group: null, enabled: true,  count: 0, total: 0, data: null },
    fires:       { name: 'Fires',       color: '#ff9800', group: null, enabled: false, count: 0, total: 0, data: null },
    volcanoes:   { name: 'Volcanoes',   color: '#ff1744', group: null, enabled: false, count: 0, total: 0, data: null },
    radiation:   { name: 'Radiation',   color: '#76ff03', group: null, enabled: false, count: 0, total: 0, data: null },
    buoys:       { name: 'Buoys',       color: '#29b6f6', group: null, enabled: false, count: 0, total: 0, data: null },
    conflicts:   { name: 'Conflicts',   color: '#ff3d00', group: null, enabled: false, count: 0, total: 0, data: null },
};

// Heatmap config for dense layers at world zoom — subtle, radar-like
// Dense layers use heatmap at world zoom, markers when zoomed in
const HEAT_LAYERS = new Set(['fires', 'ships']);
const HEAT_CONFIG = {
    flights: { radius: 6,  blur: 10, maxZoom: 5, max: 0.4, minOpacity: 0.0, gradient: { 0.2: '#001122', 0.5: '#003355', 0.8: '#006688', 1: '#0099bb' } },
    ships:   { radius: 5,  blur: 8,  maxZoom: 5, max: 0.35, minOpacity: 0.0, gradient: { 0.2: '#061206', 0.5: '#0d260d', 0.8: '#1a4d1a', 1: '#2d7a2d' } },
    fires:   { radius: 8,  blur: 12, maxZoom: 5, max: 0.5, minOpacity: 0.0, gradient: { 0.2: '#110700', 0.5: '#331400', 0.8: '#663300', 1: '#995500' } },
};

// Max markers per layer by zoom
function getMaxMarkers(key) {
    const z = map.getZoom();
    if (key === 'fires') return z <= 3 ? 800 : z <= 5 ? 3000 : 50000;
    if (key === 'flights') return z <= 2 ? 2500 : z <= 3 ? 3500 : z <= 5 ? 5000 : 50000;
    if (key === 'ships') return z <= 2 ? 2500 : z <= 3 ? 3500 : z <= 5 ? 5000 : 50000;
    return z <= 3 ? 1500 : z <= 5 ? 5000 : 50000;
}

// ===== Layer Rendering — Heatmap/Canvas/SVG =====
// Heatmap at world zoom (z<=4), canvas circleMarkers at mid zoom, SVG divIcons at high zoom

function renderLayer(key, geojson) {
    const cfg = LAYERS[key];
    if (!cfg) return;

    // Clean up previous render
    if (cfg.group) { map.removeLayer(cfg.group); cfg.group = null; }
    if (cfg._heatLayer) { map.removeLayer(cfg._heatLayer); cfg._heatLayer = null; }

    cfg.data = geojson;
    if (!cfg.enabled || !geojson || !geojson.features) {
        cfg.count = 0; cfg.total = 0;
        updateLayerCount(key, 0);
        return;
    }

    let features = geojson.features;
    const zoom = map.getZoom();

    // Pre-filter by layer type
    if (key === 'flights') features = features.filter(f => !f.properties.on_ground);
    if (key === 'fires' && zoom <= 4) features = features.filter(f => (f.properties.frp || 0) > 15);

    // Wartime filter
    if (wartimeMode) {
        if (key === 'flights') features = features.filter(f => isMilitaryAircraft(f.properties));
        else if (key === 'ships') features = features.filter(f => isMilitaryShip(f.properties));
    }

    // Country filter — filter flights by origin country, ships by MMSI country
    if (window.countryFilter) {
        // Resolve filter to ISO country code for reliable matching
        const _filterName = window.countryFilter.toLowerCase();
        let _filterCode = COUNTRY_CODES[_filterName] || '';
        // Try partial match if exact doesn't work (e.g. "united states of america" → "united states" → "US")
        if (!_filterCode) {
            for (const [name, code] of Object.entries(COUNTRY_CODES)) {
                if (_filterName.includes(name) || name.includes(_filterName)) {
                    _filterCode = code; break;
                }
            }
        }

        if (key === 'flights') {
            features = features.filter(f => {
                const country = (f.properties.origin_country || '').toLowerCase();
                const hexCode = hexToCountryCode(f.properties.icao24);
                return (_filterCode && hexCode === _filterCode) ||
                       country.includes(_filterName) || _filterName.includes(country);
            });
        } else if (key === 'ships') {
            features = features.filter(f => {
                const mmsiCode = mmsiToFlag(f.properties.mmsi) ? MID_TO_COUNTRY[String(f.properties.mmsi).substring(0,3)] : '';
                return mmsiCode === _filterCode;
            });
        }
    }

    cfg.total = features.length;

    // === HEATMAP MODE (z <= 3 for dense layers — icons show at z4+) ===
    if (HEAT_LAYERS.has(key) && zoom <= 3 && features.length > 100) {
        const config = HEAT_CONFIG[key];
        const latlngs = [];
        for (const f of features) {
            if (f.geometry.type !== 'Point') continue;
            const c = f.geometry.coordinates;
            // Very low intensity — thin radar-like trails
            let intensity = 0.08;
            if (key === 'flights') intensity = 0.1;
            else if (key === 'fires') intensity = Math.min((f.properties.frp || 5) / 300, 0.25);
            else if (key === 'ships') intensity = 0.06;
            latlngs.push([c[1], c[0], intensity]);
        }
        cfg._heatLayer = L.heatLayer(latlngs, config).addTo(map);
        cfg.count = latlngs.length;
        cfg._lastRenderZoom = zoom;
        updateLayerCount(key, cfg.total);

        // Still render conflict zone polygons if this is the conflicts layer
        // (won't apply to flights/ships/fires but keeps the code generic)
        return;
    }

    // === MARKER MODE (z >= 5) ===
    // Viewport filter (only for markers, not heatmap)
    const bounds = map.getBounds();
    const pad = 0.5;
    const vp = { south: bounds.getSouth()-pad, north: bounds.getNorth()+pad, west: bounds.getWest()-pad, east: bounds.getEast()+pad };
    let viewportFeatures = features.filter(f => {
        if (f.geometry.type !== 'Point') return true;
        const c = f.geometry.coordinates;
        return c[1] >= vp.south && c[1] <= vp.north && c[0] >= vp.west && c[0] <= vp.east;
    });

    // Subsample if needed
    const maxMarkers = getMaxMarkers(key);
    let displayFeatures = viewportFeatures;
    if (viewportFeatures.length > maxMarkers) {
        const step = Math.ceil(viewportFeatures.length / maxMarkers);
        displayFeatures = viewportFeatures.filter((_, i) => i % step === 0);
    }

    // Canvas vs SVG mode
    const useCanvas = (zoom <= 6 && displayFeatures.length > 300);
    const markers = [];

    for (const f of displayFeatures) {
        if (f.geometry.type !== 'Point') continue;
        const coords = f.geometry.coordinates;
        const p = f.properties;
        const latlng = [coords[1], coords[0]];
        let marker;

        if (useCanvas) {
            const style = getCanvasStyle(key, p);
            marker = L.circleMarker(latlng, style);
            // Bind popup based on layer type
            switch (key) {
                case 'flights': marker.bindPopup(flightPopup(p, p.military || isMilitaryAircraft(p)), { maxWidth: 320, minWidth: 280 }); break;
                case 'earthquakes': p.geometry_depth = coords[2]; marker.bindPopup(quakePopup(p), { maxWidth: 300 }); break;
                case 'ships': marker.bindPopup(shipPopup(p), { maxWidth: 280 }); break;
                case 'fires': marker.bindPopup(firePopup(p), { maxWidth: 280 }); break;
                case 'volcanoes': marker.bindPopup(volcanoPopup(p), { maxWidth: 280 }); break;
                case 'radiation': marker.bindPopup(radiationPopup(p), { maxWidth: 280 }); break;
                case 'buoys': marker.bindPopup(buoyPopup(p), { maxWidth: 280 }); break;
                case 'conflicts': marker.bindPopup(conflictPopup(p), { maxWidth: 300 }); break;
            }
        } else {
            // SVG icon mode
            switch (key) {
                case 'flights': {
                    const isMil = wartimeMode || isMilitaryAircraft(p);
                    marker = L.marker(latlng, { icon: planeIcon(p.heading, p.altitude, wartimeMode && isMil) });
                    marker.bindPopup(flightPopup(p, isMil), { maxWidth: 320, minWidth: 280 });
                    (function(icao) {
                        marker.on('popupopen', function() {
                            const wrap = document.getElementById('photo-' + icao.toLowerCase());
                            if (wrap) {
                                const img = wrap.querySelector('.popup-photo');
                                if (img && !img.src) fetchAircraftPhoto(icao, img);
                            }
                        });
                    })(p.icao24);
                    break;
                }
                case 'earthquakes':
                    p.geometry_depth = coords[2];
                    marker = L.marker(latlng, { icon: quakeIcon(p.mag) });
                    marker.bindPopup(quakePopup(p), { maxWidth: 300 });
                    break;
                case 'ships': {
                    const isMilShip = wartimeMode && isMilitaryShip(p);
                    marker = L.marker(latlng, { icon: isMilShip ? milShipIcon(p.heading) : shipIcon(p.heading, p.type) });
                    marker.bindPopup(shipPopup(p), { maxWidth: 280 });
                    break;
                }
                case 'fires':
                    marker = L.marker(latlng, { icon: fireIcon(p.frp) });
                    marker.bindPopup(firePopup(p), { maxWidth: 280 });
                    break;
                case 'buoys':
                    marker = L.marker(latlng, { icon: buoyIcon(p.wave_height) });
                    marker.bindPopup(buoyPopup(p), { maxWidth: 280 });
                    break;
                case 'volcanoes':
                    marker = L.marker(latlng, { icon: volcanoIcon(p.active) });
                    marker.bindPopup(volcanoPopup(p), { maxWidth: 280 });
                    break;
                case 'radiation':
                    marker = L.marker(latlng, { icon: radiationIcon(p.level) });
                    marker.bindPopup(radiationPopup(p), { maxWidth: 280 });
                    break;
                case 'conflicts':
                    marker = L.marker(latlng, { icon: conflictIcon(p.type, p.severity) });
                    marker.bindPopup(conflictPopup(p), { maxWidth: 300 });
                    break;
            }
        }
        if (marker) markers.push(marker);
    }

    cfg.group = L.layerGroup(markers);
    cfg.group.addTo(map);
    cfg.count = markers.length;
    cfg._lastRenderZoom = zoom;
    updateLayerCount(key, cfg.total);
}

function updateLayerCount(key, count) {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = count.toLocaleString();
}

// ===== Data Fetching =====

async function fetchLayer(key, url) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        return await resp.json();
    } catch (e) {
        console.warn(`[${key}] fetch error:`, e);
        return null;
    }
}

async function refreshAllLayers() {
    // Skip render if user has a popup open — don't destroy it
    const popupOpen = !!document.querySelector('.leaflet-popup');

    const fetches = [
        fetchLayer('flights', '/api/flights').then(d => { if (!popupOpen) renderLayer('flights', d); else LAYERS.flights.data = d; }),
        fetchLayer('earthquakes', '/api/earthquakes?range=day').then(d => { if (!popupOpen) renderLayer('earthquakes', d); else LAYERS.earthquakes.data = d; }),
        fetchLayer('ships', '/api/ships').then(d => { if (!popupOpen) renderLayer('ships', d); else LAYERS.ships.data = d; }),
        fetchLayer('fires', '/api/fires').then(d => { if (!popupOpen) renderLayer('fires', d); else LAYERS.fires.data = d; }),
        fetchLayer('volcanoes', '/api/volcanoes').then(d => { if (!popupOpen) renderLayer('volcanoes', d); else LAYERS.volcanoes.data = d; }),
        fetchLayer('radiation', '/api/radiation').then(d => { if (!popupOpen) renderLayer('radiation', d); else LAYERS.radiation.data = d; }),
        fetchLayer('buoys', '/api/buoys').then(d => { if (!popupOpen) renderLayer('buoys', d); else LAYERS.buoys.data = d; }),
        fetchLayer('conflicts', '/api/conflicts').then(d => { if (!popupOpen) renderLayer('conflicts', d); else LAYERS.conflicts.data = d; }),
    ];

    await Promise.allSettled(fetches);
    updateHealthStatus();
}

async function updateHealthStatus() {
    const banner = document.getElementById('connectionBanner');
    try {
        const resp = await fetch('/api/health');
        if (!resp.ok) throw new Error('bad status');
        const health = await resp.json();

        for (const [key, info] of Object.entries(health)) {
            const dot = document.getElementById(`dot-${key}`);
            if (dot) {
                dot.className = 'status-dot ' + info.status;
            }
        }

        // Connection restored
        if (banner) banner.classList.remove('show');
    } catch (e) {
        // Connection lost
        if (banner) banner.classList.add('show');
    }
}

// ===== Trending =====

async function updateTrending() {
    try {
        const resp = await fetch('/api/trending');
        if (!resp.ok) return;
        const items = await resp.json();
        const list = document.getElementById('trendingList');
        if (!list || !items.length) return;

        list.innerHTML = items.map((item, i) => {
            const url = item.url || `https://www.google.com/search?q=${encodeURIComponent(item.title)}`;
            const traffic = item.traffic || '';
            return `<a class="trending-item" href="${url}" target="_blank" rel="noopener">
                <span class="trending-rank">${i + 1}</span>
                <span class="trending-title">${item.title}</span>
                ${traffic ? `<span class="trending-traffic">${traffic}</span>` : ''}
            </a>`;
        }).join('');
    } catch (e) {
        // silent
    }
}

// ===== Layer Toggle =====

function toggleLayer(key) {
    const cfg = LAYERS[key];
    if (!cfg) return;
    cfg.enabled = !cfg.enabled;
    const el = document.getElementById(`layer-${key}`);
    if (el) el.classList.toggle('active', cfg.enabled);
    if (cfg.enabled && cfg.data) {
        renderLayer(key, cfg.data);
    } else if (!cfg.enabled) {
        if (cfg.group) { map.removeLayer(cfg.group); cfg.group = null; }
        if (cfg._heatLayer) { map.removeLayer(cfg._heatLayer); cfg._heatLayer = null; }
        updateLayerCount(key, 0);
    }
}

// ===== Auto-Refresh =====

const REFRESH_INTERVAL = 15; // seconds
let refreshCountdown = REFRESH_INTERVAL;

async function refreshCycle() {
    refreshCountdown = REFRESH_INTERVAL;
    await refreshAllLayers();
    await Promise.allSettled([
        updateSpaceWeather(),
        updateNewsTicker(),
        updateThreatLevel(),
    ]);
}

function tickCountdown() {
    refreshCountdown--;
    const pct = ((REFRESH_INTERVAL - refreshCountdown) / REFRESH_INTERVAL) * 100;
    const bar = document.getElementById('refreshBarFill');
    if (bar) bar.style.width = pct + '%';

    if (refreshCountdown <= 0) {
        refreshCycle();
    }
}

// Clock
function updateClock() {
    const now = new Date();
    const el = document.getElementById('utcClock');
    if (el) {
        el.textContent = now.toISOString().slice(11, 19) + ' UTC';
    }
}

// ===== Space Weather =====

async function updateSpaceWeather() {
    try {
        const resp = await fetch('/api/space-weather');
        if (!resp.ok) return;
        const data = await resp.json();

        // Kp index
        const kpVal = document.getElementById('kpValue');
        if (kpVal && data.kp?.value != null) {
            kpVal.textContent = data.kp.value.toFixed(1);
            kpVal.style.color = data.kp.value >= 5 ? 'var(--critical)' : data.kp.value >= 4 ? 'var(--warning)' : 'var(--accent)';
        }

        // Kp gauge bars
        const kpGauge = document.getElementById('kpGauge');
        if (kpGauge && data.kp?.value != null) {
            const bars = kpGauge.querySelectorAll('.kp-bar');
            bars.forEach((bar, i) => {
                bar.className = 'kp-bar';
                if (i < Math.round(data.kp.value)) {
                    if (data.kp.value >= 7) bar.classList.add('critical');
                    else if (data.kp.value >= 5) bar.classList.add('warning');
                    else bar.classList.add('filled');
                }
            });
        }

        // Solar wind
        const sw = data.solar_wind || {};
        const speedEl = document.getElementById('swSpeed');
        const densityEl = document.getElementById('swDensity');
        if (speedEl) speedEl.textContent = sw.speed ? `${parseFloat(sw.speed).toFixed(0)} km/s` : '---';
        if (densityEl) densityEl.textContent = sw.density ? `${parseFloat(sw.density).toFixed(1)} p/cm\u00b3` : '---';

        // Storm scales
        const scales = data.scales || {};
        for (const key of ['R', 'S', 'G']) {
            const el = document.getElementById(`scale${key}`);
            if (el && scales[key]) {
                const level = parseInt(scales[key].Scale) || 0;
                el.textContent = `${key}${level}`;
                el.style.color = level >= 3 ? 'var(--critical)' : level >= 1 ? 'var(--warning)' : 'var(--text-muted)';
            }
        }

    } catch (e) {
        // silent
    }
}

// ===== News Ticker =====

async function updateNewsTicker() {
    try {
        const resp = await fetch('/api/news');
        if (!resp.ok) return;
        const data = await resp.json();

        const track = document.getElementById('tickerTrack');
        const items = Array.isArray(data) ? data : (data.items || []);
        if (!track || !items.length) return;

        const html = items.map(item => {
            const time = item.time ? new Date(item.time).toISOString().slice(11, 16) + 'Z' : '';
            const source = item.source || 'NEWS';
            const url = item.url || '#';
            return `<a class="ticker-item" href="${url}" target="_blank" rel="noopener">` +
                `<span class="ticker-time">${time}</span>` +
                `<span class="ticker-source">${source}</span>` +
                `${item.title}` +
                `</a>` +
                `<span class="ticker-dot"></span>`;
        }).join('');

        // Duplicate content so scroll loops seamlessly
        track.innerHTML = html + html;
    } catch (e) {
        // silent
    }
}

// ===== Threat Level =====

let _lastThreatData = null;

async function updateThreatLevel() {
    try {
        const resp = await fetch('/api/threat-level');
        if (!resp.ok) return;
        const data = await resp.json();
        _lastThreatData = data;

        const badge = document.getElementById('threatBadge');
        const label = document.getElementById('threatLevel');
        if (!badge || !label) return;

        const level = (data.level || 'LOW').toUpperCase();
        label.textContent = `${level} (${data.score})`;

        badge.className = 'threat-badge';
        const classMap = {
            'LOW': 'level-low',
            'GUARDED': 'level-guarded',
            'ELEVATED': 'level-elevated',
            'HIGH': 'level-high',
            'CRITICAL': 'level-critical',
        };
        badge.classList.add(classMap[level] || 'level-low');

        // Update breakdown panel if open
        renderThreatPanel(data);
    } catch (e) {
        // silent
    }
}

function toggleThreatPanel() {
    const panel = document.getElementById('threatPanel');
    if (!panel) return;
    panel.classList.toggle('show');
    if (panel.classList.contains('show') && _lastThreatData) {
        renderThreatPanel(_lastThreatData);
    }
}

function renderThreatPanel(data) {
    const body = document.getElementById('threatPanelBody');
    if (!body) return;

    const levelColors = { LOW: 'var(--accent)', GUARDED: 'var(--info)', ELEVATED: 'var(--warning)', HIGH: '#ff9800', CRITICAL: 'var(--critical)' };
    const sourceIcons = { earthquake: '\u26a0', space_weather: '\u2604', radiation: '\u2622', hurricane: '\ud83c\udf00' };
    const color = levelColors[data.level] || 'var(--accent)';

    let html = `<div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:2.5em;font-weight:800;color:${color};letter-spacing:2px;">${data.level}</div>
        <div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;">Score: ${data.score} / 100+</div>
    </div>`;

    if (data.factors && data.factors.length > 0) {
        html += `<div style="border-top:1px solid var(--border);padding-top:12px;">`;
        for (const f of data.factors) {
            const icon = sourceIcons[f.source] || '\u2022';
            const barWidth = Math.min(f.points * 3, 100);
            html += `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
                <span style="font-size:1.1em;width:20px;text-align:center;">${icon}</span>
                <div style="flex:1;">
                    <div style="font-size:0.8em;color:var(--text-primary);">${f.detail}</div>
                    <div style="height:4px;background:var(--bg-primary);border-radius:2px;margin-top:4px;">
                        <div style="height:100%;width:${barWidth}%;background:${color};border-radius:2px;"></div>
                    </div>
                </div>
                <span style="font-family:monospace;font-size:0.75em;color:var(--text-muted);min-width:30px;text-align:right;">+${f.points}</span>
            </div>`;
        }
        html += `</div>`;
    } else {
        html += `<div style="text-align:center;color:var(--text-muted);font-size:0.85em;padding:20px;">No active threats detected</div>`;
    }

    body.innerHTML = html;
}

// ===== Init =====

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    refreshCycle();

    // Countdown timer
    setInterval(tickCountdown, 1000);

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Layer toggle click handlers
    for (const key of Object.keys(LAYERS)) {
        const el = document.getElementById(`layer-${key}`);
        if (el) {
            el.addEventListener('click', () => toggleLayer(key));
            if (LAYERS[key].enabled) el.classList.add('active');
        }
    }

    // Re-render on zoom/pan to update viewport-filtered markers (skip if popup open)
    let viewDebounce;
    let lastRenderZoom = map.getZoom();
    window.reRenderAllLayers = reRenderAllLayers;
    function reRenderAllLayers() {
        if (document.querySelector('.leaflet-popup')) return;
        clearTimeout(viewDebounce);
        viewDebounce = setTimeout(() => {
            if (document.querySelector('.leaflet-popup')) return;
            const currentZoom = map.getZoom();
            const zoomChanged = currentZoom !== lastRenderZoom;
            lastRenderZoom = currentZoom;
            for (const [key, cfg] of Object.entries(LAYERS)) {
                if (!cfg.enabled || !cfg.data) continue;
                // Heatmap layers only need re-render on zoom change (pan is native)
                if (HEAT_LAYERS.has(key) && cfg._heatLayer && !zoomChanged) continue;
                renderLayer(key, cfg.data);
            }
        }, 200);
    }
    map.on('zoomend', reRenderAllLayers);
    map.on('moveend', reRenderAllLayers);

    // When popup closes, catch up on any pending re-renders
    map.on('popupclose', () => {
        setTimeout(() => {
            for (const [key, cfg] of Object.entries(LAYERS)) {
                if (cfg.enabled && cfg.data) {
                    renderLayer(key, cfg.data);
                }
            }
        }, 100);
    });
});
