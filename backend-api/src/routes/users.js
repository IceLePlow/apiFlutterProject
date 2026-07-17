const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { ROLES } = require('../config/db');

const router = express.Router();
const SALT_ROUNDS = 10;

router.use(auth, adminOnly);

router.get('/', (req, res, next) => {
  try {
    res.json(User.findAll().map(User.toJson));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, role, isTempPassword } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username et password sont requis' });
    }
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: `role doit être l'un de : ${ROLES.join(', ')}` });
    }
    if (User.findByUsername(username.trim())) {
      return res.status(400).json({ error: 'Ce username est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = User.create({
      username: username.trim(),
      passwordHash: hash,
      role,
      isTempPassword: isTempPassword ?? false,
    });

    res.status(201).json(User.toJson(user));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/role', (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: `role doit être l'un de : ${ROLES.join(', ')}` });
    }
    if (!User.findById(req.params.id)) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json(User.toJson(User.updateRole(req.params.id, role)));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    if (!User.findById(req.params.id)) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    User.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
