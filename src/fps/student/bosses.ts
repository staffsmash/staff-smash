import * as THREE from 'three';
import { BODY_DMG, PersonBoss, President } from '../bosses';
import type { Ctx } from '../enemies';
import type { Person } from '../people';
import type { DocTower } from './enemies';
import type { StudentHazards } from './hazards';

// 학생 모드의 사람 (모두 가상 인물, 프레지던트 캉만 실존 — 비서실 확인. 총장 대사는 본편 2D에 있는 것만 쓴다).
// 사람은 다치지 않는다: 막대는 "설득"(총장은 "결재 진행")이고, 서류는 들고 있는 결재판에 "설득" 도장으로 찍힌다.
// 다 차면 창구 직원·처장·부총장은 결재 대사("…퇴근합니다…")를 하고 걸어 나가고, 총장은 선 채로 승인한다.
// - 창구 직원 (구역마다 한 명, 작은 중간 보스): 박국제학사(소등) · 이진취(빨간 첨삭 선) · 오학종지(대기번호표)
// - 박반려 서류반려처장 (대운동장): 서류 탑 뒤에 숨어 거대 "반려" 도장 → 탑을 무너뜨리면 당황(빈틈) → 반려 서류를 던진다
// - 반사반사 결재부총장 (사회과학관 앞): 정면 결재판이 서류를 되받아친다(반사). 반사 직후·등 뒤·옆이 빈틈
// - 프레지던트 캉 (본관 앞 계단, 총장실): 1단계 보류·재검토 거대 도장 → 2단계 수강신청 서버 폭주 (교직원 모드와 같은 기술)

/** 보스 쪽에서 학생 모드에 바라는 것 (StudentMode가 채운다) */
export interface StuCtx {
  readonly haz: StudentHazards;
  /** 초보 난이도 (빈틈을 길게, 몸 돌리기를 느리게) */
  readonly easy: boolean;
  /** 박반려 처장의 서류 탑을 세운다 */
  raiseTower(x: number, z: number): DocTower;
  /** 반려 서류 한 장 */
  spawnDoc(at: THREE.Vector3): void;
  /** 대기번호표 행렬 (n장) */
  spawnQueue(n: number): void;
  /** 살아 있는 번호표 수 */
  tickets(): number;
  note(text: string, time?: number): void;
  /** 사람을 맞히면 가끔 떠오르는 설득 말 */
  persuade(at: THREE.Vector3): void;
  /** 반사반사 부총장이 되받아친 자리에 "반사" 도장 */
  reflectMark(at: THREE.Vector3): void;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export abstract class StudentBoss extends PersonBoss {
  protected readonly s: StuCtx;
  /** 막대 앞 글자 */
  readonly barWord: string = '설득';
  /** 처음 만났을 때 띠 아래 공략 */
  abstract readonly hintText: string;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, exit: THREE.Vector3, approveLine: string, name: string, hp: number, doneText: string) {
    // 결재 대사에 "퇴근합니다…"가 이미 들어 있어 나갈 때는 말없이 (leaveLine = '')
    super(c, person, at, exit, approveLine, '', name, hp);
    this.s = s;
    this.doneText = doneText;
  }

  stamped(weak: boolean, c: Ctx): void {
    super.stamped(weak, c);
    if (Math.random() < 0.3) this.s.persuade(_a.copy(this.person.chest).setY(this.person.chest.y + 1.2 * this.person.look.scale));
  }

  /** 정해진 빠르기로만 몸을 돌린다 (반사반사 부총장) */
  protected turnTo(x: number, z: number, dt: number, rate: number): void {
    const want = Math.atan2(x - this.obj.position.x, z - this.obj.position.z);
    const d = wrap(want - this.yaw);
    this.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
    this.obj.rotation.y = this.yaw;
  }

  /** 플레이어가 보스 정면 몇 도 안에 있나 (cos) */
  protected facingCos(c: Ctx): number {
    const dx = c.eye.x - this.obj.position.x;
    const dz = c.eye.z - this.obj.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d;
  }
}

// ---------- 창구 직원 (중간 보스) ----------

export type StaffKind = 'haksa' | 'jinchwi' | 'hakjong';

interface StaffInfo {
  hp: number;
  every: number;
  keep: number;
  hint: string;
}

/** 본편 2D enemies.json의 값을 1인칭에 맞췄다 (설득 양 = 결재 양과 같은 단위) */
export const STAFF: Record<StaffKind, StaffInfo> = {
  haksa: { hp: 34, every: 10, keep: 9, hint: '불이 꺼지면 내 주변만 보여요' },
  jinchwi: { hp: 34, every: 8, keep: 9, hint: '빨간 첨삭 선은 점프(Space)로 넘을 수 있어요' },
  hakjong: { hp: 36, every: 5.5, keep: 11, hint: '번호표를 뽑는 동안 본체를 치면 멈춰요' },
};

const DARK_SEC = 5.5;
const LINE_SEC = 4.5;
const CHAIN = 4;
const MAX_SLIPS = 6;

export class WindowStaff extends StudentBoss {
  readonly staff: StaffKind;
  hintText: string;
  private readonly line: string;
  private sub: 'walk' | 'act' | 'lure' = 'walk';
  private subT = 0;
  private gimmickT = 3;
  private throwT = 2.5;
  private acted = false;
  private side = 1;
  private sideT = 0;
  private spot: THREE.Vector3;

  constructor(c: Ctx, s: StuCtx, person: Person, staff: StaffKind, name: string, line: string, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3) {
    super(c, s, person, at, exit, '퇴근합니다…', `${name} · 창구`, STAFF[staff].hp, '설득 완료!');
    this.staff = staff;
    this.line = line;
    this.hintText = STAFF[staff].hint;
    this.spot = spot.clone();
  }

  /** touch: 터치 화면이면 첨삭 선 공략을 버튼 이름으로 */
  setTouchHint(touch: boolean): void {
    if (touch && this.staff === 'jinchwi') this.hintText = '빨간 첨삭 선은 점프(파란 버튼)로 넘을 수 있어요';
  }

  private go(sub: 'walk' | 'act' | 'lure'): void {
    this.sub = sub;
    this.subT = 0;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') {
      if (this.stateT < dt * 1.5) this.say(this.line, 2.4);
      this.walkTo(this.spot.x, this.spot.z, 2.6, dt, null, 0.4);
      this.faceTo(c.eye.x, c.eye.z, dt);
      if (this.stateT > 2.6) this.setState('idle');
      return;
    }
    this.subT += dt;
    this.faceTo(c.eye.x, c.eye.z, dt, this.sub === 'act' ? 8 : 5);
    switch (this.sub) {
      case 'walk': {
        this.sideT -= dt;
        if (this.sideT <= 0) {
          this.side = -this.side;
          this.sideT = 3 + Math.random() * 2;
        }
        this.keepAway(c, dt, STAFF[this.staff].keep, 1.9, this.side);
        this.throwT -= dt;
        if (this.throwT <= 0) {
          this.throwT = 3.6;
          this.fan(c, 'paper', 3, 8.5, 0.2);
        }
        this.gimmickT -= dt;
        if (this.gimmickT <= 0 && this.ready()) {
          this.acted = false;
          this.reachTo = 1;
          this.say(this.line, 1.6);
          // 오학종지는 번호표를 뽑는 동안 결재판을 든다 (이때 맞히면 멈춘다)
          if (this.staff === 'hakjong') this.openWindow();
          this.go('act');
        }
        break;
      }
      case 'act':
        this.gimmick(c);
        break;
      case 'lure':
        // 기믹 뒤 결재판을 들고 서 있다 (빈틈)
        if (this.subT >= (this.s.easy ? 3.2 : 2.4)) {
          this.raiseTo = 0;
          this.gimmickT = STAFF[this.staff].every + Math.random() * 1.5;
          this.go('walk');
        }
        break;
    }
  }

  private ready(): boolean {
    if (this.staff === 'haksa') return this.s.haz.darkLeft <= 0;
    if (this.staff === 'hakjong') return this.s.tickets() < MAX_SLIPS;
    return true;
  }

  private gimmick(c: Ctx): void {
    const t = this.subT;
    switch (this.staff) {
      case 'haksa':
        if (!this.acted && t >= 0.6) {
          this.acted = true;
          this.s.haz.lightsOut(DARK_SEC);
          c.sound('charge', this.person.chest, 0.7);
        }
        if (t >= 1.0) this.toLure();
        break;
      case 'jinchwi':
        if (!this.acted && t >= 0.7) {
          this.acted = true;
          this.s.haz.drawLines(c.eye.x, c.eye.z, this.obj.position.x - c.eye.x, this.obj.position.z - c.eye.z, LINE_SEC);
          c.sound('volley', this.person.chest, 0.7);
        }
        if (t >= 1.1) this.toLure();
        break;
      case 'hakjong':
        if (!this.acted && t >= 1.25) {
          this.acted = true;
          this.s.spawnQueue(CHAIN);
          c.fx.text(_a.copy(this.person.chest).setY(this.person.chest.y + 2.2), '번호표 발행!', '#9fd3ff', 0.6);
        }
        if (t >= 1.5) {
          this.raiseTo = 0;
          this.reachTo = 0;
          this.gimmickT = STAFF.hakjong.every + Math.random() * 1.5;
          this.go('walk');
        }
        break;
    }
  }

  private toLure(): void {
    this.reachTo = 0;
    this.openWindow();
    this.go('lure');
  }

  stamped(weak: boolean, c: Ctx): void {
    // 오학종지: 번호표 뽑는 중에 맞으면 멈춘다
    if (this.staff === 'hakjong' && this.sub === 'act' && !this.acted && !this.dead) {
      this.acted = true;
      this.say('앗, 번호표 발행 중단…', 1.4);
      this.reachTo = 0;
      this.go('lure');
      this.subT = 0.6;
    }
    super.stamped(weak, c);
  }
}

// ---------- 박반려 서류반려처장 ----------

type BanSub = 'build' | 'hide' | 'peek' | 'fluster' | 'out' | 'look' | 'retreat';

export class Banryeo extends StudentBoss {
  readonly hintText = '서류 탑을 무너뜨리면 빈틈! 지금 설득하세요';
  tower: DocTower | null = null;
  private sub: BanSub = 'build';
  private subT = 0;
  private slamT = 1.4;
  private peeks = 0;
  private exposedT = 0;
  private throwT = 1.4;
  private throws = 0;
  private thresholds: number[] = [];
  private spot = new THREE.Vector3();
  private sink = 0;
  private towerHp: number;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3, towerHp: number) {
    super(c, s, person, at, exit, '반려… 철회합니다. 퇴근합니다…', '박반려 · 서류반려처장', 70, '반려 철회!');
    this.spot.copy(spot);
    this.towerHp = towerHp;
  }

  get towerUp(): boolean {
    return !!this.tower && !this.tower.dead && !this.tower.gone;
  }

  /** 탑 뒤에 숨어 있는 동안은 설득할 수 없다 */
  get targetable(): boolean {
    return super.targetable && this.sub !== 'build' && this.sub !== 'hide' && this.sub !== 'peek';
  }

  /** "서류 탑 ■■■□" (본편 2D 막대 아래 글) */
  get towerText(): string {
    const t = this.tower;
    if (!t || !this.towerUp) return '';
    return `서류 탑 ${'■'.repeat(Math.max(0, Math.ceil(t.hp)))}${'□'.repeat(Math.max(0, Math.ceil(t.maxHp - t.hp)))}`;
  }

  private go(sub: BanSub): void {
    this.sub = sub;
    this.subT = 0;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') {
      // 결재 양은 세운 뒤(난이도 반영) 정해지므로 첫 단계에서 경계를 잡는다 (절반에서 한 번 다시 쌓는다)
      if (this.stateT < dt * 1.5) this.thresholds = [this.maxHp / 2];
      if (this.stateT < dt * 1.5) this.say('이 서류는 반려입니다!', 2.2);
      const there = this.walkTo(this.spot.x, this.spot.z, 2.8, dt, null, 0.4);
      this.faceTo(c.eye.x, c.eye.z, dt);
      if (there || this.stateT > 6) {
        this.setState('idle');
        this.go('build');
      }
      return;
    }
    this.subT += dt;
    // 숨으면 탑 뒤로 몸을 낮춘다 (내밀 때만 올라온다)
    const want = this.sub === 'hide' || this.sub === 'build' ? 0.75 : this.sub === 'peek' ? Math.max(0, 0.75 - Math.sin(Math.min(1, this.subT / 0.8) * Math.PI) * 0.9) : 0;
    this.sink += (want - this.sink) * Math.min(1, dt * 8);
    this.obj.position.y = -this.sink;
    switch (this.sub) {
      case 'build':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (this.subT < dt * 1.5) {
          // 플레이어 쪽 1.8m 앞에 탑을 세운다
          const o = this.obj.position;
          const dx = c.eye.x - o.x;
          const dz = c.eye.z - o.z;
          const d = Math.hypot(dx, dz) || 1;
          this.tower = this.s.raiseTower(o.x + (dx / d) * 1.8, o.z + (dz / d) * 1.8);
          this.tower.maxHp = this.tower.hp = this.towerHp;
          c.sound('volley', o, 0.8);
        }
        if (this.subT >= 0.6) {
          this.slamT = 1.2;
          this.go('hide');
        }
        break;
      case 'hide':
        this.faceTo(c.eye.x, c.eye.z, dt, 4);
        if (!this.towerUp) {
          this.say('제 서류 탑이…!', 1.4);
          this.openWindow();
          this.go('fluster');
          c.sound('squeal', this.person.chest, 0.7);
          break;
        }
        this.slamT -= dt;
        if (this.slamT <= 0) this.go('peek');
        break;
      case 'peek':
        // 탑 위로 몸을 내밀어 거대 "반려" 도장을 내리찍는다 (가끔 반려 서류를 넘겨 보낸다)
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (this.subT >= 0.35 && this.subT - dt < 0.35) {
          this.reachTo = 1;
          this.peeks++;
          this.say('반려!', 0.9);
          const n = this.s.easy ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = i === 0 ? Math.random() * 0.8 : 2.2 + Math.random();
            const ar = c.area;
            c.hz.drop('stamp', Math.max(ar.minX + 1, Math.min(ar.maxX - 1, c.eye.x + Math.cos(a) * r)), Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, c.eye.z + Math.sin(a) * r)), '반려');
          }
          if (this.peeks % 2 === 0 && c.minions() < 3) this.s.spawnDoc(_a.copy(this.person.chest).setY(3.2));
        }
        if (this.subT >= 0.9) {
          this.reachTo = 0;
          this.slamT = 2.4 + Math.random() * 0.8;
          this.go(this.towerUp ? 'hide' : 'fluster');
        }
        break;
      case 'fluster':
        // 당황: 결재판을 머리 위로 (빈틈)
        this.faceTo(c.eye.x, c.eye.z, dt, 3);
        if (this.subT >= (this.s.easy ? 3.2 : 2.4)) {
          this.raiseTo = 0;
          this.exposedT = 11;
          this.throwT = 0.8;
          this.go('out');
        }
        break;
      case 'out': {
        this.exposedT -= dt;
        const crossed = this.thresholds.length > 0 && this.hp <= this.thresholds[0];
        if (this.exposedT <= 0 || crossed) {
          if (crossed) this.thresholds.shift();
          this.startRetreat(c);
          break;
        }
        this.keepAway(c, dt, 7, 1.7, Math.sin(this.t * 0.5) > 0 ? 1 : -1);
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.throwT -= dt;
        if (this.throwT <= 0) {
          this.throws++;
          this.reachTo = 1;
          this.say('반려합니다!', 1.0);
          this.fan(c, 'rental', 3, 8.5, 0.22);
          this.openWindow();
          this.go('look');
        }
        break;
      }
      case 'look':
        // 던지고 나서 결재판을 들고 반응을 본다 (빈틈)
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.subT > 0.5) this.reachTo = 0;
        if (this.subT >= (this.s.easy ? 1.9 : 1.4)) {
          this.raiseTo = 0;
          this.throwT = 2.2;
          this.go('out');
        }
        break;
      case 'retreat': {
        const there = this.walkTo(this.spot.x, this.spot.z, 3.4, dt, c, 0.6);
        this.faceTo(this.spot.x, this.spot.z, dt, 6);
        if (there || this.subT > 3) this.go('build');
        break;
      }
    }
  }

  /** 플레이어 반대쪽으로 물러나 탑을 다시 쌓는다 */
  private startRetreat(c: Ctx): void {
    const a = c.area;
    const o = this.obj.position;
    let dx = o.x - c.eye.x;
    let dz = o.z - c.eye.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.spot.set(Math.max(a.minX + 4, Math.min(a.maxX - 4, c.eye.x + dx * 14)), 0, Math.max(a.minZ + 4, Math.min(a.maxZ - 4, c.eye.z + dz * 14)));
    this.raiseTo = 0;
    this.say('잠깐, 서류 다시 쌓겠습니다.', 1.6);
    this.go('retreat');
  }

  die(): void {
    super.die();
    this.obj.position.y = 0;
    this.sink = 0;
  }
}

// ---------- 반사반사 결재부총장 ----------

type BansaSub = 'walk' | 'throw' | 'wind' | 'dash' | 'winded' | 'open';

export class Bansa extends StudentBoss {
  readonly hintText = '정면 반사 중 · 등 뒤가 빈틈';
  private sub: BansaSub = 'walk';
  private subT = 0;
  private cd = 2.2;
  private cycle = 0;
  private side = 1;
  private reflectNext = false;
  private openCd = 0;
  private blocks = 0;
  private blockSaid = -9;
  private dashDir = new THREE.Vector3();
  private dashHit = false;
  private dashStart = new THREE.Vector3();
  private spot: THREE.Vector3;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3) {
    super(c, s, person, at, exit, '결재… 올려 드리죠. 퇴근합니다…', '반사반사 · 결재부총장', 75, '결재 완료!');
    this.spot = spot.clone();
    // 큰 결재판
    person.clip.scale.setScalar(1.4);
  }

  /** 결재판으로 정면을 막는 중인지 */
  get guarding(): boolean {
    return !this.dead && this.state === 'idle' && this.sub !== 'open' && this.sub !== 'dash' && this.sub !== 'winded';
  }

  private go(sub: BansaSub): void {
    this.sub = sub;
    this.subT = 0;
  }

  /** 몸 돌리는 빠르기 (rad/s, 적 시간). 초보는 느리다 */
  private get turnRate(): number {
    return this.s.easy ? 0.75 : 1.0;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') {
      if (this.stateT < dt * 1.5) this.say('결재판 보이시죠?', 2.2);
      this.walkTo(this.spot.x, this.spot.z, 2.6, dt, null, 0.4);
      this.faceTo(c.eye.x, c.eye.z, dt);
      this.raiseTo = 0.45;
      if (this.stateT > 3.0) this.setState('idle');
      return;
    }
    this.subT += dt;
    if (this.openCd > 0) this.openCd -= dt;
    switch (this.sub) {
      case 'walk': {
        this.raiseTo = 0.45;
        if (Math.sin(this.t * 0.4) > 0.95) this.side = -this.side;
        this.keepAway(c, dt, 8.5, 1.5, this.side);
        this.turnTo(c.eye.x, c.eye.z, dt, this.turnRate);
        this.cd -= dt;
        // 플레이어를 보고 있을 때만 다음 기술
        if (this.cd <= 0 && this.facingCos(c) > 0.8) {
          this.cycle++;
          if (this.cycle % 3 === 0) {
            this.say('전결 처리합니다!', 1.2);
            this.go('wind');
          } else {
            this.say('결재 서류 받으세요', 1.4);
            this.go('throw');
          }
        }
        break;
      }
      case 'throw':
        this.turnTo(c.eye.x, c.eye.z, dt, this.turnRate);
        this.reachTo = 1;
        if (this.subT >= 0.4 && this.subT - dt < 0.4) this.fan(c, 'meeting', 3, 9, 0.24);
        if (this.subT >= 0.9) {
          this.reachTo = 0;
          this.cd = 2.2 + Math.random() * 0.8;
          this.go('walk');
        }
        break;
      case 'wind':
        // 몸을 숙이고 플레이어 쪽으로 겨눈다
        this.turnTo(c.eye.x, c.eye.z, dt, this.turnRate * 2.2);
        if (this.subT >= 0.7) {
          this.dashDir.set(c.eye.x - this.obj.position.x, 0, c.eye.z - this.obj.position.z).normalize();
          this.dashStart.copy(this.obj.position);
          this.dashHit = false;
          c.sound('dash', this.person.chest, 1);
          this.go('dash');
        }
        break;
      case 'dash': {
        const o = this.obj.position;
        const step = 12.5 * dt;
        o.addScaledVector(this.dashDir, step);
        this.walking = true;
        const a = c.area;
        const out = o.x < a.minX + 1 || o.x > a.maxX - 1 || o.z < a.minZ + 1 || o.z > a.maxZ - 1;
        o.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.x));
        o.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.z));
        if (!this.dashHit && c.feet < 1.2 && Math.hypot(c.eye.x - o.x, c.eye.z - o.z) < 1.3) {
          this.dashHit = true;
          c.hurt(1.5, this.person.chest, 'wave');
        }
        if (this.subT >= 1.25 || out || o.distanceTo(this.dashStart) > 17) {
          // 지나간 쪽을 본 채로 멈춘다: 등이 플레이어 쪽으로 보인다
          this.say('후… 전결 끝.', 1.4);
          this.raiseTo = 0;
          this.go('winded');
        }
        break;
      }
      case 'winded':
        if (this.subT >= (this.s.easy ? 2.4 : 1.6)) {
          this.cd = 1.4;
          this.go('walk');
        }
        break;
      case 'open':
        // 되받아친 직후: 결재판이 들려 정면이 빈다
        // 시간이 다 되거나 약점 세 번을 맞아 결재판을 내리면 다시 막는다
        if (this.subT >= (this.s.easy ? 2.2 : 1.6) || this.raiseTo < 0.5) {
          this.raiseTo = 0.45;
          this.openCd = 2.5;
          this.cd = Math.max(this.cd, 0.8);
          this.go('walk');
        }
        break;
    }
  }

  /** 도장 판정: 정면에서 막는 중이면 반사로 표시해 둔다 (Game이 바로 stamped를 부른다) */
  hitTest(p0: THREE.Vector3, p: THREE.Vector3): 0 | 1 | 2 {
    const r = super.hitTest(p0, p);
    this.reflectNext = r !== 0 && this.guarding && this.frontOf(p0);
    return this.reflectNext ? 1 : r;
  }

  /** 서류가 날아온 쪽이 정면인가 (앞 65° 안) */
  private frontOf(from: THREE.Vector3): boolean {
    const dx = from.x - this.obj.position.x;
    const dz = from.z - this.obj.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d > Math.cos((65 * Math.PI) / 180);
  }

  stamped(weak: boolean, c: Ctx): void {
    if (this.reflectNext) {
      this.reflectNext = false;
      // 반사: 이번 서류는 설득으로 치지 않는다 (Game이 곧 BODY_DMG만큼 깎는다)
      this.hp += BODY_DMG;
      this.reflect(c);
      return;
    }
    super.stamped(weak, c);
    if (!weak && !this.dead && this.facingCos(c) < Math.cos((65 * Math.PI) / 180)) {
      // 옆·뒤에서 맞히면 크게 진행된다
      this.hp = Math.max(0.01, this.hp - (this.s.easy ? 2.5 : 2.0));
      c.fx.text(_a.copy(this.person.chest).setY(this.person.chest.y + 0.9), '빈틈!', '#ffe066', 0.6);
    }
  }

  private reflect(c: Ctx): void {
    const from = _a.copy(this.person.clipCenter);
    this.s.reflectMark(from);
    c.sound('weak', from, 0.7);
    _b.subVectors(c.eye, from).normalize().multiplyScalar(this.s.easy ? 8 : 10.5);
    c.sheet(from, _b, 'paper');
    if (this.openCd <= 0) {
      this.say('반사!', 1.0);
      this.openWindow();
      this.go('open');
      c.fx.text(_b.copy(from).setY(from.y + 1.0), '빈틈!', '#ffe066', 0.6);
      return;
    }
    // 막 내린 결재판은 다시 들지 않는다: 막기만 한다
    this.blocks++;
    if (this.t - this.blockSaid > 1.6) {
      this.blockSaid = this.t;
      this.say(this.blocks < 4 ? '결재판 보이시죠?' : '정면은 안 됩니다~', 1.1);
    }
  }
}

// ---------- 프레지던트 캉 (학생 모드) ----------

export class StudentPresident extends President {
  readonly barWord = '결재 진행';
  readonly hintText = '빨간 그림자에 떨어지는 거대 도장을 피하며 결재받으세요';
  private greeted = false;

  constructor(c: Ctx, person: Person) {
    super(c, person);
    this.approveLine = '좋아요, 검토 끝났습니다.';
    this.doneText = '검토 완료!';
  }

  protected think(dt: number, c: Ctx): void {
    super.think(dt, c);
    // 첫 인사는 본편 2D 학생 모드 대사로
    if (this.state === 'enter' && !this.greeted) {
      this.greeted = true;
      this.say('졸업 서류요? 한번 검토해 봅시다.', 2.4);
    }
  }
}
