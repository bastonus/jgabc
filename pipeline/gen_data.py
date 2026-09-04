import json

with open(r"d:/Documents/jgabc/align/lab_5_pieces.json", encoding="utf-8") as f:
    pieces = json.load(f)

pieces_data = [{
    "id": p["id"],
    "incipit": p["incipit"],
    "part": p["part"],
    "ytId": p["youtube_id"],
    "source": p["source"],
    "gabc_path": p["gabc_path"],
    "words": p["words"],
    "total_notes": p["total_notes"],
} for p in pieces]

pieces_js = json.dumps(pieces_data, ensure_ascii=False)

# Save just the JS data file
with open(r"d:/Documents/jgabc/align/lab_data.js", "w", encoding="utf-8") as f:
    f.write("const PIECES = ")
    f.write(pieces_js)
    f.write(";\n")
print("lab_data.js written, size:", len(pieces_js), "chars")
