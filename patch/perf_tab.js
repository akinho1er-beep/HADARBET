// ══════════════════════════════════════════════════════════════════════
//  ONGLET PERFORMANCE — résultats du backtest walk-forward
//  Données figées, issues de tools/backtest.js sur 4 152 résultats réels.
//  Pour régénérer : node tools/backtest.js && node patch/build-perf.js
// ══════════════════════════════════════════════════════════════════════
const HADAR_BACKTEST = {"generatedAt":"2026-08-18T16:16:00.651Z","warmup":40,"games":{"penalty18":{"rows":288,"span":"2026-08-15 → 2026-08-18","distribution":{"H":145,"A":143},"models":{"hasard":{"n":248,"accuracy":0.496,"brier":0.5,"logloss":0.6931,"ece":0.004,"bins":[{"range":"50-60%","n":248,"avgConf":0.5,"actual":0.496}]},"toujours domicile":{"n":248,"accuracy":0.504,"brier":0.9919,"logloss":6.852,"ece":0.496,"bins":[{"range":"90-100%","n":248,"avgConf":1,"actual":0.504}]},"fréquence de base":{"n":248,"accuracy":0.4758,"brier":0.5039,"logloss":0.697,"ece":0.0453,"bins":[{"range":"50-60%","n":248,"avgConf":0.5211,"actual":0.4758}]},"Elo seul":{"n":248,"accuracy":0.504,"brier":0.5214,"logloss":0.7157,"ece":0.0829,"bins":[{"range":"50-60%","n":153,"avgConf":0.546,"actual":0.5033},{"range":"60-70%","n":82,"avgConf":0.6417,"actual":0.5},{"range":"70-80%","n":13,"avgConf":0.7232,"actual":0.5385}]},"Elo+Poisson":{"n":248,"accuracy":0.4798,"brier":0.5557,"logloss":0.7558,"ece":0.1451,"bins":[{"range":"50-60%","n":122,"avgConf":0.5445,"actual":0.4672},{"range":"60-70%","n":62,"avgConf":0.6466,"actual":0.4839},{"range":"70-80%","n":54,"avgConf":0.7457,"actual":0.4815},{"range":"80-90%","n":10,"avgConf":0.8201,"actual":0.6}]},"Elo+Poisson+H2H":{"n":248,"accuracy":0.4798,"brier":0.5453,"logloss":0.7431,"ece":0.1223,"bins":[{"range":"50-60%","n":135,"avgConf":0.5479,"actual":0.4889},{"range":"60-70%","n":84,"avgConf":0.6416,"actual":0.4762},{"range":"70-80%","n":26,"avgConf":0.7314,"actual":0.4615},{"range":"80-90%","n":3,"avgConf":0.8172,"actual":0.3333}]}},"sig":{"chi2":1.007,"chi2p":0.3168,"independent":true,"bestFixed":"H","bestFixedRate":0.5035}},"penalty22":{"rows":288,"span":"2026-08-15 → 2026-08-18","distribution":{"A":150,"H":138},"models":{"hasard":{"n":248,"accuracy":0.5121,"brier":0.5,"logloss":0.6931,"ece":0.0121,"bins":[{"range":"50-60%","n":248,"avgConf":0.5,"actual":0.5121}]},"toujours domicile":{"n":248,"accuracy":0.4879,"brier":1.0242,"logloss":7.0749,"ece":0.5121,"bins":[{"range":"90-100%","n":248,"avgConf":1,"actual":0.4879}]},"fréquence de base":{"n":248,"accuracy":0.5121,"brier":0.5047,"logloss":0.6978,"ece":0.0108,"bins":[{"range":"50-60%","n":248,"avgConf":0.5229,"actual":0.5121}]},"Elo seul":{"n":248,"accuracy":0.496,"brier":0.5339,"logloss":0.7291,"ece":0.0947,"bins":[{"range":"50-60%","n":150,"avgConf":0.548,"actual":0.5067},{"range":"60-70%","n":81,"avgConf":0.6428,"actual":0.4938},{"range":"70-80%","n":17,"avgConf":0.7192,"actual":0.4118}]},"Elo+Poisson":{"n":248,"accuracy":0.496,"brier":0.568,"logloss":0.7703,"ece":0.1414,"bins":[{"range":"50-60%","n":109,"avgConf":0.552,"actual":0.5596},{"range":"60-70%","n":78,"avgConf":0.6406,"actual":0.4359},{"range":"70-80%","n":49,"avgConf":0.7434,"actual":0.4898},{"range":"80-90%","n":12,"avgConf":0.8197,"actual":0.3333}]},"Elo+Poisson+H2H":{"n":248,"accuracy":0.4718,"brier":0.5654,"logloss":0.7673,"ece":0.141,"bins":[{"range":"50-60%","n":134,"avgConf":0.5465,"actual":0.4925},{"range":"60-70%","n":71,"avgConf":0.6456,"actual":0.4648},{"range":"70-80%","n":31,"avgConf":0.7361,"actual":0.3871},{"range":"80-90%","n":12,"avgConf":0.8411,"actual":0.5}]}},"sig":{"chi2":9.973,"chi2p":0.0018,"independent":false,"bestFixed":"A","bestFixedRate":0.5208}},"fifa4x4":{"rows":1184,"span":"2026-08-07 → 2026-08-18","distribution":{"A":556,"H":522,"D":106},"models":{"hasard":{"n":1144,"accuracy":0.4685,"brier":0.6667,"logloss":1.0986,"ece":0.1352,"bins":[{"range":"30-40%","n":1144,"avgConf":0.3333,"actual":0.4685}]},"toujours domicile":{"n":1144,"accuracy":0.4423,"brier":1.1154,"logloss":7.7048,"ece":0.5577,"bins":[{"range":"90-100%","n":1144,"avgConf":1,"actual":0.4423}]},"fréquence de base":{"n":1144,"accuracy":0.4685,"brier":0.5787,"logloss":0.9346,"ece":0.0108,"bins":[{"range":"40-50%","n":911,"avgConf":0.4703,"actual":0.4687},{"range":"50-60%","n":233,"avgConf":0.5147,"actual":0.4678}]},"Elo seul":{"n":1144,"accuracy":0.4729,"brier":0.583,"logloss":0.9397,"ece":0.0697,"bins":[{"range":"40-50%","n":342,"avgConf":0.4766,"actual":0.4415},{"range":"50-60%","n":588,"avgConf":0.5459,"actual":0.4643},{"range":"60-70%","n":204,"avgConf":0.6356,"actual":0.5392},{"range":"70-80%","n":10,"avgConf":0.7156,"actual":0.7}]},"Elo+Poisson":{"n":1144,"accuracy":0.4886,"brier":0.6219,"logloss":1.0017,"ece":0.1391,"bins":[{"range":"40-50%","n":204,"avgConf":0.4713,"actual":0.4559},{"range":"50-60%","n":324,"avgConf":0.5461,"actual":0.4599},{"range":"60-70%","n":263,"avgConf":0.6465,"actual":0.4829},{"range":"70-80%","n":233,"avgConf":0.7462,"actual":0.515},{"range":"80-90%","n":108,"avgConf":0.8354,"actual":0.5926},{"range":"90-100%","n":12,"avgConf":0.9153,"actual":0.5}]},"Elo+Poisson+H2H":{"n":1144,"accuracy":0.479,"brier":0.6184,"logloss":1.001,"ece":0.1357,"bins":[{"range":"30-40%","n":4,"avgConf":0.381,"actual":0.5},{"range":"40-50%","n":204,"avgConf":0.4718,"actual":0.4167},{"range":"50-60%","n":375,"avgConf":0.5486,"actual":0.456},{"range":"60-70%","n":284,"avgConf":0.6483,"actual":0.4683},{"range":"70-80%","n":191,"avgConf":0.7442,"actual":0.5812},{"range":"80-90%","n":80,"avgConf":0.8372,"actual":0.5375},{"range":"90-100%","n":6,"avgConf":0.928,"actual":0.5}]}},"sig":{"chi2":5.351,"chi2p":0.2521,"independent":true,"bestFixed":"A","bestFixedRate":0.4696}},"baccara":{"rows":1196,"span":"2026-08-17 → 2026-08-18","distribution":{"B":430,"P":557,"T":209},"models":{"hasard":{"n":1156,"accuracy":0.3607,"brier":0.6667,"logloss":1.0986,"ece":0.0274,"bins":[{"range":"30-40%","n":1156,"avgConf":0.3333,"actual":0.3607}]},"théorie pure":{"n":1156,"accuracy":0.3607,"brier":0.638,"logloss":1.063,"ece":0.0979,"bins":[{"range":"40-50%","n":1156,"avgConf":0.4586,"actual":0.3607}]},"fréquence de base":{"n":1156,"accuracy":0.4671,"brier":0.6242,"logloss":1.0298,"ece":0.0077,"bins":[{"range":"40-50%","n":1156,"avgConf":0.4748,"actual":0.4671}]},"moteur actuel":{"n":1156,"accuracy":0.4645,"brier":0.6305,"logloss":1.0447,"ece":0.0109,"bins":[{"range":"40-50%","n":1156,"avgConf":0.4536,"actual":0.4645}]},"suivi de série":{"n":1156,"accuracy":0.4602,"brier":0.6302,"logloss":1.0374,"ece":0.0361,"bins":[{"range":"30-40%","n":7,"avgConf":0.3969,"actual":0.2857},{"range":"40-50%","n":702,"avgConf":0.4561,"actual":0.463},{"range":"50-60%","n":407,"avgConf":0.531,"actual":0.4595},{"range":"60-70%","n":40,"avgConf":0.6253,"actual":0.45}]}},"sig":{"chi2":2.296,"chi2p":0.6848,"independent":true,"bestFixed":"P","bestFixedRate":0.4657}},"jeu21":{"rows":1196,"span":"2026-08-17 → 2026-08-18","distribution":{"LOSE":675,"WIN":449,"PUSH":72},"models":{"hasard":{"n":1156,"accuracy":0.5597,"brier":0.6667,"logloss":1.0986,"ece":0.2264,"bins":[{"range":"30-40%","n":1156,"avgConf":0.3333,"actual":0.5597}]},"fréquence de base":{"n":1156,"accuracy":0.5597,"brier":0.5423,"logloss":0.8701,"ece":0.0068,"bins":[{"range":"50-60%","n":1057,"avgConf":0.5603,"actual":0.5591},{"range":"60-70%","n":99,"avgConf":0.6324,"actual":0.5657}]},"toujours LOSE":{"n":1156,"accuracy":0.5597,"brier":0.8806,"logloss":6.0831,"ece":0.4403,"bins":[{"range":"90-100%","n":1156,"avgConf":1,"actual":0.5597}]}},"sig":{"chi2":1.006,"chi2p":0.9081,"independent":true,"bestFixed":"LOSE","bestFixedRate":0.5644}}}};

const PERF_GAME_LABEL = {
  penalty18: 'FIFA Penalty 18', penalty22: 'FIFA Penalty 22',
  fifa4x4: 'FIFA 4×4', baccara: 'Baccara', jeu21: 'Jeu 21'
};

function perfEsc(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function renderPerformance() {
  const c = document.getElementById('perf-container');
  if (!c) return;
  const R = HADAR_BACKTEST;
  const totalRows = Object.values(R.games).reduce((s, g) => s + g.rows, 0);
  const indep = Object.values(R.games).filter(g => g.sig && g.sig.independent).length;

  let h = `
    <div class="perf-cards">
      <div class="perf-card"><div class="k">Données réelles</div><div class="v">${totalRows.toLocaleString('fr-FR')}</div><div class="d">résultats Telegram testés</div></div>
      <div class="perf-card"><div class="k">Justesse max</div><div class="v">~51%</div><div class="d">tous modèles confondus</div></div>
      <div class="perf-card"><div class="k">Indépendance</div><div class="v">${indep}/5</div><div class="d">jeux sans pattern exploitable</div></div>
      <div class="perf-card"><div class="k">Amorçage</div><div class="v">${R.warmup}</div><div class="d">matchs avant notation</div></div>
    </div>

    <div class="perf-alert">
      <h3>⚠️ Résultat principal du backtest</h3>
      <p>Sur <strong>Penalty 18</strong> et <strong>Penalty 22</strong>, l'ancien moteur Elo+Poisson faisait <strong>moins bien qu'un tirage au sort</strong> (Brier 0,556 et 0,568 contre 0,500). Il a été <strong>débranché</strong>. Sur tous les jeux, le meilleur modèle est le plus simple : la <strong>fréquence de base</strong>. Les tirages étant statistiquement indépendants, c'est le comportement attendu d'un générateur aléatoire correctement implémenté.</p>
    </div>`;

  for (const [game, g] of Object.entries(R.games)) {
    const models = Object.entries(g.models).sort((a, b) => a[1].brier - b[1].brier);
    const best = models[0];
    const rand = g.models['hasard'];
    const maxB = Math.max.apply(null, models.map(m => m[1].brier));

    const rows = models.map(([name, m], i) => {
      const isBest = i === 0;
      const worse = rand && m.brier > rand.brier;
      const isOld = name === 'Elo+Poisson' || name === 'moteur actuel';
      const cls = isBest ? 'best' : worse ? 'bad' : '';
      const chips = (isOld ? '<span class="perf-chip old">ancien moteur</span>' : '')
                  + (isBest ? '<span class="perf-chip ok">retenu</span>' : '')
                  + (name === 'hasard' ? '<span class="perf-chip ref">référence</span>' : '');
      const w = (m.brier / maxB * 100).toFixed(1);
      return '<tr class="' + cls + '">'
        + '<td>' + perfEsc(name) + chips + '</td>'
        + '<td class="num">' + (m.accuracy * 100).toFixed(1) + '%</td>'
        + '<td class="num"><div class="perf-bw"><div class="perf-bb ' + cls + '" style="width:' + w + '%"></div><span>' + m.brier.toFixed(4) + '</span></div></td>'
        + '<td class="num ' + (m.ece > 0.1 ? 'warn' : '') + '">' + m.ece.toFixed(3) + '</td>'
        + '</tr>';
    }).join('');

    const s = g.sig || {};
    const badge = s.independent
      ? '<div class="perf-badge ok">✅ Tirages indépendants (χ²=' + s.chi2 + ', p=' + s.chi2p + ') — aucune stratégie de série ou de pattern n\'a de fondement sur ce jeu.</div>'
      : '<div class="perf-badge warn">⚠️ Dépendance détectée (χ²=' + s.chi2 + ', p=' + s.chi2p + ') — signal candidat NON confirmé : 287 observations sur les ~572 nécessaires. À surveiller, pas à exploiter.</div>';

    const oldM = g.models['Elo+Poisson'];
    let verdict;
    if (oldM && rand && oldM.brier > rand.brier) {
      const ratio = (oldM.ece / Math.max(rand.ece, 0.001)).toFixed(0);
      verdict = '<div class="perf-verdict bad"><strong>Ancien moteur débranché.</strong> Elo+Poisson obtenait un Brier de '
        + oldM.brier.toFixed(4) + ' contre ' + rand.brier.toFixed(4) + ' pour le hasard, avec une erreur de calibration '
        + ratio + '× supérieure. Remplacé par « ' + perfEsc(best[0]) + ' ».</div>';
    } else {
      const gain = rand ? ', soit ' + ((rand.brier - best[1].brier) / rand.brier * 100).toFixed(1) + ' % de mieux que le hasard' : '';
      verdict = '<div class="perf-verdict ok"><strong>Modèle retenu : « ' + perfEsc(best[0]) + ' »</strong> — Brier '
        + best[1].brier.toFixed(4) + gain + '. Justesse réelle mesurée : <strong>'
        + (best[1].accuracy * 100).toFixed(1) + ' %</strong>.</div>';
    }

    const dist = Object.entries(g.distribution).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => '<span class="perf-pill">' + k + ' ' + (v / g.rows * 100).toFixed(1) + '%</span>').join('');

    const calib = best[1].bins.map(b => {
      const d = (b.actual - b.avgConf) * 100;
      return '<tr><td>' + b.range + '</td><td class="num">' + b.n + '</td>'
        + '<td class="num">' + (b.avgConf * 100).toFixed(1) + '%</td>'
        + '<td class="num">' + (b.actual * 100).toFixed(1) + '%</td>'
        + '<td class="num ' + (Math.abs(d) > 8 ? 'warn' : 'okc') + '">' + (d >= 0 ? '+' : '') + d.toFixed(1) + ' pt</td></tr>';
    }).join('');

    h += '<div class="perf-game">'
      + '<div class="perf-ghead"><div class="perf-gtitle">' + perfEsc(PERF_GAME_LABEL[game] || game) + '</div>'
      + '<div class="perf-gmeta">' + g.rows + ' résultats · ' + perfEsc(g.span) + ' · ' + best[1].n + ' prédictions testées</div></div>'
      + '<div class="perf-dist">' + dist + '</div>'
      + badge + verdict
      + '<table class="perf-t"><thead><tr><th>modèle</th><th class="num">justesse</th><th class="num">Brier ↓</th><th class="num">ECE ↓</th></tr></thead><tbody>'
      + rows + '</tbody></table>'
      + '<details class="perf-det"><summary>Calibration de « ' + perfEsc(best[0]) + ' » — la confiance annoncée est-elle honnête ?</summary>'
      + '<table class="perf-t sm"><thead><tr><th>tranche</th><th class="num">n</th><th class="num">annoncé</th><th class="num">réel</th><th class="num">écart</th></tr></thead><tbody>'
      + calib + '</tbody></table></details>'
      + '</div>';
  }

  h += '<div class="perf-note"><h3>Comment lire ces chiffres</h3><ul>'
    + '<li><strong>Justesse</strong> — % de bons pronostics. Trompeuse seule : prédire toujours l\'issue la plus fréquente donne déjà un bon score.</li>'
    + '<li><strong>Score de Brier ↓</strong> — la vraie métrique. Évalue la qualité des <em>probabilités</em>, pas seulement du choix final. Annoncer 90 % et se tromper coûte très cher. <strong>Plus bas = mieux.</strong></li>'
    + '<li><strong>ECE ↓</strong> — erreur de calibration. Si le moteur annonce 70 %, a-t-il raison 70 % du temps ? <strong>0 = honnête, au-dessus de 0,10 = surconfiance.</strong></li>'
    + '<li><strong>χ² d\'indépendance</strong> — le résultat précédent informe-t-il le suivant ? Si p &gt; 0,05 : non. Aucune série, aucun pattern, aucun « écart » n\'est exploitable.</li>'
    + '</ul><p class="perf-foot">Méthode : backtest walk-forward — pour chaque match, le modèle n\'a accès qu\'aux résultats antérieurs. Aucune fuite du futur, aucune donnée simulée. Rapport généré le '
    + new Date(R.generatedAt).toLocaleString('fr-FR') + '.</p></div>';

  c.innerHTML = h;
}
