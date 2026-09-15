"""
test_doxology_align.py
Test MMS_FA forced alignment with:
1. Antiphon
2. Verse
3. Full Doxology (Gloria Patri ... Amen)
4. Reprise of Antiphon
"""

import os
import sys
import re
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

def align_text_with_audio(wav_path, words_list):
    waveform, sr = torchaudio.load(wav_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != bundle.sample_rate:
        waveform = torchaudio.functional.resample(waveform, sr, bundle.sample_rate)
    
    total_audio_sec = waveform.shape[1] / bundle.sample_rate
    
    word_spans = []
    flat_tokens = []
    for w in words_list:
        cl = clean_latin_word(w)
        toks = [dictionary[c] for c in cl if c in dictionary]
        if toks:
            word_spans.append((w, len(flat_tokens), len(flat_tokens) + len(toks)))
            flat_tokens.extend(toks)
            
    targets = torch.tensor([flat_tokens], dtype=torch.int32)
    with torch.inference_mode():
        emission, _ = model(waveform)
        log_probs = emission.log_softmax(dim=-1)
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
    return results, total_audio_sec

if __name__ == "__main__":
    print("Testing Piece 11 (Sapientiam sanctorum)...")
    antiphon_11 = "Sapientiam sanctorum narrent populi et laudes eorum nuntiet ecclesia nomina autem eorum vivent in saeculum saeculi"
    verse_11 = "Exsultate justi in Domino rectos decet collaudatio"
    doxology = "Gloria Patri et Filio et Spiritui Sancto Sicut erat in principio et nunc et semper et in saecula saeculorum Amen"
    
    full_words_11 = f"{antiphon_11} {verse_11} {doxology} {antiphon_11}".split()
    results_11, dur_11 = align_text_with_audio(os.path.join(AUDIO_DIR, "11.wav"), full_words_11)
    
    print(f"Total audio duration: {dur_11:.2f}s")
    print(f"Total words aligned: {len(results_11)}")
    print("\n--- Key Milestones ---")
    sections = [
        ("ANTIPHON START", 0),
        ("VERSE START", len(antiphon_11.split())),
        ("DOXOLOGY START", len(antiphon_11.split()) + len(verse_11.split())),
        ("DOXOLOGY END (Amen)", len(antiphon_11.split()) + len(verse_11.split()) + len(doxology.split()) - 1),
        ("REPRISE START", len(antiphon_11.split()) + len(verse_11.split()) + len(doxology.split())),
        ("REPRISE END", len(full_words_11) - 1)
    ]
    for label, idx in sections:
        item = results_11[idx]
        print(f"{label:22} : word='{item['word']}' [{item['start']:.2f}s - {item['end']:.2f}s] score={item['score']:.3f}")
    
    print("\n--- Doxology Words in Detail ---")
    dox_start_idx = len(antiphon_11.split()) + len(verse_11.split())
    dox_end_idx = dox_start_idx + len(doxology.split())
    for item in results_11[dox_start_idx:dox_end_idx]:
        print(f"  {item['word']:15} [{item['start']:6.2f}s - {item['end']:6.2f}s] dur={item['duration']:5.2f}s score={item['score']:6.3f}")
