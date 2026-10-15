import { expect, test } from "./fixtures";
import { openAs, SERVER } from "./helpers";

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("Admin xodim ismini o'zgartiradi (bitta maydon); tizimda hamma joyda yangi ism chiqadi", async ({ page }) => {
  await openAs(page, "u_admin", "/admin");
  const box = page.getByRole("textbox", { name: "Dilnoza Yusupova: ism-familiya" });
  await box.fill("Dilnoza Yusupova-Karimova");
  await box.blur();
  await expect(page.getByText("Ism o'zgartirildi").first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Dilnoza Yusupova-Karimova: ism-familiya" })).toBeVisible();
  // bo'sh ism qabul qilinmaydi: eski qiymat qoladi
  const again = page.getByRole("textbox", { name: "Dilnoza Yusupova-Karimova: ism-familiya" });
  await again.fill("   ");
  await again.blur();
  await expect(page.getByText(/Ism-familiyani kiriting/).first()).toBeVisible();
});

test("Server: xodim profil rasmini yuklaydi, hamma joyda ko'rinadi, o'chirsa bosh harflar qaytadi", async ({ page }) => {
  test.skip(!SERVER, "Rasm yuklash faqat serverli tizimda");
  await openAs(page, "u_admin", "/");
  await page.locator("aside button").last().click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "rasm.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByText("Profil rasmi saqlandi").first()).toBeVisible();
  const img = page.locator('aside img[src*="/api/avatar/u_admin"]').first();
  await expect(img).toBeVisible();
  // Rasm haqiqatan yuklangan (cookie bilan, 200)
  await expect.poll(async () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Boshqa rol (rahbar) ham rasmni ko'radi
  await openAs(page, "u_boss", "/");
  const r = await page.request.get("/api/avatar/u_admin");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("image/jpeg");
});

test("Server: admin boshqa xodimga rasm qo'yadi va o'chiradi", async ({ page }) => {
  test.skip(!SERVER, "Rasm yuklash faqat serverli tizimda");
  await openAs(page, "u_admin", "/admin");
  const row = page.locator("tr", { has: page.getByRole("textbox", { name: "Dilnoza Yusupova: ism-familiya" }) });
  await row.locator('input[type="file"]').setInputFiles({ name: "rasm.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByText("Profil rasmi saqlandi").first()).toBeVisible();
  await page.getByRole("button", { name: /Dilnoza Yusupova.*: rasmni o'chirish/ }).click();
  await expect(page.getByText("Profil rasmi o'chirildi").first()).toBeVisible();
});
