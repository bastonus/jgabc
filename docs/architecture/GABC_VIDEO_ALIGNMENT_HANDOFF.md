# Handoff – Projet GABC Video Notes Alignment

### 1. Objectif du projet

Aligner des **enregistrements YouTube de chant grégorien** avec le texte et les notes en notation **GABC** (format Gregorio), pour produire des timestamps note-par-note (début et fin de chaque note dans l’audio).

Résultat attendu : pour chaque pièce, un fichier `*_stamps.json` (ou entrée dans le registre `gregorian_alignments.min.json`) qui mappe chaque note GABC à un intervalle temporel `[start, end]` dans la vidéo.

---

### 2. Structure des dossiers

```
GABC-video-notes-alignement/
├── corpus/                          # « base de données » des GABC
│   ├── sources/
│   │   ├── gregobase/               # ~438 fichiers .gabc (IDs numériques)
│   │   ├── komputerwiz_schola_cantorum/
│   │   └── marekklein_transcriptions/
│   ├── sources/gregobase_index.json # Index principal (~18 745 entrées)
│   ├── sources/known_urls.json      # Mapping incipit/titre → URL YouTube
│   └── (autres index / mappings)
├── pipeline/
│   ├── step1_download_audio.py      # Télécharge l'audio YouTube via yt-dlp
│   ├── step2_forced_alignment.py    # CTC forced alignment (Wav2Vec2 / MMS / Whisper)
│   ├── step3_note_segmentation.py   # Découpe les syllabes en notes individuelles
│   ├── step4_validate_output.py     # Contrôle de cohérence (ordre, durée > 0)
│   └── run_pipeline.py              # Orchestrateur
└── lab/                             # Lab visuel HTML/JS pour vérifier/éditer à la main
    ├── alignment-lab.html
    ├── lab_data.js
    └── lab_reviews.json
```

---

### 3. Pipeline en 4 étapes

1. **Step 1 – Download Audio** :
   - Prend une URL YouTube (depuis `known_urls.json` ou argument CLI).
   - Télécharge l'audio au format WAV (16 kHz, mono) dans un dossier cache/temporaire via `yt-dlp`.

2. **Step 2 – Forced Alignment (Texte / Paroles)** :
   - Extrait le texte brut (sans notation musicale) depuis le fichier `.gabc`.
   - Utilise un modèle de forced alignment acoustique (ex. `facebook/mms-1b-all` ou `wav2vec2-large-xlsr-53` adapté au latin ecclésiastique).
   - Produit les timestamps au niveau **mot** et **syllabe**.

3. **Step 3 – Note Segmentation & Heuristique GABC** :
   - Dans Gregorio/GABC, une syllabe textuelle peut contenir 1 à N notes (neumes).
   - Ex. : `De(f)us(ghg.)` → "De" = 1 note (`f`), "us" = 3 notes (`g`, `h`, `g`).
   - Cette étape répartit la durée de la syllabe sur chacune de ses notes :
     - Heuristique basée sur la durée relative des neumes (punctum = 1x, épisème/point = 1.5x - 2x, etc.).
     - Possibilité d'affiner par détection de pitch/F0 (pYIN / CREPE) si activé.

4. **Step 4 – Validation & Export** :
   - Vérifie la monotonie temporelle ($t_{start} < t_{end} \le t_{next\_start}$).
   - Exporte le résultat final dans un fichier JSON :
     ```json
     {
       "video_id": "...",
       "gabc_id": "...",
       "notes": [
         {"note": "f", "syllable": "De", "start": 1.23, "end": 1.65},
         {"note": "g", "syllable": "us", "start": 1.65, "end": 1.95}
       ]
     }
     ```

---

### 4. Format GABC (Rappel pour l’agent)

Un fichier `.gabc` contient :
- Des **headers** : `name:`, `gabc-copyright:`, `mode:`, etc., séparés du corps par `%%`.
- Un **corps** : alternance de texte et de notes entre parenthèses :
  `Al(c3d)le(ef)lú(g)ia.(f)`
- Les lettres minuscules dans les parenthèses (`a` à `m`) représentent les hauteurs de note sur la portée grégorienne (4 lignes).
- Des caractères spéciaux indiquent le rythme/forme : `.` (punctum mora), `_` (episema), `/` (coupure), etc.

---

### 5. Outils et Dépendances

- **Python 3.10+**
- `yt-dlp` (téléchargement YouTube)
- `torchaudio` + `torch` (alignment CTC)
- `librosa` / `soundfile` (traitement audio)
- `transformers` (modèles HuggingFace : MMS, Wav2Vec2)

---

### 6. Alignment Lab (Outil de Revue Visuelle)

Dans `pipeline/alignment-lab.html` :
- Charge la vidéo YouTube via l'IFrame API.
- Rendu de la partition GABC via Exsurge / Gregorio.
- Barre de progression synchronisée : la note en cours de lecture s'illumine en temps réel.
- Permet à l'utilisateur de corriger manuellement les bornes temporelles et d'enregistrer les revues dans `lab_reviews.json`.
