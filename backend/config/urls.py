from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from core.views import HealthView

admin.site.site_header = "EduCentr — Django admin"
admin.site.site_title = "EduCentr admin"

api_patterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/", include("accounts.urls_auth")),
    path("", include("accounts.urls")),
    path("", include("organizations.urls")),
    path("", include("courses.urls")),
    path("", include("groups.urls")),
    path("", include("schedules.urls")),
    path("", include("attendance.urls")),
    path("", include("assignments.urls")),
    path("", include("grades.urls")),
    path("", include("payments.urls")),
    path("", include("notifications.urls")),
    path("", include("announcements.urls")),
    path("", include("chat.urls")),
    path("", include("rewards.urls")),
    path("", include("reports.urls")),
    path("", include("audit.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]

if settings.DEBUG:
    # Only public media (avatars). Private uploads are never served from a URL.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
