import * as THREE from 'three';
import { lambert, type Rect } from './blocks';
import { BossMove, diffOf, randRange, solidsOf, Wander, type Mover, type Roam } from './bossmove';
import { Enemy, type Ctx, type SheetKind } from './enemies';
import { FC, PODIUM } from './field';
import { LOOKS, Person, peopleKit, type Look, type PoseIn, type Who } from './people';
import type { DiffKey } from './settings';
import { FRONT_X } from './social';

// 1인칭 시험판 v4의 보스: 사람 넷 (2026-11-13 사용자 결정, 홍보실·비서실 확인).
// 사람 보스는 다치지 않는다. 막대는 체력이 아니라 "결재 진행"이고, 도장은 들고 있는 결재판에 찍힌다.
// 결재판을 머리 위로 들어 올린 동안만 약점(크게 진행). 다 차면 승인 도장을 찍고 한마디 하고 퇴근한다
// (총장은 선 채로 승인한다).
// 1. 김총괄 (교직원)  — 본관 앞: 바닥의 강의실 열쇠 미끼, 대관 신청서 부채꼴 (대관 총괄, 가상 인물).
//    11차: 뿔테안경, 쿵쿵 발 구르기(1초 예고) 뒤 빠르게 달려오기 (bossmove.ts stomp)
// 2. 김보고 처장       — 사회과학관 앞: 몸 둘레 메일 폭풍, "보고해!" 말풍선
// 3. 회의회의부총장 (여) — 대운동장: 단상에서 회의 소집 고리(점프), 회의 자료, 말풍선 → 2단계는 운동장을 걸어서 돈다
// 4. 총장 프레지던트 캉 — 해 질 녘 본관 앞: 거대 도장 → 2단계 수강신청 서버 폭주.
//    11차 새 기술: ① MOU 서명선(1단계부터) ② 기념 촬영 플래시 ③ 표창장(학생: 학위) 수여 부메랑 (2단계) — bossskills.ts

/** 약점(들어 올린 결재판)에 맞힌 도장 한 개의 진행 */
export const WEAK_DMG = 4;
/** 몸·내린 결재판에 맞힌 도장 한 개의 진행 (결재판을 들었을 때를 노리게) */
export const BODY_DMG = 0.5;
/** 한 번 들어 올린 결재판에 받는 약점 도장 수 (넘으면 내린다) */
const WINDOW_MAX = 3;

export const BOSS_NAMES: Record<Who, string> = {
  chonggwal: '김총괄 (교직원)',
  bogo: '김보고 처장',
  meeting: '회의회의부총장',
  president: '총장 프레지던트 캉',
};

/** 결재에 필요한 양 (난이도 bossHp를 곱한다) */
export const BOSS_HP: Record<Who, number> = { chonggwal: 50, bogo: 70, meeting: 85, president: 95 };

/** 처음 만났을 때 띠 아래 공략 한 줄 */
export const BOSS_HINTS: Record<Who, string> = {
  chonggwal: '쿵쿵 발을 구르면 곧 달려와요 — 옆으로 비키세요. 바닥의 열쇠는 미끼!',
  bogo: '빨간 그림자에 떨어지는 "보고해!"를 피하세요',
  meeting: '바닥으로 퍼지는 회의 소집 고리는 점프로 넘으세요',
  president: '빨간 그림자에 떨어지는 거대 도장을 피하며 결재받으세요',
};

/** 회의회의부총장 (여, 11차): 2D 회의소집 부총장 색 그대로 + 긴 머리, 넥타이 없음. 블라우스·단발 공통 외형이 생기면 바꾼다 */
export const MEETING_LOOK: Look = { ...LOOKS.meeting, hair: 0x5a5450, brow: 0x3a3430, hairStyle: 'long', noTie: true, female: true, blouse: true, neck: 'ribbon' };

/** 김총괄 뿔테안경 (굵은 검은 테). 모형은 판마다 다시 쓰므로 한 번만 붙인다 */
export function addHornRims(p: Person): void {
  if (p.head.userData.hornRims) return;
  p.head.userData.hornRims = true;
  const mat = lambert(0x141414);
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(peopleKit().unit, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    p.head.add(m);
  };
  for (const x of [-0.106, 0.106]) {
    add(0.17, 0.035, 0.03, x, 0.342, 0.25); // 위 굵은 테
    add(0.17, 0.018, 0.02, x, 0.226, 0.25);
    add(0.022, 0.12, 0.02, x - 0.077, 0.284, 0.25);
    add(0.022, 0.12, 0.02, x + 0.077, 0.284, 0.25);
  }
  add(0.05, 0.02, 0.02, 0, 0.31, 0.25); // 코받침 다리
  for (const x of [-0.265, 0.265]) add(0.02, 0.025, 0.26, x, 0.33, 0.12); // 안경다리
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

type St =
  | 'sleep'
  | 'enter'
  | 'idle'
  | 'act'
  | 'lure'
  | 'charge'
  | 'stun'
  | 'descend'
  | 'server'
  | 'review'
  | 'approve'
  | 'leave'
  | 'stay'
  // 총장 11차 새 기술: MOU 서명 · 기념 촬영 · 표창장(학위) 수여
  | 'sign'
  | 'photo'
  | 'award';

export abstract class PersonBoss extends Enemy implements Mover {
  readonly kind = 'boss' as const;
  readonly who: Who;
  readonly person: Person;
  readonly bossName: string;
  phase2 = false;
  /** 결재판 가운데 (약점) */
  readonly weakPoint = new THREE.Vector3();
  state: St = 'enter';
  protected stateT = 0;
  protected yaw = 0;
  protected raise = 0;
  protected raiseTo = 0;
  protected reach = 0;
  protected reachTo = 0;
  protected walking = false;
  protected waving = false;
  protected exitPt = new THREE.Vector3();
  protected chargeDmg = 0;
  /** 이번에 결재판을 든 동안 받은 약점 도장 수 */
  protected windowHits = 0;
  protected approveLine: string;
  /** 결재 뒤 떠오르는 글자 (학생 모드: "반려 철회!" 등) */
  protected doneText = '결재 완료!';
  /** 걸어 나가며 하는 말 (비우면 말없이 나간다: 학생 모드는 결재 대사에 이미 들어 있다) */
  protected leaveLine: string;
  private leaveT = 0;
  /** 공통 움직임: 옆걸음·사라졌다 나타나기·달려오기 (bossmove.ts). 총장은 null (Wander로 따로 움직인다) */
  protected mover: BossMove | null = new BossMove(this);

  /** name·hp: 학생 모드 인물은 이름과 결재 양을 따로 준다 */
  constructor(
    c: Ctx,
    person: Person,
    at: THREE.Vector3,
    exit: THREE.Vector3,
    approveLine: string,
    leaveLine = '퇴근합니다…',
    name = BOSS_NAMES[person.who],
    hp = BOSS_HP[person.who],
  ) {
    super();
    this.who = person.who;
    this.person = person;
    this.bossName = name;
    this.approveLine = approveLine;
    this.leaveLine = leaveLine;
    person.reset();
    this.obj.add(person.root);
    this.obj.position.copy(at);
    this.exitPt.copy(exit);
    this.hp = this.maxHp = hp;
    this.radius = 0.9 * person.look.scale;
    c.scene.add(this.obj);
    this.faceNow(c.eye.x, c.eye.z);
    this.syncPose(0);
  }

  get targetable(): boolean {
    return !this.dead && !this.gone && this.state !== 'sleep' && !this.mover?.hidden;
  }

  // ---------- 공통 움직임에 내주는 것 (bossmove.ts Mover) ----------

  /** 지금 쓸 수 있는 움직임: 서성일 때는 모두, 결재판을 든 동안·기믹 중에는 옆걸음만, 등장·단계 연출 중에는 없음 */
  roam(): Roam {
    switch (this.state) {
      case 'idle':
        return 'all';
      case 'sleep':
      case 'enter':
      case 'descend':
      case 'server':
      case 'approve':
      case 'leave':
      case 'stay':
        return 'none';
      default:
        return 'step';
    }
  }

  roamRange(): Rect | null {
    return null;
  }

  roamSolids(c: Ctx): readonly Rect[] | null {
    return solidsOf(c);
  }

  roamFix(_o: THREE.Vector3): void {}

  stride(): void {
    this.walking = true;
  }

  roamFace(x: number, z: number, dt: number, rate: number): void {
    this.faceTo(x, z, dt, rate);
  }

  /** 결재판을 머리 위로 들고 있는지 (약점) */
  get open(): boolean {
    return !this.dead && this.raise > 0.72;
  }

  /** 진행 0~1 */
  get progress(): number {
    return 1 - this.hp / this.maxHp;
  }

  protected setState(s: St): void {
    this.state = s;
    this.stateT = 0;
  }

  protected say(text: string, sec = 1.8): void {
    this.person.say(text, sec);
  }

  protected faceNow(x: number, z: number): void {
    this.yaw = Math.atan2(x - this.obj.position.x, z - this.obj.position.z);
    this.obj.rotation.y = this.yaw;
  }

  protected faceTo(x: number, z: number, dt: number, rate = 5): void {
    const want = Math.atan2(x - this.obj.position.x, z - this.obj.position.z);
    this.yaw += wrap(want - this.yaw) * Math.min(1, dt * rate);
    this.obj.rotation.y = this.yaw;
  }

  /** 목표로 걷는다 (구역 밖으로는 안 나간다). 도착하면 true */
  protected walkTo(x: number, z: number, speed: number, dt: number, c: Ctx | null, near = 0.3): boolean {
    const o = this.obj.position;
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d <= near) return true;
    const step = Math.min(d, speed * dt);
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
    if (c) {
      const a = c.area;
      o.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.x));
      o.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.z));
    }
    this.walking = true;
    return false;
  }

  /** 플레이어와 거리를 두고 옆걸음한다 */
  protected keepAway(c: Ctx, dt: number, dist: number, speed: number, side: number): void {
    const o = this.obj.position;
    let dx = o.x - c.eye.x;
    let dz = o.z - c.eye.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // 원하는 거리 쪽으로 + 옆으로
    const tx = c.eye.x + dx * dist - dz * side * 3;
    const tz = c.eye.z + dz * dist + dx * side * 3;
    this.walkTo(tx, tz, speed, dt, c, 1.2);
  }

  /** 종이 부채꼴 (결재판 쪽 손에서) */
  protected fan(c: Ctx, kind: SheetKind, n: number, speed: number, spread: number): void {
    const from = _a.copy(this.person.chest);
    from.y += 0.4 * this.person.look.scale;
    const base = Math.atan2(c.eye.x - from.x, c.eye.z - from.z);
    const flat = Math.hypot(c.eye.x - from.x, c.eye.z - from.z);
    const pitch = Math.atan2(c.eye.y - from.y, flat);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      _b.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch)).multiplyScalar(speed);
      c.sheet(from, _b, kind);
    }
    c.sound('volley', from, 0.9);
  }

  /** 결재판을 머리 위로 든다 (약점이 열린다) */
  protected openWindow(): void {
    this.raiseTo = 1;
    this.windowHits = 0;
  }

  /** 도장이 맞았다 (Game이 부른다): 결재판에 자국 + 반짝. 들어 올린 결재판에 세 번 찍히면 내린다 */
  stamped(weak: boolean, c: Ctx): void {
    this.person.stampMark(weak);
    c.fx.confetti(this.person.clipCenter, weak ? 10 : 4, 2.2, 0xf5c542, 1, 0.45);
    if (!weak) return;
    if (this.state === 'charge' || this.state === 'stun') this.chargeDmg += WEAK_DMG;
    if (++this.windowHits >= WINDOW_MAX) this.raiseTo = 0;
  }

  /** 맞아도 밀리지 않는다 */
  knock(): void {}

  /** 결재 완료: 승인 도장 → 한마디 → (총장 빼고) 퇴근 */
  die(): void {
    this.mover?.cancel();
    this.setState('approve');
    this.raiseTo = 1;
    this.reachTo = 0;
    this.person.stampMark(true);
    // 총장은 마지막 도장 두 개가 찍힐 때까지 말풍선을 둔다
    this.say(this.approveLine, this.who === 'president' ? 5 : 2.4);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    this.walking = false;
    this.waving = false;
    if (this.dead) this.afterApprove(dt, c);
    else if (!this.mover?.drive(dt, c)) {
      // 사라지기·달려오기 중에는 think를 쉰다
      this.think(dt, c);
      this.mover?.after(dt, c);
    }
    this.syncPose(dt);
  }

  protected abstract think(dt: number, c: Ctx): void;

  private afterApprove(dt: number, c: Ctx): void {
    if (this.state === 'approve') {
      this.faceTo(c.eye.x, c.eye.z, dt, 4);
      if (this.stateT > 0.5 && this.stateT - dt <= 0.5) {
        this.person.stampMark(true);
        c.fx.text(_a.copy(this.person.clipCenter).setY(this.person.clipCenter.y + 0.6), this.doneText, '#7CFC9A', 0.8);
        c.sound('process', this.person.clipCenter, 1);
      }
      if (this.stateT >= 2.6) {
        if (this.who === 'president') {
          this.setState('stay');
          return;
        }
        this.setState('leave');
        this.raiseTo = 0;
        if (this.leaveLine) this.say(this.leaveLine, 2.6);
      }
    } else if (this.state === 'leave') {
      this.leaveT += dt;
      this.waving = this.stateT < 1.4;
      if (this.stateT > 0.6) {
        const arrived = this.walkTo(this.exitPt.x, this.exitPt.z, 2.6, dt, null, 0.6);
        this.faceTo(this.exitPt.x, this.exitPt.z, dt, 6);
        if (arrived || this.leaveT > 9) {
          this.obj.visible = false;
          this.gone = true;
        }
      }
    } else if (this.state === 'stay') {
      this.faceTo(c.eye.x, c.eye.z, dt, 3);
      this.raiseTo = 0;
      this.reachTo = Math.sin(this.stateT * 2) > 0.6 ? 1 : 0.6;
    }
  }

  private syncPose(dt: number): void {
    this.raise += (this.raiseTo - this.raise) * Math.min(1, dt * 7);
    this.reach += (this.reachTo - this.reach) * Math.min(1, dt * 8);
    const p: PoseIn = { walking: this.walking, raise: this.raise, reach: this.reach, wave: this.waving };
    this.person.update(dt, p);
    this.center.copy(this.person.chest);
    this.weakPoint.copy(this.person.clipCenter);
  }

  /**
   * 도장이 p0 → p1 로 움직이는 동안 맞았는지. 0 = 안 맞음, 1 = 맞음(몸·결재판), 2 = 약점(들어 올린 결재판).
   * 사람 보스는 몸 전체로 넉넉하게 맞는다.
   */
  hitTest(_p0: THREE.Vector3, p: THREE.Vector3): 0 | 1 | 2 {
    if (!this.targetable) return 0;
    const s = this.person.look.scale;
    if (p.distanceTo(this.person.clipCenter) < 0.42 * s + 0.2) return this.open ? 2 : 1;
    const o = this.obj.position;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const lx = (dx * cy - dz * sy) / s;
    const lz = (dx * sy + dz * cy) / s;
    const ly = (p.y - o.y) / s;
    return Math.abs(lx) < 0.66 && ly > 0 && ly < 2.3 && Math.abs(lz) < 0.52 ? 1 : 0;
  }

  dispose(): void {
    this.person.root.removeFromParent();
    this.person.updateStorm(0);
    this.mover?.dispose();
  }
}

// ---------- 1. 김총괄 (교직원) ----------
// 대관(시설 대여)을 총괄하는 가상 교직원. 대관 신청서 부채꼴과 바닥의 강의실 열쇠 미끼를 번갈아 쓴다.
// 대사는 사용자가 정한 둘("제가 왜 협조하죠?", "대관 불가입니다")에 결재·퇴근 한마디만 더한다.

export class Chonggwal extends PersonBoss {
  private keyAct = false;
  private actT = 3.2;
  private cycle = 0;
  private lineT = 11;
  private side = 1;
  private sideT = 0;
  /** 미끼를 깔아 둔 동안 바닥에 남은 열쇠 수 (밟혔는지 보려고) */
  private keysLeft = 0;

  constructor(c: Ctx, person: Person) {
    // 본관 문에서 걸어 나온다
    super(c, person, new THREE.Vector3(0, 0, -19.2), new THREE.Vector3(0, 0, -20), '이번만 대관 승인입니다.', '열쇠 반납하고 퇴근합니다…');
    addHornRims(person);
    // 쿵쿵 발을 구르며 예고하고 빠르게 달려온다 (더 자주)
    if (this.mover) this.mover.stomp = true;
  }

  protected think(dt: number, c: Ctx): void {
    switch (this.state) {
      case 'enter':
        if (this.stateT < dt * 1.5) this.say('제가 왜 협조하죠?', 2.8);
        this.walkTo(0, -9, 2.2, dt, null, 0.3);
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT > 3.0) this.setState('idle');
        break;
      case 'idle':
        this.sideT -= dt;
        if (this.sideT <= 0) {
          this.side = -this.side;
          this.sideT = 3 + Math.random() * 2;
        }
        this.keepAway(c, dt, 10, 2.0, this.side);
        this.avoidBeds();
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.lineT -= dt;
        if (this.lineT <= 0) {
          this.lineT = 10 + Math.random() * 5;
          this.say('제가 왜 협조하죠?', 2.2);
        }
        this.actT -= dt;
        if (this.actT <= 0) {
          this.cycle++;
          // 열쇠와 대관 신청서를 번갈아 (바닥에 열쇠가 남아 있으면 신청서)
          this.keyAct = this.cycle % 2 === 0 && c.hz.keysOut() === 0;
          this.setState('act');
          this.reachTo = 1;
        }
        break;
      case 'act': {
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        const keys = this.keyAct;
        if (this.stateT >= 0.55 && this.stateT - dt < 0.55) {
          if (keys) {
            c.hz.scatterKeys(this.person.chest, c.eye.x, c.eye.z, 6, c.area);
            c.sound('pickup', this.person.chest, 0.7);
          } else {
            this.fan(c, 'rental', 5, 8.5, 0.17);
            this.say('대관 불가입니다', 1.8);
            this.lineT = Math.max(this.lineT, 3);
          }
        }
        if (this.stateT >= 0.9) {
          this.reachTo = 0;
          if (keys) {
            // 열쇠를 뿌려 놓고 결재판을 든 채 기다린다 (이때가 빈틈)
            this.setState('lure');
            this.openWindow();
            this.keysLeft = c.hz.keysOut();
          } else {
            this.setState('idle');
            this.actT = 3.2;
          }
        }
        break;
      }
      case 'lure': {
        this.faceTo(c.eye.x, c.eye.z, dt);
        // 열쇠를 밟으면 (멈춤과 함께) 한마디
        const n = c.hz.keysOut();
        if (n < this.keysLeft) {
          this.say('대관 불가입니다', 1.8);
          this.lineT = Math.max(this.lineT, 3);
        }
        this.keysLeft = n;
        if (this.stateT >= 3.4 || n === 0) {
          this.raiseTo = 0;
          c.hz.recallKeys(this.person.chest);
          this.setState('idle');
          this.actT = 3.0;
        }
        break;
      }
      default:
        break;
    }
  }

  /** 본관 앞 화단 안으로는 안 들어간다 */
  private avoidBeds(): void {
    const o = this.obj.position;
    if (o.z > -14.6 && o.z < -5.4 && Math.abs(o.x) > 6.6) o.x = Math.sign(o.x) * 6.6;
  }

  /** 옆걸음·사라졌다 나타날 자리도 화단을 피한다 */
  roamFix(o: THREE.Vector3): void {
    if (o.z > -14.6 && o.z < -5.4 && Math.abs(o.x) > 6.6) o.x = Math.sign(o.x) * 6.6;
  }
}

// ---------- 2. 김보고 처장 ----------

export class Bogo extends PersonBoss {
  private volleyT = 4;
  private mailT = 6;
  private reportT = 5;
  private bombT = 6;
  private storm = 0;
  private side = 1;
  private sideT = 0;

  constructor(c: Ctx, person: Person) {
    // 사회과학관 현관에서 나온다
    super(c, person, new THREE.Vector3(FRONT_X - 1.5, 0, 0), new THREE.Vector3(FRONT_X - 0.5, 0, 0), '보고 잘 받았어.');
  }

  protected think(dt: number, c: Ctx): void {
    this.storm = Math.min(1, this.storm + dt * 0.5);
    this.person.updateStorm(this.storm);
    switch (this.state) {
      case 'enter':
        if (this.stateT < dt * 1.5) this.say('보고해!', 2.2);
        this.walkTo(108, 0, 2.4, dt, null, 0.3);
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT > 3.2) this.setState('idle');
        break;
      case 'idle':
        this.sideT -= dt;
        if (this.sideT <= 0) {
          this.side = -this.side;
          this.sideT = 3.5 + Math.random() * 2;
        }
        this.keepAway(c, dt, 11, 1.8, this.side);
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.volleyT -= dt;
        if (this.volleyT <= 0) {
          this.volleyT = this.phase2 ? 3.2 : 4.2;
          this.fan(c, 'paper', this.phase2 ? 7 : 5, 10.5, 0.13);
        }
        this.mailT -= dt;
        if (this.mailT <= 0) {
          this.mailT = this.phase2 ? 5.5 : 7;
          if (c.minions() < 5) {
            for (const s of [-1, 1]) c.spawnAt('mail', _a.set(s * 1.6, 2.2, 0.6).applyQuaternion(this.obj.quaternion).add(this.obj.position));
            c.sound('volley', this.person.chest, 0.6);
          }
        }
        if (this.phase2) {
          this.bombT -= dt;
          if (this.bombT <= 0) {
            this.bombT = 8.5;
            c.spawnAt('bomb', _a.set(0, 1.4, 1.6).applyQuaternion(this.obj.quaternion).add(this.obj.position));
          }
        }
        this.reportT -= dt;
        if (this.reportT <= 0) {
          this.setState('act');
          this.reachTo = 1;
        }
        if (!this.phase2 && this.hp <= this.maxHp / 2) {
          this.phase2 = true;
          this.bombT = 2;
          c.banner('메일 폭풍이 거세집니다!', '서류 뭉치를 처장 곁에서 터뜨리면 결재가 크게 진행됩니다');
        }
        break;
      case 'act':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (this.stateT >= 0.5 && this.stateT - dt < 0.5) {
          // 플레이어 근처에 "보고해!"를 던진다 (떨어질 자리에 빨간 그림자)
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 1.2;
          const ar = c.area;
          const x = Math.max(ar.minX + 1, Math.min(ar.maxX - 1, c.eye.x + Math.cos(a) * r));
          const z = Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, c.eye.z + Math.sin(a) * r));
          c.hz.throwReport(_a.copy(this.person.chest).setY(this.person.chest.y + 0.8), x, z);
          this.say('보고해!', 1.4);
        }
        if (this.stateT >= 0.9) {
          // 보고를 기다리며 결재판을 들고 서 있다 (빈틈)
          this.reachTo = 0;
          this.openWindow();
          this.setState('lure');
        }
        break;
      case 'lure':
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT >= 2.6) {
          this.raiseTo = 0;
          this.reportT = this.phase2 ? 6 : 7.5;
          this.setState('idle');
        }
        break;
      default:
        break;
    }
  }

  die(): void {
    super.die();
    this.storm = 0;
    this.person.updateStorm(0);
  }
}

// ---------- 3. 회의회의부총장 ----------

/** 단상 위 서는 자리 */
const STAND = new THREE.Vector3(PODIUM.x, 1.1, PODIUM.z + 0.4);
/** 1단계에 단상 위에서 옆걸음하는 범위 (단상 폭 6.2m, 연단 뒤) */
const PODIUM_TOP: Rect = { minX: PODIUM.x - 2.3, maxX: PODIUM.x + 2.3, minZ: STAND.z - 0.1, maxZ: STAND.z + 0.6 };

export class Meeting extends PersonBoss {
  private volleyT = 4;
  private summonT = 10;
  private chargeIn = 4.5;
  private pending = 0;
  private pendingT = 0;
  private ang = Math.PI / 2;
  private charges = 0;
  private readonly descendFrom = STAND.clone();

  constructor(c: Ctx, person: Person) {
    super(c, person, STAND, new THREE.Vector3(FC.x - 6, 0, 56), '오늘 회의는 여기까지!');
    this.state = 'sleep';
  }

  /** 플레이어가 운동장에 들어왔다 */
  wake(): void {
    if (this.state === 'sleep') this.setState('enter');
  }

  /** 1단계는 단상 위에서만 (옆걸음·연단 뒤로 사라졌다 다른 쪽에서 나타나기), 2단계는 운동장 어디서나 */
  roam(): Roam {
    const r = super.roam();
    return r === 'all' && !this.phase2 ? 'hop' : r;
  }

  roamRange(): Rect | null {
    return this.phase2 ? null : PODIUM_TOP;
  }

  roamSolids(c: Ctx): readonly Rect[] | null {
    return this.phase2 ? super.roamSolids(c) : null;
  }

  private get chargeTime(): number {
    return this.phase2 ? 1.9 : 2.3;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'sleep') {
      this.faceTo(FC.x, FC.z - 30, dt, 2);
      return;
    }
    // 2단계: 단상에서 내려와 운동장을 걸어서 돈다
    if (this.phase2 && this.state !== 'descend' && this.state !== 'charge' && this.state !== 'stun') {
      this.ang += 0.11 * dt;
      this.walkTo(FC.x + Math.cos(this.ang) * 14, FC.z + 3 + Math.sin(this.ang) * 10, 2.4, dt, c, 0.6);
    }
    if (this.pending > 0) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) this.emit(c);
    }
    switch (this.state) {
      case 'enter':
        if (this.stateT < dt * 1.5) this.say('긴급 회의 소집합니다!', 2.4);
        this.faceTo(c.eye.x, c.eye.z, dt, 2);
        this.reachTo = this.stateT < 1.6 ? 1 : 0;
        if (this.stateT > 2.6) this.setState('idle');
        break;
      case 'idle':
        this.faceTo(c.eye.x, c.eye.z, dt, 3);
        this.volleyT -= dt;
        if (this.volleyT <= 0) {
          this.volleyT = this.phase2 ? 3.0 : 3.6;
          this.fan(c, 'meeting', this.phase2 ? 6 : 4, 9.5, 0.16);
        }
        this.summonT -= dt;
        if (this.summonT <= 0) {
          this.summonT = this.phase2 ? 10 : 13;
          if (c.minions() < 4) {
            for (const s of [-1, 1]) {
              _a.set(s * 2.2, 1.2, 1.2).applyQuaternion(this.obj.quaternion).add(this.obj.position);
              _a.y = Math.max(2.0, _a.y);
              c.spawnAt('bubble', _a);
            }
            c.sound('pop', this.person.chest, 0.8);
          }
        }
        if (!this.phase2 && this.hp <= this.maxHp / 2 && this.pending === 0) {
          this.phase2 = true;
          this.descendFrom.copy(this.obj.position);
          this.setState('descend');
          this.chargeIn = 4;
          c.banner('부총장이 단상에서 내려옵니다!', '이제 운동장을 걸어 다니며 회의 소집 고리를 두 겹으로 보냅니다');
          break;
        }
        this.chargeIn -= dt;
        if (this.chargeIn <= 0 && this.pending === 0) {
          // 기를 모은다: 결재판을 머리 위로 (약점)
          this.setState('charge');
          this.openWindow();
          this.chargeDmg = 0;
          this.charges++;
          c.sound('charge', this.person.chest, 1);
        }
        break;
      case 'charge':
        this.faceTo(c.eye.x, c.eye.z, dt, 1.5);
        if (this.chargeDmg >= 12 && this.charges > 1) {
          // 약점을 여러 번 맞으면 회의가 미뤄진다 (첫 소집은 꼭 한 번 보여 준다)
          this.setState('stun');
          this.raiseTo = 0;
          this.say('회의 연기…', 1.6);
          c.sound('squeal', this.person.chest, 0.8);
          break;
        }
        if (this.stateT >= this.chargeTime) {
          this.raiseTo = 0;
          this.reachTo = 1;
          this.say('긴급 회의 소집합니다!', 1.4);
          this.pending = this.phase2 ? 2 : 1;
          this.pendingT = 0;
          this.emit(c);
          this.setState('idle');
          this.chargeIn = this.phase2 ? 6.2 : 7.4;
          this.volleyT = Math.max(this.volleyT, 1.6);
        }
        break;
      case 'stun':
        if (this.stateT >= 1.8) {
          this.raiseTo = 0;
          this.setState('idle');
          this.chargeIn = this.phase2 ? 5 : 6;
        }
        break;
      case 'descend': {
        // 단상 앞 계단으로 걸어 내려온다
        this.raiseTo = 0;
        const k = Math.min(1, this.stateT / 1.6);
        const o = this.obj.position;
        // 단상 위에서 옆걸음한 자리에서 계단 쪽으로
        const f = this.descendFrom;
        o.set(f.x + (STAND.x - f.x) * k, STAND.y * (1 - k), f.z + (STAND.z - 4.2 - f.z) * k);
        this.walking = true;
        this.faceTo(c.eye.x, c.eye.z, dt, 3);
        if (k >= 1) this.setState('idle');
        break;
      }
      default:
        break;
    }
    if (this.state !== 'idle' && this.reachTo > 0 && this.stateT > 0.8) this.reachTo = 0;
    if (this.state === 'idle' && this.reachTo > 0 && this.stateT > 0.9) this.reachTo = 0;
  }

  /** 회의 소집 고리: 1단계는 단상 앞, 2단계는 발밑에서 퍼진다 */
  private emit(c: Ctx): void {
    this.pending--;
    this.pendingT = 1.0;
    const o = this.obj.position;
    if (this.phase2) c.hz.ring(o.x, o.z);
    else c.hz.ring(PODIUM.x, PODIUM.z - 2.4);
    c.sound('wave', this.person.chest, 1);
    c.quake(0.4, o);
    c.fx.ring(o.x, 0.08, this.phase2 ? o.z : PODIUM.z - 2.4, 0.5, 4, 0.5, 0x7c3aed);
  }
}

// ---------- 4. 총장 프레지던트 캉 ----------

/** 본관 계단 앞 */
const PRES_SPOT = new THREE.Vector3(0, 0, -15.6);
/** 2단계 서버 랙 옆 */
export const SERVER_SPOT = new THREE.Vector3(7.2, 0, -15.8);

/** 총장이 서성이는 범위 (본관 계단 앞, 양쪽 화단 사이) */
const PRES_BAND: Rect = { minX: -6.2, maxX: 6.2, minZ: -16.0, maxZ: -10.8 };

/** 교직원 모드 총장전 새 대사 (2026-11-17 비서실 확인, 글자 그대로). 학생 모드·2D는 그대로 */
const PRES_HOLD = '보류지만 더 보류입니다';
const PRES_RE = '검토했지만 더 검토하세요';
const PRES_FIGHT = ['학교를 위해 희생하세요', '그게 왜 안되죠? 되게 하세요'];
/** ★ 11차 새 기술 대사 (2026-11-21, 비서실 확인 예정) */
export const PRES_SIGN = '서명하겠습니다.';
export const PRES_PHOTO = '자, 여기 보세요.';
export const PRES_AWARD = '표창장을 수여합니다.';
export const PRES_DEGREE = '학위를 수여합니다.';
/** 미리 그려 둘 총장 새 대사 */
export const PRESIDENT_LINES: string[] = [PRES_HOLD, PRES_RE, ...PRES_FIGHT, PRES_SIGN, PRES_PHOTO, PRES_AWARD, PRES_DEGREE];
/** 거대 도장 자리에 번갈아 쓰는 기술: 1단계는 도장·MOU 서명, 2단계는 넷을 돌아가며 */
const PRES_SKILLS_1 = ['stamps', 'sign'] as const;
const PRES_SKILLS_2 = ['stamps', 'sign', 'photo', 'award'] as const;

/** 난이도별 총장 공격 박자 (적 시간 초). 초보는 예전과 비슷하게 */
interface PresTune {
  /** 결재판을 내린 뒤 다음 거대 도장까지 [최소, 최대] */
  stampGap: [number, number];
  /** 한 번에 떨어지는 거대 도장 수 [최소, 최대] (2단계는 하나 더까지) */
  stamps: [number, number];
  /** 도장 사이 [최소, 최대] */
  dropGap: [number, number];
  /** 플레이어가 가는 쪽을 앞질러 찍을 몫 */
  lead: number;
  /** 결재판 열림: 짧게 / 연달아 두 번 몫 (나머지는 길게) */
  short: number;
  double: number;
  /** 서버 폭주 사이 [최소, 최대] */
  storm: [number, number];
  /** 거대 도장을 찍는 동안·결재판을 든 동안 움직이는 빠르기 배율 (0 = 선다) */
  actMove: number;
  reviewMove: number;
}

const PRES_TUNE: Record<DiffKey, PresTune> = {
  easy: { stampGap: [2.6, 3.4], stamps: [3, 3], dropGap: [0.5, 0.62], lead: 0, short: 0.15, double: 0.15, storm: [14, 17], actMove: 0, reviewMove: 0 },
  normal: { stampGap: [1.5, 3.4], stamps: [2, 4], dropGap: [0.36, 0.62], lead: 0.3, short: 0.3, double: 0.3, storm: [9, 15], actMove: 0.3, reviewMove: 0.45 },
  hard: { stampGap: [1.1, 3.0], stamps: [3, 4], dropGap: [0.3, 0.55], lead: 0.5, short: 0.35, double: 0.35, storm: [7, 12], actMove: 0.4, reviewMove: 0.6 },
};

/** 거대 도장 하나가 그림자에서 떨어져 끝나기까지 (Hazards: 1.05 + 0.22초). 도장은 셋까지 동시에 있다 */
const STAMP_LIFE = 1.3;

export class President extends PersonBoss {
  private stampT = 3.2;
  private drops = 0;
  private stormT = 0;
  private dropT = 0;
  private packetT = 0;
  private stormLeft = 0;
  private stormDur = 6;
  private reviewSay = 0;
  /** 불규칙한 걸음 (bossmove.ts Wander) */
  private readonly wander = new Wander();
  /** 이번 거대 도장들이 떨어질 때 (act 시작부터 초) */
  private dropPlan: number[] = [];
  /** 결재판 열림 차례: [열림, 닫힘, 열림…] 초 */
  private winPlan: number[] = [2.2];
  private winIdx = 0;
  private winT = 0;
  private lineT = 6 + Math.random() * 4;
  private readonly lastEye = new THREE.Vector3(NaN, 0, 0);
  /** 플레이어 빠르기 (적 시간, 거대 도장을 앞질러 찍을 때) */
  private readonly pv = new THREE.Vector3();
  /** 2단계(수강신청 서버 폭주) 띠 아래 요령 — 학생 모드는 2D 학생판 문구로 바꾼다 */
  protected stormHint = '쏟아지는 오류 창(빨간 표시)과 패킷을 피하며 결재받으세요';
  /** 거대 도장을 내려찍을 때 (1단계 / 2단계)와 싸우는 중 가끔 하는 말 — 학생 모드는 예전 대사로 되돌린다 */
  protected holdLine = PRES_HOLD;
  protected reLine = PRES_RE;
  protected fightLines: readonly string[] = PRES_FIGHT;
  /** 수여 기술: 교직원 모드 = 표창장(상장), 학생 모드 = 학위(학사모) */
  protected awardKind: 'cap' | 'award' = 'award';
  protected awardLine = PRES_AWARD;
  private skillIdx = 0;
  private skillDone = false;

  constructor(c: Ctx, person: Person) {
    super(c, person, PRES_SPOT, PRES_SPOT, '오늘 민원 처리, 수고 많았어요.');
    this.state = 'sleep';
    // 사라지거나 달려오지 않는다 (Wander로 불규칙하게)
    this.mover = null;
  }

  /** 불규칙한 걸음 한 프레임 (mul: 빠르기 배율, 0이면 선다) */
  private roamPres(dt: number, c: Ctx, mul: number): void {
    if (mul <= 0) {
      this.wander.stop();
      return;
    }
    if (this.wander.update(dt, this.obj.position, PRES_BAND, c.eye.x, c.eye.z, diffOf(c), this.phase2, mul)) this.walking = true;
  }

  /** 싸우는 중 가끔 한마디 (2단계에서 더 자주. 학생 모드는 없음) */
  private fightTalk(dt: number): void {
    if (this.fightLines.length === 0) return;
    this.lineT -= dt;
    if (this.lineT > 0) return;
    if (this.person.tag.bubble.visible) {
      this.lineT = 0.8;
      return;
    }
    this.say(this.fightLines[Math.floor(Math.random() * this.fightLines.length)], 2.4);
    this.lineT = this.phase2 ? randRange(6, 10) : randRange(11, 17);
  }

  /** 이번 거대 도장들: 수와 간격을 무작위로 (도장은 셋까지 동시에 있으니 넷째부터는 첫째가 끝난 뒤) */
  private planDrops(c: Ctx): void {
    const P = PRES_TUNE[diffOf(c)];
    const quick = this.phase2 ? 0.75 : 1;
    const n = Math.round(randRange(P.stamps[0], P.stamps[1] + (this.phase2 ? 1 : 0)));
    const plan: number[] = [];
    let t = 0.35;
    for (let i = 0; i < n; i++) {
      if (i > 0) t += randRange(P.dropGap[0], P.dropGap[1]) * quick;
      if (i >= 3) t = Math.max(t, plan[i - 3] + STAMP_LIFE);
      plan.push(t);
    }
    this.dropPlan = plan;
  }

  /** 결재판 열림 차례: 길게 / 짧게 / 연달아 두 번 */
  private planWindow(c: Ctx): void {
    const key = diffOf(c);
    const P = PRES_TUNE[key];
    const dbl = P.double + (this.phase2 ? 0.1 : 0);
    const short = P.short + (this.phase2 ? 0.05 : 0);
    const r = Math.random();
    if (r < dbl) this.winPlan = [randRange(0.75, 1.0), randRange(0.35, 0.55), randRange(0.8, 1.1)];
    else if (r < dbl + short) this.winPlan = [randRange(0.8, 1.1) * (key === 'easy' ? 1.3 : 1)];
    else this.winPlan = [this.phase2 ? randRange(1.5, 2.0) : randRange(1.8, 2.5)];
    this.winIdx = 0;
    this.winT = 0;
  }

  private nextStamp(c: Ctx): number {
    const P = PRES_TUNE[diffOf(c)];
    return randRange(P.stampGap[0], P.stampGap[1]) * (this.phase2 ? 0.6 : 1);
  }

  private nextStorm(c: Ctx): number {
    const P = PRES_TUNE[diffOf(c)];
    return randRange(P.storm[0], P.storm[1]);
  }

  /** 거대 도장 하나: 플레이어 자리 (가끔은 가는 쪽을 앞질러) */
  private dropStamp(c: Ctx): void {
    const P = PRES_TUNE[diffOf(c)];
    this.drops++;
    let x = c.eye.x + (Math.random() - 0.5) * 1.2;
    let z = c.eye.z + (Math.random() - 0.5) * 1.2;
    if (Math.random() < P.lead) {
      x += this.pv.x * STAMP_LIFE * 0.6;
      z += this.pv.z * STAMP_LIFE * 0.6;
    }
    const a = c.area;
    x = Math.max(a.minX + 1, Math.min(a.maxX - 1, x));
    z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, z));
    c.hz.drop('stamp', x, z, this.phase2 ? '재검토' : '보류');
  }

  /**
   * 11차 새 기술 한 프레임. 끝나면 결재판을 들고 살펴본다 (빈틈, review).
   * - sign: 0.5초에 플레이어 발밑을 지나는 서명선 (2단계는 두 줄 엇갈림)
   * - photo: 0.9초에 플래시 — 총장을 보고 있으면 2초 동안 화면이 하얘진다
   * - award: 0.5초에 표창장(학생: 학사모)을 부메랑처럼
   */
  private skill(dt: number, c: Ctx, P: PresTune): void {
    this.faceTo(c.eye.x, c.eye.z, dt, 6);
    this.roamPres(dt, c, this.state === 'photo' ? 0 : P.actMove);
    const at = this.state === 'photo' ? 0.9 : 0.5;
    if (!this.skillDone && this.stateT >= at) {
      this.skillDone = true;
      if (this.state === 'sign') {
        c.hz.skills.signLines(c.eye.x, c.eye.z, this.phase2);
        c.sound('volley', this.person.chest, 0.6);
      } else if (this.state === 'photo') {
        const head = _a.copy(this.person.chest).setY(this.person.chest.y + 0.7 * this.person.look.scale);
        c.fx.text(_b.copy(head).setY(head.y + 0.8), '찰칵!', '#ffffff', 0.7);
        const white = c.hz.skills.flash(head, c);
        c.fx.text(_b.set(c.eye.x, c.eye.y + 0.5, c.eye.z), white ? '눈부셔!' : '고개 돌리기 성공!', white ? '#ffe066' : '#7CFC9A', 0.5);
      } else {
        c.hz.skills.throwBoomerang(this.awardKind, this.person.chest, this.obj, c);
      }
    }
    if (this.stateT >= at + 0.5) {
      this.reachTo = 0;
      this.openWindow();
      this.planWindow(c);
      this.setState('review');
    }
  }

  /** 화면이 밝아지면 시작 */
  wake(): void {
    if (this.state === 'sleep') this.setState('enter');
  }

  protected think(dt: number, c: Ctx): void {
    // 플레이어 빠르기 (거대 도장을 앞질러 찍을 때)
    if (!Number.isNaN(this.lastEye.x) && dt > 0) {
      _b.set((c.eye.x - this.lastEye.x) / dt, 0, (c.eye.z - this.lastEye.z) / dt);
      if (_b.lengthSq() < 400) this.pv.lerp(_b, Math.min(1, dt * 6));
    }
    this.lastEye.copy(c.eye);
    const P = PRES_TUNE[diffOf(c)];
    switch (this.state) {
      case 'sleep':
        this.faceTo(c.eye.x, c.eye.z, dt, 3);
        break;
      case 'enter':
        if (this.stateT < dt * 1.5) this.say('검토하겠습니다.', 2.2);
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.reachTo = this.stateT < 1.4 ? 1 : 0;
        if (this.stateT > 2.4) this.setState('idle');
        break;
      case 'idle': {
        // 본관 계단 앞에서 불규칙하게: 방향을 꺾고, 순간 빨라지고, 미끄러지고, 잠깐 멈춘다
        this.roamPres(dt, c, 1);
        this.faceTo(c.eye.x, c.eye.z, dt, 6);
        this.fightTalk(dt);
        if (!this.phase2 && this.hp <= this.maxHp / 2) {
          this.phase2 = true;
          this.stormT = 0;
          this.say('잠깐, 수강신청 서버가…!', 1.8);
          c.banner('수강신청 서버 폭주!', this.stormHint);
          this.setState('server');
          this.stormLeft = this.stormDur = 6;
          break;
        }
        if (this.phase2) {
          this.stormT -= dt;
          // 거대 도장과 서버 폭주 차례도 무작위 (둘 다 때가 되면 반반)
          if (this.stormT <= 0 && (this.stampT > 0 || Math.random() < 0.5)) {
            this.say('어? 수강신청 서버가…!', 1.6);
            this.setState('server');
            this.stormLeft = this.stormDur = Math.round(randRange(5, 7) * 10) / 10;
            break;
          }
        }
        this.stampT -= dt;
        if (this.stampT <= 0) {
          const list = this.phase2 ? PRES_SKILLS_2 : PRES_SKILLS_1;
          const next = list[this.skillIdx++ % list.length];
          this.reachTo = 1;
          if (next !== 'stamps') {
            this.skillDone = false;
            this.setState(next);
            const line = next === 'sign' ? PRES_SIGN : next === 'photo' ? PRES_PHOTO : this.awardLine;
            this.say(line, 1.6);
            break;
          }
          this.setState('act');
          this.drops = 0;
          this.planDrops(c);
          const line = this.phase2 ? this.reLine : this.holdLine;
          this.say(line, Math.max(1.0, line.length * 0.15));
        }
        break;
      }
      case 'sign':
      case 'photo':
      case 'award':
        this.skill(dt, c, P);
        break;
      case 'act': {
        // 거대 도장: 플레이어를 따라 (수·간격은 무작위, 가끔은 가는 쪽을 앞질러)
        this.faceTo(c.eye.x, c.eye.z, dt, 6);
        this.roamPres(dt, c, P.actMove);
        while (this.drops < this.dropPlan.length && this.stateT >= this.dropPlan[this.drops]) this.dropStamp(c);
        if (this.stateT >= (this.dropPlan[this.dropPlan.length - 1] ?? 0.35) + 0.4) {
          this.reachTo = 0;
          this.openWindow();
          this.planWindow(c);
          this.setState('review');
          this.say(this.reviewSay++ % 2 === 0 ? '검토하겠습니다.' : '꼼꼼히 다시 봅시다.', 1.6);
        }
        break;
      }
      case 'review':
        // 결재판을 들어 살펴본다 (빈틈). 길게 / 짧게 / 잠깐 내렸다 다시 드는 것이 무작위
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.roamPres(dt, c, P.reviewMove);
        this.fightTalk(dt);
        this.winT += dt;
        if (this.winT >= this.winPlan[this.winIdx]) {
          this.winT = 0;
          this.winIdx++;
          if (this.winIdx >= this.winPlan.length) {
            this.raiseTo = 0;
            this.stampT = this.nextStamp(c);
            this.setState('idle');
          } else if (this.winIdx % 2 === 1) this.raiseTo = 0;
          else this.openWindow();
        }
        break;
      case 'server': {
        // 수강신청 서버 폭주: 랙 옆으로 가서 살핀다. 오류 창이 떨어지고 패킷이 날아온다
        // 랙은 구역 가장자리라 구역 경계로 막지 않는다
        const there = this.walkTo(SERVER_SPOT.x - 1.6, SERVER_SPOT.z + 0.6, 3.2, dt, null, 0.4);
        this.wander.stop();
        if (there) {
          this.faceTo(SERVER_SPOT.x, SERVER_SPOT.z, dt, 6);
          this.reachTo = Math.sin(this.t * 14) > 0 ? 0.7 : 0.4;
          if (this.stormLeft === this.stormDur) this.say('서버 증설을 검토하겠습니다!', 2.0);
          this.stormLeft -= dt;
          // 오류 창·패킷 박자도 무작위 (고급일수록 촘촘히)
          const dense = diffOf(c) === 'hard' ? 0.85 : 1;
          this.dropT -= dt;
          if (this.dropT <= 0) {
            this.dropT = diffOf(c) === 'easy' ? 0.6 : randRange(0.45, 0.75) * dense;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 2.6;
            c.hz.drop('error', c.eye.x + Math.cos(a) * r, c.eye.z + Math.sin(a) * r);
          }
          this.packetT -= dt;
          if (this.packetT <= 0) {
            this.packetT = diffOf(c) === 'easy' ? 0.85 : randRange(0.6, 1.05) * dense;
            _a.set(SERVER_SPOT.x, 1.6, SERVER_SPOT.z + 0.6);
            _b.copy(c.eye).sub(_a).normalize().multiplyScalar(9);
            c.sheet(_a, _b, 'packet');
          }
          if (this.stormLeft <= 0) {
            this.say('휴, 서버 복구됐습니다.', 1.6);
            this.stormT = this.nextStorm(c);
            this.reachTo = 0;
            this.openWindow();
            this.planWindow(c);
            this.setState('review');
          }
        } else {
          this.faceTo(SERVER_SPOT.x, SERVER_SPOT.z, dt, 6);
        }
        break;
      }
      default:
        break;
    }
  }
}
