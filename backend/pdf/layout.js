const LOGO = require("./logo");
const { escapeHtml } = require("./helpers");

// Shared page shell used by every English-language template (Proforma,
// Commercial Invoice, Packing List). Mirrors the layout of the models sent
// by the client: logo top-left, acquisition company block top-right, a
// grey "TITLE" bar, then whatever body content the template supplies.
// Deliberately light on borders — earlier versions boxed every single cell
// (meta info, every item row, both Payment/Shipment columns), which read as
// a dense grid and pushed values like "Grand Total Amount" away from their
// label since each was stretched across its own full-width table cell.
// Matches the client's own reference documents instead: bold label sitting
// right next to its value, thin rules only where a section actually ends,
// and a single vertical divider between the two bottom columns rather than
// a full box around each.
function baseCss() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px 32px; font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px; color: #1a1a1a;
    }
    table { width: 100%; border-collapse: collapse; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .header img.logo { height: 34px; }
    .header .company { text-align: right; font-size: 9px; line-height: 1.5; max-width: 380px; }
    .header .company .name { font-weight: bold; font-size: 10px; }
    .title-bar {
      background: #4a4a4a; color: #fff; text-align: center; font-weight: bold;
      font-size: 12px; letter-spacing: 0.5px; padding: 6px 0; margin-bottom: 8px;
    }
    /* Matches the reference layout: centered "Label: value" pairs (merged
       into one cell each, not split label/value columns), grouped into three
       bands — Number/Date, the shipment block, and Country of origin/
       acquisition — each closed off by its own full-width rule instead of
       one rule around the whole table. */
    .meta-table { border-top: 1px solid #000; border-bottom: 1px solid #000; margin-bottom: 10px; }
    .meta-table td { padding: 4px 10px; font-size: 9.5px; text-align: center; width: 50%; }
    .meta-table tr:first-child td { padding: 6px 10px; border-bottom: 1px solid #000; }
    .meta-table tr:last-child td { border-top: 1px solid #000; }
    .section-bar {
      background: #d9d9d9; text-align: center; font-weight: bold; font-size: 10px;
      padding: 4px 0;
    }
    .items-table th {
      border-bottom: 1.5px solid #333; padding: 6px 9px; font-size: 8.5px;
      text-transform: uppercase; text-align: center; font-weight: bold;
    }
    .items-table td { border-bottom: 0.75px solid #999; padding: 6px 9px; font-size: 9.5px; vertical-align: middle; }
    .items-table .num { text-align: right; }
    /* Short single-value columns (Color, Width/Unit, Quantity, weight
       spec...) read as a tidy grid when centered — unlike Product/
       Description, which stay left-aligned since they hold running text. */
    .items-table .center { text-align: center; }
    /* Product description is its own paragraph, set apart from the bold
       product name above it. Every extra fact (CAS number, NCM, etc.)
       prints as its own plain line underneath — NOT a bulleted/indented
       list. Bullet markers plus a 12px indent were adding real vertical
       weight per line on top of an already-long description; the client's
       own reference documents just run each fact as a flush-left line, no
       marker, no indent, which is both what they want and meaningfully
       shorter per item (matters once an order has several items). */
    .items-table .desc-text, .items-table .desc-line { margin: 1px 0; font-size: 8px; line-height: 1.25; color: #222; }
    .totals-row td { font-weight: bold; border-top: 1.5px solid #333; border-bottom: none; }
    .two-col { display: flex; gap: 0; margin-top: 10px; border-top: 1px solid #333; }
    .two-col .col { flex: 1; padding: 8px 14px; font-size: 9.5px; }
    .two-col .col + .col { border-left: 1px solid #999; }
    /* Shipment Details (always the second/last column) reads as a centered
       block of facts in the client's own reference documents, unlike
       Payment Instructions which stays left-aligned prose. */
    .two-col .col:last-child { text-align: center; }
    .two-col .col-title { font-weight: bold; text-align: center; margin: -8px -14px 8px; padding: 4px 0; background: #d9d9d9; }
    /* Browsers default <p> to ~1em top/bottom margin — left unset, that
       reads as scattered whitespace rather than a compact list of facts,
       especially in the Shipment Details column which only has a handful of
       short lines. Every line stays close to the one above/below it. */
    .two-col p { margin: 3px 0; }
    .bank-block p { margin: 2px 0; }
    .small { font-size: 8.5px; color: #444; }
    .footer-note { margin-top: 14px; font-size: 8px; color: #777; text-align: center; }
  `;
}

function renderHeader(acq) {
  return `
    <div class="header">
      <img class="logo" src="${LOGO}" alt="Alliance Global" />
      <div class="company">
        <div class="name">${escapeHtml(acq.name)}</div>
        <div>${escapeHtml(acq.addressLine)} | Tel.: ${escapeHtml(acq.tel)}</div>
      </div>
    </div>
  `;
}

function wrapDocument({ title, acq, body, extraCss = "" }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>${baseCss()}${extraCss}</style>
</head>
<body>
  ${renderHeader(acq)}
  <div class="title-bar">${escapeHtml(title)}</div>
  ${body}
</body>
</html>`;
}

module.exports = { baseCss, renderHeader, wrapDocument };
