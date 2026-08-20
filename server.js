// ============================================================
// BetAnalytics Pro — Serveur Backend v3
// Lit les canaux Telegram via Bot API (plus fiable que scraping)
// Jeux : Baccara, Penalty 18, Penalty 22, Jeu 21, FIFA 4×4
// ============================================================

// Charge le fichier .env AVANT tout le reste, pour que les variables
// (ADMIN_PASS, TELEGRAM_BOT_TOKEN, GROQ_API_KEY…) soient disponibles
// dès l'initialisation de storage.js. Aucune dépendance externe requise.
const { loadEnv } = require('./env-loader');
const _env = loadEnv();
if (_env.loaded) console.log(`[env] ${_env.count} variable(s) chargée(s) depuis .env`);

const express = require('express');
const cors    = require('cors');
const https   = require('https');
const crypto  = require('crypto');
const path    = require('path');
const storage = require('./storage'); // Persistance JSON + comptes (mots de passe hachés)
const scraper = require('./onexbet_scraper'); // Scraper bookmaker (ex fastpari_scraper)
// node-cron est optionnel : s'il n'est pas installé, on retombe sur setInterval.
let cron = null;
try { cron = require('node-cron'); } catch (_) { cron = null; }

const app = express();
// ✅ CORS restrictif (piloté par ALLOWED_ORIGINS) au lieu de cors() grand ouvert.
//    Par défaut : même origine uniquement — le front étant servi par ce serveur.
const security = require('./security');
app.set('trust proxy', 1); // Railway/proxy : X-Forwarded-For fiable pour le rate-limit
app.use(security.securityHeaders);
app.use(security.buildCors());
app.use(express.json({ limit: '1mb' }));

// ── Servir les fichiers statiques (HTML, JS, icônes, etc.) ───
app.use(express.static(path.join(__dirname)));

// Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'betting-analyzer.html'));
});


// ── Configuration Telegram (via variable d'environnement) ────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// TELEGRAM_BOT_TOKEN est FACULTATIF : la collecte passe par les pages
// publiques t.me/s/, qui ne demandent aucune authentification. Un simple
// message d'information, et non un avertissement anxiogène.
// (À noter : l'ancien fallback getUpdates ne peut de toute façon PAS lire
//  l'historique d'un canal public — le token n'apporterait rien ici.)
if (!BOT_TOKEN) {
  console.log('ℹ️  Collecte Telegram via les pages publiques t.me/s/ (aucun token requis).');
}

const CHANNELS = {
  baccara:   'statistika_baccara',
  penalty18: 'statistika_fifa_penalty_fast',
  penalty22: 'statistika_fifa_penalty_fast2022',
  jeu21:     'statistika_21f',
  fifa4x4:   'statistika_fifa_4x4',
  // ⚠️ Aviator : aucune source publique d'historique de multiplicateurs n'existe.
  // Le jeu (Spribe) génère ses multiplicateurs en temps réel via WebSocket, non archivés.
  // On ne déclare donc PAS de canal Telegram ici : le frontend utilise les données
  // démo réalistes. Pour brancher de vraies données, publier les multiplicateurs dans
  // un canal Telegram et l'ajouter ici (ex: aviator: 'mon_canal_aviator').
};

// ── Configuration historique ─────────────────────────────────
// Le frontend demande maintenant /results/:game?limit=500.
// On conserve donc jusqu'à 500 événements par jeu côté serveur.
const VALID_GAMES = [...Object.keys(CHANNELS), 'aviator'];
const UPCOMING_GAMES = ['fifa4x4', 'penalty18', 'penalty22'];
const BOOKMAKER_SOURCES = ['1xbet']; // seul scraper disponible (onexbet_scraper)
// ✅ Aligné sur storage.js : à 500, l'historique collecté était tronqué.
const MAX_RESULTS_PER_GAME = parseInt(process.env.MAX_RESULTS || '5000', 10);
const DEFAULT_RESULTS_LIMIT = 500; // limite par défaut d'une requête API
const MAX_UPCOMING_FUTURE = 3;

// ── Durées d'abonnement (référence serveur pour la création/édition de comptes) ──
const ACCESS_DURATIONS = [
  { key: '5min',  label: '5 minutes',  ms: 5  * 60 * 1000 },
  { key: '15min', label: '15 minutes', ms: 15 * 60 * 1000 },
  { key: '30min', label: '30 minutes', ms: 30 * 60 * 1000 },
  { key: '1h',    label: '1 heure',    ms: 1  * 3600 * 1000 },
  { key: '6h',    label: '6 heures',   ms: 6  * 3600 * 1000 },
  { key: '12h',   label: '12 heures',  ms: 12 * 3600 * 1000 },
  { key: '24h',   label: '24 heures',  ms: 24 * 3600 * 1000 },
  { key: '3d',    label: '3 jours',    ms: 3  * 86400 * 1000 },
  { key: '7d',    label: '7 jours',    ms: 7  * 86400 * 1000 },
  { key: '15d',   label: '15 jours',   ms: 15 * 86400 * 1000 },
  { key: '30d',   label: '30 jours',   ms: 30 * 86400 * 1000 },
  { key: '60d',   label: '60 jours',   ms: 60 * 86400 * 1000 },
  { key: '90d',   label: '90 jours',   ms: 90 * 86400 * 1000 }
];
const DEFAULT_DURATION_KEY = '30d';
function getDurationByKey(key) {
  return ACCESS_DURATIONS.find(d => d.key === key) || null;
}

// Helpers de formatage partagés (durées + dates) côté serveur
function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '—';
  if (ms <= 0) return 'Expiré';
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 1) return `${day}j ${hr % 24}h`;
  if (hr >= 1)  return `${hr}h ${min % 60}min`;
  if (min >= 1) return `${min}min ${sec % 60}s`;
  return `${sec}s`;
}
function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} à ${timeStr}`;
}

// ── Sessions PERSISTÉES sur disque (data/sessions.json) ──
// Auparavant en mémoire : chaque redéploiement Railway déconnectait tout le monde.
const sessionStore = require('./sessions');
const SESSION_TTL = sessionStore.TTL;
const createSession    = (user)  => sessionStore.createSession(user);
const getSession       = (token) => sessionStore.getSession(token);
const destroySession   = (token) => sessionStore.destroySession(token);

// Renvoie un compte "public" (sans le hash du mot de passe)
function publicAccount(username, d) {
  if (!d) return null;
  const { pass, ...rest } = d;
  return { username: username || d.username, ...rest };
}

// Middlewares d'authentification
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Non authentifié ou session expirée.' });
  req.session = session;
  next();
}
function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
    next();
  });
}

// Rencontres à venir réellement récupérées chez les bookmakers.
// IMPORTANT : cet état ne doit jamais être alimenté depuis l'historique
// des résultats ni par une rotation simulée. Uniquement scraper.fetchUpcoming().
const upcomingFixtures = { fifa4x4: [], penalty18: [], penalty22: [] };
const upcomingUpdatedAt = { fifa4x4: null, penalty18: null, penalty22: null };
let upcomingPollInProgress = false;

function normalizeLimit(value, fallback = DEFAULT_RESULTS_LIMIT) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_RESULTS_PER_GAME);
}

function resultKey(game, item) {
  // ✅ CORRECTIF : déduplication par ID de message Telegram pour TOUS les jeux.
  //
  // Auparavant on dédupliquait par #N. Deux problèmes :
  //  1. Le compteur #N des canaux se RÉINITIALISE (observé : #N288 → #N1),
  //     donc deux matchs distincts peuvent porter le même #N.
  //  2. tools/harvest.js renumérote `n` de 1..N pour rétablir un ordre
  //     chronologique continu. Le serveur, lui, lit le #N brut du canal.
  //     Un match scrapé avec #N115 entrait alors en collision avec
  //     l'enregistrement renuméroté n=115 et était rejeté comme doublon —
  //     l'historique restait figé (compteurs immobiles dans les logs).
  //
  // Le msgId est unique, strictement croissant et jamais réutilisé.
  if (item && Number.isFinite(Number(item.msgId))) return `m:${item.msgId}`;
  // Aviator : pas de message Telegram (données générées) → multiplicateur + ts.
  if (game === 'aviator') return `av:${item?.multiplier ?? ''}:${item?.ts ?? ''}`;
  // Repli pour les enregistrements anciens dépourvus de msgId.
  if (item && item.n !== undefined && item.n !== null && game !== 'fifa4x4') {
    return `n:${item.n}`;
  }
  return `${item?.home ?? ''}|${item?.away ?? ''}|${item?.score ?? ''}`;
}

function mergeResults(game, incoming, existing = []) {
  const map = new Map();
  [...incoming, ...existing].forEach(item => {
    if (!item) return;
    const key = resultKey(game, item);
    if (!map.has(key)) map.set(key, item);
  });
  // ✅ Tri par timestamp d'abord (fiable sur tous les jeux), n en départage.
  return [...map.values()]
    .sort((a, b) => ((Number(b.ts) || 0) - (Number(a.ts) || 0))
                 || ((Number(b.n) || 0) - (Number(a.n) || 0)))
    .slice(0, MAX_RESULTS_PER_GAME);
}

function cleanFixtureTeam(name) {
  return translateTeam(String(name || '').replace(/[\u00A0\u202F\u2009]/g, ' ').replace(/\s+/g, ' ').trim());
}

function normalizeUpcomingFixture(game, item, source) {
  if (!UPCOMING_GAMES.includes(game) || !item) return null;
  const home = cleanFixtureTeam(item.home || item.team1);
  const away = cleanFixtureTeam(item.away || item.team2);
  if (!home || !away || home === '—' || away === '—' || home === away) return null;
  const rawStatus = String(item.status || '').toLowerCase();
  const status = /live|en direct|inplay|in-play|1st|2nd|mi-temps|half|cours/.test(rawStatus) ? 'live' : 'scheduled';
  const startTime = item.startTime || item.time || item.kickoff || null;
  return {
    officialId: item.officialId || item.id || `${source}:${game}:${home}:${away}:${startTime || ''}`,
    home,
    away,
    game,
    bookmaker: item.bookmaker || source,
    status,
    startTime,
    marketUrl: item.marketUrl || item.url || null,
    detectedAt: Date.now()
  };
}

function sortUpcomingFixtures(list) {
  const live = list.filter(f => f.status === 'live');
  const scheduled = list.filter(f => f.status !== 'live');
  const byTime = (a, b) => {
    const ta = Date.parse(a.startTime || '') || Number.MAX_SAFE_INTEGER;
    const tb = Date.parse(b.startTime || '') || Number.MAX_SAFE_INTEGER;
    return ta - tb || String(a.home).localeCompare(String(b.home), 'fr');
  };
  return [...live.sort(byTime), ...scheduled.sort(byTime).slice(0, MAX_UPCOMING_FUTURE)];
}

function mergeUpcomingFixtures(game, rows) {
  const map = new Map();
  rows.forEach(row => {
    const f = normalizeUpcomingFixture(game, row, row?.bookmaker || 'bookmaker');
    if (!f) return;
    // Déduplication stricte par bookmaker/id, puis par confrontation + statut + horaire.
    const key = f.officialId && f.officialId !== 'N/A'
      ? `${f.bookmaker}:${f.officialId}`
      : `${f.bookmaker}:${f.home}||${f.away}||${f.status}||${f.startTime || ''}`;
    if (!map.has(key)) map.set(key, f);
  });
  return sortUpcomingFixtures([...map.values()]);
}

// ── État géré par storage.js (Persistance JSON) ─────────────────────
// Plus d'objet "results" en mémoire ici pour éviter la perte de données.

// ── Traductions équipes ──────────────────────────────────────
const TEAMS = {
  'Ливерпуль': 'Liverpool',               'Арсенал': 'Arsenal',
  'Бавария': 'Bayern',                    'Реал': 'Real Madrid',
  'Барселона': 'Barcelone',               'ПСЖ': 'PSG',
  'Ювентус': 'Juventus',                  'МанчестерСити': 'Man City',
  'Манчестер Сити': 'Man City',           'МанчестерЮнайтед': 'Man United',
  'Манчестер Юнайтед': 'Man United',      'Пьемонте Кальчо (Ювентус)': 'Piemonte Calcio (Juventus)',
  'ПьемонтеКальчо (Ювентус)': 'Piemonte Calcio (Juventus)',
  'Пьемонте Кальчо': 'Piemonte Calcio (Juventus)',
  'Пьемонте кальчо': 'Piemonte Calcio (Juventus)',
  'Челси': 'Chelsea',                     'Атлетико': 'Atlético',
  'Милан': 'AC Milan',                    'Интер': 'Inter',
  'Дортмунд': 'Dortmund',                 'Тоттенхэм': 'Tottenham',
  'Наполи': 'Naples',                     'Севилья': 'Séville',
  'Вильярреал': 'Villarreal',             'Бенфика': 'Benfica',
  'Порту': 'Porto',                       'Аякс': 'Ajax',
  'Лейпциг': 'Leipzig',                   'Лион': 'Lyon',
  'Марсель': 'Marseille',                 'Рома': 'Roma',
  'Лацио': 'Lazio',                       'Валенсия': 'Valencia',
  'Бетис': 'Betis',                       'Монако': 'Monaco',
  // FIFA 4×4 teams (Correction des noms cyrilliques → anglais)
  'БрайтонэндХавАльбион': 'Brighton',    'Вулверхэмптон': 'Wolves',
  'Брентфорд': 'Brentford',              'ШеффилдЮнайтед': 'Sheffield Utd',
  'КристалПэлэс': 'Crystal Palace',      'Бернли': 'Burnley',
  'Фулхэм': 'Fulham',                    'ЛутонТаун': 'Luton Town',
  'НьюкаслЮнайтед': 'Newcastle',         'АстонВилла': 'Aston Villa',
  'НоттингемФорест': 'Nottm Forest',     'ЭвертонФК': 'Everton',
  'ВестХэмЮнайтед': 'West Ham',          'БорнмутФК': 'Bournemouth',
  // Noms cyrilliques additionnels (formats variés)
  'Борнмут': 'Bournemouth',
  'БорнмутЮнайтед': 'Bournemouth',
  'Эвертон': 'Everton',
  'ЭвертонФК': 'Everton',
  'ТоттенхэмХотспур': 'Tottenham Hotspur',
  'Тоттенхэм': 'Tottenham Hotspur',
  'Тоттенхэм Хотспур': 'Tottenham Hotspur',
  'Шеффилд': 'Sheffield Utd',
  'ШеффилдЮнайтед': 'Sheffield Utd',
  'Ноттингем': 'Nottm Forest',
  'ВестХэм': 'West Ham',
  'ВестХэмЮнайтед': 'West Ham',
  'Ньюкасл': 'Newcastle',
  'НьюкаслЮнайтед': 'Newcastle',
};
function translateTeam(name) {
  const t = name ? name.trim() : name;
  return TEAMS[t] || t;
}

// ── Fetch via Bot API Telegram ───────────────────────────────
// Récupère les 100 derniers messages d'un canal public via forwardFromChat
// Méthode : on lit le channel via getUpdates n'est pas possible sur les canaux
// On utilise plutôt le scraping HTML de t.me/s/ + fallback bot API
function fetchChannelHTML(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 't.me',
      path: `/s/${username}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      // Suivre les redirects si besoin
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchChannelHTML(res.headers.location.replace('https://t.me/s/', '')).then(resolve).catch(reject);
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout HTML')); });
    req.end();
  });
}

// ── Fetch via Bot API (getHistory via forwardMessages) ───────
// Pour les canaux publics, on peut aussi utiliser l'API bot pour
// récupérer les messages avec copyMessage/forwardMessage
// MAIS la méthode la plus simple est getChatHistory via bot
function fetchViaBotAPI(username) {
  return new Promise((resolve, reject) => {
    // On utilise la méthode channel_history via getChatAdministrators
    // Puis getHistory sur le chat public
    const path = `/bot${BOT_TOKEN}/getUpdates?limit=100&allowed_updates=channel_post`;
    const options = {
      hostname: 'api.telegram.org',
      path,
      method: 'GET',
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout Bot API')); });
    req.end();
  });
}

// ── Extrait les textes des messages depuis HTML t.me/s ───────
// ✅ Variante enrichie : récupère aussi l'ID et la date de chaque message,
// nécessaires pour un ordre chronologique fiable (cf. correctif parseFifa4x4).
function extractMessagesRich(html) {
  const out = [];
  const blocks = String(html || '').split('<div class="tgme_widget_message ');
  for (const b of blocks.slice(1)) {
    const idM = b.match(/data-post="[^/]+\/(\d+)"/);
    if (!idM) continue;
    const txtM = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!txtM) continue;
    const dateM = b.match(/<time datetime="([^"]+)"/);
    const text = txtM[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .trim();
    if (text) out.push({ id: parseInt(idM[1], 10), text, ts: dateM ? Date.parse(dateM[1]) : Date.now() });
  }
  return out;
}

function extractMessages(html, game) {
  const messages = [];
  const regex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    let text = m[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .trim();

    if (!text) continue;

    // Canaux avec #N
    if (text.includes('#N')) { messages.push(text); continue; }

    // Aviator : messages contenant un multiplicateur "X.XXx"
    if (game === 'aviator') {
      if (/\d+(?:\.\d+)?\s*x/i.test(text)) { messages.push(text); continue; }
    }

    // FIFA 4×4 : capturer tous messages avec hashtag équipes ou score
    if (game === 'fifa4x4') {
      const hasTeam  = text.includes('_') && text.startsWith('#');
      const hasScore = text.match(/\d+:\d+/) && text.includes('#T');
      if (hasTeam || hasScore) { messages.push(text); continue; }
    }
  }
  return messages;
}

// ── Parsers ──────────────────────────────────────────────────

// Baccara : #N123 7(J,5) - 3(D,2) #T10 #R
function parseBaccara(text) {
  const match = text.match(/#N(\d+)[.\s]+(\d+)\([^)]*\)\s*[-–]\s*(\d+)\([^)]*\)(?:\s*#T(\d+))?(\s*#R)?/);
  if (!match) return null;
  const p = parseInt(match[2]), b = parseInt(match[3]);
  return {
    n: parseInt(match[1]),
    // ✅ CORRECTIF : le moteur d'analyse et les tests statistiques lisent
    // `player` / `banker`. Le serveur n'écrivait que `playerScore` /
    // `bankerScore`, donc toute main écrite par le serveur était relue comme
    // 0 contre 0, c'est-à-dire une ÉGALITÉ. Cela faisait exploser le taux de
    // « Tie » (33 % au lieu de ~9,5 %) et détruisait la qualité du backtest.
    // On écrit désormais les deux jeux de clés.
    player: p,
    banker: b,
    playerScore: p,
    bankerScore: b,
    playerCards: '',
    bankerCards: '',
    total: match[4] ? parseInt(match[4]) : p + b,
    natural: !!match[5],
    ts: Date.now()
  };
}

// Penalty / FIFA : #N123 Liverpool (3:1) Arsenal
function parsePenalty(text) {
  const match = text.match(/#N(\d+)\s+(.+?)\s+\((\d+):(\d+)\)\s+(.+)/);
  if (!match) return null;
  return {
    n: parseInt(match[1]),
    home:  translateTeam(match[2].trim()),
    away:  translateTeam(match[5].trim()),
    score: `${match[3]}:${match[4]}`,
    ts: Date.now()
  };
}

// Jeu 21 — Format: #N492. 20(9♣️A♣️) - 23(8♠️6♥️9♦️) #T43 [#O=#dealer21 #X=égalité]
function parseJeu21(text) {
  // On autorise un "[" optionnel avant le drapeau #O/#X : ... #T43 [#O=... #X=...]
  const match = text.match(/#N(\d+)[.\s]+(\d+)\([^)]*\)\s*[-–]\s*(\d+)\([^)]*\)(?:\s*#T(\d+))?(?:\s*\[?#[OX])?/);
  if (!match) return null;
  const n      = parseInt(match[1]);
  const player = parseInt(match[2]);
  const dealer = parseInt(match[3]);
  // Détection explicite du drapeau d'égalité #X (recherche indépendante de la position)
  const flagX  = /#X\b/.test(text);
  let result;
  if (flagX)            result = 'PUSH';   // égalité exacte signalée par #X
  else if (dealer > 21) result = 'WIN';    // dealer bust → joueur gagne
  else if (player > 21) result = 'LOSE';   // joueur bust → perd
  else if (player > dealer) result = 'WIN';
  else if (player < dealer) result = 'LOSE';
  else result = 'PUSH';
  return { n, player, dealer, result, ts: Date.now() };
}

// Aviator — jeu à crash : #N123 2.45x  (ou "Aviator 2.45x", "2.45x" seul)
function parseAviator(text) {
  // Cherche un multiplicateur au format X.XXx (ex: 2.45x, 1.01x, 12.5x, 100x)
  const multMatch = text.match(/(\d+(?:\.\d+)?)\s*x/i);
  if (!multMatch) return null;
  const multiplier = parseFloat(multMatch[1]);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100000) return null;
  // Numéro de manche #N optionnel, sinon on déduit
  const nMatch = text.match(/#N(\d+)/i);
  const n = nMatch ? parseInt(nMatch[1]) : 0;
  return { n, multiplier, ts: Date.now() };
}

// ── Générateur Aviator (fallback) ─────────────────────────────
// Aucune source publique d'historique de multiplicateurs n'existe pour Aviator
// (jeu Spribe temps réel). On génère donc des multiplicateurs réalistes pour que
// l'analyse IA et les graphiques aient du contenu.
// Distribution : ~50% < 2x, ~40% 2-10x, ~10% > 10x (loi exponentielle tronquée).
let aviatorCounter = 100;
const AVIATOR_FALLBACK = [];
function genAviatorMultiplier() {
  // Inverse CDF d'une exponentielle (moyenne ~2x), tronquée à 100x.
  const u = Math.random();
  const m = -Math.log(1 - u * (1 - Math.exp(-4))) / (1 / 2); // lambda=0.5
  const raw = 1 + m;
  return Math.min(raw, 100);
}
function refreshAviatorFallback() {
  // Ajoute une nouvelle manche, garde les 500 plus récentes.
  aviatorCounter++;
  AVIATOR_FALLBACK.unshift({
    n: aviatorCounter,
    multiplier: parseFloat(genAviatorMultiplier().toFixed(2)),
    ts: Date.now()
  });
  if (AVIATOR_FALLBACK.length > 500) AVIATOR_FALLBACK.length = 500;
}
// Amorce : génère un historique initial de 60 manches (du plus ancien au plus récent)
for (let i = 0; i < 60; i++) refreshAviatorFallback();
// Rafraîchit avec une nouvelle manche toutes les ~30 secondes ( rythme réaliste )
setInterval(refreshAviatorFallback, 30000);

// FIFA 4×4 — Format multi-ligne:
// #Team1_Team2 ⏰ 2-й тайм 5:57
// 6:7 (3:4 3:3 ) #T13

// FIFA 4×4 — format différent, pas de #N, équipes dans le hashtag
// Ex: #Челси_Вулверхэмптон ⏰ 2-й тайм 5:53
// 5:8 (2:4 3:4 ) #T13
// (l'ID de chaque entrée est calculé via 1000 + index — pas de compteur global)

function parseFifa4x4(text, index, msgId, msgTs) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let teamLine = '', scoreLine = '';
  for (const line of lines) {
    if (line.startsWith('#') && line.includes('_')) teamLine = line;
    if (line.match(/^\d+:\d+\s*\(/)) scoreLine = line;
  }

  // Si pas de scoreLine dans ce message, chercher X:Y #TX sans parenthèse
  if (!scoreLine) {
    for (const line of lines) {
      if (line.match(/\d+:\d+/) && line.includes('#T')) { scoreLine = line; break; }
    }
  }

  if (!scoreLine) return null;

  // Extraire score total
  const sm = scoreLine.match(/(\d+):(\d+)/);
  if (!sm) return null;

  const homeGoals = parseInt(sm[1]);
  const awayGoals = parseInt(sm[2]);
  const score = `${homeGoals}:${awayGoals}`;

  // Extraire équipes depuis le hashtag
  let home = '—', away = '—';
  if (teamLine) {
    // Nettoyer le hashtag : #Челси_Вулверхэмптон ⏰ 2-й тайм 5:53
    const cleaned = teamLine.replace(/^#/, '').split('⏰')[0].trim();
    const teamsRaw = cleaned.split('_');
    if (teamsRaw.length >= 2) {
      home = translateTeam(teamsRaw[0].trim());
      away = translateTeam(teamsRaw.slice(1).join(' ').trim());
    }
  }

  // ✅ CORRECTIF : le n était calculé depuis Date.now(), donc il CHANGEAIT à
  // chaque poll. L'ordre chronologique était arbitraire, ce qui corrompait
  // tout modèle séquentiel (Elo) et générait des doublons.
  // On utilise désormais l'ID du message Telegram : strictement croissant,
  // stable dans le temps, et unique par match.
  const n = Number.isFinite(Number(msgId)) ? Number(msgId)
          : Math.floor(Date.now() / 1000) % 100000 + index * 10; // repli
  const ts = Number.isFinite(Number(msgTs)) ? Number(msgTs) : Date.now();

  return { n, home, away, score, ts, msgId: n };
}

// ── Mise à jour d'un canal ───────────────────────────────────
async function updateChannel(key, username) {
  try {
    const html = await fetchChannelHTML(username);
    if (!html || html.length < 100) {
      console.warn(`[${key}] HTML vide ou trop court (${html ? html.length : 0} chars)`);
      return;
    }
    // Détecter si Telegram a bloqué la requête (page de redirect ou captcha)
    if (html.includes('tgme_page_status') || html.includes('Too Many Requests') || html.includes('<title>429')) {
      console.warn(`[${key}] ⚠️ Telegram a bloqué la requête (rate-limit). Réessai au prochain cycle.`);
      return;
    }

    // ✅ On lit désormais les messages AVEC leur id et leur date Telegram.
    // Ces métadonnées sont indispensables pour reconstituer un ordre
    // chronologique fiable (cf. correctif parseFifa4x4).
    let rich = extractMessagesRich(html);
    if (!rich.length) {
      // Repli sur l'ancien extracteur si la structure de la page a changé.
      rich = extractMessages(html, key).map((t, i) => ({ id: null, text: t, ts: Date.now() }));
    }
    let messages = rich;

    // FIFA 4×4 : pairer les lignes équipes + score consécutives
    if (key === 'fifa4x4') {
      const paired = [];
      for (let i = 0; i < messages.length; i++) {
        const cur = messages[i];
        const next = messages[i+1];
        const curT = cur.text, nextT = next ? next.text : '';
        // Si current = team hashtag et next = score
        if (curT.startsWith('#') && curT.includes('_') && nextT.match(/^\d+:\d+/)) {
          // On conserve l'id/ts du message porteur du SCORE (le résultat final).
          paired.push({ id: next.id ?? cur.id, ts: next.ts ?? cur.ts, text: curT + '\n' + nextT });
          i++; // sauter next car déjà consommé
        } else if (curT.match(/\d+:\d+/) && curT.includes('#T')) {
          paired.push(cur);
        } else if (curT.startsWith('#') && curT.includes('_')) {
          paired.push(cur);
        }
      }
      messages = paired.length > 0 ? paired : messages;
      console.log(`[fifa4x4] ${messages.length} messages après pairing`);
    }

    if (messages.length === 0) {
      console.log(`[${key}] Aucun message trouvé sur t.me/s/${username}`);
      return;
    }

    const parsed = [];
    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      const msg = item.text;
      let r = null;
      if (key === 'baccara')       r = parseBaccara(msg);
      else if (key === 'jeu21')    r = parseJeu21(msg);
      else if (key === 'fifa4x4')  r = parseFifa4x4(msg, i, item.id, item.ts);
      else if (key === 'aviator')  r = parseAviator(msg);
      else                         r = parsePenalty(msg);
      if (r) {
        // ✅ Horodatage réel du message Telegram (et non l'heure du scraping),
        // pour que le tri chronologique reste correct entre deux polls.
        if (Number.isFinite(Number(item.ts))) r.ts = Number(item.ts);
        if (item.id != null && r.msgId == null) r.msgId = item.id;
        parsed.push(r);
      }
    }

    if (parsed.length > 0) {
      parsed.sort((a, b) => ((Number(b.ts) || 0) - (Number(a.ts) || 0))
                         || ((Number(b.n) || 0) - (Number(a.n) || 0)));
      // Important : t.me/s renvoie souvent seulement ~20 messages.
      // On fusionne donc avec l'historique existant au lieu d'écraser,
      // afin d'accumuler progressivement jusqu'à 500 résultats par jeu.
      const currentData = storage.getResults(key);
      const merged = mergeResults(key, parsed, currentData);
      await storage.setResults(key, merged);
      console.log(`✅ [${key}] ${parsed.length} nouveaux/actuels lus, ${merged.length}/${MAX_RESULTS_PER_GAME} conservés. Dernier: #N${merged[0]?.n}`);
    } else {
      console.log(`[${key}] ⚠️ ${messages.length} messages trouvés mais aucun parsé`);
      // Afficher les 3 premiers pour debug
      messages.slice(0, 3).forEach((msg, i) => {
        console.log(`   [${key}] msg${i+1}: ${msg.substring(0, 100).replace(/\n/g,' ')}`);
      });
    }
  } catch (e) {
    console.error(`❌ [${key}] Erreur: ${e.message}`);
  }
}

// ── Polling ──────────────────────────────────────────────────
// Délai entre chaque canal Telegram (évite le rate-limiting sur le cloud)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function pollAll() {
  // Itère dynamiquement sur tous les canaux définis dans CHANNELS.
  // On ajoute un délai de 3 secondes entre chaque canal pour éviter que
  // Telegram ne bloque les requêtes (rate-limiting sur IP cloud comme Railway).
  const entries = Object.entries(CHANNELS);
  for (let i = 0; i < entries.length; i++) {
    const [key, username] = entries[i];
    await updateChannel(key, username);
    // Pause de 3 secondes entre chaque canal (sauf après le dernier)
    if (i < entries.length - 1) await sleep(3000);
  }
}


// ── Actualisation des rencontres programmées bookmaker ────────────
async function updateUpcoming(game) {
  if (!UPCOMING_GAMES.includes(game)) return [];
  // Sur Railway (cloud), 1xBet bloque l'IP. On tente quand même au cas où,
  // mais on ne laisse pas Puppeteer tourner trop longtemps pour éviter les crashs mémoire.
  const collected = [];
  for (const source of BOOKMAKER_SOURCES) {
    try {
      // Timeout de 10 secondes maximum pour éviter de bloquer le serveur
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 10000)
      );
      const rows = await Promise.race([
        scraper.fetchUpcoming(game, source),
        timeoutPromise
      ]);
      rows.forEach(r => collected.push({ ...r, bookmaker: r.bookmaker || source }));
    } catch (e) {
      // Erreur silencieuse — 1xBet bloque ou timeout
    }
  }
  upcomingFixtures[game] = mergeUpcomingFixtures(game, collected);
  upcomingUpdatedAt[game] = new Date().toISOString();
  console.log(`🗓️ [${game}] ${upcomingFixtures[game].length} rencontre(s) bookmaker détectée(s).`);
  return upcomingFixtures[game];
}

async function pollUpcomingAll() {
  if (upcomingPollInProgress) return;
  upcomingPollInProgress = true;
  try {
    for (const game of UPCOMING_GAMES) {
      await updateUpcoming(game);
    }
  } finally {
    upcomingPollInProgress = false;
  }
}

// ── Vérifications au démarrage ────────────────────────────────
// ✅ L'application utilise GROQ (endpoint /api/groq-analyze).
// L'ancien endpoint Anthropic /analyze n'est plus appelé par le frontend :
// il bascule automatiquement sur Groq et ANTHROPIC_API_KEY est facultative.
// On n'avertit donc plus que sur GROQ_API_KEY, la seule clé réellement utile.
if (!process.env.GROQ_API_KEY) {
  console.warn('ℹ️  GROQ_API_KEY non configurée — les moteurs locaux fonctionnent normalement,');
  console.warn('   seule l\'analyse IA enrichie est désactivée.');
  console.warn('   Clé gratuite : https://console.groq.com/keys');
  console.warn('   Puis ajoute dans le fichier .env :  GROQ_API_KEY=gsk_...');
} else {
  console.log('✅ GROQ_API_KEY détectée — analyse IA enrichie active.');
}

console.log('🔐 ' + security.corsSummary());
console.log(`🔐 Rate-limit connexion : ${security.RL.maxAttempts} tentatives / ${Math.round(security.RL.windowMs / 60000)} min`);
console.log(`🔐 Sessions persistées : ${sessionStore.count()} active(s) — ${sessionStore.file}`);
console.log(`💾 Données : ${sessionStore.dataDir}` + (process.env.DATA_DIR ? '  (DATA_DIR)' : '  (local — sur Railway, monte un volume et définis DATA_DIR)'));

console.log('🔄 Récupération initiale...');

// Nettoyage des anciennes données si CLEAR_DATA=1 (force un fresh start)
if (process.env.CLEAR_DATA === '1') {
  console.log('🧹 CLEAR_DATA activé — nettoyage des anciennes données...');
  Object.keys(CHANNELS).forEach(game => {
    const results = storage.getResults(game);
    if (results.length > 0) {
      storage.setResults(game, []);
      console.log(`🧹 ${game}: ${results.length} anciens résultats effacés.`);
    }
  });
}

// Amorce du compte admin (au premier démarrage) depuis storage.js
storage.seedAdmin();

pollAll();
pollUpcomingAll();
// Polling Telegram toutes les 30 secondes (plus lent pour éviter la surcharge mémoire sur Railway)
setInterval(pollAll, 30000);
// Calendrier bookmaker : toutes les 60 secondes (Puppeteer est lourd, on l'appelle moins souvent).
setInterval(pollUpcomingAll, 60000);

// ── Logique de Synchronisation (Extrait pour être réutilisable) ──────────────────
async function syncGame(game) {
  console.log(`🔄 [${new Date().toLocaleTimeString()}] Lancement de la synchronisation officielle pour ${game}...`);
  
  try {
    // 1. Récupérer les résultats officiels
    const officialResults = await scraper.fetchResults(game);
    if (UPCOMING_GAMES.includes(game)) {
      // Actualise aussi le calendrier réel bookmaker lors d'une synchronisation manuelle/cron.
      await updateUpcoming(game);
    }
    
    if (officialResults.length === 0) {
      console.warn(`⚠️ Aucun résultat officiel trouvé sur FastPari pour ${game}.`);
      return { status: 'warning', message: 'Aucun résultat officiel trouvé.' };
    }

    // 2. Récupérer les données actuelles du stockage
    const currentData = storage.getResults(game);

    // 3. Fusionner et Valider (Cross-referencing)
    const verifiedData = currentData.map(item => {
      const match = officialResults.find(off => 
        (off.home === item.home && off.away === item.away && off.score === item.score) ||
        (off.officialId && item.n == off.officialId)
      );
      
      return match ? { ...item, verified: true, officialId: match.officialId } : item;
    });

    // 4. Ajouter les résultats officiels manquants
    officialResults.forEach(off => {
      const exists = verifiedData.some(item => item.officialId === off.officialId);
      if (!exists) {
        verifiedData.unshift({
          n: off.officialId || Date.now(),
          home: off.home,
          away: off.away,
          score: off.score,
          verified: true,
          officialId: off.officialId,
          ts: Date.now()
        });
      }
    });

    // 5. Sauvegarder le tout (500 événements max)
    await storage.setResults(game, mergeResults(game, verifiedData, []));

    console.log(`✅ [${game}] Synchronisation terminée. ${verifiedData.filter(i => i.verified).length} matchs vérifiés.`);
    return { 
      status: 'success', 
      verifiedCount: verifiedData.filter(i => i.verified).length,
      totalCount: verifiedData.length 
    };
  } catch (err) {
    console.error(`❌ Erreur Sync [${game}]:`, err);
    throw err;
  }
}

// ── Planification Automatique (Cron Jobs) ─────────────────────────────────────────
// On synchronise tous les jeux toutes les heures.
// node-cron est optionnel : fallback setInterval s'il est absent.
async function hourlySync() {
  console.log('⏰ Lancement de la synchronisation horaire automatique...');
  const games = ['baccara', 'penalty18', 'penalty22', 'jeu21', 'fifa4x4'];
  for (const game of games) {
    try {
      await syncGame(game);
    } catch (e) {
      console.error(`❌ Échec de la synchro auto pour ${game}:`, e.message);
    }
  }
  console.log('✅ Synchronisation horaire terminée.');
}
if (cron) {
  cron.schedule('0 * * * *', hourlySync);
} else {
  console.warn('⚠️ node-cron absent : synchronisation horaire via setInterval (60 min).');
  setInterval(hourlySync, 60 * 60 * 1000);
}

// ── Endpoint de Synchronisation Manuelle ──────────────────────────────────────────
app.get('/sync', async (req, res) => {
  const game = req.query.game;
  if (!game) return res.status(400).json({ error: 'Paramètre game manquant' });

  try {
    const result = await syncGame(game);
    res.json({ status: result.status, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la synchronisation.' });
  }
});

// ── API REST ─────────────────────────────────────────────────
app.get('/upcoming/:game', async (req, res) => {
  const game = req.params.game;
  if (!UPCOMING_GAMES.includes(game)) {
    return res.status(404).json({ error: 'Jeu sans calendrier bookmaker' });
  }

  if (req.query.refresh === '1') {
    await updateUpcoming(game);
  }

  res.json({
    game,
    updatedAt: upcomingUpdatedAt[game],
    sources: BOOKMAKER_SOURCES,
    fixtures: upcomingFixtures[game] || []
  });
});

app.get('/results/:game', (req, res) => {
  const game = req.params.game;
  if (!VALID_GAMES.includes(game)) {
    return res.status(404).json({ error: 'Jeu inconnu' });
  }

  // Aviator : pas de canal Telegram. On sert les multiplicateurs générés (fallback).
  if (game === 'aviator') {
    return res.json(AVIATOR_FALLBACK.slice(0, normalizeLimit(req.query.limit)));
  }

  const limit = normalizeLimit(req.query.limit);
  const data = storage.getResults(game)
    .sort((a, b) => ((Number(b.ts) || 0) - (Number(a.ts) || 0))
                 || ((Number(b.n) || 0) - (Number(a.n) || 0)))
    .slice(0, limit);

  res.json(data);
});

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    counts: {
      baccara:   storage.getResults('baccara').length,
      penalty18: storage.getResults('penalty18').length,
      penalty22: storage.getResults('penalty22').length,
      jeu21:     storage.getResults('jeu21').length,
      fifa4x4:   storage.getResults('fifa4x4').length,
      aviator:   AVIATOR_FALLBACK.length,
    }
  });
});

// ── Endpoint Analyse IA ──────────────────────────────────────
// (https est déjà requis en haut du fichier — pas de doublon)

// ── Endpoint /analyze — rétrocompatibilité, désormais servi par GROQ ──
// Conservé pour d'anciens clients éventuels. Le frontend actuel utilise
// /api/groq-analyze. Plus aucune dépendance à ANTHROPIC_API_KEY.
app.post('/analyze', (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt manquant' });

  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) {
    return res.status(503).json({
      error: "GROQ_API_KEY non configurée. Ajoute GROQ_API_KEY=gsk_... dans le fichier .env " +
             "(clé gratuite sur https://console.groq.com/keys). Les moteurs locaux restent disponibles."
    });
  }

  const body = JSON.stringify({
    model: GROQ_MODEL,
    max_tokens: 1200,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }]
  });

  const apiReq = https.request({
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${groqKey}`
    }
  }, (apiRes) => {
    let data = '';
    apiRes.on('data', c => data += c);
    apiRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          console.error('[/analyze] Erreur Groq:', parsed.error.message);
          return res.status(502).json({ error: parsed.error.message || 'Erreur Groq API' });
        }
        const text = (parsed.choices?.[0]?.message?.content || '')
          .replace(/```json|```/g, '').trim();
        res.json({ raw: text, provider: 'groq', model: GROQ_MODEL });
      } catch (e) {
        res.status(502).json({ error: 'Réponse Groq illisible' });
      }
    });
  });

  apiReq.on('error', e => res.status(502).json({ error: 'Erreur réseau: ' + e.message }));
  apiReq.setTimeout(GROQ_TIMEOUT_MS, () => {
    apiReq.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Timeout Groq' });
  });
  apiReq.write(body);
  apiReq.end();
});

// ══════════════════════════════════════════════════════════════════
//  AUTHENTIFICATION SÉCURISÉE (membres + admin)
//  Les mots de passe ne transitent qu'à la connexion/création (HTTPS requis en prod)
//  et sont hachés côté serveur (scrypt). Aucun mot de passe n'est stocké en clair.
// ══════════════════════════════════════════════════════════════════

// Connexion (membre OU admin). Démarre le décompte d'abonnement à la 1ère connexion.
app.post('/api/auth/login', security.loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  const user = String(username || '').trim();
  if (!user || !password) return res.status(400).json({ error: 'Identifiant et code d\'accès requis.' });

  const d = storage.getAccount(user);

  // ✅ SÉCURITÉ : message d'erreur IDENTIQUE que l'identifiant existe ou non.
  // Auparavant « Identifiant introuvable » vs « Code d'accès incorrect »
  // permettait d'énumérer les comptes valides avant d'attaquer les mots de passe.
  const echec = () => {
    req.rateLimit.fail();
    const reste = req.rateLimit.remaining();
    const indice = reste > 0 && reste <= 3
      ? ` (${reste} tentative${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''})`
      : '';
    return res.status(401).json({ error: `❌ Identifiant ou code d'accès incorrect.${indice}` });
  };

  if (!d) return echec();
  if (!storage.verifyPassword(password, d.pass)) return echec();

  // Connexion réussie → on remet le compteur de tentatives à zéro.
  req.rateLimit.reset();

  if (d.role !== 'admin') {
    // Expiration
    if (d.firstLogin && d.expiresAt && Date.now() >= d.expiresAt) {
      if (d.active !== false) { d.active = false; d.expiredAt = Date.now(); storage.upsertAccount(d); }
      return res.status(403).json({ error: "🔒 Votre période d'accès est arrivée à expiration. Veuillez contacter l'administrateur pour renouveler votre accès." });
    }
    if (!d.active) {
      return res.status(403).json({ error: '🚫 Compte désactivé. Contacte l\'administrateur.' });
    }
  }

  // Démarrage du décompte à la PREMIÈRE connexion (membre uniquement)
  let startedSubscription = false;
  if (d.role !== 'admin' && !d.firstLogin) {
    const durKey = d.durationKey || DEFAULT_DURATION_KEY;
    const dur = getDurationByKey(durKey) || getDurationByKey(DEFAULT_DURATION_KEY);
    const now = Date.now();
    d.durationKey = dur.key;
    d.durationMs = dur.ms;
    d.firstLogin = now;
    d.firstLoginStr = new Date(now).toLocaleString('fr-FR');
    d.expiresAt = now + dur.ms;
    startedSubscription = true;
  }

  d.lastLogin = new Date().toLocaleString('fr-FR');
  storage.upsertAccount(d);

  const token = createSession({ username: d.username, role: d.role });
  res.json({ token, account: publicAccount(d.username, d), startedSubscription });
});

// Déconnexion (invalide le token)
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  destroySession(token);
  res.json({ ok: true });
});

// Infos du compte courant (et vérification live de l'expiration)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const d = storage.getAccount(req.session.username);
  if (!d) return res.status(401).json({ error: 'Compte introuvable.' });
  if (d.role !== 'admin' && d.firstLogin && d.expiresAt && Date.now() >= d.expiresAt && d.active !== false) {
    d.active = false; d.expiredAt = Date.now(); storage.upsertAccount(d);
  }
  res.json({ account: publicAccount(d.username, d) });
});

// ── Endpoints admin (protégés) ──────────────────────────────────────

// Liste de tous les comptes (sans les hashes)
app.get('/api/admin/accounts', adminMiddleware, (req, res) => {
  const acc = storage.getAccounts();
  let changed = false;
  Object.values(acc).forEach(d => {
    if (d.role === 'admin') return;
    if (d.firstLogin && d.expiresAt && Date.now() >= d.expiresAt && d.active !== false) {
      d.active = false; d.expiredAt = Date.now(); changed = true;
    }
  });
  if (changed) storage.saveAccounts(acc);
  const accounts = Object.entries(acc).map(([u, d]) => publicAccount(u, d));
  res.json({ accounts });
});

// Création d'un compte membre
app.post('/api/admin/accounts', adminMiddleware, (req, res) => {
  const { username, password, durationKey } = req.body || {};
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || !pass) return res.status(400).json({ error: 'Identifiant et code d\'accès requis.' });
  if (pass.length < 4) return res.status(400).json({ error: 'Code d\'accès trop court (min 4 caractères).' });
  const acc = storage.getAccounts();
  if (acc[user]) return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
  const dur = getDurationByKey(durationKey) || getDurationByKey(DEFAULT_DURATION_KEY);
  const account = {
    username: user,
    pass: storage.hashPassword(pass),
    role: 'member',
    active: true,
    created: new Date().toLocaleDateString('fr-FR'),
    lastLogin: null,
    durationKey: dur.key,
    durationMs: dur.ms,
    firstLogin: null,
    firstLoginStr: null,
    expiresAt: null,
    expiredAt: null
  };
  storage.upsertAccount(account);
  res.json({ account: publicAccount(user, account), generatedPassword: pass });
});

// Modification d'un compte (renomme / mot de passe / statut / durée)
app.put('/api/admin/accounts/:username', adminMiddleware, (req, res) => {
  const original = req.params.username;
  const { username: bodyUser, password, active, durationKey } = req.body || {};
  const acc = storage.getAccounts();
  const d = acc[original];
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  const target = String(bodyUser || '').trim() || original;

  if (target !== original && acc[target]) {
    return res.status(409).json({ error: 'Cet identifiant existe déjà.' });
  }
  if (password) d.pass = storage.hashPassword(String(password));

  if (d.role !== 'admin') {
    const newDur = getDurationByKey(durationKey);
    if (newDur && newDur.key !== d.durationKey) {
      d.durationKey = newDur.key;
      d.durationMs = newDur.ms;
      if (d.firstLogin) {
        d.expiresAt = d.firstLogin + newDur.ms;
        if (Date.now() >= d.expiresAt) { d.active = false; d.expiredAt = Date.now(); }
        else if (d.expiredAt) d.expiredAt = null;
      }
    }
    const newActive = active === undefined ? d.active : (active === true || active === '1' || active === 1);
    if (newActive && d.expiredAt && Date.now() >= (d.expiresAt || 0)) {
      // On ne permet pas de réactiver un compte expiré depuis l'édition standard
      return res.status(400).json({ error: '⚠️ Compte expiré : utilise "Réactiver" pour relancer le décompte.' });
    }
    d.active = newActive;
  }

  if (target !== original) {
    delete acc[original];
    d.username = target;
  }
  acc[target] = d;
  storage.saveAccounts(acc);
  res.json({ account: publicAccount(target, d) });
});

// Suppression d'un compte
app.delete('/api/admin/accounts/:username', adminMiddleware, (req, res) => {
  const username = req.params.username;
  const d = storage.getAccount(username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  if (d.role === 'admin') return res.status(400).json({ error: 'Impossible de supprimer l\'administrateur.' });
  storage.deleteAccount(username);
  // ✅ Révoquer les sessions actives : sans cela, un compte supprimé
  //    restait connecté jusqu'à l'expiration de son token (12 h).
  const revoquees = sessionStore.destroyUserSessions(username);
  if (revoquees) console.log(`[sécurité] ${revoquees} session(s) révoquée(s) — compte supprimé : ${username}`);
  res.json({ ok: true, sessionsRevoked: revoquees });
});

// Activer / désactiver un compte
app.post('/api/admin/accounts/:username/toggle', adminMiddleware, (req, res) => {
  const d = storage.getAccount(req.params.username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  d.active = !d.active;
  storage.upsertAccount(d);
  // ✅ Une désactivation doit prendre effet immédiatement, pas à l'expiration du token.
  let revoquees = 0;
  if (!d.active) {
    revoquees = sessionStore.destroyUserSessions(d.username);
    if (revoquees) console.log(`[sécurité] ${revoquees} session(s) révoquée(s) — compte désactivé : ${d.username}`);
  }
  res.json({ account: publicAccount(d.username, d), sessionsRevoked: revoquees });
});

// Réinitialiser la durée (efface la 1ère connexion → redémarre au prochain login)
app.post('/api/admin/accounts/:username/reset', adminMiddleware, (req, res) => {
  const d = storage.getAccount(req.params.username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  d.firstLogin = null;
  d.firstLoginStr = null;
  d.expiresAt = null;
  d.expiredAt = null;
  d.active = true;
  storage.upsertAccount(d);
  res.json({ account: publicAccount(d.username, d) });
});

// Réactiver un compte (relance le décompte s'il était expiré)
app.post('/api/admin/accounts/:username/reactivate', adminMiddleware, (req, res) => {
  const d = storage.getAccount(req.params.username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  const wasExpired = !!d.expiredAt;
  d.active = true;
  d.expiredAt = null;
  let label = null;
  if (wasExpired) {
    const dur = getDurationByKey(d.durationKey) || getDurationByKey(DEFAULT_DURATION_KEY);
    const now = Date.now();
    d.firstLogin = now;
    d.firstLoginStr = new Date(now).toLocaleString('fr-FR');
    d.expiresAt = now + dur.ms;
    d.durationKey = dur.key;
    d.durationMs = dur.ms;
    label = dur.label;
  }
  storage.upsertAccount(d);
  res.json({ account: publicAccount(d.username, d), restarted: wasExpired, durationLabel: label });
});

// Prolonger l'abonnement (mode 'add' ou 'from_now')
app.post('/api/admin/accounts/:username/extend', adminMiddleware, (req, res) => {
  const d = storage.getAccount(req.params.username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  const { durationKey, mode } = req.body || {};
  const dur = getDurationByKey(durationKey);
  if (!dur) return res.status(400).json({ error: 'Durée invalide.' });
  const now = Date.now();
  let newExp;
  if (mode === 'add') {
    const base = (d.expiresAt && d.expiresAt > now) ? d.expiresAt : now;
    newExp = base + dur.ms;
  } else {
    newExp = now + dur.ms;
    d.durationKey = dur.key;
    d.durationMs = dur.ms;
    d.firstLogin = now;
    d.firstLoginStr = new Date(now).toLocaleString('fr-FR');
  }
  d.expiresAt = newExp;
  d.expiredAt = null;
  d.active = true;
  storage.upsertAccount(d);
  res.json({ account: publicAccount(d.username, d), newExpiresAt: newExp });
});

// Export CSV de tous les comptes
app.get('/api/admin/accounts/export.csv', adminMiddleware, (req, res) => {
  const acc = storage.getAccounts();
  const now = Date.now();
  let csv = 'Identifiant,Rôle,Statut,Créé le,Dernière connexion,Durée,1ère connexion,Expire le,Temps restant\n';
  Object.entries(acc).forEach(([u, d]) => {
    let statut = d.active ? 'Actif' : 'Inactif';
    if (d.expiredAt) statut = 'Expiré';
    else if (!d.firstLogin && d.role !== 'admin') statut = 'En attente';
    const durLabel = d.durationKey ? (getDurationByKey(d.durationKey)?.label || '') : '';
    const firstLog = d.firstLoginStr || (d.firstLogin ? formatDateTime(d.firstLogin) : '');
    const expires = d.expiresAt ? formatDateTime(d.expiresAt) : '';
    const remain = (d.expiresAt && d.role !== 'admin')
      ? formatDuration(d.expiresAt - now)
      : (d.role === 'admin' ? 'Illimité' : '');
    csv += `"${u}","${d.role}","${statut}","${d.created || ''}","${d.lastLogin || ''}","${durLabel}","${firstLog}","${expires}","${remain}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="hadar_membres_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '_')}.csv"`);
  res.send('\uFEFF' + csv);
});

// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
//  GROQ AI — Moteur d'analyse prédictive expert (Llama 3.3 70B)
//  Prompts SPÉCIFIQUES par type de jeu. Ces jeux sont des SIMULATIONS
//  virtuelles (1xBet / Spribe) régies par des algorithmes RNG : l'IA doit
//  s'appuyer UNIQUEMENT sur l'historique statistique, JAMAIS sur une
//  "connaissance footballistique" réelle (les noms d'équipes sont neutres).
//  Complément du moteur local HADAR AI. Nécessite GROQ_API_KEY.
// ══════════════════════════════════════════════════════════════════

const GROQ_MODEL       = 'llama-3.3-70b-versatile';
const GROQ_TIMEOUT_MS  = 20000;
const GROQ_CACHE_TTL   = 45000;   // cache 45 s par jeu (évite le spam / optimise le quota gratuit)
const GROQ_MIN_DATA    = 5;       // en dessous, l'analyse Groq est jugée peu fiable
const _groqCache = new Map();     // game -> { ts, payload }

function groqPct(n, total) { return total ? Math.round((n / total) * 100) : 0; }

// Nature réelle de chaque jeu (évite l'hallucination "football réel")
// Nature réelle de chaque jeu.
//  - noDraw = true  : un vainqueur est TOUJOURS désigné (tirs au but) → le nul est IMPOSSIBLE.
//  - noDraw = false : les matchs nuls sont possibles (FIFA 4×4).
const GAME_NATURE = {
  penalty18: { type: 'virtual-penalty',  label: 'FIFA Penalty 18 (simulation tirs au but 1xBet)', noDraw: true,  target: 'le vainqueur du prochain tir au but (DOMICILE ou EXTÉRIEUR — un nul est IMPOSSIBLE) et le score le plus probable' },
  penalty22: { type: 'virtual-penalty',  label: 'FIFA Penalty 22 (simulation tirs au but 1xBet)', noDraw: true,  target: 'le vainqueur du prochain tir au but (DOMICILE ou EXTÉRIEUR — un nul est IMPOSSIBLE) et le score le plus probable' },
  fifa4x4:   { type: 'virtual-football', label: 'FIFA 4×4 FC24 (simulation match 1xBet)',        noDraw: false, target: 'le résultat du prochain match (DOMICILE / NUL / EXTÉRIEUR) et le score le plus probable' },
  baccara:   { type: 'baccara',          label: 'Baccara casino',         target: 'le côté gagnant du prochain coup (Joueur / Banquier / Égalité)' },
  jeu21:     { type: 'blackjack',        label: 'Blackjack (Jeu 21)',     target: 'le résultat de la prochaine main (WIN / LOSE / PUSH)' },
  aviator:   { type: 'crash',            label: 'Aviator (crash game Spribe)', target: 'la zone de cash-out optimale et la probabilité de crash précoce (<2x)' },
};

const NATURE_DESC = {
  'virtual-penalty':  'SIMULATION de TIRS AU BUT virtuels (FIFA) générée par un algorithme RNG chez le bookmaker 1xBet. POINT CLÉ : un tir au but désigne TOUJOURS un vainqueur — un MATCH NUL EST IMPOSSIBLE, il y a forcément DOMICILE ou EXTÉRIEUR. Les noms d\'équipes sont des étiquettes du simulateur : tu PEUX exploiter leurs PERFORMANCES HISTORIQUES telles qu\'elles figurent dans les données fournies (taux de victoire par équipe, scores fréquents, confrontations directes), mais tu ne dois JAMAIS utiliser de connaissance footballistique du monde réel (forme réelle, blessures, tactique, derby, motivation).',
  'virtual-football': 'SIMULATION de match de football virtuel (FIFA 4×4) générée par un algorithme RNG chez le bookmaker 1xBet. Les MATCHS NULS sont possibles ici. Les noms d\'équipes sont des étiquettes du simulateur : tu PEUX exploiter leurs PERFORMANCES HISTORIQUES telles qu\'elles figurent dans les données fournies (taux de victoire par équipe, scores fréquents, confrontations directes), mais tu ne dois JAMAIS utiliser de connaissance footballistique du monde réel (forme réelle, blessures, tactique, derby, motivation).',
  'baccara':          'Jeu de BACCARA de casino. À chaque coup, le Joueur et le Banquier reçoivent des cartes ; le côté le plus proche de 9 gagne (égalité possible). Avantage structurel théorique : Joueur ~44,6% / Banquier ~45,9% / Égalité ~9,5%.',
  'blackjack':        'Jeu de BLACKJACK (21) de casino. Résultat WIN (joueur gagne) / LOSE (croupier gagne) / PUSH (égalité). Analyse la distribution, la fréquence de bust (>21) et les séries.',
  'crash':            'Jeu à MULTIPLICATEUR (crash game) type Aviator (Spribe). Un multiplicateur monte depuis 1.00x puis "crashe". Référence statistique : ~50% des tours < 2x, ~9% > 10x. Analyse les séries de crashes précoces, l\'écart depuis le dernier gros multiplicateur et la zone de cash-out optimale.',
};

// ── Statistiques riches pré-calculées par type de jeu ──────────────
function computeGroqStats(game, data) {
  const total = data.length;
  if (!total) return 'Aucune donnée disponible.';
  const sampleNote = total < 20 ? `\n⚠️ Échantillon limité (${total}) : prudence sur la confiance.` : '';

  if (game === 'aviator') {
    const mults = data.map(r => Number(r.multiplier)).filter(Number.isFinite);
    const t = mults.length || 1;
    const avg = mults.reduce((a,b)=>a+b,0) / t;
    const sorted = [...mults].sort((a,b)=>a-b);
    const median = sorted[Math.floor(t/2)];
    const low = mults.filter(m => m < 2).length;
    const mid = mults.filter(m => m >= 2 && m < 10).length;
    const high = mults.filter(m => m >= 10).length;
    let early = 0; for (const m of mults) { if (m < 2) early++; else break; }
    let sinceHigh = mults.findIndex(m => m >= 10); sinceHigh = sinceHigh < 0 ? t : sinceHigh;
    const recentAvg = mults.slice(0,10).reduce((a,b)=>a+b,0) / (Math.min(10,t)||1);
    return [
      `Total: ${t} tours | Moyenne: ${avg.toFixed(2)}x | Médiane: ${median.toFixed(2)}x`,
      `Répartition: <2x = ${groqPct(low,t)}% | 2-10x = ${groqPct(mid,t)}% | >10x = ${groqPct(high,t)}% (théorie ~50/41/9%)`,
      `Série de crashes précoces (<2x): ${early} consécutif(s)`,
      `Tours écoulés depuis le dernier >10x: ${sinceHigh}`,
      `Moyenne 10 derniers tours: ${recentAvg.toFixed(2)}x`,
    ].join('\n') + sampleNote;
  }

  if (game === 'baccara') {
    let p = 0, b = 0, tie = 0, nat = 0;
    data.forEach(r => {
      const ps = r.playerScore ?? r.player ?? 0, bs = r.bankerScore ?? r.banker ?? 0;
      if (ps > bs) p++; else if (bs > ps) b++; else tie++;
      if (r.natural || ps >= 8 || bs >= 8) nat++;
    });
    const seq = data.slice(0,15).map(r => {
      const ps = r.playerScore ?? r.player ?? 0, bs = r.bankerScore ?? r.banker ?? 0;
      return ps > bs ? 'J' : bs > ps ? 'B' : 'E';
    });
    let streakSide = seq[0], streakLen = 0;
    for (const s of seq) { if (s === streakSide) streakLen++; else break; }
    const labelSide = streakSide === 'J' ? 'Joueur' : streakSide === 'B' ? 'Banquier' : 'Égalité';
    return [
      `Total: ${total} coups | Joueur: ${p} (${groqPct(p,total)}%) | Banquier: ${b} (${groqPct(b,total)}%) | Égalité: ${tie} (${groqPct(tie,total)}%)`,
      `Naturelles (8 ou 9): ${nat} (${groqPct(nat,total)}%) | Référence: J~44,6% / B~45,9% / E~9,5%`,
      `Série en cours: ${streakLen}× ${labelSide} | Séquence: ${seq.join('-')}`,
    ].join('\n') + sampleNote;
  }

  if (game === 'jeu21') {
    let w = 0, l = 0, pu = 0, bust = 0;
    data.forEach(r => {
      const res = String(r.result||'').toUpperCase();
      if (res==='WIN') w++; else if (res==='LOSE') l++; else pu++;
      if ((r.player??0) > 21 || (r.dealer??0) > 21) bust++;
    });
    let streakSide = String(data[0]?.result||'').toUpperCase(), streakLen = 0;
    for (const r of data) { if (String(r.result||'').toUpperCase()===streakSide) streakLen++; else break; }
    return [
      `Total: ${total} mains | WIN: ${w} (${groqPct(w,total)}%) | LOSE: ${l} (${groqPct(l,total)}%) | PUSH: ${pu} (${groqPct(pu,total)}%)`,
      `Bust (>21): ${bust} (${groqPct(bust,total)}%) | Série en cours: ${streakLen}× ${streakSide||'—'}`,
    ].join('\n') + sampleNote;
  }

  // ── Jeux virtuels (penalty18, penalty22, fifa4x4) ──
  const noDraw = !!GAME_NATURE[game]?.noDraw;
  const parsed = data.map(r => {
    const parts = String(r.score || '0:0').split(':');
    return { h: Number(parts[0])||0, a: Number(parts[1])||0, home: String(r.home||'Dom').trim(), away: String(r.away||'Ext').trim() };
  });
  const dom = parsed.filter(x => x.h > x.a).length;
  const nul = noDraw ? 0 : parsed.filter(x => x.h === x.a).length;
  const ext = parsed.filter(x => x.a > x.h).length;
  const gH = parsed.reduce((s,x)=>s+x.h,0), gA = parsed.reduce((s,x)=>s+x.a,0);
  const totGoalsArr = parsed.map(x => x.h + x.a);
  const avgH = (gH/total).toFixed(2), avgA = (gA/total).toFixed(2);
  const avgTot = (totGoalsArr.reduce((a,b)=>a+b,0)/total).toFixed(2);
  const freq = {}; parsed.forEach(x => { const k = `${x.h}:${x.a}`; freq[k] = (freq[k]||0)+1; });
  const topScores = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const seq = parsed.slice(0,15).map(x => x.h>x.a?'DOM':x.h===x.a?'NUL':'EXT');
  let streakSide = seq[0], streakLen = 0;
  for (const s of seq) { if (s === streakSide) streakLen++; else break; }
  const threshold = game === 'fifa4x4' ? 5.5 : 3.5;
  const over = totGoalsArr.filter(g => g > threshold).length;

  // Performances historiques par équipe (exploitable par Groq, sans logique football réelle)
  const teams = {};
  parsed.forEach(x => {
    for (const [name, side] of [[x.home,'h'], [x.away,'a']]) {
      if (!teams[name]) teams[name] = { p:0, w:0, d:0, l:0, gf:0, ga:0 };
      teams[name].p++;
      const my = side==='h' ? x.h : x.a, opp = side==='h' ? x.a : x.h;
      teams[name].gf += my; teams[name].ga += opp;
      if (my > opp) teams[name].w++; else if (my < opp) teams[name].l++; else teams[name].d++;
    }
  });
  const teamRows = Object.entries(teams)
    .map(([name, t]) => ({ name, wr: t.p ? Math.round(t.w/t.p*100) : 0, p: t.p, gf: t.p?(t.gf/t.p).toFixed(1):'0', ga: t.p?(t.ga/t.p).toFixed(1):'0' }))
    .filter(t => t.p >= 2)
    .sort((a,b) => b.wr - a.wr || b.p - a.p)
    .slice(0, 8);

  const distLine = noDraw
    ? `Distribution: Domicile ${dom} (${groqPct(dom,total)}%) | Extérieur ${ext} (${groqPct(ext,total)}%) — NUL IMPOSSIBLE`
    : `Distribution: Domicile ${dom} (${groqPct(dom,total)}%) | Nuls ${nul} (${groqPct(nul,total)}%) | Extérieur ${ext} (${groqPct(ext,total)}%)`;
  const teamLine = teamRows.length
    ? `\nPerformances par équipe (historique du jeu): ${teamRows.map(t => `${t.name} ${t.wr}%V/${t.p}m (${t.gf}-${t.ga} buts)`).join(' · ')}`
    : '';

  return [
    `Total: ${total} matchs | ${distLine}`,
    `Buts moyens: ${avgH}-${avgA} (total ${avgTot}/match) | Over ${threshold}: ${groqPct(over,total)}%`,
    `Scores fréquents: ${topScores.map(([s,c])=>`${s}×${c}`).join(', ')}`,
    `Série en cours: ${streakLen}× ${streakSide} | Séquence: ${seq.join('-')}`,
  ].join('\n') + teamLine + sampleNote;
}

// ── Résumé des derniers résultats AVEC noms d'équipes (historique exploitable) ──
function buildRecentSummary(game, data) {
  const recent = data.slice(0, Math.min(25, data.length));
  if (game === 'aviator') return recent.map(r => `${r.multiplier}x`).join(', ');
  if (game === 'baccara') return recent.map(r => {
    const ps = r.playerScore ?? r.player ?? 0, bs = r.bankerScore ?? r.banker ?? 0;
    return `${ps}-${bs}${r.natural||ps>=8||bs>=8?' (R)':''}→${ps>bs?'J':bs>ps?'B':'E'}`;
  }).join(' | ');
  if (game === 'jeu21') return recent.map(r => `${r.player}-${r.dealer}→${r.result}`).join(' | ');
  // Football / penalty : noms d'équipes conservés (Groq exploite l'historique par équipe)
  return recent.map(r => {
    const parts = String(r.score || '0:0').split(':');
    return `${r.home || 'Dom'} ${parts[0]}-${parts[1]} ${r.away || 'Ext'}`;
  }).join(' | ');
}

// ── Construction des messages (prompt spécifique au type de jeu) ───
function buildGroqMessages(game, data, localAnalysis) {
  const nature = GAME_NATURE[game] || { type: 'virtual-football', label: game, target: 'le prochain résultat' };
  const desc   = NATURE_DESC[nature.type] || NATURE_DESC['virtual-football'];
  const stats  = computeGroqStats(game, data);
  const recent = buildRecentSummary(game, data);
  const lowData = data.length < GROQ_MIN_DATA;

  const system = `Tu es HADAR AI, un moteur d'analyse STATISTIQUE prédictive pour des jeux de paris VIRTUELS (1xBet / Spribe).
CONTEXTE : ces jeux sont des SIMULATIONS algorithmiques (RNG). Pour les jeux de football / tirs au but virtuels, les noms d'équipes sont des ÉTIQUETTES du simulateur : tu PEUX exploiter leurs PERFORMANCES HISTORIQUES telles qu'elles figurent dans les données fournies (taux de victoire par équipe, scores fréquents, confrontations directes, ampleur de l'historique), MAIS tu ne dois JAMAIS utiliser de connaissance footballistique du monde réel (forme réelle, blessures, tactique, derby, motivation, avantage terrain réel).
Tu réponds en français, UNIQUEMENT au format JSON, de façon concrète, chiffrée et professionnelle.`;

  const user = `JEU ANALYSÉ : ${nature.label}
TYPE : ${nature.type}

NATURE DU JEU :
${desc}

STATISTIQUES HISTORIQUES (pré-calculées sur ${data.length} résultats) :
${stats}

${data.length >= GROQ_MIN_DATA ? `DERNIERS RÉSULTATS (du + récent au + ancien) :\n${recent}` : '⚠️ Données insuffisantes : fournis une analyse prudente.'}

${localAnalysis ? `ANALYSE LOCALE HADAR (moteur statistique maison) : ${localAnalysis}` : ''}

MISSION :
1. Identifie les patterns marquants : performances historiques par équipe, biais domicile/extérieur, séries actives, scores récurrents, ampleur de l'historique disponible.
2. Propose UNE prédiction concrète de ${nature.target}, strictement ancrée dans ces statistiques.
3. Donne un niveau de confiance entre 55% et 92% : ÉLÈVE-la si un bord statistique net existe (équipe historiquement dominante, série longue, biais marqué) ; BAISSE-la vers 55-62% si les données sont proches du hasard pur ou l'échantillon faible.
4. Recommande une stratégie de mise / cash-out adaptée à CE type de jeu.
5. Signale un pattern caché que les statistiques simples pourraient manquer (regroupement, alternance, correction de moyenne, surperformance d'une équipe).

Réponds UNIQUEMENT avec ce JSON valide :
{"prediction":"prédiction concrète en 1 phrase","confidence":78,"analysis":"analyse 3-4 phrases ancrée dans les chiffres ci-dessus","strategy":"recommandation 1-2 phrases","signal":"pattern remarquable détecté","risk":"Faible/Moyen/Élevé + raison"}`;

  return [
    { role: 'system', content: system },
    { role: 'user',   content: user },
  ];
}

app.post('/api/groq-analyze', async (req, res) => {
  const { game, data, localAnalysis } = req.body || {};
  if (!game || !data || !data.length) {
    return res.status(400).json({ error: 'Données manquantes.' });
  }

  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey) {
    return res.status(200).json({ enhanced: false, message: 'GROQ_API_KEY non configurée. Analyse locale uniquement.' });
  }

  // Cache court par jeu : évite les appels redondants si l'utilisateur relance vite.
  const cached = _groqCache.get(game);
  const now = Date.now();
  if (cached && (now - cached.ts) < GROQ_CACHE_TTL) {
    console.log(`[Groq] ⏩ Cache (${Math.round((GROQ_CACHE_TTL-(now-cached.ts))/1000)}s) pour ${game}`);
    return res.json({ ...cached.payload, cached: true });
  }

  try {
    const messages = buildGroqMessages(game, data, localAnalysis);
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 900,
      response_format: { type: 'json_object' }
    });

    const apiReq = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${groqKey}`
      }
    }, (apiRes) => {
      let rawData = '';
      apiRes.on('data', chunk => rawData += chunk);
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          if (parsed.error) {
            console.error('[Groq] Erreur:', parsed.error.message);
            return res.status(200).json({ enhanced: false, message: parsed.error.message });
          }
          const text = parsed.choices?.[0]?.message?.content || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const payload = {
              enhanced: true,
              groq: result,
              model: GROQ_MODEL,
              gameType: GAME_NATURE[game]?.type || 'virtual-football',
              lowData: data.length < GROQ_MIN_DATA
            };
            _groqCache.set(game, { ts: Date.now(), payload });
            console.log(`[Groq] ✅ Analyse générée pour ${game} (type: ${payload.gameType}${payload.lowData ? ' · low-data' : ''})`);
            res.json(payload);
          } else {
            res.json({ enhanced: false, message: 'Format de réponse invalide.' });
          }
        } catch (e) {
          console.error('[Groq] Parse error:', e.message);
          res.status(200).json({ enhanced: false, message: 'Erreur parsing.' });
        }
      });
    });

    apiReq.on('error', (e) => {
      console.error('[Groq] Erreur réseau:', e.message);
      res.status(200).json({ enhanced: false, message: e.message });
    });
    apiReq.setTimeout(GROQ_TIMEOUT_MS, () => {
      apiReq.destroy();
      res.status(200).json({ enhanced: false, message: 'Timeout Groq (' + (GROQ_TIMEOUT_MS/1000) + 's)' });
    });
    apiReq.write(body);
    apiReq.end();

  } catch (e) {
    res.status(200).json({ enhanced: false, message: e.message });
  }
});

// ── Gestion des erreurs globales ─────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('🚨 ERREUR CRITIQUE NON GÉRÉE:', err);
  // On ne quitte pas le processus pour rester résilient, mais on logge l'erreur
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Promesse non gérée au rejet:', reason);
});

// Port fourni via process.env.PORT (Railway, etc.), 3000 par défaut en local.
const PORT = process.env.PORT || 3000;

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ HADAR BetAnalytics Server v3 (Resilient Edition)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   URL : http://localhost:${PORT}`);
  console.log(`   Jeux: Baccara | Penalty 18 | Penalty 22 | Jeu 21 | FIFA 4×4 | Aviator\n`);
});

// Gestion explicite des erreurs de démarrage HTTP.
// Sans cela, EADDRINUSE était avalé par uncaughtException → le serveur semblait
// tourner (polling Telegram) alors qu'il ne servait aucune requête HTTP.
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ IMPOSSIBLE DE DÉMARRER : le port ${PORT} est déjà utilisé.`);
    console.error(`   Une autre instance de "node server.js" (ou un autre programme) tourne déjà.`);
    console.error(`\n   ► Solution 1 — libérer le port (PowerShell) :`);
    console.error(`       netstat -ano | findstr :${PORT}`);
    console.error(`       taskkill /PID <PID_trouvé> /F`);
    console.error(`       node server.js`);
    console.error(`\n   ► Solution 2 — utiliser un autre port :`);
    console.error(`       $env:PORT=${Number(PORT) + 1}; node server.js   # PowerShell`);
    console.error(`       set PORT=${Number(PORT) + 1} && node server.js  # CMD\n`);
  } else {
    console.error(`\n❌ Erreur au démarrage du serveur HTTP : ${err.message}\n`, err);
  }
  process.exit(1);
});
