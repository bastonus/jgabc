# Charte Graphique de Sobriété & Système Visuel — Oremus (« Modern Sacred »)

Ce document formalise les règles architecturales, visuelles et ergonomiques qui régissent l'interface d'**Oremus**. L'objectif est de préserver une sobriété radicale, un calme liturgique et une lisibilité parfaite, sans artifices graphiques modernes tapageurs.

---

## 1. Principes Fondamentaux : La Sobriété Liturgique

1. **Zéro bordure, jamais (*Frameless & Zero-Strokes*)** :
   - **Aucun élément** (cartes, tuiles, boutons, conteneurs, popups, inputs, en-têtes) ne possède de bordure visible (`border: none !important;` ou `border-color: transparent !important;`).
   - La hiérarchie spatiale et la séparation des blocs s'obtiennent **uniquement** par la nuance entre les teintes de surface (`--background-base`, `--background-surface`, `--background-highlight`) et les espacements (*spacing*), jamais par un trait ou un contour.
   - Les séparateurs éventuels sont réduits à des filets semi-transparents de 1px sans arête franche (`background: rgba(255, 255, 255, 0.08);`).

2. **Aucune carte dans une carte ni conteneurs superflus (*Flat Hierarchy / No Nested Cards*)** :
   - Proscription absolue des "boîtes dans des boîtes" ou des cartes gigognes.
   - Les éléments interactifs (tuiles grégoriennes, cartes d'usage, cartes de messe, listes d'incipits) reposent **directement** sur le fond principal de l'application (`--background-base`).
   - Ne jamais entourer une grille de cartes d'un grand conteneur de type "hero card", "panneau englobant" ou "carte mère" avec son propre fond ou ses marges intérieures. La surface est à un seul niveau (*single-surface layer*).

3. **Zéro titre redondant ni label inutile (*Minimalist Information Density*)** :
   - L'en-tête persistant de l'application (`#doHeaderTitle` et `#doHourLabel`) informe déjà l'utilisateur sur la section en cours (ex: "GRÉGOBASE • BASE DE DONNÉES GRÉGORIENNE", "QUÆRERE", ou date/fête du jour).
   - Il est formellement interdit de dupliquer ces informations dans le corps de page avec un `<h1>`, un sous-titre de bienvenue ou des compteurs superflus.
   - Supprimer les mentions évidentes telles que "(par usage)", "(par source)", "(par mode)", ou les textes explicatifs verbeux. La disposition visuelle et la pureté des listes doivent s'expliquer d'elles-mêmes.

4. **Respect strict des marges : Aucune marge parasite dans la zone d'écriture (*Full Writing Area & Zero Double-Padding*)** :
   - Le conteneur parent de l'application (`.content-area` / `.app-main`) définit déjà les marges extérieures et le cadrage du viewport.
   - **Aucune marge ni padding horizontal artificiel dans la zone d'écriture** (`#do-content-stream`) : les vues enfant (comme `.gregobase-page`, `.gregorian-search-page`, les grilles de cartes et de chants) doivent impérativement définir `padding-left: 0 !important; padding-right: 0 !important;` pour occuper l'intégralité de la largeur utile définie par la zone de lecture.
   - **Proscription absolue du double-padding** : ajouter du padding latéral au sein d'une sous-page crée un rétrécissement artificiel de la zone d'écriture, désaligne les grilles par rapport au reste de l'application et gaspille l'espace utile sur écran mobile.
   - Les seuls espacements tolérés dans la zone d'écriture sont verticaux : `gap: 10px` à `16px` entre les tuiles et blocs, et un `padding-bottom` de sécurité (`calc(36px + env(safe-area-inset-bottom, 0px))`).
   - Largeur de lecture contrôlée : `max-width: 960px; margin: 0 auto;`.

5. **Limiter strictement les animations : Les gestures uniquement (*Gesture-Driven Motion Only*)** :
   - **Aucune animation de déplacement vers le haut (*No translateY / No Hover Lift*)** : aucun effet de "lévitation" ou translation verticale (`transform: translateY(-2px)`, `translateY(-4px)`) lors du survol (*hover*) ou du clic (*active*).
   - **Aucune animation décorative ou automatique** : pas de `@keyframes fadeIn` sur l'arrivée d'une page, pas de pulsation perpétuelle, pas de rebond d'en-tête.
   - **Les SEULES animations tolérées sont celles directement guidées par les gestes de l'utilisateur (*User Gestures*)** :
     - Le glissement latéral de la sidebar au doigt (`transform: translateX(...)`).
     - Le déplacement direct au doigt du lecteur audio ou du tiroir d'heures (variables CSS pilotées en direct : `--picker-drag-y`, `--player-drag-y`).
     - Le défilement inertiel natif de la vue.
     - Le feedback tactile instantané sur les cartes : simple nuance de fond `rgba(var(--primary-color-rgb), 0.14)` sans à-coup géométrique.

6. **Absence d'ombres portées agressives (*No Harsh Shadows*)** :
   - Les cartes et tuiles sont plates (`box-shadow: none !important;`).
   - Seuls les éléments flottants modaux (menus volants, images de saints au premier plan) tolèrent une ombre douce très diffuse.

7. **Zéro effet de glow, néon ou halo lumineux (*Zero Glow / No Luminescent Halos*)** :
   - Proscription absolue de toute luminescence diffuse, halo ou effet néon (`box-shadow: 0 0 12px ...`, `text-shadow: 0 0 ...`, `filter: drop-shadow(0 0 ...)`).
   - Les boutons actifs, puces sélectionnées et notes de musique grégorienne en cours de lecture ne doivent **jamais rayonner**. Le contraste s'exprime par une surface mate franche et nette (encre sur parchemin ou aplat plein sur noir OLED pur), sans aucune aura luminescente artificielle.

---

## 2. Palette des Couleurs & Tokens CSS

Le système repose sur un mode sombre / OLED natif absolu et un mode clair aux teintes minérales naturelles teintées d'accent.

### A. Thème Sombre & OLED (Thème par défaut)

| Variable CSS | Valeur Hex / RGBA | Rôle & Usage |
| :--- | :--- | :--- |
| `--background-base` | `#000000` | Fond principal de l'application (noir OLED pur). |
| `--background-sidebar` | `#000000` | Fond de la barre latérale de navigation. |
| `--background-surface` | `#0a0a0a` / `#141416` | Fond des cartes, tuiles grégoriennes, volets et panneaux. |
| `--background-highlight`| `#141414` / `#1a1a1e` | Fond des champs de recherche, boutons inactifs et états hover. |
| `--border-color` | `transparent` | **Toujours transparent** pour garantir l'absence de contours. |
| `--text-primary` | `#f8fafc` | Texte principal (titres, incipits, corps liturgique). Blanc doux, non éblouissant. |
| `--text-secondary` | `#94a3b8` | Texte secondaire (traductions, sous-titres, étiquettes). |
| `--text-tertiary` | `#64748b` | Métadonnées discrètes (sources, pages, heures, références). |

### B. Thème Clair (Minéral & Doux)

| Variable CSS | Définition dynamique | Rôle & Usage |
| :--- | :--- | :--- |
| `--background-base` | `color-mix(in srgb, var(--primary-color) 1%, #ffffff)` | Fond principal clair non agressif. |
| `--background-surface` | `color-mix(in srgb, var(--primary-color) 2%, #f0f2f6)` | Fond des cartes et tuiles. |
| `--background-highlight`| `color-mix(in srgb, var(--primary-color) 3.5%, #e2e6ee)` | Hover et champs de saisie. |
| `--text-primary` | `#111317` | Noir d'encre doux. |
| `--text-secondary` | `color-mix(in srgb, var(--primary-color) 6%, #475569)` | Gris ardoise équilibré. |
| `--text-tertiary` | `color-mix(in srgb, var(--primary-color) 8%, #64748b)` | Gris clair pour indications mineures. |

### C. Teinte d'Accent Liturgique (`--primary-color`)

- **Valeur de base** : `#c96b63` (Rouge brique des rubriques traditionnelles romaines).
- **Format RGB** : `201, 107, 99` (permet les modulations d'opacité).
- **Survol (*hover*)** : `rgba(var(--primary-color-rgb), 0.08)` à `0.10`.
- **Sélection / Actif (*active*)** : `rgba(var(--primary-color-rgb), 0.14)` à `0.18`.

---

## 3. Typographie : Polices & Échelle des Tailles

Le mariage typographique repose sur deux familles : une sérif d'inspiration classique/liturgique et une sans-sérif moderne et lisible.

### A. Les Polices de Caractères

1. **`'Libre Baskerville', Georgia, serif`** :
   - Utilisée pour les titres solennels, noms de fêtes, incipits de pièces grégoriennes et labels de navigation (`.do-nav-label`).
   - Caractère noble, proportionné, respectueux de l'imprimerie ecclésiastique.
2. **`'Crimson Text', serif`** :
   - Utilisée pour le texte courant des lectures, psaumes, oraisons et paroles latines sous les neumes.
   - Excellente lisibilité en continu, graisse douce.
3. **`'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`** :
   - Utilisée pour l'UI technique : boutons, champs de recherche, onglets, badges, compteurs et métadonnées.

### B. Échelle des Tailles et Graisses

| Emplacement | Police | Taille | Graisse | Line-height |
| :--- | :--- | :--- | :--- | :--- |
| **Grand Titre Header** (`#doHeaderTitle`) | Libre Baskerville | `1.15rem` à `1.30rem` | 700 (Bold) | `1.25` |
| **Sous-titre Header** (`#doHourLabel`) | Inter | `0.70rem` à `0.75rem` | 600 (Semibold) | `1.0` (Majuscules, letter-spacing 0.08em) |
| **Titres de cartes** (`.do-extra-link-title`) | Libre Baskerville | `1.05rem` à `1.12rem` | 700 | `1.3` |
| **Incipits grégoriens** (`.gregorian-card-incipit`)| Libre Baskerville | `0.92rem` à `1.00rem` | 600 / 700 | `1.25` |
| **Éléments de navigation** (`.do-nav-label`) | Libre Baskerville | `0.92rem` | 400 (600 si actif) | `1.2` |
| **Champs de recherche** (`input`) | Inter | `0.85rem` à `0.88rem` | 400 / 500 | `1.0` |
| **Badges / Pilules** (`.do-badge`, `.gregorian-badge-part`) | Inter | `0.72rem` à `0.76rem` | 600 | `1.0` |
| **Métadonnées / Sources** | Inter | `0.74rem` à `0.78rem` | 400 / 500 | `1.35` |

---

## 4. Valeur des Arrondis (`border-radius`)

Les rayons de courbure sont strictement standardisés pour éviter les cassures visuelles :

| Élément | Valeur `border-radius` | Rationale |
| :--- | :--- | :--- |
| **Badges, cellules calendrier, puces NABC** | `6px` | Petit rayon discret pour éléments minuscules. |
| **Puces d'onglets, sous-menus, petits boutons** | `8px` à `10px` | Rendu harmonieux sans aspect "jouet". |
| **Items de la Sidebar & Items du Dropdown** | `9px` à `10px` | Épouse exactement le curseur et la hauteur de ligne (38px). |
| **Champs de saisie (Search inputs)** | `10px` à `12px` | Doux au regard, évite les coins agressifs. |
| **Cartes de contenu & Tuiles Grégoriennes** | `12px` à `14px` | Standard Oremus pour les cartes de premier plan. |
| **Grands conteneurs / Hero / Panneaux modaux** | `16px` | Token `--border-radius: 16px;`. |
| **Pilules arrondies complètes** | `100px` | Uniquement pour boutons pillules étroits. |

---

## 5. Ce que sont les Lazy Loaders dans Oremus

Le système de *Lazy Loading* d'Oremus a été conçu pour charger de manière instantanée et fluide des dizaines de milliers de données sans bloquer le thread graphique :

### 1. L'IntersectionObserver de Rendu Vectoriel SVG (Score Lazy-Renderer)
- Dans la grille grégorienne (`.gregorian-results.is-grid`), chaque carte est générée immédiatement dans le DOM avec ses métadonnées légères (incipit, mode, usage).
- Le conteneur musical `.gregorian-score-container` n'affiche au départ qu'un squelette statique léger (`.gregorian-skeleton`).
- Un `IntersectionObserver` avec `rootMargin: '150px'` surveille chaque carte :
  - Dès qu'une carte s'approche du viewport de l'utilisateur, le code GABC est récupéré en mémoire (`window.gregorianDB.getGabc(chantId)`).
  - Le moteur Exsurge compile la notation grégorienne en SVG vectoriel avec la hauteur et la clé appropriées.
  - Dès que le SVG est inséré, la classe `.gregorian-skeleton` est retirée et le loader s'efface en fondu (`fadeIn 0.22s`).
  - Si l'utilisateur fait défiler la page très vite (*fast scroll*), la carte qui quitte la vue annule son rendu en cours pour libérer le processeur.

### 2. Le Défilement Continu par Sentinelle (*Chunked Infinite Scroll*)
- Même avec 22 541 partitions, le DOM ne reçoit au départ qu'un lot initial de **40 à 50 cartes**.
- Un élément sentinelle invisible (`#gregorianScrollSentinel` ou `#gregobaseSentinel`) est placé en bas de liste.
- Un `IntersectionObserver` dédié déclenche l'injection du lot suivant dès que la sentinelle approche (`rootMargin: '300px'`).

### 3. Les Squelettes Visuels Grégoriens (*4-line Tetragram Staves*)
- Plutôt que d'afficher des rectangles gris génériques, Oremus utilise des squelettes figurant les 4 lignes de la portée grégorienne médiévale :
```html
<div class="gregorian-score-loader">
  <div class="gregorian-skeleton-staff">
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
  </div>
  <div class="gregorian-skeleton-staff">
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
    <div class="gregorian-staff-line"></div>
  </div>
</div>
```
- L'animation est un shimmer doux (`@keyframes do-pulse` ou `do-skeleton-pulse`) sans flash ni saccade.

---

## 6. Analyse des Pages & Composants de Référence

### A. La Page d'Accueil (`renderHomeView`)
- **Structure** :
  - *Saint du jour* : Hero pleine largeur sous le header transparent, image grand format nette à coins arrondis (`14px`), sans bordure.
  - *Cartes Messe & Bible* (`.do-extra-link-card`) : deux blocs côte à côte, fond `--background-surface`, `border: none`, `border-radius: 14px;`, au hover uniquement un fond teinté `rgba(var(--primary-color-rgb), 0.08)` avec `transform: none`. Titre en Libre Baskerville `1.1rem`.
  - *Timeline de l'Office* (`.do-styled-timeline`) : ligne discrète bornée entre Matines et Complies, avec puces épurées indiquant l'heure actuelle.

### B. La Page de Recherche (*Quærere*)
- **Structure** :
  - Intégrée directement dans le header sticky sans bordure.
  - Grille adaptative de tuiles carrées (`aspect-ratio: 1 / 1`).
  - `.gregorian-card` : `border: none !important; box-shadow: none !important; border-radius: 12px; transform: none;`.
  - Au survol : uniquement `background: rgba(var(--primary-color-rgb), 0.08) !important;`.
  - Titre tronqué nettement, badge de mode discret, bouton zoom et écoute intégrés en bas de carte.

### C. La Barre Latérale (`#doSidebar`)
- Fond noir total `#000000`.
- Items (`.do-nav-item`) : hauteur 38px, `border: none !important;`, `background: transparent;`, `border-radius: 9px;`.
- Typographie : Libre Baskerville `0.92rem`.
- État actif : `background: rgba(var(--primary-color-rgb), 0.14); color: var(--primary-color); font-weight: 600;`.
- Séparateur (`.do-nav-divider`) : ligne ultra fine de 1px `rgba(255, 255, 255, 0.08)`.

### D. L'En-tête Sticky (`.do-top-header`)
- **Au repos** : Totalement transparent, aucun filet, aucune bordure inférieure (`border-bottom: none !important;`).
- **Au défilement (`.is-scrolled`)** : Fond flouté dépoli discret (`blur(18px) saturate(160%)`) avec `color-mix` à 72% d'opacité.
- Permet au contenu (comme l'image du saint ou les titres) de glisser sous le header avec un effet de verre dépoli naturel.

### E. Le Menu Déroulant (`#headerDropdown` / `.hdd-*`)
- Fond flouté plein écran immersif (`blur(28px)`).
- Items de sélection (`.hdd-item-card`) : `border: none !important; background: transparent !important; border-radius: 10px;`.
- Survol : `background: rgba(var(--primary-color-rgb), 0.09) !important;` (glissement horizontal minimaliste `translateX(2px)` sans décalage vertical).
- Barre de recherche (`.hdd-search-input`) : `border: none !important; border-radius: 12px; background: var(--background-highlight);`.

---

## 7. Règle d'or pour toute future page (notamment Grégobase)

```css
/* TOUJOURS RESPECTER CES RÈGLES */
.element-card {
    background: var(--background-surface);
    border: none !important;             /* ZÉRO bordure */
    box-shadow: none !important;         /* ZÉRO ombre portée */
    text-shadow: none !important;        /* ZÉRO glow de texte */
    border-radius: 12px;                 /* Arrondi standard 12px */
    transition: background 0.18s ease;
}

.element-card:hover {
    background: rgba(var(--primary-color-rgb), 0.08) !important; /* Simple nuance */
    transform: none !important;          /* JAMAIS de translateY */
    box-shadow: none !important;         /* ZÉRO glow au survol */
}

.element-card:active {
    background: rgba(var(--primary-color-rgb), 0.14) !important;
    transform: none !important;
    box-shadow: none !important;
}
```
