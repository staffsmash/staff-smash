import Phaser from 'phaser';
import { FONT } from '../config';
import type { BackgroundId } from '../data/stages';

// 스테이지 배경. 서울캠퍼스 분위기만 빌리고 실제 건물을 본뜨지 않는다. 구역 하나 = 화면 한 장(960px).
// 1스테이지 본관 사무실 / 2스테이지 도서관 → 교양관 / 3스테이지 정문 (야외, 해 질 녘)

type G = Phaser.GameObjects.Graphics;
type Label = (x: number, y: number, text: string, size?: number, color?: string) => void;

export function drawBackground(scene: Phaser.Scene, id: BackgroundId, width: number): void {
  const g = scene.add.graphics().setDepth(-100);
  const label: Label = (x, y, text, size = 18, color = '#3b3326') => {
    scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(-99);
  };
  const rnd = new Phaser.Math.RandomDataGenerator(['staff-smash', id]);
  if (id === 'office') office(g, label, rnd, width);
  else if (id === 'library') library(g, label, rnd, width);
  else gate(g, label, rnd, width);
}

function indoor(g: G, width: number, wall: number, floor: number, floorLine: number): void {
  g.fillStyle(wall).fillRect(0, 0, width, 300);
  g.fillStyle(Phaser.Display.Color.ValueToColor(wall).darken(6).color).fillRect(0, 0, width, 24);
  g.fillStyle(0x7a5b3e).fillRect(0, 292, width, 10);
  g.fillStyle(floor).fillRect(0, 302, width, 238);
  g.lineStyle(2, floorLine, 1);
  for (const y of [328, 364, 410, 466, 532]) g.lineBetween(0, y, width, y);
  for (let x = -120; x < width + 120; x += 120) g.lineBetween(x, 302, x - 70, 540);
}

function door(g: G, label: Label, x: number, sign: string): void {
  g.fillStyle(0x8b6b4e).fillRect(x, 92, 130, 200);
  g.lineStyle(3, 0x5d4632, 1).strokeRect(x, 92, 130, 200);
  g.fillStyle(0xd9c27a).fillCircle(x + 114, 196, 6);
  g.fillStyle(0xffffff).fillRect(x + 20, 112, 90, 28);
  label(x + 65, 126, sign, 15);
}

function board(g: G, rnd: Phaser.Math.RandomDataGenerator, x: number, y: number, w: number, h: number, n: number): void {
  g.fillStyle(0xc79a62).fillRect(x, y, w, h);
  g.lineStyle(4, 0x7a5b3e, 1).strokeRect(x, y, w, h);
  const cols = Math.max(1, Math.floor((w - 20) / 86));
  for (let i = 0; i < n; i++) {
    const cx = x + 14 + (i % cols) * 86 + rnd.between(-5, 5);
    const cy = y + 12 + Math.floor(i / cols) * 46;
    if (cy + 36 > y + h) break;
    g.fillStyle(0xffffff, 0.95).fillRect(cx, cy, 62, 36);
  }
}

// ---------- 1스테이지: 본관 사무실 ----------

function office(g: G, label: Label, rnd: Phaser.Math.RandomDataGenerator, width: number): void {
  indoor(g, width, 0xe8e0cf, 0xb9bdc4, 0xa6abb3);

  // 구역 1: 민원 창구
  g.fillStyle(0x6f523a).fillRect(70, 196, 820, 14);
  g.fillStyle(0x8c6a4a).fillRect(80, 210, 800, 84);
  for (let i = 0; i < 3; i++) {
    const x = 120 + i * 260;
    g.fillStyle(0xcfe6f3, 0.85).fillRect(x, 92, 200, 104);
    g.lineStyle(3, 0x7b8794, 1).strokeRect(x, 92, 200, 104);
    label(x + 100, 228, `창구 ${i + 1}`, 15, '#f6efe0');
  }
  label(480, 74, '민원 창구', 26);
  g.fillStyle(0x111318).fillRect(780, 30, 120, 44);
  label(840, 52, '대기 087', 18, '#ff4d4d');
  g.fillStyle(0xffffff).fillCircle(680, 50, 24);
  g.lineStyle(3, 0x333333, 1).strokeCircle(680, 50, 24);
  // 4시 52분: 분침은 52분 자리, 시침은 5시 가까이
  g.lineStyle(3, 0x333333, 1).lineBetween(680, 50, 667, 38).lineBetween(680, 50, 686, 61);
  label(680, 84, '16:52', 13);

  // 구역 2: 본관 복도
  board(g, rnd, 1060, 70, 280, 150, 9);
  label(1200, 240, '공지 게시판', 18);
  door(g, label, 1480, '회의실');
  g.fillStyle(0xcfe6f3, 0.85).fillRect(1700, 70, 170, 120);
  g.lineStyle(3, 0x7b8794, 1).strokeRect(1700, 70, 170, 120);

  // 구역 3: 행정실
  label(2400, 74, '행정실', 26);
  for (let i = 0; i < 3; i++) {
    const x = 2010 + i * 260;
    g.fillStyle(0x2b2f38).fillRect(x + 64, 178, 72, 50);
    g.fillStyle(0x7fb3d5).fillRect(x + 69, 183, 62, 38);
    g.fillStyle(0x2b2f38).fillRect(x + 94, 228, 12, 10);
    g.fillStyle(0x6f523a).fillRect(x, 236, 200, 12);
    g.fillStyle(0x8c6a4a).fillRect(x + 10, 248, 180, 46);
    g.fillStyle(0xffffff).fillRect(x + 20, 226, 30, 10).fillRect(x + 150, 222, 26, 14);
  }
  g.fillStyle(0x8a929c).fillRect(2800, 120, 60, 172);
  g.lineStyle(2, 0x5f6670, 1);
  for (let k = 0; k < 4; k++) g.strokeRect(2806, 128 + k * 40, 48, 34);

  // 구역 4: 학생 상담실 (공지 게시판이 가득한데 아무도 안 읽는다)
  label(3460, 60, '학생 상담실', 24);
  board(g, rnd, 2960, 76, 360, 156, 12);
  g.fillStyle(0xd0202f).fillRect(2990, 240, 300, 34);
  label(3140, 257, '공지 꼭 읽어 주세요!', 18, '#ffffff');
  door(g, label, 3560, '상담실');
  for (const cx of [3420, 3480]) {
    g.fillStyle(0x3d5a80).fillRect(cx, 240, 44, 30);
    g.fillStyle(0x34495e).fillRect(cx, 270, 6, 22).fillRect(cx + 38, 270, 6, 22);
  }
}

// ---------- 2스테이지: 도서관 → 교양관 ----------

function shelf(g: G, rnd: Phaser.Math.RandomDataGenerator, x: number, w: number): void {
  g.fillStyle(0x6f4e37).fillRect(x, 92, w, 200);
  const spines = [0xb91c1c, 0x1d4ed8, 0x15803d, 0xa16207, 0x6d28d9, 0x334155, 0xbe185d];
  for (let row = 0; row < 4; row++) {
    const y = 98 + row * 48;
    g.fillStyle(0x4b3425).fillRect(x, y + 42, w, 6);
    for (let bx = x + 6; bx < x + w - 10; bx += rnd.between(9, 14)) {
      g.fillStyle(spines[rnd.between(0, spines.length - 1)]).fillRect(bx, y + rnd.between(4, 12), rnd.between(7, 11), 34);
    }
  }
}

function library(g: G, label: Label, rnd: Phaser.Math.RandomDataGenerator, width: number): void {
  // 도서관(0~1920)은 나무 바닥, 교양관(1920~)은 타일 바닥
  indoor(g, width, 0xeae3d3, 0xb9bdc4, 0xa6abb3);
  g.fillStyle(0xc9a77c).fillRect(0, 302, 1920, 238);
  g.lineStyle(2, 0xb08c5e, 1);
  for (const y of [330, 368, 414, 470, 532]) g.lineBetween(0, y, 1920, y);
  for (let x = 0; x < 1920; x += 160) g.lineBetween(x, 302, x - 60, 540);

  // 구역 1: 열람실
  label(480, 68, '도서관 열람실 · 정숙', 22);
  for (const x of [40, 250, 640, 850]) shelf(g, rnd, x, 170);
  g.fillStyle(0x8c6a4a).fillRect(430, 236, 180, 14);
  g.fillStyle(0x6f523a).fillRect(440, 250, 10, 44).fillRect(590, 250, 10, 44);
  g.fillStyle(0xfff3b0).fillRect(470, 224, 34, 12).fillRect(540, 222, 30, 14);

  // 구역 2: 도서관 로비
  label(1440, 68, '도서관 로비', 22);
  g.fillStyle(0xcfe6f3, 0.85).fillRect(1050, 96, 280, 150);
  g.lineStyle(3, 0x7b8794, 1).strokeRect(1050, 96, 280, 150);
  g.lineBetween(1190, 96, 1190, 246);
  for (let i = 0; i < 3; i++) {
    const x = 1360 + i * 90;
    g.fillStyle(0x9aa3ad).fillRect(x, 220, 20, 74);
    g.fillStyle(0x4b5563).fillRect(x + 20, 246, 50, 8);
  }
  g.fillStyle(0x8c6a4a).fillRect(1660, 210, 220, 84);
  g.fillStyle(0x6f523a).fillRect(1650, 198, 240, 14);
  label(1770, 240, '안내', 18, '#f6efe0');

  // 구역 3: 교양관 복도
  label(2400, 68, '교양관', 22);
  door(g, label, 1990, '101호');
  door(g, label, 2300, '102호');
  door(g, label, 2610, '103호');
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0x64748b).fillRect(2140 + i * 22, 150, 20, 142);
    g.fillStyle(0x94a3b8).fillRect(2146 + i * 22, 162, 8, 3);
  }

  // 구역 4: 강의실 앞 (과제 제출함)
  label(3360, 68, '강의실 앞', 22);
  door(g, label, 2980, '강의실');
  g.fillStyle(0xd0202f).fillRect(3240, 200, 120, 92);
  g.fillStyle(0x111318).fillRect(3260, 214, 80, 8);
  label(3300, 250, '과제 제출함', 15, '#ffffff');
  g.fillStyle(0xffffff).fillCircle(3560, 120, 34);
  g.lineStyle(4, 0x333333, 1).strokeCircle(3560, 120, 34);
  g.lineStyle(4, 0xd0202f, 1).lineBetween(3560, 120, 3560, 92);
  g.lineStyle(4, 0x333333, 1).lineBetween(3560, 120, 3578, 132);
  label(3560, 170, '마감 1분 전', 15, '#d0202f');
  board(g, rnd, 3640, 80, 180, 140, 6);
}

// ---------- 3스테이지: 정문 (야외) ----------

function tree(g: G, x: number, y: number): void {
  g.fillStyle(0x6b4a2f).fillRect(x - 8, y - 70, 16, 70);
  g.fillStyle(0x2f6b3a).fillCircle(x, y - 96, 44);
  g.fillStyle(0x3f8a4c).fillCircle(x - 18, y - 110, 26);
}

function gate(g: G, label: Label, rnd: Phaser.Math.RandomDataGenerator, width: number): void {
  // 해 질 녘 하늘
  const bands = [0x9cc4e4, 0xb9d2e6, 0xe8d6b8, 0xf6c58f, 0xf2a96b];
  bands.forEach((c, i) => g.fillStyle(c).fillRect(0, i * 52, width, 54));
  g.fillStyle(0xfff1c1, 0.9).fillCircle(width - 400, 210, 40);
  // 먼 건물 실루엣
  for (let x = 0; x < width; x += rnd.between(90, 160)) {
    const h = rnd.between(60, 140);
    g.fillStyle(0x7c6f86, 0.55).fillRect(x, 270 - h, rnd.between(70, 130), h);
  }
  // 보도
  g.fillStyle(0x8f8576).fillRect(0, 268, width, 34);
  g.fillStyle(0xc8c2b6).fillRect(0, 302, width, 238);
  g.lineStyle(2, 0xb3ac9f, 1);
  for (const y of [330, 366, 412, 468, 532]) g.lineBetween(0, y, width, y);
  for (let x = -80; x < width + 80; x += 80) g.lineBetween(x, 302, x - 50, 540);

  // 구역 1: 캠퍼스 길
  label(480, 68, '캠퍼스 길', 22, '#3b2f4a');
  for (const x of [80, 330, 600, 880]) tree(g, x, 290);
  g.fillStyle(0x6f523a).fillRect(180, 262, 100, 10);
  g.fillStyle(0x4b3425).fillRect(186, 272, 8, 20).fillRect(266, 272, 8, 20);
  for (const x of [470, 760]) {
    g.fillStyle(0x374151).fillRect(x, 150, 8, 142);
    g.fillStyle(0xfde68a).fillRect(x - 10, 140, 28, 14);
  }

  // 구역 2: 학생회관 앞 (게시물이 붙은 벽)
  label(1440, 68, '학생회관 앞', 22, '#3b2f4a');
  g.fillStyle(0xb7a99a).fillRect(1000, 80, 880, 212);
  g.lineStyle(3, 0x8f8576, 1).strokeRect(1000, 80, 880, 212);
  for (let i = 0; i < 6; i++) g.fillStyle(0xcfe6f3, 0.9).fillRect(1040 + i * 140, 100, 90, 70);
  g.fillStyle(0x6b4a2f).fillRect(1380, 190, 120, 102);
  label(1440, 182, '학생회관', 16, '#3b2f4a');
  const posters = [0xfca5a5, 0xfde68a, 0xa7f3d0, 0xbfdbfe, 0xddd6fe];
  for (let i = 0; i < 10; i++) {
    const x = 1030 + i * 30 + (i > 4 ? 520 : 0);
    g.fillStyle(posters[i % posters.length]).fillRect(x, 200 + (i % 2) * 14, 24, 32);
  }

  // 구역 3: 정문 광장
  label(2400, 68, '정문 광장', 22, '#3b2f4a');
  g.fillStyle(0x9ca3af).fillEllipse(2400, 262, 260, 40);
  g.fillStyle(0x7dd3fc).fillEllipse(2400, 258, 220, 28);
  for (const x of [2020, 2780]) tree(g, x, 290);
  g.fillStyle(0x4b5563).fillRect(2200, 120, 6, 150).fillRect(2594, 120, 6, 150);
  g.fillStyle(0x2f6fd1).fillRect(2206, 124, 40, 26);
  g.fillStyle(0xd0202f).fillRect(2600, 124, 40, 26);

  // 구역 4: 정문 (특정 건물을 본뜨지 않은 돌기둥 두 개)
  label(3360, 68, '정문', 26, '#3b2f4a');
  for (const x of [3010, 3610]) {
    g.fillStyle(0x9a8f80).fillRect(x, 70, 90, 222);
    g.lineStyle(3, 0x6f6658, 1).strokeRect(x, 70, 90, 222);
    for (let k = 0; k < 5; k++) g.lineBetween(x, 110 + k * 36, x + 90, 110 + k * 36);
  }
  g.fillStyle(0x6f6658).fillRect(3010, 56, 690, 22);
  g.fillStyle(0x2f8f4e).fillRect(3700, 200, 120, 34);
  label(3760, 217, '퇴근 →', 18, '#ffffff');
}
