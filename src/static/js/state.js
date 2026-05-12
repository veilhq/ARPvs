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
  sortBy: 'name',     // 'name' | 'project' | 'duration' | 'date'
  sortAsc: true,
  trackTags: {},      // { [trackId]: [{id, name, color}] }
};
