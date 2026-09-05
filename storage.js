// ============================================================
// storage.js — Persistance JSON pour BetAnalytics Pro v3
// Gère la lecture/écriture des résultats de chaque jeu
// dans des fichiers JSON séparés (persistants entre les redémarrages)
// + Gestion SÉCURISÉE des comptes (mots de passe hachés via scrypt)
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const REPO_DATA_DIR = path.join(__dirname, 'data');

// Assure que le dossier data/ existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Auto-amorçage du volume Railway ───────────────────────────
// Si DATA_DIR pointe vers un volume (ex: /data) vide OU partiellement rempli
// (ex: 38 entrées après un redeploy sans historique), on restaure l'historique
// commité dans le dépôt (REPO_DATA_DIR) qui contient 3000-4000 entrées.
// Sans cela, /data vide → compteurs retombent à ~20-50 après chaque redeploy.
(function amorcerVolumeSiVide() {
  try {
    if (DATA_DIR === REPO_DATA_DIR) return; // pas de volume, rien à faire
    const jeux = ['baccara','penalty18','penalty22','jeu21','fifa4x4','fifa3x3'];
    // On considère le volume comme à restaurer si AU MOINS un jeu est vide
    // ou très incomplet (< 500) alors que le dépôt a un historique complet (> 1000)
    let besoinRestauration = false;
    for (const j of jeux) {
      const dst = path.join(DATA_DIR, `${j}.json`);
      const src = path.join(REPO_DATA_DIR, `${j}.json`);
      if (!fs.existsSync(src)) continue;
      let srcLen = 0, dstLen = 0;
      try { srcLen = JSON.parse(fs.readFileSync(src,'utf8')).length; } catch(_) {}
      try { dstLen = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst,'utf8')).length : 0; } catch(_) {}
      if (srcLen > 1000 && dstLen < 500) { besoinRestauration = true; break; }
      if (!fs.existsSync(dst) && srcLen > 0) { besoinRestauration = true; break; }
    }
    if (!besoinRestauration) return;
    const volumeVide = !jeux.some(j => fs.existsSync(path.join(DATA_DIR, `${j}.json`)));
    console.log(`[storage] Volume ${DATA_DIR} ${volumeVide ? 'vide' : 'incomplet (38-110 entrées)'} → restauration depuis ${REPO_DATA_DIR}`);
    let copies = 0;
    for (const j of jeux) {
      const src = path.join(REPO_DATA_DIR, `${j}.json`);
      const dst = path.join(DATA_DIR, `${j}.json`);
      if (!fs.existsSync(src)) continue;
      let srcLen = 0, dstLen = 0;
      try { srcLen = JSON.parse(fs.readFileSync(src,'utf8')).length; } catch(_) {}
      try { dstLen = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst,'utf8')).length : 0; } catch(_) {}
      // Copie si destination vide OU beaucoup plus petite que la source
      if (!fs.existsSync(dst) || (srcLen > 1000 && dstLen < 500)) {
        fs.copyFileSync(src, dst);
        console.log(`[storage] ↳ ${j}.json : ${dstLen} → ${srcLen} entrées`);
        copies++;
      }
    }
    for (const f of ['backtest.json','significance.json']) {
      const src = path.join(REPO_DATA_DIR, f);
      const dst = path.join(DATA_DIR, f);
      if (fs.existsSync(src) && (!fs.existsSync(dst) || fs.statSync(dst).size < fs.statSync(src).size)) {
        fs.copyFileSync(src, dst); copies++;
      }
    }
    if (copies) console.log(`[storage] ✅ ${copies} fichier(s) restauré(s) vers ${DATA_DIR}`);
  } catch (e) {
    console.warn('[storage] Amorçage volume échoué:', e.message);
  }
})();

// Cache en mémoire pour éviter les lectures disque à chaque requête
const cache = {};
// Date de modification du fichier au moment de la mise en cache, pour détecter
// qu'un outil externe (tools/harvest.js) a enrichi les données entre-temps.
const cacheMtime = {};

// ============================================================
//  COMPTES UTILISATEURS (authentification sécurisée)
//  - Stockés dans data/accounts.json
//  - Les mots de passe sont hachés avec scrypt (Node built-in, 0 dépendance)
//  - Le format stocké est "saltHex:hashHex" (jamais de mot de passe en clair)
// ============================================================

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
let accountsCache = null;

function readAccountsRaw() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[storage] Erreur lecture accounts:', e.message);
  }
  return {};
}

function writeAccountsRaw(acc) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(acc, null, 2), 'utf8');
  } catch (e) {
    console.error('[storage] Erreur écriture accounts:', e.message);
  }
}

// Hachage scrypt d'un mot de passe (renvoie "saltHex:hashHex")
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

// Vérifie un mot de passe clair contre une empreinte stockée "saltHex:hashHex"
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const sep = stored.indexOf(':');
  if (sep < 0) return false;
  try {
    const salt = Buffer.from(stored.slice(0, sep), 'hex');
    const hash = Buffer.from(stored.slice(sep + 1), 'hex');
    if (salt.length === 0 || hash.length === 0) return false;
    const computed = crypto.scryptSync(String(password), salt, hash.length);
    if (computed.length !== hash.length) return false;
    return crypto.timingSafeEqual(computed, hash);
  } catch (_) {
    return false;
  }
}

function gameFile(game) {
  return path.join(DATA_DIR, `${game}.json`);
}

function readGame(game) {
  try {
    const f = gameFile(game);
    if (fs.existsSync(f)) {
      const raw = fs.readFileSync(f, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`[storage] Erreur lecture ${game}: ${e.message}`);
  }
  return [];
}

function writeGame(game, data) {
  try {
    const f = gameFile(game);
    fs.writeFileSync(f, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[storage] Erreur écriture ${game}: ${e.message}`);
  }
}

const storage = {
  /**
   * Récupère tous les résultats d'un jeu
   * @param {string} game - 'baccara' | 'penalty18' | 'penalty22' | 'jeu21' | 'fifa4x4'
   * @returns {Array} Liste des résultats (ou [] si vide/erreur)
   */
  getResults(game) {
    // ✅ CORRECTIF : le cache mémoire ne doit jamais masquer une modification
    // externe du fichier. Auparavant, si `tools/harvest.js` enrichissait
    // data/<jeu>.json pendant que le serveur tournait, celui-ci gardait son
    // ancienne copie en mémoire et l'ÉCRASAIT au cycle de polling suivant
    // (1789 résultats collectés → 295 réécrits). On compare donc la date de
    // modification du fichier et on recharge s'il a changé.
    let mtime = 0;
    try {
      const f = gameFile(game);
      if (fs.existsSync(f)) mtime = fs.statSync(f).mtimeMs;
    } catch (_) {}

    if (!cache[game] || cacheMtime[game] !== mtime) {
      cache[game] = readGame(game);
      cacheMtime[game] = mtime;
    }
    return cache[game] || [];
  },

  /**
   * Sauvegarde les résultats d'un jeu
   * Limité à 500 événements maximum pour éviter une croissance infinie
   * @param {string} game - Nom du jeu
   * @param {Array} data - Tableau de résultats à sauvegarder
   */
  setResults(game, data) {
    // ✅ Plafond porté à 5000 (configurable via MAX_RESULTS).
    // À 500, le serveur TRONQUAIT l'historique collecté par harvest.js
    // (1790 résultats → 500) dès son premier cycle de polling, ce qui
    // ramenait le backtest à un échantillon trop petit pour conclure.
    const MAX = parseInt(process.env.MAX_RESULTS || '5000', 10);
    const limited = (data || []).slice(0, MAX);
    cache[game] = limited;
    writeGame(game, limited);
    try { cacheMtime[game] = fs.statSync(gameFile(game)).mtimeMs; } catch (_) {}
    console.log(`[storage] ${game} → ${limited.length} résultats sauvegardés`);
  },

  /**
   * Ajoute un seul résultat à un jeu (sans réécrire tout le fichier)
   * @param {string} game
   * @param {Object} result
   */
  addResult(game, result) {
    const existing = this.getResults(game);
    // ✅ CORRECTIF 288/1440 : ne JAMAIS dédupliquer par #N (r.n) car il se réinitialise
    // Penalty 288→1, Baccara 1440→1 : le #N=1 du lendemain était considéré comme doublon du #N=1 de la veille et ignoré.
    // On déduplique par msgId (unique et croissant) comme dans mergeResults et harvest.js
    const key = result.msgId != null ? `m:${result.msgId}` : (result.n != null ? `n:${result.n}` : null);
    const isDuplicate = key != null && existing.some(r => {
      const k = r.msgId != null ? `m:${r.msgId}` : (r.n != null ? `n:${r.n}` : null);
      return k === key;
    });
    if (isDuplicate) {
      console.log(`[storage] Doublon détecté ${key} pour ${game} — ignoré`);
      return;
    }
    existing.unshift(result); // le plus récent en premier
    this.setResults(game, existing);
  },

  /**
   * Retourne le nombre de résultats sauvegardés pour un jeu
   */
  count(game) {
    return this.getResults(game).length;
  },

  /**
   * Purge tous les fichiers de données (utile pour les tests)
   */
  clearAll() {
    const games = ['baccara', 'penalty18', 'penalty22', 'jeu21', 'fifa4x4'];
    games.forEach(g => {
      delete cache[g];
      const f = gameFile(g);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    console.log('[storage] Tous les fichiers de données purgeés.');
  },

  // ════════════════════════════════════════════════════════════
  //  COMPTES (authentification)
  // ════════════════════════════════════════════════════════════

  /** Retourne la map des comptes { username: account } (cache en mémoire) */
  getAccounts() {
    if (accountsCache === null) accountsCache = readAccountsRaw();
    return accountsCache;
  },

  /** Retourne un compte par son identifiant (ou null) */
  getAccount(username) {
    return this.getAccounts()[username] || null;
  },

  /** Sauvegarde la map complète des comptes (mise à jour du cache + disque) */
  saveAccounts(acc) {
    accountsCache = acc || accountsCache;
    writeAccountsRaw(accountsCache);
  },

  /** Crée ou met à jour un compte (par son champ username) */
  upsertAccount(account) {
    const acc = this.getAccounts();
    acc[account.username] = account;
    this.saveAccounts(acc);
  },

  /** Supprime un compte */
  deleteAccount(username) {
    const acc = this.getAccounts();
    delete acc[username];
    this.saveAccounts(acc);
  },

  hashPassword,
  verifyPassword,

  /**
   * Amorce le compte admin au premier démarrage s'il n'existe pas.
   * Identifiant/mot de passe fournis via ADMIN_USER / ADMIN_PASS (variables d'env),
   * valeurs par défaut uniquement si non définies (À CHANGER EN PRODUCTION).
   * Retourne l'objet admin créé (ou existant).
   */
  seedAdmin() {
    const acc = this.getAccounts();
    const adminUser = process.env.ADMIN_USER || 'HADAR_ADMIN';
    // ✅ SÉCURITÉ : plus de mot de passe en clair dans le code source.
    // Si ADMIN_PASS n'est pas défini, on génère un mot de passe aléatoire
    // affiché UNE SEULE FOIS au démarrage, au lieu d'un secret publié sur Git.
    let envPass = process.env.ADMIN_PASS || '';
    let generated = false;
    if (!envPass) {
      envPass = crypto.randomBytes(12).toString('base64url');
      generated = true;
    }

    // Création ou resynchronisation : ADMIN_PASS est TOUJOURS la source de vérité.
    // À chaque démarrage, le mot de passe admin = ADMIN_PASS.
    const existing = acc[adminUser];
    const needCreate = !existing;
    // ✅ On ne resynchronise QUE si ADMIN_PASS est explicitement fourni.
    // Auparavant le mot de passe était réécrit à chaque démarrage, ce qui
    // annulait silencieusement tout changement fait depuis l'interface.
    const needUpdate = existing && process.env.ADMIN_PASS && !verifyPassword(envPass, existing.pass);

    if (needCreate || needUpdate) {
      acc[adminUser] = {
        username: adminUser,
        pass: hashPassword(envPass),
        role: 'admin',
        active: true,
        created: existing?.created || new Date().toLocaleDateString('fr-FR'),
        lastLogin: existing?.lastLogin || null
      };
      this.saveAccounts(acc);
      if (needCreate) {
        console.log(`[storage] ✅ Compte admin créé : ${adminUser}`);
        if (generated) {
          console.log('[storage] ⚠️  ADMIN_PASS non défini — mot de passe généré :');
          console.log(`[storage]     ${envPass}`);
          console.log('[storage]     Note-le maintenant : il ne sera plus affiché.');
        }
      } else {
        console.log(`[storage] 🔑 Mot de passe admin synchronisé depuis ADMIN_PASS.`);
      }
    }
    return acc[adminUser];
  }
};

module.exports = storage;