# ═══════════════════════════════════════════════════
# 生成第一人称武器 GLB（带 muzzle 节点与 Idle/Aim/Fire/Reload 动作）
# 用法：
#   blender -b -P tools/blender/build_weapons.py
#   blender -b -P tools/blender/build_weapons.py -- w_ak74 w_m4
# 输出：assets/models/weapon_<id>.glb
# ═══════════════════════════════════════════════════

import bpy
import math
import os
import sys
from mathutils import Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    MODELS_DIR, PREVIEW_DIR, ensure_dirs, reset_scene, set_active, shade_smooth,
    apply_modifiers, add_bevel, box, cylinder, sphere, join_objects, srgb, make_material,
    make_camo_image, make_roughness_image, make_metal_image, make_wood_images,
    make_fabric_normal, make_leather_normal, make_brushed_normal,
    new_action, finish_action, clear_pose, export_glb, render_preview,
)

WEAPONS = {
    'w_pm': {'family': 'pistol', 'style': 'pm', 'name': 'P-M'},
    'w_m9': {'family': 'pistol', 'style': 'm9', 'name': 'M9'},
    'w_glock': {'family': 'pistol', 'style': 'glock', 'name': 'Glock 17'},
    'w_deagle': {'family': 'pistol', 'style': 'deagle', 'name': 'Desert Eagle'},
    'w_mp5': {'family': 'smg', 'style': 'mp5', 'name': 'MP5'},
    'w_uzi': {'family': 'smg', 'style': 'uzi', 'name': 'Uzi'},
    'w_ump': {'family': 'smg', 'style': 'ump', 'tan': True, 'name': 'UMP45'},
    'w_pp19': {'family': 'smg', 'style': 'pp19', 'name': 'PP-19'},
    'w_ak74': {'family': 'rifle', 'style': 'ak', 'wood': True, 'name': 'AK-74'},
    'w_m4': {'family': 'rifle', 'style': 'm4', 'name': 'M4A1'},
    'w_sks': {'family': 'rifle', 'style': 'sks', 'wood': True, 'name': 'SKS'},
    'w_mp153': {'family': 'shotgun', 'style': 'mp153', 'wood': True, 'name': 'MP-153'},
    'w_saiga': {'family': 'shotgun', 'style': 'saiga', 'name': 'Saiga-12'},
    'w_mosin': {'family': 'sniper', 'style': 'mosin', 'wood': True, 'name': 'Mosin'},
    'w_svd': {'family': 'sniper', 'style': 'svd', 'tan': True, 'name': 'SVD'},
}


def materials():
    metal_img = make_metal_image('gun_metal_tex', (0.20, 0.22, 0.24), size=512)
    polymer_img = make_camo_image('gun_polymer_tex', (0.09, 0.10, 0.10),
                                  [(0.07, 0.075, 0.075), (0.12, 0.13, 0.13)], size=512, seed=0x3a51)
    tan_img = make_camo_image('gun_tan_tex', (0.47, 0.41, 0.31),
                              [(0.40, 0.34, 0.25), (0.55, 0.48, 0.36)], size=512, seed=0x6b21)
    wood_img, wood_normal = make_wood_images('gun_wood_tex', (0.33, 0.20, 0.11), size=512, seed=0x7c33)
    rough = make_roughness_image('gun_rough', size=256, base=0.42, variance=0.22)
    brushedN = make_brushed_normal('gun_brushed_n', size=512)
    fabricN = make_fabric_normal('gun_fabric_n', size=512)
    leatherN = make_leather_normal('gun_leather_n', size=512)
    metal = make_material('gun_metal', roughness=0.32, metallic=0.78, base_image=metal_img,
                          roughness_image=rough, normal_image=brushedN, normal_strength=0.7)
    dark = make_material('gun_dark', color=srgb((0.10, 0.11, 0.12)), roughness=0.45, metallic=0.5,
                         normal_image=brushedN, normal_strength=0.6)
    polymer = make_material('gun_polymer', roughness=0.72, metallic=0.06, base_image=polymer_img,
                            roughness_image=rough, normal_image=fabricN, normal_strength=0.5)
    tan = make_material('gun_tan', roughness=0.76, metallic=0.04, base_image=tan_img,
                        roughness_image=rough, normal_image=fabricN, normal_strength=0.45)
    wood = make_material('gun_wood', roughness=0.52, metallic=0.02, base_image=wood_img,
                         normal_image=wood_normal, normal_strength=0.7)
    glass = make_material('gun_glass', color=srgb((0.05, 0.12, 0.16)), roughness=0.06, metallic=0.6)
    accent = make_material('gun_accent', color=srgb((0.55, 0.44, 0.24)), roughness=0.42, metallic=0.45,
                           normal_image=brushedN, normal_strength=0.4)
    glove = make_material('gun_glove', color=srgb((0.12, 0.13, 0.11)), roughness=0.85,
                          normal_image=leatherN, normal_strength=0.9)
    sleeve = make_material('gun_sleeve', color=srgb((0.20, 0.22, 0.17)), roughness=0.9,
                           normal_image=fabricN, normal_strength=0.9)
    return {'metal': metal, 'dark': dark, 'polymer': polymer, 'tan': tan, 'wood': wood,
            'glass': glass, 'accent': accent, 'glove': glove, 'sleeve': sleeve}


class GunBuilder:
    def __init__(self, cfg, mats):
        self.cfg = cfg
        self.mats = mats
        self.parts = []
        self.muzzle_y = -0.5

    def b(self, name, size, loc, mat, rot=(0, 0, 0), bevel=0.004):
        obj = box(name, size, loc, mat, rot=rot, bevel=bevel)
        self.parts.append(obj)
        return obj

    def c(self, name, radius, depth, loc, mat, axis='y', vertices=18, radius2=None, bevel=0.0):
        rot = (math.pi / 2, 0, 0) if axis == 'y' else ((0, math.pi / 2, 0) if axis == 'x' else (0, 0, 0))
        obj = cylinder(name, radius, depth, loc, mat, rot=rot, vertices=vertices, radius2=radius2, bevel=bevel)
        self.parts.append(obj)
        return obj

    def muzzle(self, y, z=0.0):
        self.muzzle_y = y
        self.muzzle_z = z

    # ────────── 手枪 ──────────
    def pistol(self):
        st = self.cfg['style']
        scale = 1.0
        if st == 'deagle':
            scale = 1.2
        b = self.b
        c = self.c
        M = self.mats
        dark = M['dark']
        metal = M['metal']
        poly = M['polymer']
        L = 0.24 * scale
        # 套筒 / 枪管
        b('Slide', (0.052 * scale, L, 0.062 * scale), (0, -L / 2 - 0.02, 0.042 * scale), metal, bevel=0.006)
        b('Frame', (0.046 * scale, L * 0.9, 0.045 * scale), (0, -L / 2 - 0.02, -0.008), dark, bevel=0.004)
        c('Barrel', 0.012 * scale, 0.045 * scale, (0, -L - 0.01, 0.042 * scale), metal, axis='y', vertices=14)
        # 握把
        b('Grip', (0.05 * scale, 0.075 * scale, 0.14 * scale), (0, 0.035, -0.075 * scale), poly,
          rot=(-0.24, 0, 0), bevel=0.008)
        b('Backstrap', (0.052 * scale, 0.012 * scale, 0.13 * scale), (0, 0.075, -0.075 * scale), dark,
          rot=(-0.24, 0, 0), bevel=0.004)
        b('TriggerGuard', (0.012, 0.085 * scale, 0.012), (0, -0.02, -0.05 * scale), dark, bevel=0.003)
        b('Trigger', (0.008, 0.012, 0.03), (0, -0.015, -0.03), metal, rot=(0.3, 0, 0), bevel=0.002)
        # 瞄具
        b('RearSight', (0.04 * scale, 0.012, 0.012), (0, 0.02, 0.08 * scale), dark, bevel=0.002)
        b('FrontSight', (0.008, 0.012, 0.012), (0, -L - 0.02, 0.08 * scale), dark, bevel=0.002)
        if self.cfg['style'] in ('glock', 'm9', 'deagle'):
            b('Rail', (0.03, L * 0.6, 0.012), (0, -L / 2 - 0.02, -0.033), dark, bevel=0.002)
        if self.cfg['style'] == 'glock':
            b('SlideCut', (0.054 * scale, 0.04, 0.064 * scale), (0, -L * 0.7, 0.042 * scale), dark, bevel=0.002)
        self.muzzle(-L - 0.035, 0.042 * scale)

    # ────────── 冲锋枪 ──────────
    def smg(self):
        st = self.cfg['style']
        M = self.mats
        body = M['tan'] if self.cfg.get('tan') else M['metal']
        poly = M['polymer']
        dark = M['dark']
        b = self.b
        c = self.c
        # 机匣
        b('Receiver', (0.062, 0.34, 0.085), (0, 0.02, 0.01), body, bevel=0.006)
        b('Upper', (0.055, 0.30, 0.03), (0, 0.01, 0.065), dark, bevel=0.004)
        if st == 'pp19':
            c('DrumMag', 0.055, 0.12, (0, -0.13, -0.06), dark, axis='x', vertices=20)
            b('DrumGuard', (0.135, 0.14, 0.06), (0, -0.13, -0.06), poly, bevel=0.012)
        else:
            b('Mag', (0.038, 0.17, 0.065), (0, -0.07, -0.1), dark, rot=(-0.12, 0, 0), bevel=0.004)
        b('Grip', (0.046, 0.085, 0.13), (0, 0.1, -0.08), poly, rot=(-0.2, 0, 0), bevel=0.008)
        b('TriggerGuard', (0.014, 0.1, 0.014), (0, 0.02, -0.05), dark, bevel=0.003)
        # 护木 / 枪管
        b('Handguard', (0.052, 0.18, 0.065), (0, -0.23, 0.01), poly if st != 'mp5' else dark, bevel=0.008)
        c('Barrel', 0.013, 0.2, (0, -0.4, 0.012), M['metal'], axis='y', vertices=14)
        c('MuzzleDev', 0.02, 0.055, (0, -0.51, 0.012), dark, axis='y', vertices=14)
        # 折叠/伸缩枪托
        if st in ('mp5', 'ump'):
            b('Stock', (0.05, 0.22, 0.075), (0, 0.3, 0.0), poly, bevel=0.01)
            b('StockArm', (0.012, 0.2, 0.012), (0.03, 0.22, 0.01), dark, bevel=0.003)
            b('StockArm', (0.012, 0.2, 0.012), (-0.03, 0.22, 0.01), dark, bevel=0.003)
        else:
            b('StockRod', (0.012, 0.2, 0.012), (0.035, 0.26, 0.02), dark, bevel=0.003)
            b('StockRod', (0.012, 0.2, 0.012), (-0.035, 0.26, 0.02), dark, bevel=0.003)
            b('StockPad', (0.08, 0.02, 0.09), (0, 0.37, 0.02), dark, bevel=0.005)
        # 导轨与红点
        b('Rail', (0.028, 0.2, 0.012), (0, 0.02, 0.085), dark, bevel=0.002)
        c('RedDot', 0.021, 0.09, (0, -0.02, 0.115), dark, axis='y', vertices=12)
        c('Lens', 0.016, 0.004, (0, -0.068, 0.115), M['glass'], axis='y', vertices=12)
        c('Lens', 0.016, 0.004, (0, 0.027, 0.115), M['glass'], axis='y', vertices=12)
        self.muzzle(-0.54, 0.012)

    # ────────── 步枪 ──────────
    def rifle(self):
        st = self.cfg['style']
        M = self.mats
        wood = self.cfg.get('wood', False)
        b = self.b
        c = self.c
        furn = M['wood'] if wood else M['polymer']
        body = M['metal']
        dark = M['dark']
        # 机匣
        b('Receiver', (0.062, 0.36, 0.095), (0, 0.01, 0.02), body, bevel=0.006)
        b('DustCover', (0.056, 0.24, 0.03), (0, 0.0, 0.082), dark, bevel=0.004)
        # 护木 / 枪管
        b('Handguard', (0.058, 0.26 if st != 'sks' else 0.3, 0.07),
          (0, -0.31 if st != 'sks' else -0.34, 0.015), furn, bevel=0.01)
        c('Barrel', 0.014, 0.38, (0, -0.58, 0.03), M['metal'], axis='y', vertices=14)
        c('MuzzleDev', 0.019, 0.06, (0, -0.78, 0.03), dark, axis='y', vertices=14)
        b('GasTube', (0.02, 0.24, 0.02), (0, -0.3, 0.07), body, bevel=0.004)
        b('FrontSightBlock', (0.026, 0.035, 0.055), (0, -0.72, 0.065), dark, bevel=0.004)
        # 弹匣
        b('MagWell', (0.04, 0.1, 0.05), (0, -0.1, -0.045), dark, bevel=0.004)
        for i in range(2):
            b(f'Mag{i}', (0.038, 0.11, 0.06), (0, -0.12 - i * 0.075, -0.11 - i * 0.035),
              furn if st == 'sks' else dark, rot=(-0.18 - i * 0.22, 0, 0), bevel=0.006)
        # 握把
        b('Grip', (0.045, 0.085, 0.14), (0, 0.13, -0.08), furn if st == 'sks' else M['polymer'],
          rot=(-0.22, 0, 0), bevel=0.008)
        b('TriggerGuard', (0.014, 0.11, 0.014), (0, 0.03, -0.055), dark, bevel=0.003)
        # 枪托
        if st == 'sks':
            b('Stock', (0.055, 0.36, 0.11), (0, 0.34, -0.015), furn, rot=(0.06, 0, 0), bevel=0.015)
        elif st == 'ak':
            b('Stock', (0.05, 0.28, 0.09), (0, 0.32, 0.0), furn, bevel=0.012)
            b('StockPlate', (0.052, 0.02, 0.095), (0, 0.46, 0.0), dark, bevel=0.004)
        else:
            b('BufferTube', (0.032, 0.18, 0.032), (0, 0.3, 0.03), dark, bevel=0.004)
            b('Stock', (0.052, 0.2, 0.09), (0, 0.44, 0.015), furn, bevel=0.012)
        # 导轨 / 瞄具
        b('Rail', (0.03, 0.18, 0.012), (0, 0.02, 0.1), dark, bevel=0.002)
        if st in ('m4',):
            c('OpticTube', 0.026, 0.1, (0, 0.0, 0.135), dark, axis='y', vertices=14)
            c('OpticLens', 0.022, 0.004, (0, -0.052, 0.135), M['glass'], axis='y', vertices=14)
            b('OpticMount', (0.03, 0.06, 0.03), (0, 0.0, 0.112), dark, bevel=0.004)
        else:
            b('RearSight', (0.028, 0.02, 0.035), (0, 0.1, 0.115), dark, bevel=0.003)
            b('FrontSight', (0.01, 0.02, 0.045), (0, -0.52, 0.12), dark, bevel=0.003)
        self.muzzle(-0.82, 0.03)

    # ────────── 霰弹枪 ──────────
    def shotgun(self):
        st = self.cfg['style']
        M = self.mats
        b = self.b
        c = self.c
        furn = M['wood'] if self.cfg.get('wood') else M['polymer']
        # 机匣
        b('Receiver', (0.066, 0.32, 0.1), (0, 0.02, 0.02), M['metal'], bevel=0.006)
        b('Bolt', (0.05, 0.12, 0.03), (0.04, 0.02, 0.06), M['dark'], bevel=0.004)
        # 枪管与弹管
        c('Barrel', 0.019, 0.55, (0, -0.52, 0.04), M['metal'], axis='y', vertices=16)
        c('MagTube', 0.015, 0.42, (0, -0.45, -0.015), M['dark'], axis='y', vertices=14)
        c('MuzzleDev', 0.024, 0.05, (0, -0.81, 0.04), M['dark'], axis='y', vertices=14)
        # 护木 / 泵
        b('Pump', (0.06, 0.2, 0.07), (0, -0.35, 0.005), furn, bevel=0.012)
        if st == 'saiga':
            b('Mag', (0.04, 0.12, 0.1), (0, -0.12, -0.1), M['dark'], rot=(-0.15, 0, 0), bevel=0.006)
        # 握把与枪托
        b('Grip', (0.045, 0.085, 0.14), (0, 0.16, -0.08), furn, rot=(-0.22, 0, 0), bevel=0.008)
        b('Stock', (0.052, 0.3, 0.1), (0, 0.37, 0.0), furn, bevel=0.014)
        b('StockPad', (0.054, 0.02, 0.105), (0, 0.53, 0.0), M['dark'], bevel=0.004)
        b('TriggerGuard', (0.014, 0.1, 0.014), (0, 0.05, -0.06), M['dark'], bevel=0.003)
        # 瞄具
        b('RearSight', (0.03, 0.02, 0.03), (0, 0.13, 0.09), M['dark'], bevel=0.003)
        b('FrontSight', (0.012, 0.02, 0.04), (0, -0.74, 0.1), M['dark'], bevel=0.003)
        self.muzzle(-0.845, 0.04)

    # ────────── 狙击步枪 ──────────
    def sniper(self):
        st = self.cfg['style']
        M = self.mats
        b = self.b
        c = self.c
        furn = M['wood'] if self.cfg.get('wood') else M['tan']
        # 机匣
        b('Receiver', (0.055, 0.36, 0.085), (0, 0.0, 0.02), M['metal'], bevel=0.005)
        # 长枪管
        c('Barrel', 0.014, 0.78, (0, -0.62, 0.03), M['metal'], axis='y', vertices=14)
        c('MuzzleDev', 0.02, 0.06, (0, -1.03, 0.03), M['dark'], axis='y', vertices=12)
        b('Handguard', (0.05, 0.28, 0.06), (0, -0.28, 0.01), furn, bevel=0.01)
        # 枪托
        b('Stock', (0.055, 0.36, 0.13), (0, 0.36, -0.01), furn, rot=(0.07, 0, 0), bevel=0.014)
        b('CheekRest', (0.05, 0.16, 0.04), (0, 0.3, 0.075), furn, bevel=0.012)
        b('Grip', (0.045, 0.085, 0.13), (0, 0.15, -0.08), M['polymer'], rot=(-0.22, 0, 0), bevel=0.008)
        b('TriggerGuard', (0.014, 0.1, 0.014), (0, 0.04, -0.055), M['dark'], bevel=0.003)
        b('Mag', (0.036, 0.1, 0.07), (0, -0.08, -0.06), M['dark'], bevel=0.004)
        # 瞄准镜
        c('ScopeTube', 0.032, 0.26, (0, 0.02, 0.135), M['dark'], axis='y', vertices=16)
        c('ScopeObjectives', 0.041, 0.06, (0, -0.12, 0.135), M['dark'], axis='y', vertices=16)
        c('ScopeLens', 0.036, 0.004, (0, -0.152, 0.135), M['glass'], axis='y', vertices=16)
        b('ScopeMount', (0.03, 0.12, 0.04), (0, 0.02, 0.105), M['dark'], bevel=0.004)
        # 两脚架
        b('BipodL', (0.01, 0.14, 0.01), (-0.04, -0.58, -0.06), M['dark'], rot=(0.5, 0, 0.25), bevel=0.002)
        b('BipodR', (0.01, 0.14, 0.01), (0.04, -0.58, -0.06), M['dark'], rot=(0.5, 0, -0.25), bevel=0.002)
        self.muzzle(-1.065, 0.03)

    def hands(self, mode='rifle'):
        """第一人称手套与袖口，让外部武器模型不像浮空。"""
        M = self.mats
        b = self.b
        c = self.c
        if mode == 'pistol':
            # 右手握把，左手辅助
            b('HandR', (0.06, 0.085, 0.09), (0.012, 0.04, -0.075), M['glove'], rot=(-0.2, 0, 0), bevel=0.02)
            b('ThumbR', (0.028, 0.05, 0.035), (-0.035, 0.03, -0.06), M['glove'], rot=(0, 0, 0.3), bevel=0.01)
            b('HandL', (0.05, 0.07, 0.07), (-0.04, 0.02, -0.07), M['glove'], rot=(-0.15, 0, 0.2), bevel=0.018)
            c('SleeveR', 0.04, 0.16, (0.05, 0.16, -0.16), M['sleeve'], axis='y', vertices=12)
            c('SleeveL', 0.04, 0.14, (-0.06, 0.13, -0.15), M['sleeve'], axis='y', vertices=12)
        else:
            b('HandR', (0.06, 0.09, 0.085), (0.015, 0.12, -0.075), M['glove'], rot=(-0.22, 0, 0), bevel=0.02)
            b('ThumbR', (0.026, 0.05, 0.035), (-0.03, 0.1, -0.05), M['glove'], rot=(0.2, 0, 0.25), bevel=0.01)
            c('SleeveR', 0.042, 0.2, (0.06, 0.24, -0.12), M['sleeve'], axis='y', vertices=12)
            b('HandL', (0.065, 0.1, 0.075), (0, -0.3, -0.035), M['glove'], rot=(-0.1, 0, 0), bevel=0.02)
            b('ThumbL', (0.028, 0.05, 0.03), (0.04, -0.29, -0.005), M['glove'], rot=(0, 0, -0.3), bevel=0.01)
            c('SleeveL', 0.04, 0.22, (-0.03, -0.15, -0.075), M['sleeve'], axis='y', vertices=12)

    def details(self, mode='rifle'):
        """导轨分段、螺丝、快慢机、背带环等细节。"""
        M = self.mats
        b = self.b
        c = self.c
        if mode == 'rifle':
            for i in range(7):
                b('RailSeg', (0.03, 0.018, 0.014), (0, 0.06 - i * 0.045, 0.108), M['dark'], bevel=0.002)
            for sx in (-1, 1):
                b('SlingLoop', (0.012, 0.03, 0.04), (sx * 0.035, 0.44, -0.03), M['metal'], bevel=0.003)
            b('Selector', (0.012, 0.05, 0.012), (0.036, 0.08, 0.055), M['metal'], rot=(0, 0, 0.4), bevel=0.002)
            b('EjectionPort', (0.006, 0.06, 0.025), (0.034, 0.02, 0.06), M['dark'], bevel=0.002)
            for i in range(3):
                b('Screw', (0.014, 0.014, 0.014), (-0.026 + i * 0.026, 0.15, 0.045), M['metal'], bevel=0.002)
        elif mode == 'smg':
            for i in range(5):
                b('RailSeg', (0.028, 0.016, 0.012), (0, 0.04 - i * 0.04, 0.095), M['dark'], bevel=0.002)
            b('SlingLoop', (0.01, 0.025, 0.035), (0.032, 0.3, -0.01), M['metal'], bevel=0.003)
            b('MagRib', (0.042, 0.012, 0.01), (0, -0.07, -0.135), M['metal'], bevel=0.002)
        elif mode == 'pistol':
            b('SlingLoop', (0.01, 0.02, 0.03), (0, 0.09, -0.13), M['metal'], bevel=0.002)
            b('Screw', (0.012, 0.012, 0.012), (0.02, -0.06, 0.02), M['metal'], bevel=0.002)
        elif mode == 'shotgun':
            for i in range(3):
                b('PumpRib', (0.062, 0.014, 0.012), (0, -0.3 - i * 0.06, 0.05), M['dark'], bevel=0.002)
            b('SlingLoop', (0.012, 0.03, 0.04), (0.04, 0.45, -0.02), M['metal'], bevel=0.003)
        elif mode == 'sniper':
            for i in range(4):
                b('ScopeRing', (0.07, 0.02, 0.012), (0, 0.02 - 0.06 + i * 0.04, 0.135), M['metal'], bevel=0.002)
            b('SlingLoop', (0.012, 0.03, 0.04), (0.04, 0.45, -0.03), M['metal'], bevel=0.003)
            b('Bolt', (0.02, 0.12, 0.02), (0.045, 0.04, 0.05), M['metal'], bevel=0.004)

    def build(self):
        fam = self.cfg['family']
        getattr(self, fam)()
        self.hands('pistol' if fam == 'pistol' else 'rifle')
        self.details(fam if fam != 'rifle' else 'rifle')
        return self.parts


def build_actions(root):
    scene = bpy.context.scene
    root.rotation_mode = 'XYZ'

    def act(name, frames, keys, loop=True):
        root.animation_data_create()
        action = new_action(root, name)
        scene.frame_start = 0
        scene.frame_end = frames
        for frame, loc, rot in keys:
            root.location = loc
            root.rotation_euler = Euler((math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])), 'XYZ')
            root.keyframe_insert(data_path='location', frame=frame)
            root.keyframe_insert(data_path='rotation_euler', frame=frame)
        finish_action(root)
        action.use_fake_user = True

    act('Idle', 96, [
        (0, (0, 0, 0), (0, 0.4, 0.3)),
        (48, (0.002, 0, 0.001), (0.3, -0.4, -0.4)),
        (96, (0, 0, 0), (0, 0.4, 0.3)),
    ])
    act('Aim', 48, [
        (0, (0, -0.01, 0.006), (-0.9, 0, 0)),
        (24, (0, -0.012, 0.006), (-1.1, 0.2, 0.1)),
        (48, (0, -0.01, 0.006), (-0.9, 0, 0)),
    ])
    act('Fire', 4, [
        (0, (0, 0, 0), (0, 0, 0)),
        (1, (0, 0.025, 0.004), (2.4, 0, 0)),
        (4, (0, 0, 0), (0, 0, 0)),
    ], loop=False)
    act('Reload', 42, [
        (0, (0, 0, 0), (0, 0, 0)),
        (10, (0, 0, -0.03), (18, 0, 8)),
        (26, (0, 0.01, -0.04), (24, 0, 14)),
        (42, (0, 0, 0), (0, 0, 0)),
    ], loop=False)
    root.animation_data.action = bpy.data.actions['Idle']


def build_weapon(weapon_id):
    cfg = WEAPONS[weapon_id]
    reset_scene()
    ensure_dirs()
    mats = materials()
    gun = GunBuilder(cfg, mats)
    parts = gun.build()

    root = bpy.data.objects.new('weaponRoot', None)
    bpy.context.collection.objects.link(root)
    for p in parts:
        p.parent = root

    muzzle = bpy.data.objects.new('muzzle', None)
    bpy.context.collection.objects.link(muzzle)
    muzzle.parent = root
    muzzle.location = (0, gun.muzzle_y, gun.muzzle_z)

    # 合并网格减少 draw call（保留材质槽）
    merged = join_objects(parts, 'WeaponMesh')
    if merged:
        merged.parent = root
        shade_smooth(merged)

    build_actions(root)

    out = os.path.join(MODELS_DIR, f'weapon_{weapon_id[2:]}.glb')
    export_glb(out, [root, merged, muzzle], animations=True)
    try:
        render_preview(os.path.join(PREVIEW_DIR, 'weapon_' + weapon_id + '.png'),
                       target=(0, 0, 0), distance=1.6, height=0.6, resolution=700)
    except Exception as e:
        print('[warn] preview failed:', e)
    print('[done]', weapon_id, out)


def main():
    args = sys.argv
    selected = []
    if '--' in args:
        selected = args[args.index('--') + 1:]
    ids = selected if selected else list(WEAPONS.keys())
    for wid in ids:
        if wid not in WEAPONS:
            print('[skip] unknown weapon', wid)
            continue
        try:
            build_weapon(wid)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print('[error]', wid, e)


if __name__ == '__main__':
    main()
