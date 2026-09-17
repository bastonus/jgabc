#!/usr/bin/env python3
"""
pack_worker_zip.py — Crée l'archive oremus-worker.zip distribuée par le serveur Coolify.
"""

import os
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WORKER_DIR = BASE_DIR / "worker"
PUBLIC_DIR = BASE_DIR / "server" / "public"
ZIP_PATH = PUBLIC_DIR / "oremus-worker.zip"

FILES_TO_PACK = [
    "worker.py",
    "start_worker.bat",
    "start_worker.sh",
    "requirements.txt",
    "README.md"
]

def main():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[*] Création de l'archive ZIP : {ZIP_PATH}...")
    
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for fname in FILES_TO_PACK:
            fpath = WORKER_DIR / fname
            if fpath.exists():
                zf.write(fpath, arcname=f"oremus-worker/{fname}")
                print(f"  + Ajouté : {fname}")
            else:
                print(f"  [WARN] Fichier manquant : {fpath}")
                
    size_kb = ZIP_PATH.stat().st_size / 1024
    print(f"[OK] Archive générée avec succès ({size_kb:.1f} Ko).")

if __name__ == "__main__":
    main()
