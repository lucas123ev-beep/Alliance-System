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
    cost_per_meter REAL
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
  ['samples', 'code', "TEXT DEFAULT ''"],
  ['samples', 'product_id', 'INTEGER'],
  ['samples', 'feedback_date', 'TEXT'],
  ['samples', 'media', 'TEXT'],
  ['proformas', 'quotation_id', 'INTEGER'],
  ['supplier_contracts', 'items_json', 'TEXT'],
  ['financial_suppliers', 'contract_id', 'INTEGER'],
  ['financial_suppliers', 'items_json', 'TEXT'],
  ['suppliers', 'beneficiary_name', 'TEXT'],
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

module.exports = db;
