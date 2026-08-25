"""Scraper HTTP haute performance avec gestion de session, cache SQLite persistant et pool concurrent."""

import hashlib
import sqlite3
import subprocess
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from liturgical_tool.config import (
    BASE_URL_MISSA,
    BASE_URL_HORAS,
    CACHE_DB_PATH,
    HTTP_HEADERS,
    REQUEST_TIMEOUT_SECONDS,
    DEFAULT_REQUEST_DELAY,
    DEFAULT_VERSION,
    DEFAULT_LANG1,
    DEFAULT_LANG2,
)
from liturgical_tool.parser import DivinumHtmlParser, ParsedDay


class CacheManager:
    """Gestionnaire de cache SQLite pour stocker les réponses HTML brutes."""

    def __init__(self, db_path: Path = CACHE_DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.db_path), timeout=30.0)

    def _init_db(self) -> None:
        """Initialise la table de cache si elle n'existe pas."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS page_cache (
                    cache_key TEXT PRIMARY KEY,
                    date_str TEXT,
                    target TEXT,
                    version TEXT,
                    lang1 TEXT,
                    lang2 TEXT,
                    rubrics INTEGER,
                    solemn INTEGER,
                    url TEXT,
                    status_code INTEGER,
                    html_content TEXT,
                    fetched_at TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_date_target ON page_cache(date_str, target, version);")
            conn.commit()

    @staticmethod
    def generate_key(date_str: str, target: str, version: str, lang1: str, lang2: str, rubrics: bool = True, solemn: bool = False) -> str:
        raw = f"{date_str}|{target}|{version}|{lang1}|{lang2}|rubrics={1 if rubrics else 0}|solemn={1 if solemn else 0}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Récupère une entrée du cache."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT date_str, target, version, lang1, lang2, status_code, html_content, fetched_at FROM page_cache WHERE cache_key = ?",
                (key,)
            )
            row = cursor.fetchone()
            if row:
                return {
                    "date_str": row[0],
                    "target": row[1],
                    "version": row[2],
                    "lang1": row[3],
                    "lang2": row[4],
                    "status_code": row[5],
                    "html_content": row[6],
                    "fetched_at": row[7]
                }
        return None

    def set(
        self,
        key: str,
        date_str: str,
        target: str,
        version: str,
        lang1: str,
        lang2: str,
        url: str,
        status_code: int,
        html_content: str,
        rubrics: bool = True,
        solemn: bool = False
    ) -> None:
        """Enregistre une entrée dans le cache."""
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO page_cache 
                (cache_key, date_str, target, version, lang1, lang2, rubrics, solemn, url, status_code, html_content, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                key, date_str, target, version, lang1, lang2, 1 if rubrics else 0, 1 if solemn else 0, url, status_code, html_content, datetime.now().isoformat()
            ))
            conn.commit()

    def clear(self) -> int:
        """Vide le cache."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM page_cache")
            count = cursor.rowcount
            conn.commit()
            return count


class DivinumScraper:
    """Scraper résilient pour missa.pl et officium.pl avec gestion de cache et fallback curl."""

    def __init__(
        self,
        cache_enabled: bool = True,
        request_delay: float = DEFAULT_REQUEST_DELAY,
        timeout: int = REQUEST_TIMEOUT_SECONDS
    ):
        self.cache_enabled = cache_enabled
        self.request_delay = request_delay
        self.timeout = timeout
        self.cache = CacheManager() if cache_enabled else None

    def _build_url_and_params(
        self,
        date_str: str,
        target: str,
        version: str,
        lang1: str,
        lang2: str,
        rubrics: bool = True,
        solemn: bool = False
    ) -> Tuple[str, Dict[str, str]]:
        """Construit l'URL et les paramètres selon la cible (missa ou heure de l'office)."""
        formatted_date = self._normalize_date(date_str)

        if target.lower() in ["missa", "sanctamissa", "propers"]:
            base_url = BASE_URL_MISSA
            command = "praySanctaMissa"
            params = {
                "date": formatted_date,
                "version": version,
                "lang1": lang1,
                "lang2": lang2,
                "rubrics": "1" if rubrics else "0",
                "solemn": "1" if solemn else "0",
                "command": command,
            }
            if target.lower() == "propers":
                params["Propers"] = "1"
        else:
            base_url = BASE_URL_HORAS
            hora_cmd = f"pray{target.capitalize()}"
            params = {
                "date": formatted_date,
                "version": version,
                "lang1": lang1,
                "lang2": lang2,
                "rubrics": "1" if rubrics else "0",
                "command": hora_cmd,
            }

        return base_url, params

    @staticmethod
    def _normalize_date(date_str: str) -> str:
        """Convertit YYYY-MM-DD en MM-DD-YYYY si nécessaire."""
        date_str = date_str.replace("/", "-")
        parts = date_str.split("-")
        if len(parts) == 3:
            if len(parts[0]) == 4:  # YYYY-MM-DD
                return f"{int(parts[1]):02d}-{int(parts[2]):02d}-{parts[0]}"
            elif len(parts[2]) == 4:  # MM-DD-YYYY
                return f"{int(parts[0]):02d}-{int(parts[1]):02d}-{parts[2]}"
        return date_str

    def _fetch_url_curl(self, full_url: str) -> Tuple[int, str]:
        """Utilise curl.exe natif pour une performance et compatibilité optimales."""
        cmd = [
            "curl.exe", "-s", "-S",
            "-A", HTTP_HEADERS["User-Agent"],
            "-H", "Accept-Language: fr,fr-FR;q=0.8,en;q=0.5",
            "--max-time", str(self.timeout),
            full_url
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if res.returncode == 0 and len(res.stdout) > 200:
                return 200, res.stdout
            return 500, res.stderr or res.stdout
        except Exception:
            try:
                r = requests.get(full_url, headers=HTTP_HEADERS, timeout=self.timeout)
                return r.status_code, r.text
            except Exception as e:
                return 500, str(e)

    def fetch_single(
        self,
        date_str: str,
        target: str = "missa",
        version: str = DEFAULT_VERSION,
        lang1: str = DEFAULT_LANG1,
        lang2: str = DEFAULT_LANG2,
        rubrics: bool = True,
        solemn: bool = False,
        force_refresh: bool = False
    ) -> ParsedDay:
        """Récupère et parse un jour spécifique."""
        cache_key = CacheManager.generate_key(date_str, target, version, lang1, lang2, rubrics, solemn)

        # 1. Vérification dans le cache
        if self.cache and not force_refresh:
            cached = self.cache.get(cache_key)
            if cached and cached["status_code"] == 200:
                return DivinumHtmlParser.parse_html(
                    html_content=cached["html_content"],
                    date=date_str,
                    target=target,
                    version=version,
                    lang1=lang1,
                    lang2=lang2
                )

        # 2. Requête réseau
        base_url, params = self._build_url_and_params(date_str, target, version, lang1, lang2, rubrics, solemn)
        full_url = f"{base_url}?{urllib.parse.urlencode(params)}"

        status_code, html_content = self._fetch_url_curl(full_url)

        # 3. Sauvegarde dans le cache si succès
        if status_code == 200 and html_content and len(html_content) > 300 and self.cache:
            self.cache.set(
                key=cache_key,
                date_str=date_str,
                target=target,
                version=version,
                lang1=lang1,
                lang2=lang2,
                url=full_url,
                status_code=status_code,
                html_content=html_content,
                rubrics=rubrics,
                solemn=solemn
            )

        # 4. Parsing et renvoi
        parsed = DivinumHtmlParser.parse_html(
            html_content=html_content,
            date=date_str,
            target=target,
            version=version,
            lang1=lang1,
            lang2=lang2
        )

        if status_code != 200:
            parsed.error_flags.append(f"Erreur HTTP {status_code}")

        return parsed

    def fetch_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        targets: List[str] = None,
        version: str = DEFAULT_VERSION,
        lang1: str = DEFAULT_LANG1,
        lang2: str = DEFAULT_LANG2,
        rubrics: bool = True,
        solemn: bool = False,
        max_workers: int = 3,
        force_refresh: bool = False,
        progress_callback: Any = None
    ) -> List[ParsedDay]:
        """Scrape une plage de dates pour les cibles spécifiées avec ThreadPoolExecutor."""
        if targets is None:
            targets = ["missa"]

        tasks = []
        current = start_date
        while current <= end_date:
            date_str = current.strftime("%m-%d-%Y")
            for target in targets:
                tasks.append((date_str, target, version, lang1, lang2, rubrics, solemn, force_refresh))
            current += timedelta(days=1)

        results: List[ParsedDay] = []
        total = len(tasks)
        completed = 0

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(
                    self.fetch_single,
                    t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7]
                ): t for t in tasks
            }

            for future in as_completed(future_to_task):
                completed += 1
                try:
                    res = future.result()
                    results.append(res)
                except Exception as e:
                    task_info = future_to_task[future]
                    err_day = ParsedDay(
                        date=task_info[0],
                        target=task_info[1],
                        version=task_info[2],
                        lang1=task_info[3],
                        lang2=task_info[4],
                        completeness_score=0.0
                    )
                    err_day.error_flags.append(f"Exception non gérée: {e}")
                    results.append(err_day)

                if progress_callback:
                    progress_callback(completed, total)

        return sorted(results, key=lambda d: (d.date, d.target))
