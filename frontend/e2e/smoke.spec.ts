import { expect, test } from "@playwright/test";

import { login, USERS } from "./helpers";

const PAGES: Record<keyof typeof USERS, string[]> = {
  superadmin: ["/", "/branches", "/admins", "/teachers", "/students", "/courses", "/groups", "/schedule", "/payments", "/debtors", "/reports", "/announcements", "/audit", "/settings"],
  admin: ["/", "/students", "/teachers", "/rooms", "/groups", "/schedule", "/attendance", "/assignments", "/payments", "/debtors", "/reports", "/chat", "/rewards"],
  teacher: ["/", "/groups", "/schedule", "/attendance", "/assignments", "/grades", "/rewards", "/reports", "/chat", "/announcements"],
  student: ["/", "/groups", "/schedule", "/attendance", "/assignments", "/grades", "/payments", "/rewards", "/chat", "/announcements"],
};

for (const [role, paths] of Object.entries(PAGES) as [keyof typeof USERS, string[]][]) {
  test(`${role}: every navigation page renders without errors`, async ({ page }) => {
    const problems = await login(page, USERS[role]);
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main h1").first(), path).toBeVisible();
      await expect(page.getByText("Xatolik yuz berdi"), path).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });
}

test("student cannot open staff pages", async ({ page }) => {
  await login(page, USERS.student);
  await page.goto("/debtors");
  await expect(page.getByText("Ruxsat yo'q")).toBeVisible();
});

test("unauthenticated visitor is sent to login", async ({ page }) => {
  await page.goto("/payments");
  await expect(page).toHaveURL(/\/login$/);
});
