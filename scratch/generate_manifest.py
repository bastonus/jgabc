"""Génération complète et robuste du manifest do_manifest.js incluant Liturgie et Sacra Biblia."""

import json
from pathlib import Path

manifest_map = {}
folders = ["do_data", "vulgate", "aelf", "douay-rheims", "matos-soares", "psalms"]

for folder_name in folders:
    folder = Path(folder_name)
    if folder.exists():
        count = 0
        for p in folder.glob("**/*.txt"):
            norm_path = p.as_posix().lower()
            manifest_map[norm_path] = True
            count += 1
        print(f"Indexé {count} fichiers depuis {folder_name}")

print(f"Total fichiers indexés dans le manifest : {len(manifest_map)}")

with open("do_manifest.json", "w", encoding="utf-8") as f:
    json.dump(list(manifest_map.keys()), f)

with open("do_manifest.js", "w", encoding="utf-8") as f:
    f.write("window.DO_MANIFEST = " + json.dumps(manifest_map) + ";\n")

print("do_manifest.js régénéré avec succès avec l'ensemble des textes bibliques et liturgiques !")
