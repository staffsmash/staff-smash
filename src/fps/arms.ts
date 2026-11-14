import * as THREE from 'three';

// 1인칭 시험판의 무기 (2026-11-14). 본편 2D 무기 이름을 그대로 쓴다.
// 경비원에게 인사하거나(교직원) 도서 무인 대출기에서 빌리면(학생) 잠깐 손에 들고, 정해진 횟수를 다 던지면 다시 도장(서류)으로 돌아간다.
// - 스테이플러 / 텀블러: 빠르게 연달아 던진다
// - 안내문 롤 / 장우산: 한 줄로 늘어선 것을 모두 꿰뚫는다
// - 결재판 / 전공책: 크고 무거운 한 방 (진행·피해 2배, 맞는 범위가 넓다)
// - 사원증 / 학생증: 날아갔다가 돌아오며 한 번 더 맞힌다 (부메랑)
// 맞힘 판정은 main.ts(Game.updateStamps)가 하고, 여기는 수치·모형·손에 든 모양·HUD 글만 맡는다.

export type ArmId = 'stapler' | 'notice' | 'clipboard' | 'idcard';

export const ARM_IDS: ArmId[] = ['stapler', 'notice', 'clipboard', 'idcard'];

export interface ArmDef {
  id: ArmId;
  /** 교직원 모드 이름 */
  name: string;
  /** 학생 모드 이름 */
  studentName: string;
  /** 얻을 때 알림에 붙는 한마디 */
  perk: string;
  /** 던질 수 있는 횟수 */
  uses: number;
  /** 던지는 간격 (초) / 아메리카노를 마셨을 때 */
  cd: number;
  cdFast: number;
  /** 날아가는 빠르기 (m/s) */
  speed: number;
  /** 아래로 당기는 힘, 처음 위로 뜨는 속도 */
  grav: number;
  lift: number;
  /** 날아가는 시간 (초) */
  life: number;
  /** 결재 진행·피해 배율 */
  power: number;
  /** 잡몹·서류에 맞는 거리에 더한다 (m) */
  reach: number;
  /** 맞혀도 멈추지 않고 꿰뚫는다 */
  pierce: boolean;
  /** 갔다가 돌아온다 (가는 길·오는 길에 한 번씩 맞힌다) */
  boomerang: boolean;
}

export const ARMS: Record<ArmId, ArmDef> = {
  stapler: { id: 'stapler', name: '스테이플러', studentName: '텀블러', perk: '연사', uses: 30, cd: 0.1, cdFast: 0.075, speed: 27, grav: 4, lift: 0.6, life: 1.4, power: 1, reach: 0, pierce: false, boomerang: false },
  notice: { id: 'notice', name: '안내문 롤', studentName: '장우산', perk: '관통', uses: 12, cd: 0.34, cdFast: 0.22, speed: 23, grav: 1.2, lift: 0.3, life: 1.5, power: 1, reach: 0.25, pierce: true, boomerang: false },
  clipboard: { id: 'clipboard', name: '결재판', studentName: '전공책', perk: '묵직한 한 방', uses: 10, cd: 0.45, cdFast: 0.3, speed: 21, grav: 4, lift: 0.9, life: 1.6, power: 2, reach: 0.45, pierce: false, boomerang: false },
  idcard: { id: 'idcard', name: '사원증', studentName: '학생증', perk: '부메랑', uses: 15, cd: 0.34, cdFast: 0.22, speed: 22, grav: 0, lift: 0, life: 2.6, power: 1, reach: 0.15, pierce: false, boomerang: true },
};

/** 부메랑이 돌아서는 때 (던진 뒤 초) */
export const BOOMERANG_TURN = 0.55;

export function armName(id: ArmId, student: boolean): string {
  return student ? ARMS[id].studentName : ARMS[id].name;
}

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 손에 든 모양 자리 (화면 오른쪽 아래 팔 기준) */
const HOLD: Record<ArmId, { p: [number, number, number]; r: [number, number, number]; s: number }> = {
  stapler: { p: [0, 0.07, -0.2], r: [0.15, 0, 0], s: 1 },
  notice: { p: [0, 0.07, -0.24], r: [0.25, 0, 0], s: 1 },
  clipboard: { p: [0, 0.22, -0.16], r: [-0.35, -0.25, 0], s: 0.9 },
  idcard: { p: [0, 0.14, -0.17], r: [1.15, 0, 0.2], s: 1.2 },
};

export class Arms {
  /** 지금 든 무기 (null = 도장·서류) */
  id: ArmId | null = null;
  uses = 0;
  private student = false;
  /** 팔 모형(viewmodel) 안의 손 자리 */
  private readonly hold = new THREE.Group();
  private protos = new Map<string, THREE.Group>();

  constructor(viewmodel: THREE.Group) {
    this.hold.visible = false;
    viewmodel.add(this.hold);
  }

  get def(): ArmDef | null {
    return this.id ? ARMS[this.id] : null;
  }

  get name(): string {
    return this.id ? armName(this.id, this.student) : '';
  }

  /** 무기를 든다 (들고 있던 것은 버린다) */
  equip(id: ArmId, student: boolean): void {
    this.id = id;
    this.uses = ARMS[id].uses;
    this.student = student;
    this.hold.clear();
    const m = this.model(id, student);
    const h = HOLD[id];
    m.position.set(...h.p);
    m.rotation.set(...h.r);
    m.scale.setScalar(h.s);
    this.hold.add(m);
  }

  /** 한 번 던졌다. 다 쓰면 그 무기 이름을 돌려준다 */
  spend(): string | null {
    if (!this.id) return null;
    this.uses--;
    if (this.uses > 0) return null;
    const n = this.name;
    this.clear();
    return n;
  }

  clear(): void {
    this.id = null;
    this.uses = 0;
    this.hold.clear();
    this.hold.visible = false;
  }

  /** 손에 든 모양 보이기 (던진 직후에는 손이 비어 있다) */
  showHand(ready: boolean): void {
    this.hold.visible = ready && this.id !== null;
  }

  /** HUD 한 줄: "무기 스테이플러 · 30" */
  hud(): string {
    return this.id ? `무기 ${this.name} · ${this.uses}` : '';
  }

  /** 던질 모형 하나 (모양·재질은 같이 쓴다) */
  model(id: ArmId, student: boolean): THREE.Group {
    const key = `${id}:${student ? 1 : 0}`;
    let p = this.protos.get(key);
    if (!p) {
      p = build(id, student);
      this.protos.set(key, p);
    }
    const g = p.clone();
    if (id === 'notice') g.rotation.order = 'YXZ';
    return g;
  }

  /** 날아가는 모양: 무기마다 다르게 돈다 */
  spin(obj: THREE.Object3D, vel: THREE.Vector3, def: ArmDef, dt: number): void {
    switch (def.id) {
      case 'stapler':
        obj.rotation.x += dt * 16;
        break;
      case 'notice':
        // 창처럼 날아가는 쪽을 보며 굴러간다
        obj.rotation.set(Math.atan2(vel.y, Math.hypot(vel.x, vel.z)), Math.atan2(-vel.x, -vel.z), obj.rotation.z + dt * 14);
        break;
      case 'clipboard':
        obj.rotation.y += dt * 10;
        break;
      case 'idcard':
        obj.rotation.y += dt * 24;
        break;
    }
  }

  /** 미리 그리기용: 무기 모형 여덟 개 */
  warmItems(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const id of ARM_IDS) for (const s of [false, true]) out.push(this.model(id, s));
    return out;
  }
}

/** 무기 모형 (앞 = -z). 교직원·학생 이름이 다르면 모양도 다르다 */
function build(id: ArmId, student: boolean): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'stapler':
      if (student) {
        // 텀블러: 은색 몸통 + 파란 띠 + 검은 뚜껑
        add(g, new THREE.CylinderGeometry(0.085, 0.08, 0.3, 12), lam(0xc9ced4), 0, 0, 0);
        add(g, new THREE.CylinderGeometry(0.088, 0.086, 0.07, 12), lam(0x2f6fd1), 0, 0.02, 0);
        add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), lam(0x2b2b30), 0, 0.18, 0);
      } else {
        // 스테이플러: 검은 받침 + 회색 윗판 (살짝 벌어짐)
        add(g, new THREE.BoxGeometry(0.12, 0.05, 0.36), lam(0x2d2d33), 0, 0, 0);
        const top = add(g, new THREE.BoxGeometry(0.11, 0.05, 0.32), lam(0x8a93a0), 0, 0.065, -0.01);
        top.rotation.x = 0.1;
        add(g, new THREE.BoxGeometry(0.1, 0.09, 0.05), lam(0x2d2d33), 0, 0.04, 0.16);
      }
      break;
    case 'notice':
      if (student) {
        // 장우산 (접은 것): 남색 몸통, 은색 꼭지, 묶음 띠, 갈색 손잡이
        add(g, new THREE.CylinderGeometry(0.055, 0.035, 0.62, 10).rotateX(Math.PI / 2), lam(0x1f3a6b), 0, 0, 0);
        add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6).rotateX(Math.PI / 2), lam(0x9aa3ad), 0, 0, -0.36);
        add(g, new THREE.BoxGeometry(0.12, 0.03, 0.05), lam(0x15213f), 0, 0.03, -0.04);
        add(g, new THREE.BoxGeometry(0.04, 0.04, 0.14), lam(0x6b4a2a), 0, 0, 0.37);
        add(g, new THREE.BoxGeometry(0.04, 0.12, 0.04), lam(0x6b4a2a), 0, -0.05, 0.44);
      } else {
        // 안내문 롤: 흰 두루마리 + 파란 띠 + 빨간 꼬리표
        add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.56, 12).rotateX(Math.PI / 2), lam(0xffffff), 0, 0, 0);
        add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.57, 8).rotateX(Math.PI / 2), lam(0xc9a06a), 0, 0, 0);
        add(g, new THREE.CylinderGeometry(0.073, 0.073, 0.06, 12).rotateX(Math.PI / 2), lam(0x2f6fd1), 0, 0, 0.08);
        add(g, new THREE.BoxGeometry(0.02, 0.07, 0.09), lam(0xd0202f), 0.075, 0, -0.12);
      }
      break;
    case 'clipboard':
      if (student) {
        // 두꺼운 전공책: 자주색 표지, 진한 등, 크림색 책장
        const page = lam(0xf4f0e0);
        const cover = lam(0x7a1f2b);
        add(g, new THREE.BoxGeometry(0.44, 0.13, 0.32), [page, lam(0x5a1520), cover, cover, page, page], 0, 0, 0);
        add(g, new THREE.BoxGeometry(0.2, 0.005, 0.04), lam(0xd9b44a), 0.02, 0.068, -0.06);
      } else {
        // 결재판: 갈색 판 + 흰 종이 + 집게
        add(g, new THREE.BoxGeometry(0.38, 0.5, 0.03), lam(0x9a6a3a), 0, 0, 0);
        add(g, new THREE.BoxGeometry(0.3, 0.38, 0.006), lam(0xffffff), 0, -0.03, 0.018);
        for (let i = 0; i < 3; i++) add(g, new THREE.BoxGeometry(0.22, 0.015, 0.004), lam(0x9aa3ad), 0, 0.06 - i * 0.07, 0.023);
        add(g, new THREE.BoxGeometry(0.14, 0.05, 0.05), lam(0x8a8f96), 0, 0.24, 0.01);
      }
      break;
    case 'idcard': {
      // 사원증 / 학생증: 눕힌 카드 (위쪽 띠, 사진, 글줄)
      add(g, new THREE.BoxGeometry(0.22, 0.012, 0.3), lam(0xffffff), 0, 0, 0);
      add(g, new THREE.BoxGeometry(0.222, 0.016, 0.07), lam(student ? 0x002c52 : 0x2f6fd1), 0, 0, -0.112);
      add(g, new THREE.BoxGeometry(0.08, 0.016, 0.1), lam(0xf1c7a0), -0.05, 0, 0.02);
      for (const z of [0.0, 0.05]) add(g, new THREE.BoxGeometry(0.07, 0.016, 0.018), lam(0x9aa3ad), 0.05, 0, z);
      break;
    }
  }
  return g;
}
