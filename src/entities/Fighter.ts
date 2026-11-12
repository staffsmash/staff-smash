import Phaser from 'phaser';
import { FLOOR_BOTTOM, FLOOR_TOP, GRAVITY } from '../config';
import type { Rig } from './Rig';

// 벨트스크롤 좌표: x = 좌우, y = 깊이(바닥 위 발 위치), z = 높이(점프).
// 화면에는 (x, y - z)에 그리고, 그림자는 (x, y)에 그린다. 판정은 그림자 기준이다.

export interface HitInfo {
  dmg: number;
  /** 맞는 쪽이 밀려나는 방향 (+1 = 오른쪽) */
  dir: number;
  kb: number;
  knockdown: boolean;
  /** 무적 시간을 무시한다 (필살기) */
  force?: boolean;
}

export abstract class Fighter {
  x: number;
  y: number;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  facing = 1;
  hp: number;
  maxHp: number;
  stateT = 0;
  invuln = 0;
  removed = false;
  readonly rig: Rig;
  readonly shadow: Phaser.GameObjects.Ellipse;
  abstract readonly halfW: number;
  abstract readonly height: number;

  constructor(scene: Phaser.Scene, x: number, y: number, rig: Rig, hp: number, shadowW: number) {
    this.x = x;
    this.y = y;
    this.rig = rig;
    this.hp = hp;
    this.maxHp = hp;
    this.shadow = scene.add.ellipse(x, y, shadowW, shadowW * 0.28, 0x000000, 0.28).setDepth(-5);
  }

  abstract get hittable(): boolean;
  abstract takeHit(h: HitInfo): boolean;

  get grounded(): boolean {
    return this.z <= 0 && this.vz <= 0;
  }

  /** 속도를 적용한다. 이번 프레임에 착지했으면 true. */
  protected integrate(dt: number): boolean {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    let landed = false;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        landed = true;
      }
    }
    this.y = Phaser.Math.Clamp(this.y, FLOOR_TOP, FLOOR_BOTTOM);
    return landed;
  }

  sync(): void {
    const root = this.rig.root;
    root.setPosition(Math.round(this.x), Math.round(this.y - this.z));
    root.scaleX = this.facing;
    root.setDepth(this.y);
    root.alpha = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0 ? 0.45 : 1;
    this.shadow.setPosition(this.x, this.y);
    this.shadow.setScale(1 - Math.min(this.z, 160) / 320);
  }

  destroy(): void {
    this.rig.destroy();
    this.shadow.destroy();
    this.removed = true;
  }
}
