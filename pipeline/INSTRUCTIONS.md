# Dossier complet v3 (corrigé) — Alignement automatisé note par note (YouTube / GABC) pour l'application Oremus

> **Version** : v3 corrigé (v3.1)
> **Changelog v3 → v3 corrigé** : correction d'un bug de tokenisation des clefs GABC (`c3`, `f4`, `cb2`, `fb3`…) qui créait une note fantôme et décalait l'alignement mot-à-mot entre WhisperX et les mots GABC. Voir section 8, `tokenize_gabc_notes`.

---

## 1. Contexte du projet

L'application **Oremus / Divinum Officium** hébergée sur GitHub ([bastonus/jgabc](https://github.com/bastonus/jgabc), fichier `divinum-officium.html`) est une Progressive Web App (PWA) client-side issue de l'écosystème jgabc (développé initialement par Benjamin Bloomfield).

Elle modernise le projet historique Divinum Officium en offrant :

- Le support dynamique de **15 corpus de rubriques liturgiques** (Tridentin 1570/1906, Divino Afflatu 1939/1954, réformes de 1955, Codex Rubricarum 1960/1962, traditions monastiques Barroux, Cistercienne, Dominicaine).
- Une architecture **hors-ligne (offline-first)** avec Service Worker et IndexedDB.
- Le **rendu vectoriel en temps réel (SVG)** des partitions à partir du format textuel GABC.
- Un **lecteur multimédia** connecté à des enregistrements YouTube pour l'apprentissage au lutrin.

---

## 2. Expression du besoin & Cahier des charges

### La problématique

Pour accompagner le chant en direct, l'application doit **surligner dynamiquement les notes** et faire défiler la partition en phase avec la piste audio YouTube. L'étiquetage manuel est humainement infaisable pour un corpus de milliers de pièces.

### Cahier des charges technique

| Critère | Cible |
|---|---|
| **Objectif** | Générer automatiquement un horodatage synchronisant l'audio YouTube et le GABC au niveau de la note individuelle, y compris sur les mélismes longs |
| **Granularité cible** | Note par note (précision visée : ±50 ms) |
| **Matériel cible** | PC portable Lenovo LOQ 15IRX9, Nvidia RTX 4050 Laptop, 6 Go VRAM |
| **Contrainte VRAM** | Traitement par lots robuste sans saturation ni rechargement redondant |
| **Format de sortie** | Fichiers légers (JSON) intégrables au cache du client web |
| **Fidélité format source** | Le comptage des notes et les priors de durée doivent être dérivés du GABC réel (syntaxe officielle Gregorio) |
| **Métadonnées** | Chaque note porte un score de confiance ; chaque pièce porte un flag de reprise/refrain |

---

## 3. Le format GABC : ce qu'il faut savoir pour le parser correctement

Le format GABC ([projet Gregorio](https://github.com/gregorio-project/gregorio)) est une notation ASCII pour le chant grégorien.
Référence complète : [Gabc.tex — GregorioTeX documentation](https://rro.rs/ctan/support/gregoriotex/doc/Gabc.tex).

### Structure du fichier

```
name: Pópulus Sion; office-part: Introitus; %%
(c3) Pó[People](c3eh)pu(g)lus[/](h) Si(hi)on,(hgh.) *(;) ec(hihi)ce(e.)
Dó(e.f!gwhhi)mi(h)us(h) vé(hi)ni(ig//ih)et(h.) (,) ad(iv./hig)
sal(fe)ván(ghg)das(fg) gen(e_f_e_)tes(e.) :(:)
```

- Le fichier est coupé en deux par `%%` : en-têtes `clé: valeur;` avant, notation après.
- Dans la notation, chaque paire `texte(notes)` est une syllabe.
- Les syllabes sans espace après leurs notes sont collées au mot suivant.

### Tableau des éléments syntaxiques

| Élément | Syntaxe | Effet sur le comptage / la durée |
|---|---|---|
| Hauteur | lettre `a`–`p` (min. = punctum quadratum, Maj. = punctum inclinatum) | 1 note par lettre |
| Oriscus / quilisma / virga / stropha | `o` / `w` / `v` / `s` accolé à la lettre | forme, pas de note supplémentaire |
| Notes répétées | `ss` (distropha), `sss` (tristropha), `vv` (bivirga), `vvv` (trivirga) | mêmes notes, aucune variation de hauteur → cas à risque pour la détection audio |
| Punctum mora | `.` (ou `..`) après une note | allongement (~×2), prior de durée fort |
| Épisème horizontal | `_` (+ chiffres optionnels) après une note | léger allongement, prior de durée modéré |
| Ictus | `'` après une note | accent rythmique, pas de durée en soi |
| Séparateurs de neumes | `/` `//` ou espace | frontières utiles pour la segmentation |
| Texte de traduction | `[...]` | à ignorer, non chanté |
| Barres | `` ` `` `,` `;` `:` `::` `^` | fin de phrase musicale, pas des notes |
| **Clefs** | `c1`–`c4`, `f3`, `f4` (+ `b` pour bémol) | **à ignorer pour l'alignement** — point de rupture corrigé en v3.1 |

> **Exemple** : la syllabe `Dó(e.f!gwhhi)` contient : `e.` (note allongée), `f`, `g`, `w` (quilisma), `h`, `h`, `i` → 6 notes dont un quilisma et un punctum mora.

---

## 4. État de l'art et défis spécifiques au grégorien

1. **Absence de métrique temporelle fixe** — musique non mesurée, sans tempo régulier.
2. **Mélismes prolongés** — une seule voyelle peut porter 10 à 30 notes ; les aligneurs phonétiques standards décrochent faute de variation consonantique.
3. **Réverbération acoustique** — abbayes et églises en pierre noient les attaques dans un écho prolongé.
4. **Unisson choral fluctuant** — micro-décalages entre choristes qui floutent les transitoires.
5. **Notes répétées sans saut d'intervalle** (`ss`, `sss`, `vv`, `vvv`) — désormais identifiables directement dans le texte GABC.
6. **Reprises non systématiques** — un répons ou un Alléluia peut voir sa première partie reprise après le verset, mais ce n'est ni garanti dans le GABC, ni garanti dans l'exécution réelle.
7. **Clefs embarquées dans la notation** — une clef GABC (`c3`, `f4`…) peut être confondue avec une vraie note par un tokeniseur naïf (cf. section 8).

### Approche retenue — pipeline hybride à trois étages

1. **Ancrage des mots** par modèle vocal (WhisperX) — ancres dures.
2. **Détection de paliers fréquentiels** guidée par la partition à l'intérieur de chaque mot (CREPE).
3. **Arbitrage par prior de durée** dérivé des vrais signes rythmiques GABC (`.`, `_`, `ss`/`vv`…) lorsque la confiance du détecteur est faible.
4. En amont : **passe de détection structurelle des reprises**.

---

## 5. Vulgarisation : comment ça marche

Le programme agit comme un **chef de chœur virtuel** qui suit la partition avec son doigt :

1. **Placer les grosses bornes (WhisperX)** — il repère où commence et finit chaque mot latin.
2. **Lire les indices du GABC** — `.` = "plus long", `_` = allongement, `ss`/`vv` = "même hauteur répétée". Il sait désormais ignorer proprement les indications de clef.
3. **Écouter la voix monter et descendre (CREPE + paliers)** — à l'intérieur d'un mot, il cherche les vrais changements de hauteur stables.
4. **Arbitrer entre les deux** — signal audio net → confiance élevée ; chœur noyé dans l'écho → repli sur les priors GABC.
5. **Reconnaître un refrain** — si le début du texte réapparaît plus loin, il vérifie si le passage a vraiment été rechanté dans cet enregistrement.

---

## 6. Performances, fiabilité et empreinte technique

### Précision attendue

| Contexte | Précision |
|---|---|
| Soliste / cantor seul | ~90 % de détection correcte au premier passage |
| Chœur monastique réverbéré | ~75–80 %, remonté par le prior GABC |
| Notes répétées (`ss`/`sss`/`vv`/`vvv`) | Repérées à l'avance dans le GABC, traitées par prior |

### Temps de calcul (RTX 4050 Laptop, 6 Go VRAM)

- ~10 à 15 s d'inférence cumulée par pièce de 3 min.
- ~100 pièces traitées en moins de 25 minutes.
- Exécution séquentielle en **2 passes GPU** : WhisperX ~2 Go VRAM → purge → CREPE `batch_size=2048` sans dépasser 3 Go.
- Parsing GABC et détection de reprise par chroma → **CPU uniquement**.

### Volume de stockage

- JSON compact par pièce : ~500–600 octets gzippé.
- Catalogue complet (8 500 pièces) : ~4 à 5 Mo compressé — cachable côté Service Worker.

---

## 7. Références et liens documentaires

### Projets & dépôts de référence

| Ressource | Lien |
|---|---|
| Application cible | https://bastonus.github.io/jgabc/divinum-officium.html |
| Dépôt source | https://github.com/bastonus/jgabc (amont : bbloomf/jgabc) |
| Base de données grégorienne | https://gregobase.selapa.net |
| Projet Gregorio | https://github.com/gregorio-project/gregorio |
| Doc complète syntaxe GABC | https://rro.rs/ctan/support/gregoriotex/doc/Gabc.tex |

### Bibliothèques d'alignement & traitement du signal

| Bibliothèque | Rôle |
|---|---|
| WhisperX | Forced alignment multilingue & phonétique |
| TorchCREPE | Estimation F0 sur GPU (implémentation PyTorch de CREPE) |
| yt-dlp | Téléchargement et extraction de flux audio YouTube |
| Librosa | Traitement audio, extraction de caractéristiques, chroma/CQT |

> **Point de vigilance** : le modèle `language_code="la"` de WhisperX doit être vérifié avant mise en production. Le latin liturgique (prononciation ecclésiastique) n'est pas garanti dans le zoo de modèles wav2vec2 par défaut. À défaut, un repli sur l'italien (phonétiquement proche) ou un modèle CTC adapté pourrait être nécessaire.

---

## 8. Notes d'implémentation (v3 corrigé)

### Fix v3.1 — Garde-fou clef (`_CLEF_TOKEN_RE`)

**[Corrigé en v3.1]** Le tokeniseur ne confond plus une clef (`c3`, `f4`, `cb2`, `fb3`…) avec une note grégorienne : le garde-fou `_CLEF_TOKEN_RE` est testé sur la chaîne brute **avant** tout essai de matching de note. L'ancien `_CLEF_RE` (qui testait un token déjà découpé, donc trop tard) a été retiré.

### Limites connues et pistes d'amélioration

| Limite | Détail |
|---|---|
| Syntaxe GABC avancée | Fusion de neumes `@`, macros `[nm...]`, braces, texte verbatim `[nv:...]` non couverts |
| Segmentation en mots | `parse_gabc_file` approxime la règle officielle ; à valider sur un échantillon réel du corpus jgabc |
| Barème `duration_weight` | Valeurs empiriques (2.4 / 1.9 / 1.25 / 0.9) à calibrer sur un échantillon annoté |
| `is_repeated_note_group` | Ne compare pas encore avec `prev_token` — détection basée sur le seul suffixe du token courant |
| Score de confiance `detect_pitch_plateaus` | Mesure uniquement l'écart entre paliers détectés et notes attendues, pas la qualité positionnelle |

---

## 9. Structure du dossier de travail

```
jgabc/
├── INSTRUCTIONS.md              ← Ce fichier (cahier des charges + doc technique)
├── batch_align_gabc_v3.py       ← Script principal (pipeline complet)
├── requirements.txt             ← Dépendances Python
├── tests/
│   └── test_tokenizer.py        ← Tests de non-régression (fix clefs)
├── audio_corpus/                ← WAV téléchargés (gitignorés)
├── temp_word_data/              ← Fichiers intermédiaires WhisperX (gitignorés)
└── final_timestamps/            ← JSON de sortie (horodatages note par note)
```

---

## 10. Installation rapide

```bash
# 1. Dépendances GPU (CUDA 12.1)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 2. Bibliothèques audio et alignement
pip install yt-dlp librosa torchcrepe scipy

# 3. WhisperX (depuis GitHub)
pip install git+https://github.com/m-bain/whisperx.git
```

Puis lancer le pipeline :

```bash
python batch_align_gabc_v3.py
```
