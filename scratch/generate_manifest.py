"""Génération propre et robuste du manifest do_manifest.js avec des slashs '/' standards."""

import json
from pathlib import Path

do_data = Path("do_data")
manifest_map = {}

for p in do_data.glob("**/*.txt"):
    # Utiliser as_posix() pour garantir des barres obliques '/' partout
    norm_path = p.as_posix().lower()
    manifest_map[norm_path] = True

print(f"Total fichiers indexés dans le manifest : {len(manifest_map)}")

# Écriture propre en JSON et JS
with open("do_manifest.json", "w", encoding="utf-8") as f:
    json.dump(list(manifest_map.keys()), f)

with open("do_manifest.js", "w", encoding="utf-8") as f:
    f.write("window.DO_MANIFEST = " + json.dumps(manifest_map) + ";\n")

print("do_manifest.js régénéré avec succès avec des barres '/' !")
