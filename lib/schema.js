'use strict';

// كل التسميات العربية هنا في مكان واحد. لإضافة الإنجليزية لاحقًا أضف labels_en بنفس المفاتيح.
const LABELS = {
  certainty: { confirmed: 'مؤكد', probable: 'مرجح', uncertain: 'غير مؤكد', unknown: 'غير معروف' },
  categories: {
    romantic: 'عاطفية', national: 'وطنية', film: 'سينمائية', poem: 'قصائد',
    religious: 'دينية', muwashah: 'موشحات', other: 'أخرى',
  },
  recTypes: {
    studio: 'استوديو', live: 'حفلة حية', radio: 'إذاعي', film: 'من فيلم', rehearsal: 'بروفة',
    session: 'جلسة', private: 'تسجيل خاص', incomplete: 'غير مكتمل', other: 'أخرى',
  },
  // أنواع التصفية في صفحة الأغاني (حسب طلب المشروع)
  kinds: {
    studio: 'أغاني الاستوديو', film: 'الأغاني السينمائية', national: 'الأغاني الوطنية', poem: 'القصائد',
    romantic: 'الأغاني العاطفية', religious: 'الأغاني الدينية', muwashah: 'الموشحات',
    rare: 'الأغاني النادرة', undated: 'مجهولة التاريخ', live: 'التسجيلات الحية',
  },
  rareKinds: {
    radio: 'تسجيلات إذاعية', rehearsal: 'بروفات', session: 'جلسات', private: 'تسجيلات خاصة',
    incomplete: 'غير مكتملة', live: 'تسجيلات حفلات', studio: 'تسجيلات استوديو', undated: 'غير مؤرخة',
  },
  photoCats: {
    personal: 'صور شخصية', childhood: 'صور الطفولة', concerts: 'صور الحفلات', studio: 'صور الاستوديو',
    films: 'صور الأفلام', artists: 'مع الفنانين', composers: 'مع الملحنين والشعراء', rare: 'صور نادرة',
    press: 'صور الصحافة', travel: 'من السفر', other: 'أخرى',
  },
  colors: { bw: 'أبيض وأسود', color: 'ملونة' },
  roles: {
    composer: 'ملحن', lyricist: 'شاعر', arranger: 'موزع', director: 'مخرج',
    host: 'مذيع', actor: 'ممثل', musician: 'عازف', other: 'آخر',
  },
  sourceTypes: {
    book: 'كتاب', press: 'صحافة', website: 'موقع', archive: 'أرشيف',
    personal: 'مجموعة شخصية', broadcast: 'إذاعة/تلفزيون', other: 'أخرى',
  },
  timelineKinds: {
    birth: 'ميلاد', milestone: 'محطة', song: 'أغنية', concert: 'حفلة',
    film: 'فيلم', interview: 'مقابلة', recording: 'تسجيل', death: 'وفاة', other: 'حدث',
  },
  fields: {
    date: 'التاريخ', place: 'المكان', composer: 'الملحن', lyricist: 'الشاعر',
    arranger: 'الموزع', duration: 'المدة', info: 'معلومة عامة',
  },
  entityNames: {
    people: 'شخص', songs: 'أغنية', recordings: 'تسجيل', concerts: 'حفلة', sessions: 'جلسة',
    interviews: 'مقابلة', movies: 'فيلم', photos: 'صورة', sources: 'مصدر', timeline: 'حدث زمني',
  },
};

const D = ['date', 'date_certainty', 'year', 'year_from', 'year_to'];

// تعريف الكيانات: الأعمدة المسموح بحفظها + الأعمدة النصية للفهرسة
const ENTITIES = {
  people: {
    table: 'people', req: 'name',
    cols: ['name', 'name_en', 'roles', 'bio', 'birth_year', 'death_year', 'photo', 'certainty'],
    ints: ['birth_year', 'death_year'],
    text: ['name', 'name_en', 'bio'],
  },
  songs: {
    table: 'songs', req: 'title',
    cols: ['title', 'title_en', 'category', 'year', 'description', 'lyrics', 'image', 'certainty'],
    ints: ['year'],
    text: ['title', 'title_en', 'description', 'lyrics'],
  },
  recordings: {
    table: 'recordings', req: 'song_id',
    cols: ['song_id', 'version_title', 'rec_type', 'is_rare', ...D, 'venue', 'city', 'duration_sec',
      'audio_file', 'audio_name', 'image', 'concert_id', 'session_id', 'interview_id', 'movie_id',
      'arranger_id', 'description'],
    ints: ['song_id', 'is_rare', 'year', 'year_from', 'year_to', 'duration_sec', 'concert_id',
      'session_id', 'interview_id', 'movie_id', 'arranger_id'],
    text: ['version_title', 'venue', 'city', 'description'],
  },
  concerts: {
    table: 'concerts', req: 'title',
    cols: ['title', ...D, 'venue', 'city', 'country', 'occasion', 'description', 'image', 'videos'],
    ints: ['year', 'year_from', 'year_to'],
    text: ['title', 'venue', 'city', 'country', 'occasion', 'description'],
  },
  sessions: {
    table: 'sessions', req: 'title',
    cols: ['title', ...D, 'venue', 'city', 'attendees', 'description', 'image', 'videos'],
    ints: ['year', 'year_from', 'year_to'],
    text: ['title', 'venue', 'city', 'attendees', 'description'],
  },
  interviews: {
    table: 'interviews', req: 'title',
    cols: ['title', ...D, 'program', 'host', 'venue', 'city', 'duration_sec', 'description', 'image', 'videos'],
    ints: ['year', 'year_from', 'year_to', 'duration_sec'],
    text: ['title', 'program', 'host', 'venue', 'city', 'description'],
  },
  movies: {
    table: 'movies', req: 'title',
    cols: ['title', 'title_en', 'year', 'director_id', 'cast_text', 'story', 'description', 'image', 'videos'],
    ints: ['year', 'director_id'],
    text: ['title', 'title_en', 'cast_text', 'story', 'description'],
  },
  photos: {
    table: 'photos', req: 'file',
    cols: ['title', 'file', 'category', 'color', ...D, 'place', 'people_text', 'description',
      'concert_id', 'session_id', 'movie_id', 'interview_id'],
    ints: ['year', 'year_from', 'year_to', 'concert_id', 'session_id', 'movie_id', 'interview_id'],
    text: ['title', 'place', 'people_text', 'description'],
  },
  sources: {
    table: 'sources', req: 'title',
    cols: ['title', 'type', 'author', 'publisher', 'pub_date', 'url', 'notes'],
    ints: [],
    text: ['title', 'author', 'publisher', 'notes'],
  },
  timeline: {
    table: 'timeline_events', req: 'title',
    cols: ['year', 'date', 'title', 'description', 'kind', 'ref_type', 'ref_id', 'certainty'],
    ints: ['year', 'ref_id'],
    text: ['title', 'description'],
  },
};

const MEDIA_OWNERS = ['concerts', 'sessions', 'interviews', 'movies'];

const EXT = {
  audio: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma'],
  images: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
  video: ['mp4', 'webm', 'm4v', 'mov'],
};

const MIME = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
  ogg: 'audio/ogg', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', m4v: 'video/mp4', mov: 'video/quicktime',
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', svg: 'image/svg+xml', ico: 'image/x-icon',
  webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
};

module.exports = { LABELS, ENTITIES, MEDIA_OWNERS, EXT, MIME };
