// Fonction pour basculer l'affichage du menu burger
function toggleBurgerMenu() {
  const navMenu = document.querySelector('.nav-pills');
  navMenu.classList.toggle('show');
}

// Fonction pour fermer le menu
function closeMenu() {
  const navMenu = document.querySelector('.nav-pills');
  if (navMenu.classList.contains('show')) {
    navMenu.classList.remove('show');
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
      }
    }
  });
}); 