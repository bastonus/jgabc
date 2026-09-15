# 🚀 Guide de Procédure de Publication & Release — Oremus

Ce document est le **guide de référence exhaustif** destiné à tout agent d'IA ou développeur intervenant sur le dépôt Oremus (`jgabc`). Il détaille précisément la chaîne de publication, les fichiers à synchroniser obligatoirement, la structure de `notifications.json` et `docs/project/NOTES_DE_VERSION.md`, ainsi que les pièges fréquents à éviter.

---

## 1. Vue d'Ensemble de l'Architecture de Version

L'application **Oremus** fonctionne sur une architecture hybride :
1. **Web & PWA Hors-Ligne** : Hébergée sur GitHub Pages directement depuis la racine (`.`). Contrôlée par le Service Worker [`sw.js`](file:///d:/Documents/jgabc/sw.js).
2. **Application Android Native** : Compilée via Capacitor (`@capacitor/android`) avec Gradle dans [`android/`](file:///d:/Documents/jgabc/android). Capacitor utilise [`www/`](file:///d:/Documents/jgabc/www) comme répertoire web cible (`webDir: "www"` dans [`capacitor.config.json`](file:///d:/Documents/jgabc/capacitor.config.json)).
3. **Moteur d'Auto-Mise à Jour** :
   - L'application vérifie périodiquement l'URL brute GitHub de [`version.json`](file:///d:/Documents/jgabc/version.json) (`raw.githubusercontent.com/...`) sans passer par l'API REST de GitHub (pour contourner le quota de 60 requêtes/heure et les erreurs HTTP 403).
   - Les annonces, bannières et fenêtres modales de nouveautés sont alimentées dynamiquement par [`notifications.json`](file:///d:/Documents/jgabc/notifications.json).

---

## 2. Les 7 Fichiers à Mettre à Jour Obligatoirement

À chaque nouvelle release (ex. passage de `v0.0.57` à `v0.0.58`), vous devez impérativement mettre à jour les 7 fichiers suivants de manière synchronisée :

```
jgabc/
├── package.json                              <-- 1. Version npm ("version": "0.0.58")
├── android/app/build.gradle                  <-- 2. versionCode 58 & versionName "beta-0.0.58"
├── js/divinum_officium.js                    <-- 3. var CURRENT_APP_VERSION = 'beta-0.0.58';
├── www/js/divinum_officium.js                <-- 4. Copie synchronisée pour l'APK Android
├── sw.js (& www/sw.js)                       <-- 5. CACHE_NAME = 'oremus-pwa-v1.3.XX';
├── version.json                              <-- 6. Détection de mise à jour pour le client
├── notifications.json                        <-- 7. Flux de notifications in-app et modale
└── docs/project/NOTES_DE_VERSION.md          <-- 8. Changelog complet rédigé
```

---

## 3. Détail Fichier par Fichier

### 1️⃣ [`package.json`](file:///d:/Documents/jgabc/package.json)
Incrémenter le champ `"version"` :
```json
{
  "name": "oremus",
  "version": "0.0.58",
  ...
}
```

---

### 2️⃣ [`android/app/build.gradle`](file:///d:/Documents/jgabc/android/app/build.gradle)
Dans le bloc `defaultConfig` :
- `versionCode` : Entier strict incrémenté de +1 (ex. `57` ➔ `58`). Utilisé par Android pour déterminer si l'APK est une mise à niveau.
- `versionName` : Chaîne utilisateur préfixée de `beta-` (ex. `"beta-0.0.58"`).
```groovy
defaultConfig {
    applicationId "com.chanttools.divinumofficium"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 58
    versionName "beta-0.0.58"
    ...
}
```

---

### 3️⃣ [`js/divinum_officium.js`](file:///d:/Documents/jgabc/js/divinum_officium.js)
À la ligne ~14605, repérer la constante :
```javascript
// ── GitHub Releases Update Engine ──
var CURRENT_APP_VERSION = 'beta-0.0.58';
```
> [!WARNING]
> **Piège critique** : Si `CURRENT_APP_VERSION` n'est pas incrémenté ici, l'application comparera sa propre version obsolète avec `version.json` et affichera une fausse alerte « Mise à jour disponible » en boucle à l'utilisateur !

---

### 4️⃣ Synchronisation du Répertoire [`www/`](file:///d:/Documents/jgabc/www)
Capacitor compile l'APK à partir de `www/`. Copiez toujours les versions à jour vers `www/` :
- [`www/js/divinum_officium.js`](file:///d:/Documents/jgabc/www/js/divinum_officium.js)
- [`www/divinum-officium.html`](file:///d:/Documents/jgabc/www/divinum-officium.html)
- [`www/sw.js`](file:///d:/Documents/jgabc/www/sw.js)
- [`www/js/gregorian_youtube_links.js`](file:///d:/Documents/jgabc/www/js/gregorian_youtube_links.js)
- [`www/js/gregorian_youtube_links.json`](file:///d:/Documents/jgabc/www/js/gregorian_youtube_links.json)

---

### 5️⃣ [`sw.js`](file:///d:/Documents/jgabc/sw.js) et [`www/sw.js`](file:///d:/Documents/jgabc/www/sw.js)
Incrémenter la constante `CACHE_NAME` (ex: `oremus-pwa-v1.3.26` ➔ `oremus-pwa-v1.3.27`).
Cela force les navigateurs et les PWA installées sur écran d'accueil à purger leur cache local et à charger les nouveaux scripts et styles au prochain démarrage.

---

### 6️⃣ [`version.json`](file:///d:/Documents/jgabc/version.json)
Contrat de métadonnées lu par l'auto-updater :
```json
{
  "latestVersion": "beta-0.0.58",
  "versionCode": 58,
  "releaseDate": "2026-09-15T12:45:00Z",
  "tagName": "v0.0.58",
  "downloadUrl": "https://github.com/bastonus/jgabc/releases/download/v0.0.58/Oremus.apk",
  "htmlUrl": "https://github.com/bastonus/jgabc/releases/tag/v0.0.58",
  "body": "Release v0.0.58 — Sommaire dynamique de la Messe & ScrollSpy, 14k nouveaux liens YouTube grégoriens, fluidité gestuelle"
}
```

---

### 7️⃣ [`notifications.json`](file:///d:/Documents/jgabc/notifications.json)
Le flux in-app permet d'afficher automatiquement la modale de nouveautés sur l'appareil de l'utilisateur dès qu'il passe sur la nouvelle version.

**Structure d'une entrée de release :**
1. Mettre à jour l'en-tête global : `"updatedAt": "2026-09-15T12:45:00Z"`
2. Insérer en 1ère position dans le tableau `"notifications"` :
```json
{
  "id": "notif-release-beta-0.0.58",
  "enabled": true,
  "priority": 160,
  "platforms": ["all"],
  "minVersion": "beta-0.0.58",
  "frequency": "once",
  "style": "liturgical",
  "badge": "Mise à jour",
  "icon": "sparkles",
  "title": "Notes de version v0.0.58",
  "subtitle": "Votre application Oremus a été mise à jour",
  "message": "Résumé court en une phrase des nouveautés...",
  "cancelsNotifications": [
    "notif-release-beta-0.0.57",
    "notif-release-beta-0.0.56",
    ... (toutes les versions antérieures pour éviter les doublons de modales)
  ],
  "banner": {
    "show": true,
    "text": "Oremus v0.0.58 : ...",
    "tag": "Nouveautés",
    "actionLabel": "Voir les notes",
    "actionType": "open_modal",
    "dismissible": true
  },
  "modal": {
    "title": "Notes de Version (v0.0.58)",
    "subtitle": "Sous-titre accrocheur",
    "icon": "sparkles",
    "wrappers": [
      {
        "type": "card",
        "icon": "check",
        "title": "Nouveautés de la v0.0.58",
        "content": "<ul><li><strong>Titre :</strong> Description concise en HTML...</li></ul>"
      },
      {
        "type": "card",
        "icon": "check",
        "title": "Rappels des nouveautés de la v0.0.57",
        "content": "<ul>...</ul>"
      },
      {
        "type": "callout",
        "style": "primary",
        "title": "Merci pour tous vos précieux retours",
        "content": "Remerciements aux testeurs..."
      }
    ],
    "buttons": [
      {
        "label": "Parfait, continuer",
        "type": "primary",
        "action": "dismiss",
        "dismissOnClick": true
      }
    ]
  }
}
```

---

### 8️⃣ [`docs/project/NOTES_DE_VERSION.md`](file:///d:/Documents/jgabc/docs/project/NOTES_DE_VERSION.md)
Le journal de bord historique du projet. Chaque version est insérée au sommet du document au format Markdown :
- En-tête : `## 🚀 Version 0.0.XX (Date en Français)`
- Sections claires avec émojis thématiques :
  - `### 📑 Fonctionnalités / Nouveautés majeures`
  - `### 🎵 Moteur Audio & Partitions Grégoriennes`
  - `### 🖐️ Expérience Utilisateur & Ergonomie`
  - `### 📁 Architecture & Dépôt`
  - `### 🛡️ Versionnage & Maintenance` (liste les correspondances exactes de tags, codes et dates).

---

## 4. Empaquetage des Modules d'Assets

Avant de committer et tagger, exécuter toujours :
```bash
npm run pack:modules
```
Ce script Node.js ([`tools/build_modules.mjs`](file:///d:/Documents/jgabc/tools/build_modules.mjs)) :
1. Recherche toutes les images dans `img/saints/` et crée [`dist_modules/saints.pack`](file:///d:/Documents/jgabc/dist_modules/saints.pack).
2. Parcourt l'arborescence complète pour compresser toutes les partitions GABC dans [`dist_modules/gabc.pack`](file:///d:/Documents/jgabc/dist_modules/gabc.pack).

---

## 5. Workflow Git & CI/CD GitHub Actions

Une fois tous les fichiers synchronisés et vérifiés :

1. **Vérifier l'état Git** :
   ```bash
   git status --short
   ```
2. **Créer le commit de release** :
   ```bash
   git add -A
   git commit -m "Release v0.0.58 — Sommaire dynamique de la Messe & ScrollSpy, 14k liens YouTube, fluidité gestuelle"
   ```
3. **Créer le Tag Git** :
   ```bash
   git tag v0.0.58
   ```
4. **Pousser sur la branche distante avec les tags** :
   ```bash
   git push origin master --tags
   ```

### Que fait le workflow GitHub Actions ([`.github/workflows/build-apk.yml`](file:///d:/Documents/jgabc/.github/workflows/build-apk.yml)) ?
Dès la détection d'un tag `v*` :
1. Configure JDK 21, Android SDK, Node.js 22, Python 3.12.
2. Compile l'index de recherche local (`extract_gregobase.py`).
3. Installe les dépendances npm et exécute `npx cap sync android` puis `clean_android_assets.mjs` (retire les 25 000 fichiers GABC bruts de l'APK pour alléger la taille finale).
4. Génère le keystore de signature si absent et compile avec `./gradlew :app:assembleRelease`.
5. Vérifie l'alignement (`zipalign`) et la signature cryptographique (`apksigner`).
6. Publie automatiquement la **Release GitHub officielle**, attache `Oremus.apk` et met à jour [`version.json`](file:///d:/Documents/jgabc/version.json) sur master avec le commit `[skip ci]`.

> [!NOTE]
> **Android SDK dans GitHub Actions** : Les runners `ubuntu-latest` de GitHub Actions intègrent déjà nativement le SDK Android complet (`$ANDROID_HOME = /usr/local/lib/android/sdk`) avec les build-tools et plateformes nécessaires. L'action tierce `android-actions/setup-android@v3` ne doit **pas** être utilisée car elle tente de télécharger le paquet obsolète `tools` supprimé par Google de son référentiel SDK, ce qui provoque une erreur `Failed to find package 'tools'`.

