/* ===== map.js — Leaflet map initialization, base layers, terminator ===== */

const map = L.map('map', {
    center: [20, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true,
});

// Dark tile layer — CartoDB Dark Matter
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
}).addTo(map);

// Zoom control
L.control.zoom({ position: 'bottomright' }).addTo(map);

// Scale bar
L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 200 }).addTo(map);

// Attribution
L.control.attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('&copy; <a href="https://carto.com/">CARTO</a> | World Dashboard')
    .addTo(map);

// Offset map top to clear status bar
map.getContainer().style.top = '38px';
map.getContainer().style.bottom = '0';
map.getContainer().style.height = 'calc(100vh - 38px)';
map.invalidateSize();


/* ===== DAY/NIGHT TERMINATOR ===== */

const Terminator = {
    _layer: null,

    // Solar declination and equation of time for a given date
    _sunPosition(date) {
        const rad = Math.PI / 180;
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const declination = -23.44 * Math.cos(rad * (360 / 365) * (dayOfYear + 10));

        const B = rad * (360 / 365) * (dayOfYear - 81);
        const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
        const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
        const solarNoonLng = -(utcHours - 12) * 15 + eot / 4;

        return { declination, solarNoonLng };
    },

    // Generate the terminator polygon (night side)
    _computeNightPolygon(date) {
        const rad = Math.PI / 180;
        const { declination, solarNoonLng } = this._sunPosition(date);
        const decRad = declination * rad;

        const points = [];

        // Compute terminator line: for each longitude, find the latitude where sun is at horizon
        for (let lng = -180; lng <= 180; lng += 2) {
            const lngRad = (lng - solarNoonLng) * rad;
            // Hour angle
            const ha = lngRad;
            // Terminator latitude: cos(90°) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(ha)
            // 0 = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(ha)
            // tan(lat) = -cos(ha)*cos(dec)/sin(dec) ... but simpler:
            const lat = Math.atan(-Math.cos(ha) / Math.tan(decRad)) / rad;
            points.push([lat, lng]);
        }

        // Close the polygon on the night side (south or north depending on season)
        // If declination > 0 (northern summer), south pole is in darkness
        const nightPole = declination > 0 ? -90 : 90;

        const nightPoly = [];
        // Add terminator line
        if (nightPole < 0) {
            // Night is on the south side of the terminator
            for (const p of points) nightPoly.push(p);
            nightPoly.push([-90, 180]);
            nightPoly.push([-90, -180]);
        } else {
            // Night is on the north side
            for (const p of points) nightPoly.push(p);
            nightPoly.push([90, 180]);
            nightPoly.push([90, -180]);
        }

        return nightPoly;
    },

    update() {
        if (this._layer) {
            map.removeLayer(this._layer);
        }

        const now = new Date();
        const nightPoly = this._computeNightPolygon(now);

        this._layer = L.polygon(nightPoly, {
            color: 'transparent',
            fillColor: '#000000',
            fillOpacity: 0.25,
            interactive: false,
            pane: 'shadowPane', // Render below markers
        }).addTo(map);
    },

    start() {
        this.update();
        // Update every 60 seconds
        setInterval(() => this.update(), 60000);
    }
};

// Start terminator
Terminator.start();
