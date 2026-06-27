FROM ghcr.io/puppeteer/puppeteer:22

# Passer en root pour pouvoir copier et installer sans problème de permissions
USER root
WORKDIR /home/pptr/app

# Copier les dépendances
COPY package*.json ./

# Installer (en ignorant les scripts et les devDependencies)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --omit=dev --no-save --unsafe-perm

# Copier le reste du code
COPY . .

# Donner les droits à l'utilisateur pptruser
RUN chown -R pptruser:pptruser /home/pptr/app

# Revenir sur l'utilisateur normal de Puppeteer
USER pptruser

EXPOSE 3000
CMD ["node", "server.js"]