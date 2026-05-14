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

  const { name: trackName, version } = parseVersion(t.display_name || t.filename);
  const versionText = version || 'version 1';
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
        <span class="track-version-selected">${versionText}</span>
      </div>
      <span class="track-tags">${tagHtml}</span>
      <span class="track-sparkline-wrap" data-tooltip="Waveform">${sparklineSvg(t)}</span>
      <span class="track-metadata">
        <span class="track-format" data-tooltip="Format">WAV</span>
        <span class="track-filesize" data-tooltip="File size">${fileSizeStr}</span>
        <span class="track-duration" data-tooltip="Duration">${formatTime(t.duration_seconds)}</span>
        ${dateStr ? `<span class="track-date" data-tooltip="Modified">${dateStr}</span>` : ''}
      </span>
      <button class="track-edit-btn" data-track-id="${t.id}" data-tooltip="Edit name">${lucideIcon('pencil', 13)}</button>
    </div>`;
}

export function renderGroupedTracksHtml(tracks, { showTags = true } = {}) {
  // Just render all tracks individually, no grouping
  return tracks.map((t, i) => {
    const displayIdx = t.originalIndex !== undefined ? t.originalIndex + 1 : i + 1;
    return trackRowHtml(t, t.originalIndex !== undefined ? t.originalIndex : i, { showTags, displayIdx });
  }).join('');
}

// --- Binding helpers ---

export function bindTrackRows() {
  content.querySelectorAll('.track-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.track-edit-btn')) return;
      _playTrack?.(parseInt(row.dataset.trackId, 10));
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

let _versionSelectorsInitialized = false;

export function resetVersionSelectorsFlag() {
  _versionSelectorsInitialized = false;
}

export function bindGroupHeaders() {
  // This function is no longer needed for version groups, but keeping it for compatibility
  // In case there are other group types in the future
}
