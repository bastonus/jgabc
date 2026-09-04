import os
import re
import json
import torch
import torchaudio
import torchaudio.functional as F
import numpy as np

PIPELINE_DIR = r"d:\Documents\jgabc\pipeline"
AUDIO_DIR = os.path.join(PIPELINE_DIR, "audio_corpus")
OUTPUT_DIR = os.path.join(PIPELINE_DIR, "final_timestamps")
EXSURGE_DIR = os.path.join(PIPELINE_DIR, "exsurge_parsed")
LAB_DATA_JS = os.path.join(PIPELINE_DIR, "align", "lab_data.js")
LAB_MANIFEST = os.path.join(PIPELINE_DIR, "align", "lab_5_pieces.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("[1/5] Chargement du modèle acoustique MMS_FA...", flush=True)
bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model()
dictionary = bundle.get_dict()
print("  [OK] MMS_FA chargé.", flush=True)

with open(LAB_MANIFEST, "r", encoding="utf-8") as f:
    manifest = json.load(f)

final_dataset = []

# Traiter les pièces
# Note de l'utilisateur : Seuls 1 (5), 2 (11), 3 (13) ont de bonnes vidéos (la 1 étant à resynchroniser correctement).
# Les liens 14 et 15 doivent être nettoyés.
for piece in manifest:
    pid = piece["id"]
    wav_path = os.path.join(AUDIO_DIR, f"{pid}.wav")
    exsurge_data_path = os.path.join(EXSURGE_DIR, f"{pid}_gabc_data.json")

    print(f"\n==========================================", flush=True)
    print(f"[{pid}] Traitement de {piece['incipit']} ({piece['part']})...", flush=True)

    # Si c'est 14 ou 15, supprimer le lien vidéo erroné selon la demande de l'utilisateur
    if pid in ["14", "15"]:
        print(f"  [INFO] Pièce {pid} : lien vidéo erroné supprimé selon la consigne.", flush=True)
        piece_copy = dict(piece)
        piece_copy["youtube_id"] = ""
        piece_copy["youtube_url"] = ""
        piece_copy["timestamps"] = []
        final_dataset.append(piece_copy)
        continue

    if not os.path.exists(wav_path) or not os.path.exists(exsurge_data_path):
        print(f"  [ERREUR] Fichiers manquants pour {pid}.", flush=True)
        continue

    # 1. Charger l'audio
    waveform, sr = torchaudio.load(wav_path)
    if sr != bundle.sample_rate:
        waveform = torchaudio.functional.resample(waveform, sr, bundle.sample_rate)
    total_audio_sec = waveform.shape[1] / bundle.sample_rate
    print(f"  Audio : {total_audio_sec:.2f}s", flush=True)

    # 2. Charger les mots et notes certifiés d'Exsurge
    with open(exsurge_data_path, "r", encoding="utf-8") as gf:
        words = json.load(gf)

    total_expected_notes = sum(len(w["notes"]) for w in words)
    print(f"  GABC Exsurge : {len(words)} mots, {total_expected_notes} notes", flush=True)

    # 3. Préparer les tokens cibles CTC
    flat_tokens = []
    word_spans = []
    for w_idx, w in enumerate(words):
        cleaned = w["clean_latin"]
        toks = [dictionary[c] for c in cleaned if c in dictionary]
        if toks and not w["is_melisma"]:
            s = len(flat_tokens)
            flat_tokens.extend(toks)
            e = len(flat_tokens)
            word_spans.append((w_idx, s, e))
        else:
            word_spans.append((w_idx, -1, -1))

    # 4. Inférence CTC
    targets = torch.tensor([flat_tokens], dtype=torch.int32)
    with torch.inference_mode():
        emission, _ = model(waveform)
        log_probs = emission.log_softmax(dim=-1)
        input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
        target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
        paths, scores = F.forced_align(log_probs, targets, input_lengths, target_lengths, blank=0)

    path = paths[0]
    token_scores = scores[0]
    frame_dur = 0.02

    # 5. Qualification des ancres acoustiques fiables
    word_records = []
    for w_idx, s_idx, e_idx in word_spans:
        w = words[w_idx]
        w_weight = w["total_weight"]
        if s_idx >= 0 and e_idx > s_idx:
            w_start = path[s_idx].item() * frame_dur
            w_end = (path[e_idx - 1].item() + 1) * frame_dur
            dur = max(0.04, w_end - w_start)
            score = float(token_scores[s_idx:e_idx].mean().item())
            unit_dur = dur / max(0.1, w_weight)
            # Critère de fiabilité : durée unitaire réaliste, score acceptable, durée suffisante
            is_reliable = (unit_dur >= 0.12 and dur >= 0.20 and score > -2.8 and w_end > w_start)
        else:
            w_start, w_end, dur, score = None, None, None, -5.0
            is_reliable = False

        word_records.append({
            "word_index": w_idx,
            "word": w["word"],
            "notes": w["notes"],
            "total_weight": w_weight,
            "start": w_start,
            "end": w_end,
            "score": score,
            "is_reliable": is_reliable,
            "is_melisma": w["is_melisma"]
        })

    # Filtrer les faux sauts temporels en arrière
    last_reliable_end = 0.0
    for wr in word_records:
        if wr["is_reliable"]:
            if wr["start"] < last_reliable_end - 0.2:
                wr["is_reliable"] = False
            else:
                last_reliable_end = wr["end"]

    reliable_count = sum(1 for wr in word_records if wr["is_reliable"])
    print(f"  Ancres fiables acoustiques : {reliable_count}/{len(word_records)} mots", flush=True)

    # 6. ÉTIREMENT TEMPOREL GABC DES PORTIONS NON DÉTECTÉES OU ÉCRASÉES
    # Règle absolue de l'utilisateur :
    # "lorsque le ai modele ne detecte pas les notes, il faut faire des calculs sur la portion
    # (avec les longueurs gabc, en etirant leur temps pour que ca rentre dans le temps de la portion mal detectée)
    # en particulier il ne faut jamais sauter aucune note"
    i = 0
    while i < len(word_records):
        if not word_records[i]["is_reliable"]:
            p_start = i
            while i < len(word_records) and not word_records[i]["is_reliable"]:
                i += 1
            p_end = i - 1

            # Ancre gauche
            if p_start > 0:
                t_left = word_records[p_start - 1]["end"]
            else:
                t_left = 0.4 # Début du chant

            # Ancre droite
            if p_end < len(word_records) - 1:
                t_right = word_records[p_end + 1]["start"]
            else:
                t_right = total_audio_sec - 0.6 # Fin du chant

            portion_weight = sum(word_records[k]["total_weight"] for k in range(p_start, p_end + 1))
            if t_right <= t_left + 0.5:
                # Espace trop restreint : estimer durée réaliste basée sur le poids GABC
                t_right = t_left + max(1.0, portion_weight * 0.55)

            avail_dur = max(0.5, t_right - t_left)

            # Étirer la durée disponible proportionnellement au poids GABC de chaque mot
            cur_t = t_left
            for k in range(p_start, p_end + 1):
                wr = word_records[k]
                w_dur = (wr["total_weight"] / portion_weight) * avail_dur
                wr["start"] = cur_t
                wr["end"] = cur_t + w_dur
                wr["is_stretched"] = True
                cur_t += w_dur
        else:
            i += 1

    # 7. GÉNÉRATION NOTE À NOTE (GARANTIE ZÉRO NOTE SAUTÉE)
    aligned_notes = []
    for wr in word_records:
        w_start = wr["start"]
        w_end = wr["end"]
        w_dur = max(0.1, w_end - w_start)
        notes = wr["notes"]
        w_weight = wr["total_weight"]

        cur_note_t = w_start
        for n in notes:
            note_dur = (n["duration_weight"] / w_weight) * w_dur
            aligned_notes.append({
                "note_index": n["note_index"],
                "pitch": n["pitch"],
                "word": wr["word"],
                "shape": n["shape"],
                "duration_weight": n["duration_weight"],
                "start": round(cur_note_t, 3),
                "end": round(cur_note_t + note_dur, 3),
                "duration": round(note_dur, 3),
                "confidence": round(min(1.0, max(0.1, float(np.exp(wr["score"])))), 2)
            })
            cur_note_t += note_dur

    # 8. RACCORDEMENT DES FINS DE MOT (AUCUNE ANTICIPATION SUR LA RESPIRATION)
    # L'affichage reste sur la dernière note du mot jusqu'au début exact du mot suivant
    for idx in range(len(aligned_notes) - 1):
        if aligned_notes[idx]["word"] != aligned_notes[idx + 1]["word"]:
            nxt_start = aligned_notes[idx + 1]["start"]
            if nxt_start > aligned_notes[idx]["end"]:
                aligned_notes[idx]["end"] = nxt_start
                aligned_notes[idx]["duration"] = round(nxt_start - aligned_notes[idx]["start"], 3)

    assert len(aligned_notes) == total_expected_notes, f"Erreur de compte : {len(aligned_notes)} != {total_expected_notes}"
    print(f"  [SUCCÈS] {len(aligned_notes)} notes alignées (100% de la partition GABC, 0 sautée)", flush=True)
    print(f"  Chant : {aligned_notes[0]['start']}s -> {aligned_notes[-1]['end']}s (Audio total: {total_audio_sec:.1f}s)", flush=True)

    # Sauvegarder {pid}_stamps.json
    out_file = os.path.join(OUTPUT_DIR, f"{pid}_stamps.json")
    with open(out_file, "w", encoding="utf-8") as f_out:
        json.dump(aligned_notes, f_out, ensure_ascii=False, indent=2)

    piece_copy = dict(piece)
    piece_copy["timestamps"] = aligned_notes
    piece_copy["audio_duration"] = round(total_audio_sec, 2)
    piece_copy["total_notes"] = len(aligned_notes)
    final_dataset.append(piece_copy)

# 9. Mettre à jour lab_data.js et lab_5_pieces.json
with open(LAB_DATA_JS, "w", encoding="utf-8") as f:
    f.write("const PIECES = " + json.dumps(final_dataset, ensure_ascii=False, indent=2) + ";\n")

with open(LAB_MANIFEST, "w", encoding="utf-8") as f:
    json.dump(final_dataset, f, ensure_ascii=False, indent=2)

print("\n[TERMINÉ] Alignement robuste exécuté avec succès. lab_data.js et final_timestamps mis à jour !", flush=True)
