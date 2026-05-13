/**
 * theme.js — Accent color + palette engine for ARPvs.
 *
 * Handles:
 * - Reading/writing accent color to localStorage
 * - Hex → RGB → HSL conversions
 * - Generating a 4-color palette from the accent using the selected palette mode
 * - Applying all derived colors as CSS custom properties on :root
 * - Cycling through palette modes on button click
 * - Scroll shadow on topbar
 */

const STORAGE_KEY = 'arpvs-accent-color';
const PALETTE_MODE_KEY = 'arpvs-palette-mode';
const DEFAULT_ACCENT = '#73ff00';

// --- Color conversion utilities ---

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;

  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function dimColor(hex, factor) {
  const rgb = hexToRgb(hex);
  return `rgb(${Math.round(rgb.r * factor)},${Math.round(rgb.g * factor)},${Math.round(rgb.b * factor)})`;
}

// --- Palette modes ---

const PALETTE_MODES = ['split', 'triadic', 'analogous', 'square', 'complement'];
const PALETTE_LABELS = { split: 'SPL', triadic: 'TRI', analogous: 'ANA', square: 'SQR', complement: 'CMP' };
const PALETTE_TITLES = {
  split:      'Split-complementary',
  triadic:    'Triadic',
  analogous:  'Analogous',
  square:     'Tetradic (square)',
  complement: 'Complementary'
};

function buildPalette(hex, mode) {
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  let warm, cool, comp;

  switch (mode) {
    case 'triadic':
      warm = hslToHex(hsl.h + 120, Math.min(hsl.s * 1.1, 1), Math.min(hsl.l * 1.15, 0.75));
      cool = hslToHex(hsl.h + 240, Math.min(hsl.s * 0.9, 1), Math.min(hsl.l * 0.95, 0.65));
      comp = hslToHex(hsl.h + 180, hsl.s * 0.7, Math.min(hsl.l * 0.85, 0.55));
      break;
    case 'analogous':
      warm = hslToHex(hsl.h + 30, Math.min(hsl.s * 1.05, 1), Math.min(hsl.l * 1.1, 0.75));
      cool = hslToHex(hsl.h + 60, Math.min(hsl.s * 0.9, 1), Math.min(hsl.l * 0.95, 0.65));
      comp = hslToHex(hsl.h - 30, hsl.s * 0.85, Math.min(hsl.l * 0.9, 0.6));
      break;
    case 'square':
      warm = hslToHex(hsl.h + 90, Math.min(hsl.s * 1.1, 1), Math.min(hsl.l * 1.1, 0.75));
      cool = hslToHex(hsl.h + 180, Math.min(hsl.s * 0.9, 1), Math.min(hsl.l * 0.95, 0.65));
      comp = hslToHex(hsl.h + 270, hsl.s * 0.8, Math.min(hsl.l * 0.85, 0.55));
      break;
    case 'complement':
      warm = hslToHex(hsl.h + 180, Math.min(hsl.s * 1.1, 1), Math.min(hsl.l * 1.2, 0.75));
      cool = hslToHex(hsl.h + 180, Math.min(hsl.s * 0.7, 1), Math.min(hsl.l * 0.7, 0.5));
      comp = hslToHex(hsl.h, hsl.s * 0.5, Math.min(hsl.l * 0.6, 0.4));
      break;
    default: // 'split' — split-complementary
      warm = hslToHex(hsl.h + 150, Math.min(hsl.s * 1.1, 1), Math.min(hsl.l * 1.15, 0.75));
      cool = hslToHex(hsl.h + 210, Math.min(hsl.s * 0.9, 1), Math.min(hsl.l * 0.95, 0.65));
      comp = hslToHex(hsl.h + 180, hsl.s * 0.7, Math.min(hsl.l * 0.85, 0.55));
  }

  return { accent: hex, warm, cool, comp };
}

// --- State ---

let paletteMode = localStorage.getItem(PALETTE_MODE_KEY) || 'split';
if (!PALETTE_MODES.includes(paletteMode)) paletteMode = 'split';

// --- Apply accent + palette to CSS custom properties ---

function applyAccent(hex) {
  const root = document.documentElement;
  const rgb = hexToRgb(hex);
  const palette = buildPalette(hex, paletteMode);

  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-dim', `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`);
  root.style.setProperty('--accent-glow', `rgba(${rgb.r},${rgb.g},${rgb.b},0.06)`);
  root.style.setProperty('--accent-border', `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`);
  root.style.setProperty('--warm', palette.warm);
  root.style.setProperty('--cool', palette.cool);
  root.style.setProperty('--comp', palette.comp);

  updatePalettePreview(palette);

  // Sync accent button background
  const accentBtn = document.getElementById('accent-color');
  if (accentBtn) accentBtn.style.background = hex;

  // Update dither background if active
  if (window.ditherBackground) {
    window.ditherBackground.setColor(hex);
    window.ditherBackground.setPalette([palette.accent, palette.warm, palette.cool, palette.comp]);
  }
}

function updatePalettePreview(palette) {
  const preview = document.getElementById('palette-preview');
  if (!preview) return;
  const swatches = preview.querySelectorAll('.swatch');
  const colors = [palette.accent, palette.warm, palette.cool, palette.comp];
  const labels = ['accent', 'warm', 'cool', 'comp'];

  swatches.forEach((sw, i) => {
    if (i < colors.length) {
      sw.style.background = colors[i];
      sw.setAttribute('title', `${labels[i]}: ${colors[i]}`);
    }
  });
}

// --- Exported API (keeps compatibility with existing imports) ---

export function setAccentColor(hex) {
  applyAccent(hex);
  localStorage.setItem(STORAGE_KEY, hex);
}

export function getAccentColor() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_ACCENT;
}

export function initializeTheme() {
  const savedColor = getAccentColor();
  applyAccent(savedColor);

  const picker = document.getElementById('accent-color');
  if (picker) picker.value = savedColor;

  updateModeButton();
}

export function setupColorPicker() {
  const picker = document.getElementById('accent-color');
  if (!picker) return;

  picker.value = getAccentColor();

  picker.addEventListener('input', (e) => {
    setAccentColor(e.target.value);
  });
}

// --- Palette mode toggle ---

function updateModeButton() {
  const btn = document.getElementById('palette-mode');
  if (!btn) return;
  btn.textContent = PALETTE_LABELS[paletteMode] || 'SPL';
  const nextIdx = (PALETTE_MODES.indexOf(paletteMode) + 1) % PALETTE_MODES.length;
  btn.title = `${PALETTE_TITLES[paletteMode]} — click for ${PALETTE_TITLES[PALETTE_MODES[nextIdx]].toLowerCase()}`;
}

export function setupPaletteMode() {
  const btn = document.getElementById('palette-mode');
  if (!btn) return;

  updateModeButton();

  btn.addEventListener('click', () => {
    const idx = PALETTE_MODES.indexOf(paletteMode);
    paletteMode = PALETTE_MODES[(idx + 1) % PALETTE_MODES.length];
    localStorage.setItem(PALETTE_MODE_KEY, paletteMode);
    updateModeButton();

    applyAccent(getAccentColor());
  });
}

// --- Scroll shadow on topbar ---

export function setupScrollShadow() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;

  const content = document.querySelector('.content');
  const target = content || window;

  if (content) {
    content.addEventListener('scroll', () => {
      topbar.classList.toggle('scrolled', content.scrollTop > 10);
    });
  } else {
    window.addEventListener('scroll', () => {
      topbar.classList.toggle('scrolled', window.scrollY > 10);
    });
  }
}

// --- Light/Dark mode toggle ---

const THEME_KEY = 'arpvs-theme';

export function initializeThemeMode() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeToggleIcon();
}

export function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  updateThemeToggleIcon();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeToggleIcon();
  });
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
  // Sun icon for dark mode (click to go light), moon for light mode (click to go dark)
  if (isDark) {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  } else {
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
}
