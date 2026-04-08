"""Breaking news & disaster alerts aggregator.

Pulls from multiple free RSS/Atom/JSON feeds and merges into a single
deduplicated, time-sorted list of headlines.
"""

import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

# Breaking news RSS feeds
BBC_WORLD_RSS = "https://feeds.bbci.co.uk/news/world/rss.xml"
ALJAZEERA_RSS = "https://www.aljazeera.com/xml/rss/all.xml"

# Disaster/crisis feeds
GDACS_RSS = "https://www.gdacs.org/xml/rss.xml"
USGS_ATOM = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom"
RELIEFWEB_URL = (
    "https://api.reliefweb.int/v1/reports"
    "?appname=worlddashboard&limit=10&sort[]=date:desc"
    "&fields[include][]=title"
    "&fields[include][]=url"
    "&fields[include][]=date.created"
    "&fields[include][]=source.name"
)

MAX_ITEMS = 40


async def collect(cache, ttl: int):
    try:
        items = []

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            await _fetch_rss(client, items, BBC_WORLD_RSS, "BBC")
            await _fetch_rss(client, items, ALJAZEERA_RSS, "Al Jazeera")
            await _fetch_gdacs(client, items)
            await _fetch_usgs(client, items)
            await _fetch_reliefweb(client, items)

        # Deduplicate by title similarity
        items = _deduplicate(items)

        # Sort newest first, limit
        items.sort(key=lambda x: x.get("time", ""), reverse=True)
        items = items[:MAX_ITEMS]

        cache.set("news", items, ttl)
        print(f"[news] cached {len(items)} headlines")

    except Exception as e:
        print(f"[news] error: {e}")


async def _fetch_rss(client: httpx.AsyncClient, items: list, url: str, source: str):
    """Parse a generic RSS feed."""
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return

        root = ET.fromstring(resp.text)
        for item in root.findall(".//item")[:15]:
            title = _text(item, "title") or ""
            link = _text(item, "link") or ""
            pub_date = _text(item, "pubDate") or ""
            iso_time = _parse_rss_date(pub_date)

            if title and len(title.strip()) > 10:
                items.append({
                    "title": title.strip(),
                    "url": link.strip(),
                    "source": source,
                    "time": iso_time,
                })
    except Exception:
        pass


async def _fetch_gdacs(client: httpx.AsyncClient, items: list):
    """Parse GDACS RSS feed."""
    try:
        resp = await client.get(GDACS_RSS)
        if resp.status_code != 200:
            return

        root = ET.fromstring(resp.text)
        for item in root.findall(".//item"):
            title = _text(item, "title") or ""
            link = _text(item, "link") or ""
            pub_date = _text(item, "pubDate") or ""
            iso_time = _parse_rss_date(pub_date)

            if title:
                items.append({
                    "title": title.strip(),
                    "url": link.strip(),
                    "source": "GDACS",
                    "time": iso_time,
                })
    except Exception:
        pass


async def _fetch_usgs(client: httpx.AsyncClient, items: list):
    """Parse USGS Atom feed for significant earthquakes."""
    try:
        resp = await client.get(USGS_ATOM)
        if resp.status_code != 200:
            return

        root = ET.fromstring(resp.text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        for entry in root.findall("atom:entry", ns):
            title = _text(entry, "{http://www.w3.org/2005/Atom}title") or ""
            link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            link = link_el.get("href", "") if link_el is not None else ""
            updated = _text(entry, "{http://www.w3.org/2005/Atom}updated") or ""

            if title:
                items.append({
                    "title": title.strip(),
                    "url": link.strip(),
                    "source": "USGS",
                    "time": updated,
                })
    except Exception:
        pass


async def _fetch_reliefweb(client: httpx.AsyncClient, items: list):
    """Fetch ReliefWeb JSON API."""
    try:
        resp = await client.get(RELIEFWEB_URL)
        if resp.status_code != 200:
            return

        data = resp.json()
        for report in data.get("data", []):
            fields = report.get("fields", {})
            title = fields.get("title", "")
            url = fields.get("url", "")
            created = fields.get("date", {}).get("created", "")
            sources = fields.get("source", [])
            source_name = sources[0].get("name", "ReliefWeb") if sources else "ReliefWeb"

            if title:
                items.append({
                    "title": title.strip(),
                    "url": url.strip(),
                    "source": source_name,
                    "time": created,
                })
    except Exception:
        pass


def _text(element, tag):
    """Extract text from a child element, or None."""
    child = element.find(tag)
    if child is not None and child.text:
        return child.text
    return None


def _parse_rss_date(date_str: str) -> str:
    """Try to parse an RSS date into ISO format."""
    if not date_str:
        return ""
    # Common RSS date format: "Mon, 01 Jan 2024 12:00:00 GMT"
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
    ):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return date_str


def _deduplicate(items: list) -> list:
    """Remove near-duplicate titles (case-insensitive prefix match)."""
    seen = set()
    result = []
    for item in items:
        # Normalize: lowercase, first 60 chars
        key = item["title"].lower().strip()[:60]
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
