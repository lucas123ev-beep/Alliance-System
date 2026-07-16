const LOGO = require("./logo");
const { escapeHtml } = require("./helpers");

// Shared page shell used by every English-language template (Proforma,
// Commercial Invoice, Packing List). Mirrors the layout of the models sent
// by the client: logo top-left, acquisition company block top-right, a
// grey "TITLE" bar, then whatever body content the template supplies.
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
      font-size: 12px; letter-spacing: 0.5px; padding: 6px 0; margin-bottom: 6px;
    }
    .meta-table td { border: 1px solid #999; padding: 4px 8px; font-size: 9.5px; }
    .meta-table td.label { font-weight: bold; width: 32%; }
    .section-bar {
      background: #d9d9d9; text-align: center; font-weight: bold; font-size: 10px;
      padding: 4px 0; border: 1px solid #999; border-top: none;
    }
    .items-table td, .items-table th {
      border: 1px solid #999; padding: 5px 6px; font-size: 9.5px; vertical-align: top;
    }
    .items-table th { background: #eee; font-size: 8.5px; text-transform: uppercase; text-align: left; }
    .items-table .num { text-align: right; }
    .items-table .desc-bullets { margin: 2px 0 0 14px; padding: 0; font-size: 9px; }
    .totals-row td { font-weight: bold; background: #f2f2f2; }
    .two-col { display: flex; gap: 0; margin-top: 0; }
    .two-col .col { flex: 1; border: 1px solid #999; border-top: none; padding: 8px 10px; font-size: 9.5px; }
    .two-col .col + .col { border-left: none; }
    .two-col .col-title { font-weight: bold; text-align: center; margin: -8px -10px 8px; padding: 4px 0; background: #d9d9d9; border-bottom: 1px solid #999; }
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
