const { pool } = require('../config/db');
const { allowedCategories, isAdmin } = require('../config/permissions');

const FIELDS = [
  'name', 'reference', 'category',
  'carton_count', 'items_per_carton', 'stock_out', 'quantity_sold', 'losses',
  'unit_price', 'carton_price', 'revenue', 'margin', 'tva_rate',
];

const NUMERIC_FIELDS = new Set([
  'carton_count', 'items_per_carton', 'stock_out', 'quantity_sold', 'losses',
  'unit_price', 'carton_price', 'revenue', 'margin', 'tva_rate',
]);

function fieldValue(data, f) {
  const v = data[f];
  if (v !== undefined && v !== null) return v;
  return NUMERIC_FIELDS.has(f) ? 0 : null;
}

// Format aligné avec Product.fromMap (lib/models/product.dart)
function toJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    reference: row.reference,
    category: row.category,
    carton_count: row.carton_count,
    items_per_carton: row.items_per_carton,
    stock_out: row.stock_out,
    quantity_sold: row.quantity_sold,
    losses: row.losses,
    unit_price: row.unit_price,
    carton_price: row.carton_price,
    revenue: row.revenue,
    margin: row.margin,
    tva_rate: row.tva_rate,
  };
}

const Product = {
  async findAll() {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY LOWER(name) ASC');
    return rows;
  },

  async findVisibleToRole(role) {
    if (isAdmin(role)) return Product.findAll();

    const cats = allowedCategories(role);
    if (cats.length === 0) return [];

    const placeholders = cats.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT * FROM products WHERE category IN (${placeholders}) ORDER BY LOWER(name) ASC`,
      cats
    );
    return rows;
  },

  async findRecent(limit = 5) {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id DESC LIMIT $1', [limit]);
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByReference(reference) {
    const { rows } = await pool.query('SELECT * FROM products WHERE reference = $1 LIMIT 1', [reference]);
    return rows[0] || null;
  },

  async create(data) {
    const values = FIELDS.map((f) => fieldValue(data, f));
    const placeholders = FIELDS.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO products (${FIELDS.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    return Product.findById(rows[0].id);
  },

  async update(id, data) {
    const current = await Product.findById(id);
    const values = FIELDS.map((f) => {
      const v = data[f];
      return v !== undefined && v !== null ? v : current[f];
    });
    const setClause = FIELDS.map((f, i) => `${f} = $${i + 1}`).join(', ');
    values.push(id);
    await pool.query(`UPDATE products SET ${setClause} WHERE id = $${values.length}`, values);
    return Product.findById(id);
  },

  async remove(id) {
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  toJson,
};

module.exports = Product;
