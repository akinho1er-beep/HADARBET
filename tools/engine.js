// ============================================================
// engine.js — Moteurs de prédiction HADAR, version BACKTESTABLE
//
// Différences avec betting-analyzer.html :
//  1. AUCUN Math.random() → strictement déterministe
//  2. Ordre chronologique par `ts`/`msgId`, jamais par `n` (cf. bug FIFA 4×4)
//  3. Chaque modèle renvoie une DISTRIBUTION de probabilités normalisée
//     (et pas un label + un score de confiance inventé)
//  4. Aucun accès au futur : on ne reçoit que l'historique passé
//
// Signature commune : model(history, fixture) -> { probs: {outcome: p}, ... }
//   history = tableau CHRONOLOGIQUE (ancien → récent) des matchs précédents
//   fixture = { home, away } du match à prédire
// ============================================================

'use strict';

// ── Utilitaires ─────────────────────────────────────────────
const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
const safeScore = s => {
  const [h, a] = String(s || '0:0').split(':').map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(a) ? a : 0];
};
function logFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
function poisson(k, lambda) {
  lambda = Math.max(0.05, Number(lambda) || 0.05);
  return Math.exp(k * Math.log(lambda) - lambda - logFact(k));
}
function normalize(o) {
  const s = Object.values(o).reduce((a, b) => a + b, 0) || 1;
  const r = {};
  for (const k in o) r[k] = o[k] / s;
  return r;
}

// ════════════════════════════════════════════════════════════
//  JEUX D'ÉQUIPE (penalty18 / penalty22 / fifa4x4)
//  Issues : 'H' (domicile), 'D' (nul), 'A' (extérieur)
// ════════════════════════════════════════════════════════════

// ── Baseline 0 : hasard uniforme ─────────────────────────────
function mUniform(history, fx, cfg) {
  return cfg.noDraw ? { probs: { H: 0.5, D: 0, A: 0.5 } }
                    : { probs: { H: 1 / 3, D: 1 / 3, A: 1 / 3 } };
}

// ── Baseline 1 : fréquence de base observée ──────────────────
function mBaseRate(history, fx, cfg) {
  let h = 1, d = cfg.noDraw ? 0 : 1, a = 1; // lissage de Laplace
  history.forEach(r => {
    const [x, y] = safeScore(r.score);
    if (x > y) h++; else if (x < y) a++; else if (!cfg.noDraw) d++;
  });
  return { probs: normalize({ H: h, D: d, A: a }) };
}

// ── Baseline 2 : "toujours domicile" ─────────────────────────
function mAlwaysHome() { return { probs: { H: 1, D: 0, A: 0 } }; }

// ── Elo pur ──────────────────────────────────────────────────
function buildElo(history, cfg) {
  const R = {};
  const ens = t => { if (R[t] === undefined) R[t] = 1500; };
  history.forEach(r => {
    ens(r.home); ens(r.away);
    const [hg, ag] = safeScore(r.score);
    const outcome = hg > ag ? 1 : hg === ag ? 0.5 : 0;
    const expH = 1 / (1 + Math.pow(10, (R[r.away] - (R[r.home] + cfg.homeAdv)) / 400));
    const delta = cfg.k * (outcome - expH);
    R[r.home] += delta; R[r.away] -= delta;
  });
  return R;
}
function mElo(history, fx, cfg) {
  const R = buildElo(history, cfg);
  const rh = (R[fx.home] ?? 1500) + cfg.homeAdv;
  const ra = R[fx.away] ?? 1500;
  const expH = 1 / (1 + Math.pow(10, (ra - rh) / 400));
  if (cfg.noDraw) return { probs: { H: expH, D: 0, A: 1 - expH }, elo: { h: R[fx.home], a: R[fx.away] } };
  // Répartition du nul proportionnelle au taux observé
  let dObs = 0;
  history.forEach(r => { const [x, y] = safeScore(r.score); if (x === y) dObs++; });
  const pD = history.length ? dObs / history.length : 0.1;
  return { probs: normalize({ H: expH * (1 - pD), D: pD, A: (1 - expH) * (1 - pD) }),
           elo: { h: R[fx.home], a: R[fx.away] } };
}

// ── Elo + Poisson (portage FIXÉ de hadarProTeamModel) ────────
function mEloPoisson(history, fx, cfg) {
  if (history.length < 6) return mBaseRate(history, fx, cfg);

  const R = buildElo(history, cfg);
  const st = {};
  const ens = t => { if (!st[t]) st[t] = { homePl: 0, homeGf: 0, homeGa: 0, awayPl: 0, awayGf: 0, awayGa: 0, pl: 0 }; };

  let totHG = 0, totAG = 0, draws = 0;
  history.forEach(r => {
    ens(r.home); ens(r.away);
    const [hg, ag] = safeScore(r.score);
    totHG += hg; totAG += ag;
    if (hg === ag) draws++;
    const s = st[r.home], t = st[r.away];
    s.homePl++; s.homeGf += hg; s.homeGa += ag; s.pl++;
    t.awayPl++; t.awayGf += ag; t.awayGa += hg; t.pl++;
  });
  ens(fx.home); ens(fx.away);

  const n = history.length;
  const avgH = Math.max(0.2, totHG / n);
  const avgA = Math.max(0.2, totAG / n);
  const shrunk = (val, cnt, avg, k = 10) => (val + avg * k) / (cnt + k);

  const sh = st[fx.home], sa = st[fx.away];
  const hAtt = shrunk(sh.homeGf, sh.homePl, avgH) / avgH;
  const aDef = shrunk(sa.awayGa, sa.awayPl, avgH) / avgH;
  const aAtt = shrunk(sa.awayGf, sa.awayPl, avgA) / avgA;
  const hDef = shrunk(sh.homeGa, sh.homePl, avgA) / avgA;

  const eloDiff = ((R[fx.home] ?? 1500) + cfg.homeAdv) - (R[fx.away] ?? 1500);
  const ef = Math.pow(10, eloDiff / 1600);
  const lamH = clamp(avgH * hAtt * aDef * ef, 0.15, cfg.maxGoals - 0.25);
  const lamA = clamp(avgA * aAtt * hDef / ef, 0.15, cfg.maxGoals - 0.25);

  let pH = 0, pD = 0, pA = 0, pOver = 0, pBtts = 0;
  const grid = [];
  for (let i = 0; i <= cfg.maxGoals; i++) {
    const ph = poisson(i, lamH);
    for (let j = 0; j <= cfg.maxGoals; j++) {
      const pr = ph * poisson(j, lamA);
      grid.push({ hg: i, ag: j, pr });
      if (i > j) pH += pr; else if (i === j) pD += pr; else pA += pr;
      if (i + j > 2.5) pOver += pr;
      if (i > 0 && j > 0) pBtts += pr;
    }
  }
  const mass = pH + pD + pA || 1;
  pH /= mass; pD /= mass; pA /= mass; pOver /= mass; pBtts /= mass;
  grid.forEach(g => g.pr /= mass);

  // ✅ CORRECTIF 3d : si le nul est impossible, on renormalise TOUT (y compris
  // la grille de scores), au lieu de multiplier par 0.15 sans renormaliser.
  const drawRate = draws / n;
  if (cfg.noDraw || drawRate < 0.02) {
    const wd = pH + pA || 1;
    pH += pD * (pH / wd); pA += pD * (pA / wd); pD = 0;
    let m2 = 0;
    grid.forEach(g => { if (g.hg === g.ag) g.pr = 0; m2 += g.pr; });
    grid.forEach(g => g.pr /= (m2 || 1));
    // recalcul cohérent des marchés dérivés
    pOver = grid.filter(g => g.hg + g.ag > 2.5).reduce((s, g) => s + g.pr, 0);
    pBtts = grid.filter(g => g.hg > 0 && g.ag > 0).reduce((s, g) => s + g.pr, 0);
  }

  grid.sort((a, b) => b.pr - a.pr);
  // ✅ CORRECTIF 3b : le score renvoyé est celui de la grille, avec SA vraie
  // probabilité — pas un score bricolé associé à la proba d'un autre score.
  const top = grid[0] || { hg: 0, ag: 0, pr: 0 };

  return {
    probs: { H: pH, D: pD, A: pA },
    lambdas: { home: lamH, away: lamA },
    score: { home: top.hg, away: top.ag, p: top.pr },
    markets: { over25: pOver, btts: pBtts },
    elo: { h: R[fx.home], a: R[fx.away] },
  };
}

// ── Elo + Poisson + shrinkage H2H (correctif 3c) ─────────────
function mEloPoissonH2H(history, fx, cfg) {
  const base = mEloPoisson(history, fx, cfg);
  if (history.length < 6) return base;
  const h2h = history.filter(r =>
    (r.home === fx.home && r.away === fx.away) || (r.home === fx.away && r.away === fx.home));
  if (h2h.length < 2) return base;

  let h = 0, d = 0, a = 0;
  h2h.forEach(r => {
    const [x, y] = safeScore(r.score);
    const homeIs = r.home === fx.home;
    const gf = homeIs ? x : y, ga = homeIs ? y : x;
    if (gf > ga) h++; else if (gf < ga) a++; else d++;
  });
  // ✅ CORRECTIF 3c : poids = n/(n+k) au lieu de 60% en dur sur 2 matchs
  const k = 8;
  const w = h2h.length / (h2h.length + k);
  const t = h2h.length;
  const mix = o => normalize({
    H: base.probs.H * (1 - w) + (h / t) * w,
    D: cfg.noDraw ? 0 : base.probs.D * (1 - w) + (d / t) * w,
    A: base.probs.A * (1 - w) + (a / t) * w,
  });
  return { ...base, probs: mix(), h2hCount: h2h.length, h2hWeight: w };
}

// ════════════════════════════════════════════════════════════
//  BACCARA — issues 'P', 'B', 'T'
// ════════════════════════════════════════════════════════════
const BAC_THEORY = { P: 0.4462, B: 0.4586, T: 0.0952 };
const bacOutcome = r => r.player > r.banker ? 'P' : r.banker > r.player ? 'B' : 'T';

function bacTheory() { return { probs: { ...BAC_THEORY } }; }
function bacBaseRate(history) {
  let p = 1, b = 1, t = 1;
  history.forEach(r => { const o = bacOutcome(r); if (o === 'P') p++; else if (o === 'B') b++; else t++; });
  return { probs: normalize({ P: p, B: b, T: t }) };
}
// Portage du modèle actuel : théorie mélangée à l'observé, poids max 25 %
function bacCurrent(history) {
  const n = history.length;
  let p = 0, b = 0, t = 0;
  history.forEach(r => { const o = bacOutcome(r); if (o === 'P') p++; else if (o === 'B') b++; else t++; });
  const w = Math.min(0.25, n / 400);
  return { probs: normalize({
    P: BAC_THEORY.P * (1 - w) + (n ? p / n : 0) * w,
    B: BAC_THEORY.B * (1 - w) + (n ? b / n : 0) * w,
    T: BAC_THEORY.T * (1 - w) + (n ? t / n : 0) * w,
  }) };
}
// Modèle "suivi de série" (ce que fait analyzeLocal) — pour le RÉFUTER
function bacStreak(history) {
  const base = bacBaseRate(history).probs;
  if (!history.length) return { probs: base };
  const last = bacOutcome(history[history.length - 1]);
  if (last === 'T') return { probs: base };
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (bacOutcome(history[i]) === last) streak++; else break;
  }
  const boost = Math.min(0.15, streak * 0.03);
  const o = { ...base };
  o[last] = base[last] + boost;
  const other = last === 'P' ? 'B' : 'P';
  o[other] = Math.max(0.01, base[other] - boost);
  return { probs: normalize(o), streak };
}

// ════════════════════════════════════════════════════════════
//  JEU 21 — issues 'WIN', 'LOSE', 'PUSH'
// ════════════════════════════════════════════════════════════
function j21BaseRate(history) {
  let w = 1, l = 1, p = 1;
  history.forEach(r => {
    const s = String(r.result || '').toUpperCase();
    if (s === 'WIN') w++; else if (s === 'LOSE') l++; else p++;
  });
  return { probs: normalize({ WIN: w, LOSE: l, PUSH: p }) };
}
function j21AlwaysLose() { return { probs: { WIN: 0, LOSE: 1, PUSH: 0 } }; }

// ════════════════════════════════════════════════════════════
//  Configuration par jeu
// ════════════════════════════════════════════════════════════
const GAME_CFG = {
  penalty18: { kind: 'team', noDraw: true,  maxGoals: 8,  k: 28, homeAdv: 45 },
  penalty22: { kind: 'team', noDraw: true,  maxGoals: 8,  k: 28, homeAdv: 45 },
  fifa4x4:   { kind: 'team', noDraw: false, maxGoals: 12, k: 24, homeAdv: 35 },
  baccara:   { kind: 'baccara' },
  jeu21:     { kind: 'jeu21' },
};

const MODELS = {
  team: {
    'hasard':            mUniform,
    'toujours domicile': mAlwaysHome,
    'fréquence de base': mBaseRate,
    'Elo seul':          mElo,
    'Elo+Poisson':       mEloPoisson,
    'Elo+Poisson+H2H':   mEloPoissonH2H,
  },
  baccara: {
    'hasard':            () => ({ probs: { P: 1 / 3, B: 1 / 3, T: 1 / 3 } }),
    'théorie pure':      bacTheory,
    'fréquence de base': bacBaseRate,
    'moteur actuel':     bacCurrent,
    'suivi de série':    bacStreak,
  },
  jeu21: {
    'hasard':            () => ({ probs: { WIN: 1 / 3, LOSE: 1 / 3, PUSH: 1 / 3 } }),
    'fréquence de base': j21BaseRate,
    'toujours LOSE':     j21AlwaysLose,
  },
};

const OUTCOMES = {
  team:    cfg => cfg.noDraw ? ['H', 'A'] : ['H', 'D', 'A'],
  baccara: () => ['P', 'B', 'T'],
  jeu21:   () => ['WIN', 'LOSE', 'PUSH'],
};

function actualOutcome(game, row) {
  const cfg = GAME_CFG[game];
  if (cfg.kind === 'team') {
    const [h, a] = safeScore(row.score);
    return h > a ? 'H' : h < a ? 'A' : 'D';
  }
  if (cfg.kind === 'baccara') return bacOutcome(row);
  return String(row.result || '').toUpperCase();
}

module.exports = { GAME_CFG, MODELS, OUTCOMES, actualOutcome, safeScore, normalize, poisson, buildElo, bacOutcome };
