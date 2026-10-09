from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from core.models import TimeStampedModel
from core.roles import Role
from core.storage import UUIDUploadPath
from core.validators import normalize_email, normalize_phone, validate_phone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, phone, password, **extra):
        if not phone:
            raise ValueError("Telefon raqam majburiy.")
        phone = normalize_phone(phone)
        validate_phone(phone)
        extra["email"] = normalize_email(extra.get("email"))
        user = self.model(phone=phone, **extra)
        user.set_password(password)  # None -> unusable password
        user.save(using=self._db)
        return user

    def create_user(self, phone, password=None, **extra):
        extra.setdefault("role", Role.STUDENT)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(phone, password, **extra)

    def create_superuser(self, phone, password=None, **extra):
        extra.update(role=Role.SUPERADMIN, is_staff=True, is_superuser=True, branch=None)
        return self._create_user(phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField("telefon", max_length=16, unique=True, validators=[validate_phone])
    email = models.EmailField("email", blank=True, default="")
    first_name = models.CharField("ism", max_length=150)
    last_name = models.CharField("familiya", max_length=150)
    role = models.CharField("rol", max_length=20, choices=Role.choices, default=Role.STUDENT, db_index=True)
    branch = models.ForeignKey(
        "organizations.Branch",
        verbose_name="filial",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="users",
    )
    avatar = models.ImageField("rasm", upload_to=UUIDUploadPath("avatars"), blank=True)
    is_active = models.BooleanField("faol", default=True, db_index=True)
    is_staff = models.BooleanField("Django admin", default=False)
    must_change_password = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "phone"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = "foydalanuvchi"
        verbose_name_plural = "foydalanuvchilar"
        ordering = ["last_name", "first_name", "id"]
        indexes = [
            models.Index(fields=["role", "branch"], name="accounts_user_role_branch_idx"),
            models.Index(fields=["last_name", "first_name"], name="accounts_user_name_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="accounts_user_email_ci_unique",
                violation_error_message="Bu email bilan foydalanuvchi mavjud.",
            ),
            models.CheckConstraint(
                condition=Q(role=Role.SUPERADMIN) | Q(branch__isnull=False),
                name="accounts_user_branch_required",
                violation_error_message="Superadmindan boshqa rollar filialga biriktirilishi shart.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.phone})"

    def save(self, *args, **kwargs):
        self.phone = normalize_phone(self.phone)
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def short_name(self) -> str:
        """First name + last-name initial, used where other students can see the name."""
        initial = f" {self.last_name[:1]}." if self.last_name else ""
        return f"{self.first_name}{initial}"

    @property
    def is_superadmin(self) -> bool:
        return self.role == Role.SUPERADMIN

    @property
    def is_branch_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.role == Role.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == Role.STUDENT


class UserProfile(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    birth_date = models.DateField(null=True, blank=True)
    parent_name = models.CharField(max_length=150, blank=True)
    parent_phone = models.CharField(max_length=16, blank=True, validators=[validate_phone])
    specialization = models.CharField(max_length=150, blank=True)
    bio = models.TextField(max_length=1000, blank=True)
    notes = models.TextField("ichki izoh", max_length=2000, blank=True)

    class Meta:
        verbose_name = "profil"
        verbose_name_plural = "profillar"

    def __str__(self) -> str:
        return f"Profil: {self.user_id}"

    def save(self, *args, **kwargs):
        if self.parent_phone:
            self.parent_phone = normalize_phone(self.parent_phone)
        super().save(*args, **kwargs)
