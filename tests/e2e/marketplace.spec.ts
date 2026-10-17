import { revealCollectorData } from "./helpers";
import { expect, test } from "@playwright/test";

test("busca e filtros permanecem nos parâmetros da URL", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Buscar arte ou artista" });
  await search.fill("Golden");
  await expect(page).toHaveURL(/q=Golden/);
  await expect(page.locator(".nft-card")).toHaveCount(3);
  await page.getByRole("button", { name: /Wild Souls/ }).click();
  await expect(page).toHaveURL(/collection=Wild/);
  await expect(page.getByText("Nenhuma obra encontrada")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".nft-card")).toHaveCount(9);
});

test("price range sliders apply a filter to the catalog", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.goto("/");
  const maxPrice = page.getByRole("slider", { name: "Preço máximo" });
  await maxPrice.focus();
  await maxPrice.press("Home");
  for (let step = 0; step < 97; step += 1) await maxPrice.press("ArrowRight");

  const minPrice = page.getByRole("slider", { name: "Preço mínimo" });
  await minPrice.focus();
  for (let step = 0; step < 68; step += 1) await minPrice.press("ArrowRight");
  await expect(page.getByText("0,70 – 1,00 ETH")).toBeVisible();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/minPriceCents=70/);
  await expect(page).toHaveURL(/maxPriceCents=100/);
  await expect(page.locator(".nft-card")).toHaveCount(1);
});

test("homepage at tablet width follows the supplied storefront composition", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 2048 });
  await page.goto("/");
  await expect(page.locator(".site-header .brand")).toHaveText("KURIO");
  await expect(page.locator(".brand-mark")).toHaveCount(0);
  await expect(page.locator(".announcement")).toBeHidden();
  await expect(page.locator(".hero-image-frame img.is-active")).toBeVisible();
  await expect(page.locator(".nft-card")).toHaveCount(9);
  await expect(page.locator(".home-promos .home-promo")).toHaveCount(2);
  await expect(page.locator(".journal-card")).toHaveCount(4);
  const layout = await page.evaluate(() => {
    const content = document.querySelector(".home-page");
    const sidebar = document.querySelector(".filter-sidebar");
    return {
      contentWidth: Math.round(content?.getBoundingClientRect().width ?? 0),
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? 0),
      columns: getComputedStyle(document.querySelector(".nft-grid")!).gridTemplateColumns.split(" ").length,
    };
  });
  expect(layout.contentWidth).toBe(640);
  expect(layout.sidebarWidth).toBe(165);
  expect(layout.columns).toBe(3);
  await page.getByRole("button", { name: /Música/ }).click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.locator(".nft-card")).toHaveCount(3);
});

test("all NFT detail pages share the reference layout and edition controls are selectable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/nft/emerald-ape-042");
  const detail = page.locator(".detail-page");
  const gallery = detail.locator(".detail-gallery");
  const tabs = detail.getByRole("tablist", { name: "Informações da obra" });
  await expect(detail.getByRole("heading", { name: "Emerald Ape #042" })).toBeVisible();
  await expect(gallery).toBeVisible();
  await expect(detail.locator(".detail-tabs-section")).toBeVisible();
  const detailGeometry = await page.evaluate(() => ({
    contentWidth: Math.round(document.querySelector(".detail-page")!.getBoundingClientRect().width),
    galleryColumns: getComputedStyle(document.querySelector(".detail-gallery")!).gridTemplateColumns.split(" ").length,
    thumbnailWidth: Math.round(document.querySelector(".thumbnail-stack button")!.getBoundingClientRect().width),
  }));
  expect(detailGeometry).toEqual({ contentWidth: 640, galleryColumns: 2, thumbnailWidth: 53 });
  const initialColumns = await detail.locator(".detail-layout").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  const nftIds = [
    "sage-nomad-009",
    "neon-vessel-552",
    "cosmic-bloom-118",
    "violet-nomad-314",
    "ivory-baron-552",
    "golden-beat-207",
    "golden-frequency-108",
    "golden-signal-160",
  ];
  for (const id of nftIds) {
    await page.goto(`/nft/${id}`);
    await expect(detail.locator(".detail-gallery")).toBeVisible();
    await expect(detail.locator(".detail-tabs-section")).toBeVisible();
    await expect(detail.locator(".detail-layout")).toHaveCSS("grid-template-columns", initialColumns);
  }
  await page.goto("/nft/emerald-ape-042");
  await expect(detail.getByRole("button", { name: "1/1", exact: true })).toHaveAttribute("aria-pressed", "false");
  await detail.getByRole("button", { name: "1/1", exact: true }).click();
  await expect(detail.getByRole("button", { name: "1/1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(detail.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled();
  await detail.getByRole("button", { name: "1/50", exact: true }).click();
  await detail.getByRole("button", { name: "Aumentar quantidade" }).click();
  await expect(detail.locator(".quantity-control > span")).toHaveText("2");
  await tabs.getByRole("tab", { name: /Avaliações de colecionadores/ }).click();
  await expect(detail.getByText("Peça incrível, acabamento impecável.")).toBeVisible();
});

test("edição escolhida e quantidade acompanham o NFT até o carrinho", async ({ page }) => {
  await page.goto("/nft/emerald-ape-042");
  const detail = page.locator(".detail-page");
  await detail.getByRole("button", { name: "1/10", exact: true }).click();
  await detail.getByRole("button", { name: "Aumentar quantidade" }).click();
  await detail.getByRole("button", { name: "Comprar agora" }).click();
  const item = page.locator(".cart-item");
  await expect(item.getByText("Edição: 1/10 · #042")).toBeVisible();
  await expect(item.locator(".cart-quantity > span")).toHaveText("2");
});

test("alteração de preço via Socket.IO atualiza o catálogo pelo MSW", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.goto("/");
  await page.getByLabel("Cenário de demonstração").selectOption("price-change");
  await expect(page.getByText("Emerald Ape #042 teve o preço atualizado.")).toBeVisible();
  await expect(page.locator(".nft-card").filter({ hasText: "Emerald Ape #042" })).toContainText("1.23 ETH");
});

test("links de coleções aplicam filtros e newsletter não simula uma inscrição", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Música", exact: true }).click();
  await expect(page).toHaveURL(/category=M%C3%BAsica/);
  await expect(page.locator(".nft-grid .nft-card")).toHaveCount(3);

  const newsletter = page.locator(".newsletter");
  await newsletter.getByLabel("Seu e-mail").fill("teste@kurio.test");
  await newsletter.getByRole("button", { name: "Enviar" }).click();
  await expect(newsletter.getByRole("status")).toHaveText("A inscrição na lista de novidades não está disponível nesta demonstração.");
});

test("login inválido é rejeitado em vez de criar uma sessão fictícia", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.goto("/");
  await page.getByRole("button", { name: /Entrar/ }).click();
  await page.locator(".account-form").getByLabel("E-mail").fill("nao-existe@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("senha123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  await expect(page.getByRole("dialog", { name: /Entre na sua conta/ })).toBeVisible();
});

test("colecionador conclui uma compra simulada e recebe o recibo", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/nft/emerald-ape-042");
  await expect(page.getByRole("heading", { name: "Emerald Ape #042" })).toBeVisible();
  await page.getByRole("button", { name: "1/10", exact: true }).click();
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /Entre na sua conta/ })).toBeVisible();
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Perfil do colecionador" })).toBeVisible();
  const checkoutLayout = await page.locator(".checkout-layout").evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    width: Math.round(element.getBoundingClientRect().width),
  }));
  expect(checkoutLayout).toEqual({ columns: 2, width: 640 });
  await page.getByLabel(/Nome de exibição/).fill("Colecionador Kurio");
  await page.getByLabel(/E-mail/).fill("colecionador@kurio.test");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  const receipt = page.locator(".order-receipt");
  await expect(receipt.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
  await expect(receipt.getByRole("heading", { name: "Detalhes da transação" })).toBeVisible();
  await expect(receipt.getByText("ID do token: #042")).toBeVisible();
  await expect(receipt.getByText("1/10 · (x 1)")).toBeVisible();
  await expect(receipt.getByRole("link", { name: "Ver no explorador" })).toHaveAttribute("href", /etherscan\.io/);
  expect(await receipt.boundingBox()).toMatchObject({ x: 230, y: 89, width: 308, height: 438 });
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Roboto Mono");
  expect(await page.evaluate(() => document.fonts.check('12px "Roboto Mono"'))).toBe(true);
});

test("sessão expirada no pagamento abre login e mantém o checkout para retomada", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kurio:session", JSON.stringify({ email: "colecionador@kurio.test", name: "Colecionador Kurio" }));
    localStorage.setItem("kurio:scenario", "session-expired");
  });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  const dialog = page.getByRole("dialog", { name: /Entre na sua conta/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("E-mail").fill("colecionador@kurio.test");
  await dialog.getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator(".checkout-item")).toBeAttached();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.getByText("Pedido confirmado na simulação da rede Ethereum. Nenhuma transação real foi enviada à blockchain.")).toBeVisible();
});

test("cotação alterada exige revisão antes de criar o pedido", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kurio:session", JSON.stringify({ email: "colecionador@kurio.test", name: "Colecionador Kurio" }));
    localStorage.setItem("kurio:scenario", "quote-changed-before-order");
  });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByRole("alert")).toContainText("O preço, desconto ou disponibilidade mudou");
  await expect(page.locator(".checkout-item b")).not.toHaveText("1.19 ETH");
  const revisedPrice = await page.locator(".checkout-item b").innerText();
  expect(revisedPrice).not.toBe("1.19 ETH");
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.locator(".order-receipt")).toContainText(revisedPrice);
});

test("layout móvel não cria overflow horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /SEJA DONO DO FUTURO/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Explorar coleções" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação móvel" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole("button", { name: "Abrir filtros" }).click();
  await expect(page.getByRole("button", { name: "Fechar filtros" })).toBeVisible();
});

test("carrinho móvel fixa o resumo e preserva os controles", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await expect(page.getByRole("heading", { name: "Carrinho de NFTs" })).toBeVisible();
  await expect(page.locator(".cart-summary")).toHaveCSS("position", "fixed");
  await expect(page.locator("#coupon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Aumentar Emerald Ape #042" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Continuar para pagamento/ })).toBeVisible();
});

test("login móvel usa tela completa e permite alternar para cadastro", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await page.goto("/");
  await page.getByRole("button", { name: "Minha conta" }).click();
  const dialog = page.locator(".auth-modal-card");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("KURIO", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await dialog.locator(".auth-mobile-switch button").click();
  await expect(dialog.getByRole("heading", { name: "Criar perfil de colecionador" })).toBeVisible();
  await expect(dialog.getByLabel("Confirmar senha")).toBeVisible();
  await expect(dialog.locator('[data-slot="input"]')).toHaveCount(4);
  const brand = await dialog.locator(".auth-mobile-brand").boundingBox();
  const heading = await dialog.getByRole("heading", { name: "Criar perfil de colecionador" }).boundingBox();
  expect(brand!.y + brand!.height).toBeLessThanOrEqual(heading!.y);
});

test("pagamento móvel prioriza a escolha de carteira e fixa a confirmação", async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await page.goto("/");
  await page.getByRole("button", { name: "Minha conta" }).click();
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await expect(page.getByRole("heading", { name: "Pagamento com carteira" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carteira e rede" })).toBeVisible();
  await expect(page.locator(".checkout-collector-details")).not.toHaveAttribute("open", "");
  await expect(page.locator(".checkout-wallet-option")).toHaveCount(3);
  await expect(page.locator(".confirm-order")).toHaveCSS("position", "fixed");
  await expect(page.locator('[data-slot="button"].confirm-order')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("cadastro, perfil e carteira persistem depois do refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/account");
  await page.getByRole("button", { name: "Criar uma conta" }).click();
  await page.getByLabel("Nome de exibição").fill("Aline Colecionadora");
  await page.locator(".account-form").getByLabel("E-mail").fill("aline@kurio.test");
  await page.locator(".account-form").getByLabel("Senha").fill("coleciona123");
  await page.getByRole("button", { name: /Criar perfil/ }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await page.getByLabel(/Nome de usuário/).fill("aline_kurio");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Perfil salvo com sucesso.")).toBeVisible();
  await page.getByLabel("Senha atual").fill("coleciona123");
  await page.getByRole("textbox", { name: "Nova senha", exact: true }).fill("coleciona456");
  await page.getByLabel("Confirmar nova senha").fill("coleciona456");
  await page.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(page.getByText("Senha alterada.")).toBeVisible();
  const accountLayout = await page.locator(".account-area").evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    width: Math.round(element.getBoundingClientRect().width),
    avatarColumn: getComputedStyle(document.querySelector(".avatar-field")!).gridColumn,
  }));
  expect(accountLayout).toEqual({ columns: 2, width: 853, avatarColumn: "2" });
  await page.locator(".account-sidebar").getByRole("link", { name: /Carteiras/ }).click();
  await expect(page.getByRole("heading", { name: "Carteira principal", level: 1 })).toBeVisible();
  await expect(page.locator(".wallet-form-grid")).toHaveCSS("grid-template-columns", /.+ .+/);
  await page.getByLabel(/Nome de exibição/).fill("Minha principal");
  await page.getByLabel(/Apelido da carteira/).fill("aline.eth");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Definir como carteira principal/).check();
  await page.getByRole("button", { name: "Salvar carteira" }).click();
  await expect(page.getByText("Minha principal")).toBeVisible();
  await page.getByRole("button", { name: /Adicionar carteira/ }).first().click();
  await page.getByLabel(/Nome de exibição/).fill("Minha carteira Solana");
  await page.getByLabel(/Apelido da carteira/).fill("aline.sol");
  await page.locator(".wallet-form").getByLabel(/^Rede/).selectOption("Solana");
  await page.locator(".wallet-form").getByLabel(/^Tipo de carteira/).selectOption("WalletConnect");
  await page.locator(".wallet-form").getByLabel(/Endereço da carteira/).fill("So11111111111111111111111111111111111111112");
  await page.getByRole("button", { name: "Salvar carteira" }).click();
  const secondaryWallet = page.locator(".saved-wallet").filter({ hasText: "Minha carteira Solana" });
  await expect(secondaryWallet).toBeVisible();
  await secondaryWallet.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel(/Nome de exibição/).fill("Solana secundária");
  await page.getByRole("button", { name: "Atualizar carteira" }).click();
  await expect(page.getByText("Solana secundária")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Solana secundária")).toBeVisible();
});

test("perfil e carteiras permanecem utilizáveis em viewport mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();

  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole("heading", { name: "Perfil do Colecionador" })).toBeVisible();
  await expect(page.getByLabel(/Nome de usuário/)).not.toHaveValue("");
  await page.getByLabel(/Nome de usuário/).fill("mobile_kurio");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Perfil salvo com sucesso.")).toBeVisible();

  await page.locator(".account-sidebar").getByRole("link", { name: /Carteiras/ }).click();
  await expect(page.getByRole("heading", { name: "Carteira principal", level: 1 })).toBeVisible();
  await page.getByLabel(/Nome de exibição/).fill("Carteira Mobile");
  await page.getByLabel(/Apelido da carteira/).fill("mobile.eth");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByRole("button", { name: "Salvar carteira" }).click();
  await expect(page.locator(".saved-wallet").filter({ hasText: "Carteira Mobile" })).toBeVisible();
  await expect(page.getByText("Carteira salva.").first()).toBeAttached();

  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("link", { name: /Dados do perfil/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar carteira" })).toBeInViewport();
});

test("confirmação do pedido é legível e responsiva em viewport mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await page.locator(".checkout-collector-details > summary").click();
  await page.getByLabel(/Nome de exibição/).fill("Colecionador Kurio");
  await page.getByLabel(/E-mail/).fill("colecionador@kurio.test");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();

  const receipt = page.locator(".order-receipt");
  await expect(receipt.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible();
  await expect(receipt.getByRole("heading", { name: "Detalhes da transação" })).toBeVisible();
  await expect(receipt.getByText("Pedido confirmado na simulação da rede Ethereum. Nenhuma transação real foi enviada à blockchain.")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(await receipt.boundingBox()).toMatchObject({ x: expect.any(Number), width: expect.any(Number) });
  const receiptBox = await receipt.boundingBox();
  expect(receiptBox?.width).toBeGreaterThanOrEqual(350);
  expect(receiptBox?.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link", { name: "Ver no explorador" })).toHaveAttribute("target", "_blank");
});

test("cadastro rejeita e-mail já utilizado com conflito explícito", async ({ page }) => {
  await page.goto("/account");
  await page.getByRole("button", { name: "Criar uma conta" }).click();
  await page.getByLabel("Nome de exibição").fill("Outro colecionador");
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha").fill("senha-segura-123");
  await page.getByRole("button", { name: /Criar perfil/ }).click();
  await expect(page.getByRole("alert")).toHaveText("Esse e-mail já possui uma conta Kurio.");
});

test("favoritos exigem login e ficam associados à conta", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Adicionar aos favoritos" }).first().click();
  await expect(page.getByRole("dialog", { name: /Entre na sua conta/ })).toBeVisible();
  await page.locator(".account-form").getByLabel("E-mail").fill("colecionador@kurio.test");
  await page.locator(".account-form").getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Adicionar aos favoritos" }).first().click();
  await expect(page.getByRole("button", { name: "Remover dos favoritos" }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remover dos favoritos" }).first()).toBeVisible();
});

test("login abre como pop-up na página inicial e pode ser fechado", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.getByRole("button", { name: /Entrar/ }).click();
  await expect(page.getByRole("dialog", { name: /Entre na sua conta/ })).toBeVisible();
  const dialog = page.locator(".auth-modal-card");
  await page.waitForTimeout(220);
  await expect(page).toHaveURL("/");
  await expect(dialog.locator(".auth-modal-tabs")).toBeVisible();
  await expect(dialog.locator('[data-slot="input"]')).toHaveCount(2);
  await expect(dialog.locator('[data-slot="button"].auth-modal-submit')).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Esqueceu a senha?" })).toBeVisible();
  expect(await dialog.boundingBox()).toMatchObject({ x: 251, y: 85, width: 266, height: 321 });
  await dialog.locator(".auth-modal-tabs").getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("dialog", { name: "Criar sua conta" })).toBeVisible();
  await expect(dialog.getByLabel("Nome de usuário")).toBeVisible();
  await expect(dialog.getByLabel("Confirmar senha")).toBeVisible();
  expect(await dialog.boundingBox()).toMatchObject({ x: 251, y: 85, width: 266, height: 349 });
  await dialog.getByLabel("Nome de usuário").fill("colecionador");
  await dialog.getByLabel("E-mail").fill("colecionador@kurio.test");
  await dialog.getByLabel("Senha", { exact: true }).fill("senha-segura-123");
  await dialog.getByLabel("Confirmar senha").fill("senha-diferente-123");
  await dialog.locator(".auth-modal-submit").click();
  await expect(dialog.getByRole("alert")).toHaveText("As senhas não coincidem.");
  await dialog.locator(".auth-modal-tabs").getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: "Fechar login" }).click();
  await expect(dialog).toBeHidden();
});

test("recusa simulada preserva os itens do carrinho", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kurio:session", JSON.stringify({ email: "buyer@kurio.test", name: "buyer" }));
    localStorage.setItem("kurio:scenario", "payment-declined");
  });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByLabel(/Nome de exibição/).fill("Buyer");
  await page.getByLabel(/E-mail/).fill("buyer@kurio.test");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.getByText("PAGAMENTO RECUSADO", { exact: true })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
});

test("recupera uma tentativa após timeout e só limpa o carrinho ao confirmar", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kurio:session", JSON.stringify({ email: "timeout@kurio.test", name: "Buyer" }));
    localStorage.setItem("kurio:scenario", "order-timeout");
  });
  await page.goto("/nft/emerald-ape-042");
  await page.getByRole("button", { name: "Comprar agora" }).click();
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await page.getByLabel(/Nome de exibição/).fill("Buyer");
  await page.getByLabel(/E-mail/).fill("timeout@kurio.test");
  await page.getByLabel(/Endereço da carteira/).fill("0x1234567890abcdef1234567890abcdef12345678");
  await page.getByLabel(/Li e concordo/).check();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page.getByRole("alert")).toContainText("Se houve timeout", { timeout: 12_000 });
  await expect(page.locator(".checkout-item")).toBeAttached();
  await page.getByRole("button", { name: /Confirmar compra/ }).click();
  await expect(page).toHaveURL(/\/order\//);
  await expect(page.getByText("Seus NFTs agora estão na sua carteira")).toBeVisible({ timeout: 5_000 });
  await page.goto("/cart");
  await expect(page.getByText("Seu carrinho está esperando por uma história.")).toBeVisible();
});

test("rede lenta mostra skeleton e cenário offline permite retentativa", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.addInitScript(() => localStorage.setItem("kurio:scenario", "slow"));
  await page.goto("/");
  await expect(page.locator(".skeleton-card").first()).toBeVisible();
  await expect(page.locator(".nft-card").first()).toBeVisible({ timeout: 5_000 });
  await page.getByLabel("Cenário de demonstração").selectOption("offline");
  await expect(page.getByText("Não foi possível carregar a coleção.")).toBeVisible();
  await page.getByLabel("Cenário de demonstração").selectOption("standard");
  await expect(page.locator(".nft-card").first()).toBeVisible();
});

test("regressão visual das telas principais em desktop e mobile", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop.");
  await page.route("**/socket.io/**", (route) => route.abort());
  const capture = async (name: string, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Cenário de demonstração").waitFor({ state: "attached" });
    await page.waitForFunction(() => [...document.images].every((image) => image.complete) && !document.querySelector(".skeleton"));
    await expect(page).toHaveScreenshot(`${name}-${width}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    });
  };

  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await capture("home", 1440, 900);
  await capture("home", 390, 844);
  await capture("home", 768, 1024);

  await page.goto("/nft/emerald-ape-042");
  await expect(page.getByRole("heading", { name: "Emerald Ape #042" })).toBeVisible();
  await capture("detail", 1440, 900);
  await capture("detail", 390, 844);
  await capture("detail", 768, 1024);

  await page.getByRole("button", { name: "Comprar agora" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText("Emerald Ape #042", { exact: true })).toBeVisible();
  await capture("cart", 1440, 900);
  await capture("cart", 390, 844);
  await capture("cart", 768, 1024);

  await page.evaluate(() => {
    localStorage.setItem("kurio:session", JSON.stringify({ email: "visual@kurio.test", name: "Visual" }));
  });
  await page.getByRole("link", { name: /Continuar para pagamento/ }).click();
  await revealCollectorData(page);
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await capture("checkout", 1440, 900);
  await capture("checkout", 390, 844);
  await capture("checkout", 768, 1024);
});
