// 게임 전역 상수. 밸런스 값은 M1부터 JSON으로 분리한다.

export const GAME_W = 960;
export const GAME_H = 540;

/** 걸을 수 있는 바닥의 깊이(y) 범위. y가 클수록 화면 앞쪽이다. */
export const FLOOR_TOP = 318;
export const FLOOR_BOTTOM = 520;

/** 깊이(y) 차이가 이 값 이하일 때만 타격이 들어간다. */
export const DEPTH_RANGE = 22;

/** 점프·넉다운에 쓰는 z축 중력 (px/s²) */
export const GRAVITY = 1900;

export const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const params = new URLSearchParams(location.search);
/** ?debug 를 붙이면 판정 상자를 그린다. 게임 중 ` 키 또는 F2로도 켠다. */
export const DEBUG_DEFAULT = params.has('debug');
/** ?touch 를 붙이면 PC에서도 가상 패드를 띄운다. */
export const FORCE_TOUCH = params.has('touch');
/** ?timer 를 붙이면 requestAnimationFrame 대신 setTimeout으로 돈다 (창이 가려진 상태의 자동 시험용). */
export const FORCE_TIMER = params.has('timer');
