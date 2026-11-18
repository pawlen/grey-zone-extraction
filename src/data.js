// ═══════════════════════════════════════════════════
// 数据层：物品 / 武器 / 弹药 / 敌人 / 地图 / 战利品
// ═══════════════════════════════════════════════════

export const RARITY_NAMES = { 1: '常见', 2: '稀有', 3: '史诗', 4: '传说' };

export const CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'weapon', name: '武器' },
  { id: 'ammo', name: '弹药' },
  { id: 'armor', name: '护甲' },
  { id: 'helmet', name: '头盔' },
  { id: 'rig', name: '弹挂' },
  { id: 'backpack', name: '背包' },
  { id: 'med', name: '医疗' },
  { id: 'valuable', name: '贵重' },
];

export const SLOT_LABELS = {
  primary: '主武器',
  secondary: '副武器',
  helmet: '头盔',
  armor: '护甲',
  rig: '弹挂',
  backpack: '背包',
};

export const ITEMS = {
  // ────────── 武器 ──────────
  w_pm: {
    id: 'w_pm', name: 'P-M 手枪', abbr: 'PM', type: 'weapon', rarity: 1, w: 2, h: 2, weight: 0.9, price: 450,
    cls: 'pistol', caliber: '9x19', rpm: 400, auto: false, magSize: 8, reloadTime: 2.0,
    spread: 1.7, adsSpread: 0.55, recoil: 1.5, range: 90, adsFov: 58,
    desc: '老旧但可靠的马卡洛夫手枪，9×19 口径，适合应急自卫。',
  },
  w_m9: {
    id: 'w_m9', name: 'M9 手枪', abbr: 'M9', type: 'weapon', rarity: 1, w: 2, h: 2, weight: 1.0, price: 1100,
    cls: 'pistol', caliber: '9x19', rpm: 360, auto: false, magSize: 15, reloadTime: 2.1,
    spread: 1.4, adsSpread: 0.42, recoil: 1.4, range: 100, adsFov: 56,
    desc: '制式半自动手枪，15 发弹匣，精度与弹容均衡。',
  },
  w_mp5: {
    id: 'w_mp5', name: 'MP5 冲锋枪', abbr: 'MP5', type: 'weapon', rarity: 2, w: 3, h: 2, weight: 2.4, price: 3400,
    cls: 'smg', caliber: '9x19', rpm: 760, auto: true, magSize: 30, reloadTime: 2.6,
    spread: 2.1, adsSpread: 0.9, recoil: 1.15, range: 130, adsFov: 55,
    desc: '近距离全自动利器，射速高、后坐力小，室内作战首选。',
  },
  w_ak74: {
    id: 'w_ak74', name: 'AK-74 突击步枪', abbr: 'AK', type: 'weapon', rarity: 2, w: 4, h: 2, weight: 3.6, price: 7200,
    cls: 'rifle', caliber: '5.45', rpm: 620, auto: true, magSize: 30, reloadTime: 3.0,
    spread: 2.4, adsSpread: 0.65, recoil: 2.35, range: 240, adsFov: 50,
    desc: '经典型突击步枪，5.45×39 弹药穿透力强，中距离全能。',
  },
  w_m4: {
    id: 'w_m4', name: 'M4A1 卡宾枪', abbr: 'M4', type: 'weapon', rarity: 3, w: 4, h: 2, weight: 3.2, price: 11500,
    cls: 'rifle', caliber: '5.56', rpm: 800, auto: true, magSize: 30, reloadTime: 2.8,
    spread: 2.0, adsSpread: 0.52, recoil: 1.95, range: 260, adsFov: 48,
    desc: '模块化卡宾枪，高射速与出色精度并存，灰区中的硬通货。',
  },
  w_mp153: {
    id: 'w_mp153', name: 'MP-153 霰弹枪', abbr: 'SG', type: 'weapon', rarity: 2, w: 4, h: 2, weight: 3.8, price: 5600,
    cls: 'shotgun', caliber: '12ga', rpm: 100, auto: false, magSize: 6, reloadTime: 3.8,
    spread: 5.2, adsSpread: 3.4, recoil: 4.6, range: 70, adsFov: 58,
    desc: '半自动霰弹枪，近距离一枪定生死。注意弹丸散布。',
  },
  w_mosin: {
    id: 'w_mosin', name: '莫辛-纳甘步枪', abbr: 'MNS', type: 'weapon', rarity: 2, w: 5, h: 2, weight: 4.0, price: 8600,
    cls: 'sniper', caliber: '7.62', rpm: 55, auto: false, magSize: 5, reloadTime: 4.2,
    spread: 0.75, adsSpread: 0.1, recoil: 5.4, range: 320, adsFov: 26,
    desc: '栓动步枪，射速缓慢但单发威力惊人，瞄准镜视野狭窄。',
  },
  w_svd: {
    id: 'w_svd', name: 'SVD 狙击步枪', abbr: 'SVD', type: 'weapon', rarity: 3, w: 5, h: 2, weight: 4.4, price: 16000,
    cls: 'sniper', caliber: '7.62', rpm: 190, auto: false, magSize: 10, reloadTime: 3.6,
    spread: 1.0, adsSpread: 0.14, recoil: 4.1, range: 340, adsFov: 22,
    desc: '半自动狙击步枪，远距离点名利器，抬枪慢、重量大。',
  },
  w_glock: {
    id: 'w_glock', name: 'Glock 17 手枪', abbr: 'G17', type: 'weapon', rarity: 1, w: 2, h: 2, weight: 1.0, price: 1900,
    cls: 'pistol', caliber: '9x19', rpm: 380, auto: false, magSize: 17, reloadTime: 2.0,
    spread: 1.3, adsSpread: 0.38, recoil: 1.25, range: 105, adsFov: 56,
    desc: '轻量聚合物手枪，17 发大弹容，拔枪与瞄准都很快。',
  },
  w_deagle: {
    id: 'w_deagle', name: 'Desert Eagle 手枪', abbr: 'DE', type: 'weapon', rarity: 3, w: 2, h: 2, weight: 1.9, price: 13500,
    cls: 'pistol', caliber: '.50', rpm: 170, auto: false, magSize: 7, reloadTime: 2.6,
    spread: 1.8, adsSpread: 0.5, recoil: 5.2, range: 150, adsFov: 52,
    desc: '发射 .50 AE 的重型手枪，后坐力惊人，但两枪就能放倒轻甲目标。',
  },
  w_uzi: {
    id: 'w_uzi', name: 'Uzi 冲锋枪', abbr: 'UZI', type: 'weapon', rarity: 1, w: 3, h: 2, weight: 2.6, price: 2800,
    cls: 'smg', caliber: '9x19', rpm: 900, auto: true, magSize: 32, reloadTime: 2.4,
    spread: 3.0, adsSpread: 1.35, recoil: 1.55, range: 90, adsFov: 60,
    desc: '廉价高射速冲锋枪，近距离泼水般的火力，精度一般。',
  },
  w_ump: {
    id: 'w_ump', name: 'UMP45 冲锋枪', abbr: 'UMP', type: 'weapon', rarity: 2, w: 3, h: 2, weight: 2.6, price: 6800,
    cls: 'smg', caliber: '.45', rpm: 600, auto: true, magSize: 25, reloadTime: 2.6,
    spread: 2.0, adsSpread: 0.85, recoil: 1.7, range: 120, adsFov: 55,
    desc: '.45 ACP 口径冲锋枪，射速慢但单发伤害高，雨中依旧可靠。',
  },
  w_pp19: {
    id: 'w_pp19', name: 'PP-19-01 野牛', abbr: 'PP19', type: 'weapon', rarity: 3, w: 3, h: 2, weight: 3.0, price: 9200,
    cls: 'smg', caliber: '9x19', rpm: 700, auto: true, magSize: 64, reloadTime: 3.2,
    spread: 2.3, adsSpread: 1.0, recoil: 1.3, range: 125, adsFov: 55,
    desc: '64 发螺旋弹筒的俄制冲锋枪，换弹频繁的室内战斗里优势极大。',
  },
  w_sks: {
    id: 'w_sks', name: 'SKS 半自动步枪', abbr: 'SKS', type: 'weapon', rarity: 2, w: 4, h: 2, weight: 3.8, price: 7600,
    cls: 'rifle', caliber: '7.62', rpm: 240, auto: false, magSize: 10, reloadTime: 3.2,
    spread: 1.3, adsSpread: 0.3, recoil: 3.4, range: 260, adsFov: 45,
    desc: '半自动步枪，单发威力大，适合中距离精确射击。',
  },
  w_saiga: {
    id: 'w_saiga', name: 'Saiga-12 霰弹枪', abbr: 'S12', type: 'weapon', rarity: 3, w: 4, h: 2, weight: 4.2, price: 11800,
    cls: 'shotgun', caliber: '12ga', rpm: 240, auto: false, magSize: 8, reloadTime: 3.4,
    spread: 5.0, adsSpread: 3.2, recoil: 4.2, range: 80, adsFov: 58,
    desc: '弹匣供弹的半自动霰弹枪，比泵动式补火快得多。',
  },

  // ────────── 弹药 ──────────
  a_9x19_std: {
    id: 'a_9x19_std', name: '9×19 标准弹', abbr: '9S', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.011, price: 12,
    caliber: '9x19', damage: 42, pen: 1, stack: 60, pellets: 1,
  },
  a_9x19_ap: {
    id: 'a_9x19_ap', name: '9×19 穿甲弹', abbr: '9A', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.012, price: 48,
    caliber: '9x19', damage: 37, pen: 3, stack: 60, pellets: 1,
  },
  a_545_std: {
    id: 'a_545_std', name: '5.45 标准弹', abbr: '5S', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.011, price: 22,
    caliber: '5.45', damage: 52, pen: 2, stack: 60, pellets: 1,
  },
  a_545_ap: {
    id: 'a_545_ap', name: '5.45 穿甲弹', abbr: '5A', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.012, price: 95,
    caliber: '5.45', damage: 49, pen: 4, stack: 60, pellets: 1,
  },
  a_556_std: {
    id: 'a_556_std', name: '5.56 标准弹', abbr: '6S', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.012, price: 26,
    caliber: '5.56', damage: 56, pen: 2, stack: 60, pellets: 1,
  },
  a_556_ap: {
    id: 'a_556_ap', name: '5.56 穿甲弹', abbr: '6A', type: 'ammo', rarity: 3, w: 1, h: 1, weight: 0.013, price: 130,
    caliber: '5.56', damage: 52, pen: 5, stack: 60, pellets: 1,
  },
  a_762_std: {
    id: 'a_762_std', name: '7.62 标准弹', abbr: '7S', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.016, price: 42,
    caliber: '7.62', damage: 82, pen: 3, stack: 60, pellets: 1,
  },
  a_762_snb: {
    id: 'a_762_snb', name: '7.62 狙击弹', abbr: '7A', type: 'ammo', rarity: 3, w: 1, h: 1, weight: 0.018, price: 175,
    caliber: '7.62', damage: 94, pen: 5, stack: 60, pellets: 1,
  },
  a_12_buck: {
    id: 'a_12_buck', name: '12号 鹿弹', abbr: '12B', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.02, price: 22,
    caliber: '12ga', damage: 17, pen: 1, stack: 60, pellets: 8,
  },
  a_12_slug: {
    id: 'a_12_slug', name: '12号 独头弹', abbr: '12S', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.025, price: 65,
    caliber: '12ga', damage: 88, pen: 3, stack: 60, pellets: 1,
  },
  a_9x19_rip: {
    id: 'a_9x19_rip', name: '9×19 空尖弹', abbr: '9HP', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.012, price: 55,
    caliber: '9x19', damage: 62, pen: 0, stack: 60, pellets: 1,
    desc: '高肉体伤害弹种，对无甲目标效果极佳，但几乎无法击穿护甲。',
  },
  a_45_std: {
    id: 'a_45_std', name: '.45 ACP 标准弹', abbr: '45S', type: 'ammo', rarity: 1, w: 1, h: 1, weight: 0.014, price: 26,
    caliber: '.45', damage: 58, pen: 2, stack: 60, pellets: 1,
  },
  a_45_ap: {
    id: 'a_45_ap', name: '.45 ACP 穿甲弹', abbr: '45A', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.015, price: 82,
    caliber: '.45', damage: 54, pen: 4, stack: 60, pellets: 1,
  },
  a_50ae_std: {
    id: 'a_50ae_std', name: '.50 AE 标准弹', abbr: '50S', type: 'ammo', rarity: 2, w: 1, h: 1, weight: 0.022, price: 78,
    caliber: '.50', damage: 102, pen: 3, stack: 60, pellets: 1,
  },
  a_50ae_ap: {
    id: 'a_50ae_ap', name: '.50 AE 穿甲弹', abbr: '50A', type: 'ammo', rarity: 3, w: 1, h: 1, weight: 0.024, price: 215,
    caliber: '.50', damage: 96, pen: 5, stack: 60, pellets: 1,
  },

  // ────────── 护甲 ──────────
  armor_paca: {
    id: 'armor_paca', name: 'PACA 防弹衣', abbr: 'PACA', type: 'armor', rarity: 1, w: 2, h: 2, weight: 3.5, price: 2600,
    cls: 2, durability: 40, zones: ['thorax', 'stomach'],
    desc: '轻型软甲，可抵挡手枪弹。重量低，适合轻装搜刮。',
  },
  armor_6b2: {
    id: 'armor_6b2', name: '6B2 防弹背心', abbr: '6B2', type: 'armor', rarity: 1, w: 2, h: 2, weight: 3.2, price: 1800,
    cls: 2, durability: 32, zones: ['thorax', 'stomach'],
    desc: '轻量化防弹背心，适合刚刚起步的拾荒路线。',
  },
  armor_6b23: {
    id: 'armor_6b23', name: '6B23 防弹衣', abbr: '6B23', type: 'armor', rarity: 2, w: 2, h: 2, weight: 6.5, price: 7600,
    cls: 3, durability: 60, zones: ['thorax', 'stomach'],
    desc: '军用防弹衣，对常见步枪弹有良好防护。',
  },
  armor_6b43: {
    id: 'armor_6b43', name: '6B43 重型护甲', abbr: '6B43', type: 'armor', rarity: 3, w: 2, h: 2, weight: 9.0, price: 18500,
    cls: 4, durability: 85, zones: ['thorax', 'stomach'],
    desc: '重型复合护甲，牺牲机动性换取生还率。',
  },
  armor_slick: {
    id: 'armor_slick', name: 'Slick 陶瓷护甲', abbr: 'SLK', type: 'armor', rarity: 4, w: 2, h: 2, weight: 8.0, price: 46000,
    cls: 5, durability: 110, zones: ['thorax', 'stomach'],
    desc: '顶级陶瓷插板护甲，灰区中最强的躯干防护。',
  },
  armor_korund: {
    id: 'armor_korund', name: 'Korund-VM 防弹衣', abbr: 'KRD', type: 'armor', rarity: 3, w: 2, h: 2, weight: 7.0, price: 22500,
    cls: 4, durability: 72, zones: ['thorax', 'stomach'],
    desc: '介于机动与防护之间的四级护甲，耐久与重量平衡。',
  },
  armor_fort: {
    id: 'armor_fort', name: 'Fort Defender-2', abbr: 'FTD', type: 'armor', rarity: 4, w: 2, h: 2, weight: 11.5, price: 42000,
    cls: 5, durability: 95, zones: ['thorax', 'stomach'],
    desc: '全重甲方案，牺牲大量机动换取极高生存率。',
  },

  // ────────── 头盔 ──────────
  helm_ssh68: {
    id: 'helm_ssh68', name: 'SSh-68 钢盔', abbr: 'S68', type: 'helmet', rarity: 1, w: 2, h: 2, weight: 1.3, price: 950,
    cls: 1, durability: 22, zones: ['head'],
    desc: '老式钢盔，聊胜于无，能挡下流弹和弹片。',
  },
  helm_6b47: {
    id: 'helm_6b47', name: '6B47 战术头盔', abbr: '6B47', type: 'helmet', rarity: 2, w: 2, h: 2, weight: 2.2, price: 6800,
    cls: 3, durability: 35, zones: ['head'],
    desc: '带护耳与面罩挂点的战术头盔，防弹性能可靠。',
  },
  helm_altyn: {
    id: 'helm_altyn', name: 'Altyn 重型头盔', abbr: 'ALT', type: 'helmet', rarity: 4, w: 2, h: 2, weight: 4.6, price: 38000,
    cls: 5, durability: 60, zones: ['head'],
    desc: '重型防弹头盔，能硬吃步枪弹，但视野与负重代价巨大。',
  },
  helm_pasgt: {
    id: 'helm_pasgt', name: 'PASGT 头盔', abbr: 'PAS', type: 'helmet', rarity: 1, w: 2, h: 2, weight: 1.9, price: 2700,
    cls: 2, durability: 26, zones: ['head'],
    desc: '轻便的凯夫拉头盔，能挡住流弹与部分手枪弹。',
  },
  helm_ulach: {
    id: 'helm_ulach', name: 'ULACH 战术头盔', abbr: 'ULA', type: 'helmet', rarity: 3, w: 2, h: 2, weight: 2.7, price: 16500,
    cls: 4, durability: 42, zones: ['head'],
    desc: '四级防弹头盔，带护耳设计，重量控制优秀。',
  },

  // ────────── 背包 ──────────
  bag_small: {
    id: 'bag_small', name: '小型背包', abbr: 'BAG', type: 'backpack', rarity: 1, w: 3, h: 3, weight: 0.8, price: 900,
    capacity: [5, 4],
    desc: '轻便背包，5×4 容量，足够装下一次小型搜刮的收获。',
  },
  bag_tactical: {
    id: 'bag_tactical', name: '战术背包', abbr: 'TAC', type: 'backpack', rarity: 2, w: 3, h: 4, weight: 1.6, price: 4200,
    capacity: [6, 5],
    desc: '军用战术背包，6×5 容量，兼顾容量与机动。',
  },
  bag_expedition: {
    id: 'bag_expedition', name: '远征背包', abbr: 'EXP', type: 'backpack', rarity: 3, w: 4, h: 4, weight: 3.0, price: 13000,
    capacity: [7, 6],
    desc: '大容量远征包，7×6 空间，搬空整个房间不是梦。',
  },

  // ────────── 弹挂 ──────────
  rig_small: {
    id: 'rig_small', name: '轻型弹挂', abbr: 'RIG', type: 'rig', rarity: 1, w: 3, h: 2, weight: 0.6, price: 1200,
    capacity: [3, 2],
    desc: '简单的胸挂，3×2 空间。把弹药和绷带放在这里，换弹更顺手。',
  },
  rig_tactical: {
    id: 'rig_tactical', name: '战术弹挂', abbr: 'RGT', type: 'rig', rarity: 2, w: 3, h: 3, weight: 1.2, price: 3800,
    capacity: [4, 3],
    desc: '模块化战术弹挂，4×3 空间，主武器弹匣与医疗品的理想归宿。',
  },
  rig_assault: {
    id: 'rig_assault', name: '突击弹挂', abbr: 'RGA', type: 'rig', rarity: 3, w: 4, h: 3, weight: 1.8, price: 9800,
    capacity: [5, 3],
    desc: '大容量突击弹挂，5×3 空间，为长时间交火准备充足弹药。',
  },

  // ────────── 医疗 ──────────
  med_bandage: {
    id: 'med_bandage', name: '绷带', abbr: 'BND', type: 'med', rarity: 1, w: 1, h: 1, weight: 0.12, price: 380,
    stack: 5, stopsBleed: true, heal: 0, useTime: 1.6,
    desc: '快速止血。流血会持续消耗生命，交战后务必处理。',
  },
  med_kit: {
    id: 'med_kit', name: '医疗包', abbr: 'MED', type: 'med', rarity: 2, w: 2, h: 1, weight: 0.6, price: 1800,
    stack: 1, stopsBleed: false, heal: 60, useTime: 4.0,
    desc: '军用急救包，恢复 60 点部位生命值，无法治疗坏死部位。',
  },

  // ────────── 贵重品 / 战利品 ──────────
  val_wire: {
    id: 'val_wire', name: '铜线卷', abbr: 'CUP', type: 'valuable', rarity: 1, w: 1, h: 1, weight: 0.4, price: 620,
    desc: '从废弃设施里拆下来的铜线，商人按重量收购。',
  },
  val_coffee: {
    id: 'val_coffee', name: '罐装咖啡', abbr: 'CAF', type: 'valuable', rarity: 1, w: 1, h: 1, weight: 0.3, price: 340,
    desc: '灰区里难得的生活物资，比弹药更抢手。',
  },
  val_calc: {
    id: 'val_calc', name: '工程计算器', abbr: 'CAL', type: 'valuable', rarity: 1, w: 1, h: 1, weight: 0.2, price: 1050,
    desc: '老式工程计算器，功能完好。',
  },
  val_gpu: {
    id: 'val_gpu', name: '显卡', abbr: 'GPU', type: 'valuable', rarity: 2, w: 2, h: 1, weight: 0.8, price: 5400,
    desc: '从机房拆下来的显卡，黑市上供不应求。',
  },
  val_fuel: {
    id: 'val_fuel', name: '燃料添加剂', abbr: 'FUL', type: 'valuable', rarity: 2, w: 1, h: 2, weight: 1.2, price: 3200,
    desc: '军用燃料添加剂，桶装，沉甸甸的一笔横财。',
  },
  val_docs: {
    id: 'val_docs', name: '机密文件', abbr: 'DOC', type: 'valuable', rarity: 3, w: 1, h: 2, weight: 0.3, price: 6900,
    desc: '印着红章的密封文件袋，情报掮客会给出好价钱。',
  },
  val_hdd: {
    id: 'val_hdd', name: '军用硬盘', abbr: 'HDD', type: 'valuable', rarity: 3, w: 2, h: 1, weight: 0.5, price: 9300,
    desc: '军用加密硬盘，数据本身就是财富。',
  },
  val_gold: {
    id: 'val_gold', name: '金表', abbr: 'GLD', type: 'valuable', rarity: 4, w: 1, h: 1, weight: 0.1, price: 13500,
    desc: '战前富商的收藏品，价值不菲且几乎不占重量。',
  },
  val_btc: {
    id: 'val_btc', name: '比特币冷钱包', abbr: 'BTC', type: 'valuable', rarity: 4, w: 1, h: 1, weight: 0.1, price: 30000,
    desc: '一枚物理比特币冷钱包。真正的一夜暴富。',
  },
};

// 武器/装备的槽位映射
export function slotForType(type) {
  if (type === 'weapon') return 'weapon';
  if (type === 'helmet') return 'helmet';
  if (type === 'armor') return 'armor';
  if (type === 'rig') return 'rig';
  if (type === 'backpack') return 'backpack';
  return null;
}

export function itemWeight(item) {
  const def = ITEMS[item.id];
  if (!def) return 0;
  if (def.type === 'ammo') return def.weight * (item.stack || 1);
  return def.weight || 0;
}

export function itemPrice(item) {
  const def = ITEMS[item.id];
  if (!def) return 0;
  return def.price * (def.type === 'ammo' ? (item.stack || 1) : 1);
}

// ═══════════════ 敌人 ═══════════════

export const ENEMY_TYPES = {
  scav: {
    id: 'scav', name: '拾荒者', hp: 90, armorClass: 0, helmetClass: 0,
    vision: 34, fov: 105, reaction: 0.75, accuracy: 0.55, damage: 12, pen: 1,
    burst: [2, 4], burstPause: [0.7, 1.4], hear: 42,
    speed: 2.3, chaseSpeed: 3.4, lootTable: 'scav_body', scale: 1.0,
    colors: { cloth: 0x5b5a44, vest: 0x3f4436, skin: 0xb08a68 },
    weaponName: '杂牌手枪',
  },
  raider: {
    id: 'raider', name: '掠夺者', hp: 135, armorClass: 3, helmetClass: 3,
    vision: 48, fov: 110, reaction: 0.5, accuracy: 0.7, damage: 19, pen: 3,
    burst: [3, 6], burstPause: [0.6, 1.2], hear: 60,
    speed: 2.8, chaseSpeed: 4.2, lootTable: 'raider_body', scale: 1.03,
    colors: { cloth: 0x3a3d3a, vest: 0x2a2e2c, skin: 0xa07c5c },
    weaponName: '突击步枪',
  },
  boss: {
    id: 'boss', name: '首领 · 灰狼', hp: 260, armorClass: 5, helmetClass: 5,
    vision: 55, fov: 115, reaction: 0.32, accuracy: 0.8, damage: 24, pen: 4,
    burst: [4, 8], burstPause: [0.5, 1.0], hear: 70,
    speed: 3.0, chaseSpeed: 4.6, lootTable: 'boss_body', scale: 1.18,
    colors: { cloth: 0x24262a, vest: 0x1d1f22, skin: 0xb08a68 },
    weaponName: '改装步枪',
  },
};

// ═══════════════ 搜刮容器 ═══════════════

export const CONTAINERS = {
  crate: { id: 'crate', name: '木箱', cols: 3, rows: 3, table: 'general', count: [2, 4], worldW: 1.15, worldD: 0.95, height: 0.95, color: 0x5a4632, kind: 'box' },
  toolbox: { id: 'toolbox', name: '工具箱', cols: 3, rows: 3, table: 'general', count: [1, 3], worldW: 1.0, worldD: 0.6, height: 0.7, color: 0x4d5459, kind: 'box' },
  weapon_box: { id: 'weapon_box', name: '武器箱', cols: 5, rows: 3, table: 'weapon', count: [1, 2], worldW: 1.6, worldD: 0.7, height: 1.1, color: 0x3d4530, kind: 'box' },
  med_box: { id: 'med_box', name: '医疗箱', cols: 3, rows: 3, table: 'med', count: [2, 3], worldW: 1.0, worldD: 0.8, height: 0.8, color: 0xa8a89c, kind: 'box' },
  safe: { id: 'safe', name: '保险柜', cols: 4, rows: 3, table: 'safe', count: [1, 3], worldW: 1.0, worldD: 0.9, height: 1.35, color: 0x33383c, kind: 'safe' },
  locker: { id: 'locker', name: '储物柜', cols: 3, rows: 4, table: 'general', count: [2, 4], worldW: 1.0, worldD: 0.6, height: 1.9, color: 0x45514f, kind: 'tall' },
  duffle: { id: 'duffle', name: '行李袋', cols: 3, rows: 3, table: 'general', count: [2, 4], worldW: 1.1, worldD: 0.7, height: 0.6, color: 0x51453a, kind: 'bag' },
  ammo_crate: { id: 'ammo_crate', name: '弹药箱', cols: 3, rows: 3, table: 'ammo', count: [2, 3], worldW: 1.2, worldD: 0.6, height: 0.65, color: 0x4d4a2f, kind: 'box' },
  body: { id: 'body', name: '尸体', cols: 4, rows: 3, table: null, count: [2, 4], worldW: 1.0, worldD: 0.8, height: 0.5, color: 0x000000, kind: 'invisible' },
};

// ═══════════════ 战利品表 [物品id, 权重] ═══════════════

export const LOOT_TABLES = {
  general: [
    ['a_9x19_std', 14], ['a_545_std', 8], ['a_12_buck', 6], ['a_45_std', 5],
    ['med_bandage', 11], ['med_kit', 5],
    ['val_wire', 12], ['val_coffee', 10], ['val_calc', 7], ['val_gpu', 3], ['val_docs', 2], ['val_fuel', 3],
    ['w_pm', 4], ['w_glock', 3], ['w_uzi', 3],
    ['armor_paca', 2], ['armor_6b2', 2], ['bag_small', 4], ['rig_small', 4],
    ['helm_ssh68', 3], ['helm_pasgt', 2], ['a_9x19_ap', 2], ['a_9x19_rip', 3],
    ['val_gold', 1], ['val_btc', 0.5],
  ],
  weapon: [
    ['w_pm', 12], ['w_m9', 10], ['w_mp5', 8], ['w_ak74', 5], ['w_m4', 3],
    ['w_mp153', 4], ['w_mosin', 3], ['w_svd', 1.5],
    ['w_glock', 6], ['w_uzi', 5], ['w_ump', 4], ['w_pp19', 2], ['w_sks', 3], ['w_saiga', 2], ['w_deagle', 1],
    ['a_9x19_std', 10], ['a_545_std', 8], ['a_556_std', 5], ['a_762_std', 4], ['a_12_buck', 5],
    ['a_45_std', 5], ['a_50ae_std', 2], ['a_9x19_rip', 4],
    ['helm_ssh68', 3], ['armor_paca', 3], ['rig_small', 3],
  ],
  med: [
    ['med_bandage', 40], ['med_kit', 22], ['val_coffee', 4], ['a_9x19_std', 4],
  ],
  ammo: [
    ['a_9x19_std', 20], ['a_545_std', 16], ['a_556_std', 10], ['a_762_std', 8], ['a_12_buck', 12],
    ['a_45_std', 8], ['a_50ae_std', 4], ['a_9x19_rip', 8],
    ['a_9x19_ap', 6], ['a_545_ap', 4], ['a_556_ap', 2], ['a_762_snb', 2], ['a_12_slug', 5],
    ['a_45_ap', 4], ['a_50ae_ap', 2],
  ],
  safe: [
    ['val_gpu', 12], ['val_gold', 8], ['val_btc', 5], ['val_docs', 10], ['val_hdd', 10],
    ['med_kit', 8], ['a_556_ap', 6], ['a_762_snb', 5], ['a_50ae_ap', 3],
    ['armor_6b43', 2], ['armor_korund', 2], ['armor_fort', 0.8],
    ['helm_6b47', 3], ['helm_ulach', 3], ['helm_altyn', 0.6],
    ['rig_tactical', 3], ['rig_assault', 2],
    ['w_m4', 2], ['w_svd', 1], ['w_deagle', 2], ['armor_slick', 0.6],
  ],
  scav_body: [
    ['a_9x19_std', 20], ['med_bandage', 16], ['val_wire', 12], ['val_coffee', 12], ['val_calc', 8],
    ['w_pm', 8], ['w_glock', 4], ['w_uzi', 3], ['bag_small', 5], ['rig_small', 5],
    ['armor_paca', 3], ['armor_6b2', 3], ['helm_pasgt', 2], ['val_gpu', 2], ['med_kit', 5],
  ],
  raider_body: [
    ['a_545_ap', 8], ['a_556_std', 8], ['med_kit', 10], ['med_bandage', 10],
    ['armor_6b23', 4], ['helm_6b47', 4], ['w_ak74', 5], ['w_m4', 3],
    ['w_ump', 4], ['w_pp19', 3], ['w_sks', 3], ['w_saiga', 2],
    ['rig_tactical', 6], ['rig_assault', 2],
    ['val_hdd', 4], ['val_gpu', 6], ['val_docs', 5], ['val_gold', 2], ['w_mp5', 4],
  ],
  boss_body: [
    ['val_btc', 10], ['val_gold', 12], ['val_hdd', 10], ['val_docs', 12],
    ['a_556_ap', 8], ['a_50ae_ap', 5], ['armor_6b43', 6], ['armor_fort', 4],
    ['helm_altyn', 5], ['helm_ulach', 4], ['rig_assault', 6],
    ['w_m4', 6], ['w_svd', 5], ['w_deagle', 4],
    ['med_kit', 12], ['val_gpu', 8],
  ],
};

// ═══════════════ 地图 ═══════════════

export const MAPS = {
  factory: {
    id: 'factory', name: '废弃工厂', en: 'FACTORY-07',
    desc: '扩建后的重工业厂区。车间、仓库与露天货场交错，外圈是空旷的厂区道路，交火距离被明显拉长。',
    difficulty: 1, size: 140, timer: 900, extractTime: 8,
    theme: 'factory',
    enemies: [{ type: 'scav', count: 6 }, { type: 'raider', count: 1 }],
    lootCount: 32,
    containerWeights: [['crate', 30], ['toolbox', 16], ['weapon_box', 12], ['med_box', 10], ['safe', 8], ['locker', 12], ['ammo_crate', 9], ['duffle', 3]],
    extracts: [
      { x: -58, z: 56, name: '补给车队' },
      { x: 58, z: -56, name: '地道出口' },
      { x: 0, z: -64, name: '排水渠' },
    ],
    spawns: [{ x: 0, z: 62 }, { x: -62, z: 0 }, { x: 62, z: 0 }, { x: -46, z: -60 }],
    lootHint: '厂区外圈的仓库与集装箱里散布着物资，中央货场的保险柜仍是高风险高回报。',
  },
  forest: {
    id: 'forest', name: '松林哨站', en: 'PINE OUTPOST',
    desc: '无边的松林与废弃哨站。地图面积大幅扩展，敌人更分散，长距离视线与冷枪是最大威胁。',
    difficulty: 2, size: 240, timer: 1200, extractTime: 8,
    theme: 'forest',
    enemies: [{ type: 'scav', count: 6 }, { type: 'raider', count: 2 }],
    lootCount: 34,
    containerWeights: [['crate', 30], ['duffle', 20], ['weapon_box', 10], ['med_box', 10], ['safe', 5], ['locker', 10], ['toolbox', 15]],
    extracts: [
      { x: -105, z: 90, name: '林间小路' },
      { x: 105, z: -95, name: '废弃检查站' },
      { x: -95, z: -100, name: '直升机坪' },
    ],
    spawns: [{ x: 0, z: -108 }, { x: 0, z: 108 }, { x: -108, z: 0 }, { x: 108, z: 0 }],
    lootHint: '外围的两栋新木屋与营地物资丰厚，但掠夺者会在林间巡逻。利用树木与雾隐蔽行动。',
  },
  port: {
    id: 'port', name: '军港集装箱区', en: 'MILITARY PORT',
    desc: '扩建后的深水港。更多集装箱堆场、仓库与起重机，首领在港区深处活动，撤离点分散。',
    difficulty: 3, size: 220, timer: 1200, extractTime: 8,
    theme: 'port',
    enemies: [{ type: 'scav', count: 5 }, { type: 'raider', count: 3 }, { type: 'boss', count: 1 }],
    lootCount: 42,
    containerWeights: [['crate', 25], ['duffle', 15], ['weapon_box', 20], ['med_box', 10], ['safe', 10], ['locker', 10], ['ammo_crate', 10]],
    extracts: [
      { x: -95, z: 95, name: '码头渡船' },
      { x: 95, z: 95, name: '军用卡车' },
      { x: 0, z: -100, name: '防波堤' },
    ],
    spawns: [{ x: -95, z: -95 }, { x: 95, z: -95 }, { x: 0, z: 105 }, { x: -100, z: 0 }, { x: 100, z: 0 }],
    lootHint: '港区外围新增了集装箱群与第三仓库，保险柜更多。首领仍在港区中心，注意远处吊塔上的视线。',
  },
  snow: {
    id: 'snow', name: '荒岭雪原', en: 'SNOW RIDGE',
    desc: '被风雪覆盖的边境山岭。视野朦胧、地形开阔，废弃哨所与冰湖之间是漫长而危险的行进路线。',
    difficulty: 2, size: 280, timer: 1320, extractTime: 9,
    theme: 'snow',
    enemies: [{ type: 'scav', count: 7 }, { type: 'raider', count: 3 }],
    lootCount: 44,
    containerWeights: [['crate', 26], ['toolbox', 12], ['weapon_box', 15], ['med_box', 10], ['safe', 10], ['locker', 12], ['ammo_crate', 8], ['duffle', 7]],
    extracts: [
      { x: -120, z: 112, name: '边防哨所' },
      { x: 122, z: -108, name: '冰湖渡口' },
      { x: 0, z: 126, name: '雪原信标' },
    ],
    spawns: [{ x: -120, z: -120 }, { x: 120, z: 120 }, { x: -128, z: 0 }, { x: 128, z: 0 }, { x: 0, z: -128 }],
    lootHint: '雪岭的碉堡与冰湖补给点藏有高价值物资。风雪会缩短交战距离，记得带足弹药与绷带。',
  },
  farm: {
    id: 'farm', name: '河谷农场', en: 'RIVER VALLEY',
    desc: '被战火遗弃的河谷农场。麦田、谷仓与筒仓构成开阔的战场，长距离对枪与迂回包抄并存。',
    difficulty: 3, size: 300, timer: 1320, extractTime: 9,
    theme: 'farm',
    enemies: [{ type: 'scav', count: 6 }, { type: 'raider', count: 4 }],
    lootCount: 48,
    containerWeights: [['crate', 25], ['duffle', 18], ['weapon_box', 14], ['med_box', 8], ['safe', 8], ['locker', 12], ['ammo_crate', 10], ['toolbox', 5]],
    extracts: [
      { x: -132, z: 120, name: '农场小路' },
      { x: 132, z: -128, name: '河谷渡口' },
      { x: -128, z: -120, name: '旧风车' },
    ],
    spawns: [{ x: 0, z: -140 }, { x: 0, z: 140 }, { x: -140, z: 0 }, { x: 140, z: 0 }],
    lootHint: '两座谷仓与三座筒仓是主要资源点，田间视线极好，注意远处高地的冷枪。',
  },
  city: {
    id: 'city', name: '断壁城区', en: 'RUINED CITY',
    desc: '战前的城市中心，如今只剩残破楼宇与瓦砾。街区巷战、屋顶制高点与首领据点让这里成为最危险的区域之一。',
    difficulty: 3, size: 260, timer: 1200, extractTime: 9,
    theme: 'city',
    enemies: [{ type: 'scav', count: 5 }, { type: 'raider', count: 4 }, { type: 'boss', count: 1 }],
    lootCount: 46,
    containerWeights: [['crate', 20], ['duffle', 10], ['weapon_box', 16], ['med_box', 10], ['safe', 14], ['locker', 14], ['ammo_crate', 10], ['toolbox', 6]],
    extracts: [
      { x: -114, z: 112, name: '地铁入口' },
      { x: 116, z: 114, name: '直升机点' },
      { x: 0, z: -122, name: '排水隧道' },
      { x: -118, z: -104, name: '边检站' },
    ],
    spawns: [{ x: 0, z: 122 }, { x: -122, z: 0 }, { x: 122, z: 0 }, { x: -62, z: 122 }],
    lootHint: '街区的保险柜与军械库物资丰富，首领据点位于中央广场附近。巷战时小心窗口与瓦砾后的枪口。',
  },
};

export const MAP_ORDER = ['factory', 'forest', 'port', 'snow', 'farm', 'city'];

// ═══════════════ 商人货架 ═══════════════

export const TRADER_NAME = '“渡鸦” · 黑市商人';

export const TRADER_CATALOG = [
  {
    id: 'weapons', name: '武器',
    entries: [
      { id: 'w_pm', qty: 1 }, { id: 'w_m9', qty: 1 }, { id: 'w_glock', qty: 1 },
      { id: 'w_mp5', qty: 1 }, { id: 'w_uzi', qty: 1 }, { id: 'w_ump', qty: 1 },
      { id: 'w_pp19', qty: 1 }, { id: 'w_ak74', qty: 1 }, { id: 'w_sks', qty: 1 },
      { id: 'w_mp153', qty: 1 }, { id: 'w_saiga', qty: 1 }, { id: 'w_mosin', qty: 1 },
      { id: 'w_m4', qty: 1 }, { id: 'w_svd', qty: 1 }, { id: 'w_deagle', qty: 1 },
    ],
  },
  {
    id: 'ammo', name: '弹药',
    entries: [
      { id: 'a_9x19_std', qty: 60 }, { id: 'a_9x19_ap', qty: 60 }, { id: 'a_9x19_rip', qty: 60 },
      { id: 'a_545_std', qty: 60 }, { id: 'a_545_ap', qty: 60 },
      { id: 'a_556_std', qty: 60 }, { id: 'a_556_ap', qty: 60 },
      { id: 'a_762_std', qty: 60 }, { id: 'a_762_snb', qty: 60 },
      { id: 'a_12_buck', qty: 60 }, { id: 'a_12_slug', qty: 60 },
      { id: 'a_45_std', qty: 60 }, { id: 'a_45_ap', qty: 60 },
      { id: 'a_50ae_std', qty: 60 }, { id: 'a_50ae_ap', qty: 60 },
    ],
  },
  {
    id: 'armor', name: '防护',
    entries: [
      { id: 'helm_ssh68', qty: 1 }, { id: 'helm_pasgt', qty: 1 },
      { id: 'helm_6b47', qty: 1 }, { id: 'helm_ulach', qty: 1 },
      { id: 'armor_paca', qty: 1 }, { id: 'armor_6b2', qty: 1 },
      { id: 'armor_6b23', qty: 1 }, { id: 'armor_6b43', qty: 1 },
      { id: 'armor_korund', qty: 1 }, { id: 'armor_fort', qty: 1 },
    ],
  },
  {
    id: 'medical', name: '医疗',
    entries: [
      { id: 'med_bandage', qty: 2 }, { id: 'med_kit', qty: 1 },
    ],
  },
  {
    id: 'rigs', name: '弹挂',
    entries: [
      { id: 'rig_small', qty: 1 }, { id: 'rig_tactical', qty: 1 }, { id: 'rig_assault', qty: 1 },
    ],
  },
  {
    id: 'bags', name: '背包',
    entries: [
      { id: 'bag_small', qty: 1 }, { id: 'bag_tactical', qty: 1 }, { id: 'bag_expedition', qty: 1 },
    ],
  },
];

// 弹药可能存在的口径
export const CALIBER_LABELS = {
  '9x19': '9×19', '5.45': '5.45×39', '5.56': '5.56×45', '7.62': '7.62×54',
  '12ga': '12 号', '.45': '.45 ACP', '.50': '.50 AE',
};
