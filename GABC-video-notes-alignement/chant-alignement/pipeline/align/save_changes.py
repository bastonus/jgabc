"""
save_changes.py — Outil CLI et API locale pour sauvegarder les modifications humaines
dans la base de données Oremus (gregorian_youtube_links.json / .js et final_timestamps/).
"""

import os
import sys
import json
import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
YT_JSON = os.path.join(ROOT_DIR, "js", "gregorian_youtube_links.json")
YT_JS = os.path.join(ROOT_DIR, "js", "gregorian_youtube_links.js")
TIMESTAMPS_DIR = os.path.join(PIPELINE_DIR, "final_timestamps")
LAB_DATA_JS = os.path.join(PIPELINE_DIR, "align", "lab_data.js")

def flag_bad_air(chant_id: str, reason: str = "air", comment: str = ""):
    """Enregistre un signalement d'inadéquation ou mauvais air dans la base de données."""
    chant_id = str(chant_id)
    if not os.path.exists(YT_JSON):
        return False, f"Fichier introuvable : {YT_JSON}"

    with open(YT_JSON, "r", encoding="utf-8") as f:
        db = json.load(f)

    if chant_id not in db:
        db[chant_id] = {"id": chant_id, "incipit": f"Chant {chant_id}", "part": "", "audios": []}

    entry = db[chant_id]
    flag_entry = {
        "reason": reason,
        "comment": comment,
        "date": datetime.datetime.now().isoformat(),
        "status": "flagged_for_review"
    }
    entry["flagged_bad_air"] = flag_entry

    if entry.get("audios"):
        entry["audios"][0]["flag_reason"] = reason

    with open(YT_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    with open(YT_JS, "w", encoding="utf-8") as f:
        f.write("// Base de données des enregistrements audio & vidéo YouTube pour le répertoire grégorien Oremus\nwindow.GREGORIAN_YOUTUBE_AUDIO = " + json.dumps(db, ensure_ascii=False) + ";\n")

    print(f"[OK] Signalement enregistré pour le chant {chant_id} : {reason} - {comment}")
    return True, f"Signalement enregistré pour le chant {chant_id}"

def flag_false_alignment(payload: dict):
    """Enregistre un signalement d'alignement IA complètement faux (bien que la vidéo soit bonne)."""
    feedback_file = os.path.join(PIPELINE_DIR, "feedback_submissions.json")
    submissions = []
    if os.path.exists(feedback_file):
        try:
            with open(feedback_file, "r", encoding="utf-8") as f:
                submissions = json.load(f)
        except Exception:
            submissions = []

    payload["server_received_at"] = datetime.datetime.now().isoformat()
    submissions.append(payload)

    with open(feedback_file, "w", encoding="utf-8") as f:
        json.dump(submissions, f, ensure_ascii=False, indent=2)

    # Sauvegarder également une copie dans pipeline/align/feedback_submissions.json
    align_feedback = os.path.join(PIPELINE_DIR, "align", "feedback_submissions.json")
    with open(align_feedback, "w", encoding="utf-8") as f:
        json.dump(submissions, f, ensure_ascii=False, indent=2)

    print(f"[OK] Signalement alignement faux enregistré pour chant {payload.get('piece_id')}")
    return True, f"Signalement enregistré avec succès dans feedback_submissions.json"

def update_youtube_recording(chant_id: str, new_yt_id: str, title: str = "", channel: str = "", duration: str = "", flag_reason: str = None):
    """Met à jour l'enregistrement YouTube d'une pièce dans la base de données."""
    chant_id = str(chant_id)
    if not os.path.exists(YT_JSON):
        print(f"[ERREUR] Fichier introuvable : {YT_JSON}")
        return False

    with open(YT_JSON, "r", encoding="utf-8") as f:
        db = json.load(f)

    if chant_id not in db:
        db[chant_id] = {"id": chant_id, "incipit": title or f"Chant {chant_id}", "part": "", "audios": []}

    entry = db[chant_id]
    new_audio = {
        "id": new_yt_id,
        "title": title or entry.get("incipit", f"Chant {chant_id}"),
        "channel": channel or "Manuel",
        "duration": duration or "—",
        "url": f"https://www.youtube.com/watch?v={new_yt_id}",
        "embedUrl": f"https://www.youtube.com/embed/{new_yt_id}",
        "source": channel or "Manuel",
        "verified_human": True
    }
    if flag_reason:
        new_audio["flag_reason"] = flag_reason

    # Placer le nouvel enregistrement en tête
    existing = [a for a in entry.get("audios", []) if a.get("id") != new_yt_id]
    entry["audios"] = [new_audio] + existing

    with open(YT_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    with open(YT_JS, "w", encoding="utf-8") as f:
        f.write("// Base de données des enregistrements audio & vidéo YouTube pour le répertoire grégorien Oremus\nwindow.GREGORIAN_YOUTUBE_AUDIO = " + json.dumps(db, ensure_ascii=False) + ";\n")

    # Mettre à jour lab_data.js si la pièce y figure (les deux emplacements)
    for target_path in [LAB_DATA_JS, os.path.join(PIPELINE_DIR, "lab_data.js")]:
        if os.path.exists(target_path):
            try:
                with open(target_path, "r", encoding="utf-8") as f:
                    raw = f.read()
                pieces = json.loads(raw.replace("const PIECES = ", "").rstrip(";\n "))
                for p in pieces:
                    if str(p.get("id")) == chant_id:
                        p["youtube_id"] = new_yt_id
                        p["youtube_url"] = f"https://www.youtube.com/watch?v={new_yt_id}"
                        p["source"] = channel or "Manuel"
                        p["verified_human"] = True
                        break
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write("const PIECES = " + json.dumps(pieces, ensure_ascii=False, indent=2) + ";\n")
                print(f"[OK] {target_path} synchronisé avec nouveau YouTube pour chant {chant_id}")
            except Exception as e:
                print(f"[WARN] Impossible de mettre à jour {target_path} : {e}")

    print(f"[OK] YouTube mis à jour pour chant ID {chant_id} -> {new_yt_id} ({channel})")
    return True, f"YouTube mis à jour pour chant {chant_id}"

def save_note_timestamps(chant_id: str, timestamps_list: list):
    """Sauvegarde les horodatages modifiés manuellement dans final_timestamps/{id}_stamps.json."""
    chant_id = str(chant_id)
    os.makedirs(TIMESTAMPS_DIR, exist_ok=True)
    out_file = os.path.join(TIMESTAMPS_DIR, f"{chant_id}_stamps.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(timestamps_list, f, ensure_ascii=False, indent=2)

    print(f"[OK] {len(timestamps_list)} horodatages enregistrés dans {out_file}")

    # Mettre à jour lab_data.js si la pièce y figure (les deux emplacements)
    for target_path in [LAB_DATA_JS, os.path.join(PIPELINE_DIR, "lab_data.js")]:
        if os.path.exists(target_path):
            try:
                with open(target_path, "r", encoding="utf-8") as f:
                    raw = f.read()
                pieces = json.loads(raw.replace("const PIECES = ", "").rstrip(";\n "))
                for p in pieces:
                    if str(p.get("id")) == chant_id:
                        p["timestamps"] = timestamps_list
                        p["verified_human"] = True
                        break
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write("const PIECES = " + json.dumps(pieces, ensure_ascii=False, indent=2) + ";\n")
                print(f"[OK] {target_path} synchronisé pour chant {chant_id}")
            except Exception as e:
                print(f"[WARN] Impossible de mettre à jour {target_path} : {e}")

    return True, f"{len(timestamps_list)} horodatages sauvegardés pour le chant {chant_id}"

class LabApiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "status": "online", "mode": "disk"}).encode('utf-8'))
            return
        elif parsed.path == "/favicon.ico":
            ico_path = os.path.join(ROOT_DIR, "favicon.ico")
            if os.path.exists(ico_path):
                self.send_response(200)
                self.send_header("Content-Type", "image/x-icon")
                self.end_headers()
                with open(ico_path, "rb") as f:
                    self.wfile.write(f.read())
                return
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else "{}"
        try:
            data = json.loads(body)
        except Exception:
            data = {}

        response_data = {"ok": False, "error": "Endpoint inconnu"}

        if parsed.path == "/api/flag":
            cid = data.get("chant_id")
            reason = data.get("reason", "air")
            comment = data.get("comment", "")
            ok, msg = flag_bad_air(cid, reason, comment)
            response_data = {"ok": ok, "message": msg}

        elif parsed.path == "/api/propose_yt":
            cid = data.get("chant_id")
            yt_id = data.get("youtube_id")
            channel = data.get("channel", "Manuel")
            title = data.get("title", "")
            ok, msg = update_youtube_recording(cid, yt_id, title=title, channel=channel)
            response_data = {"ok": ok, "message": msg}

        elif parsed.path == "/api/save_notes":
            cid = data.get("chant_id")
            stamps = data.get("timestamps", [])
            ok, msg = save_note_timestamps(cid, stamps)
            response_data = {"ok": ok, "message": msg}

        elif parsed.path == "/api/flag_false_alignment":
            ok, msg = flag_false_alignment(data)
            response_data = {"ok": ok, "message": msg}

        self.send_response(200 if response_data.get("ok") else 400)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(response_data, ensure_ascii=False).encode('utf-8'))

def run_server(port=8080):
    server = HTTPServer(("0.0.0.0", port), LabApiHandler)
    print("============================================================")
    print(f" Serveur de Révision & Lab Oremus en écoute sur port {port}")
    print(f" URL Lab : http://localhost:{port}/pipeline/align/alignment-lab.html")
    print(f" URL App : http://localhost:{port}/divinum-officium.html")
    print("============================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")
        server.server_close()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080
        run_server(port)
    elif len(sys.argv) > 3 and sys.argv[1] == "update_yt":
        cid = sys.argv[2]
        yid = sys.argv[3]
        chn = sys.argv[4] if len(sys.argv) > 4 else ""
        update_youtube_recording(cid, yid, channel=chn)
    elif len(sys.argv) > 3 and sys.argv[1] == "flag":
        cid = sys.argv[2]
        rsn = sys.argv[3]
        cmt = sys.argv[4] if len(sys.argv) > 4 else ""
        flag_bad_air(cid, rsn, cmt)
    elif len(sys.argv) > 3 and sys.argv[1] == "save_stamps":
        cid = sys.argv[2]
        with open(sys.argv[3], "r", encoding="utf-8") as f:
            stamps = json.load(f)
        save_note_timestamps(cid, stamps)
    else:
        print("Usage:")
        print("  python save_changes.py serve [port=8080]")
        print("  python save_changes.py update_yt <chant_id> <youtube_id> [channel_name]")
        print("  python save_changes.py flag <chant_id> <reason> [comment]")
        print("  python save_changes.py save_stamps <chant_id> <path_to_json>")
