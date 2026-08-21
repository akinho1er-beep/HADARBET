# Vous aviez raison sur les scores — voici ce que j'ai trouvé

## Votre observation était exacte, et la cause est pire que prévu

Ce n'était pas un réglage à ajuster. **Le code interdisait purement et simplement
la majorité des scores réels.**

Quelqu'un avait écrit des limites maximales « à la main », sans les mesurer :

> Penalty 18 : domicile maximum **3** buts, extérieur maximum **2** buts

Résultat sur vos 2 229 matchs réels :

| Jeu | Scores que le code pouvait proposer | Scores **impossibles** à proposer |
|---|---|---|
| Penalty 18 | 44 % | 🔴 **56 %** |
| Penalty 22 | 76 % | 🔴 **24 %** |

**Le score le plus fréquent en Penalty 18 est 2:3** — il représente 14,8 % des
matchs. L'ancien code ne pouvait **jamais** le proposer : l'extérieur était bloqué
à 2 buts maximum.

Voilà pourquoi vous voyiez toujours 2-1 et 3-2 : c'étaient les seuls scores encore
autorisés.

---

## Un second problème, plus discret

Le moteur de comparaison entre deux équipes calculait le score avec une formule
mathématique (loi de Poisson) conçue pour le football classique.

Je l'ai testée sur vos données. Elle est **inadaptée aux penalties** :

| | Ce que la formule prédisait | La réalité |
|---|---|---|
| Matchs à 0 but | 6,5 % des matchs | **0,0 %** |

Logique : aux tirs au but, il y a toujours des buts. La formule, elle, l'ignorait.
Je l'ai remplacée par vos données réelles pour les penalties (elle reste utilisée
pour FIFA 4×4, où elle fonctionne correctement).

---

## Ce que l'application affiche maintenant

Les scores proviennent de **la distribution réelle de vos parties**, sans aucune
limite inventée :

| Jeu | Avant | Maintenant | Moyenne de buts réelle |
|---|---|---|---|
| Penalty 18 | 2-1 / 3-2 | **3:2** | 2,73 – 2,54 |
| Penalty 22 | 2-1 / 3-2 | **3:1** | 2,86 – 2,71 |
| FIFA 4×4 | 9-8 | **6:8** | 6,97 – 6,90 |

Le cas FIFA 4×4 est parlant : l'ancien code affichait 9-8 parce qu'il butait sur
son plafond. La réalité tourne autour de 7 buts par équipe.

**Cohérence garantie** : un pronostic « victoire domicile » ne peut plus afficher
un score de défaite. Et les matchs nuls sont désormais exclus des penalties —
j'ai vérifié : sur 4 460 matchs, il y en a eu **4** (0,18 % et 0,00 %).

---

## ⚠️ Ce que ça ne fait PAS — soyez lucide

J'ai mesuré la justesse réelle par backtest sur toutes vos parties :

| Jeu | Score exact trouvé | Bonne issue (qui gagne) |
|---|---|---|
| Penalty 18 | **9,8 %** | 54,2 % |
| Penalty 22 | **8,2 %** | 53,3 % |
| FIFA 4×4 | **2,0 %** | 44,8 % |

**Un score exact ne tombe qu'environ 1 fois sur 10.** C'est mieux que le hasard
(3,6 %), mais ça reste très incertain.

C'est pourquoi j'ai changé le libellé affiché : **« Score probable » devient
« Score le + fréquent »**, suivi de son pourcentage réel. Vous verrez désormais
`3:2 · 21%` au lieu d'un chiffre présenté comme une certitude.

**Ce correctif rend les scores réalistes, pas prévisibles.** Le signal exploitable
reste l'issue (qui gagne, ~54 %), jamais le score exact. Les 5 jeux demeurent
statistiquement indépendants : aucune stratégie sur le score exact n'est rentable.

---

# Les commandes à lancer

```powershell
cd $env:USERPROFILE\Desktop
Expand-Archive hadar-corrige.zip -DestinationPath maj-hadar -Force
Copy-Item maj-hadar\hadar-corrige\* HADAR_E -Recurse -Force
cd HADAR_E
node verifier.js
```

✅ Attendez `83/83 vérifications réussies`, puis :

```powershell
git add -A
git commit -m "Scores fondes sur la distribution reelle"
git push
```

Attendez 2-3 minutes, puis rechargez votre site avec **Ctrl + F5**.

---

## Vérifications effectuées

| Test | Résultat |
|---|---|
| Scores conformes à la distribution réelle | ✅ 3:2 / 3:1 / 6:8 |
| Cohérence issue ↔ score | ✅ garantie |
| Nuls exclus des penalties | ✅ (0,18 % / 0,00 % réels) |
| Test dans un vrai navigateur Chrome | ✅ 0 erreur JavaScript |
| Vérification complète | ✅ **88/88** (avec serveur) |
| 5 nouveaux tests anti-régression | ✅ ajoutés |
