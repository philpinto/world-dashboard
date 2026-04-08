"""World Dashboard — FastAPI backend serving cached real-time data layers."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from server.cache import cache
from server.collectors import flights, earthquakes, ships, fires, weather, buoys, volcanoes, radiation, hurricanes, news, conflicts, trending

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# All collectors with their refresh config
COLLECTORS = {
    "flights":       {"module": flights,     "interval": 60,   "ttl": 90},
    "earthquakes":   {"module": earthquakes, "interval": 60,   "ttl": 90},
    "ships":         {"module": ships,       "interval": 60,   "ttl": 90},
    "fires":         {"module": fires,       "interval": 600,  "ttl": 900},
    "space_weather": {"module": weather,     "interval": 60,   "ttl": 90},
    "buoys":         {"module": buoys,       "interval": 300,  "ttl": 600},
    "volcanoes":     {"module": volcanoes,   "interval": 3600, "ttl": 7200},  # hourly
    "radiation":     {"module": radiation,   "interval": 300,  "ttl": 600},   # 5 min
    "hurricanes":    {"module": hurricanes,  "interval": 600,  "ttl": 900},   # 10 min
    "news":          {"module": news,        "interval": 300,  "ttl": 600},   # 5 min
    "conflicts":     {"module": conflicts,  "interval": 300,  "ttl": 600},   # 5 min
    "trending":      {"module": trending,  "interval": 600,  "ttl": 900},   # 10 min
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()

    for name, cfg in COLLECTORS.items():
        scheduler.add_job(
            cfg["module"].collect,
            "interval",
            seconds=cfg["interval"],
            id=name,
            kwargs={"cache": cache, "ttl": cfg["ttl"]},
            next_run_time=None,  # don't run immediately, stagger below
        )

    scheduler.start()

    # Stagger initial fetches to avoid hammering all APIs at once
    import asyncio
    for i, (name, cfg) in enumerate(COLLECTORS.items()):
        asyncio.get_event_loop().call_later(
            i * 2,
            lambda n=name, c=cfg: asyncio.ensure_future(
                c["module"].collect(cache=cache, ttl=c["ttl"])
            ),
        )
        # Also trigger the scheduler job so it starts repeating
        job = scheduler.get_job(name)
        if job:
            import datetime
            scheduler.modify_job(
                name,
                next_run_time=datetime.datetime.now(
                    datetime.timezone.utc
                ) + datetime.timedelta(seconds=cfg["interval"] + i * 2),
            )

    yield
    scheduler.shutdown()


app = FastAPI(title="World Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static files ---
app.mount("/css", StaticFiles(directory=os.path.join(ROOT, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(ROOT, "js")), name="js")
app.mount("/assets", StaticFiles(directory=os.path.join(ROOT, "assets")), name="assets")


@app.get("/")
async def index():
    return FileResponse(os.path.join(ROOT, "index.html"))


@app.get("/api/health")
async def health():
    status = {}
    for name, cfg in COLLECTORS.items():
        info = cache.info(name)
        status[name] = {
            "status": "live" if info["status"] == "cached" else "waiting",
            "ttl_remaining": info["ttl_remaining"],
            "refresh_interval": cfg["interval"],
        }
    return JSONResponse(status)


@app.get("/api/flights")
async def get_flights():
    data = cache.get("flights")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/earthquakes")
async def get_earthquakes(range: str = "day"):
    key = f"earthquakes_{range}" if range in ("day", "week") else "earthquakes_day"
    data = cache.get(key)
    if data is None:
        data = cache.get("earthquakes_day")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/ships")
async def get_ships():
    data = cache.get("ships")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/fires")
async def get_fires():
    data = cache.get("fires")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/space-weather")
async def get_space_weather():
    data = cache.get("space_weather")
    if data is None:
        return JSONResponse({"kp": None, "solar_wind": None, "scales": None, "alerts": []})
    return JSONResponse(data)


@app.get("/api/buoys")
async def get_buoys():
    data = cache.get("buoys")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/volcanoes")
async def get_volcanoes():
    data = cache.get("volcanoes")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/radiation")
async def get_radiation():
    data = cache.get("radiation")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/hurricanes")
async def get_hurricanes():
    data = cache.get("hurricanes")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/news")
async def get_news():
    data = cache.get("news")
    if data is None:
        return JSONResponse([])
    return JSONResponse(data)


@app.get("/api/conflicts")
async def get_conflicts():
    data = cache.get("conflicts")
    if data is None:
        return JSONResponse({"type": "FeatureCollection", "features": []})
    return JSONResponse(data)


@app.get("/api/trending")
async def get_trending():
    data = cache.get("trending")
    if data is None:
        return JSONResponse([])
    return JSONResponse(data)


@app.get("/api/threat-level")
async def get_threat_level():
    score = 0
    factors = []

    # --- Earthquakes (only significant ones matter) ---
    # M4.5-5.9 happen ~50/day worldwide — normal. Only M6+ is notable, M7+ is serious.
    eq_data = cache.get("earthquakes_day")
    if eq_data and isinstance(eq_data, dict):
        m7_count, m6_count = 0, 0
        max_mag = 0
        for feat in eq_data.get("features", []):
            mag = feat.get("properties", {}).get("mag")
            if mag is None:
                continue
            max_mag = max(max_mag, mag)
            if mag >= 7:
                m7_count += 1
            elif mag >= 6:
                m6_count += 1
        if m7_count > 0:
            pts = m7_count * 25
            score += pts
            factors.append({"source": "earthquake", "detail": f"{m7_count}x M7+ earthquake (max M{max_mag:.1f})", "points": pts})
        if m6_count > 0:
            pts = m6_count * 8
            score += pts
            factors.append({"source": "earthquake", "detail": f"{m6_count}x M6+ earthquake", "points": pts})

    # --- Space weather ---
    sw_data = cache.get("space_weather")
    if sw_data and isinstance(sw_data, dict):
        kp_info = sw_data.get("kp", {})
        kp_val = kp_info.get("value") if isinstance(kp_info, dict) else None
        if kp_val is not None:
            if kp_val >= 8:
                score += 30
                factors.append({"source": "space_weather", "detail": f"Kp={kp_val} (extreme geomagnetic storm)", "points": 30})
            elif kp_val >= 7:
                score += 20
                factors.append({"source": "space_weather", "detail": f"Kp={kp_val} (severe storm — possible grid disruption)", "points": 20})
            elif kp_val >= 5:
                score += 10
                factors.append({"source": "space_weather", "detail": f"Kp={kp_val} (geomagnetic storm)", "points": 10})
            # Kp 4 is "active" — normal, don't score

    # --- Radiation (context-aware) ---
    # Known hot zones (Chernobyl, Fukushima vicinity) always read high — exclude them.
    # Only alarming if elevated readings appear in unexpected locations.
    KNOWN_HOTZONE_COORDS = [
        (51.39, 30.04, 50),  # Chernobyl (~50km radius)
        (37.42, 141.03, 30),  # Fukushima Daiichi (~30km radius)
    ]
    rad_data = cache.get("radiation")
    if rad_data and isinstance(rad_data, dict):
        unexpected_extreme = 0
        unexpected_elevated = 0
        for feat in rad_data.get("features", []):
            val = feat.get("properties", {}).get("value", 0)
            if val <= 100:
                continue
            lat = feat["geometry"]["coordinates"][1]
            lon = feat["geometry"]["coordinates"][0]
            # Check if in a known hot zone
            in_hotzone = False
            for hz_lat, hz_lon, hz_r in KNOWN_HOTZONE_COORDS:
                dist_km = ((lat - hz_lat) ** 2 + (lon - hz_lon) ** 2) ** 0.5 * 111
                if dist_km < hz_r:
                    in_hotzone = True
                    break
            if in_hotzone:
                continue  # Expected — don't score
            if val > 1000:
                unexpected_extreme += 1
            elif val > 300:
                unexpected_elevated += 1
        if unexpected_extreme > 0:
            pts = min(unexpected_extreme * 30, 60)
            score += pts
            factors.append({"source": "radiation", "detail": f"{unexpected_extreme} extreme readings outside known zones", "points": pts})
        if unexpected_elevated > 3:
            pts = 10
            score += pts
            factors.append({"source": "radiation", "detail": f"{unexpected_elevated} elevated sensors in unexpected areas", "points": pts})

    # --- Hurricanes ---
    hurr_data = cache.get("hurricanes")
    if hurr_data and isinstance(hurr_data, dict):
        for feat in hurr_data.get("features", []):
            name = feat.get("properties", {}).get("name", "Unknown storm")
            score += 15
            factors.append({"source": "hurricane", "detail": f"Active storm: {name}", "points": 15})

    # --- Breaking News Analysis ---
    # Scan headlines for high-threat keywords and score accordingly
    CRITICAL_KEYWORDS = {
        # Nuclear / WMD (highest threat)
        "nuclear": 30, "nuke": 30, "nuclear strike": 40, "nuclear war": 40,
        "chemical weapon": 25, "biological weapon": 25, "nerve agent": 25,
        "meltdown": 20, "reactor breach": 25,
        # Missiles
        "missile launch": 25, "missile strike": 25, "missile attack": 25,
        "ballistic missile": 25, "icbm": 30, "missile": 12,
        # War / Invasion
        "declaration of war": 30, "declares war": 30, "act of war": 25,
        "invasion": 20, "invaded": 20, "ground invasion": 25,
        "martial law": 20, "state of emergency": 10,
        "war crimes": 15, "genocide": 20, "ethnic cleansing": 20,
        # Military action
        "airstrike": 10, "airstrikes": 10, "air strike": 10,
        "strike": 6, "strikes": 6, "bombed": 10, "bombing": 10,
        "shelling": 10, "shelled": 10, "bombardment": 10,
        "drone strike": 10, "drone attack": 10,
        "military offensive": 12, "offensive": 8,
        "escalation": 10, "escalating": 10, "retaliation": 10, "retaliatory": 10,
        # Terrorism / Violence
        "terrorist attack": 20, "terrorism": 15, "mass shooting": 15,
        "mass casualty": 20, "casualties": 8, "killed": 6, "deaths": 5,
        "explosion": 8, "attack": 5,
        # Political crisis
        "coup": 15, "military coup": 20, "overthrow": 15,
        "assassination": 15, "assassinated": 15,
        "hostage": 10, "kidnap": 8, "kidnapped": 8, "abducted": 8,
        # Ceasefire / Peace (lower threat — things calming down)
        "ceasefire": 3, "peace deal": 2, "peace talks": 2,
        "ceasefire collapse": 15, "ceasefire broken": 15, "ceasefire violated": 15,
        # Economic / Infrastructure
        "sanctions": 5, "embargo": 5, "blockade": 10, "naval blockade": 15,
        "cyberattack": 10, "cyber attack": 10, "grid down": 15,
        # Natural disasters
        "evacuation": 8, "evacuated": 8,
        "pandemic": 15, "outbreak": 10, "epidemic": 10,
        "tsunami warning": 15, "tsunami": 10,
        "famine": 12, "humanitarian crisis": 10,
    }

    import re
    news_data = cache.get("news")
    if news_data and isinstance(news_data, list):
        news_pts = 0
        matched_headlines = []
        for item in news_data[:30]:
            title = (item.get("title") or "").lower()
            best_keyword = None
            best_pts = 0
            for keyword, pts in CRITICAL_KEYWORDS.items():
                # Word boundary match to avoid "couple" matching "coup" etc
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, title) and pts > best_pts:
                    best_keyword = keyword
                    best_pts = pts
            if best_keyword and best_pts >= 3:  # Count all threat-related matches
                news_pts += best_pts
                matched_headlines.append(f'"{item.get("title", "")[:60]}" ({best_keyword})')

        # Cap news contribution to avoid runaway scoring from repetitive headlines
        news_pts = min(news_pts, 50)
        if news_pts > 0:
            score += news_pts
            detail = f"{len(matched_headlines)} threat headlines detected"
            if matched_headlines:
                detail += f": {matched_headlines[0]}"
                if len(matched_headlines) > 1:
                    detail += f" +{len(matched_headlines)-1} more"
            factors.append({"source": "news", "detail": detail, "points": news_pts})

    # --- Map score to level ---
    if score >= 76:
        level, color = "CRITICAL", "#ff0000"
    elif score >= 51:
        level, color = "HIGH", "#ff6600"
    elif score >= 26:
        level, color = "ELEVATED", "#ffcc00"
    elif score >= 11:
        level, color = "GUARDED", "#3399ff"
    else:
        level, color = "LOW", "#00cc00"

    return JSONResponse({"score": score, "level": level, "color": color, "factors": factors})
