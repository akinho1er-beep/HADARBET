// Génère performance.html : tableau de bord autonome (données inline, zéro réseau)
'use strict';
const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, '..', 'data');
const bt = JSON.parse(fs.readFileSync(path.join(D, 'backtest.json'), 'utf8'));
const sg = JSON.parse(fs.readFileSync(path.join(D, 'significance.json'), 'utf8'));

const GAME_LABEL = {
  penalty18: 'FIFA Penalty 18', penalty22: 'FIFA Penalty 22',
  fifa4x4: 'FIFA 4×4', baccara: 'Baccara', jeu21: 'Jeu 21',
};

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ── Cartes de synthèse ───────────────────────────────────────
const totalRows = Object.values(bt.games).reduce((s, g) => s + g.rows, 0);
const indepCount = Object.values(sg).filter(g => g.independent).length;

// ── Sections par jeu ─────────────────────────────────────────
let sections = '';
for (const [game, g] of Object.entries(bt.games)) {
  const models = Object.entries(g.results).sort((a, b) => a[1].brier - b[1].brier);
  const rand = g.results['hasard'];
  const best = models[0];
  const current = g.results['Elo+Poisson'] || g.results['moteur actuel'] || null;
  const maxBrier = Math.max(...models.map(m => m[1].brier));

  const rows = models.map(([name, r], i) => {
    const isBest = i === 0;
    const isRand = name === 'hasard';
    const isCur = name === 'Elo+Poisson' || name === 'moteur actuel';
    const worseThanRandom = rand && r.brier > rand.brier;
    const w = (r.brier / maxBrier) * 100;
    const cls = isBest ? 'best' : worseThanRandom ? 'bad' : '';
    return `<tr class="${cls}">
      <td class="mname">${esc(name)}${isCur ? ' <span class="chip cur">moteur actuel</span>' : ''}${isBest ? ' <span class="chip ok">meilleur</span>' : ''}${isRand ? ' <span class="chip ref">référence</span>' : ''}</td>
      <td class="num">${(r.accuracy * 100).toFixed(1)}%</td>
      <td class="num"><div class="bwrap"><div class="bbar ${cls}" style="width:${w.toFixed(1)}%"></div><span>${r.brier.toFixed(4)}</span></div></td>
      <td class="num">${r.logloss.toFixed(3)}</td>
      <td class="num ${r.ece > 0.1 ? 'warn' : ''}">${r.ece.toFixed(3)}</td>
    </tr>`;
  }).join('');

  // Calibration du meilleur
  const calib = best[1].bins.map(b => {
    const d = (b.actual - b.avgConf) * 100;
    return `<tr><td>${b.range}</td><td class="num">${b.n}</td><td class="num">${(b.avgConf * 100).toFixed(1)}%</td><td class="num">${(b.actual * 100).toFixed(1)}%</td><td class="num ${Math.abs(d) > 8 ? 'warn' : 'ok'}">${d >= 0 ? '+' : ''}${d.toFixed(1)} pt</td></tr>`;
  }).join('');

  const s = sg[game] || {};
  const indepBadge = s.independent
    ? `<span class="badge ok">✅ Tirages indépendants — aucun pattern exploitable (χ²=${s.chi2.toFixed(2)}, p=${s.chi2p.toFixed(3)})</span>`
    : `<span class="badge warn">⚠️ Dépendance détectée (χ²=${s.chi2.toFixed(2)}, p=${s.chi2p.toFixed(4)})</span>`;

  let verdict = '';
  if (current && rand && current.brier > rand.brier) {
    verdict = `<div class="verdict bad"><strong>Le moteur actuel fait pire que le hasard.</strong> Brier ${current.brier.toFixed(4)} contre ${rand.brier.toFixed(4)} pour un tirage au sort, et une erreur de calibration ${(current.ece / rand.ece).toFixed(0)}× supérieure. Il faut le remplacer par « ${esc(best[0])} ».</div>`;
  } else {
    const gain = rand ? ((rand.brier - best[1].brier) / rand.brier * 100) : 0;
    verdict = `<div class="verdict ok"><strong>Meilleur modèle : « ${esc(best[0])} »</strong> — Brier ${best[1].brier.toFixed(4)}, soit ${gain.toFixed(1)} % de mieux que le hasard. Sa justesse réelle plafonne à <strong>${(best[1].accuracy * 100).toFixed(1)} %</strong>.</div>`;
  }

  const dist = Object.entries(g.distribution).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="pill">${k} ${(v / g.rows * 100).toFixed(1)}%</span>`).join('');

  sections += `
  <section class="game">
    <div class="ghead">
      <h2>${esc(GAME_LABEL[game] || game)}</h2>
      <div class="gmeta">${g.rows} résultats · ${esc(g.span)} · ${best[1].n} prédictions testées</div>
    </div>
    <div class="dist">${dist}</div>
    ${indepBadge}
    ${verdict}
    <table class="t">
      <thead><tr><th>modèle</th><th class="num">justesse</th><th class="num">Brier ↓</th><th class="num">logloss ↓</th><th class="num">ECE ↓</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <details>
      <summary>Calibration de « ${esc(best[0])} » — la confiance annoncée est-elle honnête ?</summary>
      <table class="t sm">
        <thead><tr><th>tranche</th><th class="num">n</th><th class="num">annoncé</th><th class="num">réel</th><th class="num">écart</th></tr></thead>
        <tbody>${calib}</tbody>
      </table>
    </details>
  </section>`;
}

const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HADAR — Performance réelle des moteurs</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#02040a;color:#e6edf7;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:28px 18px 60px}
.wrap{max-width:1000px;margin:0 auto}
h1{font-size:26px;font-weight:800;letter-spacing:-.5px;background:linear-gradient(135deg,#00ff9d,#00d4ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:6px}
.sub{color:#7d8da6;font-size:13px;margin-bottom:26px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:30px}
.card{background:rgba(10,18,34,.7);border:1px solid rgba(0,255,157,.14);border-radius:14px;padding:16px}
.card .k{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#7d8da6;margin-bottom:7px}
.card .v{font-size:26px;font-weight:800;color:#00ff9d;line-height:1.1}
.card .d{font-size:11px;color:#7d8da6;margin-top:5px}
.alert{background:linear-gradient(135deg,rgba(255,77,109,.11),rgba(245,166,35,.07));border:1px solid rgba(255,77,109,.32);border-left:3px solid #ff4d6d;border-radius:12px;padding:16px 18px;margin-bottom:26px}
.alert h3{color:#ff4d6d;font-size:14px;margin-bottom:7px}
.alert p{font-size:13px;color:#c9d6e8}
.game{background:rgba(9,16,30,.6);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:20px;margin-bottom:20px}
.ghead{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:12px}
h2{font-size:18px;font-weight:700;color:#fff}
.gmeta{font-size:11px;color:#7d8da6;font-family:ui-monospace,monospace}
.dist{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
.pill{background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.24);color:#7fdcff;border-radius:20px;padding:3px 11px;font-size:11px;font-family:ui-monospace,monospace}
.badge{display:inline-block;font-size:12px;padding:7px 13px;border-radius:9px;margin-bottom:12px}
.badge.ok{background:rgba(0,255,157,.09);border:1px solid rgba(0,255,157,.28);color:#00ff9d}
.badge.warn{background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.32);color:#f5a623}
.verdict{font-size:13px;padding:12px 15px;border-radius:10px;margin-bottom:15px;line-height:1.65}
.verdict.bad{background:rgba(255,77,109,.09);border-left:3px solid #ff4d6d;color:#ffc4ce}
.verdict.ok{background:rgba(0,255,157,.07);border-left:3px solid #00ff9d;color:#b6ffe2}
.verdict strong{color:#fff}
table.t{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:4px}
table.t th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.9px;color:#7d8da6;padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.09);font-weight:600}
table.t td{padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.04)}
table.t .num{text-align:right;font-family:ui-monospace,monospace}
table.t tr.best td{background:rgba(0,255,157,.05)}
table.t tr.bad td{background:rgba(255,77,109,.05)}
.mname{font-weight:600}
.chip{display:inline-block;font-size:9px;text-transform:uppercase;letter-spacing:.7px;padding:2px 6px;border-radius:5px;margin-left:5px;vertical-align:middle;font-weight:700}
.chip.ok{background:rgba(0,255,157,.16);color:#00ff9d}
.chip.cur{background:rgba(255,77,109,.16);color:#ff8fa3}
.chip.ref{background:rgba(255,255,255,.08);color:#9fb0c8}
.bwrap{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:8px}
.bbar{height:15px;border-radius:4px;background:rgba(125,141,166,.28);flex-shrink:1}
.bbar.best{background:linear-gradient(90deg,rgba(0,255,157,.35),rgba(0,255,157,.6))}
.bbar.bad{background:linear-gradient(90deg,rgba(255,77,109,.3),rgba(255,77,109,.55))}
.bwrap span{min-width:52px;text-align:right}
.warn{color:#f5a623}.ok{color:#00ff9d}
details{margin-top:13px;border-top:1px solid rgba(255,255,255,.06);padding-top:11px}
summary{cursor:pointer;font-size:12px;color:#7fdcff;user-select:none}
table.sm{font-size:11.5px;margin-top:9px}
.note{background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.16);border-radius:12px;padding:17px 19px;margin-top:26px;font-size:13px;color:#a9bdd6;line-height:1.75}
.note h3{color:#00d4ff;font-size:14px;margin-bottom:9px}
.note strong{color:#e6edf7}
.note ul{margin:9px 0 0 19px}.note li{margin-bottom:5px}
footer{text-align:center;color:#55627a;font-size:11px;margin-top:34px;font-family:ui-monospace,monospace}
</style></head><body><div class="wrap">
<h1>Performance réelle des moteurs HADAR</h1>
<div class="sub">Backtest walk-forward sur données Telegram authentiques · rapport généré le ${new Date(bt.generatedAt).toLocaleString('fr-FR')}</div>

<div class="cards">
  <div class="card"><div class="k">Données réelles</div><div class="v">${totalRows.toLocaleString('fr-FR')}</div><div class="d">résultats collectés sur 5 jeux</div></div>
  <div class="card"><div class="k">Justesse maximale</div><div class="v">~51 %</div><div class="d">tous modèles, tous jeux confondus</div></div>
  <div class="card"><div class="k">Indépendance</div><div class="v">${indepCount}/5</div><div class="d">jeux sans aucun pattern exploitable</div></div>
  <div class="card"><div class="k">Amorçage</div><div class="v">${bt.warmup}</div><div class="d">matchs avant la 1re prédiction notée</div></div>
</div>

<div class="alert">
  <h3>Résultat principal</h3>
  <p>Sur <strong>Penalty 18</strong> et <strong>Penalty 22</strong>, le moteur <strong>Elo+Poisson fait moins bien qu'un tirage au sort</strong> (Brier 0,556 et 0,568 contre 0,500). Sur les autres jeux, le meilleur modèle est le plus simple possible : la <strong>fréquence de base</strong>. Aucun modèle sophistiqué ne bat cette référence. Les tirages étant statistiquement indépendants, c'est le comportement attendu d'un RNG correctement implémenté.</p>
</div>

${sections}

<div class="note">
  <h3>Comment lire ces chiffres</h3>
  <ul>
    <li><strong>Justesse (accuracy)</strong> — % de bons pronostics. Trompeuse seule : prédire toujours l'issue la plus fréquente donne déjà un bon score.</li>
    <li><strong>Score de Brier ↓</strong> — la vraie métrique. Mesure la qualité des <em>probabilités</em>, pas juste du choix final. Un modèle qui annonce 90 % et se trompe est lourdement pénalisé. <strong>Plus bas = mieux.</strong></li>
    <li><strong>Logloss ↓</strong> — même esprit, sanctionne encore plus durement la confiance mal placée.</li>
    <li><strong>ECE ↓</strong> — erreur de calibration. Si le modèle annonce 70 % de confiance, a-t-il raison 70 % du temps ? <strong>0,00 = parfaitement honnête ; au-dessus de 0,10 = surconfiance.</strong></li>
    <li><strong>Test χ² d'indépendance</strong> — le résultat précédent informe-t-il le suivant ? Si p &gt; 0,05, la réponse est non : aucune stratégie de série, pattern ou « écart » n'a de fondement.</li>
  </ul>
</div>

<footer>HADAR BetAnalytics · validation statistique · aucune donnée simulée</footer>
</div></body></html>`;

fs.writeFileSync(path.join(__dirname, '..', 'performance.html'), html);
console.log(`✅ performance.html — ${(html.length / 1024).toFixed(1)} KB`);
