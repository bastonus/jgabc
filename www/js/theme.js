// Système de gestion des thèmes pour l'application Tridentine
// Permet de basculer entre les modes clair et sombre

/**
 * Bascule entre les thèmes clair et sombre
 * Utilise l'attribut data-theme sur l'élément racine
 * et sauvegarde le choix dans le localStorage
 */
function toggleTheme() {
  // Vérifier le thème actuel
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  
  // Changer pour le thème opposé
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  // Appliquer le nouveau thème
  document.documentElement.setAttribute('data-theme', newTheme);
  
  // Sauvegarder dans localStorage
  localStorage.setItem('theme', newTheme);
  
  // Mettre à jour l'icône du bouton
  updateThemeButtonIcon(newTheme);
}

/**
 * Met à jour l'icône du bouton de thème
 * @param {string} theme - Le thème actuel ('light' ou 'dark')
 */
function updateThemeButtonIcon(theme) {
  const themeButtons = document.querySelectorAll('.theme-toggle');
  
  themeButtons.forEach(button => {
    if (theme === 'dark') {
      button.innerHTML = '<i class="fa fa-sun-o" aria-hidden="true"></i>';
      button.setAttribute('title', 'Passer au thème clair');
    } else {
      button.innerHTML = '<i class="fa fa-moon-o" aria-hidden="true"></i>';
      button.setAttribute('title', 'Passer au thème sombre');
    }
  });
}

/**
 * Initialise le thème lors du chargement de la page
 */
function initTheme() {
  // Récupérer le thème sauvegardé ou utiliser les préférences du système
  const savedTheme = localStorage.getItem('theme');
  
  // Toujours utiliser le thème clair par défaut (ignorer les préférences système)
  const theme = savedTheme || 'light';
  
  // Appliquer le thème
  document.documentElement.setAttribute('data-theme', theme);
  
  // Mettre à jour l'icône du bouton
  updateThemeButtonIcon(theme);
}

// Initialiser le thème au chargement du document
document.addEventListener('DOMContentLoaded', initTheme); 