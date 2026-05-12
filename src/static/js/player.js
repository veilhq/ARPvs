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

// --- Icon helper ---

function lucideIcon(name, size = 16) {
  const icons = {
    'play': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    'pause': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
    'music': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
    'skip-back': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="4" x2="5" y2="20"></line></svg>`,
    'skip-forward': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="4" x2="19" y2="20"></line></svg>`,
    'shuffle': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 3 5"></polyline><polyline points="21 17 15 11 21 5"></polyline><line x1="3" y1="5" x2="3" y2="19"></line><line x1="21" y1="5" x2="21" y2="19"></line></svg>`,
    'repeat': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 2 21 6 17 10"></polyline><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><polyline points="7 22 3 18 7 14"></polyline><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>`,
    'repeat-1': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v7a5 5 0 0 0 5 5h12"></path><polyline points="16 10 22 4 16 -2"></polyline><text x="5" y="15" font-size="12" font-weight="bold">1</text></svg>`,
  };
  return icons[name] || '';
}

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
  btnPlay.innerHTML = lucideIcon('pause', 18);

  if (track.album_id) {
    playerArt.innerHTML = `<img src="/api/albums/${track.album_id}/cover" alt="">`;
  } else {
    playerArt.innerHTML = `<span class="player-art-placeholder">${lucideIcon('music', 20)}</span>`;
  }

  // Re-render track list to reflect new active row
  onTrackChange?.();
}

export function togglePlay() {
  if (!state.currentTrack) return;
  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
    btnPlay.innerHTML = lucideIcon('play', 18);
  } else {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          state.isPlaying = true;
          btnPlay.innerHTML = lucideIcon('pause', 18);
        })
        .catch(err => {
          console.error('Playback failed:', err);
          state.isPlaying = false;
        });
    } else {
      state.isPlaying = true;
      btnPlay.innerHTML = lucideIcon('pause', 18);
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
