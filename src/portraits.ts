import type { StaffLook } from './data/heroes';
import type { StudentHeroLook } from './data/students';

// 선택 화면·공유 그림 초상 (96×112 캔버스, 블록형 앞모습). three.js 없이 그려서 2D 쪽도 쓸 수 있다 (PRD 결정 60 공유 그림).
// 2026-11-27 1인칭 파일에서 옮겨 왔다: looktex.ts drawPortraitHead, staffpick.ts staffPortrait, student/textures.ts heroPortrait
// (그쪽 이름은 여기를 다시 내보낸다). 그림은 그대로다.

export type GlassesStyle = 'horn' | 'silver' | 'sun';

const INK = '#1d1d22';
const LIP = '#c0485a';
const BLUSH = 'rgba(243,140,140,0.45)';
const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** 색을 조금 어둡게 (옷깃) */
function darken(c: number, k = 0.82): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
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

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 112;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

/** 교직원 초상: 셔츠·넥타이(앞치마)·사원증 줄·머리·안경. 여성은 블라우스 깃·리본, 머리 모양·안경 모양·머리띠 글자·규정집 */
export function staffPortraitCanvas(look: StaffLook): HTMLCanvasElement {
  const [c, g] = canvas();
  // 몸통 (셔츠)
  g.fillStyle = hex(look.shirt);
  g.fillRect(16, 70, 64, 42);
  // 옷깃 (여성 블라우스는 흰 둥근 깃)
  g.fillStyle = look.female ? '#ffffff' : hex(darken(look.shirt));
  g.fillRect(34, 70, 10, 6);
  g.fillRect(52, 70, 10, 6);
  if (look.apron) {
    // 앞치마 (위끝에 넥타이 색 띠)
    g.fillStyle = '#fff3d6';
    g.fillRect(28, 80, 40, 32);
    g.fillStyle = hex(look.tie);
    g.fillRect(28, 80, 40, 5);
    g.fillRect(31, 70, 4, 10);
    g.fillRect(61, 70, 4, 10);
  } else {
    g.fillStyle = hex(look.tie);
    if (look.female) {
      // 리본: 양쪽 고리 + 매듭 + 늘어진 끈 (긴 머리 끝(y 80)보다 아래)
      g.fillRect(35, 81, 11, 8);
      g.fillRect(50, 81, 11, 8);
      g.fillRect(42, 87, 3, 10);
      g.fillRect(51, 87, 3, 10);
      g.fillStyle = hex(darken(look.tie, 0.7));
      g.fillRect(45, 82, 6, 6);
    } else {
      // 넥타이
      g.fillRect(44, 72, 8, 6);
      g.fillRect(45, 78, 6, 28);
    }
    // 사원증 줄과 카드
    g.fillStyle = '#2f6fd1';
    g.fillRect(60, 70, 3, 20);
    g.fillStyle = '#ffffff';
    g.fillRect(56, 90, 12, 14);
    g.fillStyle = '#2f6fd1';
    g.fillRect(56, 90, 12, 4);
  }
  // 규정집 (아래 왼쪽, 초록 표지·금색 띠)
  if (look.prop === 'rulebook') {
    g.fillStyle = '#1f5e45';
    g.fillRect(6, 82, 26, 30);
    g.fillStyle = '#d9b44a';
    g.fillRect(6, 90, 26, 4);
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.strokeRect(6, 82, 26, 30);
  }
  drawPortraitHead(g, {
    hair: hex(look.hair),
    style: look.crew ? 'crew' : look.bob ? 'bob' : look.ponytail ? 'ponytail' : look.longHair ? 'long' : 'short',
    female: look.female,
    glasses: look.glasses,
    glassesStyle: look.glassesStyle,
    headband: look.headband,
  });
  return c;
}

/** 학생 초상: 후드티·재킷+티셔츠·야구잠바·체크 셔츠, 가방끈, 머리 */
export function studentPortraitCanvas(look: StudentHeroLook): HTMLCanvasElement {
  const [c, g] = canvas();
  g.fillStyle = hex(look.jacket);
  g.fillRect(16, 70, 64, 42);
  if (look.check) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 16; x < 80; x += 14) g.fillRect(x, 70, 5, 42);
    for (let y = 74; y < 112; y += 14) g.fillRect(16, y, 64, 5);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (let x = 25; x < 80; x += 14) g.fillRect(x, 70, 2, 42);
  }
  if (look.varsity) {
    // 외대 야구잠바: 흰 소매, 줄무늬 목깃, 가슴 "H"
    g.fillStyle = '#f4f4f4';
    g.fillRect(16, 74, 10, 38);
    g.fillRect(70, 74, 10, 38);
    g.fillRect(36, 72, 24, 2);
    g.fillRect(53, 84, 4, 16);
    g.fillRect(63, 84, 4, 16);
    g.fillRect(53, 90, 14, 4);
  } else if (look.hoodie) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(28, 92, 40, 14);
    g.fillStyle = '#f4f4f4';
    g.fillRect(40, 72, 3, 14);
    g.fillRect(53, 72, 3, 14);
  } else {
    g.fillStyle = hex(look.tee ?? 0xf4f4f4);
    g.fillRect(38, 70, 20, 42);
  }
  g.fillStyle = hex(look.bag);
  g.fillRect(16, 72, 7, 40);
  g.fillRect(73, 72, 7, 40);
  drawPortraitHead(g, {
    hair: hex(look.hair),
    style: look.bob ? 'bob' : look.ponytail ? 'ponytail' : look.longHair ? 'long' : 'short',
    female: look.female,
    glasses: look.glasses,
    glassesStyle: look.glassesStyle,
    earphones: look.earphones,
  });
  return c;
}

/** 교직원 초상 data URL (1인칭 선택 화면이 쓴다) */
export function staffPortrait(look: StaffLook): string {
  return staffPortraitCanvas(look).toDataURL();
}

/** 학생 초상 data URL (1인칭 학생 선택 화면이 쓴다) */
export function studentPortrait(look: StudentHeroLook): string {
  return studentPortraitCanvas(look).toDataURL();
}
