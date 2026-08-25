import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[3]
MEDIA_FILE = PROJECT_ROOT / "frontend" / "media.json"
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
GPIO_MODE = os.getenv("GPIO_MODE", "mock").lower()
UNLOCK_DURATION_SECONDS = float(os.getenv("UNLOCK_DURATION_SECONDS", "5"))

