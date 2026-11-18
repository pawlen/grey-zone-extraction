// 六张地图的出生点与边界截图：node tools/capture-maps.mjs [map]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9353;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maps = process.argv[2] ? [process.argv[2]] : ['factory', 'forest', 'port', 'snow', 'farm', 'city'];
const profile = 'C:/temp/edge-gz-maps-' + Date.now();
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
  const waitFor = async (expr, t = 120000) => {
    const start = Date.now();
    while (Date.now() - start < t) {
      try { if (await ev(expr)) return true; } catch (e) { /* reload */ }
      await sleep(400);
    }
    return false;
  };
  const shot = async (name) => {
    const d = await send('Page.captureScreenshot', { format: 'png' });
    if (d.result?.data) fs.writeFileSync('shots/' + name + '.png', Buffer.from(d.result.data, 'base64'));
    console.log('saved shots/' + name + '.png');
  };

  for (const map of maps) {
    await send('Page.navigate', { url: `http://localhost:8080/?autostart=${map}` });
    const ok = await waitFor(`!!window.__game && window.__game.state === 'raid' && window.__game.world && window.__game.map.id === '${map}'`, 150000);
    console.log(map, 'ready', ok);
    if (!ok) continue;
    await sleep(1200);
    const info = await ev(`(() => {
      const g = __game, w = g.world;
      g.ui.setHUDVisible(false);
      if (g.player.vmGroup) g.player.vmGroup.visible = false;
      g.player.updateViewmodel = function () { this.vmGroup.visible = false; };
      for (const e of g.enemies) e.update = function (dt) { if (this.assetAnim) this.assetAnim.update(dt); };
      return {
        size: g.map.size, half: w.half,
        enemies: g.enemies.length, zones: w.zones.length,
        containers: w.containers.length, colliders: w.colliders.length,
        children: w.group.children.length, lights: w.lights.length,
      };
    })()`);
    console.log(map, JSON.stringify(info));
    await sleep(600);
    await shot(`map-${map}`);
    // 边界视角
    await ev(`(() => {
      const g = __game, p = g.player, w = g.world;
      const target = w.nearestFreePosition(w.half * 0.42, -w.half * 0.78);
      p.pos.x = target.x; p.pos.z = target.z;
      p.velocity.set(0, 0, 0);
      p.yaw = 0; p.pitch = 0.03;
      p.applyCamera(0);
      return true;
    })()`);
    await sleep(900);
    await shot(`map-${map}-edge`);
  }
  console.log('errors:', errors.slice(0, 10));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
