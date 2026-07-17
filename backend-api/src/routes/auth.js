const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { ROLES } = require('../config/db');

const router = express.Router();
const SALT_ROUNDS = 10;

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

function genTempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#%?';
  const all = letters + digits + symbols;

  const pick = (s) => s[crypto.randomInt(s.length)];
  let out = pick(letters) + pick(digits) + pick(symbols);
  while (out.length < 12) out += pick(all);
  return out;
}

// Crée le compte admin par défaut s'il n'existe aucun utilisateur (équivalent
// de AuthService.ensureBootstrapAdmin, appelé au démarrage de l'app).
router.post('/bootstrap', async (req, res, next) => {
  try {
    if (User.count() > 0) {
      return res.json({ created: false });
    }

    const tempPassword = genTempPassword();
    const hash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    User.create({ username: 'admin', passwordHash: hash, role: 'Admin', isTempPassword: true });

    return res.json({ created: true, tempPassword });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username et password sont requis' });
    }

    const user = User.findByUsername(username.trim());
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    return res.json({ token: sign(user), user: User.toJson(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', auth, (req, res, next) => {
  try {
    const user = User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(User.toJson(user));
  } catch (err) {
    next(err);
  }
});

// Vérifie l'ancien mot de passe côté serveur puis met à jour (équivalent de
// AuthService.changePassword, mais sans exposer le hash au client).
router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword et newPassword sont requis' });
    }

    const user = User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    User.updatePassword(user.id, hash, { clearTempFlag: true });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Définit un nouveau mot de passe sans vérifier l'ancien (flow "mot de passe
// temporaire" juste après le login, équivalent de ForcePasswordChangeView).
router.post('/set-password', auth, async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'newPassword est requis' });
    }

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    User.updatePassword(req.user.id, hash, { clearTempFlag: true });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/roles', (req, res) => {
  res.json(ROLES);
});

module.exports = router;
