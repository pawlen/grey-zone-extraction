// ═══════════════════════════════════════════════════
// 玩家控制器：移动 / 射击 / 健康 / 负重 / 医疗
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { ITEMS } from './data.js';
import {
  carriedWeight, reserveAmmoCount, takeAmmo, consumeOne, countItem,
} from './inventory.js';
import { clamp, lerp } from './util.js';
import { AnimationController } from './assets.js';

const PART_LABELS = {
  head: '头部', thorax: '胸部', stomach: '腹部',
  armL: '左臂', armR: '右臂', legL: '左腿', legR: '右腿',
};

const BODY_PARTS = ['head', 'thorax', 'stomach', 'armL', 'armR', 'legL', 'legR'];
const MAX_PARTS = { head: 30, thorax: 80, stomach: 60, armL: 55, armR: 55, legL: 60, legR: 60 };

const MUZZLE_Z = { pistol: -0.96, smg: -1.24, rifle: -1.3, sniper: -1.5, shotgun: -1.4 };

function defaultAmmoFor(caliber) {
  let best = null;
  for (const def of Object.values(ITEMS)) {
    if (def.type !== 'ammo' || def.caliber !== caliber) continue;
    if (!best || def.pen < best.pen) best = def;
  }
  return best ? best.id : null;
}

export class Player {
  constructor(game, world, equipment, secure, spawn) {
    this.game = game;
    this.world = world;
    this.equipment = equipment;
    this.secure = secure;

    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.groundY = world.heightAt(spawn.x, spawn.z);
    const dx = -spawn.x, dz = -spawn.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = 0;

    this.alive = true;
    this.maxParts = { ...MAX_PARTS };
    this.parts = { ...MAX_PARTS };
    this.wounds = []; // {part, rate}
    this.stamina = 100;
    this.staminaMax = 100;
    this.exhausted = 0;
    this.weight = 0;
    this.weightTimer = 0;

    this.camera = game.camera;
    this.eyeStand = 1.62;
    this.eyeCrouch = 0.96;
    this.crouchT = 0;
    this.crouched = false;
    this.sprinting = false;
    this.moveAmount = 0;
    this.velocity = new THREE.Vector3();
    this.bobPhase = 0;
    this.bobAmount = 0;

    this.adsT = 0;
    this.scoped = false;
    this.fireTimer = 0;
    this.recoilPitch = 0;
    this.recoilRoll = 0;
    this.vmKick = 0;
    this.vmBlocked = false;
    this.wallTimer = 0;
    this._wallDir = new THREE.Vector3();
    this.vmSwayX = 0;
    this.vmSwayY = 0;
    this.shake = 0;
    this.hitFlash = 0;
    this.lastDamageTime = -99;

    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadTotal = 1;
    this.medUse = null; // {itemId, kind, timer, total}
    this.switchTimer = 0;

    this.footTimer = 0;
    this.bleedTick = 0;
    this.currentSpreadDeg = 1;

    // 武器
    this.activeSlot = equipment.primary ? 'primary' : (equipment.secondary ? 'secondary' : null);
    this.weapon = this.activeSlot ? equipment[this.activeSlot] : null;
    this.weaponDef = this.weapon ? ITEMS[this.weapon.id] : null;
    if (this.weapon && this.weapon.rounds > 0 && !this.weapon.loadedAmmoId) {
      this.weapon.loadedAmmoId = defaultAmmoFor(this.weaponDef.caliber);
    }

    this.vmGroup = new THREE.Group();
    this.vmGroup.position.set(0.3, -0.33, -0.86);
    this.vmGroup.scale.setScalar(0.66);
    this.camera.add(this.vmGroup);

    // 贴近镜头的补光，避免枪械模型在暗处糊成一团黑
    this.vmLight = new THREE.PointLight(0xdfe8ee, 3.2, 3.5, 2);
    this.vmLight.position.set(0.15, 0.2, 0.1);
    this.camera.add(this.vmLight);
    this.vmModel = null;
    this.vmIsAsset = false;
    this.muzzleNode = null;
    this.weaponAnim = null;
    this.weaponAnimLock = 0;
    this.weaponClips = {};
    this.muzzleNode = null;
    this.weaponClips = {};
    this.buildViewmodel();

    this.baseFov = 75;
    this.applyCamera(0);
    this.updateWeight();
  }

  // ────────── 武器模型 ──────────

  buildViewmodel() {
    if (this.vmModel) {
      this.vmGroup.remove(this.vmModel);
      if (!this.vmIsAsset) {
        this.vmModel.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) m.dispose();
          }
        });
      }
      this.vmIsAsset = false;
      this.vmModel = null;
      this.muzzleNode = null;
      if (this.weaponAnim) {
        this.weaponAnim.dispose();
        this.weaponAnim = null;
      }
    }
    if (!this.weaponDef) return;

    const asset = this.weapon?.id && this.game.assets ? this.game.assets.getWeaponAsset(this.weapon.id) : null;
    if (asset) {
      this.buildAssetViewmodel(asset);
      return;
    }

    this.weaponClips = {};
    this.muzzleNode = null;
    this.vmModel = this.makeGun(this.weaponDef.cls, this.weapon?.id);
    this.vmGroup.add(this.vmModel);
    this.applyWeaponMaterialDetails(this.vmModel);
  }

  buildAssetViewmodel(asset) {
    const cfg = asset.cfg || {};
    const model = asset.scene;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
        o.userData.asset = true;
      }
    });
    if (cfg.position) model.position.fromArray(cfg.position);
    if (cfg.rotation) model.rotation.fromArray(cfg.rotation);
    if (cfg.scale) model.scale.setScalar(cfg.scale);
    model.userData.asset = true;
    this.vmGroup.add(model);
    this.vmModel = model;
    this.vmIsAsset = true;
    this.weaponClips = cfg.clips || {};
    this.muzzleNode = cfg.muzzle ? model.getObjectByName(cfg.muzzle) : null;
    if (asset.clips && asset.clips.length) {
      this.weaponAnim = new AnimationController(model, asset.clips);
      if (this.weaponClips.idle) this.weaponAnim.play(this.weaponClips.idle);
    }
  }

  makeGun(cls, weaponId = '') {
    const g = new THREE.Group();

    const steel = new THREE.MeshStandardMaterial({ color: 0x4c545c, roughness: 0.32, metalness: 0.35 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.4 });
    const steelLight = new THREE.MeshStandardMaterial({ color: 0x757e87, roughness: 0.26, metalness: 0.45 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.78, metalness: 0.05 });
    const polymerTan = new THREE.MeshStandardMaterial({ color: 0x8b7a5e, roughness: 0.8, metalness: 0.03 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.6, metalness: 0.02 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x523a26, roughness: 0.68, metalness: 0.02 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x9a7c48, roughness: 0.5, metalness: 0.3 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2b2e29, roughness: 0.92, metalness: 0.02 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x353a30, roughness: 0.95, metalness: 0.02 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x27495c, roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.55 });
    const white = new THREE.MeshBasicMaterial({ color: 0xe9eff3 });
    const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a });

    const B = (w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    const C = (rTop, rBot, len, x, y, z, mat, axis = 'z', seg = 12) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg), mat);
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      else if (axis === 'x') m.rotation.z = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const T = (radius, tube, x, y, z, mat, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 16, arc), mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };
    const rail = (len, x, y, z, mat = steelDark) => {
      const n = Math.max(2, Math.floor(len / 0.045));
      for (let i = 0; i < n; i++) {
        B(0.028, 0.012, 0.022, x, y, z - len / 2 + (i + 0.5) * (len / n), mat);
      }
    };
    const ironSight = (x, y, zRear, zFront, h = 0.035) => {
      B(0.03, 0.012, 0.012, x, y, zRear, steelDark);
      B(0.005, h, 0.006, x - 0.008, y + h / 2, zRear, steelDark);
      B(0.005, h, 0.006, x + 0.008, y + h / 2, zRear, steelDark);
      B(0.006, h + 0.006, 0.008, x, y + (h + 0.006) / 2, zFront, steelDark);
      B(0.003, 0.003, 0.0015, x, y + h * 0.72, zFront - 0.005, white);
    };
    const redDot = (x, y, z) => {
      B(0.03, 0.02, 0.08, x, y, z, steelDark);
      C(0.021, 0.021, 0.11, x, y + 0.03, z, steelDark, 'z', 12);
      C(0.017, 0.017, 0.004, x, y + 0.03, z - 0.056, glass, 'z', 12);
      C(0.017, 0.017, 0.004, x, y + 0.03, z + 0.056, glass, 'z', 12);
      B(0.004, 0.004, 0.002, x, y + 0.03, z - 0.059, redDotMat);
      B(0.008, 0.008, 0.02, x, y + 0.048, z, steelDark);
      B(0.02, 0.014, 0.02, x, y + 0.009, z, steelDark);
    };
    const scope = (x, y, z) => {
      B(0.03, 0.025, 0.03, x, y - 0.015, z - 0.08, steelDark);
      B(0.03, 0.025, 0.03, x, y - 0.015, z + 0.08, steelDark);
      C(0.032, 0.032, 0.28, x, y, z, steelDark, 'z', 14);
      C(0.032, 0.048, 0.08, x, y, z - 0.16, steelDark, 'z', 14);
      C(0.038, 0.03, 0.05, x, y, z + 0.15, steelDark, 'z', 14);
      C(0.043, 0.043, 0.004, x, y, z - 0.202, glass, 'z', 14);
      C(0.03, 0.03, 0.004, x, y, z + 0.176, glass, 'z', 14);
      C(0.018, 0.018, 0.02, x, y + 0.04, z + 0.02, steelDark, 'y', 10);
      C(0.015, 0.015, 0.02, x + 0.04, y, z + 0.02, steelDark, 'x', 10);
      T(0.033, 0.004, x, y, z - 0.05, steelDark);
      T(0.033, 0.004, x, y, z + 0.05, steelDark);
    };
    const triggerGuard = (x, y, z, w = 0.05, d = 0.1) => {
      B(w, 0.008, d, x, y - 0.045, z, steelDark);
      B(0.008, 0.04, 0.01, x - w / 2, y - 0.025, z - d * 0.32, steelDark);
      B(0.008, 0.04, 0.01, x + w / 2, y - 0.025, z - d * 0.32, steelDark);
      B(0.01, 0.03, 0.012, x, y - 0.018, z - d * 0.15, steelDark, 0.2);
    };
    const rightHand = (x, y, z) => {
      B(0.055, 0.08, 0.07, x, y, z, glove, 0.2);
      B(0.018, 0.022, 0.042, x - 0.018, y - 0.026, z + 0.032, glove, 0.35);
      B(0.017, 0.02, 0.04, x, y - 0.042, z + 0.034, glove, 0.35);
      B(0.016, 0.018, 0.038, x + 0.017, y - 0.055, z + 0.034, glove, 0.35);
      B(0.016, 0.038, 0.02, x + 0.032, y - 0.012, z + 0.014, glove, 0.1);
    };
    const leftHand = (x, y, z) => {
      B(0.055, 0.07, 0.08, x, y, z, glove, 0.1);
      B(0.04, 0.02, 0.06, x, y + 0.032, z + 0.005, glove, 0.05);
      B(0.014, 0.02, 0.035, x - 0.024, y + 0.018, z - 0.012, glove, 0.1);
    };

    if (cls === 'pistol') {
      B(0.06, 0.055, 0.27, 0, 0, -0.13, polymer);
      B(0.064, 0.062, 0.3, 0, 0.065, -0.15, steel);
      B(0.058, 0.012, 0.3, 0, 0.1, -0.15, steelDark);
      B(0.032, 0.02, 0.075, 0.013, 0.07, -0.08, steelDark);
      for (let i = 0; i < 5; i++) B(0.066, 0.03, 0.004, 0, 0.065, -0.015 - i * 0.014, steelDark);
      C(0.013, 0.013, 0.04, 0, 0.065, -0.31, steelDark, 'z');
      B(0.03, 0.012, 0.012, 0, 0.1, -0.02, steelDark);
      B(0.004, 0.004, 0.002, -0.009, 0.104, -0.025, white);
      B(0.004, 0.004, 0.002, 0.009, 0.104, -0.025, white);
      B(0.006, 0.018, 0.008, 0, 0.103, -0.29, steelDark);
      B(0.004, 0.004, 0.002, 0, 0.108, -0.293, white);
      B(0.05, 0.15, 0.078, 0, -0.09, 0.015, polymer, 0.22, 0, 0);
      B(0.052, 0.012, 0.082, 0, -0.168, 0.035, steelDark, 0.22, 0, 0);
      for (let i = 0; i < 4; i++) B(0.054, 0.006, 0.06, 0, -0.055 - i * 0.022, 0.005, steelDark, 0.22, 0, 0);
      B(0.018, 0.022, 0.022, 0, 0.074, 0.028, steelDark);
      B(0.006, 0.014, 0.05, -0.034, 0.045, -0.05, steelDark);
      triggerGuard(0, -0.005, -0.02, 0.045, 0.095);
      rightHand(0.005, -0.085, 0.035);
      B(0.052, 0.075, 0.06, -0.045, -0.075, 0.045, glove, 0.12);

      g.scale.setScalar(weaponId === 'w_deagle' ? 1.48 : 1.32);
    } else if (cls === 'smg') {
      const isPP = weaponId === 'w_pp19';
      const isUMP = weaponId === 'w_ump';
      const bodyMat = isUMP ? polymerTan : steel;
      B(0.075, 0.085, 0.34, 0, 0.01, -0.15, bodyMat);
      B(0.062, 0.055, 0.2, 0, -0.05, -0.08, polymer);
      B(0.068, 0.07, 0.22, 0, 0.0, -0.42, isPP ? steelDark : polymer);
      for (let i = 0; i < 4; i++) {
        B(0.004, 0.028, 0.075, 0.035, 0.0, -0.35 - i * 0.045, steelDark);
        B(0.004, 0.028, 0.075, -0.035, 0.0, -0.35 - i * 0.045, steelDark);
      }
      rail(0.24, 0, 0.075, -0.1);
      C(0.014, 0.014, 0.18, 0, 0.015, -0.58, steelDark, 'z');
      C(0.022, 0.022, 0.06, 0, 0.015, -0.675, steelDark, 'z', 10);
      ironSight(0, 0.085, -0.02, -0.52, 0.028);
      redDot(0, 0.1, -0.07);
      B(0.012, 0.012, 0.2, -0.025, 0.03, 0.08, steelDark);
      B(0.012, 0.012, 0.2, 0.025, 0.03, 0.08, steelDark);
      B(0.07, 0.1, 0.02, 0, 0.0, 0.19, polymer);
      B(0.05, 0.14, 0.07, 0, -0.11, -0.02, polymer, 0.16, 0, 0);
      B(0.052, 0.012, 0.075, 0, -0.18, 0.0, steelDark, 0.16, 0, 0);
      if (isPP) {
        C(0.045, 0.045, 0.11, 0, -0.1, -0.42, steelDark, 'z', 14);
        B(0.02, 0.04, 0.14, 0, -0.13, -0.38, steelDark);
      } else {
        const mag = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.062), steelDark);
          seg.position.set(0, -0.05 - i * 0.085, -0.03 - i * 0.028);
          seg.rotation.x = -0.1 - i * 0.09;
          mag.add(seg);
        }
        mag.position.set(0, -0.07, -0.13);
        g.add(mag);
      }
      B(0.032, 0.018, 0.07, 0.042, 0.055, -0.04, steelDark);
      B(0.008, 0.008, 0.045, 0.042, 0.05, -0.08, steelDark);
      triggerGuard(0, -0.04, -0.06, 0.045, 0.1);
      rightHand(0.005, -0.09, 0.02);
      leftHand(0.0, 0.01, -0.43);
    } else if (cls === 'rifle') {
      const ak = weaponId === 'w_ak74';
      const m4 = weaponId === 'w_m4';
      const sks = weaponId === 'w_sks';
      const handMat = sks || ak ? wood : polymerTan;
      B(0.072, 0.095, 0.32, 0, 0.01, -0.12, steel);
      if (ak || sks) {
        B(0.058, 0.028, 0.28, 0, 0.06, -0.12, steelDark);
        for (let i = 0; i < 5; i++) B(0.06, 0.006, 0.02, 0, 0.075, -0.02 - i * 0.05, steelDark);
      } else {
        rail(0.34, 0, 0.062, -0.1);
        B(0.064, 0.02, 0.3, 0, 0.052, -0.1, steelDark);
      }
      B(0.066, 0.075, 0.24, 0, -0.005, -0.36, handMat);
      if (m4) {
        for (let i = 0; i < 5; i++) {
          B(0.004, 0.03, 0.09, 0.035, -0.005, -0.28 - i * 0.045, steelDark);
          B(0.004, 0.03, 0.09, -0.035, -0.005, -0.28 - i * 0.045, steelDark);
        }
        rail(0.22, 0, 0.055, -0.36);
      } else {
        for (let i = 0; i < 3; i++) B(0.004, 0.02, 0.07, 0.034, 0.0, -0.3 - i * 0.06, steelDark);
      }
      if (ak || sks) {
        C(0.017, 0.017, 0.2, 0, 0.055, -0.36, steelDark, 'z');
        B(0.048, 0.035, 0.17, 0, 0.06, -0.34, woodDark);
      }
      C(0.014, 0.014, 0.22, 0, 0.012, -0.55, steelDark, 'z');
      C(0.021, 0.021, 0.06, 0, 0.012, -0.665, steelDark, 'z', 10);
      B(0.032, 0.05, 0.045, 0, 0.035, -0.6, steelDark);
      ironSight(0, 0.085, -0.03, -0.56, 0.034);
      if (m4) redDot(0, 0.09, -0.08);
      if (sks) {
        B(0.05, 0.1, 0.11, 0, -0.11, -0.18, steelDark, 0.1, 0, 0);
      } else {
        const mag = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.07), m4 ? steelDark : accent);
          seg.position.set(0, -0.05 - i * 0.088, -0.02 - i * 0.03);
          seg.rotation.x = -0.08 - i * 0.11;
          mag.add(seg);
        }
        mag.position.set(0, -0.08, -0.12);
        g.add(mag);
      }
      B(0.048, 0.14, 0.07, 0, -0.11, 0.0, sks ? woodDark : polymer, 0.2, 0, 0);
      if (sks) {
        B(0.046, 0.075, 0.2, 0, -0.025, 0.13, wood, 0.04, 0, 0);
        B(0.062, 0.115, 0.16, 0, -0.035, 0.31, wood, 0.04, 0, 0);
        B(0.066, 0.12, 0.02, 0, -0.04, 0.395, woodDark, 0.04, 0, 0);
      } else if (ak) {
        B(0.045, 0.075, 0.16, 0, -0.02, 0.13, wood, 0.06, 0, 0);
        B(0.06, 0.11, 0.16, 0, -0.035, 0.29, wood, 0.06, 0, 0);
        B(0.062, 0.115, 0.02, 0, -0.04, 0.375, woodDark, 0.06, 0, 0);
        B(0.042, 0.018, 0.1, 0, 0.038, 0.26, woodDark, 0.06, 0, 0);
      } else {
        C(0.022, 0.022, 0.24, 0, 0.02, 0.24, steelDark, 'z', 12);
        B(0.065, 0.1, 0.12, 0, -0.02, 0.33, polymerTan, 0.06, 0, 0);
        B(0.05, 0.03, 0.05, 0, 0.042, 0.3, polymerTan, 0.06, 0, 0);
        B(0.07, 0.115, 0.015, 0, -0.03, 0.395, polymer);
      }
      B(0.008, 0.014, 0.045, 0.045, 0.035, -0.02, steelDark);
      B(0.006, 0.02, 0.08, -0.04, 0.02, -0.08, steelDark, 0, 0, -0.15);
      B(0.03, 0.02, 0.07, 0.038, 0.03, -0.12, steelDark);
      triggerGuard(0, -0.045, -0.06, 0.05, 0.105);
      rightHand(0.005, -0.1, 0.02);
      leftHand(0.0, -0.02, -0.38);
    } else if (cls === 'shotgun') {
      const saiga = weaponId === 'w_saiga';
      B(0.075, 0.09, 0.34, 0, 0.01, -0.14, steel);
      B(0.06, 0.06, 0.2, 0, -0.045, -0.08, polymer);
      if (saiga) {
        B(0.05, 0.14, 0.09, 0, -0.13, -0.16, steelDark, 0.15, 0, 0);
      } else {
        B(0.05, 0.05, 0.2, 0, -0.06, -0.44, woodDark);
        for (let i = 0; i < 5; i++) B(0.054, 0.008, 0.03, 0, -0.06, -0.36 - i * 0.04, steelDark);
      }
      C(0.026, 0.026, 0.46, 0, 0.03, -0.48, steelDark, 'z', 12);
      C(0.02, 0.02, 0.4, 0, -0.03, -0.46, steelDark, 'z', 12);
      B(0.01, 0.015, 0.01, 0, 0.06, -0.7, accent);
      B(0.046, 0.075, 0.14, 0, -0.02, 0.12, wood, 0.06, 0, 0);
      B(0.062, 0.11, 0.16, 0, -0.035, 0.28, wood, 0.06, 0, 0);
      B(0.066, 0.115, 0.02, 0, -0.04, 0.365, woodDark, 0.06, 0, 0);
      B(0.048, 0.14, 0.07, 0, -0.11, 0.0, woodDark, 0.18, 0, 0);
      for (let i = 0; i < 3; i++) B(0.022, 0.06, 0.022, -0.042, 0.02, -0.16 - i * 0.03, accent);
      triggerGuard(0, -0.04, -0.06, 0.05, 0.1);
      rightHand(0.005, -0.1, 0.02);
      leftHand(0.0, -0.03, saiga ? -0.32 : -0.44);
    } else if (cls === 'sniper') {
      const mosin = weaponId === 'w_mosin';
      B(0.07, 0.09, 0.4, 0, 0.01, -0.18, steel);
      B(0.055, 0.03, 0.32, 0, 0.06, -0.16, steelDark);
      C(0.015, 0.015, 0.5, 0, 0.03, -0.62, steelDark, 'z', 10);
      C(0.024, 0.024, 0.12, 0, 0.03, -0.9, steelDark, 'z', 10);
      for (let i = 0; i < 3; i++) B(0.05, 0.008, 0.02, 0, 0.03, -0.87 - i * 0.03, steelDark);
      B(0.06, 0.08, 0.26, 0, -0.01, -0.42, wood);
      B(0.046, 0.08, 0.2, 0, -0.02, 0.13, wood, 0.05, 0, 0);
      B(0.062, 0.12, 0.18, 0, -0.03, 0.31, wood, 0.05, 0, 0);
      B(0.068, 0.135, 0.02, 0, -0.04, 0.405, woodDark, 0.05, 0, 0);
      B(0.045, 0.025, 0.14, 0, 0.06, 0.26, woodDark, 0.05, 0, 0);
      B(0.05, 0.14, 0.07, 0, -0.11, -0.02, woodDark, 0.2, 0, 0);
      scope(0, 0.115, -0.16);
      if (mosin) {
        C(0.01, 0.01, 0.1, 0.05, 0.04, 0.02, steelDark, 'x', 8);
        const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), steelDark);
        bolt.position.set(0.1, 0.04, 0.02);
        g.add(bolt);
      } else {
        B(0.008, 0.014, 0.06, 0.045, 0.04, -0.02, steelDark);
        B(0.03, 0.09, 0.08, 0, -0.12, -0.2, steelDark, 0.12, 0, 0);
      }
      ironSight(0, 0.085, -0.06, -0.6, 0.03);
      triggerGuard(0, -0.045, -0.07, 0.05, 0.1);
      rightHand(0.005, -0.1, 0.0);
      leftHand(0.0, -0.02, -0.42);
    }

    g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return g;
  }

  // ────────── 状态查询 ──────────

  get reserveAmmo() {
    if (!this.weaponDef) return 0;
    return reserveAmmoCount(this.equipment, this.secure, this.weaponDef.caliber);
  }

  get bleeding() { return this.wounds.length > 0; }

  get totalHealth() {
    let cur = 0, max = 0;
    for (const p of BODY_PARTS) { cur += this.parts[p]; max += this.maxParts[p]; }
    return cur / max;
  }

  getMedCounts() {
    return {
      kit: countItem(this.equipment, this.secure, 'med_kit'),
      bandage: countItem(this.equipment, this.secure, 'med_bandage'),
    };
  }

  getMuzzleWorldPos() {
    if (this.muzzleNode) {
      const v = new THREE.Vector3();
      this.muzzleNode.getWorldPosition(v);
      return v;
    }
    const z = this.weaponDef ? MUZZLE_Z[this.weaponDef.cls] || -1.2 : -1.2;
    const local = new THREE.Vector3(0.3 * (1 - this.adsT), -0.31 + 0.16 * this.adsT, z);
    return this.camera.localToWorld(local);
  }

  updateWeight() {
    this.weight = carriedWeight(this.equipment, this.secure);
  }

  // ────────── 主更新 ──────────

  update(dt, input) {
    if (!this.alive) {
      this.updateDead(dt);
      return;
    }

    const sens = (this.game.save.settings?.sensitivity || 1) * 0.0022;
    this.yaw -= (input.mouseDX || 0) * sens;
    this.pitch -= (input.mouseDY || 0) * sens;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.vmSwayX = lerp(this.vmSwayX, clamp((input.mouseDX || 0) * 0.0016, -0.06, 0.06), Math.min(1, dt * 10));
    this.vmSwayY = lerp(this.vmSwayY, clamp((input.mouseDY || 0) * 0.0016, -0.06, 0.06), Math.min(1, dt * 10));
    input.mouseDX = 0;
    input.mouseDY = 0;

    this.weightTimer -= dt;
    if (this.weightTimer <= 0) {
      this.updateWeight();
      this.weightTimer = 0.4;
    }

    // 计时器
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    this.exhausted = Math.max(0, this.exhausted - dt);

    // 装填
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    // 医疗
    if (this.medUse) this.updateMed(dt);

    // 流血
    if (this.wounds.length) this.updateBleeding(dt);

    // 输入
    const keys = input.keys;
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    const wantSprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && fwd > 0 && !this.medUse;

    this.crouched = wantCrouch;
    this.crouchT = lerp(this.crouchT, wantCrouch ? 1 : 0, Math.min(1, dt * 9));

    if (wantSprint && this.stamina > 1 && this.exhausted <= 0 && this.canSprint()) {
      this.sprinting = true;
    } else {
      this.sprinting = false;
    }

    // ADS
    const wantAds = input.mouse.right && !this.sprinting && !this.medUse && this.switchTimer <= 0;
    this.adsT = lerp(this.adsT, wantAds ? 1 : 0, Math.min(1, dt * 12));
    if (this.adsT < 0.02) this.adsT = 0;

    // 移动速度
    let speedBase = this.crouched ? 2.3 : (this.sprinting ? 6.5 : 4.1);
    if (this.adsT > 0.2) speedBase *= lerp(1, 0.62, this.adsT);
    if (this.medUse) speedBase *= 0.45;
    const legBlack = (this.parts.legL <= 0 ? 1 : 0) + (this.parts.legR <= 0 ? 1 : 0);
    if (legBlack === 1) speedBase *= 0.65;
    if (legBlack === 2) speedBase *= 0.38;
    const heavy = this.weight > 22 ? clamp(1 - (this.weight - 22) * 0.015, 0.55, 1) : 1;
    speedBase *= heavy;

    const moveLen = Math.hypot(fwd, strafe) > 0 ? 1 : 0;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const desiredX = (fx * fwd + rx * strafe) * speedBase * (moveLen ? 1 : 0);
    const desiredZ = (fz * fwd + rz * strafe) * speedBase * (moveLen ? 1 : 0);
    const accel = this.sprinting ? 11 : 14;
    this.velocity.x = lerp(this.velocity.x, desiredX, Math.min(1, dt * accel));
    this.velocity.z = lerp(this.velocity.z, desiredZ, Math.min(1, dt * accel));
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += this.velocity.x * dt;
    this.pos.z += this.velocity.z * dt;
    this.world.resolveCircle(this.pos, 0.42);
    const newGround = this.world.heightAt(this.pos.x, this.pos.z);
    const stepUp = newGround - this.groundY;
    const slope = this.world.slopeAt(this.pos.x, this.pos.z);
    // 只阻挡“明显上坡/台阶”，下坡与沿等高线行走放行，避免出现看不见的空气墙。
    if ((stepUp > 0.02 && (stepUp > 0.5 || slope > 0.9)) || slope > 2.4) {
      this.pos.x = prevX;
      this.pos.z = prevZ;
      this.velocity.x *= 0.15;
      this.velocity.z *= 0.15;
    }
    this.groundY = this.world.heightAt(this.pos.x, this.pos.z);

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moveAmount = clamp(horizSpeed / 4, 0, 1.4);

    // 体力
    if (this.sprinting && horizSpeed > 1.5) {
      this.stamina = Math.max(0, this.stamina - dt * 17 * (this.parts.stomach <= 0 ? 1.4 : 1));
      if (this.stamina <= 0) this.exhausted = 1.6;
    } else {
      const regen = this.crouched ? 16 : 10;
      this.stamina = Math.min(this.staminaMax, this.stamina + dt * regen);
    }

    // 脚步声与噪音
    this.footTimer -= dt;
    if (horizSpeed > 1.0 && this.footTimer <= 0) {
      this.footTimer = this.sprinting ? 0.34 : (this.crouched ? 0.68 : 0.48);
      this.game.audio.footstep(this.crouched ? 0.35 : this.sprinting ? 1.0 : 0.7);
      const noiseRadius = this.crouched ? 3 : (this.sprinting ? 15 : 8);
      this.game.emitNoise(this.pos, noiseRadius, 'footstep');
    }

    // 镜头晃动
    if (horizSpeed > 0.5) this.bobPhase += dt * (this.sprinting ? 12.5 : 8.5);
    this.bobAmount = lerp(this.bobAmount, horizSpeed > 0.5 ? (this.sprinting ? 1 : 0.6) : 0, Math.min(1, dt * 8));
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.recoilPitch *= Math.exp(-dt * 7);
    this.recoilRoll *= Math.exp(-dt * 6);
    this.vmKick = Math.max(0, this.vmKick - dt * 7);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    // 准镜与镜头（先同步相机，保证射击方向与枪口位置正确）
    const sniperScoped = this.weaponDef && this.weaponDef.cls === 'sniper' && this.adsT > 0.72;
    this.scoped = !!sniperScoped;
    this.game.ui.setScope(this.scoped);
    this.applyCamera(dt);
    this.currentSpreadDeg = this.computeSpread();

    // 射击
    this.handleShooting(dt, input);
    this.applyCamera(dt);

    this.updateViewmodel(dt);
    input.firePressed = false;
  }

  canSprint() {
    return this.parts.legL > 0 || this.parts.legR > 0;
  }

  /** 打开背包等界面时仍会推进的状态（流血、用药、体力恢复） */
  tickPassive(dt) {
    if (!this.alive) return;
    if (this.wounds.length) this.updateBleeding(dt);
    if (this.medUse) this.updateMed(dt);
    this.stamina = Math.min(this.staminaMax, this.stamina + dt * 10);
    this.shake = Math.max(0, this.shake - dt * 2.6);
  }

  handleShooting(dt, input) {
    const weapon = this.weapon;
    const def = this.weaponDef;
    if (!weapon || !def) return;
    const wants = def.auto ? input.mouse.left : input.firePressed;
    if (!wants) return;
    if (this.medUse || this.switchTimer > 0) return;

    if (this.reloading) return;
    if (this.fireTimer > 0) return;

    if (weapon.rounds <= 0) {
      this.game.audio.dryFire();
      this.fireTimer = 0.35;
      if (this.reserveAmmo > 0) this.startReload();
      return;
    }

    this.fireOnce();
  }

  fireOnce() {
    const weapon = this.weapon;
    const def = this.weaponDef;
    if (!weapon || weapon.rounds <= 0) return;
    if (!weapon.loadedAmmoId) weapon.loadedAmmoId = defaultAmmoFor(def.caliber);
    const ammo = ITEMS[weapon.loadedAmmoId] || { damage: 35, pen: 1, pellets: 1 };

    const spreadDeg = this.computeSpread();
    this.currentSpreadDeg = spreadDeg;
    const spreadRad = (spreadDeg * Math.PI) / 180;
    const pellets = ammo.pellets || 1;
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const baseDir = new THREE.Vector3();
    this.camera.getWorldDirection(baseDir);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const dirs = [];
    for (let i = 0; i < pellets; i++) {
      const r = Math.sqrt(Math.random()) * spreadRad;
      const theta = Math.random() * Math.PI * 2;
      const dir = baseDir.clone()
        .addScaledVector(right, Math.tan(r) * Math.cos(theta))
        .addScaledVector(up, Math.tan(r) * Math.sin(theta))
        .normalize();
      dirs.push(dir);
    }

    weapon.rounds -= 1;
    this.fireTimer = 60 / def.rpm;

    // 后坐力
    const recoilMul = lerp(1.15, 0.75, this.adsT) * (this.parts.armL <= 0 || this.parts.armR <= 0 ? 1.35 : 1);
    this.recoilPitch += def.recoil * 0.0085 * recoilMul;
    this.recoilRoll += (Math.random() - 0.5) * def.recoil * 0.004;
    this.pitch = clamp(this.pitch + def.recoil * 0.002, -1.45, 1.45);
    this.vmKick = 1;
    if (this.weaponAnim && this.weaponAnim.has(this.weaponClips.fire)) {
      this.weaponAnim.playOnce(this.weaponClips.fire);
      this.weaponAnimLock = 0.14;
    }

    this.game.handleShot({
      origin,
      dirs,
      weaponDef: def,
      ammoDef: ammo,
      weaponItem: weapon,
      muzzlePos: this.getMuzzleWorldPos(),
    });
    this.game.emitNoise(this.pos, 62, 'gunshot');
  }

  computeSpread() {
    if (!this.weaponDef) return 0;
    const def = this.weaponDef;
    let spread = lerp(def.spread, def.adsSpread, this.adsT);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 1) spread *= lerp(1, 1.7, clamp((speed - 1) / 3, 0, 1));
    if (this.sprinting) spread *= 2.0;
    if (this.crouched) spread *= 0.78;
    if (this.parts.armL <= 0 || this.parts.armR <= 0) spread *= 1.4;
    if (this.stamina < 25) spread *= 1.25;
    return spread;
  }

  // ────────── 装填 ──────────

  startReload() {
    const weapon = this.weapon;
    const def = this.weaponDef;
    if (!weapon || !def || this.reloading) return;
    if (weapon.rounds >= def.magSize) return;
    if (this.reserveAmmo <= 0) {
      this.game.ui.log('没有备用弹药', 'bad');
      this.game.audio.dryFire();
      return;
    }
    this.reloading = true;
    this.medUse = null;
    if (this.weaponAnim && this.weaponAnim.has(this.weaponClips.reload)) {
      this.weaponAnim.playOnce(this.weaponClips.reload);
      this.weaponAnimLock = 0.4;
    }
    this.reloadTotal = def.reloadTime * (this.parts.armL <= 0 || this.parts.armR <= 0 ? 1.35 : 1);
    this.reloadTimer = this.reloadTotal;
    this.game.audio.reload();
    this.game.ui.setMedProgress(null);
  }

  finishReload() {
    this.reloading = false;
    const weapon = this.weapon;
    const def = this.weaponDef;
    if (!weapon || !def) return;
    const need = def.magSize - weapon.rounds;
    if (need <= 0) return;
    const take = takeAmmo(this.equipment, this.secure, def.caliber, need);
    if (take.count > 0) {
      weapon.rounds += take.count;
      weapon.loadedAmmoId = take.ammoId;
      this.game.audio.reloadDone();
    } else {
      this.game.ui.log('备用弹药已耗尽', 'bad');
    }
  }

  get reloadProgress() {
    if (!this.reloading) return null;
    return 1 - clamp(this.reloadTimer / this.reloadTotal, 0, 1);
  }

  // ────────── 切枪 ──────────

  switchWeapon(slot) {
    if (!this.alive) return;
    if (slot === this.activeSlot) return;
    if (this.medUse) {
      this.game.ui.log('正在使用医疗品');
      return;
    }
    const item = this.equipment[slot];
    if (!item) {
      this.game.ui.log(slot === 'primary' ? '没有主武器' : '没有副武器', 'bad');
      return;
    }
    if (this.reloading) {
      this.reloading = false;
      this.game.ui.setMedProgress(null);
    }
    this.activeSlot = slot;
    this.weapon = item;
    this.weaponDef = ITEMS[item.id];
    if (this.weapon.rounds > 0 && !this.weapon.loadedAmmoId) {
      this.weapon.loadedAmmoId = defaultAmmoFor(this.weaponDef.caliber);
    }
    this.switchTimer = 0.4;
    this.adsT = 0;
    this.buildViewmodel();
    this.game.audio.reload();
  }

  // ────────── 医疗 ──────────

  useMed(kind) {
    if (!this.alive || this.medUse) return;
    if (this.reloading) this.reloading = false;
    const itemId = kind === 'kit' ? 'med_kit' : 'med_bandage';
    const def = ITEMS[itemId];
    if (!def) return;
    if (countItem(this.equipment, this.secure, itemId) <= 0) {
      this.game.ui.log(kind === 'kit' ? '没有医疗包' : '没有绷带', 'bad');
      return;
    }
    if (kind === 'bandage' && !this.bleeding) {
      this.game.ui.log('当前没有流血伤口');
      return;
    }
    if (kind === 'kit') {
      const damaged = BODY_PARTS.some((p) => this.parts[p] > 0 && this.parts[p] < this.maxParts[p]);
      if (!damaged) {
        this.game.ui.log('身体状态良好，不需要治疗');
        return;
      }
    }
    this.adsT = 0;
    this.medUse = { itemId, kind, timer: def.useTime, total: def.useTime };
    this.game.audio.medUse();
    this.game.ui.log(kind === 'kit' ? '使用医疗包…' : '包扎伤口…');
  }

  updateMed(dt) {
    this.medUse.timer -= dt;
    const ui = this.game.ui;
    ui.setMedProgress(1 - clamp(this.medUse.timer / this.medUse.total, 0, 1), this.medUse.kind);
    if (this.medUse.timer <= 0) {
      const { itemId, kind } = this.medUse;
      this.medUse = null;
      ui.setMedProgress(null);
      if (kind === 'bandage') {
        this.wounds = [];
        consumeOne(this.equipment, this.secure, itemId);
        this.game.audio.medDone();
        ui.log('止血完成', 'good');
      } else {
        this.wounds = [];
        this.healBody(60);
        consumeOne(this.equipment, this.secure, itemId);
        this.game.audio.medDone();
        ui.log('治疗完成', 'good');
      }
    }
  }

  healBody(amount) {
    let left = amount;
    const order = ['thorax', 'head', 'stomach', 'armL', 'armR', 'legL', 'legR'];
    for (const p of order) {
      if (left <= 0) break;
      if (this.parts[p] <= 0) continue;
      const need = this.maxParts[p] - this.parts[p];
      if (need <= 0) continue;
      const add = Math.min(need, left);
      this.parts[p] += add;
      left -= add;
    }
  }

  // ────────── 伤害 ──────────

  takeDamage(amount, part, pen, sourceLabel = '') {
    if (!this.alive) return;
    if (!this.parts[part] && part !== 'head' && part !== 'thorax') {
      // 已残废的肢体受到伤害：一半转移至胸腔
      this.damagePart('thorax', amount * 0.5);
      this.game.audio.hurt();
      this.game.ui.damageFlash(0.5);
      return;
    }

    let armor = null;
    if (part === 'head') armor = this.equipment.helmet;
    else if (part === 'thorax' || part === 'stomach') armor = this.equipment.armor;

    if (armor && armor.dur > 0) {
      const armorDef = ITEMS[armor.id];
      if (armorDef) {
        const cls = armorDef.cls;
        if (pen < cls) {
          const mult = clamp(1 - (cls - pen) * 0.22, 0.12, 1);
          amount *= mult;
          armor.dur = Math.max(0, armor.dur - (1.1 + amount * 0.06));
          if (armor.dur <= 0) this.game.ui.log(`${armorDef.name} 已经损坏`, 'bad');
        } else {
          armor.dur = Math.max(0, armor.dur - 0.9);
        }
      }
    }

    this.lastDamageTime = performance.now() / 1000;
    this.shake = Math.min(1.4, this.shake + Math.min(1, amount / 30));
    this.hitFlash = 1;
    this.game.audio.hurt();
    this.game.ui.damageFlash(clamp(amount / 40, 0.25, 1), part);

    // 流血
    if (amount > 4 && Math.random() < 0.42 && this.wounds.length < 4) {
      const heavy = amount > 22;
      this.wounds.push({ part, rate: heavy ? 2.2 : 1.0 });
      this.game.ui.log(heavy ? '严重流血！' : '你开始流血', 'bad');
    }

    this.damagePart(part, amount);
  }

  damagePart(part, amount) {
    if (!this.alive) return;
    let hp = this.parts[part];
    if (hp <= 0) {
      if (part === 'head' || part === 'thorax') {
        this.die();
      } else {
        this.damagePart('thorax', amount * 0.5);
      }
      return;
    }
    hp -= amount;
    if (hp <= 0) {
      this.parts[part] = 0;
      if (part === 'head' || part === 'thorax') {
        this.game.ui.log(`${PART_LABELS[part]}受到致命伤`, 'bad');
        this.die();
      } else {
        this.game.ui.log(`${PART_LABELS[part]}已残废`, 'bad');
        this.game.audio.hurt();
      }
    } else {
      this.parts[part] = hp;
    }
  }

  updateBleeding(dt) {
    let died = false;
    for (const w of this.wounds) {
      const hp = this.parts[w.part];
      if (hp > 0) {
        this.parts[w.part] = Math.max(0, hp - w.rate * dt);
        if (this.parts[w.part] === 0) {
          if (w.part === 'head' || w.part === 'thorax') died = true;
          else this.game.ui.log(`${PART_LABELS[w.part]}因失血残废`, 'bad');
        }
      } else if (w.part !== 'head' && w.part !== 'thorax') {
        this.parts.thorax = Math.max(0, this.parts.thorax - w.rate * dt * 0.5);
        if (this.parts.thorax === 0) died = true;
      }
    }
    if (died) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.reloading = false;
    this.medUse = null;
    this.game.ui.setMedProgress(null);
    this.game.onPlayerDeath();
  }

  updateDead(dt) {
    // 倒地视角
    this.camera.position.set(this.pos.x, lerp(this.camera.position.y, this.groundY + 0.35, Math.min(1, dt * 2)), this.pos.z);
    this.camera.rotation.x = lerp(this.camera.rotation.x, -0.4, Math.min(1, dt * 1.5));
    this.camera.rotation.z = lerp(this.camera.rotation.z, 1.2, Math.min(1, dt * 1.5));
  }

  // ────────── 镜头与模型 ──────────

  applyCamera(dt) {
    const eye = lerp(this.eyeStand, this.eyeCrouch, this.crouchT);
    const bobX = Math.sin(this.bobPhase) * 0.018 * this.bobAmount;
    const bobY = Math.abs(Math.sin(this.bobPhase * 2)) * 0.022 * this.bobAmount;
    const shakeX = (Math.random() - 0.5) * this.shake * 0.02;
    const shakeY = (Math.random() - 0.5) * this.shake * 0.02;
    this.camera.position.set(this.pos.x + shakeX, this.groundY + eye + bobY + shakeY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + bobX * 0.5;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
    this.camera.rotation.z = this.recoilRoll + bobX * 0.4;

    let targetFov = this.baseFov;
    if (this.weaponDef && this.adsT > 0.001) {
      targetFov = lerp(this.baseFov, this.weaponDef.adsFov, this.adsT);
    }
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
  }

  applyWeaponMaterialDetails(model) {
    if (!this.game.assets || !model) return;
    const detail = this.game.assets.materials.getDetailNormalTexture();
    if (!detail) return;
    const seen = new Set();
    model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || !m.isMeshStandardMaterial || seen.has(m)) continue;
        seen.add(m);
        if (!m.normalMap) {
          m.normalMap = detail;
          m.normalScale.set(0.26, 0.26);
        }
        m.envMapIntensity = 0.9;
        m.needsUpdate = true;
      }
    });
  }

  updateViewmodel(dt) {
    const g = this.vmGroup;
    if (!this.vmModel) { g.visible = false; return; }
    this.wallTimer -= dt;
    if (this.wallTimer <= 0) {
      this.wallTimer = 0.22;
      this.camera.getWorldDirection(this._wallDir);
      const hit = this.world.raycast(this.camera.position, this._wallDir, 1.05);
      this.vmBlocked = !!hit && hit.distance < 0.92;
    }
    g.visible = !(this.scoped && this.adsT > 0.8) && !this.vmBlocked;

    const hipPos = { x: 0.3, y: -0.33, z: -0.86 };
    const adsPos = { x: 0.0, y: -0.16, z: -0.62 };
    let tx = lerp(hipPos.x, adsPos.x, this.adsT);
    let ty = lerp(hipPos.y, adsPos.y, this.adsT);
    let tz = lerp(hipPos.z, adsPos.z, this.adsT);

    // 行走摆动
    const bob = this.bobAmount * (1 - this.adsT * 0.7);
    tx += Math.sin(this.bobPhase) * 0.012 * bob;
    ty += Math.abs(Math.sin(this.bobPhase * 2)) * 0.008 * bob;
    // 冲刺压低
    if (this.sprinting) {
      const s = clamp(Math.hypot(this.velocity.x, this.velocity.z) / 6, 0, 1);
      ty -= 0.07 * s;
      tx += 0.03 * s;
    }
    // 后坐力
    tz += this.vmKick * 0.07;
    ty += this.vmKick * 0.012;
    // 换弹下压
    let reloadDip = 0;
    let reloadRot = 0;
    if (this.reloading) {
      const p = this.reloadProgress || 0;
      reloadDip = Math.sin(p * Math.PI) * 0.12;
      reloadRot = Math.sin(p * Math.PI) * 0.5;
    }
    // 医疗下压
    if (this.medUse) {
      reloadDip = Math.sin((1 - this.medUse.timer / this.medUse.total) * Math.PI) * 0.16;
    }
    ty -= reloadDip;

    if (this.weaponAnim) {
      this.weaponAnimLock = Math.max(0, this.weaponAnimLock - dt);
      if (this.weaponAnimLock <= 0) {
        const clips = this.weaponClips || {};
        const desired = this.adsT > 0.5 ? (clips.aim || clips.idle) : clips.idle;
        if (desired && desired !== this.weaponAnim.currentName) {
          this.weaponAnim.play(desired, { fade: 0.16, loop: true });
        }
      }
      this.weaponAnim.update(dt);
    }
    const baseYaw = lerp(0.07, 0, this.adsT);
    g.position.set(tx, ty, tz);
    g.rotation.x = this.vmSwayY * 0.6 + this.vmKick * 0.06 + reloadRot;
    g.rotation.y = this.vmSwayX * 0.7 + baseYaw;
    g.rotation.z = this.vmSwayX * 0.35;
  }
}

export { BODY_PARTS, PART_LABELS };
