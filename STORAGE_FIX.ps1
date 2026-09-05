# Fix immédiat sans re-télécharger le ZIP
# Colle tout ce bloc dans PowerShell (une fois)
cd $env:USERPROFILE\Desktop\HADAR_E

# Écrase storage.js avec la version qui restaure même un volume incomplet (38 entrées)
$js = @'
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const REPO_DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }
(function amorcerVolumeSiVide() {
  try {
    if (DATA_DIR === REPO_DATA_DIR) return;
    const jeux = ['baccara','penalty18','penalty22','jeu21','fifa4x4','fifa3x3'];
    let besoinRestauration = false;
    for (const j of jeux) {
      const dst = path.join(DATA_DIR, `${j}.json`);
      const src = path.join(REPO_DATA_DIR, `${j}.json`);
      if (!fs.existsSync(src)) continue;
      let srcLen = 0, dstLen = 0;
      try { srcLen = JSON.parse(fs.readFileSync(src,'utf8')).length; } catch(_) {}
      try { dstLen = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst,'utf8')).length : 0; } catch(_) {}
      if (srcLen > 1000 && dstLen < 500) { besoinRestauration = true; break; }
      if (!fs.existsSync(dst) && srcLen > 0) { besoinRestauration = true; break; }
    }
    if (!besoinRestauration) return;
    const volumeVide = !jeux.some(j => fs.existsSync(path.join(DATA_DIR, `${j}.json`)));
    console.log(`[storage] Volume ${DATA_DIR} ${volumeVide ? 'vide' : 'incomplet (38-110 entrées)'} → restauration depuis ${REPO_DATA_DIR}`);
    let copies = 0;
    for (const j of jeux) {
      const src = path.join(REPO_DATA_DIR, `${j}.json`);
      const dst = path.join(DATA_DIR, `${j}.json`);
      if (!fs.existsSync(src)) continue;
      let srcLen = 0, dstLen = 0;
      try { srcLen = JSON.parse(fs.readFileSync(src,'utf8')).length; } catch(_) {}
      try { dstLen = fs.existsSync(dst) ? JSON.parse(fs.readFileSync(dst,'utf8')).length : 0; } catch(_) {}
      if (!fs.existsSync(dst) || (srcLen > 1000 && dstLen < 500)) {
        fs.copyFileSync(src, dst);
        console.log(`[storage] ↳ ${j}.json : ${dstLen} → ${srcLen} entrées`);
        copies++;
      }
    }
    if (copies) console.log(`[storage] ✅ ${copies} fichier(s) restauré(s) vers ${DATA_DIR}`);
  } catch (e) { console.warn('[storage] Amorçage volume échoué:', e.message); }
})();
'@

# Ce script va juste vérifier que ton ZIP local est bien le nouveau (641K du 04/09 23:41)
Write-Host "Vérification du ZIP sur le Bureau..." -ForegroundColor Cyan
if (Test-Path "$env:USERPROFILE\Desktop\hadar-corrige.zip") {
  $z = Get-Item "$env:USERPROFILE\Desktop\hadar-corrige.zip"
  Write-Host "ZIP trouvé : $($z.Length/1KB) Ko, modifié le $($z.LastWriteTime)" -ForegroundColor Yellow
  if ($z.Length -lt 600KB) { Write-Host "⚠️ ZIP trop petit = ancien ZIP !" -ForegroundColor Red }
}
