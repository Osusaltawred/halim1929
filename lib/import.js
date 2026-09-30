'use strict';
const { db, get, tx } = require('./db');
const { LABELS } = require('./schema');
const { norm, parseDuration } = require('./text');
const { parseCSV, toCSV } = require('./csv');
const S = require('./store');

// [المفتاح، العنوان العربي في القالب] — يقبل الاستيراد أيًا منهما
const COLS = {
  recordings: [
    ['song_title', 'اسم الأغنية'], ['version_title', 'اسم النسخة'], ['category', 'تصنيف الأغنية'],
    ['composer', 'الملحن'], ['lyricist', 'الشاعر'], ['arranger', 'الموزع'],
    ['rec_type', 'نوع التسجيل'], ['is_rare', 'نادر'],
    ['date', 'التاريخ'], ['year', 'السنة'], ['year_from', 'من سنة'], ['year_to', 'إلى سنة'],
    ['certainty', 'درجة التأكد'], ['venue', 'مكان التسجيل'], ['city', 'المدينة'], ['duration', 'المدة'],
    ['audio_file', 'ملف الصوت'], ['image', 'الصورة'],
    ['concert', 'الحفلة'], ['concert_date', 'تاريخ الحفلة'], ['session', 'الجلسة'], ['session_date', 'تاريخ الجلسة'],
    ['interview', 'المقابلة'], ['movie', 'الفيلم'], ['description', 'ملاحظات'], ['source', 'المصدر'],
  ],
  concerts: [
    ['title', 'اسم الحفلة'], ['date', 'التاريخ'], ['year', 'السنة'], ['certainty', 'درجة التأكد'],
    ['venue', 'المكان'], ['city', 'المدينة'], ['country', 'الدولة'], ['occasion', 'المناسبة'],
    ['description', 'معلومات'], ['image', 'الصورة'], ['videos', 'روابط الفيديو'], ['source', 'المصدر'],
  ],
  sessions: [
    ['title', 'اسم الجلسة'], ['date', 'التاريخ'], ['year', 'السنة'], ['certainty', 'درجة التأكد'],
    ['venue', 'المكان'], ['city', 'المدينة'], ['attendees', 'الحاضرون'], ['description', 'ملاحظات'],
    ['image', 'الصورة'], ['videos', 'روابط الفيديو'], ['source', 'المصدر'],
  ],
  interviews: [
    ['title', 'عنوان المقابلة'], ['date', 'التاريخ'], ['year', 'السنة'], ['certainty', 'درجة التأكد'],
    ['program', 'البرنامج أو الجهة'], ['host', 'المذيع'], ['venue', 'المكان'], ['city', 'المدينة'],
    ['duration', 'المدة'], ['description', 'الوصف'], ['image', 'الصورة'],
    ['audio_file', 'ملف الصوت'], ['video_url', 'رابط الفيديو'], ['source', 'المصدر'],
  ],
  movies: [
    ['title', 'اسم الفيلم'], ['title_en', 'الاسم بالإنجليزية'], ['year', 'سنة الإنتاج'], ['director', 'المخرج'],
    ['cast_text', 'الأبطال'], ['story', 'القصة'], ['description', 'معلومات'], ['image', 'الصورة'], ['source', 'المصدر'],
  ],
  people: [
    ['name', 'الاسم'], ['name_en', 'الاسم بالإنجليزية'], ['roles', 'الأدوار'], ['bio', 'نبذة'],
    ['birth_year', 'سنة الميلاد'], ['death_year', 'سنة الوفاة'], ['photo', 'الصورة'],
  ],
  photos: [
    ['file', 'ملف الصورة'], ['title', 'العنوان'], ['category', 'التصنيف'], ['color', 'اللون'],
    ['date', 'التاريخ'], ['year', 'السنة'], ['certainty', 'درجة التأكد'], ['place', 'المكان'],
    ['people', 'الأشخاص'], ['description', 'الوصف'], ['concert', 'الحفلة'], ['session', 'الجلسة'],
    ['movie', 'الفيلم'], ['source', 'المصدر'],
  ],
  sources: [
    ['title', 'العنوان'], ['type', 'النوع'], ['author', 'المؤلف'], ['publisher', 'الناشر'],
    ['pub_date', 'تاريخ النشر'], ['url', 'الرابط'], ['notes', 'ملاحظات'],
  ],
  timeline: [
    ['year', 'السنة'], ['date', 'التاريخ'], ['title', 'العنوان'], ['description', 'الوصف'],
    ['kind', 'النوع'], ['certainty', 'درجة التأكد'], ['source', 'المصدر'],
  ],
};

const TYPE_NAMES = {
  recordings: 'الأغاني والتسجيلات', concerts: 'الحفلات', sessions: 'الجلسات', interviews: 'المقابلات',
  movies: 'الأفلام', people: 'الأشخاص', photos: 'الصور', sources: 'المصادر', timeline: 'الأحداث الزمنية',
};

const split = (v) => String(v || '').split(/[;؛|]/).map((x) => x.trim()).filter(Boolean);
const bool = (v) => ['1', 'true', 'yes', 'نعم', 'x', 'نادر'].includes(norm(v));

function enumKey(map, v, what) {
  if (v === undefined || v === null || String(v).trim() === '') return undefined;
  const s = String(v).trim();
  if (map[s]) return s;
  const hit = Object.entries(map).find(([, label]) => norm(label) === norm(s));
  if (!hit) throw S.fail(`قيمة غير مفهومة في "${what}": ${s} (المسموح: ${Object.values(map).join('، ')})`);
  return hit[0];
}

function normalizeRow(type, raw) {
  const alias = new Map();
  for (const [k, label] of COLS[type]) { alias.set(norm(k), k); alias.set(norm(label), k); }
  const out = {};
  for (const [h, v] of Object.entries(raw)) {
    const k = alias.get(norm(h));
    if (k && v !== undefined && v !== null && String(v).trim() !== '') out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

const src = (type, id, r, field) => {
  if (!r.source) return;
  const list = split(r.source).map((s) => {
    const [title, url] = s.split(/\s*@\s*/);
    return { source_title: title, source_url: url || null, field: field || null, certainty: r.certainty ? enumKey(LABELS.certainty, r.certainty, 'درجة التأكد') : 'unknown' };
  });
  S.setSources(type, id, list);
};

const exists = (sql, ...p) => !!get(sql, ...p);

const HANDLERS = {
  recordings(r) {
    if (!r.song_title) throw S.fail('اسم الأغنية مطلوب');
    const cat = enumKey(LABELS.categories, r.category, 'تصنيف الأغنية');
    const songId = S.resolveRef('songs', { title: r.song_title }, { defaults: { category: cat || 'other' } });
    if (cat) S.save('songs', { category: cat }, songId);
    S.setSongPeople(songId, { composer: split(r.composer), lyricist: split(r.lyricist) }, 'merge');
    const concert = r.concert ? S.resolveRef('concerts', { title: r.concert }, { date: r.concert_date, defaults: { city: r.city } }) : null;
    const session = r.session ? S.resolveRef('sessions', { title: r.session }, { date: r.session_date }) : null;
    const interview = r.interview ? S.resolveRef('interviews', { title: r.interview }) : null;
    const movie = r.movie ? S.resolveRef('movies', { title: r.movie }) : null;
    const arranger = r.arranger ? S.personRef({ name: r.arranger }, 'arranger') : null;
    const data = {
      song_id: songId, version_title: r.version_title, rec_type: enumKey(LABELS.recTypes, r.rec_type, 'نوع التسجيل') || 'studio',
      is_rare: bool(r.is_rare) ? 1 : 0, date: r.date, year: r.year, year_from: r.year_from, year_to: r.year_to,
      date_certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد'), venue: r.venue, city: r.city,
      duration_sec: parseDuration(r.duration), audio_file: r.audio_file, image: r.image,
      concert_id: concert, session_id: session, interview_id: interview, movie_id: movie, arranger_id: arranger,
      description: r.description,
    };
    const dup = get(`SELECT id FROM recordings WHERE song_id=? AND COALESCE(audio_file,'')=? AND COALESCE(version_title,'')=?
                     AND COALESCE(concert_id,0)=? AND COALESCE(date,'')=? AND COALESCE(year,0)=? AND rec_type=?`,
      songId, r.audio_file || '', r.version_title || '', concert || 0, r.date || '', Number(r.year) || 0, data.rec_type);
    if (dup) return 'skipped';
    const id = S.save('recordings', data);
    src('recordings', id, r);
    return 'created';
  },
  concerts(r) {
    if (!r.title) throw S.fail('اسم الحفلة مطلوب');
    if (S.findByKey('concerts', r.title, r.date)) return 'skipped';
    const id = S.save('concerts', {
      title: r.title, date: r.date, year: r.year, date_certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد'),
      venue: r.venue, city: r.city, country: r.country, occasion: r.occasion, description: r.description,
      image: r.image, videos: split(r.videos),
    });
    src('concerts', id, r);
    return 'created';
  },
  sessions(r) {
    if (!r.title) throw S.fail('اسم الجلسة مطلوب');
    if (S.findByKey('sessions', r.title, r.date)) return 'skipped';
    const id = S.save('sessions', {
      title: r.title, date: r.date, year: r.year, date_certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد'),
      venue: r.venue, city: r.city, attendees: r.attendees, description: r.description, image: r.image, videos: split(r.videos),
    });
    src('sessions', id, r);
    return 'created';
  },
  interviews(r) {
    if (!r.title) throw S.fail('عنوان المقابلة مطلوب');
    if (S.findByKey('interviews', r.title, r.date)) return 'skipped';
    const id = S.save('interviews', {
      title: r.title, date: r.date, year: r.year, date_certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد'),
      program: r.program, host: r.host, venue: r.venue, city: r.city, duration_sec: parseDuration(r.duration),
      description: r.description, image: r.image,
    });
    const media = [];
    if (r.audio_file) media.push({ kind: 'audio', file: r.audio_file, title: r.title, duration_sec: r.duration });
    if (r.video_url) media.push({ kind: 'video', url: r.video_url, title: r.title });
    if (media.length) S.setMedia('interviews', id, media);
    src('interviews', id, r);
    return 'created';
  },
  movies(r) {
    if (!r.title) throw S.fail('اسم الفيلم مطلوب');
    if (exists('SELECT 1 FROM movies WHERE key_n=? AND COALESCE(year,0)=?', norm(r.title), Number(r.year) || 0)) return 'skipped';
    const id = S.save('movies', {
      title: r.title, title_en: r.title_en, year: r.year, cast_text: r.cast_text, story: r.story,
      description: r.description, image: r.image, director_id: r.director ? S.personRef({ name: r.director }, 'director') : null,
    });
    src('movies', id, r);
    return 'created';
  },
  people(r) {
    if (!r.name) throw S.fail('الاسم مطلوب');
    const roles = split(r.roles).map((x) => enumKey(LABELS.roles, x, 'الأدوار')).join(',');
    const found = S.findByKey('people', r.name);
    if (found) {
      // إن كان الشخص موجودًا نُكمل الحقول الفارغة فقط ولا نستبدل شيئًا
      const cur = get('SELECT * FROM people WHERE id=?', found);
      const patch = {};
      for (const k of ['name_en', 'bio', 'birth_year', 'death_year', 'photo']) if (!cur[k] && r[k]) patch[k] = r[k];
      if (Object.keys(patch).length) S.save('people', patch, found);
      for (const x of roles.split(',').filter(Boolean)) S.addPersonRole(found, x);
      return Object.keys(patch).length ? 'created' : 'skipped';
    }
    S.save('people', { name: r.name, name_en: r.name_en, roles, bio: r.bio, birth_year: r.birth_year, death_year: r.death_year, photo: r.photo });
    return 'created';
  },
  photos(r) {
    if (!r.file) throw S.fail('اسم ملف الصورة مطلوب');
    if (exists('SELECT 1 FROM photos WHERE file=?', r.file)) return 'skipped';
    const id = S.save('photos', {
      file: r.file, title: r.title, category: enumKey(LABELS.photoCats, r.category, 'التصنيف') || 'other',
      color: enumKey(LABELS.colors, r.color, 'اللون'), date: r.date, year: r.year,
      date_certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد'), place: r.place, description: r.description,
      concert_id: r.concert ? S.resolveRef('concerts', { title: r.concert }) : null,
      session_id: r.session ? S.resolveRef('sessions', { title: r.session }) : null,
      movie_id: r.movie ? S.resolveRef('movies', { title: r.movie }) : null,
    });
    if (r.people) S.setPhotoPeople(id, split(r.people).map((n) => ({ name: n })));
    src('photos', id, r);
    return 'created';
  },
  sources(r) {
    if (!r.title) throw S.fail('عنوان المصدر مطلوب');
    if (S.findByKey('sources', r.title)) return 'skipped';
    S.save('sources', { title: r.title, type: enumKey(LABELS.sourceTypes, r.type, 'النوع') || 'other', author: r.author, publisher: r.publisher, pub_date: r.pub_date, url: r.url, notes: r.notes });
    return 'created';
  },
  timeline(r) {
    if (!r.title) throw S.fail('العنوان مطلوب');
    const year = r.year || (r.date ? String(r.date).slice(0, 4) : null);
    if (!year) throw S.fail('السنة مطلوبة');
    if (exists('SELECT 1 FROM timeline_events WHERE key_n=? AND year=?', norm(r.title), Number(year))) return 'skipped';
    const id = S.save('timeline', { year, date: r.date, title: r.title, description: r.description, kind: enumKey(LABELS.timelineKinds, r.kind, 'النوع') || 'milestone', certainty: enumKey(LABELS.certainty, r.certainty, 'درجة التأكد') || 'unknown' });
    src('timeline', id, r);
    return 'created';
  },
};

function parseBody(text, contentType) {
  const t = String(text || '').trim();
  if (!t) return {};
  if (/json/i.test(contentType || '') || t.startsWith('[') || t.startsWith('{')) {
    const j = JSON.parse(t);
    return Array.isArray(j) ? { rows: j } : j;
  }
  return { rows: parseCSV(t) };
}

function runOne(type, rows, dry) {
  if (!HANDLERS[type]) throw S.fail('نوع استيراد غير معروف: ' + type);
  const report = { type, name: TYPE_NAMES[type], total: rows.length, created: 0, skipped: 0, errors: [] };
  const ROLLBACK = new Error('rollback');
  try {
    tx(() => {
      rows.forEach((raw, i) => {
        db.exec('SAVEPOINT imp_row');
        try {
          const res = HANDLERS[type](normalizeRow(type, raw));
          report[res === 'skipped' ? 'skipped' : 'created']++;
          db.exec('RELEASE imp_row');
        } catch (e) {
          db.exec('ROLLBACK TO imp_row; RELEASE imp_row');
          if (report.errors.length < 200) report.errors.push({ row: i + 2, message: e.message });
        }
      });
      if (dry) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return report;
}

// يقبل: CSV لنوع واحد، أو JSON كمصفوفة، أو JSON بمفاتيح متعددة {songs:[],concerts:[]...}
function importData(type, text, contentType, dry) {
  const parsed = parseBody(text, contentType);
  const order = ['people', 'sources', 'concerts', 'sessions', 'interviews', 'movies', 'recordings', 'photos', 'timeline'];
  const reports = [];
  if (parsed.rows) {
    reports.push(runOne(type, parsed.rows, dry));
  } else {
    for (const t of order) {
      const rows = parsed[t] || (t === 'recordings' ? parsed.songs : null);
      if (Array.isArray(rows)) reports.push(runOne(t, rows, dry));
    }
    if (!reports.length) throw S.fail('لم أجد بيانات. استخدم مصفوفة JSON أو ملف CSV.');
  }
  return { dry: !!dry, reports };
}

function template(type) {
  if (!COLS[type]) throw S.fail('نوع غير معروف', 404);
  return toCSV(COLS[type].map((c) => c[1]), []);
}

module.exports = { importData, template, TYPE_NAMES, COLS };
