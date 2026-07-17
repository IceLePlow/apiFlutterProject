const express = require('express');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

function validateBody(body, { partial = false } = {}) {
  const errors = [];
  const req = (key, label) => {
    if (!partial && (body[key] === undefined || body[key] === null || body[key] === '')) {
      errors.push(`${label} est requis`);
    }
  };

  req('name', 'name');
  req('reference', 'reference');

  return errors;
}

// Équivalent de ProductService.getAllProducts (aucun filtrage par rôle).
router.get('/', (req, res, next) => {
  try {
    res.json(Product.findAll().map(Product.toJson));
  } catch (err) {
    next(err);
  }
});

// Équivalent de ProductService.getProductsVisibleToUser (filtré par catégories du rôle).
router.get('/visible-to-me', (req, res, next) => {
  try {
    res.json(Product.findVisibleToRole(req.user.role).map(Product.toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/recent', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    res.json(Product.findRecent(limit).map(Product.toJson));
  } catch (err) {
    next(err);
  }
});

router.get('/reference/:reference', (req, res, next) => {
  try {
    const product = Product.findByReference(req.params.reference);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(Product.toJson(product));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const product = Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(Product.toJson(product));
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const errors = validateBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    if (Product.findByReference(req.body.reference)) {
      return res.status(400).json({ error: 'Cette référence est déjà utilisée' });
    }

    const product = Product.create(req.body);
    res.status(201).json(Product.toJson(product));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    const errors = validateBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const product = Product.update(req.params.id, req.body);
    res.json(Product.toJson(product));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const existing = Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    Product.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
