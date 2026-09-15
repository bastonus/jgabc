"""
apply_local_corrections.py
Application des calculs locaux ciblés GABC selon les consignes strictes de l'utilisateur :
1. Calcul sur 3 notes (triplet) quand la note du milieu est sautée (durée brute < 0.08s).
2. Plancher minimal pour les notes anormalement rapides ("quand c'est trop rapide", durée < 0.16s / 0.28s).
3. Calcul quand la longueur d'une note (pointée ou normale) est 4 à 5 fois plus longue
   que la moyenne des notes de sa catégorie dans le chant GABC.
4. Règle d'or de fin de mot : rester sur la dernière note du mot précédent tant que le mot
   suivant n'a pas commencé acoustiquement.
5. Intégration des métadonnées de reprise pour le lecteur SVG.
6. Prise en compte stricte des notes non chantées (sung: False, ex: Doxologie omise).
"""

import os
import sys
import json
import copy

ALIGN_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_STAMPS_FILE = os.path.join(ALIGN_DIR, "raw_acoustic_stamps.json")
REPRISE_META_FILE = os.path.join(ALIGN_DIR, "reprise_metadata.json")
LAB_MANIFEST = os.path.join(ALIGN_DIR, "lab_5_pieces.json")
LAB_DATA_JS = os.path.join(ALIGN_DIR, "lab_data.js")
FINAL_STAMPS_DIR = os.path.join(ALIGN_DIR, "final_timestamps")

os.makedirs(FINAL_STAMPS_DIR, exist_ok=True)

with open(RAW_STAMPS_FILE, "r", encoding="utf-8") as f:
    raw_stamps = json.load(f)

reprise_meta = {}
if os.path.exists(REPRISE_META_FILE):
    with open(REPRISE_META_FILE, "r", encoding="utf-8") as f:
        reprise_meta = json.load(f)

with open(LAB_MANIFEST, "r", encoding="utf-8") as f:
    manifest = json.load(f)

final_pieces = []

for piece in manifest:
    pid = piece["id"]
    piece_copy = dict(piece)

    if pid in ["14", "15"]:
        piece_copy["youtube_id"] = ""
        piece_copy["youtube_url"] = ""
        piece_copy["timestamps"] = []
        piece_copy["raw_timestamps"] = []
        piece_copy["applied_corrections"] = []
        piece_copy["stats"] = {"total_notes": 0, "corrections_count": 0}
        final_pieces.append(piece_copy)
        continue

    if pid not in raw_stamps:
        print(f"[ATTENTION] Pièce {pid} absente des timestamps bruts.")
        final_pieces.append(piece_copy)
        continue

    raw_notes = raw_stamps[pid]
    corrected_notes = copy.deepcopy(raw_notes)

    # 1. Calcul des moyennes par catégorie sur les notes EFFECTIVEMENT CHANTÉES
    sung_notes = [n for n in raw_notes if n.get("sung", True)]
    normal_durs = [n["duration"] for n in sung_notes if not n.get("is_pointed", False) and 0.05 < n["duration"] < 4.0]
    pointed_durs = [n["duration"] for n in sung_notes if n.get("is_pointed", False) and 0.05 < n["duration"] < 6.0]

    avg_normal = sum(normal_durs) / len(normal_durs) if normal_durs else 0.35
    avg_pointed = sum(pointed_durs) / len(pointed_durs) if pointed_durs else 0.70

    thresh_normal = 4.5 * avg_normal
    thresh_pointed = 4.5 * avg_pointed

    fast_thresh_normal = 0.16
    fast_thresh_pointed = 0.28

    corrections_log = []

    print(f"\n==========================================")
    print(f"[{pid}] {piece['incipit']}")
    print(f"  Notes totales : {len(corrected_notes)} (Chantées : {len(sung_notes)})")
    print(f"  Moyenne notes normales : {avg_normal:.3f}s (seuil 4.5x : {thresh_normal:.2f}s, min : {fast_thresh_normal}s)")
    print(f"  Moyenne notes pointées : {avg_pointed:.3f}s (seuil 4.5x : {thresh_pointed:.2f}s, min : {fast_thresh_pointed}s)")

    # ── RÈGLE 1 : Triplet sur 3 notes quand la note du milieu est sautée ──
    i = 1
    while i < len(corrected_notes) - 1:
        cur_n = corrected_notes[i]
        prev_n = corrected_notes[i - 1]
        next_n = corrected_notes[i + 1]

        if not (cur_n.get("sung", True) and prev_n.get("sung", True) and next_n.get("sung", True)):
            i += 1
            continue

        if cur_n["duration"] < 0.08 and (prev_n["duration"] >= 0.18 or next_n["duration"] >= 0.18):
            t_start = prev_n["start"]
            t_end = next_n["end"]
            t_span = max(0.35, t_end - t_start)

            w_prev = max(0.5, prev_n.get("duration_weight", 1.0))
            w_cur = max(0.5, cur_n.get("duration_weight", 1.0))
            w_next = max(0.5, next_n.get("duration_weight", 1.0))
            total_w = w_prev + w_cur + w_next

            old_durs = [prev_n["duration"], cur_n["duration"], next_n["duration"]]

            d_prev = (w_prev / total_w) * t_span
            d_cur = (w_cur / total_w) * t_span
            d_next = (w_next / total_w) * t_span

            prev_n["start"] = round(t_start, 3)
            prev_n["end"] = round(t_start + d_prev, 3)
            prev_n["duration"] = round(d_prev, 3)
            prev_n["is_corrected"] = True

            cur_n["start"] = round(prev_n["end"], 3)
            cur_n["end"] = round(cur_n["start"] + d_cur, 3)
            cur_n["duration"] = round(d_cur, 3)
            cur_n["is_corrected"] = True

            next_n["start"] = round(cur_n["end"], 3)
            next_n["end"] = round(t_end, 3)
            next_n["duration"] = round(t_end - next_n["start"], 3)
            next_n["is_corrected"] = True

            corr_entry = {
                "id": f"triplet_{pid}_{i}",
                "type": "triplet_saute",
                "type_label": "Triplet / Note sautée",
                "target_note_index": i,
                "triplet_indices": [i - 1, i, i + 1],
                "word": cur_n["word"],
                "pitch": cur_n["pitch"],
                "token": cur_n["token"],
                "time_window": f"{t_start:.2f}s – {t_end:.2f}s",
                "total_span": round(t_span, 3),
                "old_durations": [round(x, 3) for x in old_durs],
                "new_durations": [round(d_prev, 3), round(d_cur, 3), round(d_next, 3)],
                "weights": [w_prev, w_cur, w_next],
                "description": (
                    f"Note {i} ('{cur_n['word']}', hauteur {cur_n['pitch']}) sautée par l'IA "
                    f"({old_durs[1]:.2f}s < 0.08s). Redistribution locale sur le triplet [{i-1}, {i}, {i+1}] "
                    f"sur {t_span:.2f}s selon les poids GABC [{w_prev}, {w_cur}, {w_next}]."
                )
            }
            corrections_log.append(corr_entry)
            print(f"  [CORRECTION TRIPLET] Note {i} ({cur_n['word']}) : durée {old_durs[1]:.2f}s -> {d_cur:.2f}s")
            i += 3
        else:
            i += 1

    # ── RÈGLES 2 & 3 (Trop courte / Trop longue) SUPPRIMÉES SELON DEMANDE UTILISATEUR ──
    # Seules sont conservées :
    # - Règle 1 : Triplet / note sautée (< 0.08s au milieu de deux notes chantées)
    # - Règle 4 : Maintien de fin de mot jusqu'à l'attaque du mot suivant

    # ── RÈGLE 4 : Maintien de la note précédente en fin de mot ──
    for k in range(len(corrected_notes) - 1):
        if corrected_notes[k].get("sung", True) and corrected_notes[k + 1].get("sung", True):
            if corrected_notes[k]["word"] != corrected_notes[k + 1]["word"]:
                nxt_start = corrected_notes[k + 1]["start"]
                if nxt_start > corrected_notes[k]["end"]:
                    corrected_notes[k]["end"] = nxt_start
                    corrected_notes[k]["duration"] = round(nxt_start - corrected_notes[k]["start"], 3)

    # 5. Métadonnées de reprise
    p_reprise = reprise_meta.get(pid, None)
    piece_copy["reprise"] = p_reprise
    piece_copy["has_reprise"] = (p_reprise is not None)

    # 6. Sauvegarde finale pour la pièce
    stamps_file = os.path.join(FINAL_STAMPS_DIR, f"{pid}_stamps.json")
    with open(stamps_file, "w", encoding="utf-8") as sf:
        json.dump(corrected_notes, sf, indent=2, ensure_ascii=False)

    true_audio_end = p_reprise["end"] if p_reprise else max(n["end"] for n in corrected_notes if n.get("sung", True))

    piece_copy["timestamps"] = corrected_notes
    piece_copy["raw_timestamps"] = raw_notes
    piece_copy["applied_corrections"] = corrections_log
    piece_copy["stats"] = {
        "total_notes": len(corrected_notes),
        "sung_notes": len(sung_notes),
        "avg_normal_dur": round(avg_normal, 3),
        "avg_pointed_dur": round(avg_pointed, 3),
        "thresh_normal_4_5x": round(thresh_normal, 3),
        "thresh_pointed_4_5x": round(thresh_pointed, 3),
        "corrections_count": len(corrections_log),
        "audio_start": sung_notes[0]["start"] if sung_notes else 0.0,
        "audio_end": round(true_audio_end, 3)
    }
    final_pieces.append(piece_copy)
    print(f"  [RÉSUMÉ {pid}] {len(corrections_log)} correction(s) ciblée(s) appliquées avec succès.")

# Écriture de lab_data.js et lab_5_pieces.json
with open(LAB_DATA_JS, "w", encoding="utf-8") as f:
    f.write("const PIECES = " + json.dumps(final_pieces, indent=2, ensure_ascii=False) + ";\n")

with open(LAB_MANIFEST, "w", encoding="utf-8") as f:
    json.dump(final_pieces, f, indent=2, ensure_ascii=False)

print(f"\n[TERMINÉ] lab_data.js et lab_5_pieces.json mis à jour avec succès !")
