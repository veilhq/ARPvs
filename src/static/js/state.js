/**
 * state.js — Shared application state.
 *
 * A single plain object mutated in place so all modules share the same
 * reference without any framework overhead.
 */

export const state = {
  tracks: [],
  currentTrack: null,
  currentIndex: -1,
  isPlaying: false,
  sortBy: 'date',     // 'name' | 'project' | 'duration' | 'date'
  sortAsc: false,
  trackTags: {},      // { [trackId]: [{id, name, color}] }
  
  // Playback modes
  shuffle: false,     // Shuffle playback
  loopMode: 'off',    // 'off' | 'one' | 'all'
  
  // Album/collection playback
  playlistTracks: null,  // Tracks for current album/collection (null = use main tracks)
  playlistName: null,    // Name of current album/collection
};

