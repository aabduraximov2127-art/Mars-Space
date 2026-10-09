import csv

from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import AD, ALL_ROLES, SA, TE, RolePermission

from . import services


class DashboardView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": ALL_ROLES}

    @extend_schema(responses={200: OpenApiResponse(description="Role-specific dashboard")}, tags=["reports"])
    def get(self, request):
        return Response(services.dashboard(request.user, request.query_params))


class FinanceReportView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": (SA, AD)}

    @extend_schema(
        responses={200: OpenApiResponse(description="Finance report (?format=csv for CSV)")}, tags=["reports"]
    )
    def get(self, request):
        if request.query_params.get("export") == "csv" or request.query_params.get("format") == "csv":
            response = HttpResponse(content_type="text/csv; charset=utf-8")
            stamp = timezone.localdate().isoformat()
            response["Content-Disposition"] = f'attachment; filename="tolovlar-{stamp}.csv"'
            response.write("﻿")  # Excel-friendly UTF-8 BOM
            writer = csv.writer(response, delimiter=";")
            for row in services.finance_csv_rows(request.user, request.query_params):
                writer.writerow(row)
            return response
        return Response(services.finance_report(request.user, request.query_params))


class AttendanceReportView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": (SA, AD, TE)}

    @extend_schema(responses={200: OpenApiResponse(description="Attendance by group")}, tags=["reports"])
    def get(self, request):
        return Response(services.attendance_report(request.user, request.query_params))


class AcademicReportView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": (SA, AD, TE)}

    @extend_schema(responses={200: OpenApiResponse(description="Academic results by group")}, tags=["reports"])
    def get(self, request):
        return Response(services.academic_report(request.user, request.query_params))
