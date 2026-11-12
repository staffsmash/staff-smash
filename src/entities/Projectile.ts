import Phaser from 'phaser';
import type { Fighter } from './Fighter';

// 날아가는 물체: 보스의 "?" 질문, 서류·요구안, 확성기 음파, 플레이어가 던진 무기.
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
  /** 사원증: 던진 사람에게 돌아온다 */
  returnTo?: Fighter;
  /** 마감 서류 뭉치: 맞거나 멈추면 터진다 */
  explodes?: boolean;
}

export class Projectile {
  x: number;
  y: number;
  readonly z: number;
  vx: number;
  readonly owner: 'player' | 'enemy';
  readonly dmg: number;
  readonly knockdown: boolean;
  readonly tag: string | undefined;
  readonly halfW: number;
  readonly returnTo: Fighter | undefined;
  readonly explodes: boolean;
  removed = false;
  returning = false;
  /** 한 번 지나가며 이미 맞힌 대상 (사원증은 가고 올 때 각각 한 번씩) */
  readonly hitSet = new Set<Fighter>();
  private ttl: number;
  private readonly v0: number;
  private readonly spin: number;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, o: ProjectileOpts) {
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    this.vx = o.vx;
    this.v0 = o.vx;
    this.owner = o.owner;
    this.dmg = o.dmg;
    this.knockdown = o.knockdown;
    this.tag = o.tag;
    this.halfW = o.halfW;
    this.ttl = o.ttl;
    this.spin = o.spin ?? 0;
    this.returnTo = o.returnTo;
    this.explodes = !!o.explodes;
    this.obj = o.obj;
    this.shadow = scene.add.ellipse(o.x, o.y, o.halfW * 1.4, 8, 0x000000, 0.22).setDepth(-5);
    this.sync();
  }

  get expired(): boolean {
    return this.ttl <= 0;
  }

  update(dt: number): void {
    const back = this.returnTo;
    if (back) {
      // 앞으로 날아가며 느려지다가 방향을 바꿔 던진 사람에게 돌아온다
      if (!this.returning) {
        this.vx -= Math.sign(this.v0) * 1500 * dt;
        if (Math.sign(this.vx) !== Math.sign(this.v0)) {
          this.returning = true;
          this.hitSet.clear();
        }
      } else {
        const dir = Math.sign(back.x - this.x) || 1;
        this.vx = dir * Math.min(720, Math.abs(this.vx) + 1600 * dt);
        this.y += (back.y - this.y) * Math.min(1, dt * 8);
      }
    }
    this.x += this.vx * dt;
    this.ttl -= dt;
    this.obj.rotation += this.spin * dt;
    this.sync();
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
