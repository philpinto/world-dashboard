"""NASA FIRMS/VIIRS — satellite fire/thermal hotspot collector.

Queries multiple satellite sources for best coverage:
- VIIRS SNPP (2-day range for reliability)
- VIIRS NOAA-21
- MODIS
Deduplicates by proximity to avoid double-counting.
"""

import csv
import io
import httpx

from server.config import FIRMS_MAP_KEY as MAP_KEY

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/world/{days}"

# Query multiple sources — different satellites have different overpass times
SOURCES = [
    ("VIIRS_NOAA21_NRT", 1),   # NOAA-21, latest day
    ("MODIS_NRT", 1),          # MODIS, latest day
    ("VIIRS_SNPP_NRT", 2),     # SNPP, 2-day range (in case today's pass hasn't happened)
]


async def collect(cache, ttl: int):
    if not MAP_KEY:
        print("[fires] no FIRMS_MAP_KEY set — skipping (register free at https://firms.modaps.eosdis.nasa.gov/api/area/)")
        return

    try:
        all_features = []
        seen = set()  # Deduplicate by rounded lat/lon

        async with httpx.AsyncClient(timeout=60) as client:
            for source, days in SOURCES:
                try:
                    url = BASE_URL.format(key=MAP_KEY, source=source, days=days)
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue

                    reader = csv.DictReader(io.StringIO(resp.text))
                    count = 0
                    for row in reader:
                        try:
                            lat = float(row.get("latitude", 0))
                            lon = float(row.get("longitude", 0))
                            if lat == 0 and lon == 0:
                                continue

                            # Deduplicate — round to ~1km grid
                            grid_key = f"{round(lat, 2)},{round(lon, 2)}"
                            if grid_key in seen:
                                continue
                            seen.add(grid_key)

                            frp_val = row.get("frp", "0")
                            bright_val = row.get("bright_ti4", "0")

                            all_features.append({
                                "type": "Feature",
                                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                "properties": {
                                    "brightness": float(bright_val) if bright_val else 0,
                                    "frp": float(frp_val) if frp_val else 0,
                                    "confidence": row.get("confidence", "n"),
                                    "satellite": row.get("satellite", source.split("_")[0]),
                                    "acq_date": row.get("acq_date", ""),
                                    "acq_time": row.get("acq_time", ""),
                                    "daynight": row.get("daynight", ""),
                                    "type": row.get("type", "0"),
                                },
                            })
                            count += 1
                        except (ValueError, KeyError):
                            continue

                    if count:
                        print(f"[fires] +{count} from {source}")
                except Exception as e:
                    print(f"[fires] {source} failed: {e}")

        geojson = {"type": "FeatureCollection", "features": all_features}
        cache.set("fires", geojson, ttl)
        print(f"[fires] cached {len(all_features)} hotspots total")

    except Exception as e:
        print(f"[fires] error: {e}")
