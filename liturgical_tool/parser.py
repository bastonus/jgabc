"""Parseurs pour les sorties HTML de Divinum Officium et les fichiers bruts .txt."""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from bs4 import BeautifulSoup, NavigableString, Tag


@dataclass
class ParsedSection:
    """Représente une section ou prière bilingue liturgique."""
    id: str = ""
    title_lat: str = ""
    title_vern: str = ""
    text_lat: str = ""
    text_vern: str = ""
    rubrics_lat: List[str] = field(default_factory=list)
    rubrics_vern: List[str] = field(default_factory=list)
    is_empty_vern: bool = False
    is_latin_fallback: bool = False
    has_unresolved_refs: bool = False
    unresolved_refs: List[str] = field(default_factory=list)
    word_count_lat: int = 0
    word_count_vern: int = 0
    similarity_ratio: float = 0.0


@dataclass
class ParsedDay:
    """Représente l'office ou la messe d'un jour donné."""
    date: str
    target: str  # 'missa', 'Laudes', 'Vespera', etc.
    version: str
    lang1: str
    lang2: str
    headline: str = ""
    feast_title: str = ""
    rank_info: str = ""
    liturgical_color: str = ""
    sections: List[ParsedSection] = field(default_factory=list)
    completeness_score: float = 100.0
    error_flags: List[str] = field(default_factory=list)
    is_caching_error: bool = False
    raw_html_size: int = 0


class DivinumHtmlParser:
    """Parseur robuste pour les pages HTML générées par Divinum Officium."""

    # Regex pour détecter des balises de macro ou références internes non résolues
    UNRESOLVED_PATTERNS = [
        re.compile(r'@[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+:[A-Za-z0-9_\-]+'),  # @Commune/C2a:Lectio
        re.compile(r'\$(?:Per [A-Za-z]+|Qui [A-Za-z]+|Dominus|Oremus|Tu autem)', re.IGNORECASE), # $Per Dominum
        re.compile(r'!(?:Ps|Matt|Luc|Marc|Joan|Rom|Cor|Hebr|Jac|Petr|Act)\s+[0-9,:\-]+', re.IGNORECASE), # !Ps 36:30
    ]

    @classmethod
    def parse_html(
        cls,
        html_content: str,
        date: str,
        target: str,
        version: str,
        lang1: str,
        lang2: str
    ) -> ParsedDay:
        """Parse le document HTML de missa.pl ou officium.pl."""
        result = ParsedDay(
            date=date,
            target=target,
            version=version,
            lang1=lang1,
            lang2=lang2,
            raw_html_size=len(html_content)
        )

        if not html_content or len(html_content.strip()) < 100:
            result.error_flags.append("Contenu HTML vide ou trop court.")
            result.completeness_score = 0.0
            return result

        # Détection d'erreurs CGI / Perl
        if "Internal Server Error" in html_content or "Software error:" in html_content:
            result.error_flags.append("Erreur serveur CGI Divinum Officium (500 / Software error).")
            result.completeness_score = 0.0
            return result

        soup = BeautifulSoup(html_content, "html.parser")

        # Extraction des en-têtes (Jour, Fête, Rang)
        cls._extract_header_info(soup, result)

        # Extraction des tableaux à deux colonnes
        sections = []
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td", recursive=False)
            if len(tds) != 2:
                continue

            sec_id = tds[0].get("id", "")
            
            # Extraction des titres et textes
            title1, text1, rubrics1 = cls._extract_cell_content(tds[0])
            title2, text2, rubrics2 = cls._extract_cell_content(tds[1])

            # Ignorer les lignes d'en-tête de navigation pures
            if not text1 and not text2 and not title1 and not title2:
                continue

            section = ParsedSection(
                id=sec_id,
                title_lat=title1,
                title_vern=title2,
                text_lat=text1,
                text_vern=text2,
                rubrics_lat=rubrics1,
                rubrics_vern=rubrics2,
                word_count_lat=len(text1.split()) if text1 else 0,
                word_count_vern=len(text2.split()) if text2 else 0,
            )

            # Vérification de l'intégrité de la traduction vernaculaire
            cls._check_section_integrity(section, lang1, lang2)
            sections.append(section)

        result.sections = sections

        # Calcul du score global de complétude
        cls._calculate_completeness(result)

        return result

    @classmethod
    def _extract_header_info(cls, soup: BeautifulSoup, day: ParsedDay) -> None:
        """Extrait la date liturgique, le nom de la fête et le rang depuis les balises d'en-tête."""
        center_paras = soup.find_all("p", align=lambda x: x and "center" in x.lower())
        for p in center_paras:
            text = p.get_text(" ", strip=True)
            if not text:
                continue
            
            # Recherche des mentions liturgiques usuelles
            if any(term in text for term in ["Die", "Dominica", "Feria", "S.", "Sancti", "In Festo", "Octava", "Vigilia"]):
                day.headline = text
                # Détection de couleur
                color_tag = p.find("font", color=True)
                if color_tag and color_tag.get("color"):
                    day.liturgical_color = color_tag.get("color").strip()
                break

    @classmethod
    def _extract_cell_content(cls, td_elem: Tag) -> tuple[str, str, List[str]]:
        """Extrait le titre, le texte propre et les rubriques d'une cellule TD."""
        # Nettoyage des liens de navigation top/next
        for nav in td_elem.find_all("div", align=lambda x: x and "right" in x.lower()):
            nav.decompose()

        # Titre de la section (souvent dans font color=red size=+1 ou similaire)
        title = ""
        title_elem = td_elem.find(["font", "span", "b", "i"], color=lambda c: c and "red" in c.lower())
        if title_elem and (title_elem.find("b") or title_elem.parent.name in ["b", "i"]):
            title = title_elem.get_text(strip=True)

        # Rubriques en rouge ou italique
        rubrics = []
        for r_elem in td_elem.find_all(["font", "span"], color=lambda c: c and "red" in c.lower()):
            r_text = r_elem.get_text(strip=True)
            if r_text and r_text != title and len(r_text) < 150:
                rubrics.append(r_text)

        # Texte complet nettoyé
        full_text = td_elem.get_text(separator="\n", strip=True)
        
        # Supprimer le titre du début s'il est dupliqué
        if title and full_text.startswith(title):
            full_text = full_text[len(title):].strip()

        return title, full_text, rubrics

    @classmethod
    def _check_section_integrity(cls, section: ParsedSection, lang1: str, lang2: str) -> None:
        """Vérifie si une section est traduite, vide ou contient des erreurs."""
        if not section.text_lat and not section.text_vern:
            return

        # 1. Texte vernaculaire vide alors que le latin est présent
        if section.text_lat and not section.text_vern:
            section.is_empty_vern = True

        # 2. Détection de fallback latin (le texte vernaculaire est strictement identique au latin)
        if lang1 != lang2 and section.text_lat and section.text_vern:
            norm_lat = re.sub(r'[\s\W_]+', '', section.text_lat.lower())
            norm_vern = re.sub(r'[\s\W_]+', '', section.text_vern.lower())
            
            if len(norm_lat) > 20 and norm_lat == norm_vern:
                section.is_latin_fallback = True

        # 3. Détection de références non résolues
        unresolved = []
        for pat in cls.UNRESOLVED_PATTERNS:
            matches = pat.findall(section.text_vern) + pat.findall(section.title_vern)
            if matches:
                unresolved.extend(matches)

        if unresolved:
            section.has_unresolved_refs = True
            section.unresolved_refs = unresolved

    @classmethod
    def _calculate_completeness(cls, day: ParsedDay) -> None:
        """Calcule le score de complétude du jour (pourcentage de sections valablement traduites)."""
        if not day.sections:
            day.completeness_score = 0.0
            return

        total_sections = len(day.sections)
        valid_sections = 0

        for sec in day.sections:
            # Une section est valide si elle n'est ni vide, ni en fallback latin, ni avec des macros cassées
            if not sec.is_empty_vern and not sec.is_latin_fallback:
                valid_sections += 1
            elif sec.is_empty_vern:
                day.error_flags.append(f"Section '{sec.title_lat or sec.id}' : texte manquant en {day.lang2}.")
            elif sec.is_latin_fallback:
                day.error_flags.append(f"Section '{sec.title_lat or sec.id}' : non traduite (fallback Latin).")

        day.completeness_score = round((valid_sections / total_sections) * 100.0, 2)


class DivinumTxtParser:
    """Parseur pour les fichiers sources `.txt` de Divinum Officium (Sancti, Tempora, Commune, etc.)."""

    @classmethod
    def parse_txt_file(cls, file_path: str) -> Dict[str, Dict[str, Any]]:
        """Parse un fichier .txt structuré de Divinum Officium."""
        sections: Dict[str, Dict[str, Any]] = {}
        current_section = "Header"
        sections[current_section] = {"lines": [], "references": [], "macros": []}

        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    stripped = line.strip()
                    if not stripped:
                        continue

                    # Détection d'un nom de section [SectionName]
                    if stripped.startswith("[") and stripped.endswith("]"):
                        current_section = stripped[1:-1]
                        if current_section not in sections:
                            sections[current_section] = {"lines": [], "references": [], "macros": []}
                        continue

                    sections[current_section]["lines"].append(stripped)

                    # Référence à un autre fichier @Commune/C1:Lectio
                    if stripped.startswith("@"):
                        sections[current_section]["references"].append(stripped[1:])
                    # Macro $Per Dominum
                    elif stripped.startswith("$"):
                        sections[current_section]["macros"].append(stripped[1:])
        except Exception as e:
            sections["_error"] = {"message": str(e)}

        return sections
