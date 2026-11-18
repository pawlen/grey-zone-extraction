// ═══════════════════════════════════════════════════
// 程序化音效（WebAudio，无需外部音频文件）
// ═══════════════════════════════════════════════════

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambientNodes = null;
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this._makeNoiseBuffer(2.0);
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      console.warn('音频初始化失败', e);
    }
  }

  _makeNoiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _now() { return this.ctx.currentTime; }

  _noise(dur, { freq = 3000, q = 0.7, gain = 0.5, type = 'lowpass', attack = 0.002, pan = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this._now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = src.connect(filter).connect(g);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  _tone(freqA, freqB, dur, { gain = 0.2, type = 'sine', delay = 0, curve = 'exp' } = {}) {
    if (!this.ctx) return;
    const t0 = this._now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqB), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(freqB, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  shoot(cls = 'rifle', pan = 0) {
    if (!this.ctx) return;
    const profiles = {
      pistol: { n: 0.11, f: 3600, g: 0.4, thump: 110, td: 0.12, tg: 0.3 },
      smg: { n: 0.08, f: 4200, g: 0.36, thump: 120, td: 0.09, tg: 0.24 },
      rifle: { n: 0.15, f: 2900, g: 0.5, thump: 80, td: 0.16, tg: 0.34 },
      sniper: { n: 0.3, f: 2100, g: 0.6, thump: 62, td: 0.28, tg: 0.42 },
      shotgun: { n: 0.24, f: 1700, g: 0.6, thump: 54, td: 0.22, tg: 0.42 },
    };
    const p = profiles[cls] || profiles.rifle;
    this._noise(p.n, { freq: p.f, gain: p.g, pan });
    this._tone(p.thump, p.thump * 0.45, p.td, { gain: p.tg, type: 'sine' });
    // 机械声
    this._noise(0.035, { freq: 5200, gain: 0.07, type: 'highpass', pan, delay: 0.01 });
  }

  enemyShoot(distance = 20, pan = 0) {
    if (!this.ctx) return;
    const att = Math.max(0.08, 1 - distance / 120);
    this._noise(0.18, { freq: 1400, gain: 0.22 * att, pan });
    this._tone(70, 40, 0.18, { gain: 0.18 * att, type: 'sine' });
  }

  dryFire() {
    this._noise(0.03, { freq: 2400, gain: 0.12, type: 'bandpass', q: 3 });
    this._tone(1600, 1200, 0.02, { gain: 0.05, type: 'square' });
  }

  reload() {
    this._noise(0.05, { freq: 1800, gain: 0.15, type: 'bandpass', q: 2 });
    this._noise(0.05, { freq: 2600, gain: 0.12, type: 'bandpass', q: 2, delay: 0.28 });
  }

  reloadDone() {
    this._noise(0.06, { freq: 3200, gain: 0.16, type: 'bandpass', q: 2 });
    this._tone(900, 600, 0.05, { gain: 0.06, type: 'triangle' });
  }

  hitFlesh() {
    this._noise(0.09, { freq: 420, gain: 0.28 });
    this._tone(120, 60, 0.1, { gain: 0.14, type: 'sine' });
  }

  hitmarker(kill = false) {
    this._tone(kill ? 1500 : 1050, kill ? 1050 : 900, 0.05, { gain: kill ? 0.14 : 0.08, type: 'triangle' });
    if (kill) this._tone(2000, 1600, 0.09, { gain: 0.09, type: 'triangle', delay: 0.05 });
  }

  headshot() {
    this._tone(2400, 1800, 0.07, { gain: 0.16, type: 'square' });
  }

  hurt() {
    this._noise(0.15, { freq: 600, gain: 0.25 });
    this._tone(90, 50, 0.22, { gain: 0.2, type: 'sine' });
  }

  footstep(vol = 1) {
    if (!this.ctx) return;
    this._noise(0.055, { freq: 380 + Math.random() * 160, gain: 0.06 * vol, type: 'lowpass' });
  }

  pickup() {
    this._tone(700, 980, 0.06, { gain: 0.07, type: 'triangle' });
    this._noise(0.04, { freq: 3000, gain: 0.05, type: 'bandpass', q: 2 });
  }

  uiClick() {
    this._tone(1400, 1100, 0.03, { gain: 0.045, type: 'triangle' });
  }

  medUse() {
    this._noise(0.4, { freq: 1400, gain: 0.05, type: 'bandpass', q: 1.5 });
  }

  medDone() {
    this._tone(600, 900, 0.12, { gain: 0.07, type: 'sine' });
  }

  extractStart() {
    this._tone(330, 440, 0.7, { gain: 0.06, type: 'sine' });
    this._tone(494, 660, 0.7, { gain: 0.04, type: 'sine', delay: 0.1 });
  }

  success() {
    this._tone(523, 523, 0.22, { gain: 0.12, type: 'sine' });
    this._tone(659, 659, 0.22, { gain: 0.11, type: 'sine', delay: 0.18 });
    this._tone(784, 784, 0.4, { gain: 0.12, type: 'sine', delay: 0.36 });
    this._tone(1046, 1046, 0.5, { gain: 0.06, type: 'triangle', delay: 0.54 });
  }

  fail() {
    this._tone(220, 160, 0.5, { gain: 0.14, type: 'sawtooth' });
    this._tone(146, 98, 0.9, { gain: 0.12, type: 'sine', delay: 0.15 });
    this._noise(0.5, { freq: 500, gain: 0.08 });
  }

  ambientStart(theme = 'factory') {
    if (!this.ctx || this.ambientNodes) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme === 'forest' ? 420 : theme === 'port' ? 260 : 180;
    filter.Q.value = 0.4;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.linearRampToValueAtTime(0.05, this._now() + 1.6);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambientNodes = { src, gain, filter };
  }

  ambientStop() {
    if (!this.ambientNodes) return;
    const { src, gain } = this.ambientNodes;
    this.ambientNodes = null;
    try {
      gain.gain.cancelScheduledValues(this._now());
      gain.gain.setValueAtTime(gain.gain.value, this._now());
      gain.gain.linearRampToValueAtTime(0.0001, this._now() + 0.8);
      src.stop(this._now() + 0.9);
    } catch (e) { /* ignore */ }
  }
}
