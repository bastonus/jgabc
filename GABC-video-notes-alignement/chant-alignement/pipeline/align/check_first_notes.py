import json

with open('pipeline/align/lab_data.js', 'r', encoding='utf-8') as f:
    c = f.read()
data = json.loads(c.replace('const PIECES = ', '').rstrip(';\n'))

p11 = next(p for p in data if p['id'] == '11')
stamps = p11['timestamps']
for i in range(25):
    n = stamps[i]
    print(f"{i:2d} {n['word']:12s} {n['token']:6s} [{n['start']:6.2f}s - {n['end']:6.2f}s] dur={n['duration']:5.2f}s")
