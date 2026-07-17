// Miroir server-side de lib/models/user_role.dart (RoleConfig)
const ALLOWED_CATEGORIES = {
  Admin: ['Boulangerie', 'Pâtisserie', 'Viennoiserie', 'Boucherie', 'Charcuterie', 'Épicerie', 'Boissons', 'Alcool'],
  'Point chaud': ['Boulangerie', 'Pâtisserie', 'Viennoiserie'],
  Boucherie: ['Boucherie', 'Charcuterie'],
  Épicerie: ['Épicerie', 'Boissons', 'Alcool'],
};

const ALLOWED_TVA_RATES = {
  Admin: [0.0, 2.1, 5.5, 10.0, 20.0],
  'Point chaud': [5.5, 10.0, 20.0],
  Boucherie: [5.5, 10.0, 20.0],
  Épicerie: [0.0, 5.5, 10.0, 20.0],
};

function isAdmin(role) {
  return role === 'Admin';
}

function allowedCategories(role) {
  return ALLOWED_CATEGORIES[role] || [];
}

function allowedTvaRates(role) {
  return ALLOWED_TVA_RATES[role] || [];
}

module.exports = { isAdmin, allowedCategories, allowedTvaRates };
