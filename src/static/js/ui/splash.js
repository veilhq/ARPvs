/**
 * splash.js — Diagnostic boot sequence splash screen.
 */
import { initDitherBackground } from './dither-bg.js';

let splashElement = null;

export function initSplash(duration = 3000) {
  splashElement = document.getElementById('splash-screen');
  if (!splashElement) return;

  // Start the dither background animation
  initDitherBackground();

  // Boot sequence lines
  const bootLines = splashElement.querySelector('.splash-boot');
  if (bootLines) {
    const lines = bootLines.querySelectorAll('.boot-line');
    lines.forEach((line, i) => {
      setTimeout(() => {
        line.classList.add('visible');
      }, 400 + i * 300);
    });
  }

  // Fade out after specified duration
  setTimeout(() => {
    hideSplash();
  }, duration);

  // Setup screensaver shortcut (S key)
  document.addEventListener('keydown', (e) => {
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

  splashElement.style.display = 'flex';
  splashElement.style.opacity = '1';

  if (window.ditherBackground) {
    window.ditherBackground.start();
  } else {
    initDitherBackground();
  }

  function dismiss() {
    hideSplash();
    document.removeEventListener('click', dismiss);
    document.removeEventListener('keydown', dismissOnKey);
  }

  function dismissOnKey() {
    dismiss();
  }

  setTimeout(() => {
    document.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismissOnKey);
  }, 100);
}
