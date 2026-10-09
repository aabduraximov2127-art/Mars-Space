from rest_framework.routers import SimpleRouter

from .views import AssignmentViewSet, SubmissionViewSet

router = SimpleRouter()
router.register("assignments", AssignmentViewSet, basename="assignment")
router.register("submissions", SubmissionViewSet, basename="submission")

urlpatterns = router.urls
