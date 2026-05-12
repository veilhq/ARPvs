// Splash screen controller
import { initDitherBackground } from './dither-bg.js';

export function initSplash(duration = 3000) {
  const splashScreen = document.getElementById('splash-screen');
  
  if (!splashScreen) return;

  // Start the dither background animation
  initDitherBackground();

  // Fade out after specified duration
  setTimeout(() => {
    splashScreen.classList.add('fade-out');
    
    // Stop animation and remove from DOM after fade completes
    setTimeout(() => {
      if (window.ditherBackground) {
        window.ditherBackground.stop();
      }
      splashScreen.remove();
    }, 600);
  }, duration);
}
