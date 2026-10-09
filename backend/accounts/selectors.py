from django.db.models import QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE

from .models import User


def users_for(user) -> QuerySet[User]:
    """Users the caller may see in user-management APIs.

    * superadmin — everyone
    * admin — teachers and students of their own branch
    * teacher — students currently (active/frozen) enrolled in the teacher's groups
    * student — nobody (students use ``/api/auth/me/``)
    """
    role = role_of(user)
    qs = User.objects.select_related("branch", "profile")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(branch_id=user.branch_id, role__in=(TE, ST))
    if role == TE:
        from groups.models import OPEN_MEMBERSHIP_STATUSES

        return qs.filter(
            role=ST,
            memberships__group__teacher=user,
            memberships__status__in=OPEN_MEMBERSHIP_STATUSES,
        ).distinct()
    return qs.none()
