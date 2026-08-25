from fastapi import APIRouter

from ..config.settings import MEDIA_FILE
from ..services.media_service import load_media_configuration

router = APIRouter(prefix="/api", tags=["media"])


@router.get("/media")
def get_media() -> dict:
    return load_media_configuration(MEDIA_FILE)
