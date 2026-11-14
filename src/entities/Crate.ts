import Phaser from 'phaser';
import { createEarlyBox } from './rigs';
import { createCatalogStack } from './studentRigs';

// 부수면 먹을 것이 나오는 상자. 교직원 모드 "조기출근 박스"(골판지 상자), 학생 모드 "수강편람"(두꺼운 책자 더미).
// 적이 아니어서 구역 정리·콤보와 상관없다. 공격·던진 무기·폭발로 2~3번 치면 부서진다 (무엇이 나올지는 StageScene이 정한다).

const HP = 3;

export class Crate {
  readonly x: number;
  readonly y: number;
  readonly halfW = 30;
  readonly height = 54;
  removed = false;
  private hp = HP;
  private shakeT = 0;
  private readonly scene: Phaser.Scene;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly colors: number[];

  constructor(scene: Phaser.Scene, x: number, y: number, student: boolean) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.obj = student ? createCatalogStack(scene) : createEarlyBox(scene);
    this.colors = student ? [0x13707a, 0x1f3a6b, 0x7a1f2b, 0xf4f0e0] : [0xc8955a, 0xb07a40, 0xffffff, 0xe2cf9a];
    this.shadow = scene.add.ellipse(x, y, 70, 14, 0x000000, 0.28).setDepth(-5);
    this.obj.setPosition(x, y).setDepth(y);
  }

  /** 맞았다. 센 타격(2 이상)은 두 칸 깎인다. 이번에 부서졌으면 true */
  hit(dmg: number, dir: number): boolean {
    if (this.removed) return false;
    this.hp -= Phaser.Math.Clamp(Math.round(dmg), 1, 2);
    this.shakeT = 0.2;
    this.obj.setScale(1.08, 0.9);
    this.chips(dir, 3);
    if (this.hp > 0) return false;
    this.chips(dir, 8);
    this.destroy();
    return true;
  }

  /** 맞은 자리에서 튀는 조각 */
  private chips(dir: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const col = this.colors[i % this.colors.length];
      const r = this.scene.add
        .rectangle(this.x + Phaser.Math.Between(-20, 20), this.y - Phaser.Math.Between(14, 44), Phaser.Math.Between(6, 14), Phaser.Math.Between(4, 9), col)
        .setStrokeStyle(1, 0x1d1d22)
        .setDepth(this.y + 1);
      this.scene.tweens.add({
        targets: r,
        x: r.x + dir * Phaser.Math.Between(20, 90),
        y: r.y + Phaser.Math.Between(-40, 30),
        angle: Phaser.Math.Between(-200, 200),
        alpha: 0,
        duration: Phaser.Math.Between(320, 520),
        ease: 'Cubic.Out',
        onComplete: () => r.destroy(),
      });
    }
  }

  update(dt: number): void {
    if (this.removed) return;
    let dx = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      dx = Math.sin(this.shakeT * 90) * 3;
    }
    const sx = this.obj.scaleX + (1 - this.obj.scaleX) * Math.min(1, dt * 14);
    const sy = this.obj.scaleY + (1 - this.obj.scaleY) * Math.min(1, dt * 14);
    this.obj.setPosition(this.x + dx, this.y).setScale(sx, sy);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
  }
}
