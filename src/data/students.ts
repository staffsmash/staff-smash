// 학생 7명 (2026-11-21, 11차 사용자 확정): 이름·성별·외형·등장 인사가 이름에 묶여 있다.
// - 앞의 4명(STUDENT_HEROES)은 학생 모드 주인공이다 (2D·1인칭). 능력은 같고 외형과 대사만 다르다.
// - 1인칭 학생 모드는 교직원 모드처럼 6명 가운데 고른다 (2026-11-25 사용자 지정): 위 4명 + 오니혼·백몽골
//   (FPS_STUDENT_HEROES, 남녀 3:3). 2D 학생 모드는 지금처럼 4명이다 (SelectScene은 STUDENT_HEROES를 쓴다).
// - 7명 모두 교직원 모드에서는 민원 학생으로 나온다 (names.ts — 유형은 매 판 무작위, 외형은 이름을 따른다).
// - hello = 각자 나라말 인사 (한글 표기). 교직원 모드에서 민원 학생이 처음 등장할 때 말풍선.
// - line = 학생 모드 주인공 대사 (2D·1인칭 공통). 2026-11-25 사용자 지정: 각자 원어로 인사만 한다.
// id는 저장된 기록·선택과 맞추려고 예전 값을 그대로 둔다 (choiturkey = 정헝가리).

export type StudentHeroId = 'kimrussia' | 'leeellt' | 'parkbuleo' | 'choiturkey' | 'onihon' | 'baekmongol';

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
  /** 묶은 머리 (11차 그림 쪽 선택 항목 — 지금 일곱 명은 쓰지 않는다) */
  ponytail?: boolean;
  glasses?: boolean;
  /** 안경 모양 (heroes.ts StaffLook과 같다) */
  glassesStyle?: 'horn' | 'silver' | 'sun';
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
    line: 'Здравствуйте!',
    look: { jacket: 0x8b1e2d, hair: 0x2a2420, bag: 0x2b2f38, female: true, longHair: true, hoodie: true, pants: 0x34507a, shoes: 0xf4f4f4, shoeStripe: 0xc8202f },
  },
  {
    id: 'leeellt',
    name: '이엘LT',
    hello: '헬로우!',
    line: 'Good morning everyone!',
    look: { jacket: 0x1f4e79, hair: 0x1f1a17, bag: 0xc8a24a, glasses: true, tee: 0xf4f4f4, pants: 0xa48f6a, shoes: 0x2b2b30, shoeStripe: 0xf4f4f4 },
  },
  {
    id: 'parkbuleo',
    name: '박불어',
    hello: '봉주르!',
    line: 'Bonjour!',
    look: { jacket: 0x2f6b5a, hair: 0x5b3a24, bag: 0x7a4a2a, female: true, longHair: true, hoodie: true, pants: 0x2d3240, shoes: 0xf4f4f4, shoeStripe: 0x2f6b5a },
  },
  {
    id: 'choiturkey',
    name: '정헝가리',
    hello: '요 너포트!',
    line: 'Jó napot!',
    look: { jacket: 0xc2410c, hair: 0x1f1a17, bag: 0x334155, earphones: true, tee: 0x1f2328, pants: 0x3b5a8a, shoes: 0xf4f4f4, shoeStripe: 0xc2410c },
  },
];

/** 1인칭 학생 모드에서만 주인공으로 고를 수 있는 두 명 (2026-11-25 사용자 지정). 교직원 모드에서는 민원 학생으로도 나온다 */
export const FPS_EXTRA_HEROES: StudentHeroDef[] = [
  {
    id: 'onihon',
    name: '오니혼',
    hello: '곤니찌와!',
    line: 'こんにちは！',
    look: { jacket: 0xb23a48, hair: 0x1f1a17, bag: 0x374151, check: true, tee: 0xf4f4f4, pants: 0x3b4252, shoes: 0x2b2b30, shoeStripe: 0xf4f4f4 },
  },
  {
    id: 'baekmongol',
    name: '백몽골',
    hello: '센 베노!',
    line: 'Сайн байна уу!',
    look: { jacket: 0x14294f, hair: 0x2a2420, bag: 0x6b7280, female: true, longHair: true, varsity: true, pants: 0x2d3240, shoes: 0xf4f4f4, shoeStripe: 0x14294f },
  },
];

/** 1인칭 학생 모드 주인공 6명 (2D 4명 + 오니혼·백몽골, 남녀 3:3) — 선택 화면·조력자·갇힌 친구·Boo 3인칭 모형 */
export const FPS_STUDENT_HEROES: StudentHeroDef[] = [...STUDENT_HEROES, ...FPS_EXTRA_HEROES];

/** 민원 학생으로만 나오는 한 명 */
export const STUDENT_EXTRAS: StudentDef[] = [
  {
    name: '신세크',
    hello: '즈드라보!',
    look: { jacket: 0x6d5bd0, hair: 0x3b2a20, bag: 0xd97706, female: true, bob: true, tee: 0xf4f4f4, pants: 0x4b5563, shoes: 0xf4f4f4, shoeStripe: 0x6d5bd0 },
  },
];

/** 학생 7명 전부 (1인칭 주인공 6 + 민원 전용 1). 이름이 겹치면 안 된다 (names.ts가 판마다 유형에 하나씩 붙인다) */
export const ALL_STUDENTS: StudentDef[] = [...FPS_STUDENT_HEROES, ...STUDENT_EXTRAS];

/** id로 주인공 찾기. 1인칭 6명 가운데서 찾는다 (기록 화면·기록판에 1인칭 판의 새 id가 와도 이름이 나오게) */
export function studentHeroById(id: string): StudentHeroDef {
  return FPS_STUDENT_HEROES.find((h) => h.id === id) ?? STUDENT_HEROES[0];
}

/** 이름으로 학생 찾기 (민원 학생 외형·인사) */
export function studentByName(name: string): StudentDef | undefined {
  return ALL_STUDENTS.find((s) => s.name === name);
}
