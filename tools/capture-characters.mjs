// 近距离截取敌人角色模型（拾荒者 / 掠夺者 / 首领），用于检查比例、材质与姿态
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'C:/temp/edge-gz-chars-' + Date.now();
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--window-size=1400,850', 'about:blank'], { stdio: 'ignore' });
let ws; let id = 0; const pending = new Map(); const errors = [];
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = l.find((t) => t.type === 'page'); } catch (e) { /* retry */ }
    await sleep(500);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (m, p = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG: ' + m.params.entry.text);
  });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const waitFor = async (expr, t = 90000) => {
    const start = Date.now();
    while (Date.now() - start < t) {
      try { if (await ev(expr)) return true; } catch (e) { /* reload */ }
      await sleep(300);
    }
    return false;
  };
  const shot = async (name) => {
    const d = await send('Page.captureScreenshot', { format: 'png' });
    if (d.result?.data) fs.writeFileSync('shots/' + name + '.png', Buffer.from(d.result.data, 'base64'));
    console.log('saved shots/' + name + '.png');
  };

  await send('Page.navigate', { url: 'http://localhost:8080/?autostart=farm' });
  console.log('raid ready:', await waitFor("!!window.__game && window.__game.state === 'raid'", 90000));
  await sleep(1200);

  await ev(`(() => {
    const g = __game;
    g.ui.setHUDVisible(false);
    if (g.player.vmGroup) g.player.vmGroup.visible = false;
    g.player.updateViewmodel = function () { this.vmGroup.visible = false; };
    for (const e of g.enemies) {
      if (!e.__frozen) {
        e.__frozen = true;
        e.update = function (dt) {
          if (!this.alive) { if (this.assetAnim) this.assetAnim.update(dt); return; }
          this.updateAnimation(dt);
        };
      }
    }
    window.__inspectSetup = async (typeId) => {
      const { Enemy } = await import('/src/enemy.js');
      if (window.__inspect) {
        window.__inspect.group.parent && window.__inspect.group.parent.remove(window.__inspect.group);
        const i = g.enemies.indexOf(window.__inspect);
        if (i >= 0) g.enemies.splice(i, 1);
      }
      const p = g.player;
      p.velocity.set(0, 0, 0);
      const yaw = p.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const x = p.pos.x + fx * 2.8, z = p.pos.z + fz * 2.8;
      const e = new Enemy(g, g.world, typeId, x, z, { role: 'guard', baseFacing: yaw });
      e.facing = yaw;
      e.visualFacing = yaw;
      e.state = 'guard';
      e.group.rotation.y = yaw;
      e.update = function (dt) {
          if (!this.alive) { if (this.assetAnim) this.assetAnim.update(dt); return; }
          this.updateAnimation(dt);
        };
      g.enemies.push(e);
      window.__inspect = e;
      p.pitch = 0.02;
      return { type: typeId, x, z, groundY: e.groundY, facing: e.visualFacing };
    };
    return true;
  })()`);

  for (const type of ['scav', 'raider', 'boss']) {
    const info = await ev(`window.__inspectSetup('${type}')`);
    console.log(type + ':', JSON.stringify(info));
    await sleep(900);
    if (type === 'scav') {
      const dbg = await ev(`(async () => {
        const THREE = await import('three');
        const e = window.__inspect;
        const v = new e.group.position.constructor();
        const info = {
          name: e.assetAnim && e.assetAnim.currentName,
          asset: !!e.assetCfg,
          clips: e.assetClips,
          gunDir: e.gun ? e.gun.getWorldDirection(v).toArray().map((x) => +x.toFixed(2)) : null,
          groupRot: e.group.rotation.toArray().slice(0, 3).map((x) => +x.toFixed(2)),
          groupPos: e.group.position.toArray().map((x) => +x.toFixed(2)),
          groupScale: e.group.scale.toArray().map((x) => +x.toFixed(2)),
          modelScale: e.group.children[0] ? e.group.children[0].scale.toArray().map((x) => +x.toFixed(2)) : null,
          modelPos: e.group.children[0] ? e.group.children[0].position.toArray().map((x) => +x.toFixed(2)) : null,
          modelBox: (() => { const m = e.group.children[0]; if (!m) return null; const b = new THREE.Box3().setFromObject(m); return { min: b.min.toArray().map((x) => +x.toFixed(2)), max: b.max.toArray().map((x) => +x.toFixed(2)) }; })(),
          modelChildren: e.group.children[0] ? e.group.children[0].children.map((c) => [c.name, c.type, c.mesh ? 'mesh' : '']) : null,
          raw: (() => {
            const entry = window.__game.assets.enemyAssets.get('scav');
            const scene = entry && entry.gltf.scene;
            if (!scene) return null;
            const b = new THREE.Box3().setFromObject(scene);
            const meshes = [];
            scene.traverse((o) => {
              if (o.isMesh) meshes.push({ name: o.name, skinned: !!o.isSkinnedMesh,
                quat: o.quaternion.toArray().map((x) => +x.toFixed(2)),
                parentQ: o.parent ? o.parent.quaternion.toArray().map((x) => +x.toFixed(2)) : null,
                worldQ: o.getWorldQuaternion(new THREE.Quaternion()).toArray().map((x) => +x.toFixed(2)),
                bindQ: o.bindMatrix ? new THREE.Quaternion().setFromRotationMatrix(o.bindMatrix).toArray().map((x) => +x.toFixed(2)) : null,
                geoBox: o.geometry.boundingBox ? { min: o.geometry.boundingBox.min.toArray().map((x) => +x.toFixed(2)), max: o.geometry.boundingBox.max.toArray().map((x) => +x.toFixed(2)) } : null });
            });
            const manual = new THREE.Box3();
            scene.updateMatrixWorld(true);
            scene.traverse((o) => {
              if (o.isMesh) {
                o.geometry.computeBoundingBox();
                const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
                manual.union(bb);
              }
            });
            const precise = new THREE.Box3().setFromObject(scene, true);
            scene.traverse((o) => { if (o.isSkinnedMesh) { o.boundingBox = null; o.boundingSphere = null; } });
            const body = scene.getObjectByName('BodyGraphMesh');
            const info = { min: b.min.toArray().map((x) => +x.toFixed(2)), max: b.max.toArray().map((x) => +x.toFixed(2)),
              manualMin: manual.min.toArray().map((x) => +x.toFixed(2)), manualMax: manual.max.toArray().map((x) => +x.toFixed(2)),
              preciseMin: precise.min.toArray().map((x) => +x.toFixed(2)), preciseMax: precise.max.toArray().map((x) => +x.toFixed(2)), meshes };
            if (body) {
              info.bodyWorld = body.matrixWorld.elements.map((x) => +x.toFixed(2));
              info.bodyQuat = body.quaternion.toArray().map((x) => +x.toFixed(2));
              info.bodyPos = body.position.toArray().map((x) => +x.toFixed(2));
              info.bodyParents = [];
              let p = body;
              while (p) { info.bodyParents.push([p.name, p.type, p.quaternion.toArray().map((x) => +x.toFixed(2)), p.scale.toArray().map((x) => +x.toFixed(2))]); p = p.parent; }
              info.bindMatrix = body.bindMatrix.elements.map((x) => +x.toFixed(2));
            }
            return info;
          })(),
        };
        if (e.humanoid) {
          const b = e.humanoid.bones;
          info.armR = b.upperArmR.rotation.toArray().slice(0, 3).map((x) => +x.toFixed(2));
          info.foreR = b.lowerArmR.rotation.toArray().slice(0, 3).map((x) => +x.toFixed(2));
        }
        return info;
      })()`);
      console.log('anim debug:', JSON.stringify(dbg));
    }
    await shot('_enemy-' + type);
  }

  // 姿态检查：行走 / 瞄准 / 倒地
  await ev(`window.__inspectSetup('raider')`);
  await sleep(600);
  await ev(`(() => {
    const e = window.__inspect;
    e.state = 'guard';
    e.animSpeed = 3.4;
    e.walkPhase = 0.9;
    e.group.rotation.y = e.visualFacing + Math.PI / 2;
    return true;
  })()`);
  await sleep(700);
  await shot('_enemy-walk');
  await ev(`(() => {
    const e = window.__inspect;
    e.animSpeed = 0;
    e.state = 'combat';
    return true;
  })()`);
  await sleep(1100);
  await shot('_enemy-aim');
  const hurt = await ev(`(() => {
    const e = window.__inspect;
    e.takeDamage(200, 'head', { pen: 8 }, null);
    return { alive: e.alive, falling: e.deathFalling, hp: e.hp, asset: !!e.assetAnim };
  })()`);
  console.log('hurt:', JSON.stringify(hurt));
  await sleep(1200);
  await ev(`(() => { const e = window.__inspect; if (e.assetAnim && e.assetAnim.current) { e.assetAnim.current.time = 0.93; e.assetAnim.update(0.02); } return true; })()`);
  await sleep(200);
  const dead = await ev(`(() => {
    const e = window.__inspect;
    return { alive: e.alive, falling: e.deathFalling, deathT: e.deathT, rz: e.group.rotation.z, y: e.group.position.y, gy: e.groundY };
  })()`);
  console.log('dead:', JSON.stringify(dead));
  await shot('_enemy-dead');
  console.log('errors:', errors.slice(0, 10));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
