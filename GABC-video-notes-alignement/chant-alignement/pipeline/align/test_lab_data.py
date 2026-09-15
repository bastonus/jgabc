import json

with open("pipeline/align/lab_data.js", "r", encoding="utf-8") as f:
    text = f.read().replace("const PIECES = ", "").rstrip(";\n ")
    pieces = json.loads(text)

print(f"Total pieces in lab_data.js: {len(pieces)}")
for p in pieces:
    raw_cnt = len(p.get("raw_timestamps", []))
    corr_cnt = len(p.get("timestamps", []))
    app_cnt = len(p.get("applied_corrections", []))
    yt = p.get("youtube_id", "")
    print(f"Piece #{p['id']:2s} ({p['incipit']:28s}): yt={yt or 'NONE':12s} | raw={raw_cnt:3d} | corr={corr_cnt:3d} | corrections_applied={app_cnt:2d}")
