/**
 * theme.js — Accent color management and persistence.
 */

const STORAGE_KEY = 'arpvs-accent-color';
const DEFAULT_ACCENT = '#00ff41';

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Lighten a color by a percentage
 */
function lightenColor(hex, percent) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.min(255, Math.round(rgb.r + (255 - rgb.r) * (percent / 100)));
  const g = Math.min(255, Math.round(rgb.g + (255 - rgb.g) * (percent / 100)));
  const b = Math.min(255, Math.round(rgb.b + (255 - rgb.b) * (percent / 100)));
  
  return rgbToHex(r, g, b);
}

/**
 * Darken a color by a percentage
 */
function darkenColor(hex, percent) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const r = Math.max(0, Math.round(rgb.r * (1 - percent / 100)));
  const g = Math.max(0, Math.round(rgb.g * (1 - percent / 100)));
  const b = Math.max(0, Math.round(rgb.b * (1 - percent / 100)));
  
  return rgbToHex(r, g, b);
}

/**
 * Apply accent color to CSS variables
 */
export function setAccentColor(hex) {
  const root = document.documentElement;
  
  // Main accent
  root.style.setProperty('--accent', hex);
  
  // Derived colors
  root.style.setProperty('--accent-dim', hex + '14'); // 8% opacity
  root.style.setProperty('--accent-border', hex + '66'); // 40% opacity
  
  // Store preference
  localStorage.setItem(STORAGE_KEY, hex);
}

/**
 * Get the current accent color
 */
export function getAccentColor() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
}

/**
 * Initialize theme from storage or default
 */
export function initializeTheme() {
  const savedColor = getAccentColor();
  setAccentColor(savedColor);
  
  // Update the color picker if it exists
  const picker = document.getElementById('accent-color');
  if (picker) {
    picker.value = savedColor;
  }
}

/**
 * Setup color picker event listener
 */
export function setupColorPicker() {
  const picker = document.getElementById('accent-color');
  if (!picker) return;
  
  picker.addEventListener('change', (e) => {
    setAccentColor(e.target.value);
  });
  
  picker.addEventListener('input', (e) => {
    setAccentColor(e.target.value);
  });
}
