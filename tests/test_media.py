import json

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.routes import media as media_route
from backend.app.services.media_service import load_media_configuration
from hardware.mock_gpio_controller import MockGPIOController


def ad(**changes):
    item = {"id": "media_001", "business_id": "business_001", "business_name": "Amanda Cosmetics", "type": "product", "name": "Lipstick", "media_type": "image", "media_url": "https://example.com/lipstick.jpg", "paystack_url": "https://paystack.com/pay/lipstick", "payment_status": "paid", "play_count": 2, "status": "active"}
    item.update(changes)
    return item


def test_media_endpoint_returns_only_active_paid_valid_adverts(tmp_path, monkeypatch):
    media_file = tmp_path / "media.json"
    media_file.write_text(json.dumps({"media": [ad(), ad(id="inactive", status="inactive"), ad(id="unpaid", payment_status="pending"), ad(id="broken", business_name="")], "youtube_playlist_id": "playlist", "ad_duration_seconds": 25, "youtube_duration_minutes": 10}), encoding="utf-8")
    monkeypatch.setattr(media_route, "MEDIA_FILE", media_file)
    response = TestClient(create_app(MockGPIOController(sleep_fn=lambda _: None))).get("/api/media")
    assert response.status_code == 200
    assert response.json() == {"media": [ad()], "youtube_playlist_id": "playlist", "ad_duration_seconds": 25, "youtube_duration_minutes": 10}


def test_invalid_json_and_playback_config_fall_back_safely(tmp_path):
    media_file = tmp_path / "media.json"
    media_file.write_text("invalid", encoding="utf-8")
    assert load_media_configuration(media_file) == {"media": [], "youtube_playlist_id": "", "ad_duration_seconds": 30, "youtube_duration_minutes": 10}
    media_file.write_text(json.dumps({"media": [], "ad_duration_seconds": 0, "youtube_duration_minutes": "ten"}), encoding="utf-8")
    result = load_media_configuration(media_file)
    assert result["ad_duration_seconds"] == 30
    assert result["youtube_duration_minutes"] == 10


def test_media_orientation_optional_and_supported_values(tmp_path):
    media_file = tmp_path / "media.json"
    ad_no_orientation = ad(id="media_none")
    ad_landscape = ad(id="media_land", orientation="landscape")
    ad_portrait = ad(id="media_port", orientation="portrait")
    ad_square = ad(id="media_sq", orientation="square")
    ad_invalid = ad(id="media_diag", orientation="diagonal")
    ad_invalid_num = ad(id="media_num", orientation=123)

    payload = {
        "media": [
            ad_no_orientation,
            ad_landscape,
            ad_portrait,
            ad_square,
            ad_invalid,
            ad_invalid_num,
        ],
        "youtube_playlist_id": "test_playlist",
        "ad_duration_seconds": 30,
        "youtube_duration_minutes": 10,
    }
    media_file.write_text(json.dumps(payload), encoding="utf-8")
    result = load_media_configuration(media_file)
    assert len(result["media"]) == 4
    assert result["media"] == [ad_no_orientation, ad_landscape, ad_portrait, ad_square]


def test_media_endpoint_with_orientations(tmp_path, monkeypatch):
    media_file = tmp_path / "media.json"
    items = [
        ad(id="m1"),
        ad(id="m2", orientation="landscape"),
        ad(id="m3", orientation="portrait"),
        ad(id="m4", orientation="square"),
        ad(id="m5", orientation="invalid_orient"),
    ]
    media_file.write_text(json.dumps({"media": items}), encoding="utf-8")
    monkeypatch.setattr(media_route, "MEDIA_FILE", media_file)
    response = TestClient(create_app(MockGPIOController(sleep_fn=lambda _: None))).get("/api/media")
    assert response.status_code == 200
    assert response.json()["media"] == [
        ad(id="m1"),
        ad(id="m2", orientation="landscape"),
        ad(id="m3", orientation="portrait"),
        ad(id="m4", orientation="square"),
    ]
