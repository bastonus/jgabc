"""Moteur de comparaison multidimensionnel (Inter-langues, Inter-versions, Live vs Local)."""

import difflib
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple

from liturgical_tool.parser import ParsedDay, ParsedSection


@dataclass
class SectionDiff:
    """Différence détaillée sur une section liturgique."""
    section_id: str
    title_a: str
    title_b: str
    status: str  # 'IDENTICAL', 'MODIFIED', 'ONLY_IN_A', 'ONLY_IN_B'
    text_a: str
    text_b: str
    diff_unified: str = ""
    similarity: float = 1.0


@dataclass
class DayComparison:
    """Résultat de la comparaison entre deux instances d'un jour liturgique."""
    date: str
    label_a: str
    label_b: str
    headline_a: str
    headline_b: str
    is_headline_match: bool
    sections_diff: List[SectionDiff] = field(default_factory=list)
    match_percentage: float = 100.0
    total_sections_a: int = 0
    total_sections_b: int = 0
    modified_sections_count: int = 0


class LiturgicalComparator:
    """Comparateur liturgique flexible."""

    @classmethod
    def compare_days(
        cls,
        day_a: ParsedDay,
        day_b: ParsedDay,
        label_a: str = "Source A",
        label_b: str = "Source B"
    ) -> DayComparison:
        """Compare deux objets ParsedDay et calcule les différences textuelles."""
        result = DayComparison(
            date=day_a.date or day_b.date,
            label_a=label_a,
            label_b=label_b,
            headline_a=day_a.headline,
            headline_b=day_b.headline,
            is_headline_match=(day_a.headline.strip().lower() == day_b.headline.strip().lower()),
            total_sections_a=len(day_a.sections),
            total_sections_b=len(day_b.sections),
        )

        def get_sec_key(s: ParsedSection) -> str:
            if s.title_lat and not s.title_lat.isdigit():
                return s.title_lat.strip().lower()
            if s.title_vern and not s.title_vern.isdigit():
                return s.title_vern.strip().lower()
            return s.id.strip().lower()

        map_a: Dict[str, ParsedSection] = {get_sec_key(s): s for s in day_a.sections}
        map_b: Dict[str, ParsedSection] = {get_sec_key(s): s for s in day_b.sections}

        all_keys = list(dict.fromkeys(list(map_a.keys()) + list(map_b.keys())))

        identical_count = 0
        modified_count = 0

        for key in all_keys:
            sec_a = map_a.get(key)
            sec_b = map_b.get(key)

            if sec_a and not sec_b:
                result.sections_diff.append(SectionDiff(
                    section_id=key,
                    title_a=sec_a.title_vern or sec_a.title_lat,
                    title_b="",
                    status="ONLY_IN_A",
                    text_a=sec_a.text_vern or sec_a.text_lat,
                    text_b="",
                    similarity=0.0
                ))
                modified_count += 1
            elif sec_b and not sec_a:
                result.sections_diff.append(SectionDiff(
                    section_id=key,
                    title_a="",
                    title_b=sec_b.title_vern or sec_b.title_lat,
                    status="ONLY_IN_B",
                    text_a="",
                    text_b=sec_b.text_vern or sec_b.text_lat,
                    similarity=0.0
                ))
                modified_count += 1
            else:
                # Présent des deux côtés : calcul du diff textuel
                t_a = (sec_a.text_vern or sec_a.text_lat).strip()
                t_b = (sec_b.text_vern or sec_b.text_lat).strip()

                matcher = difflib.SequenceMatcher(None, t_a, t_b)
                similarity = round(matcher.ratio(), 4)

                if similarity >= 0.99:
                    identical_count += 1
                    status = "IDENTICAL"
                    unified = ""
                else:
                    modified_count += 1
                    status = "MODIFIED"
                    unified = "\n".join(difflib.unified_diff(
                        t_a.splitlines(),
                        t_b.splitlines(),
                        fromfile=label_a,
                        tofile=label_b,
                        lineterm=""
                    ))

                result.sections_diff.append(SectionDiff(
                    section_id=key,
                    title_a=sec_a.title_vern or sec_a.title_lat,
                    title_b=sec_b.title_vern or sec_b.title_lat,
                    status=status,
                    text_a=t_a,
                    text_b=t_b,
                    diff_unified=unified,
                    similarity=similarity
                ))

        total_keys = max(len(all_keys), 1)
        result.match_percentage = round((identical_count / total_keys) * 100.0, 2)
        result.modified_sections_count = modified_count

        return result
