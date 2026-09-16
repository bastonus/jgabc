# Documentation du Projet Oremus (jgabc)

Bienvenue dans la documentation technique du projet **Oremus**. Ce document sert de point d'entrée pour les développeurs et les agents AI travaillant sur ce dépôt.

---

## 📑 Sommaire des Guides et Spécifications

### 1. Architecture & Fonctionnement
- **[Architecture des Modules Grégoriens & Streaming GABC](file:///docs/architecture/ARCHITECTURE_MODULES_GABC.md)** :
  - Fonctionnement du streaming à la volée via GitHub Raw (0 Mo par défaut).
  - Découpage en 2 paquets hors-ligne : **Pack Liturgique** (5 330 pièces, ~2.8 Mo) et **Corpus Complet GregoBase** (25 290 pièces, ~6.4 Mo).
  - Mécanisme de résolution en cascade dans `js/gregorian_db.js` (Mémoire → IndexedDB → CacheStorage → GitHub).
  - Gestionnaire de modules UI (`OremusModuleManager` dans `js/divinum_officium.js`).
  - Scripts de build (`tools/build_modules.mjs`, `tools/pack_zip.py`, `tools/sync_apk_assets.mjs`).

- **[Handoff – Projet GABC Video Notes Alignment](file:///docs/architecture/GABC_VIDEO_ALIGNMENT_HANDOFF.md)** :
  - Objectif : Aligner des enregistrements YouTube de chant grégorien avec les fichiers `.gabc`.
  - Pipeline en 4 étapes : Téléchargement audio (`yt-dlp`), CTC forced alignment (`transformers`), segmentation des neumes et export timestampé.
  - Outil de revue interactive : `pipeline/alignment-lab.html`.

### 2. Procédures et Cycles de Vie
- **[Notes de Version](file:///docs/project/NOTES_DE_VERSION.md)** : Historique des versions et nouveautés.
- **[Procédure de Release](file:///docs/project/RELEASE_PROCEDURE.md)** : Étapes pour préparer et builder une nouvelle version web / Android.
- **[Instructions Liturgiques et Scrapers](file:///docs/project/instructions.md)** : Spécifications sur l'intégration des textes latins et français de Divinum Officium.

---

## 🚀 Commandes de Base

```bash
# Générer / mettre à jour les paquets GABC hors-ligne
node tools/build_modules.mjs

# Synchroniser les fichiers du site avec www/ et l'APK Android (hors JSON volumineux)
node tools/sync_apk_assets.mjs

# Vérifier la syntaxe JS des modules
node -c js/gregorian_db.js
node -c js/divinum_officium.js
```
