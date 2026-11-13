import stats from '../data/enemies.json';
import { DEPTH_RANGE, FLOOR_TOP } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createPresidentRig } from './rigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 최종 보스 "프레지던트 캉" (총장실 승인을 받은 등장, PRD 4절).
// - 1페이즈: 거대 도장. 플레이어를 따라 도장 세 개가 차례로 떨어지고, 가까우면 도장으로 내려친다.
// - 2페이즈(체력 절반 이하): "수강신청 서버 폭주" — 오류 창과 패킷이 쏟아지는 탄막. 그동안 캉은 뒤에서 서버를 살핀다.
// - 체력이 다해도 쓰러지지 않는다: "좋아요, 검토 끝났습니다." 하고 선 채로 승인(엔딩)으로 넘어간다.

const S = stats.presidentBoss;

export class PresidentBoss extends Enemy implements BossLike {
  readonly kind = 'presidentBoss' as const;
  readonly student = true;
  readonly persuadable = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly staysAfter = true;
  readonly halfW = 28;
  readonly height = 140;
  readonly bossName = '프레지던트 캉';
  readonly bossType = '최종 결재';
  thanksText = '좋아요, 검토 끝났습니다.';
  phase: 1 | 2 = 1;
  private hitDone = false;
  private drops = 0;
  private cycle = 0;
  private stormT = 0;
  private walkPhase = 0;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createPresidentRig(scene), S.hp, 66, enterTargetX);
    this.baseScale = 1.25;
    this.cooldown = 1.6;
    this.resumeState = 'greet';
    this.setLabel('프레지던트 캉', '#ffe066');
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
    if (this.dead) return '승인!';
    if (this.state === 'server') return '수강신청 서버 폭주 중';
    return this.phase === 1 ? '1페이즈 · 거대 도장' : '2페이즈 · 수강신청 서버 폭주';
  }

  protected think(dt: number, player: Player): void {
    if (this.phase === 2 && !this.dead && this.state !== 'server' && this.state !== 'serverMove') this.stormT -= dt;
    switch (this.state) {
      case 'greet':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT < 0.05) this.say('졸업 서류요? 한번 검토해 봅시다.', 2.2);
        if (this.stateT >= 1.4) {
          this.resumeState = 'approach';
          this.set('approach');
        }
        break;
      case 'approach': {
        if (this.phase === 1 && this.hp <= this.maxHp / 2) {
          this.startPhase2();
          break;
        }
        if (this.phase === 2 && this.stormT <= 0) {
          this.set('serverMove');
          this.say('어? 수강신청 서버가…!', 1.6);
          break;
        }
        const { dx, dy } = this.approach(player, 110, S.speedX, S.speedY);
        if (this.cooldown > 0 || !player.targetable) break;
        this.cycle++;
        if (Math.abs(dy) < 16 && Math.abs(dx) < 130 && this.cycle % 3 !== 0) {
          this.set('windup');
          this.say(this.phase === 1 ? '보류!' : '재검토!', 0.8);
        } else {
          this.set('stamps');
          this.drops = 0;
          this.say(this.phase === 1 ? '검토하겠습니다.' : '꼼꼼히 다시 봅시다.', 1.2);
        }
        this.vx = 0;
        this.vy = 0;
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 0.55) {
          this.set('slam');
          this.hitDone = false;
        }
        break;
      case 'slam':
        if (!this.hitDone) {
          this.hitDone = true;
          const ddx = (player.x - this.x) * this.facing;
          if (ddx > -10 && ddx < 120 && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 34) {
            if (player.takeHit({ dmg: 2, dir: this.facing, kb: 240, knockdown: true })) {
              fx.hitSpark(this.scene, player.x, player.y - 60);
            }
          }
          fx.stampMark(this.scene, this.x + this.facing * 76, this.y - 6, '보류');
          this.scene.cameras.main.shake(110, 0.006);
        }
        if (this.stateT >= 0.6) this.recover();
        break;
      case 'stamps': {
        // 거대 도장: 플레이어를 따라 차례로 떨어진다 (2페이즈는 네 개, 더 빠르게)
        this.vx = 0;
        this.vy = 0;
        const n = this.phase === 1 ? 3 : 4;
        const gap = this.phase === 1 ? 0.5 : 0.38;
        const k = Math.floor((this.stateT - 0.4) / gap);
        if (this.stateT >= 0.4 && k >= this.drops && this.drops < n) {
          this.drops++;
          this.scene.slamStamp(player.x + player.vx * 0.35, player.y + player.vy * 0.35, this.phase === 1 ? '보류' : '재검토', 0.85);
        }
        if (this.stateT >= 0.4 + gap * n + 0.3) this.recover();
        break;
      }
      case 'serverMove': {
        // 뒤쪽(책상 앞)으로 물러나 서버를 살핀다
        const tx = this.scene.cameras.main.scrollX + 480;
        const ty = FLOOR_TOP + 14;
        const dx = tx - this.x;
        const dy = ty - this.y;
        this.facing = player.x >= this.x ? 1 : -1;
        this.vx = Math.abs(dx) > 8 ? Math.sign(dx) * S.speedX * 1.6 : 0;
        this.vy = Math.abs(dy) > 6 ? Math.sign(dy) * S.speedY * 1.6 : 0;
        if ((Math.abs(dx) <= 8 && Math.abs(dy) <= 6) || this.stateT > 2.2) {
          this.vx = 0;
          this.vy = 0;
          this.set('server');
          this.scene.startServerStorm(S.stormSec);
          this.say('서버 증설을 검토하겠습니다!', 2.0);
        }
        break;
      }
      case 'server':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= S.stormSec) {
          this.stormT = S.stormEvery;
          this.say('휴, 서버 복구됐습니다.', 1.4);
          this.recover();
        }
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        this.vy = 0;
        if (this.stateT >= 0.7) this.set('approach');
        break;
      case 'approved':
        // 승인: 선 채로 학생을 본다
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        break;
    }
  }

  private recover(): void {
    this.cooldown = this.phase === 1 ? 1.1 + Math.random() * 0.6 : 0.7 + Math.random() * 0.5;
    this.set('recover');
  }

  private startPhase2(): void {
    this.phase = 2;
    this.stormT = 0;
    this.set('serverMove');
    this.say('잠깐, 수강신청 서버가…!', 1.8);
    this.scene.hint('2페이즈 · 수강신청 서버 폭주!', '쏟아지는 오류 창(빨간 표시)과 패킷을 피하며 설득하세요');
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    this.rig.flash();
    this.facing = h.dir > 0 ? -1 : 1;
    this.hp -= h.dmg;
    if (this.phase === 1 && this.hp <= 0) this.hp = 1; // 1페이즈에서 바로 끝나지 않게
    if (this.hp <= 0) {
      this.hp = 0;
      this.onZeroHp();
      return true;
    }
    if (this.state === 'approach' || this.state === 'recover') {
      this.set('hurt');
      this.vx = h.dir * (h.knockdown ? 160 : 40);
    }
    return true;
  }

  /** 체력이 다하면 쓰러지지 않고 승인한다 */
  protected onZeroHp(): void {
    this.dead = true;
    this.set('approved');
    this.vx = 0;
    this.vy = 0;
    this.say(this.thanksText, 4);
    fx.floatText(this.scene, this.x, this.y - this.height * this.baseScale - 30, '검토 완료!', '#7CFC9A', 26);
    this.scene.onEnemyDefeated(this);
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 9;
    let sharp = 16;
    const t = this.scene.time.now / 1000;
    switch (this.state) {
      case 'greet':
        p.armF = -2.2 + Math.sin(t * 8) * 0.25; // 손 인사
        sharp = 14;
        break;
      case 'windup':
        p.armF = -2.9;
        p.body = -0.14;
        sharp = 30;
        break;
      case 'slam':
        p.armF = -0.9;
        p.body = 0.26;
        p.legF = -0.4;
        p.legB = 0.35;
        sharp = 40;
        break;
      case 'stamps':
        p.armF = -2.6 + Math.sin(t * 14) * 0.3;
        p.armB = -2.4 - Math.sin(t * 14) * 0.3;
        sharp = 24;
        break;
      case 'server':
        sharp = studentPose(p, 'typing', this.stateT, this.walkPhase);
        break;
      case 'approved':
        // 다 읽었다는 듯 도장을 가슴 앞에 든다
        p.armF = -1.2;
        p.armB = 0.1;
        p.bob = Math.sin(t * 2) * 0.8;
        sharp = 10;
        break;
      default:
        sharp = studentPose(p, moving || this.state !== 'approach' ? this.state : 'idle', this.stateT, this.walkPhase);
    }
    this.rig.update(dt, p, sharp);
  }
}
