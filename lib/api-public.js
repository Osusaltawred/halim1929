'use strict';
const { all, get } = require('./db');
const cfg = require('./config');
const { LABELS } = require('./schema');
const { terms } = require('./text');
const { getSources, getMedia, fail } = require('./store');

const num = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const page = (q, def = 24) => ({
  limit: Math.min(Math.max(num(q.get('limit')) || def, 1), 100),
  offset: Math.max(num(q.get('offset')) || 0, 0),
});
const dir = (q, def = 'asc') => (q.get('dir') === 'desc' ? 'DESC' : q.get('dir') === 'asc' ? 'ASC' : def);

const COMPOSERS = (sid) => `(SELECT group_concat(p.name, '، ') FROM song_people sp JOIN people p ON p.id=sp.person_id WHERE sp.song_id=${sid} AND sp.role='composer')`;
const LYRICISTS = (sid) => `(SELECT group_concat(p.name, '، ') FROM song_people sp JOIN people p ON p.id=sp.person_id WHERE sp.song_id=${sid} AND sp.role='lyricist')`;

// شرط بحث لكل كلمة: نص عادي، أو سنة مطابقة تمامًا
function termWhere(q, cols, yearExpr) {
  const where = [];
  const args = [];
  for (const t of terms(q)) {
    const parts = cols.map((c) => `${c} LIKE ?`);
    cols.forEach(() => args.push(`%${t}%`));
    if (yearExpr && /^\d{4}$/.test(t)) {
      parts.push(`${yearExpr} = ?`);
      args.push(Number(t));
    }
    where.push('(' + parts.join(' OR ') + ')');
  }
  return { where, args };
}

function decadeRange(q) {
  const dec = num(q.get('decade'));
  if (dec) return [dec, dec + 9];
  const y = num(q.get('year'));
  if (y) return [y, y];
  return null;
}

// ---------- التسجيلات ----------
function recordingsFilter(q) {
  const w = [];
  const a = [];
  const t = termWhere(q.get('q'), ['v.hay', 'v.lyrics_n'], 'v.eff_year');
  w.push(...t.where);
  a.push(...t.args);
  const range = decadeRange(q);
  if (range) { w.push('v.eff_year BETWEEN ? AND ?'); a.push(...range); }
  if (q.get('undated')) w.push('v.eff_year IS NULL');
  const eq = { type: 'v.rec_type', category: 'v.song_category', song: 'v.song_id', concert: 'v.concert_id',
    session: 'v.session_id', interview: 'v.interview_id', movie: 'v.movie_id' };
  for (const [k, col] of Object.entries(eq)) {
    if (q.get(k)) { w.push(`${col} = ?`); a.push(k === 'type' || k === 'category' ? q.get(k) : num(q.get(k))); }
  }
  if (q.get('rare')) w.push('v.is_rare = 1');
  if (q.get('has_audio')) w.push("v.audio_file IS NOT NULL AND v.audio_file <> ''");
  if (num(q.get('person'))) {
    w.push('(EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=v.song_id AND sp.person_id=?) OR v.arranger_id=?)');
    a.push(num(q.get('person')), num(q.get('person')));
  }
  for (const role of ['composer', 'lyricist']) {
    if (num(q.get(role))) {
      w.push('EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=v.song_id AND sp.person_id=? AND sp.role=?)');
      a.push(num(q.get(role)), role);
    }
  }
  return { w, a };
}

const REC_SORT = {
  year: 'v.eff_year', date: 'v.eff_year', kind: 'v.rec_type', title: 'v.song_title',
  composer: COMPOSERS('v.song_id'), lyricist: LYRICISTS('v.song_id'), concert: 'v.concert_title',
  movie: 'v.movie_title', session: 'v.session_title',
};

function listRecordings(q, opts = {}) {
  const { w, a } = recordingsFilter(q);
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { limit, offset } = page(q, opts.limit || 24);
  const sort = q.get('sort');
  const d = dir(q);
  let order;
  if (sort === 'new') order = 'v.id DESC';
  else if (REC_SORT[sort]) order = `(${REC_SORT[sort]} IS NULL), ${REC_SORT[sort]} ${d}, v.eff_date ${d}, v.song_title`;
  else order = '(v.eff_year IS NULL), v.eff_year ASC, v.eff_date, v.song_title';
  const total = get(`SELECT COUNT(*) n FROM v_recordings v ${where}`, ...a).n;
  const rows = all(`SELECT v.*, ${COMPOSERS('v.song_id')} AS composers, ${LYRICISTS('v.song_id')} AS lyricists,
                    COALESCE(v.image, v.song_image) AS cover
                    FROM v_recordings v ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...a, limit, offset);
  return { total, rows };
}

// ---------- الأغاني (الأعمال) ----------
const REC_KINDS = ['studio', 'live', 'radio', 'rehearsal', 'session', 'private', 'incomplete'];
const CAT_KINDS = ['national', 'poem', 'romantic', 'religious', 'muwashah'];

function kindClause(kind) {
  if (REC_KINDS.includes(kind)) return ['EXISTS(SELECT 1 FROM recordings r WHERE r.song_id=s.id AND r.rec_type=?)', [kind]];
  if (CAT_KINDS.includes(kind)) return ['s.category=?', [kind]];
  if (kind === 'film') return ["(s.category='film' OR EXISTS(SELECT 1 FROM recordings r WHERE r.song_id=s.id AND r.rec_type='film'))", []];
  if (kind === 'rare') return ['EXISTS(SELECT 1 FROM recordings r WHERE r.song_id=s.id AND r.is_rare=1)', []];
  if (kind === 'undated') return ['(s.year IS NULL AND NOT EXISTS(SELECT 1 FROM v_recordings v WHERE v.song_id=s.id AND v.eff_year IS NOT NULL))', []];
  return null;
}

const SONG_EFF_YEAR = 'COALESCE(s.year, (SELECT MIN(v.eff_year) FROM v_recordings v WHERE v.song_id=s.id))';
const SONG_SORT = {
  year: SONG_EFF_YEAR, title: 's.title', kind: 's.category',
  composer: COMPOSERS('s.id'), lyricist: LYRICISTS('s.id'),
};

function listSongs(q) {
  const w = [];
  const a = [];
  for (const t of terms(q.get('q'))) {
    const parts = ['s.search_text LIKE ?', 's.lyrics_n LIKE ?', 'EXISTS(SELECT 1 FROM v_recordings v WHERE v.song_id=s.id AND v.hay LIKE ?)'];
    a.push(`%${t}%`, `%${t}%`, `%${t}%`);
    if (/^\d{4}$/.test(t)) {
      parts.push('s.year=?', 'EXISTS(SELECT 1 FROM v_recordings v WHERE v.song_id=s.id AND v.eff_year=?)');
      a.push(Number(t), Number(t));
    }
    w.push('(' + parts.join(' OR ') + ')');
  }
  const kc = kindClause(q.get('kind'));
  if (kc) { w.push(kc[0]); a.push(...kc[1]); }
  if (q.get('category')) { w.push('s.category=?'); a.push(q.get('category')); }
  const range = decadeRange(q);
  if (range) {
    w.push(`(s.year BETWEEN ? AND ? OR EXISTS(SELECT 1 FROM v_recordings v WHERE v.song_id=s.id AND v.eff_year BETWEEN ? AND ?))`);
    a.push(...range, ...range);
  }
  for (const [k, col] of [['concert', 'concert_id'], ['session', 'session_id'], ['movie', 'movie_id'], ['interview', 'interview_id']]) {
    if (num(q.get(k))) { w.push(`EXISTS(SELECT 1 FROM recordings r WHERE r.song_id=s.id AND r.${col}=?)`); a.push(num(q.get(k))); }
  }
  if (num(q.get('person'))) { w.push('EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=s.id AND sp.person_id=?)'); a.push(num(q.get('person'))); }
  for (const role of ['composer', 'lyricist']) {
    if (num(q.get(role))) { w.push('EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=s.id AND sp.person_id=? AND sp.role=?)'); a.push(num(q.get(role)), role); }
  }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { limit, offset } = page(q);
  const sort = q.get('sort');
  const d = dir(q);
  let order = `(${SONG_EFF_YEAR} IS NULL), ${SONG_EFF_YEAR} ASC, s.title`;
  if (sort === 'new') order = 's.id DESC';
  else if (SONG_SORT[sort]) order = `(${SONG_SORT[sort]} IS NULL), ${SONG_SORT[sort]} ${d}, s.title`;
  const total = get(`SELECT COUNT(*) n FROM songs s ${where}`, ...a).n;
  const rows = all(`SELECT s.id, s.title, s.category, s.image, s.certainty,
      ${SONG_EFF_YEAR} AS year,
      (SELECT COUNT(*) FROM recordings r WHERE r.song_id=s.id) AS rec_count,
      (SELECT COUNT(*) FROM recordings r WHERE r.song_id=s.id AND r.audio_file<>'') AS audio_count,
      ${COMPOSERS('s.id')} AS composers, ${LYRICISTS('s.id')} AS lyricists,
      (SELECT r.id FROM recordings r WHERE r.song_id=s.id AND r.audio_file<>'' ORDER BY (r.rec_type='studio') DESC, r.id LIMIT 1) AS play_rec_id,
      (SELECT r.audio_file FROM recordings r WHERE r.song_id=s.id AND r.audio_file<>'' ORDER BY (r.rec_type='studio') DESC, r.id LIMIT 1) AS play_file,
      (SELECT r.duration_sec FROM recordings r WHERE r.song_id=s.id AND r.audio_file<>'' ORDER BY (r.rec_type='studio') DESC, r.id LIMIT 1) AS play_duration,
      COALESCE(s.image, (SELECT r.image FROM recordings r WHERE r.song_id=s.id AND r.image<>'' LIMIT 1)) AS cover
      FROM songs s ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...a, limit, offset);
  return { total, rows };
}

function songDetail(id) {
  const song = get('SELECT * FROM songs WHERE id=?', id);
  if (!song) throw fail('الأغنية غير موجودة', 404);
  delete song.search_text; delete song.lyrics_n; delete song.key_n;
  const people = all(`SELECT p.id, p.name, sp.role FROM song_people sp JOIN people p ON p.id=sp.person_id WHERE sp.song_id=? ORDER BY sp.role, p.name`, id);
  const recordings = all(`SELECT v.*, COALESCE(v.image, v.song_image) AS cover,
      (SELECT name FROM people WHERE id=v.arranger_id) AS arranger
      FROM v_recordings v WHERE v.song_id=? ORDER BY (v.rec_type='studio') DESC, (v.eff_year IS NULL), v.eff_year, v.id`, id);
  for (const r of recordings) r.sources = getSources('recordings', r.id);
  return { song, people, recordings, sources: getSources('songs', id) };
}

// ---------- الحفلات والجلسات والمقابلات والأفلام ----------
const VIDEO = (r) => { try { r.videos = r.videos ? JSON.parse(r.videos) : []; } catch { r.videos = []; } return r; };

const COLLECTIONS = {
  concerts: {
    table: 'concerts', cols: 'id,title,date,date_certainty,year,year_from,year_to,venue,city,country,occasion,image',
    search: ['search_text'], yearCol: 'year', order: 'date',
  },
  sessions: {
    table: 'sessions', cols: 'id,title,date,date_certainty,year,year_from,year_to,venue,city,attendees,image',
    search: ['search_text'], yearCol: 'year', order: 'date',
  },
  interviews: {
    table: 'interviews', cols: 'id,title,date,date_certainty,year,year_from,year_to,program,host,venue,city,duration_sec,image',
    search: ['search_text'], yearCol: 'year', order: 'date',
  },
  movies: {
    table: 'movies', cols: 'id,title,title_en,year,director_id,cast_text,image', search: ['search_text'], yearCol: 'year', order: 'year',
  },
};

function listCollection(name, q) {
  const C = COLLECTIONS[name];
  const yexp = name === 'movies' ? 'year' : 'COALESCE(year, year_from)';
  const t = termWhere(q.get('q'), C.search, C.yearCol);
  const w = [...t.where];
  const a = [...t.args];
  const range = decadeRange(q);
  if (range) {
    w.push(`${yexp} BETWEEN ? AND ?`);
    a.push(...range);
  }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { limit, offset } = page(q);
  const d = dir(q, 'asc');
  const ord = name === 'movies'
    ? `(year IS NULL), year ${d}, title`
    : `(${yexp} IS NULL), ${yexp} ${d}, date ${d}, title`;
  const total = get(`SELECT COUNT(*) n FROM ${C.table} ${where}`, ...a).n;
  const extra = name === 'movies'
    ? ', (SELECT name FROM people WHERE id=movies.director_id) AS director'
    : '';
  const counts = name === 'movies'
    ? ', (SELECT COUNT(*) FROM recordings r WHERE r.movie_id=movies.id) AS rec_count'
    : name === 'interviews'
      ? ", (SELECT COUNT(*) FROM media m WHERE m.owner_type='interviews' AND m.owner_id=interviews.id) AS media_count"
      : `, (SELECT COUNT(*) FROM recordings r WHERE r.${name === 'concerts' ? 'concert_id' : 'session_id'}=${C.table}.id) AS rec_count`;
  const rows = all(`SELECT ${C.cols}${extra}${counts} FROM ${C.table} ${where} ORDER BY ${ord} LIMIT ? OFFSET ?`, ...a, limit, offset);
  return { total, rows };
}

function collectionDetail(name, id) {
  const C = COLLECTIONS[name];
  const row = get(`SELECT * FROM ${C.table} WHERE id=?`, id);
  if (!row) throw fail('غير موجود', 404);
  delete row.search_text; delete row.key_n;
  VIDEO(row);
  const fk = { concerts: 'concert_id', sessions: 'session_id', interviews: 'interview_id', movies: 'movie_id' }[name];
  const recordings = all(`SELECT v.*, COALESCE(v.image, v.song_image) AS cover,
      ${COMPOSERS('v.song_id')} AS composers, ${LYRICISTS('v.song_id')} AS lyricists
      FROM v_recordings v WHERE v.${fk}=? ORDER BY v.id`, id);
  const photos = all(`SELECT id,title,file,category,year FROM photos WHERE ${fk}=? ORDER BY id LIMIT 60`, id);
  const out = { item: row, recordings, photos, media: getMedia(name, id), sources: getSources(name, id) };
  if (name === 'movies' && row.director_id) out.director = get('SELECT id,name FROM people WHERE id=?', row.director_id);
  return out;
}

// ---------- الأشخاص ----------
function listPeople(q) {
  const t = termWhere(q.get('q'), ['search_text']);
  const w = [...t.where];
  const a = [...t.args];
  if (q.get('role')) { w.push("(',' || roles || ',') LIKE ?"); a.push(`%,${q.get('role')},%`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { limit, offset } = page(q, 48);
  const total = get(`SELECT COUNT(*) n FROM people ${where}`, ...a).n;
  const rows = all(`SELECT id,name,roles,photo,birth_year,death_year,
      (SELECT COUNT(DISTINCT song_id) FROM song_people sp WHERE sp.person_id=people.id) AS song_count
      FROM people ${where} ORDER BY song_count DESC, name LIMIT ? OFFSET ?`, ...a, limit, offset);
  return { total, rows };
}

function personDetail(id) {
  const person = get('SELECT id,name,name_en,roles,bio,birth_year,death_year,photo,certainty FROM people WHERE id=?', id);
  if (!person) throw fail('الشخص غير موجود', 404);
  const songs = all(`SELECT s.id, s.title, s.category, ${SONG_EFF_YEAR} AS year, group_concat(sp.role) AS roles,
      (SELECT COUNT(*) FROM recordings r WHERE r.song_id=s.id) AS rec_count
      FROM song_people sp JOIN songs s ON s.id=sp.song_id WHERE sp.person_id=? GROUP BY s.id ORDER BY (year IS NULL), year, s.title`, id);
  const where = 'EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=v.song_id AND sp.person_id=?)';
  const recordings = all(`SELECT v.*, COALESCE(v.image, v.song_image) AS cover FROM v_recordings v WHERE ${where} ORDER BY (v.eff_year IS NULL), v.eff_year, v.song_title LIMIT 300`, id);
  const rel = (tbl, fk) => all(`SELECT DISTINCT t.id, t.title, t.date, t.year, t.city FROM ${tbl} t JOIN recordings r ON r.${fk}=t.id
      WHERE EXISTS(SELECT 1 FROM song_people sp WHERE sp.song_id=r.song_id AND sp.person_id=?) ORDER BY (t.year IS NULL), t.date, t.year`, id);
  const movies = all(`SELECT DISTINCT m.id, m.title, m.year FROM movies m
      WHERE m.director_id=? OR EXISTS(SELECT 1 FROM recordings r JOIN song_people sp ON sp.song_id=r.song_id WHERE r.movie_id=m.id AND sp.person_id=?)
      ORDER BY (m.year IS NULL), m.year`, id, id);
  const years = [...new Set(recordings.map((r) => r.eff_year).filter(Boolean))].sort();
  const photos = all(`SELECT p.id,p.title,p.file,p.year FROM photo_people pp JOIN photos p ON p.id=pp.photo_id WHERE pp.person_id=? LIMIT 48`, id);
  return {
    person, songs, recordings, concerts: rel('concerts', 'concert_id'), sessions: rel('sessions', 'session_id'),
    movies, years, photos, sources: getSources('people', id),
  };
}

// ---------- الصور ----------
function listPhotos(q) {
  const t = termWhere(q.get('q'), ['p.search_text'], 'p.year');
  const w = [...t.where];
  const a = [...t.args];
  if (q.get('category')) { w.push('p.category=?'); a.push(q.get('category')); }
  if (q.get('color')) { w.push('p.color=?'); a.push(q.get('color')); }
  const range = decadeRange(q);
  if (range) { w.push('COALESCE(p.year,p.year_from) BETWEEN ? AND ?'); a.push(...range); }
  for (const k of ['concert', 'session', 'movie', 'interview']) {
    if (num(q.get(k))) { w.push(`p.${k}_id=?`); a.push(num(q.get(k))); }
  }
  if (num(q.get('person'))) { w.push('EXISTS(SELECT 1 FROM photo_people pp WHERE pp.photo_id=p.id AND pp.person_id=?)'); a.push(num(q.get('person'))); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const { limit, offset } = page(q, 36);
  const total = get(`SELECT COUNT(*) n FROM photos p ${where}`, ...a).n;
  const rows = all(`SELECT p.id,p.title,p.file,p.category,p.color,p.date,p.date_certainty,p.year,p.year_from,p.year_to,p.place,p.people_text,p.description,
      (SELECT group_concat(pe.name, '، ') FROM photo_people pp JOIN people pe ON pe.id=pp.person_id WHERE pp.photo_id=p.id) AS people
      FROM photos p ${where} ORDER BY (COALESCE(p.year,p.year_from) IS NULL), COALESCE(p.year,p.year_from), p.date, p.id LIMIT ? OFFSET ?`, ...a, limit, offset);
  return { total, rows };
}

// ---------- الخط الزمني ----------
function timeline() {
  const years = new Map();
  const bucket = (y) => {
    if (!years.has(y)) years.set(y, { year: y, counts: {}, events: [] });
    return years.get(y);
  };
  const add = (key, sql) => { for (const r of all(sql)) bucket(r.y).counts[key] = r.n; };
  add('recordings', 'SELECT eff_year y, COUNT(*) n FROM v_recordings WHERE eff_year IS NOT NULL GROUP BY eff_year');
  add('concerts', 'SELECT COALESCE(year,year_from) y, COUNT(*) n FROM concerts WHERE COALESCE(year,year_from) IS NOT NULL GROUP BY 1');
  add('sessions', 'SELECT COALESCE(year,year_from) y, COUNT(*) n FROM sessions WHERE COALESCE(year,year_from) IS NOT NULL GROUP BY 1');
  add('interviews', 'SELECT COALESCE(year,year_from) y, COUNT(*) n FROM interviews WHERE COALESCE(year,year_from) IS NOT NULL GROUP BY 1');
  add('movies', 'SELECT year y, COUNT(*) n FROM movies WHERE year IS NOT NULL GROUP BY year');
  add('photos', 'SELECT COALESCE(year,year_from) y, COUNT(*) n FROM photos WHERE COALESCE(year,year_from) IS NOT NULL GROUP BY 1');
  for (const e of all('SELECT id,year,date,title,kind,certainty FROM timeline_events ORDER BY year, date, id')) bucket(e.year).events.push(e);
  return { years: [...years.values()].sort((a, b) => a.year - b.year) };
}

function yearDetail(y) {
  const events = all('SELECT id,year,date,title,description,kind,certainty FROM timeline_events WHERE year=? ORDER BY date, id', y);
  for (const e of events) e.sources = getSources('timeline', e.id);
  const rec = new URLSearchParams({ year: y, limit: '100' });
  return {
    year: y, events,
    recordings: listRecordings(rec).rows,
    concerts: all('SELECT id,title,date,date_certainty,year,venue,city FROM concerts WHERE COALESCE(year,year_from)=? ORDER BY date', y),
    sessions: all('SELECT id,title,date,date_certainty,year,venue,city FROM sessions WHERE COALESCE(year,year_from)=? ORDER BY date', y),
    interviews: all('SELECT id,title,date,date_certainty,year,program FROM interviews WHERE COALESCE(year,year_from)=? ORDER BY date', y),
    movies: all('SELECT id,title,year FROM movies WHERE year=? ORDER BY title', y),
    photos: all('SELECT id,title,file,category,year FROM photos WHERE COALESCE(year,year_from)=? ORDER BY id LIMIT 60', y),
  };
}

// ---------- البحث الشامل ----------
function search(q) {
  const text = q.get('q') || '';
  const per = Math.min(num(q.get('per')) || 6, 30);
  const mk = (qs) => new URLSearchParams({ q: text, limit: String(per), ...qs });
  const songs = listSongs(mk({}));
  const out = {
    q: text,
    songs: songs,
    people: listPeople(mk({ limit: String(per) })),
    concerts: listCollection('concerts', mk({})),
    sessions: listCollection('sessions', mk({})),
    interviews: listCollection('interviews', mk({})),
    movies: listCollection('movies', mk({})),
    photos: listPhotos(mk({})),
  };
  return out;
}

// ---------- معلومات عامة ----------
function meta() {
  const settings = Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, r.value]));
  const cnt = (t) => get(`SELECT COUNT(*) n FROM ${t}`).n;
  const yr = get(`SELECT MIN(y) a, MAX(y) b FROM (
      SELECT eff_year y FROM v_recordings UNION ALL SELECT year FROM concerts UNION ALL SELECT year FROM photos
      UNION ALL SELECT year FROM movies UNION ALL SELECT year FROM timeline_events) WHERE y IS NOT NULL`);
  return {
    settings,
    mediaBase: cfg.MEDIA_BASE_URL,
    counts: {
      songs: cnt('songs'), recordings: cnt('recordings'), concerts: cnt('concerts'), sessions: cnt('sessions'),
      interviews: cnt('interviews'), movies: cnt('movies'), photos: cnt('photos'), people: cnt('people'), sources: cnt('sources'),
      rare: get('SELECT COUNT(*) n FROM recordings WHERE is_rare=1').n,
      withAudio: get("SELECT COUNT(*) n FROM recordings WHERE audio_file<>'' AND audio_file IS NOT NULL").n,
    },
    labels: LABELS,
    yearRange: [yr.a, yr.b],
  };
}

function listSources(q) {
  const t = termWhere(q.get('q'), ['search_text']);
  const where = t.where.length ? 'WHERE ' + t.where.join(' AND ') : '';
  const { limit, offset } = page(q, 50);
  return {
    total: get(`SELECT COUNT(*) n FROM sources ${where}`, ...t.args).n,
    rows: all(`SELECT id,title,type,author,publisher,pub_date,url FROM sources ${where} ORDER BY title LIMIT ? OFFSET ?`, ...t.args, limit, offset),
  };
}

function photoDetail(id) {
  const p = get('SELECT * FROM photos WHERE id=?', id);
  if (!p) throw fail('الصورة غير موجودة', 404);
  delete p.search_text; delete p.key_n;
  const people = all('SELECT pe.id, pe.name FROM photo_people pp JOIN people pe ON pe.id=pp.person_id WHERE pp.photo_id=?', id);
  return { photo: p, people, sources: getSources('photos', id) };
}

// جدول المسارات العامة
const routes = [
  ['/api/meta', () => meta()],
  ['/api/songs', (m, q) => listSongs(q)],
  [/^\/api\/songs\/(\d+)$/, (m) => songDetail(Number(m[1]))],
  ['/api/recordings', (m, q) => listRecordings(q)],
  ['/api/people', (m, q) => listPeople(q)],
  [/^\/api\/people\/(\d+)$/, (m) => personDetail(Number(m[1]))],
  ['/api/photos', (m, q) => listPhotos(q)],
  [/^\/api\/photos\/(\d+)$/, (m) => photoDetail(Number(m[1]))],
  ['/api/timeline', () => timeline()],
  [/^\/api\/year\/(\d{4})$/, (m) => yearDetail(Number(m[1]))],
  ['/api/search', (m, q) => search(q)],
  ['/api/sources', (m, q) => listSources(q)],
];
for (const name of Object.keys(COLLECTIONS)) {
  routes.push([`/api/${name}`, (m, q) => listCollection(name, q)]);
  routes.push([new RegExp(`^/api/${name}/(\\d+)$`), (m) => collectionDetail(name, Number(m[1]))]);
}

module.exports = { routes, listRecordings, listSongs, COLLECTIONS };
