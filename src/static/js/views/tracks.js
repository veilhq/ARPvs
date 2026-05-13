/**
 * views/tracks.js — All Tracks view rendering and sort logic.
 */

import { state } from '../state.js';
import { formatDurationLong, formatFileSize } from '../core/utils.js';
import { lucideIcon, renderGroupedTracksHtml, bindGroupHeaders, bindTrackRows } from './shared.js';

const content = document.getElementById('content');

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

// --- Sort panel outside-click (registered once) ---

let _sortOutsideCloseInstalled = false;
function installSortPanelOutsideClose() {
  if (_sortOutsideCloseInstalled) return;
  _sortOutsideCloseInstalled = true;
  document.addEventListener('click', () => {
    const panel = document.getElementById('sort-panel');
    if (panel) panel.classList.remove('open');
  });
}

// --- Time bucketing ---

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

function groupTracksByTime(tracks) {
  const buckets = new Map();
  TIME_BUCKET_ORDER.forEach(label => buckets.set(label, []));

  tracks.forEach((track, index) => {
    const label = getTimeBucket(track.modified_at);
    buckets.get(label).push({ ...track, originalIndex: index });
  });

  return TIME_BUCKET_ORDER
    .filter(label => buckets.get(label).length > 0)
    .map(label => ({ label, tracks: buckets.get(label) }));
}

// --- Render ---

export function renderTrackList(tracks) {
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

  const folderSet = new Set(tracks.map(t => t.folder_name).filter(Boolean));
  const projectSet = new Set(tracks.map(t => t.project_name).filter(Boolean));
  const totalFileSize = tracks.reduce((sum, t) => sum + (t.file_size_bytes || 0), 0);
  const unexportedCount = state.librarySummary?.total_unexported || 0;
  const scanDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });

  const heroBlock = `
    <div class="library-hero">
      <div class="library-hero-meta">
        <span class="hero-meta-item">PCM / WAV</span>
        <span class="hero-meta-item">44.1 kHz</span>
        <span class="hero-meta-item">24-bit</span>
        <span class="hero-meta-item">${formatFileSize(totalFileSize)} on disk</span>
        <span class="hero-meta-item">${String(tracks.length).padStart(3, '0')} files indexed</span>
        <span class="hero-meta-item">scan ${scanDate}</span>
        <span class="hero-meta-item">${String(projectSet.size).padStart(3, '0')} projects</span>
        <span class="hero-meta-item">${String(folderSet.size).padStart(3, '0')} folders</span>
      </div>
      <div class="library-hero-title">All Tracks</div>
    </div>`;

  const sortFields = [
    { key: 'name',     label: 'Name' },
    { key: 'project',  label: 'Project' },
    { key: 'duration', label: 'Length' },
    { key: 'date',     label: 'Date' },
  ];

  const sortIcon = state.sortAsc ? lucideIcon('arrow-up', 10) : lucideIcon('arrow-down', 10);

  const sortOptions = sortFields.map(f => `
    <button class="sort-option${state.sortBy === f.key ? ' sort-active' : ''}" data-sort="${f.key}">
      <span>${f.label}</span>
      ${state.sortBy === f.key ? `<span class="sort-option-arrow">${sortIcon}</span>` : ''}
    </button>
  `).join('');

  const specSheet = `
    <div class="library-spec-sheet">
      <div class="spec-row"><span class="spec-label">Tracks</span><span class="spec-value">${String(tracks.length).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Projects</span><span class="spec-value">${String(projectSet.size).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Folders</span><span class="spec-value">${String(folderSet.size).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Unexported</span><span class="spec-value">${String(unexportedCount).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Duration</span><span class="spec-value">${formatDurationLong(totalDuration)}</span></div>
      <div class="spec-row"><span class="spec-label">On Disk</span><span class="spec-value">${formatFileSize(totalFileSize)}</span></div>
      <div class="spec-row"><span class="spec-label">Scan</span><span class="spec-value">${scanDate}</span></div>
      <div class="spec-divider"></div>
      <div class="spec-section-label">Sort</div>
      <div class="sort-options">${sortOptions}</div>
    </div>`;

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

  content.innerHTML = `${heroBlock}<div class="library-body">${specSheet}<div class="library-tracks">${trackListHtml}</div></div>`;

  // Sort options in left sidebar
  content.querySelectorAll('.sort-option').forEach(btn => {
    btn.addEventListener('click', () => {
      handleSort(btn.dataset.sort);
    });
  });

  bindGroupHeaders();
  bindTrackRows();
}
