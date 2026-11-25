import * as THREE from 'three';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Enemy } from './enemies';
import { HEROES } from '../data/heroes';
import { FPS_STUDENT_HEROES } from '../data/students';
import { heroLook } from './helpers';
import { Person } from './people';
import { HeadTag, prepareSpeech } from './speech';

// 1인칭 두 모드: Boo(한국외대 공식 캐릭터) 호출 벨 (사용자 2026-11-20).
// - 얻기: 잡몹을 처리할 때 BELL_CHANCE(1.5%)로 "Boo 호출 벨"이 바닥에 떨어진다 (Game.maybeDrop → tryDrop, 줍기는 Game.collect → give).
//   한 판에 최대 BELL_MAX(2)번, 1구역(교직원 본관 앞 areaOf 0 · 학생 대운동장 stu.areaNo 0)에서는 안 나온다.
//   한 번에 하나만 보관한다 (들고 있거나 바닥에 놓여 있으면 더 떨어지지 않는다).
// - 쓰기: G (터치: 벨이 있을 때만 보이는 "Boo" 버튼). 판이 멈췄거나(일시정지·소개팅 판) 기절(freezeT)·구역 카드·화면 전환 중에는 못 쓴다.
// - 동작: Boo가 뒤쪽 하늘에서 날아와(ARRIVE_T) 플레이어를 붙잡아 들어 올리고 FLY_T(9초, 2026-11-21 3초 → 9초) 동안 날아서,
//   지금 구역 사각형 안·장애물 밖에서 둘레(COUNT_R) 적(잡몹·보스)이 가장 적은 곳에 내려 준다 (보스전·총장전도 같은 구역 안).
//   날아오르기(RISE_T) → 구역 위 높이 약 8m에서 크게 한 바퀴(LOOP_T) → 한 바퀴를 마친 순간 내릴 곳을 다시 골라 내려앉는다.
//   부른 순간부터 내릴 때까지 맞지 않고(Game.invuln), 내린 뒤 GRACE(1초) 더 무적. 9초는 업무 시계로 그대로 흐른다.
//   들고 나는 동안은 구경만 한다 (사용자 2026-11-21 "구경 전용"): 던지기·필살기·아이템(F·R)을 쓰지 못한다 (main.ts).
//   이동(WASD·스틱)·점프는 무시 (Game.step이 move·updateJump 대신 carry를 부른다). 내려 준 뒤 Boo는 날아서 떠난다.
// - 3인칭 (사용자 2026-11-21): Boo가 붙잡으면 카메라가 TP_IN(0.6초) 동안 플레이어 뒤 위(약 6m 뒤·3m 위)로 빠지고,
//   Boo가 두 팔로 들어 올린 주인공 블록 모형(helpers.ts heroLook)과 위에서 퍼덕이는 Boo가 보인다. 마우스·터치로
//   카메라를 돌려 볼 수 있다 (yaw·pitch를 그대로 쓴다). 내려앉으면 TP_OUT(0.5초) 동안 다시 1인칭으로 (보던 방향 그대로).
//   3인칭 동안 1인칭 팔·도장(무기)·조준점과 화면 위쪽 발은 숨긴다 (Game.tick이 view를 부른다).
// - Boo와 주인공은 다치지 않는다 (적 목록에 없다 — 도장이 지나간다).

/** 잡몹 하나를 처리할 때 벨이 떨어질 확률 (시험용으로 바꿀 수 있게 인스턴스 값으로도 둔다) */
export const BELL_CHANCE = 0.015;
/** 한 판에 떨어지는 최대 횟수 */
export const BELL_MAX = 2;
/** 날아오는 시간, 들고 나는 시간, 떠나는 시간, 내린 뒤 무적 (초) */
export const ARRIVE_T = 0.7;
export const FLY_T = 9;
const LEAVE_T = 2;
export const GRACE = 1;
/** 날아오르는 시간, 구역 위 한 바퀴 시간 (그 뒤 FLY_T까지 내려앉는다, 초) */
const RISE_T = 1.6;
const LOOP_T = 4.6;
/** 한 바퀴 둘레: 구역 끝에서 띄우는 거리, 가장 큰 반지름 (m) */
const LOOP_EDGE = 3.5;
const LOOP_MAX_R = 18;
/** 3인칭으로 빠지는 시간, 1인칭으로 돌아오는 시간 (초) */
const TP_IN = 0.6;
const TP_OUT = 0.5;
/** 3인칭 카메라: 바라보는 점 높이(발 기준), 뒤로 떨어진 거리, 기본 올려 보는 각 (6m 뒤 · 3m 위) */
const TP_LOOK_Y = 1.7;
const TP_DIST = Math.hypot(6, 3);
const TP_EL = Math.atan2(3, 6);
/** 들려 가는 주인공 모형 배율 (머리끝 약 1.95m — Boo 배 밑이 머리에 닿지 않게), 들어 올린 손 높이 (발 기준) */
const HERO_S = 0.9;
const HAND_Y = 2.27 * HERO_S;
/** 들어 올리는 높이 (발 기준, m) */
const LIFT_H = 8;
/** 내릴 곳을 고를 때 적을 세는 둘레 (m) */
export const COUNT_R = 8;
/** 구역 끝·장애물에서 띄우는 거리 (m) */
const EDGE_M = 2.5;
const SOLID_M = 1.3;
/** 이보다 가까운 곳은 (다른 곳이 있으면) 고르지 않는다 (m) */
const MIN_MOVE = 5;
/** 모형 배율 (몸통 높이 약 1.45m) */
const S = 1.25;

/** 화면 문구 (사용자 확정 2026-11-20 — 글자 그대로) */
const T = {
  name: 'Boo',
  got: 'Boo 호출 벨! G를 누르면 Boo가 데리러 와요',
  gotTouch: 'Boo 호출 벨! Boo 버튼을 누르면 Boo가 데리러 와요',
  hud: 'Boo 호출 벨 (G)',
  hudTouch: 'Boo 호출 벨',
  call: '부우~ 꽉 잡아!',
  flying: 'Boo가 옮기는 중… (무적)',
  land: '여긴 안전해! 화이팅!',
  btn: 'Boo',
} as const;

/** Game이 빌려주는 것 (main.ts booHost) */
export interface BooHost {
  readonly touch: boolean;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** 판이 돌아가는 중 (일시정지·결과 화면·소개팅 판이 아님) */
  readonly playing: boolean;
  /** 잠깐 멈춤(기절) 중 */
  readonly frozen: boolean;
  /** 구역 카드·화면 전환·엔딩 중 (조력자와 같은 조건) */
  readonly held: boolean;
  readonly pos: THREE.Vector3;
  /** 눈높이 (들어 올린 높이 포함) */
  readonly eyeY: number;
  /** 발이 땅에서 뜬 높이 */
  readonly feetY: number;
  /** 학생 모드 (3인칭 주인공 모형을 고른다) */
  readonly student: boolean;
  /** 고른 주인공 id (교직원 HeroId · 학생 StudentHeroId) */
  heroId(): string;
  readonly yaw: number;
  pitch: number;
  readonly area: Rect;
  readonly bounds: readonly Rect[];
  /** 서지 말아야 할 곳 (장애물·상자·자판기) */
  solids(): readonly Rect[];
  areaNo(): number;
  enemies(): readonly Enemy[];
  /** 플레이어를 (x, z)에 두고 발을 y만큼 띄운다 (점프 속도는 0) */
  carryTo(x: number, z: number, y: number): void;
  /** sec초 동안 맞지 않는다 (이미 더 길면 그대로) */
  guard(sec: number): void;
  /** 바닥에 벨이 놓여 있다 */
  bellOnGround(): boolean;
  /** (x, z) 가까이 걸어서 닿는 자리에 벨을 떨어뜨린다 */
  dropBell(x: number, z: number): void;
  note(text: string, time?: number): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
}

type State = 'idle' | 'arrive' | 'fly' | 'leave';

// ---------- 모형 ----------

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const SKY = 0xa9d8ee;
const BELLY = 0xe2f3fb;
const NAVY = 0x14294f;
const WHITE = 0xffffff;
const ORANGE = 0xf39a2b;
const GREY = 0x5b6168;
const ANTENNA = 0x8ea3b5;

/** 달걀 몸 (아래가 조금 더 넓다): 반지름 R, 높이 H, 바닥이 y=0 */
const R = 0.42;
const H = 1.15;
function eggAt(t: number): [number, number] {
  return [R * Math.sin(t) * (1 + 0.1 * Math.cos(t)), (H / 2) * (1 - Math.cos(t))];
}
/** 높이 y에서 몸 반지름 */
function eggR(y: number): number {
  const t = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * y) / H)));
  return eggAt(t)[0];
}
/** 높이 y0~y1 구간의 달걀 겉면 (k배 부풀림, 앞쪽 gap 라디안은 비운다) */
function eggShell(y0: number, y1: number, k: number, gap: number, n = 10): THREE.LatheGeometry {
  const t0 = Math.acos(1 - (2 * y0) / H);
  const t1 = Math.acos(1 - (2 * y1) / H);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const [r, y] = eggAt(t0 + ((t1 - t0) * i) / n);
    pts.push(new THREE.Vector2(r * k, y));
  }
  return new THREE.LatheGeometry(pts, 24, gap / 2, Math.PI * 2 - gap);
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 몸 겉면 위 한 점 (phi: 앞 0, 왼쪽(+x) 양수), out만큼 바깥으로 */
function onBody(y: number, phi: number, out: number, k = 1): THREE.Vector3 {
  const r = eggR(y) * k + out;
  return new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r);
}

interface BooModel {
  root: THREE.Group;
  /** 몸 전체 (기울이기) */
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
}

/** Boo 블록 모형: 원점 = 몸 바닥, +z = 앞 */
function buildBoo(): BooModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const sky = lam(SKY);
  const navy = new THREE.MeshLambertMaterial({ color: NAVY, side: THREE.DoubleSide });
  const white = lam(WHITE);
  const whiteD = new THREE.MeshLambertMaterial({ color: WHITE, side: THREE.DoubleSide });
  // 하늘색 달걀 몸 (머리·몸 한 덩어리)
  const ptsN = 16;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= ptsN; i++) {
    const [r, y] = eggAt((Math.PI * i) / ptsN);
    pts.push(new THREE.Vector2(r, y));
  }
  mesh(body, new THREE.LatheGeometry(pts, 24), sky, 0, 0, 0);
  // 옅은 하늘색 배 (열린 과잠 사이로 보인다)
  const belly = mesh(body, new THREE.SphereGeometry(0.3, 14, 10), lam(BELLY), 0, 0.4, eggR(0.4) - 0.12);
  belly.scale.set(0.95, 1.2, 0.55);
  // 남색 과잠: 앞이 열린 겉면 + 흰 깃·밑단 줄
  const GAP = 0.62;
  mesh(body, eggShell(0.13, 0.8, 1.07, GAP), navy, 0, 0, 0);
  mesh(body, eggShell(0.76, 0.84, 1.1, GAP, 3), whiteD, 0, 0, 0);
  mesh(body, eggShell(0.13, 0.16, 1.1, GAP, 2), whiteD, 0, 0, 0);
  mesh(body, eggShell(0.19, 0.21, 1.1, GAP, 2), whiteD, 0, 0, 0);
  // 가슴(Boo 왼쪽) 흰 "H"
  const hPhi = 0.62;
  const hc = onBody(0.6, hPhi, 0.035, 1.07);
  const hG = new THREE.Group();
  hG.position.copy(hc);
  hG.rotation.y = hPhi;
  body.add(hG);
  const bar = new THREE.BoxGeometry(0.026, 0.12, 0.012);
  mesh(hG, bar, white, -0.035, 0, 0);
  mesh(hG, bar, white, 0.035, 0, 0);
  mesh(hG, new THREE.BoxGeometry(0.07, 0.024, 0.012), white, 0, 0, 0);
  // 오른쪽 앞섶 흰 단추 셋
  const btn = new THREE.SphereGeometry(0.016, 6, 5);
  for (const y of [0.3, 0.44, 0.58]) mesh(body, btn, white, ...onBody(y, -(GAP / 2 + 0.1), 0.03, 1.07).toArray());
  // 흰 눈 + 회색 눈동자
  const eyeGeo = new THREE.SphereGeometry(0.07, 12, 8);
  const pupilGeo = new THREE.SphereGeometry(0.034, 10, 6);
  const grey = lam(GREY);
  for (const s of [1, -1]) {
    const phi = 0.34 * s;
    const e = mesh(body, eyeGeo, white, ...onBody(0.9, phi, -0.01).toArray());
    e.rotation.y = phi;
    e.scale.set(1.35, 0.95, 0.5);
    const p = mesh(body, pupilGeo, grey, ...onBody(0.895, phi * 0.93, 0.022).toArray());
    p.rotation.y = phi;
    p.scale.set(1.3, 0.9, 0.5);
  }
  // 작은 주황 세모 부리 (끝이 아래)
  const beak = mesh(body, new THREE.ConeGeometry(0.045, 0.075, 3), lam(ORANGE), ...onBody(0.8, 0, 0.02).toArray());
  beak.rotation.set(Math.PI + 0.25, 0, 0);
  // 머리 위 회청색 더듬이 두 가닥
  const ant = lam(ANTENNA);
  const antGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.26, 5);
  for (const s of [1, -1]) {
    const a = mesh(body, antGeo, ant, s * (0.05 + Math.sin(0.45) * 0.13), H - 0.03 + Math.cos(0.45) * 0.13, -0.02);
    a.rotation.z = -0.45 * s;
  }
  // 등의 작은 날개 둘 (펄럭인다)
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xeef8fd, side: THREE.DoubleSide });
  const wingGeo = new THREE.BoxGeometry(0.38, 0.02, 0.2);
  const wing = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.07, 0.72, -eggR(0.72) * 1.07 - 0.02);
    const m = mesh(g, wingGeo, wingMat, s * 0.19, 0, -0.02);
    m.rotation.y = s * -0.25;
    // 끝 깃 (하늘색)
    mesh(g, new THREE.BoxGeometry(0.12, 0.022, 0.14), sky, s * 0.36, 0, -0.06);
    body.add(g);
    return g;
  };
  const wingL = wing(1);
  const wingR = wing(-1);
  // 남색 소매 (흰 줄무늬 둘 + 흰 소맷부리) + 하늘색 손
  const sleeveGeo = new THREE.CylinderGeometry(0.066, 0.07, 0.4, 10);
  const stripeGeo = new THREE.CylinderGeometry(0.073, 0.073, 0.024, 10);
  const cuffGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10);
  const handGeo = new THREE.SphereGeometry(0.062, 10, 8);
  const navyS = lam(NAVY);
  const arm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.42, 0.66, 0);
    mesh(g, sleeveGeo, navyS, 0, -0.2, 0);
    mesh(g, stripeGeo, white, 0, -0.27, 0);
    mesh(g, stripeGeo, white, 0, -0.32, 0);
    mesh(g, cuffGeo, white, 0, -0.4, 0);
    mesh(g, handGeo, sky, 0, -0.46, 0);
    g.rotation.z = s * 0.25;
    body.add(g);
    return g;
  };
  const armL = arm(1);
  const armR = arm(-1);
  // 가는 하늘색 다리 · 흰 양말 · 주황 신발
  const legGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.3, 8);
  const sockGeo = new THREE.CylinderGeometry(0.048, 0.044, 0.08, 10);
  const shoeGeo = new THREE.SphereGeometry(0.1, 12, 8);
  const orange = lam(ORANGE);
  const leg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(s * 0.14, 0.08, 0);
    mesh(g, legGeo, sky, 0, -0.15, 0);
    mesh(g, sockGeo, white, 0, -0.31, 0);
    const shoe = mesh(g, shoeGeo, orange, 0, -0.37, 0.04);
    shoe.scale.set(0.75, 0.45, 1.1);
    root.add(g);
    return g;
  };
  const legL = leg(1);
  const legR = leg(-1);
  root.scale.setScalar(S);
  return { root, body, armL, armR, legL, legR, wingL, wingR };
}

/** 화면 위쪽 가장자리에 살짝 보이는 Boo 발 (카메라에 붙인다) */
function buildFeet(): THREE.Group {
  const g = new THREE.Group();
  // 아래쪽 면만 보이므로 그늘져 검게 보이지 않게 스스로 조금 빛나게 한다
  const glow = (c: number) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.55 });
  const sky = glow(SKY);
  const white = glow(WHITE);
  const orange = glow(ORANGE);
  for (const s of [1, -1]) {
    const f = new THREE.Group();
    // 가운데 위 시계 글씨에 가리지 않게 양옆으로
    f.position.x = s * 0.17;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), sky);
    leg.position.y = 0.3;
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.05, 10), white);
    sock.position.y = 0.05;
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), orange);
    shoe.scale.set(0.75, 0.45, 1.1);
    shoe.position.set(0, 0, -0.025);
    f.add(leg, sock, shoe);
    g.add(f);
  }
  g.visible = false;
  return g;
}

const ease = (k: number) => {
  const x = Math.max(0, Math.min(1, k));
  return x * x * (3 - 2 * x);
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** 각도를 -π~π로 */
function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** 시험용: 마지막으로 옮긴 기록 */
export interface BooTrip {
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** 고를 때 둘레 COUNT_R 안의 적 수 (출발점·내릴 곳) */
  fromCount: number;
  toCount: number;
  /** 내린 순간 다시 센 수 */
  landFromCount: number;
  landToCount: number;
  rect: Rect;
  /** 한 바퀴를 마친 뒤 내릴 곳을 다시 골랐다 (to·fromCount·toCount는 그때 값) */
  repicked: boolean;
}

export class Boo {
  state: State = 'idle';
  /** 벨을 들고 있다 (한 번에 하나) */
  has = false;
  /** 이번 판에 떨어진 수 */
  drops = 0;
  /** 이번 판에 부른 수 (시험용) */
  uses = 0;
  /** 시험용으로 바꿀 수 있다 (?debug: __fps.boo.chance = 1) */
  chance = BELL_CHANCE;
  last: BooTrip | null = null;
  private readonly m = buildBoo();
  private readonly feet = buildFeet();
  private readonly tag = new HeadTag(T.name, '#9fd6ee', S);
  private t = 0;
  private anim = 0;
  private feetK = 0;
  private readonly from = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly leaveTo = new THREE.Vector3();
  private readonly dir = new THREE.Vector3(0, 0, 1);
  private uiKey = '';
  private readonly el: BooDom;
  // 날아가는 길: 들고 난 구역 사각형, 한 바퀴 타원(가운데·반지름·시작 각·도는 쪽), 두 번 거른 위치, 다시 골랐는지
  private rect: Rect = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private cx = 0;
  private cz = 0;
  private rx = 1;
  private rz = 1;
  private th0 = 0;
  private spin = 1;
  private readonly f1 = new THREE.Vector3();
  private readonly f2 = new THREE.Vector3();
  private repicked = false;
  /** 몸이 향하는 쪽 (날아가는 쪽, 라디안 — 모형 +z 기준) */
  private heading = 0;
  // 3인칭: 들려 가는 주인공 모형 (교직원 여섯·학생 여섯, 미리 만든다)
  private readonly heroes = new Map<string, Person>();
  private readonly meG = new THREE.Group();
  private me: Person | null = null;
  /** 3인칭 정도 0(1인칭)~1 */
  private tpK = 0;

  constructor(private readonly h: BooHost) {
    this.tag.group.position.y = H + 0.3;
    this.m.root.add(this.tag.group);
    this.m.root.visible = false;
    h.scene.add(this.m.root);
    for (const x of HEROES) this.heroes.set(`t:${x.id}`, this.heroModel(heroLook(false, x.id)));
    for (const x of FPS_STUDENT_HEROES) this.heroes.set(`s:${x.id}`, this.heroModel(heroLook(true, x.id)));
    this.meG.visible = false;
    h.scene.add(this.meG);
    this.feet.position.set(0, 0.5, -0.6);
    this.feet.scale.setScalar(0.75);
    h.camera.add(this.feet);
    prepareSpeech([T.call, T.land]);
    this.el = ensureDom();
    const b = this.el.btn;
    if (b) {
      b.textContent = T.btn;
      b.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.call();
        },
        { passive: false },
      );
      b.addEventListener('click', () => this.call());
    }
  }

  /** 붙잡혀 있는 중 (Game.step이 이동·점프 대신 carry를 부른다) */
  get carrying(): boolean {
    return this.state === 'arrive' || this.state === 'fly';
  }

  // ---------- 얻기 ----------

  /** 잡몹 하나를 처리했다 (Game.maybeDrop 맨 앞): 벨이 떨어졌으면 true */
  tryDrop(at: THREE.Vector3): boolean {
    const h = this.h;
    if (this.has || this.drops >= BELL_MAX || h.areaNo() === 0 || h.bellOnGround()) return false;
    if (Math.random() >= this.chance) return false;
    this.drops++;
    h.dropBell(at.x, at.z);
    return true;
  }

  /** 벨을 주웠다 (Game.collect). 시험용 지름길로도 쓴다 */
  give(): void {
    this.has = true;
    this.h.note(this.h.touch ? T.gotTouch : T.got, 2.8);
  }

  // ---------- 쓰기 ----------

  /** G·Boo 버튼: 부를 수 있으면 부르고 true */
  call(): boolean {
    const h = this.h;
    if (!this.has || this.state !== 'idle' || !h.playing || h.frozen || h.held) return false;
    this.has = false;
    this.uses++;
    this.state = 'arrive';
    this.t = 0;
    this.start.set(h.pos.x, 0, h.pos.z);
    // 뒤쪽 하늘에서 날아온다
    const bx = Math.sin(h.yaw);
    const bz = Math.cos(h.yaw);
    this.from.set(h.pos.x + bx * 10, h.eyeY + 7, h.pos.z + bz * 10);
    this.m.root.position.copy(this.from);
    this.m.root.visible = true;
    this.tag.say(T.call, 2.2);
    h.guard(ARRIVE_T + 0.3);
    h.sound('dash', undefined, 0.8);
    return true;
  }

  /** 붙잡혀 있는 동안 매 단계 (Game.step에서 move·updateJump 대신) */
  carry(dt: number): void {
    const h = this.h;
    this.t += dt;
    if (this.state === 'arrive') {
      h.carryTo(this.start.x, this.start.z, 0);
      h.guard(0.3);
      if (this.t >= ARRIVE_T) this.takeOff();
      return;
    }
    if (this.state !== 'fly') return;
    const t = Math.min(this.t, FLY_T);
    // 높이: 날아올라 약 8m에서 살짝 오르내리다가 마지막에 내려앉는다
    const up = Math.min(ease(t / 1.3), ease((FLY_T - t) / 1.7));
    const y = up * (LIFT_H + Math.sin(t * 2.2) * 0.35);
    // 따라갈 점: 한 바퀴 시작점으로 → 타원을 한 바퀴 → (다시 고른) 내릴 곳으로
    const loopEnd = RISE_T + LOOP_T;
    let px: number;
    let pz: number;
    if (t < RISE_T) {
      const k = ease(t / RISE_T);
      const [ex, ez] = this.loopAt(this.th0);
      px = this.start.x + (ex - this.start.x) * k;
      pz = this.start.z + (ez - this.start.z) * k;
    } else if (t < loopEnd) {
      [px, pz] = this.loopAt(this.th0 + this.spin * Math.PI * 2 * ((t - RISE_T) / LOOP_T));
    } else {
      // 한 바퀴를 마친 순간 내릴 곳을 다시 고른다 (그새 적이 움직였으니 지금 가장 안전한 곳)
      if (!this.repicked) {
        this.repicked = true;
        this.pickTarget(this.rect, false);
      }
      const k = ease((t - loopEnd) / (FLY_T - loopEnd - 0.6));
      const [ex, ez] = this.loopAt(this.th0);
      px = ex + (this.target.x - ex) * k;
      pz = ez + (this.target.z - ez) * k;
    }
    // 두 번 걸러 부드럽게 (구역 사각형 안 점들의 평균이라 사각형 밖으로 나가지 않는다), 마지막 1.3초는 내릴 곳에 정확히 맞춘다
    const a = 1 - Math.exp(-dt * 3.2);
    this.f1.x += (px - this.f1.x) * a;
    this.f1.z += (pz - this.f1.z) * a;
    this.f2.x += (this.f1.x - this.f2.x) * a;
    this.f2.z += (this.f1.z - this.f2.z) * a;
    const b = ease((t - (FLY_T - 1.3)) / 1.1);
    const x = this.f2.x + (this.target.x - this.f2.x) * b;
    const z = this.f2.z + (this.target.z - this.f2.z) * b;
    // 몸은 날아가는 쪽을 본다
    const dx = x - h.pos.x;
    const dz = z - h.pos.z;
    if (dx * dx + dz * dz > 1e-5) this.heading += wrap(Math.atan2(dx, dz) - this.heading) * Math.min(1, dt * 4);
    h.carryTo(x, z, y);
    h.guard(0.3);
    // 내려앉을 때 다시 앞을 본다 (마우스·터치로 계속 돌릴 수 있다 — 3인칭에서는 카메라 높이)
    if (t > FLY_T - 0.8 && h.pitch < 0) h.pitch += (0 - h.pitch) * Math.min(1, dt * 3);
    if (this.t >= FLY_T) this.land();
  }

  /** 한 바퀴 타원 위 한 점 (x, z) */
  private loopAt(th: number): [number, number] {
    return [this.cx + this.rx * Math.sin(th), this.cz + this.rz * Math.cos(th)];
  }

  private takeOff(): void {
    const h = this.h;
    this.state = 'fly';
    this.t = 0;
    this.repicked = false;
    this.rect = { ...this.curRect() };
    this.pickTarget(this.rect, true);
    _a.set(this.target.x - this.start.x, 0, this.target.z - this.start.z);
    if (_a.lengthSq() > 0.01) this.dir.copy(_a.normalize());
    else this.dir.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
    // 한 바퀴 타원: 구역 가운데, 끝에서 LOOP_EDGE 띄우고, 지금 자리 쪽에서 시작해 보던 쪽으로 돈다
    const r = this.rect;
    this.cx = (r.minX + r.maxX) / 2;
    this.cz = (r.minZ + r.maxZ) / 2;
    this.rx = Math.max(0.5, Math.min(LOOP_MAX_R, (r.maxX - r.minX) / 2 - LOOP_EDGE));
    this.rz = Math.max(0.5, Math.min(LOOP_MAX_R, (r.maxZ - r.minZ) / 2 - LOOP_EDGE));
    this.th0 = Math.atan2((this.start.x - this.cx) / this.rx, (this.start.z - this.cz) / this.rz);
    const tx = Math.cos(this.th0) * this.rx;
    const tz = -Math.sin(this.th0) * this.rz;
    this.spin = -Math.sin(h.yaw) * tx - Math.cos(h.yaw) * tz >= 0 ? 1 : -1;
    this.f1.set(this.start.x, 0, this.start.z);
    this.f2.copy(this.f1);
    this.heading = Math.atan2(-Math.sin(h.yaw), -Math.cos(h.yaw));
    // 들려 갈 주인공 모형 (지금 모드·고른 주인공)
    this.showMe();
    h.guard(FLY_T + 0.3);
    h.note(T.flying, FLY_T);
    h.sound('pickup');
  }

  private land(): void {
    const h = this.h;
    h.carryTo(this.target.x, this.target.z, 0);
    h.guard(GRACE);
    if (this.last) {
      this.last.landFromCount = this.count(this.start.x, this.start.z);
      this.last.landToCount = this.count(this.target.x, this.target.z);
    }
    this.state = 'leave';
    this.t = 0;
    this.from.copy(this.m.root.position);
    // 앞쪽 하늘로 날아서 떠난다 (보이게)
    this.leaveTo.set(h.pos.x - Math.sin(h.yaw) * 16, h.eyeY + 11, h.pos.z - Math.cos(h.yaw) * 16);
    this.tag.say(T.land, 2.4);
    h.sound('pop');
  }

  /** 둘레 COUNT_R 안의 적(잡몹·보스) 수 */
  private count(x: number, z: number): number {
    let n = 0;
    for (const e of this.h.enemies()) {
      if (!e.targetable) continue;
      if (Math.hypot(e.center.x - x, e.center.z - z) <= COUNT_R) n++;
    }
    return n;
  }

  /** 가장 가까운 적까지 (수평, 없으면 99) */
  private nearest(x: number, z: number): number {
    let d = 99;
    for (const e of this.h.enemies()) {
      if (!e.targetable) continue;
      d = Math.min(d, Math.hypot(e.center.x - x, e.center.z - z));
    }
    return d;
  }

  /** 지금 서 있는 구역 사각형 (길 위면 그 길) */
  private curRect(): Rect {
    const h = this.h;
    const p = h.pos;
    const inR = (r: Rect) => p.x >= r.minX - 0.5 && p.x <= r.maxX + 0.5 && p.z >= r.minZ - 0.5 && p.z <= r.maxZ + 0.5;
    if (inR(h.area)) return h.area;
    return h.bounds.find(inR) ?? h.area;
  }

  /**
   * 구역 사각형 r 안·장애물 밖 후보 점 가운데 둘레 적이 가장 적은 곳 (같으면 가장 가까운 적이 먼 곳).
   * first: 날아오를 때 (기록을 새로 쓴다). 아니면 한 바퀴를 마친 뒤 다시 고른 것 (내릴 곳만 고친다)
   */
  private pickTarget(r: Rect, first: boolean): void {
    const h = this.h;
    const solids = h.solids();
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const m = Math.min(EDGE_M, w / 4, d / 4);
    const nx = Math.max(2, Math.min(10, Math.round(w / 4)));
    const nz = Math.max(2, Math.min(10, Math.round(d / 4)));
    let best: [number, number, number] | null = null;
    let near: [number, number, number] | null = null;
    const score = (x: number, z: number) => this.count(x, z) * 1000 - Math.min(this.nearest(x, z), 40);
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const x = r.minX + m + ((w - 2 * m) * (i + (i > 0 && i < nx ? (Math.random() - 0.5) * 0.5 : 0))) / nx;
        const z = r.minZ + m + ((d - 2 * m) * (j + (j > 0 && j < nz ? (Math.random() - 0.5) * 0.5 : 0))) / nz;
        if (solids.some((o) => x > o.minX - SOLID_M && x < o.maxX + SOLID_M && z > o.minZ - SOLID_M && z < o.maxZ + SOLID_M)) continue;
        const s = score(x, z);
        const far = Math.hypot(x - this.start.x, z - this.start.z) >= MIN_MOVE;
        if (far && (!best || s < best[2])) best = [x, z, s];
        if (!far && (!near || s < near[2])) near = [x, z, s];
      }
    }
    const pick = best ?? near;
    if (pick) this.target.set(pick[0], 0, pick[1]);
    else this.target.copy(this.start);
    if (!first && this.last) {
      this.last.to = { x: this.target.x, z: this.target.z };
      this.last.fromCount = this.count(this.start.x, this.start.z);
      this.last.toCount = this.count(this.target.x, this.target.z);
      this.last.repicked = true;
      return;
    }
    this.last = {
      from: { x: this.start.x, z: this.start.z },
      to: { x: this.target.x, z: this.target.z },
      fromCount: this.count(this.start.x, this.start.z),
      toCount: this.count(this.target.x, this.target.z),
      landFromCount: -1,
      landToCount: -1,
      rect: { ...r },
      repicked: false,
    };
  }

  // ---------- 3인칭: 들려 가는 주인공 ----------

  /** 주인공 블록 모형 하나 (결재판·이름표 없이, HERO_S 배율) */
  private heroModel(look: ReturnType<typeof heroLook>): Person {
    const p = new Person('meeting', '', '#ffffff', { ...look, scale: HERO_S });
    p.clip.visible = false;
    p.tag.group.visible = false;
    return p;
  }

  /** 지금 모드·고른 주인공의 모형을 붙인다 */
  private showMe(): void {
    const h = this.h;
    const p = this.heroes.get(`${h.student ? 's' : 't'}:${h.heroId()}`) ?? this.heroes.values().next().value ?? null;
    if (this.me && this.me !== p) this.meG.remove(this.me.root);
    this.me = p;
    if (p && p.root.parent !== this.meG) {
      p.root.position.set(0, 0, 0);
      p.root.rotation.set(0, 0, 0);
      this.meG.add(p.root);
    }
  }

  /** 매달린 자세: k = 1이면 두 팔을 머리 위로 뻗어 Boo의 손을 잡고 다리는 대롱대롱, 0이면 선 자세 */
  private hang(p: Person, k: number): void {
    const sw = Math.sin(this.anim * 3.2) * 0.32 * k;
    // 손은 머리 조금 뒤 (Boo가 등 뒤 위에서 잡아 얼굴이 보이게)
    p.armL.rotation.set(-0.1 + (-Math.PI - 0.2) * k, 0, -0.1 * k);
    p.armR.rotation.set(-0.1 + (-Math.PI - 0.2) * k, 0, 0.1 * k);
    p.legL.rotation.x = sw + 0.12 * k;
    p.legR.rotation.x = -sw + 0.12 * k;
    p.head.rotation.x = -0.08 * k;
  }

  /**
   * 카메라 (Game.tick이 1인칭 자리를 잡은 뒤 부른다): 3인칭 정도만큼 플레이어 뒤 위로 옮기고 그 정도(0~1)를 돌려준다.
   * yaw = 카메라가 도는 방향, pitch = 올려다보면 카메라가 낮아진다 (마우스·터치로 돌린다)
   */
  view(cam: THREE.Camera): number {
    if (this.tpK <= 0) return 0;
    const h = this.h;
    const k = ease(this.tpK);
    const el = Math.max(-0.2, Math.min(1.25, TP_EL - h.pitch * 0.8));
    const look = _a.set(h.pos.x, h.feetY + TP_LOOK_Y, h.pos.z);
    const eye = _b.set(
      look.x + Math.sin(h.yaw) * Math.cos(el) * TP_DIST,
      Math.max(0.4, look.y + Math.sin(el) * TP_DIST),
      look.z + Math.cos(h.yaw) * Math.cos(el) * TP_DIST,
    );
    _m.lookAt(eye, look, _up);
    _q.setFromRotationMatrix(_m);
    cam.position.lerp(eye, k);
    cam.quaternion.slerp(_q, k);
    return k;
  }

  // ---------- 모형 움직임 ----------

  /** 매 단계 (Boo 모형·말풍선·화면 위 발·들려 가는 주인공) */
  update(dt: number): void {
    const h = this.h;
    this.anim += dt;
    const mm = this.m;
    if (this.state === 'leave') {
      this.t += dt;
      if (this.t >= LEAVE_T) {
        this.hide();
        return;
      }
    }
    if (this.state === 'idle') {
      this.feetK = 0;
      this.feet.visible = false;
      return;
    }
    // 3인칭: 붙잡혀 나는 동안 빠지고, 내려앉으면 돌아온다
    if (this.state === 'fly') this.tpK = Math.min(1, this.tpK + dt / TP_IN);
    else this.tpK = Math.max(0, this.tpK - dt / TP_OUT);
    const tk = ease(this.tpK);
    // 붙잡는 자리 — 1인칭: 플레이어 머리 바로 위 조금 뒤 (위를 올려다보면 배와 발이 보인다. 팔이 화면을 가리지 않게 높이 둔다)
    // 3인칭: 주인공이 머리 위로 뻗은 두 손 바로 위 (Boo 손이 주인공 손을 잡는다)
    const hold = _a.set(h.pos.x + Math.sin(h.yaw) * 0.4, h.eyeY + 1.0, h.pos.z + Math.cos(h.yaw) * 0.4);
    // 3인칭: 주인공 머리 조금 뒤 위 (주인공 얼굴이 Boo 배에 가리지 않게)
    if (tk > 0) hold.lerp(_c.set(h.pos.x - Math.sin(this.heading) * 0.3, h.feetY + HAND_Y - 0.12, h.pos.z - Math.cos(this.heading) * 0.3), tk);
    const root = mm.root;
    let face: THREE.Vector3;
    let lean = 0;
    let grip = 0;
    if (this.state === 'arrive') {
      const k = ease(this.t / ARRIVE_T);
      root.position.lerpVectors(this.from, hold, k);
      face = _b.subVectors(hold, this.from).setY(0);
      lean = 0.45 * (1 - k);
      grip = k;
    } else if (this.state === 'fly') {
      root.position.copy(hold);
      face = _b.set(Math.sin(this.heading), 0, Math.cos(this.heading)).lerp(this.dir, 1 - tk);
      // 3인칭에서는 손이 맞닿게 똑바로 (1인칭일 때만 앞으로 기운다)
      lean = 0.3 * Math.sin(Math.min(1, this.t / FLY_T) * Math.PI) * (1 - tk);
      grip = 1;
    } else {
      const k = this.t / LEAVE_T;
      root.position.lerpVectors(this.from, this.leaveTo, k * k * (2 - k));
      face = _b.subVectors(this.leaveTo, this.from).setY(0);
      lean = 0.35;
    }
    if (face.lengthSq() > 1e-4) root.rotation.y = Math.atan2(face.x, face.z);
    mm.body.rotation.x = lean;
    // 날개는 빠르게, 팔은 붙잡을 때 아래로 (아니면 퍼덕)
    const flap = Math.sin(this.anim * 24);
    mm.wingL.rotation.z = 0.35 + flap * 0.6;
    mm.wingR.rotation.z = -0.35 - flap * 0.6;
    const armFlap = Math.sin(this.anim * 14) * 0.5 * (1 - grip);
    mm.armL.rotation.set(-0.12 * grip, 0, 0.12 + 1.0 * (1 - grip) + armFlap);
    mm.armR.rotation.set(-0.12 * grip, 0, -0.12 - 1.0 * (1 - grip) - armFlap);
    const sw = Math.sin(this.anim * 6) * 0.3;
    // 들고 나는 동안 다리는 뒤로 늘어진다 (올려다볼 때 신발이 얼굴 앞을 가리지 않게)
    // (3인칭에서는 반대로 뒤쪽으로 — 주인공 얼굴 앞을 가리지 않게)
    const trail = this.state === 'fly' ? -0.55 + 1.5 * tk : 0;
    mm.legL.rotation.x = trail + sw + lean * 0.6;
    mm.legR.rotation.x = trail - sw + lean * 0.6;
    this.tag.update(dt);
    // 들려 가는 주인공: 3인칭으로 어느 정도 빠졌을 때만 보인다 (카메라가 몸 안에 있을 때는 숨긴다)
    const me = this.me;
    this.meG.visible = !!me && this.tpK > 0.15;
    if (me && this.meG.visible) {
      this.meG.position.set(h.pos.x, h.feetY, h.pos.z);
      this.meG.rotation.set(0, this.heading, 0);
      // 매달려 흔들린다 (날 때만)
      const swing = this.state === 'fly' ? 1 : 0;
      me.root.rotation.set(Math.sin(this.anim * 1.7) * 0.05 * swing, 0, Math.sin(this.anim * 2.3) * 0.06 * swing);
      this.hang(me, this.state === 'fly' ? 1 : tk);
    }
    // 화면 위쪽 가장자리의 발: 1인칭으로 들고 날 때만 (3인칭이면 숨긴다), 위를 올려다보면 (진짜 Boo가 보이므로) 숨긴다
    const want = this.state === 'fly' && this.tpK <= 0 && h.pitch < 0.3 ? 1 : 0;
    this.feetK += (want - this.feetK) * Math.min(1, dt * 8);
    this.feet.visible = this.tpK <= 0 && this.feetK > 0.02;
    this.feet.position.y = 0.52 - 0.14 * this.feetK;
    this.feet.rotation.x = Math.sin(this.anim * 6) * 0.12;
    this.feet.children[0].rotation.x = Math.sin(this.anim * 6) * 0.15;
    this.feet.children[1].rotation.x = -Math.sin(this.anim * 6) * 0.15;
  }

  private hide(): void {
    this.state = 'idle';
    this.t = 0;
    this.m.root.visible = false;
    this.tag.hide();
    this.feet.visible = false;
    this.feetK = 0;
    this.tpK = 0;
    this.meG.visible = false;
  }

  /** 판을 처음으로 (다시 하기·처음 화면): 벨·횟수도 */
  clear(): void {
    this.hide();
    this.has = false;
    this.drops = 0;
    this.uses = 0;
    this.last = null;
  }

  // ---------- 화면 ----------

  /** HUD 보관 줄과 터치 버튼 (매 프레임, 일시정지 중에도) */
  syncUi(play: boolean): void {
    const line = this.has ? (this.h.touch ? T.hudTouch : T.hud) : '';
    const on = play && this.has && this.state === 'idle';
    const key = `${line}|${on ? 1 : 0}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.el.item.textContent = line;
    this.el.btn?.classList.toggle('on', on);
  }

  /** 미리 그리기 (모형·이름표·말풍선·화면 위 발·들려 가는 주인공 열 명) */
  warm(group: THREE.Group): () => void {
    const root = this.m.root;
    root.visible = true;
    root.position.set(6, -1.2, -6);
    group.add(root);
    this.tag.say(T.call, 1, false);
    this.tag.update(0.016);
    this.feet.visible = true;
    const ppl = [...this.heroes.values()];
    ppl.forEach((p, i) => {
      p.root.position.set(-9 + i * 1.6, -1.6, -8);
      this.hang(p, 1);
      group.add(p.root);
    });
    return () => {
      group.remove(root);
      this.h.scene.add(root);
      for (const p of ppl) {
        group.remove(p.root);
        p.root.position.set(0, 0, 0);
        this.hang(p, 0);
      }
      this.hide();
    };
  }
}

// ---------- 화면 조각 (fps.html은 그대로 두고 여기서 넣는다) ----------

interface BooDom {
  item: HTMLElement;
  btn: HTMLButtonElement | null;
}

const CSS = `
#booItem { margin-top: 3px; font-size: 12px; font-weight: 700; color: #9fd6ee; }
#booItem:empty { display: none; }
#booBtn { position: fixed; right: calc(262px + env(safe-area-inset-right)); bottom: calc(190px + env(safe-area-inset-bottom)); width: 60px; height: 60px;
  border-radius: 50%; border: 3px solid #111318; background: #14294f; color: #fff; font: 800 16px 'Malgun Gothic', sans-serif;
  box-shadow: 0 0 12px #9fd6ee; display: none; touch-action: none; padding: 0; }
#booBtn.on { display: block; }
@media (max-height: 500px) {
  #booBtn { right: calc(236px + env(safe-area-inset-right)); bottom: calc(166px + env(safe-area-inset-bottom)); width: 54px; height: 54px; font-size: 15px; }
}
`;

let dom: BooDom | null = null;

/** HUD 보관 줄과 터치 "Boo" 버튼을 한 번 넣는다 */
function ensureDom(): BooDom {
  if (dom) return dom;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const item = document.createElement('div');
  item.id = 'booItem';
  document.getElementById('topleft')?.appendChild(item);
  const touch = document.getElementById('touch');
  let btn: HTMLButtonElement | null = null;
  if (touch) {
    btn = document.createElement('button');
    btn.id = 'booBtn';
    btn.type = 'button';
    touch.appendChild(btn);
  }
  dom = { item, btn };
  return dom;
}
