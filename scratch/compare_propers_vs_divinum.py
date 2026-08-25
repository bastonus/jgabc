"""Analyse comparative exhaustive entre propers.html (propersdata.js) et Divinum Officium (do_data)."""

import sys
import re
import json
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Mapping des mois pour convertir les clés Sancti (ex: Aug25 -> 08-25)
MONTH_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
}

# Mapping des clés Tempora de propersdata.js vers les codes Divinum Officium
TEMPORA_MAP = {
    "Adv1": "Adv1-0", "Adv2": "Adv2-0", "Adv3": "Adv3-0", "Adv3w": "Adv3-3", "Adv3f": "Adv3-5", "Adv3s": "Adv3-6", "Adv4": "Adv4-0",
    "Dec24": "12-24", "Dec25_1": "12-25", "Dec25_2": "12-25", "Dec25_3": "12-25", "Nat1": "Nat1-0", "Jan1": "01-01", "Nat2": "01-02",
    "Jan5a": "01-05", "Epi": "01-06", "Epi1": "Epi1-0", "Epi1s": "Epi1-1", "Epi2": "Epi2-0", "Epi3": "Epi3-0", "Epi4": "Epi4-0",
    "Epi5": "Epi5-0", "Epi6": "Epi6-0", "7a": "Quadp1-0", "6a": "Quadp2-0", "5a": "Quadp3-0", "5aw": "Quadp3-3", "5ah": "Quadp3-4",
    "5af": "Quadp3-5", "5as": "Quadp3-6", "Quad1": "Quad1-0", "Quad1m": "Quad1-1", "Quad1t": "Quad1-2", "Quad1w": "Quad1-3",
    "Quad1h": "Quad1-4", "Quad1f": "Quad1-5", "Quad1s": "Quad1-6", "Quad2": "Quad2-0", "Quad2m": "Quad2-1", "Quad2t": "Quad2-2",
    "Quad2w": "Quad2-3", "Quad2h": "Quad2-4", "Quad2f": "Quad2-5", "Quad2s": "Quad2-6", "Quad3": "Quad3-0", "Quad3m": "Quad3-1",
    "Quad3t": "Quad3-2", "Quad3w": "Quad3-3", "Quad3h": "Quad3-4", "Quad3f": "Quad3-5", "Quad3s": "Quad3-6", "Quad4": "Quad4-0",
    "Quad4m": "Quad4-1", "Quad4t": "Quad4-2", "Quad4w": "Quad4-3", "Quad4h": "Quad4-4", "Quad4f": "Quad4-5", "Quad4s": "Quad4-6",
    "Quad5": "Quad5-0", "Quad5m": "Quad5-1", "Quad5t": "Quad5-2", "Quad5w": "Quad5-3", "Quad5h": "Quad5-4", "Quad5f": "Quad5-5",
    "Quad5s": "Quad5-6", "Quad6": "Quad6-0", "Quad6m": "Quad6-1", "Quad6t": "Quad6-2", "Quad6w": "Quad6-3", "Quad6h": "Quad6-4",
    "Quad6f": "Quad6-5", "Quad6s": "Quad6-6", "Pasc0": "Pasc0-0", "Pasc0m": "Pasc0-1", "Pasc0t": "Pasc0-2", "Pasc0w": "Pasc0-3",
    "Pasc0h": "Pasc0-4", "Pasc0f": "Pasc0-5", "Pasc0s": "Pasc0-6", "Pasc1": "Pasc1-0", "Pasc2": "Pasc2-0", "Pasc3": "Pasc3-0",
    "Pasc4": "Pasc4-0", "Pasc5": "Pasc5-0", "Pasc5m": "Pasc5-1", "Pasc5t": "Pasc5-2", "Pasc5w": "Pasc5-3", "Asc": "Pasc5-4",
    "Pasc6": "Pasc6-0", "Pent": "Pasc7-0", "Pentm": "Pasc7-1", "Pentt": "Pasc7-2", "Pentw": "Pasc7-3", "Penth": "Pasc7-4",
    "Pentf": "Pasc7-5", "Pents": "Pasc7-6", "Pent01": "Pent01-0", "Trin": "Pent01-0", "Corp": "Pent01-4", "Pent02": "Pent02-0",
    "Cor": "Pent02-5", "Pent03": "Pent03-0", "Pent04": "Pent04-0", "Pent05": "Pent05-0", "Pent06": "Pent06-0", "Pent07": "Pent07-0",
    "Pent08": "Pent08-0", "Pent09": "Pent09-0", "Pent10": "Pent10-0", "Pent11": "Pent11-0", "Pent12": "Pent12-0", "Pent13": "Pent13-0",
    "Pent14": "Pent14-0", "Pent15": "Pent15-0", "Pent16": "Pent16-0", "Pent17": "Pent17-0", "Pent18": "Pent18-0", "Pent19": "Pent19-0",
    "Pent20": "Pent20-0", "Pent21": "Pent21-0", "Pent22": "Pent22-0", "Pent23": "Pent23-0", "Pent24": "Pent24-0"
}

def parse_propersdata():
    with open("propersdata.js", "r", encoding="utf-8", errors="replace") as f:
        js = f.read()

    sunday_matches = re.findall(r'sundayKeys\s*=\s*\[(.*?)\];', js, re.DOTALL)
    saint_matches = re.findall(r'saintKeys\s*=\s*\[(.*?)\];', js, re.DOTALL)

    sundays = re.findall(r'key:\s*"([^"]+)",\s*title:\s*"([^"]+)"', sunday_matches[0]) if sunday_matches else []
    saints = re.findall(r'key:\s*"([^"]+)",\s*title:\s*"([^"]+)"', saint_matches[0]) if saint_matches else []

    return sundays, saints

def find_do_file(do_code: str, is_tempora: bool) -> tuple[Path | None, Path | None]:
    """Trouve les fichiers Latin et Français dans do_data."""
    folder = "Tempora" if is_tempora else "Sancti"
    
    # Si le code est une date MM-DD
    if re.match(r'^\d{2}-\d{2}$', do_code):
        folder = "Sancti"
    elif "-" in do_code and not do_code.startswith("12-") and not do_code.startswith("01-"):
        folder = "Tempora"

    lat_candidates = [
        Path(f"do_data/missa/Latin/{folder}/{do_code}.txt"),
        Path(f"do_data/missa/Latin/{folder}/{do_code}r.txt"),
        Path(f"do_data/horas/Latin/{folder}/{do_code}.txt"),
    ]
    fr_candidates = [
        Path(f"do_data/missa/Francais/{folder}/{do_code}.txt"),
        Path(f"do_data/missa/Francais/{folder}/{do_code}r.txt"),
        Path(f"do_data/horas/Francais/{folder}/{do_code}.txt"),
    ]

    lat_path = next((p for p in lat_candidates if p.exists()), None)
    fr_path = next((p for p in fr_candidates if p.exists()), None)

    return lat_path, fr_path

def convert_key(key: str) -> tuple[str, bool]:
    """Convertit une clé de propers.html en code Divinum Officium."""
    if key in TEMPORA_MAP:
        return TEMPORA_MAP[key], True

    m = re.match(r'^([A-Z][a-z]{2})(\d{1,2})(.*)$', key)
    if m:
        month_str, day_str, suffix = m.groups()
        if month_str in MONTH_MAP:
            return f"{MONTH_MAP[month_str]}-{int(day_str):02d}", False

    return key, False

def run_comparison():
    sundays, saints = parse_propersdata()

    print("================================================================================")
    print("AUDIT DE CORRESPONDANCE DU CALENDRIER & TRADUCTIONS (propers.html vs Divinum)")
    print("================================================================================")

    # 1. Analyse des Dimanches & Fêtes Mobiles (Tempora)
    print(f"\n1. AUDIT DU PROPRE DU TEMPS (Dimanches & Fêtes Mobiles) : {len(sundays)} célébrations")
    temp_matches = 0
    temp_fr_matches = 0
    temp_missing = []

    for key, title in sundays:
        do_code, is_temp = convert_key(key)
        lat_p, fr_p = find_do_file(do_code, is_temp)
        if lat_p:
            temp_matches += 1
            if fr_p:
                temp_fr_matches += 1
        else:
            temp_missing.append((key, title, do_code))

    print(f"   • Fêtes trouvées dans Divinum Officium : {temp_matches} / {len(sundays)} ({temp_matches/len(sundays)*100:.1f}%)")
    print(f"   • Traductions françaises disponibles  : {temp_fr_matches} / {len(sundays)} ({temp_fr_matches/len(sundays)*100:.1f}%)")
    if temp_missing:
        print(f"   • Fêtes mobiles sans correspondance directe : {temp_missing}")

    # 2. Analyse du Propre des Saints (Sancti)
    print(f"\n2. AUDIT DU PROPRE DES SAINTS (Sanctoral Fixe) : {len(saints)} fêtes")
    sancti_matches = 0
    sancti_fr_matches = 0
    sancti_missing = []

    for key, title in saints:
        do_code, is_temp = convert_key(key)
        lat_p, fr_p = find_do_file(do_code, is_temp)
        if lat_p:
            sancti_matches += 1
            if fr_p:
                sancti_fr_matches += 1
        else:
            sancti_missing.append((key, title, do_code))

    print(f"   • Fêtes trouvées dans Divinum Officium : {sancti_matches} / {len(saints)} ({sancti_matches/len(saints)*100:.1f}%)")
    print(f"   • Traductions françaises disponibles  : {sancti_fr_matches} / {len(saints)} ({sancti_fr_matches/len(saints)*100:.1f}%)")
    if sancti_missing:
        print(f"   • Fêtes de saints non trouvées directement ({len(sancti_missing)}) :")
        for k, t, c in sancti_missing[:8]:
            print(f"     - Clé '{k}' ({t}) -> Code '{c}'")

    # 3. Vérification d'échantillons concrets (Incipits & Traductions)
    print("\n3. ÉCHANTILLONS CONCRETS DE CORRESPONDANCE TEXTUELLE & TRADUCTION :")
    test_cases = [
        ("Adv1", "Ier Dimanche de l'Avent", "Tempora/Adv1-0.txt"),
        ("Aug25", "Saint Louis Roi", "Sancti/08-25.txt"),
        ("Pasc0", "Dimanche de Pâques", "Tempora/Pasc0-0.txt"),
        ("Nov1", "Toussaint", "Sancti/11-01.txt"),
        ("Dec25_1", "Noël (Messe de Minuit)", "Sancti/12-25.txt")
    ]

    for key, label, fpath in test_cases:
        lat_p = Path(f"do_data/missa/Latin/{fpath}")
        fr_p = Path(f"do_data/missa/Francais/{fpath}")
        print(f"\n   [Fête : {label} (Clé: {key})]")
        print(f"   • Fichier Latin    : {'[OK] ' + str(lat_p) if lat_p.exists() else '[MANQUANT]'}")
        print(f"   • Fichier Français : {'[OK] ' + str(fr_p) if fr_p.exists() else '[MANQUANT]'}")

        if fr_p.exists():
            with open(fr_p, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            # Extraire l'introït ou l'oraison
            lines = content.splitlines()[:8]
            sample = " ".join([l.strip() for l in lines if l.strip() and not l.startswith("[") and not l.startswith("!")])[:120]
            print(f"   • Extrait Traduction : \"{sample}...\"")

if __name__ == "__main__":
    run_comparison()
