// i18n.js — Système multilingue HADAR (fix clientWidth + i18n)
window.HADAR_I18N = {
  fr: {
    predictivePlatform: "PREDICTIVE INTELLIGENCE PLATFORM",
    analysePrevisionPerformance: "ANALYSE • PRÉVISION • PERFORMANCE"
  },
  en: {
    predictivePlatform: "PREDICTIVE INTELLIGENCE PLATFORM",
    analysePrevisionPerformance: "ANALYSIS • FORECAST • PERFORMANCE"
  },
  es: {
    predictivePlatform: "PLATAFORMA DE INTELIGENCIA PREDICTIVA",
    analysePrevisionPerformance: "ANÁLISIS • PREVISIÓN • RENDIMIENTO"
  },
  pt: {
    predictivePlatform: "PLATAFORMA DE INTELIGÊNCIA PREDITIVA",
    analysePrevisionPerformance: "ANÁLISE • PREVISÃO • DESEMPENHO"
  },
  ar: {
    predictivePlatform: "منصة الذكاء التنبؤي",
    analysePrevisionPerformance: "تحليل • توقع • أداء"
  }
};

window.setLanguage = window.setLanguage || function(lang) {
  try { localStorage.setItem('hadar_lang', lang || 'fr'); } catch (_) {}
  const dict = window.HADAR_I18N[lang] || window.HADAR_I18N.fr;
  document.documentElement.lang = lang || 'fr';
  // Applique les traductions aux éléments data-i18n (sans planter si absent)
  try {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && dict[key]) el.textContent = dict[key];
    });
  } catch (_) {}
  // Direction pour l'arabe
  try { document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr'; } catch (_) {}
};

window.t = window.t || function(key) {
  try {
    const lang = (function(){ try{return localStorage.getItem('hadar_lang')||'fr'}catch(_){return 'fr'} })();
    const dict = window.HADAR_I18N[lang] || window.HADAR_I18N.fr;
    return (dict && dict[key]) ? dict[key] : key;
  } catch (_) { return key; }
};

// Auto-init au chargement
try {
  const saved = (function(){ try{return localStorage.getItem('hadar_lang')}catch(_){return null} })();
  if (saved) window.setLanguage(saved);
} catch (_) {}
