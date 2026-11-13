import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { DEPTH_RANGE, FLOOR_BOTTOM, FLOOR_TOP, FONT, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createBubbleRig } from './rigs';
import { createCancelBotRig } from './studentRigs';
import * as fx from '../fx';

// 잡몹 "교수님이 된다고 했는데요" 말풍선(학생 모드: "휴강 공지 봇"): 떠다니다가 같은 깊이에 맞춰
// 부르르 떤 뒤 가로로 빠르게 들이받는다. 가벼워서 넘어지지 않고 "펑" 터진다.

const S = stats.bubble;
const HOVER_Z = 24;

export class BubbleEnemy extends Enemy {
  readonly kind = 'bubble' as const;
  readonly halfW = 50;
  readonly height = 44;
  readonly light = true;
  defeatText = '펑!';
  private hitDone = false;
  private chargeDist = 0;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, scene.studentMode ? createCancelBotRig(scene) : createBubbleRig(scene), S.hp, 72, enterTargetX);
    this.z = HOVER_Z;
    this.text = scene.add
      .text(x, y, scene.studentMode ? '[알림] 오늘\n휴강입니다?' : '교수님이\n된다고 했는데요', {
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#111318',
        align: 'center',
      })
      .setOrigin(0.5)
      .setLineSpacing(-2);
    this.sync();
  }

  /** 중력 없이 떠다닌다 */
  protected move(dt: number): boolean {
    this.x += this.vx * dt;
    this.y = Phaser.Math.Clamp(this.y + this.vy * dt, FLOOR_TOP, FLOOR_BOTTOM);
    const targetZ = HOVER_Z + Math.sin(this.scene.time.now / 250 + this.uid) * 4;
    this.z += (targetZ - this.z) * Math.min(1, dt * 6);
    return false;
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        this.facing = dx >= 0 ? 1 : -1;
        const wantX = player.x + (dx >= 0 ? -1 : 1) * 230;
        this.vx = Math.abs(wantX - this.x) > 8 ? Math.sign(wantX - this.x) * S.speedX : 0;
        this.vy = Math.abs(dy) > 5 ? Math.sign(dy) * S.speedY : 0;
        if (
          player.targetable &&
          this.cooldown <= 0 &&
          Math.abs(dy) < 14 &&
          Math.abs(dx) < 330 &&
          this.scene.takeToken(this)
        ) {
          this.set('aim');
          this.vx = 0;
          this.vy = 0;
        }
        break;
      }
      case 'aim':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.5) {
          this.set('charge');
          this.hitDone = false;
          this.chargeDist = 0;
          this.vx = this.facing * S.chargeV;
        }
        break;
      case 'charge': {
        this.chargeDist += Math.abs(this.vx) * dt;
        if (!this.hitDone) {
          const ddx = Math.abs(player.x - this.x);
          if (ddx <= this.halfW + player.halfW && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 50) {
            if (player.takeHit({ dmg: 1, dir: this.facing, kb: 200, knockdown: false })) {
              this.hitDone = true;
              fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
            }
          }
        }
        const left = this.scene.cameras.main.scrollX;
        const atEdge = this.x <= left + 24 || this.x >= left + GAME_W - 24;
        if (this.chargeDist > 460 || atEdge) {
          this.vx = 0;
          this.set('recover');
        }
        break;
      }
      case 'recover':
        if (this.stateT >= 0.5) {
          this.scene.releaseToken(this);
          this.cooldown = 1.6 + Math.random();
          this.set('approach');
        }
        break;
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    if (this.state === 'aim') {
      sharp = 40;
      p.body = Math.sin(this.stateT * 70) * 0.08;
    } else if (this.state === 'charge') {
      p.body = 0.18;
    } else if (this.state === 'hurt') {
      sharp = 30;
      p.body = -0.3;
    }
    this.rig.update(dt, p, sharp);
  }

  protected afterSync(): void {
    if (this.state === 'dying') {
      const s = Math.max(0.1, 1 - this.stateT * 1.6);
      this.rig.root.setScale(this.facing * s, s);
      this.text.setScale(s);
    }
    this.text
      .setPosition(this.x + this.facing * 2, this.y - this.z - 22)
      .setDepth(this.y + 0.6)
      .setVisible(this.rig.root.visible);
  }

  destroy(): void {
    this.text.destroy();
    super.destroy();
  }
}
