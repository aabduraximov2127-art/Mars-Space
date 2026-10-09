from rest_framework.routers import SimpleRouter

from .views import GradeViewSet

router = SimpleRouter()
router.register("grades", GradeViewSet, basename="grade")

urlpatterns = router.urls
