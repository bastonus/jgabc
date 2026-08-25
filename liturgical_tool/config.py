"""Configuration et constantes pour liturgical_tool."""

import os
from pathlib import Path

# Chemins de base du projet
BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DB_PATH = BASE_DIR / "liturgical_cache.db"
LOCAL_DO_SOURCE_DIR = BASE_DIR / "do_source" / "web" / "www"
LOCAL_DO_DATA_DIR = BASE_DIR / "do_data"
REPORTS_DIR = BASE_DIR / "liturgical_reports"
DOWNLOADS_DIR = BASE_DIR / "liturgical_downloads"

# Endpoints Divinum Officium
BASE_URL_MISSA = "https://www.divinumofficium.com/cgi-bin/missa/missa.pl"
BASE_URL_HORAS = "https://www.divinumofficium.com/cgi-bin/horas/officium.pl"

# Rubriques / Versions liturgiques supportées (15 versions)
VERSIONS = [
    "Rubrics 1960 - 1960",
    "Rubrics 1960 - 2020 USA",
    "Divino Afflatu - 1939",
    "Divino Afflatu - 1954",
    "Reduced - 1955",
    "Tridentine - 1570",
    "Tridentine - 1888",
    "Tridentine - 1906",
    "Monastic - 1617",
    "Monastic - 1930",
    "Monastic - 1963",
    "Monastic - 1963 - Barroux",
    "Ordo Cisterciensis - 1951",
    "Ordo Cisterciensis - Abbatia B.M.V. de Altovado",
    "Ordo Praedicatorum - 1962",
]

DEFAULT_VERSION = "Rubrics 1960 - 1960"

# Langues disponibles complètes (20 langues et variantes)
LANGUAGES = {
    "Latin": {"code": "la", "label": "Latin (Original)"},
    "Francais": {"code": "fr", "label": "Français"},
    "English": {"code": "en", "label": "English"},
    "Espanol": {"code": "es", "label": "Español"},
    "Italiano": {"code": "it", "label": "Italiano"},
    "Deutsch": {"code": "de", "label": "Deutsch"},
    "Polski": {"code": "pl", "label": "Polski"},
    "Polski-Newer": {"code": "pl-new", "label": "Polski (Nouveau)"},
    "Magyar": {"code": "hu", "label": "Magyar"},
    "Magyar-Kaldi": {"code": "hu-kal", "label": "Magyar (Káldi)"},
    "Bohemice": {"code": "cs", "label": "Česky (Bohemice)"},
    "Cesky-Schaller": {"code": "cs-sch", "label": "Česky (Schaller)"},
    "Portugues": {"code": "pt", "label": "Português"},
    "Dansk": {"code": "da", "label": "Dansk"},
    "Nederlands": {"code": "nl", "label": "Nederlands"},
    "Ukrainian": {"code": "uk", "label": "Українська"},
    "Vietnamice": {"code": "vi", "label": "Tiếng Việt"},
    "Latin-Bea": {"code": "la-bea", "label": "Latin (Psautier Bea)"},
    "Latin-gabc": {"code": "la-gabc", "label": "Latin (Notations GABC)"},
}

DEFAULT_LANG1 = "Latin"
DEFAULT_LANG2 = "Francais"

# Heures canoniques de l'Office
CANONICAL_HOURS = [
    "Matutinum",
    "Laudes",
    "Prima",
    "Tertia",
    "Sexta",
    "Nona",
    "Vespera",
    "Completorium",
]

# Commandes de la Messe
MISSA_COMMANDS = {
    "SanctaMissa": "Messe Complète",
    "Propers": "Propres de la Messe",
}

# Parties principales des Propres de la Messe
MISSA_PROPER_PARTS = [
    "Introitus",
    "Oratio",
    "Lectio",
    "Graduale",
    "Tractus",
    "Alleluia",
    "Sequentia",
    "Evangelium",
    "Offertorium",
    "Secreta",
    "Communio",
    "Postcommunio",
]

# Configuration du Scraper HTTP
HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3",
    "Connection": "keep-alive",
}

REQUEST_TIMEOUT_SECONDS = 25
MAX_RETRIES = 3
RETRY_BACKOFF_FACTOR = 1.5
DEFAULT_REQUEST_DELAY = 0.5
MAX_CONCURRENT_WORKERS = 4
