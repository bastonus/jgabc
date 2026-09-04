"""
check_piece13_structure.py
Test de structure sur la pièce 13 :
Qu'est-ce qui est chanté après le verset (à partir de ~74s) ?
Hypothèse A : Gloria Patri puis Refrain ?
Hypothèse B : Refrain (Omnis terra...) directement après le verset ?
Hypothèse C : Refrain -> Gloria Patri -> Refrain ?
"""

import os
import re
import torch
import torchaudio
import torchaudio.functional as F

ALIGN_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(ALIGN_DIR, "..", "audio_corpus")

bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model()
dictionary = bundle.get_dict()

wav, sr = torchaudio.load(os.path.join(AUDIO_DIR, "13.wav"))
if wav.shape[0] > 1: wav = wav.mean(dim=0, keepdim=True)
if sr != 16000: wav = torchaudio.functional.resample(wav, sr, 16000)

def clean_latin_word(w):
    w = w.lower().replace("æ", "ae").replace("œ", "oe")
    w = re.sub(r"[áàâ]", "a", w)
    w = re.sub(r"[éèê]", "e", w)
    w = re.sub(r"[íìî]", "i", w)
    w = re.sub(r"[óòô]", "o", w)
    w = re.sub(r"[úùû]", "u", w)
    w = re.sub(r"[ý]", "y", w)
    return re.sub(r"[^a-z]", "", w)

p13_ant = "Omnis terra adoret te Deus et psallat tibi psalmum dicat nomini tuo Altissime"
p13_v = "Jubilate Deo omnis terra psalmum dicite nomini ejus date gloriam laudi ejus"
doxology = "Gloria Patri et Filio et Spiritui Sancto Sicut erat in principio et nunc et semper et in saecula saeculorum Amen"

# Segment 70s à 132s
seg = wav[:, int(70 * 16000):]
seg_dur = seg.shape[1] / 16000.0

def score_text(sub_wav, text):
    words = text.split()
    flat_tokens = []
    word_spans = []
    for w in words:
        cl = clean_latin_word(w)
        toks = [dictionary[c] for c in cl if c in dictionary]
        if toks:
            word_spans.append((w, len(flat_tokens), len(flat_tokens) + len(toks)))
            flat_tokens.extend(toks)
    targets = torch.tensor([flat_tokens], dtype=torch.int32)
    with torch.inference_mode():
        em, _ = model(sub_wav)
        lp = em.log_softmax(dim=-1)
        in_len = torch.tensor([lp.shape[1]], dtype=torch.int32)
        tg_len = torch.tensor([targets.shape[1]], dtype=torch.int32)
        paths, scores = F.forced_align(lp, targets, in_len, tg_len, blank=0)
        sp = F.merge_tokens(paths[0], scores[0])
        avg_score = float(scores[0].mean().item())
        frame_dur = 0.02
        first_w_start = sp[0].start * frame_dur if len(sp) > 0 else 0
        last_w_end = sp[-1].end * frame_dur if len(sp) > 0 else 0
    return avg_score, first_w_start, last_w_end, sp, word_spans

# Test 1 : Est-ce le Refrain (Omnis terra...) sur les 50 premières secondes après 74s ?
print(f"Segment analysé (70s - fin): {seg_dur:.2f}s")
score_ant, t0_ant, t1_ant, _, _ = score_text(seg, p13_ant)
print(f"Alignement Refrain seul sur [70s - fin] : score={score_ant:.4f}, span=[{70+t0_ant:.2f}s - {70+t1_ant:.2f}s]")

# Test 2 : Est-ce Doxologie + Refrain ?
score_dox_ant, t0_da, t1_da, _, _ = score_text(seg, f"{doxology} {p13_ant}")
print(f"Alignement Doxologie + Refrain sur [70s - fin] : score={score_dox_ant:.4f}, span=[{70+t0_da:.2f}s - {70+t1_da:.2f}s]")

# Test 3 : Est-ce Refrain seul qui remplit tout jusqu'à la fin ?
# 132.8s - 74s = 58s. Une antienne complète dure ~50s !
