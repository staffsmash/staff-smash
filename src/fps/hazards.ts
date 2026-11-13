import * as THREE from 'three';
import type { Ctx } from './enemies';
import { bigStampMarkTex, errorWinTex, keyTagTex, meetingRingTex, reportBubbleTex } from './textures';

// 사람 보스들이 바닥에 깔거나 떨어뜨리는 것 (모두 미리 만든 것을 돌려 쓴다).
// - 강의실 열쇠 (김총괄): 바닥에서 반짝이며 도는 미끼. 밟으면 "대관 불가입니다… (잠깐 멈춤)". 잠시 뒤 김총괄이 회수한다.
// - "보고해!" 말풍선 (김보고 처장): 빨간 그림자 자리에 떨어져 6초 남는다. 밟으면 보고서를 쓰느라 잠깐 멈춘다.
// - 회의 소집 고리 (회의소집 부총장): 바닥을 따라 퍼진다. 점프로 넘는다.
// - 거대 도장·오류 창 (프레지던트 캉): 빨간 그림자 → 떨어진다. 피한다.

/** 고리 높이: 발이 이보다 높이 떠 있으면 넘는다 */
export const RING_H = 0.55;
export const RING_SPEED = 8;
const RING_MAX = 54;
const RING_BAND = 0.45;

const KEY_N = 8;
const KEY_FLIGHT = 0.6;
const REPORT_N = 3;
const REPORT_FLIGHT = 1.1;
const REPORT_LIFE = 6;
const DROP_WARN = 1.05;

interface Key {
  mesh: THREE.Object3D;
  on: boolean;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 0 = 날아가는 중, 1 = 바닥, 2 = 회수 중 */
  mode: 0 | 1 | 2;
}

interface Report {
  sprite: THREE.Sprite;
  warn: THREE.Mesh;
  on: boolean;
  t: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  landed: boolean;
}

interface Drop {
  obj: THREE.Object3D;
  warn: THREE.Mesh;
  on: boolean;
  t: number;
  x: number;
  z: number;
  kind: 'stamp' | 'error';
  r: number;
  mark: string;
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  x: number;
  z: number;
  r: number;
  on: boolean;
  hit: boolean;
  dodged: boolean;
}

interface Decal {
  mesh: THREE.Mesh;
  t: number;
}

const _a = new THREE.Vector3();

export class Hazards {
  private keys: Key[] = [];
  private reports: Report[] = [];
  private drops: Drop[] = [];
  readonly rings: Ring[] = [];
  private decals: Decal[] = [];
  private decalMats = new Map<string, THREE.MeshBasicMaterial>();
  private stampTexMat: THREE.MeshLambertMaterial;
  readonly textures: THREE.Texture[] = [];
  /** 지금 떨어질 자리들 (앞에서 warnN개, 시험 봇이 피할 때 쓴다) */
  readonly warns: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  warnN = 0;

  constructor(scene: THREE.Scene, warnGeo: THREE.BufferGeometry, warnMat: THREE.Material) {
    // 강의실 열쇠: 놋쇠 열쇠(고리·몸통·톱니) + 파란 "강의실" 번호표. 세로로 서서 돈다
    const brass = new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x6b4a00 });
    const tagTex = keyTagTex();
    this.textures.push(tagTex);
    const tagFace = new THREE.MeshLambertMaterial({ map: tagTex, emissive: 0x0a1f4a });
    const tagSide = new THREE.MeshLambertMaterial({ color: 0x2f6fd1, emissive: 0x0a1f4a });
    const bowGeo = new THREE.TorusGeometry(0.15, 0.05, 8, 18);
    const shaftGeo = new THREE.BoxGeometry(0.46, 0.08, 0.05);
    const toothGeo = new THREE.BoxGeometry(0.07, 0.13, 0.05);
    const tagGeo = new THREE.BoxGeometry(0.34, 0.24, 0.03);
    for (let i = 0; i < KEY_N; i++) {
      const mesh = new THREE.Group();
      const bow = new THREE.Mesh(bowGeo, brass);
      bow.position.x = -0.3;
      const shaft = new THREE.Mesh(shaftGeo, brass);
      shaft.position.x = 0.06;
      const t1 = new THREE.Mesh(toothGeo, brass);
      t1.position.set(0.16, -0.09, 0);
      const t2 = new THREE.Mesh(toothGeo, brass);
      t2.position.set(0.25, -0.07, 0);
      const tag = new THREE.Mesh(tagGeo, [tagSide, tagSide, tagSide, tagSide, tagFace, tagFace]);
      tag.position.set(-0.34, -0.3, 0);
      tag.rotation.z = 0.25;
      mesh.add(bow, shaft, t1, t2, tag);
      for (const ch of mesh.children) ch.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.keys.push({ mesh, on: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), mode: 0 });
    }
    // "보고해!"
    const bubble = reportBubbleTex();
    this.textures.push(bubble);
    const bubbleMat = new THREE.SpriteMaterial({ map: bubble, transparent: true, depthWrite: false });
    for (let i = 0; i < REPORT_N; i++) {
      const sprite = new THREE.Sprite(bubbleMat.clone());
      sprite.scale.set(1.9, 1.0, 1);
      sprite.visible = false;
      const warn = new THREE.Mesh(warnGeo, warnMat);
      warn.rotation.x = -Math.PI / 2;
      warn.visible = false;
      scene.add(sprite, warn);
      this.reports.push({ sprite, warn, on: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), landed: false });
    }
    // 거대 도장 (손잡이 + 빨간 도장면) 셋, 오류 창 여섯
    const wood = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const red = new THREE.MeshLambertMaterial({ color: 0xc8202f });
    this.stampTexMat = red;
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.7), wood);
      h.position.y = 1.35;
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.4), red);
      head.position.y = 0.25;
      h.castShadow = head.castShadow = true;
      g.add(h, head);
      g.visible = false;
      scene.add(g);
      this.drops.push(this.newDrop(g, 'stamp', warnGeo, warnMat, scene));
    }
    const errTex = errorWinTex();
    this.textures.push(errTex);
    const errFace = new THREE.MeshBasicMaterial({ map: errTex });
    const errSide = new THREE.MeshLambertMaterial({ color: 0xc9ced8 });
    const errGeo = new THREE.BoxGeometry(1.5, 1.12, 0.14);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(errGeo, [errSide, errSide, errSide, errSide, errFace, errFace]);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.drops.push(this.newDrop(m, 'error', warnGeo, warnMat, scene));
    }
    // 회의 소집 고리 (반지름 1, 높이 1인 열린 원통을 키운다). 글씨가 늘어나지 않게 고리마다 반복 수를 바꾼다
    const ringGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0);
    const ringTex = meetingRingTex();
    this.textures.push(ringTex);
    for (let i = 0; i < 6; i++) {
      const tex = ringTex.clone();
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, mat, tex, x: 0, z: 0, r: 0, on: false, hit: false, dodged: false });
    }
    // 바닥 도장 자국 ("보류" / "재검토")
    const decalGeo = new THREE.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2);
    for (const text of ['보류', '재검토']) {
      const t = bigStampMarkTex(text);
      this.textures.push(t);
      this.decalMats.set(
        text,
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 }),
      );
    }
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(decalGeo, this.decalMats.get('보류'));
      mesh.visible = false;
      scene.add(mesh);
      this.decals.push({ mesh, t: 0 });
    }
  }

  private newDrop(obj: THREE.Object3D, kind: 'stamp' | 'error', warnGeo: THREE.BufferGeometry, warnMat: THREE.Material, scene: THREE.Scene): Drop {
    const warn = new THREE.Mesh(warnGeo, warnMat);
    warn.rotation.x = -Math.PI / 2;
    warn.visible = false;
    scene.add(warn);
    return { obj, warn, on: false, t: 0, x: 0, z: 0, kind, r: kind === 'stamp' ? 1.7 : 1.25, mark: '보류' };
  }

  // ---------- 강의실 열쇠 ----------

  /** 김총괄이 강의실 열쇠를 뿌린다: 플레이어 주위 2~6m에 */
  scatterKeys(from: THREE.Vector3, px: number, pz: number, n: number, area: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
    let k = 0;
    for (const c of this.keys) {
      if (c.on || k >= n) continue;
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const d = 1.8 + Math.random() * 3.8;
      c.to.set(
        Math.max(area.minX + 1, Math.min(area.maxX - 1, px + Math.cos(a) * d)),
        0.06,
        Math.max(area.minZ + 1, Math.min(area.maxZ - 1, pz + Math.sin(a) * d)),
      );
      c.from.copy(from);
      c.t = 0;
      c.mode = 0;
      c.on = true;
      c.mesh.visible = true;
      k++;
    }
  }

  /** 바닥에 있거나 날아가는 열쇠 수 (회수 중은 빼고) */
  keysOut(): number {
    let n = 0;
    for (const c of this.keys) if (c.on && c.mode !== 2) n++;
    return n;
  }

  /** 회수: 주인에게 날아가 사라진다 */
  recallKeys(to: THREE.Vector3): void {
    for (const c of this.keys) {
      if (!c.on) continue;
      c.from.copy(c.mesh.position);
      c.to.copy(to);
      c.t = 0;
      c.mode = 2;
    }
  }

  /** 바닥에 있는 열쇠 (시험 봇이 피할 때) */
  keyAt(i: number): THREE.Vector3 | null {
    const c = this.keys[i];
    return c && c.on && c.mode === 1 ? c.mesh.position : null;
  }

  // ---------- 보고해! ----------

  throwReport(from: THREE.Vector3, x: number, z: number): void {
    const r = this.reports.find((q) => !q.on);
    if (!r) return;
    r.on = true;
    r.t = 0;
    r.landed = false;
    r.from.copy(from);
    r.to.set(x, 0.55, z);
    r.sprite.visible = true;
    r.sprite.position.copy(from);
    (r.sprite.material as THREE.SpriteMaterial).opacity = 1;
    r.warn.visible = true;
    r.warn.position.set(x, 0.07, z);
    r.warn.scale.setScalar(0.5);
  }

  // ---------- 떨어지는 것 ----------

  /** 빨간 그림자 뒤에 떨어진다. kind: 거대 도장(mark = 바닥 자국 글자) 또는 오류 창 */
  drop(kind: 'stamp' | 'error', x: number, z: number, mark = '보류'): void {
    const d = this.drops.find((q) => !q.on && q.kind === kind);
    if (!d) return;
    d.on = true;
    d.t = 0;
    d.x = x;
    d.z = z;
    d.mark = mark;
    d.warn.visible = true;
    d.warn.position.set(x, 0.07, z);
    d.warn.scale.setScalar(kind === 'stamp' ? 0.6 : 0.45);
    d.obj.visible = true;
    d.obj.position.set(x, 18, z);
    d.obj.rotation.set(0, Math.random() * 3, kind === 'error' ? 0.2 : 0);
  }

  // ---------- 회의 소집 고리 ----------

  ring(x: number, z: number): void {
    const w = this.rings.find((q) => !q.on) ?? this.rings[0];
    w.x = x;
    w.z = z;
    w.r = 0.6;
    w.on = true;
    w.hit = false;
    w.dodged = false;
    w.mesh.position.set(x, 0.03, z);
    w.mesh.scale.set(w.r, RING_H, w.r);
    w.mat.opacity = 1;
    w.mesh.visible = true;
  }

  /** (x, z)에 가장 먼저 닿을 고리까지 남은 시간 (적 시간, 초). 없으면 Infinity */
  ringEta(x: number, z: number): number {
    let best = Infinity;
    for (const w of this.rings) {
      if (!w.on || w.hit || w.dodged) continue;
      const d = Math.hypot(x - w.x, z - w.z);
      if (d + RING_BAND < w.r) continue;
      best = Math.min(best, Math.max(0, d - RING_BAND - w.r) / RING_SPEED);
    }
    return best;
  }

  // ---------- 매 프레임 ----------

  update(dt: number, c: Ctx): void {
    const eye = c.eye;
    const feet = c.feet;
    this.warnN = 0;
    for (const k of this.keys) {
      if (!k.on) continue;
      k.t += dt;
      const m = k.mesh;
      if (k.mode === 0 || k.mode === 2) {
        const dur = k.mode === 0 ? KEY_FLIGHT : 0.5;
        const f = Math.min(1, k.t / dur);
        m.position.lerpVectors(k.from, k.to, f);
        m.position.y += Math.sin(f * Math.PI) * (k.mode === 0 ? 2.2 : 1.2);
        m.rotation.x += dt * 12;
        if (f >= 1) {
          if (k.mode === 2) {
            k.on = false;
            m.visible = false;
          } else {
            k.mode = 1;
            m.rotation.set(0, Math.random() * Math.PI * 2, 0);
          }
        }
      } else {
        m.rotation.y += dt * 3;
        m.position.y = 0.56 + Math.sin(k.t * 4) * 0.06;
        if (feet < 0.3 && Math.hypot(eye.x - m.position.x, eye.z - m.position.z) < 0.85 && c.freeze(1.2, '대관 불가입니다… (잠깐 멈춤)')) {
          k.on = false;
          m.visible = false;
          c.fx.confetti(m.position, 8, 3, 0xf2c230, 1.5, 0.6);
          c.sound('tick', m.position, 1);
        }
      }
    }
    for (const r of this.reports) {
      if (!r.on) continue;
      r.t += dt;
      if (!r.landed) {
        const f = Math.min(1, r.t / REPORT_FLIGHT);
        r.sprite.position.lerpVectors(r.from, r.to, f);
        r.sprite.position.y += Math.sin(f * Math.PI) * 3;
        r.warn.scale.setScalar(0.5 + f * 0.6);
        this.pushWarn(r.to.x, r.to.z);
        if (f >= 1) {
          r.landed = true;
          r.t = 0;
          r.warn.visible = false;
          c.fx.ring(r.to.x, 0.06, r.to.z, 0.3, 1.8, 0.35, 0xffffff);
          c.sound('hit', r.to, 0.8);
        }
      } else {
        const left = REPORT_LIFE - r.t;
        r.sprite.position.y = 0.6 + Math.sin(r.t * 3) * 0.05;
        (r.sprite.material as THREE.SpriteMaterial).opacity = left < 1.2 && Math.floor(left * 10) % 2 === 0 ? 0.3 : 1;
        const touching = feet < 0.3 && Math.hypot(eye.x - r.to.x, eye.z - r.to.z) < 1.0;
        if (left <= 0 || (touching && c.freeze(1.4, '보고서 작성 중… (잠깐 멈춤)'))) {
          r.on = false;
          r.sprite.visible = false;
        }
      }
    }
    for (const d of this.drops) {
      if (!d.on) continue;
      d.t += dt;
      if (d.t < DROP_WARN) {
        d.warn.scale.setScalar((d.kind === 'stamp' ? 0.6 : 0.45) + (d.t / DROP_WARN) * (d.kind === 'stamp' ? 0.75 : 0.55));
        d.obj.position.y = 18 - (d.t / DROP_WARN) * 4;
        if (d.kind === 'error') d.obj.rotation.y += dt * 2;
        this.pushWarn(d.x, d.z);
        continue;
      }
      const f = Math.min(1, (d.t - DROP_WARN) / 0.22);
      d.obj.position.y = 14 * (1 - f);
      if (f >= 1) {
        d.on = false;
        d.warn.visible = false;
        _a.set(d.x, 1, d.z);
        if (Math.hypot(eye.x - d.x, eye.z - d.z) < d.r) c.hurt(1, _a, d.kind === 'stamp' ? 'bigstamp' : 'error');
        if (d.kind === 'stamp') {
          d.obj.visible = false;
          this.decal(d.x, d.z, d.mark);
          c.fx.ring(d.x, 0.06, d.z, 0.8, 3.4, 0.45, 0xd0202f);
          c.sound('boom', _a, 0.7);
          c.quake(0.5, _a);
        } else {
          d.obj.visible = false;
          c.fx.confetti(_a.set(d.x, 0.3, d.z), 10, 2.5, 0x9fd3ff, 1.2, 0.45);
          c.sound('pop', _a, 0.9);
        }
      }
    }
    for (const w of this.rings) {
      if (!w.on) continue;
      const r0 = w.r;
      w.r += RING_SPEED * dt;
      w.mesh.scale.set(w.r, RING_H, w.r);
      // 글씨가 늘어나지 않게 둘레 2.6m마다 "회의 소집" 한 번
      w.tex.repeat.x = Math.max(3, Math.round((w.r * Math.PI * 2) / 2.6));
      w.mat.opacity = Math.min(1, (RING_MAX - w.r) / 8);
      if (!w.hit && !w.dodged) {
        const d = Math.hypot(eye.x - w.x, eye.z - w.z);
        if (d >= r0 - RING_BAND && d <= w.r + RING_BAND) {
          if (feet < RING_H) {
            w.hit = true;
            c.hurt(1.5, _a.set(w.x, 1, w.z), 'wave');
          } else if (d <= w.r - RING_BAND * 0.5) {
            w.dodged = true;
            c.fx.text(_a.set(eye.x, eye.y + 0.6, eye.z), '회의 불참 성공!', '#7CFC9A', 0.5);
          }
        }
      }
      if (w.r >= RING_MAX) {
        w.on = false;
        w.mesh.visible = false;
      }
    }
    for (const d of this.decals) {
      if (!d.mesh.visible) continue;
      d.t += dt;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - d.t / 1.6);
      if (d.t > 1.6) d.mesh.visible = false;
    }
  }

  private pushWarn(x: number, z: number): void {
    if (this.warnN < this.warns.length) this.warns[this.warnN++].set(x, 0, z);
  }

  private decal(x: number, z: number, text: string): void {
    let best = this.decals[0];
    for (const d of this.decals) {
      if (!d.mesh.visible) {
        best = d;
        break;
      }
      if (d.t > best.t) best = d;
    }
    best.mesh.material = this.decalMats.get(text) ?? this.stampTexMat;
    (best.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    best.mesh.position.set(x, 0.09, z);
    best.mesh.visible = true;
    best.t = 0;
  }

  clear(): void {
    for (const c of this.keys) {
      c.on = false;
      c.mesh.visible = false;
    }
    for (const r of this.reports) {
      r.on = false;
      r.sprite.visible = false;
      r.warn.visible = false;
    }
    for (const d of this.drops) {
      d.on = false;
      d.obj.visible = false;
      d.warn.visible = false;
    }
    for (const w of this.rings) {
      w.on = false;
      w.mesh.visible = false;
    }
    for (const d of this.decals) d.mesh.visible = false;
    this.warnN = 0;
  }
}
