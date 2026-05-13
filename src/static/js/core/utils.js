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
 * Format a duration in seconds as a human-readable string (e.g. "2h 14m" or "45m").
 * @param {number} seconds
 * @returns {string}
 */
export function formatDurationLong(seconds) {
  if (!seconds || isNaN(seconds)) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Format a byte count as a human-readable size (e.g. "1.2 GB", "340 MB").
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
