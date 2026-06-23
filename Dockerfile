# ═══════════════════════════════════════════
# Dockerfile HADAR BetAnalytics — Railway
# Basé sur l'image officielle Puppeteer (inclut Chromium + dépendances)
# ═══════════════════════════════════════════
FROM ghcr.io/puppeteer/puppeteer:22

# Dossiers de travail
WORKDIR /home/pptr/app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances Node (sans Puppeteer car déjà dans l'image)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --only=production 2>/dev/null || npm install --only=production

# Copier tout le code de l'application
COPY . .

# Exposer le port
EXPOSE 3000

# Démarrer le serveur
CMD ["node", "server.js"]
