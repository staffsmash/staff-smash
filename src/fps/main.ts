import * as THREE from 'three';
import { Sfx, type SfxName } from './audio';
import type { Rect } from './blocks';
import { Bomb, Boss, Bubble, Mail, Phone, type Ctx, type Enemy, type HurtKind, type Kind } from './enemies';
import { FIELD_ENTER_Z, FC, MAST } from './field';
import { Fx } from './fx';
import { Megaphone, WAVE_H, WEAK_DMG } from './megaphone';
import { Models, type FoodKind } from './models';
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
import { FRONT_X } from './social';
import { loadLogos } from './textures';
import { buildWorld, type World } from './world';

// Staff Smash: HUFS 1인칭 시험판 (v3).
// 본관 앞에서 세 차례 몰려오는 민원(메일·전화기·말풍선·서류 뭉치)을 도장으로 처리하고,
// 사회과학관 앞의 "단체 회신 메일 폭풍", 대운동장의 "요구안 방송 확성기"까지 처리하면 퇴근.
// 본편(2D)과 따로 도는 시험용 페이지다. 사람(학생·교직원·총장)은 나오지 않는다.

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
const ORBIT_C = new THREE.Vector3(97, 0, 0);
const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.006;

const AREA_NAMES = ['본관 앞', '사회과학관 앞', '대운동장'];

type SpawnKind = 'mail' | 'bulk' | 'phone' | 'bubble' | 'bomb';

const WAVES: Partial<Record<SpawnKind, number>>[] = [
  { mail: 5, phone: 1 },
  { mail: 6, bulk: 1, bubble: 2, phone: 1 },
  { mail: 6, bulk: 2, bubble: 2, bomb: 2, phone: 2 },
];

const SP_GAIN: Record<Kind, number> = { mail: 9, bulk: 16, phone: 12, bubble: 12, bomb: 14, boss: 0, mega: 0 };

const KIND_LABEL: Record<Kind, [string, string]> = {
  mail: ['새벽 3시 메일', '통'],
  bulk: ['단체 메일', '통'],
  phone: ['울리는 전화기', '대'],
  bubble: ['말풍선', '개'],
  bomb: ['서류 뭉치', '뭉치'],
  boss: ['단체 회신 메일 폭풍', ''],
  mega: ['요구안 방송 확성기', ''],
};

/** 처음 만났을 때 한 번 띄우는 요령 */
const HINTS: Partial<Record<Kind, string>> = {
  phone: '빨간 그림자에서 비키세요! 떨어진 전화기는 도장으로 받기',
  bubble: '말풍선이 부르르 떨면 옆으로 피하세요!',
  bomb: '서류 뭉치는 도장으로 미리 터뜨리면 주변 민원까지 처리!',
};

const HURT_NOTE: Record<HurtKind, string> = {
  mail: '메일 확인 중… (느려짐)',
  bulk: '메일 확인 중… (느려짐)',
  phone: '전화 받는 중… (느려짐)',
  bubble: '말풍선에 부딪힘… (느려짐)',
  bomb: '마감 폭발! (느려짐)',
  boss: '전체 회신 폭탄… (느려짐)',
  mega: '대자보에 덮임… (느려짐)',
  wave: '음파에 휘청… (느려짐)',
};

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';
type Stage = 'yard' | 'path' | 'plaza' | 'plazaClear' | 'path2' | 'field' | 'done';
type DamageSrc = 'stamp' | 'blast' | 'fuse' | 'special';

/** 시계 아래 작은 글씨 (지금 있는 곳) */
const PLACES: Record<Stage, string> = {
  yard: '본관 앞',
  path: '사회과학관 가는 길',
  plaza: '사회과학관 앞',
  plazaClear: '사회과학관 앞',
  path2: '대운동장 가는 길',
  field: '대운동장',
  done: '대운동장',
};

interface Stamp {
  obj: THREE.Group;
  vel: THREE.Vector3;
  life: number;
  on: boolean;
}

interface Sheet {
  obj: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  on: boolean;
  /** 확성기의 대자보 (크고 느리다) */
  big: boolean;
}

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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _prev = new THREE.Vector3();
const ZERO = new THREE.Vector3();

const blankCounts = (): Record<Kind, number> => ({ mail: 0, bulk: 0, phone: 0, bubble: 0, bomb: 0, boss: 0, mega: 0 });
const isBoss = (e: Enemy) => e.kind === 'boss' || e.kind === 'mega';

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
  return s === 'yard' ? 0 : s === 'path' || s === 'plaza' || s === 'plazaClear' ? 1 : 2;
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
  boss: Boss | null = null;
  mega: Megaphone | null = null;
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
    return a === 0 ? this.world.yard : this.world.plaza;
  }

  async init(): Promise<void> {
    const logos = await loadLogos();
    this.world = buildWorld(this.scene, logos);
    // 확성기 기둥은 처음부터 서 있다 (확성기는 사회과학관 앞을 정리하면 올라앉는다)
    const mast = this.models.mast();
    mast.position.copy(MAST);
    this.scene.add(mast);
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
    const wave = m.wave().mesh;
    wave.visible = true;
    const items: THREE.Object3D[] = [
      m.mail(false).obj,
      m.mail(true).obj,
      m.phone().obj,
      m.bubble().obj,
      m.bomb().obj,
      m.boss().obj,
      m.megaphone().obj,
      wave,
      m.food('donkatsu').obj,
      m.food('gimbap').obj,
      m.food('americano').obj,
      m.sheet(),
      m.flyer(),
      m.stamp(),
      new THREE.Mesh(m.warnGeo, m.warnMat),
    ];
    items.forEach((o, i) => {
      o.position.x = (i - 7) * 0.4;
      o.scale.setScalar(0.15);
      g.add(o);
    });
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
      ['약점!', '#ffe066'],
      ['요구안 방송!', '#ffd84a'],
      ['아, 아— 마이크 테스트', '#ffffff'],
      ['삐익— 방송 끊김!', '#ffe066'],
    ]) {
      this.fx.text(p, t, col);
    }
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
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(g);
    this.fx.clear();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
      this.keys.add(e.code);
      if (e.code === 'Space' && this.phase === 'play') e.preventDefault();
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.phase === 'play' && !document.pointerLockElement) this.pause();
      if (e.code === 'KeyQ') this.special();
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
        <p>퇴근 8분 전, 메일·전화기·말풍선·서류 뭉치가 몰려옵니다.<br>도장을 던져 본관 앞 → 사회과학관 앞 → 대운동장까지 정리하고 퇴근하세요.</p>
        <p class="ctl">${ctl}</p>
        <div class="srow center"><span class="slabel">난이도</span><div class="seg" role="group" aria-label="난이도">${this.diffSeg()}</div></div>
        <p class="best">최고 기록 ${bestLine(this.settings.diff)}</p>
        <button id="startBtn" type="button">출근하기</button>
        <button id="setBtn" class="ghost" type="button">설정</button>
        <a class="btn" href="./">본편(2D)으로</a>
        <p class="foot">비공식 게임 · 본편과 따로 도는 시험용 페이지입니다 · 기록은 이 브라우저에만 저장됩니다</p>
      </div>`);
    bindSettings(o, this.settings, (key) => this.applySetting(key));
    $('startBtn').addEventListener('click', () => this.start());
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
      this.beginWave(0);
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
    this.boss = null;
    this.mega = null;
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
    $('offwork').classList.remove('on');
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

  /** 마당을 다 정리하면 사회과학관 쪽 길이 열린다 */
  private openPath(): void {
    this.stage = 'path';
    this.bounds = [this.world.yard, this.world.path, this.world.plaza];
    this.lower(this.world.barricade);
    this.world.arrows.visible = true;
    this.showCard(0, this.recordArea(), '다음: 사회과학관 앞 — 오른쪽 길로 가세요 →');
    this.sound('open');
  }

  private enterPlaza(): void {
    this.stage = 'plaza';
    this.bounds = [this.world.plaza];
    this.world.arrows.visible = false;
    this.banner('사회과학관 앞', '단체 회신 메일 폭풍이 몰려옵니다!');
    this.boss = new Boss(this, new THREE.Vector3(FRONT_X - 6, 26, 0), ORBIT_C);
    this.boss.hp = this.boss.maxHp = Math.round(this.boss.maxHp * this.diff.bossHp);
    this.enemies.push(this.boss);
    this.showBossBar('단체 회신 메일 폭풍');
    this.sound('volley');
  }

  private showBossBar(name: string): void {
    $('bossname').textContent = name;
    $('bossbar').style.width = '100%';
    this.hudCache.delete('bossbar.width');
    $('bossbox').classList.add('on');
  }

  bossPhase2(kind: 'boss' | 'mega'): void {
    if (kind === 'boss') this.banner('회신이 회신을 부릅니다!', '서류 뭉치를 보스 곁에서 터뜨리면 크게 처리됩니다');
    else this.banner('확성기가 기둥을 떠납니다!', '이제 운동장 위를 돌며 음파를 두 겹으로 쏩니다');
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

  private bossDown(): void {
    this.stage = 'plazaClear';
    this.clearT = 2.6;
    $('bossbox').classList.remove('on');
    this.banner('단체 회신 메일 폭풍 처리!', '사회과학관 앞 정리 완료');
    this.sweepMinions();
  }

  /** 사회과학관 앞을 정리하면 남쪽 대운동장 길이 열리고 확성기가 기둥에 올라앉는다 */
  private openField(): void {
    this.stage = 'path2';
    this.bounds = [this.world.plaza, this.world.path2, this.world.field];
    this.lower(this.world.barricade2);
    this.world.arrows2.visible = true;
    this.showCard(1, this.recordArea(), '다음: 대운동장 — 남쪽 길로 가세요 ↓');
    this.sound('open');
    this.mega = new Megaphone(this);
    this.mega.hp = this.mega.maxHp = Math.round(this.mega.maxHp * this.diff.bossHp);
    this.enemies.push(this.mega);
  }

  private enterField(): void {
    this.stage = 'field';
    this.bounds = [this.world.field];
    this.world.arrows2.visible = false;
    this.banner('대운동장', '요구안 방송 확성기가 켜집니다!');
    this.mega?.wake();
    this.showBossBar('요구안 방송 확성기');
    // 스탠드 앞에 간식 두 개
    this.spawnPickup(this.hp <= 6 ? 'donkatsu' : 'gimbap', 91.5, 61.5);
    this.spawnPickup('americano', 98.5, 61.5);
  }

  private megaDown(): void {
    this.stage = 'done';
    this.doneT = 5.6;
    this.recordArea();
    this.banner('요구안 방송 확성기 처리!', '방송 종료 — 운동장이 조용해졌습니다');
    this.sweepMinions();
    this.buzz([60, 40, 120]);
  }

  /** 마지막: 화면 가득 "퇴근!" 도장 */
  private offworkMoment(): void {
    this.offShown = true;
    $('bossbox').classList.remove('on');
    $('banner').style.opacity = '0';
    this.bannerTimer = 0;
    const el = $('offwork');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.sound('offwork');
    this.flashT = 0.45;
    const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fx.confetti(_v.set(this.pos.x, EYE + 3, this.pos.z).addScaledVector(fwd, 9), 110, 8, 0xffffff, 4, 0.8);
    this.fx.confetti(_v.set(this.pos.x, EYE + 3, this.pos.z).addScaledVector(fwd, 9), 50, 7, 0xf5c542, 4, 0.8);
    this.buzz([40, 50, 40]);
  }

  private banner(title: string, sub = ''): void {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.style.opacity = '1';
    this.bannerTimer = 2.4;
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
    this.fx.mark(e.center, e.kind === 'bulk' ? 1.6 : isBoss(e) ? 2.4 : 1.2);
    if (e.kind === 'bulk') this.note('단체 메일 처리!');
    else if (e.kind === 'phone') this.fx.text(_v.copy(e.center).setY(e.center.y + 1.1), '네, 행정실입니다~', '#ffffff');
    else if (e.kind === 'bubble') {
      this.fx.text(_v.copy(e.center).setY(e.center.y + 0.9), '펑!', '#ffffff', 0.7);
      this.fx.confetti(e.center, 16, 4, 0xffffff, 1.5);
      this.sound('pop', e.center);
    }
    if (e.kind === 'boss') {
      this.bossDown();
      return;
    }
    if (e.kind === 'mega') {
      this.megaDown();
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
    if (Math.random() > chance) return;
    this.dropCd = 7;
    const r = Math.random();
    const food: FoodKind = this.hp <= 4 ? (r < 0.5 ? 'donkatsu' : 'gimbap') : r < 0.45 ? 'gimbap' : r < 0.75 ? 'americano' : 'donkatsu';
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
    this.pickups.push({ kind, obj, item, ttl: kind === 'americano' || areaOf(this.stage) < 2 ? 15 : 40, t: Math.random() * 6 });
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
    } else {
      this.buffT = BUFF_T;
      this.note('아메리카노! 8초 동안 도장을 빨리 던집니다');
    }
    this.sound('pickup');
    this.fx.confetti(_v.set(p.obj.position.x, 0.8, p.obj.position.z), 12, 3, 0xf5c542, 2, 0.7);
  }

  // ---------- 필살기: 전체 공지 발송 ----------

  special(): void {
    if (this.phase !== 'play' || this.sp < SP_MAX) return;
    if (this.stage !== 'yard' && this.stage !== 'plaza' && this.stage !== 'field') return;
    this.sp = 0;
    this.spReadyShown = false;
    this.sound('special');
    this.banner('전체 공지 발송!', '수신: 화면 안 모든 민원 · 회신 불필요');
    this.flashT = 0.45;
    if (!this.settings.calm) this.fovKick = 1;
    this.swing = 1;
    const fwd = _w.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.fx.spray(_v.set(this.pos.x, EYE - 0.1, this.pos.z).addScaledVector(fwd, 3.5), fwd, 110, 30, 1.2, 0xf5c542);
    this.fx.ring(this.pos.x, 0.08, this.pos.z, 1, 36, 0.8, 0xf5c542);
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
    this.fx.mark(e.center, 1.3);
    if (e instanceof Boss) {
      const dir = _dir.set(e.center.x - this.pos.x, 0, e.center.z - this.pos.z).normalize();
      this.damage(e, 8, 'special');
      if (e.targetable) e.shove(dir);
    } else if (e instanceof Megaphone) {
      this.damage(e, 8, 'special');
    } else if (e instanceof Bomb) {
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
    this.note(HURT_NOTE[kind]);
    const v = $('vignette');
    v.style.opacity = this.settings.calm ? '0.45' : '1';
    setTimeout(() => (v.style.opacity = '0'), 160);
    this.sound('hurt');
    this.quake(kind === 'wave' || kind === 'bomb' ? 0.8 : 0.4);
    this.buzz(kind === 'wave' || kind === 'bomb' ? 70 : 40);
    // 맞은 방향 표시 (가장 오래된 것을 다시 쓴다)
    let d = this.dirs[0];
    for (const x of this.dirs) if (x.t < d.t) d = x;
    d.from.copy(from);
    d.t = 1.1;
    if (this.hp <= 0.001) {
      this.hp = 0;
      this.gameOver();
    }
  }

  jump(): void {
    if (this.phase !== 'play') return;
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
    if (this.cooldown > 0 || this.phase !== 'play') return;
    this.curCd = this.buffT > 0 ? FIRE_CD_FAST : FIRE_CD;
    this.cooldown = this.curCd;
    this.swing = 1;
    this.thrown++;
    this.sound('throw', undefined, 0.8);
    // 렌더 전에 불려도 맞도록 카메라 행렬 대신 yaw/pitch로 방향을 만든다
    _q.setFromEuler(_e.set(this.pitch, this.yaw, 0, 'YXZ'));
    const dir = _dir.set(0, 0, -1).applyQuaternion(_q);
    const start = _v.set(0.3, -0.25, -0.5).applyQuaternion(_q).add(_w.set(this.pos.x, EYE + this.jumpY, this.pos.z));
    const cone = TOUCH && this.settings.assist ? Math.max(0.14, this.diff.assist) : this.diff.assist;
    if (cone > 0) this.aimAssist(start, dir, cone);
    let s = this.stamps.find((x) => !x.on);
    if (!s) {
      s = { obj: this.models.stamp(), vel: new THREE.Vector3(), life: 0, on: false };
      this.scene.add(s.obj);
      this.stamps.push(s);
    }
    s.on = true;
    s.obj.visible = true;
    s.obj.position.copy(start);
    s.obj.rotation.set(0, this.yaw, 0);
    s.vel.copy(dir).multiplyScalar(STAMP_SPEED);
    s.vel.y += 0.8;
    s.life = 1.6;
  }

  /** 조준점 가까이(cone 라디안 안)의 적이 있으면 도장 방향을 살짝 그쪽으로 꺾는다. 터치는 설정, PC는 초보·중급에서 */
  private aimAssist(start: THREE.Vector3, dir: THREE.Vector3, cone: number): void {
    let best: THREE.Vector3 | null = null;
    let bestCos = Math.cos(cone);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      // 확성기는 약점이 열려 있으면 나팔 가운데를 노린다
      const c = e instanceof Megaphone && e.open ? e.mouth : e.center;
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
    const t = d / STAMP_SPEED;
    dir.set(best.x - start.x, best.y + 2.5 * t * t - 0.8 * t - start.y, best.z - start.z).normalize();
  }

  private updateStamps(dt: number): void {
    for (const s of this.stamps) {
      if (!s.on) continue;
      s.life -= dt;
      s.vel.y -= 5 * dt;
      const p = s.obj.position;
      // 빠르게 날아가므로 두 번 나눠 움직이며 맞았는지 본다
      for (let k = 0; k < 2 && s.life > 0; k++) {
        const prev = _prev.copy(p);
        p.addScaledVector(s.vel, dt / 2);
        for (const e of this.enemies) {
          if (!e.targetable) continue;
          if (e instanceof Megaphone) {
            const h = e.hitTest(prev, p);
            if (h === 0) continue;
            this.stampHit(e, p, h === 2);
            s.life = 0;
            break;
          }
          if (p.distanceTo(e.center) < e.radius + 0.28) {
            this.stampHit(e, p);
            s.life = 0;
            break;
          }
        }
        if (s.life <= 0) break;
        for (const sh of this.sheets) {
          if (sh.on && p.distanceTo(sh.obj.position) < (sh.big ? 0.85 : 0.55)) {
            sh.on = false;
            sh.obj.visible = false;
            this.hits++;
            this.hitMarker(false);
            this.fx.confetti(sh.obj.position, sh.big ? 10 : 6, 3);
            this.sound('pop', sh.obj.position, 0.6);
            s.life = 0;
            break;
          }
        }
      }
      s.obj.rotation.x += dt * 14;
      if (p.y < 0.08 && s.life > 0) {
        s.life = 0;
        this.fx.decal(p.x, p.z);
        // 바닥의 전화기는 발치에 떨어져도 받는다
        for (const e of this.enemies) {
          if (e.targetable && e.kind === 'phone' && e.obj.position.y < 0.5 && Math.hypot(p.x - e.center.x, p.z - e.center.z) < 1.0) {
            this.stampHit(e, p);
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

  private stampHit(e: Enemy, at: THREE.Vector3, weak = false): void {
    this.hits++;
    this.fx.mark(at, weak ? 1.4 : 0.8);
    this.sound(weak ? 'weak' : 'hit', at);
    const r = this.damage(e, weak ? WEAK_DMG : 1, 'stamp');
    if (weak && e instanceof Megaphone) {
      this.weakHits++;
      e.weakHit(WEAK_DMG, this);
      this.fx.text(_v.copy(at).setY(at.y + 0.8), '약점!', '#ffe066', 0.7);
      this.buzz(15);
    }
    this.hitMarker(r === 'kill' || weak);
  }

  private hitMarker(kill: boolean): void {
    const el = $('hitmark');
    el.className = kill ? 'hud kill' : 'hud';
    el.style.opacity = '1';
    this.hitTimer = kill ? 0.24 : 0.13;
  }

  sheet(from: THREE.Vector3, vel: THREE.Vector3, big = false): void {
    let s = this.sheets.find((x) => !x.on && x.big === big);
    if (!s) {
      s = { obj: big ? this.models.flyer() : this.models.sheet(), vel: new THREE.Vector3(), life: 0, on: false, big };
      this.scene.add(s.obj);
      this.sheets.push(s);
    }
    s.on = true;
    s.obj.visible = true;
    s.obj.position.copy(from);
    s.obj.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    s.vel.copy(vel);
    s.life = big ? 4.5 : 4;
  }

  private updateSheets(dt: number): void {
    for (const s of this.sheets) {
      if (!s.on) continue;
      s.life -= dt;
      s.obj.position.addScaledVector(s.vel, dt);
      if (s.big) {
        // 대자보는 펄럭이며 날아온다
        s.obj.rotation.x += dt * 3.2;
        s.obj.rotation.z += dt * 2.1;
      } else {
        s.obj.rotation.x += dt * 9;
        s.obj.rotation.y += dt * 6;
      }
      if (s.obj.position.distanceTo(this.eye) < (s.big ? 1.0 : 0.8)) {
        this.hurt(1, s.obj.position, s.big ? 'mega' : 'boss');
        s.life = 0;
      }
      if (s.life <= 0 || s.obj.position.y < 0) {
        s.on = false;
        s.obj.visible = false;
      }
    }
  }

  private move(dt: number): void {
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
    for (const o of this.world.obstacles) {
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
    if (len > 0.1 && this.jumpY === 0) this.bob += dt * (running ? 13 : 9);
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
      .filter((k) => this.counts[k] > 0)
      .map((k) => (k === 'boss' || k === 'mega' ? `${KIND_LABEL[k][0]} 처리` : `${KIND_LABEL[k][0]} ${this.counts[k]}${KIND_LABEL[k][1]}`));
    return parts.length ? parts.join(' · ') : '처리한 민원 없음';
  }

  private gameOver(): void {
    this.phase = 'over';
    this.firing = false;
    document.exitPointerLock?.();
    $('bossbox').classList.remove('on');
    $('areacard').classList.remove('on');
    const where = AREA_NAMES[areaOf(this.stage)];
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
    // 세 구역 기준: 3분 30초 / 4분 40초 / 6분
    const time = step(this.elapsed, [[210, 40], [280, 30], [360, 20]], 10);
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
    $('offwork').classList.remove('on');
    const clock = START_CLOCK + this.elapsed / 60;
    const g = this.gradeRun();
    const rec = recordBest(this.runDiff, { total: g.total, grade: g.grade, time: this.elapsed });
    const offText = clock <= OFF_HOURS ? `정시 퇴근 · 17:00까지 ${Math.ceil(OFF_HOURS - clock)}분 여유` : `초과근무 ${Math.ceil(clock - OFF_HOURS)}분`;
    const rows = g.rows.map(([l, v, p, mx]) => `<tr><td>${l}</td><td>${v}</td><td class="pts">${p}/${mx}</td></tr>`).join('');
    const areas = this.areaStats.map((s, i) => `<span>${AREA_NAMES[i]} <em>${timeText(s.time)}</em></span>`).join('');
    const bestTxt = rec.isNew
      ? `<span class="newbest">새 최고 기록!</span>${rec.prev ? ` 이전 ${rec.prev.grade} · ${timeText(rec.prev.time)}` : ''}`
      : `최고 기록 ${rec.best.grade} · ${timeText(rec.best.time)}`;
    this.overlay(`
      <div class="panel result">
        <h1><img class="emblem inline" src="hufs/emblem-mono.png" alt=""> 퇴근! 오늘 업무 끝</h1>
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
    this.handStamp.visible = this.cooldown < this.curCd * 0.4;
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
    if (this.phase !== 'title') {
      if (this.stage === 'done') target = 1;
      else if (a === 2) target = Math.max(timeK, 0.68 + (this.mega ? 0.22 * (1 - this.mega.hp / this.mega.maxHp) : 0));
      else if (a === 1) target = Math.max(timeK, 0.36);
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
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) $('areacard').classList.remove('on');
    }
    if (this.firing) this.fire();
    this.move(dt);
    this.updateJump(dt);
    this.eye.set(this.pos.x, EYE - 0.25 + this.jumpY, this.pos.z);

    switch (this.stage) {
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
            else this.openPath();
          }
        }
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
      case 'done':
        this.doneT -= dt;
        if (!this.offShown && this.doneT <= 3.4) this.offworkMoment();
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
    if (this.mega && this.mega.gone) this.mega = null;
    this.megaHints();

    this.updateStamps(dt);
    this.updateSheets(edt);
    this.updatePickups(dt);
    this.fx.update(dt);
  }

  /** 확성기 요령은 처음 볼 때 한 번씩 */
  private megaHints(): void {
    const m = this.mega;
    if (!m || m.dead) return;
    if (m.state === 'charge') this.hint('weak', '나팔이 빛날 때 가운데를 맞히면 크게 처리! 여러 번 맞히면 방송이 끊깁니다', 3.6);
    if (!this.seen.has('wave')) {
      for (const w of m.waves) {
        if (w.on) {
          this.hint('wave', TOUCH ? '바닥으로 퍼지는 음파는 파란 버튼으로 뛰어넘으세요!' : '바닥으로 퍼지는 음파는 Space로 뛰어넘으세요!', 3.6);
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
    const clockLine = this.stage === 'done' && this.offShown ? `${clockText(clock)} · 퇴근!` : `${clockText(clock)} · ${left > 0 ? `퇴근까지 ${left}분` : `초과근무 ${Math.floor(clock - OFF_HOURS)}분`}`;
    this.setText('clock', `${clockLine}<small>1인칭 시험판 · ${places[this.stage]}</small>`, true);
    const r = Math.min(1, this.hp / MAX_HP);
    this.setStyle('hpbar', 'width', `${(r * 100).toFixed(1)}%`);
    this.setStyle('hpbar', 'background', r > 0.5 ? '#5bd16b' : r > 0.25 ? '#f5c542' : '#e5484d');
    this.setStyle('spbar', 'width', `${Math.round(this.sp)}%`);
    const ready = this.sp >= SP_MAX;
    this.setText('splabel', ready ? (TOUCH ? '전체 공지 발송 — 노란 버튼' : '전체 공지 발송 — Q') : '전체 공지 발송');
    this.setClass('sp', 'ready', ready);
    this.setClass('spBtn', 'ready', ready);
    let wave: string;
    if (this.stage === 'yard') wave = `${this.wave + 1}차 민원 ${this.queue.length + this.minions()}건 남음 · 처리 ${this.processed}건`;
    else if (this.stage === 'path') wave = `사회과학관 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else if (this.stage === 'path2') wave = `대운동장으로 이동하세요 · 처리 ${this.processed}건`;
    else wave = `${places[this.stage]} · 처리 ${this.processed}건`;
    this.setText('wave', wave);
    this.setText('buff', this.buffT > 0 ? `아메리카노 ${Math.ceil(this.buffT)}초 · 빨리 던지기` : '');
    const boss = this.mega && this.stage !== 'path2' ? this.mega : this.boss;
    if (boss) this.setStyle('bossbar', 'width', `${((boss.hp / boss.maxHp) * 100).toFixed(1)}%`);
    this.setClass('bossbox', 'weak', !!this.mega && this.mega.open);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').style.opacity = '0';
    }
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) $('note').style.opacity = '0';
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) $('hitmark').style.opacity = '0';
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      $('flash').style.opacity = String((this.flashT / 0.45) * (this.settings.calm ? 0.2 : 0.85));
    }
    // 음파가 곧 닿으면 점프 신호
    let cue = false;
    if (this.mega && this.phase === 'play' && this.jumpY < WAVE_H) {
      const eta = this.mega.waveEta(this.pos.x, this.pos.z) / this.diff.speed;
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
      const tx = this.stage === 'path' ? PLAZA_X + 3 : FC.x;
      const tz = this.stage === 'path' ? 1 : FIELD_ENTER_Z + 2;
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
if (DEBUG) Object.assign(window as object, { __fps: game, __fpsLib: { Mail, Phone, Bubble, Bomb, Boss, Megaphone, THREE, MAST, FC } });
