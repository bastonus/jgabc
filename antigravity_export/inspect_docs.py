import sqlite3
import json

db_path = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\drafts.sqlite'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("=== DOCUMENT TABLE (all keys + value preview) ===")
cursor.execute("SELECT key, value FROM document;")
for key, value in cursor.fetchall():
    preview = value[:200] if len(value) > 200 else value
    print(f"\nKEY: {key}")
    print(f"VALUE ({len(value)} chars): {preview}...")

print("\n\n=== BLOB TABLE (ids + sizes) ===")
cursor.execute("SELECT id, length(data) FROM blob;")
for row in cursor.fetchall():
    print(f"ID: {row[0]}, Size: {row[1]} bytes")

conn.close()
