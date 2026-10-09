from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User, UserProfile


class EduUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("phone", "first_name", "last_name", "role", "branch")


class EduUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = "__all__"


class ProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = EduUserChangeForm
    add_form = EduUserCreationForm
    inlines = [ProfileInline]
    ordering = ("last_name", "first_name")
    list_display = ("phone", "full_name", "role", "branch", "is_active", "last_login")
    list_filter = ("role", "branch", "is_active")
    search_fields = ("phone", "email", "first_name", "last_name")
    readonly_fields = ("last_login", "created_at", "updated_at", "deactivated_at")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Shaxsiy", {"fields": ("first_name", "last_name", "email", "avatar")}),
        ("Rol", {"fields": ("role", "branch", "is_active", "must_change_password")}),
        ("Django admin", {"fields": ("is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Vaqtlar", {"fields": ("last_login", "created_at", "updated_at", "deactivated_at")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone", "first_name", "last_name", "role", "branch", "password1", "password2"),
            },
        ),
    )
