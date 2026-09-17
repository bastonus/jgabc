#!/usr/bin/env python3
"""
fetch_reviews.py — Récupérateur d'avis d'alignement depuis l'API Coolify Oremus.

Permet de télécharger en un clic / une commande tous les avis en attente
enregistrés sur le serveur distant (ex: https://api-oremus.silverhorse.fr)
afin d'améliorer le modèle d'alignement (dataset de vérité terrain & erreurs signalées).

Usage :
    python tools/fetch_reviews.py
    python tools/fetch_reviews.py --url https://api-oremus.silverhorse.fr
    python tools/fetch_reviews.py --ingest   # Télécharge et fusionne directement
    python tools/fetch_reviews.py --export-csv reviews_export.csv
"""

import os
import sys
import json
import argparse
import datetime
import urllib.request
import urllib.error
from pathlib import Path

# Force UTF-8 stdout for Windows consoles
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent.parent
PIPELINE_DIR = BASE_DIR / "pipeline"
PENDING_DIR = PIPELINE_DIR / "reviews" / "pending"

DEFAULT_SERVER_URL = "https://api-oremus.silverhorse.fr"


def fetch_pending_reviews(server_url: str) -> list:
    """Interroge l'API Oremus pour récupérer les avis en attente."""
    endpoint = f"{server_url.rstrip('/')}/api/reviews/pending"
    print(f"[*] Connexion à l'API Oremus : {endpoint}...")
    
    req = urllib.request.Request(
        endpoint,
        headers={"User-Agent": "Oremus-Review-Fetcher/1.0", "Accept": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                print(f"[ERREUR] Le serveur a répondu avec le code HTTP {resp.status}")
                return []
            data = json.loads(resp.read().decode("utf-8"))
            reviews = data.get("reviews", [])
            print(f"[OK] {len(reviews)} avis récupérés depuis le serveur.")
            return reviews
    except urllib.error.URLError as e:
        print(f"[ERREUR] Impossible de joindre le serveur ({e}).")
        return []
    except Exception as e:
        print(f"[ERREUR] Erreur inattendue : {e}")
        return []


def save_reviews_locally(reviews: list) -> int:
    """Enregistre chaque avis dans pipeline/reviews/pending/ sous forme de fichier JSON individuel."""
    PENDING_DIR.mkdir(parents=True, exist_ok=True)
    saved_count = 0
    
    for rev in reviews:
        piece_id = str(rev.get("id") or rev.get("pieceId") or "unknown").strip()
        safe_id = "".join(c if c.isalnum() or c in "_-." else "_" for c in piece_id)
        ts = rev.get("reviewedAt") or rev.get("timestamp") or datetime.datetime.now(datetime.timezone.utc).isoformat()
        clean_ts = ts.replace(":", "-").replace(".", "_")
        
        filename = f"{safe_id}_api_{clean_ts}.json"
        filepath = PENDING_DIR / filename
        
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(rev, f, indent=2, ensure_ascii=False)
            saved_count += 1
        except Exception as e:
            print(f"[WARN] Impossible d'écrire {filename} : {e}")
            
    print(f"[OK] {saved_count} fichiers de revue enregistrés dans {PENDING_DIR}")
    return saved_count


def export_to_csv(reviews: list, csv_path: str):
    """Exporte les avis sous format tabulaire CSV pour analyse rapide."""
    import csv
    fieldnames = ["id", "status", "title", "incipit", "comment", "author", "reviewedAt", "triggerReason", "youtube_id"]
    try:
        with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for r in reviews:
                writer.writerow(r)
        print(f"[OK] Export CSV enregistré sous : {csv_path}")
    except Exception as e:
        print(f"[ERREUR] Échec de l'export CSV : {e}")


def main():
    parser = argparse.ArgumentParser(description="Récupérateur d'avis Oremus depuis l'API Coolify")
    parser.add_argument("--url", default=DEFAULT_SERVER_URL, help=f"URL du serveur (défaut: {DEFAULT_SERVER_URL})")
    parser.add_argument("--ingest", action="store_true", help="Fusionne automatiquement les avis dans lab_reviews.json via review_queue.py")
    parser.add_argument("--export-csv", type=str, default="", help="Chemin vers un fichier CSV d'export optionnel")
    args = parser.parse_args()

    reviews = fetch_pending_reviews(args.url)
    if not reviews:
        print("[INFO] Aucun avis en attente trouvé sur le serveur.")
        return 0

    # Résumé rapide
    breakdown = {}
    for r in reviews:
        st = r.get("status", "unknown")
        breakdown[st] = breakdown.get(st, 0) + 1

    print("\n--- Répartition des avis récupérés ---")
    for st, cnt in breakdown.items():
        icon = "✅" if st == "approved" else ("❌" if st in ("bad_gabc", "rejected") else "⚠️")
        print(f"  {icon} {st:12} : {cnt} avis")
    print("--------------------------------------\n")

    # Enregistrement local dans pipeline/reviews/pending/
    saved = save_reviews_locally(reviews)

    # Export CSV si demandé
    if args.export_csv:
        export_to_csv(reviews, args.export_csv)

    # Ingestion automatique si demandée
    if args.ingest and saved > 0:
        print("\n[*] Lancement de l'ingestion automatique via review_queue.py...")
        rq_script = BASE_DIR / "tools" / "review_queue.py"
        if rq_script.exists():
            import subprocess
            subprocess.run([sys.executable, str(rq_script), "approve", "--all"], check=False)
            subprocess.run([sys.executable, str(rq_script), "sync"], check=False)
        else:
            print("[WARN] tools/review_queue.py non trouvé pour l'ingestion.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
