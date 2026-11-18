// 验证 GitHub Pages 部署：加载页面、资产与角色展示台
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351;
const URL = process.argv[2] || 'https://pawlen.github.io/grey-zone-extraction/?screen=prep';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'C:/temp/edge-gz-pages-' + Date.now();
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
      await sleep(500);
    }
    return false;
  };
  await send('Page.navigate', { url: URL });
  const ok = await waitFor("!!window.__game && window.__game.assetsReady && !document.getElementById('screen-prep').classList.contains('hidden') && !!document.querySelector('#charStage canvas.char-canvas')", 180000);
  console.log('prep ready:', ok);
  await sleep(1500);
  const info = await ev(`(() => {
    const g = window.__game;
    return {
      href: location.href,
      state: g && g.state,
      assetsReady: !!g && g.assetsReady,
      enemyAssets: g && g.assets ? g.assets.enemyAssets.size : -1,
      weaponAssets: g && g.assets ? g.assets.weaponAssets.size : -1,
      gearAssets: g && g.assets ? g.assets.gearAssets.size : -1,
      propAssets: g && g.assets ? g.assets.propAssets.size : -1,
      textureSets: g && g.assets ? g.assets.materials.materials.size : -1,
      showcase: !!(g && g.ui && g.ui.showcase && g.ui.showcase.running),
      model: g && g.ui && g.ui.showcase ? g.ui.showcase.assetModelName : null,
      errors: g && g.assets ? g.assets.errors.slice(0, 5) : [],
    };
  })()`);
  console.log('pages:', JSON.stringify(info));
  const d = await send('Page.captureScreenshot', { format: 'png' });
  if (d.result?.data) fs.writeFileSync('shots/pages-preview.png', Buffer.from(d.result.data, 'base64'));
  console.log('console errors:', errors.slice(0, 8));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
