/**
 * state.js — Shared application state.
 *
 * A single plain object mutated in place so all modules share the same
 * reference without any framework overhead.
 */

export const state = {
  tracks: [],
  allTracks: [],  // Keep the original unfiltered list
  currentTrack: null,
  currentIndex: -1,
  isPlaying: false,
  sortBy: 'date',     // 'name' | 'project' | 'duration' | 'date'
  sortAsc: false,
  trackTags: {},      // { [trackId]: [{id, name, color}] }
  librarySummary: null, // { total_tracks, total_projects, total_albums, total_unexported, total_duration_seconds, total_file_size_bytes }

  // Current view — used to refresh in place after edits.
  //   type: 'all' | 'albums' | 'album-expanded' | 'projects' | 'unexported' | 'search'
  //   params: view-specific context (e.g. { albumId } for album-expanded, { query } for search)
  currentView: { type: 'all', params: {} },

  // Playback modes
  shuffle: false,     // Shuffle playback
  loopMode: 'off',    // 'off' | 'one' | 'all'
  
  // Album/collection playback
  playlistTracks: null,  // Tracks for current album/collection (null = use main tracks)
  playlistName: null,    // Name of current album/collection

  // Visualizer
  visualizerMode: 'bars',       // Active compact visualizer mode
  visualizerFullscreen: false,  // Whether fullscreen visualizer is open
  ambientMode: false,           // Ambient mode — higher smoothing, slower transitions

  // Track filtering
  showLatestOnly: true,  // Show only latest version of each track
};

