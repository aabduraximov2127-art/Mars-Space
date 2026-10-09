from decimal import Decimal

from django.db import models


def plain_number(value) -> str:
    """Decimal without trailing zeros: 88.00 -> "88", 10272.50 -> "10272.50"."""
    if value is None:
        return ""
    value = Decimal(value)
    return str(value.quantize(Decimal(1))) if value == value.to_integral_value() else str(value)


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
