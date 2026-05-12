/**
 * main.js — Entry point.
 *
 * Bootstraps the app: wires cross-module callbacks, fetches initial data,
 * and renders the default view. Import order matters here — player and
 * views need their callbacks set before any rendering happens.
 */

import { state } from './state.js';
import { fetchTracks, fetchTrackTags } from './api.js';
import { sortTracks, renderTrackList, setPlayTrack } from './views.js';
import { playTrack, setOnTrackChange, toggleShuffle, toggleLoop } from './player.js';
import { initializeTheme, setupColorPicker, setupPaletteMode, setupScrollShadow } from './theme.js';
import { initSplash } from './splash.js';
import { initializeIcons, createIcon } from './icons.js';

// --- App constants ---
const SPLASH_DURATION_MS = 3000;
const SPLASH_INIT_DELAY_MS = 100;

// Initialize theme from storage
initializeTheme();
setupScrollShadow();

// Initialize icons
initializeIcons();

// Initialize splash screen
setTimeout(() => initSplash(SPLASH_DURATION_MS), SPLASH_INIT_DELAY_MS);

// Wire the circular dependency break-points:
//   views needs to call playTrack  → inject it
//   player needs to re-render list → inject renderTrackList
setPlayTrack(playTrack);
setOnTrackChange(() => renderTrackList(state.tracks));

// nav.js registers its own event listeners on import — just pull it in.
import './nav.js';

// Setup playback mode buttons
const btnShuffle = document.getElementById('btn-shuffle');
const btnLoop = document.getElementById('btn-loop');

function updateShuffleButton() {
  btnShuffle.classList.toggle('active', state.shuffle);
}

function updateLoopButton() {
  btnLoop.classList.toggle('active', state.loopMode !== 'off');
  const iconName = state.loopMode === 'one' ? 'loop-one' : 'loop';
  btnLoop.innerHTML = createIcon(iconName, 18);
}

btnShuffle.addEventListener('click', () => {
  toggleShuffle();
  updateShuffleButton();
});

btnLoop.addEventListener('click', () => {
  toggleLoop();
  updateLoopButton();
});

// Reload button
const reloadBtn = document.getElementById('reload-btn');
reloadBtn.addEventListener('click', () => {
  location.reload();
});

async function init() {
  const [tracks, trackTags] = await Promise.all([
    fetchTracks(),
    fetchTrackTags(),
  ]);

  state.trackTags = trackTags;
  state.tracks    = sortTracks(tracks);
  renderTrackList(state.tracks);
  
  // Setup color picker and palette mode after DOM is ready
  setupColorPicker();
  setupPaletteMode();
}

init();
