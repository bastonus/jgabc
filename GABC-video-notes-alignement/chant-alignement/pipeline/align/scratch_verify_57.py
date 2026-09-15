import json
import sys

path = r'D:\Documents\jgabc\pipeline\final_timestamps\57_stamps.json'
try:
    with open(path, 'r', encoding='utf-8') as f:
        stamps = json.load(f)
except FileNotFoundError:
    # Fallback to align subfolder if root doesn't exist or is stale
    path = r'D:\Documents\jgabc\pipeline\align\final_timestamps\57_stamps.json'
    with open(path, 'r', encoding='utf-8') as f:
        stamps = json.load(f)

print(f"Loaded {len(stamps)} notes from {path}")
print("--- Notes 125 to 146 ---")
for i in range(125, min(146, len(stamps))):
    s = stamps[i]
    word = s.get("word", "")
    pitch = s.get("pitch", 0)
    start = s.get("start", 0.0)
    end = s.get("end", 0.0)
    dur = s.get("duration", 0.0)
    bar = s.get("bar_after", "?")
    print(f"Note {i:3d} ({word:10s} p={pitch:2d}): [{start:6.2f} - {end:6.2f}] dur={dur:5.2f} bar={bar}")
