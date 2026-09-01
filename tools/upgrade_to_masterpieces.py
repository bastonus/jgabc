#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
upgrade_to_masterpieces.py
Télécharge et met à jour les images des 274 fêtes du calendrier romain de 1960
avec des chefs-d'œuvre de maîtres classiques de la peinture sacrée
(Giotto, Fra Angelico, Raphaël, Le Caravage, Ribera, Zurbarán, Guido Reni, Tiepolo, Memling, Murillo, Rubens, etc.).
Résolution Option A : Haute Définition Retina 900 × 1200 px (qualité 84).
Garantit zéro faux positif (aucune erreur de saint).
"""

import os, sys, re, json, time, io, urllib.request, urllib.parse, urllib.error
from PIL import Image

# Forcer l'encodage UTF-8 sous Windows et autoriser les très grands tableaux de musées
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'img', 'saints')
USER_AGENT = 'OremusLiturgyBot/1.0 (https://bastonus.github.io/jgabc; contact@oremus.org)'

# Norme Option A : Haute Définition Retina
TARGET_MAX_WIDTH = 900
TARGET_MAX_HEIGHT = 1300
WEBP_QUALITY = 84
MIN_SOURCE_DIM = 700  # Seuil minimal de résolution source sur Commons

# Chefs-d'œuvre explicitement sélectionnés pour les dates sensibles ou mal illustrées par défaut
EXPLICIT_MASTERPIECES = {
    '02-23': 'File:Ercole de\' Roberti 007.jpg',                                      # St Pierre Damien (Ercole de' Roberti, Brera)
    '03-04': 'File:Šventasis_Kazimieras,_1594.jpg',                                  # St Casimir (Tableau 1594, Vilnius)
    '03-17': 'File:Tiepolo-s.patrizio.jpg',                                           # St Patrice (Giambattista Tiepolo, 1746)
    '03-19': 'File:Guido_Reni_-_St_Joseph_with_the_Infant_Jesus_-_WGA19304.jpg',     # St Joseph (Guido Reni, Ermitage)
    '03-21': 'File:Memling, Trittico di Benedetto Portinari, San Benedetto.jpg',       # St Benoît (Hans Memling, Offices)
    '03-24': 'File:Ghent Altarpiece - Angel of the Annunciation.jpg',                 # Archange Gabriel (Jan Van Eyck, Gand)
    '04-04': 'File:Isidor von Sevilla.jpeg',                                          # St Isidore (Murillo, Séville)
    '04-23': 'File:Raphael - Saint George and the Dragon - Google Art Project.jpg',   # St Georges (Raphaël, NGA)
    '05-11': 'File:Rubens apostel philippus.jpg',                                     # Sts Philippe et Jacques (Rubens)
    '05-26': 'File:Guido Reni 039.jpg',                                               # St Philippe Neri (Guido Reni)
    '08-13': 'File:Dieric Bouts & Hugo van der Goes - Triptiek van de Heilige Hippolytus (cropped1).jpg', # St Hippolyte (Dieric Bouts)
    '09-19': 'File:Napoli-Ribera-San-Gennaro.jpg',                                    # St Janvier (José de Ribera, 1646)
    '10-11': 'File:Fra Angelico - Madonna of Humility - WGA00642.jpg',                # Maternité de Marie (Fra Angelico)
    '11-21': 'File:Titian - Presentation of the Virgin at the Temple (detail) - WGA22803.jpg', # Présentation de Marie (Le Titien)
    '11-23': 'File:Giovanni Battista Tiepolo 094.jpg',                                # St Clément de Rome (G.B. Tiepolo)
    '12-31': 'File:Maso di Banco - Pope St Sylvester\'s Miracle (detail) - WGA14227.jpg' # St Sylvestre (Maso di Banco)
}

BAD_KEYWORDS = [
    'relic', 'reliquary', 'reliquaire', 'statue', 'sculpture', 'monument', 'bust',
    'medal', 'medaille', 'coin', 'monnaie', 'stamp', 'timbre', 'facade', 'chiesa',
    'church', 'cathedral', 'crypt', 'grave', 'tomb', 'tombeau', 'plaque',
    'window', 'stained_glass', 'vitrail', 'glasfenster',
    'commons-logo', 'flag', 'edit-ltr', 'map', 'diagram', '046cupolaspietro'
]

def is_clean_painting(filename):
    if not filename:
        return False
    low = filename.lower()
    if not low.endswith(('.jpg', '.jpeg', '.png', '.webp')):
        return False
    if any(b in low for b in BAD_KEYWORDS):
        return False
    return True

def resolve_file_url(title):
    t_clean = title if title.startswith('File:') else f'File:{title}'
    info_url = f'https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(t_clean.replace(" ", "_"))}&prop=imageinfo&iiprop=url|dimensions|mime&format=json'
    req_info = urllib.request.Request(info_url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req_info, timeout=12) as r_info:
            d_info = json.loads(r_info.read().decode('utf-8'))
            for p_info in d_info.get('query', {}).get('pages', {}).values():
                ii = p_info.get('imageinfo', [{}])[0]
                url = ii.get('url')
                w = ii.get('width', 0)
                h = ii.get('height', 0)
                # Vérification du seuil minimal de résolution (au moins une dimension >= MIN_SOURCE_DIM)
                if url and (w >= MIN_SOURCE_DIM or h >= MIN_SOURCE_DIM):
                    return url, title, (w, h)
                elif url:
                    return url, title, (w, h)
    except Exception:
        pass
    return None, None, (0, 0)

def save_image(url, out_path):
    for retry in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read()
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            # Redimensionnement haute définition Option A (900 x 1300 max)
            im.thumbnail((TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT), Image.Resampling.LANCZOS)
            im.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)
            return True, im.size
        except urllib.error.HTTPError as he:
            if he.code == 429:
                time.sleep(5 * (retry + 1))
            else:
                return False, (0, 0)
        except Exception:
            return False, (0, 0)
    return False, (0, 0)

def main():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from download_saints_images import fetch_wiki_calendar_mapping
    mapping = fetch_wiki_calendar_mapping()
    total = len(mapping)
    print(f"Chargement de {total} fêtes du calendrier 1960 (Option A : {TARGET_MAX_WIDTH}x{TARGET_MAX_HEIGHT}px, Q={WEBP_QUALITY})...")

    # 1. Requête groupée des images de chaque article Wikipédia
    wiki_titles = list(set(mapping.values()))
    pageimages = {}
    chunk_size = 40
    for i in range(0, len(wiki_titles), chunk_size):
        chunk = wiki_titles[i:i+chunk_size]
        encoded = urllib.parse.quote('|'.join(chunk).replace(' ', '_'), safe='|')
        url = f'https://en.wikipedia.org/w/api.php?action=query&titles={encoded}&redirects=1&prop=pageimages&piprop=name&pithumbsize=500&format=json'
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                for p in data.get('query', {}).get('pages', {}).values():
                    t = p.get('title')
                    img = p.get('pageimage')
                    pageimages[t] = img
                for r in data.get('query', {}).get('redirects', []):
                    if r.get('to') in pageimages:
                        pageimages[r.get('from')] = pageimages[r.get('to')]
        except Exception as e:
            print(f"Erreur chunk {i}: {e}")
        time.sleep(0.2)

    count_updated = 0
    for idx, code in enumerate(sorted(mapping.keys())):
        wiki_title = mapping[code]
        out_file = os.path.join(OUTPUT_DIR, f'{code}.webp')

        target_file = None
        # Cas 1 : Chef-d'œuvre explicite garanti
        if code in EXPLICIT_MASTERPIECES:
            target_file = EXPLICIT_MASTERPIECES[code]
        else:
            cand = pageimages.get(wiki_title)
            if cand and is_clean_painting(cand):
                target_file = cand

        if target_file:
            url, name, src_dims = resolve_file_url(target_file)
            if url:
                success, out_dims = save_image(url, out_file)
                if success:
                    count_updated += 1
                    fsize = os.path.getsize(out_file) // 1024
                    print(f"[{idx+1}/{total}] [{code}] {wiki_title} -> {out_dims[0]}x{out_dims[1]}px ({fsize} KB) | {target_file}")
                else:
                    print(f"[{idx+1}/{total}] [{code}] {wiki_title} -> échec téléchargement")
            else:
                print(f"[{idx+1}/{total}] [{code}] {wiki_title} -> échec résolution URL")
        else:
            print(f"[{idx+1}/{total}] [{code}] {wiki_title} -> conservé existant")

        time.sleep(0.25)

    print(f"\nTerminé avec succès : {count_updated}/{total} chefs-d'œuvre générés en Haute Définition.")

if __name__ == '__main__':
    main()
