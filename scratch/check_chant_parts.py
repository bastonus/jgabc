"""Analyse détaillée des parties de la messe et du calendrier entre propers.html et Divinum Officium."""

import re
import json
from pathlib import Path

def check_chant_parts():
    propers_js_path = Path("propersdata.js")
    with open(propers_js_path, "r", encoding="utf-8", errors="replace") as f:
        js_content = f.read()

    # Compter les occurrences de chaque pièce grégorienne
    chants = {
        "Introitus (in)": len(re.findall(r'"in"\s*:', js_content)),
        "Graduale (gr)": len(re.findall(r'"gr"\s*:', js_content)),
        "Alleluia (al)": len(re.findall(r'"al"\s*:', js_content)),
        "Tractus (tr)": len(re.findall(r'"tr"\s*:', js_content)),
        "Sequentia (seq)": len(re.findall(r'"seq"\s*:', js_content)),
        "Offertorium (of)": len(re.findall(r'"of"\s*:', js_content)),
        "Communio (co)": len(re.findall(r'"co"\s*:', js_content)),
    }

    # Vérifier les éléments présents dans Divinum Officium mais absents dans propers.html :
    # - Les Oraisons (Collecte, Secrète, Postcommunion)
    # - Les Lectures bibliques (Épître / Lectio, Évangile / Evangelium)
    # - L'Ordinarium complet avec dialogues (Kyrie, Gloria, Credo, Sanctus, Agnus Dei, Prières au bas de l'autel, Canon)
    # - L'Office Divin (Matines, Laudes, Vêpres, Complies...)

    return chants

if __name__ == "__main__":
    chants = check_chant_parts()
    print("==================================================")
    print("RÉPARTITION DES PIÈCES GRÉGORIENNES DANS PROPERS.JS")
    print("==================================================")
    for k, v in chants.items():
        print(f"   • {k:<20} : {v:4d} pièces musicales répertoriées")
