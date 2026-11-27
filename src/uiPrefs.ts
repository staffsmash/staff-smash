// 2D·1인칭이 함께 쓰는 작은 설정 (PRD 결정 60). 같은 사이트라 이 기기의 localStorage를 같이 쓴다.
// - 휴대폰 단추 크기: 작게·보통·크게 (0.85 / 1 / 1.2배). 터치 화면에서만 설정에 보인다.
// - 첫 판 안내(직접 해 보는 5단계 연습)를 이미 봤는지: 2D와 1인칭을 따로 기억한다. 설정의 "안내 다시 보기"가 둘 다 지운다.

export type BtnSize = 'small' | 'normal' | 'large';

export const BTN_SIZES: BtnSize[] = ['small', 'normal', 'large'];

export const BTN_SIZE: Record<BtnSize, { label: string; scale: number }> = {
  small: { label: '작게', scale: 0.85 },
  normal: { label: '보통', scale: 1 },
  large: { label: '크게', scale: 1.2 },
};

const BTN_KEY = 'staffsmash.ui.btnSize';
const TUT_KEY = { '2d': 'staffsmash.tutorial.2d', fps: 'staffsmash.tutorial.fps' } as const;

export type GameKind = keyof typeof TUT_KEY;

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* 사생활 보호 모드 등: 이번 화면에만 적용된다 */
  }
}

export function loadBtnSize(): BtnSize {
  const v = get(BTN_KEY);
  return v === 'small' || v === 'large' ? v : 'normal';
}

/** 단추 배율 (0.85 / 1 / 1.2) */
export function btnScale(): number {
  return BTN_SIZE[loadBtnSize()].scale;
}

const listeners = new Set<(scale: number) => void>();

export function saveBtnSize(s: BtnSize): void {
  set(BTN_KEY, s);
  const k = BTN_SIZE[s].scale;
  listeners.forEach((f) => f(k));
}

/** 단추 크기가 바뀌면 부른다 (일시정지 중에 바꿔도 바로 적용). 돌려받은 함수로 해제 */
export function onBtnSize(f: (scale: number) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 첫 판 안내를 이미 봤는지 (끝까지 했거나 건너뛰었으면 true) */
export function tutorialSeen(game: GameKind): boolean {
  return get(TUT_KEY[game]) === '1';
}

export function markTutorialSeen(game: GameKind): void {
  set(TUT_KEY[game], '1');
}

/** 설정 "안내 다시 보기": 2D·1인칭 모두 다음 판에 다시 나온다 */
export function resetTutorials(): void {
  set(TUT_KEY['2d'], null);
  set(TUT_KEY.fps, null);
}
