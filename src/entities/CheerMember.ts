import Phaser from 'phaser';
import { FLOOR_BOTTOM, FLOOR_TOP, FONT, GAME_W } from '../config';
import type { StudentHeroLook } from '../data/students';
import type { StageScene } from '../scenes/StageScene';
import type { Enemy } from './Enemy';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createStudentHeroRig } from './rigs';
import { addPompoms } from './visitRigs';
import * as fx from '../fx';

// 응원단 동아리원 (돌발 방문 보상 "응원단 호출권", 교직원 모드 2D). 조력자(Helper)와 같은 규칙·모양을 빌려 쓴다:
// 화면 끝에서 뛰어 들어와 플레이어 곁(좌우)에 붙어 다니며, 가까이 온 잡몹을 하나씩 처리한다. 시간이 다 되면 걸어 나간다.
// 맞지 않고 넘어지지 않는다 (적의 공격 대상이 아니다). 처리 자체는 StageScene.cheerProcess가 한다.

/** 플레이어 옆 몇 px에 붙는지 */
const SIDE_GAP = 78;
/** 잡몹을 처리하는 거리 (동아리원 기준 x, 깊이) */
const REACH_X = 190;
const REACH_Y = 70;
/** 한 명이 잡몹 하나를 처리하고 다음 것까지 쉬는 시간 (초) */
const COOLDOWN = 0.55;
const RUN_V = 420;
const FOLLOW_V = 260;

type CheerState = 'run' | 'cheer' | 'leave';

export class CheerMember {
  removed = false;
  private x: number;
  private y: number;
  private facing: number;
  private state: CheerState = 'run';
  private stateT = 0;
  private lifeT: number;
  private cool = 0.2;
  private actT = 0;
  private walkPhase = Math.random() * 6;
  private readonly side: number;
  private readonly scene: StageScene;
  private readonly rig: Rig;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: StageScene, look: StudentHeroLook, side: number, fromX: number, sec: number) {
    this.scene = scene;
    this.side = side;
    this.x = fromX;
    this.y = scene.player.y;
    this.lifeT = sec;
    this.facing = side < 0 ? 1 : -1;
    this.rig = createStudentHeroRig(scene, look);
    addPompoms(scene, this.rig, side < 0 ? 0xffd34d : 0xff6b9a);
    this.shadow = scene.add.ellipse(this.x, this.y, 46, 13, 0x000000, 0.28).setDepth(-5);
    this.label = scene.add
      .text(this.x, this.y, '응원단', {
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#7CFC9A',
        stroke: '#111318',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    this.sync();
  }

  update(dt: number): void {
    if (this.removed) return;
    this.stateT += dt;
    const p = this.scene.player;
    const left = this.scene.cameras.main.scrollX;
    let moving = false;
    if (this.actT > 0) this.actT -= dt;
    if (this.state !== 'leave') {
      this.lifeT -= dt;
      if (this.lifeT <= 0) this.state = 'leave';
    }
    if (this.state === 'leave') {
      const dir = this.x - left < GAME_W / 2 ? -1 : 1;
      this.facing = dir;
      this.x += dir * 260 * dt;
      moving = true;
      if (this.x < left - 70 || this.x > left + GAME_W + 70) {
        this.destroy();
        return;
      }
    } else {
      // 플레이어 곁 (화면 밖으로 나가지 않게)
      const tx = Phaser.Math.Clamp(p.x + this.side * SIDE_GAP, left + 30, left + GAME_W - 30);
      const ty = Phaser.Math.Clamp(p.y + 4, FLOOR_TOP + 4, FLOOR_BOTTOM - 4);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const v = this.state === 'run' ? RUN_V : FOLLOW_V;
      if (Math.abs(dx) > 6) {
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), v * dt);
        moving = true;
      }
      if (Math.abs(dy) > 3) this.y += Math.sign(dy) * Math.min(Math.abs(dy), 160 * dt);
      if (this.state === 'run' && Math.abs(dx) < 10) {
        this.state = 'cheer';
        fx.dust(this.scene, this.x, this.y);
      }
      if (this.state === 'cheer') {
        this.cool -= dt;
        if (this.cool <= 0) {
          const e = this.target();
          if (e) {
            this.cool = COOLDOWN;
            this.actT = 0.3;
            this.facing = e.x >= this.x ? 1 : -1;
            this.scene.cheerProcess(e, this.x);
            if (Math.random() < 0.5) fx.floatText(this.scene, this.x, this.y - 130, '파이팅!', '#ffe066', 15);
          }
        }
        if (this.actT <= 0 && !moving) this.facing = this.side < 0 ? -1 : 1; // 바깥(적이 오는 쪽)을 본다
      } else {
        this.facing = dx >= 0 ? 1 : -1;
      }
    }
    this.pose(dt, moving);
    this.sync();
  }

  /** 가까운 잡몹 하나 */
  private target(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.scene.enemies) {
      if (e.dead || e.removed || !this.scene.isMob(e)) continue;
      const dx = Math.abs(e.x - this.x);
      if (dx > REACH_X || Math.abs(e.y - this.y) > REACH_Y) continue;
      if (dx < bestD) {
        bestD = dx;
        best = e;
      }
    }
    return best;
  }

  private pose(dt: number, moving: boolean): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    if (moving) {
      const run = this.state === 'run';
      this.walkPhase += dt * (run ? 17 : 11);
      const s = Math.sin(this.walkPhase);
      p.legF = s * (run ? 0.65 : 0.45);
      p.legB = -s * (run ? 0.65 : 0.45);
      p.armF = -s * 0.55;
      p.armB = s * 0.55;
      p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2.5;
    } else if (this.state === 'cheer') {
      // 응원 술을 번갈아 흔든다 (처리할 때는 앞으로 크게 뻗는다)
      sharp = 26;
      const k = Math.floor(this.stateT / 0.25) % 2 === 0;
      p.armF = this.actT > 0 ? -1.6 : k ? -2.8 : -2.2;
      p.armB = k ? -2.2 : -2.8;
      p.bob = k ? -3 : 0;
    }
    this.rig.update(dt, p, sharp);
  }

  private sync(): void {
    this.rig.root.setPosition(Math.round(this.x), Math.round(this.y)).setScale(this.facing, 1).setDepth(this.y);
    this.shadow.setPosition(this.x, this.y);
    this.label
      .setPosition(this.x, this.y - 116)
      .setDepth(this.y + 0.5)
      .setVisible(this.state !== 'leave');
  }

  /** 스테이지가 끝나거나 다시 부를 때 */
  leave(): void {
    this.state = 'leave';
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.rig.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
