"""GDACS — active tropical cyclone tracker.

Uses the Global Disaster Alert and Coordination System (GDACS) API to fetch
active tropical cyclones worldwide.  Falls back to NWS alerts API for US
storms if GDACS is unavailable.  Returns GeoJSON FeatureCollection.
"""

import xml.etree.ElementTree as ET

import httpx

# Primary: GDACS tropical cyclone events (XML, worldwide, no auth)
GDACS_URL = (
    "https://www.gdacs.org/gdacsapi/api/events/getevents"
    "?eventtype=TC&limit=20&alertlevel=Green;Orange;Red"
)

# Fallback: NWS alerts for US hurricanes/tropical storms (JSON, no auth)
NWS_URL = (
    "https://api.weather.gov/alerts/active"
    "?event=Hurricane,Tropical Storm"
)


async def collect(cache, ttl: int):
    try:
        features = []

        async with httpx.AsyncClient(timeout=25) as client:
            gdacs_ok = await _fetch_gdacs(client, features)

            if not gdacs_ok:
                await _fetch_nws(client, features)

        geojson = {"type": "FeatureCollection", "features": features}
        cache.set("hurricanes", geojson, ttl)
        print(f"[hurricanes] cached {len(features)} active storms")

    except Exception as e:
        print(f"[hurricanes] error: {e}")


async def _fetch_gdacs(client: httpx.AsyncClient, features: list) -> bool:
    """Parse GDACS XML feed.  Returns True on success."""
    try:
        resp = await client.get(GDACS_URL)
        if resp.status_code != 200:
            return False

        root = ET.fromstring(resp.text)

        # GDACS uses a default namespace + several prefixed ones
        ns = {
            "": "http://www.w3.org/2005/Atom",
            "gdacs": "http://www.gdacs.org",
            "georss": "http://www.georss.org/georss",
            "dc": "http://purl.org/dc/elements/1.1/",
        }

        # Items may be <item> (RSS) or <entry> (Atom) depending on feed version
        items = root.findall(".//item")
        if not items:
            items = root.findall(".//{http://www.w3.org/2005/Atom}entry")

        for item in items:
            name = _text(item, "title") or _text(item, "{http://www.w3.org/2005/Atom}title") or "Unknown"
            link = _text(item, "link") or _text(item, "{http://www.w3.org/2005/Atom}link") or ""

            # Coordinates: <georss:point>lat lon</georss:point>
            point_text = _text(item, "{http://www.georss.org/georss}point")
            lat, lon = None, None
            if point_text:
                parts = point_text.strip().split()
                if len(parts) >= 2:
                    try:
                        lat, lon = float(parts[0]), float(parts[1])
                    except ValueError:
                        pass

            if lat is None or lon is None:
                continue

            alert_level = _text(item, "{http://www.gdacs.org}alertlevel") or ""
            severity = _text(item, "{http://www.gdacs.org}severity") or ""
            event_type = _text(item, "{http://www.gdacs.org}eventtype") or "TC"
            from_date = _text(item, "{http://www.gdacs.org}fromdate") or ""
            to_date = _text(item, "{http://www.gdacs.org}todate") or ""
            description = _text(item, "description") or _text(item, "{http://www.w3.org/2005/Atom}summary") or ""

            # Try to extract wind/category from severity text
            category, wind_speed, pressure = _parse_severity(severity)

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "name": name.strip(),
                    "category": category,
                    "wind_speed": wind_speed,
                    "pressure": pressure,
                    "movement": "",
                    "forecast": "",
                    "alert_level": alert_level,
                    "severity": severity,
                    "source": "GDACS",
                    "url": link,
                    "from_date": from_date,
                    "to_date": to_date,
                    "description": description[:300],
                },
            })

        return True
    except Exception:
        return False


async def _fetch_nws(client: httpx.AsyncClient, features: list):
    """Fallback: NWS alerts for US-area tropical storms."""
    try:
        resp = await client.get(NWS_URL, headers={"User-Agent": "WorldDashboard/1.0"})
        if resp.status_code != 200:
            return

        data = resp.json()
        seen_events = set()

        for feat in data.get("features", []):
            props = feat.get("properties", {})
            event = props.get("event", "")
            headline = props.get("headline", "")
            # Deduplicate by headline
            if headline in seen_events:
                continue
            seen_events.add(headline)

            # NWS alerts have polygon geometry, take centroid
            geom = feat.get("geometry")
            lat, lon = None, None
            if geom and geom.get("type") == "Point":
                coords = geom.get("coordinates", [])
                if len(coords) >= 2:
                    lon, lat = coords[0], coords[1]
            elif geom and geom.get("type") == "Polygon":
                coords = geom["coordinates"][0]
                lon = sum(c[0] for c in coords) / len(coords)
                lat = sum(c[1] for c in coords) / len(coords)

            if lat is None or lon is None:
                continue

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "name": headline or event,
                    "category": "Hurricane" if "Hurricane" in event else "Tropical Storm",
                    "wind_speed": None,
                    "pressure": None,
                    "movement": "",
                    "forecast": props.get("description", "")[:300],
                    "alert_level": props.get("severity", ""),
                    "severity": props.get("severity", ""),
                    "source": "NWS",
                    "url": props.get("@id", ""),
                    "from_date": props.get("effective", ""),
                    "to_date": props.get("expires", ""),
                    "description": props.get("description", "")[:300],
                },
            })
    except Exception:
        pass


def _text(element, tag):
    """Extract text from a child element, or None."""
    child = element.find(tag)
    if child is not None and child.text:
        return child.text
    return None


def _parse_severity(severity_text: str):
    """Try to extract category/wind/pressure from GDACS severity string."""
    category = ""
    wind_speed = None
    pressure = None

    text = severity_text.lower()
    if "cat" in text:
        for cat in ("5", "4", "3", "2", "1"):
            if f"cat {cat}" in text or f"cat{cat}" in text or f"category {cat}" in text:
                category = f"Category {cat}"
                break
    if not category:
        if "hurricane" in text:
            category = "Hurricane"
        elif "tropical storm" in text or "ts" in text:
            category = "Tropical Storm"
        elif "tropical depression" in text or "td" in text:
            category = "Tropical Depression"

    # Look for wind speed patterns like "120 km/h" or "75 kt"
    import re
    wind_match = re.search(r'(\d+)\s*(?:km/h|kph|kt|knots|mph)', severity_text, re.IGNORECASE)
    if wind_match:
        wind_speed = int(wind_match.group(1))

    pressure_match = re.search(r'(\d{3,4})\s*(?:mb|hpa|mbar)', severity_text, re.IGNORECASE)
    if pressure_match:
        pressure = int(pressure_match.group(1))

    return category, wind_speed, pressure
