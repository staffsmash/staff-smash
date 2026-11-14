import * as THREE from 'three';
import { armName, Arms, ARMS, BOOMERANG_TURN, type ArmDef, type ArmId } from './arms';
import { Sfx, type SfxName } from './audio';
import type { Rect } from './blocks';
import { BODY_DMG, BOSS_HINTS, BOSS_NAMES, Bogo, Chonggwal, Meeting, PersonBoss, President, SERVER_SPOT, WEAK_DMG } from './bosses';
import { Bomb, Bubble, Mail, Phone, type Ctx, type Enemy, type HurtKind, type Kind, type SheetKind } from './enemies';
import { FIELD_ENTER_Z, FC } from './field';
import { Fx } from './fx';
import { Hazards, RING_H } from './hazards';
import { Rescue } from './helpers';
import { Models, type FoodKind } from './models';
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
import { DocTower } from './student/enemies';
import { StudentMode, type StudentHost } from './student/mode';
import { loadLogos } from './textures';
import { buildWorld, type World } from './world';

// Staff Smash: HUFS 1인칭 시험판 (v4).
// 본관 앞에서 세 차례 몰려오는 민원(메일·전화기·말풍선·서류 뭉치)을 도장으로 처리하고,
// 김총괄(본관 앞) → 김보고 처장(사회과학관 앞) → 회의소집 부총장(대운동장) → 총장 프레지던트 캉(해 질 녘 본관 앞)의
// 결재를 받으면 퇴근. 잡몹은 사물이고, 보스만 사람이다(사람 보스는 다치지 않고 결재판에 도장을 받는다).
// 본편(2D)과 따로 도는 시험용 페이지다. 프레지던트 캉을 제외한 인물은 모두 가상이다.
// 2026-11-14: 무기(arms.ts — 경비원·도서 무인 대출기에서 받는다), 부수는 상자·경비원·대출기(props.ts),
// 조력자 이벤트(helpers.ts), 식권·보조배터리.

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
const SP_MAX = 100;
const JUMP_V = 5.4;
const GRAVITY = 16;
const START_CLOCK = 16 * 60 + 52;
const OFF_HOURS = 17 * 60;
/** 길 끝: 여기를 넘으면 사회과학관 앞 */
const PLAZA_X = 72;
const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.006;

const AREA_NAMES = ['본관 앞', '사회과학관 앞', '대운동장', '해 질 녘 본관 앞'];

type SpawnKind = 'mail' | 'bulk' | 'phone' | 'bubble' | 'bomb';

const WAVES: Partial<Record<SpawnKind, number>>[] = [
  { mail: 5, phone: 1 },
  { mail: 6, bulk: 1, bubble: 2, phone: 1 },
  { mail: 6, bulk: 2, bubble: 2, bomb: 2, phone: 2 },
];

const SP_GAIN: Record<Kind, number> = { mail: 9, bulk: 16, phone: 12, bubble: 12, bomb: 14, boss: 0 };

const KIND_LABEL: Record<Kind, [string, string]> = {
  mail: ['새벽 3시 메일', '통'],
  bulk: ['단체 메일', '통'],
  phone: ['울리는 전화기', '대'],
  bubble: ['말풍선', '개'],
  bomb: ['서류 뭉치', '뭉치'],
  boss: ['보스 결재', ''],
};

/** 처음 만났을 때 한 번 띄우는 요령 */
const HINTS: Partial<Record<Kind, string>> = {
  phone: '빨간 그림자에서 비키세요! 떨어진 전화기는 도장으로 받기',
  bubble: '말풍선이 부르르 떨면 옆으로 피하세요!',
  bomb: '서류 뭉치는 도장으로 미리 터뜨리면 주변 민원까지 처리!',
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
};

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';
type Stage = 'yard' | 'yardBoss' | 'yardClear' | 'path' | 'plaza' | 'plazaClear' | 'path2' | 'field' | 'fieldClear' | 'toFinal' | 'final' | 'done';
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
};

interface Pickup {
  kind: FoodKind;
  obj: THREE.Group;
  item: THREE.Group;
  ttl: number;
  t: number;
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
const ZERO = new THREE.Vector3();
/** 교직원 모드 주인공 이름 (조력자가 부르는 이름) */
const STAFF_NAME = '김국제';

const blankCounts = (): Record<Kind, number> => ({ mail: 0, bulk: 0, phone: 0, bubble: 0, bomb: 0, boss: 0 });
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

function areaOf(s: Stage): number {
  if (s === 'yard' || s === 'yardBoss' || s === 'yardClear') return 0;
  if (s === 'path' || s === 'plaza' || s === 'plazaClear') return 1;
  if (s === 'path2' || s === 'field' || s === 'fieldClear' || s === 'toFinal') return 2;
  return 3;
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
  /** 지금 구역의 사람 보스 */
  boss: PersonBoss | null = null;
  /** 보스 넷의 모형 (처음에 한 번 만든다) */
  people!: Record<Who, Person>;
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

  /** 말풍선 돌진이 멈추는 경계 */
  get area(): Rect {
    const a = areaOf(this.stage);
    if (a === 2 && this.stage !== 'path2') return this.world.field;
    return a === 0 || a === 3 ? this.world.yard : this.world.plaza;
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
    this.rack = this.models.serverRack();
    this.rack.position.copy(SERVER_SPOT);
    this.rack.visible = false;
    this.scene.add(this.rack);
    this.stu = new StudentMode(this, this.studentHost());
    const perk = this.perkHost();
    this.props = new Props(perk);
    this.rescue = new Rescue(perk);
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
    // 보스 넷: 자세와 말풍선·도장 자국·메일 폭풍까지 한 번 그려 둔다
    const ppl = Object.values(this.people);
    ppl.forEach((pp, i) => {
      pp.root.position.set(-3 + i * 2, -1.6, -2);
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
    ]) {
      this.fx.text(p, t, col);
    }
    // 보스 대사 그림도 미리 만든다 (처음 말할 때 끊기지 않게)
    prepareSpeech(BOSS_LINES);
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
    this.renderer.render(this.scene, this.camera);
    unwarm();
    unwarmProps();
    unwarmRescue();
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
      areaNo: () => (g.mode === 'student' ? g.stu.areaNo : areaOf(g.stage)),
      playerName: () => (g.mode === 'student' ? g.stu.heroName : STAFF_NAME),
      heroId: () => g.stu.heroId,
      note: (text, time) => g.note(text, time),
      hint: (key, text, time) => g.hint(key, text, time),
      banner: (title, sub) => g.banner(title, sub),
      sound: (name, at, vol) => g.sound(name, at, vol),
      spawnPickup: (kind, x, z) => g.spawnPickup(kind, x, z),
      equip: (id) => g.equip(id),
      rescueHit: () => g.rescueHit(),
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
      this.keys.add(e.code);
      if (e.code === 'Space' && this.phase === 'play') e.preventDefault();
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.phase === 'play' && !document.pointerLockElement) this.pause();
      if (e.code === 'KeyQ') this.special();
      if (e.code === 'KeyE' && this.phase === 'play') this.props.interact();
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
  }

  private diffSeg(): string {
    return (Object.keys(DIFFS) as DiffKey[])
      .map((k) => `<button type="button" data-diff="${k}" class="${this.settings.diff === k ? 'on' : ''}" aria-pressed="${this.settings.diff === k}">${DIFFS[k].label}</button>`)
      .join('');
  }

  private showTitle(): void {
    this.phase = 'title';
    const ctl = TOUCH
      ? '왼쪽 화면 끌기 이동 · 오른쪽 화면 끌기 시점 · 빨간 버튼 도장(누른 채 끌면 조준) · 파란 버튼 점프 · 노란 버튼 필살기'
      : '이동 WASD · 달리기 Shift · 점프 Space · 시점 마우스 · 도장 던지기 클릭 · 필살기 Q · 소리 M';
    const o = this.overlay(`
      <div class="panel">
        <img class="emblem" src="hufs/emblem-mono.png" alt=""> <img class="type" src="hufs/hufs-type.png" alt="HUFS">
        <h1>STAFF SMASH <span class="tag">1인칭 시험판</span></h1>
        <p class="big">오후 4시 52분, 본관 앞</p>
        <p>퇴근 8분 전, 민원이 몰려옵니다. 도장으로 처리하고 결재를 받으세요.<br>김총괄 → 김보고 처장 → 회의소집 부총장 → 총장 프레지던트 캉</p>
        <p class="ctl">${ctl}</p>
        <div class="srow center"><span class="slabel">난이도</span><div class="seg" role="group" aria-label="난이도">${this.diffSeg()}</div></div>
        <p class="best">최고 기록 ${bestLine(this.settings.diff)}</p>
        ${this.stu.modeButtons()}
        <button id="setBtn" class="ghost" type="button">설정</button>
        <a class="btn" href="./">본편(2D)으로</a>
        <p class="foot">비공식 게임 · 기록은 이 브라우저에만 저장됩니다</p>
      </div>`);
    bindSettings(o, this.settings, (key) => this.applySetting(key));
    this.stu.bindTitle();
    $('setBtn').addEventListener('click', () => this.showSettings('title'));
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
      if (this.mode === 'student') this.stu.begin();
      else this.beginWave(0);
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
    for (const b of [this.world.barricade, this.world.barricade2]) {
      b.visible = true;
      b.position.y = 0;
    }
    this.world.arrows.visible = false;
    this.world.arrows2.visible = false;
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
    this.arms.clear();
    this.stu.reset();
    this.phase = 'title';
  }

  restart(): void {
    this.resetRun();
    this.start();
  }

  private beginWave(i: number): void {
    this.wave = i;
    const w = WAVES[i];
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
    this.banner(`${i + 1}차 민원 도착!`, i === 0 ? '본관 쪽에서 날아옵니다 — 도장으로 처리하세요' : `${this.queue.length}건이 몰려옵니다`);
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

  /** 보스 막대와 이름 띠를 켠다 */
  private announceBoss(b: PersonBoss): void {
    this.showBossBar(b.bossName);
    this.banner(b.bossName, BOSS_HINTS[b.who]);
    this.sound('volley');
  }

  /** 3차 민원이 끝나면 본관에서 김총괄이 걸어 나온다 */
  private startYardBoss(): void {
    this.stage = 'yardBoss';
    const b = new Chonggwal(this, this.people.chonggwal);
    this.placeBoss(b);
    this.announceBoss(b);
  }

  /** 보스 결재 완료 (승인 도장 → 한마디 → 퇴근) */
  private bossApproved(b: PersonBoss): void {
    this.approved.push(b.bossName);
    this.sweepMinions();
    this.hz.clear();
    this.freezeT = 0;
    this.buzz([40, 30, 80]);
    if (this.mode === 'student') return this.stu.bossApproved(b);
    if (b.who === 'president') {
      this.presidentApproved();
      return;
    }
    this.clearT = 3.2;
    this.stage = b.who === 'chonggwal' ? 'yardClear' : b.who === 'bogo' ? 'plazaClear' : 'fieldClear';
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
    const b = new Bogo(this, this.people.bogo);
    this.placeBoss(b);
    this.announceBoss(b);
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

  /** 사회과학관 앞을 정리하면 남쪽 대운동장 길이 열린다. 부총장은 단상에서 기다린다 */
  private openField(): void {
    this.stage = 'path2';
    this.bounds = [this.world.plaza, this.world.path2, this.world.field];
    this.lower(this.world.barricade2);
    this.world.arrows2.visible = true;
    $('bossbox').classList.remove('on');
    this.showCard(1, this.recordArea(), '다음: 대운동장 — 남쪽 길로 가세요 ↓');
    this.sound('open');
    this.placeBoss(new Meeting(this, this.people.meeting));
  }

  private enterField(): void {
    this.stage = 'field';
    this.bounds = [this.world.field];
    this.world.arrows2.visible = false;
    const b = this.boss;
    if (b instanceof Meeting) {
      b.wake();
      this.announceBoss(b);
    }
    // 스탠드 앞에 간식 두 개
    this.spawnPickup(this.hp <= 6 ? 'donkatsu' : 'gimbap', 91.5, 61.5);
    this.spawnPickup('americano', 98.5, 61.5);
  }

  /** 부총장 결재 뒤: 구역 카드 → 화면이 어두워졌다가 해 질 녘 본관 앞으로 */
  private leaveField(): void {
    this.stage = 'toFinal';
    $('bossbox').classList.remove('on');
    this.showCard(2, this.recordArea(), '다음: 해 질 녘 본관 앞 — 총장 결재');
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
    if (a === 2) {
      const f = this.world.field;
      return out.set(f.minX + Math.random() * (f.maxX - f.minX), y, f.maxZ - Math.random() * 6);
    }
    if (a === 1) {
      return out.set(side ? 78 + Math.random() * 30 : 114 + Math.random() * 4, y, side ? (Math.random() < 0.5 ? -22 : 22) : -14 + Math.random() * 28);
    }
    // 본관 쪽(먼 곳) 또는 양옆에서 나온다
    const x = side ? (Math.random() < 0.5 ? -25 : 25) : -18 + Math.random() * 36;
    const z = side ? -10 + Math.random() * 20 : -17 + Math.random() * 3;
    return out.set(x, y, z);
  }

  private spawnKind(kind: SpawnKind): void {
    if (kind === 'phone') {
      this.spawnPhone();
      return;
    }
    if (kind === 'mail' || kind === 'bulk') {
      this.enemies.push(new Mail(this, kind === 'bulk', this.spawnPoint(_v, 2.5 + Math.random() * 3.5)));
    } else if (kind === 'bubble') {
      this.enemies.push(new Bubble(this, this.spawnPoint(_v, 1.8 + Math.random() * 0.6)));
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

  spawnAt(kind: 'mail' | 'bomb' | 'bubble', at: THREE.Vector3): void {
    this.enemies.push(kind === 'mail' ? new Mail(this, false, at) : kind === 'bubble' ? new Bubble(this, at) : new Bomb(this, at));
    if (kind !== 'mail') this.hint(kind);
  }

  minions(): number {
    let n = 0;
    for (const e of this.enemies) if (e.targetable && !isBoss(e)) n++;
    return n;
  }

  private removeEnemy(e: Enemy): void {
    this.scene.remove(e.obj);
    e.dispose();
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
    if (!byPlayer && this.eye.distanceTo(at) < 3.8) this.hurt(3, at, 'bomb');
  }

  private onProcessed(e: Enemy): void {
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
    if (this.dropCd > 0) return;
    let chance = 0.15 + this.diff.drop;
    if (this.hp <= 4) chance += 0.15;
    if (kind === 'bulk' || kind === 'bomb') chance += 0.1;
    // 음식은 이제 상자에서도 나오므로 민원이 떨어뜨리는 것은 절반쯤으로
    if (Math.random() > chance * 0.5) return;
    this.dropCd = 7;
    const r = Math.random();
    // 가끔 보조배터리 (필살기 게이지가 다 찼으면 음식)
    const food: FoodKind =
      this.sp < SP_MAX - 10 && Math.random() < 0.2
        ? 'battery'
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

  spawnPickup(kind: FoodKind, x: number, z: number): void {
    const { obj, item } = this.models.food(kind);
    obj.position.set(x, 0.05, z);
    this.scene.add(obj);
    this.pickups.push({ kind, obj, item, ttl: kind === 'americano' || this.stage === 'yard' || this.stage === 'path' ? 15 : 40, t: Math.random() * 6 });
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
    if (p.kind === 'donkatsu') {
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
    } else {
      this.buffT = BUFF_T;
      this.note(this.mode === 'student' ? '아메리카노! 공격 속도 UP' : '아메리카노! 8초 동안 도장을 빨리 던집니다');
    }
    this.sound('pickup');
    this.fx.confetti(_v.set(p.obj.position.x, 0.8, p.obj.position.z), 12, 3, 0xf5c542, 2, 0.7);
  }

  // ---------- 필살기: 전체 공지 발송 ----------

  special(): void {
    if (this.phase !== 'play' || this.sp < SP_MAX) return;
    if (this.stage !== 'yard' && this.stage !== 'yardBoss' && this.stage !== 'plaza' && this.stage !== 'field' && this.stage !== 'final') return;
    this.sp = 0;
    this.spReadyShown = false;
    this.sound('special');
    // 학생 모드: 고른 외국어 주문 (효과는 같다)
    if (this.mode === 'student') this.stu.castSpell();
    else this.banner('전체 공지 발송!', '수신: 화면 안 모든 민원 · 회신 불필요');
    const col = this.mode === 'student' ? this.stu.spellColor : 0xf5c542;
    this.flashT = 0.45;
    if (!this.settings.calm) this.fovKick = 1;
    this.swing = 1;
    const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
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

  // ---------- 플레이어 ----------

  hurt(dmg: number, from: THREE.Vector3, kind: HurtKind = 'mail'): void {
    if (this.invuln > 0 || this.phase !== 'play' || this.stage === 'done') return;
    dmg *= this.diff.damage;
    this.hp = Math.max(0, this.hp - dmg);
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
    if (this.hp <= MAX_HP * 0.25) this.maybeRescue();
  }

  // ---------- 조력자 · 무기 ----------

  /** 체력 25% 이하: 60% 확률로 동료·친구가 도우러 온다 (구역마다 한 번, 카드·연출·엔딩 중에는 안 온다) */
  private maybeRescue(): void {
    if (this.cardT > 0 || this.seqT > 0 || this.stage === 'toFinal' || this.stage === 'done') return;
    if (this.mode === 'student' && this.stu.busy) return;
    const key = `${this.mode}:${this.mode === 'student' ? this.stu.areaNo : areaOf(this.stage)}`;
    if (!this.rescue.canStart(key) || Math.random() >= 0.6) return;
    // 뛰어 들어오는 동안은 맞지 않는다 (도착하면 2초 무적)
    this.invuln = Math.max(this.invuln, 1.4);
    this.rescue.start(key);
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

  /** 잠깐 멈춤 (강의실 열쇠·"보고해!"): 움직이지도 던지지도 못한다. 이미 멈춰 있으면 false */
  freeze(sec: number, text: string): boolean {
    if (this.freezeT > 0 || this.phase !== 'play' || this.stage === 'done') return false;
    // 초보는 짧게
    this.freezeT = sec * Math.min(1, 0.45 + this.diff.speed * 0.55);
    this.note(text, this.freezeT + 0.4);
    this.sound('hurt', undefined, 0.5);
    this.buzz(30);
    return true;
  }

  jump(): void {
    if (this.phase !== 'play' || this.freezeT > 0) return;
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
    this.hitMarker(r === 'kill' || weak);
    return reflected;
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
    const onPath = this.stage === 'path' || this.stage === 'path2';
    const speed = (running ? RUN : WALK) * (this.slow > 0 ? 0.55 : 1) * (onPath ? 1.35 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
    this.pos.x += (fx * cos - fz * sin) * speed * dt;
    this.pos.z += (-fx * sin - fz * cos) * speed * dt;
    this.clampToBounds();
    for (const o of this.world.obstacles) this.pushOut(o);
    // 경비원·대출기·상자
    for (const o of this.props.solids) this.pushOut(o);
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
    this.overlay(`
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
  }

  /** 근무평정: 처리 시간 40 + 받은 민원 피해 30 + 명중률 30 (본편 2D와 같은 S~D 구간) */
  gradeRun(): { rows: [string, string, number, number][]; total: number; grade: string } {
    const step = (v: number, table: [number, number][], fallback: number) => {
      for (const [limit, pts] of table) if (v <= limit) return pts;
      return fallback;
    };
    const acc = this.accuracy();
    // 네 구역 기준: 4분 30초 / 6분 / 7분 30초
    const time = step(this.elapsed, [[270, 40], [360, 30], [450, 20]], 10);
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
    const clock = START_CLOCK + this.elapsed / 60;
    const g = this.gradeRun();
    const rec = recordBest(this.runDiff, { total: g.total, grade: g.grade, time: this.elapsed });
    const offText = clock <= OFF_HOURS ? `정시 퇴근 · 17:00까지 ${Math.ceil(OFF_HOURS - clock)}분 여유` : `초과근무 ${Math.max(1, Math.floor(clock - OFF_HOURS))}분`;
    const rows = g.rows.map(([l, v, p, mx]) => `<tr><td>${l}</td><td>${v}</td><td class="pts">${p}/${mx}</td></tr>`).join('');
    const areas = this.areaStats.map((s, i) => `<span>${AREA_NAMES[i]} <em>${timeText(s.time)}</em></span>`).join('');
    const bestTxt = rec.isNew
      ? `<span class="newbest">새 최고 기록!</span>${rec.prev ? ` 이전 ${rec.prev.grade} · ${timeText(rec.prev.time)}` : ''}`
      : `최고 기록 ${rec.best.grade} · ${timeText(rec.best.time)}`;
    this.overlay(`
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
        <p class="foot">비공식 게임</p>
        <button id="againBtn" type="button">다시 하기</button>
        <button id="titleBtn" class="ghost" type="button">처음 화면</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
    $('titleBtn').addEventListener('click', () => {
      this.resetRun();
      this.showTitle();
    });
  }

  // ---------- 매 프레임 ----------

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.phase === 'play') {
      for (let i = 0; i < SPEED && this.phase === 'play'; i++) {
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
      if (a === 3) target = 1;
      else if (a === 2) target = Math.max(timeK, 0.6 + (this.boss && this.stage === 'field' ? 0.2 * this.boss.progress : this.stage === 'path2' ? 0 : 0.2));
      else if (a === 1) target = Math.max(timeK, 0.32);
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
    if (this.dropCd > 0) this.dropCd -= dt;
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) $('areacard').classList.remove('on');
    }
    if (this.firing) this.fire();
    this.move(dt);
    this.updateJump(dt);
    this.eye.set(this.pos.x, EYE - 0.25 + this.jumpY, this.pos.z);

    // 학생 모드는 구역 흐름이 따로 있다 (src/fps/student/mode.ts)
    switch (this.mode === 'student' ? 'student' : this.stage) {
      case 'student':
        this.stu.step(dt);
        break;
      case 'yard':
        if (this.queue.length > 0) {
          this.spawnT -= dt;
          if (this.spawnT <= 0 && this.minions() < 7) {
            this.spawnKind(this.queue.pop() as SpawnKind);
            this.spawnT = 0.85;
          }
        } else if (this.minions() === 0) {
          if (this.waveDelay < 0) this.waveDelay = 1.6;
          this.waveDelay -= dt;
          if (this.waveDelay <= 0) {
            this.waveDelay = -1;
            if (this.wave + 1 < WAVES.length) this.beginWave(this.wave + 1);
            else this.startYardBoss();
          }
        }
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
        if (this.clearT <= 0) this.openField();
        break;
      case 'path2':
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
      if (!e.gone) e.update(edt, this);
    }
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
    this.props.update(dt);
    this.rescue.update(dt);
    this.fx.update(dt);
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
    const clock = START_CLOCK + this.elapsed / 60;
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
    this.setText('splabel', student ? this.stu.spLabel(ready) : ready ? (TOUCH ? '전체 공지 발송 — 노란 버튼' : '전체 공지 발송 — Q') : '전체 공지 발송');
    this.setClass('sp', 'ready', ready);
    this.setClass('spBtn', 'ready', ready);
    let wave: string;
    if (student) wave = this.stu.waveLine();
    else if (this.stage === 'yard') wave = `${this.wave + 1}차 민원 ${this.queue.length + this.minions()}건 남음 · 처리 ${this.processed}건`;
    else if (this.stage === 'path') wave = `사회과학관 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.stage === 'path2') wave = `대운동장으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.boss && !this.boss.dead && this.boss.targetable) wave = `${this.boss.bossName} 결재 받는 중 · 처리 ${this.processed}건`;
    else wave = `${places[this.stage]} · 처리 ${this.processed}건`;
    this.setText('wave', wave);
    this.setText('buff', this.buffT > 0 ? `아메리카노 ${Math.ceil(this.buffT)}초 · 빨리 던지기` : '');
    this.setText('weapon', this.arms.hud());
    if (this.props) this.props.syncUi(this.phase === 'play');
    // 보스 막대 = 결재 진행 (0% → 100%)
    const boss = this.boss;
    if (boss) {
      const pr = Math.round(boss.progress * 100);
      this.setStyle('bossbar', 'width', `${pr}%`);
      this.setText('bossprog', `${student ? this.stu.barWord() : '결재 진행'} ${pr}%`);
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
      const eta = this.hz.ringEta(this.pos.x, this.pos.z) / this.diff.speed;
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
    const guide = this.phase === 'play' && (this.stage === 'path' || this.stage === 'path2');
    if (guide) {
      const sg = student ? this.stu.guide() : null;
      const tx = sg ? sg.x : this.stage === 'path' ? PLAZA_X + 3 : FC.x;
      const tz = sg ? sg.z : this.stage === 'path' ? 1 : FIELD_ENTER_Z + 2;
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
if (DEBUG) Object.assign(window as object, { __fps: game, __fpsLib: { Mail, Phone, Bubble, Bomb, PersonBoss, Chonggwal, Bogo, Meeting, President, THREE, FC } });
