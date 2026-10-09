# Backend conventions (read before writing a module)

Reference implementation: `accounts/` (views, serializers, services, selectors, tests).
Design contract: `../docs/DATABASE_SCHEMA.md`, `../docs/API_SPECIFICATION.md`, `../docs/ARCHITECTURE.md`.

## Layout per app
| File | Content |
|---|---|
| `models.py` | Already written (schema contract). Change only inside your own app, then `makemigrations <app>` |
| `selectors.py` | Role-scoped querysets: `<things>_for(user)`. All reads go through them |
| `services.py` | Writes/state transitions in `transaction.atomic`, audit + notifications |
| `serializers.py` | Explicit `fields`; `read_only_fields` for everything server-controlled |
| `filters.py` | `django_filters.FilterSet` classes |
| `views.py` | Thin ViewSets/APIViews |
| `urls.py` | `SimpleRouter` (already included from `config/urls.py` — do not edit config) |
| `admin.py` | Basic `ModelAdmin` (list_display, list_filter, search_fields) |
| `tests/` | `__init__.py` + `test_*.py`; app-specific factories in `tests/factories.py` |

## Permissions (default deny)
```python
from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission


class ThingViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    role_permissions = {"list": ALL_ROLES, "retrieve": ALL_ROLES, "create": (SA, AD), "my_action": (TE,)}
    http_method_names = ["get", "post", "patch", "head"]  # drop "put"/"delete" unless needed

    def get_queryset(self):
        return things_for(self.request.user)  # scope → foreign rows give 404
```
* Every action (incl. `@action`s) must appear in `role_permissions`; `accounts/tests/test_permission_audit.py`
  fails otherwise. APIViews use lowercase HTTP methods as keys (`{"get": ..., "post": ...}`).
* Object-level write rules (read scope ≠ write scope): check in the view/service and raise
  `PermissionDenied` (403) via `core.permissions.require(cond, msg)`.
* Never trust `user_id`, `role`, `branch`, `student`, `created_by`, `marked_by`, `graded_by`, `received_by`
  from the request when the server can derive it. Admin-created rows get `branch = request.user.branch`.
* Selectors, `get_queryset()` and `get_serializer_class()` must tolerate `AnonymousUser` (drf-spectacular
  calls them without a user while generating the schema): use `core.permissions.role_of(user)` instead of
  `user.role`, and return `Model.objects.none()` for unknown roles.
* Existing scoping helpers: `groups.selectors.groups_for/memberships_for/is_group_teacher/can_manage_group/
  is_active_member/open_memberships/attendance_eligible_memberships`, `schedules.selectors.lessons_for/can_teach_lesson`,
  `accounts.selectors.users_for`, `core.permissions.branch_scope_id(user)`.

## Errors
* Field problems: `raise serializers.ValidationError({"field": ["Uzbek message"]})` → 400 `validation_error`.
* Domain rule: `raise BusinessRuleError("Uzbek message", code="snake_case_code")` → 400.
* Duplicates/overlaps: `raise ConflictError("…", code="…", extra={"conflicts": [...]})` → 409.
* Django `ValidationError`, `ProtectedError`, `IntegrityError` are converted by `core.exceptions`.
* All user-facing messages in Uzbek (Latin).

## Cross-cutting services
* Audit: `from audit.services import record as audit` → `audit("action", actor=user, obj=obj, changes={...}, request=request)`.
  Record every create/update/delete of business data and every security-relevant action. Never pass secrets.
* Notifications: `from notifications.services import notify` → `notify(users, NotificationType.X, title, body, link, data)`.
  `link` is a frontend path, e.g. `/student/assignments/12`.
* Settings: `from organizations.models import SystemSettings` → `SystemSettings.load()`.
* Files: `core.files.validate_upload(f, field="file")` for private uploads, `core.files.protected_file_response(field_file, name)`
  for downloads (only after a permission check). Private FileFields already use `core.storage.private_storage`.
* Formulas (do NOT re-implement): `attendance.calculations.summarize/rate/counts_from`,
  `payments.calculations.with_balances/balance_of/totals/allocate_fifo`, `GroupMembership.monthly_amount`.

## Data rules
* Money: `Decimal` only, serialize as string (DRF default). Never `float` for money.
* Time: `timezone.now()` for instants, `timezone.localdate()` for "today"; lesson date/time are local wall-clock values.
* Concurrency: lock the rows you validate against (`select_for_update()`) inside `transaction.atomic` for
  conflict/uniqueness/balance checks; rely on DB constraints as the last line of defence.
* Pagination is global (`?page`, `?page_size`); use `SearchFilter` (`search_fields`) and `OrderingFilter`
  (`ordering_fields`, default `ordering`).
* Use `select_related`/`prefetch_related`; no N+1 in list endpoints.

## OpenAPI
Annotate non-trivial views with `drf_spectacular.utils.extend_schema` (request/response serializers) so
`python manage.py spectacular --validate --fail-on-warn` stays clean for your app.

## Tests (pytest)
* Shared fixtures in `conftest.py`: `api_client`, `client_for(user)`, `factories`, `branch`, `other_branch`,
  `superadmin`, `admin_user`, `other_admin`, `teacher`, `other_teacher`, `student`, `other_student`, `course`,
  `group`, `membership`; factory functions `make_branch/make_user/make_room/make_course/make_group/enroll/make_lesson`.
* For each endpoint test: allowed roles succeed, forbidden roles get 403, out-of-scope objects get 404,
  validation errors return `errors[field]`, side effects (audit/notification/history rows) exist.
* Run: `TEST_DB_NAME=test_educentr_<you> .venv/Scripts/python -m pytest <apps> -q -p no:cacheprovider`
  (a unique test DB name per concurrent run is mandatory).
* Lint: `.venv/Scripts/ruff check <apps>` and `.venv/Scripts/ruff format <apps>`.
