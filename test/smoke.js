'use strict';
// اختبار شامل يشغّل خادمًا على بيانات مؤقتة ويتحقق من الوظائف الأساسية
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'halim-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
let cookie = '';
let pass = 0;
const ok = (c, m) => { if (!c) { console.error('✗ فشل:', m); process.exitCode = 1; } else { pass++; console.log('✓', m); } };

const req = async (m, p, body, h = {}) => {
  const r = await fetch(base + p, { method: m, headers: { cookie, 'X-Requested-With': 'halim', ...(body && typeof body === 'object' && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...h }, body: body && typeof body === 'object' && !(body instanceof Uint8Array) ? JSON.stringify(body) : body });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, j, r };
};

(async () => {
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'test-pass-123' }, cwd: path.join(__dirname, '..') });
  await new Promise((r) => setTimeout(r, 1500));
  try {
    let r = await req('GET', '/api/meta');
    ok(r.s === 200 && r.j.counts.people === 7, 'البيانات الأولية محمّلة');
    r = await req('POST', '/api/admin/e/songs', { title: 'x' });
    ok(r.s === 401, 'الإدارة تتطلب تسجيل الدخول');
    r = await req('POST', '/api/admin/login', { password: 'bad' });
    ok(r.s === 401, 'رفض كلمة مرور خاطئة');
    r = await req('POST', '/api/admin/login', { password: 'test-pass-123' });
    cookie = r.r.headers.get('set-cookie').split(';')[0];
    ok(r.s === 200 && cookie, 'تسجيل الدخول');

    // رفع ملف صوتي وهمي
    const mp3 = new Uint8Array(5000).fill(7);
    r = await req('POST', '/api/admin/upload?kind=audio&name=' + encodeURIComponent('test song.mp3'), mp3);
    ok(r.s === 200 && r.j.file.endsWith('.mp3'), 'رفع MP3');
    const file = r.j.file;
    r = await req('POST', '/api/admin/upload?kind=audio&name=evil.exe', mp3);
    ok(r.s === 400, 'رفض صيغة غير مسموحة');
    const rg = await fetch(`${base}/media/audio/${file}`, { headers: { Range: 'bytes=100-199' } });
    ok(rg.status === 206 && (await rg.arrayBuffer()).byteLength === 100, 'بث الصوت مع Range');
    const tr = await fetch(`${base}/media/audio/..%2f..%2farchive.db`);
    ok(tr.status === 404, 'منع اجتياز المسارات');

    // إضافة تسجيل مع أغنية جديدة وأشخاص جدد ومصدر
    r = await req('POST', '/api/admin/e/recordings', {
      _song: { title: 'أغنية تجريبية' }, song_category: 'romantic', _composers: [{ name: 'ملحن جديد' }], _lyricists: [{ id: 5 }],
      rec_type: 'live', is_rare: 1, date: '1965-03-21', date_certainty: 'probable', audio_file: file, duration_sec: '3:45',
      _refs: { concert_id: { title: 'حفلة اختبار' } },
      _sources: [{ source_title: 'كتاب اختبار', certainty: 'probable', field: 'date' }],
    });
    ok(r.s === 200 && r.j.id, 'إنشاء تسجيل (أغنية+ملحن+حفلة+مصدر تلقائيًا)');
    let d = (await req('GET', '/api/songs')).j;
    const song = d.rows.find((x) => x.title === 'أغنية تجريبية');
    ok(song && song.composers === 'ملحن جديد' && song.year === 1965 && song.play_file === file, 'الأغنية تظهر بالملحن والسنة والملف');
    ok((await req('GET', '/api/songs/' + song.id)).j.recordings[0].sources[0].certainty === 'probable', 'المصدر ودرجة التأكد محفوظان');

    // البحث
    const S = async (q) => (await req('GET', '/api/search?q=' + encodeURIComponent(q))).j;
    ok((await S('اغنيه تجريبيه')).songs.total === 1, 'بحث بعد توحيد الحروف العربية');
    ok((await S('ملحن جديد')).songs.total === 1, 'بحث باسم الملحن');
    ok((await S('1965')).songs.total === 1, 'بحث بالسنة');
    ok((await S('حفلة اختبار')).concerts.total === 1, 'بحث باسم الحفلة');
    ok((await S('قارئة الفنجان')).songs.total === 1, 'بحث الأغنية الأولية');
    ok((await S('عبد الوهاب')).songs.total === 1, 'بحث بملحن الأغنية الأولية');

    // التصفية والفرز
    ok((await req('GET', '/api/songs?decade=1960')).j.total === 1, 'تصفية بالعقد');
    ok((await req('GET', '/api/songs?kind=rare')).j.total === 1, 'تصفية النادر');
    ok((await req('GET', '/api/songs?kind=undated')).j.total === 1, 'مجهولة التاريخ');
    ok((await req('GET', '/api/recordings?rare=1&type=live')).j.total === 1, 'تصفية التسجيلات النادرة');
    ok((await req('GET', '/api/recordings?sort=year&dir=desc')).j.rows[0].eff_year === 1965, 'الفرز');
    const tl = (await req('GET', '/api/timeline')).j;
    ok(tl.years.find((y) => y.year === 1965).counts.recordings === 1, 'الخط الزمني يحسب 1965');
    ok((await req('GET', '/api/year/1965')).j.recordings.length === 1, 'صفحة السنة');
    const cid = (await req('GET', '/api/concerts')).j.rows[0].id;
    ok((await req('GET', '/api/concerts/' + cid)).j.recordings.length === 1, 'صفحة الحفلة تعرض أغانيها');
    ok((await req('GET', '/api/people/5')).j.songs.length === 1, 'صفحة الشخص تجمع أعماله');

    // تاريخ غير صالح
    r = await req('POST', '/api/admin/e/concerts', { title: 'س', date: '21/3/1965' });
    ok(r.s === 400, 'رفض صيغة تاريخ خاطئة');

    // الاستيراد
    const csv = 'اسم الأغنية,الملحن,الشاعر,نوع التسجيل,السنة,الحفلة\n"أغنية ١, نسخة",بليغ حمدي,صلاح جاهين,حفلة حية,1970,حفلة اختبار\nأغنية ٢,;,,استوديو,,\n,x,,,,';
    r = await req('POST', '/api/admin/import/recordings?dry=1', csv, { 'Content-Type': 'text/csv' });
    ok(r.j.reports[0].created === 2 && r.j.reports[0].errors.length === 1, 'استيراد تجريبي يبلّغ عن الأخطاء');
    ok((await req('GET', '/api/songs')).j.total === 2, 'التجربة لا تحفظ شيئًا');
    r = await req('POST', '/api/admin/import/recordings', csv, { 'Content-Type': 'text/csv' });
    r = await req('POST', '/api/admin/import/recordings', csv, { 'Content-Type': 'text/csv' });
    ok(r.j.reports[0].skipped === 2, 'إعادة الاستيراد لا تكرر');
    ok((await req('GET', '/api/songs')).j.total === 4, 'الاستيراد الحقيقي');
    ok((await S('بليغ حمدي')).songs.total === 1, 'بحث ببليغ حمدي يجد أعماله');
    r = await req('POST', '/api/admin/import', JSON.stringify({ concerts: [{ title: 'حفلة JSON', date: '1970-05', city: 'القاهرة' }] }), { 'Content-Type': 'application/json' });
    ok(r.j.reports[0].created === 1, 'استيراد JSON');

    // ربط الملفات غير المرتبطة
    await req('POST', '/api/admin/upload?kind=audio&name=another.mp3', mp3);
    r = await req('POST', '/api/admin/media/adopt', { kind: 'audio' });
    ok(r.j.created === 1, 'إنشاء سجلات للملفات غير المرتبطة');

    // نسخة احتياطية + حذف
    r = await fetch(base + '/api/admin/backup', { headers: { cookie } });
    ok(r.status === 200 && (await r.arrayBuffer()).byteLength > 10000, 'نسخة احتياطية للقاعدة');
    r = await req('POST', '/api/admin/delete-demo', {});
    ok(r.j.removed >= 1, 'حذف البيانات التجريبية');
    r = await req('DELETE', '/api/admin/e/songs/' + song.id);
    ok(r.s === 200 && (await req('GET', '/api/recordings')).j.rows.every((x) => x.song_id !== song.id), 'حذف أغنية مع تسجيلاتها');
    r = await req('POST', '/api/admin/e/songs', { title: 'csrf' }, { 'X-Requested-With': '' });
    ok(r.s === 403, 'حماية CSRF');
    console.log(`\nنجح ${pass} اختبارًا`);
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
})();
