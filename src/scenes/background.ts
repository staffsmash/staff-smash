import Phaser from 'phaser';
import { FONT } from '../config';

// 1스테이지 배경: 민원 창구 → 본관 복도 → 행정실 → 학생 상담실.
// 서울캠퍼스 분위기만 빌리고 실제 건물을 본뜨지 않는다. 구역 하나 = 화면 한 장(960px).

export function drawBackground(scene: Phaser.Scene, width: number): void {
  const g = scene.add.graphics().setDepth(-100);
  const label = (x: number, y: number, text: string, size = 18, color = '#3b3326') =>
    scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5)
      .setDepth(-99);
  const rnd = new Phaser.Math.RandomDataGenerator(['staff-smash']);

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
  label(480, 74, '민원 창구', 26);
  g.fillStyle(0x111318).fillRect(780, 30, 120, 44);
  label(840, 52, '대기 087', 18, '#ff4d4d');
  g.fillStyle(0xffffff).fillCircle(680, 50, 24);
  g.lineStyle(3, 0x333333, 1).strokeCircle(680, 50, 24);
  // 4시 52분: 분침은 52분 자리, 시침은 5시 가까이
  g.lineStyle(3, 0x333333, 1).lineBetween(680, 50, 667, 38).lineBetween(680, 50, 686, 61);
  label(680, 84, '16:52', 13);

  // 구역 2: 본관 복도
  g.fillStyle(0xc79a62).fillRect(1060, 70, 280, 150);
  g.lineStyle(4, 0x7a5b3e, 1).strokeRect(1060, 70, 280, 150);
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

  // 구역 3: 행정실 (책상, 모니터, 서류함)
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
  g.fillStyle(0xc79a62).fillRect(2960, 76, 360, 156);
  g.lineStyle(4, 0x7a5b3e, 1).strokeRect(2960, 76, 360, 156);
  for (let i = 0; i < 12; i++) {
    g.fillStyle(0xffffff, 0.95).fillRect(2972 + (i % 4) * 86 + rnd.between(-5, 5), 88 + Math.floor(i / 4) * 46, 64, 38);
  }
  g.fillStyle(0xd0202f).fillRect(2990, 240, 300, 34);
  label(3140, 257, '공지 꼭 읽어 주세요!', 18, '#ffffff');
  g.fillStyle(0x8b6b4e).fillRect(3560, 92, 130, 200);
  g.lineStyle(3, 0x5d4632, 1).strokeRect(3560, 92, 130, 200);
  g.fillStyle(0xffffff).fillRect(3580, 112, 90, 28);
  label(3625, 126, '상담실', 15);
  for (const cx of [3420, 3480]) {
    g.fillStyle(0x3d5a80).fillRect(cx, 240, 44, 30);
    g.fillStyle(0x34495e).fillRect(cx, 270, 6, 22).fillRect(cx + 38, 270, 6, 22);
  }
}
