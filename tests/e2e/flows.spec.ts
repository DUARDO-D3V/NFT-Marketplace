import { expect, test, type Page } from "@playwright/test";

const openMenu = async (page: Page) => {
  const toggle = page.getByRole("button", { name: "Abrir menu" });
  if (await toggle.isVisible()) await toggle.click();
};

const seedScenario = (scenario: string, email?: string) => async ({ page }: { page: import("@playwright/test").Page }) => {
  await page.addInitScript(([value, user]) => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:scenario", value);
    if (user) localStorage.setItem("kurio:session", JSON.stringify({ email: user, name: "Teste" }));
  }, [scenario, email ?? ""]);
};

test("rota inexistente mostra a página 404", async ({ page }) => {
  await page.goto("/rota-que-nao-existe");
  await expect(page.getByText("404 — página não encontrada")).toBeVisible();
});

test("acesso direto a NFT inexistente informa o erro", async ({ page }) => {
  await page.goto("/nft/nao-existe");
  await expect(page.getByRole("heading", { name: "Não encontramos esse NFT." })).toBeVisible();
});

test("rota privada sem sessão redireciona para o login e preserva o destino", async ({ page }) => {
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/account\?redirect=/);
  await expect(page.locator(".account-form")).toBeVisible();
});

test("catálogo vazio exibe o estado vazio", async ({ page }) => {
  await seedScenario("empty-catalog")({ page });
  await page.goto("/");
  await expect(page.getByText("Nenhuma obra encontrada")).toBeVisible();
});

test("falha transitória do catálogo se recupera com nova tentativa", async ({ page }) => {
  await seedScenario("transient-failure")({ page });
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible({ timeout: 15_000 });
});

test("erro 503 no catálogo permite tentar novamente", async ({ page }) => {
  await seedScenario("catalog-error")({ page });
  await page.goto("/");
  await expect(page.getByText("Não foi possível carregar a coleção.")).toBeVisible({ timeout: 15_000 });
  await openMenu(page);
  await page.evaluate(() => localStorage.setItem("kurio:scenario", "standard"));
  await page.getByRole("button", { name: "Tentar novamente" }).click();
});

test("edição esgotada durante a compra bloqueia o pedido", async ({ page }) => {
  await seedScenario("sold-out-before-order", "colecionador@kurio.test")({ page });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  const walletField = page.getByLabel(/Endereço da carteira/);
  if (!(await walletField.isVisible())) await page.getByText("Dados do colecionador").click();
  await walletField.fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});

test("segundo usuário entra e a troca de usuário isola os dados", async ({ page }) => {
  await page.goto("/nft/emerald-ape-042");
  await openMenu(page);
  await page.getByRole("button", { name: /Entrar/ }).click();
  await page.locator(".account-form").getByLabel("E-mail").fill("aurora@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio456");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page.getByRole("dialog", { name: /Entre na sua conta/ })).toBeHidden();
  await page.goto("/account/profile");
  await expect(page.getByLabel(/E-mail/).first()).toHaveValue("aurora@kurio.test");
});

test("diálogo de login prende o foco e fecha com Escape", async ({ page }) => {
  await page.goto("/nft/emerald-ape-042");
  await openMenu(page);
  await page.getByRole("button", { name: /Entrar/ }).click();
  const dialog = page.getByRole("dialog", { name: /Entre na sua conta/ });
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("login inválido associa o erro ao campo", async ({ page }) => {
  await page.goto("/nft/emerald-ape-042");
  await openMenu(page);
  await page.getByRole("button", { name: /Entrar/ }).click();
  const form = page.locator(".account-form");
  await form.getByLabel("E-mail").fill("x@kurio.test");
  await form.getByLabel("Senha", { exact: true }).fill("errada123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("E-mail")).toHaveAttribute("aria-invalid", "true");
});
