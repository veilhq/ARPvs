/**
 * visualizers/scope-vector.js — Vector Scope visualizer.
 *
 * Stereo-style vectorscope showing channel correlation.
 * Simulates L/R by splitting time-domain data into even/odd
 * samples, plotting as a rotating beam with afterglow trails.
 * Mono signals form a tight line; stereo content fans out.
 */

import { getPalette, paletteAt, getVisFade, getEnergy, getBandEnergy } from './utils.js';

export function drawScopeVector({ canvas, ctx, options, timeData, freqData }) {
  const w = canvas.width;
  const h = canvas.height;

  // Slower fade for phosphor-like persistence
  ctx.fillStyle = getVisFade(0.05);
  ctx.fillRect(0, 0, w, h);

  if (!timeData) return;

  const palette = getPalette();
  const compact = options.compact;
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(cx, cy) * 0.75;

  const energy = freqData ? getEnergy(freqData) : 0;
  const bassEnergy = freqData ? getBandEnergy(freqData, 0, 0.15) : 0;
  const len = timeData.length;
  const step = compact ? 4 : 2;

  // Simulate L/R channels from interleaved time data
  // Even samples → "Left", Odd samples → "Right"
  // Then rotate 45° so mono = vertical line (standard vectorscope orientation)
  const rotation = Math.PI / 4;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  // Draw sample points as dots with intensity-based size
  const dotSize = compact ? 1 : 1.5;

  for (let i = 0; i < len - 1; i += step) {
    // Simulated L and R
    const l = (timeData[i] - 128) / 128;
    const r = (timeData[i + 1] - 128) / 128;

    // Mid/Side representation (rotated 45°)
    const mid = (l + r) * 0.5;
    const side = (l - r) * 0.5;

    // Apply rotation for standard vectorscope display
    const x = cx + (mid * cosR - side * sinR) * scale;
    const y = cy - (mid * sinR + side * cosR) * scale;

    // Color based on position in the field
    const dist = Math.sqrt(mid * mid + side * side);
    const colorT = Math.min(1, dist * 2);
    const color = paletteAt(palette, colorT);

    const alpha = 0.4 + dist * 0.6;
    const size = dotSize + dist * 2;

    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  // Draw graticule lines (L, R, +, - axes)
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.08)`;
  ctx.lineWidth = 0.5;

  // Vertical (mono) axis
  ctx.beginPath();
  ctx.moveTo(cx, cy - scale);
  ctx.lineTo(cx, cy + scale);
  ctx.stroke();

  // Horizontal (stereo width) axis
  ctx.beginPath();
  ctx.moveTo(cx - scale, cy);
  ctx.lineTo(cx + scale, cy);
  ctx.stroke();

  // Diagonal axes (L and R)
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.05)`;
  ctx.beginPath();
  ctx.moveTo(cx - scale * cosR, cy - scale * sinR);
  ctx.lineTo(cx + scale * cosR, cy + scale * sinR);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + scale * sinR, cy - scale * cosR);
  ctx.lineTo(cx - scale * sinR, cy + scale * cosR);
  ctx.stroke();

  // Outer boundary circle
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.04)`;
  ctx.beginPath();
  ctx.arc(cx, cy, scale, 0, Math.PI * 2);
  ctx.stroke();

  // Energy indicator — pulsing center ring
  if (energy > 0.02) {
    const ringR = 3 + bassEnergy * 15;
    ctx.strokeStyle = `rgba(${palette.accent.r}, ${palette.accent.g}, ${palette.accent.b}, ${0.2 + energy * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
  }
}
