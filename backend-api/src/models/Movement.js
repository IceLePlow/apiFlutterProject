const { db } = require('../config/db');
const Product = require('./Product');

// Format aligné avec ProductMovement.fromMap (lib/models/product_movement.dart)
function toJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    product_id: row.product_id,
    ts: row.ts,
    type: row.type,
    quantity: row.quantity,
    unit_price: row.unit_price,
    note: row.note,
  };
}

const Movement = {
  findById(id) {
    return db.prepare('SELECT * FROM movements WHERE id = ?').get(id);
  },

  findByProductId(productId, limit = 1000) {
    return db
      .prepare('SELECT * FROM movements WHERE product_id = ? ORDER BY ts DESC LIMIT ?')
      .all(productId, limit);
  },

  findRecentWithProduct(types, limit = 5) {
    const placeholders = types.map(() => '?').join(',');
    return db
      .prepare(
        `SELECT
           m.id, m.product_id, m.ts, m.type, m.quantity, m.unit_price, m.note,
           p.id AS p_id, p.name, p.reference, p.category,
           p.carton_count, p.items_per_carton, p.stock_out,
           p.quantity_sold, p.losses,
           p.unit_price AS p_unit_price,
           p.carton_price, p.revenue, p.margin, p.tva_rate
         FROM movements m
         JOIN products p ON p.id = m.product_id
         WHERE m.type IN (${placeholders})
         ORDER BY m.ts DESC
         LIMIT ?`
      )
      .all(...types, limit);
  },

  /// Ajout de mouvement avec les mêmes règles métier que
  /// MovementService.addMovementValidated (lib/services/movement_service.dart) :
  /// - stockOut <= totalQuantity
  /// - ventes + pertes <= stockOut
  /// - revenue += qty * unitPrice (vente)
  /// - margin = revenue - (cartonCount * cartonPrice)
  createValidated({ product_id, ts, type, quantity, unit_price, note }) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error('Quantité invalide');
      err.status = 400;
      throw err;
    }

    const tx = db.transaction(() => {
      const product = Product.findById(product_id);
      if (!product) {
        const err = new Error(`Produit introuvable (id=${product_id})`);
        err.status = 404;
        throw err;
      }

      const totalQuantity = product.carton_count * product.items_per_carton;

      let newStockOut = product.stock_out;
      let newSold = product.quantity_sold;
      let newLosses = product.losses;
      let newRevenue = product.revenue;

      if (type === 'stock_out') {
        newStockOut = product.stock_out + quantity;
        if (newStockOut > totalQuantity) {
          const err = new Error(
            `Sortie impossible : ${newStockOut}/${totalQuantity} (dépasse le stock total).`
          );
          err.status = 400;
          throw err;
        }
      }

      if (type === 'sale') {
        const futureSold = product.quantity_sold + quantity;
        if (futureSold + product.losses > product.stock_out) {
          const err = new Error(`Vente impossible : ventes + pertes > stock sorti (${product.stock_out}).`);
          err.status = 400;
          throw err;
        }
        newSold = futureSold;
        newRevenue = product.revenue + quantity * unit_price;
      }

      if (type === 'loss') {
        const futureLoss = product.losses + quantity;
        if (product.quantity_sold + futureLoss > product.stock_out) {
          const err = new Error(`Perte impossible : ventes + pertes > stock sorti (${product.stock_out}).`);
          err.status = 400;
          throw err;
        }
        newLosses = futureLoss;
      }

      const stmt = db.prepare(
        'INSERT INTO movements (product_id, ts, type, quantity, unit_price, note) VALUES (?, ?, ?, ?, ?, ?)'
      );
      const info = stmt.run(product_id, ts, type, quantity, unit_price ?? 0, note ?? null);

      const cartonsCost = product.carton_count * product.carton_price;
      const margin = newRevenue - cartonsCost;

      db.prepare(
        'UPDATE products SET stock_out = ?, quantity_sold = ?, losses = ?, revenue = ?, margin = ? WHERE id = ?'
      ).run(newStockOut, newSold, newLosses, newRevenue, margin, product_id);

      return Movement.findById(info.lastInsertRowid);
    });

    return tx();
  },

  remove(id) {
    const info = db.prepare('DELETE FROM movements WHERE id = ?').run(id);
    return info.changes > 0;
  },

  salesByMonth(startMs, endMs) {
    return db
      .prepare(
        `SELECT
           strftime('%Y-%m', datetime(ts / 1000, 'unixepoch')) AS ym,
           SUM(quantity) AS qty,
           SUM(quantity * unit_price) AS revenue
         FROM movements
         WHERE type = 'sale' AND ts >= ? AND ts <= ?
         GROUP BY ym
         ORDER BY ym ASC`
      )
      .all(startMs, endMs)
      .map((r) => ({ ym: r.ym, qty: r.qty || 0, revenue: r.revenue || 0.0 }));
  },

  kpisForRange(startMs, endMs) {
    const r = db
      .prepare(
        `SELECT
           SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END) AS sales_qty,
           SUM(CASE WHEN type = 'loss' THEN quantity ELSE 0 END) AS loss_qty,
           SUM(CASE WHEN type = 'stock_out' THEN quantity ELSE 0 END) AS out_qty,
           SUM(CASE WHEN type = 'sale' THEN (quantity * unit_price) ELSE 0 END) AS revenue
         FROM movements
         WHERE ts >= ? AND ts <= ?`
      )
      .get(startMs, endMs);

    return {
      sales_qty: r.sales_qty || 0,
      loss_qty: r.loss_qty || 0,
      out_qty: r.out_qty || 0,
      revenue: r.revenue || 0.0,
    };
  },

  toJson,
};

module.exports = Movement;
