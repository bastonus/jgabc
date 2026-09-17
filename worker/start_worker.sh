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

# 1. Vérification de Python 3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "❌ Erreur : Python 3 n'est pas installé."
    echo "Sur macOS : installez Python via https://www.python.org/downloads/ ou 'brew install python3'"
    echo "Sur Linux : 'sudo apt install python3 python3-venv python3-pip'"
    exit 1
fi

# 2. Création de l'environnement virtuel
if [ ! -d ".venv" ]; then
    echo "[*] Création de l'environnement virtuel isolé (.venv)..."
    $PYTHON_BIN -m venv .venv
fi

# Activation de l'environnement
source .venv/bin/activate

# 3. Installation des dépendances
echo "[*] Installation / Vérification des dépendances (PyTorch, MMS_FA, yt-dlp)..."
pip install -r requirements.txt --quiet --disable-pip-version-check

# 4. Choix du pseudo
DEFAULT_NAME=$(hostname -s 2>/dev/null || echo "Ami-Mac")
read -p "Entrez votre prénom ou pseudo pour le classement [$DEFAULT_NAME] : " USER_NAME
WORKER_NAME="${USER_NAME:-$DEFAULT_NAME}"

echo ""
echo "======================================================================="
echo "Démarrage du worker avec le pseudo : $WORKER_NAME"
echo "(Arrêt possible à tout moment avec Ctrl + C)"
echo "======================================================================="
echo ""

python worker.py --name "$WORKER_NAME"
