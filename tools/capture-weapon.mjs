// 第一人称武器 GLB 截图：node tools/capture-weapon.mjs w_ak74
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9347;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const weapon = process.argv[2] || 'w_ak74';
const profile = 'C:/temp/edge-gz-weapon-' + Date.now();
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
  await send('Page.navigate', { url: `http://localhost:8080/?autostart=factory&weapon=${weapon}` });
  console.log('raid ready:', await waitFor("!!window.__game && window.__game.state === 'raid'"));
  await sleep(1500);
  const info = await ev(`(() => {
    const g = __game, p = g.player;
    return { weapon: p.weaponDef && p.weaponDef.id, asset: !!(p.weaponAnim || p.vmIsAsset), muzzle: !!p.muzzleNode,
      vm: p.vmModel ? { children: p.vmModel.children.map((c) => c.name), scale: p.vmModel.scale.toArray() } : null };
  })()`);
  console.log('weapon:', JSON.stringify(info));
  const d = await send('Page.captureScreenshot', { format: 'png' });
  if (d.result?.data) fs.writeFileSync('shots/weapon-' + weapon + '.png', Buffer.from(d.result.data, 'base64'));
  console.log('saved shots/weapon-' + weapon + '.png');
  console.log('errors:', errors.slice(0, 6));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
