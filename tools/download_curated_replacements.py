#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_curated_replacements.py
Télécharge et convertit en Haute Définition Retina (900x1200+ px, WebP 84)
les 103 peintures de maîtres validées en remplacement des fichiers supprimés.
Résolution automatique intelligente en cas de titre légèrement différent sur Commons.
"""

import os, sys, json, time, io, urllib.request, urllib.parse, urllib.error, re
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'img', 'saints')
USER_AGENT = 'OremusLiturgyReplacementsBot/2.5 (contact@oremus.org; catholic liturgy art)'

TARGET_MAX_WIDTH = 900
TARGET_MAX_HEIGHT = 1300
WEBP_QUALITY = 84

BAD_KEYWORDS = [
    'relic', 'reliquary', 'reliquaire', 'statue', 'sculpture', 'monument', 'bust',
    'medal', 'medaille', 'coin', 'monnaie', 'stamp', 'timbre', 'facade', 'chiesa',
    'church', 'cathedral', 'crypt', 'grave', 'tomb', 'tombeau', 'plaque',
    'window', 'stained_glass', 'vitrail', 'glasfenster', 'cemetery', 'cementerio',
    'commons-logo', 'flag', 'edit-ltr', 'map', 'diagram', '046cupolaspietro',
    '.svg', '.pdf', '.djvu', '.tif', '.tiff', '.gif'
]

CATALOG_PATH = os.path.join(BASE_DIR, 'scratch', 'masterpiece_replacements.json')
with open(CATALOG_PATH, encoding='utf-8') as f:
    replacements = json.load(f)

sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
from download_saints_images import fetch_wiki_calendar_mapping
mapping = fetch_wiki_calendar_mapping()

print(f"Chargement du catalogue des {len(replacements)} chefs-d'œuvre de remplacement...")

def resolve_file_url(filename):
    t_clean = filename if filename.startswith('File:') else f'File:{filename}'
    url = f'https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(t_clean.replace(" ", "_"))}&prop=imageinfo&iiprop=url|dimensions&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            d = json.loads(resp.read().decode('utf-8'))
            for p in d.get('query', {}).get('pages', {}).values():
                ii = p.get('imageinfo', [{}])[0]
                if ii.get('url'):
                    return ii['url'], (ii.get('width', 0), ii.get('height', 0))
    except Exception:
        pass
    return None, (0, 0)

def search_commons_smart(feast_name, artist_hint):
    clean_saint = re.sub(r'^(Saint|Pope|Feast of|Dedication of the|Archbasilica of|Basilica of)\s+', '', feast_name).strip()
    artist_name = artist_hint.split('(')[0].replace('École', '').replace('Maître', '').strip()
    
    queries = [
        f'"{artist_name}" "{clean_saint}"',
        f'{artist_name} {clean_saint}',
        f'"{clean_saint}" (painting OR fresco OR altarpiece OR dipinto OR retablo OR WGA)',
        f'"{clean_saint}" painting'
    ]
    
    for q in queries:
        time.sleep(0.4)
        url = f'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch={urllib.parse.quote(q)}&gsrlimit=6&prop=imageinfo&iiprop=url|dimensions&format=json'
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                d = json.loads(resp.read().decode('utf-8'))
                candidates = []
                for p in d.get('query', {}).get('pages', {}).values():
                    t = p.get('title', '')
                    low = t.lower()
                    if not low.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                        continue
                    if any(b in low for b in BAD_KEYWORDS):
                        continue
                    ii = p.get('imageinfo', [{}])[0]
                    w = ii.get('width', 0)
                    h = ii.get('height', 0)
                    if w < 400 or h < 400:
                        continue
                    candidates.append((t, ii.get('url'), (w, h)))
                if candidates:
                    return candidates[0][1], candidates[0][2]
        except Exception:
            pass
    return None, (0, 0)

def save_image(url, out_path):
    for retry in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read()
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            im.thumbnail((TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT), Image.Resampling.LANCZOS)
            im.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)
            return True, im.size
        except urllib.error.HTTPError as he:
            if he.code == 429:
                time.sleep(6 * (retry + 1))
            else:
                return False, (0, 0)
        except Exception:
            return False, (0, 0)
    return False, (0, 0)

count = 0
total = len(replacements)
for idx, (code, info) in enumerate(sorted(replacements.items())):
    fname, artist_info = info
    feast_name = mapping.get(code, code)
    out_file = os.path.join(OUTPUT_DIR, f'{code}.webp')

    # 1. Essai de résolution directe par le nom de fichier
    url, dims = resolve_file_url(fname)
    # 2. Si échec, recherche intelligente par artiste et fête
    if not url:
        url, dims = search_commons_smart(feast_name, artist_info)

    if url:
        success, out_dims = save_image(url, out_file)
        if success:
            count += 1
            fsize = os.path.getsize(out_file) // 1024
            print(f"[{idx+1}/{total}] [{code}] {feast_name} -> {out_dims[0]}x{out_dims[1]}px ({fsize} KB) | {artist_info}")
        else:
            print(f"[{idx+1}/{total}] [{code}] {feast_name} -> échec téléchargement")
    else:
        print(f"[{idx+1}/{total}] [{code}] {feast_name} -> non trouvé sur Commons")

    time.sleep(0.35)

print(f"\nTerminé avec succès : {count}/{total} toiles de maîtres installées en Haute Définition.")
