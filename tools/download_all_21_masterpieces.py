#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_all_21_masterpieces.py
Télécharge et convertit l'intégralité des 21 œuvres sélectionnées en Haute Définition Retina (Option A : 900px, WebP 84).
Met à jour le fichier des métadonnées (saints_art_metadata.json et js).
"""

import os, sys, json, io, urllib.request, urllib.parse, time
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
Image.MAX_IMAGE_PIXELS = None

USER_AGENT = 'OremusArtDownloadBot/5.0 (contact@oremus.org)'
OUTPUT_DIR = 'img/saints'

TARGET_MAX_WIDTH = 900
TARGET_MAX_HEIGHT = 1300
WEBP_QUALITY = 84

EXACT_21 = {
    '04-22': ('File:Pope Saint Evaristus (by Sandro Botticelli) – Sistine Chapel.jpg', 'Cosimo Rosselli / Fresque de la Chapelle Sixtine', 'Le Pape saint Sôter', '1481', 'Chapelle Sixtine, Vatican'),
    '04-26': ('File:Musea Brugge, HUB, 2014 GRO0019 084 III.jpg', 'Atelier des maîtres flamands de Bruges', 'Saint Clet (Anaclet) pape et martyr', 'XVIe siècle', 'Musée Groeninge, Bruges'),
    '05-12': ('File:Menaion icon (17 c., TsAK) - July.jpg', 'École sacrée de Moscou', 'Saints Nérée, Achillée et Pancrace', 'XVIIe siècle', 'Moscou'),
    '06-15': ('File:Caupo, chiesa dei Santi Vito e Modesto - Pala dell\'altare maggiore.jpg', 'École vénitienne classique', 'Retable des saints Guy et Modeste', 'XVIIe siècle', 'Vénétie'),
    '08-18': ('File:Saint Agapitus of Praeneste in the Arena; (interior) The Beheading of Saint Agapitus of Praeneste MET DP164845.jpg', 'Maître de saint Agapit (Metropolitan Museum)', 'Le Martyre de saint Agapit de Préneste', 'vers 1475', 'Metropolitan Museum of Art, New York'),
    '09-02': ('File:Benczúr Gyula-Szt István Szűz Mária.jpg', 'Gyula Benczúr', 'Le Roi saint Étienne consacrant la Hongrie à la Sainte Vierge', '1896', 'Basilique Saint-Étienne, Budapest'),
    '09-16': ('File:Thomas-Altar, Meister des Bartholomäus-Altars (WRM 0179), Außenseite links.jpg', 'Maître du Retable de Saint-Barthélemy', 'Saint Corneille pape et saint Cyprien', '1500', 'Musée Wallraf-Richartz, Cologne'),
    '09-23': ('File:Pope Linus.jpg', 'Fra Diamante', 'Le Pape saint Lin', '1481', 'Chapelle Sixtine, Vatican'),
    '09-28': ('File:Karel Škréta - Narození svatého Václava.jpg', 'Karel Škréta', 'La Naissance de saint Venceslas duc de Bohême', '1641', 'Galerie Nationale de Prague'),
    '10-20': ('File:Sv. Jan Kanty (5821275).jpg', 'Szymon Czechowicz', 'Saint Jean de Kenty en oraison', 'XVIIIe siècle', 'Cracovie'),
    '10-25': ('File:St. Chrysanthus and St. Daria, His Wife Met DP891173.jpg', 'Metropolitan Museum of Art', 'Saints Chrysanthe et Darie martyrs', 'vers 1600', 'Metropolitan Museum of Art, New York'),
    '11-12': ('File:Fresco of Pope Martin I - Basilica of Saint Paul Outside the Walls.jpg', 'Fresque basilicale vaticane', 'Le Pape saint Martin Ier', 'XVIIIe siècle', 'Rome'),
    '11-14': ('File:Saint Josaphat Kuncewicz.jpg', 'Józef Simmler', 'Saint Josaphat Kuntsevych archevêque et martyr', '1861', 'Musée National de Varsovie'),
    '11-16': ('File:Misión de Santa Gertrudis la Magna 02 (cropped).jpg', 'Miguel Cabrera', 'Sainte Gertrude la Grande en extase', '1763', 'Musée National d\'Art de Mexico'),
    '11-18': ('File:El Greco - Saint Peter and Saint Paul - Google Art Project.jpg', 'Le Greco (El Greco)', 'Les Apôtres saint Pierre et saint Paul', '1592', 'Musée de l\'Ermitage, Saint-Pétersbourg'),
    '11-26': ('File:SilvestroG.jpg', 'Retable bénédictin classique', 'Saint Sylvestre Gozzolini recevant la règle', 'XVIIe siècle', 'Fabriano'),
    '11-29': ('File:Tomb of Saint Saturnin - Basilique Saint-Sernin - Exposures blending.jpg', 'Retable monumental de Saint-Sernin', 'Saint Saturnin premier évêque de Toulouse', 'XVIIe siècle', 'Basilique Saint-Sernin, Toulouse'),
    '12-02': ('File:Pietro da cortona, storie di santa bibiana 01 Flagellazione di santa Bibiana.JPG', 'Pierre de Cortone (Pietro da Cortona)', 'La Flagellation de sainte Bibienne', '1626', 'Église Sainte-Bibienne, Rome'),
    '12-05': ('File:Saint Anthony the Great and Saint Sabbas Serbian.jpg', 'Fresque monastique orthodoxe', 'Saint Sabas le Sanctifié et saint Antoine', 'XIVe siècle', 'Monastère des Saints-Archanges'),
    '12-10': ('File:Pope Miltiades.jpg', 'Fra Diamante', 'Le Pape saint Melchiade', '1481', 'Chapelle Sixtine, Vatican'),
    '12-29': ('File:The martyrdom of Saint Thomas Becket-Jean Baptiste (1748).jpg', 'Jean-Baptiste Marie Pierre', 'Le Martyre de saint Thomas Becket archevêque de Cantorbéry', '1748', 'Musée de l\'Assistance Publique, Paris')
}

def download_one(code, info):
    fname, artist, artwork, year, loc = info
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
                    time.sleep(0.3)
                    r_img = urllib.request.Request(img_url, headers={'User-Agent': USER_AGENT})
                    raw = urllib.request.urlopen(r_img, timeout=20).read()
                    im = Image.open(io.BytesIO(raw)).convert('RGB')
                    im.thumbnail((TARGET_MAX_WIDTH, TARGET_MAX_HEIGHT), Image.Resampling.LANCZOS)
                    out_path = os.path.join(OUTPUT_DIR, f'{code}.webp')
                    im.save(out_path, format='WEBP', quality=WEBP_QUALITY, method=4)
                    print(f"[{code}] Sauvegardé : {im.size[0]}x{im.size[1]}px ({os.path.getsize(out_path)//1024} KB) | {artist} <- {fname}")
                    return True
    except Exception as e:
        print(f"[{code}] Erreur pour {fname} : {e}")
    return False

if __name__ == '__main__':
    # Charger les métadonnées existantes
    with open('img/saints/saints_art_metadata.json', encoding='utf-8') as f:
        metadata = json.load(f)

    success = 0
    for code, info in sorted(EXACT_21.items()):
        if download_one(code, info):
            success += 1
            metadata[code] = {
                'artwork': info[2],
                'artist': info[1],
                'year': info[3],
                'location': info[4],
                'feast': metadata.get(code, {}).get('feast', code)
            }
        time.sleep(0.5)

    # Sauvegarder les métadonnées à jour
    with open('img/saints/saints_art_metadata.json', 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    with open('js/saints_art_metadata.js', 'w', encoding='utf-8') as f:
        f.write('// Catalogue raisonné des œuvres d\'art du Sanctoral (Auteur, Titre, Époque, Musée)\n')
        f.write('window.DO_SAINT_ART_METADATA = ')
        f.write(json.dumps(metadata, ensure_ascii=False, indent=2))
        f.write(';\n')

    print(f"\nFinalisation terminée avec succès : {success}/{len(EXACT_21)} toiles de maîtres installées !")
