import stats from '../data/enemies.json';
import type { StageScene } from '../scenes/StageScene';
import { Enemy, type BossLike } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createChonghakRig, type ChonghakRole } from './rigs';
import { studentPose } from './StudentEnemy';

// 3스테이지 최종 보스 "총학 집행부" 3명 (가상 인물). 한 사람이 특정되지 않게 팀으로 나온다 (PRD 4절).
// - 김데시벨: 거리를 두고 확성기 음파를 쏜다.
// - 오시위: 대자보로 정면(던진 것 포함)을 막는다. 요구안을 던질 때와 뒤쪽이 빈틈이다.
// - 박드러누움: 연좌 농성으로 누워 길을 막는다. 다른 둘을 처리해야 일어나서 맞선다.
// 셋 다 처리하면 "총장 면담"을 요청하고 프레지던트 캉이 내려온다(엔딩).

const NAMES: Record<ChonghakRole, string> = { decibel: '김데시벨', protest: '오시위', sitin: '박드러누움' };
const THANKS: Record<ChonghakRole, string> = {
  decibel: '목이 다 쉬었네요… 감사합니다!',
  protest: '요구안 접수 확인했습니다. 감사합니다!',
  sitin: '농성 해제합니다. 감사합니다!',
};

export class ChonghakMember extends Enemy {
  readonly kind = 'chonghak' as const;
  readonly student = true;
  readonly canRecheck = false;
  readonly usesToken = false;
  readonly halfW = 24;
  readonly height = 124;
  readonly role: ChonghakRole;
  private readonly group: ChonghakGroup;
  private walkPhase = 0;
  private actT: number;
  private hitDone = false;
  private shots = 0;
  private guardSaid = 0;

  constructor(scene: StageScene, role: ChonghakRole, x: number, y: number, enterTargetX: number, group: ChonghakGroup) {
    super(scene, x, y, createChonghakRig(scene, role), stats[role].hp, 52, enterTargetX);
    this.role = role;
    this.group = group;
    this.baseScale = 1.15;
    this.thanksText = THANKS[role];
    this.actT = role === 'decibel' ? 1.5 : 2.5;
    if (role === 'sitin') {
      this.state = 'sitin';
      this.resumeState = 'approach';
    }
    this.setLabel(`${NAMES[role]} · 총학 집행부`, '#ff9f9f');
    this.sync();
  }

  /** 박드러누움: 나머지 둘이 처리되면 일어난다 */
  wake(): void {
    if (this.state !== 'sitin') return;
    this.set('standup');
    this.say('…이제 제 차례인가요?', 1.6);
  }

  private get guarding(): boolean {
    return this.role === 'protest' && (this.state === 'approach' || this.state === 'recover' || this.state === 'guard');
  }

  protected think(dt: number, player: Player): void {
    const st = stats[this.role];
    switch (this.state) {
      case 'sitin': {
        this.vx = 0;
        this.vy = 0;
        if (this.stateT > 4 && Math.random() < dt * 0.25) {
          this.say('면담해 주실 때까지 안 일어납니다!', 1.6);
          this.stateT = 0;
        }
        // 누워서 길을 막는다
        const px = player.x - this.x;
        if (Math.abs(px) < 58 + player.halfW && Math.abs(player.y - this.y) < 20 && player.z < 20) {
          this.scene.bumpPlayer(this, px >= 0 ? 1 : -1, false);
        }
        break;
      }
      case 'standup':
        if (this.stateT >= 1.0) this.set('approach');
        break;
      case 'approach': {
        const keep = this.role === 'decibel' ? 260 : this.role === 'protest' ? 120 : 70;
        const { dx, dy } = this.approach(player, keep, st.speedX, st.speedY);
        this.actT -= dt;
        if (this.actT > 0 || !player.targetable) break;
        if (this.role === 'decibel') {
          this.set('windup');
          this.say('확성기 음파!', 0.9);
        } else if (this.role === 'protest') {
          this.set('throw');
          this.shots = 0;
          this.say('요구안 받아 주세요!', 1.2);
        } else if (Math.abs(dy) < 14 && Math.abs(dx) < 110) {
          this.set('windup');
          this.say('면담 요청합니다!', 0.9);
        } else {
          break;
        }
        this.vx = 0;
        this.vy = 0;
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= (this.role === 'sitin' ? 0.6 : 0.5)) {
          if (this.role === 'decibel') {
            this.scene.fireProjectile(this, 'sonic', 0);
            this.set('recover');
          } else {
            this.set('shove');
            this.hitDone = false;
            this.vx = this.facing * 300;
          }
        }
        break;
      case 'shove':
        if (!this.hitDone && this.meleeHit(player, 14, 2, 240)) this.hitDone = true;
        if (this.stateT >= 0.22) this.set('recover');
        break;
      case 'throw':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 0.4 && this.shots === 0) {
          this.shots = 1;
          for (const dy of [-32, 0, 32]) this.scene.fireProjectile(this, 'demand', dy);
        }
        if (this.stateT >= 0.9) this.set('recover');
        break;
      case 'guard':
        this.vx *= Math.pow(0.001, dt);
        if (this.stateT >= 0.4) this.set('approach');
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        if (this.stateT >= 0.6) {
          this.actT = (this.role === 'decibel' ? 2.2 : 3.0) + Math.random();
          this.set('approach');
        }
        break;
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    if (this.guarding && !h.force && h.dir === -this.facing) {
      // 대자보로 정면을 막는다 (던진 것도)
      this.set('guard');
      this.vx = h.dir * 40;
      if (this.scene.time.now - this.guardSaid > 1500) {
        this.guardSaid = this.scene.time.now;
        this.say('대자보 보이시죠?', 1.0);
      }
      return false;
    }
    return super.takeHit(h);
  }

  protected onZeroHp(): void {
    super.onZeroHp();
    this.group.memberDone();
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    if (this.state === 'sitin') {
      p.body = -Math.PI / 2;
      p.bob = -20;
      p.armF = -2.6;
      p.armB = -2.6;
      this.rig.update(dt, p, 12);
      return;
    }
    if (this.state === 'standup') {
      p.body = -0.5 * (1 - Math.min(1, this.stateT));
      p.legF = -0.5;
      p.legB = 0.5;
      this.rig.update(dt, p, 10);
      return;
    }
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 10;
    let state = moving || this.state !== 'approach' ? this.state : 'idle';
    if (this.role === 'protest' && (state === 'idle' || state === 'approach')) state = 'guard';
    if (this.role === 'decibel' && state === 'windup') state = 'throw';
    const sharp = studentPose(p, state, this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }
}

/** 세 명을 한 보스로 묶어 체력바에 보여 준다 */
export class ChonghakGroup implements BossLike {
  readonly bossName = '총학 집행부';
  readonly bossType = '김데시벨 · 오시위 · 박드러누움';
  members: ChonghakMember[] = [];
  private readonly scene: StageScene;

  constructor(scene: StageScene) {
    this.scene = scene;
  }

  get bossHp(): number {
    return this.members.reduce((s, m) => s + Math.max(0, m.dead ? 0 : m.hp), 0);
  }

  get bossMaxHp(): number {
    return this.members.reduce((s, m) => s + m.maxHp, 0);
  }

  get bossGone(): boolean {
    return this.members.length > 0 && this.members.every((m) => m.removed);
  }

  get allDone(): boolean {
    return this.members.length > 0 && this.members.every((m) => m.dead);
  }

  bossExtra(): string {
    return `남은 인원 ${this.members.filter((m) => !m.dead).length}/3`;
  }

  memberDone(): void {
    const others = this.members.filter((m) => m.role !== 'sitin');
    if (others.every((m) => m.dead)) this.members.find((m) => m.role === 'sitin')?.wake();
    if (this.allDone) this.scene.onChonghakDone();
  }
}
