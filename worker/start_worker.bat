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

:: 3. Installation / Mise a jour des bibliotheques d'IA
echo [*] Verification des modules d'intelligence artificielle (PyTorch, MMS_FA, yt-dlp)...
pip install -r requirements.txt --quiet --disable-pip-version-check

:: 4. Choix du pseudo pour le tableau des contributeurs
set WORKER_NICK=%COMPUTERNAME%
echo.
set /p USER_INPUT="Entrez votre prenom ou pseudo pour le classement [defaut: %COMPUTERNAME%]: "
if not "%USER_INPUT%"=="" set WORKER_NICK=%USER_INPUT%

echo.
echo =======================================================================
echo Lancement du calcul avec le pseudo : %WORKER_NICK%
echo (Vous pouvez arreter a tout moment en appuyant sur Ctrl + C)
echo =======================================================================
echo.

python worker.py --name "%WORKER_NICK%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [INFO] Le worker s'est arrete.
)

pause
