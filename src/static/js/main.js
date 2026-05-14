/**
 * main.js — Entry point.
 *
 * Bootstraps the app: wires cross-module callbacks, fetches initial data,
 * and renders the default view. Import order matters here — player and
 * views need their callbacks set before any rendering happens.
 */

import { state } from './state.js';
import { fetchTracks, fetchTrackTags, fetchLibrarySummary, fetchAlbums } from './core/api.js';
import { sortTracks, renderTrackList, renderAlbums, renderAlbumExpanded, setPlayTrack, bumpCoverCache, refreshCurrentView } from './views/index.js';
import { playTrack, setOnTrackChange, toggleShuffle, toggleLoop } from './ui/player.js';
import { initializeTheme, setupColorPicker, setupPaletteMode, setupScrollShadow, initializeThemeMode, setupThemeToggle } from './ui/theme.js';
import { initSplash } from './ui/splash.js';
import { initializeIcons, createIcon } from './core/icons.js';
import { onTrackSaved } from './modals/edit-track.js';
import { onAlbumSaved } from './modals/edit-album.js';
import { initAudioContext, resumeAudioContext, registerCanvas, enterFullscreen, VISUALIZER_MODES } from './ui/visualizer.js';
import { initTooltips, refreshTooltips } from './ui/tooltip.js';

// --- App constants ---
const SPLASH_DURATION_MS = 3000;
const SPLASH_INIT_DELAY_MS = 100;

// Initialize theme from storage
initializeThemeMode();
initializeTheme();
setupScrollShadow();
setupColorPicker();  // Set up color picker early so it's ready before DOM renders

// Initialize icons
initializeIcons();

// Initialize tooltips
initTooltips();

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
  if (!cv) return;

  // Views that don't show a track list — don't re-render at all
  if (cv.type === 'albums' || cv.type === 'projects' || cv.type === 'unexported' ||
      cv.type === 'visualizers') {
    return;
  }

  if (cv.type === 'album-expanded') {
    const { albumId, albumName } = cv.params || {};
    const cover = albumId != null ? `/api/albums/${albumId}/cover` : '';
    renderAlbumExpanded(albumName, cover, state.tracks, { albumId });
    return;
  }

  // 'all' and 'search' — re-render the track list in place
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
import './core/nav.js';

// Setup playback mode buttons
const btnShuffle = document.getElementById('btn-shuffle');
const btnLoop = document.getElementById('btn-loop');

function updateShuffleButton() {
  btnShuffle.classList.toggle('active', state.shuffle);
  btnShuffle.setAttribute('data-tooltip', state.shuffle ? 'Shuffle: on' : 'Shuffle: off');
}

function updateLoopButton() {
  btnLoop.classList.toggle('active', state.loopMode !== 'off');
  const iconName = state.loopMode === 'one' ? 'loop-one' : 'loop';
  btnLoop.innerHTML = createIcon(iconName, 18);
  const loopLabel = state.loopMode === 'one' ? 'Loop: one' : state.loopMode === 'all' ? 'Loop: all' : 'Loop: off';
  btnLoop.setAttribute('data-tooltip', loopLabel);
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

// Fullscreen toggle
(function initFullscreenToggle() {
  var btn = document.getElementById('fullscreen-btn');
  if (!btn) return;

  function toggleFullscreen() {
    // Check if we're in pywebview
    if (window.pywebview && window.pywebview.api) {
      window.pywebview.api.toggle_fullscreen();
    } else {
      // Fallback for browser/dev mode
      if (!document.fullscreenElement) {
        var elem = document.body;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(err => {
            console.warn('Fullscreen request failed:', err);
          });
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  }

  btn.addEventListener('click', toggleFullscreen);

  // Keyboard shortcut: "f" toggles fullscreen (unless typing in an input)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Update button state when fullscreen changes (for browser mode)
  document.addEventListener('fullscreenchange', () => {
    btn.classList.toggle('active', !!document.fullscreenElement);
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
  state.allTracks = tracks;  // Store original unfiltered tracks
  state.tracks    = sortTracks(tracks);
  renderTrackList(state.tracks);
  refreshTooltips();
  
  // Setup palette mode and theme toggle after DOM is ready
  setupPaletteMode();
  setupThemeToggle();

  // Initialize visualizer meter bar
  const meterBar = document.getElementById('viz-meter-bar');
  if (meterBar) {
    const initMeterOnPlay = () => {
      initAudioContext();
      resumeAudioContext();
      // Size and register each meter cell canvas
      const cells = meterBar.querySelectorAll('.viz-meter-cell');
      cells.forEach(cell => {
        const canvas = cell.querySelector('.viz-meter-canvas');
        const rect = cell.getBoundingClientRect();
        canvas.width = Math.max(40, Math.round(rect.width));
        canvas.height = Math.max(20, Math.round(rect.height));
        const mode = cell.dataset.mode;
        registerCanvas(canvas, mode, { compact: true });
      });
      document.removeEventListener('click', initMeterOnPlay);
    };
    document.addEventListener('click', initMeterOnPlay);

    // Click a cell to launch that mode fullscreen
    meterBar.querySelectorAll('.viz-meter-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        initAudioContext();
        resumeAudioContext();
        enterFullscreen(cell.dataset.mode);
      });
    });
  }

  // Fullscreen visualizer button
  const btnVizFullscreen = document.getElementById('btn-viz-fullscreen');
  if (btnVizFullscreen) {
    btnVizFullscreen.innerHTML = createIcon('maximize', 14);
    btnVizFullscreen.addEventListener('click', () => {
      initAudioContext();
      resumeAudioContext();
      enterFullscreen(state.visualizerMode || 'bars');
    });
  }
}

init();
