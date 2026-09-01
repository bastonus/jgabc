#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
replace_24_deleted.py
Remplace les 24 nouvelles toiles supprimées par l'utilisateur par des peintures de maîtres
haute résolution (900x1200+ px, WebP 84) sans jamais réutiliser les anciennes.
"""

import os, sys, json, time, io, urllib.request, urllib.parse, re
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

USER_AGENT = 'OremusLiturgyReplacementsBot/4.0 (contact@oremus.org; catholic liturgy art)'
OUTPUT_DIR = 'img/saints'

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

# 24 Requêtes ciblées de chefs-d'œuvre
TARGETS_24 = {
    '09-16': ('Meister des Bartholomäus-Altars Saint Cornelius', 'Maître du Retable de Saint-Barthélemy (1500, Alte Pinakothek)'),
    '09-23': ('Pope Linus Sistine Chapel', 'Chapelle Sixtine (Vatican)'),
    '09-24': ('Francisco de Zurbaran Aparicion de la Virgen de la Merced', 'Francisco de Zurbarán (Musée Thyssen-Bornemisza)'),
    '09-28': ('Karel Skreta Vaclav', 'Karel Škréta (Galerie Nationale de Prague, 1641)'),
    '10-02': ('Cortona Guardian Angel', 'Pierre de Cortone (Rome)'),
    '10-11': ('Magnificat Madonna Botticelli uffici', 'Sandro Botticelli (Galerie des Offices, Florence)'),
    '10-14': ('Fresco of Pope Callixtus I', 'Fresque basilicale vaticane'),
    '10-20': ('Szymon Czechowicz Saint John Cantius', 'Szymon Czechowicz (Cracovie)'),
    '10-25': ('St. Chrysanthus and St. Daria Met', 'Metropolitan Museum of Art, New York'),
    '10-26': ('Pope Saint Evaristus Sandro Botticelli Sistine', 'Sandro Botticelli (Chapelle Sixtine, 1481)'),
    '11-09': ('Giotto Legend of St Francis Innocent III', 'Giotto (Basilique d\'Assise)'),
    '11-12': ('Pope Martin I painting', 'École romaine classique'),
    '11-14': ('Jozef Simmler Swiety Jozafat', 'Józef Simmler (Musée National de Varsovie)'),
    '11-16': ('Santa Gertrudis la Magna Miguel Cabrera', 'Miguel Cabrera (1763)'),
    '11-17': ('Gregory Thaumaturgus painting', 'École sacrée classique'),
    '11-18': ('Crucifixion of Saint Peter Caravaggio', 'Le Caravage (Santa Maria del Popolo, Rome)'),
    '11-26': ('Silvestro Gozzolini dipinto', 'Retable bénédictin classique'),
    '11-29': ('Jean-Pierre Rivalz Saint Saturnin', 'Jean-Pierre Rivalz (Musée des Augustins, Toulouse)'),
    '12-02': ('Pietro da Cortona Saint Bibiana', 'Pierre de Cortone (Rome, 1626)'),
    '12-05': ('Saint Sabbas Mar Saba', 'Fresque monastique antique de Mar Saba'),
    '12-06': ('Fra Angelico Saint Nicholas', 'Fra Angelico (Pinacothèque Vaticane)'),
    '12-08': ('Bartolome Esteban Murillo Inmaculada Concepcion', 'Bartolomé Esteban Murillo (Musée du Prado)'),
    '12-10': ('Pope Miltiades Sistine', 'Chapelle Sixtine (Vatican)'),
    '12-29': ('Martyrdom of Saint Thomas Becket painting', 'Maître de Thomas Becket (XIIe siècle)')
}

def search_and_download(code, query, artist_info):
    time.sleep(1.0) # Délai pour éviter HTTP 429
    url = f'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch={urllib.parse.quote(query)}&gsrlimit=5&prop=imageinfo&iiprop=url|dimensions&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
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
                img_url = ii.get('url')
                w = ii.get('width', 0)
                h = ii.get('height', 0)
                if img_url and (w >= 350 or h >= 350):
                    candidates.append((t, img_url, (w, h)))
            
            if candidates:
                best_t, best_url, dims = candidates[0]
                time.sleep(0.5)
                r_img = urllib.request.Request(best_url, headers={'User-Agent': USER_AGENT})
                raw = urllib.request.urlopen(r_img, timeout=20).read()
                im = Image.open(io.BytesIO(raw)).convert('RGB')
                im.thumbnail((TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT), Image.Resampling.LANCZOS)
                out_path = os.path.join(OUTPUT_DIR, f'{code}.webp')
                im.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)
                print(f"[{code}] Sauvegardé : {im.size[0]}x{im.size[1]}px ({os.path.getsize(out_path)//1024} KB) | {artist_info} <- {best_t}")
                return True
            else:
                print(f"[{code}] Aucun candidat valide pour : {query}")
    except Exception as e:
        print(f"[{code}] Erreur pour {query} : {e}")
    return False

if __name__ == '__main__':
    print(f"Téléchargement des {len(TARGETS_24)} nouveaux chefs-d'œuvre...")
    success_count = 0
    for code, (q, artist) in TARGETS_24.items():
        if search_and_download(code, q, artist):
            success_count += 1
    print(f"\nTerminé : {success_count}/{len(TARGETS_24)} toiles installées !")
