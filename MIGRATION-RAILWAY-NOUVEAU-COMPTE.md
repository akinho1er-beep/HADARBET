# Migration vers un autre compte Railway — chemin complet

> Objectif : quitter l'ancien compte Railway et tout faire tourner sur le nouveau, **sans perdre** tes ~10 000 résultats ni déconnecter tes utilisateurs.

---

## Vue d'ensemble (3 minutes)

```
Ancien compte Railway ─┐
                       ├──> Code GitHub ──> Nouveau compte Railway (+ Volume /data)
Ton PC (HADAR_E) ──────┘
```

Tu vas : 1) créer le projet sur le nouveau compte, 2) recréer le Volume `/data`, 3) repousser le code. C'est tout.

---

## ÉTAPE 0 — Sauvegarde (30 secondes)

Sur ton PC, copie-colle ceci dans PowerShell :

```powershell
Copy-Item -Recurse $env:USERPROFILE\Desktop\HADAR_E $env:USERPROFILE\Desktop\HADAR_E_SAUVEGARDE -Force
Write-Host "✅ Sauvegarde créée sur le Bureau : HADAR_E_SAUVEGARDE" -ForegroundColor Green
```

---

## ÉTAPE 1 — Préparer le nouveau compte Railway

1. Déconnecte-toi de l'ancien compte dans le navigateur
2. Connecte-toi sur https://railway.app avec **le nouveau compte**
3. Va dans **Dashboard**

> Garde l'ancien projet ouvert dans un autre navigateur jusqu'à la fin, pour copier les variables.

---

## ÉTAPE 2 — Créer le nouveau projet (2 méthodes)

### Méthode A — La plus simple (recommandée) : via GitHub

1. Sur le nouveau compte Railway : **New Project → Deploy from GitHub repo**
2. Si Railway te demande d'autoriser GitHub : clique **Configure GitHub App →** coche ton dépôt `HADAR_E` → **Save**
3. Sélectionne ton dépôt `HADAR_E`
4. Railway lance le build automatiquement

### Méthode B — Via CLI PowerShell

```powershell
# 1. Déconnexion ancien compte
railway logout

# 2. Connexion nouveau compte (navigateur s'ouvre)
railway login

# 3. Va dans le dossier
cd $env:USERPROFILE\Desktop\HADAR_E

# 4. Détache l'ancien projet
Remove-Item .railway -Recurse -Force -ErrorAction SilentlyContinue

# 5. Crée et lie le nouveau projet
railway init --name hadar-prod

# 6. Envoie le code
railway up --detach
```

---

## ÉTAPE 3 — Recréer le Volume (OBLIGATOIRE)

Sans ça, chaque `git push` efface tes données.

Dans le **nouveau projet** Railway :

1. Clique sur ton service → onglet **Variables** → **+ New Volume**
2. **Mount Path** : `/data`
3. Valide

Puis toujours dans **Variables**, ajoute :

| Variable | Valeur | Où la trouver ? |
|---|---|---|
| `DATA_DIR` | `/data` | à taper tel quel |
| `ADMIN_USER` | `HADAR_ADMIN` | comme avant |
| `ADMIN_PASS` | *nouveau mot de passe solide* | voir commande ci-dessous |
| `GROQ_API_KEY` | `gsk_...` | copie depuis ancien projet |
| `ALLOWED_ORIGINS` | *(vide)* | laisse vide |
| `MAX_RESULTS` | `5000` | comme avant |

**Ne mets JAMAIS `PORT`** : Railway l'injecte tout seul.

Générer un nouveau mot de passe solide (copie-colle) :
```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 20 | % {[char]$_})
```

> Recopie ce mot de passe dans `ADMIN_PASS` du nouveau projet.

Redéploie une fois pour prendre en compte le volume : **Deploy → Redeploy**

---

## ÉTAPE 4 — Transférer ton historique (pour ne pas repartir à 0)

Ton volume neuf est vide. 2 solutions :

### Solution 1 — Automatique via Git (recommandée)
Ton dossier `data/*.json` est déjà dans le ZIP livré (sauf `accounts.json` et `sessions.json`). Il suffit de pousser :

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git add data/baccara.json data/penalty18.json data/penalty22.json data/jeu21.json data/fifa4x4.json data/fifa3x3.json data/backtest.json data/significance.json
git commit -m "Historique initial pour nouveau compte"
git push
```

Au premier démarrage, le serveur lit ces fichiers, puis continue d'écrire dans `/data`. Vérifie dans les logs :
```
Sessions persistées : 0 active(s) — /data/sessions.json   ← doit bien afficher /data
```

### Solution 2 — Si tu as changé de compte GitHub aussi

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E

# Voir où tu pousses actuellement
git remote -v

# Changer vers le nouveau dépôt (remplace NOUVEAU-COMPTE et NOM-REPO)
git remote set-url origin https://github.com/NOUVEAU-COMPTE/NOM-REPO.git

# Première poussée
git push -u origin main
```

Si Git demande un mot de passe et refuse : **GitHub n'accepte plus les mots de passe**. Fais :
```powershell
gh auth login
# → choisis GitHub.com → Yes → Paste an authentication token
# Colle un Personal Access Token créé sur https://github.com/settings/tokens
```

---

## ÉTAPE 5 — Vérifier que tout tourne

2-3 minutes après le `git push`, dans PowerShell :

```powershell
# Remplace par ton nouveau domaine Railway (visible dans Settings → Domains)
$APP="ton-app-nouveau.up.railway.app"
Invoke-RestMethod "https://$APP/health" | Format-List
Invoke-RestMethod "https://$APP/status" | Format-List
```

Tu dois voir :
```json
{"status":"ok","uptimeH":0.1,"heapMo":...,"derniereCollecte":"2026-..."}
```

Ouvre aussi dans le navigateur :
```
https://ton-app-nouveau.up.railway.app/health
https://ton-app-nouveau.up.railway.app/upcoming/fifa4x4
https://ton-app-nouveau.up.railway.app/upcoming/fifa3x3
```

**Test de persistance** (très important) :
1. Fais un second `git push` vide :
```powershell
git commit --allow-empty -m "test persistance"
git push
```
2. Attends 2 minutes, recharge `https://ton-app-nouveau.up.railway.app/status`
3. Si les compteurs **ne sont pas** retombés à 0 → le Volume fonctionne ✅

---

## ÉTAPE 6 — Couper l'ancien projet (quand c'est OK)

Uniquement quand le nouveau affiche bien `derniereCollecte` à jour et que les Rencontres s'affichent :

1. Ancien compte Railway → Service → **Settings → Delete Service**
2. Ou laisse-le en pause 48h au cas où

---

## Erreurs fréquentes

| Message | Cause | Solution |
|---|---|---|
| `Application failed to respond` | Tu as mis `PORT` en variable | **Supprime** la variable `PORT` |
| Données remises à 0 à chaque push | Volume absent ou `DATA_DIR` mal écrit | Vérifie Mount Path `/data` + variable `DATA_DIR=/data` |
| `Everything up-to-date` au push | Tu as poussé sans rien changer | Normal, `git status` t'a déjà tout poussé |
| `mot de passe incorrect` au push | GitHub refuse les mots de passe | `gh auth login` + token |
| `Installation annulée 1602` (winget) | Tu as fermé la fenêtre UAC | Relance PowerShell **en admin** (clic droit → Exécuter en tant qu'administrateur) |

---

## Besoin d'aide ?
Envoie-moi une capture des logs Railway du **nouveau** projet et le résultat de `https://ton-app.up.railway.app/health`
