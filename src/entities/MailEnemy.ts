import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createMailRig } from './rigs';
import * as fx from '../fx';

// 잡몹 "새벽 3시 메일": "!"를 띄운 뒤 돌진한다. 맞으면 잠깐 느려진다.

const S = stats.mail;

export class MailEnemy extends Enemy {
  readonly kind = 'mail' as const;
  readonly halfW = 28;
  readonly height = 58;
  private hitDone = false;
  private phase = Math.random() * 10;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createMailRig(scene), S.hp, 60, enterTargetX);
    this.sync();
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, 76, S.speedX, S.speedY);
        if (this.canStartAttack(player, dx, dy, 105)) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          fx.floatText(this.scene, this.x, this.y - 82, '!', '#ff4d4d', 26);
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.42) {
          this.set('lunge');
          this.hitDone = false;
          this.vx = this.facing * 440;
        }
        break;
      case 'lunge':
        if (!this.hitDone && this.meleeHit(player, 8, 1, 170)) {
          this.hitDone = true;
          player.applySlow(1.2);
        }
        if (this.stateT >= 0.22) this.set('recover');
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        if (this.stateT >= 0.45) {
          this.scene.releaseToken(this);
          this.cooldown = 1.0 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    switch (this.state) {
      case 'enter':
      case 'approach': {
        const moving = this.vx !== 0 || this.vy !== 0;
        this.phase += dt * (moving ? 14 : 4);
        const s = Math.sin(this.phase);
        p.legF = moving ? s * 0.6 : 0;
        p.legB = moving ? -s * 0.6 : 0;
        p.armF = -s * 0.5;
        p.armB = s * 0.5;
        p.bob = moving ? -Math.abs(s) * 6 : Math.sin(this.phase) * 1.5;
        break;
      }
      case 'windup':
        sharp = 30;
        p.body = -0.3 + Math.sin(this.stateT * 60) * 0.06;
        p.armF = -2.6;
        p.armB = -2.6;
        p.legF = -0.3;
        p.legB = 0.3;
        break;
      case 'lunge':
        sharp = 40;
        p.body = 0.4;
        p.armF = -1.5;
        p.armB = -1.5;
        p.legF = 0.5;
        p.legB = 0.7;
        break;
      case 'recover':
        p.body = 0.12;
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.38;
        p.armF = -0.8;
        p.armB = -0.8;
        break;
      case 'down':
      case 'dying':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.2;
        p.bob = this.grounded ? -28 : 0;
        p.armF = -2.5;
        p.armB = -2.5;
        break;
      case 'getup':
        p.body = -0.5;
        break;
    }
    this.rig.update(dt, p, sharp);
  }
}
