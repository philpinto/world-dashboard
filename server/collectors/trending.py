"""X/Twitter Trending Topics — scraped from Trends24.in (US)."""

import re
import httpx

TRENDS24_URL = "https://trends24.in/united-states/"


async def collect(cache, ttl: int):
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(TRENDS24_URL, headers={
                "User-Agent": "Mozilla/5.0 (compatible; WorldDashboard/1.0)",
            })
            if resp.status_code != 200:
                print(f"[trending] HTTP {resp.status_code}")
                return

            html = resp.text

            # Parse trend names from list items: <li...><a...>TrendName</a>
            raw = re.findall(r'<li[^>]*>.*?<a[^>]*>([^<]+)</a>', html, re.DOTALL)

            # Deduplicate while preserving order, clean HTML entities
            seen = set()
            items = []
            for name in raw:
                name = name.strip()
                name = name.replace("&#39;", "'").replace("&amp;", "&").replace("&quot;", '"')
                lower = name.lower()
                if lower in seen or not name or len(name) < 2:
                    continue
                seen.add(lower)
                items.append({
                    "title": name,
                    "url": f"https://x.com/search?q={name.replace(' ', '%20')}&src=trend_click",
                })
                if len(items) >= 10:
                    break

            cache.set("trending", items, ttl)
            print(f"[trending] cached {len(items)} X trending topics")

    except Exception as e:
        print(f"[trending] error: {e}")
