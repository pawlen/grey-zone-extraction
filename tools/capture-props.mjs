// 近距离截取场景容器 GLB：node tools/capture-props.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9349;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'C:/temp/edge-gz-props-' + Date.now();
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

  await send('Page.navigate', { url: 'http://localhost:8080/?autostart=factory' });
  console.log('raid ready:', await waitFor("!!window.__game && window.__game.state === 'raid'"));
  await sleep(1200);
  await ev(`(() => {
    const g = __game;
    g.ui.setHUDVisible(false);
    if (g.player.vmGroup) g.player.vmGroup.visible = false;
    g.player.updateViewmodel = function () { this.vmGroup.visible = false; };
    for (const e of g.enemies) e.update = function (dt) { if (this.assetAnim) this.assetAnim.update(dt); };
    window.__lookAtContainer = (typeId, open) => {
      const c = g.world.containers.find((x) => !x.invisible && x.typeId === typeId);
      if (!c) return null;
      const p = g.player;
      const dx = 2.4, dz = 2.4;
      p.pos.x = c.pos.x + dx; p.pos.z = c.pos.z + dz;
      p.velocity.set(0, 0, 0);
      const dirX = c.pos.x - p.pos.x, dirZ = c.pos.z - p.pos.z;
      const d = Math.hypot(dirX, dirZ) || 1;
      p.yaw = Math.atan2(-dirX / d, -dirZ / d);
      p.pitch = c.def.height > 1.2 ? 0.02 : -0.28;
      if (open) c.opened = true;
      return { type: typeId, h: c.def.height, lid: !!c.lidPivot };
    };
    return true;
  })()`);

  for (const type of ['crate', 'toolbox', 'weapon_box', 'med_box', 'safe', 'locker', 'duffle', 'ammo_crate']) {
    const info = await ev(`window.__lookAtContainer('${type}', true)`);
    console.log(type + ':', JSON.stringify(info));
    if (!info) continue;
    await sleep(900);
    await shot('_prop-' + type);
  }
  console.log('errors:', errors.slice(0, 10));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
