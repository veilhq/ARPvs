/**
 * visualizers/waveform.js — Layered waveform oscilloscope.
 *
 * Multiple phase-shifted waveform traces in palette colors.
 */

import { getPalette, getVisBg } from './utils.js';

export function drawWaveform({ canvas, ctx, options, timeData }) {
  const w = canvas.width;
  const h = canvas.height;
  const bg = getVisBg();
  ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
  ctx.fillRect(0, 0, w, h);

  if (!timeData) return;

  const palette = getPalette();
  const compact = options.compact;

  const layers = compact ? 2 : 4;
  const colors = [palette.accent, palette.warm, palette.cool, palette.comp];
  const offsets = [0, 0.15, 0.3, 0.45];
  const alphas = [0.9, 0.5, 0.35, 0.25];

  for (let layer = 0; layer < layers; layer++) {
    const color = colors[layer];
    const offset = offsets[layer];

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alphas[layer]})`;
    ctx.lineWidth = compact ? 1 : (layer === 0 ? 2 : 1);

    const sliceWidth = w / timeData.length;
    let x = 0;
    const phaseShift = Math.floor(offset * timeData.length);

    for (let i = 0; i < timeData.length; i++) {
      const idx = (i + phaseShift) % timeData.length;
      const v = timeData[idx] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.stroke();
  }
}
