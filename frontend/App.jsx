import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (n, cur = "USD") =>
  n != null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n)
    : "—";

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US") : "—");

async function api(path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────

const ORDER_STATUSES = ["Pending", "In Production", "Inspection", "Completed"];
const STATUS_COLORS = {
  Pending: { bg: "#1e293b", text: "#94a3b8", dot: "#64748b", border: "#334155" },
  "In Production": { bg: "#1e3a5f", text: "#60a5fa", dot: "#3b82f6", border: "#1e40af" },
  Inspection: { bg: "#3b2a00", text: "#fbbf24", dot: "#f59e0b", border: "#92400e" },
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

function Input(props) { return <input style={inputStyle} {...props} />; }
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

function OrderForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    order_number: "", client: "", supplier: "", value: "", currency: "USD",
    production_lead_time: "", shipment_date: "", arrival_date: "",
    incoterm: "", payment_terms: "", port_of_loading: "", port_of_discharge: "", notes: "",
  });
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [clientSearch, setClientSearch] = useState(initial?.client || "");
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [productSearch, setProductSearch] = useState(initial?.product || "");
  const [showClientList, setShowClientList] = useState(false);
  const [showSupplierList, setShowSupplierList] = useState(false);
  const [showProductList, setShowProductList] = useState(false);
  const [showPaymentList, setShowPaymentList] = useState(false);
  const [showLoadingList, setShowLoadingList] = useState(false);
  const [showDischargeList, setShowDischargeList] = useState(false);

  useEffect(() => {
    api("/clients").then(setClients);
    api("/suppliers").then(setSuppliers);
    api("/products").then(setProducts);
  }, []);

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

  const chinaPortsOptions = [
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

const brazilPortsOptions = [
  "Santos, BR", "Paranaguá, BR", "Rio de Janeiro, BR", "Itajaí, BR", "Suape, BR",
  "Manaus, BR", "Salvador, BR", "Fortaleza, BR", "Belém, BR", "Rio Grande, BR",
  "Vitória, BR", "São Francisco do Sul, BR", "Navegantes, BR", "Imbituba, BR",
  "Porto Alegre, BR", "Recife, BR", "Maceió, BR", "Natal, BR", "São Luís, BR",
  "Aratu, BR", "Angra dos Reis, BR", "Sepetiba, BR", "Presidente Epitácio, BR",
  "Santarém, BR", "Porto Velho, BR", "Corumbá, BR", "Ladário, BR",
  "Ilhéus, BR", "Cabedelo, BR", "Pecém, BR",
];

  const filteredClients = clients.filter(c =>
    c.company_name.toLowerCase().includes(clientSearch.toLowerCase())
  );
  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(supplierSearch.toLowerCase())
  );
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );
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

  const submit = async () => { await onSave(f); onClose(); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Order Number" half>
        <Input value={f.order_number} onChange={set("order_number")} placeholder="EXP-2024-001" />
      </Field>

      {/* CLIENT */}
      <Field label="Client" half>
        <div style={{ position: "relative" }}>
          <Input
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setF(p => ({ ...p, client: e.target.value })); setShowClientList(true); }}
            onFocus={() => setShowClientList(true)}
            onBlur={() => setTimeout(() => setShowClientList(false), 200)}
            placeholder="Search client…"
          />
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

      {/* SUPPLIER */}
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

      {/* PRODUCT */}
      <Field label="Product" half>
        <div style={{ position: "relative" }}>
          <Input
            value={productSearch}
            onChange={e => { setProductSearch(e.target.value); setF(p => ({ ...p, product: e.target.value })); setShowProductList(true); }}
            onFocus={() => setShowProductList(true)}
            onBlur={() => setTimeout(() => setShowProductList(false), 200)}
            placeholder="Search product…"
          />
          {showProductList && filteredProducts.length > 0 && (
            <div style={dropdownStyle}>
              {filteredProducts.map(p => (
                <div key={p.id} style={dropItemStyle}
                  onMouseDown={() => { setProductSearch(`${p.code} – ${p.name}`); setF(prev => ({ ...prev, product: p.name, value: p.sale_price || prev.value })); setShowProductList(false); }}
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
      <Field label="Incoterm" half>
        <Select value={f.incoterm} onChange={set("incoterm")}>
          <option value="">Select...</option>
          {["FOB","CIF","CFR","EXW","DAP","DDP","FCA"].map(t => <option key={t}>{t}</option>)}
        </Select>
      </Field>

      {/* PORT OF LOADING */}
<Field label="Port of Loading" half>
  <div style={{ position: "relative" }}>
    <Input
      value={f.port_of_loading}
      onChange={e => { setF(p => ({ ...p, port_of_loading: e.target.value })); setShowLoadingList(true); }}
      onFocus={() => setShowLoadingList(true)}
      onBlur={() => setTimeout(() => setShowLoadingList(false), 200)}
      placeholder="Search China ports or type any…"
    />
    {showLoadingList && f.port_of_loading !== undefined && (
      <div style={dropdownStyle}>
        {chinaPortsOptions
          .filter(p => p.toLowerCase().includes((f.port_of_loading || "").toLowerCase()))
          .map((p, i) => (
            <div key={i} style={dropItemStyle}
              onMouseDown={() => { setF(prev => ({ ...prev, port_of_loading: p })); setShowLoadingList(false); }}
              onMouseEnter={e => e.currentTarget.style.background = "#334155"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {p}
            </div>
          ))}
      </div>
    )}
  </div>
</Field>

      {/* PORT OF DISCHARGE */}
<Field label="Port of Discharge" half>
  <div style={{ position: "relative" }}>
    <Input
      value={f.port_of_discharge}
      onChange={e => { setF(p => ({ ...p, port_of_discharge: e.target.value })); setShowDischargeList(true); }}
      onFocus={() => setShowDischargeList(true)}
      onBlur={() => setTimeout(() => setShowDischargeList(false), 200)}
      placeholder="Search Brazil ports or type any…"
    />
    {showDischargeList && f.port_of_discharge !== undefined && (
      <div style={dropdownStyle}>
        {brazilPortsOptions
          .filter(p => p.toLowerCase().includes((f.port_of_discharge || "").toLowerCase()))
          .map((p, i) => (
            <div key={i} style={dropItemStyle}
              onMouseDown={() => { setF(prev => ({ ...prev, port_of_discharge: p })); setShowDischargeList(false); }}
              onMouseEnter={e => e.currentTarget.style.background = "#334155"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {p}
            </div>
          ))}
      </div>
    )}
  </div>
</Field>

      <Field label="Shipment Date" half>
        <Input type="date" value={f.shipment_date} onChange={set("shipment_date")} />
      </Field>
      <Field label="Arrival Date" half>
        <Input type="date" value={f.arrival_date} onChange={set("arrival_date")} />
      </Field>

      {/* PAYMENT TERMS */}
      <Field label="Payment Terms">
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

      <Field label="Notes">
        <Textarea value={f.notes} onChange={set("notes")} />
      </Field>

      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit}>Save Order</Btn>
      </div>
    </div>
  );
}

function ProductForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    code: "", name: "", description: "", unit: "unit", width: "", height: "", thickness: "", weight: "",
    unit_cost: "", cost_currency: "USD", margin: "", sale_price: "", sale_currency: "USD",
    category: "", supplier: "",
  });
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState(initial?.supplier || "");
  const [showSupplierList, setShowSupplierList] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    api("/suppliers").then(setSuppliers);
  }, []);

  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const handleCostChange = (e) => {
    const cost = parseFloat(e.target.value) || 0;
    const margin = parseFloat(f.margin) || 0;
    const sale = margin > 0 ? (cost * (1 + margin / 100)).toFixed(2) : f.sale_price;
    setF((p) => ({ ...p, unit_cost: e.target.value, sale_price: sale }));
  };

  const handleMarginChange = (e) => {
    const margin = parseFloat(e.target.value) || 0;
    const cost = parseFloat(f.unit_cost) || 0;
    const sale = cost > 0 ? (cost * (1 + margin / 100)).toFixed(2) : f.sale_price;
    setF((p) => ({ ...p, margin: e.target.value, sale_price: sale }));
  };

  const handleSalePriceChange = (e) => {
    const sale = parseFloat(e.target.value) || 0;
    const cost = parseFloat(f.unit_cost) || 0;
    const margin = cost > 0 ? (((sale - cost) / cost) * 100).toFixed(1) : f.margin;
    setF((p) => ({ ...p, sale_price: e.target.value, margin }));
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
      <Field label="Category" half><Input value={f.category} onChange={set("category")} /></Field>

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

      <Field label="Unit" half>
        <Select value={f.unit} onChange={set("unit")}>
          {["unit","kg","m","m²","m³","box","pcs","set","pair"].map(u => <option key={u}>{u}</option>)}
        </Select>
      </Field>
      <Field label="Width" half><Input value={f.width} onChange={set("width")} placeholder="e.g. 1.2m, 150cm" /></Field>
      <Field label="Height" half><Input value={f.height || ""} onChange={set("height")} placeholder="e.g. 0.8m, 80cm" /></Field>
      <Field label="Thickness" half><Input value={f.thickness || ""} onChange={set("thickness")} placeholder="e.g. 5mm, 0.5cm" /></Field>
      <Field label="Weight" half><Input value={f.weight || ""} onChange={set("weight")} placeholder="e.g. 2.5kg, 500g" /></Field>
      
      <Field label="Cost Currency" half>
        <Select value={f.cost_currency} onChange={set("cost_currency")}>
          {currencies.map(c => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Unit Cost" half>
        <Input type="number" value={f.unit_cost} onChange={handleCostChange} placeholder="0.00" />
      </Field>

      <Field label="Margin %" half>
        <div style={{ position: "relative" }}>
          <Input type="number" value={f.margin} onChange={handleMarginChange} placeholder="0" style={{ ...inputStyle, paddingRight: "32px" }} />
          <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "#64748b", fontSize: "13px" }}>%</span>
        </div>
      </Field>
      <Field label="Sale Currency" half>
        <Select value={f.sale_currency} onChange={set("sale_currency")}>
          {currencies.map(c => <option key={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Sale Price" half>
        <Input type="number" value={f.sale_price} onChange={handleSalePriceChange} placeholder="0.00" />
      </Field>
      {f.unit_cost && f.sale_price && (
        <div style={{ gridColumn: "span 1", background: "#0f172a", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Margin:</span>
          <span style={{ fontWeight: 700, color: parseFloat(f.margin) >= 0 ? "#10b981" : "#ef4444", fontSize: "16px" }}>
            {f.margin || 0}%
          </span>
        </div>
      )}

      <Field label="Description"><Textarea value={f.description} onChange={set("description")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Product</Btn>
      </div>
    </div>
  );
}

function SampleForm({ onSave, onClose }) {
  const [f, setF] = useState({ product_name: "", client: "", requested_date: "", status: "Requested", notes: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
      <Field label="Product Name"><Input value={f.product_name} onChange={set("product_name")} /></Field>
      <Field label="Client" half><Input value={f.client} onChange={set("client")} /></Field>
      <Field label="Requested Date" half><Input type="date" value={f.requested_date} onChange={set("requested_date")} /></Field>
      <Field label="Sent Date" half><Input type="date" value={f.sent_date || ""} onChange={set("sent_date")} /></Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {SAMPLE_STATUSES.map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Sample</Btn>
      </div>
    </div>
  );
}

function ProformaForm({ onSave, onClose, orders, initial }) {
  const [f, setF] = useState(initial || { order_id: "", number: "", issue_date: "", validity: "", client: "", total: "", currency: "USD", status: "Draft", notes: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
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
      <Field label="Total Amount" half><Input type="number" value={f.total} onChange={set("total")} /></Field>
      <Field label="Currency" half>
        <Select value={f.currency} onChange={set("currency")}>
          <option>USD</option><option>EUR</option><option>BRL</option>
        </Select>
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Sent","Accepted","Rejected"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
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
      <Field label="Total Amount" half><Input type="number" value={f.total} onChange={set("total")} /></Field>
      <Field label="Currency" half>
        <Select value={f.currency} onChange={set("currency")}>
          <option>USD</option><option>EUR</option><option>BRL</option><option>CNY</option>
        </Select>
      </Field>
      <Field label="Status" half>
        <Select value={f.status} onChange={set("status")}>
          {["Draft","Signed","In Force","Completed","Cancelled"].map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn onClick={async () => { await onSave(f); onClose(); }}>Save Contract</Btn>
      </div>
    </div>
  );
}

function FinForm({ type, onSave, onClose, orders }) {
  const isClient = type === "client";
  const [f, setF] = useState({
    order_id: "", [isClient ? "client" : "supplier"]: "", description: "",
    type: isClient ? "Invoice" : "Purchase Order",
    amount: "", currency: "USD", due_date: "", status: "Pending", notes: "",
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
      <Field label="Notes"><Textarea value={f.notes} onChange={set("notes")} /></Field>
      <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <Btn outline color="#64748b" onClick={onClose}>Cancel</Btn>
        <Btn color={isClient ? "#3b82f6" : "#8b5cf6"} onClick={async () => { await onSave(f); onClose(); }}>Save</Btn>
      </div>
    </div>
  );
}

// ─── SECTION COMPONENTS ───────────────────────────────────────────────────────

function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api("/dashboard").then(setData); }, []);
  if (!data) return <div style={{ color: "#475569", padding: "40px", textAlign: "center" }}>Loading...</div>;
  const statusMap = Object.fromEntries(data.orderStats.map(s => [s.status, s]));
  const totalOrders = data.orderStats.reduce((a, b) => a + b.count, 0);
  const totalValue = data.orderStats.reduce((a, b) => a + (b.total_value || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatCard label="Total Orders" value={totalOrders} sub={fmt(totalValue)} color="#3b82f6" />
        <StatCard label="Pending" value={statusMap["Pending"]?.count || 0} sub={fmt(statusMap["Pending"]?.total_value)} color="#64748b" />
        <StatCard label="In Production" value={statusMap["In Production"]?.count || 0} sub={fmt(statusMap["In Production"]?.total_value)} color="#3b82f6" />
        <StatCard label="Inspection" value={statusMap["Inspection"]?.count || 0} sub={fmt(statusMap["Inspection"]?.total_value)} color="#f59e0b" />
        <StatCard label="Completed" value={statusMap["Completed"]?.count || 0} sub={fmt(statusMap["Completed"]?.total_value)} color="#10b981" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>💰 Client Receivables</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatCard label="Pending" value={fmt(data.clientFinancial?.pending)} color="#f59e0b" />
            <StatCard label="Received" value={fmt(data.clientFinancial?.received)} color="#10b981" />
          </div>
        </div>
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>📦 Supplier Payables</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <StatCard label="Pending" value={fmt(data.supplierFinancial?.pending)} color="#f59e0b" />
            <StatCard label="Paid" value={fmt(data.supplierFinancial?.paid)} color="#8b5cf6" />
          </div>
        </div>
      </div>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "20px" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "14px", fontWeight: 600, color: "#94a3b8" }}>🕐 Recent Orders</h3>
        <Table
          cols={[
            { label: "Order #", render: r => <span style={{ fontWeight: 600, color: "#60a5fa" }}>{r.order_number}</span> },
            { label: "Client", key: "client" },
            { label: "Value", render: r => fmt(r.value, r.currency) },
            { label: "Shipment", render: r => fmtDate(r.shipment_date) },
            { label: "Status", render: r => <Badge status={r.status} /> },
          ]}
          rows={data.recentOrders}
        />
      </div>
    </div>
  );
}

function Orders() {
const [orders, setOrders] = useState([]);
  const [modal, setModal] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [editNumberId, setEditNumberId] = useState(null);
  const [editNumberVal, setEditNumberVal] = useState("");
  const [search, setSearch] = useState("");
  const [proformaModal, setProformaModal] = useState(null);
  const [contractModal, setContractModal] = useState(null);

  const load = useCallback(() => api("/orders").then(setOrders), []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const filtered = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.client.toLowerCase().includes(search.toLowerCase()) ||
    (o.status || "").toLowerCase().includes(search.toLowerCase()) ||
    (o.incoterm || "").toLowerCase().includes(search.toLowerCase())
  );

  const createOrder = (f) => api("/orders", "POST", f).then(load);
  const updateOrder = (f) => api(`/orders/${editOrder.id}`, "PUT", f).then(load);
  const changeStatus = async (id, status) => { await api(`/orders/${id}/status`, "PATCH", { status }); load(); };
  const deleteOrder = async (id) => { if (confirm("Delete this order?")) { await api(`/orders/${id}`, "DELETE"); load(); } };
  const saveNumber = async (id) => {
    await api(`/orders/${id}`, "PUT", { ...orders.find(o => o.id === id), order_number: editNumberVal });
    setEditNumberId(null); load();
  };

  const nextStatus = { Pending: "In Production", "In Production": "Inspection", Inspection: "Completed" };
const prevStatus = { "In Production": "Pending", Inspection: "In Production", Completed: "Inspection" };
const generateProforma = (order) => {
    const number = `PI-${order.order_number}-${Date.now().toString().slice(-4)}`;
    setProformaModal({
      order_id: order.id,
      number,
      issue_date: new Date().toISOString().slice(0, 10),
      validity: "",
      client: order.client,
      total: order.value,
      currency: order.currency || "USD",
      status: "Draft",
      notes: "",
    });
  };
  const generateContract = (order) => {
  const number = `SC-${order.order_number}-${Date.now().toString().slice(-4)}`;
  setContractModal({
    order_id: order.id,
    contract_number: number,
    supplier: order.supplier || "",
    sign_date: new Date().toISOString().slice(0, 10),
    delivery_date: order.shipment_date || "",
    total: order.value || "",
    currency: order.currency || "USD",
    status: "Draft",
    notes: order.notes || "",
  });
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
{proformaModal && (
        <Modal title="Generate Proforma Invoice" onClose={() => setProformaModal(null)} wide>
          <ProformaForm
            orders={orders}
            initial={proformaModal}
            onSave={async b => { await api("/proformas", "POST", b); setProformaModal(null); }}
            onClose={() => setProformaModal(null)}
          />
        </Modal>
      )}
{contractModal && (
  <Modal title="Generate Supplier Contract" onClose={() => setContractModal(null)} wide>
    <ContractForm
      orders={orders}
      initial={contractModal}
      onSave={async b => { await api("/contracts", "POST", b); setContractModal(null); load(); }}
      onClose={() => setContractModal(null)}
    />
  </Modal>
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
          { label: "Status", render: r => <Badge status={r.status} /> },
          { label: "Actions", render: r => (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {prevStatus[r.status] && (
                  <Btn small outline color="#64748b" onClick={() => changeStatus(r.id, prevStatus[r.status])}>
                    ← {prevStatus[r.status]}
                  </Btn>
                )}
                {nextStatus[r.status] && (
                  <Btn small color="#10b981" onClick={() => changeStatus(r.id, nextStatus[r.status])}>
                    → {nextStatus[r.status]}
                  </Btn>
                )}
                <Btn small color="#f59e0b" onClick={() => generateProforma(r)}>📄 Proforma</Btn>
                <Btn small color="#8b5cf6" onClick={() => generateContract(r)}>🤝 Contract</Btn>
                <Btn small outline color="#64748b" onClick={() => setEditOrder(r)}>Edit</Btn>
                <Btn small outline color="#ef4444" onClick={() => deleteOrder(r.id)}>Del</Btn>
              </div>
            )},
        ]}
        rows={filtered}
        emptyMsg="No orders yet. Create your first one!"
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
  { label: "Cost", render: r => r.unit_cost ? `${r.cost_currency || "USD"} ${parseFloat(r.unit_cost).toFixed(2)}` : "—" },
  { label: "Sale Price", render: r => r.sale_price ? `${r.sale_currency || "USD"} ${parseFloat(r.sale_price).toFixed(2)}` : "—" },
  { label: "Margin", render: r => r.unit_cost > 0 ? (
    <span style={{ color: parseFloat(r.margin) >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
      {r.margin || (((r.sale_price - r.unit_cost) / r.unit_cost) * 100).toFixed(1)}%
    </span>
  ) : "—" },
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
      <Table
        cols={[
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
            <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`/samples/${r.id}`, "DELETE"); load(); } }}>Del</Btn>
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
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    api("/proformas").then(setProformas);
    api("/orders").then(setOrders);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = proformas.filter(p =>
    p.number.toLowerCase().includes(search.toLowerCase()) ||
    p.client.toLowerCase().includes(search.toLowerCase()) ||
    (p.status || "").toLowerCase().includes(search.toLowerCase())
  );

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
    <div style={{ display: "flex", gap: "6px" }}>
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
      <Table
        cols={[
          { label: isClient ? "Client" : "Supplier", render: r => <span style={{ fontWeight: 600 }}>{r[party]}</span> },
          { label: "Type", key: "type" },
          { label: "Description", key: "description" },
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
          { label: "", render: r => <Btn small outline color="#ef4444" onClick={async () => { if (confirm("Delete?")) { await api(`${endpoint}/${r.id}`, "DELETE"); load(); } }}>Del</Btn> },
        ]}
        rows={records}
      />
    </div>
  );
}
function ClientForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || {
    company_name: "", address: "", address2: "", email: "",
    phone: "", contact_name: "", payment_terms: "", notes: "",
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
// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "orders", label: "Orders", icon: "📋" },
  { id: "clients", label: "Clients", icon: "🏢" },
  { id: "suppliers", label: "Suppliers", icon: "🏭" },
  { id: "products", label: "Products", icon: "🗂" },
  { id: "samples", label: "Samples", icon: "✏️" },
  { id: "proformas", label: "Proformas", icon: "📄" },
  { id: "contracts", label: "Contracts", icon: "🤝" },
  { id: "fin-clients", label: "Client Flow", icon: "💰" },
  { id: "fin-suppliers", label: "Supplier Flow", icon: "📦" },
];

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

const renderTab = () => {
    switch (tab) {
      case "dashboard": return <Dashboard />;
      case "orders": return <Orders />;
      case "clients": return <Clients />;
      case "suppliers": return <Suppliers />;
      case "products": return <Products />;
      case "samples": return <Samples />;
      case "proformas": return <Proformas />;
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
