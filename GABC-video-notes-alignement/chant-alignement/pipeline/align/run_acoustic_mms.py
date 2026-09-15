"""
run_acoustic_mms.py
Alignement acoustique forcé avec MMS_FA pour le corpus grégorien.
Intègre :
1. Parser GABC mélismatique avancé (isolation stricte des rubriques, asterismes, phrases par barres et virgules).
2. Détection dynamique à chaque double barre (::) :
   - Structure Alleluia : Intonation soliste, Alleluia choeur avec jubilé, Verset, Reprise.
   - Structure Introït / Communio : Antienne, Verset, Doxologie (Gloria Patri), Reprise.
3. Règle d'or de continuité mélismatique :
   - Tout mot portant un mélisme s'étend naturellement jusqu'au début vocal du mot suivant.
4. Gouverneur anti-panique des mélismes denses :
   - Détection des notes physiques chantées (tempo liturgique réaliste >= 0.22s/note).
   - Détection des répétitions optionnelles non chantées (ex: jubilé imprimé après * en fin de verset).
   - Les notes non chantées sont marquées sung=False (durée 0), supprimant tout défilement accéléré.
5. Reconstitution des notes individuelles de la reprise pour rebouclage instantané.
6. Métadonnées d'intonation pour les Alleluias solistes.
7. Règle d'or de fin de mot : maintien de la note précédente pendant les respirations liturgiques.
"""

import os
import sys
import re
import json
import time
import torch
import torchaudio
import torchaudio.functional as F
import numpy as np

ALIGN_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.abspath(os.path.join(ALIGN_DIR, ".."))
AUDIO_DIR = os.path.join(PIPELINE_DIR, "audio_corpus")
OUTPUT_DIR = os.path.join(ALIGN_DIR, "final_timestamps")
MANIFEST_PATH = os.path.join(ALIGN_DIR, "lab_5_pieces.json")
RAW_OUT_PATH = os.path.join(ALIGN_DIR, "raw_acoustic_stamps.json")
REPRISE_FILE = os.path.join(ALIGN_DIR, "reprise_metadata.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("[1/4] Chargement du modèle acoustique MMS_FA...", flush=True)
bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model()
dictionary = bundle.get_dict()
print("  [OK] MMS_FA chargé avec succès.", flush=True)

DOXOLOGY_WORDS_TEMPLATE = [
    "Gloria", "Patri", "et", "Filio", "et", "Spiritui", "Sancto",
    "Sicut", "erat", "in", "principio", "et", "nunc", "et", "semper",
    "et", "in", "saecula", "saeculorum", "Amen"
]

def clean_latin_word(w):
    w = w.lower().replace("æ", "ae").replace("œ", "oe")
    w = re.sub(r"[áàâ]", "a", w)
    w = re.sub(r"[éèêë]", "e", w)
    w = re.sub(r"[íìîï]", "i", w)
    w = re.sub(r"[óòô]", "o", w)
    w = re.sub(r"[úùû]", "u", w)
    w = re.sub(r"[ý]", "y", w)
    return re.sub(r"[^a-z]", "", w)

def tokenize_gabc_notes(gabc_notes):
    clean = re.sub(r"\[[^\]]*\]", "", gabc_notes)
    tokens = [t for t in re.split(r"[/!\s]+", clean) if t]
    parsed = []
    for t in tokens:
        for m in re.finditer(r"([a-mA-M][.'_~>]*|\.{1,2}|_{1,2})", t):
            tok = m.group(1)
            pitch = tok[0] if tok[0] in "abcdefghijklmABCDEFGHIJKLM" else "g"
            is_pt = ("." in tok)
            is_ep = ("_" in tok)
            w = 1.0
            if is_pt: w = 2.0
            elif is_ep: w = 1.3
            elif "~" in tok: w = 0.8
            parsed.append({
                "token": tok,
                "pitch": pitch,
                "is_pointed": is_pt,
                "duration_weight": w
            })
    return parsed

def parse_gabc_structure_advanced(gabc_source):
    if "%%" in gabc_source:
        _, notation = gabc_source.split("%%", 1)
    else:
        notation = gabc_source

    notation = re.sub(r"<sp>V/?</sp>\.?\s*", " [VERSE_START] ", notation, flags=re.IGNORECASE)
    notation = re.sub(r"<i>Ps\.?</i>\s*", " [VERSE_START] ", notation, flags=re.IGNORECASE)
    notation = re.sub(r"~?<i>i{1,3}j\.?</i>", " ", notation, flags=re.IGNORECASE)
    notation = re.sub(r"\{\*\}", " [ASTERISK] ", notation)

    syllable_re = re.compile(r"([^()]*)\(([^()]*)\)")
    words = []
    current_word = {"word": "", "notes": [], "phrases": [], "is_verse": False, "is_gloria": False, "is_euouae": False}
    current_phrase_notes = []
    in_verse = False
    in_euouae = False

    for match in syllable_re.finditer(notation):
        text_part, notes_part = match.group(1), match.group(2)
        has_asterisk = "[ASTERISK]" in text_part or "*" in text_part
        if "[ASTERISK]" in text_part:
            text_part = text_part.replace("[ASTERISK]", "")

        if "[VERSE_START]" in text_part:
            in_verse = True
            text_part = text_part.replace("[VERSE_START]", "")

        if "<eu>" in text_part:
            in_euouae = True
        if "</eu>" in text_part:
            in_euouae = False

        clean_text = re.sub(r"<[^>]*>|\[[^\]]*\]|[*†]", "", text_part)
        clean_word_part = re.sub(r"[^a-zA-ZáéíóúýæœÁÉÍÓÚÝÆŒ]", "", clean_text)
        has_leading_space = bool(re.match(r"^\s+", text_part))
        is_bar = notes_part.strip() in [",", ";", ":", "::", "`"]

        sub_chunks = notes_part.split(",") if "," in notes_part and not is_bar else [notes_part]

        for s_idx, chunk in enumerate(sub_chunks):
            if is_bar:
                if current_phrase_notes:
                    current_word["phrases"].append({
                        "bar_type": notes_part.strip(),
                        "notes": current_phrase_notes,
                        "has_asterisk": has_asterisk
                    })
                    current_phrase_notes = []
                continue

            chunk_notes = tokenize_gabc_notes(chunk)
            if not chunk_notes:
                continue

            for n in chunk_notes:
                n["has_asterisk"] = has_asterisk

            if s_idx == 0:
                if not clean_word_part:
                    if current_word["word"]:
                        current_phrase_notes.extend(chunk_notes)
                        current_word["notes"].extend(chunk_notes)
                    elif words:
                        words[-1]["notes"].extend(chunk_notes)
                        if words[-1]["phrases"]:
                            words[-1]["phrases"][-1]["notes"].extend(chunk_notes)
                        else:
                            words[-1]["phrases"].append({
                                "bar_type": None,
                                "notes": chunk_notes,
                                "has_asterisk": has_asterisk
                            })
                    continue

                if has_leading_space and current_word["word"] and current_word["notes"]:
                    if current_phrase_notes:
                        current_word["phrases"].append({
                            "bar_type": None,
                            "notes": current_phrase_notes,
                            "has_asterisk": False
                        })
                        current_phrase_notes = []
                    words.append(current_word)
                    current_word = {
                        "word": "",
                        "notes": [],
                        "phrases": [],
                        "is_verse": in_verse,
                        "is_gloria": False,
                        "is_euouae": in_euouae
                    }

                current_word["word"] += clean_word_part
                current_word["is_verse"] = in_verse
                current_word["is_euouae"] = in_euouae
                cl = clean_latin_word(current_word["word"])
                if cl in ["gloria", "patri"]:
                    current_word["is_gloria"] = True
                current_phrase_notes.extend(chunk_notes)
                current_word["notes"].extend(chunk_notes)
            else:
                if current_phrase_notes:
                    if current_word["word"]:
                        current_word["phrases"].append({
                            "bar_type": ",",
                            "notes": current_phrase_notes,
                            "has_asterisk": has_asterisk
                        })
                    elif words and words[-1]["phrases"]:
                        words[-1]["phrases"].append({
                            "bar_type": ",",
                            "notes": current_phrase_notes,
                            "has_asterisk": has_asterisk
                        })
                    current_phrase_notes = []
                current_phrase_notes.extend(chunk_notes)
                if current_word["word"]:
                    current_word["notes"].extend(chunk_notes)
                elif words:
                    words[-1]["notes"].extend(chunk_notes)

        if re.search(r"\s+$", text_part) and current_word["word"] and current_word["notes"]:
            if current_phrase_notes:
                current_word["phrases"].append({
                    "bar_type": None,
                    "notes": current_phrase_notes,
                    "has_asterisk": False
                })
                current_phrase_notes = []
            words.append(current_word)
            current_word = {
                "word": "",
                "notes": [],
                "phrases": [],
                "is_verse": in_verse,
                "is_gloria": False,
                "is_euouae": in_euouae
            }

    if current_phrase_notes:
        current_word["phrases"].append({
            "bar_type": None,
            "notes": current_phrase_notes,
            "has_asterisk": False
        })
    if current_word["word"] and current_word["notes"]:
        cl = clean_latin_word(current_word["word"])
        if cl in ["gloria", "patri"]:
            current_word["is_gloria"] = True
        words.append(current_word)

    return words

def get_chunked_emissions(wav, chunk_sec=30):
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

def build_candidate_sequence(code, antiphon_gabc, verse_gabc, gloria_gabc, euouae_gabc):
    objs = []
    if code == "H_AA_V_A":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "intonation", "gabc_ref": w})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        for w in verse_gabc:
            objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code in ["H_AVR", "H_A_V_A"]:
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        if verse_gabc:
            for w in verse_gabc:
                objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code == "H_AVDR":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        if verse_gabc:
            for w in verse_gabc:
                objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})
        for w_text in DOXOLOGY_WORDS_TEMPLATE:
            ref = None
            if w_text == "Gloria" and len(gloria_gabc) > 0: ref = gloria_gabc[0]
            elif w_text == "Patri" and len(gloria_gabc) > 1: ref = gloria_gabc[1]
            elif w_text in ["saeculorum", "Amen"] and euouae_gabc: ref = euouae_gabc[0]
            objs.append({"word": w_text, "section": "doxology", "gabc_ref": ref})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code == "H_AVD":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        if verse_gabc:
            for w in verse_gabc:
                objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})
        for w_text in DOXOLOGY_WORDS_TEMPLATE:
            ref = None
            if w_text == "Gloria" and len(gloria_gabc) > 0: ref = gloria_gabc[0]
            elif w_text == "Patri" and len(gloria_gabc) > 1: ref = gloria_gabc[1]
            elif w_text in ["saeculorum", "Amen"] and euouae_gabc: ref = euouae_gabc[0]
            objs.append({"word": w_text, "section": "doxology", "gabc_ref": ref})

    elif code in ["H_AV", "H_A_V"]:
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        if verse_gabc:
            for w in verse_gabc:
                objs.append({"word": w["word"], "section": "verse", "gabc_ref": w})

    elif code == "H_AR":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "reprise", "gabc_ref": w})

    elif code == "H_A":
        for w in antiphon_gabc:
            objs.append({"word": w["word"], "section": "antiphon", "gabc_ref": w})

    return objs

def process_piece(piece):
    pid = piece["id"]
    wav_path = os.path.join(AUDIO_DIR, f"{pid}.wav")
    print(f"\n==========================================", flush=True)
    print(f"[{pid}] Alignement de {piece['incipit']} ({piece['part']})...", flush=True)

    if not os.path.exists(wav_path):
        print(f"  [ERREUR] Audio manquant : {wav_path}", flush=True)
        return None

    waveform, sr = torchaudio.load(wav_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != 16000:
        waveform = torchaudio.functional.resample(waveform, sr, 16000)
    total_audio_sec = waveform.shape[1] / 16000.0

    gabc_words = parse_gabc_structure_advanced(piece["gabc_src"])
    total_visual_notes = sum(len(w["notes"]) for w in gabc_words)
    print(f"  Audio : {total_audio_sec:.2f}s | GABC : {len(gabc_words)} mots, {total_visual_notes} notes visuelles.", flush=True)

    is_alleluia = (piece.get("part") == "Alleluia" or "alleluia" in clean_latin_word(gabc_words[0]["word"]))

    antiphon_gabc = [w for w in gabc_words if not w["is_verse"] and not w["is_gloria"] and not w["is_euouae"]]
    verse_gabc = [w for w in gabc_words if w["is_verse"] and not w["is_gloria"] and not w["is_euouae"]]
    gloria_gabc = [w for w in gabc_words if w["is_gloria"]]
    euouae_gabc = [w for w in gabc_words if w["is_euouae"] or ("euouae" in clean_latin_word(w["word"]))]
    has_dox_in_score = bool(gloria_gabc)

    candidate_codes = []
    if is_alleluia:
        candidate_codes.append(("H_AA_V_A", "Intonation -> Choeur Alleluia -> Verset -> Reprise"))
        candidate_codes.append(("H_A_V_A", "Choeur Alleluia -> Verset -> Reprise"))
        candidate_codes.append(("H_A_V", "Choeur Alleluia -> Verset (Sans Reprise)"))
    elif verse_gabc:
        candidate_codes.append(("H_AVR", "A -> V -> Refrain (Gloria omis)"))
        if has_dox_in_score:
            candidate_codes.append(("H_AVDR", "A -> V -> Doxologie -> Refrain (Classique complet)"))
            candidate_codes.append(("H_AVD", "A -> V -> Doxologie (Sans reprise finale)"))
        candidate_codes.append(("H_AV", "A -> V (Court)"))
    else:
        candidate_codes.append(("H_AR", "A -> Refrain"))
        candidate_codes.append(("H_A", "A (Seul)"))

    # 1. Calcul des émissions MMS_FA
    print("  Calcul des émissions MMS_FA par fenêtres mémoires...", flush=True)
    t0 = time.time()
    emissions = get_chunked_emissions(waveform, chunk_sec=30)
    log_probs = emissions.log_softmax(dim=-1)
    print(f"  Émissions calculées en {time.time() - t0:.2f}s ({log_probs.shape[1]} trames).", flush=True)

    input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
    frame_dur = 0.02

    best_cand = None
    best_score = -999.0
    best_data = None

    print("  Évaluation acoustique aux doubles barres (::)...", flush=True)
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

        tot_cand_notes = sum(len(item["gabc_ref"]["notes"]) for item in word_objs if item.get("gabc_ref") and isinstance(item["gabc_ref"], dict) and "notes" in item["gabc_ref"])
        if tot_cand_notes > 0:
            avg_note_dur = total_audio_sec / tot_cand_notes
        else:
            avg_note_dur = total_audio_sec / max(1, len(flat_tokens) * 0.8)
        is_tempo_realistic = (0.20 <= avg_note_dur <= 0.95)

        print(f"    [{code:9}] {desc:48} : score={avg_score:6.3f} couv={coverage*100:4.1f}% note_dur={avg_note_dur:.2f}s [{'OK' if is_tempo_realistic else 'REJET'}]", flush=True)

        if is_tempo_realistic and coverage >= 0.82 and avg_score > best_score:
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

    print(f"  ==> STRUCTURE ÉLUE : [{best_cand[0]}] {best_cand[1]} (score: {best_score:.3f})", flush=True)

    word_spans, spans = best_data
    chosen_code = best_cand[0]

    # Déterminer les timestamps initiaux par mot
    for i, (item, s_idx, e_idx) in enumerate(word_spans):
        if s_idx < len(spans) and (e_idx - 1) < len(spans):
            w_raw_start = spans[s_idx].start * frame_dur
            w_raw_end = spans[e_idx - 1].end * frame_dur
            w_score = float(sum(spans[k].score for k in range(s_idx, e_idx)) / max(1, e_idx - s_idx))
        else:
            w_raw_start, w_raw_end, w_score = 0.0, total_audio_sec, -5.0

        item["start"] = find_voice_onset(waveform, w_raw_start)
        item["end"] = max(item["start"] + 0.1, w_raw_end)
        item["confidence"] = round(min(1.0, max(0.1, float(np.exp(w_score)))), 2)

    # RÈGLE D'OR DE CONTINUITÉ MÉLISMATIQUE :
    for i in range(len(word_spans) - 1):
        cur_item = word_spans[i][0]
        nxt_item = word_spans[i + 1][0]
        w_ref = cur_item.get("gabc_ref")
        notes_count = len(w_ref["notes"]) if isinstance(w_ref, dict) and "notes" in w_ref else 0
        if notes_count >= 3:
            if nxt_item["start"] > cur_item["end"] + 0.3:
                cur_item["end"] = round(nxt_item["start"] - 0.25, 3)

    for i in range(len(word_spans)):
        cur_item = word_spans[i][0]
        w_ref = cur_item.get("gabc_ref")
        notes_count = len(w_ref["notes"]) if isinstance(w_ref, dict) and "notes" in w_ref else 0
        if i == len(word_spans) - 1 and notes_count >= 3:
            cur_item["end"] = min(round(total_audio_sec - 0.5, 3), max(cur_item["end"], round(total_audio_sec - 1.5, 3)))
        cur_item["duration"] = round(cur_item["end"] - cur_item["start"], 3)

    # Construction des notes de la partition
    raw_notes = []
    global_note_idx = 0

    # 1. Antienne principale
    for item, _, _ in word_spans:
        if item["section"] == "antiphon":
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            dur = item["duration"]
            avg_nd = dur / max(1, len(notes))

            # GOUVERNEUR ANTI-PANIQUE
            if avg_nd < 0.22:
                n_sung = max(2, min(len(notes), int(dur / 0.35)))
                sung_n = notes[:n_sung]
                unsung_n = notes[n_sung:]
                tot_w = sum(n["duration_weight"] for n in sung_n)
                cur_t = item["start"]
                for n in sung_n:
                    nd = (n["duration_weight"] / tot_w) * dur
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "antiphon",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(cur_t, 3),
                        "end": round(cur_t + nd, 3),
                        "duration": round(nd, 3),
                        "confidence": item["confidence"],
                        "sung": True
                    })
                    cur_t += nd
                    global_note_idx += 1
                for n in unsung_n:
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "antiphon",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(item["end"], 3),
                        "end": round(item["end"], 3),
                        "duration": 0.0,
                        "confidence": 0.0,
                        "sung": False
                    })
                    global_note_idx += 1
            else:
                tot_w = sum(n["duration_weight"] for n in notes)
                cur_t = item["start"]
                for n in notes:
                    nd = (n["duration_weight"] / tot_w) * dur
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "antiphon",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(cur_t, 3),
                        "end": round(cur_t + nd, 3),
                        "duration": round(nd, 3),
                        "confidence": item["confidence"],
                        "sung": True
                    })
                    cur_t += nd
                    global_note_idx += 1

    # 2. Verset
    last_verse_end = raw_notes[-1]["end"] if raw_notes else 0.0
    for item, _, _ in word_spans:
        if item["section"] == "verse":
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            dur = item["duration"]
            avg_nd = dur / max(1, len(notes))

            # GOUVERNEUR ANTI-PANIQUE
            if avg_nd < 0.22:
                n_sung = max(2, min(len(notes), int(dur / 0.35)))
                sung_n = notes[:n_sung]
                unsung_n = notes[n_sung:]
                tot_w = sum(n["duration_weight"] for n in sung_n)
                cur_t = item["start"]
                for n in sung_n:
                    nd = (n["duration_weight"] / tot_w) * dur
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "verse",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(cur_t, 3),
                        "end": round(cur_t + nd, 3),
                        "duration": round(nd, 3),
                        "confidence": item["confidence"],
                        "sung": True
                    })
                    cur_t += nd
                    global_note_idx += 1
                for n in unsung_n:
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "verse",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(item["end"], 3),
                        "end": round(item["end"], 3),
                        "duration": 0.0,
                        "confidence": 0.0,
                        "sung": False
                    })
                    global_note_idx += 1
            else:
                tot_w = sum(n["duration_weight"] for n in notes)
                cur_t = item["start"]
                for n in notes:
                    nd = (n["duration_weight"] / tot_w) * dur
                    raw_notes.append({
                        "note_index": global_note_idx,
                        "token": n["token"],
                        "pitch": n["pitch"],
                        "word": w_ref["word"],
                        "section": "verse",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(cur_t, 3),
                        "end": round(cur_t + nd, 3),
                        "duration": round(nd, 3),
                        "confidence": item["confidence"],
                        "sung": True
                    })
                    cur_t += nd
                    global_note_idx += 1
            last_verse_end = raw_notes[-1]["end"]

    # 3. Doxologie
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
                    "pitch": n["pitch"],
                    "word": "Glória Patri",
                    "section": "gloria_patri",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": n["is_pointed"],
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
                        "pitch": n["pitch"],
                        "word": "Glória Patri",
                        "section": "gloria_patri",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
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
                    "pitch": n["pitch"],
                    "word": "EUOUAE",
                    "section": "euouae",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": n["is_pointed"],
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
                        "pitch": n["pitch"],
                        "word": "EUOUAE",
                        "section": "euouae",
                        "duration_weight": n["duration_weight"],
                        "is_pointed": n["is_pointed"],
                        "start": round(last_verse_end, 3),
                        "end": round(last_verse_end, 3),
                        "duration": 0.0,
                        "confidence": 0.0,
                        "sung": False
                    })
                    global_note_idx += 1

    # 4. Règle d'or de fin de mot
    for idx in range(len(raw_notes) - 1):
        if raw_notes[idx]["sung"] and raw_notes[idx + 1]["sung"]:
            if raw_notes[idx]["word"] != raw_notes[idx + 1]["word"]:
                nxt = raw_notes[idx + 1]["start"]
                if nxt > raw_notes[idx]["end"]:
                    raw_notes[idx]["end"] = nxt
                    raw_notes[idx]["duration"] = round(nxt - raw_notes[idx]["start"], 3)

    # 5. Métadonnées de Reprise
    reprise_data = None
    reprise_items = [item for item, _, _ in word_spans if item["section"] == "reprise"]
    if reprise_items:
        r_start = reprise_items[0]["start"]
        r_end = reprise_items[-1]["end"]
        reprise_notes = []
        r_idx = 0
        for item in reprise_items:
            w_ref = item["gabc_ref"]
            notes = w_ref["notes"]
            tot_w = sum(n["duration_weight"] for n in notes)
            cur_t = item["start"]
            w_dur = item["duration"]
            for n in notes:
                nd = (n["duration_weight"] / tot_w) * w_dur
                reprise_notes.append({
                    "note_index": r_idx,
                    "token": n["token"],
                    "pitch": n["pitch"],
                    "word": w_ref["word"],
                    "section": "reprise",
                    "duration_weight": n["duration_weight"],
                    "is_pointed": n["is_pointed"],
                    "start": round(cur_t, 3),
                    "end": round(cur_t + nd, 3),
                    "duration": round(nd, 3),
                    "confidence": item["confidence"]
                })
                cur_t += nd
                r_idx += 1

        reprise_data = {
            "start": r_start,
            "end": r_end,
            "duration": round(r_end - r_start, 3),
            "antiphon_note_count": len(reprise_notes),
            "reprise_after_section": "verse" if ("V" in chosen_code and not has_sung_dox) else "doxology",
            "skips_doxology": (not has_sung_dox),
            "notes": reprise_notes
        }

    # 6. Métadonnées d'Intonation (pour Alleluias avec intonation soliste séparée)
    intonation_data = None
    if chosen_code == "H_AA_V_A":
        into_items = [item for item, _, _ in word_spans if item["section"] == "intonation"]
        if into_items:
            i_start = into_items[0]["start"]
            i_end = into_items[-1]["end"]
            intonation_data = {
                "start": i_start,
                "end": i_end,
                "duration": round(i_end - i_start, 3),
                "note_count": 16
            }

    sung_notes = [n for n in raw_notes if n["sung"]]
    durs = [n["duration"] for n in sung_notes]
    print(f"  [SUCCÈS {pid}] {len(raw_notes)} notes visuelles ({len(sung_notes)} chantées de {sung_notes[0]['start']}s à {sung_notes[-1]['end']}s)", flush=True)
    print(f"    Moyenne note: {np.mean(durs):.3f}s | Min: {min(durs):.3f}s | Max: {max(durs):.3f}s | <0.20s: {sum(1 for d in durs if d < 0.20)}", flush=True)

    return {
        "notes": raw_notes,
        "reprise": reprise_data,
        "intonation": intonation_data,
        "structure": chosen_code,
        "structure_desc": best_cand[1]
    }

if __name__ == "__main__":
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    raw_results = {}
    reprise_meta = {}
    intonation_meta = {}

    for piece in manifest:
        pid = piece["id"]
        res = process_piece(piece)
        if res:
            raw_results[pid] = res["notes"]
            if res["reprise"]:
                reprise_meta[pid] = res["reprise"]
            if res["intonation"]:
                intonation_meta[pid] = res["intonation"]

            piece_stamp_file = os.path.join(OUTPUT_DIR, f"{pid}_stamps.json")
            with open(piece_stamp_file, "w", encoding="utf-8") as f:
                json.dump(res["notes"], f, indent=2, ensure_ascii=False)

            with open(RAW_OUT_PATH, "w", encoding="utf-8") as f:
                json.dump(raw_results, f, indent=2, ensure_ascii=False)
            with open(REPRISE_FILE, "w", encoding="utf-8") as f:
                json.dump(reprise_meta, f, indent=2, ensure_ascii=False)
            print(f"  --> Pièce {pid} sauvegardée sur disque !", flush=True)

    print(f"\n[SUCCÈS GLOBAL] Tous les alignements enregistrés dans {OUTPUT_DIR}", flush=True)
