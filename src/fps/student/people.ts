import * as THREE from 'three';
import { HEROES, type HeroDef } from '../../data/heroes';
import { lambert } from '../blocks';
import { Person, peopleKit, type Look } from '../people';
import type { StaffKind } from './bosses';

// 학생 모드 사람 모형 (people.ts 블록 사람). 색은 본편 2D 값을 옮겼다.
// - 박반려 서류반려처장: createDeanRig('banryeo') — 회갈색 정장, 빨간 넥타이, 벗어진 이마·회색 옆머리, 돋보기 안경, 큰 반려 도장
// - 반사반사 결재부총장: createDeanRig('bansa') — 남색 정장, 보라 넥타이, 넘긴 짙은 회색 머리, 금 배지, 큰 결재판
// - 김부재중 처장: createSupervisorRig('bujae') — 회색 정장, 금색 넥타이, 짙은 머리, 왼손에 늘 휴대폰
// - 허허실실 부총장: createSupervisorRig('hoho') — 초록 정장, 주황 넥타이, 회색 옆머리, 금 배지, 웃는 입, 왼손에 간식 봉투
// - 창구 직원: createStaffRig(HEROES 외형) + 손에 든 물건(addWindowProp) — 셔츠·넥타이·사원증 (김학생식당은 앞치마)
// 총장은 교직원 모드 모형을 그대로 쓴다. people.ts의 Who는 모양 고르기에만 쓰이므로 처장·부총장·창구 직원은 'meeting'으로 둔다.

const SKIN = 0xf1c7a0;

export const STAFF_HERO: Record<StaffKind, string> = {
  haksa: 'parkhaksa',
  sikdang: 'kimsikdang',
  jinchwi: 'leejinchwi',
  gukje: 'kimgukje',
  hakjong: 'ohakjongji',
};
const STAFF_KINDS = Object.keys(STAFF_HERO) as StaffKind[];

export function staffHero(kind: StaffKind): HeroDef {
  return HEROES.find((h) => h.id === STAFF_HERO[kind]) ?? HEROES[0];
}

const BANRYEO: Look = {
  top: 0x4a4440,
  pants: 0x4a4440,
  tie: 0xb3262d,
  skin: SKIN,
  hair: 0xb3b3b3,
  hairStyle: 'bald',
  jacket: true,
  glasses: true,
  left: 'stamp',
  scale: 1.62,
};

const BANSA: Look = {
  top: 0x22304f,
  pants: 0x22304f,
  tie: 0x5b2a86,
  skin: SKIN,
  hair: 0x4b4b52,
  hairStyle: 'full',
  jacket: true,
  badge: true,
  left: 'none',
  scale: 1.7,
};

const BUJAE: Look = {
  top: 0x4a4f5c,
  pants: 0x4a4f5c,
  tie: 0xd9b44a,
  skin: SKIN,
  hair: 0x2a2420,
  hairStyle: 'full',
  jacket: true,
  left: 'none',
  scale: 1.62,
};

const HOHO: Look = {
  top: 0x3d5a40,
  pants: 0x3d5a40,
  tie: 0xc2410c,
  skin: SKIN,
  hair: 0xb0b0b0,
  hairStyle: 'bald',
  jacket: true,
  badge: true,
  smile: true,
  left: 'none',
  scale: 1.7,
};

function part(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
  const m = new THREE.Mesh(peopleKit().unit, lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
}

/** 창구 직원 왼손 물건: 손전등(박국제학사) · 국자(김학생식당) · 빨간 펜(이진취) · 여권 두 권(김국제) · 번호표 발행기(오학종지) */
function addProp(p: Person, kind: StaffKind): void {
  const a = p.armL;
  const y = -0.8;
  if (kind === 'haksa') {
    part(a, 0.11, 0.26, 0.11, 0, y - 0.04, 0.05, 0x2b2b30);
    part(a, 0.15, 0.08, 0.15, 0, y - 0.2, 0.05, 0xffe066);
  } else if (kind === 'sikdang') {
    // 국자: 은색 자루 + 오목한 머리 + 국물
    part(a, 0.05, 0.5, 0.05, 0, y - 0.12, 0.06, 0xc9ced4);
    part(a, 0.24, 0.1, 0.24, 0, y - 0.4, 0.06, 0xc9ced4);
    part(a, 0.18, 0.02, 0.18, 0, y - 0.34, 0.06, 0xd08a3a);
  } else if (kind === 'gukje') {
    // 여권 두 권 (남색·자주) + 금색 문장
    part(a, 0.05, 0.3, 0.22, 0, y - 0.1, 0.06, 0x1f3a6b);
    part(a, 0.05, 0.3, 0.22, 0.05, y - 0.06, 0.1, 0x7a1f2b);
    part(a, 0.02, 0.08, 0.08, 0.085, y - 0.03, 0.1, 0xe0bb62);
  } else if (kind === 'jinchwi') {
    part(a, 0.06, 0.34, 0.06, 0, y - 0.08, 0.06, 0xd0202f);
    part(a, 0.04, 0.08, 0.04, 0, y - 0.28, 0.06, 0x1d1d22);
  } else {
    part(a, 0.26, 0.24, 0.14, 0, y - 0.04, 0.06, 0xe5e7eb);
    part(a, 0.27, 0.06, 0.15, 0, y + 0.02, 0.06, 0x002c52);
    part(a, 0.14, 0.12, 0.02, 0, y - 0.22, 0.1, 0xffffff);
  }
}

export interface StudentPeople {
  banryeo: Person;
  bansa: Person;
  bujae: Person;
  hoho: Person;
  staff: Record<StaffKind, Person>;
}

/** 학생 모드 사람을 미리 만든다 (판마다 다시 쓴다) */
export function buildStudentPeople(): StudentPeople {
  const staff = {} as Record<StaffKind, Person>;
  for (const kind of STAFF_KINDS) {
    const h = staffHero(kind).look;
    const look: Look = {
      top: h.shirt,
      pants: h.pants ?? 0x2d3b63,
      tie: h.tie,
      skin: SKIN,
      hair: h.hair,
      hairStyle: h.longHair ? 'long' : 'full',
      jacket: false,
      glasses: h.glasses,
      apron: h.apron,
      noTie: h.apron,
      lanyard: !h.apron,
      left: 'none',
      scale: 1.5,
    };
    const p = new Person('meeting', `${staffHero(kind).name} · 창구`, '#9fd3ff', look);
    addProp(p, kind);
    staff[kind] = p;
  }
  const bujae = new Person('meeting', '김부재중 처장', '#c9d3e6', BUJAE);
  // 휴대폰 (늘 통화 중)
  part(bujae.armL, 0.08, 0.18, 0.04, 0, -0.84, 0.08, 0x1b1b1f);
  part(bujae.armL, 0.06, 0.12, 0.01, 0, -0.84, 0.105, 0x3b6db3);
  const hoho = new Person('meeting', '허허실실 부총장', '#c9d3e6', HOHO);
  // 간식 봉투
  part(hoho.armL, 0.3, 0.26, 0.16, 0, -0.92, 0.06, 0xf6f1e1);
  part(hoho.armL, 0.3, 0.05, 0.17, 0, -0.8, 0.06, 0xc2410c);
  return {
    banryeo: new Person('meeting', '박반려 · 서류반려처장', '#ff9f9f', BANRYEO),
    bansa: new Person('meeting', '반사반사 · 결재부총장', '#ff9f9f', BANSA),
    bujae,
    hoho,
    staff,
  };
}
