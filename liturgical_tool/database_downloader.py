"""Téléchargeur et synchroniseur des bases de données liturgiques et scripturaires."""

import os
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any
import requests

from liturgical_tool.config import DOWNLOADS_DIR, BASE_DIR, LOCAL_DO_SOURCE_DIR


class DatabaseDownloader:
    """Gestionnaire de téléchargement et de synchronisation des bases liturgiques et bibliques."""

    REPOSITORIES = {
        "divinum_officium": {
            "name": "Divinum Officium (Dépôt Officiel Git)",
            "url": "https://github.com/DivinumOfficium/divinum-officium.git",
            "type": "git",
            "target_dir": BASE_DIR / "do_source",
            "description": "Base complète des textes latins et traductions de l'Office et de la Messe."
        },
        "gregobase": {
            "name": "GregoBase (Partitions et Textes GABC Grégoriens)",
            "url": "https://github.com/gregorio-project/gregobase.git",
            "type": "git",
            "target_dir": DOWNLOADS_DIR / "gregobase",
            "description": "Base de données ouverte de milliers de chants grégoriens encodés en GABC."
        },
        "vulgate_local": {
            "name": "Vulgate Clémentine (73 livres bibliques latins)",
            "url": "",
            "type": "local_directory",
            "target_dir": BASE_DIR / "vulgate",
            "description": "Bible latine de l'Église catholique chapitre et verset par verset."
        },
        "douay_rheims_local": {
            "name": "Douay-Rheims Bible (73 livres bibliques anglais)",
            "url": "",
            "type": "local_directory",
            "target_dir": BASE_DIR / "douay-rheims",
            "description": "Traduction catholique anglaise traditionnelle de la Vulgate."
        },
        "gabc_chants_local": {
            "name": "Chants Grégoriens GABC (Base locale)",
            "url": "",
            "type": "local_directory",
            "target_dir": BASE_DIR / "gabc",
            "description": "Collection de partitions et incipits grégoriens du projet."
        },
        "aelf_translation_local": {
            "name": "Traduction Liturgique Française AELF",
            "url": "",
            "type": "local_directory",
            "target_dir": BASE_DIR / "French AELF translation",
            "description": "Lectures et textes bibliques de la liturgie en français."
        }
    }

    def __init__(self, downloads_dir: Path = DOWNLOADS_DIR):
        self.downloads_dir = downloads_dir
        self.downloads_dir.mkdir(parents=True, exist_ok=True)

    def sync_git_repo(self, repo_key: str, progress_callback: Any = None) -> Dict[str, Any]:
        """Clone ou met à jour (git pull) un dépôt Git."""
        info = self.REPOSITORIES.get(repo_key)
        if not info or info["type"] != "git":
            return {"status": "error", "message": f"Dépôt Git non reconnu: {repo_key}"}

        target_dir = Path(info["target_dir"])
        url = info["url"]

        try:
            if (target_dir / ".git").exists():
                if progress_callback:
                    progress_callback(f"Mise à jour (git pull) de {info['name']}...")
                res = subprocess.run(
                    ["git", "-C", str(target_dir), "pull", "--ff-only"],
                    capture_output=True, text=True, check=True
                )
                return {"status": "updated", "name": info["name"], "output": res.stdout.strip(), "path": str(target_dir)}
            else:
                if progress_callback:
                    progress_callback(f"Clonage de {info['name']} depuis {url}...")
                target_dir.parent.mkdir(parents=True, exist_ok=True)
                res = subprocess.run(
                    ["git", "clone", "--depth", "1", url, str(target_dir)],
                    capture_output=True, text=True, check=True
                )
                return {"status": "cloned", "name": info["name"], "output": res.stdout.strip(), "path": str(target_dir)}
        except subprocess.CalledProcessError as e:
            return {"status": "error", "name": info["name"], "message": f"Erreur Git: {e.stderr}"}
        except Exception as e:
            return {"status": "error", "name": info["name"], "message": str(e)}

    def download_all(self, progress_callback: Any = None) -> List[Dict[str, Any]]:
        """Synchronise toutes les bases de données externes."""
        results = []
        for key, info in self.REPOSITORIES.items():
            if info["type"] == "git":
                res = self.sync_git_repo(key, progress_callback)
                results.append(res)
            elif info["type"] == "local_directory":
                t_dir = Path(info["target_dir"])
                exists = t_dir.exists() and any(t_dir.iterdir())
                results.append({
                    "status": "ready" if exists else "missing",
                    "name": info["name"],
                    "path": str(t_dir)
                })
        return results

    def list_available_databases(self) -> List[Dict[str, Any]]:
        """Liste l'état actuel de toutes les bases de données (locales et distantes)."""
        status_list = []
        for key, info in self.REPOSITORIES.items():
            target_dir = Path(info["target_dir"])
            is_present = False
            size_bytes = 0
            file_count = 0

            if target_dir.exists():
                if info["type"] == "git":
                    is_present = (target_dir / ".git").exists()
                else:
                    is_present = True

                try:
                    all_files = [f for f in target_dir.glob("**/*") if f.is_file()]
                    file_count = len(all_files)
                    size_bytes = sum(f.stat().st_size for f in all_files)
                except Exception:
                    size_bytes = 0

            status_list.append({
                "key": key,
                "name": info["name"],
                "type": info["type"],
                "present": is_present,
                "file_count": file_count,
                "size_mb": round(size_bytes / (1024 * 1024), 2),
                "path": str(target_dir),
                "description": info["description"]
            })
        return status_list
