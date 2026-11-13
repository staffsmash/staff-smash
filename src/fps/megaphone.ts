import * as THREE from 'three';
import { Enemy, type Ctx } from './enemies';
import { FC, MAST } from './field';

// 마지막 보스: 요구안 방송 확성기 (대운동장). 사람은 나오지 않는다 — 커다란 확성기 하나.
// 1단계: 남쪽 기둥 위에서 플레이어 쪽으로 고개를 돌리며
//   - 대자보를 부채꼴로 뿌리고,
//   - 말풍선을 불러내고,
//   - 기를 모았다가(나팔 가운데가 빛남 = 약점) 바닥을 따라 퍼지는 음파 고리를 쏜다 → 점프로 넘는다.
// 체력이 반 아래로 내려가면 기둥을 떠나 운동장 위를 돌며 음파를 두 겹으로 쏜다.
// 기를 모으는 동안 약점에 도장을 여러 번 맞히면 방송이 끊겨(삐익—) 잠깐 멈춘다.

export const MEGA_HP = 120;
/** 약점(빛나는 나팔 가운데)에 맞힌 도장 한 개의 피해 */
export const WEAK_DMG = 5;
/** 기를 모으는 동안 약점에 이만큼 주면 방송이 끊긴다 */
const STUN_DMG = 15;
/** 음파 높이: 발이 이보다 높이 떠 있으면 넘는다 */
export const WAVE_H = 0.55;
export const WAVE_SPEED = 8.5;
const WAVE_MAX = 54;
/** 판정 폭 (반) — 플레이어 몸 둘레 포함 */
const WAVE_BAND = 0.45;
const MOUNT_Y = 8.9;
/** 나팔 입(스피커 망)의 지역 z */
const MOUTH_Z = 2.62;

export interface Wave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  r: number;
  on: boolean;
  hit: boolean;
}

type MegaState = 'sleep' | 'intro' | 'idle' | 'charge' | 'stun' | 'lift';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _ha = new THREE.Vector3();
const _hb = new THREE.Vector3();
const _hq = new THREE.Quaternion();

export class Megaphone extends Enemy {
  readonly kind = 'mega' as const;
  readonly waves: Wave[] = [];
  /** 나팔 입 한가운데 (월드 좌표) — 약점 */
  readonly mouth = new THREE.Vector3();
  phase2 = false;
  state: MegaState = 'sleep';
  /** 마지막 폭발까지 끝났는지 */
  finished = false;
  private stateT = 0;
  private head: THREE.Group;
  private disc: THREE.MeshLambertMaterial;
  private target: THREE.Mesh;
  private targetMat: THREE.MeshBasicMaterial;
  private volleyT = 4.5;
  private chargeIn = 5.5;
  private summonT = 9;
  private pendingWaves = 0;
  private pendingT = 0;
  private chargeDmg = 0;
  private ang = Math.PI / 2;
  private dieT = 0;
  private burstT = 0;
  private vy = 0;
  private spin = new THREE.Vector3();
  private liftFrom = new THREE.Vector3();
  private said = false;

  constructor(c: Ctx) {
    super();
    const m = c.models.megaphone();
    this.obj.add(m.obj);
    this.head = m.head;
    this.disc = m.disc;
    this.target = m.target;
    this.targetMat = m.targetMat;
    // 처음에는 기둥 위에서 고개를 숙이고 있다가(sleep) 플레이어가 운동장에 들어오면 든다 (기둥은 Game이 세운다)
    this.obj.position.set(MAST.x, MOUNT_Y, MAST.z);
    this.obj.rotation.set(0.75, Math.PI, 0);
    this.hp = this.maxHp = MEGA_HP;
    this.radius = 2.7;
    for (let i = 0; i < 6; i++) {
      const w = c.models.wave();
      c.scene.add(w.mesh);
      this.waves.push({ mesh: w.mesh, mat: w.mat, x: 0, z: 0, r: 0, on: false, hit: false });
    }
    c.scene.add(this.obj);
    this.updateCenter();
  }

  get targetable(): boolean {
    return !this.dead && !this.gone && this.state !== 'sleep';
  }

  /** 플레이어가 운동장에 들어왔다 */
  wake(): void {
    if (this.state === 'sleep') this.setState('intro');
  }

  /** 약점이 열려 있는지 (기를 모으는 중이거나 방송이 끊겨 멈춘 동안) */
  get open(): boolean {
    return !this.dead && (this.state === 'charge' || this.state === 'stun');
  }

  /**
   * 도장이 p0 → p1 로 움직이는 동안 맞았는지. 0 = 안 맞음, 1 = 맞음, 2 = 약점(빛나는 나팔 가운데).
   * 나팔 입(지역 z = MOUTH_Z 평면)을 앞에서 뚫고 들어오면 그 자리의 반지름으로 판정하고,
   * 옆이나 뒤에서 오면 몸통(관 + 나팔 바깥)으로 판정한다.
   */
  hitTest(p0: THREE.Vector3, p1: THREE.Vector3): 0 | 1 | 2 {
    const o = this.obj;
    const inv = _hq.copy(o.quaternion).invert();
    const a = _ha.copy(p0).sub(o.position).applyQuaternion(inv);
    const b = _hb.copy(p1).sub(o.position).applyQuaternion(inv);
    if (a.z >= MOUTH_Z && b.z < MOUTH_Z) {
      const k = (a.z - MOUTH_Z) / (a.z - b.z);
      const r = Math.hypot(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
      if (r < 2.6) return this.open && r < 1.5 ? 2 : 1;
    }
    if (b.z > -3.3 && b.z < MOUTH_Z) {
      const rr = Math.hypot(b.x, b.y);
      const maxR = b.z < -0.2 ? 1.1 : 1.0 + ((b.z + 0.2) / 2.9) * 1.65;
      if (rr < maxR) return 1;
    }
    return 0;
  }

  /** 약점을 맞았을 때 (Game이 부른다). 많이 맞으면 방송이 끊긴다 */
  weakHit(dmg: number, c: Ctx): void {
    if (this.state !== 'charge') return;
    this.chargeDmg += dmg;
    if (this.chargeDmg >= STUN_DMG) {
      this.state = 'stun';
      this.stateT = 0;
      c.sound('squeal', this.mouth, 1);
      c.fx.text(_a.copy(this.mouth).setY(this.mouth.y + 2.2), '삐익— 방송 끊김!', '#ffe066', 0.9);
    }
  }

  /** (x, z)에 가장 먼저 닿을 음파까지 남은 시간 (적 시간, 초). 없으면 Infinity */
  waveEta(x: number, z: number): number {
    let best = Infinity;
    for (const w of this.waves) {
      if (!w.on || w.hit) continue;
      const d = Math.hypot(x - w.x, z - w.z);
      if (d + WAVE_BAND < w.r) continue;
      best = Math.min(best, Math.max(0, d - WAVE_BAND - w.r) / WAVE_SPEED);
    }
    return best;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    this.updateWaves(dt, c);
    if (this.pop > 0) this.pop -= dt;
    this.head.scale.setScalar(1 + Math.max(0, this.pop) * 0.5);
    const o = this.obj;
    if (this.dead) {
      this.dying(dt, c);
      return;
    }

    // ---- 자리 ----
    if (this.state === 'lift') {
      const k = Math.min(1, this.stateT / 1.8);
      const e = k * k * (3 - 2 * k);
      this.orbitPoint(_a);
      o.position.lerpVectors(this.liftFrom, _a, e);
      o.position.y += Math.sin(k * Math.PI) * 3;
      if (k >= 1) this.setState('idle');
    } else if (this.phase2) {
      this.ang += 0.26 * dt;
      this.orbitPoint(_a);
      o.position.lerp(_a, Math.min(1, dt * 1.6));
    }

    // ---- 방향 ----
    const turn = this.state === 'sleep' || this.state === 'stun' ? 0 : this.state === 'intro' ? 1.1 : this.state === 'charge' ? 1.3 : 2.6;
    if (turn > 0) {
      // 정면으로만 보면 동그란 판처럼 보이므로 조금 비껴 본다 (나팔 모양이 보이게)
      const dx = c.eye.x - o.position.x;
      const dz = c.eye.z - o.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const off = Math.min(20, d * 0.75);
      _b.set(c.eye.x - (dz / d) * off, c.eye.y, c.eye.z + (dx / d) * off);
      _m4.lookAt(_b, o.position, UP);
      _q.setFromRotationMatrix(_m4);
      o.quaternion.slerp(_q, Math.min(1, dt * turn));
    }

    // ---- 나팔 빛 / 떨림 ----
    let glow = 0;
    this.head.position.set(0, 0, 0);
    this.head.rotation.x += (0 - this.head.rotation.x) * Math.min(1, dt * 4);
    if (this.state === 'charge') {
      const k = Math.min(1, this.stateT / this.chargeTime);
      glow = 0.4 + k * 1.6 + Math.sin(this.t * 22) * 0.25;
      this.head.position.x = Math.sin(this.t * 60) * 0.05 * (0.5 + k);
      this.target.visible = true;
      this.target.scale.setScalar(1 + Math.sin(this.t * 10) * 0.08);
      this.targetMat.opacity = 0.55 + Math.sin(this.t * 10) * 0.3;
    } else if (this.state === 'stun') {
      glow = Math.sin(this.t * 40) > 0 ? 1.4 : 0.3;
      this.head.rotation.x = 0.45;
      this.target.visible = true;
      this.targetMat.opacity = 0.5;
    } else {
      this.target.visible = false;
    }
    this.disc.emissiveIntensity = glow;

    // ---- 행동 ----
    switch (this.state) {
      case 'sleep':
        // 숨 쉬듯 살짝 흔들린다
        this.head.rotation.x = 0.06 * Math.sin(this.t * 1.3);
        break;
      case 'intro':
        if (!this.said && this.stateT > 0.5) {
          this.said = true;
          c.sound('squeal', o.position, 0.9);
          c.fx.text(_a.copy(o.position).setY(o.position.y + 3.2), '아, 아— 마이크 테스트', '#ffffff', 0.8);
        }
        if (this.stateT >= 3.0) this.setState('idle');
        break;
      case 'idle':
        this.volleyT -= dt;
        if (this.volleyT <= 0) this.volley(c);
        this.summonT -= dt;
        if (this.summonT <= 0) this.summon(c);
        if (this.pendingWaves > 0) {
          this.pendingT -= dt;
          if (this.pendingT <= 0) this.emitWave(c);
        }
        if (!this.phase2 && this.hp <= this.maxHp / 2 && this.pendingWaves === 0) {
          this.phase2 = true;
          this.liftFrom.copy(o.position);
          this.setState('lift');
          this.chargeIn = 3.5;
          this.volleyT = 3;
          c.sound('squeal', o.position, 1);
          c.bossPhase2('mega');
          break;
        }
        this.chargeIn -= dt;
        if (this.chargeIn <= 0 && this.pendingWaves === 0) {
          this.setState('charge');
          this.chargeDmg = 0;
          c.sound('charge', o.position, 1);
        }
        break;
      case 'charge':
        if (this.stateT >= this.chargeTime) this.blast(c);
        break;
      case 'stun':
        if (this.stateT >= 1.8) {
          this.setState('idle');
          this.chargeIn = this.phase2 ? 5 : 6;
          this.volleyT = Math.max(this.volleyT, 1.2);
        }
        break;
      case 'lift':
        break;
    }
    this.updateCenter();
  }

  private get chargeTime(): number {
    return this.phase2 ? 1.9 : 2.3;
  }

  private setState(s: MegaState): void {
    this.state = s;
    this.stateT = 0;
  }

  private orbitPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(FC.x + Math.cos(this.ang) * 15, 7.4 + Math.sin(this.t * 1.1) * 0.9, FC.z + 4 + Math.sin(this.ang) * 11);
  }

  private updateCenter(): void {
    const q = this.obj.quaternion;
    this.mouth.set(0, 0, MOUTH_Z).applyQuaternion(q).add(this.obj.position);
    this.center.set(0, 0, 1.6).applyQuaternion(q).add(this.obj.position);
  }

  /** 기 모으기 끝: 음파 (1단계 한 겹, 2단계 두 겹) */
  private blast(c: Ctx): void {
    this.setState('idle');
    this.chargeIn = this.phase2 ? 6.2 : 7.6;
    this.volleyT = Math.max(this.volleyT, 1.6);
    this.pendingWaves = this.phase2 ? 2 : 1;
    this.pendingT = 0;
    this.emitWave(c);
    c.fx.text(_a.copy(this.mouth).setY(this.mouth.y + 2.4), '요구안 방송!', '#ffd84a', 1.0);
    c.fx.blast(this.mouth, 3.2, 0xffe38a);
  }

  private emitWave(c: Ctx): void {
    this.pendingWaves--;
    this.pendingT = 1.0;
    const w = this.waves.find((x) => !x.on) ?? this.waves[0];
    // 1단계는 기둥 앞 바닥에서, 2단계는 확성기 바로 아래 바닥에서 퍼진다
    if (this.phase2) {
      w.x = this.obj.position.x;
      w.z = this.obj.position.z;
    } else {
      w.x = MAST.x;
      w.z = MAST.z - 1.5;
    }
    w.r = 0.6;
    w.on = true;
    w.hit = false;
    w.mesh.position.set(w.x, 0.02, w.z);
    w.mesh.scale.set(w.r, WAVE_H, w.r);
    w.mat.opacity = 1;
    w.mesh.visible = true;
    c.sound('wave', this.mouth, 1);
    c.quake(0.5, _b.set(w.x, 0, w.z));
    c.fx.ring(w.x, 0.08, w.z, 0.5, 4, 0.5, 0xffd84a);
  }

  private updateWaves(dt: number, c: Ctx): void {
    for (const w of this.waves) {
      if (!w.on) continue;
      const r0 = w.r;
      w.r += WAVE_SPEED * dt;
      w.mesh.scale.set(w.r, WAVE_H, w.r);
      w.mat.opacity = Math.min(1, (WAVE_MAX - w.r) / 8);
      if (!w.hit && !this.dead) {
        const d = Math.hypot(c.eye.x - w.x, c.eye.z - w.z);
        if (d >= r0 - WAVE_BAND && d <= w.r + WAVE_BAND && c.feet < WAVE_H) {
          w.hit = true;
          c.hurt(1.5, _a.set(w.x, 1, w.z), 'wave');
        }
      }
      if (w.r >= WAVE_MAX) {
        w.on = false;
        w.mesh.visible = false;
      }
    }
  }

  /** 대자보를 부채꼴로 */
  private volley(c: Ctx): void {
    this.volleyT = this.phase2 ? 2.9 : 3.5;
    const n = this.phase2 ? 6 : 4;
    const o = this.mouth;
    const base = Math.atan2(c.eye.x - o.x, c.eye.z - o.z);
    const flat = Math.hypot(c.eye.x - o.x, c.eye.z - o.z);
    const pitch = Math.atan2(c.eye.y - o.y, flat);
    const sp = 10;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.16;
      _b.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch)).multiplyScalar(sp);
      _a.copy(o).addScaledVector(_b, 0.12);
      c.sheet(_a, _b, true);
    }
    c.sound('volley', o, 1);
  }

  /** 말풍선 둘을 불러낸다 */
  private summon(c: Ctx): void {
    this.summonT = this.phase2 ? 10 : 13;
    if (c.minions() >= 4) return;
    const q = this.obj.quaternion;
    for (const s of [-1, 1]) {
      _a.set(s * 3.2, -1.5, 2).applyQuaternion(q).add(this.obj.position);
      _a.y = Math.max(2.2, _a.y);
      c.spawnAt('bubble', _a);
      c.fx.confetti(_a, 10, 4, 0xffffff, 1.5);
    }
    c.sound('pop', this.mouth, 0.8);
  }

  knock(): void {
    /* 너무 커서 밀리지 않는다 */
  }

  die(): void {
    this.dieT = 0;
    this.burstT = 0;
    this.vy = 1.5;
    this.spin.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1.6);
    this.target.visible = false;
    this.disc.emissiveIntensity = 0;
    for (const w of this.waves) {
      w.on = false;
      w.mesh.visible = false;
    }
  }

  private dying(dt: number, c: Ctx): void {
    const o = this.obj;
    this.dieT += dt;
    this.burstT -= dt;
    this.vy -= 9 * dt;
    o.position.y = Math.max(1.8, o.position.y + this.vy * dt);
    o.rotation.x += this.spin.x * dt;
    o.rotation.y += this.spin.y * dt;
    o.rotation.z += this.spin.z * dt;
    this.disc.emissiveIntensity = Math.sin(this.t * 35) > 0 ? 1.2 : 0;
    if (this.burstT <= 0 && this.dieT < 2.0) {
      this.burstT = 0.14;
      _a.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4).add(o.position);
      c.fx.blast(_a, 1.7, 0xfff1c9);
      c.fx.confetti(_a, 10, 5);
      c.sound('pop', _a, 0.8);
    }
    if (this.dieT >= 2.0 && !this.finished) {
      this.finished = true;
      c.fx.blast(o.position, 7.5, 0xffb347);
      c.fx.confetti(o.position, 150, 12, 0xffffff, 4, 1.4);
      c.sound('boom', o.position, 1);
      c.quake(1, o.position);
      o.visible = false;
      this.gone = true;
    }
  }

  dispose(): void {
    for (const w of this.waves) {
      w.mesh.removeFromParent();
      w.mat.dispose();
    }
  }
}
