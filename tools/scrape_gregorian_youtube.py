#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scrape_gregorian_youtube.py
Scraper & Nettoyeur à haute précision pour les pièces du répertoire grégorien.
Exige la présence exacte de l'incipit latin significatif dans le titre de la vidéo.
"""

import os
import re
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_JS_PATH = os.path.join(BASE_DIR, 'js', 'gregorian_index_data.js')
OUTPUT_JSON_PATH = os.path.join(BASE_DIR, 'js', 'gregorian_youtube_links.json')
OUTPUT_JS_PATH = os.path.join(BASE_DIR, 'js', 'gregorian_youtube_links.js')

# Mots vides latins/liturgiques courants non discriminants à ignorer
STOP_WORDS = {'cum', 'non', 'et', 'in', 'ad', 'pro', 'per', 'de', 'ex', 'ab', 'te', 'me', 'se', 'nos', 'vos', 'qui', 'quae', 'quod', 'comm', 'intr', 'all', 'grad', 'off'}

def normalize(str_val):
    if not str_val:
        return ''
    s = str_val.lower()
    s = re.sub(r'[æǽ]', 'ae', s)
    s = re.sub(r'[œœ́]', 'oe', s)
    s = re.sub(r'[\u0300-\u036f]', '', s)
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    return ' '.join(s.split())

def is_strict_match(incipit, video_title):
    norm_inc = normalize(incipit)
    norm_title = normalize(video_title)
    
    # Extraire les mots significatifs de l'incipit (ex: "Laudem Domini" -> ["laudem", "domini"])
    words = [w for w in norm_inc.split() if len(w) >= 3 and w not in STOP_WORDS]
    if not words:
        words = [w for w in norm_inc.split() if len(w) >= 2]
    if not words:
        return True
        
    # Le premier mot principal DEVEZ obligatoirement figurer dans le titre de la vidéo
    first_word = words[0]
    if first_word not in norm_title:
        return False
        
    # Si l'incipit a plusieurs mots, au moins 2 mots doivent correspondre
    if len(words) >= 2:
        matched = sum(1 for w in words[:3] if w in norm_title)
        return matched >= 2
        
    return True

def categorize_source(channel_name, title):
    text = (channel_name + " " + title).lower()
    if 'marek klein' in text or 'gradvale novvm' in text:
        return 'Marek Klein'
    elif 'fontgombault' in text:
        return 'Abbaye de Fontgombault'
    elif 'solesmes' in text:
        return 'Abbaye de Solesmes'
    elif 'barroux' in text:
        return 'Abbaye du Barroux'
    elif 'organum' in text or 'pérès' in text or 'peres' in text:
        return 'Ensemble Organum'
    elif 'triors' in text:
        return 'Abbaye de Triors'
    elif 'gradualeproject' in text:
        return 'GradualeProject'
    else:
        return channel_name or 'Interprétation Grégorienne'

def clean_database():
    if not os.path.exists(OUTPUT_JSON_PATH):
        print("Fichier de données introuvable.")
        return
        
    with open(OUTPUT_JSON_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    cleaned_db = {}
    removed_count = 0
    kept_count = 0
    
    for chant_id, data in db.items():
        incipit = data.get('incipit', '')
        audios = data.get('audios', [])
        valid_audios = []
        for a in audios:
            if is_strict_match(incipit, a.get('title', '')):
                a['source'] = categorize_source(a.get('channel', ''), a.get('title', ''))
                valid_audios.append(a)
                kept_count += 1
            else:
                removed_count += 1
        if valid_audios:
            data['audios'] = valid_audios
            cleaned_db[chant_id] = data
            
    print(f"Grand Nettoyage effectué : {removed_count} vidéos approximatives/hors-sujet supprimées.")
    print(f"Vidéos conservées strictement valides : {kept_count} pour {len(cleaned_db)} pièces.")
    
    save_database(cleaned_db)

def save_database(database):
    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(database, f, ensure_ascii=False, indent=2)
        
    js_content = f"// Base de données des enregistrements audio & vidéo YouTube pour le répertoire Oremus\n(typeof window !== 'undefined' ? window : self).GREGORIAN_YOUTUBE_AUDIO = {json.dumps(database, ensure_ascii=False)};\n"
    with open(OUTPUT_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)

if __name__ == '__main__':
    clean_database()
