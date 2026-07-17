const express = require('express');
const Movement = require('../models/Movement');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

const router = express.Router();
const VALID_TYPES = ['sale', 'loss', 'stock_in', 'stock_out'];

router.use(auth);

function mapWithProduct(row) {
  return {
    movement: {
      id: row.id,
      product_id: row.product_id,
      ts: row.ts,
      type: row.type,
      quantity: row.quantity,
      unit_price: row.unit_price,
      note: row.note,
    },
    product: {
      id: row.p_id,
      name: row.name,
      reference: row.reference,
      category: row.category,
      carton_count: row.carton_count,
      items_per_carton: row.items_per_carton,
      stock_out: row.stock_out,
      quantity_sold: row.quantity_sold,
      losses: row.losses,
      unit_price: row.p_unit_price,
      carton_price: row.carton_price,
      revenue: row.revenue,
      margin: row.margin,
      tva_rate: row.tva_rate,
    },
  };
}

router.get('/product/:product_id', (req, res, next) => {
  try {
    const product = Product.findById(req.params.product_id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    const limit = parseInt(req.query.limit, 10) || 1000;
    res.json(Movement.findByProductId(req.params.product_id, limit).map(Movement.toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/recent', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const types = (req.query.types ? String(req.query.types).split(',') : ['sale']).filter((t) =>
      VALID_TYPES.includes(t)
    );
    if (types.length === 0) return res.json([]);

    res.json(Movement.findRecentWithProduct(types, limit).map(mapWithProduct));
  } catch (err) {
    next(err);
  }
});

router.get('/sales-by-month', (req, res, next) => {
  try {
    const start = parseInt(req.query.start, 10);
    const end = parseInt(req.query.end, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return res.status(400).json({ error: 'start et end (timestamps ms) sont requis' });
    }
    res.json(Movement.salesByMonth(start, end));
  } catch (err) {
    next(err);
  }
});

router.get('/kpis', (req, res, next) => {
  try {
    const start = parseInt(req.query.start, 10);
    const end = parseInt(req.query.end, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return res.status(400).json({ error: 'start et end (timestamps ms) sont requis' });
    }
    res.json(Movement.kpisForRange(start, end));
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { product_id, ts, type, quantity, unit_price, note } = req.body;

    if (!product_id || !type || quantity === undefined) {
      return res.status(400).json({ error: 'product_id, type et quantity sont requis' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type doit être l'un de : ${VALID_TYPES.join(', ')}` });
    }

    const movement = Movement.createValidated({
      product_id,
      ts: ts ?? Date.now(),
      type,
      quantity,
      unit_price: unit_price ?? 0,
      note: note ?? null,
    });

    res.status(201).json(Movement.toJson(movement));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const existing = Movement.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Mouvement introuvable' });

    Movement.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
