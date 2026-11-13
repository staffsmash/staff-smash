import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { DEPTH_RANGE } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createDeanRig, createDizzyStars, spinStars } from './studentRigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 2스테이지 보스 "반사반사 결재부총장" (가상 인물, 가상 직함).
// - 큰 결재판으로 정면을 막고, 던진 무기는 되받아친다(반사).
// - 반사 직후 잠깐 결재판이 들려 정면이 빈다. 등 뒤도 빈틈이다 — 몸을 돌리는 데 시간이 걸린다.
// - 결재판 내려치기, 결재 서류 세 장 날리기, "전결 돌진"(지나간 뒤 등이 보인다).

const S = stats.bansaBoss;

export class BansaBoss extends Enemy implements BossLike {
  readonly kind = 'bansaBoss' as const;
  readonly student = true;
  readonly persuadable = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly halfW = 28;
  readonly height = 132;
  readonly bossName = '반사반사';
  readonly bossType = '결재부총장';
  thanksText = '결재… 올려 드리죠. 퇴근합니다…';
  private turnT = 0;
  private hitDone = false;
  private shots = 0;
  private cycle = 0;
  private walkPhase = 0;
  private blockSaid = 0;
  private blocks = 0;
  private stars: Phaser.GameObjects.Container | null = null;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createDeanRig(scene, 'bansa'), S.hp, 64, enterTargetX);
    this.baseScale = 1.22;
    this.cooldown = 1.4;
    this.setLabel('반사반사 · 결재부총장', '#ff9f9f');
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
    if (this.dead) return '';
    return this.state === 'open' ? '빈틈! 지금 설득하세요' : '정면 반사 중 · 등 뒤가 빈틈';
  }

  /** 결재판으로 정면을 막는 중인지 */
  private get guarding(): boolean {
    return !this.dead && this.state !== 'open' && this.state !== 'dash' && this.state !== 'hurt' && this.state !== 'bow';
  }

  /** 던진 무기를 되받아칠 수 있는지 (dir = 날아오는 방향) */
  canReflect(dir: number): boolean {
    return this.guarding && this.state !== 'enter' && dir === -this.facing;
  }

  /** 되받아친 직후: 결재판이 들려 정면이 빈다 */
  onReflected(): void {
    this.say('반사!', 0.9);
    this.set('open');
    this.vx = 0;
    this.vy = 0;
    fx.floatText(this.scene, this.x, this.y - this.height * this.baseScale - 34, '빈틈!', '#ffe066', 22);
  }

  /** 플레이어가 등 뒤에 있으면 잠시 뒤에 돌아선다 */
  private turnToward(player: Player, dt: number): void {
    const want = player.x >= this.x ? 1 : -1;
    if (want === this.facing) {
      this.turnT = 0;
      return;
    }
    this.turnT += dt;
    if (this.turnT >= S.turnDelay) {
      this.facing = want;
      this.turnT = 0;
    }
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        // approach()는 매 프레임 플레이어 쪽을 보게 하므로, 얼굴 방향은 따로 천천히 돌린다
        const facing = this.facing;
        const { dx, dy } = this.approach(player, 96, S.speedX, S.speedY);
        this.facing = facing;
        this.turnToward(player, dt);
        if (this.cooldown > 0 || !player.targetable || this.facing !== (dx >= 0 ? 1 : -1)) break;
        this.cycle++;
        if (this.cycle % 3 === 0) {
          this.set('dashWind');
          this.say('전결 처리합니다!', 1.0);
        } else if (Math.abs(dy) < 16 && Math.abs(dx) < 130) {
          this.set('windup');
        } else {
          this.set('throw');
          this.shots = 0;
          this.say('결재 서류 받으세요', 1.2);
        }
        this.vx = 0;
        this.vy = 0;
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.5) {
          this.set('swat');
          this.hitDone = false;
          this.vx = this.facing * 200;
        }
        break;
      case 'swat':
        if (!this.hitDone && this.meleeHit(player, 26, 2, 240)) this.hitDone = true;
        if (this.stateT >= 0.25) this.set('recover');
        break;
      case 'throw':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.4 && this.shots === 0) {
          this.shots = 1;
          for (const dy of [-34, 0, 34]) this.scene.fireProjectile(this, 'paper', dy);
        }
        if (this.stateT >= 0.9) this.set('recover');
        break;
      case 'dashWind':
        this.vx = 0;
        this.vy = 0;
        this.y += Phaser.Math.Clamp(player.y - this.y, -60 * dt, 60 * dt);
        if (this.stateT >= 0.6) {
          this.set('dash');
          this.hitDone = false;
          this.vx = this.facing * 560;
        }
        break;
      case 'dash': {
        if (!this.hitDone) {
          const close = Math.abs(player.x - this.x) < this.halfW + player.halfW + 6;
          if (close && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 34) {
            if (player.takeHit({ dmg: 2, dir: this.facing, kb: 260, knockdown: true })) {
              this.hitDone = true;
              fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
            }
          }
        }
        const left = this.scene.cameras.main.scrollX;
        if (this.stateT >= 0.8 || this.x <= left + 40 || this.x >= left + 920) {
          this.vx = 0;
          // 지나간 쪽을 본 채로 멈춘다: 등이 플레이어 쪽으로 보인다
          this.set('winded');
          this.say('후… 전결 끝.', 1.0);
        }
        break;
      }
      case 'winded':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.4) {
          this.turnT = 0;
          this.set('recover');
        }
        break;
      case 'open':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= S.openSec) {
          this.cooldown = 0.6;
          this.set('approach');
        }
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        this.vy = 0;
        this.turnToward(player, dt);
        if (this.stateT >= 0.6) {
          this.cooldown = 0.9 + Math.random() * 0.7;
          this.set('approach');
        }
        break;
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    const fromFront = h.dir === -this.facing;
    if (!h.force && fromFront && this.guarding) {
      // 결재판으로 막는다
      this.vx = h.dir * 40;
      this.blocks++;
      if (this.scene.time.now - this.blockSaid > 1600) {
        this.blockSaid = this.scene.time.now;
        this.say(this.blocks < 4 ? '결재판 보이시죠?' : '정면은 안 됩니다~', 1.0);
        fx.floatText(this.scene, this.x, this.y - this.height * this.baseScale - 24, '막힘! 등 뒤로 돌거나 던져 보세요', '#cfd6e3', 14);
      }
      return false;
    }
    this.rig.flash();
    this.hp -= h.dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.onZeroHp();
      return true;
    }
    if (!fromFront && this.state !== 'open') {
      // 등 뒤에서 설득당하면 놀라서 돌아본다
      this.turnT = S.turnDelay * 0.5;
    }
    if (this.state === 'approach' || this.state === 'recover' || this.state === 'winded') {
      this.set('hurt');
      this.resumeState = 'recover';
      this.vx = h.dir * (h.knockdown ? 180 : 50);
    }
    return true;
  }

  protected onZeroHp(): void {
    this.dead = true;
    this.set('bow');
    this.vx = 0;
    this.vy = 0;
    this.say(this.thanksText, 2.4);
    fx.floatText(this.scene, this.x, this.y - this.height - 40, '결재 완료!', '#7CFC9A', 24);
    this.stars = createDizzyStars(this.scene);
    this.scene.onEnemyDefeated(this);
  }

  protected afterSync(): void {
    super.afterSync();
    if (this.stars) {
      spinStars(this.stars, this.x + this.facing * 10, this.y - this.z - this.height * this.baseScale * 0.84, this.scene.time.now / 1000, this.y + 1);
      this.stars.setVisible(this.state === 'bow' || this.state === 'leaving');
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * (this.state === 'dash' ? 18 : 9);
    let sharp = 16;
    switch (this.state) {
      case 'open':
        // 결재판을 머리 위로 들어 올린 채 뽐낸다 (정면이 빈다)
        p.armF = -2.9;
        p.armB = -0.3;
        p.body = -0.12;
        sharp = 26;
        break;
      case 'windup':
        p.armF = -2.8;
        p.body = -0.15;
        sharp = 30;
        break;
      case 'swat':
        p.armF = -0.9;
        p.body = 0.25;
        sharp = 40;
        break;
      case 'winded':
        p.body = 0.35;
        p.armF = 0.2;
        p.armB = 0.2;
        p.bob = 2;
        break;
      case 'bow':
      case 'leaving':
      case 'hurt':
      case 'enter':
        sharp = studentPose(p, this.state, this.stateT, this.walkPhase);
        break;
      case 'dashWind':
        p.armF = -1.5;
        p.body = 0.3;
        p.legF = -0.5;
        p.legB = 0.5;
        sharp = 30;
        break;
      default: {
        // 걷거나 서 있을 때: 결재판을 앞으로 세워 든다
        if (moving) studentPose(p, 'approach', this.stateT, this.walkPhase);
        p.armF = -1.45;
        p.armB = -0.4;
        if (this.state === 'dash') {
          p.body = 0.35;
          sharp = 40;
        }
      }
    }
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.stars?.destroy();
    this.stars = null;
    super.destroy();
  }
}
