"""
test_double_bar_detector.py
Détecteur de Refrain à chaque double barre (::) :
À chaque double barre, le modèle teste acoustiquement :
1. Est-ce le Refrain qui est chanté ?
2. Est-ce la Doxologie (Gloria Patri) ?
3. Ou est-ce la fin du chant ?
"""

import os
import re
import json
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

def text_to_tokens(text):
    words = text.split()
    flat_tokens = []
    word_spans = []
    for w in words:
        cl = clean_latin_word(w)
        toks = [dictionary[c] for c in cl if c in dictionary]
        if toks:
            word_spans.append((w, len(flat_tokens), len(flat_tokens) + len(toks)))
            flat_tokens.extend(toks)
    return flat_tokens, word_spans

def test_structure(pid, antiphon_text, verse_text, doxology_text):
    wav_path = os.path.join(AUDIO_DIR, f"{pid}.wav")
    wav, sr = torchaudio.load(wav_path)
    if wav.shape[0] > 1: wav = wav.mean(dim=0, keepdim=True)
    if sr != 16000: wav = torchaudio.functional.resample(wav, sr, 16000)
    total_sec = wav.shape[1] / 16000.0

    print(f"\n" + "="*60)
    print(f"ANALYSE DE STRUCTURE : PIÈCE {pid} (Durée: {total_sec:.2f}s)")
    print(f"="*60)

    # Hypothèse 1 : A -> V -> A (Refrain direct après verset, pas de Gloria)
    h1_text = f"{antiphon_text} {verse_text} {antiphon_text}"
    # Hypothèse 2 : A -> V -> D -> A (Gloria après verset, puis Refrain)
    h2_text = f"{antiphon_text} {verse_text} {doxology_text} {antiphon_text}"
    # Hypothèse 3 : A -> V -> A -> D -> A (Refrain après verset, puis Gloria, puis Refrain)
    h3_text = f"{antiphon_text} {verse_text} {antiphon_text} {doxology_text} {antiphon_text}"
    # Hypothèse 4 : A -> V -> D (Gloria après verset, pas de Refrain final)
    h4_text = f"{antiphon_text} {verse_text} {doxology_text}"

    hypotheses = [
        ("H1: A -> V -> Refrain", h1_text),
        ("H2: A -> V -> Doxologie -> Refrain", h2_text),
        ("H3: A -> V -> Refrain -> Doxologie -> Refrain", h3_text),
        ("H4: A -> V -> Doxologie", h4_text),
    ]

    best_h = None
    best_score = -999.0
    best_spans = None

    # Émissions par chunks
    total_samples = wav.shape[1]
    chunk_samples = 30 * 16000
    emissions = []
    with torch.inference_mode():
        for start in range(0, total_samples, chunk_samples):
            chunk = wav[:, start:start + chunk_samples]
            if chunk.shape[1] < 1600: continue
            em, _ = model(chunk)
            emissions.append(em)
    full_em = torch.cat(emissions, dim=1)
    lp = full_em.log_softmax(dim=-1)
    in_len = torch.tensor([lp.shape[1]], dtype=torch.int32)

    for h_name, h_txt in hypotheses:
        toks, w_spans = text_to_tokens(h_txt)
        tg = torch.tensor([toks], dtype=torch.int32)
        tg_len = torch.tensor([tg.shape[1]], dtype=torch.int32)
        paths, scores = F.forced_align(lp, tg, in_len, tg_len, blank=0)
        sp = F.merge_tokens(paths[0], scores[0])
        avg_score = float(scores[0].mean().item())

        frame_dur = 0.02
        t_start = sp[0].start * frame_dur if len(sp) > 0 else 0
        t_end = sp[-1].end * frame_dur if len(sp) > 0 else 0
        span_dur = t_end - t_start
        coverage = span_dur / total_sec

        print(f"  {h_name:45} : score={avg_score:6.3f} span=[{t_start:5.1f}s - {t_end:5.1f}s] (couv: {coverage*100:4.1f}%)")

        # Sélection basée sur le score acoustique et la couverture temporelle
        if coverage >= 0.85 and avg_score > best_score:
            best_score = avg_score
            best_h = h_name

    print(f"\n  ==> MEILLEURE STRUCTURE DÉTECTÉE : {best_h} (score: {best_score:.3f})")

if __name__ == "__main__":
    p13_ant = "Omnis terra adoret te Deus et psallat tibi psalmum dicat nomini tuo Altissime"
    p13_v = "Jubilate Deo omnis terra psalmum dicite nomini ejus date gloriam laudi ejus"
    doxology = "Gloria Patri et Filio et Spiritui Sancto Sicut erat in principio et nunc et semper et in saecula saeculorum Amen"

    test_structure("13", p13_ant, p13_v, doxology)

    p11_ant = "Sapientiam sanctorum narrent populi et laudes eorum nuntiet ecclesia nomina autem eorum vivent in saeculum saeculi"
    p11_v = "Exsultate justi in Domino rectos decet collaudatio"
    test_structure("11", p11_ant, p11_v, doxology)
