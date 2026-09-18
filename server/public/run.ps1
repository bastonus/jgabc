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

# 2. Bootstrap automatique : Python 3.10+ et ffmpeg (installation si absents)
function Get-PythonInfo {
    $candidates = @(
        @{ Cmd = "py"; Args = @("-3.12") },
        @{ Cmd = "py"; Args = @("-3") },
        @{ Cmd = "python"; Args = @() },
        @{ Cmd = "python3"; Args = @() }
    )
    foreach ($cand in $candidates) {
        if (Get-Command $cand.Cmd -ErrorAction SilentlyContinue) {
            try {
                $allArgs = @() + $cand.Args + @("-c", "import sys; print(str(sys.version_info[0]) + '.' + str(sys.version_info[1]))")
                $verOut = & $cand.Cmd @allArgs 2>$null
                if ($verOut -and $verOut.Trim() -match "^(\d+)\.(\d+)$") {
                    $major = [int]$Matches[1]; $minor = [int]$Matches[2]
                    if ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10)) {
                        return @{ Cmd = $cand.Cmd; Args = $cand.Args; Version = $verOut.Trim() }
                    }
                }
            } catch {}
        }
    }
    return $null
}

function Refresh-Path {
    $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Install-Python312 {
    Write-Host "[*] Python 3.10+ non détecté. Installation automatique de Python 3.12..." -ForegroundColor Yellow
    # Méthode 1 : winget (Windows 10 1809+ / Windows 11)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            Write-Host "[*] Installation via winget (Python.Python.3.12, silencieux)..." -ForegroundColor Cyan
            & winget install --id Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements --override "/passive InstallAllUsers=1 PrependPath=1 Include_test=0" 2>&1 | Out-Null
            Refresh-Path
            if (Get-PythonInfo) { return $true }
            Write-Host "[WARN] winget n'a pas suffi, tentative via python.org..." -ForegroundColor DarkYellow
        } catch {}
    }
    # Méthode 2 : installateur officiel python.org en silencieux
    try {
        $installer = Join-Path $env:TEMP "python-3.12-setup.exe"
        Write-Host "[*] Téléchargement de Python 3.12 depuis python.org..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe" -OutFile $installer -UseBasicParsing
        Write-Host "[*] Installation silencieuse (tous utilisateurs + PATH)..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath $installer -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1", "Include_test=0" -Wait -PassThru
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
        Refresh-Path
        return ($proc.ExitCode -eq 0)
    } catch {
        Write-Host "✦ [ERREUR] Installation automatique impossible : $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

$PythonInfo = Get-PythonInfo
if (-not $PythonInfo) {
    if (Install-Python312) { $PythonInfo = Get-PythonInfo }
}
if (-not $PythonInfo) {
    Write-Host "✦ [ERREUR] : Python 3.10+ reste introuvable après installation automatique." -ForegroundColor Red
    Write-Host "Installez-le manuellement depuis https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "(cochez impérativement la case 'Add python.exe to PATH'), puis relancez." -ForegroundColor Yellow
    exit 1
}
$PythonCmd = $PythonInfo.Cmd
$PythonBaseArgs = @() + $PythonInfo.Args
Write-Host "[*] Python détecté : $PythonCmd $($PythonBaseArgs -join ' ') (version $($PythonInfo.Version))" -ForegroundColor Green

# ffmpeg requis par yt-dlp pour extraire l'audio YouTube
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "[*] ffmpeg non détecté, installation automatique..." -ForegroundColor Yellow
    $ffmpegOk = $false
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        try {
            & winget install --id Gyan.FFmpeg --silent --accept-source-agreements --accept-package-agreements 2>&1 | Out-Null
            Refresh-Path
            if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { $ffmpegOk = $true }
        } catch {}
    }
    if (-not $ffmpegOk) {
        Write-Host "[WARN] ffmpeg introuvable : installez-le depuis https://www.gyan.dev/ffmpeg/builds/ (sinon le téléchargement audio échouera)." -ForegroundColor DarkYellow
    }
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
    & $PythonCmd @PythonBaseArgs -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

Write-Host "[*] Mise à jour de pip..." -ForegroundColor Cyan
& $VenvPython -m pip install --upgrade pip --quiet --disable-pip-version-check

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
    & $VenvPip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124/
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
