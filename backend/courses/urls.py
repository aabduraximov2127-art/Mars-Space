from rest_framework.routers import SimpleRouter

from .views import CourseMaterialViewSet, CourseViewSet

router = SimpleRouter()
router.register("courses", CourseViewSet, basename="course")
router.register("course-materials", CourseMaterialViewSet, basename="course-material")

urlpatterns = router.urls
