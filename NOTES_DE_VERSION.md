# 📝 Notes de Version — Oremus

## 🚀 Version 0.0.55 (2 Septembre 2026)

---

### 🎨 Art Sacré du Temporal — Catalogue Raisonné des Dimanches & Solennités

* **5 Nouveaux Chefs-d'Œuvre WebP Embarqués (`img/tempora/`) :**
  * Intégration de **Epi6-0** (*Parabole du grain de sénevé* — **John Everett Millais**, 1864, Aberdeen Art Gallery), **Pent14-0** (*Lys des champs & oiseaux du ciel* — **Marten van Valckenborch**, 1585, Kunsthistorisches Museum Vienne), **Pent17-0** (*Le Grand Commandement* — **Jacob Jordaens**, 1660, Palais des Beaux-Arts de Lille), **Pent19-0** (*Festin des noces royales* — **Bernardo Strozzi**, 1636, Gallerie dell'Accademia Venise) et **Quad6-6** (*Descente aux enfers / Veillée Pascale* — **Fra Angelico**, 1442, San Marco Florence).
  * Catalogue raisonné complet **`js/tempora_art_metadata.js` / `img/tempora/tempora_art_metadata.json`** — **61 entrées** couvrant Avent, Épiphanie, Carême, Pâques, Pentecôte et Temps après la Pentecôte avec attributions authentifiées (artiste, année, musée).
  * **Attributions Corrigées :** localisation Epi6-0 `Prague → Aberdeen`, Pent14-0 `Tissot → Valckenborch / New York → Vienne`, Pent17-0 `Rembrandt → Jordaens / Londres → Lille`, Pent19-0 `Cavallino → Strozzi / Naples → Venise` et mise à jour de l'outil ** `tools/download_temporale_masterpieces.py`** (10 corrections de métadonnées).
* **Intégration à la Carte du Jour (`buildHomeSaintCard`) :**
  * Affichage prioritaire de l'œuvre du Temporal le dimanche et aux grandes solennités ; *fallback* intelligent vers l'image du saint du jour ou l'image dominicale (`temporaSunCode`) en semaine.
  * Chargement direct **hors-ligne embarqué** si disponible, sinon **remote GitHub Raw** (`raw.githubusercontent.com/bastonus/jgabc/master/img/tempora/…`) sans erreur 404 ; vérification d'installation via `OremusModuleManager.isInstalled('saints')`.
* **Allègement de l'APK Android (`android/app/build.gradle` : `copyWebAssets`) :**
  * Exclusion de `img/saints/**` et `gabc/**/*.gabc` du binaire de base — contenus servis à la volée depuis GitHub Usercontent — incluant désormais **uniquement** `img/tempora/**` pour réduire drastiquement la taille de `Oremus.apk`.
  * Pipeline CI `.github/workflows/build-apk.yml` optimisé (6 lignes révisées).

---

### 🎚️ Moteur Audio Grégorien à Durées Pondérées & Synchronisation Fidèle

* **Tempo de Référence Révisé :**
  * Passage du tempo par défaut de **150 → 165 bpm** (`doState.tempo`, `Tone.Transport.bpm`) pour une pulsation plus naturelle et conforme au positif d'orgue liturgique.
* **Calcul du Temps & de la Progression Pondérés (`js/divinum_officium.js` & `util.js`) :**
  * Nouvelle chaîne ** `_chantIsSalicus` → `_chantNoteWeightedDuration` → `_getChantWeightedInfo` → `_fractionToChantIndex` / `_indexToFraction`** : chaque note reçoit une durée réelle tenant compte des **morae** (`durée ×2`), des **notes pointées / quilisma / salicus** (`×1.8`) et de l'**episema** horizontal (`+0.9` réparti sur le groupe).
  * **Silences Inter-Phrases :** détection des barres divisoires dans `score.notations` — `DoubleBar/FullBar → 1.6`, `HalfBar/DominicanBar/Virgula → 0.7`, `QuarterBar → 0` — attribués à la note précédente pour une barre de progression et des temps `elapsed/remaining` strictement fidèles à la partition.
  * `updateDoPlayerProgressAndTime()` et `getChantProgress()` réécrits en pondéré ; total/écoulé calculés en `secPerUnit = 60 / tempoBpm`.
  * **Synchronisation YouTube :** mapping `fraction → note` repeat-aware pondéré (séquence avec reprises dépliées + durées réelles) et préservation du highlight lors d'un changement de vitesse.
* **Highlight & Interaction au Clic :**
  * `clearActiveNote(force)` et `highlightChantNoteAtFraction()` conservent désormais le **surlignage manuel du premier clic pendant 3–4 s** (`_manualHighlightUntil`) même en pause, sans être écrasé par la synchro YouTube.
  * ** `findNextChantElement()` ** : résolution du clic sur ** astérisque ou texte non-note** vers l'élément chant suivant en ordre de lecture (gauche→droite, haut→bas) pour positionner correctement le `selected-start-note`.
  * `handleChantElementClick()` forcé + auto-scroll immédiat au lancement (`_userScrollTimer` réinitialisé, scroll vers centre si note visible).
* **Correctifs `util.js` :**
  * `setTempo` ne reprogramme plus avec `'+16n'` (déplacement de curseur supprimé) ; `setRelativeTempo` / `playScore` utilisent désormais **`window.timeoutNextNote`** et `Tone.Transport.scheduleOnce` cohérents.
  * `_chantNotes`, `_getChantNoteId`, `_setChantNoteId`, `_getNoteDuration` exposés pour accès cross-module ; ajout de `window._getChantPlaybackState()`.

---

### 💅 Correctifs UI & Ergonomie du Lecteur

* **Tiroir de Tonalité (`#playerPitchDrawer`, `css/divinum_officium.css` +677 lignes) :**
  * Nouveau composant complet **bubble `290px` + drawer intégré** : grille 4× `do-pitch-chip` (note + intervalle), états `is-active` / `is-transposed` / `is-disabled`, verre dépoli (`backdrop-filter: blur(24px)`), mode clair/sombre.
  * En-tête allégé en v0.0.55 : suppression du titre redondant, `border-bottom: none` et `margin-bottom: 0` (`divinum-officium.html:972`).
  * Bouton `#playerPitchPill` illuminé en primaire lorsqu'une transposition est active.
* **Barre de Progression & Temps :**
  * `#playerCurrentTime` aligné à gauche, `#playerChantTime` à droite, `margin-top: 14px` sur la piste ; couleur primaire corrigée vers `var(--text-primary)` sur la valeur de tempo.
* **Recherche Grégorienne :**
  * Retouches `js/gregorian_search_ui.js` (19 lignes), `js/gregorian_db.js` (52 lignes), `css/gregorian_search.css` (+169 lignes) et `js/mobile_propers.js` (40 lignes) — harmonisation de l'arrondi, filtrage et rendu des résultats.

---

### 🛡️ Versionnage & Maintenance

* Synchronisation de `CURRENT_APP_VERSION` sur `'beta-0.0.55'`, `versionCode 55` / `versionName "beta-0.0.55"` (`android/app/build.gradle`), `version.json` (`tagName v0.0.55`, `releaseDate 2026-09-02T20:05:00Z`) et `package.json` (`0.0.55`).
* Incrément du cache Service Worker `oremus-pwa-v1.3.14 → v1.3.15` (`sw.js`).

---

## 🚀 Version 0.0.54 (1 Septembre 2026)

---

### 🎥 Enregistrements Audio & Vidéo YouTube / YouTube Music par Partition
* **Indexation Multi-Sources de 1 645 Pièces Grégoriennes :**
  * Association automatique d'enregistrements audio et vidéo issus de YouTube / YouTube Music pour les pièces du répertoire grégorien.
  * Interprétations d'exception intégrées : **Marek Klein** (*Gradvale Novvm* / chant soliste), **Abbaye Notre-Dame de Fontgombault**, **Abbaye Saint-Pierre de Solesmes**, **Abbaye du Barroux**, **Ensemble Organum** (Marcel Pérès), **GradualeProject**, etc.
  * Base de données optimisée embarquée hors-ligne (`js/gregorian_youtube_links.js` et `js/gregorian_youtube_links.json`).
* **Filtrage par Concordance Strict de l'Incipit Latin :**
  * Algorithme d'analyse sémantique `is_strict_match` épurant les mots d'arrêt liturgiques non discriminants (`cum`, `non`, `in`, `pro`, `comm`, `all`...) et exigeant la concordance exacte des premiers mots significatifs du texte latin, éliminant **3 788 vidéos approximatives ou hors-sujet**.
* **Intégration au Lecteur Audio Principal (`#modernPlayerBar`) :**
  * Bouton dédié **« Vidéos »** s'affichant dynamiquement dans la barre de réglages du lecteur dès qu'un chant possède des enregistrements associés.
  * Mise en valeur visuelle : fond illuminé en couleur primaire rouge/bordeaux officielle d'Oremus au dépliement, avec bascule automatique de l'icône logo YouTube vers une **croix de fermeture `✕`**.
  * **Carrousel Horizontal Défilable Compact :** Disposition fluide calée à **1,5 vidéo visible** à l'écran sur Mobile comme sur Desktop, sans cartes à fond gris ni encombrement en largeur.
  * **Mini-Lecteurs YouTube en 1 Clic :** Rendu direct des lecteurs vidéo `iframe` au dépliement, permettant le lancement immédiat en un seul clic sans étape intermédiaire de chargement.
  * Évacuation du composant hors des pages solo pour un accès centralisé et épuré depuis le lecteur principal.

---

### 🛡️ Correctif de la Détection de Version & Faux Positifs
* **Élimination des Notifications d'Update Erronées :**
  * Synchronisation de `CURRENT_APP_VERSION` sur `'beta-0.0.54'` et consolidation de `parseVersionString()` dans `js/divinum_officium.js` pour traiter de façon robuste tous les schémas de tags distants (`v`, `beta-`, `vbeta-`).

---

## 🚀 Version 0.0.53 (1 Septembre 2026)

---

### 🖼️ Biographies & Iconographie des Saints (Accueil & Messe)
* **Carte Immersive du Saint du Jour :**
  * Nouvelle carte `.do-home-saint-card` positionnée sous la barre de recherche sur la page d'accueil, présentant le portrait du saint du jour avec filet doré, badge de fête, titre liturgique, notice biographique dépliable (*« Lire la suite »*) et accès direct à la messe.
  * Extraction dynamique de la `Lectio94` / `Lectio93` (notice biographique officielle des rubriques de 1960) et des `Lectio 4-5-6` du Bréviaire, avec *fallback* automatique vers le *Martyrologe Romain* pour les commémoraisons simples.
  * Galerie de **266 portraits WebP** indexés par date (`img/saints/{MM-DD}.webp`), générés depuis le corpus des œuvres d'art sacré du domaine public (Giotto, Fra Angelico, Memling, Le Caravage, Guido Reni, icônes byzantines) en WebP 480px — poids total **8,56 Mo** pour l'année entière.
  * Chargement instantané à 0 ms, 100 % hors-ligne, mis en cache persistant par le Service Worker.

---

### 📖 Bible Crampon 1923 — Remplacement Complet de l'AELF
* **Traduction Catholique Traditionnelle Alignée sur la Vulgate :**
  * Remplacement intégral de la traduction AELF (issue de la Néo-Vulgate post-Vatican II) par la **Bible du Chanoine Crampon** (édition révisée 1923) pour les 73 livres canoniques et 35 580 versets.
  * Alignement parfait verset par verset (1:1 direct) avec la Vulgate clémentine sur l'ensemble du canon : Tobie (20 versets au chapitre 7), Judith, Esther et l'intégralité du Nouveau Testament.
  * Réalignement liturgique des 150 Psaumes et typographie française soignée (espaces insécables, ponctuation traditionnelle).
  * Dossier `crampon/` créé, synchronisé et intégré au moteur de rendu de l'application.

---

## 🚀 Version 0.0.52 (1 Septembre 2026)

---

### ⚡ Moteur de Recherche Embarqué Direct (0 ms & 100% Garanti sous Android APK)
* **Embarquement Synchrone Direct de l'Index & du Moteur de Recherche :**
  * Intégration de l'index sous forme de module JS embarqué natif (`js/gregorian_index_data.js` et `js/gregorian_search_engine.js`).
  * Les 2292 éléments (Messes avec propres, Offices, 73 livres de la Sainte Bible et Chants) sont initialisés dès le chargement de l'application en mémoire, sans aucune dépendance à des requêtes `fetch` ou à l'isolation des Web Workers Android.
  * Recherche universelle instantanée avec 0 ms de délai de frappe et extraction d'extraits multilingues garantie sur Android, iOS et Web.

---

## 🚀 Version 0.0.51 (1 Septembre 2026)

---

### 🔍 Correctif Moteur de Recherche Android (Chargement Universel Garanti)
* **Résolution du Problème de Recherche sur l'Application Android (APK) :**
  * Double canal d'initialisation de l'index de recherche universel : chargement direct par le thread principal en plus du Web Worker, évitant les blocages de résolution de chemin relatifs (`data/gregorian_index.json`) spécifiques aux WebViews Android.
  * Les 2292 éléments (Messes, Offices, Vulgate, Chants) sont désormais garantis chargés et interrogeables instantanément sous Android comme sur le web.
* **Icône Officielle de Notification Android :**
  * Intégration fidèle des tracés vectoriels du logo officiel Oremus (`Oremus-logo/logo.svg`) dans la barre d'état Android (`ic_notification`).

---

## 🚀 Version 0.0.50 (1 Septembre 2026)

---

### 🛡️ Téléchargement APK, Anti-Spam Notifications & Pipeline Unique
* **Correction de l'Erreur 404 lors du Téléchargement de la Mise à Jour :**
  * Alignement du nom de fichier de l'APK téléchargé sur `Oremus.apk` (nom exact du binaire généré et publié sur les releases GitHub) évitant l'erreur 404 dans l'application.
* **Suppression du Spam de Notifications Android :**
  * Déduplication stricte des alertes push : chaque annonce ou mise à jour n'est envoyée **qu'une seule et unique fois**. L'application mémorise de façon permanente les alertes déjà transmises.
  * **Aucune notification système lorsque l'application est ouverte** : l'utilisateur n'est plus dérangé pendant sa prière ou sa lecture ; les notifications locales ne sont programmées qu'en arrière-plan lors de la fermeture de l'application.
* **Optimisation de l'Intégration Continue (GitHub Actions) :**
  * Déclenchement d'un seul build APK lors de la publication d'un tag de release (`v*`), évitant les doubles compilations redondantes.

---

## 🚀 Version 0.0.49 (1 Septembre 2026)

---

### 🔍 Cartes de Recherche & Optimisation d'Espace
* **Suppression de la Mention « Extrait » :**
  * Retrait du libellé superflu au-dessus des extraits de recherche pour aérer les cartes et maximiser le nombre de lignes de texte affichées en mode Grille et Mode Ligne.
* **Stabilité et Embarquement Hors-Ligne :**
  * Validation complète des assets embarqués dans l'application mobile et chargement instantané sans connexion.

---

## 🚀 Version 0.0.48 (1 Septembre 2026)

---

### 📱 Correctif Android & Embarquement des Fichiers de Recherche
* **Correction de l'Affichage sur l'Application Android Installée (APK) :**
  * Embarquement complet des feuilles de style (`css/gregorian_search.css`), des bibliothèques locales (`js/vendor/`), de l'index universel (`data/gregorian_index.json`) et du moteur de recherche dans les assets de l'APK Android.
  * Masquage strict par défaut des pastilles de filtres sur la page d'accueil et les pages d'offices pour éviter tout flash ou affichage non désiré.

---

## 🚀 Version 0.0.47 (1 Septembre 2026)

---

### 🔍 Moteur de Recherche Universelle & Grégorienne
* **Recherche Unifiée & Instantanée (< 2 ms) :**
  * Indexation multilingue complète couvrant les **Offices du Bréviaire**, les **566 Messes du Missel Romain** (avec propres complets : Introït, Collecte, Épître, Graduel, Évangile, Offertoire, Secrète, Communion), les **73 livres de la Sainte Bible** (Vulgate latine) et l'ensemble du **répertoire de Chants Grégoriens**.
  * Découpage et surlignage intelligent (*highlight*) des mots-clés dans les titres et extraits textuels (*snippets*).
  * Plafonnement conditionnel des titres en vue grille avec ellipse (`...`) uniquement lorsqu'un extrait de recherche est présent, garantissant une lisibilité optimale de l'extrait et du badge.
  * Bannissement strict des résultats techniques et codes liturgiques bruts.
* **Aperçus Bibliques en Latin Authentique :**
  * Connexion directe à la Vulgate clémentine pour les 73 livres bibliques, incluant les Machabées et les Petits Prophètes avec numérotation nette des versets.
* **Filtres Thématiques & Pastilles Fluides :**
  * Barre de filtres scrollable horizontalement avec débordement élégant sur le bord droit de l'écran (*Offices, Messes, Bible, Chants, Introïts, Graduels, Alléluias, Traits, Séquences, Offertoires, Communions, Antiennes, Répons, Hymnes, Modes 1 à 8, Ad Libitum, Kyriale*).
  * Arrondi harmonisé (`10px`) sur l'ensemble des pastilles et composants de recherche.
* **Isolation Stricte par Langue :**
  * La recherche s'exécute exclusivement dans la langue active de l'utilisateur (Français + Latin pour l'interface française), éliminant toute pollution par les traductions dans d'autres langues.
* **Rendu Différé & Mode Grille / Ligne :**
  * Affichage en double mode (Grille avec partitions carrées `1:1` et Mode Ligne), mémorisé automatiquement dans les préférences locales.
  * Rendu GABC différé (*lazy rendering*) centré sur la section musicale recherchée.

---

### 🎨 En-tête & Ergonomie
* **Flèche Déroulante Dynamique du Titre :**
  * Pour les titres courts (ex. *« St Gilles Abbé »*), la flèche `⌄` est positionnée immédiatement à la suite du texte.
  * Pour les titres longs ou en cas de débordement, la flèche reste fixée tout au bout à droite sur la même ligne (`flex-wrap: nowrap`), sans jamais passer à la ligne suivante, pendant que le texte défile fluidement (*smooth marquee*).
* **Harmonisation de la Barre de Recherche d'Accueil :**
  * Hauteur ajustée à `38px`, arrondi à `10px`, fond highlight et bordures supprimées pour une continuité visuelle parfaite avec l'en-tête de recherche.

---

---

## 🚀 Version 0.0.46 (31 Août 2026)

---

### 🔔 Notifications Push & Système Android
* **Notifications Push en Arrière-plan & Icône Personnalisée :**
  * Réception des alertes et notifications push même lorsque l'application est fermée ou en veille.
  * Intégration de l'icône vectorielle personnalisée `ic_notification` (logo Oremus) pour la barre d'état Android.
* **Navigation & Interactions Directes :**
  * Ouverture instantanée de la pop-up liée lors d'un clic sur le bandeau supérieur, le toast ou la notification système Android.
  * Correction du positionnement et suppression des chevauchements de texte dans les listes d'étapes (*steps*) des pop-ups d'alerte.

---

## 🚀 Version 0.0.45 (31 Août 2026)

---

### 📖 Navigation Liturgique & Sommaire de la Messe
* **Table des matières interactive & Sommaire flottant de la Messe :**
  * Nouvelle pilule flottante discrète sur le côté droit de l'écran donnant accès instantané au sommaire complet de la célébration.
  * Positionnement dynamique évitant tout chevauchement avec la barre du lecteur audio.
  * Rendu visuel moderne avec flou d'arrière-plan translucide (*backdrop-filter: blur*) et ombre portée prononcée.
  * Découpage clair en 4 grandes parties liturgiques et sous-étapes :
    1. *Avant-Messe & Liturgie de la Parole* (Prières au bas de l'autel, Introït, Kyrie, Gloria, Collecte, Épître, Graduel / Alléluia / Trait, Évangile, Credo).
    2. *Offertoire & Préparation* (Offertoire, Oblation, Lavabo, Secrète).
    3. *Canon & Consécration* (Préface & Sanctus, Canon Romain, Consécration / Élévation, Pater Noster).
    4. *Communion & Envoi* (Agnus Dei, Communion, Postcommunion, Bénédiction & Dernier Évangile).
  * Système de *ScrollSpy* mettant en valeur l'étape courante en temps réel et défilement fluide (*smooth scroll*) vers la partie sélectionnée.

---

### 🎧 Lecteur Audio Grégorien & Moteur Sonore
* **Gestuelle de fermeture intuitive :**
  * Possibilité de glisser le mini-lecteur audio vers le bas (*swipe down*) pour le réduire ou le fermer rapidement.
* **Contrôle de vitesse simplifié en un clic :**
  * Remplacement du menu complexe par un bouton unique qui cycle les vitesses à chaque appui :  
    `x1.0` $\rightarrow$ `x1.25` $\rightarrow$ `x1.5` $\rightarrow$ `x2.0` $\rightarrow$ `x0.5` $\rightarrow$ `x0.75`.
* **Synthèse Audio Grégorienne Enrichie :**
  * Optimisation du synthétiseur pour une sonorité plus chaleureuse, naturelle et proche d'un positif d'orgue liturgique.

---

### 📿 Liturgie, Textes & Rituels
* **Rétablissement du Dernier Évangile dans l'Ordinaire :**
  * Le texte intégral du prologue de Saint Jean (*In principio erat Verbum...* / *Au commencement était le Verbe...*, Jean 1:1-14) est désormais restitué et intégré de manière systématique dans la section finale (*Conclusio*) de l'Ordinaire de la Messe, avec ses dialogues préliminaires (*Dóminus vobíscum*, *Inítium sancti Evangélii...*) et le répons d'action de grâces (*Deo grátias* / *Nous rendons grâces à Dieu*).
* **Typographie des Paroles de la Consécration :**
  * Les paroles consacrées (*« HOC EST ENIM CORPUS MEUM »*, *« HIC EST ENIM CALIX... »*) s'affichent désormais en noir et en gras distinctif (`.do-consecration-words`), évitant toute confusion avec la couleur rouge des rubriques.

---

### 📅 Calendrier & Propres des Saints (Traductions & Corrections)
* **Fêtes de Novembre & Toussaint :**
  * Traduction complète en français des célébrations de début novembre (*Commémoration de tous les fidèles défunts*, *Fête des Saintes Reliques*, *Dans l'octave de la Toussaint*, *Quatre Saints Couronnés*).
  * Harmonisation de la **Fête des Saintes Reliques** (remplacement systématique des mentions anglaises *Holy Relics*).
* **Saint Martin Iᵉʳ (12 Novembre) :**
  * Ajout de la traduction française intégrale de l'Officium, de l'oraison de collecte, de la secrète et de la postcommunion.
* **Notre-Dame de la Médaille Miraculeuse (27 Novembre) :**
  * Traduction française des rubriques et annotations de chant (substitutions pour le diocèse de Paris, temps de la Septuagésime et temps pascal).
* **Nativité de Notre Seigneur (25 Décembre) :**
  * Complétion des titres, rubriques et règles françaises pour les trois messes de Noël (Messe de Minuit, Messe de l'Aurore, Messe du Jour).
* **Notre-Dame du Mont-Carmel (16 Juillet) :**
  * Remplacement des intitulés anglais résiduels par *Notre-Dame du Mont-Carmel* en français et *Beatæ Mariæ Virginis de Monte Carmelo* en latin.
* **Suppression des entrées dupliquées :**
  * Nettoyage des doublons dans le calendrier et les menus de sélection pour le **11 Juillet** (Saint Pie Iᵉʳ), le **25 Octobre** (Saints Chrysanthe et Daria), le **13 Novembre** (Saint Didace) et le **29 Novembre** (Vigile de Saint André / Saint Saturnin).

---

### 📱 Ergonomie & Interface Mobile
* **Bouton d'accès « Aujourd'hui » :**
  * Ajustement des marges de sécurité inférieures (`safe-area-inset-bottom`) garantissant une accessibilité parfaite au-dessus des barres de navigation système Android et iOS.
* **En-têtes et titres longs :**
  * Intégration d'un défilement automatique fluide (*marquee* temporaire à 2 cycles avec masques dégradés) pour les titres liturgiques très longs sur les petits écrans, tout en conservant le bouton d'expansion visible et stylisé.
* **Indicateur de geste bilingue (Latin / Vernaculaire) :**
  * Nouvel indice visuel animé inspiré de Samsung One UI invitant naturellement à glisser latéralement pour découvrir le texte bilingue face à face.
* **Gestion du bouton et geste Retour (Android & Navigateur) :**
  * La navigation par le bouton/geste Retour système ferme désormais les modales et tiroirs ouverts en priorité, puis revient à l'accueil avant de quitter l'application.
* **Réinitialisation automatique après inactivité :**
  * Si l'application reste en arrière-plan ou inactive pendant plus de 30 minutes, elle se repositionne automatiquement sur l'accueil et sur le jour courant lors de la reprise.
* **Calage visuel au chargement :**
  * Élimination des sauts d'affichage verticaux du bandeau supérieur au lancement de l'application.
