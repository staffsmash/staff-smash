// 인물별 장점 (PRD 결정 60, 2026-11-27 사용자 "추천대로"). 2D·1인칭 공통.
// 교직원 6명·학생 6명이 장점 6종을 하나씩 나눠 가진다. 단점은 없다. 선택 카드에 label을 한 줄로 보여 준다.
// 쓰는 쪽은 perkMul(heroId, kind)로 배율(해당 없으면 1)을, hpBonus(heroId)로 더할 체력 칸(해당 없으면 0)을 받는다.

export type PerkKind = 'move' | 'special' | 'throw' | 'hp' | 'power' | 'buff';

export interface PerkDef {
  kind: PerkKind;
  /** 선택 카드 한 줄 */
  label: string;
  /** 배율 (hp는 더하는 칸 수) */
  value: number;
}

export const PERKS: Record<PerkKind, PerkDef> = {
  /** 이동 속도 (걷기·대시·1인칭 이동) */
  move: { kind: 'move', label: '이동 +10%', value: 1.1 },
  /** 필살기 게이지가 차는 양 */
  special: { kind: 'special', label: '필살기 충전 +15%', value: 1.15 },
  /** 던진 물건(사원증·학생증·무기 던지기·1인칭 F 아이템 투척)의 위력과 날아가는 거리 */
  throw: { kind: 'throw', label: '던지기 위력·거리 +20%', value: 1.2 },
  /** 최대 체력 한 칸 (2D 12 → 13, 1인칭 10 → 11) */
  hp: { kind: 'hp', label: '최대 체력 +1칸', value: 1 },
  /** 맨손·도장 처리 위력 (보스 결재 진행 포함) */
  power: { kind: 'power', label: '처리 위력 +10%', value: 1.1 },
  /** 아이템·버프 지속 시간 (셔틀버스·연차 쿠폰·인감 도장·돌발 방문 보상 등 시간이 있는 것) */
  buff: { kind: 'buff', label: '아이템 시간 +30%', value: 1.3 },
};

/** 주인공 id → 장점. 교직원 id는 data/heroes.ts, 학생 id는 data/students.ts (id는 옛 값 그대로) */
export const HERO_PERK: Record<string, PerkKind> = {
  // 교직원
  kimgukje: 'move', // 김국제 — 출장이 잦음
  ohakjongji: 'special', // 김학종지 — 규정 박사
  leejinchwi: 'throw', // 나진취 — 자소서를 던져 봐서
  choijanghak: 'hp', // 권학생 — 학생 상대 내공
  parkhaksa: 'power', // 김전략 — 평가 지표 압박
  kimsikdang: 'buff', // 최도서관 — 기한 관리
  // 학생
  parkbuleo: 'move', // 박불어
  leeellt: 'special', // 이엘LT
  baekmongol: 'throw', // 백몽골
  kimrussia: 'hp', // 김러샤
  choiturkey: 'power', // 정헝가리
  onihon: 'buff', // 오니혼
};

export function perkOf(heroId: string): PerkDef | null {
  const k = HERO_PERK[heroId];
  return k ? PERKS[k] : null;
}

/** 배율 장점: 이 인물의 장점이 kind면 배율, 아니면 1 */
export function perkMul(heroId: string, kind: Exclude<PerkKind, 'hp'>): number {
  return HERO_PERK[heroId] === kind ? PERKS[kind].value : 1;
}

/** 최대 체력에 더할 칸 수 */
export function hpBonus(heroId: string): number {
  return HERO_PERK[heroId] === 'hp' ? PERKS.hp.value : 0;
}

/** 선택 카드 한 줄 ("이동 +10%"). 장점이 없는 id면 빈 문자열 */
export function perkLabel(heroId: string): string {
  return perkOf(heroId)?.label ?? '';
}
