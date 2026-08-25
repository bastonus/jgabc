"""Moteur d'accès et de vérification directe hors-ligne basé sur les fichiers de bases locales."""

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set

from liturgical_tool.config import LOCAL_DO_SOURCE_DIR, LOCAL_DO_DATA_DIR, MISSA_PROPER_PARTS, LANGUAGES
from liturgical_tool.parser import DivinumTxtParser, ParsedDay, ParsedSection


def get_easter_date(year: int) -> datetime:
    """Calcule la date du dimanche de Pâques (algorithme de Butcher / Computus grégorien)."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return datetime(year, month, day)


def get_advent_sunday(year: int) -> datetime:
    """Calcule le 1er dimanche de l'Avent."""
    xmas = datetime(year, 12, 25)
    dow = xmas.weekday()
    days_back = 21 + ((dow + 1) % 7 if dow != 6 else 0)
    if dow == 6:
        days_back = 28
    return xmas - timedelta(days=days_back)


class LocalDatabaseEngine:
    """Moteur de lecture et de vérification d'intégrité directe hors-ligne multilingue ultra-optimisé."""

    def __init__(self, base_dir: Path = LOCAL_DO_SOURCE_DIR):
        if not base_dir.exists() and LOCAL_DO_DATA_DIR.exists():
            self.base_dir = LOCAL_DO_DATA_DIR
        else:
            self.base_dir = base_dir

        self._existing_files: Set[str] = set()
        self._parsed_cache: Dict[str, Dict[str, Any]] = {}
        self._init_index()

    def _init_index(self) -> None:
        """Indexe tous les fichiers .txt existants une seule fois pour des lookups O(1)."""
        for b in [self.base_dir, LOCAL_DO_SOURCE_DIR, LOCAL_DO_DATA_DIR]:
            if b.exists():
                for p in b.glob("**/*.txt"):
                    self._existing_files.add(str(p).lower())

    def get_tempora_code(self, dt: datetime) -> str:
        """Détermine le code Tempora correspondant à une date donnée."""
        year = dt.year
        easter = get_easter_date(year)
        advent1 = get_advent_sunday(year)
        xmas = datetime(year, 12, 25)
        
        dow = (dt.weekday() + 1) % 7  # 0=Dimanche, 1=Lundi, ..., 6=Samedi

        # 1. Avent
        if advent1 <= dt < xmas:
            days_from_adv = (dt - advent1).days
            week = (days_from_adv // 7) + 1
            return f"Adv{week}-{dow}"

        # 2. Temps de Noël (25 déc - 5 janv)
        if dt >= xmas:
            return f"Nat{dt.day:02d}"
        if dt < datetime(year, 1, 6):
            return f"Nat{dt.day:02d}"

        # 3. Épiphanie (6 janv -> Septuagésime)
        ash_wed = easter - timedelta(days=46)
        septuagesima = easter - timedelta(days=63)
        
        epiphany = datetime(year, 1, 6)
        first_sun_epi = epiphany + timedelta(days=((6 - epiphany.weekday()) % 7))
        if first_sun_epi == epiphany:
            first_sun_epi += timedelta(days=7)

        if dt < septuagesima:
            if dt < first_sun_epi:
                return f"Epi1-{dow}"
            days_from_epi1 = (dt - first_sun_epi).days
            week = (days_from_epi1 // 7) + 2
            return f"Epi{min(week, 6)}-{dow}"

        # 4. Septuagésime (3 semaines)
        if dt < ash_wed:
            days_from_sept = (dt - septuagesima).days
            week = (days_from_sept // 7) + 1
            return f"Quadp{week}-{dow}"

        # 5. Carême (Cendres -> Pâques)
        if dt < easter:
            days_from_ash = (dt - ash_wed).days
            if days_from_ash < 4:
                return f"Quadp3-{dow}"
            days_from_quad1 = (dt - (ash_wed + timedelta(days=4))).days
            week = (days_from_quad1 // 7) + 1
            return f"Quad{min(week, 6)}-{dow}"

        # 6. Temps Pascal (Pâques -> Pentecôte)
        pentecost = easter + timedelta(days=49)
        if dt < pentecost:
            days_from_easter = (dt - easter).days
            week = days_from_easter // 7
            return f"Pasc{week}-{dow}"

        # 7. Temps après la Pentecôte
        if dt < advent1:
            days_from_pent = (dt - pentecost).days
            week = (days_from_pent // 7) + 1
            return f"Pent{min(week, 24):02d}-{dow}"

        return "Tempora"

    def find_file(self, domain: str, lang: str, subfolder: str, filename: str, version: str = "Rubrics 1960 - 1960") -> Optional[Path]:
        """Recherche ultra-rapide en mémoire sans accès disque répété."""
        base_stem = filename.replace(".txt", "")
        candidate_filenames = [filename]
        if "1960" in version:
            candidate_filenames = [f"{base_stem}r.txt", filename, f"{base_stem}.txt"]
        elif any(v in version for v in ["1570", "1888", "1906"]):
            candidate_filenames = [f"{base_stem}o.txt", f"{base_stem}t.txt", filename, f"{base_stem}.txt"]
        elif "Monastic" in version:
            candidate_filenames = [f"{base_stem}m.txt", f"{base_stem}.txt", filename]

        for fname in candidate_filenames:
            candidates = [
                self.base_dir / domain / lang / subfolder / fname,
                LOCAL_DO_DATA_DIR / domain / lang / subfolder / fname,
                self.base_dir / domain / lang / fname,
            ]
            for p in candidates:
                if str(p).lower() in self._existing_files:
                    return p
        return None

    def _get_parsed_txt(self, file_path: Path) -> Dict[str, Any]:
        """Parse et met en cache un fichier .txt."""
        f_str = str(file_path).lower()
        if f_str in self._parsed_cache:
            return self._parsed_cache[f_str]
        parsed = DivinumTxtParser.parse_txt_file(str(file_path))
        self._parsed_cache[f_str] = parsed
        return parsed

    def resolve_reference(self, domain: str, lang: str, ref: str, version: str = "Rubrics 1960 - 1960") -> Optional[Dict[str, Any]]:
        """Résout une référence comme @Commune/C2a:Lectio ou @Sancti/08-25:Introitus."""
        if ":" not in ref:
            return None
        file_part, section_part = ref.split(":", 1)
        subfolder, fname = "", file_part
        if "/" in file_part:
            subfolder, fname = file_part.split("/", 1)

        fpath = self.find_file(domain, lang, subfolder, f"{fname}.txt", version=version)
        if not fpath:
            return None

        parsed = self._get_parsed_txt(fpath)
        if section_part in parsed:
            return parsed[section_part]
        return None

    def check_day_local(
        self,
        dt: datetime,
        domain: str = "missa",
        lang1: str = "Latin",
        lang2: str = "Francais",
        version: str = "Rubrics 1960 - 1960",
        rubrics: bool = True
    ) -> ParsedDay:
        """Analyse et compare l'intégrité d'un jour donné directement depuis les fichiers locaux."""
        date_str = dt.strftime("%m-%d-%Y")
        sancti_code = dt.strftime("%m-%d")
        tempora_code = self.get_tempora_code(dt)

        day_obj = ParsedDay(
            date=date_str,
            target=domain,
            version=version,
            lang1=lang1,
            lang2=lang2,
        )

        sancti_lat = self.find_file(domain, lang1, "Sancti", f"{sancti_code}.txt", version=version)
        sancti_vern = self.find_file(domain, lang2, "Sancti", f"{sancti_code}.txt", version=version)
        
        tempora_lat = self.find_file(domain, lang1, "Tempora", f"{tempora_code}.txt", version=version)
        tempora_vern = self.find_file(domain, lang2, "Tempora", f"{tempora_code}.txt", version=version)

        chosen_lat_path = sancti_lat or tempora_lat
        chosen_vern_path = sancti_vern or tempora_vern

        if not chosen_lat_path:
            day_obj.error_flags.append(f"Aucun fichier source Latin trouvé pour Sancti={sancti_code} ou Tempora={tempora_code}.")
            day_obj.completeness_score = 0.0
            return day_obj

        parsed_lat = self._get_parsed_txt(chosen_lat_path)
        parsed_vern = self._get_parsed_txt(chosen_vern_path) if chosen_vern_path else {}

        sections = []
        for sec_name in MISSA_PROPER_PARTS:
            if sec_name not in parsed_lat:
                continue

            sec_lat_data = parsed_lat[sec_name]
            sec_vern_data = parsed_vern.get(sec_name, {"lines": [], "references": [], "macros": []})

            text_lat = "\n".join(sec_lat_data["lines"])
            text_vern = "\n".join(sec_vern_data["lines"])

            # Résolution de référence si le vernaculaire est une référence @...
            if not text_vern and sec_vern_data["references"]:
                resolved = self.resolve_reference(domain, lang2, sec_vern_data["references"][0], version=version)
                if resolved and resolved["lines"]:
                    text_vern = "\n".join(resolved["lines"])

            # Si le latin est une référence
            if not text_lat and sec_lat_data["references"]:
                resolved_lat = self.resolve_reference(domain, lang1, sec_lat_data["references"][0], version=version)
                if resolved_lat and resolved_lat["lines"]:
                    text_lat = "\n".join(resolved_lat["lines"])

            parsed_sec = ParsedSection(
                id=sec_name,
                title_lat=sec_name,
                title_vern=sec_name,
                text_lat=text_lat,
                text_vern=text_vern,
                word_count_lat=len(text_lat.split()),
                word_count_vern=len(text_vern.split()),
            )

            # Vérification de complétude
            if text_lat and not text_vern:
                parsed_sec.is_empty_vern = True
                day_obj.error_flags.append(f"Section '{sec_name}' absente en {lang2}.")

            sections.append(parsed_sec)

        day_obj.sections = sections
        if sections:
            valid = sum(1 for s in sections if not s.is_empty_vern)
            day_obj.completeness_score = round((valid / len(sections)) * 100.0, 2)
        else:
            day_obj.completeness_score = 100.0

        return day_obj

    def scan_full_year_local(
        self,
        year: int,
        domain: str = "missa",
        lang1: str = "Latin",
        lang2: str = "Francais",
        version: str = "Rubrics 1960 - 1960",
        rubrics: bool = True
    ) -> List[ParsedDay]:
        """Scanne les 365/366 jours d'une année complète en local."""
        results = []
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)
        current = start_date

        while current <= end_date:
            day_res = self.check_day_local(current, domain=domain, lang1=lang1, lang2=lang2, version=version, rubrics=rubrics)
            results.append(day_res)
            current += timedelta(days=1)

        return results

    def scan_all_languages(
        self,
        year: int,
        domain: str = "missa",
        lang_list: Optional[List[str]] = None,
        version: str = "Rubrics 1960 - 1960"
    ) -> Dict[str, Dict[str, Any]]:
        """Scanne l'intégrité de toutes les langues enregistrées sur l'ensemble de l'année."""
        if lang_list is None:
            lang_list = [l for l in LANGUAGES.keys() if l != "Latin"]

        summary: Dict[str, Dict[str, Any]] = {}

        for lang in lang_list:
            days = self.scan_full_year_local(year, domain=domain, lang1="Latin", lang2=lang, version=version)
            total = len(days)
            if total == 0:
                continue

            avg_score = sum(d.completeness_score for d in days) / total
            perfect_days = sum(1 for d in days if d.completeness_score >= 100.0)
            imperfect_days = total - perfect_days

            all_errors: Dict[str, int] = {}
            for d in days:
                for err in d.error_flags:
                    all_errors[err] = all_errors.get(err, 0) + 1

            summary[lang] = {
                "language": lang,
                "label": LANGUAGES.get(lang, {}).get("label", lang),
                "total_days": total,
                "avg_completeness": round(avg_score, 2),
                "perfect_days": perfect_days,
                "imperfect_days": imperfect_days,
                "missing_rate_pct": round((imperfect_days / total) * 100.0, 1),
                "top_errors": sorted(all_errors.items(), key=lambda x: x[1], reverse=True)[:5],
                "days": days
            }

        return summary
