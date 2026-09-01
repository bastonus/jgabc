#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_saints_images.py
Générateur d'images pour le Sanctoral d'Oremus (Missel Romain de 1962).
Télécharge les chefs-d'œuvre de l'art sacré depuis Wikimedia Commons,
les redimensionne et les compresse en WebP sous img/saints/{MM-DD}.webp.
Comprend un retry automatique avec backoff sur limitation HTTP 429.
"""

import os
import re
import json
import time
import io
import urllib.request
import urllib.parse
import urllib.error
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'img', 'saints')
USER_AGENT = 'OremusLiturgyBot/1.0 (https://bastonus.github.io/jgabc; contact@oremus.org)'

# Fêtes majeures et mystères (complément au calendrier sanctoral)
EXPLICIT_FEASTS = {
    '01-01': 'Nativity of Jesus',
    '01-02': 'Saint Stephen',
    '01-03': 'John the Apostle',
    '01-04': 'Massacre of the Innocents',
    '01-06': 'Epiphany (Christian)',
    '01-13': 'Baptism of Jesus',
    '01-25': 'Conversion of Paul the Apostle',
    '02-02': 'Presentation of Jesus at the Temple',
    '02-22': 'Chair of Saint Peter',
    '03-19': 'Saint Joseph',
    '03-24': 'Gabriel',
    '03-25': 'Annunciation',
    '05-01': 'Saint Joseph',
    '05-03': 'Feast of the Cross',
    '05-11': 'Saints Philip and James',
    '05-31': 'Queenship of Mary',
    '06-24': 'Nativity of Saint John the Baptist',
    '06-29': 'Feast of Saints Peter and Paul',
    '07-01': 'Feast of the Most Precious Blood',
    '07-02': 'Visitation (Christianity)',
    '07-16': 'Our Lady of Mount Carmel',
    '07-25': 'James the Great',
    '07-26': 'Saint Anne',
    '08-06': 'Transfiguration of Jesus',
    '08-15': 'Assumption of Mary',
    '08-22': 'Immaculate Heart of Mary',
    '08-24': 'Bartholomew the Apostle',
    '08-29': 'Beheading of Saint John the Baptist',
    '09-08': 'Nativity of Mary',
    '09-12': 'Holy Name of Mary',
    '09-14': 'Feast of the Cross',
    '09-15': 'Our Lady of Sorrows',
    '09-21': 'Matthew the Apostle',
    '09-29': 'Michael (archangel)',
    '10-07': 'Our Lady of the Rosary',
    '10-11': 'Maternity of Mary',
    '10-18': 'Luke the Evangelist',
    '10-24': 'Raphael (archangel)',
    '10-28': 'Simon the Zealot',
    '11-01': 'All Saints\' Day',
    '11-02': 'All Souls\' Day',
    '11-09': 'Archbasilica of Saint John Lateran',
    '11-18': 'Dedication of the Basilicas of Saints Peter and Paul',
    '11-21': 'Presentation of Mary',
    '11-30': 'Andrew the Apostle',
    '12-08': 'Feast of the Immaculate Conception',
    '12-21': 'Thomas the Apostle',
    '12-25': 'Nativity of Jesus',
    '12-26': 'Saint Stephen',
    '12-27': 'John the Apostle',
    '12-28': 'Massacre of the Innocents',
    '12-31': 'Pope Sylvester I'
}

def fetch_wiki_calendar_mapping():
    """Récupère la correspondance officielle MM-DD -> Article Wikipédia depuis la page du calendrier 1960"""
    print("Lecture du calendrier romain de 1960 sur Wikipédia...")
    title = 'General Roman Calendar of 1960'
    url = f'https://en.wikipedia.org/w/api.php?action=parse&page={urllib.parse.quote(title)}&prop=wikitext&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    
    wt = data['parse']['wikitext']['*']
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    month_map = {m: f'{i+1:02d}' for i, m in enumerate(months)}

    current_month = None
    mapping = {}

    for line in wt.splitlines():
        line = line.strip()
        m_match = re.match(r'^==\s*([A-Za-z]+)\s*==', line)
        if m_match and m_match.group(1) in month_map:
            current_month = month_map[m_match.group(1)]
            continue
        if not current_month:
            continue
        
        day_match = re.match(r'^\*(\d+):\s*(.*)', line)
        if day_match:
            day = int(day_match.group(1))
            content = day_match.group(2)
            if 'Feria' in content and '[[' not in content:
                continue
            code = f'{current_month}-{day:02d}'
            
            links = re.findall(r'\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]', content)
            ignored = {'Doctor of the Church', 'Christmas', 'Feria', 'Martyr', 'Bishop', 'Confessor', 'Virgin'}
            filtered = [l for l in links if l not in ignored and not l.startswith('Category:')]
            if filtered:
                mapping[code] = filtered[0]

    for code, target in EXPLICIT_FEASTS.items():
        mapping[code] = target

    return mapping

def resolve_thumbnails_batch(titles):
    """Résout par lots de 40 les URLs des vignettes haute résolution via l'API Wikipedia"""
    results = {}
    chunk_size = 40
    title_list = list(titles.items())
    
    for i in range(0, len(title_list), chunk_size):
        chunk = title_list[i:i + chunk_size]
        query_titles = '|'.join([item[1] for item in chunk])
        url = f'https://en.wikipedia.org/w/api.php?action=query&titles={urllib.parse.quote(query_titles)}&prop=pageimages&pithumbsize=600&redirects=1&format=json'
        
        for attempt in range(3):
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    
                    redirects = {}
                    for red in data.get('query', {}).get('redirects', []):
                        redirects[red['from']] = red['to']
                    
                    pages = data.get('query', {}).get('pages', {})
                    page_thumbs = {}
                    for pid, p in pages.items():
                        title = p.get('title')
                        thumb = p.get('thumbnail', {}).get('source')
                        if title and thumb:
                            page_thumbs[title] = thumb
                    
                    for code, req_title in chunk:
                        effective_title = redirects.get(req_title, req_title)
                        if effective_title in page_thumbs:
                            results[code] = page_thumbs[effective_title]
                        elif req_title in page_thumbs:
                            results[code] = page_thumbs[req_title]
                    break
            except urllib.error.HTTPError as he:
                if he.code == 429:
                    print(f"  [API 429] Pause de {(attempt+1)*5}s...")
                    time.sleep((attempt + 1) * 5)
                else:
                    print(f"Erreur API lot {i}: {he}")
                    break
            except Exception as e:
                print(f"Erreur lors de la résolution du lot {i}: {e}")
                break
        
        time.sleep(0.6)

    return results

def process_and_save_image(code, img_url, max_retries=4):
    """Télécharge l'image, la redimensionne (max hauteur 480) et la compresse en WebP avec retry backoff"""
    out_file = os.path.join(OUTPUT_DIR, f'{code}.webp')
    if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        return True

    raw_data = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(img_url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw_data = resp.read()
            break
        except urllib.error.HTTPError as he:
            if he.code == 429 and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 6
                print(f"    [Image 429] Pause de {wait_time}s avant nouvel essai pour {code}...")
                time.sleep(wait_time)
            else:
                raise
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(3)
            else:
                raise

    if not raw_data:
        return False

    im = Image.open(io.BytesIO(raw_data)).convert('RGB')
    
    max_h = 480
    max_w = 400
    im.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    
    im.save(out_file, format='WEBP', quality=82, method=4)
    return True

def run():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    mapping = fetch_wiki_calendar_mapping()
    print(f"Nombre de fêtes cartographiées : {len(mapping)}")

    print("Résolution par lots des images sur Wikimedia Commons...")
    thumbnails = resolve_thumbnails_batch(mapping)
    print(f"Nombre d'œuvres trouvées : {len(thumbnails)} / {len(mapping)}")

    success_count = 0
    total = len(thumbnails)
    print(f"Téléchargement et conversion en WebP dans {OUTPUT_DIR}...")

    for idx, (code, img_url) in enumerate(sorted(thumbnails.items())):
        out_file = os.path.join(OUTPUT_DIR, f'{code}.webp')
        if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
            success_count += 1
            continue

        try:
            process_and_save_image(code, img_url)
            success_count += 1
            if (idx + 1) % 15 == 0 or idx + 1 == total:
                print(f"  Progression : {idx + 1}/{total} images traitées...")
            time.sleep(0.5)
        except Exception as e:
            print(f"  Erreur {code} ({img_url}): {e}")

    print(f"\nTerminé avec succès ! {success_count} images générées dans {OUTPUT_DIR}")
    
    total_bytes = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f)) for f in os.listdir(OUTPUT_DIR) if f.endswith('.webp'))
    print(f"Poids total du dossier img/saints : {total_bytes / (1024 * 1024):.2f} Mo")

if __name__ == '__main__':
    run()
