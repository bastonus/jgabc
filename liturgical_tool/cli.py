"""Interface en ligne de commande (CLI) pour liturgical_tool."""

import argparse
import sys
import webbrowser
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

# Configuration de l'encodage UTF-8 pour la console Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from liturgical_tool.config import (
    VERSIONS,
    LANGUAGES,
    CANONICAL_HOURS,
    DEFAULT_VERSION,
    DEFAULT_LANG1,
    DEFAULT_LANG2,
    REPORTS_DIR,
)
from liturgical_tool.scraper import DivinumScraper
from liturgical_tool.local_db_engine import LocalDatabaseEngine
from liturgical_tool.integrity_checker import IntegrityChecker
from liturgical_tool.comparator import LiturgicalComparator
from liturgical_tool.database_downloader import DatabaseDownloader
from liturgical_tool.report_generator import ReportGenerator
from liturgical_tool.parser import ParsedDay


def parse_date_arg(date_str: str) -> datetime:
    """Parse une date sous format MM-DD-YYYY ou YYYY-MM-DD."""
    date_str = date_str.replace("/", "-")
    parts = date_str.split("-")
    if len(parts) == 3:
        if len(parts[0]) == 4:  # YYYY-MM-DD
            return datetime(int(parts[0]), int(parts[1]), int(parts[2]))
        elif len(parts[2]) == 4:  # MM-DD-YYYY
            return datetime(int(parts[2]), int(parts[0]), int(parts[1]))
    raise ValueError(f"Format de date non reconnu: {date_str} (utilisez YYYY-MM-DD ou MM-DD-YYYY)")


def cmd_check(args: argparse.Namespace) -> None:
    """Commande de vérification d'intégrité et de complétude."""
    rubrics_flag = not args.no_rubrics
    solemn_flag = args.solemn
    engine = LocalDatabaseEngine()
    rep_gen = ReportGenerator()

    # 1. Mode d'analyse globale de TOUTES les langues
    if args.all_languages:
        print(f"\n[*] Lancement de l'analyse d'integrite sur TOUTES les langues ({len(LANGUAGES)-1} langues)...")
        print(f"   • Version / Rubriques : {args.version}")
        print(f"   • Annee : {args.year}")
        print(f"   • Cible : {args.target}")
        print(f"   • Rubriques incluses : {'Oui' if rubrics_flag else 'Non'} | Solennel : {'Oui' if solemn_flag else 'Non'}")

        summary = engine.scan_all_languages(year=args.year, domain=args.target, version=args.version)
        reports = rep_gen.export_multilingual_matrix(summary, year=args.year, domain=args.target, version=args.version)

        print("\n[+] Resultats de la couverture par langue :")
        sorted_summary = sorted(summary.values(), key=lambda x: x["avg_completeness"], reverse=True)
        for idx, item in enumerate(sorted_summary, 1):
            bar = "█" * int(item["avg_completeness"] / 5)
            print(f"   {idx:2d}. {item['label']:<20} ({item['language']:<10}) : {item['avg_completeness']:6.2f}% |{bar:<20}| (Complets: {item['perfect_days']}/{item['total_days']})")

        print(f"\n📁 Rapports multilingues generes avec succes :")
        print(f"   • JSON : {reports['json']}")
        print(f"   • Markdown : {reports['markdown']}")
        print(f"   • Dashboard HTML : {reports['html']}")

        if args.open:
            print("[*] Ouverture de la matrice HTML dans le navigateur...")
            webbrowser.open(f"file://{reports['html'].resolve()}")
        return

    # 2. Analyse pour une langue spécifique
    print(f"\n[*] Lancement de la verification d'integrite [{args.mode.upper()}]...")
    print(f"   • Version / Rubriques : {args.version}")
    print(f"   • Langues : {args.lang1} -> {args.lang2}")
    print(f"   • Cible : {args.target}")
    print(f"   • Rubriques : {'Incluses' if rubrics_flag else 'Masquees'} | Solennel : {'Oui' if solemn_flag else 'Non'}")

    days: List[ParsedDay] = []
    scraper = DivinumScraper(cache_enabled=not args.no_cache)

    if args.date:
        dt = parse_date_arg(args.date)
        date_str = dt.strftime("%m-%d-%Y")
        if args.mode == "local":
            res = engine.check_day_local(dt, domain=args.target, lang1=args.lang1, lang2=args.lang2, version=args.version, rubrics=rubrics_flag)
            days = [res]
        else:
            print(f"   • Scraping live de la date {date_str}...")
            res = scraper.fetch_single(
                date_str=date_str,
                target=args.target,
                version=args.version,
                lang1=args.lang1,
                lang2=args.lang2,
                rubrics=rubrics_flag,
                solemn=solemn_flag,
                force_refresh=args.force_refresh
            )
            days = [res]
    else:
        year = args.year or datetime.now().year
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)

        if args.start_date and args.end_date:
            start_date = parse_date_arg(args.start_date)
            end_date = parse_date_arg(args.end_date)

        print(f"   • Periode : du {start_date.strftime('%d/%m/%Y')} au {end_date.strftime('%d/%m/%Y')}")

        if args.mode == "local":
            print("   • Analyse rapide de la base locale...")
            current = start_date
            while current <= end_date:
                res = engine.check_day_local(current, domain=args.target, lang1=args.lang1, lang2=args.lang2, version=args.version, rubrics=rubrics_flag)
                days.append(res)
                current += timedelta(days=1)
        else:
            print("   • Lancement du scraper live avec ThreadPool...")
            def progress(done, total):
                sys.stdout.write(f"\r     Progression : {done}/{total} jours recuperes ({(done/total)*100:.1f}%)")
                sys.stdout.flush()

            days = scraper.fetch_date_range(
                start_date=start_date,
                end_date=end_date,
                targets=[args.target],
                version=args.version,
                lang1=args.lang1,
                lang2=args.lang2,
                rubrics=rubrics_flag,
                solemn=solemn_flag,
                max_workers=args.workers,
                force_refresh=args.force_refresh,
                progress_callback=progress
            )
            print()

    # Analyse d'intégrité
    total = len(days)
    if total == 0:
        print("[!] Aucun jour analyse.")
        return

    avg_score = sum(d.completeness_score for d in days) / total
    perfect = [d for d in days if d.completeness_score >= 100.0]
    imperfect = [d for d in days if d.completeness_score < 100.0]

    print(f"\n[+] Resultats de l'analyse :")
    print(f"   • Total jours analyses : {total}")
    print(f"   • Taux de completude moyen : {avg_score:.2f}%")
    print(f"   • Jours complets a 100% : {len(perfect)} ({len(perfect)/total*100:.1f}%)")
    print(f"   • Jours avec manques : {len(imperfect)} ({len(imperfect)/total*100:.1f}%)")

    if imperfect:
        print("\n[!] Exemples d'anomalies detectees :")
        for d in imperfect[:5]:
            print(f"   - {d.date} ({d.headline[:40]}...) : {d.completeness_score}% -> {'; '.join(d.error_flags[:2])}")

    # Génération des rapports
    json_path = rep_gen.export_json(days)
    md_path = rep_gen.export_markdown(days)
    html_path = rep_gen.export_html_dashboard(
        days=days,
        year=args.year or datetime.now().year,
        lang1=args.lang1,
        lang2=args.lang2,
        version=args.version
    )

    print(f"\n[+] Rapports generes avec succes :")
    print(f"   • JSON : {json_path}")
    print(f"   • Markdown : {md_path}")
    print(f"   • Dashboard HTML : {html_path}")

    if args.open:
        print("[*] Ouverture du Dashboard HTML dans le navigateur...")
        webbrowser.open(f"file://{html_path.resolve()}")


def cmd_diff(args: argparse.Namespace) -> None:
    """Commande de comparaison multidimensionnelle."""
    if not args.date:
        print("[!] L'argument --date est requis pour la comparaison.")
        return

    dt = parse_date_arg(args.date)
    date_str = dt.strftime("%m-%d-%Y")
    rubrics_flag = not args.no_rubrics
    solemn_flag = args.solemn

    print(f"\n[*] Comparaison pour la date : {date_str}")

    engine = LocalDatabaseEngine()
    scraper = DivinumScraper()

    if args.mode == "live-vs-local":
        print("   • Source A: Live DivinumOfficium.com")
        day_a = scraper.fetch_single(date_str, target=args.target, version=args.version, lang1=args.lang1, lang2=args.lang2, rubrics=rubrics_flag, solemn=solemn_flag)
        print("   • Source B: Donnees locales (do_source/do_data)")
        day_b = engine.check_day_local(dt, domain=args.target, lang1=args.lang1, lang2=args.lang2, version=args.version, rubrics=rubrics_flag)
        diff_res = LiturgicalComparator.compare_days(day_a, day_b, label_a="Live Web", label_b="Local Files")
    elif args.mode == "version-vs-version":
        ver_b = args.version_b or "Tridentine - 1570"
        print(f"   • Version A: {args.version}")
        day_a = scraper.fetch_single(date_str, target=args.target, version=args.version, lang1=args.lang1, lang2=args.lang2, rubrics=rubrics_flag, solemn=solemn_flag)
        print(f"   • Version B: {ver_b}")
        day_b = scraper.fetch_single(date_str, target=args.target, version=ver_b, lang1=args.lang1, lang2=args.lang2, rubrics=rubrics_flag, solemn=solemn_flag)
        diff_res = LiturgicalComparator.compare_days(day_a, day_b, label_a=args.version, label_b=ver_b)
    else:
        # lang vs lang
        lang_b = args.lang_b or "English"
        print(f"   • Langue A: {args.lang2}")
        day_a = scraper.fetch_single(date_str, target=args.target, version=args.version, lang1=args.lang1, lang2=args.lang2, rubrics=rubrics_flag, solemn=solemn_flag)
        print(f"   • Langue B: {lang_b}")
        day_b = scraper.fetch_single(date_str, target=args.target, version=args.version, lang1=args.lang1, lang2=lang_b, rubrics=rubrics_flag, solemn=solemn_flag)
        diff_res = LiturgicalComparator.compare_days(day_a, day_b, label_a=args.lang2, label_b=lang_b)

    print(f"\n[+] Resultat du Diff : Taux de similarite = {diff_res.match_percentage}%")
    print(f"   • Fete A : {diff_res.headline_a}")
    print(f"   • Fete B : {diff_res.headline_b}")
    print(f"   • Sections modifiees / divergentes : {diff_res.modified_sections_count}")

    for sec in diff_res.sections_diff:
        if sec.status != "IDENTICAL":
            print(f"\n   [Diff] Section '{sec.section_id}' -> Statut: {sec.status} (Similarite: {sec.similarity*100:.1f}%)")
            if sec.diff_unified:
                print("   " + "\n   ".join(sec.diff_unified.splitlines()[:6]))


def cmd_download_db(args: argparse.Namespace) -> None:
    """Commande de téléchargement et mise à jour des bases externes."""
    downloader = DatabaseDownloader()

    if args.list:
        print("\n[+] Etat des Bases de Donnees Liturgiques :")
        dbs = downloader.list_available_databases()
        for db in dbs:
            status_str = "[OK] Installee" if db["present"] else "[--] Non telechargee"
            print(f"   • [{db['key']}] {db['name']} : {status_str} ({db['size_mb']} Mo, {db.get('file_count', 0)} fichiers)")
            print(f"     Description : {db['description']}")
            print(f"     Chemin : {db['path']}")
        return

    print("\n[*] Telechargement et synchronisation des bases de donnees...")
    def prog(msg):
        print(f"   • {msg}")

    if args.name:
        if args.name in downloader.REPOSITORIES:
            info = downloader.REPOSITORIES[args.name]
            if info["type"] == "git":
                res = downloader.sync_git_repo(args.name, prog)
            else:
                res = downloader.download_direct_file(args.name, prog)
            print(f"   Statut : {res.get('status')} - {res.get('name')}")
        else:
            print(f"[!] Nom de base inconnu: {args.name}. Utilisez --list pour voir les choix.")
    else:
        # Télécharger toutes
        results = downloader.download_all(prog)
        print("\n[+] Resume des telechargements :")
        for r in results:
            print(f"   • {r.get('name')} : {r.get('status')} {r.get('message', '')}")


def main() -> None:
    """Point d'entrée principal de la CLI."""
    parser = argparse.ArgumentParser(
        prog="liturgical_tool",
        description="Outil de scraping, comparaison multilingue et integrite liturgique Divinum Officium."
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Sous-commandes disponibles")

    # 1. Sous-commande 'check'
    p_check = subparsers.add_parser("check", help="Verifier l'integrite et la completude des textes")
    p_check.add_argument("--year", type=int, default=2026, help="Annee a analyser (ex: 2026)")
    p_check.add_argument("--date", type=str, help="Date unique a analyser (MM-DD-YYYY ou YYYY-MM-DD)")
    p_check.add_argument("--start-date", type=str, help="Date de debut (YYYY-MM-DD)")
    p_check.add_argument("--end-date", type=str, help="Date de fin (YYYY-MM-DD)")
    p_check.add_argument("--version", type=str, default=DEFAULT_VERSION, choices=VERSIONS, help="Version / Rubrique liturgique")
    p_check.add_argument("--lang1", type=str, default=DEFAULT_LANG1, help="Langue 1 (reference, defaut: Latin)")
    p_check.add_argument("--lang2", type=str, default=DEFAULT_LANG2, help="Langue 2 (cible, defaut: Francais)")
    p_check.add_argument("--all-languages", action="store_true", help="Analyser TOUTES les langues disponibles pour l'annee entiere")
    p_check.add_argument("--target", type=str, default="missa", help="Cible ('missa', 'Laudes', 'Vespera', etc.)")
    p_check.add_argument("--mode", type=str, default="local", choices=["local", "live"], help="Mode d'analyse ('local' = fichiers locaux rapide, 'live' = scraper web)")
    p_check.add_argument("--no-rubrics", action="store_true", help="Exclure les rubriques d'instruction rouge")
    p_check.add_argument("--solemn", action="store_true", help="Activer le mode messe solennelle")
    p_check.add_argument("--workers", type=int, default=3, help="Nombre de workers paralleles pour le scraper")
    p_check.add_argument("--force-refresh", action="store_true", help="Ignorer le cache SQLite et forcer la requete reseau")
    p_check.add_argument("--no-cache", action="store_true", help="Desactiver le cache SQLite")
    p_check.add_argument("--open", action="store_true", help="Ouvrir automatiquement le dashboard HTML apres generation")

    # 2. Sous-commande 'diff'
    p_diff = subparsers.add_parser("diff", help="Comparer deux sources, versions ou langues")
    p_diff.add_argument("--date", type=str, required=True, help="Date a comparer (MM-DD-YYYY ou YYYY-MM-DD)")
    p_diff.add_argument("--mode", type=str, default="live-vs-local", choices=["live-vs-local", "version-vs-version", "lang-vs-lang"], help="Type de comparaison")
    p_diff.add_argument("--version", type=str, default=DEFAULT_VERSION, help="Version A")
    p_diff.add_argument("--version-b", type=str, help="Version B (pour mode version-vs-version)")
    p_diff.add_argument("--lang1", type=str, default=DEFAULT_LANG1, help="Langue de base (Latin)")
    p_diff.add_argument("--lang2", type=str, default=DEFAULT_LANG2, help="Langue A")
    p_diff.add_argument("--lang-b", type=str, help="Langue B (pour mode lang-vs-lang)")
    p_diff.add_argument("--target", type=str, default="missa", help="Cible ('missa', 'Laudes', etc.)")
    p_diff.add_argument("--no-rubrics", action="store_true", help="Exclure les rubriques d'instruction")
    p_diff.add_argument("--solemn", action="store_true", help="Activer le mode messe solennelle")

    # 3. Sous-commande 'download-db'
    p_dl = subparsers.add_parser("download-db", help="Telecharger et mettre a jour les bases de donnees externes")
    p_dl.add_argument("--all", action="store_true", help="Telecharger toutes les bases")
    p_dl.add_argument("--name", type=str, help="Telecharger une base specifique (divinum_officium, gregobase, vulgate_local, douay_rheims_local)")
    p_dl.add_argument("--list", action="store_true", help="Lister l'etat des bases disponibles")

    args = parser.parse_args()

    if args.subcommand == "check":
        cmd_check(args)
    elif args.subcommand == "diff":
        cmd_diff(args)
    elif args.subcommand == "download-db":
        cmd_download_db(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
