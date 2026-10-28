#!/usr/bin/env bash
# ============================================================
#  HADAR BetAnalytics — installation automatique sur Oracle Cloud
#  Ubuntu 22.04 / 24.04 — ARM (Ampere) ou AMD (micro)
# ------------------------------------------------------------
#  Utilisation (une seule commande, depuis ton PC) :
#    ssh -i cle_ssh.txt ubuntu@IP_PUBLIQUE \
#      "curl -fsSL https://raw.githubusercontent.com/akinho1er-beep/HADARBET/main/scripts/install-oracle.sh | sudo bash"
#
#  Ce script est idempotent : tu peux le relancer sans rien casser.
#  Il installe Node.js 20, l'application, Nginx, et un service
#  qui redémarre tout seul (comme Railway, mais chez toi).
# ============================================================
set -euo pipefail

REPO="${REPO:-https://github.com/akinho1er-beep/HADARBET.git}"
APP_DIR="${APP_DIR:-/opt/hadar}"
ENV_FILE="/etc/hadar.env"
SERVICE="/etc/systemd/system/hadar.service"
APP_USER="hadar"

log()  { echo -e "\n\033[1;32m▶ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠ $*\033[0m"; }
err()  { echo -e "\033[1;31m✖ $*\033[0m"; }

[ "$(id -u)" -eq 0 ] || { err "Lance cette commande avec sudo."; exit 1; }

log "1/8 — Mise à jour du système et outils de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates nginx ufw openssl rsync >/dev/null

log "2/8 — Installation de Node.js 20"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "   Node $(node -v) — npm $(npm -v)"

log "3/8 — Création de l'utilisateur applicatif"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"

log "4/8 — Récupération du code depuis GitHub"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin main >/dev/null 2>&1 || true
  git -C "$APP_DIR" reset --hard origin/main >/dev/null 2>&1 || git -C "$APP_DIR" pull --rebase >/dev/null 2>&1 || true
  echo "   Code mis à jour"
else
  rm -rf "$APP_DIR"
  git clone --depth 1 "$REPO" "$APP_DIR" >/dev/null
  echo "   Code cloné dans $APP_DIR"
fi

log "5/8 — Réglages et mot de passe administrateur"
NOUVEAU_MDP=""
if [ ! -f "$ENV_FILE" ]; then
  NOUVEAU_MDP="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 20)"
  cat > "$ENV_FILE" <<ENVEOF
# ============================================================
# HADAR — réglages du serveur (fichier privé, jamais sur GitHub)
# Modifie ici, puis : systemctl restart hadar
# ============================================================
NODE_ENV=production
PORT=3000
DATA_DIR=$APP_DIR/data
ADMIN_USER=HADAR_ADMIN
ADMIN_PASS=$NOUVEAU_MDP
MAX_RESULTS=5000
PUPPETEER_ENABLED=false
ONEXBET_BASE_URL=https://1xbet.bj
ALLOWED_ORIGINS=

# Sauvegarde GitHub facultative (déjà couverte par le disque du serveur)
GITHUB_REPO=akinho1er-beep/HADARBET
GITHUB_TOKEN=
GITHUB_SAVE_MINUTES=360

# Analyse IA (facultatif) : colle ta clé Groq ci-dessous
GROQ_API_KEY=
ENVEOF
  chmod 640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
  echo "   Fichier de réglages créé : $ENV_FILE"
else
  echo "   Réglages existants conservés (pas de nouveau mot de passe)"
fi

log "6/8 — Installation des dépendances (sans Chromium, inutile ici)"
cd "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" npm install --omit=dev --omit=optional --no-audit --no-fund >/dev/null
echo "   Dépendances installées"

log "7/8 — Service automatique + Nginx devant l'application"
cat > "$SERVICE" <<'UNITEOF'
[Unit]
Description=HADAR BetAnalytics
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hadar
WorkingDirectory=/opt/hadar
EnvironmentFile=/etc/hadar.env
ExecStart=/usr/bin/node /opt/hadar/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
MemoryMax=700M

[Install]
WantedBy=multi-user.target
UNITEOF

cat > /etc/nginx/sites-available/hadar <<'NGINXEOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 10m;
    proxy_read_timeout 300s;
    proxy_connect_timeout 60s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINXEOF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/hadar /etc/nginx/sites-enabled/hadar
nginx -t >/dev/null 2>&1 && systemctl restart nginx
systemctl enable hadar >/dev/null 2>&1
systemctl restart hadar

log "8/8 — Ouverture des ports (pare-feu interne + ufw)"
# Oracle Ubuntu bloque le port 80 par défaut dans iptables : on insère les règles AVANT le REJECT
iptables -I INPUT 1 -p tcp --dport 80  -j ACCEPT 2>/dev/null || true
iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
if command -v netfilter-persistent >/dev/null 2>&1; then netfilter-persistent save >/dev/null 2>&1 || true; fi
iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
ufw allow 22/tcp  >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

log "Vérification"
sleep 6
ETAT="$(systemctl is-active hadar || true)"
echo "   Service hadar : $ETAT"
if curl -fsS --max-time 10 http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "   /health depuis le serveur : OK"
else
  warn "/health ne répond pas encore. Regarde : journalctl -u hadar -n 40 --no-pager"
fi
if curl -fsS --max-time 10 http://127.0.0.1/health >/dev/null 2>&1; then
  echo "   Nginx → application : OK"
else
  warn "Nginx ne joint pas l'application. Vérifie : systemctl status nginx"
fi

IP_PUB="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "IP_DE_TA_MACHINE")"
echo ""
echo "============================================================"
echo " TERMINÉ"
echo "============================================================"
echo " Adresse        : http://$IP_PUB"
echo " Utilisateur    : HADAR_ADMIN"
if [ -n "$NOUVEAU_MDP" ]; then
  echo " Mot de passe   : $NOUVEAU_MDP"
  echo ""
  echo " ⚠ NOTE CE MOT DE PASSE MAINTENANT."
  echo "   Pour le revoir plus tard :  sudo grep ADMIN_PASS $ENV_FILE"
else
  echo " Mot de passe   : (inchangé) sudo grep ADMIN_PASS $ENV_FILE"
fi
echo ""
echo " Commandes utiles :"
echo "   sudo systemctl status hadar      → est-ce que ça tourne ?"
echo "   sudo journalctl -u hadar -f      → voir en direct"
echo "   sudo systemctl restart hadar     → redémarrer"
echo "   curl -s localhost/status         → compteurs"
echo "============================================================"
