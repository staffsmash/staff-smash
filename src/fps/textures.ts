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

/** 하늘: 위 파랑 → 아래 늦은 오후 빛 */
export function skyTex(): THREE.CanvasTexture {
  return canvasTex(8, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#6fa6dc');
    gr.addColorStop(0.45, '#a9cdec');
    gr.addColorStop(0.62, '#e9e2cf');
    gr.addColorStop(1, '#f2d4ae');
    g.fillStyle = gr;
    g.fillRect(0, 0, 8, 256);
  });
}
