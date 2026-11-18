# ═══════════════════════════════════════════════════
# Blender 资产管线通用模块
# 在 Blender headless 模式下运行：blender -b -P xxx.py
# 生成网格 / PBR 材质 / 骨骼 / 动画并导出 GLB
# ═══════════════════════════════════════════════════

import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Vector, Euler, Quaternion, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS_DIR = os.path.join(ROOT, 'assets', 'models')
TEXTURES_DIR = os.path.join(ROOT, 'assets', 'textures')
PREVIEW_DIR = os.path.join(ROOT, 'shots', 'blender')


def ensure_dirs():
    for d in (MODELS_DIR, TEXTURES_DIR, PREVIEW_DIR):
        os.makedirs(d, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 24
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0


def set_active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def shade_smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def apply_modifiers(obj):
    set_active(obj)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as e:
            print(f'[warn] apply {mod.name} on {obj.name}: {e}')


def add_bevel(obj, width=0.01, segments=2, angle=math.radians(45)):
    if width <= 0:
        return
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = angle
    apply_modifiers(obj)


def add_subsurf(obj, levels=2, render_levels=None):
    mod = obj.modifiers.new('Subsurf', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = render_levels if render_levels is not None else levels
    apply_modifiers(obj)


def box(name, size, loc, mat=None, rot=(0, 0, 0), bevel=0.0, bevel_segments=2, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        add_bevel(obj, bevel, bevel_segments)
    if smooth:
        shade_smooth(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def cylinder(name, radius, depth, loc, mat=None, rot=(0, 0, 0), vertices=24, bevel=0.0,
             smooth=True, radius2=None):
    if radius2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=vertices,
                                            location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=radius2, radius2=radius, depth=depth,
                                        vertices=vertices, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    if bevel > 0:
        add_bevel(obj, bevel, 2)
    if smooth:
        shade_smooth(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def sphere(name, radius, loc, mat=None, scale=(1, 1, 1), rot=(0, 0, 0), segments=24, rings=16, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=rings,
                                         location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if smooth:
        shade_smooth(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def torus(name, major, minor, loc, mat=None, rot=(0, 0, 0), major_segments=32, minor_segments=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=major_segments, minor_segments=minor_segments,
                                     location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    shade_smooth(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def join_objects(objs, name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def smart_uv(obj, angle=66.0, margin=0.02):
    set_active(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


# ─────────────── 程序化贴图 ───────────────

def srgb_to_linear(c):
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def srgb(rgb, a=1.0):
    """把 sRGB 目标色转换为 Blender/glTF 使用的线性色。"""
    return (srgb_to_linear(rgb[0]), srgb_to_linear(rgb[1]), srgb_to_linear(rgb[2]), a)


def _new_image(name, arr, srgb=True):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    # 必须先设置色彩空间再写像素：Blender 5.x 在写入后修改 colorspace 会清空像素缓冲。
    img.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    flat = np.ascontiguousarray(arr.astype(np.float32)).ravel()
    try:
        img.pixels.foreach_set(flat)
    except Exception:
        img.pixels[:] = flat.tolist()
    img.update()
    img.pack()
    return img


def make_camo_image(name, base_rgb, spot_colors, size=512, seed=7, fibers=True):
    rng = np.random.default_rng(seed)
    arr = np.ones((size, size, 4), dtype=np.float32)
    base = np.array(base_rgb, dtype=np.float32)
    arr[..., :3] = base
    yy, xx = np.ogrid[:size, :size]
    for _ in range(70):
        cx, cy = rng.integers(0, size, 2)
        rx, ry = rng.integers(size // 40, size // 7, 2)
        color = np.array(spot_colors[rng.integers(0, len(spot_colors))], dtype=np.float32)
        mask = ((xx - cx) ** 2 / (rx ** 2) + (yy - cy) ** 2 / (ry ** 2)) <= 1.0
        arr[..., :3][mask] = np.clip(color, 0, 1)
    if fibers:
        for y in range(0, size, 3):
            arr[y:y + 1, :, :3] *= 0.94
    noise = rng.normal(0, 0.025, (size, size, 1)).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 1)
    return _new_image(name, arr, srgb=True)


def make_roughness_image(name, size=256, base=0.8, variance=0.12, seed=11):
    rng = np.random.default_rng(seed)
    arr = np.ones((size, size, 4), dtype=np.float32)
    v = np.clip(base + rng.normal(0, variance, (size, size)), 0.05, 1.0)
    arr[..., 0] = v
    arr[..., 1] = v
    arr[..., 2] = v
    for y in range(0, size, 4):
        arr[y:y + 1, :, :3] *= 0.9
    return _new_image(name, arr, srgb=False)


def make_skin_image(name, skin_rgb, size=512, seed=13):
    rng = np.random.default_rng(seed)
    arr = np.ones((size, size, 4), dtype=np.float32)
    base = np.array(skin_rgb, dtype=np.float32)
    arr[..., :3] = base
    noise = rng.normal(0, 0.035, (size, size, 3)).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 1)
    return _new_image(name, arr, srgb=True)


def make_metal_image(name, metal_rgb, size=512, seed=17):
    rng = np.random.default_rng(seed)
    arr = np.ones((size, size, 4), dtype=np.float32)
    arr[..., :3] = np.array(metal_rgb, dtype=np.float32)
    noise = rng.normal(0, 0.02, (size, size, 3)).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 1)
    for _ in range(120):
        x, y = rng.integers(0, size, 2)
        w = rng.integers(4, 30)
        arr[y:y + 1, x:x + w, :3] *= 0.85
    return _new_image(name, arr, srgb=True)




def make_normal_from_height(name, height, strength=3.0):
    gy, gx = np.gradient(height)
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    arr = np.ones((height.shape[0], height.shape[1], 4), dtype=np.float32)
    arr[..., 0] = nx / length * 0.5 + 0.5
    arr[..., 1] = ny / length * 0.5 + 0.5
    arr[..., 2] = nz / length * 0.5 + 0.5
    return _new_image(name, arr, srgb=False)


def make_fabric_normal(name, size=512, seed=3, weave=0.22, folds=0.6):
    rng = np.random.default_rng(seed)
    x, y = np.meshgrid(np.arange(size), np.arange(size))
    h = np.sin(x * 0.9) * np.sin(y * 0.9) * weave
    h += np.sin(x * 0.07 + np.sin(y * 0.02) * 2.0) * folds * 0.4
    h += np.sin(y * 0.11 + np.cos(x * 0.03) * 1.5) * folds * 0.3
    h += rng.normal(0, 0.05, (size, size)).astype(np.float32)
    return make_normal_from_height(name, h.astype(np.float32), 2.4)


def make_leather_normal(name, size=512, seed=7):
    rng = np.random.default_rng(seed)
    x, y = np.meshgrid(np.arange(size), np.arange(size))
    h = np.sin(x * 0.25 + np.sin(y * 0.04) * 2.0) * 0.18
    h += np.sin(y * 0.31 + np.cos(x * 0.05) * 2.0) * 0.14
    h += rng.normal(0, 0.04, (size, size)).astype(np.float32)
    return make_normal_from_height(name, h.astype(np.float32), 2.0)


def make_brushed_normal(name, size=512, seed=11):
    rng = np.random.default_rng(seed)
    x, y = np.meshgrid(np.arange(size), np.arange(size))
    h = np.sin((x * 1.7 + y * 0.05)) * 0.08
    for _ in range(140):
        y0 = rng.integers(0, size)
        x0 = rng.integers(0, size)
        ln = rng.integers(20, 160)
        h[y0, x0:x0 + ln] += rng.normal(0, 0.5)
    h += rng.normal(0, 0.02, (size, size)).astype(np.float32)
    return make_normal_from_height(name, h.astype(np.float32), 1.4)


def make_wood_images(name, base_rgb, size=512, seed=13):
    rng = np.random.default_rng(seed)
    x, y = np.meshgrid(np.arange(size), np.arange(size))
    grain = np.sin(y * 0.09 + np.sin(x * 0.012) * 6.0) * 0.5 + 0.5
    grain = grain * 0.65 + 0.35
    arr = np.ones((size, size, 4), dtype=np.float32)
    base = np.array(base_rgb, dtype=np.float32)
    shade = (0.72 + grain * 0.45).astype(np.float32)
    arr[..., 0] = np.clip(base[0] * shade, 0, 1)
    arr[..., 1] = np.clip(base[1] * shade, 0, 1)
    arr[..., 2] = np.clip(base[2] * shade, 0, 1)
    knots = rng.integers(0, size, (10, 2))
    for kx, ky in knots:
        r = np.sqrt((x - kx) ** 2 + (y - ky) ** 2)
        ring = np.sin(r * 0.35) * np.exp(-r / 26.0) * 0.18
        arr[..., :3] *= (1.0 + ring[..., None])
    arr[..., :3] = np.clip(arr[..., :3] + rng.normal(0, 0.012, (size, size, 1)), 0, 1)
    albedo = _new_image(name + '_albedo', arr, srgb=True)
    height = (grain * 0.6 + np.sin(y * 0.8) * 0.12 + rng.normal(0, 0.02, (size, size))).astype(np.float32)
    normal = make_normal_from_height(name + '_normal', height, 1.8)
    return albedo, normal


# ─────────────── 材质 ───────────────

def make_material(name, color=(0.4, 0.4, 0.4, 1), roughness=0.8, metallic=0.0,
                  base_image=None, roughness_image=None, normal_image=None,
                  normal_strength=1.0, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if base_image is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = base_image
        tex.location = (-520, 260)
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if roughness_image is not None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = roughness_image
        tex.location = (-520, -20)
        links.new(tex.outputs['Color'], bsdf.inputs['Roughness'])
    if normal_image is not None:
        ntex = nodes.new('ShaderNodeTexImage')
        ntex.image = normal_image
        ntex.location = (-620, -260)
        nmap = nodes.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = normal_strength
        nmap.location = (-320, -260)
        links.new(ntex.outputs['Color'], nmap.inputs['Color'])
        links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = emission
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


# ─────────────── 骨骼 ───────────────

def create_armature(name, bones):
    """bones: list of dict(name, head, tail, parent, roll=0)"""
    data = bpy.data.armatures.new(name + 'Data')
    arm = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(arm)
    set_active(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    created = {}
    for spec in bones:
        b = data.edit_bones.new(spec['name'])
        b.head = Vector(spec['head'])
        b.tail = Vector(spec['tail'])
        b.roll = spec.get('roll', 0.0)
        if spec.get('parent'):
            b.parent = created[spec['parent']]
            b.use_connect = spec.get('connect', False)
        created[b.name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def auto_weights(mesh, arm):
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def add_armature_modifier(obj, arm, vertex_group=None):
    if vertex_group:
        vg = obj.vertex_groups.get(vertex_group) or obj.vertex_groups.new(name=vertex_group)
        vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    return mod


# ─────────────── 动画 ───────────────

def new_action(arm, name, fake_user=True):
    if arm.animation_data is None:
        arm.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = fake_user
    arm.animation_data.action = action
    return action


def pose_quat(arm, bone, rx=0.0, ry=0.0, rz=0.0):
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_quaternion()


def key_bone(arm, bone, frame, rx=0.0, ry=0.0, rz=0.0, loc=None):
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = Euler((math.radians(rx), math.radians(ry), math.radians(rz)), 'XYZ').to_quaternion()
    pb.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    if loc is not None:
        pb.location = Vector(loc)
        pb.keyframe_insert(data_path='location', frame=frame)


def iter_action_fcurves(action):
    """兼容 Blender 5.x slotted actions 与旧版 action.fcurves。"""
    try:
        return list(action.fcurves)
    except AttributeError:
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    curves.extend(bag.fcurves)
        return curves


def finish_action(arm, interpolation='BEZIER'):
    if arm.animation_data and arm.animation_data.action:
        for fc in iter_action_fcurves(arm.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = interpolation


def clear_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


# ─────────────── 导出 ───────────────

def export_glb(path, objects=None, animations=True):
    ensure_dirs()
    bpy.ops.object.select_all(action='DESELECT')
    if objects:
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
    kwargs = dict(
        filepath=path,
        export_format='GLB',
        use_selection=bool(objects),
        export_apply=True,
        export_yup=True,
        export_skins=True,
        export_animations=animations,
        export_animation_mode='ACTIONS',
        export_nla_strips=False,
        export_optimize_animation_size=False,
        export_force_sampling=True,
        export_frame_range=False,
        export_materials='EXPORT',
        export_image_format='WEBP',
        export_image_quality=88,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError as e:
        print('[warn] glTF 导出参数不兼容，回退到基础参数：', e)
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=bool(objects),
                                  export_skins=True, export_animations=animations)
    print('[export]', path)


def render_preview(path, target=(0, 0, 1.0), distance=4.0, height=1.6, resolution=600):
    """用 Workbench 快速渲染模型预览，便于检查比例与姿态。"""
    ensure_dirs()
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    try:
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'MATERIAL'
        scene.display.shading.show_shadows = True
    except Exception:
        pass
    cam_data = bpy.data.cameras.new('PreviewCam')
    cam = bpy.data.objects.new('PreviewCam', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (distance, -distance, height)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.resolution_x = resolution
    scene.render.resolution_y = int(resolution * 1.4)
    scene.render.film_transparent = False
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('[preview]', path)
