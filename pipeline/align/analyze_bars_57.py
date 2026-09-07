import json
from collections import Counter

path = r'D:\Documents\jgabc\pipeline\final_timestamps\57_stamps.json'
with open(path, 'r', encoding='utf-8') as f:
    stamps = json.load(f)

print(f"Total notes: {len(stamps)}")

bar_counts = Counter()
none_count = 0
for s in stamps:
    b = s.get('bar_after')
    if b is None:
        none_count += 1
    else:
        bar_counts[b] += 1

print(f"Notes with no bar_after: {none_count}")
print("Bar distribution:")
for bar, count in sorted(bar_counts.items(), key=lambda x: -x[1]):
    print(f"  '{bar}': {count}")

# Check specifically for major vs minor markers if convention holds
# Usually ';' might be major, ',' minor, or similar
print("\nFirst 10 assigned bars:")
count = 0
for i, s in enumerate(stamps):
    if s.get('bar_after') is not None:
        print(f"  Note {i}: word='{s.get('word','?')}' bar='{s['bar_after']}'")
        count += 1
        if count >= 10:
            break
