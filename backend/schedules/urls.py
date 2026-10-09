from rest_framework.routers import SimpleRouter

from .views import LessonViewSet

router = SimpleRouter()
router.register("lessons", LessonViewSet, basename="lesson")

urlpatterns = router.urls
