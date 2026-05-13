/**
 * views/albums.js — Albums grid and album expanded view.
 */

import { state } from '../state.js';
import { formatTime, formatFileSize } from '../core/utils.js';
import { fetchAlbums, fetchAlbumTracks } from '../core/api.js';
import { renderDitherFrame, ditherCanvasHtml, bindDitherCanvases } from '../ui/dither-bg.js';
import { lucideIcon, renderGroupedTracksHtml, bindGroupHeaders, bindTrackRows } from './shared.js';

const content = document.getElementById('content');

// --- Cover cache busting ---

let _coverCacheBust = 0;
function coverUrl(album) {
  const base = album.cover_art_url || `/api/albums/${album.id}/cover`;
  return _coverCacheBust ? `${base}?v=${_coverCacheBust}` : base;
}
export function bumpCoverCache() {
  _coverCacheBust = Date.now();
}

// --- Albums index ---

export function renderAlbums(albums) {
  state.currentView = { type: 'albums', params: {} };

  if (!albums.length) {
    content.innerHTML = `
      <div class="library-hero">
        <div class="library-hero-title">Albums</div>
      </div>
      <div class="empty-state">
        <p>no albums yet</p>
        <p class="text-muted">create one to start collecting tracks</p>
        <button class="edit-btn edit-btn-primary empty-state-cta" id="albums-create-empty">
          ${lucideIcon('plus', 13)} New album
        </button>
      </div>`;
    bindAlbumsCreate(content);
    return;
  }

  const totalDuration = albums.reduce((sum, a) => sum + (a.total_duration || 0), 0);
  const totalTracks = albums.reduce((sum, a) => sum + (a.track_count || 0), 0);

  const header = `
    <div class="library-hero">
      <div class="library-hero-meta">
        <span class="hero-meta-item">${String(albums.length).padStart(3, '0')} albums</span>
        <span class="hero-meta-item">${String(totalTracks).padStart(3, '0')} tracks</span>
        <span class="hero-meta-item">${formatTime(totalDuration)} total</span>
        <span class="hero-meta-item">PCM / WAV</span>
        <span class="hero-meta-item">44.1 kHz</span>
      </div>
      <div class="library-hero-title">Albums</div>
    </div>`;

  const specSheet = `
    <div class="library-spec-sheet">
      <div class="spec-row"><span class="spec-label">Albums</span><span class="spec-value">${String(albums.length).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Tracks</span><span class="spec-value">${String(totalTracks).padStart(3, '0')}</span></div>
      <div class="spec-row"><span class="spec-label">Duration</span><span class="spec-value">${formatTime(totalDuration)}</span></div>
      <div class="spec-divider"></div>
      <div class="spec-action">
        <button class="edit-btn edit-btn-primary" id="albums-create-btn">
          ${lucideIcon('plus', 13)} New album
        </button>
      </div>
    </div>`;

  const rows = albums.map((a, i) => {
    const idx = String(i + 1).padStart(3, '0');
    const trackCount = String(a.track_count).padStart(3, '0');
    const duration = formatTime(a.total_duration || 0);
    const cover = coverUrl(a);

    return `
      <div class="album-card" data-album-id="${a.id}" data-album-name="${a.name}">
        <div class="album-card-art">
          <canvas class="album-dither-canvas" data-seed="${a.id}"></canvas>
          <img src="${cover}" alt="${a.name}" loading="lazy" crossorigin="anonymous">
        </div>
        <div class="album-card-info">
          <span class="album-card-name">${a.name}</span>
          <span class="album-card-meta">${idx} / ${trackCount} TRK / ${duration}</span>
        </div>
      </div>`;
  }).join('');

  content.innerHTML = `
    ${header}
    <div class="library-body">
      ${specSheet}
      <div class="library-tracks">
        <div class="album-grid">${rows}</div>
      </div>
    </div>`;

  bindAlbumsCreate(content);

  // Handle album art (dither fallback)
  content.querySelectorAll('.album-card').forEach(card => {
    const img = card.querySelector('.album-card-art img');
    const canvas = card.querySelector('.album-dither-canvas');

    if (img && canvas) {
      const seed = parseInt(canvas.dataset.seed, 10);
      canvas.width = 300;
      canvas.height = 300;
      renderDitherFrame(canvas, seed);

      img.addEventListener('load', () => {
        const isSvgPlaceholder = img.naturalWidth <= 200 && img.naturalHeight <= 200;
        if (isSvgPlaceholder) {
          img.style.display = 'none';
          canvas.style.display = 'block';
        } else {
          canvas.style.display = 'none';
        }
      });

      img.addEventListener('error', () => {
        img.style.display = 'none';
        canvas.style.display = 'block';
      });
    }

    card.addEventListener('click', async (e) => {
      if (e.target.closest('.album-row-btn')) return;
      const albumId = parseInt(card.dataset.albumId, 10);
      const albumName = card.dataset.albumName;
      const cover = `/api/albums/${albumId}/cover`;
      const data = await fetchAlbumTracks(albumId);
      renderAlbumExpanded(albumName, cover, data.tracks, { albumId });
    });
  });
}

function bindAlbumsCreate(scope) {
  const handlers = async () => {
    const { openCreateAlbum } = await import('../modals/edit-album.js');
    openCreateAlbum(async () => {
      const albums = await fetchAlbums();
      renderAlbums(albums);
    });
  };
  scope.querySelectorAll('#albums-create-btn, #albums-create-empty').forEach(btn => {
    btn.addEventListener('click', handlers);
  });
}

// --- Album expanded ---

export function renderAlbumExpanded(albumName, coverSrc, tracks, opts = {}) {
  state.tracks = tracks;
  const { albumId = null } = opts;
  state.currentView = { type: 'album-expanded', params: { albumId, albumName } };
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
  const totalSize = tracks.reduce((sum, t) => sum + (t.file_size_bytes || 0), 0);

  const tracksWithIndex = tracks.map((t, i) => ({ ...t, originalIndex: i }));
  const rows = tracks.length ? renderGroupedTracksHtml(tracksWithIndex, { showTags: false }) : '';

  const editBtn = albumId != null
    ? `<button class="icon-btn album-expanded-edit" id="album-expanded-edit" title="Edit album">${lucideIcon('pencil', 15)}</button>`
    : '';

  const catalogRef = albumId != null ? String(albumId).padStart(3, '0') : '---';

  const newestTrack = tracks.reduce((newest, t) => (!newest || (t.modified_at || 0) > (newest.modified_at || 0)) ? t : newest, null);
  const lastModified = newestTrack && newestTrack.modified_at
    ? new Date(newestTrack.modified_at * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const body = tracks.length
    ? `<div class="track-list">${rows}</div>`
    : `<div class="empty-state"><p>no tracks in this album yet</p><p class="text-muted">open the edit modal to add tracks</p></div>`;

  content.innerHTML = `
    <div class="album-expanded">
      <button class="back-btn" id="back-to-albums"><span class="back-btn-icon">${lucideIcon('arrow-left', 12)}</span> albums</button>
      <div class="album-expanded-hero">
        <div class="album-expanded-art">
          ${ditherCanvasHtml(albumId || 1)}
          <img src="${coverSrc}" alt="${albumName}" crossorigin="anonymous">
        </div>
        <div class="album-expanded-hero-info">
          <div class="album-expanded-name">${albumName}</div>
          <div class="album-spec-sheet">
            <div class="spec-row"><span class="spec-label">ID</span><span class="spec-value">${catalogRef}</span></div>
            <div class="spec-row"><span class="spec-label">Tracks</span><span class="spec-value">${String(tracks.length).padStart(3, '0')}</span></div>
            <div class="spec-row"><span class="spec-label">Duration</span><span class="spec-value">${formatTime(totalDuration)}</span></div>
            <div class="spec-row"><span class="spec-label">Size</span><span class="spec-value">${formatFileSize(totalSize)}</span></div>
            <div class="spec-row"><span class="spec-label">Format</span><span class="spec-value">WAV / PCM</span></div>
            <div class="spec-row"><span class="spec-label">Modified</span><span class="spec-value">${lastModified}</span></div>
          </div>
          ${editBtn}
        </div>
      </div>
      <div class="album-expanded-body">
        <div class="album-expanded-tracks">
          ${body}
        </div>
      </div>
    </div>`;

  document.getElementById('back-to-albums').addEventListener('click', async () => {
    const albums = await fetchAlbums();
    renderAlbums(albums);
  });

  const expandedEditBtn = document.getElementById('album-expanded-edit');
  if (expandedEditBtn) {
    expandedEditBtn.addEventListener('click', async () => {
      const { openEditAlbum } = await import('../modals/edit-album.js');
      openEditAlbum(albumId);
    });
  }

  const expandedArt = content.querySelector('.album-expanded-art');
  if (expandedArt) {
    const img = expandedArt.querySelector('img');
    img.addEventListener('load', () => {
      if (img.naturalWidth <= 200 && img.naturalHeight <= 200) img.style.display = 'none';
    });
    img.addEventListener('error', () => { img.style.display = 'none'; });
  }

  bindDitherCanvases(content);
  bindGroupHeaders();
  bindTrackRows();
}
