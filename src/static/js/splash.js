// Splash screen controller
export function initSplash(duration = 3000) {
  const splashScreen = document.getElementById('splash-screen');
  
  if (!splashScreen) return;

  // Fade out after specified duration
  setTimeout(() => {
    splashScreen.classList.add('fade-out');
    
    // Remove from DOM after fade completes
    setTimeout(() => {
      splashScreen.remove();
    }, 600);
  }, duration);
}
