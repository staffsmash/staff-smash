import * as THREE from 'three';
import type { Rect } from '../blocks';
import type { Roam } from '../bossmove';
import { BODY_DMG, PersonBoss, President } from '../bosses';
import type { Ctx } from '../enemies';
import type { Person } from '../people';
import type { DocTower } from './enemies';
import type { StudentHazards } from './hazards';

// 학생 모드의 사람 (모두 가상 인물, 프레지던트 캉만 실존 — 비서실 확인. 총장 대사는 본편 2D에 있는 것과
// 비서실 확인을 받은 문구 검토 11-2절 추가안 4줄만 쓴다).
// 사람은 다치지 않는다: 막대는 "설득"(총장은 "결재 진행")이고, 서류는 들고 있는 결재판에 "설득" 도장으로 찍힌다.
// 다 차면 창구 직원·처장·부총장은 결재 대사("…퇴근합니다…")를 하고 걸어 나가고, 총장은 선 채로 승인한다.
// 싸우는 중에는 가끔 문구 검토 11-1·11-2절의 추가 대사(2026-11-15 사용자 승인)가 기존 대사와 섞여 나온다.
// - 창구 직원 (구역마다 한 명, 작은 중간 보스): 박국제학사(소등) · 김학생식당(국물) · 이진취(빨간 첨삭 선)
//   · 김국제(여권·서류 부채꼴) · 오학종지(대기번호표)
// - 박반려 서류반려처장: 서류 탑 뒤에 숨어 거대 "반려" 도장 → 탑을 무너뜨리면 당황(빈틈) → 반려 서류를 던진다
// - 김부재중 처장 (2D 교직원 모드 상사): 한참 늦게 나타나 결재판을 든다. 자주 전화를 받으러 자리를 비운다 —
//   없는 동안은 행정을 버티고, 돌아와 "어, 결재? 여기 있어. 미안 미안." 하며 결재판을 들 때 설득한다
// - 반사반사 결재부총장: 정면 결재판이 서류를 되받아친다(반사). 반사 직후·등 뒤·옆이 빈틈
// - 허허실실 부총장 (2D 교직원 모드 상사): 간식 둘을 떨어뜨리는데 하나는 일거리(밟으면 잠깐 멈춤). 던진 뒤 결재판을 든다
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
  /** 김부재중 처장이 자리를 비운 동안 몰려오는 행정 한 건 */
  spawnMinion(kind: 'doc' | 'absence' | 'bot'): void;
  /** 허허실실 부총장: 플레이어 양옆에 간식 하나와 일거리 하나 */
  dropSnacks(from: THREE.Vector3): void;
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

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** 싸우는 중 말하는 간격 (초) */
const TALK_EVERY: [number, number] = [9, 13];

export abstract class StudentBoss extends PersonBoss {
  protected readonly s: StuCtx;
  /** 막대 앞 글자 */
  readonly barWord: string = '설득';
  /** 처음 만났을 때 띠 아래 공략 */
  abstract readonly hintText: string;
  /** 처음 만났을 때 띠 제목 (비우면 이름) */
  introTitle = '';
  /** 싸우는 중 가끔 하는 말 (기존 대사 + 문구 검토 11절 추가 대사) */
  protected talk: readonly string[] = [];
  private talkT = TALK_EVERY[0] * 0.6 + Math.random() * 3;
  /** 이 시각(this.t)까지는 말하는 중 */
  private quietUntil = 0;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, exit: THREE.Vector3, approveLine: string, name: string, hp: number, doneText: string) {
    // 결재 대사에 "퇴근합니다…"가 이미 들어 있어 나갈 때는 말없이 (leaveLine = '')
    super(c, person, at, exit, approveLine, '', name, hp);
    this.s = s;
    this.doneText = doneText;
  }

  protected say(text: string, sec = 1.8): void {
    super.say(text, sec);
    this.quietUntil = this.t + sec + 0.6;
  }

  update(dt: number, c: Ctx): void {
    super.update(dt, c);
    // 싸우는 중 한마디 (다른 말을 하고 있으면 조금 뒤에)
    if (this.dead || this.state !== 'idle' || !this.obj.visible || this.talk.length === 0) return;
    this.talkT -= dt;
    if (this.talkT > 0) return;
    if (this.t < this.quietUntil) {
      this.talkT = 1;
      return;
    }
    this.say(pick(this.talk), 2.2);
    this.talkT = TALK_EVERY[0] + Math.random() * (TALK_EVERY[1] - TALK_EVERY[0]);
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

export type StaffKind = 'haksa' | 'sikdang' | 'jinchwi' | 'gukje' | 'hakjong';

interface StaffInfo {
  hp: number;
  every: number;
  keep: number;
  hint: string;
}

/** 본편 2D enemies.json의 값을 1인칭에 맞췄다 (설득 양 = 결재 양과 같은 단위) */
export const STAFF: Record<StaffKind, StaffInfo> = {
  haksa: { hp: 34, every: 10, keep: 9, hint: '불이 꺼지면 내 주변만 보여요' },
  sikdang: { hp: 34, every: 6.5, keep: 8, hint: '쏟아진 국물을 밟으면 미끄러져요' },
  jinchwi: { hp: 34, every: 8, keep: 9, hint: '빨간 첨삭 선은 점프(Space)로 넘을 수 있어요' },
  gukje: { hp: 34, every: 4.5, keep: 12, hint: '부채꼴로 날아오는 여권·서류를 피하세요' },
  hakjong: { hp: 36, every: 5.5, keep: 11, hint: '번호표를 뽑는 동안 본체를 치면 멈춰요' },
};

/**
 * 창구 직원 대사 (문구 검토 11-1절, 2026-11-15 사용자 승인 — 2D heroes.ts에 같은 줄이 들어가도 1인칭은 여기 것을 쓴다).
 * talk = 싸우는 중 (기존 대사와 섞인다), act = 기믹 쓸 때 (기존 대사와 반반)
 */
export const STAFF_TALK: Record<StaffKind, { talk: string[]; act?: string }> = {
  haksa: { talk: ['호실 번호 대세요!', '외박 신청은 어제까지였어요.', '벌점 1점입니다.'], act: '소등합니다~ 셋, 둘, 하나!' },
  sikdang: { talk: ['식권 먼저 사 오세요.', '줄 서세요, 줄!', '잔반은 남기지 마세요!'], act: '어머, 국물 조심하세요~' },
  jinchwi: { talk: ['여기 맞춤법 틀렸어요.', '두괄식으로 쓰세요!', '글자 수 초과입니다.', '지원 동기가 약해요.'], act: '빨간 펜 들어갑니다~' },
  gukje: { talk: ['여권 유효기간 확인하셨어요?', '어학 성적이 만료됐어요.', '파견 서류는 원본으로 주세요.', '출국 전 오리엔테이션은 필참입니다!'], act: '서류 돌려드릴게요~' },
  hakjong: { talk: ['다음 번호 손님~', '본인 확인되셨어요?', '그건 학과 사무실에 문의하세요.', '증명서는 무인발급기에서 떼세요.'] },
};
/** 박국제학사: 불이 다시 켜질 때 (11-1절) */
export const LIGHTS_ON_LINE = '어? 누가 불 켰어요?';

/** 보스 싸우는 중 대사 (문구 검토 11-2절, 2026-11-15 사용자 승인) */
const BANRYEO_TALK = ['양식이 작년 거예요.', '도장 위치가 틀렸어요.', '원본 대조필 받아 오세요.', '첨부 서류 순서가 틀렸어요.'];
const BANSA_TALK = ['결재 라인 다시 확인하세요.', '그건 처장 전결 사항입니다.', '협조 부서 서명부터 받아 오세요.'];
const BANSA_BLOCK = '반려가 아니라 반사입니다~';
const BANSA_GAP = '앗, 뒤는 못 봤는데…';
/** 김부재중 처장·허허실실 부총장 (2D 교직원 모드 Supervisor.ts 대사 그대로) */
const BUJAE_LINE = '어, 결재? 여기 있어. 미안 미안.';
export const HOHO_LINE = '허허, 수고가 많아요~ 이거 먹고 해요.';
/** 프레지던트 캉 추가 대사 (11-2절, 2026-11-15 비서실 확인 — 글자 그대로) */
const PRESIDENT_EXTRA = ['서류가 꼼꼼하네요.', '학생 의견, 잘 듣고 있습니다.', '이 부분은 근거를 더 봅시다.', '졸업 축하는… 아직 이르죠?'];

/** 미리 그려 둘 대사 (StudentMode.warm) */
export const STUDENT_BOSS_LINES: string[] = [
  ...Object.values(STAFF_TALK).flatMap((t) => [...t.talk, ...(t.act ? [t.act] : [])]),
  LIGHTS_ON_LINE,
  ...BANRYEO_TALK,
  ...BANSA_TALK,
  BANSA_BLOCK,
  BANSA_GAP,
  BUJAE_LINE,
  HOHO_LINE,
  ...PRESIDENT_EXTRA,
];

const DARK_SEC = 5.5;
const LINE_SEC = 4.5;
const CHAIN = 4;
const MAX_SLIPS = 6;
/** 국물이 남는 시간 (2D puddleSec) */
const PUDDLE_SEC = 7;
/** 김국제 부채꼴 수 (2D fan) */
const FAN_N = 5;

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
    this.talk = [line, ...STAFF_TALK[staff].talk];
  }

  /** 기믹을 쓸 때 하는 말 (기존 대사와 추가 대사 반반) */
  private actLine(): string {
    const a = STAFF_TALK[this.staff].act;
    return a && Math.random() < 0.5 ? a : this.line;
  }

  /** 박국제학사: 불이 다시 켜졌다 */
  lightsOn(): void {
    if (this.staff === 'haksa' && !this.dead) this.say(LIGHTS_ON_LINE, 1.6);
  }

  /** touch: 터치 화면이면 첨삭 선 공략을 버튼 이름으로 */
  setTouchHint(touch: boolean): void {
    if (touch && this.staff === 'jinchwi') this.hintText = '빨간 첨삭 선은 점프(파란 버튼)로 넘을 수 있어요';
  }

  private go(sub: 'walk' | 'act' | 'lure'): void {
    this.sub = sub;
    this.subT = 0;
  }

  /** 서성일 때는 모두, 기믹·결재판을 든 동안은 옆걸음만 */
  roam(): Roam {
    const r = super.roam();
    return r === 'all' && this.sub !== 'walk' ? 'step' : r;
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
        // 김국제는 기믹이 부채꼴이라 따로 던지지 않는다
        this.throwT -= dt;
        if (this.throwT <= 0 && this.staff !== 'gukje') {
          this.throwT = 3.6;
          this.fan(c, 'paper', 3, 8.5, 0.2);
        }
        this.gimmickT -= dt;
        if (this.gimmickT <= 0 && this.ready()) {
          this.acted = false;
          this.reachTo = 1;
          this.say(this.actLine(), 1.6);
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
      case 'sikdang':
        // 국자를 휘둘러 플레이어 발밑 쪽으로 국물을 쏟는다
        if (!this.acted && t >= 0.5) {
          this.acted = true;
          const a = c.area;
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * 0.9;
          const x = Math.max(a.minX + 1, Math.min(a.maxX - 1, c.eye.x + Math.cos(ang) * r));
          const z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, c.eye.z + Math.sin(ang) * r));
          this.s.haz.spill(x, z, PUDDLE_SEC);
          c.fx.text(_a.set(x, 1.4, z), '국물 주의!', '#ffd27f', 0.7);
          c.fx.confetti(_a.set(x, 0.3, z), 14, 3, 0xd99545, 1.2, 0.6);
          c.sound('weak', _a, 0.8);
        }
        if (t >= 1.0) this.toLure();
        break;
      case 'gukje':
        // 여권·서류를 부채꼴로 (짝수 = 여권, 홀수 = 서류: 2D createPassportIcon과 같은 차례)
        if (!this.acted && t >= 0.45) {
          this.acted = true;
          this.fanMixed(c, FAN_N, 8.5, 0.2);
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

  /** 김국제: 여권(피하기만)과 서류(서류로 맞혀 없앨 수 있다)를 번갈아 부채꼴로 */
  private fanMixed(c: Ctx, n: number, speed: number, spread: number): void {
    const from = _a.copy(this.person.chest);
    from.y += 0.4 * this.person.look.scale;
    const base = Math.atan2(c.eye.x - from.x, c.eye.z - from.z);
    const flat = Math.hypot(c.eye.x - from.x, c.eye.z - from.z);
    const pitch = Math.atan2(c.eye.y - from.y, flat);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      _b.set(Math.sin(a) * Math.cos(pitch), Math.sin(pitch), Math.cos(a) * Math.cos(pitch)).multiplyScalar(speed);
      if (i % 2 === 1) c.sheet(from, _b, 'paper');
      else this.s.haz.throwPassport(from, _b);
    }
    c.sound('volley', from, 0.9);
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
  /** 탑을 쌓은 자리 (숨어 있는 동안 이 근처에서만 옆걸음) */
  private readonly anchor = new THREE.Vector3();

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3, towerHp: number) {
    super(c, s, person, at, exit, '반려… 철회합니다. 퇴근합니다…', '박반려 · 서류반려처장', 70, '반려 철회!');
    this.spot.copy(spot);
    this.towerHp = towerHp;
    this.talk = BANRYEO_TALK;
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

  /**
   * 탑 뒤(쌓기·숨기·내밀기)에서는 탑 뒤 좁은 범위에서 옆걸음만, 물러날 때는 그대로,
   * 탑이 무너져 나와 있을 때는 모두 (결재판을 든 동안은 옆걸음만)
   */
  roam(): Roam {
    const r = super.roam();
    if (r !== 'all') return r;
    if (this.sub === 'out') return 'all';
    return this.sub === 'build' || this.sub === 'retreat' ? 'none' : 'step';
  }

  roamRange(): Rect | null {
    if (this.sub !== 'hide' && this.sub !== 'peek') return null;
    const a = this.anchor;
    return { minX: a.x - 0.6, maxX: a.x + 0.6, minZ: a.z - 0.6, maxZ: a.z + 0.6 };
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
          this.anchor.copy(o);
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
  private gapSaid = -9;
  private dashDir = new THREE.Vector3();
  private dashHit = false;
  private dashStart = new THREE.Vector3();
  private spot: THREE.Vector3;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3) {
    super(c, s, person, at, exit, '결재… 올려 드리죠. 퇴근합니다…', '반사반사 · 결재부총장', 75, '결재 완료!');
    this.spot = spot.clone();
    // 큰 결재판
    person.clip.scale.setScalar(1.4);
    this.talk = BANSA_TALK;
    // 원래 "전결 처리합니다!" 하며 달려오므로 공통 달려오기는 쓰지 않는다
    if (this.mover) this.mover.rush = false;
  }

  /** 서성일 때는 옆걸음·사라지기, 겨누고 달리는 동안은 그대로, 나머지는 옆걸음만 */
  roam(): Roam {
    const r = super.roam();
    if (r !== 'all' || this.sub === 'walk') return r;
    return this.sub === 'wind' || this.sub === 'dash' ? 'none' : 'step';
  }

  /** 몸은 정해진 빠르기로만 돈다 (다시 나타나도 곧바로 정면을 돌리지 않는다: 옆·등이 빈틈) */
  roamFace(x: number, z: number, dt: number): void {
    this.turnTo(x, z, Math.min(dt, 0.05), this.turnRate);
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
      if (this.t - this.gapSaid > 6) {
        this.gapSaid = this.t;
        this.say(BANSA_GAP, 1.4);
      }
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
      this.say(this.blocks < 4 ? '결재판 보이시죠?' : pick(['정면은 안 됩니다~', BANSA_BLOCK]), 1.1);
    }
  }
}

// ---------- 김부재중 처장 ----------
// 2D: 결재가 필요한 구역에서 한참 늦게 나타나 결재해 준다 ("김부재중 처장 부재중… 돌아올 때까지 버티세요").
// 1인칭 학생 모드: 처음에는 자리에 없다 → 없는 동안 행정을 버틴다 → 문에서 걸어 나와 "어, 결재? 여기 있어. 미안 미안."
// 하며 결재판을 든다(빈틈) → 잠깐 서류를 던지며 서성이다 전화("따르릉!")를 받으러 다시 나간다. 설득될 때까지 되풀이.

type BujaeSub = 'away' | 'back' | 'sign' | 'here' | 'look' | 'call' | 'out';

export class Bujae extends StudentBoss {
  readonly hintText = '김부재중 처장 부재중… 돌아올 때까지 버티세요';
  private sub: BujaeSub = 'away';
  private subT = 0;
  private awayT: number;
  private addT = 1.2;
  private adds = 0;
  private hereT = 0;
  private lookT = 0;
  private throwT = 1.5;
  private side = 1;
  private sideT = 0;
  private readonly door: THREE.Vector3;
  private readonly spot: THREE.Vector3;

  /** door: 들어오고 나가는 문, spot: 결재판을 드는 자리 */
  constructor(c: Ctx, s: StuCtx, person: Person, door: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3) {
    super(c, s, person, door, exit, '퇴근합니다…', '김부재중 처장', 54, '결재 완료!');
    this.introTitle = '다음 구역은 결재가 필요합니다';
    this.door = door.clone();
    this.spot = spot.clone();
    // 처음에는 한참 늦게 (2D 9초)
    this.awayT = s.easy ? 7 : 9;
    this.obj.visible = false;
  }

  /** 자리에 없을 때는 설득할 수 없다 */
  get targetable(): boolean {
    return super.targetable && this.sub !== 'away';
  }

  /** 자리를 비웠다 */
  get away(): boolean {
    return !this.dead && this.sub === 'away';
  }

  /** 문에서 걸어오는 중 */
  get coming(): boolean {
    return !this.dead && this.sub === 'back';
  }

  /** 돌아오기까지 남은 초 */
  get awayLeft(): number {
    return Math.max(0, this.awayT);
  }

  /** 자리에 있을 때는 모두, 결재판을 들거나 전화를 받는 동안은 옆걸음만, 자리를 비우거나 문을 오갈 때는 그대로 */
  roam(): Roam {
    const r = super.roam();
    if (r !== 'all' || this.sub === 'here') return r;
    return this.sub === 'sign' || this.sub === 'look' || this.sub === 'call' ? 'step' : 'none';
  }

  private go(sub: BujaeSub): void {
    this.sub = sub;
    this.subT = 0;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') this.setState('idle');
    this.subT += dt;
    switch (this.sub) {
      case 'away':
        this.obj.visible = false;
        this.awayT -= dt;
        // 없는 동안 행정이 몰려온다 (2D: 2.6초마다, 살아 있는 것이 둘 미만일 때)
        this.addT -= dt;
        if (this.addT <= 0 && c.minions() < 2) {
          this.adds++;
          this.s.spawnMinion(this.adds % 3 === 0 ? 'absence' : this.adds % 4 === 0 ? 'bot' : 'doc');
          this.addT = 2.6;
        }
        if (this.awayT <= 0) {
          this.obj.position.copy(this.door);
          this.faceNow(this.spot.x, this.spot.z);
          this.obj.visible = true;
          this.s.note('김부재중 처장이 오는 중…', 2);
          this.go('back');
        }
        break;
      case 'back': {
        const there = this.walkTo(this.spot.x, this.spot.z, 3.0, dt, null, 0.5);
        this.faceTo(there ? c.eye.x : this.spot.x, there ? c.eye.z : this.spot.z, dt, 6);
        if (there || this.subT > 7) {
          this.say(BUJAE_LINE, 2.4);
          this.openWindow();
          this.go('sign');
        }
        break;
      }
      case 'sign':
        // 결재판을 들고 기다린다 (빈틈). 약점 세 번이면 내린다
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.subT >= (this.s.easy ? 3.8 : 3.0) || this.raiseTo < 0.5) {
          this.raiseTo = 0;
          this.hereT = 7 + Math.random() * 2;
          this.lookT = 4.2;
          this.throwT = 1.2;
          this.go('here');
        }
        break;
      case 'here':
        this.sideT -= dt;
        if (this.sideT <= 0) {
          this.side = -this.side;
          this.sideT = 3 + Math.random() * 2;
        }
        this.keepAway(c, dt, 9, 1.6, this.side);
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.throwT -= dt;
        if (this.throwT <= 0) {
          this.throwT = 3.0;
          this.reachTo = 1;
          this.fan(c, 'paper', 3, 8.5, 0.2);
        }
        if (this.reachTo > 0 && this.throwT < 2.4) this.reachTo = 0;
        this.lookT -= dt;
        if (this.lookT <= 0) {
          // 서류를 훑어본다 (빈틈)
          this.reachTo = 0;
          this.openWindow();
          this.go('look');
          break;
        }
        this.hereT -= dt;
        if (this.hereT <= 0) {
          // 전화가 온다 → 받으러 나간다
          c.fx.text(_a.copy(this.person.chest).setY(this.person.chest.y + 1.6), '따르릉!', '#ffe066', 0.6);
          c.sound('ring', this.person.chest, 0.8);
          this.reachTo = 1;
          this.raiseTo = 0;
          this.go('call');
        }
        break;
      case 'look':
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.hereT -= dt;
        if (this.subT >= (this.s.easy ? 2.4 : 1.8) || this.raiseTo < 0.5) {
          this.raiseTo = 0;
          this.lookT = 4.5;
          this.go('here');
        }
        break;
      case 'call':
        // 전화를 귀에 대고 잠깐 (휴대폰을 든 왼팔)
        this.faceTo(c.eye.x, c.eye.z, dt, 3);
        this.reachTo = 1;
        if (this.subT >= 1.1) this.go('out');
        break;
      case 'out': {
        this.reachTo = 1;
        const there = this.walkTo(this.door.x, this.door.z, 3.2, dt, null, 0.6);
        this.faceTo(this.door.x, this.door.z, dt, 6);
        if (there || this.subT > 8) {
          this.reachTo = 0;
          this.obj.visible = false;
          this.awayT = this.s.easy ? 5 : 6;
          this.addT = 1.0;
          this.s.note('김부재중 처장 부재중… 돌아올 때까지 버티세요', 2.2);
          this.go('away');
        }
        break;
      }
    }
  }

  die(): void {
    super.die();
    this.obj.visible = true;
  }
}

// ---------- 허허실실 부총장 ----------
// 2D: "허허, 수고가 많아요~ 이거 먹고 해요." 하며 간식 둘을 떨어뜨리는데 하나는 일거리다.
// 1인칭 학생 모드: 플레이어 양옆에 간식 하나와 일거리(삼각김밥? — 서류 귀퉁이가 보인다) 하나를 놓고,
// 결재판을 들고 반응을 본다(빈틈). 그 사이사이 결재 서류를 부채꼴로 던진다.

type HohoSub = 'walk' | 'snack' | 'look';

export class Hoho extends StudentBoss {
  readonly hintText = '간식 둘 중 하나는 일거리! 종이 귀퉁이를 보세요';
  private sub: HohoSub = 'walk';
  private subT = 0;
  private snackT = 3.2;
  private throwT = 2.4;
  private dropped = false;
  private side = 1;
  private sideT = 0;
  private readonly spot: THREE.Vector3;

  constructor(c: Ctx, s: StuCtx, person: Person, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3) {
    super(c, s, person, at, exit, '퇴근합니다…', '허허실실 부총장', 70, '결재 완료!');
    this.spot = spot.clone();
  }

  private go(sub: HohoSub): void {
    this.sub = sub;
    this.subT = 0;
  }

  /** 서성일 때는 모두, 간식을 놓고 지켜보는 동안은 옆걸음만 */
  roam(): Roam {
    const r = super.roam();
    return r === 'all' && this.sub !== 'walk' ? 'step' : r;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') {
      if (this.stateT < dt * 1.5) this.say(HOHO_LINE, 2.4);
      this.walkTo(this.spot.x, this.spot.z, 2.4, dt, null, 0.4);
      this.faceTo(c.eye.x, c.eye.z, dt);
      if (this.stateT > 2.8) this.setState('idle');
      return;
    }
    this.subT += dt;
    const half = this.hp <= this.maxHp / 2;
    switch (this.sub) {
      case 'walk':
        this.sideT -= dt;
        if (this.sideT <= 0) {
          this.side = -this.side;
          this.sideT = 3.5 + Math.random() * 2;
        }
        this.keepAway(c, dt, 9.5, 1.7, this.side);
        this.faceTo(c.eye.x, c.eye.z, dt);
        this.throwT -= dt;
        if (this.throwT <= 0) {
          this.throwT = half ? 2.8 : 3.4;
          this.reachTo = 1;
          this.fan(c, 'meeting', half ? 4 : 3, 9, 0.22);
        }
        if (this.reachTo > 0 && this.throwT < (half ? 2.2 : 2.8)) this.reachTo = 0;
        this.snackT -= dt;
        // 놓아 둔 일거리가 남아 있으면 기다린다
        if (this.snackT <= 0 && this.s.haz.worksOut === 0) {
          this.say(HOHO_LINE, 1.8);
          this.reachTo = 1;
          this.dropped = false;
          this.go('snack');
        }
        break;
      case 'snack':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (!this.dropped && this.subT >= 0.45) {
          this.dropped = true;
          this.s.dropSnacks(this.person.chest);
          c.sound('pop', this.person.chest, 0.6);
        }
        if (this.subT >= 0.9) {
          this.reachTo = 0;
          this.openWindow();
          this.go('look');
        }
        break;
      case 'look':
        // 간식을 고르는지 결재판을 들고 지켜본다 (빈틈)
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.subT >= (this.s.easy ? 3.0 : 2.4) || this.raiseTo < 0.5) {
          this.raiseTo = 0;
          this.snackT = (half ? 6 : 7) + Math.random() * 2;
          this.throwT = 1.2;
          this.go('walk');
        }
        break;
    }
  }
}

// ---------- 프레지던트 캉 (학생 모드) ----------

/** 설득하는 중 하는 말: 2D 기존 대사 + 비서실 확인을 받은 추가안 4줄 (11-2절) */
const PRESIDENT_TALK = ['검토하겠습니다.', '꼼꼼히 다시 봅시다.', ...PRESIDENT_EXTRA];

export class StudentPresident extends President {
  readonly barWord = '결재 진행';
  // 2D 학생 모드 문구 그대로 (StageScene·PresidentBoss)
  readonly hintText = '졸업 서류 최종 결재 — 거대 도장 그림자를 피하며 설득하세요';
  private greeted = false;
  private talkT = 7 + Math.random() * 3;
  private quietUntil = 0;

  constructor(c: Ctx, person: Person) {
    super(c, person);
    this.stormHint = '쏟아지는 오류 창(빨간 표시)과 패킷을 피하며 설득하세요';
    this.approveLine = '좋아요, 검토 끝났습니다.';
    this.doneText = '검토 완료!';
    // 교직원 모드 총장전 새 대사(2026-11-17)는 학생 모드에 쓰지 않는다: 2D 그대로 "보류!" / "재검토!", 싸우는 중 한마디는 아래 talk
    this.holdLine = '보류!';
    this.reLine = '재검토!';
    this.fightLines = [];
  }

  protected say(text: string, sec = 1.8): void {
    // 결재판을 살펴볼 때 하는 말("검토하겠습니다." / "꼼꼼히 다시 봅시다.")은 추가안과 무작위로 섞는다
    if (this.state === 'review' && (text === '검토하겠습니다.' || text === '꼼꼼히 다시 봅시다.') && Math.random() < 0.5) text = pick(PRESIDENT_EXTRA);
    super.say(text, sec);
    this.quietUntil = this.t + sec + 0.6;
  }

  protected think(dt: number, c: Ctx): void {
    super.think(dt, c);
    // 첫 인사는 본편 2D 학생 모드 대사로
    if (this.state === 'enter' && !this.greeted) {
      this.greeted = true;
      this.say('졸업 서류요? 한번 검토해 봅시다.', 2.4);
    }
    // 서성이는 동안 가끔 한마디 (서버 폭주 중에는 안 한다)
    if (this.state !== 'idle') return;
    this.talkT -= dt;
    if (this.talkT > 0) return;
    if (this.t < this.quietUntil) {
      this.talkT = 1;
      return;
    }
    this.say(pick(PRESIDENT_TALK), 2.2);
    this.talkT = 9 + Math.random() * 4;
  }
}
