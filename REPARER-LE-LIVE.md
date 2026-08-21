# La section « En direct » est vide — quoi faire

## Le diagnostic, en une phrase

**1xBet refuse les serveurs.** Votre PC a une adresse Internet « de particulier »,
Railway a une adresse « de datacenter ». 1xBet bloque les secondes.

C'est pour ça que ça marchait chez vous et pas en ligne, et que **ça n'a jamais
fonctionné une seule fois depuis Railway** — pas une panne apparue après coup.

> ⚠️ **Ce n'est pas lié à la mise à jour des numéros.** Je n'ai jamais touché au
> module qui parle à 1xBet. Le blocage était déjà visible dans mes tests d'hier.

---

## Ce qui marche encore (l'essentiel)

| | État |
|---|---|
| Résultats des parties | ✅ **Fonctionne** — Telegram, ~2 200 parties par jeu |
| Numéros `#N` corrects | ✅ Fonctionne |
| Analyses et pronostics | ✅ Fonctionnent |
| Section « En direct » (calendrier 1xBet) | 🔴 Bloquée |

**Seule la liste des matchs à venir est touchée.** Vos analyses ne dépendent pas de
1xBet : elles sont calculées sur l'historique Telegram.

---

# Ce que vous devez faire maintenant

## Étape 1 — Envoyer la mise à jour (2 min, à faire dans tous les cas)

Elle contient une amélioration importante : au lieu d'afficher *« Aucune rencontre
détectée »* (qui laisse croire qu'il n'y a pas de match), l'application affichera
désormais :

> 🔌 *Le calendrier du bookmaker est momentanément inaccessible depuis le serveur.*

Vous saurez ainsi distinguer « pas de match » de « source coupée ».

Décompressez le nouveau `hadar-corrige.zip` comme la dernière fois, puis :

```powershell
cd $env:USERPROFILE\Desktop
Copy-Item maj-hadar\hadar-corrige\* HADAR_E -Recurse -Force
cd HADAR_E
git add -A
git commit -m "Signalement du blocage bookmaker + support proxy"
git push
```

---

## Étape 2 — Choisir : voulez-vous vraiment récupérer le live ?

**Mon conseil honnête : commencez par ne rien faire de plus.**

Le calendrier 1xBet ne sert qu'à afficher les matchs à venir. Il **n'améliore pas
vos pronostics** — ceux-ci reposent entièrement sur l'historique Telegram, qui
fonctionne parfaitement.

Si vous y tenez, il existe une solution : un **proxy résidentiel**. C'est un service
qui fait passer les requêtes de votre serveur par une adresse Internet de
particulier.

### ⚠️ À savoir avant de vous lancer

- **C'est payant** : comptez 2 à 15 $/mois selon le fournisseur.
- **C'est fragile** : 1xBet cherche activement à bloquer ces contournements. Ça peut
  cesser de marcher du jour au lendemain.
- **Ça peut être contraire aux conditions d'utilisation de 1xBet.** Vérifiez-les
  avant, c'est votre responsabilité.

---

## Étape 3 — Si vous choisissez le proxy

J'ai déjà préparé le code : il suffit d'**une variable** à ajouter sur Railway,
aucune modification à faire.

1. Souscrivez chez un fournisseur de proxy résidentiel. Ils vous donneront une
   adresse de la forme :

   ```
   http://identifiant:motdepasse@serveur.exemple.com:8080
   ```

2. Sur **Railway** → votre projet → onglet **Variables** → **New Variable** :

   | Nom | Valeur |
   |---|---|
   | `PROXY_URL` | l'adresse fournie, collée telle quelle |

3. Railway redéploie automatiquement. Attendez 2-3 minutes.

4. **Vérifiez dans les logs Railway** (onglet *Deployments* → *View Logs*) :

   | Ce que vous lisez | Signification |
   |---|---|
   | `🗓️ [penalty18] 3 rencontre(s) détectée(s)` | ✅ Ça marche |
   | `⚠️ 1xBet bloque l'accès calendrier` | ❌ Le proxy est aussi bloqué — changez de fournisseur |
   | `Proxy CONNECT a répondu 407` | ❌ Identifiant ou mot de passe incorrect |

**Pour annuler** : supprimez simplement la variable `PROXY_URL`. L'application
revient au fonctionnement direct, sans rien casser.

---

## Ce que j'ai corrigé dans le code

**1. Le proxy n'aurait pas fonctionné du tout.**
L'option `PROXY_URL` existait déjà, mais elle n'était branchée que sur le mode
navigateur — jamais sur les requêtes réellement utilisées. Vous auriez pu payer un
proxy sans aucun effet. J'ai implémenté le tunnel (méthode `CONNECT`) sur le bon
chemin, et je l'ai testé avec un vrai serveur proxy.

**2. Le message affiché était trompeur.**
L'application disait « Aucune rencontre détectée » alors que la source était coupée.
Elle distingue maintenant les deux cas.

**Vérifications effectuées :**

| Test | Résultat |
|---|---|
| Requête à travers un vrai proxy | ✅ HTTP 200, contenu reçu |
| Sans `PROXY_URL` (comportement actuel) | ✅ Strictement inchangé |
| Proxy injoignable | ✅ Erreur propre, pas de plantage |
| `/upcoming` signale le blocage | ✅ `blocked: true` |
| Vérification complète | ✅ **83/83** |
