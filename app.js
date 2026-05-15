/**
 * EXO DISCOGRAPHY — app.js
 * Uses iTunes Search API (free, no key required) via corsproxy.io
 * Fetches EXO albums and tracks, renders cards, handles audio preview playback
 */

/* ══════════════════════════════════════════
   CONSTANTS & STATE
══════════════════════════════════════════ */
const state = {
  albums: [],
  currentTrack: null,
  isPlaying: false,
  progressInterval: null,
  favorites: new Set(JSON.parse(localStorage.getItem('exo-favorites') || '[]')),
  showingFavorites: false,
};

function saveFavorites() {
  localStorage.setItem('exo-favorites', JSON.stringify([...state.favorites]));
}

function toggleFavorite(trackId) {
  if (state.favorites.has(trackId)) {
    state.favorites.delete(trackId);
  } else {
    state.favorites.add(trackId);
  }
  saveFavorites();
  updateFavBtns(trackId);
  if (state.showingFavorites) renderFavoritesView();
  updateFavCount();
}

function updateFavBtns(trackId) {
  document.querySelectorAll(`[data-fav-id="${trackId}"]`).forEach(btn => {
    const isFav = state.favorites.has(trackId);
    btn.classList.toggle('favorited', isFav);
    btn.setAttribute('aria-label', isFav ? 'Remove from favorites' : 'Add to favorites');
  });
}

function updateFavCount() {
  const badge = document.getElementById('favCount');
  if (!badge) return;
  const count = state.favorites.size;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

/* ══════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const DOM = {
  loadingState:    $('loadingState'),
  errorState:      $('errorState'),
  albumsContainer: $('albumsContainer'),
  navList:         $('navList'),
  menuToggle:      $('menuToggle'),
  headerNav:       $('headerNav'),
  playerBar:       $('playerBar'),
  playerArt:       $('playerArt'),
  playerTrack:     $('playerTrack'),
  playerAlbum:     $('playerAlbum'),
  playerPlayPause: $('playerPlayPause'),
  playerClose:     $('playerClose'),
  progressFill:    $('progressFill'),
  iconPlay:        $('iconPlay'),
  iconPause:       $('iconPause'),
  audio:           $('audioPlayer'),
  header:          $('header'),
  favToggle:       $('favToggle'),
  favView:         $('favView'),
};


/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
async function initApp() {
  showLoading(true);
  showError(false);

  try {
    const tracks = await fetchEXOTracks();
    if (!tracks.length) throw new Error('No tracks found');

    state.albums = groupByAlbum(tracks);
    renderAlbums();
    populateNavDropdown();
    setupIntersectionObserver();
    updateFavCount();
  } catch (err) {
    console.error('initApp error:', err);
    showError(true);
  } finally {
    showLoading(false);
  }
}


/* ══════════════════════════════════════════
   FETCH DATA — iTunes Search API
══════════════════════════════════════════ */
async function fetchEXOTracks() {
  const queries = [
    { term: 'EXO',          entity: 'song', limit: 200 },
    { term: 'EXO-K',        entity: 'song', limit: 100 },
    { term: 'EXO-M',        entity: 'song', limit: 100 },
    { term: 'EXO Reverse',  entity: 'song', limit: 50  },
  ];

  const allResults = await Promise.all(
    queries.map(q => searchITunes(q.term, q.entity, q.limit))
  );

  const seen = new Set();
  const tracks = [];

  for (const results of allResults) {
    for (const t of results) {
      if (!seen.has(t.trackId) && isEXOTrack(t)) {
        seen.add(t.trackId);
        tracks.push(t);
      }
    }
  }

  return tracks;
}

async function searchITunes(term, entity, limit = 200) {
  try {
    const params = new URLSearchParams({
      term,
      entity,
      limit: String(limit),
      country: 'US',
      media: 'music',
    });

    const itunesUrl = 'https://itunes.apple.com/search?' + params.toString();

    // 1) Try direct first (may work depending on the environment)
    try {
      const res = await fetch(itunesUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.results || [];
    } catch (directErr) {
      // 2) Fallback proxy (more reliable than the first one in many setups)
      const proxiedUrl = 'https://r.jina.ai/http://' + itunesUrl;
      const res = await fetch(proxiedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // r.jina.ai often returns raw text; attempt JSON parse
      const data = JSON.parse(text);
      return data.results || [];
    }
  } catch {
    return [];
  }
}

function isEXOTrack(track) {
  if (!track.artistName || !track.trackName) return false;
  const artist = track.artistName.toLowerCase();
  return (
    artist.includes('exo') ||
    artist === 'exo-k' ||
    artist === 'exo-m' ||
    artist === 'exo-cbx'
  );
}


/* ══════════════════════════════════════════
   GROUP BY ALBUM
══════════════════════════════════════════ */
function groupByAlbum(tracks) {
  const map = new Map();

  for (const track of tracks) {
    const key = track.collectionId || track.collectionName || 'Unknown Album';
    if (!map.has(key)) {
      map.set(key, {
        id:       key,
        name:     track.collectionName || 'Unknown Album',
        artist:   track.artistName,
        artUrl:   (track.artworkUrl100 || '').replace('100x100', '600x600'),
        thumbUrl: track.artworkUrl100 || '',
        year:     track.releaseDate ? track.releaseDate.slice(0, 4) : '—',
        genre:    track.primaryGenreName || '',
        tracks:   [],
      });
    }
    map.get(key).tracks.push({
      id:         track.trackId,
      name:       track.trackName,
      artist:     track.artistName,
      number:     track.trackNumber,
      previewUrl: track.previewUrl || null,
      artUrl:     (track.artworkUrl100 || '').replace('100x100', '300x300'),
      thumbUrl:   track.artworkUrl100 || '',
    });
  }

  return Array.from(map.values())
    .sort((a, b) => (b.year || '0').localeCompare(a.year || '0'))
    .map(album => ({
      ...album,
      tracks: album.tracks.sort((a, b) => (a.number || 0) - (b.number || 0)),
    }));
}


/* ══════════════════════════════════════════
   RENDER ALBUMS
══════════════════════════════════════════ */
function renderAlbums() {
  DOM.albumsContainer.innerHTML = '';

  state.albums.forEach((album, idx) => {
    const section = document.createElement('section');
    section.className = 'album-section';
    section.id = `album-${album.id}`;

    section.innerHTML = `
      <div class="album-section__header">
        <img class="album-section__art"
             src="${album.artUrl || album.thumbUrl}"
             alt="${escHtml(album.name)}"
             onerror="this.src='https://placehold.co/80x80/131319/a8a8b8?text=EXO'" />
        <div class="album-section__meta">
          <p class="album-section__label">${escHtml(album.genre)} · ${album.year}</p>
          <h2 class="album-section__title">${escHtml(album.name)}</h2>
          <p class="album-section__info">${escHtml(album.artist)} · ${album.tracks.length} track${album.tracks.length !== 1 ? 's' : ''}</p>
        </div>
        <span class="album-section__count">${String(idx + 1).padStart(2, '0')}</span>
      </div>
      <div class="tracks-grid">
        ${album.tracks.map(track => renderTrackCard(track, album)).join('')}
      </div>
    `;

    DOM.albumsContainer.appendChild(section);
  });

  DOM.albumsContainer.classList.remove('hidden');

  DOM.albumsContainer.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      const trackId = card.dataset.trackId;
      const albumId = card.dataset.albumId;
      const album   = state.albums.find(a => String(a.id) === albumId);
      if (!album) return;
      const track   = album.tracks.find(t => String(t.id) === trackId);
      if (!track) return;
      handleTrackClick(track, album);
    });
  });

  DOM.albumsContainer.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favId);
    });
  });
}

function renderTrackCard(track, album) {
  const hasPreview = !!track.previewUrl;
  const isFav = state.favorites.has(String(track.id));
  return `
    <div class="track-card${hasPreview ? '' : ' no-preview'}"
         data-track-id="${track.id}"
         data-album-id="${album.id}"
         title="${hasPreview ? 'Click to preview' : 'No preview available'}">
      <div style="position:relative;flex-shrink:0;">
        <img class="track-card__thumb"
             src="${track.artUrl || track.thumbUrl}"
             alt="${escHtml(track.name)}"
             loading="lazy"
             onerror="this.src='https://placehold.co/44x44/131319/a8a8b8?text=♪'" />
        ${hasPreview ? `
          <div class="track-card__play-overlay">
            <span class="track-card__play-icon">▶</span>
          </div>
        ` : ''}
      </div>
      <div class="track-card__info">
        <p class="track-card__name">${escHtml(track.name)}</p>
        <p class="track-card__artist">${escHtml(track.artist)}</p>
      </div>
      <div class="track-card__badge">
        <button class="fav-btn${isFav ? ' favorited' : ''}"
                data-fav-id="${track.id}"
                aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}"
                title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
        ${hasPreview
          ? `<span class="eq-bars" style="display:none">
               <span></span><span></span><span></span>
             </span>`
          : `<span class="track-card__no-preview">No preview</span>`
        }
      </div>
    </div>
  `;
}


/* ══════════════════════════════════════════
   POPULATE NAV DROPDOWN
══════════════════════════════════════════ */
function populateNavDropdown() {
  DOM.navList.innerHTML = state.albums.map(album => `
    <li>
      <a href="#album-${album.id}" data-album-id="${album.id}" onclick="closeNav()">
        ${escHtml(album.name)} <span style="color:var(--accent);font-size:10px">${album.year}</span>
      </a>
    </li>
  `).join('');
}


/* ══════════════════════════════════════════
   INTERSECTION OBSERVER
══════════════════════════════════════════ */
function setupIntersectionObserver() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.album-section').forEach(el => observer.observe(el));
}


/* ══════════════════════════════════════════
   AUDIO PLAYBACK
══════════════════════════════════════════ */
function handleTrackClick(track, album) {
  if (!track.previewUrl) {
    const card = document.querySelector(`[data-track-id="${track.id}"]`);
    if (card) {
      card.style.borderColor = 'rgba(212,168,67,0.5)';
      setTimeout(() => card.style.borderColor = '', 600);
    }
    return;
  }

  if (state.currentTrack?.id === track.id) {
    togglePlayPause();
    return;
  }

  playTrack(track, album);
}

function playTrack(track, album) {
  DOM.audio.pause();
  clearInterval(state.progressInterval);

  document.querySelectorAll('.track-card.playing').forEach(c => {
    c.classList.remove('playing');
    const eq = c.querySelector('.eq-bars');
    if (eq) eq.style.display = 'none';
  });

  state.currentTrack = { ...track, albumName: album.name };
  state.isPlaying = true;

  DOM.audio.src = track.previewUrl;
  DOM.audio.play().catch(console.warn);

  const card = document.querySelector(`[data-track-id="${track.id}"]`);
  if (card) {
    card.classList.add('playing');
    const eq = card.querySelector('.eq-bars');
    if (eq) eq.style.display = 'flex';
    const overlay = card.querySelector('.track-card__play-icon');
    if (overlay) overlay.textContent = '⏸';
  }

  showPlayerBar(track, album);
  setPlayPauseIcon(true);
  startProgress();
}

function togglePlayPause() {
  if (!state.currentTrack) return;

  if (state.isPlaying) {
    DOM.audio.pause();
    state.isPlaying = false;
    setPlayPauseIcon(false);
    clearInterval(state.progressInterval);
    const card = document.querySelector(`[data-track-id="${state.currentTrack.id}"]`);
    if (card) {
      const eq = card.querySelector('.eq-bars');
      if (eq) { eq.style.animationPlayState = 'paused'; eq.style.opacity = '0.4'; }
      const overlay = card.querySelector('.track-card__play-icon');
      if (overlay) overlay.textContent = '▶';
    }
  } else {
    DOM.audio.play().catch(console.warn);
    state.isPlaying = true;
    setPlayPauseIcon(true);
    startProgress();
    const card = document.querySelector(`[data-track-id="${state.currentTrack.id}"]`);
    if (card) {
      const eq = card.querySelector('.eq-bars');
      if (eq) { eq.style.animationPlayState = ''; eq.style.opacity = ''; }
      const overlay = card.querySelector('.track-card__play-icon');
      if (overlay) overlay.textContent = '⏸';
    }
  }
}

function startProgress() {
  clearInterval(state.progressInterval);
  state.progressInterval = setInterval(() => {
    if (DOM.audio.duration) {
      const pct = (DOM.audio.currentTime / DOM.audio.duration) * 100;
      DOM.progressFill.style.width = pct + '%';
    }
  }, 500);
}

DOM.audio.addEventListener('ended', () => {
  state.isPlaying = false;
  setPlayPauseIcon(false);
  DOM.progressFill.style.width = '0%';
  clearInterval(state.progressInterval);

  const card = document.querySelector(`[data-track-id="${state.currentTrack?.id}"]`);
  if (card) {
    const eq = card.querySelector('.eq-bars');
    if (eq) eq.style.display = 'none';
    const overlay = card.querySelector('.track-card__play-icon');
    if (overlay) overlay.textContent = '▶';
  }
});


/* ══════════════════════════════════════════
   PLAYER BAR UI
══════════════════════════════════════════ */
function showPlayerBar(track, album) {
  DOM.playerBar.classList.remove('hidden');
  DOM.playerTrack.textContent = track.name;
  DOM.playerAlbum.textContent = album.name;
  DOM.playerArt.innerHTML = `
    <img src="${track.artUrl || track.thumbUrl}"
         alt="${escHtml(track.name)}"
         onerror="this.src='https://placehold.co/44x44/131319/a8a8b8?text=EXO'" />
  `;
  DOM.progressFill.style.width = '0%';
}

function setPlayPauseIcon(playing) {
  DOM.iconPlay.classList.toggle('hidden', playing);
  DOM.iconPause.classList.toggle('hidden', !playing);
}

DOM.playerPlayPause.addEventListener('click', togglePlayPause);

DOM.playerClose.addEventListener('click', () => {
  DOM.audio.pause();
  state.isPlaying = false;
  state.currentTrack = null;
  clearInterval(state.progressInterval);
  DOM.progressFill.style.width = '0%';
  DOM.playerBar.classList.add('hidden');

  document.querySelectorAll('.track-card.playing').forEach(c => {
    c.classList.remove('playing');
    const eq = c.querySelector('.eq-bars');
    if (eq) eq.style.display = 'none';
    const overlay = c.querySelector('.track-card__play-icon');
    if (overlay) overlay.textContent = '▶';
  });
});


/* ══════════════════════════════════════════
   HEADER MENU TOGGLE
══════════════════════════════════════════ */
DOM.menuToggle.addEventListener('click', () => {
  const isOpen = DOM.menuToggle.getAttribute('aria-expanded') === 'true';
  DOM.menuToggle.setAttribute('aria-expanded', String(!isOpen));
  DOM.headerNav.classList.toggle('open', !isOpen);
  DOM.headerNav.setAttribute('aria-hidden', String(isOpen));
  DOM.header.classList.toggle('nav-open', !isOpen);
});

document.addEventListener('click', e => {
  if (!DOM.header.contains(e.target)) closeNav();
});

function closeNav() {
  DOM.menuToggle.setAttribute('aria-expanded', 'false');
  DOM.headerNav.classList.remove('open');
  DOM.headerNav.setAttribute('aria-hidden', 'true');
  DOM.header.classList.remove('nav-open');
}

window.addEventListener('scroll', () => {
  DOM.header.style.boxShadow = window.scrollY > 10
    ? '0 4px 30px rgba(0,0,0,0.4)'
    : '';
}, { passive: true });


/* ══════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════ */
function showLoading(show) {
  DOM.loadingState.classList.toggle('hidden', !show);
}
function showError(show) {
  DOM.errorState.classList.toggle('hidden', !show);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* ══════════════════════════════════════════
   FAVORITES VIEW
══════════════════════════════════════════ */
function renderFavoritesView() {
  const favTracks = [];
  state.albums.forEach(album => {
    album.tracks.forEach(track => {
      if (state.favorites.has(String(track.id))) {
        favTracks.push({ track, album });
      }
    });
  });

  if (favTracks.length === 0) {
    DOM.favView.innerHTML = `
      <div class="fav-empty">
        <span class="fav-empty__icon">♡</span>
        <p class="fav-empty__text">No favorites yet</p>
        <p class="fav-empty__sub">Tap ♡ on any track to save it here</p>
      </div>
    `;
    return;
  }

  DOM.favView.innerHTML = `
    <div class="fav-view__header">
      <p class="album-section__label">YOUR COLLECTION</p>
      <h2 class="fav-view__title">Favorites</h2>
      <p class="album-section__info">${favTracks.length} track${favTracks.length !== 1 ? 's' : ''}</p>
    </div>
    <div class="tracks-grid">
      ${favTracks.map(({ track, album }) => renderTrackCard(track, album)).join('')}
    </div>
  `;

  DOM.favView.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      const trackId = card.dataset.trackId;
      const albumId = card.dataset.albumId;
      const album   = state.albums.find(a => String(a.id) === albumId);
      if (!album) return;
      const track   = album.tracks.find(t => String(t.id) === trackId);
      if (!track) return;
      handleTrackClick(track, album);
    });
  });

  DOM.favView.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favId);
    });
  });
}

DOM.favToggle.addEventListener('click', () => {
  state.showingFavorites = !state.showingFavorites;
  DOM.favToggle.classList.toggle('active', state.showingFavorites);
  DOM.favToggle.setAttribute('aria-pressed', String(state.showingFavorites));
  if (state.showingFavorites) {
    DOM.albumsContainer.classList.add('hidden');
    DOM.favView.classList.remove('hidden');
    renderFavoritesView();
  } else {
    DOM.favView.classList.add('hidden');
    DOM.albumsContainer.classList.remove('hidden');
  }
});


/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', initApp);