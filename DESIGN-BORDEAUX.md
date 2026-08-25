# Interface bordeaux & or — appliquée

Vos choix : **variante 2** · **gains en or** · **fond noir**.

---

## Une décision que j'ai prise pour vous

La variante 2 était « bordeaux **+ vert** », le vert servant à marquer les gains.
Vous avez ensuite choisi **l'or** pour les gains — le vert n'avait donc plus de rôle.

Le garder aurait donné une palette à quatre couleurs sans logique. **Je l'ai retiré
entièrement** : l'interface est désormais bordeaux + or, cohérente de bout en bout.
Si vous vouliez conserver une touche verte quelque part, dites-le-moi.

---

## La palette

| Rôle | Couleur | Contraste |
|---|---|---|
| Structure, fonds, dégradés | Bordeaux `#8C2444` | 2,38 — *fonds uniquement* |
| Textes, chiffres, accents | Framboise `#D94F6E` | 5,13 ✅ |
| **Gains, indicateurs positifs** | **Or `#FFD24A`** | 14,12 ✅ |
| Pertes | Rouge vif `#FF5252` | 6,38 ✅ |
| Équipe extérieure | Rose pâle `#E8C9D2` | 13,29 ✅ |

**Le bordeaux pur ne peut pas porter du texte** (2,38 alors que la norme exige 4,5).
Il habille donc les fonds, bordures et dégradés ; la framboise prend le relais dès
qu'il faut lire quelque chose.

---

## Gain ≠ perte : le point que j'ai vérifié

Dans une application de paris, confondre un gain et une perte est le pire défaut
possible. Avec une palette entièrement rouge, le risque était réel.

Mesures :
- **Or vs rouge** : l'or est **2,43× plus lumineux** — distinction immédiate
- Deux teintes franchement différentes, pas deux nuances de rouge

J'ai aussi dû corriger un effet de bord : l'équipe extérieure s'affichait en or,
la même couleur que les gains. Elle est passée en **rose pâle** pour que **l'or
reste exclusivement réservé aux gains**.

---

## Ce qui a changé

- **180 couleurs** converties dans tout le fichier (vert et cyan éliminés)
- **Logo** : noyau bordeaux profond, anneau framboise → or, « H » blanc rosé
- **Icône PWA et couleur de thème** (barre du navigateur mobile) mises à jour
- **Fond** resté noir, comme demandé — le bordeaux ressort au maximum
- Liseré bordeaux → or en haut de chaque carte
- Texte des boutons corrigé : il était resté vert très sombre, illisible sur bordeaux

Les optimisations mobile de la version précédente sont conservées : halos maintenus,
animations coûteuses désactivées sur petit écran, boutons à 44 px.

---

# Les commandes

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
git commit -m "Interface bordeaux et or"
git push
```

Attendez 2-3 min, puis **Ctrl + Shift + R** — sans vider le cache, vous verriez
encore l'ancienne interface.

---

## Vérifications

| Test | Résultat |
|---|---|
| Rendu ordinateur (Chrome réel) | ✅ |
| Rendu mobile 390 px (Chrome réel) | ✅ |
| Erreurs JavaScript | ✅ aucune |
| Contrastes WCAG AA | ✅ tous conformes |
| Gain (or) ≠ perte (rouge) | ✅ 2,43× d'écart |
| Vérification complète | ✅ **93/93** (avec serveur) |

**Aucune fonction touchée** : moteurs, scores et collecte strictement identiques.

> 💡 Tout tient dans un seul bloc de variables en haut du fichier. Ajuster une teinte
> ou revenir au vert prend une minute — n'hésitez pas.
