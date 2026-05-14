/**
 * views/visualizers.js — Visualizer preview page.
 *
 * Shows all available visualizer modes in a grid of live previews.
 * Allows selecting a mode for the compact player visualizer and
 * launching any mode in fullscreen.
 */

import { state } from '../state.js';
import { createIcon } from '../core/icons.js';
import {
  VISUALIZER_MODES,
  MODE_INFO,
  initAudioContext,
  resumeAudioContext,
  registerCanvas,
  unregisterCanvas,
  enterFullscreen,
  setAmbientMode,
} from '../ui/visualizer.js';

const content = document.getElementById('content');

let previewCanvases = [];

/**
 * Render the visualizers preview page.
 */
export function renderVisualizers() {
  state.currentView = { type: 'visualizers', params: {} };

  // Clean up any previously registered preview canvases
  cleanupPreviews();

  const activeMode = state.visualizerMode || 'bars';

  const header = `
    <div class="library-hero">
      <div class="library-hero-meta">
        <span class="hero-meta-item">${String(VISUALIZER_MODES.length).padStart(3, '0')} modes</span>
        <span class="hero-meta-item">Web Audio API</span>
        <span class="hero-meta-item">60 FPS</span>
        <span class="hero-meta-item">reactive</span>
      </div>
      <div class="library-hero-title">Visualizers</div>
    </div>`;

  const specSheet = `
    <div class="library-spec-sheet">
      <div class="spec-row"><span class="spec-label">Engine</span><span class="spec-value">AnalyserNode</span></div>
      <div class="spec-row"><span class="spec-label">FFT Size</span><span class="spec-value">2048</span></div>
      <div class="spec-row"><span class="spec-label">Modes</span><span class="spec-value">${VISUALIZER_MODES.length}</span></div>
      <div class="spec-divider"></div>
      <div class="spec-row"><span class="spec-label">Active</span><span class="spec-value">${MODE_INFO[activeMode]?.name || activeMode}</span></div>
      <div class="spec-divider"></div>
      <div class="spec-row">
        <span class="spec-label">Ambient</span>
        <span class="spec-value">
          <button class="visualizer-ambient-toggle${state.ambientMode ? ' visualizer-ambient-toggle-active' : ''}" id="ambient-toggle" data-tooltip="Ambient mode — slower, more meditative response">
            ${state.ambientMode ? 'ON' : 'OFF'}
          </button>
        </span>
      </div>
      <div class="spec-row">
        <span class="spec-label">Palette</span>
        <span class="spec-value visualizer-palette-preview">
          <span class="visualizer-palette-dot" style="background: var(--accent)" data-tooltip="Accent"></span>
          <span class="visualizer-palette-dot" style="background: var(--warm)" data-tooltip="Warm"></span>
          <span class="visualizer-palette-dot" style="background: var(--cool)" data-tooltip="Cool"></span>
          <span class="visualizer-palette-dot" style="background: var(--comp)" data-tooltip="Comp"></span>
        </span>
      </div>
    </div>`;

  const cards = VISUALIZER_MODES.map(mode => {
    const info = MODE_INFO[mode];
    const isActive = mode === activeMode;
    return `
      <div class="visualizer-card${isActive ? ' visualizer-card-active' : ''}" data-mode="${mode}">
        <div class="visualizer-card-preview">
          <canvas class="visualizer-preview-canvas" data-mode="${mode}"></canvas>
        </div>
        <div class="visualizer-card-info">
          <div class="visualizer-card-header">
            <span class="visualizer-card-name">${info.name}</span>
            ${isActive ? '<span class="visualizer-card-badge">ACTIVE</span>' : ''}
          </div>
          <span class="visualizer-card-desc">${info.description}</span>
          <div class="visualizer-card-actions">
            <button class="visualizer-card-btn visualizer-card-btn-select" data-mode="${mode}" data-tooltip="Set as player visualizer">
              ${isActive ? 'SELECTED' : 'SELECT'}
            </button>
            <button class="visualizer-card-btn visualizer-card-btn-fullscreen" data-mode="${mode}" data-tooltip="Launch fullscreen">
              FULLSCREEN
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  const noAudioHint = !state.isPlaying ? `
    <div class="visualizer-hint">
      <span class="visualizer-hint-icon">${createIcon('play-circle', 14)}</span>
      <span>Play a track to see visualizers in action</span>
    </div>` : '';

  content.innerHTML = `
    ${header}
    <div class="library-body">
      ${specSheet}
      <div class="library-visualizers">
        ${noAudioHint}
        <div class="visualizer-grid">
          ${cards}
        </div>
      </div>
    </div>`;

  // Initialize audio context on interaction
  initAudioContext();
  resumeAudioContext();

  // Register preview canvases
  const canvasEls = content.querySelectorAll('.visualizer-preview-canvas');
  canvasEls.forEach(canvas => {
    const mode = canvas.dataset.mode;
    // Size canvas to container
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(100, Math.round(rect.width));
    canvas.height = Math.max(80, Math.round(rect.height));
    registerCanvas(canvas, mode, { compact: false });
    previewCanvases.push(canvas);
  });

  // Bind select buttons
  content.querySelectorAll('.visualizer-card-btn-select').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode;
      state.visualizerMode = mode;
      // Re-render to update active states
      renderVisualizers();
    });
  });

  // Bind fullscreen buttons
  content.querySelectorAll('.visualizer-card-btn-fullscreen').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode;
      initAudioContext();
      resumeAudioContext();
      enterFullscreen(mode);
    });
  });

  // Card click = select
  content.querySelectorAll('.visualizer-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      state.visualizerMode = mode;
      renderVisualizers();
    });
  });

  // Ambient mode toggle
  const ambientBtn = document.getElementById('ambient-toggle');
  if (ambientBtn) {
    ambientBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setAmbientMode(!state.ambientMode);
      renderVisualizers();
    });
  }
}

/**
 * Clean up preview canvases when leaving the view.
 */
export function cleanupPreviews() {
  previewCanvases.forEach(c => unregisterCanvas(c));
  previewCanvases = [];
}
