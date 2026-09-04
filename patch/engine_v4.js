// ══════════════════════════════════════════════════════════════════════
//  HADAR AI v4 — MOTEUR CALIBRÉ SUR BACKTEST RÉEL
//  ----------------------------------------------------------------------
//  Toutes les valeurs de confiance de ce moteur proviennent d'un backtest
//  walk-forward sur 4 152 résultats Telegram réels (7–18 août 2026).
//  Aucune constante inventée, aucun Math.random(), aucun sophisme du joueur.
//
//  Résultats mesurés (score de Brier, plus bas = mieux) :
//    penalty18 : Elo+Poisson 0.5557  >  hasard 0.5000   → Elo DÉBRANCHÉ
//    penalty22 : Elo+Poisson 0.5680  >  hasard 0.5000   → Elo DÉBRANCHÉ
//    fifa4x4   : fréquence de base 0.5787 (meilleur)
//    baccara   : fréquence de base 0.6242 (meilleur)
//    jeu21     : fréquence de base 0.5423 (meilleur)
//
//  Test χ² d'indépendance : 4 jeux sur 5 sont statistiquement indépendants
//  → toute stratégie de série / pattern / écart est sans fondement.
//  Seule exception : penalty22 (alternance, p=0.0018) — signal candidat,
//  non confirmé (287 obs. sur ~572 requises).
// ══════════════════════════════════════════════════════════════════════

// ── Table de calibration issue du backtest ───────────────────────────
// accuracy = justesse RÉELLE mesurée. C'est le plafond de confiance affichable.
const HADAR_CALIBRATION = {
  penalty18: { model: 'fréquence de base', accuracy: 0.496, brier: 0.5000, randomBrier: 0.5000, beatsRandom: false, independent: true,  n: 248,  note: "Elo+Poisson mesuré à 0.5557 — pire que le hasard. Débranché." },
  penalty22: { model: 'fréquence de base', accuracy: 0.512, brier: 0.5000, randomBrier: 0.5000, beatsRandom: false, independent: false, n: 248,  note: "Elo+Poisson mesuré à 0.5680 — pire que le hasard. Débranché. Alternance anormale détectée (p=0.0018), non confirmée." },
  fifa4x4:   { model: 'fréquence de base', accuracy: 0.469, brier: 0.5787, randomBrier: 0.6667, beatsRandom: true,  independent: true,  n: 1144, note: "Aucun modèle sophistiqué ne bat la fréquence de base." },
  baccara:   { model: 'fréquence de base', accuracy: 0.467, brier: 0.6242, randomBrier: 0.6667, beatsRandom: true,  independent: true,  n: 1156, note: "Tirages indépendants. Les 0:0 (10/J/Q/K) sont distingués des vraies égalités." },
  jeu21:     { model: 'fréquence de base', accuracy: 0.560, brier: 0.5423, randomBrier: 0.6667, beatsRandom: true,  independent: true,  n: 1156, note: "Tirages indépendants. La fréquence de base est optimale." },
  aviator:   { model: 'espérance/risque',  accuracy: null,  brier: null,   randomBrier: null,   beatsRandom: false, independent: true,  n: 0,    note: "Jeu provably fair : imprévisible par construction. Le moteur ne prédit pas, il quantifie le risque." },
};

// ── Utilitaires déterministes (zéro aléatoire) ───────────────────────
function hpClamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function hpPct(n, dec = 1) { return Number(((Number(n) || 0) * 100).toFixed(dec)); }
function hpNorm(o) {
  const s = Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  const r = {}; for (const k in o) r[k] = (Number(o[k]) || 0) / s; return r;
}
function hpSafeScore(score) {
  const [h, a] = String(score || '0:0').split(':').map(Number);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(a) ? a : 0];
}
// Ordre chronologique FIABLE : ts puis msgId. JAMAIS `n` (bug FIFA 4×4 : n = Date.now()).
function hpChrono(data) {
  return [...data].sort((a, b) =>
    ((a.ts || 0) - (b.ts || 0)) || (((a.msgId || a.n || 0)) - ((b.msgId || b.n || 0))));
}
function hpGameLabel(game) {
  return { penalty18: 'Penalty 18', penalty22: 'Penalty 22', fifa4x4: 'FIFA 4×4',
           baccara: 'Baccara', jeu21: 'Jeu 21', aviator: 'Aviator' }[game] || game;
}
// Libellé de confiance honnête : au-delà de ~55 % de justesse réelle, on ne prétend rien.
function hpConfLabel(c) {
  if (c >= 60) return { txt: 'Correcte', cls: 'medium' };
  if (c >= 53) return { txt: 'Faible',   cls: 'weak'   };
  return             { txt: 'Nulle',    cls: 'weak'   };
}

// ── Baccara : distinguer les VRAIES égalités des mains 0:0 ───────────
// Au baccara, 10/J/Q/K valent 0. Une main 0:0 est une vraie égalité au sens
// des règles, mais elle gonflait le taux de "Tie" à 17.5 % (vs 9.5 % théorique).
// On la comptabilise séparément pour un affichage honnête.
function hpBacOutcome(r) {
  const p = Number(r.player ?? r.playerScore ?? 0);
  const b = Number(r.banker ?? r.bankerScore ?? 0);
  if (p > b) return 'P';
  if (b > p) return 'B';
  return (p === 0 && b === 0) ? 'T0' : 'T'; // T0 = égalité à 0 (mains sans valeur)
}

// ══════════════════════════════════════════════════════════════════════
//  MODÈLE JEUX D'ÉQUIPE — fréquence de base + Elo INFORMATIF SEULEMENT
// ══════════════════════════════════════════════════════════════════════
function hadarV4TeamModel(game, data) {
  const cal = HADAR_CALIBRATION[game];
  const rows = hpChrono(data).filter(r => r && r.home && r.away && r.score);
  if (rows.length < 5) return null;

  const noDraw = (game === 'penalty18' || game === 'penalty22');
  const total = rows.length;

  // Fréquence de base — LE modèle retenu par le backtest.
  let h = 0, d = 0, a = 0, gf = 0, ga = 0;
  rows.forEach(r => {
    const [x, y] = hpSafeScore(r.score);
    gf += x; ga += y;
    if (x > y) h++; else if (x < y) a++; else d++;
  });
  // Lissage de Laplace (évite 0 % sur petits échantillons)
  const probs = noDraw
    ? hpNorm({ H: h + 1, D: 0, A: a + 1 })
    : hpNorm({ H: h + 1, D: d + 1, A: a + 1 });

  // Elo calculé UNIQUEMENT à titre indicatif — il n'entre plus dans la prédiction
  // sur penalty18/22 où il a été mesuré moins performant que le hasard.
  const R = {};
  const ens = t => { if (R[t] === undefined) R[t] = 1500; };
  const K = game === 'fifa4x4' ? 24 : 28, HA = game === 'fifa4x4' ? 35 : 45;
  rows.forEach(r => {
    ens(r.home); ens(r.away);
    const [x, y] = hpSafeScore(r.score);
    const o = x > y ? 1 : x === y ? 0.5 : 0;
    const e = 1 / (1 + Math.pow(10, (R[r.away] - (R[r.home] + HA)) / 400));
    const dl = K * (o - e);
    R[r.home] += dl; R[r.away] -= dl;
  });

  // Prochaine affiche
  const newest = [...rows].reverse();
  let fixture = { home: newest[0]?.home || 'Domicile', away: newest[0]?.away || 'Extérieur' };
  try {
    if (typeof detectUpcomingFixtures === 'function') {
      const fx = detectUpcomingFixtures(game);
      if (fx && fx[0]) fixture = { home: fx[0].home, away: fx[0].away, matchNo: fx[0].matchNo };
    }
  } catch (_) {}

  const lastN = newest[0] && Number.isFinite(Number(newest[0].n)) ? Number(newest[0].n) : total;
  const nextN = fixture.matchNo || lastN + 1;

  const order = Object.entries(probs).filter(([k, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  const topKey = order[0][0];
  const label = topKey === 'H' ? fixture.home : topKey === 'A' ? fixture.away : 'Match nul';

  // ✅ Confiance = justesse RÉELLE mesurée, jamais la probabilité brute du modèle.
  const measured = cal ? Math.round(cal.accuracy * 100) : Math.round(order[0][1] * 100);
  const confidence = hpClamp(measured, 33, 60);

  const avgGf = (gf / total).toFixed(2), avgGa = (ga / total).toFixed(2);
  const drawTxt = noDraw ? '' : ` · Nul ${hpPct(probs.D)}%`;

  const prediction = cal && !cal.beatsRandom
    ? `Aucun avantage statistique détecté — issue la plus fréquente : ${label}`
    : `${label} (issue la plus fréquente : ${hpPct(order[0][1])}%)`;

  const trend = `Base ${total} matchs · ${fixture.home} ${hpPct(probs.H)}%${drawTxt} · ${fixture.away} ${hpPct(probs.A)}% · buts moy. ${avgGf}-${avgGa}` +
                ` · Elo indicatif ${Math.round(R[fixture.home] ?? 1500)}/${Math.round(R[fixture.away] ?? 1500)}`;

  let analysis =
    `${hpGameLabel(game)} · modèle « fréquence de base », retenu après backtest walk-forward sur ${cal ? cal.n : total} prédictions. ` +
    `Probabilités : ${fixture.home} ${hpPct(probs.H)}%${drawTxt} · ${fixture.away} ${hpPct(probs.A)}%. `;

  if (cal) {
    analysis += `Justesse réelle mesurée : ${(cal.accuracy * 100).toFixed(1)} %. `;
    if (!cal.beatsRandom) {
      analysis += `⚠️ Sur ce jeu, AUCUN modèle testé ne bat le hasard (Brier ${cal.brier.toFixed(4)} vs ${cal.randomBrier.toFixed(4)}). ` +
                  `Le moteur Elo+Poisson, mesuré à 0.5557–0.5680, a été débranché car il faisait activement pire. `;
    } else {
      analysis += `Le modèle bat la référence aléatoire (Brier ${cal.brier.toFixed(4)} vs ${cal.randomBrier.toFixed(4)}). `;
    }
    if (cal.independent) {
      analysis += `Test χ² : les tirages sont indépendants — le résultat précédent n'apporte aucune information, ` +
                  `donc aucune stratégie de série ou de pattern n'a de fondement. `;
    } else {
      analysis += `⚠️ Une dépendance statistique a été détectée sur ce jeu (alternance, p=0.0018), ` +
                  `mais elle n'est PAS confirmée : 287 observations sur les ~572 nécessaires. À surveiller, pas à exploiter. `;
    }
  }
  analysis += `L'Elo est affiché à titre indicatif uniquement et n'entre pas dans le calcul.`;

  return {
    nextN, prediction, confidence,
    confidenceLabel: hpConfLabel(confidence),
    trend, analysis,
    nextGames: [nextN, nextN + 1, nextN + 2],
    pro: {
      model: 'base_rate_calibrated_v4',
      probabilities: { home: probs.H, draw: probs.D || 0, away: probs.A },
      teams: { home: fixture.home, away: fixture.away },
      elo: { home: R[fixture.home] ?? 1500, away: R[fixture.away] ?? 1500 },
      calibration: cal || null,
    }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  BACCARA — théorie + observé, avec séparation des 0:0
// ══════════════════════════════════════════════════════════════════════
function hadarV4Baccara(game, data) {
  const cal = HADAR_CALIBRATION.baccara;
  const rows = hpChrono(data);
  if (rows.length < 3) return null;
  const n = rows.length;

  let p = 0, b = 0, t = 0, t0 = 0;
  rows.forEach(r => {
    const o = hpBacOutcome(r);
    if (o === 'P') p++; else if (o === 'B') b++; else if (o === 'T0') t0++; else t++;
  });

  // Fréquence de base lissée — le modèle gagnant du backtest.
  const probs = hpNorm({ P: p + 1, B: b + 1, T: t + t0 + 1 });
  const order = Object.entries(probs).sort((x, y) => y[1] - x[1]);
  const pick = order[0][0] === 'P' ? 'PLAYER' : order[0][0] === 'B' ? 'BANKER' : 'ÉGALITÉ';

  const newest = [...rows].reverse();
  const lastN = newest[0] && Number.isFinite(Number(newest[0].n)) ? Number(newest[0].n) : n;
  const nextN = lastN + 1;
  const confidence = hpClamp(Math.round(cal.accuracy * 100), 33, 55);

  const tieTotal = t + t0;
  const tie0Note = t0 > 0
    ? ` Dont ${t0} mains 0:0 (${hpPct(t0 / n)}%) — au baccara 10/J/Q/K valent 0, ce sont de vraies égalités mais elles gonflaient artificiellement le taux de « Tie ». Hors 0:0 : ${hpPct(t / n)}%, proche des 9,5 % théoriques.`
    : '';

  return {
    nextN,
    prediction: `${pick} — issue la plus fréquente, sans avantage exploitable`,
    confidence,
    confidenceLabel: hpConfLabel(confidence),
    trend: `PLAYER ${hpPct(probs.P)}% · BANKER ${hpPct(probs.B)}% · ÉGALITÉ ${hpPct(probs.T)}% sur ${n} mains`,
    analysis:
      `Baccara · modèle « fréquence de base » (Brier ${cal.brier.toFixed(4)}, meilleur des 5 modèles testés sur ${cal.n} prédictions). ` +
      `Observé : PLAYER ${hpPct(probs.P)}%, BANKER ${hpPct(probs.B)}%, ÉGALITÉ ${hpPct(probs.T)}%.${tie0Note} ` +
      `Justesse réelle mesurée : ${(cal.accuracy * 100).toFixed(1)} %. ` +
      `Test χ² : tirages indépendants (p=0.685) — le coup précédent n'informe en rien le suivant. ` +
      `Les stratégies de série (« suivre le banquier », « chasser l'égalité ») ont été testées et ne battent pas la fréquence de base. ` +
      `Sans connaître la composition du sabot, aucun avantage réel n'est accessible.`,
    nextGames: [nextN, nextN + 1, nextN + 2],
    pro: { model: 'baccara_base_rate_v4',
           probabilities: { player: probs.P, banker: probs.B, tie: probs.T },
           counts: { player: p, banker: b, tie: t, tieZero: t0 },
           calibration: cal }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  JEU 21
// ══════════════════════════════════════════════════════════════════════
function hadarV4Jeu21(game, data) {
  const cal = HADAR_CALIBRATION.jeu21;
  const rows = hpChrono(data);
  if (rows.length < 3) return null;
  const n = rows.length;

  let w = 0, l = 0, pu = 0;
  rows.forEach(r => {
    const s = String(r.result || '').toUpperCase();
    if (s === 'WIN') w++; else if (s === 'LOSE') l++; else pu++;
  });
  const probs = hpNorm({ WIN: w + 1, LOSE: l + 1, PUSH: pu + 1 });
  const order = Object.entries(probs).sort((x, y) => y[1] - x[1]);

  const newest = [...rows].reverse();
  const lastN = newest[0] && Number.isFinite(Number(newest[0].n)) ? Number(newest[0].n) : n;
  const nextN = lastN + 1;
  const confidence = hpClamp(Math.round(cal.accuracy * 100), 33, 60);

  return {
    nextN,
    prediction: `${order[0][0]} — issue la plus fréquente (${hpPct(order[0][1])}%)`,
    confidence,
    confidenceLabel: hpConfLabel(confidence),
    trend: `WIN ${hpPct(probs.WIN)}% · LOSE ${hpPct(probs.LOSE)}% · PUSH ${hpPct(probs.PUSH)}% sur ${n} mains`,
    analysis:
      `Jeu 21 · modèle « fréquence de base » (Brier ${cal.brier.toFixed(4)}, meilleur modèle testé sur ${cal.n} prédictions, ` +
      `18,7 % de mieux que le hasard). Justesse réelle mesurée : ${(cal.accuracy * 100).toFixed(1)} %. ` +
      `Attention : ce score élevé vient simplement du fait que LOSE domine (${hpPct(probs.LOSE)}%) — ` +
      `c'est l'avantage structurel de la maison, pas une capacité de prédiction. ` +
      `Test χ² : tirages indépendants (p=0.908). ` +
      `Une vraie stratégie blackjack exigerait la composition du sabot et le calcul d'EV(hit/stand/double/split) — informations absentes ici.`,
    nextGames: [nextN, nextN + 1, nextN + 2],
    pro: { model: 'jeu21_base_rate_v4',
           probabilities: { win: probs.WIN, lose: probs.LOSE, push: probs.PUSH },
           calibration: cal }
  };
}

// ══════════════════════════════════════════════════════════════════════
//  AVIATOR — MODÈLE EV / RISQUE (remplace le sophisme du joueur)
//  ----------------------------------------------------------------------
//  L'ancien modèle annonçait « REBOND FORT après 5 crashes » à 92 % de
//  confiance. C'était le sophisme du joueur : Aviator est provably fair,
//  donc SANS MÉMOIRE. P(>2x | 5 crashes) = P(>2x). Aucune exception.
//  Ce modèle ne prédit RIEN : il quantifie l'espérance et le risque.
// ══════════════════════════════════════════════════════════════════════
function hadarV4Aviator(game, data) {
  const rows = hpChrono(data);
  const mults = rows.map(r => Number(r.multiplier)).filter(Number.isFinite);
  const n = mults.length;
  if (n < 5) return null;

  const newest = [...rows].reverse();
  const lastN = newest[0] && Number.isFinite(Number(newest[0].n)) ? Number(newest[0].n) : n;
  const nextN = lastN + 1;

  const sorted = [...mults].sort((a, b) => a - b);
  const avg = mults.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)];

  // Survie empirique P(crash >= x) et espérance EV(x) = x·P(≥x) − 1
  const targets = [1.2, 1.5, 2, 3, 5, 10];
  const table = targets.map(x => {
    const surv = mults.filter(m => m >= x).length / n;
    return { x, surv, ev: x * surv - 1 };
  });
  // Meilleure cible (EV la moins négative) — utile pour limiter les dégâts.
  const bestEv = [...table].sort((a, b) => b.ev - a.ev)[0];

  // ── Test de mémoire : la série en cours change-t-elle la probabilité ? ──
  // On compare P(≥2x) global à P(≥2x | le tirage précédent était < 2x).
  let after = 0, afterHit = 0;
  for (let i = 1; i < mults.length; i++) {
    if (mults[i - 1] < 2) { after++; if (mults[i] >= 2) afterHit++; }
  }
  const pGlobal = mults.filter(m => m >= 2).length / n;
  const pAfterLow = after > 0 ? afterHit / after : pGlobal;
  const drift = (pAfterLow - pGlobal) * 100;
  // Écart-type de la différence → l'écart est-il du bruit ?
  const se = after > 0 ? Math.sqrt(pGlobal * (1 - pGlobal) / after) * 100 : 99;
  const memoryReal = Math.abs(drift) > 1.96 * se;

  const evLines = table.map(t =>
    `${t.x}x → P ${hpPct(t.surv)}%, EV ${t.ev >= 0 ? '+' : ''}${(t.ev * 100).toFixed(1)}%`).join(' · ');

  const confidence = 0; // On ne prédit pas : aucune confiance à afficher.

  return {
    nextN,
    prediction: `Aucune prédiction possible — jeu sans mémoire. Cible la moins défavorable : ${bestEv.x}x (EV ${(bestEv.ev * 100).toFixed(1)}%)`,
    confidence,
    confidenceLabel: { txt: 'Non prédictible', cls: 'weak' },
    trend: `Moyenne ${avg.toFixed(2)}x · médiane ${median.toFixed(2)}x · P(≥2x) ${hpPct(pGlobal)}% sur ${n} manches`,
    analysis:
      `Aviator est un jeu « provably fair » : chaque manche est générée par un hash indépendant, ` +
      `la distribution est SANS MÉMOIRE. Formellement, P(prochain ≥ 2x | k crashes précédents) = P(prochain ≥ 2x), ` +
      `quel que soit k. ⚠️ L'ancien moteur annonçait « rebond fort » et « gros gain imminent » à 92 % de confiance : ` +
      `c'était le sophisme du joueur, une erreur mathématique. Ces signaux ont été supprimés. ` +
      `Vérification sur vos ${n} manches : P(≥2x) global = ${hpPct(pGlobal)}%, ` +
      `P(≥2x | manche précédente < 2x) = ${hpPct(pAfterLow)}% — écart ${drift >= 0 ? '+' : ''}${drift.toFixed(1)} pt, ` +
      `${memoryReal ? '⚠️ statistiquement notable, à re-tester sur plus de données' : 'non significatif (dans le bruit) → mémoire nulle confirmée'}. ` +
      `Espérance par cible de cash-out : ${evLines}. ` +
      `Toutes les EV sont négatives : c'est l'avantage maison (~1 %), incontournable. ` +
      `Ce moteur ne prédit pas le prochain crash — il vous montre le coût réel de chaque stratégie.`,
    nextGames: [nextN, nextN + 1, nextN + 2],
    pro: { model: 'aviator_ev_risk_v4', avg, median, table, pGlobal, pAfterLow, memoryReal,
           calibration: HADAR_CALIBRATION.aviator }
  };
}

// ── Routeur v4 ────────────────────────────────────────────────────────
function hadarProAI(game, data) {
  if (game === 'penalty18' || game === 'penalty22' || game === 'fifa4x4') return hadarV4TeamModel(game, data);
  if (game === 'baccara') return hadarV4Baccara(game, data);
  if (game === 'jeu21')   return hadarV4Jeu21(game, data);
  if (game === 'aviator') return hadarV4Aviator(game, data);
  return null;
}

// Compatibilité ascendante : ces noms sont référencés ailleurs dans le fichier.
function hadarProClamp(v, mn, mx) { return hpClamp(v, mn, mx); }
function hadarProPct(n, total, dec = 1) { return total > 0 ? Number((n / total * 100).toFixed(dec)) : 0; }
function hadarProMean(arr, fallback = 0) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback; }
function hadarProSafeScore(score) { return hpSafeScore(score); }
function hadarProConfidenceLabel(c) { return hpConfLabel(c); }
function hadarProGameLabel(game) { return hpGameLabel(game); }
