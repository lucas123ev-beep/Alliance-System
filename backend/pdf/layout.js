const LOGO = require("./logo");
const { escapeHtml } = require("./helpers");

// Shared page shell used by every English-language template (Proforma,
// Commercial Invoice, Packing List). Redesigned to match the client's own
// HKAG-branded reference documents: navy (#152C62) letterhead rule + title
// bar, a full contact block (address/phone/email/website) opposite the
// logo, small inline icons in front of every meta-info label, a light-grey
// "Country of origin / acquisition" checkmark band, and a navy items-table
// header. Every icon below is a hand-drawn inline SVG (no external font/
// icon library — Puppeteer renders this server-side with no guarantee an
// external CDN request finishes before the PDF is captured, so nothing
// here depends on the network).
const NAVY = "#152C62";

// Minimal Tabler-style outline icons, 14x14, stroke=currentColor. Kept as a
// lookup so both layout.js and the template files (salesInvoice.js,
// packingList.js) can request one by name instead of inlining raw SVG.
const ICONS = {
  ship: '<svg viewBox="0 0 14 14" width="11" height="11"><path d="M2 6.5 3 2h8l1 4.5M1.5 6.5h11L11 12H3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M7 2V0.5M5 0.5h4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  anchor: '<svg viewBox="0 0 14 14" width="11" height="11"><circle cx="7" cy="2.3" r="1.3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M7 3.6V12M3 6h8M3 9.5c0 1.9 1.8 2.9 4 2.9s4-1 4-2.9" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  world: '<svg viewBox="0 0 14 14" width="11" height="11"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 7h11M7 1.5c2 2 2 9 0 11-2-2-2-9 0-11" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  file: '<svg viewBox="0 0 14 14" width="11" height="11"><path d="M3 1h5l3 3v9H3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M8 1v3h3M5 7.5h4M5 10h4" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  building: '<svg viewBox="0 0 14 14" width="11" height="11"><rect x="2" y="1.5" width="10" height="11" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4h1.5M8 4h1.5M4.5 6.5h1.5M8 6.5h1.5M4.5 9h1.5M8 9h1.5" stroke="currentColor" stroke-width="1"/></svg>',
  check: '<svg viewBox="0 0 14 14" width="11" height="11"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.3 7.2 6.2 9l3.5-4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 14 14" width="10" height="10"><path d="M7 13S2.5 8.6 2.5 5.5A4.5 4.5 0 0 1 7 1a4.5 4.5 0 0 1 4.5 4.5C11.5 8.6 7 13 7 13z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><circle cx="7" cy="5.3" r="1.4" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  phone: '<svg viewBox="0 0 14 14" width="10" height="10"><path d="M3 2c-1 0-1.5.5-1.5 1.3C1.5 8 6 12.5 10.7 12.5c.8 0 1.3-.5 1.3-1.5v-1.5l-2.7-1-1 1.3c-1.5-.7-2.8-2-3.5-3.5L6.1 5 5.1 2.3z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 14 14" width="10" height="10"><rect x="1.5" y="2.5" width="11" height="9" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.8 3 7 7.5 12.2 3" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  bank: '<svg viewBox="0 0 14 14" width="11" height="11"><path d="M1.5 5 7 1.5 12.5 5z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M2 5.5v6M5 5.5v6M9 5.5v6M12 5.5v6M1.2 12h11.6" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  user: '<svg viewBox="0 0 14 14" width="11" height="11"><circle cx="7" cy="4.3" r="2.5" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M2 12.5c0-2.5 2.2-4.3 5-4.3s5 1.8 5 4.3" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  calendar: '<svg viewBox="0 0 14 14" width="11" height="11"><rect x="1.5" y="2.5" width="11" height="10" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 5.5h11M4 1v3M10 1v3" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
};

function icon(name, color = NAVY) {
  const svg = ICONS[name] || ICONS.file;
  return `<span style="display:inline-block;vertical-align:-1.5px;margin-right:5px;color:${color};">${svg}</span>`;
}

function baseCss() {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 20px 26px; font-family: Arial, Helvetica, sans-serif;
      font-size: 10px; color: #1a1a1a;
    }
    table { width: 100%; border-collapse: collapse; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .header img.logo { height: 68px; }
    .header .company { text-align: right; font-size: 8px; line-height: 1.7; color: #333; }
    .header .company div { white-space: nowrap; }
    .header .company .company-name { font-size: 13px; font-weight: bold; color: ${NAVY}; margin-bottom: 3px; }
    .title-bar {
      background: ${NAVY}; color: #fff; text-align: center; font-weight: bold;
      font-size: 12px; letter-spacing: 1.2px; padding: 6px 0; margin-bottom: 8px;
    }
    /* "Label: value" pairs, two per row, icon in front of the label — matches
       the client's own reference layout. Rows are separated by hairlines,
       the whole block by a heavier top/bottom rule. */
    .meta-table { border-top: 1px solid #333; border-bottom: 1px solid #333; margin-bottom: 0; }
    .meta-table td { padding: 5px 10px; font-size: 9px; vertical-align: top; width: 50%; }
    .meta-table tr + tr td { border-top: 1px solid #e6e6e6; }
    .meta-table .icon-label { color: ${NAVY}; }
    /* Number/Date row sits directly under the title bar, above the icon
       grid, without the icon treatment (matches the reference: plain bold
       label/value pair, full-width rule under it). */
    .doc-meta-row { display: flex; justify-content: space-between; font-size: 9px;
      border-top: 1px solid #333; border-bottom: 1px solid #333; padding: 5px 10px; margin-bottom: 8px; }
    /* Light-grey "Country of origin / acquisition" checkmark band — its own
       rounded block between the icon grid and the items table, not just
       another meta-table row. */
    .check-band { display: flex; background: #f0f1f3; border-radius: 6px; margin: 8px 0; font-size: 8.5px; }
    .check-band .col { flex: 1; padding: 7px 12px; }
    .check-band .col + .col { border-left: 1px solid #d5d5d5; }
    .section-bar {
      background: ${NAVY}; color: #fff; text-align: center; font-weight: bold; font-size: 9.5px;
      padding: 4px 0;
    }
    /* Fixed line-height (not just padding) is what actually keeps every
       items-table header the same thickness across a document — with only
       padding set, a header that happens to wrap onto two lines (long
       labels like "Total Amount (USD FOB)" in a narrow column) grows taller
       than a neighboring one-line header, which read as inconsistent
       between the Textile and Other-goods tables. */
    .items-table th {
      background: ${NAVY}; color: #fff; padding: 3px 6px; font-size: 7.5px; line-height: 1.25;
      text-transform: uppercase; text-align: center; font-weight: bold;
    }
    .items-table td { border-bottom: 0.75px solid #ddd; padding: 4px 7px; font-size: 9px; vertical-align: middle; }
    .items-table .num { text-align: right; }
    /* Short single-value columns (Color, Width/Unit, Quantity, weight
       spec...) read as a tidy grid when centered — unlike Product/
       Description, which stay left-aligned since they hold running text. */
    .items-table .center { text-align: center; }
    /* Product description is its own paragraph, set apart from the bold
       product name above it. Every extra fact (CAS number, NCM, etc.)
       prints as its own plain line underneath — NOT a bulleted/indented
       list, matching the client's own reference documents. */
    .items-table .desc-text, .items-table .desc-line { margin: 0.5px 0; font-size: 7.5px; line-height: 1.15; color: #222; }
    .totals-row td { font-weight: bold; border-top: 1.5px solid ${NAVY}; border-bottom: none; }
    /* Footer: up to three columns (Payment & Terms / Bank Information /
       Importer-Consignee), each its own light card with a navy heading row
       — matches the reference's card-style footer instead of a plain
       bordered two-column table. */
    .footer-grid { display: flex; gap: 12px; margin-top: 12px; align-items: stretch; }
    .footer-grid .card { flex: 1; background: #f7f8fa; border-radius: 8px; padding: 10px 12px; }
    .footer-grid .card-title { font-weight: bold; color: ${NAVY}; margin: 0 0 5px; font-size: 9px; }
    .footer-grid .card p { margin: 2px 0; }
    /* Total Invoice Value — its own bordered callout instead of a plain
       paragraph, matching the reference's boxed total. */
    .total-box { border: 1.5px solid ${NAVY}; border-radius: 8px; padding: 8px 12px; text-align: center; margin-top: 8px; }
    .total-box .label { font-size: 7.5px; color: #666; }
    .total-box .value { font-weight: bold; color: ${NAVY}; font-size: 15px; margin-top: 1px; }
    .total-box .words { font-size: 6.8px; color: #777; font-style: italic; margin-top: 2px; }
    .sig-box { border: 1px solid #ccc; border-radius: 8px; padding: 10px 12px; text-align: center; margin-top: 8px; }
    .sig-box .label { font-size: 6.8px; color: #666; text-transform: uppercase; letter-spacing: 0.4px; }
    .sig-box .name { font-weight: bold; font-size: 8px; color: ${NAVY}; margin: 4px 0; }
    .sig-box .line { border-top: 1px solid #999; margin-top: 14px; padding-top: 3px; font-size: 7px; color: #888; }
    .bank-block p { margin: 1px 0; }
    .small { font-size: 8px; color: #444; }
    .footer-note { margin-top: 12px; font-size: 7.5px; color: #888; text-align: center; border-top: 0.5px solid #e2e2e2; padding-top: 8px; }
  `;
}

function renderHeader(acq) {
  return `
    <div class="header">
      <img class="logo" src="${LOGO}" alt="${escapeHtml(acq.name)}" />
      <div class="company">
        <div class="company-name">${escapeHtml(acq.name)}</div>
        ${acq.addressLine ? `<div>${icon("pin", "#333")}${escapeHtml(acq.addressLine)}</div>` : ""}
        ${acq.tel ? `<div>${icon("phone", "#333")}${escapeHtml(acq.tel)}</div>` : ""}
        ${acq.email ? `<div>${icon("mail", "#333")}${escapeHtml(acq.email)}</div>` : ""}
        ${acq.website ? `<div>${icon("world", "#333")}${escapeHtml(acq.website)}</div>` : ""}
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

module.exports = { baseCss, renderHeader, wrapDocument, icon, ICONS, NAVY };
