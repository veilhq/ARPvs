// Splash screen controller + screensaver mode
import { initDitherBackground } from './dither-bg.js';

let splashElement = null;

export function initSplash(duration = 3000) {
  splashElement = document.getElementById('splash-screen');
  if (!splashElement) return;

  // Start the dither background animation
  initDitherBackground();

  // Fade out after specified duration
  setTimeout(() => {
    hideSplash();
  }, duration);

  // Setup screensaver shortcut (S key)
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in an input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      showScreensaver();
    }
  });
}

function hideSplash() {
  if (!splashElement) return;
  splashElement.classList.add('fade-out');

  setTimeout(() => {
    if (window.ditherBackground) {
      window.ditherBackground.stop();
    }
    splashElement.style.display = 'none';
    splashElement.classList.remove('fade-out');
  }, 600);
}

function showScreensaver() {
  if (!splashElement) return;

  // Show it
  splashElement.style.display = 'flex';
  splashElement.style.opacity = '1';

  // Restart the dither animation
  if (window.ditherBackground) {
    window.ditherBackground.start();
  } else {
    initDitherBackground();
  }

  // Dismiss on click or keypress
  function dismiss() {
    hideSplash();
    document.removeEventListener('click', dismiss);
    document.removeEventListener('keydown', dismissOnKey);
  }

  function dismissOnKey(e) {
    dismiss();
  }

  // Delay attaching listeners so the triggering event doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismissOnKey);
  }, 100);
}
