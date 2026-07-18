const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/data/pedidos.db'
  : path.join(__dirname, 'pedidos.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    client TEXT NOT NULL,
    supplier TEXT,
    product TEXT,
    value REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    production_lead_time INTEGER,
    delivery_days INTEGER,
    shipment_date TEXT,
    arrival_date TEXT,
    incoterm TEXT,
    payment_terms TEXT,
    port_of_loading TEXT,
    port_of_discharge TEXT,
    acquisition_company TEXT DEFAULT '',
    container TEXT DEFAULT '',
    container_qty REAL,
    notes TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT DEFAULT 'unit',
    ncm TEXT DEFAULT '',
    hs_code TEXT DEFAULT '',
    color TEXT DEFAULT '',
    width TEXT,
    width_unit TEXT DEFAULT 'cm',
    height TEXT,
    height_unit TEXT DEFAULT 'cm',
    thickness TEXT,
    thickness_unit TEXT DEFAULT 'mm',
    weight TEXT,
    weight_unit TEXT DEFAULT 'kg',
    unit_cost REAL DEFAULT 0,
    cost_currency TEXT DEFAULT 'USD',
    sale_price REAL DEFAULT 0,
    sale_currency TEXT DEFAULT 'USD',
    cost_per_meter REAL DEFAULT 0,
    sale_per_meter REAL DEFAULT 0,
    category TEXT,
    supplier TEXT,
    media TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    product_code TEXT,
    supplier TEXT,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'unit',
    unit_price REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    total REAL DEFAULT 0,
    total_weight REAL,
    total_meterage REAL,
    cost_price REAL,
    cost_currency TEXT,
    category TEXT,
    sale_per_meter REAL,
    cost_per_meter REAL,
    sale_per_liter REAL,
    cost_per_liter REAL,
    sale_pct REAL,
    target_price REAL,
    target_price_unit TEXT,
    height REAL,
    height_unit TEXT DEFAULT 'cm'
  );

  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT DEFAULT '',
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    category TEXT,
    client TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    sent_date TEXT,
    feedback_date TEXT,
    status TEXT DEFAULT 'Requested',
    notes TEXT,
    media TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    client TEXT,
    suppliers TEXT,
    currency TEXT DEFAULT 'USD',
    deadline TEXT,
    specifications TEXT,
    notes TEXT,
    status TEXT DEFAULT 'Open',
    media TEXT,
    items TEXT,
    total REAL,
    target_price REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS proformas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
    number TEXT UNIQUE NOT NULL,
    issue_date TEXT NOT NULL,
    validity TEXT,
    client TEXT NOT NULL,
    total REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'Draft',
    notes TEXT,
    acquisition_company TEXT DEFAULT '',
    incoterm TEXT,
    way_of_shipment TEXT DEFAULT 'By Sea',
    port_of_loading TEXT,
    port_of_discharge TEXT,
    supplier TEXT,
    payment_terms TEXT,
    production_days INTEGER,
    delivery_days INTEGER,
    items TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS supplier_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    contract_number TEXT UNIQUE NOT NULL,
    supplier TEXT NOT NULL,
    sign_date TEXT NOT NULL,
    delivery_date TEXT,
    total REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'Draft',
    notes TEXT,
    items_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS commercial_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    number TEXT UNIQUE NOT NULL,
    issue_date TEXT NOT NULL,
    client TEXT,
    total REAL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    number TEXT,
    inspection_date TEXT,
    inspector TEXT,
    result TEXT DEFAULT 'Pending',
    observations TEXT,
    media TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    client TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    due_date TEXT NOT NULL,
    paid_date TEXT,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS financial_suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    supplier TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    due_date TEXT NOT NULL,
    paid_date TEXT,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    contract_id INTEGER REFERENCES supplier_contracts(id) ON DELETE SET NULL,
    items_json TEXT,
    payer TEXT,
    payment_method TEXT DEFAULT '网银汇款 Online bank payment',
    applicant TEXT,
    approved_by TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    address TEXT,
    address2 TEXT,
    address_number TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,
    contact_name TEXT,
    payment_terms TEXT,
    tax_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS packing_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    number TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    way_of_shipment TEXT DEFAULT 'By Sea',
    country_of_origin TEXT DEFAULT 'China',
    country_of_acquisition TEXT,
    port_of_origin TEXT,
    port_of_destination TEXT,
    incoterm TEXT,
    manufacturer TEXT,
    manufacturer_address TEXT,
    items_json TEXT,
    total_length REAL,
    total_roll REAL,
    total_gross_weight REAL,
    total_net_weight REAL,
    total_cbm REAL,
    status TEXT DEFAULT 'Draft',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    address TEXT,
    address2 TEXT,
    address_number TEXT,
    neighborhood TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    country TEXT,
    email TEXT,
    phone TEXT,
    contact_name TEXT,
    payment_terms TEXT,
    product_types TEXT,
    notes TEXT,
    beneficiary_name TEXT,
    bank_name TEXT,
    bank_branch TEXT,
    account_number TEXT,
    swift_code TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Real per-person accounts, replacing the old single shared frontend
  -- password. One row per team member; password_hash is a bcrypt hash,
  -- never the plain password.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Opaque bearer tokens issued on login. Stored server-side so logout (or
  -- an admin revoking access) just deletes the row — no JWT secret to
  -- manage, no way to keep using a token after it's deleted.
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT DEFAULT (datetime('now'))
  );
`);

// ─── Defensive migrations for pre-existing databases (e.g. Render disk) ──────
// The CREATE TABLE IF NOT EXISTS statements above only take effect for
// brand-new tables. For tables that already exist (production), we add any
// column that might be missing. Each ADD COLUMN is wrapped so an
// already-present column ("duplicate column name") is silently ignored —
// this file can be run safely against both a fresh DB and the live one.
const migrations = [
  ['orders', 'acquisition_company', "TEXT DEFAULT ''"],
  ['orders', 'container', "TEXT DEFAULT ''"],
  ['orders', 'container_qty', 'REAL'],
  ['products', 'ncm', "TEXT DEFAULT ''"],
  ['products', 'hs_code', "TEXT DEFAULT ''"],
  ['products', 'color', "TEXT DEFAULT ''"],
  ['products', 'width_unit', "TEXT DEFAULT 'cm'"],
  ['products', 'height_unit', "TEXT DEFAULT 'cm'"],
  ['products', 'thickness_unit', "TEXT DEFAULT 'mm'"],
  ['products', 'weight_unit', "TEXT DEFAULT 'kg'"],
  ['products', 'cost_per_meter', 'REAL DEFAULT 0'],
  ['products', 'sale_per_meter', 'REAL DEFAULT 0'],
  ['products', 'media', 'TEXT'],
  // Liquid/chemical goods (sold in drums/barrels) — the liter equivalent of
  // height/cost_per_meter/sale_per_meter for Textile rolls.
  ['products', 'volume', 'REAL'],
  ['products', 'volume_unit', "TEXT DEFAULT 'L'"],
  ['products', 'cost_per_liter', 'REAL DEFAULT 0'],
  ['products', 'sale_per_liter', 'REAL DEFAULT 0'],
  // Registered default markup % for this product — carried over as the
  // starting Markup % on any Quotation item created from it (instead of
  // always starting at 0), since it's usually the same standard margin
  // reused quote after quote.
  ['products', 'sale_pct', 'REAL'],
  // Weight of the empty cardboard/plastic tube core inside a Textile/DTF
  // Film roll — needed to compute an accurate Gross Weight in the Packing
  // List (Gross = Net + tube_weight × roll count), since the tube itself
  // isn't part of the sellable net goods weight.
  ['products', 'tube_weight', 'REAL'],
  ['products', 'tube_weight_unit', "TEXT DEFAULT 'kg'"],
  // Split-payment schedule for a Supplier Payment, e.g. "20/80" (20% deposit
  // + 80% balance) or "50/50" — "100" (or blank) means a single payment.
  // Each installment gets its own Payment Notice PDF (see the
  // payment-notice-pdf route's ?pct=&label= params).
  ['financial_suppliers', 'payment_schedule', "TEXT DEFAULT '100'"],
  // Multi-container shipments: JSON array of { seq, code } — one entry per
  // physical container the order ships in. When there's more than one, each
  // item row in items_json also carries a matching container_seq so the
  // Packing List (and the Commercial Invoice's shipment summary) can group
  // goods by which container they're loaded into, same as the client's own
  // reference documents (each container gets its own "Container 0N: CODE"
  // section with its own subtotal).
  ['packing_lists', 'containers_json', 'TEXT'],
  ['order_items', 'product_code', 'TEXT'],
  ['order_items', 'supplier', 'TEXT'],
  ['order_items', 'currency', "TEXT DEFAULT 'USD'"],
  ['order_items', 'total_weight', 'REAL'],
  ['order_items', 'total_meterage', 'REAL'],
  ['order_items', 'cost_price', 'REAL'],
  ['order_items', 'cost_currency', 'TEXT'],
  ['order_items', 'category', 'TEXT'],
  ['order_items', 'sale_per_meter', 'REAL'],
  ['order_items', 'cost_per_meter', 'REAL'],
  ['order_items', 'sale_per_liter', 'REAL'],
  ['order_items', 'cost_per_liter', 'REAL'],
  ['order_items', 'sale_pct', 'REAL'],
  ['order_items', 'target_price', 'REAL'],
  ['order_items', 'target_price_unit', 'TEXT'],
  // Per-item override of the product's registered roll length — lets a
  // Quotation/Order item use a different meterage than what's registered on
  // the product (e.g. a custom roll length requested by the client), still
  // feeding into the same Total Weight / Total Meterage calculations.
  ['order_items', 'height', 'REAL'],
  ['order_items', 'height_unit', "TEXT DEFAULT 'cm'"],
  ['samples', 'code', "TEXT DEFAULT ''"],
  ['samples', 'product_id', 'INTEGER'],
  ['samples', 'feedback_date', 'TEXT'],
  ['samples', 'media', 'TEXT'],
  ['proformas', 'quotation_id', 'INTEGER'],
  ['supplier_contracts', 'items_json', 'TEXT'],
  ['financial_suppliers', 'contract_id', 'INTEGER'],
  ['financial_suppliers', 'items_json', 'TEXT'],
  ['suppliers', 'beneficiary_name', 'TEXT'],
  // Structured address fields — previously address/address2 were the only
  // fields, forcing everything (street, number, city, state, zip...) into
  // two freeform lines. Both clients and suppliers get the same breakdown.
  ['suppliers', 'address_number', 'TEXT'],
  ['suppliers', 'neighborhood', 'TEXT'],
  ['suppliers', 'city', 'TEXT'],
  ['suppliers', 'state', 'TEXT'],
  ['suppliers', 'zip_code', 'TEXT'],
  ['suppliers', 'country', 'TEXT'],
  ['clients', 'address_number', 'TEXT'],
  ['clients', 'neighborhood', 'TEXT'],
  ['clients', 'city', 'TEXT'],
  ['clients', 'state', 'TEXT'],
  ['clients', 'zip_code', 'TEXT'],
  ['clients', 'country', 'TEXT'],
  ['suppliers', 'bank_name', 'TEXT'],
  ['suppliers', 'bank_branch', 'TEXT'],
  ['suppliers', 'account_number', 'TEXT'],
  ['suppliers', 'swift_code', 'TEXT'],
  ['clients', 'tax_id', 'TEXT'],
  ['financial_suppliers', 'payer', 'TEXT'],
  ['financial_suppliers', 'payment_method', "TEXT DEFAULT '网银汇款 Online bank payment'"],
  ['financial_suppliers', 'applicant', 'TEXT'],
  ['financial_suppliers', 'approved_by', 'TEXT'],
  ['proformas', 'acquisition_company', "TEXT DEFAULT ''"],
  ['proformas', 'incoterm', 'TEXT'],
  ['proformas', 'way_of_shipment', "TEXT DEFAULT 'By Sea'"],
  ['proformas', 'port_of_loading', 'TEXT'],
  ['proformas', 'port_of_discharge', 'TEXT'],
  ['proformas', 'supplier', 'TEXT'],
  // Payment terms + production/delivery day counts, entered on the Proforma
  // (before an Order necessarily exists) so they can be pulled straight into
  // the Order when it's generated, and used correctly on the Proforma PDF
  // instead of the previous hardcoded 28/33-day fallback.
  ['proformas', 'payment_terms', 'TEXT'],
  ['proformas', 'production_days', 'INTEGER'],
  ['proformas', 'delivery_days', 'INTEGER'],
  // Proformas can now be created directly (not only generated from a
  // Quotation), so they need their own items snapshot — same JSON-blob
  // pattern as quotations.items. When generated from a Quotation the items
  // are copied in at creation time; from then on they're independently
  // editable, same as Order items already are.
  ['proformas', 'items', 'TEXT'],
  // Mirrors proformas.delivery_days on the Order, so Commercial Invoice PDFs
  // (which read from the Order, not the Proforma) also get a real value
  // instead of the hardcoded fallback.
  ['orders', 'delivery_days', 'INTEGER'],
  // How much of `amount` has actually been paid so far — only meaningful
  // when status is "Partial". Without this, marking a record "Partial" had
  // no way to move any of it from Pending into Paid on the Cash Flow summary
  // cards, since the totals only ever looked at the full row amount.
  ['financial_suppliers', 'paid_amount', 'REAL DEFAULT 0'],
  ['financial_clients', 'paid_amount', 'REAL DEFAULT 0'],
  // Rolled goods (Textile/DTF Film) — needed to compute an actual rolled
  // volume (cylinder: π × (diameter/2)² × length) for the Packing List's CBM,
  // instead of just splitting each container's flat capacity proportionally
  // by gross weight share, which doesn't reflect how differently two rolls
  // of the same weight but different diameters actually stack in a container.
  ['products', 'roll_diameter', 'REAL'],
  ['products', 'roll_diameter_unit', "TEXT DEFAULT 'cm'"],
  // Date cargo is actually loaded onto the container/vessel — distinct from
  // `date` (the packing list's own issue date) and from the Order's
  // shipment_date (when it departs), needed by the Shipment report.
  ['packing_lists', 'loading_date', 'TEXT'],
  // Audit trail: name of whoever last created/edited each record, now that
  // logins are per-person instead of one shared password. Stored as plain
  // text (the user's display name at the time of the edit) rather than a
  // foreign key, so it keeps reading correctly even if that person's
  // account is later renamed or removed.
  ['quotations', 'updated_by', 'TEXT'],
  ['proformas', 'updated_by', 'TEXT'],
  ['orders', 'updated_by', 'TEXT'],
  ['commercial_invoices', 'updated_by', 'TEXT'],
  ['supplier_contracts', 'updated_by', 'TEXT'],
  ['inspections', 'updated_by', 'TEXT'],
  ['financial_suppliers', 'updated_by', 'TEXT'],
  ['financial_clients', 'updated_by', 'TEXT'],
  ['samples', 'updated_by', 'TEXT'],
  ['packing_lists', 'updated_by', 'TEXT'],
  ['products', 'updated_by', 'TEXT'],
  ['clients', 'updated_by', 'TEXT'],
  ['suppliers', 'updated_by', 'TEXT'],
];

for (const [table, column, definition] of migrations) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) {
      console.error(`Migration failed for ${table}.${column}:`, err.message);
    }
  }
}

// Creates the initial 9 logins from backend/seedUsers.js the first time
// this runs against an empty `users` table (i.e. right after this deploy
// goes live) — a no-op on every boot after that. See that file to fill in
// the actual names before deploying.
require('./seedUsers').seedInitialUsersIfEmpty(db);

module.exports = db;
