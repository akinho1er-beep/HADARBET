// ============================================================
// test-groq.js — Vérifie que la clé Groq du .env fonctionne
//
// N'affiche JAMAIS la clé en entier : seulement un aperçu masqué.
//
// Usage :  node tools/test-groq.js
// ============================================================
'use strict';
const path = require('path');
const https = require('https');

require(path.join(__dirname, '..', 'env-loader')).loadEnv();

const key = (process.env.GROQ_API_KEY || '').trim();

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   TEST DE LA CLÉ GROQ                                    ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

if (!key) {
  console.log('  ❌ Aucune GROQ_API_KEY trouvée dans .env');
  console.log('     Crée-en une (gratuit) : https://console.groq.com/keys\n');
  process.exit(1);
}

// Aperçu masqué : on ne montre que le début et la fin.
const masque = key.length > 12
  ? `${key.slice(0, 7)}…${key.slice(-4)}  (${key.length} caractères)`
  : `${key.slice(0, 3)}…  (${key.length} caractères)`;
console.log(`  Clé détectée : ${masque}`);

// Contrôles de forme avant tout appel réseau
if (!key.startsWith('gsk_')) {
  console.log('  ⚠️  Une clé Groq commence normalement par « gsk_ ».');
  console.log('     Si elle commence par « sk-ant- », c\'est une clé Anthropic :');
  console.log('     elle n\'est plus utilisée par l\'application.');
}
if (/^(gsk_)?(ta_cle|votre_cle|xxx|test|change)/i.test(key)) {
  console.log('  ⚠️  Cette valeur ressemble à un texte d\'exemple, pas à une vraie clé.');
}

console.log('  Appel de l\'API Groq en cours…\n');

const body = JSON.stringify({
  model: 'llama-3.3-70b-versatile',
  max_tokens: 20,
  messages: [{ role: 'user', content: 'Réponds exactement : OK' }]
});

const req = https.request({
  hostname: 'api.groq.com',
  path: '/openai/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${key}`
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let json = {};
    try { json = JSON.parse(data); } catch (_) {}

    if (res.statusCode === 200) {
      const rep = (json.choices?.[0]?.message?.content || '').trim();
      console.log('  ✅ CLÉ VALIDE — l\'analyse IA enrichie fonctionnera.');
      console.log(`     Réponse du modèle : « ${rep} »`);
      console.log(`     Modèle : ${json.model || 'llama-3.3-70b-versatile'}`);
      console.log('\n     → Rien à faire, garde cette clé.\n');
      process.exit(0);
    }

    const msg = json.error?.message || `HTTP ${res.statusCode}`;
    console.log(`  ❌ CLÉ REFUSÉE — ${msg}\n`);

    if (res.statusCode === 401) {
      console.log('     Cause probable : clé invalide, révoquée, ou mal copiée');
      console.log('     (espace en trop, guillemets, copie incomplète).');
      console.log('     → Génère une nouvelle clé : https://console.groq.com/keys');
    } else if (res.statusCode === 429) {
      console.log('     Quota atteint. La clé est valide mais temporairement limitée.');
      console.log('     → Réessaie dans quelques minutes. Inutile d\'en créer une autre.');
    } else if (res.statusCode === 404) {
      console.log('     Modèle indisponible sur ce compte.');
      console.log('     → Vérifie les modèles proposés sur console.groq.com.');
    }
    console.log('');
    process.exit(1);
  });
});

req.on('error', e => {
  console.log(`  ⚠️  Impossible de joindre l'API : ${e.message}`);
  console.log('     Problème réseau, pare-feu ou proxy. La clé n\'est pas en cause.\n');
  process.exit(1);
});
req.setTimeout(15000, () => {
  req.destroy();
  console.log('  ⚠️  Délai dépassé (15 s). Vérifie ta connexion.\n');
  process.exit(1);
});
req.write(body);
req.end();
