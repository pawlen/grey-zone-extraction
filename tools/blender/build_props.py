# ═══════════════════════════════════════════════════
# 生成搜刮容器场景道具 GLB（原点在地面中心，正面 -Y）
# 可开启容器带名为 lidPivot 的铰链节点
# 用法：
#   blender -b -P tools/blender/build_props.py
#   blender -b -P tools/blender/build_props.py -- crate safe
# 输出：assets/models/prop_<id>.glb
# ═══════════════════════════════════════════════════

import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    MODELS_DIR, PREVIEW_DIR, ensure_dirs, reset_scene, shade_smooth, add_bevel,
    box, cylinder, sphere, join_objects, srgb, make_material,
    make_wood_images, make_metal_image, make_roughness_image,
    make_fabric_normal, make_leather_normal, make_brushed_normal,
    export_glb, render_preview,
)

PROPS = {
    'crate': {'w': 1.15, 'd': 0.95, 'h': 0.95, 'kind': 'wood'},
    'toolbox': {'w': 1.0, 'd': 0.6, 'h': 0.7, 'kind': 'metalbox'},
    'weapon_box': {'w': 1.6, 'd': 0.7, 'h': 1.1, 'kind': 'weaponbox'},
    'med_box': {'w': 1.0, 'd': 0.8, 'h': 0.8, 'kind': 'medbox'},
    'safe': {'w': 1.0, 'd': 0.9, 'h': 1.35, 'kind': 'safe'},
    'locker': {'w': 1.0, 'd': 0.6, 'h': 1.9, 'kind': 'locker'},
    'duffle': {'w': 1.1, 'd': 0.7, 'h': 0.6, 'kind': 'duffle'},
    'ammo_crate': {'w': 1.2, 'd': 0.6, 'h': 0.65, 'kind': 'ammocrate'},
}


def materials():
    wood_img, wood_n = make_wood_images('prop_wood_tex', (0.36, 0.26, 0.16), size=512, seed=0x12ab)
    wood_dark_img, wood_dark_n = make_wood_images('prop_wood_dark_tex', (0.22, 0.15, 0.10), size=512, seed=0x33cd)
    metal_img = make_metal_image('prop_metal_tex', (0.22, 0.24, 0.25), size=512)
    metal_dark_img = make_metal_image('prop_metal_dark_tex', (0.11, 0.12, 0.13), size=512)
    rough = make_roughness_image('prop_rough', size=256, base=0.55, variance=0.22)
    fabricN = make_fabric_normal('prop_fabric_n', size=512)
    leatherN = make_leather_normal('prop_leather_n', size=512)
    brushedN = make_brushed_normal('prop_brushed_n', size=512)
    wood = make_material('prop_wood', roughness=0.85, metallic=0.02, base_image=wood_img,
                         normal_image=wood_n, normal_strength=0.9)
    wood_dark = make_material('prop_wood_dark', roughness=0.88, metallic=0.02, base_image=wood_dark_img,
                              normal_image=wood_dark_n, normal_strength=0.9)
    metal = make_material('prop_metal', roughness=0.38, metallic=0.7, base_image=metal_img,
                          roughness_image=rough, normal_image=brushedN, normal_strength=0.7)
    metal_dark = make_material('prop_metal_dark', roughness=0.48, metallic=0.58, base_image=metal_dark_img,
                               normal_image=brushedN, normal_strength=0.6)
    olive = make_material('prop_olive', color=srgb((0.22, 0.26, 0.18)), roughness=0.72, metallic=0.12,
                          normal_image=fabricN, normal_strength=0.8)
    white = make_material('prop_white', color=srgb((0.72, 0.72, 0.66)), roughness=0.66, metallic=0.04,
                          normal_image=fabricN, normal_strength=0.5)
    red = make_material('prop_red', color=srgb((0.56, 0.12, 0.10)), roughness=0.65, metallic=0.05)
    tan = make_material('prop_tan', color=srgb((0.38, 0.32, 0.22)), roughness=0.82, metallic=0.02,
                        normal_image=leatherN, normal_strength=1.0)
    accent = make_material('prop_accent', color=srgb((0.62, 0.50, 0.26)), roughness=0.45, metallic=0.45,
                           normal_image=brushedN, normal_strength=0.4)
    return {'wood': wood, 'wood_dark': wood_dark, 'metal': metal, 'metal_dark': metal_dark,
            'olive': olive, 'white': white, 'red': red, 'tan': tan, 'accent': accent}


def add_lid(pivot_pos, size, mat, name='Lid'):
    pivot = bpy.data.objects.new('lidPivot', None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = pivot_pos
    lid = box(name, size, (0, -size[1] / 2, size[2] / 2), mat, bevel=0.012)
    lid.parent = pivot
    return pivot, lid


def finish(parts, name, preview_dist=2.6):
    # 盖子必须保留在 lidPivot 下，不能并入主体网格
    body_parts = [o for o in parts if o and o.type == 'MESH' and (o.parent is None or o.parent.name != 'lidPivot')]
    merged = join_objects(body_parts, 'PropMesh')
    if merged:
        shade_smooth(merged)
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'EMPTY')]
    out = os.path.join(MODELS_DIR, f'prop_{name}.glb')
    export_glb(out, objs, animations=False)
    render_preview(os.path.join(PREVIEW_DIR, 'prop_' + name + '.png'), target=(0, 0, 0.5),
                   distance=preview_dist, height=1.4, resolution=600)
    print('[done]', name, out)


def build_wood(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    body = box('Body', (w, d, h * 0.92), (0, 0, h * 0.46), M['wood'], bevel=0.02)
    parts.append(body)
    # 木板纹理条
    for i in range(4):
        parts.append(box('Plank', (w * 0.96, 0.012, 0.012), (0, -d / 2 - 0.004, 0.12 + i * h * 0.2),
                         M['wood_dark'], bevel=0.002))
    # 角铁
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(box('Corner', (0.06, 0.06, h * 0.85), (sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h * 0.43),
                             M['metal_dark'], bevel=0.006))
    pivot, lid = add_lid((0, d / 2, h * 0.92), (w * 1.02, d, 0.08), M['wood_dark'])
    parts.append(lid)
    parts.append(box('Latch', (0.16, 0.05, 0.14), (0, -d / 2 - 0.03, h * 0.72), M['accent'], bevel=0.006))
    parts.append(box('LockPlate', (0.1, 0.04, 0.12), (0, -d / 2 - 0.035, h * 0.5), M['metal'], bevel=0.006))
    parts.append(box('Label', (0.3, 0.012, 0.16), (w * 0.18, -d / 2 - 0.01, h * 0.55), M['white'], bevel=0.003))
    for sx in (-1, 1):
        for sz in (0.2, 0.75):
            parts.append(box('Rivet', (0.02, 0.02, 0.02), (sx * (w / 2 - 0.07), -d / 2 - 0.01, h * sz),
                             M['metal'], bevel=0.003))
    finish(parts + [pivot], 'crate')


def build_metalbox(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h * 0.9), (0, 0, h * 0.45), M['metal'], bevel=0.02))
    parts.append(box('Top', (w * 0.98, d * 0.98, 0.06), (0, 0, h * 0.9), M['metal_dark'], bevel=0.008))
    parts.append(box('Handle', (0.3, 0.06, 0.05), (0, -d / 2 - 0.03, h * 0.7), M['metal_dark'], bevel=0.008))
    parts.append(box('Latch', (0.1, 0.05, 0.1), (0, -d / 2 - 0.03, h * 0.55), M['accent'], bevel=0.005))
    for sx in (-1, 1):
        parts.append(box('Rib', (0.03, d * 0.8, h * 0.7), (sx * (w / 2 - 0.01), 0, h * 0.45),
                         M['metal_dark'], bevel=0.004))
    pivot, lid = add_lid((0, d / 2, h * 0.9), (w * 0.98, d, 0.07), M['metal_dark'])
    parts += [pivot, lid]
    for sx in (-1, 1):
        parts.append(box('Hinge', (0.06, 0.05, 0.04), (sx * w * 0.35, d / 2 - 0.02, h * 0.88),
                         M['metal'], bevel=0.005))
        parts.append(box('Foot', (0.05, 0.05, 0.04), (sx * w * 0.4, -d * 0.35, 0.02),
                         M['metal_dark'], bevel=0.005))
    parts.append(box('Label', (0.25, 0.012, 0.09), (0, -d / 2 - 0.01, h * 0.75), M['white'], bevel=0.002))
    finish(parts, 'toolbox', preview_dist=2.2)


def build_weaponbox(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h * 0.9), (0, 0, h * 0.45), M['olive'], bevel=0.02))
    for i in range(3):
        parts.append(box('Band', (w * 0.98, 0.05, h * 0.9), (-w / 2 + 0.12 + i * 0.3, 0, h * 0.45),
                         M['tan'], bevel=0.01))
    parts.append(box('Stencil', (0.4, 0.01, 0.12), (0, -d / 2 - 0.006, h * 0.55), M['accent'], bevel=0.003))
    pivot, lid = add_lid((0, d / 2, h * 0.9), (w * 1.01, d, 0.09), M['olive'])
    parts += [pivot, lid]
    parts.append(box('Latch', (0.2, 0.05, 0.1), (0, -d / 2 - 0.03, h * 0.75), M['metal_dark'], bevel=0.006))
    finish(parts, 'weapon_box', preview_dist=3.0)


def build_medbox(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h * 0.9), (0, 0, h * 0.45), M['white'], bevel=0.02))
    # 红十字
    parts.append(box('CrossV', (0.1, 0.01, 0.34), (0, -d / 2 - 0.006, h * 0.55), M['red'], bevel=0.003))
    parts.append(box('CrossH', (0.32, 0.01, 0.1), (0, -d / 2 - 0.006, h * 0.55), M['red'], bevel=0.003))
    parts.append(box('Handle', (0.28, 0.05, 0.05), (0, -d / 2 - 0.03, h * 0.8), M['metal_dark'], bevel=0.006))
    pivot, lid = add_lid((0, d / 2, h * 0.9), (w * 0.98, d, 0.07), M['white'])
    parts += [pivot, lid]
    finish(parts, 'med_box', preview_dist=2.2)


def build_safe(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h), (0, 0, h * 0.5), M['metal_dark'], bevel=0.02))
    parts.append(box('Door', (w * 0.9, 0.06, h * 0.82), (0, -d / 2 - 0.03, h * 0.48), M['metal'], bevel=0.015))
    parts.append(box('Seam', (w * 0.86, 0.01, 0.02), (0, -d / 2 - 0.065, h * 0.2), M['metal_dark'], bevel=0.002))
    dial = cylinder('Dial', 0.13, 0.06, (0, -d / 2 - 0.08, h * 0.55), M['accent'], rot=(math.pi / 2, 0, 0), vertices=16)
    parts.append(dial)
    parts.append(box('Handle', (0.05, 0.06, 0.24), (w * 0.28, -d / 2 - 0.08, h * 0.55), M['metal_dark'], bevel=0.01))
    parts.append(box('Hinge', (0.05, 0.05, 0.2), (-w / 2 + 0.02, -d / 2 - 0.03, h * 0.8), M['metal_dark'], bevel=0.006))
    for i in range(3):
        parts.append(box('Vent', (0.02, 0.05, 0.12), (w * 0.35, -d / 2 - 0.065, h * 0.2 + i * 0.16),
                         M['metal_dark'], bevel=0.003))
    for sx in (-1, 1):
        parts.append(box('Foot', (0.06, 0.05, 0.04), (sx * w * 0.35, d * 0.35, 0.02),
                         M['metal_dark'], bevel=0.005))
    parts.append(box('SafeLabel', (0.18, 0.012, 0.08), (0, -d / 2 - 0.068, h * 0.32), M['white'], bevel=0.002))
    finish(parts, 'safe', preview_dist=2.6)


def build_locker(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h), (0, 0, h * 0.5), M['metal'], bevel=0.02))
    parts.append(box('DoorSeam', (0.01, 0.02, h * 0.88), (0, -d / 2 - 0.006, h * 0.5), M['metal_dark'], bevel=0.002))
    parts.append(box('Handle', (0.04, 0.05, 0.16), (w * 0.22, -d / 2 - 0.04, h * 0.5), M['metal_dark'], bevel=0.006))
    for i in range(4):
        parts.append(box('Vent', (w * 0.5, 0.04, 0.03), (0, -d / 2 - 0.02, h * 0.82 - i * 0.07),
                         M['metal_dark'], bevel=0.003))
    parts.append(box('Base', (w * 1.02, d * 1.02, 0.08), (0, 0, 0.04), M['metal_dark'], bevel=0.01))
    finish(parts, 'locker', preview_dist=3.0)


def build_duffle(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    body = box('Body', (w, d * 0.9, h * 0.8), (0, 0, h * 0.42), M['tan'], bevel=0.09, bevel_segments=4)
    parts.append(body)
    # 拉链 / 背带
    parts.append(box('Zipper', (w * 0.82, 0.02, 0.02), (0, 0.02, h * 0.82), M['metal_dark'], bevel=0.003))
    for sx in (-1, 1):
        parts.append(box('Strap', (0.08, d * 0.9, 0.03), (sx * w * 0.28, 0, h * 0.8), M['accent'], bevel=0.006))
    pivot, lid = add_lid((0, d / 2, h * 0.8), (w * 0.86, d * 0.8, 0.05), M['tan'])
    parts += [pivot, lid]
    parts.append(box('Tag', (0.08, 0.01, 0.06), (w * 0.3, -d / 2 - 0.02, h * 0.45), M['red'], bevel=0.002))
    finish(parts, 'duffle', preview_dist=2.4)


def build_ammocrate(cfg):
    M = materials()
    w, d, h = cfg['w'], cfg['d'], cfg['h']
    parts = []
    parts.append(box('Body', (w, d, h * 0.9), (0, 0, h * 0.45), M['olive'], bevel=0.02))
    for sx in (-1, 1):
        parts.append(box('Latch', (0.07, 0.05, 0.12), (sx * w * 0.28, -d / 2 - 0.03, h * 0.68),
                         M['metal_dark'], bevel=0.005))
    parts.append(box('Stencil', (w * 0.5, 0.01, 0.1), (0, -d / 2 - 0.006, h * 0.4), M['accent'], bevel=0.003))
    parts.append(box('Handle', (w * 0.3, 0.05, 0.05), (0, -d / 2 - 0.03, h * 0.75), M['metal_dark'], bevel=0.006))
    pivot, lid = add_lid((0, d / 2, h * 0.9), (w * 1.01, d, 0.08), M['olive'])
    parts += [pivot, lid]
    finish(parts, 'ammo_crate', preview_dist=2.6)


BUILDERS = {
    'wood': build_wood, 'metalbox': build_metalbox, 'weaponbox': build_weaponbox,
    'medbox': build_medbox, 'safe': build_safe, 'locker': build_locker,
    'duffle': build_duffle, 'ammocrate': build_ammocrate,
}


def main():
    args = sys.argv
    selected = args[args.index('--') + 1:] if '--' in args else []
    for pid, cfg in PROPS.items():
        if selected and pid not in selected:
            continue
        reset_scene()
        ensure_dirs()
        try:
            BUILDERS[cfg['kind']](cfg)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('[error]', pid, e)


if __name__ == '__main__':
    main()
