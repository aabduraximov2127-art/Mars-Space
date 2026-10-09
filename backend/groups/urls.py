from rest_framework.routers import SimpleRouter

from .views import GroupViewSet, MembershipViewSet

router = SimpleRouter()
router.register("groups", GroupViewSet, basename="group")
router.register("memberships", MembershipViewSet, basename="membership")

urlpatterns = router.urls
