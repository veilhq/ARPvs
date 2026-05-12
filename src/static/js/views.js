/**
 * views.js — All content-area rendering and sort logic.
 *
 * Each render* function writes into #content. Track rows delegate clicks
 * to player.js via the injected playTrack callback.
 */

import { state } from './state.js';
import { formatTime } from './utils.js';
import { fetchAlbums } from './api.js';

const content = document.getElementById('content');

// Injected by main.js so views can trigger playback without a circular dep.
let _playTrack = null;

export function setPlayTrack(fn) {
  _playTrack = fn;
}

// --- Sort ---

export function sortTracks(tracks) {
  const sorted = [...tracks];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (state.sortBy) {
      case 'name':
        cmp = (a.display_name || a.filename).localeCompare(b.display_name || b.filename);
        break;
      case 'project':
        cmp = (a.project_name || '').localeCompare(b.project_name || '');
        break;
      case 'duration':
        cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
        break;
      case 'date':
        cmp = (a.modified_at || 0) - (b.modified_at || 0);
        break;
    }
    return state.sortAsc ? cmp : -cmp;
  });
  return sorted;
}

function handleSort(field) {
  if (state.sortBy === field) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortBy = field;
    state.sortAsc = true;
  }
  state.tracks = sortTracks(state.tracks);
  renderTrackList(state.tracks);
}

// --- Shared helpers ---

function thumbHtml(albumId) {
  return albumId
    ? `<img src="/api/albums/${albumId}/cover" alt="" loading="lazy">`
    : `<span class="track-thumb-placeholder">♩</span>`;
}

function trackRowHtml(t, i, { showTags = true } = {}) {
  const tags = showTags ? (state.trackTags[t.id] || []) : [];
  const tagHtml = tags.map(tag =>
    `<span class="tag-pill" style="--tag-color: ${tag.color || '#555'}">${tag.name}</span>`
  ).join('');

  const subParts = [];
  if (t.project_name) subParts.push(t.project_name);
  if (t.album_name)   subParts.push(t.album_name);
  const subText = subParts.join('<span class="track-sub-sep">•</span>');

  const isActive = state.currentIndex === i;
  const indicator = isActive ? '▶' : (t.is_changed ? '~' : '·');

  return `
    <div class="track-row${isActive ? ' track-active' : ''}" data-index="${i}">
      <span class="track-indicator">${indicator}</span>
      <div class="track-thumb">${thumbHtml(t.album_id)}</div>
      <div class="track-info">
        <span class="track-name">${t.display_name || t.filename}</span>
        ${subText ? `<span class="track-sub">${subText}</span>` : ''}
      </div>
      <span class="track-tags">${tagHtml}</span>
      <span class="track-duration">${formatTime(t.duration_seconds)}</span>
    </div>`;
}

function bindTrackRows() {
  content.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', () => {
      _playTrack?.(parseInt(row.dataset.index, 10));
    });
  });
}

// --- Track list view ---

export function renderTrackList(tracks) {
  if (!tracks.length) {
    content.innerHTML = `
      <div class="empty-state">
        <p>no tracks found</p>
        <p class="text-muted">configure scan_root in config.json and restart</p>
      </div>`;
    return;
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
  const sortIcon = state.sortAsc ? '↑' : '↓';

  const sortFields = [
    { key: 'name',     label: 'name' },
    { key: 'project',  label: 'project' },
    { key: 'duration', label: 'length' },
    { key: 'date',     label: 'date' },
  ];

  const toolbar = `
    <div class="track-toolbar">
      <div class="track-toolbar-info">
        <span class="track-count">${tracks.length} track${tracks.length !== 1 ? 's' : ''}</span>
        <span class="track-total-duration">${formatTime(totalDuration)} total</span>
      </div>
      <div class="track-toolbar-sort">
        <div class="sort-wrapper">
          <button class="sort-toggle" id="sort-toggle-btn">
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" stroke-width="1.5"/>
              <line x1="0" y1="5" x2="8" y2="5" stroke="currentColor" stroke-width="1.5"/>
              <line x1="0" y1="9" x2="5" y2="9" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Sort
          </button>
          <div class="sort-panel" id="sort-panel">
            ${sortFields.map(f => `
              <div class="sort-panel-item${state.sortBy === f.key ? ' sort-active' : ''}" data-sort="${f.key}">
                <span>${f.label}</span>
                ${state.sortBy === f.key ? `<span class="sort-arrow">${sortIcon}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;

  const rows = tracks.map((t, i) => trackRowHtml(t, i)).join('');
  content.innerHTML = `${toolbar}<div class="track-list">${rows}</div>`;

  // Sort toggle dropdown
  const sortToggleBtn = document.getElementById('sort-toggle-btn');
  const sortPanel     = document.getElementById('sort-panel');

  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortPanel.classList.toggle('open');
  });

  // Close on outside click — use a named handler so we can remove it later
  const closeSortPanel = () => sortPanel.classList.remove('open');
  document.addEventListener('click', closeSortPanel);

  content.querySelectorAll('.sort-panel-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSort(item.dataset.sort);
      // handleSort re-renders, so the panel is gone — no need to close it
    });
  });

  bindTrackRows();
}

// --- Albums grid ---

export function renderAlbums(albums) {
  if (!albums.length) {
    content.innerHTML = `<div class="empty-state"><p>no albums found</p></div>`;
    return;
  }

  const cards = albums.map(a => `
    <div class="album-card" data-album-id="${a.id}" data-album-name="${a.name}">
      <div class="album-art">
        <img src="${a.cover_art_url}" alt="${a.name}" loading="lazy">
      </div>
      <div class="album-info">
        <div class="album-name">${a.name}</div>
        <div class="album-meta">${a.project_count} project${a.project_count !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `).join('');

  content.innerHTML = `<div class="view-header">Albums</div><div class="card-grid">${cards}</div>`;

  content.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', async () => {
      const albumName = card.dataset.albumName;
      const albumId   = card.dataset.albumId;
      const coverUrl  = `/api/albums/${albumId}/cover`;

      const res = await fetch('/api/tracks');
      const allTracks = await res.json();
      const albumTracks = allTracks.filter(t => t.album_name === albumName);

      renderAlbumExpanded(albumName, coverUrl, albumTracks);
    });
  });
}

// --- Album expanded view ---

export function renderAlbumExpanded(albumName, coverUrl, tracks) {
  state.tracks = tracks;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);

  const rows = tracks.map((t, i) => trackRowHtml(t, i, { showTags: false })).join('');

  content.innerHTML = `
    <div class="album-expanded">
      <button class="back-btn" id="back-to-albums">← albums</button>
      <div class="album-expanded-header">
        <div class="album-expanded-art">
          <img src="${coverUrl}" alt="${albumName}">
        </div>
        <div class="album-expanded-info">
          <div class="album-expanded-name">${albumName}</div>
          <div class="album-expanded-meta">
            ${tracks.length} track${tracks.length !== 1 ? 's' : ''} · ${formatTime(totalDuration)}
          </div>
        </div>
      </div>
      <div class="track-list">${rows}</div>
    </div>`;

  document.getElementById('back-to-albums').addEventListener('click', async () => {
    const albums = await fetchAlbums();
    renderAlbums(albums);
  });

  bindTrackRows();
}

// --- Projects grid ---

export function renderProjects(projects) {
  if (!projects.length) {
    content.innerHTML = `<div class="empty-state"><p>no projects found</p></div>`;
    return;
  }

  const cards = projects.map(p => `
    <div class="project-card" data-project-id="${p.id}">
      <div class="project-name">${p.name}</div>
      <div class="project-meta">${p.album_name ? p.album_name + ' · ' : ''}${p.track_count} track${p.track_count !== 1 ? 's' : ''}</div>
    </div>
  `).join('');

  content.innerHTML = `<div class="view-header">Projects</div><div class="card-grid">${cards}</div>`;

  content.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', async () => {
      const projectName = card.querySelector('.project-name').textContent;
      const res = await fetch('/api/tracks');
      const allTracks = await res.json();
      const projectTracks = allTracks.filter(t => t.project_name === projectName);
      state.tracks = projectTracks;
      renderTrackList(projectTracks);
    });
  });
}

// --- Stub views ---

export function renderCollections() {
  content.innerHTML = `
    <div class="empty-state">
      <p>no collections yet</p>
      <p class="text-muted">collections coming soon</p>
    </div>`;
}

export function renderFavorites() {
  content.innerHTML = `
    <div class="empty-state">
      <p>no favorites yet</p>
      <p class="text-muted">click a track to start listening</p>
    </div>`;
}
