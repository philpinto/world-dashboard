"""Flight tracking collector — multi-source.

Strategy:
- OpenSky Network (OAuth2) = primary for full global coverage (~10K aircraft)
- ADSB.fi /mil endpoint = military-flagged aircraft supplement
- Airplanes.live /mil endpoint = additional military supplement

OpenSky gives us the full picture. ADSB.fi and Airplanes.live add the
military dbFlags tagging that OpenSky doesn't have.
"""

import time
import httpx

from server.config import OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET

# OpenSky
TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
OPENSKY_URL = "https://opensky-network.org/api/states/all"

# Military endpoints (ADSBx v2 format)
ADSB_FI_MIL = "https://opendata.adsb.fi/api/v2/mil"
AIRPLANES_LIVE_MIL = "https://api.airplanes.live/v2/mil"

_token_cache = {"access_token": None, "expires_at": 0}
_mil_cache = {"map": {}, "last_fetch": 0}
MIL_REFRESH_INTERVAL = 300  # Refresh military tags every 5 minutes, not every cycle


async def _get_opensky_token(client):
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 30:
        return _token_cache["access_token"]
    client_id = OPENSKY_CLIENT_ID
    client_secret = OPENSKY_CLIENT_SECRET
    if not client_id or not client_secret:
        return None
    resp = await client.post(TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }, headers={"Content-Type": "application/x-www-form-urlencoded"})
    resp.raise_for_status()
    token_data = resp.json()
    _token_cache["access_token"] = token_data["access_token"]
    _token_cache["expires_at"] = time.time() + token_data.get("expires_in", 300)
    print(f"[flights] OAuth2 token refreshed (expires in {token_data.get('expires_in', '?')}s)")
    return _token_cache["access_token"]


def _parse_adsbx_mil(data):
    """Parse ADSBx v2 format from /mil endpoints. Returns dict keyed by hex."""
    mil_map = {}
    for ac in (data.get("ac") or []):
        hex_code = (ac.get("hex") or "").lower().strip()
        if not hex_code:
            continue
        db_flags = ac.get("dbFlags") or 0
        mil_map[hex_code] = {
            "military": bool(db_flags & 1),
            "db_flags": db_flags,
            "registration": (ac.get("r") or "").strip(),
            "aircraft_type": (ac.get("t") or "").strip(),
        }
    return mil_map


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            # 1. Fetch full global data from OpenSky
            features = []
            try:
                token = await _get_opensky_token(client)
                headers = {"Authorization": f"Bearer {token}"} if token else {}
                resp = await client.get(OPENSKY_URL, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                for s in (data.get("states") or []):
                    lon, lat = s[5], s[6]
                    if lon is None or lat is None:
                        continue
                    features.append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                        "properties": {
                            "icao24": s[0],
                            "callsign": (s[1] or "").strip(),
                            "origin_country": s[2],
                            "altitude": s[7],
                            "on_ground": s[8],
                            "velocity": s[9],
                            "heading": s[10],
                            "vertical_rate": s[11],
                            "geo_altitude": s[13],
                            "squawk": s[14],
                            "category": s[17] if len(s) > 17 else None,
                            "military": False,
                            "db_flags": 0,
                            "registration": None,
                            "aircraft_type": None,
                        },
                    })
            except Exception as e:
                print(f"[flights] OpenSky failed: {e}")

            if not features:
                print("[flights] no data from OpenSky")
                return

            # 2. Fetch military flags (cached — refreshed every 5 min, not every cycle)
            if time.time() - _mil_cache["last_fetch"] > MIL_REFRESH_INTERVAL:
                mil_map = {}
                for url, name in [(ADSB_FI_MIL, "adsb.fi"), (AIRPLANES_LIVE_MIL, "airplanes.live")]:
                    try:
                        resp = await client.get(url, timeout=15)
                        if resp.status_code == 200:
                            batch = _parse_adsbx_mil(resp.json())
                            mil_map.update(batch)
                            print(f"[flights] +{len(batch)} military tags from {name}")
                    except Exception as e:
                        print(f"[flights] {name} mil failed: {e}")
                _mil_cache["map"] = mil_map
                _mil_cache["last_fetch"] = time.time()
            else:
                mil_map = _mil_cache["map"]

            # 3. Merge military flags into OpenSky features
            for f in features:
                hex_code = (f["properties"]["icao24"] or "").lower().strip()
                mil_info = mil_map.get(hex_code)
                if mil_info:
                    f["properties"]["military"] = mil_info["military"]
                    f["properties"]["db_flags"] = mil_info["db_flags"]
                    if mil_info["registration"]:
                        f["properties"]["registration"] = mil_info["registration"]
                    if mil_info["aircraft_type"]:
                        f["properties"]["aircraft_type"] = mil_info["aircraft_type"]

            mil_count = sum(1 for f in features if f["properties"].get("military"))
            geojson = {"type": "FeatureCollection", "features": features}
            cache.set("flights", geojson, ttl)
            print(f"[flights] cached {len(features)} aircraft ({mil_count} military-tagged)")

    except Exception as e:
        print(f"[flights] error: {e}")
