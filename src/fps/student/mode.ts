import * as THREE from 'three';
import { clockText, OFF_HOURS, START_CLOCK } from '../../config';
import { SPELLS, spellById, type SpellDef } from '../../data/spells';
import { STUDENT_HEROES, studentHeroById, type StudentHeroDef } from '../../data/students';
import { gpa, gradeStage, type Grade } from '../../grade';
import { lateMin, onTime, outcomeText } from '../../run';
import type { Rect } from '../blocks';
import { attachRecordForm } from '../board';
import type { PersonBoss } from '../bosses';
import { DORM_DOOR, HUM_DOOR, PATH3, PATH3_GUIDE, type Stage } from '../campus';
import type { Ctx, Enemy, HurtKind } from '../enemies';
import type { FoodKind } from '../models';
import { peopleKit, type Person, type Who } from '../people';
import { DIFF_KEYS, DIFFS, saveSettings, timeText, type Diff, type DiffKey, type Settings } from '../settings';
import { clearSubtitle, prepareSpeech } from '../speech';
import { FRONT_X } from '../social';
import type { World } from '../world';
import { Bansa, Banryeo, Bujae, Hoho, STUDENT_BOSS_LINES, StudentBoss, StudentPresident, WindowStaff, type StaffKind, type StuCtx } from './bosses';
import { AbsenceStamp, CancelBot, DocTower, RejectDoc, Ticket } from './enemies';
import { AttendQR, DueBadge, spawnDue } from './mobs';
import { StudentHazards } from './hazards';
import { StudentKit } from './models';
import { buildStudentPeople, staffHero, type StudentPeople } from './people';
import { heroPortrait } from './textures';
import { ensureDom, esc, hideSpell, playEnding, showCombo, showSpell, spellHtml } from './ui';

// 1인칭 시험판 학생 모드 (본편 2D 학생 모드 내용, 2026-11-14 · 2026-11-15 구역 다섯 곳).
// 교직원 모드를 거꾸로 올라간다: 대운동장 → 국제학사 앞 → 인문과학관 앞 → 사회과학관 앞 → 본관 앞
// → 본관 총장실(계단 앞). 구역과 길은 아래 ROUTE·LINKS 표 (새 구역·길은 campus.ts).
// 구역마다: 학사 행정 잡몹 차례 → 창구 직원(작은 중간 보스) → 처장·부총장 (본관 앞은 창구 직원 뒤 총장).
// 학생은 도장 대신 졸업 서류(비행기)를 던진다. 맞힌 자리에는 "통과"(사물)·"설득"(사람 결재판) 도장 자국이 남는다.
// 16:52 시작, 17:00 본관 업무 마감. 결과는 성적표(구역마다 학점, 누적 GPA — 본편 2D grade.ts와 같은 기준).
// main.ts의 Game은 연결 부분(모드 고르기·단계·HUD 몇 줄)만 이 파일을 부른다. 그래서 Game의 모양을 여기 적어 둔다.

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';

/** 학생 모드가 쓰는 Game의 공개 부분 */
export interface StudentGame extends Ctx {
  mode: 'staff' | 'student';
  stage: Stage;
  phase: Phase;
  readonly world: World;
  readonly people: Record<Who, Person>;
  readonly rack: THREE.Group;
  readonly settings: Settings;
  readonly diff: Diff;
  runDiff: DiffKey;
  bounds: Rect[];
  readonly pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  jumpY: number;
  vy: number;
  hp: number;
  readonly elapsed: number;
  readonly damageTaken: number;
  readonly processed: number;
  readonly hits: number;
  readonly thrown: number;
  enemies: Enemy[];
  boss: PersonBoss | null;
  approved: string[];
  firing: boolean;
  readonly stamps: readonly { obj: THREE.Group; vel: THREE.Vector3; on: boolean }[];
  readonly sheets: readonly { obj: THREE.Mesh; on: boolean }[];
  pickups: { obj: THREE.Group }[];
  start(): void;
  restart(): void;
  spawnPickup(kind: FoodKind, x: number, z: number): void;
}

/** Game이 감춰 둔 것 가운데 학생 모드가 빌려 쓰는 것 */
export interface StudentHost {
  readonly touch: boolean;
  overlay(html: string): HTMLElement;
  hideOverlay(): void;
  showTitle(): void;
  /** 교직원 선택 화면 (staffpick.ts) */
  showStaff(): void;
  /** 판을 처음으로 되돌리고 타이틀로 */
  toTitle(): void;
  showSettings(): void;
  placeBoss(b: PersonBoss): void;
  showBossBar(name: string): void;
  lower(g: THREE.Group): void;
  note(text: string, time?: number): void;
  hint(key: string, text: string, time?: number): void;
  buzz(p: number | number[]): void;
  setDusk(k: number): void;
  /** 화면 오른쪽 아래 팔: 소매·손·도장 묶음 */
  readonly arm: { sleeve: THREE.Mesh; stamp: THREE.Group };
  /** 친구 구조 장면(trapped.ts)이 안 끝났으면 민원 차례를 끝내지 않는다 */
  holdWave(): boolean;
}

const EYE = 1.6;
/** 마지막 구역 (성적표 마지막 줄) */
const FINAL_NAME = '본관 총장실';

/** due = 과제 마감 알림 떼, qr = 출석 QR 코드 (student/mobs.ts, 2번째 구역부터) */
type Spawn = 'doc' | 'absence' | 'bot' | 'queue' | 'due' | 'qr';
type BossKind = 'banryeo' | 'bansa' | 'bujae' | 'hoho';
type V3 = THREE.Vector3;
const v3 = (x: number, z: number) => new THREE.Vector3(x, 0, z);

/** 사람이 들어오는 자리 · 서는 자리 · 나가는 자리 */
interface Spots {
  at: V3;
  spot: V3;
  exit: V3;
}

/** 학생 경로의 구역 하나 (차례대로) */
interface AreaDef {
  /** 성적표·HUD 이름 */
  name: string;
  /** 구역 안에 있을 때 Game.stage */
  stage: Stage;
  rect(w: World): Rect;
  /** 몰려오는 행정 (queue = 번호표 행렬 하나) */
  wave: Partial<Record<Spawn, number>>;
  staff: StaffKind;
  /** 창구 직원 다음 보스 (null = 창구 직원 뒤 총장실로) */
  boss: BossKind | null;
  staffAt(g: StudentGame): Spots;
  /** 보스 자리 (김부재중 처장은 at = 드나드는 문) */
  bossAt?(g: StudentGame): Spots;
  /** 들어서면 놓이는 먹을 것 */
  food?(g: StudentGame): [FoodKind, number, number][];
  /** 노을 정도 (시계와 견줘 큰 쪽) */
  dusk: number;
}

/** 구역과 다음 구역 사이 길 */
interface LinkDef {
  stage: Stage;
  bounds(w: World): Rect[];
  barricade(w: World): THREE.Group;
  arrows(w: World): THREE.Group;
  /** 구역 카드 아래 줄 */
  card: string;
  /** 시계 아래 장소 · 왼쪽 위 안내 */
  place: string;
  go: string;
  /** HUD 길 안내가 가리키는 점 (꺾이는 길은 지금 자리에 따라) */
  guide(p: V3): { x: number; z: number };
  /** 다음 구역에 들어섰나 */
  arrived(p: V3): boolean;
  dusk: number;
}

/**
 * 학생 경로 (교직원 경로를 거꾸로): 구역 다섯 곳 → 본관 총장실.
 * ROUTE[i]에서 LINKS[i]를 지나 ROUTE[i + 1]로 간다.
 */
const ROUTE: AreaDef[] = [
  {
    name: '대운동장',
    stage: 'field',
    rect: (w) => w.field,
    wave: { doc: 5, absence: 1 },
    staff: 'haksa',
    boss: 'banryeo',
    // 대운동장: 동쪽 트랙 쪽에서 걸어 들어온다
    staffAt: (g) => {
      const spot = v3(Math.max(60, Math.min(128, g.pos.x + 9)), Math.max(66, Math.min(100, g.pos.z + 8)));
      return { at: v3(Math.min(136, spot.x + 8), spot.z), spot, exit: v3(150, 80) };
    },
    dusk: 0.05,
  },
  {
    // 학생회관 및 기숙사: 학생식당 창구 → 간식을 든 부총장
    name: '국제학사 앞',
    stage: 'dorm',
    rect: (w) => w.dorm,
    wave: { doc: 3, absence: 2, bot: 1, due: 1, qr: 1 },
    staff: 'sikdang',
    boss: 'hoho',
    // 국제학사 현관에서 나온다
    staffAt: () => ({ at: v3(198, 79), spot: v3(179, 75), exit: DORM_DOOR.clone() }),
    bossAt: () => ({ at: v3(198, 84), spot: v3(180, 82), exit: DORM_DOOR.clone() }),
    food: () => [
      ['gimbap', 165, 76],
      ['americano', 171, 59],
    ],
    dusk: 0.2,
  },
  {
    // 국제교류 서류 창구 → 결재가 늦는 처장
    name: '인문과학관 앞',
    stage: 'hum',
    rect: (w) => w.hum,
    wave: { doc: 3, bot: 1, absence: 2, due: 1, qr: 1 },
    staff: 'gukje',
    boss: 'bujae',
    // 인문과학관 현관에서 나온다 (김부재중 처장은 이 문으로 드나든다)
    staffAt: () => ({ at: v3(180, 8), spot: v3(164, 12), exit: HUM_DOOR.clone() }),
    bossAt: () => ({ at: HUM_DOOR.clone(), spot: v3(170, 7), exit: HUM_DOOR.clone() }),
    food: () => [
      ['gimbap', 158, 32],
      ['americano', 170, 32],
    ],
    dusk: 0.35,
  },
  {
    name: '사회과학관 앞',
    stage: 'plaza',
    rect: (w) => w.plaza,
    wave: { doc: 3, bot: 2, absence: 1, due: 1, qr: 1 },
    staff: 'jinchwi',
    boss: 'bansa',
    // 사회과학관 현관에서 나온다
    staffAt: () => ({ at: v3(FRONT_X - 1.5, 6), spot: v3(108, 4), exit: v3(FRONT_X - 0.5, 6) }),
    bossAt: () => ({ at: v3(FRONT_X - 1.5, -4), spot: v3(104, -2), exit: v3(FRONT_X - 0.5, -4) }),
    food: () => [
      ['gimbap', 88, 8],
      ['americano', 102, 8],
    ],
    dusk: 0.45,
  },
  {
    name: '본관 앞',
    stage: 'yard',
    rect: (w) => w.yard,
    wave: { doc: 3, bot: 2, absence: 1, queue: 1, due: 1, qr: 1 },
    staff: 'hakjong',
    boss: null,
    // 본관 문에서 나온다
    staffAt: () => ({ at: v3(0, -19.2), spot: v3(0, -9), exit: v3(0, -20) }),
    food: (g) => [[g.hp <= 6 ? 'donkatsu' : 'gimbap', 18, 8]],
    dusk: 0.62,
  },
];

/** 사회과학관 앞 광장으로 올라가는 path3 세로 칸의 가운데 (x) */
const PATH3_X = (PATH3[0].minX + PATH3[0].maxX) / 2;

const LINKS: LinkDef[] = [
  {
    // 대운동장 동쪽 철망 문 → 국제학사 앞
    stage: 'path5',
    bounds: (w) => [w.field, ...w.path5, w.dorm],
    barricade: (w) => w.barricade5,
    arrows: (w) => w.arrows5,
    card: '다음: 국제학사 앞 — 동쪽 철망 문으로 가세요 →',
    place: '국제학사 가는 길',
    go: '국제학사 앞으로 이동하세요',
    guide: () => ({ x: 162, z: 66 }),
    arrived: (p) => p.x > 158,
    dusk: 0.15,
  },
  {
    // 국제학사 앞 → 인문과학관 앞 (북쪽)
    stage: 'path4',
    bounds: (w) => [w.dorm, ...w.path4, w.hum],
    barricade: (w) => w.barricade4,
    arrows: (w) => w.arrows4,
    card: '다음: 인문과학관 앞 — 북쪽 길로 가세요 ↑',
    place: '인문과학관 가는 길',
    go: '인문과학관 앞으로 이동하세요',
    guide: () => ({ x: 165, z: 36 }),
    arrived: (p) => p.z < 39,
    dusk: 0.28,
  },
  {
    // 인문과학관 앞 → 사회과학관 남쪽 끝을 돌아 → 광장 (서쪽으로 가다가 모퉁이에서 북쪽)
    stage: 'path3',
    bounds: (w) => [w.hum, ...w.path3, w.plaza],
    barricade: (w) => w.barricade3,
    arrows: (w) => w.arrows3,
    card: '다음: 사회과학관 앞 — 서쪽 길로 가세요 ←',
    place: '사회과학관 가는 길',
    go: '사회과학관 앞으로 이동하세요',
    guide: (p) => (p.x > PATH3_X + 4 ? { x: PATH3_GUIDE[0][0], z: PATH3_GUIDE[0][1] } : { x: PATH3_X, z: 15 }),
    arrived: (p) => p.z < 17 && p.x < 119,
    dusk: 0.4,
  },
  {
    stage: 'path',
    bounds: (w) => [w.plaza, w.path, w.yard],
    barricade: (w) => w.barricade,
    arrows: (w) => w.arrows,
    card: '다음: 본관 앞 — 왼쪽 길로 가세요 ←',
    place: '본관 가는 길',
    go: '본관 앞으로 이동하세요',
    guide: () => ({ x: 18, z: 1 }),
    arrived: (p) => p.x < 24,
    dusk: 0.55,
  },
];

/** 성적표 줄 이름 (구역 다섯 곳 + 총장실) */
const AREAS = [...ROUTE.map((a) => a.name), FINAL_NAME];
const QUEUE_LEN = 4;

/** 잡몹을 통과시켰을 때 (본편 2D 학생 모드 글자) */
const DONE_TEXT: [new (...a: never[]) => Enemy, string, string][] = [
  [RejectDoc, '반려 철회!', 'doc'],
  [AbsenceStamp, '출석 인정!', 'absence'],
  [CancelBot, '펑!', 'bot'],
  [Ticket, '호출 완료', 'ticket'],
  [DocTower, '서류 탑 붕괴!', 'tower'],
  [DueBadge, '제출 완료!', 'due'],
  [AttendQR, '출석 인정', 'qr'],
];

const COUNT_LABEL: Record<string, [string, string]> = {
  doc: ['반려 서류', '장'],
  absence: ['결석 도장', '개'],
  bot: ['휴강 공지', '개'],
  ticket: ['대기번호표', '장'],
  tower: ['서류 탑', '개'],
  due: ['과제 마감 알림', '개'],
  qr: ['출석 QR 코드', '개'],
};

const PERSUADE = ['설득!', '반려 취소!', '한 번만 봐 주세요!', '서류 다 있어요!', '검토 부탁드려요!'];

/** 맞았을 때 아래 글 (학생 모드) */
const HURT: Partial<Record<HurtKind, string>> = {
  mail: '반려 사유 읽는 중… (느려짐)',
  phone: '쾅! 결석! (느려짐)',
  bubble: '휴강 공지에 부딪힘… (느려짐)',
  bulk: '번호표 행렬에 밀림… (느려짐)',
  paper: '서류에 맞음… (느려짐)',
  rental: '반려 서류에 맞음… (느려짐)',
  meeting: '결재 서류에 맞음… (느려짐)',
  wave: '전결 돌진에 밀림… (느려짐)',
  note: '과제 마감 알림에 맞음… (느려짐)',
  qr: '출석 QR 코드에 부딪힘… (느려짐)',
};

const BEST_KEY = 'staffsmash.fps.studentBest';
const PICK_KEY = 'staffsmash.fps.studentPick';

interface SBest {
  gpa: number;
  time: number;
}

interface AreaRec {
  time: number;
  damage: number;
  combo: number;
  grade: Grade;
}

type Flow = 'wave' | 'staff' | 'staffOut' | 'boss' | 'clear' | 'walk' | 'card' | 'fade' | 'final' | 'done' | 'ending' | 'result';

const _v = new THREE.Vector3();

function loadBest(): Partial<Record<DiffKey, SBest>> {
  const out: Partial<Record<DiffKey, SBest>> = {};
  try {
    const o = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, Partial<SBest>>;
    for (const k of DIFF_KEYS) {
      const b = o[k];
      if (b && typeof b.gpa === 'number' && typeof b.time === 'number') out[k] = { gpa: b.gpa, time: b.time };
    }
  } catch {
    /* 기록 없음 */
  }
  return out;
}

/** GPA가 높을수록, 같으면 빠를수록 좋은 기록 */
function recordBest(diff: DiffKey, rec: SBest): { best: SBest; isNew: boolean; prev: SBest | null } {
  const all = loadBest();
  const prev = all[diff] ?? null;
  const isNew = !prev || rec.gpa > prev.gpa || (rec.gpa === prev.gpa && rec.time < prev.time);
  if (isNew) {
    all[diff] = { gpa: rec.gpa, time: Math.round(rec.time * 10) / 10 };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch {
      /* 저장 못 해도 이 창에서는 보여 준다 */
    }
  }
  return { best: all[diff] as SBest, isNew, prev };
}

function bestLine(highlight: DiffKey): string {
  const all = loadBest();
  return DIFF_KEYS.map((k) => {
    const b = all[k];
    const body = b ? `GPA <b>${b.gpa.toFixed(2)}</b> ${timeText(b.time)}` : '—';
    return `<span class="${k === highlight ? 'cur' : ''}">${DIFFS[k].label} ${body}</span>`;
  }).join('');
}

export class StudentMode implements StuCtx {
  readonly kit = new StudentKit();
  readonly haz: StudentHazards;
  private readonly ppl: StudentPeople;
  private readonly towerModel: THREE.Group;
  private readonly office: THREE.Group;
  private hero: StudentHeroDef = STUDENT_HEROES[0];
  private spell: SpellDef = SPELLS[0];
  private portraits = new Map<string, string>();
  private applied = false;
  private held: THREE.Group;
  private sleeveColor = new THREE.Color();
  private markMap: THREE.Texture | null = null;
  private helpHtml = '';
  private nameText = '';
  // 판 상태
  private area = 0;
  private flow: Flow = 'wave';
  private flowT = 0;
  private queue: Spawn[] = [];
  private spawnT = 0;
  private addT = 0;
  private waveDelay = -1;
  private ticketNo = 86;
  private combo = 0;
  private comboT = 0;
  private areaCombo = 0;
  private lastHits = 0;
  private lastDamage = 0;
  private recs: AreaRec[] = [];
  private areaStart = { time: 0, damage: 0 };
  private counts: Record<string, number> = {};
  private spellT = 0;
  private cardT = 0;
  private darkSec = -1;
  private ending: { skip: () => void; cancel: () => void } | null = null;
  private arrowsFlipped = false;

  constructor(
    private readonly g: StudentGame,
    private readonly h: StudentHost,
  ) {
    ensureDom();
    this.haz = new StudentHazards(g.scene, this.kit);
    this.ppl = buildStudentPeople();
    this.towerModel = this.kit.docTower();
    this.towerModel.visible = false;
    this.office = this.kit.presidentOffice();
    g.scene.add(this.office);
    this.held = this.kit.heldPaper();
    this.held.visible = false;
    h.arm.stamp.add(this.held);
    this.sleeveColor.copy((h.arm.sleeve.material as THREE.MeshLambertMaterial).color);
    try {
      const p = JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as { hero?: string; spell?: string };
      if (p.hero) this.hero = studentHeroById(p.hero);
      if (p.spell) this.spell = spellById(p.spell);
    } catch {
      /* 처음 고르는 값 */
    }
    // 학생 모드에서는 Game.area(잡몹이 나오고 보스가 걷는 경계)를 학생 경로의 지금 구역으로 돌려준다.
    // Game.area는 단계 이름으로 구역을 고르는데, 학생은 같은 구역을 거꾸로 돌므로 여기서 직접 정한다.
    // (main.ts를 고치지 않으려고 이 Game 객체에만 덮어쓴다. 교직원 모드·타이틀에서는 원래 값)
    const base = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(g), 'area')?.get;
    if (base) {
      Object.defineProperty(g, 'area', {
        configurable: true,
        get: () => (this.on && g.phase !== 'title' ? this.rect : (base.call(g) as Rect)),
      });
    }
  }

  get easy(): boolean {
    return this.g.runDiff === 'easy';
  }

  get on(): boolean {
    return this.g.mode === 'student';
  }

  /** 고른 주인공 (조력자가 부르는 이름, 친구 고르기) */
  get heroName(): string {
    return this.hero.name;
  }

  get heroId(): string {
    return this.hero.id;
  }

  /** 지금 구역 번호 (0 대운동장 · 1 사회과학관 앞 · 2 본관 앞 · 3 총장실) */
  get areaNo(): number {
    return this.area;
  }

  /** 지금 민원(행정) 차례 중 (친구 구조 장면은 이때 나온다, trapped.ts) */
  get inWave(): boolean {
    return this.flow === 'wave';
  }

  /** 구역 카드·화면 전환·엔딩 중 (조력자가 오지 않는다) */
  get busy(): boolean {
    return this.cardT > 0 || this.flow === 'card' || this.flow === 'fade' || this.flow === 'done' || this.flow === 'ending' || this.flow === 'result';
  }

  // ---------- 미리 그리기 ----------

  /** 학생 모드 모형·그림을 타이틀 뒤에서 한 번 그려 둔다. 돌려준 함수로 치운다 */
  warm(group: THREE.Group): () => void {
    const k = this.kit;
    const items: THREE.Object3D[] = [k.plane(), k.rejectDoc().obj, k.absenceStamp().obj, k.cancelBot().obj, k.ticket('087').obj];
    // 탑과 총장실 꾸밈은 판마다 다시 쓰므로 크기를 바꾸지 않고 그대로 보인다
    this.towerModel.visible = true;
    this.towerModel.position.set(4, -1.6, -4);
    group.add(this.towerModel);
    for (const t of [k.passMark, k.persuadeMark, k.reflectMark, k.paperDecal, k.rejectSheet, k.approvalSheet, ...k.spellMarks.values()]) {
      items.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: t })));
    }
    items.forEach((o, i) => {
      o.position.set((i - 6) * 0.5, 0, -1);
      o.scale.multiplyScalar(0.12);
      group.add(o);
    });
    this.office.visible = true;
    const ppl = [this.ppl.banryeo, this.ppl.bansa, this.ppl.bujae, this.ppl.hoho, ...Object.values(this.ppl.staff)];
    ppl.forEach((p, i) => {
      p.root.position.set(-6 + i * 1.4, -1.6, -3);
      p.say('…', 1, false);
      p.stampMark(true);
      p.update(0.016, { walking: true, raise: 0.5, reach: 0.5, wave: false });
      group.add(p.root);
    });
    // 대사 그림 (speech.ts 공용 말풍선 · 자막)
    prepareSpeech([
      '점호 시간입니다',
      '자소서 다시 써 오세요',
      '번호표 뽑고 기다리세요',
      '퇴근합니다…',
      '앗, 번호표 발행 중단…',
      '이 서류는 반려입니다!',
      '반려!',
      '제 서류 탑이…!',
      '반려합니다!',
      '잠깐, 서류 다시 쌓겠습니다.',
      '반려… 철회합니다. 퇴근합니다…',
      '결재판 보이시죠?',
      '전결 처리합니다!',
      '결재 서류 받으세요',
      '후… 전결 끝.',
      '반사!',
      '정면은 안 됩니다~',
      '결재… 올려 드리죠. 퇴근합니다…',
      '졸업 서류요? 한번 검토해 봅시다.',
      '좋아요, 검토 끝났습니다.',
      ...ROUTE.map((a) => staffHero(a.staff).line),
      ...STUDENT_BOSS_LINES,
    ]);
    const p = _v.set(0, 1.6, 6);
    for (const [t, col] of [
      ...DONE_TEXT.map(([, t]) => [t, '#7CFC9A']),
      ['쾅! 결석!', '#ff6b6b'],
      ['결석!', '#ff6b6b'],
      ['번호표 발행!', '#9fd3ff'],
      ['빈틈!', '#ffe066'],
      ['설득 완료!', '#7CFC9A'],
      ['반려 철회!', '#7CFC9A'],
      ['검토 완료!', '#7CFC9A'],
      ['결재 완료!', '#7CFC9A'],
      ['국물 주의!', '#ffd27f'],
      ['따르릉!', '#ffe066'],
      ...PERSUADE.map((t) => [t, '#9fd3ff']),
    ]) {
      this.g.fx.text(p, t, col);
    }
    // 국물 웅덩이·여권·일거리
    this.haz.spill(0, -2, 0.1);
    this.haz.throwPassport(_v.set(0, 1.6, 4), new THREE.Vector3(0, 0, 0.01));
    const work = { obj: this.workModel() };
    work.obj.position.set(1.5, -1.6, -2);
    group.add(work.obj);
    k.warmTickets(Array.from({ length: 24 }, (_, i) => String(87 + i).padStart(3, '0')));
    return () => {
      this.haz.clear();
      group.remove(work.obj);
      for (const pp of ppl) {
        group.remove(pp.root);
        pp.reset();
        pp.root.position.set(0, 0, 0);
      }
      this.office.visible = false;
      this.towerModel.removeFromParent();
      this.towerModel.visible = false;
    };
  }

  /** 미리 그릴 때 올려 둘 그림 (Game.warmup이 initTexture 한다) */
  get textures(): THREE.Texture[] {
    return this.kit.textures;
  }

  // ---------- 타이틀 · 선택 화면 ----------

  /** 타이틀의 모드 단추 둘 (교직원 모드 → 교직원 선택 화면, 학생 모드 → 이 선택 화면) */
  modeButtons(): string {
    return `
      <div class="modes">
        <button id="startBtn" type="button">교직원 모드</button>
        <button id="studentBtn" class="stu" type="button">학생 모드</button>
      </div>`;
  }

  bindTitle(): void {
    document.getElementById('startBtn')?.addEventListener('click', () => this.h.showStaff());
    document.getElementById('studentBtn')?.addEventListener('click', () => this.showSelect());
  }

  private portrait(h: StudentHeroDef): string {
    let s = this.portraits.get(h.id);
    if (!s) {
      s = heroPortrait(h.look);
      this.portraits.set(h.id, s);
    }
    return s;
  }

  showSelect(): void {
    const t = this.h.touch;
    const heroes = STUDENT_HEROES.map(
      (h) =>
        `<button type="button" data-hero="${h.id}" class="${h.id === this.hero.id ? 'on' : ''}" aria-pressed="${h.id === this.hero.id}"><img src="${this.portrait(h)}" alt=""><span><b>${esc(h.name)}</b>${esc(h.line)}</span></button>`,
    ).join('');
    const spells = SPELLS.map(
      (s) =>
        `<button type="button" data-spell="${s.id}" class="${s.id === this.spell.id ? 'on' : ''}" aria-pressed="${s.id === this.spell.id}"><small>${esc(s.lang)}</small>${spellHtml(s)}</button>`,
    ).join('');
    const seg = DIFF_KEYS.map(
      (k) => `<button type="button" data-sdiff="${k}" class="${this.g.settings.diff === k ? 'on' : ''}" aria-pressed="${this.g.settings.diff === k}">${DIFFS[k].label}</button>`,
    ).join('');
    const o = this.h.overlay(`
      <div class="panel sel" id="stuSel">
        <div class="tabs" role="tablist"><button type="button" id="stuTabStaff">${t ? '교직원 모드' : '교직원 모드 (1)'}</button><button type="button" class="on">${t ? '학생 모드' : '학생 모드 (2)'}</button></div>
        <h1>등교 준비</h1>
        <p class="lbl">1. 주인공 (능력은 같고 외형·대사만 달라요)</p>
        <div class="heroes">${heroes}</div>
        <p class="lbl">2. 필살기 · 외국어 주문</p>
        <div class="spells">${spells}</div>
        <div class="srow center"><span class="slabel">난이도</span><div class="seg" role="group" aria-label="난이도">${seg}</div></div>
        <p class="best">최고 기록 ${bestLine(this.g.settings.diff)}</p>
        <button id="stuGo" class="stu" type="button">${t ? '등교하기' : '등교하기 (Enter)'}</button>
        <button id="stuSet" class="ghost" type="button">설정</button>
        ${t ? '' : '<p class="ctl">방향키로 고르고 Enter · Esc 뒤로 · 1·2 모드 바꾸기 · 마우스·터치로 눌러도 됩니다</p>'}
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((b) => b.addEventListener('click', () => this.pick(studentHeroById(b.dataset.hero ?? ''), this.spell)));
    o.querySelectorAll<HTMLButtonElement>('[data-spell]').forEach((b) => b.addEventListener('click', () => this.pick(this.hero, spellById(b.dataset.spell ?? ''))));
    o.querySelectorAll<HTMLButtonElement>('[data-sdiff]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = b.dataset.sdiff as DiffKey;
        if (!(d in DIFFS)) return;
        this.g.settings.diff = d;
        this.g.runDiff = d;
        saveSettings(this.g.settings);
        this.showSelect();
      }),
    );
    document.getElementById('stuGo')?.addEventListener('click', () => this.startStudent());
    document.getElementById('stuSet')?.addEventListener('click', () => this.h.showSettings());
    document.getElementById('stuTabStaff')?.addEventListener('click', () => this.h.showStaff());
  }

  private pick(hero: StudentHeroDef, spell: SpellDef): void {
    this.hero = hero;
    this.spell = spell;
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({ hero: hero.id, spell: spell.id }));
    } catch {
      /* 이번 판에는 적용된다 */
    }
    this.showSelect();
  }

  private startStudent(): void {
    this.g.mode = 'student';
    this.g.start();
  }

  /** 타이틀·선택 화면과 엔딩의 키. 처리했으면 true */
  key(e: KeyboardEvent): boolean {
    if (this.ending) {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault();
        this.ending.skip();
      }
      return true;
    }
    if (this.g.phase !== 'title' || e.repeat) return false;
    const sel = document.getElementById('stuSel');
    const title = !sel && document.getElementById('studentBtn');
    if (title) {
      if (e.code === 'Enter' || e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault();
        this.h.showStaff();
        return true;
      }
      if (e.code === 'Digit2' || e.code === 'Numpad2') {
        this.showSelect();
        return true;
      }
      return false;
    }
    if (!sel) return false;
    const hi = STUDENT_HEROES.indexOf(this.hero);
    const si = SPELLS.indexOf(this.spell);
    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        this.startStudent();
        return true;
      case 'Escape':
        this.h.showTitle();
        return true;
      case 'Digit1':
      case 'Numpad1':
        this.h.showStaff();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
        this.pick(STUDENT_HEROES[(hi + (e.code === 'ArrowLeft' ? 3 : 1)) % 4], this.spell);
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
        this.pick(this.hero, SPELLS[(si + (e.code === 'ArrowUp' ? 3 : 1)) % 4]);
        return true;
      default:
        return false;
    }
  }

  // ---------- 판 시작 · 정리 ----------

  /** 학생 모드 첫 구역 (Game.start가 부른다) */
  begin(): void {
    const g = this.g;
    this.apply();
    this.area = 0;
    this.recs = [];
    this.counts = {};
    this.combo = 0;
    this.comboT = 0;
    this.areaCombo = 0;
    this.lastHits = g.hits;
    this.lastDamage = g.damageTaken;
    this.areaStart = { time: 0, damage: 0 };
    this.ticketNo = 86;
    this.spellT = 0;
    this.darkSec = -1;
    g.stage = 'field';
    g.bounds = [g.world.field];
    g.pos.set(95, EYE, 62.5);
    g.yaw = Math.PI;
    g.pitch = 0.08;
    this.h.setDusk(0.05);
    g.banner('오후 4시 52분 · 본관 마감 8분 전', '서류 들고 돌파!');
    this.startWave(0, 2.6);
  }

  /** 판을 처음으로 (Game.resetRun이 부른다). 교직원 모드 모양으로 되돌린다 */
  reset(): void {
    this.ending?.cancel();
    this.ending = null;
    const w = this.g.world;
    for (const b of [w.barricade3, w.barricade4, w.barricade5]) {
      b.visible = true;
      b.position.y = 0;
    }
    for (const a of [w.arrows3, w.arrows4, w.arrows5]) a.visible = false;
    this.haz.clear();
    this.office.visible = false;
    this.towerModel.removeFromParent();
    this.towerModel.visible = false;
    this.cardT = 0;
    this.flow = 'wave';
    hideSpell();
    showCombo(0);
    this.unapply();
  }

  /** 학생 모양: 서류 비행기·소매·자국·서류 그림·화면 글 */
  private apply(): void {
    const g = this.g;
    const k = this.kit;
    g.fx.setMarks(k.passMark, k.paperDecal);
    const kit = peopleKit();
    if (!this.markMap) this.markMap = kit.markMat.map;
    kit.markMat.map = k.persuadeMark;
    g.models.setDocSkin(k.rejectSheet, k.approvalSheet);
    (this.h.arm.sleeve.material as THREE.MeshLambertMaterial).color.setHex(this.hero.look.jacket);
    for (const c of this.h.arm.stamp.children) c.visible = c === this.held;
    this.flipArrows(true);
    const fire = document.getElementById('fire');
    if (fire) fire.textContent = '서류';
    const name = document.querySelector('#topleft .name');
    if (name) {
      if (!this.applied) this.nameText = name.textContent ?? '';
      name.textContent = `${this.hero.name} · 학생 모드`;
    }
    const help = document.getElementById('help');
    if (help) {
      if (!this.applied) this.helpHtml = help.innerHTML;
      help.innerHTML = this.helpHtml.replace('도장 던지기', '서류 던지기').replace('경비원 인사 E', '대출기 대여 E');
    }
    this.applied = true;
  }

  private unapply(): void {
    if (!this.applied) return;
    this.applied = false;
    const g = this.g;
    g.fx.setMarks();
    if (this.markMap) peopleKit().markMat.map = this.markMap;
    g.models.setDocSkin();
    (this.h.arm.sleeve.material as THREE.MeshLambertMaterial).color.copy(this.sleeveColor);
    for (const c of this.h.arm.stamp.children) c.visible = c !== this.held;
    this.flipArrows(false);
    const fire = document.getElementById('fire');
    if (fire) fire.textContent = '도장';
    const name = document.querySelector('#topleft .name');
    if (name && this.nameText) name.textContent = this.nameText;
    const help = document.getElementById('help');
    if (help && this.helpHtml) help.innerHTML = this.helpHtml;
  }

  /** 길 바닥 화살표를 거꾸로 (학생은 반대 방향으로 간다) */
  private flipArrows(on: boolean): void {
    if (on === this.arrowsFlipped) return;
    this.arrowsFlipped = on;
    const w = this.g.world;
    for (const grp of [w.arrows, w.arrows2, w.arrows3, w.arrows4, w.arrows5]) for (const a of grp.children) a.rotation.z += Math.PI;
  }

  /** 던지는 것: 학생은 서류 비행기 (Game.fire가 부른다) */
  dress(obj: THREE.Group): void {
    let plane = obj.userData.stuPlane as THREE.Group | undefined;
    if (!plane && this.on) {
      plane = this.kit.plane();
      obj.add(plane);
      obj.userData.stuPlane = plane;
    }
    for (const c of obj.children) c.visible = this.on ? c === plane : c !== plane;
    obj.rotation.order = this.on ? 'YXZ' : 'XYZ';
  }

  /** 서류 비행기는 날아가는 쪽을 본다 (Game.updateStamps가 부른다) */
  orient(obj: THREE.Group, vel: THREE.Vector3): void {
    obj.rotation.set(Math.atan2(vel.y, Math.hypot(vel.x, vel.z)), Math.atan2(-vel.x, -vel.z), Math.sin(performance.now() * 0.012) * 0.25);
  }

  // ---------- 구역 흐름 ----------

  private startWave(i: number, delay = 1.2): void {
    this.flow = 'wave';
    this.flowT = 0;
    this.queue = [];
    for (const [k, n0] of Object.entries(ROUTE[i].wave) as [Spawn, number][]) {
      const n = Math.max(1, Math.round(n0 * this.g.diff.count));
      for (let j = 0; j < n; j++) this.queue.push(k);
    }
    for (let k = this.queue.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [this.queue[k], this.queue[j]] = [this.queue[j], this.queue[k]];
    }
    // 첫 장은 반려 서류부터
    const d = this.queue.indexOf('doc');
    if (d > 0) [this.queue[d], this.queue[this.queue.length - 1]] = [this.queue[this.queue.length - 1], this.queue[d]];
    this.spawnT = delay;
    this.waveDelay = -1;
  }

  /** 플레이어 앞쪽 부채꼴 15~23m (구역 안) */
  private spawnPoint(out: THREE.Vector3, y: number): THREE.Vector3 {
    const g = this.g;
    const a = g.area;
    for (let i = 0; i < 10; i++) {
      const th = g.yaw + (Math.random() - 0.5) * 2.2;
      const r = 15 + Math.random() * 8;
      const x = Math.max(a.minX + 2, Math.min(a.maxX - 2, g.pos.x - Math.sin(th) * r));
      const z = Math.max(a.minZ + 2, Math.min(a.maxZ - 2, g.pos.z - Math.cos(th) * r));
      if (Math.hypot(x - g.pos.x, z - g.pos.z) > 9 || i === 9) return out.set(x, y, z);
    }
    return out.set(g.pos.x, y, g.pos.z);
  }

  private spawn(kind: Spawn): void {
    const g = this.g;
    if (kind === 'doc') {
      g.enemies.push(new RejectDoc(g, this.kit, this.spawnPoint(_v, 2.5 + Math.random() * 3)));
    } else if (kind === 'bot') {
      g.enemies.push(new CancelBot(g, this.kit, this.spawnPoint(_v, 1.8 + Math.random() * 0.6)));
      this.h.hint('s-bot', '휴강 공지가 부르르 떨면 옆으로 피하세요!');
    } else if (kind === 'absence') {
      const a = g.area;
      const ang = Math.random() * Math.PI * 2;
      const off = Math.random() * 0.8;
      const x = Math.max(a.minX + 1, Math.min(a.maxX - 1, g.pos.x + Math.cos(ang) * off));
      const z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, g.pos.z + Math.sin(ang) * off));
      g.enemies.push(new AbsenceStamp(g, this.kit, x, z));
      this.h.hint('s-absence', '빨간 그림자에서 비키세요! 떨어진 결석 도장은 서류로 받기');
    } else if (kind === 'due') {
      g.enemies.push(...spawnDue(g, this.spawnPoint(_v, 2.5 + Math.random() * 1.5), g.diff.count));
      this.h.hint('s-due', '과제 마감 알림 떼 — 한 대씩 맞히면 처리!', 2.8);
    } else if (kind === 'qr') {
      g.enemies.push(new AttendQR(g, this.spawnPoint(_v, 1.8)));
      this.h.hint('s-qr', '출석 QR 코드 — 사라지기 전에 맞히세요! 놓치면 들이받아요', 3.2);
    } else {
      this.spawnQueue(QUEUE_LEN);
    }
  }

  // StuCtx (보스가 부른다)

  raiseTower(x: number, z: number): DocTower {
    const t = new DocTower(this.g, this.towerModel, x, z, 6);
    this.g.enemies.push(t);
    this.g.fx.confetti(_v.set(x, 0.4, z), 14, 3, 0xffffff, 1.5, 0.8);
    return t;
  }

  spawnDoc(at: THREE.Vector3): void {
    this.g.enemies.push(new RejectDoc(this.g, this.kit, at));
  }

  spawnMinion(kind: 'doc' | 'absence' | 'bot'): void {
    this.spawn(kind);
  }

  /** 허허실실 부총장: 플레이어 양옆(보스를 볼 때 왼쪽·오른쪽)에 간식 하나와 일거리 하나 (어느 쪽인지는 무작위) */
  dropSnacks(from: THREE.Vector3): void {
    const g = this.g;
    let dx = from.x - g.pos.x;
    let dz = from.z - g.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const real = (['donkatsu', 'gimbap', 'americano'] as const)[Math.floor(Math.random() * 3)];
    const workSide = Math.random() < 0.5 ? -1 : 1;
    for (const side of [-1, 1]) {
      const r = 2.2 + Math.random() * 0.8;
      const p = this.freeSpot(g.pos.x - dz * side * r + dx * 0.8, g.pos.z + dx * side * r + dz * 0.8);
      if (side === workSide) {
        this.haz.placeWork(this.workModel(), p.x, p.z);
      } else {
        g.spawnPickup(real, p.x, p.z);
      }
      g.fx.confetti(_v.set(p.x, 0.6, p.z), 8, 2, 0xf6f1e1, 1.2, 0.5);
    }
  }

  /** 일거리: 삼각김밥 모형 + 삐져나온 서류 귀퉁이, 이름표는 2D처럼 "삼각김밥?" */
  private workModel(): THREE.Group {
    const { obj, item } = this.g.models.food('gimbap', true);
    item.add(this.kit.workCorner());
    const old = obj.children.find((c) => c instanceof THREE.Sprite);
    const label = this.g.models.label('삼각김밥?', '#ffe066');
    if (old) {
      label.position.copy(old.position);
      obj.remove(old);
    } else label.position.y = 1.25;
    obj.add(label);
    return obj;
  }

  /** 구역 안, 화단·가로등 같은 장애물 밖 (Game.freeSpot과 같은 방식) */
  private freeSpot(x: number, z: number): { x: number; z: number } {
    const a = this.g.area;
    const M = 0.8;
    for (let it = 0; it < 3; it++) {
      x = Math.max(a.minX + 1.2, Math.min(a.maxX - 1.2, x));
      z = Math.max(a.minZ + 1.2, Math.min(a.maxZ - 1.2, z));
      for (const o of this.g.world.obstacles) {
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
    return { x, z };
  }

  spawnQueue(n: number): void {
    const g = this.g;
    const head = this.spawnPoint(_v, 0).clone();
    const dx = head.x - g.pos.x;
    const dz = head.z - g.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let ahead: Ticket | null = null;
    for (let i = 0; i < n; i++) {
      this.ticketNo = this.ticketNo >= 110 ? 87 : this.ticketNo + 1;
      const at = new THREE.Vector3(head.x + (dx / d) * i * 1.35, 0, head.z + (dz / d) * i * 1.35);
      const t: Ticket = new Ticket(g, this.kit, at, String(this.ticketNo).padStart(3, '0'), ahead);
      g.enemies.push(t);
      ahead = t;
    }
    this.h.hint('s-queue', '대기번호표 행렬 — 줄줄이 길을 막습니다', 2.6);
  }

  tickets(): number {
    let n = 0;
    for (const e of this.g.enemies) if (e instanceof Ticket && !e.dead) n++;
    return n;
  }

  note(text: string, time?: number): void {
    this.h.note(text, time);
  }

  persuade(at: THREE.Vector3): void {
    this.g.fx.text(at, PERSUADE[Math.floor(Math.random() * PERSUADE.length)], '#9fd3ff', 0.5);
  }

  reflectMark(at: THREE.Vector3): void {
    this.g.fx.mark(at, 1.1, this.kit.reflectMark);
  }

  /** 창구 직원 (구역마다 한 명) */
  private startStaff2(kind = ROUTE[this.area].staff): void {
    const g = this.g;
    const hero = staffHero(kind);
    const { at, spot, exit } = ROUTE[this.area].staffAt(g);
    const b = new WindowStaff(g, this, this.ppl.staff[kind], kind, hero.name, hero.line, at, spot, exit);
    b.setTouchHint(this.h.touch);
    this.h.placeBoss(b);
    this.announce(b);
    this.flow = 'staff';
    this.addT = 9;
  }

  /** 처장·부총장 자리: 구역에 정해 둔 곳이 없으면 플레이어 앞쪽 (구역 안) */
  private bossSpots(): Spots {
    const def = ROUTE[this.area];
    if (def.bossAt) return def.bossAt(this.g);
    const g = this.g;
    const a = g.area;
    const fx = -Math.sin(g.yaw);
    const fz = -Math.cos(g.yaw);
    const spot = v3(Math.max(a.minX + 6, Math.min(a.maxX - 6, g.pos.x + fx * 12)), Math.max(a.minZ + 6, Math.min(a.maxZ - 6, g.pos.z + fz * 12)));
    const at = v3(Math.max(a.minX + 1, Math.min(a.maxX - 1, spot.x + fx * 6)), Math.max(a.minZ + 1, Math.min(a.maxZ - 1, spot.z + fz * 6)));
    return { at, spot, exit: at.clone() };
  }

  private startBoss(kind = ROUTE[this.area].boss): void {
    const g = this.g;
    let b: StudentBoss;
    if (kind === 'banryeo') {
      const f = g.area;
      const spot = new THREE.Vector3(Math.max(f.minX + 6, Math.min(f.maxX - 6, g.pos.x)), 0, Math.max(f.minZ + 10, Math.min(f.maxZ - 6, g.pos.z + 15)));
      const at = new THREE.Vector3(Math.max(f.minX + 2, spot.x - 7), 0, Math.min(f.maxZ - 1, spot.z + 6));
      const exit = ROUTE[this.area].bossAt?.(g).exit ?? new THREE.Vector3(60, 0, 112);
      b = new Banryeo(g, this, this.ppl.banryeo, at, spot, exit, Math.max(4, Math.round(7 * g.diff.bossHp)));
    } else if (kind === 'bansa') {
      const p = this.bossSpots();
      b = new Bansa(g, this, this.ppl.bansa, p.at, p.spot, p.exit);
    } else if (kind === 'bujae') {
      const p = this.bossSpots();
      b = new Bujae(g, this, this.ppl.bujae, p.at, p.spot, p.exit);
    } else {
      const p = this.bossSpots();
      b = new Hoho(g, this, this.ppl.hoho, p.at, p.spot, p.exit);
    }
    this.h.placeBoss(b);
    this.announce(b);
    this.flow = 'boss';
    this.addT = 10;
  }

  private announce(b: StudentBoss | StudentPresident): void {
    this.h.showBossBar(b.bossName);
    this.g.banner(b instanceof StudentBoss && b.introTitle ? b.introTitle : b.bossName, b.hintText);
    this.g.sound('volley');
  }

  /** 구역 하나 끝: 성적 한 줄 */
  private recordArea(): AreaRec {
    const g = this.g;
    const time = g.elapsed - this.areaStart.time;
    const damage = Math.round((g.damageTaken - this.areaStart.damage) * 10) / 10;
    const grade = gradeStage({ mode: 'student', stageTitle: AREAS[this.recs.length], elapsed: time, damage, maxCombo: this.areaCombo, lives: 1, clockMin: this.clock }).grade;
    const r: AreaRec = { time, damage, combo: this.areaCombo, grade };
    this.recs.push(r);
    this.areaStart = { time: g.elapsed, damage: g.damageTaken };
    this.areaCombo = this.combo;
    return r;
  }

  /** 구역 카드 (게임은 멈추지 않고 몇 초 뒤 사라진다) */
  private card(r: AreaRec, next: string): void {
    const i = this.recs.length - 1;
    const el = document.getElementById('areacard');
    if (!el) return;
    el.innerHTML = `
      <small>${i + 1}구역 통과!</small>
      <b>${AREAS[i]}</b>
      <div class="stats"><span>걸린 시간 <em>${timeText(r.time)}</em></span><span>받은 피해 <em>${r.damage}</em></span><span>최대 연속 공격 <em>${r.combo}회</em></span><span>학점 <em>${r.grade}</em></span></div>
      <div class="next">${next}</div>`;
    el.classList.add('on');
    this.cardT = 4.2;
    document.getElementById('banner')?.style.setProperty('opacity', '0');
    this.g.sound('clear');
  }

  /** 처장·부총장·창구 직원·총장 결재 (Game.bossApproved가 부른다) */
  bossApproved(b: PersonBoss): void {
    const g = this.g;
    if (b instanceof WindowStaff) {
      if (this.haz.darkLeft > 0) this.h.note('불 켜짐!');
      this.haz.clear();
      this.flow = 'staffOut';
      this.flowT = 0;
      return;
    }
    document.getElementById('bossbox')?.classList.remove('on');
    if (b instanceof StudentBoss) {
      if (b instanceof Banryeo) g.banner('반려 철회!', '박반려 처장이 졸업 서류를 통과시켰습니다');
      else if (b instanceof Bansa) g.banner('결재 완료!', '반사반사 부총장이 결재판에 서명했습니다');
      // 김부재중 처장·허허실실 부총장: 2D 김부재중 처장 결재 띠
      else g.banner('결재 완료!', '이제 다음 구역으로 갈 수 있습니다');
      this.haz.clear();
      this.flow = 'clear';
      this.flowT = 0;
      return;
    }
    // 총장: 선 채로 승인
    g.banner('검토 완료!', '프레지던트 캉: "좋아요, 검토 끝났습니다."');
    g.stage = 'done';
    this.recordArea();
    this.flow = 'done';
    this.flowT = 0;
    this.h.buzz([60, 40, 120]);
  }

  /** 구역 정리 → 다음 길 열기 */
  private openPath(): void {
    const g = this.g;
    const w = g.world;
    const r = this.recordArea();
    const l = LINKS[this.area];
    g.stage = l.stage;
    g.bounds = l.bounds(w);
    this.h.lower(l.barricade(w));
    l.arrows(w).visible = true;
    this.card(r, l.card);
    g.sound('open');
    this.flow = 'walk';
  }

  private enterArea(i: number): void {
    const g = this.g;
    const w = g.world;
    LINKS[i - 1].arrows(w).visible = false;
    this.area = i;
    const def = ROUTE[i];
    g.stage = def.stage;
    g.bounds = [def.rect(w)];
    for (const [k, x, z] of def.food?.(g) ?? []) g.spawnPickup(k, x, z);
    g.banner(def.name, '서류 들고 돌파!');
    this.startWave(i);
  }

  /** 본관 앞을 통과하면 화면이 어두워졌다가 총장실(본관 계단 앞, 노을)로 */
  private setupFinal(): void {
    const g = this.g;
    for (const e of g.enemies) {
      g.scene.remove(e.obj);
      e.dispose();
    }
    g.enemies = [];
    g.boss = null;
    for (const p of g.pickups) g.scene.remove(p.obj);
    g.pickups.length = 0;
    for (const s of g.sheets) {
      s.on = false;
      s.obj.visible = false;
    }
    g.hz.clear();
    g.fx.clear();
    this.haz.clear();
    g.stage = 'final';
    g.bounds = [g.world.yard];
    g.pos.set(0, EYE, 7);
    g.yaw = 0;
    g.pitch = 0.1;
    g.jumpY = 0;
    g.vy = 0;
    this.h.setDusk(1);
    g.rack.visible = true;
    this.office.visible = true;
    this.area = ROUTE.length;
    this.h.placeBoss(new StudentPresident(g, g.people.president));
    g.spawnPickup('gimbap', -6, -2);
    g.spawnPickup('americano', 6, -2);
  }

  /** 학생 모드 한 단계 (Game.step의 단계 자리에서 부른다) */
  step(dt: number): void {
    const g = this.g;
    this.flowT += dt;
    // 연속 공격 (1.2초 안에 다음 서류가 맞으면 이어진다, 맞으면 끊긴다)
    if (g.hits > this.lastHits) {
      this.combo += g.hits - this.lastHits;
      this.comboT = 1.2;
      this.areaCombo = Math.max(this.areaCombo, this.combo);
    }
    this.lastHits = g.hits;
    if (g.damageTaken > this.lastDamage) this.combo = 0;
    this.lastDamage = g.damageTaken;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    showCombo(this.combo);
    if (this.spellT > 0) {
      this.spellT -= dt;
      if (this.spellT <= 0) g.fx.setMarks(this.kit.passMark, this.kit.paperDecal);
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) document.getElementById('areacard')?.classList.remove('on');
    }
    // 창구 직원·보스 기믹
    const edt = dt * g.diff.speed;
    if (this.haz.update(edt)) {
      this.h.note('불 켜짐!');
      if (g.boss instanceof WindowStaff) g.boss.lightsOn();
    }
    this.haz.updateThings(edt, g);
    if (this.haz.slip({ pos: g.pos, feet: g.jumpY }, dt, g.bounds, g.world.obstacles)) this.h.hint('s-soup', '쏟아진 국물을 밟으면 미끄러져요', 2.4);
    const left = Math.ceil(this.haz.darkLeft);
    if (left > 0 && left !== this.darkSec) this.h.note(`점호 중 · 소등 (${left}초)`, 1.2);
    this.darkSec = left;
    if (this.haz.block({ pos: g.pos, feet: g.jumpY })) this.h.hint('s-pen', this.h.touch ? '빨간 첨삭 선은 점프(파란 버튼)로 넘을 수 있어요' : '빨간 첨삭 선은 점프(Space)로 넘을 수 있어요');

    switch (this.flow) {
      case 'wave':
        if (this.queue.length > 0) {
          this.spawnT -= dt;
          if (this.spawnT <= 0 && g.minions() < 6) {
            this.spawn(this.queue.pop() as Spawn);
            this.spawnT = 0.9;
          }
        } else if (g.minions() === 0 && !this.h.holdWave()) {
          if (this.waveDelay < 0) this.waveDelay = 1.4;
          this.waveDelay -= dt;
          if (this.waveDelay <= 0) this.startStaff2();
        }
        break;
      case 'staff':
      case 'boss': {
        // 가끔 반려 서류가 한 장씩 (오학종지는 번호표를 부르고, 김부재중 처장은 자리를 비울 때 따로 부르니 빼고)
        this.addT -= dt;
        if (this.addT <= 0) {
          this.addT = 10;
          const quiet = (g.boss instanceof WindowStaff && g.boss.staff === 'hakjong') || g.boss instanceof Bujae;
          if (!quiet && g.minions() < 2) this.spawnDoc(this.spawnPoint(_v, 3));
        }
        break;
      }
      case 'staffOut':
        // 창구 직원이 퇴근하는 동안 숨 돌리기 → 처장·부총장 (본관 앞은 총장실로)
        if (this.flowT >= 2.6) {
          if (ROUTE[this.area].boss) this.startBoss();
          else {
            const r = this.recordArea();
            this.card(r, '다음: 본관 총장실 — 총장 결재');
            document.getElementById('bossbox')?.classList.remove('on');
            this.flow = 'card';
            this.flowT = 0;
          }
        }
        break;
      case 'clear':
        if (this.flowT >= 3.2) this.openPath();
        break;
      case 'walk':
        if (LINKS[this.area]?.arrived(g.pos)) this.enterArea(this.area + 1);
        break;
      case 'card':
        if (this.flowT >= 2.6) {
          document.getElementById('fade')?.classList.add('on');
          this.flow = 'fade';
          this.flowT = 0;
        }
        break;
      case 'fade':
        if (this.flowT >= 0.8) {
          this.setupFinal();
          document.getElementById('fade')?.classList.remove('on');
          this.flow = 'final';
          this.flowT = 0;
        }
        break;
      case 'final':
        if (this.flowT >= 1.2 && g.boss instanceof StudentPresident && g.boss.state === 'sleep') {
          g.boss.wake();
          this.announce(g.boss);
        }
        break;
      case 'done':
        // 총장이 "좋아요, 검토 끝났습니다." 하고 선 채로 승인 → 엔딩 카드
        if (this.flowT >= 2.8) this.startEnding();
        break;
      default:
        break;
    }
  }

  // ---------- 필살기 ----------

  /** 고른 외국어 주문 (효과는 교직원 필살기와 같다: Game.special) */
  castSpell(): void {
    showSpell(this.spell);
    this.g.fx.setMarks(this.kit.spellMarks.get(this.spell.id), this.kit.paperDecal);
    this.spellT = 1.6;
  }

  get spellColor(): number {
    return this.spell.color;
  }

  // ---------- HUD ----------

  private get clock(): number {
    return START_CLOCK + this.g.elapsed / 60;
  }

  /** 지금 걷는 길 (구역 사이) */
  private get link(): LinkDef | null {
    return this.flow === 'walk' ? (LINKS[this.area] ?? null) : null;
  }

  private place(): string {
    const s = this.g.stage;
    if (s === 'final' || s === 'done') return FINAL_NAME;
    const l = this.link;
    if (l) return l.place;
    return ROUTE[Math.min(this.area, ROUTE.length - 1)].name;
  }

  clockHtml(clock: number): string {
    const left = Math.ceil(OFF_HOURS - clock);
    const line = left > 0 ? `${clockText(clock)} · 본관 마감까지 ${left}분` : `${clockText(clock)} · 마감 지남 ${lateMin(clock)}분`;
    return `${line}<small>1인칭 시험판 · 학생 모드 · ${this.place()}</small>`;
  }

  waveLine(): string {
    const g = this.g;
    const n = `통과 ${g.processed}건`;
    const l = this.link;
    if (l) return `${l.go} · ${n}`;
    const b = g.boss;
    // 김부재중 처장 (2D 결재 대기 글)
    if (b instanceof Bujae && b.away) return `결재 대기 중 · 김부재중 처장 부재중 (${Math.ceil(b.awayLeft)}초) · ${n}`;
    if (b instanceof Bujae && b.coming) return `김부재중 처장이 오는 중… · ${n}`;
    if (b && !b.dead && b.targetable) return `${b.bossName} ${b instanceof StudentPresident ? '결재 받는 중' : '설득 중'} · ${n}`;
    if (b instanceof Banryeo && !b.dead && b.towerUp) return `${b.towerText} · ${n}`;
    if (this.flow === 'wave') return `행정 ${this.queue.length + g.minions()}건 남음 · ${n}`;
    return `${this.place()} · ${n}`;
  }

  spLabel(ready: boolean): string {
    const w = this.spell.rtl ? `⁧${this.spell.text}⁩` : this.spell.text;
    return ready ? `${w} — ${this.h.touch ? '노란 버튼' : 'Q'}` : `필살기 · ${w}`;
  }

  barWord(): string {
    const b = this.g.boss;
    return b && 'barWord' in b ? (b as { barWord: string }).barWord : '설득';
  }

  guide(): { x: number; z: number } | null {
    return this.link?.guide(this.g.pos) ?? null;
  }

  /** 지금 싸우는 구역 사각형 (Game.area 대신 쓴다 — 생성자 참고) */
  get rect(): Rect {
    const w = this.g.world;
    const s = this.g.stage;
    if (s === 'final' || s === 'done') return w.yard;
    return ROUTE[Math.min(this.area, ROUTE.length - 1)].rect(w);
  }

  hurtNote(kind: HurtKind): string | undefined {
    if (kind === 'bigstamp' && this.g.boss instanceof Banryeo) return '반려! (느려짐)';
    return HURT[kind];
  }

  duskTarget(timeK: number): number {
    const s = this.g.stage;
    if (s === 'final' || s === 'done') return 1;
    const l = this.link;
    if (l) return Math.max(timeK, l.dusk);
    const i = Math.min(this.area, ROUTE.length - 1);
    // 첫 구역은 시계보다 조금 늦게 물든다
    return i === 0 ? Math.max(timeK * 0.6, ROUTE[0].dusk) : Math.max(timeK, ROUTE[i].dusk);
  }

  /** 잡몹을 통과시켰을 때 (Game.onProcessed가 부른다) */
  processed(e: Enemy): void {
    for (const [cls, text, key] of DONE_TEXT) {
      if (!(e instanceof cls)) continue;
      this.counts[key] = (this.counts[key] ?? 0) + 1;
      this.g.fx.text(_v.copy(e.center).setY(e.center.y + 1.0), text, '#7CFC9A', 0.6);
      if (e instanceof CancelBot) {
        this.g.fx.confetti(e.center, 16, 4, 0xfff7e0, 1.5);
        this.g.sound('pop', e.center);
      }
      if (e instanceof DocTower) this.g.fx.confetti(e.center, 40, 6, 0xffffff, 3, 1.2);
      return;
    }
  }

  private countsHtml(): string {
    const parts = Object.keys(COUNT_LABEL)
      .filter((k) => (this.counts[k] ?? 0) > 0)
      .map((k) => `${COUNT_LABEL[k][0]} ${this.counts[k]}${COUNT_LABEL[k][1]}`);
    const passed = parts.length ? `통과: ${parts.join(' · ')}` : '';
    const signed = this.g.approved.length ? `설득: ${this.g.approved.map((n) => n.split(' · ')[0]).join(' · ')}` : '';
    return [passed, signed].filter(Boolean).join('<br>');
  }

  // ---------- 끝 ----------

  private startEnding(): void {
    const g = this.g;
    g.phase = 'paused';
    g.firing = false;
    document.exitPointerLock?.();
    showCombo(0);
    // 엔딩 카드 아래로 총장 말풍선·자막이 비치지 않게
    g.boss?.person.tag.hide();
    clearSubtitle();
    this.flow = 'ending';
    this.ending = playEnding({ name: this.hero.name }, () => {
      this.ending = null;
      this.showResult();
    });
  }

  private showResult(): void {
    const g = this.g;
    g.phase = 'clear';
    this.flow = 'result';
    const clock = START_CLOCK + g.elapsed / 60;
    const grades = this.recs.map((r) => r.grade);
    const v = gpa(grades) ?? 0;
    const rec = recordBest(g.runDiff, { gpa: v, time: g.elapsed });
    const left = Math.ceil(OFF_HOURS - clock);
    const arrive = onTime(clock)
      ? left > 0
        ? `도착 시각 ${clockText(clock)} · 본관 마감 ${left}분 전!`
        : `도착 시각 ${clockText(clock)} · 본관 마감 시각에 딱 맞췄다!`
      : `도착 시각 ${clockText(clock)} · 본관 마감 ${lateMin(clock)}분 지남`;
    const rows = this.recs
      .map((r, i) => `<tr><td>${AREAS[i]}</td><td>${timeText(r.time)}</td><td>${r.damage}</td><td>${r.combo}회</td><td class="g"><span class="gs ${r.grade}">${r.grade}</span></td></tr>`)
      .join('');
    const bestTxt = rec.isNew
      ? `<span class="newbest">새 최고 기록!</span>${rec.prev ? ` 이전 GPA ${rec.prev.gpa.toFixed(2)} · ${timeText(rec.prev.time)}` : ''}`
      : `최고 기록 GPA ${rec.best.gpa.toFixed(2)} · ${timeText(rec.best.time)}`;
    const o = this.h.overlay(`
      <div class="panel result stu">
        <h1><img class="emblem inline" src="hufs/emblem-mono.png" alt=""> 성 적 표</h1>
        <p class="who">3학년 ${esc(this.hero.name)} · 학생 모드 완료</p>
        <p class="big">${outcomeText('student', true, 3, clock, true)}</p>
        <p class="who">${arrive}</p>
        <div class="repw">
          <table class="rep"><tr><th>구역</th><th>걸린 시간</th><th>받은 피해</th><th>최대 연속 공격</th><th>학점</th></tr>${rows}</table>
          <div class="gpa"><small>누적 GPA</small><b>${v.toFixed(2)}</b><span>/ 4.5</span></div>
        </div>
        <p class="counts">${this.countsHtml()}</p>
        <p class="best">난이도 ${g.diff.label} · ${bestTxt}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    document.getElementById('againBtn')?.addEventListener('click', () => g.restart());
    document.getElementById('titleBtn')?.addEventListener('click', () => this.h.toTitle());
    // 닉네임 기록판 (src/fps/board.ts)
    attachRecordForm(o, { mode: 'fps-student', stage: this.recs.length, cleared: true, elapsed: g.elapsed, grades: grades.join(''), hero: this.hero.name, skill: this.spell.id, diff: g.runDiff });
  }

  /** 학사경고 (Game.gameOver가 부른다) */
  gameOver(): void {
    const g = this.g;
    this.haz.clear();
    showCombo(0);
    this.flow = 'result';
    const where = this.place();
    const acc = g.thrown ? Math.round((g.hits / g.thrown) * 100) : 0;
    const o = this.h.overlay(`
      <div class="panel">
        <h1 style="color:#ff6b6b">학사경고</h1>
        <p>${where}에서 행정에 밀려 졸업 서류를 내지 못했습니다</p>
        <p>통과 ${g.processed}건 · 명중률 ${acc}% · 난이도 ${g.diff.label}</p>
        <p class="counts">${this.countsHtml()}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    document.getElementById('againBtn')?.addEventListener('click', () => g.restart());
    document.getElementById('titleBtn')?.addEventListener('click', () => this.h.toTitle());
    // 닉네임 기록판 (src/fps/board.ts)
    attachRecordForm(o, { mode: 'fps-student', stage: this.recs.length, cleared: false, elapsed: g.elapsed, grades: this.recs.map((r) => r.grade).join(''), hero: this.hero.name, skill: this.spell.id, diff: g.runDiff });
  }
}
