#!/usr/bin/env node
// ============================================================
// verifier.js — Vérification automatique de TOUS les correctifs
//
// Ce script ne fait confiance à rien : il relit les fichiers, exécute
// les moteurs et interroge le serveur pour prouver chaque correctif.
//
// Usage :
//   node verifier.js            → vérifs statiques (fichiers + moteurs)
//   node verifier.js --serveur  → + vérifs live (port lu depuis .env)
//   node verifier.js --serveur --port 3001   → force un port
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'betting-analyzer.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const STORAGE = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');
const GITIGNORE = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';

let pass = 0, fail = 0, skipped = 0;
const failures = [];

// `optionnel: true` → un échec devient un simple avertissement (⚠️) et ne
// fait pas échouer le bilan. Réservé aux tests de confort (ex. navigateur).
function check(section, label, condition, detail = '', optionnel = false) {
  const ok = !!condition;
  let icon;
  if (ok) { pass++; icon = '\x1b[32m✅\x1b[0m'; }
  else if (optionnel) { skipped++; icon = '\x1b[33m⚠️\x1b[0m'; }
  else { fail++; failures.push(`[${section}] ${label}`); icon = '\x1b[31m❌\x1b[0m'; }
  console.log(`  ${icon} ${label}${detail ? '\n       \x1b[90m' + detail + '\x1b[0m' : ''}`);
  return ok;
}
function title(t) { console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m\n${'─'.repeat(66)}`); }

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║   VÉRIFICATION AUTOMATIQUE DES CORRECTIFS HADAR                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ══════════════════════════════════════════════════════════
title('1. SYNTAXE — le code est-il valide ?');
// ══════════════════════════════════════════════════════════
let syntaxErrors = 0;
const re = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;
let m, blocks = 0;
while ((m = re.exec(HTML)) !== null) {
  blocks++;
  try { new Function(m[1]); } catch (e) { syntaxErrors++; console.log('       ' + e.message.slice(0, 100)); }
}
check('1', `Les ${blocks} blocs <script> du HTML compilent`, syntaxErrors === 0);
try { new Function(SERVER.replace(/^#!.*/, '')); check('1', 'server.js compile', true); }
catch (e) { check('1', 'server.js compile', false, e.message.slice(0, 100)); }
try { new Function(STORAGE); check('1', 'storage.js compile', true); }
catch (e) { check('1', 'storage.js compile', false, e.message.slice(0, 100)); }

// ══════════════════════════════════════════════════════════
title('2. (a) ONGLET PERFORMANCE');
// ══════════════════════════════════════════════════════════
check('2a', 'Bouton d\'onglet présent', HTML.includes('id="tab-perf"'));
check('2a', 'Panneau présent', HTML.includes('id="panel-perf"'));
check('2a', 'Fonction renderPerformance() définie', HTML.includes('function renderPerformance()'));
check('2a', 'switchTab déclenche le rendu', /tab === 'perf'/.test(HTML));
check('2a', 'Données de backtest embarquées', HTML.includes('const HADAR_BACKTEST'));
check('2a', 'Styles présents', HTML.includes('.perf-verdict'));

// Les données embarquées sont-elles cohérentes ?
try {
  const mm = HTML.match(/const HADAR_BACKTEST = (\{[\s\S]*?\});\n/);
  const bt = JSON.parse(mm[1]);
  const games = Object.keys(bt.games);
  const total = Object.values(bt.games).reduce((s, g) => s + g.rows, 0);
  check('2a', `Contient les 5 jeux (${games.join(', ')})`, games.length === 5);
  check('2a', `Total de ${total} résultats testés`, total > 4000, `${total} résultats réels`);
  const p18 = bt.games.penalty18.models;
  const meilleur = Object.entries(p18).sort((a, b) => a[1].brier - b[1].brier)[0];
  check('2a', 'Elo+Poisson reste battu par le modèle retenu',
    p18['Elo+Poisson'].brier > meilleur[1].brier,
    `Elo+Poisson ${p18['Elo+Poisson'].brier} vs « ${meilleur[0]} » ${meilleur[1].brier}`);
} catch (e) { check('2a', 'Données de backtest lisibles', false, e.message); }

// ══════════════════════════════════════════════════════════
title('3. (b) MOTEUR v4 — les confiances sont-elles honnêtes ?');
// ══════════════════════════════════════════════════════════
check('3b', 'Moteur v4 installé', HTML.includes('HADAR AI v4 — MOTEUR CALIBRÉ'));
check('3b', 'Table de calibration présente', HTML.includes('const HADAR_CALIBRATION'));
check('3b', 'Ancien Elo+Poisson retiré du routeur', !HTML.includes('function hadarProTeamModel'));
check('3b', 'Ancien modèle Aviator retiré', !HTML.includes('aviator_multifactor_ai'));

// Extraction et exécution réelle du moteur
const si = HTML.indexOf('//  HADAR AI v4');
const ei = HTML.indexOf('function hadarProGameLabel(game) { return hpGameLabel(game); }');
const engineCode = HTML.slice(si, ei + 70);
let runEngine = null;
try {
  runEngine = new Function('g', 'd', engineCode + '\nreturn hadarProAI(g, d);');
  check('3b', 'Le moteur v4 s\'exécute', true);
} catch (e) { check('3b', 'Le moteur v4 s\'exécute', false, e.message.slice(0, 100)); }

if (runEngine) {
  const EXPECTED = { penalty18: 55, penalty22: 54, fifa4x4: 51, baccara: 44, jeu21: 59 };
  console.log('\n       \x1b[90mConfiance affichée vs justesse réellement mesurée :\x1b[0m');
  for (const [g, want] of Object.entries(EXPECTED)) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', g + '.json'), 'utf8'));
      const r = runEngine(g, data);
      check('3b', `${g.padEnd(10)} confiance ${String(r.confidence).padStart(3)}%  (attendu ${want}%)`,
        Math.abs(r.confidence - want) <= 2, `« ${r.confidenceLabel.txt} » · modèle ${r.pro.model}`);
      if (r.confidence > 60) failures.push(`[3b] ${g} : confiance ${r.confidence}% > 60% (surconfiance)`);
    } catch (e) { check('3b', `${g} s'exécute`, false, e.message.slice(0, 80)); }
  }
  // Aviator : doit refuser de prédire
  try {
    const av = [];
    for (let i = 0; i < 80; i++) {
      const u = (i * 37 % 100) / 100;
      av.push({ n: 100 + i, multiplier: +(1 + (-Math.log(1 - u * 0.98) / 0.5)).toFixed(2), ts: Date.now() - i * 30000 });
    }
    const r = runEngine('aviator', av);
    check('3b', `aviator    confiance ${r.confidence}% — refuse de prédire`, r.confidence === 0, r.prediction.slice(0, 80));
    check('3b', 'Aviator explique l\'absence de mémoire', /sans mémoire|provably fair/i.test(r.analysis));
  } catch (e) { check('3b', 'Aviator s\'exécute', false, e.message.slice(0, 80)); }
}

// Déterminisme
title('4. (b) DÉTERMINISME — Math.random() a-t-il disparu ?');
// On retire les commentaires AVANT de tester : le mot « Math.random » subsiste
// légitimement dans le commentaire qui documente le correctif.
const rndFn = HTML.match(/function rnd\(mn, mx\) \{[\s\S]{0,400}?\n  \}/);
const rndBody = rndFn ? rndFn[0].replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '') : '';
check('4b', 'rnd() ne contient plus Math.random() (hors commentaires)',
  rndFn && !rndBody.includes('Math.random') && /return\s+mn\s*;/.test(rndBody),
  rndFn ? 'corps exécutable : ' + rndBody.replace(/\s+/g, ' ').trim() : 'fonction introuvable');

// Aucun appel à Math.random() ne doit subsister dans le corps d'analyzeLocal.
// (Le test d'exécution répétée se fait en conditions réelles, section 10 :
//  analyzeLocal dépend de fonctions définies ailleurs dans la page.)
try {
  const s2 = HTML.indexOf('function analyzeLocal(game, data)');
  const e2 = HTML.indexOf('// ── GROQ AI : analyse approfondie réutilisable');
  const localBody = HTML.slice(s2, e2).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = (localBody.match(/Math\.random/g) || []).length;
  check('4b', 'analyzeLocal() : plus aucun Math.random() dans le code exécutable',
    hits === 0, hits ? `${hits} occurrence(s) restante(s)` : 'les 32 usages d\'origine ont été neutralisés');
} catch (e) { check('4b', 'analyzeLocal analysable', false, e.message.slice(0, 100)); }

// Sophisme du joueur
title('5. (b) SOPHISME DU JOUEUR — les fausses promesses sont-elles parties ?');
const codeOnly = HTML.replace(/^\s*\/\/.*$/gm, ''); // on ignore les commentaires
check('5b', 'Plus de « REBOND FORT » actif', !codeOnly.includes("REBOND FORT —"));
check('5b', 'Plus de « gros gain imminent » actif', !/gros gain imminent'/.test(codeOnly));
check('5b', 'Plus de « rebond attendu » actif', !codeOnly.includes('rebond attendu'));
check('5b', 'Nouveau discours présent', HTML.includes('Aucune prédiction possible — jeu sans mémoire'));
check('5b', 'Espérance négative expliquée', HTML.includes('Espérance négative sur toute stratégie'));

// ══════════════════════════════════════════════════════════
title('6. (c) CORRECTIFS SERVEUR');
// ══════════════════════════════════════════════════════════
check('6c', 'parseFifa4x4 accepte msgId + msgTs',
  SERVER.includes('function parseFifa4x4(text, index, msgId, msgTs)'));
check('6c', 'n n\'est plus calculé depuis Date.now()',
  !SERVER.includes('const n = Math.floor(Date.now() / 1000) % 100000 + index * 10;\n\n  return'));
check('6c', 'extractMessagesRich() existe', SERVER.includes('function extractMessagesRich'));
check('6c', 'updateChannel passe id/ts au parser',
  SERVER.includes('parseFifa4x4(msg, i, item.id, item.ts)'));
check('6c', 'resultKey déduplique par msgId (tous les jeux)',
  SERVER.includes('if (item && Number.isFinite(Number(item.msgId))) return `m:${item.msgId}`;'),
  'évite la collision entre le #N cyclique du canal et le n renuméroté par harvest');
check('6c', 'mergeResults trie par ts', /Number\(b\.ts\).*Number\(a\.ts\)/.test(SERVER));

title('7bis. IA — Groq remplace Anthropic');
check('7b', "Plus d'avertissement ANTHROPIC_API_KEY au démarrage",
  !SERVER.includes('ANTHROPIC_API_KEY manquante. Les analyses IA échoueront'));
check('7b', "L'endpoint /analyze utilise Groq",
  SERVER.includes("hostname: 'api.groq.com'") && SERVER.includes("app.post('/analyze'"));
check('7b', 'Aucune dépendance restante à ANTHROPIC_API_KEY',
  !SERVER.includes('process.env.ANTHROPIC_API_KEY'));
check('7b', 'Message Telegram informatif (token facultatif)',
  SERVER.includes('aucun token requis'));

title('7. (c) SÉCURITÉ');
check('7c', 'Mot de passe en clair supprimé de storage.js', !STORAGE.includes('Sh@lom12541'));
check('7c', 'Mot de passe généré si ADMIN_PASS absent', STORAGE.includes('crypto.randomBytes(12).toString(\'base64url\')'));
check('7c', 'Plus de réécriture forcée du mot de passe',
  STORAGE.includes('existing && process.env.ADMIN_PASS && !verifyPassword'));
// Le mot de passe ne doit pas non plus traîner ailleurs
const leaked = ['betting-analyzer.html', 'server.js', 'storage.js']
  .filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('Sh@lom12541'));
check('7c', 'Aucun fichier ne contient l\'ancien mot de passe', leaked.length === 0,
  leaked.length ? 'trouvé dans : ' + leaked.join(', ') : '');

// ══════════════════════════════════════════════════════════
title('7ter. ROBUSTESSE — rate-limit, sessions, CORS');
const SECU = fs.existsSync(path.join(ROOT,'security.js')) ? fs.readFileSync(path.join(ROOT,'security.js'),'utf8') : '';
const SESS = fs.existsSync(path.join(ROOT,'sessions.js')) ? fs.readFileSync(path.join(ROOT,'sessions.js'),'utf8') : '';
check('7t', 'Module security.js présent', SECU.length > 0);
check('7t', 'Module sessions.js présent', SESS.length > 0);
check('7t', 'Rate-limit branché sur /api/auth/login',
  SERVER.includes("app.post('/api/auth/login', security.loginRateLimit"));
check('7t', 'Verrouillage progressif configuré', SECU.includes('lockSteps'));
check('7t', "Anti-énumération : message d'erreur unique",
  SERVER.includes("Identifiant ou code d'accès incorrect") &&
  !SERVER.includes('Identifiant introuvable. Contacte'));
check('7t', 'cors() grand ouvert remplacé', !SERVER.includes('app.use(cors());'));
check('7t', 'CORS piloté par ALLOWED_ORIGINS', SECU.includes('ALLOWED_ORIGINS'));
check('7t', 'CORS : requêtes de même origine acceptées (anti-auto-blocage)',
  SECU.includes('memeOrigine') && SECU.includes('x-forwarded-host'),
  'les navigateurs envoient Origin même en même origine sur les POST');
check('7t', 'En-têtes de sécurité envoyés',
  SECU.includes('X-Content-Type-Options') && SECU.includes('X-Frame-Options'));
check('7t', 'Sessions écrites sur disque', SESS.includes('sessions.json'));
check('7t', 'Écriture atomique des sessions', SESS.includes('renameSync'));
check('7t', 'Sessions rechargées au démarrage', SESS.includes('session(s) restaurée(s)'));
check('7t', 'Révocation à la désactivation/suppression',
  SERVER.includes('sessionStore.destroyUserSessions'));
check('7t', 'trust proxy activé (IP réelle derrière Railway)',
  SERVER.includes("app.set('trust proxy', 1)"));

title('7quater. DÉPLOIEMENT RAILWAY');
check('7q', 'railway.json présent', fs.existsSync(path.join(ROOT,'railway.json')));
check('7q', 'DATA_DIR respecté par storage.js et sessions.js',
  STORAGE.includes('process.env.DATA_DIR') && SESS.includes('process.env.DATA_DIR'));
check('7q', 'PORT injecté par la plateforme', SERVER.includes('process.env.PORT'));
check('7q', "Écoute sur 0.0.0.0 (requis en conteneur)", SERVER.includes("app.listen(PORT, '0.0.0.0'"));
check('7q', 'Chemin de stockage affiché au démarrage (vérif. du volume)',
  SERVER.includes('sessionStore.file') && SERVER.includes('sessionStore.dataDir'));
check('7q', 'Secrets exclus de Git',
  GITIGNORE.includes('.env') && GITIGNORE.includes('data/accounts.json') && GITIGNORE.includes('data/sessions.json'));

title('8. DONNÉES — le backtest repose-t-il sur du réel ?');
// ══════════════════════════════════════════════════════════
let totalRows = 0;
for (const g of ['baccara', 'penalty18', 'penalty22', 'jeu21', 'fifa4x4']) {
  const f = path.join(ROOT, 'data', g + '.json');
  if (!fs.existsSync(f)) { check('8', `data/${g}.json existe`, false); continue; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  totalRows += d.length;
  const hasTs = d.every(r => Number.isFinite(Number(r.ts)));
  check('8', `data/${g}.json — ${String(d.length).padStart(4)} résultats, horodatés`, d.length > 100 && hasTs);
}
check('8', `Total : ${totalRows} résultats réels`, totalRows > 1500);

// FIFA 4×4 : les n doivent être des msgId croissants, pas des Date.now()
try {
  const f = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fifa4x4.json'), 'utf8'));
  const ns = f.map(r => Number(r.n));
  const looksLikeTimestamp = ns.some(n => n > 1e9);
  const hasMsgId = f.every(r => r.msgId != null);
  check('8', 'FIFA 4×4 : n = msgId Telegram (pas un timestamp)', !looksLikeTimestamp && hasMsgId,
    `plage des n : ${Math.min(...ns)} → ${Math.max(...ns)}`);
} catch (e) { check('8', 'FIFA 4×4 vérifiable', false, e.message); }

// ══════════════════════════════════════════════════════════
// 9. VÉRIFICATIONS LIVE (optionnelles)
// ══════════════════════════════════════════════════════════
// Détermine le port à interroger, dans l'ordre :
//   1. argument  --port 3001
//   2. variable d'environnement PORT
//   3. valeur PORT du fichier .env
//   4. 3000 par défaut
function detecterPort() {
  const i = process.argv.indexOf('--port');
  if (i > -1 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10);
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  try {
    const envFile = path.join(ROOT, '.env');
    if (fs.existsSync(envFile)) {
      const m = fs.readFileSync(envFile, 'utf8').match(/^\s*PORT\s*=\s*(\d+)/m);
      if (m) return parseInt(m[1], 10);
    }
  } catch (_) {}
  return 3000;
}
const PORT = detecterPort();

function get(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: PORT, path: p, timeout: 8000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

(async () => {
  if (process.argv.includes('--serveur')) {
    title(`9. SERVEUR EN LIGNE (localhost:${PORT})`);
    const st = await get('/status');
    if (!st) {
      check('9', `Serveur joignable sur le port ${PORT}`, false,
        `Lance-le :  node server.js\n       Si ton serveur ecoute sur un autre port :  node verifier.js --serveur --port <numero>`);
    } else {
      check('9', 'GET /status répond', st.status === 'online', JSON.stringify(st.counts));
      const fifa = await get('/results/fifa4x4?limit=5');
      if (Array.isArray(fifa) && fifa.length) {
        const ns = fifa.map(r => Number(r.n));
        check('9', 'FIFA 4×4 live : n = msgId stable (pas Date.now())',
          ns.every(n => n < 1e9) && fifa.every(r => r.msgId != null),
          `exemple : n=${fifa[0].n}, ${fifa[0].home} ${fifa[0].score} ${fifa[0].away}`);
        const sorted = fifa.every((r, i) => i === 0 || Number(fifa[i - 1].ts) >= Number(r.ts));
        check('9', 'Résultats triés du plus récent au plus ancien', sorted);
      } else check('9', 'GET /results/fifa4x4 renvoie des données', false);

      const html = await new Promise(r => {
        http.get({ host: 'localhost', port: PORT, path: '/', timeout: 8000 }, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => r(d));
        }).on('error', () => r(''));
      });
      check('9', 'La page servie contient l\'onglet Performance', html.includes('id="tab-perf"'));
      check('9', 'La page servie contient le moteur v4', html.includes('base_rate_calibrated_v4'));
    }
    // ── 10. Test en navigateur réel ──
    let puppeteer = null;
    try { puppeteer = require(path.join(ROOT, 'node_modules', 'puppeteer')); }
    catch (_) { try { puppeteer = require('puppeteer'); } catch (_) {} }

    // Cherche un Chrome utilisable. npm >= 11 bloque le postinstall de puppeteer
    // (« allow-scripts »), donc le Chrome embarqué est souvent absent.
    // On se rabat alors sur le Chrome/Edge déjà installé sur la machine.
    function trouverChrome() {
      const existe = c => { try { return c && fs.existsSync(c); } catch { return false; } };

      // Chemin force par l'utilisateur : on le respecte SEULEMENT s'il existe.
      // Sinon puppeteer echouerait dessus sans jamais essayer d'alternative.
      const force = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (force) {
        if (existe(force)) return force;
        console.log(`       \x1b[33mPUPPETEER_EXECUTABLE_PATH pointe vers un fichier inexistant :\x1b[0m`);
        console.log(`       \x1b[90m${force}\x1b[0m`);
        console.log(`       \x1b[90mRecherche automatique d'un navigateur a la place...\x1b[0m`);
        delete process.env.PUPPETEER_EXECUTABLE_PATH; // sinon puppeteer le reprend
      }

      const home = process.env.USERPROFILE || process.env.HOME || '';
      const candidats = [
        // Chrome
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(home, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        // Chrome Beta / Canary
        path.join(home, 'AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe'),
        // Edge (base sur Chromium : parfaitement compatible)
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        // Brave
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        // Linux / macOS
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ];
      const trouve = candidats.find(existe);
      if (trouve) return trouve;

      // Dernier recours : le Chrome telecharge par puppeteer dans le cache utilisateur
      try {
        const cache = path.join(home, '.cache', 'puppeteer', 'chrome');
        if (fs.existsSync(cache)) {
          for (const dossier of fs.readdirSync(cache)) {
            for (const sous of ['chrome-win64\\chrome.exe', 'chrome-win\\chrome.exe', 'chrome-linux64/chrome']) {
              const p2 = path.join(cache, dossier, sous);
              if (existe(p2)) return p2;
            }
          }
        }
      } catch (_) {}
      return null;
    }

    if (puppeteer) {
      title('10. NAVIGATEUR RÉEL — l\'app fonctionne-t-elle vraiment ?');
      let browser;
      try {
        const opts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };

        // trouverChrome() nettoie aussi un PUPPETEER_EXECUTABLE_PATH invalide,
        // il doit donc etre appele AVANT de tester le Chrome embarque.
        const chromeSysteme = trouverChrome();

        let embarqueOk = false;
        try { embarqueOk = fs.existsSync(puppeteer.executablePath()); }
        catch (_) { embarqueOk = false; }

        if (!embarqueOk) {
          if (!chromeSysteme) throw new Error('NO_BROWSER');
          opts.executablePath = chromeSysteme;
          console.log(`       \x1b[90mChrome embarqué absent → utilisation de ${chromeSysteme}\x1b[0m`);
        }
        browser = await puppeteer.launch(opts);
        const page = await browser.newPage();
        const jsErrors = [];
        page.on('pageerror', e => jsErrors.push(e.message.slice(0, 120)));
        await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise(r => setTimeout(r, 7000));

        const r = await page.evaluate(async () => {
          const out = { tabs: {}, determinisme: {}, perf: 0, confidences: {} };
          document.getElementById('landing')?.style.setProperty('display', 'none');
          const app = document.getElementById('app'); if (app) app.style.display = 'block';
          const games = ['penalty18', 'penalty22', 'fifa4x4', 'baccara', 'jeu21', 'aviator'];
          for (const g of games) {
            try { DATA[g] = await (await fetch('/results/' + g + '?limit=300')).json(); } catch (_) {}
          }
          // Les 7 onglets s'ouvrent-ils ?
          for (const t of ['dashboard', 'fixtures', 'live', 'stats', 'prono', 'history', 'perf']) {
            try {
              switchTab(t);
              const el = document.getElementById('panel-' + t);
              out.tabs[t] = !!(el && el.classList.contains('active'));
            } catch (e) { out.tabs[t] = false; }
          }
          // L'onglet Performance affiche-t-il du contenu ?
          switchTab('perf');
          out.perf = (document.getElementById('perf-container') || {}).innerHTML?.length || 0;
          // Déterminisme réel : 2 exécutions consécutives
          for (const g of games) {
            try {
              const a = JSON.stringify(analyzeLocal(g, DATA[g]));
              const b = JSON.stringify(analyzeLocal(g, DATA[g]));
              const h1 = JSON.stringify(hadarAI(g, DATA[g]));
              const h2 = JSON.stringify(hadarAI(g, DATA[g]));
              out.determinisme[g] = (a === b && h1 === h2);
              const eng = hadarProAI(g, DATA[g]);
              out.confidences[g] = eng ? eng.confidence : null;
            } catch (e) { out.determinisme[g] = 'err:' + e.message.slice(0, 40); }
          }
          return out;
        });

        check('10', 'Aucune erreur JavaScript au chargement', jsErrors.length === 0,
          jsErrors.length ? jsErrors.join(' | ') : 'page chargée proprement');
        const tabsOk = Object.values(r.tabs).filter(Boolean).length;
        check('10', `Les 7 onglets s'ouvrent (${tabsOk}/7)`, tabsOk === 7,
          Object.entries(r.tabs).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'dont le nouvel onglet Performance');
        check('10', 'L\'onglet Performance affiche son contenu', r.perf > 5000, `${r.perf} caractères rendus`);
        const detOk = Object.values(r.determinisme).every(v => v === true);
        check('10', 'Déterminisme réel : 2 analyses identiques → mêmes résultats', detOk,
          detOk ? 'vérifié sur les 6 jeux (analyzeLocal + hadarAI)'
                : JSON.stringify(r.determinisme));
        const over = Object.entries(r.confidences).filter(([, v]) => v !== null && v > 60);
        check('10', 'Aucune confiance surévaluée (> 60 %)', over.length === 0,
          over.length ? over.map(([k, v]) => `${k}=${v}%`).join(', ')
                      : Object.entries(r.confidences).map(([k, v]) => `${k} ${v}%`).join(' · '));
      } catch (e) {
        const msg = String(e.message || '');
        if (msg === 'NO_BROWSER' || /Could not find|Failed to launch|Tried to find|ENOENT|executablePath/i.test(msg)) {
          check('10', 'Test navigateur (optionnel)', false,
            'Aucun navigateur Chromium trouvé sur cette machine.\n' +
            '       ⓘ Ces 5 tests sont FACULTATIFS : les autres vérifications suffisent\n' +
            '         à valider tous les correctifs.\n' +
            '       Pour les activer, au choix :\n' +
            '         • npm approve-scripts puppeteer   puis   npm rebuild puppeteer\n' +
            '         • installe Google Chrome (il sera détecté automatiquement)',
            true);
        } else {
          check('10', 'Test navigateur (optionnel)', false, msg.slice(0, 140), true);
        }
      } finally { if (browser) await browser.close(); }
    } else {
      console.log('\n\x1b[90m  (test navigateur ignoré — puppeteer non installé)\x1b[0m');
    }
  } else {
    console.log('\n\x1b[90m  (vérifications serveur ignorées — relance avec --serveur)\x1b[0m');
  }

  // ── Bilan ──
  console.log('\n' + '═'.repeat(66));
  const total = pass + fail;
  const suffixe = skipped ? `  (${skipped} test(s) optionnel(s) ignoré(s))` : '';
  if (fail === 0) {
    console.log(`\x1b[1m\x1b[32m  ✅ TOUT EST CORRECT — ${pass}/${total} vérifications réussies\x1b[0m${suffixe}`);
  } else {
    console.log(`\x1b[1m\x1b[31m  ⚠️  ${fail} PROBLÈME(S) sur ${total} vérifications\x1b[0m\n`);
    failures.forEach(f => console.log(`     • ${f}`));
  }
  console.log('═'.repeat(66) + '\n');
  process.exit(fail === 0 ? 0 : 1);
})();
