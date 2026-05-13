/**
 * visualizers/scope.js — Lissajous Scope visualizer.
 *
 * XY oscilloscope with multiple phase-shifted traces
 * in palette colors and fade trails.
 */

import { getPalette } from './utils.js';

export function drawScope({ canvas, ctx, options, timeData }) {
  const w = canvas.width;
  const h = canvas.height;

  // Fade effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillRect(0, 0, w, h);

  if (!timeData) return;

  const palette = getPalette();
  const compact = options.compact;
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(cx, cy) * 0.8;

  const len = timeData.length;
  const half = Math.floor(len / 2);

  const traces = compact ? 2 : 3;
  const traceColors = [palette.accent, palette.warm, palette.cool];
  const traceAlphas = [0.85, 0.5, 0.3];
  const traceOffsets = [0, Math.floor(half * 0.1), Math.floor(half * 0.2)];

  for (let t = 0; t < traces; t++) {
    const color = traceColors[t];
    const offset = traceOffsets[t];

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${traceAlphas[t]})`;
    ctx.lineWidth = compact ? 1 : (t === 0 ? 1.5 : 1);

    for (let i = 0; i < half; i++) {
      const xi = (i + offset) % len;
      const yi = (i + half + offset) % len;
      const x = cx + ((timeData[xi] - 128) / 128) * scale;
      const y = cy + ((timeData[yi] - 128) / 128) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  // Crosshair in comp color
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.08)`;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, cy); ctx.lineTo(w, cy);
  ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
  ctx.stroke();
}
