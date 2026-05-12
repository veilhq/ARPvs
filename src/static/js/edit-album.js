/**
 * edit-album.js — Album rename + cover + track curation modal.
 *
 * All edits are nondestructive: the folder name and auto-detected cover
 * art stay intact. Overrides live in albums.display_name_override and
 * albums.cover_override_path. Curated tracks go through album_tracks.
 *
 * An album starts in "auto mode" (all tracks under its projects) and
 * can be promoted to "curated" by saving a non-auto track list.
 * Clearing the curation reverts to auto.
 */

import {
  fetchAlbumTracks,
  updateAlbum,
  uploadAlbumCover,
  deleteAlbumCover,
  setAlbumTracks,
} from './api.js';
import { createIcon } from './icons.js';
import { formatTime, parseVersion } from './utils.js';

let modalEl = null;
let onSavedCallback = null;

export function onAlbumSaved(fn) { onSavedCallback = fn; }

export async function openEditAlbum(albumId) {
  // We need the album metadata itself (name, override state). Fetch
  // albums list and match — simpler than a per-album GET.
  const [albumsResp, tracksResp] = await Promise.all([
    fetch('/api/albums').then(r => r.ok ? r.json() : []),
    fetchAlbumTracks(albumId),
  ]);
  const album = albumsResp.find(a => a.id === albumId);
  if (!album) return;

  const state = {
    album,
    autoTracks: tracksResp.auto_tracks,
    curatedIds: tracksResp.is_curated
      ? [...tracksResp.curated_ids]
      : tracksResp.auto_tracks.map(t => t.id), // seed curation with current auto list
    wasCurated: tracksResp.is_curated,
    coverBust: 0,
  };

  buildModal(state);
}

function closeModal() {
  if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
  modalEl = null;
}

function buildModal(s) {
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-overlay';
  overlay.innerHTML = `
    <div class="edit-modal edit-modal-lg" role="dialog" aria-label="Edit album">
      <div class="edit-modal-header">
        <span class="edit-modal-title">Edit Album</span>
        <button class="edit-modal-close" aria-label="Close">${createIcon('x', 16)}</button>
      </div>
      <div class="edit-modal-body">
        <div class="album-edit-grid">
          <div class="album-edit-cover">
            <div class="album-edit-cover-preview">
              <img id="album-cover-preview" src="${coverSrc(s)}" alt="cover">
            </div>
            <div class="album-edit-cover-actions">
              <label class="edit-btn edit-btn-ghost" for="album-cover-file">
                ${createIcon('upload', 13)} Upload
              </label>
              <input type="file" id="album-cover-file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" hidden>
              <button class="edit-btn edit-btn-ghost" id="album-cover-reset" title="Use folder-detected art">
                ${createIcon('rotate-ccw', 13)} Reset
              </button>
            </div>
            <div class="album-edit-cover-hint">
              ${s.album.cover_override_path
                ? '<span class="pill-ok">custom</span> overriding folder art'
                : 'using folder-detected art'}
            </div>
          </div>

          <div class="album-edit-fields">
            <div class="edit-field">
              <label for="album-edit-name">Display Name</label>
              <input type="text" id="album-edit-name" value="${escapeHtml(s.album.name)}" autocomplete="off">
              <div class="edit-field-hint">
                Folder: <code>${escapeHtml(folderLabel(s.album.path))}</code>
              </div>
              ${s.album.display_name_override ? `
                <div class="edit-field-hint edit-field-hint-muted">
                  Default: <code>${escapeHtml(s.album.name_default || '')}</code>
                </div>` : ''}
            </div>

            <div class="edit-field">
              <div class="track-picker-header">
                <label>Tracks</label>
                <span class="track-picker-mode" id="track-picker-mode">
                  ${s.wasCurated ? 'curated' : 'auto (all tracks)'}
                </span>
                ${s.wasCurated ? `
                  <button class="edit-btn edit-btn-ghost edit-btn-xs" id="album-tracks-reset" title="Revert to auto mode">
                    ${createIcon('rotate-ccw', 12)} Reset to auto
                  </button>` : ''}
              </div>
              <div class="track-picker-hint">
                Drag to reorder. Toggle to include or exclude specific versions.
              </div>
              <ul class="track-picker-list" id="track-picker-list">
                ${renderPickerRows(s)}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="edit-modal-footer">
        ${s.album.display_name_override ? `
          <button class="edit-btn edit-btn-ghost" id="album-name-reset" title="Restore folder name">
            ${createIcon('rotate-ccw', 13)} Reset name
          </button>` : '<span></span>'}
        <div class="edit-modal-actions">
          <button class="edit-btn edit-btn-ghost" id="album-edit-cancel">Cancel</button>
          <button class="edit-btn edit-btn-primary" id="album-edit-save">Save</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  modalEl = overlay;

  wireModal(overlay, s);
}

// --- Rendering ---

function coverSrc(s) {
  const base = `/api/albums/${s.album.id}/cover`;
  return s.coverBust ? `${base}?v=${s.coverBust}` : base;
}

function folderLabel(path) {
  if (!path) return '';
  return path.replace(/\\/g, '/').split('/').slice(-1)[0] || path;
}

function renderPickerRows(s) {
  // Union of auto tracks and any curated tracks not in auto (e.g. from
  // another folder). Auto tracks determine the pool; curated order wins.
  const autoIds = new Set(s.autoTracks.map(t => t.id));
  const autoById = new Map(s.autoTracks.map(t => [t.id, t]));
  const curatedSet = new Set(s.curatedIds);

  // Ordered list: curated first (in curation order), then any auto tracks
  // not yet included.
  const ordered = [];
  s.curatedIds.forEach(id => {
    const t = autoById.get(id);
    if (t) ordered.push(t);
  });
  s.autoTracks.forEach(t => {
    if (!curatedSet.has(t.id)) ordered.push(t);
  });

  return ordered.map((t, idx) => {
    const included = curatedSet.has(t.id);
    const label = t.display_name || t.filename;
    const { name: baseName, version } = parseVersion(label);
    const sub = t.project_name ? `<span class="track-picker-sub">${escapeHtml(t.project_name)}</span>` : '';
    const versionBadge = version ? `<span class="track-picker-version">${escapeHtml(version)}</span>` : '';
    return `
      <li class="track-picker-row${included ? ' included' : ''}" draggable="true" data-track-id="${t.id}">
        <span class="track-picker-grip">${createIcon('grip-vertical', 12)}</span>
        <button class="track-picker-toggle" data-track-id="${t.id}" title="${included ? 'Remove from album' : 'Add to album'}">
          ${included ? createIcon('check', 13) : createIcon('plus', 13)}
        </button>
        <span class="track-picker-name">
          ${escapeHtml(baseName)}
          ${versionBadge}
        </span>
        ${sub}
        <span class="track-picker-duration">${formatTime(t.duration_seconds)}</span>
      </li>`;
  }).join('');
}

function refreshPickerList(overlay, s) {
  const list = overlay.querySelector('#track-picker-list');
  list.innerHTML = renderPickerRows(s);
  wirePicker(overlay, s);

  // Update the mode label
  const mode = overlay.querySelector('#track-picker-mode');
  const curatedEqualsAuto = arraysEqual(s.curatedIds, s.autoTracks.map(t => t.id));
  mode.textContent = curatedEqualsAuto ? 'auto (all tracks)' : 'curated';
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Wiring ---

function wireModal(overlay, s) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('.edit-modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#album-edit-cancel').addEventListener('click', closeModal);

  const nameInput = overlay.querySelector('#album-edit-name');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Name reset
  const nameReset = overlay.querySelector('#album-name-reset');
  if (nameReset) {
    nameReset.addEventListener('click', async () => {
      await updateAlbum(s.album.id, { display_name: null });
      closeModal();
      onSavedCallback?.({ coverChanged: false });
    });
  }

  // Cover upload
  const fileInput = overlay.querySelector('#album-cover-file');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const result = await uploadAlbumCover(s.album.id, file);
    if (result) {
      s.coverBust = Date.now();
      s.album.cover_override_path = 'uploaded';
      const preview = overlay.querySelector('#album-cover-preview');
      preview.src = coverSrc(s);
      const hint = overlay.querySelector('.album-edit-cover-hint');
      hint.innerHTML = '<span class="pill-ok">custom</span> overriding folder art';
    }
    fileInput.value = '';
  });

  // Cover reset
  overlay.querySelector('#album-cover-reset').addEventListener('click', async () => {
    const result = await deleteAlbumCover(s.album.id);
    if (result) {
      s.coverBust = Date.now();
      s.album.cover_override_path = null;
      const preview = overlay.querySelector('#album-cover-preview');
      preview.src = coverSrc(s);
      const hint = overlay.querySelector('.album-edit-cover-hint');
      hint.textContent = 'using folder-detected art';
    }
  });

  // Track picker wiring (toggle + drag)
  wirePicker(overlay, s);

  // Reset-to-auto button
  const tracksReset = overlay.querySelector('#album-tracks-reset');
  if (tracksReset) {
    tracksReset.addEventListener('click', () => {
      s.curatedIds = s.autoTracks.map(t => t.id);
      s.wasCurated = false;
      // Also re-render so the "Reset to auto" button disappears
      const list = overlay.querySelector('#track-picker-list');
      list.innerHTML = renderPickerRows(s);
      wirePicker(overlay, s);
      const modeRow = overlay.querySelector('.track-picker-header');
      const oldBtn = modeRow.querySelector('#album-tracks-reset');
      if (oldBtn) oldBtn.remove();
      overlay.querySelector('#track-picker-mode').textContent = 'auto (all tracks)';
    });
  }

  // Save
  overlay.querySelector('#album-edit-save').addEventListener('click', async () => {
    const newName = nameInput.value.trim();
    await updateAlbum(s.album.id, {
      display_name: newName && newName !== (s.album.name_default || '') ? newName : (newName || null),
    });

    // Only push curation if it actually differs from auto
    const autoIds = s.autoTracks.map(t => t.id);
    const curatedEqualsAuto = arraysEqual(s.curatedIds, autoIds);
    const idsToSend = curatedEqualsAuto ? [] : s.curatedIds;
    await setAlbumTracks(s.album.id, idsToSend);

    closeModal();
    onSavedCallback?.({ coverChanged: s.coverBust > 0 });
  });
}

function wirePicker(overlay, s) {
  const list = overlay.querySelector('#track-picker-list');

  // Toggle inclusion
  list.querySelectorAll('.track-picker-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.trackId, 10);
      const idx = s.curatedIds.indexOf(id);
      if (idx >= 0) {
        s.curatedIds.splice(idx, 1);
      } else {
        s.curatedIds.push(id);
      }
      refreshPickerList(overlay, s);
    });
  });

  // Drag-to-reorder. Only reorders entries that are currently included.
  let dragId = null;
  list.querySelectorAll('.track-picker-row').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      dragId = parseInt(row.dataset.trackId, 10);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragId = null;
      list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragId == null) return;
      const target = row;
      if (target.dataset.trackId && parseInt(target.dataset.trackId, 10) !== dragId) {
        list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
        target.classList.add('drop-target');
      }
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragId == null) return;
      const targetId = parseInt(row.dataset.trackId, 10);
      if (targetId === dragId) return;
      reorderCurated(s, dragId, targetId);
      refreshPickerList(overlay, s);
    });
  });
}

function reorderCurated(s, dragId, targetId) {
  // Only reorder among currently-curated tracks. If the dragged item
  // isn't curated, dropping inserts it at the target's position.
  const curIdx = s.curatedIds.indexOf(dragId);
  if (curIdx >= 0) s.curatedIds.splice(curIdx, 1);

  const targetIdx = s.curatedIds.indexOf(targetId);
  if (targetIdx >= 0) {
    s.curatedIds.splice(targetIdx, 0, dragId);
  } else {
    s.curatedIds.push(dragId);
  }
}

// --- utils ---

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
