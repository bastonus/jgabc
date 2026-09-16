#!/usr/bin/env python3
"""
review_queue.py — Gestionnaire de file d'attente pour les revues d'alignement grégorien.

Fonctions principales :
- stage   : Extrait les revues d'un ticket GitHub (ou fichier) et les place dans pipeline/reviews/pending/
- list    : Affiche la liste des revues en attente
- show    : Affiche le détail d'une revue
- approve : Valide et fusionne les revues en attente dans pipeline/lab_reviews.json et compile
- reject  : Rejette une ou plusieurs revues en attente
- sync    : Recalcule les statistiques de couverture (pipeline/reviews/stats.json) et recompile
"""

import os
import sys
import re
import json
import glob
import shutil
import argparse
import datetime
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
PIPELINE_DIR = BASE_DIR / "pipeline"
REVIEWS_DIR = PIPELINE_DIR / "reviews"
PENDING_DIR = REVIEWS_DIR / "pending"
APPROVED_DIR = REVIEWS_DIR / "approved"
REJECTED_DIR = REVIEWS_DIR / "rejected"
HISTORY_FILE = REVIEWS_DIR / "history.jsonl"
STATS_FILE = REVIEWS_DIR / "stats.json"
LAB_REVIEWS_FILE = PIPELINE_DIR / "lab_reviews.json"
ALIGNMENTS_DIR = PIPELINE_DIR / "alignments"

# Ensure directories exist
for d in [REVIEWS_DIR, PENDING_DIR, APPROVED_DIR, REJECTED_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def sanitize_id(identifier: str) -> str:
    """Nettoie un identifiant pour l'utiliser sans danger dans un nom de fichier."""
    return re.sub(r'[^a-zA-Z0-9_\-\.]', '_', str(identifier).strip())


def append_history(entry: dict):
    """Ajoute une ligne immuable dans l'historique d'audit."""
    entry["logged_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        with open(HISTORY_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[WARN] Impossible d'ecrire dans history.jsonl: {e}")


def write_github_output(outputs: dict):
    """Ecrit les variables de sortie pour GitHub Actions si GITHUB_OUTPUT est defini."""
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if not gh_out:
        return
    try:
        with open(gh_out, "a", encoding="utf-8") as f:
            for k, v in outputs.items():
                f.write(f"{k}={v}\n")
    except Exception as e:
        print(f"[WARN] Impossible d'ecrire dans GITHUB_OUTPUT: {e}")


def compute_and_save_stats():
    """
    Calcule la repartition globale des revues pour le load-balancing des relecteurs humains.
    Chaque chant a :
    - published_reviews : nombre de revues publiees dans lab_reviews.json
    - pending_reviews   : nombre de revues actuellement en attente
    - total_reviews     : somme (published + pending)
    """
    # 1. Published reviews
    published = {}
    if LAB_REVIEWS_FILE.exists():
        try:
            with open(LAB_REVIEWS_FILE, "r", encoding="utf-8") as f:
                published = json.load(f)
        except Exception:
            published = {}

    # 2. Pending reviews
    pending_by_piece = {}
    pending_files = list(PENDING_DIR.glob("*.json"))
    for pf in pending_files:
        try:
            with open(pf, "r", encoding="utf-8") as f:
                pdata = json.load(f)
                pid = str(pdata.get("piece_id", "")).strip()
                if pid:
                    pending_by_piece[pid] = pending_by_piece.get(pid, 0) + 1
        except Exception:
            continue

    # 3. Known candidates from modular alignments
    candidate_pieces = set()
    for af in ALIGNMENTS_DIR.glob("*.json"):
        try:
            with open(af, "r", encoding="utf-8") as f:
                adata = json.load(f)
                cid = str(adata.get("id", "")).strip()
                if cid:
                    candidate_pieces.add(cid)
        except Exception:
            continue

    all_ids = set(published.keys()) | set(pending_by_piece.keys()) | candidate_pieces

    review_counts = {}
    status_summary = {"approved": 0, "rejected": 0, "bad_gabc": 0, "pending": len(pending_files)}

    for pid in sorted(all_ids):
        pub_entry = published.get(pid)
        pub_count = 1 if (pub_entry and pub_entry.get("status")) else 0
        if pub_entry and pub_entry.get("status") in status_summary:
            status_summary[pub_entry.get("status")] += 1

        pend_count = pending_by_piece.get(pid, 0)
        tot = pub_count + pend_count

        review_counts[pid] = {
            "published": pub_count,
            "pending": pend_count,
            "total": tot,
            "current_status": pub_entry.get("status") if pub_entry else "unreviewed"
        }

    stats_payload = {
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "total_candidate_pieces": len(candidate_pieces),
        "total_published_reviews": len(published),
        "total_pending_reviews": len(pending_files),
        "status_summary": status_summary,
        "pieces": review_counts
    }

    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(stats_payload, f, ensure_ascii=False, indent=2)
        # Also copy to www/pipeline/reviews/stats.json if directory exists
        www_stats = BASE_DIR / "www" / "pipeline" / "reviews" / "stats.json"
        www_stats.parent.mkdir(parents=True, exist_ok=True)
        with open(www_stats, "w", encoding="utf-8") as f:
            json.dump(stats_payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[WARN] Impossible d'ecrire dans stats.json: {e}")

    return stats_payload


def stage_reviews(issue_number: int, issue_body: str, author: str = "", issue_url: str = ""):
    """
    Extrait les revues (une ou plusieurs) d'un ticket et les enregistre dans pipeline/reviews/pending/
    """
    match = re.search(r'```json\s*(\{.*?\}|\[.*?\])\s*```', issue_body, re.DOTALL)
    if not match:
        print("[!] Aucun bloc de code JSON trouve dans le corps du ticket.")
        write_github_output({"staged_count": 0, "pieces_list": ""})
        return 0

    try:
        raw_json = json.loads(match.group(1))
    except Exception as e:
        print(f"[!] Erreur de decodage JSON : {e}")
        write_github_output({"staged_count": 0, "pieces_list": ""})
        return 0

    items = []
    if isinstance(raw_json, dict):
        for k, v in raw_json.items():
            if isinstance(v, dict):
                v_copy = dict(v)
                v_copy["piece_id"] = k
                items.append(v_copy)
    elif isinstance(raw_json, list):
        for v in raw_json:
            if isinstance(v, dict) and "piece_id" in v:
                items.append(v)

    staged_count = 0
    staged_pieces = []

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    issue_tag = f"issue_{issue_number}" if issue_number else f"manual_{int(datetime.datetime.now().timestamp())}"

    for item in items:
        pid = str(item.get("piece_id", "")).strip()
        status = str(item.get("status", "")).strip()
        if not pid or not status:
            continue

        safe_pid = sanitize_id(pid)
        filename = f"{safe_pid}__{issue_tag}.json"
        out_path = PENDING_DIR / filename

        review_doc = {
            "piece_id": pid,
            "status": status,
            "comment": str(item.get("comment", "")).strip(),
            "reviewedAt": item.get("reviewedAt") or now_iso,
            "stagedAt": now_iso,
            "author": author or "anonymous",
            "issue_number": issue_number,
            "issue_url": issue_url or (f"https://github.com/bastonus/jgabc/issues/{issue_number}" if issue_number else ""),
            "title": item.get("title", ""),
            "incipit": item.get("incipit", ""),
            "youtube_id": item.get("youtube_id", "")
        }

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(review_doc, f, ensure_ascii=False, indent=2)

        append_history({
            "action": "stage",
            "piece_id": pid,
            "status": status,
            "author": author,
            "issue_number": issue_number,
            "comment": review_doc["comment"]
        })

        staged_count += 1
        staged_pieces.append(pid)

    compute_and_save_stats()

    print(f"[*] {staged_count} revues mises en attente dans {PENDING_DIR}")
    write_github_output({
        "staged_count": staged_count,
        "pieces_list": ", ".join(staged_pieces)
    })
    return staged_count


def list_pending():
    """Affiche un tableau des revues en attente."""
    pending_files = sorted(PENDING_DIR.glob("*.json"))
    if not pending_files:
        print("[*] Aucune revue en attente de validation.")
        return

    print("=" * 80)
    print(f"  FILE D'ATTENTE DES REVUES ({len(pending_files)} en attente)")
    print("=" * 80)
    print(f"{'Chant ID':<22} | {'Statut':<10} | {'Auteur':<14} | {'Ticket':<8} | {'Commentaire'}")
    print("-" * 80)

    for pf in pending_files:
        try:
            with open(pf, "r", encoding="utf-8") as f:
                d = json.load(f)
            pid = d.get("piece_id", pf.stem)
            st = d.get("status", "")
            auth = (d.get("author") or "inconnu")[:14]
            iss = f"#{d.get('issue_number')}" if d.get("issue_number") else "-"
            cmt = (d.get("comment") or "")[:28]
            print(f"{pid:<22} | {st:<10} | {auth:<14} | {iss:<8} | {cmt}")
        except Exception as e:
            print(f"Erreur lecture {pf.name}: {e}")
    print("=" * 80)


def show_review(target: str):
    """Affiche le detail d'une revue cible."""
    target_clean = sanitize_id(target)
    matches = list(PENDING_DIR.glob(f"*{target_clean}*.json"))
    if not matches:
        print(f"[!] Aucune revue en attente trouvee pour : {target}")
        return

    for mf in matches:
        with open(mf, "r", encoding="utf-8") as f:
            d = json.load(f)
        print("\n" + "-" * 60)
        print(f"  Fichier     : {mf.name}")
        print(f"  Chant ID    : {d.get('piece_id')}")
        print(f"  Titre       : {d.get('title') or d.get('incipit') or '-'}")
        print(f"  Statut      : {d.get('status')}")
        print(f"  Auteur      : {d.get('author')}")
        print(f"  Date revue  : {d.get('reviewedAt')}")
        print(f"  Ticket      : {d.get('issue_url') or d.get('issue_number')}")
        print(f"  Commentaire : {d.get('comment') or '(aucun)'}")
        print("-" * 60 + "\n")


def approve_reviews(issue_number: int = None, piece_id: str = None, all_pending: bool = False, approved_by: str = "maintainer"):
    """
    Valide et fusionne les revues en attente dans pipeline/lab_reviews.json.
    Archive les fichiers dans pipeline/reviews/approved/.
    Recompile automatiquement les assets de production.
    """
    pending_files = sorted(PENDING_DIR.glob("*.json"))
    if not pending_files:
        print("[*] Aucune revue en attente a approuver.")
        write_github_output({"approved_count": 0, "published_total": 0})
        return 0

    to_approve = []
    for pf in pending_files:
        try:
            with open(pf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        match = False
        if all_pending:
            match = True
        elif issue_number is not None and int(data.get("issue_number") or 0) == int(issue_number):
            match = True
        elif piece_id and str(data.get("piece_id")) == str(piece_id):
            match = True

        if match:
            to_approve.append((pf, data))

    if not to_approve:
        print(f"[!] Aucune revue correspondante a approuver (issue={issue_number}, piece_id={piece_id}, all={all_pending}).")
        write_github_output({"approved_count": 0, "published_total": 0})
        return 0

    # Load canonical reviews
    lab_reviews = {}
    if LAB_REVIEWS_FILE.exists():
        try:
            with open(LAB_REVIEWS_FILE, "r", encoding="utf-8") as f:
                lab_reviews = json.load(f)
        except Exception:
            lab_reviews = {}

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    approved_count = 0
    approved_pieces = []

    for pf, data in to_approve:
        pid = str(data["piece_id"])
        incoming_date = data.get("reviewedAt") or now_iso

        # Merge with timestamp precedence without dropping existing reviews
        existing = lab_reviews.get(pid, {})
        existing_date = existing.get("reviewedAt", "")

        should_update = True
        if existing_date and incoming_date < existing_date:
            print(f"[INFO] Revue existante pour {pid} plus recente ({existing_date} >= {incoming_date}). Mise a jour des meta uniquement.")
            should_update = False

        if should_update:
            lab_reviews[pid] = {
                "status": data["status"],
                "comment": data.get("comment", ""),
                "reviewedAt": incoming_date,
                "title": data.get("title") or existing.get("title", ""),
                "incipit": data.get("incipit") or existing.get("incipit", ""),
                "youtube_id": data.get("youtube_id") or existing.get("youtube_id", ""),
                "approved_by": approved_by,
                "approved_at": now_iso
            }
        else:
            lab_reviews[pid]["approved_by"] = approved_by
            lab_reviews[pid]["approved_at"] = now_iso

        # Move to approved directory
        dest = APPROVED_DIR / pf.name
        shutil.move(str(pf), str(dest))

        append_history({
            "action": "approve",
            "piece_id": pid,
            "status": data["status"],
            "approved_by": approved_by,
            "issue_number": data.get("issue_number")
        })

        approved_count += 1
        approved_pieces.append(pid)

    # Save canonical reviews
    with open(LAB_REVIEWS_FILE, "w", encoding="utf-8") as f:
        json.dump(lab_reviews, f, ensure_ascii=False, indent=2)

    # Sync to www/ if www/pipeline/lab_reviews.json exists
    www_lab_reviews = BASE_DIR / "www" / "pipeline" / "lab_reviews.json"
    if www_lab_reviews.parent.exists():
        with open(www_lab_reviews, "w", encoding="utf-8") as f:
            json.dump(lab_reviews, f, ensure_ascii=False, indent=2)

    # Recompute stats
    compute_and_save_stats()

    # Recompile production assets
    try:
        from compile_alignments import compile_all_alignments
        compile_all_alignments()
    except Exception as e:
        try:
            from tools.compile_alignments import compile_all_alignments
            compile_all_alignments()
        except Exception as e2:
            print(f"[WARN] Erreur lors de la recompilation : {e2}")

    print(f"[*] {approved_count} revues approuvees et integrees avec succes dans {LAB_REVIEWS_FILE.name}.")
    print(f"[*] Total des pieces validees : {len(lab_reviews)}")

    write_github_output({
        "approved_count": approved_count,
        "published_total": len(lab_reviews),
        "approved_pieces": ", ".join(approved_pieces)
    })
    return approved_count


def reject_reviews(issue_number: int = None, piece_id: str = None, reason: str = "", rejected_by: str = "maintainer"):
    """
    Rejette des revues en attente et les archive dans pipeline/reviews/rejected/.
    """
    pending_files = sorted(PENDING_DIR.glob("*.json"))
    to_reject = []
    for pf in pending_files:
        try:
            with open(pf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        match = False
        if issue_number is not None and int(data.get("issue_number") or 0) == int(issue_number):
            match = True
        elif piece_id and str(data.get("piece_id")) == str(piece_id):
            match = True

        if match:
            to_reject.append((pf, data))

    if not to_reject:
        print(f"[!] Aucune revue a rejeter.")
        write_github_output({"rejected_count": 0})
        return 0

    rejected_count = 0
    for pf, data in to_reject:
        dest = REJECTED_DIR / pf.name
        shutil.move(str(pf), str(dest))

        append_history({
            "action": "reject",
            "piece_id": data.get("piece_id"),
            "rejected_by": rejected_by,
            "reason": reason,
            "issue_number": data.get("issue_number")
        })
        rejected_count += 1

    compute_and_save_stats()
    print(f"[*] {rejected_count} revues rejetees et archivees dans {REJECTED_DIR.name}.")
    write_github_output({"rejected_count": rejected_count})
    return rejected_count


def main():
    parser = argparse.ArgumentParser(description="Gestionnaire de file d'attente des revues d'alignement grégorien.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # stage
    p_stage = subparsers.add_parser("stage", help="Met en attente les revues depuis un ticket ou fichier")
    p_stage.add_argument("--issue-number", type=int, default=0, help="Numero de ticket GitHub")
    p_stage.add_argument("--issue-body", type=str, default="", help="Contenu texte du ticket")
    p_stage.add_argument("--issue-url", type=str, default="", help="Lien web du ticket")
    p_stage.add_argument("--author", type=str, default="", help="Identifiant de l'auteur")
    p_stage.add_argument("--file", type=str, default="", help="Fichier JSON local a integrer")

    # list
    subparsers.add_parser("list", help="Liste les revues en attente")

    # show
    p_show = subparsers.add_parser("show", help="Affiche le detail d'une revue")
    p_show.add_argument("target", type=str, help="ID du chant ou nom du fichier")

    # approve
    p_app = subparsers.add_parser("approve", help="Approuve et publie les revues")
    p_app.add_argument("--issue-number", type=int, default=None, help="Numero de ticket GitHub a approuver")
    p_app.add_argument("--piece-id", type=str, default=None, help="ID de piece a approuver")
    p_app.add_argument("--all", action="store_true", help="Approuver toutes les revues en attente")
    p_app.add_argument("--approved-by", type=str, default="maintainer", help="Nom du validateur")

    # reject
    p_rej = subparsers.add_parser("reject", help="Rejette les revues en attente")
    p_rej.add_argument("--issue-number", type=int, default=None, help="Numero de ticket GitHub a rejeter")
    p_rej.add_argument("--piece-id", type=str, default=None, help="ID de piece a rejeter")
    p_rej.add_argument("--reason", type=str, default="", help="Raison du rejet")
    p_rej.add_argument("--rejected-by", type=str, default="maintainer", help="Nom de la personne")

    # sync
    subparsers.add_parser("sync", help="Recalcule les statistiques et synchronise la base")

    args = parser.parse_args()

    if args.command == "stage":
        body = args.issue_body or os.environ.get("ISSUE_BODY", "")
        if args.file and os.path.exists(args.file):
            with open(args.file, "r", encoding="utf-8") as f:
                content = f.read()
                if "```json" in content:
                    body = content
                else:
                    body = f"```json\n{content}\n```"
        stage_reviews(args.issue_number, body, author=args.author, issue_url=args.issue_url)

    elif args.command == "list":
        list_pending()

    elif args.command == "show":
        show_review(args.target)

    elif args.command == "approve":
        approve_reviews(issue_number=args.issue_number, piece_id=args.piece_id, all_pending=args.all, approved_by=args.approved_by)

    elif args.command == "reject":
        reject_reviews(issue_number=args.issue_number, piece_id=args.piece_id, reason=args.reason, rejected_by=args.rejected_by)

    elif args.command == "sync":
        stats = compute_and_save_stats()
        print(f"[*] Statistiques synchronisees : {stats['total_published_reviews']} publiees, {stats['total_pending_reviews']} en attente.")


if __name__ == "__main__":
    main()
