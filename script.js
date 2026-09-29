/* ============================================
   أرشيف عبدالحليم حافظ — JavaScript الرئيسي
   ============================================ */

(function() {
  'use strict';

  // ===== Data =====
  const DATA = window.ARCHIVE_DATA || {};
  const SONGS_PER_PAGE = 24;

  // ===== State =====
  let state = {
    songs: DATA.songs || [],
    composers: DATA.composers || [],
    lyricists: DATA.lyricists || [],
    films: DATA.films || [],
    concerts: DATA.concerts || [],
    categories: DATA.categories || [],
    photos: DATA.photos || [],
    sources: DATA.sources || [],
    biography: DATA.biography || {},
    filteredSongs: [],
    currentPage: 1,
    activeFilters: {
      year: '', composer: '', lyricist: '', category: '', film: '', recordingType: ''
    },
    playlist: [],
    currentSongIndex: -1,
    favorites: [],
    recent: [],
    theme: 'dark',
  };

  // ===== Storage =====
  const Storage = {
    get(key, def) {
      try { const v = localStorage.getItem('ahl_' + key); return v ? JSON.parse(v) : def; }
      catch(e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('ahl_' + key, JSON.stringify(val)); } catch(e) {}
    }
  };

  // ===== Helpers =====
  function getComposerName(id) {
    const c = state.composers.find(x => x.id === id);
    return c ? c.name : 'غير محدد';
  }
  function getLyricistName(id) {
    const l = state.lyricists.find(x => x.id === id);
    return l ? l.name : 'غير محدد';
  }
  function getFilmTitle(id) {
    const f = state.films.find(x => x.id === id);
    return f ? f.title : '';
  }
  function getCategoryName(id) {
    const c = state.categories.find(x => x.id === id);
    return c ? c.name : '';
  }
  function getSourceName(id) {
    const s = state.sources.find(x => x.id === id);
    return s ? { name: s.name, url: s.url } : { name: id, url: '' };
  }

  // Arabic text normalization for search
  function normalizeArabic(text) {
    if (!text) return '';
    return text
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ؤئ]/g, 'ء')
      .replace(/ـ/g, '')
      .replace(/[ًٌٍَُِّْ]/g, '')
      .trim()
      .toLowerCase();
  }

  // ===== Theme =====
  function initTheme() {
    const saved = Storage.get('theme', null);
    if (saved) {
      state.theme = saved;
    } else {
      state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    Storage.set('theme', state.theme);
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    if (state.theme === 'dark') {
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
      btn.setAttribute('aria-label', 'تبديل إلى الوضع النهاري');
    } else {
      btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      btn.setAttribute('aria-label', 'تبديل إلى الوضع الليلي');
    }
  }

  // ===== Navigation =====
  function initNav() {
    const menuToggle = document.getElementById('menuToggle');
    const navMenu = document.getElementById('navMenu');
    const bottomMenuBtn = document.getElementById('bottomMenuBtn');

    if (menuToggle && navMenu) {
      menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('open');
      });
    }

    if (bottomMenuBtn && navMenu) {
      bottomMenuBtn.addEventListener('click', () => {
        navMenu.classList.toggle('open');
        navMenu.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Close menu on link click
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });

    // Bottom search
    const bottomSearchBtn = document.getElementById('bottomSearchBtn');
    if (bottomSearchBtn) {
      bottomSearchBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
          searchInput.scrollIntoView({ behavior: 'smooth' });
          searchInput.focus();
        }
      });
    }

    // Active section tracking
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link, .bottom-nav-item');
    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach(sec => {
        if (window.scrollY >= sec.offsetTop - 100) {
          current = sec.id;
        }
      });
      navLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        link.classList.toggle('active', href === '#' + current);
      });
    }, { passive: true });
  }

  // ===== Search =====
  function initSearch() {
    const input = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClear');
    const results = document.getElementById('searchResults');

    if (!input) return;

    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
      if (!query) {
        if (results) results.style.display = 'none';
        return;
      }
      performSearch(query);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        if (results) results.style.display = 'none';
        input.focus();
      });
    }
  }

  function performSearch(query) {
    const results = document.getElementById('searchResults');
    if (!results) return;

    const nq = normalizeArabic(query);
    const matches = [];

    // Search songs
    state.songs.forEach(song => {
      const title = normalizeArabic(song.title);
      const composer = normalizeArabic(getComposerName(song.composerId));
      const lyricist = normalizeArabic(getLyricistName(song.lyricistId));
      const film = normalizeArabic(getFilmTitle(song.filmId));
      const year = song.year ? String(song.year) : '';

      if (title.includes(nq) || composer.includes(nq) || lyricist.includes(nq) ||
          film.includes(nq) || year.includes(nq)) {
        matches.push({ type: 'song', song });
      }
    });

    // Search films
    state.films.forEach(film => {
      if (normalizeArabic(film.title).includes(nq) || String(film.year).includes(nq)) {
        matches.push({ type: 'film', film });
      }
    });

    // Search concerts
    state.concerts.forEach(concert => {
      if (normalizeArabic(concert.title).includes(nq) ||
          normalizeArabic(concert.city).includes(nq) ||
          normalizeArabic(concert.country).includes(nq) ||
          String(concert.year).includes(nq)) {
        matches.push({ type: 'concert', concert });
      }
    });

    // Search composers
    state.composers.forEach(composer => {
      if (normalizeArabic(composer.name).includes(nq)) {
        matches.push({ type: 'composer', composer });
      }
    });

    // Search lyricists
    state.lyricists.forEach(lyricist => {
      if (normalizeArabic(lyricist.name).includes(nq)) {
        matches.push({ type: 'lyricist', lyricist });
      }
    });

    if (matches.length === 0) {
      results.innerHTML = '<div class="search-result-item"><div class="search-result-info"><div class="search-result-title">لا توجد نتائج</div></div></div>';
    } else {
      results.innerHTML = matches.slice(0, 20).map(m => {
        if (m.type === 'song') {
          const s = m.song;
          return `
            <div class="search-result-item" data-song-id="${s.id}">
              <button class="search-result-play" data-play-id="${s.id}" aria-label="تشغيل">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <div class="search-result-info" data-song-id="${s.id}">
                <div class="search-result-title">${s.title}</div>
                <div class="search-result-meta">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)} · ${getLyricistName(s.lyricistId)}</div>
              </div>
            </div>`;
        } else if (m.type === 'film') {
          return `<div class="search-result-item" data-film-id="${m.film.id}">
            <div class="search-result-info">
              <div class="search-result-title">🎬 ${m.film.title}</div>
              <div class="search-result-meta">فيلم · ${m.film.year}</div>
            </div>
          </div>`;
        } else if (m.type === 'concert') {
          return `<div class="search-result-item" data-concert-id="${m.concert.id}">
            <div class="search-result-info">
              <div class="search-result-title">🎤 ${m.concert.title}</div>
              <div class="search-result-meta">حفلة · ${m.concert.year} · ${m.concert.city}</div>
            </div>
          </div>`;
        } else if (m.type === 'composer') {
          return `<div class="search-result-item" data-composer-id="${m.composer.id}">
            <div class="search-result-info">
              <div class="search-result-title">🎵 ${m.composer.name}</div>
              <div class="search-result-meta">ملحن</div>
            </div>
          </div>`;
        } else if (m.type === 'lyricist') {
          return `<div class="search-result-item" data-lyricist-id="${m.lyricist.id}">
            <div class="search-result-info">
              <div class="search-result-title">✍️ ${m.lyricist.name}</div>
              <div class="search-result-meta">شاعر</div>
            </div>
          </div>`;
        }
        return '';
      }).join('');
    }

    results.style.display = 'block';

    // Attach click handlers
    results.querySelectorAll('[data-song-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-play-id]')) {
          e.stopPropagation();
          const id = e.target.closest('[data-play-id]').getAttribute('data-play-id');
          playSong(id);
        } else {
          const id = el.getAttribute('data-song-id');
          openSongModal(id);
        }
      });
    });
    results.querySelectorAll('[data-film-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-film-id');
        document.getElementById('films').scrollIntoView({ behavior: 'smooth' });
      });
    });
    results.querySelectorAll('[data-concert-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-concert-id');
        document.getElementById('concerts').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ===== Render Songs =====
  function renderSongs() {
    const grid = document.getElementById('songsGrid');
    if (!grid) return;

    const filtered = getFilteredSongs();
    state.filteredSongs = filtered;
    const toShow = filtered.slice(0, state.currentPage * SONGS_PER_PAGE);

    if (toShow.length === 0) {
      grid.innerHTML = '<div class="empty-state">لا توجد أغاني بهذه المعايير</div>';
      document.getElementById('loadMore').style.display = 'none';
      return;
    }

    grid.innerHTML = toShow.map(s => {
      const isFav = state.favorites.includes(s.id);
      const hasAudio = s.audioUrl && s.audioUrl.trim();
      return `
        <div class="song-card" data-song-id="${s.id}">
          <button class="song-card-play" data-play-id="${s.id}" aria-label="تشغيل ${s.title}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <div class="song-card-info" data-song-id="${s.id}">
            <div class="song-card-title">${s.title}</div>
            <div class="song-card-meta">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)} · ${getLyricistName(s.lyricistId)}</div>
          </div>
          <button class="song-card-fav ${isFav ? 'active' : ''}" data-fav-id="${s.id}" aria-label="المفضلة">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>`;
    }).join('');

    // Show/hide load more
    const loadMore = document.getElementById('loadMore');
    if (filtered.length > toShow.length) {
      loadMore.style.display = 'block';
    } else {
      loadMore.style.display = 'none';
    }

    // Attach handlers
    grid.querySelectorAll('[data-play-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playSong(el.getAttribute('data-play-id'));
      });
    });
    grid.querySelectorAll('[data-song-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-play-id]') && !e.target.closest('[data-fav-id]')) {
          openSongModal(el.getAttribute('data-song-id'));
        }
      });
    });
    grid.querySelectorAll('[data-fav-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(el.getAttribute('data-fav-id'));
      });
    });
  }

  function getFilteredSongs() {
    let filtered = [...state.songs];
    const f = state.activeFilters;

    if (f.year) filtered = filtered.filter(s => String(s.year) === f.year);
    if (f.composer) filtered = filtered.filter(s => s.composerId === f.composer);
    if (f.lyricist) filtered = filtered.filter(s => s.lyricistId === f.lyricist);
    if (f.category) filtered = filtered.filter(s => s.categoryId === f.category);
    if (f.film) filtered = filtered.filter(s => s.filmId === f.film);
    if (f.recordingType) filtered = filtered.filter(s => s.recordingType === f.recordingType);

    return filtered;
  }

  // ===== Filters =====
  function initFilters() {
    const filterYear = document.getElementById('filterYear');
    const filterComposer = document.getElementById('filterComposer');
    const filterLyricist = document.getElementById('filterLyricist');
    const filterCategory = document.getElementById('filterCategory');
    const filterFilm = document.getElementById('filterFilm');
    const filterRecordingType = document.getElementById('filterRecordingType');

    // Years
    const years = [...new Set(state.songs.filter(s => s.year).map(s => s.year))].sort((a, b) => a - b);
    if (filterYear) {
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        filterYear.appendChild(opt);
      });
      filterYear.addEventListener('change', () => {
        state.activeFilters.year = filterYear.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Composers
    if (filterComposer) {
      state.composers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        filterComposer.appendChild(opt);
      });
      filterComposer.addEventListener('change', () => {
        state.activeFilters.composer = filterComposer.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Lyricists
    if (filterLyricist) {
      state.lyricists.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        filterLyricist.appendChild(opt);
      });
      filterLyricist.addEventListener('change', () => {
        state.activeFilters.lyricist = filterLyricist.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Categories
    if (filterCategory) {
      state.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        filterCategory.appendChild(opt);
      });
      filterCategory.addEventListener('change', () => {
        state.activeFilters.category = filterCategory.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Films
    if (filterFilm) {
      state.films.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.title;
        filterFilm.appendChild(opt);
      });
      filterFilm.addEventListener('change', () => {
        state.activeFilters.film = filterFilm.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Recording types
    const recTypes = [...new Set(state.songs.map(s => s.recordingType))].filter(Boolean);
    if (filterRecordingType) {
      recTypes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        filterRecordingType.appendChild(opt);
      });
      filterRecordingType.addEventListener('change', () => {
        state.activeFilters.recordingType = filterRecordingType.value;
        state.currentPage = 1;
        renderSongs();
      });
    }

    // Load more
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        state.currentPage++;
        renderSongs();
      });
    }
  }

  // ===== Decades =====
  function renderDecades() {
    const counts = { 1950: 0, 1960: 0, 1970: 0 };
    state.songs.forEach(s => {
      if (s.decade && counts[s.decade] !== undefined) counts[s.decade]++;
    });
    Object.keys(counts).forEach(d => {
      const el = document.getElementById('count-' + d);
      if (el) el.textContent = counts[d] + ' أغنية';
    });

    // Click handlers
    document.querySelectorAll('.decade-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const decade = card.getAttribute('data-decade');
        // Filter songs by decade
        const yearStart = parseInt(decade);
        const yearEnd = yearStart + 9;
        // Set year filter to show decade songs
        const filterYear = document.getElementById('filterYear');
        // We'll filter by decade range
        state.songs = state.songs; // keep all
        const filtered = state.songs.filter(s => s.decade === parseInt(decade));
        state.filteredSongs = filtered;
        const grid = document.getElementById('songsGrid');
        if (grid) {
          if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty-state">لا توجد أغاني في هذا العقد</div>';
          } else {
            grid.innerHTML = filtered.map(s => {
              const isFav = state.favorites.includes(s.id);
              return `
                <div class="song-card" data-song-id="${s.id}">
                  <button class="song-card-play" data-play-id="${s.id}" aria-label="تشغيل">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <div class="song-card-info" data-song-id="${s.id}">
                    <div class="song-card-title">${s.title}</div>
                    <div class="song-card-meta">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)}</div>
                  </div>
                  <button class="song-card-fav ${isFav ? 'active' : ''}" data-fav-id="${s.id}" aria-label="المفضلة">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                </div>`;
            }).join('');
          }
          grid.querySelectorAll('[data-play-id]').forEach(el => {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              playSong(el.getAttribute('data-play-id'));
            });
          });
          grid.querySelectorAll('[data-song-id]').forEach(el => {
            el.addEventListener('click', (e) => {
              if (!e.target.closest('[data-play-id]') && !e.target.closest('[data-fav-id]')) {
                openSongModal(el.getAttribute('data-song-id'));
              }
            });
          });
          grid.querySelectorAll('[data-fav-id]').forEach(el => {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              toggleFavorite(el.getAttribute('data-fav-id'));
            });
          });
        }
        document.getElementById('songs').scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  // ===== Concerts =====
  function renderConcerts() {
    const grid = document.getElementById('concertsGrid');
    if (!grid) return;
    grid.innerHTML = state.concerts.map(c => `
      <div class="concert-card">
        <h3>${c.title}</h3>
        <div class="concert-meta">${c.city}، ${c.country} — ${c.year}</div>
        ${c.venue ? `<div class="concert-meta">${c.venue}</div>` : ''}
        <p class="concert-desc">${c.description || ''}</p>
      </div>
    `).join('');
  }

  // ===== Films =====
  function renderFilms() {
    const grid = document.getElementById('filmsGrid');
    if (!grid) return;
    grid.innerHTML = state.films.map(f => {
      const songs = state.songs.filter(s => s.filmId === f.id);
      const posterHtml = f.poster
        ? `<img src="${f.poster}" alt="${f.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" />`
        : f.title;
      return `
        <div class="film-card" data-film-id="${f.id}">
          <div class="film-poster">${posterHtml}</div>
          <div class="film-info">
            <div class="film-title">${f.title}</div>
            <div class="film-year">${f.year}</div>
            <div class="film-stars">${f.coStars || ''}</div>
            ${songs.length ? `<div class="film-stars">${songs.length} أغنية</div>` : ''}
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-film-id]').forEach(el => {
      el.addEventListener('click', () => {
        openFilmModal(el.getAttribute('data-film-id'));
      });
    });
  }

  // ===== People =====
  function renderComposers() {
    const grid = document.getElementById('composersGrid');
    if (!grid) return;
    grid.innerHTML = state.composers.map(c => {
      const count = state.songs.filter(s => s.composerId === c.id).length;
      return `
        <div class="person-card" data-composer-id="${c.id}">
          <div class="person-name">${c.name}</div>
          <div class="person-bio">${c.bio || ''}</div>
          <div class="person-count">${count} أغنية</div>
        </div>`;
    }).join('');
  }

  function renderLyricists() {
    const grid = document.getElementById('lyricistsGrid');
    if (!grid) return;
    grid.innerHTML = state.lyricists.map(l => {
      const count = state.songs.filter(s => s.lyricistId === l.id).length;
      if (count === 0) return ''; // Skip lyricists with no songs
      return `
        <div class="person-card" data-lyricist-id="${l.id}">
          <div class="person-name">${l.name}</div>
          <div class="person-bio">${l.bio || ''}</div>
          <div class="person-count">${count} أغنية</div>
        </div>`;
    }).join('');
  }

  // ===== Photos =====
  function renderPhotos() {
    const grid = document.getElementById('photosGrid');
    if (!grid) return;
    if (!state.photos.length || state.photos.every(p => !p.url)) {
      grid.innerHTML = '<div class="empty-state">يمكن إضافة الصور لاحقًا من لوحة الإدارة</div>';
      return;
    }
    grid.innerHTML = state.photos.filter(p => p.url).map(p => `
      <div class="photo-card">
        <img src="${p.url}" alt="${p.title}" loading="lazy" />
        <div class="photo-info">
          <div class="photo-title">${p.title}</div>
          <div class="photo-rights">${p.rights || 'Rights status unknown'}</div>
        </div>
      </div>
    `).join('');
  }

  // ===== Biography =====
  function renderBiography() {
    const container = document.getElementById('bioContent');
    if (!container || !state.biography.sections) return;

    let html = '';
    html += `<div class="bio-meta">`;
    html += `<div class="bio-meta-item"><strong>الاسم الكامل:</strong> ${state.biography.fullName || ''}</div>`;
    html += `<div class="bio-meta-item"><strong>الاسم الفني:</strong> ${state.biography.stageName || ''}</div>`;
    html += `<div class="bio-meta-item"><strong>تاريخ الميلاد:</strong> ${state.biography.birthDate || ''}</div>`;
    html += `<div class="bio-meta-item"><strong>مكان الميلاد:</strong> ${state.biography.birthPlace || ''}</div>`;
    html += `<div class="bio-meta-item"><strong>تاريخ الوفاة:</strong> ${state.biography.deathDate || ''}</div>`;
    html += `<div class="bio-meta-item"><strong>مكان الوفاة:</strong> ${state.biography.deathPlace || ''}</div>`;
    if (state.biography.titles) {
      html += `<div class="bio-meta-item"><strong>الألقاب:</strong> ${state.biography.titles.join('، ')}</div>`;
    }
    html += `</div>`;

    state.biography.sections.forEach(sec => {
      html += `<div class="bio-section">`;
      html += `<h3>${sec.title}</h3>`;
      html += `<p>${sec.content}</p>`;
      html += `</div>`;
    });

    container.innerHTML = html;

    // Sources
    const sourcesEl = document.getElementById('bioSources');
    if (sourcesEl) {
      let sh = `<h3>المصادر</h3>`;
      state.sources.forEach(s => {
        sh += `<div class="source-item"><a href="${s.url}" target="_blank" rel="noopener">${s.name}</a></div>`;
      });
      sourcesEl.innerHTML = sh;
    }
  }

  // ===== Sources =====
  function renderSources() {
    const list = document.getElementById('sourcesList');
    if (!list) return;
    list.innerHTML = state.sources.map(s => `
      <div class="source-item">
        <a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>
      </div>
    `).join('');
  }

  // ===== Favorites =====
  function toggleFavorite(songId) {
    const idx = state.favorites.indexOf(songId);
    if (idx > -1) {
      state.favorites.splice(idx, 1);
    } else {
      state.favorites.push(songId);
    }
    Storage.set('favorites', state.favorites);
    renderSongs();
    renderFavorites();
    renderRecent();
  }

  function renderFavorites() {
    const section = document.getElementById('favorites');
    const grid = document.getElementById('favoritesGrid');
    if (!section || !grid) return;

    if (state.favorites.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    const favSongs = state.songs.filter(s => state.favorites.includes(s.id));
    grid.innerHTML = favSongs.map(s => {
      return `
        <div class="song-card" data-song-id="${s.id}">
          <button class="song-card-play" data-play-id="${s.id}" aria-label="تشغيل">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <div class="song-card-info" data-song-id="${s.id}">
            <div class="song-card-title">${s.title}</div>
            <div class="song-card-meta">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)}</div>
          </div>
          <button class="song-card-fav active" data-fav-id="${s.id}" aria-label="إزالة من المفضلة">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-play-id]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); playSong(el.getAttribute('data-play-id')); });
    });
    grid.querySelectorAll('[data-song-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-play-id]') && !e.target.closest('[data-fav-id]')) {
          openSongModal(el.getAttribute('data-song-id'));
        }
      });
    });
    grid.querySelectorAll('[data-fav-id]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(el.getAttribute('data-fav-id')); });
    });
  }

  // ===== Recent =====
  function renderRecent() {
    const section = document.getElementById('recent');
    const grid = document.getElementById('recentGrid');
    if (!section || !grid) return;

    if (state.recent.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    const recentSongs = state.recent.map(id => state.songs.find(s => s.id === id)).filter(Boolean);
    grid.innerHTML = recentSongs.map(s => `
      <div class="song-card" data-song-id="${s.id}">
        <button class="song-card-play" data-play-id="${s.id}" aria-label="تشغيل">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="song-card-info" data-song-id="${s.id}">
          <div class="song-card-title">${s.title}</div>
          <div class="song-card-meta">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)}</div>
        </div>
        <button class="song-card-fav ${state.favorites.includes(s.id) ? 'active' : ''}" data-fav-id="${s.id}" aria-label="المفضلة">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${state.favorites.includes(s.id) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('[data-play-id]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); playSong(el.getAttribute('data-play-id')); });
    });
    grid.querySelectorAll('[data-song-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-play-id]') && !e.target.closest('[data-fav-id]')) {
          openSongModal(el.getAttribute('data-song-id'));
        }
      });
    });
    grid.querySelectorAll('[data-fav-id]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(el.getAttribute('data-fav-id')); });
    });
  }

  // ===== Song Modal =====
  function openSongModal(songId) {
    const song = state.songs.find(s => s.id === songId);
    if (!song) return;

    const modal = document.getElementById('songModal');
    const content = document.getElementById('modalContent');
    const filmTitle = getFilmTitle(song.filmId);
    const categoryName = getCategoryName(song.categoryId);

    let html = `<h2 class="modal-title">${song.title}</h2>`;

    const details = [
      { label: 'السنة', value: song.year || 'غير محدد' },
      { label: 'الملحن', value: getComposerName(song.composerId) },
      { label: 'الشاعر', value: getLyricistName(song.lyricistId) },
      { label: 'الفيلم', value: filmTitle || '—' },
      { label: 'التصنيف', value: categoryName || '—' },
      { label: 'نوع التسجيل', value: song.recordingType || '—' },
      { label: 'العقد', value: song.decade ? (song.decade === 1950 ? 'الخمسينيات' : song.decade === 1960 ? 'الستينيات' : 'السبعينيات') : '—' },
    ];

    details.forEach(d => {
      html += `<div class="modal-detail"><span class="modal-detail-label">${d.label}</span><span class="modal-detail-value">${d.value}</span></div>`;
    });

    if (song.notes) {
      html += `<div class="modal-notes">${song.notes}</div>`;
    }

    // Actions
    html += `<div class="modal-actions">`;
    if (song.audioUrl && song.audioUrl.trim()) {
      html += `<button class="modal-btn modal-btn-primary" id="modalPlayBtn" data-play-id="${song.id}">▶ استماع</button>`;
    } else {
      html += `<div class="modal-notes" style="text-align:center;">لا يوجد ملف صوتي متاح حاليًا</div>`;
    }
    const isFav = state.favorites.includes(song.id);
    html += `<button class="modal-btn modal-btn-secondary" id="modalFavBtn">${isFav ? '❤ إزالة من المفضلة' : '♡ أضف للمفضلة'}</button>`;
    // Admin edit button
    if (adminMode) {
      html += `<button class="modal-btn modal-btn-secondary" id="modalEditBtn" style="border-color:var(--color-primary); color:var(--color-primary);">✏ تعديل</button>`;
    }
    html += `</div>`;

    // Sources
    if (song.sources && song.sources.length) {
      html += `<div class="modal-sources">`;
      html += `<div class="modal-sources-title">المصادر:</div>`;
      song.sources.forEach(sid => {
        const src = getSourceName(sid);
        if (src.url) {
          html += `<a class="modal-source-link" href="${src.url}" target="_blank" rel="noopener">${src.name}</a>`;
        } else {
          html += `<div class="modal-source-link">${src.name}</div>`;
        }
      });
      html += `</div>`;
    }

    content.innerHTML = html;
    modal.style.display = 'flex';

    // Handlers
    const playBtn = document.getElementById('modalPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', () => playSong(song.id));
    }
    const favBtn = document.getElementById('modalFavBtn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        toggleFavorite(song.id);
        openSongModal(songId); // refresh
      });
    }
    const editBtn = document.getElementById('modalEditBtn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        closeModal();
        openSongEdit(song.id);
      });
    }
  }

  function openFilmModal(filmId) {
    const film = state.films.find(f => f.id === filmId);
    if (!film) return;

    const modal = document.getElementById('songModal');
    const content = document.getElementById('modalContent');
    const songs = state.songs.filter(s => s.filmId === filmId);

    let html = `<h2 class="modal-title">${film.title}</h2>`;
    html += `<div class="modal-detail"><span class="modal-detail-label">السنة</span><span class="modal-detail-value">${film.year}</span></div>`;
    if (film.coStars) {
      html += `<div class="modal-detail"><span class="modal-detail-label">البطولة</span><span class="modal-detail-value">${film.coStars}</span></div>`;
    }
    if (film.director) {
      html += `<div class="modal-detail"><span class="modal-detail-label">الإخراج</span><span class="modal-detail-value">${film.director}</span></div>`;
    }
    if (film.description) {
      html += `<div class="modal-notes">${film.description}</div>`;
    }

    if (songs.length) {
      html += `<h3 class="modal-sources-title" style="margin-top:1rem;">أغاني الفيلم (${songs.length}):</h3>`;
      songs.forEach(s => {
        html += `<div class="song-card" data-song-id="${s.id}" style="margin-bottom:0.5rem;cursor:pointer;">
          <button class="song-card-play" data-play-id="${s.id}" aria-label="تشغيل">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <div class="song-card-info" data-song-id="${s.id}">
            <div class="song-card-title">${s.title}</div>
            <div class="song-card-meta">${getComposerName(s.composerId)} · ${getLyricistName(s.lyricistId)}</div>
          </div>
        </div>`;
      });
    }

    content.innerHTML = html;
    modal.style.display = 'flex';

    content.querySelectorAll('[data-song-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-play-id]')) {
          const id = el.getAttribute('data-song-id');
          modal.style.display = 'none';
          openSongModal(id);
        }
      });
    });
    content.querySelectorAll('[data-play-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playSong(el.getAttribute('data-play-id'));
      });
    });
  }

  function closeModal() {
    const modal = document.getElementById('songModal');
    if (modal) modal.style.display = 'none';
  }

  // ===== Audio Player =====
  let audio = null;
  let currentSong = null;

  function playSong(songId) {
    const song = state.songs.find(s => s.id === songId);
    if (!song) return;

    // Add to recent
    const rIdx = state.recent.indexOf(songId);
    if (rIdx > -1) state.recent.splice(rIdx, 1);
    state.recent.unshift(songId);
    if (state.recent.length > 20) state.recent.pop();
    Storage.set('recent', state.recent);
    renderRecent();

    currentSong = song;
    state.currentSongIndex = state.songs.findIndex(s => s.id === songId);

    if (!song.audioUrl || !song.audioUrl.trim()) {
      // No audio — just show in player without playing
      showPlayer(song, false);
      return;
    }

    if (!audio) audio = document.getElementById('audioElement');
    if (!audio) return;

    try {
      audio.src = song.audioUrl;
      audio.load();
      audio.play().then(() => {
        showPlayer(song, true);
        showFullPlayer();
        setupMediaSession(song);
      }).catch(err => {
        showPlayer(song, false);
        showFullPlayer();
        const playerTitle = document.getElementById('playerTitle');
        if (playerTitle) playerTitle.textContent = song.title + ' (تعذر التشغيل)';
      });
    } catch(e) {
      showPlayer(song, false);
      showFullPlayer();
    }
  }

  function showPlayer(song, isPlaying) {
    const player = document.getElementById('audioPlayer');
    const title = document.getElementById('playerTitle');
    if (player) player.style.display = 'flex';
    if (title) title.textContent = song.title;
    updatePlayPauseIcon(isPlaying);
    updateFullPlayer(song, isPlaying);
  }

  function updateFullPlayer(song, isPlaying) {
    const fullTitle = document.getElementById('fullPlayerTitle');
    if (fullTitle) fullTitle.textContent = song.title;
    const fullSub = document.getElementById('fullPlayerSubtitle');
    if (fullSub) fullSub.textContent = 'عبدالحليم حافظ' + (song.year ? ' · ' + song.year : '');
    const fullPlay = document.getElementById('fullPlayIcon');
    const fullPause = document.getElementById('fullPauseIcon');
    if (fullPlay) fullPlay.style.display = isPlaying ? 'none' : 'block';
    if (fullPause) fullPause.style.display = isPlaying ? 'block' : 'none';
  }

  function showFullPlayer() {
    const full = document.getElementById('fullPlayer');
    const mini = document.getElementById('audioPlayer');
    if (full) full.style.display = 'flex';
    if (mini) mini.style.display = 'none';
  }

  function hideFullPlayer() {
    const full = document.getElementById('fullPlayer');
    const mini = document.getElementById('audioPlayer');
    if (full) full.style.display = 'none';
    if (mini && currentSong) mini.style.display = 'flex';
  }

  function closePlayer() {
    const full = document.getElementById('fullPlayer');
    const mini = document.getElementById('audioPlayer');
    if (full) full.style.display = 'none';
    if (mini) mini.style.display = 'none';
    if (audio) { audio.pause(); audio.src = ''; }
    updatePlayPauseIcon(false);
    currentSong = null;
  }

  function updatePlayPauseIcon(isPlaying) {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }

  function setupMediaSession(song) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: 'عبد الحليم حافظ',
        album: 'أرشيف عبدالحليم حافظ',
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (audio) audio.play();
        updatePlayPauseIcon(true);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (audio) audio.pause();
        updatePlayPauseIcon(false);
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    } catch(e) {}
  }

  function playNext() {
    if (state.currentSongIndex < 0 || state.currentSongIndex >= state.songs.length - 1) return;
    const next = state.songs[state.currentSongIndex + 1];
    if (next) playSong(next.id);
  }

  function playPrev() {
    if (state.currentSongIndex <= 0) return;
    const prev = state.songs[state.currentSongIndex - 1];
    if (prev) playSong(prev.id);
  }

  function initAudioPlayer() {
    const playPauseBtn = document.getElementById('playerPlayPause');
    const prevBtn = document.getElementById('playerPrev');
    const nextBtn = document.getElementById('playerNext');
    const progressBar = document.getElementById('progressBar');
    const expandBtn = document.getElementById('playerExpand');
    const closeBtn = document.getElementById('playerClose');
    const fullPlayPause = document.getElementById('fullPlayerPlayPause');
    const fullPrev = document.getElementById('fullPlayerPrev');
    const fullNext = document.getElementById('fullPlayerNext');
    const fullProgress = document.getElementById('fullProgressBar');
    const fullClose = document.getElementById('fullPlayerClose');
    const fullMinimize = document.getElementById('fullPlayerMinimize');

    // Mini player controls
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) {
          audio.play().then(() => { updatePlayPauseIcon(true); updateFullPlayer(currentSong || {}, true); }).catch(() => {});
        } else {
          audio.pause();
          updatePlayPauseIcon(false);
          updateFullPlayer(currentSong || {}, false);
        }
      });
    }

    if (prevBtn) prevBtn.addEventListener('click', playPrev);
    if (nextBtn) nextBtn.addEventListener('click', playNext);

    // Full player controls
    if (fullPlayPause) {
      fullPlayPause.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) {
          audio.play().then(() => { updatePlayPauseIcon(true); updateFullPlayer(currentSong || {}, true); }).catch(() => {});
        } else {
          audio.pause();
          updatePlayPauseIcon(false);
          updateFullPlayer(currentSong || {}, false);
        }
      });
    }
    if (fullPrev) fullPrev.addEventListener('click', playPrev);
    if (fullNext) fullNext.addEventListener('click', playNext);

    if (fullClose) fullClose.addEventListener('click', closePlayer);
    if (fullMinimize) fullMinimize.addEventListener('click', hideFullPlayer);
    if (expandBtn) expandBtn.addEventListener('click', showFullPlayer);
    if (closeBtn) closeBtn.addEventListener('click', closePlayer);

    if (fullProgress) {
      fullProgress.addEventListener('click', (e) => {
        if (!audio || !audio.duration) return;
        const rect = fullProgress.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = audio.duration * pct;
      });
    }

    if (audio) {
      audio.addEventListener('timeupdate', () => {
        const fill = document.getElementById('progressFill');
        const fullFill = document.getElementById('fullProgressFill');
        const currentTime = document.getElementById('playerCurrentTime');
        const duration = document.getElementById('playerDuration');
        const fullCurrent = document.getElementById('fullPlayerCurrentTime');
        const fullDur = document.getElementById('fullPlayerDuration');
        if (audio.duration) {
          const pct = (audio.currentTime / audio.duration) * 100;
          if (fill) fill.style.width = pct + '%';
          if (fullFill) fullFill.style.width = pct + '%';
          if (currentTime) currentTime.textContent = formatTime(audio.currentTime);
          if (duration) duration.textContent = formatTime(audio.duration);
          if (fullCurrent) fullCurrent.textContent = formatTime(audio.currentTime);
          if (fullDur) fullDur.textContent = formatTime(audio.duration);
        }
      });

      audio.addEventListener('ended', () => {
        updatePlayPauseIcon(false);
        updateFullPlayer(currentSong || {}, false);
        playNext();
      });

      audio.addEventListener('error', () => {
        updatePlayPauseIcon(false);
        updateFullPlayer(currentSong || {}, false);
        const title = document.getElementById('playerTitle');
        if (title && currentSong) {
          title.textContent = currentSong.title + ' — تعذر التشغيل';
        }
      });
    }

    if (progressBar) {
      progressBar.addEventListener('click', (e) => {
        if (!audio || !audio.duration) return;
        const rect = progressBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audio.currentTime = audio.duration * pct;
      });
    }

    // Modal close
    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
      modalClose.addEventListener('click', closeModal);
    }
    const modal = document.getElementById('songModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ===== Admin Mode (Integrated) =====
  let adminMode = false;
  let editingSongId = null;

  function initAdminMode() {
    // Check if admin is logged in
    try {
      if (localStorage.getItem('ahl_adminLogged') === 'true') {
        adminMode = true;
        enableAdminMode();
      }
    } catch(e) {}

    // Admin link - open as overlay
    const adminLink = document.getElementById('adminLink');
    if (adminLink) {
      adminLink.addEventListener('click', (e) => {
        e.preventDefault();
        openAdminOverlay();
      });
    }

    // Guide link
    const guideLink = document.getElementById('guideLink');
    if (guideLink) {
      guideLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('guideOverlay').classList.add('open');
      });
    }

    // Guide close
    const guideClose = document.getElementById('guideClose');
    if (guideClose) {
      guideClose.addEventListener('click', () => {
        document.getElementById('guideOverlay').classList.remove('open');
      });
    }

    // Admin overlay close
    const adminOverlayClose = document.getElementById('adminOverlayClose');
    if (adminOverlayClose) {
      adminOverlayClose.addEventListener('click', closeAdminOverlay);
    }

    // Admin edit panel buttons
    const adminEditSave = document.getElementById('adminEditSave');
    const adminEditCancel = document.getElementById('adminEditCancel');
    const adminEditDelete = document.getElementById('adminEditDelete');
    if (adminEditSave) adminEditSave.addEventListener('click', saveSongEdit);
    if (adminEditCancel) adminEditCancel.addEventListener('click', () => {
      document.getElementById('adminEditPanel').classList.remove('open');
      editingSongId = null;
    });
    if (adminEditDelete) adminEditDelete.addEventListener('click', deleteSongEdit);

    // Audio file in edit panel
    const editAudioFile = document.getElementById('editSongAudioFile');
    const editAudioInfo = document.getElementById('editSongAudioInfo');
    if (editAudioFile) {
      editAudioFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) { editAudioInfo.textContent = ''; return; }
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const type = file.type || 'غير معروف';
        editAudioInfo.textContent = `الاسم: ${file.name} | الحجم: ${sizeMB} MB | النوع: ${type}`;
        // For small files, convert to base64
        if (file.size < 5 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            editAudioInfo.textContent += ' | ✅ سيتم حفظه محليًا';
            editAudioInfo.dataset.dataUrl = ev.target.result;
          };
          reader.readAsDataURL(file);
        } else {
          editAudioInfo.textContent += ' | ⚠ الملف كبير. استخدم رابطًا مباشرًا بدلاً من ذلك';
        }
      });
    }
  }

  function openAdminOverlay() {
    // Open admin.html in same window - it will handle navigation back
    window.location.href = 'admin.html';
  }

  function closeAdminOverlay() {
    // Not used anymore since admin opens as page
    const overlay = document.getElementById('adminOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function enableAdminMode() {
    // Add edit buttons to song cards
    // This is handled in renderSongs by checking adminMode
  }

  function loadCustomData() {
    // Load custom data from localStorage and merge with base data
    try {
      const saved = localStorage.getItem('ahl_customData');
      if (saved) {
        const custom = JSON.parse(saved);
        // Merge songs - custom songs override base songs with same id
        if (custom.songs) {
          custom.songs.forEach(cs => {
            const idx = state.songs.findIndex(s => s.id === cs.id);
            if (idx > -1) {
              state.songs[idx] = Object.assign({}, state.songs[idx], cs);
            } else {
              state.songs.push(cs);
            }
          });
        }
        // Merge other data
        if (custom.films) {
          custom.films.forEach(f => {
            const idx = state.films.findIndex(x => x.id === f.id);
            if (idx > -1) state.films[idx] = Object.assign({}, state.films[idx], f);
            else state.films.push(f);
          });
        }
        if (custom.concerts) custom.concerts.forEach(c => {
          const idx = state.concerts.findIndex(x => x.id === c.id);
          if (idx > -1) state.concerts[idx] = Object.assign({}, state.concerts[idx], c);
          else state.concerts.push(c);
        });
        if (custom.composers) custom.composers.forEach(c => {
          if (!state.composers.find(x => x.id === c.id)) state.composers.push(c);
        });
        if (custom.lyricists) custom.lyricists.forEach(l => {
          if (!state.lyricists.find(x => x.id === l.id)) state.lyricists.push(l);
        });
        if (custom.categories) custom.categories.forEach(c => {
          if (!state.categories.find(x => x.id === c.id)) state.categories.push(c);
        });
        if (custom.photos) custom.photos.forEach(p => {
          if (!state.photos.find(x => x.id === p.id)) state.photos.push(p);
        });
      }
    } catch(e) {}
  }

  // ===== Song Edit Functions =====
  function openSongEdit(songId) {
    const song = state.songs.find(s => s.id === songId);
    if (!song) return;
    editingSongId = songId;

    document.getElementById('editSongTitle').value = song.title || '';
    document.getElementById('editSongYear').value = song.year || '';
    document.getElementById('editSongDecade').value = song.decade || 1960;
    document.getElementById('editSongAudioUrl').value = song.audioUrl || '';
    document.getElementById('editSongNotes').value = song.notes || '';
    document.getElementById('editSongRecType').value = song.recordingType || 'استوديو';

    // Populate selects
    populateEditSelect('editSongComposer', state.composers, song.composerId);
    populateEditSelect('editSongLyricist', state.lyricists, song.lyricistId);
    populateEditSelect('editSongCategory', state.categories, song.categoryId);
    populateEditSelectWithFilms('editSongFilm', song.filmId);

    document.getElementById('adminEditTitle').textContent = 'تعديل: ' + song.title;
    document.getElementById('adminEditPanel').classList.add('open');
  }

  function populateEditSelect(selectId, items, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      if (item.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function populateEditSelectWithFilms(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— بدون فيلم —</option>';
    state.films.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.title + ' (' + f.year + ')';
      if (f.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function saveSongEdit() {
    if (!editingSongId) return;
    const song = state.songs.find(s => s.id === editingSongId);
    if (!song) return;

    const audioUrl = document.getElementById('editSongAudioUrl').value.trim();
    const audioFileInfo = document.getElementById('editSongAudioInfo');
    let finalAudioUrl = audioUrl;

    // Use base64 data URL if available
    if (audioFileInfo && audioFileInfo.dataset.dataUrl) {
      finalAudioUrl = audioFileInfo.dataset.dataUrl;
    }

    // Convert YouTube URL
    if (audioUrl && (audioUrl.includes('youtube.com') || audioUrl.includes('youtu.be'))) {
      let videoId = '';
      if (audioUrl.includes('youtu.be/')) {
        videoId = audioUrl.split('youtu.be/')[1].split('?')[0];
      } else if (audioUrl.includes('v=')) {
        videoId = audioUrl.split('v=')[1].split('&')[0];
      }
      if (videoId) {
        finalAudioUrl = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
      }
    }

    const updates = {
      title: document.getElementById('editSongTitle').value.trim(),
      year: parseInt(document.getElementById('editSongYear').value) || null,
      decade: parseInt(document.getElementById('editSongDecade').value),
      composerId: document.getElementById('editSongComposer').value,
      lyricistId: document.getElementById('editSongLyricist').value,
      filmId: document.getElementById('editSongFilm').value || null,
      categoryId: document.getElementById('editSongCategory').value,
      recordingType: document.getElementById('editSongRecType').value,
      audioUrl: finalAudioUrl,
      notes: document.getElementById('editSongNotes').value.trim()
    };

    // Save to localStorage customData
    try {
      const saved = localStorage.getItem('ahl_customData');
      const custom = saved ? JSON.parse(saved) : { songs: [], films: [], concerts: [], composers: [], lyricists: [], categories: [], photos: [] };
      
      const idx = custom.songs.findIndex(s => s.id === editingSongId);
      if (idx > -1) {
        custom.songs[idx] = Object.assign({}, custom.songs[idx], updates);
      } else {
        custom.songs.push(Object.assign({}, song, updates));
      }
      localStorage.setItem('ahl_customData', JSON.stringify(custom));
    } catch(e) {}

    // Update in-memory state
    Object.assign(song, updates);

    // Re-render
    renderSongs();
    renderFavorites();
    renderRecent();

    document.getElementById('adminEditPanel').classList.remove('open');
    editingSongId = null;
    alert('تم حفظ التعديلات بنجاح!\n\nملاحظة: التعديلات محفوظة على جهازك فقط. لمشاركتها مع الجميع، استخدم تصدير JSON من لوحة الإدارة.');
  }

  function deleteSongEdit() {
    if (!editingSongId) return;
    if (!confirm('هل تريد حذف هذه الأغنية؟')) return;

    // Remove from state
    const idx = state.songs.findIndex(s => s.id === editingSongId);
    if (idx > -1) state.songs.splice(idx, 1);

    // Remove from localStorage
    try {
      const saved = localStorage.getItem('ahl_customData');
      if (saved) {
        const custom = JSON.parse(saved);
        const cIdx = custom.songs.findIndex(s => s.id === editingSongId);
        if (cIdx > -1) custom.songs.splice(cIdx, 1);
        localStorage.setItem('ahl_customData', JSON.stringify(custom));
      }
    } catch(e) {}

    renderSongs();
    document.getElementById('adminEditPanel').classList.remove('open');
    editingSongId = null;
  }

  // ===== Init =====
  function init() {
    // Load stored data
    state.favorites = Storage.get('favorites', []);
    state.recent = Storage.get('recent', []);

    loadCustomData();
    initAdminMode();
    initTheme();
    initNav();
    initSearch();
    initFilters();
    initAudioPlayer();

    renderSongs();
    renderDecades();
    renderConcerts();
    renderFilms();
    renderComposers();
    renderLyricists();
    renderPhotos();
    renderBiography();
    renderSources();
    renderFavorites();
    renderRecent();

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
