// Audita início e detalhe do NFT em mobile e desktop sobre o build otimizado (preview),
// com o cenário padrão dos mocks. Três medições por página/perfil; reporta a mediana.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const PORT = 4173;
const RUNS = 3;
const OUT = path.resolve("lighthouse/reports");
const PAGES = { inicio: "/", detalhe: "/nft/emerald-ape-042" };
const PROFILES = {
  mobile: {},
  desktop: {
    formFactor: "desktop",
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0 },
  },
};
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const TARGETS = { performance: 90, accessibility: 95, "best-practices": 95, seo: 90 };

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
const waitForServer = async () => {
  for (let i = 0; i < 40; i += 1) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Servidor de preview não respondeu.");
};

mkdirSync(OUT, { recursive: true });
const summary = { generatedAt: new Date().toISOString(), runs: RUNS, environment: {}, results: [] };

try {
  await waitForServer();
  for (const [profile, overrides] of Object.entries(PROFILES)) {
    for (const [page, route] of Object.entries(PAGES)) {
      const runs = [];
      for (let i = 1; i <= RUNS; i += 1) {
        const userDataDir = path.join(os.tmpdir(), `kurio-lh-${Date.now()}-${i}`);
        mkdirSync(userDataDir, { recursive: true });
        const chrome = await launch({
          chromePath: chromium.executablePath(),
          userDataDir,
          chromeFlags: ["--headless=new", "--no-sandbox", "--disable-extensions"],
        });
        try {
          const result = await lighthouse(`http://localhost:${PORT}${route}`, { port: chrome.port, output: ["json", "html"], logLevel: "error", onlyCategories: CATEGORIES }, {
            extends: "lighthouse:default",
            settings: { onlyCategories: CATEGORIES, ...overrides },
          });
          const base = path.join(OUT, `${page}-${profile}-run${i}`);
          writeFileSync(`${base}.json`, result.report[0]);
          writeFileSync(`${base}.html`, result.report[1]);
          const lhr = result.lhr;
          summary.environment = { lighthouse: lhr.lighthouseVersion, userAgent: lhr.environment.hostUserAgent, os: `${os.type()} ${os.release()}`, node: process.version, cpus: os.cpus().length };
          runs.push({
            scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round((lhr.categories[c].score ?? 0) * 100)])),
            lcp: lhr.audits["largest-contentful-paint"].numericValue,
            cls: lhr.audits["cumulative-layout-shift"].numericValue,
            tbt: lhr.audits["total-blocking-time"].numericValue,
          });
        } finally {
          await chrome.kill();
          try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* o sistema limpa o diretório temporário depois */ }
        }
      }
      summary.results.push({
        page, profile, runs,
        median: {
          ...Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => r.scores[c]))])),
          lcpMs: Math.round(median(runs.map((r) => r.lcp))),
          cls: Number(median(runs.map((r) => r.cls)).toFixed(3)),
          tbtMs: Math.round(median(runs.map((r) => r.tbt))),
        },
      });
      console.log(`${page}/${profile}`, JSON.stringify(summary.results.at(-1).median));
    }
  }
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  const rows = summary.results.map((r) => `| ${r.page} | ${r.profile} | ${CATEGORIES.map((c) => `${r.median[c]}${r.median[c] >= TARGETS[c] ? "" : " ⚠"}`).join(" | ")} | ${r.median.lcpMs} | ${r.median.cls} | ${r.median.tbtMs} |`);
  writeFileSync(path.join(OUT, "summary.md"), [
    `# Lighthouse (mediana de ${RUNS} medições)`, "",
    `Lighthouse ${summary.environment.lighthouse} · ${summary.environment.userAgent} · ${summary.environment.os} · Node ${summary.environment.node} · ${summary.environment.cpus} CPUs`, "",
    "| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP (ms) | CLS | TBT (ms) |", "|---|---|---|---|---|---|---|---|---|", ...rows, "",
  ].join("\n"));
} finally {
  server.kill();
}
