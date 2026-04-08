"""Safecast — global radiation monitoring network.

Safecast is a citizen-science radiation monitoring network with thousands
of fixed and mobile sensors worldwide. Free API, no auth required.
Values are in CPM (counts per minute). Normal background: 20-60 CPM.
Elevated: >100 CPM. Dangerous: >300 CPM.
"""

import httpx

# Query recent measurements from multiple global regions
SAFECAST_URL = "https://api.safecast.org/measurements.json"

# Key monitoring regions with lat/lon centers
REGIONS = [
    {"lat": 37.5, "lon": 140.5, "name": "Japan/Fukushima"},
    {"lat": 51.4, "lon": 30.1, "name": "Ukraine/Chernobyl"},
    {"lat": 48.8, "lon": 2.3, "name": "France"},
    {"lat": 51.5, "lon": -0.1, "name": "UK"},
    {"lat": 50.1, "lon": 8.7, "name": "Germany"},
    {"lat": 40.7, "lon": -74.0, "name": "US East Coast"},
    {"lat": 34.0, "lon": -118.2, "name": "US West Coast"},
    {"lat": 37.5, "lon": 127.0, "name": "South Korea"},
    {"lat": 55.7, "lon": 37.6, "name": "Russia/Moscow"},
    {"lat": 35.7, "lon": 51.4, "name": "Iran"},
    {"lat": 28.6, "lon": 77.2, "name": "India"},
    {"lat": -33.9, "lon": 151.2, "name": "Australia"},
]


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            features = []
            seen_ids = set()

            for region in REGIONS:
                try:
                    params = {
                        "latitude": region["lat"],
                        "longitude": region["lon"],
                        "distance": 5000,  # km
                        "limit": 50,
                        "order": "captured_at desc",
                    }
                    resp = await client.get(SAFECAST_URL, params=params)
                    if resp.status_code != 200:
                        continue

                    measurements = resp.json()
                    for m in measurements:
                        mid = m.get("id")
                        if mid in seen_ids:
                            continue
                        seen_ids.add(mid)

                        lat = m.get("latitude")
                        lon = m.get("longitude")
                        value = m.get("value")
                        if lat is None or lon is None or value is None:
                            continue

                        # Classify threat level
                        level = "normal"
                        if value > 300:
                            level = "danger"
                        elif value > 100:
                            level = "elevated"
                        elif value > 60:
                            level = "watch"

                        features.append({
                            "type": "Feature",
                            "geometry": {"type": "Point", "coordinates": [lon, lat]},
                            "properties": {
                                "value": value,
                                "unit": m.get("unit", "cpm"),
                                "level": level,
                                "captured_at": m.get("captured_at", ""),
                                "device_id": m.get("device_id"),
                                "location": m.get("location_name", ""),
                            },
                        })
                except Exception:
                    continue

            elevated = sum(1 for f in features if f["properties"]["level"] in ("elevated", "danger"))
            geojson = {"type": "FeatureCollection", "features": features}
            cache.set("radiation", geojson, ttl)
            print(f"[radiation] cached {len(features)} readings ({elevated} elevated)")

    except Exception as e:
        print(f"[radiation] error: {e}")
