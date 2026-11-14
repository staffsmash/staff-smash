import Phaser from 'phaser';
import { DEPTH_RANGE, FONT, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Fighter, type HitInfo } from './Fighter';
import type { Player } from './Player';
import type { Rig } from './Rig';
import * as fx from '../fx';

// 모든 적의 공통 부분: 등장·피격·다운·기상·퇴장 상태와 판정, 이름표·말풍선.
// 사물(메일·전화기 등)은 넘어지고, 학생은 넘어지지 않고 비틀거리다가 인사하고 돌아간다 (PRD 4절).
// 학생 모드의 창구 직원·처장·부총장·총장도 넘어지지 않는다 — 맞는 것은 "설득"이고, 설득되면 퇴근하며 물러난다.

export type EnemyKind =
  | 'mail'
  | 'phone'
  | 'bubble'
  | 'docbomb'
  | 'queue'
  | 'wrongNumber'
  | 'lateDoc'
  | 'tantrum'
  | 'graduation'
  | 'presidentMail'
  | 'minwon'
  | 'noticeBoss'
  | 'deadlineBoss'
  | 'chonghak'
  // 학생 모드: 창구 중간보스(가상 행정직원), 보스
  | 'haksa'
  | 'sikdang'
  | 'jinchwi'
  | 'gukje'
  | 'hakjong'
  | 'janghak'
  | 'banryeoBoss'
  | 'docTower'
  | 'bansaBoss'
  | 'presidentBoss';

/** 보스 체력바에 보여 줄 정보 */
export interface BossLike {
  readonly bossName: string;
  readonly bossType: string;
  readonly bossHp: number;
  readonly bossMaxHp: number;
  bossExtra(): string;
  /** 처리가 끝나 화면에서 사라졌는지 */
  readonly bossGone: boolean;
}

const NON_HITTABLE = new Set(['down', 'getup', 'dying', 'hidden', 'vanish', 'away', 'bow', 'leaving', 'drop', 'sitin']);
const NO_CLAMP = new Set(['enter', 'leaving', 'away']);
/** 멈춰 있어도 그대로 진행하는 공통 상태 (맞고 밀리기·넘어지기·처리되기) */
const REACTING = new Set(['hurt', 'stagger', 'down', 'getup', 'bow', 'leaving', 'dying']);
/** 단톡방 공지 캡처로 멈춘 잡몹의 색 */
const FROST = 0x9fd3ff;
let nextUid = 1;

export abstract class Enemy extends Fighter {
  abstract readonly kind: EnemyKind;
  state = 'enter';
  hasToken = false;
  dead = false;
  /** 오검토 처장의 재검토를 기다리는 중 (사라지지 않고 누워 있다) */
  holdForRecheck = false;
  readonly uid = nextUid++;
  /** 학생 캐릭터: 넘어뜨리지 않는다 */
  readonly student: boolean = false;
  /** 가벼운 적: 넘어지지 않고 밀려나며, 체력이 다하면 바로 사라진다 */
  readonly light: boolean = false;
  readonly canRecheck: boolean = true;
  /** 학생 모드의 사람(창구 직원·보스): 맞힌 자리에 "설득" 도장이 찍힌다 */
  readonly persuadable: boolean = false;
  /** 처리된 뒤에도 화면에 남아 구역 정리를 막지 않는다 (프레지던트 캉) */
  readonly staysAfter: boolean = false;
  /** 동시 공격 제한(토큰)을 따르는지 */
  readonly usesToken: boolean = true;
  defeatText = '처리 완료';
  thanksText = '감사합니다!';
  protected cooldown = 0.6 + Math.random() * 0.8;
  protected enterTargetX: number;
  protected resumeState = 'approach';
  protected hurtTime = 0.32;
  protected leaveDir = 1;
  protected laneOffset = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30);
  protected readonly scene: StageScene;
  private label: Phaser.GameObjects.Text | null = null;
  private speech: Phaser.GameObjects.Text | null = null;
  private speechT = 0;
  /** 단톡방 공지 캡처: 남은 멈춤 시간 (초)과 머리 위 "…" */
  frozenT = 0;
  private frostMark: Phaser.GameObjects.Text | null = null;

  constructor(scene: StageScene, x: number, y: number, rig: Rig, hp: number, shadowW: number, enterTargetX: number) {
    super(scene, x, y, rig, hp, shadowW);
    this.scene = scene;
    this.enterTargetX = enterTargetX;
    this.facing = enterTargetX >= x ? 1 : -1;
  }

  protected set(s: string): void {
    if (this.state !== s) this.stateT = 0;
    this.state = s;
  }

  get hittable(): boolean {
    if (this.invuln > 0 || this.dead) return false;
    return !NON_HITTABLE.has(this.state);
  }

  /** 공통 상태가 아닐 때 매 프레임 부르는 적 고유 행동 */
  protected abstract think(dt: number, player: Player): void;
  /** 상태에 맞는 자세를 잡는다 */
  protected abstract pose(dt: number): void;

  /** 단톡방 공지 캡처: sec초 동안 제자리에 멈춘다 (움직이지도 공격하지도 않는다. 맞으면 밀리기는 한다) */
  freezeFor(sec: number): boolean {
    if (this.dead || this.removed) return false;
    this.frozenT = Math.max(this.frozenT, sec);
    this.scene.releaseToken(this);
    this.rig.setTint(FROST);
    if (!this.frostMark) {
      this.frostMark = this.scene.add
        .text(this.x, this.y, '…', {
          fontFamily: FONT,
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#9fd3ff',
          stroke: '#111318',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
    }
    return true;
  }

  /** 멈춤을 푼다 */
  protected thaw(): void {
    this.frozenT = 0;
    this.rig.setTint(null);
    this.frostMark?.destroy();
    this.frostMark = null;
  }

  update(dt: number, player: Player): void {
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      if (this.frozenT <= 0 || this.dead) this.thaw();
    }
    // 멈춘 동안은 상태 시간·공격 대기도 흐르지 않는다
    const hold = this.frozenT > 0 && (this.state === 'enter' || !REACTING.has(this.state));
    if (!hold) {
      this.stateT += dt;
      this.cooldown -= dt;
    }
    if (this.invuln > 0) this.invuln -= dt;
    const camLeft = this.scene.cameras.main.scrollX;

    switch (hold ? 'held' : this.state) {
      case 'held':
        // 단톡방 공지 캡처: 제자리에 멈춘다 (생각·이동·공격 모두 쉰다)
        this.vx = 0;
        this.vy = 0;
        break;
      case 'enter': {
        const dx = this.enterTargetX - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = Math.sign(dx) * 150;
        this.vy = 0;
        if (Math.abs(dx) < 8) this.set(this.resumeState);
        break;
      }
      case 'hurt':
        this.vx *= Math.pow(0.002, dt);
        this.vy = 0;
        if (this.stateT >= this.hurtTime) this.set(this.resumeState);
        break;
      case 'stagger':
        this.vx *= Math.pow(0.01, dt);
        this.vy = 0;
        if (this.stateT >= 0.5) this.set(this.resumeState);
        break;
      case 'down':
        if (this.grounded) {
          this.vx = 0;
          this.vy = 0;
          if (this.stateT >= 0.75) {
            if (this.hp <= 0) this.die();
            else this.set('getup');
          }
        }
        break;
      case 'getup':
        if (this.stateT >= 0.35) {
          this.invuln = 0.5;
          this.set(this.resumeState);
        }
        break;
      case 'bow':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.0) {
          this.leaveDir = this.x - camLeft < GAME_W / 2 ? -1 : 1;
          this.set('leaving');
        }
        break;
      case 'leaving':
        this.vx = this.leaveDir * 210;
        this.vy = 0;
        this.facing = this.leaveDir;
        if (this.x < camLeft - 70 || this.x > camLeft + GAME_W + 70) this.onLeft();
        break;
      case 'dying':
        if (!this.holdForRecheck && this.stateT >= 0.8) this.destroy();
        break;
      default:
        this.think(dt, player);
    }
    if (this.removed) return;

    const landed = hold ? false : this.move(dt);
    if (landed && this.state === 'down') fx.dust(this.scene, this.x, this.y);
    if (!NO_CLAMP.has(this.state)) this.x = Phaser.Math.Clamp(this.x, camLeft + 20, camLeft + GAME_W - 20);
    if (hold) this.rig.hold(dt);
    else this.pose(dt);
    this.sync();
    this.afterSync();
    this.syncTexts(dt);
  }

  protected move(dt: number): boolean {
    return this.integrate(dt);
  }

  protected afterSync(): void {
    if (this.state === 'dying') this.rig.root.alpha = Math.floor(this.stateT * 14) % 2 === 0 ? 0.25 : 1;
  }

  /** 화면 밖으로 나갔을 때 */
  protected onLeft(): void {
    this.destroy();
  }

  /** 사물형 적이 처리되었을 때 */
  protected die(): void {
    this.set('dying');
    this.dead = true;
    this.vx = 0;
    this.vy = 0;
    this.scene.releaseToken(this);
    fx.floatText(this.scene, this.x, this.y - this.z - this.height - 12, this.defeatText, '#7CFC9A', 18);
    this.scene.onEnemyDefeated(this);
  }

  /** 학생의 체력이 다했을 때: 인사하고 돌아간다 */
  protected onZeroHp(): void {
    this.dead = true;
    this.scene.releaseToken(this);
    this.set('bow');
    this.vx = 0;
    this.say(this.thanksText, 1.6);
    fx.floatText(this.scene, this.x, this.y - this.height - 30, this.scene.studentMode ? '설득 완료!' : '처리 완료', '#7CFC9A', 18);
    this.scene.onEnemyDefeated(this);
  }

  /** 오검토 처장의 재검토: 절반 체력으로 다시 일어난다 */
  recheck(): void {
    if (this.removed) return;
    this.holdForRecheck = false;
    this.dead = false;
    this.hp = Math.max(1, Math.ceil(this.maxHp / 2));
    this.set('getup');
    this.invuln = 0.8;
    fx.stampMark(this.scene, this.x, this.y - this.z - Math.min(this.height, 60) * 0.6, '재검토');
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    this.scene.releaseToken(this);
    this.hp -= h.dmg;
    this.rig.flash();
    this.facing = h.dir > 0 ? -1 : 1;
    this.vy = 0;
    if (this.student) {
      if (this.hp <= 0) {
        this.hp = 0;
        this.onZeroHp();
        return true;
      }
      if (h.knockdown) {
        this.set('stagger');
        this.stateT = 0;
        this.vx = h.dir * 260;
      } else {
        this.set('hurt');
        this.stateT = 0;
        this.vx = h.dir * h.kb;
      }
      return true;
    }
    if (this.light) {
      if (this.hp <= 0) {
        this.die();
        return true;
      }
      this.set('hurt');
      this.stateT = 0;
      this.vx = h.dir * (h.knockdown ? 320 : h.kb + 60);
      return true;
    }
    if (this.hp <= 0 || h.knockdown || this.z > 0) {
      this.set('down');
      this.stateT = 0;
      this.vz = 330;
      this.vx = h.dir * 230;
    } else {
      this.set('hurt');
      this.stateT = 0;
      this.vx = h.dir * h.kb;
    }
    return true;
  }

  // ---------- AI 도우미 ----------

  /** 플레이어 옆(앞뒤 keepAway 거리)으로 다가간다. 공격 차례가 아니면 깊이를 엇갈려 기다린다. */
  protected approach(player: Player, keepAway: number, sx: number, sy: number): { dx: number; dy: number } {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    this.facing = dx >= 0 ? 1 : -1;
    const side = dx >= 0 ? -1 : 1;
    const engaged = !this.usesToken || this.hasToken || this.scene.canTakeToken();
    const wantX = player.x + side * (player.targetable ? keepAway : keepAway + 80);
    const wantY = player.y + (engaged ? 0 : this.laneOffset);
    const mx = wantX - this.x;
    const my = wantY - this.y;
    this.vx = Math.abs(mx) > 6 ? Math.sign(mx) * sx : 0;
    this.vy = Math.abs(my) > 4 ? Math.sign(my) * sy : 0;

    for (const o of this.scene.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.x - o.x;
      const oy = this.y - o.y;
      if (Math.abs(ox) < 54 && Math.abs(oy) < 20) {
        // 완전히 겹쳤을 때는 생성 순서로 방향을 갈라 같은 쪽으로 같이 밀리지 않게 한다
        const tie = this.uid > o.uid ? 1 : -1;
        this.vy += (oy > 0 || (oy === 0 && tie > 0) ? 1 : -1) * 70;
        this.vx += (ox > 0 || (ox === 0 && tie > 0) ? 1 : -1) * 40;
      }
    }
    return { dx, dy };
  }

  protected canStartAttack(player: Player, dx: number, dy: number, rangeX: number): boolean {
    if (!player.targetable || this.cooldown > 0) return false;
    if (Math.abs(dy) >= 12 || Math.abs(dx) >= rangeX) return false;
    return !this.usesToken || this.scene.takeToken(this);
  }

  /** 앞쪽 근접 판정. 맞혔으면 true */
  protected meleeHit(player: Player, extra: number, dmg: number, kb: number): boolean {
    const ddx = (player.x - this.x) * this.facing;
    if (ddx < -10 || ddx > this.halfW + player.halfW + extra) return false;
    if (Math.abs(player.y - this.y) > DEPTH_RANGE) return false;
    if (player.z > 34) return false;
    const hit = player.takeHit({ dmg, dir: this.facing, kb, knockdown: false });
    if (hit) fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
    return hit;
  }

  // ---------- 글자 ----------

  protected setLabel(text: string, color = '#ffd27f'): void {
    this.label = this.scene.add
      .text(this.x, this.y, text, {
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
        color,
        stroke: '#111318',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
  }

  say(text: string, sec = 1.4): void {
    if (!this.speech) this.speech = fx.speechText(this.scene, text);
    else this.speech.setText(text);
    this.speechT = sec;
  }

  private syncTexts(dt: number): void {
    const visible = this.rig.root.visible;
    const top = this.y - this.z - this.height - 6;
    if (this.label) {
      this.label
        .setPosition(this.x, top)
        .setDepth(this.y + 0.5)
        .setVisible(visible && this.state !== 'leaving');
    }
    if (this.speech) {
      this.speechT -= dt;
      this.speech.setPosition(this.x, top - (this.label ? 16 : 0)).setVisible(visible && this.speechT > 0);
    }
    this.frostMark
      ?.setPosition(this.x + 14, top + 4)
      .setDepth(this.y + 0.6)
      .setVisible(visible)
      .setAlpha(0.6 + Math.sin(this.scene.time.now / 160) * 0.4);
  }

  destroy(): void {
    this.scene.releaseToken(this);
    this.label?.destroy();
    this.speech?.destroy();
    this.frostMark?.destroy();
    this.frostMark = null;
    super.destroy();
  }
}
