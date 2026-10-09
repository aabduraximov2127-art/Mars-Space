from django.contrib import admin

from .models import Branch, Room, SystemSettings


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "phone", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "code", "address")


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "capacity", "is_active")
    list_filter = ("branch", "is_active")
    search_fields = ("name",)


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ("center_name", "currency", "updated_at", "updated_by")

    def has_add_permission(self, request):
        return not SystemSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
