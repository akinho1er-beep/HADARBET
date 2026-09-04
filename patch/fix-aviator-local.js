// Remplace le bloc Aviator de analyzeLocal() — sophisme du joueur → EV/risque
'use strict';
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'betting-analyzer.html');
let h = fs.readFileSync(F, 'utf8');

const START = `  // ══════════════════════════════════════════
  // MOTEUR AVIATOR — IA PRÉDICTIVE MULTI-FACTORIELLE
  // ══════════════════════════════════════════
  if (game === 'aviator') {`;
const END = `      { prediction: recoText, confiance: null, raisonnement: recoDetail, tags: ['RECOMMANDATION'], horizon: '⭐ Recommandation IA', isReco: true }
    ];
  }`;

const si = h.indexOf(START);
const ei = h.indexOf(END);
if (si === -1 || ei === -1) {
  console.log('⚠️  Bloc Aviator introuvable (déjà corrigé ?)');
  process.exit(0);
}

const NEW = `  // ══════════════════════════════════════════
  // MOTEUR AVIATOR — ESPÉRANCE & RISQUE
  // ------------------------------------------
  // ⚠️ L'ancienne version de ce bloc annonçait « REBOND FORT après N crashes »
  // et « gros gain imminent » avec 78–92 % de confiance. C'était le sophisme
  // du joueur : Aviator est « provably fair », donc SANS MÉMOIRE.
  // P(prochain ≥ 2x | k crashes) = P(prochain ≥ 2x), quel que soit k.
  // Le test χ² sur données réelles a confirmé l'indépendance des tirages.
  // Ces signaux ont été supprimés : ils promettaient un avantage inexistant.
  // ══════════════════════════════════════════
  if (game === 'aviator') {
    const mults = data.map(r => Number(r.multiplier)).filter(Number.isFinite);
    const total = mults.length;
    if (!total) return [];
    const avg = mults.reduce((a, b) => a + b, 0) / total;
    const sorted = [...mults].sort((a, b) => a - b);
    const median = sorted[Math.floor(total / 2)];
    const lpct = pct(mults.filter(m => m < 2).length, total);
    const mpct = pct(mults.filter(m => m >= 2 && m < 10).length, total);
    const hpct = pct(mults.filter(m => m >= 10).length, total);

    // Survie empirique + espérance par cible
    const targets = [1.5, 2, 3, 5, 10];
    const evRows = targets.map(x => {
      const surv = mults.filter(m => m >= x).length / total;
      return { x, surv, ev: x * surv - 1 };
    });
    const evTxt = evRows.map(t => t.x + 'x: P=' + Math.round(t.surv * 100) + '%').join(' · ');

    // Test de mémoire empirique : P(≥2x) après un crash précoce vs global
    let after = 0, hit = 0;
    for (let i = 1; i < mults.length; i++) {
      if (mults[i - 1] < 2) { after++; if (mults[i] >= 2) hit++; }
    }
    const pGlobal = mults.filter(m => m >= 2).length / total;
    const pAfter = after > 0 ? hit / after : pGlobal;
    const drift = (pAfter - pGlobal) * 100;
    const se = after > 0 ? Math.sqrt(pGlobal * (1 - pGlobal) / after) * 100 : 99;
    const memoryReal = Math.abs(drift) > 1.96 * se;

    return [
      {
        prediction: '🎲 Aucune prédiction possible — jeu sans mémoire',
        confiance: null,
        raisonnement: 'Aviator est « provably fair » : chaque manche provient d\\'un hash indépendant. ' +
          'Aucune série passée n\\'influence la suivante. Vérification sur vos ' + total + ' manches : ' +
          'P(≥2x) global = ' + Math.round(pGlobal * 100) + '%, P(≥2x | manche précédente < 2x) = ' + Math.round(pAfter * 100) + '% — ' +
          'écart ' + (drift >= 0 ? '+' : '') + drift.toFixed(1) + ' pt, ' +
          (memoryReal ? 'à re-tester sur plus de données.' : 'non significatif → mémoire nulle confirmée.'),
        tags: ['INDÉPENDANT', 'PROVABLY FAIR'],
        horizon: 'Signal principal'
      },
      {
        prediction: '📊 Probabilité de survie par cible',
        confiance: null,
        raisonnement: 'Distribution observée sur ' + total + ' manches : ' + lpct + '% < 2x · ' + mpct + '% entre 2x et 10x · ' + hpct + '% > 10x. ' +
          'Moyenne ' + avg.toFixed(2) + 'x, médiane ' + median.toFixed(2) + 'x. Chances d\\'atteindre chaque cible : ' + evTxt + '. ' +
          'Ces chiffres décrivent le passé — ils ne prédisent pas la prochaine manche.',
        tags: ['DISTRIBUTION'],
        horizon: 'Lecture statistique'
      },
      {
        prediction: '⚠️ Espérance négative sur toute stratégie',
        confiance: null,
        raisonnement: 'Un crash game équitable vérifie P(crash ≥ x) = (1 − marge) / x. ' +
          'L\\'espérance vaut donc −marge (environ −1 %) pour TOUTE cible de cash-out : viser 1.5x, 2x ou 10x ' +
          'change la variance, jamais l\\'espérance. Aucune stratégie de cash-out, aucune martingale et aucun ' +
          'suivi de série ne peut rendre ce jeu gagnant sur la durée.',
        tags: ['ESPÉRANCE', 'RISQUE'],
        horizon: 'Gestion du risque'
      },
      {
        prediction: '🎯 Cash-out régulier autour de ' + median.toFixed(2) + 'x',
        confiance: null,
        raisonnement: 'Si vous jouez malgré l\\'espérance négative : viser la médiane (' + median.toFixed(2) + 'x) ' +
          'maximise la fréquence des gains et limite la variance — environ une manche sur deux. ' +
          'Viser haut (>10x) réussit ' + hpct + '% du temps et expose à de longues séries perdantes. ' +
          'Fixez une limite de perte AVANT de jouer et respectez-la.',
        tags: ['RECOMMANDATION'],
        horizon: '⭐ Recommandation IA',
        isReco: true
      }
    ];
  }`;

h = h.slice(0, si) + NEW + h.slice(ei + END.length);
fs.writeFileSync(F, h);
console.log('✅ Bloc Aviator de analyzeLocal() remplacé par le modèle EV/risque');
