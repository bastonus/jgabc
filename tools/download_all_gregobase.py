#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
GregoBase Downloader & Full Corpus Generator
Télécharge et exporte l'intégralité des partitions GABC de GregoBase
dans le dossier distinct 'gregobase/' avec indexation complète.
=============================================================================
"""

import os
import sys
import io
import csv
import json
import urllib.request
from pathlib import Path

# Mapping officiel GregoBase pour les abréviations d'usage (office-part)
USAGE_MAP = {
    'al': 'Alleluia',
    'an': 'Antiphona',
    'ca': 'Canticum',
    'co': 'Communio',
    'gr': 'Graduale',
    'hy': 'Hymnus',
    'im': 'Improperia',
    'in': 'Introitus',
    'ky': 'Kyriale',
    'of': 'Offertorium',
    'or': 'Oratio',
    'pa': 'Praefationes',
    'pr': 'Prosa',
    'ps': 'Psalmus',
    'rb': 'Responsorium breve',
    're': 'Responsorium',
    'rh': 'Rhythmus',
    'se': 'Sequentia',
    'su': 'Supplicatio',
    'tp': 'Tropa',
    'tr': 'Tractus',
    'va': 'Varia'
}

BASE_CSV_URL = "https://raw.githubusercontent.com/juliantrue/GregoBaseExtract/master/extract/csv/"

def fetch_csv(filename):
    url = BASE_CSV_URL + filename
    print(f"[*] Téléchargement de {filename} depuis {url}...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = resp.read().decode('utf-8', errors='ignore')
    reader = csv.DictReader(io.StringIO(data))
    return list(reader)

def format_gabc_content(raw_gabc_json):
    if not raw_gabc_json:
        return ""
    try:
        parsed = json.loads(raw_gabc_json)
        if isinstance(parsed, str):
            return parsed
        elif isinstance(parsed, list):
            # Format GregoBase standard: list of [type, content, ...]
            gabc_chunks = [elem[1] for elem in parsed if isinstance(elem, list) and len(elem) >= 2 and elem[0] == 'gabc']
            return "\n\n".join(gabc_chunks)
    except Exception:
        pass
    return raw_gabc_json

def build_gabc_file(chant, sources_label):
    headers = []
    
    incipit = (chant.get('incipit') or '').strip()
    if incipit:
        headers.append(f"name:{incipit};")
        
    raw_part = (chant.get('office-part') or '').strip()
    full_part = USAGE_MAP.get(raw_part.lower(), raw_part)
    if full_part:
        headers.append(f"office-part:{full_part};")
        
    mode = (chant.get('mode') or '').strip()
    if mode:
        mode_var = (chant.get('mode_var') or '').strip()
        headers.append(f"mode:{mode + (' ' + mode_var if mode_var else '')};")
        
    if sources_label:
        headers.append(f"book:{sources_label};")
        
    transcriber = (chant.get('transcriber') or '').strip()
    if transcriber:
        headers.append(f"transcriber:{transcriber};")
        
    commentary = (chant.get('commentary') or '').strip()
    if commentary:
        headers.append(f"commentary:{commentary};")
        
    cantusid = (chant.get('cantusid') or '').strip()
    if cantusid:
        headers.append(f"cantusid:{cantusid};")
        
    version = (chant.get('version') or '').strip()
    if version:
        headers.append(f"version:{version};")
        
    # Check if NABC is present and declare header if not already present
    gabc_body = format_gabc_content(chant.get('gabc'))
    has_nabc = bool('(' in gabc_body and '|' in gabc_body)
    
    # Extra headers stored in 'headers' column
    extra_headers = (chant.get('headers') or '').strip()
    if extra_headers:
        for line in extra_headers.splitlines():
            line = line.strip()
            if line and line != '%%':
                headers.append(line if line.endswith(';') else line + ';')
                
    if has_nabc and not any('nabc-lines' in h.lower() for h in headers):
        headers.append("nabc-lines:1;")

    header_text = "\n".join(headers)
    verses = (chant.get('gabc_verses') or '').strip()
    
    full_text = header_text + "\n%%\n" + gabc_body
    if verses:
        full_text += "\n" + verses
        
    return full_text.strip() + "\n", has_nabc

def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    root_dir = Path(__file__).resolve().parent.parent
    target_dir = root_dir / "gregobase"
    target_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"=== EXTRACTION ET TÉLÉCHARGEMENT COMPLET DE GREGOBASE ===")
    print(f"Dossier cible : {target_dir}")
    
    sources_data = fetch_csv("gregobase_sources.csv")
    chant_sources_data = fetch_csv("gregobase_chant_sources.csv")
    chants_data = fetch_csv("gregobase_chants.csv")
    
    # 1. Indexer les sources (Livres)
    sources_by_id = {}
    for s in sources_data:
        sid = s.get('id')
        if sid:
            sources_by_id[sid] = s

    # 2. Associer les sources à chaque chant
    # chant_id -> [(source_id, page)]
    sources_by_chant = {}
    for cs in chant_sources_data:
        cid = cs.get('chant_id')
        if not cid:
            continue
        sources_by_chant.setdefault(cid, []).append((cs.get('source'), cs.get('page')))
        
    print(f"[*] Génération des partitions GABC individuelles dans {target_dir}...")
    
    index_manifest = []
    nabc_count = 0
    written_count = 0
    
    for chant in chants_data:
        cid = chant.get('id')
        if not cid:
            continue
            
        # Construire le label de source 'book'
        c_sources = sources_by_chant.get(cid, [])
        source_parts = []
        for sid, page in c_sources:
            s_info = sources_by_id.get(sid)
            if s_info:
                stitle = s_info.get('title', '')
                syear = s_info.get('year', '')
                spage = f"p. {page}" if page else ""
                part_label = f"{stitle}, {syear}, {spage}".strip(", ")
                source_parts.append(part_label)
        book_label = " & ".join(source_parts)
        
        gabc_code, has_nabc = build_gabc_file(chant, book_label)
        
        # Ne sauvegarder que si du code GABC réel est présent
        raw_body = chant.get('gabc')
        if not raw_body or raw_body.strip() == '' or raw_body.strip() == '""':
            continue
            
        file_path = target_dir / f"{cid}.gabc"
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(gabc_code)
            
        written_count += 1
        if has_nabc:
            nabc_count += 1
            
        index_manifest.append({
            'id': cid,
            'incipit': chant.get('incipit', ''),
            'office_part': chant.get('office-part', ''),
            'office_part_name': USAGE_MAP.get((chant.get('office-part') or '').lower(), chant.get('office-part', '')),
            'mode': chant.get('mode', ''),
            'transcriber': chant.get('transcriber', ''),
            'book': book_label,
            'has_nabc': has_nabc,
            'file': f"{cid}.gabc"
        })
        
        if written_count % 2000 == 0:
            print(f"  -> {written_count} partitions générées...")

    print(f"[OK] {written_count} fichiers .gabc créés dans {target_dir}")
    print(f"[OK] Dont {nabc_count} partitions avec notation neumatique NABC.")
    
    # 3. Écrire le manifest JSON d'indexation
    index_file = target_dir / "gregobase_index.json"
    print(f"[*] Écriture de l'index complet {index_file} ({len(index_manifest)} entrées)...")
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_manifest, f, ensure_ascii=False, indent=2)
        
    # 4. Écrire le README.md récapitulatif
    readme_file = target_dir / "README.md"
    readme_content = f"""# Corpus Intégral GregoBase

Ce dossier contient l'ensemble des transcriptions de partitions grégoriennes du projet **GregoBase** ([gregobase.selapa.net](https://gregobase.selapa.net/)).

## Statistiques du Corpus
- **Nombre total de partitions GABC :** {written_count}
- **Partitions avec notation neumatique ancienne (NABC) :** {nabc_count}
- **Index structuré :** [`gregobase_index.json`](./gregobase_index.json)
- **Fichiers :** Nommés `<id>.gabc` selon l'identifiant officiel GregoBase.

Chaque fichier contient ses en-têtes canoniques complets (`name`, `office-part`, `mode`, `book`, `transcriber`, `commentary`, `nabc-lines`), le séparateur `%%` et la partition grégorienne.
"""
    with open(readme_file, 'w', encoding='utf-8') as f:
        f.write(readme_content)
        
    print(f"[OK] README récapitulatif généré : {readme_file}")
    print(f"[SUCCÈS TOTAL] L'intégralité de GregoBase est disponible dans le dossier distinct 'gregobase/'.")

if __name__ == "__main__":
    main()
