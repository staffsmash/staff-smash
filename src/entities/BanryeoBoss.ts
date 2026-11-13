import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { DEPTH_RANGE, FLOOR_BOTTOM, FLOOR_TOP, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createDeanRig, createDizzyStars, createDocTowerRig, spinStars } from './studentRigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 1스테이지 보스 "박반려 서류반려처장" (가상 인물, 가상 직함).
// - 서류 탑을 쌓고 그 뒤에 숨는다. 숨어 있는 동안은 설득할 수 없고, 탑 뒤에서 거대 "반려" 도장을 내리찍는다.
// - 탑을 무너뜨리면 잠깐 당황한 뒤 나와서 도장으로 내려친다. 시간이 지나거나 체력이 1/3씩 줄면 다시 탑을 쌓는다.
// - 설득되면 "반려 철회" — 넘어지지 않고 퇴근하며 물러난다.

const S = stats.banryeoBoss;
/** 탑 앞뒤 간격: 처장은 탑보다 조금 뒤(깊이 y가 작은 쪽)에 선다 */
const BEHIND = 24;

/** 박반려 처장의 서류 탑: 움직이지 않고 길을 막는다. 무너뜨려야 처장을 설득할 수 있다 */
export class DocTower extends Enemy {
  readonly kind = 'docTower' as const;
  readonly halfW = 32;
  readonly height = 126;
  readonly usesToken = false;
  readonly canRecheck = false;
  defeatText = '서류 탑 붕괴!';
  private shakeT = 0;

  constructor(scene: StageScene, x: number, y: number) {
    super(scene, x, y, createDocTowerRig(scene), S.towerHp, 70, x);
    this.state = 'rise';
    this.resumeState = 'stand';
    this.sync();
  }

  protected think(dt: number, player: Player): void {
    this.vx = 0;
    this.vy = 0;
    if (this.state === 'rise' && this.stateT >= 0.4) this.set('stand');
    if (this.shakeT > 0) this.shakeT -= dt;
    // 탑은 길을 막는다 (피해 없음)
    const px = player.x - this.x;
    if (Math.abs(px) < this.halfW + player.halfW && Math.abs(player.y - this.y) < 16 && player.z < 60) {
      this.scene.bumpPlayer(this, px >= 0 ? 1 : -1, false);
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead || this.removed) return false;
    this.hp -= h.dmg;
    this.rig.flash();
    this.shakeT = 0.18;
    if (this.hp <= 0) {
      this.hp = 0;
      for (let i = 0; i < 6; i++) {
        const sheet = this.scene.add.rectangle(this.x, this.y - 60, 22, 28, 0xffffff).setStrokeStyle(2, 0x1d1d22).setDepth(this.y + 2);
        this.scene.tweens.add({
          targets: sheet,
          x: this.x + Phaser.Math.Between(-120, 120),
          y: this.y + Phaser.Math.Between(-10, 20),
          angle: Phaser.Math.Between(-200, 200),
          alpha: 0,
          duration: 700,
          ease: 'Cubic.Out',
          onComplete: () => sheet.destroy(),
        });
      }
      this.die();
    }
    return true;
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    if (this.shakeT > 0) p.body = Math.sin(this.scene.time.now / 20) * 0.06;
    if (this.state === 'dying') p.body = -0.5;
    this.rig.update(dt, p, 30);
  }

  protected afterSync(): void {
    super.afterSync();
    if (this.state === 'rise') this.rig.root.setScale(this.baseScale, Math.min(1, this.stateT / 0.4) * this.baseScale);
  }
}

export class BanryeoBoss extends Enemy implements BossLike {
  readonly kind = 'banryeoBoss' as const;
  readonly student = true;
  readonly persuadable = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly halfW = 28;
  readonly height = 132;
  readonly bossName = '박반려';
  readonly bossType = '서류반려처장';
  thanksText = '반려… 철회합니다. 퇴근합니다…';
  tower: DocTower | null = null;
  private slamT = 1.6;
  private exposedT = 0;
  private hitDone = false;
  private walkPhase = 0;
  private thresholds = [S.hp * (2 / 3), S.hp / 3];
  private spotX = 0;
  private slammed = false;
  /** 'build'에 들어오면 한 번 탑을 세운다 */
  private needTower = true;
  private stars: Phaser.GameObjects.Container | null = null;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createDeanRig(scene, 'banryeo'), S.hp, 64, enterTargetX);
    this.baseScale = 1.22;
    this.resumeState = 'build';
    this.setLabel('박반려 · 서류반려처장', '#ff9f9f');
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

  private get towerUp(): boolean {
    return !!this.tower && !this.tower.dead && !this.tower.removed;
  }

  bossExtra(): string {
    if (this.towerUp && this.tower) {
      const t = this.tower;
      return `서류 탑 ${'■'.repeat(Math.max(0, Math.ceil(t.hp / 2)))}${'□'.repeat(Math.max(0, Math.ceil((t.maxHp - t.hp) / 2)))}`;
    }
    return this.dead ? '' : '빈틈! 지금 설득하세요';
  }

  get hittable(): boolean {
    if (this.state === 'hide' || this.state === 'peek' || this.state === 'build') return false;
    return super.hittable;
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'build': {
        // 탑 쌓기: 자리를 잡고 눈앞에 서류 탑을 세운다
        this.vx = 0;
        this.vy = 0;
        if (this.needTower && !this.towerUp) {
          this.needTower = false;
          this.say('이 서류는 반려입니다!', 1.4);
          const tx = Phaser.Math.Clamp(this.x, this.camLeft + 90, this.camLeft + GAME_W - 90);
          const ty = Phaser.Math.Clamp(this.y + BEHIND, FLOOR_TOP + BEHIND + 4, FLOOR_BOTTOM);
          this.x = tx;
          this.y = ty - BEHIND;
          this.tower = this.scene.spawnDocTower(tx, ty);
          this.facing = player.x >= this.x ? 1 : -1;
        }
        if (this.stateT >= 0.6) {
          this.slamT = 1.2;
          this.set('hide');
        }
        break;
      }
      case 'hide':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.towerUp) {
          this.set('flustered');
          this.say('제 서류 탑이…!', 1.2);
          this.exposedT = S.exposedSec;
          break;
        }
        this.slamT -= dt;
        if (this.slamT <= 0 && player.targetable) this.startPeek();
        break;
      case 'peek':
        // 탑 위로 몸을 내밀어 거대 도장을 내리찍는다
        this.vx = 0;
        this.vy = 0;
        if (!this.slammed && this.stateT >= 0.35) {
          this.slammed = true;
          this.scene.slamStamp(player.x + player.vx * 0.3, player.y, '반려', 1.0);
          this.say('반려!', 0.8);
        }
        if (this.stateT >= 0.8) {
          this.slamT = S.slamEvery + Math.random() * 0.8;
          this.set(this.towerUp ? 'hide' : 'flustered');
        }
        break;
      case 'flustered':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.1) this.set('approach');
        break;
      case 'approach': {
        this.exposedT -= dt;
        const crossed = this.thresholds.length > 0 && this.hp <= this.thresholds[0];
        if (this.exposedT <= 0 || crossed) {
          if (crossed) this.thresholds.shift();
          this.startRetreat(player);
          break;
        }
        const { dx, dy } = this.approach(player, 84, S.speedX, S.speedY);
        if (this.cooldown <= 0 && player.targetable && Math.abs(dy) < 16 && Math.abs(dx) < 120) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          this.say('반려합니다!', 0.9);
        } else if (this.cooldown <= 0 && player.targetable && Math.abs(dx) > 260) {
          this.startPeek();
          this.vx = 0;
          this.vy = 0;
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.55) {
          this.set('slam');
          this.hitDone = false;
        }
        break;
      case 'slam':
        if (!this.hitDone) {
          this.hitDone = true;
          const ddx = (player.x - this.x) * this.facing;
          if (ddx > -10 && ddx < 110 && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 34) {
            if (player.takeHit({ dmg: 2, dir: this.facing, kb: 220, knockdown: true })) fx.hitSpark(this.scene, player.x, player.y - 60);
          }
          fx.stampMark(this.scene, this.x + this.facing * 70, this.y - 6, '반려');
          this.scene.cameras.main.shake(90, 0.005);
        }
        if (this.stateT >= 0.6) {
          this.cooldown = 1.0 + Math.random() * 0.6;
          this.set('approach');
        }
        break;
      case 'retreat': {
        const dx = this.spotX - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = Math.abs(dx) > 8 ? Math.sign(dx) * S.speedX * 1.6 : 0;
        this.vy = 0;
        if (Math.abs(dx) <= 8 || this.stateT > 2.5) this.set('build');
        break;
      }
    }
  }

  private startPeek(): void {
    this.slammed = false;
    this.set('peek');
  }

  private get camLeft(): number {
    return this.scene.cameras.main.scrollX;
  }

  /** 플레이어 반대편으로 물러나 탑을 다시 쌓는다 */
  private startRetreat(player: Player): void {
    const left = this.camLeft;
    this.spotX = player.x - left < GAME_W / 2 ? left + GAME_W - 150 : left + 150;
    this.say('잠깐, 서류 다시 쌓겠습니다.', 1.4);
    this.needTower = true;
    this.set('retreat');
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
    if (this.state === 'approach' || this.state === 'flustered') {
      this.set('hurt');
      this.resumeState = 'approach';
      this.vx = h.dir * (h.knockdown ? 200 : 60);
    }
    return true;
  }

  protected onZeroHp(): void {
    this.dead = true;
    this.set('bow');
    this.vx = 0;
    this.vy = 0;
    this.say(this.thanksText, 2.4);
    fx.floatText(this.scene, this.x, this.y - this.height - 40, '반려 철회!', '#7CFC9A', 24);
    this.stars = createDizzyStars(this.scene);
    this.scene.onEnemyDefeated(this);
  }

  protected afterSync(): void {
    super.afterSync();
    if (this.state === 'peek') {
      const k = Math.sin(Math.min(1, this.stateT / 0.8) * Math.PI);
      this.rig.root.y -= k * 26;
    }
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
    if (state === 'peek') state = this.stateT < 0.35 ? 'windup' : 'shove';
    else if (state === 'slam') state = 'shove';
    else if (state === 'hide' || state === 'build') state = 'typing';
    else if (state === 'flustered') state = 'stagger';
    else if (state === 'retreat') state = 'approach';
    const sharp = studentPose(p, state, this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.stars?.destroy();
    this.stars = null;
    super.destroy();
  }
}
