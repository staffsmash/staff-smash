import Phaser from 'phaser';

// 한국외국어대학교 UI (심벌·로고타입). 새 UI(남색 단색 심벌 + 굵은 고딕 HUFS)를 public/hufs/에 게임용으로 옮겨 두었다.
// emblem은 남색 그대로, 흰색 파일(emblem-mono, wordmark-ko, hufs-type)은 setTint로 원하는 색(흰색·금색·남색)을 입힌다.
// 어두운 바탕에는 emblem 대신 line(흰색)에 흰색을 입혀 쓴다.

export const HUFS_KEYS = {
  /** 심벌 (남색 단색) — 밝은 바탕용 */
  emblem: 'hufs-emblem',
  /** 같은 심벌의 흰색 판 — 어두운 바탕(흰색), 배너(금색) */
  line: 'hufs-emblem-mono',
  /** 영문 약칭 로고타입 "HUFS" (굵은 고딕) */
  type: 'hufs-type',
  /** 국문 로고타입 "한국외국어대학교" */
  wordmark: 'hufs-wordmark',
} as const;

export type HufsKey = (typeof HUFS_KEYS)[keyof typeof HUFS_KEYS];

/** UI 색 */
export const HUFS_NAVY = 0x002c52;
export const HUFS_TEAL = 0x13707a;
export const HUFS_GOLD = 0xe0bb62;

export function loadHufsAssets(scene: Phaser.Scene): void {
  if (scene.textures.exists(HUFS_KEYS.emblem)) return;
  scene.load.image(HUFS_KEYS.emblem, 'hufs/emblem.png');
  scene.load.image(HUFS_KEYS.type, 'hufs/hufs-type.png');
  scene.load.image(HUFS_KEYS.line, 'hufs/emblem-mono.png');
  scene.load.svg(HUFS_KEYS.wordmark, 'hufs/wordmark-ko.svg', { width: 720, height: 95 });
}

export interface HufsImageOpts {
  /** 높이(px). w를 주면 너비 기준으로 맞춘다 */
  h?: number;
  w?: number;
  tint?: number;
  alpha?: number;
  depth?: number;
  /** 바닥에 그린 것처럼 세로로 눌러 줄 때 (0~1) */
  squash?: number;
  originX?: number;
}

/** 로고 이미지를 놓는다. 로드에 실패했으면 아무것도 그리지 않는다. */
export function hufsImage(
  scene: Phaser.Scene,
  key: HufsKey,
  x: number,
  y: number,
  opts: HufsImageOpts = {},
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key);
  const s = opts.w !== undefined ? opts.w / img.width : (opts.h ?? img.height) / img.height;
  img.setScale(s, s * (opts.squash ?? 1));
  img.setOrigin(opts.originX ?? 0.5, 0.5);
  if (opts.tint !== undefined) img.setTint(opts.tint);
  if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
  if (opts.depth !== undefined) img.setDepth(opts.depth);
  return img;
}
