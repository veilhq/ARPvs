/**
 * visualizers/scope.js — Lissajous Scope visualizer.
 *
 * XY oscilloscope with multiple phase-shifted traces
 * in palette colors and fade trails.
 */

import { getPalette, getVisFade } from './utils.js';

export function drawScope({ canvas, ctx, options, timeData }) {
  const w = canvas.width;
  const h = canvas.height;

  // Fade effect
  ctx.fillStyle = getVisFade(0.12);
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

  // Downsample factor — take every Nth point for a smoother curve
  const step = compact ? 3 : 2;

  for (let t = 0; t < traces; t++) {
    const color = traceColors[t];
    const offset = traceOffsets[t];

    ctx.beginPath();
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${traceAlphas[t]})`;
    ctx.lineWidth = compact ? 1.2 : (t === 0 ? 1.8 : 1.2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Build array of points (downsampled)
    const points = [];
    for (let i = 0; i < half; i += step) {
      const xi = (i + offset) % len;
      const yi = (i + half + offset) % len;
      const x = cx + ((timeData[xi] - 128) / 128) * scale;
      const y = cy + ((timeData[yi] - 128) / 128) * scale;
      points.push(x, y);
    }

    // Draw smooth curve using quadratic bezier through midpoints
    if (points.length >= 4) {
      ctx.moveTo(points[0], points[1]);

      // Line to midpoint of first segment
      const mx0 = (points[0] + points[2]) / 2;
      const my0 = (points[1] + points[3]) / 2;
      ctx.lineTo(mx0, my0);

      // Quadratic curves using each point as control, midpoints as anchors
      for (let i = 2; i < points.length - 2; i += 2) {
        const cpx = points[i];
        const cpy = points[i + 1];
        const nx = (points[i] + points[i + 2]) / 2;
        const ny = (points[i + 1] + points[i + 3]) / 2;
        ctx.quadraticCurveTo(cpx, cpy, nx, ny);
      }

      // Final segment to last point
      const last = points.length;
      ctx.quadraticCurveTo(
        points[last - 4], points[last - 3],
        points[last - 2], points[last - 1]
      );
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
