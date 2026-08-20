@echo off
REM ============================================================
REM  HADAR BetAnalytics - Lanceur d'installation
REM
REM  Double-clique simplement sur ce fichier.
REM
REM  Les fichiers .bat ne sont PAS soumis a la politique
REM  d'execution PowerShell : ce lanceur contourne donc
REM  l'erreur "le fichier n'est pas signe numeriquement".
REM ============================================================

cd /d "%~dp0"

echo.
echo =============================================================
echo    HADAR BetAnalytics - Installation
echo =============================================================
echo.

REM Retire le marquage "fichier telecharge d'Internet" (Mark of the Web)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" 2>nul

REM Lance le script d'installation en contournant la politique d'execution
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALLER.ps1"

if errorlevel 1 (
    echo.
    echo [ERREUR] L'installation a rencontre un probleme.
    echo          Consulte les messages ci-dessus.
    echo.
    pause
)
