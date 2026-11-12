import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { FLOOR_BOTTOM, FLOOR_TOP, GAME_W } from '../config';
import { TYPE_LABEL } from '../data/names';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Clinger, Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createStudentRig, type StudentLook } from './rigs';
import * as fx from '../fx';

// 중간보스 민원 학생 (가상 인물, 이름은 매 판 무작위). 학생은 넘어지지 않고, 처리되면 인사하고 돌아간다.
// - 전화번호 잘못 입력한 학생: 화면 여기저기로 순간이동한다.
// - 서류 제출이 늦은 학생: 처리한 줄 알았는데 서류를 들고 한 번 더 온다.
// - 규정을 읽지 않고 떼쓰는 학생: 정면 공격을 막는다. 뒤에서 치거나 무엇이든 던져 맞히면 가드가 풀린다.
// - 졸업시켜 달라는 학생: 매달려서 느리게 만든다. 공격 버튼을 연타해 떼어 낸다.
// - 총장실로 메일 쓰는 학생: 메일을 다 쓰면 위에서 지시 사항이 떨어진다. 쓰는 중에 치면 멈춘다.

export type StudentKind = 'wrongNumber' | 'lateDoc' | 'tantrum' | 'graduation' | 'presidentMail';

const LOOKS: Record<StudentKind, StudentLook> = {
  wrongNumber: { jacket: 0x23315a, hair: 0x2a2420 },
  lateDoc: { jacket: 0x2f5d3a, hair: 0x5b3a24, longHair: true },
  tantrum: { jacket: 0x7c2d12, hair: 0x1f1a17 },
  graduation: { jacket: 0x374151, hair: 0x3b2a20, longHair: true },
  presidentMail: { jacket: 0x0f5c63, hair: 0x2a2420, earphones: true },
};

const LINES: Record<StudentKind, string[]> = {
  wrongNumber: ['문자 못 받았는데요?', '전화 주셨어요? 몰랐어요!', '번호요? 맞게 쓴 것 같은데…'],
  lateDoc: ['마감이 오늘이었어요?', '5분만 봐주시면 안 돼요?', '어제는 된다고 하셨잖아요!'],
  tantrum: ['그런 말 못 들었는데요?', '규정이 어디 있는데요?', '저는 처음 듣는데요!'],
  graduation: ['한 번만요!', '이번 학기만 봐주세요!', '학점 하나만요…'],
  presidentMail: ['총장님께 직접 여쭤볼게요!', '총장실에 메일 보냈어요!', '이거 총장님도 아세요?'],
};

type StudentStats = { hp: number; speedX: number; speedY: number };

/** 학생 공통 자세 (보스도 함께 쓴다) */
export function studentPose(p: Pose, state: string, t: number, phase: number): number {
  switch (state) {
    case 'enter':
    case 'approach':
    case 'leaving':
    case 'appear':
    case 'retrieve': {
      const s = Math.sin(phase);
      p.legF = s * 0.55;
      p.legB = -s * 0.55;
      p.armF = -s * 0.45;
      p.armB = s * 0.45;
      p.bob = -Math.abs(Math.cos(phase)) * 2.5;
      return 16;
    }
    case 'windup':
    case 'grab':
      p.armF = -2.3 + Math.sin(t * 30) * 0.15;
      p.armB = 0.5;
      p.body = -0.15;
      return 30;
    case 'shove':
    case 'flurry':
    case 'dash':
      p.armF = -1.45 + Math.sin(t * 40) * 0.25;
      p.armB = -1.3;
      p.body = 0.3;
      p.legF = -0.4;
      p.legB = 0.4;
      return 40;
    case 'throw':
    case 'wave':
      p.armF = -2.4 + Math.sin(t * 18) * 0.5;
      p.armB = 0.4;
      p.body = 0.05;
      return 24;
    case 'typing':
      p.armF = -1.3 + Math.sin(t * 30) * 0.1;
      p.armB = -1.1;
      p.body = 0.1;
      return 24;
    case 'cling':
      p.armF = -1.5;
      p.armB = -1.5;
      p.body = 0.35;
      p.legF = 0.5;
      p.legB = 0.6;
      return 20;
    case 'guard':
      p.armF = -1.7;
      p.armB = -1.6;
      p.body = -0.1;
      return 30;
    case 'recover':
      p.body = 0.1;
      return 16;
    case 'hurt':
      p.body = -0.3;
      p.armF = -0.6;
      p.armB = -0.5;
      return 30;
    case 'stagger':
    case 'guardbreak':
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

export class StudentEnemy extends Enemy implements Clinger {
  readonly kind: StudentKind;
  readonly student = true;
  readonly canRecheck = false;
  readonly halfW = 22;
  readonly height = 118;
  private readonly st: StudentStats;
  private teleT = 2.6;
  private actT: number;
  private comeback: boolean;
  private returning = false;
  private awayT = 0;
  private hitDone = false;
  private walkPhase = 0;
  private guardSaid = 0;
  private readonly papers: Phaser.GameObjects.Container;

  constructor(scene: StageScene, kind: StudentKind, x: number, y: number, enterTargetX: number, name: string) {
    const st = stats[kind] as StudentStats;
    super(scene, x, y, createStudentRig(scene, LOOKS[kind]), st.hp, 50, enterTargetX);
    this.kind = kind;
    this.st = st;
    this.baseScale = 1.1;
    this.comeback = kind === 'lateDoc';
    this.cooldown = 1.0;
    this.actT = kind === 'presidentMail' ? 2.5 : 0;

    const rig = this.rig;
    this.papers = new Phaser.GameObjects.Container(scene, 0, 0);
    this.papers.add(rig.part(0, 0, 24, 30, 0xffffff, 0.5, 0));
    this.papers.add(rig.part(3, 4, 24, 30, 0xf4f0e0, 0.5, 0));
    rig.itemF.add(this.papers);
    this.papers.setVisible(false);
    if (kind === 'wrongNumber' || kind === 'presidentMail') rig.itemF.add(rig.part(0, 0, 10, 18, 0x1b1b1f, 0.5, 0));
    if (kind === 'graduation') rig.itemF.add(rig.part(0, 0, 18, 24, 0xffffff, 0.5, 0)); // 졸업 사정 서류

    this.setLabel(`${name} · ${TYPE_LABEL[kind]}`);
    this.sync();
  }

  /** 정면 가드 중인지 (떼쓰는 학생) */
  private get guarding(): boolean {
    return this.kind === 'tantrum' && (this.state === 'approach' || this.state === 'guard' || this.state === 'recover');
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, this.kind === 'graduation' ? 40 : 74, this.st.speedX, this.st.speedY);
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
        if (this.kind === 'presidentMail') {
          this.actT -= dt;
          if (this.actT <= 0) {
            this.scene.releaseToken(this);
            this.vx = 0;
            this.vy = 0;
            this.set('typing');
            this.say('총장님께 메일 쓰는 중…', 1.8);
            return;
          }
        }
        if (this.kind === 'graduation') {
          if (!player.clingBy && player.targetable && this.cooldown <= 0 && Math.abs(dy) < 14 && Math.abs(dx) < 60) {
            this.set('grab');
            this.vx = 0;
            this.vy = 0;
            this.say('한 번만요!', 1.0);
          }
          break;
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
      case 'guard':
        this.vx *= Math.pow(0.001, dt);
        if (this.stateT >= 0.4) this.set('approach');
        break;
      case 'guardbreak':
        this.vx *= Math.pow(0.01, dt);
        if (this.stateT >= 2.4) this.set('approach');
        break;
      case 'grab': {
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.3) {
          const inRange = Math.abs(player.x - this.x) < 70 && Math.abs(player.y - this.y) < 18 && player.z < 20;
          if (inRange && !player.clingBy && player.targetable) {
            player.setCling(this);
            this.set('cling');
            this.say('졸업만 시켜 주세요… (J 연타로 떼어 내기)', 2.4);
          } else {
            this.cooldown = 1.2;
            this.set('approach');
          }
        }
        break;
      }
      case 'cling':
        // 플레이어 등에 매달려 따라간다
        this.x = player.x - player.facing * 18;
        this.y = player.y - 1;
        this.vx = 0;
        this.vy = 0;
        this.facing = player.facing;
        if (player.clingBy !== this) this.releaseCling();
        else if (this.stateT >= 3.5) player.releaseCling();
        break;
      case 'typing':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.8) {
          this.scene.dropOrders(player.x, player.y);
          this.say('총장실 답장 왔어요! 지시 사항이요!', 1.6);
          this.actT = stats.presidentMail.mailEvery + Math.random() * 1.5;
          this.set('recover');
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

  /** 플레이어가 떼어 냈을 때 */
  releaseCling(): void {
    if (this.state !== 'cling') return;
    this.set('stagger');
    this.vx = -this.facing * 240;
    this.cooldown = 3;
    this.say('으앗…', 0.8);
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    if (this.guarding && !h.force && !h.thrown) {
      const fromFront = h.dir === -this.facing;
      if (fromFront) {
        this.set('guard');
        this.vx = h.dir * 50;
        if (this.scene.time.now - this.guardSaid > 1500) {
          this.guardSaid = this.scene.time.now;
          this.say('그런 말 못 들었는데요?', 1.0);
          fx.floatText(this.scene, this.x, this.y - this.height - 30, '막힘! 뒤에서 치거나 던지기', '#cfd6e3', 14);
        }
        return false;
      }
    }
    if (this.state === 'cling') this.scene.player.releaseCling();
    if (this.state === 'typing') this.say('앗, 메일 날아갔다…', 1.0);
    const ok = super.takeHit(h);
    if (ok && this.kind === 'tantrum' && h.thrown && !this.dead) {
      this.set('guardbreak');
      this.stateT = 0;
      this.say('…규정에 있긴 하네요', 1.6);
    }
    return ok;
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
    if (this.state === 'cling') this.scene.player.releaseCling();
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
    let state = moving || this.state !== 'approach' ? this.state : 'idle';
    if (this.kind === 'tantrum' && state === 'idle') state = 'guard';
    const sharp = studentPose(p, state, this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}
