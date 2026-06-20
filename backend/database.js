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
    value REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    production_lead_time INTEGER,
    shipment_date TEXT,
    arrival_date TEXT,
    status TEXT DEFAULT 'Pending',
    incoterm TEXT,
    payment_terms TEXT,
    port_of_loading TEXT,
    port_of_discharge TEXT,
    supplier TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT DEFAULT 'unit',
    unit_cost REAL DEFAULT 0,
    cost_currency TEXT DEFAULT 'USD',
    margin REAL DEFAULT 0,
    sale_price REAL DEFAULT 0,
    sale_currency TEXT DEFAULT 'USD',
    width TEXT,
    height TEXT,
    thickness TEXT,
    weight TEXT,
    category TEXT,
    supplier TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'unit',
    unit_price REAL NOT NULL,
    total REAL GENERATED ALWAYS AS (quantity * unit_price) STORED
  );

  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    client TEXT NOT NULL,
    requested_date TEXT NOT NULL,
    sent_date TEXT,
    feedback_date TEXT,
    status TEXT DEFAULT 'Requested',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS proformas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    number TEXT UNIQUE NOT NULL,
    issue_date TEXT NOT NULL,
    validity TEXT,
    client TEXT NOT NULL,
    total REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'Draft',
    notes TEXT,
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
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;
