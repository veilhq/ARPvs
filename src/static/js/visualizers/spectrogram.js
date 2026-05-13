/**
 * visualizers/spectrogram.js — Scrolling spectrogram visualizer.
 *
 * Log-scaled frequency axis with intensity-based heat-map coloring
 * using the full palette. Mimics MiniMeters style.
 */

import { getPalette, isLightMode, getVisBg } from './utils.js';

export function drawSpectrogram({ canvas, ctx, freqData }) {
  const w = canvas.width;
  const h = canvas.height;

  if (!freqData) return;

  const palette = getPalette();

  // Shift existing image left by 2px for faster scroll
  const shift = 2;
  const imgData = ctx.getImageData(shift, 0, w - shift, h);
  ctx.putImageData(imgData, 0, 0);

  // Logarithmic frequency scaling
  const bins = h;
  const nyquist = freqData.length;
  const minFreqBin = 1;
  const maxFreqBin = nyquist - 1;

  for (let y = 0; y < bins; y++) {
    const normalizedY = 1.0 - (y / bins);
    const logMin = Math.log(minFreqBin);
    const logMax = Math.log(maxFreqBin);
    const freqBin = Math.exp(logMin + normalizedY * (logMax - logMin));

    // Interpolate between adjacent bins
    const binLow = Math.floor(freqBin);
    const binHigh = Math.min(binLow + 1, maxFreqBin);
    const frac = freqBin - binLow;
    const rawVal = (freqData[binLow] * (1 - frac) + freqData[binHigh] * frac) / 255;

    // Noise floor
    const noiseFloor = 0.08;
    const val = Math.max(0, (rawVal - noiseFloor) / (1.0 - noiseFloor));

    if (val < 0.01) {
      const bg = getVisBg();
      ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
      ctx.fillRect(w - shift, y, shift, 1);
      continue;
    }

    // Intensity-based heat-map coloring
    let r, g, b;
    if (val < 0.33) {
      const t = val / 0.33;
      const c = palette.accent;
      r = Math.round(c.r * t * 0.6);
      g = Math.round(c.g * t * 0.6);
      b = Math.round(c.b * t * 0.6);
    } else if (val < 0.6) {
      const t = (val - 0.33) / 0.27;
      const from = palette.accent;
      const to = palette.warm;
      r = Math.round(from.r + (to.r - from.r) * t);
      g = Math.round(from.g + (to.g - from.g) * t);
      b = Math.round(from.b + (to.b - from.b) * t);
    } else if (val < 0.82) {
      const t = (val - 0.6) / 0.22;
      const from = palette.warm;
      const to = palette.cool;
      r = Math.round(from.r + (to.r - from.r) * t);
      g = Math.round(from.g + (to.g - from.g) * t);
      b = Math.round(from.b + (to.b - from.b) * t);
    } else {
      const t = (val - 0.82) / 0.18;
      const from = palette.cool;
      r = Math.round(from.r + (255 - from.r) * t * 0.8 + palette.comp.r * t * 0.2);
      g = Math.round(from.g + (255 - from.g) * t * 0.8 + palette.comp.g * t * 0.2);
      b = Math.round(from.b + (255 - from.b) * t * 0.8 + palette.comp.b * t * 0.2);
    }

    ctx.fillStyle = `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
    ctx.fillRect(w - shift, y, shift, 1);
  }
}
