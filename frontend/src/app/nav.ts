import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Coins,
  DoorOpen,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const dashboard: NavItem = { to: "/", label: "Dashboard", icon: LayoutDashboard };
const chat: NavItem = { to: "/chat", label: "Chat", icon: MessagesSquare };
const announcements: NavItem = { to: "/announcements", label: "E'lonlar", icon: Megaphone };

export const NAV: Record<Role, NavSection[]> = {
  superadmin: [
    { items: [dashboard] },
    {
      title: "Boshqaruv",
      items: [
        { to: "/branches", label: "Filiallar", icon: Building2 },
        { to: "/admins", label: "Adminlar", icon: ShieldCheck },
        { to: "/teachers", label: "Ustozlar", icon: UserCog },
        { to: "/students", label: "Studentlar", icon: Users },
        { to: "/rooms", label: "Xonalar", icon: DoorOpen },
      ],
    },
    {
      title: "Ta'lim",
      items: [
        { to: "/courses", label: "Kurslar", icon: BookOpen },
        { to: "/groups", label: "Guruhlar", icon: UsersRound },
        { to: "/schedule", label: "Dars jadvali", icon: CalendarDays },
        { to: "/attendance", label: "Davomat", icon: ClipboardCheck },
        { to: "/assignments", label: "Vazifalar", icon: FileText },
      ],
    },
    {
      title: "Moliya",
      items: [
        { to: "/payments", label: "To'lovlar", icon: Wallet },
        { to: "/debtors", label: "Qarzdorlar", icon: WalletCards },
        { to: "/reports", label: "Hisobotlar", icon: BarChart3 },
      ],
    },
    {
      title: "Aloqa",
      items: [announcements, chat, { to: "/rewards", label: "Coinlar", icon: Coins }],
    },
    {
      title: "Tizim",
      items: [
        { to: "/audit", label: "Audit log", icon: ScrollText },
        { to: "/settings", label: "Sozlamalar", icon: Settings },
      ],
    },
  ],
  admin: [
    { items: [dashboard] },
    {
      title: "Boshqaruv",
      items: [
        { to: "/students", label: "Studentlar", icon: Users },
        { to: "/teachers", label: "Ustozlar", icon: UserCog },
        { to: "/rooms", label: "Xonalar", icon: DoorOpen },
      ],
    },
    {
      title: "Ta'lim",
      items: [
        { to: "/courses", label: "Kurslar", icon: BookOpen },
        { to: "/groups", label: "Guruhlar", icon: UsersRound },
        { to: "/schedule", label: "Dars jadvali", icon: CalendarDays },
        { to: "/attendance", label: "Davomat", icon: ClipboardCheck },
        { to: "/assignments", label: "Vazifalar", icon: FileText },
      ],
    },
    {
      title: "Moliya",
      items: [
        { to: "/payments", label: "To'lovlar", icon: Wallet },
        { to: "/debtors", label: "Qarzdorlar", icon: WalletCards },
        { to: "/reports", label: "Hisobotlar", icon: BarChart3 },
      ],
    },
    { title: "Aloqa", items: [announcements, chat, { to: "/rewards", label: "Coinlar", icon: Coins }] },
  ],
  teacher: [
    { items: [dashboard] },
    {
      title: "Ta'lim",
      items: [
        { to: "/groups", label: "Guruhlarim", icon: UsersRound },
        { to: "/schedule", label: "Dars jadvali", icon: CalendarDays },
        { to: "/attendance", label: "Davomat", icon: ClipboardCheck },
        { to: "/assignments", label: "Vazifalar", icon: FileText },
        { to: "/grades", label: "Baholar", icon: Star },
        { to: "/rewards", label: "Coinlar", icon: Coins },
        { to: "/reports", label: "Hisobotlar", icon: BarChart3 },
      ],
    },
    { title: "Aloqa", items: [chat, announcements] },
  ],
  student: [
    { items: [dashboard] },
    {
      title: "O'qish",
      items: [
        { to: "/groups", label: "Guruhlarim", icon: GraduationCap },
        { to: "/schedule", label: "Dars jadvali", icon: CalendarDays },
        { to: "/attendance", label: "Davomatim", icon: ClipboardCheck },
        { to: "/assignments", label: "Vazifalar", icon: FileText },
        { to: "/grades", label: "Baholarim", icon: Star },
      ],
    },
    {
      title: "Hisob",
      items: [
        { to: "/payments", label: "To'lovlarim", icon: Wallet },
        { to: "/rewards", label: "Coinlarim", icon: Coins },
      ],
    },
    { title: "Aloqa", items: [chat, announcements] },
  ],
};
