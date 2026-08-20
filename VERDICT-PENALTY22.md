# ⚖️ Verdict sur l'anomalie penalty22

**Question posée :** l'alternance anormale détectée sur 288 observations est-elle réelle ?
**Réponse : NON. C'était du bruit.** Et en cherchant, on a trouvé mieux.

---

## 1. Un bug bloquait la collecte

En voulant collecter davantage, j'ai découvert que `harvest.js` restait figé à 288 résultats.

**Cause :** le compteur `#N` des canaux Telegram **se réinitialise périodiquement**. Vérifié directement sur le canal :

```
msgId 619531 :  #N288  →  #N1     ← remise à zéro
```

Ma déduplication se faisait par `#N`. Chaque nouveau cycle réutilisait des numéros déjà vus, donc **les nouveaux matchs étaient jetés comme des doublons**. L'historique était plafonné à la taille d'un seul cycle.

**Correctif :** déduplication par `msgId` Telegram (unique et strictement croissant), puis renumérotation chronologique continue.

**Résultat : 288 → 1 790 observations.** Au total **8 943 résultats réels** sur les 5 jeux, contre 4 152 auparavant.

---

## 2. L'anomalie d'alternance a disparu

| Mesure | 288 obs. | **1 790 obs.** |
|---|---:|---:|
| Taux d'alternance | 59,2 % | **50,1 %** |
| χ² d'indépendance | 9,973 | **0,220** |
| p-value | 0,0018 ✅ | **0,644** ❌ |
| Runs test | z = 3,10 | **z = 0,44** |
| Split-half | effet présent | **absent des deux moitiés** |

**50,1 % d'alternance, c'est exactement le hasard.** Le signal s'est évaporé en passant à un échantillon suffisant — le comportement typique d'un faux positif.

Cela valide la méthode : on avait calculé qu'il fallait ~572 observations pour conclure, et refusé de déployer la stratégie sur 287. **Bien nous en a pris** — parier dessus aurait produit une perte.

> Test économique confirmé : à la cote 1,85, la stratégie d'alternance donne désormais **−7,2 % de ROI**.

---

## 3. En revanche : un vrai biais domicile, lui, est solide

En cherchant l'alternance, un signal bien plus net est apparu.

| Jeu | Victoires domicile | IC 95 % | n |
|---|---:|---|---:|
| penalty18 | **54,8 %** | [52,5 – 57,1] | 1 785 |
| penalty22 | **54,5 %** | [52,2 – 56,8] | 1 790 |

### Pourquoi celui-ci est crédible

**Il est stable dans le temps** (découpage en tiers) :
```
penalty18 :  55,3 %  /  55,1 %  /  54,1 %
penalty22 :  54,5 %  /  54,1 %  /  54,9 %
```

**Il est structurel, pas porté par quelques équipes.** Presque toutes gagnent ~55 % chez elles et ~45 % dehors :

| Équipe (penalty18) | Domicile | Extérieur |
|---|---:|---:|
| Bayern | 56,4 % | 44,1 % |
| PSG | 57,5 % | 45,5 % |
| Man City | 54,1 % | 48,0 % |
| Real Madrid | 55,0 % | 43,1 % |

C'est un **avantage terrain codé dans le simulateur** — pas une dérive statistique.

**Il est reproduit sur deux jeux indépendants**, ce qu'un artefact ne ferait pas.

### Est-il exploitable ?

| Cote | ROI | Pire cas (IC 95 %) | Verdict |
|---|---:|---:|---|
| 1,85 | +1,5 % | −2,8 % | ⚠️ incertain |
| 1,90 | +4,2 % | −0,2 % | ⚠️ à la limite |
| 1,95 | +6,9 % | +2,4 % | ✅ rentable |
| 2,00 | +9,7 % | +5,1 % | ✅ rentable |

**Réponse honnête : à la cote 1,85 habituelle de 1xBet, non.** La marge du bookmaker (5-8 %) absorbe presque tout l'avantage. Il ne devient exploitable qu'à partir de **1,95**, une cote rarement proposée sur le favori à domicile.

Autrement dit : le biais est **réel et mesurable**, mais le bookmaker l'a déjà intégré dans ses cotes. C'est le cas normal d'un marché correctement tarifé.

---

## 4. Le backtest complet, sur 5× plus de données

| Jeu | Modèle retenu | Justesse | Brier | vs hasard |
|---|---|---:|---:|---:|
| penalty18 | fréquence de base | 54,6 % | 0,4963 | +0,7 % |
| penalty22 | fréquence de base | 54,3 % | 0,4970 | +0,6 % |
| fifa4x4 | **Elo seul** | 50,5 % | 0,5784 | +13,3 % |
| baccara | fréquence de base | 43,5 % | 0,6306 | +5,4 % |
| jeu21 | fréquence de base | 58,3 % | 0,5398 | +19,0 % |

**Deux changements notables :**

1. **Penalty 18/22 battent enfin le hasard** (0,4963 et 0,4970 contre 0,5000). Modeste, mais réel : c'est le biais domicile capté par la fréquence de base.

2. **Sur FIFA 4×4, l'Elo seul passe devant** (0,5784 vs 0,5800). Avec 1 773 matchs, il a enfin assez de données pour estimer des forces d'équipe. **Elo+Poisson reste mauvais** (0,6226) : c'est la couche Poisson qui surajuste.

**Elo+Poisson reste battu partout.** La décision de le débrancher tient sur 5× plus de données.

---

## 5. Confiances mises à jour dans l'app

| Jeu | Avant | Maintenant |
|---|---:|---:|
| penalty18 | 50 % | **55 %** |
| penalty22 | 51 % | **54 %** |
| fifa4x4 | 47 % | **51 %** |
| baccara | 47 % | **44 %** |
| jeu21 | 56 % | **58 %** |
| aviator | 0 % | **0 %** |

Chaque valeur reste **la justesse réellement mesurée au backtest**. Aucune ne dépasse 60 %.

---

## Ce qu'il faut retenir

**Le harnais de backtest a fait exactement son travail.** Il a :
- signalé un signal candidat sans le survendre
- fixé le seuil de preuve nécessaire (~572 obs.)
- **réfuté ce signal** dès qu'assez de données ont été réunies
- fait émerger un biais réel, plus solide
- puis établi honnêtement que ce biais **ne bat pas la marge du bookmaker**

C'est précisément la différence entre un outil d'analyse et un générateur de promesses. Sans ce dispositif, l'alternance à 59 % aurait été présentée comme une stratégie gagnante — et aurait fait perdre de l'argent.

---

## Reproduire ces résultats

```bash
npm run collecte     # ~6 min — collecte Telegram paginée
npm run backtest     # backtest walk-forward
npm run stats        # tests d'indépendance
node tools/verify-penalty22.js   # Holm-Bonferroni, split-half, ROI
```
