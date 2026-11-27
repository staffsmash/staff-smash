// 2D 난이도 (PRD 결정 60, 2026-11-27 사용자 "가"): 지금까지의 2D가 중급이고 처음 고르는 값도 중급이다.
// 1인칭 난이도(src/fps/settings.ts DIFFS)와 이름·키는 같지만 수치는 따로다.
// 기록판에는 diff 칸(easy·normal·hard)으로 보낸다 — 서버(apps-script/Code.gs)는 이미 이 칸을 받고 어려운 난이도를 위에 올린다.

export type Diff2dKey = 'easy' | 'normal' | 'hard';

export interface Diff2d {
  label: string;
  /** 플레이어가 받는 피해 배율 */
  damage: number;
  /** 웨이브 잡몹 수 배율 (반올림, 최소 1) */
  count: number;
  /** 보스·중간보스 체력(결재 진행) 배율 */
  bossHp: number;
  /** 적 이동·공격 빠르기 배율 */
  speed: number;
}

export const DIFF2D_KEYS: Diff2dKey[] = ['easy', 'normal', 'hard'];

export const DIFF2D: Record<Diff2dKey, Diff2d> = {
  easy: { label: '초보', damage: 0.6, count: 0.8, bossHp: 0.8, speed: 0.9 },
  normal: { label: '중급', damage: 1, count: 1, bossHp: 1, speed: 1 },
  hard: { label: '고급', damage: 1.3, count: 1.2, bossHp: 1.2, speed: 1.1 },
};

const KEY = 'staffsmash.2d.diff';

export function isDiff2d(v: unknown): v is Diff2dKey {
  return typeof v === 'string' && v in DIFF2D;
}

/** 마지막으로 고른 2D 난이도 (없으면 중급) */
export function loadDiff2d(): Diff2dKey {
  try {
    const v = localStorage.getItem(KEY);
    return isDiff2d(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveDiff2d(d: Diff2dKey): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* 이번 판에는 적용된다 */
  }
}
