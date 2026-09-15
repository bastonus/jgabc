import sqlite3
import json
import os

db_path = r'C:\Users\Azandikka\.local\share\opencode\opencode.db'
ids = (
    'b748fab1-9fdd-454c-8c3f-bc69ed64e953',
    '2500cfa1-b73f-4ebb-9148-09ca3bc7f103',
    'a052531b-0f1a-42df-a385-e29c845d8078'
)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r['name'] for r in cur.fetchall()]

print(f"Searching for IDs in {db_path}...")
print(f"Target IDs: {ids}\n")

found_any = False
for table in tables:
    # Get columns for this table
    try:
        cur.execute(f"PRAGMA table_info({table})")
        cols = [r['name'] for r in cur.fetchall()]
    except Exception:
        continue
    
    # Check if any column looks like an ID column
    id_cols = [c for c in cols if 'id' in c.lower() or c.lower() == 'uuid']
    if not id_cols:
        # Also check first column as it's often the PK
        id_cols = [cols[0]] if cols else []
    
    for col in id_cols:
        placeholders = ','.join('?' * len(ids))
        try:
            query = f"SELECT * FROM {table} WHERE {col} IN ({placeholders}) LIMIT 5"
            cur.execute(query, ids)
            rows = [dict(r) for r in cur.fetchall()]
            if rows:
                found_any = True
                print(f"=== FOUND in {table}.{col} ===")
                print(json.dumps(rows, indent=2, default=str))
                print()
        except Exception as e:
            pass

if not found_any:
    print("No matches found in any ID columns.")
    print("\nListing sample data from key tables to understand structure:")
    for t in ['session', 'session_message', 'message', 'part']:
        if t in tables:
            try:
                cur.execute(f"SELECT * FROM {t} LIMIT 2")
                rows = [dict(r) for r in cur.fetchall()]
                print(f"\n--- {t} (sample) ---")
                print(json.dumps(rows, indent=2, default=str))
            except Exception as e:
                print(f"Error reading {t}: {e}")

conn.close()
