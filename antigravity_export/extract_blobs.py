import sqlite3
import os

db_path = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\drafts.sqlite'
out_dir = r'D:\Documents\jgabc\antigravity_export\blobs'
os.makedirs(out_dir, exist_ok=True)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT id, data FROM blob;")
for row in cursor.fetchall():
    blob_id = row[0]
    data = row[1]
    
    # Determine extension from magic bytes
    if data[:3] == b'\xff\xd8\xff':
        ext = '.jpg'
    elif data[:8] == b'\x89PNG\r\n\x1a\n':
        ext = '.png'
    elif data[:4] == b'GIF8':
        ext = '.gif'
    elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        ext = '.webp'
    else:
        ext = '.bin'
    
    filename = f"{blob_id[:16]}{ext}"
    filepath = os.path.join(out_dir, filename)
    
    with open(filepath, 'wb') as f:
        f.write(data)
    
    print(f"Extracted: {filename} ({len(data)} bytes)")

conn.close()
print(f"\nAll blobs extracted to: {out_dir}")
