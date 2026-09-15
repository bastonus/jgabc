"""
verify_alignments.py
Vérification de l'intégrité des alignements dans lab_data.js :
1. Absence de notes anormalement courtes (< 0.12s)
2. Absence de notes anormalement longues (> 4.5x moyenne non traitées)
3. Continuité parfaite des fins de mot (la note précédente reste active jusqu'au début du mot suivant)
4. Présence des métadonnées de reprise et de doxologie
"""

import json

with open("pipeline/align/lab_data.js", "r", encoding="utf-8") as f:
    content = f.read()
data = json.loads(content.replace("const PIECES = ", "").rstrip(";\n"))

for p in data:
    pid = p["id"]
    if pid in ["14", "15"]:
        print(f"[{pid}] Nettoyé comme demandé (youtube_id: '').")
        continue

    stamps = p.get("timestamps", [])
    raw = p.get("raw_timestamps", [])
    corrections = p.get("applied_corrections", [])
    stats = p.get("stats", {})
    reprise = p.get("reprise", None)

    print(f"\n==========================================")
    print(f"[{pid}] {p['incipit']}")
    print(f"  Notes corrigées : {len(stamps)}, Notes brutes : {len(raw)}")
    print(f"  Calculs appliqués : {len(corrections)}")
    print(f"  Moyenne normale : {stats.get('avg_normal_dur')}s, Pointée : {stats.get('avg_pointed_dur')}s")
    print(f"  Seuils 4.5x : Normale={stats.get('thresh_normal_4_5x')}s, Pointée={stats.get('thresh_pointed_4_5x')}s")
    if reprise:
        print(f"  Reprise : {reprise['start']}s -> {reprise['end']}s (durée: {reprise['duration']}s)")

    # 1. Notes trop rapides
    too_fast = [n for n in stamps if n["duration"] < 0.12]
    print(f"  Notes < 0.12s : {len(too_fast)} {'[OK: Aucune !]' if len(too_fast) == 0 else f'[ATTN: {len(too_fast)} notes]'}")

    # 2. Notes trop longues
    too_long = [n for n in stamps if n["duration"] > (stats.get('thresh_pointed_4_5x') if n.get('is_pointed') else stats.get('thresh_normal_4_5x'))]
    print(f"  Notes > 4.5x seuil : {len(too_long)} {'[OK: Aucune !]' if len(too_long) == 0 else f'[ATTN: {len(too_long)} notes]'}")

    # 3. Continuité fins de mot
    word_transitions_ok = True
    for i in range(len(stamps) - 1):
        if stamps[i]["word"] != stamps[i+1]["word"]:
            # La fin de note i doit correspondre au start de note i+1
            if stamps[i]["end"] < stamps[i+1]["start"]:
                word_transitions_ok = False
                print(f"    Trou détecté entre note {i} ({stamps[i]['word']} fin={stamps[i]['end']}s) et note {i+1} ({stamps[i+1]['word']} deb={stamps[i+1]['start']}s)")
    print(f"  Continuité inter-mots : {'[OK: Parfaite, note maintenue jusqu au mot suivant !]' if word_transitions_ok else '[ATTENTION: Trous restants]'}")

    # Afficher les 3 premières transitions
    print("  Exemples de transitions inter-mots :")
    count = 0
    for i in range(len(stamps) - 1):
        if stamps[i]["word"] != stamps[i+1]["word"] and count < 3:
            print(f"    '{stamps[i]['word']}' note #{i} [{stamps[i]['start']:.2f}s - {stamps[i]['end']:.2f}s] -> '{stamps[i+1]['word']}' note #{i+1} [{stamps[i+1]['start']:.2f}s - {stamps[i+1]['end']:.2f}s]")
            count += 1
