/**
 * views/shared.js — Shared rendering helpers for track rows.
 */

import { state } from '../state.js';
import { formatTime, formatFileSize, parseVersion, groupTracksByVersion } from '../core/utils.js';
import { createIcon } from '../core/icons.js';
import { ditherCanvasHtml, bindDitherCanvases } from '../ui/dither-bg.js';
import { openEditTrack } from '../modals/edit-track.js';

const content = document.getElementById('content');

// Injected by main.js so views can trigger playback without a circular dep.
let _playTrack = null;
export function setPlayTrack(fn) { _playTrack = fn; }
export function getPlayTrack() { return _playTrack; }

// --- Icon helper ---

export function lucideIcon(name, size = 16) {
  return createIcon(name, size);
}

// --- Sparkline ---

function seededPeaks(seed, count) {
  const peaks = [];
  let s = seed * 9301 + 49297;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const rand = s / 233280;
    const t = i / count;
    const envelope = Math.sin(t * Math.PI) * 0.7 + 0.2;
    peaks.push(Math.max(0.08, Math.min(1, envelope * (0.5 + rand * 0.8))));
  }
  return peaks;
}

export function sparklineSvg(track, width = 80, height = 20) {
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

// --- Shared helpers ---

export function thumbHtml(track) {
  const seed = (track && (track.project_id || track.id)) || 1;
  return ditherCanvasHtml(seed);
}

export function trackRowHtml(t, i, { showTags = true, displayIdx = null } = {}) {
  const tags = showTags ? (state.trackTags[t.id] || []) : [];
  const tagHtml = tags.map(tag =>
    `<span class="tag-pill" style="--tag-color: ${tag.color || '#555'}">${tag.name}</span>`
  ).join('');

  const subParts = [];
  if (t.project_name) subParts.push(t.project_name);
  if (t.folder_name)  subParts.push(t.folder_name);
  const subText = subParts.join('<span class="track-sub-sep">/</span>');

  const isActive = state.currentIndex === i;
  const idx = displayIdx != null ? displayIdx : (i + 1);
  let indicator = '';
  if (isActive) {
    indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
  } else if (t.is_changed) {
    indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
  } else {
    indicator = `<span class="track-idx">${String(idx).padStart(3, '0')}</span>`;
  }

  const { name: trackName } = parseVersion(t.display_name || t.filename);
  const dateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
  const fileSizeStr = t.file_size_bytes ? formatFileSize(t.file_size_bytes) : '';

  return `
    <div class="track-row${isActive ? ' track-active' : ''}" data-index="${i}" data-track-id="${t.id}">
      <span class="track-type-indicator">·</span>
      <span class="track-indicator">${indicator}</span>
      <div class="track-thumb">${thumbHtml(t)}</div>
      <div class="track-info">
        <span class="track-name">${trackName}</span>
        ${subText ? `<span class="track-sub">${subText}</span>` : ''}
      </div>
      <div class="track-version-badge">
        <span class="track-versions-tag">1 ver</span>
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

export function renderGroupedTracksHtml(tracks, { showTags = true } = {}) {
  const groups = groupTracksByVersion(tracks);
  let runningIdx = 0;

  return groups.map((group, groupIdx) => {
    if (!group.hasVersions) {
      const t = group.tracks[0];
      runningIdx++;
      return trackRowHtml(t, t.originalIndex, { showTags, displayIdx: runningIdx });
    }

    runningIdx++;
    const groupNum = runningIdx;
    const groupId = `version-group-${groupIdx}`;
    const firstTrack = group.tracks[0];
    const { name: trackName } = parseVersion(firstTrack.display_name || firstTrack.filename);

    const subParts = [];
    if (firstTrack.project_name) subParts.push(firstTrack.project_name);
    if (firstTrack.folder_name)  subParts.push(firstTrack.folder_name);
    const subText = subParts.join('<span class="track-sub-sep">/</span>');
    const dateStr = firstTrack.modified_at ? new Date(firstTrack.modified_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

    const isGroupActive = group.tracks.some(t => state.currentIndex === t.originalIndex);
    const groupIndicator = isGroupActive
      ? `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`
      : `<span class="track-idx">${String(groupNum).padStart(3, '0')}</span>`;

    const groupHeader = `
      <div class="track-group-header${isGroupActive ? ' track-active' : ''}" data-group-id="${groupId}" data-track-id="${firstTrack.id}">
        <span class="track-type-indicator track-group-toggle-icon">${lucideIcon('chevron-right', 10)}</span>
        <span class="track-indicator">${groupIndicator}</span>
        <div class="track-thumb">${thumbHtml(firstTrack)}</div>
        <div class="track-info">
          <span class="track-name">${trackName}</span>
          ${subText ? `<span class="track-sub">${subText}</span>` : ''}
        </div>
        <div class="track-version-badge">
          <span class="track-versions-tag">${group.tracks.length} ver</span>
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
      const versionIdx = `${String(groupNum).padStart(3, '0')}.${idx + 1}`;
      let indicator;
      if (isActive)          indicator = `<span class="track-indicator-icon">${lucideIcon('play', 14)}</span>`;
      else if (t.is_changed) indicator = `<span class="track-indicator-icon track-indicator-changed">${lucideIcon('edit', 14)}</span>`;
      else                   indicator = `<span class="track-idx">${versionIdx}</span>`;

      const versionDateStr = t.modified_at ? new Date(t.modified_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
      const versionFileSize = t.file_size_bytes ? formatFileSize(t.file_size_bytes) : '';

      return `
        <div class="track-row track-version-row${isActive ? ' track-active' : ''}" data-index="${t.originalIndex}" data-track-id="${t.id}" data-group-id="${groupId}">
          <span class="track-type-indicator"></span>
          <span class="track-indicator">${indicator}</span>
          <div class="track-thumb">${thumbHtml(t)}</div>
          <div class="track-info">
            <span class="track-name">
              <span class="track-version-label">${version}</span>
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

// --- Binding helpers ---

export function bindTrackRows() {
  content.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.track-edit-btn')) return;
      _playTrack?.(parseInt(row.dataset.index, 10));
    });
  });
  bindEditButtons();
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

export function bindGroupHeaders() {
  content.querySelectorAll('.track-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.track-edit-btn')) return;
      const groupId = header.dataset.groupId;
      const versions = content.querySelector(`.track-group-versions[data-group-id="${groupId}"]`);
      const toggleIcon = header.querySelector('.track-group-toggle-icon');
      versions.classList.toggle('collapsed');
      const isExpanded = !versions.classList.contains('collapsed');
      header.classList.toggle('expanded', isExpanded);
      if (toggleIcon) {
        toggleIcon.innerHTML = isExpanded
          ? lucideIcon('chevron-down', 10)
          : lucideIcon('chevron-right', 10);
      }
    });
  });
}
