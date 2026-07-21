import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// The business calls mainland China's currency "RMB" everywhere client-
// facing, even though its stored/ISO code (CNY) is what Intl.NumberFormat
// needs internally. This relabels the raw code wherever it's shown as text.
const currencyLabel = (cur) => (cur === "CNY" ? "RMB" : cur);

const fmt = (n, cur = "USD") => {
  if (n == null) return "—";
  if (cur === "CNY") {
    return `RMB ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n);
};

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US") : "—");

// ─── INPUT MASKS ────────────────────────────────────────────────────────────
// Auto-format the punctuation into these fields as the person types (instead
// of requiring them to type the dots/dashes/slashes/parentheses themselves),
// matching how CEP, CNPJ and phone numbers are always displayed in Brazil.
// Clients/suppliers here aren't all Brazilian, though (Chinese suppliers,
// importers elsewhere), so every mask backs off and returns the text
// untouched — instead of silently mangling it — the moment it looks like it
// isn't a Brazilian-format value: contains letters (many countries' postal
// codes and tax IDs are alphanumeric), starts with "+" (international phone
// prefix), or already has more digits than the Brazilian format ever has.

// 00000-000
const maskCEP = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 8) return raw;
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

// 00.000.000/0000-00
const maskCNPJ = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 14) return raw;
  if (d.length > 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length > 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  if (d.length > 5) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
};

// (00) 00000-0000 — also degrades correctly for an 8-digit landline
// ((00) 0000-0000) since the split point depends on the digit count typed
// so far, not a fixed mobile-only pattern.
const maskPhone = (v) => {
  const raw = v || "";
  if (raw.trim().startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 11) return raw;
  if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length > 0) return `(${d}`;
  return d;
};

// 0000.00.00 — Brazilian customs tariff code (NCM), always 8 digits grouped
// 4.2.2. HS Code is left unmasked since it's an international field entered
// in whatever grouping the person's customs paperwork already uses.
const maskNCM = (v) => {
  const raw = v || "";
  if (/[a-zA-Z]/.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length > 8) return raw;
  if (d.length > 6) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  if (d.length > 4) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return d;
};

// Live thousands-separator + decimal formatting for money amounts
// (1.234,56) — digits fill in as cents from the right, the same behavior
// every Brazilian banking/POS amount field uses (type "150000", see
// "1.500,00" appear). This is the only style of live mask that survives
// being re-applied to its own previous output on every keystroke: once the
// mask has inserted a "." as a thousands separator, that character is
// visually indistinguishable from a decimal point the person typed
// themselves, so re-deriving "where's the decimal" from the punctuation in
// the string (instead of always from raw digit count) breaks the moment
// more digits are typed after it. Safe to feed straight into
// parseLocaleNumber(), which every price field's save path already uses.
const maskMoney = (v) => {
  const raw = v == null ? "" : String(v);
  // Strip ALL leading zeros (not just ones followed by another digit) so
  // that repeatedly backspacing a typed amount actually reaches a fully
  // empty field instead of getting stuck floored at "0,00" forever.
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const intPart = padded.slice(0, -2).replace(/^0+/, "") || "0";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${cents}`;
};

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
  "Ilhéus, BR", "Cabedelo, BR", "Pecém, BR", "Itapoá, BR", "Itaguaí, BR",
  "Itaqui, BR", "São Sebastião, BR", "Barra do Riacho, BR", "Areia Branca, BR",
  "Antonina, BR", "Cotegipe, BR", "Praia Mole, BR", "Tubarão, BR",
  "Itacoatiara, BR", "Barcarena, BR", "Vila do Conde, BR", "Macapá, BR",
  "Niterói, BR", "Forno, BR", "Itaperi, BR", "Camaçari, BR", "Guarujá, BR",
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

// Generic value+unit → meters conversion (mm/cm/m/in), used wherever a
// dimension field needs converting regardless of which unit it was entered
// in — Width and Roll Diameter both use this for the Packing List's actual
// rolled-cylinder CBM calculation below.
const toMeters = (value, unit) => {
  const v = parseFloat(value) || 0;
  if (unit === "mm") return v * 0.001;
  if (unit === "cm") return v * 0.01;
  if (unit === "in") return v * 0.0254;
  return v; // m
};

// Actual physical volume of one finished Textile/DTF Film roll — a cylinder
// whose circular face is the rolled diameter (product.roll_diameter, tube
// included) and whose axial length is the fabric's width. This is a real
// measurement of the roll itself, independent of which container it ends up
// in — unlike the old fallback (splitting a container's flat nominal
// capacity proportionally by weight share), which only approximates how
// much of a container two differently-shaped rolls actually take up.
// Returns null when the product doesn't have a registered diameter yet, so
// callers can fall back to the capacity-based estimate for those.
const rollVolumeM3 = (product) => {
  if (!product || !product.roll_diameter || !product.width) return null;
  const diameterM = toMeters(product.roll_diameter, product.roll_diameter_unit || "cm");
  const widthM = toMeters(product.width, product.width_unit || "cm");
  if (!diameterM || !widthM) return null;
  return Math.PI * (diameterM / 2) ** 2 * widthM;
};

// The registered per-meter sale price on the product record — the 0%
// reference point the item's Margin % is measured against.
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

  // Value/Roll — the per-roll sale price (Value/Meter × Meters/Roll). Always
  // computed already (feeds Total), but editing it directly here lets the
  // user set the roll price by hand and have Value/Meter and Total follow,
  // same as editing any of the other three fields does.
  if (field === "unit_price") {
    const price = parseLocaleNumber(rawValue);
    const total = price != null && qty ? price * qty : null;
    const spm = price != null && heightM ? price / heightM : null;
    const pct = base != null && spm != null ? ((spm / base) - 1) * 100 : null;
    return {
      ...item,
      unit_price: rawValue,
      total: total != null ? total.toFixed(2) : item.total,
      sale_per_meter: spm != null ? spm.toFixed(2) : item.sale_per_meter,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }

  return item;
}

// The registered flat sale price on the product record — the 0% reference
// point for Margin % on every non-Textile/non-Chemical category (machines,
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
// reference point Margin % is measured against for Chemical/liquid items.
const registeredPerLiter = (product) => {
  const v = product ? parseFloat(product.sale_per_liter) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Converts a product's registered `weight` (already used elsewhere to
// compute an item's Total Weight in kg) into kg regardless of the unit it
// was entered in — g/m and g/m² are Textile-only per-length weight units
// and don't apply here, so they fall through to the plain kg branch same as
// an unset unit would.
const weightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};

// Tons per package — the Chemical/liquid-goods equivalent of volumeLOf(),
// used when a product is priced by the ton instead of by the liter (bulk
// chemicals are commonly quoted by weight, not drum volume). `weight` is
// the GROSS weight of one full package (drum + chemical inside) — this is
// what Gross Weight totals should multiply by, NOT what "how many drums
// for X tons" should divide by (that overcounts every drum by its own
// empty weight — see netTonsOf below for that).
const tonsOf = (product) => weightKgOf(product) / 1000;

// Weight of the chemical alone in one package (excluding the drum's own
// weight) — same unit conversions as weightKgOf, reading the separate
// `net_weight` field. Used specifically to derive a physical package/drum
// count from a tons-ordered figure (ProductItemModal's "≈ Drums" display,
// buildPackingListDraft's roll count, server.js's quantityLabel).
const netWeightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.net_weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};
const netTonsOf = (product) => netWeightKgOf(product) / 1000;

// GROSS weight of one full physical package (box + contents), for products
// sold in a unit that differs from how they're packed (see units_per_package
// below) — same conversions as weightKgOf, reading the separate
// `package_weight` field. Generalizes the Chemical drum pattern above
// (weightKgOf/netWeightKgOf) to any category: e.g. LED lights sold per PAIR,
// packed 500 pairs to a cardboard box.
const packageWeightKgOf = (product) => {
  if (!product) return 0;
  const v = parseFloat(product.package_weight) || 0;
  const wu = product.weight_unit || "kg";
  if (wu === "g") return v / 1000;
  if (wu === "lb") return v * 0.453592;
  if (wu === "oz") return v * 0.0283495;
  return v; // kg
};

// The registered per-ton sale price on the product record — the 0%
// reference point Margin % is measured against for Chemical items priced by
// the ton (see registeredPerLiter for the per-liter equivalent).
const registeredPerTon = (product) => {
  const v = product ? parseFloat(product.sale_per_ton) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Liquid-goods (Chemical category — sold in drums/barrels) equivalent of
// recalcTextileItem: two-way Margin % / Value-per-X / Total, converting
// through the product's registered drum volume. Ton-priced items work
// differently: Quantity there IS the ton figure directly (not a drum
// count — see item.price_basis and ProductItemModal's calcWeight), so the
// registered per-ton rate is already the unit price with no per-package
// conversion needed (perPackage = 1), same as a flat unit-price category.
function recalcLiquidItem(item, product, field, rawValue) {
  const isTon = item.price_basis === "ton";
  const rateKey = isTon ? "sale_per_ton" : "sale_per_liter";
  const perPackage = isTon ? 1 : volumeLOf(product);
  const qty = parseFloat(item.quantity) || 0;
  const base = isTon ? registeredPerTon(product) : registeredPerLiter(product);

  if (field === "sale_pct") {
    const pct = parseLocaleNumber(rawValue);
    const rate = base != null && pct != null ? base * (1 + pct / 100) : null;
    const unitPrice = rate != null && perPackage ? rate * perPackage : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    return {
      ...item,
      sale_pct: rawValue,
      [rateKey]: rate != null ? rate.toFixed(2) : item[rateKey],
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
    };
  }
  if (field === rateKey) {
    const rate = parseLocaleNumber(rawValue);
    const unitPrice = rate != null && perPackage ? rate * perPackage : null;
    const total = unitPrice != null && qty ? unitPrice * qty : null;
    const pct = base != null && rate != null ? ((rate / base) - 1) * 100 : null;
    return {
      ...item,
      [rateKey]: rawValue,
      unit_price: unitPrice != null ? unitPrice.toFixed(2) : item.unit_price,
      total: total != null ? total.toFixed(2) : item.total,
      sale_pct: pct != null ? pct.toFixed(2) : item.sale_pct,
    };
  }
  if (field === "total") {
    const total = parseLocaleNumber(rawValue);
    const price = total != null && qty ? total / qty : null;
    const rate = price != null && perPackage ? price / perPackage : null;
    const pct = base != null && rate != null ? ((rate / base) - 1) * 100 : null;
    return {
      ...item,
      total: rawValue,
      unit_price: price != null ? price.toFixed(4) : item.unit_price,
      [rateKey]: rate != null ? rate.toFixed(2) : item[rateKey],
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

// Shared inline Margin %/Value-per-X/Total editor for a single item row —
// used by both QuotationForm and OrderForm. Add Product only ever holds
// cost data, so this is the one place a sale price actually gets set; it
// needs to exist in the Order screen too (not just Quotation), since a
// custom price can legitimately end up different from whatever's currently
// registered on the Product, and Order items may be added/edited directly
// without ever going through a Quotation.
function PricingRow({ item, product, currency, onChange }) {
  const isTextile = item.category === "Textile" || item.category === "DTF Film";
  const isLiquid = item.category === "Chemical";
  const isTon = isLiquid && item.price_basis === "ton";
  const rateKey = isTon ? "sale_per_ton" : "sale_per_liter";
  // Live thousands-separator formatting on every money field here (Value/X,
  // Unit Price, Total) — Margin % is a percentage, not a money amount, so
  // it's left as plain typed digits.
  const moneyMask = (field, value) => (field === "sale_pct" ? value : maskMoney(value));
  const onPriceField = (field) => (e) => onChange(recalcTextileItem(item, product, field, moneyMask(field, e.target.value)));
  const onLiquidField = (field) => (e) => onChange(recalcLiquidItem(item, product, field, moneyMask(field, e.target.value)));
  const onSimpleField = (field) => (e) => onChange(recalcSimpleItem(item, product, field, moneyMask(field, e.target.value)));
  const pctHandler = isTextile ? onPriceField("sale_pct") : isLiquid ? onLiquidField("sale_pct") : onSimpleField("sale_pct");
  const totalHandler = isTextile ? onPriceField("total") : isLiquid ? onLiquidField("total") : onSimpleField("total");
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginTop: "8px", flexWrap: "wrap" }}>
      <label style={{ fontSize: "11px", color: "#64748b" }}>Margin %
        <input type="text" inputMode="decimal" value={item.sale_pct ?? ""} onChange={pctHandler}
          placeholder="0" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "70px" }} />
      </label>
      {isTextile ? (
        <>
          <label style={{ fontSize: "11px", color: "#64748b" }}>Value / Meter ({currencyLabel(currency)})
            <input type="text" inputMode="decimal" value={item.sale_per_meter ?? ""} onChange={onPriceField("sale_per_meter")}
              placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
          </label>
          {/* unit_price already holds Value/Meter × Meters/Roll (the per-roll
              sale value) — it was being computed but never actually shown,
              so there was no way to see what a single roll sells for
              without doing the math by hand. Editable in-place too: typing
              here recalculates Value/Meter and Total the same as editing
              any of the other three fields does. */}
          <label style={{ fontSize: "11px", color: "#64748b" }}>Value / Roll ({currencyLabel(currency)})
            <input type="text" inputMode="decimal" value={item.unit_price ?? ""} onChange={onPriceField("unit_price")}
              placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
          </label>
        </>
      ) : isLiquid ? (
        // Value / Liter or Value / Ton depending on how this Chemical item
        // is priced (item.price_basis, inherited from the product when it
        // was added) — the two rates are kept in separate fields
        // (sale_per_liter / sale_per_ton) so switching a product's basis
        // later doesn't silently reinterpret an old item's registered rate.
        <label style={{ fontSize: "11px", color: "#64748b" }}>Value / {isTon ? "Ton" : "Liter"} ({currencyLabel(currency)})
          <input type="text" inputMode="decimal" value={item[rateKey] ?? ""} onChange={onLiquidField(rateKey)}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      ) : (
        <label style={{ fontSize: "11px", color: "#64748b" }}>Unit Price ({currencyLabel(currency)})
          <input type="text" inputMode="decimal" value={item.unit_price ?? ""} onChange={onSimpleField("unit_price")}
            placeholder="0,00" style={{ ...inputStyle, display: "block", marginTop: "2px", padding: "6px 8px", fontSize: "12px", width: "100px" }} />
        </label>
      )}
      <label style={{ fontSize: "11px", color: "#64748b" }}>Total ({currencyLabel(currency)})
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
// Physical packaging/container types only (what the goods are actually
// packed in) — NOT what's being counted/sold (see SELLING_UNIT_OPTIONS
// below for that). Mixing the two into one list is what put "Pairs" here
// before, which then printed as if it were a package type.
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
  "IBC Tank",
  "Flex Tank",
];

// What's actually being counted/sold — separate concept from the physical
// package it ships in (a Unit or a Pair can just as easily go in a Box, a
// Crate, or a Bag). Only offered for categories that don't already have
// their own dedicated pricing unit (Chemical prices by liter/ton, Textile/
// DTF Film by the meter/roll — see the category check where this is used).
const SELLING_UNIT_OPTIONS = ["Unit", "Pair"];

// Shared list of product categories — used by Product registration, Sample
// registration, and the Supplier's Product Types field (so a supplier's
// declared specialties line up with the same categories products actually
// get registered under).
const PRODUCT_CATEGORIES = ["Textile", "Machine", "DTF Film", "Chemical", "Accessory", "Packaging", "Other"];

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

// Split-payment presets for Supplier Payments — each `parts` entry gets its
// own Payment Notice PDF (own amount slice + label), so a 20/80 deposit
// schedule generates two separate documents instead of one for the full
// amount.
const PAYMENT_SCHEDULES = {
  "100": { label: "100% (Single Payment)", parts: [{ pct: 100, label: "" }] },
  "20/80": { label: "20% Deposit / 80% Balance", parts: [{ pct: 20, label: "Deposit" }, { pct: 80, label: "Balance" }] },
  "30/70": { label: "30% Deposit / 70% Balance", parts: [{ pct: 30, label: "Deposit" }, { pct: 70, label: "Balance" }] },
  "50/50": { label: "50% / 50%", parts: [{ pct: 50, label: "1st Payment" }, { pct: 50, label: "2nd Payment" }] },
  // TT deposit against the rest due once the goods are on the Bill of
  // Lading — a common trade-finance term distinct from the generic
  // "Deposit / Balance" presets above (which don't say how each part is
  // actually settled). Each part's label feeds straight into the Payment
  // Notice PDF's purpose line (see the payment-notice-pdf route).
  "20TT/BL": { label: "20% TT / Balance Against BL", parts: [{ pct: 20, label: "TT" }, { pct: 80, label: "Balance Against BL" }] },
  "30TT/BL": { label: "30% TT / Balance Against BL", parts: [{ pct: 30, label: "TT" }, { pct: 70, label: "Balance Against BL" }] },
};

// For Textile / DTF Film items, the roll price is derived from a per-meter
// rate — show that rate alongside the roll total so it's clear where the
// number came from. `field` is "sale_per_meter" or "cost_per_meter".
const perMeterLabel = (item, field, cur) => {
  const isTextile = item?.category === "Textile" || item?.category === "DTF Film";
  const rate = item?.[field];
  if (!isTextile || !rate) return null;
  return `${fmt(parseFloat(rate), cur)}/m`;
};

// Module-level (not React state) so `api()` — called from dozens of places
// that aren't React components — can always read the current session token
// without it being threaded through props. Set once on login/logout via
// `setAuthToken`, which also mirrors it into localStorage so a page reload
// doesn't force everyone to log in again.
let authToken = null;
function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem("af_token", token);
  else localStorage.removeItem("af_token");
}
setAuthToken(typeof localStorage !== "undefined" ? localStorage.getItem("af_token") : null);

// PDF/Excel downloads open via window.open(url) — a plain browser
// navigation, not a fetch() call — so there's no way to attach the
// Authorization header the rest of the app uses. The backend's requireAuth
// middleware accepts the session token as a `?token=` query param as a
// fallback specifically for this case; this helper appends it correctly
// whether `path` already has its own query string or not.
function authUrl(path) {
  if (!authToken) return path;
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(authToken)}`;
}

async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Session is gone (logged out elsewhere, revoked, or just expired) —
    // clear it locally and bounce back to the login screen instead of
    // leaving the app stuck on a broken/half-loaded screen.
    setAuthToken(null);
    localStorage.removeItem("af_user");
    window.location.reload();
    throw new Error("Session expired");
  }
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
// `style` is destructured separately and merged AFTER the base inputStyle so
// that callers passing a custom style (e.g. a narrower width for an inline
// unit dropdown) only override what they specify — previously a passed-in
// `style` completely replaced inputStyle (spread order bug), which is why
// some unit dropdowns rendered with the browser's default white background
// instead of the app's dark theme.
function Select({ children, style, ...props }) { return <select style={{ ...inputStyle, cursor: "pointer", ...style }} {...props}>{children}</select>; }
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

// Small audit-trail tag shown at the end of each row's Actions column —
// who last created/edited that record. Every write route now stamps
// `updated_by` with the signed-in user's name (see backend/auth.js),
// replacing the old setup where nothing tracked who touched what.
function LastModifiedBy({ name }) {
  if (!name) return null;
  return (
    <span style={{ fontSize: "10.5px", color: "#475569", whiteSpace: "nowrap", alignSelf: "center" }} title="Last modified by">
      ✎ {name}
    </span>
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

// Builds a Packing List draft from an order's items, pulling as much as
// possible from the order/product records (color, width, weight spec,
// length, net weight already computed on the item). Roll count, gross
// weight and CBM are physical-packing specifics with no digital source, so
// gross weight defaults to net weight and roll defaults to the order item's
// quantity as starting points — both still editable afterwards.
// Shared at module level (used both from the Orders screen and the
// Commercial Invoice screen, where Packing Lists are now generated/edited).
function tubeWeightKg(value, unit) {
  const v = parseFloat(value);
  if (!v) return 0;
  if (unit === "g") return v / 1000;
  if (unit === "lb") return v * 0.453592;
  if (unit === "oz") return v * 0.0283495;
  return v; // kg
}

function buildPackingListDraft(order, products) {
  const baseItems = (order.items || []).map(item => {
    const product = products.find(p => Number(p.id) === Number(item.product_id));
    // Total Length only means anything for goods sold by the meter —
    // Textile/DTF Film rolls. Machines, chemicals and other quantity-based
    // goods get a Quantity column instead (same split used in the
    // Proforma/Commercial Invoice PDFs).
    const category = item.category || product?.category || "";
    const isTextile = category === "Textile" || category === "DTF Film";
    const totalLength = isTextile ? (parseFloat(item.total_meterage || item.quantity || 0) || 0) : null;
    // Round to 1 decimal here (not just at display time) so floating-point
    // artifacts from calcWeight (e.g. 26508.300000000003) never leak into
    // the draft's stored numbers.
    const round1 = n => Math.round(n * 10) / 10;
    const priceBasis = item.price_basis || product?.price_basis || null;
    const isTonChemical = category === "Chemical" && priceBasis === "ton";
    // Generalized version of the ton-priced Chemical case below, for any
    // OTHER category where the sold unit isn't the packed unit — e.g. LED
    // lights sold per PAIR, packed 500 pairs to a cardboard box
    // (units_per_package). Chemical keeps its own dedicated net_weight-based
    // path since that's a weight-based ratio, not a unit count.
    const perPackageUnits = (!isTonChemical && product?.units_per_package)
      ? parseFloat(product.units_per_package) || null : null;
    const perDrumTons = isTonChemical ? netTonsOf(product) : null;
    // For ton-priced Chemical items, item.quantity is the tons ordered, not
    // a physical package count (see recalcLiquidItem/ProductItemModal) — the
    // Packing List's "roll"/"Packages" field needs the real, whole number of
    // drums that corresponds to, derived from the product's registered NET
    // weight per drum (chemical alone) — dividing by the gross/full-drum
    // weight instead would undercount, since part of that figure is the
    // drum itself, not product. Products with units_per_package registered
    // (sold per pair/piece, packed N-to-a-box) get the same treatment, just
    // dividing by a unit count instead of a weight. Every other category
    // still uses quantity directly, since it already is a real package
    // count there.
    const rollCount = isTonChemical && perDrumTons > 0
      ? Math.round((parseFloat(item.quantity) || 0) / perDrumTons)
      : perPackageUnits > 0
      ? Math.round((parseFloat(item.quantity) || 0) / perPackageUnits)
      : (item.quantity != null && item.quantity !== "" ? parseFloat(item.quantity) || 0 : 0);
    // item.total_weight (computed in ProductItemModal via calcWeight, from
    // the product's registered net weight per roll) is the goods' Net
    // Weight — for ton-priced Chemical this is the idealized ordered tonnage
    // (qty × 1000). Gross Weight is the real physical total instead: for
    // Textile/DTF Film that's Net Weight plus the empty cardboard/plastic
    // tube core per roll; for ton-priced Chemical (or units_per_package
    // items) it's the actual (rounded) package count × the product's
    // registered per-package weight, which naturally differs a little from
    // the idealized Net figure since you can't ship a fractional package.
    const netWeightRaw = item.total_weight != null && item.total_weight !== "" ? parseFloat(item.total_weight) : null;
    const netWeight = netWeightRaw != null ? round1(netWeightRaw) : null;
    const tubeWeightPerRoll = isTextile ? tubeWeightKg(product?.tube_weight, product?.tube_weight_unit) : 0;
    const perPackageWeightKg = isTonChemical ? weightKgOf(product) : (perPackageUnits > 0 ? packageWeightKgOf(product) : 0);
    const grossWeight = netWeight != null
      ? ((isTonChemical || perPackageUnits > 0) && perPackageWeightKg > 0
          ? round1(rollCount * perPackageWeightKg)
          : round1(netWeight + tubeWeightPerRoll * rollCount))
      : null;
    // Real per-roll volume from the product's registered Roll Diameter, when
    // available — lets the CBM below be an actual physical measurement
    // instead of just a proportional slice of the container's nominal
    // capacity. `_cbmPerRoll` is transient (derived from the product record,
    // not something the Packing List itself should own) — stripped out
    // again before the draft is returned.
    const _cbmPerRoll = isTextile ? rollVolumeM3(product) : null;
    // Same split used server-side for Proforma/Commercial Invoice (see
    // splitDescription in server.js): the product's registered description
    // renders as its own paragraph (descriptionText), separate from the
    // bold product name above it — any further lines (e.g. a CAS number)
    // stay as a bulleted facts list underneath.
    const descLines = product?.description ? String(product.description).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    // "Width" only means something for Textile/DTF Film rolls — every other
    // category shows what unit the Quantity is expressed in instead (TON,
    // LITER, or the registered package unit), same as the PDF backend logic.
    const priceUnitLabel = !isTextile
      ? (category === "Chemical" ? (priceBasis === "ton" ? "TON" : "LITER") : (item.unit || product?.unit || "").toUpperCase())
      : null;
    // Ton-priced Chemical items: Quantity is stored directly in tons, so the
    // Quantity column needs its own label (tons + estimated drum count)
    // instead of the generic "{quantity} {unit}" — mirrors quantityLabel in
    // server.js's normalizeSalesItem. units_per_package products (sold per
    // pair/piece, packed N-to-a-box) deliberately do NOT get the same "(≈ N
    // packages)" annotation here — client docs for those just show the
    // plain sold quantity + unit (e.g. "35,000 Pairs"), same as any normal
    // item; the estimated package count is Packing-List-only information
    // (it already has its own real Packages column there).
    let quantityLabel = null;
    if (isTonChemical && item.quantity != null) {
      const drums = perDrumTons > 0 ? Math.round((parseFloat(item.quantity) || 0) / perDrumTons) : null;
      quantityLabel = `${item.quantity} t${drums ? ` (≈ ${drums} ${item.unit || "packages"})` : ""}`;
    }
    return {
      product_id: item.product_id,
      description: product?.name || item.product_name,
      descriptionText: descLines[0] || "",
      bullets: descLines.slice(1),
      ncm: product?.ncm || "",
      color: product?.color || "",
      width: product?.width ? `${product.width}${product.width_unit || ""}` : "",
      priceUnitLabel,
      weightSpec: product?.weight ? `${product.weight} ${product.weight_unit || ""}` : "",
      category,
      isTextile,
      price_basis: priceBasis,
      // NET tons of chemical (not the drum itself) represented by one
      // physical package/drum — lets downstream summaries (CI's "Packing
      // List Description" line) re-derive the traded tonnage for whatever
      // slice of `roll` ends up in each container, without needing to look
      // the product back up.
      tons_per_package: isTonChemical ? perDrumTons : null,
      // GROSS kg (full package, contents + packaging) of one package — what
      // PackingListForm's updateItemRoll needs to recompute Gross Weight
      // directly from Packages, since it doesn't have the products list to
      // look this back up. Deliberately separate from tons_per_package
      // above (net) — using the net figure here would undercount Gross
      // Weight by each drum/box's own tare. Covers both ton-priced Chemical
      // drums and any other units_per_package product (e.g. boxed pairs).
      gross_weight_per_package: (isTonChemical || perPackageUnits > 0) ? perPackageWeightKg : null,
      quantity: item.quantity != null ? item.quantity : null,
      quantityLabel,
      unit: item.unit || "",
      totalLength,
      // Physical package/drum count — for ton-priced Chemical this is
      // DERIVED from the tons ordered (see rollCount above), not the raw
      // order quantity, which means tons there rather than a package count.
      roll: rollCount,
      grossWeight: grossWeight != null ? grossWeight : "",
      netWeight: netWeight != null ? netWeight : "",
      // Auto-filled below from the roll's real volume (when the product has
      // a registered diameter) or the order's container info as a fallback;
      // still editable per-item afterwards either way.
      cbm: "",
      _cbmPerRoll,
    };
  });
  const acq = getAcqCompany(order.acquisition_company || "HK");

  // Multi-container shipments: split each item's roll count (and,
  // proportionally, its weight/length) across the order's containers, so
  // the Packing List/Commercial Invoice can show goods grouped by which
  // physical container they're loaded into — same as the client's own
  // reference documents ("Container 01: OOCU7979442", "Container 02: ...").
  // A single-container order (or one with no container info at all) keeps
  // exactly the old flat item list, just tagged onto one implicit container.
  const containerQty = Math.max(1, parseInt(order.container_qty) || 1);
  const containers = Array.from({ length: containerQty }, (_, i) => ({ seq: i + 1, code: "" }));

  let items;
  if (containerQty > 1) {
    // Every item gets a row in every container (even a "0" starting point)
    // rather than only the containers its default even split landed in —
    // that's what makes the allocation screen actually usable: the user can
    // freely move an item entirely from one container to another just by
    // editing the numbers, instead of being stuck with whichever container(s)
    // the automatic split happened to assign it to. Zero-roll rows are
    // filtered back out when the PDF is generated, so they never show up as
    // noise on the final document — only while allocating.
    items = [];
    baseItems.forEach(item => {
      const totalRoll = parseFloat(item.roll) || 0;
      // Default everything into Container 01 rather than spreading it evenly
      // across every container — an even split made both containers show
      // nonzero rolls for the same products right away, which read as "the
      // same items are in both containers" instead of an empty starting
      // point to allocate from. The user now moves rolls into Container 02+
      // by hand using the (still editable) zero-roll rows below.
      const rollShares = [totalRoll, ...Array(containerQty - 1).fill(0)];
      rollShares.forEach((rollShare, i) => {
        const fraction = totalRoll > 0 ? rollShare / totalRoll : 0;
        items.push({
          ...item,
          container_seq: i + 1,
          roll: rollShare,
          grossWeight: item.grossWeight !== "" ? Math.round(item.grossWeight * fraction * 10) / 10 : "",
          netWeight: item.netWeight !== "" ? Math.round(item.netWeight * fraction * 10) / 10 : "",
          totalLength: item.totalLength != null ? Math.round(item.totalLength * fraction * 100) / 100 : item.totalLength,
        });
      });
    });
  } else {
    items = baseItems.map(item => ({ ...item, container_seq: 1 }));
  }

  // CBM: real per-roll volume (from the product's Roll Diameter) takes
  // priority whenever it's available — it's an actual physical measurement
  // of that roll batch, not an estimate, so it doesn't need to be capped to
  // the container's nominal capacity. Only items whose product has no
  // registered diameter yet fall back to the old estimate: splitting the
  // container's flat usable capacity proportionally by weight share.
  items.forEach(i => {
    if (i._cbmPerRoll != null) {
      const rollCount = parseFloat(i.roll) || 0;
      i.cbm = rollCount > 0 ? Math.round(i._cbmPerRoll * rollCount * 100) / 100 : "";
    }
  });

  const CONTAINER_CBM = { "20' Standard": 33, "40' Standard": 67, "40' High Cube": 76 };
  const perContainerCbm = order.container && CONTAINER_CBM[order.container] ? CONTAINER_CBM[order.container] : null;
  if (perContainerCbm != null) {
    containers.forEach(c => {
      // Only split CBM across rows that actually start with rolls allocated
      // to this container, and that don't already have a real per-roll
      // volume computed above — the zero-roll padding rows (there so the
      // user can reallocate into them later) shouldn't soak up a share of
      // CBM either way.
      const containerItems = items.filter(i => i.container_seq === c.seq && (parseFloat(i.roll) || 0) > 0 && i._cbmPerRoll == null);
      if (!containerItems.length) return;
      const grossSum = containerItems.reduce((s, i) => s + (parseFloat(i.grossWeight) || 0), 0);
      containerItems.forEach(i => {
        const share = grossSum > 0 ? (parseFloat(i.grossWeight) || 0) / grossSum : 1 / containerItems.length;
        i.cbm = Math.round(perContainerCbm * share * 100) / 100;
      });
    });
  }

  // `_cbmPerRoll` was only ever a scratch value derived from the product
  // record to compute the line above — strip it before the draft is
  // returned so it doesn't get persisted into items_json as if it were part
  // of the Packing List's own data.
  items.forEach(i => { delete i._cbmPerRoll; });

  const totals = items.reduce((acc, i) => ({
    totalLength: acc.totalLength + (parseFloat(i.totalLength) || 0),
    totalRoll: acc.totalRoll + (parseFloat(i.roll) || 0),
    totalGrossWeight: acc.totalGrossWeight + (parseFloat(i.grossWeight) || 0),
    totalNetWeight: acc.totalNetWeight + (parseFloat(i.netWeight) || 0),
    totalCbm: acc.totalCbm + (parseFloat(i.cbm) || 0),
  }), { totalLength: 0, totalRoll: 0, totalGrossWeight: 0, totalNetWeight: 0, totalCbm: 0 });
  totals.totalLength = Math.round(totals.totalLength * 100) / 100;
  totals.totalGrossWeight = Math.round(totals.totalGrossWeight * 10) / 10;
  totals.totalNetWeight = Math.round(totals.totalNetWeight * 10) / 10;
  totals.totalCbm = Math.round(totals.totalCbm * 100) / 100;

  return {
    order_id: order.id,
    // Same format as the Commercial Invoice number — just "PL-" plus the
    // order's own code, no "ORD-" prefix carried over and no random
    // trailing digits (those made every generated number look different
    // from the order it actually belongs to, e.g. "PL-ORD-AGNB26.044-2974"
    // instead of the expected "PL-AGNB26.044").
    number: `PL-${String(order.order_number || "").replace(/^ORD-/, "")}`,
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
    // Container codes (e.g. "OOCU7979442") start blank — filled in on the
    // Packing List screen. Only meaningful (and only shown in the UI/PDF)
    // when there's more than one container.
    _containers: containers,
    containers_json: JSON.stringify(containers),
    total_length: totals.totalLength, total_roll: totals.totalRoll,
    total_gross_weight: totals.totalGrossWeight, total_net_weight: totals.totalNetWeight, total_cbm: totals.totalCbm,
    status: "Draft",
    notes: "",
  };
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

  
  // heightOverride/heightUnitOverride let a Quotation/Order item use a
  // different roll length than what's registered on the product (e.g. a
  // custom length requested by the client), same as the editable Height
  // field on Product registration.
  const calcWeight = (product, quantity, heightOverride, heightUnitOverride) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  if (!qty) return null;

  const category = product.category || "";
  const wu = product.weight_unit || "kg";

  // Chemical items priced by the ton are entered directly in tons (not
  // number of drums — see price_basis) — Quantity IS the weight, so Total
  // Weight is just that converted to kg, not quantity × registered
  // per-drum weight (which would treat the tons figure as a drum count).
  if (category === "Chemical" && product.price_basis === "ton") {
    return qty * 1000;
  }

  const w = parseFloat(product.weight) || 0;
  if (!w) return null;

  // Cálculo complexo apenas para Textile e DTF Film
  if (category === "Textile" || category === "DTF Film") {
    const hRaw = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? heightOverride : product.height;
    const hUnit = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? (heightUnitOverride || product.height_unit) : product.height_unit;
    const h = parseFloat(hRaw) || 0;
    const width = parseFloat(product.width) || 0;
    if (!h) return null;

    if (wu === "g/m²") {
      const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
      const widthM = width * (product.width_unit === "cm" ? 0.01 : product.width_unit === "mm" ? 0.001 : 1);
      return (w / 1000) * widthM * heightM * qty;
    } else if (wu === "g/m") {
      const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
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
  const isTon = isLiquid && p.price_basis === "ton";
  const h = parseFloat(p.height) || 0;
  const heightM = p.height_unit === "cm" ? h * 0.01 : p.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(p);

  // Ton-priced Chemical items are quoted/ordered directly in tons (the
  // Quantity field IS the ton figure, not a drum count — see calcWeight
  // above and the Quantity field's dynamic label below), so the per-ton
  // rate registered on the product IS the unit price already. No
  // per-package conversion here, unlike per-liter (where Quantity really
  // is a drum count and the rate has to be multiplied by liters/drum first).
  const salePrice = isTextile && p.sale_per_meter && heightM
    ? (parseFloat(p.sale_per_meter) * heightM).toFixed(2)
    : isTon && p.sale_per_ton
    ? parseFloat(p.sale_per_ton).toFixed(2)
    : isLiquid && p.sale_per_liter && volL
    ? (parseFloat(p.sale_per_liter) * volL).toFixed(2)
    : p.sale_price || p.unit_cost || "";

  const costPrice = isTextile && p.cost_per_meter && heightM
    ? (parseFloat(p.cost_per_meter) * heightM).toFixed(2)
    : isTon && p.cost_per_ton
    ? parseFloat(p.cost_per_ton).toFixed(2)
    : isLiquid && p.cost_per_liter && volL
    ? (parseFloat(p.cost_per_liter) * volL).toFixed(2)
    : p.unit_cost || "";

  setItem(prev => ({
    ...prev,
    product_id: p.id,
    product_name: p.name,
    product_code: p.code,
    supplier: p.supplier || "",
    // Chemical/Textile/DTF Film default to the product's registered package
    // type (drum size, "Rolls"...) — every other category defaults to the
    // product's own registered Sold By setting (Unit/Pair), not the
    // Package field, since that's a physical container type, not what's
    // being counted/sold.
    unit: (p.category === "Chemical" || p.category === "Textile" || p.category === "DTF Film") ? (p.unit || "unit") : (p.selling_unit || "Unit"),
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
    // Which rate basis this item was priced under — carried onto the item
    // itself (not just read from the product) so it keeps rendering
    // correctly even if the product's own Price Basis is changed later.
    price_basis: isLiquid ? (p.price_basis || "liter") : null,
    sale_per_ton: isTon ? (p.sale_per_ton || null) : null,
    cost_per_ton: isTon ? (p.cost_per_ton || null) : null,
    // Margin % now applies to every category, not just Textile/DTF — and
    // starts from whatever default margin is registered on the product
    // itself (instead of always 0), since it's usually the same standard
    // margin reused quote after quote.
    sale_pct: p.sale_pct != null && p.sale_pct !== "" ? String(p.sale_pct) : "0",
    // Default the per-item length to the product's registered roll length —
    // editable below for Textile/DTF Film items when this specific quote or
    // order needs a different meterage.
    height: (p.category === "Textile" || p.category === "DTF Film") ? (p.height || "") : "",
    height_unit: p.height_unit || "cm",
  }));
  setShowList(false);
};

const calcMeterage = (product, quantity, heightOverride, heightUnitOverride) => {
  if (!product || !quantity) return null;
  const qty = parseFloat(quantity) || 0;
  const hRaw = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? heightOverride : product.height;
  const hUnit = heightOverride !== undefined && heightOverride !== null && heightOverride !== "" ? (heightUnitOverride || product.height_unit) : product.height_unit;
  const h = parseFloat(hRaw) || 0;
  if (!h || !qty) return null;
  const heightM = h * (hUnit === "cm" ? 0.01 : hUnit === "mm" ? 0.001 : 1);
  return heightM * qty;
};

const handleQtyChange = (e) => {
  const qty = e.target.value;
  const total = qty && item.unit_price ? (parseFloat(qty) * parseFloat(item.unit_price)).toFixed(2) : "";
  const weight = selectedProduct ? calcWeight(selectedProduct, qty, item.height, item.height_unit) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, qty, item.height, item.height_unit) : null;
  setItem(prev => ({ ...prev, quantity: qty, total, total_weight: weight, total_meterage: meterage }));
};

const handleHeightChange = (e) => {
  const h = e.target.value;
  const weight = selectedProduct ? calcWeight(selectedProduct, item.quantity, h, item.height_unit) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, item.quantity, h, item.height_unit) : null;
  setItem(prev => ({ ...prev, height: h, total_weight: weight, total_meterage: meterage }));
};

const handleHeightUnitChange = (e) => {
  const hu = e.target.value;
  const weight = selectedProduct ? calcWeight(selectedProduct, item.quantity, item.height, hu) : null;
  const meterage = selectedProduct ? calcMeterage(selectedProduct, item.quantity, item.height, hu) : null;
  setItem(prev => ({ ...prev, height_unit: hu, total_weight: weight, total_meterage: meterage }));
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
                    {p.sale_price ? <span style={{ float: "right", color: "#10b981" }}>{currencyLabel(p.sale_currency || "USD")} {p.sale_price}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
        <Field label={(item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") ? "Unit" : "Sold By"} half>
  {(item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") ? (
    // Chemical (drums/tanks) and Textile/DTF Film (rolls) are already
    // counted in a physical package unit, so the package-type list applies
    // directly here.
    <Select value={item.unit || ""} onChange={e => setItem(p => ({ ...p, unit: e.target.value }))}>
      <option value="">Select...</option>
      {PACKAGE_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  ) : (
    // Every other category: what's being counted/sold (Unit or Pair) is a
    // separate concept from what it's physically packed in — a pair of LED
    // lights still ships in a Box, it just isn't priced or counted as one.
    // This is what actually prints as the Unit column on client documents.
    <Select value={item.unit || ""} onChange={e => setItem(p => ({ ...p, unit: e.target.value }))}>
      <option value="">Select...</option>
      {SELLING_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  )}
</Field>
        <Field label={selectedProduct && selectedProduct.category === "Chemical" && selectedProduct.price_basis === "ton" ? "Quantity (Tons)" : "Quantity"} half>
          <Input type="number" value={item.quantity} onChange={handleQtyChange} placeholder="0" />
        </Field>
        {(item.category === "Textile" || item.category === "DTF Film") && (
          <Field label="Length per Roll (Meters)" half>
            <div style={{ display: "flex", gap: "6px" }}>
              <Input value={item.height || ""} onChange={handleHeightChange} placeholder="0" style={{ flex: 1 }} />
              <Select value={item.height_unit || "cm"} onChange={handleHeightUnitChange} style={{ width: "80px", cursor: "pointer" }}>
                {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
              </Select>
            </div>
          </Field>
        )}
        <Field label="Supplier">
          <Input value={item.supplier || ""} onChange={e => setItem(p => ({ ...p, supplier: e.target.value }))} placeholder="Auto-filled from product" />
        </Field>
<Field label={`Cost Price (${currencyLabel(item.cost_currency || "USD")})`}>
  <Input type="text" inputMode="decimal" value={item.cost_price || ""} onChange={e => setItem(prev => ({ ...prev, cost_price: maskMoney(e.target.value) }))} placeholder="0.00" />
  {/* Registered Sale Price shown right below Cost Price, for reference
      while pricing this specific item — no need to flip back to the
      Products screen just to check what it's normally sold for. */}
  {selectedProduct && selectedProduct.sale_price ? (
    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
      Registered Sale Price: {currencyLabel(selectedProduct.sale_currency || "USD")} {parseFloat(selectedProduct.sale_price).toFixed(2)}
    </div>
  ) : null}
</Field>
{/* Total Weight only means something for goods actually priced/tracked by
    weight or volume (Chemical) or where the registered weight spec is part
    of the trade itself (Textile/DTF Film rolls) — for everything else
    (Unit/Pair-counted goods) it's not what's being decided on this screen,
    so it stays out of the way here. The weight is still computed and saved
    in the background either way, for the Packing List's Gross Weight total. */}
{(item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") && (
  <Field label="Total Weight" half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_weight ? "#10b981" : "#475569", fontWeight: item.total_weight ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {item.total_weight ? `${item.total_weight.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : "—"}
    </div>
  </Field>
)}
{selectedProduct && selectedProduct.category === "Chemical" && selectedProduct.price_basis === "ton" ? (
  // Ton-priced Chemical items: Quantity is entered directly in tons, so
  // this box repurposes the (otherwise unused, Textile-only) meterage slot
  // to show the estimated drum/package count that quantity corresponds to
  // — purely informational. Divides by the product's registered NET weight
  // per package (chemical only, not the drum itself) — dividing by the
  // gross/full-drum weight would undercount how many drums are actually
  // needed, since part of each drum's weight is the drum, not product.
  <Field label={`≈ Drums (${selectedProduct.unit || "package"})`} half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#f59e0b", fontWeight: 700, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {(() => {
        const t = netTonsOf(selectedProduct);
        const qty = parseFloat(item.quantity) || 0;
        if (!t || !qty) return selectedProduct.net_weight ? "—" : "Set Net Weight on product";
        return `≈ ${Math.round(qty / t).toLocaleString("pt-BR")} ${selectedProduct.unit || "packages"}`;
      })()}
    </div>
  </Field>
) : selectedProduct && parseFloat(selectedProduct.units_per_package) > 0 ? (
  // Generalized version of the "≈ Drums" box above, for any OTHER category
  // sold in a unit that isn't the packed unit — e.g. LED lights sold per
  // PAIR, packed 500 pairs to a box. Same purely-informational role. Not
  // `half` — Total Weight is hidden for this category (see above), so
  // there's nothing left to pair it with.
  <Field label="≈ Packages">
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#f59e0b", fontWeight: 700, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {(() => {
        const perPackage = parseFloat(selectedProduct.units_per_package) || 0;
        const qty = parseFloat(item.quantity) || 0;
        if (!perPackage || !qty) return "—";
        return `≈ ${Math.round(qty / perPackage).toLocaleString("pt-BR")} packages`;
      })()}
    </div>
  </Field>
) : (item.category === "Chemical" || item.category === "Textile" || item.category === "DTF Film") ? (
  // Meterage/liter-priced Chemical fallback — pairs with the Total Weight
  // box above for these three categories, same as before. Not shown at all
  // for the generic Unit/Pair-counted category (nothing to show — there's
  // no meterage concept there, and Total Weight is already hidden too).
  <Field label="Total Meterage" half>
    <div style={{ background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: item.total_meterage ? "#60a5fa" : "#475569", fontWeight: item.total_meterage ? 700 : 400, border: "1px solid #334155", minHeight: "42px", display: "flex", alignItems: "center" }}>
      {item.total_meterage ? `${item.total_meterage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m` : "—"}
    </div>
  </Field>
) : null}
        <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
          <Btn onClick={() => {
            // cost_price displays with live thousands-separator formatting
            // (maskMoney) while editing — convert back to a plain number
            // before it joins the item list (which ultimately gets sent to
            // the backend's REAL cost_price column).
            onSave({ ...item, cost_price: item.cost_price !== "" && item.cost_price != null ? (parseLocaleNumber(item.cost_price) ?? item.cost_price) : item.cost_price });
            onClose();
          }}>
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
    // Value displays with live thousands-separator formatting (maskMoney)
    // while editing — convert back to a plain number here. Same cleanup as
    // QuotationForm's cleanedItems for the item rows themselves, since
    // Order items go through this same PricingRow editor and can just as
    // easily end up holding BR-formatted text in whichever field was last
    // typed into directly.
    const cleanedItems = items.map(item => ({
      ...item,
      total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
      unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
      sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
      sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
      sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
      sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
      target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
    }));
    await onSave({ ...f, value: parseLocaleNumber(f.value) ?? 0, items: cleanedItems });
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
         <Input type="text" inputMode="decimal" value={f.value} onChange={e => setF(p => ({ ...p, value: maskMoney(e.target.value) }))} placeholder="0.00" />
        </Field>
        <Field label="Currency" half>
          <Select value={f.currency} onChange={set("currency")}>
            <option>USD</option><option>EUR</option><option>BRL</option><option value="CNY">RMB</option><option value="HKD">HKD</option>
          </Select>
        </Field>
        <Field label="Prod. Lead Time (days)" half>
          <Input type="number" value={f.production_lead_time} onChange={set("production_lead_time")} />
        </Field>
        {/* Plain text, not a number input — this can end up printed on the
            Commercial Invoice PDF too (as a fallback when the Proforma's own
            Delivery at Port field is blank — see server.js), which now
            accepts a free-text note instead of only a day-count. */}
        <Field label="Delivery Days (after TT payment, or a note)" half>
          <Input value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
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
  tube_weight: "", tube_weight_unit: "kg",
  roll_diameter: "", roll_diameter_unit: "cm",
  volume: "", volume_unit: "L",
  unit_cost: "", cost_currency: "USD",
  sale_price: "", sale_currency: "USD", sale_pct: "",
  cost_per_meter: "", sale_per_meter: "",
  cost_per_liter: "", sale_per_liter: "",
  // Chemical goods can be priced by the liter (drum volume, the original
  // behavior) or by the ton (gross weight) — some suppliers quote bulk
  // chemicals by weight instead of volume. price_basis picks which of the
  // two rate fields below is the one actually driving Cost/Sale Price.
  price_basis: "liter",
  cost_per_ton: "", sale_per_ton: "",
  // Informational only — not used in any pricing calculation, just a
  // reference note shown next to Margin % for whoever's pricing the item.
  vat_pct: "",
  // What's counted/sold (Unit or Pair) for categories that don't already
  // have their own pricing unit (Chemical=liter/ton, Textile/DTF=meter) —
  // see the Sold By field below.
  selling_unit: "Unit",
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

  // Auto-generate the next sequential Product Code for new products (never
  // overwrites an existing product's code when editing). Looks at every
  // purely-numeric code already registered and picks the next number,
  // starting at 001 if none exist yet — still editable afterwards in case
  // a manual code is needed.
  useEffect(() => {
    if (initial) return;
    api("/products").then(products => {
      const maxNum = (products || []).reduce((max, p) => {
        const match = String(p.code || "").trim().match(/^(\d+)$/);
        if (!match) return max;
        return Math.max(max, parseInt(match[1], 10));
      }, 0);
      const next = String(maxNum + 1).padStart(3, "0");
      setF(p => (p.code ? p : { ...p, code: next }));
    });
  }, []);

  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

const handleCostChange = (e) => {
  const masked = maskMoney(e.target.value);
  const cost = parseLocaleNumber(masked) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const cpm = heightM > 0 ? (cost / heightM).toFixed(4) : f.cost_per_meter;
  const cpl = volL > 0 ? (cost / volL).toFixed(4) : f.cost_per_liter;
  const cpt = tons > 0 ? (cost / tons).toFixed(4) : f.cost_per_ton;
  setF((p) => ({
    ...p, unit_cost: masked,
    cost_per_meter: heightM > 0 ? cpm : p.cost_per_meter,
    cost_per_liter: volL > 0 ? cpl : p.cost_per_liter,
    cost_per_ton: tons > 0 ? cpt : p.cost_per_ton,
  }));
};

  // Margin % used to be measured against Cost Price (sale_pct = ((sale/cost)
  // - 1) * 100), which produced confusing/negative values whenever cost
  // wasn't filled in yet or was in a different currency than the sale price.
  // It's now a one-way "bump the sale price by X%" action with no relation
  // to cost at all — it takes whatever Sale Price was set when the field was
  // focused (markupBaseRef, snapshotted below) and adds the percentage on
  // top of that, same direction as the Quotation/Order screens' Margin %
  // (which is likewise always measured against a sale price, never cost).
  const markupBaseRef = useRef(null);

  const handleSalePriceChange = (e) => {
  const masked = maskMoney(e.target.value);
  const sale = parseLocaleNumber(masked) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const spm = heightM > 0 ? (sale / heightM).toFixed(4) : f.sale_per_meter;
  const spl = volL > 0 ? (sale / volL).toFixed(4) : f.sale_per_liter;
  const spt = tons > 0 ? (sale / tons).toFixed(4) : f.sale_per_ton;
  setF((p) => ({
    ...p, sale_price: masked,
    sale_per_meter: heightM > 0 ? spm : p.sale_per_meter,
    sale_per_liter: volL > 0 ? spl : p.sale_per_liter,
    sale_per_ton: tons > 0 ? spt : p.sale_per_ton,
  }));
};

const handleMarkupFocus = () => {
  markupBaseRef.current = parseLocaleNumber(f.sale_price) || 0;
};

const handleSalePctChange = (e) => {
  const pctStr = e.target.value;
  const pct = parseFloat(pctStr);
  const base = markupBaseRef.current != null ? markupBaseRef.current : (parseLocaleNumber(f.sale_price) || 0);
  const canCalc = base > 0 && !isNaN(pct);
  const sale = canCalc ? base * (1 + pct / 100) : null;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const volL = volumeLOf(f);
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  setF((p) => ({
    ...p, sale_pct: pctStr,
    sale_price: canCalc ? maskMoney(sale.toFixed(2)) : p.sale_price,
    sale_per_meter: canCalc && heightM > 0 ? (sale / heightM).toFixed(4) : p.sale_per_meter,
    sale_per_liter: canCalc && volL > 0 ? (sale / volL).toFixed(4) : p.sale_per_liter,
    sale_per_ton: canCalc && tons > 0 ? (sale / tons).toFixed(4) : p.sale_per_ton,
  }));
};

const handleCostPerMeterChange = (e) => {
  const cpm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const unit_cost = maskMoney((cpm * heightM).toFixed(2));
  setF((p) => ({ ...p, cost_per_meter: e.target.value, unit_cost: heightM > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerMeterChange = (e) => {
  const spm = parseFloat(e.target.value) || 0;
  const h = parseFloat(f.height) || 0;
  const heightM = f.height_unit === "cm" ? h * 0.01 : f.height_unit === "mm" ? h * 0.001 : h;
  const sale_price = maskMoney((spm * heightM).toFixed(2));
  setF((p) => ({
    ...p, sale_per_meter: e.target.value,
    sale_price: heightM > 0 ? sale_price : p.sale_price,
  }));
};

const handleCostPerLiterChange = (e) => {
  const cpl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const unit_cost = maskMoney((cpl * volL).toFixed(2));
  setF((p) => ({ ...p, cost_per_liter: e.target.value, unit_cost: volL > 0 ? unit_cost : p.unit_cost }));
};

const handleCostPerTonChange = (e) => {
  const cpt = parseFloat(e.target.value) || 0;
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const unit_cost = maskMoney((cpt * tons).toFixed(2));
  setF((p) => ({ ...p, cost_per_ton: e.target.value, unit_cost: tons > 0 ? unit_cost : p.unit_cost }));
};

const handleSalePerTonChange = (e) => {
  const spt = parseFloat(e.target.value) || 0;
  // Cost/Sale per Ton is a rate for the pure chemical (net weight), so the
  // per-package reference price below has to multiply by the NET tons in
  // one package, not the gross (package + drum) tons — see netTonsOf.
  const tons = netTonsOf(f);
  const sale_price = maskMoney((spt * tons).toFixed(2));
  setF((p) => ({
    ...p, sale_per_ton: e.target.value,
    sale_price: tons > 0 ? sale_price : p.sale_price,
  }));
};

const handleSalePerLiterChange = (e) => {
  const spl = parseFloat(e.target.value) || 0;
  const volL = volumeLOf(f);
  const sale_price = maskMoney((spl * volL).toFixed(2));
  setF((p) => ({
    ...p, sale_per_liter: e.target.value,
    sale_price: volL > 0 ? sale_price : p.sale_price,
  }));
};

  const currencies = ["USD", "BRL", "CNY", "EUR", "GBP", "JPY", "HKD"];

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
      <Field label="Product Code" half><Input value={f.code} onChange={set("code")} placeholder="001" /></Field>
      <Field label="Name" half><Input value={f.name} onChange={set("name")} /></Field>
      <Field label="NCM" half><Input value={f.ncm} onChange={e => setF(p => ({ ...p, ncm: maskNCM(e.target.value) }))} placeholder="0000.00.00" /></Field>
      <Field label="HS Code" half><Input value={f.hs_code || ""} onChange={set("hs_code")} placeholder="0000.00" /></Field>
      <Field label="Color" half><Input value={f.color || ""} onChange={set("color")} placeholder="e.g. Red, Navy Blue" /></Field>
      <Field label="Category" half>
  <Select value={f.category} onChange={set("category")}>
    <option value="">Select...</option>
    {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
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
<Field label={f.category === "Chemical" ? "Weight (gross, full package)" : "Weight"} half>
  <div style={{ display: "flex", gap: "6px" }}>
    <Input value={f.weight || ""} onChange={set("weight")} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
    <Select value={f.weight_unit || "kg"} onChange={set("weight_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
      {["kg","g","g/m","g/m²","lb","oz"].map(u => <option key={u}>{u}</option>)}
    </Select>
  </div>
</Field>

{f.category === "Chemical" && f.price_basis === "ton" && (
  // Full-width, same reasoning as Volume below — a conditional `half`
  // field here would throw off the Cost/Sale grid alternation that
  // follows. `weight` above is the GROSS weight of one full drum (drum +
  // chemical) — used for Gross Weight totals. This is the chemical ALONE,
  // same unit as Weight's dropdown, used only to work out how many drums a
  // given tonnage needs (dividing by the gross figure would undercount,
  // since part of it is the drum itself, not product).
  <Field label={`Net Weight (chemical only, per package, ${f.weight_unit || "kg"})`}>
    <Input value={f.net_weight || ""} onChange={set("net_weight")} placeholder="e.g. 200 (vs. 264.85 gross above)" style={{ ...inputStyle }} />
  </Field>
)}

{f.category !== "Chemical" && f.category !== "Textile" && f.category !== "DTF Film" && (
  // What's actually being counted/sold — separate from Package above (the
  // physical container). Registered here so every order item for this
  // product defaults correctly instead of relying on whoever places a given
  // order to remember to switch it. Full-width and grouped down here with
  // Units per Package/Package Weight (not up next to Package) since the
  // three belong together — up there it split the Width/Height/Thickness/
  // Weight fields across mismatched rows.
  <Field label="Sold By">
    <Select value={f.selling_unit || "Unit"} onChange={set("selling_unit")}>
      {SELLING_UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
    </Select>
  </Field>
)}

{f.category !== "Chemical" && (
  // For any OTHER category sold in a different unit than it's physically
  // packed in — e.g. LED lights sold per PAIR, packed 500 pairs to a
  // cardboard box. Both optional/blank by default (no effect on anything
  // unless filled in): leave them empty and Packages on the Packing List
  // just defaults to the raw quantity ordered, same as always. Fill them in
  // and Packages/Gross Weight get derived automatically instead of needing
  // to be typed in by hand on every shipment.
  <>
    <Field label="Units per Package (optional)" half>
      <Input value={f.units_per_package || ""} onChange={set("units_per_package")} placeholder="e.g. 500 (pairs per box)" style={{ ...inputStyle }} />
    </Field>
    <Field label={`Package Weight (gross, per package, ${f.weight_unit || "kg"})`} half>
      <Input value={f.package_weight || ""} onChange={set("package_weight")} placeholder="e.g. 16 (kg per box)" style={{ ...inputStyle }} />
    </Field>
  </>
)}

{(f.category === "Textile" || f.category === "DTF Film") && (
  // Paired as two `half` fields (same row) instead of each taking the full
  // width — together they still add up to one full row, so the Cost/Sale
  // grid alternation that follows lines up exactly the same as before.
  // Same compact Input+Select layout as the Weight field above, just with a
  // plain weight-unit list (no g/m or g/m², which don't apply to a fixed
  // per-roll tube mass).
  <Field label="Tube Weight (cardboard core, per roll)" half>
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.tube_weight || ""} onChange={set("tube_weight")} placeholder="e.g. 1.075" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.tube_weight_unit || "kg"} onChange={set("tube_weight_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
        {["kg","g","lb","oz"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

{(f.category === "Textile" || f.category === "DTF Film") && (
  // Rolled diameter (outer diameter of the finished roll, tube included) —
  // needed to compute an actual rolled volume (cylinder: π × (diameter/2)² ×
  // length) for the Packing List's CBM, instead of only splitting each
  // container's flat capacity proportionally by weight share.
  <Field label="Roll Diameter (finished roll, tube included)" half>
    <div style={{ display: "flex", gap: "6px" }}>
      <Input value={f.roll_diameter || ""} onChange={set("roll_diameter")} placeholder="e.g. 30" style={{ ...inputStyle, flex: 1 }} />
      <Select value={f.roll_diameter_unit || "cm"} onChange={set("roll_diameter_unit")} style={{ ...inputStyle, width: "90px", cursor: "pointer" }}>
        {["mm","cm","m","in"].map(u => <option key={u}>{u}</option>)}
      </Select>
    </div>
  </Field>
)}

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

{f.category === "Chemical" && (
  // Which of the two rate fields below (Cost/Sale per Liter or per Ton)
  // actually drives Cost/Sale Price — some bulk chemicals are quoted by
  // weight instead of drum volume. Uses the Weight field above (already
  // filled in for every category's Total Weight calc) as tons/package,
  // same way Volume above is used as liters/package.
  <Field label="Price Basis">
    <Select value={f.price_basis || "liter"} onChange={set("price_basis")}>
      <option value="liter">Per Liter (uses Volume)</option>
      <option value="ton">Per Ton (uses Weight)</option>
    </Select>
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
        {currencies.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Cost per Meter">
        <Input type="number" value={f.cost_per_meter || ""} onChange={handleCostPerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (f.price_basis || "liter") === "liter" && (
      <Field label="Cost per Liter">
        <Input type="number" value={f.cost_per_liter || ""} onChange={handleCostPerLiterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && f.price_basis === "ton" && (
      <Field label="Cost per Ton">
        <Input type="number" value={f.cost_per_ton || ""} onChange={handleCostPerTonChange} placeholder="0.00" />
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
          1 package ≈ {netTonsOf(f).toFixed(3)} t net (from Net Weight above) — Cost/Sale Price below = this rate × that weight.
        </div>
      </Field>
    )}
    <div style={{ display: "flex", gap: "16px" }}>
      <div style={{ flex: 1 }}>
        <Field label="Cost Price">
          <Input type="text" inputMode="decimal" value={f.unit_cost} onChange={handleCostChange} placeholder="0.00" />
        </Field>
      </div>
      <div style={{ flex: 1 }}>
        <Field label="VAT %">
          <Input type="number" value={f.vat_pct || ""} onChange={set("vat_pct")} placeholder="e.g. 13" />
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Informational only — not used in any calculation.</div>
        </Field>
      </div>
    </div>
  </div>
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <Field label="Sale Currency">
      <Select value={f.sale_currency || "USD"} onChange={set("sale_currency")}>
        {currencies.map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
      </Select>
    </Field>
    {(f.category === "Textile" || f.category === "DTF Film") && (
      <Field label="Sale per Meter">
        <Input type="number" value={f.sale_per_meter || ""} onChange={handleSalePerMeterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && (f.price_basis || "liter") === "liter" && (
      <Field label="Sale per Liter">
        <Input type="number" value={f.sale_per_liter || ""} onChange={handleSalePerLiterChange} placeholder="0.00" />
      </Field>
    )}
    {f.category === "Chemical" && f.price_basis === "ton" && (
      <Field label="Sale per Ton">
        <Input type="number" value={f.sale_per_ton || ""} onChange={handleSalePerTonChange} placeholder="0.00" />
      </Field>
    )}
    <Field label="Sale Price">
      <Input type="text" inputMode="decimal" value={f.sale_price || ""} onChange={handleSalePriceChange} placeholder="0.00" />
    </Field>
    <Field label="Margin %">
      <Input type="number" value={f.sale_pct || ""} onFocus={handleMarkupFocus} onChange={handleSalePctChange} placeholder="e.g. 15" />
      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Adds this % on top of the Sale Price — not calculated from Cost.</div>
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
        <Btn onClick={async () => {
          // unit_cost/sale_price display with live thousands-separator
          // formatting (see maskMoney) while editing — convert back to
          // plain numbers here so the backend's REAL columns get an actual
          // number, not a "1.225,60"-style formatted string.
          //
          // width/height/thickness/weight/tube_weight/roll_diameter/volume
          // are plain free-text fields (no mask) — a Brazilian user typing
          // "264,85" would otherwise get saved as the literal string
          // "264,85", and every downstream calculation (Total Weight, drum
          // count for ton-priced Chemical, CBM...) uses parseFloat(), which
          // stops at the first comma and silently reads it as just "264",
          // quietly dropping the decimal part. Routing these through the
          // same BR/US-aware parser used for money fields fixes that at
          // the source instead of leaving every downstream parseFloat() to
          // get it wrong the same way.
          const normNum = (v) => (v === "" || v == null ? v : (parseLocaleNumber(v) ?? v));
          await onSave({
            ...f,
            unit_cost: parseLocaleNumber(f.unit_cost) ?? 0,
            sale_price: parseLocaleNumber(f.sale_price) ?? 0,
            width: normNum(f.width),
            height: normNum(f.height),
            thickness: normNum(f.thickness),
            weight: normNum(f.weight),
            net_weight: normNum(f.net_weight),
            tube_weight: normNum(f.tube_weight),
            roll_diameter: normNum(f.roll_diameter),
            volume: normNum(f.volume),
            units_per_package: normNum(f.units_per_package),
            package_weight: normNum(f.package_weight),
            media: JSON.stringify(media),
          });
          onClose();
        }}>Save Product</Btn>
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
          {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
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
    order_id: "", quotation_id: "", number: "", issue_date: "", validity: "", client: "", total: "", currency: "USD", status: "Draft", notes: "",
    acquisition_company: "", incoterm: "", way_of_shipment: "By Sea", port_of_loading: "", port_of_discharge: "",
    payment_terms: "", production_days: "", delivery_days: "",
  });
  const [items, setItems] = useState(() => {
    if (Array.isArray(initial?.items)) return initial.items;
    if (typeof initial?.items === "string") { try { return JSON.parse(initial.items || "[]"); } catch { return []; } }
    return [];
  });
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [showClientList, setShowClientList] = useState(false);
  const [itemModal, setItemModal] = useState(null);
  const [editingItemIdx, setEditingItemIdx] = useState(null);
  const [showPaymentList, setShowPaymentList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const filteredPayments = PAYMENT_TERMS_OPTIONS.filter(p => p.toLowerCase().includes((f.payment_terms || "").toLowerCase()));

  useEffect(() => {
    api("/products").then(setProducts);
    api("/clients").then(setClients);
  }, []);

  const addItem = (item) => setItems(prev => [...prev, item]);
  const updateItem = (idx, item) => setItems(prev => { const u = [...prev]; u[idx] = item; return u; });
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const filteredClients = clients.filter(c => c.company_name.toLowerCase().includes(clientSearch.toLowerCase()));

  // Items are the Proforma's own snapshot — its Total stays in sync with
  // them automatically, same pattern as Quotation/Order.
  const itemsTotal = items.reduce((sum, i) => sum + (parseLocaleNumber(i.total) || 0), 0);
  const [initialLoad, setInitialLoad] = useState(true);
  useEffect(() => {
    if (initialLoad) { setInitialLoad(false); return; }
    if (items.length > 0) setF(p => ({ ...p, total: itemsTotal.toFixed(2) }));
  }, [itemsTotal]);

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
      <Field label="Linked Order" half>
        <Select value={f.order_id} onChange={set("order_id")}>
          <option value="">None</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_number} – {o.client}</option>)}
        </Select>
      </Field>
      <Field label="Proforma Number" half><Input value={f.number} onChange={set("number")} placeholder="PI-2024-001" /></Field>
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
      <Field label="Issue Date" half><Input type="date" value={f.issue_date} onChange={set("issue_date")} /></Field>
      <Field label="Validity Date" half><Input type="date" value={f.validity} onChange={set("validity")} /></Field>

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

      <Field label="Total Amount" half>
  <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
</Field>
<Field label="Currency" half>
  <Select value={f.currency} onChange={e => {
    const cur = e.target.value;
    setF(p => ({ ...p, currency: cur }));
    setItems(prev => prev.map(i => ({ ...i, currency: cur })));
  }}>
    {["USD","EUR","BRL","CNY","HKD"].map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
  </Select>
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
      {/* Plain text, not a number input — usually just a day-count ("28"),
          which still prints as "28 days after TT payment." on the PDF (see
          daysOrNote in salesInvoice.js), but some deals need a full note
          here instead (e.g. "Depending on booking, please book at least 7
          days after production finish date."), which now prints as-is. */}
      <Field label="End of Production (days after TT payment, or a note)" half>
        <Input value={f.production_days || ""} onChange={set("production_days")} placeholder="28" />
      </Field>
      <Field label="Delivery at Port (days after TT payment, or a note)" half>
        <Input value={f.delivery_days || ""} onChange={set("delivery_days")} placeholder="33" />
      </Field>

      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {f.id && <Btn outline color="#10b981" onClick={() => window.open(authUrl(`${API}/proformas/${f.id}/pdf`), "_blank")}>📄 Download PDF</Btn>}
        <Btn onClick={async () => {
          // Same BR-formatted-text cleanup as QuotationForm/OrderForm — the
          // items here go through the same PricingRow editor.
          const cleanedItems = items.map(item => ({
            ...item,
            total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
            unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
            sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
            sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
            sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
            sale_pct: item.sale_pct !== "" && item.sale_pct != null ? (parseLocaleNumber(item.sale_pct) ?? item.sale_pct) : item.sale_pct,
            target_price: item.target_price !== "" && item.target_price != null ? (parseLocaleNumber(item.target_price) ?? item.target_price) : item.target_price,
          }));
          await onSave({ ...f, items: JSON.stringify(cleanedItems) });
          onClose();
        }}>Save Proforma</Btn>
      </div>
    </div>
    </>
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
      <Field label="Contract Number" half><Input value={f.contract_number} onChange={set("contract_number")} placeholder="PO-2024-001" /></Field>
      <Field label="Supplier" half><Input value={f.supplier} onChange={set("supplier")} /></Field>
      <Field label="Sign Date" half><Input type="date" value={f.sign_date} onChange={set("sign_date")} /></Field>
      <Field label="Delivery Date" half><Input type="date" value={f.delivery_date} onChange={set("delivery_date")} /></Field>
      <Field label="Total Amount" half>
        <input value={f.total} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Currency" half>
        <input value={currencyLabel(f.currency)} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>

      {(f._items || (f.items_json ? JSON.parse(f.items_json) : [])).length > 0 && (
        <div style={{ gridColumn: "span 2", background: "#0f172a", borderRadius: "8px", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "11px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Products in this contract</span>
            <span style={{ color: "#10b981", fontWeight: 700, fontSize: "15px" }}>{fmt(parseFloat(f.total), f.currency)}</span>
          </div>
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
              <span style={{ color: "#10b981", fontWeight: 600 }}>{currencyLabel(item.cost_currency || item.currency)} {parseFloat(item.cost_price || item.unit_price).toFixed(2)} × {item.quantity} = {fmt(parseFloat((item.cost_price || item.unit_price) * item.quantity), item.cost_currency || item.currency)}</span>
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
    payer: "", payment_method: "Online bank payment", applicant: "", approved_by: "",
    payment_schedule: "100", paid_amount: "",
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
      <Field label="Amount" half><Input type="text" inputMode="decimal" value={f.amount} onChange={e => setF(p => ({ ...p, amount: maskMoney(e.target.value) }))} /></Field>
      <Field label="Currency" half>
        <Select value={f.currency} onChange={set("currency")}>
          <option>USD</option><option>EUR</option><option>BRL</option><option value="CNY">RMB</option><option value="HKD">HKD</option>
        </Select>
      </Field>
      <Field label="Due Date" half><Input type="date" value={f.due_date} onChange={set("due_date")} /></Field>
      {/* Only meaningful with status "Partial" — how much of Amount has
          actually been paid so far, so the Cash Flow Pending/Paid summary
          cards can split the row between them instead of leaving the whole
          amount stuck in Pending regardless of what's actually been paid. */}
      {f.status === "Partial" && (
        <Field label="Amount Paid So Far" half>
          <Input type="text" inputMode="decimal" value={f.paid_amount} onChange={e => setF(p => ({ ...p, paid_amount: maskMoney(e.target.value) }))} />
        </Field>
      )}
      <Field label="Description">
        <Input value={f.description} onChange={set("description")} placeholder={!isClient ? "Contract-AGNB26.044" : ""} />
      </Field>
      {!isClient && (
        <>
          <div style={{ gridColumn: "span 2", marginTop: "4px", marginBottom: "-4px", fontSize: "12px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Payment Notice
          </div>
          <Field label="Payer" half>
            <Select value={f.payer} onChange={set("payer")}>
              <option value="">Select...</option>
              <option value="HONG KONG ALLIANCE GLOBAL TRADING CO., LTD">HONG KONG ALLIANCE GLOBAL TRADING CO., LTD</option>
              <option value="NINGBO WORLD ALLIANCE TRADING. CO. LTD.">NINGBO WORLD ALLIANCE TRADING. CO. LTD.</option>
            </Select>
          </Field>
          <Field label="Payment Method" half>
            <Select value={f.payment_method} onChange={set("payment_method")}>
              <option value="Online bank payment">Online bank payment</option>
              <option value="Wire transfer">Wire transfer</option>
            </Select>
          </Field>
          <Field label="Applicant" half><Input value={f.applicant} onChange={set("applicant")} /></Field>
          <Field label="Approved By" half><Input value={f.approved_by} onChange={set("approved_by")} /></Field>
          <Field label="Payment Schedule" half>
            <Select value={f.payment_schedule || "100"} onChange={set("payment_schedule")}>
              {Object.entries(PAYMENT_SCHEDULES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
        </>
      )}
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        {/* Each installment in the chosen schedule (e.g. 20% Deposit / 80%
            Balance) gets its own Payment Notice PDF button — a single 100%
            schedule falls back to the one plain button it had before. */}
        {!isClient && f.id && (PAYMENT_SCHEDULES[f.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]).parts.map((part, i) => (
          <Btn key={i} outline color="#10b981"
            onClick={() => window.open(authUrl(`${API}/financial/suppliers/${f.id}/payment-notice-pdf${part.label ? `?pct=${part.pct}&label=${encodeURIComponent(part.label)}` : ""}`), "_blank")}>
            📄 {part.label ? `${part.label} PDF (${part.pct}%)` : "Payment Notice PDF"}
          </Btn>
        ))}
        <Btn color={isClient ? "#3b82f6" : "#8b5cf6"} onClick={async () => {
          // Amount/Amount Paid display with live thousands-separator
          // formatting (see maskMoney) while editing — convert back to
          // plain numbers here so the backend's REAL columns get an actual
          // number, not a "1.225,60"-style formatted string.
          await onSave({
            ...f,
            amount: parseLocaleNumber(f.amount) ?? 0,
            paid_amount: f.paid_amount !== "" && f.paid_amount != null ? (parseLocaleNumber(f.paid_amount) ?? 0) : f.paid_amount,
          });
          onClose();
        }}>Save</Btn>
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
    {["USD","EUR","BRL","CNY","HKD"].map(c => <option key={c} value={c}>{currencyLabel(c)}</option>)}
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
            // inline Margin %/Value-per-Meter/Total fields into plain
            // numbers before saving, so downstream displays (which use
            // parseFloat) stay correct.
            const cleanedItems = items.map(item => ({
              ...item,
              total: item.total !== "" && item.total != null ? (parseLocaleNumber(item.total) ?? item.total) : item.total,
              unit_price: item.unit_price !== "" && item.unit_price != null ? (parseLocaleNumber(item.unit_price) ?? item.unit_price) : item.unit_price,
              sale_per_meter: item.sale_per_meter !== "" && item.sale_per_meter != null ? (parseLocaleNumber(item.sale_per_meter) ?? item.sale_per_meter) : item.sale_per_meter,
              sale_per_liter: item.sale_per_liter !== "" && item.sale_per_liter != null ? (parseLocaleNumber(item.sale_per_liter) ?? item.sale_per_liter) : item.sale_per_liter,
              sale_per_ton: item.sale_per_ton !== "" && item.sale_per_ton != null ? (parseLocaleNumber(item.sale_per_ton) ?? item.sale_per_ton) : item.sale_per_ton,
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
          // Copy the Quotation's items in as the Proforma's own snapshot —
          // from this point on they're independently editable, same as how
          // Order items work once created from a Proforma.
          items: r.items || "[]",
        })}>
        📋 {hasProforma ? "Proforma ✓" : "Proforma"}
      </Btn>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/quotations/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
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

      {/* Pending Samples */}
      {data.pendingSamples?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>✏️ Pending Samples</h3>
          <Table
            cols={[
              { label: "Product", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.product_name}</span> },
              { label: "Client", key: "client" },
              { label: "Requested Date", render: r => fmtDate(r.requested_date) },
            ]}
            rows={data.pendingSamples}
          />
        </div>
      )}

      {/* Pending Supplier Payments (Payment Notices not yet Paid) */}
      {data.pendingSupplierPayments?.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💳 Pending Supplier Payments</h3>
          <Table
            cols={[
              { label: "Supplier", key: "supplier" },
              { label: "Description", key: "description" },
              { label: "Amount", render: r => <span style={{ fontWeight: 600, color: "#f59e0b" }}>{fmt(r.amount, r.currency)}</span> },
              { label: "Due Date", render: r => fmtDate(r.due_date) },
              { label: "Status", key: "status" },
            ]}
            rows={data.pendingSupplierPayments}
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
  const [f, setF] = useState(() => {
    const rawItems = initial._items || (initial.items_json ? (() => { try { return JSON.parse(initial.items_json); } catch { return []; } })() : []);
    // Ton-priced Chemical items: Gross Weight must always equal Packages ×
    // the product's registered GROSS per-drum weight (gross_weight_per_package
    // — full drum, chemical + packaging; not tons_per_package, which is net
    // chemical only). Re-derive it here on every load — not just when
    // Packages is actively being edited — so a Packing List saved before
    // this rule existed (or saved mid-edit under an earlier, rate-preserving
    // or net/gross-confused version of it) always self-corrects the moment
    // it's reopened, instead of keeping whatever figure happened to be
    // stored.
    const items = rawItems.map(it => {
      if (!it.gross_weight_per_package) return it;
      const grossWeight = Math.round((parseFloat(it.roll) || 0) * it.gross_weight_per_package * 10) / 10;
      return { ...it, grossWeight };
    });
    const totalGrossWeight = items.reduce((s, i) => s + (parseFloat(i.grossWeight) || 0), 0);
    return {
      ...initial,
      _items: items,
      _containers: initial._containers || (initial.containers_json ? (() => { try { return JSON.parse(initial.containers_json); } catch { return []; } })() : []),
      total_gross_weight: Math.round(totalGrossWeight * 10) / 10,
    };
  });
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));

  const applyTotals = (prev, items) => {
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
  };

  const updateItem = (idx, key, value) => {
    setF(prev => {
      const items = [...prev._items];
      items[idx] = { ...items[idx], [key]: value };
      return applyTotals(prev, items);
    });
  };

  // Editing Roll for one container's copy of a product used to just
  // overwrite that one row — nothing stopped the same product from showing
  // more total rolls across containers than the order actually has, which
  // read as "we're shipping more than what was ordered." Roll edits now
  // trade directly with the item's Container 01 row (its normal starting
  // point, per buildPackingListDraft's default) so the sum across every
  // container for that product always stays exactly at its total package
  // count. Editing Container 01 itself trades with Container 02 instead,
  // since there's no "container before 01" to draw from. Gross/Net Weight,
  // Total Length and CBM are then recomputed for both rows from a per-roll
  // rate derived off however they were already split (works whether that
  // came from the real roll-volume CBM or the capacity-share fallback).
  const updateItemRoll = (idx, rawValue) => {
    setF(prev => {
      const items = [...prev._items];
      const item = items[idx];

      const sameProduct = items.map((_, i) => i).filter(i => items[i].product_id === item.product_id);
      // Total physical package count for this product across every
      // container — derived from the roll values buildPackingListDraft
      // already set (real drum count for ton-priced Chemical, order
      // quantity for everything else), not item.quantity directly, since
      // for ton-priced Chemical that field holds tons ordered, not a
      // package count.
      const total = sameProduct.reduce((s, i) => s + (parseFloat(items[i].roll) || 0), 0);
      if (!total) { items[idx] = { ...item, roll: rawValue }; return applyTotals(prev, items); }

      const thisSeq = item.container_seq || 1;
      const partnerSeq = thisSeq !== 1 ? 1 : 2;
      const partnerIdx = sameProduct.find(i => (items[i].container_seq || 1) === partnerSeq);
      if (partnerIdx == null) { items[idx] = { ...item, roll: rawValue }; return applyTotals(prev, items); }

      // Per-roll rates, derived from the current split (sum of that field
      // across every container for this product ÷ the order quantity) —
      // self-correcting regardless of which CBM method produced the numbers.
      const sumField = (f) => sameProduct.reduce((s, i) => s + (parseFloat(items[i][f]) || 0), 0);
      const grossPerRoll = sumField("grossWeight") / total;
      const netPerRoll = sumField("netWeight") / total;
      const cbmPerRoll = sumField("cbm") / total;
      const lengthPerRoll = item.isTextile ? sumField("totalLength") / total : null;
      // Ton-priced Chemical: Gross Weight per container is recomputed
      // directly from Packages × the product's registered GROSS per-drum
      // weight (gross_weight_per_package — full drum, not tons_per_package,
      // which is the chemical alone) every time, instead of carrying
      // forward a "per-roll rate" — that rate can only stay exactly right
      // if it's never touched by an edit made under different numbers, and
      // any drift there would silently break "Packages × weight = Gross
      // Weight" (which is what should always be checkable at a glance).
      const perDrumWeightKg = item.gross_weight_per_package || null;

      const otherSum = sameProduct
        .filter(i => i !== idx && i !== partnerIdx)
        .reduce((s, i) => s + (parseFloat(items[i].roll) || 0), 0);
      const clampMax = Math.max(0, total - otherSum);
      let newRoll = parseFloat(String(rawValue).replace(",", "."));
      if (isNaN(newRoll)) newRoll = 0;
      newRoll = Math.max(0, Math.min(clampMax, newRoll));
      const partnerNewRoll = Math.max(0, total - otherSum - newRoll);

      const applyRow = (i, roll) => {
        items[i] = {
          ...items[i],
          roll,
          grossWeight: perDrumWeightKg != null
            ? Math.round(roll * perDrumWeightKg * 10) / 10
            : Math.round(grossPerRoll * roll * 10) / 10,
          netWeight: Math.round(netPerRoll * roll * 10) / 10,
          cbm: Math.round(cbmPerRoll * roll * 100) / 100,
          totalLength: lengthPerRoll != null ? Math.round(lengthPerRoll * roll * 100) / 100 : items[i].totalLength,
        };
      };
      applyRow(idx, newRoll);
      applyRow(partnerIdx, partnerNewRoll);

      return applyTotals(prev, items);
    });
  };

  const updateContainerCode = (seq, code) => {
    setF(prev => {
      const containers = (prev._containers || []).map(c => c.seq === seq ? { ...c, code } : c);
      return { ...prev, _containers: containers, containers_json: JSON.stringify(containers) };
    });
  };

  const miniInput = { ...inputStyle, padding: "5px 8px", fontSize: "12px", width: "72px", textAlign: "right" };

  // Multi-container allocation: group the flat item list by container_seq so
  // each container gets its own "Container 0N — Code" block with just its
  // slice of the items, still editable per-item exactly like the
  // single-container view. Falls back to the plain flat list when there's
  // only one container (or none set up — older Packing Lists).
  const containers = f._containers || [];
  const isMultiContainer = containers.length > 1;
  const items = f._items || [];

  const renderItemRow = (item, idx) => (
    <div key={idx} style={{ padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
      <div style={{ fontSize: "13px", color: "#f1f5f9", marginBottom: "6px" }}>
        <strong>{item.description}</strong>
        <span style={{ color: "#64748b", marginLeft: "8px" }}>
          {item.color} {item.width} {item.weightSpec}
          {item.isTextile
            ? ` · Length: ${parseFloat(item.totalLength || 0).toFixed(2)} m`
            : (item.quantityLabel
                ? ` · Qty: ${item.quantityLabel}`
                : (item.quantity != null ? ` · Qty: ${item.quantity} ${item.unit || ""}` : ""))}
        </span>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "11px", color: "#64748b" }}>{item.isTextile ? "Roll" : "Packages"}
          <input type="number" value={item.roll} onChange={e => updateItemRoll(idx, e.target.value)} style={{ ...miniInput, display: "block", marginTop: "2px" }} />
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
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Number" half><Input value={f.number} onChange={set("number")} /></Field>
      <Field label="Date" half><Input type="date" value={f.date} onChange={set("date")} /></Field>
      <Field label="Loading Date" half><Input type="date" value={f.loading_date || ""} onChange={set("loading_date")} /></Field>
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

      {!isMultiContainer && containers.length === 1 && (
        // Single container: still worth capturing its code (shows at the top
        // of the Packing List/CI), just without the full allocation UI.
        <Field label="Container Code" half>
          <Input value={containers[0].code || ""} onChange={e => updateContainerCode(containers[0].seq, e.target.value)} placeholder="e.g. OOCU7979442" />
        </Field>
      )}

      <Field label={isMultiContainer ? "Items — allocated per container" : "Items — Roll / Gross Weight / Net Weight / CBM"}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMultiContainer ? "12px" : 0 }}>
          {items.length === 0 && (
            <div style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", padding: "12px 14px", color: "#475569", fontSize: "13px" }}>No items.</div>
          )}
          {isMultiContainer ? (
            containers.map(c => {
              const indices = items.map((it, i) => i).filter(i => (items[i].container_seq || 1) === c.seq);
              if (indices.length === 0) return null;
              return (
                <div key={c.seq} style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
                  <div style={{ background: "#1e293b", padding: "8px 14px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Container {String(c.seq).padStart(2, "0")}
                    </span>
                    <Input value={c.code || ""} onChange={e => updateContainerCode(c.seq, e.target.value)}
                      placeholder="Container code, e.g. OOCU7979442" style={{ ...inputStyle, flex: 1, padding: "6px 10px", fontSize: "13px" }} />
                  </div>
                  {indices.map(idx => renderItemRow(items[idx], idx))}
                </div>
              );
            })
          ) : (
            <div style={{ background: "#0f172a", borderRadius: "8px", border: "1px solid #334155", overflow: "hidden" }}>
              {items.map((item, idx) => renderItemRow(item, idx))}
            </div>
          )}
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
        {f.id && <Btn outline color="#10b981" onClick={() => window.open(authUrl(`${API}/packing-lists/${f.id}/pdf`), "_blank")}>📄 Download PDF</Btn>}
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

 const load = useCallback(async () => {
    const [orders, contracts, commercials, inspections, products, suppliersList] = await Promise.all([
  api("/orders"),
  api("/contracts"),
  api("/commercial-invoices"),
  api("/inspections"),
  api("/products"),
  api("/suppliers"),
]);
setInspections(inspections);
setProducts(products);
setSuppliersList(suppliersList);
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

const changeStatus = async (id, status) => {
  // Previously this auto-generated a Commercial Invoice + Packing List when
  // moving to "Shipment" and popped up an Inspection modal when moving to
  // "Inspection". Per user request, status changes no longer trigger any
  // document generation — those are created on-demand via their own
  // "Generate…" buttons instead.
  await api(`/orders/${id}/status`, "PATCH", { status });
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
  // order.order_number carries an "ORD-" prefix (see orderNumber generation
  // from the Proforma) which doesn't belong on a Commercial Invoice number,
  // and it previously got a random trailing suffix appended — dropped so the
  // CI number lines up 1:1 with the order reference, e.g. "CI-AGNB26.044".
  const number = `CI-${String(order.order_number || "").replace(/^ORD-/, "")}`;
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
  // Contract Number uses a "PO-" prefix (matching the reference document)
  // instead of "SC-", built off the plain order reference — the order's
  // "ORD-" prefix and any random trailing suffix are dropped, same as the
  // Commercial Invoice number fix, so it reads e.g. "PO-AGNB26.044".
  const baseNumber = String(order.order_number || "").replace(/^ORD-/, "");
  const suppliers = [...new Set((order.items || []).map(i => i.supplier).filter(Boolean))];
  // The supplier tag (e.g. "-SHAN") only exists to tell apart multiple
  // contracts generated from the SAME order — it has no reason to show up
  // for the common case of a single supplier, which used to fall into this
  // branch too (suppliers.length was only checked against 0, not 1),
  // tacking an unwanted tag onto every contract number/PDF filename.
  if (suppliers.length <= 1) {
    const number = `PO-${baseNumber}`;
   setContractModal([{
  order_id: order.id,
  contract_number: number,
  // Plain order reference (no "PO-" prefix, no supplier tag) — used to build
  // the Supplier Payment description below without re-deriving it from
  // contract_number, which for multi-supplier orders has a supplier tag
  // appended that would otherwise leak into the description.
  _order_ref: baseNumber,
  // A single known supplier gets used directly (so the PDF's Seller block —
  // name, bank details — is filled in); genuinely supplier-less orders
  // (suppliers.length === 0) still leave it blank, same as before.
  supplier: suppliers[0] || "",
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: order.value || "",
  currency: order.currency || "USD",
  status: "Draft",
  // Contract notes start blank — inheriting the order's notes (e.g. "Created
  // from Proforma PI-... (Quotation ...)") wasn't meaningful on a contract,
  // which has its own remarks that print into the PDF's 要求/Requirements box.
  notes: "",
  _items: order.items || [],
  items_json: JSON.stringify(order.items || []),
}]);
  } else {
    setContractModal(suppliers.map((supplier, supplierIdx) => {
const supplierItems = (order.items || []).filter(i => i.supplier === supplier);
const total = supplierItems.reduce((sum, i) => sum + ((parseFloat(i.cost_price) || parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
const currency = supplierItems[0]?.cost_currency || supplierItems[0]?.currency || order.currency || "USD";
      // Multiple suppliers on the same order need distinct contract numbers —
      // a plain running index ("-1", "-2"...) tells them apart without
      // spelling any part of the supplier's name into the number, which
      // used to make it (and anywhere it's quoted, like Supplier Flow) read
      // longer/heavier than it needs to.
      const number = `PO-${baseNumber}-${supplierIdx + 1}`;
      return {
  order_id: order.id,
  contract_number: number,
  _order_ref: baseNumber,
  supplier,
  sign_date: new Date().toISOString().slice(0, 10),
  delivery_date: order.shipment_date || "",
  total: total.toFixed(2),
  currency,
  status: "Draft",
  // Contract notes start blank — inheriting the order's notes (e.g. "Created
  // from Proforma PI-... (Quotation ...)") wasn't meaningful on a contract,
  // which has its own remarks that print into the PDF's 要求/Requirements box.
  notes: "",
  _items: supplierItems,
  items_json: JSON.stringify(supplierItems),
};
    }));
  }
};
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
        <input value={currencyLabel(editCommercial.currency)} disabled onChange={() => {}} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "8px", padding: "10px 12px", color: "#94a3b8", fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", cursor: "not-allowed" }} />
      </Field>
      <Field label="Status" half>
        <Select value={editCommercial.status} onChange={e => setEditCommercial(p => ({ ...p, status: e.target.value }))}>
          <option>Pending</option><option>Paid</option>
        </Select>
      </Field>
      {/* Shipment/Arrival Date aren't stored separately on the CI — they're
          the linked Order's own columns (see the /api/commercial-invoices
          route), so editing them here writes straight to the Order and
          editing them on the Order shows up here too, automatically. */}
      <Field label="Shipment Date" half>
        <Input type="date" value={editCommercial.shipment_date || ""} onChange={e => setEditCommercial(p => ({ ...p, shipment_date: e.target.value }))} />
      </Field>
      <Field label="Arrival Date" half>
        <Input type="date" value={editCommercial.arrival_date || ""} onChange={e => setEditCommercial(p => ({ ...p, arrival_date: e.target.value }))} />
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
              <span style={{ color: "#10b981", fontWeight: 600 }}>{currencyLabel(c.currency)} {c.total}</span>
            </div>
          </div>
          {savedContracts.includes(idx) ? (
            <div style={{ textAlign: "center", padding: "12px", color: "#10b981", fontWeight: 600, fontSize: "14px" }}>
              ✅ Contract saved — payment requirement created in Supplier Flow.
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
    // "Contract-<order ref>" — the Supplier column right next to this in
    // Supplier Flow already shows the supplier name, so appending it here
    // too just repeated it. Built from the plain order reference
    // (_order_ref), not by stripping "PO-" off contract_number — for
    // multi-supplier orders contract_number also carries a short supplier
    // tag suffix (e.g. "PO-AGNB26.044-浙江"), which would otherwise leak
    // into the description as a stray fragment.
    description: `Contract-${b._order_ref || String(b.contract_number || "").replace(/^PO-/, "").replace(/-[^-]*$/, "")}`,
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
      <LastModifiedBy name={r.updated_by} />
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
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn outline color="#10b981" onClick={() => window.open(authUrl(`${API}/reports/products-by-supplier`), "_blank")}>📊 Supplier Report</Btn>
          <Btn onClick={() => setModal("new")}>+ New Product</Btn>
        </div>
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
  { label: "Cost", render: r => r.unit_cost ? `${currencyLabel(r.cost_currency || "USD")} ${parseFloat(r.unit_cost).toFixed(2)}` : "—" },
  { label: "Sale Price", render: r => r.sale_price ? `${currencyLabel(r.sale_currency || "USD")} ${parseFloat(r.sale_price).toFixed(2)}` : "—" },
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/products/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
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
      <LastModifiedBy name={r.updated_by} />
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

  // Builds an Order from the Proforma's own shipment fields plus its items
  // — the Proforma's own items snapshot takes priority (present whether it
  // was created manually or generated from a Quotation), falling back to
  // the linked Quotation's items only for older Proformas saved before
  // Proformas carried their own items.
  const createOrderFromProforma = async (pf) => {
    const quotation = quotations.find(q => Number(q.id) === Number(pf.quotation_id));
    const parseItems = (raw) => {
      if (!raw) return [];
      return typeof raw === 'string' ? (JSON.parse(raw || "[]")) : raw;
    };
    const items = pf.items ? parseItems(pf.items) : parseItems(quotation?.items);
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
        <Btn onClick={() => setModal(true)}>+ New Proforma</Btn>
      </div>
      {modal && (
        <Modal title="New Proforma" onClose={() => setModal(false)} wide>
          <ProformaForm orders={orders} onSave={b => api("/proformas", "POST", b).then(load)} onClose={() => setModal(false)} />
        </Modal>
      )}
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
      <Btn small outline color="#10b981" onClick={() => window.open(authUrl(`${API}/proformas/${r.id}/pdf`), "_blank")}>📄 PDF</Btn>
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/proformas/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
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
              <Btn small outline color="#10b981" onClick={() => window.open(authUrl(`${API}/contracts/${r.id}/pdf`), "_blank")}>📄 PDF</Btn>
              <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/contracts/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
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

  // A "Partial" row splits its amount between Paid (paid_amount) and Pending
  // (the remainder) instead of counting the whole row as Pending — that's
  // what makes picking "Partial" actually move the summary cards instead of
  // leaving Total/Pending unchanged.
  const totals = records.reduce((acc, r) => {
    acc.total += r.amount;
    const paidSoFar = r.status === "Paid" ? r.amount : r.status === "Partial" ? (parseFloat(r.paid_amount) || 0) : 0;
    acc.paid += paidSoFar;
    if (r.status === "Pending") acc.pending += r.amount;
    if (r.status === "Partial") acc.pending += Math.max(0, r.amount - paidSoFar);
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
  { label: "Amount", render: r => (
    <span style={{ fontWeight: 600, color }}>
      {fmt(r.amount, r.currency)}
      {r.status === "Partial" && (
        <div style={{ fontSize: "11px", fontWeight: 400, color: "#94a3b8" }}>
          Paid: {fmt(r.paid_amount || 0, r.currency)}
        </div>
      )}
    </span>
  ) },
  { label: "Due Date", render: r => fmtDate(r.due_date) },
  { label: "Status", render: r => (
    <select value={r.status}
      onChange={async e => {
        const status = e.target.value;
        let paid_amount;
        if (status === "Partial") {
          // The Payment Notice schedule (e.g. "20% Deposit / 80% Balance")
          // already says exactly what's been paid at this point — the
          // deposit installment. No need to ask: if it's split 20/80,
          // "Partial" obviously means the 20% deposit landed, so derive it
          // straight from the schedule's first installment instead of
          // prompting for a number that's already known.
          const schedule = !isClient ? (PAYMENT_SCHEDULES[r.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]) : null;
          if (schedule && schedule.parts.length > 1) {
            paid_amount = Math.round(r.amount * (schedule.parts[0].pct / 100) * 100) / 100;
          } else {
            // No split schedule to infer from (single-payment schedule, or a
            // Client entry — clients don't have a payment_schedule at all) —
            // still need to ask, there's nothing else to derive it from.
            const input = prompt(`How much of ${fmt(r.amount, r.currency)} has been paid so far?`, r.paid_amount || "");
            if (input === null) return; // cancelled — leave status as-is
            paid_amount = parseFloat(input.replace(",", ".")) || 0;
          }
        }
        await api(`${endpoint}/${r.id}/status`, "PATCH", {
          status,
          // A "Partial" row means money actually landed too (the deposit/
          // first installment) — it was only ever recording this for "Paid"
          // before, leaving Paid Date blank for every partial payment even
          // though a real payment date exists for it. Only Pending/Overdue
          // (nothing paid yet) have no date to record.
          paid_date: (status === "Paid" || status === "Partial") ? new Date().toISOString().slice(0, 10) : null,
          paid_amount,
        });
        load();
      }}
      style={{ ...inputStyle, padding: "4px 8px", fontSize: "12px", width: "auto" }}>
      {FIN_STATUSES.map(s => <option key={s}>{s}</option>)}
    </select>
  )},
  { label: "Actions", render: r => (
    <div style={{ display: "flex", gap: "6px" }}>
      {/* Split-payment schedules (e.g. 20% Deposit / 80% Balance) get one PDF
          button per installment here too, same as the Edit modal — a plain
          100% schedule still renders as the single original button. */}
      {!isClient && (PAYMENT_SCHEDULES[r.payment_schedule || "100"] || PAYMENT_SCHEDULES["100"]).parts.map((part, i) => (
        <Btn key={i} small outline color="#10b981"
          onClick={() => window.open(authUrl(`${API}/financial/suppliers/${r.id}/payment-notice-pdf${part.label ? `?pct=${part.pct}&label=${encodeURIComponent(part.label)}` : ""}`), "_blank")}>
          📄 {part.label ? `${part.label} (${part.pct}%)` : "PDF"}
        </Btn>
      ))}
      <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
      <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`${endpoint}/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
      <LastModifiedBy name={r.updated_by} />
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
    company_name: "", address: "", address2: "", address_number: "", neighborhood: "",
    city: "", state: "", zip_code: "", country: "", email: "",
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
      <Field label="Phone" half><Input value={f.phone} onChange={e => setF(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></Field>
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
      <Field label="Street / Address" half><Input value={f.address} onChange={set("address")} placeholder="Street name" /></Field>
      <Field label="Number" half><Input value={f.address_number} onChange={set("address_number")} placeholder="No." /></Field>
      <Field label="Address 2 / Complement"><Input value={f.address2} onChange={set("address2")} placeholder="Suite, floor, unit…" /></Field>
      <Field label="Neighborhood" half><Input value={f.neighborhood} onChange={set("neighborhood")} placeholder="Bairro" /></Field>
      <Field label="City" half><Input value={f.city} onChange={set("city")} /></Field>
      <Field label="State / Province" half><Input value={f.state} onChange={set("state")} /></Field>
      <Field label="ZIP / Postal Code" half><Input value={f.zip_code} onChange={e => setF(p => ({ ...p, zip_code: maskCEP(e.target.value) }))} placeholder="CEP" /></Field>
      <Field label="Country" half><Input value={f.country} onChange={set("country")} /></Field>
      <Field label="Tax ID / CNPJ" half><Input value={f.tax_id} onChange={e => setF(p => ({ ...p, tax_id: maskCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" /></Field>
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
              <LastModifiedBy name={r.updated_by} />
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
    company_name: "", address: "", address2: "", address_number: "", neighborhood: "",
    city: "", state: "", zip_code: "", country: "", email: "",
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
      <Field label="Phone" half><Input value={f.phone} onChange={e => setF(p => ({ ...p, phone: maskPhone(e.target.value) }))} placeholder="(00) 00000-0000" /></Field>
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
      <Field label="Street / Address" half><Input value={f.address} onChange={set("address")} placeholder="Street name" /></Field>
      <Field label="Number" half><Input value={f.address_number} onChange={set("address_number")} placeholder="No." /></Field>
      <Field label="Address 2 / Complement"><Input value={f.address2} onChange={set("address2")} placeholder="Suite, floor, unit…" /></Field>
      <Field label="Neighborhood" half><Input value={f.neighborhood} onChange={set("neighborhood")} placeholder="Bairro" /></Field>
      <Field label="City" half><Input value={f.city} onChange={set("city")} /></Field>
      <Field label="State / Province" half><Input value={f.state} onChange={set("state")} /></Field>
      <Field label="ZIP / Postal Code" half><Input value={f.zip_code} onChange={e => setF(p => ({ ...p, zip_code: maskCEP(e.target.value) }))} placeholder="CEP" /></Field>
      <Field label="Country" half><Input value={f.country} onChange={set("country")} /></Field>
      <Field label="Product Types">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {PRODUCT_CATEGORIES.map(cat => {
            const selected = (f.product_types || "").split(",").map(s => s.trim()).filter(Boolean).includes(cat);
            return (
              <button type="button" key={cat}
                onClick={() => {
                  const current = (f.product_types || "").split(",").map(s => s.trim()).filter(Boolean);
                  const next = selected ? current.filter(c => c !== cat) : [...current, cat];
                  setF(p => ({ ...p, product_types: next.join(", ") }));
                }}
                style={{
                  padding: "7px 14px", borderRadius: "999px", fontSize: "12px", cursor: "pointer",
                  border: `1px solid ${selected ? "#8b5cf6" : "#334155"}`,
                  background: selected ? "rgba(139,92,246,0.15)" : "#1e293b",
                  color: selected ? "#c4b5fd" : "#94a3b8", fontWeight: selected ? 600 : 400,
                }}>
                {cat}
              </button>
            );
          })}
        </div>
      </Field>
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
              <LastModifiedBy name={r.updated_by} />
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
  const [products, setProducts] = useState([]);
  const [packingLists, setPackingLists] = useState([]);
  const [packingListModal, setPackingListModal] = useState(null);
  const [editPackingList, setEditPackingList] = useState(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const load = useCallback(async () => {
    api("/commercial-invoices").then(setInvoices);
    api("/products").then(setProducts);
    api("/packing-lists").then(setPackingLists);
    // Packing List generation needs each order's items (color, width,
    // weight, meterage…), which the plain /orders list doesn't include.
    const orders = await api("/orders");
    const ordersWithItems = await Promise.all(
      orders.map(async o => {
        const detail = await api(`/orders/${o.id}`);
        return { ...o, items: detail.items || [] };
      })
    );
    setOrders(ordersWithItems);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Packing Lists are generated from an order's items, same as before — just
  // triggered from this screen (alongside the Commercial Invoice it ships
  // with) instead of from the Orders screen.
  const generatePackingList = (order) => setPackingListModal(buildPackingListDraft(order, products));

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
      <Field label="Currency" half><input value={currencyLabel(editing.currency)} readOnly onChange={() => {}} style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }} /></Field>
            <Field label="Status" half>
              <Select value={editing.status} onChange={e => setEditing(p => ({ ...p, status: e.target.value }))}>
                <option>Pending</option><option>Paid</option>
              </Select>
            </Field>
            {/* Shipment/Arrival Date live on the linked Order, not on the CI
                itself — editing them here writes straight to the Order, and
                editing them on the Order shows up here too, automatically. */}
            <Field label="Shipment Date" half>
              <Input type="date" value={editing.shipment_date || ""} onChange={e => setEditing(p => ({ ...p, shipment_date: e.target.value }))} />
            </Field>
            <Field label="Arrival Date" half>
              <Input type="date" value={editing.arrival_date || ""} onChange={e => setEditing(p => ({ ...p, arrival_date: e.target.value }))} />
            </Field>
            <Field label="Notes"><Textarea value={editing.notes || ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} /></Field>
            <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn outline color="#64748b" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn onClick={async () => { await api(`/commercial-invoices/${editing.id}`, "PUT", editing).then(load); setEditing(null); }}>Save</Btn>
            </div>
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
          { label: "Actions", render: r => {
            const order = orders.find(o => Number(o.id) === Number(r.order_id));
            const hasPackingList = packingLists.find(p => Number(p.order_id) === Number(r.order_id));
            return (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <Btn small outline color="#10b981" onClick={() => window.open(authUrl(`${API}/commercial-invoices/${r.id}/pdf`), "_blank")}>📄 PDF</Btn>
                <Btn small outline color="#64748b" onClick={() => setEditing(r)}>Edit</Btn>
                {order && (
                  <Btn small outline={!hasPackingList} color={hasPackingList ? "#06b6d4" : "#64748b"}
                    onClick={() => hasPackingList ? setEditPackingList(hasPackingList) : generatePackingList(order)}>
                    📦 {hasPackingList ? "Packing List ✓" : "Packing List"}
                  </Btn>
                )}
                <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/commercial-invoices/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
                <LastModifiedBy name={r.updated_by} />
              </div>
            );
          }},
        ]}
        rows={filtered}
        emptyMsg="No commercial invoices yet."
      />
    </div>
  );
}

// Dedicated Packing Lists screen — previously a Packing List could only be
// reached indirectly through the Commercial Invoice it shipped with (no
// standalone listing existed). Shipment/Arrival Date shown here come from
// the linked Order (see the /api/packing-lists route's join), same
// single-source-of-truth approach as the Commercial Invoice screen.
function PackingLists() {
  const [lists, setLists] = useState([]);
  const [search, setSearch] = useState("");
  const [editList, setEditList] = useState(null);
  const load = useCallback(() => { api("/packing-lists").then(setLists); }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = lists.filter(l =>
    (l.number || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.client || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.order_number || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>Packing Lists</h2>
      </div>
      {editList && (
        <Modal title="Edit Packing List" onClose={() => { setEditList(null); load(); }} wide>
          <PackingListForm
            initial={editList}
            onSave={async b => { await api(`/packing-lists/${editList.id}`, "PUT", b); load(); }}
            onClose={() => { setEditList(null); load(); }}
          />
        </Modal>
      )}
      <Input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by number, order or client…" style={{ ...inputStyle, marginBottom: "16px" }} />
      <Table
        cols={[
          { label: "Number", render: r => <span style={{ fontWeight: 700, color: "#60a5fa" }}>{r.number}</span> },
          { label: "Order #", key: "order_number" },
          { label: "Client", key: "client" },
          { label: "Shipment Date", render: r => r.shipment_date ? fmtDate(r.shipment_date) : "—" },
          { label: "Arrival Date", render: r => r.arrival_date ? fmtDate(r.arrival_date) : "—" },
          { label: "Roll", render: r => r.total_roll || "—" },
          { label: "Gross Weight", render: r => r.total_gross_weight ? `${parseFloat(r.total_gross_weight).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg` : "—" },
          { label: "Net Weight", render: r => r.total_net_weight ? `${parseFloat(r.total_net_weight).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg` : "—" },
          { label: "CBM", render: r => r.total_cbm || "—" },
          { label: "Status", key: "status" },
          { label: "Actions", render: r => (
            <div style={{ display: "flex", gap: "6px" }}>
              <Btn small outline color="#10b981" onClick={() => window.open(authUrl(`${API}/packing-lists/${r.id}/pdf`), "_blank")}>📄 PDF</Btn>
              <Btn small outline color="#64748b" onClick={() => setEditList(r)}>Edit</Btn>
              <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/packing-lists/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No packing lists yet — generate one from the Commercial Invoices screen."
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
              <LastModifiedBy name={r.updated_by} />
            </div>
          )},
        ]}
        rows={filtered}
        emptyMsg="No inspections yet."
      />
    </div>
  );
}

// Full cross-module Excel report — one button, one optional "since" date
// filter, downloads a workbook covering every tracking screen (Quotations,
// Proformas, Orders, Commercial, Contracts, Inspections, Supplier Flow,
// Samples, Packing Lists). Each category gets two sheets — everything still
// open first, everything already completed second — built server-side in
// xlsx/reportBuilder.js. This screen is just the trigger; there's no data to
// fetch or list here.
function Reports() {
  const [since, setSince] = useState("");
  // Category list comes from the backend (xlsx/reportBuilder.js's own
  // CATEGORIES export) instead of being duplicated here, so the checkboxes
  // can never drift out of sync with what the server actually knows how to
  // build. Starts every category checked — that's still the common case.
  const [categories, setCategories] = useState([]);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    api("/reports/categories").then(list => {
      setCategories(list);
      setChecked(Object.fromEntries(list.map(c => [c.key, true])));
    });
  }, []);

  const toggle = key => setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = value => setChecked(Object.fromEntries(categories.map(c => [c.key, value])));

  const selectedKeys = Object.keys(checked).filter(k => checked[k]);
  const allChecked = categories.length > 0 && selectedKeys.length === categories.length;
  const noneChecked = selectedKeys.length === 0;

  const download = () => {
    if (noneChecked) return;
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    // Omitting ?categories= entirely means "everything" server-side, so only
    // send it when the selection is actually a subset — keeps the URL clean
    // in the (most common) all-selected case.
    if (!allChecked) params.set("categories", selectedKeys.join(","));
    const qs = params.toString();
    window.open(authUrl(`${API}/reports/full${qs ? `?${qs}` : ""}`), "_blank");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>📊 Reports</h2>
      </div>
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px", padding: "24px", maxWidth: "640px" }}>
        <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: 1.6, margin: "0 0 16px" }}>
          Generates one Excel workbook. Each screen you pick below becomes two sheets — everything
          still open/pending first, everything already completed second — with status, key dates
          and values for that screen.
        </p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Which screens?
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => toggleAll(true)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "11.5px", cursor: "pointer", padding: 0 }}>All</button>
            <button onClick={() => toggleAll(false)} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "11.5px", cursor: "pointer", padding: 0 }}>None</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: "20px" }}>
          {categories.map(c => (
            <label key={c.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#e2e8f0", cursor: "pointer" }}>
              <input type="checkbox" checked={!!checked[c.key]} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="Since (optional)" half>
            <Input type="date" value={since} onChange={e => setSince(e.target.value)} />
          </Field>
          <Btn onClick={download} disabled={noneChecked}>⬇ Download Report (.xlsx)</Btn>
        </div>
        {noneChecked && (
          <p style={{ color: "#f87171", fontSize: "11.5px", marginTop: "10px", marginBottom: 0 }}>
            Pick at least one screen above.
          </p>
        )}
        <p style={{ color: "#64748b", fontSize: "11.5px", marginTop: "14px", marginBottom: 0 }}>
          Leave the date blank to include everything on record. When set, only records created on
          or after that date are included, in each screen's own timeline.
        </p>
      </div>
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "quotations", label: "Quotations", icon: "💬" },
  { id: "proformas", label: "Proformas", icon: "📄" },
  { id: "orders", label: "Orders", icon: "📋" },
  { id: "commercial", label: "Commercial", icon: "🧾" },
  { id: "packing-lists", label: "Packing Lists", icon: "📑" },
  { id: "contracts", label: "Contracts", icon: "🤝" },
  { id: "inspections", label: "Inspections", icon: "🔍" },
  { id: "fin-suppliers", label: "Supplier Flow", icon: "📦" },
  { id: "samples", label: "Samples", icon: "✏️" },
  { id: "products", label: "Products", icon: "🗂" },
  { id: "clients", label: "Clients", icon: "🏢" },
  { id: "suppliers", label: "Suppliers", icon: "🏭" },
  { id: "reports", label: "Reports", icon: "📊" },
];

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

// Replaces the old single shared password (which lived in this file, in
// plain text, shipped straight to every visitor's browser) with real
// per-person logins verified server-side. Each of the 9 accounts has its
// own username/password; the backend hashes and checks passwords and every
// API route now requires the session token this screen gets back.
function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Incorrect username or password.");
        return;
      }
      setAuthToken(data.token);
      const user = { name: data.name, username: data.username, mustChangePassword: !!data.mustChangePassword };
      localStorage.setItem("af_user", JSON.stringify(user));
      onLoggedIn(user);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

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
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Name"
              autoCapitalize="off" autoCorrect="off"
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder="Enter password…"
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
            />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "12px" }}>{error}</div>}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: "#3b82f6", border: "none", borderRadius: "8px",
              padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer", marginTop: "4px", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Signing in…" : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shown right after login for any account still on its original temporary
// password (must_change_password) — forces setting a real one before the
// person can reach any actual data.
function ForceChangePasswordScreen({ user, onDone }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (pw1.length < 6) return setError("Password must be at least 6 characters.");
    if (pw1 !== pw2) return setError("Passwords don't match.");
    setError("");
    setBusy(true);
    try {
      await api("/change-password", "POST", { newPassword: pw1 });
      const updated = { ...user, mustChangePassword: false };
      localStorage.setItem("af_user", JSON.stringify(updated));
      onDone(updated);
    } catch {
      setError("Couldn't update your password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#020617", display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px",
        padding: "40px 48px", width: "100%", maxWidth: "380px",
        boxShadow: "0 25px 60px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", gap: "20px",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#f1f5f9" }}>Welcome, {user.name}</div>
          <div style={{ fontSize: "12.5px", color: "#94a3b8", marginTop: "8px", lineHeight: 1.5 }}>
            This is your first time signing in. Set a new password to continue — the temporary one won't work again after this.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>New password</label>
            <input
              type="password" value={pw1}
              onChange={e => { setPw1(e.target.value); setError(""); }}
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Confirm password</label>
            <input
              type="password" value={pw2}
              onChange={e => { setPw2(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              style={{
                background: "#1e293b", border: `1px solid ${error ? "#ef4444" : "#334155"}`,
                borderRadius: "8px", padding: "12px 14px", color: "#f1f5f9",
                fontSize: "14px", outline: "none", width: "100%", boxSizing: "border-box", marginTop: "6px",
              }}
            />
          </div>
          {error && <div style={{ color: "#ef4444", fontSize: "12px" }}>{error}</div>}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: "#3b82f6", border: "none", borderRadius: "8px",
              padding: "12px", color: "#fff", fontSize: "14px", fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer", marginTop: "4px", opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Saving…" : "Set password & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("af_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const logout = async () => {
    try { await api("/logout", "POST"); } catch { /* token may already be gone — fine either way */ }
    setAuthToken(null);
    localStorage.removeItem("af_user");
    setUser(null);
  };

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  if (user.mustChangePassword) {
    return <ForceChangePasswordScreen user={user} onDone={setUser} />;
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
      case "packing-lists": return <PackingLists />;
      case "contracts": return <Contracts />;
      case "fin-suppliers": return <Financial type="supplier" />;
      case "reports": return <Reports />;
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
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Alliance Flow</div>
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
          <div style={{ padding: "10px 12px", borderTop: "1px solid #1e293b" }}>
            {sidebarOpen ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
                  <div style={{ fontSize: "10px", color: "#475569" }}>@{user.username}</div>
                </div>
                <button onClick={logout} title="Log out"
                  style={{
                    background: "none", border: "none", color: "#64748b", cursor: "pointer",
                    fontSize: "13px", padding: "4px 6px", borderRadius: "6px", flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                  onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
                >⏻</button>
              </div>
            ) : (
              <button onClick={logout} title={`Log out (${user.name})`}
                style={{
                  width: "100%", background: "none", border: "none", color: "#64748b",
                  cursor: "pointer", fontSize: "16px", textAlign: "center", padding: "4px",
                }}
                onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                onMouseLeave={e => e.currentTarget.style.color = "#64748b"}
              >⏻</button>
            )}
          </div>
          <div style={{ padding: "8px 8px 12px", borderTop: "1px solid #1e293b" }}>
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
