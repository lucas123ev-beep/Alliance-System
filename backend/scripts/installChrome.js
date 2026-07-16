// Runs as the backend's `postinstall` script (see package.json) so the
// Chrome binary Puppeteer needs is downloaded during `npm install` on every
// deploy. Uses the same PUPPETEER_CACHE_DIR as pdf/render.js (via
// pdf/puppeteerCache.js) so the install location and the lookup location at
// runtime are guaranteed to match.
const cacheDir = require("../pdf/puppeteerCache");
const { execSync } = require("child_process");

console.log(`[installChrome] Installing Chrome for Puppeteer into ${cacheDir} ...`);
try {
  execSync("npx puppeteer browsers install chrome", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("[installChrome] Done.");
} catch (err) {
  console.error("[installChrome] Failed to install Chrome:", err.message);
  // Don't fail the whole deploy over this — the app will surface a clear
  // error on first PDF-generation attempt instead of blocking deploy.
  process.exit(0);
}
