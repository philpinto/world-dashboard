"""NOAA NDBC — ocean buoy / weather station collector."""

import httpx

LATEST_OBS_URL = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"


def parse_obs_line(line: str):
    """Parse a space-delimited NDBC observation line."""
    parts = line.split()
    if len(parts) < 19:
        return None
    try:
        station = parts[0]
        lat = float(parts[1])
        lon = float(parts[2])

        def safe_float(val):
            if val in ("MM", "N/A", ""):
                return None
            try:
                return float(val)
            except ValueError:
                return None

        return {
            "station": station,
            "lat": lat,
            "lon": lon,
            "wind_dir": safe_float(parts[5]),
            "wind_speed": safe_float(parts[6]),
            "gust": safe_float(parts[7]),
            "wave_height": safe_float(parts[8]),
            "wave_period": safe_float(parts[9]),
            "pressure": safe_float(parts[11]),
            "air_temp": safe_float(parts[13]),
            "water_temp": safe_float(parts[14]),
        }
    except (ValueError, IndexError):
        return None


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(LATEST_OBS_URL)
            resp.raise_for_status()

        lines = resp.text.strip().split("\n")
        features = []

        # Skip header lines (start with #)
        for line in lines:
            if line.startswith("#"):
                continue
            obs = parse_obs_line(line)
            if obs is None or obs["lat"] == 0 and obs["lon"] == 0:
                continue

            props = {k: v for k, v in obs.items() if k not in ("lat", "lon")}
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [obs["lon"], obs["lat"]]},
                "properties": props,
            })

        geojson = {"type": "FeatureCollection", "features": features}
        cache.set("buoys", geojson, ttl)
        print(f"[buoys] cached {len(features)} stations")

    except Exception as e:
        print(f"[buoys] error: {e}")
