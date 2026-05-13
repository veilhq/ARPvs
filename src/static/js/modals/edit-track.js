/**
 * edit-track.js — Track rename modal.
 *
 * Nondestructive rename. Scope is inferred from the current view:
 *   - From the all-tracks or search views, edits write to the global
 *     `tracks.display_name_override` (affects every album).
 *   - From an album-expanded view, edits write to
 *     `album_tracks.display_name` (scoped to that album only). This
 *     keeps the all-tracks view's version grouping intact.
 *
 * Supports applying the new name to sibling versions (also scoped),
 * and resetting to the underlying default.
 */

import { state } from '../state.js';
import { updateTrack, updateAlbumTrack } from '../core/api.js';
import { createIcon } from '../core/icons.js';
import { groupTracksByVersion } from '../core/utils.js';

let modalEl = null;
let onSavedCallback = null;

export function onTrackSaved(fn) { onSavedCallback = fn; }

export function openEditTrack(trackId) {
  const track = state.tracks.find(t => t.id === trackId);
  if (!track) return;

  // Determine scope from the current view
  const cv = state.currentView || { type: 'all' };
  const albumScope = cv.type === 'album-expanded' ? (cv.params?.albumId ?? null) : null;

  // Count sibling versions within the currently-visible list
  const groups = groupTracksByVersion(state.tracks);
  const myGroup = groups.find(g => g.tracks.some(t => t.id === trackId));
  const siblingCount = myGroup ? myGroup.tracks.length - 1 : 0;

  const currentName = track.display_name || '';
  const defaultName = track.display_name_default || track.display_name || '';
  const hasOverride = albumScope != null
    // In album scope we can't tell from the track payload alone whether
    // the displayed name came from album-level or track-level override.
    // Show Reset whenever the current name differs from the default.
    ? (currentName !== defaultName)
    : !!track.display_name_override;

  const modal = buildModal({
    track,
    currentName,
    defaultName,
    hasOverride,
    siblingCount,
    albumScope,
  });
  document.body.appendChild(modal);
  modalEl = modal;

  const input = modal.querySelector('#edit-track-name');
  input.focus();
  input.select();
}

function closeModal() {
  if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
  modalEl = null;
}

async function writeName(albumScope, trackId, patch) {
  if (albumScope != null) {
    return updateAlbumTrack(albumScope, trackId, patch);
  }
  return updateTrack(trackId, patch);
}

function buildModal({ track, currentName, defaultName, hasOverride, siblingCount, albumScope }) {
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-overlay';

  const scopeLabel = albumScope != null
    ? `<span class="edit-scope-tag" title="This rename only applies inside this album">album scope</span>`
    : `<span class="edit-scope-tag edit-scope-global" title="This rename applies everywhere">global</span>`;

  const siblingLabel = albumScope != null
    ? `Also rename ${siblingCount} other version${siblingCount === 1 ? '' : 's'} in this album`
    : `Also rename ${siblingCount} other version${siblingCount === 1 ? '' : 's'} (everywhere)`;

  overlay.innerHTML = `
    <div class="edit-modal" role="dialog" aria-label="Edit track">
      <div class="edit-modal-header">
        <span class="edit-modal-title">Edit Track</span>
        ${scopeLabel}
        <button class="edit-modal-close" aria-label="Close">${createIcon('x', 16)}</button>
      </div>
      <div class="edit-modal-body">
        <div class="edit-field">
          <label for="edit-track-name">Display Name</label>
          <input type="text" id="edit-track-name" value="${escapeHtml(currentName)}" autocomplete="off" spellcheck="false">
          <div class="edit-field-hint">
            Filename on disk: <code>${escapeHtml(track.filename)}</code>
          </div>
          ${hasOverride ? `
            <div class="edit-field-hint edit-field-hint-muted">
              Default: <code>${escapeHtml(defaultName)}</code>
            </div>` : ''}
        </div>
        ${siblingCount > 0 ? `
          <div class="edit-field edit-field-checkbox">
            <label>
              <input type="checkbox" id="edit-apply-all">
              <span>${siblingLabel}</span>
            </label>
          </div>` : ''}
      </div>
      <div class="edit-modal-footer">
        ${hasOverride ? `
          <button class="edit-btn edit-btn-ghost" id="edit-reset" title="Restore default name">
            ${createIcon('rotate-ccw', 14)} Reset
          </button>` : '<span></span>'}
        <div class="edit-modal-actions">
          <button class="edit-btn edit-btn-ghost" id="edit-cancel">Cancel</button>
          <button class="edit-btn edit-btn-primary" id="edit-save">Save</button>
        </div>
      </div>
    </div>`;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector('.edit-modal-close').addEventListener('click', closeModal);
  overlay.querySelector('#edit-cancel').addEventListener('click', closeModal);

  const input = overlay.querySelector('#edit-track-name');
  const applyAll = overlay.querySelector('#edit-apply-all');

  const save = async () => {
    const newName = input.value.trim();
    if (!newName) return;
    const result = await writeName(albumScope, track.id, {
      display_name: newName,
      apply_to_versions: applyAll ? applyAll.checked : false,
    });
    if (result) {
      closeModal();
      onSavedCallback?.();
    }
  };

  overlay.querySelector('#edit-save').addEventListener('click', save);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') closeModal();
  });

  const resetBtn = overlay.querySelector('#edit-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const result = await writeName(albumScope, track.id, {
        display_name: null,
        apply_to_versions: applyAll ? applyAll.checked : false,
      });
      if (result) {
        closeModal();
        onSavedCallback?.();
      }
    });
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  return overlay;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
