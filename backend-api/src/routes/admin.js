const express = require('express');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { resetAll } = require('../config/db');

const router = express.Router();

// Équivalent de DBService.deleteDatabaseFile() : vide entièrement la base
// (produits, mouvements, utilisateurs). Réservé à l'administrateur.
router.delete('/reset-all', auth, adminOnly, (req, res, next) => {
  try {
    resetAll();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
