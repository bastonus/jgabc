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

# Configuration stricte de l'encodage de la console en UTF-8 et activation des couleurs ANSI / VT100
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    chcp 65001 | Out-Null
    cmd /c ""
} catch {}

Write-Host "=======================================================================" -ForegroundColor DarkYellow
Write-Host "       ✦ OREMUS — WORKER DE CALCUL DISTRIBUÉ LITURGIQUE (CLI) ✦" -ForegroundColor Yellow
Write-Host "=======================================================================" -ForegroundColor DarkYellow
Write-Host "Serveur : $Server" -ForegroundColor Cyan
Write-Host "Dossier : $WorkDir" -ForegroundColor DarkGray
Write-Host ""

# 1. Vérification ou saisie obligatoire du prénom ou pseudo AVANT TOUT CALCUL
if (-not $Name -and $env:WORKER_NAME) {
    $Name = $env:WORKER_NAME.Trim()
}

while (-not $Name -or $Name.Trim() -eq "" -or $Name.Trim().ToLower() -eq "ami" -or $Name.Trim().ToLower() -eq "anonyme") {
    Write-Host "✦ SAISIE OBLIGATOIRE DU PRÉNOM OU PSEUDO POUR COMPTER VOS POINTS ✦" -ForegroundColor Yellow
    Write-Host "Pour comptabiliser vos points d'XP (+25 XP par chant) et retrouver vos" -ForegroundColor White
    Write-Host "partitions dans le classement, votre prénom ou pseudo est requis." -ForegroundColor White
    Write-Host ""
    $InputName = Read-Host "✦ Entrez votre prénom ou pseudo (obligatoire)"
    if ($InputName -and $InputName.Trim() -ne "" -and $InputName.Trim().ToLower() -ne "ami" -and $InputName.Trim().ToLower() -ne "anonyme") {
        $Name = $InputName.Trim()
    } else {
        Write-Host "✦ [ERREUR] Le nom est obligatoire pour comptabiliser vos points !" -ForegroundColor Red
        Write-Host ""
    }
}

# 2. Vérification de Python
$PythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py"
} else {
    Write-Host "✦ [ERREUR] : Python n'est pas détecté sur votre système Windows." -ForegroundColor Red
    Write-Host "Pour l'installer en 1 minute :" -ForegroundColor Yellow
    Write-Host "1. Rendez-vous sur https://www.python.org/downloads/" -ForegroundColor White
    Write-Host "2. Cochez impérativement la case [X] 'Add python.exe to PATH' lors de l'installation." -ForegroundColor Green
    exit 1
}

# 3. Création du dossier de travail
if (-not (Test-Path $WorkDir)) {
    New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
}
Set-Location $WorkDir

# 4. Téléchargement des composants worker.py et requirements.txt
Write-Host "[*] Récupération des composants du worker..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Server/worker.py" -OutFile "worker.py"
Invoke-RestMethod -Uri "$Server/requirements.txt" -OutFile "requirements.txt"

# 5. Environnement virtuel isolé
$VenvDir = Join-Path $WorkDir ".venv"
if (-not (Test-Path $VenvDir)) {
    Write-Host "[*] Initialisation de l'environnement virtuel (.venv)..." -ForegroundColor Cyan
    & $PythonCmd -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

# 6. Dépendances IA avec détection matérielle intelligente (NVIDIA CUDA / CPU)
Write-Host "[*] Détection du matériel d'accélération IA..." -ForegroundColor Cyan

$HasNvidia = $false
$GpuName = ""
try {
    if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
        $smiOut = & nvidia-smi --query-gpu=name --format=csv,noheader 2>$null
        if ($smiOut) {
            $HasNvidia = $true
            $GpuName = ($smiOut -split "`n")[0].Trim()
        }
    }
    if (-not $HasNvidia) {
        $videoCtrl = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*NVIDIA*" }
        if ($videoCtrl) {
            $HasNvidia = $true
            $GpuName = $videoCtrl[0].Name
        }
    }
} catch {}

$TorchHasCuda = $false
if (Test-Path $VenvPython) {
    try {
        $cudaCheck = & $VenvPython -c "import torch; print(torch.cuda.is_available())" 2>$null
        if ($cudaCheck -and $cudaCheck.Trim() -eq "True") {
            $TorchHasCuda = $true
        }
    } catch {}
}

if ($HasNvidia -and -not $TorchHasCuda) {
    Write-Host "=======================================================================" -ForegroundColor Green
    if ($GpuName) {
        Write-Host "✦ CARTE GRAPHIQUE NVIDIA DÉTECTÉE : $GpuName" -ForegroundColor Green
    } else {
        Write-Host "✦ CARTE GRAPHIQUE NVIDIA DÉTECTÉE !" -ForegroundColor Green
    }
    Write-Host "✦ Installation de PyTorch avec accélération CUDA (vitesse multipliée par 25)..." -ForegroundColor Yellow
    Write-Host "=======================================================================" -ForegroundColor Green
    & $VenvPip uninstall -y torch torchaudio | Out-Null
    & $VenvPip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124
}

Write-Host "[*] Vérification des modules IA (MMS_FA, yt-dlp)..." -ForegroundColor Cyan
& $VenvPip install -r requirements.txt --quiet --disable-pip-version-check

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
