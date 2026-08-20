# 🚂 Déploiement sur Railway

> **Je n'ai rien poussé.** Je n'ai aucun accès à ton compte Railway ni à ton dépôt Git — c'est à toi de faire le déploiement. Voici la marche à suivre.

---

## ⚠️ À lire avant tout : le volume persistant

Sans volume, Railway **efface le dossier `data/` à chaque déploiement**. Tu perdrais :

- tes **8 900 résultats** collectés,
- les **comptes membres** (`accounts.json`),
- les **sessions** actives.

Le serveur repartirait de zéro à chaque `git push`. **Cette étape n'est pas optionnelle.**

---

## Étape 1 — Créer le volume

Dans ton projet Railway :

1. Ouvre ton service → onglet **Variables** → bouton **+ New Volume**
2. **Mount path** : `/data`
3. Valide

Puis, dans **Variables**, ajoute :

```
DATA_DIR=/data
```

C'est cette variable qui indique au code d'écrire dans le volume plutôt que dans le dossier éphémère du conteneur.

---

## Étape 2 — Configurer les variables d'environnement

Toujours dans **Variables** :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `DATA_DIR` | `/data` | ✅ **oui** |
| `ADMIN_USER` | `HADAR_ADMIN` | recommandé |
| `ADMIN_PASS` | *un mot de passe solide* | ✅ **oui** |
| `GROQ_API_KEY` | `gsk_...` | si tu veux l'IA enrichie |
| `ALLOWED_ORIGINS` | *(laisser vide)* | non |
| `MAX_RESULTS` | `5000` | non |

### 🔴 À propos de `ADMIN_PASS`

**Ne réutilise pas `SHALOM12541`.** C'est une variante du mot de passe qui était en clair dans ton code source : s'il a circulé, considère-le comme connu.

Génère-en un solide :
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | % {[char]$_})
```

> Si `ADMIN_PASS` est absent, un mot de passe aléatoire est généré à **chaque** déploiement et affiché une seule fois dans les logs. Peu pratique — définis-le.

**Ne définis PAS `PORT`** : Railway l'injecte automatiquement.

---

## Étape 3 — Pousser le code

### Cas A — ton projet est déjà lié à un dépôt GitHub

```powershell
cd C:\Users\HP\Desktop\HADAR_E

# Vérifie que .env n'est PAS suivi par Git
git status --short | Select-String ".env"
#   .env.example  → normal
#   .env          → ⚠️ voir « Si .env est déjà suivi » plus bas

git add -A
git commit -m "Moteurs calibres sur backtest reel + securite (rate-limit, sessions, CORS)"
git push
```

Railway détecte le push et redéploie automatiquement.

### Cas B — pas encore de dépôt

```powershell
cd C:\Users\HP\Desktop\HADAR_E
git init
git add -A
git commit -m "HADAR BetAnalytics v4"
git branch -M main
git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
git push -u origin main
```

Puis dans Railway : **New Project → Deploy from GitHub repo**.

### Cas C — sans Git, via la CLI Railway

```powershell
npm i -g @railway/cli
railway login
railway link      # sélectionne ton projet existant
railway up        # envoie le dossier courant
```

---

## 🔒 Si `.env` est déjà suivi par Git

C'est le piège classique. Vérifie :

```powershell
git ls-files | Select-String "^\.env$"
```

Si la commande retourne `.env`, tes secrets sont dans l'historique du dépôt :

```powershell
git rm --cached .env
git commit -m "Retire .env du suivi Git"
git push
```

⚠️ **Cela ne l'efface pas de l'historique passé.** Si le dépôt est public ou partagé, **révoque et régénère** :
- la clé Groq → [console.groq.com/keys](https://console.groq.com/keys)
- le mot de passe admin → nouvelle valeur dans les variables Railway

Le `.gitignore` livré protège `.env`, `data/accounts.json` et `data/sessions.json` **pour l'avenir**.

---

## Étape 4 — Vérifier le déploiement

Dans les logs Railway, tu dois voir :

```
[env] X variable(s) chargée(s) depuis .env      ← absent sur Railway, c'est normal
🔐 ✅ CORS : même origine uniquement (défaut sécurisé)
🔐 Rate-limit connexion : 8 tentatives / 15 min
🔐 Sessions persistées : 0 active(s) — /data/sessions.json    ← doit pointer vers /data
✅ GROQ_API_KEY détectée — analyse IA enrichie active.
✅ HADAR BetAnalytics Server v3
   Port: <port injecté par Railway>
```

> **Le point à contrôler :** `/data/sessions.json`. Si tu lis `./data/sessions.json`, la variable `DATA_DIR` n'est pas prise en compte → tes données seront perdues au prochain déploiement.

Puis, depuis ton PC :

```powershell
curl https://<ton-app>.up.railway.app/status
```

Attendu : `{"status":"online","counts":{...}}`

**Le vrai test de persistance :** redéploie une seconde fois et vérifie que les compteurs de `/status` n'ont **pas** été remis à zéro.

---

## Étape 5 — Transférer tes données existantes (optionnel)

Un volume neuf est vide : le serveur recollectera depuis Telegram, mais ne remontera que la fenêtre glissante du canal (~quelques centaines de résultats), pas tes 8 900.

Pour transférer ton historique local :

```powershell
npm i -g @railway/cli
railway login
railway link

# Envoie chaque fichier vers le volume
railway run --service <ton-service> -- node -e "console.log(process.env.DATA_DIR)"
```

**Plus simple :** committe le dossier `data/*.json` (hors `accounts.json` et `sessions.json`) dans Git. Au premier démarrage, le serveur les lira, puis continuera d'accumuler dans le volume.

```powershell
git add data/baccara.json data/penalty18.json data/penalty22.json data/jeu21.json data/fifa4x4.json data/backtest.json data/significance.json
git commit -m "Historique initial : 8900 resultats reels"
git push
```

> Ne committe **jamais** `accounts.json` (mots de passe hachés) ni `sessions.json` (jetons actifs). Le `.gitignore` les exclut déjà.

---

## Récapitulatif

| # | Action | Critique ? |
|---|---|---|
| 1 | Créer un volume monté sur `/data` | 🔴 **oui** |
| 2 | `DATA_DIR=/data` dans les variables | 🔴 **oui** |
| 3 | `ADMIN_PASS` = nouveau mot de passe solide | 🔴 **oui** |
| 4 | `GROQ_API_KEY` | recommandé |
| 5 | Vérifier que `.env` n'est pas dans Git | 🔴 **oui** |
| 6 | `git push` | — |
| 7 | Contrôler `/data/sessions.json` dans les logs | 🟠 important |
| 8 | Redéployer et vérifier que `/status` ne repart pas à zéro | 🟠 important |

---

## En cas de problème

**« Application failed to respond »**
→ Le service n'écoute pas sur le bon port. Le code utilise déjà `process.env.PORT` et bind sur `0.0.0.0` : vérifie que tu n'as pas forcé `PORT` dans les variables.

**Les données disparaissent à chaque déploiement**
→ Volume absent, ou `DATA_DIR` mal orthographié. Les logs doivent afficher un chemin commençant par `/data`.

**Tous les membres déconnectés après un déploiement**
→ Même cause : `sessions.json` n'est pas sur le volume.

**Le rate-limit bloque tout le monde d'un coup**
→ Ne devrait pas arriver : `trust proxy` est activé, l'IP réelle est lue depuis `X-Forwarded-For`. Si le problème survient, vérifie qu'aucun proxy supplémentaire n'est intercalé.
