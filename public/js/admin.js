import { $, $$, esc, state, icon, toast, debounce, mediaUrl, imageUrl, fmtTime } from './ui.js';

const app = $('#app');
let LBL = {};

// ============ الشبكة ============
async function A(method, path, body, opts = {}) {
  const headers = { 'X-Requested-With': 'halim' };
  if (body !== undefined && !opts.raw) headers['Content-Type'] = 'application/json';
  if (opts.type) headers['Content-Type'] = opts.type;
  const r = await fetch('/api/admin' + path, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : opts.raw ? body : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw Object.assign(new Error('سجّل الدخول'), { status: 401, silent: true }); }
  if (!r.ok) throw Object.assign(new Error(d.error || 'حدث خطأ'), { status: r.status });
  return d;
}
const fail = (e) => { if (!e.silent) toast(e.message, 'err'); };

function upload(kind, file, { name, thumbFor, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ kind, name: name || file.name });
    if (thumbFor) { qs.set('thumb', '1'); qs.set('for', thumbFor); }
    const x = new XMLHttpRequest();
    x.open('POST', '/api/admin/upload?' + qs);
    x.setRequestHeader('X-Requested-With', 'halim');
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { /* تجاهل */ }
      x.status === 200 ? resolve(d) : reject(new Error(d.error || 'فشل الرفع'));
    };
    x.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'));
    x.send(file);
  });
}

// تصغير الصور في المتصفح: نسخة كاملة (حتى 2400px) ونسخة مصغّرة للشبكات (480px)
async function resize(file, max, q) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  } catch { return null; }
}
async function uploadImage(file, onProgress) {
  const base = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  const full = (await resize(file, 2400, 0.88)) || file;
  const name = full === file ? file.name : base;
  const r = await upload('images', full, { name, onProgress });
  const thumb = await resize(file, 480, 0.8);
  if (thumb) await upload('images', thumb, { name: base, thumbFor: r.file }).catch(() => {});
  return r;
}
const audioDuration = (file) => new Promise((res) => {
  const a = new Audio();
  a.preload = 'metadata';
  a.onloadedmetadata = () => { res(Math.round(a.duration) || null); URL.revokeObjectURL(a.src); };
  a.onerror = () => res(null);
  a.src = URL.createObjectURL(file);
});

// ============ الهيكل ============
const NAV = [
  ['', 'نظرة عامة'], ['new/recordings', '+ أغنية'], ['list/recordings', 'التسجيلات'], ['list/songs', 'الأغاني'], ['list/concerts', 'الحفلات'],
  ['list/sessions', 'الجلسات'], ['list/interviews', 'المقابلات'], ['list/movies', 'الأفلام'], ['list/photos', 'الصور'], ['list/people', 'الأشخاص'],
  ['list/sources', 'المصادر'], ['list/timeline', 'الأحداث'], ['media', 'الملفات'], ['import', 'استيراد'], ['settings', 'الإعدادات'],
];

function shell(active, title, body) {
  app.innerHTML = `<header class="a-top"><div class="a-top__row"><h1>${esc(title)}</h1>
    <span><a class="icon-btn" href="/" aria-label="عرض الموقع" title="عرض الموقع">${icon('home', 20)}</a>
    <button class="icon-btn" id="logout" aria-label="خروج" title="خروج">${icon('logout', 20)}</button></span></div>
    <nav class="a-nav" aria-label="أقسام الإدارة">${NAV.map(([h, t]) => `<a href="#/${h}" class="${h === active ? 'is-on' : ''}">${t}</a>`).join('')}</nav></header>
    <main class="a-main" id="body"></main>`;
  $('#logout').onclick = async () => { await A('POST', '/logout', {}).catch(() => {}); showLogin(); };
  $('#body').append(body);
  $('.a-nav .is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  window.scrollTo(0, 0);
}
const node = (html) => { const t = document.createElement('div'); t.innerHTML = html; return t; };

function showLogin() {
  app.innerHTML = `<div class="login"><h1>لوحة إدارة الأرشيف</h1>
    <div class="field"><label for="pw">كلمة المرور</label><input id="pw" type="password" autocomplete="current-password"></div>
    <button class="btn btn--brass" id="go">دخول</button><p class="hint" id="err" role="alert"></p></div>`;
  const go = async () => {
    try { await A('POST', '/login', { password: $('#pw').value }); route(); } catch (e) { $('#err').textContent = e.silent ? '' : e.message; }
  };
  $('#go').onclick = go;
  $('#pw').addEventListener('keydown', (e) => e.key === 'Enter' && go());
  $('#pw').focus();
}
// نقطة الدخول تُفصل عن showLogin لتجنب التكرار عند انتهاء الجلسة
async function login401() { showLogin(); }

// ============ تعريف الحقول ============
const T = (k, label, extra = {}) => ({ k, t: 'text', label, ...extra });
const DATEF = [
  T('date', 'التاريخ', { ph: '1965-03-21 أو 1965-03 أو 1965', hint: 'اتركه فارغًا إن لم يكن معروفًا. لا تخمّن تاريخًا.', dir: 'ltr' }),
  { k: 'date_certainty', t: 'select', opts: 'certainty', label: 'درجة التأكد من التاريخ', blank: '(تلقائي)' },
  T('year_from', 'تقدير: من سنة', { n: 1, ph: '1965', hint: 'للتاريخ غير المؤكد فقط.' }),
  T('year_to', 'تقدير: إلى سنة', { n: 1, ph: '1967' }),
];
const SRC = { k: '_sources', t: 'sources', label: 'المصادر ودرجة التأكد' };
const REF = (k, ent, label, extra = {}) => ({ k, t: 'ref', ent, label, refKey: k, ...extra });

const E = {
  recordings: {
    one: 'تسجيل', title: 'إضافة أغنية / تسجيل',
    fields: [
      { fs: 'الأغنية' },
      { k: '_song', t: 'ref', ent: 'songs', label: 'اسم الأغنية', create: true, req: true, hint: 'اكتب الاسم واختر من القائمة، أو أنشئ أغنية جديدة. الأغنية الواحدة يمكن أن يكون لها عدة تسجيلات.' },
      { k: 'song_category', t: 'select', opts: 'categories', label: 'تصنيف الأغنية' },
      { k: '_composers', t: 'refs', ent: 'people', label: 'الملحن', create: true },
      { k: '_lyricists', t: 'refs', ent: 'people', label: 'الشاعر', create: true },
      { fs: 'التسجيل' },
      { k: 'rec_type', t: 'select', opts: 'recTypes', label: 'نوع التسجيل' },
      { k: 'is_rare', t: 'check', label: 'تسجيل نادر (يظهر في قسم التسجيلات النادرة)' },
      T('version_title', 'اسم النسخة (اختياري)', { ph: 'مثال: نسخة الحفلة' }),
      ...DATEF,
      T('venue', 'مكان التسجيل'), T('city', 'المدينة'),
      { k: 'audio_file', t: 'audio', label: 'ملف MP3' },
      T('duration_sec', 'مدة التسجيل', { ph: '3:45', hint: 'تُملأ تلقائيًا عند رفع الملف.', dir: 'ltr' }),
      { k: 'image', t: 'image', label: 'صورة مرتبطة بالتسجيل' },
      { fs: 'الارتباطات' },
      REF('concert_id', 'concerts', 'الحفلة', { create: true }), REF('session_id', 'sessions', 'الجلسة', { create: true }),
      REF('interview_id', 'interviews', 'المقابلة', { create: true }), REF('movie_id', 'movies', 'الفيلم', { create: true }),
      REF('arranger_id', 'people', 'الموزع', { create: true }),
      { k: 'description', t: 'area', label: 'ملاحظات تاريخية' },
      SRC,
    ],
    carry: ['concert_id', 'session_id', 'interview_id', 'movie_id', 'rec_type', 'is_rare', 'date', 'date_certainty', 'venue', 'city'],
  },
  songs: {
    one: 'أغنية', title: 'أغنية',
    fields: [
      T('title', 'اسم الأغنية', { req: 1 }), T('title_en', 'الاسم بالإنجليزية', { dir: 'ltr' }),
      { k: 'category', t: 'select', opts: 'categories', label: 'التصنيف' },
      T('year', 'سنة الإصدار أو التسجيل الأول', { n: 1 }),
      { k: 'p_composer', t: 'refs', ent: 'people', label: 'الملحن', create: true, role: 'composer' },
      { k: 'p_lyricist', t: 'refs', ent: 'people', label: 'الشاعر', create: true, role: 'lyricist' },
      { k: 'image', t: 'image', label: 'صورة الأغنية' },
      { k: 'description', t: 'area', label: 'ملاحظات تاريخية' },
      { k: 'lyrics', t: 'area', label: 'الكلمات (اختياري)', hint: 'أضف فقط ما تملك حق نشره. تفيد الكلمات في البحث.' },
      SRC,
    ],
  },
  concerts: {
    one: 'حفلة', title: 'حفلة',
    fields: [
      T('title', 'اسم الحفلة', { req: 1 }), ...DATEF, T('venue', 'المكان'), T('city', 'المدينة'), T('country', 'الدولة'), T('occasion', 'المناسبة'),
      { k: 'image', t: 'image', label: 'صورة الحفلة' }, { k: 'description', t: 'area', label: 'معلومات تاريخية' },
      { k: 'videos', t: 'urls', label: 'روابط فيديو (رابط في كل سطر)' }, { k: '_media', t: 'media', label: 'تسجيلات صوتية وفيديو مرفقة' }, SRC,
    ],
  },
  sessions: {
    one: 'جلسة', title: 'جلسة خاصة',
    fields: [
      T('title', 'اسم الجلسة', { req: 1 }), ...DATEF, T('venue', 'المكان'), T('city', 'المدينة'),
      { k: 'attendees', t: 'area', label: 'الأشخاص الموجودون' }, { k: 'image', t: 'image', label: 'صورة' },
      { k: 'description', t: 'area', label: 'ملاحظات' }, { k: 'videos', t: 'urls', label: 'روابط فيديو' }, { k: '_media', t: 'media', label: 'تسجيلات مرفقة' }, SRC,
    ],
  },
  interviews: {
    one: 'مقابلة', title: 'مقابلة',
    fields: [
      T('title', 'عنوان المقابلة', { req: 1 }), ...DATEF, T('program', 'اسم البرنامج أو الجهة'), T('host', 'المذيع'), T('venue', 'المكان'), T('city', 'المدينة'),
      T('duration_sec', 'المدة', { ph: '12:30', dir: 'ltr' }), { k: 'image', t: 'image', label: 'صورة' }, { k: 'description', t: 'area', label: 'وصف المقابلة' },
      { k: 'videos', t: 'urls', label: 'روابط فيديو' }, { k: '_media', t: 'media', label: 'التسجيل الصوتي / الفيديو' }, SRC,
    ],
  },
  movies: {
    one: 'فيلم', title: 'فيلم',
    fields: [
      T('title', 'اسم الفيلم', { req: 1 }), T('title_en', 'الاسم بالإنجليزية', { dir: 'ltr' }), T('year', 'سنة الإنتاج', { n: 1 }),
      REF('director_id', 'people', 'المخرج', { create: true }), { k: 'cast_text', t: 'area', label: 'الأبطال' }, { k: 'story', t: 'area', label: 'القصة' },
      { k: 'image', t: 'image', label: 'صورة / ملصق (تملك حقه)' }, { k: 'description', t: 'area', label: 'معلومات تاريخية' },
      { k: 'videos', t: 'urls', label: 'روابط فيديو' }, { k: '_media', t: 'media', label: 'وسائط مرفقة' }, SRC,
    ],
  },
  photos: {
    one: 'صورة', title: 'صورة',
    fields: [
      { k: 'file', t: 'image', label: 'ملف الصورة', req: 1 }, T('title', 'العنوان'),
      { k: 'category', t: 'select', opts: 'photoCats', label: 'التصنيف' }, { k: 'color', t: 'select', opts: 'colors', label: 'اللون', blank: '(غير محدد)' },
      ...DATEF, T('place', 'مكان التقاط الصورة'), { k: '_photo_people', t: 'refs', ent: 'people', label: 'الأشخاص في الصورة', create: true },
      REF('concert_id', 'concerts', 'الحفلة'), REF('session_id', 'sessions', 'الجلسة'), REF('movie_id', 'movies', 'الفيلم'), REF('interview_id', 'interviews', 'المقابلة'),
      { k: 'description', t: 'area', label: 'وصف' }, SRC,
    ],
  },
  people: {
    one: 'شخص', title: 'شخص',
    fields: [
      T('name', 'الاسم', { req: 1 }), T('name_en', 'الاسم بالإنجليزية', { dir: 'ltr' }),
      { k: 'roles', t: 'multi', opts: 'roles', label: 'الأدوار' }, T('birth_year', 'سنة الميلاد', { n: 1 }), T('death_year', 'سنة الوفاة', { n: 1 }),
      { k: 'photo', t: 'image', label: 'صورة' }, { k: 'bio', t: 'area', label: 'نبذة' }, SRC,
    ],
  },
  sources: {
    one: 'مصدر', title: 'مصدر',
    fields: [
      T('title', 'عنوان المصدر', { req: 1 }), { k: 'type', t: 'select', opts: 'sourceTypes', label: 'النوع' }, T('author', 'المؤلف'), T('publisher', 'الناشر / الجهة'),
      T('pub_date', 'تاريخ النشر'), T('url', 'الرابط', { dir: 'ltr' }), { k: 'notes', t: 'area', label: 'ملاحظات' },
    ],
  },
  timeline: {
    one: 'حدث', title: 'حدث زمني',
    fields: [
      T('year', 'السنة', { n: 1, req: 1 }), T('date', 'التاريخ الكامل (اختياري)', { dir: 'ltr', ph: '1929-06-21' }), T('title', 'العنوان', { req: 1 }),
      { k: 'kind', t: 'select', opts: 'timelineKinds', label: 'النوع' }, { k: 'certainty', t: 'select', opts: 'certainty', label: 'درجة التأكد' },
      { k: 'description', t: 'area', label: 'الوصف' }, SRC,
    ],
  },
};

const rowInfo = {
  recordings: (r) => [r.song_title + (r.version_title ? ' — ' + r.version_title : ''), [LBL.recTypes?.[r.rec_type], r.year || 'بلا تاريخ', r.audio_file ? 'به ملف صوتي' : 'بلا ملف صوتي', r.concert_title].filter(Boolean).join('، ')],
  songs: (r) => [r.title, `${LBL.categories?.[r.category] || ''}${r.year ? '، ' + r.year : ''}، ${r.rec_count} تسجيل`],
  concerts: (r) => [r.title, [r.date || r.year, r.city].filter(Boolean).join('، ')],
  sessions: (r) => [r.title, [r.date || r.year, r.city].filter(Boolean).join('، ')],
  interviews: (r) => [r.title, [r.date || r.year, r.program].filter(Boolean).join('، ')],
  movies: (r) => [r.title, r.year || ''],
  photos: (r) => [r.title || r.file, [LBL.photoCats?.[r.category], r.year].filter(Boolean).join('، ')],
  people: (r) => [r.name, (r.roles || '').split(',').filter(Boolean).map((x) => LBL.roles[x]).join('، ')],
  sources: (r) => [r.title, LBL.sourceTypes?.[r.type] || ''],
  timeline: (r) => [`${r.year} — ${r.title}`, LBL.timelineKinds?.[r.kind] || ''],
};

// ============ عناصر النماذج ============
function refWidget(f, init) {
  const multi = f.t === 'refs';
  let vals = init ? (multi ? [...init] : [init]) : [];
  const el = document.createElement('div');
  el.className = 'refw';
  el.innerHTML = `<div class="refw__chips"></div><input type="text" autocomplete="off" placeholder="${multi ? 'اكتب للبحث أو للإضافة' : 'اكتب للبحث'}" aria-label="${esc(f.label)}"><div class="refw__list" hidden></div>`;
  const chipsBox = $('.refw__chips', el);
  const input = $('input', el);
  const listBox = $('.refw__list', el);
  const draw = () => {
    chipsBox.innerHTML = vals.map((v, i) => `<span class="rchip${v.id ? '' : ' is-new'}">${esc(v.label || v.name || v.title)}${v.id ? '' : ' (جديد)'}<button type="button" data-i="${i}" aria-label="إزالة">${icon('x', 16)}</button></span>`).join('');
    input.hidden = !multi && vals.length > 0;
  };
  chipsBox.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { vals.splice(Number(b.dataset.i), 1); draw(); input.focus(); } });
  const pick = (v) => { if (!multi) vals = []; if (!vals.some((x) => (x.id && x.id === v.id) || (!x.id && !v.id && x.label === v.label))) vals.push(v); input.value = ''; listBox.hidden = true; draw(); };
  const search = debounce(async () => {
    const q = input.value.trim();
    if (!q) { listBox.hidden = true; return; }
    try {
      const rows = await A('GET', `/lookup?type=${f.ent}&q=${encodeURIComponent(q)}`);
      const has = rows.some((r) => r.label === q);
      listBox.innerHTML = rows.map((r) => `<button type="button" data-id="${r.id}" data-l="${esc(r.label)}">${esc(r.label)}</button>`).join('') +
        (f.create && !has ? `<button type="button" class="new" data-new="${esc(q)}">+ إنشاء «${esc(q)}»</button>` : '') || '<button type="button" disabled>لا توجد نتائج</button>';
      listBox.hidden = false;
    } catch (e) { fail(e); }
  }, 180);
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = $('button[data-id],button[data-new]', listBox); first?.click(); }
  });
  listBox.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    pick(b.dataset.id ? { id: Number(b.dataset.id), label: b.dataset.l } : { label: b.dataset.new, name: b.dataset.new });
  });
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) listBox.hidden = true; });
  draw();
  return {
    el,
    get: () => (multi ? vals.map((v) => (v.id ? { id: v.id } : { name: v.name || v.label })) : (vals[0] ? (vals[0].id ? { id: vals[0].id } : { title: vals[0].label, name: vals[0].label }) : null)),
    raw: () => vals,
  };
}

function fileWidget(f, value, hooks) {
  const el = document.createElement('div');
  el.className = 'filew';
  const kind = f.t === 'audio' ? 'audio' : 'images';
  el.innerHTML = `<div class="filew__row"><input type="text" dir="ltr" placeholder="اسم الملف أو رابط" value="${esc(value || '')}" aria-label="${esc(f.label)}">
    <button type="button" class="btn btn--ghost" data-up>${icon('upload', 18)} رفع</button><input type="file" hidden accept="${kind === 'audio' ? 'audio/*,.mp3,.m4a,.flac,.wav,.ogg' : 'image/*'}"></div>
    <div class="bar" hidden><i></i></div><div class="prev"></div>`;
  const txt = $('input[type=text]', el);
  const fileIn = $('input[type=file]', el);
  const bar = $('.bar', el);
  const prev = $('.prev', el);
  const showPrev = () => {
    const v = txt.value.trim();
    prev.innerHTML = !v ? '' : kind === 'audio' ? `<audio controls preload="none" src="${esc(mediaUrl('audio', v))}"></audio>` : `<img src="${esc(imageUrl(v, true))}" data-full="${esc(mediaUrl('images', v))}" alt="">`;
  };
  $('[data-up]', el).onclick = () => fileIn.click();
  txt.addEventListener('change', showPrev);
  fileIn.onchange = async () => {
    const file = fileIn.files[0];
    if (!file) return;
    bar.hidden = false;
    const setP = (p) => { $('i', bar).style.width = Math.round(p * 100) + '%'; };
    try {
      const r = kind === 'audio' ? await upload('audio', file, { onProgress: setP }) : await uploadImage(file, setP);
      txt.value = r.file;
      if (kind === 'audio') hooks?.onAudio?.(file);
      showPrev();
      toast('تم رفع الملف', 'ok');
    } catch (e) { fail(e); } finally { bar.hidden = true; fileIn.value = ''; }
  };
  showPrev();
  return { el, get: () => txt.value.trim() || null };
}

function sourcesWidget(items, meta) {
  const el = document.createElement('div');
  el.className = 'repeat';
  const rows = [];
  const add = (it) => {
    const item = document.createElement('div');
    item.className = 'repeat__item';
    const ref = refWidget({ ent: 'sources', create: true, label: 'المصدر' }, it?.source_id ? { id: it.source_id, label: it.title } : null);
    const opts = (map, cur, blank) => `${blank ? `<option value="">${blank}</option>` : ''}${Object.entries(map).map(([k, v]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;
    item.innerHTML = `<button type="button" class="icon-btn rm" aria-label="حذف المصدر">${icon('x', 18)}</button>
      <div class="field"><span class="lbl">المصدر</span></div>
      <div class="grid2"><div class="field"><label>المعلومة التي يدعمها</label><select data-f="field">${opts(meta.fields, it?.field, 'معلومة عامة')}</select></div>
      <div class="field"><label>درجة التأكد</label><select data-f="certainty">${opts(meta.certainty, it?.certainty || 'confirmed')}</select></div></div>
      <div class="field"><label>ملاحظة (رقم الصفحة، تاريخ العدد...)</label><input type="text" data-f="note" value="${esc(it?.note || '')}"></div>`;
    $('.field', item).append(ref.el);
    $('.rm', item).onclick = () => { item.remove(); rows.splice(rows.findIndex((r) => r.item === item), 1); };
    rows.push({ item, ref });
    list.append(item);
  };
  const list = document.createElement('div');
  list.className = 'repeat';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn btn--ghost'; btn.innerHTML = `${icon('plus', 18)} إضافة مصدر`;
  btn.onclick = () => add();
  el.append(list, btn);
  (items || []).forEach(add);
  return {
    el,
    get: () => rows.map(({ item, ref }) => {
      const s = ref.get();
      if (!s) return null;
      return { source_id: s.id, source_title: s.id ? null : s.title, field: $('[data-f=field]', item).value || null, certainty: $('[data-f=certainty]', item).value, note: $('[data-f=note]', item).value.trim() || null };
    }).filter(Boolean),
  };
}

function mediaWidget(items) {
  const el = document.createElement('div');
  el.className = 'repeat';
  const rows = [];
  const list = document.createElement('div');
  list.className = 'repeat';
  const add = (m = {}) => {
    const item = document.createElement('div');
    item.className = 'repeat__item';
    item.innerHTML = `<button type="button" class="icon-btn rm" aria-label="حذف">${icon('x', 18)}</button>
      <div class="grid2"><div class="field"><label>النوع</label><select data-f="kind"><option value="audio"${m.kind !== 'video' ? ' selected' : ''}>صوت</option><option value="video"${m.kind === 'video' ? ' selected' : ''}>فيديو (رابط)</option></select></div>
      <div class="field"><label>العنوان</label><input type="text" data-f="title" value="${esc(m.title || '')}"></div></div>
      <div class="field"><label>رابط الفيديو (يوتيوب أو فيميو)</label><input type="text" dir="ltr" data-f="url" value="${esc(m.url || '')}"></div><div class="fw"></div>`;
    const fw = fileWidget({ t: 'audio', label: 'ملف الصوت' }, m.file, { onAudio: async (f) => { $('[data-f=dur]', item).value = fmtTime(await audioDuration(f)); } });
    $('.fw', item).append(Object.assign(document.createElement('div'), { className: 'field' }));
    $('.fw .field', item).append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: 'ملف صوتي' }), fw.el);
    $('.fw', item).insertAdjacentHTML('beforeend', `<div class="field"><label>المدة</label><input type="text" dir="ltr" data-f="dur" value="${m.duration_sec ? fmtTime(m.duration_sec) : ''}" placeholder="3:45"></div>`);
    $('.rm', item).onclick = () => { item.remove(); rows.splice(rows.findIndex((r) => r.item === item), 1); };
    rows.push({ item, fw });
    list.append(item);
  };
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn btn--ghost'; btn.innerHTML = `${icon('plus', 18)} إضافة وسائط`;
  btn.onclick = () => add();
  el.append(list, btn);
  (items || []).forEach(add);
  return {
    el,
    get: () => rows.map(({ item, fw }) => ({
      kind: $('[data-f=kind]', item).value, title: $('[data-f=title]', item).value.trim(), url: $('[data-f=url]', item).value.trim() || null,
      file: fw.get(), duration_sec: $('[data-f=dur]', item).value.trim() || null,
    })),
  };
}

// ============ النموذج ============
async function form(name, id, prefill = {}) {
  const C = E[name];
  const detail = id ? await A('GET', `/e/${name}/${id}`) : null;
  const item = detail?.item || {};
  const body = document.createElement('div');
  const getters = [];
  let cur = body;
  const meta = { fields: LBL.fields, certainty: LBL.certainty };

  const initRef = (f) => {
    if (id && f.k === '_song') return detail.song ? { id: detail.song.id, label: detail.song.title } : null;
    if (id && f.refKey && detail.refs?.[f.refKey]) return detail.refs[f.refKey];
    return prefill['ref:' + f.k] || null;
  };

  for (const f of C.fields) {
    if (f.fs) { const fs = document.createElement('fieldset'); fs.innerHTML = `<legend>${esc(f.fs)}</legend>`; body.append(fs); cur = fs; continue; }
    const field = document.createElement('div');
    field.className = 'field' + (f.t === 'check' ? ' check' : '');
    const val = item[f.k] ?? prefill[f.k] ?? '';
    const lbl = `<label for="f_${f.k}">${esc(f.label)}${f.req ? ' *' : ''}</label>`;
    let get;
    if (f.t === 'text') {
      field.innerHTML = `${lbl}<input id="f_${f.k}" type="text" ${f.n ? 'inputmode="numeric"' : ''} ${f.dir ? `dir="${f.dir}"` : ''} placeholder="${esc(f.ph || '')}" value="${esc(f.k === 'duration_sec' && val ? fmtTime(val) : val)}">${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}`;
      get = () => $('input', field).value.trim();
    } else if (f.t === 'area') {
      field.innerHTML = `${lbl}<textarea id="f_${f.k}">${esc(val)}</textarea>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}`;
      get = () => $('textarea', field).value;
    } else if (f.t === 'urls') {
      field.innerHTML = `${lbl}<textarea id="f_${f.k}" dir="ltr">${esc((Array.isArray(val) ? val : []).join('\n'))}</textarea>`;
      get = () => $('textarea', field).value.split('\n').map((x) => x.trim()).filter(Boolean);
    } else if (f.t === 'select') {
      const map = LBL[f.opts] || {};
      const v = val || (f.k === 'rec_type' ? 'studio' : f.k === 'kind' ? 'milestone' : map.other ? 'other' : '');
      field.innerHTML = `${lbl}<select id="f_${f.k}">${f.blank !== undefined || f.opts === 'certainty' || f.opts === 'colors' ? `<option value="">${f.blank || '(بدون)'}</option>` : ''}${Object.entries(map).map(([k, t]) => `<option value="${k}"${v === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      get = () => $('select', field).value;
    } else if (f.t === 'multi') {
      const set = new Set(String(val || '').split(',').filter(Boolean));
      field.innerHTML = `<span class="lbl">${esc(f.label)}</span><div class="chips">${Object.entries(LBL[f.opts]).map(([k, t]) => `<label class="chip"><input type="checkbox" value="${k}" ${set.has(k) ? 'checked' : ''}>&nbsp;${esc(t)}</label>`).join('')}</div>`;
      get = () => $$('input:checked', field).map((x) => x.value).join(',');
    } else if (f.t === 'check') {
      field.innerHTML = `<input id="f_${f.k}" type="checkbox" ${Number(val) ? 'checked' : ''}>${lbl}`;
      get = () => ($('input', field).checked ? 1 : 0);
    } else if (f.t === 'ref' || f.t === 'refs') {
      let init = initRef(f);
      if (f.t === 'refs') {
        if (id && name === 'recordings') init = detail.people?.[f.k === '_composers' ? 'composer' : 'lyricist']?.map((p) => ({ id: p.id, label: p.name }));
        else if (id && name === 'songs') init = detail.people?.[f.role]?.map((p) => ({ id: p.id, label: p.name }));
        else if (id && name === 'photos') init = detail.people?.map((p) => ({ id: p.id, label: p.name }));
        else init = prefill['refs:' + f.k];
      }
      const w = refWidget(f, init);
      field.innerHTML = `<span class="lbl">${esc(f.label)}${f.req ? ' *' : ''}</span>`;
      field.append(w.el);
      if (f.hint) field.insertAdjacentHTML('beforeend', `<p class="hint">${esc(f.hint)}</p>`);
      get = () => w.get();
      field._w = w;
    } else if (f.t === 'audio' || f.t === 'image') {
      const w = fileWidget(f, val, {
        onAudio: async (file) => {
          const d = await audioDuration(file);
          const dur = $('#f_duration_sec');
          if (d && dur && !dur.value) dur.value = fmtTime(d);
        },
      });
      field.innerHTML = `<span class="lbl">${esc(f.label)}${f.req ? ' *' : ''}</span>`;
      field.append(w.el);
      get = () => w.get();
    } else if (f.t === 'sources') {
      const w = sourcesWidget(detail?.sources, meta);
      field.innerHTML = `<span class="lbl">${esc(f.label)}</span><p class="hint">اربط كل معلومة بمصدرها، ويمكن إضافة أكثر من مصدر بدرجات تأكد مختلفة.</p>`;
      field.append(w.el);
      get = () => w.get();
    } else if (f.t === 'media') {
      const w = mediaWidget(detail?.media);
      field.innerHTML = `<span class="lbl">${esc(f.label)}</span>`;
      field.append(w.el);
      get = () => w.get();
    }
    getters.push([f, get, field._w]);
    cur.append(field);
  }

  const collect = () => {
    const out = {};
    const refs = {};
    const people = {};
    for (const [f, get] of getters) {
      const v = get();
      if (f.t === 'ref') {
        if (f.k === '_song') out._song = v;
        else refs[f.refKey] = v;
      } else if (f.k === 'p_composer' || f.k === 'p_lyricist') people[f.role] = v;
      else out[f.k] = v;
    }
    if (Object.keys(refs).length) out._refs = refs;
    if (name === 'songs') out._people = people;
    return out;
  };

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.innerHTML = `<button class="btn btn--brass" data-s="1">حفظ</button>${!id && name === 'recordings' ? '<button class="btn btn--ghost" data-s="2">حفظ وإضافة أخرى</button>' : ''}
    <a class="btn btn--ghost" href="#/list/${name}">إلغاء</a>
    ${id ? `<button class="btn btn--danger" data-del style="margin-inline-start:auto">حذف</button>` : ''}`;
  body.append(actions);
  actions.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del) {
      if (!confirm(`حذف هذا ${C.one}؟ لا يمكن التراجع.${name === 'songs' ? '\nسيُحذف معه كل تسجيلاته (ملفات MP3 نفسها تبقى في مجلد الصوت).' : ''}`)) return;
      try { await A('DELETE', `/e/${name}/${id}`); toast('تم الحذف', 'ok'); location.hash = `#/list/${name}`; } catch (er) { fail(er); }
      return;
    }
    const data = collect();
    if (name === 'recordings' && !data._song && !id) return toast('اكتب اسم الأغنية أولًا', 'warn');
    b.disabled = true;
    try {
      await A(id ? 'PUT' : 'POST', `/e/${name}${id ? '/' + id : ''}`, data);
      toast('تم الحفظ', 'ok');
      if (b.dataset.s === '2') {
        const carry = {};
        for (const k of C.carry) if (data[k] !== undefined) carry[k] = data[k];
        pendingCarry = { ...carry, __refs: getters.filter(([f]) => f.t === 'ref' && f.refKey).map(([f, , w]) => [f.k, w.raw()[0] || null]) };
        route(true);
      } else location.hash = `#/list/${name}`;
    } catch (er) { fail(er); b.disabled = false; }
  });
  return body;
}
let pendingCarry = null;

// ============ الشاشات ============
async function screenHome() {
  const s = await A('GET', '/stats');
  const c = s.counts;
  const box = node(`
    <p><a class="btn btn--brass" href="#/new/recordings">${icon('plus', 20)} إضافة أغنية</a></p>
    ${s.unlinkedAudio || s.unlinkedImages ? `<div class="alert">يوجد في مجلدات الوسائط ${s.unlinkedAudio} ملف صوتي و${s.unlinkedImages} صورة غير مرتبطة بأي سجل. <a href="#/media">ربطها الآن</a></div>` : ''}
    ${s.demo ? `<div class="alert">في الأرشيف ${s.demo} عنصر تجريبي (علامتها «عينة»). <button class="btn btn--ghost" id="deldemo">حذف البيانات التجريبية</button></div>` : ''}
    <h2>محتوى الأرشيف</h2>
    <div class="stat">${[['recordings', 'التسجيلات'], ['songs', 'الأغاني'], ['concerts', 'الحفلات'], ['sessions', 'الجلسات'], ['interviews', 'المقابلات'], ['movies', 'الأفلام'], ['photos', 'الصور'], ['people', 'الأشخاص'], ['sources', 'المصادر'], ['timeline', 'الأحداث']]
      .map(([k, t]) => `<a href="#/list/${k}"><b>${c[k]}</b>${t}</a>`).join('')}</div>
    <h2>أين تُحفظ بياناتك؟</h2>
    <p class="hint">المجلد: <bdi dir="ltr">${esc(s.dataDir)}</bdi>. كل ما في هذا المجلد (قاعدة البيانات والصوت والصور) مستقل عن كود الموقع ولا يُمسّ عند التحديث.</p>`);
  shell('', 'نظرة عامة', box);
  $('#deldemo')?.addEventListener('click', async () => {
    if (!confirm('سيُحذف كل ما علامته «عينة». متابعة؟')) return;
    try { const r = await A('POST', '/delete-demo', {}); toast(`حُذف ${r.removed} عنصر`, 'ok'); route(); } catch (e) { fail(e); }
  });
}

async function screenList(name, q = '') {
  const C = E[name];
  const box = node(`<div class="field"><input type="search" id="lq" placeholder="بحث في ${esc(C.one)}..." value="${esc(q)}" aria-label="بحث"></div>
    <p><a class="btn btn--brass" href="#/new/${name}">${icon('plus', 20)} إضافة ${esc(C.one)}</a></p><ul class="a-list" id="rows"></ul><div id="more"></div>`);
  shell(`list/${name}`, C.title === 'إضافة أغنية / تسجيل' ? 'التسجيلات' : C.title, box);
  let offset = 0;
  let total = 0;
  const rows = $('#rows');
  const load = async (reset) => {
    if (reset) { offset = 0; rows.innerHTML = ''; }
    try {
      const d = await A('GET', `/e/${name}?q=${encodeURIComponent($('#lq').value)}&limit=30&offset=${offset}`);
      total = d.total;
      rows.insertAdjacentHTML('beforeend', d.rows.map((r) => {
        const [t, sub] = rowInfo[name](r);
        return `<li class="a-row"><span class="a-row__t"><b>${esc(t)}</b><small>${esc(sub)}</small></span>
          ${name === 'songs' ? `<a class="icon-btn" href="#/new/recordings?song=${r.id}&t=${encodeURIComponent(r.title)}" title="إضافة تسجيل" aria-label="إضافة تسجيل">${icon('music', 20)}</a>` : ''}
          <a class="icon-btn" href="#/edit/${name}/${r.id}" aria-label="تعديل">${icon('edit', 20)}</a>
          <button class="icon-btn danger" data-del="${r.id}" aria-label="حذف">${icon('trash', 20)}</button></li>`;
      }).join('') || (offset ? '' : '<li class="muted" style="padding:1rem 0">لا توجد عناصر.</li>'));
      offset += d.rows.length;
      $('#more').innerHTML = offset < total ? '<button class="btn btn--ghost">عرض المزيد</button>' : `<p class="hint">${total} عنصر</p>`;
      $('#more button')?.addEventListener('click', () => load());
    } catch (e) { fail(e); }
  };
  $('#lq').addEventListener('input', debounce(() => load(true), 250));
  rows.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('حذف هذا العنصر؟ لا يمكن التراجع.')) return;
    try { await A('DELETE', `/e/${name}/${b.dataset.del}`); b.closest('li').remove(); toast('تم الحذف', 'ok'); } catch (er) { fail(er); }
  });
  load(true);
}

async function screenForm(name, id, hashQ) {
  const C = E[name];
  const prefill = {};
  if (pendingCarry) {
    const pc = pendingCarry;
    pendingCarry = null;
    for (const [k, v] of Object.entries(pc)) if (k !== '__refs' && !k.startsWith('ref:')) prefill[k] = v;
    for (const [k, v] of pc.__refs) if (v) prefill['ref:' + k] = v;
  }
  if (hashQ?.song) prefill['ref:_song'] = { id: Number(hashQ.song), label: hashQ.t || 'الأغنية المحددة' };
  const body = await form(name, id, prefill);
  shell(name === 'recordings' ? 'new/recordings' : `list/${name}`, id ? `تعديل ${C.one}` : name === 'recordings' ? 'إضافة أغنية / تسجيل' : `إضافة ${C.one}`, body);
  if (id && name === 'songs') {
    const d = await A('GET', `/e/songs/${id}`);
    $('#body').insertAdjacentHTML('afterbegin', `<h2>تسجيلات هذه الأغنية (${d.recordings.length})</h2><ul class="a-list">${d.recordings.map((r) => `<li class="a-row"><span class="a-row__t"><b>${esc(r.version_title || LBL.recTypes[r.rec_type])}</b><small>${esc([r.year, r.audio_file ? 'به ملف صوتي' : 'بلا ملف'].filter(Boolean).join('، '))}</small></span><a class="icon-btn" href="#/edit/recordings/${r.id}" aria-label="تعديل">${icon('edit', 20)}</a></li>`).join('')}</ul>
      <p><a class="btn btn--ghost" href="#/new/recordings?song=${id}&t=${encodeURIComponent(d.item.title)}">${icon('plus', 18)} إضافة تسجيل / نسخة أخرى</a></p><h2>بيانات الأغنية</h2>`);
  }
}

async function screenMedia() {
  const box = node(`<h2>رفع ملفات دفعة واحدة</h2>
    <p class="hint">اسحب ملفات MP3 أو الصور هنا (أو اختر عدة ملفات). بعد الرفع اضغط «إنشاء سجلات» لتُنشأ لها سجلات، ثم عدّل بياناتها. لآلاف الملفات يمكنك نسخها مباشرة إلى مجلد <bdi dir="ltr">data/media/audio</bdi> ثم تظهر هنا.</p>
    <div class="drop" id="drop"><p>اسحب الملفات إلى هنا</p><button class="btn btn--brass" id="pick">اختيار ملفات</button><input id="multi" type="file" multiple hidden accept="audio/*,image/*,.mp3,.m4a,.flac,.wav"></div>
    <div class="bar" id="ubar" hidden><i></i></div><p class="hint" id="ustat"></p>
    <h2>الصوت</h2><div id="audioBox"></div><h2>الصور</h2><div id="imgBox"></div>`);
  shell('media', 'ملفات الوسائط', box);
  const AUD = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma)$/i;
  const drawScan = async (kind, host) => {
    const d = await A('GET', `/media/${kind}`);
    host.innerHTML = `<p>${d.total} ملف، منها <b>${d.unlinked}</b> غير مرتبط.</p>
      ${d.unlinked ? `<div class="grid2"><div class="field"><label>نوع التسجيلات الجديدة</label><select id="${kind}-t">${kind === 'audio' ? Object.entries(LBL.recTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('') : Object.entries(LBL.photoCats).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
      <button class="btn btn--brass" data-adopt="${kind}">إنشاء سجلات لكل الملفات غير المرتبطة (${d.unlinked})</button>` : ''}
      <div class="files" style="margin-top:.8rem">${d.files.map((f) => `<div class="${f.linked ? 'off' : ''}"><bdi dir="ltr">${esc(f.file)}</bdi><span>${f.linked ? 'مرتبط' : 'غير مرتبط'}</span></div>`).join('') || '<div class="off">لا توجد ملفات.</div>'}</div>`;
  };
  const refresh = () => Promise.all([drawScan('audio', $('#audioBox')), drawScan('images', $('#imgBox'))]).catch(fail);
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-adopt]');
    if (!b) return;
    const kind = b.dataset.adopt;
    const t = $(`#${kind}-t`).value;
    b.disabled = true;
    try {
      const r = await A('POST', '/media/adopt', kind === 'audio' ? { kind, rec_type: t } : { kind, category: t });
      toast(`أُنشئ ${r.created} سجل. عدّل بياناتها من القوائم.`, 'ok');
      refresh();
    } catch (er) { fail(er); b.disabled = false; }
  });
  const handle = async (files) => {
    files = [...files];
    const bar = $('#ubar');
    let n = 0;
    let bad = 0;
    bar.hidden = false;
    for (const f of files) {
      $('#ustat').textContent = `رفع ${n + 1} من ${files.length}: ${f.name}`;
      try {
        if (AUD.test(f.name)) await upload('audio', f, { onProgress: (p) => { $('i', bar).style.width = Math.round(((n + p) / files.length) * 100) + '%'; } });
        else await uploadImage(f, (p) => { $('i', bar).style.width = Math.round(((n + p) / files.length) * 100) + '%'; });
      } catch (er) { bad++; toast(`${f.name}: ${er.message}`, 'err'); }
      n++;
    }
    bar.hidden = true;
    $('#ustat').textContent = `تم رفع ${files.length - bad} ملف${bad ? ` وفشل ${bad}` : ''}.`;
    refresh();
  };
  $('#pick').onclick = () => $('#multi').click();
  $('#multi').onchange = (e) => handle(e.target.files);
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => handle(e.dataTransfer.files));
  refresh();
}

async function screenImport() {
  const types = await A('GET', '/import-types');
  const box = node(`<p class="hint">استورد آلاف الأغاني أو الحفلات دفعة واحدة من ملف CSV (يفتح في Excel) أو JSON. الأعمدة تقبل الأسماء العربية كما في القالب. الصفوف المكررة تُتجاوز، فيمكن إعادة الاستيراد بأمان.</p>
    <div class="field"><label for="itype">نوع البيانات</label><select id="itype">${types.map((t) => `<option value="${t.key}">${t.name}</option>`).join('')}<option value="multi">ملف JSON متعدد الأنواع</option></select></div>
    <div id="cols" class="alert"></div>
    <p><a class="btn btn--ghost" id="tpl" href="#">${icon('download', 18)} تنزيل قالب CSV</a></p>
    <div class="field"><label for="ifile">اختر ملف CSV أو JSON</label><input id="ifile" type="file" accept=".csv,.json,.txt,text/csv,application/json"></div>
    <div class="field"><label for="itext">أو الصق المحتوى هنا</label><textarea id="itext" class="code"></textarea></div>
    <div class="actions"><button class="btn btn--ghost" id="dry">تجربة بدون حفظ</button><button class="btn btn--brass" id="do">استيراد</button></div><div id="rep"></div>`);
  shell('import', 'استيراد بيانات', box);
  const upd = () => {
    const k = $('#itype').value;
    const t = types.find((x) => x.key === k);
    $('#cols').innerHTML = t ? `<b>الأعمدة:</b> ${t.columns.map(esc).join('، ')}<br><small>الفصل بين عدة قيم في نفس الخانة (مثل عدة ملحنين) يكون بالفاصلة المنقوطة ؛</small>` : 'مفاتيح JSON: people, sources, concerts, sessions, interviews, movies, recordings (أو songs), photos, timeline';
    $('#tpl').hidden = !t;
    $('#tpl').href = `/api/admin/template/${k}`;
  };
  $('#itype').onchange = upd;
  upd();
  $('#ifile').onchange = async (e) => { const f = e.target.files[0]; if (f) $('#itext').value = await f.text(); };
  const run = async (dry) => {
    const text = $('#itext').value.trim();
    if (!text) return toast('اختر ملفًا أو الصق البيانات', 'warn');
    const k = $('#itype').value;
    try {
      const r = await A('POST', `${k === 'multi' ? '/import' : '/import/' + k}?dry=${dry ? 1 : 0}`, text, { raw: true, type: text.startsWith('[') || text.startsWith('{') ? 'application/json' : 'text/csv' });
      $('#rep').innerHTML = r.reports.map((x) => `<div class="report"><b>${esc(x.name)}</b>${r.dry ? ' (تجربة، لم يُحفظ شيء)' : ''}<br>
        الإجمالي ${x.total}، جديد أو محدّث ${x.created}، مكرر تم تجاوزه ${x.skipped}، أخطاء ${x.errors.length}
        ${x.errors.length ? `<ul>${x.errors.map((e) => `<li>السطر ${e.row}: ${esc(e.message)}</li>`).join('')}</ul>` : ''}</div>`).join('');
      if (!dry) toast('اكتمل الاستيراد', 'ok');
    } catch (e) { fail(e); }
  };
  $('#dry').onclick = () => run(true);
  $('#do').onclick = () => run(false);
}

async function screenSettings() {
  const s = await A('GET', '/settings');
  const hero = fileWidget({ t: 'image', label: 'صورة الغلاف' }, s.hero_image, {});
  const box = node(`<h2>الموقع</h2>
    <div class="field"><label>اسم الموقع</label><input id="s_site_title" value="${esc(s.site_title || '')}"></div>
    <div class="field"><label>العنوان الفرعي</label><input id="s_tagline" value="${esc(s.tagline || '')}"></div>
    <div class="field"><label>نبذة الصفحة الرئيسية</label><textarea id="s_about">${esc(s.about || '')}</textarea></div>
    <div class="field"><span class="lbl">صورة الغلاف (صورة تملك حق استخدامها)</span><div id="heroW"></div></div>
    <div class="field"><label>تعليق الصورة</label><input id="s_hero_caption" value="${esc(s.hero_caption || '')}"></div>
    <div class="field"><label>نص أسفل الموقع</label><textarea id="s_footer_note">${esc(s.footer_note || '')}</textarea></div>
    <p><button class="btn btn--brass" id="save">حفظ الإعدادات</button></p>
    <h2>النسخ الاحتياطي</h2>
    <p class="hint">النسخة الاحتياطية تشمل قاعدة البيانات. ملفات الصوت والصور تُنسخ بنسخ مجلد <bdi dir="ltr">media</bdi> بالكامل.</p>
    <p><a class="btn btn--ghost" href="/api/admin/backup">${icon('download', 18)} تنزيل قاعدة البيانات (.db)</a> <a class="btn btn--ghost" href="/api/admin/export">${icon('download', 18)} تصدير JSON</a></p>
    <p><button class="btn btn--ghost" id="reindex">إعادة بناء فهرس البحث</button></p>
    <h2>تغيير كلمة المرور</h2>
    <div class="grid2"><div class="field"><label>الحالية</label><input id="pw0" type="password" autocomplete="current-password"></div>
    <div class="field"><label>الجديدة (8 أحرف على الأقل)</label><input id="pw1" type="password" autocomplete="new-password"></div></div>
    <p><button class="btn btn--ghost" id="chpw">تغيير كلمة المرور</button></p>`);
  shell('settings', 'الإعدادات', box);
  $('#heroW').append(hero.el);
  $('#save').onclick = async () => {
    try {
      await A('PUT', '/settings', { site_title: $('#s_site_title').value, tagline: $('#s_tagline').value, about: $('#s_about').value, hero_image: hero.get() || '', hero_caption: $('#s_hero_caption').value, footer_note: $('#s_footer_note').value });
      toast('تم حفظ الإعدادات', 'ok');
    } catch (e) { fail(e); }
  };
  $('#reindex').onclick = async () => { try { await A('POST', '/reindex', {}); toast('تمت إعادة الفهرسة', 'ok'); } catch (e) { fail(e); } };
  $('#chpw').onclick = async () => {
    try { await A('POST', '/password', { old: $('#pw0').value, new: $('#pw1').value }); toast('تم تغيير كلمة المرور', 'ok'); $('#pw0').value = ''; $('#pw1').value = ''; } catch (e) { fail(e); }
  };
}

// ============ التوجيه ============
async function route() {
  let authed = false;
  try { authed = (await (await fetch('/api/admin/me', { credentials: 'same-origin' })).json()).authed; } catch { /* تجاهل */ }
  if (!authed) return showLogin();
  if (!state.meta) { state.meta = await (await fetch('/api/meta')).json(); LBL = state.meta.labels; }
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const p = path.split('/').filter(Boolean);
  try {
    if (!p.length) return await screenHome();
    if (p[0] === 'list' && E[p[1]]) return await screenList(p[1]);
    if (p[0] === 'new' && E[p[1]]) return await screenForm(p[1], null, q);
    if (p[0] === 'edit' && E[p[1]]) return await screenForm(p[1], Number(p[2]), q);
    if (p[0] === 'media') return await screenMedia();
    if (p[0] === 'import') return await screenImport();
    if (p[0] === 'settings') return await screenSettings();
    location.hash = '#/';
  } catch (e) { fail(e); }
}
window.addEventListener('hashchange', () => route());
void login401;
route();
