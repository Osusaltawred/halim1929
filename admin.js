/* ============================================
   أرشيف عبدالحليم حافظ — لوحة الإدارة
   ============================================ */

(function() {
  'use strict';

  const DATA = window.ARCHIVE_DATA || {};
  const STORAGE_PREFIX = 'ahl_';
  const DEFAULT_PASSWORD = 'admin123';

  // Load custom data from LocalStorage
  let customData = {
    songs: [],
    films: [],
    concerts: [],
    composers: [],
    lyricists: [],
    categories: [],
    photos: []
  };

  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + 'customData');
    if (saved) customData = Object.assign(customData, JSON.parse(saved));
  } catch(e) {}

  // Merge custom data with base data
  const mergedData = {
    songs: [...(DATA.songs || []), ...customData.songs],
    films: [...(DATA.films || []), ...customData.films],
    concerts: [...(DATA.concerts || []), ...customData.concerts],
    composers: [...(DATA.composers || []), ...customData.composers],
    lyricists: [...(DATA.lyricists || []), ...customData.lyricists],
    categories: [...(DATA.categories || []), ...customData.categories],
    photos: [...(DATA.photos || []), ...customData.photos],
    sources: DATA.sources || [],
    biography: DATA.biography || {}
  };

  function saveCustomData() {
    try { localStorage.setItem(STORAGE_PREFIX + 'customData', JSON.stringify(customData)); } catch(e) {}
  }

  function genId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  }

  // ===== Login =====
  function checkLogin() {
    const loggedIn = localStorage.getItem(STORAGE_PREFIX + 'adminLogged') === 'true';
    if (loggedIn) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminPanel').style.display = 'block';
      initPanel();
    }
  }

  function initLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const passwordInput = document.getElementById('passwordInput');

    function tryLogin() {
      const password = passwordInput.value;
      const storedPassword = localStorage.getItem(STORAGE_PREFIX + 'adminPassword') || DEFAULT_PASSWORD;
      if (password === storedPassword) {
        localStorage.setItem(STORAGE_PREFIX + 'adminLogged', 'true');
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        initPanel();
      } else {
        alert('كلمة المرور غير صحيحة');
        passwordInput.value = '';
      }
    }

    if (loginBtn) loginBtn.addEventListener('click', tryLogin);
    if (passwordInput) {
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryLogin();
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_PREFIX + 'adminLogged');
        // Navigate to main site - it will load fresh with updated data
        window.location.href = 'index.html';
      });
    }
  }

  // ===== Tabs =====
  function initTabs() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.getAttribute('data-tab')).classList.add('active');
      });
    });
  }

  // ===== Populate Selects =====
  function populateSelects() {
    const songComposer = document.getElementById('songComposer');
    const songLyricist = document.getElementById('songLyricist');
    const songFilm = document.getElementById('songFilm');
    const songCategory = document.getElementById('songCategory');

    if (songComposer) {
      mergedData.composers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        songComposer.appendChild(opt);
      });
    }
    if (songLyricist) {
      mergedData.lyricists.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id; opt.textContent = l.name;
        songLyricist.appendChild(opt);
      });
    }
    if (songFilm) {
      mergedData.films.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id; opt.textContent = f.title + ' (' + f.year + ')';
        songFilm.appendChild(opt);
      });
    }
    if (songCategory) {
      mergedData.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        songCategory.appendChild(opt);
      });
    }
  }

  // ===== Audio File Info =====
  function initAudioFileInput() {
    const input = document.getElementById('songAudioFile');
    const info = document.getElementById('audioFileInfo');
    if (!input || !info) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { info.textContent = ''; return; }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const type = file.type || 'غير معروف';
      info.textContent = `الاسم: ${file.name} | الحجم: ${sizeMB} MB | النوع: ${type}`;

      // Check if browser can play it
      const audio = document.createElement('audio');
      const canPlay = audio.canPlayType(type);
      if (canPlay === '') {
        info.textContent += ' | ⚠ قد لا يدعم المتصفح هذا النوع، لكن يمكن تنزيل الملف';
      }
    });
  }

  // ===== Photo File Info =====
  function initPhotoFileInput() {
    const input = document.getElementById('photoFile');
    const info = document.getElementById('photoFileInfo');
    if (!input || !info) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) { info.textContent = ''; return; }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      info.textContent = `الاسم: ${file.name} | الحجم: ${sizeMB} MB | النوع: ${file.type}`;

      // Preview as data URL (for localStorage)
      if (file.size < 2 * 1024 * 1024) { // Only for files < 2MB
        const reader = new FileReader();
        reader.onload = (ev) => {
          const urlInput = document.getElementById('photoUrl');
          if (urlInput) urlInput.value = ev.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        info.textContent += ' | ⚠ الصورة كبيرة جدًا للتخزين المباشر، يرجى استخدام رابط';
      }
    });
  }

  // ===== Add Song =====
  function initAddSong() {
    const btn = document.getElementById('addSongBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const title = document.getElementById('songTitle').value.trim();
      if (!title) { alert('يرجى إدخال اسم الأغنية'); return; }

      const year = document.getElementById('songYear').value;
      const decade = document.getElementById('songDecade').value;
      const composerId = document.getElementById('songComposer').value;
      const lyricistId = document.getElementById('songLyricist').value;
      const filmId = document.getElementById('songFilm').value || null;
      const categoryId = document.getElementById('songCategory').value;
      const recordingType = document.getElementById('songRecordingType').value;
      const audioUrl = document.getElementById('songAudioUrl').value.trim();
      const notes = document.getElementById('songNotes').value.trim();

      const song = {
        id: genId('song'),
        title,
        year: year ? parseInt(year) : null,
        decade: parseInt(decade),
        composerId,
        lyricistId,
        filmId,
        categoryId,
        recordingType,
        concertId: null,
        audioUrl,
        notes,
        sources: ['admin']
      };

      customData.songs.push(song);
      saveCustomData();
      renderSongsList();

      // Clear form
      document.getElementById('songTitle').value = '';
      document.getElementById('songYear').value = '';
      document.getElementById('songAudioUrl').value = '';
      document.getElementById('songNotes').value = '';
      document.getElementById('songAudioFile').value = '';
      document.getElementById('audioFileInfo').textContent = '';

      alert('تمت إضافة الأغنية بنجاح');
    });
  }

  // ===== Add Film =====
  function initAddFilm() {
    const btn = document.getElementById('addFilmBtn');
    if (!btn) return;

    // Film poster file
    const posterFile = document.getElementById('filmPosterFile');
    const posterInfo = document.getElementById('filmPosterInfo');
    if (posterFile) {
      posterFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) { posterInfo.textContent = ''; return; }
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        posterInfo.textContent = `الاسم: ${file.name} | الحجم: ${sizeMB} MB`;
        if (file.size < 2 * 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            document.getElementById('filmPoster').value = ev.target.result;
            posterInfo.textContent += ' | ✅ تم تحميل الصورة';
          };
          reader.readAsDataURL(file);
        } else {
          posterInfo.textContent += ' | ⚠ استخدم رابطًا للصور الكبيرة';
        }
      });
    }

    btn.addEventListener('click', () => {
      const title = document.getElementById('filmTitle').value.trim();
      if (!title) { alert('يرجى إدخال اسم الفيلم'); return; }

      const film = {
        id: genId('film'),
        title,
        year: parseInt(document.getElementById('filmYear').value) || null,
        poster: document.getElementById('filmPoster').value.trim() || '',
        description: document.getElementById('filmDesc').value.trim(),
        coStars: document.getElementById('filmCoStars').value.trim(),
        director: document.getElementById('filmDirector').value.trim()
      };

      customData.films.push(film);
      saveCustomData();
      renderFilmsList();

      document.getElementById('filmTitle').value = '';
      document.getElementById('filmYear').value = '';
      document.getElementById('filmCoStars').value = '';
      document.getElementById('filmDirector').value = '';
      document.getElementById('filmDesc').value = '';
      document.getElementById('filmPoster').value = '';
      document.getElementById('filmPosterFile').value = '';
      document.getElementById('filmPosterInfo').textContent = '';

      alert('تمت إضافة الفيلم بنجاح');
    });
  }

  // ===== Add Concert =====
  function initAddConcert() {
    const btn = document.getElementById('addConcertBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const title = document.getElementById('concertTitle').value.trim();
      if (!title) { alert('يرجى إدخال اسم الحفلة'); return; }

      const concert = {
        id: genId('concert'),
        title,
        city: document.getElementById('concertCity').value.trim(),
        country: document.getElementById('concertCountry').value.trim(),
        year: parseInt(document.getElementById('concertYear').value) || null,
        date: document.getElementById('concertYear').value || '',
        venue: document.getElementById('concertVenue').value.trim(),
        description: document.getElementById('concertDesc').value.trim(),
        songs: []
      };

      customData.concerts.push(concert);
      saveCustomData();
      renderConcertsList();

      document.getElementById('concertTitle').value = '';
      document.getElementById('concertCity').value = '';
      document.getElementById('concertCountry').value = '';
      document.getElementById('concertYear').value = '';
      document.getElementById('concertVenue').value = '';
      document.getElementById('concertDesc').value = '';

      alert('تمت إضافة الحفلة بنجاح');
    });
  }

  // ===== Add Composer =====
  function initAddComposer() {
    const btn = document.getElementById('addComposerBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const name = document.getElementById('composerName').value.trim();
      if (!name) { alert('يرجى إدخال اسم الملحن'); return; }

      const composer = {
        id: genId('c'),
        name,
        bio: document.getElementById('composerBio').value.trim()
      };

      customData.composers.push(composer);
      saveCustomData();
      renderComposersList();

      // Update select
      const sel = document.getElementById('songComposer');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = composer.id; opt.textContent = composer.name;
        sel.appendChild(opt);
      }

      document.getElementById('composerName').value = '';
      document.getElementById('composerBio').value = '';

      alert('تمت إضافة الملحن بنجاح');
    });
  }

  // ===== Add Lyricist =====
  function initAddLyricist() {
    const btn = document.getElementById('addLyricistBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const name = document.getElementById('lyricistName').value.trim();
      if (!name) { alert('يرجى إدخال اسم الشاعر'); return; }

      const lyricist = {
        id: genId('l'),
        name,
        bio: document.getElementById('lyricistBio').value.trim()
      };

      customData.lyricists.push(lyricist);
      saveCustomData();
      renderLyricistsList();

      const sel = document.getElementById('songLyricist');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = lyricist.id; opt.textContent = lyricist.name;
        sel.appendChild(opt);
      }

      document.getElementById('lyricistName').value = '';
      document.getElementById('lyricistBio').value = '';

      alert('تمت إضافة الشاعر بنجاح');
    });
  }

  // ===== Add Category =====
  function initAddCategory() {
    const btn = document.getElementById('addCategoryBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const name = document.getElementById('categoryName').value.trim();
      if (!name) { alert('يرجى إدخال اسم التصنيف'); return; }

      const category = {
        id: genId('cat'),
        name
      };

      customData.categories.push(category);
      saveCustomData();
      renderCategoriesList();

      const sel = document.getElementById('songCategory');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = category.id; opt.textContent = category.name;
        sel.appendChild(opt);
      }

      document.getElementById('categoryName').value = '';
      alert('تمت إضافة التصنيف بنجاح');
    });
  }

  // ===== Add Photo =====
  function initAddPhoto() {
    const btn = document.getElementById('addPhotoBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const title = document.getElementById('photoTitle').value.trim();
      if (!title) { alert('يرجى إدخال عنوان الصورة'); return; }

      const photo = {
        id: genId('photo'),
        title,
        year: parseInt(document.getElementById('photoYear').value) || null,
        category: document.getElementById('photoCategory').value,
        url: document.getElementById('photoUrl').value.trim(),
        source: document.getElementById('photoSource').value.trim(),
        rights: document.getElementById('photoRights').value.trim() || 'Rights status unknown'
      };

      customData.photos.push(photo);
      saveCustomData();
      renderPhotosList();

      document.getElementById('photoTitle').value = '';
      document.getElementById('photoYear').value = '';
      document.getElementById('photoUrl').value = '';
      document.getElementById('photoSource').value = '';
      document.getElementById('photoFile').value = '';
      document.getElementById('photoFileInfo').textContent = '';

      alert('تمت إضافة الصورة بنجاح');
    });
  }

  // ===== Render Lists =====
  function renderSongsList() {
    const list = document.getElementById('songsList');
    if (!list) return;
    const songs = customData.songs;
    if (!songs.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد أغاني مضافة بعد.</p>'; return; }
    list.innerHTML = songs.map((s, i) => `
      <div class="admin-list-item">
        <span>${s.title} ${s.year ? '(' + s.year + ')' : ''}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteSong(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderFilmsList() {
    const list = document.getElementById('filmsList');
    if (!list) return;
    if (!customData.films.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد أفلام مضافة بعد.</p>'; return; }
    list.innerHTML = customData.films.map((f, i) => `
      <div class="admin-list-item">
        <span>${f.title} ${f.year ? '(' + f.year + ')' : ''}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteFilm(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderConcertsList() {
    const list = document.getElementById('concertsList');
    if (!list) return;
    if (!customData.concerts.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد حفلات مضافة بعد.</p>'; return; }
    list.innerHTML = customData.concerts.map((c, i) => `
      <div class="admin-list-item">
        <span>${c.title} ${c.year ? '(' + c.year + ')' : ''}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteConcert(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderComposersList() {
    const list = document.getElementById('composersList');
    if (!list) return;
    if (!customData.composers.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد ملحنون مضافون بعد.</p>'; return; }
    list.innerHTML = customData.composers.map((c, i) => `
      <div class="admin-list-item">
        <span>${c.name}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteComposer(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderLyricistsList() {
    const list = document.getElementById('lyricistsList');
    if (!list) return;
    if (!customData.lyricists.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا يوجد شعراء مضافون بعد.</p>'; return; }
    list.innerHTML = customData.lyricists.map((l, i) => `
      <div class="admin-list-item">
        <span>${l.name}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteLyricist(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderCategoriesList() {
    const list = document.getElementById('categoriesList');
    if (!list) return;
    if (!customData.categories.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد تصنيفات مضافة بعد.</p>'; return; }
    list.innerHTML = customData.categories.map((c, i) => `
      <div class="admin-list-item">
        <span>${c.name}</span>
        <button class="admin-action-btn" onclick="window._adminDeleteCategory(${i})">حذف</button>
      </div>
    `).join('');
  }

  function renderPhotosList() {
    const list = document.getElementById('photosList');
    if (!list) return;
    if (!customData.photos.length) { list.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem;">لا توجد صور مضافة بعد.</p>'; return; }
    list.innerHTML = customData.photos.map((p, i) => `
      <div class="admin-list-item">
        <span>${p.title}</span>
        <button class="admin-action-btn" onclick="window._adminDeletePhoto(${i})">حذف</button>
      </div>
    `).join('');
  }

  // Delete functions (exposed globally)
  window._adminDeleteSong = (i) => {
    if (!confirm('حذف هذه الأغنية؟')) return;
    customData.songs.splice(i, 1);
    saveCustomData();
    renderSongsList();
  };
  window._adminDeleteFilm = (i) => {
    if (!confirm('حذف هذا الفيلم؟')) return;
    customData.films.splice(i, 1);
    saveCustomData();
    renderFilmsList();
  };
  window._adminDeleteConcert = (i) => {
    if (!confirm('حذف هذه الحفلة؟')) return;
    customData.concerts.splice(i, 1);
    saveCustomData();
    renderConcertsList();
  };
  window._adminDeleteComposer = (i) => {
    if (!confirm('حذف هذا الملحن؟')) return;
    customData.composers.splice(i, 1);
    saveCustomData();
    renderComposersList();
  };
  window._adminDeleteLyricist = (i) => {
    if (!confirm('حذف هذا الشاعر؟')) return;
    customData.lyricists.splice(i, 1);
    saveCustomData();
    renderLyricistsList();
  };
  window._adminDeleteCategory = (i) => {
    if (!confirm('حذف هذا التصنيف؟')) return;
    customData.categories.splice(i, 1);
    saveCustomData();
    renderCategoriesList();
  };
  window._adminDeletePhoto = (i) => {
    if (!confirm('حذف هذه الصورة؟')) return;
    customData.photos.splice(i, 1);
    saveCustomData();
    renderPhotosList();
  };

  // ===== Export/Import =====
  function initExportImport() {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const copyBtn = document.getElementById('copyExportBtn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const allData = JSON.stringify(mergedData, null, 2);
        const blob = new Blob([allData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'abdelhalim-archive-data.json';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const allData = JSON.stringify(mergedData, null, 2);
        navigator.clipboard.writeText(allData).then(() => {
          alert('تم نسخ البيانات إلى الحافظة. الصقها في ملف data.js');
        }).catch(() => {
          alert('تعذر النسخ. استخدم تصدير JSON بدلاً من ذلك.');
        });
      });
    }

    if (importBtn) {
      importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const imported = JSON.parse(ev.target.result);
              if (imported.songs) customData.songs = imported.songs;
              if (imported.films) customData.films = imported.films;
              if (imported.concerts) customData.concerts = imported.concerts;
              if (imported.composers) customData.composers = imported.composers;
              if (imported.lyricists) customData.lyricists = imported.lyricists;
              if (imported.categories) customData.categories = imported.categories;
              if (imported.photos) customData.photos = imported.photos;
              saveCustomData();
              renderSongsList();
              renderFilmsList();
              renderConcertsList();
              renderComposersList();
              renderLyricistsList();
              renderCategoriesList();
              renderPhotosList();
              alert('تم استيراد البيانات بنجاح');
            } catch(err) {
              alert('خطأ: الملف ليس JSON صالح');
            }
          };
          reader.readAsText(file);
        });
        input.click();
      });
    }
  }

  // ===== Search Existing Songs to Add Audio =====
  function initSearchExistingSongs() {
    const input = document.getElementById('searchExistingSong');
    if (!input) return;

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      const results = document.getElementById('existingSongsResults');
      if (!results) return;

      if (!query) {
        results.innerHTML = '';
        return;
      }

      const matches = mergedData.songs.filter(s =>
        s.title.toLowerCase().includes(query) ||
        (s.year && String(s.year).includes(query))
      ).slice(0, 30);

      if (matches.length === 0) {
        results.innerHTML = '<p style="color:var(--color-text-muted); font-size:0.875rem; padding:0.5rem;">لا توجد نتائج</p>';
        return;
      }

      results.innerHTML = matches.map(s => {
        const hasAudio = s.audioUrl && s.audioUrl.trim();
        return `
          <div class="existing-song-item" data-song-id="${s.id}" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; border-bottom:1px solid var(--color-divider);">
            <div>
              <div style="font-size:0.875rem; font-weight:600;">${s.title}</div>
              <div style="font-size:0.75rem; color:var(--color-text-muted);">${s.year || 'غير محدد'} · ${getComposerName(s.composerId)}</div>
              ${hasAudio ? '<div style="font-size:0.75rem; color:var(--color-success, #437a22);">✓ يوجد ملف صوتي</div>' : '<div style="font-size:0.75rem; color:var(--color-text-faint);">⚠ لا يوجد ملف صوتي</div>'}
            </div>
            <button class="admin-action-btn" data-edit-audio="${s.id}" style="font-size:0.75rem;">إضافة صوت</button>
          </div>`;
      }).join('');

      results.querySelectorAll('[data-edit-audio]').forEach(btn => {
        btn.addEventListener('click', () => {
          const songId = btn.getAttribute('data-edit-audio');
          openAudioEditor(songId);
        });
      });
    });
  }

  function openAudioEditor(songId) {
    const song = mergedData.songs.find(s => s.id === songId);
    if (!song) return;

    const results = document.getElementById('existingSongsResults');
    results.innerHTML = `
      <div style="padding:1rem; background:var(--color-bg); border-radius:0.5rem;">
        <h3 style="color:var(--color-primary); margin-bottom:0.5rem;">${song.title}</h3>
        <p style="font-size:0.75rem; color:var(--color-text-muted); margin-bottom:1rem;">${song.year || 'غير محدد'} · ${getComposerName(song.composerId)} · ${getLyricistName(song.lyricistId)}</p>

        <div class="admin-field">
          <label>رابط الصوت (MP3 / M4A / OGG / أو رابط يوتيوب)</label>
          <input type="url" id="editAudioUrl" placeholder="https://..." value="${song.audioUrl || ''}">
        </div>

        <div class="admin-field">
          <label>أو اختر ملفًا صوتيًا من الكمبيوتر</label>
          <input type="file" id="editAudioFile" accept="audio/*">
          <div class="admin-file-info" id="editAudioFileInfo"></div>
        </div>

        <div style="display:flex; gap:0.5rem;">
          <button class="admin-btn" id="saveAudioBtn" style="flex:1;">💾 حفظ الرابط</button>
          <button class="admin-action-btn" id="cancelAudioBtn">إلغاء</button>
        </div>
      </div>
    `;

    // File info
    const fileInput = document.getElementById('editAudioFile');
    const fileInfo = document.getElementById('editAudioFileInfo');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) { fileInfo.textContent = ''; return; }
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const type = file.type || 'غير معروف';
        fileInfo.textContent = `الاسم: ${file.name} | الحجم: ${sizeMB} MB | النوع: ${type}`;
      });
    }

    // Save
    document.getElementById('saveAudioBtn').addEventListener('click', () => {
      const url = document.getElementById('editAudioUrl').value.trim();
      const file = document.getElementById('editAudioFile').files[0];

      let audioUrl = url;

      // Convert YouTube URL to embed audio
      if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
        // Extract video ID
        let videoId = '';
        if (url.includes('youtu.be/')) {
          videoId = url.split('youtu.be/')[1].split('?')[0];
        } else if (url.includes('v=')) {
          videoId = url.split('v=')[1].split('&')[0];
        }
        if (videoId) {
          audioUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        }
      }

      if (file) {
        // For files, we can't upload to GitHub from here, but we can create a local object URL
        // and note the filename for manual upload
        fileInfo.textContent = `⚠ الملف: ${file.name}. ارفعه يدويًا إلى مجلد audio/ ثم أضف المسار: audio/${file.name}`;
        audioUrl = `audio/${file.name}`;
      }

      if (!audioUrl) {
        alert('يرجى إدخال رابط أو اختيار ملف');
        return;
      }

      // Update the song in customData or base data
      let updated = false;

      // Check if it's in customData
      const customIdx = customData.songs.findIndex(s => s.id === songId);
      if (customIdx > -1) {
        customData.songs[customIdx].audioUrl = audioUrl;
        updated = true;
      } else {
        // It's in base data - create a copy in customData with updated audioUrl
        const songCopy = { ...song, audioUrl };
        customData.songs.push(songCopy);
        updated = true;
      }

      if (updated) {
        saveCustomData();
        alert('تم حفظ الرابط الصوتي بنجاح! \n\nملاحظة: لإضافة الملف فعليًا للموقع، ارفعه إلى مجلد audio/ في GitHub ثم حدّث البيانات.');
        // Refresh search
        const searchInput = document.getElementById('searchExistingSong');
        if (searchInput) {
          searchInput.value = '';
          results.innerHTML = '';
        }
      }
    });

    document.getElementById('cancelAudioBtn').addEventListener('click', () => {
      results.innerHTML = '';
      const searchInput = document.getElementById('searchExistingSong');
      if (searchInput) searchInput.value = '';
    });
  }

  function getComposerName(id) {
    const c = mergedData.composers.find(x => x.id === id);
    return c ? c.name : 'غير محدد';
  }
  function getLyricistName(id) {
    const l = mergedData.lyricists.find(x => x.id === id);
    return l ? l.name : 'غير محدد';
  }

  // ===== Init Panel =====
  function initPanel() {
    initTabs();
    populateSelects();
    initAudioFileInput();
    initPhotoFileInput();
    initSearchExistingSongs();
    initAddSong();
    initAddFilm();
    initAddConcert();
    initAddComposer();
    initAddLyricist();
    initAddCategory();
    initAddPhoto();
    initExportImport();

    renderSongsList();
    renderFilmsList();
    renderConcertsList();
    renderComposersList();
    renderLyricistsList();
    renderCategoriesList();
    renderPhotosList();
  }

  // ===== Start =====
  initLogin();
  checkLogin();

})();
