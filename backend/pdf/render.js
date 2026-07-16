// Must run BEFORE `require("puppeteer")` — it pins PUPPETEER_CACHE_DIR to a
// deterministic, project-local folder so this matches exactly where
// scripts/installChrome.js (the postinstall hook) put the Chrome binary.
// See puppeteerCache.js for the full explanation.
require("./puppeteerCache");
const puppeteer = require("puppeteer");

// A single headless Chromium instance is reused across requests — launching
// a fresh browser per PDF is slow and would exhaust memory on a small
// Render instance. If the browser crashes, it's relaunched on next use.
let browserPromise = null;

// Best-effort resolution of the installed Chrome binary. If Puppeteer's own
// cache-aware lookup can't find it (e.g. first boot before postinstall has
// ever run), we fall back to letting puppeteer.launch() try its own default
// resolution rather than crash here.
function resolveExecutablePath() {
  try {
    return puppeteer.executablePath();
  } catch (err) {
    console.error("[render] Could not resolve a bundled Chrome executable:", err.message);
    return undefined;
  }
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
      executablePath: resolveExecutablePath(),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }).catch(err => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function renderPdfBuffer(html, options = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: options.landscape || false,
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

module.exports = { renderPdfBuffer, getBrowser };
