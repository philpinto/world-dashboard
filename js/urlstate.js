/* ===== urlstate.js — Bookmarkable URL hash state for map view and layers ===== */
/* Depends on: map.js, layers.js                                                 */

(function () {
    let debounceTimer = null;
    let lastHash = '';

    function getEnabledLayerKeys() {
        return Object.keys(LAYERS).filter(k => LAYERS[k].enabled);
    }

    function buildHash() {
        const center = map.getCenter();
        const z = map.getZoom();
        const lat = center.lat.toFixed(4);
        const lng = center.lng.toFixed(4);
        const layers = getEnabledLayerKeys().join(',');
        return `#${z}/${lat}/${lng}/${layers}`;
    }

    function updateHash() {
        const hash = buildHash();
        if (hash === lastHash) return;
        lastHash = hash;
        history.replaceState(null, '', hash);
    }

    function scheduleUpdate() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateHash, 500);
    }

    function restoreFromHash() {
        const hash = window.location.hash;
        if (!hash || hash.length < 2) return false;

        const parts = hash.substring(1).split('/');
        if (parts.length < 3) return false;

        const zoom = parseInt(parts[0], 10);
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        const layerStr = parts[3] || '';

        if (isNaN(zoom) || isNaN(lat) || isNaN(lng)) return false;

        map.setView([lat, lng], zoom);

        if (layerStr) {
            const enabledKeys = layerStr.split(',').filter(Boolean);
            for (const key of Object.keys(LAYERS)) {
                const shouldEnable = enabledKeys.includes(key);
                LAYERS[key].enabled = shouldEnable;

                // Update sidebar toggle UI
                const el = document.getElementById('layer-' + key);
                if (el) {
                    if (shouldEnable) {
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                }
            }
        }

        lastHash = buildHash();
        return true;
    }

    // Restore on load
    restoreFromHash();

    // Listen for map changes
    map.on('moveend', scheduleUpdate);
    map.on('zoomend', scheduleUpdate);

    // Observe layer toggles — hook into sidebar clicks
    document.querySelector('.layer-sidebar').addEventListener('click', function (e) {
        const item = e.target.closest('.layer-item');
        if (item) {
            // Small delay to let the toggle handler in layers.js run first
            setTimeout(scheduleUpdate, 50);
        }
    });
})();
