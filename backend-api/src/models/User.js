const { db } = require('../config/db');

// Format aligné avec AppUser.fromMap (lib/models/user.dart) : passwordHash toujours
// vide (le hash n'est jamais renvoyé au client), isTempPassword en 0/1.
function toJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: '',
    role: row.role,
    isTempPassword: row.is_temp_password,
  };
}

const User = {
  create({ username, passwordHash, role, isTempPassword = false }) {
    const stmt = db.prepare(
      'INSERT INTO users (username, password_hash, role, is_temp_password) VALUES (?, ?, ?, ?)'
    );
    const info = stmt.run(username, passwordHash, role, isTempPassword ? 1 : 0);
    return User.findById(info.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  findAll() {
    return db.prepare('SELECT * FROM users ORDER BY username ASC').all();
  },

  count() {
    const r = db.prepare('SELECT COUNT(*) AS c FROM users').get();
    return r.c;
  },

  updateRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return User.findById(id);
  },

  updatePassword(id, passwordHash, { clearTempFlag = true } = {}) {
    if (clearTempFlag) {
      db.prepare('UPDATE users SET password_hash = ?, is_temp_password = 0 WHERE id = ?').run(passwordHash, id);
    } else {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
    }
    return User.findById(id);
  },

  remove(id) {
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return info.changes > 0;
  },

  toJson,
};

module.exports = User;
