import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { HEROES, type HeroId } from '../data/heroes';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createStaffRig } from './rigs';
import { addWindowProp, createDizzyStars, spinStars, type WindowProp } from './studentRigs';
import { studentPose } from './StudentEnemy';
import * as fx from '../fx';

// 학생 모드 창구 중간보스: 가상 행정직원 6명 (외형은 교직원 모드 주인공과 같다, PRD 11절).
// 들어오면 자기 대사를 하고, 설득되면 "퇴근합니다…" 하며 걸어 나간다 (넘어지거나 다치지 않는다).
// - 박국제학사 "점호 시간입니다": 불을 끈다 → 화면이 어두워지고 플레이어 주변만 보인다
// - 김학생식당 "배식 마감입니다": 국자를 휘두르며 국물을 쏟는다 → 밟으면 미끄러진다
// - 이진취 "자소서 다시 써 오세요": 빨간 첨삭 선을 바닥에 그어 길을 막는다 (점프로 넘는다)
// - 김국제 "노미네이션 마감 지났어요": 여권·서류를 부채꼴로 던진다
// - 오학종지 "번호표 뽑고 기다리세요": 대기번호표 줄을 계속 부른다. 뽑는 동안 본체를 치면 멈춘다
// - 최장학 "신청 기간이 아닙니다": 동전을 뿌려 유인했다가 회수한다. 밟으면 잠깐 멈춘다

export type WindowStaffKind = 'haksa' | 'sikdang' | 'jinchwi' | 'gukje' | 'hakjong' | 'janghak';
export const WINDOW_STAFF_KINDS: WindowStaffKind[] = ['haksa', 'sikdang', 'jinchwi', 'gukje', 'hakjong', 'janghak'];

interface StaffInfo {
  hero: HeroId;
  prop: WindowProp;
  /** 등장 안내 띠에 쓰는 공략 */
  hint: string;
  /** 플레이어와 두는 거리 */
  keep: number;
}

export const WINDOW_STAFF: Record<WindowStaffKind, StaffInfo> = {
  haksa: { hero: 'parkhaksa', prop: 'flashlight', hint: '불이 꺼지면 내 주변만 보여요', keep: 80 },
  sikdang: { hero: 'kimsikdang', prop: 'ladle', hint: '쏟아진 국물을 밟으면 미끄러져요', keep: 95 },
  jinchwi: { hero: 'leejinchwi', prop: 'redpen', hint: '빨간 첨삭 선은 점프(K)로 넘을 수 있어요', keep: 90 },
  gukje: { hero: 'kimgukje', prop: 'passports', hint: '부채꼴로 날아오는 여권·서류를 피하세요', keep: 210 },
  hakjong: { hero: 'ohakjongji', prop: 'tickets', hint: '번호표를 뽑는 동안 본체를 치면 멈춰요', keep: 170 },
  janghak: { hero: 'choijanghak', prop: 'coins', hint: '동전은 미끼! 밟으면 잠깐 멈춰요', keep: 110 },
};

type Stats = { hp: number; speedX: number; speedY: number; gimmickEvery: number } & Record<string, number>;

export function windowStaffHero(kind: WindowStaffKind) {
  const id = WINDOW_STAFF[kind].hero;
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}

function buildRig(scene: Phaser.Scene, kind: WindowStaffKind): Rig {
  const rig = createStaffRig(scene, windowStaffHero(kind).look);
  addWindowProp(rig, WINDOW_STAFF[kind].prop);
  return rig;
}

export class WindowStaff extends Enemy {
  readonly kind: WindowStaffKind;
  /** 넘어지지 않고 비틀거린다 (학생과 같은 방식) */
  readonly student = true;
  readonly persuadable = true;
  readonly canRecheck = false;
  readonly halfW = 22;
  readonly height = 118;
  readonly name: string;
  readonly line: string;
  thanksText = '퇴근합니다…';
  private readonly info: StaffInfo;
  private readonly st: Stats;
  private gimmickT = 2.4;
  private acted = false;
  private hitDone = false;
  private introSaid = false;
  private walkPhase = 0;
  private stars: Phaser.GameObjects.Container | null = null;

  constructor(scene: StageScene, kind: WindowStaffKind, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, buildRig(scene, kind), (stats[kind] as Stats).hp, 50, enterTargetX);
    this.kind = kind;
    this.info = WINDOW_STAFF[kind];
    this.st = stats[kind] as Stats;
    const hero = windowStaffHero(kind);
    this.name = hero.name;
    this.line = hero.line;
    this.baseScale = 1.1;
    this.cooldown = 1.2;
    this.resumeState = 'intro';
    this.setLabel(`${hero.name} · 창구`, '#9fd3ff');
    this.sync();
  }

  protected think(dt: number, player: Player): void {
    switch (this.state) {
      case 'intro':
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.introSaid) {
          this.introSaid = true;
          this.say(this.line, 2.0);
        }
        if (this.stateT >= 1.0) {
          this.resumeState = 'approach';
          this.set('approach');
        }
        break;
      case 'approach': {
        const { dx, dy } = this.approach(player, this.info.keep, this.st.speedX, this.st.speedY);
        this.gimmickT -= dt;
        if (this.gimmickT <= 0 && player.targetable && this.gimmickReady()) {
          this.scene.releaseToken(this);
          this.vx = 0;
          this.vy = 0;
          this.acted = false;
          this.facing = dx >= 0 ? 1 : -1;
          this.set('gimmick');
          this.say(this.line, 1.6);
          return;
        }
        if (this.canStartAttack(player, dx, dy, this.kind === 'sikdang' ? 120 : 100)) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.42) {
          this.set('swing');
          this.hitDone = false;
          this.vx = this.facing * 260;
        }
        break;
      case 'swing':
        if (!this.hitDone && this.meleeHit(player, this.kind === 'sikdang' ? 30 : 12, 2, 200)) this.hitDone = true;
        if (this.stateT >= 0.22) this.set('recover');
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        this.vy = 0;
        if (this.stateT >= 0.55) {
          this.scene.releaseToken(this);
          this.cooldown = 1.3 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
      case 'gimmick':
        this.vx = 0;
        this.vy = 0;
        this.gimmick(player);
        break;
      case 'lure':
        // 최장학: 동전을 뿌려 놓고 기다린다 (이때가 빈틈)
        this.vx = 0;
        this.vy = 0;
        this.facing = player.x >= this.x ? 1 : -1;
        if (this.stateT >= 3.4 || !this.scene.hasCoins()) {
          this.set('collect');
          this.say('회수합니다~', 1.2);
          this.scene.collectCoins(this.x, this.y - 60);
        }
        break;
      case 'collect':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.9) this.endGimmick();
        break;
    }
  }

  /** 지금 기믹을 쓸 수 있는지 (같은 효과가 겹치지 않게) */
  private gimmickReady(): boolean {
    switch (this.kind) {
      case 'haksa':
        return !this.scene.isDark;
      case 'hakjong':
        return this.scene.countSlips() < this.st.maxSlips;
      case 'janghak':
        return !this.scene.hasCoins();
      default:
        return true;
    }
  }

  private gimmick(player: Player): void {
    const t = this.stateT;
    switch (this.kind) {
      case 'haksa':
        if (!this.acted && t >= 0.6) {
          this.acted = true;
          this.scene.lightsOut(this.st.darkSec);
        }
        if (t >= 1.0) this.endGimmick(this.st.darkSec);
        break;
      case 'sikdang':
        if (!this.acted && t >= 0.5) {
          this.acted = true;
          this.vx = this.facing * 200;
          this.meleeHit(player, 34, 2, 220);
          // 플레이어 쪽으로 국물을 쏟는다
          const reach = Phaser.Math.Clamp(player.x - this.x, -170, 170);
          this.scene.spillSoup(this.x + reach, player.y + Phaser.Math.Between(-10, 10), this.st.puddleSec);
        }
        if (t >= 0.5) this.vx *= 0.85;
        if (t >= 1.0) this.endGimmick();
        break;
      case 'jinchwi':
        if (!this.acted && t >= 0.7) {
          this.acted = true;
          this.scene.drawPenLines(player.x, this.st.lineSec);
        }
        if (t >= 1.1) this.endGimmick(1.5);
        break;
      case 'gukje':
        this.facing = player.x >= this.x ? 1 : -1;
        if (!this.acted && t >= 0.45) {
          this.acted = true;
          this.scene.fireFan(this, this.st.fan);
        }
        if (t >= 1.0) this.endGimmick();
        break;
      case 'hakjong':
        if (!this.acted && t >= 1.25) {
          this.acted = true;
          this.scene.summonTickets(this.st.chain);
        }
        if (t >= 1.5) this.endGimmick();
        break;
      case 'janghak':
        if (!this.acted && t >= 0.5) {
          this.acted = true;
          this.scene.scatterCoins(this.x, this.y, this.st.coins, this.st.freezeSec);
        }
        if (t >= 0.9) this.set('lure');
        break;
    }
  }

  private endGimmick(extra = 0): void {
    this.gimmickT = this.st.gimmickEvery + extra + Math.random() * 1.5;
    this.cooldown = 0.6;
    this.set('recover');
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    const busy = this.state === 'gimmick' || this.state === 'lure' || this.state === 'collect';
    if (busy && this.kind === 'hakjong' && this.state === 'gimmick' && !this.acted) {
      // 번호표 뽑는 중에 맞으면 멈춘다
      this.say('앗, 번호표 발행 중단…', 1.2);
      this.gimmickT = this.st.gimmickEvery + 1;
      return super.takeHit(h);
    }
    if (busy) {
      // 기믹 중에는 경직되지 않는다 (체력만 깎인다)
      this.scene.releaseToken(this);
      this.hp -= h.dmg;
      this.rig.flash();
      if (this.hp <= 0) {
        this.hp = 0;
        this.onZeroHp();
      }
      return true;
    }
    // 오학종지: 맞고 있는 동안은 번호표를 뽑지 못한다
    if (this.kind === 'hakjong') this.gimmickT = Math.max(this.gimmickT, 1.4);
    return super.takeHit(h);
  }

  /** 설득 완료: "퇴근합니다…" 하며 걸어 나간다 */
  protected onZeroHp(): void {
    this.dead = true;
    this.scene.releaseToken(this);
    this.set('bow');
    this.vx = 0;
    this.vy = 0;
    this.say(this.thanksText, 2.2);
    fx.floatText(this.scene, this.x, this.y - this.height - 30, '설득 완료!', '#7CFC9A', 18);
    this.stars = createDizzyStars(this.scene);
    this.scene.onWindowStaffDone(this);
    this.scene.onEnemyDefeated(this);
  }

  protected afterSync(): void {
    super.afterSync();
    if (this.stars) {
      const top = this.y - this.z - this.height * this.baseScale * 0.84;
      spinStars(this.stars, this.x + this.facing * 10, top, this.scene.time.now / 1000, this.y + 1);
      this.stars.setVisible(this.state === 'bow' || this.state === 'leaving');
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    const moving = this.vx !== 0 || this.vy !== 0;
    if (moving) this.walkPhase += dt * 10;
    let state = moving || this.state !== 'approach' ? this.state : 'idle';
    if (state === 'swing') state = 'shove';
    else if (state === 'intro') state = 'idle';
    else if (state === 'lure') state = 'recover';
    else if (state === 'collect') state = 'wave';
    else if (state === 'gimmick') {
      const early = this.stateT < 0.45;
      state = {
        haksa: early ? 'windup' : 'throw',
        sikdang: early ? 'windup' : 'shove',
        jinchwi: 'typing',
        gukje: early ? 'windup' : 'throw',
        hakjong: 'typing',
        janghak: early ? 'windup' : 'throw',
      }[this.kind];
    }
    const sharp = studentPose(p, state, this.stateT, this.walkPhase);
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.stars?.destroy();
    this.stars = null;
    super.destroy();
  }
}
