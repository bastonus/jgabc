<#
.SYNOPSIS
    Oremus Distributed Worker CLI Launcher (Windows PowerShell)
.DESCRIPTION
    Télécharge, configure l'environnement virtuel isolé et lance le worker de calcul distribué Oremus.
    Usage :
      irm https://api-oremus.silverhorse.fr/run.ps1 | iex
      & ([scriptblock]::Create((irm https://api-oremus.silverhorse.fr/run.ps1))) -Name "MonPseudo" -Duration 30
#>
param (
    [string]$Server = "https://api-oremus.silverhorse.fr",
    [string]$Name = "",
    [double]$Duration = 0,
    [int]$MaxJobs = 0,
    [string]$WorkDir = "$HOME\.oremus-worker"
)

$ErrorActionPreference = "Stop"

Write-Host "=======================================================================" -ForegroundColor DarkYellow
Write-Host "       ✦ OREMUS — WORKER DE CALCUL DISTRIBUÉ LITURGIQUE (CLI) ✦" -ForegroundColor Yellow
Write-Host "=======================================================================" -ForegroundColor DarkYellow
Write-Host "Serveur : $Server" -ForegroundColor Cyan
Write-Host "Dossier : $WorkDir" -ForegroundColor DarkGray
Write-Host ""

# 1. Vérification de Python
$PythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py"
} else {
    Write-Host "❌ Erreur : Python n'est pas détecté sur votre système Windows." -ForegroundColor Red
    Write-Host "Pour l'installer en 1 minute :" -ForegroundColor Yellow
    Write-Host "1. Rendez-vous sur https://www.python.org/downloads/" -ForegroundColor White
    Write-Host "2. Cochez impérativement la case [X] 'Add python.exe to PATH' lors de l'installation." -ForegroundColor Green
    exit 1
}

# 2. Création du dossier de travail
if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
}
Set-Location $WorkDir

# 3. Téléchargement des composants worker.py et requirements.txt
Write-Host "[*] Récupération des composants du worker..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Server/worker.py" -OutFile "worker.py"
Invoke-RestMethod -Uri "$Server/requirements.txt" -OutFile "requirements.txt"

# 4. Environnement virtuel isolé
$VenvDir = Join-Path $WorkDir ".venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "[*] Initialisation de l'environnement virtuel (.venv)..." -ForegroundColor Cyan
    & $PythonCmd -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

# 5. Dépendances IA
Write-Host "[*] Vérification des modules IA (PyTorch, MMS_FA, yt-dlp)..." -ForegroundColor Cyan
& $VenvPip install -r requirements.txt --quiet --disable-pip-version-check

# 6. Pseudo interactif si non fourni
if (-not $Name) {
    $DefaultName = $env:COMPUTERNAME
    $InputName = Read-Host "Entrez votre prénom ou pseudo pour le classement [$DefaultName]"
    if ($InputName) { $Name = $InputName } else { $Name = $DefaultName }
}

# 7. Lancement du worker
Write-Host "[*] Lancement du calcul pour : $Name" -ForegroundColor Green
$ArgsList = @("worker.py", "--server", $Server, "--name", $Name)
if ($Duration -gt 0) {
    $ArgsList += @("--duration", "$Duration")
}
if ($MaxJobs -gt 0) {
    $ArgsList += @("--max-jobs", "$MaxJobs")
}

& $VenvPython @ArgsList
