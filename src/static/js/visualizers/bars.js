/**
 * visualizers/bars.js — Frequency Bars visualizer.
 *
 * Thin bars colored by velocity of change across the palette.
 */

import { getPalette, paletteAt } from './utils.js';

export function drawBars({ canvas, ctx, options, freqData, activeCanvases }) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!freqData) return;

  const entry = activeCanvases.find(e => e.canvas === canvas);
  if (!entry) return;

  const palette = getPalette();
  const compact = options.compact;
  const barCount = compact ? 48 : 128;
  const gap = 1;
  const barWidth = Math.max(1, (w - gap * (barCount - 1)) / barCount);
  const step = Math.floor(freqData.length / barCount);

  // Initialize previous values and smoothed velocity for color
  if (!entry._barsPrev) entry._barsPrev = new Float32Array(barCount);
  if (!entry._barsVel) entry._barsVel = new Float32Array(barCount);

  const prev = entry._barsPrev;
  const vel = entry._barsVel;

  for (let i = 0; i < barCount; i++) {
    const val = freqData[i * step] / 255;
    const barH = val * h * 0.92;
    const x = i * (barWidth + gap);
    const y = h - barH;

    // Compute velocity of change (absolute delta from last frame)
    const delta = Math.abs(val - prev[i]);
    // Smooth the velocity for gentle color transitions
    vel[i] += (delta - vel[i]) * 0.15;
    prev[i] = val;

    // Map velocity to palette: still → accent, moving → warm/cool/comp
    const colorT = Math.min(1, vel[i] * 5.0);
    const color = paletteAt(palette, colorT);
    const alpha = 0.5 + val * 0.5;
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    ctx.fillRect(x, y, barWidth, barH);
  }
}
