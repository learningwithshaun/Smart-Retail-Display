from fastapi import APIRouter

from ..config.settings import MEDIA_FILE, YOUTUBE_API_KEY, YOUTUBE_MODE
from ..services.media_service import load_media_configuration

router = APIRouter(prefix="/api", tags=["media"])


@router.get("/media")
def get_media() -> dict:
    return load_media_configuration(MEDIA_FILE, default_mode=YOUTUBE_MODE, default_api_key=YOUTUBE_API_KEY)

