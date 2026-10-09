import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Demo12345!";

export const USERS = {
  superadmin: "+998900000001",
  admin: "+998900000002",
  teacher: "+998901000001",
  student: "+998902000001",
} as const;

/**
 * Log in through the UI and collect page errors / 5xx responses for later assertions.
 * The backend limits logins to 10/min per IP; when the suite hits that limit we wait as told and retry.
 */
export async function login(page: Page, phone: string) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/login");
  await page.locator("input[autocomplete=username]").fill(phone);
  await page.locator("input[autocomplete=current-password]").fill(PASSWORD);
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = page.waitForResponse((r) => r.url().endsWith("/api/auth/login/"));
    await page.getByRole("button", { name: "Kirish" }).click();
    const r = await response;
    if (r.status() !== 429) break;
    const body = (await r.json().catch(() => ({}))) as { retry_after?: number };
    await page.waitForTimeout(((body.retry_after ?? 30) + 1) * 1000);
  }
  await expect(page).toHaveURL(/\/$/);
  return problems;
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
}
