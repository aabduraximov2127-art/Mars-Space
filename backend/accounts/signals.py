from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User, UserProfile


@receiver(post_save, sender=User, dispatch_uid="accounts_ensure_profile")
def ensure_profile(sender, instance: User, created: bool, raw: bool = False, **kwargs) -> None:
    """Every user always has exactly one profile row (also for ``createsuperuser``)."""
    if created and not raw:
        UserProfile.objects.get_or_create(user=instance)
