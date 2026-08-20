# 🤖 Analyse IA — configuration Groq

## Réponse courte

**Oui, et c'était déjà le cas.** L'avertissement `ANTHROPIC_API_KEY manquante` était un **message fantôme** : il pointait vers du code que ton application n'appelait plus.

---

## Ce que révélait le diagnostic

```bash
# Le frontend appelle-t-il /analyze (Anthropic) ?
grep "/analyze" betting-analyzer.html
→ (aucun résultat)

# Et /api/groq-analyze ?
grep "groq-analyze" betting-analyzer.html
→ ligne 6789 : await apiFetch('/api/groq-analyze', {...})
```

**Ton app utilisait déjà Groq exclusivement.** L'endpoint `/analyze` (Anthropic) était un vestige : du code mort qui déclenchait un avertissement anxiogène à chaque démarrage, en annonçant que « les analyses IA échoueront » — alors qu'elles fonctionnaient parfaitement.

---

## Corrections appliquées

| Avant | Après |
|---|---|
| `⚠️ ANTHROPIC_API_KEY manquante. Les analyses IA échoueront.` | `ℹ️ GROQ_API_KEY non configurée — les moteurs locaux fonctionnent normalement` |
| `/analyze` → `api.anthropic.com` (échouait toujours) | `/analyze` → `api.groq.com` (rétrocompatible) |
| `⚠️ TELEGRAM_BOT_TOKEN manquant` | `ℹ️ Collecte via les pages publiques t.me/s/ (aucun token requis)` |

### Sur le message Telegram

Il était doublement trompeur : la collecte passe par les pages publiques `t.me/s/`, **sans aucune authentification**. Et le fallback `getUpdates` ne peut de toute façon **pas** lire l'historique d'un canal public — ce token n'aurait rien apporté.

---

## Logs au démarrage

**Avant**
```
⚠️  TELEGRAM_BOT_TOKEN manquant. Définis-le avec:
   export TELEGRAM_BOT_TOKEN=...
⚠️  ANTHROPIC_API_KEY manquante. Les analyses IA échoueront.
   export ANTHROPIC_API_KEY=sk-ant-...
```

**Après (sans clé)**
```
ℹ️  Collecte Telegram via les pages publiques t.me/s/ (aucun token requis).
ℹ️  GROQ_API_KEY non configurée — les moteurs locaux fonctionnent normalement,
   seule l'analyse IA enrichie est désactivée.
   Clé gratuite : https://console.groq.com/keys
```

**Après (avec clé)**
```
✅ GROQ_API_KEY détectée — analyse IA enrichie active.
```

---

## « Une clé est déjà présente dans mon .env — dois-je en créer une nouvelle ? »

**D'abord, teste-la. Ne la remplace que si nécessaire :**

```bash
npm run test-groq
```

Le script interroge l'API Groq et **n'affiche jamais ta clé en entier** (seulement `gsk_ABC…7890`).

| Résultat | Que faire |
|---|---|
| ✅ **CLÉ VALIDE** | **Rien.** Garde-la, tout fonctionne. |
| ❌ **Invalid API Key** (401) | Génère-en une nouvelle. |
| ⚠️ **Quota atteint** (429) | Clé valide, juste limitée. Attends — inutile d'en créer une autre. |
| ⚠️ Commence par `sk-ant-` | C'est une clé **Anthropic**, plus utilisée. Crée une clé Groq. |

### ⚠️ Un cas qui impose de la révoquer

Si cette clé a déjà été **exposée** — poussée sur GitHub, partagée dans un message, collée dans un forum ou une conversation — **révoque-la et crée-en une nouvelle**, même si elle fonctionne. Une clé publiée est compromise : n'importe qui peut consommer ton quota.

Pour le vérifier, si ton projet est versionné :

```bash
git log --all -p -- .env | Select-String "gsk_"
```

S'il en ressort quelque chose, la clé est dans l'historique Git : révoque-la sur [console.groq.com/keys](https://console.groq.com/keys).

> Le `.gitignore` livré protège désormais `.env`. Mais il n'efface pas ce qui a **déjà** été committé auparavant.

### D'où vient cette clé ?

Elle ne vient ni de moi ni de l'archive : le `.env.example` livre `GROQ_API_KEY=` **vide**, et aucune clé n'est codée en dur dans les sources (vérifié). Elle provient donc soit d'une configuration que tu avais déjà, soit d'une saisie manuelle.

---

## Obtenir une clé Groq (gratuit, ~1 minute)

1. Va sur **https://console.groq.com/keys**
2. Connecte-toi (Google ou GitHub)
3. **Create API Key** → copie la valeur (commence par `gsk_`)
4. Ouvre `.env` et renseigne :
   ```ini
   GROQ_API_KEY=gsk_ta_cle_ici
   ```
5. Relance : `node server.js`

Sur **Railway** : ajoute `GROQ_API_KEY` dans les *Variables* du projet.

### Ce que la clé apporte

Un commentaire en langage naturel (Llama 3.3 70B) qui vient **compléter** les moteurs statistiques — jamais les remplacer. Le prompt précise explicitement que ces jeux sont des **simulations RNG**, ce qui interdit à l'IA d'inventer un raisonnement « football réel ».

Le plan gratuit suffit largement : cache de 45 s par jeu côté serveur, et minimum 5 résultats requis avant tout appel.

### Sans la clé

**Tout continue de fonctionner** : collecte, moteurs calibrés, backtest, onglet Performance, statistiques. Seul le commentaire IA enrichi est absent. Aucune erreur.

---

## Vérification

```bash
node verifier.js --serveur
```

Section **7bis** :
```
✅ Plus d'avertissement ANTHROPIC_API_KEY au démarrage
✅ L'endpoint /analyze utilise Groq
✅ Aucune dépendance restante à ANTHROPIC_API_KEY
✅ Message Telegram informatif (token facultatif)
```

Test direct de l'endpoint :
```bash
curl -X POST http://localhost:3000/analyze \
     -H "Content-Type: application/json" \
     -d "{\"prompt\":\"Bonjour\"}"
```
- Sans clé → message clair invitant à configurer Groq
- Avec clé → réponse `{ "raw": "...", "provider": "groq", "model": "llama-3.3-70b-versatile" }`
