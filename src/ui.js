// ═══════════════════════════════════════════════════
// 界面层：菜单 / 基地 / 商人 / HUD / 搜刮 / 结算
// ═══════════════════════════════════════════════════

import {
  ITEMS, MAPS, MAP_ORDER, CATEGORIES, SLOT_LABELS, RARITY_NAMES,
  TRADER_CATALOG, TRADER_NAME, CALIBER_LABELS, itemWeight,
} from './data.js';
import {
  getBagGrid, getRigGrid, carriedWeight, autoTransfer, transferItem, EQUIP_SLOTS,
} from './inventory.js';
import {
  equipItemToSlot, unequipSlot, supplyItem, traderBuy, traderSell, sellValue,
  buyPrice, canClaimRelief, claimRelief,
} from './save.js';
import { formatTime, formatMoney, clamp, bearingDeg, dist } from './util.js';
import { CharacterShowcase } from './showcase.js';

const TYPE_LABELS = {
  weapon: '武器', ammo: '弹药', armor: '护甲', helmet: '头盔',
  rig: '弹挂', backpack: '背包', med: '医疗', valuable: '贵重',
};

const CHANGELOG = [
  {
    version: 'v1.14', date: '2026-11-16', title: '现代干员与五倍大地图',
    items: [
      '仓库干员改回现代特种兵造型（operator.glb），头盔、护甲、弹挂、背包、武器重新按装备实时挂载；科幻风 Vanguard 不再作为默认角色。',
      '六张地图扩大到约 5 倍面积（线性约 2.24 倍）：保留中心标志性布局，并复制为四向外围设施群，补充主题地标（重工厂、瞭望塔、龙门吊、雷达站、风车、断桥）。',
      '地图边界重做：工厂/军港/城区改为围栏 + 仓库/集装箱/废墟天际线 + 远景山体，并放缓工业图边缘地形；森林/雪原/农场保留山体与树线。',
      '敌人、物资、植被、资源点与撤离计时按新面积扩充；修复大图守卫槽位耗尽导致没有巡逻队的问题。',
      '相机远裁剪、地形细分与雾效适配大尺寸地图；新增六图出生点/边界截图工具。',
    ],
  },
  {
    version: 'v1.13', date: '2026-11-15', title: '商用角色、SSAO 与世界 PBR 材质',
    items: [
      '仓库干员接入商用级 Mixamo Vanguard 角色（character_vanguard.glb），盔甲、头盔、布料与骨骼动画质量大幅提升；武器仍按装备实时挂载。',
      '接入 Poly Haven CC0 PBR 贴图：六张地图的墙体、地面与岩壁改用 1K albedo/normal/roughness 材质组。',
      '后处理新增 SSAOPass 环境光遮蔽，配合 2048 跟随阴影增强建筑、角色与容器接触处的体积感。',
      'AssetManager 支持 18 组主题材质映射（工厂/森林/军港/雪原/农场/城区），外部贴图按主题自动替换。',
      '保留程序化 operator.glb 与程序化 humanoid.js 作为无外部资产时的回退。',
      '补充第三方资产来源与许可说明（assets/models/CREDITS.md、assets/textures/CREDITS-PolyHaven.md）。',
    ],
  },
  {
    version: 'v1.12', date: '2026-11-15', title: '画面质量升级',
    items: [
      '新增后处理管线：UnrealBloom 泛光、SMAA 抗锯齿、ACES 输出、电影感调色（对比度/饱和度/暗角/颗粒/色散/锐化）。',
      '阳光阴影改为跟随玩家的 2048 阴影贴图，覆盖 40m，近景阴影精度提升约 20 倍。',
      '角色贴图升级到 1024 迷彩/皮肤，并加入程序化织物、皮革、拉丝金属、木纹法线贴图。',
      '角色、装备、武器、容器补充大量几何细节：手指、鞋带/鞋底纹、MOLLE 织带、扣具、电台天线、导轨、螺丝、铆钉与标签。',
      '头部与头盔比例缩小，拾荒者增加眼白、瞳孔、鼻子、嘴与胡须，改善近景观感。',
      '所有 GLB 贴图改用 WEBP 压缩，资产体积从 140MB 降到约 23MB，加载更快。',
      '外部 GLB 材质在载入时自动补充细节法线与环境反射强度，避免外部资产看起来过于扁平。',
    ],
  },
  {
    version: 'v1.11', date: '2026-11-15', title: 'Blender 武器 / 装备 / 道具资产',
    items: [
      '15 把武器改用 Blender 导出的 GLB：附第一人称手套/袖口、muzzle 枪口节点与 Idle/Aim/Fire/Reload 动作。',
      '18 件装备（5 头盔 / 7 护甲 / 3 弹挂 / 3 背包）生成独立 GLB，仓库展示台按骨骼挂载并实时换装。',
      '仓库干员改用 operator.glb：Blender 骨骼动画 + 装备 GLB 按 Chest/Head 骨骼附着，保留拖拽旋转与铭牌。',
      '8 种搜刮容器改为 GLB 场景道具，保留可开启的 lidPivot 铰链、资源点标记条与碰撞体。',
      'AssetManager 新增 gear / props 资产类别；蒙皮角色与装备共享骨骼空间，换装无缩放错位。',
      '修复 Blender 5.x 图像色彩空间导致贴图全黑的问题，所有 GLB 贴图均正常打包。',
    ],
  },
  {
    version: 'v1.10', date: '2026-11-15', title: 'Blender 角色资产管线',
    items: [
      '新增 tools/blender 资产管线：用 Blender Python 程序化建模、蒙皮、烘焙 PBR 贴图并导出 GLB。',
      '拾荒者、掠夺者、首领改用 Blender 导出的骨骼蒙皮模型，包含 20 根骨骼与 Idle/Walk/Run/Aim/Fire/Death 六段动画。',
      '角色材质使用程序化迷彩/皮肤/金属贴图，装备带圆角、软包与织带细节，整体轮廓更接近真实战术角色。',
      '修复蒙皮 GLB 在游戏内包围盒计算错误导致体型缩放异常的问题，改为更新矩阵后手动合并几何包围盒。',
      '干员模型 operator.glb 已生成，可作为仓库展示台后续接入的资产。',
      '保留程序化 humanoid.js 作为 GLB 缺失时的回退方案。',
    ],
  },
  {
    version: 'v1.9', date: '2026-11-14', title: '骨骼蒙皮角色与材质动画管线',
    items: [
      '敌人与仓库干员改用真正的骨骼蒙皮网格（SkinnedMesh）：躯干、四肢、头部共享 20 根骨骼，关节处权重平滑过渡，弯曲时不再出现分段硬折。',
      '新增 humanoid.js：程序化生成骨骼、蒙皮权重与合并网格，供全部人形角色复用，几何体与材质在实例间共享。',
      '材质系统全面接入：程序化迷彩/尼龙织物 albedo、粗糙度与细节法线贴图，皮肤噪点、金属头盔与护甲高光；所有部件使用 PBR 环境反射。',
      '动作系统改用 AnimationMixer：程序化采样生成 idle / walk / run / aim / fire / death 六段动画剪辑，支持交叉淡入、循环与单次播放。',
      '持枪方式改为双手随骨骼运动：武器挂在右手骨骼上，行走时随手臂摆动，瞄准时抵肩、开火时后坐。',
      '头部重做：拾荒者保留有眉眼与胡茬的面部，其他角色改为巴拉克拉法帽 + 风镜 + 面巾/呼吸器；颈部加入围脖，比例与轮廓更自然。',
      '仓库干员与敌人共用同一套骨骼动画，展台换装后的护甲、弹挂、背包也改用同一材质库并圆滑化外观。',
    ],
  },
  {
    version: 'v1.8', date: '2026-11-14', title: '角色模型与动作重做',
    items: [
      '敌人与仓库干员统一重做：增加颈部、肩/肘/髋/膝关节球体，圆滑化胸腹与护甲，消除生硬的方块接缝。',
      '面部与装备细节升级：拾荒者拥有眉眼、鼻子与胡茬；掠夺者/首领增加护目镜、呼吸面罩、下颌带、导轨与肩甲。',
      '双手改为自然持枪姿态：巡逻时低姿持枪、警戒时抬枪抵肩，行走时手臂摆动幅度更小，不再像机械人偶。',
      '行走动画加入骨盆扭转、重心起伏、躯干反向旋转、屈膝与头部稳定；待机加入呼吸、换重心与环视动作。',
      '新增倒地动画：中弹后屈膝卸力、手臂摊开并侧向倒下，替代原先瞬间横躺的硬切。',
      '仓库干员改为右手搭在胸前枪带、左臂放松的非对称站姿，并加入重心转移与头部环视。',
    ],
  },
  {
    version: 'v1.7', date: '2026-11-14', title: '仓库角色展示台',
    items: [
      '基地仓库中央新增可旋转 3D 角色展示台，带金色展台、环境光与浮尘效果。',
      '角色按当前装备实时显示头盔、护甲、弹挂、背包与主/副武器，换装立即同步。',
      '支持按住拖拽自由旋转，拖动结束保留惯性；提供正面/左侧/背面/右侧角度按钮与逐档旋转按钮。',
      '双击角色复位正面，拖拽与按钮切换时自动高亮当前朝向。',
      '角色带呼吸待机动画与干员等级/军衔铭牌，装备槽压缩到展台下方，仓库布局改为左仓右携带、中央角色。',
    ],
  },
  {
    version: 'v1.6', date: '2026-11-14', title: '材质与动画资产管线',
    items: [
      '启动流程加入资产加载界面，显示 GLB / PBR 贴图加载进度。',
      '新增 AssetManager：运行时读取 assets/manifest.json，可无代码接入敌人与第一人称武器 GLB 模型。',
      '支持骨骼动画：敌人 idle/walk/run/aim/fire/death，武器 idle/aim/fire/reload；未配置时按剪辑名自动推断。',
      '新增 PBR 材质库：albedo/normal/roughness/metalness/AO 贴图组、按主题自动替换墙/地面/岩石材质、程序化细节法线。',
      '使用天空生成 PMREM 环境反射，金属、护甲与枪械拥有真实高光反射。',
      '第一人称武器接入枪口节点与动画状态机；外部敌人模型按命中高度自动判定头/躯干/腿部。',
      '外部资产缺失或加载失败时自动回退程序化模型，不影响正常游戏。',
    ],
  },
  {
    version: 'v1.5', date: '2026-11-14', title: '碰撞、边界与公告系统',
    items: [
      '敌人子弹改为真实射线弹道：围栏、集装箱、墙体与地形会真正阻挡射击。',
      '加高农田围栏并增加实体碰撞，不再出现“子弹穿栏”。',
      '修复植被生长进建筑、树冠贴墙、容器插进地形等穿模问题。',
      '修复出生点整平形成的凸起平台与陡坡“空气墙”：出生点改为天然平缓地面，移动仅阻挡上坡。',
      '地图边界新增可见岩壁/围墙与实体碰撞，减少突兀的空气墙。',
      '主菜单新增更新公告，完整展示初代至今的全部版本记录。',
      '提高关键程序化材质分辨率，优化草地/树冠/建筑在低光下的可读性。',
    ],
  },
  {
    version: 'v1.4', date: '2026-11-14', title: '世界、资源点与敌人重做',
    items: [
      '所有地图改为起伏地形，加入坡度碰撞、自然山体边界与程序化天空穹顶。',
      '3D 草丛、阔叶/针叶树、灌木、岩石与地形顶点色混合，替换平面贴图地面。',
      '物资改为高/中/低价值资源点，高价值区额外掉落稀有物资并配置守卫。',
      '敌人改为关节骨骼模型，行走/待机/瞄准/后坐/倒地全部有肢体动画。',
      '守卫原地警戒扫视，只有巡逻队移动；敌人材质改为迷彩布料、防弹衣与背包装备。',
    ],
  },
  {
    version: 'v1.3', date: '2026-11-14', title: '六张大型地图',
    items: [
      '新增荒岭雪原、河谷农场、断壁城区三张地图。',
      '废弃工厂、松林哨站、军港集装箱区整体扩大，敌人密度下调。',
      '新增冰湖、筒仓、风车、街区、废墟车辆、瓦砾等场景元素。',
    ],
  },
  {
    version: 'v1.2', date: '2026-11-13', title: '局内换装',
    items: [
      '战局背包与搜刮界面加入可拖拽的装备槽，支持武器/护甲/头盔/弹挂/背包替换。',
      '双击装备类物品快速穿戴，替换下来的装备自动放回来源容器或背包。',
    ],
  },
  {
    version: 'v1.1', date: '2026-11-13', title: '基地仓库与弹挂',
    items: [
      '列表仓库与整理弹层合并为一体化网格仓库，支持拖拽、双击与物品详情操作。',
      '新增弹挂装备槽与独立携带空间，换弹/医疗自动从弹挂取用。',
      '新增 7 把武器、3 件护甲、2 顶头盔与 5 种弹药。',
      '基地中可直接查看背包、弹挂与保险箱内容。',
    ],
  },
  {
    version: 'v1.0', date: '2026-11-13', title: '初代版本',
    items: [
      '搜刮 / 交战 / 撤离核心循环，三张初始地图与撤离倒计时。',
      '第一人称射击、部位伤害、护甲穿透、流血、负重与医疗系统。',
      '网格背包、战利品稀有度、商人买卖、跨局仓库与本地存档。',
      '拾荒者/掠夺者/首领 AI、撤离结算与死亡掉落。',
    ],
  },
];

const EQUIP_TYPE_BY_SLOT = {
  primary: 'weapon', secondary: 'weapon',
  helmet: 'helmet', armor: 'armor', rig: 'rig', backpack: 'backpack',
};

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.selectedMap = 'factory';
    this.stashFilter = 'all';
    this.traderTab = 'weapons';
    this.lootContainer = null;
    this.selectedItem = null;
    this.gridMap = new Map();
    this._dragPayload = null;
    this._cache = {};
    this._marks = [];
    this._lastScope = false;
    this._dmgTimeout = null;
    this._hitTimeout = null;
    this.lastReserve = 0;
    this.reserveTimer = 0;
    this.showcase = null;
    this.showcaseQuarter = 0;

    const $ = (id) => document.getElementById(id);
    this.refs = {
      hud: $('hud'),
      loading: $('loading-screen'),
      loadingFill: $('loadingFill'),
      loadingLabel: $('loadingLabel'),
      screens: $('screens'),
      menu: $('screen-menu'),
      prep: $('screen-prep'),
      trader: $('screen-trader'),
      result: $('screen-result'),
      loot: $('overlay-loot'),
      inventory: $('overlay-inventory'),
      help: $('overlay-help'),
      pause: $('overlay-pause'),
      click: $('overlay-click'),
      announcement: $('overlay-announcement'),
      scope: $('scope'),
      vignette: $('vignette'),
      damageFlash: $('damageFlash'),
      compassTicks: $('compassTicks'),
      compassMarks: $('compassMarks'),
      compassHeading: $('compassHeading'),
      mapLabel: $('mapLabel'),
      raidTimer: $('raidTimer'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      prompt: $('interactPrompt'),
      extractBar: $('extractBar'),
      extractFill: $('extractFill'),
      extractText: $('extractText'),
      medBar: $('medBar'),
      medFill: $('medFill'),
      medText: $('medText'),
      log: $('log'),
      weaponName: $('weaponName'),
      ammoCount: $('ammoCount'),
      ammoReserve: $('ammoReserve'),
      fireMode: $('fireMode'),
      reloadHint: $('reloadHint'),
      quickSlots: $('quickSlots'),
      weightText: $('weightText'),
      extractHint: $('extractHint'),
      toastWrap: $('toast-wrap'),
      bodyParts: {
        head: $('part-head'), thorax: $('part-thorax'), stomach: $('part-stomach'),
        armL: $('part-armL'), armR: $('part-armR'), legL: $('part-legL'), legR: $('part-legR'),
      },
      staminaFill: $('staminaFill'),
      bleedIndicator: $('bleedIndicator'),
    };

    this.buildCompass();
    this.renderMenu();
    this.renderHelp();
    this.renderPause();
    this.bindEvents();
  }

  // ═══════════════ 事件绑定 ═══════════════

  bindEvents() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      this.game.audio.init();
      this.handleAction(el.dataset.action, el);
    });

    document.addEventListener('click', (e) => {
      if (this.game.state === 'raid') return;
      if (!this.isScreenVisible('prep')) return;
      if (e.target.closest('[data-action]')) return;
      const tile = e.target.closest('#screen-prep .gitem');
      if (!tile) return;
      this.selectPrepItem(tile.dataset.gid, tile.dataset.uid);
    });

    document.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.gitem');
      if (!tile) return;
      this._dragPayload = { gid: tile.dataset.gid, uid: tile.dataset.uid };
      e.dataTransfer.setData('text/plain', JSON.stringify(this._dragPayload));
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    });

    document.addEventListener('dragend', () => {
      this._dragPayload = null;
      document.querySelectorAll('.gitem.dragging').forEach((el) => el.classList.remove('dragging'));
      document.querySelectorAll('.inv-grid.droptarget, .equip-drop.droptarget').forEach((el) => el.classList.remove('droptarget'));
    });

    document.addEventListener('dragover', (e) => {
      const slotEl = e.target.closest('[data-equip-slot]');
      if (slotEl) {
        const payload = this._dragPayload;
        const fromGrid = payload && this.gridMap.get(payload.gid);
        const entry = fromGrid && fromGrid.find(payload.uid);
        if (!entry) return;
        const def = ITEMS[entry.item.id];
        if (!def || EQUIP_TYPE_BY_SLOT[slotEl.dataset.equipSlot] !== def.type) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        slotEl.classList.add('droptarget');
        return;
      }
      const gridEl = e.target.closest('.inv-grid');
      if (!gridEl || !this.gridMap.has(gridEl.dataset.gridId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      gridEl.classList.add('droptarget');
    });

    document.addEventListener('dragleave', (e) => {
      const slotEl = e.target.closest('[data-equip-slot]');
      if (slotEl) { slotEl.classList.remove('droptarget'); return; }
      const gridEl = e.target.closest('.inv-grid');
      if (gridEl) gridEl.classList.remove('droptarget');
    });

    document.addEventListener('drop', (e) => {
      const slotEl = e.target.closest('[data-equip-slot]');
      if (slotEl) {
        e.preventDefault();
        slotEl.classList.remove('droptarget');
        const payload = this._dragPayload;
        if (payload) {
          const fromGrid = this.gridMap.get(payload.gid);
          if (fromGrid) this.equipFromGrid(slotEl.dataset.equipSlot, fromGrid, payload.uid);
        }
        return;
      }
      const gridEl = e.target.closest('.inv-grid');
      if (!gridEl) return;
      e.preventDefault();
      gridEl.classList.remove('droptarget');
      let from = null;
      try { from = JSON.parse(e.dataTransfer.getData('text/plain') || 'null'); } catch (err) { from = null; }
      if (!from) return;
      const toGrid = this.gridMap.get(gridEl.dataset.gridId);
      const fromGrid = this.gridMap.get(from.gid);
      if (!toGrid || !fromGrid) return;
      const cell = Number(gridEl.dataset.cell) || 36;
      const rect = gridEl.getBoundingClientRect();
      const x = clamp(Math.floor((e.clientX - rect.left) / cell), 0, toGrid.cols - 1);
      const y = clamp(Math.floor((e.clientY - rect.top) / cell), 0, toGrid.rows - 1);
      const res = transferItem(fromGrid, toGrid, from.uid, x, y);
      if (res.ok) {
        this.game.audio.pickup();
        this.afterInventoryChange();
      } else {
        this.toast(res.msg || '无法移动', 'bad');
      }
    });

    document.addEventListener('dblclick', (e) => {
      const tile = e.target.closest('.gitem');
      if (!tile) return;
      if (this.lootContainer) {
        this.quickLootItem(tile.dataset.gid, tile.dataset.uid);
      } else if (!this.refs.inventory.classList.contains('hidden')) {
        this.raidQuickMove(tile.dataset.gid, tile.dataset.uid);
      } else if (this.isScreenVisible('prep')) {
        this.prepQuickMove(tile.dataset.gid, tile.dataset.uid);
      }
    });

    this.refs.click.addEventListener('click', () => this.game.resumeGame());

    const sens = document.getElementById('sensSlider');
    if (sens) {
      sens.addEventListener('input', () => {
        const v = parseFloat(sens.value);
        document.getElementById('sensVal').textContent = v.toFixed(2);
        this.game.setSensitivity(v);
      });
    }
  }

  handleAction(action, el) {
    const d = el.dataset;
    switch (action) {
      case 'prep': this.game.openScreen('prep'); break;
      case 'prepBack': this.game.openScreen('prep'); break;
      case 'trader':
      case 'openTrader': this.game.openScreen('trader'); break;
      case 'menu': this.game.openScreen('menu'); break;
      case 'help': this.showHelp(); break;
      case 'announcement': this.showAnnouncement(); break;
      case 'closeAnnouncement': this.hideAnnouncement(); break;
      case 'closeHelp': this.hideHelp(); break;
      case 'pauseHelp': this.showHelp(); break;
      case 'reset': {
        if (window.confirm('确定要重置存档吗？仓库、资金与统计将全部清空，且无法恢复。')) {
          this.game.resetSave();
          this.renderMenu();
          this.game.openScreen('menu');
          this.game.audio.uiClick();
        }
        break;
      }
      case 'selectMap':
        this.selectedMap = d.map;
        this.updateMapSelection();
        this.game.audio.uiClick();
        break;
      case 'charAngle': {
        const q = Number(d.q) || 0;
        if (this.showcase) {
          this.showcase.setAngle(q * Math.PI / 2);
          this.showcase.start();
        }
        this.highlightCharAngle(q);
        this.game.audio.uiClick();
        break;
      }
      case 'charTurn':
        if (this.showcase) {
          this.showcase.turnBy(Number(d.dir || 1) * Math.PI / 4);
          this.showcase.start();
        }
        this.game.audio.uiClick();
        break;
      case 'stashTab':
        this.stashFilter = d.cat;
        this.refreshPrep();
        break;
      case 'equip': {
        const res = equipItemToSlot(this.game.save, d.uid, d.slot);
        if (res.ok) {
          this.game.audio.pickup();
          this.game.saveGame();
          this.refreshPrep();
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'unequip': {
        const res = unequipSlot(this.game.save, d.slot);
        if (res.ok) {
          this.game.audio.uiClick();
          this.game.saveGame();
          this.selectedItem = null;
          this.refreshPrep();
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'supply': {
        const res = supplyItem(this.game.save, d.uid);
        if (res.ok) {
          this.game.audio.pickup();
          this.game.saveGame();
          this.refreshPrep();
          if (res.msg) this.toast(res.msg, 'bad');
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'sell': {
        const res = traderSell(this.game.save, d.uid);
        if (res.ok) {
          this.game.audio.uiClick();
          this.game.saveGame();
          this.toast(`卖出获得 ₽${formatMoney(res.value)}`, 'good');
          if (this.isScreenVisible('prep')) this.refreshPrep();
          if (this.isScreenVisible('trader')) this.refreshTrader();
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'traderTab':
        this.traderTab = d.tab;
        this.refreshTrader();
        break;
      case 'buy': {
        const res = traderBuy(this.game.save, d.id, parseInt(d.qty || '1', 10));
        if (res.ok) {
          this.game.audio.pickup();
          this.game.saveGame();
          this.toast(`购买成功 -₽${formatMoney(res.price)}`, 'good');
          this.refreshTrader();
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'claimRelief': {
        const res = claimRelief(this.game.save);
        this.toast(res.msg, res.ok ? 'good' : 'bad');
        if (res.ok) {
          this.game.saveGame();
          this.game.audio.pickup();
          this.refreshPrep();
        }
        break;
      }
      case 'startRaid': {
        const eq = this.game.save.equipment;
        if (!eq.primary && !eq.secondary) {
          this.toast('至少装备一把武器才能进入行动', 'bad');
          return;
        }
        this.game.startRaid(this.selectedMap);
        break;
      }
      case 'resume': this.game.resumeGame(); break;
      case 'abandon': {
        if (window.confirm('放弃行动将被视为阵亡，所有携带装备都会遗失。确定放弃吗？')) {
          this.game.abandonRaid();
        }
        break;
      }
      case 'toPrep': this.game.openScreen('prep'); break;
      case 'toMenu': this.game.openScreen('menu'); break;
      case 'again':
        this.game.openScreen('prep');
        break;
      case 'closeLoot':
      case 'closeInventory':
        this.game.closeOverlay();
        break;
      case 'detailEquip': {
        const grid = this.gridMap.get(d.gid);
        if (grid) this.equipFromGrid(d.slot, grid, d.uid);
        break;
      }
      case 'detailMove': {
        const grid = this.gridMap.get(d.gid);
        if (!grid) break;
        const save = this.game.save;
        const target = d.target === 'stash' ? save.stash
          : d.target === 'bag' ? getBagGrid(save.equipment)
            : d.target === 'rig' ? getRigGrid(save.equipment)
              : d.target === 'secure' ? save.secure : null;
        if (!target) { this.toast('未装备对应容器', 'bad'); break; }
        if (grid === target) break;
        if (!autoTransfer(grid, d.uid, [target])) {
          this.toast('目标容器空间不足', 'bad');
          break;
        }
        this.game.audio.pickup();
        this.game.saveGame();
        this.selectedItem = null;
        this.refreshPrep();
        break;
      }
      case 'detailSell': {
        const res = traderSell(this.game.save, d.uid);
        if (res.ok) {
          this.game.audio.uiClick();
          this.game.saveGame();
          this.toast(`卖出获得 ₽${formatMoney(res.value)}`, 'good');
          this.selectedItem = null;
          this.refreshPrep();
        } else {
          this.toast(res.msg, 'bad');
        }
        break;
      }
      case 'detailClose':
        this.clearDetail();
        break;
      case 'lootAll':
        this.lootAll();
        break;
      case 'closeResult':
        this.game.openScreen('prep');
        break;
      default:
        break;
    }
  }

  // ═══════════════ 屏幕管理 ═══════════════

  hideScreens() {
    for (const el of [this.refs.menu, this.refs.prep, this.refs.trader, this.refs.result]) {
      el.classList.add('hidden');
    }
    if (this.showcase) this.showcase.stop();
  }

  showScreen(name) {
    this.hideScreens();
    if (name === 'menu') this.refs.menu.classList.remove('hidden');
    else if (name === 'prep') this.refs.prep.classList.remove('hidden');
    else if (name === 'trader') this.refs.trader.classList.remove('hidden');
    else if (name === 'result') this.refs.result.classList.remove('hidden');
    if (name === 'prep' && this.showcase) this.showcase.start();
  }

  isScreenVisible(name) {
    const map = { menu: this.refs.menu, prep: this.refs.prep, trader: this.refs.trader, result: this.refs.result };
    return map[name] && !map[name].classList.contains('hidden');
  }

  setHUDVisible(v) {
    this.refs.hud.classList.toggle('hidden', !v);
    if (!v) {
      this.setScope(false);
      this.setPrompt(null);
      this.setMedProgress(null);
      this.setExtractProgress(null);
    }
  }

  // ═══════════════ 加载界面 ═══════════════

  showLoading(label = '正在准备灰区…') {
    this.refs.loading.classList.remove('hidden');
    this.setLoading(0, label);
  }

  setLoading(progress, label) {
    if (this.refs.loadingFill) this.refs.loadingFill.style.transform = `scaleX(${clamp(progress, 0, 1)})`;
    if (label && this.refs.loadingLabel) this.refs.loadingLabel.textContent = label;
  }

  hideLoading() {
    this.refs.loading.classList.add('hidden');
  }

  // ═══════════════ 主菜单 ═══════════════

  renderMenu() {
    const save = this.game.save;
    const s = save.stats;
    const rate = s.raids > 0 ? Math.round((s.extracts / s.raids) * 100) : 0;
    this.refs.menu.innerHTML = `
      <div class="menu-wrap">
        <div class="menu-left">
          <div class="game-logo">
            <div class="logo-mark">GZ</div>
            <div>
              <h1>灰区行动</h1>
              <div class="logo-sub">GREY ZONE · EXTRACTION</div>
            </div>
          </div>
          <p class="menu-tagline">
            搜刮 · 交战 · 撤离。灰区不承认眼泪，<b>死亡会带走你身上的一切</b>——
            只有活着走到撤离点，战利品才真正属于你。
          </p>
          <div class="announce-teaser" data-action="announcement">
            <span class="at-tag">公告</span>
            <span class="at-text"><b>v1.6</b> 材质与动画资产管线 · 支持外部 GLB / PBR</span>
            <span class="at-arrow">查看全部 ›</span>
          </div>
          <div class="menu-actions">
            <button class="btn btn-primary" data-action="prep">进入基地</button>
            <button class="btn" data-action="trader">商人</button>
            <button class="btn" data-action="announcement">更新公告</button>
            <button class="btn" data-action="help">玩法说明</button>
            <button class="btn btn-ghost" data-action="reset">重置存档</button>
          </div>
        </div>
        <aside class="menu-side">
          <div class="stat-row"><span>可用资金</span><b class="gold" id="menuMoney">₽ ${formatMoney(save.money)}</b></div>
          <div class="stat-row"><span>行动次数</span><b>${s.raids}</b></div>
          <div class="stat-row"><span>成功撤离</span><b>${s.extracts}</b></div>
          <div class="stat-row"><span>击杀数</span><b>${s.kills}</b></div>
          <div class="stat-row"><span>阵亡次数</span><b>${s.deaths}</b></div>
          <div class="stat-row"><span>撤离率</span><b>${rate}%</b></div>
        </aside>
      </div>
      <div class="menu-footer">GREY ZONE v1.6 · 单机硬核原型 · 数据保存在本地浏览器</div>
    `;
  }

  refreshMenu() { this.renderMenu(); }

  // ═══════════════ 基地 / 准备 ═══════════════

  refreshPrep() {
    const save = this.game.save;
    const eq = save.equipment;
    const hasWeapon = !!(eq.primary || eq.secondary);
    const bag = getBagGrid(eq);
    const rig = getRigGrid(eq);
    const weight = carriedWeight(eq, save.secure);
    const over = weight > 22;
    const stashValue = save.stash.value();
    const usedCells = (g) => (g ? g.items.reduce((s, e) => s + ITEMS[e.item.id].w * ITEMS[e.item.id].h, 0) : 0);
    const bagCells = eq.backpack ? ITEMS[eq.backpack.id].capacity[0] * ITEMS[eq.backpack.id].capacity[1] : 0;
    const rigCells = eq.rig ? ITEMS[eq.rig.id].capacity[0] * ITEMS[eq.rig.id].capacity[1] : 0;
    const secureCells = save.secure.cols * save.secure.rows;

    this.selectedItem = null;
    this.gridMap = new Map();
    const stashHtml = this.buildGrid(save.stash, 30);
    const bagHtml = bag ? this.buildGrid(bag, 44) : '<div class="wh-empty">未装备背包 · 可在商人处购买</div>';
    const rigHtml = rig ? this.buildGrid(rig, 44) : '<div class="wh-empty">未装备弹挂 · 可在商人处购买</div>';
    const secureHtml = this.buildGrid(save.secure, 44);
    const equipHtml = this.buildEquipSlotsHTML(true);

    const mapChips = MAP_ORDER.map((id) => {
      const m = MAPS[id];
      const dots = [1, 2, 3].map((i) => `<i class="${i <= m.difficulty ? 'on' : ''}"></i>`).join('');
      return `<div class="map-chip ${id === this.selectedMap ? 'selected' : ''}" data-action="selectMap" data-map="${id}">
        <div class="map-chip-top"><b>${m.name}</b><span class="map-diff">${dots}</span></div>
        <div class="map-chip-meta">${formatTime(m.timer)} · 敌人 ${m.enemies.reduce((a, b) => a + b.count, 0)} · 撤离 ${m.extracts.length}</div>
      </div>`;
    }).join('');

    const relief = canClaimRelief(save)
      ? `<button class="btn btn-sm" data-action="claimRelief" style="margin-top:6px">领取救济物资</button>`
      : '';

    const stats = save.stats || {};
    const level = 1 + Math.floor((stats.kills || 0) / 4) + Math.floor((stats.extracts || 0) / 2);
    const RANKS = ['预备干员', '列兵', '下士', '中士', '上士', '军士长', '准尉', '少尉', '中尉', '上尉'];
    const rank = RANKS[Math.min(RANKS.length - 1, Math.floor(level / 3))];

    this.refs.prep.innerHTML = `
      <div class="page base-page">
        <header class="page-head">
          <div class="page-title">
            <h2>仓库 · 行动准备</h2>
            <p>整理仓库与装备，选择行动区域。拖拽物品到装备槽即可穿戴，点击物品查看详情与操作。</p>
          </div>
          <div class="page-head-right">
            <div class="money">${formatMoney(save.money)}</div>
            <button class="btn btn-sm" data-action="openTrader">商人</button>
            <button class="btn btn-sm" data-action="menu">主菜单</button>
          </div>
        </header>
        <div class="warehouse-layout">
          <section class="panel wh-stash">
            <div class="panel-head"><h3>仓库</h3><span class="wh-cap">${save.stash.items.length} 件 · 占用 ${usedCells(save.stash)} 格 · 10×16</span></div>
            <div class="wh-stash-scroll">${stashHtml}</div>
            <div class="wh-note">点击物品查看详情 · 拖拽整理与装备 · 双击快速转移</div>
          </section>
          <section class="panel wh-char">
            <div class="panel-head"><h3>角色</h3><span class="wh-cap">装备实时同步</span></div>
            <div class="char-stage" id="charStage">
              <div class="char-id">
                <span class="char-lv">LV.<b>${level}</b></span>
                <div class="char-id-text">
                  <span class="char-name">干员 GZ-07</span>
                  <span class="char-rank">${rank} · 击杀 ${stats.kills || 0} · 撤离 ${stats.extracts || 0}</span>
                </div>
              </div>
              <div class="char-angles">
                <button class="char-angle" data-action="charAngle" data-q="0">正面</button>
                <button class="char-angle" data-action="charAngle" data-q="1">左侧</button>
                <button class="char-angle" data-action="charAngle" data-q="2">背面</button>
                <button class="char-angle" data-action="charAngle" data-q="3">右侧</button>
              </div>
              <div class="char-turn">
                <button data-action="charTurn" data-dir="-1" title="向左旋转">‹</button>
                <button data-action="charTurn" data-dir="1" title="向右旋转">›</button>
              </div>
              <div class="char-hint">按住拖拽旋转 · 双击复位</div>
            </div>
            <div class="char-equip">
              <div class="char-equip-head"><span>装备槽</span><span>拖入物品即可穿戴</span></div>
              ${equipHtml}
            </div>
            <div class="wh-equip-foot">
              <div class="kv"><span>总负重</span><b class="${over ? 'over' : ''}">${weight.toFixed(1)} / 22 kg</b></div>
              <div class="kv"><span>仓库估值</span><b>₽ ${formatMoney(stashValue)}</b></div>
              ${relief}
            </div>
          </section>
          <section class="panel wh-carry">
            <div class="panel-head"><h3>携带容器</h3><span class="wh-cap">拖拽整理</span></div>
            <div class="wh-carry-scroll">
              <div class="loot-col-title"><span>背包</span><span class="cap">${eq.backpack ? `${bag ? bag.items.length : 0} 件 / ${bagCells} 格` : '未装备'}</span></div>
              ${bagHtml}
              <div class="loot-col-title" style="margin-top:4px"><span>弹挂</span><span class="cap">${eq.rig ? `${rig ? rig.items.length : 0} 件 / ${rigCells} 格` : '未装备'}</span></div>
              ${rigHtml}
              <div class="loot-col-title" style="margin-top:4px"><span>保险箱（阵亡后保留）</span><span class="cap">${save.secure.items.length} 件 / ${secureCells} 格</span></div>
              ${secureHtml}
            </div>
          </section>
        </div>
        <section class="panel wh-detail" id="whDetail">${this.renderDetailHTML()}</section>
        <footer class="warehouse-footer">
          <div class="map-picker">
            <div class="map-strip">${mapChips}</div>
            <div class="map-brief" id="mapBrief">${this.mapBriefHTML()}</div>
          </div>
          <div class="wh-start">
            <div class="start-hint">${hasWeapon ? '阵亡会失去所有携带装备 · 保险箱物品保留' : '请先从仓库装备一把武器'}</div>
            <button class="btn btn-primary btn-lg" data-action="startRaid" ${hasWeapon ? '' : 'disabled'}>
              ${hasWeapon ? '开始行动' : '请先装备武器'}
            </button>
          </div>
        </footer>
      </div>
    `;
    this.mountShowcase();
  }

  // ═══════════════ 角色展示台 ═══════════════

  mountShowcase() {
    const stage = this.refs.prep.querySelector('#charStage');
    if (!stage) return;
    if (!this.showcase) {
      try {
        this.showcase = new CharacterShowcase(this.game);
        this.showcase.onQuarter = (q) => this.highlightCharAngle(q);
      } catch (e) {
        console.warn('[角色展示台] 初始化失败，已回退为纯仓库界面：', e);
        stage.classList.add('char-stage-fallback');
        stage.innerHTML = '<div class="char-fallback-note">当前设备无法启动 3D 角色预览</div>' + stage.innerHTML;
        return;
      }
    }
    this.showcase.mount(stage);
    this.showcase.updateEquipment(this.game.save.equipment);
    this.showcaseQuarter = this.showcase.quarter;
    this.highlightCharAngle(this.showcaseQuarter);
    if (this.isScreenVisible('prep')) this.showcase.start();
  }

  highlightCharAngle(q) {
    for (const el of this.refs.prep.querySelectorAll('.char-angle')) {
      el.classList.toggle('on', Number(el.dataset.q) === Number(q));
    }
  }

  updateMapSelection() {
    for (const el of this.refs.prep.querySelectorAll('.map-chip')) {
      el.classList.toggle('selected', el.dataset.map === this.selectedMap);
    }
    const brief = this.refs.prep.querySelector('#mapBrief');
    if (brief) brief.innerHTML = this.mapBriefHTML();
  }

  mapBriefHTML() {
    const map = MAPS[this.selectedMap];
    const enemyCount = map.enemies.reduce((a, b) => a + b.count, 0);
    return `<b>${map.name}</b><span class="map-en">${map.en}</span> · <span class="map-brief-sub">面积 ${map.size}×${map.size}m · 敌人 ${enemyCount} · 撤离点 ${map.extracts.map((e) => e.name).join(' / ')}</span> · ${map.desc}<br><span class="map-brief-sub">${map.lootHint}（撤离区域停留 ${map.extractTime} 秒）</span>`;
  }

  selectPrepItem(gridId, itemUid) {
    if (this.game.state === 'raid') return;
    const grid = this.gridMap.get(gridId);
    if (!grid || !grid.find(itemUid)) return;
    this.selectedItem = { gridId, uid: itemUid };
    for (const el of this.refs.prep.querySelectorAll('.gitem.selected')) el.classList.remove('selected');
    for (const el of this.refs.prep.querySelectorAll('.gitem')) {
      if (el.dataset.gid === gridId && el.dataset.uid === itemUid) el.classList.add('selected');
    }
    const detail = this.refs.prep.querySelector('#whDetail');
    if (detail) detail.innerHTML = this.renderDetailHTML();
    this.game.audio.uiClick();
  }

  clearDetail() {
    this.selectedItem = null;
    for (const el of this.refs.prep.querySelectorAll('.gitem.selected')) el.classList.remove('selected');
    const detail = this.refs.prep.querySelector('#whDetail');
    if (detail) detail.innerHTML = this.renderDetailHTML();
  }

  renderDetailHTML() {
    const empty = `<div class="detail-empty"><span class="detail-title">物品详情</span><span>点击网格中的物品查看属性与操作。拖拽物品可整理仓库，拖到装备槽直接装备。</span></div>`;
    const sel = this.selectedItem;
    if (!sel) return empty;
    const grid = this.gridMap.get(sel.gridId);
    const entry = grid && grid.find(sel.uid);
    if (!entry) return empty;
    const item = entry.item;
    const def = ITEMS[item.id];
    if (!def) return empty;
    const save = this.game.save;
    const eq = save.equipment;

    const stats = [];
    if (def.type === 'ammo') stats.push(`${item.stack} 发`, `伤害 ${def.damage}`, `穿透 ${def.pen}`);
    if (def.type === 'weapon') stats.push(CALIBER_LABELS[def.caliber] || def.caliber, `${item.rounds}/${def.magSize} 发`, def.auto ? '全自动' : '半自动');
    if (def.type === 'armor' || def.type === 'helmet') stats.push(`防护 ${def.cls}`, `耐久 ${Math.ceil(item.dur)}/${def.durability}`);
    if (def.type === 'rig' || def.type === 'backpack') stats.push(`容量 ${def.capacity[0]}×${def.capacity[1]}`);
    stats.push(`${itemWeight(item).toFixed(2)}kg`);
    stats.push(`价值 ₽${formatMoney(Math.round(def.price * (def.type === 'ammo' ? item.stack : 1)))}`);

    const actions = [];
    const attr = `data-gid="${esc(sel.gridId)}" data-uid="${esc(sel.uid)}"`;
    if (def.type === 'weapon') {
      actions.push(`<button class="btn" data-action="detailEquip" data-slot="primary" ${attr}>装备主武器</button>`);
      actions.push(`<button class="btn" data-action="detailEquip" data-slot="secondary" ${attr}>装备副武器</button>`);
    } else if (['helmet', 'armor', 'rig', 'backpack'].includes(def.type)) {
      actions.push(`<button class="btn" data-action="detailEquip" data-slot="${def.type}" ${attr}>装备${SLOT_LABELS[def.type]}</button>`);
    }

    if (grid === save.stash) {
      if (getBagGrid(eq)) actions.push(`<button class="btn" data-action="detailMove" data-target="bag" ${attr}>放入背包</button>`);
      if (getRigGrid(eq)) actions.push(`<button class="btn" data-action="detailMove" data-target="rig" ${attr}>放入弹挂</button>`);
      actions.push(`<button class="btn" data-action="detailMove" data-target="secure" ${attr}>放入保险箱</button>`);
      actions.push(`<button class="btn" data-action="detailSell" ${attr}>出售 ₽${formatMoney(sellValue(item))}</button>`);
    } else {
      actions.push(`<button class="btn" data-action="detailMove" data-target="stash" ${attr}>移回仓库</button>`);
    }
    actions.push(`<button class="btn btn-ghost" data-action="detailClose">关闭</button>`);

    return `<div class="detail-body">
      <div class="detail-info">
        <div class="detail-name r${def.rarity}">${esc(def.name)}<span class="detail-rar">${RARITY_NAMES[def.rarity] || ''}</span></div>
        <div class="detail-stats">${stats.map((x) => esc(x)).join(' · ')}</div>
        <div class="detail-desc">${esc(def.desc || '')}</div>
      </div>
      <div class="detail-actions">${actions.join('')}</div>
    </div>`;
  }

  stashCard(item) {
    const def = ITEMS[item.id];
    const rarity = def.rarity;
    const sell = sellValue(item);
    let sub = [];
    sub.push(TYPE_LABELS[def.type] || '物品');
    if (def.type === 'ammo') sub.push(`×${item.stack}`);
    sub.push(`${itemWeight(item).toFixed(2)}kg`);
    if (def.type === 'armor' || def.type === 'helmet') sub.push(`耐久 ${Math.ceil(item.dur)}/${def.durability}`);
    if (def.type === 'weapon') sub.push(`${CALIBER_LABELS[def.caliber] || def.caliber} · ${item.rounds}/${def.magSize}`);
    if (def.type === 'backpack' || def.type === 'rig') sub.push(`${def.capacity[0]}×${def.capacity[1]}`);

    let actions = '';
    if (def.type === 'weapon') {
      actions = `
        <button class="btn" data-action="equip" data-slot="primary" data-uid="${item.uid}">主武器</button>
        <button class="btn" data-action="equip" data-slot="secondary" data-uid="${item.uid}">副武器</button>`;
    } else if (def.type === 'armor' || def.type === 'helmet' || def.type === 'rig' || def.type === 'backpack') {
      actions = `<button class="btn" data-action="equip" data-slot="${def.type}" data-uid="${item.uid}">装备</button>`;
    } else if (def.type === 'ammo' || def.type === 'med') {
      actions = `<button class="btn" data-action="supply" data-uid="${item.uid}">补给</button>`;
    }
    actions += `<button class="btn" data-action="sell" data-uid="${item.uid}">售 ₽${formatMoney(sell)}</button>`;

    return `
      <div class="item-card r${rarity}">
        <div class="item-card-top">
          <div class="item-icon">${esc(def.abbr)}</div>
          <div class="item-name-row">
            <span class="iname">${esc(def.name)}${def.stack > 1 && item.stack > 1 ? ` ×${item.stack}` : ''}</span>
            <div class="isub">${sub.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="item-card-actions">${actions}</div>
      </div>`;
  }

  // ═══════════════ 商人 ═══════════════

  refreshTrader() {
    const save = this.game.save;
    const sellEntries = [...save.stash.items].sort((a, b) => ITEMS[b.item.id].price - ITEMS[a.item.id].price);
    const sellHtml = sellEntries.length
      ? sellEntries.map((e) => {
        const def = ITEMS[e.item.id];
        return `
          <div class="item-card r${def.rarity}">
            <div class="item-card-top">
              <div class="item-icon">${esc(def.abbr)}</div>
              <div class="item-name-row">
                <span class="iname">${esc(def.name)}${def.stack > 1 && e.item.stack > 1 ? ` ×${e.item.stack}` : ''}</span>
                <div class="isub"><span>${TYPE_LABELS[def.type]}</span><span class="sell-value">₽ ${formatMoney(sellValue(e.item))}</span></div>
              </div>
            </div>
            <div class="item-card-actions">
              <button class="btn" data-action="sell" data-uid="${e.item.uid}">出售 · ₽${formatMoney(sellValue(e.item))}</button>
            </div>
          </div>`;
      }).join('')
      : '<div class="stash-empty">仓库里没有可以出售的物品。</div>';

    const tabs = TRADER_CATALOG.map((c) => `
      <span class="filter-chip ${this.traderTab === c.id ? 'on' : ''}" data-action="traderTab" data-tab="${c.id}">${c.name}</span>
    `).join('');

    const cat = TRADER_CATALOG.find((c) => c.id === this.traderTab) || TRADER_CATALOG[0];
    const buyHtml = cat.entries.map((entry) => {
      const def = ITEMS[entry.id];
      const price = buyPrice(entry.id, entry.qty);
      const subParts = [TYPE_LABELS[def.type]];
      if (def.type === 'ammo') subParts.push(`${entry.qty} 发`);
      if (def.type === 'armor' || def.type === 'helmet') subParts.push(`防护 ${def.cls} 级`);
      if (def.type === 'weapon') subParts.push(`${CALIBER_LABELS[def.caliber] || def.caliber}`);
      if (def.type === 'rig' || def.type === 'backpack') subParts.push(`${def.capacity[0]}×${def.capacity[1]}`);
      return `
        <div class="item-card r${def.rarity}">
          <div class="item-card-top">
            <div class="item-icon">${esc(def.abbr)}</div>
            <div class="item-name-row">
              <span class="iname">${esc(def.name)}${def.type === 'ammo' ? ` ×${entry.qty}` : ''}</span>
              <div class="isub">${subParts.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
            </div>
          </div>
          <div class="item-card-actions">
            <button class="btn" data-action="buy" data-id="${entry.id}" data-qty="${entry.qty}" ${save.money < price ? 'disabled' : ''}>
              购买 · ₽${formatMoney(price)}
            </button>
          </div>
        </div>`;
    }).join('');

    this.refs.trader.innerHTML = `
      <div class="page">
        <header class="page-head">
          <div class="page-title">
            <h2>商人</h2>
            <p>${TRADER_NAME} · "活下来的人才有资格谈价格。"</p>
          </div>
          <div class="page-head-right">
            <div class="money">${formatMoney(save.money)}</div>
            <button class="btn btn-sm" data-action="prepBack">返回基地</button>
            <button class="btn btn-sm" data-action="menu">主菜单</button>
          </div>
        </header>
        <div class="trader-grid">
          <section class="panel">
            <h3>出售仓库物品</h3>
            <div class="stash-list">${sellHtml}</div>
            <div class="trader-note">出售价格为估价的 <b>55%</b>。弹药按发计价。</div>
          </section>
          <section class="panel">
            <div class="panel-head"><h3>购买 · 渡鸦的货架</h3></div>
            <div class="trader-tabs">${tabs}</div>
            <div class="stash-list">${buyHtml}</div>
            <div class="trader-note">黑市无限库存。武器不含弹药，请另行购买。购买物资将直接进入仓库。</div>
          </section>
        </div>
      </div>
    `;
  }

  // ═══════════════ 结算 ═══════════════

  showResult(data) {
    const { success, reason, mapName, kills, time, gained, lost } = data;
    const title = success ? '撤离成功' : (reason === 'missing' ? '任务超时 · 失联' : '行动失败');
    const sub = success
      ? '你带着战利品离开了灰区。装备与保险箱物品已保留。'
      : '你在灰区中倒下了。随身装备全部遗失，只有保险箱内的物品被带回。';

    const valueOf = (list) => list.reduce((sum, e) => {
      const def = ITEMS[e.id];
      if (!def) return sum;
      return sum + def.price * (def.type === 'ammo' ? (e.stack || 1) : 1);
    }, 0);

    const chips = (list) => {
      if (!list || !list.length) return '<div class="loot-empty">没有物品</div>';
      return list.map((e) => {
        const def = ITEMS[e.id];
        if (!def) return '';
        return `<span class="loot-chip r${def.rarity}"><b>${esc(def.name)}</b>${def.type === 'ammo' && e.stack > 1 ? ' ×' + e.stack : ''}</span>`;
      }).join('');
    };

    const lostSection = !success && lost && lost.length
      ? `<div class="result-loot" style="margin-top:0">
           <h3>遗失的装备</h3>
           <div class="loot-chips">${chips(lost)}</div>
         </div>`
      : '';

    this.refs.result.innerHTML = `
      <div class="result-wrap">
        <div class="result-banner ${success ? 'success' : 'fail'}">
          <h2>${title}</h2>
          <p>${sub}</p>
        </div>
        <div class="result-stats">
          <div class="result-stat"><span>行动区域</span><b style="font-size:15px">${esc(mapName)}</b></div>
          <div class="result-stat"><span>击杀</span><b>${kills}</b></div>
          <div class="result-stat"><span>${success ? '带出物资价值' : '保险箱保留价值'}</span><b>₽${formatMoney(valueOf(gained))}</b></div>
          <div class="result-stat"><span>行动时长</span><b>${formatTime(time)}</b></div>
        </div>
        <div class="result-loot">
          <h3>${success ? '带出物资' : '保险箱保留'}</h3>
          <div class="loot-chips">${chips(gained)}</div>
        </div>
        ${lostSection}
        <div class="result-actions">
          <button class="btn btn-primary" data-action="toPrep">返回基地</button>
          <button class="btn" data-action="toMenu">主菜单</button>
        </div>
      </div>
    `;
  }

  // ═══════════════ HUD ═══════════════

  setRaidInfo(map) {
    this.refs.mapLabel.textContent = `${map.name} · ${map.en}`;
    this.refs.compassMarks.innerHTML = '';
    this._marks = [];
    this.game.world.extracts.forEach((e, i) => {
      const el = document.createElement('div');
      el.className = 'extract-mark';
      el.innerHTML = `<span class="em-icon">${String.fromCharCode(65 + i)}</span><span class="em-dist">0m</span>`;
      this.refs.compassMarks.appendChild(el);
      this._marks.push({ el, distEl: el.querySelector('.em-dist'), extract: e });
    });
    const timer = this.game.map.timer;
    this.refs.raidTimer.textContent = formatTime(timer);
  }

  buildCompass() {
    const px = 2.6;
    this.compassPx = px;
    const ticks = this.refs.compassTicks;
    ticks.innerHTML = '';
    const cardinals = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' };
    for (let deg = -360; deg <= 720; deg += 5) {
      const tick = document.createElement('i');
      const major = ((deg % 45) + 45) % 45 === 0;
      tick.className = 'compass-tick' + (major ? ' major' : '');
      tick.style.left = `calc(50% + ${deg * px}px)`;
      ticks.appendChild(tick);
      if (major) {
        const norm = ((deg % 360) + 360) % 360;
        const label = document.createElement('span');
        label.className = 'compass-label' + (cardinals[norm] ? ' cardinal' : '');
        label.style.left = `calc(50% + ${deg * px}px)`;
        label.textContent = cardinals[norm] || String(norm).padStart(3, '0');
        ticks.appendChild(label);
      }
    }
  }

  updateHUD(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;

    // 计时
    const timeText = formatTime(g.raidTimeLeft);
    if (this._cache.timer !== timeText) {
      this._cache.timer = timeText;
      this.refs.raidTimer.textContent = timeText;
    }
    this.refs.raidTimer.classList.toggle('low', g.raidTimeLeft < 180);

    // 武器 / 弹药
    const def = p.weaponDef;
    const item = p.weapon;
    this.reserveTimer -= dt;
    if (this.reserveTimer <= 0) {
      this.reserveTimer = 0.2;
      this.lastReserve = p.reserveAmmo;
    }
    const ammoCur = item ? item.rounds : 0;
    const name = def ? def.name : '徒手';
    if (this._cache.ammo !== ammoCur) {
      this._cache.ammo = ammoCur;
      this.refs.ammoCount.textContent = String(ammoCur);
    }
    if (this._cache.reserve !== this.lastReserve) {
      this._cache.reserve = this.lastReserve;
      this.refs.ammoReserve.textContent = String(this.lastReserve);
    }
    if (this._cache.weaponName !== name) {
      this._cache.weaponName = name;
      this.refs.weaponName.textContent = name;
    }
    const mode = def ? (def.auto ? '全自动' : '半自动') : '—';
    if (this._cache.mode !== mode) {
      this._cache.mode = mode;
      this.refs.fireMode.textContent = mode;
    }
    const reloadText = p.reloading ? '换弹中…' : '';
    if (this._cache.reload !== reloadText) {
      this._cache.reload = reloadText;
      this.refs.reloadHint.textContent = reloadText;
    }
    this.refs.ammoCount.parentElement.classList.toggle('empty', !!def && ammoCur === 0);

    // 身体部位
    for (const part of Object.keys(this.refs.bodyParts)) {
      const hp = p.parts[part];
      const max = p.maxParts[part];
      const ratio = hp / max;
      let cls = 'p-ok';
      if (hp <= 0) cls = 'p-black';
      else if (ratio < 0.34) cls = 'p-bad';
      else if (ratio < 0.67) cls = 'p-hurt';
      const el = this.refs.bodyParts[part];
      if (el.dataset.cls !== cls) {
        el.dataset.cls = cls;
        el.className = 'part ' + cls;
      }
      el.title = `${part} ${Math.ceil(hp)}/${max}`;
    }

    // 体力 / 流血
    this.refs.staminaFill.style.transform = `scaleX(${clamp(p.stamina / p.staminaMax, 0, 1)})`;
    this.refs.bleedIndicator.classList.toggle('hidden', !p.bleeding);

    // 负重
    const wText = `${p.weight.toFixed(1)} / 22 kg`;
    if (this._cache.weight !== wText) {
      this._cache.weight = wText;
      this.refs.weightText.textContent = wText;
      this.refs.weightText.parentElement.classList.toggle('high', p.weight > 22);
    }

    // 快捷栏
    const meds = p.getMedCounts();
    const sig = `${meds.kit}|${meds.bandage}`;
    if (this._cache.quick !== sig) {
      this._cache.quick = sig;
      this.refs.quickSlots.innerHTML = `
        <div class="qslot ${meds.kit > 0 ? '' : 'empty'}"><b>3</b>医疗包 <span class="qcount">×${meds.kit}</span></div>
        <div class="qslot ${meds.bandage > 0 ? '' : 'empty'}"><b>4</b>绷带 <span class="qcount">×${meds.bandage}</span></div>
        <div class="qslot"><b>F</b>交互</div>
      `;
    }

    // 准星
    const spread = p.currentSpreadDeg || 1;
    const gap = clamp(6 + spread * 5, 7, 34);
    this.refs.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
    const hideCross = p.scoped || !p.alive;
    if (this._cache.hideCross !== hideCross) {
      this._cache.hideCross = hideCross;
      this.refs.crosshair.classList.toggle('hidden-cross', hideCross);
    }

    // 罗盘
    const bearing = ((-p.yaw * 180) / Math.PI % 360 + 360) % 360;
    this.refs.compassTicks.style.transform = `translateX(${(-bearing * this.compassPx).toFixed(1)}px)`;
    const headingText = String(Math.round(bearing) % 360).padStart(3, '0') + '°';
    if (this._cache.heading !== headingText) {
      this._cache.heading = headingText;
      this.refs.compassHeading.textContent = headingText;
    }
    for (const m of this._marks) {
      const e = m.extract;
      const dx = e.x - p.pos.x, dz = e.z - p.pos.z;
      const b = bearingDeg(dx, dz);
      let rel = ((b - bearing + 540) % 360) - 180;
      const edge = Math.abs(rel) > 80;
      rel = clamp(rel, -80, 80);
      m.el.style.left = `calc(50% + ${(rel * this.compassPx).toFixed(1)}px)`;
      m.el.classList.toggle('edge', edge);
      const d = Math.round(dist(p.pos.x, p.pos.z, e.x, e.z));
      const txt = `${d}m`;
      if (m.distEl.textContent !== txt) m.distEl.textContent = txt;
    }

    // 最近的撤离点提示
    let nearest = null, nearestD = Infinity;
    for (const e of g.world.extracts) {
      const d = dist(p.pos.x, p.pos.z, e.x, e.z);
      if (d < nearestD) { nearestD = d; nearest = e; }
    }
    if (nearest) {
      const inside = g.world.isInsideExtract(p.pos.x, p.pos.z);
      const hint = inside ? '<b>已进入撤离区域</b>' : `最近撤离点 · <b>${nearest.name}</b> ${Math.round(nearestD)}m`;
      if (this._cache.extractHint !== hint) {
        this._cache.extractHint = hint;
        this.refs.extractHint.innerHTML = hint;
      }
    }

    // 低血量晕影
    const vig = (p.totalHealth < 0.5 || p.bleeding) ? 0.85 : 0.55;
    const vigStr = vig.toFixed(2);
    if (this._cache.vig !== vigStr) {
      this._cache.vig = vigStr;
      this.refs.vignette.style.opacity = vigStr;
    }
  }

  setPrompt(text) {
    if (this._cache.prompt === text) return;
    this._cache.prompt = text;
    if (!text) {
      this.refs.prompt.classList.add('hidden');
      return;
    }
    this.refs.prompt.innerHTML = `<b>F</b> ${text}`;
    this.refs.prompt.classList.remove('hidden');
  }

  setExtractProgress(progress, label = '撤离中') {
    if (progress == null) {
      this.refs.extractBar.classList.add('hidden');
      this._cache.extP = null;
      return;
    }
    this.refs.extractBar.classList.remove('hidden');
    this.refs.extractFill.style.transform = `scaleX(${clamp(progress, 0, 1).toFixed(3)})`;
    const txt = `${label} ${Math.round(progress * 100)}%`;
    if (this._cache.extText !== txt) {
      this._cache.extText = txt;
      this.refs.extractText.textContent = txt;
    }
  }

  setMedProgress(progress, kind = 'kit') {
    if (progress == null) {
      this.refs.medBar.classList.add('hidden');
      this._cache.medP = null;
      return;
    }
    this.refs.medBar.classList.remove('hidden');
    this.refs.medFill.style.transform = `scaleX(${clamp(progress, 0, 1).toFixed(3)})`;
    const txt = kind === 'kit' ? '使用医疗包' : '包扎伤口';
    if (this._cache.medText !== txt) {
      this._cache.medText = txt;
      this.refs.medText.textContent = txt;
    }
  }

  setScope(on) {
    if (this._lastScope === on) return;
    this._lastScope = on;
    this.refs.scope.classList.toggle('hidden', !on);
  }

  hitmarker(head = false, kill = false) {
    const el = this.refs.hitmarker;
    el.className = 'hitmarker';
    void el.offsetWidth;
    el.classList.add('show');
    if (kill) el.classList.add('kill');
    if (head) el.classList.add('head');
    clearTimeout(this._hitTimeout);
    this._hitTimeout = setTimeout(() => {
      el.className = 'hitmarker';
    }, 300);
  }

  damageFlash(severity = 0.5, part = '') {
    const el = this.refs.damageFlash;
    el.classList.add('hit');
    el.style.opacity = String(clamp(severity, 0.2, 0.9));
    clearTimeout(this._dmgTimeout);
    this._dmgTimeout = setTimeout(() => {
      el.classList.remove('hit');
      el.style.opacity = '';
    }, 90);
    // 小屏震动的文字反馈
    if (part === 'head' && severity > 0.5) {
      this.log('你被击中头部！', 'bad');
    }
  }

  log(msg, cls = '') {
    const line = document.createElement('div');
    line.className = 'log-line ' + cls;
    line.textContent = msg;
    this.refs.log.appendChild(line);
    while (this.refs.log.children.length > 5) this.refs.log.removeChild(this.refs.log.firstChild);
    setTimeout(() => {
      line.classList.add('fade');
      setTimeout(() => line.remove(), 800);
    }, 4800);
  }

  toast(msg, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    this.refs.toastWrap.appendChild(el);
    while (this.refs.toastWrap.children.length > 3) this.refs.toastWrap.removeChild(this.refs.toastWrap.firstChild);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(() => el.remove(), 450);
    }, 2600);
  }

  onEnemyAlert(enemy) {
    if (!enemy || !enemy.def) return;
    const now = performance.now();
    if (enemy._uiAlert && now - enemy._uiAlert < 5000) return;
    enemy._uiAlert = now;
    this.log(`${enemy.def.name} 发现了你！`, 'bad');
  }

  onEnemyShoot() { /* 受击反馈由 damageFlash 统一处理 */ }

  // ═══════════════ 拖拽搜刮界面 ═══════════════

  buildGrid(grid, cell = 36) {
    if (!grid) return '';
    this.gridMap.set(grid.id, grid);
    let itemsHtml = '';
    for (const e of grid.items) {
      const def = ITEMS[e.item.id];
      if (!def) continue;
      const left = e.x * cell + 2;
      const top = e.y * cell + 2;
      const width = def.w * cell - 4;
      const height = def.h * cell - 4;
      const showName = def.w * cell >= 76;
      const stack = def.stack > 1 && e.item.stack > 1 ? `<span class="gi-stack">${e.item.stack}</span>` : '';
      let dur = '';
      if (e.item.dur != null && (def.type === 'armor' || def.type === 'helmet')) {
        const pct = clamp(e.item.dur / def.durability, 0, 1) * 100;
        dur = `<div class="gi-dur" style="width:${pct.toFixed(0)}%"></div>`;
      }
      const title = this.itemTooltip(e.item);
      itemsHtml += `
        <div class="gitem r${def.rarity}" draggable="true" data-uid="${e.item.uid}" data-gid="${grid.id}"
             style="left:${left}px;top:${top}px;width:${width}px;height:${height}px" title="${esc(title)}">
          <span class="gi-abbr">${esc(def.abbr)}</span>
          ${showName ? `<span class="gi-name">${esc(def.name)}</span>` : ''}
          ${stack}${dur}
        </div>`;
    }
    const empty = grid.items.length ? '' : '<div class="grid-empty-note">空</div>';
    return `<div class="inv-grid" data-grid-id="${grid.id}" data-cell="${cell}"
      style="--cols:${grid.cols};--rows:${grid.rows};--cell:${cell}px">${itemsHtml}${empty}</div>`;
  }

  itemTooltip(item) {
    const def = ITEMS[item.id];
    if (!def) return '';
    const lines = [def.name + '（' + (RARITY_NAMES[def.rarity] || '') + '）'];
    if (def.type === 'ammo') lines.push(`数量 ${item.stack} 发 · 伤害 ${def.damage} · 穿透 ${def.pen}`);
    if (def.type === 'weapon') lines.push(`${CALIBER_LABELS[def.caliber] || def.caliber} · 弹匣 ${item.rounds}/${def.magSize} · ${def.auto ? '全自动' : '半自动'}`);
    if (def.type === 'armor' || def.type === 'helmet') lines.push(`防护等级 ${def.cls} · 耐久 ${Math.ceil(item.dur)}/${def.durability}`);
    if (def.type === 'backpack' || def.type === 'rig') lines.push(`容量 ${def.capacity[0]}×${def.capacity[1]}`);
    lines.push(`重量 ${itemWeight(item).toFixed(2)}kg · 价值 ₽${Math.round(def.price * (def.type === 'ammo' ? item.stack : 1))}`);
    if (def.desc) lines.push(def.desc);
    return lines.join('\n');
  }

  buildEquipSlotsHTML(allowUnequip = false) {
    const eq = this.game.save.equipment;
    return `<div class="equip-drop-grid">${EQUIP_SLOTS.map((slot) => {
      const item = eq[slot];
      const def = item ? ITEMS[item.id] : null;
      let sub = '';
      if (def) {
        if (def.type === 'weapon') sub = `${item.rounds}/${def.magSize} 发 · ${CALIBER_LABELS[def.caliber] || def.caliber}`;
        else if (def.type === 'armor' || def.type === 'helmet') sub = `防护 ${def.cls} · 耐久 ${Math.ceil(item.dur)}/${def.durability}`;
        else if (def.type === 'rig' || def.type === 'backpack') sub = `${def.capacity[0]}×${def.capacity[1]} · ${item.contents ? item.contents.items.length : 0} 件`;
      }
      const accept = EQUIP_TYPE_BY_SLOT[slot];
      return `<div class="equip-drop" data-equip-slot="${slot}" title="拖入${TYPE_LABELS[accept] || '装备'}即可${def ? '替换' : '装备'}">
        <div class="eds-head">
          <span class="eds-label">${SLOT_LABELS[slot]}</span>
          ${allowUnequip && def
            ? `<span class="eds-right"><span class="eds-hint">拖入替换</span><button class="eds-x" data-action="unequip" data-slot="${slot}" title="卸下到仓库">卸下</button></span>`
            : `<span class="eds-hint">${def ? '拖入替换' : '拖入装备'}</span>`}
        </div>
        <div class="eds-name" style="color:${def ? `var(--r${def.rarity})` : 'var(--faint)'}">${def ? esc(def.name) : '—'}</div>
        ${sub ? `<div class="eds-sub">${sub}</div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  /** 将网格中的物品装备到槽位；替换下来的装备尝试放回来源容器/背包/弹挂/保险箱 */
  equipFromGrid(slot, fromGrid, itemUid) {
    const save = this.game.save;
    const eq = save.equipment;
    if (!EQUIP_TYPE_BY_SLOT[slot]) return;
    const entry = fromGrid.find(itemUid);
    if (!entry) return;
    const item = entry.item;
    const def = ITEMS[item.id];
    if (!def || EQUIP_TYPE_BY_SLOT[slot] !== def.type) {
      this.toast('该物品无法装备到该槽位', 'bad');
      return;
    }
    const prev = eq[slot] || null;
    const fromX = entry.x;
    const fromY = entry.y;
    fromGrid.remove(item.uid);
    let placed = true;
    if (prev) {
      placed = false;
      // 不能把换下来的背包/弹挂塞进它自己的容器里
      const prevContents = prev.contents || null;
      const dests = [fromGrid, getBagGrid(eq), getRigGrid(eq), save.secure].filter((g) => g && g !== prevContents);
      const seen = new Set();
      for (const g of dests) {
        if (seen.has(g)) continue;
        seen.add(g);
        if (g.canAccept(prev)) {
          g.addAuto(prev);
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      if (fromGrid.canPlace(item, fromX, fromY)) fromGrid.place(item, fromX, fromY);
      else fromGrid.addAuto(item);
      this.toast('没有空间放下替换下来的装备', 'bad');
      return;
    }
    eq[slot] = item;

    const inRaid = this.game.state === 'raid';
    if (inRaid) this.updatePlayerAfterEquip(slot, item);
    else this.game.saveGame();
    this.game.audio.pickup();
    this.toast(`已装备 ${def.name}`, 'good');

    if (inRaid) {
      this.afterInventoryChange();
    } else {
      this.selectedItem = null;
      this.refreshPrep();
    }
  }

  updatePlayerAfterEquip(slot, item) {
    const p = this.game.player;
    if (!p) return;
    if (slot === 'primary' || slot === 'secondary') {
      if (!p.activeSlot) p.activeSlot = slot;
      if (p.activeSlot === slot) {
        p.weapon = item;
        p.weaponDef = ITEMS[item.id];
        p.reloading = false;
        p.medUse = null;
        p.adsT = 0;
        p.switchTimer = 0.35;
        p.buildViewmodel();
        this.setMedProgress(null);
      }
    }
    p.updateWeight();
    p.weightTimer = 0.4;
  }

  showLoot(container) {
    this.lootContainer = container;
    container.open();
    this.refreshLoot();
    this.refs.loot.classList.remove('hidden');
  }

  refreshLoot() {
    const c = this.lootContainer;
    if (!c) return;
    this.gridMap = new Map();
    const save = this.game.save;
    const bag = getBagGrid(save.equipment);
    const rig = getRigGrid(save.equipment);
    const weight = carriedWeight(save.equipment, save.secure);
    const bagHtml = bag
      ? `<div class="grid-scroll">${this.buildGrid(bag, 36)}</div>`
      : '<div class="loot-empty" style="color:var(--faint);font-size:12px">未装备背包。只能把物品放进弹挂或保险箱。</div>';
    const rigHtml = rig
      ? `<div class="grid-scroll">${this.buildGrid(rig, 36)}</div>`
      : '<div class="loot-empty" style="color:var(--faint);font-size:12px">未装备弹挂。</div>';
    const secureHtml = `<div class="grid-scroll">${this.buildGrid(save.secure, 36)}</div>`;
    const srcHtml = `<div class="grid-scroll">${this.buildGrid(c.grid, 38)}</div>`;
    const lootMeta = `${c.grid.items.length} 件物品 · 估值 ₽${formatMoney(c.grid.value())}`;
    const equipHtml = this.buildEquipSlotsHTML();

    this.refs.loot.innerHTML = `
      <div class="loot-frame">
        <header>
          <h3>${esc(c.name)}</h3>
          <span class="loot-hint">拖拽物品 · 双击快速拿取 · 拖到右侧槽位直接装备 · [Tab] 关闭</span>
        </header>
        <div class="loot-body three-col">
          <div class="loot-col">
            <div class="loot-col-title"><span>容器 — ${esc(c.def?.name || c.name)}</span><span class="cap">${c.grid.cols}×${c.grid.rows}</span></div>
            ${srcHtml}
            <div class="loot-meta">${lootMeta}</div>
            <div class="loot-meta" style="margin-top:-6px">双击物品可快速放入背包或弹挂；贵重品建议转移至保险箱。</div>
          </div>
          <div class="loot-col">
            <div class="loot-col-title"><span>你的背包</span><span class="cap">${bag ? bag.items.length + ' 件' : '无'}</span></div>
            ${bagHtml}
            <div class="loot-col-title" style="margin-top:4px"><span>弹挂</span><span class="cap">${rig ? rig.items.length + ' 件' : '无'}</span></div>
            ${rigHtml}
            <div class="loot-col-title" style="margin-top:4px"><span>保险箱（阵亡后保留）</span><span class="cap">${this.game.save.secure.cols}×${this.game.save.secure.rows}</span></div>
            ${secureHtml}
          </div>
          <div class="loot-col">
            <div class="loot-col-title"><span>装备槽</span><span class="cap">拖拽替换</span></div>
            ${equipHtml}
            <div class="loot-meta">把武器、护甲、头盔、弹挂或背包拖到对应槽位即可直接装备。被替换下来的装备会自动放进原容器、背包、弹挂或保险箱。</div>
          </div>
        </div>
        <footer>
          <button class="btn btn-sm" data-action="lootAll">全部拿取</button>
          <span class="spacer"></span>
          <span class="weight-note">当前负重 ${weight.toFixed(1)} / 22 kg</span>
          <button class="btn btn-sm" data-action="closeLoot">关闭 [Tab]</button>
        </footer>
      </div>
    `;
  }

  showInventory() {
    this.lootContainer = null;
    this.refreshInventory();
    this.refs.inventory.classList.remove('hidden');
  }

  refreshInventory() {
    const save = this.game.save;
    const bag = getBagGrid(save.equipment);
    const rig = getRigGrid(save.equipment);
    const weight = carriedWeight(save.equipment, save.secure);
    this.gridMap = new Map();
    const bagHtml = bag
      ? `<div class="grid-scroll">${this.buildGrid(bag, 36)}</div>`
      : '<div class="loot-empty" style="color:var(--faint);font-size:12px">未装备背包。</div>';
    const rigHtml = rig
      ? `<div class="grid-scroll">${this.buildGrid(rig, 36)}</div>`
      : '<div class="loot-empty" style="color:var(--faint);font-size:12px">未装备弹挂。</div>';
    const secureHtml = `<div class="grid-scroll">${this.buildGrid(save.secure, 36)}</div>`;
    const equipHtml = this.buildEquipSlotsHTML();

    this.refs.inventory.innerHTML = `
      <div class="loot-frame">
        <header>
          <h3>战术装备</h3>
          <span class="loot-hint">拖拽装备到槽位替换 · 双击装备快速穿戴 · 行动不会暂停 · [Tab] 关闭</span>
        </header>
        <div class="loot-body">
          <div class="loot-col">
            <div class="loot-col-title"><span>背包</span><span class="cap">${bag ? bag.items.length + ' 件' : '无'}</span></div>
            ${bagHtml}
            <div class="loot-col-title" style="margin-top:4px"><span>弹挂</span><span class="cap">${rig ? rig.items.length + ' 件' : '无'}</span></div>
            ${rigHtml}
            <div class="loot-col-title" style="margin-top:4px"><span>保险箱</span><span class="cap">${save.secure.items.length} 件</span></div>
            ${secureHtml}
          </div>
          <div class="loot-col">
            <div class="loot-col-title"><span>装备槽</span><span class="cap">拖拽替换</span></div>
            ${equipHtml}
            <div class="loot-meta">双击装备类物品可快速穿戴；替换下来的装备会放进原容器或背包。</div>
            <div class="loot-col-title" style="margin-top:10px"><span>战场提示</span></div>
            <div style="font-size:12px;color:var(--faint);line-height:2">
              打开背包时敌人仍在行动，注意周围枪声。<br>
              贵重物品建议放入保险箱，死亡后仍会保留。<br>
              医疗包 [3] · 绷带 [4] · 弹药在弹挂、背包与保险箱中自动装填。
            </div>
          </div>
        </div>
        <footer>
          <span class="spacer"></span>
          <span class="weight-note">当前负重 ${weight.toFixed(1)} / 22 kg</span>
          <button class="btn btn-sm" data-action="closeInventory">关闭 [Tab]</button>
        </footer>
      </div>
    `;
  }

  // ═══════════════ 基地仓库快速操作 ═══════════════

  prepQuickMove(gridId, uid) {
    const grid = this.gridMap.get(gridId);
    if (!grid) return;
    const entry = grid.find(uid);
    if (!entry) return;
    const save = this.game.save;
    const eq = save.equipment;
    const def = ITEMS[entry.item.id];
    if (def && ['weapon', 'helmet', 'armor', 'rig', 'backpack'].includes(def.type)) {
      let slot = def.type;
      if (def.type === 'weapon') {
        slot = !eq.primary ? 'primary' : (!eq.secondary ? 'secondary' : 'primary');
      }
      this.equipFromGrid(slot, grid, uid);
      return;
    }
    const targets = grid === save.stash
      ? [getRigGrid(eq), getBagGrid(eq), save.secure].filter(Boolean)
      : [save.stash];
    if (!autoTransfer(grid, uid, targets)) {
      this.toast('目标容器空间不足', 'bad');
      return;
    }
    this.game.audio.pickup();
    this.game.saveGame();
    this.selectedItem = null;
    this.refreshPrep();
  }

  raidQuickMove(gridId, uid) {
    const grid = this.gridMap.get(gridId);
    if (!grid) return;
    const save = this.game.save;
    const eq = save.equipment;
    const entry = grid.find(uid);
    if (!entry) return;
    const def = ITEMS[entry.item.id];
    // 双击装备类物品：快速穿戴/替换
    if (def && ['weapon', 'helmet', 'armor', 'rig', 'backpack'].includes(def.type)) {
      let slot = def.type;
      if (def.type === 'weapon') {
        slot = !eq.primary ? 'primary' : (!eq.secondary ? 'secondary' : 'primary');
      }
      this.equipFromGrid(slot, grid, uid);
      return;
    }
    const targets = grid === save.secure
      ? [getRigGrid(eq), getBagGrid(eq)].filter(Boolean)
      : [save.secure];
    if (!autoTransfer(grid, uid, targets)) {
      this.toast(grid === save.secure ? '背包与弹挂放不下了' : '保险箱空间不足', 'bad');
      return;
    }
    this.game.audio.pickup();
    this.refreshInventory();
  }

  hideOverlays() {
    this.refs.loot.classList.add('hidden');
    this.refs.inventory.classList.add('hidden');
    this.lootContainer = null;
    this._cache.prompt = undefined;
    this.setPrompt(null);
  }

  afterInventoryChange() {
    if (this.lootContainer) {
      this.refreshLoot();
      return;
    }
    if (this.game.state !== 'raid' && this.isScreenVisible('prep')) {
      this.game.saveGame();
      this.selectedItem = null;
      this.refreshPrep();
      return;
    }
    if (!this.refs.inventory.classList.contains('hidden')) this.refreshInventory();
  }

  quickLootItem(gridId, uid) {
    const c = this.lootContainer;
    if (!c) return;
    if (gridId !== c.grid.id) return;
    const save = this.game.save;
    const targets = [getBagGrid(save.equipment), getRigGrid(save.equipment), save.secure].filter(Boolean);
    const ok = autoTransfer(c.grid, uid, targets);
    if (ok) {
      this.game.audio.pickup();
      this.refreshLoot();
    } else {
      this.toast('背包、弹挂与保险箱都放不下了', 'bad');
    }
  }

  lootAll() {
    const c = this.lootContainer;
    if (!c) return;
    const save = this.game.save;
    const targets = [getBagGrid(save.equipment), getRigGrid(save.equipment), save.secure].filter(Boolean);
    const entries = [...c.grid.items];
    let moved = 0;
    for (const e of entries) {
      if (!c.grid.find(e.item.uid)) continue;
      const ok = autoTransfer(c.grid, e.item.uid, targets);
      if (ok) moved++;
    }
    if (moved > 0) {
      this.game.audio.pickup();
      this.log(`拿取了 ${moved} 件物品`, '');
    } else {
      this.toast('没有空间拿取物品', 'bad');
    }
    this.refreshLoot();
  }

  // ═══════════════ 帮助 / 暂停 ═══════════════

  renderHelp() {
    this.refs.help.innerHTML = `
      <div class="modal">
        <h2>行动手册</h2>
        <p class="modal-sub">灰区生存法则 —— 活下去，比什么都重要。</p>
        <table class="key-table">
          <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>移动</td></tr>
          <tr><td><kbd>Shift</kbd></td><td>冲刺（消耗体力）</td></tr>
          <tr><td><kbd>Ctrl</kbd> / <kbd>C</kbd></td><td>蹲伏（降低噪音、提升精度）</td></tr>
          <tr><td>鼠标左键</td><td>射击</td></tr>
          <tr><td>鼠标右键</td><td>瞄准（降低散布，狙击枪开镜）</td></tr>
          <tr><td><kbd>R</kbd></td><td>换弹（从弹挂 / 背包 / 保险箱取弹）</td></tr>
          <tr><td><kbd>1</kbd> / <kbd>2</kbd></td><td>切换主武器 / 副武器</td></tr>
          <tr><td><kbd>3</kbd> / <kbd>4</kbd></td><td>使用医疗包 / 绷带</td></tr>
          <tr><td><kbd>F</kbd></td><td>搜索容器、搜刮尸体</td></tr>
          <tr><td><kbd>Tab</kbd></td><td>打开背包 / 关闭搜刮界面</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>暂停 / 释放鼠标</td></tr>
        </table>
        <div class="modal-section-title">核心规则</div>
        <ul>
          <li>搜刮容器获取战利品，在倒计时结束前抵达撤离点并停留 ${MAPS[this.selectedMap].extractTime} 秒完成撤离。</li>
          <li>阵亡会失去全部随身装备、弹挂与背包内容，<b style="color:var(--gold)">保险箱内物品保留</b>。行动超时同样视为失联阵亡。</li>
          <li>弹挂与背包共同提供携带空间；换弹与使用医疗品时会自动从弹挂、背包和保险箱中取用。基地仓库界面可直接查看与拖动仓库、弹挂、背包和保险箱内的物品。</li>
          <li>战局中按 <kbd>Tab</kbd> 打开背包，可把搜刮到的武器、护甲、头盔、弹挂或背包拖到右侧装备槽替换；换下的装备会放进原容器或背包。</li>
          <li>伤害按部位计算：头部与胸部归零即死亡；四肢残废会降低移动、瞄准与换弹速度。</li>
          <li>护甲等级与弹药穿透值决定减伤效果，护甲耐久会随受击下降，耐久归零后失效。</li>
          <li>流血会持续扣血，使用绷带止血；医疗包可以恢复部位生命但无法修复残废部位。</li>
          <li>负重超过 22kg 会降低移动速度与体力恢复；高价值物品往往又小又轻，优先塞进保险箱。</li>
          <li>敌人会听枪声、看视野、搜寻最后目击点。打一枪换一个地方。</li>
        </ul>
        <div class="modal-actions">
          <button class="btn btn-primary" data-action="closeHelp">明白了</button>
        </div>
      </div>
    `;
  }

  renderPause() {
    const sens = this.game.save.settings?.sensitivity || 1;
    this.refs.pause.innerHTML = `
      <div class="modal pause-panel">
        <h2>行动暂停</h2>
        <p class="modal-sub">灰区不会等你，但你可以喘口气。</p>
        <div class="pause-actions">
          <button class="btn btn-primary" data-action="resume">继续行动</button>
          <button class="btn" data-action="pauseHelp">操作说明</button>
          <button class="btn btn-danger" data-action="abandon">放弃行动（视为阵亡）</button>
        </div>
        <div class="pause-settings">
          <label>鼠标灵敏度 <span id="sensVal">${sens.toFixed(2)}</span></label>
          <input type="range" id="sensSlider" min="0.2" max="2.5" step="0.05" value="${sens}">
        </div>
      </div>
    `;
    const slider = this.refs.pause.querySelector('#sensSlider');
    if (slider) {
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        const valEl = this.refs.pause.querySelector('#sensVal');
        if (valEl) valEl.textContent = v.toFixed(2);
        this.game.setSensitivity(v);
      });
    }
  }

  renderAnnouncement() {
    const entries = CHANGELOG.map((entry, idx) => `
      <article class="announce-entry ${idx === 0 ? 'latest' : ''}">
        <div class="announce-entry-head">
          <span class="announce-version">${entry.version}</span>
          <span class="announce-title">${esc(entry.title)}</span>
          <span class="announce-date">${entry.date}</span>
          ${idx === 0 ? '<span class="announce-new">最新</span>' : ''}
        </div>
        <ul>${entry.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      </article>
    `).join('');
    this.refs.announcement.innerHTML = `
      <div class="modal announce-modal">
        <h2>行动简报</h2>
        <p class="modal-sub">灰区行动 · 更新公告 · 从初代到 v1.6</p>
        <div class="announce-list">${entries}</div>
        <div class="modal-actions">
          <button class="btn btn-primary" data-action="closeAnnouncement">关闭公告</button>
        </div>
      </div>
    `;
  }

  showAnnouncement() {
    this.renderAnnouncement();
    this.refs.announcement.classList.remove('hidden');
  }

  hideAnnouncement() {
    this.refs.announcement.classList.add('hidden');
  }

  showHelp() {
    this.refs.help.classList.remove('hidden');
  }

  hideHelp() {
    this.refs.help.classList.add('hidden');
  }

  showPause() {
    this.renderPause();
    this.refs.pause.classList.remove('hidden');
  }

  hidePause() {
    this.refs.pause.classList.add('hidden');
  }

  showClickPrompt() {
    this.refs.click.classList.remove('hidden');
  }

  hideClickPrompt() {
    this.refs.click.classList.add('hidden');
  }
}
