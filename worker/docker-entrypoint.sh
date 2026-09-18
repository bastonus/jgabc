#!/bin/sh
# docker-entrypoint.sh — Point d'entrée du conteneur worker Oremus.
# Le pseudo est obligatoire (comptabilisation XP) : -e WORKER_NAME="VotrePseudo"
set -e

if [ -z "$WORKER_NAME" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "ami" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "anonyme" ]; then
    echo "✦ [ERREUR] Définissez un pseudo via -e WORKER_NAME=VotrePseudo (obligatoire pour compter vos points)."
    exit 1
fi

echo "✦ Contributeur : $WORKER_NAME"
echo "✦ Serveur      : ${OREMUS_SERVER:-https://api-oremus.silverhorse.fr}"

exec python3.12 worker.py --server "${OREMUS_SERVER:-https://api-oremus.silverhorse.fr}" --name "$WORKER_NAME" "$@"
