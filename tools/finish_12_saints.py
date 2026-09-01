#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
finish_12_saints.py
Télécharge et finalise les 12 dernières toiles de maîtres pour atteindre 100% (274/274).
"""

import os, sys, json, io, urllib.request, urllib.parse
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

USER_AGENT = 'OremusLiturgyReplacementsBot/3.0 (contact@oremus.org)'
OUTPUT_DIR = 'img/saints'

EXACT_12 = {
    '01-05': 'File:Pope Telesphorus.jpg',
    '02-05': 'File:Martirio de Santa Águeda, por Sebastiano del Piombo.jpg',
    '02-06': 'File:Fresco_of_Saint_Titos.jpg',
    '02-08': 'File:Juan Carreño de Miranda - Mass of St John of Matha - WGA4481.jpg',
    '02-14': 'File:Maxfield Parrish - Saint Valentine (1904).jpg',
    '02-18': 'File:Rila Mon. - Fresco mir. icon 020 Simeon Holymartyr.jpg',
    '02-22': 'File:Delivery of the Keys (Perugino).jpg',
    '03-08': 'File:San Juan de Dios de Murillo en la Caridad de Sevilla 01.jpg',
    '03-09': 'File:Santa Francesca Romana Holding the Christ Child MET DT3071.jpg',
    '04-02': 'File:Francesco Solimena (1657-1747) - The Virgin and Child, with a Boy Presented by His Guardian Angel, and San Francesco di Paola - PD.14-1962 - Fitzwilliam Museum.jpg',
    '04-11': 'File:Raphael - The Meeting of Leo the Great and Attila.jpg',
    '08-11': 'File:GBM - Tiburtius.jpg'
}

def resolve_and_download(code, fname):
    t_clean = fname if fname.startswith('File:') else f'File:{fname}'
    url = f'https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(t_clean.replace(" ", "_"))}&prop=imageinfo&iiprop=url|dimensions&format=json'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            d = json.loads(resp.read().decode('utf-8'))
            for p in d.get('query', {}).get('pages', {}).values():
                ii = p.get('imageinfo', [{}])[0]
                img_url = ii.get('url')
                if img_url:
                    r_img = urllib.request.Request(img_url, headers={'User-Agent': USER_AGENT})
                    raw = urllib.request.urlopen(r_img, timeout=20).read()
                    im = Image.open(io.BytesIO(raw)).convert('RGB')
                    im.thumbnail((900, 1300), Image.Resampling.LANCZOS)
                    out_path = os.path.join(OUTPUT_DIR, f'{code}.webp')
                    im.save(out_path, format='WEBP', quality=84, method=4)
                    print(f"[{code}] Sauvegardé : {im.size[0]}x{im.size[1]}px ({os.path.getsize(out_path)//1024} KB) <- {fname}")
                    return True
    except Exception as e:
        print(f"[{code}] Erreur : {e}")
    return False

for code, fname in EXACT_12.items():
    resolve_and_download(code, fname)

print("Finalisation terminée !")
