import Phaser from 'phaser';
import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createStudentRig } from './rigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 3스테이지 중간보스 "단대학생회 간부 최민원" (가상 인물).
// 단체 서명지를 흔들면 민원 잡몹이 몰려온다. 세게 치거나 던져 맞히면 서명지를 떨어뜨리는데,
// 간부가 다시 줍기 전에 먼저 주우면(밟거나 L) 더 이상 사람을 부르지 못한다.

const S = stats.minwon;

export class MinwonLeader extends Enemy {
  readonly kind = 'minwon' as const;
  readonly student = true;
  readonly canRecheck = false;
  readonly halfW = 22;
  readonly height = 118;
  thanksText = '서명지는 다음 학기에 다시 올게요. 감사합니다!';
  hasPetition = true;
  private rallyT = 2.5;
  private walkPhase = 0;
  private hitDone = false;
  private readonly sheet: Phaser.GameObjects.Container;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createStudentRig(scene, { jacket: 0x1d4ed8, hair: 0x1f1a17 }), S.hp, 50, enterTargetX);
    this.baseScale = 1.1;
    const rig = this.rig;
    rig.torso.add(rig.part(-10, -30, 12, 6, 0xffd34d, 0.5, 0, false)); // 간부 완장
    this.sheet = new Phaser.GameObjects.Container(scene, 0, 0);
    this.sheet.add(rig.part(0, 0, 26, 32, 0xffffff, 0.5, 0));
    this.sheet.add(rig.part(4, 8, 8, 4, 0xd0202f, 0.5, 0, false));
    this.sheet.add(rig.part(4, 18, 8, 4, 0xd0202f, 0.5, 0, false));
    rig.itemF.add(this.sheet);
    this.setLabel('최민원 · 단대학생회 간부');
    this.sync();
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, this.hasPetition ? 150 : 74, S.speedX, S.speedY);
        if (this.hasPetition) {
          this.rallyT -= dt;
          if (this.rallyT <= 0) {
            this.scene.releaseToken(this);
            this.vx = 0;
            this.vy = 0;
            this.set('wave');
            this.say('여러분, 모여 주세요! 단체 민원입니다!', 1.4);
            return;
          }
        } else {
          const p = this.scene.petitionPos();
          if (p) {
            this.set('retrieve');
            return;
          }
        }
        if (this.canStartAttack(player, dx, dy, 100)) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          this.say('학생 대표로 왔습니다!', 1.2);
        }
        break;
      }
      case 'wave':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.2) {
          this.scene.rally(2);
          this.rallyT = S.rallyEvery + Math.random() * 1.5;
          this.set('approach');
        }
        break;
      case 'retrieve': {
        const p = this.scene.petitionPos();
        if (!p) {
          this.set('approach');
          break;
        }
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = Math.abs(dx) > 6 ? Math.sign(dx) * S.speedX * 1.2 : 0;
        this.vy = Math.abs(dy) > 4 ? Math.sign(dy) * S.speedY : 0;
        if (Math.abs(dx) < 18 && Math.abs(dy) < 12) {
          this.scene.takePetitionBack();
          this.hasPetition = true;
          this.sheet.setVisible(true);
          this.rallyT = 2;
          this.say('서명지 찾았다!', 1.0);
          this.set('approach');
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.4) {
          this.set('shove');
          this.hitDone = false;
          this.vx = this.facing * 320;
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
          this.cooldown = 1.5 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
    }
  }

  takeHit(h: HitInfo): boolean {
    const ok = super.takeHit(h);
    if (ok && !this.dead && this.hasPetition && (h.knockdown || h.thrown)) {
      this.hasPetition = false;
      this.sheet.setVisible(false);
      this.scene.dropPetition(this.x + h.dir * 60, this.y);
      this.say('앗, 서명지!', 1.0);
      fx.floatText(this.scene, this.x, this.y - this.height - 30, '서명지를 먼저 주우세요!', '#ffe066', 16);
    }
    return ok;
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 11;
    const sharp = studentPose(p, moving || this.state !== 'approach' ? this.state : 'idle', this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}
