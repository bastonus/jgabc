# Oremus — Bréviaire & Liturgie Traditionnelle Catholique

Application web et mobile (PWA / Android APK) pour la prière liturgique catholique traditionnelle : **Divinum Officium** (Bréviaire romain 1960), **Missa** (Messe tridentine), **Sainte Écriture** (Vulgate, Crampon, Douay-Rheims, Matos Soares) et **Chant Grégorien** (plus de 22 500 partitions avec rendu Exsurge SVG à la volée).

---

## 📜 Charte Graphique de Sobriété (« Modern Sacred »)

L'intégralité du design visuel et de l'expérience utilisateur d'Oremus est régie par la **Charte de Sobriété Liturgique** :
👉 **[Lire la Charte Graphique Complète (CHARTE_GRAPHIQUE.md)](CHARTE_GRAPHIQUE.md)**  
*(Également archivée dans [`docs/charte_graphique_sobriete.md`](docs/charte_graphique_sobriete.md))*

### Résumé des Règles Inviolables :
1. **Zéro bordure, jamais (*Frameless & Zero-Strokes*)** :
   - Aucun élément (cartes, tuiles, boutons, conteneurs, popups, inputs, en-têtes) ne possède de contour visible (`border: none !important; box-shadow: none !important;`).
   - La hiérarchie spatiale repose exclusivement sur la nuance des surfaces (`--background-base: #000000;`, `--background-surface: #0a0a0a;`, `--background-highlight: #141414;`).
2. **Aucune carte dans une carte ni conteneurs superflus (*Flat Single-Surface Hierarchy*)** :
   - Pas de cartes gigognes, pas de grands conteneurs "hero" ou de boîtes englobant d'autres cartes. Les éléments interactifs reposent directement sur le fond de l'application.
3. **Zéro titre ou label redondant (*Minimalist Information Density*)** :
   - Ne pas répéter dans le corps de page ce qui figure déjà dans le header sticky (`#doHeaderTitle` / `#doHourLabel`). Pas de titres évidents ni de mentions verbeuses.
4. **Marges régulières et aérées (*Breathing Spaces & Rhythm*)** :
   - `gap: 10px` à `14px` pour les grilles, padding latéral `12px` à `20px`, padding bas safe-area `calc(36px + env(safe-area-inset-bottom))`.
5. **Limitation stricte des animations aux gestes réels (*Gesture-Driven Motion Only*)** :
   - Strictement aucun effet de "lévitation" ou translation verticale (`transform: translateY(-...)`) au survol ou au chargement (`fadeIn`).
   - Seuls les gestes directs de l'utilisateur sont animés : glissement de la sidebar, drag du lecteur / sélecteur, scroll inertiel natif.
6. **Rayons d'arrondis standardisés** :
   - `6px` pour micro-badges et puces NABC.
   - `8px` à `10px` pour items de la sidebar, onglets et menu déroulant.
   - `10px` à `12px` pour champs de recherche.
   - `12px` à `14px` pour cartes liturgiques et tuiles grégoriennes.
   - `16px` pour grands panneaux modaux.
7. **Zéro effet de glow, néon ou halo lumineux (*Zero Glow / No Luminescent Halos*)** :
   - Proscription absolue de toute luminescence diffuse ou halo néon (`box-shadow: 0 0 ...`, `text-shadow: none !important;`, `filter: drop-shadow(...)`).
   - Surfaces, cartes, boutons et notes grégoriennes restent nets, mats et contrastés sans artifice lumineux.

---

## ⚡ Architecture & Lazy Loading
- **Score Lazy-Renderer** : rendu SVG Exsurge vectoriel à la volée orchestré par `IntersectionObserver` avec portée grégorienne tétragramme (4 lignes) en pré-rendu fluide.
- **Chunked Infinite Scroll** : injection fluide par paquets de 40-50 partitions pour parcourir les 22 541 pièces sans saccade.

---

## 🛠️ Développement & Déploiement

### Synchronisation des Assets & APK
Pour propager l'ensemble des fichiers racine (`divinum-officium.html`, `css/`, `js/`, etc.) vers le dossier web `www/` et le dossier Android natif (`android/app/src/main/assets/public/`) :
```bash
node tools/sync_apk_assets.mjs
```

### Lancement local
```bash
npx http-server -p 8080 -c-1
```
Accéder à l'application via `http://localhost:8080/divinum-officium.html`.
