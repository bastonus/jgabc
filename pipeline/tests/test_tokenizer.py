"""
Tests de non-régression pour le fix de tokenisation des clefs GABC (v3.1).

Exécuter avec :
    python -m pytest tests/test_tokenizer.py -v
ou directement :
    python tests/test_tokenizer.py
"""

import sys
import os

# Permet d'importer le module depuis la racine du projet sans installation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from batch_align_gabc_v3 import tokenize_gabc_notes, parse_gabc_file


# =====================================================================
# Tests du garde-fou clef (FIX v3.1)
# =====================================================================

def test_clef_alone_produces_no_notes():
    """Une clef seule (c3, f4, cb2, fb3...) ne doit produire aucune note."""
    assert tokenize_gabc_notes("c3") == [], "c3 seul doit être ignoré"
    assert tokenize_gabc_notes("c4") == [], "c4 seul doit être ignoré"
    assert tokenize_gabc_notes("f3") == [], "f3 seul doit être ignoré"
    assert tokenize_gabc_notes("f4") == [], "f4 seul doit être ignoré"
    assert tokenize_gabc_notes("cb2") == [], "cb2 (clef avec bémol) doit être ignoré"
    assert tokenize_gabc_notes("fb3") == [], "fb3 (clef avec bémol) doit être ignoré"
    print("  [OK] Clefs isolées -> aucune note fantôme")


def test_clef_prefix_does_not_pollute_notes():
    """Une clef en préfixe de notes ne doit pas injecter de note supplémentaire."""
    tokens = [n["token"] for n in tokenize_gabc_notes("c3eh")]
    assert tokens == ["e", "h"], f"Attendu ['e', 'h'], obtenu {tokens}"

    tokens = [n["token"] for n in tokenize_gabc_notes("fb4gh")]
    assert tokens == ["g", "h"], f"Attendu ['g', 'h'], obtenu {tokens}"

    tokens = [n["token"] for n in tokenize_gabc_notes("cb2hi")]
    assert tokens == ["h", "i"], f"Attendu ['h', 'i'], obtenu {tokens}"
    print("  [OK] Clef en préfixe -> notes correctes, pas de note fantôme")


def test_full_gabc_clef_prefix():
    """Cas réel : (c3) en tête de pièce, suivi de notes."""
    tokens = [n["token"] for n in tokenize_gabc_notes("c3")]
    assert tokens == []
    # Simule la syllabe (c3eh) du Populus Sion
    tokens = [n["token"] for n in tokenize_gabc_notes("c3eh")]
    assert tokens == ["e", "h"]
    print("  [OK] Cas réel (c3) et (c3eh)")


# =====================================================================
# Tests du tokeniseur — cas généraux
# =====================================================================

def test_simple_notes():
    """Notes simples sans modificateurs."""
    tokens = [n["token"] for n in tokenize_gabc_notes("ghi")]
    assert tokens == ["g", "h", "i"]
    print("  [OK] Notes simples")


def test_punctum_mora():
    """Le punctum mora (.) allonge la note sans en créer une nouvelle."""
    result = tokenize_gabc_notes("e.")
    assert len(result) == 1
    assert result[0]["token"] == "e."
    assert result[0]["duration_weight"] > 1.0
    print("  [OK] Punctum mora")


def test_double_punctum_mora():
    """Le double punctum mora (..) allonge encore plus."""
    result = tokenize_gabc_notes("e..")
    assert len(result) == 1
    assert result[0]["token"] == "e.."
    assert result[0]["duration_weight"] > 2.0
    print("  [OK] Double punctum mora")


def test_episema():
    """L'épisème horizontal (_) allonge la note."""
    result = tokenize_gabc_notes("h_")
    assert len(result) == 1
    assert result[0]["token"] == "h_"
    assert result[0]["duration_weight"] > 1.0
    print("  [OK] Épisème horizontal")


def test_quilisma():
    """Le quilisma (w) est un modificateur de forme, pas une note supplémentaire."""
    result = tokenize_gabc_notes("gw")
    assert len(result) == 1
    assert result[0]["token"] == "gw"
    print("  [OK] Quilisma")


def test_translation_text_ignored():
    """Le texte de traduction entre crochets est ignoré."""
    # [People] doit être éliminé
    tokens = [n["token"] for n in tokenize_gabc_notes("[People]c3eh")]
    assert "P" not in tokens
    assert "e" in tokens
    print("  [OK] Texte de traduction ignoré")


def test_repeated_notes_flagged():
    """Les distrophes/bivirga sont correctement signalées comme répétées."""
    result = tokenize_gabc_notes("hss")
    assert any(n["repeated"] for n in result), "Une distrophe doit être marquée repeated=True"
    print("  [OK] Notes répétées (distrophe ss) flaggées")


def test_separator_not_counted_as_note():
    """Les séparateurs de neumes (/) ne sont pas comptés comme notes."""
    result = tokenize_gabc_notes("g/h")
    assert len(result) == 2
    assert result[0]["token"] == "g"
    assert result[1]["token"] == "h"
    print("  [OK] Séparateur de neumes ignoré")


def test_mелisme_populus_sion():
    """Cas complexe : mélisme de la syllabe 'Dó' dans le Populus Sion."""
    # e.f!gwhhi → e. f g w h h i — mais ! est séparateur, w est forme de g
    # Résultat attendu : e., f, gw, h, h, i  → 6 tokens
    result = tokenize_gabc_notes("e.f!gwhhi")
    tokens = [n["token"] for n in result]
    assert len(result) == 6, f"Attendu 6 notes, obtenu {len(result)} : {tokens}"
    assert result[0]["token"] == "e."
    print(f"  [OK] Mélisme Populus Sion : {tokens}")


# =====================================================================
# Tests du parser GABC complet
# =====================================================================

def test_parse_gabc_file_basic():
    """Le parser extrait correctement les mots d'un GABC minimal."""
    gabc = "name: Test;\n%%\nPó(g)pu(h)lus(i) Si(j)on(k)"
    words = parse_gabc_file(gabc)
    assert len(words) >= 1
    print(f"  [OK] Parser GABC basique : {[w['word'] for w in words]}")


def test_parse_gabc_file_clef_not_a_word():
    """Une clef en tête de pièce n'est pas comptée comme un mot."""
    gabc = "name: Test;\n%%\n(c3) Pó(g)lus(h) Si(i)on(j)"
    words = parse_gabc_file(gabc)
    # Aucun mot ne doit être vide ou ne contenir que des clefs
    for w in words:
        assert w["word"] != "", f"Mot vide détecté : {w}"
        assert w["notes"], f"Mot sans notes détecté : {w}"
    print(f"  [OK] Clef en tête de pièce non comptée comme mot")


def test_parse_gabc_populus_sion():
    """Parsing complet du Populus Sion (extrait de référence)."""
    sample_gabc = (
        "name: Pópulus Sion;\n%%\n"
        "(c3) Pó[People](c3eh)pu(g)lus[/](h) Si(hi)on,(hgh.) *(;) "
        "ec(hihi)ce(e.) Dó(e.f!gwhhi)mi(h)us(h) vé(hi)ni(ig//ih)et(h.) "
        "(,) ad(iv./hig) sal(fe)ván(ghg)das(fg) gen(e_f_e_)tes(e.) :(:)"
    )
    words = parse_gabc_file(sample_gabc)
    assert len(words) > 0
    total_notes = sum(len(w["notes"]) for w in words)
    print(f"  [OK] Populus Sion : {len(words)} mots, {total_notes} notes totales")
    for w in words:
        assert w["notes"], f"Mot sans notes : {w['word']!r}"


# =====================================================================
# Exécution
# =====================================================================

if __name__ == "__main__":
    tests = [
        test_clef_alone_produces_no_notes,
        test_clef_prefix_does_not_pollute_notes,
        test_full_gabc_clef_prefix,
        test_simple_notes,
        test_punctum_mora,
        test_double_punctum_mora,
        test_episema,
        test_quilisma,
        test_translation_text_ignored,
        test_repeated_notes_flagged,
        test_separator_not_counted_as_note,
        test_mелisme_populus_sion,
        test_parse_gabc_file_basic,
        test_parse_gabc_file_clef_not_a_word,
        test_parse_gabc_populus_sion,
    ]

    print("=" * 60)
    print("Tests de non-régression — tokeniseur GABC v3.1")
    print("=" * 60)
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except (AssertionError, Exception) as e:
            print(f"  [FAIL] {t.__name__} : {e}")
            failed += 1

    print("=" * 60)
    print(f"Résultat : {passed}/{len(tests)} tests passés, {failed} échoués.")
    if failed == 0:
        print("Tous les tests de non-régression passent. ✓")
