// ═══════════════════════════════════════════════════
// 端到端自动化测试（无头 Edge + CDP）
// 用法: node tools/e2e-test.mjs
// ═══════════════════════════════════════════════════

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const BASE = 'http://localhost:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
  if (!cond) failures++;
}

const profileDir = path.join(process.env.TEMP || 'C:/temp', 'edge-gz-e2e-' + Date.now());
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--disable-extensions', '--window-size=1400,850', 'about:blank',
], { stdio: 'ignore' });

const errors = [];
let ws;
let msgId = 0;
const pending = new Map();

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* retry */ }
    await sleep(500);
  }
  throw new Error('无法连接 Edge 调试端口');
}

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expr) {
  const resp = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  const res = resp.result || {};
  if (res.exceptionDetails) {
    const ex = res.exceptionDetails;
    throw new Error('页面脚本异常: ' + (ex.exception?.description || ex.text));
  }
  return res.result ? res.result.value : undefined;
}

async function waitFor(expr, timeout = 30000, label = expr) {
  const start = Date.now();
  let lastLog = 0;
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(expr)) return true;
    } catch (e) { /* page reloading */ }
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      let hint = '';
      try {
        hint = await evaluate('JSON.stringify({ href: location.href, ready: document.readyState, state: window.__game && window.__game.state, boot: !document.getElementById("boot-error").classList.contains("hidden") })');
      } catch (e) { hint = 'eval-fail'; }
      console.log('  [wait] ' + label + ' :: ' + hint);
    }
    await sleep(300);
  }
  throw new Error('等待超时: ' + label);
}

try {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('EXCEPTION: ' + (d.exception?.description || d.text));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('LOG: ' + msg.params.entry.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  console.log('--- 加载战局 ---');
  await send('Page.navigate', { url: BASE + '?autostart=factory' });
  await waitFor("!!window.__game && window.__game.state === 'raid' && !!window.__game.player", 60000, '进入战局');

  const init = await evaluate(`(() => {
    const g = window.__game;
    return {
      state: g.state,
      alive: g.player.alive,
      enemies: g.enemies.length,
      containers: g.world.containers.length,
      extracts: g.world.extracts.length,
      hasNav: !!g.world.nav,
      navFree: g.world.nav ? g.world.nav.blocked.some(v => v === 0) : false,
      weapon: g.player.weaponDef?.id,
      rounds: g.player.weapon?.rounds,
      reserve: g.player.reserveAmmo,
      rig: g.save.equipment.rig?.id,
      rigItems: g.save.equipment.rig?.contents.items.length,
      weight: +g.player.weight.toFixed(2),
      zones: g.world.zones.length,
      highZones: g.world.zones.filter((z) => z.tier === 'high').length,
      highContainers: g.world.containers.filter((c) => c.tier === 'high').length,
      guards: g.enemies.filter((e) => e.role === 'guard').length,
      patrols: g.enemies.filter((e) => e.role === 'patrol').length,
      rigged: g.enemies.every((e) => !!(e.assetAnim && (e.assetCfg || (e.humanoid && e.humanoid.bones.thighL && e.humanoid.bones.upperArmR)))),
      hudVisible: !document.getElementById('hud').classList.contains('hidden'),
      bootError: !document.getElementById('boot-error').classList.contains('hidden'),
      timer: document.getElementById('raidTimer').textContent,
      assetsReady: !!g.assetsReady,
      assets: !!g.assets,
      loadingHidden: document.getElementById('loading-screen').classList.contains('hidden'),
      env: !!g.scene.environment,
    };
  })()`);
  console.log('初始状态:', JSON.stringify(init));
  check('战局状态为 raid', init.state === 'raid');
  check('玩家存活且有武器', init.alive && init.weapon === 'w_pm');
  check('弹匣 8 发 / 备用 80 发（弹挂+背包）', init.rounds === 8 && init.reserve === 80, `${init.rounds}/${init.reserve}`);
  check('弹挂已装备且含物资', init.rig === 'rig_small' && init.rigItems >= 2, `${init.rig} / ${init.rigItems} 件`);
  check('资源点分级与高价值物资生成', init.zones >= 5 && init.highZones >= 1 && init.highContainers > 0, `${init.zones} 区域 / ${init.highZones} 高级 / ${init.highContainers} 高级容器`);
  check('敌人区分守卫与巡逻队并使用骨骼蒙皮动画', init.guards > 0 && init.patrols > 0 && init.rigged, `守卫${init.guards} 巡逻${init.patrols}`);
  check('地图生成敌人与容器', init.enemies === 7 && init.containers >= 28, `敌人${init.enemies} 容器${init.containers}`);
  check('撤离点数量正确', init.extracts === 3);
  check('导航网格存在且可通行', init.hasNav && init.navFree);
  check('HUD 可见且无启动错误', init.hudVisible && !init.bootError);
  check('倒计时已显示', /^\d{2}:\d{2}$/.test(init.timer), init.timer);
  check('资产管线就绪且加载界面已关闭', init.assetsReady && init.assets && init.loadingHidden);
  check('PBR 环境光照已启用', init.env);

  console.log('--- 移动与视角 ---');
  const pos0 = await evaluate('({x: __game.player.pos.x, z: __game.player.pos.z})');
  await evaluate("__game.input.keys.add('KeyW')");
  await sleep(1200);
  await evaluate("__game.input.keys.delete('KeyW')");
  const pos1 = await evaluate('({x: __game.player.pos.x, z: __game.player.pos.z})');
  const moved = Math.hypot(pos1.x - pos0.x, pos1.z - pos0.z);
  check('WASD 移动生效', moved > 0.1, `位移 ${moved.toFixed(2)}m`);
  const yaw0 = await evaluate('__game.player.yaw');
  await evaluate('__game.input.mouseDX = 120');
  await sleep(500);
  const yaw1 = await evaluate('__game.player.yaw');
  check('鼠标视角生效', Math.abs(yaw1 - yaw0) > 0.01, `Δyaw ${(yaw1 - yaw0).toFixed(3)}`);

  console.log('--- 伤害 / 护甲 / 医疗 ---');
  const dmg = await evaluate(`(() => {
    const g = __game, p = g.player;
    const before = p.parts.thorax;
    const durBefore = g.save.equipment.armor.dur;
    p.takeDamage(14, 'thorax', 1);
    return {
      before, after: p.parts.thorax,
      durBefore, durAfter: g.save.equipment.armor.dur,
      alive: p.alive,
    };
  })()`);
  check('部位伤害生效', dmg.after < dmg.before, `${dmg.before} -> ${dmg.after}`);
  check('护甲吸收并损耗耐久', dmg.durAfter <= dmg.durBefore && dmg.durAfter > 0, `${dmg.durBefore} -> ${dmg.durAfter}`);
  check('非致命伤不会死亡', dmg.alive === true);

  const med = await evaluate(`(() => {
    const p = __game.player;
    p.wounds = [{ part: 'legL', rate: 1 }];
    const bandageBefore = p.getMedCounts().bandage;
    p.useMed('bandage');
    if (!p.medUse) return { err: '使用绷带未启动' };
    p.updateMed(99);
    const bandageAfter = p.getMedCounts().bandage;
    const woundsAfter = p.wounds.length;
    p.parts.thorax = 40;
    const kitBefore = p.getMedCounts().kit;
    p.useMed('kit');
    if (!p.medUse) return { err: '使用医疗包未启动', bandageBefore, bandageAfter, woundsAfter };
    p.updateMed(99);
    return {
      bandageBefore, bandageAfter, woundsAfter,
      kitBefore, kitAfter: p.getMedCounts().kit,
      thorax: p.parts.thorax,
    };
  })()`);
  check('绷带止血并消耗', med.woundsAfter === 0 && med.bandageAfter < med.bandageBefore,
    `绷带 ${med.bandageBefore} -> ${med.bandageAfter}, 伤口 ${med.woundsAfter}`);
  check('医疗包恢复生命并消耗', med.thorax > 40 && med.kitAfter < med.kitBefore,
    `胸 ${med.thorax}, 医疗包 ${med.kitBefore} -> ${med.kitAfter}`);

  console.log('--- 射击与击杀 ---');
  const setup = await evaluate(`(() => {
    const g = __game;
    const e = g.enemies.find((x) => x.alive);
    if (!e) return { ok: false, reason: 'no enemy' };
    const offsets = [[3.6, 0], [-3.6, 0], [0, 3.6], [0, -3.6], [3.2, 3.2], [-3.2, 3.2],
                     [3.2, -3.2], [-3.2, -3.2], [5, 1], [-5, -1], [6, 6], [-6, -6]];
    const camera = g.player.camera;
    const dir = new g.player._wallDir.constructor();
    const origin = new g.player.pos.constructor();
    for (const [ox, oz] of offsets) {
      const n = g.world.nearestFreePosition(e.pos.x + ox, e.pos.z + oz);
      if (g.world.lineBlocked(n.x, n.z, e.pos.x, e.pos.z)) continue;
      g.player.pos.set(n.x, 0, n.z);
      const dx = e.pos.x - n.x, dz = e.pos.z - n.z;
      const dist = Math.hypot(dx, dz);
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(1.15 - 1.6, dist);
      g.player.adsT = 1;
      g.player.applyCamera(0);
      // 用真实射击射线确认第一个命中物就是目标敌人，避免被容器/植被挡住
      camera.getWorldPosition(origin);
      camera.getWorldDirection(dir);
      g.raycaster.set(origin, dir);
      g.raycaster.far = dist + 4;
      const targets = [...g.world.hittables];
      for (const x of g.enemies) if (x.alive) targets.push(...x.hitMeshes);
      const hits = g.raycaster.intersectObjects(targets, true);
      const first = hits[0];
      const hitEnemy = first && first.object.userData.enemy;
      if (!first || hitEnemy === e) {
        return { ok: true, dist, hp: e.hp, index: g.enemies.indexOf(e) };
      }
    }
    return { ok: false, reason: 'no clear line' };
  })()`);
  check('找到可射击目标', setup.ok, JSON.stringify(setup));
  if (setup.ok) {
    const shoot = await evaluate(`(() => {
      const g = __game, p = g.player;
      const e = g.enemies[${setup.index}];
      const hpBefore = e.hp;
      const killsBefore = g.killsThisRaid;
      const bodiesBefore = g.world.containers.filter((c) => c.isBody).length;
      p.weapon.rounds = 30;
      p.weapon.loadedAmmoId = 'a_9x19_std';
      for (let i = 0; i < 14 && e.alive; i++) {
        p.fireTimer = 0; p.reloading = false; p.adsT = 1;
        p.applyCamera(0);
        p.fireOnce();
      }
      return {
        hpBefore, hpAfter: e.hp, alive: e.alive,
        killsBefore, bodiesBefore,
        kills: g.killsThisRaid,
        bodies: g.world.containers.filter((c) => c.isBody).length,
        rounds: p.weapon.rounds,
        armorDur: g.save.equipment.armor.dur,
      };
    })()`);
    console.log('射击结果:', JSON.stringify(shoot));
    check('子弹命中造成伤害', shoot.hpAfter < shoot.hpBefore);
    check('敌人被击杀并生成尸体容器', !shoot.alive && shoot.kills > shoot.killsBefore && shoot.bodies > shoot.bodiesBefore);
    check('射击消耗弹匣', shoot.rounds < 30, `剩余 ${shoot.rounds}`);
  }

  console.log('--- 搜刮流程 ---');
  const loot = await evaluate(`(() => {
    const g = __game;
    const body = g.world.containers.find((c) => c.isBody);
    if (!body) return { err: '无尸体容器' };
    g.openOverlay('loot', body);
    const visible = !document.getElementById('overlay-loot').classList.contains('hidden');
    const tiles = document.querySelectorAll('#overlay-loot .gitem').length;
    const bagBefore = g.save.equipment.backpack.contents.items.length;
    const sourceBefore = body.grid.items.length;
    g.ui.lootAll();
    const bagAfter = g.save.equipment.backpack.contents.items.length;
    const sourceAfter = body.grid.items.length;
    const tilesAfter = document.querySelectorAll('#overlay-loot .gitem').length;
    g.closeOverlay();
    return {
      visible, tiles, tilesAfter, bagBefore, bagAfter, sourceBefore, sourceAfter,
      closed: document.getElementById('overlay-loot').classList.contains('hidden'),
    };
  })()`);
  console.log('搜刮结果:', JSON.stringify(loot));
  check('搜刮界面可以打开', loot.visible && loot.tiles > 0, `tiles=${loot.tiles}`);
  check('战利品清空并进入背包', loot.sourceAfter === 0 && loot.bagAfter >= loot.bagBefore,
    `容器 ${loot.sourceBefore} -> ${loot.sourceAfter}, 背包 ${loot.bagBefore} -> ${loot.bagAfter}`);
  check('搜刮界面关闭正常', loot.closed);

  console.log('--- 局内装备 ---');
  const equipTest = await evaluate(`(async () => {
    const g = __game;
    const inv = await import('/src/inventory.js');
    g.openOverlay('inventory');
    const testGrid = new inv.Grid('test_equip', 5, 4);
    const ak = inv.createItem('w_ak74', { rounds: 30 });
    testGrid.addAuto(ak);
    const armor = inv.createItem('armor_6b23');
    testGrid.addAuto(armor);
    const bandage = inv.createItem('med_bandage', { stack: 1 });
    testGrid.addAuto(bandage);
    const slots = document.querySelectorAll('#overlay-inventory [data-equip-slot]').length;
    const oldPrimary = g.save.equipment.primary?.id;
    g.ui.equipFromGrid('primary', testGrid, ak.uid);
    const weaponEquipped = {
      primary: g.save.equipment.primary?.id,
      active: g.player.weaponDef?.id,
      slot: g.player.activeSlot,
      rounds: g.player.weapon?.rounds,
      oldBack: testGrid.items.some((e) => e.item.id === oldPrimary),
    };
    g.ui.equipFromGrid('armor', testGrid, armor.uid);
    const armorEquipped = g.save.equipment.armor?.id;
    const helmetBefore = g.save.equipment.helmet?.id || null;
    g.ui.equipFromGrid('helmet', testGrid, bandage.uid);
    const invalid = {
      helmet: g.save.equipment.helmet?.id || null,
      helmetBefore,
      bandageStillInBag: testGrid.items.some((e) => e.item.id === 'med_bandage'),
    };
    const slotCountAfter = document.querySelectorAll('#overlay-inventory [data-equip-slot]').length;
    g.closeOverlay();
    return { slots, slotCountAfter, weaponEquipped, armorEquipped, invalid, state: g.state };
  })()`);
  console.log('局内装备:', JSON.stringify(equipTest));
  check('局内装备槽正常渲染', equipTest.slots === 6 && equipTest.slotCountAfter === 6, `${equipTest.slots}/${equipTest.slotCountAfter}`);
  check('局内可装备武器并替换', equipTest.weaponEquipped.primary === 'w_ak74'
    && equipTest.weaponEquipped.active === 'w_ak74'
    && equipTest.weaponEquipped.rounds === 30
    && equipTest.weaponEquipped.oldBack, JSON.stringify(equipTest.weaponEquipped));
  check('局内可装备护甲', equipTest.armorEquipped === 'armor_6b23');
  check('错误槽位会拒绝装备', equipTest.invalid.helmet === equipTest.invalid.helmetBefore
    && equipTest.invalid.bandageStillInBag, JSON.stringify(equipTest.invalid));

  console.log('--- 撤离流程 ---');
  const extract = await evaluate(`(() => {
    const g = __game;
    const ex = g.world.extracts[0];
    g.player.pos.set(ex.x, 0, ex.z);
    g.extractProgress = 0;
    g.checkExtraction(g.map.extractTime + 0.2);
    return {
      state: g.state,
      resultVisible: !document.getElementById('screen-result').classList.contains('hidden'),
      extracts: g.save.stats.extracts,
      title: document.querySelector('#screen-result .result-banner h2')?.textContent,
      hudHidden: document.getElementById('hud').classList.contains('hidden'),
    };
  })()`);
  console.log('撤离结果:', JSON.stringify(extract));
  check('撤离成功进入结算', extract.state === 'result' && extract.resultVisible);
  check('结算显示「撤离成功」', extract.title === '撤离成功', extract.title);
  check('统计记录撤离次数', extract.extracts >= 1);
  check('战局结束后隐藏 HUD', extract.hudHidden);

  const persisted = await evaluate(`(() => {
    const raw = localStorage.getItem('grey_zone_save_v1');
    if (!raw) return { ok: false };
    const s = JSON.parse(raw);
    return { ok: true, version: s.version, money: s.money, stash: s.stash.items.length, extracts: s.stats.extracts };
  })()`);
  check('存档已写入 localStorage', persisted.ok && persisted.extracts >= 1, JSON.stringify(persisted));

  console.log('--- 死亡与保险箱保留 ---');
  await send('Page.navigate', { url: BASE + '?autostart=factory' });
  await waitFor("!!window.__game && window.__game.state === 'raid' && !!window.__game.player", 60000, '第二局进入战局');
  const death = await evaluate(`(async () => {
    const g = __game;
    const inv = await import('/src/inventory.js');
    g.save.secure.addAuto(inv.createItem('val_gold'));
    const secureBefore = g.save.secure.items.map((e) => e.item.id);
    const deathsBefore = g.save.stats.deaths;
    const weaponBefore = g.save.equipment.primary?.id || null;
    g.player.takeDamage(9999, 'head', 8);
    g.deathTimer = 0.02;
    return { secureBefore, deathsBefore, weaponBefore, state: g.state, alive: g.player.alive };
  })()`);
  console.log('死亡触发:', JSON.stringify(death));
  check('受到致命伤后进入倒地状态', death.alive === false && death.state === 'dying');
  await sleep(2000);
  await waitFor("!!window.__game && window.__game.state === 'result'", 15000, '死亡结算');
  const deathRes = await evaluate(`(() => {
    const g = __game;
    return {
      state: g.state,
      title: document.querySelector('#screen-result .result-banner h2')?.textContent,
      deaths: g.save.stats.deaths,
      primary: g.save.equipment.primary,
      armor: g.save.equipment.armor,
      rig: g.save.equipment.rig,
      secureItems: g.save.secure.items.map((e) => e.item.id),
      chips: [...document.querySelectorAll('#screen-result .result-loot .loot-chip b')].map((x) => x.textContent),
    };
  })()`);
  console.log('死亡结算:', JSON.stringify(deathRes));
  check('死亡结算显示行动失败', deathRes.state === 'result' && deathRes.title === '行动失败', deathRes.title);
  check('死亡后装备全部遗失（含弹挂）', !deathRes.primary && !deathRes.armor && !deathRes.rig);
  check('死亡统计增加', deathRes.deaths > death.deathsBefore);
  check('保险箱物品保留', deathRes.secureItems.includes('val_gold'), JSON.stringify(deathRes.secureItems));

  console.log('--- 基地仓库界面 ---');
  const baseInv = await evaluate(`(() => {
    const g = __game;
    g.openScreen('prep');
    const prepVisible = !document.getElementById('screen-prep').classList.contains('hidden');
    const hasStash = !!document.querySelector('#screen-prep .inv-grid[data-grid-id="stash"]');
    const hasSecure = !!document.querySelector('#screen-prep .inv-grid[data-grid-id="secure"]');
    const grids = document.querySelectorAll('#screen-prep .inv-grid').length;
    const slots = document.querySelectorAll('#screen-prep [data-equip-slot]').length;
    const secureTiles = [...document.querySelectorAll('#screen-prep .gitem')]
      .filter((el) => el.closest('.inv-grid')?.dataset.gridId === 'secure')
      .map((el) => el.getAttribute('title').split(String.fromCharCode(10))[0]);
    const mapChips = document.querySelectorAll('#screen-prep .map-chip').length;
    const detail = !!document.querySelector('#screen-prep #whDetail');
    return { prepVisible, hasStash, hasSecure, grids, slots, secureTiles, mapChips, detail };
  })()`);
  console.log('基地仓库:', JSON.stringify(baseInv));
  check('基地使用一体化仓库界面', baseInv.prepVisible && baseInv.hasStash && baseInv.hasSecure && baseInv.detail);
  check('仓库内可直接查看保险箱物品', baseInv.secureTiles.some((t) => t.includes('金表')), JSON.stringify(baseInv.secureTiles));
  check('基地仓库显示六个装备槽与六张地图', baseInv.slots === 6 && baseInv.mapChips === 6, `${baseInv.slots}/${baseInv.mapChips}`);

  const baseEquip = await evaluate(`(async () => {
    const g = __game;
    const inv = await import('/src/inventory.js');
    const w = inv.createItem('w_m9', { rounds: 15 });
    g.save.stash.addAuto(w);
    g.ui.refreshPrep();
    const stashGrid = g.ui.gridMap.get('stash');
    g.ui.equipFromGrid('primary', stashGrid, w.uid);
    const raw = JSON.parse(localStorage.getItem('grey_zone_save_v1'));
    return {
      primary: g.save.equipment.primary?.id,
      rounds: g.save.equipment.primary?.rounds,
      persistedPrimary: raw.equipment.primary?.id,
      slotHtml: document.querySelectorAll('#screen-prep [data-equip-slot]').length,
    };
  })()`);
  console.log('基地装备:', JSON.stringify(baseEquip));
  check('基地仓库内拖拽装备生效并持久化', baseEquip.primary === 'w_m9' && baseEquip.persistedPrimary === 'w_m9' && baseEquip.rounds === 15);
  check('装备后仓库界面仍完整渲染', baseEquip.slotHtml === 6);

  console.log('--- 角色展示台 ---');
  const charShow = await evaluate(`(async () => {
    const g = __game;
    const inv = await import('/src/inventory.js');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stage = document.querySelector('#screen-prep #charStage');
    const canvas = stage && stage.querySelector('canvas.char-canvas');
    const initial = {
      stage: !!stage,
      canvas: !!canvas,
      width: canvas ? canvas.width : 0,
      height: canvas ? canvas.height : 0,
      running: !!(g.ui.showcase && g.ui.showcase.running),
      angles: document.querySelectorAll('#screen-prep .char-angle').length,
    };
    const uids = {};
    for (const id of ['helm_6b47', 'armor_6b23', 'rig_tactical', 'bag_small']) {
      const it = inv.createItem(id);
      g.save.stash.addAuto(it);
      uids[id] = it.uid;
    }
    const equipFromStash = (slot, uid) => {
      g.ui.refreshPrep();
      const grid = g.ui.gridMap.get('stash');
      g.ui.equipFromGrid(slot, grid, uid);
    };
    equipFromStash('helmet', uids.helm_6b47);
    equipFromStash('armor', uids.armor_6b23);
    equipFromStash('rig', uids.rig_tactical);
    equipFromStash('backpack', uids.bag_small);
    const show = g.ui.showcase;
    const sig = show ? show._signature : '';
    const modelName = show ? (show.assetModelName || 'procedural') : 'procedural';
    const gear = show ? {
      head: show.gearHead ? show.gearHead.children.length : 0,
      torso: show.gearTorso ? show.gearTorso.children.length : 0,
      hips: show.gearHips ? show.gearHips.children.length : 0,
      asset: show.assetGearNodes ? show.assetGearNodes.length : 0,
    } : { head: 0, torso: 0, hips: 0, asset: 0 };
    document.querySelector('#screen-prep .char-angle[data-q="2"]').click();
    await sleep(900);
    const canvasAfter = document.querySelector('#screen-prep #charStage');
    const yawAfterAngle = show ? show.yaw : 0;
    const yawBeforeDrag = show ? show.yaw : 0;
    const cv = document.querySelector('#screen-prep #charStage canvas.char-canvas');
    if (cv) {
      const pe = (type, x) => cv.dispatchEvent(new PointerEvent(type, {
        pointerId: 7, clientX: x, clientY: 300, bubbles: true, button: 0,
      }));
      pe('pointerdown', 300);
      pe('pointermove', 360);
      pe('pointerup', 360);
      await sleep(150);
    }
    return {
      ...initial,
      gear,
      sig,
      model: modelName,
      yaw: yawAfterAngle,
      dragDelta: show ? show.yaw - yawBeforeDrag : 0,
      active: document.querySelector('#screen-prep .char-angle.on')?.dataset.q,
      canvasAfter: !!(canvasAfter && canvasAfter.querySelector('canvas.char-canvas')),
      runningAfter: !!(show && show.running),
    };
  })()`);
  console.log('角色展示台:', JSON.stringify(charShow));
  check('仓库包含 3D 角色展示台且正在渲染', charShow.stage && charShow.canvas && charShow.width > 0 && charShow.height > 0 && charShow.running, `${charShow.width}×${charShow.height}`);
  check('角色展示台提供四个角度按钮', charShow.angles === 4, `${charShow.angles}`);
  check('换装实时同步到角色模型', charShow.sig.includes('helm_6b47') && charShow.sig.includes('armor_6b23') && charShow.sig.includes('rig_tactical') && charShow.sig.includes('bag_small') && (charShow.gear.asset >= 3 || (charShow.gear.head > 0 && charShow.gear.torso >= 3) || (charShow.model === 'vanguard' && (charShow.gear.torso >= 1 || charShow.gear.hips >= 1))), JSON.stringify(charShow.gear));
  check('角度按钮可旋转角色并高亮', charShow.active === '2' && Math.abs(Math.abs(charShow.yaw) - Math.PI) < 0.15, `yaw=${charShow.yaw}`);
  check('拖拽可以自由旋转角色', charShow.dragDelta > 0.3, `Δyaw=${charShow.dragDelta}`);
  check('刷新后展示台画布仍在且持续运行', charShow.canvasAfter && charShow.runningAfter);

  console.log('--- 更新公告 ---');
  const announce = await evaluate(`(() => {
    const g = __game;
    g.openScreen('menu');
    g.ui.showAnnouncement();
    const visible = !document.getElementById('overlay-announcement').classList.contains('hidden');
    const entries = document.querySelectorAll('#overlay-announcement .announce-entry').length;
    const latest = document.querySelector('#overlay-announcement .announce-version')?.textContent;
    const menuBtn = !!document.querySelector('#screen-menu [data-action="announcement"]');
    g.ui.hideAnnouncement();
    return { visible, entries, latest, menuBtn, closed: document.getElementById('overlay-announcement').classList.contains('hidden') };
  })()`);
  console.log('公告:', JSON.stringify(announce));
  check('主菜单公告板可打开并展示全部版本', announce.visible && announce.entries >= 13 && announce.latest === 'v1.13');
  check('公告入口在主菜单且可关闭', announce.menuBtn && announce.closed);

  const bootAfter = await evaluate("!document.getElementById('boot-error').classList.contains('hidden') ? document.getElementById('boot-error').textContent.slice(0, 300) : ''");
  check('全程无页面崩溃提示', bootAfter === '', bootAfter);
} catch (err) {
  console.error('E2E 测试异常:', err.message);
  failures++;
} finally {
  try { if (ws) ws.close(); } catch (e) { /* ignore */ }
  try { edge.kill(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

if (errors.length) {
  console.log('\n浏览器控制台错误:');
  for (const e of errors.slice(0, 20)) console.log(' -', e);
}
check('浏览器控制台无错误', errors.length === 0, `${errors.length} 条`);

console.log(`\n===== 测试结束：${failures === 0 ? '全部通过' : failures + ' 项失败'} =====`);
process.exit(failures === 0 ? 0 : 1);
