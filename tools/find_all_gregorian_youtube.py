#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
find_all_gregorian_youtube.py
Recherche & Filtrage haute précision de vidéos YouTube pour TOUT le corpus grégorien :
- Pièces de la Messe (gabc/*.gabc)
- Pièces de l'Office Divin (do_data/horas/Latin-gabc/**/*.gabc)
- Nettoyage automatique des vidéos parasites (> 10 min, boucles de relaxation)
- Recherche directe via yt-dlp sans clé d'API
"""

import os
import sys
import re
import json
import subprocess
import time
import argparse
from pathlib import Path

BASE_DIR = r"d:\Documents\jgabc"
GABC_DIR = os.path.join(BASE_DIR, 'gabc')
DO_DATA_DIR = os.path.join(BASE_DIR, 'do_data', 'horas', 'Latin-gabc')
OUTPUT_JSON_PATH = os.path.join(BASE_DIR, 'js', 'gregorian_youtube_links.json')
OUTPUT_JS_PATH = os.path.join(BASE_DIR, 'js', 'gregorian_youtube_links.js')

STOP_WORDS = {'cum', 'non', 'et', 'in', 'ad', 'pro', 'per', 'de', 'ex', 'ab', 'te', 'me', 'se', 'nos', 'vos', 'qui', 'quae', 'quod', 'comm', 'intr', 'all', 'grad', 'off', 'ps'}

KNOWN_SOURCES = [
    ('marek klein', 'Marek Klein'),
    ('gradvale novvm', 'Marek Klein'),
    ('fontgombault', 'Abbaye de Fontgombault'),
    ('solesmes', 'Abbaye de Solesmes'),
    ('barroux', 'Abbaye du Barroux'),
    ('organum', 'Ensemble Organum'),
    ('pérès', 'Ensemble Organum'),
    ('peres', 'Ensemble Organum'),
    ('triors', 'Abbaye de Triors'),
    ('gradualeproject', 'GradualeProject'),
    ('sistina', 'Cappella Musicale Pontificia Sistina'),
    ('gregorian karaoke', 'Gregorian Karaoke'),
    ('saint nicolas', 'Chœur Saint Nicolas'),
    ('pluscarden', 'Pluscarden Abbey'),
    ('ganagobie', 'Abbaye de Ganagobie')
]

def normalize(str_val):
    if not str_val: return ''
    s = str_val.lower()
    s = re.sub(r'[æǽ]', 'ae', s)
    s = re.sub(r'[œœ́]', 'oe', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return ' '.join(s.split())

def parse_duration_to_seconds(dur_str):
    if not dur_str: return 0
    parts = dur_str.strip().split(':')
    try:
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 1:
            return int(parts[0])
    except:
        return 0
    return 0

def is_strict_match(incipit, video_title):
    norm_inc = normalize(incipit)
    norm_title = normalize(video_title)
    words = [w for w in norm_inc.split() if len(w) >= 3 and w not in STOP_WORDS]
    if not words:
        words = [w for w in norm_inc.split() if len(w) >= 2]
    if not words:
        return True

    title_words = set(norm_title.split())

    # Premier mot obligatoire en mot entier
    if words[0] not in title_words:
        return False

    if len(words) >= 2:
        matched = sum(1 for w in words[:3] if w in title_words)
        return matched >= 2
    return True

def categorize_source(channel_name, title):
    text = (channel_name + " " + title).lower()
    for pattern, name in KNOWN_SOURCES:
        if pattern in text:
            return name
    return channel_name or 'Interprétation Grégorienne'

def extract_gabc_metadata(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        return None

    if "%%" in content:
        header_text, body = content.split("%%", 1)
    else:
        header_text, body = content, ""

    name_m = re.search(r"^name:\s*([^;\n]+)", header_text, re.MULTILINE)
    part_m = re.search(r"^office-part:\s*([^;\n]+)", header_text, re.MULTILINE)

    name = name_m.group(1).strip() if name_m else ""
    part = part_m.group(1).strip() if part_m else ""

    if not name:
        first_words = re.findall(r"([A-Z][a-zA-ZáéíóúýæœÁÉÍÓÚÝÆŒ]+)\(", body)
        if first_words:
            name = " ".join(first_words[:3])

    if not part:
        p_str = str(file_path).lower()
        if "antiphona" in p_str or "ant" in p_str: part = "Antiphona"
        elif "responsorium" in p_str or "resp" in p_str: part = "Responsorium"
        elif "hymnus" in p_str or "hymn" in p_str: part = "Hymnus"
        elif "psalm" in p_str: part = "Psalmus"
        elif "tenebrae" in p_str: part = "Tenebrae"
        else: part = "Chant"

    return {
        "file_path": str(file_path),
        "incipit": name,
        "part": part
    }

def search_youtube_for_chant(incipit, part):
    query = f"chant gregorien {incipit} {part}"
    cmd = [
        "yt-dlp",
        f"ytsearch4:{query}",
        "--print", "%(id)s|||%(title)s|||%(channel)s|||%(duration_string)s",
        "--no-playlist", "--quiet", "--no-warnings"
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        lines = res.stdout.strip().split('\n')
        candidates = []
        for l in lines:
            if not l or "|||" not in l: continue
            parts = l.split("|||")
            if len(parts) >= 4:
                v_id, title, channel, dur_str = parts[0], parts[1], parts[2], parts[3]
                dur_sec = parse_duration_to_seconds(dur_str)

                # FILTRE STRICT DE DURÉE : max 10 minutes (600s) et min 25s
                if 25 <= dur_sec <= 600:
                    if is_strict_match(incipit, title):
                        candidates.append({
                            "id": v_id,
                            "title": title,
                            "channel": channel,
                            "duration": dur_str,
                            "url": f"https://www.youtube.com/watch?v={v_id}",
                            "embedUrl": f"https://www.youtube.com/embed/{v_id}",
                            "source": categorize_source(channel, title)
                        })
        return candidates
    except Exception as e:
        return []

BLACKLISTED_VIDEO_IDS = {
    '3pT-f4NgTB4', # 1h26 boucle de relaxation parasite
    't5c1W0MaHZw', # Bloque l'intégration en iframe (erreur 150/101)
    'tGWPi0Hp1ws', # Chant festival Taizé incongru sur Omnes gentes
}

def audio_priority_key(audio):
    src = (str(audio.get("source", "")) + " " + str(audio.get("channel", "")) + " " + str(audio.get("title", ""))).lower()
    # Priorité 1 : GradualeProject et Marek Klein en tête
    if "gradualeproject" in src:
        return (0, 0)
    if "marek klein" in src or "gradvale novvm" in src:
        return (0, 1)
    # Priorité 2 : Abbayes traditionnelles
    if any(k in src for k in ["fontgombault", "solesmes", "barroux", "triors", "pluscarden", "ganagobie", "sistina"]):
        return (1, 0)
    # Priorité 3 : Autres
    return (2, 0)

def clean_existing_db(db):
    print("[1/3] Nettoyage de la base existante (élimination des vidéos parasites et tri prioritaire)...")
    cleaned = {}
    removed_parasites = 0
    kept_count = 0

    for pid, data in db.items():
        incipit = data.get("incipit", "")
        audios = data.get("audios", [])
        valid_audios = []
        for a in audios:
            v_id = a.get("id", "")
            if v_id in BLACKLISTED_VIDEO_IDS:
                removed_parasites += 1
                continue
            dur_str = a.get("duration", "")
            dur_sec = parse_duration_to_seconds(dur_str)
            if dur_sec > 600 or (dur_sec > 0 and dur_sec < 25):
                removed_parasites += 1
                continue
            if not is_strict_match(incipit, a.get("title", "")):
                removed_parasites += 1
                continue
            a["source"] = categorize_source(a.get("channel", ""), a.get("title", ""))
            valid_audios.append(a)
            kept_count += 1

        if valid_audios:
            # Tri prioritaire : GradualeProject et Marek Klein en tout premier
            valid_audios.sort(key=audio_priority_key)
            data["audios"] = valid_audios
            cleaned[pid] = data

    print(f"  --> {removed_parasites} vidéo(s) parasite(s) supprimée(s).")
    print(f"  --> {kept_count} vidéos valides conservées pour {len(cleaned)} pièces (triées avec GradualeProject et Marek Klein en premier).")
    return cleaned

def collect_all_pieces(include_office=True):
    pieces = {}

    if os.path.exists(GABC_DIR):
        for f in os.listdir(GABC_DIR):
            if f.endswith('.gabc'):
                pid = f[:-5]
                fpath = os.path.join(GABC_DIR, f)
                meta = extract_gabc_metadata(fpath)
                if meta and meta["incipit"]:
                    pieces[pid] = meta

    if include_office and os.path.exists(DO_DATA_DIR):
        for root, _, files in os.walk(DO_DATA_DIR):
            for f in files:
                if f.endswith('.gabc'):
                    rel_p = os.path.relpath(os.path.join(root, f), DO_DATA_DIR)
                    clean_id = "do_" + re.sub(r'[^a-zA-Z0-9_]', '_', rel_p[:-5])
                    meta = extract_gabc_metadata(os.path.join(root, f))
                    if meta and meta["incipit"] and len(meta["incipit"]) >= 3:
                        pieces[clean_id] = meta

    return pieces

def run_scraper(limit=None, include_office=False, clean_only=False):
    db = {}
    if os.path.exists(OUTPUT_JSON_PATH):
        with open(OUTPUT_JSON_PATH, 'r', encoding='utf-8') as f:
            db = json.load(f)

    cleaned_db = clean_existing_db(db)

    if clean_only:
        save_db(cleaned_db)
        return

    print(f"[2/3] Collecte des partitions GABC (Messe: oui, Office: {include_office})...")
    all_pieces = collect_all_pieces(include_office=include_office)
    print(f"  --> {len(all_pieces)} pièces recensées au total.")

    print(f"[3/3] Recherche YouTube pour les pièces sans enregistrement...")
    new_found = 0
    processed = 0

    for pid, meta in all_pieces.items():
        if pid in cleaned_db and cleaned_db[pid].get("audios"):
            continue

        incipit = meta["incipit"]
        part = meta["part"]
        if not incipit or len(incipit) < 3:
            continue

        print(f"  Recherche [{pid}] {incipit} ({part})...", flush=True)
        results = search_youtube_for_chant(incipit, part)
        if results:
            cleaned_db[pid] = {
                "id": pid,
                "incipit": incipit,
                "part": part,
                "audios": results
            }
            new_found += 1
            print(f"    [TROUVÉ] {len(results)} vidéo(s) valide(s) : {results[0]['channel']} ({results[0]['duration']})", flush=True)
        else:
            print(f"    [NON TROUVÉ] Aucun enregistrement choral direct.", flush=True)

        processed += 1
        if limit and processed >= limit:
            print(f"\n[LIMITE ATTEINTE] {limit} recherches effectuées.")
            break

        time.sleep(1.0)

    save_db(cleaned_db)
    print(f"\n[FIN DU SCRAPING] {new_found} nouvelle(s) pièce(s) enrichie(s). Total pièces dans la base : {len(cleaned_db)}")

def save_db(database):
    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(database, f, indent=2, ensure_ascii=False)

    js_content = f"// Base de données des enregistrements audio & vidéo YouTube pour le répertoire Oremus\n(typeof window !== 'undefined' ? window : self).GREGORIAN_YOUTUBE_AUDIO = {json.dumps(database, ensure_ascii=False)};\n"
    with open(OUTPUT_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"[SAUVEGARDÉ] {OUTPUT_JSON_PATH} et {OUTPUT_JS_PATH}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Recherche universelle de vidéos grégoriennes YouTube")
    parser.add_argument("--clean-only", action="store_true", help="Nettoie uniquement les vidéos existantes (> 10 min, non strictes)")
    parser.add_argument("--include-office", action="store_true", help="Inclut également les chants de l'Office Divin (do_data/)")
    parser.add_argument("--limit", type=int, default=None, help="Nombre max de pièces à rechercher")
    args = parser.parse_args()

    run_scraper(limit=args.limit, include_office=args.include_office, clean_only=args.clean_only)
