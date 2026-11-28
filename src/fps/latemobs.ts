import * as THREE from 'three';
import { Enemy, type Ctx } from './enemies';
import { canvasTex, FONT, NAVY } from './textures';

// 1인칭 뒤쪽 구역의 새 잡몹 둘 (PRD 결정 61 · 3절, 2026-11-28). 모두 사물이다. 교직원·학생 모양이 따로 있고 움직임은 같다.
// A. 갈라지는 몹 (SplitMob, kind 'ref') ★
//    교직원 "#REF! 오류 셀" — 엑셀 오류 칸(초록 테두리 흰 칸에 빨간 "#REF!"), 학생 "최종_진짜최종.hwp" — 한글 파일 아이콘.
//    천천히 떠서 다가와 부딪히면 피해 1칸(메일과 같은 급). 큰 것은 두 대(SPLIT_HP).
//    처리되면 작은 것 2개로 갈라진다 (Game.onProcessed → splitMob, 학생은 "최종_진짜최종(1).hwp").
//    작은 것은 한 대에 처리되고 더는 안 갈라진다 (구역 체력 오름도 받지 않는다).
//    처리 글: 교직원 "참조 오류 수정!" / 작은 것 "수식 수정 완료!", 학생 "과제 제출 완료!" / 작은 것 "사본 삭제!".
//    교직원 인문과학관 앞(areaOf 2)부터, 학생 인문과학관 앞(ROUTE[2])부터 민원(행정) 차례에 섞여 나온다.
// B. 돌진하는 몹 (Charger, kind 'parcel') ★
//    교직원 "반송 택배 상자" — 갈색 상자에 빨간 "반송" 도장 스티커, 학생 "연체 도서 더미" — 책 더미에 빨간 "연체" 띠.
//    바닥을 느리게 뒤뚱뒤뚱 걷다가 플레이어가 약 7m 안이면 0.6초 부르르 떨고(붉게 깜빡이는 예고)
//    그때 플레이어 쪽으로 평소 걸음의 3배로 0.7초 돌진한다. 부딪히면 피해 1칸 (점프로 높이 뛰면 밑으로 지나간다).
//    체력은 메일의 3배 (3). 처리 글: 교직원 "반송 접수 완료!", 학생 "반납 완료!".
//    교직원 대운동장(areaOf 4)부터, 학생 본관 앞(ROUTE[4])부터.
// 처음 만날 때 요령 한 줄은 main.ts HINTS(교직원)·student/mode.ts spawn(학생). 필살기 충전·처리 수·연속은 다른 잡몹과 같다.

export type MobLook = 'staff' | 'student';

/** 큰 갈라지는 몹의 체력 (작은 것은 1) */
const SPLIT_HP = 2;
/** 갈라지는 몹이 떠서 다가오는 빠르기 (m/s): 큰 것은 메일(3.2~4)보다 천천히, 작은 것은 조금 빠르게 */
const SPLIT_SPEED = 1.7;
const SPLIT_SMALL_SPEED = 2.7;
/** 작은 것의 크기 (큰 것 대비) */
const SMALL_SCALE = 0.58;
/** 돌진하는 몹: 걷는 빠르기 (m/s), 예고를 시작하는 거리 (m), 예고·돌진·쉬는 시간 (초), 돌진 빠르기 배율 */
const CHARGE_WALK = 2.8;
const CHARGE_RANGE = 7;
const CHARGE_WARN = 0.6;
const CHARGE_DASH = 0.7;
const CHARGE_REST = 0.8;
const CHARGE_MUL = 3;
/** 돌진이 끝나고 다시 돌진할 수 있을 때까지 (초) */
const CHARGE_COOL = 1.1;

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();

// ---------- 그림 ----------

/** 엑셀 오류 칸: 흰 칸, 굵은 초록 테두리(선택 칸), 왼쪽 위 초록 삼각형(오류 표시), 빨간 "#REF!", 옆 칸 회색 격자 */
function refTex(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 128);
    // 옆 칸 격자 (테두리 바깥쪽에 살짝)
    g.strokeStyle = '#c8ccd2';
    g.lineWidth = 2;
    for (const x of [64, 128, 192]) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 8);
      g.moveTo(x, 120);
      g.lineTo(x, 128);
      g.stroke();
    }
    g.strokeStyle = '#107c41';
    g.lineWidth = 12;
    g.strokeRect(6, 6, 244, 116);
    // 채우기 손잡이 (오른쪽 아래 작은 네모)
    g.fillStyle = '#107c41';
    g.fillRect(236, 108, 18, 18);
    g.fillStyle = '#ffffff';
    g.fillRect(232, 104, 6, 24);
    g.fillRect(232, 104, 24, 6);
    g.fillStyle = '#107c41';
    g.fillRect(238, 110, 14, 14);
    // 오류 표시 삼각형
    g.beginPath();
    g.moveTo(12, 12);
    g.lineTo(40, 12);
    g.lineTo(12, 40);
    g.closePath();
    g.fill();
    g.fillStyle = '#d0202f';
    g.font = `bold 66px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('#REF!', 132, 68);
  });
}

/** 한글 파일 아이콘: 접힌 귀퉁이가 있는 흰 문서, 가운데 파란 네모에 흰 "한", 아래 파일 이름 띠 */
function hwpTex(name: string): THREE.CanvasTexture {
  return canvasTex(256, 320, (g) => {
    g.lineJoin = 'round';
    // 문서 (오른쪽 위 귀퉁이를 접었다)
    g.beginPath();
    g.moveTo(14, 10);
    g.lineTo(188, 10);
    g.lineTo(242, 64);
    g.lineTo(242, 250);
    g.lineTo(14, 250);
    g.closePath();
    g.fillStyle = '#f4f8ff';
    g.fill();
    g.strokeStyle = '#2a63c4';
    g.lineWidth = 8;
    g.stroke();
    g.beginPath();
    g.moveTo(188, 10);
    g.lineTo(188, 64);
    g.lineTo(242, 64);
    g.closePath();
    g.fillStyle = '#b9cdee';
    g.fill();
    g.stroke();
    // 파란 네모 + "한"
    g.fillStyle = '#2a7de1';
    g.fillRect(58, 78, 140, 128);
    g.fillStyle = '#ffffff';
    g.font = `bold 104px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('한', 128, 146);
    g.fillStyle = '#2a63c4';
    g.font = `bold 28px ${FONT}`;
    g.fillText('HWP', 128, 228);
    // 파일 이름 띠 (글자가 길면 줄인다)
    g.fillStyle = NAVY;
    g.fillRect(0, 262, 256, 54);
    g.fillStyle = '#ffffff';
    let size = 34;
    g.font = `bold ${size}px ${FONT}`;
    while (size > 16 && g.measureText(name).width > 244) {
      size -= 1;
      g.font = `bold ${size}px ${FONT}`;
    }
    g.fillText(name, 128, 290);
  });
}

/** 반송 택배 상자 옆면: 갈색 골판지, 가운데 테이프, 흰 운송장, 빨간 둥근 "반송" 도장 스티커 */
function parcelSideTex(): THREE.CanvasTexture {
  return canvasTex(256, 200, (g) => {
    g.fillStyle = '#c08a55';
    g.fillRect(0, 0, 256, 200);
    g.fillStyle = '#d9b07a';
    g.fillRect(104, 0, 48, 30);
    g.strokeStyle = '#9c6c3c';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 194);
    // 운송장
    g.fillStyle = '#ffffff';
    g.fillRect(18, 46, 92, 62);
    g.fillStyle = '#5b6068';
    for (let i = 0; i < 4; i++) g.fillRect(26, 56 + i * 11, 64 - i * 8, 4);
    for (let i = 0; i < 14; i++) g.fillRect(26 + i * 5, 98, i % 3 === 0 ? 3 : 1.5, 7);
    // "반송" 도장 스티커 (조금 기울게)
    g.save();
    g.translate(176, 118);
    g.rotate(-0.22);
    g.fillStyle = '#fff4f0';
    g.beginPath();
    g.arc(0, 0, 54, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d0202f';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 38, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold 40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('반송', 0, 2);
    g.restore();
  });
}

function parcelTopTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#b98250';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d9b07a';
    g.fillRect(44, 0, 40, 128);
    g.fillStyle = '#8f6236';
    g.fillRect(0, 62, 128, 4);
  });
}

/** 연체 띠: 빨간 바탕에 흰 "연체" (띠를 두른 네 면에 같이) */
function overdueBandTex(): THREE.CanvasTexture {
  return canvasTex(256, 64, (g) => {
    g.fillStyle = '#d0202f';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffd5d5';
    g.fillRect(0, 4, 256, 3);
    g.fillRect(0, 57, 256, 3);
    g.fillStyle = '#ffffff';
    g.font = `bold 42px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('연체', 128, 33);
  });
}

function pagesTex(): THREE.CanvasTexture {
  return canvasTex(64, 32, (g) => {
    g.fillStyle = '#f4f0e0';
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = '#d9d1b8';
    for (let y = 2; y < 32; y += 4) g.fillRect(0, y, 64, 1);
  });
}

interface Looks {
  ref: THREE.CanvasTexture;
  hwp: THREE.CanvasTexture;
  hwpSmall: THREE.CanvasTexture;
  parcelSide: THREE.CanvasTexture;
  parcelTop: THREE.CanvasTexture;
  band: THREE.CanvasTexture;
  pages: THREE.CanvasTexture;
  cellGeo: THREE.BoxGeometry;
  fileGeo: THREE.BoxGeometry;
  boxGeo: THREE.BoxGeometry;
  bookGeo: THREE.BoxGeometry;
  bandGeo: THREE.BoxGeometry;
}

let looks: Looks | null = null;

function L(): Looks {
  looks ??= {
    ref: refTex(),
    hwp: hwpTex('최종_진짜최종.hwp'),
    hwpSmall: hwpTex('최종_진짜최종(1).hwp'),
    parcelSide: parcelSideTex(),
    parcelTop: parcelTopTex(),
    band: overdueBandTex(),
    pages: pagesTex(),
    cellGeo: new THREE.BoxGeometry(1.5, 0.75, 0.08),
    fileGeo: new THREE.BoxGeometry(0.96, 1.2, 0.06),
    boxGeo: new THREE.BoxGeometry(1.0, 0.78, 0.84),
    bookGeo: new THREE.BoxGeometry(0.86, 0.18, 0.62),
    bandGeo: new THREE.BoxGeometry(0.9, 0.17, 0.66),
  };
  return looks;
}

/** 타이틀 뒤에서 미리 올려 둘 그림 */
export function lateMobTextures(): THREE.Texture[] {
  const l = L();
  return [l.ref, l.hwp, l.hwpSmall, l.parcelSide, l.parcelTop, l.band, l.pages];
}

/** 미리 그리기용 모형 넷 (교직원·학생 A·B) */
export function lateMobWarm(): THREE.Object3D[] {
  return [splitModel('staff', false), splitModel('student', false), splitModel('student', true), chargeModel('staff').obj, chargeModel('student').obj];
}

/** 갈라지는 몹 모형: 앞뒤 두 면에 그림 (BoxGeometry 뒷면은 뒤에서 봐도 글자가 바로 보인다) */
function splitModel(look: MobLook, small: boolean): THREE.Mesh {
  const l = L();
  const face = new THREE.MeshBasicMaterial({ map: look === 'staff' ? l.ref : small ? l.hwpSmall : l.hwp });
  const side = new THREE.MeshLambertMaterial({ color: look === 'staff' ? 0x107c41 : 0x2a63c4 });
  const m = new THREE.Mesh(look === 'staff' ? l.cellGeo : l.fileGeo, [side, side, side, side, face, face]);
  m.castShadow = true;
  return m;
}

/** 돌진하는 몹 모형. mats: 예고 때 붉게 깜빡일 재질 (모형마다 따로) */
function chargeModel(look: MobLook): { obj: THREE.Group; mats: THREE.MeshLambertMaterial[] } {
  const l = L();
  const obj = new THREE.Group();
  const mats: THREE.MeshLambertMaterial[] = [];
  const lam = (o: THREE.MeshLambertMaterialParameters) => {
    const m = new THREE.MeshLambertMaterial(o);
    mats.push(m);
    return m;
  };
  if (look === 'staff') {
    const s = lam({ map: l.parcelSide });
    const t = lam({ map: l.parcelTop });
    const b = lam({ color: 0x8f6236 });
    const m = new THREE.Mesh(l.boxGeo, [s, s, t, b, s, s]);
    m.position.y = 0.39;
    m.castShadow = true;
    obj.add(m);
    return { obj, mats };
  }
  // 연체 도서 더미: 색이 다른 책 넷을 엇갈려 쌓고 가운데에 빨간 "연체" 띠
  const pg = lam({ map: l.pages });
  const covers = [0x8b2f2f, 0x2f5a8b, 0x3f7a3a, 0x6b4a8b].map((c) => lam({ color: c }));
  const offs: [number, number, number][] = [
    [0, 0, 0],
    [0.05, 0.12, 0.02],
    [-0.05, -0.1, -0.03],
    [0.03, 0.18, 0.02],
  ];
  offs.forEach(([x, ry, z], i) => {
    const cv = covers[i];
    const m = new THREE.Mesh(l.bookGeo, [pg, cv, cv, cv, cv, pg]);
    m.position.set(x, 0.09 + i * 0.18, z);
    m.rotation.y = ry;
    m.castShadow = true;
    obj.add(m);
  });
  const band = lam({ map: l.band });
  const bandTop = lam({ color: 0xd0202f });
  const bm = new THREE.Mesh(l.bandGeo, [band, band, bandTop, bandTop, band, band]);
  bm.position.y = 0.36;
  obj.add(bm);
  return { obj, mats };
}

// ---------- A. 갈라지는 몹 ----------

export class SplitMob extends Enemy {
  readonly kind = 'ref' as const;
  /** 갈라져 나온 작은 것 (한 대에 처리, 더는 안 갈라진다) */
  readonly small: boolean;
  readonly look: MobLook;
  private speed: number;
  private phase = Math.random() * 6.28;
  private state: 'fly' | 'retreat' = 'fly';
  private vel = new THREE.Vector3();
  /** 갈라질 때 양옆으로 튕겨 나가는 속도 (점점 준다) */
  private push = new THREE.Vector3();
  private hover: number;
  private spinDir = Math.random() < 0.5 ? -1 : 1;

  constructor(c: Ctx, look: MobLook, at: THREE.Vector3, small = false, push?: THREE.Vector3) {
    super();
    this.small = small;
    this.look = look;
    this.obj.add(splitModel(look, small));
    this.baseScale = small ? SMALL_SCALE : 1;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.copy(at);
    this.hp = this.maxHp = small ? 1 : SPLIT_HP;
    this.speed = small ? SPLIT_SMALL_SPEED + Math.random() * 0.4 : SPLIT_SPEED + Math.random() * 0.3;
    this.radius = (look === 'staff' ? 0.78 : 0.68) * this.baseScale + (small ? 0.12 : 0);
    this.hover = small ? 1.3 + Math.random() * 0.9 : 1.6 + Math.random() * 0.6;
    if (push) this.push.copy(push);
    if (small) this.pop = 0.15;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      if (this.small) {
        // 작은 것: 빙글 돌며 떨어진다
        this.vel.y -= 14 * dt;
        o.position.addScaledVector(this.vel, dt);
        o.rotation.z += dt * 9 * this.spinDir;
        if (o.position.y < -1) this.gone = true;
      } else {
        // 큰 것: 그 자리에서 쪼그라든다 (작은 것 둘이 튀어나온다 — Game.splitMob)
        const s = Math.max(0.01, this.baseScale * (1 - this.t * 6));
        o.scale.setScalar(s);
        if (s <= 0.02) this.gone = true;
      }
      return;
    }
    // 갈라질 때 튕겨 나간 힘
    if (this.push.lengthSq() > 0.0001) {
      o.position.addScaledVector(this.push, dt);
      this.push.multiplyScalar(Math.max(0, 1 - dt * 3.5));
    }
    const to = _a.subVectors(c.eye, o.position);
    const dist = to.length();
    to.divideScalar(Math.max(0.001, dist));
    if (this.state === 'retreat') {
      o.position.addScaledVector(to, -this.speed * 1.3 * dt);
      o.position.y += dt * 1.2;
      if (this.t > 1.0) this.state = 'fly';
    } else {
      // 천천히, 살짝 흔들리며 다가온다
      const sway = Math.sin(this.t * 1.8 + this.phase) * 0.8;
      o.position.addScaledVector(to, this.speed * dt);
      o.position.x += -to.z * sway * dt;
      o.position.z += to.x * sway * dt;
      o.position.y += (this.hover + Math.sin(this.t * 2.2 + this.phase) * 0.15 - o.position.y) * Math.min(1, dt * 1.5);
      if (dist < this.radius + 0.55) {
        c.hurt(1, o.position, 'ref');
        this.state = 'retreat';
        this.t = 0;
      }
    }
    o.position.y = Math.max(0.8, Math.min(9, o.position.y));
    o.lookAt(c.eye);
    // 엑셀 칸은 비스듬히 기울어 떠다닌다
    o.rotateZ(Math.sin(this.t * 1.3 + this.phase) * 0.12);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 0.9);
  }

  die(dir: THREE.Vector3): void {
    this.t = 0;
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2).addScaledVector(dir, 3);
  }

  dispose(): void {
    for (const m of this.obj.children as THREE.Mesh[]) {
      const mats = m.material as THREE.Material[];
      // 그림·모양은 함께 쓰고 재질만 모형마다 (앞뒤 면은 같은 재질)
      new Set(mats).forEach((x) => x.dispose());
    }
  }
}

// ---------- B. 돌진하는 몹 ----------

type ChargeState = 'walk' | 'warn' | 'dash' | 'rest';

export class Charger extends Enemy {
  readonly kind = 'parcel' as const;
  readonly look: MobLook;
  private body: THREE.Group;
  private mats: THREE.MeshLambertMaterial[];
  private state: ChargeState = 'walk';
  private stateT = 0;
  private cool = 0.6 + Math.random() * 0.6;
  private dir = new THREE.Vector3();
  private hitDone = false;
  private vel = new THREE.Vector3();
  private tip = 0;
  private walkP = Math.random() * 6;

  constructor(c: Ctx, look: MobLook, at: THREE.Vector3) {
    super();
    this.look = look;
    const m = chargeModel(look);
    this.body = m.obj;
    this.mats = m.mats;
    this.obj.add(this.body);
    this.baseScale = 1.15;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.set(at.x, 0, at.z);
    // 체력: 메일(1)의 3배
    this.hp = this.maxHp = 3;
    this.radius = 0.75;
    this.center.set(at.x, 0.42 * this.baseScale, at.z);
    c.scene.add(this.obj);
  }

  /** 돌진 직전·돌진 중 (조준 보조가 먼저 노린다면 쓸 수 있게) */
  get winding(): boolean {
    return this.state === 'warn' || this.state === 'dash';
  }

  private set(s: ChargeState): void {
    this.state = s;
    this.stateT = 0;
  }

  private tint(hex: number): void {
    for (const m of this.mats) m.emissive.setHex(hex);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      // 뒤로 넘어지며 작아진다 (팩스기와 같다)
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
    this.body.position.x = 0;
    switch (this.state) {
      case 'walk': {
        // 뒤뚱뒤뚱 다가온다
        this.walkP += dt * 8;
        o.rotation.y = Math.atan2(dx, dz);
        if (d > 1.2) {
          o.position.x += (dx / d) * CHARGE_WALK * dt;
          o.position.z += (dz / d) * CHARGE_WALK * dt;
        }
        o.position.y = Math.abs(Math.sin(this.walkP)) * 0.1;
        this.body.rotation.z = Math.sin(this.walkP) * 0.1;
        this.cool -= dt;
        if (this.cool <= 0 && d < CHARGE_RANGE) {
          this.set('warn');
          o.position.y = 0;
          c.sound('tick', o.position, 0.9);
        }
        break;
      }
      case 'warn': {
        // 부르르 떨며 붉게 깜빡인다 (예고)
        o.rotation.y = Math.atan2(dx, dz);
        this.body.rotation.z = Math.sin(this.t * 70) * 0.09;
        this.body.position.x = Math.sin(this.t * 95) * 0.04;
        this.tint(Math.sin(this.t * 40) > 0 ? 0xc02020 : 0x501010);
        if (this.stateT >= CHARGE_WARN) {
          this.dir.set(dx / d, 0, dz / d);
          this.hitDone = false;
          this.tint(0x3a0000);
          this.set('dash');
          c.sound('dash', o.position, 1);
        }
        break;
      }
      case 'dash': {
        const v = CHARGE_WALK * CHARGE_MUL * dt;
        o.position.addScaledVector(this.dir, v);
        this.body.rotation.z = 0;
        this.body.rotation.x = -0.18;
        // 움직인 뒤의 거리로 본다 (7m에서 시작한 돌진은 서 있는 플레이어 1m쯤 앞에서 멈춘다)
        const near = Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z);
        if (!this.hitDone && near < this.radius + 0.6 && c.feet < 0.85) {
          this.hitDone = true;
          c.hurt(1, o.position, 'parcel');
        }
        if (this.stateT >= CHARGE_DASH) {
          this.body.rotation.x = 0;
          this.tint(0x000000);
          this.set('rest');
        }
        break;
      }
      case 'rest':
        this.body.rotation.z = 0;
        if (this.stateT >= CHARGE_REST) {
          this.cool = CHARGE_COOL;
          this.set('walk');
        }
        break;
    }
    const a = c.area;
    o.position.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.position.x));
    o.position.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.position.z));
    this.center.set(o.position.x, o.position.y + 0.42 * this.baseScale, o.position.z);
  }

  knock(dir: THREE.Vector3): void {
    // 단단해서 조금만 밀린다
    if (this.state !== 'dash') this.obj.position.addScaledVector(dir, 0.35);
  }

  die(): void {
    this.t = 0;
    this.tint(0x000000);
    this.vel.set(0, 0, 0);
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
  }
}

/** 처리되면 떠오르는 글 (교직원은 Game.onProcessed, 학생은 StudentMode.processed가 띄운다) */
export function lateDoneText(e: SplitMob | Charger): string {
  if (e instanceof SplitMob) {
    if (e.look === 'staff') return e.small ? '수식 수정 완료!' : '참조 오류 수정!';
    return e.small ? '사본 삭제!' : '과제 제출 완료!';
  }
  return e.look === 'staff' ? '반송 접수 완료!' : '반납 완료!';
}

/** 갈라지는 몹이 처리되면 작은 것 둘 (from: 플레이어 자리 — 플레이어가 보기에 양옆으로 튕겨 나간다) */
export function splitInto(c: Ctx, e: SplitMob, from: THREE.Vector3): SplitMob[] {
  _t.set(-(e.center.z - from.z), 0, e.center.x - from.x);
  if (_t.lengthSq() < 1e-6) _t.set(1, 0, 0);
  _t.normalize();
  const out: SplitMob[] = [];
  for (const s of [-1, 1]) {
    const at = new THREE.Vector3().copy(e.center).addScaledVector(_t, s * 0.55);
    const push = new THREE.Vector3().copy(_t).multiplyScalar(s * 4.2).setY(1.2);
    out.push(new SplitMob(c, e.look, at, true, push));
  }
  c.fx.confetti(e.center, 14, 4, e.look === 'staff' ? 0x107c41 : 0x2a7de1, 1.4, 0.7);
  c.sound('pop', e.center, 0.8);
  return out;
}
