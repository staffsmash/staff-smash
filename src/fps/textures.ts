import * as THREE from 'three';

// 1인칭 시험판의 그림: 모두 캔버스에 그린 텍스처. 학교 UI 파일(public/hufs/)만 이미지로 불러온다.

export const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const NAVY = '#002c52';
export const GOLD = '#e0bb62';

export interface Logos {
  emblem: HTMLImageElement | null;
  line: HTMLImageElement | null;
  type: HTMLImageElement | null;
  wordmark: HTMLImageElement | null;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadLogos(): Promise<Logos> {
  const [emblem, line, type, wordmark] = await Promise.all([
    loadImage('hufs/emblem.png'),
    loadImage('hufs/emblem-mono.png'),
    loadImage('hufs/hufs-type.png'),
    loadImage('hufs/wordmark-ko.svg'),
  ]);
  return { emblem, line, type, wordmark };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 흰색 단색 로고에 색을 입혀 그린다 (너비 기준, 비율 유지) */
export function drawTinted(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  w: number,
  color: string,
): void {
  if (!img) return;
  const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width) || 1;
  const h = w * ratio;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const t = c.getContext('2d') as CanvasRenderingContext2D;
  t.drawImage(img, 0, 0, w, h);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, w, h);
  g.drawImage(c, cx - w / 2, cy - h / 2);
}

export function drawImageW(g: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, w: number): void {
  if (!img) return;
  const ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width) || 1;
  g.drawImage(img, cx - w / 2, cy - (w * ratio) / 2, w, w * ratio);
}

/** 창이 격자로 난 외벽. 반사광과 테두리까지 그린다 */
export function facadeTex(opts: {
  w: number;
  h: number;
  cols: number;
  rows: number;
  wall: string;
  glass: string;
  frame: string;
  winW?: number;
  winH?: number;
  pilaster?: string;
  top?: number;
  bottom?: number;
}): THREE.CanvasTexture {
  return canvasTex(opts.w, opts.h, (g) => {
    g.fillStyle = opts.wall;
    g.fillRect(0, 0, opts.w, opts.h);
    const top = opts.top ?? 0.08;
    const bottom = opts.bottom ?? 0.06;
    const cw = opts.w / opts.cols;
    const rh = (opts.h * (1 - top - bottom)) / opts.rows;
    const ww = cw * (opts.winW ?? 0.5);
    const wh = rh * (opts.winH ?? 0.6);
    for (let r = 0; r < opts.rows; r++) {
      for (let i = 0; i < opts.cols; i++) {
        const x = i * cw + (cw - ww) / 2;
        const y = opts.h * top + r * rh + (rh - wh) / 2;
        g.fillStyle = opts.frame;
        g.fillRect(x - 3, y - 3, ww + 6, wh + 6);
        g.fillStyle = opts.glass;
        g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(x, y, ww * 0.3, wh);
      }
      if (opts.pilaster) {
        g.fillStyle = opts.pilaster;
        for (let i = 1; i < opts.cols; i++) g.fillRect(i * cw - 3, 0, 6, opts.h);
      }
    }
  });
}

/** 본관 탑 꼭대기 표지: 단색 심벌 + 한국외국어대학교 (남색) */
export function towerSignTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(1024, 192, (g) => {
    g.fillStyle = '#e4dbc8';
    g.fillRect(0, 0, 1024, 192);
    drawTinted(g, logos.line, 150, 96, 130, NAVY);
    drawTinted(g, logos.wordmark, 590, 96, 700, NAVY);
  });
}

export function friezeTex(): THREE.CanvasTexture {
  return canvasTex(2048, 128, (g) => {
    g.fillStyle = '#e9e1cf';
    g.fillRect(0, 0, 2048, 128);
    g.fillStyle = '#7b6c52';
    g.font = `bold 64px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HANKUK UNIVERSITY OF FOREIGN STUDIES', 1024, 68);
  });
}

export function emblemTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => drawImageW(g, logos.emblem, 256, 256, 500));
}

/** 가로등 배너 두 장: 금색 심벌 + HUFS / COME TO HUFS · MEET THE WORLD */
export function bannerTex(logos: Logos, side: 'emblem' | 'slogan'): THREE.CanvasTexture {
  return canvasTex(256, 640, (g) => {
    g.fillStyle = '#15204a';
    g.fillRect(0, 0, 256, 600);
    g.fillStyle = GOLD;
    g.fillRect(0, 590, 256, 10);
    for (let x = 4; x < 256; x += 12) g.fillRect(x, 600, 6, 36);
    if (side === 'emblem') {
      drawTinted(g, logos.line, 128, 190, 170, GOLD);
      drawTinted(g, logos.type, 128, 360, 150, GOLD);
      g.font = `bold 22px ${SERIF}`;
      g.textAlign = 'center';
      g.fillText('HANKUK', 128, 470);
      g.fillText('UNIVERSITY OF', 128, 500);
      g.fillText('FOREIGN STUDIES', 128, 530);
    } else {
      g.font = `bold 40px ${SERIF}`;
      g.textAlign = 'center';
      ['COME TO', 'HUFS', 'MEET THE', 'WORLD'].forEach((s, i) => g.fillText(s, 128, 190 + i * 70));
    }
  });
}

/** 청록 세로 현수막 */
export function tealBannerTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(128, 768, (g) => {
    g.fillStyle = '#16767a';
    g.fillRect(0, 0, 128, 768);
    drawTinted(g, logos.line, 64, 90, 96, '#ffffff');
    g.fillStyle = '#ffffff';
    g.font = `bold 40px ${FONT}`;
    g.textAlign = 'center';
    [...'한국외국어대학교'].forEach((ch, i) => g.fillText(ch, 64, 210 + i * 64));
  });
}

/** 화강암 바닥 */
export function pavingTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d9d3c8';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = i % 2 ? 'rgba(160,150,135,0.25)' : 'rgba(255,255,255,0.25)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = '#bfb8ab';
    g.lineWidth = 4;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 128);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.moveTo(64, 128);
    g.lineTo(64, 256);
    g.moveTo(192, 128);
    g.lineTo(192, 256);
    g.stroke();
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function lawnTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#76a04a';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = i % 3 ? '#5f8a3a' : '#89b35a';
      g.fillRect(Math.random() * 128, Math.random() * 128, 3, 4);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 새벽 3시 메일: 화난 눈, 봉투 접힌 선, 빨간 3:00 소인 */
export function mailTex(): THREE.CanvasTexture {
  return canvasTex(256, 176, (g) => {
    g.fillStyle = '#f2ead8';
    g.fillRect(0, 0, 256, 176);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 168);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(6, 8);
    g.lineTo(128, 96);
    g.lineTo(250, 8);
    g.stroke();
    // 화난 눈썹과 눈
    g.fillStyle = '#1d1d22';
    g.fillRect(70, 112, 26, 26);
    g.fillRect(160, 112, 26, 26);
    g.save();
    g.translate(83, 100);
    g.rotate(0.35);
    g.fillRect(-20, -5, 40, 9);
    g.restore();
    g.save();
    g.translate(173, 100);
    g.rotate(-0.35);
    g.fillRect(-20, -5, 40, 9);
    g.restore();
    // 소인
    g.strokeStyle = '#d0202f';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(214, 44, 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold 20px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('3:00', 214, 45);
  });
}

/** 단체 메일(큰 것) 앞면: "전체 회신" 띠 */
export function bulkTex(): THREE.CanvasTexture {
  return canvasTex(256, 176, (g) => {
    g.drawImage((mailTex().image as HTMLCanvasElement), 0, 0);
    g.fillStyle = '#d0202f';
    g.fillRect(0, 150, 256, 26);
    g.fillStyle = '#ffffff';
    g.font = `bold 18px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('전체 회신', 128, 164);
  });
}

/** 맞힌 자리에 찍히는 "처리" 도장 */
export function stampMarkTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = '#d0202f';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 88, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold 84px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('처리', 128, 132);
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function angryEyes(g: CanvasRenderingContext2D, cx: number, cy: number, gap: number, size: number): void {
  g.fillStyle = '#1d1d22';
  for (const s of [-1, 1]) {
    g.fillRect(cx + s * gap - size / 2, cy, size, size);
    g.save();
    g.translate(cx + s * gap, cy - size * 0.5);
    g.rotate(-s * 0.35);
    g.fillRect(-size * 0.8, -size * 0.18, size * 1.6, size * 0.36);
    g.restore();
  }
}

/** 울리는 전화기 앞면: 번호 단추 3×3, 빨간 불, 화난 눈 */
export function phoneFaceTex(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = '#e9e4d4';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 120);
    angryEyes(g, 70, 46, 30, 18);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        g.fillStyle = '#777777';
        g.fillRect(140 + j * 30, 26 + i * 28, 22, 18);
      }
    }
    g.fillStyle = '#ff4d4d';
    g.beginPath();
    g.arc(70, 98, 10, 0, Math.PI * 2);
    g.fill();
  });
}

/** "교수님이 된다고 했는데요" 말풍선 (투명 배경, 꼬리 포함) */
export function bubbleTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.lineJoin = 'round';
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111318';
    g.lineWidth = 10;
    roundRect(g, 10, 10, 492, 178, 60);
    g.fill();
    g.stroke();
    // 꼬리
    g.beginPath();
    g.moveTo(96, 180);
    g.lineTo(70, 246);
    g.lineTo(156, 182);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillRect(100, 168, 52, 16);
    g.fillStyle = '#111318';
    g.font = `bold 56px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('교수님이', 256, 66);
    g.fillText('된다고 했는데요', 256, 134);
  });
}

/** 마감 1분 전 서류 뭉치: 앞면(눈 + 종이 결), 옆면(종이 층) */
export function bombFaceTex(): THREE.CanvasTexture {
  return canvasTex(256, 192, (g) => {
    g.fillStyle = '#f1e7c8';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 4; i++) g.fillRect(40, 22 + i * 16, 170, 5);
    angryEyes(g, 128, 118, 40, 22);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 184);
  });
}

export function bombSideTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#f6f0dc';
    g.fillRect(0, 0, 128, 128);
    for (let y = 6; y < 128; y += 9) {
      g.fillStyle = y % 2 ? '#d8cfb4' : '#e7dfc6';
      g.fillRect(0, y, 128, 3);
    }
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
  });
}

/** 서류 뭉치 위 마감 시계 (초가 바뀔 때마다 다시 그린다) */
export function drawTimer(c: HTMLCanvasElement, secs: number, hot: boolean): void {
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = hot ? '#ff3b3b' : '#d0202f';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#111318';
  g.lineWidth = 6;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.fillStyle = '#ffffff';
  g.font = `bold 46px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`0:0${Math.max(0, Math.min(9, secs))}`, c.width / 2, c.height / 2 + 2);
}

/** 흩날리는 종이(보스의 종이 탄막) */
export function paperTex(): THREE.CanvasTexture {
  return canvasTex(64, 80, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 64, 80);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 5; i++) g.fillRect(10, 14 + i * 11, 44, 4);
    g.fillStyle = '#d0202f';
    g.fillRect(10, 66, 22, 5);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, 61, 77);
  });
}

/** 글자 딱지 (줍는 물건 이름, 머리 위 대사) */
export function labelTex(text: string, color = '#ffffff', bg = 'rgba(17,19,24,0.72)', stroke = '#111318'): THREE.CanvasTexture {
  const size = 44;
  const probe = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  probe.font = `bold ${size}px ${FONT}`;
  const w = Math.ceil(probe.measureText(text).width) + 40;
  const t = canvasTex(w, 72, (g) => {
    if (bg) {
      g.fillStyle = bg;
      roundRect(g, 2, 2, w - 4, 68, 16);
      g.fill();
    }
    g.font = `bold ${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (stroke) {
      g.lineWidth = 8;
      g.strokeStyle = stroke;
      g.strokeText(text, w / 2, 38);
    }
    g.fillStyle = color;
    g.fillText(text, w / 2, 38);
  });
  t.userData = { aspect: w / 72 };
  return t;
}

/** 전화기가 떨어질 자리의 빨간 그림자 */
export function warnTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    gr.addColorStop(0, 'rgba(208,32,47,0.75)');
    gr.addColorStop(0.75, 'rgba(208,32,47,0.45)');
    gr.addColorStop(1, 'rgba(208,32,47,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(64, 64, 52, 0, Math.PI * 2);
    g.stroke();
  });
}

/** 바닥에 놓인 물건 둘레의 빛 */
export function glowTex(rgb: string): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62);
    gr.addColorStop(0, `rgba(${rgb},0.8)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/** 길 안내 화살표 (바닥) */
export function chevronTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#f5c542';
    g.strokeStyle = '#111318';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(24, 20);
    g.lineTo(70, 20);
    g.lineTo(112, 64);
    g.lineTo(70, 108);
    g.lineTo(24, 108);
    g.lineTo(66, 64);
    g.closePath();
    g.fill();
    g.stroke();
  });
}

/** 노랑·검정 빗금 (통행 막는 바리케이드) */
export function stripeTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 32, (g) => {
    g.fillStyle = '#f5c542';
    g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#1d1d22';
    for (let x = -32; x < 160; x += 32) {
      g.beginPath();
      g.moveTo(x, 32);
      g.lineTo(x + 16, 32);
      g.lineTo(x + 32, 0);
      g.lineTo(x + 16, 0);
      g.closePath();
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- 사회과학관 ----------

/** 안으로 들어간 유리창 띠: 창 4칸 + 기둥 하나를 한 장으로 (가로 반복) */
export function glassBandTex(): THREE.CanvasTexture {
  const t = canvasTex(512, 128, (g) => {
    g.fillStyle = '#8e959a';
    g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 4; i++) {
      const x = 36 + i * 118;
      g.fillStyle = '#5a7184';
      g.fillRect(x, 16, 96, 96);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, 16, 30, 96);
      g.fillStyle = '#7d868c';
      g.fillRect(x + 46, 16, 4, 96);
    }
    g.fillStyle = '#cac5bb';
    g.fillRect(0, 0, 22, 128);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** 유리 현관문 (세로 문살) */
export function glassDoorTex(): THREE.CanvasTexture {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = '#3e5561';
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 5; i++) g.fillRect(i * 102 + 10, 0, 30, 160);
    g.fillStyle = '#9aa3a8';
    for (let i = 0; i <= 5; i++) g.fillRect(i * 102 - 3, 0, 7, 160);
    g.fillRect(0, 0, 512, 7);
    g.fillStyle = '#c9cfd2';
    g.fillRect(240, 70, 8, 34);
    g.fillRect(264, 70, 8, 34);
  });
}

/** 보라색 사회과학관 간판: 흰 심벌 + 사회과학관 */
export function socialSignTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(1024, 128, (g) => {
    g.fillStyle = '#5a2a86';
    g.fillRect(0, 0, 1024, 128);
    drawTinted(g, logos.line, 120, 64, 92, '#ffffff');
    g.fillStyle = '#ffffff';
    g.font = `bold 76px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('사회과학관', 560, 68);
  });
}

/** 분홍 "학생 상담 주간" 현수막 */
export function counselTex(): THREE.CanvasTexture {
  return canvasTex(512, 112, (g) => {
    g.fillStyle = '#f2a7c6';
    g.fillRect(0, 0, 512, 112);
    g.fillStyle = '#7a1d48';
    g.font = `bold 58px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('학생 상담 주간', 256, 60);
  });
}

/** 공지를 아무도 안 읽는 게시판 */
export function noticeBoardTex(): THREE.CanvasTexture {
  return canvasTex(1024, 560, (g) => {
    g.fillStyle = '#d0202f';
    g.fillRect(0, 0, 1024, 112);
    g.fillStyle = '#ffffff';
    g.font = `bold 72px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('공지 꼭 읽어 주세요!', 512, 60);
    g.fillStyle = '#7a5b3e';
    g.fillRect(0, 112, 1024, 448);
    g.fillStyle = '#c99a62';
    g.fillRect(24, 134, 976, 404);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const papers = ['#ffffff', '#fff3b0', '#ffffff', '#cfe8ff', '#ffffff', '#ffd6e0'];
    for (let i = 0; i < 14; i++) {
      const w = 110 + rnd() * 70;
      const h = 130 + rnd() * 80;
      const x = 40 + (i % 7) * 136 + rnd() * 20;
      const y = 148 + Math.floor(i / 7) * 190 + rnd() * 20;
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate((rnd() - 0.5) * 0.12);
      g.fillStyle = papers[i % papers.length];
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = '#9aa3ad';
      for (let k = 0; k < 5; k++) g.fillRect(-w / 2 + 14, -h / 2 + 34 + k * 18, w - 28 - (k % 2) * 20, 6);
      g.fillStyle = '#3c3c44';
      g.fillRect(-w / 2 + 14, -h / 2 + 12, w * 0.5, 10);
      g.fillStyle = '#d0202f';
      g.beginPath();
      g.arc(0, -h / 2 + 4, 7, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

/** 사회과학관 앞 붉은 보도블록 */
export function brickTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#cfa79a';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = i % 2 ? 'rgba(150,100,88,0.22)' : 'rgba(255,255,255,0.18)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = '#b98f82';
    g.lineWidth = 4;
    for (let r = 0; r < 4; r++) {
      const y = r * 64;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      for (let x = (r % 2) * 64; x < 256; x += 128) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 64);
        g.stroke();
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- 대운동장 ----------

/** 잔디 줄무늬: 밝은 줄·어두운 줄 한 쌍 (가로 반복) */
export function turfTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 128, (g) => {
    g.fillStyle = '#47a552';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#3d9548';
    g.fillRect(128, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = i % 3 ? 'rgba(30,80,35,0.18)' : 'rgba(170,220,140,0.16)';
      g.fillRect(Math.random() * 256, Math.random() * 128, 2, 3);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 운동장 철망: 옅은 초록 바탕 + 마름모 그물 (반투명) */
export function fenceNetTex(): THREE.CanvasTexture {
  const t = canvasTex(64, 64, (g) => {
    g.fillStyle = 'rgba(38,84,58,0.16)';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(30,64,44,0.75)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 32);
    g.lineTo(32, 0);
    g.lineTo(64, 32);
    g.lineTo(32, 64);
    g.closePath();
    g.stroke();
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 골대 그물: 흰 격자 */
export function goalNetTex(): THREE.CanvasTexture {
  const t = canvasTex(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 30, 30);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 울타리 남색 현수막: 흰 심벌 + HUFS + 한국외국어대학교 */
export function fieldBannerTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(2048, 256, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 2048, 256);
    g.fillStyle = GOLD;
    g.fillRect(0, 10, 2048, 6);
    g.fillRect(0, 240, 2048, 6);
    drawTinted(g, logos.line, 190, 128, 170, '#ffffff');
    drawTinted(g, logos.type, 520, 128, 330, '#ffffff');
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = `bold 92px ${FONT}`;
    g.fillText('한국외국어대학교', 740, 104);
    g.font = `italic 44px ${SERIF}`;
    g.fillText('Hankuk University of Foreign Studies', 744, 188);
  });
}

/** 끝쪽 울타리 현수막: COME TO HUFS · MEET THE WORLD */
export function sloganBannerTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(1024, 160, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 1024, 160);
    drawTinted(g, logos.line, 90, 80, 104, GOLD);
    g.fillStyle = GOLD;
    g.font = `bold 58px ${SERIF}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('COME TO HUFS · MEET THE WORLD', 170, 84);
  });
}

/** 운동장 너머 아파트: 크림색 벽, 층마다 창 띠, 불 켜진 창 몇 개 */
export function apartmentTex(): THREE.CanvasTexture {
  return canvasTex(256, 512, (g) => {
    g.fillStyle = '#d8cdc3';
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#bfb2a6';
    g.fillRect(222, 0, 34, 512);
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let y = 18; y < 500; y += 24) {
      g.fillStyle = '#8c8077';
      g.fillRect(14, y, 196, 9);
      for (let x = 14; x < 210; x += 28) {
        if (rnd() < 0.22) {
          g.fillStyle = '#ffd98a';
          g.fillRect(x, y, 22, 9);
        }
      }
    }
  });
}

/** 사회과학관 앞 길 표지: 대운동장 */
export function fieldSignTex(): THREE.CanvasTexture {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = '#2f8f4e';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 492, 140);
    g.fillStyle = '#ffffff';
    g.font = `bold 76px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('대운동장', 256, 84);
  });
}

// ---------- 보스 (사람) ----------

export interface FaceOpts {
  skin: string;
  brow: string;
  glasses?: boolean;
  /** 콧수염 색 */
  mustache?: string;
  /** 눈웃음과 다문 미소 (총장) */
  smile?: boolean;
}

/** 블록 사람 얼굴 (머리 상자 앞면) */
export function faceTex(o: FaceOpts): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = o.skin;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = o.brow;
    g.fillRect(24, 38, 30, 8);
    g.fillRect(74, 38, 30, 8);
    if (o.smile) {
      // 눈웃음: 위로 굽은 짧은 선, 코 그림자, 양 끝이 올라간 다문 미소
      g.strokeStyle = '#1d1d22';
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (const cx of [39, 89]) {
        g.beginPath();
        g.arc(cx, 66, 10, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      g.fillStyle = 'rgba(170,110,80,0.35)';
      g.fillRect(58, 64, 12, 22);
      g.strokeStyle = '#8a3b2b';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(64, 78, 18, Math.PI * 0.22, Math.PI * 0.78);
      g.stroke();
    } else {
      g.fillStyle = '#1d1d22';
      g.fillRect(32, 54, 12, 14);
      g.fillRect(84, 54, 12, 14);
      g.fillStyle = '#8a3b2b';
      g.fillRect(50, 96, 28, 5);
    }
    if (o.mustache) {
      g.fillStyle = o.mustache;
      g.fillRect(42, 84, 44, 8);
    }
    if (o.glasses) {
      g.fillStyle = 'rgba(207,232,245,0.45)';
      g.fillRect(24, 48, 32, 26);
      g.fillRect(72, 48, 32, 26);
      g.strokeStyle = '#7fa6c2';
      g.lineWidth = 5;
      g.strokeRect(24, 48, 32, 26);
      g.strokeRect(72, 48, 32, 26);
      g.beginPath();
      g.moveTo(56, 58);
      g.lineTo(72, 58);
      g.stroke();
    }
  });
}

/** 결재판 종이: 위에 "결재" 칸 세 개, 아래 줄글 */
export function clipPaperTex(): THREE.CanvasTexture {
  return canvasTex(128, 168, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 168);
    g.fillStyle = '#1d1d22';
    g.font = `bold 22px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('결재', 10, 28);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 3;
    for (let i = 0; i < 3; i++) g.strokeRect(58 + i * 22, 10, 22, 38);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 6; i++) g.fillRect(12, 64 + i * 15, 104 - (i % 2) * 22, 5);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 124, 164);
  });
}

/** 날아오는 서류 (최장학의 장학 서류, 부총장의 회의 자료) */
export function docTex(title: string, color: string): THREE.CanvasTexture {
  return canvasTex(128, 176, (g) => {
    g.fillStyle = '#fbf8f0';
    g.fillRect(0, 0, 128, 176);
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 44);
    g.fillStyle = '#ffffff';
    g.font = `bold 26px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(title, 64, 23);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 7; i++) g.fillRect(14, 60 + i * 14, 100 - (i % 3) * 18, 6);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 124, 172);
  });
}

/** 회의 소집 고리의 벽: 보라 띠에 흰 글씨 (가로로 되풀이) */
export function meetingRingTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 64, (g) => {
    const gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(124,58,237,0.92)');
    gr.addColorStop(0.8, 'rgba(124,58,237,0.5)');
    gr.addColorStop(0.84, 'rgba(236,224,255,1)');
    gr.addColorStop(1, 'rgba(236,224,255,1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffffff';
    g.font = `bold 30px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('회의 소집', 128, 36);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** 김보고 처장이 던지는 "보고해!" 말풍선 (투명 배경, 꼬리) */
export function reportBubbleTex(): THREE.CanvasTexture {
  return canvasTex(256, 136, (g) => {
    g.lineJoin = 'round';
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111318';
    g.lineWidth = 8;
    roundRect(g, 8, 8, 240, 88, 30);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(52, 92);
    g.lineTo(36, 130);
    g.lineTo(88, 94);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillRect(56, 84, 30, 10);
    g.fillStyle = '#d0202f';
    g.font = `bold 52px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('보고해!', 128, 54);
  });
}

/** 수강신청 서버 폭주 때 떨어지는 오류 창 */
export function errorWinTex(): THREE.CanvasTexture {
  return canvasTex(192, 144, (g) => {
    g.fillStyle = '#f4f6fa';
    g.fillRect(0, 0, 192, 144);
    g.fillStyle = '#2f6fd1';
    g.fillRect(0, 0, 192, 26);
    g.fillStyle = '#ffffff';
    g.font = `bold 16px ${FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('수강신청', 10, 14);
    g.fillStyle = '#d0202f';
    g.beginPath();
    g.arc(46, 84, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(34, 72);
    g.lineTo(58, 96);
    g.moveTo(58, 72);
    g.lineTo(34, 96);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold 38px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('오류', 128, 76);
    g.fillStyle = '#5a606e';
    g.font = `bold 15px ${FONT}`;
    g.fillText('접속 대기 중…', 128, 112);
    g.strokeStyle = '#1d1d22';
    g.lineWidth = 4;
    g.strokeRect(2, 2, 188, 140);
  });
}

/** 서버 랙 앞면 (불 켜진 단자들) */
export function serverTex(): THREE.CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#23262e';
    g.fillRect(0, 0, 128, 256);
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let r = 0; r < 9; r++) {
      const y = 10 + r * 27;
      g.fillStyle = '#3a3f4b';
      g.fillRect(8, y, 112, 21);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = rnd() < 0.7 ? '#4ade80' : '#f59e0b';
        g.fillRect(16 + i * 10, y + 8, 5, 5);
      }
      g.fillStyle = '#1b1d23';
      g.fillRect(84, y + 5, 30, 11);
    }
  });
}

/** 거대 도장이 바닥에 남기는 자국 ("보류", "재검토") */
export function bigStampMarkTex(text: string): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = '#d0202f';
    g.lineWidth = 16;
    g.beginPath();
    g.arc(128, 128, 112, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold ${text.length > 2 ? 64 : 84}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 132);
  });
}

/** 단상 앞 학교 심벌 판 */
export function lecternTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 256, 256);
    drawTinted(g, logos.line, 128, 110, 130, '#ffffff');
    drawTinted(g, logos.type, 128, 210, 120, '#ffffff');
  });
}
