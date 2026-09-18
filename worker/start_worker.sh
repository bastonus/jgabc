#!/usr/bin/env bash
# start_worker.sh — Lanceur 1-clic pour macOS et Linux
set -e

echo "======================================================================="
echo "         ✦ OREMUS — CALCUL DISTRIBUÉ D'ALIGNEMENT GRÉGORIEN ✦"
echo "======================================================================="
echo ""
echo "Ce script configure automatiquement votre environnement et lance le"
echo "calcul de synchronisation des partitions grégoriennes."
echo ""

# 1. Saisie obligatoire du prénom ou pseudo AVANT TOUT CALCUL
WORKER_NAME=""
while [ -z "$WORKER_NAME" ] || [ -z "$(echo "$WORKER_NAME" | tr -d ' ')" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "ami" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "anonyme" ]; do
    echo "======================================================================="
    echo "  ✦ SAISIE OBLIGATOIRE DU PRÉNOM OU PSEUDO POUR COMPTER VOS POINTS ✦"
    echo "======================================================================="
    echo "Pour comptabiliser vos points d'XP (+25 XP par chant) et retrouver vos"
    echo "partitions dans le classement, votre prénom ou pseudo est requis."
    echo ""
    read -r -p "✦ Entrez votre prénom ou pseudo (obligatoire) : " USER_NAME
    WORKER_NAME="$(echo "$USER_NAME" | xargs)"
    if [ -z "$WORKER_NAME" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "ami" ] || [ "$(echo "$WORKER_NAME" | tr '[:upper:]' '[:lower:]')" = "anonyme" ]; then
        echo "✦ [ERREUR] Le nom est obligatoire pour comptabiliser vos points !"
        echo ""
        WORKER_NAME=""
    fi
done

# 2. Bootstrap automatique de Python 3 et ffmpeg (installation si absents)
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    PYTHON_BIN=""
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "[*] Python 3 non détecté. Installation automatique..."
    OS="$(uname -s)"
    if [ "$OS" = "Darwin" ]; then
        if command -v brew >/dev/null 2>&1; then
            brew install python3 ffmpeg
        else
            echo "✦ [ERREUR] : installez Python via https://www.python.org/downloads/ ou 'brew install python3'"
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
    if command -v python3 >/dev/null 2>&1; then PYTHON_BIN="python3"
    elif command -v python >/dev/null 2>&1; then PYTHON_BIN="python"
    else echo "✦ [ERREUR] : Python 3 reste introuvable après installation."; exit 1; fi
fi

if ! $PYTHON_BIN -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
    echo "✦ [ERREUR] : Python 3.10+ requis (détecté : $($PYTHON_BIN --version 2>&1))."
    exit 1
fi
echo "[*] Python détecté : $($PYTHON_BIN --version 2>&1)"

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[*] ffmpeg non détecté (requis par yt-dlp), tentative d'installation..."
    if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then brew install ffmpeg || true
    elif [ -f /etc/debian_version ]; then sudo apt-get install -y ffmpeg || true
    fi
    command -v ffmpeg >/dev/null 2>&1 || echo "[WARN] ffmpeg introuvable : le téléchargement audio risque d'échouer."
fi

# 3. Création de l'environnement virtuel
if [ ! -d ".venv" ]; then
    echo "[*] Création de l'environnement virtuel isolé (.venv)..."
    $PYTHON_BIN -m venv .venv
fi

# Activation de l'environnement
source .venv/bin/activate

echo "[*] Mise à jour de pip..."
pip install --upgrade pip --quiet --disable-pip-version-check

# 4. Installation des dépendances avec détection NVIDIA CUDA
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

# 5. Choix de la durée de session
echo ""
echo "Combien de temps souhaitez-vous consacrer au calcul ?"
echo "(Exemples : 15, 30, 60, 120 minutes, ou 0 pour laisser tourner en continu)"
read -p "Durée en minutes [défaut: 0 (continu)] : " DURATION_INPUT
WORKER_DURATION="${DURATION_INPUT:-0}"

echo ""
echo "======================================================================="
echo "Démarrage du worker avec le pseudo : $WORKER_NAME"
if [ "$WORKER_DURATION" = "0" ]; then
    echo "Durée de session : En continu (Arrêt possible avec Ctrl + C)"
else
    echo "Durée de session programmée : $WORKER_DURATION minutes"
fi
echo "======================================================================="
echo ""

python worker.py --name "$WORKER_NAME" --duration "$WORKER_DURATION"
