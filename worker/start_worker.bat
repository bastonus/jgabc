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

:: 1. Bootstrap automatique de Python 3.12 (installation si absent)
set PY_LAUNCH=
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    py -3.12 --version >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PY_LAUNCH=py -3.12
    ) else (
        set PY_LAUNCH=py
    )
)
if "%PY_LAUNCH%"=="" (
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 set PY_LAUNCH=python
)

if "%PY_LAUNCH%"=="" (
    echo [*] Python non detecte. Installation automatique de Python 3.12...
    where winget >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        echo [*] Installation via winget (silencieux)...
        winget install --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements --override "/passive InstallAllUsers=1 PrependPath=1 Include_test=0"
    ) else (
        echo [*] winget indisponible, telechargement depuis python.org...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' -OutFile ($env:TEMP + '\python-3.12-setup.exe') -UseBasicParsing"
        "%TEMP%\python-3.12-setup.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0
        del "%TEMP%\python-3.12-setup.exe" >nul 2>nul
    )
    :: Recharge les emplacements standards sans redemarrer le terminal
    if exist "%ProgramFiles%\Python312\python.exe" set "PATH=%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts;%PATH%"
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;%PATH%"
    where py >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        py -3.12 --version >nul 2>nul
        if %ERRORLEVEL% equ 0 (
            set PY_LAUNCH=py -3.12
        ) else (
            set PY_LAUNCH=py
        )
    ) else (
        where python >nul 2>nul
        if %ERRORLEVEL% equ 0 set PY_LAUNCH=python
    )
)

if "%PY_LAUNCH%"=="" (
    color 0C
    echo [ERREUR] Python reste introuvable apres installation automatique.
    echo.
    echo Installez-le depuis https://www.python.org/downloads/
    echo en cochant la case [X] "Add python.exe to PATH",
    echo puis relancez ce fichier start_worker.bat.
    echo.
    pause
    exit /b 1
)
echo [*] Python detecte : %PY_LAUNCH%
%PY_LAUNCH% -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERREUR] Python 3.10+ requis pour le worker Oremus.
    pause
    exit /b 1
)

:: ffmpeg requis par yt-dlp pour extraire l'audio YouTube
where ffmpeg >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [*] ffmpeg non detecte, installation automatique...
    where winget >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        winget install --id Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements
        if exist "%ProgramFiles%\ffmpeg\bin\ffmpeg.exe" set "PATH=%ProgramFiles%\ffmpeg\bin;%PATH%"
    ) else (
        echo [WARN] ffmpeg introuvable : installez-le depuis https://www.gyan.dev/ffmpeg/builds/
    )
)

:: 2. Creation / Activation de l'environnement virtuel isole
if not exist ".venv" (
    echo [*] Initialisation de l'environnement virtuel isole (.venv)...
    %PY_LAUNCH% -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [ERREUR] Impossible de creer l'environnement virtuel.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip --quiet --disable-pip-version-check

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
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124/
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
