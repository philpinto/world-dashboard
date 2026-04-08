/* ===== countryfilter.js — Click-to-filter-by-country on map ===== */
/* Uses map click + point-in-polygon instead of invisible boundary layers */
/* Depends on: map.js, flags.js                                         */

(function () {
    window.countryFilter = null;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        .country-filter-chip {
            position: fixed;
            top: 44px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1001;
            display: none;
            align-items: center;
            gap: 8px;
            padding: 6px 14px 6px 12px;
            background: var(--bg-panel);
            border: 1px solid var(--accent);
            border-radius: 20px;
            font-size: 13px;
            color: var(--text-primary);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(8px);
            cursor: default;
            user-select: none;
        }
        .chip-flag { font-size: 16px; line-height: 1; }
        .chip-name { font-weight: 600; letter-spacing: 0.3px; }
        .chip-close {
            margin-left: 4px; font-size: 16px; line-height: 1;
            cursor: pointer; color: var(--text-muted); transition: color 0.15s;
        }
        .chip-close:hover { color: var(--critical, #ff4444); }
    `;
    document.head.appendChild(style);

    // Build chip
    const chip = document.createElement('div');
    chip.id = 'countryFilterChip';
    chip.className = 'country-filter-chip';
    chip.innerHTML = `<span class="chip-flag" id="countryFilterFlag"></span><span class="chip-name" id="countryFilterName"></span><span class="chip-close" title="Clear filter">&times;</span>`;
    document.body.appendChild(chip);
    chip.querySelector('.chip-close').addEventListener('click', function (e) {
        e.stopPropagation();
        clearCountryFilter();
    });

    // Country boundaries GeoJSON (loaded once)
    let countryFeatures = null;
    let highlightLayer = null;

    // Simple point-in-polygon (ray casting)
    function pointInPolygon(lat, lng, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    function findCountryAt(lat, lng) {
        if (!countryFeatures) return null;
        for (const feature of countryFeatures) {
            const geom = feature.geometry;
            let rings = [];
            if (geom.type === 'Polygon') {
                rings = [geom.coordinates[0]];
            } else if (geom.type === 'MultiPolygon') {
                rings = geom.coordinates.map(p => p[0]);
            }
            for (const ring of rings) {
                if (pointInPolygon(lat, lng, ring)) {
                    return feature;
                }
            }
        }
        return null;
    }

    // Note: Natural Earth GeoJSON has coordinates as [lng, lat]
    // but our pointInPolygon checks lng against x (index 0) and lat against y (index 1)
    // So we need to swap: check lat against index 1, lng against index 0 — which is what we do.

    function applyCountryFilter(name, feature) {
        // Remove old highlight
        if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }

        window.countryFilter = name;

        // Highlight selected country
        highlightLayer = L.geoJSON(feature, {
            style: { fillOpacity: 0.06, fillColor: '#00d4aa', weight: 2, color: '#00d4aa' },
            interactive: false,
        }).addTo(map);

        // Update chip
        const flag = typeof countryToFlag === 'function' ? countryToFlag(name) : '';
        document.getElementById('countryFilterFlag').textContent = flag;
        document.getElementById('countryFilterName').textContent = name;
        chip.style.display = 'flex';

        // Re-render
        if (typeof window.reRenderAllLayers === 'function') window.reRenderAllLayers();
    }

    window.clearCountryFilter = function () {
        if (highlightLayer) { map.removeLayer(highlightLayer); highlightLayer = null; }
        window.countryFilter = null;
        chip.style.display = 'none';
        if (typeof window.reRenderAllLayers === 'function') window.reRenderAllLayers();
    };

    // Load boundaries and listen for map clicks
    async function init() {
        try {
            const resp = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson');
            if (!resp.ok) throw new Error('Failed to load');
            const geojson = await resp.json();
            countryFeatures = geojson.features;
            console.log(`[countryfilter] loaded ${countryFeatures.length} country boundaries`);
        } catch (e) {
            console.warn('[countryfilter]', e);
            return;
        }

        // Listen for map clicks — find which country was clicked
        map.on('click', function (e) {
            const feature = findCountryAt(e.latlng.lat, e.latlng.lng);
            if (!feature) return;

            const name = feature.properties.ADMIN || feature.properties.NAME || '';
            if (!name) return;

            // Toggle off if same country
            if (window.countryFilter === name) {
                clearCountryFilter();
            } else {
                applyCountryFilter(name, feature);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
