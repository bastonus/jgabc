# Dockerfile — Serveur Distant Oremus Relay pour Coolify
FROM node:20-alpine

# Métadonnées
LABEL maintainer="Oremus Liturgy & Chant"
LABEL description="Serveur distant autonome et relais de synchronisation pour Oremus"

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de l'application
COPY package.json index.mjs ./

# Créer le répertoire de données persistant avec permissions pour le compte node
RUN mkdir -p /app/data/pending && chown -R node:node /app

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

# Vérification de santé (healthcheck natif Docker & Coolify)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Démarrage
CMD ["node", "index.mjs"]
