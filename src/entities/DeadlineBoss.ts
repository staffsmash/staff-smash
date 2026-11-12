import stats from '../data/enemies.json';
import { DEPTH_RANGE } from '../config';
import { TYPE_LABEL } from '../data/names';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createStudentRig } from './rigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 2스테이지 보스 "마감 1분 전에 오는 학생" (가상 인물, 이름은 매 판 무작위).
// - 화면 아래 마감 시계가 60초에서 줄어든다. 0이 되면 "연장해 주세요!" — 체력이 회복되고
//   게임 속 시계가 2분 흘러간다(초과근무). 시간 안에 처리해야 한다.
// - 급하게 돌진, 서류 세 장 흩뿌리기, 마감 서류 뭉치 떨어뜨리기.

const S = stats.deadlineBoss;
const EXTEND_SEC = 30;
const PENALTY_MIN = 2;

export class DeadlineBoss extends Enemy implements BossLike {
  readonly kind = 'deadlineBoss' as const;
  readonly student = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly halfW = 28;
  readonly height = 136;
  readonly bossName: string;
  readonly bossType = TYPE_LABEL.deadline;
  thanksText = '제출됐다! 1초 남기고! 감사합니다!';
  deadline = S.deadline;
  private walkPhase = 0;
  private hitDone = false;
  private shots = 0;
  private cycle = 0;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number, name: string) {
    super(scene, x, y, createStudentRig(scene, { jacket: 0xb45309, hair: 0x3b2a20, longHair: true }), S.hp, 64, enterTargetX);
    this.bossName = name;
    this.baseScale = 1.25;
    this.cooldown = 1.2;
    const rig = this.rig;
    rig.itemF.add(rig.part(0, 0, 26, 32, 0xffffff, 0.5, 0)); // 과제 뭉치
    rig.itemF.add(rig.part(2, 6, 18, 3, 0xd0202f, 0.5, 0, false));
    this.setLabel(name, '#ffb86b');
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
    const s = Math.max(0, Math.ceil(this.deadline));
    return `마감까지 0:${s.toString().padStart(2, '0')}`;
  }

  protected think(dt: number, player: Player): void {
    if (!this.dead && this.state !== 'enter') {
      this.deadline -= dt;
      if (this.deadline <= 0) this.extend();
    }
    switch (this.state) {
      case 'approach': {
        const { dx, dy } = this.approach(player, 110, S.speedX, S.speedY);
        if (this.cooldown > 0 || !player.targetable) break;
        this.cycle++;
        if (this.cycle % 3 === 0) {
          this.set('throw');
          this.shots = 0;
          this.say('이거 받아 주세요! 마감 직전이에요!', 1.4);
        } else if (Math.abs(dy) < 16 || Math.abs(dx) > 220) {
          this.set('windup');
          this.say('급해요 급해!', 0.9);
        } else {
          this.set('wave');
          this.say('이것도 같이 내 주세요!', 1.2);
        }
        this.vx = 0;
        this.vy = 0;
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 0.5) {
          this.set('dash');
          this.hitDone = false;
          this.vx = this.facing * 520;
        }
        break;
      case 'dash': {
        if (!this.hitDone) {
          const close = Math.abs(player.x - this.x) < this.halfW + player.halfW + 6;
          if (close && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 34) {
            if (player.takeHit({ dmg: 2, dir: this.facing, kb: 240, knockdown: false })) {
              this.hitDone = true;
              fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
            }
          }
        }
        const left = this.scene.cameras.main.scrollX;
        if (this.stateT >= 0.75 || this.x <= left + 30 || this.x >= left + 930) {
          this.vx = 0;
          this.set('recover');
        }
        break;
      }
      case 'throw': {
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 0.35 && this.shots === 0) {
          this.shots = 1;
          for (const dy of [-34, 0, 34]) this.scene.fireProjectile(this, 'paper', dy);
        }
        if (this.stateT >= 0.9) this.set('recover');
        break;
      }
      case 'wave':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.8) {
          this.scene.spawnBombNear(player.x, player.y);
          this.set('recover');
        }
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        if (this.stateT >= 0.7) {
          this.cooldown = 0.9 + Math.random() * 0.7;
          this.set('approach');
        }
        break;
    }
  }

  /** 마감 시각이 지나면: 연장 요청 → 체력 회복, 초과근무 */
  private extend(): void {
    this.deadline = EXTEND_SEC;
    this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.3));
    this.say('마감 연장해 주세요!! 딱 30초만요!', 2);
    this.scene.addPenalty(PENALTY_MIN, '마감 연장 · 초과근무 +2분');
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
    if (moving) this.walkPhase += dt * (this.state === 'dash' ? 20 : 10);
    const sharp = studentPose(p, moving || this.state !== 'approach' ? this.state : 'idle', this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}
