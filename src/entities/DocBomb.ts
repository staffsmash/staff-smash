import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { FONT } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createDocBombRig } from './rigs';
import { createAlarmClockRig } from './studentRigs';
import * as fx from '../fx';

// 잡몹 "마감 1분 전 서류 뭉치"(학생 모드: "마감 시계"): 째깍거리며 다가오다 시간이 다 되면 터진다.
// 치면 넘어지고, 넘어진 것은 L(줍기)로 집어 적에게 던져 되돌릴 수 있다.

const S = stats.docbomb;

export class DocBomb extends Enemy {
  readonly kind = 'docbomb' as const;
  readonly halfW = 24;
  readonly height = 46;
  readonly usesToken = false;
  readonly canRecheck = false;
  fuse = S.fuse;
  private phase = Math.random() * 10;
  private readonly timer: Phaser.GameObjects.Text;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, scene.studentMode ? createAlarmClockRig(scene) : createDocBombRig(scene), S.hp, 54, enterTargetX);
    this.timer = scene.add
      .text(x, y, '', {
        fontFamily: FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#d0202f',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 1);
    this.sync();
  }

  /** 넘어져 있어서 주울 수 있는지 */
  get pickable(): boolean {
    return this.state === 'knocked' && !this.removed;
  }

  protected think(dt: number, player: Player): void {
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.scene.explode(this.x, this.y, 95, { player: 2, enemies: 2 }, this.scene.studentMode ? '따르릉! 마감!' : '펑! 마감!');
      this.destroy();
      return;
    }
    if (this.state === 'approach') {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      this.facing = dx >= 0 ? 1 : -1;
      this.vx = Math.abs(dx) > 30 ? Math.sign(dx) * S.speedX : 0;
      this.vy = Math.abs(dy) > 6 ? Math.sign(dy) * S.speedY : 0;
    } else if (this.state === 'knocked') {
      this.vx *= Math.pow(0.01, dt);
      this.vy = 0;
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.removed) return false;
    this.rig.flash();
    this.set('knocked');
    this.stateT = 0;
    this.vx = h.dir * 220;
    this.vz = 180;
    if (this.fuse > 2) fx.floatText(this.scene, this.x, this.y - 70, 'L: 집어서 던지기!', '#ffe066', 15);
    return true;
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    if (this.state === 'knocked') {
      p.body = this.grounded ? -Math.PI / 2 : -1;
      p.bob = this.grounded ? -22 : 0;
      sharp = 18;
    } else {
      this.phase += dt * 12;
      const s = Math.sin(this.phase);
      p.legF = s * 0.6;
      p.legB = -s * 0.6;
      p.bob = -Math.abs(s) * 4;
      if (this.fuse < 2) p.body = Math.sin(this.scene.time.now / 30) * 0.12;
    }
    this.rig.update(dt, p, sharp);
  }

  protected afterSync(): void {
    const secs = Math.max(0, Math.ceil(this.fuse));
    this.timer
      .setText(`0:0${Math.min(9, secs)}`)
      .setPosition(this.x, this.y - this.z - this.height - 4)
      .setDepth(this.y + 0.6)
      .setScale(this.fuse < 2 ? 1 + Math.abs(Math.sin(this.scene.time.now / 80)) * 0.25 : 1);
  }

  destroy(): void {
    this.timer.destroy();
    super.destroy();
  }
}
