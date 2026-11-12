// 교직원 모드 주인공: 가상 행정직원 6명. 능력은 같고 외형과 대사만 다르다 (PRD 8절).

export type HeroId = 'kimgukje' | 'ohakjongji' | 'leejinchwi' | 'choijanghak' | 'parkhaksa' | 'kimsikdang';

export interface StaffLook {
  shirt: number;
  tie: number;
  hair: number;
  pants?: number;
  longHair?: boolean;
  glasses?: boolean;
  apron?: boolean;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  line: string;
  look: StaffLook;
}

export const HEROES: HeroDef[] = [
  { id: 'kimgukje', name: '김국제', line: '노미네이션 마감 지났어요', look: { shirt: 0x9cc3e6, tie: 0x24365e, hair: 0x2a2420 } },
  {
    id: 'ohakjongji',
    name: '오학종지',
    line: '번호표 뽑고 기다리세요',
    look: { shirt: 0xc9cff0, tie: 0x3730a3, hair: 0x1f1a17, glasses: true },
  },
  {
    id: 'leejinchwi',
    name: '이진취',
    line: '자소서 다시 써 오세요',
    look: { shirt: 0xe7c6d8, tie: 0x7d1f4c, hair: 0x4a2c20, longHair: true },
  },
  {
    id: 'choijanghak',
    name: '최장학',
    line: '신청 기간이 아닙니다',
    look: { shirt: 0xf3d9a4, tie: 0x8a5a1c, hair: 0x3b2a20, longHair: true, glasses: true },
  },
  {
    id: 'parkhaksa',
    name: '박국제학사',
    line: '점호 시간입니다',
    look: { shirt: 0xb8d8b0, tie: 0x2f5d3a, hair: 0x2a2420, pants: 0x3a3a44 },
  },
  {
    id: 'kimsikdang',
    name: '김학생식당',
    line: '배식 마감입니다',
    look: { shirt: 0xf4f4f4, tie: 0xb3262d, hair: 0x1f1a17, apron: true },
  },
];

export function heroById(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
