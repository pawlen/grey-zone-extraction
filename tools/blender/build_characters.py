# ═══════════════════════════════════════════════════
# 生成骨骼蒙皮角色 GLB（拾荒者 / 掠夺者 / 首领 / 干员）
# 用法：
#   blender -b -P tools/blender/build_characters.py
#   blender -b -P tools/blender/build_characters.py -- scav
# 输出：
#   assets/models/enemy_scav.glb
#   assets/models/enemy_raider.glb
#   assets/models/enemy_boss.glb
#   assets/models/operator.glb
# ═══════════════════════════════════════════════════

import bpy
import math
import os
import sys
from mathutils import Vector, Euler, Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    ROOT, MODELS_DIR, PREVIEW_DIR, ensure_dirs, reset_scene, set_active, shade_smooth,
    apply_modifiers, add_bevel, box, cylinder, sphere, torus, join_objects, smart_uv,
    make_camo_image, make_roughness_image, make_skin_image, make_metal_image, make_material,
    make_fabric_normal, make_leather_normal, make_brushed_normal,
    create_armature, auto_weights, add_armature_modifier, new_action, key_bone, srgb,
    finish_action, clear_pose, export_glb, render_preview,
)

VARIANTS = {
    'scav': {
        'name': '散射者',
        'cloth': (0.36, 0.35, 0.26),
        'cloth2': (0.26, 0.25, 0.18),
        'vest': (0.24, 0.26, 0.21),
        'gear': (0.13, 0.14, 0.12),
        'skin': (0.71, 0.54, 0.40),
        'helmet': False,
        'heavy': False,
        'camo_spots': [(0.28, 0.26, 0.17), (0.45, 0.42, 0.30), (0.17, 0.19, 0.13), (0.52, 0.47, 0.36)],
        'output': 'enemy_scav.glb',
        'height': 1.80,
    },
    'raider': {
        'name': '掠夺者',
        'cloth': (0.23, 0.24, 0.22),
        'cloth2': (0.17, 0.18, 0.17),
        'vest': (0.16, 0.17, 0.16),
        'gear': (0.11, 0.12, 0.11),
        'skin': (0.63, 0.48, 0.34),
        'helmet': True,
        'heavy': False,
        'camo_spots': [(0.15, 0.16, 0.14), (0.30, 0.31, 0.27), (0.10, 0.11, 0.10), (0.25, 0.26, 0.22)],
        'output': 'enemy_raider.glb',
        'height': 1.84,
    },
    'boss': {
        'name': '首领',
        'cloth': (0.14, 0.15, 0.16),
        'cloth2': (0.10, 0.10, 0.11),
        'vest': (0.10, 0.11, 0.11),
        'gear': (0.08, 0.09, 0.09),
        'skin': (0.66, 0.50, 0.35),
        'helmet': True,
        'heavy': True,
        'camo_spots': [(0.09, 0.10, 0.10), (0.20, 0.21, 0.20), (0.05, 0.05, 0.06), (0.16, 0.17, 0.16)],
        'output': 'enemy_boss.glb',
        'height': 1.94,
    },
    'operator': {
        'name': '干员',
        'cloth': (0.29, 0.33, 0.25),
        'cloth2': (0.20, 0.23, 0.17),
        'vest': (0.21, 0.24, 0.19),
        'gear': (0.14, 0.15, 0.13),
        'skin': (0.73, 0.56, 0.42),
        'helmet': False,
        'heavy': False,
        'tactical': False,
        'camo_spots': [(0.24, 0.27, 0.19), (0.36, 0.39, 0.29), (0.18, 0.20, 0.15), (0.42, 0.45, 0.33)],
        'output': 'operator.glb',
        'height': 1.82,
    },
}

BONE_SPECS = [
    {'name': 'Root', 'head': (0, 0, 0.0), 'tail': (0, 0, 0.15)},
    {'name': 'Hips', 'head': (0, 0, 0.95), 'tail': (0, 0, 1.09), 'parent': 'Root'},
    {'name': 'Spine', 'head': (0, 0, 1.09), 'tail': (0, 0, 1.25), 'parent': 'Hips'},
    {'name': 'Chest', 'head': (0, 0, 1.25), 'tail': (0, 0, 1.50), 'parent': 'Spine'},
    {'name': 'Neck', 'head': (0, 0, 1.50), 'tail': (0, 0, 1.63), 'parent': 'Chest'},
    {'name': 'Head', 'head': (0, 0, 1.63), 'tail': (0, 0, 1.94), 'parent': 'Neck'},
    {'name': 'ShoulderL', 'head': (-0.05, 0, 1.45), 'tail': (-0.24, 0, 1.49), 'parent': 'Chest'},
    {'name': 'UpperArmL', 'head': (-0.24, 0, 1.49), 'tail': (-0.27, 0, 1.22), 'parent': 'ShoulderL'},
    {'name': 'LowerArmL', 'head': (-0.27, 0, 1.22), 'tail': (-0.27, 0, 0.99), 'parent': 'UpperArmL'},
    {'name': 'HandL', 'head': (-0.27, 0, 0.99), 'tail': (-0.27, 0, 0.87), 'parent': 'LowerArmL'},
    {'name': 'ShoulderR', 'head': (0.05, 0, 1.45), 'tail': (0.24, 0, 1.49), 'parent': 'Chest'},
    {'name': 'UpperArmR', 'head': (0.24, 0, 1.49), 'tail': (0.27, 0, 1.22), 'parent': 'ShoulderR'},
    {'name': 'LowerArmR', 'head': (0.27, 0, 1.22), 'tail': (0.27, 0, 0.99), 'parent': 'UpperArmR'},
    {'name': 'HandR', 'head': (0.27, 0, 0.99), 'tail': (0.27, 0, 0.87), 'parent': 'LowerArmR'},
    {'name': 'ThighL', 'head': (-0.11, 0, 0.93), 'tail': (-0.11, 0, 0.55), 'parent': 'Hips'},
    {'name': 'ShinL', 'head': (-0.11, 0, 0.55), 'tail': (-0.11, 0, 0.16), 'parent': 'ThighL'},
    {'name': 'FootL', 'head': (-0.11, 0, 0.16), 'tail': (-0.11, -0.18, 0.06), 'parent': 'ShinL'},
    {'name': 'ThighR', 'head': (0.11, 0, 0.93), 'tail': (0.11, 0, 0.55), 'parent': 'Hips'},
    {'name': 'ShinR', 'head': (0.11, 0, 0.55), 'tail': (0.11, 0, 0.16), 'parent': 'ThighR'},
    {'name': 'FootR', 'head': (0.11, 0, 0.16), 'tail': (0.11, -0.18, 0.06), 'parent': 'ShinR'},
]


# ─────────────── 材质 ───────────────

def build_materials(key, cfg):
    camo = make_camo_image(f'{key}_camo', cfg['cloth'], cfg['camo_spots'], size=1024, seed=hash(key) & 0xffff)
    camo2 = make_camo_image(f'{key}_camo2', cfg['cloth2'], cfg['camo_spots'], size=1024, seed=(hash(key) + 7) & 0xffff)
    rough = make_roughness_image(f'{key}_rough', size=512, base=0.82, variance=0.1)
    skin = make_skin_image(f'{key}_skin', cfg['skin'], size=1024)
    metal = make_metal_image(f'{key}_metal', (0.16, 0.17, 0.18), size=512)
    fabricN = make_fabric_normal(f'{key}_fabric_n', size=512, seed=(hash(key) + 3) & 0xffff)
    leatherN = make_leather_normal(f'{key}_leather_n', size=512, seed=(hash(key) + 5) & 0xffff)
    brushedN = make_brushed_normal(f'{key}_brushed_n', size=512, seed=(hash(key) + 9) & 0xffff)
    cloth = make_material(f'{key}_cloth', roughness=0.92, base_image=camo, roughness_image=rough,
                         normal_image=fabricN, normal_strength=0.55)
    pants = make_material(f'{key}_pants', roughness=0.94, base_image=camo2, roughness_image=rough,
                          normal_image=fabricN, normal_strength=0.65)
    vest = make_material(f'{key}_vest', color=srgb(cfg['vest']), roughness=0.72, metallic=0.06,
                         roughness_image=rough, normal_image=fabricN, normal_strength=0.9)
    gear = make_material(f'{key}_gear', color=srgb(cfg['gear']), roughness=0.68, metallic=0.18,
                         roughness_image=rough, normal_image=fabricN, normal_strength=0.85)
    skin_m = make_material(f'{key}_skin', roughness=0.62, base_image=skin, normal_image=leatherN,
                           normal_strength=0.12)
    glove = make_material(f'{key}_glove', color=srgb((0.10, 0.11, 0.10)), roughness=0.8,
                          normal_image=leatherN, normal_strength=0.9)
    boot = make_material(f'{key}_boot', color=srgb((0.07, 0.08, 0.07)), roughness=0.75,
                         normal_image=leatherN, normal_strength=1.0)
    metal_m = make_material(f'{key}_metal', roughness=0.32, metallic=0.7, base_image=metal,
                            normal_image=brushedN, normal_strength=0.7)
    visor = make_material(f'{key}_visor', color=srgb((0.06, 0.12, 0.16)), roughness=0.08, metallic=0.6)
    accent = make_material(f'{key}_accent', color=srgb((0.55, 0.16, 0.13) if key == 'raider' else (0.55, 0.47, 0.26)),
                           roughness=0.7, metallic=0.2)
    rubber = make_material(f'{key}_rubber', color=srgb((0.05, 0.055, 0.05)), roughness=0.9,
                           normal_image=leatherN, normal_strength=0.8)
    eye_white = make_material(f'{key}_eye_white', color=srgb((0.82, 0.78, 0.70)), roughness=0.35)
    return {
        'cloth': cloth, 'pants': pants, 'vest': vest, 'gear': gear, 'skin': skin_m,
        'glove': glove, 'boot': boot, 'metal': metal_m, 'visor': visor, 'accent': accent,
        'rubber': rubber, 'eye_white': eye_white,
    }


# ─────────────── 身体网格 ───────────────

def build_body(mats):
    """用 Skin 修改器把骨架线框生成圆润的身体，再与头/手/靴合并。"""
    verts = [
        (0, 0, 0.98),    # 0 hips
        (0, 0, 1.14),    # 1 spine
        (0, 0, 1.34),    # 2 chest
        (0, 0, 1.56),    # 3 neck
        (-0.18, 0, 1.50), (-0.27, 0, 1.49), (-0.27, 0, 1.22), (-0.27, 0, 0.99),  # 4-7 left arm
        (0.18, 0, 1.50), (0.27, 0, 1.49), (0.27, 0, 1.22), (0.27, 0, 0.99),     # 8-11 right arm
        (-0.11, 0, 0.93), (-0.11, 0, 0.55), (-0.11, 0, 0.16),                   # 12-14 left leg
        (0.11, 0, 0.93), (0.11, 0, 0.55), (0.11, 0, 0.16),                      # 15-17 right leg
    ]
    edges = [
        (0, 1), (1, 2), (2, 3),
        (2, 4), (4, 5), (5, 6), (6, 7),
        (2, 8), (8, 9), (9, 10), (10, 11),
        (0, 12), (12, 13), (13, 14),
        (0, 15), (15, 16), (16, 17),
    ]
    radii = [0.16, 0.15, 0.185, 0.065,
             0.085, 0.07, 0.063, 0.052,
             0.085, 0.07, 0.063, 0.052,
             0.098, 0.078, 0.064,
             0.098, 0.078, 0.064]
    mesh = bpy.data.meshes.new('BodyGraphMesh')
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new('BodyGraph', mesh)
    bpy.context.collection.objects.link(obj)
    set_active(obj)

    skin = obj.modifiers.new('Skin', 'SKIN')
    skin.use_smooth_shade = True
    sv = mesh.skin_vertices[0].data
    for i, r in enumerate(radii):
        sv[i].radius = (r, r)
    sv[0].use_root = True
    try:
        skin.branch_smoothing = 0.6
    except Exception:
        pass
    apply_modifiers(obj)
    sub = obj.modifiers.new('Subsurf', 'SUBSURF')
    sub.levels = 2
    apply_modifiers(obj)
    obj.data.materials.append(mats['cloth'])
    shade_smooth(obj)
    smart_uv(obj)

    parts = [obj]

    # 头部
    head = sphere('HeadSkin', 0.15, (0, -0.008, 1.79), mats['skin'], scale=(0.95, 1.0, 1.1))
    jaw = sphere('Jaw', 0.105, (0, -0.045, 1.70), mats['skin'], scale=(0.92, 0.9, 0.82))
    ear_l = sphere('EarL', 0.03, (-0.145, -0.005, 1.78), mats['skin'], scale=(0.7, 1.0, 1.1))
    ear_r = sphere('EarR', 0.03, (0.145, -0.005, 1.78), mats['skin'], scale=(0.7, 1.0, 1.1))
    parts += [head, jaw, ear_l, ear_r]

    body = join_objects(parts, 'Body')
    shade_smooth(body)
    return body


def build_extremities(mats):
    """手套与军靴作为刚性部件绑到手/脚骨骼，避免自动权重失败导致悬空。"""
    parts = []
    for side in (-1, 1):
        S = 'L' if side < 0 else 'R'
        hand = box(f'Hand{S}', (0.085, 0.1, 0.11), (side * 0.27, -0.01, 0.955),
                   mats['glove'], bevel=0.025)
        thumb = box(f'Thumb{S}', (0.03, 0.05, 0.035), (side * 0.315, -0.045, 0.97),
                    mats['glove'], bevel=0.012)
        # 四指
        for i in range(4):
            finger = box(f'Finger{S}{i}', (0.016, 0.028, 0.05),
                         (side * (0.244 + i * 0.017), -0.07, 0.925), mats['glove'], bevel=0.006)
            parts.append((finger, 'Hand' + S))
        # 腕带
        parts.append((box(f'Wrist{S}', (0.095, 0.105, 0.03), (side * 0.27, -0.01, 1.02),
                          mats['gear'], bevel=0.008), 'Hand' + S))
        boot = box(f'Boot{S}', (0.15, 0.3, 0.115), (side * 0.11, -0.045, 0.075),
                   mats['boot'], bevel=0.03)
        sole = box(f'Sole{S}', (0.16, 0.31, 0.035), (side * 0.11, -0.045, 0.0175),
                   mats['gear'], bevel=0.01)
        toe = box(f'Toe{S}', (0.152, 0.09, 0.1), (side * 0.11, -0.145, 0.06),
                  mats['boot'], bevel=0.02)
        parts += [(hand, 'Hand' + S), (thumb, 'Hand' + S), (boot, 'Foot' + S),
                  (sole, 'Foot' + S), (toe, 'Foot' + S)]
        # 鞋带与鞋底纹
        for i in range(3):
            parts.append((box(f'Lace{S}{i}', (0.1, 0.012, 0.012),
                              (side * 0.11, -0.09 + i * 0.035, 0.115), mats['gear'], bevel=0.002), 'Foot' + S))
        for i in range(4):
            parts.append((box(f'Tread{S}{i}', (0.14, 0.035, 0.012),
                              (side * 0.11, -0.16 + i * 0.075, 0.006), mats['rubber'], bevel=0.002), 'Foot' + S))
    return parts


# ─────────────── 头部装备 ───────────────

def build_headgear(key, cfg, mats, arm=None):
    parts = []

    if not cfg['helmet'] and key == 'scav':
        cap = sphere('Cap', 0.158, (0, 0.005, 1.885), mats['cloth'], scale=(1, 0.95, 0.72))
        brim = cylinder('CapBrim', 0.16, 0.016, (0, -0.075, 1.885), mats['cloth'], vertices=20)
        brim.scale = (1, 1.15, 1)
        bpy.context.view_layer.objects.active = brim
        bpy.ops.object.transform_apply(scale=True)
        # 眉眼、鼻子与胡茬
        eye_l = box('EyeL', (0.026, 0.014, 0.014), (-0.056, -0.145, 1.833), mats['gear'], bevel=0.004)
        eye_r = box('EyeR', (0.026, 0.014, 0.014), (0.056, -0.145, 1.833), mats['gear'], bevel=0.004)
        white_l = box('EyeWhiteL', (0.036, 0.012, 0.024), (-0.056, -0.14, 1.833), mats['eye_white'], bevel=0.004)
        white_r = box('EyeWhiteR', (0.036, 0.012, 0.024), (0.056, -0.14, 1.833), mats['eye_white'], bevel=0.004)
        brow_l = box('BrowL', (0.04, 0.012, 0.013), (-0.056, -0.148, 1.855), mats['gear'], bevel=0.003, rot=(0, 0, -0.12))
        brow_r = box('BrowR', (0.04, 0.012, 0.013), (0.056, -0.148, 1.855), mats['gear'], bevel=0.003, rot=(0, 0, 0.12))
        nose = box('Nose', (0.034, 0.05, 0.032), (0, -0.16, 1.802), mats['skin'], bevel=0.01)
        mouth = box('Mouth', (0.05, 0.012, 0.01), (0, -0.156, 1.745), mats['gear'], bevel=0.002)
        beard = box('Beard', (0.105, 0.055, 0.03), (0, -0.142, 1.708), mats['gear'], bevel=0.012)
        jaw_beard = box('JawBeard', (0.16, 0.06, 0.035), (0, -0.09, 1.70), mats['gear'], bevel=0.014)
        parts += [(cap, 'Head'), (brim, 'Head'), (white_l, 'Head'), (white_r, 'Head'),
                  (eye_l, 'Head'), (eye_r, 'Head'), (brow_l, 'Head'), (brow_r, 'Head'),
                  (nose, 'Head'), (mouth, 'Head'), (beard, 'Head'), (jaw_beard, 'Head')]
    else:
        hood = sphere('Hood', 0.165, (0, 0.02, 1.80), mats['cloth'], scale=(1.02, 1.02, 1.0))
        strap = box('GoggleStrap', (0.2, 0.04, 0.03), (0, -0.12, 1.835), mats['gear'], bevel=0.008)
        parts += [(hood, 'Head'), (strap, 'Head')]
        for side in (-1, 1):
            lens = cylinder('Lens', 0.037, 0.024, (side * 0.058, -0.155, 1.835), mats['visor'],
                            rot=(math.pi / 2, 0, 0), vertices=16)
            frame = cylinder('LensFrame', 0.045, 0.014, (side * 0.058, -0.145, 1.835), mats['gear'],
                             rot=(math.pi / 2, 0, 0), vertices=16)
            parts += [(lens, 'Head'), (frame, 'Head')]
        mask = sphere('Mask', 0.075, (0, -0.12, 1.73), mats['gear'], scale=(1.2, 0.8, 0.85))
        filt = cylinder('Filter', 0.038, 0.055, (0, -0.175, 1.735), mats['gear'],
                        rot=(math.pi / 2, 0, 0), vertices=14)
        parts += [(mask, 'Head'), (filt, 'Head')]

    if cfg['helmet']:
        dome = sphere('Helmet', 0.198 if cfg['heavy'] else 0.19, (0, 0.005, 1.90), mats['metal'],
                      scale=(1.0, 1.04, 0.72 if not cfg['heavy'] else 0.8))
        brim = box('HelmetBrim', (0.31, 0.05, 0.03), (0, -0.145, 1.90), mats['metal'], bevel=0.01)
        rail_l = box('RailL', (0.018, 0.09, 0.02), (-0.17, -0.02, 1.95), mats['gear'], bevel=0.004)
        rail_r = box('RailR', (0.018, 0.09, 0.02), (0.17, -0.02, 1.95), mats['gear'], bevel=0.004)
        ear_l = box('HelmetEarL', (0.05, 0.12, 0.12), (-0.16, 0.0, 1.82), mats['metal'], bevel=0.015)
        ear_r = box('HelmetEarR', (0.05, 0.12, 0.12), (0.16, 0.0, 1.82), mats['metal'], bevel=0.015)
        parts += [(dome, 'Head'), (brim, 'Head'), (rail_l, 'Head'), (rail_r, 'Head'),
                  (ear_l, 'Head'), (ear_r, 'Head')]
        # 夜视仪座、弹性绳、下颌带、头盔内衬与螺丝
        parts.append((box('NVGMount', (0.06, 0.05, 0.03), (0, -0.19, 1.965), mats['gear'], bevel=0.006), 'Head'))
        parts.append((box('NVGScrew', (0.018, 0.03, 0.018), (0, -0.205, 1.985), mats['metal'], bevel=0.003), 'Head'))
        for side in (-1, 1):
            parts.append((box('Bungee', (0.008, 0.014, 0.13), (side * 0.12, -0.1, 1.93),
                              mats['accent'], rot=(0.2, 0, side * 0.1), bevel=0.002), 'Head'))
            parts.append((box('HelmetPad', (0.02, 0.08, 0.1), (side * 0.155, 0.01, 1.86),
                              mats['gear'], bevel=0.01), 'Head'))
            parts.append((box('RailScrew', (0.018, 0.018, 0.018), (side * 0.17, -0.06, 1.95),
                              mats['metal'], bevel=0.003), 'Head'))
        parts.append((box('ChinCup', (0.08, 0.06, 0.04), (0, -0.13, 1.70), mats['gear'], bevel=0.01), 'Head'))
        if cfg['heavy']:
            visor = box('Visor', (0.22, 0.04, 0.14), (0, -0.17, 1.84), mats['visor'], bevel=0.012)
            neck_guard = box('NeckGuard', (0.55, 0.3, 0.05), (0, 0.02, 1.58), mats['metal'], bevel=0.015)
            parts += [(visor, 'Head'), (neck_guard, 'Chest')]
        else:
            visor = box('Visor', (0.19, 0.02, 0.055), (0, -0.17, 1.845), mats['visor'], bevel=0.006)
            parts.append((visor, 'Head'))

    return parts


# ─────────────── 战术装备 ───────────────

def build_tactical(key, cfg, mats):
    parts = []
    # 防弹衣
    vest = cylinder('Vest', 0.275, 0.42, (0, 0, 1.33), mats['vest'], vertices=28, smooth=True)
    vest.scale = (1.0, 0.72, 1.0)
    set_active(vest)
    bpy.ops.object.transform_apply(scale=True)
    add_bevel(vest, 0.02, 2)
    parts.append((vest, 'Chest'))

    front = box('FrontPlate', (0.3, 0.05, 0.3), (0, -0.2, 1.34), mats['vest'], bevel=0.015)
    parts.append((front, 'Chest'))
    for i in range(3):
        pou = box(f'Pouch{i}', (0.11, 0.055, 0.13), (-0.12 + i * 0.12, -0.24, 1.32),
                  mats['gear'], bevel=0.012)
        parts.append((pou, 'Chest'))
    for i in range(3):
        strap = box(f'Molle{i}', (0.22, 0.012, 0.016), (0, -0.235, 1.19 + i * 0.075),
                    mats['gear'], bevel=0.003)
        parts.append((strap, 'Chest'))
        for j in range(4):
            parts.append((box(f'MolleLoop{i}{j}', (0.02, 0.014, 0.04),
                              (-0.09 + j * 0.06, -0.238, 1.19 + i * 0.075), mats['gear'], bevel=0.003), 'Chest'))
    # 胸前挂袋翻盖与扣具
    for i in range(3):
        parts.append((box(f'PouchFlap{i}', (0.11, 0.03, 0.04), (-0.12 + i * 0.12, -0.258, 1.375),
                          mats['gear'], bevel=0.008), 'Chest'))
        parts.append((box(f'PouchBuckle{i}', (0.025, 0.03, 0.02), (-0.12 + i * 0.12, -0.27, 1.35),
                          mats['metal'], bevel=0.003), 'Chest'))
    # 电台与天线
    parts.append((box('Radio', (0.075, 0.05, 0.13), (-0.22, -0.19, 1.42), mats['gear'], bevel=0.012), 'Chest'))
    parts.append((box('Antenna', (0.012, 0.012, 0.42), (-0.24, -0.18, 1.66), mats['metal'], rot=(0.12, 0, 0), bevel=0.002), 'Chest'))
    # 快挂与止血带
    parts.append((box('Carabiner', (0.03, 0.015, 0.06), (0.22, -0.2, 1.2), mats['metal'], bevel=0.004), 'Chest'))
    parts.append((box('TQ', (0.05, 0.03, 0.11), (-0.24, -0.06, 1.18), mats['accent'], bevel=0.008), 'Chest'))
    for side in (-1, 1):
        strap_obj = box('ShoulderStrap', (0.09, 0.15, 0.34), (side * 0.17, -0.03, 1.47),
                        mats['vest'], bevel=0.02, rot=(0.18, 0, 0))
        parts.append((strap_obj, 'Chest'))
    for side in (-1, 1):
        hp = box('HipPouch', (0.1, 0.09, 0.13), (side * 0.2, -0.14, 0.98), mats['gear'], bevel=0.012)
        parts.append((hp, 'Hips'))
    pack = box('Backpack', (0.36, 0.2, 0.42), (0, 0.22, 1.33), mats['gear'], bevel=0.06, bevel_segments=3)
    parts.append((pack, 'Chest'))
    lid = box('PackLid', (0.34, 0.18, 0.1), (0, 0.22, 1.55), mats['gear'], bevel=0.03)
    parts.append((lid, 'Chest'))
    band = box('PackBand', (0.25, 0.02, 0.035), (0, 0.32, 1.46), mats['accent'], bevel=0.005)
    parts.append((band, 'Chest'))
    for side in (-1, 1):
        knee = box('KneePad', (0.15, 0.1, 0.11), (side * 0.11, -0.075, 0.54),
                   mats['gear'], bevel=0.02)
        parts.append((knee, 'ShinL' if side < 0 else 'ShinR'))
    band_a = box('ArmBand', (0.05, 0.07, 0.012), (-0.285, -0.06, 1.36), mats['accent'], bevel=0.003)
    parts.append((band_a, 'UpperArmL'))
    collar = cylinder('Collar', 0.09, 0.13, (0, 0, 1.56), mats['cloth'], vertices=20)
    collar.scale = (1.0, 0.9, 1.0)
    set_active(collar)
    bpy.ops.object.transform_apply(scale=True)
    parts.append((collar, 'Chest'))

    if cfg['heavy']:
        for side in (-1, 1):
            pad = sphere('ShoulderPad', 0.13, (side * 0.29, 0.0, 1.5), mats['metal'],
                         scale=(1.05, 0.9, 0.7))
            parts.append((pad, 'Chest'))
        chest_rig = box('ChestRig', (0.22, 0.06, 0.18), (-0.24, -0.19, 1.3),
                        mats['gear'], bevel=0.015)
        parts.append((chest_rig, 'Chest'))

    return parts


def shrink_head(obj, threshold=1.66, center_z=1.78, center_y=0.02, factor=0.94):
    """略微缩小头部与头盔，改善头身比例。"""
    for v in obj.data.vertices:
        if v.co.z <= threshold:
            continue
        v.co.x *= factor
        v.co.y = center_y + (v.co.y - center_y) * factor
        v.co.z = center_z + (v.co.z - center_z) * factor


def assign_bone(obj, bone_name):
    vg = obj.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')


def build_character(key):
    cfg = VARIANTS[key]
    reset_scene()
    ensure_dirs()
    mats = build_materials(key, cfg)

    body = build_body(mats)
    shrink_head(body)
    gear_parts = build_headgear(key, cfg, mats) + build_extremities(mats)
    if cfg.get('tactical', True):
        gear_parts += build_tactical(key, cfg, mats)

    arm = create_armature('Rig', BONE_SPECS)
    auto_weights(body, arm)

    gear_objs = []
    for obj, bone in gear_parts:
        assign_bone(obj, bone)
        gear_objs.append(obj)
    gear = join_objects(gear_objs, 'Gear')
    if gear:
        shrink_head(gear)
        shade_smooth(gear)
        smart_uv(gear)
        add_armature_modifier(gear, arm)

    build_actions(arm, key)

    # 选择要导出的对象
    objs = [body, arm] + ([gear] if gear else [])
    out = os.path.join(MODELS_DIR, cfg['output'])
    export_glb(out, objs, animations=True)

    # 预览
    try:
        bpy.context.scene.frame_set(0)
        if arm.animation_data and arm.animation_data.action:
            pass
        render_preview(os.path.join(PREVIEW_DIR, key + '.png'), target=(0, 0, 1.0), distance=3.6, height=1.5)
    except Exception as e:
        print('[warn] preview failed:', e)

    print('[done]', key, cfg['output'])


# ─────────────── 动画 ───────────────

def build_actions(arm, variant='scav'):
    scene = bpy.context.scene
    if variant == 'operator':
        arm_idle = {'UpperArmL': (-14, 0, 12), 'LowerArmL': (-38, 0, 0),
                    'UpperArmR': (-34, 0, -26), 'LowerArmR': (-66, 0, 0)}
    else:
        arm_idle = {'UpperArmL': (-18, 0, 12), 'LowerArmL': (-42, 0, 0),
                    'UpperArmR': (-24, 0, -14), 'LowerArmR': (-48, 0, 0)}

    def act(name, frames, keys, loop=True):
        clear_pose(arm)
        a = new_action(arm, name)
        scene.frame_start = 0
        scene.frame_end = frames
        for frame, pose in keys:
            for bone, rot in pose.items():
                key_bone(arm, bone, frame, *rot)
        # 循环动作首尾一致
        if loop and keys:
            first_frame, first_pose = keys[0]
            for bone, rot in first_pose.items():
                key_bone(arm, bone, frames, *rot)
        finish_action(arm)
        a.use_fake_user = True
        return a

    # 待机：低姿持枪 + 呼吸/重心转移
    idle_keys = [
        (0, {
            'Hips': (0, 0, 1.5), 'Spine': (1.5, 0, 0), 'Chest': (1.2, 0, 0.8),
            'Neck': (0, 1.5, 0), 'Head': (1, 3, 0),
            'UpperArmL': (-18, 0, 12), 'LowerArmL': (-42, 0, 0),
            'UpperArmR': (-24, 0, -14), 'LowerArmR': (-48, 0, 0),
            'ThighL': (1, 0, 1), 'ThighR': (0, 0, -1),
            'ShinL': (2, 0, 0), 'ShinR': (2, 0, 0),
        }),
        (48, {
            'Hips': (0, 0, 0.5), 'Spine': (2.4, 0, 0), 'Chest': (2.2, 0, -0.6),
            'Neck': (0, -1.5, 0), 'Head': (1.6, -3, 0),
            'UpperArmL': (-20, 0, 12), 'LowerArmL': (-44, 0, 0),
            'UpperArmR': (-26, 0, -14), 'LowerArmR': (-50, 0, 0),
            'ThighL': (0, 0, 1), 'ThighR': (1, 0, -1),
            'ShinL': (1.5, 0, 0), 'ShinR': (2.5, 0, 0),
        }),
        (96, {
            'Hips': (0, 0, 1.5), 'Spine': (1.5, 0, 0), 'Chest': (1.2, 0, 0.8),
            'Neck': (0, 1.5, 0), 'Head': (1, 3, 0),
            'UpperArmL': (-18, 0, 12), 'LowerArmL': (-42, 0, 0),
            'UpperArmR': (-24, 0, -14), 'LowerArmR': (-48, 0, 0),
            'ThighL': (1, 0, 1), 'ThighR': (0, 0, -1),
            'ShinL': (2, 0, 0), 'ShinR': (2, 0, 0),
        }),
    ]
    act('Idle', 96, idle_keys)

    # 行走
    walk_keys = []
    for i in range(0, 29, 7):
        ph = (i / 28.0) * math.tau
        s = math.sin(ph)
        c = math.cos(ph)
        walk_keys.append((i, {
            'Hips': (1, 4.5 * s, 1.5 * s),
            'Spine': (2, -4 * s, 0),
            'Chest': (3.5, -3.5 * s, 0.8),
            'Neck': (-1.5, 0, 0), 'Head': (-1, 1.5 * s, 0),
            'ThighL': (26 * s, 0, 1.5), 'ThighR': (-26 * s, 0, -1.5),
            'ShinL': (36 + 28 * max(0, -c), 0, 0), 'ShinR': (36 + 28 * max(0, c), 0, 0),
            'FootL': (-8 * c, 0, 0), 'FootR': (8 * c, 0, 0),
            'UpperArmL': (-18 + 8 * s, 0, 12), 'UpperArmR': (-24 - 8 * s, 0, -14),
            'LowerArmL': (-42 - 4 * max(0, s), 0, 0), 'LowerArmR': (-48 - 4 * max(0, -s), 0, 0),
        }))
    act('Walk', 28, walk_keys)

    # 奔跑
    run_keys = []
    for i in range(0, 22, 6):
        ph = (i / 21.0) * math.tau
        s = math.sin(ph)
        c = math.cos(ph)
        run_keys.append((i, {
            'Hips': (4, 6 * s, 2 * s),
            'Spine': (6, -5 * s, 0),
            'Chest': (8, -5 * s, 1),
            'Neck': (-4, 0, 0), 'Head': (-3, 2 * s, 0),
            'ThighL': (42 * s, 0, 2), 'ThighR': (-42 * s, 0, -2),
            'ShinL': (55 + 40 * max(0, -c), 0, 0), 'ShinR': (55 + 40 * max(0, c), 0, 0),
            'FootL': (-12 * c, 0, 0), 'FootR': (12 * c, 0, 0),
            'UpperArmL': (-18 + 14 * s, 0, 12), 'UpperArmR': (-24 - 14 * s, 0, -14),
            'LowerArmL': (-50, 0, 0), 'LowerArmR': (-55, 0, 0),
        }))
    act('Run', 21, run_keys)

    # 瞄准（抬枪抵肩）
    aim_keys = [
        (0, {
            'Hips': (1, 0, 1), 'Spine': (1, 0, 0), 'Chest': (1.5, 0, 0.5),
            'Neck': (-2, 0, 0), 'Head': (-1, 0, 0),
            'UpperArmL': (-72, 0, 26), 'LowerArmL': (-24, 0, 0),
            'UpperArmR': (-76, 0, -8), 'LowerArmR': (-28, 0, 0),
            'ThighL': (-3, 0, 2), 'ThighR': (3, 0, -2),
            'ShinL': (7, 0, 0), 'ShinR': (5, 0, 0),
        }),
        (48, {
            'Hips': (1, 0, 1), 'Spine': (1.5, 0, 0), 'Chest': (2.2, 0, 0.2),
            'Neck': (-2, 0, 0), 'Head': (-1.5, 0, 0),
            'UpperArmL': (-73, 0, 26), 'LowerArmL': (-25, 0, 0),
            'UpperArmR': (-77, 0, -8), 'LowerArmR': (-29, 0, 0),
            'ThighL': (-3, 0, 2), 'ThighR': (3, 0, -2),
            'ShinL': (7, 0, 0), 'ShinR': (5, 0, 0),
        }),
        (96, {
            'Hips': (1, 0, 1), 'Spine': (1, 0, 0), 'Chest': (1.5, 0, 0.5),
            'Neck': (-2, 0, 0), 'Head': (-1, 0, 0),
            'UpperArmL': (-72, 0, 26), 'LowerArmL': (-24, 0, 0),
            'UpperArmR': (-76, 0, -8), 'LowerArmR': (-28, 0, 0),
            'ThighL': (-3, 0, 2), 'ThighR': (3, 0, -2),
            'ShinL': (7, 0, 0), 'ShinR': (5, 0, 0),
        }),
    ]
    act('Aim', 96, aim_keys)

    # 开火后坐
    fire_keys = [
        (0, {'Chest': (1.5, 0, 0.5), 'UpperArmR': (-76, 0, -8), 'UpperArmL': (-72, 0, 26),
             'LowerArmR': (-28, 0, 0), 'LowerArmL': (-24, 0, 0)}),
        (2, {'Chest': (4.5, 0, 0.5), 'UpperArmR': (-79, 0, -8), 'UpperArmL': (-75, 0, 26),
             'LowerArmR': (-32, 0, 0), 'LowerArmL': (-27, 0, 0)}),
        (6, {'Chest': (1.5, 0, 0.5), 'UpperArmR': (-76, 0, -8), 'UpperArmL': (-72, 0, 26),
             'LowerArmR': (-28, 0, 0), 'LowerArmL': (-24, 0, 0)}),
    ]
    act('Fire', 6, fire_keys, loop=False)

    # 倒地
    death_keys = [
        (0, {'Root': (0, 0, 0), 'Hips': (0, 0, 0), 'Chest': (0, 0, 0), 'Head': (0, 0, 0),
             'UpperArmL': (-18, 0, 12), 'UpperArmR': (-24, 0, -14),
             'LowerArmL': (-42, 0, 0), 'LowerArmR': (-48, 0, 0)}),
        (8, {'Root': (25, 0, 0), 'Hips': (-10, 0, 0), 'Chest': (12, 0, 0), 'Head': (18, 8, 0),
             'UpperArmL': (-35, 0, 24), 'UpperArmR': (-40, 0, -26),
             'LowerArmL': (-50, 0, 0), 'LowerArmR': (-55, 0, 0),
             'ThighL': (22, 0, 4), 'ThighR': (-14, 0, -4),
             'ShinL': (45, 0, 0), 'ShinR': (25, 0, 0)}),
        (24, {'Root': (85, 0, 0), 'Hips': (-14, 0, 6), 'Chest': (18, 0, 4), 'Head': (26, 14, 0),
              'UpperArmL': (-48, 0, 38), 'UpperArmR': (-50, 0, -42),
              'LowerArmL': (-55, 0, 0), 'LowerArmR': (-60, 0, 0),
              'ThighL': (38, 0, 6), 'ThighR': (-28, 0, -6),
              'ShinL': (70, 0, 0), 'ShinR': (40, 0, 0)}),
    ]
    act('Death', 24, death_keys, loop=False)

    clear_pose(arm)
    arm.animation_data.action = bpy.data.actions['Idle']


def main():
    args = sys.argv
    selected = []
    if '--' in args:
        selected = args[args.index('--') + 1:]
    keys = selected if selected else list(VARIANTS.keys())
    for key in keys:
        if key not in VARIANTS:
            print('[skip] unknown variant', key)
            continue
        try:
            build_character(key)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('[error]', key, e)


if __name__ == '__main__':
    main()
