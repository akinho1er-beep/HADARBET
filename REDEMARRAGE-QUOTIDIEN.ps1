# HADAR — Redémarrage quotidien automatique Railway
# Place ce fichier dans C:\Users\HP\Desktop\HADAR_E\REDEMARRAGE-QUOTIDIEN.ps1
# Il redémarre le service SANS rebuild (10 secondes), même si ton PC est en veille.

param(
  [string]$ServiceName = ""  # laisse vide si un seul service, sinon mets le nom exact Railway
)

$ErrorActionPreference = "Stop"

# 1. Vérifie que la CLI Railway est installée
try { $null = Get-Command railway -ErrorAction Stop } catch {
  Write-Host "❌ Railway CLI non trouvée. Installation..." -ForegroundColor Red
  npm i -g @railway/cli
}

# 2. Vérifie la connexion
try {
  railway whoami | Out-Null
} catch {
  Write-Host "⚠️ Non connecté à Railway. Ouverture du login..." -ForegroundColor Yellow
  railway login
}

# 3. Redémarre (sans rebuild)
Write-Host "🔄 Redémarrage Railway en cours..." -ForegroundColor Cyan
if ($ServiceName -ne "") {
  railway restart --service $ServiceName --yes
} else {
  railway restart --yes
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Redémarré avec succès à $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
} else {
  Write-Host "❌ Echec du redémarrage. Vérifie 'railway status' et ton token." -ForegroundColor Red
  exit 1
}
