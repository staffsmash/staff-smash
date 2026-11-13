import * as THREE from 'three';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Fx } from './fx';
import type { Hazards } from './hazards';
import type { Models } from './models';
import { drawTimer } from './textures';

// 1인칭 시험판의 잡몹. 모두 사물이다 (본편 2D 잡몹과 같은 이름).
// - 새벽 3시 메일 / 단체 메일: 좌우로 흔들리며 날아와 부딪친다.
// - 울리는 전화기: 플레이어 자리에 빨간 그림자 → 하늘에서 떨어져 바닥에서 울린다.
// - "교수님이 된다고 했는데요" 말풍선: 부르르 떤 뒤 곧장 돌진한다. 옆으로 피한다.
// - 마감 1분 전 서류 뭉치: 째깍거리며 다가온다. 도장으로 맞히면 그 자리에서 터져 주변 민원까지 처리.
// 보스(사람)는 bosses.ts.

export type Kind = 'mail' | 'bulk' | 'phone' | 'bubble' | 'bomb' | 'boss';
/** 다친 까닭 (잡몹 + 보스가 쓰는 것) */
export type HurtKind = Kind | 'wave' | 'paper' | 'scholar' | 'meeting' | 'packet' | 'bigstamp' | 'error';
/** 날아오는 종이·물건 (도장으로 맞혀 없앨 수 있다) */
export type SheetKind = 'paper' | 'scholar' | 'meeting' | 'packet';

export interface Ctx {
  readonly scene: THREE.Scene;
  readonly models: Models;
  readonly fx: Fx;
  readonly hz: Hazards;
  /** 적이 노리는 점 (플레이어 눈보다 조금 아래) */
  readonly eye: THREE.Vector3;
  /** 플레이어 발이 땅에서 뜬 높이 (점프) */
  readonly feet: number;
  /** 지금 움직일 수 있는 구역 (말풍선 돌진이 멈추는 경계) */
  readonly area: Rect;
  hurt(dmg: number, from: THREE.Vector3, kind?: HurtKind): void;
  /** 잠깐 멈춤 (동전·"보고해!"). 이미 멈춰 있으면 false */
  freeze(sec: number, text: string): boolean;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
  /** 화면 흔들림 (설정에서 줄이면 무시) */
  quake(amount: number, at?: THREE.Vector3): void;
  banner(title: string, sub?: string): void;
  detonate(b: Bomb, byPlayer: boolean): void;
  spawnAt(kind: 'mail' | 'bomb' | 'bubble', at: THREE.Vector3): void;
  spawnPhone(): void;
  sheet(from: THREE.Vector3, vel: THREE.Vector3, kind?: SheetKind): void;
  /** 보스를 뺀 살아 있는 적 수 */
  minions(): number;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export abstract class Enemy {
  abstract readonly kind: Kind;
  readonly obj = new THREE.Group();
  /** 맞는 자리 (월드 좌표) */
  readonly center = new THREE.Vector3();
  radius = 0.7;
  hp = 1;
  maxHp = 1;
  /** 처리됨 (쓰러지는 중, 더는 맞지 않는다) */
  dead = false;
  /** 장면에서 치운다 */
  gone = false;
  t = 0;
  pop = 0;
  baseScale = 1;
  /** 전체 공지 발송이 닿기까지 남은 시간 (-1 = 없음) */
  noticeT = -1;

  get targetable(): boolean {
    return !this.dead && !this.gone;
  }

  abstract update(dt: number, c: Ctx): void;

  /** 맞았지만 아직 남았을 때 (dir: 플레이어 → 적, 수평) */
  knock(_dir: THREE.Vector3): void {}

  /** 처리되었을 때: 쓰러지는 연출을 시작한다 */
  abstract die(dir: THREE.Vector3, c: Ctx): void;

  dispose(): void {}

  protected popScale(dt: number): void {
    if (this.pop > 0) {
      this.pop -= dt;
      this.obj.scale.setScalar(this.baseScale * (1 + Math.max(0, this.pop) * 1.2));
    }
  }

  /** 수평으로만 플레이어 쪽을 본다 */
  protected faceFlat(target: THREE.Vector3): void {
    _a.set(target.x, this.obj.position.y, target.z);
    this.obj.lookAt(_a);
  }
}

// ---------- 새벽 3시 메일 / 단체 메일 ----------

export class Mail extends Enemy {
  readonly kind: 'mail' | 'bulk';
  private wings: THREE.Mesh[];
  private speed: number;
  private dmg: number;
  private phase = Math.random() * 6.28;
  private state: 'fly' | 'retreat' = 'fly';
  private vel = new THREE.Vector3();

  constructor(c: Ctx, big: boolean, at: THREE.Vector3) {
    super();
    this.kind = big ? 'bulk' : 'mail';
    const m = c.models.mail(big);
    this.obj.add(m.obj);
    this.wings = m.wings;
    this.baseScale = big ? 1.9 : 1.25;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.copy(at);
    this.hp = this.maxHp = big ? 3 : 1;
    this.speed = big ? 2.3 : 3.2 + Math.random() * 0.8;
    this.dmg = big ? 2 : 1;
    this.radius = 0.55 * this.baseScale;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    const flap = Math.sin(this.t * 18) * 0.6;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 14 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.x += dt * 9;
      o.rotation.z += dt * 6;
      if (o.position.y < -1) this.gone = true;
      return;
    }
    const to = _a.subVectors(c.eye, o.position);
    const dist = to.length();
    to.divideScalar(Math.max(0.001, dist));
    if (this.state === 'retreat') {
      o.position.addScaledVector(to, -this.speed * 1.4 * dt);
      o.position.y += dt * 1.5;
      if (this.t > 1.1) this.state = 'fly';
    } else {
      // 좌우로 흔들리며 다가온다
      const sway = Math.sin(this.t * 2.6 + this.phase) * 1.4;
      o.position.addScaledVector(to, this.speed * dt);
      o.position.x += -to.z * sway * dt;
      o.position.z += to.x * sway * dt;
      o.position.y += Math.sin(this.t * 3 + this.phase) * 0.4 * dt;
      if (dist < this.radius + 0.55) {
        c.hurt(this.dmg, o.position, this.kind);
        this.state = 'retreat';
        this.t = 0;
      }
    }
    o.position.y = Math.max(0.9, Math.min(10, o.position.y));
    o.lookAt(c.eye);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1.2);
  }

  die(dir: THREE.Vector3): void {
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2).addScaledVector(dir, 3);
  }
}

// ---------- 울리는 전화기 ----------

const WARN_T = 1.15;
const RING_EVERY = 2.6;
const RING_R = 2.6;

export class Phone extends Enemy {
  readonly kind = 'phone' as const;
  private state: 'warn' | 'fall' | 'ring' = 'warn';
  private warn: THREE.Mesh;
  private handset: THREE.Group;
  private body: THREE.Group;
  private vy = 0;
  private ringT = 1.3;
  /** 안 받으면 이만큼 울리고 끊긴다 */
  private ringsLeft = 4;
  private ox: number;
  private oz: number;

  constructor(c: Ctx, x: number, z: number) {
    super();
    this.ox = x;
    this.oz = z;
    const m = c.models.phone();
    this.body = m.obj;
    this.handset = m.handset;
    this.obj.add(this.body);
    this.obj.position.set(x, 19, z);
    this.hp = this.maxHp = 2;
    this.radius = 0.8;
    this.warn = new THREE.Mesh(c.models.warnGeo, c.models.warnMat);
    this.warn.rotation.x = -Math.PI / 2;
    this.warn.position.set(x, 0.05, z);
    this.warn.scale.setScalar(0.3);
    c.scene.add(this.obj, this.warn);
    this.center.set(x, 19.4, z);
  }

  /** 아직 공중이면 바닥 그림자 자리 */
  get landing(): THREE.Vector3 | null {
    return this.state === 'ring' ? null : _b.set(this.ox, 0, this.oz);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vy -= 18 * dt;
      o.position.y = Math.max(0, o.position.y + this.vy * dt);
      o.rotation.y += dt * 14;
      const s = Math.max(0.01, 1 - this.t * 1.4);
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    if (this.state === 'warn') {
      this.warn.scale.setScalar(0.3 + Math.min(1, this.t / WARN_T) * 0.7);
      o.position.y = 19 - this.t * 2.2;
      o.rotation.y += dt * 3;
      if (this.t >= WARN_T) {
        this.state = 'fall';
        this.vy = -6;
        c.sound('fall', o.position, 0.9);
      }
    } else if (this.state === 'fall') {
      this.vy -= 46 * dt;
      o.position.y += this.vy * dt;
      o.rotation.y += dt * 5;
      if (o.position.y <= 0) this.land(c);
    } else {
      this.ring(dt, c);
    }
    this.center.set(o.position.x, o.position.y + 0.45, o.position.z);
  }

  private land(c: Ctx): void {
    const o = this.obj;
    o.position.y = 0;
    this.state = 'ring';
    this.ringT = 1.2;
    this.warn.visible = false;
    c.sound('hit', o.position, 1);
    c.fx.ring(o.position.x, 0.06, o.position.z, 0.4, 1.8, 0.35, 0xffffff);
    c.fx.confetti(_a.set(o.position.x, 0.2, o.position.z), 8, 3, 0xd8d0c0, 1.5, 0.6);
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    o.rotation.y = Math.atan2(dx, dz);
    if (dx * dx + dz * dz < 1.45 * 1.45) c.hurt(1, o.position, this.kind);
  }

  private ring(dt: number, c: Ctx): void {
    const o = this.obj;
    this.ringT -= dt;
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz);
    // 천천히 다가오며 플레이어를 본다
    if (d > 1.3) {
      o.position.x += (dx / d) * 0.9 * dt;
      o.position.z += (dz / d) * 0.9 * dt;
    }
    o.rotation.y = Math.atan2(dx, dz);
    const tremble = this.ringT < 0.55;
    this.body.rotation.z = tremble ? Math.sin(this.t * 70) * 0.1 : 0;
    this.handset.position.y = 0.74 + (tremble ? Math.abs(Math.sin(this.t * 50)) * 0.12 : Math.abs(Math.sin(this.t * 6)) * 0.02);
    if (this.ringT <= 0) {
      this.ringT = RING_EVERY;
      c.sound('ring', o.position, 1);
      c.fx.ring(o.position.x, 0.08, o.position.z, 0.4, RING_R, 0.5, 0xff4d4d);
      c.fx.text(_a.set(o.position.x, 1.5, o.position.z), '따르릉!', '#ffe066');
      if (d < RING_R) c.hurt(1, o.position, this.kind);
      if (--this.ringsLeft <= 0) {
        // 끝내 안 받으면 끊긴다 (처리한 것으로 치지 않는다)
        c.fx.text(_a.set(o.position.x, 1.2, o.position.z), '뚝.', '#cfd4d8');
        this.dead = true;
        this.die();
      }
    }
  }

  die(): void {
    this.t = 0;
    this.vy = 5;
    this.warn.visible = false;
  }

  dispose(): void {
    this.warn.removeFromParent();
  }
}

// ---------- "교수님이 된다고 했는데요" 말풍선 ----------

type BubbleState = 'approach' | 'aim' | 'dash' | 'recover';

export class Bubble extends Enemy {
  readonly kind = 'bubble' as const;
  private mat: THREE.MeshBasicMaterial;
  private state: BubbleState = 'approach';
  private stateT = 0;
  private cool = 1.6 + Math.random();
  private dir = new THREE.Vector3();
  private dashDist = 0;
  private hitDone = false;
  private hover = 1.7 + Math.random() * 0.5;
  private side = Math.random() < 0.5 ? -1 : 1;

  constructor(c: Ctx, at: THREE.Vector3) {
    super();
    const m = c.models.bubble();
    this.mat = m.mat;
    this.obj.add(m.obj);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.radius = 1.05;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  /** 돌진 직전인지 (조준 보조·봇이 먼저 노린다) */
  get winding(): boolean {
    return this.state === 'aim' || this.state === 'dash';
  }

  private set(s: BubbleState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      const s = Math.max(0.01, 1 - this.t * 5);
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const targetY = this.hover + Math.sin(this.t * 2.4) * 0.15;
    switch (this.state) {
      case 'approach': {
        // 플레이어에게서 8~10m 떨어진 자리로 옆걸음하며 다가온다
        const want = d - 9;
        const sp = 3.6;
        o.position.x += ((dx / d) * Math.sign(want) * Math.min(1, Math.abs(want)) + (-dz / d) * this.side * 0.5) * sp * dt;
        o.position.z += ((dz / d) * Math.sign(want) * Math.min(1, Math.abs(want)) + (dx / d) * this.side * 0.5) * sp * dt;
        if (this.stateT > 2.5) {
          this.side = -this.side;
          this.stateT = 0;
        }
        this.cool -= dt;
        if (this.cool <= 0 && d < 15) {
          this.set('aim');
          c.sound('tick', o.position, 0.8);
        }
        break;
      }
      case 'aim': {
        // 부르르 떨며 붉어진다
        const k = Math.min(1, this.stateT / 0.75);
        const flash = Math.sin(this.t * 40) > 0 ? 1 : 0.75;
        this.mat.color.setRGB(1, 1 - 0.5 * k * flash, 1 - 0.5 * k * flash);
        o.position.x += Math.sin(this.t * 80) * 0.02;
        if (this.stateT >= 0.75) {
          this.dir.set(dx, c.eye.y - o.position.y, dz).normalize();
          this.dashDist = 0;
          this.hitDone = false;
          this.set('dash');
          c.sound('dash', o.position, 1);
        }
        break;
      }
      case 'dash': {
        const v = 15 * dt;
        o.position.addScaledVector(this.dir, v);
        this.dashDist += v;
        if (!this.hitDone) {
          const hy = Math.abs(c.eye.y - o.position.y);
          if (Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z) < 1.3 && hy < 1.3) {
            this.hitDone = true;
            c.hurt(1, o.position, this.kind);
          }
        }
        const a = c.area;
        const out = o.position.x < a.minX - 4 || o.position.x > a.maxX + 4 || o.position.z < a.minZ - 4 || o.position.z > a.maxZ + 4;
        if (this.dashDist > 19 || out) this.set('recover');
        break;
      }
      case 'recover':
        this.mat.color.setRGB(1, 1, 1);
        if (this.stateT > 0.6) {
          this.cool = 1.5 + Math.random() * 1.2;
          this.set('approach');
        }
        break;
    }
    if (this.state !== 'dash') o.position.y += (targetY - o.position.y) * Math.min(1, dt * 3);
    this.faceFlat(c.eye);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1.5);
  }

  die(): void {
    this.t = 0;
  }

  dispose(): void {
    this.mat.dispose();
  }
}

// ---------- 마감 1분 전 서류 뭉치 ----------

export const BOMB_FUSE = 9;

export class Bomb extends Enemy {
  readonly kind = 'bomb' as const;
  fuse = BOMB_FUSE;
  /** 옆에서 터진 폭발이 옮겨붙기까지 남은 시간 (-1 = 없음) */
  chainT = -1;
  chainBy = false;
  private secs = BOMB_FUSE;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private timer: THREE.Mesh;
  private defused = false;
  private speed = 2.3 + Math.random() * 0.5;
  private phase = Math.random() * 6;

  constructor(c: Ctx, at: THREE.Vector3) {
    super();
    const m = c.models.bomb();
    this.canvas = m.canvas;
    this.tex = m.tex;
    this.timer = m.timer;
    this.obj.add(m.obj);
    this.baseScale = 1.15;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.radius = 0.78;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      // 전체 공지로 마감이 풀린 뭉치는 스르르 사라진다
      if (this.defused) {
        o.position.y += dt * 1.5;
        const s = Math.max(0.01, this.baseScale * (1 - this.t * 1.5));
        o.scale.setScalar(s);
        if (s <= 0.02) this.gone = true;
      }
      return;
    }
    if (this.chainT >= 0) {
      this.chainT -= dt;
      if (this.chainT < 0) {
        c.detonate(this, this.chainBy);
        return;
      }
    }
    this.fuse -= dt;
    const secs = Math.max(0, Math.ceil(this.fuse));
    const hot = this.fuse < 3;
    if (secs !== this.secs) {
      this.secs = secs;
      drawTimer(this.canvas, secs, hot);
      this.tex.needsUpdate = true;
      c.sound('tick', o.position, hot ? 1 : 0.5);
    }
    if (this.fuse <= 0) {
      c.detonate(this, false);
      return;
    }
    const to = _a.subVectors(c.eye, o.position);
    const dist = to.length();
    to.divideScalar(Math.max(0.001, dist));
    o.position.addScaledVector(to, this.speed * dt);
    o.position.y += (1.35 + Math.sin(this.t * 2 + this.phase) * 0.2 - o.position.y) * Math.min(1, dt * 1.5);
    this.faceFlat(c.eye);
    if (hot) {
      o.rotation.z = Math.sin(this.t * 45) * 0.08;
      this.timer.scale.setScalar(1 + Math.abs(Math.sin(this.t * 12)) * 0.3);
    }
    this.center.copy(o.position);
    if (dist < 1.25) c.detonate(this, false);
  }

  die(): void {
    // 폭발은 Game.detonate가 맡는다. 여기 오는 것은 전체 공지로 풀린 경우뿐
    this.defused = true;
    this.t = 0;
  }

  /** 터질 때: 바로 치운다 */
  explode(): void {
    this.dead = true;
    this.gone = true;
  }

  dispose(): void {
    this.tex.dispose();
  }
}
