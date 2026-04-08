/* ===== panels.js — Intel panel, detail views, and interaction handlers ===== */

// ===== Intel Panel Toggle =====

let intelOpen = false;

function toggleIntelPanel() {
    intelOpen = !intelOpen;
    const panel = document.getElementById('intelPanel');
    const btn = document.getElementById('toggleIntel');
    const weatherPanel = document.querySelector('.weather-panel');

    if (panel) panel.classList.toggle('open', intelOpen);
    if (btn) btn.classList.toggle('active', intelOpen);
    if (weatherPanel) weatherPanel.style.display = intelOpen ? 'none' : '';
}

// ===== Intel Tabs =====

let activeIntelTab = 'flights';

function switchIntelTab(tab) {
    activeIntelTab = tab;
    document.querySelectorAll('.intel-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderIntelTable();
}

function renderIntelTable() {
    const container = document.getElementById('intelContent');
    if (!container) return;

    const layer = LAYERS[activeIntelTab];
    if (!layer || !layer.data || !layer.data.features) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px;">No data</div>';
        return;
    }

    const features = layer.data.features;

    switch (activeIntelTab) {
        case 'flights':
            container.innerHTML = buildFlightTable(features);
            break;
        case 'earthquakes':
            container.innerHTML = buildQuakeTable(features);
            break;
        case 'ships':
            container.innerHTML = buildShipTable(features);
            break;
        case 'fires':
            container.innerHTML = buildFireTable(features);
            break;
        case 'buoys':
            container.innerHTML = buildBuoyTable(features);
            break;
        default:
            container.innerHTML = '';
    }
}

function buildFlightTable(features) {
    const airborne = features.filter(f => !f.properties.on_ground);
    const sorted = airborne.sort((a, b) => (b.properties.altitude || 0) - (a.properties.altitude || 0)).slice(0, 100);

    let html = `<table class="intel-table">
        <thead><tr><th>Callsign</th><th>Country</th><th>Alt (ft)</th><th>Spd (kts)</th></tr></thead>
        <tbody>`;

    for (const f of sorted) {
        const p = f.properties;
        const alt = p.altitude ? Math.round(p.altitude * 3.281).toLocaleString() : '---';
        const spd = p.velocity ? Math.round(p.velocity * 1.944) : '---';
        html += `<tr>
            <td style="color:var(--flight-color);">${p.callsign || p.icao24}</td>
            <td>${p.origin_country || '---'}</td>
            <td>${alt}</td>
            <td>${spd}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

function buildQuakeTable(features) {
    const sorted = features.sort((a, b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 100);

    let html = `<table class="intel-table">
        <thead><tr><th>Mag</th><th>Location</th><th>Depth</th><th>Time</th></tr></thead>
        <tbody>`;

    for (const f of sorted) {
        const p = f.properties;
        const depth = f.geometry.coordinates[2];
        const time = p.time ? new Date(p.time).toISOString().slice(11, 16) : '---';
        const magColor = (p.mag || 0) >= 6 ? 'var(--critical)' : (p.mag || 0) >= 4.5 ? 'var(--warning)' : 'var(--quake-color)';

        html += `<tr>
            <td style="color:${magColor};font-weight:700;">${p.mag?.toFixed(1) || '---'}</td>
            <td>${(p.place || 'Unknown').slice(0, 30)}</td>
            <td>${depth != null ? depth.toFixed(0) + ' km' : '---'}</td>
            <td>${time}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

function buildShipTable(features) {
    let html = `<table class="intel-table">
        <thead><tr><th>Name</th><th>Type</th><th>Speed</th><th>Dest</th></tr></thead>
        <tbody>`;

    for (const f of features.slice(0, 100)) {
        const p = f.properties;
        const typeColor = { Cargo: 'var(--ship-color)', Tanker: 'var(--critical)', Passenger: 'var(--info)', Fishing: '#ffeb3b' };

        html += `<tr>
            <td style="color:var(--text-primary);">${p.name || '---'}</td>
            <td style="color:${typeColor[p.type] || 'inherit'};">${p.type || '---'}</td>
            <td>${p.speed ? p.speed + ' kts' : '---'}</td>
            <td>${p.destination || '---'}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

function buildFireTable(features) {
    const sorted = features.sort((a, b) => (b.properties.frp || 0) - (a.properties.frp || 0)).slice(0, 100);

    let html = `<table class="intel-table">
        <thead><tr><th>FRP (MW)</th><th>Confidence</th><th>Satellite</th><th>Time</th></tr></thead>
        <tbody>`;

    for (const f of sorted) {
        const p = f.properties;
        const conf = { h: 'HIGH', n: 'NOM', l: 'LOW' };
        const confColor = { h: 'var(--critical)', n: 'var(--warning)', l: 'var(--text-muted)' };

        html += `<tr>
            <td style="color:var(--fire-color);">${p.frp?.toFixed(1) || '---'}</td>
            <td style="color:${confColor[p.confidence] || 'inherit'};">${conf[p.confidence] || p.confidence}</td>
            <td>${p.satellite || '---'}</td>
            <td>${p.acq_date || '---'} ${(p.acq_time || '').slice(0, 2)}:${(p.acq_time || '').slice(2)}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

function buildBuoyTable(features) {
    const sorted = features.sort((a, b) => (b.properties.wave_height || 0) - (a.properties.wave_height || 0)).slice(0, 100);

    let html = `<table class="intel-table">
        <thead><tr><th>Station</th><th>Wind</th><th>Waves</th><th>Temp</th></tr></thead>
        <tbody>`;

    for (const f of sorted) {
        const p = f.properties;
        html += `<tr>
            <td style="color:var(--buoy-color);">${p.station || '---'}</td>
            <td>${p.wind_speed != null ? p.wind_speed + ' m/s' : '---'}</td>
            <td>${p.wave_height != null ? p.wave_height + ' m' : '---'}</td>
            <td>${p.water_temp != null ? p.water_temp + '\u00b0C' : '---'}</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    return html;
}

// ===== Keyboard Shortcuts =====

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
        case 'i':
            toggleIntelPanel();
            break;
        case 'l':
            document.querySelector('.layer-sidebar').classList.toggle('collapsed');
            break;
        case 'f':
            if (!document.fullscreenElement) document.documentElement.requestFullscreen();
            else document.exitFullscreen();
            break;
    }
});

// ===== Init =====

document.addEventListener('DOMContentLoaded', () => {
    // Intel toggle button
    const btn = document.getElementById('toggleIntel');
    if (btn) btn.addEventListener('click', toggleIntelPanel);

    // Intel tabs
    document.querySelectorAll('.intel-tab').forEach(tab => {
        tab.addEventListener('click', () => switchIntelTab(tab.dataset.tab));
    });

    // Refresh intel table when layers update
    const origRender = window.renderLayer;
    if (typeof renderLayer === 'function') {
        const _origRenderLayer = renderLayer;
        window.renderLayer = function(key, geojson) {
            _origRenderLayer(key, geojson);
            if (key === activeIntelTab) renderIntelTable();
        };
    }
});
