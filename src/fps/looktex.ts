import * as THREE from 'three';
import { canvasTex, FONT } from './textures';

// 11차(2026-11-21) 사람 외형 그림: 여성 얼굴(속눈썹·입술·볼터치), 안경 모양(뿔테·은테·선글라스),
// 글자가 있는 머리띠("취업률 100%"), 체크 셔츠 무늬. people.ts(1인칭 블록 사람)와 선택 화면 초상이 쓴다.

export type GlassesStyle = 'horn' | 'silver' | 'sun';

const INK = '#1d1d22';
const LIP = '#c0485a';
const BLUSH = 'rgba(243,140,140,0.45)';

/**
 * faceTex(textures.ts)로 그린 얼굴(128×128) 위에 덧그린다: 여성 얼굴, 안경 모양.
 * 눈 (32,54)·(84,54) 12×14, 눈썹 y 38, 입 (50,96). 평범한 안경은 faceTex가 그린다 (glasses: true)
 */
export function decorateFace(tex: THREE.CanvasTexture, o: { female?: boolean; glassesStyle?: GlassesStyle }): void {
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  if (o.female) {
    // 속눈썹: 눈 위 선 + 바깥 끝에서 옆으로 삐친 짧은 선 (위로 올리면 화난 눈썹처럼 보인다)
    g.fillStyle = INK;
    g.fillRect(31, 50, 14, 4);
    g.fillRect(83, 50, 14, 4);
    g.fillRect(25, 53, 7, 4);
    g.fillRect(96, 53, 7, 4);
    g.fillStyle = BLUSH;
    g.fillRect(16, 76, 20, 10);
    g.fillRect(92, 76, 20, 10);
    g.fillStyle = LIP;
    g.fillRect(48, 93, 32, 9);
  }
  drawGlasses(g, o.glassesStyle, [24, 48, 32, 26], [72, 48, 32, 26]);
  tex.needsUpdate = true;
}

/** 안경 모양 그리기. l·r = 왼·오른 렌즈 [x, y, w, h] */
function drawGlasses(g: CanvasRenderingContext2D, style: GlassesStyle | undefined, l: number[], r: number[]): void {
  if (!style) return;
  const bridge = (w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(l[0] + l[2], l[1] + l[3] * 0.38);
    g.lineTo(r[0], r[1] + r[3] * 0.38);
    g.stroke();
  };
  if (style === 'sun') {
    g.fillStyle = '#15171c';
    g.fillRect(l[0], l[1], l[2], l[3]);
    g.fillRect(r[0], r[1], r[2], r[3]);
    g.strokeStyle = '#15171c';
    bridge(Math.max(2, l[2] * 0.16));
    g.fillStyle = '#6b7280';
    g.fillRect(l[0] + l[2] * 0.18, l[1] + l[3] * 0.18, l[2] * 0.25, l[3] * 0.16);
    g.fillRect(r[0] + r[2] * 0.18, r[1] + r[3] * 0.18, r[2] * 0.25, r[3] * 0.16);
    return;
  }
  const horn = style === 'horn';
  g.fillStyle = horn ? 'rgba(207,232,245,0.35)' : 'rgba(225,240,248,0.35)';
  g.fillRect(l[0], l[1], l[2], l[3]);
  g.fillRect(r[0], r[1], r[2], r[3]);
  g.strokeStyle = horn ? INK : '#9aa5b1';
  g.lineWidth = horn ? Math.max(3, l[2] * 0.25) : Math.max(1.5, l[2] * 0.09);
  g.strokeRect(l[0], l[1], l[2], l[3]);
  g.strokeRect(r[0], r[1], r[2], r[3]);
  bridge(horn ? Math.max(2, l[2] * 0.18) : Math.max(1.5, l[2] * 0.09));
}

/** 머리띠 앞면 (가로로 긴 띠, 가운데 글자). 글자가 띠 너비를 넘으면 줄인다 */
export function headbandTex(text: string, bg: string, fg = '#d0202f'): THREE.CanvasTexture {
  return canvasTex(512, 104, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 104);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, 0, 512, 6);
    g.fillRect(0, 98, 512, 6);
    if (!text) return;
    let size = 76;
    g.font = `bold ${size}px ${FONT}`;
    const w = g.measureText(text).width;
    if (w > 480) size = Math.floor((size * 480) / w);
    g.font = `bold ${size}px ${FONT}`;
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 56);
  });
}

/** 체크 셔츠 무늬 (바탕색 + 진한 띠 가로세로 + 밝은 가는 줄). 되풀이해 붙인다 */
export function plaidTex(color: number): THREE.CanvasTexture {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (const p of [0, 32]) {
      g.fillRect(p, 0, 11, 64);
      g.fillRect(0, p, 64, 11);
    }
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (const p of [21, 53]) {
      g.fillRect(p, 0, 3, 64);
      g.fillRect(0, p, 64, 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- 선택 화면 초상 (96×112 캔버스, 앞모습) ----------

export interface PortraitHead {
  hair: string;
  /** short = 짧은 머리, long = 긴 머리, bob = 단발, ponytail = 묶은 머리, crew = 짧은 스포츠머리 */
  style: 'short' | 'long' | 'bob' | 'ponytail' | 'crew';
  female?: boolean;
  /** 평범한 안경 (예전 값) */
  glasses?: boolean;
  glassesStyle?: GlassesStyle;
  headband?: string;
  earphones?: boolean;
}

/** 초상 머리 (얼굴 상자 24,22 48×48). 몸통은 부르는 쪽이 먼저 그린다 */
export function drawPortraitHead(g: CanvasRenderingContext2D, o: PortraitHead): void {
  // 뒤로 늘어진 머리 (얼굴보다 먼저)
  g.fillStyle = o.hair;
  if (o.style === 'long') g.fillRect(18, 18, 60, 62);
  else if (o.style === 'bob') g.fillRect(17, 18, 62, 46);
  else if (o.style === 'ponytail') {
    g.fillRect(72, 26, 12, 34);
    g.fillStyle = '#2f6fd1';
    g.fillRect(71, 26, 13, 6);
  }
  g.fillStyle = '#f1c7a0';
  g.fillRect(24, 22, 48, 48);
  // 윗머리
  g.fillStyle = o.hair;
  if (o.style === 'crew') {
    g.fillRect(23, 16, 50, 9);
  } else {
    g.fillRect(22, 14, 52, 14);
    g.fillRect(22, 14, 8, 24);
    if (o.style !== 'long') g.fillRect(66, 14, 8, 18);
    if (o.female) g.fillRect(30, 22, 30, 8);
  }
  // 눈·입
  g.fillStyle = INK;
  g.fillRect(34, 42, 6, 8);
  g.fillRect(56, 42, 6, 8);
  if (o.female) {
    // 속눈썹: 눈 위 선 + 바깥 끝에서 옆으로 삐친 짧은 선
    g.fillRect(33, 40, 8, 2);
    g.fillRect(55, 40, 8, 2);
    g.fillRect(30, 41, 4, 2);
    g.fillRect(62, 41, 4, 2);
    g.fillStyle = BLUSH;
    g.fillRect(27, 54, 9, 5);
    g.fillRect(60, 54, 9, 5);
    g.fillStyle = LIP;
    g.fillRect(42, 57, 12, 4);
  } else {
    g.fillStyle = '#8a3b2b';
    g.fillRect(42, 58, 12, 3);
  }
  if (o.glassesStyle) drawGlasses(g, o.glassesStyle, [29, 38, 15, 14], [52, 38, 15, 14]);
  else if (o.glasses) {
    g.strokeStyle = '#7fa6c2';
    g.lineWidth = 3;
    g.strokeRect(29, 38, 15, 14);
    g.strokeRect(52, 38, 15, 14);
    g.beginPath();
    g.moveTo(44, 44);
    g.lineTo(52, 44);
    g.stroke();
  }
  if (o.headband !== undefined) {
    // 이마의 흰 띠 + 빨간 글자
    g.fillStyle = '#ffffff';
    g.fillRect(21, 24, 54, 12);
    g.strokeStyle = INK;
    g.lineWidth = 1;
    g.strokeRect(21, 24, 54, 12);
    if (o.headband) {
      let size = 11;
      g.font = `bold ${size}px ${FONT}`;
      const w = g.measureText(o.headband).width;
      if (w > 50) size = Math.max(6, Math.floor((size * 50) / w));
      g.font = `bold ${size}px ${FONT}`;
      g.fillStyle = '#d0202f';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(o.headband, 48, 30.5);
    }
  }
  if (o.earphones) {
    g.fillStyle = '#f4f4f4';
    g.fillRect(19, 46, 6, 10);
    g.fillRect(71, 46, 6, 10);
  }
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.strokeRect(24, 22, 48, 48);
}
