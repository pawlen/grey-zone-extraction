// ═══════════════════════════════════════════════════
// 资产管线：GLB/GLTF 加载 / PBR 材质 / 骨骼动画混合
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from '../vendor/SkeletonUtils.js';

/**
 * 外部资产清单。默认为空，此时全部使用程序化资产。
 *
 * 敌人模型（GLB，建议 Mixamo 骨骼或同名骨骼）：
 *   enemies: {
 *     scav: {
 *       model: 'assets/models/enemy_scav.glb',
 *       targetHeight: 1.82,
 *       rotationY: Math.PI,           // 让模型朝向游戏的正前方 (+Z)
 *       weaponSocket: 'mixamorig:RightHand',
 *       weaponScale: 0.5,
 *       weaponOffset: [0, 0, 0],
 *       weaponRotation: [0, 0, 0],
 *       clips: { idle: 'Idle', walk: 'Walk', run: 'Run', aim: 'Aim', fire: 'Fire', death: 'Death' },
 *       tint: 0x9a8f72,
 *     },
 *   }
 *
 * 第一人称武器模型：
 *   weapons: {
 *     w_ak74: {
 *       model: 'assets/models/ak74.glb',
 *       position: [0, 0, 0],
 *       rotation: [0, 0, 0],
 *       scale: 1,
 *       muzzle: 'muzzle',
 *       clips: { fire: 'Fire', reload: 'Reload' },
 *     },
 *   }
 *
 * PBR 贴图组（albedo 使用 sRGB，其余按线性贴图处理）：
 *   textureSets: {
 *     factory_wall: {
 *       albedo: 'assets/textures/factory_wall_albedo.jpg',
 *       normal: 'assets/textures/factory_wall_normal.jpg',
 *       roughness: 'assets/textures/factory_wall_roughness.jpg',
 *       metalness: 'assets/textures/factory_wall_metalness.jpg',
 *       ao: 'assets/textures/factory_wall_ao.jpg',
 *     },
 *   }
 */
export const ASSET_MANIFEST = {
  enemies: {},
  weapons: {},
  textureSets: {},
};

// ═══════════════ PBR 材质库 ═══════════════

export class MaterialLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = new Map();
    this.materials = new Map();
    this._detailNormal = null;
  }

  maxAnisotropy() {
    try {
      return Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    } catch (e) {
      return 4;
    }
  }

  prepareTexture(tex, { color = false, repeat = null, wrap = THREE.RepeatWrapping } = {}) {
    if (!tex) return null;
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = wrap;
    tex.anisotropy = this.maxAnisotropy();
    if (repeat) tex.repeat.set(repeat[0], repeat[1]);
    tex.needsUpdate = true;
    return tex;
  }

  loadTexture(url, opts = {}) {
    if (!url) return Promise.resolve(null);
    if (this.textures.has(url)) return Promise.resolve(this.textures.get(url));
    return new Promise((resolve) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          this.prepareTexture(tex, opts);
          this.textures.set(url, tex);
          resolve(tex);
        },
        undefined,
        () => {
          console.warn('[材质] 贴图加载失败（已跳过）：', url);
          resolve(null);
        }
      );
    });
  }

  /** 载入一组 PBR 贴图，返回可直接使用的 MeshStandardMaterial。 */
  async loadTextureSet(name, cfgOverride = null) {
    if (this.materials.has(name)) return this.materials.get(name);
    const cfg = cfgOverride || (ASSET_MANIFEST.textureSets || {})[name];
    if (!cfg) return null;
    const [albedo, normal, roughness, metalness, ao, emissive] = await Promise.all([
      this.loadTexture(cfg.albedo, { color: true }),
      this.loadTexture(cfg.normal),
      this.loadTexture(cfg.roughness),
      this.loadTexture(cfg.metalness),
      this.loadTexture(cfg.ao),
      this.loadTexture(cfg.emissive, { color: true }),
    ]);
    if (cfg.repeat) {
      for (const tex of [albedo, normal, roughness, metalness, ao, emissive]) {
        if (tex) tex.repeat.set(cfg.repeat[0], cfg.repeat[1]);
      }
    }
    const mat = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      roughnessMap: roughness,
      metalnessMap: metalness,
      aoMap: ao,
      emissiveMap: emissive,
      emissive: emissive ? 0xffffff : 0x000000,
      roughness: roughness ? 1 : (cfg.roughnessValue != null ? cfg.roughnessValue : 0.8),
      metalness: metalness ? 1 : (cfg.metalnessValue != null ? cfg.metalnessValue : 0.1),
      color: cfg.color != null ? cfg.color : 0xffffff,
      envMapIntensity: cfg.envMapIntensity != null ? cfg.envMapIntensity : 0.9,
    });
    this.materials.set(name, mat);
    return mat;
  }

  /** 程序化细节法线贴图：为地形/墙面/岩石提供微表面凹凸。 */
  getDetailNormalTexture() {
    if (this._detailNormal) return this._detailNormal;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const height = (x, y) => {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      return Math.sin(u * 5 + Math.cos(v * 3) * 1.7) * 0.5
        + Math.sin(v * 7 + Math.cos(u * 2) * 2.1) * 0.3
        + Math.sin((u + v) * 11) * 0.2;
    };
    const strength = 2.4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hL = height(x - 1, y);
        const hR = height(x + 1, y);
        const hD = height(x, y - 1);
        const hU = height(x, y + 1);
        let nx = (hL - hR) * strength;
        let ny = (hD - hU) * strength;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const i = (y * size + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = this.maxAnisotropy();
    this._detailNormal = tex;
    return tex;
  }

  /** 用天空贴图生成 PMREM 环境光照，让 PBR 金属/粗糙度材质拥有真实反射。 */
  applyEnvironment(scene, skyTex) {
    if (!this.renderer || !skyTex) return null;
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      const envTex = skyTex.clone();
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      envTex.needsUpdate = true;
      const rt = pmrem.fromEquirectangular(envTex);
      scene.environment = rt.texture;
      pmrem.dispose();
      envTex.dispose();
      return rt;
    } catch (e) {
      console.warn('[材质] 环境光照生成失败：', e);
      return null;
    }
  }

  dispose() {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    if (this._detailNormal) this._detailNormal.dispose();
    this._detailNormal = null;
  }
}

// ═══════════════ 动画混合控制器 ═══════════════

export class AnimationController {
  constructor(root, clips = []) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.current = null;
    this.currentName = null;
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  has(name) {
    return !!name && this.actions.has(name);
  }

  play(name, { fade = 0.2, loop = true, timeScale = 1, clampWhenFinished = false } = {}) {
    const action = this.actions.get(name);
    if (!action) return false;
    if (this.current === action) {
      action.timeScale = timeScale;
      action.paused = false;
      return true;
    }
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(timeScale);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = clampWhenFinished;
    action.play();
    if (this.current) action.crossFadeFrom(this.current, fade, true);
    this.current = action;
    this.currentName = name;
    return true;
  }

  playOnce(name, opts = {}) {
    return this.play(name, {
      fade: opts.fade != null ? opts.fade : 0.08,
      timeScale: opts.timeScale != null ? opts.timeScale : 1,
      loop: false,
      clampWhenFinished: true,
    });
  }

  update(dt) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    try { this.mixer.uncacheRoot(this.mixer.getRoot()); } catch (e) { /* ignore */ }
    this.actions.clear();
    this.current = null;
  }
}

// ═══════════════ 资产加载器 ═══════════════

export class AssetManager {
  constructor(renderer, manifest = ASSET_MANIFEST) {
    this.renderer = renderer;
    this.manifest = manifest;
    this.materials = new MaterialLibrary(renderer);
    this.gltfLoader = new GLTFLoader();
    this.enemyAssets = new Map();
    this.weaponAssets = new Map();
    this.gearAssets = new Map();
    this.propAssets = new Map();
    this.errors = [];
    this.loaded = 0;
    this.total = 0;
  }

  async loadAll(onProgress = () => {}) {
    onProgress(0.02, '读取资产清单…');
    await this.loadRuntimeManifest();

    const tasks = [];
    for (const [id, cfg] of Object.entries(this.manifest.enemies || {})) {
      if (cfg && cfg.model) tasks.push({ kind: 'enemy', id, cfg });
    }
    for (const [id, cfg] of Object.entries(this.manifest.weapons || {})) {
      if (cfg && cfg.model) tasks.push({ kind: 'weapon', id, cfg });
    }
    for (const [id, cfg] of Object.entries(this.manifest.gear || {})) {
      if (cfg && cfg.model) tasks.push({ kind: 'gear', id, cfg });
    }
    for (const [id, cfg] of Object.entries(this.manifest.props || {})) {
      if (cfg && cfg.model) tasks.push({ kind: 'prop', id, cfg });
    }
    this.total = tasks.length;
    this.loaded = 0;
    onProgress(0.06, this.total ? `发现 ${this.total} 个外部资产` : '初始化程序化资产');

    await Promise.all(tasks.map(async (task) => {
      try {
        const gltf = await this.loadGLTF(task.cfg.model);
        const entry = { gltf, cfg: task.cfg };
        if (task.kind === 'enemy') this.enemyAssets.set(task.id, entry);
        else if (task.kind === 'gear') this.gearAssets.set(task.id, entry);
        else if (task.kind === 'prop') this.propAssets.set(task.id, entry);
        else this.weaponAssets.set(task.id, entry);
        console.info('[资产] 已加载：', task.cfg.model);
      } catch (e) {
        this.errors.push(`${task.cfg.model}: ${e.message || e}`);
        console.warn('[资产] 加载失败，使用程序化模型兜底：', task.cfg.model, e);
      } finally {
        this.loaded++;
        onProgress(0.08 + 0.8 * (this.loaded / Math.max(1, this.total)), `加载资产 ${this.loaded}/${this.total}`);
      }
    }));

    // 需要时可在世界构建时按名称取用 PBR 贴图组
    const setNames = Object.keys(this.manifest.textureSets || {});
    let loadedSets = 0;
    for (const name of setNames) {
      try {
        const cfg = (this.manifest.textureSets || {})[name];
        await this.materials.loadTextureSet(name, cfg);
      } catch (e) { console.warn('[材质] 贴图组加载失败：', name, e); }
      loadedSets++;
      onProgress(0.88 + 0.1 * (loadedSets / Math.max(1, setNames.length)), `加载 PBR 材质 ${loadedSets}/${setNames.length}`);
    }

    onProgress(1, this.total ? '资产加载完成' : '程序化材质与动画就绪');
    return this;
  }

  /** 运行时清单：assets/manifest.json 若存在则合并，可无代码接入外部资产。 */
  async loadRuntimeManifest() {
    try {
      const resp = await fetch('assets/manifest.json', { cache: 'no-store' });
      if (!resp.ok) return;
      const json = await resp.json();
      this.manifest = {
        enemies: Object.assign({}, this.manifest.enemies || {}, json.enemies || {}),
        weapons: Object.assign({}, this.manifest.weapons || {}, json.weapons || {}),
        gear: Object.assign({}, this.manifest.gear || {}, json.gear || {}),
        props: Object.assign({}, this.manifest.props || {}, json.props || {}),
        textureSets: Object.assign({}, this.manifest.textureSets || {}, json.textureSets || {}),
      };
      console.info('[资产] 已读取运行时资产清单 assets/manifest.json');
    } catch (e) {
      // 没有外部清单时使用纯程序化资产
    }
  }

  loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  _inferClips(animations = []) {
    const find = (re) => {
      const clip = animations.find((c) => re.test(c.name));
      return clip ? clip.name : undefined;
    };
    return {
      idle: find(/idle|stand|breath/i),
      walk: find(/walk|patrol/i),
      run: find(/run|sprint|jog/i),
      aim: find(/aim|point|ads/i),
      fire: find(/fire|shoot|attack/i),
      reload: find(/reload|load/i),
      death: find(/death|die|dead/i),
    };
  }

  _prepare(entry) {
    const cfg = Object.assign({}, entry.cfg || {});
    const clips = entry.gltf.animations || [];
    const inferred = this._inferClips(clips);
    const configured = cfg.clips || {};
    cfg.clips = {};
    for (const key of Object.keys(inferred)) {
      cfg.clips[key] = configured[key] || inferred[key];
    }
    const scene = cloneSkeleton(entry.gltf.scene);
    scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      obj.userData.asset = true;
      if (cfg.tint != null) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const cloned = mats.map((m) => {
          const c = m.clone();
          if (c.color) c.color.lerp(new THREE.Color(cfg.tint), cfg.tintStrength != null ? cfg.tintStrength : 0.3);
          c.userData.asset = true;
          return c;
        });
        obj.material = Array.isArray(obj.material) ? cloned : cloned[0];
      } else {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.userData.asset = true;
      }
    });
    return { scene, clips, cfg };
  }

  getEnemyAsset(typeId) {
    const entry = this.enemyAssets.get(typeId);
    return entry ? this._prepare(entry) : null;
  }

  /** 给外部 GLB 材质补充细节法线与环境反射强度。 */
  enhanceExternalMaterials(scene, normalScale = 0.25, envIntensity = 1.0) {
    const detail = this.materials ? this.materials.getDetailNormalTexture() : null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.isMeshStandardMaterial) continue;
        if (!m.normalMap && detail) {
          m.normalMap = detail;
          m.normalScale.set(normalScale, normalScale);
        }
        m.envMapIntensity = Math.max(m.envMapIntensity || 0, envIntensity);
        m.needsUpdate = true;
      }
    });
  }

  getWeaponAsset(itemId) {
    const entry = this.weaponAssets.get(itemId);
    if (!entry) return null;
    const prepared = this._prepare(entry);
    this.enhanceExternalMaterials(prepared.scene, 0.2, 1.2);
    return prepared;
  }

  getPropAsset(typeId) {
    const entry = this.propAssets.get(typeId);
    if (!entry) return null;
    const scene = cloneSkeleton(entry.gltf.scene);
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      obj.userData.asset = true;
    });
    this.enhanceExternalMaterials(scene, 0.3, 0.95);
    return { scene, cfg: entry.cfg || {} };
  }

  getGearAsset(itemId) {
    const entry = this.gearAssets.get(itemId);
    if (!entry) return null;
    const scene = cloneSkeleton(entry.gltf.scene);
    const cfg = Object.assign({}, entry.cfg || {});
    scene.traverse((obj) => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      obj.userData.asset = true;
    });
    this.enhanceExternalMaterials(scene, 0.3, 0.95);
    return { scene, cfg };
  }

  getTextureSet(name) {
    return this.materials.materials.get(name) || null;
  }

  hasExternalAssets() {
    return this.enemyAssets.size > 0 || this.weaponAssets.size > 0
      || this.gearAssets.size > 0 || this.propAssets.size > 0;
  }

  dispose() {
    this.materials.dispose();
    this.enemyAssets.clear();
    this.weaponAssets.clear();
    this.gearAssets.clear();
    this.propAssets.clear();
    this.errors.length = 0;
  }
}
