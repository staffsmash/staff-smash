import * as THREE from 'three';
import type { Rect } from './blocks';
import type { Ctx } from './enemies';
import type { Person } from './people';
import type { DiffKey } from './settings';

// 사람 보스·중간보스 공통 움직임 (2026-11-17 사용자 요청: "중간보스와 보스몹의 행동도 너무 예측 가능하고 안 움직임.
// 움직이고 사라지고 달려오는 것들 추가"). 교직원·학생 모드 모두. 총장은 빼고 따로 Wander로 불규칙하게 움직인다.
// - 옆걸음·뒷걸음: 1.5초 넘게 가만히 서 있지 않는다 (결재판을 든 동안·기믹 중에도 그 자리 범위 안에서 조금씩).
// - 사라졌다 나타나기: 먼지를 일으키며 땅으로 가라앉아 사라진다 → 나타날 자리에 바닥 그림자와 발소리 (0.6~0.8초)
//   → 그 자리에서 솟아오른다. 숨은 동안은 맞힐 수 없다.
// - 달려오기: 몸을 낮추고 "!"·먼지 (0.5~0.8초) → 그 순간 플레이어가 있던 쪽으로 곧게 달린다. 부딪히면 플레이어가
//   밀려나고 느려진다 (보스는 다치지 않는다). 옆으로 비키면 피한다.
// - 쿵쿵 달려오기 (11차, 김총괄): 1초 동안 발을 구르며 예고(쿵 소리·작은 화면 흔들림) → 더 빠르게 달려온다.
//   달리는 동안 발소리와 화면 흔들림. 달려오기가 더 잦다. 부딪히면 피해는 같다 (RUSH_DMG).
// 순서·간격은 무작위이고 난이도가 높을수록 자주·빠르게 (보스는 이미 diff.speed만큼 빨라진 시간을 받는다).
// 보스 쪽은 roam()으로 지금 쓸 수 있는 움직임을 알려 준다: 기믹·대사 연출 중에는 'none', 결재판을 든 동안은 'step' 등.
// 사라지기·달려오기 중에는 보스의 think()가 멈춘다 (기믹 타이머도 그동안 쉰다).

/** 지금 쓸 수 있는 움직임: all = 옆걸음·사라지기·달려오기, hop = 옆걸음·사라지기, step = 옆걸음만, none = 그대로 */
export type Roam = 'all' | 'hop' | 'step' | 'none';

/** 움직임을 받는 보스 (PersonBoss가 채운다) */
export interface Mover {
  readonly obj: THREE.Object3D;
  readonly person: Person;
  roam(): Roam;
  /** 움직일 범위 (null = 구역 전체). 기믹이 자리에 묶여 있으면 그 범위 */
  roamRange(): Rect | null;
  /** 밀어낼 장애물 (null = 밀지 않는다: 단상 위 등) */
  roamSolids(c: Ctx): readonly Rect[] | null;
  /** 자리를 더 고친다 (화단 피하기 등) */
  roamFix(o: THREE.Vector3): void;
  /** 이번 프레임은 걷는 자세 */
  stride(): void;
  /** 몸을 돌린다 (rate 클수록 빨리) */
  roamFace(x: number, z: number, dt: number, rate: number): void;
}

/** Game이 가진 것 중 움직임이 쓰는 것 (Ctx에 없는 것: 난이도·장애물·플레이어 밀기) */
interface MoveHost {
  readonly runDiff?: DiffKey;
  readonly world?: { readonly obstacles: readonly Rect[] };
  /** 플레이어를 (dx, dz)만큼 밀고 slow초 이상 느리게 (main.ts Game.shove) */
  shove?(dx: number, dz: number, slow: number): void;
}

const hostOf = (c: Ctx) => c as Ctx & MoveHost;

/** 이번 판 난이도 (Game.runDiff, 없으면 중급) */
export function diffOf(c: Ctx): DiffKey {
  return hostOf(c).runDiff ?? 'normal';
}

/** 구역의 장애물 (Game.world.obstacles) */
export function solidsOf(c: Ctx): readonly Rect[] {
  return hostOf(c).world?.obstacles ?? [];
}

interface Tune {
  /** 큰 움직임(사라지기·달려오기) 사이 [최소, 최대] (적 시간 초) */
  every: [number, number];
  /** 이만큼 가만히 서 있으면 옆걸음 (적 시간 초) */
  still: number;
  /** 옆걸음 빠르기 (m/s) */
  step: number;
  /** 달려오기 빠르기 (m/s) */
  rush: number;
  /** 달려오기 준비 (적 시간 초) */
  prep: number;
  /** 숨어 있는 시간 = 그림자 예고 (적 시간 초) */
  hide: number;
  /** 큰 움직임 가운데 달려오기 몫 */
  rushShare: number;
  /** 부딪히면 밀려나는 거리 (m) */
  push: number;
  /** 부딪히면 느려지는 시간 (실제 초) */
  slow: number;
}

// 적 시간 = 실제 시간 × diff.speed (초보 0.7 · 중급 1.0 · 고급 1.18). 준비·예고가 실제로 0.6~0.8초쯤 되게 잡았다.
const TUNE: Record<DiffKey, Tune> = {
  easy: { every: [8.5, 12.5], still: 0.5, step: 1.9, rush: 9, prep: 0.55, hide: 0.5, rushShare: 0.4, push: 2.2, slow: 1.2 },
  normal: { every: [5, 8], still: 0.75, step: 2.1, rush: 10.5, prep: 0.65, hide: 0.68, rushShare: 0.5, push: 2.8, slow: 1.5 },
  hard: { every: [3.6, 6], still: 0.8, step: 2.4, rush: 11.5, prep: 0.72, hide: 0.78, rushShare: 0.55, push: 3.2, slow: 1.8 },
};

/** 이 거리 안에서만 움직였으면 "서 있다" (m) */
const STILL_R = 0.35;
const SINK_T = 0.42;
const RISE_T = 0.32;
/** 숨은 동안 쓰는 깊이 (모형 배율 곱하기) */
const SINK_D = 2.6;
const PUSH_T = 0.22;
/** 달려오기에 부딪혔을 때 피해 (난이도 배율 전. 사용자 2026-11-20 1.5→4: 중급 4칸·고급 ×1.4 = 5.6칸, 체력 10칸 기준) */
const RUSH_DMG = 4;
const RECOVER_T = 0.38;
const DUST = 0x9a8f80;
/** 쿵쿵 달려오기: 발 구르기 예고 (적 시간 초), 달리기 배율, 큰 움직임 간격 배율, 달려오기 몫 */
const STOMP_PREP = 1.0;
const STOMP_SPEED = 1.3;
const STOMP_EVERY = 0.55;
const STOMP_SHARE = 0.85;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

let shadowGeo: THREE.CircleGeometry | null = null;

type Act = 'sink' | 'hide' | 'rise' | 'prep' | 'run' | 'recover';

export class BossMove {
  /** 이 보스가 쓰는 큰 움직임 (고유 기믹과 겹치면 끈다: 전화번호 학생은 원래 사라지고, 마감 학생은 원래 달린다) */
  vanish = true;
  rush = true;
  /** 쿵쿵 달려오기 (김총괄): 발 구르기 1초 예고 → 더 빠르게, 더 자주 */
  stomp = false;
  /** 시험용 횟수 */
  readonly stats = { steps: 0, vanish: 0, rush: 0, rushHit: 0 };
  private readonly b: Mover;
  private act: Act | null = null;
  private actT = 0;
  private bigT = -1;
  private stillT = 0;
  private stepT = 0;
  private stepSide = Math.random() < 0.5 ? 1 : -1;
  private readonly stepV = new THREE.Vector3();
  private readonly last = new THREE.Vector3(NaN, 0, NaN);
  /** think 전 자리 */
  private readonly pre = new THREE.Vector3();
  private readonly dest = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly pushV = new THREE.Vector3();
  private pushT = 0;
  private pushSlow = 0;
  private baseY = 0;
  private budget = 0;
  private hit = false;
  private shadow: THREE.Mesh | null = null;
  private steps = 0;

  constructor(b: Mover) {
    this.b = b;
  }

  /** 숨어 있다 (맞지 않는다) */
  get hidden(): boolean {
    return (this.act === 'sink' && this.actT > SINK_T * 0.55) || this.act === 'hide';
  }

  /** 사라지기·달려오기 중 (보스 think가 멈춘다) */
  get busy(): boolean {
    return this.act !== null;
  }

  /** 지금 하고 있는 큰 움직임 (시험용) */
  get doing(): string {
    return this.act ?? (this.stepT > 0 ? 'step' : '');
  }

  /**
   * 매 프레임 think 전에. 사라지기·달려오기 중이면 true (그동안은 think를 부르지 않는다).
   * 부딪혀 밀려나는 플레이어도 여기서 민다.
   */
  drive(dt: number, c: Ctx): boolean {
    this.pushing(dt, c);
    if (!this.act) {
      this.pre.copy(this.b.obj.position);
      return false;
    }
    this.actT += dt;
    const T = TUNE[diffOf(c)];
    const b = this.b;
    const o = b.obj.position;
    const s = b.person.look.scale;
    switch (this.act) {
      case 'sink': {
        const k = Math.min(1, this.actT / SINK_T);
        o.y = this.baseY - k * k * SINK_D * s;
        if (k >= 1) {
          b.obj.visible = false;
          this.go('hide');
          this.showShadow(c, 0);
          c.sound('hit', this.dest, 0.45);
        }
        break;
      }
      case 'hide': {
        // 나타날 자리: 바닥 그림자가 짙어지고 발소리
        const k = Math.min(1, this.actT / T.hide);
        this.showShadow(c, k);
        const n = Math.floor(this.actT / 0.22);
        if (n > this.steps) {
          this.steps = n;
          c.sound('hit', this.dest, 0.45);
        }
        if (k >= 1) {
          o.set(this.dest.x, this.baseY - SINK_D * 0.85 * s, this.dest.z);
          b.obj.visible = true;
          b.roamFace(c.eye.x, c.eye.z, 1, 1e3);
          this.go('rise');
          c.fx.confetti(_v.set(this.dest.x, this.baseY + 0.2, this.dest.z), 16, 2.8, DUST, 1.6, 0.7);
          c.sound('pop', this.dest, 0.8);
        }
        break;
      }
      case 'rise': {
        const k = Math.min(1, this.actT / RISE_T);
        o.y = this.baseY - (1 - k) * (1 - k) * SINK_D * 0.85 * s;
        this.showShadow(c, 1 - k);
        b.roamFace(c.eye.x, c.eye.z, dt, 8);
        if (k >= 1) this.finish();
        break;
      }
      case 'prep': {
        // 몸을 낮추고 플레이어 쪽으로 겨눈다 (쿵쿵: 제자리에서 발을 구른다)
        const k = Math.min(1, this.actT / (this.stomp ? STOMP_PREP : T.prep));
        if (this.stomp) {
          const n = Math.floor(this.actT / 0.25);
          b.obj.scale.y = 1 - 0.1 * Math.abs(Math.sin(this.actT * Math.PI * 4));
          if (n > this.steps) {
            this.steps = n;
            c.sound('boom', b.person.chest, 0.3);
            c.quake(0.18, o);
            c.fx.confetti(_v.set(o.x, this.baseY + 0.1, o.z), 6, 1.8, DUST, 0.6, 0.45);
          }
        } else b.obj.scale.y = 1 - 0.16 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
        b.roamFace(c.eye.x, c.eye.z, dt, 10);
        if (k >= 1) {
          this.dir.set(c.eye.x - o.x, 0, c.eye.z - o.z);
          const d = this.dir.length();
          if (d < 0.5) {
            this.finish();
            break;
          }
          this.dir.divideScalar(d);
          // 플레이어가 있던 자리를 3.5m 지나칠 때까지 (너무 멀리는 안 간다)
          this.budget = Math.min(d + 3.5, 20);
          this.from.copy(o);
          this.hit = false;
          b.obj.scale.y = 1;
          this.go('run');
          c.sound('dash', b.person.chest, 1);
          c.fx.confetti(_v.set(o.x, this.baseY + 0.15, o.z), 10, 2.4, DUST, 0.8, 0.6);
        }
        break;
      }
      case 'run': {
        b.stride();
        b.roamFace(o.x + this.dir.x, o.z + this.dir.z, dt, 12);
        const want = T.rush * (this.stomp ? STOMP_SPEED : 1) * dt;
        if (this.stomp) {
          // 쿵쿵 발소리와 화면 흔들림
          const n = Math.floor(this.actT / 0.18);
          if (n > this.steps) {
            this.steps = n;
            c.sound('boom', b.person.chest, 0.25);
            c.quake(0.22, o);
          }
        }
        const x0 = o.x;
        const z0 = o.z;
        o.x += this.dir.x * want;
        o.z += this.dir.z * want;
        this.confine(o, c);
        const got = Math.hypot(o.x - x0, o.z - z0);
        if (!this.hit && c.feet < 1.2 && Math.hypot(c.eye.x - o.x, c.eye.z - o.z) < 0.5 + 0.5 * s) this.bump(c);
        const blocked = got < want * 0.5;
        if (this.hit || blocked || Math.hypot(o.x - this.from.x, o.z - this.from.z) >= this.budget || this.actT > 2.6) this.go('recover');
        break;
      }
      case 'recover':
        if (this.actT >= RECOVER_T) {
          this.finish();
          // 준비·숨 고르기 동안 서 있었으니 바로 옆걸음 (think가 먼저 걸으면 그대로)
          this.stillT = 1e3;
        }
        break;
    }
    return true;
  }

  /** 매 프레임 think 뒤에: 옆걸음, 큰 움직임 시작 */
  after(dt: number, c: Ctx): void {
    const T = TUNE[diffOf(c)];
    const b = this.b;
    const o = b.obj.position;
    const roam = b.roam();
    if (roam === 'none') this.stepT = 0;
    else if (this.stepT > 0) {
      // 옆걸음 동안은 think의 걸음(막힌 쪽으로 걸어가며 제자리걸음 등)을 무르고 옆걸음만
      o.x = this.pre.x;
      o.z = this.pre.z;
      this.stepping(dt, c);
    }
    // 가만히 있던 시간: 기준점에서 STILL_R 안에 머문 시간 (제자리에서 조금씩 흔들리는 것도 서 있는 것으로 친다)
    if (Number.isNaN(this.last.x) || Math.hypot(o.x - this.last.x, o.z - this.last.z) > STILL_R) {
      this.last.copy(o);
      this.stillT = 0;
    } else this.stillT += dt;
    if (roam !== 'none' && this.stepT <= 0 && this.stillT > T.still) this.startStep(c);
    // 큰 움직임: 싸우는 동안 시간을 세다가, 때가 되면 서성일 때(기믹·결재판이 끝났을 때) 바로
    if (roam !== 'none') {
      if (this.bigT < 0) this.bigT = rand(T.every[0], T.every[1]) * 0.6;
      this.bigT -= dt;
      if (this.bigT <= 0 && (roam === 'all' || roam === 'hop') && !b.person.tag.bubble.visible) this.tryBig(c, roam, T);
    }
  }

  /** 결재 완료·판 정리: 하던 움직임을 그만두고 모습을 되돌린다 */
  cancel(): void {
    if (this.act === 'sink' || this.act === 'hide' || this.act === 'rise') this.b.obj.position.y = this.baseY;
    this.act = null;
    this.stepT = 0;
    this.pushT = 0;
    this.b.obj.visible = true;
    this.b.obj.scale.y = 1;
    if (this.shadow) this.shadow.visible = false;
  }

  dispose(): void {
    this.shadow?.removeFromParent();
    (this.shadow?.material as THREE.Material | undefined)?.dispose();
    this.shadow = null;
  }

  // ---------- 안쪽 ----------

  private go(a: Act): void {
    this.act = a;
    this.actT = 0;
    this.steps = 0;
  }

  private finish(): void {
    this.act = null;
    this.b.obj.scale.y = 1;
    this.b.obj.position.y = this.baseY;
    this.b.obj.visible = true;
    if (this.shadow) this.shadow.visible = false;
    this.stillT = 0;
    this.last.copy(this.b.obj.position);
  }

  /** 범위(없으면 구역) 안으로, 장애물 밖으로 */
  private confine(o: THREE.Vector3, c: Ctx, margin = 1): void {
    const b = this.b;
    const r = b.roamRange();
    const a = c.area;
    if (r) {
      o.x = Math.max(r.minX, Math.min(r.maxX, o.x));
      o.z = Math.max(r.minZ, Math.min(r.maxZ, o.z));
    } else {
      o.x = Math.max(a.minX + margin, Math.min(a.maxX - margin, o.x));
      o.z = Math.max(a.minZ + margin, Math.min(a.maxZ - margin, o.z));
    }
    const solids = b.roamSolids(c);
    if (solids) pushOutOf(o, solids, 0.7);
    b.roamFix(o);
  }

  private startStep(c: Ctx): void {
    const o = this.b.obj.position;
    let dx = o.x - c.eye.x;
    let dz = o.z - c.eye.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= d;
      dz /= d;
    }
    if (Math.random() < 0.35) this.stepSide = -this.stepSide;
    // 옆걸음이 대부분, 가까우면 가끔 뒷걸음. 막힌 쪽은 건너뛴다 (0.5m 앞을 대 본다)
    const back = d < 13 && Math.random() < 0.3;
    const tries: [number, number][] = [
      [-dz * this.stepSide, dx * this.stepSide],
      [dz * this.stepSide, -dx * this.stepSide],
      [dx, dz],
      [-dx, -dz],
    ];
    if (back) tries.unshift([dx, dz]);
    let pick = tries[0];
    for (const t of tries) {
      _p.set(o.x + t[0] * 0.5, o.y, o.z + t[1] * 0.5);
      this.confine(_p, c);
      if (Math.hypot(_p.x - o.x, _p.z - o.z) > 0.3) {
        pick = t;
        break;
      }
    }
    this.stepV.set(pick[0], 0, pick[1]);
    this.stepT = rand(0.45, 0.7);
    this.stats.steps++;
  }

  /** 옆걸음 한 프레임 */
  private stepping(dt: number, c: Ctx): void {
    this.stepT -= dt;
    const T = TUNE[diffOf(c)];
    const o = this.b.obj.position;
    const want = T.step * dt;
    const x0 = o.x;
    const z0 = o.z;
    o.x += this.stepV.x * want;
    o.z += this.stepV.z * want;
    this.confine(o, c);
    this.b.stride();
    // 막혔으면 반대쪽으로
    if (Math.hypot(o.x - x0, o.z - z0) < want * 0.3) {
      this.stepSide = -this.stepSide;
      this.stepV.negate();
    }
  }

  private tryBig(c: Ctx, roam: Roam, T: Tune): void {
    const canRush = this.rush && roam === 'all';
    const canVanish = this.vanish;
    let started = false;
    const share = this.stomp ? STOMP_SHARE : T.rushShare;
    const first = canRush && (!canVanish || Math.random() < share) ? 'rush' : 'vanish';
    for (const k of first === 'rush' ? ['rush', 'vanish'] : ['vanish', 'rush']) {
      if (k === 'rush' && canRush) started = this.startRush(c);
      else if (k === 'vanish' && canVanish) started = this.startVanish(c);
      if (started) break;
    }
    // 못 했으면 조금 뒤에 다시
    this.bigT = started ? rand(T.every[0], T.every[1]) * (this.stomp ? STOMP_EVERY : 1) : 0.6;
  }

  private startRush(c: Ctx): boolean {
    const b = this.b;
    const o = b.obj.position;
    const d = Math.hypot(c.eye.x - o.x, c.eye.z - o.z);
    if (d < 4 || d > 24) return false;
    this.baseY = o.y;
    this.stepT = 0;
    this.go('prep');
    this.stats.rush++;
    const s = b.person.look.scale;
    c.fx.text(_v.copy(o).setY(o.y + 2.9 * s), '!', '#ff5a3c', 1.6);
    c.fx.confetti(_v.set(o.x, o.y + 0.15, o.z), 8, 2, DUST, 0.7, 0.55);
    c.sound('pop', b.person.chest, 0.7);
    return true;
  }

  private startVanish(c: Ctx): boolean {
    const b = this.b;
    const o = b.obj.position;
    const r = b.roamRange();
    const a = c.area;
    const p = this.dest;
    let ok = false;
    for (let i = 0; i < 16 && !ok; i++) {
      if (r) {
        p.set(rand(r.minX, r.maxX), o.y, rand(r.minZ, r.maxZ));
      } else {
        const ang = Math.random() * Math.PI * 2;
        const dist = rand(6, 12);
        p.set(c.eye.x + Math.cos(ang) * dist, o.y, c.eye.z + Math.sin(ang) * dist);
      }
      this.confine(p, c, 1.5);
      const far = Math.hypot(p.x - o.x, p.z - o.z);
      const fromEye = Math.hypot(p.x - c.eye.x, p.z - c.eye.z);
      ok = r ? far >= 1.2 : far >= 4 && fromEye >= 4.5 && p.x > a.minX && p.x < a.maxX && p.z > a.minZ && p.z < a.maxZ;
    }
    if (!ok) return false;
    this.baseY = o.y;
    this.stepT = 0;
    this.go('sink');
    this.stats.vanish++;
    c.fx.confetti(_v.set(o.x, o.y + 0.3, o.z), 18, 3, DUST, 1.4, 0.75);
    c.sound('fall', b.person.chest, 0.7);
    return true;
  }

  /** 달려오다 플레이어와 부딪혔다: 달려온 쪽(+ 플레이어가 있던 옆쪽)으로 민다 */
  private bump(c: Ctx): void {
    const T = TUNE[diffOf(c)];
    const o = this.b.obj.position;
    this.hit = true;
    this.stats.rushHit++;
    const side = (c.eye.x - o.x) * -this.dir.z + (c.eye.z - o.z) * this.dir.x >= 0 ? 1 : -1;
    this.pushV.set(this.dir.x - this.dir.z * side * 0.6, 0, this.dir.z + this.dir.x * side * 0.6).normalize();
    this.pushT = PUSH_T;
    this.pushSlow = T.slow;
    c.sound('hit', c.eye, 1);
    c.quake(0.5, c.eye);
    c.fx.confetti(_v.copy(c.eye).setY(c.eye.y - 0.4), 10, 3, DUST, 1.2, 0.6);
    // 부딪히면 체력도 닳는다 (사용자 2026-11-18, 2026-11-20 4칸. 난이도 피해 배율은 Game.hurt가 곱하고, 근접 배율은 kind 'boss'라 안 곱한다).
    // 한 번 달려올 때 한 번만 (this.hit), 맞은 뒤 0.6초 무적 (Game.hurt)
    c.hurt(RUSH_DMG, _v.set(o.x, 1.2, o.z), 'boss');
  }

  private pushing(dt: number, c: Ctx): void {
    if (this.pushT <= 0) return;
    const step = Math.min(dt, this.pushT);
    this.pushT -= dt;
    const v = TUNE[diffOf(c)].push / PUSH_T;
    hostOf(c).shove?.(this.pushV.x * v * step, this.pushV.z * v * step, this.pushSlow);
  }

  private showShadow(c: Ctx, k: number): void {
    if (!this.shadow) {
      shadowGeo ??= new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x111317, transparent: true, opacity: 0, depthWrite: false });
      this.shadow = new THREE.Mesh(shadowGeo, mat);
      this.shadow.renderOrder = 2;
    }
    const m = this.shadow;
    if (!m.parent) c.scene.add(m);
    m.visible = k > 0.01;
    m.position.set(this.dest.x, this.baseY + 0.08, this.dest.z);
    m.scale.setScalar((0.35 + 0.65 * k) * 0.7 * this.b.person.look.scale);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.72 * k;
  }
}

/** 사각형 장애물 밖으로 (r = 몸 반지름) */
export function pushOutOf(o: THREE.Vector3, rects: readonly Rect[], r: number): void {
  for (const q of rects) {
    if (o.x < q.minX - r || o.x > q.maxX + r || o.z < q.minZ - r || o.z > q.maxZ + r) continue;
    const opts: [number, number, number][] = [
      [o.x - (q.minX - r), q.minX - r, o.z],
      [q.maxX + r - o.x, q.maxX + r, o.z],
      [o.z - (q.minZ - r), o.x, q.minZ - r],
      [q.maxZ + r - o.z, o.x, q.maxZ + r],
    ];
    opts.sort((p, s) => p[0] - s[0]);
    o.x = opts[0][1];
    o.z = opts[0][2];
  }
}

// ---------- 총장 프레지던트 캉: 불규칙한 걸음 ----------
// 사라지거나 달려오지 않는다. 방향을 불규칙하게 꺾고, 순간 빨라지고, 짧게 미끄러지고, 무작위로 잠깐 멈춘다.
// 초보는 지금과 비슷하게 천천히, 중급·고급은 더 자주 꺾고 더 빨리. 2단계는 더 빠르게.

interface WanderTune {
  /** 한 번 걷는 시간 [최소, 최대] (적 시간 초) */
  seg: [number, number];
  /** 걷는 빠르기 [최소, 최대] (m/s) */
  speed: [number, number];
  /** 순간 빨라질 몫과 배율 */
  dart: number;
  dartMul: number;
  /** 빨라진 뒤 미끄러질 몫 */
  slide: number;
  /** 잠깐 멈출 몫 */
  halt: number;
}

const WANDER: Record<DiffKey, WanderTune> = {
  easy: { seg: [1.3, 2.6], speed: [1.3, 1.7], dart: 0.08, dartMul: 1.8, slide: 0.3, halt: 0.1 },
  normal: { seg: [0.45, 1.3], speed: [1.5, 2.2], dart: 0.24, dartMul: 2.3, slide: 0.6, halt: 0.14 },
  hard: { seg: [0.35, 1.0], speed: [1.8, 2.5], dart: 0.3, dartMul: 2.6, slide: 0.65, halt: 0.14 },
};

type Gait = 'walk' | 'dart' | 'slide' | 'halt';

export class Wander {
  gait: Gait = 'walk';
  /** 시험용: 방향을 꺾은 횟수, 빨라진 횟수, 미끄러진 횟수, 멈춘 횟수 */
  readonly stats = { turns: 0, darts: 0, slides: 0, halts: 0 };
  private t = 0;
  private vx = 0;
  private vz = 0;
  private dx = 0;
  private dz = 1;
  private spd = 0;

  /**
   * 한 프레임. band 안에서 불규칙하게 움직인다. mul: 빠르기 배율 (결재판을 든 동안 등은 느리게).
   * 걷는 자세를 써야 하면 true.
   */
  update(dt: number, o: THREE.Vector3, band: Rect, px: number, pz: number, key: DiffKey, phase2: boolean, mul = 1): boolean {
    const W = WANDER[key];
    this.t -= dt;
    if (this.t <= 0) this.next(o, band, px, pz, W, phase2);
    let tx = 0;
    let tz = 0;
    let acc = 14;
    if (this.gait === 'walk') {
      tx = this.dx * this.spd;
      tz = this.dz * this.spd;
      acc = 9;
    } else if (this.gait === 'dart') {
      tx = this.dx * this.spd * W.dartMul;
      tz = this.dz * this.spd * W.dartMul;
      acc = 20;
    } else if (this.gait === 'slide') {
      // 힘을 빼고 미끄러진다
      acc = 1.8;
    }
    const k = Math.min(1, acc * dt);
    this.vx += (tx * mul - this.vx) * k;
    this.vz += (tz * mul - this.vz) * k;
    o.x += this.vx * dt;
    o.z += this.vz * dt;
    // 범위 끝에 닿으면 튕기듯 다음 걸음
    let edge = false;
    if (o.x < band.minX || o.x > band.maxX) {
      o.x = Math.max(band.minX, Math.min(band.maxX, o.x));
      this.vx *= -0.3;
      edge = true;
    }
    if (o.z < band.minZ || o.z > band.maxZ) {
      o.z = Math.max(band.minZ, Math.min(band.maxZ, o.z));
      this.vz *= -0.3;
      edge = true;
    }
    if (edge && this.gait !== 'halt') this.t = Math.min(this.t, 0.05);
    return (this.gait === 'walk' || this.gait === 'dart') && Math.hypot(this.vx, this.vz) > 0.25;
  }

  /** 빠르기를 0으로 (공격·서버 폭주로 서 있을 때) */
  stop(): void {
    this.vx = 0;
    this.vz = 0;
  }

  private next(o: THREE.Vector3, band: Rect, px: number, pz: number, W: WanderTune, phase2: boolean): void {
    const prev = this.gait;
    const r = Math.random();
    const dart = W.dart + (phase2 ? 0.08 : 0);
    if (prev === 'dart' && Math.random() < W.slide) this.gait = 'slide';
    else if (prev !== 'halt' && r < W.halt) this.gait = 'halt';
    else if (r < W.halt + dart) this.gait = 'dart';
    else this.gait = 'walk';
    const quick = phase2 ? 0.75 : 1;
    switch (this.gait) {
      case 'walk':
        this.t = rand(W.seg[0], W.seg[1]) * quick;
        break;
      case 'dart':
        this.t = rand(0.25, 0.5);
        this.stats.darts++;
        break;
      case 'slide':
        this.t = rand(0.3, 0.55);
        this.stats.slides++;
        return;
      case 'halt':
        this.t = rand(0.2, 0.6) * quick;
        this.stats.halts++;
        return;
    }
    // 새 방향: 범위 안 무작위 자리 쪽 (플레이어와 너무 가까운 자리는 피한다)
    let x = 0;
    let z = 0;
    for (let i = 0; i < 6; i++) {
      x = rand(band.minX, band.maxX);
      z = rand(band.minZ, band.maxZ);
      if (Math.hypot(x - px, z - pz) > 6 && Math.hypot(x - o.x, z - o.z) > 1.5) break;
    }
    const ddx = x - o.x;
    const ddz = z - o.z;
    const d = Math.hypot(ddx, ddz) || 1;
    const nx = ddx / d;
    const nz = ddz / d;
    if (nx * this.dx + nz * this.dz < Math.cos(Math.PI / 6)) this.stats.turns++;
    this.dx = nx;
    this.dz = nz;
    this.spd = rand(W.speed[0], W.speed[1]) * (phase2 ? 1.15 : 1);
  }
}

export { rand as randRange };
