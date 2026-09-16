# Serveur Distant Oremus & Relais de Synchronisation (Coolify)

Ce micro-service autonome permet aux relecteurs de l'application mobile Android (APK) et de la version Web/PWA d'Oremus de synchroniser leurs avis de validation grégorienne de façon totalement transparente et en arrière-plan.

---

## 🌟 Caractéristiques

- **Zéro dépendance externe** : Fonctionne directement avec le runtime natif Node.js 18+ (< 60 Mo d'image Docker).
- **Persistance locale sur volume Docker** : Tous les avis reçus sont immédiatement sauvegardés sur disque dans `/app/data/pending/`. Aucun avis n'est perdu même en cas de panne de réseau.
- **Synchronisation GitHub directe (ZÉRO ISSUE)** : Si `GITHUB_TOKEN` est renseigné, le serveur committe directement chaque fichier d'avis dans `pipeline/reviews/pending/` sur la branche `master` du dépôt GitHub `bastonus/jgabc`.
- **Support des requêtes en arrière-plan** : Entièrement compatible avec les requêtes de fermeture d'application émises par le thread Java natif de l'APK Android (`AndroidBrowser.sendBackgroundBatch`) et les requêtes `keepalive` du Web.

---

## 🚀 Déploiement en 2 minutes sur Coolify

### Méthode 1 : Déploiement via dépôt Git (Recommandé)
1. Rendez-vous sur votre tableau de bord **Coolify**.
2. Cliquez sur **+ Create New Resource** -> **Git Repository (Public/Private)**.
3. Renseignez :
   - **Repository URL** : `https://github.com/bastonus/jgabc`
   - **Branch** : `master`
   - **Base Directory** : `/server`
   - **Build Pack** : `Dockerfile`
4. Dans **Configuration** -> **Environment Variables**, configurez :
   ```env
   PORT=3000
   DATA_DIR=/app/data
   GITHUB_TOKEN=ghp_votreTokenGitHubPersonalAccessToken
   ```
   *(Note : `GITHUB_TOKEN` est facultatif. Si vous le laissez vide, les avis restent sauvegardés en local sur le volume Coolify).*
5. Dans **Configuration** -> **Persistent Storage**, assurez-vous qu'un volume persistant est monté sur :
   - Destination path : `/app/data`
6. Renseignez votre nom de domaine / sous-domaine (ex: `https://api-oremus.votre-domaine.fr`). Coolify génère automatiquement le certificat SSL Let's Encrypt !
7. Cliquez sur **Deploy**.

### Méthode 2 : Déploiement via Docker Compose
1. Dans Coolify, choisissez **Docker Compose**.
2. Collez le contenu du fichier [`docker-compose.yml`](./docker-compose.yml).
3. Ajustez vos variables d'environnement et déployez.

---

## 📡 Endpoints de l'API

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/health` ou `/` | Health-check pour Coolify et statut du service |
| `POST` | `/api/review` | Réception d'un lot ou d'un avis unitaire |
| `GET` | `/api/reviews/pending` | Liste des avis en attente stockés sur le volume |
| `GET` | `/api/reviews/stats` | Statistiques (total, conformes, décalés, mauvais chants) |

---

## 📱 Connexion depuis l'application Oremus

Une fois votre serveur déployé (par exemple à l'adresse `https://api-oremus.votre-domaine.fr`), vous pouvez le configurer dans Oremus de deux manières :
1. **Dans l'interface du Laboratoire d'Alignement** :
   - Cliquez sur le bouton **Sync** dans la barre supérieure.
   - Dans le champ « **Serveur distant Coolify** », collez l'URL de votre serveur : `https://api-oremus.votre-domaine.fr/api/review`.
   - Cliquez sur « **Tester & Enregistrer** ».
2. **Par défaut dans le code** :
   - Définir `window.OREMUS_REVIEW_RELAY_URL = 'https://api-oremus.votre-domaine.fr/api/review';` dans le fichier `pipeline/alignment-lab.html`.
