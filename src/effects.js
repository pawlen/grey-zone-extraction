// ═══════════════════════════════════════════════════
// 视觉特效：曳光弹 / 枪口焰 / 弹着点 / 血液
// ═══════════════════════════════════════════════════

import * as THREE from 'three';

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,200,120,0.9)');
  grad.addColorStop(0.6, 'rgba(255,150,60,0.25)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.bursts = [];
    this.flashes = [];
    this.glowTex = makeGlowTexture();
  }

  tracer(from, to, color = 0xffb066, opacity = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.85 * opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09, max: 0.09 });
  }

  muzzleFlash(pos, scale = 1) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffd9a0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.copy(pos);
    const s = (0.45 + Math.random() * 0.35) * scale;
    spr.scale.set(s, s, 1);
    this.scene.add(spr);
    this.flashes.push({ spr, life: 0.06, max: 0.06 });

    // 短暂点光
    const light = new THREE.PointLight(0xffc07a, 9, 7, 2);
    light.position.copy(pos);
    this.scene.add(light);
    this.flashes.push({ light, life: 0.05, max: 0.05 });
  }

  impact(point, normal = null) {
    // 灰尘
    const dustColor = 0xb9b3a4;
    this.burst(point, {
      count: 6, color: dustColor, size: 0.07, speed: 2.4, gravity: 4.5,
      life: 0.45, spread: 1, normal,
    });
    // 火花
    this.burst(point, {
      count: 4, color: 0xffb45e, size: 0.045, speed: 4.5, gravity: 8,
      life: 0.25, spread: 1.2, normal, additive: true,
    });
  }

  blood(point) {
    this.burst(point, {
      count: 8, color: 0xa3241f, size: 0.075, speed: 2.0, gravity: 7,
      life: 0.4, spread: 1.2,
    });
    this.burst(point, {
      count: 3, color: 0x6e1512, size: 0.11, speed: 1.2, gravity: 5,
      life: 0.3, spread: 0.8,
    });
  }

  burst(point, opts) {
    const count = opts.count || 6;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const spread = opts.spread || 1;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() * 0.8) * spread,
        (Math.random() - 0.5) * spread
      );
      if (opts.normal) dir.add(opts.normal.clone().multiplyScalar(0.9));
      dir.normalize().multiplyScalar((opts.speed || 2) * (0.4 + Math.random() * 0.8));
      velocities.push(dir);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: opts.color || 0xffffff,
      size: opts.size || 0.06,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.bursts.push({
      points, velocities,
      life: opts.life || 0.4, max: opts.life || 0.4,
      gravity: opts.gravity != null ? opts.gravity : 6,
    });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = 0.85 * (t.life / t.max);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        if (f.spr) {
          this.scene.remove(f.spr);
          f.spr.material.dispose();
        }
        if (f.light) this.scene.remove(f.light);
        this.flashes.splice(i, 1);
      } else if (f.spr) {
        f.spr.material.opacity = f.life / f.max;
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const posAttr = b.points.geometry.getAttribute('position');
      for (let j = 0; j < b.velocities.length; j++) {
        const v = b.velocities[j];
        v.y -= b.gravity * dt;
        posAttr.array[j * 3] += v.x * dt;
        posAttr.array[j * 3 + 1] += v.y * dt;
        posAttr.array[j * 3 + 2] += v.z * dt;
      }
      posAttr.needsUpdate = true;
      b.points.material.opacity = b.life / b.max;
    }
  }

  dispose() {
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
    }
    for (const f of this.flashes) {
      if (f.spr) { this.scene.remove(f.spr); f.spr.material.dispose(); }
      if (f.light) this.scene.remove(f.light);
    }
    for (const b of this.bursts) {
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
    }
    this.tracers = [];
    this.flashes = [];
    this.bursts = [];
    this.glowTex.dispose();
  }
}
