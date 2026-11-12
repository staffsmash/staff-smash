import Phaser from 'phaser';
import { FONT } from '../config';

// M0용 회색 상자 배경: 본관 사무실 → 복도 → 현관. 실제 건물을 본뜨지 않는다.

export function drawBackground(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-100);
  const label = (x: number, y: number, text: string, size = 18, color = '#3b3326') =>
    scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(-99);

  // 벽과 바닥
  g.fillStyle(0xe8e0cf).fillRect(0, 0, width, 300);
  g.fillStyle(0xd8cdb6).fillRect(0, 0, width, 24);
  g.fillStyle(0x7a5b3e).fillRect(0, 292, width, 10);
  g.fillStyle(0xb9bdc4).fillRect(0, 302, width, 238);
  g.lineStyle(2, 0xa6abb3, 1);
  for (const y of [328, 364, 410, 466, 532]) g.lineBetween(0, y, width, y);
  for (let x = -120; x < width + 120; x += 120) g.lineBetween(x, 302, x - 70, 540);

  // 구역 1: 민원 창구
  g.fillStyle(0x6f523a).fillRect(70, 196, 820, 14);
  g.fillStyle(0x8c6a4a).fillRect(80, 210, 800, 84);
  for (let i = 0; i < 3; i++) {
    const x = 120 + i * 260;
    g.fillStyle(0xcfe6f3, 0.85).fillRect(x, 92, 200, 104);
    g.lineStyle(3, 0x7b8794, 1).strokeRect(x, 92, 200, 104);
    label(x + 100, 228, `창구 ${i + 1}`, 15, '#f6efe0');
  }
  label(480, 56, '민원 창구', 26);
  g.fillStyle(0x111318).fillRect(780, 30, 120, 44);
  label(840, 52, '대기 087', 18, '#ff4d4d');
  g.fillStyle(0xffffff).fillCircle(680, 50, 24);
  g.lineStyle(3, 0x333333, 1).strokeCircle(680, 50, 24);
  g.lineStyle(3, 0x333333, 1).lineBetween(680, 50, 680, 32).lineBetween(680, 50, 693, 56);
  label(680, 84, '17:52', 13);

  // 구역 2: 본관 복도
  g.fillStyle(0xc79a62).fillRect(1060, 70, 280, 150);
  g.lineStyle(4, 0x7a5b3e, 1).strokeRect(1060, 70, 280, 150);
  const rnd = new Phaser.Math.RandomDataGenerator(['staff-smash']);
  for (let i = 0; i < 9; i++) {
    g.fillStyle(0xffffff, 0.95).fillRect(1074 + (i % 3) * 88 + rnd.between(-6, 6), 84 + Math.floor(i / 3) * 44, 62, 36);
  }
  label(1200, 240, '공지 게시판', 18);
  g.fillStyle(0x8b6b4e).fillRect(1480, 92, 130, 200);
  g.lineStyle(3, 0x5d4632, 1).strokeRect(1480, 92, 130, 200);
  g.fillStyle(0xd9c27a).fillCircle(1594, 196, 6);
  g.fillStyle(0xffffff).fillRect(1500, 112, 90, 28);
  label(1545, 126, '회의실', 15);
  g.fillStyle(0xcfe6f3, 0.85).fillRect(1700, 70, 170, 120);
  g.lineStyle(3, 0x7b8794, 1).strokeRect(1700, 70, 170, 120);

  // 구역 3: 본관 현관
  g.fillStyle(0x3d7a4f).fillRect(2052, 230, 36, 62);
  g.fillStyle(0x4f9a63).fillCircle(2070, 214, 34);
  g.fillStyle(0x5c6b78).fillRect(2480, 56, 340, 240);
  g.fillStyle(0xcfe8f5).fillRect(2492, 96, 154, 196);
  g.fillStyle(0xcfe8f5).fillRect(2654, 96, 154, 196);
  g.fillStyle(0x2f8f4e).fillRect(2540, 62, 220, 30);
  label(2650, 77, '출구 · 정시 퇴근', 16, '#ffffff');
}
