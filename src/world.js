// ═══════════════════════════════════════════════════
// 3D 世界：地图生成 / 碰撞 / 导航 / 搜刮容器 / 撤离点
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { MAPS, CONTAINERS, ITEMS, LOOT_TABLES } from './data.js';
import { Grid, createItem } from './inventory.js';
import { mulberry32, randRange, randInt, pick, weightedPick, uid, clamp, dist } from './util.js';

const THEMES = {
  factory: {
    bg: 0x12191e, fogNear: 14, fogFar: 105,
    hemiSky: 0xb8c6cd, hemiGround: 0x2c2820, hemiInt: 1.5,
    dirColor: 0xd6dee1, dirInt: 2.4, dirPos: [40, 90, 25],
    ground: { base: '#3a3e41', specks: ['#44484b', '#303336', '#4a4e50', '#3e4245', '#53575a'], lines: 'rgba(120,132,138,0.1)', dust: 0xb8c2bc },
    wall: 0x5c6365, wallAlt: 0x6a6153, roof: 0x3a4043, accent: 0x8a744a,
    propColors: [0x6a5a45, 0x565e62, 0x74603f, 0x4a5052],
    dustColor: 0xc2ccc6, dustOpacity: 0.32,
  },
  forest: {
    bg: 0x22302a, fogNear: 22, fogFar: 145,
    hemiSky: 0xb4c8a4, hemiGround: 0x2a2c1e, hemiInt: 1.55,
    dirColor: 0xe3d7a8, dirInt: 2.5, dirPos: [-50, 80, 40],
    ground: { base: '#46533a', specks: ['#4f5e40', '#3a472e', '#586646', '#414f33', '#63724a'], lines: 'rgba(120,135,95,0.06)', dust: 0xc4cfa4 },
    wall: 0x66543f, wallAlt: 0x574835, roof: 0x42372a, accent: 0x8a7548,
    propColors: [0x6a563f, 0x5c503b, 0x766147, 0x4c5a3d],
    dustColor: 0xd7e3b8, dustOpacity: 0.35,
  },
  port: {
    bg: 0x1a2530, fogNear: 20, fogFar: 130,
    hemiSky: 0xa8bed1, hemiGround: 0x202228, hemiInt: 1.4,
    dirColor: 0xced9e6, dirInt: 2.2, dirPos: [60, 70, -40],
    ground: { base: '#353a3f', specks: ['#3d4247', '#2c3034', '#454a4f', '#373c41', '#4c5156'], lines: 'rgba(120,138,155,0.1)', dust: 0xb8cad8 },
    wall: 0x5d6b78, wallAlt: 0x515c66, roof: 0x39424a, accent: 0x6a8494,
    propColors: [0x4a6a7c, 0x765346, 0x5c7048, 0x5e6468],
    dustColor: 0xc0d6e6, dustOpacity: 0.3,
  },
  snow: {
    bg: 0x2c3a44, fogNear: 26, fogFar: 195,
    hemiSky: 0xc9d8e2, hemiGround: 0x3f4a50, hemiInt: 1.65,
    dirColor: 0xe4eef6, dirInt: 2.3, dirPos: [70, 110, 30],
    ground: { base: '#8a969e', specks: ['#98a4ab', '#7b878f', '#aab5bb', '#8f9ba2', '#b5c0c5'], lines: 'rgba(230,240,246,0.06)', dust: 0xd9e6ee },
    wall: 0x64727a, wallAlt: 0x56636b, roof: 0x445057, accent: 0x93a5b0,
    propColors: [0x5c686e, 0x74624c, 0x4d5a60, 0x87939a],
    dustColor: 0xe8f2f8, dustOpacity: 0.4,
  },
  farm: {
    bg: 0x33402d, fogNear: 28, fogFar: 215,
    hemiSky: 0xd9d5a8, hemiGround: 0x403722, hemiInt: 1.6,
    dirColor: 0xffe8b4, dirInt: 2.6, dirPos: [-80, 100, 40],
    ground: { base: '#5a5b36', specks: ['#66683f', '#4c4e2d', '#74754a', '#555631', '#8a8350'], lines: 'rgba(200,190,140,0.05)', dust: 0xd9d0a0 },
    wall: 0x6f5638, wallAlt: 0x5f4a30, roof: 0x473828, accent: 0xa08750,
    propColors: [0x6e583a, 0x7d6541, 0x566034, 0x8c7648],
    dustColor: 0xf0e6b8, dustOpacity: 0.32,
  },
  city: {
    bg: 0x222a33, fogNear: 28, fogFar: 190,
    hemiSky: 0xb4c2cc, hemiGround: 0x2a2c30, hemiInt: 1.4,
    dirColor: 0xdfe8ee, dirInt: 2.05, dirPos: [60, 90, -30],
    ground: { base: '#3a3c3f', specks: ['#44464a', '#303236', '#4b4d51', '#3e4044', '#56585c'], lines: 'rgba(150,160,170,0.08)', dust: 0xb0bcc6 },
    wall: 0x5c5650, wallAlt: 0x514b46, roof: 0x3a3b3f, accent: 0x7c6a52,
    propColors: [0x4e4a46, 0x6b4f3f, 0x555c5e, 0x6e6350],
    dustColor: 0xc8d2da, dustOpacity: 0.3,
  },
};


const TERRAIN = {
  factory: {
    amp: 2.6, scale: 0.019, boundaryAmp: 7, edgeStart: 0.93, urbanBias: 0.62,
    palette: {
      grass: [0x56624c, 0x4c5741, 0x616a52],
      dirt: [0x665a43, 0x5b503c, 0x71644a],
      rock: [0x696a65, 0x5c5e59, 0x767873],
      urban: [0x545956, 0x5e625e, 0x4a4e4c],
    },
  },
  forest: {
    amp: 5.6, scale: 0.0135, boundaryAmp: 36, edgeStart: 0.90, urbanBias: 0.03,
    palette: {
      grass: [0x4a5a36, 0x55673d, 0x425232, 0x627348],
      dirt: [0x61513a, 0x6d5c42, 0x54462f],
      rock: [0x686a61, 0x595c55, 0x76786f],
      urban: [0x53584e, 0x5d6357, 0x4a4f46],
    },
  },
  port: {
    amp: 1.9, scale: 0.017, boundaryAmp: 9, edgeStart: 0.93, urbanBias: 0.78,
    palette: {
      grass: [0x566149, 0x4e5a41, 0x616b51],
      dirt: [0x5f5a4b, 0x6a6452, 0x544f40],
      rock: [0x646965, 0x585d59, 0x70756f],
      urban: [0x4b5150, 0x555b59, 0x434947],
    },
  },
  snow: {
    amp: 7.2, scale: 0.012, boundaryAmp: 46, edgeStart: 0.90, urbanBias: 0.02,
    palette: {
      grass: [0xc9d6dc, 0xd6e2e7, 0xbfcdd4, 0xe2ecf0],
      dirt: [0x7a7567, 0x6b6659, 0x8a8576],
      rock: [0x606c72, 0x555f66, 0x6f7b81],
      urban: [0x8b9498, 0x969fa3, 0x7d868a],
    },
  },
  farm: {
    amp: 3.8, scale: 0.0095, boundaryAmp: 34, edgeStart: 0.91, urbanBias: 0.08,
    palette: {
      grass: [0x6a6d3c, 0x747744, 0x5e6236, 0x82854f, 0x8c8650],
      dirt: [0x776447, 0x6a593f, 0x867252],
      rock: [0x6b6a60, 0x5d5c54, 0x7a786d],
      urban: [0x66645a, 0x716e62, 0x59574e],
    },
  },
  city: {
    amp: 2.3, scale: 0.018, boundaryAmp: 10, edgeStart: 0.93, urbanBias: 0.82,
    palette: {
      grass: [0x505c46, 0x59664d, 0x47523e],
      dirt: [0x5e594c, 0x6a6456, 0x524d42],
      rock: [0x646864, 0x585c58, 0x70746f],
      urban: [0x454a4c, 0x4e5355, 0x3d4244, 0x575c5d],
    },
  },
};

const SKY = {
  factory: { top: '#081019', horizon: '#25343c', sun: '#cfe4ff', sunStrength: 0.2, cloud: ['#17242c', '#223039', '#2c3b44'], clouds: 22, stars: 150, sunPos: [0.64, 0.36] },
  forest: { top: '#5f86ad', horizon: '#c9d4c6', sun: '#fff0c8', sunStrength: 0.8, cloud: ['#e4ece6', '#ccd6cc', '#b7c4bb'], clouds: 26, stars: 0, sunPos: [0.28, 0.33] },
  port: { top: '#1d2b3b', horizon: '#c98d60', sun: '#ffc27c', sunStrength: 0.65, cloud: ['#3e4a54', '#5b5e61', '#746253'], clouds: 20, stars: 25, sunPos: [0.7, 0.41] },
  snow: { top: '#8499a9', horizon: '#dfe7ea', sun: '#f6fbff', sunStrength: 0.28, cloud: ['#c3ced4', '#d5dee3', '#aebbc2'], clouds: 34, stars: 0, sunPos: [0.5, 0.31] },
  farm: { top: '#6289b6', horizon: '#e7d3a2', sun: '#ffe3a8', sunStrength: 0.9, cloud: ['#f0e8d2', '#dbd4be', '#c6c7b6'], clouds: 24, stars: 0, sunPos: [0.32, 0.35] },
  city: { top: '#2c3741', horizon: '#9aa3a9', sun: '#d7e0e6', sunStrength: 0.35, cloud: ['#5e686f', '#707a80', '#4f5961'], clouds: 30, stars: 15, sunPos: [0.56, 0.34] },
};



const ZONE_LOOT_WEIGHTS = {
  high: [['safe', 24], ['weapon_box', 24], ['locker', 16], ['ammo_crate', 12], ['med_box', 12], ['crate', 12]],
  mid: [['crate', 26], ['locker', 18], ['weapon_box', 12], ['med_box', 10], ['toolbox', 14], ['duffle', 12], ['ammo_crate', 8]],
  low: [['crate', 34], ['toolbox', 22], ['duffle', 24], ['med_box', 10], ['ammo_crate', 6], ['locker', 4]],
};

const ZONE_TIER_INFO = {
  high: { name: '高价值', color: '#e6c06a', hex: 0xd9b14e, log: 'gold' },
  mid: { name: '中价值', color: '#87b7e2', hex: 0x6fa9d8, log: '' },
  low: { name: '低价值', color: '#b7c0c6', hex: 0x9aa4ad, log: '' },
};


function segIntersectsRect(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
  const dx = bx - ax;
  const dz = bz - az;
  let tmin = 0, tmax = 1;
  const axes = [
    [ax, dx, minX, maxX],
    [az, dz, minZ, maxZ],
  ];
  for (const [origin, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (origin < lo || origin > hi) return false;
    } else {
      let t1 = (lo - origin) / d;
      let t2 = (hi - origin) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

function heuristic(cx, cy, gx, gy) {
  const dx = Math.abs(cx - gx);
  const dy = Math.abs(cy - gy);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

// 极简二叉堆（节点为整数索引，f 值从数组读取）
class MinHeap {
  constructor(scores) {
    this.arr = [];
    this.scores = scores;
  }
  push(v) {
    const a = this.arr;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[a[p]] <= this.scores[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.arr;
    if (!a.length) return -1;
    const top = a[0];
    const last = a.pop();
    if (a.length && last !== undefined) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.scores[a[l]] < this.scores[a[m]]) m = l;
        if (r < a.length && this.scores[a[r]] < this.scores[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.arr.length; }
}

export class World {
  constructor(scene, mapId, seed, assets = null) {
    this.scene = scene;
    this.assets = assets;
    this.envRT = null;
    this.mapId = mapId;
    this.map = MAPS[mapId];
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.theme = THEMES[this.map.theme] || THEMES.factory;

    this.group = new THREE.Group();
    this.group.name = 'world';
    this.colliders = [];
    this.blockingColliders = [];
    this.hittables = [];
    this.containers = [];
    this.extracts = [];
    this.lights = [];
    this.materials = new Map();
    this.raycaster = new THREE.Raycaster();
    this.nav = null;
    this.dust = null;

    scene.add(this.group);
    this.half = this.map.size / 2;
    this._baseY = null;
    this.flattenZones = [];
    this.zones = [];
    this.structureZones = [];

    this.initTerrain();
    this.setupEnvironment();
    this.initVegetation();
    this.addKeyFlattenZones();
    this.buildLayout();
    this.buildBoundary();
    this.buildTerrainMesh();
    this.buildBoundaryScenery();
    this.buildZoneMarkers();
    this.buildVegetation();
    this.placeLootContainers();
    this.buildNav();
    this.buildExtracts();
    this.buildDust();

    this.blockingColliders = this.colliders.filter((c) => c.top >= 1.15);
  }

  // ────────── 地形噪声 ──────────

  initTerrain() {
    this.terrainCfg = TERRAIN[this.map.theme] || TERRAIN.factory;
    this.skyCfg = SKY[this.map.theme] || SKY.factory;
    this.perm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = base[i];
      base[i] = base[j];
      base[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = base[i & 255];
  }

  smoothstep(a, b, t) {
    const x = clamp((t - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  }

  noise2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);
    const p = this.perm;
    const a = p[(p[xi & 255] + zi) & 255];
    const b = p[(p[(xi + 1) & 255] + zi) & 255];
    const c = p[(p[xi & 255] + zi + 1) & 255];
    const d = p[(p[(xi + 1) & 255] + zi + 1) & 255];
    return (((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) / 255) * 2 - 1;
  }

  fbm(x, z, oct = 4) {
    let total = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1;
    for (let i = 0; i < oct; i++) {
      total += this.noise2(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.05;
    }
    return total / norm;
  }

  rawHeight(x, z) {
    const c = this.terrainCfg;
    let h = this.fbm(x * c.scale, z * c.scale, 4) * c.amp;
    h += this.fbm(x * 0.0032 + 3.7, z * 0.0032 - 1.4, 2) * c.amp * 1.35;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    if (edge > c.edgeStart) {
      const k = Math.min(1, (edge - c.edgeStart) / (1 - c.edgeStart));
      const rough = 0.72 + 0.55 * (this.noise2(x * 0.045, z * 0.045) * 0.5 + 0.5);
      h += Math.pow(k, 1.35) * c.boundaryAmp * rough;
    }
    return h;
  }

  heightAt(x, z) {
    let h = this.rawHeight(x, z);
    for (const f of this.flattenZones) {
      const dx = Math.max(Math.abs(x - f.x) - f.w / 2, 0);
      const dz = Math.max(Math.abs(z - f.z) - f.d / 2, 0);
      const d = Math.hypot(dx, dz);
      if (d < f.feather) {
        const t = 1 - this.smoothstep(0, f.feather, d);
        h = h + (f.y - h) * t;
      }
    }
    return h;
  }

  slopeAt(x, z) {
    const d = 1.2;
    const dx = (this.heightAt(x + d, z) - this.heightAt(x - d, z)) / (2 * d);
    const dz = (this.heightAt(x, z + d) - this.heightAt(x, z - d)) / (2 * d);
    return Math.hypot(dx, dz);
  }

  addResourceZone(x, z, r, name, tier, count) {
    this.zones.push({ x, z, r, name, tier, count });
  }

  buildZoneMarkers() {
    for (const zone of this.zones) {
      const info = ZONE_TIER_INFO[zone.tier] || ZONE_TIER_INFO.low;
      const base = this.heightAt(zone.x, zone.z);
      const label = this.makeLabel(`${info.name}资源点 · ${zone.name}`, info.color);
      label.scale.set(6.2, 1.2, 1);
      label.position.set(zone.x, base + 11.5, zone.z);
      this.group.add(label);
      const beamMat = new THREE.MeshBasicMaterial({
        color: info.hex, transparent: true, opacity: 0.07,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15, 10, 1, true), beamMat);
      beam.position.set(zone.x, base + 7.5, zone.z);
      this.group.add(beam);
      zone.sprite = label;
      zone.beam = beam;
      zone.colorHex = info.hex;
    }
  }

  insideStructure(x, z, pad = 0) {
    for (const b of this.structureZones) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  zoneAt(x, z) {
    for (const zone of this.zones) {
      if (dist(x, z, zone.x, zone.z) <= zone.r) return zone;
    }
    return null;
  }

  addKeyFlattenZones() {
    // 出生点不再整平：避免在坡地上形成突兀的凸起平台。
    // 撤离点只做范围很大的柔和融合，让撤离圈附近平缓，但不会出现陡边。
    for (const e of this.map.extracts) {
      const ys = [
        this.rawHeight(e.x, e.z),
        this.rawHeight(e.x + 6, e.z),
        this.rawHeight(e.x - 6, e.z),
        this.rawHeight(e.x, e.z + 6),
        this.rawHeight(e.x, e.z - 6),
      ];
      const y = ys.reduce((a, b) => a + b, 0) / ys.length;
      this.flattenZones.push({ x: e.x, z: e.z, w: 14, d: 14, y, feather: 14 });
    }
  }

  /** 在指定点附近寻找一块天然平缓、可通行的出生位置（不做地形整平） */
  findFlatSpawnPosition(x, z) {
    let best = null;
    let bestScore = Infinity;
    for (let r = 0; r <= 26; r += 3.5) {
      const steps = r === 0 ? 1 : 16;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (Math.abs(px) > this.half - 5 || Math.abs(pz) > this.half - 5) continue;
        if (this.nav) {
          const c = this.nav.cellOf(px, pz);
          if (!this.nav.isFree(c.cx, c.cy)) continue;
        }
        if (this.insideStructure(px, pz, 1.5)) continue;
        const slope = this.slopeAt(px, pz);
        const score = slope * 12 + r * 0.05;
        if (score < bestScore) {
          bestScore = score;
          best = { x: px, z: pz };
        }
        if (slope < 0.18 && r <= 8) return { x: px, z: pz };
      }
    }
    return best || this.nearestFreePosition(x, z);
  }

  // ────────── 环境 ──────────

  mat(color) {
    const key = color >>> 0;
    if (!this.materials.has(key)) {
      const detailNormal = this.assets ? this.assets.materials.getDetailNormalTexture() : null;
      const material = new THREE.MeshStandardMaterial({
        color, map: this.structureTex || null, roughness: 0.93, metalness: 0.06,
        envMapIntensity: 0.55,
      });
      if (detailNormal) {
        material.normalMap = detailNormal;
        material.normalScale.set(0.32, 0.32);
      }
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  setupEnvironment() {
    const t = this.theme;
    const skyTex = this.makeSkyTexture();
    const horizon = new THREE.Color(this.skyCfg.horizon);
    this.scene.background = horizon;
    this.scene.fog = new THREE.Fog(horizon, t.fogNear, t.fogFar + this.map.size * 0.25);

    // 使用真实半球天空穹顶，避免背景盒贴图出现三角接缝
    const skyGeo = new THREE.SphereGeometry(380, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.57);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.sky = sky;

    // 用程序化天空生成 PMREM 环境反射，供金属/PBR 材质使用
    if (this.assets && this.assets.materials) {
      this.envRT = this.assets.materials.applyEnvironment(this.scene, skyTex);
      this.scene.environmentIntensity = 0.8;
      this.themeWallMaterial = this.assets.getTextureSet(this.map.theme + '_wall');
      this.themeGroundMaterial = this.assets.getTextureSet(this.map.theme + '_ground');
      this.themeRockMaterial = this.assets.getTextureSet(this.map.theme + '_rock');
    }

    const hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiInt);
    this.scene.add(hemi);
    this.lights.push(hemi);

    const dir = new THREE.DirectionalLight(t.dirColor, t.dirInt);
    // 高精度跟随阴影：阴影相机只覆盖玩家周围 40m，2048 贴图 → 约 4cm 精度
    const shadowSpan = 40;
    const dl = Math.hypot(t.dirPos[0], t.dirPos[1], t.dirPos[2]) || 1;
    this.sunDir = new THREE.Vector3(t.dirPos[0] / dl, t.dirPos[1] / dl, t.dirPos[2] / dl);
    dir.position.copy(this.sunDir).multiplyScalar(90);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -shadowSpan;
    dir.shadow.camera.right = shadowSpan;
    dir.shadow.camera.top = shadowSpan;
    dir.shadow.camera.bottom = -shadowSpan;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 220;
    dir.shadow.camera.updateProjectionMatrix();
    dir.shadow.bias = -0.00022;
    dir.shadow.normalBias = 0.022;
    dir.target.position.set(0, 0, 0);
    this.scene.add(dir.target);
    this.scene.add(dir);
    this.lights.push(dir);
    this.sun = dir;

    // 天空反弹补光，避免背光面纯黑
    const fill = new THREE.DirectionalLight(t.hemiSky, 0.65);
    fill.position.set(-t.dirPos[0], t.dirPos[1] * 0.4, -t.dirPos[2]);
    this.scene.add(fill);
    this.lights.push(fill);

    const ambient = new THREE.AmbientLight(0xffffff, 0.48);
    this.scene.add(ambient);
    this.lights.push(ambient);

    this.structureTex = this.makeStructureTexture();
  }

  makeStructureTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, 256, 256);
    const rng = mulberry32((this.seed ^ 0x3aa1c9e5) >>> 0);
    for (let i = 0; i < 900; i++) {
      const x = rng() * 256, y = rng() * 256;
      const v = 130 + Math.floor(rng() * 110);
      ctx.fillStyle = `rgba(${v},${v},${v},${(0.05 + rng() * 0.14).toFixed(2)})`;
      ctx.fillRect(x, y, 1 + rng() * 5, 1 + rng() * 5);
    }
    ctx.strokeStyle = 'rgba(70,70,66,0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const x = rng() * 256, y = rng() * 256;
      ctx.strokeRect(x, y, 30 + rng() * 90, 20 + rng() * 80);
    }
    ctx.strokeStyle = 'rgba(40,40,38,0.2)';
    for (let i = 0; i < 12; i++) {
      let x = rng() * 256, y = rng() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (rng() - 0.5) * 50;
        y += (rng() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.5);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  makeSkyTexture() {
    const cfg = this.skyCfg;
    const w = 1024, h = 512;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const skyRng = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, cfg.top);
    grad.addColorStop(0.42, cfg.horizon);
    grad.addColorStop(0.52, cfg.horizon);
    grad.addColorStop(1, '#0c1012');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 星星（夜/黄昏）
    for (let i = 0; i < cfg.stars; i++) {
      const x = skyRng() * w;
      const y = skyRng() * h * 0.4;
      const a = 0.25 + skyRng() * 0.6;
      ctx.fillStyle = `rgba(235,245,255,${a.toFixed(2)})`;
      ctx.fillRect(x, y, 1 + (skyRng() > 0.9 ? 1 : 0), 1);
    }

    // 云层（避开天顶极点与经度接缝，减少贴图拉伸）
    for (let i = 0; i < cfg.clouds; i++) {
      const cx = skyRng() * w;
      const cy = h * (0.18 + skyRng() * 0.26);
      const cw = 44 + skyRng() * 150;
      const ch = 12 + skyRng() * 38;
      const col = cfg.cloud[Math.floor(skyRng() * cfg.cloud.length)];
      const puffs = 3 + Math.floor(skyRng() * 4);
      for (let j = 0; j < puffs; j++) {
        const px = cx + (skyRng() - 0.5) * cw;
        const py = cy + (skyRng() - 0.5) * ch * 0.6;
        const r = cw * (0.18 + skyRng() * 0.25);
        for (const wrap of [0, -w, w]) {
          const wx = px + wrap;
          if (wx < -r * 2 || wx > w + r * 2) continue;
          const g = ctx.createRadialGradient(wx, py, 0, wx, py, r);
          g.addColorStop(0, col);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.12 + skyRng() * 0.18;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(wx, py, r, r * (0.35 + skyRng() * 0.2), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // 太阳/月晕
    if (cfg.sunStrength > 0.1) {
      const sx = cfg.sunPos[0] * w;
      const sy = cfg.sunPos[1] * h;
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, 190);
      halo.addColorStop(0, cfg.sun);
      halo.addColorStop(0.12, `rgba(255,255,255,${(cfg.sunStrength * 0.45).toFixed(2)})`);
      halo.addColorStop(0.55, `rgba(255,255,255,${(cfg.sunStrength * 0.09).toFixed(2)})`);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sx - 200, sy - 200, 400, 400);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = cfg.sun;
      ctx.beginPath();
      ctx.arc(sx, sy, 9 + cfg.sunStrength * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 地平线雾霾
    const haze = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.52);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.75, 'rgba(255,255,255,0.12)');
    haze.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.42, w, h * 0.12);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ────────── 地形网格与边界 ──────────

  buildTerrainMesh() {
    const size = this.map.size * 1.5;
    const seg = Math.min(230, Math.max(80, Math.floor(this.map.size / 2.5)));
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      const col = this.terrainColor(x, z);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = this.makeTerrainDetailTexture();
    tex.repeat.set(this.map.size / 5.5, this.map.size / 5.5);
    let mat;
    if (this.themeGroundMaterial) {
      mat = this.themeGroundMaterial;
      mat.vertexColors = true;
      mat.needsUpdate = true;
      if (!mat.normalMap && this.assets) {
        mat.normalMap = this.assets.materials.getDetailNormalTexture();
        mat.normalScale.set(0.4, 0.4);
      }
      mat.envMapIntensity = 0.35;
    } else {
      mat = new THREE.MeshStandardMaterial({
        map: tex, vertexColors: true, roughness: 1.0, metalness: 0,
        envMapIntensity: 0.35,
      });
      if (this.assets) {
        mat.normalMap = this.assets.materials.getDetailNormalTexture();
        mat.normalScale.set(0.42, 0.42);
      }
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.hittables.push(mesh);
    this.ground = mesh;
  }

  terrainColor(x, z) {
    const cfg = this.terrainCfg;
    const slope = this.slopeAt(x, z);
    const n = this.noise2(x * 0.09, z * 0.09) * 0.5 + 0.5;
    const n2 = this.noise2(x * 0.41 + 8.1, z * 0.41 - 3.3) * 0.5 + 0.5;
    const urban = n < (cfg.urbanBias || 0.4);
    const arr = urban ? cfg.palette.urban : cfg.palette.grass;
    const baseHex = arr[Math.floor(n2 * arr.length) % arr.length];
    const col = new THREE.Color(baseHex);
    const dirtArr = cfg.palette.dirt;
    const rockArr = cfg.palette.rock;
    const dirt = new THREE.Color(dirtArr[Math.floor(n2 * 9) % dirtArr.length]);
    const rock = new THREE.Color(rockArr[Math.floor(n2 * 7) % rockArr.length]);
    const dirtMix = this.smoothstep(0.32, 0.72, slope) * 0.82;
    const rockMix = this.smoothstep(0.72, 1.25, slope);
    col.lerp(dirt, dirtMix);
    col.lerp(rock, rockMix);
    const shade = 0.9 + n2 * 0.16 + clamp(this.heightAt(x, z) * 0.004, -0.05, 0.08);
    col.multiplyScalar(shade);
    return col;
  }

  makeTerrainDetailTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, 0, 256, 256);
    const rng = mulberry32((this.seed ^ 0x51ed270b) >>> 0);
    for (let i = 0; i < 2600; i++) {
      const x = rng() * 256;
      const y = rng() * 256;
      const s = 0.6 + rng() * 2.8;
      const v = 165 + Math.floor(rng() * 90);
      ctx.fillStyle = `rgba(${v},${v},${v},${(0.12 + rng() * 0.3).toFixed(2)})`;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = 'rgba(70,72,68,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      let x = rng() * 256;
      let y = rng() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rng() - 0.5) * 44;
        y += (rng() - 0.5) * 44;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  makeRockTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#8b8b84';
    ctx.fillRect(0, 0, 256, 256);
    const rng = mulberry32((this.seed ^ 0x2f83b7d1) >>> 0);
    for (let i = 0; i < 2200; i++) {
      const x = rng() * 256, y = rng() * 256;
      const s = 1 + rng() * 5;
      const v = 100 + Math.floor(rng() * 110);
      ctx.fillStyle = `rgba(${v},${v},${v - 5},${(0.08 + rng() * 0.2).toFixed(2)})`;
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = 'rgba(30,30,28,0.28)';
    for (let i = 0; i < 16; i++) {
      let x = rng() * 256, y = rng() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rng() - 0.5) * 70;
        y += (rng() - 0.5) * 70;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  buildBoundaryScenery() {
    const cliffGeo = new THREE.IcosahedronGeometry(1, 2);
    const cp = cliffGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const n = 1 + this.noise2(x * 2.7 + 5, z * 2.7 - 2) * 0.32 + this.noise2(y * 3.1, x * 2.2) * 0.2;
      cp.setXYZ(i, x * n, y * (1 + n * 0.36), z * n);
    }
    cliffGeo.computeVertexNormals();
    const rockTex = this.makeRockTexture();
    const rockBase = this.terrainCfg.palette.rock[0];
    const cliffNormal = this.assets ? this.assets.materials.getDetailNormalTexture() : null;
    let cliffMat;
    let cliffMatDark;
    if (this.themeRockMaterial) {
      cliffMat = this.themeRockMaterial;
      cliffMatDark = this.themeRockMaterial.clone();
      cliffMatDark.color.multiplyScalar(0.82);
      cliffMat.envMapIntensity = 0.3;
      cliffMatDark.envMapIntensity = 0.3;
    } else {
      cliffMat = new THREE.MeshStandardMaterial({ map: rockTex, color: new THREE.Color(rockBase).multiplyScalar(1.25), roughness: 1, metalness: 0.02, flatShading: true, envMapIntensity: 0.3 });
      cliffMatDark = new THREE.MeshStandardMaterial({ map: rockTex, color: new THREE.Color(rockBase).multiplyScalar(0.9), roughness: 1, metalness: 0.02, flatShading: true, envMapIntensity: 0.3 });
      if (cliffNormal) {
        cliffMat.normalMap = cliffNormal;
        cliffMat.normalScale.set(0.65, 0.65);
        cliffMatDark.normalMap = cliffNormal;
        cliffMatDark.normalScale.set(0.65, 0.65);
      }
    }

    const naturalTheme = ['forest', 'snow', 'farm'].includes(this.map.theme);

    // 边界岩石沿方形地图四条边布置（而不是圆形，避免侵入边缘出生点）
    const edge = this.half * 0.985;
    const perEdge = Math.max(15, Math.ceil(this.map.size / 20));
    const spots = [];
    for (const side of ['n', 's', 'e', 'w']) {
      for (let i = 0; i < perEdge; i++) {
        const t = -this.half * 0.96 + ((i + 0.4) / perEdge) * this.half * 1.92;
        const out = this.half * (naturalTheme ? (1.01 + this.rng() * 0.05) : (1.075 + this.rng() * 0.06));
        let x, z;
        if (side === 'n') { x = t; z = -out; }
        else if (side === 's') { x = t; z = out; }
        else if (side === 'e') { x = out; z = t; }
        else { x = -out; z = t; }
        let nearKey = false;
        for (const k of [...this.map.spawns, ...this.map.extracts]) {
          if (dist(x, z, k.x, k.z) < 28) { nearKey = true; break; }
        }
        if (!nearKey) spots.push({ x, z });
      }
    }
    for (const p of spots) {
      const sizeMul = naturalTheme ? 1 : 0.62;
      const sx = randRange(this.rng, 9, 22) * sizeMul;
      const sy = randRange(this.rng, 10, 26) * sizeMul;
      const sz = randRange(this.rng, 7, 16) * sizeMul;
      const mesh = new THREE.Mesh(cliffGeo, this.rng() < 0.5 ? cliffMat : cliffMatDark);
      mesh.position.set(p.x, this.heightAt(p.x, p.z) + sy * 0.08, p.z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(randRange(this.rng, -0.25, 0.25), this.rng() * Math.PI * 2, randRange(this.rng, -0.18, 0.18));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.hittables.push(mesh);
      // 次级碎岩，增加山体层次
      const s2 = randRange(this.rng, 3, 8);
      const m2 = new THREE.Mesh(cliffGeo, cliffMatDark);
      m2.position.set(p.x + randRange(this.rng, -9, 9), this.heightAt(p.x, p.z) + s2 * 0.08, p.z + randRange(this.rng, -9, 9));
      m2.scale.set(s2 * 1.1, s2, s2 * 0.8);
      m2.rotation.y = this.rng() * Math.PI;
      m2.castShadow = true;
      m2.receiveShadow = true;
      this.group.add(m2);
      this.hittables.push(m2);
    }

    const isNatural = naturalTheme;
    if (!isNatural) {
      this.buildIndustrialBoundary(cliffGeo, cliffMat, cliffMatDark);
      return;
    }
    // 内圈可见屏障：与物理边界基本贴合，玩家先撞到看得见的岩壁/围墙
    const inner = this.half * 0.984;
    const barrierCount = Math.ceil(this.map.size / 8);
    for (const side of ['n', 's', 'e', 'w']) {
      for (let i = 0; i < barrierCount; i++) {
        const t = -this.half * 0.99 + ((i + 0.5) / barrierCount) * this.half * 1.98;
        let x, z;
        if (side === 'n') { x = t; z = -inner; }
        else if (side === 's') { x = t; z = inner; }
        else if (side === 'e') { x = inner; z = t; }
        else { x = -inner; z = t; }
        let nearKey = false;
        for (const k of [...this.map.spawns, ...this.map.extracts]) {
          if (dist(x, z, k.x, k.z) < 11) { nearKey = true; break; }
        }
        if (nearKey) continue;
        if (isNatural) {
          const sx = randRange(this.rng, 12, 20);
          const sy = randRange(this.rng, 8, 17);
          const sz = randRange(this.rng, 8, 13);
          const mesh = new THREE.Mesh(cliffGeo, cliffMatDark);
          mesh.position.set(x, this.heightAt(x, z) + sy * 0.08, z);
          mesh.scale.set(sx, sy, sz);
          mesh.rotation.y = this.rng() * Math.PI;
          this.group.add(mesh);
          this.hittables.push(mesh);
          this.colliders.push({
            minX: x - sx * 0.45, maxX: x + sx * 0.45,
            minZ: z - sz * 0.45, maxZ: z + sz * 0.45,
            h: sy, top: sy, y0: 0,
          });
        } else {
          const along = (this.map.size / barrierCount) + 1.5;
          const w = (side === 'n' || side === 's') ? along : 2.8;
          const d = (side === 'n' || side === 's') ? 2.8 : along;
          const hh = randRange(this.rng, 7, 12);
          this.addBox(x, z, w, d, hh, this.theme.wall, { collide: true });
        }
      }
    }

    // 连续可见边界墙：贴着物理边界内缘，玩家会先看到并撞到它
    const wallLine = this.half - 2.4;
    const wallCount = Math.ceil(this.map.size / 8);
    const naturalWall = true;
    for (const side of ['n', 's', 'e', 'w']) {
      for (let i = 0; i < wallCount; i++) {
        const t = -this.half * 0.985 + ((i + 0.5) / wallCount) * this.half * 1.97;
        let x, z;
        if (side === 'n') { x = t; z = -wallLine; }
        else if (side === 's') { x = t; z = wallLine; }
        else if (side === 'e') { x = wallLine; z = t; }
        else { x = -wallLine; z = t; }
        let nearKey = false;
        for (const k of [...this.map.spawns, ...this.map.extracts]) {
          if (dist(x, z, k.x, k.z) < 5) { nearKey = true; break; }
        }
        if (nearKey) continue;
        if (naturalWall) {
          const sx = randRange(this.rng, 7.5, 10.5);
          const sy = randRange(this.rng, 7, 12);
          const sz = randRange(this.rng, 3.2, 4.8);
          const mesh = new THREE.Mesh(cliffGeo, cliffMat);
          mesh.position.set(x, this.heightAt(x, z) + sy * 0.1, z);
          mesh.scale.set(sx, sy, sz);
          mesh.rotation.y = (side === 'n' || side === 's') ? 0 : Math.PI / 2;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.group.add(mesh);
          this.hittables.push(mesh);
          const hx = (side === 'n' || side === 's') ? 3.8 : 1.8;
          const hz = (side === 'n' || side === 's') ? 1.8 : 3.8;
          this.colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h: sy, top: sy, y0: 0 });
        } else {
          const along = (this.map.size / wallCount) + 2;
          const w = (side === 'n' || side === 's') ? along : 2.6;
          const d = (side === 'n' || side === 's') ? 2.6 : along;
          const hh = randRange(this.rng, 7.5, 12);
          this.addBox(x, z, w, d, hh, this.theme.wall, { collide: true });
        }
      }
    }

    // 主题边界：树线
    const treeLine = true;
    if (treeLine) {
      const inset = this.half * 0.935;
      const perSide = Math.max(28, Math.ceil(this.map.size / 18));
      for (const side of ['n', 's', 'e', 'w']) {
        for (let i = 0; i < perSide; i++) {
          const t = -this.half * 0.94 + ((i + 0.5) / perSide) * this.half * 1.88;
          let x, z;
          if (side === 'n') { x = t; z = -inset - this.rng() * 5; }
          else if (side === 's') { x = t; z = inset + this.rng() * 5; }
          else if (side === 'e') { x = inset + this.rng() * 5; z = t; }
          else { x = -inset - this.rng() * 5; z = t; }
          let nearKey = false;
          for (const k of [...this.map.spawns, ...this.map.extracts]) {
            if (dist(x, z, k.x, k.z) < 26) { nearKey = true; break; }
          }
          if (nearKey) continue;
          if (this.slopeAt(x, z) > 1.25) continue;
          if (this.map.theme === 'snow') {
            this.addPineTree(x, z, randRange(this.rng, 1.15, 1.9), { snow: true });
          } else if (this.map.theme === 'forest' && this.rng() < 0.55) {
            this.addBroadleafTree(x, z, randRange(this.rng, 1.1, 1.8));
          } else if (this.map.theme === 'farm') {
            this.addBroadleafTree(x, z, randRange(this.rng, 1.1, 1.7));
          } else {
            this.addPineTree(x, z, randRange(this.rng, 1.15, 1.9));
          }
        }
      }
    }
  }

  makeChainLinkTexture() {
    if (this._chainLinkTex) return this._chainLinkTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(150, 160, 165, 0.9)';
    ctx.lineWidth = 2;
    for (let i = -128; i < 256; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 128, 0); ctx.lineTo(i, 128); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    this._chainLinkTex = tex;
    return tex;
  }

  /** 工业/港口/城区边界：围栏 + 外侧仓库/集装箱/废墟天际线，替代生硬的方盒子墙。 */
  buildIndustrialBoundary(cliffGeo, cliffMat, cliffMatDark) {
    const theme = this.map.theme;
    const half = this.half;
    const fenceMat = new THREE.MeshStandardMaterial({
      map: this.makeChainLinkTexture(), transparent: true, alphaTest: 0.25,
      side: THREE.DoubleSide, roughness: 0.8, metalness: 0.3, depthWrite: false,
    });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4b5155, roughness: 0.6, metalness: 0.5 });
    const segLen = 12;
    const line = half - 0.9;
    const count = Math.ceil(this.map.size / segLen);
    const industrialColor = 0x3c4245;
    const sides = ['n', 's', 'e', 'w'];
    const along = (i) => -half * 0.985 + ((i + 0.5) / count) * half * 1.97;
    const posFor = (side, t, inset) => {
      if (side === 'n') return { x: t, z: -inset };
      if (side === 's') return { x: t, z: inset };
      if (side === 'e') return { x: inset, z: t };
      return { x: -inset, z: t };
    };
    const nearKey = (x, z, r = 16) => this.map.spawns.some((k) => dist(x, z, k.x, k.z) < r)
      || this.map.extracts.some((k) => dist(x, z, k.x, k.z) < r);

    for (const side of sides) {
      for (let i = 0; i < count; i++) {
        const t = along(i);
        const p = posFor(side, t, line);
        if (nearKey(p.x, p.z, 8)) continue;
        const y = this.heightAt(p.x, p.z);

        // 内侧低矮混凝土路障/碎石，提供近景层次
        if (i % 3 === 0) {
          const bw = randRange(this.rng, 2.2, 3.4);
          const bh = randRange(this.rng, 0.8, 1.2);
          this.addBox(p.x, p.z, bw, 1.2, bh, 0x6b6f6e, { collide: false, hittable: false });
          if (theme === 'city') {
            for (let k = 0; k < 3; k++) {
              this.addBox(p.x + randRange(this.rng, -2, 2), p.z + randRange(this.rng, -2, 2), 1.2, 1.2, 0.8, 0x5a5c57, { collide: false, hittable: false });
            }
          }
        }

        // 围栏：立柱 + 半透明菱形网
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.12), postMat);
        post.position.set(p.x, y + 1.6, p.z);
        post.castShadow = true;
        this.group.add(post);
        this.hittables.push(post);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.98, 0.06, 0.06), postMat);
        if (side === 'n' || side === 's') {
          rail.position.set(p.x, y + 3.1, p.z);
        } else {
          rail.rotation.y = Math.PI / 2;
          rail.position.set(p.x, y + 3.1, p.z);
        }
        this.group.add(rail);
        const fence = new THREE.Mesh(new THREE.PlaneGeometry(segLen * 0.97, 3.0), fenceMat);
        if (side === 'n' || side === 's') {
          fence.position.set(p.x, y + 1.55, p.z);
        } else {
          fence.rotation.y = Math.PI / 2;
          fence.position.set(p.x, y + 1.55, p.z);
        }
        this.group.add(fence);
        if (side === 'n' || side === 's') {
          this.colliders.push({ minX: p.x - segLen / 2, maxX: p.x + segLen / 2, minZ: p.z - 0.15, maxZ: p.z + 0.15, h: 3.2, top: 3.2, y0: 0 });
        } else {
          this.colliders.push({ minX: p.x - 0.15, maxX: p.x + 0.15, minZ: p.z - segLen / 2, maxZ: p.z + segLen / 2, h: 3.2, top: 3.2, y0: 0 });
        }

        // 外侧主题天际线：仓库 / 集装箱 / 废墟楼
        if (i % 2 === 1) {
          const out = half + randRange(this.rng, 2, 10);
          const q = posFor(side, t + randRange(this.rng, -4, 4), out);
          const gy = this.heightAt(q.x, q.z);
          const rot = (side === 'n' || side === 's') ? 0 : Math.PI / 2;
          if (theme === 'factory') {
            if (i % 6 === 1) {
              const hh = randRange(this.rng, 7, 14);
              this.addBox(q.x, q.z, randRange(this.rng, 14, 26), randRange(this.rng, 8, 13), hh, industrialColor, { y0: 0, collide: false });
            } else if (i % 6 === 3) {
              this.addShipContainer(q.x, q.z, 0x6d4a32, false);
              this.addBox(q.x, q.z, 6.0, 2.6, 2.6, 0x40525a, { y0: 2.6, collide: false });
            } else {
              const hh = randRange(this.rng, 3, 7);
              this.addBox(q.x, q.z, randRange(this.rng, 5, 10), randRange(this.rng, 4, 8), hh, 0x51565a, { collide: false });
              this.addCylinder(q.x + randRange(this.rng, -8, 8), q.z + randRange(this.rng, -6, 6), randRange(this.rng, 1.2, 2.0), randRange(this.rng, 10, 24), 0x34393c, { segments: 10, collide: false });
            }
          } else if (theme === 'port') {
            const stack = i % 6 === 1 ? 3 : 2;
            const colors = [0x6d4a32, 0x3f5c4b, 0x4a5560, 0x6e5f3c];
            for (let k = 0; k < stack; k++) {
              this.addBox(q.x, q.z, 6.0, 2.6, 2.6, pick(this.rng, colors), { y0: k * 2.6, collide: false });
            }
            if (i % 8 === 3) this.addCylinder(q.x + 10, q.z + 4, 0.8, 24, 0x7b5b24, { segments: 8, collide: false });
          } else {
            // city：残破楼体 + 窗户 + 瓦砾
            const w = randRange(this.rng, 10, 18);
            const d = randRange(this.rng, 8, 12);
            const hh = randRange(this.rng, 7, 18);
            this.addBox(q.x, q.z, w, d, hh, 0x4b4d49, { collide: false });
            for (let wy = 0; wy < Math.floor(hh / 3); wy++) {
              for (let wx = -1; wx <= 1; wx++) {
                this.addBox(q.x + wx * (w * 0.24), q.z, 1.4, 0.1, 1.6, 0x14181b, {
                  y0: 2 + wy * 3, collide: false, hittable: false,
                });
              }
            }
            if (i % 4 === 1) {
              for (let k = 0; k < 4; k++) {
                this.addBox(q.x + randRange(this.rng, -6, 6), q.z - 4 + randRange(this.rng, 0, 3), 1.6, 1.2, 0.7, 0x5a5c57, { collide: false, hittable: false });
              }
            }
          }
        }
      }
    }

    // 四角瞭望塔/地标
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = sx * (half + 8);
      const z = sz * (half + 8);
      const y = this.heightAt(x, z);
      if (theme === 'city') {
        this.addBox(x, z, 18, 14, 18, 0x444743, { collide: false });
        this.addBox(x, z, 14, 10, 12, 0x3d3f3b, { y0: 18, collide: false });
      } else {
        for (const px of [-2.2, 2.2]) {
          for (const pz of [-2.2, 2.2]) {
            this.addCylinder(x + px, z + pz, 0.22, 13, 0x40372a, { segments: 8, collide: false });
          }
        }
        this.addBox(x, z, 6.6, 6.0, 0.6, 0x4a3f2b, { y0: 12.6, collide: false });
        this.addBox(x, z, 5.2, 4.6, 2.6, 0x3b3225, { y0: 13.2, collide: false });
      }
    }
  }

  makeGroundTexture() {
    const t = this.theme.ground;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = t.base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const x = this.rng() * 256, y = this.rng() * 256;
      const s = 1 + this.rng() * 3.5;
      ctx.fillStyle = pick(this.rng, t.specks);
      ctx.globalAlpha = 0.25 + this.rng() * 0.55;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    // 裂缝
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = this.rng() * 256, y = this.rng() * 256;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (this.rng() - 0.5) * 40;
        y += (this.rng() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // 网格缝
    ctx.strokeStyle = t.lines;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.map.size / 7, this.map.size / 7);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  // ────────── 基础几何 ──────────

  addBox(x, z, w, d, h, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = opts.material || this.mat(color);
    const mesh = new THREE.Mesh(geo, mat);
    const y0 = opts.y0 || 0;
    const base = opts.baseY != null ? opts.baseY : (this._baseY != null ? this._baseY : this.heightAt(x, z));
    mesh.position.set(x, base + y0 + h / 2, z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    this.group.add(mesh);
    if (opts.collide !== false) {
      this.colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
        h: y0 + h, top: y0 + h, y0,
      });
    }
    if (opts.hittable !== false) this.hittables.push(mesh);
    return mesh;
  }

  addCylinder(x, z, radius, h, color, opts = {}) {
    const geo = new THREE.CylinderGeometry(radius, radius * (opts.taper || 1), h, opts.segments || 10);
    const mesh = new THREE.Mesh(geo, opts.material || this.mat(color));
    const y0 = opts.y0 || 0;
    const base = opts.baseY != null ? opts.baseY : (this._baseY != null ? this._baseY : this.heightAt(x, z));
    mesh.position.set(x, base + y0 + h / 2, z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (opts.collide !== false) {
      this.colliders.push({
        minX: x - radius, maxX: x + radius,
        minZ: z - radius, maxZ: z + radius,
        h: y0 + h, top: y0 + h, y0,
      });
    }
    if (opts.hittable !== false) this.hittables.push(mesh);
    return mesh;
  }

  addBarrel(x, z, color = 0x5a4a33) {
    this.addCylinder(x, z, 0.42, 1.05, color, { segments: 12 });
  }

  addCrateObstacle(x, z, w = 1.6, d = 1.2, h = 1.1, color = null) {
    const c = color || pick(this.rng, this.theme.propColors);
    this.addBox(x, z, w, d, h, c);
  }

  addBuilding(cx, cz, w, d, h, opts = {}) {
    const baseY = this.heightAt(cx, cz);
    this.structureZones.push({ minX: cx - w / 2 - 0.8, maxX: cx + w / 2 + 0.8, minZ: cz - d / 2 - 0.8, maxZ: cz + d / 2 + 0.8 });
    this.flattenZones.push({ x: cx, z: cz, w: w + 7, d: d + 7, y: baseY, feather: 5 });
    const prevBaseY = this._baseY;
    this._baseY = baseY;
    const t = this.theme;
    const color = opts.color != null ? opts.color : t.wall;
    const roofColor = t.roof;
    const doors = opts.doors || ['n', 's'];
    const wallT = 0.7;
    const gap = 3.8;
    const hw = w / 2, hd = d / 2;

    const seg = (x, z, sw, sd) => {
      if (sw <= 0.05 || sd <= 0.05) return;
      this.addBox(x, z, sw, sd, h, color, { material: this.themeWallMaterial || undefined });
    };
    const sideLen = (len) => (len - gap) / 2;

    // 北 / 南墙（沿 X）
    for (const side of ['n', 's']) {
      const z = side === 'n' ? cz - hd : cz + hd;
      if (doors.includes(side)) {
        const len = sideLen(w);
        seg(cx - gap / 2 - len / 2, z, len, wallT);
        seg(cx + gap / 2 + len / 2, z, len, wallT);
      } else {
        seg(cx, z, w + wallT, wallT);
      }
    }
    // 东 / 西墙（沿 Z）
    for (const side of ['e', 'w']) {
      const x = side === 'e' ? cx + hw : cx - hw;
      if (doors.includes(side)) {
        const len = sideLen(d);
        seg(x, cz - gap / 2 - len / 2, wallT, len);
        seg(x, cz + gap / 2 + len / 2, wallT, len);
      } else {
        seg(x, cz, wallT, d + wallT);
      }
    }

    // 屋顶
    if (opts.roof !== false) {
      const roof = this.addBox(cx, cz, w + 1.0, d + 1.0, 0.35, roofColor, { y0: h, collide: false });
      // 屋顶边梁
      this.addBox(cx, cz - hd, w + 1.4, 0.25, 0.55, t.accent, { y0: h, collide: false });
      this.addBox(cx, cz + hd, w + 1.4, 0.25, 0.55, t.accent, { y0: h, collide: false });
      this.roofMeshes = this.roofMeshes || [];
      this.roofMeshes.push(roof);
    }

    // 门框立柱（放在门洞两侧，不阻挡通行）
    for (const side of doors) {
      const half = gap / 2;
      if (side === 'n' || side === 's') {
        const z = side === 'n' ? cz - hd : cz + hd;
        this.addBox(cx - half, z, 0.2, 0.55, h * 0.92, t.accent, { collide: false });
        this.addBox(cx + half, z, 0.2, 0.55, h * 0.92, t.accent, { collide: false });
      } else {
        const x = side === 'e' ? cx + hw : cx - hw;
        this.addBox(x, cz - half, 0.55, 0.2, h * 0.92, t.accent, { collide: false });
        this.addBox(x, cz + half, 0.55, 0.2, h * 0.92, t.accent, { collide: false });
      }
    }

    // 室内点光源
    if (h > 3.2 && this.lights.length < 12 && opts.light !== false) {
      const pl = new THREE.PointLight(0xffd9a0, 140, 28, 2);
      pl.position.set(cx, baseY + h - 0.5, cz);
      this.scene.add(pl);
      this.lights.push(pl);
    }
    this._baseY = prevBaseY;
    return { cx, cz, w, d, h, baseY };
  }

  // ────────── 植被 ──────────

  initVegetation() {
    this.barkTex = this.makeBarkTexture();
    this.barkMat = new THREE.MeshStandardMaterial({ map: this.barkTex, color: 0x8b7760, roughness: 0.96, metalness: 0.02 });
    this.trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 9);
    this.branchGeo = new THREE.CylinderGeometry(0.5, 1, 1, 6);
    this.leafMats = [];
    this.pineMats = [];
    for (let i = 0; i < 3; i++) {
      const broadTex = this.makeFoliageTexture('broadleaf', i);
      const needleTex = this.makeFoliageTexture('needle', i);
      this.leafMats.push(new THREE.MeshStandardMaterial({
        map: broadTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
      }));
      this.pineMats.push(new THREE.MeshStandardMaterial({
        map: needleTex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95, metalness: 0,
      }));
    }
    this.canopyBroad = [];
    this.canopyPine = [];
    for (let i = 0; i < 3; i++) {
      this.canopyBroad.push(this.makeCanopyGeometry(3.0, 3.3, 3.0, 50, 1000 + i * 37, false));
      this.canopyPine.push(this.makeCanopyGeometry(2.35, 4.9, 2.35, 44, 3000 + i * 53, true));
    }
    this.bushGeo = this.makeCanopyGeometry(1.25, 0.9, 1.25, 16, 9000, false);
  }

  makeBarkTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#6e5a44';
    ctx.fillRect(0, 0, 128, 256);
    const rng = mulberry32((this.seed ^ 0x18a3d9c7) >>> 0);
    for (let i = 0; i < 180; i++) {
      const x = rng() * 128;
      const w = 1 + rng() * 5;
      const y = rng() * 256;
      const h = 10 + rng() * 70;
      const v = 45 + Math.floor(rng() * 55);
      ctx.fillStyle = `rgba(${v + 25},${v + 12},${v},${(0.18 + rng() * 0.3).toFixed(2)})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeStyle = 'rgba(25,20,14,0.36)';
    for (let i = 0; i < 22; i++) {
      const x = rng() * 128;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rng() - 0.5) * 18, 256);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  makeFoliageTexture(kind, variant = 0) {
    if (!this._foliageTex) this._foliageTex = new Map();
    const key = kind + ':' + variant + ':' + this.map.theme;
    if (this._foliageTex.has(key)) return this._foliageTex.get(key);
    const palettes = {
      forest: {
        broadleaf: ['#3c532c', '#4b6433', '#5b753c', '#6c8847', '#7e9a52'],
        needle: ['#263a22', '#2f4728', '#39532f', '#456238'],
      },
      farm: {
        broadleaf: ['#55692f', '#677b37', '#7d8c40', '#929a4c', '#a59a53'],
        needle: ['#36441f', '#405226', '#4b5e2d'],
      },
      snow: {
        broadleaf: ['#4e6255', '#5d7263', '#718578', '#93a59a', '#b1c1b8'],
        needle: ['#2f4238', '#385043', '#435c4e'],
      },
      port: {
        broadleaf: ['#46573b', '#546748', '#627652', '#74865d'],
        needle: ['#2e3c2a', '#374831', '#41543a'],
      },
      factory: {
        broadleaf: ['#4b573e', '#586548', '#667453', '#72805b'],
        needle: ['#2c3828', '#35422f', '#3e4c38'],
      },
      city: {
        broadleaf: ['#45523b', '#515f46', '#5f6d50', '#6d7b59'],
        needle: ['#2b3527', '#343f2d', '#3d4935'],
      },
    };
    const theme = palettes[this.map.theme] || palettes.forest;
    const pal = kind === 'needle' ? theme.needle : theme.broadleaf;
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    const rng = mulberry32((this.seed ^ (kind === 'needle' ? 0x0a3d : 0x77cc)) + variant * 991);
    if (kind === 'needle') {
      for (let i = 0; i < 95; i++) {
        const cx = rng() * 256;
        const cy = rng() * 256;
        const n = 5 + Math.floor(rng() * 7);
        const base = pal[Math.floor(rng() * pal.length)];
        ctx.strokeStyle = base;
        ctx.globalAlpha = 0.7 + rng() * 0.3;
        ctx.lineWidth = 0.8 + rng() * 1.1;
        for (let j = 0; j < n; j++) {
          const a = rng() * Math.PI * 2;
          const len = 6 + rng() * 16;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }
      }
    } else {
      for (let i = 0; i < 128; i++) {
        const cx = 10 + rng() * 236;
        const cy = 10 + rng() * 236;
        const rx = 7 + rng() * 18;
        const ry = 3.5 + rng() * 9;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rng() * Math.PI * 2);
        ctx.fillStyle = pal[Math.floor(rng() * pal.length)];
        ctx.globalAlpha = 0.72 + rng() * 0.28;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = 'rgba(52,44,30,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const x = rng() * 256;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 30, 80, x - 30, 170, x + (rng() - 0.5) * 40, 256);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this._foliageTex.set(key, tex);
    return tex;
  }

  makeCanopyGeometry(rx, ry, rz, cards, seed, pine = false) {
    const rng = mulberry32(seed);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let c = 0; c < cards; c++) {
      let px, py, pz;
      if (pine) {
        const t = rng();
        py = ry * (0.08 + t * 0.9);
        const rad = rx * (1 - t * 0.78) * (0.3 + rng() * 0.8);
        const a = rng() * Math.PI * 2;
        px = Math.cos(a) * rad;
        pz = Math.sin(a) * rad;
      } else {
        const a = rng() * Math.PI * 2;
        const ph = Math.acos(2 * rng() - 1);
        const rad = Math.pow(rng(), 0.42);
        px = Math.sin(ph) * Math.cos(a) * rx * rad;
        py = ry * (0.25 + (Math.cos(ph) * 0.5 + 0.5) * 0.75) * Math.sqrt(rad);
        pz = Math.sin(ph) * Math.sin(a) * rz * rad;
      }
      const size = (pine ? 1.15 : 1.7) * (0.65 + rng() * 0.8);
      const nrm = new THREE.Vector3(px, py * 0.25 + ry * 0.15, pz).normalize();
      const ref = Math.abs(nrm.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : up;
      const u = new THREE.Vector3().crossVectors(ref, nrm).normalize().multiplyScalar(size * (0.7 + rng() * 0.6));
      const v = new THREE.Vector3().crossVectors(nrm, u).normalize().multiplyScalar(size * (0.7 + rng() * 0.6));
      const center = new THREE.Vector3(px, py, pz);
      const corners = [
        center.clone().add(u).add(v),
        center.clone().add(u).sub(v),
        center.clone().sub(u).sub(v),
        center.clone().sub(u).add(v),
      ];
      const base = positions.length / 3;
      const u0 = rng() * 0.5, v0 = rng() * 0.5;
      const uvCoords = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]];
      for (let i = 0; i < 4; i++) {
        positions.push(corners[i].x, corners[i].y, corners[i].z);
        normals.push(nrm.x, nrm.y, nrm.z);
        uvs.push(uvCoords[i][0], uvCoords[i][1]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  addBranchTo(group, from, to, radius, mat = this.barkMat) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    const mesh = new THREE.Mesh(this.branchGeo, mat);
    mesh.scale.set(radius, len, radius);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    this.hittables.push(mesh);
    return mesh;
  }

  addPineTree(x, z, scale = 1, opts = {}) {
    const base = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, base, z);
    g.scale.setScalar(scale);
    const trunkH = 5.0 + this.rng() * 1.8;
    const trunk = new THREE.Mesh(this.trunkGeo, this.barkMat);
    trunk.scale.set(0.24, trunkH, 0.24);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (this.rng() - 0.5) * 0.06;
    g.add(trunk);
    this.hittables.push(trunk);
    this.addBranchTo(g, new THREE.Vector3(0, trunkH * 0.58, 0), new THREE.Vector3(0.75, trunkH * 0.82, 0.45), 0.075);
    const canopy = new THREE.Mesh(this.canopyPine[Math.floor(this.rng() * this.canopyPine.length)], this.pineMats[Math.floor(this.rng() * this.pineMats.length)]);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    canopy.position.y = trunkH * 0.32;
    canopy.rotation.y = this.rng() * Math.PI * 2;
    g.add(canopy);
    this.group.add(g);
    this.colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42, h: trunkH + 4, top: trunkH + 4, y0: 0 });
  }

  addBroadleafTree(x, z, scale = 1) {
    const base = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, base, z);
    g.scale.setScalar(scale);
    const trunkH = 4.0 + this.rng() * 1.6;
    const trunk = new THREE.Mesh(this.trunkGeo, this.barkMat);
    trunk.scale.set(0.27, trunkH, 0.27);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (this.rng() - 0.5) * 0.08;
    g.add(trunk);
    this.hittables.push(trunk);
    for (let i = 0; i < 3; i++) {
      const a = this.rng() * Math.PI * 2;
      const start = new THREE.Vector3(0, trunkH * (0.55 + this.rng() * 0.2), 0);
      const end = new THREE.Vector3(Math.cos(a) * (0.7 + this.rng() * 0.8), trunkH * (0.8 + this.rng() * 0.15), Math.sin(a) * (0.7 + this.rng() * 0.8));
      this.addBranchTo(g, start, end, 0.07 + this.rng() * 0.04);
    }
    const canopy = new THREE.Mesh(this.canopyBroad[Math.floor(this.rng() * this.canopyBroad.length)], this.leafMats[Math.floor(this.rng() * this.leafMats.length)]);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    canopy.position.y = trunkH * 0.58;
    canopy.rotation.y = this.rng() * Math.PI * 2;
    canopy.scale.setScalar(0.95 + this.rng() * 0.25);
    g.add(canopy);
    this.group.add(g);
    this.colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, h: trunkH + 4, top: trunkH + 4, y0: 0 });
  }

  addDeadTree(x, z, scale = 1) {
    const base = this.heightAt(x, z);
    const g = new THREE.Group();
    g.position.set(x, base, z);
    g.scale.setScalar(scale);
    const trunkH = 4.2 + this.rng() * 2;
    const trunk = new THREE.Mesh(this.trunkGeo, this.barkMat);
    trunk.scale.set(0.22, trunkH, 0.22);
    trunk.position.y = trunkH / 2;
    g.add(trunk);
    this.hittables.push(trunk);
    for (let i = 0; i < 4; i++) {
      const a = this.rng() * Math.PI * 2;
      const start = new THREE.Vector3(0, trunkH * (0.55 + this.rng() * 0.4), 0);
      const end = new THREE.Vector3(Math.cos(a) * (0.8 + this.rng() * 1.1), trunkH * (0.65 + this.rng() * 0.5), Math.sin(a) * (0.8 + this.rng() * 1.1));
      this.addBranchTo(g, start, end, 0.05 + this.rng() * 0.035);
    }
    this.group.add(g);
    this.colliders.push({ minX: x - 0.38, maxX: x + 0.38, minZ: z - 0.38, maxZ: z + 0.38, h: trunkH, top: trunkH, y0: 0 });
  }

  // ────────── 灌木与草地 ──────────

  buildVegetation() {
    // 灌木（实例化）
    const theme = this.map.theme;
    const bushBase = {
      forest: 260, farm: 300, snow: 90, city: 100, port: 110, factory: 90,
    }[theme] || 120;
    const areaScale = Math.pow(this.map.size / 300, 1.35);
    const bushCount = Math.round(bushBase * Math.max(1, areaScale));
    const bushMat = new THREE.MeshStandardMaterial({ map: this.makeFoliageTexture('broadleaf', 1), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, metalness: 0, emissive: 0x0c140c, emissiveIntensity: 0.3 });
    const bushes = new THREE.InstancedMesh(this.bushGeo, bushMat, bushCount);
    bushes.frustumCulled = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const posv = new THREE.Vector3();
    const bushColors = [0x55613a, 0x617040, 0x4b5834, 0x6d7b48];
    let placed = 0;
    for (let attempt = 0; attempt < bushCount * 6 && placed < bushCount; attempt++) {
      const x = randRange(this.rng, -this.half * 0.94, this.half * 0.94);
      const z = randRange(this.rng, -this.half * 0.94, this.half * 0.94);
      if (this.slopeAt(x, z) > 0.7) continue;
      if (this.spotBlocked(x, z, 0.8, 0.8, 0.2)) continue;
      if (this.insideStructure(x, z, 0.8)) continue;
      if (this.tooCloseToKeyPoints(x, z, 14)) continue;
      posv.set(x, this.heightAt(x, z) + 0.1, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      const sc = 0.34 + this.rng() * 0.5;
      s.set(sc, sc * (0.7 + this.rng() * 0.5), sc);
      m.compose(posv, q, s);
      bushes.setMatrixAt(placed, m);
      bushes.setColorAt(placed, new THREE.Color(pick(this.rng, bushColors)));
      placed++;
    }
    bushes.count = placed;
    bushes.receiveShadow = true;
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    this.group.add(bushes);
    this.bushes = bushes;

    // 小区域死树
    if (['city', 'port', 'factory'].includes(theme)) {
      const deadCount = Math.round((theme === 'city' ? 18 : 10) * Math.max(1, Math.pow(this.map.size / 300, 1.2)));
      for (let i = 0; i < deadCount * 3 && i < deadCount * 3; i++) {
        const x = randRange(this.rng, -this.half * 0.88, this.half * 0.88);
        const z = randRange(this.rng, -this.half * 0.88, this.half * 0.88);
        if (this.spotBlocked(x, z, 1, 1, 1)) continue;
        if (this.insideStructure(x, z, 1.2)) continue;
        if (this.tooCloseToKeyPoints(x, z, 18)) continue;
        this.addDeadTree(x, z, 0.7 + this.rng() * 0.7);
        if (i > deadCount) break;
      }
    }

    this.initGrass();
  }

  makeGrassGeometry() {
    const rng = mulberry32((this.seed ^ 0x5eedcafe) >>> 0);
    const positions = [];
    const colors = [];
    const normals = [];
    const indices = [];
    const baseShade = new THREE.Color(0.62, 0.66, 0.5);
    const tipShade = new THREE.Color(1.0, 1.0, 0.9);
    for (let b = 0; b < 12; b++) {
      const ang = rng() * Math.PI * 2;
      const rad = 0.02 + rng() * 0.12;
      const bx = Math.cos(ang) * rad;
      const bz = Math.sin(ang) * rad;
      const h = 0.2 + rng() * 0.32;
      const w = 0.03 + rng() * 0.025;
      const tx = bx + (rng() - 0.5) * 0.15;
      const tz = bz + (rng() - 0.5) * 0.12;
      const px = -Math.sin(ang) * w;
      const pz = Math.cos(ang) * w;
      const base = positions.length / 3;
      positions.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
      for (let i = 0; i < 2; i++) {
        normals.push(0, 1, 0);
        colors.push(baseShade.r, baseShade.g, baseShade.b);
      }
      normals.push(0, 1, 0);
      colors.push(tipShade.r, tipShade.g, tipShade.b);
      indices.push(base, base + 1, base + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
  }

  initGrass() {
    const counts = { forest: 6500, farm: 7200, snow: 950, city: 950, port: 1200, factory: 1000 };
    const count = counts[this.map.theme] || 2200;
    this.grassTime = { value: 0 };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
          float sway = sin(uTime * 1.8 + iPos.x * 0.8 + iPos.z * 0.6);
          transformed.x += sway * transformed.y * 0.14;
          transformed.z += cos(uTime * 1.35 + iPos.z * 0.7) * transformed.y * 0.1;
        #endif`
      );
    };
    const mesh = new THREE.InstancedMesh(this.makeGrassGeometry(), mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grassMesh = mesh;
    this.grassCount = count;
    this.grassCenterX = null;
    this.grassCenterZ = null;
    this.grassPalettes = {
      forest: [0x6b8a47, 0x7a9952, 0x5e7c3d, 0x8aa65c],
      farm: [0x8b9a4e, 0x9da75a, 0x788845, 0xb0ae62],
      snow: [0xaeb8a0, 0x9da78f, 0xc2cbb4],
      city: [0x6a7256, 0x777d5f, 0x5c644b],
      port: [0x65704e, 0x727c5a, 0x566142],
      factory: [0x66704c, 0x737d57, 0x596342],
    }[this.map.theme] || [0x556b3d];
    this.group.add(mesh);
    const spawn = this.map.spawns[0];
    this.updateGrass(spawn.x, spawn.z, true);
  }

  updateGrass(px, pz, force = false) {
    if (!this.grassMesh) return;
    if (!force && this.grassCenterX != null) {
      const dx = px - this.grassCenterX;
      const dz = pz - this.grassCenterZ;
      if (dx * dx + dz * dz < 12 * 12) return;
    }
    this.grassCenterX = px;
    this.grassCenterZ = pz;
    const count = this.grassCount;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const radius = 34;
    const clusters = [];
    for (let i = 0; i < 130; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * radius;
      clusters.push({ x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r });
    }
    let placed = 0;
    for (let i = 0; i < count; i++) {
      let ok = false;
      let gx = 0, gz = 0;
      for (let attempt = 0; attempt < 4; attempt++) {
        let cx0 = px, cz0 = pz;
        if (this.rng() < 0.72) {
          const cl = clusters[Math.floor(this.rng() * clusters.length)];
          cx0 = cl.x + (this.rng() - 0.5) * 4;
          cz0 = cl.z + (this.rng() - 0.5) * 4;
        } else {
          const a0 = this.rng() * Math.PI * 2;
          const r0 = Math.sqrt(this.rng()) * radius;
          cx0 = px + Math.cos(a0) * r0;
          cz0 = pz + Math.sin(a0) * r0;
        }
        gx = cx0;
        gz = cz0;
        if (Math.abs(gx) > this.half * 0.9 || Math.abs(gz) > this.half * 0.9) continue;
        if (this.slopeAt(gx, gz) > 0.68) continue;
        if (this.insideStructure(gx, gz, 0.6)) continue;
        if (this.spotBlocked(gx, gz, 0.18, 0.18, 0.12)) continue;
        ok = true;
        break;
      }
      if (!ok) {
        m.makeScale(0, 0, 0);
        this.grassMesh.setMatrixAt(i, m);
        continue;
      }
      p.set(gx, this.heightAt(gx, gz) + 0.02, gz);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      const sc = 0.6 + this.rng() * 0.85;
      s.set(sc, sc * (0.85 + this.rng() * 0.55), sc);
      m.compose(p, q, s);
      this.grassMesh.setMatrixAt(i, m);
      col.setHex(this.grassPalettes[Math.floor(this.rng() * this.grassPalettes.length)]);
      this.grassMesh.setColorAt(i, col);
      placed++;
    }
    this.grassMesh.instanceMatrix.needsUpdate = true;
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
  }

  addRock(x, z, scale = 1) {
    const geo = new THREE.DodecahedronGeometry(0.9 * scale, 0);
    const mesh = new THREE.Mesh(geo, this.mat(pick(this.rng, [0x4a4c48, 0x3f423e, 0x545650])));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, this.heightAt(x, z) + 0.45 * scale, z);
    mesh.rotation.set(this.rng() * 0.4, this.rng() * Math.PI, this.rng() * 0.4);
    mesh.scale.set(1, 0.75, 1);
    this.group.add(mesh);
    this.hittables.push(mesh);
    this.colliders.push({ minX: x - 0.8 * scale, maxX: x + 0.8 * scale, minZ: z - 0.8 * scale, maxZ: z + 0.8 * scale, h: 1.2 * scale, top: 1.2 * scale, y0: 0 });
  }

  addShipContainer(x, z, color, stacked = false) {
    const w = 6.0, d = 2.6, h = 2.6;
    const base = this.addBox(x, z, w, d, h, color);
    // 门缝与波纹
    for (let i = 0; i < 5; i++) {
      this.addBox(x - w / 2 + 0.8 + i * 1.1, z + d / 2 + 0.01, 0.12, 0.04, h * 0.92, 0x1a1c1e, { y0: 0.1, collide: false, hittable: false });
    }
    if (stacked) {
      this.addBox(x, z, w, d, h, color, { y0: h, collide: false });
      this.addBox(x, z + d / 2 + 0.01, w, 0.04, 0.12, 0x14161a, { y0: h + 0.02, collide: false, hittable: false });
    }
    return base;
  }

  addLamp(x, z) {
    const base = this.heightAt(x, z);
    this.addCylinder(x, z, 0.12, 6.5, 0x23282c, { segments: 8 });
    const head = this.addBox(x, z, 0.7, 0.5, 0.3, 0x2a3034, { y0: 6.4, collide: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowMat);
    glow.position.set(x, base + 6.3, z);
    this.group.add(glow);
    if (this.lights.length < 12) {
      const pl = new THREE.PointLight(0xffc97a, 85, 24, 2);
      pl.position.set(x, base + 6.1, z);
      this.scene.add(pl);
      this.lights.push(pl);
    }
    return head;
  }

  // ────────── 地图布局 ──────────

  buildLayout() {
    const draw = () => {
      const id = this.mapId;
      if (id === 'factory') this.layoutFactory();
      else if (id === 'forest') this.layoutForest();
      else if (id === 'port') this.layoutPort();
      else if (id === 'snow') this.layoutSnow();
      else if (id === 'farm') this.layoutFarm();
      else this.layoutCity();
    };
    draw();
    // 5 倍面积：中心保留原标志性布局，四向复制并偏移，形成外围设施群
    this.buildLayoutCopies(draw);
    this.buildOuterLandmarks();
    // 通用杂物
    this.scatterProps();
  }

  /** 将当前主题布局再生成四份并平移到外围，填充扩大后的地图。 */
  buildLayoutCopies(draw) {
    const offset = this.half * 0.56;
    const copies = [
      { dx: offset, dz: 0, tag: '东区' },
      { dx: -offset, dz: 0, tag: '西区' },
      { dx: 0, dz: offset, tag: '南区' },
      { dx: 0, dz: -offset, tag: '北区' },
    ];
    for (const copy of copies) {
      const startChildren = this.group.children.length;
      const startColliders = this.colliders.length;
      const startZones = this.zones.length;
      const startStructures = this.structureZones.length;
      const startFlatten = this.flattenZones.length;
      const startScene = this.scene.children.length;

      draw();

      const moved = [];
      for (let i = startChildren; i < this.group.children.length; i++) {
        const obj = this.group.children[i];
        const ox = obj.position.x;
        const oz = obj.position.z;
        const og = this.heightAt(ox, oz);
        obj.position.x = ox + copy.dx;
        obj.position.z = oz + copy.dz;
        moved.push([obj, og]);
      }
      for (let i = startColliders; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        c.minX += copy.dx; c.maxX += copy.dx;
        c.minZ += copy.dz; c.maxZ += copy.dz;
      }
      for (let i = startStructures; i < this.structureZones.length; i++) {
        const b = this.structureZones[i];
        b.minX += copy.dx; b.maxX += copy.dx;
        b.minZ += copy.dz; b.maxZ += copy.dz;
      }
      for (let i = startFlatten; i < this.flattenZones.length; i++) {
        const f = this.flattenZones[i];
        f.x += copy.dx; f.z += copy.dz;
      }
      for (let i = startZones; i < this.zones.length; i++) {
        const z = this.zones[i];
        z.x += copy.dx; z.z += copy.dz;
        z.name += ' · ' + copy.tag;
      }
      // 场景直属灯光等对象
      const movedScene = [];
      for (let i = startScene; i < this.scene.children.length; i++) {
        const obj = this.scene.children[i];
        if (obj === this.group || obj === this.sky || !obj.position) continue;
        const ox = obj.position.x, oz = obj.position.z;
        const og = this.heightAt(ox, oz);
        obj.position.x = ox + copy.dx;
        obj.position.z = oz + copy.dz;
        movedScene.push([obj, og]);
      }
      // 地形被新的平整区覆盖后，修正外围物体的高度
      for (const [obj, og] of moved) {
        const ng = this.heightAt(obj.position.x, obj.position.z);
        obj.position.y += ng - og;
      }
      for (const [obj, og] of movedScene) {
        const ng = this.heightAt(obj.position.x, obj.position.z);
        obj.position.y += ng - og;
      }
      // 新增加的命中对象若是 group 直属，位置已同步移动；无需额外处理
    }
  }

  /** 每个主题在扩大的外围加一处标志性建筑，避免“只有大”。 */
  buildOuterLandmarks() {
    const q = this.half * 0.62;
    const id = this.mapId;
    if (id === 'factory') {
      this.addBuilding(-q, -q, 26, 18, 9, { doors: ['e', 's'], color: 0x3d4346 });
      this.addCylinder(-q - 18, -q, 2.2, 22, 0x2f3436, { segments: 14 });
      this.addCylinder(-q - 9, -q - 8, 1.8, 17, 0x343a3d, { segments: 12 });
      for (let i = 0; i < 4; i++) this.addCrateStack(-q + 8 + i * 4, -q + 14, 1.1);
      this.addResourceZone(-q, -q, 30, '北部重工厂', 'high', 10);
    } else if (id === 'forest') {
      this.addFireLookout(-q, q * 0.9);
      this.addResourceZone(-q, q * 0.9, 26, '防火瞭望塔', 'high', 8);
      this.addBuilding(q * 0.9, -q, 16, 12, 3.4, { color: 0x463a2b, doors: ['w', 'n'] });
      this.addResourceZone(q * 0.9, -q, 20, '伐木站', 'mid', 6);
    } else if (id === 'port') {
      this.addGantryCrane(-q, q);
      this.addResourceZone(-q, q, 28, '龙门吊区', 'high', 9);
      this.addBuilding(q, -q * 0.8, 30, 16, 8, { doors: ['w', 's'], color: 0x3a4146 });
      this.addResourceZone(q, -q * 0.8, 24, '港区三号库', 'high', 8);
      for (let i = 0; i < 8; i++) {
        this.addShipContainer(q * 0.55 + (i % 4) * 7, -q - 8 + Math.floor(i / 4) * 4, 0x6d4a32, i % 2 === 0);
      }
    } else if (id === 'snow') {
      this.addRadarStation(q, -q);
      this.addResourceZone(q, -q, 28, '雷达站', 'high', 9);
      this.addBunker(-q, q * 0.8);
      this.addResourceZone(-q, q * 0.8, 24, '地下掩体', 'mid', 7);
    } else if (id === 'farm') {
      this.addWindmill(q * 0.85, -q);
      this.addBuilding(-q, -q * 0.85, 24, 14, 4.2, { color: 0x5a4632, doors: ['e', 'n'] });
      this.addResourceZone(q * 0.85, -q, 24, '西风车', 'mid', 6);
      this.addResourceZone(-q, -q * 0.85, 26, '河谷仓房', 'high', 8);
      this.addFenceLine(-q, -q * 0.85 + 16, -q + 30, -q * 0.85 + 16);
    } else {
      this.addOverpass(-q, q);
      this.addResourceZone(-q, q, 30, '断桥公路', 'high', 9);
      this.addBuilding(q, -q, 28, 20, 12, { doors: ['w', 's'], color: 0x4b4d4a });
      this.addResourceZone(q, -q, 26, '废弃公寓', 'high', 8);
    }
  }

  addFireLookout(x, z) {
    const base = this.heightAt(x, z);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.addCylinder(x + sx * 2.4, z + sz * 2.4, 0.22, 9, 0x3a3226, { segments: 8, y0: 0 });
      }
    }
    this.addBox(x, z, 6.4, 5.4, 0.5, 0x4a3b29, { y0: 8.8 });
    this.addBox(x, z, 6.8, 5.8, 0.2, 0x2e2a22, { y0: 9.3, collide: false });
    this.addBox(x, z, 4.4, 3.4, 2.6, 0x3f3324, { y0: 9.5, collide: false });
    this.addBox(x, z, 5.0, 4.0, 0.3, 0x2b2921, { y0: 12.0, collide: false });
    this.addCylinder(x, z, 0.12, 2.6, 0x24221d, { segments: 6, y0: 12.2 });
    this.colliders.push({ minX: x - 3.2, maxX: x + 3.2, minZ: z - 2.8, maxZ: z + 2.8, h: 9, top: 9, y0: 0 });
  }

  addGantryCrane(x, z) {
    for (const sx of [-1, 1]) {
      this.addCylinder(x + sx * 9, z - 4, 0.65, 26, 0x7b5b24, { segments: 10 });
      this.addCylinder(x + sx * 9, z + 4, 0.55, 24, 0x6d5120, { segments: 10 });
    }
    this.addBox(x, z, 24, 3.0, 2.0, 0x8a6a2c, { y0: 23 });
    this.addBox(x - 2, z, 12, 2.0, 2.2, 0x6d5120, { y0: 24.6, collide: false });
    this.addBox(x + 8, z, 4, 5, 4, 0x3b3f42, { y0: 18, collide: false });
    this.colliders.push({ minX: x - 10, maxX: x + 10, minZ: z - 5, maxZ: z + 5, h: 2, top: 2, y0: 0 });
  }

  addRadarStation(x, z) {
    this.addBox(x, z, 18, 14, 4.2, 0x6b7072, { color: 0x6b7072 });
    this.addCylinder(x, z, 4.2, 4.0, 0x505659, { segments: 16, y0: 4.2 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mat(0x8a9596));
    dome.position.set(x, this.heightAt(x, z) + 7.6, z);
    dome.castShadow = true;
    this.group.add(dome);
    this.hittables.push(dome);
    this.addCylinder(x + 1.5, z + 5, 0.12, 10, 0x2a2d2e, { segments: 6, y0: 4.2 });
    this.colliders.push({ minX: x - 9, maxX: x + 9, minZ: z - 7, maxZ: z + 7, h: 7, top: 7, y0: 0 });
  }

  addBunker(x, z) {
    this.addBox(x, z, 16, 10, 3.4, 0x5a5e58, { color: 0x5a5e58 });
    this.addBox(x, z, 10, 7, 1.2, 0x454a46, { y0: 3.4, collide: false });
    this.addBox(x - 5, z - 5.2, 2.2, 0.5, 2.2, 0x1a1c1b, { y0: 0.2, collide: false });
    this.colliders.push({ minX: x - 8, maxX: x + 8, minZ: z - 5, maxZ: z + 5, h: 3.4, top: 3.4, y0: 0 });
  }

  addOverpass(x, z) {
    for (let i = -2; i <= 2; i++) {
      this.addCylinder(x + i * 8, z, 1.0, 7, 0x5b5c58, { segments: 10 });
      this.addBox(x + i * 8, z, 2.4, 2.4, 0.6, 0x6a6b64, { y0: 7, collide: false });
    }
    this.addBox(x, z, 42, 8, 1.2, 0x4f514d, { y0: 7 });
    this.addBox(x, z + 3.3, 42, 0.5, 1.1, 0x3e403d, { y0: 8.2, collide: false });
    this.colliders.push({ minX: x - 21, maxX: x + 21, minZ: z - 4, maxZ: z + 4, h: 7, top: 7, y0: 0 });
  }

  layoutFactory() {
    this.addBuilding(-24, -16, 28, 18, 4.5, { doors: ['e', 'w'] });
    this.addBuilding(24, -24, 20, 22, 4.2, { doors: ['w', 's'] });
    this.addBuilding(22, 22, 26, 16, 4.6, { doors: ['n', 'w'] });
    this.addBuilding(-26, 24, 18, 18, 4.0, { doors: ['e', 'n'] });

    // 中央货堆
    this.addCrateStack(0, 0);
    this.addCrateStack(5, 4, 1.2);
    this.addCrateStack(-6, -5, 1.0);
    this.addCrateStack(-2, 8, 0.8);
    this.addCrateStack(8, -7, 1.1);

    // 烟囱与管道（远离出生点，避免遮挡开局视野）
    this.addCylinder(-42, -8, 1.6, 12, 0x33383a, { segments: 12 });
    this.addCylinder(42, 8, 1.4, 10, 0x33383a, { segments: 12 });
    this.addBox(-16, -32, 8, 1.1, 1.0, 0x43484a);
    this.addBox(16, 32, 8, 1.1, 1.0, 0x43484a);

    // 外圈附属建筑与货场（扩建区域）
    this.addBuilding(-46, 36, 12, 10, 3.4, { doors: ['e', 'n'] });
    this.addBuilding(46, -38, 14, 10, 3.6, { doors: ['w', 's'] });
    this.addCrateStack(34, 36, 1.1);
    this.addCrateStack(-34, -40, 1.0);
    this.addCrateStack(10, -48, 0.9);
    this.addCrateStack(-10, 46, 0.8);
    this.addCylinder(-58, -28, 1.2, 8, 0x33383a, { segments: 10 });
    this.addBarrel(30, 0);
    this.addBarrel(31, 1.2);
    this.addBarrel(29.6, 1.1);

    this.addResourceZone(24, -24, 24, '军械库', 'high', 8);
    this.addResourceZone(22, 22, 24, '主仓库', 'mid', 6);
    this.addResourceZone(-24, -16, 22, '机修车间', 'mid', 6);
    this.addResourceZone(-26, 24, 20, '工人宿舍', 'low', 4);
    this.addResourceZone(-46, 36, 14, '外圈哨点', 'low', 3);
    this.addResourceZone(46, -38, 14, '外圈仓库', 'low', 3);

    // 室内货架
    const spots = [
      [-28, -18], [-19, -13], [20, -27], [27, -19],
      [17, 25], [27, 20], [-30, 27], [-21, 22],
      [-46, 38], [46, -36],
    ];
    for (const [x, z] of spots) this.addBox(x, z, 2.4, 1.0, 1.5, 0x3f3a30);
  }

  addCrateStack(x, z, scale = 1) {
    const size = 1.7 * scale;
    this.addBox(x, z, size, size, size * 0.9, 0x5a4936);
    if (this.rng() > 0.4) {
      this.addBox(x + (this.rng() - 0.5) * 0.4, z + (this.rng() - 0.5) * 0.4, size * 0.85, size * 0.85, size * 0.8, 0x4c3f2f, { y0: size * 0.9 });
    }
    // 木箱捆带
    this.addBox(x, z, size + 0.04, 0.12, size * 0.9, 0x2d2a24, { collide: false, hittable: false });
  }

  layoutForest() {
    this.addBuilding(-30, -25, 14, 11, 3.2, { color: 0x4a3c2c, doors: ['s', 'e'] });
    this.addBuilding(35, -35, 12, 12, 3.2, { color: 0x463a2b, doors: ['w', 'n'] });
    this.addBuilding(20, 40, 16, 11, 3.4, { color: 0x50412f, doors: ['n', 'w'] });
    this.addBuilding(-52, 30, 10, 10, 3.0, { color: 0x423728, doors: ['e', 's'] });
    this.addBuilding(48, 8, 9, 9, 2.8, { color: 0x3a3226, doors: ['w'] });
    this.addBuilding(-72, -60, 12, 10, 3.2, { color: 0x4a3c2c, doors: ['n', 'e'] });
    this.addBuilding(74, 72, 10, 12, 3.0, { color: 0x423728, doors: ['w', 's'] });

    this.addResourceZone(-30, -25, 22, '护林站军械库', 'high', 7);
    this.addResourceZone(35, -35, 20, '猎人小屋', 'mid', 6);
    this.addResourceZone(-52, 30, 18, '旧哨所', 'mid', 5);
    this.addResourceZone(20, 40, 18, '伐木营', 'low', 4);
    this.addResourceZone(-72, -60, 16, '林间营地', 'low', 3);
    this.addResourceZone(74, 72, 16, '废弃木屋', 'low', 3);
    this.addResourceZone(48, 8, 14, '工具棚', 'low', 2);

    // 营地
    this.addBox(0, 0, 2.6, 1.0, 0.8, 0x4a3b29);
    this.addBox(3, -2, 1.2, 1.2, 0.8, 0x4a3b29);
    this.addCylinder(-2, 3, 1.0, 0.5, 0x2e2a26, { collide: false });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8c3a });
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 6), fireMat);
    fire.position.set(-2, 0.9, 3);
    this.group.add(fire);
    const camp = new THREE.PointLight(0xff9040, 30, 18, 2);
    camp.position.set(-2, 1.6, 3);
    this.scene.add(camp);
    this.lights.push(camp);

    // 树木（随地图面积扩大，混合阔叶林与针叶林）
    const treeCount = Math.floor(this.map.size * 0.68);
    for (let i = 0; i < treeCount; i++) {
      const x = randRange(this.rng, -this.half + 7, this.half - 7);
      const z = randRange(this.rng, -this.half + 7, this.half - 7);
      if (this.tooCloseToLayout(x, z, 5.5)) continue;
      if (this.tooCloseToKeyPoints(x, z, 18)) continue;
      if (this.slopeAt(x, z) > 1.0) continue;
      const scale = randRange(this.rng, 0.85, 1.4);
      if (this.rng() < 0.58) this.addBroadleafTree(x, z, scale);
      else this.addPineTree(x, z, scale);
    }
    // 岩石
    for (let i = 0; i < Math.floor(this.map.size * 0.18); i++) {
      const x = randRange(this.rng, -this.half + 6, this.half - 6);
      const z = randRange(this.rng, -this.half + 6, this.half - 6);
      if (this.tooCloseToLayout(x, z, 2.0)) continue;
      if (this.tooCloseToKeyPoints(x, z, 9)) continue;
      this.addRock(x, z, randRange(this.rng, 0.6, 1.4));
    }
    // 灌木（纯装饰）
    for (let i = 0; i < Math.floor(this.map.size * 0.7); i++) {
      const x = randRange(this.rng, -this.half + 5, this.half - 5);
      const z = randRange(this.rng, -this.half + 5, this.half - 5);
      if (this.tooCloseToLayout(x, z, 1.5)) continue;
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(randRange(this.rng, 0.4, 0.9), 6, 4),
        this.mat(0x33402a)
      );
      bush.position.set(x, 0.3, z);
      bush.scale.y = 0.6;
      this.group.add(bush);
    }
  }

  layoutPort() {
    this.addBuilding(-26, -26, 34, 22, 5.2, { doors: ['e', 's'], color: 0x4a5560 });
    this.addBuilding(28, 25, 30, 18, 4.8, { doors: ['w', 'n'], color: 0x444f59 });
    this.addBuilding(-38, -82, 26, 18, 4.6, { doors: ['e', 's'], color: 0x4a5560, light: false });

    this.addResourceZone(-26, -26, 28, '海关仓库', 'high', 9);
    this.addResourceZone(28, 25, 26, '军需库', 'high', 8);
    this.addResourceZone(-38, -82, 24, '调度站', 'mid', 6);
    this.addResourceZone(6, -38, 26, '集装箱堆场', 'mid', 6);
    this.addResourceZone(-60, 64, 20, '码头工棚', 'low', 4);
    this.addResourceZone(60, 40, 18, '废料场', 'low', 3);
    this.addResourceZone(28, 66, 18, '岸边集装箱', 'low', 3);

    const palette = [0x36505e, 0x5a3f35, 0x46543a, 0x4a4e52, 0x3d4a5e, 0x5c5340];
    const clusters = [
      { x0: 6, z0: -38, cols: 4, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: -34, z0: 8, cols: 3, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: 8, z0: 46, cols: 3, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: 40, z0: -8, cols: 2, rows: 3, stepX: 8, stepZ: 4.2 },
      { x0: -80, z0: -40, cols: 3, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: 60, z0: 40, cols: 2, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: -60, z0: 64, cols: 3, rows: 2, stepX: 8, stepZ: 4.2 },
      { x0: 28, z0: 66, cols: 2, rows: 2, stepX: 8, stepZ: 4.2 },
    ];
    for (const cl of clusters) {
      for (let r = 0; r < cl.rows; r++) {
        for (let c = 0; c < cl.cols; c++) {
          if (this.rng() < 0.12) continue;
          const x = cl.x0 + c * cl.stepX;
          const z = cl.z0 + r * cl.stepZ;
          this.addShipContainer(x, z, pick(this.rng, palette), this.rng() < 0.35);
        }
      }
    }

    this.addLamp(-4, -8);
    this.addLamp(0, 58);
    this.addLamp(-60, -60);
    this.addLamp(60, 60);
    this.addBarrel(-8, 6);
    this.addBarrel(-6.8, 7.2);
    this.addBarrel(-7.5, 5.2);
    this.addBarrel(56, -50);
    this.addBarrel(58, -49);

    // 塔吊基座
    this.addBox(-52, -4, 4, 4, 1.2, 0x3a3f42);
    this.addCylinder(-52, -4, 0.8, 18, 0x4a5054, { segments: 8 });
    this.addBox(-38, -4, 26, 0.8, 0.8, 0x4a5054, { y0: 17, collide: false });
    this.addBox(-40, -4, 1.8, 1.8, 1.6, 0x2f3436, { y0: 15, collide: false });
  }

  layoutSnow() {
    this.addBuilding(-52, -38, 32, 20, 4.8, { doors: ['e', 'w'], color: 0x5d6b73 });
    this.addBuilding(46, 16, 26, 18, 4.4, { doors: ['w', 'n'], color: 0x5a6870, light: false });
    this.addBuilding(6, 62, 22, 16, 4.0, { doors: ['s', 'e'], color: 0x56646c });
    this.addBuilding(-84, 44, 16, 12, 3.4, { doors: ['e', 'n'], color: 0x63717a, light: false });
    this.addBuilding(66, -52, 18, 14, 3.4, { doors: ['w', 's'], color: 0x5d6a72, light: false });

    this.addResourceZone(-52, -38, 28, '边防弹药库', 'high', 9);
    this.addResourceZone(46, 16, 24, '雪原哨站', 'mid', 7);
    this.addResourceZone(6, 62, 22, '补给站', 'mid', 6);
    this.addResourceZone(-84, 44, 18, '碉堡', 'low', 4);
    this.addResourceZone(66, -52, 18, '观测哨', 'low', 4);
    this.addResourceZone(-54, 88, 20, '冰湖营地', 'low', 5);
    this.addResourceZone(20, 100, 20, '雪原营地', 'low', 5);

    // 冰湖
    const iceMat = new THREE.MeshStandardMaterial({ color: 0x8fb6c9, roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.88 });
    const ice = new THREE.Mesh(new THREE.CircleGeometry(34, 44), iceMat);
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(-54, 0.03, 88);
    this.group.add(ice);
    for (let i = 0; i < 10; i++) {
      this.addBox(
        -54 + randRange(this.rng, -24, 24),
        88 + randRange(this.rng, -24, 24),
        randRange(this.rng, 3, 10), 0.1, 0.02, 0xcfe3ec,
        { y0: 0.04, collide: false, hittable: false }
      );
    }

    // 雪松（避开冰湖与关键点）
    let trees = 0;
    let attempts = 0;
    while (trees < Math.floor(this.map.size * 0.52) && attempts < 900) {
      attempts++;
      const x = randRange(this.rng, -this.half + 8, this.half - 8);
      const z = randRange(this.rng, -this.half + 8, this.half - 8);
      if (dist(x, z, -54, 88) < 38) continue;
      if (this.tooCloseToLayout(x, z, 5.5)) continue;
      if (this.tooCloseToKeyPoints(x, z, 18)) continue;
      this.addPineTree(x, z, randRange(this.rng, 0.9, 1.5), { snow: true });
      trees++;
    }
    for (let i = 0; i < 46; i++) {
      const x = randRange(this.rng, -this.half + 6, this.half - 6);
      const z = randRange(this.rng, -this.half + 6, this.half - 6);
      if (dist(x, z, -54, 88) < 36) continue;
      if (this.tooCloseToLayout(x, z, 2)) continue;
      if (this.tooCloseToKeyPoints(x, z, 9)) continue;
      this.addRock(x, z, randRange(this.rng, 0.6, 1.5));
    }
    for (let i = 0; i < 30; i++) {
      const x = randRange(this.rng, -this.half + 5, this.half - 5);
      const z = randRange(this.rng, -this.half + 5, this.half - 5);
      if (dist(x, z, -54, 88) < 36) continue;
      if (this.tooCloseToLayout(x, z, 1.5)) continue;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(randRange(this.rng, 0.4, 0.9), 6, 4), this.mat(0x53645a));
      bush.position.set(x, 0.3, z);
      bush.scale.y = 0.6;
      this.group.add(bush);
    }

    // 雪地残骸与哨所
    this.addBox(20, 34, 4.2, 2.0, 1.4, 0x7d8388);
    this.addBox(21, 34, 1.8, 1.9, 0.7, 0x9aa2a8, { y0: 1.4, collide: false });
    this.addBarrel(-30, 10, 0x5c666d);
    this.addBarrel(-29, 11, 0x5c666d);
    this.addBox(-112, -50, 8, 6, 2.2, 0x69767e);
    this.addBox(-112, -50, 9, 7, 0.4, 0x4c5860, { y0: 2.2, collide: false });
  }

  layoutFarm() {
    this.addBuilding(-44, -30, 32, 22, 4.5, { doors: ['e', 's'], color: 0x6d5638 });
    this.addBuilding(50, 20, 28, 20, 5.0, { doors: ['w', 'n'], color: 0x6a5236, light: false });
    this.addBuilding(8, 66, 20, 16, 3.8, { doors: ['n', 'w'], color: 0x715c3e, light: false });
    this.addBuilding(-78, -72, 14, 12, 3.2, { doors: ['e', 's'], color: 0x5f4b32, light: false });
    this.addSilo(-64, -8, 3.2, 13);
    this.addSilo(64, -60, 3.0, 11);
    this.addSilo(-8, -104, 2.8, 9);

    this.addResourceZone(-44, -30, 28, '农场主仓', 'high', 10);
    this.addResourceZone(50, 20, 26, '谷仓军械库', 'mid', 9);
    this.addResourceZone(8, 66, 20, '农舍', 'mid', 7);
    this.addResourceZone(-78, -72, 18, '工具棚', 'low', 4);
    this.addResourceZone(-64, -8, 18, '筒仓区', 'mid', 5);
    this.addResourceZone(64, -60, 18, '打谷场', 'low', 5);
    this.addResourceZone(-124, -112, 18, '旧风车', 'low', 4);

    const fields = [
      [-8, -88, 42, 26], [-96, 62, 34, 24], [92, -68, 32, 22], [88, 82, 30, 20],
    ];
    this.addField(-8, -88, 42, 26, 0x6f6c3a, 0x8b8248);
    this.addField(-96, 62, 34, 24, 0x6c6839, 0x918850);
    this.addField(92, -68, 32, 22, 0x716d3c, 0x968c52);
    this.addField(88, 82, 30, 20, 0x6b6738, 0x8e854b);

    this.addFenceLine(-82, 4, -20, 4);
    this.addFenceLine(18, 46, 90, 46);
    this.addFenceLine(-70, -56, -70, -10);

    for (const [hx, hz] of [[-20, -46], [-16, -42], [24, 34], [30, 32], [60, 44], [-50, 18], [44, -40]]) {
      this.addHayBale(hx, hz);
    }
    this.addWindmill(-124, -112);
    this.addCar(-12, 20, 0);
    this.addCar(24, -44, 1);

    const inField = (x, z) => fields.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + 2 && Math.abs(z - cz) < d / 2 + 2);
    let trees = 0;
    let attempts = 0;
    const farmTreeTarget = Math.round(54 * Math.max(1, Math.pow(this.map.size / 300, 1.3)));
    while (trees < farmTreeTarget && attempts < 400 * 3) {
      attempts++;
      const x = randRange(this.rng, -this.half + 8, this.half - 8);
      const z = randRange(this.rng, -this.half + 8, this.half - 8);
      if (inField(x, z)) continue;
      if (this.tooCloseToLayout(x, z, 5.5)) continue;
      if (this.tooCloseToKeyPoints(x, z, 20)) continue;
      if (this.slopeAt(x, z) > 0.9) continue;
      const scale = randRange(this.rng, 0.9, 1.5);
      if (this.rng() < 0.8) this.addBroadleafTree(x, z, scale);
      else this.addPineTree(x, z, scale);
      trees++;
    }
    for (let i = 0; i < 24; i++) {
      const x = randRange(this.rng, -this.half + 6, this.half - 6);
      const z = randRange(this.rng, -this.half + 6, this.half - 6);
      if (inField(x, z)) continue;
      if (this.tooCloseToLayout(x, z, 2)) continue;
      if (this.tooCloseToKeyPoints(x, z, 9)) continue;
      this.addRock(x, z, randRange(this.rng, 0.6, 1.4));
    }
    for (let i = 0; i < 70; i++) {
      const x = randRange(this.rng, -this.half + 5, this.half - 5);
      const z = randRange(this.rng, -this.half + 5, this.half - 5);
      if (inField(x, z)) continue;
      if (this.tooCloseToLayout(x, z, 1.5)) continue;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(randRange(this.rng, 0.35, 0.8), 6, 4), this.mat(0x3f4a28));
      bush.position.set(x, 0.3, z);
      bush.scale.y = 0.6;
      this.group.add(bush);
    }
  }

  layoutCity() {
    this.addBuilding(-58, -52, 34, 26, 8.5, { doors: ['e', 's'], color: 0x5d564e });
    this.addBuilding(42, -58, 30, 24, 10, { doors: ['w', 'n'], color: 0x574f48, light: false });
    this.addBuilding(-55, 42, 32, 24, 7, { doors: ['e', 'n'], color: 0x625a50, light: false });
    this.addBuilding(48, 38, 36, 28, 9, { doors: ['w', 's'], color: 0x59504a });
    this.addBuilding(0, 84, 26, 18, 6, { doors: ['n', 'w'], color: 0x5c544c, light: false });
    this.addBuilding(-96, -12, 18, 14, 5, { doors: ['e', 's'], color: 0x5b534b, light: false });

    this.addResourceZone(-58, -52, 30, '市政军械库', 'high', 9);
    this.addResourceZone(48, 38, 30, '黑帮据点', 'high', 9);
    this.addResourceZone(42, -58, 26, '废弃警局', 'mid', 7);
    this.addResourceZone(-55, 42, 26, '百货仓库', 'mid', 7);
    this.addResourceZone(0, 84, 20, '中央车站', 'low', 4);
    this.addResourceZone(-96, -12, 18, '街角诊所', 'low', 3);
    this.addResourceZone(0, 6, 16, '中央广场', 'low', 3);

    // 中央广场纪念碑
    this.addBox(0, 6, 12, 8, 0.9, 0x49443e);
    this.addBox(0, 6, 3.2, 3.2, 9, 0x6b6258);
    this.addBox(0, 6, 1.6, 1.6, 1.4, 0x7c7366, { y0: 9, collide: false });

    this.addLamp(-18, -32);
    this.addLamp(18, 14);
    this.addLamp(-26, 56);

    this.addCar(-30, 2, 0);
    this.addCar(26, 18, 1);
    this.addCar(-6, -74, 0);
    this.addCar(72, -16, 1);
    this.addCar(-84, 30, 0);

    for (const [x, z] of [[-20, -10], [12, -18], [-8, 34], [34, 54], [-70, 8], [70, 60], [-40, 72], [90, 8], [-100, -44]]) {
      this.addRubble(x, z, randRange(this.rng, 0.8, 1.4));
    }
    for (const [x, z] of [[-14, 42], [8, -52], [52, -24], [-92, 18]]) {
      this.addBox(x, z, 3, 1, 0.9, 0x7a6f5c);
      this.addBox(x, z + 0.55, 2.6, 0.5, 0.6, 0x8a7f68);
    }
    for (let i = 0; i < 40; i++) {
      const x = randRange(this.rng, -this.half + 5, this.half - 5);
      const z = randRange(this.rng, -this.half + 5, this.half - 5);
      if (this.tooCloseToLayout(x, z, 1.5)) continue;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(randRange(this.rng, 0.3, 0.7), 5, 4), this.mat(0x3f463c));
      bush.position.set(x, 0.25, z);
      bush.scale.y = 0.5;
      this.group.add(bush);
    }
    for (let i = 0; i < 12; i++) {
      const x = randRange(this.rng, -this.half + 8, this.half - 8);
      const z = randRange(this.rng, -this.half + 8, this.half - 8);
      if (this.tooCloseToLayout(x, z, 2)) continue;
      if (this.tooCloseToKeyPoints(x, z, 9)) continue;
      this.addRock(x, z, randRange(this.rng, 0.5, 1.1));
    }
  }

  addSilo(x, z, r, h) {
    const base = this.heightAt(x, z);
    this.addCylinder(x, z, r, h, 0x8a8f90, { segments: 16 });
    for (let i = 1; i <= 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, 0.08, 6, 20), this.mat(0x5f6465));
      band.rotation.x = Math.PI / 2;
      band.position.set(x, base + (h * i) / 4, z);
      this.group.add(band);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.06, r * 0.7, 16), this.mat(0x4c5254));
    roof.position.set(x, base + h + r * 0.35, z);
    this.group.add(roof);
    this.hittables.push(roof);
    this.addBox(x + r + 0.08, z, 0.08, 0.08, h * 0.86, 0x353a3c, { y0: 0.5, collide: false });
  }

  addField(x, z, w, d, colorA, colorB) {
    const baseY = this.heightAt(x, z);
    this.flattenZones.push({ x, z, w: w + 3, d: d + 3, y: baseY, feather: 4 });
    this.addBox(x, z, w, d, 0.04, colorA, { y0: 0.02, baseY, collide: false, hittable: false });
    const rows = Math.max(4, Math.floor(d / 2.2));
    for (let i = 0; i < rows; i++) {
      const zz = z - d / 2 + (i + 0.7) * (d / rows);
      this.addBox(x, zz, w * 0.96, 0.035, 0.06, colorB, { y0: 0.05, baseY, collide: false, hittable: false });
    }
  }

  addFenceLine(x1, z1, x2, z2) {
    const horizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    if (horizontal) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const cx = (minX + maxX) / 2;
      const len = maxX - minX;
      this.addBox(cx, z1, len, 0.16, 1.4, 0x6b5636);
      this.addBox(cx, z1 - 0.04, len, 0.05, 0.1, 0x8a7045, { y0: 0.62, collide: false, hittable: false });
      this.addBox(cx, z1 - 0.05, len, 0.05, 0.1, 0x7c6238, { y0: 1.12, collide: false, hittable: false });
      for (let x = minX; x <= maxX + 0.01; x += 3) {
        this.addBox(x, z1, 0.16, 0.16, 1.55, 0x5c4a30, { collide: false });
      }
    } else {
      const minZ = Math.min(z1, z2);
      const maxZ = Math.max(z1, z2);
      const cz = (minZ + maxZ) / 2;
      const len = maxZ - minZ;
      this.addBox(x1, cz, 0.16, len, 1.4, 0x6b5636);
      this.addBox(x1 - 0.04, cz, 0.05, len, 0.1, 0x8a7045, { y0: 0.62, collide: false, hittable: false });
      this.addBox(x1 - 0.05, cz, 0.05, len, 0.1, 0x7c6238, { y0: 1.12, collide: false, hittable: false });
      for (let z = minZ; z <= maxZ + 0.01; z += 3) {
        this.addBox(x1, z, 0.16, 0.16, 1.55, 0x5c4a30, { collide: false });
      }
    }
  }

  addHayBale(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.35, 10), this.mat(0x9a8348));
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(x, this.heightAt(x, z) + 0.68, z);
    this.group.add(mesh);
    this.hittables.push(mesh);
    this.colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7, h: 1.25, top: 1.25, y0: 0 });
  }

  addCar(x, z, dir = 0) {
    const w = dir ? 2.0 : 4.0;
    const d = dir ? 4.0 : 2.0;
    const colors = [0x6a4a3a, 0x50606a, 0x5a5a4a, 0x6e5e46];
    const color = pick(this.rng, colors);
    this.addBox(x, z, w, d, 0.9, color, { y0: 0.35 });
    this.addBox(x - (dir ? 0 : 0.5), z - (dir ? 0.5 : 0), w * 0.6, d * 0.6, 0.6, 0x33383c, { y0: 1.25, collide: false });
    const wheelColor = 0x1c1e20;
    if (dir) {
      this.addBox(x - 0.9, z - 1.2, 0.3, 0.7, 0.6, wheelColor, { collide: false });
      this.addBox(x + 0.9, z - 1.2, 0.3, 0.7, 0.6, wheelColor, { collide: false });
      this.addBox(x - 0.9, z + 1.2, 0.3, 0.7, 0.6, wheelColor, { collide: false });
      this.addBox(x + 0.9, z + 1.2, 0.3, 0.7, 0.6, wheelColor, { collide: false });
    } else {
      this.addBox(x - 1.2, z - 0.9, 0.7, 0.3, 0.6, wheelColor, { collide: false });
      this.addBox(x - 1.2, z + 0.9, 0.7, 0.3, 0.6, wheelColor, { collide: false });
      this.addBox(x + 1.2, z - 0.9, 0.7, 0.3, 0.6, wheelColor, { collide: false });
      this.addBox(x + 1.2, z + 0.9, 0.7, 0.3, 0.6, wheelColor, { collide: false });
    }
  }

  addRubble(x, z, scale = 1) {
    this.addBox(x, z, 2.0 * scale, 1.6 * scale, 0.85 * scale, 0x4c4a47);
    this.addBox(x + 0.9 * scale, z - 0.5 * scale, 1.2 * scale, 1.0 * scale, 1.3 * scale, 0x56534f);
    this.addBox(x - 0.8 * scale, z + 0.6 * scale, 0.9 * scale, 0.9 * scale, 0.6 * scale, 0x413f3c, { collide: false });
  }

  addWindmill(x, z) {
    const base = this.heightAt(x, z);
    this.addBox(x, z, 4, 4, 1.0, 0x5a5145);
    this.addCylinder(x, z, 1.6, 12, 0x6b5a42, { segments: 8, taper: 0.72 });
    const blades = new THREE.Group();
    blades.position.set(x, base + 12.4, z + 1.7);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.4, 0.12), this.mat(0x8a795a));
      beam.position.y = 3.2;
      arm.add(beam);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.6, 0.05), this.mat(0xa89a78));
      sail.position.set(0.7, 3.6, 0);
      arm.add(sail);
      arm.rotation.z = (i * Math.PI) / 2;
      blades.add(arm);
    }
    this.group.add(blades);
    this.windmillBlades = this.windmillBlades || [];
    this.windmillBlades.push(blades);
  }

  scatterProps() {
    const count = this.mapId === 'forest' ? Math.floor(this.map.size * 0.16)
      : this.mapId === 'farm' ? Math.floor(this.map.size * 0.12)
        : Math.floor(this.map.size * 0.18);
    for (let i = 0; i < count; i++) {
      const x = randRange(this.rng, -this.half + 8, this.half - 8);
      const z = randRange(this.rng, -this.half + 8, this.half - 8);
      if (this.tooCloseToLayout(x, z, 1.6)) continue;
      if (this.tooCloseToKeyPoints(x, z, 8)) continue;
      if (this.rng() < 0.45) this.addBarrel(x, z, pick(this.rng, this.theme.propColors));
      else this.addCrateObstacle(x, z, randRange(this.rng, 1.0, 1.9), randRange(this.rng, 0.9, 1.5), randRange(this.rng, 0.6, 1.2));
    }
  }

  tooCloseToLayout(x, z, pad = 2) {
    for (const c of this.colliders) {
      if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
    }
    return false;
  }

  tooCloseToKeyPoints(x, z, r) {
    for (const e of this.map.extracts) {
      if (dist(x, z, e.x, e.z) < r + 3) return true;
    }
    for (const s of this.map.spawns) {
      if (dist(x, z, s.x, s.z) < r) return true;
    }
    return false;
  }

  buildBoundary() {
    const h = 12;
    const half = this.half;
    const pts = [
      { x: 0, z: -half - 0.5, w: this.map.size + 6, d: 1 },
      { x: 0, z: half + 0.5, w: this.map.size + 6, d: 1 },
      { x: -half - 0.5, z: 0, w: 1, d: this.map.size + 6 },
      { x: half + 0.5, z: 0, w: 1, d: this.map.size + 6 },
    ];
    for (const p of pts) {
      this.colliders.push({
        minX: p.x - p.w / 2, maxX: p.x + p.w / 2,
        minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2,
        h, top: h, y0: 0,
      });
    }
  }

  // ────────── 搜刮容器 ──────────

  placeLootContainers() {
    const map = this.map;
    let placed = 0;
    for (const zone of this.zones) {
      const weights = ZONE_LOOT_WEIGHTS[zone.tier] || ZONE_LOOT_WEIGHTS.low;
      let zonePlaced = 0;
      let attempts = 0;
      while (zonePlaced < zone.count && attempts < zone.count * 40) {
        attempts++;
        const typeId = weightedPick(this.rng, weights);
        const def = CONTAINERS[typeId];
        if (!def) continue;
        const spot = this.findZoneSpot(zone, def.worldW, def.worldD, 2.2);
        if (!spot) continue;
        const c = new LootContainer(this, spot.x, spot.z, typeId, {
          tier: zone.tier,
          highTier: zone.tier === 'high',
        });
        this.containers.push(c);
        zonePlaced++;
        placed++;
      }
    }

    // 野外的少量物资
    const scatterTarget = Math.max(1, Math.min(6, map.lootCount - placed));
    let scattered = 0;
    let attempts = 0;
    while (scattered < scatterTarget && attempts < scatterTarget * 90) {
      attempts++;
      const typeId = weightedPick(this.rng, [['crate', 45], ['duffle', 30], ['toolbox', 15], ['med_box', 10]]);
      const def = CONTAINERS[typeId];
      if (!def) continue;
      const spot = this.findOpenGroundSpot(def.worldW, def.worldD, 3);
      if (!spot) continue;
      const c = new LootContainer(this, spot.x, spot.z, typeId, { tier: 'wild' });
      this.containers.push(c);
      scattered++;
    }
  }

  findZoneSpot(zone, w, d, spacing) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * zone.r;
      const x = zone.x + Math.cos(a) * r;
      const z = zone.z + Math.sin(a) * r;
      if (Math.abs(x) > this.half - 6 || Math.abs(z) > this.half - 6) continue;
      if (this.slopeAt(x, z) > 0.38) continue;
      if (this.spotBlocked(x, z, w, d, 1.25)) continue;
      if (this.tooCloseToKeyPoints(x, z, 5)) continue;
      let ok = true;
      for (const c of this.containers) {
        if (dist(x, z, c.pos.x, c.pos.z) < spacing) { ok = false; break; }
      }
      if (!ok) continue;
      return { x, z };
    }
    return null;
  }

  spotBlocked(x, z, w, d, pad) {
    const hw = w / 2 + pad, hd = d / 2 + pad;
    for (const c of this.colliders) {
      if (x + hw > c.minX && x - hw < c.maxX && z + hd > c.minZ && z - hd < c.maxZ) return true;
    }
    return false;
  }

  findOpenGroundSpot(w, d, spacing) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const x = randRange(this.rng, -this.half + 8, this.half - 8);
      const z = randRange(this.rng, -this.half + 8, this.half - 8);
      if (this.spotBlocked(x, z, w, d, 0.9)) continue;
      if (this.tooCloseToKeyPoints(x, z, 7)) continue;
      if (this.slopeAt(x, z) > 0.38) continue;
      let inZone = false;
      for (const zn of this.zones) {
        if (dist(x, z, zn.x, zn.z) < zn.r + 10) { inZone = true; break; }
      }
      if (inZone) continue;
      let ok = true;
      for (const c of this.containers) {
        if (dist(x, z, c.pos.x, c.pos.z) < spacing) { ok = false; break; }
      }
      if (!ok) continue;
      return { x, z };
    }
    return null;
  }

  spawnBody(x, z, name, tableId, typeId) {
    const c = new LootContainer(this, x, z, 'body', {
      invisible: true,
      name: '搜刮 · ' + name,
      tableId,
    });
    c.isBody = true;
    c.enemyType = typeId;
    this.containers.push(c);
    return c;
  }

  // ────────── 导航网格 ──────────

  buildNav() {
    const cell = 1.5;
    const size = this.map.size;
    const cols = Math.floor(size / cell);
    const rows = cols;
    const minX = -this.half;
    const minZ = -this.half;
    const blocked = new Uint8Array(cols * rows);

    const heights = new Float32Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = minX + (cx + 0.5) * cell;
        const z = minZ + (cy + 0.5) * cell;
        heights[cy * cols + cx] = this.heightAt(x, z);
      }
    }
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = minX + (cx + 0.5) * cell;
        const z = minZ + (cy + 0.5) * cell;
        let hit = false;
        for (const c of this.colliders) {
          if (x > c.minX - 0.5 && x < c.maxX + 0.5 && z > c.minZ - 0.5 && z < c.maxZ + 0.5) {
            hit = true;
            break;
          }
        }
        if (!hit) {
          const i = cy * cols + cx;
          const hL = heights[cy * cols + Math.max(0, cx - 1)];
          const hR = heights[cy * cols + Math.min(cols - 1, cx + 1)];
          const hT = heights[Math.max(0, cy - 1) * cols + cx];
          const hB = heights[Math.min(rows - 1, cy + 1) * cols + cx];
          const slope = Math.hypot(hR - hL, hB - hT) / (2 * cell);
          const edge = Math.max(Math.abs(x), Math.abs(z)) / this.half;
          if (slope > 0.85 || edge > 0.965) hit = true;
        }
        blocked[cy * cols + cx] = hit ? 1 : 0;
      }
    }

    const nav = {
      cell, cols, rows, minX, minZ, blocked,
      idx(cx, cy) { return cy * cols + cx; },
      isFree(cx, cy) {
        return cx >= 0 && cy >= 0 && cx < cols && cy < rows && blocked[cy * cols + cx] === 0;
      },
      center(cx, cy) {
        return { x: minX + (cx + 0.5) * cell, z: minZ + (cy + 0.5) * cell };
      },
      cellOf(x, z) {
        const cx = clamp(Math.floor((x - minX) / cell), 0, cols - 1);
        const cy = clamp(Math.floor((z - minZ) / cell), 0, rows - 1);
        return { cx, cy };
      },
      nearestFree(cx, cy, maxR = 14) {
        if (this.isFree(cx, cy)) return { cx, cy };
        for (let r = 1; r <= maxR; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
              if (this.isFree(cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
            }
          }
        }
        return null;
      },
    };
    this.nav = nav;
  }

  findPath(ax, az, bx, bz) {
    const nav = this.nav;
    if (!nav) return null;
    let s = nav.cellOf(ax, az);
    let g = nav.cellOf(bx, bz);
    if (!nav.isFree(s.cx, s.cy)) {
      const n = nav.nearestFree(s.cx, s.cy, 10);
      if (!n) return null;
      s = n;
    }
    if (!nav.isFree(g.cx, g.cy)) {
      const n = nav.nearestFree(g.cx, g.cy, 10);
      if (!n) return null;
      g = n;
    }
    if (s.cx === g.cx && s.cy === g.cy) {
      const p = nav.center(g.cx, g.cy);
      return [{ x: p.x, z: p.z }];
    }

    const total = nav.cols * nav.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const startIdx = nav.idx(s.cx, s.cy);
    const goalIdx = nav.idx(g.cx, g.cy);
    gScore[startIdx] = 0;
    fScore[startIdx] = heuristic(s.cx, s.cy, g.cx, g.cy);
    const open = new MinHeap(fScore);
    open.push(startIdx);
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let found = false;
    let iter = 0;
    while (open.size > 0 && iter++ < 30000) {
      const cur = open.pop();
      if (cur === goalIdx) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % nav.cols;
      const cy = Math.floor(cur / nav.cols);
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (!nav.isFree(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!nav.isFree(cx + dx, cy) || !nav.isFree(cx, cy + dy)) continue;
        }
        const ni = nav.idx(nx, ny);
        if (closed[ni]) continue;
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          fScore[ni] = ng + heuristic(nx, ny, g.cx, g.cy);
          open.push(ni);
        }
      }
    }
    if (!found) return null;

    const path = [];
    let cur = goalIdx;
    let guard = 0;
    while (cur !== -1 && cur !== startIdx && guard++ < 4000) {
      const cx = cur % nav.cols;
      const cy = Math.floor(cur / nav.cols);
      const p = nav.center(cx, cy);
      path.push({ x: p.x, z: p.z });
      cur = came[cur];
    }
    path.reverse();
    return path.length ? path : null;
  }

  isFreeAt(x, z) {
    const nav = this.nav;
    if (!nav) return false;
    const c = nav.cellOf(x, z);
    return nav.isFree(c.cx, c.cy);
  }

  nearestFreePosition(x, z) {
    const nav = this.nav;
    if (!nav) return { x, z };
    const c = nav.cellOf(x, z);
    const n = nav.nearestFree(c.cx, c.cy, 20);
    if (!n) return { x, z };
    return nav.center(n.cx, n.cy);
  }

  zoneGuardSpot(zone) {
    const nav = this.nav;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = this.rng() * Math.PI * 2;
      const r = zone.r * (0.25 + this.rng() * 0.6);
      const x = zone.x + Math.cos(a) * r;
      const z = zone.z + Math.sin(a) * r;
      if (Math.abs(x) > this.half - 4 || Math.abs(z) > this.half - 4) continue;
      if (!nav) break;
      const c = nav.cellOf(x, z);
      if (!nav.isFree(c.cx, c.cy)) continue;
      if (this.slopeAt(x, z) > 0.7) continue;
      return this.nearestFreePosition(x, z);
    }
    return this.nearestFreePosition(zone.x, zone.z);
  }

  pickEnemySpawns(count, avoid) {
    const nav = this.nav;
    const result = [];
    let attempts = 0;
    while (result.length < count && attempts < count * 300) {
      attempts++;
      const cx = Math.floor(this.rng() * nav.cols);
      const cy = Math.floor(this.rng() * nav.rows);
      if (!nav.isFree(cx, cy)) continue;
      const p = nav.center(cx, cy);
      if (avoid && dist(p.x, p.z, avoid.x, avoid.z) < 30) continue;
      let ok = true;
      for (const e of this.map.extracts) {
        if (dist(p.x, p.z, e.x, e.z) < 10) { ok = false; break; }
      }
      if (!ok) continue;
      for (const r of result) {
        if (dist(p.x, p.z, r.x, r.z) < 12) { ok = false; break; }
      }
      if (!ok) continue;
      result.push({ x: p.x, z: p.z });
    }
    // 补足
    while (result.length < count) {
      const p = this.nearestFreePosition(
        randRange(this.rng, -this.half + 10, this.half - 10),
        randRange(this.rng, -this.half + 10, this.half - 10)
      );
      result.push(p);
    }
    return result;
  }

  // ────────── 撤离点 ──────────

  buildExtracts() {
    for (let i = 0; i < this.map.extracts.length; i++) {
      const e = this.map.extracts[i];
      const pos = this.nearestFreePosition(e.x, e.z);
      const baseY = this.heightAt(pos.x, pos.z);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x6fd48a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, fog: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.09, 8, 40), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, baseY + 0.08, pos.z);
      this.group.add(ring);

      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x5fd47c, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 26, 18, 1, true), beamMat);
      beam.position.set(pos.x, baseY + 13, pos.z);
      this.group.add(beam);

      // 内圈刻度
      const inner = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.32, 32), ringMat.clone());
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(pos.x, baseY + 0.07, pos.z);
      this.group.add(inner);

      const label = this.makeLabel(`撤离点 ${String.fromCharCode(65 + i)} · ${e.name}`, '#8fe3a5');
      label.position.set(pos.x, baseY + 3.6, pos.z);
      this.group.add(label);

      this.extracts.push({
        x: pos.x, z: pos.z, r: 3, name: e.name,
        label: `撤离点 ${String.fromCharCode(65 + i)}`,
        ring, beam, innerRing: inner, sprite: label, baseY,
      });
    }
  }

  makeLabel(text, color = '#e7d79f') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(8,10,12,0.62)';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = 'rgba(160,190,170,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 508, 92);
    ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(7.5, 1.4, 1);
    return sprite;
  }

  buildDust() {
    const count = Math.min(680, Math.floor(this.map.size * 2.1));
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const px = randRange(this.rng, -this.half, this.half);
      const pz = randRange(this.rng, -this.half, this.half);
      positions[i * 3] = px;
      positions[i * 3 + 1] = this.heightAt(px, pz) + randRange(this.rng, 0.3, 7);
      positions[i * 3 + 2] = pz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: this.theme.dustColor,
      size: 0.08,
      transparent: true,
      opacity: this.theme.dustOpacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.dust = points;
  }

  // ────────── 物理 / 视线 ──────────

  resolveCircle(pos, radius) {
    const cols = this.colliders;
    let x = pos.x, z = pos.z;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (x <= c.minX - radius || x >= c.maxX + radius || z <= c.minZ - radius || z >= c.maxZ + radius) continue;
        const dxL = x - (c.minX - radius);
        const dxR = (c.maxX + radius) - x;
        const dzT = z - (c.minZ - radius);
        const dzB = (c.maxZ + radius) - z;
        const m = Math.min(dxL, dxR, dzT, dzB);
        if (m === dxL) x = c.minX - radius;
        else if (m === dxR) x = c.maxX + radius;
        else if (m === dzT) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
    const lim = this.half - 1.3;
    pos.x = clamp(x, -lim, lim);
    pos.z = clamp(z, -lim, lim);
    return pos;
  }

  /** 2D 视线检测（墙体/高大障碍阻挡） */
  lineBlocked(ax, az, bx, bz) {
    for (let i = 0; i < this.blockingColliders.length; i++) {
      const c = this.blockingColliders[i];
      if (segIntersectsRect(ax, az, bx, bz, c.minX, c.maxX, c.minZ, c.maxZ)) return true;
    }
    const len = Math.hypot(bx - ax, bz - az);
    const ha = this.heightAt(ax, az) + 1.45;
    const hb = this.heightAt(bx, bz) + 1.45;
    const steps = Math.max(4, Math.min(28, Math.ceil(len / 4)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const h = this.heightAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (h > ha + (hb - ha) * t + 0.42) return true;
    }
    return false;
  }

  raycast(origin, dir, far = 300) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.hittables, true);
    return hits.length ? hits[0] : null;
  }

  isInsideExtract(x, z) {
    for (const e of this.extracts) {
      if (dist(x, z, e.x, e.z) <= e.r) return e;
    }
    return null;
  }

  findNearestContainer(x, z, maxDist = 2.6, facing = null) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.containers) {
      if (c.invisible && !c.hasBody) continue;
      const d = dist(x, z, c.pos.x, c.pos.z);
      if (d > bestD) continue;
      if (facing) {
        const dx = c.pos.x - x, dz = c.pos.z - z;
        const len = Math.hypot(dx, dz) || 1;
        if ((dx / len) * facing.x + (dz / len) * facing.z < 0.25) continue;
      }
      best = c;
      bestD = d;
    }
    return best;
  }

  // ────────── 更新 ──────────

  updateSky(camPos) {
    if (this.sky) this.sky.position.copy(camPos);
    if (this.sun && this.sunDir) {
      this.sun.position.set(
        camPos.x + this.sunDir.x * 90,
        camPos.y + this.sunDir.y * 90,
        camPos.z + this.sunDir.z * 90,
      );
      this.sun.target.position.set(camPos.x, camPos.y - 4, camPos.z);
      this.sun.target.updateMatrixWorld();
    }
  }

  update(dt, elapsed) {
    for (const e of this.extracts) {
      e.ring.rotation.z += dt * 0.25;
      e.innerRing.rotation.z -= dt * 0.5;
      e.beam.material.opacity = 0.045 + Math.sin(elapsed * 1.4) * 0.018;
      e.ring.material.opacity = 0.6 + Math.sin(elapsed * 1.8) * 0.12;
    }
    for (const c of this.containers) c.update(dt);
    if (this.windmillBlades) {
      for (const b of this.windmillBlades) b.rotation.z += dt * 0.35;
    }
    if (this.grassTime) this.grassTime.value += dt;
    if (this.dust) this.dust.rotation.y += dt * 0.004;
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.sky) {
      if (this.sky.parent) this.sky.parent.remove(this.sky);
      this.sky.geometry.dispose();
      if (this.sky.material.map) this.sky.material.map.dispose();
      this.sky.material.dispose();
    }
    for (const l of this.lights) {
      if (l.parent) l.parent.remove(l);
      if (l.dispose) l.dispose();
    }
    this.lights.length = 0;
    this.group.traverse((obj) => {
      if (obj.userData && obj.userData.asset) return; // GLB 共享资源由资产管线管理
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.userData && m.userData.shared) continue; // 敌人共享材质由缓存管理
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    if (this.envRT) {
      this.envRT.dispose();
      this.envRT = null;
    }
    this.scene.environment = null;
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.scene.fog = null;
    this.scene.background = new THREE.Color(0x06080a);
  }
}

// ═══════════════ 搜刮容器 ═══════════════

export class LootContainer {
  constructor(world, x, z, typeId, opts = {}) {
    const def = CONTAINERS[typeId];
    this.world = world;
    this.def = def;
    this.typeId = typeId;
    this.name = opts.name || def.name;
    this.pos = new THREE.Vector3(x, 0, z);
    this.opened = false;
    this.invisible = !!opts.invisible;
    this.hasBody = !!opts.invisible;
    this.lidPivot = null;
    this.lidAnim = 0;
    this.tableId = opts.tableId || def.table;
    this.tier = opts.tier || 'wild';
    this.highTier = !!opts.highTier;
    this.grid = this.rollLoot(opts.tableId || def.table, def.cols, def.rows, opts.count || def.count, this.highTier);

    if (!opts.invisible) this.buildMesh();
  }

  rollLoot(tableId, cols, rows, countRange, highTier = false) {
    const rng = this.world.rng;
    const grid = new Grid('loot_' + uid(), cols, rows);
    const table = LOOT_TABLES[tableId];
    if (!table) return grid;
    const n = randInt(rng, countRange[0], countRange[1]);
    for (let i = 0; i < n; i++) {
      const id = weightedPick(rng, table);
      const def = ITEMS[id];
      if (!def) continue;
      let stack = 1;
      if (def.type === 'ammo') stack = randInt(rng, 12, def.stack);
      const item = createItem(id, { stack });
      grid.addAuto(item);
    }
    // 高价值资源点额外滚入稀有物资
    if (highTier) {
      const extra = randInt(rng, 1, 2);
      for (let i = 0; i < extra; i++) {
        const id = weightedPick(rng, LOOT_TABLES.safe);
        const def = ITEMS[id];
        if (!def) continue;
        let stack = 1;
        if (def.type === 'ammo') stack = randInt(rng, 20, def.stack);
        grid.addAuto(createItem(id, { stack }));
      }
    }
    return grid;
  }

  buildMesh() {
    const def = this.def;
    const group = new THREE.Group();
    group.position.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z), this.pos.z);

    // 优先使用 Blender 导出的场景道具 GLB
    if (this.world.assets && this.world.assets.getPropAsset) {
      const prop = this.world.assets.getPropAsset(this.typeId);
      if (prop && prop.scene) {
        this.buildAssetMesh(group, prop);
        return;
      }
    }

    const color = def.color;
    const baseMat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: def.kind === 'safe' ? 0.35 : 0.06, envMapIntensity: 0.55 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2a2c28, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.6 });
    if (this.world.assets) {
      const norm = this.world.assets.materials.getDetailNormalTexture();
      baseMat.normalMap = norm;
      baseMat.normalScale.set(0.28, 0.28);
      trimMat.normalMap = norm;
      trimMat.normalScale.set(0.24, 0.24);
    }

    const h = def.height;
    const baseH = def.kind === 'bag' ? h * 0.8 : h;
    const body = new THREE.Mesh(new THREE.BoxGeometry(def.worldW, baseH, def.worldD), baseMat);
    body.position.y = baseH / 2;
    group.add(body);
    this.hitMesh = body;

    if (def.kind === 'box' || def.kind === 'bag') {
      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, baseH, -def.worldD / 2);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(def.worldW * 1.02, 0.09, def.worldD * 1.02), trimMat);
      lid.position.set(0, 0.045, def.worldD / 2);
      lidPivot.add(lid);
      group.add(lidPivot);
      this.lidPivot = lidPivot;
      // 提手/锁扣
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), trimMat);
      latch.position.set(0, baseH * 0.7, def.worldD / 2 + 0.04);
      group.add(latch);
    } else if (def.kind === 'tall') {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, h * 0.86, 0.03), trimMat);
      line.position.set(0, h * 0.5, def.worldD / 2 + 0.02);
      group.add(line);
      for (let i = 0; i < 3; i++) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(def.worldW * 0.5, 0.05, 0.02), trimMat);
        vent.position.set(0, h * 0.8 - i * 0.12, def.worldD / 2 + 0.02);
        group.add(vent);
      }
    } else if (def.kind === 'safe') {
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), trimMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(0, h * 0.55, def.worldD / 2 + 0.03);
      group.add(dial);
      const seam = new THREE.Mesh(new THREE.BoxGeometry(def.worldW * 0.9, h * 0.02, 0.02), trimMat);
      seam.position.set(0, h * 0.25, def.worldD / 2 + 0.02);
      group.add(seam);
    }

    // 资源点等级标记条
    const markColor = this.tier === 'high' ? 0xe2b552 : (this.tier === 'mid' ? 0x6fa9d8 : 0x9aa4ad);
    const markMat = new THREE.MeshBasicMaterial({ color: markColor });
    const mark = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.4, def.worldW * 0.3), 0.06, 0.02), markMat);
    mark.position.set(-def.worldW * 0.3, h * 0.55, def.worldD / 2 + 0.021);
    group.add(mark);

    this.mesh = group;
    this.world.group.add(group);
    this.world.hittables.push(group);
    if (!this.invisible) {
      this.world.colliders.push({
        minX: this.pos.x - def.worldW / 2,
        maxX: this.pos.x + def.worldW / 2,
        minZ: this.pos.z - def.worldD / 2,
        maxZ: this.pos.z + def.worldD / 2,
        h: h, top: h, y0: 0,
      });
    }
  }

  buildAssetMesh(group, prop) {
    const def = this.def;
    const scene = prop.scene;
    group.add(scene);
    this.hitMesh = null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (!this.hitMesh) this.hitMesh = o;
    });
    const lid = scene.getObjectByName('lidPivot');
    if (lid) this.lidPivot = lid;

    // 资源点等级标记条
    const markColor = this.tier === 'high' ? 0xe2b552 : (this.tier === 'mid' ? 0x6fa9d8 : 0x9aa4ad);
    const markMat = new THREE.MeshBasicMaterial({ color: markColor });
    const mark = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.4, def.worldW * 0.3), 0.06, 0.02), markMat);
    mark.position.set(-def.worldW * 0.3, def.height * 0.55, def.worldD / 2 + 0.021);
    group.add(mark);

    this.mesh = group;
    this.world.group.add(group);
    this.world.hittables.push(group);
    if (!this.invisible) {
      this.world.colliders.push({
        minX: this.pos.x - def.worldW / 2,
        maxX: this.pos.x + def.worldW / 2,
        minZ: this.pos.z - def.worldD / 2,
        maxZ: this.pos.z + def.worldD / 2,
        h: def.height, top: def.height, y0: 0,
      });
    }
  }

  open() {
    this.opened = true;
  }

  update(dt) {
    if (this.lidPivot) {
      const target = this.opened ? -1.35 : 0;
      this.lidAnim += (target - this.lidAnim) * Math.min(1, dt * 7);
      this.lidPivot.rotation.x = this.lidAnim;
    }
  }
}

export { THEMES };
