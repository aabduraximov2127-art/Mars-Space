from django.urls import path

from . import views

urlpatterns = [
    path("reports/dashboard/", views.DashboardView.as_view(), name="reports-dashboard"),
    path("reports/finance/", views.FinanceReportView.as_view(), name="reports-finance"),
    path("reports/attendance/", views.AttendanceReportView.as_view(), name="reports-attendance"),
    path("reports/academic/", views.AcademicReportView.as_view(), name="reports-academic"),
]
