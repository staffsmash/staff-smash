import * as THREE from 'three';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import { Enemy, type Ctx, type Kind } from './enemies';
import type { Person, PoseIn } from './people';
import { prepareSpeech } from './speech';

// 1인칭 구조 이벤트 (사용자 2026-11-18, 두 모드).
// - 1·2구역 민원 차례 중에 동료(교직원 모드)·친구(학생 모드) 한 명이 업무 더미(둘레를 도는 잡몹 4~6개)에 묻혀 있다.
//   교직원: 새벽 3시 메일, 학생: 과제 마감 알림("D-1"). 둘레 잡몹은 플레이어를 노리지 않는다.
// - 20초 안에 둘레 잡몹을 모두 처리하면 구한 것: "고마워요! 나중에 꼭 도울게요" 하고 걸어 나간다.
//   구한 사람이 있으면 체력 30% 아래에서 조력자가 50%로 오고(구한 사람이 먼저), 아무도 못 구했으면 5% (helpers.ts Rescue.roll).
// - 놓치면 말없이 업무 더미를 들고 걸어 나간다 (남은 잡몹도 같이 사라지고 처리로 치지 않는다).
// - 사람은 다치지 않는다 (적 목록에 없다 — 도장이 지나간다).
// - 묻힌 사람이 있는 동안은 민원 차례가 끝나지 않는다 (Game.stepWave · 학생 mode.ts가 holds를 본다).

export const TRAP_LINE = '도와주세요… 끝이 없어요';
export const THANK_LINE = '고마워요! 나중에 꼭 도울게요';
/** 구할 시간 (초) */
export const TRAP_T = 20;
/** 구조 장면이 나오는 구역 (0부터) */
export const TRAP_AREAS = [0, 1];
/** 플레이어 앞 몇 m에 묻혀 있는지 */
const SPOT_D = 11;
const SAY_EVERY = 4.5;

/** Game이 빌려주는 것 (main.ts trapHost) */
export interface TrapHost {
  readonly scene: THREE.Scene;
  readonly mode: 'staff' | 'student';
  readonly playing: boolean;
  readonly pos: THREE.Vector3;
  readonly yaw: number;
  readonly area: Rect;
  /** 서지 말아야 할 곳 (장애물·상자·자판기) */
  solids(): readonly Rect[];
  areaNo(): number;
  /** 이 구역 구조 장면이 지금 민원 차례 안에 들 수 있는지 (교직원 본관 앞은 2차 민원부터) */
  waveOk(): boolean;
  /** 지금 바로 시작해도 되는지 (예산팀 직원·조력자·멈춤이 없을 때) */
  free(): boolean;
  /** 난이도의 잡몹 수 배율 */
  count(): number;
  /** 둘레 잡몹 하나를 만들어 적 목록에 넣는다 */
  addPile(slot: number, n: number, anchor: THREE.Vector3): PileMob;
  pickTrapped(): { id: string; person: Person; name: string } | null;
  release(id: string, saved: boolean): void;
  banner(title: string, sub?: string): void;
  note(text: string, time?: number): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
}

/** 받침이 있으면 a, 없으면 b (끝이 영문자면 L·M·N·R만 받침) */
function josa(name: string, a: string, b: string): string {
  const code = name.charCodeAt(name.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? a : b;
  return /[LMNR]$/i.test(name) ? a : b;
}

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();

// ---------- 둘레를 도는 잡몹 (업무 더미) ----------

export class PileMob extends Enemy {
  readonly kind: Kind;
  /** 놓쳐서 사람과 같이 걸어 나가는 중 (맞지 않는다, 처리로 치지 않는다) */
  leaving = false;
  private vel = new THREE.Vector3();
  private readonly ang: number;
  private readonly r: number;
  private readonly hy: number;
  private readonly spin: number;

  constructor(c: Ctx, model: THREE.Object3D, kind: Kind, private readonly anchor: THREE.Vector3, slot: number, n: number, scale: number) {
    super();
    this.kind = kind;
    this.obj.add(model);
    this.baseScale = scale;
    this.obj.scale.setScalar(scale);
    this.ang = (slot / n) * Math.PI * 2;
    this.r = 1.25 + (slot % 2) * 0.45;
    this.hy = 1.0 + (slot % 3) * 0.5;
    this.spin = slot % 2 ? -1.5 : 1.7;
    this.hp = this.maxHp = 1;
    this.radius = 0.5 * scale + 0.15;
    this.target(this.obj.position, 0);
    this.center.copy(this.obj.position);
    c.scene.add(this.obj);
  }

  get targetable(): boolean {
    return !this.dead && !this.gone && !this.leaving;
  }

  private target(out: THREE.Vector3, t: number): THREE.Vector3 {
    const a = this.ang + t * this.spin;
    return out.set(this.anchor.x + Math.cos(a) * this.r, this.hy + Math.sin(t * 2.4 + this.ang) * 0.22, this.anchor.z + Math.sin(a) * this.r);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 14 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.x += dt * 9;
      o.rotation.z += dt * 6;
      if (o.position.y < -1) this.gone = true;
      return;
    }
    // 묻힌 사람 둘레를 빙빙 돈다 (넘어지거나 밀려나도 다시 제자리로)
    this.target(_t, this.t);
    _a.subVectors(_t, o.position);
    o.position.addScaledVector(_a, Math.min(1, dt * 6));
    _a.set(c.eye.x, o.position.y, c.eye.z);
    o.lookAt(_a);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 0.6);
  }

  die(dir: THREE.Vector3): void {
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2).addScaledVector(dir, 3);
  }
}

// ---------- 구조 장면 ----------

type State = 'idle' | 'trapped' | 'thanks' | 'out';

export class Trap {
  state: State = 'idle';
  /** 이번 판에 구조 장면이 끝난 구역 */
  readonly done = new Set<number>();
  /** 시험용: 구역별 결과 */
  readonly results: { area: number; name: string; saved: boolean }[] = [];
  private readonly obj = new THREE.Group();
  private readonly anchor = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private readonly pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
  private who: { id: string; person: Person; name: string } | null = null;
  private piles: PileMob[] = [];
  private area = -1;
  private t = 0;
  private sayT = 0;
  private waitT = -1;
  private saved = false;

  constructor(private readonly h: TrapHost) {
    this.obj.visible = false;
    h.scene.add(this.obj);
    prepareSpeech([TRAP_LINE, THANK_LINE]);
  }

  /** 이 구역의 구조 장면이 아직 안 끝났으면 민원 차례를 붙잡는다 */
  holds(): boolean {
    const a = this.h.areaNo();
    if (this.state !== 'idle') return true;
    return TRAP_AREAS.includes(a) && !this.done.has(a) && this.h.waveOk();
  }

  /** HUD 앞에 붙이는 글 ("○○ 님 구조 N초"), 없으면 null */
  status(): string | null {
    if (this.state !== 'trapped' || !this.who) return null;
    const s = Math.max(0, Math.ceil(TRAP_T - this.t));
    return this.h.mode === 'student' ? `${this.who.name} 구조 ${s}초` : `${this.who.name} 님 구조 ${s}초`;
  }

  /** 시험용 (?debug): 지금 바로 (민원 차례가 아니어도) */
  call(): boolean {
    if (this.state !== 'idle') return false;
    return this.begin(this.h.areaNo());
  }

  update(dt: number): void {
    const h = this.h;
    if (this.state === 'idle') {
      const a = h.areaNo();
      if (!h.playing || !TRAP_AREAS.includes(a) || this.done.has(a) || !h.waveOk()) {
        this.waitT = -1;
        return;
      }
      if (this.waitT < 0) this.waitT = 2.5 + Math.random() * 1.5;
      this.waitT -= dt;
      if (this.waitT <= 0 && h.free()) this.begin(a);
      return;
    }
    const who = this.who;
    if (!who) return;
    this.t += dt;
    const pose = this.pose;
    pose.walking = false;
    pose.wave = false;
    pose.raise = 0;
    switch (this.state) {
      case 'trapped': {
        // 업무 더미에 묻혀 손을 흔든다 (살짝 들썩)
        pose.wave = true;
        pose.raise = 0.25;
        this.face(h.pos.x, h.pos.z, dt);
        who.person.root.position.y = Math.abs(Math.sin(this.t * 7)) * 0.05;
        this.sayT -= dt;
        if (this.sayT <= 0) {
          this.sayT = SAY_EVERY;
          who.person.say(TRAP_LINE, 2.6);
        }
        if (this.piles.every((p) => p.dead || p.gone)) this.win();
        else if (this.t >= TRAP_T) this.lose();
        break;
      }
      case 'thanks':
        this.face(h.pos.x, h.pos.z, dt);
        pose.wave = this.t > 1.2;
        who.person.root.position.y = 0;
        if (this.t >= 2.8) this.go('out');
        break;
      case 'out': {
        pose.walking = true;
        // 놓쳤으면 업무 더미를 안고 (결재판 팔을 든 채) 걸어 나간다
        if (!this.saved) pose.raise = 0.35;
        const o = this.obj.position;
        _a.set(this.exit.x - o.x, 0, this.exit.z - o.z);
        const d = _a.length();
        if (d < 0.3 || this.t > 5) {
          this.finish();
          return;
        }
        o.addScaledVector(_a.normalize(), Math.min(d, 3.6 * dt));
        this.face(this.exit.x, this.exit.z, dt);
        this.anchor.set(o.x, 0, o.z);
        break;
      }
    }
    who.person.update(dt, pose);
  }

  /** 판을 처음으로 (구역 넘어감·재시작) */
  clear(): void {
    if (this.who) this.h.release(this.who.id, false);
    this.hide();
    for (const p of this.piles) if (!p.dead) p.gone = true;
    this.piles = [];
    this.done.clear();
    this.results.length = 0;
    this.state = 'idle';
    this.waitT = -1;
  }

  private begin(a: number): boolean {
    const h = this.h;
    const who = h.pickTrapped();
    this.done.add(a);
    if (!who) return false;
    this.who = who;
    this.area = a;
    this.saved = false;
    this.t = 0;
    this.sayT = 0.4;
    this.waitT = -1;
    // 자리: 플레이어 앞 11m (구역 끝·장애물을 피해 옆으로)
    const p = h.pos;
    let best = -1;
    for (const da of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
      const ang = h.yaw + da;
      const [x, z] = this.place(p.x - Math.sin(ang) * SPOT_D, p.z - Math.cos(ang) * SPOT_D, 2.5);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > best + 0.5) {
        best = d;
        this.anchor.set(x, 0, z);
      }
    }
    // 나가는 곳: 플레이어 반대쪽으로 14m
    const ox = this.anchor.x - p.x;
    const oz = this.anchor.z - p.z;
    const ol = Math.hypot(ox, oz) || 1;
    const [ex, ez] = this.place(this.anchor.x + (ox / ol) * 14, this.anchor.z + (oz / ol) * 14, 0.6);
    this.exit.set(ex, 0, ez);
    const person = who.person;
    person.reset();
    person.root.position.set(0, 0, 0);
    this.obj.add(person.root);
    this.obj.position.copy(this.anchor);
    this.obj.rotation.y = Math.atan2(p.x - this.anchor.x, p.z - this.anchor.z);
    this.obj.visible = true;
    // 둘레 업무 더미: 4~6개 (난이도 잡몹 수)
    const n = Math.max(4, Math.min(6, Math.round(5 * h.count() + (Math.random() < 0.5 ? 0 : 1))));
    this.piles = [];
    for (let i = 0; i < n; i++) this.piles.push(h.addPile(i, n, this.anchor));
    this.state = 'trapped';
    if (h.mode === 'student') h.banner(`친구 ${who.name}${josa(who.name, '이', '가')} 과제에 묻혔어요!`, '둘레 서류를 처리하세요');
    else h.banner(`${who.name} 님이 민원에 묻혔어요!`, '둘레 민원을 처리하세요');
    h.sound('volley', this.anchor, 0.8);
    return true;
  }

  private win(): void {
    const who = this.who as { id: string; person: Person; name: string };
    this.saved = true;
    this.results.push({ area: this.area, name: who.name, saved: true });
    who.person.say(THANK_LINE, 2.6);
    this.h.note(this.h.mode === 'student' ? `${who.name}${josa(who.name, '을', '를')} 구했어요!` : `${who.name} 님을 구했어요!`, 2.4);
    this.h.sound('open', this.anchor, 0.8);
    this.h.release(who.id, true);
    this.go('thanks');
  }

  private lose(): void {
    const who = this.who as { id: string; person: Person; name: string };
    this.saved = false;
    this.results.push({ area: this.area, name: who.name, saved: false });
    // 남은 업무 더미는 사람과 같이 나간다 (맞지 않는다)
    for (const p of this.piles) if (!p.dead) p.leaving = true;
    this.h.release(who.id, false);
    this.go('out');
  }

  private finish(): void {
    for (const p of this.piles) if (!p.dead) p.gone = true;
    this.piles = [];
    this.hide();
    this.state = 'idle';
  }

  private hide(): void {
    if (this.who) {
      this.who.person.tag.hide();
      this.obj.remove(this.who.person.root);
    }
    this.who = null;
    this.obj.visible = false;
  }

  private go(s: State): void {
    this.state = s;
    this.t = 0;
  }

  private face(x: number, z: number, dt: number): void {
    const o = this.obj;
    let d = Math.atan2(x - o.position.x, z - o.position.z) - o.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    o.rotation.y += d * Math.min(1, dt * 6);
  }

  /** 구역 안, 장애물 밖으로 (budget.ts와 같은 방식) */
  private place(x: number, z: number, margin: number): [number, number] {
    const a = this.h.area;
    const M = 1.6;
    const solids = this.h.solids();
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
}
