# 🔍 Guide de vérification — ne me crois pas sur parole

Ce guide te permet de contrôler **toi-même** chaque correctif. Compte environ 10 minutes.

---

## Étape 0 — Préparer (1 min)

```bash
cd hadar
npm install
node server.js
```

Le serveur doit afficher `✅ HADAR BetAnalytics Server v3` et `Port: 3000`.
Laisse ce terminal ouvert et **ouvre-en un second** pour la suite.

> Sur Railway, remplace `node server.js` par ton URL de déploiement dans les commandes `curl`.

---

## Étape 1 — Vérification automatique (30 s) ⭐

C'est le contrôle le plus complet : **58 tests** qui relisent le code, exécutent les moteurs, interrogent le serveur et pilotent un vrai navigateur.

```bash
node verifier.js --serveur
```

**Résultat attendu** — dernière ligne :
```
✅ TOUT EST CORRECT — 58/58 vérifications réussies
```

Si un test échoue, il est listé nommément à la fin. Le script renvoie le code de sortie `1`, ce qui permet de le brancher dans une CI.

**Ce que ce script prouve :**

| Section | Contrôle |
|---|---|
| 1 | La syntaxe du HTML, de server.js et storage.js est valide |
| 2 | L'onglet Performance existe et contient bien 4 152 résultats |
| 3 | Chaque moteur renvoie la confiance calibrée attendue |
| 4 | Plus aucun `Math.random()` dans le code exécutable |
| 5 | Les formules du sophisme du joueur ont disparu |
| 6 | Les correctifs de parsing serveur sont en place |
| 7 | Le mot de passe en clair n'est nulle part |
| 8 | Les données sont réelles et horodatées |
| 9 | Le serveur répond correctement en live |
| 10 | L'app tourne dans un vrai navigateur, 0 erreur JS |

---

## Étape 2 — Vérifier l'onglet Performance à l'œil (2 min)

Ouvre **http://localhost:3000** dans ton navigateur, connecte-toi, puis clique sur l'onglet **🎯 Performance**.

**Tu dois voir :**

- ✅ 4 cartes : `4 152` données · `~51%` justesse max · `4/5` indépendance · `40` amorçage
- ✅ Un encadré rouge « Résultat principal du backtest »
- ✅ Pour chaque jeu : un badge vert **✅ Tirages indépendants** (sauf penalty22, en orange)
- ✅ Sur Penalty 18/22 : un bandeau rouge **« Ancien moteur débranché »**
- ✅ Un tableau où la ligne `Elo+Poisson` est **rouge** et porte l'étiquette « ancien moteur »

**Le test qui compte :** dans le tableau de Penalty 18, compare les scores de Brier.
`Elo+Poisson` doit afficher **0.5557** et `hasard` **0.5000**. Un score plus élevé = moins bon.
C'est la preuve chiffrée que l'ancien moteur perdait contre un tirage au sort.

---

## Étape 3 — Vérifier que les confiances sont honnêtes (2 min)

Onglet **🤖 Analyse IA** → choisis **Penalty 18** → clique **Analyser et pronostiquer**.

**Avant les correctifs**, cette carte affichait jusqu'à **88 %** de confiance.

**Maintenant tu dois voir :**
- Confiance : **50 %**, libellé **« Nulle »**
- Texte : « Aucun avantage statistique détecté — issue la plus fréquente : … »
- Dans l'analyse : « le moteur Elo+Poisson, mesuré à 0.5557–0.5680, a été débranché »

Répète pour chaque jeu. Valeurs attendues :

| Jeu | Confiance | Libellé |
|---|---:|---|
| Penalty 18 | 50 % | Nulle |
| Penalty 22 | 51 % | Nulle |
| FIFA 4×4 | 47 % | Nulle |
| Baccara | 47 % | Nulle |
| Jeu 21 | 56 % | Faible |
| **Aviator** | **0 %** | **Non prédictible** |

> ⚠️ Si tu vois encore une confiance à 70 % ou plus, quelque chose n'a pas été appliqué — dis-le moi.

---

## Étape 4 — Vérifier le déterminisme (30 s)

Toujours sur l'onglet Analyse IA, **clique 3 fois de suite** sur « Analyser et pronostiquer » pour le même jeu.

- ✅ **Les chiffres doivent être identiques à chaque fois.**
- ❌ Avant, ils changeaient à chaque clic (32 `Math.random()` dans les scores de confiance).

C'est le test le plus rapide et le plus parlant.

---

## Étape 5 — Vérifier Aviator (1 min)

Onglet **Analyse IA** → **Aviator** → lance l'analyse.

**Ne doit PLUS jamais apparaître :**
- ❌ « 🔥 REBOND FORT — multiplicateur > 2x TRÈS probable »
- ❌ « 🚀 Gros gain (>10x) imminent »
- ❌ Une confiance de 78 %, 88 % ou 92 %

**Doit apparaître :**
- ✅ « 🎲 Aucune prédiction possible — jeu sans mémoire »
- ✅ « ⚠️ Espérance négative sur toute stratégie »
- ✅ Un calcul de type : `P(≥2x) global = X%` vs `P(≥2x | manche précédente < 2x) = Y%` avec la mention « non significatif »

C'était l'erreur mathématique la plus grave du projet : promettre un rebond sur un jeu sans mémoire.

---

## Étape 6 — Vérifier le bug FIFA 4×4 (1 min)

```bash
curl -s "http://localhost:3000/results/fifa4x4?limit=3"
```

**Attendu :**
```json
[{"n":317381,"home":"Aston Villa","away":"Fulham","score":"5:9","ts":1787072...,"msgId":317381}]
```

**Les 3 points à contrôler :**
1. `n` est un nombre à **6 chiffres** (~317000) → c'est l'ID du message Telegram
2. Un champ `msgId` est présent
3. `n` n'est **pas** un timestamp à 10 chiffres (ex. `1787072418`)

**La preuve définitive** — relance la commande dans 2 minutes : le `n` d'un même match **ne doit pas avoir changé**. Avant le correctif, il était recalculé depuis `Date.now()` à chaque scraping, ce qui corrompait l'ordre chronologique et donc l'Elo.

---

## Étape 7 — Vérifier la sécurité (30 s)

```bash
grep -l "Sh@lom12541" storage.js server.js betting-analyzer.html
```

**Attendu : aucun résultat.** L'ancien mot de passe admin en clair a disparu des **3 fichiers source**.

> ℹ️ Une recherche plus large (`grep -r`) trouvera encore ce mot de passe dans `GUIDE-VERIFICATION.md`, `CORRECTIFS-APPLIQUES.md`, `patch/apply.js` et `verifier.js`. C'est normal : ces fichiers *documentent* ou *testent* sa suppression, ils ne l'utilisent pas. Seuls les 3 fichiers ci-dessus sont exécutés en production.

```bash
grep -n "randomBytes(12)" storage.js
```

**Attendu :** une ligne s'affiche. Si `ADMIN_PASS` n'est pas défini, un mot de passe aléatoire est désormais généré et affiché **une seule fois** dans les logs.

> 🚨 **Sur Railway, définis impérativement `ADMIN_PASS`** dans les variables d'environnement. Sinon un nouveau mot de passe est généré à chaque redéploiement.

---

## Étape 8 — Refaire le backtest toi-même (2 min)

C'est la vérification ultime : **recalculer les chiffres depuis zéro**.

```bash
node tools/backtest.js
```

Tu dois retrouver, pour Penalty 18 :
```
  hasard                 248     49.6%   0.5000    0.6931  0.0040
  Elo+Poisson            248     48.0%   0.5557    0.7558  0.1451
```

Et le verdict : `✦ meilleur (Brier) : « hasard »`.

Puis les tests statistiques :
```bash
node tools/significance.js
```
→ doit conclure `✅ INDÉPENDANCE` sur 4 jeux, et signaler penalty22.

Et la vérification de l'anomalie :
```bash
node tools/verify-penalty22.js
```
→ montre que l'effet survit à Holm-Bonferroni et au split-half, mais que **287 observations sur ~572 requises** ne suffisent pas à conclure.

**Pour collecter des données fraîches** et refaire tourner le tout sur un échantillon plus grand :
```bash
node tools/harvest.js 60      # ~4 min, repagine les canaux Telegram
node tools/backtest.js
```

---

## Récapitulatif express

| # | Commande / action | Preuve |
|---|---|---|
| 1 | `node verifier.js --serveur` | 58/58 tests |
| 2 | Onglet Performance | Brier 0.5557 vs 0.5000 |
| 3 | Analyse IA → Penalty 18 | 50 % « Nulle » (avant : 88 %) |
| 4 | Cliquer 3× « Analyser » | chiffres identiques |
| 5 | Analyse IA → Aviator | « jeu sans mémoire », 0 % |
| 6 | `curl .../results/fifa4x4` | `n` = 317xxx stable |
| 7 | `grep -l "Sh@lom12541" storage.js server.js betting-analyzer.html` | aucun résultat |
| 8 | `node tools/backtest.js` | chiffres reproduits |

---

## En cas de problème

- **Un test échoue ?** Le script nomme précisément la vérification en échec — envoie-moi la ligne.
- **Revenir en arrière ?** Les fichiers d'origine sont dans `backup/` :
  ```bash
  cp backup/betting-analyzer.html backup/server.js backup/storage.js .
  ```
- **`Cannot find module 'express'` ?** Lance `npm install`.
- **Test navigateur ignoré ?** C'est normal et sans gravité : les **53 autres tests suffisent** à valider tous les correctifs. Puppeteer n'ajoute que 5 contrôles de confort.

### Installer puppeteer malgré l'erreur « Failed to set up Chrome »

Cette erreur survient quand le cache Chrome de puppeteer est corrompu (téléchargement interrompu). L'app **n'en a pas besoin** — mais si tu veux les 5 tests supplémentaires :

```powershell
# 1. Ferme tout Node (le dossier est verrouille -> erreur EPERM)
taskkill /IM node.exe /F

# 2. Vide le cache Chrome corrompu
Remove-Item "$env:USERPROFILE\.cache\puppeteer" -Recurse -Force -ErrorAction SilentlyContinue

# 3. Reinstalle
npm install puppeteer
```

Si le téléchargement de Chrome échoue encore (réseau, antivirus, proxy), utilise le Chrome déjà installé sur ta machine :

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD="true"
npm install puppeteer
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
node verifier.js --serveur
```

> ⚠️ L'erreur `EPERM: operation not permitted, rmdir` signifie qu'un processus Node tenait le dossier ouvert. Le `taskkill` de l'étape 1 règle ce cas.
