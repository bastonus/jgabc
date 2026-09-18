@echo off
chcp 65001 >nul
title Oremus - Worker de Calcul Distribué Liturgique
color 0A

echo =======================================================================
echo          ✦ OREMUS — CALCUL DISTRIBUÉ D'ALIGNEMENT GRÉGORIEN ✦
echo =======================================================================
echo.
echo Ce script va automatiquement configurer votre ordinateur et commencer
echo a calculer l'alignement note-par-note des chants liturgiques.
echo.

:ask_nick
echo =======================================================================
echo   ✦ SAISIE OBLIGATOIRE DU PRENOM OU PSEUDO POUR COMPTER VOS POINTS ✦
echo =======================================================================
echo Pour comptabiliser vos points d'XP (+25 XP par chant) et retrouver vos
echo partitions dans le classement, votre prenom ou pseudo est requis.
echo.
set /p USER_INPUT="✦ Entrez votre prenom ou pseudo (obligatoire) : "
if "%USER_INPUT%"=="" (
    echo [ERREUR] Le prenom ou pseudo est obligatoire pour compter vos points !
    echo.
    goto ask_nick
)
set WORKER_NICK=%USER_INPUT%

:: 1. Verification de Python
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    where py >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [ERREUR] Python n'est pas installe sur votre ordinateur.
        echo.
        echo Pour l'installer en 1 minute :
        echo 1. Rendez-vous sur https://www.python.org/downloads/
        echo 2. Lancez l'installateur en COCHANT BIEN la case :
        echo    [X] "Add python.exe to PATH"
        echo 3. Relancez ensuite ce fichier start_worker.bat.
        echo.
        pause
        exit /b 1
    )
    set PY_CMD=py
) else (
    set PY_CMD=python
)

:: 2. Creation / Activation de l'environnement virtuel isole
if not exist ".venv" (
    echo [*] Initialisation de l'environnement virtuel isole (.venv)...
    %PY_CMD% -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERREUR] Impossible de creer l'environnement virtuel.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

:: 3. Installation / Mise a jour des bibliotheques d'IA avec detection NVIDIA CUDA
echo [*] Detection du materiel d'acceleration IA (NVIDIA CUDA / CPU)...
where nvidia-smi >nul 2>nul
if %ERRORLEVEL% equ 0 (
    python -c "import torch; exit(0 if torch.cuda.is_available() else 1)" >nul 2>nul
    if errorlevel 1 (
        echo =======================================================================
        echo ✦ CARTE GRAPHIQUE NVIDIA DETECTEE !
        echo ✦ Installation de PyTorch CUDA pour multiplier la vitesse par 25...
        echo =======================================================================
        pip uninstall -y torch torchaudio >nul 2>nul
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
    )
)
echo [*] Verification des modules audio et reseau (yt-dlp, soundfile)...
pip install -r requirements.txt --quiet --disable-pip-version-check

:: 4. Choix de la duree de session
set WORKER_MINS=0
echo.
echo Combien de temps souhaitez-vous consacrer au calcul ?
echo (Exemples : 15, 30, 60, 120 minutes, ou 0 pour laisser tourner en continu)
set /p DURATION_INPUT="Duree en minutes [defaut: 0 (continu)]: "
if not "%DURATION_INPUT%"=="" set WORKER_MINS=%DURATION_INPUT%

echo.
echo =======================================================================
echo Lancement du calcul avec le pseudo : %WORKER_NICK%
if "%WORKER_MINS%"=="0" (
    echo Duree de session : En continu (arret avec Ctrl + C)
) else (
    echo Duree de session : %WORKER_MINS% minute(s)
)
echo =======================================================================
echo.

python worker.py --name "%WORKER_NICK%" --duration %WORKER_MINS%

if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Le worker s'est arrete.
)

pause
