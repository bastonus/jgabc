import sqlite3
import json
import os

db_path = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\opencode.db'

if not os.path.exists(db_path):
    print(f"ERROR: DB not found at {db_path}")
    # Try drafts.sqlite just in case
    alt = r'C:\Users\Azandikka\AppData\Roaming\ai.opencode.desktop\drafts.sqlite'
    if os.path.exists(alt):
        print(f"Found alternative: {alt}")
        db_path = alt
    else:
        exit(1)

print(f"Inspecting: {db_path}")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# List tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row[0] for row in cursor.fetchall()]
print(f"\nTables found: {tables}")

# Dump schema for each table
for table in tables:
    print(f"\n--- Schema for '{table}' ---")
    cursor.execute(f"PRAGMA table_info({table});")
    cols = cursor.fetchall()
    for col in cols:
        print(f"  {col}")
    
    # Count rows
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table};")
        count = cursor.fetchone()[0]
        print(f"  Row count: {count}")
    except Exception as e:
        print(f"  Error counting: {e}")

conn.close()
