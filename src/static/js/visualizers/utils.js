/**
 * visualizers/utils.js — Shared utilities for all visualizer modes.
 *
 * Provides palette reading, color math, and audio energy helpers.
 * Each visualizer imports what it needs from here.
 */

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 0, b: 0 };
}

/**
 * Check if the current theme is light mode.
 */
export function isLightMode() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

/**
 * Read the full 4-color palette from CSS custom properties.
 * In light mode, returns all-black for mono aesthetic.
 */
export function getPalette() {
  if (isLightMode()) {
    const black = { r: 0, g: 0, b: 0 };
    return {
      accent: black,
      warm:   black,
      cool:   black,
      comp:   black,
      accentHex: '#000000',
      warmHex: '#000000',
      coolHex: '#000000',
      compHex: '#000000',
    };
  }
  const root = getComputedStyle(document.documentElement);
  const accent = root.getPropertyValue('--accent').trim() || '#ff0000';
  const warm   = root.getPropertyValue('--warm').trim()   || '#ffb000';
  const cool   = root.getPropertyValue('--cool').trim()   || '#00cccc';
  const comp   = root.getPropertyValue('--comp').trim()   || '#ff3333';
  return {
    accent: hexToRgb(accent),
    warm:   hexToRgb(warm),
    cool:   hexToRgb(cool),
    comp:   hexToRgb(comp),
    accentHex: accent,
    warmHex: warm,
    coolHex: cool,
    compHex: comp,
  };
}

/**
 * Get the visualizer background color — black in dark mode, off-white in light mode.
 */
export function getVisBg() {
  return isLightMode() ? { r: 228, g: 228, b: 228 } : { r: 10, g: 10, b: 10 };
}

/**
 * Get a CSS rgba string for the visualizer fade/trail effect.
 */
export function getVisFade(alpha) {
  const bg = getVisBg();
  return `rgba(${bg.r}, ${bg.g}, ${bg.b}, ${alpha})`;
}

/**
 * Lerp between two RGB colors.
 */
export function lerpRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/**
 * Pick a palette color based on a normalized position (0–1).
 * Maps across accent → warm → cool → comp gradient.
 */
export function paletteAt(palette, t) {
  const colors = [palette.accent, palette.warm, palette.cool, palette.comp];
  const pos = t * (colors.length - 1);
  const idx = Math.min(colors.length - 2, Math.floor(pos));
  const frac = pos - idx;
  return lerpRgb(colors[idx], colors[idx + 1], frac);
}

/**
 * Get overall audio energy (0–1) from frequency data.
 */
export function getEnergy(freqData) {
  if (!freqData) return 0;
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) sum += freqData[i];
  return sum / (freqData.length * 255);
}

/**
 * Get energy for a specific frequency band (fractional range 0–1).
 */
export function getBandEnergy(freqData, startFrac, endFrac) {
  if (!freqData) return 0;
  const start = Math.floor(startFrac * freqData.length);
  const end = Math.floor(endFrac * freqData.length);
  let sum = 0;
  for (let i = start; i < end; i++) sum += freqData[i];
  return sum / ((end - start) * 255);
}
