import * as THREE from 'three';
import type { StudentHeroLook } from '../../data/students';
import { canvasTex, FONT, NAVY } from '../textures';

// 학생 모드 그림 (모두 캔버스). 외형·색은 본편 2D studentRigs.ts 값을 옮겼다.

const INK = '#1d1d22';
const PAPER = '#f6f1e1';
const RED = '#d0202f';

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function angryEyes(g: CanvasRenderingContext2D, cx: number, cy: number, gap: number, size: number): void {
  g.fillStyle = INK;
  for (const s of [-1, 1]) {
    g.fillRect(cx + s * gap - size / 2, cy, size, size);
    g.save();
    g.translate(cx + s * gap, cy - size * 0.5);
    g.rotate(-s * 0.35);
    g.fillRect(-size * 0.8, -size * 0.18, size * 1.6, size * 0.36);
    g.restore();
  }
}

/** 맞힌 자리 도장 ("통과"·"설득"·"반사"·주문 도장) */
export function markTex(text: string, color: string): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = color;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(128, 128, 110, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 88, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.font = `bold ${text.length > 2 ? 64 : 84}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 132);
  });
}

/** 바닥에 떨어진 서류 한 장 (빗나간 서류 비행기 자리) */
export function paperDecalTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.translate(64, 64);
    g.rotate(0.35);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-30, -38, 64, 80);
    g.fillStyle = '#ffffff';
    g.fillRect(-34, -42, 64, 80);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 5; i++) g.fillRect(-26, -30 + i * 11, 46 - (i % 2) * 12, 4);
    g.fillStyle = NAVY;
    g.fillRect(-34, -42, 64, 9);
  });
}

/** "반려 서류" 앞면: 접힌 귀퉁이, 글줄, 화난 눈, 빨간 "반려" 도장 */
export function rejectDocTex(): THREE.CanvasTexture {
  return canvasTex(192, 240, (g) => {
    g.fillStyle = PAPER;
    g.fillRect(0, 0, 192, 240);
    g.fillStyle = '#e2dccb';
    g.beginPath();
    g.moveTo(150, 0);
    g.lineTo(192, 0);
    g.lineTo(192, 42);
    g.closePath();
    g.fill();
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 4; i++) g.fillRect(22, 26 + i * 16, 112 - (i % 2) * 26, 6);
    angryEyes(g, 96, 150, 34, 22);
    g.save();
    g.translate(138, 92);
    g.rotate(-0.25);
    g.strokeStyle = RED;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 32, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = RED;
    g.font = `bold 26px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('반려', 0, 2);
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 8;
    g.strokeRect(4, 4, 184, 232);
  });
}

/** "결석 도장" 몸통 앞면 (화난 눈) */
export function absenceFaceTex(): THREE.CanvasTexture {
  return canvasTex(192, 64, (g) => {
    g.fillStyle = '#9a6a3a';
    g.fillRect(0, 0, 192, 64);
    angryEyes(g, 96, 26, 30, 14);
    g.fillStyle = INK;
    g.fillRect(84, 50, 24, 4);
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.strokeRect(2, 2, 188, 60);
  });
}

/** "결석 도장" 바닥면 (위에서 떨어질 때 보인다) */
export function absenceBottomTex(): THREE.CanvasTexture {
  return canvasTex(160, 128, (g) => {
    g.fillStyle = '#b8262f';
    g.fillRect(0, 0, 160, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(12, 12, 136, 104);
    g.fillStyle = '#ffffff';
    g.font = `bold 52px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('결석', 80, 66);
  });
}

/** "휴강 공지 봇": 주황 띠를 두른 알림 말풍선 (투명 배경, 꼬리) */
export function cancelBotTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.lineJoin = 'round';
    g.fillStyle = '#fff7e0';
    g.strokeStyle = '#111318';
    g.lineWidth = 10;
    round(g, 10, 14, 492, 176, 40);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(96, 182);
    g.lineTo(70, 246);
    g.lineTo(156, 184);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillRect(100, 170, 52, 16);
    g.save();
    round(g, 15, 19, 482, 166, 36);
    g.clip();
    g.fillStyle = '#f59e0b';
    g.fillRect(0, 0, 512, 40);
    g.restore();
    g.fillStyle = '#111318';
    g.font = `bold 50px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('[알림] 오늘', 256, 82);
    g.fillText('휴강입니다?', 256, 144);
  });
}

/** "대기번호표" 앞면: 구멍 줄, 남색 띠, 번호, 눈 */
export function ticketTex(no: string): THREE.CanvasTexture {
  return canvasTex(128, 176, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 176);
    g.fillStyle = '#9aa3ad';
    for (let x = 14; x < 120; x += 18) g.fillRect(x, 10, 8, 8);
    g.fillStyle = NAVY;
    g.fillRect(10, 28, 108, 20);
    g.fillStyle = '#ffffff';
    g.font = `bold 15px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('대기번호', 64, 39);
    g.fillStyle = NAVY;
    g.font = `bold 50px ${FONT}`;
    g.fillText(no, 64, 88);
    g.fillStyle = INK;
    g.fillRect(40, 130, 12, 14);
    g.fillRect(76, 130, 12, 14);
    g.strokeStyle = INK;
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 170);
  });
}

/** 서류 탑 옆면 (종이 층 + 빨간 반려 딱지) */
export function towerTex(): THREE.CanvasTexture {
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 256);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let y = 0; y < 256; y += 8) {
      g.fillStyle = (y / 8) % 2 ? PAPER : '#ffffff';
      g.fillRect(0, y, 128, 8);
      g.fillStyle = '#d8cfb4';
      g.fillRect(0, y + 7, 128, 1);
      if (rnd() < 0.22) {
        g.fillStyle = RED;
        g.fillRect(10 + rnd() * 90, y + 1, 18, 6);
      }
    }
  });
}

/** 총장실 표지 (남색 판, 흰 글씨) */
export function signTex(text: string): THREE.CanvasTexture {
  return canvasTex(256, 96, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = '#e0bb62';
    g.lineWidth = 6;
    g.strokeRect(6, 6, 244, 84);
    g.fillStyle = '#ffffff';
    g.font = `bold 44px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 50);
  });
}

/** 빨간 첨삭 선 (가운데 펜 선 두 줄 + 고친 자국 X) */
export function penLineTex(): THREE.CanvasTexture {
  const t = canvasTex(64, 256, (g) => {
    g.fillStyle = 'rgba(208,32,47,0.22)';
    g.fillRect(0, 0, 64, 256);
    g.strokeStyle = 'rgba(208,32,47,0.95)';
    for (const [off, w] of [
      [-5, 7],
      [6, 4],
    ] as const) {
      g.lineWidth = w;
      g.beginPath();
      for (let y = 0; y <= 256; y += 8) g.lineTo(32 + off + Math.sin(y / 14 + off) * 5, y);
      g.stroke();
    }
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(44, 110);
    g.lineTo(58, 126);
    g.moveTo(58, 110);
    g.lineTo(44, 126);
    g.stroke();
  });
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 선택 화면 주인공 얼굴 (블록형 앞모습, 2D createStudentHeroRig 색) */
export function heroPortrait(look: StudentHeroLook): string {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 112;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const skin = '#f1c7a0';
  // 몸통 (후드티 또는 재킷 + 티셔츠)
  g.fillStyle = hex(look.jacket);
  g.fillRect(16, 70, 64, 42);
  if (look.hoodie) {
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
  // 머리
  if (look.longHair) {
    g.fillStyle = hex(look.hair);
    g.fillRect(18, 18, 60, 62);
  }
  g.fillStyle = skin;
  g.fillRect(24, 22, 48, 48);
  g.fillStyle = hex(look.hair);
  g.fillRect(22, 14, 52, 14);
  g.fillRect(22, 14, 8, 24);
  if (!look.longHair) g.fillRect(66, 14, 8, 18);
  g.fillStyle = INK;
  g.fillRect(34, 42, 6, 8);
  g.fillRect(56, 42, 6, 8);
  g.fillStyle = '#8a3b2b';
  g.fillRect(42, 58, 12, 3);
  if (look.glasses) {
    g.strokeStyle = '#7fa6c2';
    g.lineWidth = 3;
    g.strokeRect(29, 38, 15, 14);
    g.strokeRect(52, 38, 15, 14);
    g.beginPath();
    g.moveTo(44, 44);
    g.lineTo(52, 44);
    g.stroke();
  }
  if (look.earphones) {
    g.fillStyle = '#f4f4f4';
    g.fillRect(19, 46, 6, 10);
    g.fillRect(71, 46, 6, 10);
  }
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.strokeRect(24, 22, 48, 48);
  return c.toDataURL();
}
