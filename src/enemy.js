// ═══════════════════════════════════════════════════
// 敌人：关节模型 / 行走动画 / 守卫与巡逻 / 战斗 AI
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { ENEMY_TYPES } from './data.js';
import { clamp, lerp, randRange, randInt, normalizeAngle, dist, mulberry32 } from './util.js';
import { AnimationController } from './assets.js';
import { HumanoidRig } from './humanoid.js';

const PART_DISTRIBUTION = [
  ['head', 7], ['thorax', 38], ['stomach', 18],
  ['armL', 7], ['armR', 7], ['legL', 12], ['legR', 11],
];

function weightedPart() {
  let total = 0;
  for (const p of PART_DISTRIBUTION) total += p[1];
  let r = Math.random() * total;
  for (const [part, w] of PART_DISTRIBUTION) {
    r -= w;
    if (r <= 0) return part;
  }
  return 'thorax';
}

export class Enemy {
  constructor(game, world, typeId, x, z, opts = {}) {
    this.game = game;
    this.world = world;
    this.typeId = typeId;
    this.def = ENEMY_TYPES[typeId];
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    this.pos = new THREE.Vector3(x, 0, z);
    this.groundY = world.heightAt(x, z);
    this.role = opts.role || 'guard';
    this.baseFacing = opts.baseFacing != null ? opts.baseFacing : Math.atan2(-x, -z);
    this.facing = this.baseFacing;
    this.visualFacing = this.baseFacing;
    this.homeX = x;
    this.homeZ = z;

    this.alive = true;
    this.state = this.role === 'patrol' ? 'patrol' : 'guard';
    this.path = [];
    this.pathIdx = 0;
    this.repathTimer = 0;
    this.thinkTimer = Math.random() * 0.25;
    this.patrolTarget = null;
    this.patrolWait = 0;
    this.lastSeen = null;
    this.lastHeard = null;
    this.lostSightTimer = 0;
    this.aimTimer = 0;
    this.fireCooldown = 0;
    this.burstLeft = 0;
    this.burstPauseTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.hitMeshes = [];
    this.stuckTimer = 0;
    this.lastPos = this.pos.clone();

    this.walkPhase = Math.random() * Math.PI * 2;
    this.animSpeed = 0;
    this.animRecoil = 0;
    this.animSeed = Math.random() * 10;
    this.aimBlend = 0;
    this.deathT = 0;
    this.deathDir = Math.random() < 0.5 ? 1 : -1;
    this.deathFalling = false;
    this.assetAnim = null;
    this.assetAnimLock = 0;

    const external = this.game.assets ? this.game.assets.getEnemyAsset(typeId) : null;
    if (external) {
      this.buildAssetMesh(external);
    } else {
      this.buildMesh();
    }
    this.world.group.add(this.group);
  }

  // ────────── 关节模型 ──────────

  buildMesh() {
    const rig = new HumanoidRig({
      variant: this.typeId,
      palette: this.def.colors,
      detailNormal: this.game.assets ? this.game.assets.materials.getDetailNormalTexture() : null,
      preset: 'enemy',
      gear: true,
    });
    this.humanoid = rig;

    const g = new THREE.Group();
    g.position.set(this.pos.x, this.groundY, this.pos.z);
    g.scale.setScalar(this.def.scale);
    g.add(rig.object);
    this.group = g;

    rig.bindToEnemy(this);
    this.hitMeshes = rig.hitMeshes;

    // 程序化人形同样走 AnimationMixer 动画系统
    this.assetAnim = rig.anim;
    this.assetClips = rig.clipNames;

    // 枪械握在右手骨骼上，随瞄准/行走动作自然摆动
    const gun = this.makeAttachmentGun();
    gun.position.set(0.02, -0.02, 0.1);
    gun.rotation.set(1.5, 0, 0);
    rig.bones.handR.add(gun);
    this.gun = gun;

    if (this.typeId === 'boss') {
      const spr = this.world.makeLabel('首领 · 灰狼', '#e8a35a');
      spr.scale.set(4.2, 0.8, 1);
      spr.position.set(0, 2.6, 0);
      g.add(spr);
    }

    g.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  buildAssetMesh(asset) {
    const cfg = asset.cfg || {};
    const model = asset.scene;
    const g = new THREE.Group();
    g.position.set(this.pos.x, this.groundY, this.pos.z);
    this.group = g;

    // 蒙皮模型需要先更新矩阵，且用几何包围盒手动合并，
    // 否则 Box3.setFromObject 可能拿到未摆正/未蒙皮的包围盒导致体型缩放错误。
    const measure = (obj) => {
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3();
      obj.traverse((o) => {
        if (!o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      });
      return box;
    };
    const box = measure(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = cfg.targetHeight || 1.85;
    const normScale = targetHeight / Math.max(0.01, size.y);
    model.scale.multiplyScalar(normScale);
    model.rotation.y = cfg.rotationY != null ? cfg.rotationY : 0;

    const box2 = measure(model);
    model.position.y -= box2.min.y;
    g.add(model);

    this.hitMeshes = [];
    model.traverse((obj) => {
      if (!obj.isMesh && !obj.isSkinnedMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      obj.userData.asset = true;
      obj.userData.enemy = this;
      const name = (obj.name || '').toLowerCase();
      obj.userData.part = /visor|head|helmet/.test(name) ? 'head' : 'auto';
      this.hitMeshes.push(obj);
    });

    // 将程序化枪械挂到手部骨骼上
    const gun = this.makeAttachmentGun();
    let socket = null;
    if (cfg.weaponSocket) socket = model.getObjectByName(cfg.weaponSocket);
    if (!socket) socket = model.getObjectByName('mixamorig:RightHand') || model.getObjectByName('RightHand');
    if (socket) {
      socket.add(gun);
      gun.position.fromArray(cfg.weaponOffset || [0, 0.02, 0.05]);
      gun.rotation.set(...(cfg.weaponRotation || [0, 0, 0]));
      gun.scale.setScalar(cfg.weaponScale != null ? cfg.weaponScale : 0.42);
    } else {
      gun.position.set(0.28, 1.2, 0.3);
      gun.scale.setScalar(0.7);
      g.add(gun);
    }
    this.gun = gun;
    this.assetCfg = cfg;
    this.assetClips = cfg.clips || {};

    if (asset.clips && asset.clips.length) {
      this.assetAnim = new AnimationController(model, asset.clips);
      const idle = this.assetClips.idle || asset.clips[0].name;
      this.assetAnim.play(idle, { fade: 0 });
    }

    if (this.typeId === 'boss') {
      const spr = this.world.makeLabel('首领 · 灰狼', '#e8a35a');
      spr.scale.set(4.2, 0.8, 1);
      spr.position.set(0, 2.6, 0);
      g.add(spr);
    }
  }

  makeAttachmentGun() {
    const gun = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.45, metalness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f21, roughness: 0.75, metalness: 0.3 });
    const add = (w, h, d, x, y, z, m = mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      gun.add(mesh);
      return mesh;
    };
    add(0.07, 0.1, 0.58, 0, 0, 0.1);
    add(0.02, 0.02, 0.32, 0, 0.03, 0.5);
    add(0.05, 0.16, 0.08, 0, -0.12, 0.02, dark);
    add(0.045, 0.08, 0.2, 0, -0.01, -0.24, dark);
    add(0.04, 0.11, 0.06, 0, -0.1, -0.08, dark);
    add(0.035, 0.05, 0.08, 0, 0.08, 0.04, dark);
    return gun;
  }

  updateAssetAnimation(dt) {
    if (!this.assetAnim) return;
    if (this.assetAnimLock > 0) {
      this.assetAnimLock -= dt;
      this.assetAnim.update(dt);
      return;
    }
    if (this.alive) {
      const clips = this.assetClips || {};
      let name = clips.idle;
      const moving = this.animSpeed > 0.25;
      if (this.state === 'combat' && this.assetAnim.has(clips.aim)) {
        name = clips.aim;
      } else if (moving) {
        name = (this.animSpeed > 4.2 ? (clips.run || clips.walk) : (clips.walk || clips.idle));
      }
      if (name && name !== this.assetAnim.currentName) {
        this.assetAnim.play(name, { fade: 0.18, loop: true });
      }
    }
    this.assetAnim.update(dt);
  }

  get forward() {
    return { x: Math.sin(this.visualFacing), z: Math.cos(this.visualFacing) };
  }

  getMuzzlePos() {
    const f = this.forward;
    return new THREE.Vector3(this.pos.x + f.x * 0.72, this.groundY + 1.3, this.pos.z + f.z * 0.72);
  }

  // ────────── 感知 ──────────

  canSeePlayer() {
    const player = this.game.player;
    if (!player || !player.alive) return false;
    const d = dist(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    let vision = this.def.vision;
    if (player.crouched) vision *= 0.85;
    if (d > vision) return false;
    const toX = (player.pos.x - this.pos.x) / (d || 1);
    const toZ = (player.pos.z - this.pos.z) / (d || 1);
    const f = this.forward;
    const dot = f.x * toX + f.z * toZ;
    if (d > 3 && dot < Math.cos((this.def.fov * Math.PI) / 360)) return false;
    if (this.world.lineBlocked(this.pos.x, this.pos.z, player.pos.x, player.pos.z)) return false;
    return true;
  }

  hearNoise(pos, radius) {
    if (!this.alive || this.state === 'combat') return;
    const d = dist(this.pos.x, this.pos.z, pos.x, pos.z);
    const hearRange = Math.min(Math.max(radius, 5), this.def.hear);
    if (d > hearRange) return;
    const jitter = radius * 0.18;
    const tx = pos.x + randRange(Math.random, -jitter, jitter);
    const tz = pos.z + randRange(Math.random, -jitter, jitter);
    this.lastHeard = { x: tx, z: tz };
    if (this.state !== 'investigate') {
      this.state = 'investigate';
      this.path = [];
      this.patrolWait = 0;
    }
    this.thinkTimer = Math.min(this.thinkTimer, 0.1);
  }

  // ────────── 更新 ──────────

  update(dt) {
    if (!this.alive) {
      if (this.assetAnim) this.assetAnim.update(dt);
      return;
    }
    const player = this.game.player;
    if (!player || !player.alive) {
      this.state = this.role === 'patrol' ? 'patrol' : 'guard';
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.perceive();
      this.thinkTimer = 0.18 + Math.random() * 0.12;
    }

    this.repathTimer -= dt;
    this.aimTimer = Math.max(0, this.aimTimer - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.burstPauseTimer = Math.max(0, this.burstPauseTimer - dt);
    this.strafeTimer -= dt;

    const px = this.pos.x;
    const pz = this.pos.z;

    switch (this.state) {
      case 'guard': this.updateGuard(dt); break;
      case 'patrol': this.updatePatrol(dt); break;
      case 'investigate': this.updateInvestigate(dt); break;
      case 'combat': this.updateCombat(dt); break;
      default: this.updateGuard(dt);
    }

    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const measured = dt > 0.0001 ? moved / dt : 0;
    this.animSpeed = lerp(this.animSpeed, measured, Math.min(1, dt * 9));

    // 卡住检测
    this.stuckTimer -= dt;
    if (this.stuckTimer <= 0) {
      this.stuckTimer = 1.4;
      const movedTotal = dist(this.pos.x, this.pos.z, this.lastPos.x, this.lastPos.z);
      this.lastPos.copy(this.pos);
      if (movedTotal < 0.15 && this.path.length) {
        this.path = [];
        this.repathTimer = 0;
        if (this.state === 'patrol') this.patrolTarget = null;
      }
    }

    this.visualFacing += normalizeAngle(this.facing - this.visualFacing) * Math.min(1, dt * 8);
    this.groundY = this.world.heightAt(this.pos.x, this.pos.z);
    this.group.position.set(this.pos.x, this.groundY, this.pos.z);
    this.group.rotation.y = this.visualFacing;
    this.updateAnimation(dt);
  }

  updateAnimation(dt) {
    if (this.assetAnim) this.updateAssetAnimation(dt);
  }

  perceive() {
    const player = this.game.player;
    if (!player || !player.alive) return;
    const sees = this.canSeePlayer();
    if (sees) {
      this.lastSeen = { x: player.pos.x, z: player.pos.z };
      this.lostSightTimer = 0;
      if (this.state !== 'combat') {
        this.state = 'combat';
        this.aimTimer = this.def.reaction * (0.8 + Math.random() * 0.5);
        this.path = [];
        this.game.ui.onEnemyAlert(this);
      }
      this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    } else if (this.state === 'combat') {
      this.lostSightTimer += 0.25;
      if (this.lostSightTimer > 3.5) {
        this.state = 'investigate';
        this.lastHeard = this.lastSeen;
        this.path = [];
        this.aimTimer = 0;
      }
    }
  }

  updateGuard(dt) {
    // 守卫只原地观察/扫视，不随机走动
    this.facing = this.baseFacing + Math.sin(this.game.elapsed * 0.18 + this.animSeed) * 0.16;
    this.animSpeed = 0;
  }

  updatePatrol(dt) {
    if (this.patrolWait > 0) {
      this.patrolWait -= dt;
      this.facing += Math.sin(this.game.elapsed * 0.8 + this.pos.x) * dt * 0.25;
      return;
    }
    if (!this.patrolTarget) {
      this.patrolTarget = this.pickPatrolPoint();
      this.path = [];
    }
    if (this.patrolTarget) {
      if (!this.path.length) {
        this.path = this.world.findPath(this.pos.x, this.pos.z, this.patrolTarget.x, this.patrolTarget.z) || [];
        if (!this.path.length) {
          this.patrolTarget = null;
          this.patrolWait = 0.5;
          return;
        }
        this.pathIdx = 0;
      }
      const arrived = this.followPath(dt, this.def.speed);
      if (arrived) {
        this.patrolTarget = null;
        this.patrolWait = randRange(Math.random, 1.2, 3.5);
      }
    }
  }

  pickPatrolPoint() {
    const nav = this.world.nav;
    for (let i = 0; i < 36; i++) {
      const cx = Math.floor(Math.random() * nav.cols);
      const cy = Math.floor(Math.random() * nav.rows);
      if (!nav.isFree(cx, cy)) continue;
      const p = nav.center(cx, cy);
      const d = dist(p.x, p.z, this.pos.x, this.pos.z);
      if (d > 48 || d < 8) continue;
      return p;
    }
    return null;
  }

  updateInvestigate(dt) {
    const target = this.lastHeard || this.lastSeen;
    if (!target) {
      this.state = this.role === 'patrol' ? 'patrol' : 'guard';
      return;
    }
    if (!this.path.length) {
      const d = dist(this.pos.x, this.pos.z, target.x, target.z);
      if (d < 2.5) {
        this.lastHeard = null;
        this.lastSeen = null;
        this.patrolWait = randRange(Math.random, 2.0, 4.0);
        this.state = this.role === 'patrol' ? 'patrol' : 'guard';
        return;
      }
      this.path = this.world.findPath(this.pos.x, this.pos.z, target.x, target.z) || [];
      if (!this.path.length) {
        this.lastHeard = null;
        this.state = this.role === 'patrol' ? 'patrol' : 'guard';
        return;
      }
      this.pathIdx = 0;
    }
    this.followPath(dt, this.def.speed * 1.15);
  }

  updateCombat(dt) {
    const player = this.game.player;
    if (!player || !player.alive) return;
    const d = dist(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    const los = !this.world.lineBlocked(this.pos.x, this.pos.z, player.pos.x, player.pos.z);
    if (los) {
      this.lastSeen = { x: player.pos.x, z: player.pos.z };
      this.lostSightTimer = 0;
      this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    }

    if (this.strafeTimer <= 0) {
      this.strafeTimer = randRange(Math.random, 1.0, 2.6);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    let moveX = 0, moveZ = 0;
    if (los) {
      if (d > 24) {
        const f = this.forward;
        moveX = f.x; moveZ = f.z;
      } else if (d < 7) {
        const f = this.forward;
        moveX = -f.x; moveZ = -f.z;
      } else {
        const f = this.forward;
        moveX = f.z * this.strafeDir * 0.7;
        moveZ = -f.x * this.strafeDir * 0.7;
      }
    } else if (this.lastSeen) {
      const dx = this.lastSeen.x - this.pos.x;
      const dz = this.lastSeen.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      moveX = dx / len;
      moveZ = dz / len;
      if (!this.path.length && this.repathTimer <= 0) {
        this.repathTimer = 1.2;
        this.path = this.world.findPath(this.pos.x, this.pos.z, this.lastSeen.x, this.lastSeen.z) || [];
        this.pathIdx = 0;
      }
      if (this.path.length) {
        this.followPath(dt, this.def.chaseSpeed);
        moveX = 0; moveZ = 0;
      }
    }

    if (moveX || moveZ) {
      const speed = this.def.chaseSpeed * 0.55;
      this.pos.x += moveX * speed * dt;
      this.pos.z += moveZ * speed * dt;
      this.world.resolveCircle(this.pos, 0.4);
    }

    if (los && this.aimTimer <= 0) {
      if (this.burstLeft > 0) {
        if (this.fireCooldown <= 0) {
          this.fireAtPlayer(d);
          this.burstLeft--;
          this.fireCooldown = 0.12;
          if (this.burstLeft <= 0) this.burstPauseTimer = randRange(Math.random, this.def.burstPause[0], this.def.burstPause[1]);
        }
      } else if (this.burstPauseTimer <= 0) {
        this.burstLeft = randInt(Math.random, this.def.burst[0], this.def.burst[1]);
        this.fireCooldown = 0.05;
      }
    } else if (!los) {
      this.burstLeft = 0;
    }

    this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
  }

  fireAtPlayer(d) {
    const player = this.game.player;
    if (!player || !player.alive) return;
    const muzzle = this.getMuzzlePos();
    let chance = this.def.accuracy * clamp(1.25 - d / this.def.vision, 0.28, 1);
    if (player.sprinting) chance *= 0.8;
    if (player.crouched) chance *= 0.88;
    if (player.adsT > 0.5) chance *= 0.92;
    const hit = Math.random() < chance;

    let targetHead = new THREE.Vector3(player.pos.x, player.groundY + 1.2, player.pos.z);
    // 真实弹道遮挡：栏杆、集装箱、墙体、地形都会挡住子弹
    const toTarget = targetHead.clone().sub(muzzle);
    const distToTarget = toTarget.length();
    const dir = toTarget.normalize();
    const obstruction = this.world.raycast(muzzle, dir, distToTarget + 0.8);
    if (obstruction && obstruction.distance < distToTarget - 0.35) {
      hit = false;
      targetHead = obstruction.point.clone();
      this.game.effects.impact(obstruction.point, null);
    } else if (!hit) {
      targetHead.x += randRange(Math.random, -1.1, 1.1);
      targetHead.y += randRange(Math.random, -0.7, 0.9);
      targetHead.z += randRange(Math.random, -1.1, 1.1);
    }

    if (hit) {
      const part = weightedPart();
      const dmg = this.def.damage * (0.85 + Math.random() * 0.3);
      player.takeDamage(dmg, part, this.def.pen, this.def.name);
      this.game.effects.blood(targetHead);
    }

    this.animRecoil = 1;
    if (this.assetAnim && this.assetAnim.has(this.assetClips?.fire)) {
      this.assetAnim.playOnce(this.assetClips.fire);
      this.assetAnimLock = 0.25;
    }
    this.game.effects.tracer(muzzle, targetHead, 0xffb066, 0.9);
    this.game.effects.muzzleFlash(muzzle, 0.55);
    const pan = clamp((this.pos.x - player.pos.x) / 30, -1, 1) * -0.8;
    this.game.audio.enemyShoot(d, pan);
    this.game.ui.onEnemyShoot(this);
    this.game.emitNoise(this.pos, 36, 'gunshot');
  }

  followPath(dt, speed) {
    if (!this.path.length) return true;
    const target = this.path[this.pathIdx];
    if (!target) {
      this.path = [];
      return true;
    }
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.75) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) {
        this.path = [];
        return true;
      }
      return false;
    }
    const nx = dx / (d || 1);
    const nz = dz / (d || 1);
    this.pos.x += nx * speed * dt;
    this.pos.z += nz * speed * dt;
    this.world.resolveCircle(this.pos, 0.4);
    this.facing = Math.atan2(dx, dz);
    return false;
  }

  // ────────── 受伤 / 死亡 ──────────

  takeDamage(amount, part, ammoDef, hitPoint) {
    if (!this.alive) return;
    if (part === 'auto') {
      const rel = (hitPoint ? hitPoint.y : this.groundY + 1.2) - this.groundY;
      part = rel > 1.45 ? 'head' : (rel < 0.78 ? 'legs' : 'body');
    }
    let dmg = amount;
    let partMult = 1;
    if (part === 'head') partMult = 3.2;
    else if (part === 'legs') partMult = 0.72;
    dmg *= partMult;

    if (part === 'head' && this.def.helmetClass > 0) {
      const pen = ammoDef ? ammoDef.pen : 1;
      if (pen < this.def.helmetClass) {
        dmg *= clamp(1 - (this.def.helmetClass - pen) * 0.2, 0.18, 1);
      }
    } else if (part === 'body' && this.def.armorClass > 0) {
      const pen = ammoDef ? ammoDef.pen : 1;
      if (pen < this.def.armorClass) {
        dmg *= clamp(1 - (this.def.armorClass - pen) * 0.17, 0.15, 1);
      }
    }

    this.hp -= dmg;
    this.game.onEnemyHit(this, dmg, part === 'head', hitPoint);

    const player = this.game.player;
    if (player) {
      this.lastSeen = { x: player.pos.x, z: player.pos.z };
      if (this.state !== 'combat') {
        this.state = 'combat';
        this.aimTimer = Math.max(this.aimTimer, 0.25);
      }
      this.facing = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 0.6;
    }

    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    if (this.assetAnim && this.assetAnim.has(this.assetClips?.death)) {
      this.assetAnim.play(this.assetClips.death, { fade: 0.12, loop: false, clampWhenFinished: true });
    }
    this.assetAnimLock = 999;
    if (this.gun) this.gun.visible = false;
    this.game.onEnemyKilled(this);
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.humanoid) {
      this.humanoid.dispose();
      return;
    }
    if (this.assetCfg) {
      if (this.assetAnim) this.assetAnim.dispose();
      return;
    }
    this.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (!m.userData.shared) m.dispose();
      }
    });
  }
}
