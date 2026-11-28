import Phaser from 'phaser';
import stats from '../data/enemies.json';
import { DEPTH_RANGE } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import { GIVER_TEXT, type Giver } from './Giver';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createGuardRig } from './rigs';
import { createAngryKioskRig } from './studentRigs';
import * as fx from '../fx';
import { play } from '../sound';

// 결정 61 이스터 에그 ② ★: 한 스테이지에서 경비 선생님(학생 모드: 도서 무인 대출기)을 20번 맞히면
// 얼굴(대출기는 화면)이 화난 마귀로 바뀌어 적이 된다 — "화난 경비 선생님" / "폭주한 도서 무인 대출기".
// - 보통 사람 걸음으로 플레이어를 쫓고(대출기는 바닥을 미끄러지듯), 가까우면 0.5초 예고(팔 들기 / 화면 번쩍) 뒤 때린다.
//   맞으면 체력 3칸 — 2D 난이도·인물 장점 배율과 상관없이 고정 (HitInfo.fixed). 무적·연차 쿠폰(공결 확인서)·결재판은 평소대로 막는다.
// - 체력은 중간보스 급(근접 약 12대). 처리하면 원래 얼굴로 돌아와 사과한다 (StageScene.onAngryGiverDone).
// - 구역 정리를 막지 않고, 민원 처리 수·연속·필살기 충전·배지에 넣지 않는다 (장난이다). 받은 피해는 평소대로 센다.
// 원래 경비원(Giver)은 마귀인 동안 숨겨 두고, 처리되면 마귀가 있던 자리에 다시 세운다.

const S = stats.angryGiver;

export class AngryGiver extends Enemy {
  readonly kind = 'angryGiver' as const;
  /** 사람처럼 넘어지지 않고 휘청이다가, 체력이 다하면 onZeroHp (원래대로 돌아온다) */
  readonly student = true;
  /** 동시 공격 제한(토큰)과 상관없이 쫓아온다 */
  readonly usesToken = false;
  readonly halfW: number;
  readonly height: number;
  /** 마귀가 되기 전의 경비원(대출기) */
  readonly giver: Giver;
  private readonly kiosk: boolean;
  private readonly glare: Phaser.GameObjects.Rectangle | null;
  private hitDone = false;
  private phase = 0;

  constructor(scene: StageScene, giver: Giver) {
    const kiosk = giver.kind === 'kiosk';
    const rig = kiosk ? createAngryKioskRig(scene) : createGuardRig(scene, giver.female, true);
    super(scene, giver.x, giver.y, rig, S.hp, kiosk ? 80 : 48, giver.x);
    this.giver = giver;
    this.kiosk = kiosk;
    this.halfW = kiosk ? 34 : 22;
    this.height = kiosk ? 128 : 118;
    this.facing = giver.facing;
    this.glare = kiosk ? ((rig.torso.getByName('glare') as Phaser.GameObjects.Rectangle | null) ?? null) : null;
    this.cooldown = 0.6;
    // 먼저 제자리에서 외친다 (1초) — 그 뒤 쫓아온다
    this.state = 'rage';
    this.resumeState = 'approach';
    this.setLabel(kiosk ? GIVER_TEXT.kioskAngryName : GIVER_TEXT.guardAngryName, '#ff8a8a');
    this.say(kiosk ? GIVER_TEXT.kioskAngry : GIVER_TEXT.guardAngry, 2.2);
    this.sync();
  }

  update(dt: number, player: Player): void {
    // 이번 프레임에 이미 처리되어 원래 경비원으로 돌아갔다
    if (this.removed) return;
    super.update(dt, player);
  }

  protected think(dt: number, player: Player): void {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    switch (this.state) {
      case 'rage':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 1.0) this.set('approach');
        break;
      case 'approach': {
        // 플레이어 바로 앞(때릴 거리)까지 다가간다. 다른 적과 겹치지 않게 비켜 가는 것은 공통 도우미가 맡는다
        this.approach(player, this.halfW + player.halfW + 26, S.speedX, S.speedY);
        if (player.targetable && this.cooldown <= 0 && Math.abs(dy) < 16 && Math.abs(dx) < this.halfW + player.halfW + 46) {
          this.set('windup');
          this.vx = 0;
          this.vy = 0;
          // 예고: 팔을 번쩍 들고(대출기는 화면이 번쩍) 화면도 잠깐 붉게
          this.scene.cameras.main.flash(110, 255, 70, 70);
          play('squeal', 0.5);
          fx.floatText(this.scene, this.x, this.y - this.height - 26, '!', '#ff4d4d', 28);
        }
        break;
      }
      case 'windup':
        this.vx = 0;
        this.vy = 0;
        this.facing = dx >= 0 ? 1 : -1;
        if (this.stateT >= S.windupSec) {
          this.set('strike');
          this.hitDone = false;
          // 경비 선생님은 한 발 내디디며 내려치고, 대출기는 앞으로 쭉 미끄러져 들이받는다
          this.vx = this.facing * (this.kiosk ? 420 : 200);
        }
        break;
      case 'strike':
        if (!this.hitDone) this.hitDone = this.strike(player);
        if (this.stateT >= (this.kiosk ? 0.24 : 0.18)) {
          this.vx = 0;
          this.set('recover');
        }
        break;
      case 'recover':
        this.vx *= Math.pow(0.0005, dt);
        this.vy = 0;
        if (this.stateT >= 0.55) {
          this.cooldown = 1.1 + Math.random() * 0.5;
          this.set('approach');
        }
        break;
    }
  }

  /** 앞쪽에 닿으면 3칸 (난이도 배율 없이 고정). 맞혔으면 true */
  private strike(player: Player): boolean {
    const ddx = (player.x - this.x) * this.facing;
    if (ddx < -10 || ddx > this.halfW + player.halfW + 30) return false;
    if (Math.abs(player.y - this.y) > DEPTH_RANGE || player.z > 34) return false;
    const hit = player.takeHit({ dmg: S.dmg, dir: this.facing, kb: 260, knockdown: true, fixed: true });
    if (hit) {
      fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
      this.scene.cameras.main.shake(160, 0.01);
    }
    return hit;
  }

  /** 체력이 다했다: 처리 수·연속·배지에 넣지 않고 원래 경비원(대출기)으로 돌아간다 */
  protected onZeroHp(): void {
    this.dead = true;
    play('process');
    this.scene.onAngryGiverDone(this);
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    const t = this.scene.time.now / 1000;
    const moving = this.vx !== 0 || this.vy !== 0;
    if (this.kiosk) {
      // 대출기: 다리가 없다. 움직이는 쪽으로 살짝 기울어 미끄러지고, 예고 때는 부르르 떤다
      switch (this.state) {
        case 'rage':
          p.body = Math.sin(t * 60) * 0.05;
          sharp = 40;
          break;
        case 'windup':
          p.body = -0.12 + Math.sin(t * 70) * 0.05;
          sharp = 40;
          break;
        case 'strike':
          p.body = 0.22;
          sharp = 40;
          break;
        case 'hurt':
        case 'stagger':
          p.body = -0.2;
          sharp = 30;
          break;
        default:
          p.body = moving ? 0.1 : 0;
          p.bob = Math.sin(t * 6) * 1.2;
      }
      this.glare?.setAlpha(this.state === 'windup' ? (Math.floor(this.stateT * 14) % 2 === 0 ? 0.85 : 0.15) : 0);
      this.rig.update(dt, p, sharp);
      return;
    }
    switch (this.state) {
      case 'rage':
        // 두 주먹을 치켜들고 부들부들
        sharp = 30;
        p.armF = -2.7 + Math.sin(t * 40) * 0.15;
        p.armB = -2.5 + Math.sin(t * 40 + 1) * 0.15;
        p.body = -0.1;
        p.bob = Math.sin(t * 50) * 1.5;
        break;
      case 'windup':
        // 예고: 팔을 머리 위로 번쩍
        sharp = 30;
        p.armF = -3.0;
        p.armB = -2.8;
        p.body = -0.22;
        p.legF = -0.25;
        p.legB = 0.25;
        break;
      case 'strike':
        sharp = 45;
        p.armF = -1.2;
        p.armB = -1.0;
        p.body = 0.35;
        p.legF = 0.45;
        p.legB = -0.35;
        break;
      case 'recover':
        p.body = 0.12;
        p.armF = -0.6;
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.3;
        p.armF = -0.6;
        p.armB = -0.5;
        break;
      case 'stagger':
        sharp = 24;
        p.body = -0.45 + Math.sin(t * 20) * 0.08;
        p.armF = -2.4;
        p.armB = -2.0;
        break;
      default: {
        // 쫓아오는 걸음 (주먹을 쥐고 성큼성큼)
        this.phase += dt * (moving ? 11 : 3);
        const s = Math.sin(this.phase);
        p.legF = moving ? s * 0.55 : 0;
        p.legB = moving ? -s * 0.55 : 0;
        p.armF = -0.9 - s * 0.35;
        p.armB = -0.5 + s * 0.35;
        p.bob = moving ? -Math.abs(Math.cos(this.phase)) * 2.5 : 0;
      }
    }
    this.rig.update(dt, p, sharp);
  }
}
