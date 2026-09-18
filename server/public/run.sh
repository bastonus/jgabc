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

# 1. Saisie obligatoire du prénom ou pseudo AVANT TOUT CALCUL
if [ -z "$WORKER_NAME" ] && [ -n "$OREMUS_NAME" ]; then
    WORKER_NAME="$OREMUS_NAME"
fi

while [ -z "$WORKER_NAME" ] || [ -z "$(echo "$WORKER_NAME" | tr -d ' ')" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "ami" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "anonyme" ]; do
    echo "======================================================================="
    echo "  ✦ SAISIE OBLIGATOIRE DU PRÉNOM OU PSEUDO POUR COMPTER VOS POINTS ✦"
    echo "======================================================================="
    echo "Pour comptabiliser vos points d'XP (+25 XP par chant) et retrouver vos"
    echo "partitions dans le classement, votre prénom ou pseudo est requis."
    echo ""
    if [ -t 0 ]; then
        read -r -p "✦ Entrez votre prénom ou pseudo (obligatoire) : " USER_INPUT
    elif [ -e /dev/tty ]; then
        read -r -p "✦ Entrez votre prénom ou pseudo (obligatoire) : " USER_INPUT </dev/tty
    else
        echo "✦ [ERREUR] Entrée interactive indisponible. Spécifiez votre nom via : curl ... | bash -s -- --name VotreNom"
        exit 1
    fi
    WORKER_NAME="$(echo "$USER_INPUT" | xargs)"
    if [ -z "$WORKER_NAME" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "ami" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "anonyme" ]; then
        echo "✦ [ERREUR] Le nom est obligatoire pour comptabiliser vos points !"
        echo ""
        WORKER_NAME=""
    fi
done

# 2. Vérification de Python 3
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

# 4. Installation des dépendances avec détection intelligente NVIDIA CUDA
echo "[*] Détection du matériel d'accélération IA (NVIDIA CUDA / CPU)..."
if command -v nvidia-smi >/dev/null 2>&1; then
    if ! python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
        echo "======================================================================="
        echo "✦ CARTE GRAPHIQUE NVIDIA DÉTECTÉE !"
        echo "✦ Installation de PyTorch CUDA pour multiplier la vitesse par 25..."
        echo "======================================================================="
        pip uninstall -y torch torchaudio >/dev/null 2>&1 || true
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
    fi
fi
echo "[*] Vérification des modules audio et réseau..."
pip install -r requirements.txt --quiet --disable-pip-version-check

# 5. Exécution du worker
CMD_ARGS=("worker.py" "--server" "$SERVER_URL" "--name" "$WORKER_NAME")
if [ "$WORKER_DURATION" != "0" ]; then
    CMD_ARGS+=("--duration" "$WORKER_DURATION")
fi
if [ "$WORKER_MAX_JOBS" != "0" ]; then
    CMD_ARGS+=("--max-jobs" "$WORKER_MAX_JOBS")
fi

echo "[*] Lancement du calcul pour : $WORKER_NAME..."
python "${CMD_ARGS[@]}"
