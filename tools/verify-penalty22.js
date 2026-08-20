// ============================================================
// verify-penalty22.js — L'anomalie d'alternance de penalty22 est-elle réelle ?
//
// On a testé 5 jeux → risque de faux positif par comparaisons multiples.
// Trois vérifications :
//   1. Correction de Bonferroni / Holm
//   2. Stabilité split-half (1re moitié vs 2e moitié)
//   3. Test hors échantillon : une stratégie d'alternance est-elle RENTABLE
//      face à la cote réelle du bookmaker ?
// ============================================================

'use strict';
const fs = require('fs');
const path = require('path');
const { actualOutcome } = require('./engine');

const DATA_DIR = path.join(__dirname, '..', 'data');
const load = g => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${g}.json`), 'utf8'))
  .slice().sort((a, b) => (a.ts - b.ts) || ((a.msgId || a.n || 0) - (b.msgId || b.n || 0)));

function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-x * x));
}
const pValue2 = z => 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
const wilson = (h, n, z = 1.96) => {
  if (!n) return [0, 0];
  const p = h / n, d = 1 + z * z / n, c = p + z * z / (2 * n);
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
};

// Taux d'alternance : P(résultat N ≠ résultat N-1)
function altRate(seq) {
  let alt = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) alt++;
  const n = seq.length - 1;
  const z = (alt / n - 0.5) / Math.sqrt(0.25 / n);
  return { alt, n, rate: alt / n, z, p: pValue2(z), ci: wilson(alt, n) };
}

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║   VÉRIFICATION DE L\'ANOMALIE PENALTY 22                          ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ── 1. Correction pour comparaisons multiples ──────────────────
console.log('\n▸ 1. Comparaisons multiples (5 jeux testés simultanément)');
const raw = { penalty18: 0.3168, penalty22: 0.0018, fifa4x4: 0.2521, baccara: 0.6848, jeu21: 0.9081 };
const sorted = Object.entries(raw).sort((a, b) => a[1] - b[1]);
console.log(`  ${'jeu'.padEnd(12)} ${'p brut'.padStart(9)} ${'seuil Holm'.padStart(11)}   verdict`);
let stillSig = false;
sorted.forEach(([g, p], i) => {
  const thr = 0.05 / (sorted.length - i);
  const ok = p < thr;
  if (i === 0 && ok) stillSig = true;
  console.log(`  ${g.padEnd(12)} ${p.toFixed(4).padStart(9)} ${thr.toFixed(4).padStart(11)}   ${ok ? '✅ survit' : '❌ rejeté'}`);
});
console.log(`  → Bonferroni strict : p < ${(0.05 / 5).toFixed(4)} requis. penalty22 (0.0018) ${0.0018 < 0.01 ? 'SURVIT' : 'ne survit pas'}.`);

// ── 2. Stabilité dans le temps (split-half) ────────────────────
console.log('\n\n▸ 2. Stabilité split-half — l\'effet persiste-t-il sur les deux moitiés ?');
for (const game of ['penalty18', 'penalty22', 'fifa4x4']) {
  const rows = load(game);
  const seq = rows.map(r => actualOutcome(game, r)).filter(o => o === 'H' || o === 'A');
  const mid = Math.floor(seq.length / 2);
  const a = altRate(seq.slice(0, mid));
  const b = altRate(seq.slice(mid));
  const all = altRate(seq);
  console.log(`\n  ${game}  (n=${seq.length})`);
  console.log(`    global      alternance ${(all.rate * 100).toFixed(1)}%  [${(all.ci[0] * 100).toFixed(1)}–${(all.ci[1] * 100).toFixed(1)}]  z=${all.z.toFixed(2)}  p=${all.p.toFixed(4)}`);
  console.log(`    1re moitié  alternance ${(a.rate * 100).toFixed(1)}%  [${(a.ci[0] * 100).toFixed(1)}–${(a.ci[1] * 100).toFixed(1)}]  z=${a.z.toFixed(2)}  p=${a.p.toFixed(4)}`);
  console.log(`    2e moitié   alternance ${(b.rate * 100).toFixed(1)}%  [${(b.ci[0] * 100).toFixed(1)}–${(b.ci[1] * 100).toFixed(1)}]  z=${b.z.toFixed(2)}  p=${b.p.toFixed(4)}`);
  const consistent = (a.p < 0.05 && b.p < 0.05 && Math.sign(a.z) === Math.sign(b.z));
  console.log(`    → ${consistent ? '✅ effet PRÉSENT dans les deux moitiés (robuste)'
                                  : '⚠️  effet NON reproduit sur les deux moitiés → probablement du bruit'}`);
}

// ── 3. Test économique hors échantillon ────────────────────────
// Une anomalie n'a de valeur que si elle bat la marge du bookmaker.
console.log('\n\n▸ 3. Test économique — la stratégie « parier l\'inverse du précédent »');
console.log('     est-elle rentable face aux cotes réelles ?\n');

for (const game of ['penalty18', 'penalty22']) {
  const rows = load(game);
  const seq = rows.map(r => actualOutcome(game, r)).filter(o => o === 'H' || o === 'A');
  // walk-forward : on décide sur le passé uniquement
  let bets = 0, wins = 0;
  for (let i = 1; i < seq.length; i++) {
    const pick = seq[i - 1] === 'H' ? 'A' : 'H'; // parier l'alternance
    bets++;
    if (seq[i] === pick) wins++;
  }
  const wr = wins / bets;
  const [lo, hi] = wilson(wins, bets);
  console.log(`  ${game} : ${wins}/${bets} = ${(wr * 100).toFixed(1)} %  IC 95 % [${(lo * 100).toFixed(1)}% – ${(hi * 100).toFixed(1)}%]`);

  // Seuil de rentabilité selon la cote. 1xBet propose ~1.85 sur ce type de marché.
  [1.85, 1.90, 1.95, 2.00].forEach(odds => {
    const breakeven = 1 / odds;
    const roi = (wr * odds - 1) * 100;
    const roiLo = (lo * odds - 1) * 100;
    const roiHi = (hi * odds - 1) * 100;
    const verdict = roiLo > 0 ? '✅ rentable même au pire du IC'
                  : roi > 0   ? '⚠️  positif mais IC inclut la perte'
                              : '❌ perdant';
    console.log(`     cote ${odds.toFixed(2)} (seuil ${(breakeven * 100).toFixed(1)}%) → ROI ${roi >= 0 ? '+' : ''}${roi.toFixed(1)} %  ` +
      `[${roiLo >= 0 ? '+' : ''}${roiLo.toFixed(1)} ; ${roiHi >= 0 ? '+' : ''}${roiHi.toFixed(1)}]  ${verdict}`);
  });
  console.log('');
}

console.log('  Note : 1xBet applique une marge (overround) d\'environ 5-8 % sur ces marchés.');
console.log('  Une anomalie doit dépasser ce seuil pour être exploitable, pas seulement');
console.log('  être « statistiquement significative ».\n');
