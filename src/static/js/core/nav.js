/**
 * nav.js — Sidebar navigation, search, and keyboard shortcuts.
 *
 * Wires sidebar links to view renders and the search input to the API.
 * Receives render callbacks from main.js to avoid circular imports.
 */

import { state } from '../state.js';
import { fetchTracks, fetchAlbums, fetchProjects, fetchUnexportedProjects, searchTracks } from './api.js';
import {
  renderTrackList,
  renderAlbums,
  renderProjects,
  renderFavorites,
  renderUnexportedProjects,
} from '../views/index.js';
import { togglePlay, playNext, playPrev } from '../ui/player.js';

const searchInput  = document.getElementById('search-input');
const sidebarLinks = document.querySelectorAll('.sidebar-link');

// --- Sidebar ---

sidebarLinks.forEach(link => {
  link.addEventListener('click', async (e) => {
    e.preventDefault();

    sidebarLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    switch (link.dataset.view) {
      case 'all': {
        state.currentView = { type: 'all', params: {} };
        const tracks = await fetchTracks();
        state.tracks = tracks;
        renderTrackList(tracks);
        break;
      }
      case 'albums': {
        const albums = await fetchAlbums();
        renderAlbums(albums);
        break;
      }
      case 'projects': {
        const projects = await fetchProjects();
        renderProjects(projects);
        break;
      }
      case 'unexported': {
        const projects = await fetchUnexportedProjects();
        renderUnexportedProjects(projects);
        break;
      }
      case 'favorites':
        renderFavorites();
        break;
    }
  });
});

// --- Search ---

let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();

  searchTimeout = setTimeout(async () => {
    if (q.length > 0) {
      state.currentView = { type: 'search', params: { query: q } };
      const results = await searchTracks(q);
      state.tracks = results;
      renderTrackList(results);
    } else {
      state.currentView = { type: 'all', params: {} };
      const all = await fetchTracks();
      state.tracks = all;
      renderTrackList(all);
    }
  }, 250);
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  if (e.code === 'Space')      { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight') { playNext(); }
  if (e.code === 'ArrowLeft')  { playPrev(); }
});
