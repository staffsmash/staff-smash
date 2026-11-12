import Phaser from 'phaser';

// 위에서 떨어지는 물체: 총장실 "지시 사항"(적 편), 필살기 "규정집 낙하"(플레이어 편).
// 바닥의 빨간(또는 파란) 표시가 점점 커지다가 delay초에 떨어진다. 피해 판정은 StageScene이 한다.

const START_Z = 420;
const FALL_TIME = 0.32;

export interface HazardOpts {
  x: number;
  y: number;
  delay: number;
  radius: number;
  owner: 'player' | 'enemy';
  dmg: number;
  obj: Phaser.GameObjects.Container;
}

export class Hazard {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly owner: 'player' | 'enemy';
  readonly dmg: number;
  removed = false;
  /** 이번 프레임에 땅에 닿았다 */
  justLanded = false;
  private t = 0;
  private landed = false;
  private readonly delay: number;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly warn: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, o: HazardOpts) {
    this.x = o.x;
    this.y = o.y;
    this.radius = o.radius;
    this.owner = o.owner;
    this.dmg = o.dmg;
    this.delay = o.delay;
    this.obj = o.obj;
    const color = o.owner === 'enemy' ? 0xd0202f : 0x2f6fd1;
    this.warn = scene.add.ellipse(o.x, o.y, o.radius * 2, o.radius * 0.7, color, 0.3).setDepth(-4).setScale(0.2);
    this.obj.setVisible(false);
  }

  update(dt: number): void {
    this.justLanded = false;
    this.t += dt;
    if (!this.landed) {
      this.warn.setScale(Math.min(1, 0.2 + (this.t / this.delay) * 0.8));
      const fallStart = this.delay - FALL_TIME;
      if (this.t >= fallStart) {
        const k = Math.min(1, (this.t - fallStart) / FALL_TIME);
        this.obj.setVisible(true).setPosition(this.x, this.y - START_Z * (1 - k) - 14).setDepth(this.y + 1);
      }
      if (this.t >= this.delay) {
        this.landed = true;
        this.justLanded = true;
        this.warn.destroy();
      }
    } else if (this.t >= this.delay + 0.6) {
      this.obj.alpha = Math.max(0, 1 - (this.t - this.delay - 0.6) / 0.3);
      if (this.t >= this.delay + 0.9) this.destroy();
    }
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    if (this.warn.active) this.warn.destroy();
  }
}
