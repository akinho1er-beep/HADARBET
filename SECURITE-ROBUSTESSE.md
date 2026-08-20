# 🔐 Robustesse — rate-limit, sessions, CORS

Trois durcissements, **sans aucune dépendance npm supplémentaire**.

---

## 1. Rate-limit anti-force brute

**Avant :** `/api/auth/login` acceptait un nombre illimité de tentatives. Un script pouvait tester des milliers de mots de passe.

**Maintenant :** fenêtre glissante par couple **IP + identifiant**, avec verrouillage progressif.

| Échecs cumulés | Blocage |
|---|---|
| 8 (défaut) | 1 min |
| 16 | 5 min |
| 24 | 15 min |
| 32+ | 60 min |

Une connexion réussie **remet le compteur à zéro**. Le blocage est **ciblé** : un attaquant sur une IP ne peut pas verrouiller le compte d'un utilisateur légitime ailleurs.

```
essai 1 : HTTP 401  ❌ Identifiant ou code d'accès incorrect. (2 tentatives restantes)
essai 2 : HTTP 401  ❌ Identifiant ou code d'accès incorrect. (1 tentative restante)
essai 3 : HTTP 401  ❌ Identifiant ou code d'accès incorrect.
essai 4 : HTTP 429  🔒 Trop de tentatives de connexion. Réessaie dans 1 minute.
```

### Bonus : faille d'énumération corrigée

Le code distinguait deux erreurs :
- `❌ Identifiant introuvable`
- `❌ Code d'accès incorrect`

Un attaquant pouvait donc **découvrir quels comptes existent** avant d'attaquer les mots de passe. Les deux cas renvoient désormais le **même message**.

```
compte inexistant : ❌ Identifiant ou code d'accès incorrect.
mauvais mot de passe : ❌ Identifiant ou code d'accès incorrect.
```

---

## 2. Sessions persistantes

**Avant :** `const sessions = new Map()` — en RAM. Chaque redéploiement Railway déconnectait **tous** les membres.

**Maintenant :** persistées dans `data/sessions.json`.

- **Écriture différée** (1 s) : pas d'accès disque à chaque requête
- **Écriture atomique** (`.tmp` + `rename`) : une coupure ne laisse jamais un JSON tronqué
- **Sauvegarde à l'arrêt** sur `SIGINT` / `SIGTERM`
- **Purge automatique** des sessions expirées au chargement et toutes les heures

Vérifié :
```
avant redémarrage : HTTP 200
--- redémarrage ---
[sessions] 1 session(s) restaurée(s)
après redémarrage : HTTP 200   ✅ token toujours valide
```

### Bonus : révocation immédiate

Désactiver ou supprimer un compte **coupait seulement l'accès au bout de 12 h** (durée du token). Les sessions sont maintenant révoquées sur-le-champ :

```
/me avant désactivation : HTTP 200
sessions révoquées : 1
/me après désactivation : HTTP 401
```

---

## 3. CORS restrictif

**Avant :** `app.use(cors())` — n'importe quel site pouvait appeler ton API depuis le navigateur d'un utilisateur connecté.

**Maintenant :** piloté par `ALLOWED_ORIGINS`.

| Valeur | Comportement |
|---|---|
| *(vide)* — **défaut** | Même origine uniquement. Suffit : le front est servi par ce serveur. |
| `https://mon-app.fr,https://autre.com` | Liste blanche |
| `*` | Tout autoriser — déconseillé |

```
origine malveillante  → HTTP 403  {"error":"Origine non autorisée."}
preflight OPTIONS     → HTTP 403
même origine          → HTTP 200
origine en liste blanche → HTTP 204 + Access-Control-Allow-Origin
```

### En-têtes de sécurité ajoutés

`X-Content-Type-Options: nosniff` · `X-Frame-Options: SAMEORIGIN` · `Referrer-Policy` · `Strict-Transport-Security` (en HTTPS)

---

## Configuration

Dans `.env` — tout est optionnel, les valeurs par défaut sont sûres :

```ini
# Vide = même origine uniquement (recommandé)
ALLOWED_ORIGINS=

RATE_MAX_ATTEMPTS=8
RATE_WINDOW_MS=900000      # 15 min
SESSION_TTL_MS=43200000    # 12 h
```

Au démarrage :
```
🔐 ✅ CORS : même origine uniquement (défaut sécurisé)
🔐 Rate-limit connexion : 8 tentatives / 15 min
🔐 Sessions persistées : 3 active(s) — data/sessions.json
```

---

## ⚠️ Spécificités Railway

1. **Volume persistant obligatoire.** Sans lui, `data/` est effacé à chaque déploiement — sessions **et** résultats collectés. Monte un volume et pointe `DATA_DIR` dessus.

2. **`trust proxy` est activé** : le rate-limit lit `X-Forwarded-For` pour obtenir la vraie IP client, et non celle du proxy Railway (qui bloquerait tout le monde d'un coup).

3. `data/sessions.json` est couvert par le `.gitignore` — il contient des jetons actifs.

---

## Vérification

```bash
node verifier.js --serveur
```

Section **7ter** — 12 contrôles, tous au vert. Total : **70/70**.
