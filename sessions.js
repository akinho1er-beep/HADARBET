// ============================================================
// sessions.js — Sessions persistées sur disque
//
// Auparavant les sessions vivaient dans une Map en mémoire : le moindre
// redémarrage (ou déploiement Railway) déconnectait TOUS les membres.
// Elles sont désormais écrites dans data/sessions.json.
//
// Écriture différée (debounce 1 s) pour ne pas toucher le disque à
// chaque requête, et sauvegarde garantie à l'arrêt du processus.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'sessions.json');
const TTL = parseInt(process.env.SESSION_TTL_MS || String(12 * 3600 * 1000), 10); // 12 h

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, {username:string, role:string, expiresAt:number}>} */
let sessions = new Map();
let dirty = false;
let timer = null;

// ── Chargement au démarrage ─────────────────────────────────
(function charger() {
  try {
    if (!fs.existsSync(FILE)) return;
    const brut = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const now = Date.now();
    let expirees = 0;
    for (const [token, s] of Object.entries(brut)) {
      if (s && s.expiresAt > now) sessions.set(token, s);
      else expirees++;
    }
    if (sessions.size || expirees) {
      console.log(`[sessions] ${sessions.size} session(s) restaurée(s)` +
                  (expirees ? `, ${expirees} expirée(s) ignorée(s)` : ''));
    }
  } catch (e) {
    console.warn('[sessions] Fichier illisible, on repart à zéro :', e.message);
  }
})();

// ── Écriture différée ───────────────────────────────────────
function planifierEcriture() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; ecrireMaintenant(); }, 1000);
  timer.unref?.();
}

function ecrireMaintenant() {
  if (!dirty) return;
  dirty = false;
  try {
    const obj = {};
    for (const [t, s] of sessions) obj[t] = s;
    // Écriture atomique : fichier temporaire puis renommage, afin qu'une
    // coupure ne laisse jamais un JSON tronqué.
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.warn('[sessions] Échec de sauvegarde :', e.message);
  }
}

// ── API ─────────────────────────────────────────────────────
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + TTL
  });
  planifierEcriture();
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    planifierEcriture();
    return null;
  }
  return s;
}

function destroySession(token) {
  if (token && sessions.delete(token)) planifierEcriture();
}

/** Révoque toutes les sessions d'un compte (désactivation, suppression…). */
function destroyUserSessions(username) {
  let n = 0;
  for (const [t, s] of sessions) {
    if (s.username === username) { sessions.delete(t); n++; }
  }
  if (n) planifierEcriture();
  return n;
}

function count() { return sessions.size; }

// ── Nettoyage périodique ────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [t, s] of sessions) if (now > s.expiresAt) { sessions.delete(t); n++; }
  if (n) planifierEcriture();
}, 3600 * 1000).unref?.();

// ── Sauvegarde à l'arrêt ────────────────────────────────────
['SIGINT', 'SIGTERM', 'beforeExit'].forEach(sig => {
  process.on(sig, () => {
    ecrireMaintenant();
    if (sig !== 'beforeExit') process.exit(0);
  });
});

module.exports = {
  createSession, getSession, destroySession, destroyUserSessions,
  count, flush: ecrireMaintenant, TTL
};
