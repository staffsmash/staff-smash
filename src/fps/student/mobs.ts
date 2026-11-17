import * as THREE from 'three';
import { Enemy, type Ctx } from '../enemies';
import { badgeLook, badgeObj, NoteBadge, spawnSwarm, swarmSize, type BadgeLook } from '../mobs';
import { canvasTex, FONT, NAVY } from '../textures';

// 학생 모드 새 잡몹 (2026-11-17). 모두 학사 물건이다. 학생 경로 2번째 구역(국제학사 앞)부터 섞여 나온다.
// - 과제 마감 알림 떼: 빨간 "D-1" 배지 대여섯 개. 교직원 모드 메신저 쪽지 알림 떼(mobs.ts NoteBadge)와 같은 방식으로
//   떼로 빠르게 와서 둘레를 돌며 번갈아 부딪친다. 한 대씩 맞으면 처리.
// - 출석 QR 코드: 떠 있다가 몇 초마다 사라져 다른 자리에 나타난다. 세 번 나타날 동안 못 맞히면 부르르 떨다가 들이받는다.
//   맞히면 "출석 인정" (글자는 StudentMode.processed — DONE_TEXT).
// main.ts가 쓰는 종류(kind): 과제 마감 알림 = note (메신저 쪽지 알림과 짝), 출석 QR 코드 = qr.

const _a = new THREE.Vector3();

const badges = new Map<string, BadgeLook>();

/** 과제 마감 알림 하나 ("D-1" 알약 배지) */
export class DueBadge extends NoteBadge {
  constructor(c: Ctx, at: THREE.Vector3, slot: number, n: number, base: number) {
    super(c, badgeObj(badgeLook(badges, 'D-1', 0.5)), at, slot, n, base, 'note', '');
  }
}

/** 과제 마감 알림 떼 (크기는 난이도의 잡몹 수 배율만큼) */
export function spawnDue(c: Ctx, at: THREE.Vector3, count: number): Enemy[] {
  return spawnSwarm(c, at, swarmSize(count), (i, n, base, p) => new DueBadge(c, p, i, n, base));
}

// ---------- 출석 QR 코드 ----------

/** QR 무늬 (정해진 씨앗으로 늘 같은 무늬) */
function qrTex(): THREE.CanvasTexture {
  return canvasTex(256, 296, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 296);
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 256, 62);
    g.fillStyle = '#ffffff';
    g.font = `bold 40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('출석', 128, 33);
    const N = 21;
    const cell = 10;
    const x0 = 128 - (N * cell) / 2;
    const y0 = 76;
    let seed = 20261117;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const finder = (i: number, j: number) => (i < 8 && j < 8) || (i < 8 && j >= N - 8) || (i >= N - 8 && j < 8);
    g.fillStyle = '#111318';
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (finder(i, j)) continue;
        if (rnd() < 0.48) g.fillRect(x0 + j * cell, y0 + i * cell, cell, cell);
      }
    }
    for (const [i, j] of [
      [0, 0],
      [0, N - 7],
      [N - 7, 0],
    ]) {
      const x = x0 + j * cell;
      const y = y0 + i * cell;
      g.fillStyle = '#111318';
      g.fillRect(x, y, 7 * cell, 7 * cell);
      g.fillStyle = '#ffffff';
      g.fillRect(x + cell, y + cell, 5 * cell, 5 * cell);
      g.fillStyle = '#111318';
      g.fillRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell);
    }
    g.strokeStyle = '#111318';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 290);
  });
}

let qrLook: { geo: THREE.PlaneGeometry; frameGeo: THREE.PlaneGeometry; mat: THREE.MeshBasicMaterial } | null = null;

function qrParts(): NonNullable<typeof qrLook> {
  qrLook ??= {
    geo: new THREE.PlaneGeometry(1.2, 1.39),
    frameGeo: new THREE.PlaneGeometry(1.42, 1.61),
    mat: new THREE.MeshBasicMaterial({ map: qrTex() }),
  };
  return qrLook;
}

/** 타이틀 뒤에서 미리 올려 둘 그림 */
export function stuMobTextures(): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const q = qrParts().mat.map;
  if (q) out.push(q);
  const d = badgeLook(badges, 'D-1', 0.5).mat.map;
  if (d) out.push(d);
  return out;
}

/** 한 자리에 떠 있는 시간, 사라지고 나타나는 시간 (초) */
const SHOW_T = 2.6;
const FADE_T = 0.25;
/** 이만큼 나타날 동안 못 맞히면 들이받는다 */
const SHOWS = 3;
const GREEN = new THREE.Color(0x3ccf6e);
const YELLOW = new THREE.Color(0xf5c542);
const RED = new THREE.Color(0xe5484d);

type QrState = 'in' | 'show' | 'out' | 'aim' | 'dash';

export class AttendQR extends Enemy {
  readonly kind = 'qr' as const;
  private state: QrState = 'in';
  private stateT = 0;
  /** 지금 자리에서 몇 번째로 나타났나 (들이받고 나면 다시 센다) */
  shows = 1;
  private card = new THREE.Group();
  private frameMat = new THREE.MeshBasicMaterial({ color: GREEN.clone() });
  private bob = Math.random() * 6;
  private dir = new THREE.Vector3();
  private dashDist = 0;
  private hitDone = false;
  /** 다 들이받은 뒤 사라진다 */
  private afterDash = false;

  constructor(c: Ctx, at: THREE.Vector3) {
    super();
    const q = qrParts();
    const frame = new THREE.Mesh(q.frameGeo, this.frameMat);
    const front = new THREE.Mesh(q.geo, q.mat);
    front.position.z = 0.012;
    const back = new THREE.Mesh(q.geo, q.mat);
    back.position.z = -0.012;
    back.rotation.y = Math.PI;
    this.frameMat.side = THREE.DoubleSide;
    this.card.add(frame, front, back);
    this.card.scale.setScalar(0.01);
    this.obj.add(this.card);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.radius = 0.95;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  /** 지금 보이는 크기 (0~1) */
  get shown(): number {
    return this.card.scale.x;
  }

  /** 시험용: 지금 하는 일 */
  get phase(): QrState {
    return this.state;
  }

  private set(s: QrState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.card.rotation.y += dt * 14;
      const s = Math.max(0.01, this.card.scale.x - dt * 3);
      this.card.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    switch (this.state) {
      case 'in': {
        const k = Math.min(1, this.stateT / FADE_T);
        this.card.scale.setScalar(Math.max(0.01, k));
        this.card.rotation.y = (1 - k) * Math.PI;
        if (k >= 1) this.set('show');
        break;
      }
      case 'show': {
        // 테두리: 초록 → 노랑 → 빨강, 끝 무렵 깜빡인다
        const k = Math.min(1, this.stateT / SHOW_T);
        this.frameMat.color.copy(k < 0.5 ? GREEN : YELLOW).lerp(k < 0.5 ? YELLOW : RED, k < 0.5 ? k * 2 : (k - 0.5) * 2);
        this.card.visible = k < 0.75 || Math.floor(this.t * 10) % 2 === 0;
        if (k >= 1) {
          this.card.visible = true;
          if (this.shows >= SHOWS) {
            this.set('aim');
            c.sound('tick', o.position, 0.9);
          } else this.set('out');
        }
        break;
      }
      case 'out': {
        const k = Math.min(1, this.stateT / FADE_T);
        this.card.scale.setScalar(Math.max(0.01, 1 - k));
        this.card.rotation.y = k * Math.PI;
        if (k >= 1) {
          this.relocate(c);
          this.shows = this.afterDash ? 1 : this.shows + 1;
          this.afterDash = false;
          this.card.rotation.y = 0;
          this.set('in');
          c.sound('tick', o.position, 0.4);
        }
        break;
      }
      case 'aim': {
        // 부르르 떨며 빨갛게
        this.frameMat.color.copy(RED);
        this.card.position.x = Math.sin(this.t * 80) * 0.04;
        if (this.stateT >= 0.7) {
          this.card.position.x = 0;
          this.dir.set(dx, c.eye.y - o.position.y, dz).normalize();
          this.dashDist = 0;
          this.hitDone = false;
          this.set('dash');
          c.sound('dash', o.position, 1);
        }
        break;
      }
      case 'dash': {
        const v = 14 * dt;
        o.position.addScaledVector(this.dir, v);
        this.dashDist += v;
        if (!this.hitDone && Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z) < 1.2 && Math.abs(c.eye.y - o.position.y) < 1.3) {
          this.hitDone = true;
          c.hurt(1, o.position, 'qr');
        }
        const a = c.area;
        const out = o.position.x < a.minX - 3 || o.position.x > a.maxX + 3 || o.position.z < a.minZ - 3 || o.position.z > a.maxZ + 3;
        if (this.dashDist > 18 || out) {
          this.afterDash = true;
          this.set('out');
        }
        break;
      }
    }
    if (this.state !== 'dash') o.position.y += (1.8 + Math.sin(this.t * 2 + this.bob) * 0.12 - o.position.y) * Math.min(1, dt * 3);
    this.radius = 0.95 * Math.max(0.3, this.card.scale.x);
    this.faceFlat(c.eye);
    this.center.copy(o.position);
  }

  /** 플레이어 둘레 다른 자리 (지금 자리에서 옆으로 35~75도, 7~12m, 구역 안) */
  private relocate(c: Ctx): void {
    const o = this.obj;
    const e = c.eye;
    const cur = Math.atan2(o.position.z - e.z, o.position.x - e.x);
    const ang = cur + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.7);
    const r = 7 + Math.random() * 5;
    const a = c.area;
    o.position.set(
      Math.max(a.minX + 2, Math.min(a.maxX - 2, e.x + Math.cos(ang) * r)),
      1.8,
      Math.max(a.minZ + 2, Math.min(a.maxZ - 2, e.z + Math.sin(ang) * r)),
    );
    _a.copy(o.position);
    c.fx.confetti(_a, 6, 1.5, 0x3ccf6e, 0.8, 0.4);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 0.8);
  }

  die(): void {
    this.t = 0;
    this.card.visible = true;
  }

  dispose(): void {
    this.frameMat.dispose();
  }
}
