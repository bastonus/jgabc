"""Script d'analyse comparative textuelle entre les données Grégoriennes (GABC / GregoBase) et Divinum Officium."""

import sys
import re
from pathlib import Path
import difflib

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def clean_text(text: str) -> str:
    """Nettoie le texte liturgique pour comparaison textuelle pure."""
    text = re.sub(r'\(.*?\)', '', text)          # Supprimer les codes GABC
    text = re.sub(r'[!#\$\*\~\|\:\;]', ' ', text) # Supprimer les marques de ponctuation
    text = re.sub(r'℣\.|℟\.|Ps\.|v\.|r\.', ' ', text)
    # Normalisation orthographique latine classique vs médiévale
    text = text.replace('æ', 'ae').replace('œ', 'oe').replace('j', 'i').replace('v', 'u')
    text = re.sub(r'\s+', ' ', text)
    return text.strip().lower()

def compare_feast(sancti_code: str, feast_name: str, gregorian_texts: dict, do_file_path: Path):
    print(f"\n=======================================================")
    print(f"COMPARAISON : {feast_name} ({sancti_code})")
    print(f"=======================================================")

    if not do_file_path.exists():
        print(f"[!] Fichier Divinum Officium introuvable : {do_file_path}")
        return

    with open(do_file_path, "r", encoding="utf-8", errors="replace") as f:
        do_raw = f.read()

    # Extraire les sections de Divinum Officium
    sections = {}
    cur_sec = None
    for line in do_raw.splitlines():
        line_clean = line.strip()
        m = re.match(r'^\[([A-Za-z0-9_\-]+)\]', line_clean)
        if m:
            cur_sec = m.group(1)
            sections[cur_sec] = []
        elif cur_sec:
            sections[cur_sec].append(line_clean)

    for part_name, greg_val in gregorian_texts.items():
        do_lines = sections.get(part_name, [])
        # Ignorer les lignes de directives pures (@ ou !)
        actual_lines = [l for l in do_lines if not l.startswith("@") and not l.startswith("!")]
        do_text = " ".join(actual_lines) if actual_lines else ("\n".join(do_lines))
        
        greg_clean = clean_text(greg_val)
        do_clean = clean_text(do_text)

        sim = difflib.SequenceMatcher(None, greg_clean, do_clean).ratio()

        print(f"\n--- [{part_name.upper()}] (Similarite : {sim*100:.1f}%) ---")
        print(f"  • Données Grégoriennes : \"{greg_val[:90]}...\"")
        print(f"  • Divinum Officium     : \"{do_text[:90]}...\"")

        if sim < 0.9:
            print("  -> Analyse de la divergence :")
            if do_text.startswith("@"):
                print(f"     1. Référence indirecte : Divinum utilise la référence '{do_text}' qui renvoie à un Commun.")
            elif do_text.startswith("!"):
                print(f"     2. Référence scripturaire : Divinum note la référence biblique '{do_text}' sans copier tout le verset de psaume.")
            elif len(greg_clean) != len(do_clean):
                print(f"     3. Versets choraux : Le Grégorien inclut les versets psalmiques et Gloria Patri chantés par la schola ({len(greg_clean)} car vs {len(do_clean)} car).")
            else:
                print("     4. Variantes de texte textuel (Vetus Latina vs Vulgate).")

if __name__ == "__main__":
    # Test 1 : Saint Louis (25 Août)
    st_louis_greg = {
        "Introitus": "Os justi meditabitur sapientiam, et lingua ejus loquetur judicium : lex Dei ejus in corde ipsius. Ps. Noli aemulari in malignantibus : neque zelaveris facientes iniquitatem.",
        "Graduale": "Justus ut palma florebit : sicut cedrus Libani multiplicabitur in domo Domini. V. Ad annuntiandum mane misericordiam tuam, et veritatem tuam per noctem.",
        "Offertorium": "Veritas mea, et misericordia mea cum ipso : et in nomine meo exaltabitur cornu ejus.",
        "Communio": "Beatus servus, quem, cum venerit dominus, invenerit vigilantem : amen dico vobis, super omnia bona sua constituet eum."
    }
    compare_feast("08-25", "Saint Louis Roi", st_louis_greg, Path("do_data/missa/Latin/Sancti/08-25.txt"))

    # Test 2 : 1er Dimanche de l'Avent
    adv1_greg = {
        "Introitus": "Ad te levavi animam meam : Deus meus in te confido, non erubescam : neque irrideant me inimici mei : etenim universi qui te expectant, non confundentur. Ps. Vias tuas Domine demonstra mihi : et semitas tuas edoce me.",
        "Graduale": "Universi qui te expectant, non confundentur Domine. V. Vias tuas Domine notas fac mihi : et semitas tuas edoce me.",
        "Alleluia": "Alleluia, alleluia. V. Ostende nobis Domine misericordiam tuam : et salutare tuum da nobis. Alleluia.",
        "Offertorium": "Ad te Domine levavi animam meam : Deus meus in te confido, non erubescam : neque irrideant me inimici mei : etenim universi qui te expectant, non confundentur.",
        "Communio": "Dominus dabit benignitatem : et terra nostra dabit fructum suum."
    }
    compare_feast("Adv1-0", "Ier Dimanche de l'Avent", adv1_greg, Path("do_data/missa/Latin/Tempora/Adv1-0.txt"))
