const { db } = require('../config/db');
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
  findAll() {
    return db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE ASC').all();
  },

  findVisibleToRole(role) {
    if (isAdmin(role)) return Product.findAll();

    const cats = allowedCategories(role);
    if (cats.length === 0) return [];

    const placeholders = cats.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM products WHERE category IN (${placeholders}) ORDER BY name COLLATE NOCASE ASC`)
      .all(...cats);
  },

  findRecent(limit = 5) {
    return db.prepare('SELECT * FROM products ORDER BY id DESC LIMIT ?').all(limit);
  },

  findById(id) {
    return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  },

  findByReference(reference) {
    return db.prepare('SELECT * FROM products WHERE reference = ? LIMIT 1').get(reference);
  },

  create(data) {
    const values = FIELDS.map((f) => fieldValue(data, f));
    const stmt = db.prepare(
      `INSERT INTO products (${FIELDS.join(', ')}) VALUES (${FIELDS.map(() => '?').join(', ')})`
    );
    const info = stmt.run(...values);
    return Product.findById(info.lastInsertRowid);
  },

  update(id, data) {
    const current = Product.findById(id);
    const values = FIELDS.map((f) => {
      const v = data[f];
      return v !== undefined && v !== null ? v : current[f];
    });
    const setClause = FIELDS.map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`).run(...values, id);
    return Product.findById(id);
  },

  remove(id) {
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return info.changes > 0;
  },

  toJson,
};

module.exports = Product;
