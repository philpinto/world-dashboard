"""AIS Ship Tracking — multi-source collector.

Sources:
1. AISStream.io WebSocket — free, global, real-time AIS
2. Digitraffic (Finnish) — free, no auth, Baltic coverage supplement

AISStream provides real-time global AIS. We run a persistent background
WebSocket that accumulates vessel positions. The collect() function
snapshots the current state into the cache as GeoJSON.
"""

import asyncio
import json
import os
import time
import traceback

from server.config import AISSTREAM_API_KEY

# Persistence — save vessel state to disk for fast restart
PERSIST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "vessels.json")
PERSIST_INTERVAL = 120  # Save every 2 minutes
_last_persist = 0

WS_URL = "wss://stream.aisstream.io/v0/stream"

SHIP_TYPE_MAP = {
    30: "Fishing", 31: "Towing", 32: "Towing", 33: "Dredging", 34: "Diving",
    35: "Military", 36: "Sailing", 37: "Pleasure",
    50: "Pilot", 51: "SAR", 52: "Tug", 53: "Port Tender", 54: "Anti-Pollution",
    55: "Law Enforce",
}
# Ranges
for i in range(40, 50): SHIP_TYPE_MAP[i] = "High Speed"
for i in range(60, 70): SHIP_TYPE_MAP[i] = "Passenger"
for i in range(70, 80): SHIP_TYPE_MAP[i] = "Cargo"
for i in range(80, 90): SHIP_TYPE_MAP[i] = "Tanker"

NAV_STATUS = {
    0: "Under way using engine", 1: "At anchor", 2: "Not under command",
    3: "Restricted manoeuvrability", 4: "Constrained by draught", 5: "Moored",
    6: "Aground", 7: "Engaged in fishing", 8: "Under way sailing",
    14: "AIS-SART", 15: "Not defined",
}

_vessels = {}
_ws_task = None
_ws_connected = False
_msg_count = 0


def _load_api_key():
    return AISSTREAM_API_KEY


def _classify_type(ship_type):
    if ship_type and ship_type in SHIP_TYPE_MAP:
        return SHIP_TYPE_MAP[ship_type]
    if ship_type and 20 <= ship_type <= 29:
        return "WIG"
    return "Other"


def _is_military(mmsi, ship_type, name):
    if ship_type == 35:
        return True
    mmsi_str = str(mmsi)
    if mmsi_str.startswith("3669"):
        return True
    if name:
        upper = name.upper()
        for prefix in ("USS ", "HMS ", "HMCS ", "HMAS ", "INS ", "JS ", "ROKS ", "TCG ", "FS ", "FGS "):
            if upper.startswith(prefix):
                return True
        if "NAVY" in upper or "WARSHIP" in upper or "COAST GUARD" in upper:
            return True
    return False


async def _ws_listener():
    """Persistent WebSocket connection to AISStream.io — global AIS."""
    global _ws_connected, _msg_count

    api_key = _load_api_key()
    if not api_key:
        print("[ships] no aisStreamApiKey in credentials.json — using Digitraffic only")
        return

    try:
        import websockets
    except ImportError:
        print("[ships] pip install websockets")
        return

    while True:
        try:
            print("[ships] connecting to AISStream.io...")
            async with websockets.connect(WS_URL, ping_interval=30, ping_timeout=30) as ws:
                subscribe = {
                    "APIKey": api_key,
                    "BoundingBoxes": [
                        [[-90, -180], [90, 180]],  # Global
                    ],
                    "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
                }
                await ws.send(json.dumps(subscribe))
                _ws_connected = True
                _msg_count = 0
                print("[ships] AISStream subscribed — waiting for data...")

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        _msg_count += 1

                        if _msg_count in (1, 50, 200, 1000, 5000) or _msg_count % 10000 == 0:
                            print(f"[ships] AIS msgs: {_msg_count} | vessels: {len(_vessels)}")

                        msg_type = msg.get("MessageType", "")
                        meta = msg.get("MetaData", {})
                        mmsi = meta.get("MMSI")
                        if not mmsi:
                            continue
                        mmsi_str = str(mmsi)

                        if msg_type == "PositionReport":
                            pos = msg.get("Message", {}).get("PositionReport", {})
                            lat = pos.get("Latitude")
                            lon = pos.get("Longitude")
                            if lat is None or lon is None:
                                continue
                            if abs(lat) > 90 or abs(lon) > 180 or (lat == 0 and lon == 0):
                                continue

                            ship_type = meta.get("ShipType", 0)
                            heading = pos.get("TrueHeading")
                            if heading is None or heading == 511:
                                heading = pos.get("Cog", 0)

                            existing = _vessels.get(mmsi_str, {})
                            name = (meta.get("ShipName") or "").strip() or existing.get("name", "")

                            _vessels[mmsi_str] = {
                                "lat": lat,
                                "lon": lon,
                                "heading": heading,
                                "speed": pos.get("Sog", 0),
                                "cog": pos.get("Cog", 0),
                                "nav_status": pos.get("NavigationalStatus", 15),
                                "ship_type": ship_type,
                                "name": name,
                                "destination": existing.get("destination", ""),
                                "mmsi": mmsi_str,
                                "military": _is_military(mmsi, ship_type, name),
                                "type_name": _classify_type(ship_type),
                                "updated": time.time(),
                            }

                        elif msg_type == "ShipStaticData":
                            static = msg.get("Message", {}).get("ShipStaticData", {})
                            ship_type = static.get("Type", 0)
                            name = (static.get("Name") or "").strip()
                            dest = (static.get("Destination") or "").strip()

                            existing = _vessels.get(mmsi_str, {})
                            existing["name"] = name or existing.get("name", "")
                            existing["destination"] = dest or existing.get("destination", "")
                            existing["ship_type"] = ship_type
                            existing["type_name"] = _classify_type(ship_type)
                            existing["military"] = _is_military(mmsi, ship_type, name)
                            existing["mmsi"] = mmsi_str
                            _vessels[mmsi_str] = existing

                    except Exception:
                        continue

        except Exception as e:
            _ws_connected = False
            print(f"[ships] WebSocket disconnected: {e}")
            print("[ships] reconnecting in 15s...")
            await asyncio.sleep(15)


def _save_vessels():
    """Save vessel state to disk for fast restart recovery."""
    global _last_persist
    try:
        os.makedirs(os.path.dirname(PERSIST_PATH), exist_ok=True)
        tmp = PERSIST_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(_vessels, f)
        os.rename(tmp, PERSIST_PATH)
        _last_persist = time.time()
    except Exception as e:
        print(f"[ships] persist save failed: {e}")


def _load_vessels():
    """Load vessel state from disk on startup."""
    try:
        if not os.path.exists(PERSIST_PATH):
            return
        with open(PERSIST_PATH) as f:
            data = json.load(f)
        now = time.time()
        loaded = 0
        for mmsi, v in data.items():
            if now - v.get("updated", 0) < 600:  # Only load entries < 10 min old
                _vessels[mmsi] = v
                loaded += 1
        if loaded:
            print(f"[ships] loaded {loaded} vessels from disk cache")
    except Exception as e:
        print(f"[ships] persist load failed: {e}")


def _start_ws():
    global _ws_task
    if _ws_task is None or _ws_task.done():
        _load_vessels()  # Load from disk on first start
        loop = asyncio.get_event_loop()
        _ws_task = loop.create_task(_ws_listener())


async def collect(cache, ttl: int):
    """Snapshot current vessel positions into cache as GeoJSON."""
    global _last_persist
    _start_ws()

    try:
        now = time.time()
        max_age = 600  # 10 min staleness
        features = []
        stale = []

        for mmsi_str, v in _vessels.items():
            if "lat" not in v or "lon" not in v:
                continue
            if now - v.get("updated", 0) > max_age:
                stale.append(mmsi_str)
                continue

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [v["lon"], v["lat"]]},
                "properties": {
                    "name": v.get("name", ""),
                    "mmsi": mmsi_str,
                    "type": v.get("type_name", "Other"),
                    "destination": v.get("destination", ""),
                    "heading": round(v.get("heading") or v.get("cog", 0), 1),
                    "speed": round(v.get("speed", 0), 1),
                    "navstat": NAV_STATUS.get(v.get("nav_status", 15), "Unknown"),
                    "military": v.get("military", False),
                    "ship_type_code": v.get("ship_type", 0),
                },
            })

        for k in stale:
            del _vessels[k]

        mil_count = sum(1 for f in features if f["properties"].get("military"))
        geojson = {"type": "FeatureCollection", "features": features}
        cache.set("ships", geojson, ttl)
        src = "AISStream" if _ws_connected else "buffered"
        print(f"[ships] cached {len(features)} vessels ({mil_count} military) via {src}")

        if time.time() - _last_persist > PERSIST_INTERVAL and len(_vessels) > 0:
            _save_vessels()

    except Exception as e:
        print(f"[ships] error: {e}")
        traceback.print_exc()
