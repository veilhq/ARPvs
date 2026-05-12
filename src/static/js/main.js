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
import { playTrack, setOnTrackChange } from './player.js';

// Wire the circular dependency break-points:
//   views needs to call playTrack  → inject it
//   player needs to re-render list → inject renderTrackList
setPlayTrack(playTrack);
setOnTrackChange(() => renderTrackList(state.tracks));

// nav.js registers its own event listeners on import — just pull it in.
import './nav.js';

async function init() {
  const [tracks, trackTags] = await Promise.all([
    fetchTracks(),
    fetchTrackTags(),
  ]);

  state.trackTags = trackTags;
  state.tracks    = sortTracks(tracks);
  renderTrackList(state.tracks);
}

init();
