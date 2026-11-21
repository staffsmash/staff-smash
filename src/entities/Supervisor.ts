import Phaser from 'phaser';
import { FLOOR_TOP, FONT, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import type { Player } from './Player';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createSupervisorRig } from './rigs';
import * as fx from '../fx';

// 가상 상사 (방해 요소, 맞지 않는다). 화면 뒤쪽 통로로 오간다. (PRD 11절, 2026-11-21 11차 사용자 재편)
// - 김보고 처장: 다가와서 "보고해!" 말풍선을 플레이어 근처에 떨어뜨린다. 구역이 끝날 때까지 반복.
// - 박학과장 (여): "그건 선생님이 알아서 하세요" 하며 민원(메일)을 주인공에게 넘긴다. 반복. (예전 최몰라 처장의 메일 떠넘기기)
// - 김부재중 교수: 서명이 필요한 구역에서 한참 늦게 나타나 서명해 준다 (StageScene이 부른다). 싸우지 않는다.
// - 최내놔 처장: "손님이 오는데 기념품 없나요?" 하며 거미줄을 던진다. 바닥에 4초 남고, 밟으면 처장 곁으로 끌려간다. 반복.
// - 회의회의부총장 (여): 보스전에서 회의를 소집한다. 바닥의 원 안에 있으면 1분짜리 회의에 끌려간다.
// - 몰라몰라부총장: 간식을 두 개 떨어뜨리는데 하나는 일거리다. 반복.
// kind 값은 저장된 스테이지 자료와 맞추려고 예전 것을 그대로 쓴다 (gumto = 박학과장, molla = 최내놔 처장, hoho = 몰라몰라부총장).
// 예전 오검토 처장의 "재검토!"(처리된 민원 되살리기)는 11차에 없앴다.

export type SupervisorKind = 'bogo' | 'gumto' | 'bujae' | 'molla' | 'meeting' | 'hoho';

const NAMES: Record<SupervisorKind, string> = {
  bogo: '김보고 처장',
  gumto: '박학과장',
  bujae: '김부재중 교수',
  molla: '최내놔 처장',
  meeting: '회의회의부총장',
  hoho: '몰라몰라부총장',
};

/** 들어올 때 하는 말 (여러 개면 무작위) */
const ENTER_LINES: Record<SupervisorKind, string[]> = {
  bogo: ['보고해!'],
  gumto: ['그건 선생님이 알아서 하세요'],
  // ★ 서명으로 바꾼 말 (예전 "어, 결재? 여기 있어. 미안 미안.")
  bujae: ['어, 서명? 여기 있어. 미안 미안.'],
  molla: ['손님이 오는데 기념품 없나요?'],
  meeting: ['긴급 회의 소집합니다!'],
  // ★ "몰라~ 둘 중 하나는 간식이야" (11차 새 대사)
  hoho: ['허허, 수고가 많아요~ 이거 먹고 해요.', '몰라~ 둘 중 하나는 간식이야'],
};

/** 다시 나타나기까지 걸리는 시간(초). 0 = 한 번만 */
const REPEAT: Record<SupervisorKind, [number, number]> = {
  bogo: [9, 13],
  gumto: [12, 16],
  bujae: [0, 0],
  molla: [13, 17],
  meeting: [15, 19],
  hoho: [14, 18],
};

const LANE_Y = FLOOR_TOP - 6;

type SupState = 'wait' | 'enter' | 'act' | 'leave';

export class Supervisor {
  readonly kind: SupervisorKind;
  removed = false;
  private readonly scene: StageScene;
  private readonly rig: Rig;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;
  private speech: Phaser.GameObjects.Text | null = null;
  private speechT = 0;
  private x = 0;
  private facing = -1;
  private state: SupState = 'wait';
  private stateT = 0;
  private waitT: number;
  private targetX = 0;
  private walkPhase = 0;
  private acted = false;
  private active = true;
  private readonly onDone: (() => void) | null;

  constructor(scene: StageScene, kind: SupervisorKind, delay: number, onDone: (() => void) | null = null) {
    this.scene = scene;
    this.kind = kind;
    this.waitT = delay;
    this.onDone = onDone;
    this.rig = createSupervisorRig(scene, kind);
    this.rig.root.setVisible(false);
    this.shadow = scene.add.ellipse(0, LANE_Y, 48, 13, 0x000000, 0.22).setDepth(-6).setVisible(false);
    this.label = scene.add
      .text(0, 0, NAMES[kind], {
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#c9d3e6',
        stroke: '#111318',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  /** 지금 서 있는 자리 (거미줄에 걸린 플레이어를 끌어당길 곳) */
  get posX(): number {
    return this.x;
  }

  get laneY(): number {
    return LANE_Y;
  }

  private set(s: SupState): void {
    this.state = s;
    this.stateT = 0;
  }

  private say(text: string, sec: number): void {
    if (!this.speech) this.speech = fx.speechText(this.scene, text);
    else this.speech.setText(text);
    this.speechT = sec;
  }

  private pickSpot(player: Player, left: number): number {
    const onLeft = player.x - left < GAME_W / 2;
    if (this.kind === 'bujae') return left + (onLeft ? 790 : 170);
    return Phaser.Math.Clamp(player.x + (onLeft ? 150 : -150), left + 100, left + GAME_W - 100);
  }

  update(dt: number, player: Player): void {
    this.stateT += dt;
    const left = this.scene.cameras.main.scrollX;
    let moving = false;

    switch (this.state) {
      case 'wait':
        this.waitT -= dt;
        if (this.waitT <= 0) {
          if (!this.active) {
            this.destroy();
            return;
          }
          this.x = left + GAME_W + 50;
          this.targetX = this.pickSpot(player, left);
          this.set('enter');
        }
        break;
      case 'enter': {
        const d = this.targetX - this.x;
        this.facing = d >= 0 ? 1 : -1;
        if (Math.abs(d) < 6) {
          this.acted = false;
          const lines = ENTER_LINES[this.kind];
          const line = lines[Math.floor(Math.random() * lines.length)];
          this.say(line, this.kind === 'hoho' || this.kind === 'gumto' || this.kind === 'molla' ? 1.8 : 1.3);
          this.set('act');
        } else {
          this.x += Math.sign(d) * Math.min(Math.abs(d), 160 * dt);
          moving = true;
        }
        break;
      }
      case 'act':
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.acted && this.stateT >= 0.45) {
          this.acted = true;
          this.act(player);
        }
        if (this.stateT >= 1.0) this.set('leave');
        break;
      case 'leave': {
        const dir = this.x - left < GAME_W / 2 ? -1 : 1;
        this.facing = dir;
        this.x += dir * 170 * dt;
        moving = true;
        if (this.x < left - 60 || this.x > left + GAME_W + 60) {
          const [a, b] = REPEAT[this.kind];
          if (a > 0 && this.active) {
            this.set('wait');
            this.waitT = a + Math.random() * (b - a);
          } else {
            this.destroy();
            return;
          }
        }
        break;
      }
    }

    const shown = this.state !== 'wait';
    this.rig.root.setVisible(shown);
    this.shadow.setVisible(shown);
    this.label.setVisible(shown);
    this.pose(dt, moving);
    this.rig.root.setPosition(Math.round(this.x), LANE_Y).setScale(this.facing, 1).setDepth(LANE_Y);
    this.shadow.setPosition(this.x, LANE_Y);
    this.label.setPosition(this.x, LANE_Y - 116).setDepth(LANE_Y + 0.5);
    if (this.speech) {
      this.speechT -= dt;
      this.speech.setPosition(this.x, LANE_Y - 132).setVisible(shown && this.speechT > 0);
    }
  }

  /** 상사마다 하는 일 */
  private act(player: Player): void {
    const s = this.scene;
    switch (this.kind) {
      case 'bogo':
        s.addReportTrap(this.x + this.facing * 20, LANE_Y, player.x + Phaser.Math.Between(-30, 30), player.y);
        break;
      case 'gumto':
        s.passMail(this.x + this.facing * 30);
        break;
      case 'bujae':
        fx.stampMark(s, this.x, LANE_Y - 70, '서명');
        this.onDone?.();
        break;
      case 'molla':
        s.throwWeb(this, player.x + Phaser.Math.Between(-24, 24), player.y + Phaser.Math.Between(-10, 10));
        break;
      case 'meeting':
        s.callMeeting(player.x, player.y);
        break;
      case 'hoho':
        s.dropSnacks(this.x, player.x, player.y);
        break;
    }
  }

  private pose(dt: number, moving: boolean): void {
    const p: Pose = neutralPose();
    let sharp = 14;
    if (moving) {
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase);
      p.legF = s * 0.45;
      p.legB = -s * 0.45;
      p.armF = -s * 0.35;
      p.armB = s * 0.35;
      p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2;
    } else if (this.state === 'act') {
      sharp = 30;
      const early = this.stateT < 0.45;
      p.armF = early ? -2.8 : -1.3;
      p.body = early ? -0.1 : 0.15;
    }
    this.rig.update(dt, p, sharp);
  }

  /** 구역이 끝나면 물러난다 */
  leave(): void {
    this.active = false;
    if (this.state === 'wait') this.destroy();
    else if (this.state === 'enter') this.set('leave');
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
