import hashlib
import hmac


def signature_is_valid(raw_body: bytes, signature: str | None, secret_key: str) -> bool:
    if not signature or not secret_key:
        return False
    expected = hmac.new(secret_key.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


def product_id_from_event(event: dict) -> str | None:
    """Paystack product identity is expected in transaction metadata.product_id."""
    data = event.get("data")
    if not isinstance(data, dict):
        return None
    metadata = data.get("metadata")
    if not isinstance(metadata, dict):
        return None
    product_id = metadata.get("product_id")
    return product_id if isinstance(product_id, str) and product_id else None

