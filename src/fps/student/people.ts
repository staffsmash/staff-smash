import * as THREE from 'three';
import { HEROES, type HeroDef } from '../../data/heroes';
import { lambert } from '../blocks';
import { staffLook } from '../looks';
import { Person, peopleKit, type Look } from '../people';
import type { StaffKind } from './bosses';

// 학생 모드 사람 모형 (people.ts 블록 사람). 2026-11-21 11차: 처장·부총장 대신 학과장·교수·학장 (모두 가상 인물).
// - 전필수 · 스페인어과 학과장 (여): 2D createDeanRig('jeonpil') — 보라빛 정장, 흰 블라우스 깃, 짙은 머리, 큰 "재수강" 도장
// - 한학고 · 영어대학 학장 (남): createDeanRig('hanhakgo') — 남색 정장, 빨간 나비넥타이, 넘긴 회색 머리, 금 배지, 성적표 묶음
// - 김부재중 교수 (남): createDeanRig('bujae') — 회색 정장, 금색 넥타이, 짙은 머리, 왼손에 늘 휴대폰, 큰 결재판(반사)
// - 주출석 · 국가전략언어대학 학장 (여): 청록 정장, 긴 머리, 안경, 출석부
// - 창구 직원: createStaffRig(HEROES 외형) + 손에 든 물건(addWindowProp) — 셔츠·넥타이·사원증.
//   11차: 외형은 looks.ts staffLook (여성은 블라우스·리본·치마, 안경 모양·머리띠·규정집까지 2D와 같다)
// - 총학 집행부 둘 (권학생이 부른다): 과잠 차림 학생
// 여성 외형: 병합 때 ②의 블라우스·리본/스카프·단발(people.ts Look)을 입혔다 (전필수 = 단발·리본, 주출석 = 긴 머리·스카프).
// 총장은 교직원 모드 모형을 그대로 쓴다. people.ts의 Who는 모양 고르기에만 쓰이므로 학과장·교수·학장·창구 직원은 'meeting'으로 둔다.

const SKIN = 0xf1c7a0;

export const STAFF_HERO: Record<StaffKind, string> = {
  janghak: 'choijanghak',
  sikdang: 'kimsikdang',
  jinchwi: 'leejinchwi',
  gukje: 'kimgukje',
  hakjong: 'ohakjongji',
};
const STAFF_KINDS = Object.keys(STAFF_HERO) as StaffKind[];

export function staffHero(kind: StaffKind): HeroDef {
  return HEROES.find((h) => h.id === STAFF_HERO[kind]) ?? HEROES[0];
}

const JEONPIL: Look = {
  top: 0x3b3550,
  pants: 0x3b3550,
  tie: 0x8b1e2d,
  skin: SKIN,
  hair: 0x2a2420,
  brow: 0x2a2420,
  hairStyle: 'bob',
  female: true,
  blouse: true,
  jacket: true,
  noTie: true,
  left: 'stamp',
  scale: 1.58,
};

const HANHAKGO: Look = {
  top: 0x22304f,
  pants: 0x22304f,
  tie: 0xb3262d,
  skin: SKIN,
  hair: 0x8f8f96,
  hairStyle: 'swept',
  jacket: true,
  noTie: true,
  badge: true,
  left: 'none',
  scale: 1.68,
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

const JUCHULSEOK: Look = {
  top: 0x0f5c63,
  pants: 0x0f5c63,
  tie: 0xf5c542,
  skin: SKIN,
  hair: 0x1f1a17,
  brow: 0x1f1a17,
  hairStyle: 'long',
  female: true,
  blouse: true,
  neck: 'scarf',
  jacket: true,
  noTie: true,
  glasses: true,
  left: 'none',
  scale: 1.62,
};

function part(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
  const m = new THREE.Mesh(peopleKit().unit, lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
}

/** 창구 직원 왼손 물건: 호루라기(권학생) · 책 두 권(최도서관) · 빨간 펜(나진취) · 여권 두 권(김국제) · 번호표 발행기(김학종지) */
function addProp(p: Person, kind: StaffKind): void {
  const a = p.armL;
  const y = -0.8;
  if (kind === 'janghak') {
    part(a, 0.03, 0.3, 0.03, 0, y + 0.06, 0.06, 0x2f6fd1);
    part(a, 0.16, 0.1, 0.1, 0, y - 0.12, 0.06, 0xc9ced4);
  } else if (kind === 'sikdang') {
    // 책 두 권 (청록·자주)
    part(a, 0.08, 0.34, 0.26, 0, y - 0.1, 0.06, 0x13707a);
    part(a, 0.08, 0.34, 0.26, 0.08, y - 0.06, 0.1, 0x7a1f2b);
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
  jeonpil: Person;
  hanhakgo: Person;
  bujae: Person;
  juchulseok: Person;
  staff: Record<StaffKind, Person>;
  /** 권학생이 부르는 총학 집행부 둘 */
  aides: Person[];
}

/** 총학 집행부 학생 (과잠 차림, 완장) */
function aidePerson(jacket: number, hair: number, long: boolean): Person {
  const look: Look = {
    top: jacket,
    pants: 0x2d3240,
    tie: jacket,
    skin: SKIN,
    hair,
    brow: hair,
    hairStyle: long ? 'long' : 'full',
    jacket: false,
    noTie: true,
    shoes: 0xf2f2f2,
    left: 'none',
    scale: 1.42,
  };
  const p = new Person('meeting', '총학 집행부', '#9fd3ff', look);
  // 흰 소매·목깃, 노란 완장, 손에 든 서류철
  for (const arm of [p.armL, p.armR]) (arm.children[0] as THREE.Mesh).material = lambert(0xececec);
  part(p.body, 0.5, 0.08, 0.44, 0, 1.6, 0, 0xececec);
  part(p.armL, 0.22, 0.1, 0.26, 0, -0.22, 0, 0xffd34d);
  part(p.armL, 0.3, 0.38, 0.05, 0, -0.9, 0.12, 0x2f6fd1);
  // 결재판 대신 서류철이라 결재판은 숨긴다
  p.clip.visible = false;
  return p;
}

/** 학생 모드 사람을 미리 만든다 (판마다 다시 쓴다) */
export function buildStudentPeople(): StudentPeople {
  const staff = {} as Record<StaffKind, Person>;
  for (const kind of STAFF_KINDS) {
    const look = staffLook(staffHero(kind).look, 1.5);
    const p = new Person('meeting', `${staffHero(kind).name} · 창구`, '#9fd3ff', look);
    addProp(p, kind);
    staff[kind] = p;
  }
  const bujae = new Person('meeting', '김부재중 교수', '#c9d3e6', BUJAE);
  // 휴대폰 (늘 통화 중)
  part(bujae.armL, 0.08, 0.18, 0.04, 0, -0.84, 0.08, 0x1b1b1f);
  part(bujae.armL, 0.06, 0.12, 0.01, 0, -0.84, 0.105, 0x3b6db3);
  const jeonpil = new Person('meeting', '전필수 · 스페인어과 학과장', '#ff9f9f', JEONPIL);
  // 블라우스 깃 (넥타이 자리에 흰 깃 둘)
  part(jeonpil.body, 0.12, 0.08, 0.03, -0.07, 1.57, 0.222, 0xffffff);
  part(jeonpil.body, 0.12, 0.08, 0.03, 0.07, 1.57, 0.222, 0xffffff);
  const hanhakgo = new Person('meeting', '한학고 · 영어대학 학장', '#ff9f9f', HANHAKGO);
  // 빨간 나비넥타이
  part(hanhakgo.body, 0.1, 0.08, 0.03, -0.06, 1.57, 0.226, 0xb3262d);
  part(hanhakgo.body, 0.1, 0.08, 0.03, 0.06, 1.57, 0.226, 0xb3262d);
  part(hanhakgo.body, 0.05, 0.06, 0.035, 0, 1.57, 0.228, 0x7a1820);
  // 성적표 묶음
  part(hanhakgo.armL, 0.32, 0.4, 0.05, 0, -0.9, 0.12, 0xffffff);
  part(hanhakgo.armL, 0.32, 0.06, 0.055, 0, -0.74, 0.12, 0x002c52);
  const juchulseok = new Person('meeting', '주출석 · 국가전략언어대학 학장', '#ff9f9f', JUCHULSEOK);
  // 블라우스 깃, 출석부 (남색 표지)
  part(juchulseok.body, 0.12, 0.08, 0.03, -0.07, 1.57, 0.222, 0xffffff);
  part(juchulseok.body, 0.12, 0.08, 0.03, 0.07, 1.57, 0.222, 0xffffff);
  part(juchulseok.armL, 0.3, 0.4, 0.06, 0, -0.9, 0.12, 0x1f3a6b);
  part(juchulseok.armL, 0.22, 0.05, 0.065, 0, -0.8, 0.12, 0xffffff);
  return {
    jeonpil,
    hanhakgo,
    bujae,
    juchulseok,
    staff,
    aides: [aidePerson(0x7a1f2b, 0x1f1a17, false), aidePerson(0x1d4ed8, 0x2a2420, true)],
  };
}
