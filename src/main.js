// ═══════════════════════════════════════════════════
// 主控：场景 / 战局生命周期 / 输入 / 射击结算
// ═══════════════════════════════════════════════════

import * as THREE from 'three';
import { MAPS, ITEMS } from './data.js';
import {
  loadSave, persistSave, createNewSave, applyRaidResult,
} from './save.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { World } from './world.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { createItem } from './inventory.js';
import { AssetManager } from './assets.js';
import { mulberry32, seedFromNow, clamp, formatTime } from './util.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from '../vendor/jsm/postprocessing/SMAAPass.js';
import { SSAOPass } from '../vendor/jsm/postprocessing/SSAOPass.js';

// 电影感调色 + 轻微色散 / 锐化 / 暗角 / 颗粒
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.38 },
    grain: { value: 0.02 },
    saturation: { value: 1.08 },
    contrast: { value: 1.055 },
    sharpen: { value: 0.35 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float grain;
    uniform float saturation;
    uniform float contrast;
    uniform float sharpen;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 texel = 1.0 / resolution;
      vec2 dir = uv - 0.5;
      float edge = dot(dir, dir);

      // 轻微色散
      vec4 color = texture2D(tDiffuse, uv);
      color.r = texture2D(tDiffuse, uv + dir * 0.0018 * edge).r;
      color.b = texture2D(tDiffuse, uv - dir * 0.0018 * edge).b;

      // 对比度锐化
      vec3 blur = (
        texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb +
        texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb +
        texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb
      ) * 0.25;
      color.rgb += (color.rgb - blur) * sharpen;

      color.rgb = (color.rgb - 0.5) * contrast + 0.5;
      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(luma), color.rgb, saturation);
      // 冷暗部 / 暖高光
      color.rgb += vec3(-0.004, 0.002, 0.014) * (1.0 - luma);
      color.rgb += vec3(0.012, 0.006, -0.004) * luma;

      float vig = smoothstep(0.95, 0.25, length(dir));
      color.rgb *= mix(1.0, vig, vignette) * 1.04;

      float n = hash(uv * resolution + fract(time) * 60.0);
      color.rgb += (n - 0.5) * grain;

      gl_FragColor = vec4(color.rgb, 1.0);
    }
  `,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.save = loadSave();
    this.audio = new AudioSys();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.autoUpdate = true;
    this.assets = new AssetManager(this.renderer);
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.outputPass = null;
    this.gradePass = null;
    this.smaaPass = null;
    this.ssaoPass = null;
    this.setupPostFX();
    this.assetsReady = false;

    this.scene = null;
    this.camera = null;
    this.world = null;
    this.player = null;
    this.enemies = [];
    this.effects = null;
    this.map = null;
    this.raycaster = new THREE.Raycaster();

    this.state = 'menu';
    this.paused = false;
    this.overlayKind = null;
    this.wantLock = false;
    this.debugMode = false;
    this.elapsed = 0;
    this.raidTimeLeft = 0;
    this.extractProgress = 0;
    this._inExtract = false;
    this.deathTimer = 0;
    this.killsThisRaid = 0;
    this.interactTarget = null;
    this.lastMapId = 'factory';

    this.input = {
      keys: new Set(),
      mouse: { left: false, right: false },
      firePressed: false,
      mouseDX: 0,
      mouseDY: 0,
    };

    this.clock = new THREE.Clock();
    this.ui = new UI(this);
    this.bindEvents();
    this.ui.showScreen('menu');
    this.ui.showLoading('正在初始化材质与动画资产管线…');

    this.animate();
    window.__game = this;
    this.boot();
  }

  async boot() {
    try {
      await this.assets.loadAll((progress, label) => this.ui.setLoading(progress, label));
    } catch (e) {
      console.warn('资产管线初始化异常，已回退到程序化资产：', e);
      this.assets.errors.push(String(e && e.message ? e.message : e));
    }
    this.assetsReady = true;
    this.ui.setLoading(1, this.assets.hasExternalAssets() ? '外部资产加载完成' : '程序化材质与动画就绪');
    await new Promise((resolve) => setTimeout(resolve, 420));
    this.ui.hideLoading();
    this.applyDebugRoutes(new URLSearchParams(window.location.search));
    if (this.assets.errors.length) {
      console.warn('部分外部资产未加载：', this.assets.errors);
    }
  }

  applyDebugRoutes(params) {
    const auto = params.get('autostart');
    if (auto && MAPS[auto]) {
      this.debugMode = true;
      this.ui.showScreen('menu');
      setTimeout(() => this.startRaid(auto, true), 80);
      return;
    }
    const screen = params.get('screen');
    if (screen === 'prep' || screen === 'trader') {
      setTimeout(() => {
        this.ui.renderMenu();
        this.openScreen(screen);
        if (screen === 'prep' && params.get('select') === '1') {
          setTimeout(() => {
            const grid = this.ui.gridMap.get('stash');
            if (grid && grid.items[0]) this.ui.selectPrepItem('stash', grid.items[0].item.uid);
          }, 250);
        }
      }, 120);
    } else if (screen === 'result') {
      setTimeout(() => {
        this.ui.showResult({
          success: true, reason: 'extracted', mapName: '军港集装箱区', kills: 4, time: 632,
          gained: [
            { id: 'val_gpu', stack: 1 }, { id: 'a_556_ap', stack: 42 },
            { id: 'w_ak74', stack: 1 }, { id: 'med_bandage', stack: 3 },
          ],
          lost: [],
        });
        this.state = 'result';
        this.ui.showScreen('result');
      }, 150);
    } else if (screen === 'help') {
      setTimeout(() => { this.ui.renderMenu(); this.ui.showHelp(); }, 120);
    } else if (screen === 'announcement') {
      setTimeout(() => { this.ui.renderMenu(); this.ui.showAnnouncement(); }, 120);
    }
  }

  // ═══════════════ 渲染后期 ═══════════════

  setupPostFX() {
    try {
      const size = new THREE.Vector2();
      this.renderer.getSize(size);
      const pr = this.renderer.getPixelRatio();
      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      this.renderPass = renderPass;
      composer.addPass(renderPass);

      const ssao = new SSAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), size.x * pr, size.y * pr, 24);
      ssao.kernelRadius = 10;
      ssao.minDistance = 0.0008;
      ssao.maxDistance = 0.09;
      ssao.output = SSAOPass.OUTPUT.Default;
      this.ssaoPass = ssao;
      composer.addPass(ssao);

      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.5, 0.86);
      this.bloomPass = bloom;
      composer.addPass(bloom);

      this.outputPass = new OutputPass();
      composer.addPass(this.outputPass);

      const grade = new ShaderPass(GradeShader);
      grade.uniforms.resolution.value.set(size.x * pr, size.y * pr);
      this.gradePass = grade;
      composer.addPass(grade);

      const smaa = new SMAAPass(size.x * pr, size.y * pr);
      this.smaaPass = smaa;
      composer.addPass(smaa);

      this.composer = composer;
    } catch (e) {
      console.warn('后期渲染初始化失败，使用直接渲染：', e);
      this.composer = null;
    }
  }

  resizePostFX(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    if (this.gradePass) this.gradePass.uniforms.resolution.value.set(w * pr, h * pr);
    if (this.ssaoPass && this.camera) this.ssaoPass.setSize(w * pr, h * pr);
  }

  renderFrame() {
    if (this.composer && this.renderPass && this.renderPass.scene && this.scene && this.camera) {
      if (this.gradePass) this.gradePass.uniforms.time.value = this.elapsed;
      this.composer.render();
      return;
    }
    if (this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  // ═══════════════ 事件 ═══════════════

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.resizePostFX(window.innerWidth, window.innerHeight);
      if (this.camera) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }
    });

    window.addEventListener('pointerdown', () => this.audio.init(), { once: true });

    document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());

    this.canvas.addEventListener('click', () => {
      if (this.debugMode) return;
      if (this.state === 'raid' && !this.overlayKind && !this.paused && !document.pointerLockElement) {
        this.requestLock();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.input.keys.delete(e.code));

    window.addEventListener('mousedown', (e) => {
      if (this.state !== 'raid' || this.paused || this.overlayKind) return;
      const locked = document.pointerLockElement === this.canvas || this.debugMode;
      if (!locked) return;
      if (this.debugMode && e.target !== this.canvas) return;
      if (e.button === 0) {
        this.input.mouse.left = true;
        this.input.firePressed = true;
      } else if (e.button === 2) {
        this.input.mouse.right = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.mouse.left = false;
      if (e.button === 2) this.input.mouse.right = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (this.state !== 'raid' || this.paused || this.overlayKind) return;
      this.input.mouseDX += e.movementX || 0;
      this.input.mouseDY += e.movementY || 0;
    });

    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInput();
    });

    window.addEventListener('error', (e) => {
      const el = document.getElementById('boot-error');
      if (!el) return;
      el.classList.remove('hidden');
      el.innerHTML = `<h2>运行出错了</h2>${e.message || '未知错误'}\n\n${(e.error && e.error.stack) || ''}`;
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled rejection:', e.reason);
    });
  }

  onKeyDown(e) {
    const code = e.code;
    if (code === 'Tab') e.preventDefault();
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(code)) e.preventDefault();

    // 公告 / 帮助页优先关闭
    if (code === 'Escape' && !this.ui.refs.announcement.classList.contains('hidden')) {
      this.ui.hideAnnouncement();
      e.preventDefault();
      return;
    }
    if (code === 'Escape' && !this.ui.refs.help.classList.contains('hidden')) {
      this.ui.hideHelp();
      e.preventDefault();
      return;
    }

    // 基地仓库中取消物品选择
    if (code === 'Escape' && this.state !== 'raid' && this.ui.selectedItem) {
      this.ui.clearDetail();
      e.preventDefault();
      return;
    }

    if (this.state !== 'raid') return;

    if (code === 'Escape') {
      if (this.overlayKind) {
        this.closeOverlay();
      } else if (this.paused) {
        this.resumeGame();
      }
      return;
    }

    if (this.paused) return;

    this.input.keys.add(code);

    if (code === 'Tab') {
      if (this.overlayKind) this.closeOverlay();
      else this.openOverlay('inventory');
      return;
    }

    if (this.overlayKind) return;

    const player = this.player;
    if (!player || !player.alive) return;

    if (code === 'KeyF') this.interact();
    else if (code === 'KeyR') player.startReload();
    else if (code === 'Digit1') player.switchWeapon('primary');
    else if (code === 'Digit2') player.switchWeapon('secondary');
    else if (code === 'Digit3') player.useMed('kit');
    else if (code === 'Digit4') player.useMed('bandage');
  }

  clearInput() {
    this.input.keys.clear();
    this.input.mouse.left = false;
    this.input.mouse.right = false;
    this.input.firePressed = false;
    this.input.mouseDX = 0;
    this.input.mouseDY = 0;
  }

  handlePointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) {
      this.paused = false;
      this.ui.hidePause();
      this.ui.hideClickPrompt();
    } else if (this.state === 'raid' && !this.overlayKind && this.wantLock && !this.debugMode) {
      this.paused = true;
      this.clearInput();
      this.ui.showPause();
    }
  }

  requestLock() {
    if (this.debugMode) {
      this.paused = false;
      return;
    }
    if (document.pointerLockElement === this.canvas) {
      this.paused = false;
      return;
    }
    this.wantLock = true;
    this.paused = true;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (err) { /* ignore */ }
    clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => {
      if (this.state === 'raid' && !this.overlayKind && document.pointerLockElement !== this.canvas) {
        this.paused = true;
        this.ui.showClickPrompt();
      }
    }, 750);
  }

  resumeGame() {
    if (this.state !== 'raid') return;
    this.ui.hidePause();
    this.ui.hideClickPrompt();
    this.requestLock();
  }

  // ═══════════════ 界面流转 ═══════════════

  openScreen(name) {
    if (this.state === 'raid' || this.state === 'dying') return;
    this.state = 'menu';
    this.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.setHUDVisible(false);
    this.ui.hideOverlays();
    this.ui.hidePause();
    this.ui.hideClickPrompt();
    this.ui.hideHelp();
    this.ui.hideAnnouncement();
    this.ui.setScope(false);
    this.ui.desktop = true;
    this.audio.init();

    if (name === 'prep') {
      this.selectedMap = this.ui.selectedMap;
      this.ui.refreshPrep();
      this.ui.showScreen('prep');
    } else if (name === 'trader') {
      this.ui.refreshTrader();
      this.ui.showScreen('trader');
    } else {
      this.ui.renderMenu();
      this.ui.showScreen('menu');
    }
  }

  resetSave() {
    this.save = createNewSave();
    persistSave(this.save);
    this.ui.renderMenu();
    this.ui.toast('存档已重置', 'good');
  }

  saveGame() {
    persistSave(this.save);
  }

  setSensitivity(v) {
    if (!this.save.settings) this.save.settings = {};
    this.save.settings.sensitivity = v;
    this.saveGame();
  }

  openOverlay(kind, container = null) {
    if (this.state !== 'raid' || this.overlayKind || this.paused) return;
    this.overlayKind = kind;
    this.wantLock = false;
    this.clearInput();
    this.ui.setPrompt(null);
    this.ui.setScope(false);
    this.ui.hideClickPrompt();
    if (document.pointerLockElement) document.exitPointerLock();
    if (kind === 'loot' && container) this.ui.showLoot(container);
    else this.ui.showInventory();
  }

  closeOverlay() {
    if (!this.overlayKind) return;
    this.overlayKind = null;
    this.ui.hideOverlays();
    this.ui.setHUDVisible(true);
    this.wantLock = true;
    if (this.debugMode) {
      this.paused = false;
      return;
    }
    this.paused = true;
    this.requestLock();
  }

  // ═══════════════ 战局 ═══════════════

  startRaid(mapId, auto = false) {
    if (this.state === 'raid' || this.state === 'dying') return;
    if (!MAPS[mapId]) return;
    if (auto) this.debugMode = true;
    this.audio.init();

    this.ui.hideScreens();
    this.ui.hideOverlays();
    this.ui.hidePause();
    this.ui.hideClickPrompt();
    this.ui.hideHelp();
    this.ui._cache = {};
    this.ui.reserveTimer = 0;
    this.ui.setScope(false);

    this.lastMapId = mapId;
    this.map = MAPS[mapId];
    this.state = 'raid';
    this.paused = !this.debugMode;
    this.overlayKind = null;
    this.killsThisRaid = 0;
    this.extractProgress = 0;
    this._inExtract = false;
    this.deathTimer = 0;
    this.interactTarget = null;
    this.elapsed = 0;
    this.raidTimeLeft = this.map.timer;

    // 场景
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 420);
    if (this.renderPass) {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
    }
    if (this.ssaoPass) {
      this.ssaoPass.scene = this.scene;
      this.ssaoPass.camera = this.camera;
      const pr = this.renderer.getPixelRatio();
      this.ssaoPass.setSize(window.innerWidth * pr, window.innerHeight * pr);
    }
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const seed = seedFromNow();
    this.rng = mulberry32(seed);
    this.world = new World(this.scene, mapId, seed, this.assets);
    this.effects = new Effects(this.scene);

    // 玩家出生点
    const q = new URLSearchParams(window.location.search);
    let spawnIdx = Math.floor(Math.random() * this.map.spawns.length);
    if (this.debugMode && q.has('spawn')) {
      spawnIdx = clamp(parseInt(q.get('spawn'), 10) || 0, 0, this.map.spawns.length - 1);
    }
    const spawnBase = this.map.spawns[spawnIdx];
    const spawn = this.world.findFlatSpawnPosition ? this.world.findFlatSpawnPosition(spawnBase.x, spawnBase.z) : this.world.nearestFreePosition(spawnBase.x, spawnBase.z);

    // 调试：指定初始主武器，便于检查枪械模型
    if (this.debugMode && q.has('weapon')) {
      const wid = q.get('weapon');
      const wdef = ITEMS[wid];
      if (wdef && wdef.type === 'weapon') {
        this.save.equipment.primary = createItem(wid, { rounds: wdef.magSize });
      }
    }

    this.player = new Player(this, this.world, this.save.equipment, this.save.secure, spawn);
    if (this.debugMode && q.has('yaw')) {
      this.player.yaw += ((parseFloat(q.get('yaw')) || 0) * Math.PI) / 180;
      this.player.applyCamera(0);
    }

    // 敌人：资源点守卫 + 巡逻队
    this.enemies = [];
    const types = [];
    for (const cfg of this.map.enemies) {
      for (let i = 0; i < cfg.count; i++) types.push(cfg.type);
    }
    const remaining = types.slice();
    const requests = [];
    const used = [];
    const tooClose = (x, z, min = 3.2) => used.some((u) => Math.hypot(u.x - x, u.z - z) < min);
    const addRequest = (type, p, role, baseFacing) => {
      let x = p.x;
      let z = p.z;
      if (tooClose(x, z)) {
        const q = this.world.nearestFreePosition(x + 4.5, z + 4.5);
        x = q.x; z = q.z;
      }
      used.push({ x, z });
      requests.push({ type, x, z, role, baseFacing });
    };

    const zones = [...this.world.zones].sort((a, b) => (a.tier === 'high' ? 0 : 1) - (b.tier === 'high' ? 0 : 1));
    // 首领驻守最高价值资源点
    const bossIdx = remaining.indexOf('boss');
    if (bossIdx >= 0 && zones.length) {
      const zone = zones.find((z) => z.tier === 'high') || zones[0];
      const p = this.world.zoneGuardSpot(zone);
      const facing = Math.atan2(p.x - zone.x, p.z - zone.z);
      addRequest('boss', p, 'guard', facing);
      remaining.splice(bossIdx, 1);
    }
    // 每个高价值区域至少一名守卫，中价值区域半数有守卫
    for (const zone of zones) {
      if (!remaining.length) break;
      if (zone.tier !== 'high' && Math.random() > 0.5) continue;
      let idx = zone.tier === 'high' ? remaining.indexOf('raider') : -1;
      if (idx < 0) idx = remaining.findIndex((t) => t !== 'boss');
      if (idx < 0) break;
      const type = remaining[idx];
      const p = this.world.zoneGuardSpot(zone);
      const facing = Math.atan2(p.x - zone.x, p.z - zone.z);
      addRequest(type, p, 'guard', facing);
      remaining.splice(idx, 1);
    }
    // 剩余敌人：一半巡逻队，一半固定哨位
    const spots = this.world.pickEnemySpawns(remaining.length, { x: spawn.x, z: spawn.z });
    const patrolCount = Math.ceil(remaining.length * 0.5);
    remaining.forEach((type, i) => {
      const s = spots[i] || { x: spawn.x + 15 + i, z: spawn.z + 15 };
      const patrol = i < patrolCount;
      addRequest(type, s, patrol ? 'patrol' : 'guard', Math.atan2(-s.x, -s.z));
    });

    for (const r of requests) {
      this.enemies.push(new Enemy(this, this.world, r.type, r.x, r.z, {
        role: r.role, baseFacing: r.baseFacing,
      }));
    }
    this.currentZone = null;
    this.zoneNotifyTimer = 0;

    // 调试：把玩家传送到敌人面前，检查模型与战斗表现
    if (this.debugMode && q.get('ui') === 'encounter' && this.enemies.length) {
      const e = this.enemies[0];
      const near = this.world.nearestFreePosition(e.pos.x + 7, e.pos.z + 7);
      this.player.pos.set(near.x, 0, near.z);
      this.player.yaw = Math.atan2(-(e.pos.x - near.x), -(e.pos.z - near.z));
      e.facing = Math.atan2(near.x - e.pos.x, near.z - e.pos.z);
      e.state = 'combat';
      e.aimTimer = 3;
      this.player.applyCamera(0);
    }

    this.ui.setRaidInfo(this.map);
    this.ui.setHUDVisible(true);
    this.ui.setPrompt(null);
    this.ui.setExtractProgress(null);
    this.ui.setMedProgress(null);
    this.ui.updateHUD(0.016);

    this.audio.ambientStart(this.map.theme);
    this.ui.log(`行动开始 · ${this.map.name}`, 'gold');
    this.ui.log('寻找战利品，在倒计时结束前抵达撤离点。', '');
    this.ui.toast('撤离点已标记在罗盘上', 'good');

    this.clearInput();
    if (!this.debugMode) this.requestLock();

    // 调试：直接打开界面做视觉验证
    if (this.debugMode) {
      const uiParam = q.get('ui');
      if (uiParam === 'loot') {
        setTimeout(() => {
          const c = this.world && this.world.containers.find((x) => !x.invisible);
          if (c) { c.open(); this.openOverlay('loot', c); }
        }, 700);
      } else if (uiParam === 'inventory') {
        setTimeout(() => this.openOverlay('inventory'), 700);
      } else if (uiParam === 'pause') {
        setTimeout(() => { this.paused = true; this.ui.showPause(); }, 700);
      } else if (uiParam === 'help') {
        setTimeout(() => this.ui.showHelp(), 700);
      }
    }
  }

  updateRaid(dt) {
    if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.player.update(dt, this.input);
      this.world.update(dt, (this.elapsed += dt));
      if (this.world.updateGrass) this.world.updateGrass(this.player.pos.x, this.player.pos.z);
      if (this.world.updateSky) this.world.updateSky(this.camera.position);
      for (const e of this.enemies) e.update(dt);
      this.effects.update(dt);
      this.ui.updateHUD(dt);
      if (this.deathTimer <= 0) this.endRaid(false, 'killed');
      return;
    }
    if (this.state !== 'raid') return;
    if (this.paused) return;

    this.raidTimeLeft -= dt;
    if (this.raidTimeLeft <= 0) {
      this.raidTimeLeft = 0;
      this.ui.updateHUD(dt);
      this.endRaid(false, 'missing');
      return;
    }

    this.elapsed += dt;

    if (!this.overlayKind) {
      this.player.update(dt, this.input);
      if (this.state !== 'raid') return; // 可能在更新中死亡
    } else {
      this.player.tickPassive(dt);
      this.input.mouseDX = 0;
      this.input.mouseDY = 0;
      this.input.firePressed = false;
    }

    this.world.update(dt, this.elapsed);
    if (this.world.updateGrass) this.world.updateGrass(this.player.pos.x, this.player.pos.z);
    if (this.world.updateSky) this.world.updateSky(this.camera.position);
    for (const e of this.enemies) e.update(dt);
    this.updateZoneNotification(dt);
    this.effects.update(dt);
    this.ui.updateHUD(dt);

    if (!this.overlayKind) {
      this.updateInteraction();
      this.checkExtraction(dt);
    } else {
      this.checkExtraction(0);
    }
  }

  updateZoneNotification(dt) {
    if (!this.world || !this.player) return;
    this.zoneNotifyTimer = (this.zoneNotifyTimer || 0) - dt;
    if (this.zoneNotifyTimer > 0) return;
    this.zoneNotifyTimer = 0.7;
    const zone = this.world.zoneAt(this.player.pos.x, this.player.pos.z);
    if (zone === this.currentZone) return;
    this.currentZone = zone;
    if (zone) {
      const tierName = zone.tier === 'high' ? '高价值' : zone.tier === 'mid' ? '中价值' : '低价值';
      this.ui.log(`进入${tierName}资源点：${zone.name}`, zone.tier === 'high' ? 'gold' : '');
    }
  }

  updateInteraction() {
    const p = this.player;
    if (!p || !p.alive) {
      this.interactTarget = null;
      this.ui.setPrompt(null);
      return;
    }
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const c = this.world.findNearestContainer(p.pos.x, p.pos.z, 2.8, { x: fx, z: fz });
    this.interactTarget = c;
    if (c) {
      this.ui.setPrompt(c.isBody ? c.name : '搜索 ' + c.name);
    } else {
      this.ui.setPrompt(null);
    }
  }

  interact() {
    if (this.state !== 'raid' || this.overlayKind || this.paused) return;
    const c = this.interactTarget;
    if (!c) return;
    if (!c.opened) {
      c.open();
      this.audio.uiClick();
    }
    this.ui.setPrompt(null);
    this.openOverlay('loot', c);
  }

  checkExtraction(dt) {
    const p = this.player;
    if (!p || !p.alive) return;
    const ex = this.world.isInsideExtract(p.pos.x, p.pos.z);
    if (ex && !this.overlayKind) {
      if (!this._inExtract) {
        this._inExtract = true;
        this.audio.extractStart();
        this.ui.log(`进入撤离区域：${ex.name}`, 'good');
      }
      this.extractProgress += dt;
      const need = this.map.extractTime;
      this.ui.setExtractProgress(this.extractProgress / need, `撤离 · ${ex.name}`);
      if (this.extractProgress >= need) {
        this.endRaid(true, 'extracted');
      }
    } else {
      if (this._inExtract) {
        this._inExtract = false;
        if (this.extractProgress > 0) this.ui.log('撤离中断', 'bad');
      }
      this.extractProgress = 0;
      this.ui.setExtractProgress(null);
    }
  }

  // ═══════════════ 战斗结算 ═══════════════

  emitNoise(pos, radius, type) {
    for (const e of this.enemies) {
      if (e.alive) e.hearNoise(pos, radius, type);
    }
  }

  handleShot({ origin, dirs, weaponDef, ammoDef, weaponItem, muzzlePos }) {
    const targets = [...this.world.hittables];
    for (const e of this.enemies) {
      if (e.alive) targets.push(...e.hitMeshes);
    }
    for (const dir of dirs) {
      this.raycaster.set(origin, dir);
      this.raycaster.far = 350;
      const hits = this.raycaster.intersectObjects(targets, true);
      let endPoint;
      if (hits.length) {
        const hit = hits[0];
        endPoint = hit.point.clone();
        const enemy = hit.object.userData.enemy;
        if (enemy && enemy.alive) {
          enemy.takeDamage(ammoDef.damage, hit.object.userData.part, ammoDef, hit.point);
        } else {
          let normal = null;
          if (hit.face) {
            normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          }
          this.effects.impact(hit.point, normal);
        }
      } else {
        endPoint = origin.clone().addScaledVector(dir, 260);
      }
      this.effects.tracer(muzzlePos, endPoint, 0xffcc88, 0.9);
    }

    this.effects.muzzleFlash(muzzlePos, 1);
    this.audio.shoot(weaponDef.cls);
  }

  onEnemyHit(enemy, damage, headshot, hitPoint) {
    this.ui.hitmarker(headshot, false);
    this.audio.hitFlesh();
    if (headshot) this.audio.headshot();
    if (hitPoint) this.effects.blood(hitPoint);
  }

  onEnemyKilled(enemy) {
    this.killsThisRaid++;
    this.ui.hitmarker(false, true);
    this.audio.hitmarker(true);
    this.ui.log(`击杀 ${enemy.def.name}`, 'good');
    const pos = enemy.pos;
    this.world.spawnBody(
      pos.x + (Math.random() - 0.5) * 0.3,
      pos.z + (Math.random() - 0.5) * 0.3,
      enemy.def.name,
      enemy.def.lootTable,
      enemy.typeId
    );
  }

  onPlayerDeath() {
    if (this.state !== 'raid') return;
    this.state = 'dying';
    this.deathTimer = 1.7;
    this.overlayKind = null;
    this.ui.hideOverlays();
    this.ui.setHUDVisible(true);
    this.ui.setScope(false);
    this.ui.setPrompt(null);
    this.ui.setMedProgress(null);
    this.ui.setExtractProgress(null);
    this.audio.fail();
    this.ui.log('你倒在了灰区…', 'bad');
    this.ui.damageFlash(1, 'thorax');
    this.clearInput();
  }

  abandonRaid() {
    if (this.state !== 'raid') return;
    this.overlayKind = null;
    this.ui.hideOverlays();
    this.endRaid(false, 'abandoned');
  }

  endRaid(success, reason) {
    if (this.state !== 'raid' && this.state !== 'dying') return;
    const usedTime = this.map.timer - this.raidTimeLeft;
    const mapName = this.map.name;
    const kills = this.killsThisRaid;
    this.state = 'result';
    this.overlayKind = null;
    this.paused = false;
    this.wantLock = false;
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();

    this.ui.hideOverlays();
    this.ui.hidePause();
    this.ui.hideClickPrompt();
    this.ui.hideHelp();
    this.ui.setScope(false);
    this.ui.setHUDVisible(false);
    this.ui.setPrompt(null);
    this.ui.setExtractProgress(null);
    this.ui.setMedProgress(null);

    this.audio.ambientStop();
    if (success) {
      this.audio.success();
      this.ui.log('撤离成功', 'good');
    } else {
      this.audio.fail();
    }

    const summary = applyRaidResult(this.save, { success, kills, reason });
    persistSave(this.save);

    const resultData = {
      success,
      reason,
      mapName,
      kills,
      time: usedTime,
      gained: summary.gained,
      lost: summary.lost,
    };

    this.ui.showResult(resultData);
    this.ui.showScreen('result');
    this.cleanupRaid();
    this.ui.renderMenu();
  }

  cleanupRaid() {
    if (this.player) {
      if (this.player.vmGroup) {
        this.player.vmGroup.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) m.dispose();
          }
        });
      }
      this.player = null;
    }
    if (this.effects) {
      this.effects.dispose();
      this.effects = null;
    }
    this.enemies = [];
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    if (this.camera && this.camera.parent) {
      this.camera.parent.remove(this.camera);
    }
    this.camera = null;
    this.scene = null;
    this.map = null;
    this.interactTarget = null;
  }

  // ═══════════════ 主循环 ═══════════════

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'raid' || this.state === 'dying') {
      this.updateRaid(dt);
    }
    this.renderFrame();
  }
}

// 启动
try {
  const game = new Game();
  if (!(new URLSearchParams(window.location.search)).get('autostart')) {
    game.ui.showScreen('menu');
  }
} catch (err) {
  console.error(err);
  const el = document.getElementById('boot-error');
  if (el) {
    el.classList.remove('hidden');
    el.innerHTML = `<h2>游戏启动失败</h2>${err.message}\n\n${err.stack || ''}`;
  }
}
