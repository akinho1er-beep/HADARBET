// ============================================================
// BetAnalytics Pro — Serveur Backend v3
// Lit les canaux Telegram via Bot API (plus fiable que scraping)
// Jeux : Baccara, Penalty 18, Penalty 22, Jeu 21, FIFA 4×4
// ============================================================

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
app.use(cors());
app.use(express.json());

// ── Servir les fichiers statiques (HTML, JS, icônes, etc.) ───
app.use(express.static(path.join(__dirname)));

// Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'betting-analyzer.html'));
});


// ── Configuration Telegram (via variable d'environnement) ────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
if (!BOT_TOKEN) {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN manquant. Définis-le avec:');
  console.warn('   export TELEGRAM_BOT_TOKEN=8985006064:AAE6H_...  (Linux/Mac)');
  console.warn('   ou set TELEGRAM_BOT_TOKEN=8985006064:AAE6H_... (Windows CMD)');
  console.warn('   Le scraping HTML t.me/s/ sera utilisé sans fallback Bot API.');
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
const MAX_RESULTS_PER_GAME = 500;
const DEFAULT_RESULTS_LIMIT = 500;
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

// ── Sessions (tokens aléatoires, stockés en mémoire, avec expiration) ──
const SESSION_TTL = 12 * 3600 * 1000; // 12 heures
const sessions = new Map(); // token -> { username, role, expiresAt }

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username: user.username, role: user.role, expiresAt: Date.now() + SESSION_TTL });
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}
function destroySession(token) { if (token) sessions.delete(token); }
// Nettoyage périodique des sessions expirées
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (now > s.expiresAt) sessions.delete(t);
}, 3600 * 1000);

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
  // Les jeux Telegram classiques ont un #N fiable.
  if (item && item.n !== undefined && item.n !== null && game !== 'fifa4x4' && game !== 'aviator') return `n:${item.n}`;
  // Aviator : clé par multiplicateur + timestamp (n souvent absent/0)
  if (game === 'aviator') return `av:${item?.multiplier ?? ''}:${item?.ts ?? ''}`;
  // FIFA 4×4 : pas de #N fiable. On déduplique par teams + score SANS le n
  // (le n basé sur l'index change à chaque poll → doublons).
  return `${item?.home ?? ''}|${item?.away ?? ''}|${item?.score ?? ''}`;
}

function mergeResults(game, incoming, existing = []) {
  const map = new Map();
  [...incoming, ...existing].forEach(item => {
    if (!item) return;
    const key = resultKey(game, item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()]
    .sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0))
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

function parseFifa4x4(text, index) {
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

  // ID séquentiel stable : basé sur le timestamp du message Telegram.
  // On utilise Date.now() au moment du parse — chaque match garde le même n
  // tant qu'il est dans la fenêtre de polling (déduplication par resultKey).
  // Format lisible (#N suivi d'un nombre court) au lieu d'un hash gigantesque.
  const n = Math.floor(Date.now() / 1000) % 100000 + index * 10;

  return { n, home, away, score, ts: Date.now() };
}

// ── Mise à jour d'un canal ───────────────────────────────────
async function updateChannel(key, username) {
  try {
    const html = await fetchChannelHTML(username);
    if (!html || html.length < 100) {
      console.warn(`[${key}] HTML vide ou trop court`);
      return;
    }

    let messages = extractMessages(html, key);

    // FIFA 4×4 : pairer les lignes équipes + score consécutives
    if (key === 'fifa4x4') {
      const paired = [];
      for (let i = 0; i < messages.length; i++) {
        const cur = messages[i];
        const next = messages[i+1] || '';
        // Si current = team hashtag et next = score
        if (cur.startsWith('#') && cur.includes('_') && next.match(/^\d+:\d+/)) {
          paired.push(cur + '\n' + next);
          i++; // sauter next car déjà consommé
        } else if (cur.match(/\d+:\d+/) && cur.includes('#T')) {
          // Score seul (avec ou sans team dans le même message)
          paired.push(cur);
        } else if (cur.startsWith('#') && cur.includes('_')) {
          // Team seule sans score suivant
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
      const msg = messages[i];
      let r = null;
      if (key === 'baccara')       r = parseBaccara(msg);
      else if (key === 'jeu21')    r = parseJeu21(msg);
      else if (key === 'fifa4x4')  r = parseFifa4x4(msg, i);
      else if (key === 'aviator')  r = parseAviator(msg);
      else                         r = parsePenalty(msg);
      if (r) parsed.push(r);
    }

    if (parsed.length > 0) {
      parsed.sort((a, b) => b.n - a.n);
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
async function pollAll() {
  // Itère dynamiquement sur tous les canaux définis dans CHANNELS.
  // Ainsi, tout nouveau jeu ajouté à CHANNELS est automatiquement interrogé.
  for (const [key, username] of Object.entries(CHANNELS)) {
    await updateChannel(key, username);
  }
}


// ── Actualisation des rencontres programmées bookmaker ────────────
async function updateUpcoming(game) {
  if (!UPCOMING_GAMES.includes(game)) return [];
  const collected = [];
  for (const source of BOOKMAKER_SOURCES) {
    try {
      const rows = await scraper.fetchUpcoming(game, source);
      rows.forEach(r => collected.push({ ...r, bookmaker: r.bookmaker || source }));
    } catch (e) {
      console.warn(`⚠️ [${game}] Upcoming ${source} indisponible: ${e.message}`);
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
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️  ANTHROPIC_API_KEY manquante. Les analyses IA échoueront.');
  console.warn('   Définis-la avec:');
  console.warn('   export ANTHROPIC_API_KEY=sk-ant-...  (Linux/Mac)');
  console.warn('   ou set ANTHROPIC_API_KEY=sk-ant-... (Windows CMD)');
}

console.log('🔄 Récupération initiale...');

// Amorce du compte admin (au premier démarrage) depuis storage.js
storage.seedAdmin();

pollAll();
pollUpcomingAll();
setInterval(pollAll, 10000);
// Calendrier bookmaker : rafraîchissement automatique séparé.
setInterval(pollUpcomingAll, 15000);

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
    .sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0))
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

app.post('/analyze', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt manquant' });

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY manquante !');
    return res.status(500).json({ error: 'Clé API manquante. Lance: set ANTHROPIC_API_KEY=sk-ant-... && node server.js' });
  }

  const body = JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey
    }
  };

  console.log('[/analyze] Appel Claude API...');

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      console.log('[/analyze] HTTP status:', apiRes.statusCode);
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          console.error('[/analyze] Erreur Claude:', parsed.error);
          return res.status(500).json({ error: parsed.error.message || 'Erreur Claude API' });
        }
        const text = parsed.content.map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
        console.log('[/analyze] OK. Début réponse:', text.substring(0, 100));
        res.json({ raw: text });
      } catch(e) {
        console.error('[/analyze] Parse error:', e.message);
        res.status(500).json({ error: 'Erreur parsing réponse Claude' });
      }
    });
  });

  apiReq.on('error', (e) => {
    console.error('[/analyze] Erreur réseau:', e.message);
    res.status(500).json({ error: 'Erreur réseau: ' + e.message });
  });
  apiReq.setTimeout(30000, () => {
    apiReq.destroy();
    res.status(500).json({ error: 'Timeout Claude API (30s)' });
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
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = String(username || '').trim();
  if (!user || !password) return res.status(400).json({ error: 'Identifiant et code d\'accès requis.' });

  const d = storage.getAccount(user);
  if (!d) return res.status(401).json({ error: '❌ Identifiant introuvable. Contacte l\'administrateur.' });
  if (!storage.verifyPassword(password, d.pass)) return res.status(401).json({ error: '❌ Code d\'accès incorrect.' });

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
  res.json({ ok: true });
});

// Activer / désactiver un compte
app.post('/api/admin/accounts/:username/toggle', adminMiddleware, (req, res) => {
  const d = storage.getAccount(req.params.username);
  if (!d) return res.status(404).json({ error: 'Compte introuvable.' });
  d.active = !d.active;
  storage.upsertAccount(d);
  res.json({ account: publicAccount(d.username, d) });
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
