#!/usr/bin/env bash
# run.sh — Lanceur CLI 1-ligne pour macOS & Linux
# Usage :
#   curl -fsSL https://api-oremus.silverhorse.fr/run.sh | bash
#   curl -fsSL https://api-oremus.silverhorse.fr/run.sh | bash -s -- --name "MonPseudo" --duration 30
set -e

SERVER_URL="${OREMUS_SERVER:-https://api-oremus.silverhorse.fr}"
WORK_DIR="${OREMUS_WORK_DIR:-$HOME/.oremus-worker}"

# Extraction des arguments optionnels
WORKER_NAME=""
WORKER_DURATION=0
WORKER_MAX_JOBS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      WORKER_NAME="$2"
      shift 2
      ;;
    --duration)
      WORKER_DURATION="$2"
      shift 2
      ;;
    --server)
      SERVER_URL="$2"
      shift 2
      ;;
    --max-jobs)
      WORKER_MAX_JOBS="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "======================================================================="
echo "       ✦ OREMUS — WORKER DE CALCUL DISTRIBUÉ LITURGIQUE (CLI) ✦"
echo "======================================================================="
echo "Serveur  : $SERVER_URL"
echo "Dossier  : $WORK_DIR"
echo ""

# 1. Vérification de Python 3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "✦ [ERREUR] : Python 3 n'est pas installé sur votre ordinateur."
    echo "• macOS : installez Python via 'brew install python3' ou https://www.python.org/downloads/"
    echo "• Linux : 'sudo apt update && sudo apt install -y python3 python3-venv python3-pip'"
    exit 1
fi

mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# 2. Téléchargement ou mise à jour des scripts du worker
echo "[*] Récupération des composants du worker..."
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$SERVER_URL/worker.py" -o worker.py
    curl -fsSL "$SERVER_URL/requirements.txt" -o requirements.txt
elif command -v wget >/dev/null 2>&1; then
    wget -qO worker.py "$SERVER_URL/worker.py"
    wget -qO requirements.txt "$SERVER_URL/requirements.txt"
fi

# 3. Création / activation de l'environnement virtuel isolé
if [ ! -d ".venv" ]; then
    echo "[*] Initialisation de l'environnement virtuel (.venv)..."
    $PYTHON_BIN -m venv .venv
fi
source .venv/bin/activate

# 4. Installation des dépendances si nécessaire
echo "[*] Vérification des modules IA (PyTorch, MMS_FA, yt-dlp)..."
pip install -r requirements.txt --quiet --disable-pip-version-check

# 5. Pseudo interactif si non fourni
if [ -z "$WORKER_NAME" ]; then
    DEFAULT_NAME=$(hostname -s 2>/dev/null || echo "Ami-Mac")
    if [ -t 0 ]; then
        read -p "Entrez votre prénom ou pseudo pour le classement [$DEFAULT_NAME] : " USER_INPUT
        WORKER_NAME="${USER_INPUT:-$DEFAULT_NAME}"
    else
        WORKER_NAME="$DEFAULT_NAME"
    fi
fi

# 6. Exécution du worker
CMD_ARGS=("worker.py" "--server" "$SERVER_URL" "--name" "$WORKER_NAME")
if [ "$WORKER_DURATION" != "0" ]; then
    CMD_ARGS+=("--duration" "$WORKER_DURATION")
fi
if [ "$WORKER_MAX_JOBS" != "0" ]; then
    CMD_ARGS+=("--max-jobs" "$WORKER_MAX_JOBS")
fi

echo "[*] Lancement du calcul pour : $WORKER_NAME..."
python "${CMD_ARGS[@]}"
