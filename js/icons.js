/* ===== icons.js — SVG icon factory functions for map markers ===== */
/* Functions: planeIcon, milShipIcon, shipIcon, quakeIcon, fireIcon, */
/*            buoyIcon, volcanoIcon, radiationIcon                   */
/* Also: getCanvasStyle() for hybrid canvas/SVG rendering            */

// Canvas-mode styles — used at low zoom for performance (circleMarker)
// Dots are intentionally tiny with low opacity so dense areas glow instead of blobbing
function getCanvasStyle(key, p) {
    const z = map.getZoom();
    // Scale radius by zoom
    const zScale = z <= 2 ? 0.7 : z <= 3 ? 0.85 : z <= 4 ? 1.0 : 1.1;
    const opts = { renderer: canvasRenderer, weight: 0, fillOpacity: 0.6 };

    switch (key) {
        case 'flights': {
            const alt = p.altitude || 0;
            const isMil = p.military || (typeof isMilitaryAircraft === 'function' && isMilitaryAircraft(p));
            if (isMil) return { ...opts, radius: 4 * zScale, color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.85 };
            let color = '#4fc3f7';
            if (alt > 10000) color = '#e0f7fa';
            else if (alt > 3000) color = '#00bcd4';
            return { ...opts, radius: 3 * zScale, color, fillColor: color, fillOpacity: 0.65 };
        }
        case 'earthquakes': {
            const mag = p.mag || 0;
            if (mag >= 6) return { ...opts, radius: 8 * zScale, color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.6, weight: 1 };
            if (mag >= 4.5) return { ...opts, radius: 5 * zScale, color: '#ff9800', fillColor: '#ff9800', fillOpacity: 0.5, weight: 1 };
            if (mag >= 2.5) return { ...opts, radius: 3 * zScale, color: '#fdd835', fillColor: '#fdd835', fillOpacity: 0.35 };
            return { ...opts, radius: 1.5 * zScale, color: '#66bb6a', fillColor: '#66bb6a', fillOpacity: 0.25 };
        }
        case 'ships': {
            const isMil = p.military;
            if (isMil) return { ...opts, radius: 4 * zScale, color: '#ff4444', fillColor: '#ff4444', fillOpacity: 0.85 };
            const colors = { Cargo: '#4caf50', Tanker: '#f44336', Passenger: '#2196f3', Fishing: '#ffeb3b' };
            const c = colors[p.type] || '#4caf50';
            return { ...opts, radius: 2.5 * zScale, color: c, fillColor: c, fillOpacity: 0.6 };
        }
        case 'fires': {
            const frp = p.frp || 0;
            if (frp > 100) return { ...opts, radius: 3 * zScale, color: '#ff5722', fillColor: '#ff5722', fillOpacity: 0.6 };
            if (frp > 30) return { ...opts, radius: 2 * zScale, color: '#ff9800', fillColor: '#ff9800', fillOpacity: 0.5 };
            return { ...opts, radius: 1.5 * zScale, color: '#ffc107', fillColor: '#ffc107', fillOpacity: 0.4 };
        }
        case 'volcanoes':
            return { ...opts, radius: (p.active ? 2.5 : 1) * zScale, color: p.active ? '#ff1744' : '#795548',
                     fillColor: p.active ? '#ff1744' : '#795548', fillOpacity: p.active ? 0.4 : 0.15 };
        case 'radiation': {
            const colors = { normal: '#76ff03', watch: '#ffeb3b', elevated: '#ff9800', danger: '#ff1744' };
            const c = colors[p.level] || '#76ff03';
            return { ...opts, radius: (p.level === 'danger' ? 4 : p.level === 'elevated' ? 3 : 1.5) * zScale, color: c, fillColor: c, fillOpacity: 0.5 };
        }
        case 'buoys':
            return { ...opts, radius: 1.5 * zScale, color: '#29b6f6', fillColor: '#29b6f6', fillOpacity: 0.4 };
        case 'conflicts': {
            const c = p.severity === 'high' ? '#ff1744' : '#ff6d00';
            return { ...opts, radius: 5 * zScale, color: c, fillColor: c, fillOpacity: 0.8, weight: 1 };
        }
        default:
            return { ...opts, radius: 2 * zScale, color: '#888', fillColor: '#888' };
    }
}

function planeIcon(heading, altitude, isMil) {
    const alt = altitude || 0;
    let color = '#00bcd4';
    if (isMil) {
        // Military: red/orange tones
        color = '#ff4444';
    } else {
        if (alt < 3000) color = '#4fc3f7';
        else if (alt < 10000) color = '#00bcd4';
        else color = '#e0f7fa';
    }
    const h = heading || 0;
    const size = isMil ? 26 : 22;
    const mid = size / 2;

    // Airplane silhouette — body, wings, tail
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${h}, 11, 11)">
            <path d="M11 2 L11.8 8 L19 10.5 L19 11.5 L11.8 10 L12 16 L15 18 L15 19 L11 17.5 L7 19 L7 18 L10 16 L10.2 10 L3 11.5 L3 10.5 L10.2 8 Z"
                  fill="${color}" opacity="0.92" stroke="${isMil ? '#ff0000' : color}" stroke-width="${isMil ? 0.6 : 0.3}"/>
        </g>
        ${isMil ? `<circle cx="11" cy="11" r="10" fill="none" stroke="#ff444466" stroke-width="1" stroke-dasharray="2,2"/>` : ''}
    </svg>`;

    return L.divIcon({
        html: isMil ? `<div style="filter:drop-shadow(0 0 4px #ff4444);">${svg}</div>` : svg,
        className: '',
        iconSize: [size, size],
        iconAnchor: [mid, mid],
    });
}

function milShipIcon(heading) {
    const h = heading || 0;
    const color = '#ff4444';

    // Military vessel — angular warship hull
    const svg = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${h}, 11, 11)">
            <path d="M11 2 L14 7 L14 14 L13 17 L9 17 L8 14 L8 7 Z"
                  fill="${color}" opacity="0.9" stroke="#ff0000" stroke-width="0.5"/>
            <rect x="9.5" y="8" width="3" height="3" rx="0.5" fill="#ff6666" opacity="0.6"/>
            <line x1="11" y1="4" x2="11" y2="7" stroke="${color}" stroke-width="0.8"/>
        </g>
        <circle cx="11" cy="11" r="10" fill="none" stroke="#ff444466" stroke-width="1" stroke-dasharray="2,2"/>
    </svg>`;

    return L.divIcon({
        html: `<div style="filter:drop-shadow(0 0 4px #ff4444);">${svg}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
    });
}

function shipIcon(heading, vesselType) {
    const colors = { Cargo: '#4caf50', Tanker: '#f44336', Passenger: '#2196f3', Fishing: '#ffeb3b' };
    const color = colors[vesselType] || '#4caf50';
    const h = heading || 0;

    // Ship/vessel hull shape — pointed bow, flat stern, small bridge
    const svg = `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${h}, 10, 10)">
            <path d="M10 2 L13 7 L13 14 L12 16 L8 16 L7 14 L7 7 Z"
                  fill="${color}" opacity="0.9" stroke="${color}" stroke-width="0.4"/>
            <rect x="8.5" y="8" width="3" height="2.5" rx="0.5" fill="${color}" opacity="0.5"/>
        </g>
    </svg>`;

    return L.divIcon({ html: svg, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });
}

function quakeIcon(magnitude) {
    const mag = magnitude || 0;
    let size, color, cls, strokeW;
    if (mag < 2.5)      { size = 20; color = '#66bb6a'; cls = '';      strokeW = 1.5; }
    else if (mag < 4.5) { size = 26; color = '#fdd835'; cls = '';      strokeW = 1.8; }
    else if (mag < 6.0) { size = 34; color = '#ff9800'; cls = 'major'; strokeW = 2.2; }
    else                { size = 42; color = '#ff4444'; cls = 'major'; strokeW = 2.5; }

    // Seismograph spike — flat line with a sharp spike in the center
    const w = size;
    const h = size;
    const mid = w / 2;
    const baseY = h * 0.65;
    const peakY = h * 0.1;
    const dip = h * 0.85;

    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${mid}" cy="${mid}" r="${mid - 1}" fill="${color}" opacity="0.12"/>
        <polyline points="0,${baseY} ${mid * 0.4},${baseY} ${mid * 0.55},${dip} ${mid * 0.7},${peakY} ${mid * 0.85},${dip} ${mid},${baseY} ${mid * 1.15},${baseY} ${mid * 1.3},${baseY * 0.85} ${mid * 1.45},${baseY * 1.1} ${mid * 1.6},${baseY} ${w},${baseY}"
                  fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
    </svg>`;

    return L.divIcon({
        html: `<div class="quake-marker ${cls}">${svg}</div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function fireIcon(frp) {
    const power = frp || 0;
    let size, color;
    if (power > 100) { size = 18; color = '#ff5722'; }
    else if (power > 30) { size = 14; color = '#ff9800'; }
    else { size = 10; color = '#ffc107'; }

    // Flame shape — flickering fire
    const w = size;
    const h = size;
    const svg = `<svg width="${w}" height="${h}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1 C8 1 12 5 12 9 C12 11.5 10.2 13.5 8 14 C5.8 13.5 4 11.5 4 9 C4 5 8 1 8 1 Z"
              fill="${color}" opacity="0.85"/>
        <path d="M8 5 C8 5 10 7.5 10 9.5 C10 10.8 9.1 11.8 8 12 C6.9 11.8 6 10.8 6 9.5 C6 7.5 8 5 8 5 Z"
              fill="#fff3e0" opacity="0.6"/>
    </svg>`;

    return L.divIcon({
        html: `<div style="filter:drop-shadow(0 0 ${size / 3}px ${color});">${svg}</div>`,
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size - 2],
    });
}

function buoyIcon(waveHeight) {
    const wh = waveHeight || 0;
    let color = '#29b6f6';
    if (wh > 4) color = '#ff9800';
    else if (wh > 2) color = '#4fc3f7';

    // Buoy shape — floating marker with antenna and wave line
    const svg = `<svg width="14" height="18" viewBox="0 0 14 18" xmlns="http://www.w3.org/2000/svg">
        <line x1="7" y1="1" x2="7" y2="7" stroke="${color}" stroke-width="1" opacity="0.7"/>
        <circle cx="7" cy="2" r="1" fill="${color}" opacity="0.8"/>
        <path d="M3 7 L4 11 L10 11 L11 7 Z" fill="${color}" opacity="0.85"/>
        <path d="M4 11 L3.5 13 L10.5 13 L10 11 Z" fill="${color}" opacity="0.6"/>
        <path d="M1 14 Q3.5 12 7 14 Q10.5 16 13 14" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>
    </svg>`;

    return L.divIcon({ html: svg, className: '', iconSize: [14, 18], iconAnchor: [7, 11] });
}

function volcanoIcon(active) {
    const color = active ? '#ff1744' : '#795548';
    const glow = active ? `filter:drop-shadow(0 0 4px #ff1744);` : '';
    // Volcano triangle with eruption smoke
    const svg = `<svg width="18" height="20" viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg">
        ${active ? `<circle cx="9" cy="4" r="2" fill="#ff9800" opacity="0.6"/>
        <circle cx="7" cy="2" r="1.5" fill="#ff9800" opacity="0.4"/>
        <circle cx="11" cy="3" r="1" fill="#ffeb3b" opacity="0.5"/>` : ''}
        <polygon points="9,6 16,18 2,18" fill="${color}" opacity="0.9" stroke="${active ? '#ff4444' : '#5d4037'}" stroke-width="0.5"/>
        <polygon points="9,6 11,10 7,10" fill="${active ? '#ff6d00' : '#6d4c41'}" opacity="0.7"/>
    </svg>`;
    return L.divIcon({
        html: `<div style="${glow}">${svg}</div>`,
        className: '', iconSize: [18, 20], iconAnchor: [9, 18],
    });
}

function radiationIcon(level) {
    const colors = { normal: '#76ff03', watch: '#ffeb3b', elevated: '#ff9800', danger: '#ff1744' };
    const color = colors[level] || '#76ff03';
    const size = level === 'danger' ? 16 : level === 'elevated' ? 12 : 8;
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="1" opacity="0.6"/>
        <circle cx="8" cy="8" r="2.5" fill="${color}" opacity="0.8"/>
    </svg>`;
    const glow = level !== 'normal' ? `filter:drop-shadow(0 0 ${size/2}px ${color});` : '';
    return L.divIcon({
        html: `<div style="${glow}">${svg}</div>`,
        className: '', iconSize: [size, size], iconAnchor: [size/2, size/2],
    });
}

function conflictIcon(type, severity) {
    const isHigh = severity === 'high';
    const size = isHigh ? 24 : 18;
    const mid = size / 2;

    if (type === 'explosion') {
        // Explosion burst — seismic detection
        const color = isHigh ? '#ff1744' : '#ff6d00';
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="${color}" opacity="0.15"/>
            <path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"
                  fill="${color}" opacity="0.9" stroke="#fff" stroke-width="0.3"/>
        </svg>`;
        return L.divIcon({
            html: `<div style="filter:drop-shadow(0 0 6px ${color});animation:quake-pulse 1.5s infinite;">${svg}</div>`,
            className: '', iconSize: [size, size], iconAnchor: [mid, mid],
        });
    } else {
        // Thermal strike — fire/missile impact
        const color = isHigh ? '#ff3d00' : '#ff9100';
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/>
            <circle cx="12" cy="12" r="4" fill="${color}" opacity="0.8"/>
            <line x1="12" y1="2" x2="12" y2="6" stroke="${color}" stroke-width="1.5"/>
            <line x1="12" y1="18" x2="12" y2="22" stroke="${color}" stroke-width="1.5"/>
            <line x1="2" y1="12" x2="6" y2="12" stroke="${color}" stroke-width="1.5"/>
            <line x1="18" y1="12" x2="22" y2="12" stroke="${color}" stroke-width="1.5"/>
        </svg>`;
        return L.divIcon({
            html: `<div style="filter:drop-shadow(0 0 8px ${color});">${svg}</div>`,
            className: '', iconSize: [size, size], iconAnchor: [mid, mid],
        });
    }
}
