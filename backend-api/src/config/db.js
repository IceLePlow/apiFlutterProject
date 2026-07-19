const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

// Rôles alignés avec lib/models/user_role.dart (RoleConfig.label)
const ROLES = ['Admin', 'Point chaud', 'Boucherie', 'Épicerie'];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Admin', 'Point chaud', 'Boucherie', 'Épicerie')),
      is_temp_password INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      reference TEXT NOT NULL,
      category TEXT,
      carton_count INTEGER NOT NULL DEFAULT 0,
      items_per_carton INTEGER NOT NULL DEFAULT 0,
      stock_out INTEGER NOT NULL DEFAULT 0,
      quantity_sold INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      carton_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
      margin DOUBLE PRECISION NOT NULL DEFAULT 0,
      tva_rate DOUBLE PRECISION NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_products_reference ON products(reference);

    CREATE TABLE IF NOT EXISTS movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ts BIGINT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('sale', 'loss', 'stock_in', 'stock_out')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_movements_product_ts ON movements(product_id, ts DESC);
  `);
}

async function resetAll() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM movements');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM users');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, init, resetAll, ROLES };
