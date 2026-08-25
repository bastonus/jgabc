"""Simulation exacte du flux de chargement JS pour le 25 août 2026."""

import json
from pathlib import Path

with open("do_manifest.json", "r", encoding="utf-8") as f:
    manifest = set(json.load(f))

def file_exists(path):
    return path.lower().replace('\\', '/') in manifest

def simulate_load(rel_path, lang_folder="Francais", is_missa=True):
    clean_path = rel_path + (".txt" if not rel_path.endswith(".txt") else "")
    is_commune = clean_path.startswith("Commune/") or clean_path.startswith("C")

    candidate_paths = []
    ed_suffixes = ["r", ""]

    if is_commune:
        c_path = clean_path if clean_path.startswith("Commune/") else ("Commune/" + clean_path)
        candidate_paths.append(f"do_data/horas/{lang_folder}/{c_path}")
        candidate_paths.append(f"do_data/missa/{lang_folder}/{c_path}")
        candidate_paths.append(f"do_data/horas/Latin/{c_path}")
        candidate_paths.append(f"do_data/missa/Latin/{c_path}")
    else:
        raw_stem = clean_path.replace(".txt", "")
        parts = raw_stem.split("/")
        subfolder = parts[0] if len(parts) > 1 else ""
        filename = parts[1] if len(parts) > 1 else parts[0]

        primary = "missa" if is_missa else "horas"
        alt = "horas" if is_missa else "missa"

        for sfx in ed_suffixes:
            fname_sfx = f"{subfolder}/{filename}{sfx}.txt" if subfolder else f"{filename}{sfx}.txt"
            candidate_paths.append(f"do_data/{primary}/{lang_folder}/{fname_sfx}")
            candidate_paths.append(f"do_data/{alt}/{lang_folder}/{fname_sfx}")
            candidate_paths.append(f"do_data/{primary}/Latin/{fname_sfx}")
            candidate_paths.append(f"do_data/{alt}/Latin/{fname_sfx}")

    print(f"\n--- Simulation de chargement pour : {rel_path} ({lang_folder}) ---")
    valid_paths = [p for p in candidate_paths if file_exists(p)]
    print(f"Total candidats générés : {len(candidate_paths)}")
    print(f"Candidats existants trouvés : {len(valid_paths)}")
    for p in valid_paths:
        print("  -> TROUVÉ :", p)

    if not valid_paths:
        print("  [!] AUCUN FICHIER TROUVÉ !")

if __name__ == "__main__":
    simulate_load("Sancti/08-25", "Latin", True)
    simulate_load("Sancti/08-25", "Francais", True)
    simulate_load("Commune/C2a", "Francais", True)
    simulate_load("Commune/C2a", "Latin", True)
    simulate_load("Ordo/Ordo", "Latin", True)
    simulate_load("Ordo/Ordo", "Francais", True)
