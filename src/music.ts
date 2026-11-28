// 배경음악: 소리 파일 없이 WebAudio 발진기로 그때그때 연주한다 (악보는 src/musicTracks.ts).
// - 효과음(src/fps/audio.ts Sfx)과 같은 AudioContext를 쓰되, 크기는 따로 둔다 (기본 30%).
// - 25ms마다 앞으로 0.15초 치 음을 미리 예약한다 (lookahead 예약 방식이라 화면이 버벅여도 박자가 밀리지 않는다).
// - 어떤 곡을 틀지는 게임 쪽이 follow()로 넘긴 함수가 정한다. 곡이 바뀌면 0.8초 동안 겹쳐 바꾼다.
// - 소리 끔(M)이면 음을 만들지 않고 박자만 센다.

import type { Sfx } from './fps/audio';
import { SONGS, type Song, type TrackId } from './musicTracks';

export type { TrackId } from './musicTracks';

export interface MusicWant {
  /** 틀 곡 (null이면 끈다) */
  track: TrackId | null;
  /** 타이틀·결과 화면: 작게 */
  quiet: boolean;
  /** 일시정지 화면: 멈춘다 */
  paused: boolean;
}

const VOLUME_KEY = 'staffsmash.music.volume';
/** 사용자 결정(2026-11-21): 처음에는 작게 (30%) */
const DEFAULT_VOLUME = 0.3;
/** 배경음악 전체 크기 (설정 100%일 때) */
const MUSIC_GAIN = 0.5;
/** 타이틀·결과 화면에서 줄이는 비율 */
const QUIET = 0.5;
/** 곡을 겹쳐 바꾸는 시간 (초) */
const FADE = 0.8;
/** Boo 곡이 끝날 때(착지) 줄이는 시간 (초, PRD 결정 61) */
const BOO_FADE = 1.0;
/** 보스가 잠깐 비어도 곡을 바로 바꾸지 않는다 (초) */
const BOSS_HOLD = 1.2;
const AHEAD = 0.15;
const TICK_MS = 25;

type Voice = 'lead' | 'bass' | 'comp' | 'kick' | 'snare' | 'hat' | 'hatOpen';

interface Ev {
  v: Voice;
  /** 주파수들 (북은 비움) */
  f: number[];
  /** 길이 (16분음표 칸) */
  d: number;
  /** 세기 0~1 */
  a: number;
}

interface Compiled {
  song: Song;
  stepSec: number;
  steps: Ev[][];
}

interface Inst {
  id: TrackId;
  c: Compiled;
  bus: GainNode;
  leadF: AudioNode;
  bassF: AudioNode;
  step: number;
  next: number;
  /** 겹쳐 바꾸며 사라지는 중이면 끝나는 시각 */
  stopAt: number;
}

// ---------- 악보 읽기 ----------

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function pitchClass(name: string): number {
  const base = PC[name[0]];
  if (base === undefined) throw new Error(`음 이름을 못 읽음: ${name}`);
  const acc = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return (base + acc + 12) % 12;
}

function noteMidi(tok: string): number {
  const m = /^([A-G][#b]?)(\d)$/.exec(tok);
  if (!m) throw new Error(`음을 못 읽음: ${tok}`);
  const base = PC[m[1][0]] + (m[1][1] === '#' ? 1 : m[1][1] === 'b' ? -1 : 0);
  return 12 * (Number(m[2]) + 1) + base;
}

function chord(tok: string): { pc: number; ints: number[] } {
  const m = /^([A-G][#b]?)(.*)$/.exec(tok);
  const ints = m ? QUALITY[m[2]] : undefined;
  if (!m || !ints) throw new Error(`화음을 못 읽음: ${tok}`);
  return { pc: pitchClass(m[1]), ints };
}

function compile(song: Song): Compiled {
  const bars = song.lead.length;
  const total = bars * 16;
  const steps: Ev[][] = Array.from({ length: total }, () => []);
  // 가락
  for (let b = 0; b < bars; b++) {
    const toks = song.lead[b].trim().split(/\s+/);
    const per = 16 / toks.length;
    let last: Ev | null = null;
    toks.forEach((t, i) => {
      if (t === '-') {
        if (last) last.d += per;
        return;
      }
      if (t === '.') {
        last = null;
        return;
      }
      last = { v: 'lead', f: [hz(noteMidi(t))], d: per, a: 1 };
      steps[b * 16 + Math.round(i * per)].push(last);
    });
  }
  // 화음에서 나오는 베이스·반주
  for (let b = 0; b < bars; b++) {
    const list = song.chords[b % song.chords.length].trim().split(/\s+/).map(chord);
    const at = (s: number) => list[Math.min(list.length - 1, Math.floor((s * list.length) / 16))];
    for (const [s, deg, len] of song.bass) {
      const c = at(s);
      const root = 36 + c.pc;
      const off = deg === 'R' ? 0 : deg === '5' ? 7 : deg === '8' ? 12 : c.ints[1];
      steps[b * 16 + s].push({ v: 'bass', f: [hz(root + off)], d: len, a: s === 0 ? 1 : 0.8 });
    }
    const comp = song.comp;
    if (comp.kind === 'stab') {
      for (const s of comp.steps) {
        const c = at(s);
        let base = 48 + c.pc;
        if (base < 53) base += 12;
        steps[b * 16 + s].push({ v: 'comp', f: c.ints.map((i) => hz(base + i)), d: comp.len, a: 1 });
      }
    } else {
      const shape = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let s = 0; s < 16; s++) {
        const c = at(s);
        const tones = [c.ints[0], c.ints[1], c.ints[2], 12];
        const base = 12 * (comp.octave + 1) + c.pc - (c.pc >= 7 ? 12 : 0);
        steps[b * 16 + s].push({ v: 'comp', f: [hz(base + tones[shape[s % 8]])], d: 1, a: s % 4 === 0 ? 1 : 0.7 });
      }
    }
    // 북
    for (let s = 0; s < 16; s++) {
      const k = song.kick[s];
      if (k === 'x' || k === 'o') steps[b * 16 + s].push({ v: 'kick', f: [], d: 1, a: k === 'x' ? 1 : 0.6 });
      const n = song.snare[s];
      if (n === 'x' || n === 'o') steps[b * 16 + s].push({ v: 'snare', f: [], d: 1, a: n === 'x' ? 1 : 0.55 });
      const h = song.hat[s];
      if (h === 'x') steps[b * 16 + s].push({ v: 'hatOpen', f: [], d: 2, a: 1 });
      else if (h === 'o') steps[b * 16 + s].push({ v: 'hat', f: [], d: 1, a: s % 4 === 0 ? 1 : 0.7 });
    }
    // 마지막 마디 끝: 다음 바퀴로 넘어가는 작은 북 채움 (보스전만)
    if (song === SONGS.boss && b === bars - 1) {
      for (const s of [13, 14, 15]) steps[b * 16 + s].push({ v: 'snare', f: [], d: 1, a: 0.5 + (s - 13) * 0.2 });
    }
  }
  return { song, stepSec: 60 / song.bpm / 4, steps };
}

const COMPILED: Partial<Record<TrackId, Compiled>> = {};
function compiled(id: TrackId): Compiled {
  return (COMPILED[id] ??= compile(SONGS[id]));
}

// ---------- 연주 ----------

export class Music {
  /** 배경음악 크기 0~1 (효과음과 따로) */
  volume = DEFAULT_VOLUME;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private want: (() => MusicWant) | null = null;
  private insts: Inst[] = [];
  private cur: Inst | null = null;
  private duckLevel = -1;
  private paused = false;
  private bossOffAt = -1;
  private last: MusicWant = { track: null, quiet: false, paused: false };
  /** 지금까지 예약한 음 수 (디버그: 정말 연주되는지 본다) */
  private notes = 0;

  constructor(private readonly sfx: Sfx) {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v));
    } catch {
      /* 저장소를 못 쓰면 기본값 */
    }
    sfx.listen(() => this.attach());
  }

  /** 무엇을 틀지 정하는 함수를 넘긴다 (25ms마다 부른다) */
  follow(fn: () => MusicWant): void {
    this.want = fn;
    this.attach();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOLUME_KEY, String(Math.round(this.volume * 100) / 100));
    } catch {
      /* 저장 못 해도 이번 판에는 적용된다 */
    }
    this.refreshLevel();
  }

  /** 디버그용 상태 (?debug에서 window.__music.state) */
  get state(): object {
    const c = this.cur;
    return {
      ctx: this.ctx?.state ?? 'none',
      track: c?.id ?? null,
      title: c ? c.c.song.title : null,
      bpm: c?.c.song.bpm ?? 0,
      bar: c ? Math.floor(c.step / 16) + 1 : 0,
      step: c?.step ?? 0,
      quiet: this.last.quiet,
      paused: this.paused,
      volume: this.volume,
      muted: this.sfx.muted,
      level: this.level,
      playing: this.insts.map((i) => i.id + (i.stopAt > 0 ? '(사라지는 중)' : '')),
      notes: this.notes,
    };
  }

  private get level(): number {
    return this.sfx.muted ? 0 : MUSIC_GAIN * this.volume;
  }

  private refreshLevel(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.05);
  }

  /** 효과음 쪽 AudioContext가 생기면 붙는다. 소리 끔이 바뀌어도 여기로 온다 */
  private attach(): void {
    const ctx = this.sfx.context;
    if (ctx && !this.ctx) {
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.level;
      this.master.connect(ctx.destination);
      this.duck = ctx.createGain();
      this.duck.gain.value = 0;
      this.duck.connect(this.master);
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.refreshLevel();
    if (this.ctx && this.want && !this.timer) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const ctx = this.ctx;
    const duck = this.duck;
    if (!ctx || !duck || ctx.state !== 'running' || !this.want) return;
    const now = ctx.currentTime;
    const w = this.want();
    this.last = w;
    let target = w.track;
    // 보스 곡 → 보통 곡: 보스가 잠깐 비는 사이(중간보스 → 보스)에 곡이 오가지 않게 조금 기다린다
    // (Boo 곡은 기다리지 않고 바로 바꾼다)
    if (this.cur?.id === 'boss' && target !== 'boss' && target !== 'boo' && target !== null && !w.quiet) {
      if (this.bossOffAt < 0) this.bossOffAt = now;
      if (now - this.bossOffAt < BOSS_HOLD) target = 'boss';
    } else this.bossOffAt = -1;
    if (target !== (this.cur?.id ?? null)) this.switchTo(target, now);

    const lv = w.paused ? 0 : w.quiet ? QUIET : 1;
    if (lv !== this.duckLevel) {
      this.duckLevel = lv;
      duck.gain.setTargetAtTime(lv, now, lv === 0 ? 0.04 : 0.15);
    }
    if (w.paused !== this.paused) {
      this.paused = w.paused;
      // 다시 시작하면 멈췄던 자리부터 잇는다
      if (!w.paused) for (const i of this.insts) i.next = now + 0.06;
    }

    // 다 사라진 곡은 정리
    this.insts = this.insts.filter((i) => {
      if (i.stopAt < 0 || now < i.stopAt) return true;
      i.bus.disconnect();
      return false;
    });
    if (this.paused) return;
    const silent = this.level <= 0.0001;
    for (const i of this.insts) {
      // 화면이 오래 멈췄다 돌아오면 밀린 음은 건너뛴다
      if (i.next < now - 0.1) i.next = now + 0.05;
      const n = i.c.steps.length;
      while (i.next < now + AHEAD) {
        if (!silent) for (const e of i.c.steps[i.step]) this.play(i, e, i.next);
        i.step = (i.step + 1) % n;
        i.next += i.c.stepSec;
      }
    }
  }

  private switchTo(id: TrackId | null, now: number): void {
    const ctx = this.ctx as AudioContext;
    const old = this.cur;
    if (old) {
      const g = old.bus.gain;
      const out = old.id === 'boo' ? BOO_FADE : FADE;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + out);
      old.stopAt = now + out + 0.15;
    }
    this.cur = null;
    if (!id) return;
    const c = compiled(id);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + FADE);
    bus.connect(this.duck as GainNode);
    const filter = (cut: number): AudioNode => {
      if (cut <= 0) return bus;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      f.Q.value = 0.7;
      f.connect(bus);
      return f;
    };
    const inst: Inst = { id, c, bus, leadF: filter(c.song.leadCut), bassF: filter(c.song.bassCut), step: 0, next: now + 0.05, stopAt: -1 };
    this.insts.push(inst);
    this.cur = inst;
  }

  private play(i: Inst, e: Ev, t: number): void {
    const s = i.c.song;
    const dur = e.d * i.c.stepSec;
    this.notes++;
    switch (e.v) {
      case 'lead':
        this.tone(i.leadF, s.leadWave, e.f[0], t, dur * 0.92, s.leadVol * e.a, 0.62);
        break;
      case 'bass':
        this.tone(i.bassF, s.bassWave, e.f[0], t, dur * 0.85, s.bassVol * e.a, 0.75);
        break;
      case 'comp': {
        const c = s.comp;
        for (const f of e.f) this.tone(i.leadF, c.wave, f, t, Math.min(dur * 0.8, 0.22), c.vol * e.a, 0.3);
        break;
      }
      case 'kick':
        this.kick(i.bus, t, 0.34 * e.a);
        break;
      case 'snare':
        this.hiss(i.bus, t, 0.13, 'bandpass', 1900, 0.15 * e.a);
        break;
      case 'hat':
        this.hiss(i.bus, t, 0.035, 'highpass', 7200, 0.045 * e.a);
        break;
      case 'hatOpen':
        this.hiss(i.bus, t, 0.16, 'highpass', 6800, 0.05 * e.a);
        break;
    }
  }

  /** 발진기 음 하나: 빠르게 올라가 조금 줄어든 채로 버티다 끝에서 닫힌다 */
  private tone(out: AudioNode, type: OscillatorType, f: number, t: number, dur: number, vol: number, sustain: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    const end = t + Math.max(0.05, dur);
    const dec = Math.min(end - 0.02, t + 0.09);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.linearRampToValueAtTime(vol * sustain, dec);
    g.gain.setValueAtTime(vol * sustain, end - 0.02);
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(end + 0.02);
  }

  private kick(out: AudioNode, t: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
  }

  private hiss(out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, vol: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    // 매번 같은 잡음 조각이 되지 않게 시작 자리를 바꾼다
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }
}
