import json
from pathlib import Path
from urllib.parse import urlparse

REQUIRED_FIELDS = {"id", "business_id", "business_name", "type", "name", "media_type", "media_url", "paystack_url", "payment_status", "play_count", "status"}
SUPPORTED_TYPES = {"image", "video"}
ALLOWED_ORIENTATIONS = {"landscape", "portrait", "square"}
ALLOWED_YOUTUBE_MODES = {"api", "normal", "both"}

DEFAULT_SCHEDULE = {
    "morning": {"start": "09:00", "end": "11:30"},
    "afternoon": {"start": "11:30", "end": "18:00"},
    "evening": {"start": "18:00", "end": "21:00"},
}

DEFAULT_CONFIG = {
    "youtube_playlist_id": "",
    "ad_duration_seconds": 30,
    "youtube_duration_minutes": 10,
    "youtube_mode": "both",
    "youtube_api_key": "",
    "schedule": DEFAULT_SCHEDULE,
}


def is_http_url(value: object) -> bool:
    return isinstance(value, str) and bool(urlparse(value).scheme in {"http", "https"} and urlparse(value).netloc)


def is_valid_time_str(val: object) -> bool:
    if not isinstance(val, str):
        return False
    parts = val.strip().split(":")
    if len(parts) != 2:
        return False
    h, m = parts
    return h.isdigit() and m.isdigit() and 0 <= int(h) <= 23 and 0 <= int(m) <= 59


def validate_schedule(raw_schedule: object) -> dict:
    if not isinstance(raw_schedule, dict):
        return DEFAULT_CONFIG["schedule"]
    validated = {}
    for slot_name, slot_val in raw_schedule.items():
        if (
            isinstance(slot_name, str)
            and slot_name.strip()
            and isinstance(slot_val, dict)
            and is_valid_time_str(slot_val.get("start"))
            and is_valid_time_str(slot_val.get("end"))
        ):
            validated[slot_name.strip()] = {
                "start": slot_val["start"].strip(),
                "end": slot_val["end"].strip(),
            }
    return validated if validated else DEFAULT_CONFIG["schedule"]


def is_valid_media(item: object) -> bool:
    if not isinstance(item, dict) or not REQUIRED_FIELDS.issubset(item):
        return False
    orientation = item.get("orientation")
    if orientation is not None and orientation not in ALLOWED_ORIENTATIONS:
        return False
    time_slot = item.get("time")
    if time_slot is not None and not (isinstance(time_slot, str) and time_slot.strip()):
        return False
    category = item.get("category")
    if category is not None and not (isinstance(category, str) and category.strip()):
        return False
    return (
        item["status"] == "active" and item["payment_status"] == "paid" and item["media_type"] in SUPPORTED_TYPES
        and all(isinstance(item[key], str) and item[key].strip() for key in ("id", "business_id", "business_name", "type", "name"))
        and is_http_url(item["media_url"]) and is_http_url(item["paystack_url"])
        and isinstance(item["play_count"], int) and not isinstance(item["play_count"], bool) and item["play_count"] > 0
    )


def valid_number(value: object, default: int, maximum: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and 0 < value <= maximum else default


def load_media_configuration(media_file: Path, default_mode: str = "both", default_api_key: str = "") -> dict:
    try:
        data = json.loads(media_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    items = data.get("media", [])
    mode = data.get("youtube_mode")
    resolved_mode = mode.lower() if isinstance(mode, str) and mode.lower() in ALLOWED_YOUTUBE_MODES else default_mode
    api_key = data.get("youtube_api_key")
    resolved_api_key = api_key if isinstance(api_key, str) and api_key else default_api_key
    schedule = validate_schedule(data.get("schedule"))

    return {
        "media": [item for item in items if is_valid_media(item)] if isinstance(items, list) else [],
        "youtube_playlist_id": data.get("youtube_playlist_id") if isinstance(data.get("youtube_playlist_id"), str) else DEFAULT_CONFIG["youtube_playlist_id"],
        "ad_duration_seconds": valid_number(data.get("ad_duration_seconds"), DEFAULT_CONFIG["ad_duration_seconds"], 300),
        "youtube_duration_minutes": valid_number(data.get("youtube_duration_minutes"), DEFAULT_CONFIG["youtube_duration_minutes"], 120),
        "youtube_mode": resolved_mode,
        "youtube_api_key": resolved_api_key,
        "schedule": schedule,
    }

