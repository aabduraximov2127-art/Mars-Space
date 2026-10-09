from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class _DynamicRateMixin:
    """Read the rate at request time so ``override_settings`` works in tests."""

    def get_rate(self):
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)


class LoginRateThrottle(_DynamicRateMixin, AnonRateThrottle):
    scope = "login"


class PasswordResetRateThrottle(_DynamicRateMixin, AnonRateThrottle):
    scope = "password_reset"


class ChatMessageThrottle(_DynamicRateMixin, UserRateThrottle):
    scope = "chat_message"
