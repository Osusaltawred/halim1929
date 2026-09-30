import {
  $, $$, esc, api, state, img, cover, icon, fmtTime, fmtDate, dateText, certBadge, mediaUrl, NEEDS, L, debounce, imageUrl,
} from './ui.js';
import { Player } from './player.js';
import { openLightbox } from './lightbox.js';

const view = $('#view');
const reg = new Map(); // عناصر التشغيل المسجّلة: مفتاح -> بيانات
const DECADES = [1930, 1940, 1950, 1960, 1970];
let token = 0; // لإلغاء عرض صفحة قديمة إذا تنقل المستخدم بسرعة

// ============ أدوات ============
const parseQS = (s) => Object.fromEntries(new URLSearchParams(s || ''));
function here() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  return { path, q: parseQS(qs) };
}
function href(patch, base) {
  const cur = here();
  const q = { ...(base ? {} : cur.q), ...patch };
  for (const k of Object.keys(q)) if (q[k] === '' || q[k] === null || q[k] === undefined) delete q[k];
  const s = new URLSearchParams(q).toString();
  return '#' + cur.path + (s ? '?' + s : '');
}
const go = (patch) => { location.hash = href(patch).slice(1); };

const NEED = `<span class="muted">${NEEDS}</span>`;
const list = (a) => (a || []).filter(Boolean);
const people = (arr, role) => arr.filter((p) => p.role === role);
const personLinks = (arr) => arr.map((p) => `<a href="#/person/${p.id}">${esc(p.name)}</a>`).join('، ');

function empty(msg, hint) {
  return `<div class="empty"><p class="empty__t">${esc(msg)}</p>${hint ? `<p class="empty__h">${esc(hint)}</p>` : ''}
    <a class="btn btn--ghost" href="/admin">فتح لوحة الإدارة</a></div>`;
}

function pageHead(title, sub, extra = '') {
  return `<header class="phead"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}${extra}</header>`;
}

function facts(rows) {
  return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v || NEED}</dd></div>`).join('')}</dl>`;
}

function sourcesBlock(srcs, title = 'المصادر') {
  const F = L().fields || {};
  if (!srcs || !srcs.length) return `<section class="block"><h2>${title}</h2><p class="muted">لم تُسجَّل مصادر بعد.</p></section>`;
  return `<section class="block"><h2>${title}</h2><ul class="srcs">${srcs.map((s) => `
    <li><span class="srcs__t">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)}</span>
    ${s.field ? `<span class="tag">${esc(F[s.field] || s.field)}</span>` : ''}${certBadge(s.certainty, true)}
    ${s.note ? `<small>${esc(s.note)}</small>` : ''}</li>`).join('')}</ul></section>`;
}

function videoEmbed(url) {
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (yt) return `<div class="video"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="فيديو" allowfullscreen></iframe></div>`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `<div class="video"><iframe loading="lazy" src="https://player.vimeo.com/video/${vm[1]}" title="فيديو" allowfullscreen></iframe></div>`;
  return `<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('link', 18)} فتح الفيديو</a></p>`;
}

// ============ عناصر التشغيل ============
function recItem(r) {
  const ver = r.version_title ? ` — ${r.version_title}` : '';
  const type = L().recTypes?.[r.rec_type] || '';
  return {
    key: 'r' + r.id, title: (r.song_title || r.title) + ver, subtitle: type,
    src: r.audio_file ? mediaUrl('audio', r.audio_file) : '', image: r.cover || r.image || r.song_image || '',
    href: '#/song/' + r.song_id, duration: r.duration_sec || 0,
  };
}
function songItem(s) {
  return {
    key: 'r' + s.play_rec_id, title: s.title, subtitle: s.composers ? 'لحن: ' + s.composers : '',
    src: s.play_file ? mediaUrl('audio', s.play_file) : '', image: s.cover || '', href: '#/song/' + s.id, duration: s.play_duration || 0,
  };
}
function mediaItem(m, owner, ownerType) {
  return {
    key: 'm' + m.id, title: m.title || owner.title, subtitle: owner.title, src: m.file ? mediaUrl('audio', m.file) : '',
    image: owner.image || '', href: `#/${ownerType}/${owner.id}`, duration: m.duration_sec || 0,
  };
}

function playBtn(item, size = 22) {
  reg.set(item.key, item);
  if (!item.src) return `<button class="play-btn is-off" disabled title="لا يوجد ملف صوتي بعد" aria-label="لا يوجد ملف صوتي">${icon('play', size)}</button>`;
  const cur = Player.current?.key === item.key;
  return `<button class="play-btn${cur ? ' is-current' : ''}" data-play="${esc(item.key)}" data-size="${size}" aria-label="تشغيل ${esc(item.title)}">${icon(cur && Player.playing ? 'pause' : 'play', size)}</button>`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]');
  if (b) {
    e.preventDefault();
    const key = b.dataset.play;
    if (Player.current?.key === key) return Player.toggle();
    const q = b.closest('[data-queue]');
    const keys = q ? $$('[data-play]', q).map((x) => x.dataset.play) : [key];
    Player.play([...new Set(keys)].map((k) => reg.get(k)).filter(Boolean), key);
    return;
  }
  const all = e.target.closest('[data-playall]');
  if (all) {
    const q = all.closest('[data-queue]') || view;
    const keys = [...new Set($$('[data-play]', q).map((x) => x.dataset.play))];
    const items = keys.map((k) => reg.get(k)).filter(Boolean);
    if (!items.length) return import('./ui.js').then((m) => m.toast('لا توجد ملفات صوتية للتشغيل بعد', 'warn'));
    Player.play(items, items[0].key);
  }
});

// ============ عناصر مشتركة للقوائم ============
function chips(items, current, key, allLabel = 'الكل') {
  const one = (val, label) => `<a class="chip${(current || '') === val ? ' is-on' : ''}" href="${href({ [key]: val })}" ${(current || '') === val ? 'aria-current="true"' : ''}>${esc(label)}</a>`;
  return `<div class="chips" role="group">${one('', allLabel)}${items.map(([v, l]) => one(String(v), l)).join('')}</div>`;
}
const decadeChips = (cur) => chips(DECADES.map((d) => [d, d + 's']), cur, 'decade', 'كل السنوات');

// تحميل تدريجي: نجلب 24 عنصرًا ثم نكمل عند الاقتراب من آخر الصفحة
async function infinite(host, endpoint, params, renderRows, { empty: emptyHTML, wrap = 'ul', cls = 'rows', queue = false } = {}) {
  const my = token;
  let offset = 0;
  let total = 0;
  let busy = false;
  host.innerHTML = `<${wrap} class="${cls}"${queue ? ' data-queue' : ''}></${wrap}><div class="more" hidden></div>`;
  const box = host.firstElementChild;
  const more = host.lastElementChild;
  const count = document.createElement('p');
  count.className = 'count';
  host.prepend(count);
  const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) load(); }, { rootMargin: '600px' });

  async function load() {
    if (busy || my !== token) return;
    busy = true;
    try {
      const d = await api(endpoint, { ...params, limit: 24, offset });
      if (my !== token) return;
      total = d.total;
      if (!offset && !d.rows.length) { host.innerHTML = emptyHTML || empty('لا توجد نتائج', 'جرّب تغيير البحث أو التصفية.'); return; }
      box.insertAdjacentHTML('beforeend', renderRows(d.rows));
      offset += d.rows.length;
      count.textContent = `${total} نتيجة`;
      Player.sync();
      if (offset < total) { more.hidden = false; more.innerHTML = '<button class="btn btn--ghost">عرض المزيد</button>'; more.firstChild.onclick = load; io.observe(more); }
      else { more.hidden = true; io.disconnect(); }
    } catch (e) { host.innerHTML = `<p class="error">${esc(e.message)}</p>`; } finally { busy = false; }
  }
  await load();
}

const tag = (t, cls = '') => (t ? `<span class="tag ${cls}">${esc(t)}</span>` : '');

// ============ الأغاني ============
function songRow(s) {
  const cat = L().categories?.[s.category] || '';
  return `<li class="row">
    <a class="row__main" href="#/song/${s.id}">${cover(s.cover)}
      <span class="row__t"><b>${esc(s.title)}</b>
        <small>${s.composers ? 'ألحان: ' + esc(s.composers) : 'الملحن: ' + NEED}</small>
        <small>${s.lyricists ? 'كلمات: ' + esc(s.lyricists) : 'الشاعر: ' + NEED}</small>
        <span class="tags">${s.year ? tag(s.year) : tag('التاريخ غير مؤكد', 'tag--soft')}${tag(cat)}${s.rec_count > 1 ? tag(s.rec_count + ' نسخ') : ''}</span>
      </span></a>${playBtn(songItem(s))}</li>`;
}

function recRow(r, { withSong = true } = {}) {
  const type = L().recTypes?.[r.rec_type] || '';
  const parent = r.concert_title ? `الحفلة: ${r.concert_title}` : r.session_title ? `الجلسة: ${r.session_title}` : r.movie_title ? `الفيلم: ${r.movie_title}` : '';
  return `<li class="row">
    <a class="row__main" href="#/song/${r.song_id}">${cover(r.cover)}
      <span class="row__t"><b>${esc(r.song_title)}${r.version_title ? ' — ' + esc(r.version_title) : ''}</b>
        <small>${esc(recDate(r))}</small>${parent ? `<small>${esc(parent)}</small>` : ''}
        <span class="tags">${tag(type)}${r.is_rare ? tag('نادر', 'tag--rare') : ''}${r.duration_sec ? tag(fmtTime(r.duration_sec), 'tag--soft') : ''}</span>
      </span></a>${playBtn(recItem(r))}</li>`;
}

function recDate(r) {
  if (r.date || r.year || r.year_from) return dateText(r);
  if (r.eff_year) {
    const from = r.concert_title ? 'الحفلة' : r.session_title ? 'الجلسة' : r.movie_title ? 'الفيلم' : 'الأغنية';
    return dateText({ date: r.eff_date, year: r.eff_year }) + ` (حسب ${from})`;
  }
  return 'التاريخ غير مؤكد';
}

async function viewSongs(q) {
  const mode = q.mode === 'rec' ? 'rec' : 'songs';
  const kinds = Object.entries(L().kinds || {});
  const sortOpts = [['year', 'السنة'], ['title', 'الاسم'], ['kind', mode === 'rec' ? 'نوع التسجيل' : 'التصنيف'], ['composer', 'الملحن'], ['lyricist', 'الشاعر']];
  if (mode === 'rec') sortOpts.splice(1, 0, ['date', 'التاريخ'], ['concert', 'الحفلة'], ['movie', 'الفيلم']);
  const sort = q.sort || 'year';
  const dir = q.dir || 'asc';
  const yearSort = sort === 'year' || sort === 'date';
  view.innerHTML = `${pageHead('الأغاني', 'كل الأعمال والتسجيلات المحفوظة في الأرشيف')}
    <div class="toolbar">
      <div class="seg" role="group" aria-label="طريقة العرض">
        <a class="seg__b${mode === 'songs' ? ' is-on' : ''}" href="${href({ mode: '' })}">أغانٍ</a>
        <a class="seg__b${mode === 'rec' ? ' is-on' : ''}" href="${href({ mode: 'rec' })}">كل التسجيلات</a>
      </div>
      <label class="sel"><span>الترتيب</span><select data-f="sort">${sortOpts.map(([v, l]) => `<option value="${v}"${sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="sel"><span>الاتجاه</span><select data-f="dir">
        <option value="asc"${dir === 'asc' ? ' selected' : ''}>${yearSort ? 'من الأقدم إلى الأحدث' : 'تصاعدي (أ ← ي)'}</option>
        <option value="desc"${dir === 'desc' ? ' selected' : ''}>${yearSort ? 'من الأحدث إلى الأقدم' : 'تنازلي (ي ← أ)'}</option></select></label>
      <label class="sel"><span>الملحن</span><select data-f="composer" id="f-composer"><option value="">الكل</option></select></label>
      <label class="sel"><span>الشاعر</span><select data-f="lyricist" id="f-lyricist"><option value="">الكل</option></select></label>
    </div>
    ${decadeChips(q.decade)}
    ${chips(kinds, q.kind, 'kind', 'كل الأنواع')}
    ${q.concert || q.movie || q.session ? `<p class="active-filter">تصفية حسب ${q.concert ? 'حفلة' : q.movie ? 'فيلم' : 'جلسة'} محددة <a href="${href({ concert: '', movie: '', session: '' })}">إزالة</a></p>` : ''}
    <div id="list"></div>`;
  fillPeopleSelects(q);
  const params = { q: q.q, kind: q.kind, decade: q.decade, sort, dir, composer: q.composer, lyricist: q.lyricist, concert: q.concert, movie: q.movie, session: q.session };
  if (mode === 'rec') {
    delete params.kind;
    if (q.kind) params.type = ['studio', 'live'].includes(q.kind) ? q.kind : ''; // في وضع التسجيلات النوع = نوع التسجيل
    if (q.kind === 'rare') params.rare = 1;
    if (q.kind === 'undated') params.undated = 1;
    if (['national', 'poem', 'romantic', 'religious', 'muwashah', 'film'].includes(q.kind)) params.category = q.kind;
    return infinite($('#list'), '/recordings', params, (rows) => rows.map((r) => recRow(r)).join(''), { queue: true, empty: empty('لا توجد تسجيلات بعد', 'أضف أول تسجيل من لوحة الإدارة.') });
  }
  return infinite($('#list'), '/songs', params, (rows) => rows.map(songRow).join(''), { queue: true, empty: empty('لا توجد أغانٍ مطابقة', 'أضف أغنية من لوحة الإدارة أو غيّر التصفية.') });
}

async function fillPeopleSelects(q) {
  for (const role of ['composer', 'lyricist']) {
    const sel = $('#f-' + role);
    if (!sel) continue;
    try {
      const d = await api('/people', { role, limit: 100 });
      if (!$('#f-' + role)) return;
      sel.insertAdjacentHTML('beforeend', d.rows.map((p) => `<option value="${p.id}"${String(p.id) === q[role] ? ' selected' : ''}>${esc(p.name)}</option>`).join(''));
    } catch { /* اختياري */ }
  }
}
view.addEventListener('change', (e) => {
  const f = e.target.closest('[data-f]');
  if (f) go({ [f.dataset.f]: f.value });
});

async function viewSong(id) {
  const d = await api('/songs/' + id);
  const s = d.song;
  const comp = people(d.people, 'composer');
  const lyr = people(d.people, 'lyricist');
  const cat = L().categories?.[s.category];
  const recs = d.recordings;
  const firstAudio = recs.find((r) => r.audio_file);
  view.innerHTML = `<article data-queue>
    <div class="detail-head">
      ${cover(s.image || recs.find((r) => r.cover)?.cover, 'cover cover--xl')}
      <div>
        <h1>${esc(s.title)}</h1>
        <p class="tags">${tag(cat)}${s.year ? tag(s.year) : ''}${certBadge(s.certainty)}</p>
        ${firstAudio ? `<button class="btn btn--brass" data-playall>${icon('play', 20)} تشغيل</button>` : '<p class="muted">لا يوجد ملف صوتي بعد.</p>'}
      </div>
    </div>
    ${facts([
      ['الملحن', personLinks(comp)], ['الشاعر', personLinks(lyr)], ['التصنيف', esc(cat || '')],
      ['السنة', s.year ? String(s.year) : ''], ['عدد النسخ', String(recs.length)],
    ])}
    ${s.description ? `<section class="block"><h2>ملاحظات تاريخية</h2><p class="prose">${esc(s.description)}</p></section>` : ''}
    ${s.lyrics ? `<section class="block"><details><summary>الكلمات</summary><p class="prose prose--lyrics">${esc(s.lyrics)}</p></details></section>` : ''}
    <section class="block"><h2>${recs.length > 1 ? 'نسخ أخرى من الأغنية' : 'التسجيلات'}</h2>
      <p class="hint">${recs.length > 1 ? 'قارن بين نسخ الاستوديو والحفلات والإذاعة وغيرها.' : ''}</p>
      <ul class="recs">${recs.map(recCard).join('') || '<li class="muted">لا توجد تسجيلات.</li>'}</ul></section>
    ${sourcesBlock(d.sources, 'مصادر معلومات الأغنية')}
  </article>`;
  Player.sync();
}

function recCard(r) {
  const type = L().recTypes?.[r.rec_type] || '';
  const links = list([
    r.concert_id && `<a href="#/concert/${r.concert_id}">الحفلة: ${esc(r.concert_title)}</a>`,
    r.session_id && `<a href="#/session/${r.session_id}">الجلسة: ${esc(r.session_title)}</a>`,
    r.interview_id && `<a href="#/interview/${r.interview_id}">المقابلة: ${esc(r.interview_title)}</a>`,
    r.movie_id && `<a href="#/movie/${r.movie_id}">الفيلم: ${esc(r.movie_title)}</a>`,
  ]);
  return `<li class="rec">
    <div class="rec__head">${playBtn(recItem(r), 24)}
      <div><b>${esc(r.version_title || type)}</b>
      <p class="tags">${tag(type)}${r.is_rare ? tag('نادر', 'tag--rare') : ''}${certBadge(r.date_certainty)}</p></div></div>
    <dl class="mini">
      <div><dt>التاريخ</dt><dd>${esc(recDate(r))}</dd></div>
      <div><dt>مكان التسجيل</dt><dd>${r.venue || r.city ? esc(list([r.venue, r.city]).join('، ')) : NEED}</dd></div>
      <div><dt>المدة</dt><dd>${r.duration_sec ? fmtTime(r.duration_sec) : NEED}</dd></div>
      ${r.arranger ? `<div><dt>الموزع</dt><dd>${esc(r.arranger)}</dd></div>` : ''}
      ${links.length ? `<div><dt>مرتبط بـ</dt><dd>${links.join('<br>')}</dd></div>` : ''}
    </dl>
    ${r.description ? `<p class="prose">${esc(r.description)}</p>` : ''}
    ${r.sources?.length ? `<p class="rec__src">${r.sources.map((x) => `${esc(x.title)} ${certBadge(x.certainty, true)}`).join('، ')}</p>` : ''}
  </li>`;
}

// ============ الحفلات والجلسات والمقابلات والأفلام ============
const COLL = {
  concert: { ep: 'concerts', title: 'حفلات عبد الحليم حافظ', sub: 'مرتبة حسب التاريخ', one: 'حفلة' },
  session: { ep: 'sessions', title: 'الجلسات الخاصة', sub: 'تسجيلات وجلسات لم تكن حفلات رسمية', one: 'جلسة' },
  interview: { ep: 'interviews', title: 'مقابلات عبد الحليم حافظ', sub: 'مرتبة زمنيًا', one: 'مقابلة' },
  movie: { ep: 'movies', title: 'أفلام عبد الحليم حافظ', sub: 'الأفلام وأغانيها', one: 'فيلم' },
};

function collRow(kind, c) {
  const place = list([c.venue, c.city, c.country]).join('، ');
  const when = kind === 'movie' ? (c.year ? String(c.year) : 'السنة غير مؤكدة') : dateText(c);
  const year = c.year || c.year_from;
  const extra = kind === 'movie' ? (c.director ? `إخراج: ${esc(c.director)}` : '') : kind === 'interview' ? esc(list([c.program, c.host && 'المذيع: ' + c.host]).join('، ')) : esc(place);
  const count = c.rec_count ? tag(c.rec_count + ' تسجيلات', 'tag--soft') : c.media_count ? tag(c.media_count + ' وسائط', 'tag--soft') : '';
  return `<li class="row row--dated"><a class="row__main" href="#/${kind}/${c.id}">
    <span class="row__year">${year ? year : '؟'}</span>${c.image ? cover(c.image) : ''}
    <span class="row__t"><b>${esc(c.title)}</b><small>${esc(when)}</small>${extra ? `<small>${extra}</small>` : ''}<span class="tags">${count}${certBadge(c.date_certainty)}</span></span></a></li>`;
}

async function viewColl(kind, q) {
  const C = COLL[kind];
  view.innerHTML = `${pageHead(C.title, C.sub)}
    <div class="toolbar"><label class="sel"><span>الترتيب</span><select data-f="dir">
      <option value="asc"${q.dir !== 'desc' ? ' selected' : ''}>من الأقدم إلى الأحدث</option>
      <option value="desc"${q.dir === 'desc' ? ' selected' : ''}>من الأحدث إلى الأقدم</option></select></label></div>
    ${decadeChips(q.decade)}<div id="list"></div>`;
  return infinite($('#list'), '/' + C.ep, { q: q.q, decade: q.decade, dir: q.dir }, (rows) => rows.map((c) => collRow(kind, c)).join(''),
    { empty: empty(`لا توجد ${C.one === 'حفلة' ? 'حفلات' : C.one === 'جلسة' ? 'جلسات' : C.one === 'مقابلة' ? 'مقابلات' : 'أفلام'} بعد`, 'أضفها من لوحة الإدارة.') });
}

function photoGrid(photos) {
  if (!photos.length) return '';
  return `<div class="pgrid" data-photos>${photos.map((p, i) => `<button class="pgrid__i" data-pi="${i}" aria-label="${esc(p.title || 'عرض الصورة')}">${img(p.file, { alt: p.title || '' })}</button>`).join('')}</div>`;
}
const gallery = { items: [] };
view.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pi]');
  if (b) openLightbox(gallery.items, Number(b.dataset.pi), b);
});

async function viewCollDetail(kind, id) {
  const C = COLL[kind];
  const d = await api(`/${C.ep}/${id}`);
  const it = d.item;
  gallery.items = d.photos;
  let rows;
  if (kind === 'concert') rows = [['التاريخ', esc(dateText(it)) + ' ' + certBadge(it.date_certainty)], ['المكان', esc(it.venue || '')], ['المدينة', esc(it.city || '')], ['الدولة', esc(it.country || '')], ['المناسبة', esc(it.occasion || '')]];
  else if (kind === 'session') rows = [['التاريخ', esc(dateText(it)) + ' ' + certBadge(it.date_certainty)], ['المكان', esc(list([it.venue, it.city]).join('، '))], ['الأشخاص الموجودون', esc(it.attendees || '')]];
  else if (kind === 'interview') rows = [['التاريخ', esc(dateText(it)) + ' ' + certBadge(it.date_certainty)], ['البرنامج أو الجهة', esc(it.program || '')], ['المذيع', esc(it.host || '')], ['المكان', esc(list([it.venue, it.city]).join('، '))], ['المدة', it.duration_sec ? fmtTime(it.duration_sec) : '']];
  else rows = [['سنة الإنتاج', it.year ? String(it.year) : ''], ['المخرج', d.director ? `<a href="#/person/${d.director.id}">${esc(d.director.name)}</a>` : ''], ['الأبطال', esc(it.cast_text || '')]];

  const audios = d.media.filter((m) => m.kind === 'audio' && m.file);
  const vids = [...(it.videos || []).map((u) => videoEmbed(u)), ...d.media.filter((m) => m.kind === 'video').map((m) => (m.file ? `<video class="video" controls preload="none" src="${esc(mediaUrl('video', m.file))}"></video>` : videoEmbed(m.url)))];
  const recTitle = kind === 'concert' ? 'الأغاني التي غناها' : kind === 'movie' ? 'أغاني الفيلم' : 'الأغاني والتسجيلات';
  view.innerHTML = `<article data-queue>
    <div class="detail-head">${cover(it.image, 'cover cover--xl')}<div><h1>${esc(it.title)}</h1>
      ${d.recordings.some((r) => r.audio_file) || audios.length ? `<button class="btn btn--brass" data-playall>${icon('play', 20)} تشغيل الكل</button>` : ''}</div></div>
    ${facts(rows)}
    ${(kind === 'movie' ? it.story : it.description) ? `<section class="block"><h2>${kind === 'movie' ? 'القصة' : 'معلومات تاريخية'}</h2><p class="prose">${esc(kind === 'movie' ? it.story : it.description)}</p></section>` : ''}
    ${kind === 'movie' && it.description ? `<section class="block"><h2>معلومات تاريخية</h2><p class="prose">${esc(it.description)}</p></section>` : ''}
    ${audios.length ? `<section class="block"><h2>التسجيلات الصوتية</h2><ul class="rows">${audios.map((m) => `<li class="row"><span class="row__main"><span class="row__t"><b>${esc(m.title || it.title)}</b>${m.duration_sec ? `<small>${fmtTime(m.duration_sec)}</small>` : ''}</span></span>${playBtn(mediaItem(m, it, kind))}</li>`).join('')}</ul></section>` : ''}
    <section class="block"><h2>${recTitle}</h2>
      ${d.recordings.length ? `<ul class="rows">${d.recordings.map((r) => recRow(r)).join('')}</ul>` : '<p class="muted">لم تُضف أغانٍ لهذه الصفحة بعد. اربط التسجيلات بها من لوحة الإدارة.</p>'}</section>
    ${vids.length ? `<section class="block"><h2>الفيديو</h2>${vids.join('')}</section>` : ''}
    ${d.photos.length ? `<section class="block"><h2>الصور</h2>${photoGrid(d.photos.map((p) => ({ ...p })))}</section>` : ''}
    ${sourcesBlock(d.sources)}
  </article>`;
  Player.sync();
}

// ============ التسجيلات النادرة ============
async function viewRare(q) {
  const kinds = Object.entries(L().rareKinds || {});
  view.innerHTML = `${pageHead('التسجيلات النادرة', 'تسجيلات إذاعية وبروفات وجلسات ومواد غير مكتملة أو غير مؤرخة')}
    <p class="note">حين لا يُعرف تاريخ التسجيل يُكتب «التاريخ غير مؤكد». وما يُعرض كنطاق زمني فهو تقدير وليس حقيقة مؤكدة.</p>
    ${chips(kinds, q.kind, 'kind', 'كل التسجيلات النادرة')}${decadeChips(q.decade)}<div id="list"></div>`;
  const p = { q: q.q, rare: 1, decade: q.decade, sort: 'year' };
  if (q.kind === 'undated') p.undated = 1; else if (q.kind) p.type = q.kind;
  return infinite($('#list'), '/recordings', p, (rows) => rows.map((r) => recRow(r)).join(''), { queue: true, empty: empty('لا توجد تسجيلات نادرة بعد', 'عند إضافة تسجيل فعّل خيار «تسجيل نادر».') });
}

// ============ الصور ============
async function viewPhotos(q) {
  const cats = Object.entries(L().photoCats || {});
  view.innerHTML = `${pageHead('الصور', 'معرض صور الأرشيف')}
    ${chips(cats, q.category, 'category', 'كل الصور')}
    ${chips(Object.entries(L().colors || {}), q.color, 'color', 'الألوان كلها')}${decadeChips(q.decade)}<div id="list"></div>`;
  gallery.items = [];
  const my = token;
  await infinite($('#list'), '/photos', { q: q.q, category: q.category, color: q.color, decade: q.decade }, (rows) => {
    const start = gallery.items.length;
    gallery.items.push(...rows);
    return rows.map((p, i) => `<li><button class="pgrid__i" data-pi="${start + i}" aria-label="${esc(p.title || 'عرض الصورة')}">${img(p.file, { alt: p.title || '' })}
      <span class="pgrid__c">${esc(p.title || '')}${p.year ? ` <small>${p.year}</small>` : ''}</span></button></li>`).join('');
  }, { cls: 'pgrid pgrid--page', empty: empty('لا توجد صور بعد', 'ارفع صورك من لوحة الإدارة، أو ضعها في مجلد الصور ثم اربطها.') });
  void my;
}

// ============ الأشخاص ============
async function viewPeople(q) {
  const roles = ['composer', 'lyricist', 'arranger', 'director'].map((r) => [r, L().roles[r]]);
  view.innerHTML = `${pageHead('الملحنون والشعراء', 'كل من تعاون مع عبد الحليم حافظ')}${chips(roles, q.role, 'role', 'الجميع')}<div id="list"></div>`;
  return infinite($('#list'), '/people', { q: q.q, role: q.role }, (rows) => rows.map((p) => `
    <li><a class="pcard" href="#/person/${p.id}">${p.photo ? `<span class="pcard__ph">${img(p.photo)}</span>` : `<span class="pcard__ph pcard__ph--empty">${esc(p.name.trim()[0])}</span>`}
    <b>${esc(p.name)}</b><small>${esc(p.roles.split(',').filter(Boolean).map((r) => L().roles[r]).join('، ') || 'الدور غير محدد')}</small>
    <small>${p.song_count ? p.song_count + ' أغنية' : 'لا أغاني مرتبطة بعد'}</small></a></li>`).join(''),
  { cls: 'pgridp', empty: empty('لا يوجد أشخاص بعد') });
}

async function viewPerson(id) {
  const d = await api('/people/' + id);
  const p = d.person;
  gallery.items = d.photos;
  const roles = p.roles.split(',').filter(Boolean).map((r) => L().roles[r]).join('، ');
  const yearsBlock = d.years.length ? `<div class="chips">${d.years.map((y) => `<a class="chip" href="#/year/${y}">${y}</a>`).join('')}</div>` : '<p class="muted">لا توجد سنوات مسجلة بعد.</p>';
  const rel = (arr, kind) => (arr.length ? `<ul class="rows">${arr.map((c) => `<li class="row"><a class="row__main" href="#/${kind}/${c.id}"><span class="row__t"><b>${esc(c.title)}</b><small>${esc(c.date ? fmtDate(c.date) : c.year || 'التاريخ غير مؤكد')}</small></span></a></li>`).join('')}</ul>` : '<p class="muted">لا يوجد شيء مسجل بعد.</p>');
  view.innerHTML = `<article data-queue>
    <div class="detail-head">${p.photo ? `<span class="cover cover--xl">${img(p.photo)}</span>` : '<span class="cover cover--xl cover--empty"></span>'}
      <div><h1>${esc(p.name)}</h1><p class="tags">${tag(roles)}${p.birth_year ? tag('وُلد ' + p.birth_year, 'tag--soft') : ''}${p.death_year ? tag('توفي ' + p.death_year, 'tag--soft') : ''}</p>
      ${d.recordings.some((r) => r.audio_file) ? `<button class="btn btn--brass" data-playall>${icon('play', 20)} تشغيل أعماله</button>` : ''}</div></div>
    ${p.bio ? `<section class="block"><p class="prose">${esc(p.bio)}</p></section>` : `<p class="muted">النبذة: ${NEEDS}</p>`}
    <section class="block"><h2>الأغاني <small>(${d.songs.length})</small></h2>
      ${d.songs.length ? `<ul class="rows">${d.songs.map((s) => `<li class="row"><a class="row__main" href="#/song/${s.id}"><span class="row__t"><b>${esc(s.title)}</b>
        <small>${esc(s.roles.split(',').map((r) => L().roles[r]).join('، '))}</small><span class="tags">${s.year ? tag(s.year) : tag('التاريخ غير مؤكد', 'tag--soft')}</span></span></a></li>`).join('')}</ul>` : '<p class="muted">لا توجد أغانٍ مرتبطة بهذا الشخص بعد.</p>'}</section>
    <section class="block"><h2>التسجيلات <small>(${d.recordings.length})</small></h2>
      ${d.recordings.length ? `<ul class="rows">${d.recordings.slice(0, 60).map((r) => recRow(r)).join('')}</ul>` : '<p class="muted">لا توجد تسجيلات.</p>'}</section>
    <section class="block"><h2>الحفلات</h2>${rel(d.concerts, 'concert')}</section>
    <section class="block"><h2>الجلسات</h2>${rel(d.sessions, 'session')}</section>
    <section class="block"><h2>الأفلام</h2>${rel(d.movies, 'movie')}</section>
    <section class="block"><h2>السنوات</h2>${yearsBlock}</section>
    ${d.photos.length ? `<section class="block"><h2>الصور</h2>${photoGrid(d.photos)}</section>` : ''}
    ${sourcesBlock(d.sources)}</article>`;
  Player.sync();
}

// ============ الخط الزمني ============
const COUNT_LABELS = { recordings: 'تسجيل', concerts: 'حفلة', sessions: 'جلسة', interviews: 'مقابلة', movies: 'فيلم', photos: 'صورة' };

function yearContent(d) {
  const sec = (title, html) => (html ? `<section class="block"><h3>${title}</h3>${html}</section>` : '');
  const lst = (arr, fn) => (arr.length ? `<ul class="rows">${arr.map(fn).join('')}</ul>` : '');
  const simple = (kind) => (c) => `<li class="row"><a class="row__main" href="#/${kind}/${c.id}"><span class="row__t"><b>${esc(c.title)}</b><small>${esc(dateText(c))}</small></span></a></li>`;
  gallery.items = d.photos;
  return `<div data-queue>
    ${d.events.length ? `<ul class="events">${d.events.map((e) => `<li><b>${esc(e.title)}</b> ${certBadge(e.certainty)}${e.date ? `<small>${fmtDate(e.date)}</small>` : ''}${e.description ? `<p>${esc(e.description)}</p>` : ''}</li>`).join('')}</ul>` : ''}
    ${sec('الأغاني والتسجيلات', lst(d.recordings, (r) => recRow(r)))}
    ${sec('الحفلات', lst(d.concerts, simple('concert')))}
    ${sec('الجلسات', lst(d.sessions, simple('session')))}
    ${sec('المقابلات', lst(d.interviews, simple('interview')))}
    ${sec('الأفلام', lst(d.movies, (m) => `<li class="row"><a class="row__main" href="#/movie/${m.id}"><span class="row__t"><b>${esc(m.title)}</b></span></a></li>`))}
    ${sec('الصور', photoGrid(d.photos))}
    ${!d.events.length && !d.recordings.length && !d.concerts.length && !d.sessions.length && !d.interviews.length && !d.movies.length && !d.photos.length ? '<p class="muted">لا توجد مواد لهذه السنة بعد.</p>' : ''}
  </div>`;
}

async function viewTimeline() {
  const d = await api('/timeline');
  if (!d.years.length) { view.innerHTML = pageHead('الخط الزمني', '') + empty('لا توجد أحداث بعد', 'أضف أحداثًا أو مواد مؤرخة من لوحة الإدارة.'); return; }
  const decs = [...new Set(d.years.map((y) => Math.floor(y.year / 10) * 10))];
  view.innerHTML = `${pageHead('رحلة عبد الحليم حافظ', 'اضغط على أي سنة لترى ما ارتبط بها من أعمال وأحداث')}
    <div class="chips">${decs.map((x) => `<a class="chip" href="#/timeline" data-jump="${x}">${x}s</a>`).join('')}</div>
    <ol class="spine">${d.years.map((y) => {
      const counts = Object.entries(y.counts).map(([k, n]) => `${n} ${COUNT_LABELS[k]}`).join('، ');
      return `<li class="spine__i" id="y${y.year}" data-dec="${Math.floor(y.year / 10) * 10}">
        <button class="spine__y" data-year="${y.year}" aria-expanded="false" aria-controls="yp${y.year}"><span>${y.year}</span></button>
        <div class="spine__b"><div class="spine__s">${y.events.map((e) => `<b class="ev ev--${esc(e.kind)}">${esc(e.title)}</b>`).join('')}${counts ? `<small>${esc(counts)}</small>` : ''}</div>
        <div class="spine__p" id="yp${y.year}" hidden></div></div></li>`;
    }).join('')}</ol>`;
  const wanted = here().q.y;
  if (wanted) $(`[data-year="${wanted}"]`)?.click();
}
view.addEventListener('click', async (e) => {
  const j = e.target.closest('[data-jump]');
  if (j) { e.preventDefault(); $(`[data-dec="${j.dataset.jump}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const b = e.target.closest('[data-year]');
  if (!b) return;
  const panel = $('#yp' + b.dataset.year);
  const open = b.getAttribute('aria-expanded') === 'true';
  b.setAttribute('aria-expanded', String(!open));
  panel.hidden = open;
  if (open || panel.dataset.loaded) return;
  panel.innerHTML = '<p class="muted">جارٍ التحميل...</p>';
  try {
    const d = await api('/year/' + b.dataset.year);
    panel.innerHTML = yearContent(d) + `<a class="btn btn--ghost" href="#/year/${b.dataset.year}">صفحة سنة ${b.dataset.year}</a>`;
    panel.dataset.loaded = '1';
    Player.sync();
  } catch (err) { panel.innerHTML = `<p class="error">${esc(err.message)}</p>`; }
});

async function viewYear(y) {
  const d = await api('/year/' + y);
  view.innerHTML = `${pageHead('سنة ' + y, 'كل ما ارتبط بهذه السنة في الأرشيف', `<a class="btn btn--ghost" href="#/timeline?y=${y}">العودة إلى الخط الزمني</a>`)}${yearContent(d)}`;
  Player.sync();
}

// ============ الأرشيف والمصادر ============
async function viewArchive() {
  const [m, src] = [state.meta, await api('/sources', { limit: 100 })];
  const c = m.counts;
  const tiles = [
    ['#/songs', 'music', 'الأغاني', c.songs], ['#/songs?mode=rec', 'archive', 'التسجيلات', c.recordings], ['#/rare', 'star', 'التسجيلات النادرة', c.rare],
    ['#/concerts', 'mic', 'الحفلات', c.concerts], ['#/sessions', 'users', 'الجلسات', c.sessions], ['#/interviews', 'chat', 'المقابلات', c.interviews],
    ['#/movies', 'film', 'الأفلام', c.movies], ['#/photos', 'image', 'الصور', c.photos], ['#/people', 'users', 'الأشخاص', c.people],
  ];
  view.innerHTML = `${pageHead('الأرشيف', 'فهرس كامل لمحتويات المكتبة')}
    <div class="tiles">${tiles.map(([h, ic, t, n]) => `<a class="tile" href="${h}">${icon(ic, 26)}<b>${t}</b><small>${n}</small></a>`).join('')}</div>
    <section class="block"><h2>التصفح بالعقود</h2><div class="chips">${DECADES.map((d) => `<a class="chip" href="#/songs?decade=${d}">${d}s</a>`).join('')}<a class="chip" href="#/songs?kind=undated">مجهولة التاريخ</a></div></section>
    <section class="block"><h2>المصادر <small>(${src.total})</small></h2>
      ${src.rows.length ? `<ul class="srcs">${src.rows.map((s) => `<li><span class="srcs__t">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)}</span>${tag(L().sourceTypes?.[s.type] || '')}${s.author ? `<small>${esc(s.author)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">لا توجد مصادر مسجلة بعد.</p>'}</section>`;
}

// ============ البحث ============
const GROUPS = [
  ['songs', 'الأغاني', (r) => songRow(r), '#/songs'],
  ['people', 'الأشخاص', (p) => `<li class="row"><a class="row__main" href="#/person/${p.id}"><span class="row__t"><b>${esc(p.name)}</b><small>${esc(p.roles.split(',').filter(Boolean).map((r) => L().roles[r]).join('، '))}</small></span></a></li>`, '#/people'],
  ['concerts', 'الحفلات', (c) => collRow('concert', c), '#/concerts'],
  ['sessions', 'الجلسات', (c) => collRow('session', c), '#/sessions'],
  ['interviews', 'المقابلات', (c) => collRow('interview', c), '#/interviews'],
  ['movies', 'الأفلام', (c) => collRow('movie', c), '#/movies'],
];

async function viewSearch(q) {
  const text = q.q || '';
  view.innerHTML = pageHead(text ? `نتائج البحث عن «${text}»` : 'البحث', '') + '<div id="res"></div>';
  if (!text) { $('#res').innerHTML = '<p class="muted">اكتب اسم أغنية أو ملحن أو سنة أو حفلة في شريط البحث.</p>'; return; }
  const d = await api('/search', { q: text, per: 8 });
  let html = '';
  let any = false;
  for (const [key, title, fn, link] of GROUPS) {
    const g = d[key];
    if (!g.total) continue;
    any = true;
    html += `<section class="block" data-queue><h2>${title} <small>(${g.total})</small></h2><ul class="rows">${g.rows.map(fn).join('')}</ul>
      ${g.total > g.rows.length ? `<a class="btn btn--ghost" href="${link}?q=${encodeURIComponent(text)}">عرض كل النتائج (${g.total})</a>` : ''}</section>`;
  }
  if (d.photos.total) {
    any = true;
    gallery.items = d.photos.rows;
    html += `<section class="block"><h2>الصور <small>(${d.photos.total})</small></h2>${photoGrid(d.photos.rows)}
      ${d.photos.total > d.photos.rows.length ? `<a class="btn btn--ghost" href="#/photos?q=${encodeURIComponent(text)}">عرض كل الصور</a>` : ''}</section>`;
  }
  $('#res').innerHTML = any ? html : `<div class="empty"><p class="empty__t">لا توجد نتائج لهذا البحث</p><p class="empty__h">جرّب كلمة أقصر أو اسمًا آخر أو سنة.</p></div>`;
  Player.sync();
}

// ============ الرئيسية ============
async function viewHome() {
  const m = state.meta;
  const s = m.settings;
  const [tl, latest] = await Promise.all([api('/timeline'), api('/recordings', { sort: 'new', limit: 6 })]);
  const tiles = [
    ['#/songs', 'music', 'الأغاني'], ['#/concerts', 'mic', 'الحفلات'], ['#/interviews', 'chat', 'المقابلات'], ['#/sessions', 'users', 'الجلسات'],
    ['#/photos', 'image', 'الصور'], ['#/timeline', 'clock', 'الخط الزمني'], ['#/archive', 'archive', 'الأرشيف'],
  ];
  view.innerHTML = `
    <section class="hero">
      <div class="hero__text">
        <h1>${esc(s.site_title || 'عبد الحليم حافظ')}</h1>
        <p class="hero__tag">${esc(s.tagline || 'الأرشيف الرقمي')}</p>
        <p class="hero__about">${esc(s.about || NEEDS)}</p>
        <div class="hero__cta"><a class="btn btn--brass" href="#/songs">تصفح الأغاني</a><a class="btn btn--light" href="#/timeline">رحلة عبد الحليم</a></div>
      </div>
      <div class="hero__art" aria-hidden="${s.hero_image ? 'false' : 'true'}">
        <div class="vinyl"><div class="vinyl__label"><span>عبد الحليم</span></div></div>
        <figure class="arch">${s.hero_image ? img(s.hero_image, { alt: s.site_title || '', thumb: false, cls: 'arch__img' }) : '<div class="arch__pattern"></div>'}
          ${s.hero_caption ? `<figcaption>${esc(s.hero_caption)}</figcaption>` : ''}</figure>
      </div>
    </section>
    <nav class="tiles tiles--home" aria-label="الأقسام">${tiles.map(([h, ic, t]) => `<a class="tile" href="${h}">${icon(ic, 28)}<b>${t}</b></a>`).join('')}</nav>
    <section class="block journey"><h2>رحلة عبد الحليم حافظ</h2>
      <div class="journey__track" tabindex="0" role="list">${tl.years.map((y) => {
        const counts = Object.entries(y.counts).map(([k, n]) => `${n} ${COUNT_LABELS[k]}`).join('، ');
        return `<a class="step" role="listitem" href="#/timeline?y=${y.year}"><b class="step__y">${y.year}</b>
          ${y.events.map((e) => `<span class="step__e">${esc(e.title)}</span>`).join('')}${counts ? `<small>${esc(counts)}</small>` : ''}</a>`;
      }).join('')}</div>
      <p class="hint">تظهر هنا كل سنة فيها حدث أو مادة مسجلة، وتتسع الرحلة كلما أضفت للأرشيف.</p></section>
    ${latest.rows.length ? `<section class="block" data-queue><h2>أحدث الإضافات</h2><ul class="rows">${latest.rows.map((r) => recRow(r)).join('')}</ul></section>` : ''}
    <p class="stats">${m.counts.songs} أغنية، ${m.counts.recordings} تسجيل، ${m.counts.concerts} حفلة، ${m.counts.photos} صورة</p>`;
  Player.sync();
}

// ============ التوجيه ============
const ROUTES = [
  [/^\/$/, () => viewHome(), 'home'],
  [/^\/songs$/, (m, q) => viewSongs(q), 'songs'],
  [/^\/song\/(\d+)$/, (m) => viewSong(m[1]), 'songs'],
  [/^\/concerts$/, (m, q) => viewColl('concert', q), 'concerts'],
  [/^\/concert\/(\d+)$/, (m) => viewCollDetail('concert', m[1]), 'concerts'],
  [/^\/sessions$/, (m, q) => viewColl('session', q), 'sessions'],
  [/^\/session\/(\d+)$/, (m) => viewCollDetail('session', m[1]), 'sessions'],
  [/^\/interviews$/, (m, q) => viewColl('interview', q), 'interviews'],
  [/^\/interview\/(\d+)$/, (m) => viewCollDetail('interview', m[1]), 'interviews'],
  [/^\/movies$/, (m, q) => viewColl('movie', q), 'movies'],
  [/^\/movie\/(\d+)$/, (m) => viewCollDetail('movie', m[1]), 'movies'],
  [/^\/rare$/, (m, q) => viewRare(q), 'rare'],
  [/^\/photos$/, (m, q) => viewPhotos(q), 'photos'],
  [/^\/people$/, (m, q) => viewPeople(q), 'people'],
  [/^\/person\/(\d+)$/, (m) => viewPerson(m[1]), 'people'],
  [/^\/timeline$/, () => viewTimeline(), 'timeline'],
  [/^\/year\/(\d{4})$/, (m) => viewYear(m[1]), 'timeline'],
  [/^\/archive$/, () => viewArchive(), 'archive'],
  [/^\/search$/, (m, q) => viewSearch(q), ''],
];

const NAV = [
  ['home', '#/', 'الرئيسية'], ['songs', '#/songs', 'الأغاني'], ['concerts', '#/concerts', 'الحفلات'], ['interviews', '#/interviews', 'المقابلات'],
  ['sessions', '#/sessions', 'الجلسات'], ['rare', '#/rare', 'النادرة'], ['movies', '#/movies', 'الأفلام'], ['photos', '#/photos', 'الصور'],
  ['timeline', '#/timeline', 'الخط الزمني'], ['people', '#/people', 'الأشخاص'], ['archive', '#/archive', 'الأرشيف'],
];

function setNav(active) {
  $('#nav').innerHTML = NAV.map(([k, h, t]) => `<a href="${h}" class="${k === active ? 'is-on' : ''}" ${k === active ? 'aria-current="page"' : ''}>${t}</a>`).join('');
  $('#nav .is-on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

async function route() {
  const my = ++token;
  const { path, q } = here();
  hideSuggest();
  for (const [re, fn, nav] of ROUTES) {
    const m = re.exec(path);
    if (!m) continue;
    setNav(nav);
    const search = $('#q');
    if (path !== '/search' && document.activeElement !== search) search.value = q.q || '';
    view.innerHTML = '<div class="loading" role="status">جارٍ التحميل...</div>';
    try {
      await fn(m, q);
    } catch (e) {
      if (my === token) view.innerHTML = `<div class="empty"><p class="empty__t">${esc(e.status === 404 ? 'لم نجد هذه الصفحة' : e.message)}</p><a class="btn btn--ghost" href="#/">العودة للرئيسية</a></div>`;
    }
    if (my === token) { window.scrollTo(0, 0); document.title = ($('h1', view)?.textContent ? $('h1', view).textContent + ' — ' : '') + (state.meta.settings.site_title || 'أرشيف عبد الحليم حافظ'); }
    return;
  }
  setNav('');
  view.innerHTML = '<div class="empty"><p class="empty__t">الصفحة غير موجودة</p><a class="btn btn--ghost" href="#/">العودة للرئيسية</a></div>';
}

// ============ البحث الفوري ============
const input = $('#q');
const box = $('#suggest');
$('#search-ic').innerHTML = icon('search', 20);
const hideSuggest = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };

const live = debounce(async () => {
  const text = input.value.trim();
  if (text.length < 1) return hideSuggest();
  try {
    const d = await api('/search', { q: text, per: 3 });
    if (input.value.trim() !== text) return;
    let html = '';
    const link = (h, t, s) => `<a class="sg" href="${h}"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</a>`;
    for (const s of d.songs.rows) html += link(`#/song/${s.id}`, s.title, list([s.composers, s.year]).join(' — '));
    for (const p of d.people.rows) html += link(`#/person/${p.id}`, p.name, 'ملحن أو شاعر');
    for (const c of d.concerts.rows) html += link(`#/concert/${c.id}`, c.title, 'حفلة');
    for (const c of d.sessions.rows) html += link(`#/session/${c.id}`, c.title, 'جلسة');
    for (const c of d.interviews.rows) html += link(`#/interview/${c.id}`, c.title, 'مقابلة');
    for (const c of d.movies.rows) html += link(`#/movie/${c.id}`, c.title, 'فيلم');
    box.innerHTML = (html || '<p class="sg-empty">لا توجد نتائج مطابقة</p>') + `<a class="sg sg--all" href="#/search?q=${encodeURIComponent(text)}">كل النتائج عن «${esc(text)}»</a>`;
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  } catch { hideSuggest(); }
}, 200);

input.addEventListener('input', live);
input.addEventListener('focus', () => { if (input.value.trim()) live(); });
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); location.hash = '/search?q=' + encodeURIComponent(input.value.trim()); input.blur(); }
  if (e.key === 'Escape') { hideSuggest(); input.blur(); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) hideSuggest(); });

// ============ الإقلاع ============
async function boot() {
  try {
    state.meta = await api('/meta');
  } catch {
    view.innerHTML = '<div class="empty"><p class="empty__t">تعذر الاتصال بالخادم</p></div>';
    return;
  }
  const s = state.meta.settings;
  if (s.site_title) $('#brand-name').textContent = s.site_title;
  if (s.tagline) $('#brand-tag').textContent = s.tagline;
  $('#foot').innerHTML = `<p>${esc(s.footer_note || 'أرشيف رقمي لا يعرض إلا المواد التي يملك صاحب الأرشيف حق استخدامها. كل معلومة تُنسب إلى مصدرها مع درجة التأكد.')}</p><a href="/admin">لوحة الإدارة</a>`;
  window.addEventListener('hashchange', route);
  route();
}
boot();
