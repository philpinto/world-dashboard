/* ===== search.js — Global search bar for finding features across all layers ===== */
/* Depends on: map.js, layers.js                                                   */

(function () {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        .search-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 60px;
        }
        .search-overlay.active { display: flex; }
        .search-box {
            width: 480px;
            max-width: 90vw;
            background: var(--bg-panel);
            border: 1px solid var(--border-hover);
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            overflow: hidden;
        }
        .search-input {
            width: 100%;
            padding: 12px 16px;
            background: transparent;
            border: none;
            border-bottom: 1px solid var(--border);
            color: var(--text-primary);
            font-size: 15px;
            font-family: inherit;
            outline: none;
        }
        .search-input::placeholder { color: var(--text-muted); }
        .search-results {
            max-height: 360px;
            overflow-y: auto;
        }
        .search-result {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 16px;
            cursor: pointer;
            transition: background 0.1s;
        }
        .search-result:hover, .search-result.selected {
            background: var(--accent-dim);
        }
        .search-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .search-match {
            flex: 1;
            color: var(--text-primary);
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .search-layer {
            color: var(--text-muted);
            font-size: 11px;
            text-transform: uppercase;
            flex-shrink: 0;
        }
        .search-empty {
            padding: 20px;
            text-align: center;
            color: var(--text-muted);
            font-size: 13px;
        }
    `;
    document.head.appendChild(style);

    // Build DOM
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML = `
        <div class="search-box">
            <input class="search-input" type="text" placeholder="Search flights, ships, quakes..." spellcheck="false" />
            <div class="search-results"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.search-input');
    const resultsEl = overlay.querySelector('.search-results');
    let debounceTimer = null;
    let selectedIdx = -1;
    let currentResults = [];

    // Property keys to search on per layer
    const SEARCH_FIELDS = {
        flights:     ['callsign', 'icao24'],
        ships:       ['name', 'mmsi'],
        earthquakes: ['place'],
        volcanoes:   ['name'],
        buoys:       ['station'],
        fires:       [],
        radiation:   [],
    };

    function open() {
        overlay.classList.add('active');
        input.value = '';
        resultsEl.innerHTML = '';
        currentResults = [];
        selectedIdx = -1;
        setTimeout(() => input.focus(), 10);
    }

    function close() {
        overlay.classList.remove('active');
        input.blur();
    }

    function search(query) {
        const q = query.trim().toLowerCase();
        currentResults = [];
        if (!q) { resultsEl.innerHTML = ''; return; }

        for (const [key, cfg] of Object.entries(LAYERS)) {
            if (!cfg.data || !cfg.data.features) continue;
            const fields = SEARCH_FIELDS[key] || [];
            if (!fields.length) continue;

            for (const f of cfg.data.features) {
                if (currentResults.length >= 10) break;
                const props = f.properties || {};
                for (const field of fields) {
                    const val = props[field];
                    if (val && String(val).toLowerCase().includes(q)) {
                        currentResults.push({ feature: f, key, color: cfg.color, text: String(val), layer: cfg.name });
                        break;
                    }
                }
            }
            if (currentResults.length >= 10) break;
        }

        selectedIdx = -1;
        renderResults();
    }

    function renderResults() {
        if (!currentResults.length) {
            resultsEl.innerHTML = '<div class="search-empty">No results</div>';
            return;
        }
        resultsEl.innerHTML = currentResults.map((r, i) => `
            <div class="search-result${i === selectedIdx ? ' selected' : ''}" data-idx="${i}">
                <div class="search-dot" style="background:${r.color};"></div>
                <div class="search-match">${escapeHtml(r.text)}</div>
                <div class="search-layer">${r.layer}</div>
            </div>
        `).join('');
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function selectResult(idx) {
        const r = currentResults[idx];
        if (!r || !r.feature.geometry) return;
        const coords = r.feature.geometry.coordinates;
        const latLng = [coords[1], coords[0]];
        close();
        map.flyTo(latLng, Math.max(map.getZoom(), 8));

        // Try to find and open the marker popup
        const layerGroup = LAYERS[r.key] && LAYERS[r.key].group;
        if (layerGroup) {
            layerGroup.eachLayer(function (marker) {
                const ll = marker.getLatLng();
                if (Math.abs(ll.lat - latLng[0]) < 0.001 && Math.abs(ll.lng - latLng[1]) < 0.001) {
                    setTimeout(() => marker.openPopup(), 600);
                }
            });
        }
    }

    // Events
    input.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => search(input.value), 200);
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); e.preventDefault(); return; }
        if (e.key === 'ArrowDown') {
            selectedIdx = Math.min(selectedIdx + 1, currentResults.length - 1);
            renderResults(); e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            selectedIdx = Math.max(selectedIdx - 1, 0);
            renderResults(); e.preventDefault();
        } else if (e.key === 'Enter' && selectedIdx >= 0) {
            selectResult(selectedIdx); e.preventDefault();
        }
    });

    resultsEl.addEventListener('click', function (e) {
        const row = e.target.closest('.search-result');
        if (row) selectResult(parseInt(row.dataset.idx));
    });

    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
    });

    document.addEventListener('keydown', function (e) {
        if (overlay.classList.contains('active')) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { open(); e.preventDefault(); }
        if (e.key === '/' && !e.ctrlKey && !e.metaKey) { open(); e.preventDefault(); }
    });
})();
