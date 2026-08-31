# 📋 Tâches & Retours Utilisateurs — Oremus
*Suivi des actions issues des retours utilisateurs du 31 août 2026 (Version 0.0.46)*

---

## 📑 Sommaire
1. [🛠️ Corrections Critiques & Bugs Techniques](#1-️-corrections-critiques--bugs-techniques)
2. [📿 Corrections Liturgiques, Textes & Calendrier](#2--corrections-liturgiques-textes--calendrier)
3. [🎯 Expérience Utilisateur (UX) & Onboarding](#3--expérience-utilisateur-ux--onboarding)
4. [🚀 Nouvelles Fonctionnalités & Évolutions Liturgiques](#4--nouvelles-fonctionnalités--évolutions-liturgiques)
5. [🔍 Recherche Globale Intelligente & Répertoire Étendu](#5--recherche-globale-intelligente--répertoire-étendu)
6. [🎧 Améliorations du Lecteur Audio & Grégorien](#6--améliorations-du-lecteur-audio--grégorien)
7. [⚠️ Point de Fond : Concordance des Textes Bibliques](#7-️-point-de-fond--concordance-des-textes-bibliques)

---

## 1. 🛠️ Corrections Critiques & Bugs Techniques

- [x] **Bouton d'accès rapide « Aujourd'hui » inaccessible sur mobile :**
  - *Correction :* Intégration de `padding-bottom: max(16px, env(safe-area-inset-bottom, 0px))` et calage de la bottom navigation sur Android et iOS.
- [x] **Saut d'affichage du header au chargement :**
  - *Correction :* Marge haute du header appliquée nativement en CSS avec `padding-top: env(safe-area-inset-top)`.
- [x] **Débordement des titres / chapeaux de fêtes longs :**
  - *Correction :* Maintien sur une seule ligne avec défilement automatique fluide (marquee 2 cycles temporaires avec fondus doux de masque) et bouton chevron 'v' d'ouverture toujours visible et arrondi à droite.
- [x] **Espacements anormaux en fin de messe :**
  - *Correction :* Nettoyage des marges et `min-height` excessifs sur les conteneurs de fin de célébration.

---

## 2. 📿 Corrections Liturgiques, Textes & Calendrier

### 🔴 Typographie & Rubriques
- [x] **Mots de la Consécration en noir :**
  - *Correction :* Les paroles de la Consécration (*« HOC EST ENIM CORPUS MEUM »* / *« HIC EST ENIM CALIX... »*) sont affichées en noir et en gras (`.do-consecration-words`), distinctes des rubriques rouges.
- [x] ~~**Croix de l'Évangile en double :**~~ *(Annulé suite à clarification)*
- [x] **Rétablissement du Dernier Évangile (dans l'Ordinaire) :**
  - *Correction :* Réinséré explicitement avec ses répons et son texte intégral bilingue dans la conclusion de l'Ordinaire (`do_data/missa/Latin/Ordo/Ordo.txt` et `do_data/missa/Francais/Ordo/Ordo.txt`) ainsi que dans l'assemblage complet (`js/divinum_officium.js`).

### 📅 Erreurs du Calendrier & Textes non traduits
- [x] **11 Juillet (Saint Pie Iᵉʳ) :** Doublon supprimé et intitulé harmonisé.
- [x] **16 Juillet (Notre-Dame du Mont-Carmel) :** Remplacé *Our Lady of Mount Carmel* par **Notre-Dame du Mont-Carmel** / **Beatæ Mariæ Virginis de Monte Carmelo**.
- [x] **25 Octobre (Saints Chrysanthe et Daria) :** Deuxième entrée dupliquée supprimée.
- [x] **2 au 9 Novembre (Octave des Défunts / Toussaint) :** Textes et intitulés traduits en français dans le calendrier et les dictionnaires.
- [x] **12 Novembre (Saint Martin Iᵉʳ) :** Traduction française complète de l'Officium et des oraisons ajoutée.
- [x] **13 Novembre (Saint Didace) :** Répétition en doublon supprimée.
- [x] **27 Novembre (Notre-Dame de la Médaille Miraculeuse) :** Rubriques liturgiques et chants traduits en français.
- [x] **29 Novembre (Vigile de Saint André) :** Entrées doublons fusionnées / dédupliquées.
- [x] **25 Décembre (Messe de Noël) :** Traductions françaises et titres complétés.
- [x] **Fête des Saintes Reliques :** Intitulé traduit par **Fête des Saintes Reliques** / **In Festo Sanctarum Reliquiarum**.

---

## 3. 🎯 Expérience Utilisateur (UX) & Onboarding

- [x] **Découvrabilité du texte bilingue (Latin / Français) :**
  - *Correction :* Indicateur visuel animé inspiré de Samsung One UI (`#doBilingualGestureIndicator`), dégradé arrondi aux couleurs d'accentuation (`var(--primary-color)`), impulsion unique, bascule de texte élargie (-110px), fondu en fin de course, déclenchement après défilement sur les sections textuelles (hors grégorien) et relance périodique.
- [x] **Gestion du bouton Retour (Back navigation) :**
  - *Correction :* Prise en charge native de la touche/geste « Retour » sur Android (`Capacitor.Plugins.App.addListener('backButton')`) et dans le navigateur (`popstate`) : ferme d'abord toute modale, menu, panneau de paramètres ou sélecteur d'heures ouvert, puis retourne à la page d'accueil si un office spécifique est ouvert, évitant la fermeture intempestive de l'application.
- [x] **Réinitialisation automatique à l'accueil :**
  - *Correction :* Détecteur d'inactivité réinitialisant automatiquement l'affichage sur la page d'accueil et sur la date du jour actuel après 30 minutes de mise en arrière-plan ou d'absence d'activité (`checkInactivityReset`).

---

## 4. 🚀 Nouvelles Fonctionnalités & Évolutions Liturgiques

- [x] **Table des matières / Index de la Messe (Sommaire flottant) :**
  - **Déclencheur (Pilule flottante) :** Pilule discrète sur le côté droit de l'écran, positionnée de façon à ne jamais recouvrir ou chevaucher le lecteur audio (décalage dynamique en CSS/JS lorsque le `#modernPlayerBar` est actif).
  - **Rendu visuel du Sommaire :** Volet épuré/transparent **sans fond opaque**, avec une **ombre portée marquée** (`box-shadow`) et un flou d'arrière-plan subtil (`backdrop-filter: blur`), laissant transparaître le contenu de la messe.
  - **Liste défilante structurée :** Menu défilant fluide avec découpage à 2 niveaux (Macro-parties et étapes détaillées) :
    1. *Avant-Messe & Parole* : Prières au bas de l'autel, Introït, Kyrie, Gloria, Collecte, Épître, Graduel/Alléluia/Trait, Évangile, Credo.
    2. *Offertoire & Préparation* : Offertoire, Oblation, Lavabo, Secrète.
    3. *Canon & Consécration* : Préface & Sanctus, Canon Romain, Consécration/Élévation, Pater Noster.
    4. *Communion & Envoi* : Agnus Dei, Communion, Postcommunion, Bénédiction & Dernier Évangile.
  - **Interactions :** ScrollSpy en temps réel (mise en valeur de l'étape courante), défilement fluide (*smooth scroll*) avec compensation du header fixe lors du clic sur une section.
- [ ] **Barre de progression de lecture :**
  - Indicateur visuel de défilement pour situer précisément sa position dans l'Ordinaire de la messe.
- [ ] **Évangile et Commémoration du Temporal :**
  - Lorsque la messe du jour est celle d'un saint (Sanctoral) qui prime sur un dimanche ou une férie privilégiée (Temporal), afficher automatiquement en bas de page l'oraison de commémoration ainsi que le Dernier Évangile propre du temporal.
- [ ] **Messes Diverses et Votives :**
  - Ajouter les formulaires hors cycle propre : Messes de Mariage, Messes des Défunts (*Requiem* avec choix complet des oraisons), et messes votives principales.
- [ ] **Intégration du Kyriale & Choix Chanté / Psalmodié (Chant Tools) :**
  - Ajouter le recueil des Messes grégoriennes (Messes I à XVIII, Credo I à IV, Asperges me, Vidi aquam).
  * Permettre de basculer facilement entre version chantée et psalmodiée, et d'ajouter/changer des antiennes ou pièces de Kyriale à la volée (comme dans Chant Tools).
- [ ] **Biographies, Paratexte & Iconographie des Saints :**
  - Ajouter en tête de messe une image/icône du saint ou de la fête avec fond dégradé élégant et courte notice biographique / paratexte historique.
  - Gestion en ligne directe (connecté à la base GitHub) ou sous forme de pack optionnel téléchargeable pour conserver la légèreté de l'application de base.

---

## 5. 🔍 Recherche Globale Intelligente & Répertoire Étendu

- [ ] **Bouton de recherche globale :**
  - Intégrer un bouton de recherche dédié à côté du logo Oremus et sur l'écran d'accueil.
- [ ] **Moteur de recherche universel :**
  - Recherche plein-texte instantanée par mot-clé pour retrouver individuellement n'importe quelle messe, office canonique, oraison, antienne ou prière isolée.
- [ ] **Affichage & Prévisualisation des résultats :**
  - Rendu des résultats en grille carrée ou en liste détaillée, incluant un aperçu des partitions grégoriennes générées automatiquement pour les chants.
- [ ] **Répertoire Grégorien Étendu (Module Complémentaire) :**
  - Permettre le téléchargement optionnel du répertoire complet Gregorio sous forme de module additionnel (~40 Mo) sans alourdir le paquet initial de l'application.

---

## 6. 🎧 Améliorations du Lecteur Audio & Grégorien

- [x] **Gestuelle de fermeture :** Rendre le mini-lecteur audio réductible/fermable par un glissement vers le bas (*swipe down / grab handle*).
- [x] **Contrôle simplifié de la vitesse :**
  - Remplacer le menu actuel par un bouton unique qui cycle les vitesses à chaque appui :  
    x1.0 $\rightarrow$ x1.25 $\rightarrow$ x1.5 $\rightarrow$ x2.0 $\rightarrow$ x0.5 $\rightarrow$ x0.75.
- [ ] **Interface des Tons Grégoriens :**
  - Refondre la sélection des tons pour éviter les listes déroulantes interminables.
- [x] **Moteur Audio :**
  - Améliorer les banques de sons / la synthèse audio grégorienne (harmoniques riches de positif d'orgue).

---

## 7. ⚠️ Point de Fond : Concordance des Textes Bibliques

- [ ] **Harmonisation Vulgate latine / Traduction française traditionnelle :**
  - *Problème :* Décalages de versets et de sens entre la Vulgate tridentine (latin) et l'AELF (français).
  - *Solution :* Aligner les lectures françaises sur une traduction directement issue de la Vulgate (traduction du Chanoine Crampon, Lemaistre de Sacy ou Abbé Fillion).


