// ============================================================
// significance.js — Les écarts observés sont-ils réels ou du bruit ?
//
// 1. Intervalle de confiance de Wilson à 95 % sur l'accuracy
// 2. Test binomial : le modèle bat-il le hasard de façon significative ?
// 3. Test d'indépendance : le résultat N dépend-il du résultat N-1 ?
//    → réfute (ou confirme) le sophisme du joueur sur données RÉELLES
// 4. Test des séries (runs test de Wald–Wolfowitz)
// ============================================================

'use strict';
const fs = require('fs');
const path = require('path');
const { GAME_CFG, OUTCOMES, actualOutcome } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const load = g => {
  const f = path.join(DATA_DIR, `${g}.json`);
  if (!fs.existsSync(f)) return [];
  // ✅ Matchs en cours écartés : score partiel, non représentatif.
  return JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => !r.live)
    .slice().sort((a, b) => (a.ts - b.ts) || ((a.msgId || a.n || 0) - (b.msgId || b.n || 0)));
};

// Intervalle de Wilson (bien meilleur que l'approx normale sur petits n)
function wilson(hits, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = hits / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n);
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}

// Fonction d'erreur → p-value normale bilatérale
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-x * x);
  return s * y;
}
const pValue2 = z => 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));

// Chi² d'indépendance sur la table de contingence prev → next
function chi2Independence(pairs, cats) {
  const idx = Object.fromEntries(cats.map((c, i) => [c, i]));
  const k = cats.length;
  const obs = Array.from({ length: k }, () => new Array(k).fill(0));
  pairs.forEach(([a, b]) => {
    if (idx[a] === undefined || idx[b] === undefined) return;
    obs[idx[a]][idx[b]]++;
  });
  const rows = obs.map(r => r.reduce((x, y) => x + y, 0));
  const cols = cats.map((_, j) => obs.reduce((s, r) => s + r[j], 0));
  const n = rows.reduce((x, y) => x + y, 0);
  let chi = 0, df = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const e = rows[i] * cols[j] / (n || 1);
    if (e > 0) { chi += (obs[i][j] - e) ** 2 / e; df++; }
  }
  df = (k - 1) * (k - 1);
  return { chi2: chi, df, n, obs, cats };
}

// p-value du chi² (approx Wilson–Hilferty)
function chi2P(chi, df) {
  if (df <= 0) return 1;
  const z = (Math.pow(chi / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - 0.5 * (1 + erf(z / Math.SQRT2));
}

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║   TESTS DE SIGNIFICATIVITÉ STATISTIQUE                           ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

const report = {};

for (const game of ['penalty18', 'penalty22', 'fifa4x4', 'baccara', 'jeu21']) {
  const rows = load(game);
  if (rows.length < 60) continue;
  const cfg = GAME_CFG[game];
  const cats = OUTCOMES[cfg.kind](cfg);
  const seq = rows.map(r => actualOutcome(game, r)).filter(o => cats.includes(o));
  const n = seq.length;

  console.log(`\n\n${'═'.repeat(68)}`);
  console.log(`▸ ${game.toUpperCase()}   n = ${n}`);
  console.log('═'.repeat(68));

  // ── 1. La distribution s'écarte-t-elle de l'équiprobabilité ? ──
  const counts = {};
  seq.forEach(o => counts[o] = (counts[o] || 0) + 1);
  console.log('\n  Distribution des issues (IC 95 % de Wilson) :');
  for (const c of cats) {
    const h = counts[c] || 0;
    const [lo, hi] = wilson(h, n);
    console.log(`    ${c.padEnd(5)} ${String(h).padStart(5)}  ${(h / n * 100).toFixed(1).padStart(5)}%   ` +
      `[${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%]`);
  }

  // ── 2. Le meilleur pari fixe bat-il le hasard ? ──
  const best = cats.map(c => [c, counts[c] || 0]).sort((a, b) => b[1] - a[1])[0];
  const pRand = 1 / cats.length;
  const [lo, hi] = wilson(best[1], n);
  const z = (best[1] / n - pRand) / Math.sqrt(pRand * (1 - pRand) / n);
  const p = pValue2(z);
  console.log(`\n  Meilleur pari fixe : toujours « ${best[0]} » → ${(best[1] / n * 100).toFixed(1)} %`);
  console.log(`    IC 95 % : [${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%]  vs hasard ${(pRand * 100).toFixed(1)}%`);
  console.log(`    z = ${z.toFixed(2)}   p = ${p < 0.0001 ? '<0.0001' : p.toFixed(4)}   ` +
    `${p < 0.05 ? '✅ écart significatif' : '❌ non significatif'}`);

  // ── 3. INDÉPENDANCE : le résultat précédent informe-t-il le suivant ? ──
  // C'est LE test qui valide ou détruit toute stratégie de "série"/"pattern".
  const pairs = [];
  for (let i = 1; i < seq.length; i++) pairs.push([seq[i - 1], seq[i]]);
  const ct = chi2Independence(pairs, cats);
  const pc = chi2P(ct.chi2, ct.df);
  console.log(`\n  Test d'indépendance χ² (résultat N-1 → résultat N) :`);
  console.log(`    χ² = ${ct.chi2.toFixed(3)}   df = ${ct.df}   p = ${pc < 0.0001 ? '<0.0001' : pc.toFixed(4)}`);
  if (pc < 0.05) {
    console.log(`    ⚠️  DÉPENDANCE DÉTECTÉE (p < 0.05) — un biais exploitable pourrait exister.`);
    console.log(`    Table de contingence (lignes = N-1, colonnes = N) :`);
    console.log(`      ${''.padEnd(6)}${cats.map(c => c.padStart(7)).join('')}`);
    ct.obs.forEach((r, i) => {
      const tot = r.reduce((a, b) => a + b, 0) || 1;
      console.log(`      ${cats[i].padEnd(6)}${r.map(v => (`${(v / tot * 100).toFixed(1)}%`).padStart(7)).join('')}   (n=${tot})`);
    });
  } else {
    console.log(`    ✅ INDÉPENDANCE : le résultat précédent n'apporte AUCUNE information.`);
    console.log(`       → toute stratégie fondée sur les séries/patterns est sans fondement.`);
  }

  // ── 4. Runs test (Wald–Wolfowitz) sur l'issue binaire dominante ──
  if (cats.length >= 2) {
    const target = best[0];
    const bin = seq.map(o => o === target ? 1 : 0);
    let runs = 1;
    for (let i = 1; i < bin.length; i++) if (bin[i] !== bin[i - 1]) runs++;
    const n1 = bin.filter(x => x === 1).length, n2 = bin.length - n1;
    if (n1 > 0 && n2 > 0) {
      const exp = (2 * n1 * n2) / (n1 + n2) + 1;
      const varr = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) /
                   (((n1 + n2) ** 2) * (n1 + n2 - 1));
      const zr = (runs - exp) / Math.sqrt(varr);
      const pr = pValue2(zr);
      console.log(`\n  Runs test sur « ${target} » (détection de séries anormales) :`);
      console.log(`    séries observées ${runs}, attendues ${exp.toFixed(1)}   z = ${zr.toFixed(2)}   p = ${pr < 0.0001 ? '<0.0001' : pr.toFixed(4)}`);
      console.log(`    ${pr < 0.05
        ? (zr < 0 ? '⚠️  séries plus LONGUES que le hasard (regroupement)' : '⚠️  alternance plus forte que le hasard')
        : '✅ longueur des séries conforme au pur hasard'}`);
    }
  }

  report[game] = { n, counts, bestFixed: best[0], bestFixedRate: best[1] / n,
                   chi2: ct.chi2, chi2p: pc, independent: pc >= 0.05 };
}

fs.writeFileSync(path.join(DATA_DIR, 'significance.json'), JSON.stringify(report, null, 2));
console.log(`\n\n📄 ${path.join(DATA_DIR, 'significance.json')}\n`);
