/* ===== military.js — Military vehicle detection and wartime mode ===== */
/* Data: wartimeMode, MIL_HEX_PREFIXES, MIL_HEX_COUNTRY,               */
/*       MIL_CALLSIGNS, MIL_SQUAWKS                                     */
/* Functions: isMilitaryAircraft, isMilitaryShip, toggleWartime          */

let wartimeMode = false;

// US military ICAO24 hex prefixes (above civilian N-number space)
const MIL_HEX_PREFIXES = [
    'ae', 'af',           // US military primary range
    '43c', '43d', '43e', '43f', // UK RAF upper range
    '3f',                 // Germany GAF upper range
];

// Broader country military hex start ranges (first 2 chars)
const MIL_HEX_COUNTRY = {
    '10': 'Russia', '11': 'Russia',
    '3a': 'France', '3b': 'France',
};

// Known military callsign prefixes
const MIL_CALLSIGNS = [
    // US Air Force / AMC transports
    'RCH', 'REACH', 'SPAR', 'EVAC', 'DUKE', 'JAKE', 'CONVOY', 'AMWAY',
    // Tankers
    'BOOM', 'ARCO', 'OPEC', 'GLUCOSE', 'AZTEC', 'CACTI',
    // Surveillance / Recon
    'BANDSAW', 'CHALICE', 'SENTRY', 'JSTARS', 'NIGHTWATCH', 'ASPEN', 'MAGIC',
    // Special ops / fighters
    'SPOOKY', 'SHADOW', 'ANGEL', 'VIPER', 'EAGLE', 'RAPTOR', 'HORNET',
    // VIP / Presidential
    'SAM', 'VENUS', 'TOPCAT',
    // NATO / allied
    'NATO', 'ALLIED', 'ASCOT', // UK RAF transport
    'NAVY', 'ARMY',
    // Common military word callsigns
    'COBRA', 'HAWK', 'TALON', 'REAPER', 'GHOST', 'BLADE', 'FURY',
    'TITAN', 'STORM', 'FALCON', 'HUNTER', 'STRIKE', 'WOLF', 'IRON',
    'STEEL', 'WARHAWK', 'DARK', 'NIGHT', 'VALOR', 'BOLD',
    // Country-specific
    'RRR',   // Royal Australian Air Force
    'CNV',   // Canadian Forces
    'GAF',   // German Air Force
    'IAM',   // Italian Air Force
    'FAF',   // French Air Force
    'CASA',  // Spanish Air Force
    'THY',   // not military — exclude this
];

// Military squawk codes
const MIL_SQUAWKS = new Set([
    '0000', '4000', '5000', '5100', '5200', '5300', '5400',
    '6100', '6400', '7501', '7502', '7503', '7504', '7505',
    '7506', '7507', '7577', '7777',
    // High-altitude military ops
    '4400', '4401', '4402', '4403', '4410', '4411', '4412',
    '4440', '4441', '4442', '4443', '4444', '4445', '4446',
    '4447', '4448', '4449', '4450', '4451', '4452',
    '4454', '4455', '4456', '4460', '4465',
]);

function isMilitaryAircraft(p) {
    // 1. Database flag from ADSB.fi / Airplanes.live (most reliable)
    if (p.military === true) return true;
    if (p.db_flags && (p.db_flags & 1)) return true;

    const hex = (p.icao24 || '').toLowerCase();
    const callsign = (p.callsign || '').toUpperCase().trim();
    const squawk = p.squawk || '';

    // 2. Check hex prefix — high confidence
    for (const prefix of MIL_HEX_PREFIXES) {
        if (hex.startsWith(prefix)) return true;
    }

    // 3. US military hex range: above civilian N-number space (ADF7C8+)
    if (hex.startsWith('ad')) {
        const suffix = parseInt(hex.slice(2), 16);
        if (suffix >= 0xF7C8) return true;
    }

    // 4. Military squawk codes
    if (squawk && MIL_SQUAWKS.has(squawk)) return true;

    // 5. Military callsign prefix match
    if (callsign) {
        for (const prefix of MIL_CALLSIGNS) {
            if (callsign.startsWith(prefix)) return true;
        }
    }

    // 6. High-performance category (A6) or UAV (B6)
    const cat = p.category;
    if (cat === 'A6') return true;
    if (cat === 'B6') return true;

    return false;
}

function isMilitaryShip(p) {
    // 1. Database flag from AISStream (ship_type 35 or MMSI match)
    if (p.military === true) return true;

    const name = (p.name || '').toUpperCase();
    const type = (p.type || '').toUpperCase();

    // 2. Ship type string match
    if (type === 'MILITARY' || type === 'LAW ENFORCE' || type === 'SAR') return true;

    // 3. Naval vessel name prefixes
    if (name.startsWith('USS ')) return true;    // US Navy
    if (name.startsWith('HMS ')) return true;    // Royal Navy
    if (name.startsWith('HMCS ')) return true;   // Canadian Navy
    if (name.startsWith('HMAS ')) return true;   // Australian Navy
    if (name.startsWith('INS ')) return true;    // Indian Navy
    if (name.startsWith('JS ')) return true;     // Japanese Navy (JMSDF)
    if (name.startsWith('ROKS ')) return true;   // South Korean Navy
    if (name.startsWith('TCG ')) return true;    // Turkish Navy
    if (name.startsWith('FS ')) return true;     // French Navy
    if (name.startsWith('FGS ')) return true;    // German Navy
    if (name.startsWith('ITS ')) return true;    // Italian Navy
    if (name.startsWith('ESPS ')) return true;   // Spanish Navy
    if (name.includes('NAVY')) return true;
    if (name.includes('WARSHIP')) return true;
    if (name.includes('MILITARY')) return true;
    if (name.includes('COAST GUARD')) return true;
    if (name.includes('USCG')) return true;

    // 4. US federal MMSI pattern
    const mmsi = (p.mmsi || '').toString();
    if (mmsi.startsWith('3669')) return true;

    return false;
}

function toggleWartime() {
    wartimeMode = !wartimeMode;

    const btn = document.getElementById('wartimeBtn');
    const body = document.body;

    if (wartimeMode) {
        btn.classList.add('active');
        body.classList.add('wartime');
        // Force military-relevant layers ON, civilian OFF
        LAYERS.flights.enabled = true;
        LAYERS.ships.enabled = true;
        LAYERS.conflicts.enabled = true;
        LAYERS.radiation.enabled = true;
        LAYERS.buoys.enabled = true;
        LAYERS.earthquakes.enabled = false;
        LAYERS.fires.enabled = false;
        LAYERS.volcanoes.enabled = false;
    } else {
        btn.classList.remove('active');
        body.classList.remove('wartime');
        // Restore defaults
        LAYERS.flights.enabled = true;
        LAYERS.ships.enabled = true;
        LAYERS.earthquakes.enabled = true;
        LAYERS.conflicts.enabled = false;
    }

    // Sync toggle UI
    for (const [key, cfg] of Object.entries(LAYERS)) {
        const el = document.getElementById(`layer-${key}`);
        if (el) el.classList.toggle('active', cfg.enabled);
    }

    // Re-render active layers with/without filter
    for (const [key, cfg] of Object.entries(LAYERS)) {
        if (cfg.enabled && cfg.data) {
            renderLayer(key, cfg.data);
        }
    }
}
