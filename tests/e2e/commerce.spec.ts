import { expect, test, type Page } from "@playwright/test";
import { revealCollectorData } from "./helpers";

const BUYER = "colecionador@kurio.test";
const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const EMPTY_CART = "Seu carrinho está esperando por uma história.";

const seedSession = (page: Page, email = BUYER) =>
  page.addInitScript((user) => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:session", JSON.stringify({ email: user, name: "Teste" }));
  }, email);

const logIn = async (page: Page, email: string, password: string) => {
  await page.goto("/account");
  const form = page.locator(".account-form");
  await form.getByLabel("E-mail").fill(email);
  await form.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
};

const addToCart = async (page: Page) => {
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
};

test("cupom inválido é rejeitado, KURIO10 aplica desconto e o item pode ser removido", async ({ page, isMobile }) => {
  await seedSession(page);
  await addToCart(page);
  const coupon = page.locator("#coupon");
  await coupon.fill("INVALIDO");
  await coupon.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Cupom inválido" })).toBeVisible();
  await expect(coupon).toHaveAttribute("aria-invalid", "true");
  await coupon.fill("KURIO10");
  await coupon.press("Enter");
  await expect(page.getByText("Código KURIO10 aplicado")).toBeVisible();
  await expect(page.locator(".summary-lines")).not.toContainText("(−) 0.00");
  if (isMobile) return; // o layout móvel do Figma não exibe o botão de remover.
  await page.getByRole("button", { name: "Remover Emerald Ape #042" }).click();
  await expect(page.getByText(EMPTY_CART)).toBeVisible();
});

test("quantidade do carrinho persiste após refresh", async ({ page }) => {
  await seedSession(page);
  await addToCart(page);
  await page.getByRole("button", { name: "Aumentar Emerald Ape #042" }).click();
  await expect(page.locator(".cart-quantity span")).toHaveText("2");
  await page.reload();
  await expect(page.locator(".cart-quantity span")).toHaveText("2");
});

test("carrinho de visitante é mantido após refresh e depois do login", async ({ page }) => {
  await addToCart(page);
  await page.reload();
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
  await logIn(page, BUYER, "kurio123");
  await page.goto("/cart");
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
});

test("troca de usuário não vaza o carrinho nem os favoritos do usuário anterior", async ({ page }) => {
  await seedSession(page);
  await addToCart(page);
  await page.goto("/nft/emerald-ape-042");
  await page.locator(".favorite-detail").click();
  await expect(page.locator(".favorite-detail")).toContainText("Favoritado");
  await page.goto("/account/profile");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await logIn(page, "aurora@kurio.test", "kurio456");
  await page.goto("/cart");
  await expect(page.getByText(EMPTY_CART)).toBeVisible();
  await page.goto("/nft/emerald-ape-042");
  await expect(page.locator(".favorite-detail")).toContainText("Favoritar");
  await expect(page.locator(".favorite-detail")).not.toContainText("Favoritado");
});

test("reutilizar a chave de idempotência com outro conteúdo gera conflito", async ({ page }) => {
  await seedSession(page);
  await addToCart(page);
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByLabel(/Endereço da carteira/).fill(WALLET);
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  const orderId = page.url().split("/order/")[1];
  const status = await page.evaluate(async ([id, wallet, email]) => {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify({
        wallet: { network: "Ethereum", provider: "MetaMask", address: wallet.replace("1234", "9999") },
        customer: { displayName: "Outro", profileName: "Outro", username: "outro_user", email },
        quoteFingerprint: "x",
        fingerprint: "conteudo-diferente",
      }),
    });
    return response.status;
  }, [orderId, WALLET, BUYER]);
  expect(status).toBe(409);
});

test("carteira com endereço inválido mostra erro associado ao campo", async ({ page }) => {
  await seedSession(page);
  await page.goto("/account/wallets");
  await page.getByLabel(/Nome de exibição/).fill("Carteira inválida");
  await page.getByLabel(/Apelido da carteira/).fill("invalida.eth");
  await page.getByLabel(/Endereço da carteira/).fill("0x123");
  await page.getByRole("button", { name: "Salvar carteira" }).click();
  const address = page.getByLabel(/Endereço da carteira/);
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.locator(".saved-wallet").filter({ hasText: "Carteira inválida" })).toHaveCount(0);
});

test("busca, filtro, ordenação e paginação combinados são restaurados pelo histórico", async ({ page, isMobile }) => {
  test.skip(isMobile, "Filtros, ordenação e paginação são controles do layout desktop.");
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await page.getByLabel("Ordenar NFTs").selectOption("price-low");
  await expect(page).toHaveURL(/sort=price-low/);
  const names = () => page.locator(".nft-card .nft-name").allInnerTexts();
  await expect.poll(async () => (await names()).length).toBeGreaterThan(0);
  await page.waitForLoadState("networkidle");
  const firstPage = await names();
  await page.getByRole("button", { name: /Próxima/ }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/sort=price-low/);
  await expect.poll(names).not.toEqual(firstPage);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".nft-card")).not.toHaveCount(0);
  const secondPage = await names();
  await page.getByRole("textbox", { name: "Buscar arte ou artista" }).fill("Ape");
  await expect(page).toHaveURL(/q=Ape/);
  await expect(page).not.toHaveURL(/page=2/);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/sort=price-low/);
  await expect(page.getByLabel("Ordenar NFTs")).toHaveValue("price-low");
  await expect.poll(names).toEqual(secondPage);
  await page.reload();
  await expect.poll(names).toEqual(secondPage);
});

test("401 em rota privada com a sessão perdida volta ao login ao revalidar", async ({ page }) => {
  await seedSession(page);
  await page.goto("/account/profile");
  await expect(page.getByLabel(/E-mail/).first()).toHaveValue(BUYER);
  await page.evaluate(() => localStorage.removeItem("kurio:session"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/account\?redirect=/);
});

test("cupom expirado é recusado mesmo com o código válido", async ({ page }) => {
  await seedSession(page);
  await page.addInitScript(() => localStorage.setItem("kurio:scenario", "coupon-expired"));
  await addToCart(page);
  const coupon = page.locator("#coupon");
  await coupon.fill("KURIO10");
  await coupon.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: /cupom/i })).toBeVisible();
  await expect(page.getByText("Código KURIO10 aplicado")).toHaveCount(0);
});

test("latência variável ainda entrega o catálogo completo", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kurio:scenario", "variable-latency"));
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".nft-card")).not.toHaveCount(0);
});

test("preços ao vivo chegam pelo cliente Socket.IO", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("kurio:scenario", "live-prices"));
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await page.waitForFunction(() => "__kurioSocket" in window);
  await page.evaluate(() => {
    const w = window as unknown as { __live: number; __kurioSocket: { on: (e: string, f: () => void) => void } };
    w.__live = 0;
    w.__kurioSocket.on("nft.updated", () => { w.__live += 1; });
  });
  await page.clock.fastForward(31_000);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __live: number }).__live)).toBeGreaterThan(0);
});
