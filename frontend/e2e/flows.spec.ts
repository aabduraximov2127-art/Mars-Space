import { expect, test, type Page } from "@playwright/test";

import { expectToast, login, USERS } from "./helpers";

/** Each run creates its own data (unique titles/phones), so the suite can be repeated on the same database. */
const stamp = Date.now().toString().slice(-7);

async function as(page: Page, phone: string) {
  await page.context().clearCookies();
  return login(page, phone);
}

test("assignment: teacher publishes, student submits, teacher grades, student sees the grade", async ({ page }) => {
  const title = `E2E vazifa ${stamp}`;

  await as(page, USERS.teacher);
  await page.goto("/assignments");
  await page.getByRole("button", { name: "Vazifa berish" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Guruh*").selectOption({ label: "Frontend 01 (FE-01)" });
  await form.getByLabel("Sarlavha*").fill(title);
  await form.getByLabel("Topshiriq matni*").fill("Playwright orqali yaratilgan vazifa.");
  await form.getByRole("button", { name: "Saqlash" }).click();
  await expectToast(page, "Vazifa e'lon qilindi");
  await expect(page).toHaveURL(/\/assignments\/\d+$/);
  const assignmentUrl = new URL(page.url()).pathname;

  await as(page, USERS.student);
  await page.goto(assignmentUrl);
  await page.getByLabel("Javob matni").fill("Bajarildi");
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expectToast(page, "Ish yuborildi");

  await as(page, USERS.teacher);
  await page.goto(assignmentUrl);
  await page.getByRole("cell", { name: "Aziz Karimov" }).click();
  const review = page.getByRole("dialog");
  await review.getByLabel(/^Ball/).fill("88");
  await review.getByRole("button", { name: "Baholash" }).click();
  await expectToast(page, "Baho qo'yildi");

  await as(page, USERS.student);
  await page.goto(assignmentUrl);
  await expect(page.getByText("88 / 100")).toBeVisible();
});

test("attendance: admin changes a student's status on a past lesson", async ({ page }) => {
  await as(page, USERS.admin);
  await page.goto("/groups");
  await page.getByText("Frontend 01").first().click();
  await page.getByRole("tab", { name: "Darslar" }).click();
  await page.locator("main").getByRole("link", { name: "Davomat", exact: true }).first().click();
  await expect(page).toHaveURL(/\/attendance\/lesson\/\d+$/);
  const group = page.getByRole("radiogroup").first();
  const current = await group.getByRole("radio", { checked: true }).textContent().catch(() => null);
  await group.getByRole("radio", { name: current === "Kechikdi" ? "Keldi" : "Kechikdi" }).click();
  await page.getByRole("button", { name: "Qolganlar keldi" }).click();
  await page.getByRole("button", { name: "Davomatni saqlash" }).click();
  await expectToast(page, "Davomat saqlandi");
});

test("payment: admin takes a payment and gets a receipt", async ({ page }) => {
  await as(page, USERS.admin);
  await page.goto("/payments");
  await page.getByRole("button", { name: "To'lov qabul qilish" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel(/Studentni qidirish/).fill("Aziz");
  const student = dlg.getByLabel("Student*");
  await expect(student.locator("option").nth(1)).toBeAttached();
  await student.selectOption({ index: 1 });
  const membership = dlg.getByLabel(/Guruh \(a'zolik\)/);
  await expect(membership.locator("option").nth(1)).toBeAttached();
  await membership.selectOption({ index: 1 });
  await dlg.getByLabel(/Summa/).fill(String(10_000 + (Number(stamp) % 1000)));
  await dlg.getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await expect(page.getByText(/To'lov cheki №/)).toBeVisible();
});

test("enrolment: admin creates a student and adds them to a group", async ({ page }) => {
  await as(page, USERS.admin);
  await page.goto("/students");
  await page.getByRole("button", { name: "Student qo'shish" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Ism*").fill("E2E");
  await dlg.getByLabel("Familiya*").fill(`Test${stamp}`);
  await dlg.getByLabel(/^Telefon/).fill(`+99899${stamp}`);
  await dlg.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Vaqtinchalik parol").first()).toBeVisible();
  await page.getByRole("button", { name: "Tushunarli" }).click();
  await page.getByText(`Test${stamp}`).first().click();
  await page.getByRole("button", { name: "Guruhga qo'shish" }).click();
  const enroll = page.getByRole("dialog");
  await expect(enroll.getByLabel("Guruh*").locator("option").nth(1)).toBeAttached();
  await enroll.getByLabel("Guruh*").selectOption({ index: 1 });
  await enroll.getByRole("button", { name: "Qo'shish" }).click();
  await expectToast(page, "Student guruhga qo'shildi");
  await expect(page.getByRole("heading", { name: "O'quv tarixi" })).toBeVisible();
});

test("chat: student writes to the group chat and the teacher sees it", async ({ page }) => {
  const text = `Salom ${stamp}`;
  await as(page, USERS.student);
  await page.goto("/chat");
  await page.getByRole("button", { name: /Frontend 01/ }).first().click();
  await page.getByLabel("Xabar").fill(text);
  await page.keyboard.press("Enter");
  await expect(page.getByText(text)).toBeVisible();

  await as(page, USERS.teacher);
  await page.goto("/chat");
  await page.getByRole("button", { name: /Frontend 01/ }).first().click();
  await expect(page.getByText(text)).toBeVisible();
});
