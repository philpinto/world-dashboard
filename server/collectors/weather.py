"""NOAA SWPC — space weather / geomagnetic storm collector."""

import httpx

SCALES_URL = "https://services.swpc.noaa.gov/products/noaa-scales.json"
KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"
PLASMA_URL = "https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json"
ALERTS_URL = "https://services.swpc.noaa.gov/products/alerts.json"


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            scales_resp = await client.get(SCALES_URL)
            kp_resp = await client.get(KP_URL)
            plasma_resp = await client.get(PLASMA_URL)
            alerts_resp = await client.get(ALERTS_URL)

        # Parse scales (R/S/G current values)
        scales_data = scales_resp.json()
        scales = {}
        if isinstance(scales_data, dict):
            for key in ("R", "S", "G"):
                entry = scales_data.get(key, {})
                if isinstance(entry, dict):
                    scales[key] = {
                        "Scale": entry.get("Scale", "0"),
                        "Text": entry.get("Text", ""),
                    }

        # Parse Kp index — last entry from the array
        kp_data = kp_resp.json()
        kp_value = None
        kp_time = None
        if isinstance(kp_data, list) and len(kp_data) > 0:
            last = kp_data[-1]
            # New format: list of dicts with 'Kp' and 'time_tag' keys
            if isinstance(last, dict):
                kp_time = last.get("time_tag")
                try:
                    kp_value = float(last.get("Kp", 0))
                except (ValueError, TypeError):
                    pass
            # Legacy format: list of lists
            elif isinstance(last, list) and len(last) >= 2:
                kp_time = last[0]
                try:
                    kp_value = float(last[1])
                except (ValueError, TypeError):
                    pass

        # Parse solar wind plasma — last entry
        plasma_data = plasma_resp.json()
        solar_wind = {}
        if isinstance(plasma_data, list) and len(plasma_data) > 1:
            headers = plasma_data[0]
            last = plasma_data[-1]
            if isinstance(headers, list) and isinstance(last, list):
                for i, h in enumerate(headers):
                    if i < len(last):
                        solar_wind[h] = last[i]

        # Parse alerts — last 10
        alerts_data = alerts_resp.json()
        alerts = []
        if isinstance(alerts_data, list):
            for a in alerts_data[-10:]:
                if isinstance(a, dict):
                    alerts.append({
                        "issue_datetime": a.get("issue_datetime", ""),
                        "message": a.get("message", "")[:200],
                    })

        result = {
            "kp": {"value": kp_value, "time": kp_time},
            "solar_wind": solar_wind,
            "scales": scales,
            "alerts": alerts,
        }

        cache.set("space_weather", result, ttl)
        kp_str = f"Kp={kp_value}" if kp_value is not None else "Kp=?"
        print(f"[weather] cached space weather ({kp_str})")

    except Exception as e:
        print(f"[weather] error: {e}")
