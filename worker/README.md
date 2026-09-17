# ✦ Pack Worker de Calcul Distribué Oremus ✦

Merci de prêter la puissance de votre ordinateur pour aider à synchroniser les milliers de partitions de chant grégorien de l'application **Oremus** !

---

## 🚀 Démarrage en 1 minute (Même si vous n'y connaissez rien en informatique !)

### Sous Windows :
1. Décompressez le dossier `oremus-worker.zip`.
2. Double-cliquez sur le fichier **`start_worker.bat`**.
3. Entrez votre prénom ou pseudo (pour figurer sur le tableau des contributeurs en ligne !).
4. Choisissez la durée de votre session de calcul (ex: 15, 30, 60 minutes, ou 0 pour continu).
5. **C'est tout !** Votre ordinateur commence à aligner les pièces musicales et à envoyer les résultats au serveur. Dès la fin de la session, un lien direct s'affiche pour inspecter et valider votre lot !

### Sous macOS (MacBook, iMac) ou Linux :
1. Décompressez l'archive.
2. Ouvrez l'application **Terminal** dans le dossier décompressé.
3. Tapez simplement :
   ```bash
   chmod +x start_worker.sh
   ./start_worker.sh
   ```
4. Indiquez votre pseudo, votre durée de session et validez !

---

## ❓ Questions Fréquentes (FAQ)

### 1. Puis-je arrêter le calcul à tout moment ?
**Oui, absolument !** Fermez la fenêtre noire ou appuyez sur les touches `Ctrl + C`. Le serveur attribuera automatiquement la pièce non terminée à un autre ami, aucun travail n'est perdu. Vous pouvez relancer le script quand vous le souhaitez.

### 2. Est-ce que cela va ralentir mon ordinateur ou occuper tout mon disque ?
- **Stockage** : Chaque extrait audio YouTube est temporaire et **immédiatement supprimé** dès que la partition est synchronisée. Le dossier ne grossira pas.
- **Performances** : Le calcul tourne en tâche de fond. Si vous jouez ou travaillez sur une tâche lourde, vous pouvez simplement fermer la fenêtre le temps de votre activité.

### 3. Faut-il une carte graphique puissante ?
- Si vous avez une carte **NVIDIA** (ex: GeForce RTX / GTX), le script l'utilisera automatiquement pour aller jusqu'à 10 fois plus vite !
- Si vous avez un **Mac avec puce Apple Silicon** (M1, M2, M3, M4), le moteur Metal sera automatiquement sollicité.
- Si vous n'avez pas de carte graphique dédiée, le processeur (**CPU**) fonctionnera également très bien.

### 4. Comment voir ma progression ?
Rendez-vous sur la page web en direct :
👉 **https://api-oremus.silverhorse.fr/worker**
Vous y verrez le nombre total de pièces synchronisées et votre pseudo dans le classement des amis contributeurs !

---
*Projet libre et liturgique Oremus — Merci pour votre aide précieuse !*
