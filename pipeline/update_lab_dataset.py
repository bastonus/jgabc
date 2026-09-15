import os
import sys
import json
import re

BASE_DIR = r"d:\Documents\jgabc"
CORPUS_DIR = os.path.join(BASE_DIR, "GABC-video-notes-alignement")
MAPPING_FILE = os.path.join(CORPUS_DIR, "graduale_project_video_gabc_mapping.json")
LAB_5_FILE = os.path.join(BASE_DIR, "pipeline", "lab_5_pieces.json")
TIMESTAMPS_DIR = os.path.join(BASE_DIR, "pipeline", "final_timestamps")
ROOT_GABC = os.path.join(BASE_DIR, "gabc")
MK_GABC = os.path.join(CORPUS_DIR, "corpus", "sources", "marekklein_transcriptions")
OUTPUT_LAB_JS = os.path.join(BASE_DIR, "pipeline", "lab_data.js")
OUTPUT_LAB_JSON = os.path.join(BASE_DIR, "pipeline", "lab_pieces.json")

def load_gabc_text(piece_id, gabc_file, gabc_path):
    candidates = [
        os.path.join(ROOT_GABC, f"{piece_id}.gabc"),
        os.path.join(ROOT_GABC, f"mk_{gabc_file}"),
        os.path.join(ROOT_GABC, gabc_file),
        os.path.join(BASE_DIR, gabc_path) if gabc_path else "",
        os.path.join(MK_GABC, gabc_file)
    ]
    for c in candidates:
        if c and os.path.exists(c) and os.path.getsize(c) > 10:
            try:
                with open(c, 'r', encoding='utf-8', errors='ignore') as fp:
                    return fp.read()
            except Exception:
                pass
    return ""

def main():
    print("=================================================================")
    print("  GÉNÉRATION DU DATASET COMPLET LAB_DATA.JS POUR LE LABORATOIRE")
    print("=================================================================\n")

    if not os.path.exists(MAPPING_FILE):
        print(f"Erreur : Fichier de cartographie non trouvé à {MAPPING_FILE}")
        sys.exit(1)

    with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
        mapping = json.load(f)

    videos = mapping.get('videos', [])
    print(f"Total vidéos dans le catalogue : {len(videos)}")

    # Load 15 aligned pieces from lab_5_pieces.json
    aligned_by_yid = {}
    if os.path.exists(LAB_5_FILE):
        with open(LAB_5_FILE, 'r', encoding='utf-8') as fp:
            l5 = json.load(fp)
            for p in l5:
                yid = p.get('youtube_id')
                if yid:
                    aligned_by_yid[yid] = p

    print(f"Pièces certifiées depuis lab_5_pieces.json : {len(aligned_by_yid)}")

    # Load from final_timestamps
    stamps_by_id = {}
    if os.path.exists(TIMESTAMPS_DIR):
        for f in os.listdir(TIMESTAMPS_DIR):
            if f.endswith('_stamps.json'):
                pid = f[:-12]
                spath = os.path.join(TIMESTAMPS_DIR, f)
                try:
                    with open(spath, 'r', encoding='utf-8') as fp:
                        data = json.load(fp)
                        if isinstance(data, list):
                            stamps_by_id[pid] = data
                        elif isinstance(data, dict) and 'timestamps' in data:
                            stamps_by_id[pid] = data['timestamps']
                except Exception as ex:
                    pass

    with_stamps = []
    without_stamps = []

    for v in videos:
        yid = v.get('youtube_id')
        gid = str(v.get('gregobase_id') or v.get('gabc_file', '').replace('.gabc', ''))
        title = v.get('title', '')
        incipit = v.get('incipit', title)
        op = v.get('office_part', '')
        gfile = v.get('gabc_file', '')
        gpath = v.get('gabc_path', '')
        duration = v.get('duration') or 180

        # Check if already in lab_5_pieces
        if yid in aligned_by_yid:
            p_orig = aligned_by_yid[yid]
            piece_obj = dict(p_orig)
            piece_obj['id'] = gid
            piece_obj['youtube_id'] = yid
            piece_obj['official_tier'] = v.get('official_tier', 4)
            piece_obj['official_source'] = v.get('official_source', 'GradualeProject')
            piece_obj['has_nabc'] = v.get('has_nabc', False)
            piece_obj['playlists'] = v.get('playlists', [])
            with_stamps.append(piece_obj)
            continue

        gabc_src = load_gabc_text(gid, gfile, gpath)
        stamps = stamps_by_id.get(gid) or stamps_by_id.get(yid) or []

        piece_obj = {
            'id': gid,
            'youtube_id': yid,
            'title': title,
            'incipit': incipit,
            'part': op.upper() if len(op) <= 3 else op.capitalize(),
            'office_part': op,
            'youtube_url': f"https://www.youtube.com/watch?v={yid}",
            'source': v.get('official_source', 'GradualeProject'),
            'official_tier': v.get('official_tier', 4),
            'has_nabc': v.get('has_nabc', False),
            'gabc_file': gfile,
            'gabc_path': gpath,
            'gabc_src': gabc_src,
            'audio_duration': duration,
            'timestamps': stamps,
            'total_notes': len(stamps),
            'playlists': v.get('playlists', [])
        }

        if stamps:
            with_stamps.append(piece_obj)
        else:
            without_stamps.append(piece_obj)

    # Sort with_stamps first, then without_stamps sorted by liturgical category/title
    pieces_list = with_stamps + without_stamps
    print(f"Pièces traitées : {len(with_stamps)} avec timestamps complets + {len(without_stamps)} prêtes pour alignement.")

    with open(OUTPUT_LAB_JSON, 'w', encoding='utf-8') as f:
        json.dump(pieces_list, f, ensure_ascii=False, indent=2)

    js_content = f"// Dataset complet GradualeProject & Alignements Oremus\nconst PIECES = {json.dumps(pieces_list, ensure_ascii=False, indent=2)};\n"
    with open(OUTPUT_LAB_JS, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"Fichier lab_data.js généré ({os.path.getsize(OUTPUT_LAB_JS) / 1024:.1f} KB)")

if __name__ == '__main__':
    main()
