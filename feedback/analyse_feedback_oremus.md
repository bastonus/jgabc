# 📋 Tâches & Retours Utilisateurs — Oremus
*Suivi des actions et analyse exhaustive des retours utilisateurs au 25 septembre 2026 (Couvrant jusqu'à la Version 0.0.65)*

---

## 📑 Sommaire
1. [🛠️ Corrections Critiques, Bugs Techniques & Stabilité Mobile](#1-️-corrections-critiques-bugs-techniques--stabilité-mobile)
2. [📿 Corrections Liturgiques, Textes & Calendrier](#2--corrections-liturgiques-textes--calendrier)
3. [🎯 Expérience Utilisateur (UX), Gestuelle & Onboarding](#3--expérience-utilisateur-ux-gestuelle--onboarding)
4. [🚀 Nouvelles Fonctionnalités & Évolutions Liturgiques](#4--nouvelles-fonctionnalités--évolutions-liturgiques)
5. [🔍 Recherche Globale Intelligente, Design System & Répertoire Étendu](#5--recherche-globale-intelligente-design-system--répertoire-étendu)
6. [🎧 Améliorations du Lecteur Audio, Grégorien & Suivi de Portée](#6--améliorations-du-lecteur-audio-grégorien--suivi-de-portée)
7. [⚠️ Point de Fond : Concordance des Textes Bibliques & Sources Traduction](#7-️-point-de-fond--concordance-des-textes-bibliques--sources-traduction)
8. [📊 Matrice Exhaustive de Traçabilité des Retours (Submissions CSV & Évolutions)](#8--matrice-exhaustive-de-traçabilité-des-retours-submissions-csv--évolutions)

---

## 1. 🛠️ Corrections Critiques, Bugs Techniques & Stabilité Mobile

- [x] **Bouton d'accès rapide « Aujourd'hui » inaccessible sur mobile :**
  - *Origine du retour :* Utilisateur `kbzGlXM` (27/08).
  - *Correction :* Intégration de `padding-bottom: max(16px, env(safe-area-inset-bottom, 0px))` et calage dynamique de la barre de navigation basse sur Android et iOS pour éviter tout masquage par les boutons de navigation système. *(Livré en v0.0.45)*
- [x] **Saut d'affichage du header au chargement :**
  - *Origine du retour :* Utilisateur `1W6ZayQ` (26/08).
  - *Correction :* Marge haute du header appliquée nativement en CSS avec `padding-top: env(safe-area-inset-top)` dès le premier rendu, éliminant le saut visuel vertical. *(Livré en v0.0.45)*
- [x] **Débordement des titres / chapeaux de fêtes longs :**
  - *Origine du retour :* Utilisateur `bZzeZb1` (27/08).
  - *Correction :* Maintien sur une seule ligne avec défilement automatique fluide (*marquee* 2 cycles temporaires avec fondus doux de masque) et chevron déroulant `⌄` fixé en bout de ligne (`flex-wrap: nowrap`) restant toujours accessible. *(Livré en v0.0.45 & v0.0.47)*
- [x] **Espacements anormaux en fin de messe :**
  - *Origine du retour :* Utilisateur `e5v4VZO` (25/08).
  - *Correction :* Nettoyage des marges CSS et `min-height` excessifs sur les conteneurs de fin de célébration (*Conclusio*). *(Livré en v0.0.45)*
- [x] **Gestion des notifications push & Icône vectorielle officielle :**
  - *Origine du retour :* Amélioration système Android.
  - *Correction :* Déduplication stricte des alertes push (aucune répétition inutile), désactivation des alertes système lorsque l'application est active au premier plan, et intégration du tracé vectoriel du logo officiel Oremus (`ic_notification`) dans la barre d'état Android. *(Livré en v0.0.46 & v0.0.50)*
- [x] **Résolution de l'erreur 404 lors du téléchargement de mise à jour APK :**
  - *Origine du retour :* Maintenance pipeline de distribution.
  - *Correction :* Normalisation du binaire téléchargé sur `Oremus.apk` aligné sur les releases GitHub. *(Livré en v0.0.50)*
- [x] **Suppression de l'état de chargement « Oneratur... » dans l'en-tête & Correction d'affichage sur Android :**
  - *Origine du retour :* Utilisateur (01/09 avec capture d'écran).
  - *Problème :* Au lancement de l'application et lors des transitions sur Android, l'en-tête affiche en dur `Vesperæ • 24 Augusti` et le libellé `Oneratur…` (chargement) de manière saccadée, avec l'icône gauche rognée. Ce texte de chargement intermédiaire est inutile et dégrade l'impression de réactivité.
  - *Correction :* Suppression définitive du libellé statique `Oneratur…` et de la date factice dans `divinum-officium.html` et `js/divinum_officium.js` — état neutre `is-header-loading` avec chargement dynamique instantané sans flash ni rognage Android. *(Livré en v0.0.57)*
- [ ] **Résolution des Occurrences & Concurrences Liturgiques (Sélection 2026 / Temporel vs Sanctoral) :**
  - *Origine du retour :* Utilisateur `bZzJ6v0` (31/08).
  - *Problème :* Lorsqu'un jour présente deux offices en concurrence (ex. dimanche du Temporal coïncidant avec une fête du Sanctoral), l'application peut proposer ou afficher des solutions ambiguës dans la vue de l'année 2026.
  - *Spécification / Action requise :* Appliquer strictly les tables de préséance et règles d'occurrence du calendrier 1962 pour l'année 2026, afficher la fête prioritaire dans l'accès calendrier 2026, et répercuter cette hiérarchie de manière cohérente dans les sections Temporel et Sanctoral (avec commémorations appropriées).
- [x] **Correction des Faux Positifs et Boucle d'Alerte sur les Mises à Jour :**
  - *Origine du retour :* Utilisateur `Z9e4QR5` (01/09) et retours testeurs.
  - *Problème :* Une notification de mise à jour s'affichait de manière erronée ou en boucle alors que l'application était déjà à jour.
  - *Correction :* Synchronisation de `CURRENT_APP_VERSION` sur `'beta-0.0.64'` dans `js/divinum_officium.js`, renforcement du parser `parseVersionString` pour décoder de façon robuste les préfixes (`v`, `beta-`, `vbeta-`), détection native sous Android et synchronisation stricte avec `version.json`. *(Livré en v0.0.53 & stabilisé définitivement en v0.0.64)*
- [x] **Correction du Positionnement des Prières de Léon XIII dans le Sommaire (Index) de la Messe :**
  - *Origine du retour :* Utilisateur `Ge777Yp` (04/09, CSV `Oremus_Submissions_2026-09-24.csv`).
  - *Problème :* Dans la table des matières / sommaire de la Messe (`#doMassTocPanel`), la ligne « Prières de Léon XIII » s'insérait de manière erronée dans le groupe *1. Avant-Messe & Parole* immédiatement après le Gloria, alors qu'il s'agit des prières d'action de grâces prescrites à genoux après la fin de la célébration (*Post Missam* / après le Dernier Évangile).
  - *Diagnostic technique :* Dans `js/divinum_officium.js` (`_massTocGroups`), la détection de la Collecte s'appuyait sur `match: /^Oratio|^Collecta|^Collecte/i`. Or, la carte générée pour les prières de Léon XIII porte le titre `Orationes Leonis XIII` (`cardId: 'leonis'`). L'expression `^Oratio` capturait donc abusivement `Orationes Leonis XIII` dès le premier groupe (notamment sur les féries sans collecte propre). Par ailleurs, le groupe 4 (*Communion & Envoi*) n'intégrait aucun item dédié aux prières post-messe.
  - *Correction appliquée :*
    1. Filtre de l'oraison rendu strictement sélectif dans `_massTocGroups` : `match: /^(?!.*Leonis)(?:Oratio|Collecta|Collecte)/i`, `cardId: /^oratio$/i`.
    2. Item dédié ajouté en clôture du Groupe 4 (*4. Communion & Envoi*) : `{ label: "Prières de Léon XIII", match: /Leonis|Léon XIII/i, cardId: /^leonis$/i, badge: "Prières" }`.
    3. Prise en charge de la règle `Oratio Dominica` dans `extractCommuneRef` pour hériter automatiquement de la collecte dominicale sur les féries du temporel (`Tempora/*-0`). *(Livré en v0.0.65)*

---

## 2. 📿 Corrections Liturgiques, Textes & Calendrier

### 🔴 Typographie & Rubriques
- [x] **Mots de la Consécration en noir :**
  - *Origine du retour :* Utilisateur `vXKk7yA` (25/08).
  - *Correction :* Les paroles de la Consécration (*« HOC EST ENIM CORPUS MEUM »* / *« HIC EST ENIM CALIX SANGUINIS MEI... »*) sont affichées en noir et en gras (`.do-consecration-words`), distinctes des rubriques rouges. *(Livré en v0.0.45)*
- [x] ~~**Croix de l'Évangile en double :**~~ *(Annulé suite à clarification liturgique)*
  - *Origine du retour :* Utilisateur `bZzeZb1` (27/08).
- [x] **Rétablissement du Dernier Évangile (dans l'Ordinaire) :**
  - *Origine du retour :* Utilisateur `e5v4VZO` (25/08).
  - *Correction :* Réinséré explicitement avec ses dialogues préliminaires (*Dóminus vobíscum*, *Inítium sancti Evangélii...*), son texte intégral bilingue (*In princípio erat Verbum...* / *Au commencement était le Verbe...*) et son répons d'action de grâces (*Deo grátias*) dans la conclusion de l'Ordinaire (`do_data/missa/Latin/Ordo/Ordo.txt` et `do_data/missa/Francais/Ordo/Ordo.txt`) ainsi que dans le moteur d'assemblage (`js/divinum_officium.js`). *(Livré en v0.0.45)*

### 📅 Erreurs du Calendrier & Textes non traduits
- [x] **11 Juillet (Saint Pie Iᵉʳ) :** Doublon supprimé et intitulé harmonisé. *(Livré en v0.0.45)*
- [x] **16 Juillet (Notre-Dame du Mont-Carmel) :** Remplacé *Our Lady of Mount Carmel* par **Notre-Dame du Mont-Carmel** / **Beatæ Mariæ Virginis de Monte Carmelo**. *(Livré en v0.0.45)*
- [x] **25 Octobre (Saints Chrysanthe et Daria) :** Deuxième entrée dupliquée supprimée. *(Livré en v0.0.45)*
- [x] **2 au 9 Novembre (Octave des Défunts / Toussaint) :** Textes et intitulés traduits en français dans le calendrier et les dictionnaires (*Commémoration de tous les fidèles défunts*, *Quatre Saints Couronnés*). *(Livré en v0.0.45)*
- [x] **12 Novembre (Saint Martin Iᵉʳ) :** Traduction française complète de l'Officium, de la collecte, de la secrète et de la postcommunion ajoutée. *(Livré en v0.0.45)*
- [x] **13 Novembre (Saint Didace) :** Répétition en doublon supprimée. *(Livré en v0.0.45)*
- [x] **27 Novembre (Notre-Dame de la Médaille Miraculeuse) :** Rubriques liturgiques et annotations de chant traduites en français. *(Livré en v0.0.45)*
- [x] **29 Novembre (Vigile de Saint André) :** Entrées doublons fusionnées / dédupliquées. *(Livré en v0.0.45)*
- [x] **25 Décembre (Messe de Noël) :** Traductions françaises et titres complétés pour les trois messes de Noël (Minuit, Aurore, Jour). *(Livré en v0.0.45)*
- [x] **Fête des Saintes Reliques :** Remplacement systématique de l'intitulé anglais *Holy Relics* par **Fête des Saintes Reliques** / **In Festo Sanctarum Reliquiarum**. *(Livré en v0.0.45)*
- [ ] **Complétion des Propres & Féries résiduelles :**
  - Traitement progressif des 47 jours répertoriés dans le rapport d'intégrité présentant des pièces orphelines ou non traduites (ex. 16-17 fév., 4-9-21-25-27 mai, 12-30 juin, 18-21-25 janv., etc.).
- [ ] **Suppression du chant grégorien sur les bénédictions et versets conclusifs :**
  - *Origine du retour :* Utilisateur `YjqWEDB` (02/09) (*« Remove grgeorian chant for blessing and... »*).
  - *Problème :* Des partitions grégoriennes ou boutons de chant s'affichent par erreur sur les rubriques de bénédiction finale (*« Benedícat vos omnípotens Deus... »*) ou certains versets de renvoi qui doivent être récités ou dits recto tono par le célébrant sans partition musicale ornée.
  - *Spécification / Action requise :* Filtrer et exclure l'assignation de partitions grégoriennes pour les rubriques de bénédiction et les dialogues conclusifs non chantés dans le générateur de la messe.
- [ ] **Restauration intégrale des accents diacritiques dans les textes français :**
  - *Origine du retour :* Utilisateur `NqO6a2l` (02/09, avec capture d'écran).
  - *Problème :* Certaines pages ou sections affichent du texte français dépourvu d'accents (résidu d'anciennes conversions en ASCII pur de certains formulaires du Missel), nuisant à la lisibilité et à la dignité typographique.
  - *Spécification / Action requise :* Réviser l'encodage et réinjecter les accents français complets (é, è, ê, à, â, î, ô, ù, û, ç) dans l'ensemble des fichiers de traductions de l'Ordinaire et du Propre (`do_data/missa/Francais/` et `do_data/horas/Francais/`).

---

## 3. 🎯 Expérience Utilisateur (UX), Gestuelle & Onboarding

- [x] **Découvrabilité du texte bilingue (Latin / Français) :**
  - *Origine du retour :* Utilisateurs `bZzeZb1` (27/08) et `OQE1AvR` (26/08).
  - *Correction :* Indicateur visuel animé inspiré de Samsung One UI (`#doBilingualGestureIndicator`), dégradé arrondi aux couleurs d'accentuation (`var(--primary-color)`), impulsion unique, bascule de texte élargie (-110px), fondu en fin de course, déclenchement après défilement sur les sections textuelles (hors grégorien) et relance périodique. *(Livré en v0.0.45)*
- [x] **Gestion du bouton Retour (Back navigation) sous Android :**
  - *Origine du retour :* Utilisateur `jezD1o9` (26/08).
  - *Correction :* Prise en charge native de l'événement matériel Android via Capacitor (`App.addListener('backButton')` dans `js/divinum_officium.js:18890`). La fonction `handleAppBackButton` ferme séquentiellement toutes les modales ouvertes (panneau de configuration, tiroir latéral, recherche universelle, zoom, notifications, sommaire de messe, sélecteur d'heures), puis navigue en arrière dans l'historique ou réinitialise la vue à l'accueil sans quitter l'application intempestivement. *(Livré en v0.0.50)*
- [x] **Réinitialisation automatique à l'accueil :**
  - *Origine du retour :* Utilisateur `gbzjKQ4` (26/08).
  - *Correction :* Détecteur d'inactivité réinitialisant automatiquement l'affichage sur la page d'accueil et sur la date du jour actuel après 30 minutes de mise en arrière-plan ou d'absence d'activité (`checkInactivityReset`). *(Livré en v0.0.45)*
- [ ] **Onboarding & Clarté de la navigation liturgique :**
  - *Origine du retour :* Utilisateur `OQE1AvR` (26/08).
  - *Spécification :* Ajout d'une courte présentation au premier lancement ou d'infobulles contextuelles discrètes pour expliquer la navigation entre calendrier annuel, Temporal, Sanctoral et Bréviaire.
- [x] **Satisfaction Utilisateur, Ergonomie Moderne & Électro-choc Visuel (« Slay l'app ») :**
  - *Origine du retour :* Utilisateur `LDoyZjy` (04/09, CSV `Oremus_Submissions_2026-09-24.csv`).
  - *Verbatim :* *« Slay l'app »* (expression populaire célébrant une esthétique frappante et une exécution particulièrement soignée).
  - *Impact :* Plébiscite la modernisation de l'expérience utilisateur d'Oremus : thème One UI, fluidité des transitions, animations soignées, design glassmorphism épuré et réactivité du moteur liturgique. *(Validé en v0.0.57)*

---

## 4. 🚀 Nouvelles Fonctionnalités & Évolutions Liturgiques

- [x] **Table des matières / Index de la Messe (Sommaire flottant) :**
  - *Origine du retour :* Utilisateur `AryZE8l` (25/08).
  - **Déclencheur (Pilule flottante) :** Pilule discrète sur le côté droit de l'écran, positionnée de façon à ne jamais recouvrir ou chevaucher le lecteur audio (décalage dynamique en CSS/JS lorsque le `#modernPlayerBar` est actif).
  - **Rendu visuel du Sommaire :** Volet épuré/transparent **sans fond opaque**, avec une **ombre portée marquée** (`box-shadow`) et un flou d'arrière-plan subtil (`backdrop-filter: blur`), laissant transparaître le contenu de la messe.
  - **Liste défilante structurée :** Menu défilant fluide avec découpage à 2 niveaux (Macro-parties et étapes détaillées) :
    1. *Avant-Messe & Parole* : Prières au bas de l'autel, Introït, Kyrie, Gloria, Collecte, Épître, Graduel/Alléluia/Trait, Évangile, Credo.
    2. *Offertoire & Préparation* : Offertoire, Oblation, Lavabo, Secrète.
    3. *Canon & Consécration* : Préface & Sanctus, Canon Romain, Consécration/Élévation, Pater Noster.
    4. *Communion & Envoi* : Agnus Dei, Communion, Postcommunion, Bénédiction & Dernier Évangile.
  - **Interactions :** ScrollSpy en temps réel (mise en valeur de l'étape courante), défilement fluide (*smooth scroll*) avec compensation du header fixe lors du clic sur une section. *(Livré en v0.0.45)*
- [x] **Barre de progression de lecture :**
  - *Origine du retour :* Utilisateur `NqPpWDb` (26/08).
  - *Correction :* Indicateur visuel discret de défilement horizontal (jauge fine) permettant de situer précisément sa progression dans l'Ordinaire et les propres de la messe. *(Livré / Réalisé)*
- [ ] **Évangile et Commémoration du Temporal en cas de fête sanctorale :**
  - *Origine du retour :* Utilisateur `5XMRJoP` (25/08).
  - *Spécification :* Lorsque la messe célébrée est celle d'un saint (Sanctoral) qui prime sur un dimanche ou une férie privilégiée (Temporal), afficher automatiquement en bas de page l'oraison de commémoration ainsi que le Dernier Évangile propre du temporal.
- [x] **Messes Diverses, Votives & Particulières hors calendrier (Mariage, Requiem, Défunts) :**
  - *Origine du retour :* Utilisateurs `8NrLz1l` (27/08) et `o9xQ9MN` (04/09, CSV `Oremus_Submissions_2026-09-24.csv` : *« Ou sont les messes particulières ? Messe de requiem, de mariage? »*).
  - *Synthèse du besoin & Renforcement :* Demande formulée de façon récurrente par les fidèles et les chantres, soulignant le besoin d'accéder directement aux formulaires liturgiques hors temporal/sanctoral régulier sans avoir à chercher leur date ou leur code interne.
  - *Correction & Solution déployée :*
    1. **Accès UI Dédié dans le Menu Déroulant du Header (après Temporal et Sanctoral) :**
       - Retrait de la navigation principale (sidebar et carte d'accueil) pour ne pas encombrer le parcours quotidien.
       - Ajout d'un 4ᵉ onglet dédié officiel **« Votivæ et aliæ missæ »** (`data-mode="votives"`) dans le menu déroulant supérieur (`#headerDropdown`), positionné logiquement après *Temporal* et *Sanctoral*.
       - Présentation fluide sous forme de cartes glassmorphism classées selon la taxonomie liturgique traditionnelle du Missel Romain : *Aliæ Missæ (Circonstances & Défunts)* et *Missæ Votivæ (Votives hebdomadaires)*.
       - Grille responsive 2x2 optimisée sur mobile (`flex: 1 1 calc(50% - 6px)`) pour garantir une lisibilité irréprochable sans troncature du titre.
       - Sélecteur de date et calendrier dépliable maintenus actifs et visibles en permanence dans tous les modes pour une ergonomie homogène et stable.
       - Intégration dans la recherche en temps réel du menu déroulant (indexation des mots-clés comme "requiem", "mariage", etc.).
    2. **Formulaires Complets Bilingues Défunts & Mariage :**
       - Intégration intégrale en Latin et Français de la *Missa Defunctorum* (`do_data/missa/Latin/Votive/Defunctorum.txt` & `Francais/...`) avec Introït, Oraisons, Épître, Graduel, Trait, Séquence complète du *Dies Iræ* (58 versets), Évangile, Offertoire, Secrète, Communion et Postcommunion.
       - Intégration intégrale en Latin et Français de la *Missa pro Sponso et Sponsa* (`do_data/missa/Latin/Votive/Nuptialis.txt` & `Francais/...`) avec bénédiction nuptiale.
       - Prise en charge des messes pour le Pape (*Coronatio*), la Propagation de la Foi, la Dédicace d'une église, et des 7 formulaires votifs hebdomadaires (Trinité, Anges, Saint Joseph, Saint-Sacrement, Sacré-Cœur, Sainte Vierge, Saints Apôtres).
    3. **Ergonomie & Workflow :**
       - Affichage épuré directement au texte de la messe sans bandeau parasite superflu en haut de page.
       - Deep linking URL synchronisé (`?key=requiem`, `?key=nuptial`, etc.) et fermeture native par touche retour Android (`handleAppBackButton`). *(Résolu en v0.0.65)*
- [x] **Intégration du Kyriale & Choix Chanté / Psalmodié (Chant Tools) :**
  - *Origine du retour :* Utilisateurs `gbzNPpJ` (28/08) et `Yj97Bg5` (31/08).
  - *Correction :* Titres interactifs avec chevrons circulaires, tiroir bottom sheet glassmorphism (`#massPartPickerDrawer`), grille 1:1 lazy & liste, ton psalmodié ℣, versets ad libitum sous GABC et deep linking URL synchronisé. *(Livré en v0.0.57)*
- [x] **Biographies, Paratexte & Iconographie des Saints (Accueil & Messe) :**
  - *Origine du retour :* Utilisateur `M1Vjpql` (31/08).
  - *Correction & Solution déployée :*
    1. **Données Biographiques & Paratexte (Zéro nouveau fichier, lecture directe du dépôt) :**
       - Oremus exploite directement les fichiers de base du dépôt (`do_data/horas/` et `do_data/missa/`).
       - Extraction dynamique à la volée de la `Lectio94` / `Lectio93` (notice biographique concise officielle des rubriques de 1960) et des `Lectio 4-5-6` du Bréviaire pour le jour affiché.
       - Fallback automatique vers le *Martyrologe Romain* (`do_data/horas/.../Martyrologium/`) pour les simples commémoraisons.
    2. **Solution pour l'Iconographie (Module `.pack` externe optionnel ou Secours en Ligne) :**
       - **Stockage externe hors APK :** Les images des saints ne sont plus incluses par défaut dans le package d'installation APK de base afin de maintenir un binaire ultra-léger.
       - **Module Téléchargeable (.pack) :** Un fichier pack unique (`saints_pack.zip` ou `saints.pack` d'environ 8,5 Mo à 12 Mo non compressé / ~8 Mo compressé) est proposé au téléchargement facultatif dans les paramètres de l'application pour un usage 100% hors-ligne.
       - **Fallback en Ligne (GitHub Raw CDN) :** Si le module `.pack` n'est pas installé localement, les images sont récupérées à la volée une par une depuis les serveurs GitHub Content (`https://raw.githubusercontent.com/bastonus/jgabc/main/img/saints/{MM-DD}.webp`) et stockées dans le cache local (Service Worker / CacheStorage).
    3. **Rendu Visuel sur l'Accueil & Design System :**
       - Nouvelle carte immersive `.do-home-saint-card` positionnée sous la barre de recherche sur la page d'accueil d'Oremus.
       - Miniature portrait avec filet doré (`1px solid rgba(212, 175, 55, 0.4)`), badge de fête, titre, notice biographique avec bouton dépliable fluide *« Lire la suite »*, et accès direct à la messe du jour. *(Livré en v0.0.53)*
- [ ] **Mode d'affichage autonome « Kyriale Seul » (sans l'Ordinaire complet) :**
  - *Origine du retour :* Utilisateur `Ge75aZO` (04/09) (*« Il faudrait pouvoir avoir le choix du kyriale et pouvoir mettre le kyriale sans tout l’ordinaire »*).
  - *Spécification / Action requise :* En complément du sélecteur interactif des Messes I à XVIII et des Credos, proposer une option de filtrage « Kyriale seul » permettant aux chantres et fidèles d'afficher directement la séquence des chants de l'Ordinaire (Asperges, Kyrie, Gloria, Credo, Sanctus, Agnus Dei, Ite) sans dérouler les prières au bas de l'autel, le Canon romain et les oraisons privées du prêtre.
- [ ] **Clarification & Périmètre : Demande d'intégration du Nouvel Ordo (Novus Ordo Missae) :**
  - *Origine du retour :* Utilisateur `5XOzW46` (02/09) (*« Est-ce que vous pouvez mettre aussi le nouvel ordo ? »*).
  - *Analyse & Décision de conception :* Oremus est centré sur le Missel et Bréviaire traditionnel de 1962 (forme extraordinaire / *Vetus Ordo*), avec son corpus grégorien complet et son calendrier propre. L'intégration du Nouvel Ordo (Paul VI 1970/2002) introduirait un lectionnaire triennal (A/B/C) et une structure divergente. La priorité demeure l'excellence et la complétion intégrale du rite traditionnel 1962 ; la faisabilité d'un module optionnel distinct reste répertoriée pour étude future.
- [ ] **Audit et Complétion des Petites Heures du Bréviaire (Capitules & Répons Brefs) :**
  - *Origine du retour :* Utilisateur `5XOzW46` (02/09) (*« Pour les offices, pourquoi les petites heures n'ont pas de capitule, voire certaines heures pas de réponds »*).
  - *Spécification / Action requise :* Auditer l'arbre de dérivation liturgique de `do_data/horas/` sur les Heures mineures (Prime, Tierce, Sexte, None). Distinguer les cas liturgiquement normaux (ex. Triduum sacré, Défunts où le capitule/répons est omis par rubrique) des manques de données dans certains offices propres ou communs, et veiller à ce que le moteur injecte toujours le *Capitulum* et le *Responsorium breve* appropriés.

---

## 5. 🔍 Recherche Globale Intelligente, Design System & Répertoire Étendu

- [x] **Bouton de recherche globale :**
  - *Origine du retour :* Utilisateurs `M1VjpKE` (31/08) et `Z9ebbd0` (31/08).
  - *Correction :* Intégration d'un bouton loupe dédié dans l'en-tête à côté du logo Oremus et d'une barre de recherche harmonisée (hauteur 38px, arrondi 10px) sur l'écran d'accueil. *(Livré en v0.0.47 & v0.0.52)*
- [x] **Moteur de recherche universel instantané (< 2 ms / 0 ms APK) :**
  - *Origine du retour :* Utilisateurs `M1VjpKE` (31/08) et `Z9ebbd0` (31/08).
  - *Correction :* Moteur de recherche plein-texte synchrone embarqué en mémoire (`js/gregorian_search_engine.js` et `js/gregorian_index_data.js`), indexant **2292 éléments** :
    - 566 Messes du Missel Romain avec propres complets (Introït, Collecte, Épître, Graduel, Évangile, Offertoire, Secrète, Communion).
    - Tous les Offices canoniques du Bréviaire.
    - Les 73 livres de la Sainte Bible (Vulgate latine clémentine avec numérotation nette des versets).
    - L'intégralité du répertoire de chants grégoriens.
  - Surlignage intelligent (*highlight*) des termes recherchés et isolation stricte par langue active. *(Livré en v0.0.47 à v0.0.52)*
- [x] **Affichage & Prévisualisation des résultats (Grille / Ligne & Partitions GABC) :**
  - *Origine du retour :* Utilisateur `M1VjpKE` (31/08).
  - *Correction :* Double mode d'affichage mémorisé (Grille carrée 1:1 avec aperçu dynamique de la partition grégorienne via rendu différé *lazy rendering*, et Mode Ligne avec extraits textuels). Barre de pastilles filtres fluides scrollables horizontalement. *(Livré en v0.0.47 & v0.0.49)*
- [x] **Architecture Modulaire Externe & Adaptation du Script de Build APK (`.pack` / CDN) :**
  - *Origine du retour :* Optimisation du poids de l'APK de base et personnalisation du stockage par l'utilisateur.
  - *Pipeline APK mis à jour ([package.json](file:///d:/Documents/jgabc/package.json)) :*
    1. **Packaging Automatisé (`tools/build_modules.mjs`) :** Génération automatique de `dist_modules/saints.pack` (~8 Mo) et `dist_modules/gabc.pack` (~6,5 Mo).
    2. **Nettoyage APK (`tools/clean_android_assets.mjs`) :** Suppression automatique des 8 350+ fichiers `.gabc` et du répertoire `img/saints/` du bundle `android/app/src/main/assets/public/` lors de `npm run cap:sync` / `cap:build`.
  - *Comportement In-App :*
    - **Mode En Ligne (Défaut) :** Récupération à la volée depuis GitHub Raw CDN (`https://raw.githubusercontent.com/bastonus/jgabc/main/...`) avec mise en cache progressive localement (CacheStorage).
    - **Mode Hors-Ligne (Paramètres) :** Téléchargement des archives `.pack` optionnelles directement dans l'application. *(Livré en v0.0.54 / Pipeline prêt)*
- [ ] **Unification du Système et Design System de toutes les Barres de Recherche :**
  - *Problème :* Dispersion de styles et de comportements entre la barre d'accueil, la barre de recherche universelle du header et d'éventuels filtres annexes (psaumes, bréviaire).
  - *Spécification / Solution :* Harmoniser l'ensemble des champs de recherche de l'application sur le même design system unifié (hauteur `38px`, `border-radius: 10px`, fond highlight sans bordure, icône loupe à gauche animée aux couleurs d'accentuation, bouton croix `x` de réinitialisation rapide, et barre de pastilles de filtres fluides).
- [ ] **Amélioration UX : Clic Direct & Suppression du Double-Clic de Recherche :**
  - *Problème :* Sur la page d'accueil ou lors du basculement vers la recherche, l'utilisateur doit actuellement cliquer deux fois pour activer le champ et commencer à saisir sa requête.
  - *Spécification / Solution :* Dès le premier clic ou tap sur la barre d'accueil ou l'icône loupe, déclencher instantanément le basculement vers la vue de recherche et donner le focus clavier automatique (`input.focus()`) sans délai ni second clic requis.
- [x] **Adaptation Responsive de la Grille de Résultats sur Desktop (Multi-colonnes) :**
  - *Origine du retour :* Retour testeurs (01/09).
  - *Correction :* Déverrouillage de la largeur du conteneur en mode recherche et grille fluide adaptative implémentée dans `css/gregorian_search.css:355-374` : 2 colonnes sur mobile (`repeat(2, 1fr)`), 3 colonnes sur tablette (`min-width: 600px : repeat(3, 1fr)`), et multi-colonnes adaptatives sur grand écran (`min-width: 901px : repeat(auto-fill, minmax(150px, 1fr))`). *(Livré en v0.0.52)*
- [x] **Transformation de la Recherche en « Répertoire Grégorien » / Grégobase Intégrée & Mise en Valeur des Partitions GABC :**
  - *Constat & Problématique :* Les milliers de partitions GABC de l'application (avec neumes carrés SVG, modes 1 à 8 et synthèse audio) ne sont aujourd'hui découvertes que lors d'une saisie dans la barre de recherche. Sans requête, la page ressemble à un moteur de recherche vide plutôt qu'à un recueil musical et liturgique vivant.
  - *Correction & Solution déployée :*
    1. **Section Dédiée Grégobase dans la Barre Latérale :** Bouton permanent « Grégobase » (`#btnSidebarGregobase`) élevant la base de données grégorienne au même rang que le *Missale*, le *Breviarium* et la *Sacra Biblia*.
    2. **Hub d'Exploration Structuré par Onglets :** Interface complète avec onglets Vue d'ensemble, Usages liturgiques, Sources historiques, Modes musicaux (tons 1 à 8) et recherche textuelle instantanée (`js/gregobase_ui.js`, `css/gregobase.css`).
    3. **Rendu Vectoriel des Neumes Anciens NABC (Saint-Gall & Laon) :** Projection directe des neumes adiastématiques au-dessus des notes carrées Exsurge via polices médiévales (`fonts/gregall.ttf`, `grelaon.ttf`, `gresgmodern.ttf`) et table GregorioTeX (`js/gregall_cmap.json`).
    4. **Deep-Linking & Partage :** Synchronisation complète des paramètres d'URL (`hora=gregobase&gbtab=...&gbf=...&gbq=...`). *(Livré en v0.0.65)*
- [ ] **Accès direct aux Prières Isolées & Antiennes autonomes :**
  - *Origine du retour :* Utilisateur `Z9ebbd0` (31/08).
  - *Spécification :* Créer une rubrique dédiée pour interroger et afficher directement des antiennes ou prières individuelles isolées (hors flux complet d'office ou de messe).
- [x] **Vue Liste : Extraits Surlignés (Highlights) Calés sur 2 Lignes :**
  - *Origine du retour :* Retour testeurs (01/09).
  - *Correction :* Application stricte du serrage sur 2 lignes avec ellipse dans `css/gregorian_search.css:976-980` (`.gregorian-results.is-list .gregorian-card-middle, .gregorian-results.is-list .gregorian-text-preview { display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; text-overflow: ellipsis !important; }`). *(Livré en v0.0.52)*
- [x] **Barre de Recherche Desktop : Épuration & Alignement Largeur Résultats :**
  - *Origine du retour :* Retour testeurs (01/09).
  - *Correction :*
    1. **Masquage du chevron gauche sur desktop :** Bouton hamburger (`.do-mobile-menu-btn`) masqué en CSS sur écran desktop (`@media (min-width: 901px) { body.is-search-mode .do-mobile-menu-btn { display: none !important; } }`).
    2. **Alignement de largeur :** Barre supérieure calée à `max-width: 760px; margin: 0 auto;` exactement alignée sur le flux des résultats. *(Livré en v0.0.52)*
- [ ] **Positionnement Aéré & Zone Rétractable au Scroll (Desktop Uniquement) :**
  - *Problème :* L'en-tête de recherche sur desktop est trop tassé en haut de page.
  - *Spécification / Solution :* Positionner la barre de recherche un peu plus bas avec un espacement supérieur aéré au repos, et intégrer une zone supérieure qui se rétracte de manière fluide lors du défilement (*shrink on scroll*), active uniquement sur Desktop.
- [ ] **Analyse & Spécification : Barre de Recherche en Bas d'Écran sur Mobile Uniquement (Bottom Search UX) :**
  - *Origine du retour :* Utilisateur (01/09).
  - *Analyse ergonomique & faisabilité :*
    1. **Ergonomie « Thumb Zone » (Zone du pouce) :** Sur les smartphones modernes de 6,5 à 6,9 pouces, le sommet de l'écran est inaccessible à une seule main sans réajuster la prise du téléphone. Placer le champ de recherche en bas d'écran (au-dessus de la barre de navigation système ou en barre flottante basse) permet une activation naturelle, sans contorsion, suivant les meilleures pratiques UX mobiles (Samsung One UI, Safari iOS, Google Chrome, Spotify).
    2. **Continuité avec le Clavier Virtuel :** Lorsque l'utilisateur touche la barre en bas, le clavier virtuel apparaît immédiatement en dessous. Le champ reste ainsi calé directement au-dessus des touches, avec la liste des résultats défilant au-dessus, évitant le grand écart visuel entre le haut de l'écran et le clavier.
    3. **Articulation avec le Lecteur Audio :** Sur mobile, le mini-lecteur audio (`#modernPlayerBar`) occupe déjà le bas de l'écran lorsqu'il est actif. La barre de recherche basse doit donc soit se superposer proprement au-dessus du lecteur, soit désancrer temporairement la barre du lecteur en mode recherche pour laisser la priorité à la saisie.
    4. **Dichotomie d'affichage Mobile vs Desktop :**
       - *Sur Mobile :* Barre de recherche ancrée en bas d'écran, ergonomique et centrée sur l'usage au pouce.
       - *Sur Desktop :* Barre de recherche maintenue en haut, large, aérée et rétractable au scroll.

---

## 6. 🎧 Améliorations du Lecteur Audio, Grégorien & Suivi de Portée

- [x] **Gestuelle de fermeture :**
  - *Origine du retour :* Utilisateur `PRkMQ1e` (26/08).
  - *Correction :* Mini-lecteur audio réductible et fermable d'un simple glissement vers le bas (*swipe down / grab handle*). *(Livré en v0.0.45)*
- [x] **Bouton cyclique de vitesse :**
  - *Origine du retour :* Utilisateur `8NMv4MO` (26/08).
  - *Correction :* Bouton unique cyclique à chaque appui : `x1.0` $\rightarrow$ `x1.25` $\rightarrow$ `x1.5` $\rightarrow$ `x2.0` $\rightarrow$ `x0.5` $\rightarrow$ `x0.75`. *(Livré en v0.0.45)*
- [x] **Correction du Calcul de Vitesse & Synchronisation BPM (Synthétiseur GABC) :**
  * *Origine du retour :* Utilisateur `8NMv4MO` (26/08) et nouveau retour utilisateur direct (04/09) (*« desolé ca marche toujours pas, ya que le 1X qui est a la bonne vitesse, tous les autres sont trop lents, ils semblent pas calsulés de la meme manière sur que le 1X (que pour le synthé evidemmebnt) »* ; *« en revenant à x1; le synthé s'arrête entièrement »*).
  * *Problème & Diagnostic technique :* Seule la vitesse `1X` s'exécutait à la bonne cadence. Dès qu'un multiplicateur de vitesse différent était sélectionné (`x0.5`, `x0.75`, `x1.25`, `x1.5`, `x2.0`), la lecture devenait incohérente ou figée car `Tone.Transport.scheduleOnce` utilisait le temps audio absolu `seconds` ou subissait des sauts d'incréments de fréquence qui faisaient sauter les ticks stricts (`event.time === tick`), coupant net la boucle au retour vers `1X`.
  * *Solution appliquée :* Nouveau scheduler de haute précision `scheduleNextNote` avec `Tone.context.setTimeout` (Web Worker timer sans dérive ni perte d'événement) calculé directement en secondes `(60 / curBpm) * duration`. Cycle fluide et ininterrompu à toutes les vitesses sans jamais geler ni couper le synthé. *(Livré en v0.0.56)*
- [x] **Bug du Curseur de Progression & Horodatage au Premier Clic (Seek initial) :**
  * *Origine du retour :* Utilisateur direct (04/09) (*« lorsque l'n clique pour la première fois, le curseur reste 2 secondes au bon endroit, puis se vide, mais la veluer de l'hordatage ne chnage pas c'est bizarre »*).
  * *Problème & Diagnostic :* Conflit de concurrence dans `startDoProgressTracking` où un tick asynchrone d'état venait réécraser la jauge de progression avant confirmation du seek audio.
  * *Solution appliquée :* Verrou temporel de sécurité `_isUserSeekingUntil` posé sur les interactions utilisateur sur la barre, couplé à un calcul pondéré des durées dans le tracker du synthé. *(Livré en v0.0.56)*
- [x] **Maintien du Playback Audio lors du Repli du Tiroir des Sources Vidéo :**
  * *Origine du retour :* Utilisateur `PRP5ayd` (02/09) (*« Sur l'audio, il ne faut pas quil se mette en pause lorseu l'on ferme les sources. »*).
  * *Solution appliquée :* Suppression de l'appel `pauseAll()` lors du repli du tiroir (`#playerBtnExpandVideos`). La fermeture du panneau ne coupe plus la lecture audio. *(Livré en v0.0.56)*
- [x] **Désactivation par Défaut de la Synchronisation sur les Sources YouTube :**
  * *Origine du retour :* Utilisateur `PRP5ayd` (02/09) (*« Il faut aussi que le sync soit désactivé par défaut sur les sources yt comme elles ne marchent pas vraiment. »*).
  * *Solution appliquée :* `window.doYT.syncEnabled` configuré à `false` par défaut avec possibilité d'activation manuelle via `#playerBtnToggleSync`. *(Livré en v0.0.56)*
- [x] **Diagnostic des Sources Audio sur Pages Isolées & Message de Repli GABC :**
  * *Origine du retour :* Utilisateur `PRP5ayd` (02/09) (*« Aussi il faut comprendre pourquoi ça ne marche pas sur certaines sources dans les pages seules... A ce moment s'il n'y a rien mettre un message qui affiche gabc et aucune autre source disponible »*).
  * *Solution appliquée :* Transmission des métadonnées GABC sur la vue isolée via `do-chant-main-view-card` et attente asynchrone de `chant:rendered`. Message clair et explicite en cas d'absence de source vidéo externe. *(Livré en v0.0.56)*
- [x] **Suivi Intelligent, Retour Sticky & Centrage au Changement de Portée :**
  - *Origine du retour :* Retour testeurs (01/09).
  - *Correction :* Moteur de centrage doux `centerActiveNote` et `initUserScrollTracker` implémenté dans `js/divinum_officium.js:7690-7760`. Positionnement vertical centré au milieu exact de la zone visible (`visibleMid`), détection automatique des sauts de portée (transition > 60px) pour recentrer la vue sans à-coups note par note, et retour sticky automatique après inactivité si la lecture continue hors écran. *(Livré en v0.0.56)*
- [x] **Interface des Tons & Transposition du Lecteur Audio :**
  - *Origine du retour :* Utilisateur `8NMv4MO` (26/08).
  - *Correction :* Remplacement de l'ancien cycle fastidieux par le tiroir de tonalité `#playerPitchDrawer` et la grille de pastilles interactives `#playerPitchBubbleGrid` (13 demi-tons chromatiques de -6 à +6 autour du ton naturel avec bouton de réinitialisation rapide). *(Livré en v0.0.56)*
- [x] **Intégration & Extension Massive des Enregistrements YouTube / Audio (14 000+ Pièces) :**
  - *Origine du retour :* Utilisateur `LDOAoxG` (01/09).
  - *Correction :* Scraper multi-sources automatisé ([`tools/scrape_gregorian_youtube.py`](file:///d:/Documents/jgabc/tools/scrape_gregorian_youtube.py)) ayant initialement associé 1 645 pièces, puis étendu massivement à **plus de 14 000 enregistrements YouTube / YouTube Music** intégrés dans [`js/gregorian_youtube_links.js`](file:///d:/Documents/jgabc/js/gregorian_youtube_links.js) (Marek Klein, Abbaye de Fontgombault, Solesmes, Le Barroux, Ensemble Organum, etc.). *(Livré en v0.0.53 & v0.0.58)*
- [x] **Moteur Audio & Synthèse sonore :**
  - *Origine du retour :* Utilisateur `X5QlZ7V` (26/08).
  - *Correction :* Synthèse sonore enrichie reproduisant les harmoniques chaleureuses d'un orgue liturgique à tuyaux (positif d'orgue). *(Livré en v0.0.45)*
- [x] **Laboratoire d'Alignement Grégorien IA, Suivi Note-à-Note Exsurge & Infrastructure Distribuée :**
  - *Origine :* Évolution technologique majeure du lecteur et des partitions interactives.
  - *Réalisations livrées (v0.0.59 à v0.0.64) :*
    1. **Laboratoire d'Alignement (`alignment-lab.html` & portail `/worker`) :** Station de calage temporel haute précision permettant d'aligner chaque note et neume sur l'audio réel.
    2. **Double Modèle IA (MMS_FA + TorchCREPE) :** Modèle combinant reconnaissance phonétique du latin d'église et suivi de hauteur mélodique, avec script distributed worker 1-clic (`worker.py`, `run.sh`, `run.ps1`) et accélération GPU NVIDIA CUDA.
    3. **Rendu Exsurge Immersif & Suivi Interactif :** Partitions grégoriennes vectorielles Exsurge adaptées au mode nuit (neumes blancs), synchronisation note-par-note temps réel avec défilement automatique doux (*auto-scroll*), click-to-seek direct sur la partition et revue collaborative.
    4. **Serveur Autonome Coolify (`api-oremus.silverhorse.fr`) :** API de synchronisation continue des avis et scores alignés, file de réessai hors-ligne et publication automatisée. *(Livré en v0.0.59 - v0.0.64)*

---

## 7. ⚠️ Point de Fond : Concordance des Textes Bibliques & Sources Traduction

- [x] **Harmonisation Vulgate latine / Traduction française traditionnelle :**
  - *Origine du retour :* Utilisateur `2joly9M` (29/08).
  - *Problème :* Décalages fréquents de versets, de numérotation et de sens entre la Vulgate tridentine/clémentine utilisée pour le latin et le texte français issu de l'AELF (qui traduit la Néo-Vulgate post-Vatican II, par exemple dans Tobie 7).
  - *Correction :* Remplacement complet de l'AELF par la traduction catholique traditionnelle du Chanoine Crampon (édition révisée 1923, 73 livres canoniques, 35 580 versets) extraite de l'édition de référence de Guillaume Nodet / La Porte Latine. Alignement parfait verset par verset (1:1 direct) avec la Vulgate clémentine sur Tobie (20 versets au ch. 7), Judith, Esther et le Nouveau Testament. Réalignement liturgique des 150 Psaumes et typographie française soignée (espaces insécables). Dossier `crampon/` créé et synchronisé. *(Livré en v0.0.53)*

---

## 8. 📊 Matrice Exhaustive de Traçabilité des Retours (Submissions CSV & Évolutions)

| # | Submission ID | Date & Heure (UTC) | Contact / Email | Catégorie | Demande / Verbatim Utilisateur | Action & Impact Oremus | Statut | Version de livraison |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **1** | `e5v4VZO` | 2026-08-25 22:59 | Anonyme | Correction de texte liturgique | *« Il faut mettre le dernier évangile et remettre en page correctement la fin de la messe. Il y a des espaces gigantesque qui n’ont pas de sens »* | Rétablissement du Dernier Évangile & suppression des espacements fin de messe. | **Résolu** | v0.0.45 |
| **2** | `AryZE8l` | 2026-08-25 23:01 | Anonyme | Suggestion de fonctionnalité | *« Mettre un index des parties de la messe pour pouvoir naviguer plus vite »* | Conception du Sommaire flottant translucide avec ScrollSpy à 4 niveaux. | **Résolu** | v0.0.45 |
| **3** | `5XMRJoP` | 2026-08-25 23:03 | Anonyme | Suggestion de fonctionnalité | *« Mettre l’évangile du temporal quand une fête du sanctoral plus importante tombe le meme jour »* | Ajout automatique de l'oraison de commémoration et du Dernier Évangile du Temporal. | **Planifié** | *Prochaine version* |
| **4** | `rDv7xr2` | 2026-08-25 23:24 | Anonyme | Correction de texte liturgique | *« On a our Lady of Mountain carmel dans le texte français au 16 juillet et au 11 juillet on a deux fois pie1er. 2 sts chrysanthe et darie au 25 octobre et du 2 au 9 novembre il y a full anglais... »* | Correction et déduplication des fêtes du Sanctoral (11 juil, 16 juil, 25 oct, 2-9 nov, 12 nov, 13 nov, 27 nov, 29 nov, 25 déc). | **Résolu** | v0.0.45 |
| **5** | `vXKk7yA` | 2026-08-25 23:29 | Anonyme | Bug technique / affichage | *« Le HOC EST ENIM CORPUS MEUM et HIC EST ENIM SANGUINIS ... sont en rouge et pas en noir »* | Typographie noire et grasse pour les paroles de la Consécration (`.do-consecration-words`). | **Résolu** | v0.0.45 |
| **6** | `bZv0op0` | 2026-08-26 06:58 | Anonyme | Remarque générale | *« https://bastonus.github.io/jgabc/divinum-officium.html »* | Vérification et point de repère sur le déploiement web de référence. | **Traité** | v0.0.45 |
| **7** | `PRkMQ1e` | 2026-08-26 09:40 | Anonyme | Suggestion de fonctionnalité | *« Faire en sorte que le lecteur soit grabbable pour le fermer avec un Scroll vers le bas »* | Ajout du geste de glissement vers le bas (*swipe down*) pour fermer le mini-lecteur audio. | **Résolu** | v0.0.45 |
| **8** | `8NMv4MO` | 2026-08-26 09:51 | Anonyme | Suggestion de fonctionnalité | *« Faire des boutons de paramètres avancés du lecteur plus simples avec un bouton vitesse qui utilise une boucle x1 x1.25 x2 x0.25 x0.5 x0.75... Trouver une solution pour les tons »* | Bouton cyclique de vitesse en 1 clic ; sélecteur de tonalités par grille de pastilles chromatiques (-6 à +6) et reset. | **Résolu** | v0.0.45 & v0.0.56 |
| **9** | `1W6ZayQ` | 2026-08-26 09:55 | Anonyme | Bug technique / affichage | *« Comorendre pourquoi sur mobile ça charge d'abord le headeer en haut avant de le remplacer en dessous de la safe bar »* | Application native CSS du `padding-top: env(safe-area-inset-top)` supprimant le saut visuel. | **Résolu** | v0.0.45 |
| **10** | `OQE1AvR` | 2026-08-26 11:14 | bertrand.du.boullay@gmail.com | Remarque générale | *« Bonjour, je viens de télécharger votre APK... certaines fêtes sont indiquées en anglais. Pour le reste ...attendons que je maîtrise mieux la navigation. It's not obvious for now. »* | Traduction des fêtes anglaises complétée ; intégration d'onboarding/ergonomie planifiée. | **Résolu (Textes)** / **Planifié (UX)** | v0.0.45 / *v0.0.5x* |
| **11** | `jezD1o9` | 2026-08-26 12:54 | Anonyme | Suggestion de fonctionnalité | *« Activer le retour en arrière dans lapp »* | Prise en charge native du bouton/geste Retour Android via Capacitor (`App.addListener('backButton')`). | **Résolu** | v0.0.50 |
| **12** | `gbzjKQ4` | 2026-08-26 12:55 | Anonyme | Suggestion de fonctionnalité | *« Faire en sorte que l'app revienne à l'accueil pas tout le temps mais à partir d'un certain temps »* | Réinitialisation automatique à l'accueil et sur le jour courant après 30 min d'inactivité. | **Résolu** | v0.0.45 |
| **13** | `X5QlZ7V` | 2026-08-26 12:56 | Anonyme | Suggestion de fonctionnalité | *« Changer le son audio »* | Synthèse audio enrichie avec émulation d'harmoniques de positif d'orgue. | **Résolu** | v0.0.45 |
| **14** | `NqPpWDb` | 2026-08-26 13:31 | Anonyme | Suggestion de fonctionnalité | *« Il faudrait avoir une barre de scroll qui indique où on en est dans la messe parce que quand on met l’ordinaire cnest vraiment super long si on doit aller en bas »* | Indicateur / barre de progression de défilement visuelle pour situer sa position dans la messe. | **Résolu** | v0.0.52 |
| **15** | `bZzeZb1` | 2026-08-27 05:38 | clement.c.portal@gmail.com | Bug technique / affichage | *« Il y a 2 Croix au lieu d'une pour Evangelium... trouver un moyen de signaler qu'il faut glisser à droite... Le titre du saint du jour dépasse souvent du chapeau »* | Geste bilingue animé One UI ; titre avec défilement fluide *marquee* et chevron d'expansion. | **Résolu** | v0.0.45 & v0.0.47 |
| **16** | `kbzGlXM` | 2026-08-27 05:42 | clement.c.portal@gmail.com | Bug technique / affichage | *« Il y a des fêtes en anglais (All souls, Holy relics). Je peux difficilement cliquer sur aujourd'hui à cause des boutons du téléphone. »* | Marge inférieure de sécurité mobile (`safe-area-inset-bottom`) & traduction des fêtes en anglais. | **Résolu** | v0.0.45 |
| **17** | `8NrLz1l` | 2026-08-27 05:44 | clement.c.portal@gmail.com | Suggestion de fonctionnalité | *« Est-ce qu'il y a les messes en dehors du sanctoral et du temporal (mariage, défunts avec toutes les oraisons propres, messes votives...) ? »* | Intégration des formulaires de Messes de Mariage, Requiem et messes votives via modale `#votiveMassModal` et carte d'accueil. | **Résolu** | v0.0.65 |
| **18** | `gbzNPpJ` | 2026-08-28 19:10 | Anonyme | Suggestion de fonctionnalité | *« Ce serait bien de rajouter le kyrilae »* | Intégration du recueil des messes du Kyriale (Messes I à XVIII, Credo I à IV, Asperges). | **Résolu** | v0.0.57 |
| **19** | `2joly9M` | 2026-08-29 12:14 | clement.c.portal@gmail.com | Remarque générale | *« Pour la Bible, vous ne pouvez pas prendre la Vulgate tridentine pour le latin et AELF... pour le français. Prenez par exemple Tobie 7... prenez une traduction de la Vulgate comme Crampon ou Sacy. »* | Remplacement complet d'AELF par la Bible Crampon 1923 (73 livres, 35 580 versets, 1:1 Vulgate). | **Résolu** | v0.0.53 |
| **20** | `Yj97Bg5` | 2026-08-31 13:20 | Anonyme | Suggestion de fonctionnalité | *« Faire un truc pour choisir version chantée ou psalmodiee comme chant tools. Également faire un truc comme chat tools pour changer de kyriale etc, ajouter un antiphon etc. »* | Bascule chanté / psalmodié et ajout/substitution dynamique d'antiennes et de pièces du Kyriale. | **Résolu** | v0.0.57 |
| **21** | `Z9ebbd0` | 2026-08-31 13:22 | Anonyme | Suggestion de fonctionnalité | *« Améliore la recherche... rechercher individuellement toute messe, tout office, ou toute prière seule. Ajouter une rubrique de pierres seule... repertoire entier de Gregorio... »* | Moteur de recherche universel instantané indexant 2292 éléments embarqué ; prières isolées à découper. | **Résolu (Moteur)** / **Planifié (Prières)** | v0.0.47 à v0.0.52 |
| **22** | `M1VjpKE` | 2026-08-31 13:24 | Anonyme | Suggestion de fonctionnalité | *« Ajouter le bouton de recherche globale à côté du logo oremus et dans la page de démarrage, et faire une recherche intelligente avec affichage des résultats au mots, prevsisaliation en carré ou en ligne... »* | Bouton loupe header/accueil, recherche par mots-clés, surlignage et double mode Grille/Ligne. | **Résolu** | v0.0.47 & v0.0.49 |
| **23** | `M1Vjpql` | 2026-08-31 13:26 | Anonyme | Suggestion de fonctionnalité | *« Ajouter une image et une bio ou paratexte dans le début des messes avec fond degradé pour chaque saint du jour. Ou fête. Trouver la bonne db... connecté au repo github »* | Carte saint immersive avec notice biographique (Lectio 94 / Martyrologe) et iconographie via module `.pack` ou CDN GitHub. | **Résolu** | v0.0.53 |
| **24** | `bZzJ6v0` | 2026-08-31 17:08 | Anonyme | Bug technique / affichage | *« Quand on clique sur un jour où il y a deux solutions il faut affiche que la bonne solution dans année 2026 et la respecter fans els autres catégories temporal et snactoral »* | Détermination automatique de la célébration prévalente selon les rubriques 1962 pour 2026. | **Planifié** | *Prochaine version* |
| **25** | *Évolution UX* | 2026-09-01 10:41 | Équipe / Retours | Ergonomie Recherche | *« Système où toutes les barres de recherche utilisent la mise en page de la barre principale »* | Unification du Design System (hauteur 38px, arrondi 10px, icône animée, bouton vidage, pastilles). | **Planifié** | *Prochaine version* |
| **26** | *Évolution UX* | 2026-09-01 10:41 | Équipe / Retours | Ergonomie Recherche | *« Améliorer l'UX de la barre car cliquer 2 fois pour rechercher n'est pas commode »* | Activation immédiate et focus automatique direct au premier clic/tap. | **Planifié** | *Prochaine version* |
| **27** | *Bug Affichage* | 2026-09-01 10:41 | Équipe / Retours | Responsive Desktop | *« Corriger que sur desktop il y en ait toujours 2 résultats par ligne au lieu de s'adapter »* | Déverrouillage largeur conteneur et grille fluide responsive multi-colonnes (`minmax(150px, 1fr)`). | **Résolu** | v0.0.52 |
| **28** | *Bug Audio* | 2026-09-01 10:41 | Équipe / Retours | Moteur Audio / Vitesse | *« La vitesse ne marche pas et change n'importe comment (corriger le calcul par rapport au bpm) »* | Formule de vitesse BPM stricte et nouveau scheduler de haute précision `scheduleNextNote` avec ticks absolus. | **Résolu** | v0.0.56 |
| **29** | *Évolution Audio* | 2026-09-01 10:41 | Équipe / Retours | Lecteur Audio / Scroll | *« Retour sticky après inactivité si hors écran au milieu, et suivi au milieu au changement de portée »* | Centrage vertical doux au milieu (`visibleMid`), détection de saut de portée (> 60px) et retour sticky. | **Résolu** | v0.0.56 |
| **30** | *Évolution UX* | 2026-09-01 10:44 | Équipe / Retours | Recherche Vue Liste | *« Dans la vue liste, ajouter les extraits highlights lors de recherches highlight entre 2 lignes »* | Affichage des extraits textuels surlignés avec serrage propre sur 2 lignes max (`-webkit-line-clamp: 2`). | **Résolu** | v0.0.52 |
| **31** | *Évolution UI* | 2026-09-01 10:49 | Équipe / Retours | Recherche Desktop | *« Masquer le chevron gauche sidebar sur desktop et aligner la barre sur la largeur des résultats »* | Masquage du chevron hamburger sur desktop et centrage aligné de la barre (`max-width: 760px`). | **Résolu** | v0.0.52 |
| **32** | *Évolution UX* | 2026-09-01 10:49 | Équipe / Retours | Recherche Desktop | *« Placer la barre plus bas avec une zone qui se rétracte au scroll pour aérer (desktop uniquement) »* | Espacement initial aéré avec rétraction fluide de l'en-tête de recherche lors du défilement. | **Planifié** | *Prochaine version* |
| **33** | *Évolution UI* | 2026-09-01 10:47 | Équipe / Retours | Répertoire Grégorien | *« Mettre en avant les partitions GABC et faire passer la recherche pour un répertoire »* | Section complète Grégobase intégrée dans la barre latérale avec navigation par usages, sources, modes, recherche et neumes NABC. | **Résolu** | v0.0.65 |
| **34** | *Bug Affichage* | 2026-09-01 10:53 | Équipe / Retours | En-tête / Android | *« Corriger le chargement de la barre (Oneratur...) qui n'est pas nécessaire et s'affiche mal sur Android »* | Suppression du texte statique Oneratur et affichage instantané fluide sans saut ni rognage. | **Résolu** | v0.0.57 |
| **36** | `Z9e4QR5` | 2026-09-01 14:21 | Anonyme | Bug technique / affichage | *« Faux positif sur les mises a jour »* | Détection stricte des versions, élimination des boucles d'alerte sous Android et synchronisation `version.json`. | **Résolu** | v0.0.53 & v0.0.64 |
| **37** | `LDOAoxG` | 2026-09-01 14:22 | Anonyme | Suggestion de fonctionnalité | *« Intégrer les vidéo ou audio youtube pour chaque pièce de gregorien »* | Scraping multi-sources initial de 1 645 pièces étendu à plus de 14 000 enregistrements YouTube dans `js/gregorian_youtube_links.js`. | **Résolu** | v0.0.53 & v0.0.58 |
| **38** | `PRP5ayd` | 2026-09-02 17:37 | Anonyme | Bug technique / audio | *« Sur l'audio, il ne faut pas quil se mette en pause lorseu l'on ferme les sources. Il faut aussi que le sync soit désactivé par défaut sur les sources yt comme elles ne marchent pas vraiment. Aussi il faut comprendre pourquoi ça ne marche pas sur certaines sources dans les pages seules... A ce moment s'il n'y a rien mettre un message qui affiche gabc et aucune autre source disponible »* | Maintenir l'audio actif au repli du tiroir de sources ; désactiver la synchro YT par défaut ; diagnostiquer l'audio des pages seules et afficher un message explicite « Partition GABC uniquement — aucun enregistrement externe » si aucune source vidéo. | **Résolu** | v0.0.56 |
| **39** | `YjqWEDB` | 2026-09-02 17:38 | Anonyme | Liturgie / Grégorien | *« Remove grgeorian chant for blessing and... »* | Suppression des partitions grégoriennes / boutons de chant inopportuns sur les bénédictions et versets d'envoi non chantés. | **Planifié** | *v0.0.56* |
| **40** | `NqO6a2l` | 2026-09-02 19:55 | Anonyme (avec capture) | Correction de texte liturgique | *« Page en français, mais il manque les accents français. »* | Restauration intégrale des accents diacritiques français sur les pages et formulaires textuels du Missel/Bréviaire. | **Planifié** | *v0.0.56* |
| **41** | `5XOzW46` | 2026-09-02 20:03 | Anonyme | Suggestion de fonctionnalité & Bréviaire | *« Est-ce que vous pouvez mettre aussi le nouvel ordo ? Pour les offices, pourquoi les petites heures n'ont pas de capitule, voire certaines heures pas de réponds. »* | Clarification du périmètre (Oremus centré sur la forme extraordinaire 1962) ; audit et complétion des capitules et répons brefs manquants aux petites heures (Prime, Tierce, Sexte, None). | **À l'étude (Novus Ordo) / Planifié (Bréviaire)** | *v0.0.56* |
| **42** | `Ge75aZO` | 2026-09-04 09:16 | Anonyme | Suggestion de fonctionnalité | *« Il faudrait pouvoir avoir le choix du kyriale et pouvoir mettre le kyriale sans tout l’ordinaire »* | Sélecteur interactif du Kyriale (Messes I à XVIII) dans la messe ; vue autonome « Kyriale seul » sans Ordinaire à ajouter. | **Partiellement résolu (Sélecteur fait / Vue isolée planifiée)** | v0.0.57 / *v0.0.65* |
| **43** | `k9PqW8a` | 2026-09-04 12:12 | Anonyme (Retour direct) | Bug technique / audio | *« lorsque l'n clique pour la première fois, le curseur reste 2 secondes au bon endroit, puis se vide, mais la veluer de l'hordatage ne chnage pas c'est bizarre »* | Correction du bug de seek / barre de progression au 1er clic : verrouillage temporel (`_isUserSeekingUntil`) empêchant l'écrasement asynchrone de la jauge (`#playerProgressFill`), et calcul pondéré cohérent. | **Résolu** | v0.0.56 |
| **44** | `w2XnK7b` | 2026-09-04 12:14 | Anonyme (Retour direct) | Bug technique / audio synthé | *« desolé ca marche toujours pas, ya que le 1X qui est a la bonne vitesse, tous les autres sont trop lents, ils semblent pas calsulés de la meme manière sur que le 1X (que pour le synthé evidemmebnt) »* | Correction critique du tempo sur le synthétiseur GABC : remplacement du scheduler temporel Tone.js r12 par des ticks d'horloge absolue (`targetTick + 'i'`), application directe du BPM sans dérive. | **Résolu** | v0.0.56 |
| **45** | `Ge777Yp` | 2026-09-04 13:55 | Anonyme | Bug technique / affichage | *« Les prières de Léon 13 sont misent dans l’index juste après le gloria alors que c’est les prières après la messe »* | Exclusion de `Orationes Leonis XIII` du filtre regex de la Collecte dans `_massTocGroups` et ajout dédié en clôture du groupe 4 (post-messe). | **Résolu** | v0.0.65 |
| **46** | `LDoyZjy` | 2026-09-04 20:13 | Anonyme | Remarque générale | *« Slay l'app »* | Retours très positifs et satisfaction utilisateur sur la modernité, l'esthétique et la fluidité de l'application. | **Traité** | v0.0.57 |
| **47** | `o9xQ9MN` | 2026-09-04 20:15 | Anonyme | Suggestion de fonctionnalité | *« Ou sont les messes particulières ? Messe de requiem, de mariage? »* | Consolidation de la demande d'accès dédié aux formulaires particuliers et votifs hors calendrier (Requiem, Mariage, messes votives). | **Résolu** | v0.0.65 |

