# 外部美术资产接入说明

游戏默认使用**Blender 程序化生成的 GLB 角色 + 运行时程序化资产**，无需任何外部商业文件即可运行。若你拥有商业级 GLB / PBR 贴图，可通过本目录**无需改代码**接入，AssetManager 会自动加载并替换对应模型/材质；加载失败或无配置时自动回退到程序化模型。

## 目录结构

```
assets/
├── manifest.json          # 运行时资产清单（已配置 Blender 角色）
├── manifest.example.json  # 带示例字段的清单
├── models/                # Blender 生成的角色 GLB（enemy_scav/raider/boss、operator）
└── textures/              # PBR 贴图组
```

## 生成内置模型

默认资产均由 `tools/blender/` 下的脚本生成，详见 [../tools/blender/README.md](../tools/blender/README.md)。

```bash
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_characters.py
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_weapons.py
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_gear.py
"C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b -P tools/blender/build_props.py
```

`manifest.json` 当前包含 `enemies`（含 Vanguard 商用角色）、`weapons`（15 把）、`gear`（18 件）、`props`（8 个容器）与 18 组世界 `textureSets`。

## 第三方素材与许可

- `models/character_vanguard.glb`：来自 three.js 示例的 Mixamo Vanguard 角色，Mixamo 免费许可；详见 `models/CREDITS.md`。
- `textures/*.jpg`：来自 Poly Haven 的 CC0 PBR 贴图；详见 `textures/CREDITS-PolyHaven.md`。
- 其余 GLB 由 `tools/blender` 程序化生成。

## 加载流程

1. 游戏启动时进入加载界面；
2. 读取 `assets/manifest.json`（不存在或为空则使用程序化资产）；
3. 并行加载敌人 GLB、武器 GLB、PBR 贴图组；
4. 单个资产失败只记录警告并回退，不阻塞启动；
5. 加载完成后隐藏加载界面。

## 敌人模型（enemies）

```json
"scav": {
  "model": "assets/models/enemy_scav.glb",
  "targetHeight": 1.82,
  "rotationY": 3.14159,
  "weaponSocket": "mixamorig:RightHand",
  "weaponScale": 0.42,
  "weaponOffset": [0, 0.02, 0.05],
  "tint": 15724402,
  "clips": { "idle": "Idle", "walk": "Walk", "run": "Run", "aim": "Aim", "fire": "Fire", "death": "Death" }
}
```

- `targetHeight`：自动等比缩放到该身高；`rotationY`：让模型朝向游戏 +Z 前方。
- `weaponSocket`：右手骨骼名；找不到时自动挂到模型根节点。
- 未提供 `clips` 时会按 `/idle|walk|run|aim|fire|shoot|death|die/i` 自动匹配动画剪辑名。
- 外部模型的命中部位按命中高度自动判断头/躯干/腿部，因此没有单独骨骼碰撞也能部位判定。

## 第一人称武器（weapons）

```json
"w_ak74": {
  "model": "assets/models/weapon_ak74.glb",
  "position": [0.28, -0.26, -0.65],
  "rotation": [0, 0, 0],
  "scale": 1,
  "muzzle": "muzzle",
  "clips": { "idle": "Idle", "aim": "Aim", "fire": "Fire", "reload": "Reload" }
}
```

- `muzzle` 为枪口节点名，曳光弹与枪口焰会从该节点生成。
- `aim` 片段用于开镜状态，`fire` / `reload` 以一次性动画播放并自动回到 idle/aim。

## PBR 贴图组（textureSets）

支持 `albedo / normal / roughness / metalness / ao / emissive`，albedo/emissive 会按 sRGB 处理，其余为线性；支持 `repeat`、`roughnessValue`、`metalnessValue`、`color`。

按主题命名可自动替换世界材质：

- `工厂_wall`、`森林_wall`、`军港_wall`、`雪原_wall`、`农田_wall`、`城区_wall`
- `工厂_ground`、`森林_ground`、`军港_ground`、`雪原_ground`、`农田_ground`、`城区_ground`
- `工厂_rock`、`森林_rock`、`军港_rock`、`雪原_rock`、`农田_rock`、`城区_rock`

其中主题使用英文：`factory / forest / port / snow / farm / city`。例如：

```json
"textureSets": {
  "factory_wall": { "albedo": "assets/textures/factory_wall_albedo.jpg", "normal": "assets/textures/factory_wall_normal.jpg", "repeat": [2, 2] }
}
```

## 性能建议

- 敌人模型建议 ≤ 30k 三角面，骨骼 ≤ 65；4K 贴图仅用于近景，其余建议 1K–2K。
- 武器模型建议 ≤ 20k 三角面；贴图 1K 足够。
- GLB 采用 Draco 压缩时，请同时提供解压脚本（当前 GLTFLoader 未启用 Draco 解码器）。
- 动画建议统一为秒制、同一骨架，剪辑命名参考示例。

## 没有外部资产时

全部回退到程序化模型、程序化迷彩/防弹衣/植被/地形材质，并启用天空 PMREM 环境反射与细节法线贴图。加载界面仍会正常显示进度。
