'use strict';

// توحيد النص العربي للبحث: إزالة التشكيل والتطويل، توحيد الألف والياء والتاء المربوطة، وتحويل الأرقام
function norm(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function terms(q) {
  return norm(q).split(' ').filter(Boolean).slice(0, 8);
}

function parseDuration(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return null;
}

function yearOf(date) {
  const m = String(date || '').match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

const validDate = (d) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d);

module.exports = { norm, terms, parseDuration, yearOf, validDate };
