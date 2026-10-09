from django.db import models


class Role(models.TextChoices):
    SUPERADMIN = "superadmin", "Superadmin"
    ADMIN = "admin", "Admin"
    TEACHER = "teacher", "Ustoz"
    STUDENT = "student", "Student"


SA = Role.SUPERADMIN
AD = Role.ADMIN
TE = Role.TEACHER
ST = Role.STUDENT

ALL_ROLES = (SA, AD, TE, ST)
STAFF_ROLES = (SA, AD)
