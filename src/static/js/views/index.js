/**
 * views/index.js — Public API re-exports and refreshCurrentView router.
 */

import { state } from '../state.js';
import { fetchTracks, fetchAlbums, fetchAlbumTracks } from '../core/api.js';
import { setPlayTrack } from './shared.js';
import { sortTracks, renderTrackList } from './tracks.js';
import { renderAlbums, renderAlbumExpanded, bumpCoverCache } from './albums.js';
import { renderProjects, renderUnexportedProjects } from './projects.js';

export { setPlayTrack } from './shared.js';
export { sortTracks, renderTrackList } from './tracks.js';
export { renderAlbums, renderAlbumExpanded, bumpCoverCache } from './albums.js';
export { renderProjects, renderUnexportedProjects } from './projects.js';

/**
 * Re-render whichever view is currently active, fetching fresh data.
 */
export async function refreshCurrentView() {
  const cv = state.currentView || { type: 'all', params: {} };
  switch (cv.type) {
    case 'albums': {
      const albums = await fetchAlbums();
      renderAlbums(albums);
      return;
    }
    case 'album-expanded': {
      const { albumId, albumName } = cv.params || {};
      if (albumId == null) return;
      const data = await fetchAlbumTracks(albumId);
      renderAlbumExpanded(albumName, `/api/albums/${albumId}/cover`, data.tracks, { albumId });
      return;
    }
    case 'search': {
      const q = (cv.params && cv.params.query) || '';
      if (q) {
        const { searchTracks } = await import('../api.js');
        const results = await searchTracks(q);
        state.allTracks = results;
        state.tracks = results;
        renderTrackList(results);
      } else {
        const all = await fetchTracks();
        state.allTracks = all;
        state.tracks = sortTracks(all);
        renderTrackList(state.tracks);
      }
      return;
    }
    case 'projects': {
      const { fetchProjects } = await import('../api.js');
      renderProjects(await fetchProjects());
      return;
    }
    case 'unexported': {
      const { fetchUnexportedProjects } = await import('../api.js');
      renderUnexportedProjects(await fetchUnexportedProjects());
      return;
    }
    case 'visualizers': {
      const { renderVisualizers } = await import('./visualizers.js');
      renderVisualizers();
      return;
    }
    case 'all':
    default: {
      const tracks = await fetchTracks();
      state.allTracks = tracks;
      state.tracks = sortTracks(tracks);
      renderTrackList(state.tracks);
    }
  }
}
