import type { Page } from "@playwright/test";

// On narrow screens the collector fields live inside a collapsed <details>.
export async function revealCollectorData(page: Page) {
  const field = page.getByLabel(/Endereço da carteira/);
  await field.waitFor({ state: "attached" });
  if (!(await field.isVisible())) await page.getByText("Dados do colecionador").click();
}