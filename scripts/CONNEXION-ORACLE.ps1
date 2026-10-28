# ============================================================
#  HADAR — connexion et installation sur le serveur Oracle
# ------------------------------------------------------------
#  Usage :
#    .\CONNEXION-ORACLE.ps1 -Ip "130.61.12.34" -Cle "C:\Users\HP\Downloads\ssh-key-2026-10-28.key"
#
#  Ce script :
#    1. corrige les droits de la cle (Windows bloque sinon la connexion)
#    2. verifie que le serveur repond sur le port 22
#    3. lance l'installation complete si tu le demandes
#    4. verifie /health a la fin
# ============================================================
param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [Parameter(Mandatory = $true)][string]$Cle,
    [string]$Utilisateur = "ubuntu",
    [switch]$Installer,
    [switch]$Forcer
)

function Ecrire($texte, $couleur = "White") { Write-Host $texte -ForegroundColor $couleur }

Ecrire ""
Ecrire "HADAR — preparation de la connexion au serveur $Ip" Cyan
Ecrire "=================================================="

# ── 1. La cle existe ? ───────────────────────────────────────
if (-not (Test-Path $Cle)) {
    Ecrire "ERREUR : la cle est introuvable : $Cle" Red
    Ecrire "Verifie le nom exact du fichier telecharge depuis Oracle (souvent ssh-key-2026-....key)" Yellow
    exit 1
}
$Cle = (Resolve-Path $Cle).Path

# Oracle peut livrer la cle sans extension : on cree une copie .txt pour l'editeur
if ([System.IO.Path]::GetExtension($Cle) -eq "") {
    $copie = "$Cle.txt"
    if (-not (Test-Path $copie)) { Copy-Item $Cle $copie }
    Ecrire "[1/4] Cle sans extension : une copie '$copie' a ete creee pour l'editeur Oracle" Yellow
}

# ── 2. Droits de la cle (Windows refuse une cle trop ouverte) ─
Ecrire "[2/4] Correction des droits de la cle..." Cyan
$compte = "$env:USERDOMAIN\$env:USERNAME"
& icacls $Cle /inheritance:r /grant:r "${compte}:R" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Ecrire "   Impossible d'ajuster les droits automatiquement." Yellow
    Ecrire "   Si SSH refuse la cle, fais un clic droit sur le fichier → Proprietes → Securite," Yellow
    Ecrire "   puis retire tous les utilisateurs sauf toi." Yellow
} else {
    Ecrire "   OK" Green
}

# ── 3. Le serveur repond-il ? ───────────────────────────────
Ecrire "[3/4] Test du serveur (port 22)..." Cyan
$joignable = Test-NetConnection -ComputerName $Ip -Port 22 -WarningAction SilentlyContinue
if (-not $joignable.TcpTestSucceeded) {
    Ecrire "   Le serveur ne repond pas encore." Red
    Ecrire "   - Verifie que l'instance est bien en etat 'Running' dans la console Oracle" Yellow
    Ecrire "   - Verifie que l'IP publique est exacte (elle est dans 'Instance details')" Yellow
    Ecrire "   - Attends 2 minutes apres la creation" Yellow
    exit 1
}
Ecrire "   Port 22 ouvert : le serveur est joignable" Green

# ── 4. Installation ─────────────────────────────────────────
if ($Installer -or $Forcer) {
    Ecrire "[4/4] Installation complete sur le serveur (compte 3 a 6 minutes)..." Cyan
    Ecrire "      Tu vas voir defiler les etapes 1/8 a 8/8." DarkGray

    # On prefere le script local (aucune dependance a GitHub) ; sinon on le telecharge sur le serveur.
    $scriptLocal = $null
    foreach ($candidat in @(
            (Join-Path $PSScriptRoot "install-oracle.sh"),
            (Join-Path $PSScriptRoot "..\scripts\install-oracle.sh"),
            (Join-Path (Get-Location) "scripts\install-oracle.sh"),
            (Join-Path (Get-Location) "install-oracle.sh"))) {
        if (Test-Path $candidat) { $scriptLocal = (Resolve-Path $candidat).Path; break }
    }

    if ($scriptLocal) {
        Ecrire "      Script local trouve : $scriptLocal" DarkGray
        & scp -i $Cle -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 $scriptLocal "${Utilisateur}@${Ip}:/tmp/install-oracle.sh"
        if ($LASTEXITCODE -ne 0) {
            Ecrire "   Impossible de copier le script sur le serveur." Red
            exit 1
        }
        $commande = 'sudo bash /tmp/install-oracle.sh'
    } else {
        Ecrire "      Script local absent : telechargement depuis GitHub" DarkGray
        $commande = 'curl -fsSL https://raw.githubusercontent.com/akinho1er-beep/HADARBET/main/scripts/install-oracle.sh | sudo bash'
    }

    & ssh -i $Cle -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$Utilisateur@$Ip" $commande
    if ($LASTEXITCODE -ne 0) {
        Ecrire ""
        Ecrire "L'installation a signale une erreur." Red
        Ecrire "Relance avec :" Yellow
        Ecrire "  .\CONNEXION-ORACLE.ps1 -Ip `"$Ip`" -Cle `"$Cle`" -Installer" Yellow
        exit 1
    }
} else {
    Ecrire "[4/4] Installation NON lancee." Yellow
    Ecrire "      Pour lancer :" Yellow
    Ecrire "      .\CONNEXION-ORACLE.ps1 -Ip `"$Ip`" -Cle `"$Cle`" -Installer" Yellow
}

# ── Verification finale ────────────────────────────────────
Ecrire ""
Ecrire "Verification de l'application..." Cyan
Start-Sleep -Seconds 5
try {
    $h = Invoke-RestMethod "http://$Ip/health" -TimeoutSec 25
    Ecrire "   /health : $($h.status)" Green
    if ($h.derniereCollecte) { Ecrire "   derniere collecte : $($h.derniereCollecte)" Green }
} catch {
    Ecrire "   /health ne repond pas encore." Yellow
    Ecrire "   C'est souvent normal juste apres l'installation ou si les ports ne sont pas ouverts." Yellow
    Ecrire "   Ouvre http://$Ip dans ton navigateur dans 2 minutes." Yellow
}

try {
    $s = Invoke-RestMethod "http://$Ip/status" -TimeoutSec 25
    $c = $s.counts
    Ecrire ""
    Ecrire "   Compteurs :" Cyan
    Ecrire ("   baccara {0} | penalty18 {1} | penalty22 {2}" -f $c.baccara, $c.penalty18, $c.penalty22)
    Ecrire ("   jeu21 {0} | fifa4x4 {1} | fifa3x3 {2}" -f $c.jeu21, $c.fifa4x4, $c.fifa3x3)
} catch {
    Ecrire "   /status pas encore disponible." Yellow
}

Ecrire ""
Ecrire "Termine. Adresse de l'application : http://$Ip" Green
Ecrire "Il reste UNE etape : ouvrir le port 80 dans la console Oracle (voir le guide)." Yellow
Ecrire ""
