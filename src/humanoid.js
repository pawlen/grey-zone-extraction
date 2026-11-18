// ═══════════════════════════════════════════════════
// 骨骼蒙皮人形：PBR 材质 + AnimationMixer 动作系统
// 供敌人与仓库干员共用，替代方块拼装的程序化模型
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { AnimationController } from './assets.js';
import { clamp, mulberry32 } from './util.js';

// ─────────────── 骨骼定义（静止姿态，模型空间） ───────────────

const BONE_DEFS = [
  ['root', null, 0, 0, 0],
  ['hips', 'root', 0, 0.95, 0],
  ['spine', 'hips', 0, 0.12, 0],
  ['chest', 'spine', 0, 0.24, 0],
  ['neck', 'chest', 0, 0.20, 0],
  ['head', 'neck', 0, 0.12, 0],
  ['shoulderL', 'chest', -0.17, 0.19, 0],
  ['upperArmL', 'shoulderL', -0.09, 0, 0],
  ['lowerArmL', 'upperArmL', 0, -0.27, 0],
  ['handL', 'lowerArmL', 0, -0.24, 0],
  ['shoulderR', 'chest', 0.17, 0.19, 0],
  ['upperArmR', 'shoulderR', 0.09, 0, 0],
  ['lowerArmR', 'upperArmR', 0, -0.27, 0],
  ['handR', 'lowerArmR', 0, -0.24, 0],
  ['thighL', 'hips', -0.11, -0.03, 0],
  ['shinL', 'thighL', 0, -0.39, 0],
  ['footL', 'shinL', 0, -0.40, 0],
  ['thighR', 'hips', 0.11, -0.03, 0],
  ['shinR', 'thighR', 0, -0.39, 0],
  ['footR', 'shinR', 0, -0.40, 0],
];

const BONE_INDEX = new Map(BONE_DEFS.map((b, i) => [b[0], i]));

const GEO_CACHE = new Map();
const MAT_CACHE = new Map();
const CLIP_CACHE = new Map();

// ─────────────── 工具 ───────────────

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function cachedGeo(key, make) {
  if (!GEO_CACHE.has(key)) {
    const geo = make();
    geo.userData.shared = true;
    GEO_CACHE.set(key, geo);
  }
  return GEO_CACHE.get(key);
}

function css(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

// ─────────────── 程序化 PBR 贴图 ───────────────

function makeCamoTexture(palette, variant) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = css(palette.cloth);
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(0x9e3779b9 ^ (variant.length * 977) ^ (palette.cloth >>> 0));
  const base = new THREE.Color(palette.cloth);
  const tones = [base.clone().multiplyScalar(0.6), base.clone().multiplyScalar(1.3), base.clone().multiplyScalar(0.82)];
  if (variant === 'scav') {
    tones.push(new THREE.Color(0x5a4b36), new THREE.Color(0x3f4a34), new THREE.Color(0x6b5e45));
  } else if (variant === 'operator') {
    tones.push(new THREE.Color(0x3d4434), new THREE.Color(0x55604a));
  }
  for (let i = 0; i < 52; i++) {
    const x = rng() * 128;
    const y = rng() * 128;
    const w = 7 + rng() * 24;
    const h = 4 + rng() * 15;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.fillStyle = css(tones[Math.floor(rng() * tones.length)].getHex());
    ctx.globalAlpha = 0.45 + rng() * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 织物纹理
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  for (let y = 0; y < 128; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.08;
  for (let x = 0; x < 128; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 1.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFabricRoughness(seed) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 200 + Math.floor((rng() - 0.5) * 70);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 横向织物纹
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#777';
  for (let y = 0; y < size; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeSkinTexture(skinHex) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(skinHex);
  ctx.fillStyle = css(skinHex);
  ctx.fillRect(0, 0, size, size);
  const rng = mulberry32(0x51ed270b ^ (skinHex >>> 0));
  for (let i = 0; i < 900; i++) {
    const tone = base.clone().multiplyScalar(0.72 + rng() * 0.45);
    ctx.fillStyle = css(tone.getHex());
    ctx.globalAlpha = 0.18 + rng() * 0.2;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#3a2016';
  for (let y = 0; y < size; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeVestTexture(palette) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = css(palette.vest);
  ctx.fillRect(0, 0, 128, 128);
  const rng = mulberry32(0x51ed270b ^ (palette.vest >>> 0));
  for (let i = 0; i < 700; i++) {
    const v = 15 + Math.floor(rng() * 45);
    ctx.fillStyle = `rgba(${v},${v},${v},0.14)`;
    ctx.fillRect(rng() * 128, rng() * 128, 1.5, 1.5);
  }
  // 尼龙织带
  ctx.strokeStyle = 'rgba(8,10,9,0.55)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 18 + i * 30);
    ctx.lineTo(128, 18 + i * 30);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(96,100,88,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(22 + i * 42, 0);
    ctx.lineTo(22 + i * 42, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─────────────── 材质库 ───────────────

function defaultPalette(variant) {
  switch (variant) {
    case 'raider': return { cloth: 0x3a3d3a, vest: 0x2a2e2c, skin: 0xa07c5c, armor: 0x2f3539, gear: 0x1e2123 };
    case 'boss': return { cloth: 0x24262a, vest: 0x1d1f22, skin: 0xb08a68, armor: 0x22262a, gear: 0x17191b };
    case 'operator': return { cloth: 0x4a5340, vest: 0x353c2f, skin: 0xb98c6c, armor: 0x39413a, gear: 0x24282a };
    default: return { cloth: 0x5b5a44, vest: 0x3f4436, skin: 0xb08a68, armor: 0x3d4438, gear: 0x22262a };
  }
}

function getMaterials(variant, paletteInput, detailNormal) {
  if (MAT_CACHE.has(variant)) return MAT_CACHE.get(variant);
  const palette = Object.assign(defaultPalette(variant), paletteInput || {});
  const camo = makeCamoTexture(palette, variant);
  const vestTex = makeVestTexture(palette);
  const skinTex = makeSkinTexture(palette.skin);
  const fabricRough = makeFabricRoughness(0x1a2b3c ^ (palette.cloth >>> 0));
  const skinRough = makeFabricRoughness(0x77aa11 ^ (palette.skin >>> 0));

  const mat = (opts) => {
    const m = new THREE.MeshStandardMaterial(opts);
    m.userData.shared = true;
    return m;
  };

  const mats = {
    cloth: mat({
      map: camo, roughnessMap: fabricRough, roughness: 0.95, metalness: 0.02,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.28, 0.28),
      envMapIntensity: 0.55,
    }),
    pants: mat({
      map: camo, color: 0xc9cdc2, roughnessMap: fabricRough, roughness: 0.96, metalness: 0.02,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.3, 0.3),
      envMapIntensity: 0.5,
    }),
    vest: mat({
      map: vestTex, roughnessMap: fabricRough, roughness: 0.82, metalness: 0.08,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 0.65,
    }),
    armor: mat({
      color: palette.armor, roughnessMap: fabricRough, roughness: 0.62, metalness: 0.28,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.2, 0.2),
      envMapIntensity: 0.9,
    }),
    gear: mat({
      color: palette.gear, roughnessMap: fabricRough, roughness: 0.78, metalness: 0.18,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.3, 0.3),
      envMapIntensity: 0.7,
    }),
    skin: mat({
      map: skinTex, roughnessMap: skinRough, roughness: 0.68, metalness: 0.0,
      envMapIntensity: 0.5,
    }),
    glove: mat({
      color: 0x2e312b, roughnessMap: fabricRough, roughness: 0.86, metalness: 0.03,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.3, 0.3),
      envMapIntensity: 0.45,
    }),
    boot: mat({
      color: 0x1e211e, roughnessMap: fabricRough, roughness: 0.8, metalness: 0.06,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 0.6,
    }),
    helmet: mat({
      color: variant === 'boss' ? 0x1e2225 : 0x2d3338,
      roughnessMap: fabricRough, roughness: 0.38, metalness: 0.62,
      normalMap: detailNormal || null, normalScale: new THREE.Vector2(0.16, 0.16),
      envMapIntensity: 1.15,
    }),
    accent: mat({
      color: variant === 'raider' ? 0x8f3a31 : 0x9d8a4f,
      roughness: 0.7, metalness: 0.2,
    }),
    visor: mat({
      color: 0x1a2a34, roughness: 0.08, metalness: 0.55,
      emissive: 0x0a141a, emissiveIntensity: 0.8, envMapIntensity: 1.4,
    }),
    band: mat({
      color: variant === 'raider' ? 0x8f3a31 : 0x9d8a4f,
      roughness: 0.85, metalness: 0.05,
    }),
    gun: mat({ color: 0x2b3034, roughness: 0.42, metalness: 0.5, envMapIntensity: 1.0 }),
  };
  MAT_CACHE.set(variant, mats);
  return mats;
}

// ─────────────── 蒙皮几何 ───────────────

function setWeights(geo, weightFn) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const tmp = [];
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ws = weightFn(x, y, z);
    tmp.length = 0;
    let total = 0;
    for (const [name, w] of ws) {
      if (!w || w <= 0) continue;
      if (!BONE_INDEX.has(name)) continue;
      tmp.push([BONE_INDEX.get(name), w]);
      total += w;
    }
    if (!tmp.length) { tmp.push([BONE_INDEX.get('hips'), 1]); total = 1; }
    tmp.sort((a, b) => b[1] - a[1]);
    for (let k = 0; k < 4; k++) {
      const e = tmp[k];
      skinIndex[i * 4 + k] = e ? e[0] : 0;
      skinWeight[i * 4 + k] = e ? e[1] / total : 0;
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return geo;
}

function bodyWeights(x, y) {
  const c = smooth(1.08, 1.33, y);
  const s = (1 - c) * smooth(1.0, 1.12, y);
  const h = Math.max(0, 1 - c - s);
  return [['hips', h], ['spine', s], ['chest', c]];
}

function neckWeights(x, y) {
  const n = smooth(1.48, 1.55, y);
  const h = smooth(1.59, 1.66, y);
  return [['chest', 1 - n], ['neck', n * (1 - h)], ['head', n * h]];
}

function armWeights(side) {
  const S = side < 0 ? 'L' : 'R';
  return (x, y) => {
    const low = smooth(1.31, 1.17, y);
    const sh = smooth(1.42, 1.55, y) * 0.5;
    return [
      ['shoulder' + S, (1 - low) * sh],
      ['upperArm' + S, (1 - low) * (1 - sh)],
      ['lowerArm' + S, low],
    ];
  };
}

function legWeights(side) {
  const S = side < 0 ? 'L' : 'R';
  return (x, y) => {
    const shin = smooth(0.60, 0.46, y);
    const hip = smooth(0.90, 0.99, y) * 0.3;
    return [
      ['hips', (1 - shin) * hip],
      ['thigh' + S, (1 - shin) * (1 - hip)],
      ['shin' + S, shin],
    ];
  };
}

function getBodyGeometry() {
  return cachedGeo('hm-body', () => {
    const pelvis = new THREE.CylinderGeometry(0.208, 0.196, 0.24, 14, 2);
    pelvis.scale(1, 1, 0.75);
    pelvis.translate(0, 0.95, 0);
    const chest = new THREE.CylinderGeometry(0.268, 0.205, 0.46, 16, 8);
    chest.scale(1, 1, 0.72);
    chest.translate(0, 1.29, 0);
    const geo = mergeGeometries([pelvis, chest]);
    return setWeights(geo, bodyWeights);
  });
}

function getNeckGeometry() {
  return cachedGeo('hm-neck', () => {
    const geo = new THREE.CylinderGeometry(0.058, 0.072, 0.16, 12, 3);
    geo.translate(0, 1.55, 0);
    return setWeights(geo, neckWeights);
  });
}

function getHeadGeometry() {
  return cachedGeo('hm-head', () => {
    const skull = new THREE.SphereGeometry(0.15, 24, 18);
    skull.scale(0.95, 1.08, 1.0);
    skull.translate(0, 1.78, 0.012);
    const jaw = new THREE.SphereGeometry(0.105, 18, 12);
    jaw.scale(0.92, 0.78, 0.95);
    jaw.translate(0, 1.7, 0.045);
    const earL = new THREE.SphereGeometry(0.03, 10, 8);
    earL.scale(0.7, 1.1, 0.9);
    earL.translate(-0.146, 1.77, 0.01);
    const earR = earL.clone();
    earR.translate(0.292, 0, 0);
    const geo = mergeGeometries([skull, jaw, earL, earR]);
    return setWeights(geo, () => [['head', 1]]);
  });
}

function getArmGeometry(side) {
  return cachedGeo('hm-arm' + side, () => {
    const x = side * 0.26;
    const shoulder = new THREE.SphereGeometry(0.086, 16, 12);
    shoulder.scale(1, 0.9, 1);
    shoulder.translate(x, 1.5, 0);
    const upper = new THREE.CapsuleGeometry(0.062, 0.22, 6, 14);
    upper.translate(x, 1.375, 0);
    const lower = new THREE.CapsuleGeometry(0.052, 0.19, 6, 12);
    lower.translate(x, 1.11, 0.008);
    const geo = mergeGeometries([shoulder, upper, lower]);
    return setWeights(geo, armWeights(side));
  });
}

function getLegGeometry(side) {
  return cachedGeo('hm-leg' + side, () => {
    const x = side * 0.11;
    const thigh = new THREE.CapsuleGeometry(0.086, 0.32, 6, 14);
    thigh.translate(x, 0.735, 0);
    const shin = new THREE.CapsuleGeometry(0.068, 0.30, 6, 12);
    shin.translate(x, 0.345, 0);
    const geo = mergeGeometries([thigh, shin]);
    return setWeights(geo, legWeights(side));
  });
}

function boxGeo(w, h, d) {
  return cachedGeo(`hm-box-${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d));
}

function cylGeo(rt, rb, h, seg) {
  return cachedGeo(`hm-cyl-${rt}-${rb}-${h}-${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

function sphereGeo(r, ws = 16, hs = 12) {
  return cachedGeo(`hm-sph-${r}-${ws}-${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

function capsuleGeo(r, len) {
  return cachedGeo(`hm-cap-${r}-${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 12));
}

// ─────────────── 动作系统：采样生成 AnimationClip ───────────────

const ENEMY_ARMS = {
  idle: {
    upperArmL: [-0.3, 0, 0.22], upperArmR: [-0.4, 0, -0.24],
    lowerArmL: [-0.62, 0, 0], lowerArmR: [-0.68, 0, 0],
  },
  aim: {
    upperArmL: [-1.18, 0, 0.38], upperArmR: [-1.22, 0, -0.12],
    lowerArmL: [-0.42, 0, 0], lowerArmR: [-0.52, 0, 0],
  },
};

const OPERATOR_ARMS = {
  idle: {
    upperArmL: [-0.12, 0, 0.26], upperArmR: [-0.56, 0, -0.5],
    lowerArmL: [-0.4, 0, 0], lowerArmR: [-1.02, 0, 0],
  },
  aim: {
    upperArmL: [-1.05, 0, 0.42], upperArmR: [-1.12, 0, -0.15],
    lowerArmL: [-0.5, 0, 0], lowerArmR: [-0.58, 0, 0],
  },
};

function makeClip(name, duration, sample, frames) {
  const times = [];
  const values = new Map();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  for (let i = 0; i <= frames; i++) {
    const u = i / frames;
    times.push(duration * u);
    const pose = sample(u);
    for (const [bone, rot] of Object.entries(pose.rot || {})) {
      euler.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      quat.setFromEuler(euler);
      const key = bone + '.quaternion';
      if (!values.has(key)) values.set(key, []);
      values.get(key).push(quat.x, quat.y, quat.z, quat.w);
    }
    for (const [bone, pos] of Object.entries(pose.pos || {})) {
      const key = bone + '.position';
      if (!values.has(key)) values.set(key, []);
      values.get(key).push(pos[0], pos[1], pos[2]);
    }
  }
  const tracks = [];
  for (const [key, v] of values) {
    tracks.push(key.endsWith('.quaternion')
      ? new THREE.QuaternionKeyframeTrack(key, times, v)
      : new THREE.VectorKeyframeTrack(key, times, v));
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

function idleSample(arms) {
  return (u) => {
    const ph = u * Math.PI * 2;
    const sway = Math.sin(ph);
    const breath = Math.sin(ph * 2);
    return {
      rot: {
        hips: [0.004 * breath, 0.022 * sway, 0.012 * sway],
        spine: [0.01 * breath, -0.014 * sway, -0.006 * sway],
        chest: [0.012 * breath + 0.006, -0.02 * sway, 0.006 * sway],
        neck: [0.006 * breath, 0.03 * Math.sin(ph), 0],
        head: [0.012 * Math.sin(ph * 2 + 0.8), 0.16 * Math.sin(ph + 0.3) + 0.04 * Math.sin(ph * 2), 0.008 * sway],
        upperArmL: [arms.idle.upperArmL[0] + 0.02 * breath, 0, arms.idle.upperArmL[2] + 0.008 * sway],
        upperArmR: [arms.idle.upperArmR[0] + 0.014 * breath, 0, arms.idle.upperArmR[2] - 0.008 * sway],
        lowerArmL: [arms.idle.lowerArmL[0] + 0.02 * breath, 0, 0],
        lowerArmR: [arms.idle.lowerArmR[0] + 0.014 * breath, 0, 0],
        thighL: [0.012, 0, 0.014],
        thighR: [-0.006, 0, -0.012],
        shinL: [0.05 + 0.008 * sway, 0, 0],
        shinR: [0.04 - 0.008 * sway, 0, 0],
      },
      pos: {
        hips: [0.008 * sway, 0.945 + 0.004 * breath, 0],
      },
    };
  };
}

function walkSample(arms, run) {
  const swing = run ? 0.62 : 0.42;
  const armSwing = run ? 0.26 : 0.14;
  const bob = run ? 0.026 : 0.016;
  return (u) => {
    const ph = u * Math.PI * 2;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const kneeL = 0.1 + Math.max(0, Math.sin(ph + 2.5)) * (run ? 1.0 : 0.62);
    const kneeR = 0.1 + Math.max(0, Math.sin(ph + 2.5 + Math.PI)) * (run ? 1.0 : 0.62);
    return {
      rot: {
        hips: [run ? 0.04 : 0.015, 0.075 * s, 0.025 * s],
        spine: [run ? 0.05 : 0.025, -0.06 * s, -0.018 * s],
        chest: [run ? 0.13 : 0.06, -0.055 * s, -0.012 * s],
        neck: [run ? -0.07 : -0.03, 0.01 * s, 0],
        head: [run ? -0.04 : -0.015, 0.02 * s, 0],
        thighL: [swing * s, 0, 0.018],
        thighR: [-swing * s, 0, -0.018],
        shinL: [kneeL, 0, 0],
        shinR: [kneeR, 0, 0],
        footL: [-0.15 * c, 0, 0],
        footR: [0.15 * c, 0, 0],
        upperArmL: [arms.idle.upperArmL[0] + armSwing * s, 0, arms.idle.upperArmL[2]],
        upperArmR: [arms.idle.upperArmR[0] - armSwing * s, 0, arms.idle.upperArmR[2]],
        lowerArmL: [arms.idle.lowerArmL[0] + 0.08 * Math.max(0, s), 0, 0],
        lowerArmR: [arms.idle.lowerArmR[0] + 0.08 * Math.max(0, -s), 0, 0],
      },
      pos: {
        hips: [0, 0.945 - bob * Math.cos(ph * 2), 0],
      },
    };
  };
}

function aimSample(arms) {
  return (u) => {
    const ph = u * Math.PI * 2;
    const s = Math.sin(ph);
    const s2 = Math.sin(ph * 2);
    return {
      rot: {
        hips: [0.01, 0.012 * s, 0.01],
        spine: [0.015, -0.01 * s, 0],
        chest: [0.02 + 0.004 * s2, -0.008 * s, 0],
        neck: [-0.03, 0, 0],
        head: [-0.02, 0.012 * s, 0],
        thighL: [-0.05, 0, 0.03],
        thighR: [0.05, 0, -0.03],
        shinL: [0.12, 0, 0],
        shinR: [0.09, 0, 0],
        upperArmL: [arms.aim.upperArmL[0] + 0.006 * s2, 0, arms.aim.upperArmL[2]],
        upperArmR: [arms.aim.upperArmR[0] + 0.005 * s2, 0, arms.aim.upperArmR[2]],
        lowerArmL: [arms.aim.lowerArmL[0], 0, 0],
        lowerArmR: [arms.aim.lowerArmR[0], 0, 0],
      },
      pos: {
        hips: [0, 0.94 + 0.0015 * s2, 0],
      },
    };
  };
}

function fireSample(arms) {
  return (u) => {
    const kick = u < 0.35 ? Math.sin((u / 0.35) * Math.PI) : 0;
    return {
      rot: {
        hips: [0.01, 0, 0.01],
        spine: [0.015 + 0.03 * kick, 0, 0],
        chest: [0.02 + 0.06 * kick, 0, 0],
        neck: [-0.03 - 0.02 * kick, 0, 0],
        head: [-0.02, 0, 0],
        thighL: [-0.05, 0, 0.03],
        thighR: [0.05, 0, -0.03],
        shinL: [0.12, 0, 0],
        shinR: [0.09, 0, 0],
        upperArmL: [arms.aim.upperArmL[0] + 0.05 * kick, 0, arms.aim.upperArmL[2]],
        upperArmR: [arms.aim.upperArmR[0] + 0.04 * kick, 0, arms.aim.upperArmR[2]],
        lowerArmL: [arms.aim.lowerArmL[0] + 0.05 * kick, 0, 0],
        lowerArmR: [arms.aim.lowerArmR[0] + 0.03 * kick, 0, 0],
      },
      pos: {
        hips: [0, 0.94, 0],
      },
    };
  };
}

function deathSample(u) {
  const e = 1 - Math.pow(1 - Math.min(1, u * 1.15), 3);
  return {
    rot: {
      root: [0, 0, -1.45 * e],
      hips: [0.28 * e, 0.15 * e, 0.1 * e],
      spine: [0.2 * e, 0, 0],
      chest: [0.15 * e, 0, 0],
      neck: [0.18 * e, 0, 0],
      head: [0.25 * e, 0.3 * e, 0],
      thighL: [0.55 * e, 0, 0.25 * e],
      thighR: [-0.25 * e, 0, -0.15 * e],
      shinL: [1.15 * e, 0, 0],
      shinR: [0.7 * e, 0, 0],
      upperArmL: [-0.4 * e, 0, 0.85 * e],
      upperArmR: [-0.3 * e, 0, -0.5 * e],
      lowerArmL: [-0.5 * e, 0, 0],
      lowerArmR: [-0.45 * e, 0, 0],
    },
    pos: {
      hips: [0, 0.95 - 0.28 * e, 0],
    },
  };
}

function getClips(preset) {
  if (CLIP_CACHE.has(preset)) return CLIP_CACHE.get(preset);
  const arms = preset === 'operator' ? OPERATOR_ARMS : ENEMY_ARMS;
  const clips = [
    makeClip('idle', 4.2, idleSample(arms), 32),
    makeClip('walk', 1.15, walkSample(arms, false), 24),
    makeClip('run', 0.85, walkSample(arms, true), 22),
    makeClip('aim', 2.4, aimSample(arms), 24),
    makeClip('fire', 0.2, fireSample(arms), 6),
    makeClip('death', 0.95, deathSample, 20),
  ];
  CLIP_CACHE.set(preset, clips);
  return clips;
}

// ═══════════════════════════════════════════════════
// 人形控制器
// ═══════════════════════════════════════════════════

export class HumanoidRig {
  constructor({ variant = 'scav', palette = null, detailNormal = null, preset = 'enemy', gear = true } = {}) {
    this.variant = variant;
    this.preset = preset;
    this.withGear = gear;
    this.materials = getMaterials(variant, palette, detailNormal);
    this.object = new THREE.Group();
    this.object.name = 'humanoid-' + variant;
    this.bones = {};
    this.boneList = [];
    this.hitMeshes = [];

    this._buildSkeleton();
    this._buildSkinnedBody();
    this._buildRigidParts();
    if (gear) this._buildTacticalGear();
    this._buildAnimation();
  }

  _buildSkeleton() {
    for (const [name, parent, x, y, z] of BONE_DEFS) {
      const bone = new THREE.Bone();
      bone.name = name;
      bone.position.set(x, y, z);
      if (parent) this.bones[parent].add(bone);
      else this.object.add(bone);
      this.bones[name] = bone;
      this.boneList.push(bone);
    }
    // 头部略微缩小，避免低多边形人偶比例失真
    this.bones.head.scale.setScalar(0.95);
    this.object.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.boneList);
  }

  _skin(key, geo, mat, part) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.name = 'skin-' + key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.object.add(mesh);
    mesh.bind(this.skeleton);
    mesh.userData.sharedGeometry = true;
    if (part) {
      mesh.userData.part = part;
      this.hitMeshes.push(mesh);
    }
    return mesh;
  }

  _buildSkinnedBody() {
    const M = this.materials;
    this._skin('body', getBodyGeometry(), M.cloth, 'body');
    // 拾荒者露出面部，其余角色为巴拉克拉法帽包裹的头部
    this._skin('head', getHeadGeometry(), this.variant === 'scav' ? M.skin : M.cloth, 'head');
    this._skin('neck', getNeckGeometry(), M.skin, null);
    this._skin('armL', getArmGeometry(-1), M.cloth, null);
    this._skin('armR', getArmGeometry(1), M.cloth, null);
    this._skin('legL', getLegGeometry(-1), M.pants, 'legs');
    this._skin('legR', getLegGeometry(1), M.pants, 'legs');
  }

  _rigid(parentBone, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.bones[parentBone].add(mesh);
    return mesh;
  }

  _buildRigidParts() {
    const M = this.materials;
    const variant = this.variant;

    // 手 / 靴子（刚性挂到骨骼）
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R';
      const hand = this._rigid('hand' + S, boxGeo(0.085, 0.1, 0.105), M.glove, 0, -0.045, 0.02, -0.1, 0, 0);
      hand.name = 'hand-' + S;
      this._rigid('hand' + S, boxGeo(0.03, 0.05, 0.035), M.glove, side * 0.05, -0.03, 0.055, 0, 0, side * 0.4);
      this._rigid('foot' + S, boxGeo(0.16, 0.115, 0.3), M.boot, 0, -0.07, 0.06, 0, side * 0.07, 0);
      this._rigid('foot' + S, boxGeo(0.172, 0.032, 0.315), M.gear, 0, -0.132, 0.065, 0, side * 0.07, 0);
      this._rigid('foot' + S, boxGeo(0.145, 0.02, 0.05), M.gear, 0, -0.11, 0.2, 0, side * 0.07, 0);
      // 护膝随小腿
      this._rigid('shin' + S, boxGeo(0.15, 0.1, 0.11), M.gear, 0, 0.015, 0.055, 0, 0, 0);
      // 大腿侧袋
      this._rigid('thigh' + S, boxGeo(0.085, 0.13, 0.06), M.gear, side * 0.072, -0.235, 0.075, 0, side * 0.15, 0);
    }

    // 颈部围脖 / 衣领
    this._rigid('chest', cylGeo(0.088, 0.104, 0.14, 12), M.cloth, 0, 0.235, 0);

    // 腰带与髋包
    this._rigid('hips', cylGeo(0.212, 0.2, 0.24, 14), M.cloth, 0, 0.01, 0).scale.z = 0.75;
    this._rigid('hips', boxGeo(0.43, 0.065, 0.28), M.gear, 0, 0.145, 0);
    this._rigid('hips', boxGeo(0.1, 0.055, 0.03), M.accent, 0, 0.145, 0.15);
    this._rigid('hips', boxGeo(0.11, 0.13, 0.08), M.gear, -0.2, 0.03, 0.1, 0, 0.25, 0);
    this._rigid('hips', boxGeo(0.11, 0.13, 0.08), M.gear, 0.2, 0.03, 0.1, 0, -0.25, 0);
    this._rigid('hips', boxGeo(0.09, 0.11, 0.07), M.gear, 0.22, 0.02, -0.1, 0, 0, 0);

    // 头部装备
    if (variant === 'scav') {
      // 旧帽与面部
      const cap = this._rigid('head', sphereGeo(0.16, 18, 10), M.cloth, 0, 0.235, -0.012);
      cap.scale.set(1, 0.74, 1.03);
      const brim = this._rigid('head', cylGeo(0.158, 0.164, 0.016, 18), M.cloth, 0, 0.238, 0.075, 0.06, 0, 0);
      brim.scale.z = 1.18;
      this._rigid('head', boxGeo(0.19, 0.028, 0.022), M.gear, 0, 0.224, 0.146);
      this._rigid('head', boxGeo(0.028, 0.017, 0.012), M.gear, -0.056, 0.202, 0.156);
      this._rigid('head', boxGeo(0.028, 0.017, 0.012), M.gear, 0.056, 0.202, 0.156);
      this._rigid('head', boxGeo(0.034, 0.012, 0.012), M.gear, -0.056, 0.22, 0.154).rotation.z = -0.12;
      this._rigid('head', boxGeo(0.034, 0.012, 0.012), M.gear, 0.056, 0.22, 0.154).rotation.z = 0.12;
      this._rigid('head', boxGeo(0.034, 0.05, 0.03), M.skin, 0, 0.171, 0.159);
      this._rigid('head', boxGeo(0.095, 0.045, 0.018), M.gear, 0, 0.108, 0.148);
      this._rigid('head', boxGeo(0.048, 0.012, 0.014), M.gear, 0, 0.133, 0.153);
    } else {
      // 巴拉克拉法帽 + 风镜 + 面巾与呼吸器
      const hood = this._rigid('head', sphereGeo(0.168, 18, 12), M.cloth, 0, 0.175, -0.02);
      hood.scale.set(1.02, 1.0, 1.02);
      this._rigid('head', boxGeo(0.2, 0.035, 0.03), M.cloth, 0, 0.242, 0.142);
      this._rigid('head', boxGeo(0.205, 0.045, 0.03), M.gear, 0, 0.205, 0.15);
      for (const side of [-1, 1]) {
        const lens = this._rigid('head', cylGeo(0.037, 0.037, 0.022, 12), M.visor,
          side * 0.058, 0.205, 0.163, Math.PI / 2, 0, 0);
        lens.scale.z = 0.85;
        this._rigid('head', cylGeo(0.045, 0.045, 0.012, 12), M.gear,
          side * 0.058, 0.205, 0.152, Math.PI / 2, 0, 0);
      }
      const wrap = this._rigid('head', sphereGeo(0.115, 14, 10), M.gear, 0, 0.115, 0.105);
      wrap.scale.set(1.12, 0.62, 0.78);
      const filter = this._rigid('head', cylGeo(0.036, 0.04, 0.05, 10), M.gear,
        0, 0.085, 0.155, Math.PI / 2, 0, 0);
      filter.scale.z = 0.8;
      this._rigid('head', boxGeo(0.014, 0.09, 0.012), M.gear, -0.14, 0.17, 0.03);
      this._rigid('head', boxGeo(0.014, 0.09, 0.012), M.gear, 0.14, 0.17, 0.03);
    }

    // 头盔（掠夺者 / 首领）
    if (variant === 'raider' || variant === 'boss') {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.192, 20, 12, 0, Math.PI * 2, 0, Math.PI * (variant === 'boss' ? 0.5 : 0.44)),
        M.helmet,
      );
      helmet.position.set(0, 0.195, -0.005);
      helmet.scale.set(1, 0.98, 1.06);
      helmet.castShadow = true;
      helmet.receiveShadow = true;
      helmet.userData.part = 'head';
      this.bones.head.add(helmet);
      this.hitMeshes.push(helmet);
      this._rigid('head', boxGeo(0.31, 0.03, 0.055), M.helmet, 0, 0.215, 0.145);
      this._rigid('head', boxGeo(0.05, 0.11, 0.13), M.helmet, -0.16, 0.145, 0.005, 0, 0, 0.08);
      this._rigid('head', boxGeo(0.05, 0.11, 0.13), M.helmet, 0.16, 0.145, 0.005, 0, 0, -0.08);
      this._rigid('head', boxGeo(0.018, 0.02, 0.09), M.gear, -0.17, 0.25, -0.01);
      this._rigid('head', boxGeo(0.018, 0.02, 0.09), M.gear, 0.17, 0.25, -0.01);
      this._rigid('head', boxGeo(0.014, 0.1, 0.014), M.gear, -0.1, 0.13, 0.09, 0.35, 0, 0);
      this._rigid('head', boxGeo(0.014, 0.1, 0.014), M.gear, 0.1, 0.13, 0.09, 0.35, 0, 0);
      if (variant === 'boss') {
        this._rigid('head', boxGeo(0.22, 0.14, 0.045), M.visor, 0, 0.19, 0.205);
        this._rigid('head', boxGeo(0.24, 0.03, 0.06), M.helmet, 0, 0.262, 0.17);
        this._rigid('head', boxGeo(0.1, 0.05, 0.04), M.gear, 0, 0.31, 0.11);
      } else {
        this._rigid('head', boxGeo(0.195, 0.055, 0.02), M.visor, 0, 0.205, 0.19);
        this._rigid('head', boxGeo(0.1, 0.05, 0.04), M.gear, 0, 0.305, 0.1);
      }
    }

    // 臂章（随上臂）
    for (const side of [-1, 1]) {
      const S = side < 0 ? 'L' : 'R';
      this._rigid('upperArm' + S, boxGeo(0.045, 0.075, 0.012), M.band, side * 0.058, -0.115, 0.055);
    }
  }

  _buildTacticalGear() {
    const M = this.materials;
    const variant = this.variant;

    // 防弹衣（挂在胸骨，坐标相对胸骨：旧躯干坐标 -0.33）
    const vest = this._rigid('chest', cylGeo(0.262, 0.228, 0.38, 14), M.vest, 0, 0.04, 0.005);
    vest.scale.z = 0.78;
    this._rigid('chest', boxGeo(0.26, 0.26, 0.035), M.vest, 0, 0.05, 0.192, -0.04, 0, 0);
    this._rigid('chest', boxGeo(0.09, 0.15, 0.05), M.vest, -0.165, 0.225, 0.09, 0.24, 0, 0);
    this._rigid('chest', boxGeo(0.09, 0.15, 0.05), M.vest, 0.165, 0.225, 0.09, 0.24, 0, 0);
    for (let i = 0; i < 4; i++) {
      this._rigid('chest', boxGeo(0.2, 0.014, 0.01), M.gear, 0, -0.08 + i * 0.075, 0.212);
    }
    for (let i = 0; i < 3; i++) {
      this._rigid('chest', boxGeo(0.1, 0.12, 0.065), M.gear, -0.13 + i * 0.13, -0.04, 0.205);
      this._rigid('chest', boxGeo(0.075, 0.026, 0.014), M.accent, -0.13 + i * 0.13, 0.005, 0.24);
    }
    this._rigid('chest', boxGeo(0.055, 0.26, 0.26), M.vest, -0.255, 0.03, 0);
    this._rigid('chest', boxGeo(0.055, 0.26, 0.26), M.vest, 0.255, 0.03, 0);
    this._rigid('upperArmR', boxGeo(0.1, 0.05, 0.012), M.band, 0.06, -0.06, 0.06);

    // 背包
    const pack = this._rigid('chest', cylGeo(0.175, 0.16, 0.36, 12), M.gear, 0, 0.04, -0.245);
    pack.scale.set(1.02, 1, 0.6);
    this._rigid('chest', boxGeo(0.24, 0.06, 0.03), M.accent, 0, 0.14, -0.325);
    this._rigid('chest', boxGeo(0.27, 0.035, 0.24), M.gear, 0, 0.225, -0.25);
    this._rigid('chest', boxGeo(0.065, 0.3, 0.03), M.gear, -0.14, 0.17, 0.125);
    this._rigid('chest', boxGeo(0.065, 0.3, 0.03), M.gear, 0.14, 0.17, 0.125);

    if (variant === 'boss') {
      this._rigid('chest', boxGeo(0.56, 0.055, 0.34), M.helmet, 0, 0.27, 0.01);
      const padL = this._rigid('chest', sphereGeo(0.13, 12, 8), M.helmet, -0.3, 0.22, 0);
      padL.scale.set(1.1, 0.7, 1.1);
      const padR = this._rigid('chest', sphereGeo(0.13, 12, 8), M.helmet, 0.3, 0.22, 0);
      padR.scale.set(1.1, 0.7, 1.1);
      this._rigid('chest', boxGeo(0.2, 0.16, 0.06), M.vest, -0.26, 0.11, 0.2, 0.1, 0, 0);
    }
  }

  _buildAnimation() {
    this.clipNames = { idle: 'idle', walk: 'walk', run: 'run', aim: 'aim', fire: 'fire', death: 'death' };
    this.anim = new AnimationController(this.object, getClips(this.preset));
    this.anim.play('idle', { fade: 0, loop: true });
  }

  bindToEnemy(enemy) {
    for (const mesh of this.hitMeshes) mesh.userData.enemy = enemy;
  }

  dispose() {
    if (this.anim) this.anim.dispose();
  }
}
