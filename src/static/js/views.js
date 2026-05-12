/**
 * views.js — All content-area rendering and sort logic.
 *
 * Each render* function writes into #content. Track rows delegate clicks
 * to player.js via the injected playTrack callback.
 */

import { state } from './state.js';
import { formatTime, formatDurationLong, formatFileSize, parseVersion, groupTracksByVersion } from './utils.js';
import { fetchAlbums, fetchTracks, fetchLibrarySummary, fetchAlbumTracks } from './api.js';
import { createIcon } from './icons.js';
import { renderDitherFrame, ditherCanvasHtml, bindDitherCanvases } from './dither-bg.js';
import { openEditTrack } from './edit-track.js';

const content = document.getElementById('content');

// --- Sparkline helper ---

// Deterministic pseudo-random generator seeded on track id, so each row
// gets a consistent placeholder waveform until real peaks are computed.
function seededPeaks(seed, count) {
  const peaks = [];
  let s = seed * 9301 + 49297;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const rand = s / 233280;
    // Shape: envelope that rises then falls + some wiggle
    const t = i / count;
    const envelope = Math.sin(t * Math.PI) * 0.7 + 0.2;
    peaks.push(Math.max(0.08, Math.min(1, envelope * (0.5 + rand * 0.8))));
  }
  return peaks;
}

function sparklineSvg(track, width = 80, height = 20) {
  let peaks;
  if (track.waveform_peaks && track.waveform_peaks.length) {
    peaks = track.waveform_peaks;
  } else {
    peaks = seededPeaks(track.id || 1, 32);
  }
  const bars = peaks.length;
  const barWidth = width / bars;
  const gap = Math.max(0.5, barWidth * 0.2);
  const w = barWidth - gap;
  let html = `<svg class="track-sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  peaks.forEach((p, i) => {
    const h = Math.max(1, p * height);
    const x = i * barWidth;
    const y = (height - h) / 2;
    html += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" />`;
  });
  html += `</svg>`;
  return html;
}

// Injected by main.js so views can trigger playback without a circular dep.
let _playTrack = null;

export function setPlayTrack(fn) {
  _playTrack = fn;
}

// Register the sort-panel outside-click handler exactly once. Previously
// this ran on every track list render, leaking a listener per render.
let _sortOutsideCloseInstalled = false;
function installSortPanelOutsideClose() {
  if (_sortOutsideCloseInstalled) return;
  _sortOutsideCloseInstalled = true;
  document.addEventListener('click', () => {
    const panel = document.getElementById('sort-panel');
    if (panel) panel.classList.remove('open');
  });
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

function thumbHtml(track) {
  // Seed the dither by project id so every version of the same project
  // shares a pattern — it reads as a "group" at a glance. Fall back to
  // the track id for loose tracks (and to 1 if neither is available).
  const seed = (track && (track.project_id || track.id)) || 1;
  return ditherCanvasHtml(seed);
}

function trackRowHtml(t, i, { showTags = true } = {}) {
  const tags = showTags ? (state.trackTags[t.id] || []) : [];
  const tagHtml = tags.map(tag =>
    `<span class="tag-pill" style="--tag-color: ${tag.color || '#555'}">${tag.name}</span>`
  ).join('');

  const subParts = [];
  if (t.project_name) subParts.push(t.project_name);
  if (t.folder_name)  subParts.push(t.folder_name);
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
  const fileSizeStr = t.file_size_bytes ? formatFileSize(t.file_size_bytes) : '';

  return `
    <div class="track-row${isActive ? ' track-active' : ''}" data-index="${i}" data-track-id="${t.id}">
      <span class="track-indicator">${indicator}</span>
      <div class="track-thumb">${thumbHtml(t)}</div>
      <div class="track-info">
        <span class="track-name">${trackName}</span>
        ${subText ? `<span class="track-sub">${subText}</span>` : ''}
      </div>
      <div class="track-version-badge">
        <span class="track-versions-tag">1 version</span>
      </div>
      <span class="track-tags">${tagHtml}</span>
      <span class="track-sparkline-wrap" title="Waveform">${sparklineSvg(t)}</span>
      <span class="track-metadata">
        <span class="track-format" title="Format">WAV</span>
        <span class="track-filesize" title="File size">${fileSizeStr}</span>
        <span class="track-duration" title="Duration">${formatTime(t.duration_seconds)}</span>
        ${dateStr ? `<span class="track-date" title="Modified">${dateStr}</span>` : ''}
      </span>
      <button class="track-edit-btn" data-track-id="${t.id}" title="Edit name">${lucideIcon('pencil', 13)}</button>
    </div>`;
}

function bindTrackRows() {
  content.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // Ignore clicks that originated on the edit button
      if (e.target.closest('.track-edit-btn')) return;
      _playTrack?.(parseInt(row.dataset.index, 10));
    });
  });
  bindEditButtons();
  // Kick off lazy dither rendering for every placeholder in the new DOM.
  bindDitherCanvases(content);
}

function bindEditButtons() {
  content.querySelectorAll('.track-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = parseInt(btn.dataset.trackId, 10);
      openEditTrack(trackId);
    });
  });
}

// Renders a list of tracks (already carrying `originalIndex`) as a mix of
// single-row and collapsible version-group rows. Used by both the main
// track list and the album-expanded view.
function renderGroupedTracksHtml(tracks, { showTags = true } = {}) {
  const groups = groupTracksByVersion(tracks);

  return groups.map((group, groupIdx) => {
    if (!group.hasVersions) {
      const t = group.tracks[0];
      return trackRowHtml(t, t.originalIndex, { showTags });
    }

    const groupId = `version-group-${groupIdx}`;
    const firstTrack = group.tracks[0];
    const { name: trackName } = parseVersion(firstTrack.display_name || firstTrack.filename);

    const subParts = [];
    if (firstTrack.project_name) subParts.push(firstTrack.project_name);
    if (firstTrack.folder_name)  subParts.push(firstTrack.folder_name);
    const subText = subParts.join('<span class="track-sub-sep">•</span>');
    const dateStr = firstTrack.modified_at ? new Date(firstTrack.modified_at * 1000).toLocaleDateString() : '';

    const groupHeader = `
      <div class="track-group-header" data-group-id="${groupId}" data-track-id="${firstTrack.id}">
        <span class="track-group-toggle">${lucideIcon('chevron-right', 14)}</span>
        <div class="track-thumb">${thumbHtml(firstTrack)}</div>
        <div class="track-info">
          <span class="track-name">${trackName}</span>
          ${subText ? `<span class="track-sub">${subText}</span>` : ''}
        </div>
        <div class="track-version-badge">
          <span class="track-versions-tag">${group.tracks.length} versions</span>
        </div>
        <span class="track-tags"></span>
        <span class="track-sparkline-wrap" title="Waveform">${sparklineSvg(firstTrack)}</span>
        <span class="track-metadata">
          <span class="track-format" title="Format">WAV</span>
          <span class="track-filesize" title="File size">${firstTrack.file_size_bytes ? formatFileSize(firstTrack.file_size_bytes) : ''}</span>
          <span class="track-duration" title="Duration">${formatTime(firstTrack.duration_seconds)}</span>
          ${dateStr ? `<span class="track-date" title="Modified">${dateStr}</span>` : ''}
        </span>
        <button class="track-edit-btn" data-track-id="${firstTrack.id}" title="Edit name">${lucideIcon('pencil', 13)}</button>
      </div>`;

    const versionRows = group.tracks.map((t, idx) => {
      const { version } = parseVersion(t.display_name || t.filename);
      const isActive = state.currentIndex === t.originalIndex;
      let indicator;
      if (isActive)         indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
      else if (t.is_changed) indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
      else                   indicator = `<span class="track-indicator-icon">${lucideIcon('dot', 6)}</span>`;

      const versionDateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString() : '';
      const versionFileSize = t.file_size_bytes ? formatFileSize(t.file_size_bytes) : '';
      const positionLabel = `${idx + 1}/${group.tracks.length}`;

      return `
        <div class="track-row track-version-row${isActive ? ' track-active' : ''}" data-index="${t.originalIndex}" data-track-id="${t.id}" data-group-id="${groupId}">
          <span class="track-indicator">${indicator}</span>
          <div class="track-thumb">${thumbHtml(t)}</div>
          <div class="track-info">
            <span class="track-name">
              <span class="track-version-label">${version}</span>
              <span class="track-version-position">${positionLabel}</span>
            </span>
          </div>
          <span class="track-tags"></span>
          <span class="track-sparkline-wrap" title="Waveform">${sparklineSvg(t)}</span>
          <span class="track-metadata">
            <span class="track-format" title="Format">WAV</span>
            <span class="track-filesize" title="File size">${versionFileSize}</span>
            <span class="track-duration" title="Duration">${formatTime(t.duration_seconds)}</span>
            ${versionDateStr ? `<span class="track-date" title="Modified">${versionDateStr}</span>` : ''}
          </span>
          <button class="track-edit-btn" data-track-id="${t.id}" title="Edit name">${lucideIcon('pencil', 13)}</button>
        </div>`;
    }).join('');

    return `${groupHeader}<div class="track-group-versions collapsed" data-group-id="${groupId}">${versionRows}</div>`;
  }).join('');
}

// Wire the chevron toggle on any rendered track-group headers.
function bindGroupHeaders() {
  content.querySelectorAll('.track-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.track-edit-btn')) return;
      const groupId = header.dataset.groupId;
      const versions = content.querySelector(`.track-group-versions[data-group-id="${groupId}"]`);
      const toggle = header.querySelector('.track-group-toggle');
      versions.classList.toggle('collapsed');
      toggle.innerHTML = versions.classList.contains('collapsed')
        ? lucideIcon('chevron-right', 14)
        : lucideIcon('chevron-down', 14);
    });
  });
}

// --- Track list view ---

/**
 * Categorize a Unix timestamp into a time bucket label.
 */
function getTimeBucket(timestamp) {
  if (!timestamp) return 'Older';
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  const day = 86400;

  if (diff < day)      return 'Today';
  if (diff < day * 2)  return 'Yesterday';
  if (diff < day * 7)  return 'This Week';
  if (diff < day * 30) return 'This Month';
  if (diff < day * 90) return 'Last 3 Months';
  return 'Older';
}

const TIME_BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'This Month', 'Last 3 Months', 'Older'];

/**
 * Group tracks into time-based sections.
 * Returns an array of { label, tracks } in chronological order (newest first).
 */
function groupTracksByTime(tracks) {
  const buckets = new Map();
  TIME_BUCKET_ORDER.forEach(label => buckets.set(label, []));

  tracks.forEach((track, index) => {
    const label = getTimeBucket(track.modified_at);
    buckets.get(label).push({ ...track, originalIndex: index });
  });

  // Only return non-empty buckets
  return TIME_BUCKET_ORDER
    .filter(label => buckets.get(label).length > 0)
    .map(label => ({ label, tracks: buckets.get(label) }));
}

export function renderTrackList(tracks) {
  // Only stamp currentView to 'all' if no specific sub-view has been set.
  // Search and other consumers set currentView themselves before calling.
  if (!state.currentView || !['search', 'all'].includes(state.currentView.type)) {
    state.currentView = { type: 'all', params: {} };
  }
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

  // Unique folders and projects
  const folderSet = new Set(tracks.map(t => t.folder_name).filter(Boolean));
  const projectSet = new Set(tracks.map(t => t.project_name).filter(Boolean));
  const totalFileSize = tracks.reduce((sum, t) => sum + (t.file_size_bytes || 0), 0);
  const unexportedCount = state.librarySummary?.total_unexported || 0;

  // Hero identity block + stats strip
  const heroBlock = `
    <div class="library-hero">
      <div class="library-hero-icon">
        ${lucideIcon('arpvs', 104)}
      </div>
      <div class="library-hero-title">ARPvs</div>
    </div>`;

  // Stats strip
  const statsStrip = `
    <div class="stats-strip">
      <div class="stat-item">
        <span class="stat-value">${tracks.length}</span>
        <span class="stat-label">tracks</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${projectSet.size}</span>
        <span class="stat-label">projects</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${folderSet.size}</span>
        <span class="stat-label">folders</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${unexportedCount}</span>
        <span class="stat-label">unexported</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${formatDurationLong(totalDuration)}</span>
        <span class="stat-label">duration</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${formatFileSize(totalFileSize)}</span>
        <span class="stat-label">on disk</span>
      </div>
    </div>`;

  const sortFields = [
    { key: 'name',     label: 'name' },
    { key: 'project',  label: 'project' },
    { key: 'duration', label: 'length' },
    { key: 'date',     label: 'date' },
  ];

  const toolbar = `
    <div class="track-toolbar">
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

  // Group tracks by time when sorted by date (default), otherwise flat list
  let trackListHtml;
  if (state.sortBy === 'date' && !state.sortAsc) {
    const sections = groupTracksByTime(tracks);
    trackListHtml = sections.map(section => {
      const sectionRows = renderGroupedTracksHtml(section.tracks, { showTags: true });
      return `
        <div class="time-section">
          <div class="time-section-header">
            <span class="time-section-label">${section.label}</span>
            <span class="time-section-count">${section.tracks.length}</span>
          </div>
          <div class="track-list">${sectionRows}</div>
        </div>`;
    }).join('');
  } else {
    trackListHtml = `<div class="track-list">${renderGroupedTracksHtml(tracks)}</div>`;
  }

  content.innerHTML = `${heroBlock}${statsStrip}${toolbar}${trackListHtml}`;

  // Sort toggle dropdown
  const sortToggleBtn = document.getElementById('sort-toggle-btn');
  const sortPanel     = document.getElementById('sort-panel');

  sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortPanel.classList.toggle('open');
  });

  // Close any open sort panel on outside click — registered once globally.
  installSortPanelOutsideClose();

  content.querySelectorAll('.sort-panel-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSort(item.dataset.sort);
    });
  });

  bindGroupHeaders();
  bindTrackRows();

  // Hero icon hover — pick a random palette color, persist briefly, then fade back
  const heroIcon = content.querySelector('.library-hero-icon');
  if (heroIcon) {
    let fadeTimer = null;
    const paletteColors = () => [
      getComputedStyle(document.documentElement).getPropertyValue('--warm').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--cool').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--comp').trim(),
    ];
    heroIcon.addEventListener('mouseenter', () => {
      const colors = paletteColors();
      const color = colors[Math.floor(Math.random() * colors.length)];
      const svg = heroIcon.querySelector('svg');
      // Instant color change
      svg.style.transition = 'none';
      svg.style.color = color;
      // Clear any pending fade-back
      if (fadeTimer) clearTimeout(fadeTimer);
    });
    heroIcon.addEventListener('mouseleave', () => {
      const svg = heroIcon.querySelector('svg');
      // Hold the color for 2s, then fade back over 1.5s
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        svg.style.transition = 'color 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
        svg.style.color = '';
      }, 2000);
    });
  }
}

// --- Albums grid ---

// Incremented whenever an album cover is uploaded or removed, appended
// to cover URLs as a cache-buster so the browser actually fetches the
// new image.
let _coverCacheBust = 0;
function coverUrl(album) {
  const base = album.cover_art_url || `/api/albums/${album.id}/cover`;
  return _coverCacheBust ? `${base}?v=${_coverCacheBust}` : base;
}
export function bumpCoverCache() {
  _coverCacheBust = Date.now();
}

/**
 * Re-render whichever view is currently active, fetching fresh data.
 * Preserves the user's location (e.g. stays on the album-expanded view
 * instead of jumping back to the all-tracks list).
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
        const { searchTracks } = await import('./api.js');
        const results = await searchTracks(q);
        state.tracks = results;
        renderTrackList(results);
      } else {
        const all = await fetchTracks();
        state.tracks = sortTracks(all);
        renderTrackList(state.tracks);
      }
      return;
    }
    case 'projects': {
      const { fetchProjects } = await import('./api.js');
      renderProjects(await fetchProjects());
      return;
    }
    case 'unexported': {
      const { fetchUnexportedProjects } = await import('./api.js');
      renderUnexportedProjects(await fetchUnexportedProjects());
      return;
    }
    case 'favorites':
      renderFavorites();
      return;
    case 'all':
    default: {
      const tracks = await fetchTracks();
      state.tracks = sortTracks(tracks);
      renderTrackList(state.tracks);
    }
  }
}

export function renderAlbums(albums) {
  state.currentView = { type: 'albums', params: {} };

  const header = `
    <div class="view-header view-header-with-action">
      <span>Albums</span>
      <button class="edit-btn edit-btn-primary" id="albums-create-btn">
        ${lucideIcon('plus', 13)} New album
      </button>
    </div>`;

  if (!albums.length) {
    content.innerHTML = `
      ${header}
      <div class="empty-state">
        <p>no albums yet</p>
        <p class="text-muted">albums are your playlists — create one to start collecting tracks</p>
        <button class="edit-btn edit-btn-primary empty-state-cta" id="albums-create-empty">
          ${lucideIcon('plus', 13)} Create album
        </button>
      </div>`;
    bindAlbumsCreate(content);
    return;
  }

  const cards = albums.map(a => {
    const trackLabel = `${a.track_count} track${a.track_count !== 1 ? 's' : ''}`;
    const durationLabel = formatTime(a.total_duration || 0);

    return `
    <div class="album-card" data-album-id="${a.id}" data-album-name="${a.name}">
      <div class="album-art">
        <canvas class="album-dither-canvas" data-seed="${a.id}"></canvas>
        <img src="${coverUrl(a)}" alt="${a.name}" loading="lazy" crossorigin="anonymous">
        <div class="album-vinyl">
          <div class="vinyl-groove"></div>
          <div class="vinyl-groove vinyl-groove-2"></div>
          <div class="vinyl-groove vinyl-groove-3"></div>
          <div class="vinyl-label"></div>
        </div>
      </div>
      <div class="album-info">
        <div class="album-name">${a.name}</div>
        <div class="album-meta">
          <span>${trackLabel}</span>
          <span class="album-meta-sep">·</span>
          <span>${durationLabel}</span>
        </div>
      </div>
      <div class="album-controls">
        <button class="album-btn album-btn-edit" title="Edit album" data-album-id="${a.id}">${lucideIcon('pencil', 18)}</button>
        <button class="album-btn album-btn-play" title="Play album">${lucideIcon('play-circle', 22)}</button>
        <button class="album-btn album-btn-info" title="View details">${lucideIcon('chevron-right', 22)}</button>
      </div>
      <div class="album-card-glow"></div>
    </div>`;
  }).join('');

  content.innerHTML = `${header}<div class="card-grid">${cards}</div>`;
  bindAlbumsCreate(content);

  // Lazy-render dither canvases via IntersectionObserver — only generates
  // the dither frame when the card scrolls into view, keeping initial render fast.
  const ditherObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const canvas = entry.target;
      const seed = parseInt(canvas.dataset.seed, 10);
      const size = 300;
      canvas.width = size;
      canvas.height = size;
      renderDitherFrame(canvas, seed);
      canvas.dataset.rendered = '1';
      observer.unobserve(canvas);
    });
  }, { rootMargin: '200px' }); // Start rendering slightly before visible

  content.querySelectorAll('.album-card').forEach(card => {
    const img = card.querySelector('.album-art img');
    const canvas = card.querySelector('.album-dither-canvas');
    const glowEl = card.querySelector('.album-card-glow');

    // Queue canvas for lazy dither rendering
    ditherObserver.observe(canvas);

    img.addEventListener('load', () => {
      // Check if the loaded image is an SVG placeholder (very small or SVG content-type)
      const isSvgPlaceholder = img.naturalWidth <= 200 && img.naturalHeight <= 200;

      if (isSvgPlaceholder) {
        // Hide the placeholder img, show the dither canvas
        img.style.display = 'none';
        canvas.style.display = 'block';
      } else {
        // Real cover art — hide canvas, try color extraction
        canvas.style.display = 'none';
        try {
          const color = extractDominantColor(img);
          if (color) {
            card.style.setProperty('--card-tint', color);
            glowEl.style.background = `radial-gradient(ellipse at bottom, ${color}22 0%, transparent 70%)`;
          }
        } catch (e) { /* cross-origin — ignore */ }
      }
    });

    img.addEventListener('error', () => {
      // Image failed to load — show dither canvas
      img.style.display = 'none';
      canvas.style.display = 'block';
    });

    const playBtn = card.querySelector('.album-btn-play');
    const infoBtn = card.querySelector('.album-btn-info');

    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const albumId = parseInt(card.dataset.albumId, 10);
      const albumName = card.dataset.albumName;

      const data = await fetchAlbumTracks(albumId);
      const { playAlbum } = await import('./player.js');
      playAlbum(data.tracks, albumName);
    });

    infoBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openAlbumView(card);
    });

    const editBtn = card.querySelector('.album-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const albumId = parseInt(card.dataset.albumId, 10);
        const { openEditAlbum } = await import('./edit-album.js');
        openEditAlbum(albumId);
      });
    }

    // Clicking the card itself opens expanded view
    card.addEventListener('click', () => openAlbumView(card));
  });
}

async function openAlbumView(card) {
  const albumId = parseInt(card.dataset.albumId, 10);
  const albumName = card.dataset.albumName;
  const cover = `/api/albums/${albumId}/cover`;

  const data = await fetchAlbumTracks(albumId);
  renderAlbumExpanded(albumName, cover, data.tracks, { albumId });
}

/**
 * Wire the "Create album" buttons in the albums header and empty state.
 * Opens the create-album flow, then refreshes the albums view.
 */
function bindAlbumsCreate(scope) {
  const handlers = async () => {
    const { openCreateAlbum } = await import('./edit-album.js');
    openCreateAlbum(async () => {
      const albums = await fetchAlbums();
      renderAlbums(albums);
    });
  };
  scope.querySelectorAll('#albums-create-btn, #albums-create-empty').forEach(btn => {
    btn.addEventListener('click', handlers);
  });
}

/**
 * Extract a dominant color from an image element using canvas sampling.
 * Returns an rgb() string or null if extraction fails.
 */
function extractDominantColor(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 32; // Sample at low res for speed
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size).data;
  let r = 0, g = 0, b = 0, count = 0;

  // Sample every 4th pixel, skip very dark and very bright pixels
  for (let i = 0; i < data.length; i += 16) {
    const pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const brightness = (pr + pg + pb) / 3;
    if (brightness > 30 && brightness < 220) {
      r += pr; g += pg; b += pb; count++;
    }
  }

  if (count === 0) return null;
  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  // Boost saturation slightly for visual impact
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 20) return null; // Too gray, skip

  return `rgb(${r},${g},${b})`;
}

// --- Album expanded view ---

export function renderAlbumExpanded(albumName, coverUrl, tracks, opts = {}) {
  state.tracks = tracks;
  const { albumId = null } = opts;
  state.currentView = { type: 'album-expanded', params: { albumId, albumName } };
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);

  // Add originalIndex to tracks for grouping
  const tracksWithIndex = tracks.map((t, i) => ({ ...t, originalIndex: i }));
  const rows = tracks.length
    ? renderGroupedTracksHtml(tracksWithIndex, { showTags: false })
    : '';

  const editBtn = albumId != null
    ? `<button class="icon-btn album-expanded-edit" id="album-expanded-edit" title="Edit album" data-tooltip="Edit album">${lucideIcon('pencil', 15)}</button>`
    : '';

  const body = tracks.length
    ? `<div class="track-list">${rows}</div>`
    : `
      <div class="empty-state">
        <p>no tracks in this album yet</p>
        <p class="text-muted">open the edit modal to add tracks from your library</p>
      </div>`;

  content.innerHTML = `
    <div class="album-expanded">
      <button class="back-btn" id="back-to-albums"><span class="back-btn-icon">${lucideIcon('arrow-left', 14)}</span> albums</button>
      <div class="album-expanded-header">
        <div class="album-expanded-art">
          ${ditherCanvasHtml(albumId || 1)}
          <img src="${coverUrl}" alt="${albumName}" crossorigin="anonymous">
        </div>
        <div class="album-expanded-info">
          <div class="album-expanded-name">${albumName}</div>
          <div class="album-expanded-meta">
            ${tracks.length} track${tracks.length !== 1 ? 's' : ''} · ${formatTime(totalDuration)}
          </div>
        </div>
        ${editBtn}
      </div>
      ${body}
    </div>`;

  document.getElementById('back-to-albums').addEventListener('click', async () => {
    const albums = await fetchAlbums();
    renderAlbums(albums);
  });

  const expandedEditBtn = document.getElementById('album-expanded-edit');
  if (expandedEditBtn) {
    expandedEditBtn.addEventListener('click', async () => {
      const { openEditAlbum } = await import('./edit-album.js');
      openEditAlbum(albumId);
    });
  }

  // Hide the <img> layer when the server returned the small SVG placeholder
  // so the dither canvas underneath shows through. Real uploaded art wins.
  const expandedArt = content.querySelector('.album-expanded-art');
  if (expandedArt) {
    const img = expandedArt.querySelector('img');
    img.addEventListener('load', () => {
      const isPlaceholder = img.naturalWidth <= 200 && img.naturalHeight <= 200;
      if (isPlaceholder) img.style.display = 'none';
    });
    img.addEventListener('error', () => { img.style.display = 'none'; });
  }

  bindDitherCanvases(content);
  bindGroupHeaders();
  bindTrackRows();
}

// --- Projects grid ---

export function renderProjects(projects) {
  state.currentView = { type: 'projects', params: {} };
  if (!projects.length) {
    content.innerHTML = `<div class="empty-state"><p>no projects found</p></div>`;
    return;
  }

  const cards = projects.map(p => `
    <div class="project-card" data-project-id="${p.id}">
      <div class="project-name">${p.name}</div>
      <div class="project-meta">${p.folder_name ? p.folder_name + ' · ' : ''}${p.track_count} track${p.track_count !== 1 ? 's' : ''}</div>
    </div>
  `).join('');

  content.innerHTML = `<div class="view-header">Projects</div><div class="card-grid">${cards}</div>`;

  content.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', async () => {
      const projectName = card.querySelector('.project-name').textContent;
      const allTracks = await fetchTracks();
      const projectTracks = allTracks.filter(t => t.project_name === projectName);
      state.tracks = projectTracks;
      renderTrackList(projectTracks);
    });
  });
}

// --- Stub views ---

export function renderFavorites() {
  state.currentView = { type: 'favorites', params: {} };
  content.innerHTML = `
    <div class="empty-state">
      <p>no favorites yet</p>
      <p class="text-muted">click a track to start listening</p>
    </div>`;
}

export function renderUnexportedProjects(projects) {
  state.currentView = { type: 'unexported', params: {} };
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
