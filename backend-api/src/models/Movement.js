const { pool } = require('../config/db');

// Format aligné avec ProductMovement.fromMap (lib/models/product_movement.dart)
function toJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    product_id: row.product_id,
    ts: Number(row.ts),
    type: row.type,
    quantity: row.quantity,
    unit_price: row.unit_price,
    note: row.note,
  };
}

const Movement = {
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM movements WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByProductId(productId, limit = 1000) {
    const { rows } = await pool.query(
      'SELECT * FROM movements WHERE product_id = $1 ORDER BY ts DESC LIMIT $2',
      [productId, limit]
    );
    return rows;
  },

  async findRecentWithProduct(types, limit = 5) {
    const placeholders = types.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
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
       LIMIT $${types.length + 1}`,
      [...types, limit]
    );
    return rows;
  },

  /// Ajout de mouvement avec les mêmes règles métier que
  /// MovementService.addMovementValidated (lib/services/movement_service.dart) :
  /// - stockOut <= totalQuantity
  /// - ventes + pertes <= stockOut
  /// - revenue += qty * unitPrice (vente)
  /// - margin = revenue - (cartonCount * cartonPrice)
  /// FOR UPDATE verrouille la ligne produit le temps de la transaction : necessaire
  /// maintenant que plusieurs clusters (K3s + AKS) peuvent ecrire concurremment
  /// sur la meme base partagee.
  async createValidated({ product_id, ts, type, quantity, unit_price, note }) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const err = new Error('Quantité invalide');
      err.status = 400;
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: productRows } = await client.query(
        'SELECT * FROM products WHERE id = $1 FOR UPDATE',
        [product_id]
      );
      const product = productRows[0];
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

      const { rows: moveRows } = await client.query(
        'INSERT INTO movements (product_id, ts, type, quantity, unit_price, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [product_id, ts, type, quantity, unit_price ?? 0, note ?? null]
      );

      const cartonsCost = product.carton_count * product.carton_price;
      const margin = newRevenue - cartonsCost;

      await client.query(
        'UPDATE products SET stock_out = $1, quantity_sold = $2, losses = $3, revenue = $4, margin = $5 WHERE id = $6',
        [newStockOut, newSold, newLosses, newRevenue, margin, product_id]
      );

      await client.query('COMMIT');

      const { rows } = await pool.query('SELECT * FROM movements WHERE id = $1', [moveRows[0].id]);
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async remove(id) {
    const result = await pool.query('DELETE FROM movements WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  async salesByMonth(startMs, endMs) {
    const { rows } = await pool.query(
      `SELECT
         to_char(to_timestamp(ts / 1000), 'YYYY-MM') AS ym,
         SUM(quantity) AS qty,
         SUM(quantity * unit_price) AS revenue
       FROM movements
       WHERE type = 'sale' AND ts >= $1 AND ts <= $2
       GROUP BY ym
       ORDER BY ym ASC`,
      [startMs, endMs]
    );
    return rows.map((r) => ({ ym: r.ym, qty: Number(r.qty) || 0, revenue: Number(r.revenue) || 0.0 }));
  },

  async kpisForRange(startMs, endMs) {
    const { rows } = await pool.query(
      `SELECT
         SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END) AS sales_qty,
         SUM(CASE WHEN type = 'loss' THEN quantity ELSE 0 END) AS loss_qty,
         SUM(CASE WHEN type = 'stock_out' THEN quantity ELSE 0 END) AS out_qty,
         SUM(CASE WHEN type = 'sale' THEN (quantity * unit_price) ELSE 0 END) AS revenue
       FROM movements
       WHERE ts >= $1 AND ts <= $2`,
      [startMs, endMs]
    );
    const r = rows[0];
    return {
      sales_qty: Number(r.sales_qty) || 0,
      loss_qty: Number(r.loss_qty) || 0,
      out_qty: Number(r.out_qty) || 0,
      revenue: Number(r.revenue) || 0.0,
    };
  },

  toJson,
};

module.exports = Movement;
