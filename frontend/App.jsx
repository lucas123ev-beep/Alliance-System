import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (n, cur = "USD") =>
  n != null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n)
    : "—";

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US") : "—");

// The two Alliance Global trading entities used to issue Proformas, Commercial
// Invoices and Packing Lists. Since the business is a trader, the "Manufacturer"
// shown on client-facing documents is always one of these — never the real
// factory/supplier. Mirrors backend/pdf/acquisitionCompanies.js.
const ACQUISITION_COMPANIES = {
  HK: {
    name: "HONG KONG ALLIANCE GLOBAL TRADING CO., LTD",
    address: "Unit 6, 10/Floor, Siu On Plaza. | 482 Jaffe Road, Causeway Bay. | Hong Kong",
    tel: "+ 856 2528 2801",
  },
  NINGBO: {
    name: "NINGBO WORLD ALLIANCE TRADING. CO. LTD.",
    address: "715, Changxing Road, 501, Jiangbei District | Ningbo - Zhejiang - China | Zip Code: 315000",
    tel: "+86 15888552349",
  },
};
const getAcqCompany = (code) => ACQUISITION_COMPANIES[code] || ACQUISITION_COMPANIES.HK;

// Shared searchable-dropdown ports lists (used by OrderForm and ProformaForm
// for Port of Loading / Port of Discharge).
const CHINA_PORTS_OPTIONS = [
  "Shanghai, CN", "Shenzhen, CN", "Ningbo, CN", "Guangzhou, CN", "Qingdao, CN",
  "Tianjin, CN", "Dalian, CN", "Xiamen, CN", "Suzhou, CN", "Foshan, CN",
  "Dongguan, CN", "Zhongshan, CN", "Zhuhai, CN", "Shantou, CN", "Quanzhou, CN",
  "Fuzhou, CN", "Wenzhou, CN", "Nanjing, CN", "Wuhan, CN", "Chongqing, CN",
  "Chengdu, CN", "Hangzhou, CN", "Nantong, CN", "Lianyungang, CN", "Yantai, CN",
  "Qinhuangdao, CN", "Tangshan, CN", "Rizhao, CN", "Zhanjiang, CN", "Huangpu, CN",
  "Chiwan, CN", "Yantian, CN", "Shekou, CN", "Nansha, CN", "Taicang, CN",
  "Zhoushan, CN", "Jinzhou, CN", "Yingkou, CN", "Dandong, CN", "Fangchenggang, CN",
  "Beihai, CN", "Haikou, CN", "Sanya, CN", "Lanzhou, CN", "Urumqi, CN",
];

const BRAZIL_PORTS_OPTIONS = [
  "Santos, BR", "Paranaguá, BR", "Rio de Janeiro, BR", "Itajaí, BR", "Suape, BR",
  "Manaus, BR", "Salvador, BR", "Fortaleza, BR", "Belém, BR", "Rio Grande, BR",
  "Vitória, BR", "São Francisco do Sul, BR", "Navegantes, BR", "Imbituba, BR",
  "Porto Alegre, BR", "Recife, BR", "Maceió, BR", "Natal, BR", "São Luís, BR",
  "Aratu, BR", "Angra dos Reis, BR", "Sepetiba, BR", "Presidente Epitácio, BR",
  "Santarém, BR", "Porto Velho, BR", "Corumbá, BR", "Ladário, BR",
  "Ilhéus, BR", "Cabedelo, BR", "Pecém, BR",
];

const PORT_DROPDOWN_STYLE = {
  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
  background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
  maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};
const PORT_DROP_ITEM_STYLE = {
  padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
  borderBottom: "1px solid #0f172a",
};

// Reusable searchable port input, used for Port of Loading / Port of Discharge
// on both OrderForm and ProformaForm.
function PortAutocomplete({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter(p => p.toLowerCase().includes((value || "").toLowerCase()));
  return (
    <div style={{ position: "relative" }}>
      <Input value={value || ""}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder} />
      {open && filtered.length > 0 && (
        <div style={PORT_DROPDOWN_STYLE}>
          {filtered.map((p, i) => (
            <div key={i} style={PORT_DROP_ITEM_STYLE}
              onMouseDown={() => { onChange(p); setOpen(false); }}
              onMouseEnter={e => e.currentTarget.style.background = "#334155"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Parses a number typed with Brazilian formatting (e.g. "1.000,00" or
// "1000,00") or plain JS-style decimal ("1000.00") into a standard float.
// Used on money/rate inputs so users can type either style and land on the
// same value. Whichever of "," or "." appears LAST is treated as the
// decimal separator; the other is treated as a thousands separator.
const parseLocaleNumber = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    const parts = s.split(".");
    if (parts.length > 2 || (parts[1] && parts[1].length === 3)) s = parts.join("");
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
};

// Converts a product's registered `height` (roll length) into meters,
// regardless of the unit it was entered in. Used to convert between the
// per-meter rate and the per-roll price.
const heightMOf = (product) => {
  if (!product) return 0;
  const h = parseFloat(product.height) || 0;
  return product.height_unit === "cm" ? h * 0.01 : product.height_unit === "mm" ? h * 0.001 : h;
};

// The registered per-meter sale price on the product record — the 0%
// reference point the item's Markup % is measured against.
const registeredPerMeter = (product) => {
  const v = product ? parseFloat(product.sale_per_meter) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Recomputes an item's roll price, total, per-meter rate, and markup % when
// one of the three editable pricing fields changes — used inline in the
// Quotation screen's item list (where the final sale price to the client is
// actually decided) for Textile / DTF Film items. `field` is one of
// "sale_pct", "sale_per_meter", or "total"; `rawValue` is the raw text the
// user typed (may be Brazilian-formatted, e.g. "1.000,00").
function recalcTextileItem(item, product, field, rawValue) {
  const heightM = heightMOf(product);
  const qty = parseFloat(item.quantity) || 0;
  const base = registeredPerMeter(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const spm = base != null && pct != null ? base * (1 + pct / 100) : null;
    const unitPrice = spm != null && heightM ? spm * heightM : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }

  if (field === "sale_per_meter") {
    const spm = parseLocaleNumber(rawValue);
    const unitPrice = spm != null && heightM ? spm * heightM : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      sale_per_meter: rawValue,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const spm = price != null && heightM ? price / heightM : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  return item;
}

// The registered flat sale price on the product record — the 0% reference
// point for Markup % on every non-Textile/non-Chemical category (machines,
// accessories, etc.), mirroring registeredPerMeter()/registeredPerLiter().
const registeredUnitPrice = (product) => {
  const v = product ? parseFloat(product.sale_price) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Same idea as recalcTextileItem but for every category with a flat unit
// price (machines, accessories, packaging, etc. — anything that isn't sold
// by the meter or by the liter). `field` is "sale_pct", "unit_price" or
// "total"; `rawValue` may be BR-formatted. The sale price for ALL categories
// is decided here, inline in the Quotation screen's item list — Add Product
// only holds cost data.
function recalcSimpleItem(item, product, field, rawValue) {
  const qty = parseFloat(item.quantity) || 0;
  const base = registeredUnitPrice(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const price = base != null && pct != null ? base * (1 + pct / 100) : null;
    const total = price != null && qty ? price * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      unit_price: price != null ? price.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }
  if (field === "unit_price") {
    const price = parseLocaleNumber(rawValue);
    const total = price != null && qty ? price * qty : null;
    const pct = base != null && price != null ? ((price / base) - 1) * 100 : null;
    return {
      ...item,
      unit_price: rawValue,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const pct = base != null && price != null ? ((price / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  return item;
}

// Converts a product's registered `volume` (e.g. liters per drum/barrel)
// into liters, regardless of the unit it was entered in — the liquid-goods
// equivalent of heightMOf() for Textile rolls.
const volumeLOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.volume) || 0;
  if (product.volume_unit === "mL") return v * 0.001;
  if (product.volume_unit === "gal") return v * 3.78541;
  return v; // L
};

// The registered per-liter sale price on the product record — the 0%
// reference point Markup % is measured against for Chemical/liquid items.
const registeredPerLiter = (product) => {
  const v = product ? parseFloat(product.sale_per_liter) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Liquid-goods (Chemical category — sold in drums/barrels) equivalent of
// recalcTextileItem: two-way Markup % / Value-per-Liter / Total, converting
// through the product's registered drum volume.
function recalcLiquidItem(item, product, field, rawValue) {
  const volumeL = volumeLOf(product);
  const qty = parseFloat(item.quantity) || 0;
  const base = registeredPerLiter(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const spl = base != null && pct != null ? base * (1 + pct / 100) : null;
    const unitPrice = spl != null && volumeL ? spl * volumeL : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      sale_per_liter: spl != null ? spl.toFixed(2) : item.sale_per_liter,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }
  if (field === "sale_per_liter") {
    const spl = parseLocaleNumber(rawValue);
    const unitPrice = spl != null && volumeL ? spl * volumeL : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    const pct = base != null && spl != null ? ((spl / base) - 1) * 100 : null;
    return {
      ...item,
      sale_per_liter: rawValue,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const spl = price != null && volumeL ? price / volumeL : null;
    const pct = base != null && spl != null ? ((spl / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      sale_per_liter: spl != null ? spl.toFixed(2) : item.sale_per_liter,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  return item;
}

// Options for the "Target Price refers to" selector shown next to each
// item's Target Price field. Per Meter and Per Liter are always offered
// (not just for items whose category happens to be Textile/DTF/Chemical) —
// ad-hoc items typed in without picking a registered product never get a
// category set at all, but the person may still be quoting them by the
// meter or by the liter, so the option needs to be there regardless.
function targetPriceUnitOptions(item) {
  return [
    { value: "total", label: "Total" },
    { value: "meter", label: "Per Meter" },
    { value: "liter", label: "Per Liter" },
    { value: "unit", label: `Per ${item?.unit || "Unit"}` },
  ];
}

const targetPriceUnitSuffix = (item) => {
  if (item.target_price_unit === "meter") return "/m";
  if (item.target_price_unit === "liter") return "/L";
  if (item.target_price_unit === "unit") return `/${item.unit || "un"}`;
  return "";
};

// Shared inline Markup %/Value-per-X/Total editor for a single item row —
// used by both QuotationForm and OrderForm. Add Product only ever holds
// cost data, so this is the one place a sale price actually gets set; it
// needs to exist in the Order screen too (not just Quotation), since a
// custom price can legitimately end up different from whatever's currently
// registered on the Product, and Order items may be added/edited directly
// without ever going through a Quotation.
function PricingRow({ item, product, currency, onChange }) {
  const isTextile = item.category === "Textile" || item.category === "DTF Film";
  const isLiquid = item.category === "Chemical";
  const onPriceField = (field) => (e) => onChange(recalcTextileItem(item, product, field, e.target.value));
  const onLiquidField = (field) => (e) => onChange(recalcLiquidItem(item, product, field, e.target.value));
  const onSimpleField = (field) => (e) => onChange(recalcSimpleItem(item, product, field, e.target.value));
  const pctHandler = isTextile ? onPriceField("sale_pct") : isLiquid ? onLiquidField("sale_pct") : onSimpleField("sale_pct");
  const totalHandler = isTextile ? onPriceField("total") : isLiquid ? onLiquidField("total") : onSimpleField("total");
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginTop: "8px", flexWrap: "wrap" }}>
      <label style={{ fontSize: "11px", color: "#64748b" }}>Markup %
        <input type="text" inputMode="decimal" value={item.sale_pct ?? ""} onChange={pctHandler}
          placeholder="0" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "70px" }} />
      </label>
      {isTextile ? (
        <label style={{ fontSize: "11px", color: "#64748b" }}>Value / Meter ({currency})
          <input type="text" inputMode="decimal" value={item.sale_per_meter ?? ""} onChange={onPriceField("sale_per_meter")}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      ) : isLiquid ? (
        <label style={{ fontSize: "11px", color: "#64748b" }}>Value / Liter ({currency})
          <input type="text" inputMode="decimal" value={item.sale_per_liter ?? ""} onChange={onLiquidField("sale_per_liter")}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      ) : (
        <label style={{ fontSize: "11px", color: "#64748b" }}>Unit Price ({currency})
          <input type="text" inputMode="decimal" value={item.unit_price ?? ""} onChange={onSimpleField("unit_price")}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      )}
      <label style={{ fontSize: "11px", color: "#64748b" }}>Total ({currency})
        <input type="text" inputMode="decimal" value={item.total ?? ""} onChange={totalHandler}
          placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "110px", fontWeight: 700, color: "#10b981" }} />
      </label>
    </div>
  );
}

// Package/unit options a product can be sold in — shared between the
// Product Registry's "Package" field and the Add Product modal's Unit
// field, so an ad-hoc item (not tied to a registered product) can still
// pick a real package type instead of being stuck with whatever the last
// selected product had.
const PACKAGE_UNIT_OPTIONS = [
  "Bags / Sacks - 25kg",
  "Bags / Sacks - 50kg",
  "Boxes / Cartons - Large",
  "Boxes / Cartons - Medium",
  "Boxes / Cartons - Small",
  "Wooden Crates - Large",
  "Wooden Crates - Medium",
  "Wooden Crates - Small",
  "Fiber Drums / Barrels",
  "Pallet - America",
  "Pallet - Europe",
  "Plastic Drums / Barrels",
  "Rolls",
  "Steel Drums / Barrels",
];

// Shared list of trade payment-term presets, used by both OrderForm and
// ProformaForm's searchable Payment Terms field.
const PAYMENT_TERMS_OPTIONS = [
  "100% ADV – 100% Advance",
  "100% AFTER D. SALE – 100% After Domestic Sale",
  "100% ARRIVAL – 100% At Destination Port",
  "100%ADV B. SHIP. – 100% Advance Before Shipment",
  "100%DP BL – 100%DP Under BL Copy",
  "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
  "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
  "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
  "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
  "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
  "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
];

// For Textile / DTF Film items, the roll price is derived from a per-meter
// rate — show that rate alongside the roll total so it's clear where the
// number came from. `field` is "sale_per_meter" or "cost_per_meter".
const perMeterLabel = (item, field, cur) => {
  const isTextile = item?.category === "Textile" || item?.category === "DTF Film";
  const rate = item?.[field];
  if (!isTextile || !rate) return null;
  return `${fmt(parseFloat(rate), cur)}/m`;
};

async function api(path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function uploadToCloudinary(file) {
  const isPDF = file.type === "application/pdf";
  const resourceType = isPDF ? "raw" : "auto";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "ml_Alliance System");
  formData.append("folder", "exportflow");
  formData.append("resource_type", resourceType);
  const res = await fetch(`https://api.cloudinary.com/v1_1/eymnivfs/${resourceType}/upload`, {
    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { url: data.secure_url, name: file.name };
}

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const ORDER_STATUSES = ["Pending", "In Production", "Inspection", "Shipment", "Completed"];
const STATUS_COLORS = {
  Pending: { bg: "#1e293b", text: "#94a3b8", dot: "#64748b", border: "#334155" },
  "In Production": { bg: "#1e3a5f", text: "#60a5fa", dot: "#3b82f6", border: "#1e40af" },
  Inspection: { bg: "#3b2a00", text: "#fbbf24", dot: "#f59e0b", border: "#92400e" },
  Shipment: { bg: "#1a3a2a", text: "#34d399", dot: "#10b981", border: "#065f46" },
  Completed: { bg: "#064e3b", text: "#34d399", dot: "#10b981", border: "#065f46" },
};
const SAMPLE_STATUSES = ["Requested", "In Production", "Sent", "Feedback Received", "Approved"];
const FIN_STATUSES = ["Pending", "Partial", "Paid", "Overdue"];

// ─── REUSABLE UI ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
          width: "100%", maxWidth: wide ? "900px" : "600px", maxHeight: "90vh",
          overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px 0" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 28px 28px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, half }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", gridColumn: half ? "span 1" : "span 2" }}>
      <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
  padding: "10px 12px", color: "#f1f5f9", fontSize: "14px", outline: "none",
  width: "100%", boxSizing: "border-box", fontFamily: "inherit",
};

function Input({ style, ...props }) { return <input style={{ ...inputStyle, ...style }} {...props} />; }
function Select({ children, ...props }) { return <select style={{ ...inputStyle, cursor: "pointer" }} {...props}>{children}</select>; }
function Textarea(props) { return <textarea style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }} {...props} />; }

function Btn({ children, onClick, color = "#3b82f6", small, outline, disabled }) {
  const bg = outline ? "transparent" : color;
  const border = outline ? `1px solid ${color}` : "none";
  const textColor = outline ? color : "#fff";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg, border, color: textColor, borderRadius: "8px",
        padding: small ? "6px 12px" : "10px 18px",
        fontSize: small ? "12px" : "13px", fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s", fontFamily: "inherit", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function Badge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#1e293b", text: "#94a3b8", dot: "#64748b", border: "#334155" };
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: "20px", padding: "3px 10px", fontSize: "11px", fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: "5px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function Table({ cols, rows, emptyMsg = "No records found" }) {
  if (!rows.length) return (
    <div style={{ textAlign: "center", padding: "48px", color: "#475569", fontSize: "14px" }}>{emptyMsg}</div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key || c.label} style={{
                textAlign: "left", padding: "10px 14px", color: "#475569",
                fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.05em", borderBottom: "1px solid #1e293b", whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #0f172a" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#1e293b"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              {cols.map((c) => (
                <td key={c.key || c.label} style={{ padding: "12px 14px", color: "#cbd5e1", verticalAlign: "middle" }}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ label, value, sub, color = "#3b82f6" }) {
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
      padding: "20px 24px", display: "flex", flexDirection: "column", gap: "4px",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: "12px", color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

// ─── FORMS ───────────────────────────────────────────────────────────────────

function ProductItemModal({ onSave, onClose, initial, products }) {
const [item, setItem] = useState(initial || { product_id: "", product_name: "", product_code: "", supplier: "", currency: "USD", cost_currency: "USD", quantity: "", unit: "unit", unit_price: "", cost_price: "", total: "" });
const [search, setSearch] = useState(
  initial?.product_code && initial?.product_name
    ? `${initial.product_code} – ${initial.product_name}`
    : initial?.product_name || ""
);
const [showList, setShowList] = useState(false);
const [selectedProduct, setSelectedProduct] = useState(null); // ← adicionar esta linha

  useEffect(() => {
  if (initial?.product_id) {
    const found = products.find(p => p.id === initial.product_id);
    if (found) setSelectedProduct(found);
  }
}, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  
  const calcWeight = (product, quantity) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  const w = parseFloat(product.weight) || 0;
  if (!w || !qty) return null;

  const category = product.category || "";
  const wu = product.weight_unit || "kg";

  // Cálculo complexo apenas para Textile e DTF Film
  if (category === "Textile" || category === "DTF Film") {
    const h = parseFloat(product.height) || 0;
    const width = parseFloat(product.width) || 0;
    if (!h) return null;

    if (wu === "g/m²") {
      const heightM = h * (product.height_unit === "cm" ? 0.01 : product.height_unit === "mm" ? 0.001 : 1);
      const widthM = width * (product.width_unit === "cm" ? 0.01 : product.width_unit === "mm" ? 0.001 : 1);
      return (w / 1000) * widthM * heightM * qty;
    } else if (wu === "g/m") {
      const heightM = h * (product.height_unit === "cm" ? 0.01 : product.height_unit === "mm" ? 0.001 : 1);
      return (w / 1000) * heightM * qty;
    } else if (wu === "g") {
      return (w / 1000) * qty;
    } else if (wu === "kg") {
      return w * qty;
    }
    return null;
  }

  // Cálculo simples para todas as outras categorias
  if (wu === "kg") return w * qty;
  if (wu === "g") return (w / 1000) * qty;
  if (wu === "lb") return w * 0.453592 * qty;
  if (wu === "oz") return w * 0.0283495 * qty;
  return w * qty;
};

const selectProduct = (p) => {
  setSelectedProduct(p);
  setSearch(`${p.code} – ${p.name}`);

  const isTextile = p.category === "Textile" || p.category === "DTF Film";
  const isLiquid = p.category === "Chemical";
  const h = parseFloat(p.height) || 0;
  const heightM = p.height_unit === "cm" ? h * 0.01 : p.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(p);

  const salePrice = isTextile && p.sale_per_meter && heightM
    ? (parseFloat(p.sale_per_meter) * heightM).toFixed(2)
    : isLiquid && p.sale_per_liter && volL
    ? (parseFloat(p.sale_per_liter) * volL).toFixed(2)
    : p.sale_price || p.unit_cost || "";

  const costPrice = isTextile && p.cost_per_meter && heightM
    ? (parseFloat(p.cost_per_meter) * heightM).toFixed(2)
    : isLiquid && p.cost_per_liter && volL
    ? (parseFloat(p.cost_per_liter) * volL).toFixed(2)
    : p.unit_cost || "";

  setItem(prev => ({
    ...prev,
    product_id: p.id,
    product_name: p.name,
    product_code: p.code,
    supplier: p.supplier || "",
    unit: p.unit || "unit",
    currency: p.sale_currency || p.cost_currency || "USD",
    unit_price: salePrice,
    cost_price: costPrice,
    cost_currency: p.cost_currency || "USD",
    total: prev.quantity && salePrice ? (parseFloat(prev.quantity) * parseFloat(salePrice)).toFixed(2) : "",
    category: p.category || "",
    sale_per_meter: isTextile ? (p.sale_per_meter || null) : null,
    cost_per_meter: isTextile ? (p.cost_per_meter || null) : null,
    sale_per_liter: isLiquid ? (p.sale_per_liter || null) : null,
    cost_per_liter: isLiquid ? (p.cost_per_liter || null) : null,
    // Markup % now applies to every category, not just Textile/DTF — and
    // starts from whatever default markup is registered on the product
    // itself (instead of always 0), since it's usually the same standard
    // margin reused quote after quote.
    sale_pct: p.sale_pct != null && p.sale_pct !== "" ? String(p.sale_pct) : "0",
  }));
  setShowList(false);
};
  
const calcMeterage = (product, quantity) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  const h = parseFloat(product.height) || 0;
  if (!h || !qty) return null;
  const heightM = h * (product.height_unit === "cm" ? 0.01 : product.height_unit === "mm" ? 0.001 : 1);
  return heightM * qty;
};

const handleQtyChange = (e) => {
  const qty = e.target.value;
  const total = qty && item.unit_price ? (parseFloat(qty) * parseFloat(item.unit_price)).toFixed(2) : "";
  const weight = selectedProduct ? calcWeight(selectedProduct, qty) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, qty) : null;
  setItem(prev => ({ ...prev, quantity: qty, total, total_weight: weight, total_meterage: meterage }));
};
  
  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <Modal title={initial ? "Edit Product Item" : "Add Product"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Product">
          <div style={{ position: "relative" }}>
            <Input value={search}
              onChange={e => { setSearch(e.target.value); setItem(p => ({ ...p, product_name: e.target.value })); setShowList(true); }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 200)}
              placeholder="Search product…" />
            {showList && filtered.length > 0 && (
              <div style={dropdownStyle}>
                {filtered.map(p => (
                  <div key={p.id} style={dropItemStyle}
                    onMouseDown={() => selectProduct(p)}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{p.code}</span> {p.name}
                    {p.sale_price ? <span style={{ float: "right", color: "#10b981" }}>{p.sale_currency || "USD"} {p.sale_price}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
        <Field label="Unit" half>
  <Select value={item.unit || ""} onChange={e => setItem(p => ({ ...p, unit: e.target.value }))}>
    <option value="">Select...</option>
    {PACKAGE_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
  </Select>
</Field>
        <Field label="Quantity" half>
          <Input type="number" value={item.quantity} onChange={handleQtyChange} placeholder="0" />
        </Field>
        <Field label="Supplier">
          <Input value={item.supplier || ""} onChange={e => setItem(p => ({ ...p, supplier: e.target.value }))} placeholder="Auto-filled from product" />
        </Field>
<Field label={`Cost Price (${item.cost_currency || "USD"})`}>
  <Input type="number" value={item.cost_price || ""} onChange={e => setItem(prev => ({ ...prev, cost_price: e.target.value }))} placeholder="0.00" />
</Field>
<Field label="Total Weight" half>
  <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_weight ? "#10b981" : "#475569", fontWeight: item.total_weight ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
    {item.total_weight ? `${item.total_weight.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : "—"}
  </div>
</Field>
<Field label="Total Meterage" half>
  <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_meterage ? "#60a5fa" : "#475569", fontWeight: item.total_meterage ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
    {item.total_meterage ? `${item.total_meterage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m` : "—"}
  </div>
</Field>
        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => { onSave(item); onClose(); }}>
            {initial ? "Update Item" : "Add Item"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function OrderForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    order_number: "", client: "", supplier: "", value: "", currency: "USD",
    production_lead_time: "", delivery_days: "", shipment_date: "", arrival_date: "",
    incoterm: "", payment_terms: "", port_of_loading: "", port_of_discharge: "",
    acquisition_company: "", container: "", container_qty: "", notes: "",
  });
  const [items, setItems] = useState(initial?.items || []);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [showClientList, setShowClientList] = useState(false);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [showPaymentList, setShowPaymentList] = useState(false);
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);

  useEffect(() => {
    api("/clients").then(setClients);
    api("/suppliers").then(setSuppliers);
    api("/products").then(setProducts);
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const itemsTotal = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
  const [initialLoad, setInitialLoad] = useState(true);

useEffect(() => {
  if (initialLoad) {
    setInitialLoad(false);
    return;
  }
  if (items.length > 0) {
    setF(p => ({ ...p, value: itemsTotal.toFixed(2) }));
  }
}, [itemsTotal]);

  const addItem = (item) => {
    setItems(prev => [...prev, item]);
    setF(p => ({ ...p, value: (parseFloat(p.value || 0) + parseFloat(item.total || 0)).toFixed(2) }));
  };

  const updateItem = (idx, item) => {
    setItems(prev => {
      const updated = [...prev];
      const oldTotal = parseFloat(updated[idx].total) || 0;
      const newTotal = parseFloat(item.total) || 0;
      updated[idx] = item;
      setF(p => ({ ...p, value: (parseFloat(p.value || 0) - oldTotal + newTotal).toFixed(2) }));
      return updated;
    });
  };

  const removeItem = (idx) => {
    setItems(prev => {
      const removed = parseFloat(prev[idx].total) || 0;
      setF(p => ({ ...p, value: Math.max(0, parseFloat(p.value || 0) - removed).toFixed(2) }));
      return prev.filter((_, i) => i !== idx);
    });
  };

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));
  const filteredPayments = PAYMENT_TERMS_OPTIONS.filter(p => p.toLowerCase().includes((f.payment_terms || "").toLowerCase()));

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  const submit = async () => {
    await onSave({ ...f, items });
    onClose();
  };

  return (
    <>
      {itemModal !== null && (
        <ProductItemModal
          products={products}
          initial={editingItemIdx !== null ? items[editingItemIdx] : null}
          onSave={(item) => {
            if (editingItemIdx !== null) { updateItem(editingItemIdx, item); setEditingItemIdx(null); }
            else addItem(item);
          }}
          onClose={() => { setItemModal(null); setEditingItemIdx(null); }}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Order Number" half>
          <Input value={f.order_number} onChange={set("order_number")} placeholder="EXP-2024-001" />
        </Field>

        <Field label="Client" half>
          <div style={{ position: "relative" }}>
            <Input value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
              onFocus={() => setShowClientList(true)}
              onBlur={() => setTimeout(() => setShowClientList(false), 200)}
              placeholder="Search client…" />
            {showClientList && filteredClients.length > 0 && (
              <div style={dropdownStyle}>
                {filteredClients.map(c => (
                  <div key={c.id} style={dropItemStyle}
                    onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {c.company_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Acquisition Company">
  <Select value={f.acquisition_company} onChange={set("acquisition_company")}>
    <option value="">Select...</option>
    <option value="HK">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
    <option value="NINGBO">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
  </Select>
</Field>

        {/* PRODUCTS LIST */}
        <Field label="Products">
          <div style={{ background: "#1e293b", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
            {items.length === 0 && (
              <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No products added yet.</div>
            )}
            {items.map((item, idx) => {
              const product = products.find(p => Number(p.id) === Number(item.product_id));
              return (
                <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                      <span style={{ color: "#f1f5f9", marginLeft: "6px" }}>{item.product_name}</span>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>{item.quantity} {item.unit}</span>
                    </div>
                    <Btn small outline color="#64748b" onClick={() => { setEditingItemIdx(idx); setItemModal("edit"); }}>Edit</Btn>
                    <Btn small outline color="#ef4444" onClick={() => removeItem(idx)}>✕</Btn>
                  </div>
                  {/* The sale price can legitimately differ from whatever's registered
                      on the Product (e.g. carried over custom from a Quotation, or
                      negotiated directly here) — always editable, same as on the
                      Quotation screen. */}
                  <PricingRow item={item} product={product} currency={item.currency || f.currency}
                    onChange={updated => updateItem(idx, updated)} />
                </div>
              );
            })}
            <div style={{ padding: "10px 14px" }}>
              <Btn small color="#3b82f6" onClick={() => { setEditingItemIdx(null); setItemModal("new"); }}>+ Add Product</Btn>
            </div>
          </div>
        </Field>

        {items.length > 0 && (
          <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#64748b", fontSize: "13px" }}>Items Total</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: "18px" }}>{fmt(itemsTotal, f.currency)}</span>
          </div>
        )}

        <Field label="Value" half>
         <Input type="number" value={f.value} onChange={set("value")} placeholder="0.00" />
        </Field>
        <Field label="Currency" half>
          <Select value={f.currency} onChange={set("currency")}>
            <option>USD</option><option>EUR</option><option>BRL</option><option>CNY</option>
          </Select>
        </Field>
        <Field label="Prod. Lead Time (days)" half>
          <Input type="number" value={f.production_lead_time} onChange={set("production_lead_time")} />
        </Field>
        <Field label="Delivery Days (after TT payment)" half>
          <Input type="number" value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
        </Field>
        <Field label="Incoterm" half>
          <Select value={f.incoterm} onChange={set("incoterm")}>
            <option value="">Select...</option>
            {["FOB","CIF","CFR","EXW","DAP","DDP","FCA"].map(t => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Container" half>
  <div style={{ display: "flex", gap: "8px" }}>
    <Select value={f.container} onChange={set("container")} style={{ ...inputStyle, flex: 2, cursor: "pointer" }}>
      <option value="">Select...</option>
      <option>20' Standard</option>
      <option>40' High Cube</option>
      <option>40' Standard</option>
    </Select>
    <Input type="number" value={f.container_qty || ""} onChange={set("container_qty")} placeholder="Qty" style={{ ...inputStyle, flex: 1 }} />
  </div>
</Field>

        <Field label="Port of Loading" half>
          <PortAutocomplete value={f.port_of_loading} options={CHINA_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_loading: v }))}
            placeholder="Search China ports or type any…" />
        </Field>

        <Field label="Port of Discharge" half>
          <PortAutocomplete value={f.port_of_discharge} options={BRAZIL_PORTS_OPTIONS}
            onChange={v => setF(p => ({ ...p, port_of_discharge: v }))}
            placeholder="Search Brazil ports or type any…" />
        </Field>

        <Field label="Shipment Date" half>
          <Input type="date" value={f.shipment_date} onChange={set("shipment_date")} />
        </Field>
        <Field label="Arrival Date" half>
          <Input type="date" value={f.arrival_date} onChange={set("arrival_date")} />
        </Field>

        <Field label="Payment Terms">
          <div style={{ position: "relative" }}>
            <Input value={f.payment_terms}
              onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
              onFocus={() => setShowPaymentList(true)}
              onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
              placeholder="Search or type payment terms…" />
            {showPaymentList && filteredPayments.length > 0 && (
              <div style={dropdownStyle}>
                {filteredPayments.map((pt, i) => (
                  <div key={i} style={dropItemStyle}
                    onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{pt}</div>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Notes">
          <Textarea value={f.notes} onChange={set("notes")} />
        </Field>

        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit}>Save Order</Btn>
        </div>
      </div>
    </>
  );
}

function ProductForm({ initial, onSave, onClose }) {
const [f, setF] = useState(initial || {
  code: "", name: "", description: "", unit: "unit", ncm: "", hs_code: "", color: "",
  width: "", width_unit: "cm",
  height: "", height_unit: "cm",
  thickness: "", thickness_unit: "mm",
  weight: "", weight_unit: "kg",
  volume: "", volume_unit: "L",
  unit_cost: "", cost_currency: "USD",
  sale_price: "", sale_currency: "USD", sale_pct: "",
  cost_per_meter: "", sale_per_meter: "",
  cost_per_liter: "", sale_per_liter: "",
  category: "", supplier: "",
});
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  if (Array.isArray(initial.media)) return initial.media;
  try { return JSON.parse(initial.media); } catch { return []; }
});
const [uploading, setUploading] = useState(false);
const [lightbox, setLightbox] = useState(null);

const handleUpload = async (e) => {
  const files = Array.from(e.target.files);
  setUploading(true);
  try {
    const results = await Promise.all(files.map(uploadToCloudinary));
    setMedia(prev => [...prev, ...results.filter(Boolean)]);
  } catch(err) { alert("Upload failed: " + err.message); }
  setUploading(false);
};

  useEffect(() => {
    api("/suppliers").then(setSuppliers);
  }, []);

  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

const handleCostChange = (e) => {
  const cost = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  const cpm = heightM > 0 ? (cost / heightM).toFixed(4) : f.cost_per_meter;
  const cpl = volL > 0 ? (cost / volL).toFixed(4) : f.cost_per_liter;
  setF((p) => ({
    ...p, unit_cost: e.target.value,
    cost_per_meter: heightM > 0 ? cpm : p.cost_per_meter,
    cost_per_liter: volL > 0 ? cpl : p.cost_per_liter,
  }));
};

  // Markup % here works the same way it does on the Quotation screen: a
  // registered base (Cost Price, since that's the one fixed anchor on this
  // form) with `sale = base * (1 + pct/100)`, kept in sync both ways.
  const pctFromCost = (sale) => {
    const cost = parseFloat(f.unit_cost) || 0;
    return cost > 0 ? (((sale / cost) - 1) * 100).toFixed(2) : f.sale_pct;
  };

  const handleSalePriceChange = (e) => {
  const sale = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  const cost = parseFloat(f.unit_cost) || 0;
  const spm = heightM > 0 ? (sale / heightM).toFixed(4) : f.sale_per_meter;
  const spl = volL > 0 ? (sale / volL).toFixed(4) : f.sale_per_liter;
  setF((p) => ({
    ...p, sale_price: e.target.value,
    sale_per_meter: heightM > 0 ? spm : p.sale_per_meter,
    sale_per_liter: volL > 0 ? spl : p.sale_per_liter,
    sale_pct: cost > 0 ? pctFromCost(sale) : p.sale_pct,
  }));
};

const handleSalePctChange = (e) => {
  const pctStr = e.target.value;
  const pct = parseFloat(pctStr);
  const cost = parseFloat(f.unit_cost) || 0;
  const canCalc = cost > 0 && !isNaN(pct);
  const sale = canCalc ? cost * (1 + pct / 100) : null;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  setF((p) => ({
    ...p, sale_pct: pctStr,
    sale_price: canCalc ? sale.toFixed(2) : p.sale_price,
    sale_per_meter: canCalc && heightM > 0 ? (sale / heightM).toFixed(4) : p.sale_per_meter,
    sale_per_liter: canCalc && volL > 0 ? (sale / volL).toFixed(4) : p.sale_per_liter,
  }));
};

const handleCostPerMeterChange = (e) => {
  const cpm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const unit_cost = (cpm * heightM).toFixed(2);
  setF((p) => ({ ...p, cost_per_meter: e.target.value, unit_cost: heightM > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerMeterChange = (e) => {
  const spm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const sale_price = (spm * heightM).toFixed(2);
  const cost = parseFloat(f.unit_cost) || 0;
  setF((p) => ({
    ...p, sale_per_meter: e.target.value,
    sale_price: heightM > 0 ? sale_price : p.sale_price,
    sale_pct: heightM > 0 && cost > 0 ? pctFromCost(parseFloat(sale_price)) : p.sale_pct,
  }));
};

const handleCostPerLiterChange = (e) => {
  const cpl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const unit_cost = (cpl * volL).toFixed(2);
  setF((p) => ({ ...p, cost_per_liter: e.target.value, unit_cost: volL > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerLiterChange = (e) => {
  const spl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const sale_price = (spl * volL).toFixed(2);
  const cost = parseFloat(f.unit_cost) || 0;
  setF((p) => ({
    ...p, sale_per_liter: e.target.value,
    sale_price: volL > 0 ? sale_price : p.sale_price,
    sale_pct: volL > 0 && cost > 0 ? pctFromCost(parseFloat(sale_price)) : p.sale_pct,
  }));
};

  const currencies = ["USD", "BRL", "CNY", "EUR", "GBP", "JPY"];

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Product Code" half><Input value={f.code} onChange={set("code")} placeholder="PROD-001" /></Field>
      <Field label="Name" half><Input value={f.name} onChange={set("name")} /></Field>
      <Field label="NCM" half><Input value={f.ncm} onChange={set("ncm")} placeholder="0000.00.00" /></Field>
      <Field label="HS Code" half><Input value={f.hs_code || ""} onChange={set("hs_code")} placeholder="0000.00" /></Field>
      <Field label="Color" half><Input value={f.color || ""} onChange={set("color")} placeholder="e.g. Red, Navy Blue" /></Field>
      <Field label="Category" half>
  <Select value={f.category} onChange={set("category")}>
    <option value="">Select...</option>
    {["Textile","Machine","DTF Film","Chemical","Accessory","Packaging","Other"].map(c => <option key={c}>{c}</option>)}
  </Select>
</Field>

      <Field label="Supplier" half>
        <div style={{ position: "relative" }}>
          <Input
            value={supplierSearch}
            onChange={e => { setSupplierSearch(e.target.value); setF(p => ({ ...p, supplier: e.target.value })); setShowSupplierList(true); }}
            onFocus={() => setShowSupplierList(true)}
            onBlur={() => setTimeout(() => setShowSupplierList(false), 200)}
            placeholder="Search supplier…"
          />
          {showSupplierList && filteredSuppliers.length > 0 && (
            <div style={dropdownStyle}>
              {filteredSuppliers.map(s => (
                <div key={s.id} style={dropItemStyle}
                  onMouseDown={() => { setSupplierSearch(s.company_name); setF(p => ({ ...p, supplier: s.company_name })); setShowSupplierList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {s.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label="Package" half>
  <Select value={f.unit} onChange={set("unit")}>
    <option value="">Select...</option>
    {PACKAGE_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
  </Select>
</Field>

<Field label="Width" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.width} onChange={set("width")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.width_unit} onChange={set("width_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label="Height" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.height || ""} onChange={set("height")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.height_unit || "cm"} onChange={set("height_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label="Thickness" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.thickness || ""} onChange={set("thickness")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.thickness_unit || "mm"} onChange={set("thickness_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
      {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>
<Field label="Weight" half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.weight || ""} onChange={set("weight")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.weight_unit || "kg"} onChange={set("weight_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
      {["kg","g","g/m","g/m²","lb","oz"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>

{f.category === "Chemical" && (
  // Full-width on purpose: a conditional `half` field here would eat one
  // slot of the 2-column grid and throw off every Cost/Sale pair that
  // follows (whichever field lands next would silently swap from the left
  // column to the right one, and vice versa).
  <Field label="Volume (per package)">
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.volume || ""} onChange={set("volume")} placeholder="e.g. 200 for a 200L drum" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.volume_unit || "L"} onChange={set("volume_unit")} style={{ ...inputStyle, width: "80px", cursor: "pointer" }}>
        {["mL","L","gal"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

{/* Cost and Sale fields laid out as two explicit columns (their own grid,
    spanning the full width of the outer form grid) so "Cost X" always sits
    on the left and "Sale X" always sits on the right, regardless of which
    conditional per-meter/per-liter rows are showing for the category. */}
<div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <Field label="Cost Currency">
      <Select value={f.cost_currency} onChange={set("cost_currency")}>
        {currencies.map(c => <option key={c}>{c}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Cost per Meter">
        <Input type="number" value={f.cost_per_meter || ""} onChange={handleCostPerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (
      <Field label="Cost per Liter">
        <Input type="number" value={f.cost_per_liter || ""} onChange={handleCostPerLiterChange} placeholder="0.00" />
      </Field>
    )}
    <Field label="Cost Price">
      <Input type="number" value={f.unit_cost} onChange={handleCostChange} placeholder="0.00" />
    </Field>
  </div>
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <Field label="Sale Currency">
      <Select value={f.sale_currency || "USD"} onChange={set("sale_currency")}>
        {currencies.map(c => <option key={c}>{c}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Sale per Meter">
        <Input type="number" value={f.sale_per_meter || ""} onChange={handleSalePerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (
      <Field label="Sale per Liter">
        <Input type="number" value={f.sale_per_liter || ""} onChange={handleSalePerLiterChange} placeholder="0.00" />
      </Field>
    )}
    <Field label="Sale Price">
      <Input type="number" value={f.sale_price || ""} onChange={handleSalePriceChange} placeholder="0.00" />
    </Field>
    <Field label="Markup %">
      <Input type="number" value={f.sale_pct || ""} onChange={handleSalePctChange} placeholder="e.g. 15" />
    </Field>
  </div>
</div>

      <Field label="Description"><Textarea value={f.description} onChange={set("description")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Field label="Photos / Files">
  <div>
    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
      {uploading ? "⏳ Uploading..." : "📎 Add Photos / Files"}
      <input type="file" multiple accept="image/*,application/pdf,video/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
    </label>
    {lightbox && (
      <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
          <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
        ) : (
          <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
        )}
        <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
      </div>
    )}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {media.filter(Boolean).map((item, i) => {
        const url = typeof item === 'string' ? item : item.url;
        const name = typeof item === 'string' ? url.split('/').pop() : item.name;
        return (
          <div key={i} style={{ position: "relative" }}>
            {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
              <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
            ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
              <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
            ) : (
              <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
            )}
            <button onClick={async () => { const res = await fetch(url); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
            <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        );
      })}
    </div>
  </div>
</Field>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave({ ...f, media: JSON.stringify(media) }); onClose(); }}>Save Product</Btn>
      </div>
    </div>
  );
}

function SampleForm({ onSave, onClose, initial }) {
const [f, setF] = useState(initial || { code: "", product_name: "", category: "", client: "", requested_date: "", status: "Requested", notes: "" });
const [clients, setClients] = useState([]);
const [clientSearch, setClientSearch] = useState(initial?.client || "");
const [showClientList, setShowClientList] = useState(false);
const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
const [uploading, setUploading] = useState(false);
const [lightbox, setLightbox] = useState(null);
  
const handleUpload = async (e) => {
  const files = Array.from(e.target.files);
  setUploading(true);
  try {
const results = await Promise.all(files.map(uploadToCloudinary));
const validResults = results.filter(Boolean);
setMedia(prev => [...prev, ...validResults]);
  } catch(err) {
    alert("Upload failed: " + err.message);
  }
  setUploading(false);
};
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  useEffect(() => { api("/clients").then(setClients); }, []);

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Code" half><Input value={f.code} onChange={set("code")} placeholder="SMP-001" /></Field>
      <Field label="Category" half>
        <Select value={f.category} onChange={set("category")}>
          <option value="">Select...</option>
          {["Textile","Machine","DTF Film","Chemical","Accessory","Packaging","Other"].map(c => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Product Name"><Input value={f.product_name} onChange={set("product_name")} /></Field>
      <Field label="Client" half>
        <div style={{ position: "relative" }}>
          <Input value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
            onFocus={() => setShowClientList(true)}
            onBlur={() => setTimeout(() => setShowClientList(false), 200)}
            placeholder="Search client…" />
          {showClientList && filteredClients.length > 0 && (
            <div style={dropdownStyle}>
              {filteredClients.map(c => (
                <div key={c.id} style={dropItemStyle}
                  onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {c.company_name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Requested Date" half><Input type="date" value={f.requested_date} onChange={set("requested_date")} /></Field>
      <Field label="Sent Date" half><Input type="date" value={f.sent_date || ""} onChange={set("sent_date")} /></Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {SAMPLE_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

<div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
  <Field label="Photos / Videos">
  <div style={{ gridColumn: "span 2" }}>
    <label style={{
      display: "inline-flex", alignItems: "center", gap: "8px",
      background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
      padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8",
      marginBottom: "12px",
    }}>
      {uploading ? "⏳ Uploading..." : "📎 Add Photos / Videos"}
      <input type="file" multiple accept="image/*,video/*" onChange={handleUpload}
        style={{ display: "none" }} disabled={uploading} />
    </label>
    {media.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
{lightbox && (
  <div onClick={() => setLightbox(null)} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
  }}>
    {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
      <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
    ) : (
      <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
    )}
    <button onClick={() => setLightbox(null)} style={{
      position: "fixed", top: "20px", right: "20px", background: "#ef4444",
      border: "none", borderRadius: "50%", width: "36px", height: "36px",
      color: "#fff", fontSize: "18px", cursor: "pointer"
    }}>✕</button>
  </div>
)}

{media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
      </div>
    )}
  </div>
</Field>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave({ ...f, media: JSON.stringify(media) }); onClose(); }}>Save Sample</Btn>
      </div>
    </div>
  );
}

function ProformaForm({ onSave, onClose, orders, initial }) {
  const [f, setF] = useState(initial || {
    order_id: "", number: "", issue_date: "", validity: "", client: "", total: "", currency: "USD", status: "Draft", notes: "",
    acquisition_company: "", incoterm: "", way_of_shipment: "By Sea", port_of_loading: "", port_of_discharge: "",
    payment_terms: "", production_days: "", delivery_days: "",
  });
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const filteredPayments = PAYMENT_TERMS_OPTIONS.filter(p => p.toLowerCase().includes((f.payment_terms || "").toLowerCase()));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Proforma Number" half><Input value={f.number} onChange={set("number")} placeholder="PI-2024-001" /></Field>
      <Field label="Client" half><Input value={f.client} onChange={set("client")} /></Field>
      <Field label="Issue Date" half><Input type="date" value={f.issue_date} onChange={set("issue_date")} /></Field>
      <Field label="Validity Date" half><Input type="date" value={f.validity} onChange={set("validity")} /></Field>
      <Field label="Total Amount" half>
  <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
</Field>
<Field label="Currency" half>
  <input value={f.currency} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
</Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Sent","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Shipment Details (for PDF)
      </div>
      <Field label="Acquisition Company" half>
        <Select value={f.acquisition_company} onChange={set("acquisition_company")}>
          <option value="">Select...</option>
          <option value="HK">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
          <option value="NINGBO">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
        </Select>
      </Field>
      <Field label="Incoterm" half>
        <Select value={f.incoterm} onChange={set("incoterm")}>
          <option value="">Select...</option>
          {["FOB","CIF","CFR","EXW","DAP","DDP","FCA"].map(t => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Way of Shipment" half>
        <Select value={f.way_of_shipment} onChange={set("way_of_shipment")}>
          <option>By Sea</option><option>By Air</option><option>By Land</option>
        </Select>
      </Field>
      <Field label="Port of Loading" half>
        <PortAutocomplete value={f.port_of_loading} options={CHINA_PORTS_OPTIONS}
          onChange={v => setF(p => ({ ...p, port_of_loading: v }))}
          placeholder="Search China ports or type any…" />
      </Field>
      <Field label="Port of Discharge" half>
        <PortAutocomplete value={f.port_of_discharge} options={BRAZIL_PORTS_OPTIONS}
          onChange={v => setF(p => ({ ...p, port_of_discharge: v }))}
          placeholder="Search Brazil ports or type any…" />
      </Field>

      <Field label="Payment Terms">
        <div style={{ position: "relative" }}>
          <Input value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…" />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={PORT_DROPDOWN_STYLE}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={PORT_DROP_ITEM_STYLE}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{pt}</div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="End of Production (days after TT payment)" half>
        <Input type="number" value={f.production_days || ""} onChange={set("production_days")} placeholder="28" />
      </Field>
      <Field label="Delivery at Port (days after TT payment)" half>
        <Input type="number" value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
      </Field>

      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {f.id && <Btn outline color="#10b981" onClick={() => window.open(`${API}/proformas/${f.id}/pdf`, "_blank")}>📄 Download PDF</Btn>}
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Proforma</Btn>
      </div>
    </div>
  );
}

function ContractForm({ onSave, onClose, orders, initial }) {
  const [f, setF] = useState(initial || { order_id: "", contract_number: "", supplier: "", sign_date: "", delivery_date: "", total: "", currency: "USD", status: "Draft", notes: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Contract Number" half><Input value={f.contract_number} onChange={set("contract_number")} placeholder="SC-2024-001" /></Field>
      <Field label="Supplier" half><Input value={f.supplier} onChange={set("supplier")} /></Field>
      <Field label="Sign Date" half><Input type="date" value={f.sign_date} onChange={set("sign_date")} /></Field>
      <Field label="Delivery Date" half><Input type="date" value={f.delivery_date} onChange={set("delivery_date")} /></Field>
      <Field label="Total Amount" half>
        <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Currency" half>
        <input value={f.currency} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

      {(f._items || (f.items_json ? JSON.parse(f.items_json) : [])).length > 0 && (
        <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px" }}>
          <div style={{ fontSize: "11px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Products in this contract</div>
          {(f._items || (f.items_json ? JSON.parse(f.items_json) : [])).map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b", fontSize: "13px" }}>
              <div>
                <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                <span style={{ color: "#f1f5f9", marginLeft: "8px", fontWeight: 600 }}>{item.product_name}</span>
                <span style={{ color: "#64748b", marginLeft: "8px" }}>{item.quantity} {item.unit}</span>
                {perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency) && (
                  <span style={{ color: "#a78bfa", marginLeft: "8px", fontSize: "11px" }}>({perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency)})</span>
                )}
              </div>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{item.cost_currency || item.currency} {parseFloat(item.cost_price || item.unit_price).toFixed(2)} × {item.quantity} = {fmt(parseFloat((item.cost_price || item.unit_price) * item.quantity), item.cost_currency || item.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); }}>Save Contract</Btn>
      </div>
    </div>
  );
}
  
function FinForm({ type, onSave, onClose, orders, initial }) {
  const isClient = type === "client";
  const [f, setF] = useState(initial || {
    order_id: "", [isClient ? "client" : "supplier"]: "", description: "",
    type: isClient ? "Invoice" : "Purchase Order",
    amount: "", currency: "USD", due_date: "", status: "Pending", notes: "",
    payer: "", payment_method: "网银汇款 Online bank payment", applicant: "", approved_by: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const party = isClient ? "client" : "supplier";
  const txTypes = isClient
    ? ["Invoice", "Down Payment", "Balance", "Commission", "Refund"]
    : ["Purchase Order", "Deposit", "Final Payment", "Freight", "Other"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label={isClient ? "Client" : "Supplier"} half>
        <Input value={f[party]} onChange={set(party)} />
      </Field>
      <Field label="Type" half>
        <Select value={f.type} onChange={set("type")}>
          {txTypes.map(t => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Amount" half><Input type="number" value={f.amount} onChange={set("amount")} /></Field>
      <Field label="Currency" half>
        <Select value={f.currency} onChange={set("currency")}>
          <option>USD</option><option>EUR</option><option>BRL</option>
        </Select>
      </Field>
      <Field label="Due Date" half><Input type="date" value={f.due_date} onChange={set("due_date")} /></Field>
      <Field label="Description"><Input value={f.description} onChange={set("description")} /></Field>
      {!isClient && (
        <>
          <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Payment Notice
          </div>
          <Field label="Payer (付款单位)" half><Input value={f.payer} onChange={set("payer")} placeholder="e.g. Ningbo World Alliance" /></Field>
          <Field label="Payment Method" half>
            <Select value={f.payment_method} onChange={set("payment_method")}>
              <option value="网银汇款 Online bank payment">网银汇款 Online bank payment</option>
              <option value="电汇 Wire transfer">电汇 Wire transfer</option>
            </Select>
          </Field>
          <Field label="Applicant (申请人)" half><Input value={f.applicant} onChange={set("applicant")} /></Field>
          <Field label="Approved By (审批人)" half><Input value={f.approved_by} onChange={set("approved_by")} /></Field>
        </>
      )}
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {!isClient && f.id && <Btn outline color="#10b981" onClick={() => window.open(`${API}/financial/suppliers/${f.id}/payment-notice-pdf`, "_blank")}>📄 Payment Notice PDF</Btn>}
        <Btn color={isClient ? "#3b82f6" : "#8b5cf6"} onClick={async () => { await onSave(f); onClose(); }}>Save</Btn>
      </div>
    </div>
  );
}

function QuotationForm({ onSave, onClose, initial }) {
  const [f, setF] = useState(initial || {
  number: "", client: "", currency: "USD", deadline: "",
  total: "",
  specifications: "", notes: "", status: "Pending",
});
  const [items, setItems] = useState(Array.isArray(initial?.items) ? initial.items : []);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [showClientList, setShowClientList] = useState(false);
  const [products, setProducts] = useState([]);
  const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);

  useEffect(() => {
    api("/clients").then(setClients);
    api("/products").then(setProducts);
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const itemsTotal = items.reduce((sum, i) => sum + (parseLocaleNumber(i.total) || 0), 0);
const [initialLoad, setInitialLoad] = useState(true);
useEffect(() => {
  if (initialLoad) { setInitialLoad(false); return; }
  if (items.length > 0) setF(p => ({ ...p, total: itemsTotal.toFixed(2) }));
}, [itemsTotal]);

  const addItem = (item) => setItems(prev => [...prev, item]);
  const updateItem = (idx, item) => setItems(prev => { const u = [...prev]; u[idx] = item; return u; });
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
const results = await Promise.all(files.map(uploadToCloudinary));
setMedia(prev => [...prev, ...results.filter(Boolean)]);
    } catch(err) { alert("Upload failed: " + err.message); }
    setUploading(false);
  };

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <>
      {itemModal !== null && (
        <ProductItemModal
          products={products}
          initial={editingItemIdx !== null ? items[editingItemIdx] : null}
          onSave={(item) => {
            if (editingItemIdx !== null) { updateItem(editingItemIdx, item); setEditingItemIdx(null); }
            else addItem(item);
          }}
          onClose={() => { setItemModal(null); setEditingItemIdx(null); }}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Field label="Number" half><Input value={f.number} onChange={set("number")} placeholder="QT-2024-001" /></Field>
        <Field label="Status" half>
          <Select value={f.status} onChange={set("status")}>
            {["Pending","Sent","Received","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
          </Select>
        </Field>

        <Field label="Client" half>
          <div style={{ position: "relative" }}>
            <Input value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
              onFocus={() => setShowClientList(true)}
              onBlur={() => setTimeout(() => setShowClientList(false), 200)}
              placeholder="Search client…" />
            {showClientList && filteredClients.length > 0 && (
              <div style={dropdownStyle}>
                {filteredClients.map(c => (
                  <div key={c.id} style={dropItemStyle}
                    onMouseDown={() => { setClientSearch(c.company_name); setF(p => ({ ...p, client: c.company_name })); setShowClientList(false); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    {c.company_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label="Deadline" half><Input type="date" value={f.deadline} onChange={set("deadline")} /></Field>

        <Field label="Products">
          <div style={{ background: "#1e293b", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
            {items.length === 0 && (
              <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No products added yet.</div>
            )}
            {items.map((item, idx) => {
              const product = products.find(p => Number(p.id) === Number(item.product_id));
              const onTargetField = (e) => updateItem(idx, { ...item, target_price: e.target.value });
              const onTargetUnitField = (e) => updateItem(idx, { ...item, target_price_unit: e.target.value });
              return (
                <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                      <span style={{ color: "#f1f5f9", marginLeft: "6px" }}>{item.product_name}</span>
                      <span style={{ color: "#64748b", marginLeft: "8px" }}>{item.quantity} {item.unit}</span>
                    </div>
                    <Btn small outline color="#64748b" onClick={() => { setEditingItemIdx(idx); setItemModal("edit"); }}>Edit</Btn>
                    <Btn small outline color="#ef4444" onClick={() => removeItem(idx)}>✕</Btn>
                  </div>
                  <PricingRow item={item} product={product} currency={item.currency || f.currency}
                    onChange={updated => updateItem(idx, updated)} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginTop: "8px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b" }}>Target Price
                      <input type="text" inputMode="decimal" value={item.target_price ?? ""} onChange={onTargetField}
                        placeholder="0,00"
                        style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
                    </label>
                    <select value={item.target_price_unit || "total"} onChange={onTargetUnitField}
                      style={{ ...inputStyle, padding: "6px 8px", fontSize: "12px", width: "auto" }}>
                      {targetPriceUnitOptions(item).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
            <div style={{ padding: "10px 14px" }}>
              <Btn small color="#3b82f6" onClick={() => { setEditingItemIdx(null); setItemModal("new"); }}>+ Add Product</Btn>
            </div>
          </div>
        </Field>

        {items.length > 0 && (
  <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: "#64748b", fontSize: "13px" }}>Items Total</span>
    <span style={{ color: "#10b981", fontWeight: 700, fontSize: "18px" }}>{fmt(itemsTotal, f.currency)}</span>
  </div>
)}

        <Field label="Currency" half>
  <Select value={f.currency} onChange={e => {
    // The quotation's Currency is the one that ends up on the Proforma/PDF —
    // keep every item's own currency in sync with it, otherwise items stay
    // labeled in whatever currency their product was registered in while
    // the total silently gets relabeled with the new symbol (no real
    // conversion happens; this just keeps the numbers and labels honest).
    const cur = e.target.value;
    setF(p => ({ ...p, currency: cur }));
    setItems(prev => prev.map(i => ({ ...i, currency: cur })));
  }}>
    {["USD","EUR","BRL","CNY"].map(c => <option key={c}>{c}</option>)}
  </Select>
</Field>
<Field label="Specifications"><Textarea value={f.specifications || ""} onChange={set("specifications")} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

        <Field label="Photos / Videos">
          <div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
              {uploading ? "⏳ Uploading..." : "📎 Add Photos / Videos"}
              <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
            </label>
            {lightbox && (
              <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {lightbox.match(/\.(mp4|mov|avi|webm)$/i) ? (
                  <video src={lightbox} controls style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px" }} onClick={e => e.stopPropagation()} />
                ) : (
                  <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
                )}
                <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
            </div>
          </div>
        </Field>

        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={async () => {
            // Normalize any BR-formatted text ("1.000,00") typed into the
            // inline Markup %/Value-per-Meter/Total fields into plain
            // numbers before saving, so downstream displays (which use
            // parseFloat) stay correct.
            const cleanedItems = items.map(item => ({
              ...item,
              total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
              unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
              sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
              sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
              sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
              target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
            }));
            await onSave({ ...f, items: JSON.stringify(cleanedItems), media: JSON.stringify(media) });
            onClose();
          }}>Save Quotation</Btn>
        </div>
      </div>
    </>
  );
}
function Quotations() {
const [proformas, setProformas] = useState([]);
const [proformaModal, setProformaModal] = useState(null);
const [editProforma, setEditProforma] = useState(null);
const [quotations, setQuotations] = useState([]);
const [modal, setModal] = useState(false);
const [editing, setEditing] = useState(null);
const [search, setSearch] = useState("");
const [orders, setOrders] = useState([]);
  const load = useCallback(async () => {
  try {
    console.log('loading quotations...');
const [quotations, orders, proformas] = await Promise.all([
  api("/quotations"),
  api("/orders"),
  api("/proformas"),
]);
setProformas(proformas);
    setQuotations(quotations || []);
console.log('quotations set:', quotations?.length);
    setOrders(orders || []);
  } catch(e) {
    console.error('load error:', e);
  }
}, []);
    useEffect(() => { load(); }, [load]);
  
  const filtered = quotations.filter(q =>
    (q.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.product_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (q.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Quotations</h2>
        <Btn onClick={() => setModal(true)}>+ New Quotation</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, product, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title="New Quotation" onClose={() => setModal(false)} wide>
          <QuotationForm onSave={b => api("/quotations", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
  <Modal title="Edit Quotation" onClose={() => setEditing(null)} wide>
    <QuotationForm initial={{
      ...editing,
      items: editing.items ? (typeof editing.items === 'string' ? JSON.parse(editing.items) : editing.items) : [],
      media: editing.media ? (typeof editing.media === 'string' ? JSON.parse(editing.media) : editing.media) : [],
    }} onSave={async b => { await api(`/quotations/${editing.id}`, "PUT", b); load(); }} onClose={() => setEditing(null)} />
  </Modal>
)}

      {proformaModal && (
  <Modal title="Generate Proforma" onClose={() => setProformaModal(null)} wide>
    <ProformaForm
      orders={[]}
      initial={proformaModal}
      onSave={async b => { await api("/proformas", "POST", b); setProformaModal(null); load(); }}
      onClose={() => setProformaModal(null)}
    />
  </Modal>
)}
{editProforma && (
  <Modal title="Edit Proforma" onClose={() => setEditProforma(null)} wide>
    <ProformaForm
      orders={[]}
      initial={editProforma}
      onSave={async b => { await api(`/proformas/${editProforma.id}`, "PUT", b); setEditProforma(null); load(); }}
      onClose={() => setEditProforma(null)}
    />
  </Modal>
)}
      <Table
        cols={[
          { label: "Number", render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Product", key: "product_name" },
          { label: "Client", key: "client" },
          { label: "Suppliers", render: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const suppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))];
    return suppliers.length > 0 ? suppliers.join(", ") : "—";
  } catch { return "—"; }
}},
          { label: "Qty", render: r => `${r.quantity || "—"} ${r.unit || ""}` },
          { label: "Target Price", render: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const withTarget = items.filter(i => i.target_price !== "" && i.target_price != null);
    if (withTarget.length === 0) return "—";
    const label = i => `${fmt(parseFloat(i.target_price), r.currency)}${targetPriceUnitSuffix(i)}`;
    return withTarget.length > 1 ? `${label(withTarget[0])} +${withTarget.length - 1}` : label(withTarget[0]);
  } catch { return "—"; }
}},
          { label: "Total", render: r => {
  try {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const total = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    return total > 0 ? fmt(total, r.currency) : "—";
  } catch { return "—"; }
}},
          { label: "Deadline", render: r => fmtDate(r.deadline) },
          { label: "Status", render: r => (
            <select value={r.status}
              onChange={async e => { await api(`/quotations/${r.id}`, "PUT", { ...r, status: e.target.value }); load(); }}
              style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
              {["Pending","Sent","Received","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
            </select>
          )},
         { label: "Actions", render: r => {
  const hasProforma = proformas.find(p => Number(p.quotation_id) === Number(r.id));
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={hasProforma ? "#f59e0b" : "#475569"}
        onClick={() => hasProforma ? setEditProforma(hasProforma) : setProformaModal({
  quotation_id: r.id,
  order_id: null,
  number: `PI-${r.number}-${Date.now().toString().slice(-4)}`,
          client: r.client || "",
          issue_date: new Date().toISOString().slice(0, 10),
          validity: "",
          total: r.total || "",
          currency: r.currency || "USD",
          status: "Draft",
          notes: r.notes || "",
        })}>
        📋 {hasProforma ? "Proforma ✓" : "Proforma"}
      </Btn>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/quotations/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  );
}},
        ]}
        rows={filtered}
        emptyMsg="No quotations yet."
      />
    </div>
  );
}

// ─── SECTION COMPONENTS ───────────────────────────────────────────────────────

      
function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData); }, []);
  if (!data) return <div style={{ color: "#475569", padding: "40px", textAlign: "center" }}>Loading...</div>;

  const orderStatuses = ["Pending", "In Production", "Inspection", "Shipment", "Completed"];
  const statusColors = { Pending: "#64748b", "In Production": "#3b82f6", Inspection: "#f59e0b", Shipment: "#10b981", Completed: "#8b5cf6" };
  const statusMap = Object.fromEntries(data.orderStats.map(s => [s.status, s]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Order Status Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
        {orderStatuses.map(status => (
          <StatCard key={status} label={status} value={statusMap[status]?.count || 0} color={statusColors[status]} />
        ))}
      </div>

      {/* Financial Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💰 Client Receivables</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatCard label="Pending Invoices" value={data.clientFinancial?.pending || 0} color="#f59e0b" />
            <StatCard label="Paid Invoices" value={data.clientFinancial?.received || 0} color="#10b981" />
          </div>
        </div>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>📦 Supplier Payables</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatCard label="Active Contracts" value={data.supplierFinancial?.pending || 0} color="#f59e0b" />
            <StatCard label="Completed" value={data.supplierFinancial?.paid || 0} color="#10b981" />
          </div>
        </div>
      </div>

      {/* Pending Orders */}
      {data.pendingOrders?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>📋 Pending Orders</h3>
          <Table
            cols={[
              { label: "Order #", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.order_number}</span> },
              { label: "Client", key: "client" },
              { label: "Value", render: r => fmt(r.value, r.currency) },
              { label: "Shipment", render: r => fmtDate(r.shipment_date) },
            ]}
            rows={data.pendingOrders}
          />
        </div>
      )}

      {/* Pending Quotations */}
      {data.pendingQuotations?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💬 Pending Quotations</h3>
          <Table
            cols={[
              { label: "Number", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Client", key: "client" },
              { label: "Total", render: r => r.total ? fmt(r.total, r.currency) : "—" },
              { label: "Deadline", render: r => fmtDate(r.deadline) },
            ]}
            rows={data.pendingQuotations}
          />
        </div>
      )}

      {/* Pending Commercial Invoices */}
      {data.pendingCommercials?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🧾 Pending Commercial Invoices</h3>
          <Table
            cols={[
              { label: "Number", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Client", key: "client" },
              { label: "Total", render: r => fmt(r.total, r.currency) },
              { label: "Issue Date", render: r => fmtDate(r.issue_date) },
            ]}
            rows={data.pendingCommercials}
          />
        </div>
      )}

      {/* Pending Inspections */}
      {data.pendingInspections?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🔍 Pending Inspections</h3>
          <Table
            cols={[
              { label: "Number", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.number}</span> },
              { label: "Inspector", key: "inspector" },
              { label: "Date", render: r => fmtDate(r.inspection_date) },
            ]}
            rows={data.pendingInspections}
          />
        </div>
      )}

      {/* Active Contracts */}
      {data.activeContracts?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🤝 Active Contracts</h3>
          <Table
            cols={[
              { label: "Contract #", render: r => <span style={{ fontWeight: 600, color: "#a78bfa" }}>{r.contract_number}</span> },
              { label: "Supplier", key: "supplier" },
              { label: "Total", render: r => fmt(r.total, r.currency) },
              { label: "Status", key: "status" },
              { label: "Delivery", render: r => fmtDate(r.delivery_date) },
            ]}
            rows={data.activeContracts}
          />
        </div>
      )}

    </div>
  );
}
      
function PackingListForm({ initial, onSave, onClose, onDelete }) {
  const [f, setF] = useState(() => ({
    ...initial,
    _items: initial._items || (initial.items_json ? (() => { try { return JSON.parse(initial.items_json); } catch { return []; } })() : []),
  }));
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  const updateItem = (idx, key, value) => {
    setF(prev => {
      const items = [...prev._items];
      items[idx] = { ...items[idx], [key]: value };
      const totals = items.reduce((acc, i) => ({
        totalLength: acc.totalLength + (parseFloat(i.totalLength) || 0),
        totalRoll: acc.totalRoll + (parseFloat(i.roll) || 0),
        totalGrossWeight: acc.totalGrossWeight + (parseFloat(i.grossWeight) || 0),
        totalNetWeight: acc.totalNetWeight + (parseFloat(i.netWeight) || 0),
        totalCbm: acc.totalCbm + (parseFloat(i.cbm) || 0),
      }), { totalLength: 0, totalRoll: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 });
      return {
        ...prev, _items: items, items_json: JSON.stringify(items),
        total_length: totals.totalLength, total_roll: totals.totalRoll,
        total_gross_weight: totals.totalGrossWeight, total_net_weight: totals.totalNetWeight, total_cbm: totals.totalCbm,
      };
    });
  };

  const miniInput = { ...inputStyle, padding: "5px 8px", fontSize: "12px", width: "72px", textAlign: "right" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Number" half><Input value={f.number} onChange={set("number")} /></Field>
      <Field label="Date" half><Input type="date" value={f.date} onChange={set("date")} /></Field>
      <Field label="Way of Shipment" half>
        <Select value={f.way_of_shipment} onChange={set("way_of_shipment")}>
          <option>By Sea</option><option>By Air</option><option>By Land</option>
        </Select>
      </Field>
      <Field label="Incoterm" half><Input value={f.incoterm} onChange={set("incoterm")} /></Field>
      <Field label="Port of Origin" half><Input value={f.port_of_origin} onChange={set("port_of_origin")} /></Field>
      <Field label="Port of Destination" half><Input value={f.port_of_destination} onChange={set("port_of_destination")} /></Field>
      <Field label="Manufacturer" half><Input value={f.manufacturer} onChange={set("manufacturer")} /></Field>
      <Field label="Manufacturer Address" half><Input value={f.manufacturer_address} onChange={set("manufacturer_address")} /></Field>

      <Field label="Items — Roll / Gross Weight / Net Weight / CBM">
        <div style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
          {(f._items || []).length === 0 && (
            <div style={{ padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No items.</div>
          )}
          {(f._items || []).map((item, idx) => (
            <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
              <div style={{ fontSize: "13px", color: "#f1f5f9", marginBottom: "6px" }}>
                <strong>{item.description}</strong>
                <span style={{ color: "#64748b", marginLeft: "8px" }}>
                  {item.color} {item.width} {item.weightSpec} · Length: {parseFloat(item.totalLength || 0).toFixed(2)} m
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <label style={{ fontSize: "11px", color: "#64748b" }}>Roll
                  <input type="number" value={item.roll} onChange={e => updateItem(idx, "roll", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
                </label>
                <label style={{ fontSize: "11px", color: "#64748b" }}>Gross Weight (kg)
                  <input type="number" value={item.grossWeight} onChange={e => updateItem(idx, "grossWeight", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
                </label>
                <label style={{ fontSize: "11px", color: "#64748b" }}>Net Weight (kg)
                  <input type="number" value={item.netWeight} onChange={e => updateItem(idx, "netWeight", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
                </label>
                <label style={{ fontSize: "11px", color: "#64748b" }}>CBM
                  <input type="number" value={item.cbm} onChange={e => updateItem(idx, "cbm", e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </Field>

      <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", fontSize: "13px", color: "#94a3b8" }}>
        <span>Total Length: <strong style={{ color: "#f1f5f9" }}>{(parseFloat(f.total_length) || 0).toFixed(2)} m</strong></span>
        <span>Total Roll: <strong style={{ color: "#f1f5f9" }}>{f.total_roll}</strong></span>
        <span>Gross Weight: <strong style={{ color: "#f1f5f9" }}>{f.total_gross_weight} kg</strong></span>
        <span>Net Weight: <strong style={{ color: "#f1f5f9" }}>{f.total_net_weight} kg</strong></span>
        <span>CBM: <strong style={{ color: "#f1f5f9" }}>{f.total_cbm}</strong></span>
      </div>

      <Field label="Notes"><Textarea value={f.notes || ""} onChange={set("notes")} /></Field>

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {f.id && <Btn outline color="#10b981" onClick={() => window.open(`${API}/packing-lists/${f.id}/pdf`, "_blank")}>📄 Download PDF</Btn>}
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Packing List</Btn>
      </div>
    </div>
  );
}

function Orders() {
const [contracts, setContracts] = useState([]);
const [commercials, setCommercials] = useState([]);
const [editContract, setEditContract] = useState(null);
const [editCommercial, setEditCommercial] = useState(null);
const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [editNumberId, setEditNumberId] = useState(null);
  const [editNumberVal, setEditNumberVal] = useState("");
  const [search, setSearch] = useState("");
  const [contractModal, setContractModal] = useState(null);
  const [savedContracts, setSavedContracts] = useState([]);
  const [ciNotification, setCiNotification] = useState(null);
  const [inspectionModal, setInspectionModal] = useState(null);
const [inspections, setInspections] = useState([]);
  const [editInspection, setEditInspection] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [packingLists, setPackingLists] = useState([]);
  const [packingListModal, setPackingListModal] = useState(null);
  const [editPackingList, setEditPackingList] = useState(null);

 const load = useCallback(async () => {
    const [orders, contracts, commercials, inspections, products, suppliersList, packingLists] = await Promise.all([
  api("/orders"),
  api("/contracts"),
  api("/commercial-invoices"),
  api("/inspections"),
  api("/products"),
  api("/suppliers"),
  api("/packing-lists"),
]);
setInspections(inspections);
setProducts(products);
setSuppliersList(suppliersList);
setPackingLists(packingLists);
    const ordersWithItems = await Promise.all(
      orders.map(async o => {
        const detail = await api(`/orders/${o.id}`);
        return { ...o, items: detail.items || [] };
      })
    );
    setOrders(ordersWithItems);
    setContracts(contracts);
    setCommercials(commercials);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const filtered = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.client.toLowerCase().includes(search.toLowerCase()) ||
    (o.status || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.incoterm || "").toLowerCase().includes(search.toLowerCase())
  );

  const createOrder = (f) => api("/orders", "POST", f).then(load);
  const updateOrder = (f) => api(`/orders/${editOrder.id}`, "PUT", f).then(load);

  // Builds a Packing List draft from an order's items, pulling as much as
  // possible from the order/product records (color, width, weight spec,
  // length, net weight already computed on the item). Roll count, gross
  // weight and CBM are physical-packing specifics with no digital source,
  // so they're left for the user to fill in — gross weight defaults to net
  // weight as a starting point.
  const buildPackingListDraft = (order) => {
    const items = (order.items || []).map(item => {
      const product = products.find(p => Number(p.id) === Number(item.product_id));
      const totalLength = parseFloat(item.total_meterage || item.quantity || 0) || 0;
      const netWeight = item.total_weight != null && item.total_weight !== "" ? parseFloat(item.total_weight) : null;
      return {
        product_id: item.product_id,
        description: product?.name || item.product_name,
        bullets: product?.description ? String(product.description).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [],
        ncm: product?.ncm || "",
        color: product?.color || "",
        width: product?.width ? `${product.width}${product.width_unit || ""}` : "",
        weightSpec: product?.weight ? `${product.weight} ${product.weight_unit || ""}` : "",
        totalLength,
        roll: "",
        grossWeight: netWeight != null ? netWeight : "",
        netWeight: netWeight != null ? netWeight : "",
        cbm: "",
      };
    });
    const acq = getAcqCompany(order.acquisition_company || "HK");
    const totals = items.reduce((acc, i) => ({
      totalLength: acc.totalLength + (parseFloat(i.totalLength) || 0),
      totalRoll: acc.totalRoll + (parseFloat(i.roll) || 0),
      totalGrossWeight: acc.totalGrossWeight + (parseFloat(i.grossWeight) || 0),
      totalNetWeight: acc.totalNetWeight + (parseFloat(i.netWeight) || 0),
      totalCbm: acc.totalCbm + (parseFloat(i.cbm) || 0),
    }), { totalLength: 0, totalRoll: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 });

    return {
      order_id: order.id,
      number: `PL-${order.order_number}-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 10),
      way_of_shipment: "By Sea",
      country_of_origin: "China",
      country_of_acquisition: order.acquisition_company === "HK" ? "Hong Kong" : "China",
      port_of_origin: order.port_of_loading || "",
      port_of_destination: order.port_of_discharge || "",
      incoterm: order.incoterm || "",
      manufacturer: acq.name,
      manufacturer_address: acq.address,
      _items: items,
      items_json: JSON.stringify(items),
      total_length: totals.totalLength, total_roll: totals.totalRoll,
      total_gross_weight: totals.totalGrossWeight, total_net_weight: totals.totalNetWeight, total_cbm: totals.totalCbm,
      status: "Draft",
      notes: "",
    };
  };

const changeStatus = async (id, status) => {
  await api(`/orders/${id}/status`, "PATCH", { status });
 if (status === "Shipment") {
  const order = orders.find(o => o.id === id);
  if (order) {
    const number = `CI-${order.order_number}-${Date.now().toString().slice(-4)}`;
    const ci = await api("/commercial-invoices", "POST", {
      order_id: id,
      number,
      issue_date: new Date().toISOString().slice(0, 10),
      client: order.client,
      total: order.value,
      currency: order.currency || "USD",
      status: "Pending",
      notes: "",
    });
    const hasPackingList = packingLists.find(p => Number(p.order_id) === Number(id));
    if (!hasPackingList) {
      await api("/packing-lists", "POST", buildPackingListDraft(order));
    }
    setCiNotification({ number: ci.number, client: ci.client });
  }
}
if (status === "Inspection") {
  const order = orders.find(o => o.id === id);
  if (order) {
    setInspectionModal({
      order_id: id,
      number: `INS-${order.order_number}-${Date.now().toString().slice(-4)}`,
      inspection_date: new Date().toISOString().slice(0, 10),
      inspector: "",
      result: "Pending",
      observations: "",
    });
  }
}
load();
};
  const deleteOrder = async (id) => { if (confirm("Delete this order?")) { await api(`/orders/${id}`, "DELETE"); load(); } };
  const saveNumber = async (id) => {
    await api(`/orders/${id}`, "PUT", { ...orders.find(o => o.id === id), order_number: editNumberVal });
    setEditNumberId(null); load();
  };

  const nextStatus = { Pending: "In Production", "In Production": "Inspection", Inspection: "Completed" };
const prevStatus = { "In Production": "Pending", Inspection: "In Production", Completed: "Inspection" };
  const generateCommercial = async (order) => {
  const number = `CI-${order.order_number}-${Date.now().toString().slice(-4)}`;
  const ci = await api("/commercial-invoices", "POST", {
    order_id: order.id,
    number,
    issue_date: new Date().toISOString().slice(0, 10),
    client: order.client,
    total: order.value,
    currency: order.currency || "USD",
    status: "Pending",
    notes: "",
  });
  setEditCommercial(ci);
  load();
};
const generateContract = (order) => {
  const suppliers = [...new Set((order.items || []).map(i => i.supplier).filter(Boolean))];
  if (suppliers.length === 0) {
    const number = `SC-${order.order_number}-${Date.now().toString().slice(-4)}`;
   setContractModal([{
  order_id: order.id,
  contract_number: number,
  supplier: "",
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: order.value || "",
  currency: order.currency || "USD",
  status: "Draft",
  notes: order.notes || "",
  _items: order.items || [],
  items_json: JSON.stringify(order.items || []),
}]);
  } else {
    setContractModal(suppliers.map(supplier => {
const supplierItems = (order.items || []).filter(i => i.supplier === supplier);
const total = supplierItems.reduce((sum, i) => sum + ((parseFloat(i.cost_price) || parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
const currency = supplierItems[0]?.cost_currency || supplierItems[0]?.currency || order.currency || "USD";
      const number = `SC-${order.order_number}-${supplier.slice(0,4).toUpperCase()}-${Date.now().toString().slice(-4)}`;
      return {
  order_id: order.id,
  contract_number: number,
  supplier,
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: total.toFixed(2),
  currency,
  status: "Draft",
  notes: order.notes || "",
  _items: supplierItems,
  items_json: JSON.stringify(supplierItems),
};
    }));
  }
};
const generatePackingList = (order) => setPackingListModal(buildPackingListDraft(order));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Orders</h2>
        <Btn onClick={() => setModal("new")}>+ New Order</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
  placeholder="Search by order #, client, status or incoterm…" style={{ ...inputStyle, marginBottom: "16px" }} />

      {modal === "new" && (
        <Modal title="New Order" onClose={() => setModal(null)}>
          <OrderForm onSave={createOrder} onClose={() => setModal(null)} />
        </Modal>
      )}
{editOrder && (
        <Modal title="Edit Order" onClose={() => setEditOrder(null)}>
          <OrderForm initial={editOrder} onSave={updateOrder} onClose={() => setEditOrder(null)} />
        </Modal>
      )}
{editContract && (
  <Modal title="Edit Contract" onClose={() => { setEditContract(null); load(); }} wide>
    <ContractForm orders={orders} initial={editContract}
      onSave={async b => { await api(`/contracts/${editContract.id}`, "PUT", b); setEditContract(null); load(); }}
      onClose={() => setEditContract(null)} />
  </Modal>
)}
      {inspectionModal && (
  <Modal title="Generate Inspection" onClose={() => setInspectionModal(null)} wide>
    <InspectionForm
      orders={orders}
      initial={inspectionModal}
      onSave={async b => { await api("/inspections", "POST", b); setInspectionModal(null); load(); }}
      onClose={() => setInspectionModal(null)}
    />
  </Modal>
)}
      {editInspection && (
  <Modal title="Edit Inspection" onClose={() => { setEditInspection(null); load(); }} wide>
    <InspectionForm
      orders={orders}
      initial={{ ...editInspection, media: editInspection.media ? (typeof editInspection.media === 'string' ? JSON.parse(editInspection.media) : editInspection.media) : [] }}
      onSave={async b => { await api(`/inspections/${editInspection.id}`, "PUT", b); setEditInspection(null); load(); }}
      onClose={() => setEditInspection(null)}
    />
  </Modal>
)}
{editCommercial && (
  <Modal title="Edit Commercial Invoice" onClose={() => { setEditCommercial(null); load(); }} wide>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Number" half><Input value={editCommercial.number} onChange={e => setEditCommercial(p => ({ ...p, number: e.target.value }))} /></Field>
      <Field label="Issue Date" half><Input type="date" value={editCommercial.issue_date} onChange={e => setEditCommercial(p => ({ ...p, issue_date: e.target.value }))} /></Field>
      <Field label="Client" half><Input value={editCommercial.client} onChange={e => setEditCommercial(p => ({ ...p, client: e.target.value }))} /></Field>
<Field label="Total" half>
        <input value={editCommercial.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Currency" half>
        <input value={editCommercial.currency} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={editCommercial.status} onChange={e => setEditCommercial(p => ({ ...p, status: e.target.value }))}>
          <option>Pending</option><option>Paid</option>
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={editCommercial.notes || ""} onChange={e => setEditCommercial(p => ({ ...p, notes: e.target.value }))} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={() => setEditCommercial(null)}>Cancel</Btn>
        <Btn onClick={async () => { await api(`/commercial-invoices/${editCommercial.id}`, "PUT", editCommercial); setEditCommercial(null); load(); }}>Save</Btn>
      </div>
    </div>
  </Modal>
)}
{contractModal && (
  <Modal title="Generate Supplier Contracts" onClose={() => { setContractModal(null); setSavedContracts([]); load(); }} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {contractModal.map((c, idx) => (
        <div key={idx} style={{ background: "#1e293b", borderRadius: "12px", padding: "16px", opacity: savedContracts.includes(idx) ? 0.6 : 1 }}>
          <div style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontWeight: 700, color: savedContracts.includes(idx) ? "#10b981" : "#a78bfa", fontSize: "14px" }}>
                {savedContracts.includes(idx) ? "✅" : "🏭"} {c.supplier || "Supplier " + (idx + 1)}
              </span>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{c.currency} {c.total}</span>
            </div>
            <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 14px", marginBottom: "4px" }}>
              <div style={{ fontSize: "11px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Products in this contract</div>
              {(c._items || []).map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b", fontSize: "13px" }}>
                  <div>
                    <span style={{ color: "#60a5fa", fontFamily: "monospace", fontSize: "11px" }}>{item.product_code}</span>
                    <span style={{ color: "#f1f5f9", marginLeft: "8px" }}>{item.product_name}</span>
                    <span style={{ color: "#64748b", marginLeft: "8px" }}>{item.quantity} {item.unit}</span>
                    {perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency) && (
                      <span style={{ color: "#a78bfa", marginLeft: "8px", fontSize: "11px" }}>({perMeterLabel(item, "cost_per_meter", item.cost_currency || item.currency)})</span>
                    )}
                  </div>
              <span style={{ color: "#10b981", fontWeight: 600 }}>{item.cost_currency || item.currency} {parseFloat(item.cost_price || item.unit_price).toFixed(2)} × {item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
          {savedContracts.includes(idx) ? (
            <div style={{ textAlign: "center", padding: "12px", color: "#10b981", fontWeight: 600, fontSize: "14px" }}>
              ✅ Contract saved successfully!
            </div>
          ) : (
            <ContractForm
              orders={orders}
              initial={c}
onSave={async b => {
  const contract = await api("/contracts", "POST", b);
  await api("/financial/suppliers", "POST", {
    order_id: b.order_id,
    supplier: b.supplier,
    description: `Contract ${b.contract_number}`,
    type: "Purchase Order",
    amount: b.total,
    currency: b.currency || "USD",
    due_date: b.delivery_date || "",
    status: "Pending",
    notes: b.notes || "",
    contract_id: contract.id,
    items_json: b.items_json || null,
  });
  setSavedContracts(prev => {
    const updated = [...prev, idx];
    if (updated.length === contractModal.length) load();
    return updated;
  });
}}
              onClose={() => { setContractModal(null); setSavedContracts([]); load(); }}
            />
          )}
        </div>
      ))}
     {savedContracts.length === contractModal.length && (
        <div style={{ textAlign: "center" }}>
          <Btn color="#10b981" onClick={() => { setContractModal(null); setSavedContracts([]); load(); }}>
            ✅ All contracts saved — Close
          </Btn>
        </div>
      )}
    </div>
  </Modal>
)}

      {packingListModal && (
        <Modal title="Generate Packing List" onClose={() => { setPackingListModal(null); load(); }} wide>
          <PackingListForm
            initial={packingListModal}
            onSave={async b => { await api("/packing-lists", "POST", b); load(); }}
            onClose={() => { setPackingListModal(null); load(); }}
          />
        </Modal>
      )}
      {editPackingList && (
        <Modal title="Edit Packing List" onClose={() => { setEditPackingList(null); load(); }} wide>
          <PackingListForm
            initial={editPackingList}
            onSave={async b => { await api(`/packing-lists/${editPackingList.id}`, "PUT", b); load(); }}
            onClose={() => { setEditPackingList(null); load(); }}
          />
        </Modal>
      )}

      {ciNotification && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid #10b981", borderRadius: "16px",
            padding: "32px 40px", maxWidth: "420px", textAlign: "center",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🧾</div>
            <h3 style={{ margin: "0 0 8px", color: "#10b981", fontSize: "18px", fontWeight: 700 }}>Commercial Invoice Generated!</h3>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 24px" }}>
              <strong style={{ color: "#f1f5f9" }}>{ciNotification.number}</strong> was created for <strong style={{ color: "#f1f5f9" }}>{ciNotification.client}</strong>.
            </p>
            <Btn color="#10b981" onClick={() => setCiNotification(null)}>OK</Btn>
          </div>
        </div>
      )}

      <Table
        cols={[
          {
            label: "Order #", render: r =>
              editNumberId === r.id ? (
                <div style={{ display: "flex", gap: "6px" }}>
                  <Input value={editNumberVal} onChange={e => setEditNumberVal(e.target.value)}
                    style={{ ...inputStyle, width: "120px", padding: "4px 8px" }} />
                  <Btn small onClick={() => saveNumber(r.id)}>✓</Btn>
                  <Btn small outline color="#64748b" onClick={() => setEditNumberId(null)}>✗</Btn>
                </div>
              ) : (
                <span
                  style={{ fontWeight: 700, color: "#60a5fa", cursor: "pointer", borderBottom: "1px dashed #334155" }}
                  onClick={() => { setEditNumberId(r.id); setEditNumberVal(r.order_number); }}
                  title="Click to edit"
                >{r.order_number}</span>
              )
          },
          { label: "Client", key: "client" },
          { label: "Value", render: r => fmt(r.value, r.currency) },
          { label: "Lead Time", render: r => r.production_lead_time ? `${r.production_lead_time}d` : "—" },
          { label: "Shipment", render: r => fmtDate(r.shipment_date) },
          { label: "Arrival", render: r => fmtDate(r.arrival_date) },
          { label: "Status", render: r => (
  <select value={r.status}
    onChange={async e => { await changeStatus(r.id, e.target.value); }}
    style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
    {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
  </select>
)},
{ label: "Actions", render: r => {
const hasContract = contracts.filter(c => Number(c.order_id) === Number(r.id));
const hasCommercial = commercials.find(c => Number(c.order_id) === Number(r.id));
  const hasInspection = inspections.find(i => Number(i.order_id) === Number(r.id));
  const hasPackingList = packingLists.find(p => Number(p.order_id) === Number(r.id));

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={hasContract.length > 0 ? "#8b5cf6" : "#334155"}
  onClick={() => hasContract.length > 0 ? setEditContract(hasContract[0]) : generateContract(r)}>
  🤝 {hasContract.length > 0 ? "Contract ✓" : "Contract"}
</Btn>
      <Btn small outline={!hasCommercial} color={hasCommercial ? "#10b981" : "#64748b"}
  onClick={() => hasCommercial ? setEditCommercial(hasCommercial) : generateCommercial(r)}>
  🧾 {hasCommercial ? "Commercial ✓" : "Commercial"}
</Btn>
      <Btn small outline={!hasPackingList} color={hasPackingList ? "#06b6d4" : "#64748b"}
  onClick={() => hasPackingList ? setEditPackingList(hasPackingList) : generatePackingList(r)}>
  📦 {hasPackingList ? "Packing List ✓" : "Packing List"}
</Btn>
      <Btn small outline={!hasInspection} color={hasInspection ? "#f59e0b" : "#64748b"}
  onClick={() => hasInspection ? setEditInspection(hasInspection) : setInspectionModal({
    order_id: r.id,
    number: `INS-${r.order_number}-${Date.now().toString().slice(-4)}`,
    inspection_date: new Date().toISOString().slice(0, 10),
    inspector: "",
    result: "Pending",
    observations: "",
  })}>
  🔍 {hasInspection ? "Inspection ✓" : "Inspection"}
</Btn>
      <Btn small outline color="#64748b" onClick={() => setEditOrder(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/orders/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  );
}},
        ]}
        rows={filtered}
        emptyMsg="No orders found."
      />
    </div>
  );
}

function Products() {
  const [products, setProducts] = useState([]);
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => api("/products").then(setProducts), []);
  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Product Registry</h2>
        <Btn onClick={() => setModal("new")}>+ New Product</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, code or category…" style={{ ...inputStyle, marginBottom: "16px" }} />

      {modal === "new" && (
        <Modal title="New Product" onClose={() => setModal(null)}>
          <ProductForm onSave={b => api("/products", "POST", b).then(load)} onClose={() => setModal(null)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Product" onClose={() => setEditing(null)}>
          <ProductForm initial={editing}
            onSave={b => api(`/products/${editing.id}`, "PUT", b).then(load)}
            onClose={() => setEditing(null)} />
        </Modal>
      )}

      <Table
cols={[
  { label: "Code", render: r => <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{r.code}</span> },
  { label: "Name", render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
  { label: "Category", key: "category" },
  { label: "Supplier", key: "supplier" },
  { label: "Unit", key: "unit" },
  { label: "Width", render: r => r.width || "—" },
  { label: "Height", render: r => r.height || "—" },
  { label: "Thickness", render: r => r.thickness || "—" },
  { label: "Weight", render: r => r.weight || "—" },
  { label: "Cost", render: r => r.unit_cost ? `${r.cost_currency || "USD"} ${parseFloat(r.unit_cost).toFixed(2)}` : "—" },
  { label: "Sale Price", render: r => r.sale_price ? `${r.sale_currency || "USD"} ${parseFloat(r.sale_price).toFixed(2)}` : "—" },
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/products/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}

function Samples() {
 const [samples, setSamples] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(() => api("/samples").then(setSamples), []);
  useEffect(() => { load(); }, [load]);

  const filtered = samples.filter(s =>
    s.product_name.toLowerCase().includes(search.toLowerCase()) ||
    s.client.toLowerCase().includes(search.toLowerCase()) ||
    (s.status || "").toLowerCase().includes(search.toLowerCase())
  );

  const sampleColors = {
    Requested: "#64748b", "In Production": "#3b82f6", Sent: "#f59e0b",
    "Feedback Received": "#8b5cf6", Approved: "#10b981",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Product Development – Samples</h2>
        <Btn onClick={() => setModal(true)}>+ New Sample</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
  placeholder="Search by product, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title="New Sample Request" onClose={() => setModal(false)}>
          <SampleForm onSave={b => api("/samples", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}

  {editing && (
  <Modal title="Edit Sample" onClose={() => setEditing(null)}>
    <SampleForm initial={editing} onSave={b => api(`/samples/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
  </Modal>
)}
      <Table
        cols={[
  { label: "Code", render: r => <span style={{ fontFamily: "monospace", color: "#60a5fa" }}>{r.code || "—"}</span> },
  { label: "Category", key: "category" },
  { label: "Product", render: r => <span style={{ fontWeight: 600 }}>{r.product_name}</span> },
  { label: "Client", key: "client" },
  { label: "Requested", render: r => fmtDate(r.requested_date) },
  { label: "Sent", render: r => fmtDate(r.sent_date) },
{ label: "Status", render: r => (
  <select value={r.status}
    onChange={async e => { await api(`/samples/${r.id}/status`, "PATCH", { status: e.target.value }); load(); }}
    style={{ ...inputStyle, padding: "4px 8px", color: sampleColors[r.status] || "#94a3b8", fontSize: "12px", width: "auto" }}>
    {SAMPLE_STATUSES.map(s => <option key={s}>{s}</option>)}
  </select>
)},
  { label: "Notes", key: "notes" },
  { label: "", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/samples/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}
      
      
function Proformas() {
const [proformas, setProformas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [orderNotification, setOrderNotification] = useState(null);
  const load = useCallback(() => {
    api("/proformas").then(setProformas);
    api("/orders").then(setOrders);
    api("/quotations").then(setQuotations);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = proformas.filter(p =>
    p.number.toLowerCase().includes(search.toLowerCase()) ||
    p.client.toLowerCase().includes(search.toLowerCase()) ||
    (p.status || "").toLowerCase().includes(search.toLowerCase())
  );

  // Builds an Order from the Proforma's own shipment fields plus the linked
  // Quotation's items/client/currency/supplier — pulling as much info as
  // possible from both, per the trader workflow (Proforma → Order).
  const createOrderFromProforma = async (pf) => {
    const quotation = quotations.find(q => Number(q.id) === Number(pf.quotation_id));
    const items = quotation
      ? (typeof quotation.items === 'string' ? (JSON.parse(quotation.items || "[]")) : (quotation.items || []))
      : [];
    const itemsTotal = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    // Suppliers now live per item (each product in the quotation can have
    // its own), not as a single field on the quotation — join whatever
    // unique suppliers show up across the items being carried into the Order.
    const itemSuppliers = [...new Set(items.map(i => i.supplier).filter(Boolean))];
    const orderNumber = `ORD-${pf.number}`;
    const order = await api("/orders", "POST", {
      order_number: orderNumber,
      client: pf.client || quotation?.client || "",
      supplier: itemSuppliers.join(", "),
      value: pf.total || itemsTotal.toFixed(2),
      currency: pf.currency || quotation?.currency || "USD",
      incoterm: pf.incoterm || "",
      port_of_loading: pf.port_of_loading || "",
      port_of_discharge: pf.port_of_discharge || "",
      acquisition_company: pf.acquisition_company || "",
      payment_terms: pf.payment_terms || "",
      production_lead_time: pf.production_days || "",
      delivery_days: pf.delivery_days || "",
      status: "Pending",
      notes: `Created from Proforma ${pf.number}${quotation ? ` (Quotation ${quotation.number})` : ""}`,
      items,
    });
    await api(`/proformas/${pf.id}`, "PUT", { ...pf, order_id: order.id });
    setOrderNotification(orderNumber);
    load();
  };

  return (
    <div>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Proforma Invoices</h2>
      </div>
      {editing && (
        <Modal title="Edit Proforma" onClose={() => setEditing(null)} wide>
          <ProformaForm orders={orders} initial={editing} onSave={b => api(`/proformas/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      {orderNotification && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#0f172a", border: "1px solid #10b981", borderRadius: "16px",
            padding: "32px 40px", maxWidth: "420px", textAlign: "center",
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🛒</div>
            <h3 style={{ margin: "0 0 8px", color: "#10b981", fontSize: "18px", fontWeight: 700 }}>Order Created!</h3>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 24px" }}>
              Order <strong style={{ color: "#f1f5f9" }}>{orderNotification}</strong> was created successfully!
            </p>
            <Btn color="#10b981" onClick={() => setOrderNotification(null)}>OK</Btn>
          </div>
        </div>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
cols={[
  { label: "Number", render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
  { label: "Client", key: "client" },
  { label: "Issue Date", render: r => fmtDate(r.issue_date) },
  { label: "Validity", render: r => fmtDate(r.validity) },
  { label: "Total", render: r => fmt(r.total, r.currency) },
  { label: "Status", render: r => (
    <select value={r.status}
      onChange={async e => {
        await api(`/proformas/${r.id}`, "PUT", { ...r, status: e.target.value });
        load();
      }}
      style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
      {["Draft","Sent","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
    </select>
  )},
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      <Btn small color={r.order_id ? "#10b981" : "#334155"} onClick={() => !r.order_id && createOrderFromProforma(r)}>
        🛒 {r.order_id ? "Order ✓" : "Create Order"}
      </Btn>
      <Btn small outline color="#10b981" onClick={() => window.open(`${API}/proformas/${r.id}/pdf`, "_blank")}>📄 PDF</Btn>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/proformas/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  )},
]}
        rows={filtered}
      />
    </div>
  );
}

function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    api("/contracts").then(setContracts);
    api("/orders").then(setOrders);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = contracts.filter(c =>
    (c.contract_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.supplier || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Supplier Contracts</h2>
      </div>
      {editing && (
        <Modal title="Edit Contract" onClose={() => setEditing(null)} wide>
          <ContractForm orders={orders} initial={editing}
            onSave={async b => { await api(`/contracts/${editing.id}`, "PUT", b).then(load); setEditing(null); }}
            onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by contract #, supplier or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Contract #", render: r => <span style={{ fontWeight: 700, color: "#a78bfa" }}>{r.contract_number}</span> },
          { label: "Supplier", key: "supplier" },
          { label: "Sign Date", render: r => fmtDate(r.sign_date) },
          { label: "Delivery Date", render: r => fmtDate(r.delivery_date) },
          { label: "Total", render: r => fmt(r.total, r.currency) },
          { label: "Status", render: r => (
            <select value={r.status}
              onChange={async e => {
                await api(`/contracts/${r.id}`, "PUT", { ...r, status: e.target.value });
                load();
              }}
              style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
              {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
            </select>
          )},
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#10b981" onClick={() => window.open(`${API}/contracts/${r.id}/pdf`, "_blank")}>📄 PDF</Btn>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/contracts/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

function Financial({ type }) {
  const isClient = type === "client";
  const [records, setRecords] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const endpoint = isClient ? "/financial/clients" : "/financial/suppliers";
  const load = useCallback(() => {
    api(endpoint).then(setRecords);
    api("/orders").then(setOrders);
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);

  const totals = records.reduce((acc, r) => {
    acc.total += r.amount;
    if (r.status === "Pending" || r.status === "Partial") acc.pending += r.amount;
    if (r.status === "Paid") acc.paid += r.amount;
    return acc;
  }, { total: 0, pending: 0, paid: 0 });

  const color = isClient ? "#3b82f6" : "#8b5cf6";
  const party = isClient ? "client" : "supplier";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
          {isClient ? "💰 Client Cash Flow" : "📦 Supplier Cash Flow"}
        </h2>
        <Btn color={color} onClick={() => setModal(true)}>+ New Entry</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>
        <StatCard label="Total" value={fmt(totals.total)} color={color} />
        <StatCard label="Pending" value={fmt(totals.pending)} color="#f59e0b" />
        <StatCard label={isClient ? "Received" : "Paid"} value={fmt(totals.paid)} color="#10b981" />
      </div>
      {modal && (
        <Modal title={isClient ? "New Client Payment" : "New Supplier Payment"} onClose={() => setModal(false)}>
          <FinForm type={type} orders={orders} onSave={b => api(endpoint, "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={isClient ? "Edit Client Payment" : "Edit Supplier Payment"} onClose={() => setEditing(null)}>
          <FinForm type={type} orders={orders} initial={editing} onSave={b => api(`${endpoint}/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
cols={[
  { label: isClient ? "Client" : "Supplier", render: r => <span style={{ fontWeight: 600 }}>{r[party]}</span> },
  { label: "Type", key: "type" },
  { label: "Description", key: "description" },
  ...(!isClient ? [{
    label: "Items", render: r => {
      try {
        const items = r.items_json ? JSON.parse(r.items_json) : [];
        return items.length > 0 ? (
          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
            {items.map((i, idx) => (
              <div key={idx}>{i.product_name} × {i.quantity} {i.unit}</div>
            ))}
          </div>
        ) : "—";
      } catch { return "—"; }
    }
  }] : []),
  { label: "Amount", render: r => <span style={{ fontWeight: 600, color }}>{fmt(r.amount, r.currency)}</span> },
  { label: "Due Date", render: r => fmtDate(r.due_date) },
  { label: "Status", render: r => (
    <select value={r.status}
      onChange={async e => {
        await api(`${endpoint}/${r.id}/status`, "PATCH", {
          status: e.target.value,
          paid_date: e.target.value === "Paid" ? new Date().toISOString().slice(0, 10) : null,
        });
        load();
      }}
      style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
      {FIN_STATUSES.map(s => <option key={s}>{s}</option>)}
    </select>
  )},
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      {!isClient && <Btn small outline color="#10b981" onClick={() => window.open(`${API}/financial/suppliers/${r.id}/payment-notice-pdf`, "_blank")}>📄 PDF</Btn>}
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`${endpoint}/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
    </div>
  )},
]}
        rows={records}
      />
    </div>
  );
}
function ClientForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    company_name: "", address: "", address2: "", email: "",
    phone: "", contact_name: "", payment_terms: "", tax_id: "", notes: "",
  });
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const paymentOptions = [
    "100% ADV – 100% Advance",
    "100% AFTER D. SALE – 100% After Domestic Sale",
    "100% ARRIVAL – 100% At Destination Port",
    "100%ADV B. SHIP. – 100% Advance Before Shipment",
    "100%DP BL – 100%DP Under BL Copy",
    "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
    "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
    "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
    "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
    "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
    "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
  ];

  const filteredPayments = paymentOptions.filter(p =>
    p.toLowerCase().includes((f.payment_terms || "").toLowerCase())
  );

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Company Name"><Input value={f.company_name} onChange={set("company_name")} /></Field>
      <Field label="Contact Name" half><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
      <Field label="Email" half><Input type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone" half><Input value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Payment Terms" half>
        <div style={{ position: "relative" }}>
          <Input
            value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…"
          />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={dropdownStyle}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={dropItemStyle}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
      <Field label="Address 2"><Input value={f.address2} onChange={set("address2")} /></Field>
      <Field label="Tax ID / CNPJ" half><Input value={f.tax_id} onChange={set("tax_id")} placeholder="For Proforma / Commercial Invoice" /></Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Client</Btn>
      </div>
    </div>
  );
}

function Clients() {
  const [clients, setClients] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(() => api("/clients").then(setClients), []);
  useEffect(() => { load(); }, [load]);
  const filtered = clients.filter(c =>
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Clients</h2>
        <Btn onClick={() => setModal(true)}>+ New Client</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by company or contact…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title="New Client" onClose={() => setModal(false)}>
          <ClientForm onSave={b => api("/clients", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Client" onClose={() => setEditing(null)}>
          <ClientForm initial={editing} onSave={b => api(`/clients/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Company", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.company_name}</span> },
          { label: "Contact", key: "contact_name" },
          { label: "Email", key: "email" },
          { label: "Phone", key: "phone" },
          { label: "Payment Terms", key: "payment_terms" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/clients/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

function SupplierForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    company_name: "", address: "", address2: "", email: "",
    phone: "", contact_name: "", payment_terms: "", product_types: "", notes: "",
    beneficiary_name: "", bank_name: "", bank_branch: "", account_number: "", swift_code: "",
  });
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const paymentOptions = [
    "100% ADV – 100% Advance",
    "100% AFTER D. SALE – 100% After Domestic Sale",
    "100% ARRIVAL – 100% At Destination Port",
    "100%ADV B. SHIP. – 100% Advance Before Shipment",
    "100%DP BL – 100%DP Under BL Copy",
    "20%ADV/80%DP B. SHIP – 20% Advance, 80%DP Before Shipment",
    "20%ADV/80%DP BL – 20% Advance, 80%DP Under BL Copy",
    "30% ADV 70% BL – 30% Advance and 70% 30 Days After Shipment",
    "30% ADV 70% BS – 30% Advance and 70% Before Shipment",
    "30%ADV/70%DP B. SHIP – 30% Advance, 70%DP Before Shipment",
    "30%ADV/70%DP BL – 30% Advance, 70%DP Under BL Copy",
  ];

  const filteredPayments = paymentOptions.filter(p =>
    p.toLowerCase().includes((f.payment_terms || "").toLowerCase())
  );

  const dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
    background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
    maxHeight: "180px", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  };
  const dropItemStyle = {
    padding: "10px 12px", cursor: "pointer", fontSize: "13px", color: "#cbd5e1",
    borderBottom: "1px solid #0f172a",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Company Name"><Input value={f.company_name} onChange={set("company_name")} /></Field>
      <Field label="Contact Name" half><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
      <Field label="Email" half><Input type="email" value={f.email} onChange={set("email")} /></Field>
      <Field label="Phone" half><Input value={f.phone} onChange={set("phone")} /></Field>
      <Field label="Payment Terms" half>
        <div style={{ position: "relative" }}>
          <Input
            value={f.payment_terms}
            onChange={e => { setF(p => ({ ...p, payment_terms: e.target.value })); setShowPaymentList(true); }}
            onFocus={() => setShowPaymentList(true)}
            onBlur={() => setTimeout(() => setShowPaymentList(false), 200)}
            placeholder="Search or type payment terms…"
          />
          {showPaymentList && filteredPayments.length > 0 && (
            <div style={dropdownStyle}>
              {filteredPayments.map((pt, i) => (
                <div key={i} style={dropItemStyle}
                  onMouseDown={() => { setF(p => ({ ...p, payment_terms: pt })); setShowPaymentList(false); }}
                  onMouseEnter={e => e.currentTarget.style.background = "#334155"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {pt}
                </div>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Address"><Input value={f.address} onChange={set("address")} /></Field>
      <Field label="Address 2"><Input value={f.address2} onChange={set("address2")} /></Field>
      <Field label="Product Types"><Input value={f.product_types} onChange={set("product_types")} placeholder="e.g. Furniture, Textiles, Electronics" /></Field>
      <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Bank Information (for Contracts &amp; Payment Notices)
      </div>
      <Field label="Beneficiary Name" half>
        <Input value={f.beneficiary_name} onChange={set("beneficiary_name")} placeholder="If different from company name" />
      </Field>
      <Field label="Bank Name" half><Input value={f.bank_name} onChange={set("bank_name")} /></Field>
      <Field label="Bank Branch" half><Input value={f.bank_branch} onChange={set("bank_branch")} placeholder="e.g. 支行 / branch name" /></Field>
      <Field label="Account Number" half><Input value={f.account_number} onChange={set("account_number")} /></Field>
      <Field label="SWIFT Code" half><Input value={f.swift_code} onChange={set("swift_code")} placeholder="For international wires" /></Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn color="#8b5cf6" onClick={async () => { await onSave(f); onClose(); }}>Save Supplier</Btn>
      </div>
    </div>
  );
}

function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(() => api("/suppliers").then(setSuppliers), []);
  useEffect(() => { load(); }, [load]);
  const filtered = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (s.product_types || "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Suppliers</h2>
        <Btn color="#8b5cf6" onClick={() => setModal(true)}>+ New Supplier</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by company or product type…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title="New Supplier" onClose={() => setModal(false)}>
          <SupplierForm onSave={b => api("/suppliers", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Supplier" onClose={() => setEditing(null)}>
          <SupplierForm initial={editing} onSave={b => api(`/suppliers/${editing.id}`, "PUT", b).then(load)} onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Company", render: r => <span style={{ fontWeight: 600, color: "#a78bfa" }}>{r.company_name}</span> },
          { label: "Contact", key: "contact_name" },
          { label: "Email", key: "email" },
          { label: "Phone", key: "phone" },
          { label: "Product Types", key: "product_types" },
          { label: "Payment Terms", key: "payment_terms" },
          { label: "Bank", render: r => r.bank_name ? <span style={{ fontSize: "12px", color: "#94a3b8" }}>{r.bank_name}{r.account_number ? ` • ${r.account_number}` : ""}</span> : <span style={{ color: "#475569" }}>—</span> },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/suppliers/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
            </div>
          )},
        ]}
        rows={filtered}
      />
    </div>
  );
}

function CommercialInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    api("/commercial-invoices").then(setInvoices);
    api("/orders").then(setOrders);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = invoices.filter(i =>
    (i.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.status || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Commercial Invoices</h2>
      </div>
      {editing && (
        <Modal title="Edit Commercial Invoice" onClose={() => setEditing(null)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Field label="Number" half><Input value={editing.number} onChange={e => setEditing(p => ({ ...p, number: e.target.value }))} /></Field>
            <Field label="Issue Date" half><Input type="date" value={editing.issue_date} onChange={e => setEditing(p => ({ ...p, issue_date: e.target.value }))} /></Field>
            <Field label="Total" half><input value={editing.total} readOnly onChange={() => {}} style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} /></Field>
      <Field label="Currency" half><input value={editing.currency} readOnly onChange={() => {}} style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} /></Field>
            <Field label="Status" half>
              <Select value={editing.status} onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
                <option>Pending</option><option>Paid</option>
              </Select>
            </Field>
            <Field label="Notes"><Textarea value={editing.notes || ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} /></Field>
            <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn outline color="#64748b" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={async () => { await api(`/commercial-invoices/${editing.id}`, "PUT", editing).then(load); setEditing(null); }}>Save</Btn>
            </div>
          </div>
        </Modal>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, client or status…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Number", render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Client", key: "client" },
          { label: "Issue Date", render: r => fmtDate(r.issue_date) },
          { label: "Total", render: r => fmt(r.total, r.currency) },
          { label: "Status", render: r => (
            <select value={r.status}
              onChange={async e => { await api(`/commercial-invoices/${r.id}`, "PUT", { ...r, status: e.target.value }); load(); }}
              style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto", color: r.status === "Paid" ? "#10b981" : "#f59e0b" }}>
              <option>Pending</option><option>Paid</option>
            </select>
          )},
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#10b981" onClick={() => window.open(`${API}/commercial-invoices/${r.id}/pdf`, "_blank")}>📄 PDF</Btn>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/commercial-invoices/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No commercial invoices yet."
      />
    </div>
  );
}

function InspectionForm({ onSave, onClose, initial, orders }) {
  const [f, setF] = useState(initial || {
    order_id: "", number: "", inspection_date: "", inspector: "",
    result: "Pending", observations: "",
  });
const [media, setMedia] = useState(() => {
  if (!initial?.media) return [];
  let parsed = initial.media;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => typeof item === 'string' ? { url: item, name: item.split('/').pop() } : item);
});
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploading(true);
    try {
const results = await Promise.all(files.map(uploadToCloudinary));
setMedia(prev => [...prev, ...results.filter(Boolean)]);
    } catch(err) { alert("Upload failed: " + err.message); }
    setUploading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {(orders || []).map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Inspection Number" half><Input value={f.number} onChange={set("number")} placeholder="INS-2024-001" /></Field>
      <Field label="Inspection Date" half><Input type="date" value={f.inspection_date} onChange={set("inspection_date")} /></Field>
      <Field label="Inspector" half><Input value={f.inspector} onChange={set("inspector")} placeholder="Inspector name" /></Field>
      <Field label="Result" half>
        <Select value={f.result} onChange={set("result")}>
          {["Pending","Approved","Rejected","Conditional"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Observations"><Textarea value={f.observations || ""} onChange={set("observations")} /></Field>

      <Field label="Photos / PDFs">
        <div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#94a3b8", marginBottom: "12px" }}>
            {uploading ? "⏳ Uploading..." : "📎 Add Photos / PDFs"}
            <input type="file" multiple accept="image/*,application/pdf" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
          {lightbox && (
            <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <img src={lightbox} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "8px", objectFit: "contain" }} alt="" onClick={e => e.stopPropagation()} />
              <button onClick={() => setLightbox(null)} style={{ position: "fixed", top: "20px", right: "20px", background: "#ef4444", border: "none", borderRadius: "50%", width: "36px", height: "36px", color: "#fff", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {media.filter(Boolean).map((item, i) => {
  const url = typeof item === 'string' ? item : item.url;
  const name = typeof item === 'string' ? url.split('/').pop() : item.name;
  return (
    <div key={i} style={{ position: "relative" }}>
      {url.match(/\.pdf$/i) || name.match(/\.pdf$/i) ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "80px", height: "80px", background: "#1e293b", borderRadius: "6px", border: "1px solid #334155", color: "#f1f5f9", fontSize: "28px", textDecoration: "none" }}>📄</a>
      ) : url.match(/\.(mp4|mov|avi|webm)$/i) ? (
        <video src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} />
      ) : (
        <img src={url} onClick={() => setLightbox(url)} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #334155", cursor: "pointer" }} alt="" />
      )}
      <button onClick={async () => {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
      }} style={{ position: "absolute", bottom: "-6px", left: "-6px", background: "#3b82f6", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⬇</button>
      <button onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))} style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", border: "none", borderRadius: "50%", width: "18px", height: "18px", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
})}
          </div>
        </div>
      </Field>

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave({ ...f, media: JSON.stringify(media) }); onClose(); }}>Save Inspection</Btn>
      </div>
    </div>
  );
}

function Inspections() {
  const [inspections, setInspections] = useState([]);
  const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    const [inspections, orders] = await Promise.all([api("/inspections"), api("/orders")]);
    setInspections(inspections || []);
    setOrders(orders || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = inspections.filter(i =>
    (i.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.inspector || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.result || "").toLowerCase().includes(search.toLowerCase())
  );

  const resultColors = { Approved: "#10b981", Rejected: "#ef4444", Conditional: "#f59e0b", Pending: "#64748b" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Inspections</h2>
        <Btn onClick={() => setModal(true)}>+ New Inspection</Btn>
      </div>
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, inspector or result…" style={{ ...inputStyle, marginBottom: "16px" }} />
      {modal && (
        <Modal title="New Inspection" onClose={() => setModal(false)} wide>
          <InspectionForm orders={orders} onSave={async b => { await api("/inspections", "POST", b); load(); }} onClose={() => setModal(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Inspection" onClose={() => setEditing(null)} wide>
          <InspectionForm orders={orders} initial={{ ...editing, media: editing.media ? (typeof editing.media === 'string' ? JSON.parse(editing.media) : editing.media) : [] }}
            onSave={async b => { await api(`/inspections/${editing.id}`, "PUT", b); load(); }}
            onClose={() => setEditing(null)} />
        </Modal>
      )}
      <Table
        cols={[
          { label: "Number", render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Order", render: r => { const o = orders.find(o => o.id === Number(r.order_id)); return o ? `${o.order_number} – ${o.client}` : "—"; }},
          { label: "Date", render: r => fmtDate(r.inspection_date) },
          { label: "Inspector", key: "inspector" },
          { label: "Result", render: r => (
  <select value={r.result}
    onChange={async e => { await api(`/inspections/${r.id}`, "PUT", { ...r, status: r.status, result: e.target.value }); load(); }}
    style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto", color: resultColors[r.result] || "#64748b" }}>
    {["Pending","Approved","Rejected","Conditional"].map(s => <option key={s}>{s}</option>)}
  </select>
)},
          { label: "Report", render: r => {
  let hasMedia = false;
  try {
    const media = typeof r.media === 'string' ? JSON.parse(r.media) : (r.media || []);
    hasMedia = media.filter(Boolean).length > 0;
  } catch { hasMedia = false; }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: hasMedia ? "#10b981" : "#ef4444" }}>
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: hasMedia ? "#10b981" : "#ef4444", display: "inline-block" }} />
      {hasMedia ? "Attached" : "Missing"}
    </span>
  );
}},
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/inspections/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No inspections yet."
      />
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "orders", label: "Orders", icon: "📋" },
  { id: "clients", label: "Clients", icon: "🏢" },
  { id: "suppliers", label: "Suppliers", icon: "🏭" },
  { id: "products", label: "Products", icon: "🗂" },
  { id: "samples", label: "Samples", icon: "✏️" },
  { id: "quotations", label: "Quotations", icon: "💬" },
  { id: "inspections", label: "Inspections", icon: "🔍" },
  { id: "proformas", label: "Proformas", icon: "📄" },
  { id: "commercial", label: "Commercial", icon: "🧾" },
  { id: "contracts", label: "Contracts", icon: "🤝" },
  { id: "fin-clients", label: "Client Flow", icon: "💰" },
  { id: "fin-suppliers", label: "Supplier Flow", icon: "📦" },
];

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

const SENHA = "hkag2026";

export default function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (!autenticado) {
    return (
      <div style={{
        minHeight: "100vh", background: "#020617", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
          padding: "40px 48px", width: "100%", maxWidth: "380px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "24px",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Alliance Global System</div>
            <div style={{ fontSize: "12px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>Order Management</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
            <input
              type="password"
              value={senha}
              onChange={e => { setSenha(e.target.value); setErro(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (senha === SENHA) setAutenticado(true);
                  else setErro(true);
                }
              }}
              placeholder="Enter password…"
              style={{
                background: "#1e293b", border: `1px solid ${erro ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box",
              }}
              autoFocus
            />
            {erro && <div style={{ color: "#ef4444", fontSize: "12px" }}>Incorrect password. Try again.</div>}
            <button
              onClick={() => {
                if (senha === SENHA) setAutenticado(true);
                else setErro(true);
              }}
              style={{
                background: "#3b82f6", border: "none", borderRadius: "8px",
                padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600,
                cursor: "pointer", marginTop: "4px",
              }}
            >
              Enter
            </button>
          </div>
        </div>
      </div>
    );
  }

const renderTab = () => {
    switch (tab) {
      case "dashboard": return <Dashboard />;
      case "orders": return <Orders />;
      case "clients": return <Clients />;
      case "suppliers": return <Suppliers />;
      case "products": return <Products />;
      case "samples": return <Samples />;
      case "quotations": return <Quotations />;
      case "inspections": return <Inspections />;
      case "proformas": return <Proformas />;
      case "commercial": return <CommercialInvoices />;
      case "contracts": return <Contracts />;
      case "fin-clients": return <Financial type="client" />;
      case "fin-suppliers": return <Financial type="supplier" />;
      default: return null;
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #020617; font-family: 'DM Sans', sans-serif; color: #cbd5e1; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
        input:focus, select:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
      `}</style>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside style={{
          width: sidebarOpen ? "220px" : "60px", background: "#0a0f1e",
          borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column",
          transition: "width 0.2s ease", flexShrink: 0, position: "sticky", top: 0, height: "100vh",
        }}>
          <div style={{ padding: "20px 16px", borderBottom: "1px solid #1e293b" }}>
            {sidebarOpen ? (
              <div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>ExportFlow</div>
                <div style={{ fontSize: "10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Order Management</div>
              </div>
            ) : (
              <div style={{ fontSize: "20px", textAlign: "center" }}>⬡</div>
            )}
          </div>
          <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: tab === t.id ? "#1e293b" : "transparent",
                  color: tab === t.id ? "#f1f5f9" : "#64748b",
                  fontFamily: "inherit", fontSize: "13px", fontWeight: tab === t.id ? 600 : 400,
                  textAlign: "left", transition: "all 0.1s",
                  borderLeft: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = "#94a3b8"; }}
                onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = "#64748b"; }}
              >
                <span style={{ fontSize: "16px", flexShrink: 0, width: "20px", textAlign: "center" }}>{t.icon}</span>
                {sidebarOpen && <span style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{t.label}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding: "12px 8px", borderTop: "1px solid #1e293b" }}>
            <button onClick={() => setSidebarOpen(o => !o)}
              style={{
                width: "100%", padding: "8px", background: "none", border: "none",
                color: "#475569", cursor: "pointer", fontSize: "16px", borderRadius: "6px",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "#94a3b8"}
              onMouseLeave={e => e.currentTarget.style.color = "#475569"}
            >{sidebarOpen ? "◀" : "▶"}</button>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: "32px", minWidth: 0 }}>
          <div style={{
            background: "#0a1628", border: "1px solid #1e293b", borderRadius: "16px",
            padding: "28px", minHeight: "calc(100vh - 64px)",
          }}>
            {renderTab()}
          </div>
        </main>
      </div>
    </>
  );
}
