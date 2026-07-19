const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { ROLES } = require('../config/db');

const router = express.Router();
const SALT_ROUNDS = 10;

router.use(auth, adminOnly);

router.get('/', async (req, res, next) => {
  try {
    res.json((await User.findAll()).map(User.toJson));
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
    if (await User.findByUsername(username.trim())) {
      return res.status(400).json({ error: 'Ce username est déjà utilisé' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
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

router.patch('/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: `role doit être l'un de : ${ROLES.join(', ')}` });
    }
    if (!(await User.findById(req.params.id))) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json(User.toJson(await User.updateRole(req.params.id, role)));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!(await User.findById(req.params.id))) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    await User.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
