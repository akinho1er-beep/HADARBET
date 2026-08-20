# ============================================================
#  HADAR BetAnalytics — Installation des correctifs
#  Usage (PowerShell, dans le dossier decompresse) :
#      .\INSTALLER.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProgressPreference    = "SilentlyContinue"

function Titre($t) {
    Write-Host ""
    Write-Host "-------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host "-------------------------------------------------------------" -ForegroundColor Cyan
}
function Ok($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]    $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "  [ERR]  $m" -ForegroundColor Red }

Write-Host ""
Write-Host "=============================================================" -ForegroundColor Magenta
Write-Host "   HADAR BetAnalytics - Installation des correctifs" -ForegroundColor Magenta
Write-Host "=============================================================" -ForegroundColor Magenta

$dossier = $PSScriptRoot
Set-Location $dossier
Write-Host "  Dossier : $dossier" -ForegroundColor Gray

# ── 1. Verification de Node ─────────────────────────────────
Titre "1. Verification de Node.js"
try {
    $v = node -v
    Ok "Node.js $v detecte"
} catch {
    Err "Node.js introuvable. Installe-le depuis https://nodejs.org"
    Read-Host "`nAppuie sur Entree pour fermer"
    exit 1
}

# ── 2. Sauvegarde de l'ancienne version ─────────────────────
Titre "2. Sauvegarde de ta version actuelle"
$horo = Get-Date -Format "yyyyMMdd-HHmmss"
$sauv = Join-Path $dossier "backup-avant-correctifs-$horo"

$aSauver = @("betting-analyzer.html","server.js","storage.js","package.json")
$trouves = $aSauver | Where-Object { Test-Path (Join-Path $dossier $_) }

if ($trouves.Count -gt 0) {
    New-Item -ItemType Directory -Path $sauv -Force | Out-Null
    foreach ($f in $trouves) {
        Copy-Item (Join-Path $dossier $f) -Destination $sauv -Force
    }
    Ok "$($trouves.Count) fichier(s) sauvegarde(s) dans :"
    Write-Host "         backup-avant-correctifs-$horo" -ForegroundColor Gray
} else {
    Warn "Aucun fichier existant a sauvegarder (nouvelle installation)"
}

# ── 3. Liberation du port ───────────────────────────────────
Titre "3. Liberation du port"
$envPort = 3000
if (Test-Path (Join-Path $dossier ".env")) {
    $ligne = Select-String -Path (Join-Path $dossier ".env") -Pattern '^\s*PORT\s*=\s*(\d+)' -ErrorAction SilentlyContinue
    if ($ligne) { $envPort = [int]$ligne.Matches[0].Groups[1].Value }
}

$occupe = Get-NetTCPConnection -LocalPort $envPort -State Listen -ErrorAction SilentlyContinue
if ($occupe) {
    $pids = $occupe | Select-Object -ExpandProperty OwningProcess -Unique
    Warn "Le port $envPort est utilise par le(s) processus : $($pids -join ', ')"
    $rep = Read-Host "  Arreter ce(s) processus ? (O/n)"
    if ($rep -eq "" -or $rep -match '^[oOyY]') {
        foreach ($processId in $pids) {
            try { Stop-Process -Id $processId -Force; Ok "Processus $processId arrete" }
            catch { Warn "Impossible d'arreter $processId" }
        }
        Start-Sleep -Seconds 2
    } else {
        Warn "Port laisse occupe - modifie PORT dans le fichier .env"
    }
} else {
    Ok "Port $envPort disponible"
}

# ── 4. Fichier .env ─────────────────────────────────────────
Titre "4. Configuration (.env)"
$envFile = Join-Path $dossier ".env"
if (Test-Path $envFile) {
    Ok "Fichier .env deja present - conserve tel quel"
} else {
    Copy-Item (Join-Path $dossier ".env.example") -Destination $envFile -Force
    Ok "Fichier .env cree depuis .env.example"

    Write-Host ""
    Write-Host "  Definis maintenant ton mot de passe administrateur." -ForegroundColor Yellow
    $mdp = Read-Host "  ADMIN_PASS (Entree = genere automatiquement)"
    if ($mdp -ne "") {
        (Get-Content $envFile) -replace '^ADMIN_PASS=.*', "ADMIN_PASS=$mdp" |
            Set-Content $envFile -Encoding UTF8
        Ok "Mot de passe enregistre dans .env"
    } else {
        (Get-Content $envFile) -replace '^ADMIN_PASS=.*', 'ADMIN_PASS=' |
            Set-Content $envFile -Encoding UTF8
        Warn "Un mot de passe aleatoire sera genere et affiche au 1er demarrage"
    }
}

# ── 5. Dependances ──────────────────────────────────────────
Titre "5. Installation des dependances"
Write-Host "  npm install en cours, patiente..." -ForegroundColor Gray

# IMPORTANT : npm ecrit ses avertissements sur stderr. Avec
# $ErrorActionPreference = "Stop", PowerShell transforme chaque ligne stderr
# d'un programme externe en NativeCommandError FATAL et interrompt le script.
# On neutralise donc ce comportement le temps de l'appel, et on passe par
# cmd.exe pour que la sortie ne soit pas reinterpretee par PowerShell.
$anciennePref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    cmd /c "npm install --no-audit --no-fund 2>&1" | Out-Null
    $codeNpm = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $anciennePref
}

if ($codeNpm -eq 0) {
    Ok "Dependances installees"
} else {
    Warn "npm a renvoye le code $codeNpm - verifie ta connexion si l'etape 6 echoue"
}

# ── 6. Verification ─────────────────────────────────────────
Titre "6. Verification des correctifs"
if (Test-Path (Join-Path $dossier "verifier.js")) {
    # Meme precaution qu'a l'etape 5 : ne pas transformer stderr en erreur fatale.
    $anciennePref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        node verifier.js
        $codeVerif = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $anciennePref
    }
    if ($codeVerif -eq 0) { Ok "Toutes les verifications sont passees" }
    else { Warn "Certaines verifications ont echoue - voir le detail ci-dessus" }
} else {
    Warn "verifier.js absent - verification ignoree"
}

# ── 7. Fin ──────────────────────────────────────────────────
Titre "Installation terminee"
Write-Host ""
Write-Host "  Pour demarrer le serveur :" -ForegroundColor White
Write-Host "      node server.js" -ForegroundColor Green
Write-Host ""
Write-Host "  Puis ouvre :  http://localhost:$envPort" -ForegroundColor White
Write-Host ""
Write-Host "  Verification complete (serveur demarre, dans un 2e terminal) :" -ForegroundColor White
Write-Host "      node verifier.js --serveur" -ForegroundColor Green
Write-Host ""
if ($trouves.Count -gt 0) {
    Write-Host "  Revenir en arriere :" -ForegroundColor White
    Write-Host "      Copy-Item '$sauv\*' -Destination . -Force" -ForegroundColor Gray
    Write-Host ""
}

$demarrer = Read-Host "  Demarrer le serveur maintenant ? (O/n)"
if ($demarrer -eq "" -or $demarrer -match '^[oOyY]') {
    Write-Host ""
    Write-Host "  Demarrage... (Ctrl+C pour arreter)" -ForegroundColor Cyan
    Write-Host ""
    node server.js
} else {
    Read-Host "`n  Appuie sur Entree pour fermer"
}
