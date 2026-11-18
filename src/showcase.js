// ═══════════════════════════════════════════════════
// 基地 · 可旋转 3D 角色展示台
// 按当前装备实时构建角色外观，支持拖拽旋转与角度按钮
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { ITEMS } from './data.js';
import { HumanoidRig } from './humanoid.js';
import { AnimationController } from './assets.js';

const RARITY_COLORS = { 1: 0x8a949c, 2: 0x6295c4, 3: 0xa07fd0, 4: 0xd9a648 };
const WOOD_GUNS = new Set(['w_ak74', 'w_sks', 'w_mosin']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class CharacterShowcase {
  constructor(game) {
    this.game = game;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.container = null;
    this.canvas = null;
    this.root = null;
    this.body = null;
    this.gearTorso = null;
    this.gearHead = null;
    this.gearHips = null;

    this.running = false;
    this._raf = 0;
    this._last = 0;
    this._time = 0;
    this._signature = '';
    this._quarter = -1;
    this.onQuarter = null;

    this.yaw = 0;
    this.targetYaw = 0;
    this.velocity = 0;
    this.dragging = false;
    this._dragId = null;
    this._dragX = 0;
    this._lastDx = 0;
    this._lastMove = 0;

    this._matCache = new Map();
    this._pointerBound = false;
    this._resizeObs = null;
    this._dust = null;
    this._dustSeed = [];
    this._envRT = null;
    this.anim = null;
    this.assetSource = 'procedural';
    this.assetBones = null;
    this.assetGearNodes = [];

    this._build();
  }

  // ═══════════════ 初始化 ═══════════════

  _build() {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
    this.camera.position.set(0, 1.22, 4.02);
    this.camera.lookAt(0, 1.02, 0);

    this._buildEnvironment();
    this._buildLights();
    this._buildStage();
    this._buildCharacter();
  }

  _buildEnvironment() {
    try {
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x0b0e12);
      const panel = (color, i, x, y, z, w, h) => {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
        );
        m.position.set(x, y, z);
        m.lookAt(0, 1, 0);
        envScene.add(m);
      };
      panel(0xffe2b0, 0, 3.2, 3.4, 3.0, 4.0, 3.0);   // 暖色主光
      panel(0x6f9cc4, 1, -4.0, 2.2, 2.2, 3.0, 4.0);  // 冷色补光
      panel(0x9fd8ff, 2, 0.0, 3.0, -5.0, 5.0, 2.5);  // 背部轮廓光
      panel(0x161b20, 3, 0.0, -2.0, 0.0, 12.0, 12.0); // 地面反射
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this._envRT = pmrem.fromScene(envScene, 0.05);
      this.scene.environment = this._envRT.texture;
      pmrem.dispose();
      envScene.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
    } catch (e) {
      console.warn('[展示台] 环境反射生成失败：', e);
    }
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9bb8cc, 0x141a20, 1.0));

    const key = new THREE.DirectionalLight(0xffe3b3, 3.1);
    key.position.set(2.4, 4.2, 4.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -1.7;
    key.shadow.camera.right = 1.7;
    key.shadow.camera.top = 2.9;
    key.shadow.camera.bottom = -0.4;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x7fa8cc, 1.3);
    fill.position.set(-3.2, 2.2, 2.4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xbcd9ff, 2.6);
    rim.position.set(-1.6, 3.2, -3.4);
    this.scene.add(rim);

    // 正面柔光：保证展厅里角色面部与胸前装备可读
    const front = new THREE.DirectionalLight(0xcfe0ee, 1.1);
    front.position.set(0.4, 2.1, 4.6);
    this.scene.add(front);
  }

  _buildStage() {
    // 地面：带网格与径向衰减的圆形停机坪
    const floorTex = this._makeFloorTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex, transparent: true, roughness: 0.94, metalness: 0.05,
      depthWrite: false, envMapIntensity: 0.35,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.6, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 展台底盘
    const baseMat = this._std('stage-base', 0x191e22, 0.52, 0.55);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.14, 0.10, 64), baseMat);
    base.position.y = 0.05;
    base.castShadow = false;
    base.receiveShadow = true;
    this.scene.add(base);

    const topMat = new THREE.MeshStandardMaterial({
      color: 0x11161a, roughness: 0.82, metalness: 0.2,
      envMapIntensity: 0.5,
    });
    const top = new THREE.Mesh(new THREE.CircleGeometry(1.05, 64), topMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.1015;
    top.receiveShadow = true;
    this.scene.add(top);

    // 金色发光环
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc9a24d, roughness: 0.28, metalness: 0.9,
      emissive: 0x6a4d16, emissiveIntensity: 0.9,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.011, 10, 96), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.107;
    this.scene.add(ring);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.004, 6, 72), ringMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.104;
    this.scene.add(innerRing);

    // 缓慢旋转的刻度环
    const deco = new THREE.Group();
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x8d7440, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const w = i % 3 === 0 ? 0.05 : 0.022;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, 0.02), tickMat);
      tick.position.set(Math.cos(a) * 1.22, 0.008, Math.sin(a) * 1.22);
      tick.rotation.y = -a;
      deco.add(tick);
    }
    this.scene.add(deco);
    this.deco = deco;

    // 漂浮尘埃
    const count = 64;
    const positions = new Float32Array(count * 3);
    this._dustSeed = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 1.15;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 0.1 + Math.random() * 2.1;
      positions[i * 3 + 2] = Math.sin(a) * r;
      this._dustSeed.push({
        x: positions[i * 3],
        z: positions[i * 3 + 2],
        phase: Math.random() * Math.PI * 2,
        speed: 0.03 + Math.random() * 0.06,
      });
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xe4cf9a, size: 0.016, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this._dust = new THREE.Points(dustGeo, dustMat);
    this._dust.frustumCulled = false;
    this.scene.add(this._dust);
  }

  _makeFloorTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    // 细网格
    ctx.strokeStyle = 'rgba(120, 152, 172, 0.30)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); ctx.stroke();
    }
    // 主网格
    ctx.strokeStyle = 'rgba(140, 172, 190, 0.42)';
    for (let i = 0; i <= size; i += 128) {
      ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); ctx.stroke();
    }

    // 径向淡出
    ctx.globalCompositeOperation = 'destination-in';
    const mask = ctx.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.5);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(0.45, 'rgba(0,0,0,0.85)');
    mask.addColorStop(0.8, 'rgba(0,0,0,0.25)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, size, size);

    // 深色底
    ctx.globalCompositeOperation = 'destination-over';
    const dark = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.5);
    dark.addColorStop(0, 'rgba(9,12,15,0.95)');
    dark.addColorStop(0.55, 'rgba(9,12,15,0.72)');
    dark.addColorStop(1, 'rgba(9,12,15,0)');
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  // ═══════════════ 材质工具 ═══════════════

  _std(key, color, roughness, metalness, opts = null) {
    if (this._matCache.has(key)) return this._matCache.get(key);
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...(opts || {}) });
    this._matCache.set(key, mat);
    return mat;
  }

  _rarityMat(rarity) {
    const color = RARITY_COLORS[rarity] || RARITY_COLORS[1];
    return this._tintedMat('gear', color, { roughness: 0.5, metalness: 0.3 });
  }

  _baseMat(kind) {
    const M = this.humanoid && this.humanoid.materials;
    if (!M) return null;
    return ({ fabric: M.vest, cloth: M.cloth, gear: M.gear, metal: M.helmet, armor: M.armor, glove: M.glove })[kind] || null;
  }

  /** 复用角色材质系统的贴图，按装备颜色派生材质。 */
  _tintedMat(kind, color, opts = {}) {
    const id = `gear-${kind}-${color}-${opts.metalness ?? ''}-${opts.roughness ?? ''}-${opts.emissive ?? ''}`;
    if (this._matCache.has(id)) return this._matCache.get(id);
    const base = this._baseMat(kind);
    let mat;
    if (base) {
      mat = base.clone();
      mat.color.setHex(color);
      if (opts.metalness != null) mat.metalness = opts.metalness;
      if (opts.roughness != null) mat.roughness = opts.roughness;
      if (opts.emissive != null) {
        mat.emissive.setHex(opts.emissive);
        mat.emissiveIntensity = opts.emissiveIntensity != null ? opts.emissiveIntensity : 1;
      }
      if (opts.envMapIntensity != null) mat.envMapIntensity = opts.envMapIntensity;
    } else {
      mat = new THREE.MeshStandardMaterial({
        color, roughness: opts.roughness != null ? opts.roughness : 0.8,
        metalness: opts.metalness != null ? opts.metalness : 0.1,
      });
    }
    this._matCache.set(id, mat);
    return mat;
  }

  _cyl(parent, rt, rb, h, seg, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // ═══════════════ 角色骨架与基础外观 ═══════════════

  _buildCharacter() {
    const root = new THREE.Group();
    this.scene.add(root);
    this.root = root;

    const detail = this.game && this.game.assets && this.game.assets.materials
      ? this.game.assets.materials.getDetailNormalTexture() : null;

    // 优先使用 Blender 导出的干员 GLB；缺失时回退到内置程序化人形
    let asset = null;
    try {
      if (this.game && this.game.assets) {
        asset = this.game.assets.getEnemyAsset('operator_hq')
          || this.game.assets.getEnemyAsset('operator');
      }
    } catch (e) {
      console.warn('[展示台] 干员 GLB 加载失败，回退程序化模型：', e);
    }
    if (asset && asset.scene) this._buildAssetCharacter(asset);
    else this._buildProceduralCharacter(detail);
  }

  _measure(obj) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    obj.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    return box;
  }

  /** 使用 Blender 干员 GLB：骨骼动画 + 按骨骼挂载装备。 */
  _buildAssetCharacter(asset) {
    const model = asset.scene;
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    let box = this._measure(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const norm = 1.82 / Math.max(0.01, size.y);
    model.scale.multiplyScalar(norm);
    model.rotation.y = Number((asset.cfg && asset.cfg.rotationY) || 0);
    box = this._measure(model);
    model.position.y = 0.10 - box.min.y;
    this.root.add(model);
    this.body = model;
    this.assetSource = 'operator';

    this.anim = new AnimationController(model, asset.clips || []);
    const clip = (asset.cfg && asset.cfg.clips) || {};
    const idle = clip.idle || 'Idle';
    if (this.anim.has(idle)) this.anim.play(idle, { fade: 0, loop: true });

    const isVanguard = !!(model.getObjectByName('mixamorigHips') || model.getObjectByName('mixamorig:Hips'));
    const findBone = (names) => {
      for (const n of names) {
        const b = model.getObjectByName(n);
        if (b) return b;
      }
      return null;
    };
    const chest = isVanguard ? findBone(['mixamorigSpine2', 'mixamorig:Spine2', 'Spine2']) : findBone(['Chest']);
    const head = isVanguard ? findBone(['mixamorigHead', 'mixamorig:Head', 'Head']) : findBone(['Head']);
    const hips = isVanguard ? findBone(['mixamorigHips', 'mixamorig:Hips', 'Hips']) : findBone(['Hips']);
    this.assetBones = { chest, head, hips };
    this.assetModelName = isVanguard ? 'vanguard' : 'operator';
    if (!chest || !head || !hips) {
      console.warn('[展示台] 干员骨骼缺失，装备将改用程序化方式挂载');
      this.assetBones = null;
    }

    // 装备/武器挂点
    this.gearTorso = new THREE.Group();
    this.gearHead = new THREE.Group();
    this.gearHips = new THREE.Group();

    if (isVanguard && this.assetBones) {
      // 商业角色：按模型包围盒计算装备挂点世界坐标，再对齐到骨骼
      model.updateMatrixWorld(true);
      const bounds = this._measure(model);
      const height = Math.max(0.01, bounds.max.y - bounds.min.y);
      const midY = bounds.min.y;
      this.assetTargets = {
        head: new THREE.Vector3(0, midY + height * 0.88, 0.02),
        chest: new THREE.Vector3(0, midY + height * 0.70, 0),
        hips: new THREE.Vector3(0, midY + height * 0.53, 0),
        torso: new THREE.Vector3(0, midY + height * 0.53, 0),
      };
      this.root.updateMatrixWorld(true);
      this.modelQuat = this.root.getWorldQuaternion(new THREE.Quaternion());
      const attach = (group, bone, target) => {
        this.root.add(group);
        group.position.copy(target);
        group.quaternion.copy(this.modelQuat);
        bone.attach(group);
      };
      attach(this.gearTorso, chest, this.assetTargets.torso);
      attach(this.gearHead, head, this.assetTargets.head);
      attach(this.gearHips, hips, this.assetTargets.hips);
    } else if (this.assetBones) {
      this.gearTorso.position.set(0, 0.98 - 1.25, 0);
      chest.add(this.gearTorso);
      this.gearHead.position.set(0, 1.70 - 1.63, 0);
      head.add(this.gearHead);
      this.gearHips.position.set(0, 0.98 - 0.95, 0);
      hips.add(this.gearHips);
    } else {
      this.root.add(this.gearTorso, this.gearHead, this.gearHips);
      this.gearTorso.position.y = 0.98;
      this.gearHead.position.y = 1.70;
      this.gearHips.position.y = 0.98;
    }
  }

  /** 回退：内置骨骼蒙皮人形。 */
  _buildProceduralCharacter(detail) {
    const rig = new HumanoidRig({
      variant: 'operator',
      detailNormal: detail,
      preset: 'operator',
      gear: false,
    });
    this.humanoid = rig;
    this.body = rig.object;
    rig.object.position.y = 0.10;
    this.root.add(rig.object);
    this.anim = rig.anim;
    this.assetSource = 'procedural';

    this.gearTorso = new THREE.Group();
    this.gearTorso.position.set(0, -0.33, 0);
    rig.bones.chest.add(this.gearTorso);
    this.gearHead = new THREE.Group();
    this.gearHead.position.set(0, 0.07, 0);
    rig.bones.head.add(this.gearHead);
    this.gearHips = new THREE.Group();
    this.gearHips.position.set(0, 0.03, 0);
    rig.bones.hips.add(this.gearHips);

    rig.object.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  // ═══════════════ 装备外观 ═══════════════

  updateEquipment(eq) {
    if (!eq || !this.gearTorso) return;
    const sig = [eq.primary && eq.primary.id, eq.secondary && eq.secondary.id,
      eq.helmet && eq.helmet.id, eq.armor && eq.armor.id,
      eq.rig && eq.rig.id, eq.backpack && eq.backpack.id].join('|');
    if (sig === this._signature) return;
    this._signature = sig;

    this._clearGear();

    // 商用角色自带完整护甲/头盔/背包，避免与展示台装备 GLB 重叠
    if (this.assetModelName === 'vanguard') {
      if (eq.primary) this._buildMountedWeapon(eq.primary, 'primary');
      if (eq.secondary) this._buildMountedWeapon(eq.secondary, 'secondary');
      return;
    }

    // 优先使用 Blender 导出的装备 GLB（干员 GLB 骨骼上），否则回退程序化装备
    const useAssetGear = this.assetSource === 'operator' && this.assetBones;
    if (eq.backpack && !(useAssetGear && this._attachGearAsset(eq.backpack))) this._buildBackpack(eq.backpack);
    if (eq.armor && !(useAssetGear && this._attachGearAsset(eq.armor))) this._buildArmor(eq.armor);
    if (eq.rig && !(useAssetGear && this._attachGearAsset(eq.rig))) this._buildRig(eq.rig, !!eq.armor);
    if (eq.helmet && !(useAssetGear && this._attachGearAsset(eq.helmet))) this._buildHelmet(eq.helmet);
    if (eq.primary) this._buildMountedWeapon(eq.primary, 'primary');
    if (eq.secondary) this._buildMountedWeapon(eq.secondary, 'secondary');
  }

  /** 把装备 GLB 挂到对应骨骼。 */
  _attachGearAsset(item) {
    if (!this.game || !this.game.assets || !this.assetBones) return false;
    const asset = this.game.assets.getGearAsset(item.id);
    if (!asset || !asset.scene) return false;
    const cfg = asset.cfg || {};
    const attachName = String(cfg.attach || 'Chest');
    const boneKey = attachName.toLowerCase();
    const bone = this.assetBones[boneKey];
    if (!bone) return false;
    const node = asset.scene;
    node.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    if (this.assetModelName === 'vanguard' && this.assetTargets) {
      const target = this.assetTargets[boneKey];
      if (!target) return false;
      this.root.add(node);
      node.position.copy(target);
      node.quaternion.copy(this.modelQuat);
      if (cfg.scale) node.scale.setScalar(cfg.scale);
      bone.attach(node);
    } else {
      node.position.fromArray(cfg.offset || [0, 0, 0]);
      node.rotation.fromArray(cfg.rotation || [0, 0, 0]);
      if (cfg.scale) node.scale.setScalar(cfg.scale);
      bone.add(node);
    }
    this.assetGearNodes.push(node);
    return true;
  }

  _clearGear() {
    for (const node of this.assetGearNodes) {
      if (node.parent) node.parent.remove(node);
    }
    this.assetGearNodes.length = 0;
    for (const parent of [this.gearTorso, this.gearHead, this.gearHips]) {
      if (!parent) continue;
      while (parent.children.length) {
        const child = parent.children.pop();
        child.traverse((o) => {
          if (o.isMesh && o.geometry && o.geometry.userData && o.geometry.userData.shared) return;
          if (o.isMesh && o.geometry) o.geometry.dispose();
        });
      }
    }
  }

  _box(parent, w, h, d, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _tube(parent, r, len, mat, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _buildHelmet(item) {
    const def = ITEMS[item.id] || {};
    const cls = def.cls || 1;
    const shell = this._tintedMat('metal', 0x3a4147, { roughness: 0.4, metalness: 0.55 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      shell,
    );
    dome.position.set(0, 0.132, -0.004);
    dome.scale.set(1.0, 0.98, 1.06);
    dome.castShadow = true;
    dome.receiveShadow = true;
    g.add(dome);

    this._box(g, 0.315, 0.038, 0.06, shell, 0, 0.152, 0.148); // 前沿
    // 顶部导气/识别条
    this._box(g, 0.17, 0.012, 0.03, trim, 0, 0.305, -0.02);
    // 导轨
    const railMat = this._tintedMat('gear', 0x2d3338, { roughness: 0.42, metalness: 0.5 });
    this._box(g, 0.018, 0.02, 0.11, railMat, -0.168, 0.19, -0.015);
    this._box(g, 0.018, 0.02, 0.11, railMat, 0.168, 0.19, -0.015);

    if (cls >= 2) {
      this._box(g, 0.052, 0.115, 0.155, shell, -0.158, 0.085, 0.005); // 护耳
      this._box(g, 0.052, 0.115, 0.155, shell, 0.158, 0.085, 0.005);
      this._box(g, 0.035, 0.06, 0.02, trim, -0.175, 0.10, 0.09);
      this._box(g, 0.035, 0.06, 0.02, trim, 0.175, 0.10, 0.09);
    }
    if (cls >= 3) {
      const visor = this._box(g, 0.245, 0.125, 0.05, this._std('visor', 0x18262f, 0.1, 0.6,
        { emissive: 0x0a141a, emissiveIntensity: 0.9 }), 0, 0.105, 0.16);
      visor.rotation.x = -0.12;
      this._box(g, 0.275, 0.028, 0.062, shell, 0, 0.178, 0.15);
    }
    if (cls >= 4) {
      this._box(g, 0.09, 0.055, 0.05, this._tintedMat('metal', 0x3a4248, { roughness: 0.5, metalness: 0.55 }), 0, 0.20, 0.155);
      // 耳机+通话器
      this._box(g, 0.055, 0.10, 0.11, this._tintedMat('gear', 0x1d2124, { roughness: 0.8, metalness: 0.1 }), -0.195, 0.07, -0.005);
      this._box(g, 0.014, 0.014, 0.09, this._tintedMat('gear', 0x1d2124, { roughness: 0.8, metalness: 0.1 }), -0.165, 0.06, 0.10);
    }
    // 头灯
    this._box(g, 0.045, 0.04, 0.035, this._std('lamp', 0x2a2f33, 0.5, 0.5), -0.11, 0.21, 0.135);

    this.gearHead.add(g);
  }

  _buildArmor(item) {
    const def = ITEMS[item.id] || {};
    const cls = def.cls || 1;
    const bulk = 0.92 + cls * 0.04;
    const plateMat = this._tintedMat('armor',
      cls >= 4 ? 0x39413e : (cls >= 2 ? 0x444d45 : 0x4e5649),
      { roughness: 0.52, metalness: 0.3 });
    const pouchMat = this._tintedMat('gear', 0x2c322e, { roughness: 0.82, metalness: 0.12 });
    const fabricMat = this._tintedMat('fabric', 0x343a33, { roughness: 0.88, metalness: 0.04 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const w = 0.29 * bulk;
    const h = 0.31 * bulk;

    // 圆滑板甲主体
    const shell = this._cyl(g, 0.278 * bulk, 0.24 * bulk, 0.43 * bulk, 18, plateMat, 0, 0.35, 0.005);
    shell.scale.z = 0.84;
    // 前 / 后插板
    this._box(g, w * 1.94, h, 0.045, plateMat, 0, 0.36, 0.2).rotation.x = -0.03;
    this._box(g, w * 1.88, h * 0.94, 0.04, plateMat, 0, 0.36, -0.2);
    // 肩带
    this._box(g, 0.095, 0.17, 0.3, fabricMat, -w * 1.02, 0.57, 0).rotation.x = 0.18;
    this._box(g, 0.095, 0.17, 0.3, fabricMat, w * 1.02, 0.57, 0).rotation.x = 0.18;

    // 织带与弹匣袋
    for (let i = 0; i < 3; i++) {
      this._box(g, w * 1.7, 0.016, 0.012, pouchMat, 0, 0.24 + i * 0.082, 0.226);
    }
    this._box(g, 0.13, 0.125, 0.055, pouchMat, -0.095, 0.41, 0.235);
    this._box(g, 0.13, 0.125, 0.055, pouchMat, 0.095, 0.41, 0.235);
    this._box(g, 0.115, 0.016, 0.06, trim, -0.095, 0.474, 0.24);
    this._box(g, 0.115, 0.016, 0.06, trim, 0.095, 0.474, 0.24);
    // 侧袋 / 侧围
    this._box(g, 0.06, 0.13, 0.1, pouchMat, -w * 1.12, 0.3, 0.03);
    this._box(g, 0.06, 0.13, 0.1, pouchMat, w * 1.12, 0.3, 0.03);
    // 识别章与肩章
    this._box(g, 0.075, 0.05, 0.014, trim, -w * 0.86, 0.47, 0.2);
    this._box(g, 0.07, 0.03, 0.14, trim, w * 1.02, 0.575, 0.12);
    // 腰部连接带
    this._box(g, w * 1.9, 0.05, 0.24, fabricMat, 0, 0.165, 0);

    this.gearTorso.add(g);
  }

  _buildRig(item, hasArmor) {
    const def = ITEMS[item.id] || {};
    const cap = def.capacity || [3, 2];
    const cols = clamp(cap[0], 2, 4);
    const main = this._tintedMat('fabric', 0x3a4137, { roughness: 0.88, metalness: 0.04 });
    const pouch = this._tintedMat('fabric', 0x464e40, { roughness: 0.9, metalness: 0.03 });
    const strap = this._tintedMat('cloth', 0x292e2a, { roughness: 0.9, metalness: 0.03 });
    const hardware = this._tintedMat('gear', 0x2c3230, { roughness: 0.7, metalness: 0.2 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();
    const z = hasArmor ? 0.235 : 0.175;

    const w = 0.30 + cols * 0.04;
    // 圆滑胸挂主体
    const body = this._cyl(g, 0.19, 0.185, w * 1.02, 16, main, 0, 0.34, z);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 0.5);
    this._box(g, 0.07, 0.34, 0.03, strap, -0.13, 0.47, z - 0.035);
    this._box(g, 0.07, 0.34, 0.03, strap, 0.13, 0.47, z - 0.035);
    this._box(g, 0.04, 0.04, 0.022, trim, -0.13, 0.37, z + 0.01);
    this._box(g, 0.04, 0.04, 0.022, trim, 0.13, 0.37, z + 0.01);

    // 弹匣袋
    const pw = (w - 0.03) / cols;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.015 + pw * (i + 0.5);
      const pou = this._cyl(g, pw * 0.44, pw * 0.44, 0.13, 10, pouch, x, 0.31, z + 0.055);
      pou.scale.z = 0.42;
      this._box(g, pw - 0.03, 0.014, 0.06, trim, x, 0.366, z + 0.058);
      this._box(g, pw - 0.04, 0.012, 0.012, hardware, x, 0.267, z + 0.062);
    }
    // 手雷 / 杂物袋
    this._cyl(g, 0.035, 0.035, 0.085, 10, pouch, w / 2 + 0.05, 0.30, z + 0.02).scale.z = 0.85;
    this._box(g, 0.06, 0.065, 0.05, pouch, -w / 2 - 0.045, 0.30, z + 0.01);

    this.gearTorso.add(g);
  }

  _buildBackpack(item) {
    const def = ITEMS[item.id] || {};
    const cap = def.capacity || [4, 3];
    const scale = clamp(0.74 + cap[0] * 0.07, 0.82, 1.16);
    const main = this._tintedMat('fabric', 0x3d453b, { roughness: 0.9, metalness: 0.03 });
    const pouch = this._tintedMat('fabric', 0x30372f, { roughness: 0.88, metalness: 0.04 });
    const strap = this._tintedMat('cloth', 0x272c2a, { roughness: 0.9, metalness: 0.03 });
    const hardware = this._tintedMat('gear', 0x2a302d, { roughness: 0.72, metalness: 0.2 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const w = 0.37 * scale;
    const h = 0.44 * scale;
    const d = 0.21 * scale;
    const z = -0.135 - d / 2;

    // 圆滑包体
    const shell = this._cyl(g, 0.185 * scale, 0.17 * scale, h, 16, main, 0, 0.345, z);
    shell.scale.set(1.08, 1, 0.62);
    // 顶盖
    const lid = this._cyl(g, 0.19 * scale, 0.185 * scale, 0.1, 16, pouch, 0, 0.345 + h / 2 - 0.015, z);
    lid.scale.set(1.06, 1, 0.66);
    this._box(g, w * 0.7, 0.04, d * 1.04, trim, 0, 0.345 + h / 2 - 0.075, z);
    // 侧袋
    const spL = this._cyl(g, 0.06, 0.055, 0.18, 12, pouch, -w / 2 - 0.035, 0.30, z);
    spL.scale.z = 0.8;
    const spR = this._cyl(g, 0.06, 0.055, 0.18, 12, pouch, w / 2 + 0.035, 0.30, z);
    spR.scale.z = 0.8;
    // 肩带绕到胸前
    this._box(g, 0.065, 0.30, 0.03, strap, -0.14, 0.50, 0.125);
    this._box(g, 0.065, 0.30, 0.03, strap, 0.14, 0.50, 0.125);
    this._box(g, 0.055, 0.035, 0.04, hardware, -0.14, 0.4, 0.14);
    this._box(g, 0.055, 0.035, 0.04, hardware, 0.14, 0.4, 0.14);
    // 横置提手
    this._box(g, w * 0.5, 0.035, 0.045, strap, 0, 0.345 + h / 2 + 0.02, z);
    // 顶部卷垫（大包）
    if (cap[0] * cap[1] >= 12) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.9, 12), pouch);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, 0.345 + h / 2 + 0.075, z);
      roll.castShadow = true;
      g.add(roll);
    }

    this.gearTorso.add(g);
  }

  _buildHelmet(item) {
    const def = ITEMS[item.id] || {};
    const cls = def.cls || 1;
    const shell = this._tintedMat('metal', 0x3a4147, { roughness: 0.4, metalness: 0.55 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      shell,
    );
    dome.position.set(0, 0.132, -0.004);
    dome.scale.set(1.0, 0.98, 1.06);
    dome.castShadow = true;
    dome.receiveShadow = true;
    g.add(dome);

    this._box(g, 0.315, 0.038, 0.06, shell, 0, 0.152, 0.148); // 前沿
    // 顶部导气/识别条
    this._box(g, 0.17, 0.012, 0.03, trim, 0, 0.305, -0.02);
    // 导轨
    const railMat = this._tintedMat('gear', 0x2d3338, { roughness: 0.42, metalness: 0.5 });
    this._box(g, 0.018, 0.02, 0.11, railMat, -0.168, 0.19, -0.015);
    this._box(g, 0.018, 0.02, 0.11, railMat, 0.168, 0.19, -0.015);

    if (cls >= 2) {
      this._box(g, 0.052, 0.115, 0.155, shell, -0.158, 0.085, 0.005); // 护耳
      this._box(g, 0.052, 0.115, 0.155, shell, 0.158, 0.085, 0.005);
      this._box(g, 0.035, 0.06, 0.02, trim, -0.175, 0.10, 0.09);
      this._box(g, 0.035, 0.06, 0.02, trim, 0.175, 0.10, 0.09);
    }
    if (cls >= 3) {
      const visor = this._box(g, 0.245, 0.125, 0.05, this._std('visor', 0x18262f, 0.1, 0.6,
        { emissive: 0x0a141a, emissiveIntensity: 0.9 }), 0, 0.105, 0.16);
      visor.rotation.x = -0.12;
      this._box(g, 0.275, 0.028, 0.062, shell, 0, 0.178, 0.15);
    }
    if (cls >= 4) {
      this._box(g, 0.09, 0.055, 0.05, this._tintedMat('metal', 0x3a4248, { roughness: 0.5, metalness: 0.55 }), 0, 0.20, 0.155);
      // 耳机+通话器
      this._box(g, 0.055, 0.10, 0.11, this._tintedMat('gear', 0x1d2124, { roughness: 0.8, metalness: 0.1 }), -0.195, 0.07, -0.005);
      this._box(g, 0.014, 0.014, 0.09, this._tintedMat('gear', 0x1d2124, { roughness: 0.8, metalness: 0.1 }), -0.165, 0.06, 0.10);
    }
    // 头灯
    this._box(g, 0.045, 0.04, 0.035, this._std('lamp', 0x2a2f33, 0.5, 0.5), -0.11, 0.21, 0.135);

    this.gearHead.add(g);
  }

  _buildArmor(item) {
    const def = ITEMS[item.id] || {};
    const cls = def.cls || 1;
    const bulk = 0.92 + cls * 0.04;
    const plateMat = this._tintedMat('armor',
      cls >= 4 ? 0x39413e : (cls >= 2 ? 0x444d45 : 0x4e5649),
      { roughness: 0.52, metalness: 0.3 });
    const pouchMat = this._tintedMat('gear', 0x2c322e, { roughness: 0.82, metalness: 0.12 });
    const fabricMat = this._tintedMat('fabric', 0x343a33, { roughness: 0.88, metalness: 0.04 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const w = 0.29 * bulk;
    const h = 0.31 * bulk;

    // 圆滑板甲主体
    const shell = this._cyl(g, 0.278 * bulk, 0.24 * bulk, 0.43 * bulk, 18, plateMat, 0, 0.35, 0.005);
    shell.scale.z = 0.84;
    // 前 / 后插板
    this._box(g, w * 1.94, h, 0.045, plateMat, 0, 0.36, 0.2).rotation.x = -0.03;
    this._box(g, w * 1.88, h * 0.94, 0.04, plateMat, 0, 0.36, -0.2);
    // 肩带
    this._box(g, 0.095, 0.17, 0.3, fabricMat, -w * 1.02, 0.57, 0).rotation.x = 0.18;
    this._box(g, 0.095, 0.17, 0.3, fabricMat, w * 1.02, 0.57, 0).rotation.x = 0.18;

    // 织带与弹匣袋
    for (let i = 0; i < 3; i++) {
      this._box(g, w * 1.7, 0.016, 0.012, pouchMat, 0, 0.24 + i * 0.082, 0.226);
    }
    this._box(g, 0.13, 0.125, 0.055, pouchMat, -0.095, 0.41, 0.235);
    this._box(g, 0.13, 0.125, 0.055, pouchMat, 0.095, 0.41, 0.235);
    this._box(g, 0.115, 0.016, 0.06, trim, -0.095, 0.474, 0.24);
    this._box(g, 0.115, 0.016, 0.06, trim, 0.095, 0.474, 0.24);
    // 侧袋 / 侧围
    this._box(g, 0.06, 0.13, 0.1, pouchMat, -w * 1.12, 0.3, 0.03);
    this._box(g, 0.06, 0.13, 0.1, pouchMat, w * 1.12, 0.3, 0.03);
    // 识别章与肩章
    this._box(g, 0.075, 0.05, 0.014, trim, -w * 0.86, 0.47, 0.2);
    this._box(g, 0.07, 0.03, 0.14, trim, w * 1.02, 0.575, 0.12);
    // 腰部连接带
    this._box(g, w * 1.9, 0.05, 0.24, fabricMat, 0, 0.165, 0);

    this.gearTorso.add(g);
  }

  _buildRig(item, hasArmor) {
    const def = ITEMS[item.id] || {};
    const cap = def.capacity || [3, 2];
    const cols = clamp(cap[0], 2, 4);
    const main = this._tintedMat('fabric', 0x3a4137, { roughness: 0.88, metalness: 0.04 });
    const pouch = this._tintedMat('fabric', 0x464e40, { roughness: 0.9, metalness: 0.03 });
    const strap = this._tintedMat('cloth', 0x292e2a, { roughness: 0.9, metalness: 0.03 });
    const hardware = this._tintedMat('gear', 0x2c3230, { roughness: 0.7, metalness: 0.2 });
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();
    const z = hasArmor ? 0.235 : 0.175;

    const w = 0.30 + cols * 0.04;
    // 圆滑胸挂主体
    const body = this._cyl(g, 0.19, 0.185, w * 1.02, 16, main, 0, 0.34, z);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 0.5);
    this._box(g, 0.07, 0.34, 0.03, strap, -0.13, 0.47, z - 0.035);
    this._box(g, 0.07, 0.34, 0.03, strap, 0.13, 0.47, z - 0.035);
    this._box(g, 0.04, 0.04, 0.022, trim, -0.13, 0.37, z + 0.01);
    this._box(g, 0.04, 0.04, 0.022, trim, 0.13, 0.37, z + 0.01);

    // 弹匣袋
    const pw = (w - 0.03) / cols;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.015 + pw * (i + 0.5);
      const pou = this._cyl(g, pw * 0.44, pw * 0.44, 0.13, 10, pouch, x, 0.31, z + 0.055);
      pou.scale.z = 0.42;
      this._box(g, pw - 0.03, 0.014, 0.06, trim, x, 0.366, z + 0.058);
      this._box(g, pw - 0.04, 0.012, 0.012, hardware, x, 0.267, z + 0.062);
    }
    // 手雷 / 杂物袋
    this._cyl(g, 0.035, 0.035, 0.085, 10, pouch, w / 2 + 0.05, 0.30, z + 0.02).scale.z = 0.85;
    this._box(g, 0.06, 0.065, 0.05, pouch, -w / 2 - 0.045, 0.30, z + 0.01);

    this.gearTorso.add(g);
  }

  _buildBackpack(item) {
    const def = ITEMS[item.id] || {};
    const cap = def.capacity || [4, 3];
    const scale = clamp(0.74 + cap[0] * 0.07, 0.82, 1.16);
    const main = this._std('pack-main', 0x3d453b, 0.9, 0.03);
    const pouch = this._std('pack-pouch', 0x2f3630, 0.88, 0.04);
    const strap = this._std('pack-strap', 0x23282a, 0.89, 0.06);
    const trim = this._rarityMat(def.rarity);
    const g = new THREE.Group();

    const w = 0.37 * scale;
    const h = 0.44 * scale;
    const d = 0.21 * scale;
    const z = -0.135 - d / 2;

    this._box(g, w, h, d, main, 0, 0.345, z);
    this._box(g, w * 0.94, 0.115, d * 1.04, pouch, 0, 0.345 + h / 2 - 0.01, z - 0.005); // 顶盖
    this._box(g, w * 0.7, 0.045, d * 1.02, trim, 0, 0.345 + h / 2 - 0.075, z);           // 识别条
    // 侧袋
    this._box(g, 0.075, 0.17, d * 0.7, pouch, -w / 2 - 0.03, 0.30, z);
    this._box(g, 0.075, 0.17, d * 0.7, pouch, w / 2 + 0.03, 0.30, z);
    // 肩带绕到胸前
    this._box(g, 0.065, 0.30, 0.03, strap, -0.14, 0.50, 0.125);
    this._box(g, 0.065, 0.30, 0.03, strap, 0.14, 0.50, 0.125);
    this._box(g, 0.05, 0.03, 0.035, trim, -0.14, 0.40, 0.14);
    this._box(g, 0.05, 0.03, 0.035, trim, 0.14, 0.40, 0.14);
    // 横置提手
    this._box(g, w * 0.5, 0.035, 0.045, strap, 0, 0.345 + h / 2 + 0.02, z);
    // 顶部卷垫（大包）
    if (cap[0] * cap[1] >= 12) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w * 0.9, 10), pouch);
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, 0.345 + h / 2 + 0.075, z);
      roll.castShadow = true;
      g.add(roll);
    }

    this.gearTorso.add(g);
  }

  // ────────── 武器 ──────────

  _buildGun(item) {
    const def = ITEMS[item.id] || {};
    const cls = def.cls || 'rifle';
    const rarity = def.rarity || 1;
    const metal = this._std('gun-steel', 0x39434a, 0.4, 0.6);
    const dark = this._std('gun-dark', 0x1a1e21, 0.58, 0.32);
    const accent = this._rarityMat(rarity);
    const wood = this._std('gun-wood', 0x5c4028, 0.64, 0.04);
    const tan = this._std('gun-tan', 0x7d6a4d, 0.8, 0.04);
    const furniture = WOOD_GUNS.has(item.id) ? wood : (item.id === 'w_svd' ? tan : dark);
    const g = new THREE.Group();

    const box = (w, h, d, mat, x, y, z) => this._box(g, w, h, d, mat, x, y, z);

    if (cls === 'pistol') {
      box(0.048, 0.068, 0.22, metal, 0, 0.03, 0.03);          // 套筒
      box(0.044, 0.052, 0.19, dark, 0, -0.01, 0.015);          // 枪身
      this._tube(g, 0.011, 0.05, metal, 0, 0.032, 0.16);       // 枪口
      const grip = box(0.046, 0.125, 0.062, dark, 0, -0.075, -0.055);
      grip.rotation.x = -0.2;
      box(0.012, 0.05, 0.012, accent, 0, -0.04, 0.10);          // 识别条
      box(0.016, 0.02, 0.03, metal, 0, 0.072, 0.115);           // 准星
    } else if (cls === 'smg') {
      box(0.06, 0.088, 0.30, dark, 0, 0.02, 0.01);             // 机匣
      box(0.05, 0.055, 0.15, metal, 0, 0.03, 0.225);           // 护木
      this._tube(g, 0.012, 0.16, metal, 0, 0.032, 0.37);       // 枪管
      const mag = box(0.04, 0.18, 0.065, dark, 0, -0.10, 0.055);
      mag.rotation.x = -0.06;
      const grip = box(0.038, 0.11, 0.055, dark, 0, -0.09, -0.075);
      grip.rotation.x = 0.22;
      box(0.045, 0.075, 0.14, dark, 0, 0.015, -0.21);          // 折叠托
      box(0.05, 0.02, 0.14, metal, 0, 0.072, 0.0);             // 顶部导轨
      box(0.026, 0.065, 0.05, metal, 0, 0.075, 0.05);          // 红点
      box(0.012, 0.02, 0.06, accent, 0.032, 0.0, -0.02);
    } else if (cls === 'shotgun') {
      this._tube(g, 0.018, 0.52, metal, 0, 0.035, 0.33);       // 枪管
      this._tube(g, 0.014, 0.40, dark, 0, -0.02, 0.30);        // 弹管
      box(0.062, 0.095, 0.26, dark, 0, 0.01, -0.01);           // 机匣
      const pump = box(0.062, 0.055, 0.14, furniture, 0, -0.005, 0.25);
      pump.scale.set(1.05, 1, 1);
      const grip = box(0.04, 0.11, 0.055, dark, 0, -0.085, -0.095);
      grip.rotation.x = 0.24;
      box(0.05, 0.075, 0.20, furniture, 0, 0.0, -0.25);        // 枪托
      box(0.012, 0.02, 0.08, accent, 0.034, 0.02, 0.0);
    } else if (cls === 'sniper') {
      box(0.055, 0.085, 0.34, dark, 0, 0.02, 0.02);            // 机匣
      this._tube(g, 0.014, 0.60, metal, 0, 0.035, 0.48);       // 长枪管
      this._tube(g, 0.024, 0.07, dark, 0, 0.035, 0.80);        // 枪口制退器
      box(0.055, 0.07, 0.22, furniture, 0, 0.0, -0.26);        // 枪托
      box(0.05, 0.035, 0.16, furniture, 0, 0.06, -0.22);       // 贴腮板
      const grip = box(0.038, 0.11, 0.055, dark, 0, -0.09, -0.08);
      grip.rotation.x = 0.24;
      box(0.045, 0.16, 0.07, dark, 0, -0.09, 0.09);            // 弹匣
      this._tube(g, 0.03, 0.24, dark, 0, 0.115, 0.05);         // 瞄准镜
      this._tube(g, 0.037, 0.05, metal, 0, 0.115, 0.18);
      box(0.012, 0.02, 0.09, accent, 0.034, 0.0, 0.0);
    } else {
      // 步枪
      box(0.06, 0.09, 0.32, dark, 0, 0.02, 0.01);              // 机匣
      box(0.052, 0.058, 0.22, item.id === 'w_ak74' ? wood : dark, 0, 0.028, 0.23); // 护木
      box(0.056, 0.024, 0.20, metal, 0, 0.062, 0.24);          // 导气管
      this._tube(g, 0.013, 0.30, metal, 0, 0.038, 0.47);       // 枪管
      this._tube(g, 0.021, 0.065, dark, 0, 0.038, 0.64);       // 枪口
      const mag = box(0.044, 0.155, 0.075, dark, 0, -0.085, 0.06);
      mag.rotation.x = -0.22;
      const grip = box(0.038, 0.11, 0.055, dark, 0, -0.085, -0.075);
      grip.rotation.x = 0.24;
      box(0.05, 0.085, 0.21, item.id === 'w_ak74' ? wood : furniture, 0, 0.012, -0.255); // 枪托
      box(0.05, 0.02, 0.13, metal, 0, 0.073, 0.0);             // 顶部导轨
      if (rarity >= 3) {
        this._tube(g, 0.027, 0.10, dark, 0, 0.105, 0.02);      // 光学瞄具
        this._tube(g, 0.033, 0.03, metal, 0, 0.105, 0.08);
      } else {
        box(0.02, 0.035, 0.035, metal, 0, 0.085, 0.13);        // 准星
        box(0.02, 0.03, 0.03, metal, 0, 0.08, -0.07);
      }
      box(0.012, 0.02, 0.10, accent, 0.033, 0.0, 0.0);
      // 弹匣侧袋
      box(0.012, 0.06, 0.05, dark, 0.026, -0.09, 0.06);
    }

    return g;
  }

  _buildMountedWeapon(item, kind) {
    const def = ITEMS[item.id] || {};
    const isPistol = def.cls === 'pistol';
    const gun = this._buildGun(item);
    const holder = new THREE.Group();

    if (isPistol) {
      gun.rotation.x = Math.PI / 2;
      gun.rotation.z = 0.1;
      holder.add(gun);
      const onRight = kind === 'primary';
      holder.position.set(onRight ? 0.245 : -0.245, -0.13, 0.055);
      holder.rotation.z = onRight ? 0.1 : -0.1;

      // 枪套
      const holster = new THREE.Group();
      this._box(holster, 0.09, 0.20, 0.11, this._std('holster', 0x20242a, 0.84, 0.12), 0, 0, 0);
      this._box(holster, 0.02, 0.16, 0.08, this._std('holster-strap', 0x171a1d, 0.88, 0.08), onRight ? 0.05 : -0.05, 0, 0);
      holster.position.set(holder.position.x, holder.position.y - 0.02, holder.position.z - 0.005);
      holster.rotation.z = holder.rotation.z;
      this.gearHips.add(holster);
      this.gearHips.add(holder);
      return;
    }

    if (kind === 'primary') {
      // 斜挂在胸前
      gun.rotation.y = Math.PI / 2;
      holder.add(gun);
      holder.position.set(0.03, 0.31, 0.34);
      holder.rotation.set(0.03, 0.14, -0.82);
      this.gearTorso.add(holder);
      // 斜跨背带
      const strap = this._box(this.gearTorso, 0.05, 0.72, 0.014,
        this._std('sling', 0x2c2f2a, 0.9, 0.05), 0, 0.30, 0.163);
      strap.rotation.z = 0.74;
      this._box(this.gearTorso, 0.045, 0.05, 0.022,
        this._rarityMat(def.rarity), 0.15, 0.47, 0.17);
    } else {
      // 背在身后
      gun.rotation.y = Math.PI / 2;
      holder.add(gun);
      holder.position.set(0.0, 0.36, -0.37);
      holder.rotation.set(0.05, 0, 0.56);
      this.gearTorso.add(holder);
    }
  }

  // ═══════════════ 挂载 / 生命周期 ═══════════════

  mount(container) {
    if (!container) return;
    this.container = container;
    if (!this.canvas) this.canvas = this.renderer.domElement;
    this.canvas.className = 'char-canvas';
    if (this.canvas.parentElement !== container) {
      container.insertBefore(this.canvas, container.firstChild);
    }
    if (!this._pointerBound) this._bindPointer();
    if (this._resizeObs) this._resizeObs.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(() => this.resize());
      this._resizeObs.observe(container);
    }
    this.resize();
  }

  start() {
    if (this.running) {
      this.resize();
      return;
    }
    this.running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, Math.max(0.0001, (now - this._last) / 1000));
      this._last = now;
      this.resizeIfNeeded(dt);
      this._tick(dt);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  resize() {
    if (!this.container || !this.renderer) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  resizeIfNeeded(dt) {
    const now = performance.now();
    if (this._resizeTimer == null) this._resizeTimer = 0;
    this._resizeTimer += dt;
    if (this._resizeTimer > 0.4) {
      this._resizeTimer = 0;
      const w = this.container ? this.container.clientWidth : 0;
      const h = this.container ? this.container.clientHeight : 0;
      if (w > 0 && h > 0 && (Math.abs(w - this._w) > 1 || Math.abs(h - this._h) > 1)) {
        this._w = w;
        this._h = h;
        this.resize();
      }
    }
  }

  _tick(dt) {
    const t = (this._time += dt);

    if (!this.dragging) {
      if (Math.abs(this.velocity) > 0.0004) {
        this.yaw += this.velocity;
        this.velocity *= Math.pow(0.002, dt);
        this.targetYaw = this.yaw;
      } else {
        this.velocity = 0;
        const diff = this.targetYaw - this.yaw;
        if (Math.abs(diff) > 0.0002) this.yaw += diff * Math.min(1, dt * 9);
        else this.yaw = this.targetYaw;
      }
    }
    this.root.rotation.y = this.yaw;

    // 待机动作由骨骼动画系统驱动
    if (this.anim) this.anim.update(dt);

    if (this.deco) this.deco.rotation.y = t * 0.12;

    // 尘埃缓慢上浮
    if (this._dust) {
      const attr = this._dust.geometry.attributes.position;
      for (let i = 0; i < this._dustSeed.length; i++) {
        const s = this._dustSeed[i];
        const y = 0.12 + ((t * s.speed + s.phase) % 2.15);
        attr.array[i * 3] = s.x + Math.sin(t * 0.4 + s.phase) * 0.05;
        attr.array[i * 3 + 1] = y;
        attr.array[i * 3 + 2] = s.z + Math.cos(t * 0.35 + s.phase) * 0.05;
      }
      attr.needsUpdate = true;
    }

    // 角度提示：拖拽停下后回传最近的 90° 朝向
    if (!this.dragging && Math.abs(this.velocity) < 0.002) {
      const q = ((Math.round(this.yaw / (Math.PI / 2)) % 4) + 4) % 4;
      if (q !== this._quarter) {
        this._quarter = q;
        if (this.onQuarter) this.onQuarter(q);
      }
    }
  }

  // ═══════════════ 交互 ═══════════════

  _bindPointer() {
    if (!this.canvas) return;
    this._pointerBound = true;

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      this.dragging = true;
      this._dragId = e.pointerId;
      this._dragX = e.clientX;
      this._lastDx = 0;
      this.velocity = 0;
      this._lastMove = performance.now();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.canvas.classList.add('dragging');
      e.preventDefault();
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this._dragId) return;
      const dx = e.clientX - this._dragX;
      this._dragX = e.clientX;
      this._lastDx = dx;
      this._lastMove = performance.now();
      this.yaw += dx * 0.011;
      this.targetYaw = this.yaw;
    });

    const end = (e) => {
      if (!this.dragging) return;
      if (e && e.pointerId != null && e.pointerId !== this._dragId) return;
      this.dragging = false;
      this._dragId = null;
      this.canvas.classList.remove('dragging');
      this.velocity = clamp(this._lastDx * 0.011, -0.22, 0.22);
      if (performance.now() - this._lastMove > 130) this.velocity = 0;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('lostpointercapture', end);

    this.canvas.addEventListener('dblclick', () => this.setAngle(0));
  }

  _shortest(delta) {
    return Math.atan2(Math.sin(delta), Math.cos(delta));
  }

  /** 旋转到指定角度（弧度，取最短路径）。 */
  setAngle(rad) {
    this.velocity = 0;
    this.targetYaw = this.yaw + this._shortest(rad - this.yaw);
  }

  /** 在当前位置基础上旋转。 */
  turnBy(rad) {
    this.velocity = 0;
    this.targetYaw += rad;
  }

  /** 返回当前最近的四分之一朝向 0..3。 */
  get quarter() {
    return ((Math.round(this.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  }

  dispose() {
    this.stop();
    if (this._resizeObs) this._resizeObs.disconnect();
    this._clearGear();
    if (this.humanoid) this.humanoid.dispose();
    else if (this.anim) this.anim.dispose();
    for (const mat of this._matCache.values()) mat.dispose();
    this._matCache.clear();
    if (this._envRT) this._envRT.dispose();
    this.scene && this.scene.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    if (this.renderer) this.renderer.dispose();
    this.canvas = null;
    this.scene = null;
    this.renderer = null;
  }
}
