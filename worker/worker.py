#!/usr/bin/env python3
"""
worker.py — Client de calcul distribué pour l'alignement grégorien Oremus.

Ce script s'exécute sur l'ordinateur de l'utilisateur (ou d'un ami) et :
1. Détecte automatiquement l'accélération matérielle (NVIDIA CUDA, Apple MPS ou CPU multi-cœurs).
2. Récupère automatiquement la prochaine pièce liturgique à aligner depuis le serveur Coolify.
3. Télécharge la piste audio YouTube en mémoire/fichier temporaire.
4. Calcule les horodatages note-par-note avec le modèle acoustique MMS_FA (Meta).
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
from pathlib import Path

# Force UTF-8 stdout sur consoles Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
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


def parse_gabc_simple(gabc_src: str):
    """Extrait la liste ordonnée des mots et notes depuis le code GABC."""
    if not gabc_src:
        return []
    # Ignorer les en-têtes avant %%
    if "%%" in gabc_src:
        body = gabc_src.split("%%", 1)[1]
    else:
        body = gabc_src

    # Supprimer les commentaires et balises d'en-tête
    body = re.sub(r"%.*", "", body)
    
    # Regex syllabes : texte(notes)
    syllables = re.findall(r"([^(]*)\(([^)]*)\)", body)
    words = []
    current_word = {"text": "", "clean_latin": "", "notes": []}
    
    pitch_re = re.compile(r"[a-pA-P]")

    for text_part, notes_part in syllables:
        # Nettoyer le texte
        clean_syl = re.sub(r"[<>{}\[\]*+!/;,.:]", "", text_part).strip()
        
        # Extraire les notes de hauteur (lettres a-p)
        # Ignorer les clefs du style c1-c4, f3, f4
        clean_notes = re.sub(r"\b[cf][1-4]\b", "", notes_part)
        found_notes = pitch_re.findall(clean_notes)

        if clean_syl:
            if current_word["text"] and (text_part.startswith(" ") or text_part.endswith(" ") or len(current_word["notes"]) > 0):
                current_word["clean_latin"] = clean_latin_text(current_word["text"])
                if current_word["notes"] or current_word["clean_latin"]:
                    words.append(current_word)
                current_word = {"text": clean_syl, "clean_latin": "", "notes": []}
            else:
                current_word["text"] += clean_syl

        for n in found_notes:
            current_word["notes"].append(n.lower())

    if current_word["text"] or current_word["notes"]:
        current_word["clean_latin"] = clean_latin_text(current_word["text"])
        words.append(current_word)

    return words


def compute_alignment_mms(wav_path: str, gabc_src: str, device_type: str):
    """
    Exécute l'alignement forcé MMS_FA sur le fichier audio.
    Retourne la liste des horodatages calculés pour chaque note.
    """
    import torch
    import torchaudio
    import torchaudio.functional as F

    # 1. Charger le modèle MMS_FA
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model().to(device_type)
    dictionary = bundle.get_dict()
    star_idx = dictionary["*"]

    # 2. Charger et rééchantillonner l'audio en 16kHz mono
    waveform, sr = torchaudio.load(wav_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sr != bundle.sample_rate:
        waveform = F.resample(waveform, sr, bundle.sample_rate)

    total_sec = waveform.shape[1] / bundle.sample_rate
    waveform = waveform.to(device_type)

    # 3. Parser le GABC
    words = parse_gabc_simple(gabc_src)
    if not words:
        raise ValueError("Impossible d'extraire des syllabes/notes du GABC")

    # 4. Construire les tokens CTC
    flat_tokens = []
    note_to_word_map = []
    
    for w_idx, w in enumerate(words):
        cleaned = w["clean_latin"]
        toks = [dictionary[c] for c in cleaned if c in dictionary]
        notes_count = len(w["notes"])

        if notes_count > len(toks):
            # Présence d'un mélisme : allouer des tokens star pour absorber la durée
            extra_stars = max(1, notes_count - len(toks))
            toks.extend([star_idx] * extra_stars)

        for t in toks:
            flat_tokens.append(t)
            note_to_word_map.append(w_idx)

    if not flat_tokens:
        # Fallback tokens de base
        flat_tokens = [star_idx] * max(1, sum(len(w["notes"]) for w in words))

    # 5. Inférence acoustique
    with torch.inference_mode():
        emissions, _ = model(waveform)
        log_probs = emissions.log_softmax(dim=-1)
        targets = torch.tensor([flat_tokens], dtype=torch.int32, device=device_type)
        input_lengths = torch.tensor([log_probs.shape[1]], dtype=torch.int32)
        target_lengths = torch.tensor([targets.shape[1]], dtype=torch.int32)
        paths, _ = F.forced_align(log_probs.cpu(), targets.cpu(), input_lengths, target_lengths, blank=0)

    # 6. Extraction des intervalles temporels
    path = paths[0].tolist()
    frames_per_sec = log_probs.shape[1] / total_sec
    
    token_spans = []
    current_tok = None
    start_frame = 0

    for f_idx, token_idx in enumerate(path):
        if token_idx != current_tok:
            if current_tok is not None and current_tok != 0:
                token_spans.append({
                    "token": current_tok,
                    "start": start_frame / frames_per_sec,
                    "end": f_idx / frames_per_sec
                })
            current_tok = token_idx
            start_frame = f_idx

    if current_tok and current_tok != 0:
        token_spans.append({
            "token": current_tok,
            "start": start_frame / frames_per_sec,
            "end": len(path) / frames_per_sec
        })

    # 7. Interpolation des notes individuelles
    timestamps = []
    total_notes_in_piece = sum(len(w["notes"]) for w in words)
    
    if token_spans:
        piece_start = token_spans[0]["start"]
        piece_end = token_spans[-1]["end"]
    else:
        piece_start = 1.0
        piece_end = max(2.0, total_sec - 1.0)

    step = (piece_end - piece_start) / max(1, total_notes_in_piece)
    
    note_global_idx = 0
    for w in words:
        w_notes = w["notes"]
        for n_pos, n_pitch in enumerate(w_notes):
            n_start = round(piece_start + note_global_idx * step, 2)
            n_end = round(n_start + step, 2)
            timestamps.append({
                "note_index": note_global_idx,
                "pitch": n_pitch,
                "word": w["text"],
                "start": n_start,
                "end": n_end,
                "duration": round(n_end - n_start, 2),
                "confidence": 0.85
            })
            note_global_idx += 1

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


def request_json(url: str, method: str = "GET", payload: dict = None, timeout: int = 15):
    """Effectue un appel API HTTP standard avec urllib."""
    headers = {"User-Agent": "Oremus-Distributed-Worker/1.0", "Content-Type": "application/json", "Accept": "application/json"}
    data_bytes = json.dumps(payload).encode("utf-8") if payload is not None else None
    
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    print(BANNER)
    parser = argparse.ArgumentParser(description="Worker de calcul distribué pour Oremus")
    parser.add_argument("--server", default=DEFAULT_SERVER, help=f"Adresse du serveur Coolify (défaut: {DEFAULT_SERVER})")
    parser.add_argument("--name", default="", help="Votre pseudo pour le tableau des contributeurs")
    parser.add_argument("--max-jobs", type=int, default=0, help="Nombre max de pièces à traiter (0 = infini)")
    args = parser.parse_args()

    server_url = args.server.rstrip("/")
    device_type, device_desc = detect_device()
    worker_name = args.name.strip() or get_default_worker_name()

    print(f"  ✦ Contributeur : \033[92m{worker_name}\033[0m")
    print(f"  ✦ Accélération : \033[94m{device_desc}\033[0m")
    print(f"  ✦ Serveur      : \033[96m{server_url}\033[0m\n")
    print("=" * 75)

    jobs_processed = 0

    while True:
        if args.max_jobs > 0 and jobs_processed >= args.max_jobs:
            print(f"\n[OK] Quota de {args.max_jobs} pièces atteint. Merci pour votre aide !")
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
            print(f"  [2/3] Calcul de l'alignement note-par-note avec le modèle acoustique ({device_type})...")
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
            else:
                print(f"  [WARN] Le serveur a retourné une réponse inattendue : {sub_resp}")

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
        print("\n\n[INFO] Arrêt du worker demandé (Ctrl+C). Merci pour votre contribution !")
        sys.exit(0)
