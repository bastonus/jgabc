import sqlite3
import json

db_path = r'C:\Users\Azandikka\.local\share\opencode\opencode.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. Full schema
print("=== FULL SCHEMA ===")
cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")
for r in cur.fetchall():
    print(r[0] + ";\n")

# 2. Sample data from key tables with full JSON expansion
print("\n=== SAMPLE SESSION (full) ===")
cur.execute("SELECT * FROM session LIMIT 1")
row = cur.fetchone()
if row:
    d = dict(row)
    print(json.dumps(d, indent=2, default=str))

print("\n=== SAMPLE MESSAGE (full) ===")
cur.execute("SELECT * FROM message LIMIT 3")
for row in cur.fetchall():
    d = dict(row)
    # Parse data JSON if present
    if 'data' in d and d['data']:
        try:
            d['data_parsed'] = json.loads(d['data'])
        except:
            pass
    print(json.dumps(d, indent=2, default=str))
    print("---")

print("\n=== SAMPLE PART (full, 5 rows) ===")
cur.execute("SELECT * FROM part LIMIT 5")
for row in cur.fetchall():
    d = dict(row)
    if 'data' in d and d['data']:
        try:
            d['data_parsed'] = json.loads(d['data'])
        except:
            pass
    print(json.dumps(d, indent=2, default=str))
    print("---")

# 3. Check session_message table
print("\n=== SESSION_MESSAGE count ===")
cur.execute("SELECT COUNT(*) FROM session_message")
print(cur.fetchone()[0])

print("\n=== SESSION_INPUT sample ===")
cur.execute("SELECT * FROM session_input LIMIT 2")
for row in cur.fetchall():
    d = dict(row)
    print(json.dumps(d, indent=2, default=str))
    print("---")

conn.close()
