# Mise à jour HADAR — à faire vous-même

Suivez les 6 étapes dans l'ordre. Chaque encadré se **copie-colle tel quel** dans PowerShell.

Comptez 10 minutes.

---

## Avant de commencer

Ouvrez PowerShell :
touche **Windows**, tapez `powershell`, appuyez sur **Entrée**.

Une fenêtre bleue s'ouvre. C'est là que vous collez les commandes.

> **Pour coller :** clic droit dans la fenêtre (le raccourci Ctrl+V ne marche pas toujours).
> **Après chaque commande :** appuyez sur **Entrée**.

---

## Étape 1 — Sauvegarder l'existant

Au cas où quelque chose se passe mal, on garde une copie de votre dossier actuel.

```powershell
cd $env:USERPROFILE\Desktop
Copy-Item HADAR_E HADAR_E_SAUVEGARDE_avant_maj -Recurse -Force
```

✅ **Vous devez voir :** rien du tout. En PowerShell, pas de message = tout va bien.

Un dossier `HADAR_E_SAUVEGARDE_avant_maj` est apparu sur votre Bureau. Ne le supprimez
qu'une fois que tout fonctionne (étape 6).

---

## Étape 2 — Décompresser le nouveau dossier

Téléchargez `hadar-corrige.zip` et placez-le sur votre **Bureau**.

Puis :

```powershell
cd $env:USERPROFILE\Desktop
Expand-Archive hadar-corrige.zip -DestinationPath maj-hadar -Force
```

✅ **Vous devez voir :** rien. Un dossier `maj-hadar` est apparu sur le Bureau.

> ⚠️ **Si vous voyez** `Expand-Archive : Le chemin d'accès ... est introuvable` :
> le fichier ZIP n'est pas sur le Bureau. Déplacez-le sur le Bureau et recommencez.

---

## Étape 3 — Remplacer les anciens fichiers

C'est l'étape qui applique la correction.

```powershell
cd $env:USERPROFILE\Desktop
Copy-Item maj-hadar\hadar-corrige\* HADAR_E -Recurse -Force
```

✅ **Vous devez voir :** rien.

**Ce qui est conservé automatiquement** (rassurez-vous, rien n'est perdu) :

| Fichier | Sort |
|---|---|
| Vos comptes utilisateurs (`accounts.json`) | 🔒 **Intact** |
| Vos mots de passe et clés (`.env`) | 🔒 **Intact** |
| Les résultats des jeux | ♻️ Remplacés par la version **corrigée** |

---

## Étape 4 — Vérifier que la correction est bien là

Cette commande compare les numéros de votre application avec ceux du canal Telegram.

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
node verifier.js
```

✅ **Vous devez voir, tout en bas, en vert :**

```
✅ TOUT EST CORRECT — 78/78 vérifications réussies
```

> ⚠️ **Si vous voyez** `node : Le terme «node» n'est pas reconnu` :
> Node.js n'est pas installé. Allez sur https://nodejs.org, installez la version
> **LTS**, **fermez PowerShell, rouvrez-le**, et refaites l'étape 4.

> ⚠️ **Si un nombre différent de 78 s'affiche avec des ❌ :** ne poussez pas en ligne.
> Envoyez-moi ce qui s'affiche, je corrige.

---

## Étape 5 — Contrôle de sécurité (30 secondes, important)

On vérifie que votre fichier de mots de passe ne part **pas** sur Internet.

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git ls-files | Select-String "^\.env$"
```

✅ **Vous devez voir : RIEN.** Une ligne vide = parfait, continuez à l'étape 6.

> 🔴 **Si `.env` s'affiche : ARRÊTEZ-VOUS.** Vos mots de passe partiraient en ligne.
> Lancez d'abord ceci :
>
> ```powershell
> git rm --cached .env
> ```
>
> Puis **changez votre clé Groq** sur https://console.groq.com/keys (bouton
> *Revoke*, puis créez-en une nouvelle et remplacez-la dans votre fichier `.env`).
> Ensuite seulement, passez à l'étape 6.

---

## Étape 6 — Envoyer en ligne

Les trois commandes se collent **d'un seul bloc** :

```powershell
cd $env:USERPROFILE\Desktop\HADAR_E
git add -A
git commit -m "Correction des numeros de jeux et des scores"
git push
```

✅ **Vous devez voir**, à la fin, quelque chose comme :

```
To https://github.com/...
   a1b2c3d..e4f5g6h  main -> main
```

Railway redéploie tout seul. **Attendez 2 à 3 minutes**, puis ouvrez votre site.

> ⚠️ **Si on vous demande un nom d'utilisateur et un mot de passe :** GitHub
> n'accepte plus le mot de passe classique. Il faut un *token*. Dites-le-moi,
> je vous guide.

> ⚠️ **Si vous voyez** `nothing to commit, working tree clean` :
> l'étape 3 n'a pas fonctionné. Reprenez-la.

---

## C'est terminé — comment savoir que ça marche

Ouvrez votre application, puis **à côté**, ouvrez le canal Telegram du même jeu.

**Le numéro affiché doit être identique dans les deux.**

Exemple concret sur Penalty 18 : si Telegram affiche `#N269`, votre application
doit annoncer le prochain match comme `#N270`. Avant la correction, elle affichait
un numéro sans rapport (genre `#N142`).

Vérifiez aussi **un score déjà terminé** : il doit correspondre au score final du
canal, et non à un score de mi-match.

Une fois que vous avez confirmé, supprimez la sauvegarde :

```powershell
Remove-Item $env:USERPROFILE\Desktop\HADAR_E_SAUVEGARDE_avant_maj -Recurse -Force
```

---

## Si vous voulez tout annuler

La sauvegarde de l'étape 1 remet tout comme avant :

```powershell
cd $env:USERPROFILE\Desktop
Remove-Item HADAR_E -Recurse -Force
Rename-Item HADAR_E_SAUVEGARDE_avant_maj HADAR_E
```

---

## Ce qui a été corrigé (en clair)

**1. Les numéros ne correspondaient pas.**
L'application renumérotait les parties à sa façon, en repartant de 1. Elle affichait
`#N142` pendant que le canal en était à `#N264`. Impossible pour vous de vérifier
quoi que ce soit. Elle affiche maintenant le vrai numéro du canal.

**2. Certains scores restaient bloqués en cours de match.**
Les canaux publient d'abord le score en direct, puis le corrigent à la fin. Votre
application gardait la **première** version. Un match terminé `4:5` pouvait rester
affiché `3:2` pour toujours — et ces faux scores faussaient toutes les statistiques.
Elle prend maintenant toujours la version finale.

**Résultat :** la base est passée de 8 933 à **10 908 parties**, toutes avec le bon
numéro et le bon score. J'ai refait tous les calculs sur cette base élargie : les
conclusions ne changent pas, ce qui est plutôt bon signe.
