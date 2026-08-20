# 📦 HADAR BetAnalytics — Correctifs à installer

Cette archive contient la **version corrigée** de ton projet.
Ton dossier `HADAR_E` actuel fait encore tourner l'ancien code.

---

## ⚡ Installation en 3 étapes

### 1. Décompresse l'archive
Décompresse `hadar-corrige.zip` dans un dossier temporaire (pas directement dans `HADAR_E`).

### 2. Copie les fichiers dans ton projet
Copie **tout le contenu** du dossier décompressé dans `C:\Users\HP\Desktop\HADAR_E`, en acceptant le remplacement.

### 3. Lance l'installeur

**➜ Double-clique sur `INSTALLATION-SIMPLE.bat`**

C'est tout. Le script sauvegarde ton ancienne version, libère le port 3000, crée le `.env`, installe les dépendances et vérifie l'installation.

> **Pourquoi un `.bat` et non un `.ps1` ?**
> Windows refuse par défaut d'exécuter les scripts PowerShell non signés :
> *« le fichier n'est pas signé numériquement »*.
> Les fichiers `.bat` échappent à cette restriction — d'où ce lanceur.

#### Les autres options

| Fichier | Usage |
|---|---|
| `INSTALLATION-SIMPLE.bat` | ⭐ **Recommandé.** 100 % batch, aucun PowerShell |
| `INSTALLER.bat` | Lance le `.ps1` en contournant la politique d'exécution |
| `INSTALLER.ps1` | Version PowerShell (affichage en couleurs) |

Pour lancer la version PowerShell malgré la restriction :
```powershell
powershell -ExecutionPolicy Bypass -File .\INSTALLER.ps1
```

Si Windows bloque encore (fichier marqué « téléchargé d'Internet ») :
```powershell
Get-ChildItem -Recurse | Unblock-File
powershell -ExecutionPolicy Bypass -File .\INSTALLER.ps1
```

---

## 🔧 Installation manuelle (si tu préfères)

```powershell
cd C:\Users\HP\Desktop\HADAR_E

# 1. Sauvegarde
mkdir backup-avant
copy betting-analyzer.html,server.js,storage.js backup-avant\

# 2. (les fichiers de l'archive sont déjà copiés)

# 3. Configuration
copy .env.example .env
notepad .env          # renseigne ADMIN_PASS

# 4. Dépendances
npm install

# 5. Libère le port 3000 si besoin
netstat -ano | findstr :3000
taskkill /PID <PID_affiché> /F

# 6. Démarre
node server.js
```

---

## ✅ Vérifier que tout est bon

Tu dois voir au démarrage :

```
[env] 9 variable(s) chargée(s) depuis .env
✅ HADAR BetAnalytics Server v3 (Resilient Edition)
   Port: 3000
```

> **La ligne `[env]` est le signe que tu fais bien tourner la nouvelle version.**
> Si elle n'apparaît pas, les fichiers n'ont pas été remplacés.

Puis, dans un **second terminal** :

```powershell
node verifier.js --serveur
```

Résultat attendu : `✅ TOUT EST CORRECT — 58/58 vérifications réussies`

Le guide détaillé, avec les contrôles visuels à faire dans l'interface, est dans **`GUIDE-VERIFICATION.md`**.

---

## 🔑 Le fichier `.env`

Fini les `$env:VAR=...` à chaque lancement. Tout est dans `.env` :

```ini
ADMIN_USER=HADAR_ADMIN
ADMIN_PASS=ton-mot-de-passe-solide
PORT=3000
GROQ_API_KEY=
TELEGRAM_BOT_TOKEN=
```

Trois points importants :
- Le fichier `.env` est **ignoré par Git** (via `.gitignore`) — tes secrets ne partiront pas sur GitHub
- Les variables **système restent prioritaires** : sur Railway, les variables de la plateforme l'emportent sur le `.env`
- Si `ADMIN_PASS` est vide, un mot de passe aléatoire est généré et affiché **une seule fois** au premier démarrage

---

## 📋 Ce que contient l'archive

| Fichier | Rôle |
|---|---|
| `betting-analyzer.html` | ⭐ Onglet Performance + moteur v4 calibré |
| `server.js` | ⭐ Correctifs de parsing + chargement `.env` |
| `storage.js` | ⭐ Sécurité du mot de passe admin |
| `env-loader.js` | Chargement `.env` sans dépendance |
| `.env.example` | Modèle de configuration |
| `.gitignore` | Protège tes secrets |
| `INSTALLATION-SIMPLE.bat` | ⭐ Installation Windows (double-clic) |
| `INSTALLER.bat` | Lanceur du script PowerShell |
| `INSTALLER.ps1` | Installation PowerShell (couleurs) |
| `verifier.js` | 58 tests de vérification |
| `GUIDE-VERIFICATION.md` | Guide de contrôle pas à pas |
| `CORRECTIFS-APPLIQUES.md` | Détail de chaque correctif |
| `RESULTATS-BACKTEST.md` | Analyse statistique complète |
| `performance.html` | Tableau de bord autonome |
| `tools/` | Collecte, backtest, tests statistiques |
| `data/` | 4 152 résultats réels + rapports |

---

## 🚀 Pour Railway

1. Dans **Variables**, définis `ADMIN_PASS` (sinon un mot de passe aléatoire est régénéré à chaque déploiement)
2. Ne verse **jamais** le fichier `.env` sur Git — le `.gitignore` s'en charge
3. Optionnel : `GROQ_API_KEY` pour l'analyse IA enrichie
4. Recommandé : un volume persistant pointé par `DATA_DIR`, sinon les résultats sont perdus à chaque redéploiement

---

## ↩️ Revenir en arrière

L'installeur crée un dossier `backup-avant-correctifs-<date>`. Pour restaurer :

```powershell
Copy-Item "backup-avant-correctifs-<date>\*" -Destination . -Force
```
