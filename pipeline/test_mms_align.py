import os
import torch
import torchaudio
import json

print("PyTorch version:", torch.__version__)
print("Torchaudio version:", torchaudio.__version__)

bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model()
tokenizer = bundle.get_tokenizer()
aligner = bundle.get_aligner()

# Load audio 5.wav
wav_path = r"d:/Documents/jgabc/pipeline/audio_corpus/5.wav"
waveform, sample_rate = torchaudio.load(wav_path)
if sample_rate != bundle.sample_rate:
    waveform = torchaudio.functional.resample(waveform, sample_rate, bundle.sample_rate)

print(f"Loaded waveform: shape {waveform.shape}, duration: {waveform.shape[1] / bundle.sample_rate:.2f}s")

# Load words from test_5_pieces.json
with open(r"d:/Documents/jgabc/pipeline/align/lab_5_pieces.json", encoding="utf-8") as f:
    pieces = json.load(f)

p5 = pieces[0]
raw_words = [w["word"] for w in p5["words"] if w["word"]]
print("Words to align:", raw_words[:5])

# Clean text for MMS_FA (letters only, lowercase)
import re
def clean_word(w):
    w = re.sub(r"[^a-zA-Z]", "", w).lower()
    # Latin replacements (e.g. æ -> ae, œ -> oe)
    w = w.replace("æ", "ae").replace("œ", "oe")
    return w

cleaned_words = [clean_word(w) for w in raw_words if clean_word(w)]
print("Cleaned words for MMS_FA:", cleaned_words[:5])

with torch.inference_mode():
    emission, _ = model(waveform)
    tokenized_transcript = [tokenizer(w) for w in cleaned_words]
    # Filter empty tokens
    valid_words = []
    valid_tokens = []
    for w, tok in zip(cleaned_words, tokenized_transcript):
        if len(tok) > 0:
            valid_words.append(w)
            valid_tokens.append(tok)

    aligned_tokens, scores = aligner(emission[0], valid_tokens)

print(f"Successfully aligned {len(aligned_tokens)} words!")
results = []
for word, tokens in zip(valid_words, aligned_tokens):
    t_start = tokens[0].start * bundle.sample_rate / 16000 # in frames
    # Each frame in Wav2Vec2 is ~20ms (downsampling factor of 320 at 16kHz)
    sec_start = tokens[0].start * 0.02
    sec_end = tokens[-1].end * 0.02
    score = sum(t.score for t in tokens) / len(tokens)
    print(f"  {word:15s} [{sec_start:6.2f}s -> {sec_end:6.2f}s] (score: {score:.2f})")
    results.append({"word": word, "start": round(sec_start, 3), "end": round(sec_end, 3), "score": round(score, 3)})

with open(r"d:/Documents/jgabc/pipeline/temp_word_data/5_mms_words.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("Saved alignment to 5_mms_words.json!")
