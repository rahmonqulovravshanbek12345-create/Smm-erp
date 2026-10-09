import { expect, test, type Page } from "@playwright/test";
import { check } from "../src/lib/audit-check";
import { go, openAs, state, watch } from "./helpers";

const dialog = (page: Page) => page.locator("[role=dialog]");

test("Dollardagi shartnoma: loyiha → faktura $ → bank orqali so'mda to'lov (+2%) → hujjatlar $", async ({ page }) => {
  const p = await watch(page);
  await openAs(page, "u_boss", "/loyihalar");
  const rate = (await state(page)).settings.usdRate as number;

  await page.getByRole("button", { name: "+ Yangi loyiha" }).click();
  const d = dialog(page);
  await d.getByLabel("Mijoz (loyiha nomi)").fill("Dollar Mijoz");
  await d.getByLabel("Shartnoma raqami").fill("SH-USD/777");
  await d.getByLabel("Shartnoma valyutasi").selectOption("USD");
  await expect(d.getByText(/Bugungi kurs: 1 \$ =/)).toBeVisible();
  const price = d.getByLabel("Oylik narx (USD)");
  await price.fill("1000");
  await expect(price).toHaveValue("1 000");
  await expect(d.getByText(/Oylik: \$1 000 \(≈/)).toBeVisible();
  await d.getByRole("button", { name: "Loyiha kartasini yaratish" }).click();
  await expect(d).toHaveCount(0);

  let s = await state(page);
  const prj = s.projects.find((x: { contractNo: string }) => x.contractNo === "SH-USD/777");
  expect(prj.currency).toBe("USD");
  expect(prj.services[0].priceUsd).toBe(1000);
  expect(prj.services[0].price).toBe(Math.round(1000 * rate));
  await expect(page.getByText("$1 000").filter({ visible: true }).first()).toBeVisible();

  // Moliya: oldindan 50% = $500
  await page.getByRole("button", { name: "Moliya", exact: true }).click();
  await expect(page.getByText("$500").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "To'lov", exact: true }).first().click();
  await expect(d.getByText(/Shartnoma dollarda/)).toBeVisible();
  await d.getByLabel(/To'lov kunidagi kurs/).fill("12800");
  await expect(d.getByLabel("Ustama (%)")).toHaveValue("2");
  const expected = Math.round(500 * 12_800 * 1.02);
  await expect(d.getByLabel("Kelgan summa (so'm)")).toHaveValue(String(expected).replace(/\B(?=(\d{3})+(?!\d))/g, " "));
  await expect(d.getByText("Fakturadan yopiladi: $500")).toBeVisible();
  await d.getByRole("button", { name: "Qabul qilish" }).click();
  await expect(d).toHaveCount(0);

  s = await state(page);
  const pre = s.invoices.find((i: { projectId: string; kind: string }) => i.projectId === prj.id && i.kind === "prepay");
  const tx = s.transactions.find((t: { projectId?: string; invoiceId?: string }) => t.projectId === prj.id && t.invoiceId);
  expect(tx).toMatchObject({ amount: expected, invoiceUsd: 500, fxRate: 12_800, markupPct: 2, accountId: "acc_bank" });
  const today = await page.evaluate(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  expect(check(s, today)).toEqual([]);

  // Naqd: ustama 0
  await page.getByRole("button", { name: "To'lov", exact: true }).first().click();
  await d.getByLabel("Hisob (kassa)").selectOption("acc_cash");
  await expect(d.getByLabel("Ustama (%)")).toHaveValue("0");
  await d.getByRole("button", { name: "Bekor qilish" }).click();

  // Shartnoma va faktura hujjatlari dollarda
  await go(page, `/hujjat/shartnoma/${prj.id}`);
  await expect(page.getByText("Naqd to'lovda ustama qo'yilmaydi", { exact: false })).toBeVisible();
  await expect(page.getByText(/AQSH dollari 00 sent/).first()).toBeVisible();
  await go(page, `/hujjat/faktura/${pre.id}`);
  await expect(page.getByText("Besh yuz AQSH dollari 00 sent")).toBeVisible();
  expect(p.errors).toEqual([]);
  expect(p.external).toEqual([]);
});
