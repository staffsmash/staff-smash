// 학생 7명 (2026-11-21, 11차 사용자 확정): 이름·성별·외형·등장 인사가 이름에 묶여 있다.
// - 앞의 4명(STUDENT_HEROES)은 학생 모드 주인공이다. 능력은 같고 외형과 대사만 다르다.
// - 7명 모두 교직원 모드에서는 민원 학생으로 나온다 (names.ts — 유형은 매 판 무작위, 외형은 이름을 따른다).
// - hello = 각자 나라말 인사 (한글 표기). 교직원 모드에서는 처음 등장할 때 말풍선, 학생 모드 주인공은 line 맨 앞에 들어 있다.
// id는 저장된 기록·선택과 맞추려고 예전 값을 그대로 둔다 (choiturkey = 정헝가리).

export type StudentHeroId = 'kimrussia' | 'leeellt' | 'parkbuleo' | 'choiturkey';

export interface StudentHeroLook {
  /** 후드티·재킷 색 */
  jacket: number;
  hair: number;
  pants?: number;
  bag: number;
  /** 여성 외형 */
  female?: boolean;
  longHair?: boolean;
  /** 단발 */
  bob?: boolean;
  glasses?: boolean;
  earphones?: boolean;
  /** true = 후드티(모자·끈·앞주머니), 아니면 앞이 열린 재킷 + 티셔츠 */
  hoodie?: boolean;
  /** 외대 야구잠바 (남색 몸통·흰 소매·가슴 "H") */
  varsity?: boolean;
  /** 체크 셔츠 (재킷 자리에 체크 무늬) */
  check?: boolean;
  /** 재킷 안 티셔츠 색 */
  tee?: number;
  /** 운동화 색과 옆줄 색 */
  shoes?: number;
  shoeStripe?: number;
}

export interface StudentDef {
  name: string;
  /** 나라말 인사 (한글 표기) */
  hello: string;
  look: StudentHeroLook;
}

export interface StudentHeroDef extends StudentDef {
  id: StudentHeroId;
  line: string;
}

export const STUDENT_HEROES: StudentHeroDef[] = [
  {
    id: 'kimrussia',
    name: '김러샤',
    hello: '즈드라스뜨부이쩨!',
    line: '즈드라스뜨부이쩨, 졸업은 해야지!',
    look: { jacket: 0x8b1e2d, hair: 0x2a2420, bag: 0x2b2f38, female: true, longHair: true, hoodie: true, pants: 0x34507a, shoes: 0xf4f4f4, shoeStripe: 0xc8202f },
  },
  {
    id: 'leeellt',
    name: '이엘LT',
    hello: '헬로우!',
    line: '헬로우! What? deadline? extension 해주쇼',
    look: { jacket: 0x1f4e79, hair: 0x1f1a17, bag: 0xc8a24a, glasses: true, tee: 0xf4f4f4, pants: 0xa48f6a, shoes: 0x2b2b30, shoeStripe: 0xf4f4f4 },
  },
  {
    id: 'parkbuleo',
    name: '박불어',
    hello: '봉주르!',
    line: "봉주르! C'est La Vie… 아니, 졸업은 해야지",
    look: { jacket: 0x2f6b5a, hair: 0x5b3a24, bag: 0x7a4a2a, female: true, longHair: true, hoodie: true, pants: 0x2d3240, shoes: 0xf4f4f4, shoeStripe: 0x2f6b5a },
  },
  {
    id: 'choiturkey',
    name: '정헝가리',
    hello: '요 너포트!',
    line: '요 너포트! 으아아~ 본관까지 뛰어간다!',
    look: { jacket: 0xc2410c, hair: 0x1f1a17, bag: 0x334155, earphones: true, tee: 0x1f2328, pants: 0x3b5a8a, shoes: 0xf4f4f4, shoeStripe: 0xc2410c },
  },
];

/** 민원 학생으로만 나오는 세 명 */
export const STUDENT_EXTRAS: StudentDef[] = [
  {
    name: '백몽골',
    hello: '센 베노!',
    look: { jacket: 0x14294f, hair: 0x2a2420, bag: 0x6b7280, female: true, longHair: true, varsity: true, pants: 0x2d3240, shoes: 0xf4f4f4, shoeStripe: 0x14294f },
  },
  {
    name: '오니혼',
    hello: '곤니찌와!',
    look: { jacket: 0xb23a48, hair: 0x1f1a17, bag: 0x374151, check: true, tee: 0xf4f4f4, pants: 0x3b4252, shoes: 0x2b2b30, shoeStripe: 0xf4f4f4 },
  },
  {
    name: '신세크',
    hello: '즈드라보!',
    look: { jacket: 0x6d5bd0, hair: 0x3b2a20, bag: 0xd97706, female: true, bob: true, tee: 0xf4f4f4, pants: 0x4b5563, shoes: 0xf4f4f4, shoeStripe: 0x6d5bd0 },
  },
];

/** 학생 7명 전부 (주인공 4 + 민원 전용 3) */
export const ALL_STUDENTS: StudentDef[] = [...STUDENT_HEROES, ...STUDENT_EXTRAS];

export function studentHeroById(id: string): StudentHeroDef {
  return STUDENT_HEROES.find((h) => h.id === id) ?? STUDENT_HEROES[0];
}

/** 이름으로 학생 찾기 (민원 학생 외형·인사) */
export function studentByName(name: string): StudentDef | undefined {
  return ALL_STUDENTS.find((s) => s.name === name);
}
