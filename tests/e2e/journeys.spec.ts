import { expect, test, type Page } from "@playwright/test";

const seed = async (page: Page, scenario = "standard", email = "colecionador@kurio.test") => {
  await page.addInitScript(([value, user]) => {
    if (sessionStorage.getItem("kurio:test-seeded")) return;
    sessionStorage.setItem("kurio:test-seeded", "1");
    localStorage.setItem("kurio:scenario", value);
    if (user) localStorage.setItem("kurio:session", JSON.stringify({ email: user, name: "Teste" }));
  }, [scenario, email]);
};

test("paginação atualiza a URL e o histórico restaura a página anterior", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop (paginação, busca e foco por teclado).");
  await seed(page, "standard", "");
  await page.goto("/");
  const firstCard = await page.locator(".nft-card").first().innerText();
  await page.getByRole("button", { name: /Próxima/ }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".nft-card").first()).not.toHaveText(firstCard);
  await page.goBack();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.locator(".nft-card").first()).toContainText(firstCard.split("\n")[0]);
  await page.goForward();
  await expect(page).toHaveURL(/page=2/);
});

test("logout encerra a sessão e protege novamente a rota privada", async ({ page }) => {
  await seed(page);
  await page.goto("/account/profile");
  await expect(page.getByLabel(/E-mail/).first()).toHaveValue("colecionador@kurio.test");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/account\?redirect=/);
});

test("falha ao favoritar faz rollback e a nova tentativa recupera o estado", async ({ page }) => {
  await seed(page, "favorites-error");
  await page.goto("/nft/emerald-ape-042");
  const favorite = page.locator(".favorite-detail");
  await favorite.click();
  await expect(page.getByRole("alert").filter({ hasText: "favoritos" })).toBeVisible();
  await expect(favorite).toContainText("Favoritar");
  await page.evaluate(() => localStorage.setItem("kurio:scenario", "standard"));
  await favorite.click();
  await expect(favorite).toContainText("Favoritado");
  await page.reload();
  await expect(page.locator(".favorite-detail")).toContainText("Favoritado");
});

test("senha: divergência e senha atual incorreta exibem erros associados", async ({ page }) => {
  await seed(page);
  await page.goto("/account/profile");
  const form = page.locator(".password-form");
  await form.getByLabel("Senha atual").fill("senha-errada");
  await form.getByLabel("Nova senha", { exact: true }).fill("novasenha123");
  await form.getByLabel("Confirmar nova senha").fill("outrasenha123");
  await expect(form.getByRole("alert")).toContainText("não correspondem");
  await expect(form.getByLabel("Confirmar nova senha")).toHaveAttribute("aria-invalid", "true");
  await form.getByLabel("Confirmar nova senha").fill("novasenha123");
  await form.getByRole("button", { name: "Atualizar senha" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Senha atual")).toHaveAttribute("aria-invalid", "true");
});

test("avatar maior que 1 MB é recusado com mensagem de validação", async ({ page }) => {
  await seed(page);
  await page.goto("/account/profile");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(1_100_000) });
  expect(await input.evaluate((element: HTMLInputElement) => element.validationMessage)).toContain("1 MB");
});

test("carteiras exibem erro quando o acesso é negado (403)", async ({ page }) => {
  await seed(page, "forbidden");
  await page.goto("/account/wallets");
  await expect(page.getByText("Não foi possível carregar as carteiras.")).toBeVisible();
});

test("rede lenta mostra skeletons e depois o conteúdo", async ({ page }) => {
  await seed(page, "slow", "");
  await page.goto("/");
  await expect(page.locator(".skeleton-card").first()).toBeVisible();
  await expect(page.locator(".nft-card").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".skeleton-card")).toHaveCount(0);
});

test("skeleton respeita prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "slow", "");
  await page.goto("/");
  const skeleton = page.locator(".skeleton.shimmer").first();
  await expect(skeleton).toBeVisible();
  const duration = await skeleton.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThan(0.01);
});

test("navegação por teclado mostra foco visível", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop (paginação, busca e foco por teclado).");
  await seed(page, "standard", "");
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return element.matches(":focus-visible") && style.outlineStyle !== "none";
  });
  expect(focused).toBe(true);
});

for (const width of [390, 768, 1440]) {
  test(`sem overflow horizontal em ${width}px`, async ({ page }) => {
    await seed(page, "standard", "");
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/nft/emerald-ape-042", "/cart", "/checkout"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} em ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("respostas fora de ordem: a busca mais recente prevalece", async ({ page, isMobile }) => {
  test.skip(isMobile, "Controle exclusivo do layout desktop (paginação, busca e foco por teclado).");
  await seed(page, "out-of-order", "");
  await page.goto("/");
  const search = page.getByLabel("Buscar arte ou artista");
  await search.fill("e");
  await search.fill("emerald");
  await page.waitForTimeout(2_000);
  await expect(page.locator(".nft-card").first()).toContainText("Emerald");
  await expect(search).toHaveValue("emerald");
  const names = await page.locator(".nft-card").allInnerTexts();
  expect(names.every((text) => /emerald/i.test(text))).toBe(true);
});

test("sess\u00e3o expirada em rota privada volta ao login", async ({ page }) => {
  await seed(page);
  await page.goto("/account/profile");
  await expect(page.getByLabel(/E-mail/).first()).toHaveValue("colecionador@kurio.test");
  await page.evaluate(() => localStorage.removeItem("kurio:session"));
  await page.goto("/account/wallets");
  await expect(page).toHaveURL(/\/account\?redirect=/);
});

test("sem overflow horizontal em 320px (zoom de 400%)", async ({ page }) => {
  await seed(page, "standard", "");
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/", "/nft/emerald-ape-042", "/cart"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("skeleton do catálogo preserva as dimensões do card e o CLS fica baixo", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("kurio:scenario", "slow");
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const skeleton = page.locator(".skeleton-card").first();
  await expect(skeleton).toBeVisible();
  const before = await skeleton.boundingBox();
  await expect(page.locator(".nft-card").first()).toBeVisible({ timeout: 15_000 });
  const after = await page.locator(".nft-card").first().boundingBox();
  expect(Math.abs(before!.width - after!.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(before!.height - after!.height)).toBeLessThanOrEqual(24);
  await page.waitForTimeout(300);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThan(0.1);
});

test("listeners do Socket.IO não se acumulam entre navegações", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".nft-card").first()).toBeVisible();
  const count = () => page.evaluate(() => {
    const s = (window as unknown as { __kurioSocket: { listeners: (e: string) => unknown[] } }).__kurioSocket;
    return [s.listeners("nft.updated").length, s.listeners("order.updated").length, s.listeners("connect").length];
  });
  const first = await count();
  await page.locator(".nft-card a").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".nft-card").first()).toBeVisible();
  await page.waitForFunction(() => "__kurioSocket" in window);
  expect(await count()).toEqual(first);
  expect(first[0]).toBeLessThanOrEqual(1);
});

test("401 real da API em rota privada derruba a sessão e redireciona ao login", async ({ page }) => {
  await page.goto("/account");
  const form = page.locator(".account-form");
  await form.getByLabel("E-mail").fill("colecionador@kurio.test");
  await form.getByLabel("Senha", { exact: true }).fill("kurio123");
  await page.getByRole("button", { name: /Entrar na Kurio/ }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await page.evaluate(() => localStorage.setItem("kurio:scenario", "session-revoked"));
  await page.reload();
  await expect(page).toHaveURL(/\/account\?redirect=/);
  await expect(page.locator(".account-form")).toBeVisible();
});
test("carrossel do hero troca de destaque pelos pontos e automaticamente", async ({ page }) => {
  await page.clock.install();
  await seed(page);
  await page.goto("/");
  const dots = page.getByRole("group", { name: "Obras em destaque" }).getByRole("button");
  await expect(dots).toHaveCount(3);
  await expect(dots.first()).toHaveAttribute("aria-current", "true");
  await dots.nth(2).click();
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".hero-image-frame img.is-active")).toHaveAttribute("alt", /Golden Beat/);
  await page.mouse.move(0, 0);
  await page.clock.fastForward(6500);
  await expect(dots.first()).toHaveAttribute("aria-current", "true");
});
