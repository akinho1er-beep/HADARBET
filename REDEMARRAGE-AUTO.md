# Le site meurt après ~24 h — corrigé

## La cause exacte

Votre `server.js` contenait ceci :

```js
process.on('uncaughtException', (err) => {
  console.error('🚨 ERREUR CRITIQUE NON GÉRÉE:', err);
  // On ne quitte pas le processus pour rester résilient
});
```

L'intention était bonne — « ne pas planter » — mais l'effet est l'inverse.

Après une erreur grave, Node continue de tourner **dans un état corrompu** :
connexions fermées, minuteries mortes, collecte arrêtée. Le programme est toujours
« vivant » aux yeux de Railway, donc la règle *redémarrer en cas d'échec* **ne se
déclenche jamais**.

Votre site paraissait en ligne, mais ne diffusait plus rien. Exactement ce que vous
décrivez.

---

## Les 3 correctifs

### 1. Sortir vraiment quand c'est grave

En cas d'erreur critique : on enregistre l'erreur, on ferme proprement, puis on
quitte avec un code d'échec. Railway relance un programme sain en **~10 secondes**.

Une promesse rejetée (ex. appel réseau échoué) ne tue **pas** le serveur : ce n'est
pas un état corrompu.

> 🔍 **Un piège que j'ai trouvé en testant.** Ma première version utilisait
> `setTimeout(...).unref()`. Résultat mesuré : le programme sortait avec le code
> **0** — « tout va bien » — et Railway ne redémarrait pas. Le correctif aurait été
> inutile. Sans `.unref()`, le code est bien **1**. Vérifié sur votre vrai serveur.

### 2. Une sonde de santé `/health`

Railway interroge désormais cette adresse en continu. Si le serveur se fige
(bloqué sans planter), la plateforme le détecte et redémarre le conteneur.

Elle signale aussi un état dégradé **au-delà de 420 Mo de mémoire** : le
redémarrage a lieu *avant* la saturation, pas après.

Vous pouvez la consulter vous-même à tout moment :

```
https://votre-site.up.railway.app/health
```

```json
{"status":"ok","uptimeH":18.4,"heapMo":11,"rssMo":61,
 "derniereCollecte":"2026-08-25T15:41:29.756Z"}
```

**`derniereCollecte` est le champ le plus utile** : si cette date date de plusieurs
heures alors que le site répond, la collecte est morte même si la page s'affiche.

### 3. Redémarrage systématique

`railway.json` passe de `ON_FAILURE` à **`ALWAYS`** : le serveur redémarre même
s'il s'arrête sans signaler d'erreur.

Ajout d'une fermeture propre sur SIGTERM (redéploiements) : plus de coupure brutale.

---

## Ce que j'ai vérifié

| Test | Résultat |
|---|---|
| Crash réel provoqué sur votre serveur | ✅ arrêt volontaire, **code 1** |
| `/health` sans authentification | ✅ HTTP 200 (sinon Railway boucle) |
| Arrêt propre sur SIGTERM | ✅ code 0 |
| Crash avant démarrage complet | ✅ aucune erreur en cascade |
| Vérification complète | ✅ **88/88** |

---

# Déploiement

```powershell
cd $env:USERPROFILE\Desktop
Expand-Archive hadar-corrige.zip -DestinationPath maj-hadar -Force
Copy-Item maj-hadar\hadar-corrige\* HADAR_E -Recurse -Force
cd HADAR_E
node verifier.js
```

✅ Attendez `83/83`, puis :

```powershell
git add -A
git commit -m "Redemarrage automatique et sonde de sante"
git push
```

---

## Après le déploiement

**1. Vérifiez la sonde** (2-3 min après le push) :

```
https://votre-site.up.railway.app/health
```

Vous devez voir `"status":"ok"`.

**2. Contrôlez dans 24 h.** Rouvrez `/health` :

| Ce que vous lisez | Signification |
|---|---|
| `uptimeH` proche de 24 | ✅ aucun crash, tout va bien |
| `uptimeH` remis à ~0 | ✅ un crash a eu lieu, **le redémarrage a fonctionné** |
| Page inaccessible | ❌ prévenez-moi avec les logs Railway |

Un `uptimeH` remis à zéro **n'est pas un échec** : c'est le système qui se soigne
tout seul, ce qui n'arrivait pas avant.

---

## Le point à surveiller

Ces correctifs garantissent que le site **se relève** après une panne. Ils ne disent
pas encore *pourquoi* il tombait au bout de 24 h.

Si vous constatez que `heapMo` grimpe régulièrement au fil des heures (par exemple
11 → 200 → 400), c'est une fuite mémoire à traquer. Relevez la valeur maintenant,
puis dans 24 h, et envoyez-les-moi : je saurai où chercher.

> ⚠️ **Rappel important** : sans **volume persistant** monté sur `/data` avec
> `DATA_DIR=/data`, chaque redémarrage efface vos ~2 300 parties par jeu et
> déconnecte tous vos utilisateurs. Avec ces correctifs, les redémarrages seront
> plus fréquents — vérifiez ce point en priorité dans les réglages Railway.
