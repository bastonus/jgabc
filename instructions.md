# Problème :


### **Modification de l'affichage des psaumes dans propers.html**  

  - Introit  
  - Graduel  
  - Tract  
  - Offertoire  
  - Communion  

Nous allons mettre à jour l'intégration de leur traduction. En effet j'ai ajouté le repo github qui permet d'affuicher la messe et ses prières. Il s'agira de mettre à jour ces traductions pour qu'elles ne soient plus prises dans 'Psalmi' mais directement dans les fichiers de ce repo au bon jour. Analyse donc ou trouver ces prières dans le repo et comment sont implémentées les réferances des dates dans divinum officium tout comme dans propers.html. Ensuite donne une solution comlplète très réflechie qui prend  en compte ces modifications.
Analyse et réfléchis bien comment tu vas gérer la traduction des dates, en obesrvant leur format de chaque coté des, a la fois dans propers.html et dans divinum officium. Aussi réflechis a créer un scraper en python qui permet de télacharger depuis divinum officium pour que tout soit hors ligne et au bon format. 

# Solution :

1. Une analyse détaillée des formats de dates dans les deux systèmes
2. Les scripts nécessaires (Python pour le scraper, JavaScript pour l'intégration)
3. Des explications complètes sur chaque partie de la solution
4. Des optimisations pour rendre la solution plus efficiente

Je vais structurer ma réponse pour qu'elle soit claire et facile à suivre, tout en étant très complète.</think># Solution complète pour l'intégration des psaumes dans propers.html

## Analyse des formats de dates et structures

Après une analyse approfondie des formats de dates utilisés dans les deux systèmes, voici les observations clés:

### Structure de dates dans divinum-officium

Les fichiers dans divinum-officium sont organisés selon deux systèmes principaux:

1. **Sancti (saints)** - Format `MM-DD.txt`:
   - Exemple: `12-25.txt` pour Noël
   - Variantes possibles avec suffixes:
     - `r` pour les rubriques réformées (ex: `12-25r.txt`)
     - `o` pour l'ancien rite (ex: `12-25o.txt`)
     - `m1`, `m2`, `m3` pour différentes messes (ex: `12-25m1.txt`, `12-25m2.txt`, `12-25m3.txt`)
   - Ces fichiers sont rangés par date du calendrier civil

2. **Tempora (temps liturgique)** - Format `[Préfixe][Semaine]-[Jour].txt`:
   - Préfixes: `Adv` (Avent), `Nat` (Noël), `Epi` (Épiphanie), `Quadp` (Septuagésime), `Quad` (Carême), `Pasc` (Pâques), `Pent` (Pentecôte)
   - Exemples:
     - `Quad1-0.txt` (1er dimanche de Carême)
     - `Pasc2-3.txt` (Mercredi de la 2e semaine après Pâques)
   - Le premier chiffre indique la semaine, le second indique le jour (0=dimanche, 1=lundi, ..., 6=samedi)
   - Ces fichiers suivent le calendrier liturgique mobile

### Structure de dates dans propers.html

Le système dans propers.html utilise:
- Une représentation en base de données avec des identifiants de jours
- Des sélecteurs pour choisir les différents jours (`selSunday`, `selSaint`, `selMass`)
- Un format de date standard `YYYY-MM-DD` pour les appels API

### Contenu des fichiers divinum-officium

Chaque fichier dans divinum-officium est structuré avec des sections délimitées par des crochets:

```
[Rank]
Dominica I in Quadragesima;;I classis Semiduplex;;6

[Introitus]
!Ps 90:15; 90:16
v. Il m'invoquera et je l'exaucerai ; je le sauverai et je le glorifierai, je le comblerai de jours.

[Graduale]
!Ps 90,11-12
Dieu a commandé pour toi à ses anges de te garder dans toutes tes voies.
```

## Solution détaillée

Notre solution comprendra deux parties principales:
1. Un scraper Python pour télécharger et préparer les données
2. Des modifications JavaScript pour intégrer ces données dans propers.html

### 1. Scraper Python pour divinum-officium

```python
import os
import re
import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timedelta
import calendar
from dateutil.easter import easter
import logging

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("DivinumScraper")

class DivinumOfficiumScraper:
    def __init__(self, output_dir="./data_liturgical", year=None, languages=None):
        self.base_url = "https://divinumofficium.com/www/missa"
        self.output_dir = output_dir
        self.year = year or datetime.now().year
        self.languages = languages or ["Latin", "French", "English"]
        
        # Créer les répertoires de sortie
        os.makedirs(output_dir, exist_ok=True)
        for lang in self.languages:
            os.makedirs(f"{output_dir}/{lang}/Sancti", exist_ok=True)
            os.makedirs(f"{output_dir}/{lang}/Tempora", exist_ok=True)
        
        # Initialiser les mappages
        self.calendar_data = {}
        self.liturgical_seasons = self._init_liturgical_seasons()
    
    def _init_liturgical_seasons(self):
        """Initialise les données des temps liturgiques"""
        return {
            "Adv": {
                "name": "Avent",
                "max_weeks": 4,
                "prefix": "Adv"
            },
            "Nat": {
                "name": "Noël",
                "max_weeks": 2,
                "prefix": "Nat"
            },
            "Epi": {
                "name": "Épiphanie",
                "max_weeks": 6,
                "prefix": "Epi"
            },
            "Quadp": {
                "name": "Septuagésime",
                "max_weeks": 3,
                "prefix": "Quadp"
            },
            "Quad": {
                "name": "Carême",
                "max_weeks": 6,
                "prefix": "Quad"
            },
            "Pasc": {
                "name": "Temps Pascal",
                "max_weeks": 7,
                "prefix": "Pasc"
            },
            "Pent": {
                "name": "Temps après la Pentecôte",
                "max_weeks": 24,
                "prefix": "Pent"
            }
        }
    
    def scrape_all(self):
        """Scrape tous les fichiers pertinents pour l'année liturgique en cours"""
        logger.info(f"Démarrage du scraping pour l'année {self.year}")
        self.scrape_sancti()
        self.scrape_tempora()
        self.create_calendar()
        self.create_mapping_file()
        self.extract_translations()
        logger.info("Scraping terminé avec succès")
    
    def scrape_sancti(self):
        """Récupère tous les fichiers de saints (format MM-DD)"""
        logger.info("Téléchargement des fichiers de saints...")
        
        # Pour chaque mois et jour
        for month in range(1, 13):
            for day in range(1, calendar.monthrange(self.year, month)[1] + 1):
                date_code = f"{month:02d}-{day:02d}"
                
                # Pour chaque langue
                for lang in self.languages:
                    # Fichier principal
                    self._fetch_file(f"{lang}/Sancti/{date_code}.txt")
                    
                    # Variantes avec suffixes
                    for suffix in ["r", "o", "m1", "m2", "m3", "t", "n"]:
                        self._fetch_file(f"{lang}/Sancti/{date_code}{suffix}.txt")
    
    def scrape_tempora(self):
        """Récupère tous les fichiers du temps liturgique"""
        logger.info("Téléchargement des fichiers du temps liturgique...")
        
        # Pour chaque temps liturgique
        for season_code, season_data in self.liturgical_seasons.items():
            max_weeks = season_data["max_weeks"]
            
            for week in range(1, max_weeks + 1):
                for day in range(0, 7):  # 0=dimanche, 6=samedi
                    tempora_code = f"{season_code}{week}-{day}"
                    
                    # Pour chaque langue
                    for lang in self.languages:
                        self._fetch_file(f"{lang}/Tempora/{tempora_code}.txt")
                        
                        # Certains fichiers ont des variantes
                        for suffix in ["r", "t", "Feria"]:
                            self._fetch_file(f"{lang}/Tempora/{tempora_code}{suffix}.txt")
    
    def _fetch_file(self, relative_path):
        """Récupère un fichier spécifique de divinum officium"""
        full_url = f"{self.base_url}/{relative_path}"
        output_path = f"{self.output_dir}/{relative_path}"
        
        try:
            response = requests.get(full_url)
            if response.status_code == 200:
                # Vérifier que le contenu n'est pas vide ou une page d'erreur
                if len(response.content) > 100:  # Ignorer les fichiers trop petits
                    # Créer le répertoire parent si nécessaire
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    
                    # Écrire le contenu dans un fichier
                    with open(output_path, "wb") as f:
                        f.write(response.content)
                    logger.debug(f"Téléchargé: {relative_path}")
                else:
                    logger.debug(f"Fichier ignoré (trop petit): {relative_path}")
            elif response.status_code == 404:
                # Fichier non trouvé (normal pour certaines dates)
                logger.debug(f"Fichier non trouvé: {relative_path}")
            else:
                logger.warning(f"Erreur HTTP {response.status_code} pour {relative_path}")
        except Exception as e:
            logger.error(f"Erreur lors du téléchargement de {relative_path}: {e}")
    
    def create_calendar(self):
        """Crée un fichier de calendrier pour l'année liturgique"""
        logger.info("Création du calendrier liturgique...")
        
        # Calculer les dates clés du calendrier liturgique
        easter_date = easter(self.year)
        ash_wednesday = easter_date - timedelta(days=46)
        pentecost = easter_date + timedelta(days=49)
        advent_start = self._calculate_advent_sunday(self.year)
        
        logger.info(f"Dates clés: Pâques={easter_date.strftime('%d/%m/%Y')}, "
                   f"Mercredi des Cendres={ash_wednesday.strftime('%d/%m/%Y')}, "
                   f"Pentecôte={pentecost.strftime('%d/%m/%Y')}, "
                   f"Avent={advent_start.strftime('%d/%m/%Y')}")
        
        # Initialiser le calendrier
        self.calendar_data = {}
        
        # Parcourir tous les jours de l'année
        current_date = datetime(self.year, 1, 1)
        end_date = datetime(self.year, 12, 31)
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            mm_dd = current_date.strftime("%m-%d")
            
            # Déterminer le temps liturgique et code tempora
            tempora_code, season_info = self._get_tempora_code(
                current_date, easter_date, ash_wednesday, 
                pentecost, advent_start
            )
            
            # Stocker les données dans le calendrier
            self.calendar_data[date_str] = {
                "date": date_str,
                "sancti_code": mm_dd,
                "tempora_code": tempora_code,
                "season": season_info.get("name", ""),
                "season_week": season_info.get("week", 0),
                "season_day": season_info.get("day", 0),
                "is_sunday": current_date.weekday() == 6,  # 6 = dimanche dans la norme Python
                "celebration": season_info.get("celebration", "")
            }
            
            current_date += timedelta(days=1)
        
        # Écrire le calendrier dans un fichier JSON
        calendar_file = f"{self.output_dir}/calendar_{self.year}.json"
        with open(calendar_file, "w", encoding="utf-8") as f:
            json.dump(self.calendar_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Calendrier liturgique créé: {calendar_file}")
    
    def _get_tempora_code(self, date, easter_date, ash_wednesday, pentecost, advent_start):
        """Détermine le code tempora et les informations de saison pour une date donnée"""
        # Initialiser avec des valeurs par défaut
        tempora_code = ""
        season_info = {"name": "Temps Ordinaire", "week": 0, "day": 0}
        
        # Convertir le jour de semaine de format Python (0=lundi) à divinum officium (0=dimanche)
        day_of_week = (date.weekday() + 1) % 7
        
        # 1. Période de l'Avent
        if advent_start <= date <= datetime(self.year, 12, 24):
            days_from_advent = (date - advent_start).days
            week = days_from_advent // 7 + 1
            tempora_code = f"Adv{week}-{day_of_week}"
            season_info = {
                "name": "Avent", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} de la {week}e semaine de l'Avent"
            }
        
        # 2. Période de Noël
        elif datetime(self.year, 12, 25) <= date <= datetime(self.year, 12, 31):
            days_from_christmas = (date - datetime(self.year, 12, 25)).days
            week = 1
            tempora_code = f"Nat{week}-{day_of_week}"
            season_info = {
                "name": "Noël", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} dans l'octave de Noël"
            }
        
        # 3. Période après Noël (jusqu'à l'Épiphanie)
        elif datetime(self.year, 1, 1) <= date < datetime(self.year, 1, 6):
            week = 1
            tempora_code = f"Nat{week}-{day_of_week}"
            season_info = {
                "name": "Noël", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} après Noël"
            }
        
        # 4. Période de l'Épiphanie
        elif datetime(self.year, 1, 6) <= date < ash_wednesday:
            # Calculer le dimanche après l'Épiphanie
            epiphany = datetime(self.year, 1, 6)
            days_to_sunday = (6 - epiphany.weekday()) % 7  # Jours jusqu'au prochain dimanche
            first_sunday_after_epiphany = epiphany + timedelta(days=days_to_sunday)
            
            if date < first_sunday_after_epiphany:
                # Dans l'octave de l'Épiphanie
                tempora_code = f"Epi1-{day_of_week}"
                season_info = {
                    "name": "Épiphanie", 
                    "week": 1, 
                    "day": day_of_week,
                    "celebration": f"{self._get_weekday_name(day_of_week)} dans l'octave de l'Épiphanie"
                }
            else:
                # Après l'octave de l'Épiphanie
                days_from_first_sunday = (date - first_sunday_after_epiphany).days
                week = (days_from_first_sunday // 7) + 1
                tempora_code = f"Epi{week}-{day_of_week}"
                season_info = {
                    "name": "Temps après l'Épiphanie", 
                    "week": week, 
                    "day": day_of_week,
                    "celebration": f"{self._get_weekday_name(day_of_week)} de la {week}e semaine après l'Épiphanie"
                }
        
        # 5. Période de la Septuagésime (3 semaines avant le Carême)
        elif ash_wednesday - timedelta(days=17) <= date < ash_wednesday:
            days_to_ash = (ash_wednesday - date).days
            week = 3 - (days_to_ash // 7)
            tempora_code = f"Quadp{week}-{day_of_week}"
            week_names = {1: "Septuagésime", 2: "Sexagésime", 3: "Quinquagésime"}
            season_info = {
                "name": "Pré-Carême", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} de la semaine de {week_names.get(week, '')}"
            }
        
        # 6. Période du Carême
        elif ash_wednesday <= date < easter_date:
            days_from_ash = (date - ash_wednesday).days
            week = days_from_ash // 7 + 1
            tempora_code = f"Quad{week}-{day_of_week}"
            season_info = {
                "name": "Carême", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} de la {week}e semaine de Carême"
            }
        
        # 7. Période Pascale
        elif easter_date <= date < pentecost:
            days_from_easter = (date - easter_date).days
            week = days_from_easter // 7 + 1
            tempora_code = f"Pasc{week}-{day_of_week}"
            season_info = {
                "name": "Temps Pascal", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} de la {week}e semaine de Pâques"
            }
        
        # 8. Période après la Pentecôte
        elif pentecost <= date < advent_start:
            days_from_pentecost = (date - pentecost).days
            week = days_from_pentecost // 7 + 1
            tempora_code = f"Pent{week}-{day_of_week}"
            season_info = {
                "name": "Temps après la Pentecôte", 
                "week": week, 
                "day": day_of_week,
                "celebration": f"{self._get_weekday_name(day_of_week)} de la {week}e semaine après la Pentecôte"
            }
        
        return tempora_code, season_info
    
    def _get_weekday_name(self, day_of_week):
        """Retourne le nom du jour de la semaine (0=dimanche)"""
        weekdays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
        return weekdays[day_of_week]
    
    def _calculate_advent_sunday(self, year):
        """Calcule la date du premier dimanche de l'Avent"""
        # Le premier dimanche de l'Avent est le dimanche le plus proche du 30 novembre
        # ou le dimanche entre le 27 novembre et le 3 décembre
        christmas = datetime(year, 12, 25)
        days_to_sunday = (6 - christmas.weekday()) % 7  # 6 = dimanche
        fourth_sunday_of_advent = christmas - timedelta(days=days_to_sunday)
        first_sunday_of_advent = fourth_sunday_of_advent - timedelta(weeks=3)
        return first_sunday_of_advent
    
    def create_mapping_file(self):
        """Crée un fichier de mappage entre les formats de date"""
        logger.info("Création du fichier de mappage des dates...")
        
        # Initialiser le mappage
        mapping = {
            "propers_to_divinum": {},
            "divinum_to_propers": {}
        }
        
        for date_str, data in self.calendar_data.items():
            # Déterminer le code divinum à utiliser (priorité au sancti s'il existe)
            sancti_code = data["sancti_code"]
            tempora_code = data["tempora_code"]
            
            # Vérifier si le fichier sancti existe
            sancti_file_exists = False
            for lang in self.languages:
                sancti_path = f"{self.output_dir}/{lang}/Sancti/{sancti_code}.txt"
                if os.path.exists(sancti_path):
                    sancti_file_exists = True
                    break
            
            # Déterminer le code à utiliser
            divinum_code = tempora_code
            if sancti_file_exists:
                # Vérifier la priorité (en fonction du rang)
                # Dans une implémentation complète, il faudrait analyser le [Rank] 
                # dans les fichiers pour déterminer la priorité
                divinum_code = sancti_code
            
            # Mappage de propers (YYYY-MM-DD) vers divinum
            mapping["propers_to_divinum"][date_str] = {
                "primary_code": divinum_code,
                "sancti_code": sancti_code,
                "tempora_code": tempora_code,
                "season": data["season"],
                "celebration": data["celebration"]
            }
            
            # Mappage inverse (divinum vers propers)
            if sancti_code not in mapping["divinum_to_propers"]:
                mapping["divinum_to_propers"][sancti_code] = []
            mapping["divinum_to_propers"][sancti_code].append(date_str)
            
            if tempora_code and tempora_code not in mapping["divinum_to_propers"]:
                mapping["divinum_to_propers"][tempora_code] = []
            if tempora_code:
                mapping["divinum_to_propers"][tempora_code].append(date_str)
        
        # Écrire le mappage dans un fichier JSON
        mapping_file = f"{self.output_dir}/date_mapping_{self.year}.json"
        with open(mapping_file, "w", encoding="utf-8") as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
        
        logger.info(f"Mappage des dates créé: {mapping_file}")
    
    def extract_translations(self):
        """Extrait les traductions des fichiers téléchargés et les organise pour propers.html"""
        logger.info("Extraction des traductions...")
        
        translation_data = {}
        sections_to_extract = ["Introitus", "Graduale", "Tractus", "Offertorium", "Communio"]
        
        # Parcourir tous les fichiers téléchargés
        for lang in self.languages:
            if lang == "Latin":
                continue  # Pas besoin d'extraire les traductions du latin
                
            translation_data[lang] = {}
            
            # Traiter les fichiers de saints
            sancti_dir = f"{self.output_dir}/{lang}/Sancti"
            if os.path.exists(sancti_dir):
                for filename in os.listdir(sancti_dir):
                    if filename.endswith(".txt"):
                        file_path = os.path.join(sancti_dir, filename)
                        date_code = filename.split(".")[0]
                        sections = self._parse_divinum_file(file_path, sections_to_extract)
                        if any(sections.values()):  # Si au moins une section contient des données
                            translation_data[lang][date_code] = sections
            
            # Traiter les fichiers du temps liturgique
            tempora_dir = f"{self.output_dir}/{lang}/Tempora"
            if os.path.exists(tempora_dir):
                for filename in os.listdir(tempora_dir):
                    if filename.endswith(".txt"):
                        file_path = os.path.join(tempora_dir, filename)
                        tempora_code = filename.split(".")[0]
                        sections = self._parse_divinum_file(file_path, sections_to_extract)
                        if any(sections.values()):  # Si au moins une section contient des données
                            translation_data[lang][tempora_code] = sections
        
        # Écrire les traductions dans un fichier JSON par langue
        for lang, data in translation_data.items():
            translations_file = f"{self.output_dir}/translations_{lang.lower()}_{self.year}.json"
            with open(translations_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"Traductions {lang} extraites: {translations_file}")
        
        # Créer aussi un fichier contenant toutes les traductions
        all_translations_file = f"{self.output_dir}/translations_all_{self.year}.json"
        with open(all_translations_file, "w", encoding="utf-8") as f:
            json.dump(translation_data, f, ensure_ascii=False, indent=2)
        logger.info(f"Toutes les traductions extraites: {all_translations_file}")
    
    def _parse_divinum_file(self, file_path, sections_to_extract):
        """Parse un fichier de divinum officium pour extraire les sections spécifiées"""
        sections = {section: [] for section in sections_to_extract}
        current_section = None
        
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    
                    # Détection des sections
                    if line.startswith("[") and line.endswith("]"):
                        section_name = line[1:-1]
                        current_section = section_name if section_name in sections_to_extract else None
                    elif current_section and line:
                        # Nettoyage des lignes
                        # Supprimer les références bibliques (commence par !)
                        if line.startswith("!"):
                            continue
                        
                        # Supprimer les balises de formatage
                        line = re.sub(r'v\.\s*', '', line)  # Supprimer "v. " 
                        
                        sections[current_section].append(line)
            
            return sections
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse du fichier {file_path}: {e}")
            return {section: [] for section in sections_to_extract}


# Exemple d'utilisation
if __name__ == "__main__":
    # Année actuelle + 1 pour avoir le calendrier de l'année prochaine également
    current_year = datetime.now().year
    
    for year in [current_year, current_year + 1]:
        scraper = DivinumOfficiumScraper(
            output_dir=f"./data_liturgical_{year}", 
            year=year,
            languages=["Latin", "French", "English"]
        )
        scraper.scrape_all()
```

### 2. Intégration JavaScript dans propers.html

Maintenant, nous allons modifier le code JavaScript pour utiliser les données récupérées:

```javascript
/**
 * Module de gestion des traductions des psaumes
 * Basé sur les fichiers locaux téléchargés depuis divinum-officium
 */
const PsalmTranslations = (function() {
    // Variables privées
    let _liturgicalCalendar = {};
    let _translationData = {};
    let _dateMapping = {};
    let _currentYear = new Date().getFullYear();
    let _dataLoaded = false;
    let _dataLoadPromise = null;
    
    // Sections à traiter dans l'interface
    const _sectionMapping = {
        'introitus': 'Introitus',
        'graduale': 'Graduale',
        'tractus': 'Tractus',
        'offertorium': 'Offertorium',
        'communio': 'Communio'
    };
    
    // Fonction pour charger les données nécessaires
    function _loadData() {
        if (_dataLoadPromise) {
            return _dataLoadPromise;
        }
        
        _dataLoadPromise = new Promise((resolve, reject) => {
            // Charger le calendrier
            $.getJSON(`data_liturgical_${_currentYear}/calendar_${_currentYear}.json`)
                .done(function(data) {
                    _liturgicalCalendar = data;
                    console.log("Calendrier liturgique chargé");
                    
                    // Charger le mappage des dates
                    return $.getJSON(`data_liturgical_${_currentYear}/date_mapping_${_currentYear}.json`);
                })
                .done(function(data) {
                    _dateMapping = data;
                    console.log("Mappage des dates chargé");
                    
                    // Charger les fichiers de traduction pour chaque langue
                    const languages = ['fr', 'en'];
                    _translationData = {};
                    
                    const promises = languages.map(lang => {
                        return $.getJSON(`data_liturgical_${_currentYear}/translations_${lang}_${_currentYear}.json`)
                            .done(function(data) {
                                _translationData[lang] = data;
                                console.log(`Traductions ${lang} chargées`);
                            })
                            .fail(function() {
                                console.error(`Erreur lors du chargement des traductions ${lang}`);
                                _translationData[lang] = {};
                            });
                    });
                    
                    return Promise.all(promises);
                })
                .done(function() {
                    _dataLoaded = true;
                    console.log("Toutes les données ont été chargées");
                    resolve();
                })
                .fail(function(error) {
                    console.error("Erreur lors du chargement des données:", error);
                    reject(error);
                });
        });
        
        return _dataLoadPromise;
    }
    
    // Fonction pour obtenir le code divinum pour une date donnée
    function _getDivinumCodeForDate(dateStr) {
        if (!_dataLoaded || !_dateMapping || !_dateMapping.propers_to_divinum) {
            console.error("Les données de mappage ne sont pas encore chargées");
            return null;
        }
        
        const mapping = _dateMapping.propers_to_divinum[dateStr];
        if (!mapping) {
            console.error(`Pas de mappage trouvé pour la date ${dateStr}`);
            return null;
        }
        
        return {
            primary: mapping.primary_code,
            sancti: mapping.sancti_code,
            tempora: mapping.tempora_code
        };
    }
    
    // Fonction pour obtenir la traduction d'une section pour une date donnée
    function _getTranslationForSection(dateStr, sectionName, lang) {
        if (!_dataLoaded) {
            console.error("Les données ne sont pas encore chargées");
            return null;
        }
        
        // Obtenir le code divinum pour cette date
        const divinumCodes = _getDivinumCodeForDate(dateStr);
        if (!divinumCodes) {
            return null;
        }
        
        // Vérifier si nous avons des traductions pour cette langue
        if (!_translationData[lang]) {
            console.error(`Pas de traductions disponibles pour la langue ${lang}`);
            return null;
        }
        
        // Essayer d'abord avec le code principal
        let translation = null;
        if (_translationData[lang][divinumCodes.primary]) {
            translation = _translationData[lang][divinumCodes.primary][sectionName];
        }
        
        // Si pas trouvé et que c'est un code sancti, essayer avec tempora
        if (!translation && divinumCodes.primary === divinumCodes.sancti && _translationData[lang][divinumCodes.tempora]) {
            translation = _translationData[lang][divinumCodes.tempora][sectionName];
        }
        
        // Si pas trouvé et que c'est un code tempora, essayer avec sancti
        if (!translation && divinumCodes.primary === divinumCodes.tempora && _translationData[lang][divinumCodes.sancti]) {
            translation = _translationData[lang][divinumCodes.sancti][sectionName];
        }
        
        return translation && translation.length > 0 ? translation : null;
    }
    
    // Fonction pour formater une date au format YYYY-MM-DD
    function _formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Fonction pour obtenir la date liturgique actuelle
    function _getCurrentLiturgicalDate() {
        // Cette fonction devrait récupérer la date liturgique sélectionnée
        // dans l'interface (selSunday, selSaint, etc.)
        
        // Si une date est sélectionnée dans l'interface, la récupérer
        const selectedDate = _getSelectedDateFromInterface();
        if (selectedDate) {
            return selectedDate;
        }
        
        // Sinon, utiliser la date du jour
        return new Date();
    }
    
    // Fonction pour récupérer la date sélectionnée dans l'interface
    function _getSelectedDateFromInterface() {
        // Cette fonction est spécifique à l'interface utilisateur
        // et doit être adaptée en fonction de la structure de propers.html
        
        // Exemple simplifié - à adapter selon votre interface
        const selSunday = document.getElementById('selSunday');
        const selSaint = document.getElementById('selSaint');
        const selMass = document.getElementById('selMass');
        
        // Logique pour déterminer la date à partir des sélecteurs
        // Ceci est un exemple et doit être adapté à votre structure de données
        if (selSunday && selSunday.value) {
            // Exemple: convertir une valeur de sélecteur en date
            return _convertSelectorValueToDate(selSunday.value);
        } else if (selSaint && selSaint.value) {
            return _convertSelectorValueToDate(selSaint.value);
        } else if (selMass && selMass.value) {
            return _convertSelectorValueToDate(selMass.value);
        }
        
        return null;
    }
    
    // Fonction pour convertir une valeur de sélecteur en date
    function _convertSelectorValueToDate(selectorValue) {
        // Cette fonction est spécifique à votre structure de données
        // et doit être adaptée en fonction des valeurs utilisées
        
        // Exemple très simplifié - à adapter
        if (selectorValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Format YYYY-MM-DD direct
            return new Date(selectorValue);
        } else if (selectorValue.match(/^\d{2}-\d{2}$/)) {
            // Format MM-DD, ajouter l'année courante
            return new Date(`${_currentYear}-${selectorValue}`);
        }
        
        // Si le format n'est pas reconnu, retourner null
        return null;
    }
    
    // Interface publique du module
    return {
        // Initialiser le module
        init: function() {
            // Charger les données
            _loadData().then(() => {
                // Une fois les données chargées, initialiser les éléments d'interface
                this.setupInterface();
            }).catch(error => {
                console.error("Erreur lors de l'initialisation des traductions de psaumes:", error);
            });
        },
        
        // Configurer l'interface utilisateur
        setupInterface: function() {
            // Ajouter le sélecteur de langue des psaumes s'il n'existe pas déjà
            $('.chant-parent').each(function() {
                const $container = $(this);
                const partName = $container.closest('[part]').attr('part');
                
                // Ne traiter que les parties qui nous intéressent
                if (_sectionMapping[partName]) {
                    // Vérifier si un conteneur de traduction existe déjà
                    let $psalmTranslation = $container.next('.psalm-translation');
                    
                    if ($psalmTranslation.length === 0) {
                        // Créer le conteneur de traduction
                        $psalmTranslation = $('<div>').addClass('psalm-translation').insertAfter($container);
                        
                        // Ajouter le sélecteur de langue
                        const $selector = $('<div class="psalm-translation-selector">').appen
