import Phaser from 'phaser';

// 날아가는 물체: 보스의 "?" 질문, 플레이어가 던진 무기.
// 판정은 그림자(y) 기준이고, 높이(z)로 점프 회피를 가른다. 충돌 처리는 StageScene이 한다.

export interface ProjectileOpts {
  x: number;
  y: number;
  z: number;
  vx: number;
  owner: 'player' | 'enemy';
  dmg: number;
  knockdown: boolean;
  tag?: string;
  halfW: number;
  ttl: number;
  obj: Phaser.GameObjects.Container;
  spin?: number;
}

export class Projectile {
  x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly owner: 'player' | 'enemy';
  readonly dmg: number;
  readonly knockdown: boolean;
  readonly tag: string | undefined;
  readonly halfW: number;
  removed = false;
  private ttl: number;
  private readonly spin: number;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, o: ProjectileOpts) {
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    this.vx = o.vx;
    this.owner = o.owner;
    this.dmg = o.dmg;
    this.knockdown = o.knockdown;
    this.tag = o.tag;
    this.halfW = o.halfW;
    this.ttl = o.ttl;
    this.spin = o.spin ?? 0;
    this.obj = o.obj;
    this.shadow = scene.add.ellipse(o.x, o.y, o.halfW * 1.4, 8, 0x000000, 0.22).setDepth(-5);
    this.sync();
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.ttl -= dt;
    this.obj.rotation += this.spin * dt;
    this.sync();
    if (this.ttl <= 0) this.destroy();
  }

  private sync(): void {
    this.obj.setPosition(this.x, this.y - this.z).setDepth(this.y + 1);
    this.shadow.setPosition(this.x, this.y);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
  }
}
