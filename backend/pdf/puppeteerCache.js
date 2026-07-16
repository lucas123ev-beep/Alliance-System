const path = require("path");

// Puppeteer needs a stable, predictable directory to find the Chrome binary
// it downloads. By default it uses the OS cache dir (e.g. ~/.cache/puppeteer,
// which resolves to /opt/render/.cache/puppeteer on Render) — but on some
// hosts the HOME/user context used during the build step (when `npm install`
// runs the postinstall hook that downloads Chrome) isn't guaranteed to be
// identical to the context the app runs in afterwards, which is exactly why
// "Could not find Chrome" can happen even right after a successful install.
//
// Pinning PUPPETEER_CACHE_DIR to a folder inside this project removes that
// ambiguity: the working directory is the same at build time and run time
// for a given deploy, so both the install step and the running server agree
// on exactly where Chrome lives. This file is required (as early as
// possible, before `puppeteer` itself) from both the install script and
// pdf/render.js so they compute the identical path.
const CACHE_DIR = path.join(__dirname, "..", ".cache", "puppeteer");
process.env.PUPPETEER_CACHE_DIR = CACHE_DIR;

module.exports = CACHE_DIR;
