from rest_framework.routers import SimpleRouter

from .views import ChatViewSet

router = SimpleRouter()
router.register("chat", ChatViewSet, basename="chat")

urlpatterns = router.urls
