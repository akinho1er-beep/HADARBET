# Nouveau design — trichrome HADAR

Vos choix : **dégradé du logo** · **effets marqués** · **couleurs + cartes** · **priorité mobile**.

---

## La découverte de départ

Votre logo contient **trois** couleurs :

| | Code | Usage avant |
|---|---|---|
| 🟢 Vert émeraude | `#00E5A0` | partout |
| 🔵 Cyan | `#00D4FF` | presque jamais |
| 🟣 Violet | `#7B5EA7` | jamais |

Deux tiers de votre identité visuelle dormaient. Le renouveau vient donc de **votre
propre marque**, sans couleur étrangère.

---

## Ce qui change

**Palette.** Le dégradé vert → cyan → violet est désormais une variable réutilisable
(`--grad-brand`), appliquée aux titres, barres de progression, boutons et onglets.

**Cartes de rencontre.**
- Un **liseré trichrome** traverse le haut de chaque carte — votre marque se lit au
  premier coup d'œil.
- Coins plus arrondis (14 → 18 px), fond légèrement violacé, ombres plus profondes.
- L'équipe extérieure passe au violet du logo (au lieu d'un mauve approximatif).

**Navigation.** L'onglet actif est souligné par le dégradé complet, avec un halo
vert-cyan renforcé.

**Fond.** Passage de `#02040a` (noir pur) à `#03050e` (noir bleuté) pour que le cyan
et le violet respirent.

---

## Le point délicat : effets marqués + mobile

Vous vouliez **plus d'effets** tout en travaillant **surtout sur mobile**. Ces deux
demandes se contredisent : les effets lumineux sont ce qui vide le plus la batterie.

Mon arbitrage :

| Type d'effet | Coût batterie | Décision |
|---|---|---|
| Halos (`box-shadow`) | quasi nul | ✅ **renforcés** |
| Dégradés statiques | quasi nul | ✅ **ajoutés partout** |
| Flous animés en boucle | 🔴 élevé | ⚠️ désactivés **sur mobile uniquement** |

Sur ordinateur, tous les effets tournent. Sur mobile, vous gardez l'aspect visuel
riche, sans le scroll qui saccade ni la batterie qui fond.

J'ai aussi porté les boutons à **44 px de hauteur minimum** sur mobile — la taille
recommandée pour le pouce.

---

## Lisibilité vérifiée

J'ai mesuré le contraste de chaque couleur sur le nouveau fond (norme WCAG AA = 4,5) :

| Élément | Contraste | |
|---|---|---|
| Texte principal | 16,84 | ✅ |
| Texte atténué | 4,51 | ✅ |
| Vert | 12,32 | ✅ |
| Cyan | 11,49 | ✅ |
| Violet clair | 6,03 | ✅ |

> J'ai volontairement **éclairci le violet** du logo (`#7B5EA7` → `#9D7BD4`) pour le
> texte. Le violet d'origine tombait à 2,9 de contraste : illisible sur fond sombre.
> Il reste utilisé tel quel dans les dégradés, où la lisibilité n'est pas en jeu.

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
git commit -m "Nouveau design trichrome"
git push
```

Attendez 2-3 min, puis **Ctrl + Shift + R** (vider le cache, sinon vous verrez
l'ancien design).

---

## Vérifications effectuées

| Test | Résultat |
|---|---|
| Rendu ordinateur (Chrome réel) | ✅ |
| Rendu mobile 390 px (Chrome réel) | ✅ |
| Erreurs JavaScript | ✅ aucune |
| Contrastes WCAG AA | ✅ tous conformes |
| Vérification complète | ✅ **93/93** (avec serveur) |

**Aucune fonction touchée** : uniquement l'apparence. Les moteurs, les scores et la
collecte sont strictement identiques.

> 💡 Si le résultat ne vous plaît pas, dites-le-moi : la palette tient dans un seul
> bloc de variables, je peux ajuster une teinte ou tout revenir en arrière en une
> minute.
