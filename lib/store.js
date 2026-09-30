'use strict';
const { all, get, run, tx } = require('./db');
const { ENTITIES, LABELS, MEDIA_OWNERS } = require('./schema');
const { norm, yearOf, validDate, parseDuration } = require('./text');

const fail = (msg, status = 400) => Object.assign(new Error(msg), { status });
const titleCol = (name) => (name === 'people' ? 'name' : 'title');

// ---------- تنظيف القيم ----------
function coerce(name, data) {
  const E = ENTITIES[name];
  const out = {};
  for (const c of E.cols) {
    if (!(c in data)) continue;
    let v = data[c];
    if (v === '' || v === undefined) v = null;
    if (v !== null && E.ints.includes(c)) {
      if (typeof v === 'string' && v.includes(':')) v = parseDuration(v);
      else v = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
    } else if (c === 'videos' && Array.isArray(v)) {
      v = v.filter(Boolean).length ? JSON.stringify(v.filter(Boolean)) : null;
    } else if (typeof v === 'string') {
      v = v.trim() || null;
    }
    out[c] = v;
  }
  if (out.date) {
    if (!validDate(out.date)) throw fail('صيغة التاريخ غير صحيحة. استخدم 1965-03-21 أو 1965-03 أو 1965');
    out.year = yearOf(out.date);
  }
  for (const k of ['year', 'year_from', 'year_to']) {
    if (out[k] !== undefined && out[k] !== null && (out[k] < 1800 || out[k] > 2100)) throw fail('السنة غير منطقية: ' + out[k]);
  }
  return out;
}

// ---------- الفهرسة ----------
const peopleNames = (sql, ...p) => (get(sql, ...p) || {}).n || '';

function buildSearch(name, row) {
  const E = ENTITIES[name];
  const parts = E.text.filter((c) => c !== 'lyrics').map((c) => row[c]);
  if (row.year) parts.push(row.year);
  if (row.date) parts.push(row.date);
  if (row.year_from) parts.push(row.year_from, row.year_to);
  if (name === 'songs') {
    parts.push(LABELS.categories[row.category]);
    parts.push(peopleNames("SELECT group_concat(p.name,' ') n FROM song_people sp JOIN people p ON p.id=sp.person_id WHERE sp.song_id=?", row.id));
  }
  if (name === 'recordings') {
    parts.push(LABELS.recTypes[row.rec_type]);
    if (row.is_rare) parts.push('نادر نادرة');
    if (row.arranger_id) parts.push(peopleNames('SELECT name n FROM people WHERE id=?', row.arranger_id));
  }
  if (name === 'photos') {
    parts.push(LABELS.photoCats[row.category], LABELS.colors[row.color]);
    parts.push(peopleNames("SELECT group_concat(p.name,' ') n FROM photo_people pp JOIN people p ON p.id=pp.person_id WHERE pp.photo_id=?", row.id));
  }
  if (name === 'movies' && row.director_id) parts.push(peopleNames('SELECT name n FROM people WHERE id=?', row.director_id));
  if (name === 'people') parts.push((row.roles || '').split(',').map((r) => LABELS.roles[r]).join(' '));
  if (name === 'timeline') parts.push(LABELS.timelineKinds[row.kind]);
  return norm(parts.filter((x) => x !== null && x !== undefined && x !== '').join(' '));
}

function reindex(name, id) {
  const E = ENTITIES[name];
  const row = get(`SELECT * FROM ${E.table} WHERE id=?`, id);
  if (!row) return;
  const st = buildSearch(name, row);
  if (name === 'songs') run('UPDATE songs SET search_text=?, key_n=?, lyrics_n=? WHERE id=?', st, norm(row.title), norm(row.lyrics), id);
  else if (E.table !== 'photos' && E.table !== 'recordings' && E.table !== 'timeline_events') run(`UPDATE ${E.table} SET search_text=?, key_n=? WHERE id=?`, st, norm(row[titleCol(name)]), id);
  else run(`UPDATE ${E.table} SET search_text=? WHERE id=?`, st, id);
}

function reindexAll(name) {
  tx(() => {
    for (const r of all(`SELECT id FROM ${ENTITIES[name].table}`)) reindex(name, r.id);
  });
}

// عند تعديل اسم شخص تُحدَّث الفهارس المرتبطة به
function reindexPersonDeps(pid) {
  for (const r of all('SELECT DISTINCT song_id id FROM song_people WHERE person_id=?', pid)) reindex('songs', r.id);
  for (const r of all('SELECT id FROM recordings WHERE arranger_id=?', pid)) reindex('recordings', r.id);
  for (const r of all('SELECT id FROM movies WHERE director_id=?', pid)) reindex('movies', r.id);
  for (const r of all('SELECT photo_id id FROM photo_people WHERE person_id=?', pid)) reindex('photos', r.id);
}

// ---------- الحفظ ----------
function save(name, data, id = null, opts = {}) {
  const E = ENTITIES[name];
  if (!E) throw fail('كيان غير معروف');
  return tx(() => {
    const vals = coerce(name, data);
    if (opts.demo) vals.is_demo = 1;
    if (id === null) {
      if (vals[E.req] === undefined || vals[E.req] === null) throw fail('حقل مطلوب ناقص: ' + E.req);
      if (E.cols.includes('date_certainty') && !vals.date_certainty) vals.date_certainty = vals.date || vals.year ? 'confirmed' : 'unknown';
      const keys = Object.keys(vals);
      const r = run(`INSERT INTO ${E.table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`, ...keys.map((k) => vals[k]));
      id = r.id;
    } else {
      if (!get(`SELECT id FROM ${E.table} WHERE id=?`, id)) throw fail('العنصر غير موجود', 404);
      if (E.req in vals && vals[E.req] === null) throw fail('حقل مطلوب ناقص: ' + E.req);
      const keys = Object.keys(vals);
      if (keys.length) run(`UPDATE ${E.table} SET ${keys.map((k) => k + '=?').join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`, ...keys.map((k) => vals[k]), id);
    }
    reindex(name, id);
    if (name === 'people' && opts.update !== false) reindexPersonDeps(id);
    return id;
  });
}

function remove(name, id) {
  const E = ENTITIES[name];
  return tx(() => {
    run('DELETE FROM source_links WHERE entity_type=? AND entity_id=?', name, id);
    if (MEDIA_OWNERS.includes(name)) run('DELETE FROM media WHERE owner_type=? AND owner_id=?', name, id);
    if (name === 'songs') for (const r of all('SELECT id FROM recordings WHERE song_id=?', id)) run("DELETE FROM source_links WHERE entity_type='recordings' AND entity_id=?", r.id);
    return run(`DELETE FROM ${E.table} WHERE id=?`, id).changes;
  });
}

// ---------- الإشارات إلى كيانات أخرى (بالرقم أو بالاسم مع إنشاء تلقائي) ----------
function findByKey(name, text, date) {
  const E = ENTITIES[name];
  const k = norm(text);
  if (!k) return null;
  let rows = all(`SELECT id${E.cols.includes('date') ? ', date' : ''} FROM ${E.table} WHERE key_n=? ORDER BY id`, k);
  if (date && rows.length && rows[0].date !== undefined) rows = rows.filter((r) => !r.date || r.date === date);
  return rows[0] ? rows[0].id : null;
}

function resolveRef(name, ref, extra = {}) {
  if (ref === null || ref === undefined || ref === '') return null;
  if (typeof ref === 'number') return ref;
  if (typeof ref === 'string') ref = /^\d+$/.test(ref) ? { id: Number(ref) } : { title: ref, name: ref };
  if (ref.id) return Number(ref.id);
  const text = ref.title || ref.name || ref.new;
  if (!text || !String(text).trim()) return null;
  const found = findByKey(name, text, extra.date);
  if (found) return found;
  const col = titleCol(name);
  const data = { [col]: String(text).trim(), ...extra.defaults };
  if (extra.date) data.date = extra.date;
  return save(name, data, null, { demo: false });
}

function addPersonRole(pid, role) {
  const p = get('SELECT roles FROM people WHERE id=?', pid);
  if (!p) return;
  const roles = (p.roles || '').split(',').filter(Boolean);
  if (!roles.includes(role)) {
    roles.push(role);
    run('UPDATE people SET roles=? WHERE id=?', roles.join(','), pid);
    reindex('people', pid);
  }
}

function personRef(ref, role) {
  const id = resolveRef('people', ref, { defaults: { roles: role } });
  if (id && role) addPersonRole(id, role);
  return id;
}

// mode: replace = يستبدل القائمة، merge = يضيف الناقص فقط
function setSongPeople(songId, groups, mode = 'replace') {
  tx(() => {
    for (const role of ['composer', 'lyricist']) {
      if (!groups || !(role in groups)) continue;
      const ids = [...new Set((groups[role] || []).map((r) => personRef(r, role)).filter(Boolean))];
      if (mode === 'replace') run('DELETE FROM song_people WHERE song_id=? AND role=?', songId, role);
      for (const pid of ids) run('INSERT OR IGNORE INTO song_people(song_id,person_id,role) VALUES(?,?,?)', songId, pid, role);
    }
    reindex('songs', songId);
  });
}

function setPhotoPeople(photoId, refs) {
  tx(() => {
    run('DELETE FROM photo_people WHERE photo_id=?', photoId);
    for (const r of refs || []) {
      const pid = personRef(r, null);
      if (pid) run('INSERT OR IGNORE INTO photo_people(photo_id,person_id) VALUES(?,?)', photoId, pid);
    }
    reindex('photos', photoId);
  });
}

// ---------- المصادر ودرجة التأكد ----------
function setSources(name, id, list) {
  tx(() => {
    run('DELETE FROM source_links WHERE entity_type=? AND entity_id=?', name, id);
    for (const l of list || []) {
      let sid = l.source_id ? Number(l.source_id) : null;
      if (!sid && l.source_title) {
        sid = findByKey('sources', l.source_title);
        if (!sid) sid = save('sources', { title: l.source_title, url: l.source_url || null, type: l.source_type || 'other' });
      }
      if (!sid) continue;
      run('INSERT INTO source_links(entity_type,entity_id,source_id,field,certainty,note) VALUES(?,?,?,?,?,?)',
        name, id, sid, l.field || null, LABELS.certainty[l.certainty] ? l.certainty : 'unknown', l.note || null);
    }
  });
}

function getSources(name, id) {
  return all(`SELECT l.id, l.field, l.certainty, l.note, s.id source_id, s.title, s.type, s.author, s.url
              FROM source_links l JOIN sources s ON s.id=l.source_id
              WHERE l.entity_type=? AND l.entity_id=? ORDER BY l.id`, name, id);
}

// ---------- وسائط مرفقة (صوت/فيديو للحفلات والمقابلات...) ----------
function setMedia(name, id, list) {
  tx(() => {
    run('DELETE FROM media WHERE owner_type=? AND owner_id=?', name, id);
    (list || []).forEach((m, i) => {
      if (!m.file && !m.url) return;
      run('INSERT INTO media(owner_type,owner_id,kind,file,url,title,duration_sec,notes,sort_order) VALUES(?,?,?,?,?,?,?,?,?)',
        name, id, m.kind === 'video' ? 'video' : 'audio', m.file || null, m.url || null, m.title || null,
        parseDuration(m.duration_sec), m.notes || null, i);
    });
  });
}

const getMedia = (name, id) => all('SELECT * FROM media WHERE owner_type=? AND owner_id=? ORDER BY sort_order,id', name, id);

module.exports = {
  fail, save, remove, reindex, reindexAll, coerce, resolveRef, personRef, findByKey,
  setSongPeople, setPhotoPeople, setSources, getSources, setMedia, getMedia, addPersonRole,
};
