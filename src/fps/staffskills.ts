import * as THREE from 'three';
import type { SkillId } from '../data/skills';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Enemy } from './enemies';
import type { Fx } from './fx';

// 1인칭 교직원 필살기 (2026-11-17): 고른 업무 스킬마다 효과만 다르다 (쓸 수 있는 구역·게이지·띠는 main.ts special()).
// 전체 공지 발송은 main.ts special()에 그대로 있고, 나머지 셋을 여기서 한다.
// - 일괄 처리: 보는 쪽으로 7.5m 빠르게 돌진하며 지나는 길(폭 2.5m)의 민원을 처리하고, 멈춘 자리에서 "전결" 도장을 쾅 —
//   둘레 8m와 앞쪽 부채꼴 물결(34m, 양옆 45°)의 민원까지 한꺼번에 처리.
//   벽·장애물·구역 경계는 걷기와 같은 규칙(Game.clampToBounds·pushOut)으로 0.25m씩 나눠 막는다.
// - 규정집 낙하: 조준점이 가리키는 땅(멀면 30m)에 커다란 규정집이 떨어져 반경 6m, 이어서 민원이 몰린 곳 두 군데에
//   한 권씩 더 떨어져 반경 4.5m의 민원을 처리 (2D처럼 세 권. 몰린 곳이 없으면 조준점 양옆).
// - 내선 돌리기: 보는 쪽 40m 직선(폭 2m)의 민원을 꿰뚫고, 맞은 민원에서 16m 안의 민원으로 전화가 여섯 번까지 넘어간다
//   (줄에 아무도 없으면 줄에서 16m 안의 가장 가까운 민원부터).
// 넷 모두 바로 곁(3.5m)의 민원도 처리한다 (전체 공지 발송과 같다).
// 위력: 본관 앞 3차 민원을 같은 씨앗으로 64번 재현해 비교 (2026-11-17, 평균 5.5마리 중) — 전체 공지 4.66 · 일괄 3.72 ·
// 규정집 4.23 · 내선 4.13. 가장 가까운 민원을 겨눌 때는 4.38 · 3.69 · 4.13 · 4.13.
// 맞는 것은 전체 공지 발송과 같은 규칙: e.noticeT가 다 되면 Game.noticeHit (잡몹은 처리, 사람 보스·중간보스는 결재판 진행).

/** 필살기가 쓰는 Game의 공개 부분 */
export interface SkillGame {
  readonly scene: THREE.Scene;
  readonly fx: Fx;
  readonly pos: THREE.Vector3;
  readonly yaw: number;
  readonly pitch: number;
  readonly jumpY: number;
  readonly area: Rect;
  readonly enemies: readonly Enemy[];
  /** 잠깐 멈춤 중이면 0보다 크다 (돌진도 멈춘다) */
  readonly freezeT: number;
  invuln: number;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
  quake(amount: number, at?: THREE.Vector3): void;
}

const EYE = 1.6;
/** 바로 곁: 어느 필살기든 이 안의 민원은 처리한다 (전체 공지 발송과 같다) */
const NEAR = 3.5;
/** 잡몹 몸집만큼 판정을 넓힌다 (사람 보스는 몸 둘레 e.radius) */
const SLACK = 0.3;

// 일괄 처리
const DASH_LEN = 7.5;
const DASH_T = 0.28;
const DASH_HALF = 1.25;
const DASH_END = 8;
/** 멈춘 자리에서 앞으로 퍼지는 물결: 길이, 양옆으로 벌어지는 정도(tan 45°), 빠르기 */
const WAVE_LEN = 34;
const WAVE_SPREAD = 1;
const WAVE_SPEED = 40;
/** 한 번에 이만큼씩 움직이고 막힌 데를 확인한다 (사람 반지름 0.45보다 작게: 얇은 벽도 못 뚫는다) */
const DASH_SUB = 0.25;
const DASH_COLOR = 0x2f6fd1;

// 규정집 낙하
const BOOK_MAX = 30;
const BOOK_MIN = 5;
const BOOK_R = 6;
const BOOK_R2 = 4.5;
/** 몰린 곳을 찾는 범위 (보는 쪽 ±78°, 40m) */
const CROWD_COS = 0.2;
const CROWD_D = 40;
const BOOK_FALL = 0.42;
const BOOK_DROP = 18;
/** 떨어진 뒤 바닥에 있는 시간, 가라앉는 시간 */
const BOOK_STAY = 0.9;
const BOOK_SINK = 0.5;
const BOOK_GREEN = 0x1f5e45;

// 내선 돌리기
const LINE_LEN = 40;
const LINE_HALF = 1;
const LINE_SPEED = 150;
const LINE_Y = 1.25;
const LINE_FADE = 0.45;
const HOP_R = 16;
const HOP_FIRST = 16;
const HOP_MAX = 6;
const HOP_GAP = 0.12;
const LINE_COLOR = 0xffd34d;

/** 숨겨 둘 곳 (처음에는 여기 보이게 두어 Game.warmup이 재질을 미리 그린다) */
const PARK_Y = -80;

interface Book {
  obj: THREE.Group;
  /** 떨어지기 시작하는 때 (필살기 쓴 뒤 초) */
  delay: number;
  at: THREE.Vector3;
  /** 처리 반경 */
  r: number;
  spin: number;
  landed: boolean;
}

interface Hop {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 보이기 시작하는 때 */
  at: number;
  on: boolean;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

/** 수평 거리 */
function flat(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 판정 거리: 잡몹은 몸집만큼, 사람 보스는 몸 둘레만큼 넓힌다 */
function reach(e: Enemy, r: number): number {
  return r + (e.kind === 'boss' ? e.radius : SLACK);
}

/** 점 p와 선분 a→a+d·len(수평)의 거리, 그리고 a에서 따라간 거리 */
function segDist(p: THREE.Vector3, ax: number, az: number, dx: number, dz: number, len: number): [number, number] {
  const t = Math.max(0, Math.min(len, (p.x - ax) * dx + (p.z - az) * dz));
  return [Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t)), t];
}

/** 규정집 겉장 글자 */
function bookLabel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#1f5e45';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#d9b44a';
  g.lineWidth = 6;
  g.strokeRect(12, 12, 232, 136);
  g.fillStyle = '#f5d77a';
  g.font = "900 64px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('규정집', 128, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 앞으로 퍼지는 물결 바닥 (원점 = 멈춘 자리, -z = 앞) */
function waveGeometry(): THREE.BufferGeometry {
  const w0 = DASH_HALF;
  const w1 = DASH_HALF + WAVE_LEN * WAVE_SPREAD;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w0, 0, 0, w0, 0, 0, w1, 0, -WAVE_LEN, -w0, 0, 0, w1, 0, -WAVE_LEN, -w1, 0, -WAVE_LEN], 3));
  return g;
}

export class StaffSkills {
  /** 이번 필살기에 이미 맞은 것 (사람 보스가 두 번 맞지 않게) */
  private readonly hit = new Set<Enemy>();
  private parked = true;
  // 일괄 처리
  private dashT = 0;
  private readonly dashDir = new THREE.Vector3();
  private readonly dashFrom = new THREE.Vector3();
  private readonly trail: THREE.Mesh;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private trailT = -1;
  private readonly wave: THREE.Mesh;
  private readonly waveMat: THREE.MeshBasicMaterial;
  private waveT = -1;
  // 규정집 낙하
  private readonly books: Book[] = [];
  private bookT = -1;
  // 내선 돌리기
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly cord: THREE.Line;
  private readonly cordMat: THREE.LineBasicMaterial;
  private readonly hops: Hop[] = [];
  private beamT = -1;
  private readonly lineFrom = new THREE.Vector3();
  private readonly lineDir = new THREE.Vector3();

  constructor(
    private readonly g: SkillGame,
    /** 열린 구역 안으로, 장애물 밖으로 (Game.clampToBounds + pushOut) */
    private readonly collide: () => void,
  ) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    // 돌진 자국: 바닥에 깔리는 파란 띠, 멈춘 자리에서 앞으로 퍼지는 물결
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.trailMat = new THREE.MeshBasicMaterial({ color: DASH_COLOR, transparent: true, opacity: 0.4, depthWrite: false });
    this.trail = new THREE.Mesh(plane, this.trailMat);
    this.waveMat = new THREE.MeshBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.wave = new THREE.Mesh(waveGeometry(), this.waveMat);
    // 규정집 세 권 (첫 권이 크다)
    const cover = new THREE.MeshLambertMaterial({ color: BOOK_GREEN });
    const pages = new THREE.MeshLambertMaterial({ color: 0xf6f0de });
    const label = new THREE.MeshLambertMaterial({ map: bookLabel() });
    for (const s of [1.25, 0.9, 0.9]) {
      const o = new THREE.Group();
      const part = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number) => {
        const m = new THREE.Mesh(box, mat);
        m.scale.set(w * s, h * s, d * s);
        m.position.set(x * s, y * s, 0);
        o.add(m);
      };
      // 겉장 위·아래, 등, 그 사이 종이
      part(cover, 3, 0.09, 2.2, 0, 0.265);
      part(cover, 3, 0.09, 2.2, 0, -0.265);
      part(cover, 0.1, 0.62, 2.2, -1.45, 0);
      part(pages, 2.86, 0.44, 2.1, 0.02, 0);
      const top = new THREE.Mesh(plane, label);
      top.scale.set(2.3 * s, 1, 1.5 * s);
      top.position.set(0.05 * s, 0.312 * s, 0);
      o.add(top);
      o.userData.s = s;
      this.books.push({ obj: o, delay: 0, at: new THREE.Vector3(), r: BOOK_R, spin: 0, landed: true });
    }
    // 내선: 빛줄기 + 둘둘 감긴 전화선
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.75, depthWrite: false });
    this.beam = new THREE.Mesh(box, this.beamMat);
    const pts: THREE.Vector3[] = [];
    const turns = LINE_LEN * 1.6;
    for (let i = 0; i <= 640; i++) {
      const k = i / 640;
      const a = k * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.16, Math.sin(a) * 0.16, -k));
    }
    this.cordMat = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 1, depthWrite: false });
    this.cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.cordMat);
    for (let i = 0; i < HOP_MAX + 1; i++) {
      const mat = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: 1, depthWrite: false });
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      this.hops.push({ line: new THREE.Line(geo, mat), mat, from: new THREE.Vector3(), to: new THREE.Vector3(), at: 0, on: false });
    }
    // 처음에는 땅 밑에 보이게 둔다: 타이틀 뒤 미리 그리기(Game.warmup)가 재질·그림을 올려 두고, 그 한 번 그린 뒤 감춘다
    // (첫 필살기에서 화면이 끊기지 않게)
    const all: THREE.Object3D[] = [this.trail, this.wave, ...this.books.map((b) => b.obj), this.beam, this.cord, ...this.hops.map((h) => h.line)];
    all.forEach((o, i) => {
      o.position.set(i * 3, PARK_Y, 0);
      o.frustumCulled = false;
      g.scene.add(o);
    });
    this.trail.onAfterRender = () => {
      this.trail.onAfterRender = () => undefined;
      if (this.parked) this.park();
    };
  }

  /** 고른 필살기를 쓴다 (전체 공지 발송 말고). fwd = 보는 쪽 수평 단위 벡터 */
  cast(id: SkillId, fwd: THREE.Vector3): void {
    const g = this.g;
    this.hit.clear();
    if (this.parked) this.park();
    // 바로 곁의 민원은 모두 (전체 공지 발송과 같다)
    for (const e of g.enemies) {
      if (e.targetable && flat(e.center, g.pos) <= NEAR) this.schedule(e, 0.05);
    }
    if (id === 'batch') this.castDash(fwd);
    else if (id === 'rulebook') this.castBooks(fwd);
    else if (id === 'transfer') this.castLine(fwd);
  }

  /** e가 delay초 뒤에 맞는다 (한 필살기에 한 번만) */
  private schedule(e: Enemy, delay: number): void {
    if (!e.targetable || this.hit.has(e)) return;
    this.hit.add(e);
    e.noticeT = Math.max(0, delay);
  }

  // ---------- 일괄 처리 ----------

  private castDash(fwd: THREE.Vector3): void {
    const g = this.g;
    this.dashDir.copy(fwd);
    this.dashFrom.set(g.pos.x, 0, g.pos.z);
    this.dashT = DASH_T;
    this.trailT = 0;
    // 돌진하는 동안 맞지 않는다
    g.invuln = Math.max(g.invuln, DASH_T + 0.25);
    g.sound('dash');
    this.sweepDash();
  }

  /** 지금 자리에서 길 폭 안의 민원 */
  private sweepDash(): void {
    const g = this.g;
    for (const e of g.enemies) {
      if (e.targetable && !this.hit.has(e) && flat(e.center, g.pos) <= reach(e, DASH_HALF)) this.schedule(e, 0);
    }
  }

  private stepDash(dt: number): void {
    const g = this.g;
    if (g.freezeT > 0) {
      // 잠깐 멈춤에 걸리면 돌진도 거기서 끝
      this.dashT = 0;
      this.endDash();
      return;
    }
    const d = Math.min(this.dashT, dt);
    this.dashT -= d;
    let left = (DASH_LEN / DASH_T) * d;
    while (left > 1e-4) {
      const s = Math.min(DASH_SUB, left);
      left -= s;
      g.pos.x += this.dashDir.x * s;
      g.pos.z += this.dashDir.z * s;
      this.collide();
      this.sweepDash();
    }
    // 지나온 자리 발밑에 종이가 날린다 (눈앞을 가리지 않게 낮게, 조금 뒤에)
    g.fx.confetti(_a.set(g.pos.x - this.dashDir.x * 1.2, 0.25, g.pos.z - this.dashDir.z * 1.2), 3, 2, DASH_COLOR, 1.4, 0.8);
    if (this.dashT <= 0) this.endDash();
  }

  /** 멈춘 자리: "전결" 도장 쾅 — 둘레와 앞쪽 부채꼴 물결의 민원을 처리 */
  private endDash(): void {
    const g = this.g;
    const px = g.pos.x;
    const pz = g.pos.z;
    const f = this.dashDir;
    // 도장 쾅 (효과는 눈앞을 가리지 않게 2.5m 앞에서)
    g.fx.ring(px, 0.08, pz, 0.6, DASH_END, 0.5, DASH_COLOR);
    _b.set(px + f.x * 2.5, 0.6, pz + f.z * 2.5);
    g.fx.blast(_b, 1.8, 0x8fb6ff);
    g.fx.confetti(_b, 24, 6, DASH_COLOR, 2);
    g.fx.spray(_b.set(px, 0.9, pz).addScaledVector(f, 3), f, 70, WAVE_SPEED * 0.7, 0.5, DASH_COLOR);
    g.sound('boom', undefined, 0.7);
    g.quake(0.6);
    this.wave.position.set(px, 0.06, pz);
    this.wave.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    this.wave.scale.setScalar(0.01);
    this.wave.visible = true;
    this.waveT = 0;
    for (const e of g.enemies) {
      if (!e.targetable || this.hit.has(e)) continue;
      if (flat(e.center, g.pos) <= reach(e, DASH_END)) {
        this.schedule(e, 0.02);
        continue;
      }
      const along = (e.center.x - px) * f.x + (e.center.z - pz) * f.z;
      if (along <= 0 || along > WAVE_LEN) continue;
      const side = Math.abs((e.center.x - px) * -f.z + (e.center.z - pz) * f.x);
      if (side <= reach(e, DASH_HALF + along * WAVE_SPREAD)) this.schedule(e, along / WAVE_SPEED);
    }
  }

  private stepWave(dt: number): void {
    this.waveT += dt;
    const grow = WAVE_LEN / WAVE_SPEED;
    const k = Math.min(1, this.waveT / grow);
    this.wave.scale.setScalar(Math.max(0.01, k));
    this.waveMat.opacity = 0.35 * (this.waveT < grow ? 1 : Math.max(0, 1 - (this.waveT - grow) / 0.35));
    if (this.waveT >= grow + 0.35) {
      this.waveT = -1;
      this.wave.visible = false;
    }
  }

  // ---------- 규정집 낙하 ----------

  /** 조준점이 가리키는 땅 (멀면 최대 거리, 구역 안으로) */
  private aimGround(fwd: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const g = this.g;
    const dir = _b.set(0, 0, -1).applyEuler(_e.set(g.pitch, g.yaw, 0, 'YXZ'));
    let dist = BOOK_MAX;
    if (dir.y < -0.01) {
      const k = (EYE + g.jumpY) / -dir.y;
      dist = Math.hypot(dir.x * k, dir.z * k);
    }
    dist = Math.max(BOOK_MIN, Math.min(BOOK_MAX, dist));
    out.set(g.pos.x + fwd.x * dist, 0, g.pos.z + fwd.z * dist);
    return this.inArea(out);
  }

  private inArea(p: THREE.Vector3): THREE.Vector3 {
    const a = this.g.area;
    p.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, p.x));
    p.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, p.z));
    return p;
  }

  /**
   * 둘째·셋째 권 자리: 보는 쪽 앞의 민원 가운데, 반경 안에 아직 안 덮인 민원이 가장 많이 모인 곳 (2D "민원이 몰린 곳").
   * 없으면 조준점 양옆
   */
  private crowdSpots(fwd: THREE.Vector3, first: THREE.Vector3): THREE.Vector3[] {
    const g = this.g;
    const cand = g.enemies.filter((e) => {
      if (!e.targetable || e.kind === 'boss') return false;
      const d = flat(e.center, g.pos);
      if (d > CROWD_D || d <= NEAR) return false;
      return ((e.center.x - g.pos.x) * fwd.x + (e.center.z - g.pos.z) * fwd.z) / d >= CROWD_COS;
    });
    const covered = (e: Enemy, spots: THREE.Vector3[]) => flat(e.center, first) <= reach(e, BOOK_R) || spots.some((s) => flat(e.center, s) <= reach(e, BOOK_R2));
    const spots: THREE.Vector3[] = [];
    for (let k = 0; k < 2; k++) {
      let best: THREE.Vector3 | null = null;
      let bestN = 0;
      for (const c of cand) {
        if (covered(c, spots)) continue;
        let n = 0;
        for (const e of cand) if (!covered(e, spots) && flat(e.center, c.center) <= reach(e, BOOK_R2)) n++;
        if (n > bestN) {
          bestN = n;
          best = c.center;
        }
      }
      if (!best) break;
      spots.push(this.inArea(new THREE.Vector3(best.x, 0, best.z)));
    }
    // 몰린 곳이 모자라면 조준점 양옆
    const side = _a.set(-fwd.z, 0, fwd.x);
    const fill: [number, number][] = [
      [3.6, -1.2],
      [-3.4, 1.4],
    ];
    for (let k = spots.length; k < 2; k++) {
      const [sx, sf] = fill[k];
      spots.push(this.inArea(new THREE.Vector3(first.x + side.x * sx + fwd.x * sf, 0, first.z + side.z * sx + fwd.z * sf)));
    }
    return spots;
  }

  private castBooks(fwd: THREE.Vector3): void {
    const g = this.g;
    const c = this.aimGround(fwd, this.books[0].at);
    const more = this.crowdSpots(fwd, c);
    this.books.forEach((b, i) => {
      if (i > 0) b.at.copy(more[i - 1]);
      b.r = i === 0 ? BOOK_R : BOOK_R2;
      b.delay = i * 0.12;
      b.spin = g.yaw + (Math.random() - 0.5) * 0.9;
      b.landed = false;
      b.obj.visible = false;
      // 떨어질 자리 표시
      g.fx.ring(b.at.x, 0.07, b.at.z, b.r, b.r * 0.35, BOOK_FALL + b.delay, 0xf5c542);
    });
    this.bookT = 0;
    g.sound('fall', c);
  }

  private stepBooks(dt: number): void {
    this.bookT += dt;
    let busy = false;
    for (const b of this.books) {
      const t = this.bookT - b.delay;
      const o = b.obj;
      const s = o.userData.s as number;
      if (t < 0) {
        busy = true;
        continue;
      }
      o.visible = true;
      if (t < BOOK_FALL) {
        // 하늘에서 빨라지며 떨어진다 (조금 비스듬히 돌며)
        const k = t / BOOK_FALL;
        o.position.set(b.at.x, 0.31 * s + BOOK_DROP * (1 - k * k), b.at.z);
        o.rotation.set((1 - k) * 0.5, b.spin + (1 - k) * 0.8, (1 - k) * 0.3);
        busy = true;
        continue;
      }
      if (!b.landed) {
        b.landed = true;
        o.position.set(b.at.x, 0.31 * s, b.at.z);
        o.rotation.set(0, b.spin, 0);
        this.land(b);
      }
      const after = t - BOOK_FALL - BOOK_STAY;
      if (after < 0) {
        busy = true;
        continue;
      }
      if (after < BOOK_SINK) {
        o.position.y = 0.31 * s - (after / BOOK_SINK) * 0.9 * s;
        busy = true;
        continue;
      }
      o.visible = false;
    }
    if (!busy) this.bookT = -1;
  }

  /** 쿵: 먼지·종이·흔들림, 반경 안의 민원을 처리 */
  private land(b: Book): void {
    const g = this.g;
    const at = b.at;
    const big = b === this.books[0];
    g.fx.ring(at.x, 0.06, at.z, 0.8, b.r, 0.55, 0xd9cfb4);
    g.fx.confetti(_a.set(at.x, 0.4, at.z), big ? 36 : 22, big ? 7 : 5.5, 0xc9bfa6, 1.4);
    g.fx.confetti(_a.set(at.x, 0.6, at.z), big ? 14 : 8, 4, 0xffffff, 3);
    g.sound('boom', at, big ? 1 : 0.7);
    g.quake(big ? 1 : 0.6, at);
    for (const e of g.enemies) {
      if (e.targetable && flat(e.center, at) <= reach(e, b.r)) this.schedule(e, 0);
    }
  }

  // ---------- 내선 돌리기 ----------

  private castLine(fwd: THREE.Vector3): void {
    const g = this.g;
    const ax = g.pos.x;
    const az = g.pos.z;
    // 꿰뚫는 줄 (가까운 것부터 차례로 닿는다)
    const order: { e: Enemy; t: number; from: THREE.Vector3 | null }[] = [];
    for (const e of g.enemies) {
      if (!e.targetable || this.hit.has(e)) continue;
      const [d, along] = segDist(e.center, ax, az, fwd.x, fwd.z, LINE_LEN);
      if (d <= reach(e, LINE_HALF)) {
        const t = along / LINE_SPEED + 0.02;
        this.schedule(e, t);
        order.push({ e, t, from: null });
      }
    }
    for (const h of this.hops) {
      h.on = false;
      h.line.visible = false;
    }
    // 줄에 아무도 없으면 줄에서 가장 가까운 민원으로 먼저 돌린다
    if (!order.length) {
      let best: Enemy | null = null;
      let bd = HOP_FIRST;
      let bt = 0;
      for (const e of g.enemies) {
        if (!e.targetable || this.hit.has(e)) continue;
        const [d, along] = segDist(e.center, ax, az, fwd.x, fwd.z, LINE_LEN);
        if (d <= bd) {
          bd = d;
          best = e;
          bt = along;
        }
      }
      if (best) {
        const from = new THREE.Vector3(ax + fwd.x * bt, LINE_Y, az + fwd.z * bt);
        const t = bt / LINE_SPEED + HOP_GAP;
        this.schedule(best, t);
        order.push({ e: best, t, from });
      }
    }
    // 맞은 민원에서 곁의 민원으로 전화를 돌린다 (먼저 닿은 것부터, 모두 HOP_MAX번까지)
    order.sort((p, q) => p.t - q.t);
    let hops = 0;
    for (const o of order) {
      if (!o.from) continue;
      this.hopLine(hops++, o.from, o.e.center, o.t - HOP_GAP);
    }
    for (let i = 0; i < order.length && hops < HOP_MAX; i++) {
      const src = order[i];
      let best: Enemy | null = null;
      let bd = HOP_R;
      for (const e of g.enemies) {
        if (!e.targetable || this.hit.has(e)) continue;
        const d = flat(e.center, src.e.center);
        if (d <= bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) continue;
      const t = src.t + HOP_GAP;
      this.schedule(best, t);
      order.push({ e: best, t, from: src.e.center });
      this.hopLine(hops++, src.e.center, best.center, src.t);
    }
    // 빛줄기와 전화선 (가슴 높이로 쭉)
    this.beamT = 0;
    this.lineFrom.set(ax, 0, az);
    this.lineDir.copy(fwd);
    this.beam.rotation.set(0, g.yaw, 0);
    this.cord.rotation.set(0, g.yaw, 0);
    g.fx.spray(_a.set(ax, LINE_Y, az).addScaledVector(fwd, 1.5), fwd, 50, 34, 0.25, LINE_COLOR);
    g.sound('ring', undefined, 0.8);
  }

  /** i번째 넘어가는 전화선: at초에 from에서 to로 뻗는다 */
  private hopLine(i: number, from: THREE.Vector3, to: THREE.Vector3, at: number): void {
    const h = this.hops[i];
    if (!h) return;
    h.from.copy(from);
    h.to.copy(to);
    h.at = at;
    h.on = true;
  }

  private stepLine(dt: number): void {
    this.beamT += dt;
    const t = this.beamT;
    const reachT = LINE_LEN / LINE_SPEED;
    const fade = t > reachT ? Math.max(0, 1 - (t - reachT) / LINE_FADE) : 1;
    // 빛줄기와 전화선: 쓴 자리 앞 2m에서 닿은 곳까지 (그 뒤에 걸어도 줄은 그 자리에)
    const d = this.lineDir;
    const l = Math.max(0.01, Math.min(LINE_LEN, t * LINE_SPEED) - 2);
    const ox = this.lineFrom.x + d.x * 2;
    const oz = this.lineFrom.z + d.z * 2;
    this.beam.position.set(ox + (d.x * l) / 2, LINE_Y, oz + (d.z * l) / 2);
    this.beam.scale.set(0.12 * (0.4 + fade * 0.6), 0.12 * (0.4 + fade * 0.6), l);
    this.beamMat.opacity = 0.75 * fade;
    this.cord.position.set(ox, LINE_Y, oz);
    this.cord.scale.set(1, 1, l);
    this.cordMat.opacity = fade;
    this.beam.visible = this.cord.visible = fade > 0;
    // 넘어가는 전화선
    for (const h of this.hops) {
      if (!h.on) continue;
      const k = t - h.at;
      if (k < 0) continue;
      const pos = h.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const grow = Math.min(1, k / HOP_GAP);
      pos.setXYZ(0, h.from.x, h.from.y, h.from.z);
      pos.setXYZ(1, h.from.x + (h.to.x - h.from.x) * grow, h.from.y + (h.to.y - h.from.y) * grow, h.from.z + (h.to.z - h.from.z) * grow);
      pos.needsUpdate = true;
      h.line.position.set(0, 0, 0);
      h.mat.opacity = Math.max(0, 1 - Math.max(0, k - HOP_GAP) / LINE_FADE);
      h.line.visible = h.mat.opacity > 0;
      if (h.mat.opacity <= 0) h.on = false;
    }
    if (fade <= 0 && !this.hops.some((h) => h.on)) {
      this.beamT = -1;
      this.beam.visible = this.cord.visible = false;
    }
  }

  // ---------- 매 단계 ----------

  /** Game.step 끝에서 (돌진·물결·떨어지는 책·빛줄기) */
  update(dt: number): void {
    if (this.parked) this.park();
    if (this.dashT > 0) this.stepDash(dt);
    if (this.trailT >= 0) this.stepTrail(dt);
    if (this.waveT >= 0) this.stepWave(dt);
    if (this.bookT >= 0) this.stepBooks(dt);
    if (this.beamT >= 0) this.stepLine(dt);
  }

  private stepTrail(dt: number): void {
    const g = this.g;
    const dx = g.pos.x - this.dashFrom.x;
    const dz = g.pos.z - this.dashFrom.z;
    const len = Math.hypot(dx, dz);
    if (this.dashT > 0) {
      this.trail.visible = len > 0.05;
      this.trail.position.set(this.dashFrom.x + dx / 2, 0.05, this.dashFrom.z + dz / 2);
      this.trail.rotation.set(0, Math.atan2(dx, dz), 0);
      this.trail.scale.set(DASH_HALF * 2, 1, Math.max(0.05, len));
      this.trailMat.opacity = 0.4;
      return;
    }
    this.trailT += dt;
    this.trailMat.opacity = 0.4 * Math.max(0, 1 - this.trailT / 0.5);
    if (this.trailT >= 0.5) {
      this.trailT = -1;
      this.trail.visible = false;
    }
  }

  /** 땅 밑에 둔 것을 감춘다 (첫 단계, 판을 처음으로 할 때) */
  private park(): void {
    this.parked = false;
    this.trail.visible = this.wave.visible = false;
    for (const b of this.books) b.obj.visible = false;
    this.beam.visible = this.cord.visible = false;
    for (const h of this.hops) {
      h.on = false;
      h.line.visible = false;
    }
  }

  /** 판을 처음으로 (Game.start) */
  clear(): void {
    this.dashT = 0;
    this.trailT = -1;
    this.waveT = -1;
    this.bookT = -1;
    this.beamT = -1;
    this.hit.clear();
    this.park();
  }
}
