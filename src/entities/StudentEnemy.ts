import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { FLOOR_BOTTOM, FLOOR_TOP, GAME_W } from '../config';
import { TYPE_LABEL } from '../data/names';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createStudentRig, type StudentLook } from './rigs';

// 1스테이지 중간보스 학생 2명 (가상 인물, 이름은 매 판 무작위).
// - 전화번호 잘못 입력한 학생: 연락이 닿지 않아 화면 여기저기로 순간이동한다.
// - 서류 제출이 늦은 학생: 처리한 줄 알았는데 서류를 들고 한 번 더 온다.
// 학생은 넘어지지 않는다. 체력이 다하면 인사하고 돌아간다.

export type StudentKind = 'wrongNumber' | 'lateDoc';

const LOOKS: Record<StudentKind, StudentLook> = {
  wrongNumber: { jacket: 0x23315a, hair: 0x2a2420 },
  lateDoc: { jacket: 0x2f5d3a, hair: 0x5b3a24, longHair: true },
};

const LINES: Record<StudentKind, string[]> = {
  wrongNumber: ['문자 못 받았는데요?', '전화 주셨어요? 몰랐어요!', '번호요? 맞게 쓴 것 같은데…'],
  lateDoc: ['마감이 오늘이었어요?', '5분만 봐주시면 안 돼요?', '어제는 된다고 하셨잖아요!'],
};

/** 학생 공통 자세 (보스도 함께 쓴다) */
export function studentPose(p: Pose, state: string, t: number, phase: number): number {
  switch (state) {
    case 'enter':
    case 'approach':
    case 'leaving':
    case 'appear': {
      const s = Math.sin(phase);
      p.legF = s * 0.55;
      p.legB = -s * 0.55;
      p.armF = -s * 0.45;
      p.armB = s * 0.45;
      p.bob = -Math.abs(Math.cos(phase)) * 2.5;
      return 16;
    }
    case 'windup':
      p.armF = -2.3 + Math.sin(t * 30) * 0.15;
      p.armB = 0.5;
      p.body = -0.15;
      return 30;
    case 'shove':
    case 'flurry':
      p.armF = -1.45 + Math.sin(t * 40) * 0.25;
      p.armB = -1.3;
      p.body = 0.3;
      p.legF = -0.4;
      p.legB = 0.4;
      return 40;
    case 'throw':
      p.armF = -2.4 + Math.sin(t * 18) * 0.5;
      p.armB = 0.4;
      p.body = 0.05;
      return 24;
    case 'recover':
      p.body = 0.1;
      return 16;
    case 'hurt':
      p.body = -0.3;
      p.armF = -0.6;
      p.armB = -0.5;
      return 30;
    case 'stagger':
      p.body = -0.45 + Math.sin(t * 20) * 0.08;
      p.armF = -2.4;
      p.armB = -2.0;
      p.legF = 0.3;
      p.legB = -0.3;
      return 24;
    case 'stunned':
      p.armF = -2.2;
      p.armB = -2.1;
      p.body = 0.08 + Math.sin(t * 3) * 0.04;
      return 12;
    case 'bow':
      p.body = 0.6;
      p.armF = 0.1;
      p.armB = -0.1;
      return 10;
  }
  return 16;
}

export class StudentEnemy extends Enemy {
  readonly kind: StudentKind;
  readonly student = true;
  readonly canRecheck = false;
  readonly halfW = 22;
  readonly height = 118;
  private readonly st: { hp: number; speedX: number; speedY: number };
  private teleT = 2.6;
  private comeback: boolean;
  private returning = false;
  private awayT = 0;
  private hitDone = false;
  private walkPhase = 0;
  private readonly papers: Phaser.GameObjects.Container;

  constructor(scene: StageScene, kind: StudentKind, x: number, y: number, enterTargetX: number, name: string) {
    const st = stats[kind];
    super(scene, x, y, createStudentRig(scene, LOOKS[kind]), st.hp, 50, enterTargetX);
    this.kind = kind;
    this.st = st;
    this.baseScale = 1.1;
    this.comeback = kind === 'lateDoc';
    this.cooldown = 1.0;

    // 손에 든 것: 휴대폰 또는 서류 뭉치
    const rig = this.rig;
    this.papers = new Phaser.GameObjects.Container(scene, 0, 0);
    this.papers.add(rig.part(0, 0, 24, 30, 0xffffff, 0.5, 0));
    this.papers.add(rig.part(3, 4, 24, 30, 0xf4f0e0, 0.5, 0));
    rig.itemF.add(this.papers);
    this.papers.setVisible(false);
    if (kind === 'wrongNumber') rig.itemF.add(rig.part(0, 0, 10, 18, 0x1b1b1f, 0.5, 0));

    this.setLabel(`${name} · ${TYPE_LABEL[kind]}`);
    this.sync();
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, 74, this.st.speedX, this.st.speedY);
        if (this.kind === 'wrongNumber') {
          this.teleT -= dt;
          if (this.teleT <= 0) {
            this.scene.releaseToken(this);
            this.vx = 0;
            this.vy = 0;
            this.set('vanish');
            this.say('여보세요? 잘 안 들려요…', 0.8);
            return;
          }
        }
        if (this.canStartAttack(player, dx, dy, 100)) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          const lines = LINES[this.kind];
          this.say(lines[Math.floor(Math.random() * lines.length)], 1.4);
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.4) {
          this.set('shove');
          this.hitDone = false;
          this.vx = this.facing * 330;
        }
        break;
      case 'shove':
        if (!this.hitDone && this.meleeHit(player, 10, 2, 220)) this.hitDone = true;
        if (this.stateT >= 0.2) this.set('recover');
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        if (this.stateT >= 0.5) {
          this.scene.releaseToken(this);
          this.cooldown = 1.4 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
      case 'vanish':
        if (this.stateT >= 0.25) this.set('hidden');
        break;
      case 'hidden':
        if (this.stateT >= 0.5) this.reappear(player);
        break;
      case 'appear':
        if (this.stateT >= 0.25) {
          this.teleT = 3.4 + Math.random() * 1.2;
          this.set('approach');
        }
        break;
      case 'away':
        this.awayT -= dt;
        if (this.awayT <= 0) this.comeBack();
        break;
    }
  }

  /** 순간이동: 플레이어에게서 조금 떨어진 곳에 다시 나타난다 */
  private reappear(player: Player): void {
    const left = this.scene.cameras.main.scrollX;
    let x = left + 80 + Math.random() * (GAME_W - 160);
    if (Math.abs(x - player.x) < 150) x = player.x + (player.x - left < GAME_W / 2 ? 220 : -220);
    this.x = Phaser.Math.Clamp(x, left + 60, left + GAME_W - 60);
    this.y = Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.set('appear');
    this.say('여보세요? 저 여기요!', 1.2);
  }

  protected onZeroHp(): void {
    if (this.kind === 'lateDoc' && this.comeback) {
      // 첫 번째 처리: 서류를 가지러 갔다가 다시 온다
      this.comeback = false;
      this.returning = true;
      this.dead = true;
      this.scene.releaseToken(this);
      this.vx = 0;
      this.set('bow');
      this.say('앗, 서류를 두고 왔어요! 금방 올게요!', 1.8);
      return;
    }
    super.onZeroHp();
  }

  protected onLeft(): void {
    if (this.returning) {
      this.returning = false;
      this.set('away');
      this.awayT = 2.6;
      this.vx = 0;
      return;
    }
    super.onLeft();
  }

  private comeBack(): void {
    const left = this.scene.cameras.main.scrollX;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.x = side < 0 ? left - 40 : left + GAME_W + 40;
    this.y = Phaser.Math.Between(FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    this.enterTargetX = side < 0 ? left + 110 : left + GAME_W - 110;
    this.hp = stats.lateDoc.comebackHp;
    this.dead = false;
    this.papers.setVisible(true);
    this.set('enter');
    this.say('잠깐만요! 서류 가져왔어요!', 2);
  }

  protected afterSync(): void {
    super.afterSync();
    const hidden = this.state === 'hidden' || this.state === 'away';
    this.rig.root.setVisible(!hidden);
    this.shadow.setVisible(!hidden);
    if (this.state === 'vanish') this.rig.root.alpha = Math.max(0, 1 - this.stateT / 0.25);
    if (this.state === 'appear') this.rig.root.alpha = Math.min(1, this.stateT / 0.25);
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 11;
    const sharp = studentPose(p, moving || this.state !== 'approach' ? this.state : 'idle', this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}
