/**
 * visualizer.js — Audio visualizer engine (orchestrator).
 *
 * Connects to the <audio> element via Web Audio API AnalyserNode.
 * Delegates rendering to individual visualizer modules in /visualizers/.
 * Manages canvas registration, the animation loop, and fullscreen mode.
 */

import { state } from '../state.js';
import { drawBars, drawWaveform, drawParticles, drawDither, drawScope, drawScopePolar, drawScopeChladni, drawScopeVector, drawSpectrogram } from '../visualizers/index.js';

// --- Web Audio setup ---

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let connected = false;

// Frequency & time-domain buffers
let freqData = null;
let timeData = null;

// Animation
let animFrame = null;
let activeCanvases = []; // { canvas, ctx, mode, options }

/**
 * Initialize the Web Audio analyser and connect it to the audio element.
 * Safe to call multiple times — only connects once.
 */
export function initAudioContext() {
  if (connected) return;

  const audio = document.getElementById('audio-element');
  if (!audio) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = state.ambientMode ? 0.95 : 0.8;

  sourceNode = audioCtx.createMediaElementSource(audio);
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);

  freqData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.fftSize);

  connected = true;
}

/**
 * Ensure audio context is resumed (required after user gesture).
 */
export function resumeAudioContext() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/**
 * Toggle ambient mode — adjusts analyser smoothing for slower, more
 * meditative visualizer response. All modes benefit from this.
 */
export function setAmbientMode(enabled) {
  state.ambientMode = enabled;
  if (analyser) {
    analyser.smoothingTimeConstant = enabled ? 0.95 : 0.8;
  }
}

// --- Visualizer modes ---

const MODES = {
  bars: drawBars,
  waveform: drawWaveform,
  particles: drawParticles,
  dither: drawDither,
  scope: drawScope,
  'scope-polar': drawScopePolar,
  'scope-chladni': drawScopeChladni,
  'scope-vector': drawScopeVector,
  spectrogram: drawSpectrogram,
};

export const VISUALIZER_MODES = Object.keys(MODES);

export const MODE_INFO = {
  bars: { name: 'Frequency Bars', description: 'Classic frequency spectrum with velocity-colored bars' },
  waveform: { name: 'Waveform', description: 'Real-time audio waveform oscilloscope' },
  particles: { name: 'Particle Field', description: 'Reactive particle swarm driven by audio energy' },
  dither: { name: 'Dither Pulse', description: 'Bayer-dithered pattern reactive to audio energy' },
  scope: { name: 'Lissajous Scope', description: 'XY oscilloscope with phase-shifted channels' },
  'scope-polar': { name: 'Polar Scope', description: 'Radial waveform in polar coordinates — blooming flower patterns' },
  'scope-chladni': { name: 'Chladni Scope', description: 'Vibrating plate simulation — particles settle into nodal patterns' },
  'scope-vector': { name: 'Vector Scope', description: 'Stereo vectorscope showing channel correlation and width' },
  spectrogram: { name: 'Spectrogram', description: 'Scrolling frequency waterfall display' },
};

// --- Registration ---

/**
 * Register a canvas to be rendered with a specific visualizer mode.
 */
export function registerCanvas(canvas, mode, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const entry = { canvas, ctx, mode, options, spectroOffset: 0 };
  activeCanvases.push(entry);
  startLoop();
}

/**
 * Unregister a canvas.
 */
export function unregisterCanvas(canvas) {
  activeCanvases = activeCanvases.filter(e => e.canvas !== canvas);
  if (activeCanvases.length === 0) stopLoop();
}

/**
 * Unregister all canvases.
 */
export function unregisterAll() {
  activeCanvases = [];
  stopLoop();
}

// --- Animation loop ---

function startLoop() {
  if (animFrame) return;
  loop();
}

function stopLoop() {
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
}

function loop() {
  if (activeCanvases.length === 0) { animFrame = null; return; }

  // Pull audio data
  if (analyser) {
    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeData);
  }

  // Render each registered canvas, passing shared data
  for (const entry of activeCanvases) {
    const fn = MODES[entry.mode];
    if (fn) {
      fn({
        canvas: entry.canvas,
        ctx: entry.ctx,
        options: entry.options,
        freqData,
        timeData,
        activeCanvases,
      });
    }
  }

  animFrame = requestAnimationFrame(loop);
}

// --- Fullscreen mode ---

let fullscreenEl = null;
let fullscreenCanvas = null;

export function enterFullscreen(mode = 'bars') {
  if (fullscreenEl) exitFullscreen();

  fullscreenEl = document.createElement('div');
  fullscreenEl.className = 'visualizer-fullscreen';
  fullscreenEl.innerHTML = `
    <canvas class="visualizer-fullscreen-canvas"></canvas>
    <div class="visualizer-fullscreen-controls">
      <div class="visualizer-fullscreen-info">
        <span class="visualizer-mode-label">${MODE_INFO[mode]?.name || mode}</span>
        <span class="visualizer-track-name">${state.currentTrack?.display_name || state.currentTrack?.filename || '--'}</span>
      </div>
      <div class="visualizer-fullscreen-actions">
        <button class="visualizer-btn visualizer-btn-mode" data-tooltip="Cycle mode">MODE</button>
        <button class="visualizer-btn visualizer-btn-close" data-tooltip="Exit fullscreen (Esc)">EXIT</button>
      </div>
    </div>
  `;

  document.body.appendChild(fullscreenEl);

  fullscreenCanvas = fullscreenEl.querySelector('.visualizer-fullscreen-canvas');
  resizeFullscreenCanvas();
  registerCanvas(fullscreenCanvas, mode, { compact: false });

  // Controls
  const btnMode = fullscreenEl.querySelector('.visualizer-btn-mode');
  const btnClose = fullscreenEl.querySelector('.visualizer-btn-close');

  btnMode.addEventListener('click', () => {
    const currentIdx = VISUALIZER_MODES.indexOf(mode);
    mode = VISUALIZER_MODES[(currentIdx + 1) % VISUALIZER_MODES.length];
    const entry = activeCanvases.find(e => e.canvas === fullscreenCanvas);
    if (entry) {
      entry.mode = mode;
      entry.spectroOffset = 0;
      entry.ctx.clearRect(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
    }
    fullscreenEl.querySelector('.visualizer-mode-label').textContent = MODE_INFO[mode]?.name || mode;
  });

  btnClose.addEventListener('click', exitFullscreen);

  // Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') { exitFullscreen(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  // Resize
  window.addEventListener('resize', resizeFullscreenCanvas);

  state.visualizerFullscreen = true;
}

export function exitFullscreen() {
  if (!fullscreenEl) return;
  if (fullscreenCanvas) unregisterCanvas(fullscreenCanvas);
  fullscreenEl.remove();
  fullscreenEl = null;
  fullscreenCanvas = null;
  window.removeEventListener('resize', resizeFullscreenCanvas);
  state.visualizerFullscreen = false;
}

function resizeFullscreenCanvas() {
  if (!fullscreenCanvas) return;
  fullscreenCanvas.width = window.innerWidth;
  fullscreenCanvas.height = window.innerHeight;
}
