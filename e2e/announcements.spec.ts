import { expect, test } from "./fixtures";
import { openAs, watch } from "./helpers";

test("Marketolog SMM'larga e'lon yuboradi; SMM o'qiydi; marketolog kim o'qiganini ko'radi", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_mk", "/bildirishnomalar");
  await page.getByRole("button", { name: "📣 E'lon yuborish" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Matn").fill("Juma kuni 18:00 gacha oylik hisobotlarni topshiring");
  await dlg.getByRole("radio", { name: "Rol bo'yicha" }).click();
  await dlg.getByLabel(/^SMM/).check();
  const send = dlg.getByRole("button", { name: /kishiga yuborish$/ });
  await expect(send).toHaveText(/^\d+ kishiga yuborish$/);
  const n = Number((await send.textContent())!.match(/\d+/)![0]);
  await send.click();
  await expect(page.getByText("E'lon yuborildi")).toBeVisible();
  const card = page.locator("li").filter({ hasText: "Juma kuni 18:00 gacha oylik hisobotlarni topshiring" });
  await expect(card.getByText(`0 / ${n} o'qidi`)).toBeVisible();

  // SMM: e'lonni ko'radi, lekin yubora olmaydi va hisobotni ko'rmaydi
  await openAs(page, "u_smm1", "/bildirishnomalar");
  await expect(page.getByRole("button", { name: "📣 E'lon yuborish" })).toHaveCount(0);
  await expect(page.getByText("Yuborilgan e'lonlar")).toHaveCount(0);
  await page.getByRole("button", { name: /📣 E'lon — .*Juma kuni 18:00/ }).click();

  await openAs(page, "u_mk", "/bildirishnomalar");
  await expect(card.getByText(`1 / ${n} o'qidi`)).toBeVisible();
  expect(p.errors).toEqual([]);
});
