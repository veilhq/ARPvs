/**
 * player.js — Audio playback engine and player bar UI.
 *
 * Owns the <audio> element and all transport controls.
 * Calls back into views.js (via an injected callback) to re-render the
 * track list when the active track changes, keeping the dependency
 * direction one-way: player → views, never views → player directly.
 */

import { state } from './state.js';
import { formatTime } from './utils.js';

// --- DOM refs ---

const audio       = document.getElementById('audio-element');
const btnPlay     = document.getElementById('btn-play');
const btnPrev     = document.getElementById('btn-prev');
const btnNext     = document.getElementById('btn-next');
const playerTitle = document.getElementById('player-title');
const playerSub   = document.getElementById('player-project');   // <span id="player-project">
const playerArt   = document.getElementById('player-art');
const playerCurrent  = document.getElementById('player-current');
const playerDuration = document.getElementById('player-duration');
const progressBar    = document.getElementById('progress-bar');
const progressFill   = document.getElementById('progress-fill');
const volumeSlider   = document.getElementById('volume-slider');

// Injected by main.js after views module is ready.
let onTrackChange = null;

export function setOnTrackChange(cb) {
  onTrackChange = cb;
}

// --- Playback ---

export function playTrack(index) {
  if (index < 0 || index >= state.tracks.length) return;

  const track = state.tracks[index];
  state.currentTrack = track;
  state.currentIndex = index;

  audio.src = `/api/stream/${track.id}`;
  audio.play();
  state.isPlaying = true;

  // Update player bar UI
  playerTitle.textContent = track.display_name || track.filename;
  playerSub.textContent   = [track.project_name, track.album_name].filter(Boolean).join(' • ');
  btnPlay.innerHTML = '&#9646;&#9646;';

  if (track.album_id) {
    playerArt.innerHTML = `<img src="/api/albums/${track.album_id}/cover" alt="">`;
  } else {
    playerArt.innerHTML = `<span class="player-art-placeholder">♩</span>`;
  }

  // Re-render track list to reflect new active row
  onTrackChange?.();
}

export function togglePlay() {
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

export function playNext() {
  if (state.currentIndex < state.tracks.length - 1) {
    playTrack(state.currentIndex + 1);
  }
}

export function playPrev() {
  if (state.currentIndex > 0) {
    playTrack(state.currentIndex - 1);
  }
}

// --- Progress bar ---

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

// --- Transport controls ---

btnPlay.addEventListener('click', togglePlay);
btnPrev.addEventListener('click', playPrev);
btnNext.addEventListener('click', playNext);
volumeSlider.addEventListener('input', () => {
  audio.volume = parseFloat(volumeSlider.value);
});
