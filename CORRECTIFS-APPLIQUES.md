# ✅ Correctifs appliqués — HADAR BetAnalytics

Tous les correctifs sont **appliqués, testés et vérifiés en navigateur** (Chrome headless, 0 erreur JS).
Sauvegarde des fichiers d'origine dans `backup/`.

---

## (a) Onglet Performance

Nouvel onglet **🎯 Performance** dans l'app, alimenté par le backtest sur 4 152 résultats réels.

| Élément | Détail |
|---|---|
| 4 cartes de synthèse | 4 152 données · justesse max ~51 % · indépendance 4/5 · amorçage 40 |
| Encadré d'alerte | Explique que l'ancien moteur faisait pire que le hasard |
| Par jeu | Distribution, badge d'indépendance χ², verdict, tableau comparatif des modèles |
| Barres de Brier | Visualisation ; vert = modèle retenu, rouge = pire que le hasard |
| Calibration dépliable | Confiance annoncée vs justesse réelle, par tranche |
| Pédagogie | Comment lire Brier, ECE, χ² |

Données **figées en dur** dans le HTML → l'onglet fonctionne hors ligne, sans appel réseau.
Régénération : `node tools/backtest.js && node patch/build-perf.js`.

---

## (b) Moteur v4 calibré

### Remplacement complet du bloc `hadarPro*` (20,2 Ko d'ancien code)

| Ancien | Nouveau | Pourquoi |
|---|---|---|
| `hadarProTeamModel` (Elo+Poisson) | `hadarV4TeamModel` (fréquence de base) | Brier mesuré 0,556 vs 0,500 pour le hasard |
| `hadarProAviatorModel` (sophisme du joueur, 92 %) | `hadarV4Aviator` (EV + risque) | χ² prouve l'indépendance des tirages |
| `hadarProCasinoModel` | `hadarV4Baccara` / `hadarV4Jeu21` | + séparation des mains 0:0 |

### Confiances : avant / après

| Jeu | Ancien | Nouveau | Justesse réelle mesurée |
|---|---:|---:|---:|
| penalty18 | jusqu'à 88 % | **50 %** « Nulle » | 49,6 % |
| penalty22 | jusqu'à 88 % | **51 %** « Nulle » | 51,2 % |
| fifa4x4 | jusqu'à 88 % | **47 %** « Nulle » | 46,9 % |
| baccara | 54 % | **47 %** | 46,7 % |
| jeu21 | 52–60 % | **56 %** « Faible » | 56,0 % |
| aviator | **92 %** | **0 %** « Non prédictible » | non prédictible |

Chaque confiance est désormais **la justesse réellement mesurée au backtest**, pas une formule inventée.

### Autres correctifs moteur
- **`Math.random()` purgé** des scores de confiance (32 usages) → sortie **déterministe**, vérifié : deux appels identiques donnent le même résultat
- **Bloc Aviator d'`analyzeLocal`** remplacé : « REBOND FORT », « gros gain imminent » supprimés au profit de survie/EV/gestion du risque
- **Ordre chronologique** par `ts` puis `msgId`, jamais par `n`
- **Correctifs 3b/3c/3d** : cohérence score ↔ probabilité, shrinkage H2H `n/(n+k)` au lieu de 60 % en dur, renormalisation complète quand le nul est impossible
- **Elo conservé à titre indicatif** dans l'affichage, mais retiré du calcul
- **Traduction des équipes** branchée sur `translateTeamFR` (plus de cyrillique)
- **Incohérence EV corrigée** : le texte n'affirme plus « toutes les EV sont négatives » quand l'échantillon en montre des positives — il explique que c'est de la variance et rappelle la formule théorique `P(crash ≥ x) = (1−marge)/x`

---

## (c) Bugs de parsing et sécurité

| # | Correctif | Fichier |
|---|---|---|
| c1 | **`parseFifa4x4`** : `n` = msgId Telegram au lieu de `Date.now()` | server.js |
| c2 | **`extractMessagesRich()`** : remonte id + date de chaque message | server.js |
| c3 | **`updateChannel`** rebranché : passe id/ts aux parsers, `ts` = date réelle du message | server.js |
| c4 | **`resultKey`** : déduplication FIFA 4×4 par msgId (plus d'écrasement de matchs distincts) | server.js |
| c5 | **`mergeResults`** + **`/results/:game`** : tri chronologique par `ts` | server.js |
| c6 | **Mot de passe admin en clair supprimé** (`Sh@lom12541`) → généré aléatoirement et affiché une seule fois si `ADMIN_PASS` absent | storage.js |
| c7 | **Fin de la réécriture forcée** du mot de passe admin à chaque démarrage | storage.js |

### Vérification du correctif FIFA 4×4 sur données live

```json
{"n":317380,"home":"Aston Villa","away":"Chelsea","score":"3:0","ts":1787071218000,"msgId":317380}
{"n":317379,"home":"Liverpool","away":"Arsenal","score":"10:5","ts":1787070614000,"msgId":317379}
```

`n` est désormais un identifiant Telegram strictement croissant et stable, avec un horodatage réel.
Avant, `n` changeait à chaque poll.

---

## Tests de validation

| Test | Résultat |
|---|---|
| Syntaxe JS (5 blocs inline) | ✅ 0 erreur |
| `node --check` server.js / storage.js | ✅ OK |
| Démarrage serveur + scraping Telegram réel | ✅ 500/288/288/500/500 résultats |
| Rendu navigateur (Chrome headless) | ✅ **0 pageerror** |
| Les 7 onglets s'activent | ✅ dashboard, rencontres, live, stats, prono, historique, **perf** |
| Les 6 moteurs s'exécutent | ✅ tous, sans exception |
| Déterminisme (2 appels identiques) | ✅ sorties identiques |
| Onglet Performance | ✅ 15 081 caractères rendus |

---

## Fichiers

```
hadar/
├── betting-analyzer.html      ← (a)+(b) 380 Ko → 419 Ko
├── server.js                  ← (c) parsing + tri chronologique
├── storage.js                 ← (c) sécurité admin
├── backup/                    ← originaux avant patch
├── data/                      ← 4 152 résultats réels + backtest.json
├── tools/
│   ├── harvest.js             collecte Telegram paginée
│   ├── engine.js              moteurs backtestables
│   ├── backtest.js            walk-forward · Brier/logloss/ECE
│   ├── significance.js        Wilson · χ² · runs test
│   └── verify-penalty22.js    Holm-Bonferroni · split-half · ROI
├── patch/                     scripts de patch idempotents
├── performance.html           dashboard autonome
├── RESULTATS-BACKTEST.md      analyse détaillée
└── CORRECTIFS-APPLIQUES.md    ce fichier
```

---

## Reste à faire (non bloquant)

1. **Collecter penalty22 jusqu'à ~600 observations** pour trancher sur l'anomalie d'alternance (287 actuellement, effet à 57–59 %, ROI positif seulement à partir de la cote 1,90)
2. **Rate-limit sur `/api/auth/login`** (brute force possible)
3. **Sessions persistantes** (actuellement en RAM → déconnexion à chaque redéploiement Railway)
4. **CORS restrictif** (`cors()` est grand ouvert)
5. **Automatiser le backtest** en cron hebdomadaire pour que l'onglet Performance reste à jour
6. Sur Railway, définir `ADMIN_PASS` en variable d'environnement (sinon un mot de passe aléatoire est généré à chaque déploiement)

---

## 15. 🔴 Numéros de jeux (#N) faux — CORRIGÉ

**Symptôme signalé.** Les numéros affichés dans l'application ne correspondaient
ni au canal Telegram, ni à ce qui est visible chez le bookmaker.
Exemple : l'app affichait `#N142` alors que le canal en était à `#N264`.

**Cause.** `tools/harvest.js` **renumérotait** les résultats de 1 à N après
collecte (`rows.forEach((r, i) => { r.n = total - i; })`). Le vrai `#N` publié
était écrasé et déplacé dans un champ `cycleN` inutilisé par l'interface.

**Correctif.**
- `n` conserve désormais le **vrai `#N` du canal** (celui du bookmaker).
- `cycleN` supprimé (redondant).
- L'ordre chronologique reste porté par `ts` / `msgId`, **jamais par `n`**
  (le `#N` se réinitialise périodiquement : `#N288 → #N1`).

**Vérification.** Base `#N265 / #N264 / #N263` = canal `#N265 / #N264 / #N263`. ✅

---

## 16. 🔴 Scores de mi-match figés dans l'historique — CORRIGÉ

**Découvert en validant le correctif 15.** Un match affichait `3:2` en base
alors que le canal indiquait `4:5`.

**Cause.** Les canaux **éditent** leurs messages : le score est d'abord publié
en direct (partiel), puis mis à jour avec le score final. La déduplication
(`if (!seen.has(key))` dans `harvest.js`, `if (!map.has(key))` dans
`mergeResults()` de `server.js`) conservait la **première** version lue.
L'historique gardait donc des scores de mi-match, faussant les statistiques.

**Correctif.** La version la plus récemment lue **remplace** l'ancienne, dans
les deux chemins de collecte.

**Correctif complémentaire — matchs en cours.** Les matchs FIFA 4×4 non
terminés sont marqués `live: true` et **exclus** du backtest et des tests de
significativité. Détection : un match terminé publie ses deux mi-temps
(`12:3 (8:2 4:1)`) ; un seul groupe (`5:4 (5:4)`) = match en cours.
Mesuré : 10 matchs en cours sur 1180 — ils sont automatiquement remplacés par
leur version finale au passage de collecte suivant.

**Effet sur la base.** 8 933 → **10 908 résultats** (profondeur 110 pages),
tous avec le numéro réel du canal.

**Conclusions statistiques inchangées** sur ce dataset élargi :
indépendance confirmée (p = 0,20 à 0,70), « fréquence de base » gagnante
partout sauf FIFA 4×4 (« Elo seul », +13,4 %).
