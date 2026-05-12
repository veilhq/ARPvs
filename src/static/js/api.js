/**
 * api.js — Thin wrappers around every backend endpoint.
 *
 * All functions return parsed JSON on success, or a safe empty value on
 * failure so callers never have to guard against thrown network errors.
 */

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTracks() {
  return (await get('/api/tracks')) ?? [];
}

export async function fetchAlbums() {
  return (await get('/api/albums')) ?? [];
}

export async function fetchProjects() {
  return (await get('/api/projects')) ?? [];
}

export async function fetchUnexportedProjects() {
  return (await get('/api/unexported-projects')) ?? [];
}

export async function fetchTags() {
  return (await get('/api/tags')) ?? [];
}

export async function fetchLibrarySummary() {
  return (await get('/api/library')) ?? {};
}

export async function fetchTrackTags() {
  return (await get('/api/track-tags')) ?? {};
}

export async function searchTracks(query) {
  return (await get(`/api/search?q=${encodeURIComponent(query)}`)) ?? [];
}

/**
 * Patch a track's editable fields (global override — applies everywhere).
 * @param {number} trackId
 * @param {{display_name?: string | null, apply_to_versions?: boolean}} patch
 * @returns {Promise<{updated: Array} | null>}
 */
export async function updateTrack(trackId, patch) {
  const res = await fetch(`/api/tracks/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Patch a track's display name *within a specific album* only.
 * @param {number} albumId
 * @param {number} trackId
 * @param {{display_name?: string | null, apply_to_versions?: boolean}} patch
 */
export async function updateAlbumTrack(albumId, trackId, patch) {
  const res = await fetch(`/api/albums/${albumId}/tracks/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fetch an album's tracks, including the auto candidates and curated ids.
 */
export async function fetchAlbumTracks(albumId) {
  return (await get(`/api/albums/${albumId}/tracks`)) ?? { is_curated: false, tracks: [], auto_tracks: [], curated_ids: [] };
}

/**
 * Patch an album's editable fields.
 * @param {number} albumId
 * @param {{display_name?: string | null}} patch
 */
export async function updateAlbum(albumId, patch) {
  const res = await fetch(`/api/albums/${albumId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Upload a cover image for an album.
 * @param {number} albumId
 * @param {File} file
 */
export async function uploadAlbumCover(albumId, file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`/api/albums/${albumId}/cover`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Remove an album's cover override, reverting to folder-detected art.
 */
export async function deleteAlbumCover(albumId) {
  const res = await fetch(`/api/albums/${albumId}/cover`, { method: 'DELETE' });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Replace an album's curated track list. Pass an empty array to revert
 * to auto mode (all tracks under the album's projects).
 * @param {number} albumId
 * @param {number[]} trackIds
 */
export async function setAlbumTracks(albumId, trackIds) {
  const res = await fetch(`/api/albums/${albumId}/tracks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!res.ok) return null;
  return res.json();
}
