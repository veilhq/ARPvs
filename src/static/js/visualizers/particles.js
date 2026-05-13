/**
 * visualizers/particles.js — Particle Field visualizer.
 *
 * Reactive particle swarm that orbits and breathes with sound.
 * Bass transients punch particles outward, sustained energy pulls them
 * into a tight orbit, silence lets them drift apart. Color based on velocity.
 */

import { getPalette, paletteAt, getEnergy, getBandEnergy } from './utils.js';

function ensureParticles(entry) {
  if (entry._particles) return entry._particles;
  const compact = entry.options.compact;
  const count = compact ? 80 : 300;
  const w = entry.canvas.width;
  const h = entry.canvas.height;
  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: 1 + Math.random() * 2,
      band: Math.floor(Math.random() * 4),
      life: Math.random(),
      angle: Math.random() * Math.PI * 2, // orbital angle offset
    });
  }
  entry._particles = particles;
  entry._prevBassEnergy = 0;
  return particles;
}

export function drawParticles({ canvas, ctx, options, freqData, activeCanvases }) {
  const entry = activeCanvases.find(e => e.canvas === canvas);
  if (!entry) return;

  const w = canvas.width;
  const h = canvas.height;
  const compact = options.compact;

  // Fade trail
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fillRect(0, 0, w, h);

  if (!freqData) return;

  const palette = getPalette();
  const particles = ensureParticles(entry);

  const bandEnergies = [
    getBandEnergy(freqData, 0, 0.08),    // sub
    getBandEnergy(freqData, 0.08, 0.25), // low-mid
    getBandEnergy(freqData, 0.25, 0.55), // mid-high
    getBandEnergy(freqData, 0.55, 1.0),  // high
  ];

  const totalEnergy = getEnergy(freqData);
  const bassEnergy = bandEnergies[0] + bandEnergies[1] * 0.5;
  const cx = w / 2;
  const cy = h / 2;

  // Detect bass transients (sudden increase in bass)
  const prevBass = entry._prevBassEnergy || 0;
  const bassDelta = Math.max(0, bassEnergy - prevBass);
  const isTransient = bassDelta > 0.05;
  entry._prevBassEnergy = bassEnergy;

  // Target orbit radius — expands with energy, contracts in silence
  const minRadius = Math.min(w, h) * 0.05;
  const maxRadius = Math.min(w, h) * 0.35;
  const targetRadius = minRadius + (maxRadius - minRadius) * Math.min(1, totalEnergy * 2);

  // Determine max velocity for normalization
  let maxSpeed = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > maxSpeed) maxSpeed = speed;
  }
  if (maxSpeed < 0.5) maxSpeed = 0.5;

  const time = performance.now() * 0.001;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (totalEnergy > 0.02) {
      // --- ACTIVE: orbital + breathing behavior ---

      // Radial force: pull toward target orbit radius (spring-like)
      const radiusError = dist - targetRadius;
      const radialForce = -radiusError * 0.02;
      p.vx += (dx / dist) * radialForce;
      p.vy += (dy / dist) * radialForce;

      // Tangential force: swirl around center (creates orbit)
      const tangentX = -dy / dist;
      const tangentY = dx / dist;
      const orbitSpeed = 0.3 + totalEnergy * 1.5;
      p.vx += tangentX * orbitSpeed * 0.15;
      p.vy += tangentY * orbitSpeed * 0.15;

      // Bass transient: punch outward
      if (isTransient) {
        const punchForce = bassDelta * 15;
        p.vx += (dx / dist) * punchForce;
        p.vy += (dy / dist) * punchForce;
      }

      // Mid-frequency energy adds wobble to orbit
      const midWobble = bandEnergies[2] * 2.0;
      p.vx += (Math.random() - 0.5) * midWobble;
      p.vy += (Math.random() - 0.5) * midWobble;

      // Highs add sparkle jitter
      p.vx += (Math.random() - 0.5) * bandEnergies[3] * 2.0;
      p.vy += (Math.random() - 0.5) * bandEnergies[3] * 2.0;

      // Damping — moderate so orbits persist
      p.vx *= 0.94;
      p.vy *= 0.94;

    } else {
      // --- SILENCE: aimless wandering ---
      p.vx += (Math.random() - 0.5) * 0.8;
      p.vy += (Math.random() - 0.5) * 0.8;

      // Very gentle pull so they don't fly off forever
      p.vx -= (dx / dist) * 0.02;
      p.vy -= (dy / dist) * 0.02;

      // Loose damping
      p.vx *= 0.97;
      p.vy *= 0.97;
    }

    // Move
    p.x += p.vx;
    p.y += p.vy;

    // Wrap around edges
    if (p.x < 0) p.x += w;
    if (p.x > w) p.x -= w;
    if (p.y < 0) p.y += h;
    if (p.y > h) p.y -= h;

    // Velocity-based color
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const speedNorm = Math.min(1, speed / maxSpeed);
    if (p.colorT === undefined) p.colorT = 0;
    p.colorT += (speedNorm - p.colorT) * 0.08;
    const color = paletteAt(palette, p.colorT);

    const alpha = 0.35 + p.colorT * 0.6;
    const size = p.size * (0.8 + p.colorT * 1.5);

    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }

  // Connecting lines (fullscreen only)
  if (!compact && totalEnergy > 0.08) {
    ctx.lineWidth = 0.5;
    const maxDist = 35 + totalEnergy * 70;
    const maxDistSq = maxDist * maxDist;
    const checkCount = Math.min(particles.length, 100);
    for (let i = 0; i < checkCount; i++) {
      for (let j = i + 1; j < checkCount; j++) {
        const a = particles[i];
        const b = particles[j];
        const ddx = a.x - b.x;
        const ddy = a.y - b.y;
        const distSq = ddx * ddx + ddy * ddy;
        if (distSq < maxDistSq) {
          const t = 1 - distSq / maxDistSq;
          const avgT = (a.colorT + b.colorT) / 2;
          const lineColor = paletteAt(palette, avgT);
          ctx.strokeStyle = `rgba(${lineColor.r}, ${lineColor.g}, ${lineColor.b}, ${t * 0.25})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }
}
