import Phaser from 'phaser';
import { FONT, GAME_W } from './config';

// 짧은 연출 모음. 모두 스스로 사라진다.

/** 맞은 자리에 찍히는 빨간 도장 */
export function stampMark(scene: Phaser.Scene, x: number, y: number, label = '처리'): void {
  const c = scene.add.container(x, y).setDepth(1500);
  const g = scene.add.graphics();
  g.lineStyle(3, 0xd0202f, 1);
  g.strokeCircle(0, 0, 21);
  g.lineStyle(1.5, 0xd0202f, 1);
  g.strokeCircle(0, 0, 16);
  const t = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#d0202f' })
    .setOrigin(0.5);
  c.add([g, t]);
  c.setRotation(Phaser.Math.FloatBetween(-0.5, 0.5));
  c.setScale(1.7);
  scene.tweens.add({ targets: c, scale: 1, duration: 90, ease: 'Back.Out' });
  scene.tweens.add({ targets: c, alpha: 0, delay: 260, duration: 220, onComplete: () => c.destroy() });
}

/** 플레이어가 맞았을 때의 충격 표시 */
export function hitSpark(scene: Phaser.Scene, x: number, y: number): void {
  const g = scene.add.graphics().setDepth(1500);
  g.fillStyle(0xffe066, 1);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 22 : 9;
    const a = (i / 16) * Math.PI * 2;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
  g.setPosition(x, y);
  scene.tweens.add({ targets: g, scale: 1.5, alpha: 0, duration: 200, onComplete: () => g.destroy() });
}

/** 위로 떠오르며 사라지는 글자 */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffffff', size = 18): void {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color,
      stroke: '#111318',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(1600);
  scene.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 800, ease: 'Cubic.Out', onComplete: () => t.destroy() });
}

/** 머리 위 말풍선 (위치는 쓰는 쪽이 매 프레임 맞춘다) */
export function speechText(scene: Phaser.Scene, text: string): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, text, {
      fontFamily: FONT,
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#111318',
      backgroundColor: '#ffffff',
      padding: { x: 7, y: 4 },
    })
    .setOrigin(0.5, 1)
    .setDepth(1700);
}

/** 전화벨 울림 파동 (학생 모드 결석 도장은 빨간 파동) */
export function ringWave(scene: Phaser.Scene, x: number, y: number, color = 0xffd34d): void {
  for (let i = 0; i < 2; i++) {
    const e = scene.add.ellipse(x, y - 4, 44, 16).setStrokeStyle(3, color, 1).setDepth(y + 1);
    scene.tweens.add({
      targets: e,
      scaleX: 3.6,
      scaleY: 3.6,
      alpha: 0,
      delay: i * 90,
      duration: 320,
      onComplete: () => e.destroy(),
    });
  }
}

/** 착지·다운 먼지 */
export function dust(scene: Phaser.Scene, x: number, y: number): void {
  for (const dir of [-1, 1]) {
    const e = scene.add.ellipse(x + dir * 10, y - 4, 22, 10, 0xd8d8d8, 0.7).setDepth(y + 1);
    scene.tweens.add({
      targets: e,
      x: x + dir * 36,
      scaleX: 1.6,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.Out',
      onComplete: () => e.destroy(),
    });
  }
}

/** 장면마다 마지막 안내 띠가 사라지는 시각 (scene.time.now 기준) */
const bannerEnds = new WeakMap<Phaser.Scene, number>();

/** 지금 안내 띠가 떠 있지 않은지 (덜 급한 안내를 겹치지 않게 띄울 때 쓴다) */
export function bannerFree(scene: Phaser.Scene): boolean {
  return scene.time.now >= (bannerEnds.get(scene) ?? 0);
}

/** 화면 위쪽 안내 띠 */
export function banner(scene: Phaser.Scene, title: string, sub?: string, hold = 1600): void {
  bannerEnds.set(scene, Math.max(bannerEnds.get(scene) ?? 0, scene.time.now + hold + 300));
  const c = scene.add.container(GAME_W / 2 + 40, 150).setDepth(1800);
  const bg = scene.add.rectangle(0, 0, 540, sub ? 88 : 60, 0x111827, 0.85).setStrokeStyle(2, 0xf5c542);
  const t = scene.add
    .text(0, sub ? -15 : 0, title, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff' })
    .setOrigin(0.5);
  c.add([bg, t]);
  if (sub) {
    c.add(scene.add.text(0, 22, sub, { fontFamily: FONT, fontSize: '16px', color: '#f5c542' }).setOrigin(0.5));
  }
  c.setScrollFactor(0, 0, true);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, x: GAME_W / 2, duration: 220, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: c, alpha: 0, delay: hold, duration: 300, onComplete: () => c.destroy() });
}
