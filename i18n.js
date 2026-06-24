// i18n.js — Système multilingue HADAR (fallback minimal)
window.HADAR_I18N = { fr: {}, en: {}, es: {}, pt: {}, ar: {} };
window.setLanguage = window.setLanguage || function(lang) {
  try { localStorage.setItem('hadar_lang', lang || 'fr'); } catch (_) {}
};
window.t = window.t || function(key) { return key; };