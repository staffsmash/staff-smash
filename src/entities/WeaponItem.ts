import Phaser from 'phaser';
import { FONT } from '../config';
import { createWeaponIcon } from './rigs';
import { WEAPONS, type WeaponId } from './weapons';

/** 바닥에 놓인 무기. 위에 서서 L(또는 맨손 공격)을 누르면 줍는다. */
export class WeaponItem {
  readonly id: WeaponId;
  readonly x: number;
  readonly y: number;
  removed = false;
  private t = Math.random() * 6;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, id: WeaponId, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.obj = createWeaponIcon(scene, id);
    this.shadow = scene.add.ellipse(x, y, 46, 10, 0x000000, 0.25).setDepth(-5);
    this.label = scene.add
      .text(x, y - 40, WEAPONS[id].name, {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#111318',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt;
    this.obj.setPosition(this.x, this.y - 14 - Math.sin(this.t * 4) * 3).setDepth(this.y);
    this.label.setDepth(this.y + 0.5).setAlpha(0.6 + Math.sin(this.t * 4) * 0.3);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
