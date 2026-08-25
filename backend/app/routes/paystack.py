import json
import logging

from fastapi import APIRouter, HTTPException, Request, status

from ..config import settings
from ..services.paystack_service import product_id_from_event, signature_is_valid

logger = logging.getLogger(__name__)


def build_webhook_router(shelf_service):
    # A fresh router keeps each app instance (including tests) bound to its own controller.
    router = APIRouter(prefix="/api/paystack", tags=["payments"])

    @router.post("/webhook", status_code=status.HTTP_200_OK)
    async def paystack_webhook(request: Request) -> dict:
        raw_body = await request.body()
        signature = request.headers.get("x-paystack-signature")
        if not signature_is_valid(raw_body, signature, settings.PAYSTACK_SECRET_KEY):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")
        try:
            event = json.loads(raw_body)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed JSON") from error
        if not isinstance(event, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload")
        if event.get("event") != "charge.success":
            return {"received": True, "processed": False, "reason": "ignored_event"}
        product_id = product_id_from_event(event)
        if not product_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Missing metadata.product_id")
        pin = shelf_service.unlock_product(product_id)
        if pin is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown product")
        logger.info("Payment for product %s unlocked pin %s", product_id, pin)
        return {"received": True, "processed": True, "product_id": product_id, "gpio_pin": pin}

    return router
