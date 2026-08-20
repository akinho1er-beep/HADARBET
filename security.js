// ============================================================
// security.js — Durcissement HTTP (zéro dépendance externe)
//
//  1. Rate-limit anti-force brute sur la connexion
//  2. CORS restrictif piloté par ALLOWED_ORIGINS
//  3. En-têtes de sécurité usuels
//
// Aucun paquet npm requis : tout repose sur Node et Express.
// ============================================================
'use strict';

// ════════════════════════════════════════════════════════════
//  1. RATE-LIMIT
// ════════════════════════════════════════════════════════════
// Fenêtre glissante en mémoire, par couple IP + identifiant.
// Verrouillage progressif : plus il y a d'échecs, plus l'attente est longue.
// Les tentatives RÉUSSIES remettent le compteur à zéro.

const buckets = new Map(); // clé -> { hits: number[], lockedUntil: number }

const RL = {
  windowMs:   parseInt(process.env.RATE_WINDOW_MS   || String(15 * 60 * 1000), 10), // 15 min
  maxAttempts: parseInt(process.env.RATE_MAX_ATTEMPTS || '8', 10),
  // Paliers de blocage appliqués au-delà du seuil (en minutes)
  lockSteps:  [1, 5, 15, 60],
};

function clientIp(req) {
  // Railway / proxies placent l'IP réelle dans X-Forwarded-For.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'inconnu';
}

function bucketKey(req) {
  const ip = clientIp(req);
  const user = String(req.body?.username || '').trim().toLowerCase();
  return `${ip}|${user}`;
}

function humanDelay(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} seconde${s > 1 ? 's' : ''}`;
  const m = Math.ceil(s / 60);
  return `${m} minute${m > 1 ? 's' : ''}`;
}

/**
 * Middleware à placer AVANT le handler de connexion.
 * Refuse la requête (429) si trop de tentatives ont échoué.
 */
function loginRateLimit(req, res, next) {
  const key = bucketKey(req);
  const now = Date.now();
  const b = buckets.get(key) || { hits: [], lockedUntil: 0 };

  if (b.lockedUntil > now) {
    const reste = b.lockedUntil - now;
    res.set('Retry-After', String(Math.ceil(reste / 1000)));
    return res.status(429).json({
      error: `🔒 Trop de tentatives de connexion. Réessaie dans ${humanDelay(reste)}.`
    });
  }

  // On purge les tentatives sorties de la fenêtre glissante
  b.hits = b.hits.filter(t => now - t < RL.windowMs);
  buckets.set(key, b);

  // Exposé au handler pour signaler l'issue de la tentative
  req.rateLimit = {
    /** Échec : on incrémente et on verrouille si le seuil est franchi. */
    fail() {
      b.hits.push(Date.now());
      if (b.hits.length >= RL.maxAttempts) {
        const palier = Math.min(
          Math.floor(b.hits.length / RL.maxAttempts) - 1,
          RL.lockSteps.length - 1
        );
        b.lockedUntil = Date.now() + RL.lockSteps[palier] * 60 * 1000;
        console.warn(`[sécurité] Verrouillage ${RL.lockSteps[palier]} min — ${key} (${b.hits.length} échecs)`);
      }
      buckets.set(key, b);
    },
    /** Succès : on efface l'historique. */
    reset() { buckets.delete(key); },
    /** Nombre d'essais restants avant blocage. */
    remaining() { return Math.max(0, RL.maxAttempts - b.hits.length); }
  };

  next();
}

// Purge périodique pour éviter toute croissance mémoire non bornée
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    const actif = b.lockedUntil > now || b.hits.some(t => now - t < RL.windowMs);
    if (!actif) buckets.delete(k);
  }
}, 10 * 60 * 1000).unref?.();

// ════════════════════════════════════════════════════════════
//  2. CORS RESTRICTIF
// ════════════════════════════════════════════════════════════
// Par défaut, l'API n'est appelée que par la page qu'elle sert elle-même
// (même origine) : aucune autorisation croisée n'est nécessaire.
// Pour autoriser un front hébergé ailleurs :
//   ALLOWED_ORIGINS=https://mon-app.fr,https://autre.com
//   ALLOWED_ORIGINS=*        (tout autoriser — déconseillé)

function buildCors() {
  const brut = (process.env.ALLOWED_ORIGINS || '').trim();
  const toutAutoriser = brut === '*';
  const liste = brut && !toutAutoriser
    ? brut.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)
    : [];

  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    // Pas d'en-tête Origin = appel serveur, curl, ou navigation simple.
    if (!origin) return next();

    const propre = origin.replace(/\/$/, '');

    // ✅ CORRECTIF CRITIQUE : les navigateurs envoient AUSSI un en-tête Origin
    // pour les requêtes de MÊME origine (tout POST/PUT/DELETE, y compris le
    // formulaire de connexion). Sans cette comparaison avec l'hôte de la
    // requête, l'application se bloquait elle-même : « Origine non autorisée »
    // dès la connexion. On considère donc comme légitime toute origine dont
    // l'hôte correspond à celui servant la requête (peu importe le protocole,
    // http en local vs https derrière le proxy Railway).
    let memeOrigine = false;
    try {
      const hoteRequete = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      if (hoteRequete) {
        const hoteOrigine = new URL(propre).host;
        memeOrigine = hoteOrigine === hoteRequete;
      }
    } catch (_) { /* Origin malformé : traité comme externe */ }

    if (memeOrigine) return next();

    const autorise = toutAutoriser || liste.includes(propre);

    if (autorise) {
      res.set('Access-Control-Allow-Origin', toutAutoriser ? '*' : propre);
      if (!toutAutoriser) res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') return res.sendStatus(autorise ? 204 : 403);

    // Origine inconnue : on bloque les appels sensibles, on tolère la lecture.
    if (!autorise && (req.method !== 'GET' || req.path.startsWith('/api/'))) {
      return res.status(403).json({ error: 'Origine non autorisée.' });
    }
    next();
  };
}

function corsSummary() {
  const brut = (process.env.ALLOWED_ORIGINS || '').trim();
  if (brut === '*') return '⚠️  CORS ouvert à toutes les origines (ALLOWED_ORIGINS=*)';
  if (brut)         return `✅ CORS restreint à : ${brut}`;
  return '✅ CORS : même origine uniquement (défaut sécurisé)';
}

// ════════════════════════════════════════════════════════════
//  3. EN-TÊTES DE SÉCURITÉ
// ════════════════════════════════════════════════════════════
function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-XSS-Protection', '0'); // obsolète et nuisible : désactivation explicite
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

module.exports = { loginRateLimit, buildCors, corsSummary, securityHeaders, clientIp, RL };
