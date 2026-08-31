#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
Oremus - Script d'Extraction et Structuration Universelle
(Offices, Messes, Pièces Grégoriennes, Ad Libitum, Sacra Biblia)
=============================================================================
"""

import os
import sys
import re
import json
import argparse
from pathlib import Path

# Mapping standard des parties liturgiques
OFFICE_PARTS_MAP = {
    'in': 'Introitus',
    'intr': 'Introitus',
    'introitus': 'Introitus',
    'gr': 'Graduale',
    'grad': 'Graduale',
    'graduale': 'Graduale',
    'al': 'Alleluia',
    'all': 'Alleluia',
    'alleluia': 'Alleluia',
    'tr': 'Tractus',
    'tract': 'Tractus',
    'tractus': 'Tractus',
    'seq': 'Sequentia',
    'sequentia': 'Sequentia',
    'of': 'Offertorium',
    'offert': 'Offertorium',
    'offertorium': 'Offertorium',
    'co': 'Communio',
    'comm': 'Communio',
    'communio': 'Communio',
    'an': 'Antiphona',
    'ant': 'Antiphona',
    'antiphona': 'Antiphona',
    're': 'Responsorium',
    'resp': 'Responsorium',
    'responsorium': 'Responsorium',
    'hy': 'Hymnus',
    'hymn': 'Hymnus',
    'hymnus': 'Hymnus',
    'ky': 'Kyrie',
    'gl': 'Gloria',
    'cr': 'Credo',
    'sa': 'Sanctus',
    'ag': 'Agnus Dei',
    'ite': 'Ite Missa Est',
    'ps': 'Psalmus',
    'ca': 'Canticum',
    'or': 'Oratio',
    'lit': 'Litaniae',
    'va': 'Varia'
}

# 1. Les 8 Heures Canoniques de l'Office Divin
CANONICAL_HOURS = [
    {
        'id': 'hora_matutinum',
        'type': 'officium',
        'hora': 'matutinum',
        'incipit': 'Matines (Matutinum)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Matines, Matutinum, Nocturne, Psaumes, Leçons',
        'ref': 'Breviarium Romanum • Office de la Nuit',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_laudes',
        'type': 'officium',
        'hora': 'laudes',
        'incipit': 'Laudes (Laudes)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Laudes, Prière du matin, Benedictus, Psaumes',
        'ref': 'Breviarium Romanum • Office du Matin',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_prima',
        'type': 'officium',
        'hora': 'prima',
        'incipit': 'Prime (Prima)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Prime, Petite Heure, Symbole d\'Athanase, Martirologe',
        'ref': 'Breviarium Romanum • 1ère Heure du jour',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_tertia',
        'type': 'officium',
        'hora': 'tertia',
        'incipit': 'Tierce (Tertia)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Tierce, Petite Heure, Nunc Sancte nobis Spiritus',
        'ref': 'Breviarium Romanum • 3ème Heure du jour',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_sexta',
        'type': 'officium',
        'hora': 'sexta',
        'incipit': 'Sexte (Sexta)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Sexte, Petite Heure, Rector potens verax Deus',
        'ref': 'Breviarium Romanum • 6ème Heure (Midi)',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_nona',
        'type': 'officium',
        'hora': 'nona',
        'incipit': 'None (Nona)',
        'part': 'Office Divin',
        'tags': 'Office Divin, None, Petite Heure, Rerum Deus tenax vigor',
        'ref': 'Breviarium Romanum • 9ème Heure (Après-midi)',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_vesperae',
        'type': 'officium',
        'hora': 'vesperae',
        'incipit': 'Vêpres (Vesperae)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Vêpres, Prière du soir, Magnificat, Psaumes, Hymnes',
        'ref': 'Breviarium Romanum • Office du Soir',
        'book': 'Breviarium Romanum'
    },
    {
        'id': 'hora_completorium',
        'type': 'officium',
        'hora': 'completorium',
        'incipit': 'Complies (Completorium)',
        'part': 'Office Divin',
        'tags': 'Office Divin, Complies, Prière de la nuit, Nunc dimittis, Salve Regina',
        'ref': 'Breviarium Romanum • Prière avant le repos',
        'book': 'Breviarium Romanum'
    }
]

# 2. Les 73 Livres de la Sainte Bible (Sacra Biblia)
BIBLE_BOOKS = [
    # Pentateuque
    { 'id': 'Genesis', 'la': 'Genesis', 'fr': 'Genèse', 'en': 'Genesis', 'chapters': 50, 'cat': 'Pentateuque' },
    { 'id': 'Exodus', 'la': 'Exodus', 'fr': 'Exode', 'en': 'Exodus', 'chapters': 40, 'cat': 'Pentateuque' },
    { 'id': 'Leviticus', 'la': 'Leviticus', 'fr': 'Lévitique', 'en': 'Leviticus', 'chapters': 27, 'cat': 'Pentateuque' },
    { 'id': 'Numeri', 'la': 'Numeri', 'fr': 'Nombres', 'en': 'Numbers', 'chapters': 36, 'cat': 'Pentateuque' },
    { 'id': 'Deuteronomium', 'la': 'Deuteronomium', 'fr': 'Deutéronome', 'en': 'Deuteronomy', 'chapters': 34, 'cat': 'Pentateuque' },

    # Livres Historiques
    { 'id': 'Josue', 'la': 'Josue', 'fr': 'Josué', 'en': 'Joshua', 'chapters': 24, 'cat': 'Livres Historiques' },
    { 'id': 'Judicum', 'la': 'Judicum', 'fr': 'Juges', 'en': 'Judges', 'chapters': 21, 'cat': 'Livres Historiques' },
    { 'id': 'Ruth', 'la': 'Ruth', 'fr': 'Ruth', 'en': 'Ruth', 'chapters': 4, 'cat': 'Livres Historiques' },
    { 'id': 'Regum 1', 'la': '1 Regum (1 Samuel)', 'fr': '1 Samuel', 'en': '1 Samuel', 'chapters': 31, 'cat': 'Livres Historiques' },
    { 'id': 'Regum 2', 'la': '2 Regum (2 Samuel)', 'fr': '2 Samuel', 'en': '2 Samuel', 'chapters': 24, 'cat': 'Livres Historiques' },
    { 'id': 'Regum 3', 'la': '3 Regum (1 Rois)', 'fr': '1 Rois', 'en': '1 Kings', 'chapters': 22, 'cat': 'Livres Historiques' },
    { 'id': 'Regum 4', 'la': '4 Regum (2 Rois)', 'fr': '2 Rois', 'en': '2 Kings', 'chapters': 25, 'cat': 'Livres Historiques' },
    { 'id': 'Paralipomenon 1', 'la': '1 Paralipomenon', 'fr': '1 Chroniques', 'en': '1 Chronicles', 'chapters': 29, 'cat': 'Livres Historiques' },
    { 'id': 'Paralipomenon 2', 'la': '2 Paralipomenon', 'fr': '2 Chroniques', 'en': '2 Chronicles', 'chapters': 36, 'cat': 'Livres Historiques' },
    { 'id': 'Esdrae', 'la': 'Esdras', 'fr': 'Esdras', 'en': 'Ezra', 'chapters': 10, 'cat': 'Livres Historiques' },
    { 'id': 'Nehemiae', 'la': 'Nehemias', 'fr': 'Néhémie', 'en': 'Nehemiah', 'chapters': 13, 'cat': 'Livres Historiques' },
    { 'id': 'Tobiae', 'la': 'Tobias', 'fr': 'Tobie', 'en': 'Tobit', 'chapters': 14, 'cat': 'Livres Historiques' },
    { 'id': 'Judith', 'la': 'Judith', 'fr': 'Judith', 'en': 'Judith', 'chapters': 16, 'cat': 'Livres Historiques' },
    { 'id': 'Esther', 'la': 'Esther', 'fr': 'Esther', 'en': 'Esther', 'chapters': 16, 'cat': 'Livres Historiques' },
    { 'id': 'Machabaeorum 1', 'la': '1 Machabaeorum', 'fr': '1 Maccabées', 'en': '1 Maccabees', 'chapters': 16, 'cat': 'Livres Historiques' },
    { 'id': 'Machabaeorum 2', 'la': '2 Machabaeorum', 'fr': '2 Maccabées', 'en': '2 Maccabees', 'chapters': 15, 'cat': 'Livres Historiques' },

    # Livres Sapientiaux
    { 'id': 'Job', 'la': 'Job', 'fr': 'Job', 'en': 'Job', 'chapters': 42, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Psalmi', 'la': 'Psalmi (Liber Psalmorum)', 'fr': 'Psaumes (Livre des Psaumes)', 'en': 'Psalms', 'chapters': 150, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Proverbia', 'la': 'Proverbia', 'fr': 'Proverbes', 'en': 'Proverbs', 'chapters': 31, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Ecclesiastes', 'la': 'Ecclesiastes', 'fr': 'Ecclésiaste (Qohélet)', 'en': 'Ecclesiastes', 'chapters': 12, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Canticum Canticorum', 'la': 'Canticum Canticorum', 'fr': 'Cantique des Cantiques', 'en': 'Song of Songs', 'chapters': 8, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Sapientia', 'la': 'Sapientia', 'fr': 'Sagesse de Salomon', 'en': 'Wisdom', 'chapters': 19, 'cat': 'Livres Sapientiaux' },
    { 'id': 'Ecclesiasticus', 'la': 'Ecclesiasticus', 'fr': 'Siracide (Ecclésiastique)', 'en': 'Sirach', 'chapters': 51, 'cat': 'Livres Sapientiaux' },

    # Grands Prophètes
    { 'id': 'Isaias', 'la': 'Isaias', 'fr': 'Isaïe', 'en': 'Isaiah', 'chapters': 66, 'cat': 'Grands Prophètes' },
    { 'id': 'Jeremias', 'la': 'Jeremias', 'fr': 'Jérémie', 'en': 'Jeremiah', 'chapters': 52, 'cat': 'Grands Prophètes' },
    { 'id': 'Lamentationes', 'la': 'Lamentationes', 'fr': 'Lamentations', 'en': 'Lamentations', 'chapters': 5, 'cat': 'Grands Prophètes' },
    { 'id': 'Baruch', 'la': 'Baruch', 'fr': 'Baruch', 'en': 'Baruch', 'chapters': 6, 'cat': 'Grands Prophètes' },
    { 'id': 'Ezechiel', 'la': 'Ezechiel', 'fr': 'Ézéchiel', 'en': 'Ezekiel', 'chapters': 48, 'cat': 'Grands Prophètes' },
    { 'id': 'Daniel', 'la': 'Daniel', 'fr': 'Daniel', 'en': 'Daniel', 'chapters': 14, 'cat': 'Grands Prophètes' },

    # Petits Prophètes
    { 'id': 'Osee', 'la': 'Osee', 'fr': 'Osée', 'en': 'Hosea', 'chapters': 14, 'cat': 'Petits Prophètes' },
    { 'id': 'Joel', 'la': 'Joel', 'fr': 'Joël', 'en': 'Joel', 'chapters': 3, 'cat': 'Petits Prophètes' },
    { 'id': 'Amos', 'la': 'Amos', 'fr': 'Amos', 'en': 'Amos', 'chapters': 9, 'cat': 'Petits Prophètes' },
    { 'id': 'Abdias', 'la': 'Abdias', 'fr': 'Abdias', 'en': 'Obadiah', 'chapters': 1, 'cat': 'Petits Prophètes' },
    { 'id': 'Jonas', 'la': 'Jonas', 'fr': 'Jonas', 'en': 'Jonah', 'chapters': 4, 'cat': 'Petits Prophètes' },
    { 'id': 'Michaea', 'la': 'Michaeas', 'fr': 'Michée', 'en': 'Micah', 'chapters': 7, 'cat': 'Petits Prophètes' },
    { 'id': 'Nahum', 'la': 'Nahum', 'fr': 'Nahum', 'en': 'Nahum', 'chapters': 3, 'cat': 'Petits Prophètes' },
    { 'id': 'Habacuc', 'la': 'Habacuc', 'fr': 'Habacuc', 'en': 'Habakkuk', 'chapters': 3, 'cat': 'Petits Prophètes' },
    { 'id': 'Sophonias', 'la': 'Sophonias', 'fr': 'Sophonie', 'en': 'Zephaniah', 'chapters': 3, 'cat': 'Petits Prophètes' },
    { 'id': 'Aggaeus', 'la': 'Aggaeus', 'fr': 'Aggée', 'en': 'Haggai', 'chapters': 2, 'cat': 'Petits Prophètes' },
    { 'id': 'Zacharias', 'la': 'Zacharias', 'fr': 'Zacharie', 'en': 'Zechariah', 'chapters': 14, 'cat': 'Petits Prophètes' },
    { 'id': 'Malachias', 'la': 'Malachias', 'fr': 'Malachie', 'en': 'Malachi', 'chapters': 4, 'cat': 'Petits Prophètes' },

    # Évangiles & Actes
    { 'id': 'Matthaeus', 'la': 'Evangelium secundum Matthaeum', 'fr': 'Évangile selon saint Matthieu', 'en': 'Gospel of Matthew', 'chapters': 28, 'cat': 'Évangiles & Actes' },
    { 'id': 'Marcus', 'la': 'Evangelium secundum Marcum', 'fr': 'Évangile selon saint Marc', 'en': 'Gospel of Mark', 'chapters': 16, 'cat': 'Évangiles & Actes' },
    { 'id': 'Lucas', 'la': 'Evangelium secundum Lucam', 'fr': 'Évangile selon saint Luc', 'en': 'Gospel of Luke', 'chapters': 24, 'cat': 'Évangiles & Actes' },
    { 'id': 'Joannes', 'la': 'Evangelium secundum Joannem', 'fr': 'Évangile selon saint Jean', 'en': 'Gospel of John', 'chapters': 21, 'cat': 'Évangiles & Actes' },
    { 'id': 'Actus Apostolorum', 'la': 'Actus Apostolorum', 'fr': 'Actes des Apôtres', 'en': 'Acts of the Apostles', 'chapters': 28, 'cat': 'Évangiles & Actes' },

    # Épîtres de saint Paul
    { 'id': 'Ad Romanos', 'la': 'Ad Romanos', 'fr': 'Aux Romains', 'en': 'Romans', 'chapters': 16, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Corinthios 1', 'la': '1 ad Corinthios', 'fr': '1 Corinthiens', 'en': '1 Corinthians', 'chapters': 16, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Corinthios 2', 'la': '2 ad Corinthios', 'fr': '2 Corinthiens', 'en': '2 Corinthians', 'chapters': 13, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Galatas', 'la': 'Ad Galatas', 'fr': 'Aux Galates', 'en': 'Galatians', 'chapters': 6, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Ephesios', 'la': 'Ad Ephesios', 'fr': 'Aux Éphésiens', 'en': 'Ephesians', 'chapters': 6, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Philippenses', 'la': 'Ad Philippenses', 'fr': 'Aux Philippiens', 'en': 'Philippians', 'chapters': 4, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Colossenses', 'la': 'Ad Colossenses', 'fr': 'Aux Colossiens', 'en': 'Colossians', 'chapters': 4, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Thessalonicenses 1', 'la': '1 ad Thessalonicenses', 'fr': '1 Thessaloniciens', 'en': '1 Thessalonians', 'chapters': 5, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Thessalonicenses 2', 'la': '2 ad Thessalonicenses', 'fr': '2 Thessaloniciens', 'en': '2 Thessalonians', 'chapters': 3, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Timotheum 1', 'la': '1 ad Timotheum', 'fr': '1 Timothée', 'en': '1 Timothy', 'chapters': 6, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Timotheum 2', 'la': '2 ad Timotheum', 'fr': '2 Timothée', 'en': '2 Timothy', 'chapters': 4, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Titum', 'la': 'Ad Titum', 'fr': 'À Tite', 'en': 'Titus', 'chapters': 3, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Philemonem', 'la': 'Ad Philemonem', 'fr': 'À Philémon', 'en': 'Philemon', 'chapters': 1, 'cat': 'Épîtres de saint Paul' },
    { 'id': 'Ad Hebraeos', 'la': 'Ad Hebraeos', 'fr': 'Aux Hébreux', 'en': 'Hebrews', 'chapters': 13, 'cat': 'Épîtres de saint Paul' },

    # Épîtres Catholiques & Apocalypse
    { 'id': 'Jacobi', 'la': 'Epistola Jacobi', 'fr': 'Épître de saint Jacques', 'en': 'James', 'chapters': 5, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Petri 1', 'la': '1 Petri', 'fr': '1 Saint Pierre', 'en': '1 Peter', 'chapters': 5, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Petri 2', 'la': '2 Petri', 'fr': '2 Saint Pierre', 'en': '2 Peter', 'chapters': 3, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Joannis 1', 'la': '1 Joannis', 'fr': '1 Saint Jean', 'en': '1 John', 'chapters': 5, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Joannis 2', 'la': '2 Joannis', 'fr': '2 Saint Jean', 'en': '2 John', 'chapters': 1, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Joannis 3', 'la': '3 Joannis', 'fr': '3 Saint Jean', 'en': '3 John', 'chapters': 1, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Judae', 'la': 'Epistola Judae', 'fr': 'Épître de saint Jude', 'en': 'Jude', 'chapters': 1, 'cat': 'Épîtres Catholiques' },
    { 'id': 'Apocalypsis', 'la': 'Apocalypsis Joannis', 'fr': 'Apocalypse de saint Jean', 'en': 'Revelation', 'chapters': 22, 'cat': 'Apocalypse' }
]

def normalize_office_part(part_str):
    if not part_str:
        return 'Varia'
    p = part_str.strip().lower()
    return OFFICE_PARTS_MAP.get(p, part_str.strip())

def parse_gabc_content(gabc_text):
    headers = {}
    body = ""
    parts = re.split(r'\r?\n%%\s*\r?\n', gabc_text, maxsplit=1)
    if len(parts) == 2:
        header_text, body = parts
    else:
        header_text = ""
        body = gabc_text

    for line in header_text.splitlines():
        line = line.strip()
        if not line or line.startswith('%'):
            continue
        m = re.match(r'^([\w\-]+)\s*:\s*([^;]+);?', line)
        if m:
            headers[m.group(1).lower()] = m.group(2).strip()

    return headers, body.strip()

def clean_incipit(text):
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('{', '').replace('}', '').replace('*', '').replace('+', '').replace('℣', '').replace('℟', '')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_chant_tools_metadata(root_dir):
    chant_names = {}
    chant_tags = {}
    chant_parts = {}

    ord_file = root_dir / "ordinarydata.js"
    if ord_file.is_file():
        try:
            content = ord_file.read_text(encoding='utf-8', errors='ignore')
            parts = re.split(r'var\s+ordinaryAdLib\s*=', content, maxsplit=1)
            masses_code = parts[0] if len(parts) > 0 else content
            adlib_code = parts[1] if len(parts) > 1 else ""

            # Extraire massOrdinary
            blocks = re.split(r'\{\s*season\s*:', masses_code)
            for block in blocks[1:]:
                name_match = re.search(r'name:\s*"([^"]*)"', block)
                season_match = re.search(r'^\s*"([^"]*)"', block)
                mass_name = name_match.group(1).strip() if name_match else ""
                season_name = season_match.group(1).strip() if season_match else ""
                mass_label = mass_name or season_name

                for im in re.finditer(r'(\w+):\s*(?:\{id:\s*(\d+|"[\w\-]+"),\s*name:\s*"([^"]+)"|\[([^\]]+)\])', block):
                    cpart_hint = im.group(1).lower()
                    if im.group(2) and im.group(3):
                        cid = str(im.group(2)).replace('"', '').strip()
                        cname = im.group(3).strip()
                        full_title = f"{cname} ({mass_label})" if mass_label and mass_label.lower() not in cname.lower() else cname
                        chant_names[cid] = full_title
                        tags = ["Kyriale"]
                        if mass_name:
                            tags.append(mass_name)
                        if "de angelis" in mass_label.lower():
                            tags.append("De Angelis")
                        if "lux et origo" in mass_label.lower():
                            tags.append("Lux et origo")
                        chant_tags[cid] = list(set(chant_tags.get(cid, []) + tags))
                        if cpart_hint in ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus', 'ite', 'benedicamus']:
                            part_std = 'Agnus Dei' if cpart_hint == 'agnus' else ('Ite Missa Est' if cpart_hint in ['ite', 'benedicamus'] else cpart_hint.capitalize())
                            chant_parts[cid] = part_std

                    elif im.group(4):
                        for sub in re.finditer(r'\{id:\s*(\d+|"[\w\-]+"),\s*name:\s*"([^"]+)"', im.group(4)):
                            cid = str(sub.group(1)).replace('"', '').strip()
                            cname = sub.group(2).strip()
                            full_title = f"{cname} ({mass_label})" if mass_label and mass_label.lower() not in cname.lower() else cname
                            chant_names[cid] = full_title
                            tags = ["Kyriale"]
                            if mass_name:
                                tags.append(mass_name)
                            chant_tags[cid] = list(set(chant_tags.get(cid, []) + tags))
                            if cpart_hint in ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus', 'ite', 'benedicamus']:
                                part_std = 'Agnus Dei' if cpart_hint == 'agnus' else ('Ite Missa Est' if cpart_hint in ['ite', 'benedicamus'] else cpart_hint.capitalize())
                                chant_parts[cid] = part_std

            # Extraire ordinaryAdLib
            if adlib_code:
                for m in re.finditer(r'\{id:\s*(\d+|"[\w\-]+"),\s*name:\s*"([^"]+)"\}', adlib_code):
                    cid = str(m.group(1)).replace('"', '').strip()
                    name = m.group(2).strip()
                    chant_names[cid] = name
                    tags = ["Ad Libitum", "Kyriale"]
                    if "kyrie" in name.lower():
                        tags.append("Kyrie")
                        chant_parts[cid] = "Kyrie"
                    elif "gloria" in name.lower():
                        tags.append("Gloria")
                        chant_parts[cid] = "Gloria"
                    elif "credo" in name.lower():
                        tags.append("Credo")
                        chant_parts[cid] = "Credo"
                    elif "sanctus" in name.lower():
                        tags.append("Sanctus")
                        chant_parts[cid] = "Sanctus"
                    elif "agnus" in name.lower():
                        tags.append("Agnus Dei")
                        chant_parts[cid] = "Agnus Dei"
                    elif "asperges" in name.lower() or "vidi aquam" in name.lower():
                        tags.append("Asperges")
                        chant_parts[cid] = "Antiphona"
                    elif "benedicamus" in name.lower() or "ite" in name.lower():
                        tags.append("Ite Missa Est")
                        chant_parts[cid] = "Ite Missa Est"
                    chant_tags[cid] = list(set(chant_tags.get(cid, []) + tags))

        except Exception as e:
            print(f"[!] Erreur lecture ordinarydata.js: {e}")

    # miscChants.js
    misc_file = root_dir / "miscChants.js"
    if misc_file.is_file():
        try:
            content = misc_file.read_text(encoding='utf-8', errors='ignore')
            for m in re.finditer(r'\{\s*name:\s*"([^"]+)",\s*id:\s*(\d+|"[\w\-]+")\s*\}', content):
                name = m.group(1).strip()
                cid = str(m.group(2)).replace('"', '').strip()
                if cid not in chant_names:
                    chant_names[cid] = name
                tags = ["Devotio", "Varia"]
                chant_tags[cid] = list(set(chant_tags.get(cid, []) + tags))
        except Exception as e:
            print(f"[!] Erreur lecture miscChants.js: {e}")

    # gabc-refs.js
    gabc_refs = {}
    refs_file = root_dir / "gabc-refs.js"
    if refs_file.is_file():
        try:
            content = refs_file.read_text(encoding='utf-8', errors='ignore')
            for m in re.finditer(r'gabcRefs\["([^"]+)"\]\s*=\s*"([^"]*)";', content):
                gabc_refs[m.group(1)] = m.group(2).strip()
        except Exception as e:
            print(f"[!] Erreur lecture gabc-refs.js: {e}")

    return chant_names, chant_tags, chant_parts, gabc_refs

def extract_propers_and_feasts(root_dir):
    """
    Extrait l'ensemble des messes, dimanches et fêtes du calendrier liturgique (propersdata.js)
    avec couleur liturgique et classe / rang.
    """
    propers_file = root_dir / "propersdata.js"
    if not propers_file.is_file():
        return []

    feasts = []
    seen_keys = set()

    try:
        content = propers_file.read_text(encoding='utf-8', errors='ignore')
        
        # Parser les sections de clés
        sections = [
            (r'sundayKeys\s*=\s*\[(.*?)\];', 'Temporale', 'Dimanche, Fête du Temps', 'I. classis', 'green'),
            (r'saintKeys\s*=\s*\[(.*?)\];', 'Sanctorale', 'Fête des Saints', 'III. classis', 'white'),
            (r'commonsKeys\s*=\s*\[(.*?)\];', 'Commune Sanctorum', 'Commun des Saints', 'III. classis', 'white'),
            (r'otherKeys\s*=\s*\[(.*?)\];', 'Missa Votiva', 'Messe Votive, Messe Diverse', 'IV. classis', 'violet')
        ]

        for regex, cat_name, cat_tags, def_rank, def_color in sections:
            sec_m = re.search(regex, content, re.DOTALL)
            if not sec_m:
                continue
            sec_text = sec_m.group(1)
            for m in re.finditer(r'\{key:\s*"([^"]+)",\s*title:\s*"([^"]*)"(?:,\s*en:\s*"([^"]*)")?(?:,\s*fr:\s*"([^"]*)")?', sec_text):
                fkey = m.group(1).strip()
                ftitle = m.group(2).strip()
                fen = (m.group(3) or "").strip()
                ffr = (m.group(4) or "").strip()

                if not fkey or fkey in seen_keys or not ftitle:
                    continue
                seen_keys.add(fkey)

                # Déterminer la couleur et le rang
                color = def_color
                rank = def_rank
                full_display_title = f"Missa de : {ftitle}"
                if ffr and ffr.lower() not in ftitle.lower():
                    full_display_title += f" ({ffr})"
                elif fen and fen.lower() not in ftitle.lower():
                    full_display_title += f" ({fen})"

                if 'Adv' in fkey or 'Quad' in fkey or 'Pass' in fkey:
                    color = 'violet'
                elif 'Pasc' in fkey or 'Epi' in fkey or 'Nat' in fkey or 'Asc' in fkey or 'Corp' in fkey or 'Cord' in fkey or 'BMV' in fkey or 'Maria' in ftitle or 'Virgin' in ftitle:
                    color = 'white'
                elif 'Pent' in fkey:
                    color = 'red' if fkey in ['Pent0', 'Pent0-1', 'Pent0-2', 'Pent0-3', 'Pent0-4', 'Pent0-5', 'Pent0-6'] else 'green'
                elif 'Martyr' in ftitle or 'Apost' in ftitle or 'Cruc' in ftitle or 'Sanguin' in ftitle:
                    color = 'red'
                elif 'Defunct' in fkey or 'Requiem' in ftitle:
                    color = 'black'
                    rank = 'I. classis'

                feasts.append({
                    'id': f'missa_{fkey}',
                    'type': 'missa',
                    'key': fkey,
                    'incipit': full_display_title,
                    'titleLa': ftitle,
                    'titleVern': ffr or fen,
                    'part': 'Missa',
                    'rank': rank,
                    'color': color,
                    'tags': f'Messe, {cat_name}, {cat_tags}, {fen}, {ffr}',
                    'ref': f'{cat_name} • {rank}',
                    'book': 'Missale Romanum',
                    'len': 0
                })

    except Exception as e:
        print(f"[!] Erreur extraction propersdata.js: {e}")

    return feasts

def extract_from_local_gabc_dir(gabc_dir, output_dir):
    """
    Compile l'ensemble des données (Offices, Messes, Chants Grégoriens, Ad Libitum, Sacra Biblia)
    """
    gabc_path = Path(gabc_dir)
    if not gabc_path.is_dir():
        print(f"[ERREUR] Le dossier {gabc_dir} n'existe pas.")
        return False

    root_dir = gabc_path.parent
    index_records = []
    chants_dict = {}

    # 1. Ajouter les Heures de l'Office Divin
    print(f"[*] Intégration des {len(CANONICAL_HOURS)} Heures de l'Office Divin...")
    index_records.extend(CANONICAL_HOURS)

    # 2. Ajouter les 73 Livres de la Sainte Bible (Sacra Biblia)
    print(f"[*] Intégration des {len(BIBLE_BOOKS)} Livres de la Sainte Bible (Sacra Biblia)...")
    for b in BIBLE_BOOKS:
        index_records.append({
            'id': f"bible_{b['id']}",
            'type': 'bible',
            'bookId': b['id'],
            'incipit': f"{b['la']} ({b['fr']})",
            'titleLa': b['la'],
            'titleVern': b['fr'],
            'chapters': b['chapters'],
            'part': 'Sacra Biblia',
            'tags': f"Bible, Sacra Biblia, Vulgata, {b['cat']}, {b['la']}, {b['fr']}, {b['en']}",
            'ref': f"{b['cat']} • {b['chapters']} chapitres",
            'book': 'Sacra Biblia Vulgata'
        })

    # 3. Extraire et ajouter les Messes et Fêtes liturgiques
    print(f"[*] Extraction des Messes et Propres liturgiques depuis propersdata.js...")
    feast_records = extract_propers_and_feasts(root_dir)
    index_records.extend(feast_records)
    print(f"[*] {len(feast_records)} Messes et Fêtes liturgiques indexées.")

    # 4. Extraire les métadonnées Chant Tools
    print(f"[*] Extraction des métadonnées Chant Tools (Ad libitum, Kyriale, Dévotions)...")
    ct_names, ct_tags, ct_parts, gabc_refs = extract_chant_tools_metadata(root_dir)

    # 5. Scanner les fichiers GABC
    print(f"[*] Analyse récursive des fichiers GABC dans {gabc_path}...")
    gabc_files = sorted(list(gabc_path.rglob("*.gabc")), key=lambda p: (len(p.stem), p.stem))
    seen_ids = set()

    for file_path in gabc_files:
        try:
            raw_text = file_path.read_text(encoding='utf-8', errors='ignore')
            if not raw_text.strip():
                continue
            
            chant_id = file_path.stem
            if chant_id in seen_ids:
                continue
            seen_ids.add(chant_id)

            headers, body = parse_gabc_content(raw_text)
            
            raw_name = ct_names.get(chant_id) or headers.get('name', '')
            incipit = clean_incipit(raw_name)
            if not incipit and body:
                incipit = clean_incipit(body[:120])
            if not incipit:
                incipit = f"Chant {chant_id}"

            part = ct_parts.get(chant_id) or normalize_office_part(headers.get('office-part', ''))
            mode = headers.get('mode', '').strip()
            book = headers.get('book', '').strip()
            commentary = headers.get('commentary', '').strip()
            ref = gabc_refs.get(chant_id, commentary)
            tags_list = ct_tags.get(chant_id, [])

            if "ad lib" in incipit.lower():
                if "Ad Libitum" not in tags_list:
                    tags_list.append("Ad Libitum")
            if part in ["Kyrie", "Gloria", "Credo", "Sanctus", "Agnus Dei", "Ite Missa Est"]:
                if "Kyriale" not in tags_list:
                    tags_list.append("Kyriale")

            tags_str = ", ".join(tags_list)

            record = {
                'id': chant_id,
                'type': 'chant',
                'incipit': incipit,
                'part': part,
                'mode': mode,
                'book': book,
                'ref': ref,
                'tags': tags_str,
                'len': len(raw_text)
            }
            index_records.append(record)
            chants_dict[chant_id] = raw_text.strip()

        except Exception as e:
            print(f"[!] Erreur sur {file_path.name}: {e}")

    # Écriture des fichiers minifiés
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    index_file = out_dir / "gregorian_index.json"
    chants_file = out_dir / "gregorian_chants.json"

    print(f"[*] Écriture de {index_file} ({len(index_records)} entrées totales)...")
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_records, f, ensure_ascii=False, separators=(',', ':'))

    print(f"[*] Écriture de {chants_file} ({len(chants_dict)} partitions)...")
    with open(chants_file, 'w', encoding='utf-8') as f:
        json.dump(chants_dict, f, ensure_ascii=False, separators=(',', ':'))

    index_size_kb = os.path.getsize(index_file) / 1024
    chants_size_kb = os.path.getsize(chants_file) / 1024
    print(f"[SUCCÈS] Index universel généré : {index_size_kb:.1f} Ko ({len(index_records)} entrées) | Dictionnaire GABC : {chants_size_kb:.1f} Ko")
    return True

def main():
    parser = argparse.ArgumentParser(description="Extracteur & Compilateur Universel Oremus (Offices, Messes, Chants, Bible)")
    parser.add_argument("--compile-local", action="store_true", help="Compile depuis les dossiers locaux")
    parser.add_argument("--gabc-dir", default="gabc", help="Dossier contenant les fichiers .gabc")
    parser.add_argument("--output-dir", default="data", help="Dossier de destination pour les fichiers JSON")

    args = parser.parse_args()
    extract_from_local_gabc_dir(args.gabc_dir, args.output_dir)

if __name__ == "__main__":
    main()
