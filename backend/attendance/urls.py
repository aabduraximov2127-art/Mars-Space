from rest_framework.routers import SimpleRouter

from .views import AttendanceViewSet

router = SimpleRouter()
router.register("attendance", AttendanceViewSet, basename="attendance")

urlpatterns = router.urls
