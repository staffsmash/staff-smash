import Phaser from 'phaser';
import { DEPTH_RANGE, FLOOR_BOTTOM, FLOOR_TOP, GAME_W } from '../config';
import type { Player } from './Player';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createChonghakRig, type ChonghakRole } from './rigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 창구 직원 권학생의 기믹 (2026-11-21 11차): "총학들 일로와봐" 하면 총학 집행부 학생 둘이 달려와
// 권학생 앞에 서서 면담을 받는다. 그동안 길이 좁아지고 던진 물건을 막는다. 닿으면 밀려날 뿐 아프지 않다.
// 총학은 학생 편이라 주인공을 공격하지 않는다. 5초 뒤 돌아간다. 적이 아니어서 구역 정리와 상관없다.

const LIFE = 5;
const RUN = 300;
/** ★ 면담 받는 동안 말풍선 */
export const AIDE_LINE = '면담 중…';

export class ChonghakAide {
  x: number;
  y: number;
  removed = false;
  readonly halfW = 22;
  private readonly scene: Phaser.Scene;
  private readonly rig: Rig;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly speech: Phaser.GameObjects.Text;
  private state: 'run' | 'stand' | 'leave' = 'run';
  private t = 0;
  private walk = 0;
  private facing = 1;
  private leaveDir = 1;

  /**
   * fromX에서 달려와 권학생(staff) 앞, 플레이어 쪽에 선다. 권학생이 움직이면 따라 선다.
   * slot: 0 = 앞쪽 위(깊이 -), 1 = 조금 더 앞쪽 아래(깊이 +)
   */
  constructor(
    scene: Phaser.Scene,
    role: ChonghakRole,
    fromX: number,
    private readonly staff: { readonly x: number; readonly y: number },
    private readonly slot: number,
  ) {
    this.scene = scene;
    this.x = fromX;
    this.y = staff.y;
    this.rig = createChonghakRig(scene, role);
    this.shadow = scene.add.ellipse(fromX, staff.y, 46, 12, 0x000000, 0.22).setDepth(-5);
    this.speech = fx.speechText(scene, AIDE_LINE).setVisible(false);
  }

  /** 서서 면담 중 (길을 막고 던진 것을 막는다) */
  get blocking(): boolean {
    return !this.removed && this.state !== 'leave';
  }

  /** playerX: 플레이어 자리 (권학생의 어느 쪽에 설지) */
  update(dt: number, playerX: number): void {
    this.t += dt;
    let moving = false;
    if (this.state !== 'leave') {
      // 권학생 앞(플레이어 쪽)으로 따라 선다
      const dir = Math.sign(playerX - this.staff.x) || 1;
      const left = this.scene.cameras.main.scrollX;
      const tx = Phaser.Math.Clamp(this.staff.x + dir * (58 + this.slot * 16), left + 40, left + GAME_W - 40);
      const ty = Phaser.Math.Clamp(this.staff.y + (this.slot === 0 ? -20 : 20), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, RUN * dt);
      if (d > 0.5) {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }
      moving = d > 3;
      if (this.state === 'run' && (!moving || this.t > 2.5)) {
        this.state = 'stand';
        this.t = 0;
        this.speech.setVisible(true);
      }
      this.facing = moving && this.state === 'run' ? (dx >= 0 ? 1 : -1) : this.staff.x >= this.x ? 1 : -1;
    }
    if (this.state === 'stand') {
      if (this.t >= LIFE) {
        this.state = 'leave';
        this.t = 0;
        this.speech.setVisible(false);
        const left = this.scene.cameras.main.scrollX;
        this.leaveDir = this.x - left < GAME_W / 2 ? -1 : 1;
      }
    } else if (this.state === 'leave') {
      this.facing = this.leaveDir;
      this.x += this.leaveDir * RUN * dt;
      moving = true;
      const left = this.scene.cameras.main.scrollX;
      if (this.x < left - 80 || this.x > left + GAME_W + 80) {
        this.destroy();
        return;
      }
    }
    if (moving) this.walk += dt * 13;
    const p: Pose = neutralPose();
    const sharp = studentPose(p, moving ? 'approach' : 'idle', this.t, this.walk);
    this.rig.update(dt, p, sharp);
    this.rig.root.setPosition(Math.round(this.x), this.y).setScale(this.facing, 1).setDepth(this.y);
    this.shadow.setPosition(this.x, this.y);
    this.speech.setPosition(this.x, this.y - 140).setDepth(this.y + 2);
  }

  /** 플레이어가 닿으면 밀어낸다 (피해 없음). 밀었으면 true */
  push(p: Player): boolean {
    if (!this.blocking || p.z > 50) return false;
    const dx = p.x - this.x;
    if (Math.abs(dx) >= this.halfW + p.halfW || Math.abs(p.y - this.y) > 18) return false;
    p.x = this.x + (Math.sign(dx) || 1) * (this.halfW + p.halfW + 2);
    return true;
  }

  /** 던진 물건(플레이어 것)을 막는지 */
  stops(px: number, py: number, pz: number, halfW: number): boolean {
    return this.blocking && Math.abs(py - this.y) <= DEPTH_RANGE && Math.abs(px - this.x) <= halfW + this.halfW && pz < 120;
  }

  /** 막은 자리에 한마디 */
  blockedText(): void {
    fx.floatText(this.scene, this.x, this.y - 150, AIDE_LINE, '#9fd3ff', 15);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.rig.destroy();
    this.shadow.destroy();
    this.speech.destroy();
  }
}
