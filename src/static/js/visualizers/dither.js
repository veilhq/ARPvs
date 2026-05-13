/**
 * visualizers/dither.js — Dither Pulse visualizer.
 *
 * Bayer-dithered pattern reactive to audio energy with smooth
 * palette color blending based on position and time.
 */

import { getPalette, paletteAt, getEnergy, getVisBg } from './utils.js';

export function drawDither({ canvas, ctx, options, freqData }) {
  const w = canvas.width;
  const h = canvas.height;

  if (!freqData) { ctx.clearRect(0, 0, w, h); return; }

  const energy = getEnergy(freqData);
  const palette = getPalette();
  const CELL = options.compact ? 3 : 4;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);

  const bayerMatrix = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];

  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const time = performance.now() * 0.001;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * CELL;
      const py = row * CELL;

      const freqIdx = Math.floor((col / cols) * freqData.length * 0.5);
      const freqVal = (freqData[freqIdx] || 0) / 255;

      const centerX = w * 0.5 + Math.sin(time * 0.5) * w * 0.3;
      const centerY = h * 0.5 + Math.cos(time * 0.4) * h * 0.3;
      const dx = (px - centerX) / w;
      const dy = (py - centerY) / h;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const wave = 0.5 + 0.5 * Math.sin(dist * 6 - time + freqVal * 4);
      const val = wave * (0.3 + energy * 0.7);

      const threshold = bayerMatrix[row & 7][col & 7] / 64;
      const lit = val > threshold;

      let r, g, b;
      if (lit) {
        const colorT = (
          Math.sin(dist * 2.0 + time * 0.15) * 0.5 + 0.5
        ) * 0.6 + (
          Math.sin((px / w) * Math.PI + time * 0.1) * 0.5 + 0.5
        ) * 0.2 + (
          Math.sin((py / h) * Math.PI * 0.8 - time * 0.08) * 0.5 + 0.5
        ) * 0.2;

        const color = paletteAt(palette, colorT);
        const brightness = 0.3 + freqVal * 0.7;
        r = Math.round(color.r * brightness);
        g = Math.round(color.g * brightness);
        b = Math.round(color.b * brightness);
      } else {
        const bg = getVisBg();
        r = bg.r; g = bg.g; b = bg.b;
      }

      for (let sy = 0; sy < CELL && py + sy < h; sy++) {
        for (let sx = 0; sx < CELL && px + sx < w; sx++) {
          const idx = ((py + sy) * w + (px + sx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
