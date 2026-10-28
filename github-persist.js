// ============================================================
// github-persist.js — GitHub utilisé comme disque persistant
// ------------------------------------------------------------
// Problème résolu : sur un hébergement SANS disque (Render gratuit),
// tout ce qui est collecté après le démarrage est perdu au redémarrage.
// Les compteurs retombent à 2, 0, 20…
//
// Solution : à chaque démarrage, l'application TÉLÉCHARGE l'historique
// le plus récent depuis le dépôt GitHub. Pendant qu'elle tourne, elle
// RENVOIE périodiquement les nouveaux résultats vers ce même dépôt.
// GitHub sert donc de disque, gratuitement.
//
// Activation (2 variables) :
//   GITHUB_TOKEN = jeton personnel « fine-grained » avec droit Contents: Read and write
//   GITHUB_REPO  = akinho1er-beep/HADARBET   (par défaut)
//
// Sans GITHUB_TOKEN, ce module ne fait STRICTEMENT RIEN : aucun risque.
// Toutes les erreurs sont avalées : jamais de plantage de l'application.
// ============================================================

const fs = require('fs');
const path = require('path');

const JEUX = ['baccara', 'penalty18', 'penalty22', 'jeu21', 'fifa4x4', 'fifa3x3'];
const FICHIERS_ANNEXES = ['backtest.json', 'significance.json'];

const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPO || 'akinho1er-beep/HADARBET';
const BRANCHE = process.env.GITHUB_BRANCH || 'main';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const INTERVALLE_MIN = parseInt(process.env.GITHUB_SAVE_MINUTES || '360', 10); // 6 h

const actif = () => Boolean(TOKEN);
const entetes = () => ({
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'HADAR-BetAnalytics',
});

function log(msg) { console.log(`[github] ${msg}`); }
function warn(msg) { console.warn(`[github] ${msg}`); }

// ── 1. RESTAURATION AU DÉMARRAGE ────────────────────────────────
// On lit la version la plus récente qui se trouve sur GitHub.
// On ne remplace un fichier local que si celui de GitHub est plus gros
// (= plus de résultats), pour ne jamais écraser par plus ancien.
async function restaurerDepuisGitHub() {
  // La lecture d'un dépôt public ne demande AUCUN jeton :
  // on restaure toujours, même si la sauvegarde est désactivée.
  let restaures = 0;
  try {
    for (const jeu of JEUX) {
      const nom = `${jeu}.json`;
      const url = `https://raw.githubusercontent.com/${REPO}/${BRANCHE}/data/${nom}`;
      try {
        const rep = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!rep.ok) continue;
        const brut = await rep.text();

        // On accepte les deux formats : tableau simple ou {value, Count}
        let liste;
        try {
          const parse = JSON.parse(brut.replace(/^\uFEFF/, ''));
          liste = Array.isArray(parse) ? parse : (parse.value || parse.results || []);
        } catch (_) { continue; }
        if (!Array.isArray(liste) || liste.length === 0) continue;

        const local = path.join(DATA_DIR, nom);
        let localNb = 0;
        try {
          if (fs.existsSync(local)) {
            const p = JSON.parse(fs.readFileSync(local, 'utf8').replace(/^\uFEFF/, ''));
            localNb = (Array.isArray(p) ? p : (p.value || [])).length;
          }
        } catch (_) {}

        if (liste.length > localNb) {
          fs.writeFileSync(local, JSON.stringify(liste, null, 2), 'utf8');
          restaures++;
          log(`${nom} : ${localNb} → ${liste.length} résultats récupérés depuis GitHub`);
        }
      } catch (_) { /* réseau : on continue */ }
    }
  } catch (e) {
    warn(`restauration impossible : ${e.message}`);
  }
  log(restaures ? `${restaures} fichier(s) restauré(s) depuis GitHub` : 'aucun fichier à restaurer');
  return { restaures };
}

// ── 2. SAUVEGARDE PÉRIODIQUE ────────────────────────────────────
async function envoyerFichier(nom, contenuTexte) {
  const chemin = `data/${nom}`;
  const api = `https://api.github.com/repos/${REPO}/contents/${chemin}`;

  // Il faut le SHA de la version actuelle (exigé par l'API pour modifier)
  let sha = null;
  try {
    const r = await fetch(`${api}?ref=${BRANCHE}`, {
      headers: entetes(), signal: AbortSignal.timeout(20000),
    });
    if (r.ok) { const j = await r.json(); sha = j.sha; }
  } catch (_) {}

  const corps = {
    message: `donnees: sauvegarde automatique ${new Date().toISOString().slice(0, 16)}`,
    content: Buffer.from(contenuTexte, 'utf8').toString('base64'),
    branch: BRANCHE,
  };
  if (sha) corps.sha = sha;

  const rep = await fetch(api, {
    method: 'PUT',
    headers: { ...entetes(), 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(30000),
  });
  if (!rep.ok) {
    const txt = await rep.text().catch(() => '');
    throw new Error(`${nom} : ${rep.status} ${txt.slice(0, 120)}`);
  }
}

async function sauvegarderMaintenant() {
  if (!actif()) return { envoyes: 0 };
  let envoyes = 0;
  for (const jeu of JEUX) {
    try {
      const f = path.join(DATA_DIR, `${jeu}.json`);
      if (!fs.existsSync(f)) continue;
      let liste;
      try {
        const p = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
        liste = Array.isArray(p) ? p : (p.value || []);
      } catch (_) { continue; }
      if (!Array.isArray(liste) || liste.length === 0) continue;

      // On n'envoie que si le fichier a réellement changé depuis le dernier envoi
      const chemin = path.join(DATA_DIR, '.github-last-save');
      let dernier = {};
      try { dernier = JSON.parse(fs.readFileSync(chemin, 'utf8')); } catch (_) {}
      if (dernier[jeu] === liste.length) continue; // rien de nouveau

      await envoyerFichier(`${jeu}.json`, JSON.stringify(liste, null, 2));
      dernier[jeu] = liste.length;
      try { fs.writeFileSync(chemin, JSON.stringify(dernier), 'utf8'); } catch (_) {}
      envoyes++;
      log(`${jeu}.json envoyé sur GitHub (${liste.length} résultats)`);
    } catch (e) {
      warn(`échec ${jeu} : ${e.message}`);
    }
  }
  return { envoyes };
}

function demarrerSauvegardePeriodique() {
  if (!actif()) { log('GITHUB_TOKEN absent → envoi automatique désactivé'); return; }
  const ms = Math.max(30, INTERVALLE_MIN) * 60 * 1000;
  log(`sauvegarde automatique toutes les ${Math.round(ms / 60000)} min vers ${REPO}`);
  setTimeout(() => { sauvegarderMaintenant().catch(() => {}); }, 60 * 1000);
  setInterval(() => { sauvegarderMaintenant().catch(() => {}); }, ms);
}

module.exports = { restaurerDepuisGitHub, sauvegarderMaintenant, demarrerSauvegardePeriodique, actif, JEUX };
