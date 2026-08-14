import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const OUT = "/tmp/sweep";
mkdirSync(OUT, { recursive: true });

const paths = process.argv.slice(3).length
  ? process.argv.slice(3)
  : [
      "/ar",
      "/ar/games",
      "/ar/gift-cards",
      "/ar/sale",
      "/ar/search",
      "/ar/search?q=a",
      "/ar/faq",
      "/ar/how",
      "/ar/contact",
      "/ar/links",
      "/ar/privacy",
      "/ar/terms",
      "/ar/login",
      "/ar/recharge",
      "/ar/support",
      "/ar/wallet",
      "/ar/orders",
      "/ar/profile",
      "/ar/notifications",
      "/ar/nope",
    ];

const width = Number(process.argv[2] ?? 1280);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width, height: width < 600 ? 844 : 900 },
  deviceScaleFactor: 1,
  isMobile: width < 600,
  hasTouch: width < 600,
});

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 300)}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${String(error).slice(0, 300)}`));
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.includes("_next/static") || !url.startsWith("http")) return;
  problems.push(`requestfailed: ${request.failure()?.errorText} ${url.slice(0, 160)}`);
});

for (const path of paths) {
  problems.length = 0;
  const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);

  const name = path.replace(/[^a-z0-9]+/gi, "_") || "root";
  await page.screenshot({ path: `${OUT}/${width}${name}.png`, fullPage: true });

  const landed = new URL(page.url()).pathname;
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });

  console.log(
    `${response?.status()} ${path}${landed !== path.split("?")[0] ? ` -> ${landed}` : ""}` +
      (overflow > 1 ? `  [overflow ${overflow}px]` : "") +
      (problems.length ? `\n    ${problems.join("\n    ")}` : ""),
  );
}

await browser.close();
