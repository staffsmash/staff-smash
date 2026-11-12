import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { Controls } from '../input/Controls';
import type { StageScene } from '../scenes/StageScene';
import { Fighter, type HitInfo } from './Fighter';
import { neutralPose, type Pose } from './Rig';
import { createClipboard, createStaffRig, createStamp } from './rigs';
import * as fx from '../fx';

export interface AttackDef {
  /** 공격 전체 시간 (초) */
  total: number;
  /** 판정이 살아 있는 구간 [시작, 끝] (초) */
  active: [number, number];
  /** 다음 타로 이어질 수 있는 시점 (초) */
  chainAt: number;
  reach: number;
  /** 높이(z) 차이 허용 범위 */
  zReach: number;
  dmg: number;
  kb: number;
  knockdown: boolean;
}

/** 도장 → 도장 → 결재판 내려치기 */
export const COMBO: AttackDef[] = [
  { total: 0.24, active: [0.06, 0.12], chainAt: 0.11, reach: 66, zReach: 30, dmg: 1, kb: 70, knockdown: false },
  { total: 0.26, active: [0.07, 0.13], chainAt: 0.12, reach: 68, zReach: 30, dmg: 1, kb: 70, knockdown: false },
  { total: 0.48, active: [0.2, 0.28], chainAt: 99, reach: 84, zReach: 30, dmg: 2, kb: 0, knockdown: true },
];

export const JUMP_ATTACK: AttackDef = {
  total: 0,
  active: [0, 99],
  chainAt: 99,
  reach: 62,
  zReach: 95,
  dmg: 2,
  kb: 0,
  knockdown: true,
};

const WALK = 250;
const RUN = 430;
const DEPTH_SPEED = 165;
const JUMP_V = 640;

export type PlayerState = 'idle' | 'walk' | 'attack' | 'jump' | 'hurt' | 'down' | 'getup' | 'special' | 'ko';

export class Player extends Fighter {
  readonly halfW = 20;
  readonly height = 106;
  state: PlayerState = 'idle';
  sp = 0;
  lives = 3;
  private combo = 0;
  private buffered = false;
  private running = false;
  private jumpAttacking = false;
  private walkPhase = 0;
  private hitSet = new Set<Fighter>();
  private readonly stamp: Phaser.GameObjects.Container;
  private readonly board: Phaser.GameObjects.Container;
  private readonly scene: StageScene;

  constructor(scene: StageScene, x: number, y: number) {
    const rig = createStaffRig(scene);
    super(scene, x, y, rig, 12, 46);
    this.scene = scene;
    this.stamp = createStamp(scene, rig);
    this.board = createClipboard(scene, rig);
    rig.itemF.add([this.stamp, this.board]);
    this.stamp.setVisible(false);
    this.board.setVisible(false);
    this.sync();
  }

  private set(s: PlayerState): void {
    if (this.state !== s) this.stateT = 0;
    this.state = s;
  }

  get hittable(): boolean {
    if (this.invuln > 0) return false;
    return this.state !== 'down' && this.state !== 'getup' && this.state !== 'special' && this.state !== 'ko';
  }

  /** 적 AI가 노릴 수 있는 상태인지 */
  get targetable(): boolean {
    return this.state !== 'down' && this.state !== 'ko' && this.state !== 'getup';
  }

  update(dt: number, c: Controls): void {
    this.stateT += dt;
    if (this.invuln > 0) this.invuln -= dt;

    switch (this.state) {
      case 'idle':
      case 'walk':
        this.updateFree(c);
        break;
      case 'attack':
        this.updateAttack(dt, c);
        break;
      case 'jump':
        if (!this.jumpAttacking && c.consume('attack')) {
          this.jumpAttacking = true;
          this.hitSet.clear();
        }
        if (this.jumpAttacking && this.z < 95) this.scene.resolvePlayerAttack(this, JUMP_ATTACK, this.hitSet);
        break;
      case 'hurt':
        this.vx *= Math.pow(0.002, dt);
        if (this.stateT > 0.28) this.set('idle');
        break;
      case 'down':
        if (this.grounded) {
          this.vx = 0;
          this.vy = 0;
          if (this.stateT > 1.0) {
            if (this.hp <= 0) this.scene.onPlayerKO();
            else {
              this.set('getup');
            }
          }
        }
        break;
      case 'getup':
        if (this.stateT > 0.4) {
          this.set('idle');
          this.invuln = Math.max(this.invuln, 1.0);
        }
        break;
      case 'special':
      case 'ko':
        this.vx = 0;
        this.vy = 0;
        break;
    }

    const landed = this.integrate(dt);
    if (landed) {
      if (this.state === 'jump') {
        this.set('idle');
        this.jumpAttacking = false;
        this.vx = 0;
        this.vy = 0;
        fx.dust(this.scene, this.x, this.y);
      } else if (this.state === 'down') {
        fx.dust(this.scene, this.x, this.y);
        this.scene.cameras.main.shake(80, 0.004);
      }
    }
    this.clampToView();
    this.pose(dt);
    this.sync();
  }

  private updateFree(c: Controls): void {
    const mx = c.moveX;
    const my = c.moveY;
    if (c.consume('special') && this.sp >= 100) {
      this.scene.startSpecial();
      return;
    }
    if (c.consume('jump')) {
      this.set('jump');
      this.jumpAttacking = false;
      this.vz = JUMP_V;
      this.vx = mx * (c.running ? RUN : WALK);
      this.vy = my * DEPTH_SPEED * 0.6;
      return;
    }
    if (c.consume('attack')) {
      this.startAttack(0);
      return;
    }
    this.running = c.running && mx !== 0;
    this.vx = mx * (this.running ? RUN : WALK);
    this.vy = my * DEPTH_SPEED;
    if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
    this.set(mx !== 0 || my !== 0 ? 'walk' : 'idle');
  }

  private startAttack(i: number): void {
    this.state = 'attack';
    this.stateT = 0;
    this.combo = i;
    this.buffered = false;
    this.hitSet.clear();
    this.vx = i === 2 ? this.facing * 90 : 0;
    this.vy = 0;
  }

  private updateAttack(dt: number, c: Controls): void {
    const a = COMBO[this.combo];
    this.vx *= Math.pow(0.01, dt);
    this.vy = 0;
    if (this.stateT > 0.03 && c.consume('attack')) this.buffered = true;
    if (this.stateT >= a.active[0] && this.stateT <= a.active[1]) {
      this.scene.resolvePlayerAttack(this, a, this.hitSet);
    }
    if (this.buffered && this.combo < COMBO.length - 1 && this.stateT >= a.chainAt) {
      this.startAttack(this.combo + 1);
      return;
    }
    if (this.stateT >= a.total) this.set('idle');
  }

  takeHit(h: HitInfo): boolean {
    if (!h.force && !this.hittable) return false;
    this.hp = Math.max(0, this.hp - h.dmg);
    this.rig.flash();
    this.jumpAttacking = false;
    this.facing = h.dir > 0 ? -1 : 1;
    if (this.hp <= 0 || h.knockdown || this.z > 0) {
      this.set('down');
      this.vz = 300;
      this.vx = h.dir * 220;
      this.vy = 0;
    } else {
      this.set('hurt');
      this.vx = h.dir * h.kb;
      this.vy = 0;
    }
    this.scene.onPlayerHit();
    return true;
  }

  /** 목숨을 하나 쓰고 다시 일어선다 */
  revive(): void {
    this.hp = this.maxHp;
    this.set('getup');
    this.invuln = 2.2;
  }

  enterSpecial(): void {
    this.set('special');
    this.vx = 0;
    this.vy = 0;
    this.sp = 0;
  }

  endSpecial(): void {
    if (this.state === 'special') this.set('idle');
  }

  private clampToView(): void {
    const left = this.scene.cameras.main.scrollX;
    this.x = Phaser.Math.Clamp(this.x, left + 24, left + GAME_W - 24);
  }

  /** 상태에 맞는 자세를 고른다 */
  pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    const t = this.scene.time.now / 1000;
    switch (this.state) {
      case 'idle':
        p.armF = 0.08 + Math.sin(t * 3) * 0.04;
        p.armB = -0.08 - Math.sin(t * 3) * 0.04;
        p.bob = Math.sin(t * 3) * 1.2;
        break;
      case 'walk': {
        this.walkPhase += dt * (this.running ? 17 : 11);
        const s = Math.sin(this.walkPhase);
        p.legF = s * 0.55;
        p.legB = -s * 0.55;
        p.armF = -s * 0.5;
        p.armB = s * 0.5;
        p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2.5;
        if (this.running) p.body = 0.12;
        break;
      }
      case 'attack': {
        sharp = 40;
        const a = COMBO[this.combo];
        p.legF = -0.28;
        p.legB = 0.28;
        if (this.combo === 0) {
          p.armF = -1.45;
          p.armB = 0.4;
          p.body = 0.08;
        } else if (this.combo === 1) {
          p.armF = -1.8;
          p.armB = 0.5;
          p.body = 0.12;
        } else if (this.stateT < a.active[0]) {
          p.armF = -2.9;
          p.armB = -0.4;
          p.body = -0.12;
        } else {
          p.armF = -0.85;
          p.armB = 0.5;
          p.body = 0.22;
          p.legF = -0.45;
          p.legB = 0.38;
        }
        break;
      }
      case 'jump':
        sharp = 22;
        p.legF = -0.75;
        p.legB = 0.5;
        if (this.jumpAttacking) {
          p.armF = -1.05;
          p.armB = 0.6;
          p.body = 0.28;
        } else {
          p.armF = -2.5;
          p.armB = -2.2;
        }
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.3;
        p.armF = -0.7;
        p.armB = -0.5;
        break;
      case 'down':
      case 'ko':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.1;
        p.bob = this.grounded ? -18 : 0;
        p.armF = -2.6;
        p.armB = -2.9;
        p.legF = -0.2;
        p.legB = 0.2;
        break;
      case 'getup':
        sharp = 12;
        p.body = -0.4;
        p.legF = -0.6;
        p.legB = 0.6;
        break;
      case 'special':
        sharp = 20;
        p.armF = -2.95;
        p.armB = -2.95;
        p.bob = -4;
        break;
    }
    this.stamp.setVisible(
      (this.state === 'attack' && this.combo < 2) || (this.state === 'jump' && this.jumpAttacking),
    );
    this.board.setVisible(this.state === 'attack' && this.combo === 2);
    this.rig.update(dt, p, sharp);
  }
}
