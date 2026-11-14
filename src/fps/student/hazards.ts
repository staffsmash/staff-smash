import * as THREE from 'three';
import type { StudentKit } from './models';

// 학생 모드 창구 직원의 바닥·화면 기믹 (미리 만든 것을 돌려 쓴다).
// - 빨간 첨삭 선 (이진취): 플레이어 양옆에 그어져 길을 막는다. 점프로 넘는다 (본편 2D PenLine과 같다).
// - 소등 (박국제학사): 화면이 어두워지고 가운데(내 주변)만 보인다 (본편 2D Darkness와 같다).

const LINE_LEN = 16;
const GROW = 0.35;

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
  private dark: HTMLDivElement;
  private darkT = 0;
  private darkLife = 0;
  private lastX = NaN;
  private lastZ = NaN;

  constructor(scene: THREE.Scene, kit: StudentKit) {
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

  /** 창구 직원이 퇴근하면 남긴 기믹을 거둔다 */
  clear(): void {
    for (const l of this.lines) {
      l.on = false;
      l.mesh.visible = false;
      l.label.visible = false;
    }
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
