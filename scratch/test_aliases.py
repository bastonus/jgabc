"""Vérification des alias du Tempora pour propers.html."""

import re
from pathlib import Path

EXTENDED_TEMPORA_MAP = {
    # Alias de Pentecôte et fêtes associées
    "Pent0": "Pasc7-0", "Pent0m": "Pasc7-1", "Pent0t": "Pasc7-2", "Pent0w": "Pasc7-3", "Pent0h": "Pasc7-4", "Pent0f": "Pasc7-5", "Pent0s": "Pasc7-6", "Pent0ss": "Pasc7-6",
    "Pent1": "Pent01-0", "Pent1w": "Pent01-3", "CorpusChristi": "Pent01-4", "Corp": "Pent01-4",
    "Pent2": "Pent02-0", "SCJ": "Pent02-5", "Cor": "Pent02-5", "Pent3": "Pent03-0",
    "Pent4": "Pent04-0", "Pent5": "Pent05-0", "Pent6": "Pent06-0", "Pent7": "Pent07-0", "Pent8": "Pent08-0", "Pent9": "Pent09-0",
    "EmbWedSept": "Pent17-3", "EmbFriSept": "Pent17-5", "EmbSatSept": "Pent17-6", "EmbSatSeptS": "Pent17-6",
    "ChristusRex": "10-DU",
    # Semaine Sainte ante-1955
    "Quad6_v": "Quad6-0", "Quad6t_v": "Quad6-2", "Quad6w_v": "Quad6-3", "Quad6h_v": "Quad6-4", "Quad6f_v": "Quad6-5", "Quad6s_v": "Quad6-6", "Quad6h-lotio": "Quad6-4",
    "Pasc6s": "Pasc7-0", "Pasc6s_v": "Pasc7-0", "Adv3ss": "Adv3-6", "Quad1ss": "Quad1-6", "Quad5f_sd": "Quad5-5"
}

def test_extended_mapping():
    found = 0
    total = len(EXTENDED_TEMPORA_MAP)
    for k, target in EXTENDED_TEMPORA_MAP.items():
        is_sancti = target.startswith("10-") or target.startswith("12-") or target.startswith("01-")
        folder = "Sancti" if is_sancti else "Tempora"
        p = Path(f"do_data/missa/Latin/{folder}/{target}.txt")
        p_r = Path(f"do_data/missa/Latin/{folder}/{target}r.txt")
        p_o = Path(f"do_data/missa/Latin/{folder}/{target}o.txt")
        p_h = Path(f"do_data/horas/Latin/{folder}/{target}.txt")

        if p.exists() or p_r.exists() or p_o.exists() or p_h.exists():
            found += 1
        else:
            print(f"Non trouvé: {k} -> {target}")

    print(f"Résultat des alias Tempora : {found} / {total} trouvés ({found/total*100:.1f}%)")

if __name__ == "__main__":
    test_extended_mapping()
