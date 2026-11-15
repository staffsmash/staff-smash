// 교직원 모드 주인공: 가상 행정직원 6명. 능력은 같고 외형과 대사만 다르다 (PRD 8절).
// 학생 모드에서는 같은 사람들이 창구 직원(중간보스)으로 나온다 — 그때 쓰는 대사 묶음이 desk다.

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

/** 학생 모드 창구 직원(중간보스)으로 나올 때의 ★ 추가 대사 (문구 검토 11-1절, 2026-11-15 사용자 "추가").
 *  기존 대사 line(등장·기믹 때)과 무작위로 섞여 나온다 */
export interface DeskLines {
  /** 싸우는 중 (혼잣말) */
  fight: string[];
  /** 기믹을 쓸 때 — 소등·국물 쏟기·첨삭 선 긋기·여권·서류 던지기·동전 뿌리기. 기믹 때 하는 line 자리에 섞인다 */
  gimmick?: string[];
  /** 박국제학사: 소등이 끝나 불이 켜질 때 */
  lightsOn?: string[];
}

export interface HeroDef {
  id: HeroId;
  name: string;
  /** 대표 대사: 교직원 모드 선택 화면·출발 띠, 학생 모드 창구 직원의 등장·기믹 대사 */
  line: string;
  look: StaffLook;
  /** 학생 모드 창구 직원으로 나올 때의 추가 대사 */
  desk?: DeskLines;
}

export const HEROES: HeroDef[] = [
  {
    id: 'kimgukje',
    name: '김국제',
    line: '노미네이션 마감 지났어요',
    look: { shirt: 0x9cc3e6, tie: 0x24365e, hair: 0x2a2420 },
    desk: {
      fight: ['여권 유효기간 확인하셨어요?', '어학 성적이 만료됐어요.', '파견 서류는 원본으로 주세요.', '출국 전 오리엔테이션은 필참입니다!'],
      gimmick: ['서류 돌려드릴게요~'],
    },
  },
  {
    id: 'ohakjongji',
    name: '오학종지',
    line: '번호표 뽑고 기다리세요',
    look: { shirt: 0xc9cff0, tie: 0x3730a3, hair: 0x1f1a17, glasses: true },
    desk: {
      fight: ['다음 번호 손님~', '본인 확인되셨어요?', '그건 학과 사무실에 문의하세요.', '증명서는 무인발급기에서 떼세요.'],
    },
  },
  {
    id: 'leejinchwi',
    name: '이진취',
    line: '자소서 다시 써 오세요',
    look: { shirt: 0xe7c6d8, tie: 0x7d1f4c, hair: 0x4a2c20, longHair: true },
    desk: {
      fight: ['여기 맞춤법 틀렸어요.', '두괄식으로 쓰세요!', '글자 수 초과입니다.', '지원 동기가 약해요.'],
      gimmick: ['빨간 펜 들어갑니다~'],
    },
  },
  {
    id: 'choijanghak',
    name: '최장학',
    line: '신청 기간이 아닙니다',
    look: { shirt: 0xf3d9a4, tie: 0x8a5a1c, hair: 0x3b2a20, longHair: true, glasses: true },
    desk: {
      fight: ['성적 기준 미달입니다.', '소득분위 서류 내셨어요?', '중복 수혜는 안 됩니다.'],
      gimmick: ['떨어진 거 주우셔도 돼요~'],
    },
  },
  {
    id: 'parkhaksa',
    name: '박국제학사',
    line: '점호 시간입니다',
    look: { shirt: 0xb8d8b0, tie: 0x2f5d3a, hair: 0x2a2420, pants: 0x3a3a44 },
    desk: {
      fight: ['호실 번호 대세요!', '외박 신청은 어제까지였어요.', '벌점 1점입니다.'],
      gimmick: ['소등합니다~ 셋, 둘, 하나!'],
      lightsOn: ['어? 누가 불 켰어요?'],
    },
  },
  {
    id: 'kimsikdang',
    name: '김학생식당',
    line: '배식 마감입니다',
    look: { shirt: 0xf4f4f4, tie: 0xb3262d, hair: 0x1f1a17, apron: true },
    desk: {
      fight: ['식권 먼저 사 오세요.', '줄 서세요, 줄!', '잔반은 남기지 마세요!'],
      gimmick: ['어머, 국물 조심하세요~'],
    },
  },
];

export function heroById(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
