from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.db.models import Q
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission, require, role_of
from core.throttles import LoginRateThrottle, PasswordResetRateThrottle

from . import overview, services
from .backends import find_user_by_login
from .models import User
from .selectors import users_for
from .serializers import (
    AccessTokenSerializer,
    BlockSerializer,
    ChangePasswordSerializer,
    ChangeRoleSerializer,
    DetailSerializer,
    LoginResponseSerializer,
    LoginSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetSerializer,
    SetPasswordSerializer,
    StudentForTeacherSerializer,
    TemporaryPasswordSerializer,
    UserCreatedSerializer,
    UserSerializer,
    UserWriteSerializer,
)

INVALID_CREDENTIALS = "Telefon/email yoki parol noto'g'ri."


def _require_xhr(request) -> None:
    """Cookie-authenticated endpoints need a header a cross-site form cannot send."""
    if request.headers.get("X-Requested-With") != "XMLHttpRequest":
        raise PermissionDenied("So'rov sarlavhasi yetishmaydi (X-Requested-With).")


class LoginView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    @extend_schema(request=LoginSerializer, responses={200: LoginResponseSerializer}, tags=["auth"])
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        login = serializer.validated_data["login"]
        password = serializer.validated_data["password"]

        if services.is_login_locked(login):
            return Response(
                {
                    "detail": (
                        f"Juda ko'p muvaffaqiyatsiz urinish. {settings.LOGIN_LOCKOUT_MINUTES} daqiqadan "
                        "so'ng qayta urinib ko'ring."
                    ),
                    "code": "login_locked",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = find_user_by_login(login)
        if user is None:
            User().set_password(password)  # equalise timing
        if user is None or not user.check_password(password):
            services.register_login_failure(login)
            audit(
                "login_failed",
                actor=user,
                entity_type="accounts.User",
                entity_id=str(user.pk) if user else "",
                entity_repr=services.mask_identifier(login),
                request=request,
            )
            return Response(
                {"detail": INVALID_CREDENTIALS, "code": "invalid_credentials"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not user.is_active:
            return Response(
                {"detail": "Akkaunt bloklangan. Administratorga murojaat qiling.", "code": "account_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )

        services.clear_login_failures(login)
        update_last_login(None, user)
        access, refresh = services.issue_tokens(user)
        audit("login", actor=user, obj=user, request=request)
        response = Response({"access": access, "user": MeSerializer(user, context={"request": request}).data})
        services.set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={200: AccessTokenSerializer}, tags=["auth"])
    def post(self, request):
        _require_xhr(request)
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            return self._reject("Sessiya topilmadi. Qaytadan kiring.", code="refresh_missing")
        try:
            user_id = RefreshToken(raw).payload.get(settings.SIMPLE_JWT["USER_ID_CLAIM"])
        except TokenError:
            return self._reject()
        user = User.objects.filter(pk=user_id).first()
        if user is None or not user.is_active:
            return self._reject()
        serializer = TokenRefreshSerializer(data={"refresh": raw})
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:  # noqa: BLE001 — expired / blacklisted / malformed token
            return self._reject()
        response = Response({"access": serializer.validated_data["access"]})
        new_refresh = serializer.validated_data.get("refresh")
        if new_refresh:
            services.set_refresh_cookie(response, new_refresh)
        return response

    @staticmethod
    def _reject(detail: str = "Sessiya muddati tugagan. Qaytadan kiring.", code: str = "token_not_valid"):
        # Built explicitly: DRF turns NotAuthenticated into 403 for views without authenticators.
        response = Response({"detail": detail, "code": code}, status=status.HTTP_401_UNAUTHORIZED)
        services.clear_refresh_cookie(response)
        return response


class LogoutView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None}, tags=["auth"])
    def post(self, request):
        _require_xhr(request)
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                token = RefreshToken(raw)
                user = User.objects.filter(pk=token.payload.get(settings.SIMPLE_JWT["USER_ID_CLAIM"])).first()
                token.blacklist()
                if user:
                    audit("logout", actor=user, obj=user, request=request)
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        services.clear_refresh_cookie(response)
        return response


class MeView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": ALL_ROLES, "patch": ALL_ROLES}
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    @extend_schema(responses={200: MeSerializer}, tags=["auth"])
    def get(self, request):
        return Response(MeSerializer(request.user, context={"request": request}).data)

    @extend_schema(request=MeUpdateSerializer, responses={200: MeSerializer}, tags=["auth"])
    def patch(self, request):
        serializer = MeUpdateSerializer(data=request.data, context={"request": request}, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        profile_data = {k: data.pop(k) for k in ("specialization", "bio") if k in data}
        services.update_user(request.user, request.user, data=data, profile_data=profile_data, request=request)
        request.user.refresh_from_db()
        return Response(MeSerializer(request.user, context={"request": request}).data)


class ChangePasswordView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"post": ALL_ROLES}

    @extend_schema(request=ChangePasswordSerializer, responses={200: AccessTokenSerializer}, tags=["auth"])
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_own_password(
            request.user,
            serializer.validated_data["old_password"],
            serializer.validated_data["new_password"],
            request=request,
        )
        access, refresh = services.issue_tokens(request.user)
        response = Response({"access": access})
        services.set_refresh_cookie(response, refresh)
        return response


class PasswordResetView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    @extend_schema(request=PasswordResetSerializer, responses={200: DetailSerializer}, tags=["auth"])
    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.send_password_reset(serializer.validated_data["email"], request=request)
        return Response({"detail": "Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi."})


class PasswordResetConfirmView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetRateThrottle]

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None}, tags=["auth"])
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.confirm_password_reset(
            serializer.validated_data["uid"],
            serializer.validated_data["token"],
            serializer.validated_data["new_password"],
            request=request,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# --- user management --------------------------------------------------------------------------


class UserFilter(filters.FilterSet):
    group = filters.NumberFilter(method="filter_group")

    class Meta:
        model = User
        fields = {"role": ["exact"], "branch": ["exact"], "is_active": ["exact"]}

    def filter_group(self, queryset, name, value):
        from groups.models import OPEN_MEMBERSHIP_STATUSES

        return queryset.filter(
            Q(memberships__group_id=value, memberships__status__in=OPEN_MEMBERSHIP_STATUSES)
            | Q(teaching_groups__id=value)
        ).distinct()


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": (SA, AD, TE),
        "retrieve": (SA, AD, TE),
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "block": (SA, AD),
        "unblock": (SA, AD),
        "set_password": (SA, AD),
        "change_role": (SA,),
        "study_history": (SA, AD, TE),
        "teaching_overview": (SA, AD, TE),
    }
    http_method_names = ["get", "post", "patch", "head"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_class = UserFilter
    search_fields = ("first_name", "last_name", "phone", "email")
    ordering_fields = ("last_name", "first_name", "created_at", "last_login")
    ordering = ("last_name", "first_name", "id")

    def get_queryset(self):
        return users_for(self.request.user)

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return UserWriteSerializer
        if role_of(self.request.user) == TE:
            return StudentForTeacherSerializer
        return UserSerializer

    def _split(self, validated: dict) -> tuple[dict, dict]:
        data = dict(validated)
        profile = data.pop("profile", None) or {}
        return data, profile

    @extend_schema(request=UserWriteSerializer, responses={201: UserCreatedSerializer})
    def create(self, request, *args, **kwargs):
        serializer = UserWriteSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data, profile = self._split(serializer.validated_data)
        user, temporary = services.create_user(request.user, data=data, profile_data=profile, request=request)
        payload = UserSerializer(user, context=self.get_serializer_context()).data
        payload["temporary_password"] = temporary
        return Response(payload, status=status.HTTP_201_CREATED)

    @extend_schema(request=UserWriteSerializer, responses={200: UserSerializer})
    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserWriteSerializer(user, data=request.data, partial=True, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data, profile = self._split(serializer.validated_data)
        services.update_user(request.user, user, data=data, profile_data=profile, request=request)
        user.refresh_from_db()
        return Response(UserSerializer(user, context=self.get_serializer_context()).data)

    def _managed_object(self) -> User:
        user = self.get_object()
        if self.request.user.role == AD and user.role not in services.allowed_roles_to_manage(self.request.user):
            raise PermissionDenied("Bu foydalanuvchini boshqarishga ruxsat yo'q.")
        return user

    @extend_schema(request=BlockSerializer, responses={200: UserSerializer})
    @action(detail=True, methods=["post"])
    def block(self, request, pk=None):
        user = self._managed_object()
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.block_user(request.user, user, reason=serializer.validated_data["reason"], request=request)
        return Response(UserSerializer(user, context=self.get_serializer_context()).data)

    @extend_schema(request=None, responses={200: UserSerializer})
    @action(detail=True, methods=["post"])
    def unblock(self, request, pk=None):
        user = self._managed_object()
        services.unblock_user(request.user, user, request=request)
        return Response(UserSerializer(user, context=self.get_serializer_context()).data)

    @extend_schema(request=SetPasswordSerializer, responses={200: TemporaryPasswordSerializer})
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self._managed_object()
        if user.pk == request.user.pk:
            raise BusinessRuleError("O'z parolingizni 'Parolni o'zgartirish' orqali yangilang.", code="self_password")
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        temporary = services.admin_set_password(
            request.user, user, new_password=serializer.validated_data.get("new_password") or None, request=request
        )
        return Response({"temporary_password": temporary})

    @extend_schema(request=ChangeRoleSerializer, responses={200: UserSerializer})
    @action(detail=True, methods=["post"], url_path="change-role")
    def change_role(self, request, pk=None):
        user = self.get_object()
        serializer = ChangeRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.change_role(
            request.user,
            user,
            role=serializer.validated_data["role"],
            branch=serializer.validated_data.get("branch"),
            request=request,
        )
        user.refresh_from_db()
        return Response(UserSerializer(user, context=self.get_serializer_context()).data)

    @extend_schema(responses={200: OpenApiResponse(description="Memberships with attendance, grades, balance")})
    @action(detail=True, methods=["get"], url_path="study-history")
    def study_history(self, request, pk=None):
        user = self.get_object()
        if user.role != ST:
            raise BusinessRuleError("O'quv tarixi faqat student uchun mavjud.", code="not_student")
        return Response(overview.study_history(user, request.user))

    @extend_schema(responses={200: OpenApiResponse(description="Groups, upcoming lessons, weekly load")})
    @action(detail=True, methods=["get"], url_path="teaching-overview")
    def teaching_overview(self, request, pk=None):
        if role_of(request.user) == TE:
            # Teachers are not in their own users_for() scope; they may only look at themselves.
            require(str(request.user.pk) == str(pk), "Faqat o'z ma'lumotlaringizni ko'ra olasiz.")
            user = request.user
        else:
            user = self.get_object()
        if user.role != TE:
            raise BusinessRuleError("Ish yuklamasi faqat ustoz uchun mavjud.", code="not_teacher")
        return Response(overview.teaching_overview(user))


@extend_schema(responses={200: OpenApiResponse(description="Permission matrix")}, tags=["auth"])
class PermissionMatrixView(APIView):
    """Read-only view of the code-defined RBAC matrix (superadmin)."""

    permission_classes = [RolePermission]
    role_permissions = {"get": (SA,)}

    def get(self, request):
        from .permission_matrix import build_matrix

        return Response(build_matrix())
