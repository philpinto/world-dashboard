/* ===== popups.js — Popup content builders and aircraft photo fetching ===== */
/* Data: photoCache                                                         */
/* Functions: fetchAircraftPhoto, flightPopup, quakePopup, shipPopup,       */
/*            firePopup, buoyPopup, volcanoPopup, radiationPopup            */

// Photo cache to avoid re-fetching the same aircraft
const photoCache = {};

function fetchAircraftPhoto(icao24, imgEl) {
    if (!icao24) return;
    const hex = icao24.toLowerCase();

    // Check cache first
    if (photoCache[hex] !== undefined) {
        if (photoCache[hex]) {
            imgEl.src = photoCache[hex];
            imgEl.style.display = 'block';
        } else {
            imgEl.parentElement.style.display = 'none';
        }
        return;
    }

    fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`)
        .then(r => r.json())
        .then(data => {
            if (data.photos && data.photos.length > 0) {
                const url = data.photos[0].thumbnail_large?.src || data.photos[0].thumbnail?.src;
                if (url) {
                    photoCache[hex] = url;
                    imgEl.src = url;
                    imgEl.style.display = 'block';
                    // Update aircraft type label if available
                    const typeEl = imgEl.parentElement.querySelector('.photo-type');
                    const photo = data.photos[0];
                    if (typeEl && photo.aircraft?.model) {
                        typeEl.textContent = photo.aircraft.model;
                        typeEl.style.display = 'block';
                    }
                    return;
                }
            }
            photoCache[hex] = null;
            imgEl.parentElement.style.display = 'none';
        })
        .catch(() => {
            photoCache[hex] = null;
            imgEl.parentElement.style.display = 'none';
        });
}

function flightPopup(p, isMil) {
    const alt = p.altitude ? `${Math.round(p.altitude * 3.281).toLocaleString()} ft` : 'N/A';
    const speed = p.velocity ? `${Math.round(p.velocity * 1.944)} kts` : 'N/A';
    const vr = p.vertical_rate ? `${p.vertical_rate > 0 ? '+' : ''}${Math.round(p.vertical_rate * 196.85)} ft/min` : 'N/A';
    const hex = (p.icao24 || '').toLowerCase();
    const milBadge = isMil ? `<span class="popup-badge" style="background:var(--critical-dim);color:var(--critical);">MILITARY</span>` : '';
    const flag = countryToFlag(p.origin_country) || hexToFlag(p.icao24);

    return `<div class="popup-photo-wrap" id="photo-${hex}">
        <img class="popup-photo" onload="this.style.display='block'" onerror="this.parentElement.style.display='none'" />
        <div class="photo-type" style="display:none;"></div>
    </div>
    <div class="popup-header">
        ${flag ? `<span class="popup-flag">${flag}</span>` : `<span style="color:${isMil ? 'var(--critical)' : 'var(--flight-color)'};">\u2708</span>`}
        ${p.callsign || p.icao24}
        ${milBadge}
        <span class="popup-badge" style="background:var(--info-dim);color:var(--info);">${p.on_ground ? 'GROUND' : 'AIRBORNE'}</span>
    </div>
    <div class="popup-row"><span class="pl">ICAO24</span><span class="pv">${p.icao24}</span></div>
    <div class="popup-row"><span class="pl">Callsign</span><span class="pv">${p.callsign || '---'}</span></div>
    <div class="popup-row"><span class="pl">Country</span><span class="pv">${flag ? flag + ' ' : ''}${p.origin_country || hexToCountryCode(p.icao24) || '---'}</span></div>
    <div class="popup-row"><span class="pl">Altitude</span><span class="pv">${alt}</span></div>
    <div class="popup-row"><span class="pl">Speed</span><span class="pv">${speed}</span></div>
    <div class="popup-row"><span class="pl">Heading</span><span class="pv">${p.heading ? Math.round(p.heading) + '\u00b0' : '---'}</span></div>
    <div class="popup-row"><span class="pl">Vert Rate</span><span class="pv">${vr}</span></div>
    <div class="popup-row"><span class="pl">Squawk</span><span class="pv">${p.squawk || '---'}</span></div>
    ${p.registration ? `<div class="popup-row"><span class="pl">Registration</span><span class="pv">${p.registration}</span></div>` : ''}
    ${p.aircraft_type ? `<div class="popup-row"><span class="pl">Type</span><span class="pv">${p.aircraft_type}</span></div>` : ''}`;
}

function quakePopup(p) {
    const time = p.time ? new Date(p.time).toUTCString() : 'N/A';
    const depth = p.geometry_depth != null ? `${p.geometry_depth.toFixed(1)} km` : 'N/A';
    let alertColor = { green: 'var(--accent)', yellow: 'var(--warning)', orange: '#ff9800', red: 'var(--critical)' };

    return `<div class="popup-header">
        <span style="color:var(--quake-color);">\u26a0</span>
        M${p.mag?.toFixed(1) || '?'} — ${p.place || 'Unknown'}
        ${p.tsunami ? '<span class="popup-badge" style="background:var(--critical-dim);color:var(--critical);">TSUNAMI</span>' : ''}
    </div>
    <div class="popup-row"><span class="pl">Magnitude</span><span class="pv">${p.mag?.toFixed(1) || '---'}</span></div>
    <div class="popup-row"><span class="pl">Depth</span><span class="pv">${depth}</span></div>
    <div class="popup-row"><span class="pl">Time (UTC)</span><span class="pv">${time}</span></div>
    ${p.alert ? `<div class="popup-row"><span class="pl">Alert</span><span class="pv" style="color:${alertColor[p.alert] || 'inherit'}">${p.alert.toUpperCase()}</span></div>` : ''}
    ${p.url ? `<div style="margin-top:6px;"><a href="${p.url}" target="_blank" style="color:var(--accent);font-size:0.8em;">USGS Details \u2192</a></div>` : ''}`;
}

function shipPopup(p) {
    const typeColors = { Cargo: 'var(--ship-color)', Tanker: 'var(--critical)', Passenger: 'var(--info)', Fishing: '#ffeb3b' };
    const flag = mmsiToFlag(p.mmsi);
    const country = mmsiToCountry(p.mmsi);
    const milBadge = p.military ? `<span class="popup-badge" style="background:var(--critical-dim);color:var(--critical);">MILITARY</span>` : '';

    return `<div class="popup-header">
        ${flag ? `<span class="popup-flag">${flag}</span>` : `<span style="color:var(--ship-color);">\u26f5</span>`}
        ${p.name || 'Unknown Vessel'}
        ${milBadge}
        <span class="popup-badge" style="background:${typeColors[p.type] ? typeColors[p.type].replace(')', ',0.15)').replace('var(', 'var(') : 'var(--accent-dim)'};color:${typeColors[p.type] || 'var(--accent)'};">${p.type || 'VESSEL'}</span>
    </div>
    <div class="popup-row"><span class="pl">MMSI</span><span class="pv">${p.mmsi || '---'}</span></div>
    <div class="popup-row"><span class="pl">Flag State</span><span class="pv">${flag ? flag + ' ' : ''}${country || '---'}</span></div>
    <div class="popup-row"><span class="pl">Type</span><span class="pv">${p.type || '---'}</span></div>
    <div class="popup-row"><span class="pl">Speed</span><span class="pv">${p.speed ? p.speed + ' kts' : '---'}</span></div>
    <div class="popup-row"><span class="pl">Heading</span><span class="pv">${p.heading ? Math.round(p.heading) + '\u00b0' : '---'}</span></div>
    <div class="popup-row"><span class="pl">Destination</span><span class="pv">${p.destination || '---'}</span></div>
    <div class="popup-row"><span class="pl">Status</span><span class="pv">${p.navstat || '---'}</span></div>`;
}

function firePopup(p) {
    return `<div class="popup-header">
        <span style="color:var(--fire-color);">\ud83d\udd25</span>
        Thermal Hotspot
        <span class="popup-badge" style="background:var(--warning-dim);color:var(--warning);">${p.confidence === 'h' ? 'HIGH' : p.confidence === 'n' ? 'NOMINAL' : 'LOW'}</span>
    </div>
    <div class="popup-row"><span class="pl">Brightness</span><span class="pv">${p.brightness?.toFixed(1) || '---'} K</span></div>
    <div class="popup-row"><span class="pl">FRP</span><span class="pv">${p.frp?.toFixed(1) || '---'} MW</span></div>
    <div class="popup-row"><span class="pl">Satellite</span><span class="pv">${p.satellite || '---'}</span></div>
    <div class="popup-row"><span class="pl">Acquired</span><span class="pv">${p.acq_date || '---'} ${p.acq_time || ''}</span></div>
    <div class="popup-row"><span class="pl">Day/Night</span><span class="pv">${p.daynight === 'D' ? 'Day' : 'Night'}</span></div>`;
}

function buoyPopup(p) {
    const fmt = (v, unit) => v != null ? `${v} ${unit}` : '---';

    return `<div class="popup-header">
        <span style="color:var(--buoy-color);">\u2693</span>
        Station ${p.station}
    </div>
    <div class="popup-row"><span class="pl">Wind</span><span class="pv">${fmt(p.wind_speed, 'm/s')} @ ${p.wind_dir != null ? Math.round(p.wind_dir) + '\u00b0' : '---'}</span></div>
    <div class="popup-row"><span class="pl">Gust</span><span class="pv">${fmt(p.gust, 'm/s')}</span></div>
    <div class="popup-row"><span class="pl">Waves</span><span class="pv">${fmt(p.wave_height, 'm')} / ${fmt(p.wave_period, 's')}</span></div>
    <div class="popup-row"><span class="pl">Pressure</span><span class="pv">${fmt(p.pressure, 'hPa')}</span></div>
    <div class="popup-row"><span class="pl">Air Temp</span><span class="pv">${fmt(p.air_temp, '\u00b0C')}</span></div>
    <div class="popup-row"><span class="pl">Water Temp</span><span class="pv">${fmt(p.water_temp, '\u00b0C')}</span></div>`;
}

function volcanoPopup(p) {
    const statusColor = p.active ? 'var(--critical)' : 'var(--text-muted)';
    const statusText = p.active ? 'RECENTLY ACTIVE' : 'DORMANT';
    return `<div class="popup-header">
        <span style="color:#ff1744;">\ud83c\udf0b</span>
        ${p.name}
        <span class="popup-badge" style="background:${p.active ? 'var(--critical-dim)' : 'rgba(255,255,255,0.06)'};color:${statusColor};">${statusText}</span>
    </div>
    <div class="popup-row"><span class="pl">Country</span><span class="pv">${p.country || '---'}</span></div>
    <div class="popup-row"><span class="pl">Region</span><span class="pv">${p.region || '---'}</span></div>
    <div class="popup-row"><span class="pl">Type</span><span class="pv">${p.type || '---'}</span></div>
    <div class="popup-row"><span class="pl">Elevation</span><span class="pv">${p.elevation ? p.elevation + ' m' : '---'}</span></div>
    <div class="popup-row"><span class="pl">Last Eruption</span><span class="pv" style="color:${statusColor};">${p.last_eruption || 'Unknown'}</span></div>`;
}

function radiationPopup(p) {
    const levelColors = { normal: 'var(--accent)', watch: 'var(--warning)', elevated: '#ff9800', danger: 'var(--critical)' };
    const color = levelColors[p.level] || 'var(--accent)';
    return `<div class="popup-header">
        <span style="color:#76ff03;">\u2622</span>
        Radiation Sensor
        <span class="popup-badge" style="background:${color}22;color:${color};">${(p.level || 'normal').toUpperCase()}</span>
    </div>
    <div class="popup-row"><span class="pl">Reading</span><span class="pv" style="color:${color};font-weight:700;">${p.value} ${p.unit}</span></div>
    <div class="popup-row"><span class="pl">Normal Range</span><span class="pv">20-60 CPM</span></div>
    <div class="popup-row"><span class="pl">Captured</span><span class="pv">${p.captured_at ? new Date(p.captured_at).toUTCString().slice(0, 22) : '---'}</span></div>
    <div class="popup-row"><span class="pl">Device</span><span class="pv">${p.device_id || '---'}</span></div>`;
}

function conflictPopup(p) {
    const typeLabels = { explosion: 'SEISMIC EXPLOSION', thermal_strike: 'THERMAL STRIKE' };
    const typeIcons = { explosion: '\ud83d\udca5', thermal_strike: '\ud83c\udf9f' };
    const sevColor = p.severity === 'high' ? 'var(--critical)' : '#ff9800';

    return `<div class="popup-header">
        <span style="color:${sevColor};">${typeIcons[p.type] || '\u26a0'}</span>
        ${typeLabels[p.type] || 'Conflict Event'}
        <span class="popup-badge" style="background:${sevColor}22;color:${sevColor};">${(p.severity || 'medium').toUpperCase()}</span>
    </div>
    <div class="popup-row"><span class="pl">Title</span><span class="pv">${p.title || '---'}</span></div>
    <div class="popup-row"><span class="pl">Source</span><span class="pv">${p.source || '---'}</span></div>
    <div class="popup-row"><span class="pl">Zone</span><span class="pv" style="color:var(--critical);">${p.zone || '---'}</span></div>
    ${p.magnitude ? `<div class="popup-row"><span class="pl">Magnitude</span><span class="pv">${p.magnitude}</span></div>` : ''}
    ${p.frp ? `<div class="popup-row"><span class="pl">FRP</span><span class="pv">${p.frp} MW</span></div>` : ''}
    <div class="popup-row"><span class="pl">Time</span><span class="pv">${p.time ? new Date(p.time).toUTCString().slice(0, 22) : p.time || '---'}</span></div>`;
}
