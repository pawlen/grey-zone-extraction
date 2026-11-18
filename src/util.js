// ═══════════════ 通用工具 ═══════════════

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randRange = (rng, a, b) => a + (b - a) * rng();
export const randInt = (rng, a, b) => Math.floor(randRange(rng, a, b + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function weightedPick(rng, entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = rng() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries.length ? entries[entries.length - 1][0] : null;
}

let _uidCounter = 0;
export function uid() {
  _uidCounter++;
  return Date.now().toString(36) + '_' + _uidCounter.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function formatMoney(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

export function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function bearingDeg(dx, dz) {
  // 0 = 北(-Z), 90 = 东(+X)
  let deg = Math.atan2(dx, -dz) * 180 / Math.PI;
  return (deg + 360) % 360;
}

export function seedFromNow() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export const SAVE_KEY = 'grey_zone_save_v1';
export const SETTINGS_KEY = 'grey_zone_settings_v1';

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('读取本地存档失败', e);
    return fallback;
  }
}

export function saveJSON(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.warn('写入本地存档失败', e);
    return false;
  }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
