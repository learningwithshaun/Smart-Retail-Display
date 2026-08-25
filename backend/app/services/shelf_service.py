import logging
from typing import Protocol

from hardware.gpio_mapping import pin_for_product

logger = logging.getLogger(__name__)


class GPIOController(Protocol):
    def unlock(self, pin: int, duration_seconds: float) -> None: ...


class ShelfService:
    def __init__(self, controller: GPIOController, duration_seconds: float):
        self.controller = controller
        self.duration_seconds = duration_seconds

    def unlock_product(self, product_id: str) -> int | None:
        pin = pin_for_product(product_id)
        if pin is None:
            logger.warning("Ignoring unlock request for unknown product %r", product_id)
            return None
        self.controller.unlock(pin, self.duration_seconds)
        return pin

