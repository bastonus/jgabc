#!/usr/bin/env python3
"""
worker.py — Client de calcul distribué pour l'alignement grégorien Oremus.

Ce script s'exécute sur l'ordinateur de l'utilisateur (ou d'un ami) et :
1. Détecte automatiquement l'accélération matérielle (NVIDIA CUDA, Apple MPS ou CPU multi-cœurs).
2. Récupère automatiquement la prochaine pièce liturgique à aligner depuis le serveur Coolify.
3. Télécharge la piste audio YouTube en mémoire/fichier temporaire.
4. Calcule les horodatages note-par-note avec un pipeline acoustique double modèle :
   - Passe 1 : MMS_FA (Meta) — alignement forcé CTC pour ancrer les mots en temps.
   - Passe 2 : TorchCREPE — estimation F0 à 10 ms + détection de paliers de hauteur
     fusionnée avec les priors de durée dérivés du GABC (., _, ss/vv, quilisma).
5. Renvoie les résultats au serveur et supprime immédiatement les fichiers audio temporaires.

Usage direct :
    python worker.py
    python worker.py --server https://api-oremus.silverhorse.fr --name "Ami-Thomas-RTX"
"""

import os
import sys
import re
import time
import json
import socket
import argparse
import tempfile
import urllib.request
import numpy as np
from pathlib import Path

# Configuration de l'encodage UTF-8 et des couleurs ANSI / VT100
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    # Activer le mode VT100 dans conhost Windows pour que les couleurs ANSI fonctionnent sans afficher ←[92m
    try:
        os.system("")
    except Exception:
        pass
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        hStdOut = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(hStdOut, ctypes.byref(mode)):
            kernel32.SetConsoleMode(hStdOut, mode.value | 0x0004)
    except Exception:
        pass
elif sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_SERVER = "https://api-oremus.silverhorse.fr"

# Bannière d'accueil
BANNER = r"""
  ___  ____  _____ __  __ _   _ ____    __        _____  ____  _  _______ ____  
 / _ \|  _ \| ____|  \/  | | | / ___|   \ \      / / _ \|  _ \| |/ / ____|  _ \ 
| | | | |_) |  _| | |\/| | | | \___ \    \ \ /\ / / | | | |_) | ' /|  _| | |_) |
| |_| |  _ <| |___| |  | | |_| |___) |    \ V  V /| |_| |  _ <| . \| |___|  _ < 
 \___/|_| \_\_____|_|  |_|\___/|____/      \_/\_/  \___/|_| \_\_|\_\_____|_| \_\
                 ✦ Calcul Distribué Liturgique & Grégorien ✦
"""

def ensure_dependencies():
    """Vérifie que les modules requis sont installés (yt-dlp, torch, torchaudio, torchcrepe, scipy). Si manquant, tente l'auto-installation."""
    missing = []
    try:
        import yt_dlp
    except ImportError:
        missing.append("yt-dlp")
    try:
        import soundfile
    except ImportError:
        missing.append("soundfile")
    try:
        import torch
        import torchaudio
    except ImportError:
        if "torch" not in missing:
            missing.append("torch")
        missing.append("torchaudio")
    try:
        import torchcrepe
    except ImportError:
        missing.append("torchcrepe")
    try:
        from scipy.signal import medfilt
    except ImportError:
        missing.append("scipy")

    if not missing:
        return

    print("\n" + "!" * 75)
    print(f"  [!] Modules requis manquants détectés : {', '.join(missing)}")
    print("  [*] Tentative d'installation automatique via pip...")
    print("!" * 75 + "\n")

    import subprocess
    req_file = Path(__file__).parent / "requirements.txt"
    try:
        # Vérifier si un GPU NVIDIA est présent pour installer directement la version CUDA
        has_nvidia = False
        try:
            r = subprocess.run(["nvidia-smi"], capture_output=True, timeout=3)
            if r.returncode == 0:
                has_nvidia = True
        except Exception:
            pass

        if has_nvidia and ("torch" in missing or "torchaudio" in missing):
            print("  ✦ GPU NVIDIA détecté : Installation de PyTorch avec accélération CUDA...")
            subprocess.check_call([
                sys.executable, "-m", "pip", "install",
                "torch", "torchaudio",
                "--index-url", "https://download.pytorch.org/whl/cu124"
            ])
            if req_file.exists():
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
            else:
                rest = [m for m in missing if m not in ("torch", "torchaudio")]
                if rest:
                    subprocess.check_call([sys.executable, "-m", "pip", "install"] + rest)
        else:
            if req_file.exists():
                subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req_file)])
            else:
                subprocess.check_call([sys.executable, "-m", "pip", "install"] + missing)
        print("\n  \033[92m[✓] Dépendances installées avec succès !\033[0m Reprise de l'exécution...\n")
    except Exception as e:
        print("\n" + "=" * 75)
        print(f"  \033[91m[ERREUR]\033[0m Impossible d'installer automatiquement les modules : {e}")
        print("  Pour installer manuellement, lancez dans votre terminal :")
        print(f"      {sys.executable} -m pip install yt-dlp torch torchaudio")
        print("  Ou utilisez simplement le lanceur tout-en-un :")
        print("      • Sous Windows : double-cliquez sur start_worker.bat")
        print("      • Ou en 1 ligne : irm https://api-oremus.silverhorse.fr/run.ps1 | iex")
        print("=" * 75 + "\n")
        sys.exit(1)


def check_and_enable_cuda():
    """Si une carte graphique NVIDIA est présente mais que PyTorch est en version CPU, installe automatiquement la version CUDA."""
    try:
        import torch
        if torch.cuda.is_available():
            return
    except Exception:
        pass

    import subprocess
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=3
        )
        if res.returncode == 0 and res.stdout.strip():
            gpu_name = res.stdout.strip().split("\n")[0].strip()
            print("\n" + "=" * 75)
            print(f"  ✦ CARTE GRAPHIQUE NVIDIA DÉTECTÉE : \033[92m{gpu_name}\033[0m")
            print("  [!] PyTorch est actuellement installé en version CPU uniquement.")
            print("  ✦ Activation automatique de l'accélération matérielle CUDA (vitesse x25)...")
            print("=" * 75 + "\n")

            # Désinstallation de la version CPU et installation de la version CUDA 12.4
            subprocess.check_call([sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchaudio"])
            subprocess.check_call([
                sys.executable, "-m", "pip", "install",
                "torch", "torchaudio",
                "--index-url", "https://download.pytorch.org/whl/cu124"
            ])
            print("\n  \033[92m[✓] PyTorch CUDA activé avec succès !\033[0m Redémarrage du worker sur GPU NVIDIA...\n")
            # Relancer avec les mêmes arguments sous l'environnement GPU
            os.execv(sys.executable, [sys.executable] + sys.argv)
    except Exception as e:
        # Si échec (ex: pas d'internet ou interruption), continuer en CPU sans bloquer
        pass


def detect_device():
    """Détecte automatiquement le meilleur accélérateur de calcul disponible."""
    try:
        import torch
        if torch.cuda.is_available():
            dev_name = torch.cuda.get_device_name(0)
            return "cuda", f"NVIDIA GPU CUDA ({dev_name})"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps", "Apple Silicon GPU (Metal Performance Shaders)"
        else:
            cores = os.cpu_count() or 4
            return "cpu", f"Processeur CPU Multi-Cœurs ({cores} cœurs)"
    except Exception:
        return "cpu", "Processeur CPU"


def get_default_worker_name():
    """Génère un nom de contributeur amical par défaut."""
    host = socket.gethostname() or "Ami"
    clean_host = re.sub(r"[^a-zA-Z0-9_\-]", "", host)[:15]
    return f"{clean_host}"


def clean_latin_text(text: str) -> str:
    """Nettoie le texte latin pour le dictionnaire phonétique du modèle MMS_FA."""
    text = text.lower()
    text = re.sub(r"[áàâä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[íìîï]", "i", text)
    text = re.sub(r"[óòôö]", "o", text)
    text = re.sub(r"[úùûü]", "u", text)
    text = re.sub(r"[ýỳŷÿ]", "y", text)
    text = text.replace("æ", "ae").replace("œ", "oe")
    text = re.sub(r"[^a-z]", "", text)
    return text


def parse_gabc_file(gabc_src: str) -> list:
    """
    Parse un source GABC complet (headers + %% + notation) en liste de mots.
    Chaque mot : {word, clean_latin, notes, total_weight, is_melisma}.
    Portage de batch_align_gabc_v3.py v3.1.
    """
    if not gabc_src:
        return []

    if "%%" in gabc_src:
        _, notation = gabc_src.split("%%", 1)
    else:
        notation = gabc_src

    notation = re.sub(r"%.*", "", notation)

    _CLEF_RE = re.compile(r"^(c|f)b?\d")
    _IGNORABLE_RE = re.compile(r"\[[^\]]*\]")
    _SHAPE_MODS = r"(?:o|w|W|v|V|s|~|<|>|=|r\d?|R|x\??|X|y\??|Y|##?\??|q|O)*"
    _RHYTHM_MODS = r"(?:\.{1,2})?(?:_\d*)?(?:\'\d?)?"
    _TOKEN_RE = re.compile("[a-pA-P]" + _SHAPE_MODS + _RHYTHM_MODS)
    _SYL_RE = re.compile(r"([^()]*)(\([^()]*\))")

    def _dur_weight(token):
        w = 1.0
        if ".." in token:
            w *= 2.4
        elif "." in token:
            w *= 1.9
        if "_" in token:
            w *= 1.25
        if "w" in token or "W" in token:
            w *= 0.9
        return w

    def _is_repeated(prev, tok):
        return bool(re.search(r"(ss|sss|vv|vvv)$", tok))

    def _tokenize(raw):
        cleaned = _IGNORABLE_RE.sub("", raw)
        cleaned = re.sub(r"(/{{1,2}}|!)", r" \1 ", cleaned)
        notes = []
        pos = 0
        prev = ""
        while pos < len(cleaned):
            c = cleaned[pos]
            if c.isspace():
                pos += 1
                continue
            chunk = cleaned[pos:]
            cm = _CLEF_RE.match(chunk)
            if cm:
                pos += len(cm.group(0))
                continue
            m = _TOKEN_RE.match(chunk)
            if m and m.group(0):
                tok = m.group(0)
                pl = tok[0].lower()
                if pl in "abcdefghijklmnop":
                    notes.append({{
                        "token": tok,
                        "duration_weight": _dur_weight(tok),
                        "repeated": _is_repeated(prev, tok),
                        "pitch_letter": pl,
                    }})
                    prev = tok
                pos += len(tok)
                continue
            bm = re.match(r"`0?|\^0?|,0?|;\d?|:\??|::", chunk)
            if bm:
                pos += len(bm.group(0))
                continue
            pos += 1
        return notes

    words = []
    current_word = {{"word": "", "clean_latin": "", "notes": []}}

    for match in _SYL_RE.finditer(notation):
        text_part = match.group(1)
        notes_str = match.group(2)[1:-1]
        notes = _tokenize(notes_str)

        clean_text = re.sub(r"\[[^\]]*\]|<[^>]*>", "", text_part)
        clean_stripped = clean_text.strip()
        if clean_stripped:
            current_word["word"] += clean_stripped
        current_word["notes"].extend(notes)

        if re.search(r"\s$", text_part) or (notes_str.strip() == "" and current_word["word"]):
            if current_word["word"] or current_word["notes"]:
                cw = dict(current_word)
                cw["clean_latin"] = clean_latin_text(cw["word"])
                cw["total_weight"] = sum(n["duration_weight"] for n in cw["notes"]) or 1.0
                nc = len(cw["notes"])
                nl = len(cw["clean_latin"])
                cw["is_melisma"] = nc > max(1, nl)
                if nc > 0:
                    words.append(cw)
            current_word = {{"word": "", "clean_latin": "", "notes": []}}

    if current_word["word"] or current_word["notes"]:
        cw = dict(current_word)
        cw["clean_latin"] = clean_latin_text(cw["word"])
        cw["total_weight"] = sum(n["duration_weight"] for n in cw["notes"]) or 1.0
        nc = len(cw["notes"])
        nl = len(cw["clean_latin"])
        cw["is_melisma"] = nc > max(1, nl)
        if nc > 0:
            words.append(cw)

    return words


def compute_gabc_duration_priors(notes: list) -> "np.ndarray":
    """Normalise les poids de duree GABC en prior de note (somme=1)."""
    weights = np.array([n["duration_weight"] for n in notes], dtype=np.float64)
    total = weights.sum()
    if total <= 0:
        return np.ones(len(notes), dtype=np.float64) / max(1, len(notes))
    return weights / total


def detect_pitch_plateaus(local_pitch, notes_count, smoothing_kernel=5, min_semitone_jump=0.5):
    """
    Detecte les frontieres de notes par analyse des paliers de frequence F0.
    Retourne (boundaries, confidence).
    Portage de batch_align_gabc_v3.py.
    """
    try:
        from scipy.signal import medfilt as _medfilt
    except ImportError:
        return None, 0.0

    voiced = local_pitch > 0
    if voiced.sum() < notes_count:
        return None, 0.0

    with np.errstate(divide="ignore"):
        midi = 12 * np.log2(
            np.where(local_pitch > 0, local_pitch, 1) / 440.0
        ) + 69
    midi[~voiced] = np.nan

    kernel = smoothing_kernel if smoothing_kernel % 2 == 1 else smoothing_kernel + 1
    filled = np.where(np.isnan(midi), np.nanmedian(midi) if voiced.any() else 0, midi)
    kernel = min(kernel, len(filled) - (1 - len(filled) % 2))
    kernel = max(kernel, 1)
    smoothed = _medfilt(filled, kernel_size=kernel)

    deriv = np.abs(np.diff(smoothed))
    candidate_idx = np.where(deriv > min_semitone_jump)[0]

    boundaries = []
    for idx in candidate_idx:
        if not boundaries or idx - boundaries[-1] > 2:
            boundaries.append(int(idx))

    detected_count = len(boundaries) + 1
    confidence = 1.0 - min(abs(detected_count - notes_count) / max(notes_count, 1), 1.0)
    return boundaries, confidence


def blend_detection_with_priors(w_start, w_end, notes_count, detected_boundaries, confidence,
                                gabc_priors, has_repeated_notes):
    """
    Combine frontieres CREPE et prior GABC, ponderees par la confiance.
    Portage de batch_align_gabc_v3.py.
    """
    duration = w_end - w_start
    prior_times = w_start + np.cumsum(np.insert(gabc_priors, 0, 0.0))[:-1] * duration

    effective_confidence = min(confidence, 0.4) if has_repeated_notes else confidence

    if detected_boundaries is None or len(detected_boundaries) == 0:
        return [round(float(t), 3) for t in prior_times]

    step_sec = duration / max(len(detected_boundaries) + 1, 1)
    detected_times = [w_start] + [w_start + b * step_sec for b in detected_boundaries]
    detected_times = detected_times[:notes_count]
    while len(detected_times) < notes_count:
        detected_times.append(detected_times[-1] + step_sec)

    blended = [
        effective_confidence * d + (1 - effective_confidence) * p
        for d, p in zip(detected_times, prior_times)
    ]
    return [round(float(t), 3) for t in blended]


def load_audio_waveform(wav_path: str, target_sample_rate: int = 16000):
    """
    Charge un fichier audio en mémoire et le convertit en tenseur PyTorch [1, N] mono.
    Ne dépend PAS de TorchCodec (élimine 'TorchCodec is required for load_with_torchcodec').
    Supporte nativement soundfile, wave standard (WAV 16/24/32-bit), et torchaudio en dernier recours.
    """
    import torch
    import torchaudio.functional as F

    waveform = None
    sr = None

    # 1. Tentative avec soundfile (très rapide et supporte tous formats)
    try:
        import soundfile as sf
        data, sr = sf.read(wav_path, dtype="float32")
        t = torch.from_numpy(data)
        if t.ndim == 1:
            waveform = t.unsqueeze(0)
        else:
            waveform = t.T  # [channels, time]
    except Exception:
        pass

    # 2. Tentative avec le module standard 'wave' (zéro dépendance externe)
    if waveform is None:
        try:
            import wave
            import numpy as np
            with wave.open(wav_path, "rb") as wf:
                n_channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                sr = wf.getframerate()
                n_frames = wf.getnframes()
                raw_bytes = wf.readframes(n_frames)

                if sampwidth == 2:
                    data = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                elif sampwidth == 4:
                    data = np.frombuffer(raw_bytes, dtype=np.int32).astype(np.float32) / 2147483648.0
                elif sampwidth == 1:
                    data = (np.frombuffer(raw_bytes, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
                else:
                    data = None

                if data is not None:
                    if n_channels > 1:
                        data = data.reshape(-1, n_channels).T
                    else:
                        data = data.reshape(1, -1)
                    waveform = torch.from_numpy(data)
        except Exception:
            pass

    # 3. Dernier recours : torchaudio.load
    if waveform is None:
        import torchaudio
        waveform, sr = torchaudio.load(wav_path)

    if waveform is None or sr is None:
        raise RuntimeError(f"Impossible de décoder le fichier audio : {wav_path}")

    # Conversion en mono
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    # Rééchantillonnage vers la fréquence cible (16 kHz par défaut pour MMS_FA)
    if sr != target_sample_rate:
        waveform = F.resample(waveform, sr, target_sample_rate)

    total_sec = waveform.shape[1] / target_sample_rate
    return waveform, target_sample_rate, total_sec


def compute_alignment_mms(wav_path: str, gabc_src: str, device_type: str):
    """
    Pipeline acoustique double modele pour l'alignement note-par-note :
      Passe 1 — MMS_FA (torchaudio) : alignement force CTC pour ancrer les mots en temps.
      Passe 2 — TorchCREPE : estimation F0 a 10 ms + detection de paliers de hauteur
                              fusionnee avec les priors de duree GABC (., _, ss/vv).
    """
    import torch
    import torchaudio
    import torchaudio.functional as F

    # 1. Charger le modele MMS_FA
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model().to(device_type)
    dictionary = bundle.get_dict()
    star_idx = dictionary["*"]

    # 2. Charger et reechantillonner l'audio en 16kHz mono
    waveform, sr, total_sec = load_audio_waveform(wav_path, bundle.sample_rate)
    waveform = waveform.to(device_type)

    # 3. Parser le GABC (version v3.1 avec duration weights)
    words = parse_gabc_file(gabc_src)
    if not words:
        raise ValueError("Impossible d'extraire des syllabes/notes du GABC")

    # 4. Construire les tokens CTC avec tokens star pour les melismes
    flat_tokens = []
    word_spans = []   # (w_idx, s_idx, e_idx, is_melisma)

    for w_idx, w in enumerate(words):
        cleaned = w["clean_latin"]
        toks = [dictionary[c] for c in cleaned if c in dictionary]
        n_count = len(w["notes"])
        w_weight = w["total_weight"]

        if w["is_melisma"] or n_count > len(toks):
            # Melisme : tokens star proportionnels au poids GABC
            star_count = max(1, round(w_weight / 2.0))
            s = len(flat_tokens)
            flat_tokens.extend([star_idx] * star_count)
            e = len(flat_tokens)
            word_spans.append((w_idx, s, e, True))
        elif toks:
            s = len(flat_tokens)
            flat_tokens.extend(toks)
            e = len(flat_tokens)
            word_spans.append((w_idx, s, e, False))
        else:
            word_spans.append((w_idx, -1, -1, False))

    if not flat_tokens:
        flat_tokens = [star_idx] * max(1, sum(len(w["notes"]) for w in words))

    # 5. Inference MMS_FA par chunks de 30 s pour eviter les OOM
    CHUNK_SEC = 30
    chunk_samples = CHUNK_SEC * bundle.sample_rate
    all_emissions = []
    with torch.inference_mode():
        for start_s in range(0, waveform.shape[1], chunk_samples):
            chunk = waveform[:, start_s : start_s + chunk_samples]
            if chunk.shape[1] < 1600:
                continue
            em, _ = model(chunk)
            all_emissions.append(em)
    emission = torch.cat(all_emissions, dim=1)
    model.cpu()
    del model
    try:
        torch.cuda.empty_cache()
    except Exception:
        pass

    log_probs = emission.log_softmax(dim=-1)
    targets = torch.tensor([flat_tokens], dtype=torch.int32)
    input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
    target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
    paths, scores = F.forced_align(log_probs.cpu(), targets.cpu(), input_lengths, target_lengths, blank=0)
    frame_dur = total_sec / log_probs.shape[1]

    # 6. Extraire start/end par mot depuis les spans CTC
    spans = F.merge_tokens(paths[0], scores[0])
    word_records = []
    for w_idx, s_idx, e_idx, is_mel in word_spans:
        w = words[w_idx]
        if s_idx >= 0 and e_idx <= len(spans) and e_idx > s_idx:
            w_start = spans[s_idx].start * frame_dur
            w_end = spans[e_idx - 1].end * frame_dur
            dur = max(0.04, w_end - w_start)
            score = float(sum(spans[k].score for k in range(s_idx, e_idx)) / (e_idx - s_idx))
            unit_dur = dur / max(0.1, w["total_weight"])
            min_score = -4.5 if is_mel else -2.8
            is_reliable = (unit_dur >= 0.10 and dur >= 0.20 and score > min_score and w_end > w_start)
        else:
            w_start, w_end, dur, score, is_reliable = None, None, None, -5.0, False
        word_records.append({
            "word": w["word"],
            "notes": w["notes"],
            "total_weight": w["total_weight"],
            "start": w_start,
            "end": w_end,
            "score": score,
            "is_reliable": is_reliable,
        })

    # 7. Anti-derive arriere
    last_reliable_end = 0.0
    for wr in word_records:
        if wr["is_reliable"]:
            if wr["start"] < last_reliable_end - 0.2:
                wr["is_reliable"] = False
            else:
                last_reliable_end = wr["end"]

    # 8. Etirement GABC pour les mots non detectes
    i = 0
    while i < len(word_records):
        if not word_records[i]["is_reliable"]:
            p_start = i
            while i < len(word_records) and not word_records[i]["is_reliable"]:
                i += 1
            p_end = i - 1
            t_left = word_records[p_start - 1]["end"] if p_start > 0 else 0.4
            t_right = word_records[p_end + 1]["start"] if p_end < len(word_records) - 1 else total_sec - 0.4
            portion_weight = sum(word_records[k]["total_weight"] for k in range(p_start, p_end + 1))
            avail_dur = max(0.2, t_right - t_left)
            cur_t = t_left
            for k in range(p_start, p_end + 1):
                wr = word_records[k]
                w_dur = (wr["total_weight"] / max(portion_weight, 0.01)) * avail_dur
                wr["start"] = cur_t
                wr["end"] = cur_t + w_dur
                wr["is_reliable"] = False
                cur_t += w_dur
        else:
            i += 1

    # 9. Monotonicite stricte entre mots
    for k in range(len(word_records) - 1):
        if word_records[k]["end"] is not None and word_records[k + 1]["start"] is not None:
            if word_records[k]["end"] > word_records[k + 1]["start"]:
                mid = (word_records[k]["end"] + word_records[k + 1]["start"]) / 2.0
                word_records[k]["end"] = mid
                word_records[k + 1]["start"] = mid

    # 10. Passe 2 : TorchCREPE pour l'alignement intra-mot (note par note)
    try:
        import torchcrepe
        hop_length = 160  # 10 ms a 16 kHz
        fmin, fmax = 80, 800

        # Charger l'audio en numpy pour TorchCREPE
        try:
            import soundfile as _sf
            audio_np, _sr2 = _sf.read(wav_path, dtype="float32")
            if len(audio_np.shape) > 1:
                audio_np = audio_np.mean(axis=1)
        except Exception:
            audio_np = waveform[0].cpu().numpy()

        audio_tensor = torch.tensor(audio_np).unsqueeze(0).to(device_type)
        pitch, periodicity = torchcrepe.predict(
            audio_tensor,
            bundle.sample_rate,
            hop_length=hop_length,
            fmin=fmin,
            fmax=fmax,
            model="full",
            device=device_type,
            batch_size=2048,
            return_periodicity=True,
        )
        pitch_np = pitch.squeeze().cpu().numpy()
        periodicity_np = periodicity.squeeze().cpu().numpy()
        pitch_np[periodicity_np < 0.35] = 0.0
        step_sec = hop_length / bundle.sample_rate
        crepe_available = True
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass
    except Exception as crepe_err:
        print(f"  [INFO] TorchCREPE non disponible ({crepe_err}), utilisation des priors GABC seuls.")
        pitch_np = None
        step_sec = None
        crepe_available = False

    # 11. Generation note par note
    timestamps = []
    note_global_idx = 0

    for wr in word_records:
        w_start = float(wr["start"])
        w_end = float(wr["end"])
        w_dur = max(0.05, w_end - w_start)
        notes = wr["notes"]
        notes_count = len(notes)
        w_weight = wr["total_weight"]

        if notes_count == 0:
            continue

        gabc_priors = compute_gabc_duration_priors(notes)
        has_repeated = any(n.get("repeated", False) for n in notes)

        if crepe_available and pitch_np is not None and step_sec is not None:
            idx_start = int(w_start / step_sec)
            idx_end = int(w_end / step_sec)
            local_pitch = pitch_np[idx_start : min(idx_end, len(pitch_np))]

            boundaries, confidence = detect_pitch_plateaus(local_pitch, notes_count)
            note_starts = blend_detection_with_priors(
                w_start, w_end, notes_count,
                boundaries, confidence,
                gabc_priors, has_repeated
            )
        else:
            # Fallback : priors GABC seuls (pas de TorchCREPE)
            confidence = 0.0
            cum = np.cumsum(np.insert(gabc_priors, 0, 0.0))[:-1]
            note_starts = [round(float(w_start + t * w_dur), 3) for t in cum]

        for i_n, (n_meta, n_start) in enumerate(zip(notes, note_starts)):
            if i_n + 1 < len(note_starts):
                n_end = note_starts[i_n + 1]
            else:
                n_end = w_end
            n_dur = max(0.02, round(n_end - n_start, 3))
            timestamps.append({
                "note_index": note_global_idx,
                "pitch": n_meta.get("pitch_letter", n_meta.get("token", "?")),
                "word": wr["word"],
                "start": round(n_start, 3),
                "end": round(min(n_end, total_sec), 3),
                "duration": n_dur,
                "confidence": round(float(confidence if crepe_available else 0.3), 2),
            })
            note_global_idx += 1

    # 12. Raccordement inter-mots : la derniere note du mot reste active jusqu'au debut du mot suivant
    for idx in range(len(timestamps) - 1):
        if timestamps[idx]["word"] != timestamps[idx + 1]["word"]:
            nxt_start = timestamps[idx + 1]["start"]
            if nxt_start > timestamps[idx]["end"]:
                timestamps[idx]["end"] = nxt_start
                timestamps[idx]["duration"] = round(nxt_start - timestamps[idx]["start"], 3)

    return timestamps, total_sec

def download_youtube_audio(yt_url: str, output_path: str):
    """Télécharge la piste audio YouTube en WAV 16kHz mono via yt-dlp."""
    import yt_dlp
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
        "no_warnings": True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([yt_url])
    
    # yt-dlp ajoute l'extension .wav automatiquement
    final_wav = output_path + ".wav"
    if os.path.exists(final_wav):
        return final_wav
    if os.path.exists(output_path):
        return output_path
    raise FileNotFoundError(f"Fichier audio non généré : {final_wav}")


def format_duration(seconds: float) -> str:
    """Formate une durée en secondes en texte lisible (ex: 1h 12m 45s)."""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}h {m:02d}m {s:02d}s"
    elif m > 0:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def print_session_summary(worker_name: str, server_url: str, count: int, elapsed_sec: float, reason: str = "Fin de session"):
    """Affiche le récapitulatif liturgique de fin de session avec le lien de relecture directe du lot."""
    xp_earned = count * 25
    dur_str = format_duration(elapsed_sec)
    review_url = f"{server_url}/worker?worker={urllib.parse.quote(worker_name)}#batch"

    print("\n" + "=" * 75)
    print(f"  ✦ {reason.upper()} — SCRIPTORIUM OREMUS ✦")
    print(f"  ✦ Contributeur       : \033[92m{worker_name}\033[0m")
    print(f"  ✦ Temps consacré     : \033[94m{dur_str}\033[0m")
    print(f"  ✦ Chants synchronisés: \033[93m{count} pièces\033[0m")
    print(f"  ✦ Enluminure gagnée  : \033[92m+{xp_earned} XP liturgiques\033[0m")
    print("-" * 75)
    print("  ✦ Inspectez et validez immédiatement votre lot de partitions alignées :")
    print(f"  ✦ \033[96m{review_url}\033[0m")
    print("  (Chaque validation approuvée vous accorde +10 XP supplémentaires !)")
    print("=" * 75 + "\n")


def request_json(url: str, method: str = "GET", payload: dict = None, timeout: int = 15):
    """Effectue un appel API HTTP standard avec urllib."""
    headers = {"User-Agent": "Oremus-Distributed-Worker/1.0", "Content-Type": "application/json", "Accept": "application/json"}
    data_bytes = json.dumps(payload).encode("utf-8") if payload is not None else None
    
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# État global de session pour bilan en cas d'interruption
SESSION_STATE = {
    "worker_name": "",
    "server_url": DEFAULT_SERVER,
    "jobs_processed": 0,
    "start_time": time.time()
}


def main():
    print(BANNER)
    ensure_dependencies()

    parser = argparse.ArgumentParser(description="Worker de calcul distribué pour Oremus")
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"Adresse du serveur Coolify (défaut: {DEFAULT_SERVER})")
    parser.add_argument("--name", default="", help="Votre pseudo pour le tableau des contributeurs")
    parser.add_argument("--duration", type=float, default=0.0, help="Durée de la session en minutes (0 = continu/illimité)")
    parser.add_argument("--max-jobs", type=int, default=0, help="Nombre max de pièces à traiter (0 = infini)")
    args = parser.parse_args()

    server_url = args.server.rstrip("/")
    worker_name = args.name.strip()

    # Saisie obligatoire du prénom ou pseudo AVANT tout calcul pour compter les points
    while not worker_name or worker_name.lower() in ("ami", "anonyme", "ami-anonyme", "unknown"):
        print("\n" + "=" * 75)
        print("  ✦ SAISIE OBLIGATOIRE DU PRÉNOM OU PSEUDO POUR COMPTER VOS POINTS ✦")
        print("  Chaque chant aligné vous rapporte +25 XP et s'inscrit à votre nom.")
        print("=" * 75)
        try:
            worker_name = input("✦ Entrez votre prénom ou pseudo (obligatoire) : ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nArrêt du programme.")
            sys.exit(0)
        
        if not worker_name:
            print("\033[91m✦ [ERREUR] Le nom est obligatoire pour comptabiliser vos points et vos chants !\033[0m")
        elif worker_name.lower() in ("ami", "anonyme", "ami-anonyme", "unknown"):
            print("\033[91m✦ [ERREUR] Veuillez choisir un prénom ou pseudo personnalisé pour compter vos points.\033[0m")
            worker_name = ""

    check_and_enable_cuda()
    device_type, device_desc = detect_device()

    SESSION_STATE["worker_name"] = worker_name
    SESSION_STATE["server_url"] = server_url
    SESSION_STATE["start_time"] = time.time()

    max_duration_sec = args.duration * 60.0 if args.duration > 0 else 0.0

    print(f"  ✦ Contributeur : \033[92m{worker_name}\033[0m")
    print(f"  ✦ Accélération : \033[94m{device_desc}\033[0m")
    print(f"  ✦ Serveur      : \033[96m{server_url}\033[0m")
    if max_duration_sec > 0:
        print(f"  ✦ Durée        : \033[93m{args.duration:g} minute(s)\033[0m (arrêt auto en fin de session)\n")
    else:
        print(f"  ✦ Durée        : \033[93mEn continu\033[0m (arrêt possible à tout instant avec Ctrl+C)\n")
    print("=" * 75)

    jobs_processed = 0

    while True:
        elapsed = time.time() - SESSION_STATE["start_time"]
        if max_duration_sec > 0 and elapsed >= max_duration_sec:
            print_session_summary(worker_name, server_url, jobs_processed, elapsed, reason="Durée de session impartie atteinte")
            break

        if args.max_jobs > 0 and jobs_processed >= args.max_jobs:
            print_session_summary(worker_name, server_url, jobs_processed, elapsed, reason=f"Quota de {args.max_jobs} pièces atteint")
            break

        print(f"\n[*] Recherche d'une tâche à aligner auprès du serveur...")
        claim_url = f"{server_url}/api/jobs/claim?worker_id={urllib.parse.quote(worker_name)}"
        
        try:
            resp = request_json(claim_url, method="GET")
        except Exception as e:
            print(f"[WARN] Impossible de joindre le serveur ({e}). Nouvelle tentative dans 10 secondes...")
            time.sleep(10)
            continue

        job = resp.get("job")
        if not job:
            status_msg = resp.get("message", "Aucune pièce en attente pour le moment.")
            print(f"[INFO] {status_msg}")
            print("[*] Le corpus actuel est complètement aligné ou toutes les tâches sont en cours.")
            print("[*] En attente de nouveaux chants (vérification dans 15 secondes)...")
            time.sleep(15)
            continue

        piece_id = job.get("id")
        title = job.get("incipit") or job.get("title") or f"Chant #{piece_id}"
        yt_url = job.get("youtube_url") or (f"https://www.youtube.com/watch?v={job.get('youtube_id')}" if job.get("youtube_id") else None)
        gabc_src = job.get("gabc_src") or ""

        print(f"\n>>> [TÂCHE {jobs_processed + 1}] Pièce : \033[1m{title}\033[0m (ID: {piece_id})")
        if not yt_url:
            print(f"  [ERREUR] Aucun lien YouTube pour la pièce {piece_id}. Signalement au serveur...")
            try:
                request_json(f"{server_url}/api/jobs/submit", method="POST", payload={
                    "piece_id": piece_id, "worker_id": worker_name, "error": "missing_youtube_url", "status": "failed"
                })
            except Exception:
                pass
            continue

        start_time = time.time()
        temp_dir = tempfile.mkdtemp(prefix="oremus_audio_")
        temp_out = os.path.join(temp_dir, f"audio_{piece_id}")
        wav_file = None

        try:
            # 1. Téléchargement audio
            print(f"  [1/3] Téléchargement de la piste audio YouTube...")
            wav_file = download_youtube_audio(yt_url, temp_out)

            # 2. Alignement MMS_FA
            print(f"  [2/3] Calcul de l'alignement note-par-note (MMS_FA + TorchCREPE) ({device_type})...")
            timestamps, audio_dur = compute_alignment_mms(wav_file, gabc_src, device_type)
            duration_sec = round(time.time() - start_time, 2)

            print(f"  [3/3] Alignement réussi : {len(timestamps)} notes synchronisées sur {audio_dur:.1f}s d'audio (calcul en {duration_sec}s).")

            # 3. Soumission au serveur
            submit_payload = {
                "piece_id": piece_id,
                "worker_id": worker_name,
                "timestamps": timestamps,
                "notes_count": len(timestamps),
                "audio_duration_sec": audio_dur,
                "compute_device": device_desc,
                "compute_time_sec": duration_sec,
                "status": "completed"
            }

            sub_resp = request_json(f"{server_url}/api/jobs/submit", method="POST", payload=submit_payload)
            if sub_resp.get("success"):
                print(f"  \033[92m[SUCCÈS]\033[0m Enregistré avec succès sur le serveur ! Total de vos contributions : {sub_resp.get('worker_total', jobs_processed + 1)} chant(s).")
                jobs_processed += 1
                SESSION_STATE["jobs_processed"] = jobs_processed
            else:
                print(f"  [WARN] Le serveur a retourné une réponse inattendue : {sub_resp}")

        except (ImportError, ModuleNotFoundError) as mod_err:
            print(f"\n  \033[91m[ERREUR ENVIRONNEMENT]\033[0m Module manquant lors du calcul : {mod_err}")
            print(f"  La tâche {piece_id} n'a pas été marquée comme échouée sur le serveur.")
            print("  Veuillez réinstaller les dépendances : pip install -r requirements.txt\n")
            break

        except Exception as err:
            print(f"  \033[91m[ÉCHEC]\033[0m Erreur lors du calcul de la pièce {piece_id} : {err}")
            try:
                request_json(f"{server_url}/api/jobs/submit", method="POST", payload={
                    "piece_id": piece_id, "worker_id": worker_name, "error": str(err), "status": "failed"
                })
            except Exception:
                pass

        finally:
            # Nettoyage immédiat des fichiers temporaires pour ne pas saturer le disque
            if wav_file and os.path.exists(wav_file):
                try: os.unlink(wav_file)
                except Exception: pass
            try:
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

        time.sleep(1.0)


if __name__ == "__main__":
    import urllib.parse
    try:
        main()
    except KeyboardInterrupt:
        elapsed = time.time() - SESSION_STATE["start_time"]
        print_session_summary(
            SESSION_STATE["worker_name"] or get_default_worker_name(),
            SESSION_STATE["server_url"],
            SESSION_STATE["jobs_processed"],
            elapsed,
            reason="Session interrompue (Ctrl+C)"
        )
        sys.exit(0)
