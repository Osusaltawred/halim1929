'use strict';
const fs = require('fs');
const cfg = require('./config');
const { get, run, tx } = require('./db');
const S = require('./store');

// يعمل مرة واحدة فقط: عند أول تشغيل على قاعدة بيانات فارغة.
// بعد ذلك لا يلمس بياناتك أبدًا، حتى لو أعدت النشر.
function seed() {
  if (get("SELECT value FROM meta WHERE key='seeded'")) return false;
  if (!fs.existsSync(cfg.SEED_FILE)) return false;
  const data = JSON.parse(fs.readFileSync(cfg.SEED_FILE, 'utf8'));
  tx(() => {
    for (const [k, v] of Object.entries(data.settings || {})) {
      run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', k, v);
    }
    for (const p of data.people || []) S.save('people', p);
    for (const t of data.timeline || []) S.save('timeline', t);
    for (const s of data.sources || []) S.save('sources', s, null, { demo: true });
    for (const s of data.songs || []) {
      const id = S.save('songs', { title: s.title, category: s.category, description: s.description }, null, { demo: true });
      S.setSongPeople(id, {
        composer: (s.composers || []).map((name) => ({ name })),
        lyricist: (s.lyricists || []).map((name) => ({ name })),
      });
      for (const r of s.recordings || []) S.save('recordings', { ...r, song_id: id }, null, { demo: true });
      S.reindex('songs', id);
    }
    run("INSERT INTO meta(key,value) VALUES('seeded','1')");
  });
  return true;
}

module.exports = { seed };
