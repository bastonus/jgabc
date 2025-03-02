# **Modification de l'affichage des psaumes dans propers.html**  

## **1. Analyse préalable**  

Avant d’implémenter la modification, il est nécessaire d’analyser plusieurs aspects du fonctionnement existant de l’application.  

### **1.1. Structure et affichage actuels dans propers.html**  
- Le fichier **propers.html** contient les prières de la messe en latin grégorien.  
- Les parties concernées sont :  
  - Introit  
  - Graduel  
  - Tract  
  - Offertoire  
  - Communion  
- Avant chaque partie, la **référence du psaume chanté** est affichée en rouge et en italique.  
- **Objectif :** comprendre comment ces références sont insérées et formatées afin de les réutiliser.  

### **1.2. Récupération des références des psaumes**  
- Les références des psaumes sont stockées dans des fichiers **.gabc**.  
- Il est impératif d’analyser leur structure pour extraire correctement ces références.  
- Identifier dans quel champ ou format ces références apparaissent et comment les récupérer.  

### **1.3. Analyse de l'affichage des épîtres et des évangiles**  
- Actuellement, les **titres** des épîtres et des évangiles sont affichés dans un format précis qu’il faut **reprendre à l’identique** pour les psaumes.  
- Cet affichage inclut :  
  - Un **titre** formaté avec le **nom de la partie en latin**.  
  - Un **menu déroulant** permettant de sélectionner la traduction.  
  - Un affichage des traductions sous la partie concernée.  
- Il faut **identifier précisément** comment ces éléments sont générés dans le code et **réutiliser exactement** ce même mécanisme.  

### **1.4. Fichiers de traduction des psaumes**  
- Les traductions des psaumes sont stockées dans un fichier **Psalmi** (format TSV, sans extension).  
- Ce fichier est présent dans les répertoires **rheims-douay** et **aelf**.  
- Il faut comprendre comment extraire une traduction à partir d’une référence de psaume.  

---

## **2. Modifications à apporter**  

### **2.1. Interface utilisateur : reproduction du modèle des épîtres et évangiles**  
**Objectif :** Copier **exactement** l'affichage et le fonctionnement des épîtres et des évangiles.  

#### **Affichage du titre et du menu déroulant**  
- **Ajouter un libellé avant chaque menu déroulant** sous la forme :  
  `{Nom de la partie en latin}{Référence psaume} :`  
  - Exemple :  
    - *Introit (Ps. 24, 1-3) :*  
    - *Graduel (Ps. 9, 10-11) :*  
  - **Reproduire exactement** la mise en forme des titres des épîtres et évangiles.  

- **Placer immédiatement après ce titre un menu déroulant** **identique** à celui des épîtres et des évangiles, avec les options suivantes :  
  - Français  
  - Anglais  
  - (Le latin n'est pas nécessaire ici car déjà affiché dans la partition).  

#### **Affichage de la traduction**  
- **Utiliser le même mécanisme d’affichage dynamique** que pour les épîtres et évangiles.  
- Lorsqu’une traduction est sélectionnée, elle doit s'afficher **exactement de la même manière**, en dessous de la partie correspondante.  

---

### **2.2. Synchronisation du choix de langue**  
- Lorsqu’un utilisateur sélectionne une langue dans une partie, cette préférence doit être appliquée **à toutes les autres parties** (Introit, Graduel, Tract, Offertoire, Communion).  
- Utiliser le **même système de synchronisation** que pour les épîtres et évangiles :  
  - Stocker la préférence globale dans une **option cachée (hidden)**.  
  - Assurer que toutes les sections mettent à jour leur affichage en conséquence.  
  - **Spécificité pour les psaumes :**  
    - Si un utilisateur sélectionne « French and Latin » pour une épître ou un évangile, alors seule la **traduction française** doit être affichée pour les psaumes.  

---

### **2.3. Extraction et affichage des traductions des psaumes**  
- **Récupération des références** depuis les fichiers **.gabc**.  
- **Recherche des traductions** correspondantes dans **Psalmi** (fichier TSV).  
- Extraction de la traduction en fonction de la langue choisie.  
- **Affichage dynamique sous la partie concernée**, exactement comme pour les épîtres et évangiles.  

---

### **2.4. Vérifications techniques et tests**  
- **Vérifier que la modification ne perturbe pas l’affichage existant.**  
- **S'assurer que la récupération des références des psaumes depuis les fichiers .gabc est fiable.**  
- **Tester la synchronisation avec les épîtres et évangiles.**  

---

## **3. Résumé de la solution**  

1. **Analyser propers.html** pour comprendre comment sont affichées les références des psaumes.  
2. **Examiner les fichiers .gabc** pour identifier comment récupérer ces références.  
3. **Reproduire exactement l’affichage des épîtres et des évangiles** :  
   - **Format du titre** avec la référence du psaume.  
   - **Menu déroulant** identique.  
   - **Affichage dynamique des traductions** sous la partie correspondante.  
4. **Synchroniser le choix de langue** entre toutes les parties concernées.  
5. **Extraire et afficher les traductions** à partir du fichier **Psalmi**, en respectant les règles de formatage des épîtres et évangiles.  
6. **Tester l’intégration complète** pour garantir un fonctionnement homogène avec l’ensemble du système.  

---

Cette solution impose une intégration **exactement identique** à celle des épîtres et des évangiles, tout en adaptant les spécificités pour les psaumes.