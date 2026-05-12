/**
 * main.js — Entry point.
 *
 * Bootstraps the app: wires cross-module callbacks, fetches initial data,
 * and renders the default view. Import order matters here — player and
 * views need their callbacks set before any rendering happens.
 */

import { state } from './state.js';
import { fetchTracks, fetchTrackTags, fetchLibrarySummary, fetchAlbums } from './api.js';
import { sortTracks, renderTrackList, renderAlbums, renderAlbumExpanded, setPlayTrack, bumpCoverCache, refreshCurrentView } from './views.js';
import { playTrack, setOnTrackChange, toggleShuffle, toggleLoop } from './player.js';
import { initializeTheme, setupColorPicker, setupPaletteMode, setupScrollShadow } from './theme.js';
import { initSplash } from './splash.js';
import { initializeIcons, createIcon } from './icons.js';
import { onTrackSaved } from './edit-track.js';
import { onAlbumSaved } from './edit-album.js';

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
//   player needs to re-render list → inject a view-aware re-render so
//   starting playback inside, say, the album-expanded view doesn't
//   kick the user back to the all-tracks list.
setPlayTrack(playTrack);
setOnTrackChange(() => {
  const cv = state.currentView;
  if (cv && cv.type === 'album-expanded') {
    const { albumId, albumName } = cv.params || {};
    const cover = albumId != null ? `/api/albums/${albumId}/cover` : '';
    renderAlbumExpanded(albumName, cover, state.tracks, { albumId });
    return;
  }
  renderTrackList(state.tracks);
});

// After a track edit, refetch and re-render the *current* view so we
// stay wherever the user was (all tracks, album-expanded, search, etc.).
onTrackSaved(async () => {
  await refreshCurrentView();
});

// After an album edit, refresh in place and bump the cover cache so
// fresh uploads show up.
onAlbumSaved(async ({ coverChanged } = {}) => {
  if (coverChanged) bumpCoverCache();
  await refreshCurrentView();
});

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

// Width toggle
(function initWidthToggle() {
  var btn = document.getElementById('width-toggle');
  var contentEl = document.getElementById('content');
  if (!btn || !contentEl) return;

  var KEY = 'app-condensed';
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}

  function setCondensed(on) {
    contentEl.classList.toggle('condensed', on);
    btn.classList.toggle('active', on);
    btn.innerHTML = createIcon(on ? 'align-center' : 'columns-2', 15);
    btn.setAttribute('data-tooltip', on ? 'Full width' : 'Reading width');
  }

  function toggle() {
    var isCondensed = contentEl.classList.contains('condensed');
    setCondensed(!isCondensed);
    try { localStorage.setItem(KEY, !isCondensed ? '1' : '0'); } catch (e) {}
  }

  if (saved === '1') setCondensed(true);

  btn.addEventListener('click', toggle);

  // Keyboard shortcut: "w" toggles reading width (unless typing in an input)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'w' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      e.preventDefault();
      toggle();
    }
  });
})();

async function init() {
  const [tracks, trackTags, librarySummary] = await Promise.all([
    fetchTracks(),
    fetchTrackTags(),
    fetchLibrarySummary(),
  ]);

  state.trackTags = trackTags;
  state.librarySummary = librarySummary;
  state.tracks    = sortTracks(tracks);
  renderTrackList(state.tracks);
  
  // Setup color picker and palette mode after DOM is ready
  setupColorPicker();
  setupPaletteMode();
}

init();
