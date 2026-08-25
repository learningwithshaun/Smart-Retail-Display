"""Physical Raspberry Pi relay controller, imported only in real GPIO mode."""
import time


class RealGPIOController:
    def __init__(self):
        try:
            from gpiozero import OutputDevice
        except ImportError as error:  # pragma: no cover - requires a Raspberry Pi environment
            raise RuntimeError("gpiozero is required for GPIO_MODE=real") from error
        self._output_device = OutputDevice
        self._relays: dict[int, object] = {}

    def unlock(self, pin: int, duration_seconds: float) -> None:
        relay = self._relays.get(pin)
        if relay is None:
            # active_high can be changed here if the installed relay board is active-low.
            relay = self._output_device(pin, active_high=True, initial_value=False)
            self._relays[pin] = relay
        relay.on()
        try:
            time.sleep(duration_seconds)
        finally:
            relay.off()

