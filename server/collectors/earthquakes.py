"""USGS Earthquake — real-time seismic data collector."""

import httpx

FEEDS = {
    "day": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    "week": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
}


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for period, url in FEEDS.items():
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                cache.set(f"earthquakes_{period}", data, ttl)
                count = len(data.get("features", []))
                print(f"[earthquakes] cached {count} events ({period})")

    except Exception as e:
        print(f"[earthquakes] error: {e}")
