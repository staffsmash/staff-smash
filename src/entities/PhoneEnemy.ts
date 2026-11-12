import Phaser from 'phaser';
import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createPhoneRig } from './rigs';
import * as fx from '../fx';

// 잡몹 "울리는 전화기": 바닥의 빨간 그림자 자리로 떨어진 뒤,
// 주기적으로 울리며 주변을 친다. 울리기 직전에 부르르 떤다. 공격하면 "받는다".

const S = stats.phone;
const DROP_HOLD = 0.45;

export class PhoneEnemy extends Enemy {
  readonly kind = 'phone' as const;
  readonly halfW = 28;
  readonly height = 44;
  readonly usesToken = false;
  defeatText = '네, 행정실입니다~';
  private ringT = 1.6;
  private warn: Phaser.GameObjects.Ellipse | null;

  constructor(scene: StageScene, x: number, y: number) {
    super(scene, x, y, createPhoneRig(scene), S.hp, 56, x);
    this.state = 'drop';
    this.resumeState = 'ring';
    this.z = 460;
    this.warn = scene.add.ellipse(x, y, 60, 18, 0xd0202f, 0.35).setDepth(-4).setScale(0.3);
    this.sync();
  }

  protected move(dt: number): boolean {
    if (this.state === 'drop' && this.stateT < DROP_HOLD) return false;
    const landed = this.integrate(dt);
    if (landed && this.state === 'drop') this.land();
    return landed;
  }

  private land(): void {
    const p = this.scene.player;
    this.warn?.destroy();
    this.warn = null;
    fx.dust(this.scene, this.x, this.y);
    this.scene.cameras.main.shake(70, 0.004);
    if (Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 24 && p.z < 30) {
      p.takeHit({ dmg: 1, dir: p.x >= this.x ? 1 : -1, kb: 160, knockdown: false });
    }
    this.set('ring');
    this.ringT = 1.4;
    this.say('따르릉!', 0.8);
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'drop':
        this.vx = 0;
        this.vy = 0;
        this.warn?.setScale(Math.min(1, 0.3 + this.stateT * 0.9));
        break;
      case 'ring': {
        this.ringT -= dt;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = Math.abs(dx) > 30 ? Math.sign(dx) * 22 : 0;
        this.vy = Math.abs(dy) > 6 ? Math.sign(dy) * 16 : 0;
        if (this.ringT <= 0) {
          this.ringT = S.ringEvery;
          fx.ringWave(this.scene, this.x, this.y);
          this.say('따르릉!', 0.6);
          if (Math.abs(dx) < 78 && Math.abs(dy) < 28 && player.z < 30) {
            player.takeHit({ dmg: 1, dir: dx >= 0 ? 1 : -1, kb: 150, knockdown: false });
          }
        }
        break;
      }
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    switch (this.state) {
      case 'ring': {
        const tremble = this.ringT < 0.6;
        const t = this.scene.time.now / 1000;
        p.body = tremble ? Math.sin(t * 70) * 0.12 : 0;
        p.bob = tremble ? -Math.abs(Math.sin(t * 50)) * 3 : 0;
        const moving = this.vx !== 0 || this.vy !== 0;
        p.legF = moving ? Math.sin(t * 14) * 0.5 : 0;
        p.legB = -p.legF;
        sharp = 30;
        break;
      }
      case 'hurt':
        sharp = 30;
        p.body = -0.35;
        break;
      case 'down':
      case 'dying':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.2;
        p.bob = this.grounded ? -24 : 0;
        break;
      case 'getup':
        p.body = -0.5;
        break;
    }
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.warn?.destroy();
    this.warn = null;
    super.destroy();
  }
}
