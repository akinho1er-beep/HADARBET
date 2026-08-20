@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  HADAR BetAnalytics - Installation 100% batch
REM  Aucun PowerShell requis : immunise contre l'erreur
REM  "le fichier n'est pas signe numeriquement".
REM
REM  Double-clique sur ce fichier.
REM ============================================================

cd /d "%~dp0"
color 0B

echo.
echo =============================================================
echo    HADAR BetAnalytics - Installation des correctifs
echo =============================================================
echo   Dossier : %CD%
echo.

REM ---------- 1. Node.js ----------
echo -------------------------------------------------------------
echo   1. Verification de Node.js
echo -------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo   [ERREUR] Node.js introuvable.
    echo            Installe-le depuis https://nodejs.org puis relance.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   [OK]   Node.js %%v detecte

REM ---------- 2. Sauvegarde ----------
echo.
echo -------------------------------------------------------------
echo   2. Sauvegarde de ta version actuelle
echo -------------------------------------------------------------
set "HORO=%DATE:~-4%%DATE:~3,2%%DATE:~0,2%-%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
set "HORO=%HORO: =0%"
set "SAUV=backup-avant-correctifs-%HORO%"

if exist "server.js" (
    mkdir "%SAUV%" 2>nul
    for %%f in (betting-analyzer.html server.js storage.js package.json) do (
        if exist "%%f" copy /Y "%%f" "%SAUV%\" >nul 2>&1
    )
    echo   [OK]   Sauvegarde creee : %SAUV%
) else (
    echo   [!]    Nouvelle installation - rien a sauvegarder
)

REM ---------- 3. Port ----------
echo.
echo -------------------------------------------------------------
echo   3. Liberation du port 3000
echo -------------------------------------------------------------
set "TROUVE="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    if not "%%p"=="0" (
        set "TROUVE=%%p"
        echo   [!]    Port 3000 occupe par le processus %%p
        taskkill /PID %%p /F >nul 2>&1
        if not errorlevel 1 (echo   [OK]   Processus %%p arrete) else (echo   [!]    Impossible d'arreter %%p)
    )
)
if not defined TROUVE echo   [OK]   Port 3000 disponible

REM ---------- 4. Fichier .env ----------
echo.
echo -------------------------------------------------------------
echo   4. Configuration (.env)
echo -------------------------------------------------------------
if exist ".env" (
    echo   [OK]   Fichier .env deja present - conserve
) else (
    copy /Y ".env.example" ".env" >nul
    echo   [OK]   Fichier .env cree
    echo.
    echo   Choisis ton mot de passe administrateur.
    echo   (evite les caracteres ^^ ^& ^| ^< ^> %% et ! - cmd.exe les interprete.
    echo    Pour un mot de passe complexe, laisse vide et edite .env au Bloc-notes)
    set /p "MDP=  ADMIN_PASS (ou Entree pour generation auto) : "
    if not "!MDP!"=="" (
        > ".env.tmp" (
          for /f "usebackq delims=" %%l in (".env") do (
            set "L=%%l"
            if "!L:~0,11!"=="ADMIN_PASS=" (echo ADMIN_PASS=!MDP!) else (echo !L!)
          )
        )
        move /Y ".env.tmp" ".env" >nul
        echo   [OK]   Mot de passe enregistre
    ) else (
        echo   [!]    Un mot de passe aleatoire sera affiche au 1er demarrage
    )
)

REM ---------- 5. Dependances ----------
echo.
echo -------------------------------------------------------------
echo   5. Installation des dependances
echo -------------------------------------------------------------
echo   npm install en cours, patiente...
call npm install --no-audit --no-fund >nul 2>&1
if errorlevel 1 (
    echo   [!]    Avertissements npm - on continue
) else (
    echo   [OK]   Dependances installees
)

REM ---------- 6. Verification ----------
echo.
echo -------------------------------------------------------------
echo   6. Verification des correctifs
echo -------------------------------------------------------------
if exist "verifier.js" (
    call node verifier.js
) else (
    echo   [!]    verifier.js absent
)

REM ---------- 7. Fin ----------
echo.
echo =============================================================
echo    Installation terminee
echo =============================================================
echo.
echo   Demarrer le serveur :     node server.js
echo   Puis ouvrir :             http://localhost:3000
echo.
echo   Verification complete (2e terminal, serveur lance) :
echo                             node verifier.js --serveur
echo.

set /p "GO=  Demarrer le serveur maintenant ? (O/n) : "
if /i "!GO!"=="n" goto :fin
echo.
echo   Demarrage... (Ctrl+C pour arreter)
echo.
call node server.js

:fin
echo.
pause
