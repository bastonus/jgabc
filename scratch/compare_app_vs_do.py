"""Script d'analyse comparative de complétude entre l'application propers.html (jgabc) et Divinum Officium."""

import re
import json
from pathlib import Path

def analyze_propersdata():
    propers_js_path = Path("propersdata.js")
    with open(propers_js_path, "r", encoding="utf-8", errors="replace") as f:
        js_content = f.read()

    # 1. Extraction des listes du sélecteur
    sunday_matches = re.findall(r'sundayKeys\s*=\s*\[(.*?)\];', js_content, re.DOTALL)
    saint_matches = re.findall(r'saintKeys\s*=\s*\[(.*?)\];', js_content, re.DOTALL)

    sunday_keys = re.findall(r'key:\s*"([^"]+)"', sunday_matches[0]) if sunday_matches else []
    saint_keys = re.findall(r'key:\s*"([^"]+)"', saint_matches[0]) if saint_matches else []

    # 2. Extraction des définitions de messes (objets JSON-like dans propersdata.js)
    # Chercher les définitions d'objets comme "Aug25": { ... }
    defined_masses = re.findall(r'^\s*"([A-Za-z0-9_\-]+)"\s*:\s*\{', js_content, re.MULTILINE)

    # 3. Extraction des communes
    commune_keys = [k for k in defined_masses if k.startswith("mass_") or k.startswith("common_") or k.startswith("C")]

    # 4. Extraction de propriadata-new.json
    propria_new_path = Path("propriadata-new.json")
    propria_new_keys = []
    if propria_new_path.exists():
        try:
            with open(propria_new_path, "r", encoding="utf-8") as f:
                propria_new_data = json.load(f)
                propria_new_keys = list(propria_new_data.keys())
        except Exception as e:
            print("Erreur propria-new:", e)

    return {
        "sunday_keys": sunday_keys,
        "saint_keys": saint_keys,
        "defined_masses": defined_masses,
        "commune_keys": commune_keys,
        "propria_new_keys": propria_new_keys,
    }

def analyze_divinum_officium():
    do_missa_lat = Path("do_source/web/www/missa/Latin")
    sancti_files = [f.stem for f in (do_missa_lat / "Sancti").glob("*.txt")] if (do_missa_lat / "Sancti").exists() else []
    tempora_files = [f.stem for f in (do_missa_lat / "Tempora").glob("*.txt")] if (do_missa_lat / "Tempora").exists() else []
    commune_files = [f.stem for f in (do_missa_lat / "Commune").glob("*.txt")] if (do_missa_lat / "Commune").exists() else []

    # Filtrer les jours uniques (sans les suffixes de rubriques r/o/m/etc.)
    sancti_unique_days = sorted(list(set([f[:5] for f in sancti_files if len(f) >= 5 and f[:2].isdigit() and f[2] == '-'])))
    tempora_base_codes = sorted(list(set([re.sub(r'[a-z]+$', '', f, flags=re.IGNORECASE) for f in tempora_files])))

    return {
        "sancti_total_files": len(sancti_files),
        "sancti_unique_days": len(sancti_unique_days),
        "sancti_days_list": sancti_unique_days,
        "tempora_total_files": len(tempora_files),
        "tempora_unique_codes": len(tempora_base_codes),
        "tempora_list": tempora_base_codes,
        "commune_total_files": len(commune_files),
        "commune_list": commune_files
    }

# Mapping mois en 3 lettres -> MM
MONTH_MAP = {
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "May": "05", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
}

def convert_app_key_to_do(key: str) -> str:
    m = re.match(r'^([A-Z][a-z]{2})(\d{1,2})(.*)$', key)
    if m:
        month_str, day_str, suffix = m.groups()
        if month_str in MONTH_MAP:
            return f"{MONTH_MAP[month_str]}-{int(day_str):02d}"
    return key

if __name__ == "__main__":
    app_data = analyze_propersdata()
    do_data = analyze_divinum_officium()

    print("==================================================")
    print("ANALYSE COMPARATIVE : VOTRE APPLICATION vs DIVINUM")
    print("==================================================")
    print(f"\n1. VÔTRE APPLICATION (jgabc / propers.html) :")
    print(f"   • Clés Tempora (Dimanches & Temps) dans le sélecteur : {len(app_data['sunday_keys'])}")
    print(f"   • Clés Sancti (Saints) dans le sélecteur : {len(app_data['saint_keys'])}")
    print(f"   • Total messes définies dans propersdata.js : {len(app_data['defined_masses'])}")
    print(f"   • Total entrées dans propriadata-new.json : {len(app_data['propria_new_keys'])}")
    print(f"   • Messes du Commun : {len(app_data['commune_keys'])}")

    print(f"\n2. DIVINUM OFFICIUM (do_source) :")
    print(f"   • Jours de Saints distincts (Sancti MM-DD) : {do_data['sancti_unique_days']} jours (Total {do_data['sancti_total_files']} fichiers avec variantes)")
    print(f"   • Jours du Temps liturgique (Tempora) : {do_data['tempora_unique_codes']} offices (Total {do_data['tempora_total_files']} fichiers avec feries/variantes)")
    print(f"   • Messes du Commun (Commune) : {do_data['commune_total_files']} fichiers")

    # Comparaison de couverture des Saints
    app_sancti_do_format = set()
    for k in app_data["saint_keys"] + app_data["defined_masses"]:
        converted = convert_app_key_to_do(k)
        if re.match(r'^\d{2}-\d{2}$', converted):
            app_sancti_do_format.add(converted)

    do_sancti_set = set(do_data["sancti_days_list"])

    common_sancti = app_sancti_do_format.intersection(do_sancti_set)
    only_in_do_sancti = do_sancti_set - app_sancti_do_format
    only_in_app_sancti = app_sancti_do_format - do_sancti_set

    print(f"\n3. COUVERTURE DU PROPRE DES SAINTS (Sancti) :")
    print(f"   • Saints communs couverts par les 2 : {len(common_sancti)} jours")
    print(f"   • Saints présents dans Divinum mais non listés par date directe dans votre app : {len(only_in_do_sancti)} jours")
    print(f"   • Taux de couverture des saints civils : {len(common_sancti)/len(do_sancti_set)*100:.1f}%")

    if only_in_do_sancti:
        sample_missing = sorted(list(only_in_do_sancti))[:10]
        print(f"   • Exemples de dates de saints dans Divinum non définies directement : {', '.join(sample_missing)}")

    print("\n==================================================")
