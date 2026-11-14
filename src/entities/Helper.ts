import Phaser from 'phaser';
import { FLOOR_BOTTOM, FLOOR_TOP, FONT, GAME_W } from '../config';
import type { StaffLook } from '../data/heroes';
import type { StudentHeroLook } from '../data/students';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createStaffRig, createStamp, createStudentHeroRig } from './rigs';
import * as fx from '../fx';

// 조력자 (체력이 바닥일 때 달려오는 동료 직원·친구). 다른 주인공 외형을 그대로 쓴다.
// 화면 끝에서 뛰어 들어와 한마디 하고, 도장을 찍거나(교직원) 서류를 흔들다가(학생) 걸어 나간다.
// 맞지 않고 넘어지지 않는다 (적의 공격 대상이 아니다). 실제 효과(민원 처리·회복)는 StageScene이 맡는다.

export type HelperLook = { student: false; look: StaffLook } | { student: true; look: StudentHeroLook };

export interface HelperOpts {
  look: HelperLook;
  name: string;
  line: string;
  fromX: number;
  y: number;
  targetX: number;
  /** 이 시간(초) 안에 도착하도록 달린다 */
  arriveIn: number;
}

type HelperState = 'run' | 'act' | 'leave';

const ACT_SEC = 1.7;

export class Helper {
  removed = false;
  private x: number;
  private y: number;
  private facing: number;
  private state: HelperState = 'run';
  private stateT = 0;
  private walkPhase = Math.random() * 6;
  private readonly speed: number;
  private readonly targetX: number;
  private readonly line: string;
  private readonly student: boolean;
  private readonly scene: Phaser.Scene;
  private readonly rig: Rig;
  private readonly prop: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;
  private speech: Phaser.GameObjects.Text | null = null;
  private speechT = 0;

  constructor(scene: Phaser.Scene, o: HelperOpts) {
    this.scene = scene;
    this.x = o.fromX;
    this.y = Phaser.Math.Clamp(o.y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
    this.targetX = o.targetX;
    this.facing = o.targetX >= o.fromX ? 1 : -1;
    this.speed = Math.max(380, Math.abs(o.targetX - o.fromX) / Math.max(0.3, o.arriveIn));
    this.line = o.line;
    this.student = o.look.student;
    this.rig = o.look.student ? createStudentHeroRig(scene, o.look.look) : createStaffRig(scene, o.look.look);
    // 손에 든 것: 교직원은 처리 도장, 학생은 대신 내 줄 서류
    if (o.look.student) {
      this.prop = new Phaser.GameObjects.Container(scene, 0, 0);
      this.prop.add(this.rig.part(0, -2, 22, 28, 0xffffff, 0.5, 0));
      this.prop.add(this.rig.part(0, 4, 14, 2, 0x9aa3ad, 0.5, 0, false));
      this.prop.add(this.rig.part(0, 10, 14, 2, 0x9aa3ad, 0.5, 0, false));
      this.prop.add(this.rig.part(4, 16, 9, 6, 0xc8202f, 0.5, 0, false));
    } else {
      this.prop = createStamp(scene, this.rig);
    }
    this.rig.itemF.add(this.prop);
    this.prop.setVisible(false);
    this.shadow = scene.add.ellipse(this.x, this.y, 46, 13, 0x000000, 0.28).setDepth(-5);
    this.label = scene.add
      .text(this.x, this.y, o.name, {
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

  /** 자리에 도착했는지 */
  get arrived(): boolean {
    return this.state !== 'run';
  }

  private set(s: HelperState): void {
    this.state = s;
    this.stateT = 0;
  }

  private say(text: string, sec: number): void {
    if (!this.speech) this.speech = fx.speechText(this.scene, text);
    else this.speech.setText(text);
    this.speechT = sec;
  }

  update(dt: number, playerX: number): void {
    if (this.removed) return;
    this.stateT += dt;
    const left = this.scene.cameras.main.scrollX;
    let moving = false;
    switch (this.state) {
      case 'run': {
        const d = this.targetX - this.x;
        this.facing = d >= 0 ? 1 : -1;
        if (Math.abs(d) < 8) {
          this.set('act');
          this.facing = playerX >= this.x ? -1 : 1; // 플레이어를 등지고 적 쪽을 본다
          this.say(this.line, 2.4);
          fx.dust(this.scene, this.x, this.y);
        } else {
          this.x += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt);
          moving = true;
        }
        break;
      }
      case 'act':
        if (this.stateT >= ACT_SEC) this.set('leave');
        break;
      case 'leave': {
        const dir = this.x - left < GAME_W / 2 ? -1 : 1;
        this.facing = dir;
        this.x += dir * 260 * dt;
        moving = true;
        if (this.x < left - 70 || this.x > left + GAME_W + 70) {
          this.destroy();
          return;
        }
        break;
      }
    }
    this.pose(dt, moving);
    this.sync();
    if (this.speech) {
      this.speechT -= dt;
      this.speech.setPosition(this.x, this.y - 140).setVisible(this.speechT > 0);
    }
  }

  private pose(dt: number, moving: boolean): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    this.prop.setVisible(this.state === 'act');
    if (moving) {
      const run = this.state === 'run';
      this.walkPhase += dt * (run ? 17 : 10);
      const s = Math.sin(this.walkPhase);
      p.legF = s * (run ? 0.65 : 0.45);
      p.legB = -s * (run ? 0.65 : 0.45);
      p.armF = -s * 0.55;
      p.armB = s * 0.55;
      p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2.5;
      if (run) p.body = 0.14;
    } else if (this.state === 'act') {
      sharp = 30;
      const k = Math.floor(this.stateT / 0.28) % 2 === 0;
      if (this.student) {
        // 서류를 높이 들어 흔든다
        p.armF = k ? -2.7 : -2.3;
        p.armB = k ? -2.2 : -2.6;
        p.bob = k ? -3 : 0;
      } else {
        // 쾅쾅 도장 찍기
        p.armF = k ? -2.6 : -1.1;
        p.armB = 0.3;
        p.body = k ? -0.08 : 0.18;
      }
    }
    this.rig.update(dt, p, sharp);
  }

  private sync(): void {
    this.rig.root.setPosition(Math.round(this.x), Math.round(this.y)).setScale(this.facing, 1).setDepth(this.y);
    this.shadow.setPosition(this.x, this.y);
    // 말하는 동안은 이름표를 숨긴다 (이름은 안내 띠에 나오고, 옆 사람 말풍선과 겹치지 않게)
    this.label
      .setPosition(this.x, this.y - 116)
      .setDepth(this.y + 0.5)
      .setVisible(this.state !== 'leave' && this.speechT <= 0);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.rig.destroy();
    this.shadow.destroy();
    this.label.destroy();
    this.speech?.destroy();
  }
}
