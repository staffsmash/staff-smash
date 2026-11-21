// 교직원 모드 주인공: 가상 행정직원 6명. 능력은 같고 외형과 대사만 다르다 (PRD 8절).
// 학생 모드에서는 같은 사람들이 창구 직원(중간보스)으로 나온다 — 그때 쓰는 대사 묶음이 desk다.
// 2026-11-21 (11차) 사용자가 여섯 명을 다시 정했다: 이름·성별·외형·대표 대사는 글자 그대로.
// id는 저장된 기록·선택과 맞추려고 예전 값을 그대로 둔다 (ohakjongji = 김학종지, leejinchwi = 나진취,
// choijanghak = 권학생, parkhaksa = 김전략, kimsikdang = 최도서관).

export type HeroId = 'kimgukje' | 'ohakjongji' | 'leejinchwi' | 'choijanghak' | 'parkhaksa' | 'kimsikdang';

export interface StaffLook {
  shirt: number;
  tie: number;
  hair: number;
  pants?: number;
  /** 여성 외형 (블라우스·재킷 차림, 넥타이 대신 리본·스카프 — 그리는 쪽에서 정한다) */
  female?: boolean;
  longHair?: boolean;
  /** 짧은 스포츠머리 */
  crew?: boolean;
  /** 안경: true = 평범한 안경 (예전 값) */
  glasses?: boolean;
  /** 안경 모양: horn = 뿔테(굵은 검은 테), silver = 은테(가는 밝은 테), sun = 선글라스 */
  glassesStyle?: 'horn' | 'silver' | 'sun';
  /** 머리에 두른 띠의 글자 (나진취 "취업률 100%") */
  headband?: string;
  /** 손에 든 물건 (김학종지의 규정집) */
  prop?: 'rulebook';
  apron?: boolean;
}

/** 학생 모드 창구 직원(중간보스)으로 나올 때의 추가 대사. 기존 대사 line(등장·기믹 때)과 무작위로 섞여 나온다 */
export interface DeskLines {
  /** 싸우는 중 (혼잣말) */
  fight: string[];
  /** 기믹을 쓸 때 — 기믹 때 하는 line 자리에 섞인다 */
  gimmick?: string[];
  /** (예전 박국제학사 소등용. 11차에 소등이 없어져 쓰지 않는다) */
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
    // 여 · 긴 금발. 학생 모드 창구 기믹: 여권·서류를 되돌려 던진다 (그대로)
    id: 'kimgukje',
    name: '김국제',
    line: 'Your passport please',
    look: { shirt: 0x9cc3e6, tie: 0x24365e, hair: 0xe8c66a, female: true, longHair: true },
    desk: {
      fight: ['여권 유효기간 확인하셨어요?', '어학 성적이 만료됐어요.', '파견 서류는 원본으로 주세요.', '출국 전 오리엔테이션은 필참입니다!'],
      gimmick: ['서류 돌려드릴게요~'],
    },
  },
  {
    // 남 · 뿔테안경 · 규정집을 들고 있다. 창구 기믹: 번호표 행렬 (그대로) + 가까우면 규정집 내려치기
    id: 'ohakjongji',
    name: '김학종지',
    line: '졸업 요건 못갖췄습니다',
    look: { shirt: 0xc9cff0, tie: 0x3730a3, hair: 0x1f1a17, glasses: true, glassesStyle: 'horn', prop: 'rulebook' },
    desk: {
      fight: ['다음 번호 손님~', '본인 확인되셨어요?', '그건 학과 사무실에 문의하세요.', '증명서는 무인발급기에서 떼세요.'],
    },
  },
  {
    // 남 · 은테안경 · 머리에 "취업률 100%" 띠. 창구 기믹: 빨간 펜 첨삭 선 (그대로)
    id: 'leejinchwi',
    name: '나진취',
    line: '자소서 다시 써 오세요',
    look: { shirt: 0xe7c6d8, tie: 0x7d1f4c, hair: 0x2a2420, glasses: true, glassesStyle: 'silver', headband: '취업률 100%' },
    desk: {
      fight: ['여기 맞춤법 틀렸어요.', '두괄식으로 쓰세요!', '글자 수 초과입니다.', '지원 동기가 약해요.'],
      gimmick: ['빨간 펜 들어갑니다~'],
    },
  },
  {
    // 남 · 짧은 스포츠머리 · 선글라스. 창구 기믹(새): 총학 집행부 둘을 불러 면담 — 길이 좁아진다
    id: 'choijanghak',
    name: '권학생',
    line: '총학들 일로와봐',
    look: { shirt: 0xf3d9a4, tie: 0x8a5a1c, hair: 0x1f1a17, crew: true, glasses: true, glassesStyle: 'sun' },
    desk: {
      // ★ 새로 지은 대사 (문구 검토 18절)
      fight: ['행사 신청서는 2주 전에 내야지.', '동아리방 청소는 했어?', '학생증 좀 보자.'],
      gimmick: ['면담 좀 하자~'],
    },
  },
  {
    // 여 · 긴 머리 · 뿔테안경의 선생님 모습. 창구 기믹(새): 빨간 순위 하락 화살표가 위에서 떨어진다
    id: 'parkhaksa',
    name: '김전략',
    line: '대학평가 순위가 떨어졌어요',
    look: { shirt: 0xb8d8b0, tie: 0x2f5d3a, hair: 0x2a2420, pants: 0x3a3a44, female: true, longHair: true, glasses: true, glassesStyle: 'horn' },
    desk: {
      // ★ 새로 지은 대사 (문구 검토 18절)
      fight: ['지표 관리가 안 되고 있어요.', '취업률 조사 응답하셨어요?', '만족도 설문은 필수입니다.'],
      gimmick: ['순위가 또 떨어져요~'],
    },
  },
  {
    // 여 · 긴 머리. 창구 기믹(새): 책수레를 밀어 보낸다
    id: 'kimsikdang',
    name: '최도서관',
    line: '반납기한 초과, 연체료 내세요',
    look: { shirt: 0xf4f4f4, tie: 0xb3262d, hair: 0x4a2c20, female: true, longHair: true },
    desk: {
      // ★ 새로 지은 대사 (문구 검토 18절)
      fight: ['열람실에서는 조용히 하세요.', '대출 권수 초과입니다.', '책에 줄 긋지 마세요.'],
      gimmick: ['책수레 지나갑니다~'],
    },
  },
];

export function heroById(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}
