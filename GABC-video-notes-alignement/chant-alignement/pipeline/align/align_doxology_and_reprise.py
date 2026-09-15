"""
align_doxology_and_reprise.py
Script de test et de validation pour l'alignement acoustique complet :
- Antienne
- Verset
- Doxologie (Gloria Patri reconstitué)
- Reprise de l'antienne (Refrain)
Avec chunking mémoire pour torchaudio MMS_FA.
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

def get_chunked_emissions(wav, chunk_sec=25):
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

def test_piece_11():
    wav_path = os.path.join(AUDIO_DIR, "11.wav")
    wav, sr = torchaudio.load(wav_path)
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != 16000:
        wav = torchaudio.functional.resample(wav, sr, 16000)
        
    total_sec = wav.shape[1] / 16000.0
    print(f"[Audio] 11.wav chargé: {total_sec:.2f}s", flush=True)

    # 1. Antienne
    antiphon_words = [
        "Sapientiam", "sanctorum", "narrent", "populi",
        "et", "laudes", "eorum", "nuntiet", "ecclesia",
        "nomina", "autem", "eorum", "vivent", "in", "saeculum", "saeculi"
    ]
    # 2. Verset
    verse_words = [
        "Exsultate", "justi", "in", "Domino",
        "rectos", "decet", "collaudatio"
    ]
    # 3. Doxologie complète
    doxology_words = [
        "Gloria", "Patri", "et", "Filio", "et", "Spiritui", "Sancto",
        "Sicut", "erat", "in", "principio", "et", "nunc", "et", "semper",
        "et", "in", "saecula", "saeculorum", "Amen"
    ]
    # 4. Reprise
    reprise_words = list(antiphon_words)

    full_words = antiphon_words + verse_words + doxology_words + reprise_words

    print(f"[Texte] Total mots: {len(full_words)} (Antienne: {len(antiphon_words)}, Verset: {len(verse_words)}, Doxologie: {len(doxology_words)}, Reprise: {len(reprise_words)})", flush=True)

    word_spans = []
    flat_tokens = []
    for w in full_words:
        cl = clean_latin_word(w)
        toks = [dictionary[c] for c in cl if c in dictionary]
        if toks:
            word_spans.append((w, len(flat_tokens), len(flat_tokens) + len(toks)))
            flat_tokens.extend(toks)

    targets = torch.tensor([flat_tokens], dtype=torch.int32)

    print("[IA] Calcul des émissions MMS_FA par chunks...", flush=True)
    t0 = time.time()
    emissions = get_chunked_emissions(wav, chunk_sec=30)
    log_probs = emissions.log_softmax(dim=-1)
    print(f"  [OK] Émissions calculées en {time.time() - t0:.2f}s, frames={log_probs.shape[1]}", flush=True)

    input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
    target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)

    print("[IA] Forced alignment Viterbi...", flush=True)
    t1 = time.time()
    paths, scores = F.forced_align(log_probs, targets, input_lengths, target_lengths, blank=0)
    spans = F.merge_tokens(paths[0], scores[0])
    print(f"  [OK] Forced alignment terminé en {time.time() - t1:.2f}s", flush=True)

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
            "confidence": round(min(1.0, max(0.1, float(torch.exp(torch.tensor(w_score)).item()))), 2)
        })

    # Affichage des sections
    idx_v = len(antiphon_words)
    idx_d = idx_v + len(verse_words)
    idx_r = idx_d + len(doxology_words)

    print("\n" + "="*70)
    print("RÉSULTATS DE L'ALIGNEMENT ACOUSTIQUE RECONSTITUÉ (PIÈCE 11)")
    print("="*70)
    
    print("\n--- 1. ANTIENNE ---")
    for item in results[:idx_v]:
        print(f"  {item['word']:15} [{item['start']:6.2f}s - {item['end']:6.2f}s] dur={item['duration']:5.2f}s conf={item['confidence']:.2f}")

    print("\n--- 2. VERSET PSALMIQUE ---")
    for item in results[idx_v:idx_d]:
        print(f"  {item['word']:15} [{item['start']:6.2f}s - {item['end']:6.2f}s] dur={item['duration']:5.2f}s conf={item['confidence']:.2f}")

    print("\n--- 3. DOXOLOGIE (GLORIA PATRI + EUOUAE) ---")
    for item in results[idx_d:idx_r]:
        is_euouae = item['word'] in ["saecula", "saeculorum", "Amen"]
        marker = " <=== EUOUAE (Fin)" if is_euouae else ""
        print(f"  {item['word']:15} [{item['start']:6.2f}s - {item['end']:6.2f}s] dur={item['duration']:5.2f}s conf={item['confidence']:.2f}{marker}")

    print("\n--- 4. REPRISE DU REFRAIN (ANTIENNE) ---")
    for item in results[idx_r:]:
        print(f"  {item['word']:15} [{item['start']:6.2f}s - {item['end']:6.2f}s] dur={item['duration']:5.2f}s conf={item['confidence']:.2f}")

    out_file = os.path.join(ALIGN_DIR, "reconstructed_p11_align.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[SUCCÈS] Données enregistrées dans {out_file}", flush=True)

if __name__ == "__main__":
    test_piece_11()
