'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

const ADMIN_FILE = path.join(cfg.DATA_DIR, 'admin.json');
const SECRET_FILE = path.join(cfg.DATA_DIR, 'secret.key');
const COOKIE = 'halim_admin';
const DAYS = 30;

function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

function saveAdmin(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt, hash: hashPw(pw, salt) }), { mode: 0o600 });
}

// أول تشغيل بدون ADMIN_PASSWORD: نولّد كلمة مرور ونعرضها مرة واحدة في سجل التشغيل
function init() {
  if (process.env.ADMIN_PASSWORD) return { source: 'env' };
  if (fs.existsSync(ADMIN_FILE)) return { source: 'file' };
  const pw = crypto.randomBytes(9).toString('base64url');
  saveAdmin(pw);
  return { source: 'generated', password: pw };
}

const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function verifyPassword(pw) {
  if (process.env.ADMIN_PASSWORD) return safeEq(pw, process.env.ADMIN_PASSWORD);
  try {
    const { salt, hash } = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
    return safeEq(hashPw(pw, salt), hash);
  } catch {
    return false;
  }
}

function changePassword(oldPw, newPw) {
  if (process.env.ADMIN_PASSWORD) return { ok: false, message: 'كلمة المرور مضبوطة من متغير ADMIN_PASSWORD، غيّرها من إعدادات الاستضافة.' };
  if (!verifyPassword(oldPw)) return { ok: false, message: 'كلمة المرور الحالية غير صحيحة.' };
  if (String(newPw).length < 8) return { ok: false, message: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.' };
  saveAdmin(newPw);
  return { ok: true };
}

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + DAYS * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const t = cookies(req)[COOKIE];
  if (!t || !t.includes('.')) return false;
  const [payload, sig] = t.split('.');
  if (!safeEq(sig, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

function cookieHeader(req, token) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const base = `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${DAYS * 86400}` : `${base}; Max-Age=0`;
}

// حد بسيط لمحاولات الدخول: 8 محاولات لكل 10 دقائق لكل عنوان
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 600000);
  attempts.set(ip, list);
  return list.length >= 8;
}
const noteFailure = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);

module.exports = { init, verifyPassword, changePassword, makeToken, isAuthed, cookieHeader, throttled, noteFailure };
