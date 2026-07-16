const puppeteer = require("puppeteer");

// A single headless Chromium instance is reused across requests — launching
// a fresh browser per PDF is slow and would exhaust memory on a small
// Render instance. If the browser crashes, it's relaunched on next use.
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: "new",
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
