import type { StaffLook } from '../data/heroes';
import type { StudentHeroLook } from '../data/students';
import type { Look } from './people';

// 주인공·학생·경비 선생님 외형을 1인칭 블록 사람(people.ts Look)으로 옮긴다 (2026-11-21, 11차).
// 조력자(helpers.ts)·민원에 묻힌 사람(trapped.ts)·학생 모드 창구 직원(student/people.ts)·교직원 모드 민원 학생(mids.ts)이
// 모두 여기를 거쳐 2D와 같은 외형(성별·머리·안경·머리띠·규정집·야구잠바·체크 셔츠)을 입는다.

export const SKIN = 0xf1c7a0;

/** 교직원 주인공 외형 (heroes.ts). 여성: 블라우스·리본(넥타이 색)·치마, 남성: 셔츠·넥타이. 모두 사원증 줄 */
export function staffLook(h: StaffLook, scale = 1.45): Look {
  const female = !!h.female;
  return {
    top: h.shirt,
    pants: h.pants ?? 0x2d3b63,
    tie: h.tie,
    skin: SKIN,
    hair: h.hair,
    brow: h.hair,
    hairStyle: h.crew ? 'crew' : h.bob ? 'bob' : h.ponytail ? 'ponytail' : h.longHair ? 'long' : 'full',
    jacket: false,
    female,
    blouse: female && !h.apron,
    skirt: female && h.skirt !== false,
    glasses: h.glasses,
    glassesStyle: h.glassesStyle,
    headband: h.headband,
    rulebook: h.prop === 'rulebook',
    lanyard: !h.apron,
    apron: h.apron,
    noTie: h.apron,
    left: 'none',
    scale,
  };
}

/** 학생 외형 (students.ts 7명). 후드티·열린 재킷(티셔츠)·외대 야구잠바·체크 셔츠, 백팩, 운동화 */
export function studentLook(l: StudentHeroLook, scale = 1.35): Look {
  return {
    top: l.jacket,
    pants: l.pants ?? 0x2d3240,
    tie: l.jacket,
    noTie: true,
    skin: SKIN,
    hair: l.hair,
    brow: l.hair,
    hairStyle: l.bob ? 'bob' : l.ponytail ? 'ponytail' : l.longHair ? 'long' : 'full',
    jacket: false,
    female: l.female,
    glasses: l.glasses,
    glassesStyle: l.glassesStyle,
    hoodie: l.hoodie && !l.varsity,
    varsity: l.varsity,
    check: l.check,
    tee: l.hoodie || l.varsity ? undefined : (l.tee ?? 0xf4f4f4),
    bag: l.bag,
    earphones: l.earphones,
    shoes: l.shoes,
    left: 'none',
    scale,
  };
}

/** 경비 선생님 (이름 없는 가상 인물): 남색 제복·근무모·금색 배지. 여성은 단발·리본 (구역마다 남녀가 번갈아 선다, props.ts) */
export function guardLook(female: boolean): Look {
  return {
    top: 0x1d2b4a,
    pants: 0x1d2b4a,
    tie: 0x0f1626,
    skin: SKIN,
    hair: female ? 0x2a2420 : 0x1b1712,
    brow: female ? 0x2a2420 : 0x1b1712,
    hairStyle: female ? 'bob' : 'full',
    jacket: true,
    female,
    neck: female ? 'ribbon' : undefined,
    badge: true,
    cap: 0x1d2b4a,
    left: 'none',
    scale: 1.45,
  };
}
