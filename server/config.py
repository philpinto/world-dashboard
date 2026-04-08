"""Centralized configuration — loads from environment variables with credentials.json fallback."""

import json
import os

from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed, rely on env vars or credentials.json

ROOT = Path(__file__).parent.parent
CREDS_PATH = ROOT / "credentials.json"

_creds_cache = None


def _load_creds_file():
    global _creds_cache
    if _creds_cache is None:
        try:
            with open(CREDS_PATH) as f:
                _creds_cache = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            _creds_cache = {}
    return _creds_cache


def get(key, env_var=None, default=None):
    """Get a config value. Checks env vars first, then credentials.json."""
    if env_var:
        val = os.environ.get(env_var)
        if val:
            return val
    # Fallback to credentials.json
    creds = _load_creds_file()
    return creds.get(key, default)


# Convenience accessors
OPENSKY_CLIENT_ID = get("clientId", "OPENSKY_CLIENT_ID")
OPENSKY_CLIENT_SECRET = get("clientSecret", "OPENSKY_CLIENT_SECRET")
AISSTREAM_API_KEY = get("aisStreamApiKey", "AISSTREAM_API_KEY")
FIRMS_MAP_KEY = get("firmsMapKey", "FIRMS_MAP_KEY", "")
