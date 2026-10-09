import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";

import { AppLayout } from "@/app/layout/AppLayout";
import { Spinner } from "@/components/ui/display";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

const page = (loader: () => Promise<{ default: ComponentType }>) => {
  const C = lazy(loader);
  return (
    <Suspense fallback={<Spinner className="min-h-[50vh]" />}>
      <C />
    </Suspense>
  );
};

function FullScreenLoader() {
  return <Spinner className="min-h-dvh" />;
}

function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullScreenLoader />;
  if (status === "anonymous" || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

function GuestOnly() {
  const { status } = useAuth();
  if (status === "loading") return <FullScreenLoader />;
  if (status === "authenticated") return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return page(() => import("@/features/misc/ForbiddenPage"));
  }
  return <>{children}</>;
}

const SA: Role[] = ["superadmin"];
const STAFF: Role[] = ["superadmin", "admin"];
const STAFF_TE: Role[] = ["superadmin", "admin", "teacher"];
const WITH_ST: Role[] = ["superadmin", "admin", "student"];

const guarded = (roles: Role[], loader: () => Promise<{ default: ComponentType }>) => (
  <RequireRole roles={roles}>{page(loader)}</RequireRole>
);

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: "/login", element: page(() => import("@/features/auth/LoginPage")) },
      { path: "/forgot-password", element: page(() => import("@/features/auth/ForgotPasswordPage")) },
      { path: "/reset-password", element: page(() => import("@/features/auth/ResetPasswordPage")) },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: page(() => import("@/features/dashboard/DashboardPage")) },
          { path: "branches", element: guarded(SA, () => import("@/features/organizations/BranchesPage")) },
          { path: "rooms", element: guarded(STAFF, () => import("@/features/organizations/RoomsPage")) },
          { path: "admins", element: guarded(SA, () => import("@/features/users/AdminsPage")) },
          { path: "teachers", element: guarded(STAFF, () => import("@/features/users/TeachersPage")) },
          { path: "students", element: guarded(STAFF, () => import("@/features/users/StudentsPage")) },
          { path: "users/:id", element: guarded(STAFF_TE, () => import("@/features/users/UserDetailPage")) },
          { path: "courses", element: page(() => import("@/features/courses/CoursesPage")) },
          { path: "courses/:id", element: page(() => import("@/features/courses/CourseDetailPage")) },
          { path: "groups", element: page(() => import("@/features/groups/GroupsPage")) },
          { path: "groups/:id", element: page(() => import("@/features/groups/GroupDetailPage")) },
          { path: "schedule", element: page(() => import("@/features/schedule/SchedulePage")) },
          { path: "attendance", element: page(() => import("@/features/attendance/AttendancePage")) },
          {
            path: "attendance/lesson/:id",
            element: guarded(STAFF_TE, () => import("@/features/attendance/LessonAttendancePage")),
          },
          { path: "assignments", element: page(() => import("@/features/assignments/AssignmentsPage")) },
          { path: "assignments/:id", element: page(() => import("@/features/assignments/AssignmentDetailPage")) },
          { path: "grades", element: page(() => import("@/features/grades/GradesPage")) },
          { path: "payments", element: guarded(WITH_ST, () => import("@/features/payments/PaymentsPage")) },
          { path: "debtors", element: guarded(STAFF, () => import("@/features/payments/DebtorsPage")) },
          { path: "reports", element: guarded(STAFF_TE, () => import("@/features/reports/ReportsPage")) },
          { path: "announcements", element: page(() => import("@/features/announcements/AnnouncementsPage")) },
          { path: "announcements/:id", element: page(() => import("@/features/announcements/AnnouncementsPage")) },
          { path: "chat", element: page(() => import("@/features/chat/ChatPage")) },
          { path: "rewards", element: page(() => import("@/features/rewards/RewardsPage")) },
          { path: "audit", element: guarded(SA, () => import("@/features/audit/AuditPage")) },
          { path: "settings", element: guarded(STAFF, () => import("@/features/organizations/SettingsPage")) },
          { path: "notifications", element: page(() => import("@/features/misc/NotificationsPage")) },
          { path: "profile", element: page(() => import("@/features/auth/ProfilePage")) },
          { path: "change-password", element: page(() => import("@/features/auth/ChangePasswordPage")) },
          { path: "*", element: page(() => import("@/features/misc/NotFoundPage")) },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
