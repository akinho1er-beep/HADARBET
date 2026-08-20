// ============================================================
// harvest.js — Collecte d'historique réel depuis les canaux Telegram
// Pagination via ?before=<msgId> pour remonter loin dans le passé.
// Sortie : data/<game>.json  (format identique à storage.js)
//
// Usage : node tools/harvest.js [pages]
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

const CHANNELS = {
  baccara:   'statistika_baccara',
  penalty18: 'statistika_fifa_penalty_fast',
  penalty22: 'statistika_fifa_penalty_fast2022',
  jeu21:     'statistika_21f',
  fifa4x4:   'statistika_fifa_4x4',
};

const OUT_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function fetchPage(username, before) {
  const p = `/s/${username}` + (before ? `?before=${before}` : '');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 't.me', path: p, method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      }
    }, res => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Extrait { id, text, date } de chaque message (l'id permet la pagination)
function extractMessages(html) {
  const out = [];
  // Chaque message est un wrapper avec data-post="channel/12345"
  const blocks = html.split('<div class="tgme_widget_message ');
  for (const b of blocks.slice(1)) {
    const idM = b.match(/data-post="[^/]+\/(\d+)"/);
    if (!idM) continue;
    const id = parseInt(idM[1]);
    const txtM = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const dateM = b.match(/<time datetime="([^"]+)"/);
    if (!txtM) continue;
    const text = txtM[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .trim();
    out.push({ id, text, date: dateM ? dateM[1] : null });
  }
  return out;
}

// ── Parsers (repris de server.js, mais avec ts = date réelle du message) ──
function parseBaccara(text, ts) {
  const m = text.match(/#N(\d+)[.\s]+(\d+)\([^)]*\)\s*[-–]\s*(\d+)\([^)]*\)(?:\s*#T(\d+))?(\s*#R)?/);
  if (!m) return null;
  const p = parseInt(m[2]), b = parseInt(m[3]);
  return { n: parseInt(m[1]), player: p, banker: b, playerScore: p, bankerScore: b,
           total: m[4] ? parseInt(m[4]) : p + b, natural: !!m[5], ts };
}
function parsePenalty(text, ts) {
  const m = text.match(/#N(\d+)\s+(.+?)\s+\((\d+):(\d+)\)\s+(.+)/);
  if (!m) return null;
  return { n: parseInt(m[1]), home: m[2].trim(), away: m[5].trim(),
           score: `${m[3]}:${m[4]}`, ts };
}
function parseJeu21(text, ts) {
  const m = text.match(/#N(\d+)[.\s]+(\d+)\([^)]*\)\s*[-–]\s*(\d+)\([^)]*\)(?:\s*#T(\d+))?(?:\s*\[?#[OX])?/);
  if (!m) return null;
  const player = parseInt(m[2]), dealer = parseInt(m[3]);
  const flagX = /#X\b/.test(text);
  let result;
  if (flagX) result = 'PUSH';
  else if (dealer > 21) result = 'WIN';
  else if (player > 21) result = 'LOSE';
  else if (player > dealer) result = 'WIN';
  else if (player < dealer) result = 'LOSE';
  else result = 'PUSH';
  return { n: parseInt(m[1]), player, dealer, result, ts };
}
function parseFifa4x4(text, ts, msgId) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let teamLine = '', scoreLine = '';
  for (const line of lines) {
    if (line.startsWith('#') && line.includes('_')) teamLine = line;
    if (/^\d+:\d+\s*\(/.test(line)) scoreLine = line;
  }
  if (!scoreLine) for (const line of lines) {
    if (/\d+:\d+/.test(line) && line.includes('#T')) { scoreLine = line; break; }
  }
  if (!scoreLine) return null;
  const sm = scoreLine.match(/(\d+):(\d+)/);
  if (!sm) return null;
  let home = '—', away = '—';
  if (teamLine) {
    const cleaned = teamLine.replace(/^#/, '').split('⏰')[0].trim();
    const t = cleaned.split('_');
    if (t.length >= 2) { home = t[0].trim(); away = t.slice(1).join(' ').trim(); }
  }
  // ✅ CORRECTIF vs server.js : n = id du message Telegram (chronologique STABLE)
  // au lieu de Date.now() % 100000 + index*10 qui change à chaque poll.
  // ✅ Un match FIFA 4×4 est TERMINÉ quand les deux mi-temps sont publiées :
  // « 12:3 (8:2 4:1) » = 2 groupes entre parenthèses. Un seul groupe
  // (« 5:4 (5:4) ») = match encore en cours, score partiel.
  // Le canal édite ensuite le message avec le score final ; mergeResults
  // remplace alors cette entrée par la version définitive.
  const mts = (String(text).match(/\((\s*\d+\s*:\s*\d+[\s\d:]*)\)/) || [])[1] || '';
  const enCours = (mts.match(/\d+\s*:\s*\d+/g) || []).length < 2;
  return { n: msgId, home, away, score: `${sm[1]}:${sm[2]}`, ts, msgId, live: enCours || undefined };
}

const PARSERS = {
  baccara: parseBaccara, penalty18: parsePenalty, penalty22: parsePenalty,
  jeu21: parseJeu21, fifa4x4: parseFifa4x4,
};

async function harvest(game, maxPages) {
  const username = CHANNELS[game];
  const parser = PARSERS[game];
  const seen = new Map();
  let before = null;
  let emptyStreak = 0;

  // ✅ ACCUMULATION : on repart de l'historique déjà collecté au lieu de
  // l'écraser. Telegram ne conserve qu'une fenêtre glissante de messages ;
  // sans cette fusion, chaque exécution se limitait à ce que le canal
  // expose au moment T, et l'historique ne grossissait jamais.
  const existingFile = path.join(OUT_DIR, `${game}.json`);
  if (fs.existsSync(existingFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(existingFile, 'utf8'));
      prev.forEach(r => {
        const id = r.msgId ?? r.n;
        if (id != null) seen.set(`m:${id}`, r);
      });
      if (seen.size) console.log(`   ${game}: ${seen.size} résultats déjà en base, on complète…`);
    } catch (_) {}
  }

  for (let page = 0; page < maxPages; page++) {
    let html;
    try { html = await fetchPage(username, before); }
    catch (e) { console.log(`   ⚠️  ${game} page ${page}: ${e.message}`); break; }

    const msgs = extractMessages(html);
    if (!msgs.length) { if (++emptyStreak >= 2) break; continue; }
    emptyStreak = 0;

    let added = 0;
    for (const m of msgs) {
      const ts = m.date ? Date.parse(m.date) : Date.now();
      const r = parser(m.text, ts, m.id);
      if (!r) continue;
      // ✅ CORRECTIF : déduplication par ID de message Telegram pour TOUS les jeux.
      // Le compteur #N des canaux se réinitialise périodiquement (observé sur
      // penalty22 : #N288 → #N1). Dédupliquer par #N faisait donc disparaître
      // les nouveaux matchs qui réutilisaient un numéro déjà vu, bloquant
      // l'historique à la taille d'un seul cycle. Le msgId, lui, est unique
      // et strictement croissant.
      const key = `m:${m.id}`;
      // `n` garde le VRAI #N publié par le canal (celui que voit l'utilisateur
      // chez le bookmaker). `msgId` sert d'identifiant unique et chronologique.
      r.msgId = m.id;
      // ✅ Les canaux ÉDITENT leurs messages : un match publié en direct
      // (score partiel) est mis à jour avec le score final. On remplace donc
      // systématiquement la version connue par la plus récemment lue, sinon
      // la base conserve un score de mi-match qui ne correspond plus à rien.
      if (!seen.has(key)) added++;
      seen.set(key, r);
    }
    const minId = Math.min(...msgs.map(m => m.id));
    process.stdout.write(`\r   ${game}: page ${page + 1}/${maxPages} · ${seen.size} résultats (+${added})   `);
    if (before !== null && minId >= before) break; // plus rien à remonter
    before = minId;
    await new Promise(r => setTimeout(r, 350)); // politesse
  }
  console.log('');

  // Tri du plus récent au plus ancien, par ID de message (chronologique fiable).
  // On NE trie PAS par #N : il se réinitialise et mélangerait les cycles.
  const rows = [...seen.values()].sort((a, b) => (b.msgId - a.msgId) || (b.ts - a.ts));
  // ✅ CORRECTIF : on NE renumérote PLUS `n`.
  // Auparavant `n` était remplacé par un index 1..N, si bien que l'application
  // affichait « #N142 » alors que le canal (et le bookmaker) en étaient à
  // « #N264 ». Le numéro affiché ne correspondait donc à rien de vérifiable.
  // `n` conserve désormais le VRAI #N publié par le canal.
  // L'ordre chronologique des modèles s'appuie sur `seq` (index interne) et
  // sur `msgId`/`ts`, jamais sur `n` — voir tools/engine.js et backtest.js.
  const total = rows.length;
  rows.forEach((r, i) => {
    delete r.cycleN;          // champ devenu inutile
    r.seq = total - i;        // index chronologique interne (1 = plus ancien)
  });
  return rows;
}

(async () => {
  const maxPages = parseInt(process.argv[2] || '30', 10);
  console.log(`\n📡 Collecte Telegram — ${maxPages} pages max par canal\n`);
  const summary = {};
  for (const game of Object.keys(CHANNELS)) {
    const rows = await harvest(game, maxPages);
    fs.writeFileSync(path.join(OUT_DIR, `${game}.json`), JSON.stringify(rows, null, 2));
    summary[game] = rows.length;
    const span = rows.length
      ? `${new Date(rows[rows.length - 1].ts).toISOString().slice(0, 16)} → ${new Date(rows[0].ts).toISOString().slice(0, 16)}`
      : '—';
    console.log(`   ✅ ${game.padEnd(10)} ${String(rows.length).padStart(5)} résultats   ${span}`);
  }
  console.log('\n📦 Résumé :', JSON.stringify(summary));
  console.log(`   Écrit dans ${OUT_DIR}\n`);
})();
