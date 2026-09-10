// This document's Buyer is whichever entity (HK / NINGBO) was picked for
// THIS contract specifically (supplier_contracts.acquisition_company),
// independent of the linked Order's own acquisition_company (which only
// drives client-facing invoicing) — Lucas's explicit request: the choice of
// who buys FROM the supplier is its own decision, not silently inherited.
// Defaults to Ningbo (see server.js) since procurement from Chinese
// factories normally runs through that entity, but HK can be picked
// instead, in which case this prints with HK's own navy branding and its
// existing HSBC account (see buyerInfoFor below) rather than Ningbo's
// domestic Bank of China account, which only Ningbo has.
const LOGO = require("./logo");
const LOGO_NINGBO = require("./logoNingbo");
const { escapeHtml, fmtNumber, fmtMoney } = require("./helpers");

const NAVY = "#0D1627";
const GRAY = "#58595B";

function themeFor(acq) {
  return acq && acq.code === "NINGBO"
    ? { accent: GRAY, logo: LOGO_NINGBO, logoCss: "width: 150px; height: auto;" }
    : { accent: NAVY, logo: LOGO, logoCss: "height: 32px; width: auto;" };
}

// Normalizes each entity's differently-shaped bank data into the one set
// of fields the Buyer block prints. Ningbo has a dedicated `domesticBank`
// (Bank of China, RMB, used specifically for paying Chinese factories) with
// its own Tax ID — HK has no such domestic account, so it falls back to its
// existing international `bank` block (HSBC, same one already used on the
// HK Proforma/Commercial Invoice) and simply has no Tax ID to show.
function buyerInfoFor(acq) {
  if (acq.domesticBank) {
    return {
      taxId: acq.domesticBank.taxId || "",
      bankName: acq.domesticBank.bankName || "",
      account: acq.domesticBank.account || "",
      address: acq.domesticBank.address || "",
      tel: acq.domesticBank.tel || "",
    };
  }
  return {
    taxId: "",
    bankName: acq.bank?.bankName || "",
    account: [acq.bank?.account, acq.bank?.swift ? `SWIFT: ${acq.bank.swift}` : null].filter(Boolean).join(" — "),
    address: acq.addressLine || acq.bank?.address || "",
    tel: acq.tel || "",
  };
}

// Supplier Purchase Contract (采购合同) — Chinese-language PO used with
// Chinese factories/trading companies. Structure and clause wording are
// fixed (per client's own template); only dates, numbers, items, totals
// and the buyer/seller blocks are dynamic.
function renderContract(params) {
  const {
    contractNumber, signDate, deliveryDate, acq, supplier, items, total, currency, remarks,
    totalQuantity, totalQuantityUnit, totalQuantityDecimals,
  } = params;

  const theme = themeFor(acq);
  const buyer = buyerInfoFor(acq);

  const rows = items.map((item, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(item.productNameZh || item.productName)}</td>
      <td>${escapeHtml(item.colorZh || item.color || "—")}</td>
      <td>${escapeHtml(item.thickness || "—")}</td>
      <td>${escapeHtml(item.width || "—")}</td>
      <td>${escapeHtml(item.gramatura || "—")}</td>
      <td class="num">${item.quantityValue != null ? `${fmtNumber(item.quantityValue, item.quantityDecimals ?? 0)}${item.quantityUnit ? " " + escapeHtml(item.quantityUnit) : ""}` : "—"}</td>
      <td class="num">${fmtMoney(item.unitPrice, item.currency || currency)}</td>
      <td class="num">${fmtMoney(item.total, item.currency || currency)}</td>
    </tr>
  `).join("");

  // Accent color/logo swap between HKAG-navy and Ningbo-gray, same theme
  // pattern as pdf/layout.js's themeFor/applyTheme — applied conservatively
  // here, since this is an internal bilingual legal contract with the
  // factory, so it keeps its plain black/white bordered-table body instead
  // of the sales documents' card-based layout; only the letterhead rule,
  // title, table header and totals row pick up the brand color.
  const ACCENT = theme.accent;
  const css = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px 30px; font-family: "Noto Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; font-size: 10.5px; color: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid ${ACCENT}; }
    /* Ningbo's wordmark aspect ratio (~4.23:1) is much wider per unit
       height than HKAG's (~3.03:1, see pdf/logo.js) — a fixed height would
       render it oversized, so theme.logoCss picks width-based sizing for
       Ningbo and the original height-based sizing for HKAG. */
    .header img.logo { ${theme.logoCss} }
    .header .company { text-align: right; font-size: 10px; line-height: 1.5; }
    .header .company .cn { font-weight: bold; font-size: 12px; color: ${ACCENT}; }
    .header .company .en { font-weight: bold; font-size: 10px; color: ${ACCENT}; }
    .title-bar { text-align: center; font-weight: bold; font-size: 15px; letter-spacing: 4px; margin: 4px 0 10px; color: ${ACCENT}; }
    .meta-row { display: flex; justify-content: space-between; font-size: 10.5px; margin-bottom: 8px; }
    /* Same page-break fix as the client-facing documents (see layout.js) —
       keeps a row from being sliced across a page boundary. */
    .items-table tr { break-inside: avoid; page-break-inside: avoid; }
    .items-table td, .items-table th { border: 1px solid #333; padding: 5px 6px; font-size: 9.5px; }
    .items-table th { background: ${ACCENT}; color: #fff; font-size: 9px; }
    .items-table .num { text-align: right; }
    .totals-row td { font-weight: bold; background: #f2f2f2; border-top: 1.5px solid ${ACCENT}; }
    .remarks { border: 1px solid #333; border-top: none; padding: 8px 10px; }
    .remarks .req-title { text-align: center; font-weight: bold; background: #eee; margin: -8px -10px 8px; padding: 4px 0; border-bottom: 1px solid #333; }
    .clause { margin: 5px 0; line-height: 1.5; }
    .clause b { font-weight: bold; }
    .sign-block { display: flex; justify-content: space-between; margin-top: 40px; }
    .sign-block .party { width: 46%; font-size: 10px; line-height: 1.8; }
    .sign-block .party .role { font-weight: bold; margin-bottom: 4px; color: ${ACCENT}; }
    .sign-line { border-top: 1px solid #333; margin-top: 30px; padding-top: 4px; }
  `;

  const body = `
    <div class="header">
      <img class="logo" src="${theme.logo}" alt="${escapeHtml(acq.name)}" />
      <div class="company">
        ${acq.chineseName ? `<div class="cn">${escapeHtml(acq.chineseName)}</div>` : ""}
        <div class="en">${escapeHtml(acq.name)}</div>
      </div>
    </div>
    <div class="title-bar">采购合同 / PURCHASE CONTRACT</div>
    <div class="meta-row">
      <div>合同日期 / Contract Date: <strong>${escapeHtml(signDate)}</strong></div>
      <div>合同编号 / Contract No.: <strong>${escapeHtml(contractNumber)}</strong></div>
    </div>
    <p style="font-size:9.5px; color:#444;">根据《中华人民共和国合同法》及相关法律规定买卖双方本着平等互利的原则，自愿签订以下合约，供双方共同履行。<br/>In accordance with the Contract Law of the People's Republic of China and relevant laws and regulations, both parties hereby enter into this contract on the basis of equality and mutual benefit, to be jointly performed by both parties.</p>
    <p style="font-weight:bold; margin-bottom:4px;">1. 产品规格及要求 / Product Specifications</p>
    <table class="items-table">
      <thead>
        <tr>
          <th>项目 No.</th><th>品名 Product Name</th><th>颜色 Color</th><th>厚度 Thickness</th><th>有效门幅 Width</th>
          <th>克重 Weight</th><th>数量 Quantity</th><th>含税单价 Unit Price</th><th>金额 Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="totals-row">
          <td colspan="6" style="text-align:right;">总计 (Total)</td>
          <td class="num">${totalQuantity != null ? `${fmtNumber(totalQuantity, totalQuantityDecimals ?? 0)}${totalQuantityUnit ? " " + escapeHtml(totalQuantityUnit) : ""}` : ""}</td>
          <td></td>
          <td class="num">${fmtMoney(total, currency)}</td>
        </tr>
      </tbody>
    </table>

    <div class="remarks">
      <div class="req-title">要求 / Requirements</div>
      ${remarks ? `<p class="clause" style="white-space:pre-wrap;">${escapeHtml(remarks)}</p>` : ""}
    </div>

    <div class="sign-block">
      <div class="party">
        <div class="role">买方 / Buyer: ${escapeHtml(acq.chineseName || acq.name)}</div>
        ${buyer.taxId ? `<div>税号 / Tax ID: ${escapeHtml(buyer.taxId)}</div>` : ""}
        <div>开户行 / Bank: ${escapeHtml(buyer.bankName)}</div>
        <div>账号 / Account: ${escapeHtml(buyer.account)}</div>
        <div>地址 / Address: ${escapeHtml(buyer.address)}</div>
        <div>电话 / Tel: ${escapeHtml(buyer.tel)}</div>
        <div class="sign-line">签名 / 公司盖章 Signature / Company Seal &nbsp;&nbsp;&nbsp;&nbsp; 日期 Date:</div>
      </div>
      <div class="party">
        <div class="role">卖方 / Seller: ${escapeHtml(supplier.name)}</div>
        <div>帐号 / Account: ${escapeHtml(supplier.accountNumber || "—")}</div>
        <div>开户 / Bank: ${escapeHtml(supplier.bankName || "—")}</div>
        ${supplier.bankBranch ? `<div>行号 / Bank Code: ${escapeHtml(supplier.bankBranch)}</div>` : ""}
        ${supplier.contactName ? `<div>联系人 / Attn: ${escapeHtml(supplier.contactName)}</div>` : ""}
        ${supplier.phone ? `<div>电话 / Tel: ${escapeHtml(supplier.phone)}</div>` : ""}
        <div class="sign-line">签名 / 公司盖章 Signature / Company Seal &nbsp;&nbsp;&nbsp;&nbsp; 日期 Date:</div>
      </div>
    </div>
  `;

  const fontLinks = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet" />
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />${fontLinks}<style>${css}</style></head><body>${body}</body></html>`;
}

module.exports = { renderContract };
