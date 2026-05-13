/**
 * views/projects.js — Projects, Unexported, and Favorites views.
 */

import { state } from '../state.js';
import { fetchTracks } from '../core/api.js';
import { formatFileSize } from '../core/utils.js';
import { lucideIcon } from './shared.js';
import { renderTrackList } from './tracks.js';

const content = document.getElementById('content');

export function renderProjects(projects) {
  state.currentView = { type: 'projects', params: {} };
  if (!projects.length) {
    content.innerHTML = `<div class="empty-state"><p>no projects found</p></div>`;
    return;
  }

  const header = `
    <div class="library-hero">
      <div class="library-hero-meta">
        <span class="hero-meta-item">${String(projects.length).padStart(3, '0')} projects</span>
        <span class="hero-meta-item">Ableton Live</span>
        <span class="hero-meta-item">.als</span>
      </div>
      <div class="library-hero-title">Projects</div>
    </div>`;

  const rows = projects.map((p, i) => {
    const idx = String(i + 1).padStart(3, '0');
    const trackCount = String(p.track_count).padStart(3, '0');
    const folder = p.folder_name || '—';

    return `
      <div class="project-row" data-project-name="${p.name}">
        <span class="project-row-idx">${idx}</span>
        <span class="project-row-name">${p.name}</span>
        <span class="project-row-folder">${folder}</span>
        <span class="project-row-tracks">${trackCount} TRK</span>
      </div>`;
  }).join('');

  content.innerHTML = `${header}<div class="index-list">${rows}</div>`;

  content.querySelectorAll('.project-row').forEach(row => {
    row.addEventListener('click', async () => {
      const projectName = row.dataset.projectName;
      const allTracks = await fetchTracks();
      const projectTracks = allTracks.filter(t => t.project_name === projectName);
      state.tracks = projectTracks;
      renderTrackList(projectTracks);
    });
  });
}

export function renderFavorites() {
  state.currentView = { type: 'favorites', params: {} };
  content.innerHTML = `
    <div class="library-hero">
      <div class="library-hero-title">Favorites</div>
    </div>
    <div class="empty-state">
      <p>no favorites yet</p>
      <p class="text-muted">click a track to start listening</p>
    </div>`;
}

export function renderUnexportedProjects(projects) {
  state.currentView = { type: 'unexported', params: {} };

  const header = `
    <div class="library-hero">
      <div class="library-hero-meta">
        <span class="hero-meta-item">${String(projects.length).padStart(3, '0')} projects</span>
        <span class="hero-meta-item">no exports detected</span>
        <span class="hero-meta-item">pending render</span>
      </div>
      <div class="library-hero-title">Unexported</div>
    </div>`;

  if (!projects.length) {
    content.innerHTML = `${header}<div class="empty-state"><p>no unexported projects</p></div>`;
    return;
  }

  const rows = projects.map((p, i) => {
    const idx = String(i + 1).padStart(3, '0');
    const modDate = p.modified_at ? new Date(p.modified_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
    const size = p.file_size_bytes ? formatFileSize(p.file_size_bytes) : '—';

    return `
      <div class="unexported-row">
        <span class="unexported-row-idx">${idx}</span>
        <span class="unexported-row-status">${lucideIcon('circle-dot', 8)}</span>
        <span class="unexported-row-name">${p.name}</span>
        <span class="unexported-row-size">${size}</span>
        <span class="unexported-row-date">${modDate}</span>
      </div>`;
  }).join('');

  content.innerHTML = `${header}<div class="index-list">${rows}</div>`;
}
