// 截取基地仓库中的角色展示台（正面 / 旋转两个角度）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = 'C:/temp/edge-gz-showcase-' + Date.now();
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars',
  '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
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
  const waitFor = async (expr, t = 60000) => {
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

  await send('Page.navigate', { url: 'http://localhost:8080/?screen=prep&select=1' });
  const ok = await waitFor("!!window.__game && !document.getElementById('screen-prep').classList.contains('hidden') && !!document.querySelector('#charStage canvas.char-canvas')");
  console.log('prep ready:', ok);
  await sleep(800);

  // 装备一套代表性装备，验证实时换装与显示效果
  const detail = await ev(`(async () => {
    const g = __game;
    const inv = await import('/src/inventory.js');
    const ids = ['w_ak74', 'helm_6b47', 'armor_6b23', 'rig_tactical', 'bag_tactical'];
    for (const id of ids) {
      const it = inv.createItem(id);
      g.save.stash.addAuto(it);
      g.ui.refreshPrep();
      const grid = g.ui.gridMap.get('stash');
      const slot = { w_ak74: 'primary', helm_6b47: 'helmet', armor_6b23: 'armor', rig_tactical: 'rig', bag_tactical: 'backpack' }[id];
      g.ui.equipFromGrid(slot, grid, it.uid);
    }
    await new Promise((r) => setTimeout(r, 400));
    const showRef = g.ui.showcase;
    if (showRef && showRef.humanoid) showRef.humanoid.anim.update(0.1);
    const stage = document.querySelector('#charStage');
    const canvas = stage.querySelector('canvas.char-canvas');
    return {
      stage: stage.getBoundingClientRect().toJSON(),
      canvas: [canvas.width, canvas.height],
      signature: g.ui.showcase._signature,
      running: g.ui.showcase.running,
      anim: (() => {
        const s = g.ui.showcase;
        const controller = s.anim;
        const a = controller && controller.actions.get(controller.currentName);
        const clip = a && a.getClip();
        const info = {
          source: s.assetSource,
          name: controller && controller.currentName,
          acts: controller ? [...controller.actions.keys()] : [],
          running: a && a.isRunning(),
          weight: a && a.getEffectiveWeight(),
          time: a && +a.time.toFixed(2),
          root: controller && controller.anim === undefined && controller.mixer && controller.mixer.getRoot() && controller.mixer.getRoot().name,
          tracks: clip ? clip.tracks.slice(0, 4).map((t) => t.name) : [],
          bones: s.assetBones ? Object.keys(s.assetBones).filter((k) => !!s.assetBones[k]) : [],
          gearNodes: s.assetGearNodes.length,
        };
        if (s.humanoid) {
          info.armL = s.humanoid.bones.upperArmL.rotation.toArray().slice(0, 3).map((v) => +v.toFixed(2));
          info.armR = s.humanoid.bones.upperArmR.rotation.toArray().slice(0, 3).map((v) => +v.toFixed(2));
        }
        return info;
      })(),
    };
  })()`);
  console.log('detail:', JSON.stringify(detail));
  await ev(`document.getElementById('toast-wrap').style.display = 'none'`);
  await sleep(1200);
  await shot('screen-prep');

  await ev(`document.querySelector('#screen-prep .char-angle[data-q="1"]').click()`);
  await sleep(900);
  await shot('char-showcase-side');

  await ev(`document.querySelector('#screen-prep .char-angle[data-q="2"]').click()`);
  await sleep(900);
  await shot('char-showcase-back');

  console.log('errors:', errors.slice(0, 10));
} catch (e) {
  console.error(e);
} finally {
  try { ws && ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
