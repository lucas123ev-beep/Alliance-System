// Shared formatting / conversion helpers for the PDF templates.

// Builds a safe Content-Disposition header value for a PDF download.
// HTTP header values must be pure ASCII (latin1) — Node's res.set() throws
// a hard TypeError ("Invalid character in header content") if the string
// contains anything outside that range, which crashes the whole request
// with a 500. Document numbers built from a Chinese supplier/client name
// fragment (e.g. a multi-supplier Contract Number like "PO-AGNB26.044-浙江")
// hit exactly this — this helper strips non-ASCII characters for the plain
// `filename` fallback and adds an RFC 5987 `filename*` with the full UTF-8
// name for browsers that support it.
function contentDisposition(filename) {
  const asciiSafe = filename.replace(/[^\x20-\x7E]/g, "").trim() || "document.pdf";
  return `inline; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateLong(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const months = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  const day = d.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? "st"
    : (day % 10 === 2 && day !== 12) ? "nd"
    : (day % 10 === 3 && day !== 13) ? "rd" : "th";
  return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}.`;
}

function fmtDateShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US");
}

function fmtNumber(n, decimals = 3) {
  const num = parseFloat(n);
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// The business calls mainland China's currency "RMB" everywhere client-
// facing, even though its ISO 4217 code (used internally for storage and
// for Intl.NumberFormat) is CNY. This relabels the raw code for display.
function currencyLabel(currency) {
  return currency === "CNY" ? "RMB" : currency;
}

function fmtMoney(n, currency = "USD") {
  const num = parseFloat(n);
  if (isNaN(num)) return "—";
  if (currency === "CNY") {
    return `RMB ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(num);
  } catch {
    return `${currencyLabel(currency)} ${num.toFixed(2)}`;
  }
}

function parseJsonSafe(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed;
  } catch {
    return fallback;
  }
}

// ─── Number to words (USD amounts, for Proforma / Commercial Invoice) ────────
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion"];

function threeDigitsToWords(n) {
  let str = "";
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + " hundred";
    n %= 100;
    if (n) str += " and ";
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)];
    if (n % 10) str += "-" + ONES[n % 10];
  } else if (n > 0) {
    str += ONES[n];
  }
  return str;
}

function integerToWords(n) {
  if (n === 0) return "zero";
  let groups = [];
  let i = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(threeDigitsToWords(chunk) + (SCALES[i] ? " " + SCALES[i] : ""));
    n = Math.floor(n / 1000);
    i++;
  }
  return groups.join(", ");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Spells out a currency amount, e.g. 37286.40 USD ->
// "Thirty-seven thousand, two hundred and eighty-six dollars forty cents of United States of America."
function amountToWords(amount, currency = "USD") {
  const num = parseFloat(amount) || 0;
  const whole = Math.floor(num);
  const cents = Math.round((num - whole) * 100);
  const currencyNames = {
    USD: ["dollar", "dollars", "of United States of America"],
    EUR: ["euro", "euros", "of the European Union"],
    BRL: ["real", "reais", "of Brazil"],
    CNY: ["yuan", "yuan", "of China"],
  };
  const [singular, plural, ofPhrase] = currencyNames[currency] || [currency, currency, ""];
  const wholeWords = capitalize(integerToWords(whole)) + " " + (whole === 1 ? singular : plural);
  const centsWords = cents > 0 ? ` ${integerToWords(cents)} cent${cents === 1 ? "" : "s"}` : "";
  return `${wholeWords}${centsWords}${ofPhrase ? " " + ofPhrase : ""}.`;
}

module.exports = {
  escapeHtml, fmtDateLong, fmtDateShort, fmtNumber, fmtMoney, parseJsonSafe, amountToWords, currencyLabel, contentDisposition,
};
