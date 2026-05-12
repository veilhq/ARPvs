/**
 * views.js — All content-area rendering and sort logic.
 *
 * Each render* function writes into #content. Track rows delegate clicks
 * to player.js via the injected playTrack callback.
 */

import { state } from './state.js';
import { formatTime, parseVersion, groupTracksByVersion } from './utils.js';
import { fetchAlbums } from './api.js';
import { createIcon } from './icons.js';

const content = document.getElementById('content');

// Injected by main.js so views can trigger playback without a circular dep.
let _playTrack = null;

export function setPlayTrack(fn) {
  _playTrack = fn;
}

// --- Icon helpers ---

function lucideIcon(name, size = 16) {
  return createIcon(name, size);
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
    : `<span class="track-thumb-placeholder">${lucideIcon('music', 18)}</span>`;
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
  let indicator = '';
  if (isActive) {
    indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
  } else if (t.is_changed) {
    indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
  } else {
    indicator = `<span class="track-indicator-icon">${lucideIcon('dot', 6)}</span>`;
  }

  // Parse version from display name
  const { name: trackName, version } = parseVersion(t.display_name || t.filename);

  // Format date if available
  const dateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString() : '';

  return `
    <div class="track-row${isActive ? ' track-active' : ''}" data-index="${i}">
      <span class="track-indicator">${indicator}</span>
      <div class="track-thumb">${thumbHtml(t.album_id)}</div>
      <div class="track-info">
        <span class="track-name">${trackName}</span>
        ${subText ? `<span class="track-sub">${subText}</span>` : ''}
      </div>
      <div class="track-version-badge">
        ${version ? `<span class="track-version">${version}</span>` : ''}
      </div>
      <span class="track-tags">${tagHtml}</span>
      <span class="track-metadata">
        <span class="track-duration" title="Duration">${formatTime(t.duration_seconds)}</span>
        ${dateStr ? `<span class="track-date" title="Modified">${dateStr}</span>` : ''}
      </span>
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
        <p class="text-muted">configure SCAN_ROOT in .env and restart</p>
      </div>`;
    return;
  }

  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
  const sortIcon = state.sortAsc ? lucideIcon('arrow-up', 12) : lucideIcon('arrow-down', 12);

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

  const rows = (() => {
    // Group tracks by base name
    const groups = groupTracksByVersion(tracks);

    return groups.map((group, groupIdx) => {
      if (!group.hasVersions) {
        // Single track, no versions — render normally
        const t = group.tracks[0];
        return trackRowHtml(t, t.originalIndex);
      }

      // Multiple versions — render as collapsible group
      const groupId = `version-group-${groupIdx}`;
      const { name: trackName } = parseVersion(group.tracks[0].display_name || group.tracks[0].filename);

      // Find the first track's metadata for the group header
      const firstTrack = group.tracks[0];
      const subParts = [];
      if (firstTrack.project_name) subParts.push(firstTrack.project_name);
      if (firstTrack.album_name)   subParts.push(firstTrack.album_name);
      const subText = subParts.join('<span class="track-sub-sep">•</span>');

      // Format date for group header
      const dateStr = firstTrack.modified_at ? new Date(firstTrack.modified_at * 1000).toLocaleDateString() : '';

      const groupHeader = `
        <div class="track-group-header" data-group-id="${groupId}">
          <span class="track-group-toggle">${lucideIcon('chevron-right', 14)}</span>
          <div class="track-thumb">${thumbHtml(firstTrack.album_id)}</div>
          <div class="track-info">
            <span class="track-name">${trackName}</span>
            ${subText ? `<span class="track-sub">${subText}</span>` : ''}
          </div>
          <div class="track-version-badge">
            <span class="track-versions-tag">${group.tracks.length} versions</span>
          </div>
          <span class="track-tags"></span>
          <span class="track-metadata">
            <span class="track-duration" title="Duration">${formatTime(firstTrack.duration_seconds)}</span>
            ${dateStr ? `<span class="track-date" title="Modified">${dateStr}</span>` : ''}
          </span>
        </div>`;

      const versionRows = group.tracks.map((t) => {
        const { version } = parseVersion(t.display_name || t.filename);
        const isActive = state.currentIndex === t.originalIndex;
        let indicator = '';
        if (isActive) {
          indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
        } else if (t.is_changed) {
          indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
        } else {
          indicator = `<span class="track-indicator-icon">${lucideIcon('dot', 6)}</span>`;
        }
        
        // Format date for version row
        const versionDateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString() : '';

        return `
          <div class="track-row track-version-row${isActive ? ' track-active' : ''}" data-index="${t.originalIndex}" data-group-id="${groupId}">
            <span class="track-indicator">${indicator}</span>
            <div class="track-thumb">${thumbHtml(t.album_id)}</div>
            <div class="track-info">
              <span class="track-name">
                <span class="track-version-label">${version}</span>
              </span>
            </div>
            <span class="track-tags"></span>
            <span class="track-metadata">
              <span class="track-duration" title="Duration">${formatTime(t.duration_seconds)}</span>
              ${versionDateStr ? `<span class="track-date" title="Modified">${versionDateStr}</span>` : ''}
            </span>
          </div>`;
      }).join('');

      return `${groupHeader}<div class="track-group-versions collapsed" data-group-id="${groupId}">${versionRows}</div>`;
    }).join('');
  })();

  content.innerHTML = `${toolbar}<div class="track-list">${rows}</div>`;

  // Sort toggle dropdown
  const sortToggleBtn = document.getElementById('sort-toggle-btn');
  const sortPanel     = document.getElementById('sort-panel');

  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortPanel.classList.toggle('open');
  });

  document.addEventListener('click', () => sortPanel.classList.remove('open'));

  content.querySelectorAll('.sort-panel-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSort(item.dataset.sort);
    });
  });

  // Version group collapse/expand
  content.querySelectorAll('.track-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.groupId;
      const versions = content.querySelector(`.track-group-versions[data-group-id="${groupId}"]`);
      const toggle = header.querySelector('.track-group-toggle');

      versions.classList.toggle('collapsed');
      toggle.innerHTML = versions.classList.contains('collapsed') ? lucideIcon('chevron-right', 14) : lucideIcon('chevron-down', 14);
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
      <div class="album-controls">
        <button class="album-btn album-btn-play" title="Play album">${lucideIcon('play-circle', 20)}</button>
        <button class="album-btn album-btn-info" title="View details">ℹ</button>
      </div>
    </div>
  `).join('');

  content.innerHTML = `<div class="view-header">Albums</div><div class="card-grid">${cards}</div>`;

  content.querySelectorAll('.album-card').forEach(card => {
    const playBtn = card.querySelector('.album-btn-play');
    const infoBtn = card.querySelector('.album-btn-info');
    
    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const albumName = card.dataset.albumName;
      const albumId   = card.dataset.albumId;

      const res = await fetch('/api/tracks');
      const allTracks = await res.json();
      const albumTracks = allTracks.filter(t => t.album_name === albumName);

      // Import playAlbum from player
      const { playAlbum } = await import('./player.js');
      playAlbum(albumTracks, albumName);
    });

    infoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
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

  // Add originalIndex to tracks for grouping
  const tracksWithIndex = tracks.map((t, i) => ({ ...t, originalIndex: i }));

  const rows = (() => {
    // Group tracks by base name
    const groups = groupTracksByVersion(tracksWithIndex);

    return groups.map((group, groupIdx) => {
      if (!group.hasVersions) {
        // Single track, no versions — render normally
        const t = group.tracks[0];
        return trackRowHtml(t, t.originalIndex, { showTags: false });
      }

      // Multiple versions — render as collapsible group
      const groupId = `version-group-${groupIdx}`;
      const { name: trackName } = parseVersion(group.tracks[0].display_name || group.tracks[0].filename);

      // Find the first track's metadata for the group header
      const firstTrack = group.tracks[0];
      const subParts = [];
      if (firstTrack.project_name) subParts.push(firstTrack.project_name);
      if (firstTrack.album_name)   subParts.push(firstTrack.album_name);
      const subText = subParts.join('<span class="track-sub-sep">•</span>');

      // Format date for group header
      const dateStr = firstTrack.modified_at ? new Date(firstTrack.modified_at * 1000).toLocaleDateString() : '';

      const groupHeader = `
        <div class="track-group-header" data-group-id="${groupId}">
          <span class="track-group-toggle">${lucideIcon('chevron-right', 14)}</span>
          <div class="track-thumb">${thumbHtml(firstTrack.album_id)}</div>
          <div class="track-info">
            <span class="track-name">${trackName}</span>
            ${subText ? `<span class="track-sub">${subText}</span>` : ''}
          </div>
          <div class="track-version-badge">
            <span class="track-versions-tag">${group.tracks.length} versions</span>
          </div>
          <span class="track-tags"></span>
          <span class="track-metadata">
            <span class="track-duration" title="Duration">${formatTime(firstTrack.duration_seconds)}</span>
            ${dateStr ? `<span class="track-date" title="Modified">${dateStr}</span>` : ''}
          </span>
        </div>`;

      const versionRows = group.tracks.map((t) => {
        const { version } = parseVersion(t.display_name || t.filename);
        const isActive = state.currentIndex === t.originalIndex;
        let indicator = '';
        if (isActive) {
          indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
        } else if (t.is_changed) {
          indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
        } else {
          indicator = `<span class="track-indicator-icon">${lucideIcon('dot', 6)}</span>`;
        }
        
        // Format date for version row
        const versionDateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString() : '';

        return `
          <div class="track-row track-version-row${isActive ? ' track-active' : ''}" data-index="${t.originalIndex}" data-group-id="${groupId}">
            <span class="track-indicator">${indicator}</span>
            <div class="track-thumb">${thumbHtml(t.album_id)}</div>
            <div class="track-info">
              <span class="track-name">
                <span class="track-version-label">${version}</span>
              </span>
            </div>
            <span class="track-tags"></span>
            <span class="track-metadata">
              <span class="track-duration" title="Duration">${formatTime(t.duration_seconds)}</span>
              ${versionDateStr ? `<span class="track-date" title="Modified">${versionDateStr}</span>` : ''}
            </span>
          </div>`;
      }).join('');

      return `${groupHeader}<div class="track-group-versions collapsed" data-group-id="${groupId}">${versionRows}</div>`;
    }).join('');
  })();

  content.innerHTML = `
    <div class="album-expanded">
      <button class="back-btn" id="back-to-albums"><span class="back-btn-icon">${lucideIcon('arrow-left', 14)}</span> albums</button>
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

  // Version group collapse/expand
  content.querySelectorAll('.track-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const groupId = header.dataset.groupId;
      const versions = content.querySelector(`.track-group-versions[data-group-id="${groupId}"]`);
      const toggle = header.querySelector('.track-group-toggle');

      versions.classList.toggle('collapsed');
      toggle.innerHTML = versions.classList.contains('collapsed') ? lucideIcon('chevron-right', 14) : lucideIcon('chevron-down', 14);
    });
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

export function renderUnexportedProjects(projects) {
  if (!projects.length) {
    content.innerHTML = `<div class="empty-state"><p>no unexported projects</p></div>`;
    return;
  }

  const cards = projects.map(p => {
    const modDate = p.modified_at ? new Date(p.modified_at * 1000).toLocaleDateString() : 'unknown';
    const sizeKb = Math.round((p.file_size_bytes || 0) / 1024);
    return `
      <div class="unexported-card">
        <div class="unexported-icon">${lucideIcon('edit', 16)}</div>
        <div class="unexported-info">
          <div class="unexported-name">${p.name}</div>
          <div class="unexported-meta">Modified ${modDate} · ${sizeKb} KB</div>
        </div>
      </div>
    `;
  }).join('');

  content.innerHTML = `<div class="view-header">Unexported Projects</div><div class="unexported-grid">${cards}</div>`;
}
