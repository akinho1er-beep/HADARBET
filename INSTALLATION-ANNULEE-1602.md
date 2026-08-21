# « Installation annulée » (code 1602) — rien de grave

## Ce qui s'est passé

Le téléchargement a parfaitement fonctionné (14,4 Mo, vérifié). C'est **juste après**
que ça a coincé.

Windows a affiché une fenêtre bleue demandant :

> *« Voulez-vous autoriser cette application à apporter des modifications à votre
> appareil ? »*

Cette fenêtre a été fermée ou refusée. Résultat : **code 1602 = annulé par
l'utilisateur**.

Trois explications possibles :

- vous avez cliqué **Non** (par prudence — c'est un bon réflexe en général) ;
- la fenêtre s'est ouverte **derrière** PowerShell et vous ne l'avez pas vue ;
- votre **antivirus** l'a bloquée automatiquement.

Dans tous les cas : rien de cassé, on recommence autrement.

---

# Méthode A — la plus simple (2 minutes)

On ouvre PowerShell **en tant qu'administrateur**. La fenêtre bleue apparaîtra
alors **une seule fois, au tout début**, et vous ne pourrez pas la manquer.

### 1. Fermez la fenêtre PowerShell actuelle (croix rouge)

### 2. Rouvrez-la en administrateur

- Touche **Windows**
- Tapez `powershell`
- 🔴 **Clic DROIT** sur *Windows PowerShell*
- Choisissez **« Exécuter en tant qu'administrateur »**
- Windows affiche la fenêtre bleue → cliquez sur **OUI**

✅ **Comment savoir que c'est bon :** en haut de la fenêtre, le titre commence par
**« Administrateur : Windows PowerShell »**.

Si le mot « Administrateur » n'y est pas, recommencez — sinon ça échouera encore.

### 3. Relancez l'installation

```powershell
winget install --id GitHub.cli
```

✅ **Vous devez voir :** `Successfully installed` (aucune fenêtre bleue cette
fois-ci).

### 4. Fermez cette fenêtre et rouvrez PowerShell **normalement**

(Sans clic droit, cette fois. On ne travaille pas en administrateur au quotidien.)

Puis reprenez la **commande 2** du guide précédent :

```powershell
gh auth login
```

---

# Méthode B — si la méthode A ne marche pas

On installe à la main, comme n'importe quel logiciel. C'est plus visuel et ça
fonctionne toujours.

### 1. Téléchargez le fichier

Ouvrez ce lien dans votre navigateur :

**https://github.com/cli/cli/releases/download/v2.97.0/gh_2.97.0_windows_amd64.msi**

> C'est exactement le fichier que winget avait déjà téléchargé et vérifié — donc
> sans risque.

### 2. Installez-le

- Ouvrez le fichier téléchargé (dossier **Téléchargements**)
- Windows affiche la fenêtre bleue → **cliquez sur OUI** (c'est l'étape qui avait
  échoué)
- Cliquez **Next** → **Next** → **Install** → **Finish**

> Si votre antivirus proteste, choisissez **Autoriser** / **Conserver**. Le fichier
> vient du site officiel de GitHub.

### 3. Fermez et rouvrez PowerShell, puis :

```powershell
gh auth login
```

---

## Rappel : où vous en êtes

| Étape | État |
|---|---|
| Vos corrections appliquées sur le PC | ✅ Fait |
| Vos modifications enregistrées (`commit`) | ✅ Fait |
| Envoi en ligne (`push`) | ⏳ Il ne reste que ça |

**Vous n'avez rien perdu.** Une fois `gh auth login` passé, il ne restera plus que :

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git push
```

---

## La suite, pour mémoire

Après l'installation, `gh auth login` vous pose 4 questions. Déplacez-vous avec les
**flèches ↑ ↓**, validez avec **Entrée** :

| Question | Réponse |
|---|---|
| `What account do you want to log into?` | **GitHub.com** |
| `What is your preferred protocol...?` | **HTTPS** |
| `Authenticate Git with your GitHub credentials?` | **Yes** |
| `How would you like to authenticate?` | **Login with a web browser** |

Un code s'affiche (`A1B2-C3D4`) → notez-le → **Entrée** → le navigateur s'ouvre →
collez le code → **Continue** → **Authorize**.

✅ `✓ Logged in as votre-nom`

Puis `git push`. Et c'est terminé.
