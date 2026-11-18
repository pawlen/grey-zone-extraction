// ═══════════════════════════════════════════════════
// 存档 / 装备 / 经济系统
// ═══════════════════════════════════════════════════

import { ITEMS } from './data.js';
import {
  Grid, createItem, serializeItem, deserializeItem, serializeGrid, deserializeGrid,
  EQUIP_SLOTS, getBagGrid, getRigGrid, carriedWeight,
} from './inventory.js';
import { SAVE_KEY, loadJSON, saveJSON, removeKey, deepClone } from './util.js';

const SAVE_VERSION = 1;

export { SAVE_KEY };

export function createNewSave() {
  const save = {
    version: SAVE_VERSION,
    money: 2600,
    stash: new Grid('stash', 10, 16),
    secure: new Grid('secure', 2, 2),
    equipment: {
      primary: createItem('w_pm', { rounds: 8 }),
      secondary: null,
      helmet: null,
      armor: createItem('armor_paca'),
      rig: createItem('rig_small'),
      backpack: createItem('bag_small'),
    },
    stats: { raids: 0, extracts: 0, kills: 0, deaths: 0 },
    settings: { sensitivity: 1.0 },
  };

  // 初始背包与弹挂物资
  const bag = getBagGrid(save.equipment);
  bag.addAuto(createItem('a_9x19_std', { stack: 60 }));
  bag.addAuto(createItem('med_bandage', { stack: 3 }));
  bag.addAuto(createItem('med_kit'));
  const rig = getRigGrid(save.equipment);
  rig.addAuto(createItem('a_9x19_std', { stack: 20 }));
  rig.addAuto(createItem('med_bandage', { stack: 2 }));

  // 初始仓库
  save.stash.addAuto(createItem('a_9x19_std', { stack: 60 }));
  save.stash.addAuto(createItem('med_bandage', { stack: 2 }));
  save.stash.addAuto(createItem('med_kit'));

  return save;
}

export function serializeSave(save) {
  const equipment = {};
  for (const slot of EQUIP_SLOTS) {
    equipment[slot] = save.equipment[slot] ? serializeItem(save.equipment[slot]) : null;
  }
  return {
    version: SAVE_VERSION,
    money: save.money,
    stats: save.stats,
    settings: save.settings,
    stash: serializeGrid(save.stash),
    secure: serializeGrid(save.secure),
    equipment,
  };
}

export function deserializeSave(raw) {
  if (!raw || raw.version !== SAVE_VERSION || !raw.stash || !raw.equipment) return null;
  try {
    const save = {
      version: SAVE_VERSION,
      money: Number(raw.money) || 0,
      stash: deserializeGrid(raw.stash),
      secure: raw.secure ? deserializeGrid(raw.secure) : new Grid('secure', 2, 2),
      equipment: {
        primary: deserializeItem(raw.equipment.primary),
        secondary: deserializeItem(raw.equipment.secondary),
        helmet: deserializeItem(raw.equipment.helmet),
        armor: deserializeItem(raw.equipment.armor),
        rig: deserializeItem(raw.equipment.rig),
        backpack: deserializeItem(raw.equipment.backpack),
      },
      stats: Object.assign({ raids: 0, extracts: 0, kills: 0, deaths: 0 }, raw.stats || {}),
      settings: Object.assign({ sensitivity: 1.0 }, raw.settings || {}),
    };
    return save;
  } catch (e) {
    console.warn('存档损坏，已重新创建', e);
    return null;
  }
}

export function loadSave() {
  const raw = loadJSON(SAVE_KEY, null);
  const save = deserializeSave(raw);
  return save || createNewSave();
}

export function persistSave(save) {
  return saveJSON(SAVE_KEY, serializeSave(save));
}

export function wipeSave() {
  removeKey(SAVE_KEY);
}

// ────────── 装备操作 ──────────

const SLOT_TYPES = {
  primary: 'weapon', secondary: 'weapon',
  helmet: 'helmet', armor: 'armor', rig: 'rig', backpack: 'backpack',
};

export function equipItemToSlot(save, itemUid, slot) {
  const entry = save.stash.find(itemUid);
  if (!entry) return { ok: false, msg: '仓库中找不到该物品' };
  const item = entry.item;
  const def = ITEMS[item.id];
  if (!def) return { ok: false, msg: '未知物品' };
  if (SLOT_TYPES[slot] !== def.type) return { ok: false, msg: '槽位类型不匹配' };

  const prev = save.equipment[slot] || null;
  const fromX = entry.x, fromY = entry.y;
  save.stash.remove(item.uid);

  if (prev) {
    if (!save.stash.addAuto(prev)) {
      save.stash.addAuto(item);
      return { ok: false, msg: '仓库空间不足，无法更换装备' };
    }
  }
  save.equipment[slot] = item;
  return { ok: true, item, slot, prev };
}

export function unequipSlot(save, slot) {
  const item = save.equipment[slot];
  if (!item) return { ok: false, msg: '该槽位为空' };
  if (!save.stash.canAccept(item)) return { ok: false, msg: '仓库空间不足' };
  save.stash.addAuto(item);
  save.equipment[slot] = null;
  return { ok: true, item };
}

/** 把弹药/医疗品从仓库放入弹挂（优先）或背包 */
export function supplyItem(save, itemUid) {
  const rig = getRigGrid(save.equipment);
  const bag = getBagGrid(save.equipment);
  const targets = [rig, bag].filter(Boolean);
  if (!targets.length) return { ok: false, msg: '需要先装备弹挂或背包' };
  const entry = save.stash.find(itemUid);
  if (!entry) return { ok: false, msg: '仓库中找不到该物品' };
  const item = entry.item;
  const def = ITEMS[item.id];
  if (!def || (def.type !== 'ammo' && def.type !== 'med')) return { ok: false, msg: '只能补给弹药或医疗品' };
  const before = item.stack;
  let full = false;
  for (const g of targets) {
    if (g.addAuto(item)) { full = true; break; }
  }
  if (full) {
    save.stash.remove(item.uid);
    return { ok: true };
  }
  if (item.stack < before) return { ok: true, partial: true, msg: '弹挂与背包空间不足，已部分装入' };
  return { ok: false, msg: '弹挂与背包空间不足' };
}

// ────────── 商人 ──────────

export function buyPrice(itemId, qty) {
  const def = ITEMS[itemId];
  if (!def) return 0;
  return def.price * (def.type === 'ammo' ? qty : 1);
}

export function sellValue(item) {
  const def = ITEMS[item.id];
  if (!def) return 0;
  const unit = Math.floor(def.price * 0.55);
  return unit * (def.type === 'ammo' ? (item.stack || 1) : 1);
}

export function traderBuy(save, itemId, qty) {
  const def = ITEMS[itemId];
  if (!def) return { ok: false, msg: '未知商品' };
  const price = buyPrice(itemId, qty);
  if (save.money < price) return { ok: false, msg: '资金不足' };
  const qtyOrOne = def.type === 'ammo' ? qty : 1;
  // 用仓库快照进行“能否完整放入”的预检，避免部分放入却扣全款
  const probeStash = deserializeGrid(serializeGrid(save.stash));
  if (!probeStash.addAuto(createItem(itemId, { stack: qtyOrOne }))) {
    return { ok: false, msg: '仓库空间不足' };
  }
  const item = createItem(itemId, { stack: qtyOrOne });
  save.money -= price;
  save.stash.addAuto(item);
  return { ok: true, price };
}

export function traderSell(save, itemUid) {
  const entry = save.stash.find(itemUid);
  if (!entry) return { ok: false, msg: '仓库中找不到该物品' };
  const value = sellValue(entry.item);
  save.stash.remove(itemUid);
  save.money += value;
  return { ok: true, value };
}

// ────────── 救济物资 ──────────

export function canClaimRelief(save) {
  const hasWeaponInStash = save.stash.items.some((e) => ITEMS[e.item.id]?.type === 'weapon');
  const hasWeaponEquipped = !!(save.equipment.primary || save.equipment.secondary);
  return !hasWeaponInStash && !hasWeaponEquipped && save.money < 900;
}

export function claimRelief(save) {
  if (!canClaimRelief(save)) return { ok: false, msg: '不符合救济条件' };
  const goods = [
    createItem('w_pm', { rounds: 8 }),
    createItem('a_9x19_std', { stack: 60 }),
    createItem('med_bandage', { stack: 2 }),
    createItem('rig_small'),
    createItem('bag_small'),
  ];
  let added = 0;
  for (const it of goods) {
    if (save.stash.addAuto(it)) added++;
  }
  const msg = added > 0 ? '渡鸦丢来一个救济包裹：一把手枪、弹药和绷带。' : '仓库已满，无法领取救济物资';
  return { ok: added > 0, msg };
}

// ────────── 战局结算 ──────────

/**
 * 应用战局结果。
 * @param {object} save
 * @param {{success:boolean, kills:number, abandoned?:boolean}} result
 * @returns {{gained:Array, lost:Array, kept:Array}}
 */
export function applyRaidResult(save, result) {
  const summary = { gained: [], lost: [], kept: [] };
  const bag = save.equipment.backpack;
  const bagGrid = bag ? bag.contents : null;

  const snapshot = (grid) => {
    if (!grid) return [];
    return grid.items.map((e) => ({ id: e.item.id, stack: e.item.stack }));
  };
  const equipSnapshot = () => {
    const arr = [];
    for (const slot of EQUIP_SLOTS) {
      const it = save.equipment[slot];
      if (!it) continue;
      arr.push({ id: it.id, stack: it.stack });
      if (it.contents) arr.push(...snapshot(it.contents));
    }
    return arr;
  };

  save.stats.raids = (save.stats.raids || 0) + 1;
  save.stats.kills = (save.stats.kills || 0) + (result.kills || 0);

  if (result.success) {
    save.stats.extracts = (save.stats.extracts || 0) + 1;
    summary.gained = [...snapshot(bagGrid), ...snapshot(save.secure)];

    // 背包中的战利品自动转移到仓库
    if (bagGrid) {
      const entries = [...bagGrid.items];
      for (const e of entries) {
        const item = e.item;
        bagGrid.remove(item.uid);
        const full = save.stash.addAuto(item);
        if (!full) bagGrid.addAuto(item); // 仓库满，剩余放回背包
      }
    }
    summary.kept = []; // 装备保留
  } else {
    save.stats.deaths = (save.stats.deaths || 0) + 1;
    summary.lost = equipSnapshot();
    summary.gained = [...snapshot(save.secure)];
    // 阵亡：失去全部装备与背包内容（保险箱内容保留）
    for (const slot of EQUIP_SLOTS) save.equipment[slot] = null;
  }
  return summary;
}

export function raidAbandonPenalty(save) {
  // 主动放弃视为阵亡
}

// 便于 UI 展示
export function equipmentWeightInfo(save) {
  const w = carriedWeight(save.equipment, save.secure);
  return { weight: w, capacity: 22 };
}
