// 학생 모드 주인공 4명 (PRD 결정 45): 교직원 모드 민원 학생 이름 중 4개. 능력은 같고 외형과 대사만 다르다.
// 대사는 사용자가 2026-11-13 확정했다 (옵시디언 'Staff Smash 문구 검토 (M3·1인칭 2차)').

export type StudentHeroId = 'kimrussia' | 'leeellt' | 'parkbuleo' | 'choiturkey';

export interface StudentHeroLook {
  /** 후드티·재킷 색 */
  jacket: number;
  hair: number;
  pants?: number;
  bag: number;
  longHair?: boolean;
  glasses?: boolean;
  earphones?: boolean;
  /** true = 후드티(모자·끈·앞주머니), 아니면 앞이 열린 재킷 + 티셔츠 */
  hoodie?: boolean;
  /** 재킷 안 티셔츠 색 */
  tee?: number;
  /** 운동화 색과 옆줄 색 */
  shoes?: number;
  shoeStripe?: number;
}

export interface StudentHeroDef {
  id: StudentHeroId;
  name: string;
  line: string;
  look: StudentHeroLook;
}

export const STUDENT_HEROES: StudentHeroDef[] = [
  {
    id: 'kimrussia',
    name: '김러샤',
    line: '즈드라스뜨부이쩨, 졸업은 해야지!',
    look: {
      jacket: 0x8b1e2d,
      hair: 0x2a2420,
      bag: 0x2b2f38,
      longHair: true,
      hoodie: true,
      pants: 0x34507a,
      shoes: 0xf4f4f4,
      shoeStripe: 0xc8202f,
    },
  },
  {
    id: 'leeellt',
    name: '이엘LT',
    line: 'What? deadline? extension 해주쇼',
    look: {
      jacket: 0x1f4e79,
      hair: 0x1f1a17,
      bag: 0xc8a24a,
      glasses: true,
      tee: 0xf4f4f4,
      pants: 0xa48f6a,
      shoes: 0x2b2b30,
      shoeStripe: 0xf4f4f4,
    },
  },
  {
    id: 'parkbuleo',
    name: '박불어',
    line: "C'est La Vie… 아니, 졸업은 해야지",
    look: {
      jacket: 0x2f6b5a,
      hair: 0x5b3a24,
      bag: 0x7a4a2a,
      longHair: true,
      hoodie: true,
      pants: 0x2d3240,
      shoes: 0xf4f4f4,
      shoeStripe: 0x2f6b5a,
    },
  },
  {
    id: 'choiturkey',
    name: '최터키',
    line: '멜허바! 으아아~ 본관까지 뛰어간다!',
    look: {
      jacket: 0xc2410c,
      hair: 0x1f1a17,
      bag: 0x334155,
      earphones: true,
      tee: 0x1f2328,
      pants: 0x3b5a8a,
      shoes: 0xf4f4f4,
      shoeStripe: 0xc2410c,
    },
  },
];

export function studentHeroById(id: string): StudentHeroDef {
  return STUDENT_HEROES.find((h) => h.id === id) ?? STUDENT_HEROES[0];
}
