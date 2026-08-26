import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from hardware.gpio_controller import RealGPIOController
from hardware.mock_gpio_controller import MockGPIOController

from .config import settings
from .routes.media import router as media_router
from .routes.paystack import build_webhook_router
from .services.shelf_service import ShelfService

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app(controller=None) -> FastAPI:
    if controller is None:
        controller = RealGPIOController() if settings.GPIO_MODE == "real" else MockGPIOController()
    app = FastAPI(title="Smart Retail Display API", version="0.1.0")
    
    # Enable CORS for zuke domains
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "https://app.zuke.co.za",
            "https://zuke.co.za",
            "http://localhost:3000", # Common for local dashboard development
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.shelf_service = ShelfService(controller, settings.UNLOCK_DURATION_SECONDS)
    app.include_router(media_router)
    app.include_router(build_webhook_router(app.state.shelf_service))
    app.mount("/", StaticFiles(directory=str(settings.PROJECT_ROOT / "frontend"), html=True), name="frontend")
    return app


app = create_app()
