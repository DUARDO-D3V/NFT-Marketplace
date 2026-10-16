import { expect, test, type Page } from "@playwright/test";

const BUYER = "colecionador@kurio.test";
const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

async function signedIn(page: Page, scenario = "standard") {
  await page.addInitScript(([email, value]) => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:session", JSON.stringify({ email, name: "Colecionador Kurio" }));
    localStorage.setItem("kurio:scenario", value);
  }, [BUYER, scenario]);
}

// Events always go through the real socket.io client; the MSW handler emits them back.
const socketEmit = (page: Page, event: string, payload: unknown) =>
  page.evaluate(([name, data]) => {
    (window as unknown as { __kurioSocket: { emit: (event: string, data: unknown) => void } }).__kurioSocket.emit(name as string, data);
  }, [event, payload] as const);

const waitForSocket = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { __kurioSocket?: { connected: boolean } }).__kurioSocket?.connected === true);

async function startCheckout(page: Page) {
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  const field = page.getByLabel(/Endereço da carteira/);
  if (!(await field.isVisible())) await page.getByText("Dados do colecionador").click();
  await field.fill(WALLET);
  await page.getByLabel(/Li e concordo/).check();
}

const storedOrders = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem("kurio:orders") ?? "[]") as Array<{ status: string }>));

test("mudança de preço durante o checkout atualiza o resumo e o pedido usa a nova cotação", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await waitForSocket(page);
  await socketEmit(page, "mock.nft.update", { id: "emerald-ape-042", price: "1.30" });
  await expect(page.getByText("Emerald Ape #042 teve o preço atualizado.")).toBeVisible();
  await expect(page.locator(".checkout-item b")).toHaveText("1.3 ETH");
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.locator(".order-receipt")).toContainText("1.3");
});

test("NFT que esgota durante o checkout bloqueia a confirmação", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await waitForSocket(page);
  await socketEmit(page, "mock.nft.update", { id: "emerald-ape-042", available: 0 });
  await expect(page.getByText("Emerald Ape #042 esgotou.")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "esgotado" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirmar compra/ })).toBeDisabled();
});

test("eventos duplicados ou antigos não regridem o estado", async ({ page }) => {
  await page.goto("/");
  await waitForSocket(page);
  const card = page.locator(".nft-card").filter({ hasText: "Emerald Ape #042" });
  await socketEmit(page, "mock.nft.update", { id: "emerald-ape-042", price: "1.30" });
  await expect(card).toContainText("1.30 ETH");
  const stale = { id: "emerald-ape-042", price: "9.99", version: 0, updatedAt: new Date(0).toISOString() };
  const duplicate = { id: "emerald-ape-042", price: "9.99", version: 1, updatedAt: new Date().toISOString() };
  await socketEmit(page, "mock.emit", { event: "nft.updated", data: stale });
  await socketEmit(page, "mock.emit", { event: "nft.updated", data: duplicate });
  await socketEmit(page, "mock.nft.update", { id: "emerald-ape-042", price: "1.40" });
  await expect(card).toContainText("1.40 ETH");
  await expect(card).not.toContainText("9.99");
});

test("pedido pendente é retomado após reconexão sem criar outra compra", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await waitForSocket(page);
  await page.evaluate(() => (window as unknown as { __kurioSocket: { disconnect: () => void } }).__kurioSocket.disconnect());
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByText("PEDIDO EM PROCESSAMENTO")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __kurioSocket: { connect: () => void } }).__kurioSocket.connect());
  await expect(page.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
  expect(await storedOrders(page)).toHaveLength(1);
});

test("recarregar a página com pedido pendente recupera o estado terminal", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await waitForSocket(page);
  await page.evaluate(() => (window as unknown as { __kurioSocket: { disconnect: () => void } }).__kurioSocket.disconnect());
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByText("PEDIDO EM PROCESSAMENTO")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
  expect(await storedOrders(page)).toHaveLength(1);
});

test("clique repetido em confirmar compra cria um único pedido", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await page.getByRole("button", { name: /Confirmar compra/ }).dblclick();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
  expect(await storedOrders(page)).toHaveLength(1);
});

test("pagamento recusado chega por order.updated e mantém o carrinho", async ({ page }) => {
  await signedIn(page, "payment-declined");
  await startCheckout(page);
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByText("PAGAMENTO RECUSADO", { exact: true })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
});

test("eventos de pedido de outro usuário não alteram o pedido atual", async ({ page }) => {
  await signedIn(page);
  await startCheckout(page);
  await waitForSocket(page);
  await page.evaluate(() => (window as unknown as { __kurioSocket: { disconnect: () => void } }).__kurioSocket.disconnect());
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByText("PEDIDO EM PROCESSAMENTO")).toBeVisible();
  const orderId = page.url().split("/order/")[1];
  await page.evaluate(() => (window as unknown as { __kurioSocket: { connect: () => void } }).__kurioSocket.connect());
  await waitForSocket(page);
  await socketEmit(page, "mock.emit", { event: "order.updated", data: { id: orderId, userEmail: "aurora@kurio.test", status: "declined", version: 99 } });
  await expect(page.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
});

test("aviso de evento em tempo real some ap\u00f3s 5 s", async ({ page }) => {
  await signedIn(page);
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await waitForSocket(page);
  await socketEmit(page, "mock.nft.update", { id: "emerald-ape-042", price: "1.35" });
  const notice = page.getByText("Emerald Ape #042 teve o pre\u00e7o atualizado.");
  await expect(notice).toBeVisible();
  await page.clock.fastForward(5_500);
  await expect(notice).toBeHidden();
});
