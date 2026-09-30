// المشغل يعيش خارج عنصر الصفحة #view، لذلك لا يتوقف الصوت عند التنقل بين الصفحات.
// لا يُحمَّل أي ملف صوتي إلا عند الضغط على تشغيل (preload="none").
import { esc, icon, cover, fmtTime, toast, $, $$ } from './ui.js';

const LS = {
  get: (k, d) => { try { return localStorage.getItem('halim.' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('halim.' + k, v); } catch { /* تجاهل */ } },
};

const audio = document.getElementById('audio');
const root = document.getElementById('player');
const fab = document.getElementById('player-fab');

export const Player = {
  items: [], i: -1, bag: [], hist: [],
  shuffle: LS.get('shuffle', '0') === '1',
  repeat: LS.get('repeat', 'off'),
  minimized: false,

  get current() { return this.items[this.i] || null; },
  get playing() { return !audio.paused && !audio.ended; },

  // تشغيل عنصر ضمن قائمة
  play(items, key) {
    const list = items.filter((x) => x.src);
    if (!list.length) return toast('لا يوجد ملف صوتي لهذا العنصر بعد', 'warn');
    const same = list.length === this.items.length && list.every((x, n) => x.key === this.items[n].key);
    if (!same) { this.items = list; this.hist = []; }
    const idx = Math.max(0, list.findIndex((x) => x.key === key));
    this.resetBag(idx);
    this.load(idx);
  },

  toggleKey(key) {
    if (this.current && this.current.key === key) return this.toggle();
    return false;
  },

  toggle() {
    if (!this.current) return;
    if (audio.paused) audio.play().catch(() => this.fail()); else audio.pause();
  },

  resetBag(except) {
    this.bag = this.items.map((_, n) => n).filter((n) => n !== except);
  },

  load(i) {
    const it = this.items[i];
    if (!it) return;
    if (this.i >= 0 && this.i !== i) this.hist.push(this.i);
    if (this.hist.length > 200) this.hist.shift();
    this.i = i;
    this.bag = this.bag.filter((n) => n !== i);
    audio.src = it.src;
    audio.play().catch(() => this.fail());
    this.show();
    this.render();
  },

  fail() {
    toast('تعذر تشغيل هذا الملف. تأكد أنه موجود في مجلد الصوت.', 'warn');
    this.sync();
  },

  next(auto = false) {
    if (!this.items.length) return;
    if (auto && this.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let n;
    if (this.shuffle && this.items.length > 1) {
      if (!this.bag.length) {
        if (auto && this.repeat !== 'all') return this.stop();
        this.resetBag(this.i);
      }
      n = this.bag[Math.floor(Math.random() * this.bag.length)];
    } else {
      n = this.i + 1;
      if (n >= this.items.length) {
        if (auto && this.repeat !== 'all') return this.stop();
        n = 0;
      }
    }
    this.load(n);
  },

  prev() {
    if (!this.items.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const back = this.hist.pop();
    this.load(back !== undefined ? back : (this.i - 1 + this.items.length) % this.items.length);
    this.hist.pop(); // لا نسجّل الرجوع نفسه في السجل
  },

  stop() { audio.pause(); audio.currentTime = 0; this.sync(); },

  setShuffle(v) { this.shuffle = v; LS.set('shuffle', v ? '1' : '0'); this.resetBag(this.i); this.render(); },
  cycleRepeat() {
    this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat];
    LS.set('repeat', this.repeat);
    this.render();
  },

  show() { root.hidden = false; this.setMin(false); },
  setMin(v) {
    this.minimized = v;
    root.classList.toggle('is-min', v);
    fab.hidden = !v || !this.items.length;
    document.body.classList.toggle('has-player', !v && !!this.items.length);
    document.body.classList.toggle('has-player-min', v && !!this.items.length);
    if (v) this.closeSheet();
  },
  openSheet() { root.classList.add('is-open'); $('.pl-sheet', root).hidden = false; document.body.classList.add('sheet-open'); $('[data-act=close]', root).focus(); },
  closeSheet() { root.classList.remove('is-open'); $('.pl-sheet', root).hidden = true; document.body.classList.remove('sheet-open'); },

  // ---------- الرسم ----------
  render() {
    const it = this.current;
    if (!it) return;
    const sub = it.subtitle || '';
    $('.pl-mini .pl-cover', root).innerHTML = cover(it.image, 'cover cover--sm');
    $('.pl-mini .pl-title', root).textContent = it.title;
    $('.pl-mini .pl-sub', root).textContent = sub;
    $('.pl-art', root).innerHTML = cover(it.image, 'cover cover--xl');
    $('.pl-name', root).textContent = it.title;
    $('.pl-by', root).textContent = sub;
    const go = $('.pl-goto', root);
    go.hidden = !it.href;
    if (it.href) go.href = it.href;
    $('[data-act=shuffle]', root).classList.toggle('is-on', this.shuffle);
    $('[data-act=shuffle]', root).setAttribute('aria-pressed', String(this.shuffle));
    const rep = $('[data-act=repeat]', root);
    rep.classList.toggle('is-on', this.repeat !== 'off');
    rep.innerHTML = icon(this.repeat === 'one' ? 'repeat1' : 'repeat', 22);
    rep.setAttribute('aria-label', { off: 'التكرار متوقف', all: 'تكرار القائمة', one: 'تكرار الأغنية' }[this.repeat]);
    $('.pl-queue', root).innerHTML = this.items.map((x, n) => `
      <li><button class="pl-q${n === this.i ? ' is-current' : ''}" data-qi="${n}">
        <span class="pl-q__t">${esc(x.title)}</span><small>${esc(x.subtitle || '')}</small></button></li>`).join('');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: sub || 'عبد الحليم حافظ', album: 'أرشيف عبد الحليم حافظ' });
    }
    this.sync();
    this.time();
  },

  sync() {
    const playing = this.playing;
    document.body.classList.toggle('is-playing', playing);
    for (const b of $$('[data-act=toggle]', root)) {
      b.innerHTML = icon(playing ? 'pause' : 'play', b.classList.contains('pl-play--big') ? 30 : 24);
      b.setAttribute('aria-label', playing ? 'إيقاف مؤقت' : 'تشغيل');
    }
    const key = this.current?.key;
    for (const b of $$('[data-play]')) {
      const cur = b.dataset.play === key;
      b.classList.toggle('is-current', cur);
      if (b.classList.contains('play-btn')) {
        b.innerHTML = icon(cur && playing ? 'pause' : 'play', b.dataset.size ? Number(b.dataset.size) : 22);
        b.setAttribute('aria-label', cur && playing ? 'إيقاف مؤقت' : 'تشغيل');
      }
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  },

  time() {
    const dur = Number.isFinite(audio.duration) ? audio.duration : this.current?.duration || 0;
    const cur = audio.currentTime || 0;
    const p = dur ? Math.min(1, cur / dur) : 0;
    $('.pl-thin i', root).style.width = p * 100 + '%';
    const seek = $('.pl-range', root);
    if (!seek.dataset.drag) seek.value = String(Math.round(p * 1000));
    seek.style.setProperty('--p', p * 100 + '%');
    $('.pl-cur', root).textContent = fmtTime(cur);
    $('.pl-dur', root).textContent = dur ? fmtTime(dur) : '--:--';
  },
};

// ---------- بناء الواجهة ----------
root.innerHTML = `
  <div class="pl-mini">
    <div class="pl-thin"><i></i></div>
    <button class="pl-info" data-act="open" aria-label="فتح المشغل الكامل">
      <span class="pl-cover"></span>
      <span class="pl-txt"><b class="pl-title"></b><small class="pl-sub"></small></span>
    </button>
    <div class="pl-ctrls">
      <button class="pl-btn pl-hide-sm" data-act="prev" aria-label="السابق">${icon('prev', 22)}</button>
      <button class="pl-btn pl-play" data-act="toggle" aria-label="تشغيل">${icon('play', 24)}</button>
      <button class="pl-btn" data-act="next" aria-label="التالي">${icon('next', 22)}</button>
      <button class="pl-btn pl-hide-sm2" data-act="hide" aria-label="إخفاء المشغل">${icon('down', 22)}</button>
    </div>
  </div>
  <div class="pl-sheet" role="dialog" aria-label="مشغل الصوت" hidden>
    <div class="pl-sheet__top">
      <button class="pl-btn" data-act="close" aria-label="إغلاق">${icon('down', 26)}</button>
      <span>يُشغَّل الآن</span>
      <button class="pl-btn" data-act="hide" aria-label="إخفاء المشغل">${icon('x', 22)}</button>
    </div>
    <div class="pl-sheet__body">
      <div class="pl-art"></div>
      <div class="pl-meta">
        <h2 class="pl-name"></h2>
        <p class="pl-by"></p>
        <a class="pl-goto" href="#/" data-act="goto">الانتقال إلى صفحة الأغنية</a>
      </div>
      <div class="pl-seek" dir="ltr">
        <span class="pl-cur">0:00</span>
        <input class="pl-range" type="range" min="0" max="1000" value="0" aria-label="موضع التشغيل">
        <span class="pl-dur">--:--</span>
      </div>
      <div class="pl-main" dir="ltr">
        <button class="pl-btn" data-act="shuffle" aria-label="عشوائي" aria-pressed="false">${icon('shuffle', 22)}</button>
        <button class="pl-btn pl-btn--lg" data-act="prev" aria-label="السابق">${icon('prev', 28)}</button>
        <button class="pl-btn pl-play pl-play--big" data-act="toggle" aria-label="تشغيل">${icon('play', 30)}</button>
        <button class="pl-btn pl-btn--lg" data-act="next" aria-label="التالي">${icon('next', 28)}</button>
        <button class="pl-btn" data-act="repeat" aria-label="التكرار">${icon('repeat', 22)}</button>
      </div>
      <div class="pl-vol" dir="ltr">${icon('volume', 20)}<input class="pl-vol__r" type="range" min="0" max="1" step="0.01" aria-label="مستوى الصوت"></div>
      <h3 class="pl-qh">قائمة التشغيل</h3>
      <ol class="pl-queue"></ol>
    </div>
  </div>`;
fab.innerHTML = icon('music', 24);

const volume = Number(LS.get('volume', '1'));
audio.volume = Number.isFinite(volume) ? volume : 1;
$('.pl-vol__r', root).value = String(audio.volume);

root.addEventListener('click', (e) => {
  const q = e.target.closest('[data-qi]');
  if (q) return Player.load(Number(q.dataset.qi));
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'toggle') Player.toggle();
  else if (act === 'next') Player.next();
  else if (act === 'prev') Player.prev();
  else if (act === 'open') Player.openSheet();
  else if (act === 'close') Player.closeSheet();
  else if (act === 'hide') { audio.pause(); Player.setMin(true); }
  else if (act === 'shuffle') Player.setShuffle(!Player.shuffle);
  else if (act === 'repeat') Player.cycleRepeat();
  else if (act === 'goto') Player.closeSheet();
});
fab.addEventListener('click', () => Player.setMin(false));

const seek = $('.pl-range', root);
seek.addEventListener('input', () => {
  seek.dataset.drag = '1';
  const dur = audio.duration;
  if (Number.isFinite(dur)) { audio.currentTime = (Number(seek.value) / 1000) * dur; Player.time(); }
});
seek.addEventListener('change', () => { delete seek.dataset.drag; });
$('.pl-vol__r', root).addEventListener('input', (e) => { audio.volume = Number(e.target.value); LS.set('volume', e.target.value); });

audio.addEventListener('timeupdate', () => Player.time());
audio.addEventListener('loadedmetadata', () => { if (Player.current) Player.current.duration = audio.duration; Player.time(); });
audio.addEventListener('play', () => Player.sync());
audio.addEventListener('pause', () => Player.sync());
audio.addEventListener('ended', () => Player.next(true));
audio.addEventListener('error', () => { if (audio.src) Player.fail(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && root.classList.contains('is-open')) Player.closeSheet();
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.code === 'Space' && Player.current && !['input', 'textarea', 'select', 'button', 'a'].includes(tag) && !e.target.isContentEditable) {
    e.preventDefault();
    Player.toggle();
  }
});

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => Player.toggle());
  ms.setActionHandler('pause', () => Player.toggle());
  ms.setActionHandler('previoustrack', () => Player.prev());
  ms.setActionHandler('nexttrack', () => Player.next());
  try { ms.setActionHandler('seekto', (d) => { audio.currentTime = d.seekTime; }); } catch { /* غير مدعوم */ }
}
