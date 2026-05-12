/**
 * utils.js — General-purpose helpers.
 */

/**
 * Format a duration in seconds as M:SS.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Extract version suffix from a track name.
 * Matches patterns like "V1", "V10", "v2", etc.
 * Returns { name: "Cathedral I", version: "Version 1", versionNum: 1 } or { name: "Cathedral I", version: null, versionNum: null }
 * @param {string} name
 * @returns {{name: string, version: string | null, versionNum: number | null}}
 */
export function parseVersion(name) {
  const match = name.match(/^(.+?)\s+(V)(\d+)$/i);
  if (match) {
    const versionNum = parseInt(match[3], 10);
    return { 
      name: match[1], 
      version: `Version ${versionNum}`,
      versionNum: versionNum
    };
  }
  return { name, version: null, versionNum: null };
}

/**
 * Group tracks by base name (without version suffix).
 * Returns an array of groups, each with a base name and array of tracks sorted numerically by version.
 * @param {Array} tracks
 * @returns {Array} [{baseName: string, tracks: [...]}, ...]
 */
export function groupTracksByVersion(tracks) {
  const groups = new Map();

  tracks.forEach((track, index) => {
    const { name: baseName } = parseVersion(track.display_name || track.filename);
    if (!groups.has(baseName)) {
      groups.set(baseName, []);
    }
    groups.get(baseName).push({ ...track, originalIndex: index });
  });

  return Array.from(groups.entries()).map(([baseName, groupTracks]) => {
    // Sort tracks within group by version number numerically
    const sortedTracks = groupTracks.sort((a, b) => {
      const { versionNum: aNum } = parseVersion(a.display_name || a.filename);
      const { versionNum: bNum } = parseVersion(b.display_name || b.filename);
      
      // If both have versions, sort numerically
      if (aNum !== null && bNum !== null) {
        return aNum - bNum;
      }
      // If only one has a version, it comes after
      if (aNum !== null) return -1;
      if (bNum !== null) return 1;
      // Otherwise maintain original order
      return 0;
    });

    return {
      baseName,
      tracks: sortedTracks,
      hasVersions: sortedTracks.length > 1,
    };
  });
}
