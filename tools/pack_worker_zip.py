#!/usr/bin/env python3
"""
pack_worker_zip.py — Crée l'archive oremus-worker.zip distribuée par le serveur Coolify.
"""

import os
import shutil
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WORKER_DIR = BASE_DIR / "worker"
PUBLIC_DIR = BASE_DIR / "server" / "public"
ZIP_PATH = PUBLIC_DIR / "oremus-worker.zip"

FILES_TO_PACK = [
    "worker.py",
    "run.sh",
    "run.ps1",
    "start_worker.bat",
    "start_worker.sh",
    "requirements.txt",
    "Dockerfile",
    "docker-entrypoint.sh",
    "README.md"
]

STANDALONE_PUBLIC_FILES = [
    "worker.py",
    "run.sh",
    "run.ps1",
    "requirements.txt"
]

def main():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Copie des fichiers CLI autonomes pour téléchargement direct (curl/irm)
    print(f"[*] Synchronisation des scripts CLI vers {PUBLIC_DIR}...")
    for fname in STANDALONE_PUBLIC_FILES:
        src = WORKER_DIR / fname
        dst = PUBLIC_DIR / fname
        if src.exists():
            shutil.copy2(src, dst)
            print(f"  -> {fname} copié dans public/")
        else:
            print(f"  [WARN] Fichier source introuvable : {src}")

    # 2. Création de l'archive ZIP
    print(f"[*] Création de l'archive ZIP : {ZIP_PATH}...")
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for fname in FILES_TO_PACK:
            fpath = WORKER_DIR / fname
            if fpath.exists():
                zf.write(fpath, arcname=f"oremus-worker/{fname}")
                print(f"  + Ajouté au ZIP : {fname}")
            else:
                print(f"  [WARN] Fichier manquant : {fpath}")
                
    size_kb = ZIP_PATH.stat().st_size / 1024
    print(f"[OK] Archive générée avec succès ({size_kb:.1f} Ko).")

if __name__ == "__main__":
    main()
