// 1인칭 시험판의 효과음. 소리 파일 없이 WebAudio로 그때그때 만든다.
// 브라우저 정책상 첫 클릭·터치·키 입력 뒤에 AudioContext를 만든다. M으로 끄고 켠다.

export type SfxName =
  | 'throw'
  | 'hit'
  | 'process'
  | 'ring'
  | 'fall'
  | 'boom'
  | 'pickup'
  | 'hurt'
  | 'special'
  | 'dash'
  | 'pop'
  | 'volley'
  | 'tick'
  | 'open';

const MUTE_KEY = 'staffsmash.fps.muted';

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** 사용자 입력 안에서 부른다 */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.32, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* 저장 못 해도 이번 판에는 적용된다 */
    }
    return this.muted;
  }

  /** vol: 0~1 (거리 감쇠는 부르는 쪽에서) */
  play(name: SfxName, vol = 1): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || this.muted || vol <= 0.02) return;
    // 같은 소리가 한 프레임에 겹쳐 커지지 않게
    const now = ctx.currentTime;
    const gap = name === 'hit' || name === 'throw' ? 0.045 : name === 'tick' ? 0.2 : 0.03;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const t = now + 0.005;
    switch (name) {
      case 'throw':
        this.noiseBurst(t, 0.16, 'bandpass', 2400, 900, 0.35 * vol, 2);
        break;
      case 'hit':
        this.tone(t, 'sine', 170, 70, 0.11, 0.55 * vol);
        this.noiseBurst(t, 0.05, 'highpass', 2000, 2000, 0.25 * vol);
        break;
      case 'process':
        this.tone(t, 'square', 220, 90, 0.12, 0.28 * vol);
        this.tone(t + 0.06, 'triangle', 880, 660, 0.12, 0.3 * vol);
        this.noiseBurst(t, 0.06, 'lowpass', 1600, 400, 0.3 * vol);
        break;
      case 'ring':
        for (let i = 0; i < 8; i++) this.tone(t + i * 0.05, 'square', i % 2 ? 1320 : 1580, 0, 0.045, 0.09 * vol);
        break;
      case 'fall':
        this.tone(t, 'sine', 1400, 380, 0.7, 0.16 * vol);
        break;
      case 'boom':
        this.noiseBurst(t, 0.7, 'lowpass', 1800, 90, 0.9 * vol);
        this.tone(t, 'sine', 90, 35, 0.6, 0.8 * vol);
        break;
      case 'pickup':
        [660, 880, 1320].forEach((f, i) => this.tone(t + i * 0.07, 'triangle', f, 0, 0.12, 0.35 * vol));
        break;
      case 'hurt':
        this.tone(t, 'sawtooth', 140, 80, 0.22, 0.3 * vol);
        this.noiseBurst(t, 0.12, 'lowpass', 900, 300, 0.3 * vol);
        break;
      case 'special':
        this.tone(t, 'sawtooth', 220, 880, 0.45, 0.22 * vol);
        [523, 659, 784, 1047].forEach((f) => this.tone(t + 0.35, 'triangle', f, 0, 0.6, 0.18 * vol));
        this.noiseBurst(t + 0.3, 0.6, 'bandpass', 3000, 600, 0.35 * vol, 1.5);
        break;
      case 'dash':
        this.noiseBurst(t, 0.35, 'bandpass', 500, 2600, 0.4 * vol, 3);
        break;
      case 'pop':
        this.tone(t, 'sine', 600, 1400, 0.08, 0.35 * vol);
        this.noiseBurst(t, 0.05, 'highpass', 3000, 3000, 0.2 * vol);
        break;
      case 'volley':
        this.noiseBurst(t, 0.3, 'bandpass', 1200, 3200, 0.35 * vol, 1.5);
        break;
      case 'tick':
        this.tone(t, 'square', 1900, 0, 0.03, 0.12 * vol);
        break;
      case 'open':
        [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.09, 'triangle', f, 0, 0.22, 0.3 * vol));
        break;
    }
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 > 0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master as GainNode);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master as GainNode);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
