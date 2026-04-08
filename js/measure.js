/* ===== measure.js — Click-to-measure distance tool with Haversine formula ===== */
/* Depends on: map.js                                                             */

(function () {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        .measure-total {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--bg-panel);
            border: 1px solid var(--border-hover);
            border-radius: 6px;
            padding: 8px 14px;
            color: var(--text-primary);
            font-size: 13px;
            font-family: inherit;
            z-index: 1200;
            display: none;
            line-height: 1.5;
        }
        .measure-total .label { color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
        .measure-total .dist { font-weight: 600; color: #00e5ff; }
        .measure-btn {
            position: fixed;
            bottom: 20px;
            right: 80px;
            width: 34px;
            height: 34px;
            background: var(--bg-panel);
            border: 1px solid var(--border-hover);
            border-radius: 6px;
            color: var(--text-secondary);
            font-size: 15px;
            cursor: pointer;
            z-index: 1200;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s, color 0.15s;
        }
        .measure-btn:hover { background: var(--bg-secondary); color: var(--text-primary); }
        .measure-btn.active { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
        .measure-label {
            background: rgba(0, 0, 0, 0.75);
            color: #00e5ff;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            white-space: nowrap;
            border: 1px solid rgba(0, 229, 255, 0.3);
        }
    `;
    document.head.appendChild(style);

    // Build button and total box
    const btn = document.createElement('button');
    btn.className = 'measure-btn';
    btn.title = 'Measure distance (M)';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14L14 2M2 14L5 11M2 14L2 10M14 2L11 5M14 2L14 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    document.body.appendChild(btn);

    const totalBox = document.createElement('div');
    totalBox.className = 'measure-total';
    document.body.appendChild(totalBox);

    let active = false;
    let waypoints = [];
    let polyline = null;
    let labels = [];

    const R_KM = 6371;
    const KM_TO_NM = 0.539957;

    function haversine(a, b) {
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const sinLat = Math.sin(dLat / 2);
        const sinLng = Math.sin(dLng / 2);
        const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
        return 2 * R_KM * Math.asin(Math.sqrt(h));
    }

    function formatDist(km) {
        const nm = km * KM_TO_NM;
        if (km < 1) return `${(km * 1000).toFixed(0)} m / ${nm.toFixed(2)} nm`;
        return `${km.toFixed(1)} km / ${nm.toFixed(1)} nm`;
    }

    function updateLine() {
        if (polyline) map.removeLayer(polyline);
        if (waypoints.length < 2) return;
        polyline = L.polyline(waypoints, {
            color: '#00e5ff',
            weight: 2,
            dashArray: '8, 6',
            opacity: 0.9,
        }).addTo(map);
    }

    function updateLabels() {
        labels.forEach(l => map.removeLayer(l));
        labels = [];
        let total = 0;
        for (let i = 1; i < waypoints.length; i++) {
            const dist = haversine(waypoints[i - 1], waypoints[i]);
            total += dist;
            const mid = L.latLng(
                (waypoints[i - 1].lat + waypoints[i].lat) / 2,
                (waypoints[i - 1].lng + waypoints[i].lng) / 2
            );
            const label = L.marker(mid, {
                icon: L.divIcon({
                    className: '',
                    html: `<div class="measure-label">${formatDist(dist)}</div>`,
                    iconAnchor: [0, -8],
                }),
                interactive: false,
            }).addTo(map);
            labels.push(label);
        }

        if (total > 0) {
            totalBox.style.display = 'block';
            totalBox.innerHTML = `<div class="label">Total Distance</div><div class="dist">${formatDist(total)}</div>`;
        }
    }

    function clearMeasure() {
        if (polyline) { map.removeLayer(polyline); polyline = null; }
        labels.forEach(l => map.removeLayer(l));
        labels = [];
        waypoints = [];
        totalBox.style.display = 'none';
    }

    function deactivate() {
        active = false;
        btn.classList.remove('active');
        map.getContainer().style.cursor = '';
        map.off('click', onMapClick);
        map.off('dblclick', onMapDblClick);
        map.dragging.enable();
    }

    function activate() {
        clearMeasure();
        active = true;
        btn.classList.add('active');
        map.getContainer().style.cursor = 'crosshair';
        map.on('click', onMapClick);
        map.on('dblclick', onMapDblClick);
    }

    function toggle() {
        if (active) { deactivate(); clearMeasure(); }
        else activate();
    }

    function onMapClick(e) {
        waypoints.push(e.latlng);
        updateLine();
        updateLabels();
    }

    function onMapDblClick(e) {
        // Finish measuring (don't add the double-click point twice)
        deactivate();
    }

    btn.addEventListener('click', toggle);

    document.addEventListener('keydown', function (e) {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

        if (e.key === 'm' || e.key === 'M') {
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                toggle();
                e.preventDefault();
            }
        }
        if (e.key === 'Escape' && active) {
            deactivate();
            clearMeasure();
            e.preventDefault();
        }
    });
})();
