import Phaser from 'phaser';
import { FONT } from '../config';

/** 마우스·터치로 누르는 사각 버튼 */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  color = 0x2f6fd1,
): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const hover = Phaser.Display.Color.ValueToColor(color).lighten(12).color;
  const bg = scene.add.rectangle(x, y, w, h, color).setStrokeStyle(2, 0x1d1d22).setInteractive({ useHandCursor: true });
  const text = scene.add
    .text(x, y, label, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#ffffff' })
    .setOrigin(0.5);
  bg.on('pointerover', () => bg.setFillStyle(hover));
  bg.on('pointerout', () => bg.setFillStyle(color));
  bg.on('pointerup', onClick);
  return { bg, text };
}

/** 장면 전환 (페이드) */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(200, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
