"""Server-controlled product mapping. Only these pins may be unlocked."""

PRODUCT_GPIO_MAP = {
    "product_001": 17,
    "product_002": 27,
}


def pin_for_product(product_id: str) -> int | None:
    return PRODUCT_GPIO_MAP.get(product_id)

