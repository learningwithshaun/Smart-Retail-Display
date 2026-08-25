import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import create_app
from hardware.mock_gpio_controller import MockGPIOController


def signed_request(client, secret, payload):
    body = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return client.post("/api/paystack/webhook", content=body, headers={"x-paystack-signature": signature, "content-type": "application/json"})


def test_valid_signature_successfully_unlocks_mapped_product(monkeypatch):
    secret = "test_secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    controller = MockGPIOController(sleep_fn=lambda _: None)
    response = signed_request(TestClient(create_app(controller)), secret, {
        "event": "charge.success", "data": {"metadata": {"product_id": "product_001"}}
    })
    assert response.status_code == 200
    assert response.json()["gpio_pin"] == 17
    assert controller.history == [("activate", 17), ("deactivate", 17)]


def test_invalid_signature_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", "test_secret")
    response = TestClient(create_app(MockGPIOController(sleep_fn=lambda _: None))).post(
        "/api/paystack/webhook", json={"event": "charge.success"}, headers={"x-paystack-signature": "wrong"}
    )
    assert response.status_code == 401


def test_unknown_product_is_handled_safely(monkeypatch):
    secret = "test_secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    response = signed_request(TestClient(create_app(MockGPIOController(sleep_fn=lambda _: None))), secret, {
        "event": "charge.success", "data": {"metadata": {"product_id": "unknown"}}
    })
    assert response.status_code == 422

