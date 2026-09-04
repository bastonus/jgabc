import os
import re
import gc
import json
import numpy as np

# Optional/Lazy heavy ML & audio imports
try:
    import torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
except ImportError:
    torch = None
    DEVICE = "cpu"

try:
    import librosa
except ImportError:
    librosa = None

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    import whisperx
except ImportError:
    whisperx = None

try:
    import torchcrepe
except ImportError:
    torchcrepe = None

try:
    from scipy.signal import medfilt
except ImportError:
    medfilt = None

AUDIO_DIR = "./audio_corpus"
INTERMEDIATE_DIR = "./temp_word_data"
OUTPUT_DIR = "./final_timestamps"

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(INTERMEDIATE_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =====================================================================
# 1. TÉLÉCHARGEMENT AUDIO
# =====================================================================

def download_youtube_wav(url: str, output_name: str) -> str:
    """Télécharge la piste audio YouTube et l'extrait en WAV 16kHz."""
    target_path = os.path.join(AUDIO_DIR, f"{output_name}.wav")
    if os.path.exists(target_path):
        return target_path
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(AUDIO_DIR, output_name),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return target_path


# =====================================================================
# 2. VRAI PARSEUR GABC (syntaxe officielle Gregorio)
# =====================================================================

# Une note = 1 lettre de hauteur (a-p, incl. majuscules) suivie d'un nombre
# variable de modificateurs de forme (o w v V s ~ < > = r R x X y #) et de
# signes rythmiques (. .. _ + digits ' '0 '1), le tout collé sans espace.
# On tokenise en isolant chaque lettre de hauteur comme début d'un nouveau
# token, puis en absorbant tout ce qui suit jusqu'à la prochaine lettre de
# hauteur ou un séparateur/barre.

_PITCH = r"[a-pA-P]"
_SHAPE_MODS = r"(?:o|w|W|v|V|s|~|<|>|=|r0|r1|r2|r3|r4|r5|r6|r7|r8|R|x\??|X|y\??|Y|##?\??|q|O)*"
_RHYTHM_MODS = r"(?:\.{1,2})?(?:_\d*)?(?:'\d?)?"
_NOTE_TOKEN_RE = re.compile(_PITCH + _SHAPE_MODS + _RHYTHM_MODS)

_BAR_RE = re.compile(r"^(`0?|\^0?|,0?|;\d?|:\??|::)$")
_SEPARATOR_RE = re.compile(r"^/{1,2}$|^/\[.*\]$|^!$")
_IGNORABLE_BRACKET_RE = re.compile(r"\[[^\]]*\]")  # [cs:...], [oh:...], [nocustos], etc.

# --- FIX v3.1 --------------------------------------------------------
# Une clef s'écrit lettre (c ou f) + bémol optionnel (b) + UN CHIFFRE
# (c3, f4, cb2, fb3...). Ce chiffre n'appartient à aucun groupe de
# _SHAPE_MODS ni _RHYTHM_MODS : si on laisse _NOTE_TOKEN_RE essayer de
# matcher en premier, il ne capture que la lettre ("c"), qui échoue
# ensuite le test _CLEF_RE (qui exige le chiffre) et se retrouve donc
# ajoutée comme une note fantôme, pendant que le chiffre est avalé en
# silence au tour de boucle suivant. Ça décale d'un cran l'alignement
# entre les mots GABC et les mots WhisperX pour quasiment toutes les
# pièces (elles commencent presque toutes par une clef). Le garde-fou
# ci-dessous doit être testé AVANT _NOTE_TOKEN_RE, sur la chaîne brute.
_CLEF_TOKEN_RE = re.compile(r"^(c|f)b?\d")
# ----------------------------------------------------------------------


def duration_weight_for_token(token: str) -> float:
    weight = 1.0
    if ".." in token:
        weight *= 2.4   # double punctum mora
    elif "." in token:
        weight *= 1.9   # punctum mora simple
    if "_" in token:
        weight *= 1.25  # épisème horizontal
    if "w" in token or "W" in token:
        weight *= 0.9   # quilisma : tend à raccourcir légèrement
    return weight


def is_repeated_note_group(prev_token: str, token: str) -> bool:
    """Détecte une note répétée sans variation de hauteur (distropha,
    tristropha, bivirga, trivirga, stropha simple) : cas où l'audio n'offre
    aucun repère de hauteur pour séparer les notes.

    NB : la détection se fait sur le suffixe du token courant (ss/sss/vv/vvv).
    `prev_token` n'est pour l'instant pas exploité — une comparaison de
    hauteur avec la note précédente permettrait de couvrir plus de formes
    de répétition mais n'a pas été implémentée."""
    return bool(re.search(r"(ss|sss|vv|vvv)$", token))


def tokenize_gabc_notes(raw_notes: str) -> list:
    """
    Découpe le contenu d'une parenthèse GABC (ex. 'e.f!gwhhi') en une
    liste de notes individuelles, en écartant clés, barres, séparateurs
    et texte de traduction.

    Chaque note retournée est un dict
    {"token": str, "duration_weight": float, "repeated": bool}.
    """
    # Retire les crochets [texte] (traductions) et code (nocustos, oh:, etc.)
    cleaned = _IGNORABLE_BRACKET_RE.sub("", raw_notes)

    # Isole les séparateurs de neumes pour ne pas les avaler dans un token de note
    cleaned = re.sub(r"(/{1,2}|!)", r" \1 ", cleaned)

    notes = []
    pos = 0
    prev_token = ""

    while pos < len(cleaned):
        chunk = cleaned[pos:]

        if chunk[0].isspace():
            pos += 1
            continue

        # --- Garde-fou clef, testé sur la chaîne BRUTE, avant toute
        # tentative de matching de note (cf. commentaire FIX v3.1) ---
        clef_match = _CLEF_TOKEN_RE.match(chunk)
        if clef_match:
            pos += len(clef_match.group(0))
            continue
        # ---------------------------------------------------------------

        m = _NOTE_TOKEN_RE.match(chunk)
        if m and m.group(0):
            token = m.group(0)
            notes.append({
                "token": token,
                "duration_weight": duration_weight_for_token(token),
                "repeated": is_repeated_note_group(prev_token, token),
            })
            prev_token = token
            pos += len(token)
            continue

        # Barres, séparateurs, ou caractère non reconnu : on saute un caractère
        bar_match = re.match(r"`0?|\^0?|,0?|;\d?|:\??|::", chunk)
        if bar_match:
            pos += len(bar_match.group(0))
            continue

        pos += 1

    return notes


def parse_gabc_file(gabc_source: str) -> list:
    """
    Parse un fichier GABC complet (headers + %% + notation) en une liste
    de mots, chacun composé de syllabes, chacune composée de notes issues
    de tokenize_gabc_notes.

    Renvoie une structure aplatie par mot :
    [{"word": str, "notes": [...]}]
    """
    if "%%" in gabc_source:
        _, notation = gabc_source.split("%%", 1)
    else:
        notation = gabc_source

    syllable_re = re.compile(r"([^()]*)\(([^()]*)\)")

    words = []
    current_word = {"word": "", "notes": []}

    for match in syllable_re.finditer(notation):
        text_part, notes_part = match.group(1), match.group(2)
        notes = tokenize_gabc_notes(notes_part)
        current_word["notes"].extend(notes)

        clean_text = re.sub(r"\[[^\]]*\]|<[^>]*>", "", text_part)
        current_word["word"] += clean_text.strip()

        if re.search(r"\s$", text_part) or (notes_part.strip() == "" and current_word["word"]):
            if current_word["word"]:
                words.append(current_word)
            current_word = {"word": "", "notes": []}

    if current_word["word"] or current_word["notes"]:
        words.append(current_word)

    return [w for w in words if w["notes"]]


# =====================================================================
# 3. PRIORS DE DURÉE DÉRIVÉS DU GABC
# =====================================================================

def compute_gabc_duration_priors(notes: list) -> np.ndarray:
    """
    Convertit la liste de notes (avec duration_weight déjà calculé par
    tokenize_gabc_notes) en un vecteur de poids normalisé, utilisé comme
    prior quand la détection audio est peu fiable.
    """
    weights = np.array([n["duration_weight"] for n in notes], dtype=np.float64)
    return weights / weights.sum()


# =====================================================================
# 4. PASSE 1 : ANCRAGE TEMPOREL DES MOTS (WHISPERX)
# =====================================================================

def run_pass_1_word_alignment(dataset_manifest: list):
    """Traite l'ensemble des fichiers avec WhisperX, puis vide la VRAM."""
    print(f"\n[Passe 1/3] Démarrage WhisperX sur {len(dataset_manifest)} fichiers...")

    align_model, metadata = whisperx.load_align_model(language_code="la", device=DEVICE)

    for item in dataset_manifest:
        file_id = item["id"]
        wav_path = os.path.join(AUDIO_DIR, f"{file_id}.wav")
        interm_file = os.path.join(INTERMEDIATE_DIR, f"{file_id}_words.json")

        if os.path.exists(interm_file):
            continue

        audio = whisperx.load_audio(wav_path)
        duration = len(audio) / 16000.0
        full_text = " ".join([w["word"] for w in item["gabc_words"]])
        fake_segments = [{"text": full_text, "start": 0.0, "end": duration}]
        aligned_result = whisperx.align(fake_segments, align_model, metadata, audio, DEVICE)

        with open(interm_file, "w", encoding="utf-8") as f_out:
            json.dump(aligned_result["word_segments"], f_out, ensure_ascii=False, indent=2)

    del align_model
    del metadata
    gc.collect()
    torch.cuda.empty_cache()
    print("[Passe 1/3] Terminée. VRAM libérée.")


# =====================================================================
# 5. PASSE 2 : DÉTECTION DE REPRISES / REFRAINS
# =====================================================================

def detect_textual_repeat_blocks(gabc_words: list) -> dict | None:
    """Repère si le début du texte (ex. incipit d'un répons) réapparaît
    plus loin dans le même texte GABC."""
    words = [w["word"].lower() for w in gabc_words]
    if len(words) < 4:
        return None
    incipit_len = min(4, len(words) // 3)
    incipit = words[:incipit_len]
    for start in range(incipit_len, len(words) - incipit_len + 1):
        window = words[start:start + incipit_len]
        if window == incipit:
            return {
                "initial_block": (0, incipit_len),
                "repeat_candidate": (start, start + incipit_len)
            }
    return None


def validate_repeat_via_audio(
    audio: np.ndarray,
    sr: int,
    initial_time_range: tuple,
    candidate_time_range: tuple,
    correlation_threshold: float = 0.75
) -> bool:
    """Confirme une reprise textuelle par corrélation de chroma entre le
    segment initial et le segment candidat repéré dans le texte."""
    def chroma_of(t0, t1):
        s0, s1 = int(t0 * sr), int(t1 * sr)
        segment = audio[s0:s1]
        if len(segment) < sr * 0.5:
            return None
        return librosa.feature.chroma_cqt(y=segment, sr=sr)

    c_init = chroma_of(*initial_time_range)
    c_cand = chroma_of(*candidate_time_range)
    if c_init is None or c_cand is None:
        return False
    n = min(c_init.shape[1], c_cand.shape[1])
    if n < 4:
        return False
    correlation = np.corrcoef(c_init[:, :n].flatten(), c_cand[:, :n].flatten())[0, 1]
    return bool(correlation >= correlation_threshold)


def run_pass_2_repeat_detection(dataset_manifest: list):
    """Détecte puis valide les reprises/refrains pour chaque pièce."""
    print(f"\n[Passe 2/3] Détection des reprises/refrains sur {len(dataset_manifest)} fichiers...")

    for item in dataset_manifest:
        file_id = item["id"]
        wav_path = os.path.join(AUDIO_DIR, f"{file_id}.wav")
        interm_file = os.path.join(INTERMEDIATE_DIR, f"{file_id}_words.json")
        repeat_file = os.path.join(INTERMEDIATE_DIR, f"{file_id}_repeat.json")

        if os.path.exists(repeat_file) or not os.path.exists(interm_file):
            continue

        block_info = detect_textual_repeat_blocks(item["gabc_words"])
        result = {"repeat_expected_in_text": block_info is not None, "repeat_present": False}

        if block_info is not None:
            with open(interm_file, "r", encoding="utf-8") as f_in:
                word_segments = json.load(f_in)

            i0, i1 = block_info["initial_block"]
            c0, c1 = block_info["repeat_candidate"]

            if i1 <= len(word_segments) and c1 <= len(word_segments):
                init_range = (
                    word_segments[i0].get("start", 0.0),
                    word_segments[i1 - 1].get("end", 0.0)
                )
                cand_range = (
                    word_segments[c0].get("start", 0.0),
                    word_segments[c1 - 1].get("end", 0.0)
                )
                audio, sr = librosa.load(wav_path, sr=16000)
                result["repeat_present"] = validate_repeat_via_audio(audio, sr, init_range, cand_range)
                result["block_info"] = block_info

        with open(repeat_file, "w", encoding="utf-8") as f_out:
            json.dump(result, f_out)

        status = "confirmée" if result["repeat_present"] else "absente/non détectée"
        print(f"  → {file_id} : reprise {status}")

    print("[Passe 2/3] Terminée.")


# =====================================================================
# 6. PASSE 3 : DÉCOUPAGE NOTE PAR NOTE (CREPE + paliers + priors GABC)
# =====================================================================

def detect_pitch_plateaus(
    local_pitch: np.ndarray,
    notes_count: int,
    smoothing_kernel: int = 5,
    min_semitone_jump: float = 0.5
):
    """Détecte les frontières de notes par analyse des paliers de fréquence,
    avec un score de confiance basé sur l'écart entre le nombre de paliers
    détectés et le nombre de notes attendu."""
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
    smoothed = medfilt(filled, kernel_size=kernel)

    deriv = np.abs(np.diff(smoothed))
    candidate_idx = np.where(deriv > min_semitone_jump)[0]

    boundaries = []
    for idx in candidate_idx:
        if not boundaries or idx - boundaries[-1] > 2:
            boundaries.append(int(idx))

    detected_count = len(boundaries) + 1
    confidence = 1.0 - min(abs(detected_count - notes_count) / max(notes_count, 1), 1.0)
    return boundaries, confidence


def blend_detection_with_priors(
    w_start: float,
    w_end: float,
    notes_count: int,
    detected_boundaries: list | None,
    confidence: float,
    gabc_priors: np.ndarray,
    has_repeated_notes: bool
) -> list:
    """
    Combine les frontières détectées par CREPE et le prior de durée du GABC,
    pondérés par la confiance.

    Si le groupe contient des notes répétées sans saut de hauteur (bivirga,
    tristropha...), la confiance du signal audio est plafonnée car il n'y a
    structurellement aucun repère de hauteur pour les distinguer.
    """
    duration = w_end - w_start
    prior_times = w_start + np.cumsum(np.insert(gabc_priors, 0, 0.0))[:-1] * duration

    effective_confidence = min(confidence, 0.4) if has_repeated_notes else confidence

    if detected_boundaries is None or len(detected_boundaries) == 0:
        return [round(t, 3) for t in prior_times]

    step_sec = duration / max(len(detected_boundaries) + 1, 1)
    detected_times = [w_start] + [w_start + b * step_sec for b in detected_boundaries]
    detected_times = detected_times[:notes_count]
    while len(detected_times) < notes_count:
        detected_times.append(detected_times[-1] + step_sec)

    blended = [
        effective_confidence * d + (1 - effective_confidence) * p
        for d, p in zip(detected_times, prior_times)
    ]
    return [round(t, 3) for t in blended]


def run_pass_3_note_alignment(dataset_manifest: list):
    """Découpe note par note à l'intérieur de chaque mot, en combinant
    détection de paliers CREPE et priors de durée dérivés du GABC réel."""
    print(f"\n[Passe 3/3] Démarrage TorchCREPE (F0 + paliers + priors) sur {len(dataset_manifest)} fichiers...")

    hop_length = 160  # 10 ms à 16 kHz
    fmin, fmax = 80, 800

    for item in dataset_manifest:
        file_id = item["id"]
        wav_path = os.path.join(AUDIO_DIR, f"{file_id}.wav")
        interm_file = os.path.join(INTERMEDIATE_DIR, f"{file_id}_words.json")
        repeat_file = os.path.join(INTERMEDIATE_DIR, f"{file_id}_repeat.json")
        final_file = os.path.join(OUTPUT_DIR, f"{file_id}_stamps.json")

        if not os.path.exists(interm_file):
            continue

        audio, sr = librosa.load(wav_path, sr=16000)
        audio_tensor = torch.tensor(audio).unsqueeze(0).to(DEVICE)

        pitch, periodicity = torchcrepe.predict(
            audio_tensor,
            sr,
            hop_length=hop_length,
            fmin=fmin,
            fmax=fmax,
            model='full',
            device=DEVICE,
            batch_size=2048,
            return_periodicity=True,
        )
        pitch = pitch.squeeze().cpu().numpy()
        periodicity = periodicity.squeeze().cpu().numpy()
        pitch[periodicity < 0.35] = 0.0

        with open(interm_file, "r", encoding="utf-8") as f_in:
            word_segments = json.load(f_in)

        repeat_info = {"repeat_present": False}
        if os.path.exists(repeat_file):
            with open(repeat_file, "r", encoding="utf-8") as f_in:
                repeat_info = json.load(f_in)

        step_sec = hop_length / sr
        notes_out = []

        for word_info, word_meta in zip(word_segments, item["gabc_words"]):
            w_start = word_info.get("start", 0.0)
            w_end = word_info.get("end", w_start + 1.0)
            notes_meta = word_meta["notes"]
            notes_count = len(notes_meta)
            has_repeated = any(n["repeated"] for n in notes_meta)

            idx_start = int(w_start / step_sec)
            idx_end = int(w_end / step_sec)
            local_pitch = pitch[idx_start:idx_end]

            gabc_priors = compute_gabc_duration_priors(notes_meta)
            boundaries, confidence = detect_pitch_plateaus(local_pitch, notes_count)

            times = blend_detection_with_priors(
                w_start, w_end, notes_count,
                boundaries, confidence,
                gabc_priors, has_repeated
            )

            for t, n_meta in zip(times, notes_meta):
                notes_out.append({
                    "t": int(t * 100),
                    "confidence": round(confidence, 2),
                    "token": n_meta["token"],
                })

        # Duplication de la reprise si confirmée par la passe 2
        if repeat_info.get("repeat_present") and "block_info" in repeat_info:
            i0, i1 = repeat_info["block_info"]["initial_block"]
            c0, _ = repeat_info["block_info"]["repeat_candidate"]
            note_start = sum(len(w["notes"]) for w in item["gabc_words"][:i0])
            note_end = note_start + sum(len(w["notes"]) for w in item["gabc_words"][i0:i1])
            initial_notes = notes_out[note_start:note_end]
            time_offset = word_segments[c0].get("start", 0.0) - word_segments[i0].get("start", 0.0)
            repeated_notes = [
                {
                    "t": n["t"] + int(time_offset * 100),
                    "confidence": n["confidence"],
                    "token": n["token"]
                }
                for n in initial_notes
            ]
            insert_at = sum(len(w["notes"]) for w in item["gabc_words"][:c0])
            notes_out = notes_out[:insert_at] + repeated_notes + notes_out[insert_at:]

        with open(final_file, "w", encoding="utf-8") as f_out:
            json.dump({
                "notes": notes_out,
                "repeat_present": repeat_info.get("repeat_present", False),
            }, f_out)

        avg_conf = np.mean([n["confidence"] for n in notes_out]) if notes_out else 0.0
        print(
            f"  ✓ {file_id} : {len(notes_out)} notes, confiance moyenne {avg_conf:.2f}, "
            f"reprise={'oui' if repeat_info.get('repeat_present') else 'non'}"
        )
        gc.collect()
        torch.cuda.empty_cache()

    print("[Passe 3/3] Terminée. Pipeline achevé.")


# =====================================================================
# 7. EXÉCUTION DU PIPELINE
# =====================================================================

if __name__ == "__main__":
    # Exemple avec un vrai extrait GABC (Populus Sion, cf. INSTRUCTIONS.md §3)
    sample_gabc = (
        "name: Pópulus Sion;\n%%\n"
        "(c3) Pó[People](c3eh)pu(g)lus[/](h) Si(hi)on,(hgh.) *(;) "
        "ec(hihi)ce(e.) Dó(e.f!gwhhi)mi(h)us(h) vé(hi)ni(ig//ih)et(h.) "
        "(,) ad(iv./hig) sal(fe)ván(ghg)das(fg) gen(e_f_e_)tes(e.) :(:)"
    )

    corpus_queue = [
        {
            "id": "populus_sion",
            "youtube_url": "https://www.youtube.com/watch?v=mock_id",
            "gabc_words": parse_gabc_file(sample_gabc),
        }
    ]

    run_pass_1_word_alignment(corpus_queue)
    run_pass_2_repeat_detection(corpus_queue)
    run_pass_3_note_alignment(corpus_queue)
