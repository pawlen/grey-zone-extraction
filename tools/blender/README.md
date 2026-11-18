# Blender 资产管线

用 Blender Python（bpy）程序化生成游戏角色、武器与道具，并导出可直接被游戏加载的 GLB。
不需要外部美术文件；所有网格、贴图、骨骼与动画都由脚本生成。

## 环境

- Blender 5.3（本机安装路径：`C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`）
- 无头运行，不需要打开界面

## 角色

```bash
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_characters.py
# 只生成某个变体
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_characters.py -- scav
```

输出：

| 文件 | 说明 |
| --- | --- |
| `assets/models/enemy_scav.glb` | 拾荒者 |
| `assets/models/enemy_raider.glb` | 掠夺者 |
| `assets/models/enemy_boss.glb` | 首领 |
| `assets/models/operator.glb` | 仓库干员（无战术护甲，供展示台换装） |

预览渲染写入 `shots/blender/<variant>.png`（Workbench 灰度预览，用于检查轮廓）。

### 骨架与动画

- 20 根骨骼：`Root / Hips / Spine / Chest / Neck / Head / ShoulderL|R / UpperArmL|R / LowerArmL|R / HandL|R / ThighL|R / ShinL|R / FootL|R`
- 武器挂点骨骼：`HandR`（manifest 的 `weaponSocket`）
- 动画剪辑：`Idle / Walk / Run / Aim / Fire / Death`

### 材质

- 迷彩布料、皮肤、金属头盔使用 numpy 生成的 PBR 贴图，打包进 GLB。
- 固有色材质使用 `srgb()` 把 sRGB 目标色转成 Blender/glTF 线性色。
- 注意：Blender 5.x 中修改 `Image.colorspace_settings` 会清空像素缓冲，必须先设置色彩空间再写 `pixels`（common.py 已处理）。

### 接入游戏

`assets/manifest.json` 的 `enemies` 下已配置：

```json
"scav": {
  "model": "assets/models/enemy_scav.glb",
  "targetHeight": 1.8,
  "rotationY": 0,
  "weaponSocket": "HandR",
  "weaponScale": 0.9,
  "weaponOffset": [0, 0.02, 0.04],
  "weaponRotation": [1.4, 0, 0],
  "clips": { "idle": "Idle", "walk": "Walk", "run": "Run", "aim": "Aim", "fire": "Fire", "death": "Death" }
}
```

- 删掉对应条目即可回退到内置的 `src/humanoid.js` 程序化角色。
- 蒙皮模型的包围盒由 `src/enemy.js` 手动合并几何包围盒计算，避免 Blender 骨骼节点导致缩放异常。

## 武器

```bash
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_weapons.py
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_weapons.py -- w_ak74 w_m9
```

- 输出 `assets/models/weapon_<slug>.glb`（15 把武器）
- 根节点 `weaponRoot`，枪口空节点 `muzzle`
- 动作：`Idle / Aim / Fire / Reload`（作用于 weaponRoot）
- 附带第一人称手套与袖口，manifest 中 `rotation` 为 `[0, 3.14159, 0]` 使枪口指向相机前方 `-Z`

## 装备

```bash
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_gear.py
```

- 输出 `assets/models/gear_<id>.glb`：5 头盔、7 护甲、3 弹挂、3 背包
- 坐标约定：头盔原点在头部中心；护甲/弹挂/背包原点在胸腔中心，正面为 -Y（导出后 +Z）
- manifest `gear` 条目指定 `attach`（Head/Chest）与 `offset`，展示台按骨骼挂载

## 场景道具

```bash
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_props.py
```

- 输出 `assets/models/prop_<id>.glb`：木箱、工具箱、武器箱、医疗箱、保险柜、储物柜、行李袋、弹药箱
- 原点在地面中心，正面 -Y；可开启容器带 `lidPivot` 铰链节点，游戏沿用开盖动画
- manifest `props` 条目按容器类型 ID 映射模型

## 文件

| 文件 | 说明 |
| --- | --- |
| `common.py` | 场景重置、参数化网格、材质/贴图、骨骼、动画、GLB 导出与预览渲染 |
| `build_characters.py` | 角色变体、装备与六段骨骼动画 |
| `build_weapons.py` | 第一人称武器、muzzle 节点与武器动作 |
| `build_gear.py` | 头盔 / 护甲 / 弹挂 / 背包 |
| `build_props.py` | 搜刮容器场景道具 |
