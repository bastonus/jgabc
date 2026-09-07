import json

def check_piece(path, name, keywords, time_range):
    print(f"=== {name} ===")
    try:
        with open(path, encoding='utf-8') as f:
            stamps = json.load(f)
    except FileNotFoundError:
        print(f"  [ERROR] File not found: {path}")
        return

    for i, n in enumerate(stamps):
        w = n.get('word', '')
        start = n['start']
        end = n['end']
        pitch = n.get('pitch', '?')
        bar = n.get('bar_after')
        
        # Check keywords
        is_keyword = any(k in w.lower() for k in keywords)
        # Check time range context
        in_range = start is not None and time_range[0] < start < time_range[1]
        
        if is_keyword or in_range:
            prefix = "  (ctx) " if (in_range and not is_keyword) else ""
            print(f"{prefix}Note {i:3d} ({w:12s} p={str(pitch):>2}): [{start:6.2f} - {end:6.2f}] bar={bar}")
    print()

# Piece 23: cælo -> múlier transition around 16.76s
check_piece(
    'pipeline/final_timestamps/23_stamps.json',
    'Piece 23 (Signum magnum)',
    ['cælo', 'múlier', 'mulier', 'celo'],
    (15.5, 18.5)
)

# Piece 235: inventus -> similis around 62-65s
check_piece(
    'pipeline/final_timestamps/235_stamps.json',
    'Piece 235 (Ecce sacerdos)',
    ['inventus', 'similis'],
    (60.0, 67.0)
)
