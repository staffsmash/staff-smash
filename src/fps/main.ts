import * as THREE from 'three';
import { Sfx, type SfxName } from './audio';
import type { Rect } from './blocks';
import { Bomb, Boss, Bubble, Mail, Phone, type Ctx, type Enemy, type Kind } from './enemies';
import { Fx } from './fx';
import { Models, type FoodKind } from './models';
import { FRONT_X } from './social';
import { loadLogos } from './textures';
import { buildWorld, type World } from './world';

// Staff Smash: HUFS 1인칭 시험판 (v2).
// 본관 앞에서 세 차례 몰려오는 민원(메일·전화기·말풍선·서류 뭉치)을 도장으로 처리하고,
// 길이 열리면 사회과학관 앞으로 가서 "단체 회신 메일 폭풍"까지 처리하면 끝난다.
// 본편(2D)과 따로 도는 시험용 페이지다. 사람(학생·교직원·총장)은 나오지 않는다.

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TIMER = params.has('timer');
const TOUCH = params.has('touch') || window.matchMedia('(pointer: coarse)').matches;

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
const START_CLOCK = 16 * 60 + 52;
const OFF_HOURS = 17 * 60;
/** 길 끝: 여기를 넘으면 사회과학관 앞 */
const PLAZA_X = 72;
const ORBIT_C = new THREE.Vector3(97, 0, 0);

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
  boss: ['단체 회신 메일 폭풍', ''],
};

/** 처음 만났을 때 한 번 띄우는 요령 */
const HINTS: Partial<Record<Kind, string>> = {
  phone: '빨간 그림자에서 비키세요! 떨어진 전화기는 도장으로 받기',
  bubble: '말풍선이 부르르 떨면 옆으로 피하세요!',
  bomb: '서류 뭉치는 도장으로 미리 터뜨리면 주변 민원까지 처리!',
};

const HURT_NOTE: Record<Kind, string> = {
  mail: '메일 확인 중… (느려짐)',
  bulk: '메일 확인 중… (느려짐)',
  phone: '전화 받는 중… (느려짐)',
  bubble: '말풍선에 부딪힘… (느려짐)',
  bomb: '마감 폭발! (느려짐)',
  boss: '전체 회신 폭탄… (느려짐)',
};

type Phase = 'title' | 'play' | 'paused' | 'clear' | 'over';
type Stage = 'yard' | 'path' | 'plaza' | 'done';
type DamageSrc = 'stamp' | 'blast' | 'fuse' | 'special';

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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const ZERO = new THREE.Vector3();

const blankCounts = (): Record<Kind, number> => ({ mail: 0, bulk: 0, phone: 0, bubble: 0, bomb: 0, boss: 0 });

/** 수평 방향(플레이어 기준 yaw)을 -π~π 로 */
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class Game implements Ctx {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 900);
  readonly models = new Models();
  readonly fx: Fx;
  readonly sfx = new Sfx();
  world!: World;
  phase: Phase = 'title';
  stage: Stage = 'yard';
  pos = new THREE.Vector3(0, EYE, 11);
  readonly eye = new THREE.Vector3(0, EYE - 0.25, 11);
  yaw = 0;
  pitch = 0.12;
  hp = MAX_HP;
  invuln = 0;
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
  doneT = 0;
  thrown = 0;
  hits = 0;
  processed = 0;
  damageTaken = 0;
  counts = blankCounts();
  sp = 0;
  buffT = 0;
  dropCd = 4;
  bounds: Rect[] = [];
  keys = new Set<string>();
  firing = false;
  stick = new THREE.Vector2();
  private seen = new Set<Kind>();
  private last = performance.now();
  private viewmodel = new THREE.Group();
  private handStamp = new THREE.Group();
  private curCd = FIRE_CD;
  private bannerTimer = 0;
  private noteTimer = 0;
  private hitTimer = 0;
  private flashT = 0;
  private fovKick = 0;
  private barricadeT = -1;
  private spReadyShown = false;
  private dirs: DirMark[] = [];
  private sunX = NaN;
  private sunZ = NaN;
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
  }

  /** 예전 시험 스크립트용 (모든 적) */
  get mails(): Enemy[] {
    return this.enemies;
  }

  /** 말풍선 돌진이 멈추는 경계 */
  get area(): Rect {
    return this.stage === 'plaza' || this.stage === 'done' ? this.world.plaza : this.world.yard;
  }

  async init(): Promise<void> {
    const logos = await loadLogos();
    this.world = buildWorld(this.scene, logos);
    this.bounds = [this.world.yard];
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
      m.boss().obj,
      m.food('donkatsu').obj,
      m.food('gimbap').obj,
      m.food('americano').obj,
      m.sheet(),
      m.stamp(),
      new THREE.Mesh(m.warnGeo, m.warnMat),
    ];
    items.forEach((o, i) => {
      o.position.x = (i - 6) * 0.4;
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
    ]) {
      this.fx.text(p, t, col);
    }
    this.fx.update(0.001);
    this.camera.position.set(0, EYE, 11);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    // 화면 밖(사회과학관 등)에 있는 재질과 그림도 지금 올려 둔다
    this.renderer.compile(this.scene, this.camera);
    const seen = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map && !seen.has(map)) {
          seen.add(map);
          this.renderer.initTexture(map);
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
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.phase === 'play' && !document.pointerLockElement) this.pause();
      if (e.code === 'KeyQ') this.special();
      if (e.code === 'KeyM') this.toggleMute();
      if ((e.code === 'Enter' || e.code === 'Space') && (this.phase === 'clear' || this.phase === 'over')) this.restart();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = this.renderer.domElement;
    document.addEventListener('mousemove', (e) => {
      if (this.phase !== 'play' || document.pointerLockElement !== canvas) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
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
    if (TOUCH) this.bindTouch();
  }

  private bindTouch(): void {
    const stickEl = $('stick');
    const knob = $('knob');
    let moveId: number | null = null;
    let lookId: number | null = null;
    let origin = { x: 0, y: 0 };
    let lastLook = { x: 0, y: 0 };
    const el = this.renderer.domElement;
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
            if (this.phase === 'play') this.look((t.clientX - lastLook.x) * 0.006, (t.clientY - lastLook.y) * 0.006);
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
    const fire = $('fire');
    fire.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.firing = true;
    });
    fire.addEventListener('touchend', () => (this.firing = false));
    $('spBtn').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.special();
    });
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

  // ---------- 진행 ----------

  private overlay(html: string): void {
    const o = $('overlay');
    o.innerHTML = html;
    o.hidden = false;
  }

  private hideOverlay(): void {
    $('overlay').hidden = true;
  }

  private showTitle(): void {
    this.phase = 'title';
    const ctl = TOUCH
      ? '왼쪽 화면을 끌어 이동, 오른쪽 화면을 끌어 시점, 빨간 버튼으로 도장 던지기, 노란 버튼으로 필살기'
      : '이동 WASD · 달리기 Shift · 시점 마우스 · 도장 던지기 클릭 · 필살기 Q · 소리 M';
    this.overlay(`
      <div class="panel">
        <img class="emblem" src="hufs/emblem-mono.png" alt=""> <img class="type" src="hufs/hufs-type.png" alt="HUFS">
        <h1>STAFF SMASH <span class="tag">1인칭 시험판</span></h1>
        <p class="big">오후 4시 52분, 본관 앞</p>
        <p>퇴근 8분 전, 본관 쪽에서 메일과 전화기, 말풍선, 서류 뭉치가 몰려옵니다.<br>도장을 던져 본관 앞을 정리하고, 사회과학관 앞의 "단체 회신 메일 폭풍"까지 처리하세요.</p>
        <p>${ctl}</p>
        <button id="startBtn" type="button">출근하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
        <p style="font-size:12px;color:#8b95a8">비공식 게임 · 본편과 따로 도는 시험용 페이지입니다</p>
      </div>`);
    $('startBtn').addEventListener('click', () => this.start());
  }

  start(): void {
    this.sfx.unlock();
    this.hideOverlay();
    if (!TOUCH && !DEBUG) this.renderer.domElement.requestPointerLock();
    if (TOUCH && !document.fullscreenElement) {
      // 전체 화면을 못 쓰는 브라우저(iPhone 등)는 그대로 한다
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    if (this.phase === 'title') this.beginWave(0);
    this.phase = 'play';
    this.last = performance.now();
  }

  pause(): void {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.firing = false;
    this.keys.clear();
    this.overlay(`
      <div class="panel">
        <h1>일시정지</h1>
        <p>${TOUCH ? '버튼을 눌러 계속합니다' : '클릭하면 계속합니다 (마우스로 시점)'}</p>
        <button id="resumeBtn" type="button">계속하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('resumeBtn').addEventListener('click', () => this.start());
  }

  restart(): void {
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
    this.stage = 'yard';
    this.bounds = [this.world.yard];
    this.world.barricade.visible = true;
    this.world.barricade.position.y = 0;
    this.world.arrows.visible = false;
    this.barricadeT = -1;
    this.pos.set(0, EYE, 11);
    this.yaw = 0;
    this.pitch = 0.12;
    this.hp = MAX_HP;
    this.elapsed = 0;
    this.thrown = 0;
    this.hits = 0;
    this.processed = 0;
    this.damageTaken = 0;
    this.counts = blankCounts();
    this.sp = 0;
    this.buffT = 0;
    this.dropCd = 4;
    this.slow = 0;
    this.invuln = 0;
    this.waveDelay = -1;
    this.doneT = 0;
    this.spReadyShown = false;
    for (const d of this.dirs) d.t = 0;
    $('bossbox').classList.remove('on');
    this.phase = 'title';
    this.start();
  }

  private beginWave(i: number): void {
    this.wave = i;
    const w = WAVES[i];
    this.queue = [];
    for (const [k, n] of Object.entries(w) as [SpawnKind, number][]) for (let j = 0; j < n; j++) this.queue.push(k);
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

  /** 마당을 다 정리하면 사회과학관 쪽 길이 열린다 */
  private openPath(): void {
    this.stage = 'path';
    this.bounds = [this.world.yard, this.world.path, this.world.plaza];
    this.barricadeT = 0;
    this.world.arrows.visible = true;
    this.banner('본관 앞 정리 완료!', '사회과학관 쪽 길이 열렸습니다 — 오른쪽 길로 가세요');
    this.sound('open');
  }

  private enterPlaza(): void {
    this.stage = 'plaza';
    this.bounds = [this.world.plaza];
    this.world.arrows.visible = false;
    this.banner('사회과학관 앞', '단체 회신 메일 폭풍이 몰려옵니다!');
    this.boss = new Boss(this, new THREE.Vector3(FRONT_X - 6, 26, 0), ORBIT_C);
    this.enemies.push(this.boss);
    $('bossbox').classList.add('on');
    this.sound('volley');
  }

  bossPhase2(): void {
    this.banner('회신이 회신을 부릅니다!', '서류 뭉치를 보스 곁에서 터뜨리면 크게 처리됩니다');
  }

  private bossDown(): void {
    this.stage = 'done';
    this.doneT = 4.2;
    this.banner('단체 회신 메일 폭풍 처리!', '오늘 업무 끝 — 퇴근 준비');
    for (const e of this.enemies) {
      if (e === this.boss || !e.targetable) continue;
      e.dead = true;
      e.die(ZERO, this);
      this.fx.mark(e.center, 1);
    }
    for (const s of this.sheets) {
      s.on = false;
      s.obj.visible = false;
    }
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

  private hint(kind: Kind): void {
    if (this.seen.has(kind)) return;
    this.seen.add(kind);
    const h = HINTS[kind];
    if (h) this.note(h, 3.2);
  }

  sound(name: SfxName, at?: THREE.Vector3, vol = 1): void {
    if (at) vol *= Math.max(0.15, 1 - at.distanceTo(this.eye) / 45);
    this.sfx.play(name, vol);
  }

  // ---------- 적 ----------

  private spawnPoint(out: THREE.Vector3, y: number): THREE.Vector3 {
    const side = Math.random() < 0.3;
    if (this.stage === 'plaza' || this.stage === 'done') {
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

  spawnAt(kind: 'mail' | 'bomb', at: THREE.Vector3): void {
    this.enemies.push(kind === 'mail' ? new Mail(this, false, at) : new Bomb(this, at));
    if (kind === 'bomb') this.hint('bomb');
  }

  minions(): number {
    let n = 0;
    for (const e of this.enemies) if (e.targetable && e.kind !== 'boss') n++;
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
    if (e.kind === 'boss') this.addSp(1.5);
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
    if (byPlayer) this.onProcessed(b);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const reach = 4.6 + (e.kind === 'boss' ? e.radius : 0.4);
      if (e.center.distanceTo(at) > reach) continue;
      if (e instanceof Bomb) {
        if (e.chainT < 0) {
          e.chainT = 0.16;
          e.chainBy = byPlayer;
        }
      } else {
        this.damage(e, e.kind === 'boss' ? 5 : 3, byPlayer ? 'blast' : 'fuse');
      }
    }
    if (!byPlayer && this.eye.distanceTo(at) < 3.8) this.hurt(3, at, 'bomb');
  }

  private onProcessed(e: Enemy): void {
    this.counts[e.kind]++;
    this.processed++;
    this.addSp(SP_GAIN[e.kind]);
    this.sound('process', e.center);
    this.fx.mark(e.center, e.kind === 'bulk' ? 1.6 : 1.2);
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
    let chance = 0.15;
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
    obj.position.set(x, 0, z);
    this.scene.add(obj);
    this.pickups.push({ kind, obj, item, ttl: 15, t: Math.random() * 6 });
  }

  private updatePickups(dt: number): void {
    let n = 0;
    for (const p of this.pickups) {
      p.t += dt;
      p.ttl -= dt;
      p.item.position.y = 0.55 + Math.sin(p.t * 3) * 0.12;
      p.item.rotation.y += dt * 1.6;
      p.obj.visible = p.ttl > 3 || Math.floor(p.ttl * 8) % 2 === 0;
      const near = Math.hypot(this.pos.x - p.obj.position.x, this.pos.z - p.obj.position.z) < 1.3;
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
    if (this.phase !== 'play' || this.sp < SP_MAX || this.stage === 'done' || this.stage === 'path') return;
    this.sp = 0;
    this.spReadyShown = false;
    this.sound('special');
    this.banner('전체 공지 발송!', '수신: 화면 안 모든 민원 · 회신 불필요');
    this.flashT = 0.45;
    this.fovKick = 1;
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
    } else if (e instanceof Bomb) {
      e.dead = true;
      e.die();
      this.onProcessed(e);
    } else {
      this.damage(e, 99, 'special');
    }
  }

  // ---------- 플레이어 ----------

  hurt(dmg: number, from: THREE.Vector3, kind: Kind = 'mail'): void {
    if (this.invuln > 0 || this.phase !== 'play' || this.stage === 'done') return;
    this.hp = Math.max(0, this.hp - dmg);
    this.damageTaken += dmg;
    this.invuln = 0.6;
    this.slow = 1.2;
    this.note(HURT_NOTE[kind]);
    const v = $('vignette');
    v.style.opacity = '1';
    setTimeout(() => (v.style.opacity = '0'), 160);
    this.sound('hurt');
    // 맞은 방향 표시 (가장 오래된 것을 다시 쓴다)
    let d = this.dirs[0];
    for (const x of this.dirs) if (x.t < d.t) d = x;
    d.from.copy(from);
    d.t = 1.1;
    if (this.hp <= 0) this.gameOver();
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
    const start = _v.set(0.3, -0.25, -0.5).applyQuaternion(_q).add(_w.set(this.pos.x, EYE, this.pos.z));
    if (TOUCH) this.aimAssist(start, dir);
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

  /** 터치에서만: 조준점 가까이(약 8도)의 적이 있으면 도장 방향을 살짝 그쪽으로 꺾는다 */
  private aimAssist(start: THREE.Vector3, dir: THREE.Vector3): void {
    let best: Enemy | null = null;
    let bestCos = Math.cos(0.14);
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const tx = e.center.x - start.x;
      const ty = e.center.y - start.y;
      const tz = e.center.z - start.z;
      const d = Math.hypot(tx, ty, tz);
      if (d > 45 || d < 0.5) continue;
      const c = (tx * dir.x + ty * dir.y + tz * dir.z) / d;
      if (c > bestCos) {
        bestCos = c;
        best = e;
      }
    }
    if (!best) return;
    const d = best.center.distanceTo(start);
    const t = d / STAMP_SPEED;
    dir.set(best.center.x - start.x, best.center.y + 2.5 * t * t - 0.8 * t - start.y, best.center.z - start.z).normalize();
  }

  private updateStamps(dt: number): void {
    for (const s of this.stamps) {
      if (!s.on) continue;
      s.life -= dt;
      s.vel.y -= 5 * dt;
      const p = s.obj.position;
      // 빠르게 날아가므로 두 번 나눠 움직이며 맞았는지 본다
      for (let k = 0; k < 2 && s.life > 0; k++) {
        p.addScaledVector(s.vel, dt / 2);
        for (const e of this.enemies) {
          if (!e.targetable) continue;
          if (p.distanceTo(e.center) < e.radius + 0.28) {
            this.stampHit(e, p);
            s.life = 0;
            break;
          }
        }
        if (s.life <= 0) break;
        for (const sh of this.sheets) {
          if (sh.on && p.distanceTo(sh.obj.position) < 0.55) {
            sh.on = false;
            sh.obj.visible = false;
            this.hits++;
            this.hitMarker(false);
            this.fx.confetti(sh.obj.position, 6, 3);
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

  private stampHit(e: Enemy, at: THREE.Vector3): void {
    this.hits++;
    this.fx.mark(at, 0.8);
    this.sound('hit', at);
    const r = this.damage(e, 1, 'stamp');
    this.hitMarker(r === 'kill');
  }

  private hitMarker(kill: boolean): void {
    const el = $('hitmark');
    el.className = kill ? 'hud kill' : 'hud';
    el.style.opacity = '1';
    this.hitTimer = kill ? 0.24 : 0.13;
  }

  sheet(from: THREE.Vector3, vel: THREE.Vector3): void {
    let s = this.sheets.find((x) => !x.on);
    if (!s) {
      s = { obj: this.models.sheet(), vel: new THREE.Vector3(), life: 0, on: false };
      this.scene.add(s.obj);
      this.sheets.push(s);
    }
    s.on = true;
    s.obj.visible = true;
    s.obj.position.copy(from);
    s.vel.copy(vel);
    s.life = 4;
  }

  private updateSheets(dt: number): void {
    for (const s of this.sheets) {
      if (!s.on) continue;
      s.life -= dt;
      s.obj.position.addScaledVector(s.vel, dt);
      s.obj.rotation.x += dt * 9;
      s.obj.rotation.y += dt * 6;
      if (s.obj.position.distanceTo(this.eye) < 0.8) {
        this.hurt(1, s.obj.position, 'boss');
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
    const speed = (running ? RUN : WALK) * (this.slow > 0 ? 0.55 : 1) * (this.stage === 'path' ? 1.35 : 1);
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
    if (len > 0.1) this.bob += dt * (running ? 13 : 9);
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
      .map((k) => (k === 'boss' ? `${KIND_LABEL[k][0]} 처리` : `${KIND_LABEL[k][0]} ${this.counts[k]}${KIND_LABEL[k][1]}`));
    return parts.length ? parts.join(' · ') : '처리한 민원 없음';
  }

  private gameOver(): void {
    this.phase = 'over';
    this.firing = false;
    document.exitPointerLock?.();
    $('bossbox').classList.remove('on');
    const where = this.stage === 'yard' ? '본관 앞' : '사회과학관 앞';
    this.overlay(`
      <div class="panel">
        <h1 style="color:#ff6b6b">야근 확정</h1>
        <p>${where}에서 민원에 묻혀 퇴근하지 못했습니다.</p>
        <p>처리 ${this.processed}건 · 명중률 ${this.accuracy()}%</p>
        <p class="counts" style="font-size:13px">${this.countsHtml()}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
  }

  /** 근무평정: 처리 시간 40 + 받은 민원 피해 30 + 명중률 30 (본편 2D와 같은 S~D 구간) */
  gradeRun(): { rows: [string, string, number, number][]; total: number; grade: string } {
    const step = (v: number, table: [number, number][], fallback: number) => {
      for (const [limit, pts] of table) if (v <= limit) return pts;
      return fallback;
    };
    const m = Math.floor(this.elapsed / 60);
    const s = Math.floor(this.elapsed % 60);
    const acc = this.accuracy();
    const time = step(this.elapsed, [[150, 40], [210, 30], [300, 20]], 10);
    const dmg = step(this.damageTaken, [[0, 30], [3, 22], [7, 14]], 6);
    const aim = acc >= 70 ? 30 : acc >= 55 ? 22 : acc >= 40 ? 14 : 6;
    const total = time + dmg + aim;
    const grade = total >= 90 ? 'S' : total >= 74 ? 'A' : total >= 56 ? 'B' : total >= 38 ? 'C' : 'D';
    return {
      rows: [
        ['처리 시간', `${m}분 ${s.toString().padStart(2, '0')}초`, time, 40],
        ['받은 민원 피해', `${this.damageTaken}`, dmg, 30],
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
    const clock = START_CLOCK + this.elapsed / 60;
    const g = this.gradeRun();
    const offText = clock <= OFF_HOURS ? `정시 퇴근 · 17:00까지 ${Math.ceil(OFF_HOURS - clock)}분 여유` : `초과근무 ${Math.ceil(clock - OFF_HOURS)}분`;
    const rows = g.rows.map(([l, v, p, mx]) => `<tr><td>${l}</td><td>${v}</td><td class="pts">${p}/${mx}</td></tr>`).join('');
    this.overlay(`
      <div class="panel result">
        <img class="emblem" src="hufs/emblem-mono.png" alt="">
        <h1>오늘 업무 끝!</h1>
        <p class="big">${clockText(clock)} 퇴근 · ${offText}</p>
        <div class="sheet">
          <div class="grade g-${g.grade}"><small>근무평정</small>${g.grade}</div>
          <table>${rows}<tr><td>합계</td><td></td><td class="pts">${g.total}/100</td></tr></table>
        </div>
        <p class="counts">${this.countsHtml()}</p>
        <button id="againBtn" type="button">다시 하기</button>
        <a class="btn" href="./">본편(2D)으로</a>
      </div>`);
    $('againBtn').addEventListener('click', () => this.restart());
  }

  // ---------- 매 프레임 ----------

  tick(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.phase === 'play') this.step(dt);
    else if (this.phase === 'title') this.yaw = Math.sin(now / 4000) * 0.25;
    this.camera.position.set(this.pos.x, EYE + Math.sin(this.bob) * 0.05, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // 도장 휘두르기
    // 팔을 앞으로 밀며 도장 머리를 숙인다 (소매가 화면을 가리지 않게)
    this.swing = Math.max(0, this.swing - dt * 5);
    const sw = Math.sin(this.swing * Math.PI);
    this.viewmodel.rotation.x = 0.15 + sw * 0.55;
    this.viewmodel.position.y = -0.3 + Math.sin(this.bob * 0.5) * 0.012 + sw * 0.04;
    this.viewmodel.position.z = -0.6 - sw * 0.16;
    this.handStamp.visible = this.cooldown < this.curCd * 0.4;
    if (this.fovKick > 0) {
      this.fovKick = Math.max(0, this.fovKick - dt * 1.8);
      this.camera.fov = 70 + Math.sin(this.fovKick * Math.PI) * 9;
      this.camera.updateProjectionMatrix();
    }
    this.followSun();
    if (this.world) this.world.arrowMat.opacity = 0.55 + Math.sin(now * 0.007) * 0.4;
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** 그림자 범위를 플레이어 근처로 옮긴다 (10m 단위로 끊어 그림자 떨림을 줄인다) */
  private followSun(): void {
    if (!this.world) return;
    const x = Math.round(this.pos.x / 10) * 10;
    const z = Math.round(this.pos.z / 10) * 10;
    if (x === this.sunX && z === this.sunZ) return;
    this.sunX = x;
    this.sunZ = z;
    const sun = this.world.sun;
    sun.target.position.set(x, 0, z);
    sun.position.set(x - 40, 60, z + 30);
  }

  private step(dt: number): void {
    this.elapsed += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slow > 0) this.slow -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.buffT > 0) this.buffT -= dt;
    if (this.dropCd > 0) this.dropCd -= dt;
    if (this.firing) this.fire();
    this.move(dt);
    this.eye.set(this.pos.x, EYE - 0.25, this.pos.z);

    if (this.stage === 'yard') {
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
    } else if (this.stage === 'path') {
      if (this.pos.x > PLAZA_X) this.enterPlaza();
    } else if (this.stage === 'done') {
      this.doneT -= dt;
      if (this.doneT <= 0) {
        this.finish();
        return;
      }
    }
    if (this.barricadeT >= 0) {
      this.barricadeT += dt;
      this.world.barricade.position.y = -Math.min(1.6, this.barricadeT * 1.4);
      if (this.barricadeT > 1.2) {
        this.world.barricade.visible = false;
        this.barricadeT = -1;
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.noticeT >= 0) {
        e.noticeT -= dt;
        if (e.noticeT < 0) this.noticeHit(e);
      }
      if (!e.gone) e.update(dt, this);
    }
    // 끝난 적은 치운다 (자리 당겨 쓰기)
    let n = 0;
    for (const e of this.enemies) {
      if (e.gone) this.removeEnemy(e);
      else this.enemies[n++] = e;
    }
    this.enemies.length = n;
    if (this.boss && this.boss.gone) this.boss = null;

    this.updateStamps(dt);
    this.updateSheets(dt);
    this.updatePickups(dt);
    this.fx.update(dt);
  }

  private setText(id: string, s: string, html = false): void {
    if (this.hudCache.get(id) === s) return;
    this.hudCache.set(id, s);
    if (html) $(id).innerHTML = s;
    else $(id).textContent = s;
  }

  private setStyle(id: string, prop: 'width' | 'opacity' | 'transform', s: string): void {
    const key = `${id}.${prop}`;
    if (this.hudCache.get(key) === s) return;
    this.hudCache.set(key, s);
    $(id).style[prop] = s;
  }

  private updateHud(dt: number): void {
    const clock = START_CLOCK + this.elapsed / 60;
    const left = Math.ceil(OFF_HOURS - clock);
    const place = this.stage === 'yard' ? '본관 앞' : this.stage === 'path' ? '사회과학관 가는 길' : '사회과학관 앞';
    this.setText('clock', `${clockText(clock)} · ${left > 0 ? `퇴근까지 ${left}분` : `초과근무 ${Math.floor(clock - OFF_HOURS)}분`}<small>1인칭 시험판 · ${place}</small>`, true);
    const r = this.hp / MAX_HP;
    this.setStyle('hpbar', 'width', `${r * 100}%`);
    $('hpbar').style.background = r > 0.5 ? '#5bd16b' : r > 0.25 ? '#f5c542' : '#e5484d';
    this.setStyle('spbar', 'width', `${Math.round(this.sp)}%`);
    const ready = this.sp >= SP_MAX;
    this.setText('splabel', ready ? (TOUCH ? '전체 공지 발송 — 노란 버튼' : '전체 공지 발송 — Q') : '전체 공지 발송');
    if (this.hudCache.get('ready') !== String(ready)) {
      this.hudCache.set('ready', String(ready));
      $('sp').classList.toggle('ready', ready);
      $('spBtn').classList.toggle('ready', ready);
    }
    let wave: string;
    if (this.stage === 'yard') wave = `${this.wave + 1}차 민원 ${this.queue.length + this.minions()}건 남음 · 처리 ${this.processed}건`;
    else if (this.stage === 'path') wave = `사회과학관 앞으로 이동하세요 · 처리 ${this.processed}건`;
    else wave = `사회과학관 앞 · 처리 ${this.processed}건`;
    this.setText('wave', wave);
    this.setText('buff', this.buffT > 0 ? `아메리카노 ${Math.ceil(this.buffT)}초 · 빨리 던지기` : '');
    if (this.boss) this.setStyle('bossbar', 'width', `${(this.boss.hp / this.boss.maxHp) * 100}%`);
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
      $('flash').style.opacity = String((this.flashT / 0.45) * 0.85);
    }
    // 맞은 방향
    for (const d of this.dirs) {
      if (d.t <= 0) continue;
      d.t -= dt;
      const rel = wrap(Math.atan2(-(d.from.x - this.pos.x), -(d.from.z - this.pos.z)) - this.yaw);
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = d.t > 0 ? String(Math.min(1, d.t * 1.6)) : '0';
    }
    // 길 안내
    if (this.stage === 'path' && this.phase === 'play') {
      const rel = wrap(Math.atan2(-(PLAZA_X + 3 - this.pos.x), -(1 - this.pos.z)) - this.yaw);
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
if (DEBUG) Object.assign(window as object, { __fps: game, __fpsLib: { Mail, Phone, Bubble, Bomb, Boss, THREE } });
