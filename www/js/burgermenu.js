// Fonction pour basculer l'affichage du menu burger
function toggleBurgerMenu() {
  const navMenu = document.querySelector('.nav-pills');
  navMenu.classList.toggle('show');
  
  // Ajouter une classe au body pour empêcher le défilement lors de l'ouverture du menu sur mobile
  if (window.innerWidth <= 768) {
    document.body.classList.toggle('menu-open');
  }
}

// Fonction pour fermer le menu
function closeMenu() {
  const navMenu = document.querySelector('.nav-pills');
  if (navMenu.classList.contains('show')) {
    navMenu.classList.remove('show');
    document.body.classList.remove('menu-open');
  }
}

// Ajouter l'événement au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
  const burgerButton = document.querySelector('.burger-menu');
  
  if (burgerButton) {
    burgerButton.addEventListener('click', toggleBurgerMenu);
  }
  
  // Fermer le menu quand on clique sur un lien du menu
  const menuLinks = document.querySelectorAll('.nav-pills a');
  if (menuLinks) {
    menuLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });
  }
  
  // Fermer le menu quand on clique à l'extérieur
  document.addEventListener('click', function(event) {
    const navMenu = document.querySelector('.nav-pills');
    const burgerButton = document.querySelector('.burger-menu');
    
    if (navMenu && burgerButton) {
      if (!navMenu.contains(event.target) && !burgerButton.contains(event.target)) {
        navMenu.classList.remove('show');
        document.body.classList.remove('menu-open');
      }
    }
  });
  
  // Ajuster la hauteur des zones d'édition lors du redimensionnement de la fenêtre
  window.addEventListener('resize', function() {
    adjustEditorHeights();
  });
  
  // Ajuster la hauteur des zones d'édition lors du chargement initial
  adjustEditorHeights();
});

// Fonction pour ajuster les hauteurs des éditeurs en fonction de la taille de l'écran
function adjustEditorHeights() {
  const isMobile = window.innerWidth <= 768;
  
  // Utiliser jQuery pour la cohérence avec le reste de l'application
  if (typeof $ !== 'undefined') {
    if (isMobile) {
      // Sur mobile, ajuster la hauteur du chant-parent2
      $('#chant-parent2').css('height', '50vh');
      
      // Limiter la hauteur des zones de texte
      $('textarea').css('height', '180px');
    } else {
      // Sur desktop, rétablir les hauteurs
      $('#chant-parent2').css('height', '60vh');
      
      // Restaurer les hauteurs spécifiques
      $('#hymntext, #hymngabc').css('height', '250px');
      $('#editor').css('height', '400px');
    }
  } else {
    // Fallback si jQuery n'est pas disponible
    const chantParent = document.getElementById('chant-parent2');
    const textareas = document.querySelectorAll('textarea');
    
    if (isMobile) {
      if (chantParent) chantParent.style.height = '50vh';
      textareas.forEach(t => t.style.height = '180px');
    } else {
      if (chantParent) chantParent.style.height = '60vh';
      
      const hymntext = document.getElementById('hymntext');
      const hymngabc = document.getElementById('hymngabc');
      const editor = document.getElementById('editor');
      
      if (hymntext) hymntext.style.height = '250px';
      if (hymngabc) hymngabc.style.height = '250px';
      if (editor) editor.style.height = '400px';
    }
  }
} 