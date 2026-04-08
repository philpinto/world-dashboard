"""Smithsonian Global Volcanism Program — Holocene volcano data."""

import httpx

# Smithsonian WFS endpoint — all 1,215 Holocene volcanoes with eruption history
VOLCANOES_URL = (
    "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows"
    "?service=WFS&version=1.0.0&request=GetFeature"
    "&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes"
    "&outputFormat=application/json&maxFeatures=2000"
)


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(VOLCANOES_URL)
            resp.raise_for_status()
            data = resp.json()

        features = []
        for f in data.get("features", []):
            coords = f.get("geometry", {}).get("coordinates")
            if not coords or len(coords) < 2:
                continue

            p = f.get("properties", {})
            lon, lat = coords[0], coords[1]
            last_eruption = p.get("Last_Eruption_Year")

            # Consider "active" if erupted in last 50 years
            active = False
            if last_eruption:
                try:
                    active = int(last_eruption) >= 1975
                except (ValueError, TypeError):
                    pass

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "name": p.get("Volcano_Name", "Unknown"),
                    "country": p.get("Country", ""),
                    "region": p.get("Subregion", ""),
                    "type": p.get("Primary_Volcano_Type", ""),
                    "elevation": p.get("Elevation"),
                    "last_eruption": last_eruption,
                    "active": active,
                },
            })

        geojson = {"type": "FeatureCollection", "features": features}
        active_count = sum(1 for f in features if f["properties"]["active"])
        cache.set("volcanoes", geojson, ttl)
        print(f"[volcanoes] cached {len(features)} volcanoes ({active_count} recently active)")

    except Exception as e:
        print(f"[volcanoes] error: {e}")
