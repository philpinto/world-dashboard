"""Conflict zone detection — explosions, thermal strikes, active conflict areas.

Sources:
1. USGS — seismic events typed as "explosion" in conflict zones only
2. NASA FIRMS VIIRS — thermal anomalies in known conflict zones (detects strikes)
3. Active conflict zone polygons — static reference showing where wars are happening

Conflict zones monitored:
- Ukraine: 22-40E, 44-53N
- Israel/Palestine/Lebanon: 33.5-36E, 29-34N
- Syria: 35-42E, 32-37N
- Yemen: 42-55E, 12-19N
- Sudan: 21-39E, 3-23N
- Myanmar: 92-102E, 9-29N
"""

import httpx

# USGS explosions
USGS_EXPLOSIONS = (
    "https://earthquake.usgs.gov/fdsnws/event/1/query"
    "?format=geojson&eventtype=explosion&starttime=NOW-30days&minmagnitude=1&limit=100"
)

# NASA FIRMS for conflict zone thermal detection (uses cached fire data)
# When FIRMS_MAP_KEY is set, the fires collector runs and we filter for conflict zones

# Conflict zone bounding boxes for FIRMS thermal filtering
CONFLICT_ZONES = [
    {"name": "Ukraine",          "bbox": [22, 44, 40, 53]},
    {"name": "Israel/Palestine",  "bbox": [34, 29, 36, 34]},
    {"name": "Syria",            "bbox": [35, 32, 42, 37]},
    {"name": "Yemen",            "bbox": [42, 12, 55, 19]},
    {"name": "Sudan",            "bbox": [21, 3, 39, 23]},
    {"name": "Myanmar",          "bbox": [92, 9, 102, 29]},
]


def _in_conflict_zone(lon, lat):
    """Check if coordinates fall within a known conflict zone."""
    for zone in CONFLICT_ZONES:
        b = zone["bbox"]
        if b[0] <= lon <= b[2] and b[1] <= lat <= b[3]:
            return zone["name"]
    return None


async def collect(cache, ttl: int):
    try:
        features = []
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:

            # 1. USGS explosion-type seismic events — ONLY in conflict zones
            # (Mining/quarry blasts in US, Australia etc are not conflict events)
            try:
                resp = await client.get(USGS_EXPLOSIONS)
                usgs_total = 0
                usgs_conflict = 0
                if resp.status_code == 200:
                    data = resp.json()
                    for f in data.get("features", []):
                        p = f.get("properties", {})
                        coords = f.get("geometry", {}).get("coordinates", [])
                        if len(coords) < 2:
                            continue
                        usgs_total += 1
                        zone = _in_conflict_zone(coords[0], coords[1])
                        if not zone:
                            continue  # Skip — likely mining/quarry blast
                        usgs_conflict += 1
                        features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
                            "properties": {
                                "type": "explosion",
                                "source": "USGS Seismic",
                                "title": p.get("title", "Seismic explosion"),
                                "magnitude": p.get("mag"),
                                "time": p.get("time"),
                                "zone": zone,
                                "url": p.get("url", ""),
                                "severity": "high" if (p.get("mag") or 0) >= 4 else "medium",
                            },
                        })
                    print(f"[conflicts] USGS: {usgs_conflict} in conflict zones (filtered {usgs_total - usgs_conflict} mining blasts)")
            except Exception as e:
                print(f"[conflicts] USGS failed: {e}")

            # 2. Check if FIRMS fire data is cached — filter for conflict zones
            # We pull from the existing fires cache rather than making another API call
            fires_data = cache.get("fires")
            conflict_fires = 0
            if fires_data and isinstance(fires_data, dict):
                for f in fires_data.get("features", []):
                    coords = f.get("geometry", {}).get("coordinates", [])
                    if len(coords) < 2:
                        continue
                    zone = _in_conflict_zone(coords[0], coords[1])
                    if zone:
                        fp = f.get("properties", {})
                        frp = fp.get("frp", 0)
                        # Only high-power thermal events in conflict zones (likely strikes, not campfires)
                        if frp and frp > 10:
                            features.append({
                                "type": "Feature",
                                "geometry": f["geometry"],
                                "properties": {
                                    "type": "thermal_strike",
                                    "source": "NASA VIIRS",
                                    "title": f"Thermal anomaly in {zone}",
                                    "frp": frp,
                                    "confidence": fp.get("confidence", "n"),
                                    "time": f"{fp.get('acq_date', '')} {fp.get('acq_time', '')}",
                                    "zone": zone,
                                    "severity": "high" if frp > 50 else "medium",
                                },
                            })
                            conflict_fires += 1

                if conflict_fires:
                    print(f"[conflicts] {conflict_fires} VIIRS thermal events in conflict zones")

        event_count = len(features)
        geojson = {"type": "FeatureCollection", "features": features}
        cache.set("conflicts", geojson, ttl)
        print(f"[conflicts] cached {event_count} conflict events")

    except Exception as e:
        print(f"[conflicts] error: {e}")
