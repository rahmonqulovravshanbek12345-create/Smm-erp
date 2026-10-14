import { expect, test } from "./fixtures";
import { openAs, SERVER } from "./helpers";

test("Demo: Facebook Lead Ads kartasi ko'rinmaydi (faqat serverli tizimda)", async ({ page }) => {
  test.skip(SERVER, "Demo uchun");
  await openAs(page, "u_admin", "/integratsiyalar");
  await expect(page.getByRole("heading", { name: "Integratsiyalar" })).toBeVisible();
  await expect(page.getByText("Facebook Lead Ads → CRM")).toHaveCount(0);
});

test("Server: admin Facebook Lead Ads'ni sozlaydi, sahifani tekshiradi va yoqadi; boshqa rol ko'rmaydi", async ({ page }) => {
  test.skip(!SERVER, "Faqat serverli tizimda");
  await openAs(page, "u_admin", "/integratsiyalar");
  await expect(page.getByText("Facebook Lead Ads → CRM")).toBeVisible();
  const yoq = page.getByRole("checkbox", { name: "Yoqilgan" });
  await expect(yoq).toBeDisabled(); // to'liq sozlanmaguncha yoqib bo'lmaydi
  await page.getByRole("button", { name: "Yaratish" }).click();
  await page.getByRole("textbox", { name: /^Facebook sahifa ID/ }).fill("1122334455");
  await page.getByRole("textbox", { name: /^Sahifa kirish tokeni/ }).fill("EAAB-sinov-token-0001");
  await page.getByRole("textbox", { name: /^Meta ilovasi App Secret/ }).fill("sinov-app-secret-123");
  await page.locator("button:not([disabled])", { hasText: /^Saqlash$/ }).click();
  await expect(page.getByText("Saqlandi").first()).toBeVisible();
  await page.getByRole("button", { name: "Sahifani tekshirish" }).click();
  await expect(page.getByText("Facebook sahifasi ulangan: Sinov sahifasi")).toBeVisible();
  await expect(yoq).toBeEnabled();
  await yoq.check();
  await expect(page.getByText("Facebook lidlari yoqildi")).toBeVisible();
  // Maxfiy qiymatlar sahifada ochiq ko'rinmaydi
  await page.reload();
  await expect(page.locator("body")).not.toContainText("EAAB-sinov-token-0001");
  await expect(page.locator("body")).not.toContainText("sinov-app-secret-123");

  await openAs(page, "u_boss", "/integratsiyalar");
  await expect(page.getByText("Facebook Lead Ads → CRM")).toHaveCount(0);
});
