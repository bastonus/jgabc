import sqlite3
import json

db_path = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\drafts.sqlite'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=== INSPECTING BLOBS ===")
cursor.execute("SELECT id, data FROM blob;")
for row in cursor.fetchall():
    blob_id = row[0]
    data = row[1]
    print(f"\n--- BLOB: {blob_id[:16]}... ({len(data)} bytes) ---")
    
    # Try to decode as utf-8
    try:
        text = data.decode('utf-8')
        # Check if it looks like JSON
        if text.strip().startswith('{') or text.strip().startswith('['):
            try:
                parsed = json.loads(text)
                print(f"TYPE: JSON")
                # Print keys if dict
                if isinstance(parsed, dict):
                    print(f"KEYS: {list(parsed.keys())[:10]}")
                else:
                    print(f"TYPE: List/Array (len={len(parsed)})")
            except json.JSONDecodeError:
                print(f"TYPE: Text (starts with JSON-like char but invalid)")
                print(f"PREVIEW: {text[:300]}")
        else:
            print(f"TYPE: Plain Text")
            print(f"PREVIEW: {text[:300]}")
    except UnicodeDecodeError:
        print(f"TYPE: Binary")
        # Print hex preview
        print(f"HEX PREVIEW: {data[:64].hex()}")

conn.close()
