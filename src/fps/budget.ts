import * as THREE from 'three';
import type { Rect } from './blocks';
import { RING_H, RING_SPEED } from './hazards';
import { Person, type Look, type PoseIn } from './people';
import type { PerkHost } from './props';
import type { DiffKey } from './settings';
import { prepareSpeech } from './speech';
import { canvasTex, FONT } from './textures';

// 1인칭 교직원 모드: 예산팀 직원 기절 이벤트 (2026-11-17).
// - 가상 인물. 머리 위 이름표는 "예산팀 낙선생" (2026-11-21 사용자 지정, 예전 "예산팀 직원"). 흰 셔츠·팔토시·안경, 왼손에 계산기.
//   11차(2026-11-21): 여성 — 흰 블라우스·자주 리본·짙은 치마, 묶은 머리.
// - 교직원 모드에서만, 구역마다 민원 차례(웨이브) 중 한 번: 본관 앞은 2차 민원, 인문과학관 앞·국제학사 앞은 1차 민원이
//   시작되고 몇 초 뒤. 사회과학관 앞·대운동장·해 질 녘 본관 앞은 민원 차례 없이 중간보스·보스부터라 나오지 않는다.
//   학생 모드에는 없다.
// - 플레이어 앞쪽 6.5m쯤(시야 안)으로 옆에서 걸어 들어온다 → 2초 예고: 계산기 두드리는 소리 + 바닥 빨간 원(파동이 닿는 범위)
//   → "돈 좀 아껴쓰세요"(머리 위 말풍선 + 자막)와 함께 발밑에서 바닥 파동이 퍼진다.
// - 파동이 지나갈 때 공중(점프 중)이면 무사, 땅에 있으면 기절: 초보 1초 · 중급 1.5초 · 고급 2초 ("(멈춤)", Game.freeze).
// - 끝나면 말없이 걸어 나간다. 사람이라 다치지 않는다: 도장·무기는 튕겨 나가고 처리·점수와 상관없다.
// - 직원이 와 있는 동안은 민원 차례가 끝나지 않는다 (중간보스와 겹치지 않게, Game.stepWave가 busy를 본다).

/** Game에서 그대로 읽는 것 (Game이 이 모양에 맞는다) */
export interface BudgetGame {
  /** 지금 구역의 싸움 차례 ('wave' = 민원 차례) */
  readonly fight: string;
  /** 지금 민원 차례 번호 (0부터) */
  readonly wave: number;
  readonly jumpY: number;
  readonly vy: number;
  readonly freezeT: number;
  readonly runDiff: DiffKey;
  readonly diff: { readonly speed: number };
  readonly world: { readonly obstacles: Rect[] };
  /** 경비 선생님·상자 (props.ts), 자판기 (vending.ts): 그 위에 서지 않는다 */
  readonly props: { readonly solids: Rect[] };
  readonly vend: { readonly solids: Rect[] };
  /** 잠깐 멈춤. exact: 난이도로 줄이지 않고 그 초 그대로 */
  freeze(sec: number, text: string, exact?: boolean): boolean;
}

const NAME = '예산팀 낙선생';
const LINE = '돈 좀 아껴쓰세요';
const STUN_TEXT = '예산 절감 중… (멈춤)';
/** 기절 시간 (초). 난이도별로 그대로 쓴다 */
const STUN_SEC: Partial<Record<DiffKey, number>> = { easy: 1, normal: 1.5, hard: 2 };
/** 예고 (초) */
const WARN = 2;
/** 파동이 닿는 반지름 (m) = 바닥 빨간 원 */
const REACH = 9;
/** 플레이어 앞 몇 m에 서는지 (말풍선이 위쪽 HUD에 가리지 않을 만큼) */
const SPOT_D = 6.5;
/** 옆에서 몇 m를 걸어 들어오는지 */
const ENTER_D = 9;
const WALK_V = 3.4;
/** 파동 띠 두께의 절반 (맞는 범위) */
const BAND = 0.45;
const SCALE = 1.45;
/** 차례가 시작되고 몇 초 뒤에 오는지 */
const DELAY_MIN = 2.5;
const DELAY_MAX = 4.5;

type State = 'idle' | 'enter' | 'warn' | 'wave' | 'leave';

const LOOK: Look = {
  top: 0xf4f6f8,
  pants: 0x2b2f38,
  tie: 0x8a1f2c,
  skin: 0xf1c7a0,
  hair: 0x221c17,
  brow: 0x221c17,
  hairStyle: 'ponytail',
  jacket: false,
  female: true,
  blouse: true,
  skirt: true,
  glasses: true,
  left: 'none',
  scale: SCALE,
};

export class Budget {
  /** 자리·방향 (사람 모형을 담는다) */
  readonly obj = new THREE.Group();
  readonly person: Person;
  state: State = 'idle';
  /** 이번 판에 나온 구역 번호 (시험: 구역마다 한 번) */
  readonly shown: number[] = [];
  /** 마지막 파동 결과 (시험용): stun = 기절, dodge = 점프로 넘음, miss = 원 밖, held = 이미 멈춰 있었음 */
  last = { result: '', sec: 0 };
  /** 직원을 맞힌 도장 수 (시험용. 다치지 않는다) */
  bounced = 0;
  private t = 0;
  private waitT = -1;
  private beepT = 0;
  private hopT = 0;
  private r = 0;
  private resolved = false;
  private readonly spot = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private readonly pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
  private readonly warnFill: THREE.Mesh;
  private readonly warnEdge: THREE.Mesh;
  private readonly warnCharge: THREE.Mesh;
  private readonly edgeMat: THREE.MeshBasicMaterial;
  private readonly band: THREE.Mesh;
  private readonly bandMat: THREE.MeshBasicMaterial;
  private readonly bandTex: THREE.Texture;
  private bounces: { obj: THREE.Object3D; vel: THREE.Vector3; t: number }[] = [];

  constructor(
    private readonly h: PerkHost,
    private readonly g: BudgetGame,
    /** 지금 구역 번호 (교직원 0~5) */
    private readonly areaNo: () => number,
  ) {
    const p = (this.person = new Person('meeting', NAME, '#ffb4a8', LOOK));
    p.clip.visible = false;
    // 팔토시 (검은 토시) + 왼손 계산기
    const sleeve = new THREE.MeshLambertMaterial({ color: 0x1f2328 });
    for (const arm of [p.armL, p.armR]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.3, 0.27), sleeve);
      m.position.set(0, -0.5, 0);
      m.castShadow = true;
      arm.add(m);
    }
    const calc = buildCalc();
    calc.position.set(0.02, -0.88, 0.13);
    calc.rotation.x = 0.5;
    p.armL.add(calc);
    this.obj.add(p.root);
    this.obj.visible = false;
    h.scene.add(this.obj);
    // 바닥 빨간 원: 옅은 바탕 + 테두리 + 2초 동안 차오르는 원
    const flat = (geo: THREE.BufferGeometry, color: number, opacity: number, y: number, order: number) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -4 - order });
      const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), mat);
      m.position.y = y;
      m.renderOrder = 2 + order;
      m.visible = false;
      h.scene.add(m);
      return m;
    };
    this.warnFill = flat(new THREE.CircleGeometry(1, 56), 0xe5484d, 0.14, 0.05, 0);
    this.warnCharge = flat(new THREE.CircleGeometry(1, 56), 0xff5a5a, 0.22, 0.055, 1);
    this.warnEdge = flat(new THREE.RingGeometry(0.955, 1, 80), 0xff3b3b, 0.85, 0.06, 2);
    this.edgeMat = this.warnEdge.material as THREE.MeshBasicMaterial;
    // 바닥 파동 (회의 소집 고리와 같은 높이·빠르기, 빨간 띠에 ₩)
    const tex = (this.bandTex = bandTex());
    this.bandMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0), this.bandMat);
    this.band.frustumCulled = false;
    this.band.visible = false;
    h.scene.add(this.band);
    prepareSpeech([LINE]);
  }

  /** 와 있는 동안 (이때는 민원 차례가 끝나지 않는다) */
  get busy(): boolean {
    return this.state !== 'idle';
  }

  /** 시험용 (?debug): 지금 바로 부른다. 교직원 모드 민원 차례 중에만 온다 (보스전·중간보스전·학생 모드면 false) */
  call(): boolean {
    if (this.h.mode !== 'staff' || !this.h.playing || this.g.fight !== 'wave' || this.state !== 'idle') return false;
    this.start();
    return true;
  }

  // ---------- 매 단계 ----------

  update(dt: number): void {
    this.stepBounces(dt);
    if (this.h.mode !== 'staff') {
      if (this.state !== 'idle') this.hide();
      return;
    }
    if (this.state === 'idle') {
      this.watch(dt);
      return;
    }
    const h = this.h;
    const pose = this.pose;
    pose.walking = false;
    pose.reach = 0;
    this.t += dt;
    switch (this.state) {
      case 'enter':
        pose.walking = true;
        if (this.walk(this.spot, dt)) {
          this.state = 'warn';
          this.t = 0;
          this.beepT = 0;
          this.showWarn(true);
          // 처음 한 번 안내
          h.hint('budget', h.touch ? '예산팀 낙선생의 파동은 파란 버튼으로 뛰어넘으세요!' : '예산팀 낙선생의 파동은 Space로 뛰어넘으세요!', 3.4);
        }
        break;
      case 'warn': {
        this.face(h.pos, dt);
        pose.reach = 0.75;
        this.beepT -= dt;
        if (this.beepT <= 0) {
          this.beepT = 0.15 + Math.random() * 0.1;
          h.sound('calc', this.obj.position, 0.9);
        }
        const k = Math.min(1, this.t / WARN);
        this.warnCharge.scale.set(REACH * k, 1, REACH * k);
        this.edgeMat.opacity = 0.55 + 0.4 * Math.abs(Math.sin(this.t * 7));
        if (this.t >= WARN) this.shout();
        break;
      }
      case 'wave':
        this.face(h.pos, dt);
        pose.reach = 0.3;
        this.spread(dt);
        break;
      case 'leave':
        if (this.t > 0.5) {
          pose.walking = true;
          if (this.walk(this.exit, dt)) {
            this.hide();
            return;
          }
        }
        break;
    }
    // 도장에 맞으면 살짝 움찔
    if (this.hopT > 0) this.hopT = Math.max(0, this.hopT - dt);
    this.person.root.position.y = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.25) * Math.PI) * 0.12 : 0;
    const p = this.person;
    p.update(dt, pose);
    // 예고 동안: 왼손 계산기를 가슴 앞으로, 오른손으로 두드린다
    if (this.state === 'warn') {
      p.armL.rotation.z = 0.35;
      p.armR.rotation.x = -1.0 + Math.sin(this.t * 30) * 0.12;
      p.armR.rotation.z = -0.42;
    } else {
      p.armR.rotation.z = 0;
    }
  }

  /** 민원 차례가 시작되고 몇 초 뒤에 온다 (구역마다 한 번, 본관 앞은 2차 민원부터) */
  private watch(dt: number): void {
    const g = this.g;
    const a = this.areaNo();
    if (!this.h.playing || g.fight !== 'wave' || this.shown.includes(a) || g.wave < (a === 0 ? 1 : 0)) {
      this.waitT = -1;
      return;
    }
    if (this.waitT < 0) this.waitT = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN);
    this.waitT -= dt;
    if (this.waitT <= 0 && g.freezeT <= 0) this.start();
  }

  /** 걸어 들어올 자리를 정한다: 플레이어 앞 6.5m (구역 끝에 막히면 조금 옆으로), 옆에서 들어온다 */
  private start(): void {
    const h = this.h;
    const p = h.pos;
    this.shown.push(this.areaNo());
    this.waitT = -1;
    let bestErr = Infinity;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0]) {
      const ang = h.yaw + da;
      const [x, z] = this.place(p.x - Math.sin(ang) * SPOT_D, p.z - Math.cos(ang) * SPOT_D, 1.5);
      const err = Math.abs(Math.hypot(x - p.x, z - p.z) - SPOT_D);
      if (err < bestErr - 0.3) {
        bestErr = err;
        this.spot.set(x, 0, z);
      }
    }
    // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    const fx = -Math.sin(h.yaw);
    const fz = -Math.cos(h.yaw);
    const rx = Math.cos(h.yaw);
    const rz = -Math.sin(h.yaw);
    const sp = this.spot;
    const entry = (s: number): [number, number] => this.place(sp.x + rx * s * ENTER_D + fx * 1.5, sp.z + rz * s * ENTER_D + fz * 1.5, 0.6);
    let s = Math.random() < 0.5 ? 1 : -1;
    let [ex, ez] = entry(s);
    if (Math.hypot(ex - sp.x, ez - sp.z) < ENTER_D * 0.7) {
      const [ox, oz] = entry(-s);
      if (Math.hypot(ox - sp.x, oz - sp.z) > Math.hypot(ex - sp.x, ez - sp.z)) {
        s = -s;
        ex = ox;
        ez = oz;
      }
    }
    this.from.set(ex, 0, ez);
    // 나갈 때는 들어온 쪽으로 더 멀리 걸어가 사라진다
    const ox = ex - sp.x;
    const oz = ez - sp.z;
    const ol = Math.hypot(ox, oz) || 1;
    this.exit.set(ex + (ox / ol) * 7, 0, ez + (oz / ol) * 7);
    this.obj.position.copy(this.from);
    this.obj.rotation.y = Math.atan2(sp.x - ex, sp.z - ez);
    this.person.reset();
    this.person.clip.visible = false;
    this.obj.visible = true;
    this.state = 'enter';
    this.t = 0;
    this.last = { result: '', sec: 0 };
  }

  /** "돈 좀 아껴쓰세요" + 발밑에서 파동 */
  private shout(): void {
    const h = this.h;
    this.state = 'wave';
    this.t = 0;
    this.person.say(LINE, 2.4);
    this.warnFill.visible = false;
    this.warnCharge.visible = false;
    this.edgeMat.opacity = 0.85;
    this.r = 0.3;
    this.resolved = false;
    const c = this.obj.position;
    this.band.position.set(c.x, 0.03, c.z);
    this.band.scale.set(this.r, RING_H, this.r);
    this.bandMat.opacity = 1;
    this.band.visible = true;
    h.sound('wave', c, 0.7);
    h.sound('calc', c, 1);
    h.fx.ring(c.x, 0.08, c.z, 0.3, 2.4, 0.35, 0xe5484d);
  }

  /** 파동이 퍼진다: 지나갈 때 땅에 있으면 기절, 공중이면 무사 */
  private spread(dt: number): void {
    const h = this.h;
    const g = this.g;
    const r0 = this.r;
    this.r = Math.min(REACH, this.r + RING_SPEED * g.diff.speed * dt);
    this.band.scale.set(this.r, RING_H, this.r);
    this.bandTex.repeat.x = Math.max(4, Math.round((this.r * Math.PI * 2) / 1.6));
    this.bandMat.opacity = Math.min(1, 0.35 + (REACH - this.r) / 2);
    if (!this.resolved) {
      const c = this.obj.position;
      const d = Math.hypot(h.pos.x - c.x, h.pos.z - c.z);
      if (d <= REACH && d >= r0 - BAND && d <= this.r + BAND) {
        const air = g.jumpY > 0 || g.vy !== 0;
        if (!air) {
          this.resolved = true;
          const sec = STUN_SEC[g.runDiff] ?? 1.5;
          const ok = g.freeze(sec, STUN_TEXT, true);
          this.last = { result: ok ? 'stun' : 'held', sec: ok ? sec : 0 };
          if (ok) h.fx.ring(h.pos.x, 0.1, h.pos.z, 0.4, 2, 0.4, 0xe5484d);
        } else if (d <= this.r - BAND * 0.5) {
          this.resolved = true;
          this.last = { result: 'dodge', sec: 0 };
        }
      }
    }
    if (this.r >= REACH) {
      if (!this.resolved) this.last = { result: 'miss', sec: 0 };
      this.resolved = true;
      this.band.visible = false;
      this.warnEdge.visible = false;
      this.state = 'leave';
      this.t = 0;
    }
  }

  /** 걸어서 다가간다. 다 왔으면 true */
  private walk(to: THREE.Vector3, dt: number): boolean {
    const o = this.obj.position;
    const dx = to.x - o.x;
    const dz = to.z - o.z;
    const d = Math.hypot(dx, dz);
    const step = WALK_V * dt;
    if (d <= step || d < 0.05) {
      o.x = to.x;
      o.z = to.z;
      return true;
    }
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
    this.turn(Math.atan2(dx, dz), dt);
    return false;
  }

  private face(at: THREE.Vector3, dt: number): void {
    this.turn(Math.atan2(at.x - this.obj.position.x, at.z - this.obj.position.z), dt);
  }

  private turn(want: number, dt: number): void {
    let d = want - this.obj.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.obj.rotation.y += d * Math.min(1, dt * 8);
  }

  /** 구역 안(margin), 장애물 밖 자리 */
  private place(x: number, z: number, margin: number): [number, number] {
    const a = this.h.area;
    const M = 0.8;
    const solids = [...this.g.world.obstacles, ...this.g.props.solids, ...this.g.vend.solids];
    for (let it = 0; it < 3; it++) {
      x = Math.max(a.minX + margin, Math.min(a.maxX - margin, x));
      z = Math.max(a.minZ + margin, Math.min(a.maxZ - margin, z));
      for (const o of solids) {
        if (x <= o.minX - M || x >= o.maxX + M || z <= o.minZ - M || z >= o.maxZ + M) continue;
        const opts: [number, number, number][] = [
          [x - (o.minX - M), o.minX - M, z],
          [o.maxX + M - x, o.maxX + M, z],
          [z - (o.minZ - M), x, o.minZ - M],
          [o.maxZ + M - z, x, o.maxZ + M],
        ];
        opts.sort((p, q) => p[0] - q[0]);
        const ok = opts.find(([, nx, nz]) => nx >= a.minX && nx <= a.maxX && nz >= a.minZ && nz <= a.maxZ) ?? opts[0];
        x = ok[1];
        z = ok[2];
      }
    }
    return [x, z];
  }

  private showWarn(on: boolean): void {
    const c = this.obj.position;
    for (const m of [this.warnFill, this.warnCharge, this.warnEdge]) {
      m.visible = on;
      m.position.x = c.x;
      m.position.z = c.z;
    }
    this.warnFill.scale.set(REACH, 1, REACH);
    this.warnEdge.scale.set(REACH, 1, REACH);
    this.warnCharge.scale.set(0.01, 1, 0.01);
  }

  /** (x, z)에 파동이 닿기까지 남은 시간 (적 시간 — hazards.ringEta와 같은 단위). 없으면 Infinity */
  ringEta(x: number, z: number): number {
    if (this.resolved && this.state === 'wave') return Infinity;
    if (this.state !== 'wave' && this.state !== 'warn') return Infinity;
    const c = this.obj.position;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > REACH) return Infinity;
    if (this.state === 'warn') return (WARN - this.t) * this.g.diff.speed + Math.max(0, d - BAND - 0.3) / RING_SPEED;
    if (d + BAND < this.r) return Infinity;
    return Math.max(0, d - BAND - this.r) / RING_SPEED;
  }

  // ---------- 도장 ----------

  /** 날아가는 도장(무기)이 p에서 직원에 닿았나: 닿았으면 튕겨 나가는 모습만 남기고 true (다치지 않는다) */
  stampHit(p: THREE.Vector3, thrown: THREE.Object3D, vel: THREE.Vector3): boolean {
    if (!this.obj.visible) return false;
    const c = this.obj.position;
    if (p.y <= 0 || p.y > 3.1 || Math.hypot(p.x - c.x, p.z - c.z) > 0.6) return false;
    const b = thrown.clone();
    b.position.copy(p);
    this.h.scene.add(b);
    this.bounces.push({ obj: b, vel: new THREE.Vector3(-vel.x * 0.22, 3.4, -vel.z * 0.22), t: 0.75 });
    this.h.sound('hit', p, 0.7);
    this.h.fx.confetti(p, 4, 2, 0xffffff, 1, 0.5);
    this.hopT = 0.25;
    this.bounced++;
    return true;
  }

  private stepBounces(dt: number): void {
    if (!this.bounces.length) return;
    let n = 0;
    for (const b of this.bounces) {
      b.t -= dt;
      b.vel.y -= 14 * dt;
      b.obj.position.addScaledVector(b.vel, dt);
      b.obj.rotation.x += dt * 11;
      if (b.obj.position.y < 0.06) {
        b.obj.position.y = 0.06;
        b.vel.y = Math.abs(b.vel.y) * 0.3;
        b.vel.x *= 0.6;
        b.vel.z *= 0.6;
      }
      if (b.t <= 0) {
        this.h.scene.remove(b.obj);
        continue;
      }
      this.bounces[n++] = b;
    }
    this.bounces.length = n;
  }

  // ---------- 판 ----------

  private hide(): void {
    this.obj.visible = false;
    this.band.visible = false;
    this.showWarn(false);
    this.person.tag.hide();
    this.state = 'idle';
    this.t = 0;
  }

  /** 판을 처음으로 */
  clear(): void {
    this.hide();
    this.shown.length = 0;
    this.waitT = -1;
    this.resolved = false;
    this.last = { result: '', sec: 0 };
    this.bounced = 0;
    for (const b of this.bounces) this.h.scene.remove(b.obj);
    this.bounces = [];
  }

  /** 미리 그리기 (처음 나올 때 끊기지 않게) */
  warm(group: THREE.Group): () => void {
    const items: THREE.Object3D[] = [this.obj, this.band, this.warnFill, this.warnEdge, this.warnCharge];
    items.forEach((o, i) => {
      o.visible = true;
      group.add(o);
      o.position.set(-6 + i * 1.5, -1.6, -5);
    });
    this.person.say(LINE, 1, false);
    this.person.update(0.016, { walking: false, raise: 0, reach: 0.75, wave: false });
    return () => {
      for (const o of items) {
        this.h.scene.add(o);
        o.visible = false;
        o.position.set(0, 0, 0);
      }
      this.warnFill.position.y = 0.05;
      this.warnCharge.position.y = 0.055;
      this.warnEdge.position.y = 0.06;
      this.person.reset();
      this.person.clip.visible = false;
    };
  }
}

// ---------- 모형 ----------

/** 계산기: 짙은 몸통, 초록 화면(숫자), 단추 4×4 */
function buildCalc(): THREE.Group {
  const face = canvasTex(96, 128, (c) => {
    c.fillStyle = '#2b2f38';
    c.fillRect(0, 0, 96, 128);
    c.fillStyle = '#b9d7a8';
    c.fillRect(8, 8, 80, 28);
    c.fillStyle = '#1d2a1a';
    c.font = `bold 20px ${FONT}`;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText('-50,000', 84, 23);
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        c.fillStyle = r === 3 && k === 3 ? '#e5484d' : k === 3 ? '#f5c542' : '#d7dbe0';
        c.fillRect(10 + k * 20, 46 + r * 20, 16, 15);
      }
    }
  });
  const body = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
  const front = new THREE.MeshLambertMaterial({ map: face });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.05), [body, body, body, body, front, body]);
  m.castShadow = true;
  g.add(m);
  return g;
}

/** 파동 띠: 아래는 진한 빨강, 위끝은 밝은 줄, 가운데 ₩ (둘레를 따라 반복) */
function bandTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 64, (g) => {
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(208,32,47,0.95)');
    gr.addColorStop(0.78, 'rgba(229,72,77,0.5)');
    gr.addColorStop(0.82, 'rgba(255,236,236,1)');
    gr.addColorStop(1, 'rgba(255,236,236,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#ffffff';
    g.font = `bold 34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('₩', 64, 32);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
