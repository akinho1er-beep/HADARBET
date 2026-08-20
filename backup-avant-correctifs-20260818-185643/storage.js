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

// Assure que le dossier data/ existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Cache en mémoire pour éviter les lectures disque à chaque requête
const cache = {};

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
    if (!cache[game]) {
      cache[game] = readGame(game);
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
    // Conserver maximum 500 événements (triés par n décroissant)
    const limited = (data || []).slice(0, 500);
    cache[game] = limited;
    writeGame(game, limited);
    console.log(`[storage] ${game} → ${limited.length} résultats sauvegardés`);
  },

  /**
   * Ajoute un seul résultat à un jeu (sans réécrire tout le fichier)
   * @param {string} game
   * @param {Object} result
   */
  addResult(game, result) {
    const existing = this.getResults(game);
    // Éviter les doublons par numéro (n)
    if (existing.some(r => r.n === result.n)) {
      console.log(`[storage] Doublon détecté #N${result.n} pour ${game} — ignoré`);
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