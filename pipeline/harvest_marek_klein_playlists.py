import os
import sys
import json
import re
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

BASE_DIR = r"d:\Documents\jgabc"
CORPUS_SOURCES = os.path.join(BASE_DIR, "GABC-video-notes-alignement", "corpus", "sources")
OUTPUT_PLAYLISTS = os.path.join(BASE_DIR, "GABC-video-notes-alignement", "graduale_project_playlists_and_gabc_links.json")
OUTPUT_ALL_PLAYLISTS_CACHE = os.path.join(CORPUS_SOURCES, "marekklein_all_playlists_cache.json")
GREGORIANA_CACHE = r"C:\Users\Azandikka\.gemini\antigravity\brain\a052531b-0f1a-42df-a385-e29c845d8078\.system_generated\steps\7557\content.md"

def categorize_playlist(title):
    t = title.lower()
    if any(k in t for k in ['kyriale', 'missa 1', 'missa 2', 'missa 3', 'missa 4', 'missa 5', 'missa 6', 
                           'missa 7', 'missa 8', 'missa 9', 'missa 10', 'missa 11', 'missa 12', 'missa 13', 
                           'missa 14', 'missa 15', 'missa 16', 'missa 17', 'missa 18', 'credo']):
        return 'Kyriale / Ordinarium Missae'
    if 'advent' in t:
        return 'Tempus Adventus'
    if any(k in t for k in ['nativitat', 'epiphani', 'natal', 'noel', 'christmas', 'baptismate', 'sanctae familiae']):
        return 'Tempus Nativitatis'
    if any(k in t for k in ['cinerum', 'quadragesim', 'septuagesim', 'sexagesim', 'quinquagesim', 'hebdomada i', 
                           'hebdomada ii', 'hebdomada iii', 'hebdomada iv', 'hebdomada v']) and 'pasch' not in t and 'pentecost' not in t:
        return 'Tempus Quadragesimae'
    if any(k in t for k in ['palmis', 'hebdomada sancta', 'parasceve', 'cena domini', 'coena', 'passio', 'lamentatio', 'sabbato sancto', 'pedum', 'chrismatis', 'tenebrae']):
        return 'Hebdomada Sancta'
    if any(k in t for k in ['pascha', 'resurrectionis', 'ascension', 'pentecost', 'albis']):
        return 'Tempus Paschale'
    if any(k in t for k in ['defunct', 'requiem', 'exsequi']):
        return 'Missa pro Defunctis / Exsequiae'
    if any(k in t for k in ['introit', 'gradualia', 'alleluiat', 'tractus', 'offertori', 'communio']):
        return 'Proprium de Tempore per Genres'
    if any(k in t for k in ['sanct', 'maria', 'trinitat', 'corporis', 'cordis', 'ioannis', 'archangel', 'apostol', 'martyr', 'virgin', 'confessor', 'festa', 'dedicatione', 'assumptio', 'conceptio']):
        return 'Sanctorale & Solemnitates'
    if any(k in t for k in ['post pentecosten', 'per annum', 'hebdomada vi', 'hebdomada vii', 'hebdomada viii', 'hebdomada ix', 'hebdomada x',
                           'hebdomada xi', 'hebdomada xii', 'hebdomada xiii', 'hebdomada xiv', 'hebdomada xv', 'hebdomada xvi',
                           'hebdomada xvii', 'hebdomada xviii', 'hebdomada xix', 'hebdomada xx', 'hebdomada xxi', 'hebdomada xxii',
                           'hebdomada xxiii', 'hebdomada xxiv', 'hebdomada xxv', 'hebdomada xxvi', 'hebdomada xxvii', 'hebdomada xxviii',
                           'hebdomada xxix', 'hebdomada xxx', 'hebdomada xxxi', 'hebdomada xxxii', 'hebdomada xxxiii', 'hebdomada xxxiv']):
        return 'Tempus per Annum'
    return 'Varia / Liturgica'

def load_playlists_from_gregoriana():
    playlists = {}
    if os.path.exists(GREGORIANA_CACHE):
        with open(GREGORIANA_CACHE, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        for a in soup.find_all('a'):
            href = a.get('href', '')
            text = a.get_text(strip=True)
            if 'playlist?list=' in href:
                m = re.search(r'list=([a-zA-Z0-9_-]+)', href)
                if m:
                    pid = m.group(1)
                    playlists[pid] = {'id': pid, 'title': text, 'source': 'gregoriana.sk', 'url': f"https://www.youtube.com/playlist?list={pid}"}
    return playlists

def load_playlists_from_yt_channel():
    yt_path = os.path.join(CORPUS_SOURCES, "marekklein_channel_playlists.json")
    playlists = {}
    if os.path.exists(yt_path):
        with open(yt_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for e in data.get('entries', []):
            pid = e.get('id')
            if pid:
                playlists[pid] = {'id': pid, 'title': e.get('title', ''), 'source': 'youtube_channel', 'url': f"https://www.youtube.com/playlist?list={pid}"}
    return playlists

def fetch_single_playlist(pl_info):
    pid = pl_info['id']
    cmd = ['yt-dlp', '--flat-playlist', '-J', f'https://www.youtube.com/playlist?list={pid}']
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=60)
        if res.returncode == 0:
            data = json.loads(res.stdout)
            videos = []
            for idx, entry in enumerate(data.get('entries', [])):
                vid_id = entry.get('id')
                vid_title = entry.get('title', '')
                vid_duration = entry.get('duration')
                if vid_id:
                    videos.append({
                        'position': idx + 1,
                        'youtube_id': vid_id,
                        'title': vid_title,
                        'duration': vid_duration,
                        'url': f"https://www.youtube.com/watch?v={vid_id}"
                    })
            return pid, {
                'id': pid,
                'title': data.get('title') or pl_info['title'],
                'url': pl_info['url'],
                'source': pl_info.get('source', 'both'),
                'category': categorize_playlist(data.get('title') or pl_info['title']),
                'video_count': len(videos),
                'videos': videos
            }
        else:
            return pid, None
    except Exception as ex:
        print(f"Error fetching playlist {pid}: {ex}")
        return pid, None

def main():
    print("=================================================================")
    print("  COLLECTE ET UNIFICATION DES PLAYLISTS GRADUALEPROJECT")
    print("=================================================================\n")

    greg_pl = load_playlists_from_gregoriana()
    yt_pl = load_playlists_from_yt_channel()
    print(f"Playlists gregoriana.sk : {len(greg_pl)}")
    print(f"Playlists YouTube channel: {len(yt_pl)}")

    # Merge unique playlists
    merged_playlists = {}
    for pid, p in greg_pl.items():
        merged_playlists[pid] = p
    for pid, p in yt_pl.items():
        if pid in merged_playlists:
            merged_playlists[pid]['source'] = 'both'
            if not merged_playlists[pid]['title'] or len(p['title']) > len(merged_playlists[pid]['title']):
                merged_playlists[pid]['title'] = p['title']
        else:
            merged_playlists[pid] = p

    total_playlists = len(merged_playlists)
    print(f"Total playlists uniques après déduplication : {total_playlists}\n")

    # Load existing cache if present
    cached_data = {}
    if os.path.exists(OUTPUT_ALL_PLAYLISTS_CACHE):
        try:
            with open(OUTPUT_ALL_PLAYLISTS_CACHE, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
            print(f"Cache existant trouvé : {len(cached_data)} playlists déjà extraites.")
        except Exception:
            cached_data = {}

    to_fetch = [p for pid, p in merged_playlists.items() if pid not in cached_data or not cached_data[pid].get('videos')]
    print(f"Playlists à extraire via yt-dlp : {len(to_fetch)}")

    if to_fetch:
        print(f"Lancement de l'extraction multi-thread (12 workers)...")
        t0 = time.time()
        completed = 0
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = {executor.submit(fetch_single_playlist, p): p['id'] for p in to_fetch}
            for fut in as_completed(futures):
                pid, res = fut.result()
                completed += 1
                if res:
                    cached_data[pid] = res
                if completed % 20 == 0 or completed == len(to_fetch):
                    print(f"  [{completed}/{len(to_fetch)}] playlists extraites ({time.time()-t0:.1f}s)...")

        # Save cache
        with open(OUTPUT_ALL_PLAYLISTS_CACHE, 'w', encoding='utf-8') as f:
            json.dump(cached_data, f, ensure_ascii=False, indent=2)
        print(f"Cache des playlists mis à jour ({len(cached_data)} playlists).\n")

    # Aggregate all unique videos
    all_videos = {}
    for pid, pdata in cached_data.items():
        cat = pdata.get('category', 'Varia')
        pl_name = pdata.get('title', '')
        for vid in pdata.get('videos', []):
            yid = vid['youtube_id']
            if yid not in all_videos:
                all_videos[yid] = {
                    'youtube_id': yid,
                    'title': vid['title'],
                    'duration': vid.get('duration'),
                    'url': vid['url'],
                    'playlists': [],
                    'categories': set()
                }
            all_videos[yid]['playlists'].append({'playlist_id': pid, 'playlist_name': pl_name, 'position': vid['position']})
            all_videos[yid]['categories'].add(cat)

    # Also incorporate any channel uploads not in playlists
    channel_vids_path = os.path.join(CORPUS_SOURCES, "marekklein_channel_videos.json")
    if os.path.exists(channel_vids_path):
        with open(channel_vids_path, 'r', encoding='utf-8') as f:
            cdata = json.load(f)
        for e in cdata.get('entries', []):
            yid = e.get('id')
            if yid:
                if yid not in all_videos:
                    all_videos[yid] = {
                        'youtube_id': yid,
                        'title': e.get('title', ''),
                        'duration': e.get('duration'),
                        'url': f"https://www.youtube.com/watch?v={yid}",
                        'playlists': [],
                        'categories': {'Channel Uploads'}
                    }
                else:
                    if not all_videos[yid].get('duration') and e.get('duration'):
                        all_videos[yid]['duration'] = e.get('duration')

    # Also incorporate previous mapped videos if any
    prev_mapping_path = os.path.join(BASE_DIR, "GABC-video-notes-alignement", "graduale_project_video_gabc_mapping.json")
    if os.path.exists(prev_mapping_path):
        with open(prev_mapping_path, 'r', encoding='utf-8') as f:
            pdata = json.load(f)
        for v in pdata.get('videos', []):
            yid = v.get('youtube_id')
            if yid and yid not in all_videos:
                all_videos[yid] = {
                    'youtube_id': yid,
                    'title': v.get('title', ''),
                    'duration': None,
                    'url': f"https://www.youtube.com/watch?v={yid}",
                    'playlists': [{'playlist_id': v.get('playlist_name', ''), 'playlist_name': v.get('playlist_name', ''), 'position': None}],
                    'categories': {'Special Series'}
                }

    # Convert sets to sorted lists for json serialization
    for yid, v in all_videos.items():
        v['categories'] = sorted(list(v['categories']))

    # Write summary playlists file
    categories_summary = {}
    for pid, pdata in cached_data.items():
        cat = pdata.get('category', 'Varia')
        categories_summary[cat] = categories_summary.get(cat, 0) + 1

    final_payload = {
        'source_page': 'https://gregoriana.sk/graduale/graduale-project-youtube-playlists/',
        'channel': 'GradualeProject (Marek Klein)',
        'channel_url': 'https://www.youtube.com/@GradualeProject',
        'stats': {
            'total_unique_playlists': len(cached_data),
            'total_unique_videos': len(all_videos),
            'categories_distribution': categories_summary
        },
        'playlists': [
            {
                'playlist_id': pid,
                'name': pdata.get('title'),
                'category': pdata.get('category'),
                'source': pdata.get('source'),
                'url': pdata.get('url'),
                'video_count': pdata.get('video_count', 0),
                'videos': pdata.get('videos', [])
            }
            for pid, pdata in sorted(cached_data.items(), key=lambda x: (x[1].get('category', ''), x[1].get('title', '')))
        ]
    }

    with open(OUTPUT_PLAYLISTS, 'w', encoding='utf-8') as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    # Also output all_videos list for step 2
    videos_catalog_path = os.path.join(CORPUS_SOURCES, "marekklein_all_unique_videos.json")
    with open(videos_catalog_path, 'w', encoding='utf-8') as f:
        json.dump(list(all_videos.values()), f, ensure_ascii=False, indent=2)

    print("=================================================================")
    print("  SYNTHÈSE DE LA RÉCOLTE")
    print("=================================================================")
    print(f"Total playlists : {len(cached_data)}")
    print(f"Total vidéos uniques : {len(all_videos)}")
    print("\nRépartition par catégorie liturgique :")
    for cat, count in sorted(categories_summary.items(), key=lambda x: -x[1]):
        print(f"  - {cat:35s}: {count:3d} playlists")
    print(f"\nFichier playlists : {OUTPUT_PLAYLISTS}")
    print(f"Fichier catalogue : {videos_catalog_path}")

if __name__ == '__main__':
    main()
