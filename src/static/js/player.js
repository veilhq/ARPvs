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
import { createIcon } from './icons.js';

// Keep call sites short; createIcon already covers every name we need.
const icon = createIcon;

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

  // Stop and reset the current audio before loading new track
  audio.pause();
  audio.currentTime = 0;
  audio.src = `/api/stream/${track.id}`;
  
  const playPromise = audio.play();
  
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        state.isPlaying = true;
      })
      .catch(err => {
        console.error('Playback failed:', err);
        state.isPlaying = false;
      });
  } else {
    state.isPlaying = true;
  }

  // Update player bar UI
  playerTitle.textContent = track.display_name || track.filename;
  playerSub.textContent   = [track.project_name, track.album_name].filter(Boolean).join(' • ');
  btnPlay.innerHTML = icon('pause', 18);

  if (track.album_id) {
    playerArt.innerHTML = `<img src="/api/albums/${track.album_id}/cover" alt="">`;
  } else {
    playerArt.innerHTML = `<span class="player-art-placeholder">${icon('music', 20)}</span>`;
  }

  // Re-render track list to reflect new active row
  onTrackChange?.();
}

export function togglePlay() {
  if (!state.currentTrack) return;
  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
    btnPlay.innerHTML = icon('play', 18);
  } else {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          state.isPlaying = true;
          btnPlay.innerHTML = icon('pause', 18);
        })
        .catch(err => {
          console.error('Playback failed:', err);
          state.isPlaying = false;
        });
    } else {
      state.isPlaying = true;
      btnPlay.innerHTML = icon('pause', 18);
    }
  }
}

export function toggleShuffle() {
  state.shuffle = !state.shuffle;
  return state.shuffle;
}

export function toggleLoop() {
  const modes = ['off', 'one', 'all'];
  const currentIdx = modes.indexOf(state.loopMode);
  state.loopMode = modes[(currentIdx + 1) % modes.length];
  return state.loopMode;
}

export function playAlbum(tracks, albumName) {
  if (!tracks || tracks.length === 0) return;
  state.playlistTracks = tracks;
  state.playlistName = albumName;
  playTrack(0);
}

export function clearPlaylist() {
  state.playlistTracks = null;
  state.playlistName = null;
}

export function playNext() {
  const tracks = state.playlistTracks || state.tracks;
  
  if (state.loopMode === 'one') {
    // Loop one track - restart it
    playTrack(state.currentIndex);
    return;
  }
  
  if (state.shuffle) {
    // Random next track
    const nextIndex = Math.floor(Math.random() * tracks.length);
    playTrack(nextIndex);
  } else {
    // Sequential next
    if (state.currentIndex < tracks.length - 1) {
      playTrack(state.currentIndex + 1);
    } else if (state.loopMode === 'all') {
      // Loop back to start
      playTrack(0);
    }
  }
}

export function playPrev() {
  const tracks = state.playlistTracks || state.tracks;
  
  if (state.currentIndex > 0) {
    playTrack(state.currentIndex - 1);
  } else if (state.loopMode === 'all') {
    // Loop back to end
    playTrack(tracks.length - 1);
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
