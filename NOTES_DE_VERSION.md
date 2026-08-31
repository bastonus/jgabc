# 📝 Notes de Version — Oremus

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
