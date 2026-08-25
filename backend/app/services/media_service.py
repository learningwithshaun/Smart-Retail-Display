import json
from pathlib import Path
from urllib.parse import urlparse

REQUIRED_FIELDS = {"id", "business_id", "business_name", "type", "name", "media_type", "media_url", "paystack_url", "payment_status", "play_count", "status"}
SUPPORTED_TYPES = {"image", "video"}
DEFAULT_CONFIG = {"youtube_playlist_id": "", "ad_duration_seconds": 30, "youtube_duration_minutes": 10}


def is_http_url(value: object) -> bool:
    return isinstance(value, str) and bool(urlparse(value).scheme in {"http", "https"} and urlparse(value).netloc)


def is_valid_media(item: object) -> bool:
    if not isinstance(item, dict) or not REQUIRED_FIELDS.issubset(item):
        return False
    return (
        item["status"] == "active" and item["payment_status"] == "paid" and item["media_type"] in SUPPORTED_TYPES
        and all(isinstance(item[key], str) and item[key].strip() for key in ("id", "business_id", "business_name", "type", "name"))
        and is_http_url(item["media_url"]) and is_http_url(item["paystack_url"])
        and isinstance(item["play_count"], int) and not isinstance(item["play_count"], bool) and item["play_count"] > 0
    )


def valid_number(value: object, default: int, maximum: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 < value <= maximum else default


def load_media_configuration(media_file: Path) -> dict:
    try:
        data = json.loads(media_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    items = data.get("media", [])
    return {
        "media": [item for item in items if is_valid_media(item)] if isinstance(items, list) else [],
        "youtube_playlist_id": data.get("youtube_playlist_id") if isinstance(data.get("youtube_playlist_id"), str) else DEFAULT_CONFIG["youtube_playlist_id"],
        "ad_duration_seconds": valid_number(data.get("ad_duration_seconds"), DEFAULT_CONFIG["ad_duration_seconds"], 300),
        "youtube_duration_minutes": valid_number(data.get("youtube_duration_minutes"), DEFAULT_CONFIG["youtube_duration_minutes"], 120),
    }
