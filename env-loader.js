// ============================================================
// env-loader.js — Charge le fichier .env sans aucune dépendance
//
// Évite d'avoir à retaper les variables à chaque lancement :
//   $env:ADMIN_PASS="..."; $env:TELEGRAM_BOT_TOKEN="..."; node server.js
//
// Les variables déjà définies dans l'environnement système gardent la
// priorité — le .env ne les écrase jamais (utile sur Railway, où les
// variables sont fournies par la plateforme).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const f = file || path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return { loaded: false, count: 0 };

  let count = 0;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;          // commentaire ou ligne vide

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();

    // Retire les guillemets englobants éventuels
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    // L'environnement système est prioritaire (Railway, Docker, CI…)
    if (process.env[key] === undefined && key) {
      process.env[key] = val;
      count++;
    }
  }
  return { loaded: true, count };
}

module.exports = { loadEnv };
