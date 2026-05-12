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
import { initializeTheme, setupColorPicker } from './theme.js';
import { initSplash } from './splash.js';
import { initializeIcons } from './icons.js';

// Initialize theme from storage
initializeTheme();

// Initialize icons
initializeIcons();

// Initialize splash screen (shows for 3 seconds)
// Delay slightly to ensure DOM is ready
setTimeout(() => initSplash(3000), 100);

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
  if (state.shuffle) {
    btnShuffle.classList.add('active');
  } else {
    btnShuffle.classList.remove('active');
  }
}

function updateLoopButton() {
  if (state.loopMode === 'off') {
    btnLoop.classList.remove('active');
  } else if (state.loopMode === 'one') {
    btnLoop.classList.add('active');
    // Update to repeat-1 icon
    btnLoop.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v7a5 5 0 0 0 5 5h12"></path><polyline points="16 10 22 4 16 -2"></polyline><text x="5" y="15" font-size="12" font-weight="bold">1</text></svg>`;
  } else if (state.loopMode === 'all') {
    btnLoop.classList.add('active');
    // Back to repeat icon
    btnLoop.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 2 21 6 17 10"></polyline><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><polyline points="7 22 3 18 7 14"></polyline><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>`;
  }
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
  
  // Setup color picker after DOM is ready
  setupColorPicker();
}

init();
