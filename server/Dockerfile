# Dockerfile — Serveur Distant Oremus Relay pour Coolify
FROM node:20-alpine

# Métadonnées
LABEL maintainer="Oremus Liturgy & Chant"
LABEL description="Serveur distant autonome et relais de synchronisation pour Oremus"

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de l'application
COPY package.json index.mjs catalog.json* ./
COPY public/ ./public/

# Créer les répertoires de données persistants avec permissions pour le compte node
RUN mkdir -p /app/data/pending /app/data/alignments /app/data/jobs /app/public && chown -R node:node /app

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data

# Déclarer le point de montage pour le volume persistant Coolify
VOLUME ["/app/data"]

# Utiliser l'utilisateur non-root sécurisé de l'image Alpine
USER node

# Exposer le port du serveur
EXPOSE 3000

# Vérification de santé (healthcheck natif Node.js & Coolify)
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Démarrage
CMD ["node", "index.mjs"]
