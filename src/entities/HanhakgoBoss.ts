import Phaser from 'phaser';
import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createDeanRig, createDizzyStars, spinStars } from './studentRigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 3스테이지 관문 보스 "한학고 · 영어대학 학장" (가상 인물, 2026-11-21 11차 — 예전 허허실실 부총장 기술).
// - 플레이어 양옆에 성적표 둘을 떨어뜨린다: A+는 회복(간식 자리), F는 잠깐 멈춤(일거리 자리). 어느 쪽인지는 무작위.
// - 떨어뜨린 뒤 성적표 묶음을 들고 반응을 본다 (빈틈). 그 사이사이 서류 세 장을 날리고, 가까우면 밀친다.
// - 설득되면 "…성적 정정, 승인합니다." 하고 걸어 나간다. 그 뒤 총장실로 간다.

const S = stats.hanhakgoBoss;
/** 등장·성적표 대사 (사용자 확정) */
export const HANHAKGO_LINE = '성적은 정정 기간에만 받습니다.';

export class HanhakgoBoss extends Enemy implements BossLike {
  readonly kind = 'hanhakgoBoss' as const;
  readonly student = true;
  readonly persuadable = true;
  readonly usesToken = false;
  readonly halfW = 28;
  readonly height = 132;
  readonly bossName = '한학고';
  readonly bossType = '영어대학 학장';
  thanksText = '…성적 정정, 승인합니다.';
  private gradeT = 2.4;
  private throwT = 3.2;
  private dropped = false;
  private hitDone = false;
  private walkPhase = 0;
  private greeted = false;
  private stars: Phaser.GameObjects.Container | null = null;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createDeanRig(scene, 'hanhakgo'), S.hp, 64, enterTargetX);
    this.baseScale = 1.22;
    this.cooldown = 1.4;
    this.setLabel('한학고 · 영어대학 학장', '#ff9f9f');
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
    return this.state === 'look' ? '빈틈! 지금 설득하세요' : '성적표 둘 중 하나는 F';
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        if (!this.greeted) {
          this.greeted = true;
          this.say(HANHAKGO_LINE, 2.2);
        }
        const { dx, dy } = this.approach(player, 150, S.speedX, S.speedY);
        this.gradeT -= dt;
        this.throwT -= dt;
        if (this.gradeT <= 0 && player.targetable && !this.scene.hasGrades()) {
          this.vx = 0;
          this.vy = 0;
          this.dropped = false;
          this.set('grades');
          this.say(HANHAKGO_LINE, 1.6);
          break;
        }
        if (this.cooldown <= 0 && player.targetable && Math.abs(dy) < 16 && Math.abs(dx) < 110) {
          this.vx = 0;
          this.vy = 0;
          this.set('windup');
          break;
        }
        if (this.throwT <= 0 && player.targetable) {
          this.throwT = 3.4 + Math.random();
          this.vx = 0;
          this.vy = 0;
          this.dropped = false;
          this.set('throw');
        }
        break;
      }
      case 'grades':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.dropped && this.stateT >= 0.45) {
          this.dropped = true;
          this.scene.dropGrades(this.x, player.x, player.y);
        }
        if (this.stateT >= 0.9) this.set('look');
        break;
      case 'look':
        // 성적표를 고르는지 지켜본다 (빈틈)
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 1.8) {
          this.gradeT = S.gradeEvery + Math.random() * 1.5;
          this.set('approach');
        }
        break;
      case 'throw':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.dropped && this.stateT >= 0.4) {
          this.dropped = true;
          for (const d of [-34, 0, 34]) this.scene.fireProjectile(this, 'paper', d);
        }
        if (this.stateT >= 0.9) this.set('approach');
        break;
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.5) {
          this.set('shove');
          this.hitDone = false;
          this.vx = this.facing * 220;
        }
        break;
      case 'shove':
        if (!this.hitDone && this.meleeHit(player, 22, 2, 220)) this.hitDone = true;
        if (this.stateT >= 0.25) {
          this.vx = 0;
          this.cooldown = 1.2 + Math.random() * 0.8;
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
    if (this.hp <= 0) {
      this.hp = 0;
      this.onZeroHp();
      return true;
    }
    if (this.state === 'approach') {
      this.set('hurt');
      this.resumeState = 'approach';
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
    fx.floatText(this.scene, this.x, this.y - this.height - 40, '승인 완료!', '#7CFC9A', 24);
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
    if (moving) this.walkPhase += dt * 9;
    let state = moving || this.state !== 'approach' ? this.state : 'idle';
    if (state === 'grades') state = this.stateT < 0.45 ? 'windup' : 'throw';
    else if (state === 'look') state = 'typing';
    const sharp = studentPose(p, state, this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.stars?.destroy();
    this.stars = null;
    super.destroy();
  }
}
