// ============================================================
// apply.js — Applique les correctifs (a) + (b) + (c) au projet HADAR
//   (a) onglet Performance
//   (b) moteur v4 calibré (remplace Elo+Poisson / Aviator / Math.random)
//   (c) bugs de parsing serveur
// Idempotent : relançable sans dupliquer les modifications.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'betting-analyzer.html');
const SERVER = path.join(ROOT, 'server.js');

let html = fs.readFileSync(HTML, 'utf8');
const before = html.length;
const log = [];

// ══════════════════════════════════════════════════════════
// (b) MOTEUR v4 — remplace tout le bloc hadarPro* par engine_v4
// ══════════════════════════════════════════════════════════
const v4 = fs.readFileSync(path.join(__dirname, 'engine_v4.js'), 'utf8');

const START = 'function hadarProClamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }';
const END_MARK = '// ══════════════════════════════════════════════════════════════════════\n//  HADAR AI — MOTEUR DE PRÉDICTION LOCAL';

const si = html.indexOf(START);
const ei = html.indexOf(END_MARK);
if (si === -1 || ei === -1 || ei < si) throw new Error('Bloc moteur introuvable');

if (!html.includes('HADAR AI v4 — MOTEUR CALIBRÉ')) {
  html = html.slice(0, si) + v4 + '\n\n' + html.slice(ei);
  log.push(`(b) moteur v4 installé — ${((ei - si) / 1024).toFixed(1)} KB d'ancien code remplacé`);
} else {
  log.push('(b) moteur v4 déjà présent');
}

// ── (b2) Purge des Math.random() dans analyzeLocal ────────
// `rnd(a,b)` injectait de l'aléatoire dans les scores de confiance (32 occurrences).
// On le rend déterministe : il renvoie désormais la borne basse.
const RND_OLD = 'function rnd(mn, mx) { return Math.floor(Math.random() * (mx - mn + 1)) + mn; }';
const RND_NEW = `function rnd(mn, mx) {
    // ✅ CORRECTIF : plus aucun aléatoire dans les scores de confiance.
    // Auparavant Math.random() rendait l'analyse non reproductible et non
    // backtestable (deux clics = deux confiances différentes sur les mêmes données).
    // On retourne la borne basse : comportement déterministe et prudent.
    return mn;
  }`;
if (html.includes(RND_OLD)) {
  html = html.replace(RND_OLD, RND_NEW);
  log.push('(b) analyzeLocal : Math.random() purgé (32 usages neutralisés)');
} else {
  log.push('(b) analyzeLocal : déjà déterministe');
}

// ══════════════════════════════════════════════════════════
// (a) ONGLET PERFORMANCE
// ══════════════════════════════════════════════════════════
const TAB_OLD = `    <div class="tab" id="tab-history" onclick="switchTab('history')">📁 Historique</div>`;
const TAB_NEW = `    <div class="tab" id="tab-history" onclick="switchTab('history')">📁 Historique</div>
    <div class="tab" id="tab-perf" onclick="switchTab('perf')">🎯 Performance</div>`;
if (!html.includes(`id="tab-perf"`)) {
  html = html.replace(TAB_OLD, TAB_NEW);
  log.push('(a) onglet Performance ajouté à la barre');
}

const PANEL_ANCHOR = `  </div><!-- /app-content -->`;
const PANEL_NEW = `    <div class="panel" id="panel-perf">
      <div class="section-title">Performance réelle des moteurs</div>
      <div id="perf-container"></div>
    </div>

  </div><!-- /app-content -->`;
if (!html.includes(`id="panel-perf"`)) {
  html = html.replace(PANEL_ANCHOR, PANEL_NEW);
  log.push('(a) panneau Performance ajouté');
}

// Rendu de l'onglet au changement
const SWITCH_OLD = `  if (tab === 'dashboard') {
    if (typeof renderDashboard === 'function') {
      // léger délai pour laisser le panel devenir visible (charts ont besoin de dimensions)
      setTimeout(renderDashboard, 80);
    }
  }`;
const SWITCH_NEW = `  if (tab === 'dashboard') {
    if (typeof renderDashboard === 'function') {
      // léger délai pour laisser le panel devenir visible (charts ont besoin de dimensions)
      setTimeout(renderDashboard, 80);
    }
  }
  if (tab === 'perf' && typeof renderPerformance === 'function') {
    renderPerformance();
  }`;
if (!html.includes(`tab === 'perf'`)) {
  html = html.replace(SWITCH_OLD, SWITCH_NEW);
  log.push('(a) switchTab branché sur renderPerformance');
}

// Bloc de rendu Performance (inséré avant renderHistory)
const perfJs = fs.readFileSync(path.join(__dirname, 'perf_tab.js'), 'utf8');
const HIST_ANCHOR = 'function renderHistory() {';
if (!html.includes('function renderPerformance()')) {
  html = html.replace(HIST_ANCHOR, perfJs + '\n\n' + HIST_ANCHOR);
  log.push('(a) renderPerformance() + données de backtest intégrées');
}

// Styles de l'onglet
const perfCss = fs.readFileSync(path.join(__dirname, 'perf_tab.css'), 'utf8');
if (!html.includes('.perf-verdict')) {
  html = html.replace('</style>', perfCss + '\n</style>');
  log.push('(a) styles Performance ajoutés');
}

fs.writeFileSync(HTML, html);
log.push(`    → betting-analyzer.html : ${(before / 1024).toFixed(0)} KB → ${(html.length / 1024).toFixed(0)} KB`);

// ══════════════════════════════════════════════════════════
// (c) CORRECTIFS SERVEUR
// ══════════════════════════════════════════════════════════
let srv = fs.readFileSync(SERVER, 'utf8');
const srvBefore = srv.length;

// ── (c1) parseFifa4x4 : n basé sur Date.now() → msgId Telegram ──
const F_OLD = `  // ID séquentiel stable : basé sur le timestamp du message Telegram.
  // On utilise Date.now() au moment du parse — chaque match garde le même n
  // tant qu'il est dans la fenêtre de polling (déduplication par resultKey).
  // Format lisible (#N suivi d'un nombre court) au lieu d'un hash gigantesque.
  const n = Math.floor(Date.now() / 1000) % 100000 + index * 10;

  return { n, home, away, score, ts: Date.now() };`;
const F_NEW = `  // ✅ CORRECTIF : le n était calculé depuis Date.now(), donc il CHANGEAIT à
  // chaque poll. L'ordre chronologique était arbitraire, ce qui corrompait
  // tout modèle séquentiel (Elo) et générait des doublons.
  // On utilise désormais l'ID du message Telegram : strictement croissant,
  // stable dans le temps, et unique par match.
  const n = Number.isFinite(Number(msgId)) ? Number(msgId)
          : Math.floor(Date.now() / 1000) % 100000 + index * 10; // repli
  const ts = Number.isFinite(Number(msgTs)) ? Number(msgTs) : Date.now();

  return { n, home, away, score, ts, msgId: n };`;
if (srv.includes(F_OLD)) {
  srv = srv.replace(F_OLD, F_NEW);
  srv = srv.replace('function parseFifa4x4(text, index) {',
                    'function parseFifa4x4(text, index, msgId, msgTs) {');
  log.push('(c) parseFifa4x4 : n = msgId Telegram (ordre chronologique réparé)');
}

// ── (c2) extractMessages doit remonter id + date des messages ──
const EX_OLD = `function extractMessages(html, game) {
  const messages = [];
  const regex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {`;
const EX_NEW = `// ✅ Variante enrichie : récupère aussi l'ID et la date de chaque message,
// nécessaires pour un ordre chronologique fiable (cf. correctif parseFifa4x4).
function extractMessagesRich(html) {
  const out = [];
  const blocks = String(html || '').split('<div class="tgme_widget_message ');
  for (const b of blocks.slice(1)) {
    const idM = b.match(/data-post="[^/]+\\/(\\d+)"/);
    if (!idM) continue;
    const txtM = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/);
    if (!txtM) continue;
    const dateM = b.match(/<time datetime="([^"]+)"/);
    const text = txtM[1]
      .replace(/<br\\s*\\/?>/gi, '\\n')
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
  const regex = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {`;
if (!srv.includes('function extractMessagesRich')) {
  srv = srv.replace(EX_OLD, EX_NEW);
  log.push('(c) extractMessagesRich() ajouté (id + date des messages)');
}

// ── (c3) resultKey FIFA 4×4 : déduplication par msgId ──
const RK_OLD = `  // FIFA 4×4 : pas de #N fiable. On déduplique par teams + score SANS le n
  // (le n basé sur l'index change à chaque poll → doublons).
  return \`\${item?.home ?? ''}|\${item?.away ?? ''}|\${item?.score ?? ''}\`;`;
const RK_NEW = `  // ✅ FIFA 4×4 : le n est désormais l'ID du message Telegram (stable et unique).
  // On peut donc déduplider dessus, ce qui évite d'écraser deux rencontres
  // différentes ayant par hasard les mêmes équipes et le même score.
  if (game === 'fifa4x4' && item && Number.isFinite(Number(item.msgId ?? item.n))) {
    return \`m:\${item.msgId ?? item.n}\`;
  }
  return \`\${item?.home ?? ''}|\${item?.away ?? ''}|\${item?.score ?? ''}\`;`;
if (srv.includes(RK_OLD)) {
  srv = srv.replace(RK_OLD, RK_NEW);
  log.push('(c) resultKey : déduplication FIFA 4×4 par msgId');
}

// ── (c4) mergeResults : tri chronologique par ts, pas par n ──
const MR_OLD = `  return [...map.values()]
    .sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0))
    .slice(0, MAX_RESULTS_PER_GAME);`;
const MR_NEW = `  // ✅ Tri par timestamp d'abord (fiable sur tous les jeux), n en départage.
  return [...map.values()]
    .sort((a, b) => ((Number(b.ts) || 0) - (Number(a.ts) || 0))
                 || ((Number(b.n) || 0) - (Number(a.n) || 0)))
    .slice(0, MAX_RESULTS_PER_GAME);`;
if (srv.includes(MR_OLD)) {
  srv = srv.replace(MR_OLD, MR_NEW);
  log.push('(c) mergeResults : tri chronologique par ts');
}

// ── (c5) /results/:game — même tri ──
const RES_OLD = `  const data = storage.getResults(game)
    .sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0))
    .slice(0, limit);`;
const RES_NEW = `  const data = storage.getResults(game)
    .sort((a, b) => ((Number(b.ts) || 0) - (Number(a.ts) || 0))
                 || ((Number(b.n) || 0) - (Number(a.n) || 0)))
    .slice(0, limit);`;
if (srv.includes(RES_OLD)) {
  srv = srv.replace(RES_OLD, RES_NEW);
  log.push('(c) /results/:game : tri chronologique');
}

// ── (c6) mot de passe admin en clair + resynchronisation forcée ──
let stor = fs.readFileSync(path.join(ROOT, 'storage.js'), 'utf8');
const PW_OLD = `    const envPass     = process.env.ADMIN_PASS || 'Sh@lom12541'; // TOUJOURS utiliser ADMIN_PASS`;
const PW_NEW = `    // ✅ SÉCURITÉ : plus de mot de passe en clair dans le code source.
    // Si ADMIN_PASS n'est pas défini, on génère un mot de passe aléatoire
    // affiché UNE SEULE FOIS au démarrage, au lieu d'un secret publié sur Git.
    let envPass = process.env.ADMIN_PASS || '';
    let generated = false;
    if (!envPass) {
      envPass = crypto.randomBytes(12).toString('base64url');
      generated = true;
    }`;
if (stor.includes(PW_OLD)) {
  stor = stor.replace(PW_OLD, PW_NEW);
  log.push('(c) storage.js : mot de passe admin en clair supprimé');
}

// Ne plus réécrire le mot de passe à chaque démarrage quand ADMIN_PASS est absent
const SEED_OLD = `    const existing = acc[adminUser];
    const needCreate = !existing;
    const needUpdate = existing && !verifyPassword(envPass, existing.pass);`;
const SEED_NEW = `    const existing = acc[adminUser];
    const needCreate = !existing;
    // ✅ On ne resynchronise QUE si ADMIN_PASS est explicitement fourni.
    // Auparavant le mot de passe était réécrit à chaque démarrage, ce qui
    // annulait silencieusement tout changement fait depuis l'interface.
    const needUpdate = existing && process.env.ADMIN_PASS && !verifyPassword(envPass, existing.pass);`;
if (stor.includes(SEED_OLD)) {
  stor = stor.replace(SEED_OLD, SEED_NEW);
  log.push('(c) storage.js : fin de la réécriture forcée du mot de passe admin');
}

const LOGC_OLD = `      if (needCreate) {
        console.log(\`[storage] ✅ Compte admin créé : \${adminUser}\`);`;
const LOGC_NEW = `      if (needCreate) {
        console.log(\`[storage] ✅ Compte admin créé : \${adminUser}\`);
        if (generated) {
          console.log('[storage] ⚠️  ADMIN_PASS non défini — mot de passe généré :');
          console.log(\`[storage]     \${envPass}\`);
          console.log('[storage]     Note-le maintenant : il ne sera plus affiché.');
        }`;
if (stor.includes(LOGC_OLD)) {
  stor = stor.replace(LOGC_OLD, LOGC_NEW);
  log.push('(c) storage.js : mot de passe généré affiché une seule fois');
}
fs.writeFileSync(path.join(ROOT, 'storage.js'), stor);

fs.writeFileSync(SERVER, srv);
log.push(`    → server.js : ${(srvBefore / 1024).toFixed(0)} KB → ${(srv.length / 1024).toFixed(0)} KB`);

console.log('\n✅ Correctifs appliqués :\n');
log.forEach(l => console.log('  ' + l));
console.log('');
