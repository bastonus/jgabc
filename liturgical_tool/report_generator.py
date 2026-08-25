"""Générateur de rapports d'intégrité et Dashboard interactif HTML."""

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from liturgical_tool.config import REPORTS_DIR
from liturgical_tool.parser import ParsedDay
from liturgical_tool.integrity_checker import IntegrityChecker, DayIntegrityReport


class ReportGenerator:
    """Générateur de rapports d'intégrité liturgique."""

    def __init__(self, output_dir: Path = REPORTS_DIR):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_json(self, days: List[ParsedDay], filename: str = "integrity_report.json") -> Path:
        """Exporte l'ensemble des résultats au format JSON."""
        output_path = self.output_dir / filename
        data = []
        for d in days:
            day_dict = asdict(d)
            report = IntegrityChecker.analyze_day(d)
            issues_serialized = []
            for issue in report.issues:
                iss_dict = asdict(issue)
                iss_dict["severity"] = issue.severity.value
                issues_serialized.append(iss_dict)

            day_dict["integrity_report"] = {
                "status": report.status,
                "missing_sections": report.missing_sections,
                "fallback_sections": report.fallback_sections,
                "unresolved_ref_sections": report.unresolved_ref_sections,
                "issues": issues_serialized
            }
            data.append(day_dict)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        return output_path

    def export_markdown(self, days: List[ParsedDay], filename: str = "integrity_report.md") -> Path:
        """Génère un résumé au format Markdown."""
        output_path = self.output_dir / filename

        total_days = len(days)
        if total_days == 0:
            content = "# Rapport d'intégrité liturgique\nAucune donnée analysée.\n"
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)
            return output_path

        avg_score = sum(d.completeness_score for d in days) / total_days
        perfect_days = [d for d in days if d.completeness_score >= 100.0]
        imperfect_days = [d for d in days if d.completeness_score < 100.0]

        lines = [
            "# Rapport d'Intégrité et Comparaison Liturgique",
            f"*Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}*",
            "",
            "## Résumé Global",
            f"- **Nombre de jours analysés** : {total_days}",
            f"- **Taux de complétude moyen** : **{avg_score:.2f}%**",
            f"- **Jours 100% complets** : {len(perfect_days)} ({len(perfect_days)/total_days*100:.1f}%)",
            f"- **Jours avec textes manquants / non traduits** : {len(imperfect_days)} ({len(imperfect_days)/total_days*100:.1f}%)",
            "",
            "## Liste des Jours Présentant des Anomalies",
            "| Date | Fête / Rang | Complétude | Anomalies Détectées |",
            "| :--- | :--- | :---: | :--- |"
        ]

        for d in sorted(imperfect_days, key=lambda x: x.completeness_score):
            errs = "; ".join(d.error_flags[:3]) if d.error_flags else "Sections incomplètes"
            headline_clean = d.headline.replace("|", "/")[:50]
            lines.append(f"| `{d.date}` | {headline_clean} | **{d.completeness_score}%** | {errs} |")

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        return output_path

    def export_html_dashboard(
        self,
        days: List[ParsedDay],
        year: int = 2026,
        lang1: str = "Latin",
        lang2: str = "Francais",
        version: str = "Rubrics 1960",
        filename: str = "liturgical_dashboard.html"
    ) -> Path:
        """Génère un dashboard interactif HTML autonome avec calendrier et comparateur bilingue."""
        output_path = self.output_dir / filename

        total_days = len(days)
        avg_score = (sum(d.completeness_score for d in days) / total_days) if total_days > 0 else 0.0
        perfect_count = sum(1 for d in days if d.completeness_score >= 100.0)
        imperfect_count = total_days - perfect_count

        # Préparation des données JSON pour l'interactivité JS
        days_json_data = []
        for d in days:
            report = IntegrityChecker.analyze_day(d)
            days_json_data.append({
                "date": d.date,
                "target": d.target,
                "version": d.version,
                "headline": d.headline or "Feria / Saint du jour",
                "color": d.liturgical_color or "default",
                "score": d.completeness_score,
                "status": report.status,
                "errors": d.error_flags,
                "sections": [
                    {
                        "id": s.id,
                        "title_lat": s.title_lat or s.id,
                        "title_vern": s.title_vern or s.id,
                        "text_lat": s.text_lat,
                        "text_vern": s.text_vern,
                        "is_empty": s.is_empty_vern,
                        "is_fallback": s.is_latin_fallback,
                        "has_unresolved": s.has_unresolved_refs,
                        "unresolved_refs": s.unresolved_refs
                    } for s in d.sections
                ]
            })

        json_dump_str = json.dumps(days_json_data, ensure_ascii=False)

        html_content = f"""<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard Liturgique & Intégrité Divinum Officium ({year})</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {{
            darkMode: 'class',
            theme: {{
                extend: {{
                    colors: {{
                        liturgical: {{
                            red: '#dc2626',
                            green: '#16a34a',
                            violet: '#7c3aed',
                            white: '#f8fafc',
                            black: '#1e293b',
                            gold: '#ca8a04'
                        }}
                    }}
                }}
            }}
        }}
    </script>
    <style>
        .custom-scrollbar::-webkit-scrollbar {{ width: 6px; height: 6px; }}
        .custom-scrollbar::-webkit-scrollbar-track {{ background: #1e293b; }}
        .custom-scrollbar::-webkit-scrollbar-thumb {{ background: #475569; border-radius: 3px; }}
        .calendar-cell {{ transition: transform 0.15s ease, box-shadow 0.15s ease; }}
        .calendar-cell:hover {{ transform: scale(1.1); z-index: 10; }}
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col font-sans">

    <!-- Header / Navbar -->
    <header class="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-6 py-4 flex flex-wrap items-center justify-between shadow-lg">
        <div class="flex items-center space-x-3">
            <span class="text-2xl">✝</span>
            <div>
                <h1 class="text-xl font-bold tracking-wide text-white">Dashboard d'Intégrité Liturgique</h1>
                <p class="text-xs text-slate-400">Divinum Officium • {lang1} ➔ {lang2} • {version} • Année {year}</p>
            </div>
        </div>
        <div class="flex items-center space-x-3 mt-2 sm:mt-0">
            <input type="text" id="searchInput" placeholder="Rechercher une fête, date, oraison..." 
                   class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-64">
            <button onclick="exportFilteredJSON()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition flex items-center space-x-1">
                <span>⬇ Exporter JSON</span>
            </button>
        </div>
    </header>

    <!-- Main Container -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        <!-- Stat Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jours Analysés</div>
                <div class="text-3xl font-extrabold text-white mt-1">{total_days}</div>
                <div class="text-xs text-slate-500 mt-1">Année liturgique {year}</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taux de Complétude Moyen</div>
                <div class="text-3xl font-extrabold text-emerald-400 mt-1">{avg_score:.1f}%</div>
                <div class="text-xs text-slate-500 mt-1">{lang2} par rapport au Latin</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jours Complets (100%)</div>
                <div class="text-3xl font-extrabold text-emerald-500 mt-1">{perfect_count}</div>
                <div class="text-xs text-slate-500 mt-1">{round(perfect_count/max(total_days,1)*100, 1)}% de couverture totale</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jours avec Manques / Fallback</div>
                <div class="text-3xl font-extrabold text-rose-400 mt-1">{imperfect_count}</div>
                <div class="text-xs text-slate-500 mt-1">À traduire ou compléter</div>
            </div>
        </div>

        <!-- Heatmap Calendar Card -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
            <div class="flex items-center justify-between mb-4">
                <div>
                    <h2 class="text-lg font-bold text-white">Calendrier Annuel d'Intégrité</h2>
                    <p class="text-xs text-slate-400">Cliquez sur n'importe quel jour pour ouvrir l'inspecteur bilingue détaillé</p>
                </div>
                <div class="flex items-center space-x-4 text-xs">
                    <span class="flex items-center space-x-1.5"><span class="w-3 h-3 rounded bg-emerald-500 inline-block"></span><span>100% Traduit</span></span>
                    <span class="flex items-center space-x-1.5"><span class="w-3 h-3 rounded bg-amber-500 inline-block"></span><span>70-99%</span></span>
                    <span class="flex items-center space-x-1.5"><span class="w-3 h-3 rounded bg-rose-600 inline-block"></span><span>&lt;70% ou Erreur</span></span>
                </div>
            </div>
            
            <!-- Calendar Grid (12 months) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" id="calendarGrid">
                <!-- Generated by JS -->
            </div>
        </div>

        <!-- Anomaly & Detail Table -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
            <div class="flex flex-wrap items-center justify-between mb-4 gap-3">
                <div>
                    <h2 class="text-lg font-bold text-white">Liste des Fêtes & Statuts</h2>
                    <p class="text-xs text-slate-400">Tableau filtrable de tous les jours liturgiques</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="setFilter('ALL')" id="btnFilterAll" class="px-3 py-1 text-xs rounded-lg font-medium bg-slate-700 text-white">Tous ({total_days})</button>
                    <button onclick="setFilter('IMPERFECT')" id="btnFilterImperfect" class="px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-400 hover:bg-slate-700">Manques ({imperfect_count})</button>
                    <button onclick="setFilter('PERFECT')" id="btnFilterPerfect" class="px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-400 hover:bg-slate-700">100% OK ({perfect_count})</button>
                </div>
            </div>

            <div class="overflow-x-auto custom-scrollbar max-h-[500px]">
                <table class="w-full text-left text-sm text-slate-300">
                    <thead class="text-xs uppercase bg-slate-800 text-slate-400 sticky top-0 z-10">
                        <tr>
                            <th class="px-4 py-3">Date</th>
                            <th class="px-4 py-3">Fête / Célébration</th>
                            <th class="px-4 py-3 text-center">Score</th>
                            <th class="px-4 py-3">Sections</th>
                            <th class="px-4 py-3">Anomalies Détectées</th>
                            <th class="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody id="daysTableBody" class="divide-y divide-slate-800 font-normal">
                        <!-- Filled by JS -->
                    </tbody>
                </table>
            </div>
        </div>

    </main>

    <!-- Modal Inspector Bilingue -->
    <div id="inspectorModal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            <!-- Modal Header -->
            <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
                <div>
                    <h3 id="modalTitle" class="text-lg font-bold text-white">Date</h3>
                    <p id="modalSubtitle" class="text-xs text-slate-400">Headline</p>
                </div>
                <button onclick="closeModal()" class="text-slate-400 hover:text-white text-2xl font-bold p-1">&times;</button>
            </div>

            <!-- Modal Content (Bilingual Side-by-Side) -->
            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4" id="modalSectionsContainer">
                <!-- Sections dynamically injected -->
            </div>

            <!-- Modal Footer -->
            <div class="px-6 py-3 border-t border-slate-800 bg-slate-850 flex justify-between items-center text-xs text-slate-400">
                <span id="modalMeta">Divinum Officium</span>
                <button onclick="closeModal()" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg">Fermer</button>
            </div>
        </div>
    </div>

    <!-- Data Injection & JavaScript Logic -->
    <script>
        const DAYS_DATA = {json_dump_str};
        let currentFilter = 'ALL';

        function initDashboard() {{
            renderCalendar();
            renderTable();
            setupSearch();
        }}

        function renderCalendar() {{
            const grid = document.getElementById('calendarGrid');
            grid.innerHTML = '';

            const months = [
                'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
            ];

            // Grouper par mois
            const daysByMonth = {{}};
            for (let i = 1; i <= 12; i++) daysByMonth[i] = [];
            
            DAYS_DATA.forEach(d => {{
                const parts = d.date.split('-');
                const m = parseInt(parts[0], 10);
                if (daysByMonth[m]) daysByMonth[m].push(d);
            }});

            for (let m = 1; m <= 12; m++) {{
                const monthDiv = document.createElement('div');
                monthDiv.className = 'bg-slate-950 border border-slate-800/80 rounded-xl p-3';
                
                const mTitle = document.createElement('div');
                mTitle.className = 'text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider';
                mTitle.textContent = months[m - 1];
                monthDiv.appendChild(mTitle);

                const daysGrid = document.createElement('div');
                daysGrid.className = 'grid grid-cols-7 gap-1';

                daysByMonth[m].forEach(d => {{
                    const cell = document.createElement('button');
                    cell.className = 'calendar-cell aspect-square rounded flex items-center justify-center text-[10px] font-bold text-white shadow-xs';
                    
                    const dayNum = parseInt(d.date.split('-')[1], 10);
                    cell.textContent = dayNum;

                    if (d.score >= 100) {{
                        cell.classList.add('bg-emerald-600', 'hover:bg-emerald-500');
                    }} else if (d.score >= 70) {{
                        cell.classList.add('bg-amber-600', 'hover:bg-amber-500');
                    }} else {{
                        cell.classList.add('bg-rose-700', 'hover:bg-rose-600');
                    }}

                    cell.title = `${{d.date}} : ${{d.headline}} (${{d.score}}%)`;
                    cell.onclick = () => openDayInspector(d);

                    daysGrid.appendChild(cell);
                }});

                monthDiv.appendChild(daysGrid);
                grid.appendChild(monthDiv);
            }}
        }}

        function renderTable() {{
            const tbody = document.getElementById('daysTableBody');
            tbody.innerHTML = '';

            const query = document.getElementById('searchInput').value.toLowerCase();

            const filtered = DAYS_DATA.filter(d => {{
                if (currentFilter === 'IMPERFECT' && d.score >= 100) return false;
                if (currentFilter === 'PERFECT' && d.score < 100) return false;
                if (query) {{
                    const matchDate = d.date.toLowerCase().includes(query);
                    const matchHead = d.headline.toLowerCase().includes(query);
                    return matchDate || matchHead;
                }}
                return true;
            }});

            filtered.forEach(d => {{
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-800/50 transition cursor-pointer';
                tr.onclick = () => openDayInspector(d);

                let badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                if (d.score < 70) badgeColor = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
                else if (d.score < 100) badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';

                const errSummary = d.errors && d.errors.length > 0 
                    ? `<span class="text-rose-400">${{d.errors.slice(0, 2).join(', ')}}</span>` 
                    : '<span class="text-slate-500">Aucune anomalie</span>';

                tr.innerHTML = `
                    <td class="px-4 py-3 font-mono text-xs font-semibold text-slate-300">${{d.date}}</td>
                    <td class="px-4 py-3 font-medium text-slate-200">${{d.headline}}</td>
                    <td class="px-4 py-3 text-center">
                        <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${{badgeColor}}">
                            ${{d.score}}%
                        </span>
                    </td>
                    <td class="px-4 py-3 text-xs text-slate-400">${{d.sections ? d.sections.length : 0}} sections</td>
                    <td class="px-4 py-3 text-xs">${{errSummary}}</td>
                    <td class="px-4 py-3 text-right">
                        <button class="text-indigo-400 hover:text-indigo-300 text-xs font-semibold">Inspecter ➔</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }});
        }}

        function setFilter(filterType) {{
            currentFilter = filterType;
            ['btnFilterAll', 'btnFilterImperfect', 'btnFilterPerfect'].forEach(id => {{
                const btn = document.getElementById(id);
                btn.className = 'px-3 py-1 text-xs rounded-lg font-medium bg-slate-800 text-slate-400 hover:bg-slate-700';
            }});

            if (filterType === 'ALL') document.getElementById('btnFilterAll').className = 'px-3 py-1 text-xs rounded-lg font-medium bg-indigo-600 text-white';
            if (filterType === 'IMPERFECT') document.getElementById('btnFilterImperfect').className = 'px-3 py-1 text-xs rounded-lg font-medium bg-rose-600 text-white';
            if (filterType === 'PERFECT') document.getElementById('btnFilterPerfect').className = 'px-3 py-1 text-xs rounded-lg font-medium bg-emerald-600 text-white';

            renderTable();
        }}

        function setupSearch() {{
            document.getElementById('searchInput').addEventListener('input', () => {{
                renderTable();
            }});
        }}

        function openDayInspector(dayData) {{
            document.getElementById('modalTitle').textContent = `${{dayData.date}} • ${{dayData.headline}}`;
            document.getElementById('modalSubtitle').textContent = `Target: ${{dayData.target}} | Version: ${{dayData.version}} | Score: ${{dayData.score}}%`;

            const container = document.getElementById('modalSectionsContainer');
            container.innerHTML = '';

            if (!dayData.sections || dayData.sections.length === 0) {{
                container.innerHTML = '<div class="text-center py-10 text-slate-500">Aucune section liturgique disponible pour ce jour.</div>';
            }} else {{
                dayData.sections.forEach(sec => {{
                    const card = document.createElement('div');
                    card.className = 'bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2';

                    let statusBadge = '';
                    if (sec.is_empty) statusBadge = '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded font-bold">MANQUANT</span>';
                    else if (sec.is_fallback) statusBadge = '<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded font-bold">FALLBACK LATIN</span>';
                    else if (sec.has_unresolved) statusBadge = '<span class="bg-violet-500/20 text-violet-400 border border-violet-500/30 text-[10px] px-2 py-0.5 rounded font-bold">MACRO NON RÉSOLUE</span>';

                    card.innerHTML = `
                        <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div class="flex items-center space-x-2">
                                <span class="text-xs font-bold text-indigo-400 uppercase tracking-wider">${{sec.title_lat}}</span>
                                <span class="text-slate-600">/</span>
                                <span class="text-xs font-semibold text-slate-300">${{sec.title_vern}}</span>
                            </div>
                            <div>${{statusBadge}}</div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800/50">
                                <div class="text-[10px] uppercase font-bold text-slate-500 mb-1">Latin</div>
                                <div class="whitespace-pre-wrap font-serif text-slate-300 leading-relaxed">${{sec.text_lat || '<i>(Vide)</i>'}}</div>
                            </div>
                            <div class="bg-slate-900/80 p-3 rounded-lg border border-slate-800/50">
                                <div class="text-[10px] uppercase font-bold text-slate-500 mb-1">Vernaculaire (${{sec.is_empty ? 'Non traduit' : 'Traduction'}})</div>
                                <div class="whitespace-pre-wrap font-serif text-slate-200 leading-relaxed">${{sec.text_vern || '<span class="text-rose-400 italic">Traduction manquante</span>'}}</div>
                            </div>
                        </div>
                    `;
                    container.appendChild(card);
                }});
            }}

            document.getElementById('inspectorModal').classList.remove('hidden');
        }}

        function closeModal() {{
            document.getElementById('inspectorModal').classList.add('hidden');
        }}

        function exportFilteredJSON() {{
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(DAYS_DATA, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `liturgical_export_${{new Date().toISOString().slice(0,10)}}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }}

        window.onload = initDashboard;
    </script>
</body>
</html>
"""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        return output_path

    def export_multilingual_matrix(
        self,
        summary_data: Dict[str, Dict[str, Any]],
        year: int = 2026,
        domain: str = "missa",
        version: str = "Rubrics 1960"
    ) -> Dict[str, Path]:
        """Génère les rapports comparatifs multilingues (Markdown, JSON, HTML)."""
        # 1. Export JSON
        json_path = self.output_dir / "multilingual_matrix.json"
        json_data = {}
        for k, v in summary_data.items():
            json_data[k] = {
                "language": v["language"],
                "label": v["label"],
                "total_days": v["total_days"],
                "avg_completeness": v["avg_completeness"],
                "perfect_days": v["perfect_days"],
                "imperfect_days": v["imperfect_days"],
                "missing_rate_pct": v["missing_rate_pct"],
                "top_errors": v["top_errors"],
            }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)

        # 2. Export Markdown
        md_path = self.output_dir / "multilingual_matrix.md"
        sorted_langs = sorted(summary_data.values(), key=lambda x: x["avg_completeness"], reverse=True)

        lines = [
            f"# Matrice d'Intégrité Multilingue Liturgique ({year})",
            f"*Domaine : {domain.upper()} • Version : {version} • Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}*",
            "",
            "## Classement par Taux de Complétude des Traductions",
            "",
            "| Rang | Langue | Code | Complétude Moyenne | Jours 100% OK | Jours Incomplets | Statut Global |",
            "| :---: | :--- | :---: | :---: | :---: | :---: | :--- |"
        ]

        for idx, item in enumerate(sorted_langs, 1):
            score = item["avg_completeness"]
            status = "🟢 Excellent" if score >= 90 else ("🟡 Partiel" if score >= 60 else "🔴 Faible")
            lines.append(
                f"| {idx} | **{item['label']}** | `{item['language']}` | **{score:.2f}%** | {item['perfect_days']}/{item['total_days']} | {item['imperfect_days']} | {status} |"
            )

        lines.extend([
            "",
            "## Détail des Principales Sections Manquantes par Langue",
            ""
        ])

        for item in sorted_langs:
            lines.append(f"### {item['label']} (`{item['language']}` - {item['avg_completeness']}%)")
            if item["top_errors"]:
                for err, count in item["top_errors"]:
                    lines.append(f"- **{count} fois** : {err}")
            else:
                lines.append("- *Aucune anomalie détectée (Couverture 100%).*")
            lines.append("")

        with open(md_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        # 3. Export HTML Dashboard Multilingue
        html_path = self.output_dir / "multilingual_dashboard.html"
        rows_html = ""
        for idx, item in enumerate(sorted_langs, 1):
            score = item["avg_completeness"]
            bar_color = "bg-emerald-500" if score >= 90 else ("bg-amber-500" if score >= 60 else "bg-rose-500")
            badge_color = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" if score >= 90 else (
                "bg-amber-500/20 text-amber-400 border-amber-500/30" if score >= 60 else "bg-rose-500/20 text-rose-400 border-rose-500/30"
            )
            top_err_str = ", ".join([f"{e[0]} ({e[1]}x)" for e in item["top_errors"][:2]]) if item["top_errors"] else "Aucune anomalie"

            rows_html += f"""
            <tr class="hover:bg-slate-800/60 transition">
                <td class="px-4 py-3 font-bold text-slate-400 text-center">{idx}</td>
                <td class="px-4 py-3 font-semibold text-white">{item['label']} <span class="text-xs text-slate-500 font-mono">({item['language']})</span></td>
                <td class="px-4 py-3">
                    <div class="flex items-center space-x-3">
                        <div class="w-32 bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div class="{bar_color} h-2 rounded-full" style="width: {score}%"></div>
                        </div>
                        <span class="text-xs font-bold font-mono text-slate-200">{score:.1f}%</span>
                    </div>
                </td>
                <td class="px-4 py-3 text-center text-xs font-semibold text-emerald-400">{item['perfect_days']}</td>
                <td class="px-4 py-3 text-center text-xs font-semibold text-rose-400">{item['imperfect_days']}</td>
                <td class="px-4 py-3 text-xs text-slate-400">{top_err_str}</td>
            </tr>
            """

        html_content = f"""<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Matrice d'Intégrité Multilingue Divinum Officium ({year})</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-8 font-sans">
    <div class="max-w-6xl mx-auto space-y-8">
        <header class="border-b border-slate-800 pb-5 flex flex-wrap items-center justify-between">
            <div>
                <h1 class="text-2xl font-bold text-white tracking-wide">✝ Matrice d'Intégrité Multilingue Liturgique</h1>
                <p class="text-sm text-slate-400">Divinum Officium • Comparaison de toutes les langues • Année {year} • {version}</p>
            </div>
            <div class="mt-2 sm:mt-0 text-xs text-slate-500 font-mono">
                Généré le {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}
            </div>
        </header>

        <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 class="text-lg font-bold text-white mb-4">Classement & Couverture de Toutes les Langues</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm text-slate-300">
                    <thead class="text-xs uppercase bg-slate-800 text-slate-400">
                        <tr>
                            <th class="px-4 py-3 text-center">Rang</th>
                            <th class="px-4 py-3">Langue</th>
                            <th class="px-4 py-3">Complétude</th>
                            <th class="px-4 py-3 text-center">Jours Complets</th>
                            <th class="px-4 py-3 text-center">Jours Incomplets</th>
                            <th class="px-4 py-3">Principales Anomalies</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800 font-normal">
                        {rows_html}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</body>
</html>
"""
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        return {"json": json_path, "markdown": md_path, "html": html_path}

