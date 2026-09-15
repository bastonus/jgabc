"""
batch_process_all.py
Orchestrateur industriel de traitement par lots pour TOUTES les pièces et TOUTES les vidéos du corpus GABC :
1. Lecture du mapping complet js/gregorian_youtube_links.json (1 223 pièces, 3 646 vidéos)
2. Téléchargement audio automatisé via yt-dlp (16 kHz mono WAV) avec reprise sur erreur
3. Alignement acoustique MMS_FA avec :
   - Reconstitution universelle de la Doxologie (Gloria Patri + EUOUAE)
   - Détection automatique de la reprise du Refrain
   - Chunking mémoire 30s
   - Détection Voice Onset RMS
4. Application des règles de calibrage :
   - Plancher minimal de durée (0.16s / 0.28s)
   - Plafonnement des notes excessives (> 4.5x moyenne)
   - Continuité stricte en fin de mot (maintien de la note précédente)
5. Sauvegarde structurée dans final_timestamps/{pid}_{yt_id}_stamps.json
6. Tenue à jour du journal de progression batch_status.json et corpus_index.json
"""

import os
import sys
import re
import json
import time
import argparse
import subprocess
import copy
import torch
import torchaudio
import torchaudio.functional as F
import numpy as np

ALIGN_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.abspath(os.path.join(ALIGN_DIR, ".."))
ROOT_DIR = os.path.abspath(os.path.join(PIPELINE_DIR, ".."))

AUDIO_DIR = os.path.join(PIPELINE_DIR, "audio_corpus")
FINAL_STAMPS_DIR = os.path.join(ALIGN_DIR, "final_timestamps")
GABC_DIR = os.path.join(ROOT_DIR, "gabc")
LINKS_FILE = os.path.join(ROOT_DIR, "js", "gregorian_youtube_links.json")
STATUS_FILE = os.path.join(ALIGN_DIR, "batch_status.json")
INDEX_FILE = os.path.join(ALIGN_DIR, "corpus_index.json")

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(FINAL_STAMPS_DIR, exist_ok=True)

sys.path.insert(0, ALIGN_DIR)
sys.path.insert(0, PIPELINE_DIR)

from batch_align_gabc_v3 import tokenize_gabc_notes, duration_weight_for_token

# ── 1. Fonctions Utilitaires ──

def clean_latin_word(w):
    w = w.lower().replace("æ", "ae").replace("œ", "oe")
    w = re.sub(r"[áàâ]", "a", w)
    w = re.sub(r"[éèê]", "e", w)
    w = re.sub(r"[íìî]", "i", w)
    w = re.sub(r"[óòô]", "o", w)
    w = re.sub(r"[úùû]", "u", w)
    w = re.sub(r"[ý]", "y", w)
    return re.sub(r"[^a-z]", "", w)

def get_chunked_emissions(model, wav, chunk_sec=30):
    total_samples = wav.shape[1]
    chunk_samples = chunk_sec * 16000
    emissions = []
    with torch.inference_mode():
        for start in range(0, total_samples, chunk_samples):
            chunk = wav[:, start:start + chunk_samples]
            if chunk.shape[1] < 1600:
                continue
            em, _ = model(chunk)
            emissions.append(em)
    return torch.cat(emissions, dim=1)

def find_voice_onset(wav, t_approx, max_search=0.6):
    sr = 16000
    start_samp = max(0, int((t_approx - 0.05) * sr))
    end_samp = min(wav.shape[1], int((t_approx + max_search) * sr))
    if end_samp <= start_samp + 320:
        return t_approx

    seg = wav[0, start_samp:end_samp]
    frames = seg.unfold(0, 320, 160)
    rms = frames.pow(2).mean(dim=1).sqrt()
    noise_floor = rms.min().item()
    peak = rms.max().item()
    if peak <= noise_floor * 1.5:
        return t_approx

    thresh = noise_floor + 0.28 * (peak - noise_floor)
    for idx, e in enumerate(rms):
        if e.item() > thresh:
            return round((t_approx - 0.05) + idx * 0.01, 3)
    return t_approx

def parse_gabc_structure(gabc_source):
    if "%%" in gabc_source:
        _, notation = gabc_source.split("%%", 1)
    else:
        notation = gabc_source

    syllable_re = re.compile(r"([^()]*)\(([^()]*)\)")
    words = []
    current_word = {"word": "", "notes": [], "is_euouae": False, "is_gloria": False, "is_verse": False}

    in_verse = False
    in_euouae = False

    for match in syllable_re.finditer(notation):
        text_part, notes_part = match.group(1), match.group(2)
        has_leading_space = bool(re.match(r"^\s", text_part))

        if "<i>Ps.</i>" in text_part or "<i>T. P.</i>" in text_part:
            in_verse = True
        if "<eu>" in text_part:
            in_euouae = True

        clean_text = re.sub(r"<[^>]*>|\[[^\]]*\]", "", text_part)
        clean_text_word = re.sub(r"[^a-zA-ZáéíóúýæœÁÉÍÓÚÝÆŒ]", "", clean_text)
        notes = tokenize_gabc_notes(notes_part)

        if has_leading_space and current_word["word"] and current_word["notes"]:
            words.append(current_word)
            current_word = {
                "word": "",
                "notes": [],
                "is_euouae": in_euouae,
                "is_gloria": False,
                "is_verse": in_verse
            }

        current_word["word"] += clean_text_word
        current_word["notes"].extend(notes)
        current_word["is_euouae"] = in_euouae or current_word["is_euouae"]
        if clean_latin_word(current_word["word"]) in ["gloria", "patri"]:
            current_word["is_gloria"] = True
        current_word["is_verse"] = in_verse and not current_word["is_gloria"] and not in_euouae

        if "</eu>" in text_part:
            in_euouae = False

        if re.search(r"\s$", text_part) and current_word["word"] and current_word["notes"]:
            words.append(current_word)
            current_word = {
                "word": "",
                "notes": [],
                "is_euouae": in_euouae,
                "is_gloria": False,
                "is_verse": in_verse
            }

    if current_word["word"] and current_word["notes"]:
        words.append(current_word)

    return [w for w in words if w["notes"] and clean_latin_word(w["word"])]

# ── 2. Téléchargement Audio via yt-dlp ──

def download_audio_if_needed(yt_id, out_wav_path):
    if os.path.exists(out_wav_path) and os.path.getsize(out_wav_path) > 10000:
        return True

    url = f"https://www.youtube.com/watch?v={yt_id}"
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "wav",
        "--audio-quality", "0",
        "--postprocessor-args", "ffmpeg:-ac 1 -ar 16000",
        "-o", out_wav_path.replace(".wav", ".%(ext)s"),
        "--no-playlist",
        "--quiet", "--no-warnings",
        url
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        return os.path.exists(out_wav_path) and os.path.getsize(out_wav_path) > 10000
    except Exception as e:
        print(f"    [ERREUR TÉLÉCHARGEMENT {yt_id}] : {e}", flush=True)
        return False

# ── 3. Alignement Acoustique et Corrections ──

DOXOLOGY_WORDS_TEMPLATE = [
    "Gloria", "Patri", "et", "Filio", "et", "Spiritui", "Sancto",
    "Sicut", "erat", "in", "principio", "et", "nunc", "et", "semper",
    "et", "in", "saecula", "saeculorum", "Amen"
]

def build_candidate_sequence(code, antiphon_gabc, verse_gabc, gloria_gabc, euouae_gabc):
    objs = []
    for w in antiphon_gabc:
        objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})

    if verse_gabc and "V" in code:
        for w in verse_gabc:
            objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})

    if code == "H_AVR":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code == "H_AVDR":
        for w_text in DOXOLOGY_WORDS_TEMPLATE:
            ref = None
            if w_text == "Gloria" and len(gloria_gabc) > 0: ref = gloria_gabc[0]
            elif w_text == "Patri" and len(gloria_gabc) > 1: ref = gloria_gabc[1]
            elif w_text in ["saeculorum", "Amen"]: ref = euouae_gabc
            objs.append({"word": w_text, "section": "doxology", "gabc_ref": ref})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code == "H_AVD":
        for w_text in DOXOLOGY_WORDS_TEMPLATE:
            ref = None
            if w_text == "Gloria" and len(gloria_gabc) > 0: ref = gloria_gabc[0]
            elif w_text == "Patri" and len(gloria_gabc) > 1: ref = gloria_gabc[1]
            elif w_text in ["saeculorum", "Amen"]: ref = euouae_gabc
            objs.append({"word": w_text, "section": "doxology", "gabc_ref": ref})

    elif code == "H_AVRDR":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise_1", "gabc_ref": w})
        for w_text in DOXOLOGY_WORDS_TEMPLATE:
            ref = None
            if w_text == "Gloria" and len(gloria_gabc) > 0: ref = gloria_gabc[0]
            elif w_text == "Patri" and len(gloria_gabc) > 1: ref = gloria_gabc[1]
            elif w_text in ["saeculorum", "Amen"]: ref = euouae_gabc
            objs.append({"word": w_text, "section": "doxology", "gabc_ref": ref})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise_2", "gabc_ref": w})

    elif code == "H_AR":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    return objs

def align_audio_with_gabc(model, dictionary, wav_path, gabc_source):
    waveform, sr = torchaudio.load(wav_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != 16000:
        waveform = torchaudio.functional.resample(waveform, sr, 16000)
    total_audio_sec = waveform.shape[1] / 16000.0

    gabc_words = parse_gabc_structure(gabc_source)
    if not gabc_words:
        return None

    antiphon_gabc = [w for w in gabc_words if not w["is_verse"] and not w["is_gloria"] and not w["is_euouae"]]
    verse_gabc = [w for w in gabc_words if w["is_verse"]]
    gloria_gabc = [w for w in gabc_words if w["is_gloria"]]
    euouae_gabc = [w for w in gabc_words if w["is_euouae"]]
    has_dox_in_score = bool(gloria_gabc or euouae_gabc)

    candidate_codes = []
    if verse_gabc:
        candidate_codes.append(("H_AVR", "A -> V -> Refrain (Refrain direct après verset, Gloria omis)"))
        if has_dox_in_score:
            candidate_codes.append(("H_AVDR", "A -> V -> Doxologie -> Refrain (Classique complet)"))
            candidate_codes.append(("H_AVD", "A -> V -> Doxologie (Sans reprise finale)"))
            candidate_codes.append(("H_AVRDR", "A -> V -> Refrain -> Doxologie -> Refrain (Solennel)"))
        candidate_codes.append(("H_AV", "A -> V (Court)"))
    else:
        candidate_codes.append(("H_AR", "A -> Refrain"))
        candidate_codes.append(("H_A", "A (Seul)"))

    emissions = get_chunked_emissions(model, waveform, chunk_sec=30)
    log_probs = emissions.log_softmax(dim=-1)
    input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
    frame_dur = 0.02

    best_cand = None
    best_score = -999.0
    best_data = None

    for code, desc in candidate_codes:
        word_objs = build_candidate_sequence(code, antiphon_gabc, verse_gabc, gloria_gabc, euouae_gabc)
        word_spans = []
        flat_tokens = []
        for item in word_objs:
            cl = clean_latin_word(item["word"])
            toks = [dictionary[c] for c in cl if c in dictionary]
            if toks:
                word_spans.append((item, len(flat_tokens), len(flat_tokens) + len(toks)))
                flat_tokens.extend(toks)

        targets = torch.tensor([flat_tokens], dtype=torch.int32)
        target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
        paths, scores = F.forced_align(log_probs, targets, input_lengths, target_lengths, blank=0)
        spans = F.merge_tokens(paths[0], scores[0])
        avg_score = float(scores[0].mean().item())

        t_start = spans[0].start * frame_dur if len(spans) > 0 else 0
        t_end = spans[-1].end * frame_dur if len(spans) > 0 else 0
        coverage = (t_end - t_start) / total_audio_sec

        num_notes_approx = len(flat_tokens) * 0.8
        avg_note_dur = total_audio_sec / max(1, num_notes_approx)
        is_tempo_realistic = (0.20 <= avg_note_dur <= 0.85)

        if is_tempo_realistic and coverage >= 0.85 and avg_score > best_score:
            best_score = avg_score
            best_cand = (code, desc)
            best_data = (word_spans, spans)

    if best_cand is None:
        best_cand = candidate_codes[0]
        word_objs = build_candidate_sequence(best_cand[0], antiphon_gabc, verse_gabc, gloria_gabc, euouae_gabc)
        word_spans = []
        flat_tokens = []
        for item in word_objs:
            cl = clean_latin_word(item["word"])
            toks = [dictionary[c] for c in cl if c in dictionary]
            if toks:
                word_spans.append((item, len(flat_tokens), len(flat_tokens) + len(toks)))
                flat_tokens.extend(toks)
        targets = torch.tensor([flat_tokens], dtype=torch.int32)
        target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
        paths, scores = F.forced_align(log_probs, targets, input_lengths, target_lengths, blank=0)
        spans = F.merge_tokens(paths[0], scores[0])
        best_data = (word_spans, spans)

    word_spans, spans = best_data
    chosen_code = best_cand[0]

    for item, s_idx, e_idx in word_spans:
        if s_idx < len(spans) and (e_idx - 1) < len(spans):
            w_raw_start = spans[s_idx].start * frame_dur
            w_raw_end = spans[e_idx - 1].end * frame_dur
            w_score = float(sum(spans[i].score for i in range(s_idx, e_idx)) / max(1, e_idx - s_idx))
        else:
            w_raw_start, w_raw_end, w_score = 0.0, total_audio_sec, -5.0

        w_start_onset = find_voice_onset(waveform, w_raw_start)
        item["start"] = round(w_start_onset, 3)
        item["end"] = round(max(item["start"] + 0.1, w_raw_end), 3)
        item["duration"] = round(item["end"] - item["start"], 3)
        item["confidence"] = round(min(1.0, max(0.1, float(np.exp(w_score)))), 2)

    raw_notes = []
    global_note_idx = 0

    # Antienne
    for item, _, _ in word_spans:
        if item["section"] == "antiphon":
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            total_w = sum(n["duration_weight"] for n in notes)
            cur_t = item["start"]
            w_dur = item["duration"]
            for n in notes:
                nd = (n["duration_weight"] / total_w) * w_dur
                raw_notes.append({
                    "note_index": global_note_idx,
                    "token": n["token"],
                    "pitch": n["token"][0] if n["token"] else "g",
                    "word": w_ref["word"],
                    "section": "antiphon",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": ("." in n["token"]),
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": item["confidence"],
                    "sung": True
                })
                cur_t += nd
                global_note_idx += 1

    # Verset
    last_verse_end = raw_notes[-1]["end"] if raw_notes else 0.0
    for item, _, _ in word_spans:
        if item["section"] == "verse":
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            total_w = sum(n["duration_weight"] for n in notes)
            cur_t = item["start"]
            w_dur = item["duration"]
            for n in notes:
                nd = (n["duration_weight"] / total_w) * w_dur
                raw_notes.append({
                    "note_index": global_note_idx,
                    "token": n["token"],
                    "pitch": n["token"][0] if n["token"] else "g",
                    "word": w_ref["word"],
                    "section": "verse",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": ("." in n["token"]),
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": item["confidence"],
                    "sung": True
                })
                cur_t += nd
                global_note_idx += 1
            last_verse_end = cur_t

    # Doxologie
    has_sung_dox = ("D" in chosen_code)
    if gloria_gabc:
        if has_sung_dox:
            dox_items = {item["word"]: item for item, _, _ in word_spans if item["section"] == "doxology"}
            t_glo_start = dox_items.get("Gloria", {}).get("start", last_verse_end)
            t_pat_end = dox_items.get("Patri", {}).get("end", t_glo_start + 2.0)
            glo_span = max(1.0, t_pat_end - t_glo_start)
            all_glo_notes = []
            for gw in gloria_gabc: all_glo_notes.extend(gw["notes"])
            total_gw = sum(n["duration_weight"] for n in all_glo_notes)
            cur_t = t_glo_start
            for n in all_glo_notes:
                nd = (n["duration_weight"] / total_gw) * glo_span
                raw_notes.append({
                    "note_index": global_note_idx,
                    "token": n["token"],
                    "pitch": n["token"][0] if n["token"] else "g",
                    "word": "Glória Patri",
                    "section": "gloria_patri",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": ("." in n["token"]),
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": 0.85,
                    "sung": True
                })
                cur_t += nd
                global_note_idx += 1
        else:
            for gw in gloria_gabc:
                for n in gw["notes"]:
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["token"][0] if n["token"] else "g",
                        "word": "Glória Patri",
                        "section": "gloria_patri",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": ("." in n["token"]),
                        "start": round(last_verse_end, 3),
                        "end": round(last_verse_end, 3),
                        "duration": 0.0,
                        "confidence": 0.0,
                        "sung": False
                    })
                    global_note_idx += 1

    if euouae_gabc:
        if has_sung_dox:
            dox_items = {item["word"]: item for item, _, _ in word_spans if item["section"] == "doxology"}
            t_saec_start = dox_items.get("saeculorum", {}).get("start", last_verse_end + 10.0)
            t_amen_end = dox_items.get("Amen", {}).get("end", t_saec_start + 4.0)
            eu_span = max(1.5, t_amen_end - t_saec_start)
            all_eu_notes = []
            for ew in euouae_gabc: all_eu_notes.extend(ew["notes"])
            total_ew = sum(n["duration_weight"] for n in all_eu_notes)
            cur_t = t_saec_start
            for n in all_eu_notes:
                nd = (n["duration_weight"] / total_ew) * eu_span
                raw_notes.append({
                    "note_index": global_note_idx,
                    "token": n["token"],
                    "pitch": n["token"][0] if n["token"] else "g",
                    "word": "EUOUAE",
                    "section": "euouae",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": ("." in n["token"]),
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": 0.85,
                    "sung": True
                })
                cur_t += nd
                global_note_idx += 1
        else:
            for ew in euouae_gabc:
                for n in ew["notes"]:
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["token"][0] if n["token"] else "g",
                        "word": "EUOUAE",
                        "section": "euouae",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": ("." in n["token"]),
                        "start": round(last_verse_end, 3),
                        "end": round(last_verse_end, 3),
                        "duration": 0.0,
                        "confidence": 0.0,
                        "sung": False
                    })
                    global_note_idx += 1

    # Reprise du Refrain
    reprise_data = None
    reprise_items = [item for item, _, _ in word_spans if item["section"] in ["reprise", "reprise_1", "reprise_2"]]
    if reprise_items:
        r_start = reprise_items[0]["start"]
        r_end = reprise_items[-1]["end"]
        reprise_notes = []
        r_note_idx = 0
        for item in reprise_items:
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            tot_w = sum(n["duration_weight"] for n in notes)
            cur_t = item["start"]
            w_dur = item["duration"]
            for n in notes:
                nd = (n["duration_weight"] / tot_w) * w_dur
                reprise_notes.append({
                    "note_index": r_note_idx,
                    "token": n["token"],
                    "pitch": n["token"][0] if n["token"] else "g",
                    "word": w_ref["word"],
                    "section": "reprise",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": ("." in n["token"]),
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": item["confidence"]
                })
                cur_t += nd
                r_note_idx += 1

        reprise_data = {
            "start": r_start,
            "end": r_end,
            "duration": round(r_end - r_start, 3),
            "antiphon_note_count": len(reprise_notes),
            "reprise_after_section": "verse" if chosen_code == "H_AVR" else "doxology",
            "skips_doxology": (not has_sung_dox),
            "notes": reprise_notes
        }

    # Règle d'or de fin de mot
    for idx in range(len(raw_notes) - 1):
        if raw_notes[idx]["sung"] and raw_notes[idx + 1]["sung"]:
            if raw_notes[idx]["word"] != raw_notes[idx + 1]["word"]:
                nxt = raw_notes[idx + 1]["start"]
                if nxt > raw_notes[idx]["end"]:
                    raw_notes[idx]["end"] = nxt
                    raw_notes[idx]["duration"] = round(nxt - raw_notes[idx]["start"], 3)

    # Corrections locales
    corrected_notes = copy.deepcopy(raw_notes)
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

    # Triplet
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
            corrections_log.append({"type": "triplet_saute", "note_index": i})
            i += 3
        else:
            i += 1

    # RÈGLES NOTES TROP COURTES / TROP LONGUES SUPPRIMÉES SELON DEMANDE UTILISATEUR
    # Conservation uniquement de : Triplet (note sautée) et Règle d'or de fin de mot

    # Fin de mot
    for k in range(len(corrected_notes) - 1):
        if corrected_notes[k].get("sung", True) and corrected_notes[k + 1].get("sung", True):
            if corrected_notes[k]["word"] != corrected_notes[k + 1]["word"]:
                nxt_start = corrected_notes[k + 1]["start"]
                if nxt_start > corrected_notes[k]["end"]:
                    corrected_notes[k]["end"] = nxt_start
                    corrected_notes[k]["duration"] = round(nxt_start - corrected_notes[k]["start"], 3)

    true_audio_end = reprise_data["end"] if reprise_data else max(n["end"] for n in corrected_notes if n.get("sung", True))

    return {
        "raw_notes": raw_notes,
        "timestamps": corrected_notes,
        "corrections": corrections_log,
        "reprise": reprise_data,
        "structure": chosen_code,
        "structure_desc": best_cand[1],
        "stats": {
            "total_notes": len(corrected_notes),
            "sung_notes": len(sung_notes),
            "avg_normal_dur": round(avg_normal, 3),
            "avg_pointed_dur": round(avg_pointed, 3),
            "thresh_normal_4_5x": round(thresh_normal, 3),
            "thresh_pointed_4_5x": round(thresh_pointed, 3),
            "audio_start": sung_notes[0]["start"] if sung_notes else 0.0,
            "audio_end": round(true_audio_end, 3)
        }
    }

def run_batch(limit=None, start_id=None, primary_only=False):
    print("="*70, flush=True)
    print("DÉMARRAGE DU BATCH ACOUSTIQUE POUR TOUTES LES PIÈCES ET VIDÉOS", flush=True)
    print("="*70, flush=True)

    with open(LINKS_FILE, "r", encoding="utf-8") as f:
        youtube_db = json.load(f)

    print(f"Total pièces dans le catalogue : {len(youtube_db)}", flush=True)

    status = {
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_pieces": len(youtube_db),
        "processed_videos": 0,
        "skipped_videos": 0,
        "failed_videos": 0,
        "errors": []
    }
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as sf:
                old_status = json.load(sf)
                status.update({k: old_status[k] for k in ["processed_videos", "skipped_videos", "failed_videos", "errors"] if k in old_status})
        except:
            pass

    corpus_index = {}
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE, "r", encoding="utf-8") as idx_f:
                corpus_index = json.load(idx_f)
        except:
            pass

    print("[IA] Chargement du modèle MMS_FA...", flush=True)
    bundle = torchaudio.pipelines.MMS_FA
    mms_model = bundle.get_model()
    mms_dict = bundle.get_dict()
    print("  [OK] Modèle prêt.", flush=True)

    started = (start_id is None)
    pieces_count = 0

    for pid, p_data in youtube_db.items():
        if not started:
            if pid == start_id:
                started = True
            else:
                continue

        gabc_path = os.path.join(GABC_DIR, f"{pid}.gabc")
        if not os.path.exists(gabc_path):
            continue

        with open(gabc_path, "r", encoding="utf-8") as gf:
            gabc_src = gf.read()

        audios = p_data.get("audios", [])
        if not audios:
            continue

        if primary_only:
            audios = audios[:1]

        print(f"\n[{pid}] {p_data.get('incipit', 'Incipit')} ({len(audios)} vidéo(s))...", flush=True)

        for v_idx, aud in enumerate(audios):
            yt_id = aud.get("id")
            if not yt_id:
                continue

            # FILTRE STRICT DEMANDÉ PAR L'UTILISATEUR :
            # Travailler uniquement avec les pièces de GradualeProject et Marek Klein
            aud_source = (str(aud.get("source", "")) + " " + str(aud.get("channel", ""))).lower()
            if not ("gradualeproject" in aud_source or "marek klein" in aud_source or "gradvale novvm" in aud_source):
                # On conserve les liens d'abbayes dans la DB mais on ne calcule pas l'alignement
                continue

            # Noms de fichiers
            wav_path = os.path.join(AUDIO_DIR, f"{pid}_{yt_id}.wav")
            # Pour la vidéo primaire, vérifier aussi si {pid}.wav existe
            if v_idx == 0 and os.path.exists(os.path.join(AUDIO_DIR, f"{pid}.wav")):
                wav_path = os.path.join(AUDIO_DIR, f"{pid}.wav")

            stamp_filename = f"{pid}_{yt_id}_stamps.json"
            stamp_path = os.path.join(FINAL_STAMPS_DIR, stamp_filename)

            # Vérifier si déjà calculé
            if os.path.exists(stamp_path) and os.path.getsize(stamp_path) > 500:
                print(f"  [DÉJÀ FAIT] Vidéo {yt_id} ({aud.get('channel', '')}) : déjà alignée.", flush=True)
                status["skipped_videos"] += 1
                continue

            print(f"  --> Traitement vidéo {v_idx+1}/{len(audios)} : {yt_id} ({aud.get('channel', 'Chaine inconnue')})...", flush=True)

            # 1. Téléchargement si nécessaire
            ok_audio = download_audio_if_needed(yt_id, wav_path)
            if not ok_audio:
                print(f"    [SKIP] Impossible d'obtenir l'audio pour {yt_id}.", flush=True)
                status["failed_videos"] += 1
                status["errors"].append({"pid": pid, "yt_id": yt_id, "reason": "download_failed"})
                continue

            # 2. Alignement acoustique
            try:
                t0 = time.time()
                align_res = align_audio_with_gabc(mms_model, mms_dict, wav_path, gabc_src)
                if align_res is None or not align_res["timestamps"]:
                    print(f"    [ÉCHEC ALIGNEMENT] Aucune note alignée pour {yt_id}.", flush=True)
                    status["failed_videos"] += 1
                    continue

                # Sauvegarde du fichier de timestamps
                with open(stamp_path, "w", encoding="utf-8") as sf:
                    json.dump(align_res, sf, indent=2, ensure_ascii=False)

                # Si primaire, sauver aussi {pid}_stamps.json
                if v_idx == 0:
                    pri_stamp_path = os.path.join(FINAL_STAMPS_DIR, f"{pid}_stamps.json")
                    with open(pri_stamp_path, "w", encoding="utf-8") as psf:
                        json.dump(align_res, psf, indent=2, ensure_ascii=False)

                # Indexation
                corpus_index[f"{pid}_{yt_id}"] = {
                    "piece_id": pid,
                    "youtube_id": yt_id,
                    "channel": aud.get("channel", ""),
                    "title": aud.get("title", ""),
                    "notes_count": len(align_res["timestamps"]),
                    "audio_span": [align_res["stats"]["audio_start"], align_res["stats"]["audio_end"]],
                    "has_reprise": (align_res["reprise"] is not None),
                    "stamp_file": stamp_filename
                }
                with open(INDEX_FILE, "w", encoding="utf-8") as idxf:
                    json.dump(corpus_index, idxf, indent=2, ensure_ascii=False)

                status["processed_videos"] += 1
                print(f"    [ALIGNÉ en {time.time()-t0:.1f}s] {len(align_res['timestamps'])} notes sauvegardées dans {stamp_filename}", flush=True)

            except Exception as e:
                print(f"    [ERREUR ALIGNEMENT {yt_id}] : {e}", flush=True)
                status["failed_videos"] += 1
                status["errors"].append({"pid": pid, "yt_id": yt_id, "reason": str(e)})

            # Sauvegarde régulière de l'état
            with open(STATUS_FILE, "w", encoding="utf-8") as sf:
                json.dump(status, sf, indent=2, ensure_ascii=False)

            # Pause polie entre vidéos pour ne pas saturer YouTube
            time.sleep(2.0)

        pieces_count += 1
        if limit and pieces_count >= limit:
            print(f"\n[LIMITE ATTEINTE] {limit} pièces traitées.", flush=True)
            break

    print("\n" + "="*70, flush=True)
    print(f"FIN DU BATCH : {status['processed_videos']} vidéo(s) alignée(s), {status['skipped_videos']} passée(s), {status['failed_videos']} échouée(s).", flush=True)
    print("="*70, flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch orchestrator pour toutes les pièces et vidéos GABC.")
    parser.add_argument("--limit", type=int, default=None, help="Nombre max de pièces à traiter")
    parser.add_argument("--start-id", type=str, default=None, help="ID de la pièce où commencer")
    parser.add_argument("--primary-only", action="store_true", help="Ne traiter que la 1ère vidéo de chaque pièce")
    args = parser.parse_args()

    run_batch(limit=args.limit, start_id=args.start_id, primary_only=args.primary_only)
