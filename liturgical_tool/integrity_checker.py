"""Moteur d'analyse d'intégrité et de conformité des données liturgiques."""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum

from liturgical_tool.parser import ParsedDay, ParsedSection


class IssueSeverity(Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class IntegrityIssue:
    """Représente une anomalie d'intégrité détectée."""
    date: str
    target: str
    section_id: str
    section_title: str
    severity: IssueSeverity
    code: str
    message: str
    details: Optional[str] = None


@dataclass
class DayIntegrityReport:
    """Rapport d'intégrité pour une journée donnée."""
    date: str
    target: str
    version: str
    lang1: str
    lang2: str
    headline: str
    completeness_score: float
    total_sections: int
    valid_sections: int
    missing_sections: int
    fallback_sections: int
    unresolved_ref_sections: int
    issues: List[IntegrityIssue] = field(default_factory=list)
    status: str = "OK"  # 'OK', 'WARNING', 'ERROR'


class IntegrityChecker:
    """Vérificateur d'intégrité approfondi pour les textes liturgiques."""

    @classmethod
    def analyze_day(cls, day: ParsedDay) -> DayIntegrityReport:
        """Analyse l'intégrité complète d'un jour liturgique."""
        report = DayIntegrityReport(
            date=day.date,
            target=day.target,
            version=day.version,
            lang1=day.lang1,
            lang2=day.lang2,
            headline=day.headline,
            completeness_score=day.completeness_score,
            total_sections=len(day.sections),
            valid_sections=0,
            missing_sections=0,
            fallback_sections=0,
            unresolved_ref_sections=0,
        )

        # 1. Vérification au niveau global du jour
        if day.is_caching_error or any("Erreur" in e or "500" in e for e in day.error_flags):
            report.status = "ERROR"
            for err in day.error_flags:
                report.issues.append(IntegrityIssue(
                    date=day.date,
                    target=day.target,
                    section_id="GLOBAL",
                    section_title="Global Page",
                    severity=IssueSeverity.CRITICAL,
                    code="HTTP_OR_CGI_ERROR",
                    message=err
                ))

        # 2. Analyse détaillée section par section
        for sec in day.sections:
            sec_issues = cls._check_section(day, sec)
            report.issues.extend(sec_issues)

            if sec.is_empty_vern:
                report.missing_sections += 1
            elif sec.is_latin_fallback:
                report.fallback_sections += 1
            elif sec.has_unresolved_refs:
                report.unresolved_ref_sections += 1
            else:
                report.valid_sections += 1

        # 3. Évaluation du statut global
        if report.missing_sections > 0 or any(i.severity == IssueSeverity.CRITICAL for i in report.issues):
            report.status = "ERROR"
        elif report.fallback_sections > 0 or report.unresolved_ref_sections > 0 or report.issues:
            report.status = "WARNING"
        else:
            report.status = "OK"

        return report

    @classmethod
    def _check_section(cls, day: ParsedDay, sec: ParsedSection) -> List[IntegrityIssue]:
        """Vérifie les anomalies sur une section spécifique."""
        issues: List[IntegrityIssue] = []

        title_display = sec.title_vern or sec.title_lat or sec.id

        # A. Texte vernaculaire manquant
        if sec.is_empty_vern and sec.text_lat:
            issues.append(IntegrityIssue(
                date=day.date,
                target=day.target,
                section_id=sec.id,
                section_title=title_display,
                severity=IssueSeverity.CRITICAL,
                code="MISSING_TRANSLATION",
                message=f"La traduction en {day.lang2} est complètement manquante.",
                details=f"Texte latin disponible : {sec.text_lat[:80]}..."
            ))

        # B. Fallback Latin non traduit
        if sec.is_latin_fallback:
            issues.append(IntegrityIssue(
                date=day.date,
                target=day.target,
                section_id=sec.id,
                section_title=title_display,
                severity=IssueSeverity.WARNING,
                code="LATIN_FALLBACK",
                message=f"La section utilise le texte latin par défaut (non traduite en {day.lang2}).",
                details=f"Extrait : {sec.text_vern[:80]}..."
            ))

        # C. Références de macros non résolues (@Commune/..., $Per Dominum, etc.)
        if sec.has_unresolved_refs:
            issues.append(IntegrityIssue(
                date=day.date,
                target=day.target,
                section_id=sec.id,
                section_title=title_display,
                severity=IssueSeverity.WARNING,
                code="UNRESOLVED_REFERENCE",
                message=f"Contient des références ou macros non résolues : {', '.join(sec.unresolved_refs[:3])}",
                details=str(sec.unresolved_refs)
            ))

        # D. Problème de ratio de longueur suspect
        if sec.text_lat and sec.text_vern and not sec.is_empty_vern and not sec.is_latin_fallback:
            w_lat = max(sec.word_count_lat, 1)
            w_vern = max(sec.word_count_vern, 1)
            ratio = w_vern / w_lat
            # Si le texte vernaculaire est anormalement court (< 25% de la longueur latine sur un texte de > 20 mots)
            if w_lat > 20 and ratio < 0.25:
                issues.append(IntegrityIssue(
                    date=day.date,
                    target=day.target,
                    section_id=sec.id,
                    section_title=title_display,
                    severity=IssueSeverity.INFO,
                    code="SUSPICIOUS_SHORT_TEXT",
                    message=f"Texte vernaculaire inhabituellement court par rapport au latin ({w_vern} mots vs {w_lat} mots).",
                    details=f"Ratio: {ratio:.2f}"
                ))

        return issues
