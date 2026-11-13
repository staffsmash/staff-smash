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

/** 나란히 붙은 탭 (교직원 모드 / 학생 모드). 고른 탭은 파란 바탕 + 흰 테두리. 돌려주는 함수로 고른 탭을 바꾼다. */
export function makeTabs(
  scene: Phaser.Scene,
  cx: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  onPick: (i: number) => void,
): (active: number) => void {
  const gap = 8;
  const x0 = cx - ((w + gap) * labels.length - gap) / 2 + w / 2;
  const tabs = labels.map((label, i) => {
    const bg = scene.add.rectangle(x0 + i * (w + gap), y, w, h, 0x2a3346).setInteractive({ useHandCursor: true });
    const text = scene.add
      .text(bg.x, y, label, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    bg.on('pointerup', () => onPick(i));
    return { bg, text };
  });
  const set = (active: number): void => {
    tabs.forEach(({ bg, text }, i) => {
      const on = i === active;
      bg.setFillStyle(on ? 0x2f6fd1 : 0x2a3346).setStrokeStyle(on ? 2 : 1, on ? 0xffffff : 0x5b6478);
      text.setColor(on ? '#ffffff' : '#9aa3b5');
    });
  };
  return set;
}

/** 장면 전환 (페이드) */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(200, 0, 0, 0);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
