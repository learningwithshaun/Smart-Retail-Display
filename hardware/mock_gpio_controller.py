"""Local GPIO simulation used when no Raspberry Pi hardware is available."""
import logging
import time

logger = logging.getLogger(__name__)


class MockGPIOController:
    def __init__(self, sleep_fn=time.sleep):
        self.sleep_fn = sleep_fn
        self.active_pins: set[int] = set()
        self.history: list[tuple[str, int]] = []

    def unlock(self, pin: int, duration_seconds: float) -> None:
        logger.info("MOCK GPIO: activating relay on pin %s", pin)
        self.active_pins.add(pin)
        self.history.append(("activate", pin))
        self.sleep_fn(duration_seconds)
        self.active_pins.discard(pin)
        self.history.append(("deactivate", pin))
        logger.info("MOCK GPIO: deactivating relay on pin %s", pin)

