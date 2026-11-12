import Phaser from 'phaser';
import { GRAVITY } from '../config';
import type { Player } from './Player';
import { createReportBubble } from './rigs';
import * as fx from '../fx';

// 김보고 처장이 던지는 "보고해!" 말풍선. 바닥의 빨간 표시 자리에 떨어져 6초간 남는다.
// 밟으면(주우면) 잠깐 멈춰서 보고서를 쓴다.

const FLIGHT = 0.9;
const LIFETIME = 6;

export class ReportTrap {
  removed = false;
  private x: number;
  private readonly y: number;
  private z: number;
  private readonly vx: number;
  private vz: number;
  private flying = true;
  private ttl = LIFETIME;
  private readonly scene: Phaser.Scene;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private warn: Phaser.GameObjects.Ellipse | null;

  /** laneY: 던지는 사람이 서 있는 깊이. 그 사람 손 높이에서 출발하는 것처럼 보이게 z를 맞춘다. */
  constructor(scene: Phaser.Scene, fromX: number, laneY: number, toX: number, toY: number) {
    this.scene = scene;
    this.x = fromX;
    this.y = toY;
    this.z = toY - laneY + 96;
    this.vx = (toX - fromX) / FLIGHT;
    this.vz = (GRAVITY * FLIGHT * FLIGHT * 0.5 - this.z) / FLIGHT;
    this.obj = createReportBubble(scene);
    this.shadow = scene.add.ellipse(fromX, toY, 60, 12, 0x000000, 0.25).setDepth(-5);
    this.warn = scene.add.ellipse(toX, toY, 90, 26, 0xd0202f, 0.28).setDepth(-4);
    this.sync();
  }

  update(dt: number, player: Player): void {
    if (this.flying) {
      this.x += this.vx * dt;
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.flying = false;
        this.warn?.destroy();
        this.warn = null;
        fx.dust(this.scene, this.x, this.y);
      }
    } else {
      this.ttl -= dt;
      this.obj.alpha = this.ttl < 1.2 && Math.floor(this.ttl * 10) % 2 === 0 ? 0.3 : 1;
      if (this.ttl <= 0) {
        this.destroy();
        return;
      }
      const touching = Math.abs(player.x - this.x) < 36 && Math.abs(player.y - this.y) < 18 && player.z < 12;
      if (touching && player.startReport(1.4)) {
        this.destroy();
        return;
      }
    }
    this.sync();
  }

  private sync(): void {
    this.obj.setPosition(this.x, this.y - this.z - 18).setDepth(this.y + 1);
    this.shadow.setPosition(this.x, this.y);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
    this.warn?.destroy();
  }
}
