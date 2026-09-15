import os
import json
import glob
from pathlib import Path

def compile_all_alignments():
    base_dir = Path(__file__).resolve().parent.parent
    alignments_dir = base_dir / "pipeline" / "alignments"

    if not alignments_dir.exists():
        print(f"[!] Directory {alignments_dir} does not exist.")
        return False

    pattern = str(alignments_dir / "*.json")
    files = glob.glob(pattern)
    print(f"[*] Found {len(files)} modular alignment files in {alignments_dir}...")

    lab_pieces = []
    prod_pieces = {}
    by_video = {}
    total_notes = 0

    for fpath in sorted(files):
        try:
            with open(fpath, "r", encoding="utf-8") as fp:
                data = json.load(fp)
        except Exception as e:
            print(f"[!] Error reading {fpath}: {e}")
            continue

        cid = str(data.get("id", "")).strip()
        yid = str(data.get("youtube_id", "")).strip()
        stamps = data.get("timestamps", [])

        if not cid or not yid or not stamps:
            print(f"[WARN] Skipping {fpath}: missing id, youtube_id, or timestamps")
            continue

        # Validation & compact representation
        last_start = -1
        compact_stamps = []
        for idx, s in enumerate(stamps):
            sv = s.get("start", 0)
            ev = s.get("end", sv)
            if sv is None: sv = 0
            if ev is None: ev = sv
            sv = round(float(sv), 2)
            ev = round(float(ev), 2)
            n_idx = s.get("note_index", idx)

            if sv < last_start:
                print(f"[WARN] In {cid}_{yid}: note {idx} timestamp not monotonic ({sv} < {last_start})")
            last_start = sv

            # Compact tuple: [start, end] or [start, end, note_idx] if non-standard
            if n_idx == idx and not s.get("sung") is False and not s.get("omitted"):
                compact_stamps.append([sv, ev])
            else:
                compact_stamps.append([sv, ev, n_idx])

        total_notes += len(compact_stamps)

        # 1. Lab Piece format (full metadata for Alignment Lab)
        lab_piece = {
            "id": cid,
            "youtube_id": yid,
            "title": data.get("title") or data.get("incipit") or cid,
            "incipit": data.get("incipit") or cid,
            "part": data.get("part", ""),
            "office_part": data.get("office_part", ""),
            "youtube_url": data.get("youtube_url") or f"https://www.youtube.com/watch?v={yid}",
            "audio_duration": data.get("audio_duration", 180),
            "has_nabc": data.get("has_nabc", False),
            "has_reprise": data.get("has_reprise", False),
            "total_notes": len(stamps),
            "timestamps": stamps,
            "gabc_src": data.get("gabc_src", "")
        }
        if data.get("has_reprise") and data.get("reprise"):
            lab_piece["reprise"] = data["reprise"]
        lab_pieces.append(lab_piece)

        # 2. Production Piece format (ultra-compact for fast runtime execution)
        prod_entry = {
            "id": cid,
            "yid": yid,
            "title": data.get("title") or data.get("incipit") or cid,
            "ts": compact_stamps
        }
        if data.get("has_reprise") and data.get("reprise"):
            rep = data["reprise"]
            compact_rep = {
                "start": round(float(rep.get("start", 0)), 2),
                "duration": round(float(rep.get("duration", 0)), 2),
                "end": round(float(rep.get("end", 0)), 2)
            }
            if rep.get("notes"):
                compact_rep["notes"] = [[round(float(rn.get("start", 0)), 2), round(float(rn.get("end", 0)), 2), rn.get("note_index", ridx)] for ridx, rn in enumerate(rep["notes"])]
            prod_entry["rep"] = compact_rep

        prod_pieces[cid] = prod_entry
        by_video[yid] = cid

    # Write Production Files
    prod_data = {
        "v": 1,
        "byVideo": by_video,
        "pieces": prod_pieces
    }

    # 1. js/gregorian_preprocessed_timestamps.js (and www/js/...)
    prod_js_code = (
        "// Alignements pre-traites par le modele acoustique (Synchronisation Video <-> GABC certifiee)\n"
        f"window.GREGORIAN_PREPROCESSED_TIMESTAMPS = {json.dumps(prod_data, separators=(',', ':'))};\n"
    )

    out_js = base_dir / "js" / "gregorian_preprocessed_timestamps.js"
    with open(out_js, "w", encoding="utf-8") as fp:
        fp.write(prod_js_code)

    www_out_js = base_dir / "www" / "js" / "gregorian_preprocessed_timestamps.js"
    if www_out_js.parent.exists():
        with open(www_out_js, "w", encoding="utf-8") as fp:
            fp.write(prod_js_code)

    # 2. data/gregorian_alignments.min.json
    out_json = base_dir / "data" / "gregorian_alignments.min.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as fp:
        json.dump(prod_data, fp, separators=(',', ':'))

    # 3. pipeline/lab_data.js (and pipeline/align/ and www/pipeline/)
    lab_js_code = (
        f"// Dataset des pieces gregoriennes avec alignements calcules ({len(lab_pieces)} pieces)\n"
        f"var PIECES = {json.dumps(lab_pieces, ensure_ascii=False, indent=2)};\n"
    )

    for l_path in [base_dir / "pipeline" / "lab_data.js", base_dir / "pipeline" / "align" / "lab_data.js", base_dir / "www" / "pipeline" / "lab_data.js"]:
        if l_path.parent.exists():
            with open(l_path, "w", encoding="utf-8") as fp:
                fp.write(lab_js_code)

    js_size_kb = os.path.getsize(out_js) / 1024
    print("\n" + "="*65)
    print(f"  [SUCCES] Compilation de l'alignement gregorien terminee !")
    print(f"  Pieces compilees       : {len(prod_pieces)} (Total {total_notes} notes alignees)")
    print(f"  Videos certifiees      : {len(by_video)}")
    print(f"  Taille runtime JS      : {js_size_kb:.1f} Ko (Production optimisee)")
    print(f"  Fichiers mis a jour    : {out_js.name}, {out_json.name}, lab_data.js")
    print("="*65 + "\n")
    return True

if __name__ == "__main__":
    compile_all_alignments()
