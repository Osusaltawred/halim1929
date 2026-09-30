import { esc, icon, api, mediaUrl, dateText, certBadge, L, $ } from './ui.js';

let box;
let items = [];
let idx = 0;
let s = 1, tx = 0, ty = 0;
const ptrs = new Map();
let startDist = 0, startScale = 1, panStart = null, swipeStart = null, lastTap = 0;

function build() {
  box = document.createElement('div');
  box.className = 'lb';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'عرض الصورة');
  box.innerHTML = `
    <div class="lb__top">
      <button class="lb__btn" data-a="close" aria-label="إغلاق">${icon('x', 24)}</button>
      <span class="lb__count"></span>
      <div class="lb__tools">
        <button class="lb__btn" data-a="zoomout" aria-label="تصغير">${icon('zoomout', 22)}</button>
        <button class="lb__btn" data-a="zoomin" aria-label="تكبير">${icon('zoomin', 22)}</button>
        <button class="lb__btn" data-a="info" aria-label="معلومات الصورة">${icon('info', 22)}</button>
      </div>
    </div>
    <div class="lb__stage"><img class="lb__img" alt="" draggable="false"></div>
    <button class="lb__nav lb__nav--r" data-a="prev" aria-label="السابقة">${icon('chevr', 30)}</button>
    <button class="lb__nav lb__nav--l" data-a="next" aria-label="التالية">${icon('chevl', 30)}</button>
    <div class="lb__info" hidden></div>`;
  document.body.append(box);

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') close();
    else if (a === 'next') go(1);
    else if (a === 'prev') go(-1);
    else if (a === 'zoomin') zoomBy(1.5);
    else if (a === 'zoomout') zoomBy(1 / 1.5);
    else if (a === 'info') toggleInfo();
  });

  const stage = $('.lb__stage', box);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; startDist = Math.hypot(a.x - b.x, a.y - b.y); startScale = s; }
    else { panStart = { x: e.clientX - tx, y: e.clientY - ty }; swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      s = clamp(startScale * (Math.hypot(a.x - b.x, a.y - b.y) / startDist), 1, 8);
      apply();
    } else if (s > 1 && panStart) { tx = e.clientX - panStart.x; ty = e.clientY - panStart.y; apply(); }
  });
  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0 && swipeStart && s === 1) {
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        const now = Date.now();
        if (now - lastTap < 320) { s === 1 ? zoomBy(2.5) : reset(); lastTap = 0; } else lastTap = now;
      }
    }
    if (ptrs.size === 0) { panStart = null; swipeStart = null; if (s === 1) { tx = 0; ty = 0; apply(); } }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(1); // الواجهة من اليمين لليسار
    else if (e.key === 'ArrowRight') go(-1);
    else if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-') zoomBy(1 / 1.4);
    else if (e.key === '0') reset();
  });
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function apply() { $('.lb__img', box).style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; $('.lb__stage', box).classList.toggle('is-zoomed', s > 1); }
function reset() { s = 1; tx = 0; ty = 0; apply(); }
function zoomBy(f) { s = clamp(s * f, 1, 8); if (s === 1) { tx = 0; ty = 0; } apply(); }

function go(d) {
  if (items.length < 2) return;
  idx = (idx + d + items.length) % items.length;
  show();
}

function show() {
  const it = items[idx];
  reset();
  const im = $('.lb__img', box);
  im.src = mediaUrl('images', it.file);
  im.alt = it.title || '';
  $('.lb__count', box).textContent = `${idx + 1} / ${items.length}`;
  const info = $('.lb__info', box);
  if (!info.hidden) renderInfo();
}

function toggleInfo() {
  const info = $('.lb__info', box);
  info.hidden = !info.hidden;
  if (!info.hidden) renderInfo();
}

async function renderInfo() {
  const it = items[idx];
  const info = $('.lb__info', box);
  const cats = L().photoCats || {};
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  const draw = (extra = '') => {
    info.innerHTML = `<h3>${esc(it.title || 'صورة بدون عنوان')}</h3><dl>
      ${row('التاريخ', esc(dateText(it, { fallback: 'التاريخ غير مؤكد' })) + ' ' + certBadge(it.date_certainty))}
      ${row('المكان', esc(it.place || ''))}
      ${row('الأشخاص', esc(it.people || it.people_text || ''))}
      ${row('التصنيف', esc(cats[it.category] || ''))}
      ${row('الوصف', esc(it.description || ''))}
      ${extra}</dl>`;
  };
  draw();
  try {
    const d = await api('/photos/' + it.id);
    if (items[idx] !== it) return;
    const src = d.sources.length
      ? `<dt>المصدر</dt><dd>${d.sources.map((x) => `${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : esc(x.title)} ${certBadge(x.certainty, true)}`).join('<br>')}</dd>`
      : '<dt>المصدر</dt><dd class="muted">بيانات تحتاج إلى إدخال</dd>';
    draw(src);
  } catch { /* نكتفي بما لدينا */ }
}

export function close() {
  if (!box || box.hidden) return;
  box.hidden = true;
  document.body.classList.remove('lb-open');
  if (box._opener) box._opener.focus?.();
}

export function openLightbox(list, index, opener) {
  if (!box) build();
  items = list;
  idx = index;
  box._opener = opener;
  box.hidden = false;
  document.body.classList.add('lb-open');
  $('.lb__info', box).hidden = true;
  $('[data-a=close]', box).focus();
  $$nav();
  show();
}

function $$nav() {
  const one = items.length < 2;
  for (const n of box.querySelectorAll('.lb__nav')) n.hidden = one;
}
