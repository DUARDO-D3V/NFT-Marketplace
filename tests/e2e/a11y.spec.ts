import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const signIn = (page: Page) =>
  page.addInitScript(() => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:session", JSON.stringify({ email: "colecionador@kurio.test", name: "Colecionador Kurio" }));
  });

const audit = async (page: Page, label: string) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const summary = results.violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, label).toEqual([]);
};

for (const width of [390, 1440]) {
  test(`axe: telas principais sem violações WCAG A/AA em ${width}px`, async ({ page }) => {
    await signIn(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".nft-card").first()).toBeVisible();
    await audit(page, "home");
    await page.goto("/nft/emerald-ape-042");
    await expect(page.getByRole("heading", { name: "Emerald Ape #042" })).toBeVisible();
    await audit(page, "detalhe");
    await page.getByRole("button", { name: "Comprar agora" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
    await audit(page, "carrinho");
    await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await audit(page, "pagamento");
    await page.goto("/account/profile");
    await expect(page.getByLabel(/E-mail/).first()).toBeVisible();
    await audit(page, "perfil");
    await page.goto("/account/wallets");
    await page.waitForLoadState("networkidle");
    await audit(page, "carteiras");
  });
}

test("imagens relevantes têm alternativa textual", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  const missing = await page.locator("img:not([alt])").count();
  expect(missing).toBe(0);
  const cardImages = page.locator(".nft-card img");
  const alts = await cardImages.evaluateAll((images) => images.map((image) => image.getAttribute("alt") ?? ""));
  expect(alts.length).toBeGreaterThan(0);
  expect(alts.every((alt) => alt.trim().length > 3)).toBe(true);
});

test("menu móvel move o foco, fecha com Escape e devolve o foco ao botão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/nft/emerald-ape-042");
  const toggle = page.getByRole("button", { name: "Abrir menu" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const nav = page.locator("#primary-nav");
  await expect(nav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("diálogo de sessão expirada prende o foco", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:scenario", "session-expired");
    localStorage.setItem("kurio:session", JSON.stringify({ email: "colecionador@kurio.test", name: "Colecionador Kurio" }));
  });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  const field = page.getByLabel(/Endereço da carteira/);
  if (!(await field.isVisible())) await page.getByText("Dados do colecionador").click();
  await field.fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
});
