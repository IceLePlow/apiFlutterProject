const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/stock.db';

// S'assure que le dossier contenant le fichier SQLite existe (utile en conteneur/volume K8s)
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== '.' && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Rôles alignés avec lib/models/user_role.dart (RoleConfig.label)
const ROLES = ['Admin', 'Point chaud', 'Boucherie', 'Épicerie'];

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Admin', 'Point chaud', 'Boucherie', 'Épicerie')),
      is_temp_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      reference TEXT NOT NULL,
      category TEXT,
      carton_count INTEGER NOT NULL DEFAULT 0,
      items_per_carton INTEGER NOT NULL DEFAULT 0,
      stock_out INTEGER NOT NULL DEFAULT 0,
      quantity_sold INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      carton_price REAL NOT NULL DEFAULT 0,
      revenue REAL NOT NULL DEFAULT 0,
      margin REAL NOT NULL DEFAULT 0,
      tva_rate REAL NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_products_reference ON products(reference);

    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sale', 'loss', 'stock_in', 'stock_out')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL DEFAULT 0,
      note TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_movements_product_ts ON movements(product_id, ts DESC);
  `);
}

function resetAll() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM movements').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM users').run();
  });
  tx();
}

module.exports = { db, init, resetAll, ROLES };
