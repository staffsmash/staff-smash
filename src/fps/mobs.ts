import * as THREE from 'three';
import { Bubble, Enemy, type Ctx, type HurtKind } from './enemies';
import { canvasTex, FONT, paperTex, stampMarkTex } from './textures';

// 1인칭 새 잡몹 (2026-11-17). 모두 사물이다 (행정·민원 그 자체, 사람이 아니다).
// 교직원 모드:
// - "저 졸업해야되니까 / 되게 해주세요" 말풍선(분홍): 지그재그로 빠르게 다가와 화면 앞 아래쪽에 매달린다.
//   매달린 동안 시야 일부를 가리고 걸음이 느려진다(피해는 없다). 던지기 두 번(조준 필요 없음)이면 떨어져 처리된다.
// - "그런 안내 / 받은적 없어요" 말풍선(하늘색): 거리를 두고 맴돌다가 돌진한다. 조준점이 가까이 오면 옆으로 비켜선다
//   (한 번 나올 때 두 번까지). 체력 2.
//   두 말풍선은 원래 "교수님이 된다고 했는데요" 말풍선과 함께 교직원 민원 차례의 말풍선 자리에 섞여 나온다 (본관 앞부터).
// - 메신저 쪽지 알림 떼: 빨간 숫자 배지(1, 2, 3…) 대여섯 개가 떼로 빠르게 와서 둘레를 돌며 번갈아 부딪친다. 한 대씩 맞으면 처리.
// - 팩스기: 제자리에 서서 멀리서 종이를 쏜다 (SheetKind 'fax' — 도장으로 맞혀 없앨 수 있고, 맞으면 느려진다). 세 번 맞혀야 처리.
//   둘은 사회과학관 앞부터 섞여 나온다: 인문과학관 앞·국제학사 앞은 민원 차례에,
//   민원 차례가 없는 사회과학관 앞·대운동장은 중간보스·보스와 싸우는 동안 가끔 (MobKit.trickle).
// 학생 모드의 과제 마감 알림 떼("D-1")는 메신저 쪽지 알림 떼(NoteBadge)와 같은 방식이다 (student/mobs.ts).

/** Game이 빌려주는 것 (main.ts) */
export interface MobHost {
  /** 매달리는 말풍선이 붙는 카메라, 피하는 말풍선이 조준점을 보는 카메라 */
  readonly camera: THREE.Camera;
  /** 플레이어를 sec초 느리게 (이미 더 길면 그대로) */
  slowFor(sec: number): void;
  hint(key: string, text: string, sec?: number): void;
  /** 난이도의 잡몹 수 배율 (Diff.count) */
  count(): number;
}

/** 말풍선 자리에서 원래 말풍선이 나올 몫 (나머지는 매달리는 말풍선·피하는 말풍선이 반씩) */
const BUBBLE_ORIGINAL = 0.4;
/**
 * 매달린 자리 (카메라 기준 거리)와 가장 큰 크기. 말풍선 윗변은 화면 높이 68% 아래(알림 글 #note는 62%에서 시작)에 맞추고,
 * 좁은 화면(세로 폰)에서는 화면 너비의 92% 안에 들도록 줄인다 (ClingBubble.layout)
 */
const CLING_Z = -0.9;
const CLING_SCALE = 0.37;
const CLING_TOP = 0.68;
/** 매달린 동안 걸음이 느려지는 시간 (매 단계 다시 건다 — Game.slow, 0.55배) */
const CLING_SLOW = 0.2;
/** 매달린 뒤 떼어내는 데 드는 던지기 수 */
const CLING_HP = 2;
const COME_SPEED = 5.2;
const ZIG_T = 0.42;
const ZIG_SIDE = 3.4;
const DODGE_MAX = 2;
const DODGE_T = 0.3;
const DODGE_SPEED = 11;
/** 메신저 쪽지 알림 떼 */
const SWARM_SPEED = 6.5;
const DIVE_SPEED = 9.5;
const NOTE_DMG = 0.5;
/** 팩스기가 서는 거리, 종이 빠르기, 종이가 나오는 시간 */
const FAX_RANGE = 13;
const FAX_SHEET_SPEED = 9;
const PRINT_T = 0.5;
/** 민원 차례가 없는 구역: 싸움이 시작되고 처음 나오기까지, 그 뒤 간격 (초) */
const TRICKLE_FIRST = 7;
const TRICKLE_EVERY = 16;

const CLING_HINT = '말풍선이 매달렸어요! 도장을 두 번 던지면 떨어져요';
const DODGE_HINT = '조준하면 비켜서는 말풍선 — 두 번까지만 피해요';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();

// ---------- 그림 ----------

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 두 줄 말풍선 (원래 말풍선과 같은 모양, 바탕색만 다르다) */
function bubbleTex2(l1: string, l2: string, fill: string): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.lineJoin = 'round';
    g.fillStyle = fill;
    g.strokeStyle = '#111318';
    g.lineWidth = 10;
    rr(g, 10, 10, 492, 178, 60);
    g.fill();
    g.stroke();
    // 꼬리
    g.beginPath();
    g.moveTo(96, 180);
    g.lineTo(70, 246);
    g.lineTo(156, 182);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillRect(100, 168, 52, 16);
    g.fillStyle = '#111318';
    let size = 56;
    g.font = `bold ${size}px ${FONT}`;
    while (size > 32 && Math.max(g.measureText(l1).width, g.measureText(l2).width) > 446) {
      size -= 2;
      g.font = `bold ${size}px ${FONT}`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(l1, 256, 66);
    g.fillText(l2, 256, 134);
  });
}

/** 빨간 알림 배지 (숫자, "D-1"). 글자가 길면 알약 모양. userData.aspect = 가로/세로 */
export function badgeTex(text: string, fill = '#e5484d'): THREE.CanvasTexture {
  const h = 128;
  const probe = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  probe.font = `bold 80px ${FONT}`;
  const w = Math.max(h, Math.ceil(probe.measureText(text).width) + 64);
  const t = canvasTex(w, h, (g) => {
    rr(g, 7, 7, w - 14, h - 14, (h - 14) / 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#ffffff';
    g.stroke();
    rr(g, 2, 2, w - 4, h - 4, (h - 4) / 2);
    g.lineWidth = 3;
    g.strokeStyle = '#111318';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `bold 80px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 5);
  });
  t.userData = { aspect: w / h };
  return t;
}

/** 팩스기 앞면: 화난 눈이 뜬 초록 액정, FAX, 단추, 빨간 불 */
function faxFaceTex(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#ece6d6';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 120);
    g.fillStyle = '#9fcf8a';
    g.fillRect(20, 20, 124, 60);
    g.strokeStyle = '#2f3a2a';
    g.lineWidth = 5;
    g.strokeRect(20, 20, 124, 60);
    g.fillStyle = '#1d2a18';
    for (const s of [-1, 1]) {
      const cx = 82 + s * 26;
      g.beginPath();
      g.arc(cx, 56, 9, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(cx, 38);
      g.rotate(-s * 0.42);
      g.fillRect(-15, -3.5, 30, 7);
      g.restore();
    }
    g.fillStyle = '#002c52';
    g.font = `bold 32px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('FAX', 22, 104);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = '#7a7f88';
        g.fillRect(166 + j * 34, 24 + i * 24, 26, 15);
      }
    }
    g.fillStyle = '#ff4d4d';
    g.beginPath();
    g.arc(222, 104, 9, 0, Math.PI * 2);
    g.fill();
  });
}

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

/** 배지 하나의 판과 재질 (글자마다 하나씩 만들어 같이 쓴다) */
export interface BadgeLook {
  geo: THREE.PlaneGeometry;
  mat: THREE.MeshBasicMaterial;
}

/** h: 배지 높이(m) */
export function badgeLook(cache: Map<string, BadgeLook>, text: string, h: number, fill?: string): BadgeLook {
  let l = cache.get(text);
  if (!l) {
    const tex = badgeTex(text, fill);
    const aspect = (tex.userData as { aspect: number }).aspect;
    l = { geo: new THREE.PlaneGeometry(h * aspect, h), mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 }) };
    cache.set(text, l);
  }
  return l;
}

/** 앞뒤 두 장 (뒤에서 봐도 글자가 뒤집히지 않는다) */
export function badgeObj(l: BadgeLook): THREE.Group {
  const g = new THREE.Group();
  const front = new THREE.Mesh(l.geo, l.mat);
  const back = new THREE.Mesh(l.geo, l.mat);
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

/** 알림 떼 크기: 고급 5~6, 낮은 난이도는 Diff.count만큼 줄인다 (넷 아래로는 안 줄인다) */
export function swarmSize(count: number): number {
  return Math.max(4, Math.round((5 + (Math.random() < 0.5 ? 0 : 1)) * count));
}

/** 알림 떼: 한 자리에서 n개를 낸다. make(i, n, 온 쪽 각도, 자리) */
export function spawnSwarm(c: Ctx, at: THREE.Vector3, n: number, make: (i: number, n: number, base: number, p: THREE.Vector3) => Enemy): Enemy[] {
  const base = Math.atan2(at.z - c.eye.z, at.x - c.eye.x);
  const out: Enemy[] = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6).add(at);
    out.push(make(i, n, base, p));
  }
  return out;
}

// ---------- 모형과 매달린 말풍선 ----------

export class MobKit {
  /** 지금 화면에 매달린 말풍선 (한 번에 하나. 다른 말풍선은 튕겨 나간다) */
  clinger: ClingBubble | null = null;
  readonly host: MobHost;
  readonly bubbleGeo = new THREE.PlaneGeometry(2.7, 1.35);
  readonly clingTex = bubbleTex2('저 졸업해야되니까', '되게 해주세요', '#fff0f5');
  readonly dodgeTex = bubbleTex2('그런 안내', '받은적 없어요', '#eaf4ff');
  /** 매달린 말풍선에 찍히는 도장 자국 (화면 위에 그린다) */
  readonly markMat = new THREE.MeshBasicMaterial({ map: stampMarkTex(), transparent: true, depthTest: false, depthWrite: false });
  readonly markGeo = new THREE.PlaneGeometry(0.62, 0.62);
  private badges = new Map<string, BadgeLook>();
  // 팩스기
  private faxBodyGeo = new THREE.BoxGeometry(0.9, 0.42, 0.7);
  private faxTrayGeo = new THREE.BoxGeometry(0.66, 0.03, 0.4);
  private faxStackGeo = new THREE.BoxGeometry(0.56, 0.06, 0.34);
  private faxSlotGeo = new THREE.BoxGeometry(0.62, 0.04, 0.08);
  private faxHandGeo = new THREE.BoxGeometry(0.15, 0.1, 0.6);
  private faxLegGeo = new THREE.BoxGeometry(0.1, 0.12, 0.1);
  private faxOutGeo = new THREE.PlaneGeometry(0.5, 0.62).translate(0, 0.31, 0);
  private faxFace = new THREE.MeshLambertMaterial({ map: faxFaceTex() });
  private faxCream = lam(0xe2dccb);
  private faxDark = lam(0x2b2e36);
  private faxStack = lam(0xfbfaf4);
  private faxPaper = new THREE.MeshLambertMaterial({ map: paperTex(), side: THREE.DoubleSide });
  private trickleT = TRICKLE_FIRST;
  private trickleNext: 'note' | 'fax' = Math.random() < 0.5 ? 'note' : 'fax';

  constructor(host: MobHost) {
    this.host = host;
    for (let i = 1; i <= 6; i++) this.badge(String(i));
  }

  /** 타이틀 뒤에서 미리 올려 둘 그림 */
  get textures(): THREE.Texture[] {
    const out: THREE.Texture[] = [this.clingTex, this.dodgeTex];
    for (const m of [this.markMat, this.faxFace, this.faxPaper]) if (m.map) out.push(m.map);
    for (const l of this.badges.values()) if (l.mat.map) out.push(l.mat.map);
    return out;
  }

  badge(text: string): BadgeLook {
    return badgeLook(this.badges, text, 0.62);
  }

  /** 말풍선 모형: 앞뒤 두 장, 재질은 하나씩 (붉어지거나 화면 위에 그려지도록) */
  bubbleModel(tex: THREE.Texture): { obj: THREE.Group; mat: THREE.MeshBasicMaterial; meshes: THREE.Mesh[] } {
    const obj = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
    const front = new THREE.Mesh(this.bubbleGeo, mat);
    const back = new THREE.Mesh(this.bubbleGeo, mat);
    back.rotation.y = Math.PI;
    obj.add(front, back);
    return { obj, mat, meshes: [front, back] };
  }

  /** 팩스기: 몸통(앞 +z), 뒤쪽 용지함, 앞쪽 종이 나오는 틈, 옆 수화기, 다리. paper = 틈에서 나오는 종이 */
  fax(): { obj: THREE.Group; body: THREE.Group; paper: THREE.Mesh } {
    const obj = new THREE.Group();
    const body = new THREE.Group();
    obj.add(body);
    const c = this.faxCream;
    const box = new THREE.Mesh(this.faxBodyGeo, [c, c, c, c, this.faxFace, c]);
    box.position.y = 0.33;
    box.castShadow = true;
    body.add(box);
    const tray = new THREE.Mesh(this.faxTrayGeo, this.faxDark);
    tray.position.set(0, 0.64, -0.3);
    tray.rotation.x = -0.55;
    const stack = new THREE.Mesh(this.faxStackGeo, this.faxStack);
    stack.position.set(0, 0.68, -0.27);
    stack.rotation.x = -0.55;
    const slot = new THREE.Mesh(this.faxSlotGeo, this.faxDark);
    slot.position.set(0, 0.55, 0.28);
    const hand = new THREE.Mesh(this.faxHandGeo, this.faxDark);
    hand.position.set(-0.36, 0.59, 0);
    body.add(tray, stack, slot, hand);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(this.faxLegGeo, this.faxDark);
        leg.position.set(sx * 0.34, 0.06, sz * 0.26);
        body.add(leg);
      }
    }
    const paper = new THREE.Mesh(this.faxOutGeo, this.faxPaper);
    paper.position.set(0, 0.56, 0.3);
    paper.rotation.x = -0.5;
    paper.visible = false;
    body.add(paper);
    return { obj, body, paper };
  }

  /** 교직원 민원 차례의 말풍선 자리: 원래 말풍선 · 매달리는 말풍선 · 피하는 말풍선 */
  bubble(c: Ctx, at: THREE.Vector3): Enemy {
    const r = Math.random();
    if (r < BUBBLE_ORIGINAL) return new Bubble(c, at);
    return r < (1 + BUBBLE_ORIGINAL) / 2 ? new ClingBubble(c, this, at) : new DodgeBubble(c, this, at);
  }

  /** 메신저 쪽지 알림 떼 · 팩스기. few: 민원 차례가 없는 구역에 가끔 섞이는 것 (떼가 작다) */
  spawn(kind: 'note' | 'fax', c: Ctx, at: THREE.Vector3, few = false): Enemy[] {
    if (kind === 'fax') return [new Fax(c, this, at)];
    const n = few ? Math.max(3, swarmSize(this.host.count()) - 2) : swarmSize(this.host.count());
    return spawnSwarm(c, at, n, (i, nn, base, p) => new NoteBadge(c, badgeObj(this.badge(String(i + 1))), p, i, nn, base));
  }

  /**
   * 민원 차례가 없는 구역(사회과학관 앞·대운동장)의 중간보스·보스 싸움에 새 잡몹이 가끔 섞인다.
   * on: 지금 섞을 때인지. 낼 차례면 종류(메신저 쪽지 알림 떼와 팩스기를 번갈아), 아니면 null
   */
  trickle(dt: number, on: boolean, minions: number): 'note' | 'fax' | null {
    if (!on) {
      this.trickleT = TRICKLE_FIRST;
      return null;
    }
    this.trickleT -= dt;
    if (this.trickleT > 0 || minions > 2) return null;
    this.trickleT = TRICKLE_EVERY + Math.random() * 4;
    const k = this.trickleNext;
    this.trickleNext = k === 'note' ? 'fax' : 'note';
    return k;
  }
}

// ---------- "저 졸업해야되니까 / 되게 해주세요" 매달리는 말풍선 ----------

export class ClingBubble extends Enemy {
  readonly kind = 'bubble' as const;
  private kit: MobKit;
  private mat: THREE.MeshBasicMaterial;
  private meshes: THREE.Mesh[];
  private state: 'come' | 'bump' | 'cling' = 'come';
  private stateT = 0;
  private zigT = Math.random() * ZIG_T;
  private zig = Math.random() < 0.5 ? -1 : 1;
  private hover = 1.6 + Math.random() * 0.3;
  private vel = new THREE.Vector3();

  constructor(c: Ctx, kit: MobKit, at: THREE.Vector3) {
    super();
    this.kit = kit;
    const m = kit.bubbleModel(kit.clingTex);
    this.mat = m.mat;
    this.meshes = m.meshes;
    this.obj.add(m.obj);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.radius = 1.05;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  /** 화면에 매달려 있다 */
  get clinging(): boolean {
    return this.state === 'cling' && !this.dead;
  }

  private set(s: 'come' | 'bump'): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 10 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.z += dt * 5;
      const s = Math.max(0.01, this.baseScale * (1 - this.t * 1.8));
      o.scale.setScalar(s);
      if (s <= 0.02 || o.position.y < -1) this.gone = true;
      return;
    }
    if (this.state === 'cling') {
      this.hang();
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const fx = dx / d;
    const fz = dz / d;
    if (this.state === 'bump') {
      // 다른 말풍선이 이미 매달려 있으면 튕겨 나갔다가 다시 온다
      o.position.x -= fx * 4 * dt;
      o.position.z -= fz * 4 * dt;
      if (this.stateT > 0.9) this.set('come');
    } else {
      // 지그재그: 0.42초마다 옆으로 꺾으며 빠르게 다가온다 (가까우면 덜 꺾는다)
      this.zigT -= dt;
      if (this.zigT <= 0) {
        this.zigT = ZIG_T;
        this.zig = -this.zig;
      }
      const side = this.zig * ZIG_SIDE * Math.min(1, d / 4);
      o.position.x += (fx * COME_SPEED - fz * side) * dt;
      o.position.z += (fz * COME_SPEED + fx * side) * dt;
      if (d < 1.05 && Math.abs(c.eye.y - o.position.y) < 1.3) {
        if (this.kit.clinger && this.kit.clinger !== this) this.set('bump');
        else {
          this.attach(c);
          return;
        }
      }
    }
    const targetY = (d < 6 ? c.eye.y + 0.15 : this.hover) + Math.sin(this.t * 3) * 0.12;
    o.position.y += (targetY - o.position.y) * Math.min(1, dt * 3);
    this.faceFlat(c.eye);
    o.rotateZ(this.zig * 0.14);
    this.center.copy(o.position);
  }

  /** 화면 앞 아래쪽에 매달린다: 카메라에 붙이고, 벽에 가리지 않게 맨 위에 그린다 */
  private attach(c: Ctx): void {
    this.state = 'cling';
    this.stateT = 0;
    this.kit.clinger = this;
    this.pinned = true;
    this.hp = this.maxHp = CLING_HP;
    this.pop = 0;
    const o = this.obj;
    this.kit.host.camera.add(o);
    this.layout();
    o.rotation.set(0.12, 0, 0.05);
    o.scale.setScalar(this.baseScale);
    this.radius = 0.5;
    this.overlay(true);
    this.kit.host.slowFor(CLING_SLOW);
    c.sound('pop', undefined, 0.7);
    c.quake(0.25);
    this.kit.host.hint('cling', CLING_HINT, 3.4);
    o.getWorldPosition(this.center);
  }

  /** 화면 아래 가운데 자리와 크기 (화면 비율·시야각에 맞춘다). 말풍선 판 가운데는 몸통 윗변에서 판 높이의 118/256 아래 */
  private layout(): void {
    const cam = this.kit.host.camera as THREE.PerspectiveCamera;
    const half = -CLING_Z * Math.tan(THREE.MathUtils.degToRad((cam.fov || 70) / 2));
    const aspect = cam.aspect || 16 / 9;
    const s = Math.min(CLING_SCALE, (half * aspect * 2 * 0.92) / 2.7);
    this.baseScale = s;
    const top = -(CLING_TOP - 0.5) * 2 * half;
    this.obj.position.set(Math.sin(this.t * 2.3) * 0.02, top - (118 / 256) * 1.35 * s + Math.sin(this.t * 6.5) * 0.01, CLING_Z);
  }

  /** 대롱대롱 흔들리며 매달려 있다. 그동안 걸음이 느려진다 */
  private hang(): void {
    const o = this.obj;
    this.kit.host.slowFor(CLING_SLOW);
    this.layout();
    if (this.pop <= 0) o.scale.setScalar(this.baseScale);
    o.rotation.set(0.12, 0, 0.05 + Math.sin(this.t * 4.2) * 0.07);
    o.getWorldPosition(this.center);
  }

  private overlay(on: boolean): void {
    this.mat.depthTest = !on;
    this.mat.depthWrite = !on;
    for (const m of this.meshes) m.renderOrder = on ? 30 : 0;
  }

  /** 매달린 말풍선에 도장 자국 */
  private stampMark(): void {
    const m = new THREE.Mesh(this.kit.markGeo, this.kit.markMat);
    m.position.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.4 + 0.15, 0.02);
    m.rotation.z = (Math.random() - 0.5) * 0.7;
    m.renderOrder = 31;
    this.obj.add(m);
  }

  knock(dir: THREE.Vector3): void {
    if (this.state === 'cling') this.stampMark();
    else this.obj.position.addScaledVector(dir, 1.5);
  }

  die(dir: THREE.Vector3, c: Ctx): void {
    this.t = 0;
    if (this.state === 'cling') {
      // 화면에서 떨어진다: 지금 보이는 자리(월드)에서 앞으로 튕겨 떨어진다
      this.stampMark();
      c.scene.attach(this.obj);
      this.overlay(false);
      this.pinned = false;
      if (this.kit.clinger === this) this.kit.clinger = null;
      this.baseScale = this.obj.scale.x;
    }
    this.vel.set((Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5).addScaledVector(dir, 2.5);
  }

  dispose(): void {
    // 카메라에 붙어 있으면 장면에서 빼도 남으므로 직접 뗀다
    this.obj.removeFromParent();
    if (this.kit.clinger === this) this.kit.clinger = null;
    this.mat.dispose();
  }
}

// ---------- "그런 안내 / 받은적 없어요" 피하는 말풍선 ----------

type DodgeState = 'circle' | 'aim' | 'dash' | 'recover';

export class DodgeBubble extends Enemy {
  readonly kind = 'bubble' as const;
  /** 이번에 나와서 비켜선 횟수 (두 번까지) */
  dodges = 0;
  private kit: MobKit;
  private mat: THREE.MeshBasicMaterial;
  private state: DodgeState = 'circle';
  private stateT = 0;
  private cool = 2.6 + Math.random() * 1.2;
  private ring = 9.5 + Math.random() * 2.5;
  private spin = Math.random() < 0.5 ? -1 : 1;
  private spinT = 0;
  private hover = 1.8 + Math.random() * 0.4;
  private dir = new THREE.Vector3();
  private dashDist = 0;
  private hitDone = false;
  private dodgeT = 0;
  private dodgeCd = 0;
  private dodgeV = new THREE.Vector3();

  constructor(c: Ctx, kit: MobKit, at: THREE.Vector3) {
    super();
    this.kit = kit;
    const m = kit.bubbleModel(kit.dodgeTex);
    this.mat = m.mat;
    this.obj.add(m.obj);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 2;
    this.radius = 1.05;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  /** 돌진 직전인지 (조준 보조·봇이 먼저 노린다) */
  get winding(): boolean {
    return this.state === 'aim' || this.state === 'dash';
  }

  private set(s: DodgeState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      const s = Math.max(0.01, 1 - this.t * 5);
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.state === 'circle' && this.dodgeT <= 0 && this.dodges < DODGE_MAX && this.dodgeCd <= 0 && this.aimed()) this.dodge(c);
    if (this.dodgeT > 0) {
      // 비켜서는 동안은 옆으로 휙 움직이기만 한다 (맴돌기·돌진 준비는 쉰다)
      this.dodgeT -= dt;
      o.position.addScaledVector(this.dodgeV, DODGE_SPEED * (0.4 + Math.max(0, this.dodgeT / DODGE_T)) * dt);
    } else {
      this.act(dt, c, dx, dz, d);
    }
    if (this.state !== 'dash') {
      // 구역 밖으로 멀리 나가지 않는다
      const a = c.area;
      o.position.x = Math.max(a.minX - 3, Math.min(a.maxX + 3, o.position.x));
      o.position.z = Math.max(a.minZ - 3, Math.min(a.maxZ + 3, o.position.z));
      o.position.y += (this.hover + Math.sin(this.t * 2.4) * 0.15 - o.position.y) * Math.min(1, dt * 3);
    }
    this.faceFlat(c.eye);
    this.center.copy(o.position);
  }

  /** 맴돌기 → 부르르 → 돌진 → 숨 고르기 (dx·dz·d: 플레이어까지, 수평) */
  private act(dt: number, c: Ctx, dx: number, dz: number, d: number): void {
    const o = this.obj;
    switch (this.state) {
      case 'circle': {
        // 플레이어 둘레를 돌며 거리를 둔다
        const want = d - this.ring;
        const k = Math.sign(want) * Math.min(1, Math.abs(want) / 2);
        o.position.x += ((dx / d) * k * 4.2 + (-dz / d) * this.spin * 2.6) * dt;
        o.position.z += ((dz / d) * k * 4.2 + (dx / d) * this.spin * 2.6) * dt;
        this.spinT += dt;
        if (this.spinT > 3.4) {
          this.spinT = 0;
          this.spin = -this.spin;
        }
        this.cool -= dt;
        if (this.cool <= 0 && d < 16) {
          this.set('aim');
          c.sound('tick', o.position, 0.8);
        }
        break;
      }
      case 'aim': {
        const k = Math.min(1, this.stateT / 0.75);
        const flash = Math.sin(this.t * 40) > 0 ? 1 : 0.75;
        this.mat.color.setRGB(1, 1 - 0.5 * k * flash, 1 - 0.5 * k * flash);
        o.position.x += Math.sin(this.t * 80) * 0.02;
        if (this.stateT >= 0.75) {
          this.dir.set(dx, c.eye.y - o.position.y, dz).normalize();
          this.dashDist = 0;
          this.hitDone = false;
          this.set('dash');
          c.sound('dash', o.position, 1);
        }
        break;
      }
      case 'dash': {
        const v = 15 * dt;
        o.position.addScaledVector(this.dir, v);
        this.dashDist += v;
        if (!this.hitDone) {
          const hy = Math.abs(c.eye.y - o.position.y);
          if (Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z) < 1.3 && hy < 1.3) {
            this.hitDone = true;
            c.hurt(1, o.position, this.kind);
          }
        }
        const a = c.area;
        const out = o.position.x < a.minX - 4 || o.position.x > a.maxX + 4 || o.position.z < a.minZ - 4 || o.position.z > a.maxZ + 4;
        if (this.dashDist > 19 || out) this.set('recover');
        break;
      }
      case 'recover':
        this.mat.color.setRGB(1, 1, 1);
        if (this.stateT > 0.6) {
          this.cool = 2.2 + Math.random() * 1.2;
          this.set('circle');
        }
        break;
    }
  }

  /** 조준점(화면 가운데)이 말풍선 가장자리에서 0.6m 안으로 들어왔다 */
  private aimed(): boolean {
    const cam = this.kit.host.camera;
    cam.getWorldPosition(_a);
    cam.getWorldDirection(_b);
    _t.subVectors(this.center, _a);
    const dist = _t.length();
    if (dist < 2 || dist > 32) return false;
    return _t.dot(_b) / dist > Math.cos(Math.atan2(this.radius + 0.6, dist));
  }

  /** 조준점에서 먼 쪽 옆으로 비켜선다 */
  private dodge(c: Ctx): void {
    const cam = this.kit.host.camera;
    cam.getWorldPosition(_a);
    cam.getWorldDirection(_b);
    _b.y = 0;
    if (_b.lengthSq() < 1e-6) _b.set(0, 0, -1);
    _b.normalize();
    _t.subVectors(this.center, _a);
    // 화면 기준 오른쪽 = (-앞.z, 앞.x)
    const side = Math.sign(-_b.z * _t.x + _b.x * _t.z) || (Math.random() < 0.5 ? -1 : 1);
    this.dodgeV.set(-_b.z * side, 0, _b.x * side);
    this.dodgeT = DODGE_T;
    this.dodgeCd = 0.6;
    this.dodges++;
    c.sound('dash', this.center, 0.5);
    this.kit.host.hint('dodge', DODGE_HINT, 3);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1.5);
  }

  die(): void {
    this.t = 0;
  }

  dispose(): void {
    this.mat.dispose();
  }
}

// ---------- 메신저 쪽지 알림 떼 (학생: 과제 마감 알림 떼) ----------

export class NoteBadge extends Enemy {
  readonly kind = 'note' as const;
  private state: 'fly' | 'dive' | 'back' = 'fly';
  private stateT = 0;
  private vel = new THREE.Vector3();
  private slot: number;
  private n: number;
  private base: number;
  private diveT: number;
  private bobP = Math.random() * 6;
  private hurtKind: HurtKind;
  private doneText: string;

  /**
   * model: 배지 모형, slot/n: 떼 안의 차례와 크기, base: 온 쪽 각도 (플레이어 기준).
   * hurtKind: 부딪혔을 때 까닭, doneText: 처리되면 떠오르는 글 (빈칸이면 없음)
   */
  constructor(c: Ctx, model: THREE.Group, at: THREE.Vector3, slot: number, n: number, base: number, hurtKind: HurtKind = 'note', doneText = '읽음') {
    super();
    this.obj.add(model);
    this.obj.position.copy(at);
    this.slot = slot;
    this.n = n;
    this.base = base;
    this.hurtKind = hurtKind;
    this.doneText = doneText;
    this.hp = this.maxHp = 1;
    this.radius = 0.45;
    this.diveT = 1.4 + slot * 0.6 + Math.random() * 0.4;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 14 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.z += dt * 10;
      if (o.position.y < -1) this.gone = true;
      return;
    }
    const e = c.eye;
    if (this.state === 'fly') {
      // 떼: 온 쪽에서 플레이어 둘레 3~4m에 부채꼴로 늘어서 빙빙 돈다
      const a = this.base + (this.slot - (this.n - 1) / 2) * 0.5 + Math.sin(this.t * 0.7 + this.slot) * 0.25;
      const r = 3.2 + (this.slot % 2) * 0.9;
      _t.set(e.x + Math.cos(a) * r, 1.75 + Math.sin(this.t * 3 + this.bobP) * 0.35, e.z + Math.sin(a) * r);
      _a.subVectors(_t, o.position);
      const gap = _a.length();
      _a.multiplyScalar(Math.min(SWARM_SPEED, gap * 3) / Math.max(0.001, gap));
      this.vel.lerp(_a, Math.min(1, dt * 5));
      o.position.addScaledVector(this.vel, dt);
      this.diveT -= dt;
      if (this.diveT <= 0 && gap < 2.2) {
        // 차례가 오면 플레이어에게 곧장 부딪친다
        this.state = 'dive';
        this.stateT = 0;
        this.vel.subVectors(e, o.position).normalize().multiplyScalar(DIVE_SPEED);
      }
    } else if (this.state === 'dive') {
      o.position.addScaledVector(this.vel, dt);
      if (o.position.distanceTo(e) < this.radius + 0.45) {
        c.hurt(NOTE_DMG, o.position, this.hurtKind);
        this.toBack();
      } else if (this.stateT > 0.8) this.toBack();
    } else {
      // 부딪힌 뒤 물러났다가 다시 떼로
      _a.set(o.position.x - e.x, 0, o.position.z - e.z);
      if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
      _a.normalize().multiplyScalar(5).setY(2);
      this.vel.lerp(_a, Math.min(1, dt * 6));
      o.position.addScaledVector(this.vel, dt);
      if (this.stateT > 0.6) {
        this.state = 'fly';
        this.stateT = 0;
      }
    }
    o.position.y = Math.max(0.8, Math.min(8, o.position.y));
    o.lookAt(e);
    this.center.copy(o.position);
  }

  private toBack(): void {
    this.state = 'back';
    this.stateT = 0;
    this.diveT = 3 + Math.random() * 2;
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1);
  }

  die(dir: THREE.Vector3, c: Ctx): void {
    this.vel.set((Math.random() - 0.5) * 2, 3.5, (Math.random() - 0.5) * 2).addScaledVector(dir, 3);
    if (this.doneText) c.fx.text(_t.copy(this.center).setY(this.center.y + 0.6), this.doneText, '#cfd4d8', 0.42);
  }
}

// ---------- 팩스기 ----------

export class Fax extends Enemy {
  readonly kind = 'fax' as const;
  private state: 'hop' | 'stand' = 'hop';
  private stateT = 0;
  private shootT = 1.8;
  private body: THREE.Group;
  private paper: THREE.Mesh;
  private hopP = 0;
  private tip = 0;

  constructor(c: Ctx, kit: MobKit, at: THREE.Vector3) {
    super();
    const m = kit.fax();
    this.body = m.body;
    this.paper = m.paper;
    this.obj.add(m.obj);
    this.baseScale = 1.25;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.set(at.x, 0, at.z);
    this.hp = this.maxHp = 3;
    this.radius = 0.9;
    this.center.set(at.x, 0.42 * this.baseScale, at.z);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      // 뒤로 넘어지며 작아진다
      this.tip = Math.min(1, this.tip + dt * 3);
      this.body.rotation.x = (-this.tip * Math.PI) / 2;
      const s = Math.max(0.01, this.baseScale * (1 - Math.max(0, this.t - 0.35) * 2.5));
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    o.rotation.y = Math.atan2(dx, dz);
    if (this.state === 'hop') {
      // 콩콩 뛰어 플레이어에게서 13m쯤 떨어진 자리까지 온다
      this.hopP += dt * 9;
      const step = Math.sign(d - FAX_RANGE) * Math.min(1, Math.abs(d - FAX_RANGE)) * 3;
      o.position.x += (dx / d) * step * dt;
      o.position.z += (dz / d) * step * dt;
      o.position.y = Math.abs(Math.sin(this.hopP)) * 0.3;
      if (Math.abs(d - FAX_RANGE) < 1 || this.stateT > 5) {
        this.state = 'stand';
        this.stateT = 0;
        o.position.y = 0;
      }
    } else {
      o.position.y = 0;
      // 플레이어가 멀리 가 버리면 다시 다가온다
      if (d > FAX_RANGE + 9) {
        this.state = 'hop';
        this.stateT = 0;
      }
      this.shootT -= dt;
      if (this.shootT < PRINT_T) {
        // 앞 틈에서 종이가 밀려 나온다 (몸이 덜덜)
        const k = Math.max(0, Math.min(1, 1 - this.shootT / PRINT_T));
        this.paper.visible = true;
        this.paper.position.set(0, 0.56 + k * 0.08, 0.3 + k * 0.1);
        this.paper.scale.set(1, Math.max(0.05, k), 1);
        this.body.position.x = Math.sin(this.t * 60) * 0.015;
      }
      if (this.shootT <= 0) this.shoot(c);
    }
    const a = c.area;
    o.position.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.position.x));
    o.position.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.position.z));
    this.center.set(o.position.x, o.position.y + 0.42 * this.baseScale, o.position.z);
  }

  /** 종이 한 장을 플레이어 쪽으로 쏜다 (Game.sheet — 도장으로 맞혀 없앨 수 있다) */
  private shoot(c: Ctx): void {
    this.shootT = 2.5 + Math.random() * 0.7;
    this.paper.getWorldPosition(_t);
    _t.y += 0.3;
    this.paper.visible = false;
    this.body.position.x = 0;
    _a.subVectors(c.eye, _t).normalize().multiplyScalar(FAX_SHEET_SPEED);
    c.sheet(_t, _a, 'fax');
    c.sound('throw', this.obj.position, 0.7);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 0.5);
    // 맞으면 뽑던 종이가 멈춘다
    if (this.shootT < PRINT_T) {
      this.shootT = PRINT_T + 0.5;
      this.paper.visible = false;
      this.body.position.x = 0;
    }
  }

  die(_dir: THREE.Vector3, c: Ctx): void {
    this.t = 0;
    this.paper.visible = false;
    c.fx.text(_t.copy(this.center).setY(this.center.y + 1), '수신 완료', '#ffffff', 0.5);
  }
}
