import { expect, test } from "./fixtures";
import { openAs, state } from "./helpers";

test("Mavzu: bitta tugma yorug' ↔ qorong'i almashtiradi va tanlov eslab qolinadi", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openAs(page, "u_boss", "/");
  await page.locator("aside button").last().click();
  const toggle = page.getByRole("button", { name: /mavzuga o'tish/ });
  // Qurilma yorug' → tugma qorong'iga o'tishni taklif qiladi
  await expect(toggle).toHaveAttribute("aria-label", "Qorong'i mavzuga o'tish");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-label", "Yorug' mavzuga o'tish");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("aside button").last().click();
  await page.getByRole("button", { name: "Yorug' mavzuga o'tish" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("Boshlang'ich to'lov summa bilan: 0 yozilsa oldindan faktura chiqmaydi, qoldiq butun summa", async ({ page }) => {
  await openAs(page, "u_boss", "/loyihalar");
  await page.getByRole("button", { name: "+ Yangi loyiha" }).click();
  const d = page.locator("[role=dialog]");
  await d.getByLabel("Mijoz (loyiha nomi)").fill("Nol To'lov Mijoz");
  await d.getByLabel("Shartnoma raqami").fill("SH-NOL/1");
  await d.getByLabel("Oylik narx (so'm)").fill("5000000");
  await d.getByLabel("Oylik xizmatlar: boshlang'ich to'lov (so'm)").fill("0");
  await d.getByRole("button", { name: "Loyiha kartasini yaratish" }).click();
  await expect(d).toHaveCount(0);
  const s = await state(page);
  const prj = s.projects.find((x: { contractNo: string }) => x.contractNo === "SH-NOL/1");
  expect(prj.prepayAmount).toBe(0);
  const inv = s.invoices.filter((i: { projectId: string }) => i.projectId === prj.id);
  expect(inv.some((i: { kind: string }) => i.kind === "prepay")).toBe(false);
  expect(inv.find((i: { kind: string }) => i.kind === "remainder").amount).toBe(5_000_000);
});
