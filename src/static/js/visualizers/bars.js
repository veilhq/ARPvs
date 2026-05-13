/**
 * visualizers/bars.js — Dithered Frequency Bars visualizer.
 *
 * Frequency spectrum rendered through a Bayer dither pattern.
 * Low-energy bars are sparse dot patterns, high-energy bars
 * become nearly solid. Velocity-based palette coloring persists.
 */

import { getPalette, paletteAt } from './utils.js';

// 8x8 Bayer threshold matrix (normalized 0–1)
const BAYER = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export function drawBars({ canvas, ctx, options, freqData, activeCanvases }) {
  const w = canvas.width;
  const h = canvas.height;

  if (!freqData) { ctx.clearRect(0, 0, w, h); return; }

  const entry = activeCanvases.find(e => e.canvas === canvas);
  if (!entry) return;

  const palette = getPalette();
  const compact = options.compact;
  const barCount = compact ? 48 : 128;
  const gap = 1;
  const barWidth = Math.max(1, Math.floor((w - gap * (barCount - 1)) / barCount));
  const step = Math.floor(freqData.length / barCount);
  const CELL = compact ? 2 : 3; // dither cell size in pixels

  // Initialize previous values and smoothed velocity for color
  if (!entry._barsPrev) entry._barsPrev = new Float32Array(barCount);
  if (!entry._barsVel) entry._barsVel = new Float32Array(barCount);

  const prev = entry._barsPrev;
  const vel = entry._barsVel;

  // Use ImageData for pixel-level dither rendering
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  for (let i = 0; i < barCount; i++) {
    const val = freqData[i * step] / 255;
    const barH = val * h * 0.92;
    const xStart = Math.floor(i * (barWidth + gap));
    const yTop = Math.floor(h - barH);

    // Compute velocity of change (absolute delta from last frame)
    const delta = Math.abs(val - prev[i]);
    // Smooth the velocity for gentle color transitions
    vel[i] += (delta - vel[i]) * 0.15;
    prev[i] = val;

    // Map velocity to palette: still → accent, moving → warm/cool/comp
    const colorT = Math.min(1, vel[i] * 5.0);
    const color = paletteAt(palette, colorT);

    // Fill bar region with dithered pixels
    for (let py = yTop; py < h; py++) {
      // Intensity gradient: stronger at bottom, fades toward top of bar
      const barProgress = (py - yTop) / (h - yTop); // 0 at top of bar, 1 at bottom
      const intensity = val * (0.4 + barProgress * 0.6);

      for (let px = xStart; px < xStart + barWidth && px < w; px++) {
        // Bayer threshold lookup
        const cellRow = Math.floor(py / CELL) & 7;
        const cellCol = Math.floor(px / CELL) & 7;
        const threshold = BAYER[cellRow][cellCol] / 64;

        if (intensity > threshold) {
          const idx = (py * w + px) * 4;
          const alpha = 0.5 + val * 0.5;
          data[idx]     = Math.round(color.r * alpha);
          data[idx + 1] = Math.round(color.g * alpha);
          data[idx + 2] = Math.round(color.b * alpha);
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
