import Phaser from 'phaser';
import { DEPTH_RANGE, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Fighter, type HitInfo } from './Fighter';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createMailRig } from './rigs';
import * as fx from '../fx';

// 잡몹 "새벽 3시 메일". 상태 머신: 등장 → 접근 → 예비동작 → 돌진 → 회복 / 피격 → 다운 → 기상 → 퇴장

type EnemyState = 'enter' | 'approach' | 'windup' | 'lunge' | 'recover' | 'hurt' | 'down' | 'getup' | 'dying';

const SPEED_X = 120;
const SPEED_Y = 85;
const WINDUP = 0.42;
const LUNGE = 0.22;
const LUNGE_V = 440;
let nextUid = 1;

export class MailEnemy extends Fighter {
  readonly halfW = 28;
  readonly height = 58;
  state: EnemyState = 'enter';
  hasToken = false;
  dead = false;
  readonly uid = nextUid++;
  private cooldown = 0.6 + Math.random() * 0.8;
  private hitDone = false;
  private phase = Math.random() * 10;
  private laneOffset = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30);
  private enterTargetX: number;
  private readonly scene: StageScene;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createMailRig(scene), 5, 60);
    this.scene = scene;
    this.enterTargetX = enterTargetX;
    this.facing = enterTargetX > x ? 1 : -1;
    this.sync();
  }

  private set(s: EnemyState): void {
    if (this.state !== s) this.stateT = 0;
    this.state = s;
  }

  get hittable(): boolean {
    if (this.invuln > 0 || this.dead) return false;
    return this.state !== 'down' && this.state !== 'getup' && this.state !== 'dying';
  }

  update(dt: number, player: Player): void {
    this.stateT += dt;
    this.cooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    switch (this.state) {
      case 'enter': {
        const dx = this.enterTargetX - this.x;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = Math.sign(dx) * SPEED_X * 1.2;
        this.vy = 0;
        if (Math.abs(dx) < 8) this.set('approach');
        break;
      }
      case 'approach':
        this.updateApproach(player);
        break;
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= WINDUP) {
          this.set('lunge');
          this.hitDone = false;
          this.vx = this.facing * LUNGE_V;
        }
        break;
      case 'lunge':
        if (!this.hitDone) this.checkLungeHit(player);
        if (this.stateT >= LUNGE) {
          this.set('recover');
        }
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        if (this.stateT >= 0.45) {
          this.scene.releaseToken(this);
          this.cooldown = 1.0 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
      case 'hurt':
        this.vx *= Math.pow(0.002, dt);
        this.vy = 0;
        if (this.stateT >= 0.32) this.set('approach');
        break;
      case 'down':
        if (this.grounded) {
          this.vx = 0;
          this.vy = 0;
          if (this.stateT >= 0.75) {
            if (this.hp <= 0) {
              this.set('dying');
              this.dead = true;
              fx.floatText(this.scene, this.x, this.y - 70, '처리 완료', '#7CFC9A', 18);
            } else {
              this.set('getup');
            }
          }
        }
        break;
      case 'getup':
        if (this.stateT >= 0.35) {
          this.invuln = 0.5;
          this.set('approach');
        }
        break;
      case 'dying':
        if (this.stateT >= 0.8) this.destroy();
        break;
    }

    if (this.removed) return;
    const landed = this.integrate(dt);
    if (landed && this.state === 'down') fx.dust(this.scene, this.x, this.y);
    if (this.state !== 'enter') {
      const left = this.scene.cameras.main.scrollX;
      this.x = Phaser.Math.Clamp(this.x, left + 20, left + GAME_W - 20);
    }
    this.pose(dt);
    this.sync();
    if (this.state === 'dying') this.rig.root.alpha = Math.floor(this.stateT * 14) % 2 === 0 ? 0.25 : 1;
  }

  private updateApproach(player: Player): void {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    this.facing = dx >= 0 ? 1 : -1;
    const side = dx >= 0 ? -1 : 1;
    const engaged = this.hasToken || this.scene.canTakeToken();
    const keepAway = player.targetable ? 76 : 150;
    const wantX = player.x + side * keepAway;
    const wantY = player.y + (engaged ? 0 : this.laneOffset);
    const mx = wantX - this.x;
    const my = wantY - this.y;
    this.vx = Math.abs(mx) > 6 ? Math.sign(mx) * SPEED_X : 0;
    this.vy = Math.abs(my) > 4 ? Math.sign(my) * SPEED_Y : 0;

    // 서로 겹치지 않게 살짝 밀어낸다
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

    if (
      player.targetable &&
      this.cooldown <= 0 &&
      Math.abs(dy) < 12 &&
      Math.abs(dx) < 105 &&
      this.scene.takeToken(this)
    ) {
      this.set('windup');
      this.vx = 0;
      this.vy = 0;
      fx.floatText(this.scene, this.x, this.y - 82, '!', '#ff4d4d', 26);
    }
  }

  private checkLungeHit(player: Player): void {
    const ddx = (player.x - this.x) * this.facing;
    if (ddx < -10 || ddx > this.halfW + player.halfW + 8) return;
    if (Math.abs(player.y - this.y) > DEPTH_RANGE) return;
    if (player.z > 34) return;
    if (player.takeHit({ dmg: 1, dir: this.facing, kb: 170, knockdown: false })) {
      this.hitDone = true;
      fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.dead) return false;
    if (!h.force && !this.hittable) return false;
    this.scene.releaseToken(this);
    this.hp -= h.dmg;
    this.rig.flash();
    this.hitDone = true;
    this.facing = h.dir > 0 ? -1 : 1;
    if (this.hp <= 0 || h.knockdown || this.z > 0) {
      this.set('down');
      this.stateT = 0;
      this.vz = 330;
      this.vx = h.dir * 230;
      this.vy = 0;
    } else {
      this.set('hurt');
      this.stateT = 0;
      this.vx = h.dir * h.kb;
      this.vy = 0;
    }
    return true;
  }

  private pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    switch (this.state) {
      case 'enter':
      case 'approach': {
        const moving = this.vx !== 0 || this.vy !== 0;
        this.phase += dt * (moving ? 14 : 4);
        const s = Math.sin(this.phase);
        p.legF = moving ? s * 0.6 : 0;
        p.legB = moving ? -s * 0.6 : 0;
        p.armF = -s * 0.5;
        p.armB = s * 0.5;
        p.bob = moving ? -Math.abs(s) * 6 : Math.sin(this.phase) * 1.5;
        break;
      }
      case 'windup':
        sharp = 30;
        p.body = -0.3 + Math.sin(this.stateT * 60) * 0.06;
        p.armF = -2.6;
        p.armB = -2.6;
        p.legF = -0.3;
        p.legB = 0.3;
        break;
      case 'lunge':
        sharp = 40;
        p.body = 0.4;
        p.armF = -1.5;
        p.armB = -1.5;
        p.legF = 0.5;
        p.legB = 0.7;
        break;
      case 'recover':
        p.body = 0.12;
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.38;
        p.armF = -0.8;
        p.armB = -0.8;
        break;
      case 'down':
      case 'dying':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.2;
        p.bob = this.grounded ? -28 : 0;
        p.armF = -2.5;
        p.armB = -2.5;
        break;
      case 'getup':
        p.body = -0.5;
        break;
    }
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.scene.releaseToken(this);
    super.destroy();
  }
}
