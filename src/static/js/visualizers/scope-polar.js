/**
 * visualizers/scope-polar.js — Polar Scope visualizer.
 *
 * Time-domain waveform plotted in polar coordinates.
 * Audio amplitude modulates the radius, creating organic
 * circular/flower patterns that bloom with energy.
 */

import { getPalette, getVisFade, getEnergy } from './utils.js';

export function drawScopePolar({ canvas, ctx, options, timeData, freqData }) {
  const w = canvas.width;
  const h = canvas.height;

  // Fade trail — slightly slower for smoother persistence
  ctx.fillStyle = getVisFade(0.08);
  ctx.fillRect(0, 0, w, h);

  if (!timeData) return;

  const palette = getPalette();
  const compact = options.compact;
  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.min(cx, cy) * 0.3;
  const maxRadius = Math.min(cx, cy) * 0.85;

  const energy = freqData ? getEnergy(freqData) : 0;
  const len = timeData.length;

  // Number of full rotations the waveform wraps around
  const wraps = compact ? 1 : 2;
  const traces = compact ? 2 : 3;
  const traceColors = [palette.accent, palette.warm, palette.cool];
  const traceAlphas = [0.9, 0.5, 0.3];
  const step = compact ? 4 : 2;

  for (let t = 0; t < traces; t++) {
    const color = traceColors[t];
    const phaseOffset = t * (Math.PI * 2 / 3); // 120° apart

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${traceAlphas[t]})`;
    ctx.lineWidth = compact ? 1 : (t === 0 ? 1.6 : 1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let first = true;
    for (let i = 0; i < len; i += step) {
      // Angle: map sample index to full rotation(s)
      const angle = (i / len) * Math.PI * 2 * wraps + phaseOffset;

      // Radius: base + amplitude modulation
      const sample = (timeData[i] - 128) / 128;
      const ampRadius = baseRadius + sample * (maxRadius - baseRadius) * (0.5 + energy * 0.5);

      const x = cx + Math.cos(angle) * ampRadius;
      const y = cy + Math.sin(angle) * ampRadius;

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.stroke();
  }

  // Center dot
  const dotSize = 2 + energy * 4;
  ctx.fillStyle = `rgba(${palette.accent.r}, ${palette.accent.g}, ${palette.accent.b}, 0.6)`;
  ctx.fillRect(cx - dotSize / 2, cy - dotSize / 2, dotSize, dotSize);

  // Concentric reference rings
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.06)`;
  ctx.lineWidth = 0.5;
  for (let r = 1; r <= 3; r++) {
    const ringR = baseRadius * r * 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }
}
