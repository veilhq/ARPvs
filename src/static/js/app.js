/**
 * ARPvs — Client-side application logic.
 *
 * Handles:
 *   - Library data fetching and rendering
 *   - Audio playback (HTML5 Audio element)
 *   - Navigation between views
 *   - Search
 *   - Progress bar and transport controls
 */

(function () {
  'use strict';

  // --- State ---

  const state = {
    tracks: [],
    currentTrack: null,
    currentIndex: -1,
    isPlaying: false,
    sortBy: 'name',       // name, project, duration, date
    sortAsc: true,
    trackTags: {},        // { trackId: [{id, name, color}] }
  };

  // --- DOM refs ---

  const audio = document.getElementById('audio-element');
  const btnPlay = document.getElementById('btn-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const playerTitle = document.getElementById('player-title');
  const playerProject = document.getElementById('player-project');
  const playerCurrent = document.getElementById('player-current');
  const playerDuration = document.getElementById('player-duration');
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const volumeSlider = document.getElementById('volume-slider');
  const searchInput = document.getElementById('search-input');
  const content = document.getElementById('content');

  // --- API ---

  async function fetchTracks() {
    const res = await fetch('/api/tracks');
    if (!res.ok) return [];
    return res.json();
  }

  async function fetchAlbums() {
    const res = await fetch('/api/albums');
    if (!res.ok) return [];
    return res.json();
  }

  async function fetchProjects() {
    const res = await fetch('/api/projects');
    if (!res.ok) return [];
    return res.json();
  }

  async function searchTracks(query) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
  }

  async function fetchTags() {
    const res = await fetch('/api/tags');
    if (!res.ok) return [];
    return res.json();
  }

  async function fetchTrackTags() {
    const res = await fetch('/api/track-tags');
    if (!res.ok) return {};
    return res.json();
  }

  // --- Sorting ---

  function sortTracks(tracks) {
    const sorted = [...tracks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (state.sortBy) {
        case 'name':
          cmp = (a.display_name || a.filename).localeCompare(b.display_name || b.filename);
          break;
        case 'project':
          cmp = (a.project_name || '').localeCompare(b.project_name || '');
          break;
        case 'duration':
          cmp = (a.duration_seconds || 0) - (b.duration_seconds || 0);
          break;
        case 'date':
          cmp = (a.modified_at || 0) - (b.modified_at || 0);
          break;
      }
      return state.sortAsc ? cmp : -cmp;
    });
    return sorted;
  }

  function handleSort(field) {
    if (state.sortBy === field) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortBy = field;
      state.sortAsc = true;
    }
    state.tracks = sortTracks(state.tracks);
    renderTrackList(state.tracks);
  }

  // --- Rendering ---

  function renderTrackList(tracks) {
    if (!tracks.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p>no tracks found</p>
          <p class="text-muted">configure scan_root in config.json and restart</p>
        </div>`;
      return;
    }

    const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
    const sortIcon = state.sortAsc ? '↑' : '↓';

    const toolbar = `
      <div class="track-toolbar">
        <div class="track-toolbar-info">
          <span class="track-count">${tracks.length} track${tracks.length !== 1 ? 's' : ''}</span>
          <span class="track-total-duration">${formatTime(totalDuration)} total</span>
        </div>
        <div class="track-toolbar-sort">
          <span class="sort-label">sort:</span>
          <button class="sort-btn${state.sortBy === 'name' ? ' sort-active' : ''}" data-sort="name">
            name ${state.sortBy === 'name' ? sortIcon : ''}
          </button>
          <button class="sort-btn${state.sortBy === 'project' ? ' sort-active' : ''}" data-sort="project">
            project ${state.sortBy === 'project' ? sortIcon : ''}
          </button>
          <button class="sort-btn${state.sortBy === 'duration' ? ' sort-active' : ''}" data-sort="duration">
            length ${state.sortBy === 'duration' ? sortIcon : ''}
          </button>
          <button class="sort-btn${state.sortBy === 'date' ? ' sort-active' : ''}" data-sort="date">
            date ${state.sortBy === 'date' ? sortIcon : ''}
          </button>
        </div>
      </div>`;

    const rows = tracks.map((t, i) => {
      const tags = state.trackTags[t.id] || [];
      const tagHtml = tags.map(tag =>
        `<span class="tag-pill" style="--tag-color: ${tag.color || '#555'}">${tag.name}</span>`
      ).join('');

      return `
        <div class="track-row${state.currentIndex === i ? ' track-active' : ''}" data-index="${i}">
          <span class="track-indicator">${state.currentIndex === i ? '▶' : (t.is_changed ? '~' : '>')}</span>
          <span class="track-name">${t.display_name || t.filename}</span>
          <span class="track-tags">${tagHtml}</span>
          <span class="track-project">${t.album_name ? t.album_name + ' / ' : ''}${t.project_name || ''}</span>
          <span class="track-duration">${formatTime(t.duration_seconds)}</span>
        </div>`;
    }).join('');

    content.innerHTML = `${toolbar}<div class="track-list">${rows}</div>`;

    // Sort button handlers
    content.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => handleSort(btn.dataset.sort));
    });

    // Track click handlers
    content.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.index, 10);
        playTrack(idx);
      });
    });
  }

  function renderAlbums(albums) {
    if (!albums.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p>no albums found</p>
        </div>`;
      return;
    }

    const cards = albums.map(a => `
      <div class="album-card" data-album-id="${a.id}" data-album-name="${a.name}">
        <div class="album-art">
          <img src="${a.cover_art_url}" alt="${a.name}" loading="lazy">
        </div>
        <div class="album-info">
          <div class="album-name">${a.name}</div>
          <div class="album-meta">${a.project_count} project${a.project_count !== 1 ? 's' : ''}</div>
        </div>
      </div>
    `).join('');

    content.innerHTML = `<div class="view-header">Albums</div><div class="card-grid">${cards}</div>`;

    content.querySelectorAll('.album-card').forEach(card => {
      card.addEventListener('click', async () => {
        const albumName = card.dataset.albumName;
        const albumId = card.dataset.albumId;
        const coverUrl = `/api/albums/${albumId}/cover`;

        const res = await fetch(`/api/tracks`);
        const allTracks = await res.json();
        const albumTracks = allTracks.filter(t => t.album_name === albumName);

        renderAlbumExpanded(albumName, coverUrl, albumTracks);
      });
    });
  }

  function renderAlbumExpanded(albumName, coverUrl, tracks) {
    state.tracks = tracks;
    const totalDuration = tracks.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);

    const rows = tracks.map((t, i) => `
      <div class="track-row${state.currentIndex === i ? ' track-active' : ''}" data-index="${i}">
        <span class="track-indicator">${state.currentIndex === i ? '▶' : '>'}</span>
        <span class="track-name">${t.display_name || t.filename}</span>
        <span class="track-project">${t.project_name || ''}</span>
        <span class="track-duration">${formatTime(t.duration_seconds)}</span>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="album-expanded">
        <button class="back-btn" id="back-to-albums">← albums</button>
        <div class="album-expanded-header">
          <div class="album-expanded-art">
            <img src="${coverUrl}" alt="${albumName}">
          </div>
          <div class="album-expanded-info">
            <div class="album-expanded-name">${albumName}</div>
            <div class="album-expanded-meta">
              ${tracks.length} track${tracks.length !== 1 ? 's' : ''} · ${formatTime(totalDuration)}
            </div>
          </div>
        </div>
        <div class="track-list">${rows}</div>
      </div>`;

    document.getElementById('back-to-albums').addEventListener('click', async () => {
      const albums = await fetchAlbums();
      renderAlbums(albums);
    });

    content.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.dataset.index, 10);
        playTrack(idx);
      });
    });
  }

  function renderProjects(projects) {
    if (!projects.length) {
      content.innerHTML = `
        <div class="empty-state">
          <p>no projects found</p>
        </div>`;
      return;
    }

    const cards = projects.map(p => `
      <div class="project-card" data-project-id="${p.id}">
        <div class="project-name">${p.name}</div>
        <div class="project-meta">${p.album_name ? p.album_name + ' · ' : ''}${p.track_count} track${p.track_count !== 1 ? 's' : ''}</div>
      </div>
    `).join('');

    content.innerHTML = `<div class="view-header">Projects</div><div class="card-grid">${cards}</div>`;

    content.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', async () => {
        const projectName = card.querySelector('.project-name').textContent;
        const res = await fetch(`/api/tracks`);
        const allTracks = await res.json();
        const projectTracks = allTracks.filter(t => t.project_name === projectName);
        state.tracks = projectTracks;
        renderTrackList(projectTracks);
      });
    });
  }

  function renderCollections() {
    content.innerHTML = `
      <div class="empty-state">
        <p>no collections yet</p>
        <p class="text-muted">collections coming soon</p>
      </div>`;
  }

  function renderFavorites() {
    content.innerHTML = `
      <div class="empty-state">
        <p>no favorites yet</p>
        <p class="text-muted">click a track to start listening</p>
      </div>`;
  }

  // --- Playback ---

  function playTrack(index) {
    if (index < 0 || index >= state.tracks.length) return;

    const track = state.tracks[index];
    state.currentTrack = track;
    state.currentIndex = index;

    audio.src = `/api/stream/${track.id}`;
    audio.play();
    state.isPlaying = true;

    playerTitle.textContent = track.display_name || track.filename;
    playerProject.textContent = track.project_name || '';
    btnPlay.innerHTML = '&#9646;&#9646;';

    renderTrackList(state.tracks);
  }

  function togglePlay() {
    if (!state.currentTrack) return;
    if (state.isPlaying) {
      audio.pause();
      state.isPlaying = false;
      btnPlay.innerHTML = '&#9654;';
    } else {
      audio.play();
      state.isPlaying = true;
      btnPlay.innerHTML = '&#9646;&#9646;';
    }
  }

  function playNext() {
    if (state.currentIndex < state.tracks.length - 1) {
      playTrack(state.currentIndex + 1);
    }
  }

  function playPrev() {
    if (state.currentIndex > 0) {
      playTrack(state.currentIndex - 1);
    }
  }

  // --- Time / Progress ---

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${pct}%`;
    playerCurrent.textContent = formatTime(audio.currentTime);
    playerDuration.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    playNext();
  });

  progressBar.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // --- Controls ---

  btnPlay.addEventListener('click', togglePlay);
  btnPrev.addEventListener('click', playPrev);
  btnNext.addEventListener('click', playNext);
  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value);
  });

  // --- Search ---

  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    searchTimeout = setTimeout(async () => {
      if (q.length > 0) {
        const results = await searchTracks(q);
        state.tracks = results;
        renderTrackList(results);
      } else {
        const all = await fetchTracks();
        state.tracks = all;
        renderTrackList(all);
      }
    }, 250);
  });

  // --- Sidebar Navigation ---

  const sidebarLinks = document.querySelectorAll('.sidebar-link');

  sidebarLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();

      // Update active state
      sidebarLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      const view = link.dataset.view;

      switch (view) {
        case 'all': {
          const tracks = await fetchTracks();
          state.tracks = tracks;
          renderTrackList(tracks);
          break;
        }
        case 'albums': {
          const albums = await fetchAlbums();
          renderAlbums(albums);
          break;
        }
        case 'projects': {
          const projects = await fetchProjects();
          renderProjects(projects);
          break;
        }
        case 'collections':
          renderCollections();
          break;
        case 'favorites':
          renderFavorites();
          break;
      }
    });
  });

  // --- Keyboard shortcuts ---

  document.addEventListener('keydown', (e) => {
    if (e.target === searchInput) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') { playNext(); }
    if (e.code === 'ArrowLeft') { playPrev(); }
  });

  // --- Init ---

  async function init() {
    const [tracks, trackTags] = await Promise.all([
      fetchTracks(),
      fetchTrackTags(),
    ]);
    state.trackTags = trackTags;
    state.tracks = sortTracks(tracks);
    renderTrackList(state.tracks);
  }

  init();
})();
