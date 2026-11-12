import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { TYPE_LABEL } from '../data/names';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createStudentRig } from './rigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 1스테이지 보스 "공지를 안 읽는 학생" (가상 인물, 이름은 매 판 무작위).
// - 같은 질문("?")을 일렬로 던진다 → 깊이를 바꾸거나 점프해서 피한다.
// - 가까우면 "그래서요?!" 3연타.
// - 안내문을 3번 붙여야(안내문 롤로 치거나 던지기) 처리된다. 그 전에는 체력이 1에서 멈춘다.
// - 처리되면 쓰러지지 않고 인사하고 돌아간다.

const S = stats.noticeBoss;
const QUESTIONS = [
  '그거 어디 나와 있어요?',
  '공지 어디에 있어요?',
  '그래서 언제까지예요?',
  '저만 몰랐던 거예요?',
  '단톡방엔 없던데요?',
];

export class NoticeBoss extends Enemy implements BossLike {
  readonly kind = 'noticeBoss' as const;
  readonly student = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly halfW = 28;
  readonly height = 136;
  readonly needNotices = S.notices;
  readonly bossName: string;
  readonly bossType = TYPE_LABEL.noticeBoss;
  notices = 0;
  thanksText = '아… 공지에 다 있었네요. 감사합니다!';
  private walkPhase = 0;
  private shots = 0;
  private pokes = 0;
  private floorHinted = false;
  private readonly marks: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number, name: string) {
    super(
      scene,
      x,
      y,
      createStudentRig(scene, { jacket: 0x8a1f2c, hair: 0x1f1a17, earphones: true }),
      S.hp,
      64,
      enterTargetX,
    );
    this.bossName = name;
    this.baseScale = 1.25;
    this.cooldown = 1.4;

    const rig = this.rig;
    rig.itemF.add(rig.part(0, 0, 11, 19, 0x1b1b1f, 0.5, 0));
    // 붙은 안내문 3장 (처음엔 숨김)
    const spots: [number, number, number][] = [
      [-8, -32, -0.2],
      [7, -22, 0.15],
      [-4, -12, -0.05],
    ];
    for (const [x0, y0, r] of spots) {
      const m = rig.part(x0, y0, 15, 11, 0xffffff, 0.5, 0.5);
      m.rotation = r;
      m.setVisible(false);
      rig.torso.add(m);
      this.marks.push(m);
    }
    this.setLabel(name, '#ff9f9f');
    this.sync();
  }

  get bossHp(): number {
    return this.hp;
  }

  get bossMaxHp(): number {
    return this.maxHp;
  }

  get bossGone(): boolean {
    return this.removed;
  }

  bossExtra(): string {
    return `안내문 ${'■'.repeat(this.notices)}${'□'.repeat(Math.max(0, this.needNotices - this.notices))}`;
  }

  /** 안내문이 더 필요한지 (스테이지가 안내문 롤을 계속 공급한다) */
  get wantsNotice(): boolean {
    return !this.dead && this.notices < this.needNotices;
  }

  protected think(_dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, 90, S.speedX, S.speedY);
        if (this.cooldown > 0 || !player.targetable) break;
        if (Math.abs(dy) < 14 && Math.abs(dx) < 125) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          this.say('그래서요?!', 0.9);
        } else if (Math.abs(dx) > 170 || this.stateT > 2.6) {
          this.set('throw');
          this.vx = 0;
          this.vy = 0;
          this.shots = 0;
          this.say(QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)], 1.6);
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.45) {
          this.set('flurry');
          this.pokes = 0;
          this.vx = this.facing * 60;
        }
        break;
      case 'flurry': {
        const k = Math.floor(this.stateT / 0.2);
        if (k > this.pokes && this.pokes < 3) {
          this.pokes++;
          this.meleeHit(player, 20, 1, 60);
        }
        if (this.stateT >= 0.7) {
          this.vx = 0;
          this.set('recover');
        }
        break;
      }
      case 'throw': {
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 0.25) {
          const k = Math.floor((this.stateT - 0.25) / 0.3);
          if (k >= this.shots && this.shots < 3) {
            this.shots++;
            this.scene.fireProjectile(this, 'question', 0);
          }
        }
        if (this.stateT >= 1.3) this.set('recover');
        break;
      }
      case 'recover':
        if (this.stateT >= 0.6) {
          this.cooldown = 1.0 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
      case 'stunned':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.8) {
          this.cooldown = 0.8;
          this.set('approach');
        }
        break;
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    this.rig.flash();
    this.facing = h.dir > 0 ? -1 : 1;
    this.hp -= h.dmg;
    const locked = this.notices < this.needNotices;

    if (h.tag === 'notice' && locked) {
      this.notices++;
      this.marks[this.notices - 1]?.setVisible(true);
      fx.stampMark(this.scene, this.x, this.y - this.height * 0.55, '안내문');
      fx.floatText(this.scene, this.x, this.y - this.height - 40, `안내문 ${this.notices}/${this.needNotices}`, '#ffe066', 22);
      if (this.hp < 1 && this.notices < this.needNotices) this.hp = 1;
      if (this.hp <= 0) {
        this.hp = 0;
        this.onZeroHp();
        return true;
      }
      this.set('stunned');
      this.stateT = 0;
      this.vx = 0;
      this.vy = 0;
      this.say('…읽는 중', 1.8);
      return true;
    }

    if (this.hp < 1 && locked) {
      this.hp = 1;
      this.say('그래서 공지가 어디 있냐고요!', 1.4);
      if (!this.floorHinted) {
        this.floorHinted = true;
        this.scene.hint('안내문을 3번 붙여야 처리돼요!', '안내문 롤로 치거나, 들고 L(줍기 버튼)로 던지세요');
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.onZeroHp();
      return true;
    }
    // 행동 중에는 경직되지 않는다 (슈퍼아머)
    if (this.state === 'approach' || this.state === 'recover') {
      this.set('hurt');
      this.stateT = 0;
      this.vx = h.dir * (h.knockdown ? 200 : 60);
    }
    return true;
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 9;
    const sharp = studentPose(p, moving || this.state !== 'approach' ? this.state : 'idle', this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}
