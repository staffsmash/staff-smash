import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { FONT } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createSlipRig } from './rigs';

// 잡몹 "단체 문의 줄": 문의 쪽지 다섯 장이 줄줄이 이어져 다가오며 길을 막는다.
// 맨 앞 쪽지가 플레이어 쪽으로 가고, 나머지는 앞 쪽지를 따라간다. 부딪히면 밀려난다.

const S = stats.queue;
const GAP = 38;

export class QueueSlip extends Enemy {
  readonly kind = 'queue' as const;
  readonly halfW = 20;
  readonly height = 52;
  readonly usesToken = false;
  defeatText = '문의 답변 완료';
  ahead: QueueSlip | null;
  private phase = Math.random() * 10;
  private readonly tagText: Phaser.GameObjects.Text;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number, ahead: QueueSlip | null) {
    super(scene, x, y, createSlipRig(scene), S.hp, 44, enterTargetX);
    this.ahead = ahead;
    this.tagText = scene.add
      .text(x, y, '문의', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#d0202f' })
      .setOrigin(0.5);
    this.sync();
  }

  private get leader(): QueueSlip | null {
    let a = this.ahead;
    while (a && (a.dead || a.removed)) a = a.ahead;
    return a;
  }

  protected think(dt: number, player: Player): void {
    if (this.state !== 'approach') return;
    const front = this.leader;
    let tx: number;
    let ty: number;
    let speed = S.speed;
    if (!front) {
      tx = player.x;
      ty = player.y;
    } else {
      const dir = Math.sign(player.x - front.x) || 1;
      tx = front.x - dir * GAP;
      ty = front.y;
      speed *= 1.6;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    this.facing = player.x >= this.x ? 1 : -1;
    this.vx = Math.abs(dx) > 4 ? Math.sign(dx) * Math.min(speed, Math.abs(dx) / Math.max(dt, 0.001)) : 0;
    this.vy = Math.abs(dy) > 3 ? Math.sign(dy) * speed * 0.45 : 0;

    // 부딪히면 밀어낸다 (길을 막는다)
    const px = player.x - this.x;
    if (Math.abs(px) < this.halfW + player.halfW && Math.abs(player.y - this.y) < 18 && player.z < 20) {
      this.scene.bumpPlayer(this, px >= 0 ? 1 : -1);
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    if (this.state === 'down' || this.state === 'dying') {
      p.body = this.grounded ? -Math.PI / 2 : -1.1;
      p.bob = this.grounded ? -18 : 0;
      sharp = 14;
    } else if (this.state === 'hurt') {
      p.body = -0.35;
      sharp = 30;
    } else {
      this.phase += dt * 10;
      const s = Math.sin(this.phase);
      p.legF = s * 0.5;
      p.legB = -s * 0.5;
      p.armF = -s * 0.4;
      p.armB = s * 0.4;
      p.bob = -Math.abs(s) * 2;
    }
    this.rig.update(dt, p, sharp);
  }

  protected afterSync(): void {
    super.afterSync();
    this.tagText
      .setPosition(this.x, this.y - this.z - 26)
      .setDepth(this.y + 0.6)
      .setVisible(this.state !== 'down' && this.state !== 'dying');
  }

  destroy(): void {
    this.tagText.destroy();
    super.destroy();
  }
}
