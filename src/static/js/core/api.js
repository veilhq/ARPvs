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

async function send(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
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
  return send('PATCH', `/api/tracks/${trackId}`, patch);
}

/**
 * Patch a track's display name *within a specific album* only.
 * @param {number} albumId
 * @param {number} trackId
 * @param {{display_name?: string | null, apply_to_versions?: boolean}} patch
 */
export async function updateAlbumTrack(albumId, trackId, patch) {
  return send('PATCH', `/api/albums/${albumId}/tracks/${trackId}`, patch);
}

/**
 * Fetch an album's ordered track list.
 * @returns {Promise<{tracks: Array}>}
 */
export async function fetchAlbumTracks(albumId) {
  return (await get(`/api/albums/${albumId}/tracks`)) ?? { tracks: [] };
}

/**
 * Create a new album.
 * @param {string} name
 * @returns {Promise<object | null>}
 */
export async function createAlbum(name) {
  return send('POST', '/api/albums', { name });
}

/**
 * Rename an album.
 * @param {number} albumId
 * @param {{name: string}} patch
 */
export async function updateAlbum(albumId, patch) {
  return send('PATCH', `/api/albums/${albumId}`, patch);
}

/**
 * Delete an album. Tracks themselves are untouched.
 * @param {number} albumId
 */
export async function deleteAlbum(albumId) {
  const res = await fetch(`/api/albums/${albumId}`, { method: 'DELETE' });
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
 * Remove an album's cover, reverting to the generated placeholder.
 */
export async function deleteAlbumCover(albumId) {
  const res = await fetch(`/api/albums/${albumId}/cover`, { method: 'DELETE' });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Replace an album's track list and ordering.
 * @param {number} albumId
 * @param {number[]} trackIds
 */
export async function setAlbumTracks(albumId, trackIds) {
  return send('PUT', `/api/albums/${albumId}/tracks`, { track_ids: trackIds });
}
