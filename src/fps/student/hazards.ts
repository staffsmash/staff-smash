import * as THREE from 'three';
import type { Ctx } from '../enemies';
import type { Person } from '../people';
import type { StudentKit } from './models';

// 학생 모드 창구 직원·보스의 바닥 기믹 (미리 만든 것을 돌려 쓴다).
// - 빨간 첨삭 선 (나진취): 플레이어 양옆에 그어져 길을 막는다. 점프로 넘는다 (본편 2D PenLine과 같다).
// - 여권 (김국제): 서류와 섞어 부채꼴로 날아온다. 피한다 (서류는 Game의 날아오는 종이라 서류로 맞혀 없앨 수 있다).
// - 책수레 (최도서관, 11차): 바닥을 굴러 플레이어 쪽으로 온다. 점프하거나 옆으로 비킨다.
// - 총학 집행부 (권학생, 11차): 둘이 달려와 권학생 앞에 서서 면담 받는다. 길을 막고 던진 서류를 막는다.
//   닿으면 밀려날 뿐 아프지 않다 (총학은 학생 편이다). 5초 뒤 돌아간다.
// - 성적표 (한학고 학장, 11차): 플레이어 양옆에 둘. A+는 회복, F는 잠깐 멈춤 (예전 허허실실 부총장의 간식·일거리 자리).
// 예전 기믹(소등·국물 쏟기)은 11차에 없앴다.

const LINE_LEN = 16;
const GROW = 0.35;
const PASS_N = 8;
const PASS_HIT = 0.75;
/** F 성적표를 주우면 멈추는 시간, A+ 성적표 회복량 (칸) */
const GRADE_F_SEC = 1.6;
const GRADE_A_HEAL = 2;
const CART_N = 3;
const CART_SPEED = 8.5;
const CART_RANGE = 32;
/** 책수레에 닿는 거리 (m), 이보다 높이 뛰면 넘는다 */
const CART_HIT = 1.0;
const CART_JUMP = 0.55;
const AIDE_LIFE = 5;
const AIDE_RUN = 7;
/** 총학 집행부 몸 반지름 (밀어내기·서류 막기) */
const AIDE_R = 0.75;
/** ★ 면담 받는 동안 말풍선 */
export const AIDE_LINE = '면담 중…';

interface Passport {
  mesh: THREE.Mesh;
  on: boolean;
  t: number;
  vel: THREE.Vector3;
}

interface Grade {
  obj: THREE.Group;
  item: THREE.Object3D;
  grade: 'A+' | 'F';
  t: number;
  ttl: number;
}

interface Cart {
  obj: THREE.Group;
  on: boolean;
  t: number;
  from: THREE.Vector3;
  dir: THREE.Vector3;
  hit: boolean;
}

interface Aide {
  p: Person;
  on: boolean;
  t: number;
  /** 'run' 달려오는 중 · 'stand' 면담 중 · 'leave' 돌아가는 중 */
  st: 'run' | 'stand' | 'leave';
  to: THREE.Vector3;
  from: THREE.Vector3;
  /** 권학생 자리 (그 사람 모형의 위치를 그대로 가리킨다 — 권학생이 움직이면 따라 선다) */
  at: THREE.Vector3 | null;
  side: number;
}

/** 여권·성적표·책수레·총학이 플레이어에게 닿을 때 쓰는 것 (Game) */
export interface HazHost extends Ctx {
  readonly pos: THREE.Vector3;
  hp: number;
  /** 최대 체력 (인물 장점으로 11칸일 수 있다). 없으면 10 */
  readonly maxHp?: number;
  shove?(dx: number, dz: number, slow: number): void;
}

interface PenLine {
  mesh: THREE.Mesh;
  label: THREE.Sprite;
  on: boolean;
  t: number;
  life: number;
  /** 선 가운데와 방향(선을 따라가는 단위 벡터) */
  cx: number;
  cz: number;
  ux: number;
  uz: number;
}

export interface Walker {
  /** 플레이어 발 위치 (x, z를 고친다) */
  pos: THREE.Vector3;
  /** 발이 땅에서 뜬 높이 */
  feet: number;
}

const _a = new THREE.Vector3();

export class StudentHazards {
  readonly lines: PenLine[] = [];
  readonly passports: Passport[] = [];
  readonly grades: Grade[] = [];
  readonly carts: Cart[] = [];
  readonly aides: Aide[] = [];
  private lastX = NaN;
  private lastZ = NaN;
  private readonly scene: THREE.Scene;
  private readonly kit: StudentKit;

  constructor(scene: THREE.Scene, kit: StudentKit) {
    this.scene = scene;
    this.kit = kit;
    for (let i = 0; i < PASS_N; i++) {
      const mesh = kit.passport();
      mesh.visible = false;
      scene.add(mesh);
      this.passports.push({ mesh, on: false, t: 0, vel: new THREE.Vector3() });
    }
    for (let i = 0; i < CART_N; i++) {
      const obj = kit.bookCart();
      obj.visible = false;
      scene.add(obj);
      this.carts.push({ obj, on: false, t: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), hit: false });
    }
    const geo = new THREE.PlaneGeometry(0.55, LINE_LEN).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const tex = kit.penTex.clone();
      tex.repeat.set(1, LINE_LEN / 2.4);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -12,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      const label = new THREE.Sprite(kit.penLabel);
      const aspect = ((kit.penLabel.map?.userData as { aspect?: number } | undefined)?.aspect ?? 2) as number;
      label.scale.set(0.42 * aspect, 0.42, 1);
      label.visible = false;
      scene.add(mesh, label);
      this.lines.push({ mesh, label, on: false, t: 0, life: 0, cx: 0, cz: 0, ux: 0, uz: 1 });
    }
  }

  /** 나진취: 플레이어 양옆(옆으로 3.4m)에 선을 긋는다. dir = 플레이어 → 나진취 (수평) */
  drawLines(px: number, pz: number, dx: number, dz: number, life: number): void {
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    let k = 0;
    for (const side of [-1, 1]) {
      const l = this.lines.find((q) => !q.on) ?? this.lines[k++];
      l.on = true;
      l.t = 0;
      l.life = life;
      l.ux = ux;
      l.uz = uz;
      l.cx = px + -uz * side * 3.4;
      l.cz = pz + ux * side * 3.4;
      l.mesh.position.set(l.cx, 0.04, l.cz);
      l.mesh.rotation.y = Math.atan2(ux, uz);
      l.mesh.scale.set(1, 1, 0.01);
      l.mesh.visible = true;
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      l.label.position.set(l.cx, 0.75, l.cz);
      l.label.visible = true;
      l.label.material.opacity = 0;
    }
  }

  /** 플레이어가 선을 걸어서 넘지 못하게 한다 (점프 중이면 넘는다). 막혔으면 true */
  block(p: Walker): boolean {
    let blocked = false;
    if (!Number.isNaN(this.lastX)) {
      for (const l of this.lines) {
        if (!l.on || l.t < GROW || l.t >= l.life || p.feet > 0.45) continue;
        // 선의 옆 방향(법선) 거리: 부호가 바뀌면 넘은 것
        const nx = -l.uz;
        const nz = l.ux;
        const before = (this.lastX - l.cx) * nx + (this.lastZ - l.cz) * nz;
        const now = (p.pos.x - l.cx) * nx + (p.pos.z - l.cz) * nz;
        const along = (p.pos.x - l.cx) * l.ux + (p.pos.z - l.cz) * l.uz;
        if (Math.abs(along) > LINE_LEN / 2 + 0.3) continue;
        const R = 0.45;
        if (Math.sign(before) !== Math.sign(now) || Math.abs(now) < R) {
          const s = Math.sign(before) || 1;
          const push = s * R - now;
          p.pos.x += nx * push;
          p.pos.z += nz * push;
          blocked = true;
        }
      }
    }
    this.lastX = p.pos.x;
    this.lastZ = p.pos.z;
    return blocked;
  }

  // ---------- 여권 (김국제) ----------

  throwPassport(from: THREE.Vector3, vel: THREE.Vector3): void {
    const p = this.passports.find((q) => !q.on);
    if (!p) return;
    p.on = true;
    p.t = 0;
    p.vel.copy(vel);
    p.mesh.position.copy(from);
    p.mesh.rotation.set(0, Math.atan2(vel.x, vel.z), 0);
    p.mesh.visible = true;
  }

  // ---------- 책수레 (최도서관) ----------

  /** from에서 (tx, tz) 쪽으로 책수레를 민다 */
  pushCart(from: THREE.Vector3, tx: number, tz: number): void {
    const c = this.carts.find((q) => !q.on);
    if (!c) return;
    c.on = true;
    c.t = 0;
    c.hit = false;
    c.from.set(from.x, 0, from.z);
    c.dir.set(tx - from.x, 0, tz - from.z);
    if (c.dir.lengthSq() < 1e-4) c.dir.set(0, 0, 1);
    c.dir.normalize();
    c.obj.position.copy(c.from);
    c.obj.rotation.y = Math.atan2(c.dir.x, c.dir.z) + Math.PI / 2;
    c.obj.visible = true;
  }

  // ---------- 총학 집행부 (권학생) ----------

  /** 사람 모형 둘을 미리 받아 둔다 (student/people.ts) */
  setAides(people: Person[]): void {
    for (const p of people) {
      p.root.visible = false;
      this.aides.push({ p, on: false, t: 0, st: 'run', to: new THREE.Vector3(), from: new THREE.Vector3(), at: null, side: 1 });
    }
  }

  /** 권학생(at — 모형 위치를 그대로 넘긴다) 앞, 플레이어(px, pz) 쪽에 둘이 선다. 옆에서 달려온다 */
  callAides(at: THREE.Vector3, px: number, pz: number): void {
    let dx = px - at.x;
    let dz = pz - at.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.aides.forEach((a, i) => {
      const side = i === 0 ? -1 : 1;
      a.on = true;
      a.t = 0;
      a.st = 'run';
      a.at = at;
      a.side = side;
      this.aideSpot(a, px, pz);
      a.from.set(a.to.x - dz * side * 12, 0, a.to.z + dx * side * 12);
      a.p.root.position.copy(a.from);
      a.p.root.visible = true;
      a.p.tag.hide();
      this.scene.add(a.p.root);
    });
  }

  /** 권학생에게서 플레이어 쪽으로 1.8m, 옆으로 0.5m씩 (어깨를 붙이고 서서 가운데로 서류가 빠지지 않는다) */
  private aideSpot(a: Aide, px: number, pz: number): void {
    const at = a.at;
    if (!at) return;
    let dx = px - at.x;
    let dz = pz - at.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    a.to.set(at.x + dx * 1.8 - dz * a.side * 0.5, 0, at.z + dz * 1.8 + dx * a.side * 0.5);
  }

  get aidesOut(): boolean {
    return this.aides.some((a) => a.on);
  }

  /** 서류가 p0 → p 로 날아가며 면담 중인 총학 집행부에 막혔는지 (그 사람 자리를 돌려준다) */
  aideBlock(p: THREE.Vector3): THREE.Vector3 | null {
    for (const a of this.aides) {
      if (!a.on || a.st === 'leave') continue;
      const o = a.p.root.position;
      if (Math.hypot(p.x - o.x, p.z - o.z) < AIDE_R && p.y < 2.6 * a.p.look.scale * 0.9) return o;
    }
    return null;
  }

  // ---------- 성적표 (한학고 학장) ----------

  placeGrade(grade: 'A+' | 'F', x: number, z: number): void {
    const obj = this.kit.gradeSheet(grade);
    obj.position.set(x, 0.05, z);
    this.scene.add(obj);
    this.grades.push({ obj, item: obj.children[0], grade, t: Math.random() * 6, ttl: 11 });
  }

  get gradesOut(): number {
    return this.grades.length;
  }

  /** 여권·책수레·총학·성적표 (적 시간 dt). 플레이어에 닿으면 c.hurt / c.freeze */
  updateThings(dt: number, c: HazHost): void {
    for (const p of this.passports) {
      if (!p.on) continue;
      p.t += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.y += dt * 9;
      if (p.t > 3 || p.mesh.position.y < 0) {
        p.on = false;
        p.mesh.visible = false;
        continue;
      }
      if (p.mesh.position.distanceTo(c.eye) < PASS_HIT) {
        p.on = false;
        p.mesh.visible = false;
        c.hurt(1, p.mesh.position, 'paper');
      }
    }
    for (const k of this.carts) {
      if (!k.on) continue;
      k.t += dt;
      const o = k.obj.position;
      o.addScaledVector(k.dir, CART_SPEED * dt);
      // 바퀴 굴러가는 덜컹거림
      k.obj.position.y = Math.abs(Math.sin(k.t * 22)) * 0.03;
      const a = c.area;
      const out = o.x < a.minX || o.x > a.maxX || o.z < a.minZ || o.z > a.maxZ;
      if (out || Math.hypot(o.x - k.from.x, o.z - k.from.z) > CART_RANGE) {
        k.on = false;
        k.obj.visible = false;
        continue;
      }
      if (!k.hit && c.feet < CART_JUMP && Math.hypot(c.pos.x - o.x, c.pos.z - o.z) < CART_HIT) {
        k.hit = true;
        c.hurt(1, _a.set(o.x, 0.6, o.z), 'cart');
        c.fx.confetti(_a.set(o.x, 0.8, o.z), 10, 2.5, 0x7a1f2b, 1.2, 0.5);
      }
    }
    for (const a of this.aides) {
      if (!a.on) continue;
      a.t += dt;
      const o = a.p.root.position;
      let walking = false;
      // 권학생이 움직이면 그 앞(플레이어 쪽)으로 따라 선다
      if (a.st !== 'leave') this.aideSpot(a, c.pos.x, c.pos.z);
      const to = a.st === 'leave' ? a.from : a.to;
      const dx = to.x - o.x;
      const dz = to.z - o.z;
      const d = Math.hypot(dx, dz);
      const step = AIDE_RUN * dt;
      if (d <= step) {
        o.set(to.x, 0, to.z);
        if (a.st === 'leave') {
          a.on = false;
          a.p.root.visible = false;
          a.p.root.removeFromParent();
          continue;
        }
        if (a.st === 'run') {
          a.st = 'stand';
          a.t = 0;
          a.p.say(AIDE_LINE, AIDE_LIFE, false);
        }
      } else {
        o.x += (dx / d) * step;
        o.z += (dz / d) * step;
        walking = d > 0.15;
      }
      if (a.st === 'stand' && a.at) {
        // 면담 중: 권학생을 본다
        a.p.root.rotation.y = Math.atan2(a.at.x - o.x, a.at.z - o.z);
        if (a.t >= AIDE_LIFE) {
          a.st = 'leave';
          a.t = 0;
          a.p.tag.hide();
        }
      } else if (walking) a.p.root.rotation.y = Math.atan2(dx, dz);
      a.p.update(dt, { walking, raise: 0, reach: a.st === 'stand' ? 0.4 : 0, wave: false });
      // 닿으면 밀어낸다 (피해 없음)
      if (a.st !== 'leave' && c.shove) {
        const dx = c.pos.x - o.x;
        const dz = c.pos.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < AIDE_R + 0.35 && d > 1e-3) {
          const push = (AIDE_R + 0.35 - d) + 0.05;
          c.shove((dx / d) * push, (dz / d) * push, 0);
        }
      }
    }
    let n = 0;
    for (const w of this.grades) {
      w.t += dt;
      w.ttl -= dt;
      w.item.position.y = 0.6 + Math.sin(w.t * 3) * 0.12;
      w.item.rotation.y += dt * 1.6;
      w.obj.visible = w.ttl > 3 || Math.floor(w.ttl * 8) % 2 === 0;
      const near = Math.hypot(c.pos.x - w.obj.position.x, c.pos.z - w.obj.position.z) < 1.3 && c.feet < 1;
      let took = false;
      if (near && w.grade === 'A+') {
        took = true;
        c.hp = Math.min(c.maxHp ?? 10, c.hp + GRADE_A_HEAL);
        c.fx.text(_a.copy(w.obj.position).setY(1.6), 'A+ 성적표! 체력 회복', '#7CFC9A', 0.6);
        c.sound('pickup', w.obj.position, 0.9);
      } else if (near) {
        // 이미 멈춰 있으면 줍지 않는다 (2D와 같다)
        took = c.freeze(GRADE_F_SEC, 'F 학점… 정정 기간이 아닙니다');
      }
      if (took) c.fx.confetti(_a.copy(w.obj.position).setY(0.8), 10, 2.5, w.grade === 'F' ? 0xd0202f : 0x7cfc9a, 1.5, 0.6);
      if (took || w.ttl <= 0) {
        this.scene.remove(w.obj);
        continue;
      }
      this.grades[n++] = w;
    }
    this.grades.length = n;
  }

  /** 창구 직원·보스가 물러나면 남긴 기믹을 거둔다 */
  clear(): void {
    for (const l of this.lines) {
      l.on = false;
      l.mesh.visible = false;
      l.label.visible = false;
    }
    for (const p of this.passports) {
      p.on = false;
      p.mesh.visible = false;
    }
    for (const k of this.carts) {
      k.on = false;
      k.obj.visible = false;
    }
    for (const a of this.aides) {
      a.on = false;
      a.at = null;
      a.p.root.visible = false;
      a.p.tag.hide();
      a.p.root.removeFromParent();
    }
    for (const w of this.grades) this.scene.remove(w.obj);
    this.grades.length = 0;
    this.lastX = NaN;
  }

  /** 첨삭 선 (적 시간 dt) */
  update(dt: number): void {
    for (const l of this.lines) {
      if (!l.on) continue;
      l.t += dt;
      const k = Math.min(1, l.t / GROW);
      l.mesh.scale.z = Math.max(0.01, k);
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      if (l.t >= l.life) {
        const a = Math.max(0, 1 - (l.t - l.life) / 0.4);
        mat.opacity = a;
        l.label.material.opacity = a;
        if (l.t >= l.life + 0.4) {
          l.on = false;
          l.mesh.visible = false;
          l.label.visible = false;
        }
      } else {
        // 곧 지워진다: 깜빡임
        mat.opacity = l.life - l.t < 1 && Math.floor(l.t * 10) % 2 === 0 ? 0.45 : 1;
        l.label.material.opacity = k;
      }
    }
  }
}
