from django.db import connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Liveness/readiness probe for load balancers and monitoring."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer("Health", {"status": serializers.CharField(), "database": serializers.CharField()})
    )
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_status = "ok"
        except Exception:  # noqa: BLE001 — any DB failure means "not ready"
            db_status = "unavailable"
        code = 200 if db_status == "ok" else 503
        return Response({"status": "ok" if code == 200 else "degraded", "database": db_status}, status=code)
