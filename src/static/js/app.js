/**
 * ARPvs — Client-side application logic.
 *
 * Handles:
 *   - Library data fetching and rendering
 *   - Audio playback (HTML5 Audio element)
 *   - Navigation between views
 *   - Search
 *   - Progress bar and transport controls
 */

(function () {
  'use strict';

  // --- State ---

  const state = {
    tracks: [],
    currentTrack: null,
    currentIndex: -1,
    isPlaying: false,
  };

  // --- DOM refs ---

  const audio = document.getElementById('audio-element');
  const btnPlay = document.getElementById('btn-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const playerTitle = document.getElementById('player-title');
  const playerProject = document.getElementById('player-project');
  const playerCurrent = document.getElementById('player-current');
  const playerDuration = document.getElementById('player-duration');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const volumeSlider = document.getElementById('volume-slider');
  const searchInput = document.getElementById('search-input');
  const content = document.getElementById('content');

  // --- API ---

  async function fetchTracks() {
    const res = await fetch('/api/tracks');
    if (!res.ok) return [];
    return res.json();
  }

  async function searchTracks(query) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
  }

  // --- Rendering ---

  function renderTrackList(tracks) {
    if (!tracks.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p>no tracks found</p>
          <p class="text-muted">configure scan_root in config.json and restart</p>
        </div>`;
      return;
    }

    const rows = tracks.map((t, i) => `
      <div class="track-row${state.currentIndex === i ? ' track-active' : ''}" data-index="${i}">
        <span class="track-indicator">${t.is_changed ? '~' : '>'}</span>
        <span class="track-name">${t.display_name || t.filename}</span>
        <span class="track-project">${t.project_name || ''}</span>
        <span class="track-duration">${formatTime(t.duration_seconds)}</span>
      </div>
    `).join('');

    content.innerHTML = `<div class="track-list">${rows}</div>`;

    // Attach click handlers
    content.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.index, 10);
        playTrack(idx);
      });
    });
  }

  // --- Playback ---

  function playTrack(index) {
    if (index < 0 || index >= state.tracks.length) return;

    const track = state.tracks[index];
    state.currentTrack = track;
    state.currentIndex = index;

    audio.src = `/api/stream/${track.id}`;
    audio.play();
    state.isPlaying = true;

    playerTitle.textContent = track.display_name || track.filename;
    playerProject.textContent = track.project_name || '';
    btnPlay.innerHTML = '&#9646;&#9646;';

    renderTrackList(state.tracks);
  }

  function togglePlay() {
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
      btnPlay.innerHTML = '&#9654;';
    } else {
      audio.play();
      state.isPlaying = true;
      btnPlay.innerHTML = '&#9646;&#9646;';
    }
  }

  function playNext() {
    if (state.currentIndex < state.tracks.length - 1) {
      playTrack(state.currentIndex + 1);
    }
  }

  function playPrev() {
    if (state.currentIndex > 0) {
      playTrack(state.currentIndex - 1);
    }
  }

  // --- Time / Progress ---

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${pct}%`;
    playerCurrent.textContent = formatTime(audio.currentTime);
    playerDuration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    playNext();
  });

  progressBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // --- Controls ---

  btnPlay.addEventListener('click', togglePlay);
  btnPrev.addEventListener('click', playPrev);
  btnNext.addEventListener('click', playNext);
  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value);
  });

  // --- Search ---

  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    searchTimeout = setTimeout(async () => {
      if (q.length > 0) {
        const results = await searchTracks(q);
        state.tracks = results;
        renderTrackList(results);
      } else {
        const all = await fetchTracks();
        state.tracks = all;
        renderTrackList(all);
      }
    }, 250);
  });

  // --- Keyboard shortcuts ---

  document.addEventListener('keydown', (e) => {
    if (e.target === searchInput) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') { playNext(); }
    if (e.code === 'ArrowLeft') { playPrev(); }
  });

  // --- Init ---

  async function init() {
    const tracks = await fetchTracks();
    state.tracks = tracks;
    renderTrackList(tracks);
  }

  init();
})();
