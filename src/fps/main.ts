import * as THREE from 'three';
import { appHomeLink, titleLeft, titleShown } from '../pwa';
import { armName, Arms, ARMS, BOOMERANG_TURN, type ArmDef, type ArmId } from './arms';
import { Sfx, type SfxName } from './audio';
import type { Rect } from './blocks';
import { addBoardButton, attachRecordForm } from './board';
import { BODY_DMG, BOSS_HINTS, BOSS_NAMES, Bogo, Chonggwal, Meeting, PersonBoss, President, PRESIDENT_LINES, SERVER_SPOT, WEAK_DMG } from './bosses';
import { DORM_ENTER_Z, FIELD_GATE_X, GATE_Z0, GATE_Z1, HUM_DOOR, HUM_ENTER_X, PATH3_GUIDE, DORM_DOOR, type Stage } from './campus';
import { Bomb, Bubble, Mail, Phone, type Ctx, type Enemy, type HurtKind, type Kind, type SheetKind } from './enemies';
import { FIELD_ENTER_Z, FC } from './field';
import { Fx } from './fx';
import { Hazards, RING_H } from './hazards';
import { Rescue } from './helpers';
import { buildMidPeople, buildNewBossPeople, Gumto, MID_LINES, MID_TEXTS, Molla, ReviewPile, StaffMid, type MidKind, type MidPerson } from './mids';
import { Models, type FoodKind } from './models';
import { badgeObj, ClingBubble, DodgeBubble, Fax, MobKit, NoteBadge } from './mobs';
import { PileMob, Trap, type TrapHost } from './trapped';
import { SideJob, type SideHost } from './sidejob';
import { SEAL_R, SealRolls } from './seal';
import { AttendQR, DueBadge, stuMobTextures } from './student/mobs';
import { Person, peopleKit, type Who } from './people';
import { Props, type PerkHost } from './props';
import {
  bestLine,
  bindSettings,
  DIFFS,
  loadSettings,
  recordBest,
  settingsHtml,
  timeText,
  type Diff,
  type DiffKey,
  type Settings,
} from './settings';
import { clearSubtitle, prepareSpeech, speechTextures, speechView, updateSubtitle } from './speech';
import { StaffPick, type PickHost } from './staffpick';
import { StaffSkills } from './staffskills';
import { Dating, type DatingHost } from './student/dating';
import { DocTower } from './student/enemies';
import { StudentMode, type StudentHost } from './student/mode';
import { loadLogos } from './textures';
import { FRONT_X } from './social';
import { buildWorld, type World } from './world';
import { Budget } from './budget';
import { dressFull, Vending } from './vending';
import { Boo, type BooHost } from './boo';

// Staff Smash: HUFS 1인칭 시험판 (v4).
// 본관 앞에서 세 차례 몰려오는 민원(메일·전화기·말풍선·서류 뭉치)을 도장으로 처리하고,
// 김총괄(본관 앞) → 김보고 처장(사회과학관 앞) → 오검토 처장(인문과학관 앞) → 최몰라 처장(국제학사 앞)
// → 회의소집 부총장(대운동장) → 총장 프레지던트 캉(해 질 녘 본관 앞)의 결재를 받으면 퇴근.
// 다섯 구역마다 보스 앞에 중간보스(민원 학생, mids.ts)가 먼저 나온다.
// 잡몹은 사물이고, 사람(중간보스·보스)은 다치지 않고 들고 있는 서류·결재판에 도장을 받는다.
// 본편(2D)과 따로 도는 시험용 페이지다. 프레지던트 캉을 제외한 인물은 모두 가상이다.
// 2026-11-14: 무기(arms.ts — 경비원·도서 무인 대출기에서 받는다), 부수는 상자·경비원·대출기(props.ts),
// 조력자 이벤트(helpers.ts), 식권·보조배터리.
// 연차 쿠폰(학생: 공결 확인서 — 다음 한 번 막기)·셔틀버스 시간표(10초 빨리 걷기)·단톡방 공지 캡처(잡몹 2.5초 멈춤).
// 2026-11-15: 인감 도장(학생: 출석 스티커 — 8초 동안 기본 공격에 맞은 잡몹이 넘어진다), 조력자 규칙(30% 이하 반드시, 한 방이면 먼저).

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TIMER = params.has('timer');
const TOUCH = params.has('touch') || window.matchMedia('(pointer: coarse)').matches;
/** 시험용: 한 화면에 게임 시간을 몇 번 진행할지 (?debug&speed=3) */
const SPEED = DEBUG ? Math.max(1, Math.min(8, Math.floor(Number(params.get('speed')) || 1))) : 1;

const EYE = 1.6;
const WALK = 5;
const RUN = 8.5;
const RADIUS = 0.45;
const MAX_HP = 10;
const FIRE_CD = 0.28;
const FIRE_CD_FAST = 0.14;
const STAMP_SPEED = 24;
const BUFF_T = 8;
/** 연차 쿠폰(공결 확인서)이 기다려 주는 시간, 막은 뒤 잠깐 맞지 않는 시간 (초) */
const SHIELD_T = 30;
const SHIELD_GRACE = 0.6;
/** 셔틀버스 시간표: 시간(초)과 이동 속도 배율 */
const SHUTTLE_T = 10;
const SHUTTLE_MUL = 1.3;
/** 단톡방 공지 캡처: 잡몹이 멈추는 시간 (초) */
const CAPTURE_T = 2.5;
/** 인감 도장(학생: 출석 스티커): 기본 공격이 잡몹을 넘어뜨리는 시간, 넘어진 잡몹이 일어나기까지 (초) */
const SEAL_T = 8;
const DOWN_T = 1.2;
/** 넘어진 잡몹이 뒤로 밀려나는 거리 (m) */
const DOWN_SLIDE = 2.2;
/** 민원이 떨어뜨리는 것 가운데 연차 쿠폰·셔틀버스 시간표·단톡방 공지 캡처·인감 도장이 나올 몫 (각각) */
const PERK_SHARE = 0.12;
const PERKS: FoodKind[] = ['shield', 'shuttle', 'capture', 'seal'];
/** 조력자: 맞아서 체력이 이 비율 이하로 떨어지면 그 구역에서 한 번 굴린다 (구한 사람이 있으면 50%, 없으면 5% — helpers.ts) */
const RESCUE_HP = 0.3;
/** 보스(사람) 근접 (사용자 2026-11-18, 2026-11-20 1.5→2.5배): 보스가 이 거리(m) 안에서 보스 공격에 맞으면 피해 CLOSE_MUL배 (중급 1칸→2.5칸). 멀리서·잡몹은 그대로 */
const CLOSE_R = 4;
const CLOSE_MUL = 2.5;
/** 보스 공격 (잡몹이 아닌 것). 그 밖의 까닭은 맞은 물건이 보스 몸 가까이서 왔을 때만 */
const BOSS_HURT: ReadonlySet<HurtKind> = new Set<HurtKind>(['wave', 'paper', 'rental', 'meeting', 'packet', 'bigstamp', 'error']);
const SP_MAX = 100;
const JUMP_V = 5.4;
const GRAVITY = 16;
const START_CLOCK = 16 * 60 + 52;
const OFF_HOURS = 17 * 60;
/** 길 끝: 여기를 넘으면 사회과학관 앞 */
const PLAZA_X = 72;
const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.006;

/** 구역: 0 본관 앞 → 1 사회과학관 앞 → 2 인문과학관 앞 → 3 국제학사 앞 → 4 대운동장 → 5 해 질 녘 본관 앞(총장) */
const AREA_NAMES = ['본관 앞', '사회과학관 앞', '인문과학관 앞', '국제학사 앞', '대운동장', '해 질 녘 본관 앞'];

/** note = 메신저 쪽지 알림 떼, fax = 팩스기 (mobs.ts, 본관 앞부터) */
type SpawnKind = 'mail' | 'bulk' | 'phone' | 'bubble' | 'bomb' | 'note' | 'fax';
type Wave = Partial<Record<SpawnKind, number>>;

/**
 * 구역에 들어서면 몰려오는 민원 차례 (본관 앞 셋, 나머지 구역은 하나씩 — 끝나면 중간보스).
 * 새 잡몹(메신저 쪽지 알림 떼·팩스기)은 본관 앞부터 섞인다 (사용자 2026-11-17 "더 시작부터").
 * 사회과학관 앞·대운동장의 짧은 첫 차례는 예산팀 직원이 나올 자리이기도 하다 (budget.ts는 민원 차례 중에만 온다).
 */
const AREA_WAVES: Record<number, Wave[]> = {
  0: [
    { mail: 5, phone: 1, note: 1 },
    { mail: 6, bulk: 1, bubble: 2, phone: 1, fax: 1 },
    { mail: 6, bulk: 2, bubble: 2, bomb: 2, phone: 2, note: 1, fax: 1 },
  ],
  1: [{ mail: 3, bubble: 1, phone: 1, note: 1, fax: 1 }],
  2: [{ mail: 3, bubble: 2, phone: 1, note: 1, fax: 1 }],
  3: [{ mail: 3, bulk: 1, bomb: 2, phone: 1, note: 1, fax: 1 }],
  4: [{ mail: 3, bubble: 1, bomb: 1, note: 1, fax: 1 }],
};

/** 구역마다 중간보스 (민원 학생) */
const MID_OF: MidKind[] = ['wrongNumber', 'noticeBoss', 'deadline', 'minwon', 'presidentMail'];

/** 중간보스가 처음 서는 곳 → 걸어가 서는 곳 → 처리된 뒤 걸어 나가는 곳 */
const MID_SPOTS: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-24, 0, 2), new THREE.Vector3(-6, 0, -3), new THREE.Vector3(-31, 0, 3)],
  [new THREE.Vector3(FRONT_X - 1.5, 0, 4), new THREE.Vector3(106, 0, 3), new THREE.Vector3(FRONT_X - 0.5, 0, 4)],
  [HUM_DOOR.clone(), new THREE.Vector3(167, 0, HUM_DOOR.z), HUM_DOOR.clone()],
  [DORM_DOOR.clone(), new THREE.Vector3(184, 0, DORM_DOOR.z), DORM_DOOR.clone()],
  [new THREE.Vector3(95, 0, 58), new THREE.Vector3(114, 0, 72), new THREE.Vector3(95, 0, 56)],
];

/** 해 질 무렵이 이 분(게임 시간)에 걸쳐 진다 (교직원 모드. 구역이 뒤로 갈수록 더 빨리 어두워진다) */
const STAFF_DUSK_MIN = 12;

const SP_GAIN: Record<Kind, number> = { mail: 9, bulk: 16, phone: 12, bubble: 12, bomb: 14, boss: 0, note: 4, fax: 16, qr: 12 };

const KIND_LABEL: Record<Kind, [string, string]> = {
  mail: ['새벽 3시 메일', '통'],
  bulk: ['단체 메일', '통'],
  phone: ['울리는 전화기', '대'],
  bubble: ['말풍선', '개'],
  bomb: ['서류 뭉치', '뭉치'],
  note: ['메신저 쪽지 알림', '개'],
  fax: ['팩스기', '대'],
  qr: ['출석 QR 코드', '개'],
  boss: ['보스 결재', ''],
};

/** 처음 만났을 때 한 번 띄우는 요령 */
const HINTS: Partial<Record<Kind, string>> = {
  phone: '빨간 그림자에서 비키세요! 떨어진 전화기는 도장으로 받기',
  bubble: '말풍선이 부르르 떨면 옆으로 피하세요!',
  bomb: '서류 뭉치는 도장으로 미리 터뜨리면 주변 민원까지 처리!',
  note: '메신저 쪽지 알림 떼 — 한 대씩 맞히면 읽음 처리!',
  fax: '팩스기 — 날아오는 종이는 도장으로 맞혀 없애세요. 세 번 맞히면 처리',
};

const HURT_NOTE: Partial<Record<HurtKind, string>> = {
  mail: '메일 확인 중… (느려짐)',
  bulk: '메일 확인 중… (느려짐)',
  phone: '전화 받는 중… (느려짐)',
  bubble: '말풍선에 부딪힘… (느려짐)',
  bomb: '마감 폭발! (느려짐)',
  paper: '전체 회신 폭탄… (느려짐)',
  rental: '대관 신청서에 맞음… (느려짐)',
  meeting: '회의 자료에 덮임… (느려짐)',
  packet: '패킷 폭주… (느려짐)',
  wave: '회의 중… 회의록 작성 중',
  bigstamp: '보류! (느려짐)',
  error: '오류 창에 맞음… (느려짐)',
  note: '메신저 알림 확인 중… (느려짐)',
  fax: '팩스 용지에 맞음… (느려짐)',
  boss: '부딪혀 밀려남… (느려짐)',
};

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';
type DamageSrc = 'stamp' | 'blast' | 'fuse' | 'special';

/** 시계 아래 작은 글씨 (지금 있는 곳) */
const PLACES: Record<Stage, string> = {
  yard: '본관 앞',
  yardBoss: '본관 앞',
  yardClear: '본관 앞',
  path: '사회과학관 가는 길',
  plaza: '사회과학관 앞',
  plazaClear: '사회과학관 앞',
  path2: '대운동장 가는 길',
  path3: '인문과학관 가는 길',
  hum: '인문과학관 앞',
  humClear: '인문과학관 앞',
  path4: '국제학사 가는 길',
  dorm: '국제학사 앞',
  dormClear: '국제학사 앞',
  path5: '대운동장 가는 길',
  field: '대운동장',
  fieldClear: '대운동장',
  toFinal: '대운동장',
  final: '해 질 녘 본관 앞',
  done: '해 질 녘 본관 앞',
};

interface Stamp {
  obj: THREE.Group;
  vel: THREE.Vector3;
  life: number;
  on: boolean;
  /** 'stamp' = 도장(학생: 서류 비행기), 아니면 무기 모형 ("stapler:0" 등) */
  key: string;
  /** 던진 무기 (null = 도장) */
  arm: ArmDef | null;
  /** 꿰뚫기·부메랑: 이미 맞힌 것 (부메랑은 돌아올 때 비운다) */
  seen: Set<object>;
  /** 명중률: 한 번 던진 것은 한 번만 센다 */
  scored: boolean;
  /** 부메랑이 돌아오는 중 */
  back: boolean;
  t: number;
}

interface Sheet {
  obj: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  on: boolean;
  kind: SheetKind;
}

/** 날아오는 것의 크기 (도장에 맞는 거리, 플레이어에 닿는 거리) */
const SHEET_R: Record<SheetKind, [number, number]> = {
  paper: [0.55, 0.8],
  rental: [0.85, 1.0],
  meeting: [0.85, 1.0],
  packet: [0.6, 0.75],
  fax: [0.55, 0.8],
};

/** 단톡방 공지 캡처로 멈춘 잡몹: 남은 시간, 몸 원점에서 맞는 점까지, 푸른 껍질과 "…" */
interface Frost {
  t: number;
  off: THREE.Vector3;
  shell: THREE.Mesh;
  mark: THREE.Sprite;
}

/** 인감 도장(출석 스티커)으로 넘어진 잡몹: 뒤로 밀려 쓰러져 한 바퀴 구르고 다시 선다 (그동안 움직이지도 공격하지도 않는다) */
interface Down {
  t: number;
  /** 밀려나는 쪽 (플레이어 → 잡몹, 수평 단위 벡터) */
  dir: THREE.Vector3;
  /** 넘어지는 축 (위 × dir: 윗부분이 플레이어 반대쪽으로 넘어간다) */
  axis: THREE.Vector3;
  /** 넘어지기 전 자세와 자리 */
  q0: THREE.Quaternion;
  pos0: THREE.Vector3;
  /** 몸 원점 → 맞는 점 (위쪽으로만. 넘어질 때 이 점을 중심으로 돈다) */
  off: THREE.Vector3;
  /** 바닥에 있던 잡몹 (전화기·결석 도장·번호표). 아니면 날아다니던 것 */
  ground: boolean;
}

interface Pickup {
  kind: FoodKind;
  obj: THREE.Group;
  item: THREE.Group;
  ttl: number;
  t: number;
  /** 자판기 치킨돈가스: 체력 모두 회복 (vending.ts) */
  full?: boolean;
}

interface DirMark {
  el: HTMLElement;
  from: THREE.Vector3;
  t: number;
}

interface AreaStat {
  time: number;
  damage: number;
  processed: number;
}

/** 보스 대사 (미리 그려 둔다) */
const BOSS_LINES = [
  '제가 왜 협조하죠?',
  '대관 불가입니다',
  '이번만 대관 승인입니다.',
  '열쇠 반납하고 퇴근합니다…',
  '보고해!',
  '보고 잘 받았어.',
  '긴급 회의 소집합니다!',
  '회의 연기…',
  '오늘 회의는 여기까지!',
  '검토하겠습니다.',
  '꼼꼼히 다시 봅시다.',
  '보류!',
  '재검토!',
  '잠깐, 수강신청 서버가…!',
  '어? 수강신청 서버가…!',
  '서버 증설을 검토하겠습니다!',
  '휴, 서버 복구됐습니다.',
  '오늘 민원 처리, 수고 많았어요.',
  '퇴근합니다…',
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _prev = new THREE.Vector3();
const _r = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _dv = new THREE.Vector3();
const ZERO = new THREE.Vector3();

const blankCounts = (): Record<Kind, number> => ({ mail: 0, bulk: 0, phone: 0, bubble: 0, bomb: 0, boss: 0, note: 0, fax: 0, qr: 0 });
const isBoss = (e: Enemy) => e.kind === 'boss';

/** 수평 방향(플레이어 기준 yaw)을 -π~π 로 */
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 받은 피해 표시 (난이도 배율 때문에 소수가 생긴다) */
function dmgText(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 단계 → 구역 번호 (구역 카드·기록·조력자 열쇠). 길은 가는 쪽 구역으로 센다 */
function areaOf(s: Stage): number {
  if (s === 'yard' || s === 'yardBoss' || s === 'yardClear') return 0;
  if (s === 'path' || s === 'plaza' || s === 'plazaClear') return 1;
  if (s === 'path3' || s === 'hum' || s === 'humClear') return 2;
  if (s === 'path4' || s === 'dorm' || s === 'dormClear') return 3;
  if (s === 'path2' || s === 'path5' || s === 'field' || s === 'fieldClear' || s === 'toFinal') return 4;
  return 5;
}

class Game implements Ctx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
  readonly models = new Models();
  readonly fx: Fx;
  readonly sfx = new Sfx();
  readonly settings: Settings = loadSettings();
  world!: World;
  phase: Phase = 'title';
  stage: Stage = 'yard';
  /** 교직원 모드(출근하기) / 학생 모드(등교하기, src/fps/student/) */
  mode: 'staff' | 'student' = 'staff';
  stu!: StudentMode;
  /** 이번 판의 난이도 (판 도중에 설정을 바꿔도 다음 판부터) */
  runDiff: DiffKey = this.settings.diff;
  pos = new THREE.Vector3(0, EYE, 11);
  readonly eye = new THREE.Vector3(0, EYE - 0.25, 11);
  yaw = 0;
  pitch = 0.12;
  hp = MAX_HP;
  invuln = 0;
  /** 마지막으로 맞은 뒤 지난 시간 (초보 회복) */
  calmT = 0;
  slow = 0;
  cooldown = 0;
  swing = 0;
  bob = 0;
  elapsed = 0;
  wave = 0;
  queue: SpawnKind[] = [];
  spawnT = 0;
  waveDelay = -1;
  enemies: Enemy[] = [];
  stamps: Stamp[] = [];
  sheets: Sheet[] = [];
  pickups: Pickup[] = [];
  /** 지금 구역의 사람 보스 (중간보스 포함) */
  boss: PersonBoss | null = null;
  /** 보스 넷의 모형 (처음에 한 번 만든다) */
  people!: Record<Who, Person>;
  /** 새 구역 보스 둘(오검토·최몰라 처장)의 모형 */
  newPeople!: { gumto: Person; molla: Person };
  /** 이번 판의 중간보스 다섯 (판마다 이름이 바뀐다) */
  mids: Record<MidKind, MidPerson> | null = null;
  /** 지금 구역의 싸움 차례: 민원 차례 → 중간보스 → (잠깐 쉬고) 보스 */
  fight: 'none' | 'wave' | 'mid' | 'between' | 'boss' = 'none';
  /** 중간보스가 물러난 뒤 보스가 나올 때까지 */
  nextBossT = -1;
  /** 대운동장 단상에서 기다리는 회의소집 부총장 */
  waiting: Meeting | null = null;
  /** 인문과학관 앞에서 처리된 민원 (오검토 처장이 되살린다) */
  readonly pile = new ReviewPile();
  /** 마감 직전 학생이 늘린 초과근무 (분) */
  penaltyMin = 0;
  /** 지금 구역의 민원 차례들 */
  private waves: Wave[] = AREA_WAVES[0];
  hz!: Hazards;
  /** 수강신청 서버 랙 (마지막 구역에만 보인다) */
  rack!: THREE.Group;
  /** 결재받은 보스 이름 */
  approved: string[] = [];
  /** 잠깐 멈춤 (강의실 열쇠·"보고해!") */
  freezeT = 0;
  doneT = 0;
  clearT = 0;
  thrown = 0;
  hits = 0;
  weakHits = 0;
  processed = 0;
  damageTaken = 0;
  counts = blankCounts();
  areaStats: AreaStat[] = [];
  sp = 0;
  buffT = 0;
  /** 연차 쿠폰(학생: 공결 확인서): 남은 시간. 그동안 다음 한 번 맞는 것을 막는다 */
  shieldT = 0;
  /** 셔틀버스 시간표: 남은 시간. 그동안 30% 빨리 걷는다 */
  shuttleT = 0;
  /** 단톡방 공지 캡처로 멈춘 잡몹 */
  frozen = new Map<Enemy, Frost>();
  private frostGeo = new THREE.IcosahedronGeometry(1, 1);
  private frostMat = new THREE.MeshBasicMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.3, depthWrite: false });
  /** 인감 도장(학생: 출석 스티커): 남은 시간. 그동안 기본 공격(도장·서류)에 맞은 잡몹이 넘어진다 */
  sealT = 0;
  /** 넘어진 잡몹 */
  downs = new Map<Enemy, Down>();
  /** 인감 도장(출석 스티커)으로 한 번에 처리돼 구르는 잡몹 (seal.ts) */
  readonly rolls = new SealRolls();
  /** 새 잡몹(매달리는·피하는 말풍선, 메신저 쪽지 알림 떼, 팩스기) 모형과 지금 매달린 말풍선 (mobs.ts) */
  readonly mobs = new MobKit({
    camera: this.camera,
    slowFor: (sec) => (this.slow = Math.max(this.slow, sec)),
    hint: (key, text, sec) => this.hint(key, text, sec),
    count: () => this.diff.count,
  });
  /** 체력이 30% 이하로 떨어졌는데 조력자가 아직 못 왔다 (구역 카드·화면 전환이 끝나면 온다) */
  private rescueDue = false;
  dropCd = 4;
  /** 발이 땅에서 뜬 높이와 위아래 속도 */
  jumpY = 0;
  vy = 0;
  jumps = 0;
  bounds: Rect[] = [];
  keys = new Set<string>();
  firing = false;
  stick = new THREE.Vector2();
  /** 시험용 (?debug): 매 게임 단계마다 먼저 불린다 */
  botHook: ((dt: number) => void) | null = null;
  /** 손에 든 무기 (경비원·도서 무인 대출기에서 받는다, arms.ts) */
  readonly arms: Arms;
  /** 경비원·도서 무인 대출기·부수는 상자 (props.ts) */
  props!: Props;
  /** 조력자 이벤트 (helpers.ts) */
  rescue!: Rescue;
  /** 교직원 모드 고르기: 주인공·필살기 (staffpick.ts) */
  readonly pick = new StaffPick(this.pickHost());
  /** 교직원 필살기 가운데 전체 공지 발송 말고 셋 (staffskills.ts) */
  private readonly skills = new StaffSkills(this, () => {
    this.clampToBounds();
    for (const o of this.world.obstacles) this.pushOut(o);
    for (const o of this.props.solids) this.pushOut(o);
    for (const o of this.vend.solids) this.pushOut(o);
  });
  /** 교직원: 예산팀 직원 기절 이벤트 (budget.ts), 식권 자판기 (vending.ts) */
  budget!: Budget;
  vend!: Vending;
  /** 학생 3~5구역 중 한 곳: 로테이션 소개팅 (student/dating.ts) */
  dating!: Dating;
  /** 1·2구역: 민원에 묻힌 동료·친구 구조 장면 (trapped.ts) */
  trap!: Trap;
  /** 교직원 3~5구역: 미화·조리사 선생님 돕기 이벤트와 받은 아이템 F·R (sidejob.ts) */
  side!: SideJob;
  /** 두 모드: Boo 호출 벨 — 2구역부터 잡몹이 드물게 떨어뜨리고, G로 Boo를 불러 안전한 곳으로 옮겨진다 (boo.ts) */
  boo!: Boo;
  private seen = new Set<string>();
  private last = performance.now();
  private viewmodel = new THREE.Group();
  private handStamp = new THREE.Group();
  private curCd = FIRE_CD;
  private bannerTimer = 0;
  private noteTimer = 0;
  private hitTimer = 0;
  private cardT = 0;
  private flashT = 0;
  private fovKick = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private jumpBuf = 0;
  private lowering: { g: THREE.Group; t: number }[] = [];
  private spReadyShown = false;
  private offShown = false;
  /** 구역 넘어가기 연출 시간 */
  private seqT = 0;
  private dirs: DirMark[] = [];
  private sunX = NaN;
  private sunZ = NaN;
  private dusk = 0;
  private duskShown = -1;
  private areaStart: AreaStat = { time: 0, damage: 0, processed: 0 };
  private hudCache = new Map<string, string>();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: !TOUCH });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
    this.renderer.shadowMap.enabled = !TOUCH;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    $('app').appendChild(this.renderer.domElement);
    this.fx = new Fx(this.scene);
    this.scene.add(this.camera);
    this.buildViewmodel();
    this.arms = new Arms(this.viewmodel);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (TOUCH) document.body.classList.add('touch');
    document.querySelectorAll<HTMLElement>('.dmg').forEach((el) => this.dirs.push({ el, from: new THREE.Vector3(), t: 0 }));
    this.sfx.setVolume(this.settings.volume);
  }

  /** 예전 시험 스크립트용 (모든 적) */
  get mails(): Enemy[] {
    return this.enemies;
  }

  get diff(): Diff {
    return DIFFS[this.runDiff];
  }

  get feet(): number {
    return this.jumpY;
  }

  /** 말풍선 돌진이 멈추는 경계 (길 위에서는 지나온 구역) */
  get area(): Rect {
    const w = this.world;
    switch (this.stage) {
      case 'path':
      case 'plaza':
      case 'plazaClear':
      case 'path2':
      case 'path3':
        return w.plaza;
      case 'hum':
      case 'humClear':
      case 'path4':
        return w.hum;
      case 'dorm':
      case 'dormClear':
      case 'path5':
        return w.dorm;
      case 'field':
      case 'fieldClear':
      case 'toFinal':
        return w.field;
      default:
        return w.yard;
    }
  }

  async init(): Promise<void> {
    const logos = await loadLogos();
    this.world = buildWorld(this.scene, logos);
    this.hz = new Hazards(this.scene, this.models.warnGeo, this.models.warnMat);
    // 보스 넷 (미리 만들어 두고 판마다 다시 쓴다)
    this.people = {
      chonggwal: new Person('chonggwal', BOSS_NAMES.chonggwal, '#a7f3c0'),
      bogo: new Person('bogo', BOSS_NAMES.bogo, '#c9d3e6'),
      meeting: new Person('meeting', BOSS_NAMES.meeting, '#d8c4ff'),
      president: new Person('president', BOSS_NAMES.president, '#ffe066'),
    };
    this.newPeople = buildNewBossPeople();
    this.rack = this.models.serverRack();
    this.rack.position.copy(SERVER_SPOT);
    this.rack.visible = false;
    this.scene.add(this.rack);
    this.stu = new StudentMode(this, this.studentHost());
    const perk = this.perkHost();
    this.props = new Props(perk);
    this.rescue = new Rescue(perk);
    this.budget = new Budget(perk, this, () => areaOf(this.stage));
    this.vend = new Vending(perk, this, MAX_HP);
    this.dating = new Dating(this.datingHost());
    this.trap = new Trap(this.trapHost());
    this.side = new SideJob(this.sideHost());
    this.boo = new Boo(this.booHost());
    this.bounds = [this.world.yard];
    this.world.setDusk(0);
    this.warmup();
    this.bindInput();
    this.showTitle();
    this.updateMuteUi();
    if (TIMER) {
      const step = () => {
        this.tick();
        setTimeout(step, 16);
      };
      step();
    } else {
      this.renderer.setAnimationLoop(() => this.tick());
    }
  }

  /**
   * 적·물건·효과를 한 번씩 미리 그려 둔다 (셰이더 컴파일·텍스처 업로드를 타이틀 화면 뒤에서 끝낸다).
   * 안 하면 처음 나오는 적마다 한 프레임이 크게 끊긴다.
   */
  private warmup(): void {
    const g = new THREE.Group();
    g.position.set(0, 1.6, 6);
    const m = this.models;
    const items: THREE.Object3D[] = [
      m.mail(false).obj,
      m.mail(true).obj,
      m.phone().obj,
      m.bubble().obj,
      m.bomb().obj,
      m.food('donkatsu').obj,
      m.food('gimbap').obj,
      m.food('americano').obj,
      m.food('ticket').obj,
      m.food('battery').obj,
      m.food('shield').obj,
      m.food('shield', true).obj,
      m.food('shuttle').obj,
      m.food('capture').obj,
      m.food('seal').obj,
      m.food('seal', true).obj,
      m.food('boo').obj,
      ...this.arms.warmItems(),
      m.sheet('paper'),
      m.sheet('rental'),
      m.sheet('meeting'),
      m.sheet('packet'),
      m.stamp(),
      new THREE.Mesh(m.warnGeo, m.warnMat),
    ];
    items.forEach((o, i) => {
      o.position.x = (i - 7) * 0.4;
      o.scale.setScalar(0.15);
      g.add(o);
    });
    // 보스 넷(+ 새 구역 보스 둘): 자세와 말풍선·도장 자국·메일 폭풍까지 한 번 그려 둔다
    const ppl = [...Object.values(this.people), this.newPeople.gumto, this.newPeople.molla];
    ppl.forEach((pp, i) => {
      pp.root.position.set(-5 + i * 2, -1.6, -2);
      pp.say('…', 1, false);
      pp.stampMark(true);
      pp.updateStorm(1);
      pp.update(0.016, { walking: true, raise: 0.5, reach: 0.5, wave: false });
      g.add(pp.root);
    });
    this.rack.visible = true;
    const unwarm = this.stu.warm(g);
    const unwarmProps = this.props.warm(g);
    const unwarmRescue = this.rescue.warm(g);
    const unwarmMore = [this.budget.warm(g), this.vend.warm(g), this.dating.warm(g)];
    unwarmMore.push(this.side.warm(g), this.boo.warm(g));
    this.scene.add(g);
    const p = _v.set(0, 1.6, 6);
    this.fx.confetti(p, 4, 1);
    this.fx.blast(p, 1);
    this.fx.ring(0, 0.1, 6, 1, 2, 1, 0xffffff);
    this.fx.mark(p, 1);
    this.fx.decal(0, 6);
    // 떠오르는 글자는 글자+색마다 그림이 하나씩이라 실제로 쓰는 조합을 모두 미리 만든다
    for (const [t, col] of [
      ['따르릉!', '#ffe066'],
      ['네, 행정실입니다~', '#ffffff'],
      ['펑!', '#ffffff'],
      ['펑! 마감!', '#ffb347'],
      ['뚝.', '#cfd4d8'],
      ['결재판!', '#ffe066'],
      ['결재 완료!', '#7CFC9A'],
      ['회의 불참 성공!', '#7CFC9A'],
      ...MID_TEXTS,
    ]) {
      this.fx.text(p, t, col);
    }
    // 보스 대사 그림도 미리 만든다 (처음 말할 때 끊기지 않게)
    prepareSpeech(BOSS_LINES);
    prepareSpeech(MID_LINES);
    prepareSpeech(PRESIDENT_LINES);
    this.fx.update(0.001);
    this.camera.position.set(0, EYE, 11);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    // 화면 밖(사회과학관·운동장 등)에 있는 재질과 그림도 지금 올려 둔다
    this.renderer.compile(this.scene, this.camera);
    const seen = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const mm of Array.isArray(mat) ? mat : [mat]) {
        const mp = mm as THREE.MeshLambertMaterial;
        for (const map of [mp.map, mp.emissiveMap]) {
          if (map && !seen.has(map)) {
            seen.add(map);
            this.renderer.initTexture(map);
          }
        }
      }
    });
    for (const t of peopleKit().textures) this.renderer.initTexture(t);
    for (const t of speechTextures()) this.renderer.initTexture(t);
    for (const t of this.hz.textures) this.renderer.initTexture(t);
    for (const t of this.stu.textures) this.renderer.initTexture(t);
    for (const t of [...this.mobs.textures, ...stuMobTextures()]) this.renderer.initTexture(t);
    this.renderer.render(this.scene, this.camera);
    unwarm();
    unwarmProps();
    unwarmRescue();
    for (const f of unwarmMore) f();
    this.scene.remove(g);
    for (const pp of ppl) {
      g.remove(pp.root);
      pp.reset();
      pp.updateStorm(0);
      pp.root.position.set(0, 0, 0);
    }
    this.rack.visible = false;
    this.fx.clear();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    speechView(h, this.camera.fov);
  }

  /** 학생 모드(src/fps/student/)가 빌려 쓰는 Game 안쪽 기능 */
  private studentHost(): StudentHost {
    return {
      touch: TOUCH,
      overlay: (html) => this.overlay(html),
      hideOverlay: () => this.hideOverlay(),
      showTitle: () => this.showTitle(),
      showStaff: () => this.pick.show(),
      toTitle: () => {
        this.resetRun();
        this.showTitle();
      },
      showSettings: () => this.showSettings('title'),
      placeBoss: (b) => this.placeBoss(b),
      showBossBar: (name) => this.showBossBar(name),
      lower: (g) => this.lower(g),
      note: (text, time) => this.note(text, time),
      hint: (key, text, time) => this.hint(key, text, time),
      buzz: (p) => this.buzz(p),
      setDusk: (k) => (this.dusk = k),
      arm: { sleeve: this.viewmodel.children[0] as THREE.Mesh, stamp: this.handStamp },
      holdWave: () => this.trap.holds() || this.dating.holds(),
    };
  }

  /** 학생 로테이션 소개팅(student/dating.ts)이 빌려 쓰는 Game 안쪽 기능 */
  private datingHost(): DatingHost {
    const g = this;
    return {
      touch: TOUCH,
      scene: this.scene,
      get mode() {
        return g.mode;
      },
      get playing() {
        return g.phase === 'play';
      },
      get pos() {
        return g.pos;
      },
      get yaw() {
        return g.yaw;
      },
      get area() {
        return g.area;
      },
      solids: () => [...g.world.obstacles, ...g.props.solids, ...g.vend.solids],
      areaNo: () => g.stu.areaNo,
      waveOk: () => g.stu.inWave,
      // 조력자·친구 구조 장면·구역 카드·멈춤이 끝난 뒤에
      free: () => !g.rescue.busy && g.trap.state === 'idle' && g.freezeT <= 0 && !g.rescueHeld(),
      heroName: () => g.stu.heroName,
      healFull: () => (g.hp = MAX_HP),
      resetInput: () => {
        g.keys.clear();
        g.firing = false;
      },
      banner: (title, sub) => g.banner(title, sub),
      note: (text, time) => g.note(text, time),
      sound: (name, at, vol) => g.sound(name, at, vol),
    };
  }

  /** 1·2구역 동료·친구 구조 장면(trapped.ts)이 빌려 쓰는 Game 안쪽 기능 */
  private trapHost(): TrapHost {
    const g = this;
    const areaNo = () => (g.mode === 'student' ? g.stu.areaNo : areaOf(g.stage));
    return {
      scene: this.scene,
      get mode() {
        return g.mode;
      },
      get playing() {
        return g.phase === 'play';
      },
      get pos() {
        return g.pos;
      },
      get yaw() {
        return g.yaw;
      },
      get area() {
        return g.area;
      },
      solids: () => [...g.world.obstacles, ...g.props.solids, ...g.vend.solids],
      areaNo,
      // 민원 차례 중 (교직원 본관 앞은 2차 민원부터 — 1차는 처음 배우는 차례)
      waveOk: () => (g.mode === 'student' ? g.stu.inWave : g.fight === 'wave' && (areaOf(g.stage) > 0 || g.wave >= 1)),
      // 예산팀 직원이 와 있거나 조력자가 뛰어오는 중이거나 멈춰 있으면 기다린다.
      // 교직원 모드는 예산팀 직원이 이 구역에 다녀간 뒤에 (줄이 다 나왔으면 바로)
      free: () =>
        !g.budget.busy &&
        !g.rescue.busy &&
        g.freezeT <= 0 &&
        !g.rescueHeld() &&
        (g.mode === 'student' || g.budget.shown.includes(areaOf(g.stage)) || g.queue.length === 0),
      count: () => g.diff.count,
      addPile: (slot, n, anchor) => {
        const student = g.mode === 'student';
        const model = student ? badgeObj(g.mobs.badge('D-1')) : g.models.mail(false).obj;
        const e = new PileMob(g, model, student ? 'note' : 'mail', anchor, slot, n, student ? 1 : 1.15);
        g.enemies.push(e);
        return e;
      },
      pickTrapped: () => g.rescue.pickTrapped(),
      release: (id, saved) => g.rescue.release(id, saved),
      banner: (title, sub) => g.banner(title, sub),
      note: (text, time) => g.note(text, time),
      sound: (name, at, vol) => g.sound(name, at, vol),
    };
  }

  /** 3~5구역 돕기 이벤트·아이템(sidejob.ts)이 빌려 쓰는 Game 안쪽 기능 (교직원 모드만) */
  private sideHost(): SideHost {
    const g = this;
    return {
      touch: TOUCH,
      scene: this.scene,
      camera: this.camera,
      fx: this.fx,
      get mode() {
        return g.mode;
      },
      get playing() {
        return g.phase === 'play';
      },
      get frozen() {
        return g.freezeT > 0;
      },
      get airborne() {
        return g.boo.carrying;
      },
      get pos() {
        return g.pos;
      },
      get eyeY() {
        return EYE + g.jumpY;
      },
      get yaw() {
        return g.yaw;
      },
      get pitch() {
        return g.pitch;
      },
      get area() {
        return g.area;
      },
      get hp() {
        return g.hp;
      },
      maxHp: MAX_HP,
      solids: () => [...g.world.obstacles, ...g.props.solids, ...g.vend.solids],
      areaNo: () => areaOf(g.stage),
      waveOk: () => g.mode === 'staff' && g.fight === 'wave',
      // 구조 장면(trapHost.free)과 같은 조건 + 구조 장면이 끝난 뒤
      free: () =>
        !g.budget.busy &&
        !g.rescue.busy &&
        g.freezeT <= 0 &&
        !g.rescueHeld() &&
        g.trap.state === 'idle' &&
        (g.budget.shown.includes(areaOf(g.stage)) || g.queue.length === 0),
      enemies: () => g.enemies,
      isBoss,
      itemHit: (e, stamps) => g.itemHit(e, stamps),
      minions: () => g.minions(),
      spawnMob: () => g.spawnKind(Math.random() < 0.75 ? 'mail' : 'phone'),
      heal: (n) => (g.hp = Math.min(MAX_HP, g.hp + n)),
      banner: (title, sub) => g.banner(title, sub),
      note: (text, time) => g.note(text, time),
      sound: (name, at, vol) => g.sound(name, at, vol),
    };
  }

  /** Boo 호출 벨(boo.ts)이 빌려 쓰는 Game 안쪽 기능 (두 모드) */
  private booHost(): BooHost {
    const g = this;
    return {
      touch: TOUCH,
      scene: this.scene,
      camera: this.camera,
      get playing() {
        return g.phase === 'play' && !g.dating.modal;
      },
      get frozen() {
        return g.freezeT > 0;
      },
      get held() {
        return g.rescueHeld();
      },
      get pos() {
        return g.pos;
      },
      get eyeY() {
        return EYE + g.jumpY;
      },
      get yaw() {
        return g.yaw;
      },
      get pitch() {
        return g.pitch;
      },
      set pitch(v: number) {
        g.pitch = Math.max(-1.2, Math.min(1.35, v));
      },
      get area() {
        return g.area;
      },
      get bounds() {
        return g.bounds;
      },
      solids: () => [...g.world.obstacles, ...g.props.solids, ...g.vend.solids],
      areaNo: () => (g.mode === 'student' ? g.stu.areaNo : areaOf(g.stage)),
      enemies: () => g.enemies,
      carryTo: (x, z, y) => {
        g.pos.x = x;
        g.pos.z = z;
        g.jumpY = y;
        g.vy = 0;
        g.jumpBuf = 0;
      },
      guard: (sec) => (g.invuln = Math.max(g.invuln, sec)),
      bellOnGround: () => g.pickups.some((p) => p.kind === 'boo'),
      dropBell: (x, z) => {
        const s = g.freeSpot(x, z);
        g.spawnPickup('boo', s.x, s.z);
      },
      note: (text, time) => g.note(text, time),
      sound: (name, at, vol) => g.sound(name, at, vol),
    };
  }

  /** 경비원·대출기·상자·조력자(props.ts, helpers.ts)가 빌려 쓰는 Game 안쪽 기능 */
  private perkHost(): PerkHost {
    const g = this;
    return {
      touch: TOUCH,
      scene: this.scene,
      models: this.models,
      fx: this.fx,
      get mode() {
        return g.mode;
      },
      get stage() {
        return g.stage;
      },
      get playing() {
        return g.phase === 'play';
      },
      get pos() {
        return g.pos;
      },
      get yaw() {
        return g.yaw;
      },
      get area() {
        return g.area;
      },
      playerName: () => (g.mode === 'student' ? g.stu.heroName : g.pick.hero.name),
      heroId: () => (g.mode === 'student' ? g.stu.heroId : g.pick.hero.id),
      note: (text, time) => g.note(text, time),
      hint: (key, text, time) => g.hint(key, text, time),
      banner: (title, sub) => g.banner(title, sub),
      sound: (name, at, vol) => g.sound(name, at, vol),
      spawnPickup: (kind, x, z) => g.spawnPickup(kind, x, z),
      equip: (id) => g.equip(id),
      rescueHit: () => g.rescueHit(),
    };
  }

  /** 교직원 선택 화면(staffpick.ts)이 빌려 쓰는 Game 안쪽 기능 */
  private pickHost(): PickHost {
    const g = this;
    return {
      touch: TOUCH,
      get title() {
        return g.phase === 'title';
      },
      get diff() {
        return g.settings.diff;
      },
      get sleeve() {
        return g.viewmodel.children[0] as THREE.Mesh;
      },
      overlay: (html) => g.overlay(html),
      showTitle: () => g.showTitle(),
      showStudent: () => g.stu.showSelect(),
      showSettings: () => g.showSettings('title'),
      bindDiff: (root) => bindSettings(root, g.settings, (key) => g.applySetting(key)),
      begin: () => {
        g.mode = 'staff';
        g.start();
      },
    };
  }

  /** 화면 오른쪽 아래 주무관의 팔과 도장 */
  private buildViewmodel(): void {
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.6), new THREE.MeshLambertMaterial({ color: 0x9cc3e6 }));
    sleeve.position.set(0, -0.05, 0.22);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: 0xf1c7a0 }));
    hand.position.set(0, -0.02, -0.12);
    const handle = new THREE.Mesh(this.models.stampGeoH, this.models.woodMat);
    handle.position.set(0, 0.1, -0.14);
    const head = new THREE.Mesh(this.models.stampGeoS, this.models.redMat);
    head.position.set(0, 0.25, -0.14);
    this.handStamp.add(handle, head);
    this.viewmodel.add(sleeve, hand, this.handStamp);
    this.viewmodel.scale.setScalar(0.55);
    this.viewmodel.position.set(0.34, -0.3, -0.6);
    this.viewmodel.rotation.set(0.15, -0.12, 0);
    this.camera.add(this.viewmodel);
  }

  // ---------- 입력 ----------

  private bindInput(): void {
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', (e) => {
      unlock();
      // 타이틀·학생 선택 화면의 모드 키(1·2·Enter), 학생 엔딩 건너뛰기
      if (this.stu.key(e)) return;
      // 교직원 선택 화면 (방향키·Enter·Esc·2)
      if (this.pick.key(e)) return;
      // 로테이션 소개팅 화살표 판: 방향키·WASD를 가져간다 (student/dating.ts)
      if (this.dating.key(e)) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && this.phase === 'play') e.preventDefault();
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.phase === 'play' && !document.pointerLockElement) this.pause();
      if (e.code === 'KeyQ') this.special();
      // E: 돕기 이벤트(미화·조리사 선생님)·소개팅 짝 앞이면 돕기·참가, 자판기 앞이면 식권 넣기, 아니면 경비원 인사·대출기
      // (Boo가 들고 나는 동안은 E를 받지 않는다)
      if (e.code === 'KeyE' && this.phase === 'play' && !this.boo.carrying && !this.side.use() && !this.dating.use() && !this.vend.use()) this.props.interact();
      // G: Boo 호출 벨 쓰기 (boo.ts — 멈춤·소개팅 판·기절 중이면 무시)
      if (e.code === 'KeyG' && this.phase === 'play') this.boo.call();
      // F: 빗자루·쓰레기통 폭탄 던지기, R: 소고기콩나물밥·교직원 식당 통닭 먹기 (sidejob.ts)
      if (e.code === 'KeyF' && this.phase === 'play') this.side.useItem();
      if (e.code === 'KeyR' && this.phase === 'play') this.side.eat();
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'Space' && this.phase === 'play') this.jump();
      if ((e.code === 'Enter' || e.code === 'Space') && (this.phase === 'clear' || this.phase === 'over')) {
        e.preventDefault();
        this.restart();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = this.renderer.domElement;
    document.addEventListener('mousemove', (e) => {
      if (this.phase !== 'play' || document.pointerLockElement !== canvas) return;
      const k = LOOK_MOUSE * this.settings.sens;
      this.look(e.movementX * k, e.movementY * k);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.phase !== 'play') return;
      if (!TOUCH && document.pointerLockElement !== canvas && !DEBUG) {
        canvas.requestPointerLock();
        return;
      }
      this.firing = true;
    });
    window.addEventListener('mouseup', () => (this.firing = false));
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.phase === 'play') this.pause();
    });
    // 탭을 가리거나 앱을 바꾸면 멈춘다 (?timer 시험 모드는 그대로 돈다)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || TIMER) return;
      if (this.phase === 'play') this.pause();
      this.sfx.suspend();
    });
    if (TOUCH) this.bindTouch();
  }

  private bindTouch(): void {
    const stickEl = $('stick');
    const knob = $('knob');
    let moveId: number | null = null;
    let lookId: number | null = null;
    let fireId: number | null = null;
    let origin = { x: 0, y: 0 };
    let lastLook = { x: 0, y: 0 };
    let lastFire = { x: 0, y: 0 };
    const el = this.renderer.domElement;
    const lookBy = (dx: number, dy: number) => {
      if (this.phase !== 'play') return;
      const k = LOOK_TOUCH * this.settings.sens;
      this.look(dx * k, dy * k);
    };
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth * 0.45 && moveId === null) {
            moveId = t.identifier;
            origin = { x: t.clientX, y: t.clientY };
            stickEl.style.left = `${t.clientX - 60}px`;
            stickEl.style.top = `${t.clientY - 60}px`;
            stickEl.style.bottom = 'auto';
          } else if (lookId === null) {
            lookId = t.identifier;
            lastLook = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === moveId) {
            const dx = Math.max(-50, Math.min(50, t.clientX - origin.x));
            const dy = Math.max(-50, Math.min(50, t.clientY - origin.y));
            this.stick.set(dx / 50, dy / 50);
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
          } else if (t.identifier === lookId) {
            lookBy(t.clientX - lastLook.x, t.clientY - lastLook.y);
            lastLook = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveId) {
          moveId = null;
          this.stick.set(0, 0);
          knob.style.transform = '';
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    // 도장 버튼: 누르고 있으면 계속 던지고, 누른 채로 끌면 시점도 돌아간다
    const fire = $('fire');
    fire.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        fireId = t.identifier;
        lastFire = { x: t.clientX, y: t.clientY };
        this.firing = true;
      },
      { passive: false },
    );
    fire.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== fireId) continue;
          lookBy(t.clientX - lastFire.x, t.clientY - lastFire.y);
          lastFire = { x: t.clientX, y: t.clientY };
        }
      },
      { passive: false },
    );
    const fireEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === fireId) {
          fireId = null;
          this.firing = false;
        }
      }
    };
    fire.addEventListener('touchend', fireEnd);
    fire.addEventListener('touchcancel', fireEnd);
    $('jumpBtn').addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.jump();
      },
      { passive: false },
    );
    $('spBtn').addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.special();
      },
      { passive: false },
    );
    $('spBtn').addEventListener('click', () => this.special());
    $('muteBtn').addEventListener('click', () => this.toggleMute());
    $('pauseBtn').addEventListener('click', () => this.pause());
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.max(-1.2, Math.min(1.35, this.pitch - dy));
  }

  toggleMute(): void {
    this.sfx.unlock();
    this.sfx.toggleMute();
    this.updateMuteUi();
  }

  private updateMuteUi(): void {
    $('muteState').textContent = this.sfx.muted ? '꺼짐' : '켜짐';
    $('muteBtn').textContent = this.sfx.muted ? '소리 끔' : '소리 켬';
  }

  /** 짧은 진동 (지원하는 기기만, 흔들림 줄이기를 켜면 안 한다) */
  private buzz(pattern: number | number[]): void {
    if (this.settings.calm || typeof navigator.vibrate !== 'function') return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* 막힌 기기 */
    }
  }

  quake(amount: number, at?: THREE.Vector3): void {
    if (this.settings.calm) return;
    const k = at ? Math.max(0, 1 - at.distanceTo(this.eye) / 30) : 1;
    if (k <= 0) return;
    this.shakeAmp = Math.max(this.shakeT > 0 ? this.shakeAmp : 0, amount * k * 0.035);
    this.shakeT = 0.35;
  }

  // ---------- 화면 (타이틀·설정·일시정지) ----------

  private overlay(html: string): HTMLElement {
    const o = $('overlay');
    titleLeft();
    o.innerHTML = html;
    o.hidden = false;
    o.scrollTop = 0;
    // 뒤에 남은 알림 글씨가 비쳐 보이지 않게
    $('banner').style.opacity = '0';
    $('note').style.opacity = '0';
    clearSubtitle();
    this.bannerTimer = 0;
    this.noteTimer = 0;
    return o;
  }

  private hideOverlay(): void {
    $('overlay').hidden = true;
    titleLeft();
  }

  /** 시작 화면: 로고 · 제목 · 모드 단추 둘(교직원 → 교직원 선택 화면 staffpick.ts, 학생 → 학생 선택 화면) · 설정·기록판·2D 본편 */
  private showTitle(): void {
    this.phase = 'title';
    const o = this.overlay(`
      <div class="panel title">
        <img class="emblem" src="hufs/emblem-mono.png" alt=""> <img class="type" src="hufs/hufs-type.png" alt="HUFS">
        <h1>Three Party Problem</h1>
        ${this.stu.modeButtons()}
        <div class="tlinks">${appHomeLink()}<button id="setBtn" type="button">설정</button><a href="./">2D 본편</a></div>
      </div>`);
    this.stu.bindTitle();
    $('setBtn').addEventListener('click', () => this.showSettings('title'));
    // 기록판 단추(board.ts)는 설정 다음 자리로
    addBoardButton(o);
    $('setBtn').after($('boardBtn'));
    titleShown();
  }

  private showSettings(from: 'title' | 'pause'): void {
    const o = this.overlay(`
      <div class="panel">
        <h1>설정</h1>
        ${settingsHtml(this.settings, { touch: TOUCH, inRun: from === 'pause' })}
        <button id="backBtn" type="button">돌아가기</button>
      </div>`);
    bindSettings(o, this.settings, (key) => this.applySetting(key));
    $('backBtn').addEventListener('click', () => (from === 'title' ? this.showTitle() : this.showPause()));
  }

  private applySetting(key: keyof Settings): void {
    if (key === 'volume') {
      this.sfx.unlock();
      this.sfx.setVolume(this.settings.volume);
      this.sfx.play('pickup', 0.6);
    }
    if (key === 'diff' && this.phase === 'title') {
      this.runDiff = this.settings.diff;
      const best = document.querySelector('.panel .best');
      if (best) best.innerHTML = `최고 기록 ${bestLine(this.settings.diff)}`;
    }
    if (key === 'calm' && this.settings.calm) {
      this.shakeT = 0;
      this.fovKick = 0;
    }
  }

  start(): void {
    this.sfx.unlock();
    this.hideOverlay();
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!TOUCH && !DEBUG) this.renderer.domElement.requestPointerLock();
    if (TOUCH && !document.fullscreenElement) {
      // 전체 화면을 못 쓰는 브라우저(iPhone 등)는 그대로 한다
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    if (this.phase === 'title') {
      this.runDiff = this.settings.diff;
      // 고른 교직원의 팔·이름 (학생 모드면 덧댄 것만 감춘다), 지난 판 필살기 연출 정리
      this.pick.dress(this.mode === 'staff');
      this.skills.clear();
      if (this.mode === 'student') this.stu.begin();
      else {
        this.mids = buildMidPeople();
        this.startWaves(0);
      }
    }
    this.phase = 'play';
    this.last = performance.now();
  }

  pause(): void {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.firing = false;
    this.keys.clear();
    this.showPause();
  }

  private showPause(): void {
    this.overlay(`
      <div class="panel">
        <h1>일시정지</h1>
        <p>${TOUCH ? '버튼을 눌러 계속합니다' : '클릭하면 계속합니다 (마우스로 시점)'}</p>
        <p class="best">${AREA_NAMES[areaOf(this.stage)]} · ${timeText(this.elapsed)} · 난이도 ${this.diff.label}</p>
        <button id="resumeBtn" type="button">계속하기</button>
        <button id="setBtn" class="ghost" type="button">설정</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('resumeBtn').addEventListener('click', () => this.start());
    $('setBtn').addEventListener('click', () => this.showSettings('pause'));
    $('titleBtn').addEventListener('click', () => {
      this.resetRun();
      this.showTitle();
    });
  }

  /** 판을 처음 상태로 (타이틀로 가거나 다시 하기) */
  private resetRun(): void {
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    for (const s of this.stamps) {
      s.on = false;
      s.obj.visible = false;
    }
    for (const s of this.sheets) {
      s.on = false;
      s.obj.visible = false;
    }
    for (const p of this.pickups) this.scene.remove(p.obj);
    this.pickups = [];
    this.fx.clear();
    this.hz.clear();
    this.boss = null;
    this.approved = [];
    this.freezeT = 0;
    this.seqT = 0;
    this.rack.visible = false;
    $('fade').classList.remove('on');
    this.stage = 'yard';
    this.bounds = [this.world.yard];
    const w = this.world;
    for (const b of [w.barricade, w.barricade2, w.barricade3, w.barricade4, w.barricade5]) {
      b.visible = true;
      b.position.y = 0;
    }
    for (const a of [w.arrows, w.arrows2, w.arrows3, w.arrows4, w.arrows5]) a.visible = false;
    this.mids = null;
    this.fight = 'none';
    this.nextBossT = -1;
    this.waiting = null;
    this.pile.clear();
    this.penaltyMin = 0;
    this.waves = AREA_WAVES[0];
    this.lowering = [];
    this.pos.set(0, EYE, 11);
    this.yaw = 0;
    this.pitch = 0.12;
    this.hp = MAX_HP;
    this.elapsed = 0;
    this.thrown = 0;
    this.hits = 0;
    this.weakHits = 0;
    this.processed = 0;
    this.damageTaken = 0;
    this.counts = blankCounts();
    this.areaStats = [];
    this.areaStart = { time: 0, damage: 0, processed: 0 };
    this.sp = 0;
    this.buffT = 0;
    this.shieldT = 0;
    this.shuttleT = 0;
    this.sealT = 0;
    this.downs.clear();
    this.rescueDue = false;
    this.dropCd = 4;
    this.slow = 0;
    this.invuln = 0;
    this.calmT = 0;
    this.waveDelay = -1;
    this.doneT = 0;
    this.clearT = 0;
    this.cardT = 0;
    this.jumpY = 0;
    this.vy = 0;
    this.jumps = 0;
    this.jumpBuf = 0;
    this.shakeT = 0;
    this.spReadyShown = false;
    this.offShown = false;
    for (const d of this.dirs) d.t = 0;
    $('bossbox').classList.remove('on');
    $('areacard').classList.remove('on');
    for (const id of ['stamp1', 'stamp2']) $(id).classList.remove('on');
    this.props.clear();
    this.rescue.clear();
    this.trap.clear();
    this.side.clear();
    this.boo.clear();
    this.dating.clear();
    this.budget.clear();
    this.vend.clear();
    this.arms.clear();
    this.stu.reset();
    this.phase = 'title';
  }

  restart(): void {
    this.resetRun();
    this.start();
  }

  /** 구역의 민원 차례를 시작한다 (a = 구역 번호) */
  private startWaves(a: number): void {
    this.fight = 'wave';
    this.waves = AREA_WAVES[a] ?? [];
    this.beginWave(0);
  }

  private beginWave(i: number): void {
    this.wave = i;
    const w = this.waves[i];
    this.queue = [];
    for (const [k, n0] of Object.entries(w) as [SpawnKind, number][]) {
      const n = Math.max(1, Math.round(n0 * this.diff.count));
      for (let j = 0; j < n; j++) this.queue.push(k);
    }
    for (let k = this.queue.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [this.queue[k], this.queue[j]] = [this.queue[j], this.queue[k]];
    }
    // 첫 차례는 메일부터 (전화기는 조금 뒤에)
    if (i === 0) {
      const p = this.queue.indexOf('phone');
      if (p >= this.queue.length - 2) [this.queue[p], this.queue[0]] = [this.queue[0], this.queue[p]];
    }
    this.spawnT = 1.2;
    this.banner(`${i + 1}차 민원 도착!`, i === 0 && areaOf(this.stage) === 0 ? '본관 쪽에서 날아옵니다 — 도장으로 처리하세요' : `${this.queue.length}건이 몰려옵니다`);
  }

  // ---------- 구역 넘어가기 ----------

  /** 구역 하나를 끝냈을 때의 기록 */
  private recordArea(): AreaStat {
    const s: AreaStat = {
      time: this.elapsed - this.areaStart.time,
      damage: this.damageTaken - this.areaStart.damage,
      processed: this.processed - this.areaStart.processed,
    };
    this.areaStats.push(s);
    this.areaStart = { time: this.elapsed, damage: this.damageTaken, processed: this.processed };
    return s;
  }

  /** 구역 정리 카드 (게임은 멈추지 않고 몇 초 뒤 사라진다) */
  private showCard(i: number, s: AreaStat, next: string): void {
    const el = $('areacard');
    el.innerHTML = `
      <small>${i + 1}구역 정리 완료</small>
      <b>${AREA_NAMES[i]}</b>
      <div class="stats"><span>처리 시간 <em>${timeText(s.time)}</em></span><span>받은 피해 <em>${dmgText(s.damage)}</em></span><span>처리 <em>${s.processed}건</em></span></div>
      <div class="next">${next}</div>`;
    el.classList.add('on');
    this.cardT = 4.2;
    $('banner').style.opacity = '0';
    this.bannerTimer = 0;
    this.sound('clear');
  }

  private lower(g: THREE.Group): void {
    this.lowering.push({ g, t: 0 });
  }

  /** 사람 보스를 세운다 (결재 양은 난이도만큼) */
  private placeBoss(b: PersonBoss): void {
    b.hp = b.maxHp = Math.max(6, Math.round(b.maxHp * this.diff.bossHp));
    this.boss = b;
    this.enemies.push(b);
  }

  /** 보스 막대와 이름 띠를 켠다 (새 구역 보스는 자기 공략 줄) */
  private announceBoss(b: PersonBoss): void {
    this.showBossBar(b.bossName);
    this.banner(b.bossName, b instanceof Gumto || b instanceof Molla ? b.hintText : BOSS_HINTS[b.who]);
    this.sound('volley');
  }

  /** 민원 차례가 끝나면(또는 구역에 들어서면) 중간보스(민원 학생)가 온다 */
  private startMid(): void {
    const a = areaOf(this.stage);
    if (a === 0) this.stage = 'yardBoss';
    this.fight = 'mid';
    const kind = MID_OF[a];
    const mp = (this.mids ??= buildMidPeople())[kind];
    const [at, spot, exit] = MID_SPOTS[a];
    const b = new StaffMid(this, mp, kind, at, spot, exit, this.world.obstacles, this.runDiff === 'easy');
    this.placeBoss(b);
    this.showBossBar(b.bossName);
    this.banner(b.bannerTitle, b.bannerSub);
    this.sound('volley');
    if (b.note) this.hint(`mid:${kind}`, b.note, 3.8);
  }

  /** 중간보스가 물러난 뒤 구역 보스가 나온다 (대운동장은 단상의 부총장이 깨어난다) */
  private spawnAreaBoss(): void {
    const a = areaOf(this.stage);
    const easy = this.runDiff === 'easy';
    this.fight = 'boss';
    if (a === 4) {
      const m = this.waiting;
      this.waiting = null;
      if (!m) return;
      this.boss = m;
      m.wake();
      this.announceBoss(m);
      return;
    }
    const b =
      a === 0
        ? new Chonggwal(this, this.people.chonggwal)
        : a === 1
          ? new Bogo(this, this.people.bogo)
          : a === 2
            ? new Gumto(this, this.newPeople.gumto, this.pile, this.world.obstacles, easy)
            : new Molla(this, this.newPeople.molla, this.world.obstacles, easy);
    this.placeBoss(b);
    this.announceBoss(b);
  }

  /** 보스 결재 완료 (승인 도장 → 한마디 → 퇴근). 중간보스(민원 학생)는 인사하고 돌아간 뒤 구역 보스가 나온다 */
  private bossApproved(b: PersonBoss): void {
    this.sweepMinions();
    this.hz.clear();
    this.freezeT = 0;
    this.buzz([40, 30, 80]);
    if (this.mode === 'student') {
      this.approved.push(b.bossName);
      return this.stu.bossApproved(b);
    }
    if (b instanceof StaffMid) {
      $('bossbox').classList.remove('on');
      this.fight = 'between';
      this.nextBossT = 2.6;
      return;
    }
    this.approved.push(b.bossName);
    if (b.who === 'president') {
      this.presidentApproved();
      return;
    }
    this.clearT = 3.2;
    this.fight = 'none';
    const clears: Stage[] = ['yardClear', 'plazaClear', 'humClear', 'dormClear', 'fieldClear'];
    this.stage = clears[Math.min(4, areaOf(this.stage))];
  }

  /** 본관 앞을 다 정리하면 사회과학관 쪽 길이 열린다 */
  private openPath(): void {
    this.stage = 'path';
    this.bounds = [this.world.yard, this.world.path, this.world.plaza];
    this.lower(this.world.barricade);
    this.world.arrows.visible = true;
    $('bossbox').classList.remove('on');
    this.showCard(0, this.recordArea(), '다음: 사회과학관 앞 — 오른쪽 길로 가세요 →');
    this.sound('open');
  }

  private enterPlaza(): void {
    this.stage = 'plaza';
    this.bounds = [this.world.plaza];
    this.world.arrows.visible = false;
    this.startWaves(1);
  }

  private showBossBar(name: string): void {
    $('bossname').textContent = name;
    $('bossbar').style.width = '0%';
    this.hudCache.delete('bossbar.width');
    this.hudCache.delete('bossprog');
    $('bossbox').classList.add('on');
  }

  /** 보스가 단계를 바꿀 때 띠 */
  banner(title: string, sub = ''): void {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.style.opacity = '1';
    this.bannerTimer = 2.4;
  }

  /** 맞힌 보스 주변의 남은 민원을 한꺼번에 정리 */
  private sweepMinions(): void {
    for (const e of this.enemies) {
      if (isBoss(e) || !e.targetable) continue;
      e.dead = true;
      e.die(ZERO, this);
      this.fx.mark(e.center, 1);
    }
    for (const s of this.sheets) {
      s.on = false;
      s.obj.visible = false;
    }
  }

  /** 사회과학관 앞을 정리하면 남동쪽 길(사회과학관 남쪽 끝을 돌아 인문과학관 앞)이 열린다 */
  private openHum(): void {
    const w = this.world;
    this.stage = 'path3';
    this.bounds = [w.plaza, ...w.path3, w.hum];
    this.lower(w.barricade3);
    w.arrows3.visible = true;
    $('bossbox').classList.remove('on');
    this.showCard(1, this.recordArea(), '다음: 인문과학관 앞 — 남동쪽 길로 가세요 ↘');
    this.sound('open');
  }

  private enterHum(): void {
    this.stage = 'hum';
    this.bounds = [this.world.hum];
    this.world.arrows3.visible = false;
    this.pile.clear();
    this.startWaves(2);
  }

  /** 인문과학관 앞을 정리하면 남쪽 국제학사 길이 열린다 */
  private openDorm(): void {
    const w = this.world;
    this.stage = 'path4';
    this.bounds = [w.hum, ...w.path4, w.dorm];
    this.lower(w.barricade4);
    w.arrows4.visible = true;
    $('bossbox').classList.remove('on');
    this.showCard(2, this.recordArea(), '다음: 국제학사 앞 — 남쪽 길로 가세요 ↓');
    this.sound('open');
  }

  private enterDorm(): void {
    this.stage = 'dorm';
    this.bounds = [this.world.dorm];
    this.world.arrows4.visible = false;
    this.startWaves(3);
  }

  /** 국제학사 앞을 정리하면 대운동장 동쪽 철망 문이 열린다. 부총장은 단상에서 기다린다 */
  private openField(): void {
    const w = this.world;
    this.stage = 'path5';
    this.bounds = [w.dorm, ...w.path5, w.field];
    this.lower(w.barricade5);
    w.arrows5.visible = true;
    $('bossbox').classList.remove('on');
    this.showCard(3, this.recordArea(), '다음: 대운동장 — 서쪽 철망 문으로 가세요 ←');
    this.sound('open');
    const m = new Meeting(this, this.people.meeting);
    this.placeBoss(m);
    this.waiting = m;
  }

  private enterField(): void {
    this.stage = 'field';
    this.bounds = [this.world.field];
    this.world.arrows2.visible = false;
    this.world.arrows5.visible = false;
    // 철망 문 안쪽에 간식 두 개
    this.spawnPickup(this.hp <= 6 ? 'donkatsu' : 'gimbap', 131, 63.5);
    this.spawnPickup('americano', 131, 68.5);
    this.startWaves(4);
  }

  /** 부총장 결재 뒤: 구역 카드 → 화면이 어두워졌다가 해 질 녘 본관 앞으로 */
  private leaveField(): void {
    this.stage = 'toFinal';
    $('bossbox').classList.remove('on');
    this.showCard(4, this.recordArea(), '다음: 해 질 녘 본관 앞 — 총장 결재');
    this.seqT = 2.6;
  }

  /** 어두운 동안 본관 앞(노을)으로 옮긴다. 총장은 본관 계단 앞에서 기다린다 */
  private setupFinal(): void {
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    this.boss = null;
    for (const p of this.pickups) this.scene.remove(p.obj);
    this.pickups = [];
    for (const s of this.sheets) {
      s.on = false;
      s.obj.visible = false;
    }
    this.hz.clear();
    this.fx.clear();
    this.stage = 'final';
    this.bounds = [this.world.yard];
    this.world.barricade.visible = true;
    this.world.barricade.position.y = 0;
    this.lowering = [];
    this.pos.set(0, EYE, 7);
    this.yaw = 0;
    this.pitch = 0.1;
    this.jumpY = 0;
    this.vy = 0;
    this.dusk = 1;
    this.rack.visible = true;
    this.placeBoss(new President(this, this.people.president));
    this.spawnPickup('gimbap', -6, -2);
    this.spawnPickup('americano', 6, -2);
    this.seqT = 1.2;
  }

  /** 총장 승인: 선 채로 "퇴근 승인"과 "월급 인상" 도장을 찍어 준다 */
  private presidentApproved(): void {
    this.stage = 'done';
    this.doneT = 7.2;
    this.recordArea();
    $('bossbox').classList.remove('on');
    this.buzz([60, 40, 120]);
  }

  /** 마지막 도장 하나 (1 = 퇴근 승인, 2 = 월급 인상) */
  private bigStamp(n: 1 | 2): void {
    const el = $(`stamp${n}`);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.sound(n === 1 ? 'offwork' : 'clear');
    this.flashT = 0.3;
    this.quake(0.6);
    const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fx.confetti(_v.set(this.pos.x, EYE + 3, this.pos.z).addScaledVector(fwd, 9), 90, 8, 0xffffff, 4, 0.8);
    this.fx.confetti(_v.set(this.pos.x, EYE + 3, this.pos.z).addScaledVector(fwd, 9), 40, 7, n === 1 ? 0xd0202f : 0x1d4ed8, 4, 0.8);
    this.buzz([40, 50, 40]);
  }

  private note(text: string, time = 1.4): void {
    const n = $('note');
    n.textContent = text;
    n.style.opacity = '1';
    this.noteTimer = time;
  }

  private hint(key: string, text?: string, time = 3.2): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const h = text ?? HINTS[key as Kind];
    if (h) this.note(h, time);
  }

  sound(name: SfxName, at?: THREE.Vector3, vol = 1): void {
    if (at) vol *= Math.max(0.15, 1 - at.distanceTo(this.eye) / 45);
    this.sfx.play(name, vol);
  }

  // ---------- 적 ----------

  private spawnPoint(out: THREE.Vector3, y: number): THREE.Vector3 {
    const side = Math.random() < 0.3;
    const a = areaOf(this.stage);
    if (a === 4) {
      const f = this.world.field;
      return out.set(f.minX + Math.random() * (f.maxX - f.minX), y, f.maxZ - Math.random() * 6);
    }
    if (a === 2) {
      // 인문과학관 쪽(동쪽) 또는 마당 남북 끝에서
      const h = this.world.hum;
      return side
        ? out.set(h.minX + 4 + Math.random() * (h.maxX - h.minX - 8), y, Math.random() < 0.5 ? h.minZ + 1 : h.maxZ - 1)
        : out.set(h.maxX - 5 + Math.random() * 4, y, h.minZ + 3 + Math.random() * (h.maxZ - h.minZ - 6));
    }
    if (a === 3) {
      // 국제학사 쪽(동쪽) 또는 남쪽 끝에서
      const d = this.world.dorm;
      return side
        ? out.set(d.minX + 3 + Math.random() * (d.maxX - d.minX - 6), y, d.maxZ - 1)
        : out.set(d.maxX - 5 + Math.random() * 4, y, d.minZ + 4 + Math.random() * (d.maxZ - d.minZ - 8));
    }
    if (a === 1) {
      return out.set(side ? 78 + Math.random() * 30 : 114 + Math.random() * 4, y, side ? (Math.random() < 0.5 ? -22 : 22) : -14 + Math.random() * 28);
    }
    // 본관 쪽(먼 곳) 또는 양옆에서 나온다
    const x = side ? (Math.random() < 0.5 ? -25 : 25) : -18 + Math.random() * 36;
    const z = side ? -10 + Math.random() * 20 : -17 + Math.random() * 3;
    return out.set(x, y, z);
  }

  /** few: 민원 차례가 없는 구역에 가끔 섞이는 새 잡몹 (알림 떼가 작다) */
  private spawnKind(kind: SpawnKind, few = false): void {
    if (kind === 'phone') {
      this.spawnPhone();
      return;
    }
    if (kind === 'mail' || kind === 'bulk') {
      this.enemies.push(new Mail(this, kind === 'bulk', this.spawnPoint(_v, 2.5 + Math.random() * 3.5)));
    } else if (kind === 'bubble') {
      // 말풍선 자리: 원래 말풍선 · 매달리는 말풍선 · 피하는 말풍선 (mobs.ts)
      this.enemies.push(this.mobs.bubble(this, this.spawnPoint(_v, 1.8 + Math.random() * 0.6)));
    } else if (kind === 'note' || kind === 'fax') {
      this.enemies.push(...this.mobs.spawn(kind, this, this.spawnPoint(_v, kind === 'fax' ? 0 : 2.5 + Math.random() * 1.5), few));
    } else {
      this.enemies.push(new Bomb(this, this.spawnPoint(_v, 1.4)));
    }
    this.hint(kind);
  }

  /** 플레이어가 서 있는 자리로 전화기가 떨어진다 */
  spawnPhone(): void {
    const a = this.area;
    const ang = Math.random() * Math.PI * 2;
    const off = Math.random() * 0.8;
    const x = Math.max(a.minX + 1, Math.min(a.maxX - 1, this.pos.x + Math.cos(ang) * off));
    const z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, this.pos.z + Math.sin(ang) * off));
    this.enemies.push(new Phone(this, x, z));
    this.hint('phone');
  }

  spawnAt(kind: 'mail' | 'bomb' | 'bubble', at: THREE.Vector3): Enemy {
    const e = kind === 'mail' ? new Mail(this, false, at) : kind === 'bubble' ? new Bubble(this, at) : new Bomb(this, at);
    this.enemies.push(e);
    if (kind !== 'mail') this.hint(kind);
    return e;
  }

  minions(): number {
    let n = 0;
    for (const e of this.enemies) if (e.targetable && !isBoss(e)) n++;
    return n;
  }

  private removeEnemy(e: Enemy): void {
    this.scene.remove(e.obj);
    e.dispose();
    this.downs.delete(e);
  }

  /** 맞힘·폭발·필살기 모두 여기로. 결과: 처리(kill) / 맞음(hit) / 무시(none) */
  damage(e: Enemy, dmg: number, src: DamageSrc): 'none' | 'hit' | 'kill' {
    if (!e.targetable) return 'none';
    if (e instanceof Bomb) {
      this.detonate(e, src !== 'fuse');
      return 'kill';
    }
    e.hp -= dmg;
    e.pop = 0.12;
    const dir = _dir.set(e.center.x - this.pos.x, 0, e.center.z - this.pos.z).normalize();
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      e.die(dir, this);
      this.onProcessed(e);
      return 'kill';
    }
    e.knock(dir);
    if (isBoss(e)) this.addSp(1.5);
    // 폭발·필살기로 진행돼도 결재판에 자국이 남는다 (도장은 stampHit에서)
    if (e instanceof PersonBoss && src !== 'stamp') e.stamped(false, this);
    return 'hit';
  }

  /** 서류 뭉치 폭발. byPlayer: 도장·연쇄로 터뜨렸으면 플레이어는 다치지 않는다 */
  detonate(b: Bomb, byPlayer: boolean): void {
    if (b.gone) return;
    const at = b.center.clone();
    b.explode();
    this.fx.blast(at, 4.6);
    this.fx.confetti(at, 40, 7);
    this.fx.ring(at.x, 0.06, at.z, 0.6, 4.6, 0.45, 0xffb347);
    this.fx.text(_v.copy(at).setY(at.y + 1), '펑! 마감!', '#ffb347', 0.7);
    this.sound('boom', at);
    this.quake(0.7, at);
    if (this.eye.distanceTo(at) < 12) this.buzz(50);
    if (byPlayer) this.onProcessed(b);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const reach = 4.6 + (isBoss(e) ? e.radius : 0.4);
      if (e.center.distanceTo(at) > reach) continue;
      if (e instanceof Bomb) {
        if (e.chainT < 0) {
          e.chainT = 0.16;
          e.chainBy = byPlayer;
        }
      } else {
        this.damage(e, isBoss(e) ? 5 : 3, byPlayer ? 'blast' : 'fuse');
      }
    }
    if (!byPlayer && this.eye.distanceTo(at) < 3.8) this.hurt(3, at, 'bomb', false);
  }

  private onProcessed(e: Enemy): void {
    // 인문과학관 앞에서 처리된 민원은 오검토 처장의 재검토 더미로
    if (this.mode === 'staff' && areaOf(this.stage) === 2) this.pile.add(e);
    this.counts[e.kind]++;
    this.processed++;
    this.addSp(SP_GAIN[e.kind]);
    this.sound('process', e.center);
    // 사람 보스 몸에는 "처리" 자국을 띄우지 않는다
    if (!isBoss(e)) this.fx.mark(e.center, e.kind === 'bulk' ? 1.6 : 1.2);
    if (this.mode === 'student') this.stu.processed(e);
    else if (e.kind === 'bulk') this.note('단체 메일 처리!');
    else if (e.kind === 'phone') this.fx.text(_v.copy(e.center).setY(e.center.y + 1.1), '네, 행정실입니다~', '#ffffff');
    else if (e.kind === 'bubble') {
      this.fx.text(_v.copy(e.center).setY(e.center.y + 0.9), '펑!', '#ffffff', 0.7);
      this.fx.confetti(e.center, 16, 4, 0xffffff, 1.5);
      this.sound('pop', e.center);
    }
    if (e instanceof PersonBoss) {
      this.bossApproved(e);
      return;
    }
    this.maybeDrop(e.center, e.kind);
  }

  private addSp(n: number): void {
    const was = this.sp;
    this.sp = Math.min(SP_MAX, this.sp + n);
    if (was < SP_MAX && this.sp >= SP_MAX && !this.spReadyShown) {
      this.spReadyShown = true;
      this.note(TOUCH ? '필살기 준비 완료 — 노란 버튼' : '필살기 준비 완료 — Q', 2);
    }
  }

  // ---------- 줍는 물건 ----------

  private maybeDrop(at: THREE.Vector3, kind: Kind): void {
    // Boo 호출 벨: 다른 물건 쿨타임과 따로 1.5% (2구역부터, 한 판 두 번, 하나만 — boo.ts)
    if (this.boo.tryDrop(at)) return;
    if (this.dropCd > 0) return;
    let chance = 0.15 + this.diff.drop;
    if (this.hp <= 4) chance += 0.15;
    if (kind === 'bulk' || kind === 'bomb') chance += 0.1;
    // 음식은 이제 상자에서도 나오므로 민원이 떨어뜨리는 것은 절반쯤으로
    if (Math.random() > chance * 0.5) return;
    this.dropCd = 7;
    const r = Math.random();
    const perk = Math.random();
    // 가끔 보조배터리 (필살기 게이지가 다 찼으면 음식).
    // 체력이 넉넉하면 가끔 연차 쿠폰(공결 확인서)·셔틀버스 시간표·단톡방 공지 캡처·인감 도장(출석 스티커) (위급할 때는 음식)
    const food: FoodKind =
      this.sp < SP_MAX - 10 && Math.random() < 0.2
        ? 'battery'
        : this.hp > 4 && perk < PERK_SHARE * PERKS.length
          ? PERKS[Math.floor(perk / PERK_SHARE)]
          : this.hp <= 4
            ? r < 0.5
              ? 'donkatsu'
              : 'gimbap'
            : r < 0.45
              ? 'gimbap'
              : r < 0.75
                ? 'americano'
                : 'donkatsu';
    const spot = this.freeSpot(at.x, at.z);
    this.spawnPickup(food, spot.x, spot.z);
  }

  /** 걸어서 닿을 수 있는 자리로: 구역 안, 화단·가로등 같은 장애물 밖 */
  private freeSpot(x: number, z: number): { x: number; z: number } {
    const a = this.area;
    const M = 0.6;
    for (let it = 0; it < 3; it++) {
      x = Math.max(a.minX + 1, Math.min(a.maxX - 1, x));
      z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, z));
      for (const o of this.world.obstacles) {
        if (x <= o.minX - M || x >= o.maxX + M || z <= o.minZ - M || z >= o.maxZ + M) continue;
        // 가장 가까운 변 밖으로 민다 (구역 밖으로 나가는 쪽은 피한다)
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

  /** full: 자판기 치킨돈가스 (체력 모두 회복, vending.ts) */
  spawnPickup(kind: FoodKind, x: number, z: number, full = false): void {
    const { obj, item } = this.models.food(kind, this.mode === 'student');
    if (full) dressFull(obj, item, this.models);
    obj.position.set(x, 0.05, z);
    this.scene.add(obj);
    this.pickups.push({ kind, obj, item, ttl: kind === 'americano' || this.stage === 'yard' || this.stage === 'path' ? 15 : 40, t: Math.random() * 6, full });
  }

  private updatePickups(dt: number): void {
    let n = 0;
    for (const p of this.pickups) {
      p.t += dt;
      p.ttl -= dt;
      p.item.position.y = 0.55 + Math.sin(p.t * 3) * 0.12;
      p.item.rotation.y += dt * 1.6;
      p.obj.visible = p.ttl > 3 || Math.floor(p.ttl * 8) % 2 === 0;
      const near = Math.hypot(this.pos.x - p.obj.position.x, this.pos.z - p.obj.position.z) < 1.3 && this.jumpY < 1;
      if (near) this.collect(p);
      if (near || p.ttl <= 0) {
        this.scene.remove(p.obj);
        continue;
      }
      this.pickups[n++] = p;
    }
    this.pickups.length = n;
  }

  private collect(p: Pickup): void {
    if (p.full) {
      // 자판기 치킨돈가스 (vending.ts)
      this.hp = MAX_HP;
      this.note('학식 치킨돈가스! 체력 모두 회복');
    } else if (p.kind === 'boo') {
      // Boo 호출 벨: 보관했다가 G(터치: Boo 버튼)로 쓴다 (boo.ts)
      this.boo.give();
    } else if (p.kind === 'ticket' && this.mode === 'staff') {
      // 교직원: 식권은 모아서 자판기에 넣는다 (vending.ts). 체력 회복 없음
      this.vend.addTicket();
    } else if (p.kind === 'donkatsu') {
      this.hp = Math.min(MAX_HP, this.hp + 4);
      this.note('학식 돈가스! 체력 +4');
    } else if (p.kind === 'gimbap') {
      this.hp = Math.min(MAX_HP, this.hp + 2);
      this.note('삼각김밥! 체력 +2');
    } else if (p.kind === 'ticket') {
      this.hp = MAX_HP;
      this.note('식권! 체력 모두 회복');
    } else if (p.kind === 'battery') {
      this.addSp(SP_MAX * 0.5);
      this.note('보조배터리! 필살기 게이지 +50');
    } else if (p.kind === 'shield') {
      this.shieldT = SHIELD_T;
      this.note(this.mode === 'student' ? '공결 확인서! 다음 한 번은 안 맞아요' : '연차 쿠폰! 다음 한 번은 안 맞아요', 2);
    } else if (p.kind === 'shuttle') {
      this.shuttleT = SHUTTLE_T;
      this.note('셔틀버스 시간표! 10초 동안 빨라져요', 2);
    } else if (p.kind === 'capture') {
      this.freezeMobs(CAPTURE_T);
      this.note('단톡방 공지 캡처! 잡몹이 잠깐 멈춰요', 2);
    } else if (p.kind === 'seal') {
      this.sealT = SEAL_T;
      this.note(this.mode === 'student' ? '출석 스티커! 8초 동안 서류가 넘어뜨려요' : '인감 도장! 8초 동안 도장이 넘어뜨려요', 2);
    } else {
      this.buffT = BUFF_T;
      this.note(this.mode === 'student' ? '아메리카노! 공격 속도 UP' : '아메리카노! 8초 동안 도장을 빨리 던집니다');
    }
    this.sound('pickup');
    this.fx.confetti(_v.set(p.obj.position.x, 0.8, p.obj.position.z), 12, 3, 0xf5c542, 2, 0.7);
  }

  // ---------- 단톡방 공지 캡처: 잡몹 멈춤 ----------

  /** 살아 있는 잡몹을 모두 sec초 멈춘다 (사람 보스·창구 직원·박반려 처장의 서류 탑은 그대로). 멈춘 수 */
  freezeMobs(sec: number): number {
    let n = 0;
    for (const e of this.enemies) {
      if (!e.targetable || isBoss(e) || e instanceof DocTower || e.pinned) continue;
      const had = this.frozen.get(e);
      if (had) {
        had.t = Math.max(had.t, sec);
        n++;
        continue;
      }
      const shell = new THREE.Mesh(this.frostGeo, this.frostMat);
      shell.scale.setScalar(e.radius * 1.15);
      const mark = this.models.label('…', '#9fd3ff');
      mark.scale.multiplyScalar(1.4);
      this.scene.add(shell, mark);
      this.frozen.set(e, { t: sec, off: e.center.clone().sub(e.obj.position), shell, mark });
      n++;
    }
    if (n > 0) {
      this.sound('tick', undefined, 0.8);
      this.fx.ring(this.pos.x, 0.08, this.pos.z, 1, 28, 0.6, 0x9fd3ff);
    }
    return n;
  }

  /** 멈춘 잡몹이면 이번 단계는 움직이지 않는다 (맞아서 밀린 자리만 따라간다). 풀린 것은 치운다 */
  private holdFrozen(e: Enemy): boolean {
    const f = this.frozen.get(e);
    if (!f) return false;
    // 처리됐거나, 옆 폭발이 옮겨붙은 서류 뭉치는 바로 풀린다
    if (f.t <= 0 || e.dead || e.gone || (e instanceof Bomb && e.chainT >= 0)) {
      this.thaw(e, f);
      return false;
    }
    e.center.copy(e.obj.position).add(f.off);
    return true;
  }

  private thaw(e: Enemy, f: Frost): void {
    this.scene.remove(f.shell, f.mark);
    this.frozen.delete(e);
  }

  /** 멈춤 시간을 줄이고 표시를 옮긴다 (판을 치워 장면에서 빠진 적도 여기서 정리된다) */
  private updateFrost(dt: number): void {
    for (const [e, f] of this.frozen) {
      f.t -= dt;
      if (f.t <= 0 || e.dead || e.gone || !e.obj.parent) {
        this.thaw(e, f);
        continue;
      }
      f.shell.position.copy(e.center);
      f.shell.rotation.y += dt * 0.6;
      f.mark.position.set(e.center.x, e.center.y + e.radius + 0.45, e.center.z);
      f.mark.material.opacity = 0.6 + Math.sin(f.t * 8) * 0.4;
    }
  }

  // ---------- 인감 도장(출석 스티커): 잡몹 넘어뜨리기 ----------

  /**
   * 기본 공격에 맞고 남은 잡몹을 넘어뜨린다. 사람(보스·창구 직원)·박반려 처장의 서류 탑·서류 뭉치(맞으면 터진다)는 빼고,
   * 아직 하늘에서 떨어지는 중인 전화기·결석 도장, 화면에 매달린 말풍선도 뺀다 (그림자 자리에 떨어져야 한다). 이미 넘어져 있으면 그대로.
   * from: 밀어내는 자리 (기본은 플레이어, 도장이 맞은 자리 둘레는 그 자리 — sealHit)
   */
  private knockDown(e: Enemy, from: THREE.Vector3 = this.pos): void {
    if (!e.targetable || isBoss(e) || e instanceof DocTower || e instanceof Bomb || e.pinned || this.downs.has(e)) return;
    if ((e as { landing?: THREE.Vector3 | null }).landing) return;
    const o = e.obj;
    const dir = new THREE.Vector3(e.center.x - from.x, 0, e.center.z - from.z);
    if (dir.lengthSq() < 1e-4) dir.set(e.center.x - this.pos.x, 0, e.center.z - this.pos.z);
    if (dir.lengthSq() < 1e-6) dir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    dir.normalize();
    // 맞아서 부푼 크기는 그대로 두지 않는다 (넘어진 동안 몸 움직임을 건너뛴다)
    e.pop = 0;
    o.scale.setScalar(e.baseScale);
    this.downs.set(e, {
      t: 0,
      dir,
      axis: new THREE.Vector3(dir.z, 0, -dir.x),
      q0: o.quaternion.clone(),
      pos0: o.position.clone(),
      // 맞는 점은 맞고 밀리기(knock) 전 자리라서 높이만 쓴다 (모든 잡몹의 맞는 점은 몸 원점 바로 위)
      off: new THREE.Vector3(0, e.center.y - o.position.y, 0),
      ground: e.kind === 'phone' || o.position.y < 0.5,
    });
    this.sound('boom', e.center, 0.3);
    this.fx.ring(e.center.x, 0.06, e.center.z, 0.3, 1.8, 0.35, 0xc8202f);
  }

  /** 넘어진 잡몹이면 이번 단계는 넘어지는 동작만 하고 true. 다 일어났거나 처리된 것은 놓아 준다 */
  private holdDown(e: Enemy, dt: number): boolean {
    const d = this.downs.get(e);
    if (!d) return false;
    if (e.dead || e.gone) {
      // 넘어진 채로 처리됐다: 그 자세에서 처리 연출을 잇는다
      this.downs.delete(e);
      return false;
    }
    d.t = Math.min(DOWN_T, d.t + dt);
    const t = d.t;
    const PI = Math.PI;
    // 뒤로 넘어짐(0~0.22초) → 한 바퀴 뒹굴기(~0.62) → 누운 채 흔들(~0.9) → 다시 섬(~1.2)
    let th: number;
    let hop = 0;
    if (t < 0.22) {
      const k = t / 0.22;
      th = (PI / 2) * (1 - (1 - k) * (1 - k));
      hop = Math.sin(PI * k) * 0.3;
    } else if (t < 0.62) {
      const k = (t - 0.22) / 0.4;
      th = PI / 2 + PI * 2 * k * k * (3 - 2 * k);
    } else if (t < 0.9) {
      const k = (t - 0.62) / 0.28;
      th = PI * 2.5 + Math.sin(k * PI * 4) * 0.12 * (1 - k);
    } else {
      // 살짝 넘치며 일어선다
      const k = (t - 0.9) / (DOWN_T - 0.9);
      const back = 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
      th = PI * 2.5 - (PI / 2) * back;
      hop = Math.sin(PI * k) * 0.15;
    }
    const s = DOWN_SLIDE * (1 - (1 - Math.min(1, t / 0.6)) ** 3);
    const a = this.area;
    const px = Math.max(a.minX - 2, Math.min(a.maxX + 2, d.pos0.x + d.off.x + d.dir.x * s));
    const pz = Math.max(a.minZ - 2, Math.min(a.maxZ + 2, d.pos0.z + d.off.z + d.dir.z * s));
    let py: number;
    if (d.ground) {
      // 바닥 것: 누우면 몸 중심이 낮아진다 (뒹굴 때는 모서리로 섰다 누웠다)
      const lie = Math.min(d.off.y, 0.35);
      py = d.pos0.y * Math.max(0, 1 - t / 0.22) + d.off.y * Math.abs(Math.cos(th)) + lie * Math.abs(Math.sin(th)) + hop;
    } else {
      // 날던 것: 공중에서 뒤로 뒹굴며 조금 가라앉았다가 제 높이로
      py = Math.max(0.9, d.pos0.y + d.off.y - Math.sin((PI * t) / DOWN_T) * 0.7);
    }
    const o = e.obj;
    _dq.setFromAxisAngle(d.axis, th);
    o.quaternion.copy(_dq).multiply(d.q0);
    o.position.set(px, py, pz).sub(_dv.copy(d.off).applyQuaternion(_dq));
    e.center.set(px, py, pz);
    if (t < DOWN_T) return true;
    // 다시 섰다: 넘어지기 전 자세로 밀려난 자리에서 하던 일을 잇는다
    o.quaternion.copy(d.q0);
    this.downs.delete(e);
    return false;
  }

  // ---------- 필살기: 전체 공지 발송 (교직원은 고른 업무 스킬, staffskills.ts) ----------

  special(): void {
    if (this.phase !== 'play' || this.sp < SP_MAX) return;
    const s = this.stage;
    if (s !== 'yard' && s !== 'yardBoss' && s !== 'plaza' && s !== 'hum' && s !== 'dorm' && s !== 'field' && s !== 'final') return;
    this.sp = 0;
    this.spReadyShown = false;
    this.sound('special');
    // 학생 모드: 고른 외국어 주문 (효과는 같다). 교직원 모드: 고른 업무 스킬 (2D와 같은 띠)
    const skill = this.pick.skill;
    if (this.mode === 'student') this.stu.castSpell();
    else this.banner(skill.banner, skill.sub);
    const col = this.mode === 'student' ? this.stu.spellColor : 0xf5c542;
    this.flashT = 0.45;
    if (!this.settings.calm) this.fovKick = 1;
    this.swing = 1;
    const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (this.mode === 'staff' && skill.id !== 'notice') {
      // 일괄 처리·규정집 낙하·내선 돌리기 (맞는 규칙은 전체 공지 발송과 같다: noticeT → noticeHit)
      this.skills.cast(skill.id, fwd);
    } else {
      this.fx.spray(_v.set(this.pos.x, EYE - 0.1, this.pos.z).addScaledVector(fwd, 3.5), fwd, 110, 30, 1.2, col);
      this.fx.ring(this.pos.x, 0.08, this.pos.z, 1, 36, 0.8, col);
      for (const e of this.enemies) {
        if (!e.targetable) continue;
        const dx = e.center.x - this.pos.x;
        const dz = e.center.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 50) continue;
        const cos = d > 0.01 ? (dx * fwd.x + dz * fwd.z) / d : 1;
        if (cos < 0.34 && d > 3.5) continue;
        e.noticeT = 0.05 + d / 45;
      }
    }
    for (const s of this.sheets) {
      if (!s.on) continue;
      s.on = false;
      s.obj.visible = false;
      this.fx.confetti(s.obj.position, 3, 3);
    }
  }

  private noticeHit(e: Enemy): void {
    if (!e.targetable) return;
    if (e instanceof PersonBoss) {
      // 전체 공지도 결재판으로 (몸에 자국을 남기지 않는다)
      this.damage(e, 8, 'special');
      return;
    }
    this.fx.mark(e.center, 1.3);
    if (e instanceof Bomb) {
      e.dead = true;
      e.die();
      this.onProcessed(e);
    } else {
      this.damage(e, 99, 'special');
    }
  }

  /**
   * 빗자루·쓰레기통 폭탄(sidejob.ts)이 맞았다: 잡몹은 처리(서류 뭉치는 터뜨리지 않고 처리 — noticeHit과 같다),
   * 보스(사람)는 다치지 않고 도장 몸통 stamps발만큼 결재 진행만
   */
  private itemHit(e: Enemy, stamps: number): void {
    if (!e.targetable) return;
    if (isBoss(e)) this.damage(e, BODY_DMG * stamps, 'special');
    else this.noticeHit(e);
  }

  // ---------- 플레이어 ----------

  hurt(dmg: number, from: THREE.Vector3, kind: HurtKind = 'mail', close = true): void {
    if (this.invuln > 0 || this.phase !== 'play' || this.stage === 'done') return;
    // 연차 쿠폰(공결 확인서): 다음 한 번은 통째로 막는다 (피해·느려짐·흔들림 없음)
    if (this.shieldT > 0) {
      this.shieldT = 0;
      this.invuln = SHIELD_GRACE;
      this.note(this.mode === 'student' ? '공결 확인서로 막음!' : '연차 쿠폰으로 막음!');
      this.sound('pop');
      this.fx.ring(this.pos.x, 0.1, this.pos.z, 0.5, 2.6, 0.4, 0x9fd3ff);
      this.buzz(20);
      return;
    }
    dmg *= this.diff.damage;
    // 보스(사람) 가까이에서 보스 공격에 맞으면 더 아프다 (달려오기 부딪힘은 따로 4 — bossmove.ts RUSH_DMG, 이 배율은 안 곱한다)
    if (close && this.closeBossHit(from, kind)) dmg *= CLOSE_MUL;
    // 한 방에 쓰러질 피해면 이 구역 조력자를 그때 굴린다: 오면 체력 1로 버티고 조력자가 먼저 온다
    const save = this.hp - dmg <= 0.001 && this.rescueReady() && this.rescue.roll(this.rescueKey());
    this.hp = save ? 1 : Math.max(0, this.hp - dmg);
    this.damageTaken += dmg;
    this.invuln = 0.6;
    this.calmT = 0;
    this.slow = 1.2;
    this.note((this.mode === 'student' ? this.stu.hurtNote(kind) : undefined) ?? HURT_NOTE[kind] ?? '(느려짐)');
    const v = $('vignette');
    v.style.opacity = this.settings.calm ? '0.45' : '1';
    setTimeout(() => (v.style.opacity = '0'), 160);
    this.sound('hurt');
    const big = kind === 'wave' || kind === 'bomb' || kind === 'bigstamp';
    this.quake(big ? 0.8 : 0.4);
    this.buzz(big ? 70 : 40);
    // 맞은 방향 표시 (가장 오래된 것을 다시 쓴다)
    let d = this.dirs[0];
    for (const x of this.dirs) if (x.t < d.t) d = x;
    d.from.copy(from);
    d.t = 1.1;
    if (this.hp <= 0.001) {
      this.hp = 0;
      this.gameOver();
      return;
    }
    if (save) this.beginRescue();
    else if (this.hp <= MAX_HP * RESCUE_HP) {
      this.rescueDue = true;
      this.tryRescue();
    }
  }

  /** 보스(사람·창구 직원)가 CLOSE_R 안에 있고, 맞은 것이 보스 공격이면 true */
  private closeBossHit(from: THREE.Vector3, kind: HurtKind): boolean {
    const b = this.boss;
    if (!b || b.dead || b.state === 'sleep' || kind === 'boss') return false;
    const o = b.obj.position;
    if (Math.hypot(o.x - this.pos.x, o.z - this.pos.z) > CLOSE_R) return false;
    if (BOSS_HURT.has(kind)) return true;
    // 그 밖의 것(마감 폭발 등)은 보스 몸 가까이서 왔을 때만
    return Math.hypot(from.x - o.x, from.z - o.z) < 1.8;
  }

  // ---------- 조력자 · 무기 ----------

  /** 조력자 구역 열쇠: 교직원은 areaOf, 학생은 stu.areaNo (구역이 늘어도 번호로 나뉜다) */
  private rescueKey(): string {
    return `${this.mode}:${this.mode === 'student' ? this.stu.areaNo : areaOf(this.stage)}`;
  }

  /** 구역 카드·화면 전환·엔딩 중 (조력자는 끝난 뒤에 온다) */
  private rescueHeld(): boolean {
    if (this.stage === 'done') return true;
    if (this.mode === 'student') return this.stu.busy;
    return this.cardT > 0 || this.seqT > 0 || this.stage === 'toFinal';
  }

  /** 지금 이 구역 조력자를 바로 부를 수 있다 */
  private rescueReady(): boolean {
    return this.phase === 'play' && !this.rescueHeld() && this.rescue.canStart(this.rescueKey());
  }

  /**
   * 체력 30% 이하: 구역마다 한 번 굴린다 — 1·2구역에서 동료·친구를 구했으면 50%, 못 구했으면 5% (helpers.ts Rescue.roll).
   * 카드·화면 전환 중이면 기다렸다가 끝나면 굴린다 (그 사이 체력이 30%를 넘으면 취소). Game.hurt·step이 부른다
   */
  private tryRescue(): void {
    if (this.hp <= 0 || this.hp > MAX_HP * RESCUE_HP || !this.rescue.canStart(this.rescueKey())) {
      this.rescueDue = false;
      return;
    }
    if (!this.rescueReady()) return;
    this.rescueDue = false;
    if (this.rescue.roll(this.rescueKey())) this.beginRescue();
  }

  /** 조력자 출발: 뛰어 들어오는 동안은 맞지 않는다 (도착하면 2초 무적) */
  private beginRescue(): void {
    this.invuln = Math.max(this.invuln, 1.4);
    this.rescue.start(this.rescueKey());
  }

  /** 조력자 도착: 잡몹 모두 처리, 체력 +35%, 2초 무적, 사람 보스·창구 직원은 진행 +10% (5%는 남긴다) */
  private rescueHit(): void {
    for (const e of this.enemies) {
      // 박반려 처장의 서류 탑은 보스 기믹이라 그대로 둔다
      if (!e.targetable || isBoss(e) || e instanceof DocTower) continue;
      this.fx.mark(e.center, 1.3);
      if (e instanceof Bomb) {
        e.dead = true;
        e.die();
        this.onProcessed(e);
      } else this.damage(e, 99, 'special');
    }
    this.hp = Math.min(MAX_HP, this.hp + MAX_HP * 0.35);
    this.invuln = Math.max(this.invuln, 2);
    const b = this.boss;
    if (b && !b.dead && b.state !== 'sleep') {
      const floor = b.maxHp * 0.05;
      if (b.hp > floor) {
        b.hp = Math.max(floor, b.hp - b.maxHp * 0.1);
        b.person.stampMark(true);
        this.fx.confetti(b.person.clipCenter, 12, 2.4, 0xf5c542, 1, 0.5);
      }
    }
    this.sound('special', undefined, 0.6);
    this.buzz([30, 30, 60]);
  }

  /** 무기를 손에 든다 (경비원·도서 무인 대출기) */
  equip(id: ArmId): void {
    const student = this.mode === 'student';
    const a = ARMS[id];
    this.arms.equip(id, student);
    this.cooldown = 0;
    this.note(`${armName(id, student)} 획득! ${a.perk} ${a.uses}회`, 2.2);
    this.sound('pickup');
  }

  /** 잠깐 멈춤 (강의실 열쇠·"보고해!"): 움직이지도 던지지도 못한다. 이미 멈춰 있으면 false. exact: 난이도로 줄이지 않는다 (예산팀 직원) */
  freeze(sec: number, text: string, exact = false): boolean {
    // Boo가 들고 나는 동안은 멈추지 않는다 (boo.ts)
    if (this.freezeT > 0 || this.phase !== 'play' || this.stage === 'done' || this.boo.carrying) return false;
    // 초보는 짧게
    this.freezeT = exact ? sec : sec * Math.min(1, 0.45 + this.diff.speed * 0.55);
    this.note(text, this.freezeT + 0.4);
    this.sound('hurt', undefined, 0.5);
    this.buzz(30);
    return true;
  }

  /** 달려온 보스와 부딪혔다: (dx, dz)만큼 밀리고 slow초 이상 느려진다 (bossmove.ts가 몇 프레임에 나눠 부른다) */
  shove(dx: number, dz: number, slow: number): void {
    if (this.phase !== 'play' || this.stage === 'done' || this.boo.carrying) return;
    this.pos.x += dx;
    this.pos.z += dz;
    this.clampToBounds();
    for (const o of this.world.obstacles) this.pushOut(o);
    for (const o of this.props.solids) this.pushOut(o);
    this.slow = Math.max(this.slow, slow);
  }

  jump(): void {
    if (this.phase !== 'play' || this.freezeT > 0 || this.boo.carrying) return;
    if (this.jumpY > 0 || this.vy !== 0) {
      // 땅에 닿기 직전에 누른 것은 닿자마자 뛴다
      this.jumpBuf = 0.15;
      return;
    }
    this.vy = JUMP_V;
    this.jumps++;
    this.sound('jump', undefined, 0.7);
  }

  fire(): void {
    if (this.cooldown > 0 || this.phase !== 'play' || this.freezeT > 0) return;
    // 손에 든 무기가 있으면 그 무기를 던진다 (arms.ts)
    const arm = this.arms.def;
    const fast = this.buffT > 0;
    this.curCd = arm ? (fast ? arm.cdFast : arm.cd) : fast ? FIRE_CD_FAST : FIRE_CD;
    this.cooldown = this.curCd;
    this.swing = 1;
    this.thrown++;
    this.sound('throw', undefined, arm ? 0.65 : 0.8);
    if (this.swat()) return;
    // 렌더 전에 불려도 맞도록 카메라 행렬 대신 yaw/pitch로 방향을 만든다
    _q.setFromEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'));
    const dir = _dir.set(0, 0, -1).applyQuaternion(_q);
    const start = _v.set(0.3, -0.25, -0.5).applyQuaternion(_q).add(_w.set(this.pos.x, EYE + this.jumpY, this.pos.z));
    const speed = arm ? arm.speed : STAMP_SPEED;
    const grav = arm ? arm.grav : 5;
    const lift = arm ? arm.lift : 0.8;
    const cone = TOUCH && this.settings.assist ? Math.max(0.14, this.diff.assist) : this.diff.assist;
    if (cone > 0) this.aimAssist(start, dir, cone, speed, grav, lift);
    const student = this.mode === 'student';
    const key = arm ? `${arm.id}:${student ? 1 : 0}` : 'stamp';
    let s = this.stamps.find((x) => !x.on && x.key === key);
    if (!s) {
      const obj = arm ? this.arms.model(arm.id, student) : this.models.stamp();
      s = { obj, vel: new THREE.Vector3(), life: 0, on: false, key, arm: null, seen: new Set(), scored: false, back: false, t: 0 };
      this.scene.add(s.obj);
      this.stamps.push(s);
    }
    s.on = true;
    s.obj.visible = true;
    if (!arm) this.stu.dress(s.obj);
    s.arm = arm;
    s.seen.clear();
    s.scored = false;
    s.back = false;
    s.t = 0;
    s.obj.position.copy(start);
    s.obj.rotation.set(0, this.yaw, 0);
    s.vel.copy(dir).multiplyScalar(speed);
    s.vel.y += lift;
    s.life = arm ? arm.life : 1.6;
    if (arm) {
      const out = this.arms.spend();
      if (out) this.note(`${out} 끝! 다시 ${student ? '서류로' : '도장으로'}`, 1.6);
    }
  }

  /** 화면에 매달린 말풍선이 있으면 던지기가 조준 없이 그 말풍선에 맞는다 (mobs.ts — 두 번이면 떨어진다). 맞혔으면 true */
  private swat(): boolean {
    const cl = this.mobs.clinger;
    if (!cl || !cl.targetable) return false;
    this.hits++;
    this.sound('hit');
    const r = this.damage(cl, 1, 'stamp');
    if (this.sealT > 0) this.sealHit(cl, cl.center, r);
    this.hitMarker(r === 'kill');
    return true;
  }

  /**
   * 조준점 가까이(cone 라디안 안)의 적이 있으면 도장 방향을 살짝 그쪽으로 꺾는다. 터치는 설정, PC는 초보·중급에서.
   * speed·grav·lift: 던지는 것의 빠르기와 낙차 (무기마다 다르다)
   */
  private aimAssist(start: THREE.Vector3, dir: THREE.Vector3, cone: number, speed = STAMP_SPEED, grav = 5, lift = 0.8): void {
    let best: THREE.Vector3 | null = null;
    let bestCos = Math.cos(cone);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      // 사람 보스는 결재판을 들고 있으면 결재판을 노린다
      const c = e instanceof PersonBoss && e.open ? e.weakPoint : e.center;
      const tx = c.x - start.x;
      const ty = c.y - start.y;
      const tz = c.z - start.z;
      const d = Math.hypot(tx, ty, tz);
      if (d > 45 || d < 0.5) continue;
      const cs = (tx * dir.x + ty * dir.y + tz * dir.z) / d;
      if (cs > bestCos) {
        bestCos = cs;
        best = c;
      }
    }
    if (!best) return;
    const d = best.distanceTo(start);
    const t = d / speed;
    dir.set(best.x - start.x, best.y + 0.5 * grav * t * t - lift * t - start.y, best.z - start.z).normalize();
  }

  private updateStamps(dt: number): void {
    for (const s of this.stamps) {
      if (!s.on) continue;
      s.life -= dt;
      s.t += dt;
      const a = s.arm;
      const p = s.obj.position;
      // 꿰뚫는 무기·부메랑은 맞혀도 멈추지 않는다 (한 번 맞힌 것은 seen에 둔다)
      const pass = !!a && (a.pierce || a.boomerang);
      if (a?.boomerang) {
        if (!s.back && s.t >= BOOMERANG_TURN) {
          // 돌아선다: 오는 길에 다시 맞힐 수 있다
          s.back = true;
          s.seen.clear();
        }
        if (s.back) {
          const to = _r.set(this.pos.x, EYE - 0.3 + this.jumpY, this.pos.z).sub(p);
          const d = to.length();
          if (d < 1.1) s.life = 0;
          else s.vel.lerp(to.multiplyScalar(a.speed * 1.1 / d), Math.min(1, dt * 7));
        } else s.vel.multiplyScalar(1 - dt * 0.8);
      } else s.vel.y -= (a ? a.grav : 5) * dt;
      // 빠르게 날아가므로 두 번 나눠 움직이며 맞았는지 본다
      for (let k = 0; k < 2 && s.life > 0; k++) {
        const prev = _prev.copy(p);
        p.addScaledVector(s.vel, dt / 2);
        for (const e of this.enemies) {
          if (!e.targetable || (pass && s.seen.has(e))) continue;
          if (e instanceof PersonBoss) {
            const h = e.hitTest(prev, p);
            if (h === 0) continue;
            const reflected = this.stampHit(e, p, h === 2, s);
            if (pass && !reflected) {
              s.seen.add(e);
              continue;
            }
            s.life = 0;
            break;
          }
          if (p.distanceTo(e.center) < e.radius + 0.28 + (a ? a.reach : 0)) {
            this.stampHit(e, p, false, s);
            if (pass) {
              s.seen.add(e);
              continue;
            }
            s.life = 0;
            break;
          }
        }
        if (s.life <= 0) break;
        for (const sh of this.sheets) {
          if (sh.on && p.distanceTo(sh.obj.position) < SHEET_R[sh.kind][0] + (a ? a.reach : 0)) {
            sh.on = false;
            sh.obj.visible = false;
            if (!s.scored) {
              s.scored = true;
              this.hits++;
            }
            this.hitMarker(false);
            this.fx.confetti(sh.obj.position, sh.kind === 'paper' ? 6 : 10, 3, sh.kind === 'packet' ? 0x5ee0ff : 0xffffff);
            this.sound('pop', sh.obj.position, 0.6);
            if (pass) continue;
            s.life = 0;
            break;
          }
        }
        if (s.life <= 0) break;
        // 경비원·대출기(막힌다)와 부수는 상자
        const ph = this.props.stampHit(p, a ? a.power : 1, s.seen);
        if (ph === 'stop' || (ph === 'hit' && !pass)) {
          s.life = 0;
          break;
        }
        // 예산팀 직원(튕겨 나간다, 다치지 않는다)·자판기
        if (this.budget.stampHit(p, s.obj, s.vel) || this.vend.stampHit(p)) {
          s.life = 0;
          break;
        }
      }
      if (a) this.arms.spin(s.obj, s.vel, a, dt);
      else if (this.mode === 'student') this.stu.orient(s.obj, s.vel);
      else s.obj.rotation.x += dt * 14;
      // 부메랑은 바닥을 스치듯 난다
      if (a?.boomerang && p.y < 0.3) {
        p.y = 0.3;
        if (s.vel.y < 0) s.vel.y = 0;
      }
      if (p.y < 0.08 && s.life > 0) {
        s.life = 0;
        this.fx.decal(p.x, p.z);
        // 바닥의 전화기는 발치에 떨어져도 받는다
        for (const e of this.enemies) {
          if (e.targetable && e.kind === 'phone' && e.obj.position.y < 0.5 && Math.hypot(p.x - e.center.x, p.z - e.center.z) < 1.0 + (s.arm ? s.arm.reach : 0)) {
            this.stampHit(e, p, false, s);
            break;
          }
        }
      }
      if (s.life <= 0) {
        s.on = false;
        s.obj.visible = false;
      }
    }
  }

  /**
   * 도장(무기)이 맞았다. s: 던진 것 (무기 배율, 명중률은 한 번 던진 것을 한 번만 센다).
   * 돌려주는 값: 반사반사 부총장이 되받아쳤으면 true (꿰뚫는 무기도 거기서 멈춘다)
   */
  private stampHit(e: Enemy, at: THREE.Vector3, weak = false, s?: Stamp): boolean {
    if (!s || !s.scored) {
      this.hits++;
      if (s) s.scored = true;
    }
    const k = s?.arm ? s.arm.power : 1;
    let reflected = false;
    if (e instanceof PersonBoss) {
      // 사람은 다치지 않는다: 결재판에 도장 자국과 반짝임만
      const before = e.hp;
      e.stamped(weak, this);
      // 반사(학생 모드 반사반사 부총장)면 무거운 무기도 진행되지 않는다
      reflected = e.hp > before;
      this.sound(weak ? 'weak' : 'process', e.weakPoint, weak ? 1 : 0.5);
      if (weak) {
        this.weakHits++;
        this.fx.text(_v.copy(e.weakPoint).setY(e.weakPoint.y + 0.7), '결재판!', '#ffe066', 0.6);
        this.buzz(15);
      }
    } else {
      this.fx.mark(at, 0.8);
      this.sound('hit', at);
    }
    const base = weak ? WEAK_DMG : e instanceof PersonBoss ? BODY_DMG : 1;
    const r = this.damage(e, reflected ? base : base * k, 'stamp');
    // 인감 도장(출석 스티커): 기본 공격(도장·서류)이 잡몹을 넘어뜨리고 굴린다 (무기는 아니다, seal.ts)
    if (this.sealT > 0 && !s?.arm) this.sealHit(e, at, r);
    this.hitMarker(r === 'kill' || weak);
    return reflected;
  }

  /**
   * 인감 도장(출석 스티커)이 잡몹에 맞았다: 남으면 넘어지고, 한 번에 처리되면 뒤로 튕기며 한 바퀴 구른 뒤 사라지고,
   * 맞은 자리 SEAL_R 안의 다른 잡몹도 넘어진다 (처리는 하지 않는다). 사람·서류 탑에 맞은 것은 빼고, 터진 서류 뭉치·떨어지는 중인 것은 구르지 않는다
   */
  private sealHit(e: Enemy, at: THREE.Vector3, r: 'none' | 'hit' | 'kill'): void {
    if (r === 'none' || isBoss(e) || e instanceof DocTower) return;
    if (r === 'hit') this.knockDown(e);
    else if (!e.gone && !(e as { landing?: THREE.Vector3 | null }).landing) {
      this.downs.delete(e);
      this.rolls.start(e, this.pos);
    }
    for (const o of this.enemies) if (o !== e && o.center.distanceTo(at) <= SEAL_R) this.knockDown(o, at);
  }

  private hitMarker(kill: boolean): void {
    const el = $('hitmark');
    el.className = kill ? 'hud kill' : 'hud';
    el.style.opacity = '1';
    this.hitTimer = kill ? 0.24 : 0.13;
  }

  sheet(from: THREE.Vector3, vel: THREE.Vector3, kind: SheetKind = 'paper'): void {
    let s = this.sheets.find((x) => !x.on && x.kind === kind);
    if (!s) {
      s = { obj: this.models.sheet(kind), vel: new THREE.Vector3(), life: 0, on: false, kind };
      this.scene.add(s.obj);
      this.sheets.push(s);
    }
    s.on = true;
    s.obj.visible = true;
    s.obj.position.copy(from);
    s.obj.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    s.vel.copy(vel);
    s.life = kind === 'paper' ? 4 : 4.5;
  }

  private updateSheets(dt: number): void {
    for (const s of this.sheets) {
      if (!s.on) continue;
      s.life -= dt;
      s.obj.position.addScaledVector(s.vel, dt);
      if (s.kind === 'rental' || s.kind === 'meeting') {
        // 서류는 펄럭이며 날아온다
        s.obj.rotation.x += dt * 3.2;
        s.obj.rotation.z += dt * 2.1;
      } else {
        s.obj.rotation.x += dt * 9;
        s.obj.rotation.y += dt * 6;
      }
      if (s.obj.position.distanceTo(this.eye) < SHEET_R[s.kind][1]) {
        this.hurt(1, s.obj.position, s.kind);
        s.life = 0;
      }
      if (s.life <= 0 || s.obj.position.y < 0) {
        s.on = false;
        s.obj.visible = false;
      }
    }
  }

  private move(dt: number): void {
    if (this.freezeT > 0) {
      // 잠깐 멈춤: 제자리 (시점은 돌릴 수 있다)
      this.clampToBounds();
      return;
    }
    let fx = 0;
    let fz = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    fx += this.stick.x;
    fz -= this.stick.y;
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || this.stick.length() > 0.95;
    // 적이 없는 길에서는 조금 빨리 걷는다
    const onPath = this.stage === 'path' || this.stage === 'path2' || this.stage === 'path3' || this.stage === 'path4' || this.stage === 'path5';
    // 조리사 선생님 돕기: 상자를 든 동안 조금 느려진다 (sidejob.ts)
    const speed = (running ? RUN : WALK) * (this.slow > 0 ? 0.55 : 1) * (onPath ? 1.35 : 1) * (this.shuttleT > 0 ? SHUTTLE_MUL : 1) * this.side.speedMul;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    this.pos.x += (fx * cos - fz * sin) * speed * dt;
    this.pos.z += (-fx * sin - fz * cos) * speed * dt;
    this.clampToBounds();
    for (const o of this.world.obstacles) this.pushOut(o);
    // 경비원·대출기·상자
    for (const o of this.props.solids) this.pushOut(o);
    for (const o of this.vend.solids) this.pushOut(o);
    if (len > 0.1 && this.jumpY === 0) this.bob += dt * (running ? 13 : 9);
  }

  /** 장애물(사각형) 밖으로 민다 */
  private pushOut(o: Rect): void {
    const cx = Math.max(o.minX, Math.min(o.maxX, this.pos.x));
    const cz = Math.max(o.minZ, Math.min(o.maxZ, this.pos.z));
    const dx = this.pos.x - cx;
    const dz = this.pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < RADIUS) {
      if (d > 0.0001) {
        this.pos.x = cx + (dx / d) * RADIUS;
        this.pos.z = cz + (dz / d) * RADIUS;
      } else {
        this.pos.z = o.maxZ + RADIUS;
      }
    }
  }

  /** 점프: 한 번만 (공중에서 다시 못 뛴다) */
  private updateJump(dt: number): void {
    if (this.jumpBuf > 0) this.jumpBuf -= dt;
    if (this.vy === 0 && this.jumpY === 0) return;
    this.vy -= GRAVITY * dt;
    this.jumpY += this.vy * dt;
    if (this.jumpY <= 0) {
      this.jumpY = 0;
      this.vy = 0;
      if (this.jumpBuf > 0) {
        this.jumpBuf = 0;
        this.jump();
      }
    }
  }

  /** 열린 구역(사각형 여러 개) 가운데 가장 가까운 곳 안으로 */
  private clampToBounds(): void {
    let bx = this.pos.x;
    let bz = this.pos.z;
    let best = Infinity;
    for (const r of this.bounds) {
      const cx = Math.max(r.minX, Math.min(r.maxX, this.pos.x));
      const cz = Math.max(r.minZ, Math.min(r.maxZ, this.pos.z));
      const d = (cx - this.pos.x) ** 2 + (cz - this.pos.z) ** 2;
      if (d < best) {
        best = d;
        bx = cx;
        bz = cz;
      }
    }
    this.pos.x = bx;
    this.pos.z = bz;
  }

  // ---------- 끝 ----------

  private accuracy(): number {
    return this.thrown ? Math.round((this.hits / this.thrown) * 100) : 0;
  }

  private countsHtml(): string {
    const parts = (Object.keys(KIND_LABEL) as Kind[])
      .filter((k) => k !== 'boss' && this.counts[k] > 0)
      .map((k) => `${KIND_LABEL[k][0]} ${this.counts[k]}${KIND_LABEL[k][1]}`);
    const minions = parts.length ? parts.join(' · ') : '처리한 민원 없음';
    const signed = this.approved.length ? `<br>결재: ${this.approved.join(' · ')}` : '';
    return minions + signed;
  }

  private gameOver(): void {
    this.phase = 'over';
    this.firing = false;
    document.exitPointerLock?.();
    $('bossbox').classList.remove('on');
    $('areacard').classList.remove('on');
    const where = AREA_NAMES[areaOf(this.stage)];
    this.freezeT = 0;
    if (this.mode === 'student') return this.stu.gameOver();
    const o = this.overlay(`
      <div class="panel">
        <h1 style="color:#ff6b6b">야근 확정</h1>
        <p>${where}에서 민원에 묻혀 퇴근하지 못했습니다.</p>
        <p>처리 ${this.processed}건 · 명중률 ${this.accuracy()}% · 난이도 ${this.diff.label}</p>
        <p class="counts">${this.countsHtml()}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
    $('titleBtn').addEventListener('click', () => {
      this.resetRun();
      this.showTitle();
    });
    // 닉네임 기록판 (src/fps/board.ts)
    attachRecordForm(o, { mode: 'fps-staff', stage: this.areaStats.length, cleared: false, elapsed: this.elapsed, hero: this.pick.hero.name, diff: this.runDiff, clockMin: START_CLOCK + this.elapsed / 60 + this.penaltyMin });
  }

  /** 근무평정: 처리 시간 40 + 받은 민원 피해 30 + 명중률 30 (본편 2D와 같은 S~D 구간) */
  gradeRun(): { rows: [string, string, number, number][]; total: number; grade: string } {
    const step = (v: number, table: [number, number][], fallback: number) => {
      for (const [limit, pts] of table) if (v <= limit) return pts;
      return fallback;
    };
    const acc = this.accuracy();
    // 여섯 구역(중간보스 다섯) 기준: 8분 30초 / 10분 30초 / 12분 30초
    const time = step(this.elapsed, [[510, 40], [630, 30], [750, 20]], 10);
    const dmg = step(Math.round(this.damageTaken * 10) / 10, [[0, 30], [4, 22], [9, 14]], 6);
    const aim = acc >= 70 ? 30 : acc >= 55 ? 22 : acc >= 40 ? 14 : 6;
    const total = time + dmg + aim;
    const grade = total >= 90 ? 'S' : total >= 74 ? 'A' : total >= 56 ? 'B' : total >= 38 ? 'C' : 'D';
    return {
      rows: [
        ['처리 시간', timeText(this.elapsed), time, 40],
        ['받은 민원 피해', dmgText(this.damageTaken), dmg, 30],
        ['명중률', `${acc}% (${this.hits}/${this.thrown})`, aim, 30],
      ],
      total,
      grade,
    };
  }

  private finish(): void {
    this.phase = 'clear';
    this.firing = false;
    document.exitPointerLock?.();
    $('bossbox').classList.remove('on');
    for (const id of ['stamp1', 'stamp2']) $(id).classList.remove('on');
    const clock = START_CLOCK + this.elapsed / 60 + this.penaltyMin;
    const g = this.gradeRun();
    const rec = recordBest(this.runDiff, { total: g.total, grade: g.grade, time: this.elapsed });
    const offText = clock <= OFF_HOURS ? `정시 퇴근 · 17:00까지 ${Math.ceil(OFF_HOURS - clock)}분 여유` : `초과근무 ${Math.max(1, Math.floor(clock - OFF_HOURS))}분`;
    const rows = g.rows.map(([l, v, p, mx]) => `<tr><td>${l}</td><td>${v}</td><td class="pts">${p}/${mx}</td></tr>`).join('');
    const areas = this.areaStats.map((s, i) => `<span>${AREA_NAMES[i]} <em>${timeText(s.time)}</em></span>`).join('');
    const bestTxt = rec.isNew
      ? `<span class="newbest">새 최고 기록!</span>${rec.prev ? ` 이전 ${rec.prev.grade} · ${timeText(rec.prev.time)}` : ''}`
      : `최고 기록 ${rec.best.grade} · ${timeText(rec.best.time)}`;
    const o = this.overlay(`
      <div class="panel result">
        <h1><img class="emblem inline" src="hufs/emblem-mono.png" alt=""> 퇴근 승인! 오늘 업무 끝</h1>
        <p class="big">${clockText(clock)} 퇴근 · ${offText}</p>
        <div class="sheet">
          <div class="grade g-${g.grade}"><small>근무평정</small>${g.grade}</div>
          <table>${rows}<tr><td>합계</td><td></td><td class="pts">${g.total}/100</td></tr></table>
        </div>
        <p class="areas">${areas}</p>
        <p class="counts">${this.countsHtml()}</p>
        <p class="best">난이도 ${this.diff.label} · ${bestTxt}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
    $('titleBtn').addEventListener('click', () => {
      this.resetRun();
      this.showTitle();
    });
    // 닉네임 기록판 (src/fps/board.ts)
    attachRecordForm(o, { mode: 'fps-staff', stage: this.areaStats.length, cleared: true, elapsed: this.elapsed, hero: this.pick.hero.name, diff: this.runDiff, clockMin: clock });
  }

  // ---------- 매 프레임 ----------

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.phase === 'play') {
      // 로테이션 소개팅 화살표 판이 떠 있으면 싸움(step)을 멈추고 판 시간만 돈다 (student/dating.ts)
      if (this.dating.modal) this.dating.tickModal(dt);
      for (let i = 0; i < SPEED && this.phase === 'play' && !this.dating.modal; i++) {
        this.botHook?.(dt);
        this.step(dt);
      }
    } else if (this.phase === 'title') this.yaw = Math.sin(now / 4000) * 0.25;
    this.camera.position.set(this.pos.x, EYE + this.jumpY + (this.jumpY === 0 ? Math.sin(this.bob) * 0.05 : 0), this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const a = this.shakeAmp * (this.shakeT / 0.35);
      this.camera.rotation.x += (Math.random() - 0.5) * a;
      this.camera.rotation.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z = (Math.random() - 0.5) * a * 0.6;
    }
    // 도장 휘두르기
    // 팔을 앞으로 밀며 도장 머리를 숙인다 (소매가 화면을 가리지 않게)
    this.swing = Math.max(0, this.swing - dt * 5);
    const sw = Math.sin(this.swing * Math.PI);
    this.viewmodel.rotation.x = 0.15 + sw * 0.55;
    this.viewmodel.position.y = -0.3 + Math.sin(this.bob * 0.5) * 0.012 + sw * 0.04 - Math.min(0.06, Math.max(-0.06, this.vy * 0.012));
    this.viewmodel.position.z = -0.6 - sw * 0.16;
    // 무기를 들었으면 도장 대신 무기가 손에 보인다 (사원증은 날아가 있는 동안 손이 빈다)
    const ready = this.cooldown < this.curCd * 0.4;
    this.handStamp.visible = ready && !this.arms.id;
    this.arms.showHand(ready && !(this.arms.def?.boomerang && this.stamps.some((s) => s.on && s.arm?.boomerang)));
    if (this.fovKick > 0) {
      this.fovKick = Math.max(0, this.fovKick - dt * 1.8);
      this.camera.fov = 70 + Math.sin(this.fovKick * Math.PI) * 9;
      this.camera.updateProjectionMatrix();
    }
    if (this.world) {
      this.updateSky(dt);
      this.followSun();
      this.world.sky.position.copy(this.camera.position);
      this.world.arrowMat.opacity = 0.55 + Math.sin(now * 0.007) * 0.4;
    }
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** 하늘: 시계가 17시에 가까워질수록, 구역이 뒤로 갈수록 노을로 */
  private updateSky(dt: number): void {
    const timeK = Math.max(0, Math.min(1, this.elapsed / 60 / (OFF_HOURS - START_CLOCK)));
    let target = timeK;
    const a = areaOf(this.stage);
    if (this.mode === 'student' && this.phase !== 'title') target = this.stu.duskTarget(timeK);
    else if (this.phase !== 'title') {
      // 교직원: 여섯 구역에 걸쳐 노을로 (본관 앞 → … → 대운동장에서 짙어지고 해 질 녘 본관 앞)
      const k = Math.max(0, Math.min(1, this.elapsed / 60 / STAFF_DUSK_MIN));
      const b = this.boss;
      if (a === 5) target = 1;
      else if (a === 4) {
        let f = 0.56;
        if (this.stage === 'field') f = this.fight === 'mid' && b ? 0.6 + 0.05 * b.progress : this.fight === 'boss' && b ? 0.65 + 0.2 * b.progress : 0.65;
        else if (this.stage === 'fieldClear' || this.stage === 'toFinal') f = 0.85;
        target = Math.max(k, f);
      } else if (a === 3) target = Math.max(k, 0.48);
      else if (a === 2) target = Math.max(k, 0.36);
      else if (a === 1) target = Math.max(k, 0.22);
      else target = k;
    }
    this.dusk += (target - this.dusk) * Math.min(1, dt * 0.5);
    if (Math.abs(this.dusk - this.duskShown) > 0.004) {
      this.duskShown = this.dusk;
      this.world.setDusk(this.dusk);
      this.sunX = NaN;
    }
  }

  /** 그림자 범위를 플레이어 근처로 옮긴다 (10m 단위로 끊어 그림자 떨림을 줄인다) */
  private followSun(): void {
    const x = Math.round(this.pos.x / 10) * 10;
    const z = Math.round(this.pos.z / 10) * 10;
    if (x === this.sunX && z === this.sunZ) return;
    this.sunX = x;
    this.sunZ = z;
    const sun = this.world.sun;
    sun.target.position.set(x, 0, z);
    sun.position.set(x, 0, z).add(this.world.sunOffset);
  }

  private step(dt: number): void {
    if (this.stage !== 'done') this.elapsed += dt;
    if (this.invuln > 0) this.invuln -= dt;
    // 초보: 4초 동안 안 맞으면 체력이 조금씩 찬다
    this.calmT += dt;
    if (this.diff.regen > 0 && this.calmT > 4 && this.hp > 0 && this.hp < MAX_HP) this.hp = Math.min(MAX_HP, this.hp + this.diff.regen * dt);
    if (this.slow > 0) this.slow -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.buffT > 0) this.buffT -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.shuttleT > 0) this.shuttleT -= dt;
    if (this.sealT > 0) this.sealT -= dt;
    if (this.dropCd > 0) this.dropCd -= dt;
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) $('areacard').classList.remove('on');
    }
    if (this.firing) this.fire();
    // Boo가 들고 나는 동안은 걷기·점프 대신 Boo가 옮긴다 (boo.ts)
    if (this.boo.carrying) this.boo.carry(dt);
    else {
      this.move(dt);
      this.updateJump(dt);
    }
    this.eye.set(this.pos.x, EYE - 0.25 + this.jumpY, this.pos.z);

    // 학생 모드는 구역 흐름이 따로 있다 (src/fps/student/mode.ts)
    switch (this.mode === 'student' ? 'student' : this.stage) {
      case 'student':
        this.stu.step(dt);
        break;
      case 'yard':
      case 'plaza':
      case 'hum':
      case 'dorm':
      case 'field':
        if (this.fight === 'wave') this.stepWave(dt);
        break;
      case 'yardClear':
        this.clearT -= dt;
        if (this.clearT <= 0) this.openPath();
        break;
      case 'path':
        if (this.pos.x > PLAZA_X) this.enterPlaza();
        break;
      case 'plazaClear':
        this.clearT -= dt;
        if (this.clearT <= 0) this.openHum();
        break;
      case 'path3':
        if (this.pos.x > HUM_ENTER_X) this.enterHum();
        break;
      case 'humClear':
        this.clearT -= dt;
        if (this.clearT <= 0) this.openDorm();
        break;
      case 'path4':
        if (this.pos.z > DORM_ENTER_Z) this.enterDorm();
        break;
      case 'dormClear':
        this.clearT -= dt;
        if (this.clearT <= 0) this.openField();
        break;
      case 'path5':
        if (this.pos.x < FIELD_GATE_X) this.enterField();
        break;
      case 'path2':
        // 옛 지름길 (교직원 흐름에서는 열리지 않는다)
        if (this.pos.z > FIELD_ENTER_Z) this.enterField();
        break;
      case 'fieldClear':
        this.clearT -= dt;
        if (this.clearT <= 0) this.leaveField();
        break;
      case 'toFinal':
        // 카드를 보여 준 뒤 화면을 어둡게 → 어두운 동안 본관 앞으로 옮긴다
        this.seqT -= dt;
        if (this.seqT <= 0 && !$('fade').classList.contains('on')) $('fade').classList.add('on');
        if (this.seqT <= -0.8) {
          this.setupFinal();
          $('fade').classList.remove('on');
        }
        break;
      case 'final':
        if (this.seqT > 0) {
          this.seqT -= dt;
          const b = this.boss;
          if (this.seqT <= 0 && b instanceof President) {
            b.wake();
            this.announceBoss(b);
          }
        }
        break;
      case 'done':
        this.doneT -= dt;
        if (!this.offShown && this.doneT <= 4.6) {
          this.offShown = true;
          this.bigStamp(1);
        }
        if (this.doneT <= 3.3 && !$('stamp2').classList.contains('on')) this.bigStamp(2);
        if (this.doneT <= 0) {
          this.finish();
          return;
        }
        break;
      default:
        break;
    }
    if (this.mode === 'staff') this.stepFight(dt);
    for (let i = 0; i < this.lowering.length; i++) {
      const l = this.lowering[i];
      l.t += dt;
      l.g.position.y = -Math.min(1.6, l.t * 1.4);
      if (l.t > 1.2) {
        l.g.visible = false;
        this.lowering.splice(i--, 1);
      }
    }

    // 적은 난이도만큼 빠르게(느리게) 움직인다
    const edt = dt * this.diff.speed;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.noticeT >= 0) {
        e.noticeT -= dt;
        if (e.noticeT < 0) this.noticeHit(e);
      }
      // 인감 도장으로 넘어진(구르는) 잡몹·단톡방 공지 캡처로 멈춘 잡몹은 움직이지도 공격하지도 않는다
      if (!e.gone && !this.rolls.hold(e, dt) && !this.holdDown(e, dt) && !this.holdFrozen(e)) e.update(edt, this);
    }
    // 학생 모드 총장실 옮기기처럼 판에서 바로 빠진 잡몹은 넘어진 목록에서도 뺀다
    if (this.downs.size) for (const e of this.downs.keys()) if (!e.obj.parent) this.downs.delete(e);
    // 끝난 적은 치운다 (자리 당겨 쓰기)
    let n = 0;
    for (const e of this.enemies) {
      if (e.gone) this.removeEnemy(e);
      else this.enemies[n++] = e;
    }
    this.enemies.length = n;
    if (this.boss && this.boss.gone) this.boss = null;
    this.bossHints();

    this.hz.update(edt, this);
    this.updateStamps(dt);
    this.updateSheets(edt);
    this.updatePickups(dt);
    this.updateFrost(dt);
    this.props.update(dt);
    this.budget.update(dt);
    this.vend.update(dt);
    if (this.rescueDue) this.tryRescue();
    this.rescue.update(dt);
    this.trap.update(dt);
    this.side.update(dt);
    this.boo.update(dt);
    this.dating.update(dt);
    this.fx.update(dt);
    // 교직원 필살기: 돌진·떨어지는 규정집·내선 빛줄기 (staffskills.ts)
    this.skills.update(dt);
  }

  /** 민원 차례: 줄을 세워 하나씩 내보내고, 다 처리하면 다음 차례 또는 중간보스 */
  private stepWave(dt: number): void {
    if (this.queue.length > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.minions() < 7) {
        this.spawnKind(this.queue.pop() as SpawnKind);
        this.spawnT = 0.85;
      }
    } else if (this.minions() === 0 && !this.budget.busy && !this.trap.holds() && !this.side.holds()) {
      // 예산팀 직원이 와 있거나 동료 구조 장면·돕기 이벤트가 안 끝났으면 차례를 끝내지 않는다 (budget.ts, trapped.ts, sidejob.ts)
      if (this.waveDelay < 0) this.waveDelay = 1.6;
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.waveDelay = -1;
        if (this.wave + 1 < this.waves.length) this.beginWave(this.wave + 1);
        else this.startMid();
      }
    }
  }

  /** 교직원: 중간보스 뒤 구역 보스 등장, 마감 직전 학생의 초과근무 */
  private stepFight(dt: number): void {
    if (this.nextBossT > 0) {
      this.nextBossT -= dt;
      if (this.nextBossT <= 0) {
        this.nextBossT = -1;
        this.spawnAreaBoss();
      }
    }
    // 다섯 구역 모두: 중간보스·보스와 싸우는 동안 새 잡몹(메신저 쪽지 알림 떼·팩스기)이 가끔 섞인다 (mobs.ts, 총장전 제외)
    const a = areaOf(this.stage);
    const tk = this.mobs.trickle(dt, a <= 4 && (this.fight === 'mid' || this.fight === 'boss'), this.minions());
    if (tk) this.spawnKind(tk, true);
    const b = this.boss;
    if (b instanceof StaffMid && b.penalty > 0) {
      this.penaltyMin += b.penalty;
      b.penalty = 0;
      this.note('마감 연장 · 초과근무 +2분', 2.4);
      this.buzz([30, 30, 30]);
    }
  }

  /** 보스 요령은 처음 볼 때 한 번씩 */
  private bossHints(): void {
    const b = this.boss;
    if (!b || b.dead) return;
    if (b.open) this.hint('weak', '결재판을 들었을 때 맞히면 결재가 크게 진행됩니다!', 3.4);
    if (!this.seen.has('wave')) {
      for (const w of this.hz.rings) {
        if (w.on) {
          this.hint('wave', TOUCH ? '회의 소집 고리는 파란 버튼으로 뛰어넘으세요!' : '회의 소집 고리는 Space로 뛰어넘으세요!', 3.6);
          break;
        }
      }
    }
  }

  private setText(id: string, s: string, html = false): void {
    if (this.hudCache.get(id) === s) return;
    this.hudCache.set(id, s);
    if (html) $(id).innerHTML = s;
    else $(id).textContent = s;
  }

  private setStyle(id: string, prop: 'width' | 'opacity' | 'transform' | 'background', s: string): void {
    const key = `${id}.${prop}`;
    if (this.hudCache.get(key) === s) return;
    this.hudCache.set(key, s);
    $(id).style[prop] = s;
  }

  private setClass(id: string, cls: string, on: boolean): void {
    const key = `${id}.${cls}`;
    const v = on ? '1' : '0';
    if (this.hudCache.get(key) === v) return;
    this.hudCache.set(key, v);
    $(id).classList.toggle(cls, on);
  }

  private updateHud(dt: number): void {
    const clock = START_CLOCK + this.elapsed / 60 + this.penaltyMin;
    const left = Math.ceil(OFF_HOURS - clock);
    const places = PLACES;
    const clockLine = this.stage === 'done' && this.offShown ? `${clockText(clock)} · 퇴근 승인!` : `${clockText(clock)} · ${left > 0 ? `퇴근까지 ${left}분` : `초과근무 ${Math.max(1, Math.floor(clock - OFF_HOURS))}분`}`;
    const student = this.mode === 'student' && this.phase !== 'title';
    this.setText('clock', student ? this.stu.clockHtml(clock) : `${clockLine}<small>1인칭 시험판 · ${places[this.stage]}</small>`, true);
    const r = Math.min(1, this.hp / MAX_HP);
    this.setStyle('hpbar', 'width', `${(r * 100).toFixed(1)}%`);
    this.setStyle('hpbar', 'background', r > 0.5 ? '#5bd16b' : r > 0.25 ? '#f5c542' : '#e5484d');
    this.setStyle('spbar', 'width', `${Math.round(this.sp)}%`);
    const ready = this.sp >= SP_MAX;
    const skillName = this.pick.skill.name;
    this.setText('splabel', student ? this.stu.spLabel(ready) : ready ? (TOUCH ? `${skillName} — 노란 버튼` : `${skillName} — Q`) : skillName);
    this.setClass('sp', 'ready', ready);
    this.setClass('spBtn', 'ready', ready);
    let wave: string;
    if (student) wave = this.stu.waveLine();
    else if (this.fight === 'wave') wave = `${this.wave + 1}차 민원 ${this.queue.length + this.minions()}건 남음 · 처리 ${this.processed}건`;
    else if (this.stage === 'path') wave = `사회과학관 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.stage === 'path3') wave = `인문과학관 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.stage === 'path4') wave = `국제학사 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.stage === 'path2' || this.stage === 'path5') wave = `대운동장으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.boss instanceof StaffMid && !this.boss.dead) {
      const ex = this.boss.extra;
      wave = `${ex || `${this.boss.shortName} 민원 처리 중`} · 처리 ${this.processed}건`;
    } else if (this.boss && !this.boss.dead && this.boss.targetable) wave = `${this.boss.bossName} 결재 받는 중 · 처리 ${this.processed}건`;
    else wave = `${places[this.stage]} · 처리 ${this.processed}건`;
    const ts = this.trap.status();
    if (ts) wave = `${ts} · ${wave}`;
    const ss = this.side?.status();
    if (ss) wave = `${ss} · ${wave}`;
    this.setText('wave', wave);
    this.setText('buff', this.buffT > 0 ? `아메리카노 ${Math.ceil(this.buffT)}초 · 빨리 던지기` : '');
    // 연차 쿠폰(공결 확인서)·셔틀버스 시간표
    const perks: string[] = [];
    if (this.shieldT > 0) perks.push(`${this.mode === 'student' ? '공결 확인서' : '연차 쿠폰'} · 한 번 막음 ${Math.ceil(this.shieldT)}초`);
    if (this.shuttleT > 0) perks.push(`셔틀버스 시간표 · 빨라짐 ${Math.ceil(this.shuttleT)}초`);
    if (this.sealT > 0) perks.push(`${this.mode === 'student' ? '출석 스티커' : '인감 도장'} · 넘어뜨림 ${Math.ceil(this.sealT)}초`);
    this.setText('perks', perks.join('  ·  '));
    this.setText('weapon', this.arms.hud());
    if (this.props) this.props.syncUi(this.phase === 'play');
    if (this.vend) this.vend.syncUi(this.phase === 'play');
    if (this.side) this.side.syncUi(this.phase === 'play');
    if (this.boo) this.boo.syncUi(this.phase === 'play');
    if (this.dating) this.dating.syncUi(this.phase === 'play');
    // 보스 막대 = 결재 진행 (0% → 100%)
    const boss = this.boss;
    if (boss) {
      const pr = Math.round(boss.progress * 100);
      this.setStyle('bossbar', 'width', `${pr}%`);
      this.setText('bossprog', `${student ? this.stu.barWord() : boss instanceof StaffMid ? '처리' : '결재 진행'} ${pr}%`);
    }
    this.setClass('bossbox', 'weak', !!boss && boss.open);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').style.opacity = '0';
    }
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) $('note').style.opacity = '0';
    }
    updateSubtitle(dt);
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) $('hitmark').style.opacity = '0';
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      $('flash').style.opacity = String((this.flashT / 0.45) * (this.settings.calm ? 0.2 : 0.85));
    }
    // 회의 소집 고리가 곧 닿으면 점프 신호
    let cue = false;
    if (this.hz && this.phase === 'play' && this.jumpY < RING_H) {
      // 예산팀 직원의 바닥 파동도 같은 신호 (budget.ts)
      const eta = Math.min(this.hz.ringEta(this.pos.x, this.pos.z), this.budget.ringEta(this.pos.x, this.pos.z)) / this.diff.speed;
      cue = eta < 0.6;
    }
    this.setClass('jumpcue', 'on', cue);
    this.setClass('jumpBtn', 'alert', cue);
    // 맞은 방향
    for (const d of this.dirs) {
      if (d.t <= 0) continue;
      d.t -= dt;
      const rel = wrap(Math.atan2(-(d.from.x - this.pos.x), -(d.from.z - this.pos.z)) - this.yaw);
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = d.t > 0 ? String(Math.min(1, d.t * 1.6)) : '0';
    }
    // 길 안내
    const s = this.stage;
    const guide = this.phase === 'play' && (s === 'path' || s === 'path2' || s === 'path3' || s === 'path4' || s === 'path5');
    if (guide) {
      const sg = student ? this.stu.guide() : null;
      let tx = PLAZA_X + 3;
      let tz = 1;
      if (sg) {
        tx = sg.x;
        tz = sg.z;
      } else if (s === 'path2') {
        tx = FC.x;
        tz = FIELD_ENTER_Z + 2;
      } else if (s === 'path3') {
        // 꺾이는 길: 모퉁이까지 → 인문과학관 앞 입구
        const p = this.pos.z < PATH3_GUIDE[0][1] - 3 ? PATH3_GUIDE[0] : PATH3_GUIDE[1];
        tx = p[0];
        tz = p[1];
      } else if (s === 'path4') {
        tx = 165;
        tz = DORM_ENTER_Z + 3;
      } else if (s === 'path5') {
        tx = FIELD_GATE_X - 4;
        tz = (GATE_Z0 + GATE_Z1) / 2;
      }
      const rel = wrap(Math.atan2(-(tx - this.pos.x), -(tz - this.pos.z)) - this.yaw);
      this.setStyle('guide', 'transform', `rotate(${(-rel).toFixed(2)}rad)`);
      this.setStyle('guide', 'opacity', '1');
    } else {
      this.setStyle('guide', 'opacity', '0');
    }
  }
}

function clockText(min: number): string {
  const t = Math.floor(min);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

const game = new Game();
void game.init();
if (DEBUG) Object.assign(window as object, { __fps: game, __fpsLib: { Mail, Phone, Bubble, Bomb, PersonBoss, Chonggwal, Bogo, Meeting, President, StaffMid, Gumto, Molla, THREE, FC } });
if (DEBUG) Object.assign((window as unknown as { __fpsLib: object }).__fpsLib, { ClingBubble, DodgeBubble, NoteBadge, Fax, DueBadge, AttendQR });
