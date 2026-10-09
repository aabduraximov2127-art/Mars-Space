"""Guard rail: every API endpoint must be explicitly public or RBAC-protected with roles per action."""

import pytest

from accounts.permission_matrix import PUBLIC_VIEWS, build_matrix, describe_view, iter_api_endpoints

pytestmark = pytest.mark.django_db


def test_every_api_view_declares_permissions():
    offenders = []
    for path, view_class, mapping in iter_api_endpoints():
        kind = describe_view(view_class)
        if kind == "public":
            assert view_class.__name__ in PUBLIC_VIEWS, f"{path}: unexpected public view {view_class.__name__}"
            continue
        if kind != "rbac":
            offenders.append(f"{path} ({view_class.__name__}) does not use RolePermission")
            continue
        role_map = getattr(view_class, "role_permissions", {}) or {}
        for method, action in mapping.items():
            if action not in role_map:
                offenders.append(f"{method.upper()} {path} ({view_class.__name__}.{action}) has no role mapping")
    assert not offenders, "\n".join(offenders)


def test_matrix_endpoint_superadmin_only(client_for, superadmin, admin_user):
    assert client_for(admin_user).get("/api/auth/permissions/").status_code == 403
    res = client_for(superadmin).get("/api/auth/permissions/")
    assert res.status_code == 200
    assert any(row["path"].startswith("/api/users") for row in res.data)
    assert build_matrix()
