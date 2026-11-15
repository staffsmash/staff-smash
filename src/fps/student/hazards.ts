import * as THREE from 'three';
import type { Rect } from '../blocks';
import type { Ctx } from '../enemies';
import type { StudentKit } from './models';

// 학생 모드 창구 직원·보스의 바닥·화면 기믹 (미리 만든 것을 돌려 쓴다).
// - 빨간 첨삭 선 (이진취): 플레이어 양옆에 그어져 길을 막는다. 점프로 넘는다 (본편 2D PenLine과 같다).
// - 소등 (박국제학사): 화면이 어두워지고 가운데(내 주변)만 보인다 (본편 2D Darkness와 같다).
// - 국물 웅덩이 (김학생식당): 밟으면 미끄러진다 — 방향을 바꾸거나 멈추기 어렵다 (본편 2D Puddle·Player.slipT와 같다).
// - 여권 (김국제): 서류와 섞어 부채꼴로 날아온다. 피한다 (서류는 Game의 날아오는 종이라 서류로 맞혀 없앨 수 있다).
// - 일거리 (허허실실 부총장): 삼각김밥처럼 생겼지만 서류 귀퉁이가 보인다. 주우면 잠깐 멈춘다 (본편 2D 'work').

const LINE_LEN = 16;
const GROW = 0.35;
/** 국물 웅덩이 반지름 (m), 한꺼번에 남는 수 */
export const SOUP_R = 2.1;
const SOUP_MAX = 3;
/** 국물 위에서 원하는 쪽으로 붙는 빠르기 (2D SLIP_GRIP) */
const SLIP_GRIP = 2.2;
const PASS_N = 8;
const PASS_HIT = 0.75;
/** 일거리를 주우면 멈추는 시간 (2D startReport 1.6초) */
const WORK_SEC = 1.6;

interface Puddle {
  mesh: THREE.Mesh;
  on: boolean;
  t: number;
  life: number;
  x: number;
  z: number;
}

interface Passport {
  mesh: THREE.Mesh;
  on: boolean;
  t: number;
  vel: THREE.Vector3;
}

interface Work {
  obj: THREE.Group;
  item: THREE.Object3D;
  t: number;
  ttl: number;
}

/** 여권·일거리가 플레이어에게 닿을 때 쓰는 것 (Game) */
export interface HazHost extends Ctx {
  readonly pos: THREE.Vector3;
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

export class StudentHazards {
  readonly lines: PenLine[] = [];
  readonly puddles: Puddle[] = [];
  readonly passports: Passport[] = [];
  readonly works: Work[] = [];
  private dark: HTMLDivElement;
  private darkT = 0;
  private darkLife = 0;
  private lastX = NaN;
  private lastZ = NaN;
  // 미끄러짐 (국물)
  private slipT = 0;
  private slipVX = 0;
  private slipVZ = 0;
  private prevX = NaN;
  private prevZ = NaN;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, kit: StudentKit) {
    this.scene = scene;
    const soupGeo = new THREE.CircleGeometry(SOUP_R, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < SOUP_MAX; i++) {
      const mesh = new THREE.Mesh(soupGeo, kit.soupMat.clone());
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.puddles.push({ mesh, on: false, t: 0, life: 0, x: 0, z: 0 });
    }
    for (let i = 0; i < PASS_N; i++) {
      const mesh = kit.passport();
      mesh.visible = false;
      scene.add(mesh);
      this.passports.push({ mesh, on: false, t: 0, vel: new THREE.Vector3() });
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
    // 소등: 화면 가운데만 뚫린 어둠 (HUD보다 아래에 깐다)
    this.dark = document.createElement('div');
    this.dark.id = 'stuDark';
    const app = document.getElementById('app');
    app?.after(this.dark);
  }

  /** 이진취: 플레이어 양옆(옆으로 3.4m)에 선을 긋는다. dir = 플레이어 → 이진취 (수평) */
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

  /** 박국제학사: 소등 (sec초) */
  lightsOut(sec: number): void {
    this.darkT = 0;
    this.darkLife = sec;
    this.dark.style.opacity = '0';
    this.dark.classList.add('on');
  }

  get darkLeft(): number {
    return this.darkLife > 0 ? Math.max(0, this.darkLife - this.darkT) : 0;
  }

  // ---------- 국물 (김학생식당) ----------

  /** 국물을 쏟는다 (한꺼번에 셋까지: 가장 오래된 것을 다시 쓴다) */
  spill(x: number, z: number, life: number): void {
    let p = this.puddles.find((q) => !q.on);
    if (!p) p = this.puddles.reduce((a, b) => (a.t > b.t ? a : b));
    p.on = true;
    p.t = 0;
    p.life = life;
    p.x = x;
    p.z = z;
    // 대운동장 인조 잔디·선(0.06~0.09m) 위로
    p.mesh.position.set(x, 0.11, z);
    p.mesh.rotation.y = Math.random() * Math.PI * 2;
    p.mesh.scale.setScalar(0.2);
    p.mesh.visible = true;
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  /** 국물 위에 서 있나 (점프 중이면 아니다) */
  onSoup(x: number, z: number, feet: number): boolean {
    if (feet > 0.3) return false;
    for (const p of this.puddles) {
      if (p.on && p.t < p.life && Math.hypot(x - p.x, z - p.z) < SOUP_R * Math.min(1, p.mesh.scale.x)) return true;
    }
    return false;
  }

  /**
   * 국물 위에서는 미끄러진다: Game이 방금 옮긴 만큼을 "원하는 속도"로 보고, 실제 속도는 천천히만 따라간다.
   * rects = 열린 구역, obstacles = 화단 등. 미끄러지는 중이면 true
   */
  slip(p: Walker, dt: number, rects: readonly Rect[], obstacles: readonly Rect[]): boolean {
    if (this.onSoup(p.pos.x, p.pos.z, p.feet)) this.slipT = 0.15;
    else if (this.slipT > 0) this.slipT -= dt;
    if (Number.isNaN(this.prevX) || dt <= 0) {
      this.prevX = p.pos.x;
      this.prevZ = p.pos.z;
      return false;
    }
    // 원하는 속도 (순간 이동은 무시)
    let ix = (p.pos.x - this.prevX) / dt;
    let iz = (p.pos.z - this.prevZ) / dt;
    const sp = Math.hypot(ix, iz);
    if (sp > 14) {
      ix = 0;
      iz = 0;
    }
    const sliding = this.slipT > 0;
    if (sliding) {
      const k = 1 - Math.exp(-SLIP_GRIP * dt);
      this.slipVX += (ix - this.slipVX) * k;
      this.slipVZ += (iz - this.slipVZ) * k;
      let x = this.prevX + this.slipVX * dt;
      let z = this.prevZ + this.slipVZ * dt;
      // 열린 구역 가운데 가장 가까운 곳 안으로
      let best = Infinity;
      let bx = x;
      let bz = z;
      for (const r of rects) {
        const cx = Math.max(r.minX, Math.min(r.maxX, x));
        const cz = Math.max(r.minZ, Math.min(r.maxZ, z));
        const d = (cx - x) ** 2 + (cz - z) ** 2;
        if (d < best) {
          best = d;
          bx = cx;
          bz = cz;
        }
      }
      if (bx !== x) this.slipVX = 0;
      if (bz !== z) this.slipVZ = 0;
      x = bx;
      z = bz;
      for (const o of obstacles) {
        const cx = Math.max(o.minX, Math.min(o.maxX, x));
        const cz = Math.max(o.minZ, Math.min(o.maxZ, z));
        const d = Math.hypot(x - cx, z - cz);
        if (d < 0.45 && d > 0.0001) {
          x = cx + ((x - cx) / d) * 0.45;
          z = cz + ((z - cz) / d) * 0.45;
          this.slipVX *= 0.3;
          this.slipVZ *= 0.3;
        }
      }
      p.pos.x = x;
      p.pos.z = z;
    } else {
      this.slipVX = ix;
      this.slipVZ = iz;
    }
    this.prevX = p.pos.x;
    this.prevZ = p.pos.z;
    return sliding;
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

  // ---------- 일거리 (허허실실 부총장) ----------

  /** obj = 바닥 물건 (Game의 음식 모형처럼 obj.children[0]이 떠 있는 물건) */
  placeWork(obj: THREE.Group, x: number, z: number): void {
    obj.position.set(x, 0.05, z);
    this.scene.add(obj);
    this.works.push({ obj, item: obj.children[0], t: Math.random() * 6, ttl: 12 });
  }

  get worksOut(): number {
    return this.works.length;
  }

  /** 웅덩이·여권·일거리 (적 시간 dt). 플레이어에 닿으면 c.hurt / c.freeze */
  updateThings(dt: number, c: HazHost): void {
    for (const p of this.puddles) {
      if (!p.on) continue;
      p.t += dt;
      const s = Math.min(1, 0.2 + (p.t / 0.26) * 0.8);
      p.mesh.scale.setScalar(s < 1 ? s + Math.sin((p.t / 0.26) * Math.PI) * 0.08 : 1);
      if (p.t >= p.life) {
        const a = Math.max(0, 1 - (p.t - p.life) / 0.5);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = a;
        if (p.t >= p.life + 0.5) {
          p.on = false;
          p.mesh.visible = false;
        }
      }
    }
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
    let n = 0;
    for (const w of this.works) {
      w.t += dt;
      w.ttl -= dt;
      w.item.position.y = 0.55 + Math.sin(w.t * 3) * 0.12;
      w.item.rotation.y += dt * 1.6;
      w.obj.visible = w.ttl > 3 || Math.floor(w.ttl * 8) % 2 === 0;
      const near = Math.hypot(c.pos.x - w.obj.position.x, c.pos.z - w.obj.position.z) < 1.3 && c.feet < 1;
      // 이미 멈춰 있으면 줍지 않는다 (2D와 같다)
      const took = near && c.freeze(WORK_SEC, '일거리였다… 검토 중');
      if (took) c.fx.confetti(w.obj.position.clone().setY(0.8), 10, 2.5, 0xffffff, 1.5, 0.6);
      if (took || w.ttl <= 0) {
        this.scene.remove(w.obj);
        continue;
      }
      this.works[n++] = w;
    }
    this.works.length = n;
  }

  /** 창구 직원이 퇴근하면 남긴 기믹을 거둔다 */
  clear(): void {
    for (const l of this.lines) {
      l.on = false;
      l.mesh.visible = false;
      l.label.visible = false;
    }
    for (const p of this.puddles) {
      p.on = false;
      p.mesh.visible = false;
    }
    for (const p of this.passports) {
      p.on = false;
      p.mesh.visible = false;
    }
    for (const w of this.works) this.scene.remove(w.obj);
    this.works.length = 0;
    this.slipT = 0;
    this.prevX = NaN;
    this.darkLife = 0;
    this.dark.classList.remove('on');
    this.dark.style.opacity = '0';
    this.lastX = NaN;
  }

  /** 소등이 끝났으면 true (그 프레임에 한 번) */
  update(dt: number): boolean {
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
    if (this.darkLife > 0) {
      this.darkT += dt;
      const a = Math.min(Math.min(1, this.darkT / 0.25), Math.max(0, (this.darkLife - this.darkT) / 0.4));
      this.dark.style.opacity = a.toFixed(2);
      if (this.darkT >= this.darkLife) {
        this.darkLife = 0;
        this.dark.classList.remove('on');
        return true;
      }
    }
    return false;
  }
}
