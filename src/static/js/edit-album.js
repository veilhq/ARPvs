/**
 * edit-album.js — Album create + edit modals.
 *
 * Albums are user-created playlists. Editing covers:
 *   - Rename (writes albums.name)
 *   - Cover upload/reset (user-provided image; otherwise a placeholder)
 *   - Track picker — search/browse every track in the library, toggle
 *     inclusion, drag-to-reorder. Saves to album_tracks.
 *   - Per-album track rename (album_tracks.display_name). Preserved.
 *   - Delete album
 *
 * All edits are nondestructive: tracks themselves are never touched,
 * files on disk are never renamed.
 */

import {
  createAlbum,
  deleteAlbum,
  fetchAlbumTracks,
  fetchTracks,
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

// ============================================================================
// Create modal
// ============================================================================

/**
 * Open the create-album modal. Calls `onCreated(album)` after success so
 * the caller can refresh its view.
 */
export function openCreateAlbum(onCreated) {
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-overlay';
  overlay.innerHTML = `
    <div class="edit-modal" role="dialog" aria-label="Create album">
      <div class="edit-modal-header">
        <span class="edit-modal-title">New Album</span>
        <button class="edit-modal-close" aria-label="Close">${createIcon('x', 16)}</button>
      </div>
      <div class="edit-modal-body">
        <div class="edit-field">
          <label for="album-create-name">Name</label>
          <input type="text" id="album-create-name" placeholder="My Album" autocomplete="off" autofocus>
          <div class="edit-field-hint">You can add tracks after creating.</div>
        </div>
      </div>
      <div class="edit-modal-footer">
        <span></span>
        <div class="edit-modal-actions">
          <button class="edit-btn edit-btn-ghost" id="album-create-cancel">Cancel</button>
          <button class="edit-btn edit-btn-primary" id="album-create-submit">Create</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  modalEl = overlay;

  const nameInput = overlay.querySelector('#album-create-name');
  const submitBtn = overlay.querySelector('#album-create-submit');

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector('.edit-modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#album-create-cancel').addEventListener('click', closeModal);

  const submit = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    submitBtn.disabled = true;
    const album = await createAlbum(name);
    if (album) {
      closeModal();
      await onCreated?.(album);
    } else {
      submitBtn.disabled = false;
    }
  };

  submitBtn.addEventListener('click', submit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') closeModal();
  });

  setTimeout(() => nameInput.focus(), 0);
}

// ============================================================================
// Edit modal
// ============================================================================

export async function openEditAlbum(albumId) {
  const [albumsResp, tracksResp, allTracks] = await Promise.all([
    fetch('/api/albums').then(r => r.ok ? r.json() : []),
    fetchAlbumTracks(albumId),
    fetchTracks(),
  ]);
  const album = albumsResp.find(a => a.id === albumId);
  if (!album) return;

  const memberTracks = tracksResp.tracks || [];

  const s = {
    album,
    // Every track in the library, used as the picker source.
    allTracks,
    // Current ordered selection for this album. The user toggles/reorders this.
    memberIds: memberTracks.map(t => t.id),
    // Snapshot at open time so we only PUT when the user actually changed things.
    initialMemberIds: memberTracks.map(t => t.id),
    // Search filter in the picker.
    filter: '',
    coverBust: 0,
    hasCover: Boolean(album.cover_path),
  };

  buildEditModal(s);
}

function closeModal() {
  if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
  modalEl = null;
}

// --- Change detection ---

function tracksDirty(s) {
  return !sameOrder(s.memberIds, s.initialMemberIds);
}

function sameOrder(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Rendering ---

function buildEditModal(s) {
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
              <button class="edit-btn edit-btn-ghost" id="album-cover-reset" title="Remove cover">
                ${createIcon('rotate-ccw', 13)} Reset
              </button>
            </div>
            <div class="album-edit-cover-hint" id="album-cover-hint">
              ${coverHint(s)}
            </div>
          </div>

          <div class="album-edit-fields">
            <div class="edit-field">
              <label for="album-edit-name">Name</label>
              <input type="text" id="album-edit-name" value="${escapeHtml(s.album.name)}" autocomplete="off">
            </div>

            <div class="edit-field">
              <div class="track-picker-header">
                <label>Tracks</label>
                <span class="track-picker-mode" id="track-picker-count">${memberCountLabel(s)}</span>
              </div>
              <div class="track-picker-search">
                <input type="text" id="track-picker-filter" placeholder="Search tracks..." autocomplete="off">
              </div>
              <div class="track-picker-hint">
                Drag included rows to reorder. Toggle to add or remove.
              </div>
              <ul class="track-picker-list" id="track-picker-list">
                ${renderPickerRows(s)}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="edit-modal-footer">
        <button class="edit-btn edit-btn-ghost edit-btn-danger" id="album-delete"
                title="Delete this album (tracks are not deleted)">
          ${createIcon('trash', 13)} Delete album
        </button>
        <div class="edit-modal-actions">
          <button class="edit-btn edit-btn-ghost" id="album-edit-cancel">Cancel</button>
          <button class="edit-btn edit-btn-primary" id="album-edit-save">Save</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  modalEl = overlay;

  wireEditModal(overlay, s);
}

function memberCountLabel(s) {
  const n = s.memberIds.length;
  return `${n} track${n !== 1 ? 's' : ''}`;
}

function coverSrc(s) {
  const base = `/api/albums/${s.album.id}/cover`;
  return s.coverBust ? `${base}?v=${s.coverBust}` : base;
}

function coverHint(s) {
  return s.hasCover
    ? '<span class="pill-ok">custom</span> uploaded cover'
    : 'no cover — placeholder in use';
}

function renderPickerRows(s) {
  const memberSet = new Set(s.memberIds);
  const byId = new Map(s.allTracks.map(t => [t.id, t]));

  // Order the list: members first in their curated order, then non-members.
  // Apply the search filter to both sections.
  const filter = s.filter.trim().toLowerCase();
  const matches = (t) => {
    if (!filter) return true;
    const hay = [t.display_name, t.filename, t.project_name, t.folder_name]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(filter);
  };

  const memberRows = s.memberIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(matches);

  const nonMemberRows = s.allTracks
    .filter(t => !memberSet.has(t.id))
    .filter(matches);

  const ordered = [...memberRows, ...nonMemberRows];

  if (!ordered.length) {
    return `<li class="track-picker-empty">no tracks match "${escapeHtml(filter)}"</li>`;
  }

  return ordered.map(t => {
    const included = memberSet.has(t.id);
    const label = t.display_name || t.filename;
    const { name: baseName, version } = parseVersion(label);
    const subParts = [];
    if (t.project_name) subParts.push(escapeHtml(t.project_name));
    if (t.folder_name)  subParts.push(escapeHtml(t.folder_name));
    const sub = subParts.length
      ? `<span class="track-picker-sub">${subParts.join(' · ')}</span>`
      : '';
    const versionBadge = version
      ? `<span class="track-picker-version">${escapeHtml(version)}</span>`
      : '';
    return `
      <li class="track-picker-row${included ? ' included' : ''}"
          draggable="${included ? 'true' : 'false'}"
          data-track-id="${t.id}"
          data-included="${included ? '1' : '0'}">
        <span class="track-picker-grip">${createIcon('grip-vertical', 12)}</span>
        <button class="track-picker-toggle" data-track-id="${t.id}"
                title="${included ? 'Remove from album' : 'Add to album'}">
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
  overlay.querySelector('#track-picker-count').textContent = memberCountLabel(s);
}

// --- Wiring ---

function wireEditModal(overlay, s) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('.edit-modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#album-edit-cancel').addEventListener('click', closeModal);

  const nameInput = overlay.querySelector('#album-edit-name');
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Cover upload
  const fileInput = overlay.querySelector('#album-cover-file');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const result = await uploadAlbumCover(s.album.id, file);
    if (result) {
      s.coverBust = Date.now();
      s.hasCover = true;
      overlay.querySelector('#album-cover-preview').src = coverSrc(s);
      overlay.querySelector('#album-cover-hint').innerHTML = coverHint(s);
    }
    fileInput.value = '';
  });

  // Cover reset
  overlay.querySelector('#album-cover-reset').addEventListener('click', async () => {
    if (!s.hasCover && s.coverBust === 0) return;
    const result = await deleteAlbumCover(s.album.id);
    if (result) {
      s.coverBust = Date.now();
      s.hasCover = false;
      overlay.querySelector('#album-cover-preview').src = coverSrc(s);
      overlay.querySelector('#album-cover-hint').innerHTML = coverHint(s);
    }
  });

  // Picker search
  const filterInput = overlay.querySelector('#track-picker-filter');
  filterInput.addEventListener('input', () => {
    s.filter = filterInput.value;
    refreshPickerList(overlay, s);
  });

  wirePicker(overlay, s);

  // Delete album
  overlay.querySelector('#album-delete').addEventListener('click', async () => {
    const ok = confirm(
      `Delete album "${s.album.name}"?\n\nTracks themselves will not be removed.`
    );
    if (!ok) return;
    const result = await deleteAlbum(s.album.id);
    if (result) {
      closeModal();
      onSavedCallback?.({ coverChanged: false, deleted: true });
    }
  });

  // Save
  overlay.querySelector('#album-edit-save').addEventListener('click', async () => {
    const newName = nameInput.value.trim();
    if (!newName) {
      nameInput.focus();
      return;
    }
    if (newName !== s.album.name) {
      await updateAlbum(s.album.id, { name: newName });
    }

    if (tracksDirty(s)) {
      await setAlbumTracks(s.album.id, s.memberIds);
    }

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
      const idx = s.memberIds.indexOf(id);
      if (idx >= 0) {
        s.memberIds.splice(idx, 1);
      } else {
        s.memberIds.push(id);
      }
      refreshPickerList(overlay, s);
    });
  });

  // Drag-to-reorder (members only).
  let dragId = null;
  list.querySelectorAll('.track-picker-row').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      if (row.dataset.included !== '1') {
        e.preventDefault();
        return;
      }
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
      if (dragId == null) return;
      if (row.dataset.included !== '1') return;
      const targetId = parseInt(row.dataset.trackId, 10);
      if (targetId === dragId) return;
      e.preventDefault();
      list.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
      row.classList.add('drop-target');
    });
    row.addEventListener('drop', (e) => {
      if (dragId == null) return;
      if (row.dataset.included !== '1') return;
      const targetId = parseInt(row.dataset.trackId, 10);
      if (targetId === dragId) return;
      e.preventDefault();
      reorderMembers(s, dragId, targetId);
      refreshPickerList(overlay, s);
    });
  });
}

function reorderMembers(s, dragId, targetId) {
  const curIdx = s.memberIds.indexOf(dragId);
  const targetIdx = s.memberIds.indexOf(targetId);
  if (curIdx < 0 || targetIdx < 0) return;
  s.memberIds.splice(curIdx, 1);
  const newTargetIdx = s.memberIds.indexOf(targetId);
  s.memberIds.splice(newTargetIdx, 0, dragId);
}

// --- utils ---

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
