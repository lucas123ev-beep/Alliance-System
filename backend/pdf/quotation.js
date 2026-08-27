const { wrapDocument, icon, renderMultiCompanyHeader } = require("./layout");
const { escapeHtml, fmtDateLong, fmtNumber, fmtMoney, amountToWords, currencyLabel } = require("./helpers");
const { renderItemSections } = require("./itemSections");
const { partyCard } = require("./salesInvoice");
const ACQ = require("./acquisitionCompanies");

// Internal/pre-sale document — issued before an Order (and its
// acquisition_company decision) exists, so it deliberately leaves out
// everything only relevant from that point on: bank information, shipment/
// incoterm details, signature box. Otherwise matches the same layout/
// structure as Proforma and Commercial Invoice (see salesInvoice.js) —
// same category-aware item table(s) (Textile vs. Chemical vs. everything
// else, each with their own peculiarities — see itemSections.js) and the
// same client party card, just with a per-item photo column added (pulled
// from that product's own registered media — see firstProductImage in
// server.js) so the client can recognize what's being quoted at a glance.
//
// params:
//   number, date, client: { name, address, taxId, tel }, priceValidity,
//   portOfLoading, portOfDischarge, currency
//   items: same normalizeSalesItem()-shaped array the other templates use,
//     plus imageUrl (set by the caller)
//   totalAmount, freightValue: optional CIF freight charged to the client,
//     shown as its own line and folded into the Grand Total below it
function renderQuotation(params) {
  const { number, date, client, priceValidity, portOfLoading, portOfDischarge, currency, items, totalAmount, freightValue } = params;

  const sectionsHtml = renderItemSections(items, currency, { showImage: true });
  const freight = parseFloat(freightValue) || 0;
  const grandTotal = (parseFloat(totalAmount) || 0) + freight;

  const body = `
    <div class="doc-meta-row">
      <div><strong>Number:</strong> ${escapeHtml(number)}</div>
      <div><strong>Date:</strong> ${fmtDateLong(date)}</div>
    </div>
    <table class="meta-table">
      <tr>
        <td>${icon("user")}<strong>Client:</strong> ${escapeHtml(client?.name || "—")}</td>
        <td>${icon("calendar")}<strong>Price Validity:</strong> ${priceValidity ? fmtDateLong(priceValidity) : "—"}</td>
      </tr>
      <tr>
        <td>${icon("anchor")}<strong>Port of Loading:</strong> ${escapeHtml(portOfLoading || "—")}</td>
        <td>${icon("ship")}<strong>Port of Discharge:</strong> ${escapeHtml(portOfDischarge || "—")}</td>
      </tr>
    </table>

    ${sectionsHtml}

    <table class="items-table" style="margin-top:4px;">
      <tbody>
        ${freight > 0 ? `<tr><td class="num">Total CIF Freight: ${fmtMoney(freight, currency)}</td></tr>` : ""}
        <tr class="totals-row">
          <td class="num">Grand Total Amount: ${fmtMoney(grandTotal, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer-grid" style="margin-top:14px;">
      <div style="flex:1.2; display:flex; flex-direction:column;">
        <div class="total-box" style="flex:1;">
          <div class="label">Total Quotation Value</div>
          <div class="value">${escapeHtml(currencyLabel(currency))} ${fmtNumber(grandTotal, 2)}</div>
          <div class="words">${escapeHtml(amountToWords(grandTotal, currency))}</div>
        </div>
      </div>
      <div style="flex:1; display:flex; flex-direction:column;">
        ${partyCard("Client", client || {}, "flex:1;")}
      </div>
    </div>

    <div class="footer-note">This Quotation is issued for reference purposes only, does not constitute a sales contract, and is subject to change without prior notice${priceValidity ? ` after ${escapeHtml(fmtDateLong(priceValidity))}` : ""}.</div>
  `;

  const header = renderMultiCompanyHeader([ACQ.HK.name, ACQ.NINGBO.name]);
  return wrapDocument({ title: "QUOTATION", header, body });
}

module.exports = { renderQuotation };
