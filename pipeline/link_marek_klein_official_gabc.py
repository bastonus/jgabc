import os
import sys
import json
import re
import unicodedata
import urllib.request
import urllib.parse
from difflib import SequenceMatcher

BASE_DIR = r"d:\Documents\jgabc"
CORPUS_DIR = os.path.join(BASE_DIR, "GABC-video-notes-alignement")
SOURCES_DIR = os.path.join(CORPUS_DIR, "corpus", "sources")
ROOT_GABC = os.path.join(BASE_DIR, "gabc")
GB_DIR = os.path.join(SOURCES_DIR, "gregobase")
MK_DIR = os.path.join(SOURCES_DIR, "marekklein_transcriptions")

VIDEOS_CATALOG = os.path.join(SOURCES_DIR, "marekklein_all_unique_videos.json")
GREGOBASE_INDEX = os.path.join(SOURCES_DIR, "gregobase_index.json")
OUTPUT_MAPPING = os.path.join(CORPUS_DIR, "graduale_project_video_gabc_mapping.json")

ROMAN_NUMERALS = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X',
    11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV', 15: 'XV', 16: 'XVI', 17: 'XVII', 18: 'XVIII'
}

def normalize_text(text):
    if not text:
        return ""
    t = text.lower()
    t = t.replace('æ', 'ae').replace('œ', 'oe').replace('ǽ', 'ae')
    nfkd = unicodedata.normalize('NFKD', t)
    t = ''.join([c for c in nfkd if not unicodedata.combining(c)])
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def parse_office_part(title):
    t = title.lower()
    if 'introitus' in t or t.startswith('in:'):
        return 'in'
    if 'graduale' in t or t.startswith('gr:'):
        return 'gr'
    if 'alleluia' in t or t.startswith('al:'):
        return 'al'
    if 'tractus' in t or t.startswith('tr:'):
        return 'tr'
    if 'offertorium' in t or t.startswith('of:'):
        return 'of'
    if 'communio' in t or t.startswith('co:'):
        return 'co'
    if 'kyrie' in t:
        return 'ky'
    if 'gloria' in t:
        return 'gl'
    if 'credo' in t:
        return 'cr'
    if 'sanctus' in t:
        return 'sa'
    if 'agnus' in t:
        return 'ag'
    if 'sequentia' in t:
        return 'se'
    if 'hymnus' in t:
        return 'hy'
    if 'responsorium' in t:
        return 're'
    if 'antiphona' in t:
        return 'an'
    if 'invitatorium' in t:
        return 'inv'
    if 'lectio' in t or 'lamentatio' in t:
        return 'le'
    if 'exsultet' in t:
        return 'exsultet'
    if 'passio' in t:
        return 'pa'
    return 'va'

def extract_missa_number(title):
    m = re.search(r'missa\s+([0-9]{1,2})', title, re.IGNORECASE)
    if m:
        val = int(m.group(1))
        if 1 <= val <= 18:
            return val
    # Check roman numerals
    for val, rom in sorted(ROMAN_NUMERALS.items(), key=lambda x: -len(x[1])):
        if re.search(r'missa\s+' + rom + r'[\s:\(\),]', title, re.IGNORECASE):
            return val
    return None

def extract_incipit_from_title(title, office_part):
    t = title
    if ':' in t:
        parts = t.split(':', 1)
        prefix = parts[0].strip()
        body = parts[1].strip()
        if any(k in prefix.lower() for k in ['missa', 'festa', 'die', 'feria', 'sabbato']):
            t = body
        else:
            t = body
    t = re.sub(r'\(.*?\)', '', t)
    t = re.sub(r'\[.*?\]', '', t)
    for sep in [' - ', '  ', ' -- ']:
        if sep in t:
            t = t.split(sep)[0]
    return normalize_text(t)

def load_marekklein_transcriptions():
    mk_files = {}
    if not os.path.exists(MK_DIR):
        return mk_files
    for f in os.listdir(MK_DIR):
        if not f.endswith('.gabc'):
            continue
        path = os.path.join(MK_DIR, f)
        name = ""
        op = ""
        ntranscriber = ""
        nabc_source = ""
        has_nabc = False
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                for line in fp:
                    line = line.strip()
                    if line.startswith('%%'):
                        break
                    if line.startswith('name:'):
                        name = line[5:].rstrip(';').strip()
                    elif line.startswith('office-part:'):
                        op = line[12:].rstrip(';').strip().lower()
                    elif line.startswith('ntranscriber:'):
                        ntranscriber = line[13:].rstrip(';').strip()
                    elif line.startswith('nabc-source:'):
                        nabc_source = line[12:].rstrip(';').strip()
                        has_nabc = True
                    elif line.startswith('nabc-lines:') and not line.startswith('%'):
                        has_nabc = True
        except Exception:
            pass

        slug = f[:-5]
        parts = slug.split('-', 1)
        prefix = parts[0] if len(parts) > 1 else ""
        slug_name = parts[1] if len(parts) > 1 else parts[0]
        norm_name = normalize_text(name if name else slug_name.replace('_', ' '))
        norm_slug = normalize_text(slug_name.replace('_', ' '))

        # Map prefix to standard office_part code
        std_prefix_map = {
            'in': 'in', 'gr': 'gr', 'al': 'al', 'alleluia': 'al', 'tr': 'tr',
            'of': 'of', 'co': 'co', 'ky': 'ky', 'gl': 'gl', 'sa': 'sa',
            'ag': 'ag', 'an': 'an', 'ant': 'an', 'hy': 'hy', 'resp': 're',
            'missa2': 'missa', 'missa4': 'missa', 'credo6': 'cr', 'exsultet': 'exsultet'
        }
        std_op = std_prefix_map.get(prefix, prefix)

        mk_files[f] = {
            'filename': f,
            'path': path,
            'name': name,
            'prefix': prefix,
            'std_op': std_op,
            'office_part': op,
            'norm_name': norm_name,
            'norm_slug': norm_slug,
            'ntranscriber': ntranscriber,
            'nabc_source': nabc_source,
            'has_nabc': has_nabc or bool(nabc_source)
        }
    return mk_files

def load_gregobase_index():
    if not os.path.exists(GREGOBASE_INDEX):
        return []
    with open(GREGOBASE_INDEX, 'r', encoding='utf-8') as f:
        data = json.load(f)
    entries = []
    for item in data:
        incipit = item.get('incipit', '')
        op = (item.get('office-part', '') or '').lower()
        tr = (item.get('transcriber', '') or '') + ' ' + (item.get('ntranscriber', '') or '')
        has_nabc = bool(item.get('gabc_nabc') or item.get('nabc_source'))

        std_op = 'va'
        if any(k in op for k in ['introit', 'in']): std_op = 'in'
        elif any(k in op for k in ['gradual', 'gr']): std_op = 'gr'
        elif any(k in op for k in ['allelui', 'al']): std_op = 'al'
        elif any(k in op for k in ['tract', 'tr']): std_op = 'tr'
        elif any(k in op for k in ['offertor', 'of']): std_op = 'of'
        elif any(k in op for k in ['commun', 'co']): std_op = 'co'
        elif 'kyrie' in op or 'ky' == op: std_op = 'ky'
        elif 'gloria' in op or 'gl' == op: std_op = 'gl'
        elif 'credo' in op or 'cr' == op: std_op = 'cr'
        elif 'sanctus' in op or 'sa' == op: std_op = 'sa'
        elif 'agnus' in op or 'ag' == op: std_op = 'ag'
        elif 'hymn' in op or 'hy' == op: std_op = 'hy'
        elif 'respons' in op or 're' == op: std_op = 're'
        elif 'antiphon' in op or 'an' == op: std_op = 'an'

        entries.append({
            'id': item.get('id'),
            'incipit': incipit,
            'norm_incipit': normalize_text(incipit),
            'office_part': op,
            'std_op': std_op,
            'transcriber': tr,
            'is_mk': ('marek' in tr.lower() or 'klein' in tr.lower()),
            'has_nabc': has_nabc,
            'source': item.get('source', '') or item.get('book', '') or '',
            'raw': item
        })
    return entries

def download_gregobase_gabc(piece_id):
    dest_path = os.path.join(ROOT_GABC, f"{piece_id}.gabc")
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10:
        return dest_path
    
    os.makedirs(ROOT_GABC, exist_ok=True)
    os.makedirs(GB_DIR, exist_ok=True)
    gb_dest = os.path.join(GB_DIR, f"{piece_id}.gabc")
    if os.path.exists(gb_dest) and os.path.getsize(gb_dest) > 10:
        import shutil
        shutil.copy2(gb_dest, dest_path)
        return dest_path

    url = f"https://gregobase.selapa.net/download.php?id={piece_id}&format=gabc"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Oremus-MarekKlein-Sync/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read()
        if content and len(content) > 10 and not b"Error" in content[:30]:
            with open(dest_path, 'wb') as f:
                f.write(content)
            with open(gb_dest, 'wb') as f:
                f.write(content)
            return dest_path
    except Exception as ex:
        print(f"Failed to download GregoBase ID {piece_id}: {ex}")
    return None

def match_kyriale_ordinary(title, office_part, missa_num, mk_files, gb_entries):
    # Handle Credo
    if office_part == 'cr':
        m_cr = re.search(r'credo\s*([0-9ivx]+)', title, re.IGNORECASE)
        cr_num = m_cr.group(1).upper() if m_cr else ""
        if 'ambrosiano' in title.lower():
            # Credo IV or ambrosiano
            for item in gb_entries:
                if 'ambrosiano' in item['norm_incipit'] or 'credo iv' in item['norm_incipit']:
                    return {
                        'tier': 4, 'source_tier': 'gregobase_graduale_romanum',
                        'gabc_file': f"{item['id']}.gabc", 'gabc_path': f"gabc/{item['id']}.gabc",
                        'has_nabc': item['has_nabc'], 'nabc_source': item['raw'].get('nabc_source', ''),
                        'gregobase_id': item['id'], 'incipit': item['incipit'], 'confidence': 0.98
                    }
        if cr_num:
            if cr_num in ['6', 'VI'] and 'credo6.gabc' in mk_files:
                mk = mk_files['credo6.gabc']
                return {
                    'tier': 1, 'source_tier': 'marekklein_github_nabc',
                    'gabc_file': 'credo6.gabc', 'gabc_path': 'corpus/sources/marekklein_transcriptions/credo6.gabc',
                    'has_nabc': True, 'nabc_source': mk.get('nabc_source', ''),
                    'gregobase_id': None, 'incipit': 'Credo VI', 'confidence': 1.0
                }
            for item in gb_entries:
                if f'credo {cr_num.lower()}' == item['norm_incipit'] or f'credo {cr_num.lower()}' in item['norm_incipit']:
                    return {
                        'tier': 4, 'source_tier': 'gregobase_graduale_romanum',
                        'gabc_file': f"{item['id']}.gabc", 'gabc_path': f"gabc/{item['id']}.gabc",
                        'has_nabc': item['has_nabc'], 'nabc_source': item['raw'].get('nabc_source', ''),
                        'gregobase_id': item['id'], 'incipit': item['incipit'], 'confidence': 0.95
                    }

    if not missa_num:
        return None

    rom = ROMAN_NUMERALS.get(missa_num, '')
    part_names = {'ky': 'Kyrie', 'gl': 'Gloria', 'sa': 'Sanctus', 'ag': 'Agnus'}
    pname = part_names.get(office_part, '')
    if not pname:
        return None

    # Check Tier 1 for Missa 2 or Missa 4
    if missa_num == 2:
        fn = f"missa2-{office_part if office_part != 'ag' else 'agnus'}.gabc"
        if office_part == 'ky': fn = 'missa2-kyrie.gabc'
        elif office_part == 'gl': fn = 'missa2-gloria.gabc'
        elif office_part == 'sa': fn = 'missa2-sanctus.gabc'
        elif office_part == 'ag': fn = 'missa2-agnus.gabc'
        if fn in mk_files:
            mk = mk_files[fn]
            return {
                'tier': 1, 'source_tier': 'marekklein_github_nabc',
                'gabc_file': fn, 'gabc_path': f"corpus/sources/marekklein_transcriptions/{fn}",
                'has_nabc': True, 'nabc_source': mk.get('nabc_source', ''),
                'gregobase_id': None, 'incipit': f"{pname} {rom}", 'confidence': 1.0
            }
    elif missa_num == 4 and office_part == 'ag':
        if 'missa4-agnus.gabc' in mk_files:
            mk = mk_files['missa4-agnus.gabc']
            return {
                'tier': 1, 'source_tier': 'marekklein_github_nabc',
                'gabc_file': 'missa4-agnus.gabc', 'gabc_path': 'corpus/sources/marekklein_transcriptions/missa4-agnus.gabc',
                'has_nabc': True, 'nabc_source': mk.get('nabc_source', ''),
                'gregobase_id': None, 'incipit': f"Agnus Dei IV", 'confidence': 1.0
            }

    # Match in GregoBase by exact target patterns
    target_patterns = [
        f"{pname} {rom}".lower(),
        f"{pname} dei {rom}".lower(),
        f"{pname} (ad lib.) {rom}".lower()
    ]

    best_cand = None
    for item in gb_entries:
        norm = item['norm_incipit']
        for pat in target_patterns:
            if norm == pat or norm.startswith(pat + ' ') or norm.startswith(pat + '.'):
                # Prefer standard Graduale Romanum entry
                best_cand = item
                break
        if best_cand:
            break

    if best_cand:
        return {
            'tier': 4,
            'source_tier': 'gregobase_graduale_romanum',
            'gabc_file': f"{best_cand['id']}.gabc",
            'gabc_path': f"gabc/{best_cand['id']}.gabc",
            'has_nabc': best_cand['has_nabc'],
            'nabc_source': best_cand['raw'].get('nabc_source', ''),
            'gregobase_id': best_cand['id'],
            'incipit': best_cand['incipit'],
            'confidence': 0.98
        }

    return None

def find_best_gabc(title, office_part, incipit, mk_files, gb_entries):
    norm_incipit = normalize_text(incipit)
    norm_title = normalize_text(title)

    # 1. First check if it's a Kyriale / Mass Ordinary piece
    missa_num = extract_missa_number(title)
    if office_part in ['ky', 'gl', 'sa', 'ag', 'cr'] or missa_num:
        ord_match = match_kyriale_ordinary(title, office_part, missa_num, mk_files, gb_entries)
        if ord_match:
            return ord_match

    # STRICT OFFICE PART FILTERING
    # An office_part MUST match between query and candidate!
    
    # -------------------------------------------------------------
    # TIER 1: Marek Klein Personal Transcriptions (Authoritative)
    # -------------------------------------------------------------
    best_t1 = None
    best_t1_score = 0
    for f, mk in mk_files.items():
        # Strict office-part check
        if office_part != 'va' and mk['std_op'] != 'va':
            if office_part != mk['std_op']:
                continue

        score = 0
        if norm_incipit:
            if norm_incipit == mk['norm_name'] or norm_incipit == mk['norm_slug']:
                score = 1.0
            elif norm_incipit.startswith(mk['norm_name']) or mk['norm_name'].startswith(norm_incipit):
                score = 0.95
            elif norm_incipit in mk['norm_name'] or mk['norm_name'] in norm_incipit:
                score = 0.90
            elif norm_incipit in mk['norm_slug'] or mk['norm_slug'] in norm_incipit:
                score = 0.88
            else:
                sim1 = SequenceMatcher(None, norm_incipit, mk['norm_name']).ratio()
                sim2 = SequenceMatcher(None, norm_incipit, mk['norm_slug']).ratio()
                sim = max(sim1, sim2)
                if sim >= 0.82:
                    score = sim

        if score > best_t1_score and score >= 0.85:
            best_t1_score = score
            best_t1 = mk

    if best_t1:
        return {
            'tier': 1,
            'source_tier': 'marekklein_github_nabc',
            'gabc_file': best_t1['filename'],
            'gabc_path': f"corpus/sources/marekklein_transcriptions/{best_t1['filename']}",
            'has_nabc': True,
            'nabc_source': best_t1.get('nabc_source', ''),
            'gregobase_id': None,
            'incipit': best_t1['name'] or incipit,
            'confidence': min(1.0, round(best_t1_score, 3))
        }

    # -------------------------------------------------------------
    # TIER 2: GregoBase transcribed by Marek Klein
    # -------------------------------------------------------------
    best_t2 = None
    best_t2_score = 0
    for item in gb_entries:
        if not item['is_mk']:
            continue
        if office_part != 'va' and item['std_op'] != 'va':
            if office_part != item['std_op']:
                continue

        score = 0
        if norm_incipit:
            if norm_incipit == item['norm_incipit']:
                score = 1.0
            elif norm_incipit.startswith(item['norm_incipit']) or item['norm_incipit'].startswith(norm_incipit):
                score = 0.95
            elif norm_incipit in item['norm_incipit'] or item['norm_incipit'] in norm_incipit:
                score = 0.90
            else:
                sim = SequenceMatcher(None, norm_incipit, item['norm_incipit']).ratio()
                if sim >= 0.82:
                    score = sim

        if score > best_t2_score and score >= 0.85:
            best_t2_score = score
            best_t2 = item

    if best_t2:
        return {
            'tier': 2,
            'source_tier': 'gregobase_marekklein',
            'gabc_file': f"{best_t2['id']}.gabc",
            'gabc_path': f"gabc/{best_t2['id']}.gabc",
            'has_nabc': best_t2['has_nabc'],
            'nabc_source': best_t2['raw'].get('nabc_source', ''),
            'gregobase_id': best_t2['id'],
            'incipit': best_t2['incipit'],
            'confidence': min(1.0, round(best_t2_score, 3))
        }

    # -------------------------------------------------------------
    # TIER 3: GregoBase with NABC markup
    # -------------------------------------------------------------
    best_t3 = None
    best_t3_score = 0
    for item in gb_entries:
        if not item['has_nabc']:
            continue
        if office_part != 'va' and item['std_op'] != 'va':
            if office_part != item['std_op']:
                continue

        score = 0
        if norm_incipit:
            if norm_incipit == item['norm_incipit']:
                score = 1.0
            elif norm_incipit.startswith(item['norm_incipit']) or item['norm_incipit'].startswith(norm_incipit):
                score = 0.95
            elif norm_incipit in item['norm_incipit'] or item['norm_incipit'] in norm_incipit:
                score = 0.90
            else:
                sim = SequenceMatcher(None, norm_incipit, item['norm_incipit']).ratio()
                if sim >= 0.85:
                    score = sim

        if score > best_t3_score and score >= 0.85:
            best_t3_score = score
            best_t3 = item

    if best_t3:
        return {
            'tier': 3,
            'source_tier': 'gregobase_nabc',
            'gabc_file': f"{best_t3['id']}.gabc",
            'gabc_path': f"gabc/{best_t3['id']}.gabc",
            'has_nabc': True,
            'nabc_source': best_t3['raw'].get('nabc_source', ''),
            'gregobase_id': best_t3['id'],
            'incipit': best_t3['incipit'],
            'confidence': min(1.0, round(best_t3_score, 3))
        }

    # -------------------------------------------------------------
    # TIER 4: Standard GregoBase / Graduale Romanum
    # -------------------------------------------------------------
    best_t4 = None
    best_t4_score = 0
    for item in gb_entries:
        if office_part != 'va' and item['std_op'] != 'va':
            if office_part != item['std_op']:
                continue

        score = 0
        if norm_incipit:
            if norm_incipit == item['norm_incipit']:
                score = 1.0
            elif norm_incipit.startswith(item['norm_incipit']) or item['norm_incipit'].startswith(norm_incipit):
                score = 0.94
            elif norm_incipit in item['norm_incipit'] or item['norm_incipit'] in norm_incipit:
                score = 0.88
            else:
                sim = SequenceMatcher(None, norm_incipit, item['norm_incipit']).ratio()
                if sim >= 0.82:
                    score = sim

        src = item['source'].lower()
        if 'graduale' in src or 'triplex' in src or 'usualis' in src:
            score += 0.04

        if score > best_t4_score and score >= 0.82:
            best_t4_score = score
            best_t4 = item

    if best_t4:
        return {
            'tier': 4,
            'source_tier': 'gregobase_graduale_romanum',
            'gabc_file': f"{best_t4['id']}.gabc",
            'gabc_path': f"gabc/{best_t4['id']}.gabc",
            'has_nabc': best_t4['has_nabc'],
            'nabc_source': best_t4['raw'].get('nabc_source', ''),
            'gregobase_id': best_t4['id'],
            'incipit': best_t4['incipit'],
            'confidence': min(1.0, round(best_t4_score, 3))
        }

    return None

def main():
    print("=================================================================")
    print("  LIAISON DES VIDÉOS GRADUALEPROJECT AVEC LEURS GABC OFFICIELS (V2)")
    print("=================================================================\n")

    if not os.path.exists(VIDEOS_CATALOG):
        print(f"Erreur : Catalogue des vidéos non trouvé à {VIDEOS_CATALOG}")
        sys.exit(1)

    with open(VIDEOS_CATALOG, 'r', encoding='utf-8') as f:
        videos = json.load(f)
    print(f"Vidéos uniques à traiter : {len(videos)}")

    mk_files = load_marekklein_transcriptions()
    print(f"Transcriptions personnelles de Marek Klein chargées : {len(mk_files)} (Tier 1)")

    gb_entries = load_gregobase_index()
    print(f"Entrées GregoBase chargées : {len(gb_entries)} (Tiers 2, 3, 4)\n")

    matched_corpus = []
    unmatched_corpus = []
    tier_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    nabc_total = 0

    for idx, vid in enumerate(videos):
        title = vid['title']
        yid = vid['youtube_id']
        op = parse_office_part(title)
        incipit = extract_incipit_from_title(title, op)

        match = find_best_gabc(title, op, incipit, mk_files, gb_entries)

        if match:
            tier_counts[match['tier']] += 1
            if match['has_nabc']:
                nabc_total += 1

            if match['tier'] == 1:
                target_gabc = os.path.join(ROOT_GABC, f"mk_{match['gabc_file']}")
                if not os.path.exists(target_gabc) and os.path.exists(os.path.join(BASE_DIR, match['gabc_path'])):
                    import shutil
                    shutil.copy2(os.path.join(BASE_DIR, match['gabc_path']), target_gabc)
            else:
                if match['gregobase_id']:
                    download_gregobase_gabc(match['gregobase_id'])

            matched_corpus.append({
                'youtube_id': yid,
                'title': title,
                'office_part': op,
                'incipit': match['incipit'],
                'official_tier': match['tier'],
                'official_source': match['source_tier'],
                'gabc_file': match['gabc_file'],
                'gabc_path': match['gabc_path'],
                'gregobase_id': match['gregobase_id'],
                'has_nabc': match['has_nabc'],
                'nabc_source': match['nabc_source'],
                'confidence': match['confidence'],
                'duration': vid.get('duration'),
                'playlists': vid.get('playlists', []),
                'categories': vid.get('categories', [])
            })
        else:
            unmatched_corpus.append({
                'youtube_id': yid,
                'title': title,
                'office_part': op,
                'incipit': incipit,
                'playlists': vid.get('playlists', [])
            })

    total_matched = len(matched_corpus)
    total_unmatched = len(unmatched_corpus)
    total = total_matched + total_unmatched
    match_rate = total_matched / total if total > 0 else 0.0

    print("\n=================================================================")
    print("  RÉSULTATS DE L'ASSOCIATION GABC OFFICIELS (V2 STRICTE)")
    print("=================================================================")
    print(f"Total vidéos traitées        : {total}")
    print(f"Total pièces associées       : {total_matched} ({match_rate*100:.2f}%)")
    print(f"  - Niveau 1 (Marek Klein GitHub NABC) : {tier_counts[1]}")
    print(f"  - Niveau 2 (Marek Klein GregoBase)   : {tier_counts[2]}")
    print(f"  - Niveau 3 (GregoBase NABC alternatif): {tier_counts[3]}")
    print(f"  - Niveau 4 (Graduale Romanum standard): {tier_counts[4]}")
    print(f"Total pièces avec notation NABC : {nabc_total} ({nabc_total/total_matched*100:.1f}%)")
    print(f"Total pièces non associées   : {total_unmatched}")

    corpus_index = {}
    for item in matched_corpus:
        key = f"{item['gregobase_id'] or item['gabc_file']}_{item['youtube_id']}"
        corpus_index[key] = item

    output_payload = {
        'source_page': 'https://gregoriana.sk/graduale/graduale-project-youtube-playlists/',
        'channel': 'GradualeProject (Marek Klein)',
        'stats': {
            'total_videos': total,
            'matched_to_gabc': total_matched,
            'unmatched': total_unmatched,
            'match_rate': round(match_rate, 4),
            'tier_distribution': tier_counts,
            'total_with_nabc': nabc_total
        },
        'videos': matched_corpus,
        'corpus_index': corpus_index,
        'unmatched_titles': unmatched_corpus
    }

    with open(OUTPUT_MAPPING, 'w', encoding='utf-8') as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"\nFichier de cartographie enregistré : {OUTPUT_MAPPING}")

if __name__ == '__main__':
    main()
