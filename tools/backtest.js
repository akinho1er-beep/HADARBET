// ============================================================
// backtest.js — Harnais de validation walk-forward
//
// Pour chaque match i : on entraîne sur [0..i-1], on prédit i, on compare.
// Aucune fuite d'information du futur.
//
// Métriques :
//  • Accuracy       — % de bons vainqueurs
//  • Score de Brier — mean(sum((p_k - y_k)^2)) sur la distribution complète.
//                     C'est LA métrique de qualité probabiliste. Plus bas = mieux.
//  • Log loss       — pénalise fortement la confiance mal placée
//  • Calibration    — parmi les prédictions à ~70 %, en a-t-on 70 % de justes ?
//
// Usage : node tools/backtest.js [--json out.json]
// ============================================================

'use strict';
const fs = require('fs');
const path = require('path');
const { GAME_CFG, MODELS, OUTCOMES, actualOutcome } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WARMUP = 40;              // matchs d'amorçage avant de commencer à noter
const CAL_BINS = [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1.0001];

// Charge et remet en ordre CHRONOLOGIQUE (ancien → récent).
// ✅ On trie par ts puis msgId — JAMAIS par `n` (cf. bug FIFA 4×4 où n = Date.now()).
function load(game) {
  const f = path.join(DATA_DIR, `${game}.json`);
  if (!fs.existsSync(f)) return [];
  // ✅ On écarte les matchs encore EN COURS : leur score est partiel.
  const rows = JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => !r.live);
  return rows.slice().sort((a, b) =>
    (a.ts - b.ts) || ((a.msgId || a.n || 0) - (b.msgId || b.n || 0)));
}

function backtestModel(game, rows, modelFn) {
  const cfg = GAME_CFG[game];
  const outcomes = OUTCOMES[cfg.kind](cfg);
  let nPred = 0, nHit = 0, brier = 0, logloss = 0;
  const bins = CAL_BINS.slice(0, -1).map(() => ({ n: 0, sum: 0, hit: 0 }));
  const confHits = [];   // {p, hit} du choix top, pour la courbe de calibration

  for (let i = WARMUP; i < rows.length; i++) {
    const history = rows.slice(0, i);
    const row = rows[i];
    const fx = { home: row.home, away: row.away };

    let out;
    try { out = modelFn(history, fx, cfg); }
    catch (e) { continue; }
    if (!out || !out.probs) continue;

    const actual = actualOutcome(game, row);
    if (!outcomes.includes(actual)) continue; // ex. nul sur un jeu noDraw : ignoré

    // Normalisation défensive + plancher pour éviter log(0)
    const EPS = 1e-6;
    let tot = 0;
    const p = {};
    outcomes.forEach(o => { p[o] = Math.max(EPS, out.probs[o] ?? 0); tot += p[o]; });
    outcomes.forEach(o => p[o] /= tot);

    // Brier multiclasse
    let b = 0;
    outcomes.forEach(o => { const y = (o === actual) ? 1 : 0; b += (p[o] - y) ** 2; });
    brier += b;
    logloss += -Math.log(p[actual]);

    // Accuracy sur l'argmax (départage déterministe par ordre alphabétique)
    const top = outcomes.slice().sort((x, y) => (p[y] - p[x]) || x.localeCompare(y))[0];
    const hit = top === actual;
    if (hit) nHit++;
    nPred++;

    // Calibration sur la probabilité du choix retenu
    const pTop = p[top];
    confHits.push({ p: pTop, hit });
    const bi = Math.min(bins.length - 1, Math.floor(pTop * 10));
    bins[bi].n++; bins[bi].sum += pTop; bins[bi].hit += hit ? 1 : 0;
  }

  if (!nPred) return null;

  // ECE — Expected Calibration Error : écart moyen |confiance − justesse réelle|
  let ece = 0;
  bins.forEach(b => { if (b.n) ece += (b.n / nPred) * Math.abs(b.sum / b.n - b.hit / b.n); });

  return {
    n: nPred,
    accuracy: nHit / nPred,
    brier: brier / nPred,
    logloss: logloss / nPred,
    ece,
    bins: bins.map((b, i) => ({
      range: `${(CAL_BINS[i] * 100).toFixed(0)}-${(CAL_BINS[i + 1] * 100).toFixed(0)}%`,
      n: b.n,
      avgConf: b.n ? b.sum / b.n : null,
      actual: b.n ? b.hit / b.n : null,
    })).filter(b => b.n > 0),
  };
}

function bar(v, max, width = 22) {
  const len = Math.round((v / max) * width);
  return '█'.repeat(Math.max(0, len)).padEnd(width, '·');
}

(function main() {
  const games = ['penalty18', 'penalty22', 'fifa4x4', 'baccara', 'jeu21'];
  const report = { generatedAt: new Date().toISOString(), warmup: WARMUP, games: {} };

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   HADAR — BACKTEST WALK-FORWARD SUR DONNÉES TELEGRAM RÉELLES     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  for (const game of games) {
    const rows = load(game);
    const cfg = GAME_CFG[game];
    if (rows.length < WARMUP + 20) {
      console.log(`\n▸ ${game} : données insuffisantes (${rows.length})`);
      continue;
    }
    const outcomes = OUTCOMES[cfg.kind](cfg);
    const span = `${new Date(rows[0].ts).toISOString().slice(0, 10)} → ${new Date(rows[rows.length - 1].ts).toISOString().slice(0, 10)}`;

    console.log(`\n\n${'═'.repeat(68)}`);
    console.log(`▸ ${game.toUpperCase()}  ·  ${rows.length} résultats  ·  ${span}`);
    console.log(`  issues possibles : ${outcomes.join(' / ')}   (warmup ${WARMUP})`);
    console.log('═'.repeat(68));

    // Distribution réelle des issues (le baseline à battre)
    const dist = {};
    rows.forEach(r => { const o = actualOutcome(game, r); dist[o] = (dist[o] || 0) + 1; });
    const distStr = Object.entries(dist).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${(v / rows.length * 100).toFixed(1)}%`).join('  ·  ');
    console.log(`  distribution réelle : ${distStr}`);

    const modelSet = MODELS[cfg.kind];
    const results = {};
    console.log(`\n  ${'modèle'.padEnd(20)} ${'n'.padStart(5)} ${'accuracy'.padStart(9)} ${'Brier↓'.padStart(8)} ${'logloss↓'.padStart(9)} ${'ECE↓'.padStart(7)}`);
    console.log(`  ${'-'.repeat(64)}`);

    for (const [name, fn] of Object.entries(modelSet)) {
      const r = backtestModel(game, rows, fn);
      if (!r) { console.log(`  ${name.padEnd(20)}   —`); continue; }
      results[name] = r;
      console.log(
        `  ${name.padEnd(20)} ${String(r.n).padStart(5)} ` +
        `${(r.accuracy * 100).toFixed(1).padStart(8)}% ` +
        `${r.brier.toFixed(4).padStart(8)} ` +
        `${r.logloss.toFixed(4).padStart(9)} ` +
        `${r.ece.toFixed(4).padStart(7)}`
      );
    }

    // Classement par score de Brier (la métrique qui compte)
    const ranked = Object.entries(results).sort((a, b) => a[1].brier - b[1].brier);
    if (ranked.length) {
      const best = ranked[0];
      const rand = results['hasard'];
      console.log(`\n  ✦ meilleur (Brier) : « ${best[0] } »  Brier ${best[1].brier.toFixed(4)}`);
      if (rand) {
        const gain = ((rand.brier - best[1].brier) / rand.brier * 100);
        console.log(`    gain vs hasard   : ${gain >= 0 ? '+' : ''}${gain.toFixed(2)} %`);
      }

      // Courbe de calibration du meilleur modèle
      console.log(`\n  Calibration de « ${best[0]} »  (confiance annoncée vs justesse réelle)`);
      console.log(`  ${'tranche'.padEnd(10)} ${'n'.padStart(5)}  ${'annoncé'.padStart(8)} ${'réel'.padStart(7)}   écart`);
      best[1].bins.forEach(b => {
        const d = (b.actual - b.avgConf) * 100;
        const flag = Math.abs(d) > 8 ? (d < 0 ? '  ⚠️ surconfiant' : '  ⚠️ sous-confiant') : '';
        console.log(`  ${b.range.padEnd(10)} ${String(b.n).padStart(5)}  ` +
          `${(b.avgConf * 100).toFixed(1).padStart(7)}% ${(b.actual * 100).toFixed(1).padStart(6)}%  ` +
          `${(d >= 0 ? '+' : '') + d.toFixed(1)}pt${flag}`);
      });
    }

    report.games[game] = { rows: rows.length, span, distribution: dist, results };
  }

  // Sortie JSON pour l'onglet Performance de l'app
  const outIdx = process.argv.indexOf('--json');
  const outFile = outIdx > -1 ? process.argv[outIdx + 1] : path.join(DATA_DIR, 'backtest.json');
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n\n📄 Rapport JSON : ${outFile}\n`);
})();
