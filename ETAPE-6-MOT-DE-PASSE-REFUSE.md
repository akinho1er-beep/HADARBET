# « Mot de passe incorrect » à l'étape 6 — la solution

## D'abord : vous n'avez rien cassé

Ce n'est pas votre mot de passe qui est faux.

**Depuis août 2021, GitHub refuse les mots de passe.** Même le bon mot de passe est
rejeté. C'est une décision de GitHub, pas un problème chez vous.

**Vos modifications sont déjà enregistrées sur votre PC.** Le `git commit` de
l'étape 6 a fonctionné. Seul le dernier geste — l'envoi — a échoué. Il n'y a rien
à refaire : on reprend juste l'envoi.

---

## La solution : 3 commandes

On installe le petit outil officiel de GitHub. Il vous connecte **via votre
navigateur**, comme quand vous vous connectez à un site normal. Plus jamais de mot
de passe à taper dans PowerShell.

Comptez 5 minutes, et **c'est à faire une seule fois** — jamais à refaire ensuite.

---

### Commande 1 — Installer l'outil

```powershell
winget install --id GitHub.cli
```

✅ **Vous devez voir :** une barre de progression, puis `Successfully installed`.

> Si on vous demande d'accepter des conditions, tapez `Y` puis **Entrée**.

🔴 **MAINTENANT, FERMEZ POWERSHELL COMPLÈTEMENT** (croix rouge en haut à droite),
puis **rouvrez-le**.

Cette étape n'est pas optionnelle : sans elle, la commande suivante répondra
« *le terme gh n'est pas reconnu* ».

---

### Commande 2 — Se connecter

```powershell
gh auth login
```

Là, l'outil vous pose **4 questions**. Répondez en vous déplaçant avec les
**flèches ↑ ↓** du clavier et en validant avec **Entrée** :

| Question affichée | Votre réponse |
|---|---|
| `What account do you want to log into?` | **GitHub.com** |
| `What is your preferred protocol...?` | **HTTPS** |
| `Authenticate Git with your GitHub credentials?` | **Yes** |
| `How would you like to authenticate?` | **Login with a web browser** |

Ensuite un **code** s'affiche, du genre `A1B2-C3D4`.

1. **Notez ce code** (ou sélectionnez-le et faites Ctrl+C).
2. Appuyez sur **Entrée** → votre navigateur s'ouvre tout seul.
3. **Collez le code** dans la page, cliquez sur **Continue**, puis **Authorize**.
4. Revenez dans PowerShell.

✅ **Vous devez voir :** `✓ Logged in as votre-nom-github`

---

### Commande 3 — Envoyer (la vraie étape 6)

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git push
```

✅ **Vous devez voir**, à la fin :

```
To https://github.com/...
   a1b2c3d..e4f5g6h  main -> main
```

**C'est fait.** Railway redéploie tout seul : attendez 2 à 3 minutes, puis ouvrez
votre site.

---

## Si ça bloque encore

### « Le terme `gh` n'est pas reconnu »

Vous n'avez pas fermé puis rouvert PowerShell après la commande 1. Fermez la
fenêtre (croix rouge), rouvrez-la, refaites la commande 2.

### « Le terme `winget` n'est pas reconnu »

Votre Windows est trop ancien pour `winget`. Installez l'outil à la main :

1. Allez sur **https://cli.github.com**
2. Cliquez sur **Download for Windows**
3. Ouvrez le fichier téléchargé, cliquez sur *Suivant* jusqu'à la fin
4. Fermez et rouvrez PowerShell, puis reprenez à la **commande 2**

### On me redemande *encore* un mot de passe

Windows a gardé l'ancien mot de passe en mémoire. On le supprime :

```powershell
cmd /c "echo protocol=https& echo host=github.com&" | git credential-manager erase
```

Puis refaites la **commande 2**, ensuite la **commande 3**.

> Si cette commande affiche une erreur, faites-le à la main :
> touche Windows → tapez `Gestionnaire d'identification` → **Informations
> d'identification Windows** → cherchez la ligne **git:https://github.com** →
> cliquez dessus → **Supprimer**. Puis refaites les commandes 2 et 3.

### « Everything up-to-date »

Bonne nouvelle : **c'était déjà envoyé.** Votre site est à jour, vérifiez-le.

---

## Comment savoir que tout a marché

Ouvrez votre application, et **à côté** le canal Telegram du même jeu.

**Le numéro doit être le même dans les deux.** Si Telegram affiche `#N269`, votre
application annonce le prochain match en `#N270`.

Avant la correction, elle affichait un numéro sans aucun rapport (par exemple
`#N142`). C'est le signe le plus simple que la mise à jour est bien en ligne.

---

## Et la prochaine fois ?

Vous ne referez **jamais** les commandes 1 et 2. Votre PC se souvient de la
connexion.

Pour envoyer une future modification, seulement ces trois lignes :

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git add -A
git commit -m "description de ce que j'ai change"
git push
```
