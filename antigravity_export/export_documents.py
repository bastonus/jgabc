import sqlite3
import json
import os

db_path = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\drafts.sqlite'
out_dir = r'D:\Documents\jgabc\antigravity_export'
out_file = os.path.join(out_dir, 'documents.json')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT key, value FROM document;")
rows = cursor.fetchall()

data = {}
for key, value in rows:
    # Try to parse value as JSON for better readability in output
    try:
        parsed_value = json.loads(value)
        data[key] = parsed_value
    except (json.JSONDecodeError, TypeError):
        data[key] = value

with open(out_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Exported {len(rows)} documents to: {out_file}")
conn.close()
