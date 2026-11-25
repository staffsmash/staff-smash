import type { HeroId } from './heroes';

// 교직원별 돌발 방문 이벤트 (2026-11-25 사용자 결정, PRD 결정 59). 코드 안 이름은 visit(돌발 방문).
// - 교직원 모드만. 고른 교직원마다 전용 이벤트 하나. 한 판에 한 번 반드시 나온다 (2D: 1~3스테이지 가운데 무작위 한 스테이지의 잡몹 구간).
// - 상대는 이름 없는 가상 인물이고 사람이라 다치지 않는다: 도장을 맞힐 때마다 머리 위 결재판이 한 칸 찬다. 10칸이면 성공.
// - 제한 20초. 성공하면 떠나면서 보상 상자를 떨어뜨리고, 실패하면 그냥 떠난다 (불이익 없음, 보상 없음).
// 이름·대사·수치는 사용자와 문답으로 확정한 것이다 — 글자 그대로 쓴다.

export type VisitReward = 'glove' | 'clicker' | 'graph' | 'cheer' | 'plaque' | 'hush';

export interface VisitLines {
  /** 등장 */
  enter: string;
  /** 공격할 때 (예고와 함께) */
  attack: string;
  /** 성공 (결재판 10칸) */
  win: string;
  /** 실패 (20초 지남) */
  lose: string;
}

export interface VisitDef {
  hero: HeroId;
  /** 띠에 쓰는 상대 이름 (돌발 방문! ○○) */
  name: string;
  /** 상대가 누구인지 */
  who: string;
  /** 고유 공격 */
  attack: string;
  /** 머리 위 결재판 제목 */
  board: string;
  reward: VisitReward;
  lines: VisitLines;
}

export const VISITS: Record<HeroId, VisitDef> = {
  kimgukje: {
    hero: 'kimgukje',
    name: '대사님',
    who: '외국 대사',
    attack: '로켓 펀치',
    board: '특강 일정 확정',
    reward: 'glove',
    lines: { enter: '대사 방문 특강!', attack: '로켓 펀치!', win: '특강 일정 확정! 감사합니다', lose: '다음 학기에 다시 오겠습니다' },
  },
  ohakjongji: {
    hero: 'ohakjongji',
    name: '매크로 학생',
    who: '수강신청 매크로 학생',
    attack: '마우스 커서 8발 부채꼴 연사',
    board: '정원 외 증원 처리',
    reward: 'clicker',
    lines: { enter: '올클 가즈아!', attack: '광클!', win: '증원 감사합니다!', lose: '정정 기간에 또 올게요' },
  },
  leejinchwi: {
    hero: 'leejinchwi',
    name: '장기 미취업 학생',
    who: '장기 미취업 학생',
    attack: '자기소개서 더미 장풍',
    board: '캠퍼스 리크루팅 참가 확정',
    reward: 'graph',
    lines: {
      enter: '선생님 취업 좀 시켜주세요!!',
      attack: '자소서 장풍!',
      win: '캠퍼스 리크루팅 꼭 갈게요!',
      lose: '자소서 고쳐서 또 올게요…',
    },
  },
  choijanghak: {
    hero: 'choijanghak',
    name: '동아리 연합회장',
    who: '동아리 연합회장',
    attack: '이삿짐 상자·통기타 케이스 굴리기',
    board: '동아리방 재배정 승인',
    reward: 'cheer',
    lines: { enter: '동아리방 다시 배정해 주세요!', attack: '짐 나갑니다~!', win: '새 동아리방 감사합니다!', lose: '다음 학기엔 꼭이요!' },
  },
  parkhaksa: {
    hero: 'parkhaksa',
    name: '실사 위원',
    who: '대학평가 실사 위원',
    attack: '바닥 세 곳 ✘ 표시 → 0.8초 뒤 터짐',
    board: '실사 통과',
    reward: 'plaque',
    lines: { enter: '현장 실사 나왔습니다!', attack: '지적 사항!', win: '지표 우수! 다음 평가 때 뵙죠', lose: '보완 자료 제출 바랍니다' },
  },
  kimsikdang: {
    hero: 'kimsikdang',
    name: '연체 대학원생',
    who: '400일 장기 연체 대학원생',
    attack: '책 더미 3권 포물선 투척',
    board: '연체료 납부 완료',
    reward: 'hush',
    lines: { enter: '반납이요! 연체료는 깎아 주세요!', attack: '책 받으세요~!', win: '연체료 납부했습니다…', lose: '논문 끝나면 낼게요!' },
  },
};

export function visitFor(id: string): VisitDef | null {
  return (VISITS as Record<string, VisitDef>)[id] ?? null;
}

// ---------- 공통 수치 (사용자 확정) ----------

/** 제한 시간 (초) */
export const VISIT_SEC = 20;
/** 결재판 칸 수 = 성공에 필요한 도장 수 */
export const VISIT_STAMPS = 10;
/** 모든 공격의 예고 시간 (초) */
export const VISIT_WARN = 0.8;
/** 한 번 맞으면 받는 피해 (2D: knockdown) */
export const VISIT_DMG = 2;
/** 매크로 학생: 커서 수, 한 발 피해, 한 번 연사로 받는 피해 상한 */
export const MACRO_SHOTS = 8;
export const MACRO_CAP = 2;

// ---------- 보상 (교직원마다 전용) ----------

/** 로켓 펀치 장갑: 던질 수 있는 횟수, 사람(보스·방문 상대)에게 도장 몇 발만큼 */
export const GLOVE_SHOTS = 3;
export const GLOVE_STAMPS = 4;
/** 매크로 클리커: 시간(초)과 도장 연사 속도 배율 */
export const CLICKER_SEC = 6;
export const CLICKER_MUL = 3;
/** 취업률 상승 그래프: 사람에게 갈 때·올 때 각각 도장 몇 발만큼 */
export const GRAPH_STAMPS = 4;
/** 응원단 호출권: 시간(초), 동아리원 수 */
export const CHEER_SEC = 10;
export const CHEER_N = 2;
/** 실사 통과 현판: 안전지대 시간(초) */
export const PLAQUE_SEC = 12;
/** 쉿! 정숙 표지판: 시간(초), 잡몹 이동·발사 속도 배율 */
export const HUSH_SEC = 10;
export const HUSH_MUL = 0.5;

/** 보상 이름 (상자 위 이름표·띠) */
export const REWARD_NAME: Record<VisitReward, string> = {
  glove: '로켓 펀치 장갑',
  clicker: '매크로 클리커',
  graph: '취업률 상승 그래프',
  cheer: '응원단 호출권',
  plaque: '실사 통과 현판',
  hush: '쉿! 정숙 표지판',
};

/** 2D에서 상자를 집었을 때 띠 아래 줄 (효과 설명) */
export const REWARD_DESC_2D: Record<VisitReward, string> = {
  glove: `${GLOVE_SHOTS}발 · L로 던지면 지나는 잡몹을 모두 처리합니다`,
  clicker: `${CLICKER_SEC}초 동안 도장 연사 속도 ${CLICKER_MUL}배`,
  graph: '1번 · L로 던지면 날아갔다 돌아오며 잡몹을 처리합니다',
  cheer: `${CHEER_SEC}초 동안 동아리원 ${CHEER_N}명이 곁에서 잡몹을 처리합니다`,
  plaque: `${PLAQUE_SEC}초 동안 현판 둘레는 피해 없는 안전지대`,
  hush: `${HUSH_SEC}초 동안 잡몹 이동·발사 속도 절반`,
};
