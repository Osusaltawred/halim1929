'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
// كل ما يخص المستخدم (قاعدة البيانات + الصوت + الصور) يعيش داخل DATA_DIR
// وهو منفصل تمامًا عن كود التطبيق. عند النشر اربطه بقرص/Volume دائم.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');

const cfg = {
  ROOT,
  DATA_DIR,
  MEDIA_DIR,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  SEED_FILE: path.join(ROOT, 'seed', 'seed.json'),
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB) || 500,
  // اختياري: لو خزّنت الوسائط على CDN/تخزين خارجي ضع عنوانه هنا
  MEDIA_BASE_URL: (process.env.MEDIA_BASE_URL || '').replace(/\/+$/, ''),
  MEDIA_KINDS: ['audio', 'images', 'video'],
};

for (const d of [
  DATA_DIR,
  MEDIA_DIR,
  path.join(MEDIA_DIR, 'audio'),
  path.join(MEDIA_DIR, 'images'),
  path.join(MEDIA_DIR, 'images', 'thumbs'),
  path.join(MEDIA_DIR, 'video'),
  path.join(DATA_DIR, 'backups'),
]) {
  fs.mkdirSync(d, { recursive: true });
}

module.exports = cfg;
