'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const cfg = require('./config');
const { db, all, get, run, tx } = require('./db');
const { ENTITIES, MEDIA_OWNERS, EXT, LABELS } = require('./schema');
const { terms, norm } = require('./text');
const S = require('./store');
const auth = require('./auth');
const imp = require('./import');

const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// ---------- القوائم ----------
const LIST = {
  people: { sel: 'id,name,roles,birth_year,death_year', from: 'people', text: 'search_text', order: 'name' },
  songs: {
    sel: 'id,title,category,year,(SELECT COUNT(*) FROM recordings r WHERE r.song_id=songs.id) AS rec_count',
    from: 'songs', text: 'search_text', order: 'id DESC',
  },
  recordings: {
    sel: 'id,song_id,song_title,rec_type,is_rare,eff_year AS year,audio_file,concert_title,version_title',
    from: 'v_recordings', text: 'hay', order: 'id DESC',
  },
  concerts: { sel: 'id,title,date,year,city', from: 'concerts', text: 'search_text', order: 'COALESCE(year,0) DESC, id DESC' },
  sessions: { sel: 'id,title,date,year,city', from: 'sessions', text: 'search_text', order: 'COALESCE(year,0) DESC, id DESC' },
  interviews: { sel: 'id,title,date,year,program', from: 'interviews', text: 'search_text', order: 'COALESCE(year,0) DESC, id DESC' },
  movies: { sel: 'id,title,year', from: 'movies', text: 'search_text', order: 'COALESCE(year,0) DESC, id DESC' },
  photos: { sel: 'id,title,file,category,year', from: 'photos', text: 'search_text', order: 'id DESC' },
  sources: { sel: 'id,title,type,url', from: 'sources', text: 'search_text', order: 'title' },
  timeline: { sel: 'id,year,title,kind', from: 'timeline_events', text: 'search_text', order: 'year, id' },
};

function adminList(name, q) {
  const L = LIST[name];
  if (!L) throw S.fail('كيان غير معروف', 404);
  const w = [];
  const a = [];
  for (const t of terms(q.get('q'))) {
    w.push(`${L.text} LIKE ?`);
    a.push(`%${t}%`);
  }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const limit = Math.min(num(q.get('limit')) || 30, 200);
  const offset = num(q.get('offset')) || 0;
  return {
    total: get(`SELECT COUNT(*) n FROM ${L.from} ${where}`, ...a).n,
    rows: all(`SELECT ${L.sel} FROM ${L.from} ${where} ORDER BY ${L.order} LIMIT ? OFFSET ?`, ...a, limit, offset),
  };
}

const brief = (table, col = 'title') => (id) => (id ? get(`SELECT id, ${col} AS label FROM ${table} WHERE id=?`, id) : null);
const briefConcert = (id) => (id ? get("SELECT id, title || COALESCE(' — ' || COALESCE(date, year), '') AS label FROM concerts WHERE id=?", id) : null);

function adminDetail(name, id) {
  const E = ENTITIES[name];
  if (!E) throw S.fail('كيان غير معروف', 404);
  const row = get(`SELECT * FROM ${E.table} WHERE id=?`, id);
  if (!row) throw S.fail('غير موجود', 404);
  delete row.search_text; delete row.key_n; delete row.lyrics_n;
  const out = { item: row, sources: S.getSources(name, id) };
  const people = (sid, role) => all('SELECT p.id, p.name FROM song_people sp JOIN people p ON p.id=sp.person_id WHERE sp.song_id=? AND sp.role=?', sid, role);
  if (name === 'songs') {
    out.people = { composer: people(id, 'composer'), lyricist: people(id, 'lyricist') };
    out.recordings = all('SELECT id, rec_type, eff_year AS year, audio_file, concert_title, version_title FROM v_recordings WHERE song_id=? ORDER BY id', id);
  }
  if (name === 'recordings') {
    out.song = get('SELECT id, title, category FROM songs WHERE id=?', row.song_id);
    out.people = { composer: people(row.song_id, 'composer'), lyricist: people(row.song_id, 'lyricist') };
    out.refs = {
      concert_id: briefConcert(row.concert_id), session_id: brief('sessions')(row.session_id),
      interview_id: brief('interviews')(row.interview_id), movie_id: brief('movies')(row.movie_id),
      arranger_id: brief('people', 'name')(row.arranger_id),
    };
  }
  if (name === 'movies') out.refs = { director_id: brief('people', 'name')(row.director_id) };
  if (name === 'photos') {
    out.people = all('SELECT pe.id, pe.name FROM photo_people pp JOIN people pe ON pe.id=pp.person_id WHERE pp.photo_id=?', id);
    out.refs = {
      concert_id: briefConcert(row.concert_id), session_id: brief('sessions')(row.session_id),
      movie_id: brief('movies')(row.movie_id), interview_id: brief('interviews')(row.interview_id),
    };
  }
  if (MEDIA_OWNERS.includes(name)) out.media = S.getMedia(name, id);
  if (row.videos !== undefined) {
    try { row.videos = row.videos ? JSON.parse(row.videos) : []; } catch { row.videos = []; }
  }
  return out;
}

// ---------- الحفظ ----------
const REF_ENT = {
  concert_id: ['concerts'], session_id: ['sessions'], interview_id: ['interviews'], movie_id: ['movies'],
  arranger_id: ['people', 'arranger'], director_id: ['people', 'director'],
};

function saveEntity(name, body, id = null) {
  return tx(() => {
    const data = { ...body };
    for (const [field, ref] of Object.entries(body._refs || {})) {
      const spec = REF_ENT[field];
      if (!spec) continue;
      data[field] = spec[1] ? S.personRef(ref, spec[1]) : S.resolveRef(spec[0], ref);
    }
    let songId = null;
    if (name === 'recordings') {
      if (body._song) {
        songId = S.resolveRef('songs', body._song, { defaults: { category: body.song_category || 'other' } });
        data.song_id = songId;
      } else if (id) songId = get('SELECT song_id FROM recordings WHERE id=?', id)?.song_id;
      else throw S.fail('اختر الأغنية أو اكتب اسمها');
      if (body.song_category && songId) S.save('songs', { category: body.song_category }, songId);
      if (songId && (body._composers || body._lyricists)) {
        S.setSongPeople(songId, { composer: body._composers || [], lyricist: body._lyricists || [] }, 'merge');
      }
    }
    const saved = S.save(name, data, id);
    if (name === 'songs' && body._people) S.setSongPeople(saved, body._people, 'replace');
    if (name === 'photos' && body._photo_people) S.setPhotoPeople(saved, body._photo_people);
    if (MEDIA_OWNERS.includes(name) && body._media) S.setMedia(name, saved, body._media);
    if (body._sources) S.setSources(name, saved, body._sources);
    if (name === 'recordings' && songId) S.reindex('songs', songId);
    return saved;
  });
}

// ---------- البحث السريع لحقول الاختيار ----------
function lookup(q) {
  const type = q.get('type');
  const cfgs = {
    people: ['people', 'name', 'name'], songs: ['songs', 'title', 'title'],
    concerts: ['concerts', "title || COALESCE(' — ' || COALESCE(date, year), '')", 'title'],
    sessions: ['sessions', 'title', 'title'], interviews: ['interviews', 'title', 'title'],
    movies: ['movies', 'title', 'title'], sources: ['sources', 'title', 'title'],
  };
  const c = cfgs[type];
  if (!c) throw S.fail('نوع غير معروف');
  const w = terms(q.get('q')).map(() => 'search_text LIKE ?');
  const a = terms(q.get('q')).map((t) => `%${t}%`);
  return all(`SELECT id, ${c[1]} AS label FROM ${c[0]} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${c[2]} LIMIT 12`, ...a);
}

// ---------- رفع الملفات ----------
const slug = (n) => (path.parse(n).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'file');

async function upload(ctx) {
  const { req, q } = ctx;
  const kind = q.get('kind');
  if (!cfg.MEDIA_KINDS.includes(kind)) throw S.fail('نوع الوسائط غير صحيح');
  const orig = q.get('name') || 'file';
  const ext = path.extname(orig).slice(1).toLowerCase();
  if (!EXT[kind].includes(ext)) throw S.fail(`صيغة .${ext || '؟'} غير مدعومة. المسموح: ${EXT[kind].join(', ')}`);
  const max = cfg.MAX_UPLOAD_MB * 1024 * 1024;
  if (Number(req.headers['content-length'] || 0) > max) throw S.fail(`الملف أكبر من ${cfg.MAX_UPLOAD_MB} ميجابايت`, 413);

  let dir = path.join(cfg.MEDIA_DIR, kind);
  let stored;
  if (kind === 'images' && q.get('thumb') && q.get('for')) {
    stored = path.basename(q.get('for'));
    dir = path.join(dir, 'thumbs');
  } else {
    stored = `${slug(orig)}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}.${ext}`;
  }
  const tmp = path.join(dir, `.${stored}.part`);
  let size = 0;
  const counter = new Transform({
    transform(chunk, enc, cb) {
      size += chunk.length;
      if (size > max) return cb(S.fail('الملف أكبر من الحد المسموح', 413));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, counter, fs.createWriteStream(tmp));
    if (!size) throw S.fail('الملف فارغ');
    fs.renameSync(tmp, path.join(dir, stored));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return { file: stored, size };
}

// ---------- مسح مجلدات الوسائط وربط الملفات الموجودة ----------
function linkedSet(kind) {
  if (kind === 'audio') {
    return new Set([...all("SELECT audio_file f FROM recordings WHERE audio_file<>''"), ...all("SELECT file f FROM media WHERE kind='audio' AND file<>''")].map((r) => r.f));
  }
  if (kind === 'video') return new Set(all("SELECT file f FROM media WHERE kind='video' AND file<>''").map((r) => r.f));
  const cols = ['SELECT file f FROM photos', 'SELECT image f FROM songs', 'SELECT image f FROM recordings', 'SELECT image f FROM concerts',
    'SELECT image f FROM sessions', 'SELECT image f FROM interviews', 'SELECT image f FROM movies', 'SELECT photo f FROM people'];
  const set = new Set(all(cols.join(' UNION ')).map((r) => r.f));
  for (const r of all("SELECT value v FROM settings WHERE key='hero_image'")) set.add(r.v);
  return set;
}

function scanMedia(kind) {
  if (!cfg.MEDIA_KINDS.includes(kind)) throw S.fail('نوع غير صحيح');
  const dir = path.join(cfg.MEDIA_DIR, kind);
  const linked = linkedSet(kind);
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const ext = path.extname(f).slice(1).toLowerCase();
    if (f.startsWith('.') || !EXT[kind].includes(ext)) continue;
    const st = fs.statSync(full);
    if (st.isFile()) files.push({ file: f, size: st.size, linked: linked.has(f) });
  }
  files.sort((a, b) => Number(a.linked) - Number(b.linked) || a.file.localeCompare(b.file, 'ar'));
  return { total: files.length, unlinked: files.filter((f) => !f.linked).length, files: files.slice(0, 500) };
}

const pretty = (f) => path.parse(f).name.replace(/[-_]+/g, ' ').trim();

function adopt(body) {
  const kind = body.kind;
  const scan = scanMedia(kind);
  const wanted = new Set(body.files && body.files.length ? body.files : scan.files.filter((f) => !f.linked).map((f) => f.file));
  let created = 0;
  tx(() => {
    for (const f of wanted) {
      if (!scan.files.find((x) => x.file === f) || linkedSet(kind).has(f)) continue;
      if (kind === 'audio') {
        const songId = S.resolveRef('songs', { title: pretty(f) }, { defaults: { category: 'other' } });
        S.save('recordings', { song_id: songId, audio_file: f, audio_name: f, rec_type: body.rec_type || 'studio', is_rare: body.is_rare ? 1 : 0, date_certainty: 'unknown' });
        S.reindex('songs', songId);
      } else if (kind === 'images') {
        S.save('photos', { file: f, title: pretty(f), category: body.category || 'other', date_certainty: 'unknown' });
      }
      created++;
    }
  });
  return { created };
}

// ---------- الإعدادات والحالة ----------
const SETTING_KEYS = ['site_title', 'tagline', 'about', 'hero_image', 'hero_caption', 'footer_note'];

function getSettings() {
  return Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
}

function putSettings(body) {
  tx(() => {
    for (const k of SETTING_KEYS) {
      if (!(k in body)) continue;
      const v = String(body[k] ?? '').trim();
      if (v) run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);
      else run('DELETE FROM settings WHERE key=?', k);
    }
  });
  return getSettings();
}

function stats() {
  const c = (t) => get(`SELECT COUNT(*) n FROM ${t}`).n;
  return {
    counts: {
      recordings: c('recordings'), songs: c('songs'), concerts: c('concerts'), sessions: c('sessions'), interviews: c('interviews'),
      movies: c('movies'), photos: c('photos'), people: c('people'), sources: c('sources'), timeline: c('timeline_events'),
    },
    demo: ['songs', 'recordings', 'people', 'concerts', 'sessions', 'interviews', 'movies', 'photos', 'sources', 'timeline_events']
      .reduce((n, t) => n + get(`SELECT COUNT(*) n FROM ${t} WHERE is_demo=1`).n, 0),
    unlinkedAudio: scanMedia('audio').unlinked,
    unlinkedImages: scanMedia('images').unlinked,
    dataDir: cfg.DATA_DIR,
    mediaBase: cfg.MEDIA_BASE_URL || null,
  };
}

function deleteDemo() {
  let n = 0;
  tx(() => {
    for (const name of ['recordings', 'songs', 'photos', 'concerts', 'sessions', 'interviews', 'movies', 'timeline', 'sources', 'people']) {
      for (const r of all(`SELECT id FROM ${ENTITIES[name].table} WHERE is_demo=1`)) n += S.remove(name, r.id);
    }
  });
  return { removed: n };
}

// ---------- النسخ الاحتياطي ----------
function backup(ctx) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const dir = path.join(cfg.DATA_DIR, 'backups');
  const file = path.join(dir, `archive-${stamp}.db`);
  fs.rmSync(file, { force: true });
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().slice(0, -10);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  ctx.res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="halim-archive-${stamp}.db"`,
    'Content-Length': fs.statSync(file).size,
  });
  fs.createReadStream(file).pipe(ctx.res);
  ctx.handled = true;
}

function exportJson(ctx) {
  const dump = { exported_at: new Date().toISOString(), version: 1 };
  for (const t of ['people', 'songs', 'song_people', 'concerts', 'sessions', 'interviews', 'movies', 'recordings', 'media',
    'photos', 'photo_people', 'sources', 'source_links', 'timeline_events', 'settings']) {
    dump[t] = all(`SELECT * FROM ${t}`).map((r) => { delete r.search_text; delete r.key_n; delete r.lyrics_n; return r; });
  }
  const body = JSON.stringify(dump);
  ctx.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="halim-archive-export.json"',
  });
  ctx.res.end(body);
  ctx.handled = true;
}

function rebuildIndex() {
  for (const name of Object.keys(ENTITIES)) S.reindexAll(name);
  return { ok: true };
}

// ---------- جدول المسارات ----------
const routes = [
  ['GET', '/api/admin/stats', () => stats()],
  ['GET', '/api/admin/settings', () => getSettings()],
  ['PUT', '/api/admin/settings', async (c) => putSettings(await c.json())],
  ['GET', '/api/admin/lookup', (c) => lookup(c.q)],
  ['POST', '/api/admin/upload', upload],
  ['GET', /^\/api\/admin\/media\/(audio|images|video)$/, (c) => scanMedia(c.m[1])],
  ['POST', '/api/admin/media/adopt', async (c) => adopt(await c.json())],
  ['POST', /^\/api\/admin\/import\/(\w+)$/, async (c) => imp.importData(c.m[1], await c.text(), c.req.headers['content-type'], c.q.get('dry') === '1')],
  ['POST', '/api/admin/import', async (c) => imp.importData(null, await c.text(), c.req.headers['content-type'], c.q.get('dry') === '1')],
  ['GET', '/api/admin/import-types', () => Object.entries(imp.TYPE_NAMES).map(([key, name]) => ({ key, name, columns: imp.COLS[key].map((x) => x[1]) }))],
  ['GET', /^\/api\/admin\/template\/(\w+)$/, (c) => {
    c.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="template-${c.m[1]}.csv"` });
    c.res.end(imp.template(c.m[1]));
    c.handled = true;
  }],
  ['GET', '/api/admin/backup', backup],
  ['GET', '/api/admin/export', exportJson],
  ['POST', '/api/admin/reindex', () => rebuildIndex()],
  ['POST', '/api/admin/delete-demo', () => deleteDemo()],
  ['POST', '/api/admin/password', async (c) => {
    const b = await c.json();
    const r = auth.changePassword(b.old, b.new);
    if (!r.ok) throw S.fail(r.message);
    return { ok: true };
  }],
  ['GET', /^\/api\/admin\/e\/(\w+)$/, (c) => adminList(c.m[1], c.q)],
  ['GET', /^\/api\/admin\/e\/(\w+)\/(\d+)$/, (c) => adminDetail(c.m[1], Number(c.m[2]))],
  ['POST', /^\/api\/admin\/e\/(\w+)$/, async (c) => {
    if (!ENTITIES[c.m[1]]) throw S.fail('كيان غير معروف', 404);
    return { id: saveEntity(c.m[1], await c.json()) };
  }],
  ['PUT', /^\/api\/admin\/e\/(\w+)\/(\d+)$/, async (c) => {
    if (!ENTITIES[c.m[1]]) throw S.fail('كيان غير معروف', 404);
    return { id: saveEntity(c.m[1], await c.json(), Number(c.m[2])) };
  }],
  ['DELETE', /^\/api\/admin\/e\/(\w+)\/(\d+)$/, (c) => {
    if (!ENTITIES[c.m[1]]) throw S.fail('كيان غير معروف', 404);
    return { removed: S.remove(c.m[1], Number(c.m[2])) };
  }],
];

module.exports = { routes, saveEntity, LABELS };
