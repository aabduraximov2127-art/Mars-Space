from rest_framework.routers import SimpleRouter

from .views import RewardViewSet

router = SimpleRouter()
router.register("rewards", RewardViewSet, basename="reward")

urlpatterns = router.urls
