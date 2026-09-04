"""
test_all_introits.py
Détection automatique de la structure (Antienne, Verset, Doxologie, Reprise)
sur les pièces 5, 11, 13.
"""

import os
import sys
import re
import json
import time
import torch
import torchaudio
import torchaudio.functional as F

ALIGN_DIR = os.path.dirname(os.path.abspath(__file__))
PIPELINE_DIR = os.path.abspath(os.path.join(ALIGN_DIR, ".."))
AUDIO_DIR = os.path.join(PIPELINE_DIR, "audio_corpus")

bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model()
dictionary = bundle.get_dict()

def clean_latin_word(w):
    w = w.lower().replace("æ", "ae").replace("œ", "oe")
    w = re.sub(r"[áàâ]", "a", w)
    w = re.sub(r"[éèê]", "e", w)
    w = re.sub(r"[íìî]", "i", w)
    w = re.sub(r"[óòô]", "o", w)
    w = re.sub(r"[úùû]", "u", w)
    w = re.sub(r"[ý]", "y", w)
    return re.sub(r"[^a-z]", "", w)

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

def align_piece(pid, antiphon_words, verse_words, has_doxology=True, has_reprise=True):
    wav_path = os.path.join(AUDIO_DIR, f"{pid}.wav")
    wav, sr = torchaudio.load(wav_path)
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != 16000:
        wav = torchaudio.functional.resample(wav, sr, 16000)
    total_sec = wav.shape[1] / 16000.0

    doxology_words = [
        "Gloria", "Patri", "et", "Filio", "et", "Spiritui", "Sancto",
        "Sicut", "erat", "in", "principio", "et", "nunc", "et", "semper",
        "et", "in", "saecula", "saeculorum", "Amen"
    ] if has_doxology else []

    reprise_words = list(antiphon_words) if has_reprise else []

    full_words = antiphon_words + verse_words + doxology_words + reprise_words

    word_spans = []
    flat_tokens = []
    for w in full_words:
        cl = clean_latin_word(w)
        toks = [dictionary[c] for c in cl if c in dictionary]
        if toks:
            word_spans.append((w, len(flat_tokens), len(flat_tokens) + len(toks)))
            flat_tokens.extend(toks)

    targets = torch.tensor([flat_tokens], dtype=torch.int32)
    emissions = get_chunked_emissions(wav)
    log_probs = emissions.log_softmax(dim=-1)

    input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
    target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
    paths, scores = F.forced_align(log_probs, targets, input_lengths, target_lengths, blank=0)
    spans = F.merge_tokens(paths[0], scores[0])
    frame_dur = 0.02

    results = []
    for w, s_idx, e_idx in word_spans:
        if s_idx < len(spans) and (e_idx - 1) < len(spans):
            w_start = spans[s_idx].start * frame_dur
            w_end = spans[e_idx - 1].end * frame_dur
            w_score = float(sum(spans[i].score for i in range(s_idx, e_idx)) / max(1, e_idx - s_idx))
        else:
            w_start, w_end, w_score = 0.0, 0.0, -5.0
        results.append({
            "word": w,
            "start": round(w_start, 3),
            "end": round(w_end, 3),
            "duration": round(w_end - w_start, 3),
            "score": round(w_score, 3)
        })

    print(f"\n==========================================")
    print(f"PIÈCE {pid} (Durée audio: {total_sec:.2f}s)")
    print(f"==========================================")
    idx_v = len(antiphon_words)
    idx_d = idx_v + len(verse_words)
    idx_r = idx_d + len(doxology_words)

    if antiphon_words:
        print(f"Antienne : [{results[0]['start']}s - {results[idx_v-1]['end']}s]")
    if verse_words:
        print(f"Verset   : [{results[idx_v]['start']}s - {results[idx_d-1]['end']}s]")
    if doxology_words:
        print(f"Doxologie: [{results[idx_d]['start']}s - {results[idx_r-1]['end']}s]")
        print(f"  EUOUAE (saeculorum Amen): [{results[idx_r-2]['start']}s - {results[idx_r-1]['end']}s]")
    if reprise_words:
        print(f"Reprise  : [{results[idx_r]['start']}s - {results[-1]['end']}s]")

if __name__ == "__main__":
    # Pièce 13 : Omnis terra
    p13_ant = "Omnis terra adoret te Deus et psallat tibi psalmum dicat nomini tuo Altissime".split()
    p13_v = "Jubilate Deo omnis terra psalmum dicite nomini ejus date gloriam laudi ejus".split()
    align_piece("13", p13_ant, p13_v, has_doxology=True, has_reprise=True)
