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
