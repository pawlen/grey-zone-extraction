# ═══════════════════════════════════════════════════
# 生成头盔 / 护甲 / 弹挂 / 背包 GLB
# 坐标约定（Blender）：Z 向上，-Y 为角色正面；
# 头盔原点在头部中心，护甲/弹挂/背包原点在胸腔中心。
# 用法：
#   blender -b -P tools/blender/build_gear.py
#   blender -b -P tools/blender/build_gear.py -- helm_6b47 armor_6b23
# 输出：assets/models/gear_<id>.glb
# ═══════════════════════════════════════════════════

import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    MODELS_DIR, PREVIEW_DIR, ensure_dirs, reset_scene, shade_smooth, add_bevel,
    box, cylinder, sphere, torus, join_objects, srgb, make_material,
    make_camo_image, make_roughness_image, make_metal_image,
    make_fabric_normal, make_leather_normal, make_brushed_normal,
    export_glb, render_preview,
)

RARITY_COLORS = {
    1: (0.58, 0.62, 0.65),
    2: (0.36, 0.60, 0.82),
    3: (0.65, 0.50, 0.84),
    4: (0.86, 0.66, 0.28),
}

HELMETS = {
    'helm_ssh68': {'cls': 1, 'rarity': 1, 'dome': 0.155, 'style': 'pot'},
    'helm_pasgt': {'cls': 2, 'rarity': 1, 'dome': 0.165, 'style': 'pasgt'},
    'helm_6b47': {'cls': 3, 'rarity': 2, 'dome': 0.17, 'style': 'tactical'},
    'helm_ulach': {'cls': 4, 'rarity': 3, 'dome': 0.175, 'style': 'tactical'},
    'helm_altyn': {'cls': 5, 'rarity': 4, 'dome': 0.19, 'style': 'heavy'},
}

ARMORS = {
    'armor_paca': {'cls': 2, 'rarity': 1, 'color': (0.28, 0.30, 0.24)},
    'armor_6b2': {'cls': 2, 'rarity': 1, 'color': (0.24, 0.26, 0.22)},
    'armor_6b23': {'cls': 3, 'rarity': 2, 'color': (0.22, 0.25, 0.21)},
    'armor_6b43': {'cls': 4, 'rarity': 3, 'color': (0.17, 0.19, 0.17)},
    'armor_korund': {'cls': 4, 'rarity': 3, 'color': (0.19, 0.22, 0.19)},
    'armor_slick': {'cls': 5, 'rarity': 4, 'color': (0.14, 0.15, 0.15)},
    'armor_fort': {'cls': 5, 'rarity': 4, 'color': (0.12, 0.13, 0.13)},
}

RIGS = {
    'rig_small': {'cols': 2, 'rarity': 1, 'color': (0.27, 0.29, 0.23)},
    'rig_tactical': {'cols': 3, 'rarity': 2, 'color': (0.22, 0.25, 0.20)},
    'rig_assault': {'cols': 4, 'rarity': 3, 'color': (0.18, 0.21, 0.17)},
}

BAGS = {
    'bag_small': {'rarity': 1, 'scale': 0.82},
    'bag_tactical': {'rarity': 2, 'scale': 0.95},
    'bag_expedition': {'rarity': 3, 'scale': 1.1},
}


def materials(base_color=(0.20, 0.22, 0.19), rarity=1):
    spots = [tuple(max(0.0, c * 0.72) for c in base_color), tuple(min(1.0, c * 1.25) for c in base_color)]
    fabric_img = make_camo_image('gear_fabric', base_color, spots, size=512, seed=0x51ed ^ (rarity * 97))
    dark_base = tuple(c * 0.65 for c in base_color)
    fabric_dark_img = make_camo_image('gear_fabric_dark', dark_base, spots, size=512, seed=0x71cf)
    rough = make_roughness_image('gear_rough', size=256, base=0.8, variance=0.14)
    metal_img = make_metal_image('gear_metal_tex', (0.18, 0.20, 0.21), size=512)
    fabricN = make_fabric_normal('gear_fabric_n', size=512)
    leatherN = make_leather_normal('gear_leather_n', size=512)
    brushedN = make_brushed_normal('gear_brushed_n', size=512)
    fabric = make_material('gear_fabric', roughness=0.88, metallic=0.04,
                           base_image=fabric_img, roughness_image=rough,
                           normal_image=fabricN, normal_strength=1.0)
    fabric_dark = make_material('gear_fabric_dark', roughness=0.9, metallic=0.03,
                                base_image=fabric_dark_img, roughness_image=rough,
                                normal_image=fabricN, normal_strength=1.0)
    webbing = make_material('gear_webbing', color=srgb((0.10, 0.11, 0.10)), roughness=0.8, metallic=0.06,
                            normal_image=fabricN, normal_strength=1.2)
    metal = make_material('gear_metal', roughness=0.34, metallic=0.72, base_image=metal_img,
                          normal_image=brushedN, normal_strength=0.8)
    plate = make_material('gear_plate', color=srgb(tuple(c * 0.92 for c in base_color)), roughness=0.48, metallic=0.3,
                          normal_image=fabricN, normal_strength=0.6)
    trim = make_material('gear_trim', color=srgb(RARITY_COLORS.get(rarity, RARITY_COLORS[1])),
                         roughness=0.4, metallic=0.5, normal_image=brushedN, normal_strength=0.4)
    rubber = make_material('gear_rubber', color=srgb((0.07, 0.08, 0.07)), roughness=0.9, metallic=0.02,
                           normal_image=leatherN, normal_strength=0.9)
    visor = make_material('gear_visor', color=srgb((0.05, 0.12, 0.16)), roughness=0.06, metallic=0.6)
    return {'fabric': fabric, 'fabric_dark': fabric_dark, 'webbing': webbing, 'metal': metal,
            'plate': plate, 'trim': trim, 'rubber': rubber, 'visor': visor}


def make_helmet(item_id, cfg):
    reset_scene()
    ensure_dirs()
    M = materials(rarity=cfg['rarity'])
    parts = []
    dome_r = cfg['dome']

    dome = sphere('Dome', dome_r, (0, 0.005, 0.075), M['metal'], scale=(1, 1.04, 0.82))
    parts.append(dome)
    parts.append(box('Brim', (dome_r * 1.9, 0.05, 0.03), (0, -dome_r * 0.82, 0.055),
                     M['metal'], bevel=0.008))
    # 护耳
    parts.append(box('EarL', (0.045, 0.12, 0.11), (-dome_r * 0.86, 0.0, -0.015), M['metal'], bevel=0.012))
    parts.append(box('EarR', (0.045, 0.12, 0.11), (dome_r * 0.86, 0.0, -0.015), M['metal'], bevel=0.012))
    # 导轨 / 夜视仪座
    parts.append(box('RailL', (0.016, 0.09, 0.018), (-dome_r * 0.9, -0.01, 0.115), M['webbing'], bevel=0.003))
    parts.append(box('RailR', (0.016, 0.09, 0.018), (dome_r * 0.9, -0.01, 0.115), M['webbing'], bevel=0.003))
    parts.append(box('NVGMount', (0.06, 0.05, 0.025), (0, -dome_r * 0.55, 0.17), M['webbing'], bevel=0.006))
    # 下颌带
    parts.append(box('ChinStrap', (0.012, 0.1, 0.012), (-dome_r * 0.55, -0.07, -0.09),
                     M['webbing'], rot=(0.3, 0, 0), bevel=0.002))
    parts.append(box('ChinStrap', (0.012, 0.1, 0.012), (dome_r * 0.55, -0.07, -0.09),
                     M['webbing'], rot=(0.3, 0, 0), bevel=0.002))
    # 识别条
    parts.append(box('RarityStripe', (0.16, 0.02, 0.014), (0, 0.02, 0.19), M['trim'], bevel=0.003))
    # 夜视仪座 / 弹性绳 / 内衬
    parts.append(box('NVGMount', (0.06, 0.05, 0.03), (0, -dome_r * 0.75, 0.17), M['webbing'], bevel=0.006))
    parts.append(box('NVGScrew', (0.018, 0.03, 0.018), (0, -dome_r * 0.82, 0.185), M['metal'], bevel=0.003))
    for sx in (-1, 1):
        parts.append(box('Bungee', (0.008, 0.014, 0.12), (sx * dome_r * 0.6, -0.08, 0.13),
                         M['trim'], rot=(0.2, 0, sx * 0.1), bevel=0.002))
        parts.append(box('Pad', (0.02, 0.09, 0.1), (sx * dome_r * 0.82, 0.02, 0.04),
                         M['rubber'], bevel=0.01))
    parts.append(box('ChinCup', (0.08, 0.06, 0.04), (0, -0.12, -0.1), M['rubber'], bevel=0.01))

    if cfg['style'] in ('tactical', 'heavy'):
        parts.append(box('SidePlateL', (0.03, 0.13, 0.13), (-dome_r * 0.98, -0.01, 0.0), M['plate'], bevel=0.008))
        parts.append(box('SidePlateR', (0.03, 0.13, 0.13), (dome_r * 0.98, -0.01, 0.0), M['plate'], bevel=0.008))
        parts.append(box('HeadsetL', (0.05, 0.1, 0.1), (-dome_r * 1.1, 0.0, -0.01), M['webbing'], bevel=0.012))
        parts.append(box('HeadsetR', (0.05, 0.1, 0.1), (dome_r * 1.1, 0.0, -0.01), M['webbing'], bevel=0.012))
    if cfg['style'] == 'heavy':
        visor = box('Visor', (0.22, 0.05, 0.15), (0, -dome_r * 0.9, -0.015), M['visor'],
                    rot=(-0.08, 0, 0), bevel=0.012)
        parts.append(visor)
        parts.append(box('VisorFrame', (0.26, 0.04, 0.17), (0, -dome_r * 0.86, -0.015), M['metal'], bevel=0.01))
        parts.append(box('NeckGuard', (0.28, 0.16, 0.05), (0, 0.04, -0.14), M['plate'], bevel=0.01))
    elif cfg['style'] == 'tactical':
        parts.append(box('VisorSmall', (0.17, 0.02, 0.05), (0, -dome_r * 0.92, 0.02), M['visor'], bevel=0.004))
    else:
        parts.append(box('RimBand', (dome_r * 1.98, 0.022, 0.022), (0, 0, -0.02), M['trim'], bevel=0.003))

    merged = join_objects(parts, 'Gear')
    shade_smooth(merged)
    out = os.path.join(MODELS_DIR, f'gear_{item_id}.glb')
    export_glb(out, [merged], animations=False)
    render_preview(os.path.join(PREVIEW_DIR, 'gear_' + item_id + '.png'), target=(0, 0, 0.1),
                   distance=1.1, height=0.5, resolution=520)
    print('[done]', item_id, out)


def make_armor(item_id, cfg):
    reset_scene()
    ensure_dirs()
    M = materials(cfg['color'], cfg['rarity'])
    parts = []
    bulk = 0.9 + cfg['cls'] * 0.035
    # 主体
    shell = cylinder('Shell', 0.275 * bulk, 0.42 * bulk, (0, 0, 0), M['fabric'], vertices=28)
    shell.scale = (1.0, 0.76, 1.0)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(shell, 0.02, 2)
    parts.append(shell)
    # 前后插板
    parts.append(box('FrontPlate', (0.29 * bulk, 0.05, 0.3 * bulk), (0, -0.2, 0.02), M['plate'], bevel=0.015))
    parts.append(box('BackPlate', (0.28 * bulk, 0.045, 0.28 * bulk), (0, 0.2, 0.02), M['plate'], bevel=0.015))
    # 肩带
    for side in (-1, 1):
        parts.append(box('ShoulderStrap', (0.09, 0.16, 0.32), (side * 0.17, -0.02, 0.21),
                         M['fabric'], rot=(0.18, 0, 0), bevel=0.02))
    # 弹匣袋 / 织带
    for i in range(3):
        parts.append(box(f'Pouch{i}', (0.1, 0.08, 0.12), (-0.12 + i * 0.12, -0.24, 0.0),
                         M['webbing'], bevel=0.012))
        parts.append(box(f'PouchTrim{i}', (0.085, 0.02, 0.015), (-0.12 + i * 0.12, -0.285, 0.06),
                         M['trim'], bevel=0.003))
    for i in range(3):
        parts.append(box(f'Molle{i}', (0.22, 0.012, 0.015), (0, -0.226, -0.13 + i * 0.07),
                         M['webbing'], bevel=0.002))
    # 侧围
    for side in (-1, 1):
        parts.append(box('Side', (0.06, 0.24, 0.24), (side * 0.26 * bulk, 0, 0.0), M['fabric'], bevel=0.02))
    # 快拆扣
    parts.append(box('Buckle', (0.06, 0.03, 0.05), (0, -0.29, 0.16), M['metal'], bevel=0.005))
    # MOLLE 竖向织带、肩带扣、胸挂袋、电台与止血带
    for i in range(3):
        for j in range(5):
            parts.append(box('MolleLoop', (0.02, 0.016, 0.035), (-0.18 + j * 0.09, -0.228, -0.11 + i * 0.08),
                             M['webbing'], bevel=0.003))
    for sx in (-1, 1):
        parts.append(box('StrapBuckle', (0.05, 0.03, 0.045), (sx * 0.17, -0.29, 0.12), M['metal'], bevel=0.005))
        parts.append(box('SideBuckle', (0.04, 0.03, 0.06), (sx * 0.29, -0.2, -0.02), M['metal'], bevel=0.004))
    parts.append(box('AdminPouch', (0.16, 0.05, 0.14), (-0.2, -0.26, 0.04), M['webbing'], bevel=0.01))
    parts.append(box('Radio', (0.07, 0.04, 0.12), (0.22, -0.26, 0.06), M['webbing'], bevel=0.008))
    parts.append(box('TQ', (0.05, 0.03, 0.1), (-0.27, -0.16, -0.1), M['trim'], bevel=0.008))
    if cfg['cls'] >= 4:
        for side in (-1, 1):
            parts.append(box('ShoulderPad', (0.12, 0.2, 0.06), (side * 0.25, -0.02, 0.23),
                             M['plate'], rot=(0.1, 0, side * 0.2), bevel=0.015))

    merged = join_objects(parts, 'Gear')
    shade_smooth(merged)
    out = os.path.join(MODELS_DIR, f'gear_{item_id}.glb')
    export_glb(out, [merged], animations=False)
    render_preview(os.path.join(PREVIEW_DIR, 'gear_' + item_id + '.png'), target=(0, 0, 0),
                   distance=1.3, height=0.4, resolution=520)
    print('[done]', item_id, out)


def make_rig(item_id, cfg):
    reset_scene()
    ensure_dirs()
    M = materials(cfg['color'], cfg['rarity'])
    parts = []
    cols = cfg['cols']
    w = 0.24 + cols * 0.035
    # 胸挂主体（正面）
    main = cylinder('Main', 0.18, w, (0, -0.17, 0.0), M['fabric'], rot=(0, math.pi / 2, 0), vertices=16)
    main.scale = (1, 0.55, 1)
    bpy.context.view_layer.objects.active = main
    bpy.ops.object.transform_apply(scale=True)
    parts.append(main)
    # 肩带（向后绕）
    for side in (-1, 1):
        parts.append(box('ShoulderStrap', (0.06, 0.3, 0.025), (side * 0.12, 0.0, 0.19),
                         M['webbing'], rot=(0.2, 0, 0), bevel=0.006))
        parts.append(box('Buckle', (0.05, 0.03, 0.035), (side * 0.12, -0.16, 0.1), M['metal'], bevel=0.004))
    # 弹匣袋
    for i in range(cols):
        x = -w / 2 + 0.02 + (w - 0.04) / cols * (i + 0.5)
        parts.append(box(f'MagPouch{i}', (w / cols - 0.03, 0.09, 0.1), (x, -0.24, -0.015),
                         M['webbing'], bevel=0.012))
        parts.append(box(f'MagTrim{i}', (w / cols - 0.045, 0.02, 0.012), (x, -0.29, 0.045), M['trim'], bevel=0.002))
    # 杂物袋 / 手雷
    parts.append(box('UtilityPouch', (0.07, 0.07, 0.08), (w / 2 + 0.05, -0.2, 0.0), M['webbing'], bevel=0.012))
    parts.append(cylinder('Grenade', 0.03, 0.07, (-w / 2 - 0.05, -0.2, 0.0), M['webbing'], vertices=10))

    merged = join_objects(parts, 'Gear')
    shade_smooth(merged)
    out = os.path.join(MODELS_DIR, f'gear_{item_id}.glb')
    export_glb(out, [merged], animations=False)
    render_preview(os.path.join(PREVIEW_DIR, 'gear_' + item_id + '.png'), target=(0, 0, 0),
                   distance=1.1, height=0.35, resolution=520)
    print('[done]', item_id, out)


def make_backpack(item_id, cfg):
    reset_scene()
    ensure_dirs()
    M = materials(rarity=cfg['rarity'])
    parts = []
    s = cfg['scale']
    w = 0.4 * s
    h = 0.46 * s
    d = 0.22 * s
    # 包体在背后（+Y）
    body = box('Body', (w, d, h), (0, 0.23, 0), M['fabric'], bevel=0.06, bevel_segments=3)
    parts.append(body)
    parts.append(box('Lid', (w * 0.94, d * 1.04, 0.12), (0, 0.23, h / 2 - 0.01), M['fabric_dark'], bevel=0.03))
    parts.append(box('LidStripe', (w * 0.7, 0.02, 0.03), (0, 0.34, h / 2 - 0.07), M['trim'], bevel=0.004))
    # 侧袋
    for side in (-1, 1):
        parts.append(box('SidePouch', (0.08, d * 0.7, h * 0.35), (side * (w / 2 + 0.035), 0.23, -0.02),
                         M['webbing'], bevel=0.015))
    # 肩带、腰带
    for side in (-1, 1):
        parts.append(box('ShoulderStrap', (0.07, 0.03, 0.32), (side * 0.14, -0.14, 0.06),
                         M['webbing'], bevel=0.008))
        parts.append(box('StrapBuckle', (0.05, 0.03, 0.04), (side * 0.14, -0.16, -0.08), M['metal'], bevel=0.004))
    parts.append(box('SternumStrap', (0.26, 0.03, 0.025), (0, -0.14, 0.1), M['webbing'], bevel=0.004))
    # 顶部卷垫
    roll = cylinder('Bedroll', 0.055 * s, w * 0.9, (0, 0.27, h / 2 + 0.07), M['fabric_dark'],
                    rot=(0, math.pi / 2, 0), vertices=12)
    parts.append(roll)
    # 提手
    parts.append(box('Handle', (w * 0.4, 0.04, 0.04), (0, 0.12, h / 2 + 0.01), M['webbing'], bevel=0.008))
    # 压缩带、扣具、拉链与侧袋盖
    for side in (-1, 1):
        parts.append(box('CompStrap', (0.035, d * 1.02, 0.03), (side * w * 0.25, 0.23, 0.06),
                         M['webbing'], bevel=0.004))
        parts.append(box('CompBuckle', (0.05, 0.03, 0.04), (side * w * 0.25, 0.12, 0.1),
                         M['metal'], bevel=0.004))
        parts.append(box('SideLid', (0.085, 0.03, 0.12), (side * (w / 2 + 0.035), 0.19, h * 0.4),
                         M['fabric_dark'], bevel=0.008))
    parts.append(box('Zipper', (w * 0.88, 0.02, 0.02), (0, 0.13, h * 0.35), M['metal'], bevel=0.002))
    parts.append(box('ZipPull', (0.02, 0.03, 0.05), (w * 0.3, 0.12, h * 0.35), M['trim'], bevel=0.004))
    parts.append(box('Patch', (0.09, 0.012, 0.06), (0, 0.13, h * 0.3), M['trim'], bevel=0.003))

    merged = join_objects(parts, 'Gear')
    shade_smooth(merged)
    out = os.path.join(MODELS_DIR, f'gear_{item_id}.glb')
    export_glb(out, [merged], animations=False)
    render_preview(os.path.join(PREVIEW_DIR, 'gear_' + item_id + '.png'), target=(0, 0, 0),
                   distance=1.5, height=0.5, resolution=520)
    print('[done]', item_id, out)


def main():
    args = sys.argv
    selected = args[args.index('--') + 1:] if '--' in args else []
    groups = [
        (HELMETS, make_helmet), (ARMORS, make_armor),
        (RIGS, make_rig), (BAGS, make_backpack),
    ]
    for table, fn in groups:
        for item_id, cfg in table.items():
            if selected and item_id not in selected:
                continue
            try:
                fn(item_id, cfg)
            except Exception as e:
                import traceback
                traceback.print_exc()
                print('[error]', item_id, e)


if __name__ == '__main__':
    main()
