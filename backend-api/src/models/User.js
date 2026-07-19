const { pool } = require('../config/db');

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
  async create({ username, passwordHash, role, isTempPassword = false }) {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, role, is_temp_password) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, passwordHash, role, isTempPassword ? 1 : 0]
    );
    return User.findById(rows[0].id);
  },

  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
  },

  async findAll() {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY username ASC');
    return rows;
  },

  async count() {
    const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
    return parseInt(rows[0].c, 10);
  },

  async updateRole(id, role) {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    return User.findById(id);
  },

  async updatePassword(id, passwordHash, { clearTempFlag = true } = {}) {
    if (clearTempFlag) {
      await pool.query('UPDATE users SET password_hash = $1, is_temp_password = 0 WHERE id = $2', [passwordHash, id]);
    } else {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    }
    return User.findById(id);
  },

  async remove(id) {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  toJson,
};

module.exports = User;
