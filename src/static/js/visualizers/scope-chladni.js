/**
 * visualizers/scope-chladni.js — Chladni Scope visualizer.
 *
 * Simulates Chladni plate vibration patterns. Particles settle
 * into nodal lines defined by the Chladni equation:
 *   cos(n*pi*x/L)*cos(m*pi*y/L) - cos(m*pi*x/L)*cos(n*pi*y/L) = 0
 *
 * Audio frequency bands drive the mode numbers (n, m), causing
 * the pattern to shift between geometric figures. Bass energy
 * shakes particles off the nodes, highs tighten them.
 */

import { getPalette, paletteAt, getVisFade, getEnergy, getBandEnergy } from './utils.js';

function ensureState(entry) {
  if (entry._chladni) return entry._chladni;

  const compact = entry.options.compact;
  const count = compact ? 600 : 2000;
  const w = entry.canvas.width;
  const h = entry.canvas.height;

  // Square plate centered in canvas
  const plateSize = Math.min(w, h) * 0.92;
  const plateX = (w - plateSize) / 2;
  const plateY = (h - plateSize) / 2;

  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: plateX + Math.random() * plateSize,
      y: plateY + Math.random() * plateSize,
      vx: 0,
      vy: 0,
      settled: 0, // how settled the particle is (0-1)
    });
  }

  entry._chladni = {
    particles,
    n: 2,
    m: 3,
    targetN: 2,
    targetM: 3,
    prevEnergy: 0,
  };

  return entry._chladni;
}

/**
 * Chladni equation value at normalized coordinates (0-1).
 * Returns 0 at nodal lines, ±1 at antinodes.
 */
function chladniValue(x, y, n, m) {
  const px = Math.PI * x;
  const py = Math.PI * y;
  return Math.cos(n * px) * Math.cos(m * py) - Math.cos(m * px) * Math.cos(n * py);
}

/**
 * Gradient of the Chladni function (points toward nodal lines when negated).
 */
function chladniGradient(x, y, n, m) {
  const eps = 0.002;
  const val = chladniValue(x, y, n, m);
  const dx = chladniValue(x + eps, y, n, m) - val;
  const dy = chladniValue(x, y + eps, n, m) - val;
  return { dx: dx / eps, dy: dy / eps, val };
}

export function drawScopeChladni({ canvas, ctx, options, freqData, activeCanvases }) {
  const entry = activeCanvases.find(e => e.canvas === canvas);
  if (!entry) return;

  const w = canvas.width;
  const h = canvas.height;
  const compact = options.compact;

  // Fade — very slow for sand-like persistence
  ctx.fillStyle = getVisFade(0.04);
  ctx.fillRect(0, 0, w, h);

  if (!freqData) return;

  const palette = getPalette();
  const state = ensureState(entry);
  const { particles } = state;

  // Audio analysis
  const energy = getEnergy(freqData);
  const bassEnergy = getBandEnergy(freqData, 0, 0.1);
  const lowMidEnergy = getBandEnergy(freqData, 0.1, 0.3);
  const midEnergy = getBandEnergy(freqData, 0.3, 0.6);
  const highEnergy = getBandEnergy(freqData, 0.6, 1.0);

  // Detect transients
  const energyDelta = Math.max(0, energy - state.prevEnergy);
  const isTransient = energyDelta > 0.04;
  state.prevEnergy = energy;

  // Map frequency content to Chladni mode numbers (n, m)
  // Different frequency bands suggest different mode pairs
  // Higher energy in higher bands → higher mode numbers
  const baseN = 1 + Math.round(lowMidEnergy * 4 + midEnergy * 3);
  const baseM = 1 + Math.round(midEnergy * 3 + highEnergy * 4);

  // Ensure n != m for interesting patterns (n == m gives boring diagonals)
  state.targetN = Math.max(1, Math.min(7, baseN));
  state.targetM = Math.max(1, Math.min(7, baseM));
  if (state.targetN === state.targetM) {
    state.targetM = state.targetN + 1;
  }

  // Smoothly interpolate mode numbers for fluid transitions
  state.n += (state.targetN - state.n) * 0.02;
  state.m += (state.targetM - state.m) * 0.02;

  // Physics parameters
  const attractStrength = compact ? 0.015 : 0.012;
  const damping = 0.92;
  const noiseAmount = bassEnergy * 8 + (isTransient ? 12 : 0);

  // Square plate region centered in the canvas (top-down view)
  const plateSize = Math.min(w, h) * 0.92;
  const plateX = (w - plateSize) / 2;
  const plateY = (h - plateSize) / 2;

  // Update and draw particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Normalized position within the square plate (0-1)
    const nx = (p.x - plateX) / plateSize;
    const ny = (p.y - plateY) / plateSize;

    // Get gradient pointing toward nearest nodal line
    const grad = chladniGradient(nx, ny, state.n, state.m);

    // Force toward nodal lines (where val = 0)
    // The force is proportional to the value — particles at nodes feel no force
    const forceMag = grad.val * attractStrength;
    const gradLen = Math.sqrt(grad.dx * grad.dx + grad.dy * grad.dy) || 1;

    // Move toward decreasing |value| (toward nodal lines)
    // Use plateSize for both axes so forces are uniform (no stretching)
    p.vx -= (grad.dx / gradLen) * forceMag * plateSize;
    p.vy -= (grad.dy / gradLen) * forceMag * plateSize;

    // Bass transients and energy shake particles off nodes
    p.vx += (Math.random() - 0.5) * noiseAmount;
    p.vy += (Math.random() - 0.5) * noiseAmount;

    // High frequency tightens settling
    const tighten = 1 + highEnergy * 2;
    p.vx -= (grad.dx / gradLen) * Math.abs(grad.val) * 0.005 * tighten * plateSize;
    p.vy -= (grad.dy / gradLen) * Math.abs(grad.val) * 0.005 * tighten * plateSize;

    // Damping
    p.vx *= damping;
    p.vy *= damping;

    // Move
    p.x += p.vx;
    p.y += p.vy;

    // Bounce off plate edges (square boundary)
    if (p.x < plateX) { p.x = plateX; p.vx *= -0.5; }
    if (p.x > plateX + plateSize) { p.x = plateX + plateSize; p.vx *= -0.5; }
    if (p.y < plateY) { p.y = plateY; p.vy *= -0.5; }
    if (p.y > plateY + plateSize) { p.y = plateY + plateSize; p.vy *= -0.5; }

    // Track how settled the particle is
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.settled += ((speed < 0.5 ? 1 : 0) - p.settled) * 0.05;

    // Color: settled particles use accent, moving ones shift through palette
    const speedNorm = Math.min(1, speed / 5);
    const color = paletteAt(palette, speedNorm);
    const alpha = 0.3 + p.settled * 0.5;
    const size = compact ? 1 : (1 + (1 - p.settled) * 0.8);

    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }

  // Draw faint square plate boundary
  ctx.strokeStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.06)`;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(plateX, plateY, plateSize, plateSize);

  // Mode indicator (fullscreen only)
  if (!compact) {
    ctx.fillStyle = `rgba(${palette.comp.r}, ${palette.comp.g}, ${palette.comp.b}, 0.15)`;
    ctx.font = '9px monospace';
    ctx.fillText(`n=${Math.round(state.n)} m=${Math.round(state.m)}`, 8, h - 8);
  }
}
