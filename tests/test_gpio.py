from backend.app.services.shelf_service import ShelfService
from hardware.gpio_mapping import pin_for_product
from hardware.mock_gpio_controller import MockGPIOController


def test_product_mapping_and_mock_unlock_cycle():
    controller = MockGPIOController(sleep_fn=lambda seconds: None)
    service = ShelfService(controller, duration_seconds=5)
    assert service.unlock_product("product_001") == 17
    assert controller.active_pins == set()
    assert controller.history == [("activate", 17), ("deactivate", 17)]


def test_unknown_product_never_controls_gpio():
    controller = MockGPIOController(sleep_fn=lambda seconds: None)
    service = ShelfService(controller, duration_seconds=5)
    assert pin_for_product("unknown") is None
    assert service.unlock_product("unknown") is None
    assert controller.history == []

