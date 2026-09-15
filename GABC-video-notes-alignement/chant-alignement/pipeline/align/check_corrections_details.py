import json

with open("pipeline/align/lab_data.js", "r", encoding="utf-8") as f:
    text = f.read().replace("const PIECES = ", "").rstrip(";\n")
    pieces = json.loads(text)

for p in pieces:
    if not p["timestamps"]: continue
    print(f"\nPiece {p['id']} ({p['incipit']}):")
    print(f"  Corrections count: {len(p['applied_corrections'])}")
    for c in p["applied_corrections"]:
        print(f"    [{c['type']}] Note {c['target_note_index']}: {c['word']} -> {c['description']}")
