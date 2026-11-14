import * as THREE from 'three';
import { labelTex, stampMarkTex } from './textures';

// 효과: 종이 조각(인스턴스 한 번에 그림), 폭발 구, 바닥 고리, "처리" 도장 자국, 떠오르는 글자.
// 모두 미리 만들어 둔 것을 돌려 쓴다 (매 프레임 새 객체를 만들지 않는다).

const MAX_BITS = 520;

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Vector3;
  w: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  drag: number;
}

interface Timed<T extends THREE.Object3D> {
  obj: T;
  mat: THREE.Material & { opacity: number };
  t: number;
  life: number;
  a: number;
  b: number;
  rise: number;
}

const _dummy = new THREE.Object3D();
const _c = new THREE.Color();
const _t = new THREE.Vector3();

export class Fx {
  private bits: Bit[] = [];
  private nBits = 0;
  private bitMesh: THREE.InstancedMesh;
  private blasts: Timed<THREE.Mesh>[] = [];
  private rings: Timed<THREE.Mesh>[] = [];
  private marks: Timed<THREE.Sprite>[] = [];
  private decals: Timed<THREE.Mesh>[] = [];
  private texts: Timed<THREE.Sprite>[] = [];
  private textTex = new Map<string, THREE.Texture>();
  private markTex = stampMarkTex();
  /** 지금 쓰는 도장 자국 그림 (학생 모드는 "통과", 바닥은 떨어진 서류) */
  private curMark: THREE.Texture = this.markTex;
  private curDecal: THREE.Texture = this.markTex;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.26, 0.02, 0.34);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bitMesh = new THREE.InstancedMesh(geo, mat, MAX_BITS);
    this.bitMesh.frustumCulled = false;
    this.bitMesh.count = 0;
    this.bitMesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.bitMesh);
    for (let i = 0; i < MAX_BITS; i++) {
      this.bits.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Vector3(),
        w: new THREE.Vector3(),
        life: 0,
        max: 1,
        size: 1,
        color: new THREE.Color(),
        drag: 0,
      });
    }
    const blastGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 8; i++) {
      const mat2 = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(blastGeo, mat2);
      m.visible = false;
      scene.add(m);
      this.blasts.push({ obj: m, mat: mat2, t: 0, life: 0, a: 0, b: 0, rise: 0 });
    }
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const mat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(ringGeo, mat2);
      m.visible = false;
      scene.add(m);
      this.rings.push({ obj: m, mat: mat2, t: 0, life: 0, a: 0, b: 0, rise: 0 });
    }
    for (let i = 0; i < 24; i++) {
      const mat2 = new THREE.SpriteMaterial({ map: this.markTex, transparent: true, depthTest: false, depthWrite: false });
      const s = new THREE.Sprite(mat2);
      s.renderOrder = 10;
      s.visible = false;
      scene.add(s);
      this.marks.push({ obj: s, mat: mat2, t: 0, life: 0, a: 0, b: 0, rise: 0 });
    }
    const decalGeo = new THREE.PlaneGeometry(0.9, 0.9);
    decalGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 18; i++) {
      const mat2 = new THREE.MeshBasicMaterial({ map: this.markTex, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(decalGeo, mat2);
      m.visible = false;
      scene.add(m);
      this.decals.push({ obj: m, mat: mat2, t: 0, life: 0, a: 0, b: 0, rise: 0 });
    }
    for (let i = 0; i < 10; i++) {
      const mat2 = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
      const s = new THREE.Sprite(mat2);
      s.renderOrder = 11;
      s.visible = false;
      scene.add(s);
      this.texts.push({ obj: s, mat: mat2, t: 0, life: 0, a: 0, b: 0, rise: 0 });
    }
  }

  /** 종이 조각을 사방으로 흩뿌린다 */
  confetti(at: THREE.Vector3, n: number, speed: number, color = 0xffffff, up = 2.5, size = 1): void {
    for (let i = 0; i < n; i++) {
      const b = this.nextBit();
      b.p.copy(at);
      b.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      b.v.y += up;
      b.life = b.max = 0.9 + Math.random() * 0.8;
      b.size = size * (0.7 + Math.random() * 0.6);
      b.color.set(i % 4 === 0 && color === 0xffffff ? 0xd0202f : color);
      b.drag = 1.2;
    }
  }

  /** 한 방향 부채꼴로 종이를 날린다 (전체 공지 발송) */
  spray(at: THREE.Vector3, dir: THREE.Vector3, n: number, speed: number, spread: number, color: number): void {
    for (let i = 0; i < n; i++) {
      const b = this.nextBit();
      b.p.copy(at);
      b.v
        .copy(dir)
        .add(_t.set((Math.random() - 0.5) * spread, (Math.random() - 0.3) * spread * 0.4, (Math.random() - 0.5) * spread))
        .normalize()
        .multiplyScalar(speed * (0.6 + Math.random() * 0.4));
      b.life = b.max = 1.0 + Math.random() * 0.6;
      b.size = 1.2;
      b.color.set(i % 3 ? color : 0xffffff);
      b.drag = 0.4;
    }
  }

  private nextBit(): Bit {
    const b = this.nBits < MAX_BITS ? this.bits[this.nBits++] : this.bits[Math.floor(Math.random() * MAX_BITS)];
    b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    b.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18);
    return b;
  }

  blast(at: THREE.Vector3, radius: number, color = 0xffb347): void {
    const b = this.take(this.blasts);
    b.obj.position.copy(at);
    (b.mat as THREE.MeshBasicMaterial).color.set(color);
    b.t = 0;
    b.life = 0.38;
    b.a = radius * 0.25;
    b.b = radius;
    b.obj.visible = true;
  }

  ring(x: number, y: number, z: number, r0: number, r1: number, life: number, color: number): void {
    const r = this.take(this.rings);
    r.obj.position.set(x, y, z);
    (r.mat as THREE.MeshBasicMaterial).color.set(color);
    r.t = 0;
    r.life = life;
    r.a = r0;
    r.b = r1;
    r.obj.visible = true;
  }

  /** 맞힌 자리·바닥 자국 그림을 바꾼다. 비우면 교직원 모드 "처리" 도장 */
  setMarks(mark?: THREE.Texture, decal?: THREE.Texture): void {
    this.curMark = mark ?? this.markTex;
    this.curDecal = decal ?? this.markTex;
    for (const d of this.decals) (d.mat as THREE.MeshBasicMaterial).map = this.curDecal;
  }

  /** tex: 이번 자국만 다른 그림 (학생 모드 "설득"·"반사"·주문 도장) */
  mark(at: THREE.Vector3, size: number, tex?: THREE.Texture): void {
    const m = this.take(this.marks);
    (m.mat as THREE.SpriteMaterial).map = tex ?? this.curMark;
    m.obj.position.copy(at);
    m.obj.scale.setScalar(size * 1.6);
    m.t = 0;
    m.life = 0.8;
    m.obj.visible = true;
  }

  decal(x: number, z: number): void {
    const d = this.take(this.decals);
    d.obj.position.set(x, 0.03, z);
    d.t = 0;
    d.life = 1.4;
    d.obj.visible = true;
  }

  text(at: THREE.Vector3, text: string, color = '#ffffff', size = 0.55): void {
    let tex = this.textTex.get(text + color);
    if (!tex) {
      tex = labelTex(text, color, '');
      this.textTex.set(text + color, tex);
    }
    const s = this.take(this.texts);
    (s.mat as THREE.SpriteMaterial).map = tex;
    s.mat.needsUpdate = true;
    const aspect = (tex.userData as { aspect?: number }).aspect ?? 3;
    s.obj.scale.set(size * aspect, size, 1);
    s.obj.position.copy(at);
    s.t = 0;
    s.life = 1.0;
    s.rise = 1.2;
    s.obj.visible = true;
  }

  /** 가장 오래된(또는 쉬는) 것을 가져온다 */
  private take<T extends THREE.Object3D>(pool: Timed<T>[]): Timed<T> {
    let best = pool[0];
    for (const p of pool) {
      if (!p.obj.visible) return p;
      if (p.t / p.life > best.t / best.life) best = p;
    }
    return best;
  }

  update(dt: number): void {
    // 종이 조각
    let i = 0;
    while (i < this.nBits) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0 || b.p.y < -0.5) {
        const last = this.bits[this.nBits - 1];
        this.bits[this.nBits - 1] = b;
        this.bits[i] = last;
        this.nBits--;
        continue;
      }
      b.v.y -= 6 * dt;
      b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
      // 종이는 천천히 떨어진다
      if (b.v.y < -2.2) b.v.y = -2.2;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < 0.03) {
        b.p.y = 0.03;
        b.v.set(0, 0, 0);
      }
      b.r.addScaledVector(b.w, dt);
      const s = b.size * Math.min(1, (b.life / b.max) * 3);
      _dummy.position.copy(b.p);
      _dummy.rotation.set(b.r.x, b.r.y, b.r.z);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.bitMesh.setMatrixAt(i, _dummy.matrix);
      this.bitMesh.setColorAt(i, b.color);
      i++;
    }
    this.bitMesh.count = this.nBits;
    this.bitMesh.instanceMatrix.needsUpdate = true;
    if (this.bitMesh.instanceColor) this.bitMesh.instanceColor.needsUpdate = true;

    for (const b of this.blasts) {
      if (!b.obj.visible) continue;
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) {
        b.obj.visible = false;
        continue;
      }
      b.obj.scale.setScalar(b.a + (b.b - b.a) * Math.sqrt(k));
      b.mat.opacity = 0.85 * (1 - k);
    }
    for (const r of this.rings) {
      if (!r.obj.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.obj.visible = false;
        continue;
      }
      r.obj.scale.setScalar(r.a + (r.b - r.a) * k);
      r.mat.opacity = 0.8 * (1 - k);
    }
    for (const list of [this.marks, this.decals]) {
      for (const m of list) {
        if (!m.obj.visible) continue;
        m.t += dt;
        if (m.t >= m.life) {
          m.obj.visible = false;
          continue;
        }
        m.mat.opacity = 1 - m.t / m.life;
      }
    }
    for (const s of this.texts) {
      if (!s.obj.visible) continue;
      s.t += dt;
      if (s.t >= s.life) {
        s.obj.visible = false;
        continue;
      }
      s.obj.position.y += s.rise * dt;
      s.mat.opacity = Math.min(1, (1 - s.t / s.life) * 2.5);
    }
  }

  clear(): void {
    this.nBits = 0;
    this.bitMesh.count = 0;
    for (const list of [this.blasts, this.rings, this.decals]) for (const b of list) b.obj.visible = false;
    for (const list of [this.marks, this.texts]) for (const b of list) b.obj.visible = false;
  }
}

