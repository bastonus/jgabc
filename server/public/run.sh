#!/usr/bin/env bash
# run.sh — Lanceur CLI 1-ligne pour macOS & Linux
# Usage :
#   curl -fsSL https://api-oremus.silverhorse.fr/run.sh | bash
#   curl -fsSL https://api-oremus.silverhorse.fr/run.sh | WORKER_NAME="MonPseudo" bash -s -- --duration 30
set -e

SERVER_URL="${OREMUS_SERVER:-https://api-oremus.silverhorse.fr}"
WORK_DIR="${OREMUS_WORK_DIR:-$HOME/.oremus-worker}"

# Extraction des arguments optionnels (WORKER_NAME préservé depuis l'environnement)
WORKER_NAME="${WORKER_NAME:-}"
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

# 2. Bootstrap automatique de Python 3 et ffmpeg (installation si absents)
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

install_system_python() {
    echo "[*] Python 3 non détecté. Installation automatique..."
    OS="$(uname -s)"
    if [ "$OS" = "Darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
            brew install python3 ffmpeg
        else
            echo "✦ [ERREUR] Homebrew requis : https://brew.sh puis 'brew install python3 ffmpeg'"
            exit 1
        fi
    elif [ -f /etc/debian_version ]; then
        sudo apt-get update && sudo apt-get install -y python3 python3-venv python3-pip ffmpeg
    elif [ -f /etc/fedora-release ]; then
        sudo dnf install -y python3 python3-pip ffmpeg
    elif [ -f /etc/arch-release ]; then
        sudo pacman -Sy --noconfirm python python-pip ffmpeg
    else
        echo "✦ [ERREUR] : installez Python 3.12 depuis https://www.python.org/downloads/ puis relancez."
        exit 1
    fi
}

if [ -z "$PYTHON_BIN" ]; then
    install_system_python
    if command -v python3 >/dev/null 2>&1; then PYTHON_BIN="python3"
    elif command -v python >/dev/null 2>&1; then PYTHON_BIN="python"
    else echo "✦ [ERREUR] : Python 3 reste introuvable après installation."; exit 1; fi
fi

# Vérifie que la version convient (>= 3.10) et que le module venv existe
if ! $PYTHON_BIN -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
    echo "✦ [ERREUR] : Python 3.10+ requis (détecté : $($PYTHON_BIN --version 2>&1))."
    exit 1
fi
echo "[*] Python détecté : $($PYTHON_BIN --version 2>&1)"

if ! $PYTHON_BIN -m venv --help >/dev/null 2>&1; then
    echo "[*] Module venv manquant, installation..."
    if [ -f /etc/debian_version ]; then
        PYVER="$($PYTHON_BIN -c 'import sys; v = sys.version_info; print(str(v[0]) + chr(46) + str(v[1]))')"
        sudo apt-get install -y "python${PYVER}-venv" || sudo apt-get install -y python3-venv
    else
        echo "✦ [ERREUR] : module venv indisponible pour $PYTHON_BIN."
        exit 1
    fi
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[*] ffmpeg non détecté (requis par yt-dlp), tentative d'installation..."
    if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then brew install ffmpeg || true
    elif [ -f /etc/debian_version ]; then sudo apt-get install -y ffmpeg || true
    fi
    command -v ffmpeg >/dev/null 2>&1 || echo "[WARN] ffmpeg introuvable : le téléchargement audio risque d'échouer."
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

echo "[*] Mise à jour de pip..."
pip install --upgrade pip --quiet --disable-pip-version-check

# 4. Installation des dépendances avec détection intelligente NVIDIA CUDA
echo "[*] Détection du matériel d'accélération IA (NVIDIA CUDA / CPU)..."
if command -v nvidia-smi >/dev/null 2>&1; then
    if ! python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
        echo "======================================================================="
        echo "✦ CARTE GRAPHIQUE NVIDIA DÉTECTÉE !"
        echo "✦ Installation de PyTorch CUDA pour multiplier la vitesse par 25..."
        echo "======================================================================="
        pip uninstall -y torch torchaudio >/dev/null 2>&1 || true
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124/
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
