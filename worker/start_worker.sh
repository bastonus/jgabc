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

# 2. Vérification de Python 3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "✦ [ERREUR] : Python 3 n'est pas installé."
    echo "Sur macOS : installez Python via https://www.python.org/downloads/ ou 'brew install python3'"
    echo "Sur Linux : 'sudo apt install python3 python3-venv python3-pip'"
    exit 1
fi

# 3. Création de l'environnement virtuel
if [ ! -d ".venv" ]; then
    echo "[*] Création de l'environnement virtuel isolé (.venv)..."
    $PYTHON_BIN -m venv .venv
fi

# Activation de l'environnement
source .venv/bin/activate

# 4. Installation des dépendances avec détection NVIDIA CUDA
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
