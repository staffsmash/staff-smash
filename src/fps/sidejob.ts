import * as THREE from 'three';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Enemy } from './enemies';
import type { Fx } from './fx';
import { Person, type Look, type PoseIn } from './people';
import { prepareSpeech } from './speech';

// 1인칭 교직원 모드: 돕기 이벤트 — 미화 선생님·조리사 선생님 (사용자 2026-11-20).
// - 한 판에 한 번. 3~5구역(인문과학관 앞·국제학사 앞·대운동장 = areaOf 2·3·4) 가운데 무작위 한 곳의 민원 차례 중에
//   두 분 가운데 무작위 한 분이 나온다. 예산팀 직원·조력자·구조 장면이 끝난 뒤에 나온다 (SideHost.free).
//   이벤트가 나올 차례이거나 진행 중이면 민원 차례가 끝나지 않는다 → 중간보스는 이벤트가 끝난 뒤 (Game.stepWave가 holds를 본다).
// - 나타나면 화면 띠. 가까이 가서 E(터치: "돕기" 버튼) → 20초. 30초 동안 말을 걸지 않으면 떠난다 (불이익 없음).
//   시작한 뒤 시간 안에 못 끝내도 불이익은 없고 보상만 없다. 실패·떠날 때는 대사 뒤 걸어 나간다.
//   돕는 동안에도 민원은 계속 날아온다 (잡몹이 적으면 가끔 하나씩 — TRICKLE).
//   · 미화 선생님 (청소 조끼·빗자루·청소 수레): 바닥 쓰레기(구겨진 종이·종이컵) 5~6개를 걸어가서 줍는다 (가까이 가면 자동)
//     → 빗자루 3 · 쓰레기통 폭탄 1 (F로 쓴다, 빗자루부터)
//   · 조리사 선생님 (흰 조리복·조리모·식재료 수레): 식재료 상자 3개를 하나씩 들어 수레로 나른다 (든 동안 조금 느려진다)
//     → 소고기콩나물밥(체력 +5) · 교직원 식당 통닭(체력 모두 회복) (R로 먹는다, 콩나물밥부터. 체력이 가득하면 안 먹는다)
// - 아이템은 쓸 때까지 들고 간다 (다음 구역·대장 보스·총장전 포함). 쓰러지거나 다시 하면 사라진다 (clear).
//   빗자루: 일직선으로 날아가며 잡몹 최대 3개 처리, 보스(사람)는 도장 몸통 3발만큼 결재 진행.
//   쓰레기통 폭탄: 떨어진 자리 둘레 4m 잡몹 처리, 보스는 도장 8발만큼 (Game.itemHit — 사람은 다치지 않는다).
// - 선생님은 사람이라 다치지 않는다 (적 목록에 없다 — 도장이 지나간다). 학생 모드에는 나오지 않는다.

type Kind = 'cleaner' | 'cook';
type State = 'idle' | 'wait' | 'work' | 'talk' | 'out';

/** 이벤트가 나올 수 있는 구역 (areaOf, 0부터) */
export const SIDE_AREAS = [2, 3, 4];
/** 돕는 시간 (초) */
export const WORK_T = 20;
/** 말을 걸지 않으면 떠나는 시간 (초) */
export const WAIT_T = 30;
/** 상자를 든 동안 걷는 속도 배율 */
export const CARRY_SLOW = 0.72;
/** 빗자루: 잡몹 최대 수, 보스에게 도장 몇 발 */
export const BROOM_MAX = 3;
export const BROOM_STAMPS = 3;
/** 쓰레기통 폭탄: 둘레 (m), 보스에게 도장 몇 발 */
export const BIN_R = 4;
export const BIN_STAMPS = 8;
/** 소고기콩나물밥: 체력 몇 칸 */
export const BAP_HEAL = 5;
/** 플레이어 앞 몇 m에 나타나는지 */
const SPOT_D = 9;
/** E·돕기 버튼이 뜨는 거리 (m) */
const NEAR = 3.6;
const CRATES = 3;
/** 줍는 거리 (쓰레기·상자), 수레에 내려놓는 거리 (m) */
const PICK_D = 1.3;
const DROP_D = 2.2;
const BROOM_V = 30;
const BROOM_RANGE = 34;
/** 돕는 동안 잡몹이 TRICKLE_MAX 개 아래면 TRICKLE_T 초마다 하나씩 더 온다 */
const TRICKLE_T = 3.5;
const TRICKLE_MAX = 3;

/** 화면 문구 (사용자 확정 2026-11-20 — 글자 그대로) */
const T = {
  cleaner: {
    name: '미화 선생님',
    title: '미화 선생님이 청소 중이에요',
    sub: '청소 돕기',
    bubble: '오늘따라 쓰레기가 많네요…',
    start: '쓰레기를 주워 주세요',
    win: '덕분에 금방 끝났어요. 이거 가져가요!',
    got: '빗자루 3 · 쓰레기통 폭탄 1 획득',
    key: '(F)',
    fail: '청소가 끝이 없네유 흑흑',
  },
  cook: {
    name: '조리사 선생님',
    title: '조리사 선생님이 식재료를 나르고 있어요',
    sub: '나르기 돕기',
    bubble: '점심 준비가 밀렸어요…',
    start: '상자를 수레로 옮겨 주세요',
    win: '고마워요. 따뜻할 때 먹어요!',
    got: '소고기콩나물밥 · 교직원 식당 통닭 획득',
    key: '(R)',
    fail: '석식도 밀렸어 으아악~',
  },
} as const;
const BTN = '돕기';

/** Game이 빌려주는 것 (main.ts sideHost) */
export interface SideHost {
  readonly touch: boolean;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly fx: Fx;
  readonly mode: 'staff' | 'student';
  /** 판이 돌아가는 중 (일시정지·결과 화면이 아님) */
  readonly playing: boolean;
  /** 잠깐 멈춤 중 (던지지도 먹지도 못한다) */
  readonly frozen: boolean;
  readonly pos: THREE.Vector3;
  /** 눈높이 (점프 포함) */
  readonly eyeY: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly area: Rect;
  readonly hp: number;
  readonly maxHp: number;
  /** 서지 말아야 할 곳 (장애물·상자·자판기) */
  solids(): readonly Rect[];
  areaNo(): number;
  /** 지금 교직원 민원 차례 중 */
  waveOk(): boolean;
  /** 지금 바로 시작해도 되는지 (예산팀 직원·조력자·구조 장면·멈춤·카드가 없을 때) */
  free(): boolean;
  enemies(): readonly Enemy[];
  /** 사람 보스(중간보스 포함) */
  isBoss(e: Enemy): boolean;
  /** 잡몹은 처리, 보스(사람)는 도장 몸통 stamps발만큼 결재 진행 */
  itemHit(e: Enemy, stamps: number): void;
  /** 보스를 뺀 살아 있는 적 수 */
  minions(): number;
  /** 돕는 동안 민원 하나 더 (메일·전화기) */
  spawnMob(): void;
  heal(n: number): void;
  banner(title: string, sub?: string): void;
  note(text: string, time?: number): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
}

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const UNIT = new THREE.BoxGeometry(1, 1, 1);

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const SKIN = 0xf1c7a0;
const LOOKS: Record<Kind, Look> = {
  // 하늘색 작업복 + 연두색 청소 조끼 (빗자루는 따로 붙인다)
  cleaner: { top: 0x7fa6c9, pants: 0x3a3f47, tie: 0x7fa6c9, noTie: true, skin: SKIN, hair: 0x3b3531, brow: 0x3b3531, hairStyle: 'full', jacket: false, vest: 0xb5d44a, smile: true, left: 'none', scale: 1.4 },
  // 흰 조리복·앞치마 (조리모는 따로 붙인다)
  cook: { top: 0xffffff, pants: 0xeceff2, tie: 0xd0202f, skin: SKIN, hair: 0x2a2420, brow: 0x2a2420, hairStyle: 'full', jacket: false, apron: true, smile: true, left: 'none', scale: 1.4 },
};

function buildBroom(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.05, 1.5, 0.05, 0, 0, 0, lam(0xb98a52));
  box(g, 0.34, 0.26, 0.09, 0, -0.86, 0, lam(0xd9b44a));
  box(g, 0.36, 0.05, 0.1, 0, -0.72, 0, lam(0xb3262d));
  return g;
}

function buildBin(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 10), lam(0x4d7fd6));
  body.castShadow = true;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 10), lam(0x2f55a0));
  lid.position.y = 0.28;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), lam(0xe5484d));
  knob.position.y = 0.36;
  g.add(body, lid, knob);
  return g;
}

function buildCrate(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.62, 0.36, 0.44, 0, 0.18, 0, lam(0xc79a5b));
  box(g, 0.64, 0.05, 0.46, 0, 0.3, 0, lam(0xa67c43));
  // 콩나물·채소가 삐죽
  box(g, 0.5, 0.08, 0.32, 0, 0.39, 0, lam(0xf2e6a8));
  box(g, 0.16, 0.12, 0.14, 0.14, 0.44, 0.04, lam(0x5bbf63));
  return g;
}

/** 머리 위에 떠 있는 노란 표시 (어디 있는지 보이게) */
function buildMark(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
  m.rotation.x = Math.PI;
  return m;
}

function buildTrash(i: number): THREE.Group {
  const g = new THREE.Group();
  if (i % 2) {
    // 종이컵 (빨간 띠)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.24, 8), lam(0xf4f4f4));
    cup.position.y = 0.1;
    cup.rotation.z = 1.2;
    cup.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.08, 8), lam(0xb3262d));
    band.position.copy(cup.position);
    band.rotation.z = 1.2;
    g.add(cup, band);
  } else {
    // 구겨진 종이
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), lam(0xe9e6dc));
    ball.position.y = 0.15;
    ball.castShadow = true;
    g.add(ball);
  }
  return g;
}

function buildCleanCart(): THREE.Group {
  const g = new THREE.Group();
  const grey = lam(0x555b66);
  box(g, 0.9, 0.5, 0.55, 0, 0.5, 0, lam(0xf2c230));
  box(g, 0.96, 0.05, 0.6, 0, 0.2, 0, grey);
  box(g, 0.05, 0.9, 0.05, -0.46, 0.8, -0.26, grey);
  box(g, 0.05, 0.9, 0.05, -0.46, 0.8, 0.26, grey);
  box(g, 0.05, 0.05, 0.57, -0.46, 1.24, 0, grey);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 10), lam(0x4d7fd6));
  bucket.position.set(0.18, 0.9, 0);
  bucket.castShadow = true;
  g.add(bucket);
  // 대걸레 자루
  box(g, 0.04, 0.9, 0.04, 0.3, 1.2, -0.12, lam(0xb98a52));
  for (const [x, z] of [[-0.36, -0.24], [-0.36, 0.24], [0.36, -0.24], [0.36, 0.24]]) box(g, 0.12, 0.14, 0.12, x, 0.1, z, lam(0x1c1c1c));
  return g;
}

function buildFoodCart(): THREE.Group {
  const g = new THREE.Group();
  const steel = lam(0xc9ced8);
  box(g, 1.1, 0.05, 0.62, 0, 0.3, 0, steel);
  box(g, 1.1, 0.05, 0.62, 0, 0.85, 0, steel);
  for (const [x, z] of [[-0.52, -0.28], [-0.52, 0.28], [0.52, -0.28], [0.52, 0.28]]) {
    box(g, 0.05, 0.95, 0.05, x, 0.55, z, steel);
    box(g, 0.12, 0.14, 0.12, x, 0.07, z, lam(0x1c1c1c));
  }
  box(g, 0.05, 0.05, 0.62, -0.56, 1.02, 0, steel);
  // 큰 솥
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 12), lam(0x8e949e));
  pot.position.set(-0.2, 1.03, 0);
  pot.castShadow = true;
  g.add(pot);
  return g;
}

/** 구역 안, 장애물 밖으로 (trapped.ts와 같은 방식) */
function placeIn(a: Rect, solids: readonly Rect[], x: number, z: number, margin: number): [number, number] {
  const M = 1.4;
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

/** 선분 a→b 와 점 c 사이 거리 */
function segDist(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  _ab.subVectors(b, a);
  const l2 = _ab.lengthSq();
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, _ac.subVectors(c, a).dot(_ab) / l2)) : 0;
  return _cp.copy(a).addScaledVector(_ab, t).distanceTo(c);
}

/** 바닥의 쓰레기·상자 */
interface Item {
  obj: THREE.Group;
  mark: THREE.Mesh;
  markY: number;
  on: boolean;
}

/** 던진 빗자루·쓰레기통 폭탄 */
interface Shot {
  kind: 'broom' | 'bin';
  obj: THREE.Group;
  vel: THREE.Vector3;
  on: boolean;
  dist: number;
  /** 이미 맞힌 것, 처리한 잡몹 수 (빗자루는 BROOM_MAX에서 멈춘다) */
  hits: Set<Enemy>;
  minions: number;
}

/** 화면 조각 (ensureDom) */
interface SideDom {
  items: HTMLElement;
  hint: HTMLElement;
  btn: HTMLButtonElement | null;
  itemBtn: HTMLButtonElement | null;
  lunchBtn: HTMLButtonElement | null;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _cp = new THREE.Vector3();

export class SideJob {
  state: State = 'idle';
  kind: Kind = 'cleaner';
  /** 이번 판에 이벤트가 나올 구역과 누가 나오는지 (판마다 새로 정한다) */
  eventArea = 2;
  staffKind: Kind = 'cleaner';
  /** 이번 판 이벤트가 나왔다 (한 판에 한 번) */
  done = false;
  /** 시험용: 결과 ('' | 'win' | 'fail' | 'ignored') */
  result = '';
  /** 들고 있는 것 */
  brooms = 0;
  bins = 0;
  bap = 0;
  tongdak = 0;
  /** 지금 E·돕기를 누를 수 있다 */
  near = false;
  /** 주운(나른) 수 / 필요한 수 */
  got = 0;
  need = 0;
  /** 상자를 들고 있다 */
  carrying = false;
  /** 시험용: 마지막으로 던진 것이 처리한 잡몹 수·맞힌 보스 수 */
  lastShot = { kind: '', minions: 0, bosses: 0 };
  /** 시험용으로도 읽는다: 바닥 쓰레기, 식재료 상자, 수레 자리 */
  readonly trash: Item[] = [];
  readonly crates: Item[] = [];
  readonly cart = new THREE.Vector3();
  private readonly people: Record<Kind, Person>;
  private who: Person | null = null;
  private readonly obj = new THREE.Group();
  private readonly decor = new THREE.Group();
  private readonly cleanCart = buildCleanCart();
  private readonly foodCart = buildFoodCart();
  private readonly dropRing: THREE.Mesh;
  private readonly held = buildCrate();
  private readonly shots: Shot[] = [];
  private readonly anchor = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private readonly pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
  private t = 0;
  private sayT = 0;
  private said = false;
  private waitT = -1;
  private trickleT = 0;
  private won = false;
  private useCd = 0;
  private uiKey = '';
  private readonly el: SideDom;

  constructor(private readonly h: SideHost) {
    const mk = (k: Kind, color: string) => {
      const p = new Person('meeting', T[k].name, color, LOOKS[k]);
      p.clip.visible = false;
      return p;
    };
    this.people = { cleaner: mk('cleaner', '#c8f08a'), cook: mk('cook', '#ffffff') };
    // 미화 선생님: 왼손 빗자루
    const broom = buildBroom();
    broom.position.set(0.02, -0.62, 0.17);
    this.people.cleaner.armL.add(broom);
    // 조리사 선생님: 조리모 (챙 + 높은 모자)
    const hat = lam(0xffffff);
    const head = this.people.cook.head;
    box(head, 0.58, 0.1, 0.54, 0, 0.63, 0, hat);
    box(head, 0.5, 0.36, 0.46, 0, 0.84, 0, hat);
    box(head, 0.56, 0.12, 0.52, 0, 1.04, 0, hat);
    this.obj.visible = false;
    this.decor.visible = false;
    this.cleanCart.position.set(1.6, 0, 0.1);
    this.foodCart.position.set(1.8, 0, 0.2);
    this.decor.add(this.cleanCart, this.foodCart);
    // 상자를 내려놓는 곳 (수레 둘레 초록 고리)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.75, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7cfc9a, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    ring.position.y = 0.06;
    ring.visible = false;
    this.dropRing = ring;
    h.scene.add(this.obj, this.decor, ring);
    for (let i = 0; i < 6; i++) this.trash.push(this.item(buildTrash(i), 0.75));
    for (let i = 0; i < CRATES; i++) this.crates.push(this.item(buildCrate(), 1.0));
    // 손에 든 상자 (화면 아래)
    this.held.position.set(-0.08, -0.5, -1.0);
    this.held.scale.setScalar(0.55);
    this.held.rotation.y = 0.2;
    this.held.visible = false;
    h.camera.add(this.held);
    prepareSpeech([T.cleaner.bubble, T.cleaner.win, T.cleaner.fail, T.cook.bubble, T.cook.win, T.cook.fail]);
    this.el = ensureDom();
    for (const [el, fn] of [
      [this.el.btn, () => this.use()],
      [this.el.itemBtn, () => this.useItem()],
      [this.el.lunchBtn, () => this.eat()],
    ] as [HTMLElement | null, () => void][]) {
      if (!el) continue;
      el.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          fn();
        },
        { passive: false },
      );
      el.addEventListener('click', fn);
    }
    this.plan();
  }

  private item(obj: THREE.Group, markY: number): Item {
    const mark = buildMark();
    mark.position.y = markY;
    obj.add(mark);
    obj.visible = false;
    this.h.scene.add(obj);
    return { obj, mark, markY, on: false };
  }

  /** 이번 판 이벤트 구역과 인물을 정한다 */
  private plan(): void {
    this.eventArea = SIDE_AREAS[Math.floor(Math.random() * SIDE_AREAS.length)];
    this.staffKind = Math.random() < 0.5 ? 'cleaner' : 'cook';
  }

  /** 상자를 든 동안 걷는 속도 배율 (Game.move) */
  get speedMul(): number {
    return this.carrying ? CARRY_SLOW : 1;
  }

  /** 이벤트가 나올 차례이거나 진행 중이면 민원 차례를 붙잡는다 (Game.stepWave) */
  holds(): boolean {
    if (this.h.mode !== 'staff') return false;
    if (this.state === 'wait' || this.state === 'work' || this.state === 'talk') return true;
    return this.state === 'idle' && !this.done && this.h.areaNo() === this.eventArea && this.h.waveOk();
  }

  /** HUD 민원 줄 앞에 붙이는 글 ("청소 돕기 2/6 · 14초"), 없으면 null */
  status(): string | null {
    if (this.state !== 'work') return null;
    return `${T[this.kind].sub} ${this.got}/${this.need} · ${Math.max(0, Math.ceil(WORK_T - this.t))}초`;
  }

  /** 시험용 (?debug): 구역·차례와 상관없이 지금 바로 (이번 판 한 번은 그대로 남는다) */
  call(kind: Kind = this.staffKind): boolean {
    if (this.state !== 'idle' || this.h.mode !== 'staff' || !this.h.playing) return false;
    this.begin(kind);
    return true;
  }

  // ---------- 매 단계 ----------

  update(dt: number): void {
    const h = this.h;
    if (this.useCd > 0) this.useCd -= dt;
    this.updateShots(dt);
    this.near = false;
    if (this.state === 'idle') {
      if (h.mode !== 'staff' || !h.playing || this.done || h.areaNo() !== this.eventArea || !h.waveOk()) {
        this.waitT = -1;
        return;
      }
      if (this.waitT < 0) this.waitT = 3 + Math.random() * 2;
      this.waitT -= dt;
      if (this.waitT <= 0 && h.free()) {
        this.done = true;
        this.begin(this.staffKind);
      }
      return;
    }
    const who = this.who;
    if (!who) return;
    this.t += dt;
    const pose = this.pose;
    pose.walking = false;
    pose.wave = false;
    pose.raise = 0;
    pose.reach = 0;
    const dPlayer = Math.hypot(h.pos.x - this.obj.position.x, h.pos.z - this.obj.position.z);
    switch (this.state) {
      case 'wait':
        // 미화 선생님은 비질, 조리사 선생님은 상자를 안은 자세로 기다린다
        if (this.kind === 'cleaner') pose.reach = 0.3 + Math.sin(this.t * 5) * 0.25;
        else pose.reach = 0.55;
        if (dPlayer < 12) this.face(h.pos.x, h.pos.z, dt);
        this.near = h.playing && dPlayer < NEAR;
        this.sayT -= dt;
        if (this.sayT <= 0) {
          this.sayT = 7;
          // 처음 한 번만 자막도 (그다음은 말풍선만)
          who.say(T[this.kind].bubble, 3, !this.said);
          this.said = true;
        }
        if (this.t >= WAIT_T) this.end('ignored');
        break;
      case 'work':
        this.face(h.pos.x, h.pos.z, dt);
        if (this.kind === 'cleaner') {
          pose.reach = 0.3 + Math.sin(this.t * 5) * 0.25;
          this.stepClean();
        } else this.stepCarry();
        this.bobMarks();
        this.trickle(dt);
        if (this.state === 'work' && this.t >= WORK_T) this.end('fail');
        break;
      case 'talk':
        this.face(h.pos.x, h.pos.z, dt);
        pose.wave = this.won && this.t > 1.4;
        if (this.t >= 3) this.go('out');
        break;
      case 'out': {
        pose.walking = true;
        const o = this.obj.position;
        _a.set(this.exit.x - o.x, 0, this.exit.z - o.z);
        const d = _a.length();
        if (d < 0.3 || this.t > 6) {
          this.finish();
          return;
        }
        o.addScaledVector(_a.normalize(), Math.min(d, 3.4 * dt));
        this.face(this.exit.x, this.exit.z, dt);
        // 수레는 땅으로 내려간다
        this.decor.position.y = -Math.min(2, this.t * 1.4);
        break;
      }
      default:
        break;
    }
    who.update(dt, pose);
  }

  private bobMarks(): void {
    const y = Math.sin(this.t * 4) * 0.08;
    for (const it of this.trash) if (it.on) it.mark.position.y = it.markY + y;
    for (const it of this.crates) if (it.on) it.mark.position.y = it.markY + y;
  }

  /** 돕는 동안에도 민원은 온다: 잡몹이 적으면 가끔 하나씩 */
  private trickle(dt: number): void {
    this.trickleT -= dt;
    if (this.trickleT > 0) return;
    this.trickleT = TRICKLE_T;
    if (this.h.minions() < TRICKLE_MAX) this.h.spawnMob();
  }

  private stepClean(): void {
    const h = this.h;
    for (const it of this.trash) {
      if (!it.on) continue;
      const p = it.obj.position;
      if (Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > PICK_D) continue;
      it.on = false;
      it.obj.visible = false;
      this.got++;
      h.sound('pickup', undefined, 0.7);
      h.fx.confetti(_a.set(p.x, 0.5, p.z), 6, 2, 0xffffff, 1.4, 0.5);
      if (this.got >= this.need) {
        this.end('win');
        return;
      }
      h.note(`${T.cleaner.start} (${this.got}/${this.need})`, 1.6);
    }
  }

  private stepCarry(): void {
    const h = this.h;
    if (!this.carrying) {
      for (const it of this.crates) {
        if (!it.on) continue;
        const p = it.obj.position;
        if (Math.hypot(h.pos.x - p.x, h.pos.z - p.z) > PICK_D + 0.1) continue;
        it.on = false;
        it.obj.visible = false;
        this.carrying = true;
        this.held.visible = true;
        h.sound('pickup', undefined, 0.7);
        break;
      }
      return;
    }
    if (Math.hypot(h.pos.x - this.cart.x, h.pos.z - this.cart.z) > DROP_D) return;
    this.carrying = false;
    this.held.visible = false;
    this.got++;
    h.sound('process', undefined, 0.8);
    h.fx.confetti(_a.set(this.cart.x, 1, this.cart.z), 8, 2, 0xf2e6a8, 1.6, 0.5);
    if (this.got >= this.need) this.end('win');
    else h.note(`${T.cook.start} (${this.got}/${this.need})`, 1.6);
  }

  // ---------- 시작·끝 ----------

  private begin(kind: Kind): void {
    const h = this.h;
    this.kind = kind;
    this.result = '';
    this.won = false;
    this.t = 0;
    this.sayT = 1.2;
    this.said = false;
    this.waitT = -1;
    this.got = 0;
    this.need = 0;
    this.carrying = false;
    const solids = h.solids();
    const p = h.pos;
    // 자리: 플레이어 앞 9m (구역 끝·장애물을 피해 옆으로)
    let best = -1;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const ang = h.yaw + da;
      const [x, z] = placeIn(h.area, solids, p.x - Math.sin(ang) * SPOT_D, p.z - Math.cos(ang) * SPOT_D, 3);
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
    const [ex, ez] = placeIn(h.area, solids, this.anchor.x + (ox / ol) * 14, this.anchor.z + (oz / ol) * 14, 0.6);
    this.exit.set(ex, 0, ez);
    const who = (this.who = this.people[kind]);
    who.reset();
    who.clip.visible = false;
    who.root.position.set(0, 0, 0);
    this.obj.add(who.root);
    const yaw = Math.atan2(p.x - this.anchor.x, p.z - this.anchor.z);
    for (const g of [this.obj, this.decor]) {
      g.position.copy(this.anchor);
      g.rotation.y = yaw;
      g.visible = true;
    }
    this.decor.position.y = 0;
    this.cleanCart.visible = kind === 'cleaner';
    this.foodCart.visible = kind === 'cook';
    this.decor.updateMatrixWorld(true);
    (kind === 'cook' ? this.foodCart : this.cleanCart).getWorldPosition(this.cart);
    this.cart.y = 0;
    this.state = 'wait';
    const t = T[kind];
    h.banner(t.title, h.touch ? `가까이 가서 ${BTN} 버튼 — ${t.sub}` : `가까이 가서 E — ${t.sub}`);
    h.sound('open', this.anchor, 0.8);
  }

  /** E·돕기 버튼: 가까이 있으면 20초를 시작한다. 쓴 것이면 true (아니면 E는 자판기·경비원) */
  use(): boolean {
    if (this.state !== 'wait' || !this.near || !this.h.playing) return false;
    const h = this.h;
    this.t = 0;
    this.trickleT = 2;
    const solids = h.solids();
    const scatter = (items: Item[], n: number, from: THREE.Vector3, r0: number, r1: number) => {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.on = i < n;
        it.obj.visible = it.on;
        if (!it.on) continue;
        let x = from.x;
        let z = from.z;
        for (let tries = 0; tries < 10; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = r0 + Math.random() * (r1 - r0);
          [x, z] = placeIn(h.area, solids, from.x + Math.cos(a) * r, from.z + Math.sin(a) * r, 1.2);
          if (Math.hypot(x - h.pos.x, z - h.pos.z) > 3 && Math.hypot(x - from.x, z - from.z) > 2.6) break;
        }
        it.obj.position.set(x, 0.02, z);
        it.obj.rotation.y = Math.random() * 6;
        it.mark.position.y = it.markY;
      }
    };
    if (this.kind === 'cleaner') {
      this.need = 5 + (Math.random() < 0.5 ? 1 : 0);
      scatter(this.trash, this.need, this.anchor, 3.5, 9);
    } else {
      this.need = CRATES;
      scatter(this.crates, CRATES, this.cart, 5, 8);
      this.dropRing.position.set(this.cart.x, 0.06, this.cart.z);
      this.dropRing.visible = true;
    }
    this.state = 'work';
    h.note(`${T[this.kind].start} (0/${this.need})`, 2.4);
    h.sound('tick', undefined, 0.8);
    return true;
  }

  private end(r: 'win' | 'fail' | 'ignored'): void {
    const h = this.h;
    const who = this.who as Person;
    const t = T[this.kind];
    this.result = r;
    this.won = r === 'win';
    this.carrying = false;
    this.held.visible = false;
    this.dropRing.visible = false;
    for (const it of [...this.trash, ...this.crates]) {
      it.on = false;
      it.obj.visible = false;
    }
    if (r === 'win') {
      who.say(t.win, 3);
      if (this.kind === 'cleaner') {
        this.brooms += 3;
        this.bins += 1;
      } else {
        this.bap += 1;
        this.tongdak += 1;
      }
      // 터치 화면은 키 대신 아이템 버튼이 보인다
      h.note(h.touch ? t.got : `${t.got} ${t.key}`, 3);
      h.sound('clear', undefined, 0.8);
    } else {
      // 시간 안에 못 끝냈거나 말을 걸지 않아 떠날 때: 같은 대사 뒤 걸어 나간다 (불이익 없음)
      who.say(t.fail, 2.8);
    }
    this.go('talk');
  }

  private finish(): void {
    if (this.who) {
      this.who.tag.hide();
      this.obj.remove(this.who.root);
    }
    this.who = null;
    this.obj.visible = false;
    this.decor.visible = false;
    this.decor.position.y = 0;
    this.state = 'idle';
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

  /** 판을 처음으로 (쓰러짐·다시 하기·처음 화면): 아이템도 사라진다 */
  clear(): void {
    this.finish();
    this.carrying = false;
    this.held.visible = false;
    this.dropRing.visible = false;
    for (const it of [...this.trash, ...this.crates]) {
      it.on = false;
      it.obj.visible = false;
    }
    for (const s of this.shots) {
      s.on = false;
      s.obj.visible = false;
    }
    this.brooms = this.bins = this.bap = this.tongdak = 0;
    this.got = this.need = 0;
    this.done = false;
    this.result = '';
    this.waitT = -1;
    this.near = false;
    this.useCd = 0;
    this.lastShot = { kind: '', minions: 0, bosses: 0 };
    this.plan();
  }

  // ---------- 아이템: 빗자루·쓰레기통 폭탄 (F), 소고기콩나물밥·교직원 식당 통닭 (R) ----------

  /** F: 빗자루부터, 다 쓰면 쓰레기통 폭탄. 던졌으면 true */
  useItem(): boolean {
    const h = this.h;
    if (h.mode !== 'staff' || !h.playing || h.frozen || this.useCd > 0 || this.brooms + this.bins <= 0) return false;
    this.useCd = 0.35;
    const kind = this.brooms > 0 ? 'broom' : 'bin';
    if (kind === 'broom') this.brooms--;
    else this.bins--;
    let s = this.shots.find((x) => !x.on && x.kind === kind);
    if (!s) {
      s = { kind, obj: kind === 'broom' ? buildBroom() : buildBin(), vel: new THREE.Vector3(), on: false, dist: 0, hits: new Set(), minions: 0 };
      h.scene.add(s.obj);
      this.shots.push(s);
    }
    s.minions = 0;
    // 조준점 방향 (Game.fire와 같은 yaw·pitch)
    const cp = Math.cos(h.pitch);
    const dir = _b.set(-Math.sin(h.yaw) * cp, Math.sin(h.pitch), -Math.cos(h.yaw) * cp);
    s.obj.position.set(h.pos.x, h.eyeY - 0.2, h.pos.z).addScaledVector(dir, 0.9);
    s.on = true;
    s.dist = 0;
    s.hits.clear();
    s.obj.visible = true;
    this.lastShot = { kind, minions: 0, bosses: 0 };
    if (kind === 'broom') {
      s.vel.copy(dir).multiplyScalar(BROOM_V);
      // 빗자루 머리가 날아가는 쪽으로 눕는다
      s.obj.quaternion.setFromUnitVectors(_a.set(0, -1, 0), dir);
    } else {
      s.vel.copy(dir).multiplyScalar(15);
      s.vel.y += 5;
      s.obj.rotation.set(0, 0, 0);
    }
    h.sound('throw', undefined, 0.9);
    return true;
  }

  /** R: 소고기콩나물밥부터, 다음은 교직원 식당 통닭. 체력이 가득하면 먹지 않는다. 먹었으면 true */
  eat(): boolean {
    const h = this.h;
    if (h.mode !== 'staff' || !h.playing || h.frozen || this.bap + this.tongdak <= 0) return false;
    if (h.hp >= h.maxHp - 0.01) {
      h.note('체력이 가득해요', 1.2);
      return false;
    }
    if (this.bap > 0) {
      this.bap--;
      h.heal(BAP_HEAL);
      h.note(`소고기콩나물밥! 체력 +${BAP_HEAL}`);
    } else {
      this.tongdak--;
      h.heal(h.maxHp);
      h.note('교직원 식당 통닭! 체력 모두 회복');
    }
    h.sound('pickup');
    h.fx.confetti(_a.set(h.pos.x, h.eyeY - 0.6, h.pos.z), 10, 2, 0xf5c542, 1.6, 0.5);
    return true;
  }

  private updateShots(dt: number): void {
    const h = this.h;
    for (const s of this.shots) {
      if (!s.on) continue;
      const p = s.obj.position;
      _prev.copy(p);
      if (s.kind === 'broom') {
        p.addScaledVector(s.vel, dt);
        s.dist += BROOM_V * dt;
        // 긴 쪽(손잡이)을 축으로 돌며 난다
        s.obj.rotateY(dt * 16);
        // 이번 단계에 지나간 선분에 닿은 것 (보스에 막히면 멈춘다)
        let stop = false;
        const got: Enemy[] = [];
        for (const e of h.enemies()) {
          if (!e.targetable || s.hits.has(e)) continue;
          if (segDist(_prev, p, e.center) > e.radius + 0.45) continue;
          got.push(e);
        }
        got.sort((a, b) => a.center.distanceToSquared(_prev) - b.center.distanceToSquared(_prev));
        for (const e of got) {
          const boss = h.isBoss(e);
          s.hits.add(e);
          h.itemHit(e, BROOM_STAMPS);
          h.fx.confetti(e.center, 8, 3, 0xd9b44a, 2, 0.6);
          if (boss) this.lastShot.bosses++;
          else {
            s.minions++;
            this.lastShot.minions++;
          }
          if (boss || s.minions >= BROOM_MAX) {
            stop = true;
            break;
          }
        }
        if (stop || s.dist > BROOM_RANGE || p.y < 0.05) {
          s.on = false;
          s.obj.visible = false;
          h.fx.confetti(p, 6, 2, 0xd9b44a, 1.5, 0.5);
        }
        continue;
      }
      // 쓰레기통 폭탄: 포물선, 땅이나 적에 닿으면 터진다
      s.vel.y -= 16 * dt;
      p.addScaledVector(s.vel, dt);
      s.dist += s.vel.length() * dt;
      s.obj.rotation.x += dt * 7;
      let boom = p.y <= 0.25 || s.dist > 60;
      if (!boom) {
        for (const e of h.enemies()) {
          if (e.targetable && segDist(_prev, p, e.center) < e.radius + 0.3) {
            boom = true;
            break;
          }
        }
      }
      if (!boom) continue;
      s.on = false;
      s.obj.visible = false;
      p.y = Math.max(0.3, p.y);
      // 둘레 BIN_R m (위로 날아다니는 잡몹도: 수평 거리로 잰다)
      const inside = h.enemies().filter((e) => e.targetable && Math.hypot(e.center.x - p.x, e.center.z - p.z) <= BIN_R + (h.isBoss(e) ? e.radius : 0.3));
      for (const e of inside) {
        if (h.isBoss(e)) this.lastShot.bosses++;
        else this.lastShot.minions++;
        h.itemHit(e, BIN_STAMPS);
      }
      h.fx.blast(p, BIN_R, 0x9fd3ff);
      h.fx.confetti(p, 36, 7);
      h.fx.ring(p.x, 0.06, p.z, 0.6, BIN_R, 0.45, 0x9fd3ff);
      h.fx.text(_a.copy(p).setY(p.y + 1), '펑!', '#ffffff');
      h.sound('boom', p, 1);
    }
  }

  // ---------- 화면 ----------

  /** HUD 아이템 줄, E 안내, 터치 단추 (매 프레임, 일시정지 중에도) */
  syncUi(play: boolean): void {
    const staff = this.h.mode === 'staff';
    const touch = this.h.touch;
    const lines: string[] = [];
    let throwN = 0;
    let eatN = 0;
    if (staff) {
      throwN = this.brooms + this.bins;
      eatN = this.bap + this.tongdak;
      const a: string[] = [];
      if (this.brooms > 0) a.push(`빗자루 ${this.brooms}`);
      if (this.bins > 0) a.push(`폭탄 ${this.bins}`);
      if (a.length) lines.push(`${a.join(' · ')}${touch ? '' : ' (F)'}`);
      const b: string[] = [];
      if (this.bap > 0) b.push(`콩나물밥 ${this.bap}`);
      if (this.tongdak > 0) b.push(`통닭 ${this.tongdak}`);
      if (b.length) lines.push(`${b.join(' · ')}${touch ? '' : ' (R)'}`);
    }
    const on = play && staff && this.near;
    const key = `${on ? this.kind : ''}|${lines.join('|')}|${play ? 1 : 0}|${this.brooms},${this.bins},${this.bap},${this.tongdak}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    const el = this.el;
    el.items.textContent = lines.join('\n');
    el.hint.innerHTML = `<b>E</b>${T[this.kind].sub}`;
    el.hint.classList.toggle('on', on);
    if (el.btn) {
      el.btn.textContent = BTN;
      el.btn.classList.toggle('on', on);
    }
    if (el.itemBtn) {
      el.itemBtn.innerHTML = this.brooms > 0 ? `빗자루<br>${this.brooms}` : `폭탄<br>${this.bins}`;
      el.itemBtn.classList.toggle('on', play && throwN > 0);
    }
    if (el.lunchBtn) {
      el.lunchBtn.innerHTML = this.bap > 0 ? `콩나물밥<br>${this.bap}` : `통닭<br>${this.tongdak}`;
      el.lunchBtn.classList.toggle('on', play && eatN > 0);
    }
  }

  /** 미리 그리기 (두 분·수레·아이템 모형) */
  warm(group: THREE.Group): () => void {
    const tmp = new THREE.Group();
    tmp.position.set(-6, -1.6, -6);
    const ppl = Object.values(this.people);
    ppl.forEach((p, i) => {
      p.root.position.set(i * 1.2, 0, 0);
      tmp.add(p.root);
      p.say('…', 1, false);
      p.update(0.016, this.pose);
    });
    const things = [buildBroom(), buildBin(), buildCrate(), buildTrash(0), buildTrash(1), buildMark()];
    things.forEach((o, i) => {
      o.position.set(i * 0.6, 1, 1);
      o.scale.setScalar(0.3);
      tmp.add(o);
    });
    const ring = this.dropRing;
    ring.visible = true;
    this.decor.visible = true;
    this.cleanCart.visible = this.foodCart.visible = true;
    tmp.add(this.decor);
    group.add(tmp);
    return () => {
      group.remove(tmp);
      for (const p of ppl) {
        tmp.remove(p.root);
        p.reset();
        p.clip.visible = false;
        p.root.position.set(0, 0, 0);
      }
      ring.visible = false;
      this.decor.visible = false;
      this.h.scene.add(this.decor);
    };
  }
}

// ---------- 화면 조각 (fps.html은 그대로 두고 여기서 넣는다) ----------

const CSS = `
#items { margin-top: 3px; font-size: 12px; font-weight: 700; color: #9fe8c0; white-space: pre-line; }
#items:empty { display: none; }
#sideHint { left: 50%; top: calc(50% + 56px); transform: translateX(-50%); padding: 3px 14px 4px; border-radius: 999px;
  background: rgba(17,19,24,.78); border: 2px solid #9fe8c0; font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: none; opacity: 0; transition: opacity .15s; }
#sideHint b { display: inline-block; min-width: 18px; margin-right: 6px; padding: 0 4px; border-radius: 4px; background: #9fe8c0; color: #111318; text-align: center; }
#sideHint.on { opacity: 1; }
body.touch #sideHint { display: none; }
#sideBtn, #itemBtn, #lunchBtn { position: fixed; border-radius: 50%; border: 3px solid #111318; color: #fff; font: 700 13px 'Malgun Gothic', sans-serif;
  display: none; touch-action: none; padding: 0; line-height: 1.15; }
#sideBtn { right: calc(150px + env(safe-area-inset-right)); bottom: calc(112px + env(safe-area-inset-bottom)); width: 66px; height: 66px;
  background: #1f7a4d; font-size: 16px; box-shadow: 0 0 12px #9fe8c0; }
#itemBtn { right: calc(122px + env(safe-area-inset-right)); bottom: calc(190px + env(safe-area-inset-bottom)); width: 60px; height: 60px; background: #8a5a1c; }
#lunchBtn { right: calc(192px + env(safe-area-inset-right)); bottom: calc(190px + env(safe-area-inset-bottom)); width: 60px; height: 60px; background: #b3262d; font-size: 12px; }
#sideBtn.on, #itemBtn.on, #lunchBtn.on { display: block; }
@media (max-height: 500px) {
  #sideBtn { right: calc(136px + env(safe-area-inset-right)); bottom: calc(96px + env(safe-area-inset-bottom)); width: 60px; height: 60px; font-size: 15px; }
  #itemBtn { right: calc(112px + env(safe-area-inset-right)); bottom: calc(166px + env(safe-area-inset-bottom)); width: 54px; height: 54px; font-size: 12px; }
  #lunchBtn { right: calc(174px + env(safe-area-inset-right)); bottom: calc(166px + env(safe-area-inset-bottom)); width: 54px; height: 54px; font-size: 11px; }
}
`;

let dom: SideDom | null = null;

/** HUD 아이템 줄, E 안내, 터치 돕기·아이템·먹기 단추를 한 번 넣는다 */
function ensureDom(): SideDom {
  if (dom) return dom;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const items = document.createElement('div');
  items.id = 'items';
  document.getElementById('topleft')?.appendChild(items);
  const hint = document.createElement('div');
  hint.id = 'sideHint';
  hint.className = 'hud';
  document.body.appendChild(hint);
  const touch = document.getElementById('touch');
  const mkBtn = (id: string) => {
    if (!touch) return null;
    const b = document.createElement('button');
    b.id = id;
    b.type = 'button';
    touch.appendChild(b);
    return b;
  };
  dom = { items, hint, btn: mkBtn('sideBtn'), itemBtn: mkBtn('itemBtn'), lunchBtn: mkBtn('lunchBtn') };
  return dom;
}
