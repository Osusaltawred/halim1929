'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

const db = new DatabaseSync(path.join(cfg.DATA_DIR, 'archive.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');

const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
const all = (sql, ...p) => db.prepare(sql).all(...clean(p));
const get = (sql, ...p) => db.prepare(sql).get(...clean(p));
const run = (sql, ...p) => {
  const r = db.prepare(sql).run(...clean(p));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

// حقول التاريخ المشتركة
const DATEF = `
  date TEXT, date_certainty TEXT DEFAULT 'unknown',
  year INTEGER, year_from INTEGER, year_to INTEGER`;
const COMMON = `
  is_demo INTEGER DEFAULT 0,
  key_n TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT`;

// كل ترحيل يُنفَّذ مرة واحدة فقط. لتعديل البنية مستقبلًا أضف عنصرًا جديدًا ولا تعدّل القديم.
const MIGRATIONS = [
  () => db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_en TEXT, roles TEXT DEFAULT '',
      bio TEXT, birth_year INTEGER, death_year INTEGER, photo TEXT,
      certainty TEXT DEFAULT 'unknown', ${COMMON});

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, category TEXT DEFAULT 'other',
      year INTEGER, description TEXT, lyrics TEXT, lyrics_n TEXT DEFAULT '', image TEXT,
      certainty TEXT DEFAULT 'unknown', ${COMMON});

    CREATE TABLE IF NOT EXISTS song_people (
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      PRIMARY KEY (song_id, person_id, role));

    CREATE TABLE IF NOT EXISTS concerts (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, ${DATEF},
      venue TEXT, city TEXT, country TEXT, occasion TEXT, description TEXT, image TEXT,
      videos TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, ${DATEF},
      venue TEXT, city TEXT, attendees TEXT, description TEXT, image TEXT,
      videos TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS interviews (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, ${DATEF},
      program TEXT, host TEXT, venue TEXT, city TEXT, duration_sec INTEGER,
      description TEXT, image TEXT, videos TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, year INTEGER,
      director_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
      cast_text TEXT, story TEXT, description TEXT, image TEXT, videos TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY,
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      version_title TEXT, rec_type TEXT DEFAULT 'studio', is_rare INTEGER DEFAULT 0,
      ${DATEF},
      venue TEXT, city TEXT, duration_sec INTEGER,
      audio_file TEXT, audio_name TEXT, image TEXT,
      concert_id INTEGER REFERENCES concerts(id) ON DELETE SET NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      interview_id INTEGER REFERENCES interviews(id) ON DELETE SET NULL,
      movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
      arranger_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
      description TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL,
      kind TEXT NOT NULL, file TEXT, url TEXT, title TEXT, duration_sec INTEGER,
      notes TEXT, sort_order INTEGER DEFAULT 0);

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY, title TEXT, file TEXT NOT NULL,
      category TEXT DEFAULT 'other', color TEXT, ${DATEF},
      place TEXT, people_text TEXT, description TEXT,
      concert_id INTEGER REFERENCES concerts(id) ON DELETE SET NULL,
      session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
      movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL,
      interview_id INTEGER REFERENCES interviews(id) ON DELETE SET NULL,
      ${COMMON});

    CREATE TABLE IF NOT EXISTS photo_people (
      photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      PRIMARY KEY (photo_id, person_id));

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, type TEXT DEFAULT 'other',
      author TEXT, publisher TEXT, pub_date TEXT, url TEXT, notes TEXT, ${COMMON});

    CREATE TABLE IF NOT EXISTS source_links (
      id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      field TEXT, certainty TEXT DEFAULT 'unknown', note TEXT);

    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY, year INTEGER NOT NULL, date TEXT, title TEXT NOT NULL,
      description TEXT, kind TEXT DEFAULT 'milestone', ref_type TEXT, ref_id INTEGER,
      certainty TEXT DEFAULT 'unknown', ${COMMON});

    CREATE INDEX IF NOT EXISTS ix_people_key ON people(key_n);
    CREATE INDEX IF NOT EXISTS ix_songs_key ON songs(key_n);
    CREATE INDEX IF NOT EXISTS ix_concerts_key ON concerts(key_n);
    CREATE INDEX IF NOT EXISTS ix_sessions_key ON sessions(key_n);
    CREATE INDEX IF NOT EXISTS ix_interviews_key ON interviews(key_n);
    CREATE INDEX IF NOT EXISTS ix_movies_key ON movies(key_n);
    CREATE INDEX IF NOT EXISTS ix_sources_key ON sources(key_n);
    CREATE INDEX IF NOT EXISTS ix_songs_year ON songs(year);
    CREATE INDEX IF NOT EXISTS ix_songs_cat ON songs(category);
    CREATE INDEX IF NOT EXISTS ix_sp_person ON song_people(person_id, role);
    CREATE INDEX IF NOT EXISTS ix_rec_song ON recordings(song_id);
    CREATE INDEX IF NOT EXISTS ix_rec_year ON recordings(year);
    CREATE INDEX IF NOT EXISTS ix_rec_type ON recordings(rec_type);
    CREATE INDEX IF NOT EXISTS ix_rec_rare ON recordings(is_rare);
    CREATE INDEX IF NOT EXISTS ix_rec_concert ON recordings(concert_id);
    CREATE INDEX IF NOT EXISTS ix_rec_session ON recordings(session_id);
    CREATE INDEX IF NOT EXISTS ix_rec_interview ON recordings(interview_id);
    CREATE INDEX IF NOT EXISTS ix_rec_movie ON recordings(movie_id);
    CREATE INDEX IF NOT EXISTS ix_concert_year ON concerts(year);
    CREATE INDEX IF NOT EXISTS ix_session_year ON sessions(year);
    CREATE INDEX IF NOT EXISTS ix_interview_year ON interviews(year);
    CREATE INDEX IF NOT EXISTS ix_movie_year ON movies(year);
    CREATE INDEX IF NOT EXISTS ix_photo_year ON photos(year);
    CREATE INDEX IF NOT EXISTS ix_photo_cat ON photos(category);
    CREATE INDEX IF NOT EXISTS ix_media_owner ON media(owner_type, owner_id);
    CREATE INDEX IF NOT EXISTS ix_links_entity ON source_links(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS ix_timeline_year ON timeline_events(year);
  `),
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = get("SELECT value FROM meta WHERE key='schema_version'");
  let v = row ? Number(row.value) : 0;
  while (v < MIGRATIONS.length) {
    tx(() => {
      MIGRATIONS[v]();
      v++;
      run("INSERT INTO meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(v));
    });
  }
  // العرض يُعاد إنشاؤه في كل تشغيل، فلا يحتاج ترحيلًا
  db.exec(`
    DROP VIEW IF EXISTS v_recordings;
    CREATE VIEW v_recordings AS
    SELECT r.id, r.song_id, r.version_title, r.rec_type, r.is_rare, r.date, r.date_certainty,
           r.year, r.year_from, r.year_to, r.venue, r.city, r.duration_sec, r.audio_file, r.image,
           r.concert_id, r.session_id, r.interview_id, r.movie_id, r.arranger_id, r.description,
           r.is_demo, r.created_at,
           s.title AS song_title, s.category AS song_category, s.image AS song_image, s.lyrics_n AS lyrics_n,
           c.title AS concert_title, se.title AS session_title,
           i.title AS interview_title, m.title AS movie_title,
           COALESCE(r.year, r.year_from, c.year, se.year, i.year, m.year, s.year) AS eff_year,
           COALESCE(r.date, c.date, se.date, i.date) AS eff_date,
           (r.search_text || ' ' || s.search_text || ' ' || COALESCE(c.search_text,'') || ' ' ||
            COALESCE(se.search_text,'') || ' ' || COALESCE(i.search_text,'') || ' ' ||
            COALESCE(m.search_text,'')) AS hay
    FROM recordings r
    JOIN songs s ON s.id = r.song_id
    LEFT JOIN concerts c ON c.id = r.concert_id
    LEFT JOIN sessions se ON se.id = r.session_id
    LEFT JOIN interviews i ON i.id = r.interview_id
    LEFT JOIN movies m ON m.id = r.movie_id;
  `);
}

migrate();

module.exports = { db, all, get, run, tx };
