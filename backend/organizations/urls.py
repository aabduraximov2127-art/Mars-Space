from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import BranchViewSet, PublicSettingsView, RoomViewSet, SystemSettingsView

router = SimpleRouter()
router.register("branches", BranchViewSet, basename="branch")
router.register("rooms", RoomViewSet, basename="room")

urlpatterns = [
    path("settings/", SystemSettingsView.as_view(), name="settings"),
    path("settings/public/", PublicSettingsView.as_view(), name="settings-public"),
    *router.urls,
]
