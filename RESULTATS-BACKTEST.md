# 📊 Backtest HADAR — Résultats sur données réelles

**4 152 résultats** collectés depuis les canaux Telegram (7–18 août 2026), backtest **walk-forward** strict : pour chaque match `i`, on entraîne sur `[0..i-1]` et on prédit `i`. Aucune fuite du futur.

---

## 1. Les données collectées

| Jeu | Résultats | Période | Issues observées |
|---|---:|---|---|
| baccara | 1 196 | 17–18 août | P 46.6 % · B 36.0 % · T 17.5 % |
| jeu21 | 1 196 | 17–18 août | LOSE 56.4 % · WIN 37.5 % · PUSH 6.0 % |
| fifa4x4 | 1 184 | 7–18 août | A 47.0 % · H 44.1 % · D 9.0 % |
| penalty18 | 288 | 15–18 août | H 50.3 % · A 49.7 % |
| penalty22 | 288 | 15–18 août | A 52.1 % · H 47.9 % |

L'outil `tools/harvest.js` pagine via `?before=` et remonte plusieurs jours d'historique — bien au-delà des 500 résultats que garde `storage.js`.

---

## 2. 🔴 Le résultat principal : le moteur Elo+Poisson est **battu par le hasard**

Score de Brier (**plus bas = mieux**) — la métrique de référence pour évaluer des probabilités :

### Penalty 18
| Modèle | Accuracy | Brier ↓ | Logloss ↓ | ECE ↓ |
|---|---:|---:|---:|---:|
| **hasard** | 49.6 % | **0.5000** | 0.6931 | 0.0040 |
| fréquence de base | 47.6 % | 0.5039 | 0.6970 | 0.0453 |
| Elo seul | 50.4 % | 0.5214 | 0.7157 | 0.0829 |
| **Elo+Poisson** *(moteur actuel)* | 48.0 % | **0.5557** ❌ | 0.7558 | 0.1451 |
| toujours domicile | 50.4 % | 0.9919 | 6.8520 | 0.4960 |

### Penalty 22
| Modèle | Accuracy | Brier ↓ |
|---|---:|---:|
| **hasard** | 51.2 % | **0.5000** |
| fréquence de base | 51.2 % | 0.5047 |
| Elo seul | 49.6 % | 0.5339 |
| **Elo+Poisson** | 49.6 % | **0.5680** ❌ |

### FIFA 4×4
| Modèle | Accuracy | Brier ↓ |
|---|---:|---:|
| **fréquence de base** | 46.9 % | **0.5787** ✅ |
| Elo seul | 47.3 % | 0.5830 |
| Elo+Poisson | 48.9 % | 0.6219 |
| hasard | 46.9 % | 0.6667 |

### Baccara / Jeu 21
| Jeu | Meilleur modèle | Brier | vs « moteur actuel » |
|---|---|---:|---|
| baccara | fréquence de base | 0.6242 | moteur actuel 0.6305 (légèrement pire) |
| jeu21 | fréquence de base | 0.5423 | — |

### 🎯 Ce que ça signifie

**Sur les deux jeux Penalty, le moteur Elo+Poisson fait activement pire que de tirer à pile ou face** (Brier 0.556 vs 0.500). Il n'est pas juste inutile : il est **nuisible**, parce qu'il affiche des confiances de 70–88 % sur des prédictions dont la valeur informative est nulle. C'est exactement ce que mesure l'**ECE** (erreur de calibration) : **0.145** pour Elo+Poisson contre **0.004** pour le hasard.

La raison est simple et je l'avais anticipée dans le premier diagnostic : ces « équipes » sont des **étiquettes cosmétiques sur un RNG**. Il n'y a pas de force d'équipe à estimer. L'Elo apprend du bruit et le restitue avec assurance.

Sur FIFA 4×4 et Baccara, le modèle gagnant est le plus bête possible — **la fréquence de base** — c'est-à-dire « ignore tout, prédis simplement l'issue globalement la plus courante ». Aucun modèle sophistiqué ne fait mieux.

---

## 3. ✅ Le test qui tranche : indépendance des tirages

Test du χ² sur la table de contingence *résultat N-1 → résultat N* :

| Jeu | χ² | p | Verdict |
|---|---:|---:|---|
| penalty18 | 1.007 | 0.317 | ✅ indépendant |
| **penalty22** | **9.973** | **0.0018** | ⚠️ dépendance détectée |
| fifa4x4 | 5.351 | 0.252 | ✅ indépendant |
| baccara | 2.296 | 0.685 | ✅ indépendant |
| jeu21 | 1.006 | 0.908 | ✅ indépendant |

Et le **runs test** (Wald–Wolfowitz) confirme : sur 4 jeux sur 5, la longueur des séries est **strictement conforme au pur hasard**.

> **Conclusion sans ambiguïté : le résultat précédent n'apporte aucune information sur le suivant.**
> Toute stratégie fondée sur les séries, les patterns ou les « écarts » — c'est-à-dire **tout `analyzeLocal()` et tout le modèle Aviator** — est mathématiquement sans fondement. Ce n'est plus une opinion, c'est mesuré sur tes propres données.

---

## 4. 🟡 L'exception : penalty22 présente une vraie anomalie d'alternance

Un seul signal a survécu à tous les tests. Sur penalty22, les résultats **alternent plus souvent que le hasard** (H→A→H→A) :

```
              H      A
  H       38.4%  61.6%   (n=138)     ← après H, 61.6% de A
  A       57.0%  43.0%   (n=149)     ← après A, 57.0% de H
```

Batterie de vérifications :

| Test | Résultat |
|---|---|
| Correction de Holm–Bonferroni (5 jeux testés) | ✅ **survit** (p=0.0018 < seuil 0.0100) |
| Split-half (1re vs 2e moitié) | ✅ **présent dans les deux** (59.4 % / 58.7 %, p=0.024 et p=0.037) |
| Ordre par vrai n° de match (`#N`, 0 trou dans les données) | 🟡 57.5 %, z=2.54 — **plus faible** que par timestamp |
| Découpage en tiers | 🟡 56.8 % / 60.0 % / 54.7 % — cohérent mais **aucun tiers seul n'est significatif** |
| Rentabilité à la cote 1.85 | 🟡 ROI +9.6 % mais **IC 95 % = [−1.1 % ; +19.8 %]** → inclut la perte |
| Rentabilité à la cote 1.90+ | ✅ ROI +12.5 %, IC [+1.6 % ; +23.0 %] |
| Taille d'échantillon requise | ⚠️ **~572 paris** pour confirmer. On en a **287** |

### Verdict honnête
C'est le **seul signal crédible** de tout le projet, et il mérite d'être suivi. Mais :
- Il tient sur **287 observations**, soit la moitié de ce qu'il faut pour conclure
- À la cote réelle 1.85 pratiquée par 1xBet, l'intervalle de confiance **inclut encore la perte**
- Il concerne **un seul jeu sur cinq** — ce qui est exactement ce à quoi on s'attend en testant 5 hypothèses (risque de faux positif)

**La bonne démarche : traiter ça comme une hypothèse à valider, pas comme une stratégie à déployer.** Il faut continuer à collecter penalty22 jusqu'à ~600 observations et re-tester. Si l'effet tient à 57 %+ sur 600 tirages, il devient réellement exploitable. S'il s'effondre vers 50 %, c'était du bruit — et on l'aura su sans avoir misé.

C'est précisément le genre de décision que le harnais de backtest permet de prendre, et qui était impossible avant.

---

## 5. Bugs confirmés par les données

**Le bug FIFA 4×4 est réel.** `parseFifa4x4` calcule :
```js
const n = Math.floor(Date.now() / 1000) % 100000 + index * 10;
```
Le `n` dépend de **l'heure du scraping**, pas du match. L'Elo étant séquentiel, il s'entraînait sur un ordre arbitraire. Dans `harvest.js` j'ai utilisé le **msgId Telegram** (chronologique et stable) — c'est le correctif à porter dans `server.js`.

**Bug de parsing Baccara.** 104 résultats sur 1 196 (**8.7 %**) sont des `0:0`. Vérification sur le canal source :
```
#N969. 0(3♣️7♠️10♣️) - 0(A♠️6♣️) #T0
```
Ce sont de **vrais 0:0** (10, J, Q, K valent 0 au baccara) — le parser est correct. **Mais** ils sont comptés comme des égalités, ce qui gonfle le taux de « Tie » à 17.5 % au lieu des ~9.5 % théoriques. Hors 0:0, la distribution redevient P 51.0 % / B 39.4 % / T 9.6 %, **très proche de la théorie**. Le moteur Baccara mélange donc des vraies égalités avec des mains à 0 partout.

---

## 6. Ce qu'il faut faire maintenant

| # | Action | Justification |
|---|---|---|
| **1** | **Débrancher Elo+Poisson sur penalty18/22** → utiliser la fréquence de base | Brier 0.556 vs 0.500 : il fait pire que le hasard, données à l'appui |
| **2** | **Supprimer le modèle Aviator « rebond/imminent »** | χ² prouve l'indépendance sur tous les jeux testés ; le modèle vend un signal inexistant à 92 % de confiance |
| **3** | **Purger `Math.random()` d'`analyzeLocal`** | 32 occurrences ; rend le moteur non reproductible et non testable |
| **4** | **Plafonner les confiances aux valeurs mesurées** | Aucun modèle ne dépasse ~51 % de justesse réelle. Afficher 88 % est indéfendable |
| **5** | **Corriger `parseFifa4x4`** → utiliser le msgId Telegram comme `n` | Bug confirmé, correctif déjà écrit dans `harvest.js` |
| **6** | **Séparer les 0:0 des égalités au Baccara** | Fausse la distribution de 8 points |
| **7** | **Continuer à collecter penalty22** jusqu'à ~600 obs. | Seule piste crédible ; ni à jeter ni à déployer en l'état |
| **8** | **Afficher la performance réelle dans l'app** | `data/backtest.json` est déjà au bon format |

---

## 7. Le point difficile, dit franchement

Le backtest sur **4 152 résultats réels** montre qu'aucun modèle du projet ne prédit ces jeux mieux que « prédis toujours l'issue la plus fréquente ». Ce n'est pas un défaut d'implémentation qu'on pourrait corriger avec un meilleur algorithme : c'est la **conséquence directe du fait que ces jeux sont des RNG correctement implémentés**. Un RNG bien fait est imprévisible par construction — et les tests d'indépendance confirment que ceux de 1xBet le sont.

Ajouté à la marge du bookmaker (5–8 %), l'espérance reste négative quelle que soit la sophistication du modèle.

**Cela ne rend pas le projet inutile — mais ça déplace sa valeur.** Ce qui est réellement défendable :
- **Un tracker de performance honnête** : « voici nos prédictions passées, voici notre taux réel de 51 % ». Aucun concurrent ne le fait, et c'est vérifiable.
- **Un détecteur d'anomalies rigoureux** : le cas penalty22 montre que le pipeline sait distinguer un signal candidat du bruit. Si un jour un RNG est mal implémenté, ce système le verra.
- **Un outil de gestion du risque** : EV, risque de ruine, taille de mise (Kelly).
- **La transparence comme produit** : afficher « indépendance statistique confirmée, aucun pattern exploitable détecté » est un argument de crédibilité — et une protection juridique (les régulateurs et les stores sanctionnent les promesses de gains).

L'alternative — garder des confiances à 88 % que les données contredisent — expose à des utilisateurs qui perdent de l'argent en croyant un chiffre faux.

---

## Fichiers produits

| Fichier | Contenu |
|---|---|
| `tools/harvest.js` | Collecte Telegram paginée (corrige le bug de `n` FIFA 4×4) |
| `tools/engine.js` | Moteurs backtestables, déterministes, + correctifs 3b/3c/3d |
| `tools/backtest.js` | Harnais walk-forward · Brier, logloss, ECE, calibration |
| `tools/significance.js` | Wilson, χ² d'indépendance, runs test |
| `tools/verify-penalty22.js` | Holm–Bonferroni, split-half, test de rentabilité |
| `data/*.json` | 4 152 résultats réels |
| `data/backtest.json` | Rapport machine, prêt pour l'onglet Performance |
| `performance.html` | Tableau de bord visuel des résultats |
