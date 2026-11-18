// ═══════════════════════════════════════════════════
// 背包 / 仓库 网格模型
// ═══════════════════════════════════════════════════

import { ITEMS, itemWeight } from './data.js';
import { uid } from './util.js';

export function createItem(id, extra = {}) {
  const def = ITEMS[id];
  if (!def) throw new Error('未知物品: ' + id);
  const item = {
    uid: extra.uid || uid(),
    id,
    stack: extra.stack != null ? extra.stack : 1,
  };
  if (def.type === 'weapon') item.rounds = extra.rounds != null ? extra.rounds : 0;
  if (def.type === 'armor' || def.type === 'helmet') item.dur = extra.dur != null ? extra.dur : def.durability;
  if (def.type === 'backpack' || def.type === 'rig') {
    const prefix = def.type === 'rig' ? 'rig_' : 'bag_';
    item.contents = extra.contents || new Grid(prefix + item.uid, def.capacity[0], def.capacity[1]);
  }
  return item;
}

export class Grid {
  constructor(id, cols, rows) {
    this.id = id;
    this.cols = cols;
    this.rows = rows;
    this.items = []; // { item, x, y }
  }

  cellOccupiedBy(x, y, ignoreUid = null) {
    for (const e of this.items) {
      if (ignoreUid && e.item.uid === ignoreUid) continue;
      const d = ITEMS[e.item.id];
      if (x >= e.x && x < e.x + d.w && y >= e.y && y < e.y + d.h) return e;
    }
    return null;
  }

  canPlace(item, x, y, ignoreUid = null) {
    const def = ITEMS[item.id];
    if (!def) return false;
    if (x < 0 || y < 0 || x + def.w > this.cols || y + def.h > this.rows) return false;
    for (const e of this.items) {
      if (ignoreUid && e.item.uid === ignoreUid) continue;
      if (e.item.uid === item.uid) continue;
      const d = ITEMS[e.item.id];
      if (x < e.x + d.w && x + def.w > e.x && y < e.y + d.h && y + def.h > e.y) return false;
    }
    return true;
  }

  place(item, x, y) {
    this.items.push({ item, x, y });
  }

  remove(itemUid) {
    const i = this.items.findIndex((e) => e.item.uid === itemUid);
    if (i < 0) return null;
    const item = this.items[i].item;
    this.items.splice(i, 1);
    return item;
  }

  find(uidVal) {
    return this.items.find((e) => e.item.uid === uidVal) || null;
  }

  findSpot(item) {
    const def = ITEMS[item.id];
    if (!def) return null;
    for (let y = 0; y <= this.rows - def.h; y++) {
      for (let x = 0; x <= this.cols - def.w; x++) {
        if (this.canPlace(item, x, y)) return { x, y };
      }
    }
    return null;
  }

  stackSpaceFor(itemId) {
    const def = ITEMS[itemId];
    if (!def || !(def.stack > 1)) return 0;
    let space = 0;
    for (const e of this.items) {
      if (e.item.id === itemId) space += Math.max(0, def.stack - e.item.stack);
    }
    return space;
  }

  canAccept(item) {
    const def = ITEMS[item.id];
    if (!def) return false;
    if (def.stack > 1 && this.stackSpaceFor(item.id) > 0) return true;
    return this.findSpot(item) != null;
  }

  /**
   * 尝试放入物品（可堆叠物会先填补已有堆叠）。
   * 返回 true 表示完全放入；false 表示放不下（可能已部分合并/放置，item.stack 会同步减少）。
   * 注意：完全放入时，被放入的物品对象保留自身 stack 值，调用方需从来源移除。
   */
  addAuto(item) {
    const def = ITEMS[item.id];
    if (!def) return false;
    if (!(item.stack > 0)) item.stack = 1;

    if (def.stack > 1) {
      for (const e of this.items) {
        if (e.item.id !== item.id) continue;
        const space = def.stack - e.item.stack;
        if (space <= 0) continue;
        const move = Math.min(space, item.stack);
        e.item.stack += move;
        item.stack -= move;
        if (item.stack <= 0) return true;
      }
    }

    const stackSize = def.stack > 1 ? def.stack : 1;
    while (item.stack > 0) {
      const spot = this.findSpot(item);
      if (!spot) return false;
      const chunk = Math.min(stackSize, item.stack);
      if (chunk >= item.stack) {
        this.place(item, spot.x, spot.y);
        return true;
      }
      const copy = { uid: uid(), id: item.id, stack: chunk };
      if (item.rounds != null) copy.rounds = item.rounds;
      if (item.dur != null) copy.dur = item.dur;
      if (item.contents) copy.contents = item.contents;
      this.place(copy, spot.x, spot.y);
      item.stack -= chunk;
    }
    return true;
  }

  weight() {
    let w = 0;
    for (const e of this.items) {
      w += itemWeight(e.item);
      if (e.item.contents) w += e.item.contents.weight();
    }
    return w;
  }

  value() {
    let v = 0;
    for (const e of this.items) {
      const d = ITEMS[e.item.id];
      v += (d?.price || 0) * (d?.type === 'ammo' ? e.item.stack : 1);
    }
    return v;
  }

  clear() { this.items.length = 0; }
}

// ────────── 拖拽搬运 ──────────

export function transferItem(fromGrid, toGrid, itemUid, x, y) {
  const entry = fromGrid.find(itemUid);
  if (!entry) return { ok: false, msg: '物品不存在' };
  const item = entry.item;
  const def = ITEMS[item.id];
  if (!def) return { ok: false, msg: '未知物品' };

  x = Math.max(0, Math.min(x, toGrid.cols - def.w));
  y = Math.max(0, Math.min(y, toGrid.rows - def.h));

  // 堆叠合并
  if (def.stack > 1) {
    const target = toGrid.items.find((e) => {
      if (e.item.uid === item.uid) return false;
      if (e.item.id !== item.id) return false;
      const d = ITEMS[e.item.id];
      return x >= e.x && x < e.x + d.w && y >= e.y && y < e.y + d.h;
    });
    if (target && target.item.stack < def.stack) {
      const space = def.stack - target.item.stack;
      const move = Math.min(space, item.stack);
      target.item.stack += move;
      item.stack -= move;
      if (item.stack <= 0) fromGrid.remove(item.uid);
      return { ok: true, merged: true };
    }
  }

  const sameGrid = fromGrid === toGrid;
  if (sameGrid) {
    if (!toGrid.canPlace(item, x, y, item.uid)) return { ok: false, msg: '空间不足' };
    fromGrid.remove(item.uid);
    toGrid.place(item, x, y);
    return { ok: true };
  }
  if (!toGrid.canPlace(item, x, y)) return { ok: false, msg: '空间不足' };
  fromGrid.remove(item.uid);
  toGrid.place(item, x, y);
  return { ok: true };
}

/** 自动把物品转移到一组目标网格（按顺序尝试）。 */
export function autoTransfer(fromGrid, itemUid, targetGrids, out = null) {
  const entry = fromGrid.find(itemUid);
  if (!entry) return false;
  const item = entry.item;
  const startStack = item.stack;
  for (const g of targetGrids) {
    if (!g || g === fromGrid) continue;
    const full = g.addAuto(item);
    if (full) {
      fromGrid.remove(item.uid);
      if (out) out.amount = startStack;
      return true;
    }
  }
  if (item.stack < startStack) {
    if (out) out.amount = startStack - item.stack;
    return true; // 部分转移也算成功（剩余仍在来源中）
  }
  return false;
}

// ────────── 序列化 ──────────

export function serializeItem(item) {
  const raw = { uid: item.uid, id: item.id, stack: item.stack };
  if (item.rounds != null) raw.rounds = item.rounds;
  if (item.loadedAmmoId) raw.loadedAmmoId = item.loadedAmmoId;
  if (item.dur != null) raw.dur = item.dur;
  if (item.contents) raw.contents = serializeGrid(item.contents);
  return raw;
}

export function deserializeItem(raw) {
  if (!raw) return null;
  let stack = raw.stack != null ? raw.stack : 1;
  if (!(stack > 0)) stack = 1;
  const item = { uid: raw.uid, id: raw.id, stack };
  if (raw.rounds != null) item.rounds = raw.rounds;
  if (raw.loadedAmmoId) item.loadedAmmoId = raw.loadedAmmoId;
  if (raw.dur != null) item.dur = raw.dur;
  if (raw.contents) item.contents = deserializeGrid(raw.contents);
  return item;
}

export function serializeGrid(grid) {
  return {
    id: grid.id,
    cols: grid.cols,
    rows: grid.rows,
    items: grid.items.map((e) => ({ x: e.x, y: e.y, item: serializeItem(e.item) })),
  };
}

export function deserializeGrid(raw) {
  const grid = new Grid(raw.id, raw.cols, raw.rows);
  for (const e of raw.items || []) {
    const item = deserializeItem(e.item);
    if (item) grid.items.push({ item, x: e.x, y: e.y });
  }
  return grid;
}

// ────────── 装备与携带物 ──────────

export const EQUIP_SLOTS = ['primary', 'secondary', 'helmet', 'armor', 'rig', 'backpack'];

export function getBagGrid(equipment) {
  return equipment?.backpack?.contents || null;
}

export function getRigGrid(equipment) {
  return equipment?.rig?.contents || null;
}

export function carriedGrids(equipment, secure) {
  const arr = [];
  const bag = getBagGrid(equipment);
  if (bag) arr.push(bag);
  const rig = getRigGrid(equipment);
  if (rig) arr.push(rig);
  if (secure) arr.push(secure);
  return arr;
}

export function carriedWeight(equipment, secure) {
  let w = 0;
  if (!equipment) return w;
  for (const slot of EQUIP_SLOTS) {
    const it = equipment[slot];
    if (it) {
      w += itemWeight(it);
      if (it.contents) w += it.contents.weight();
    }
  }
  if (secure) w += secure.weight();
  return w;
}

export function reserveAmmoCount(equipment, secure, caliber) {
  let n = 0;
  for (const g of carriedGrids(equipment, secure)) {
    for (const e of g.items) {
      const def = ITEMS[e.item.id];
      if (def && def.type === 'ammo' && def.caliber === caliber) n += e.item.stack;
    }
  }
  return n;
}

/** 从携带物中取弹药，优先高穿透。返回 {count, ammoId} */
export function takeAmmo(equipment, secure, caliber, want) {
  const candidates = [];
  for (const g of carriedGrids(equipment, secure)) {
    for (const e of g.items) {
      const def = ITEMS[e.item.id];
      if (def && def.type === 'ammo' && def.caliber === caliber) candidates.push({ g, e, def });
    }
  }
  candidates.sort((a, b) => b.def.pen - a.def.pen);
  if (!candidates.length) return { count: 0, ammoId: null };
  const pickEntry = candidates[0];
  const count = Math.min(want, pickEntry.e.item.stack);
  pickEntry.e.item.stack -= count;
  if (pickEntry.e.item.stack <= 0) pickEntry.g.remove(pickEntry.e.item.uid);
  return { count, ammoId: pickEntry.e.item.id };
}

export function countItem(equipment, secure, itemId) {
  let n = 0;
  for (const g of carriedGrids(equipment, secure)) {
    for (const e of g.items) {
      if (e.item.id === itemId) n += e.item.stack || 1;
    }
  }
  return n;
}

/** 消耗一个消耗品；成功返回 true */
export function consumeOne(equipment, secure, itemId) {
  for (const g of carriedGrids(equipment, secure)) {
    for (const e of g.items) {
      if (e.item.id === itemId) {
        e.item.stack -= 1;
        if (e.item.stack <= 0) g.remove(e.item.uid);
        return true;
      }
    }
  }
  return false;
}

export function findFirstItem(equipment, secure, itemId) {
  for (const g of carriedGrids(equipment, secure)) {
    for (const e of g.items) {
      if (e.item.id === itemId) return e.item;
    }
  }
  return null;
}
