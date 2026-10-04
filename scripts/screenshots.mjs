// Captures documentation screenshots of the running app (npm run dev) into docs/screenshots.
// Uses the locally installed Edge/Chrome — no browser download.   Usage: node scripts/screenshots.mjs [baseUrl]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3300";
const out = new URL("../docs/screenshots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(out, { recursive: true });

const exe = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].find(existsSync);
if (!exe) throw new Error("No Edge/Chrome found");

const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const go = async (path) => {
  await page.goto(base + path, { waitUntil: "load" });
  await page.waitForTimeout(700);
};
const shot = async (name, { full = false } = {}) => {
  await page.screenshot({ path: `${out}${name}.png`, fullPage: full });
  console.log("saved", name);
};
const firstHref = async (re) =>
  page.$$eval("a", (as, src) => { const r = new RegExp(src); const a = as.map((x) => x.getAttribute("href") ?? "").find((h) => r.test(h)); return a ?? null; }, re.source);

// ── Dashboard
await go("/");
await shot("01-dashboard", { full: true });

// ── Master data
await go("/master/products");
await shot("02-products-grid");
await go((await firstHref(/^\/master\/products\/\d+$/)) ?? "/master/products");
await shot("03-product-form", { full: true });
await go("/master/lines");
await go((await firstHref(/^\/master\/lines\/\d+$/)));
await shot("04-production-line-form", { full: true });
await go("/master/qc-templates");
await go((await firstHref(/^\/master\/qc-templates\/\d+$/)));
await shot("05-qc-template-form", { full: true });

// ── BOM
await go("/boms");
await shot("06-bom-list");
await go((await firstHref(/^\/boms\/\d+$/)));
await page.evaluate(() => document.querySelectorAll("details").forEach((d, i) => { d.open = i === 2; }));
await page.evaluate(() => document.querySelectorAll(".sticky").forEach((e) => (e.style.position = "static")));
await page.waitForTimeout(300);
await page.getByText("Operations in order").scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollBy(0, -40));
await page.waitForTimeout(300);
await shot("07-bom-editor");

// ── Process
await go("/requests");
await shot("08-production-requests");
await go("/orders");
await shot("09-production-orders");
const po2 = await page.$$eval("a", (as) => as.find((a) => a.textContent?.trim() === "PO-000002")?.getAttribute("href") ?? null);
await go(po2);
await shot("10-order-overview");
await go(`${po2}?tab=materials`);
await shot("11-order-materials", { full: true });
await go(`${po2}?tab=units`);
await shot("12-order-serials", { full: true });
await go(`${po2}?tab=receive`);
await shot("13-order-receive");

await go("/shop-floor");
const sf = await firstHref(/^\/shop-floor\?order=\d+/);
if (sf) await go(sf);
await shot("14-shop-floor");
await go("/qc");
await shot("15-quality-control");
await go("/supervisor");
await shot("16-supervisor", { full: true });

// ── Inventory & tracking
await go("/inventory");
await shot("17-inventory-stock");
await go("/inventory?tab=batches");
await shot("18-inventory-batches");
const batchTrace = await firstHref(/^\/trace\?q=/);
await go(`${po2}?tab=units`);
const serialTrace = await firstHref(/^\/trace\?q=/);
await go(serialTrace);
await shot("19-trace-serial", { full: true });
await go(batchTrace);
await shot("20-trace-batch", { full: true });
await go("/labels");
await shot("21-labels-hub");
const serialLabel = await page.$$eval("a", (as) => as.map((a) => a.getAttribute("href")).find((h) => /^\/labels\/order\/\d+$/.test(h ?? "")));
await go(serialLabel);
await shot("22-serial-labels");
await go("/labels");
const batchLabel = await page.$$eval("a", (as) => as.map((a) => a.getAttribute("href")).find((h) => /^\/labels\/batch\/\d+$/.test(h ?? "")));
await go(batchLabel);
await shot("23-batch-labels");

// ── Reports & settings
await go("/reports/cost");
await shot("24-report-cost");
await go("/reports/batches");
await shot("25-report-batches");
await go("/reports/planning");
await shot("26-report-planning", { full: true });
await go("/settings");
await shot("27-settings");

await browser.close();
