import stats from '../data/enemies.json';
import { DEPTH_RANGE, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { createParcelRig } from './rigs';
import { createOverdueBooksRig } from './studentRigs';
import * as fx from '../fx';
import { play } from '../sound';

// 결정 61 새 잡몹 B ★ "반송 택배 상자"(학생 모드: "연체 도서 더미") — 3스테이지에 나온다. 단단하다 (체력 = 메일의 3배).
// 느리게 걸으며 플레이어와 깊이(줄)를 맞추고, 가로로 약 220px 안에 들면 0.6초 부르르 떤 뒤(예고)
// 그 줄을 따라 플레이어 쪽으로 돌진한다 (평소 속도 3배, 0.7초). 부딪히면 피해 1칸. 위아래(옆)로 비키면 피한다.
// 처리 문구: "반송 접수 완료!" / "반납 완료!"

const S = stats.parcel;

export const PARCEL_TEXT = {
  /** 처음 만날 때 띠 (제목, 요령) */
  staffName: '반송 택배 상자',
  studentName: '연체 도서 더미',
  staffHint: '반송 택배 상자가 부르르 떨면 옆으로 비키세요 — 돌진합니다!',
  studentHint: '연체 도서 더미가 부르르 떨면 옆으로 비키세요 — 돌진합니다!',
  staffDone: '반송 접수 완료!',
  studentDone: '반납 완료!',
} as const;

export class ParcelBox extends Enemy {
  readonly kind = 'parcel' as const;
  readonly halfW = 32;
  readonly height = 62;
  private hitDone = false;
  private phase = Math.random() * 10;

  constructor(scene: StageScene, x: number, y: number, enterTargetX: number) {
    const st = scene.studentMode;
    super(scene, x, y, st ? createOverdueBooksRig(scene) : createParcelRig(scene), S.hp, 70, enterTargetX);
    this.defeatText = st ? PARCEL_TEXT.studentDone : PARCEL_TEXT.staffDone;
    // 단단해서 맞아도 덜 휘청인다
    this.hurtTime = 0.22;
    this.sync();
  }

  protected think(_dt: number, player: Player): void {
    switch (this.state) {
      case 'approach': {
        // 너무 붙지 않고 돌진 거리 안쪽(가로 150px 쯤)에서 줄을 맞춘다
        const { dx, dy } = this.approach(player, 150, S.speedX, S.speedY);
        if (
          player.targetable &&
          this.cooldown <= 0 &&
          Math.abs(dy) < 16 &&
          Math.abs(dx) < S.triggerX &&
          this.scene.takeToken(this)
        ) {
          this.set('tremble');
          this.vx = 0;
          this.vy = 0;
          fx.floatText(this.scene, this.x, this.y - this.height - 20, '!', '#ff4d4d', 26);
        }
        break;
      }
      case 'tremble':
        // 예고: 제자리에서 부르르
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= S.trembleSec) {
          this.set('charge');
          this.hitDone = false;
          this.vx = this.facing * S.speedX * S.chargeMul;
          play('charge', 0.6);
        }
        break;
      case 'charge': {
        this.vy = 0;
        if (!this.hitDone) {
          const ddx = Math.abs(player.x - this.x);
          if (ddx <= this.halfW + player.halfW && Math.abs(player.y - this.y) <= DEPTH_RANGE && player.z < 50) {
            if (player.takeHit({ dmg: 1, dir: this.facing, kb: 220, knockdown: false })) {
              this.hitDone = true;
              fx.hitSpark(this.scene, player.x, player.y - player.z - 60);
            }
          }
        }
        const left = this.scene.cameras.main.scrollX;
        const atEdge = this.x <= left + 24 || this.x >= left + GAME_W - 24;
        if (this.stateT >= S.chargeSec || atEdge) {
          this.vx = 0;
          this.set('recover');
        }
        break;
      }
      case 'recover':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.6) {
          this.scene.releaseToken(this);
          this.cooldown = 1.6 + Math.random() * 0.8;
          this.set('approach');
        }
        break;
    }
  }

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    switch (this.state) {
      case 'enter':
      case 'approach': {
        const moving = this.vx !== 0 || this.vy !== 0;
        this.phase += dt * (moving ? 8 : 3);
        const s = Math.sin(this.phase);
        p.legF = moving ? s * 0.45 : 0;
        p.legB = moving ? -s * 0.45 : 0;
        p.armF = -s * 0.3;
        p.armB = s * 0.3;
        p.bob = moving ? -Math.abs(s) * 3 : 0;
        break;
      }
      case 'tremble': {
        // 부르르: 몸통이 잘게 흔들리고 들썩인다
        sharp = 60;
        const t = this.scene.time.now / 1000;
        p.body = Math.sin(t * 80) * 0.1;
        p.bob = -Math.abs(Math.sin(t * 55)) * 3;
        p.armF = -0.8;
        p.armB = -0.8;
        break;
      }
      case 'charge':
        sharp = 40;
        p.body = 0.3;
        p.armF = -1.4;
        p.armB = -1.4;
        p.legF = 0.6;
        p.legB = -0.5;
        break;
      case 'recover':
        p.body = -0.1;
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.25;
        break;
      case 'down':
      case 'dying':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.2;
        p.bob = this.grounded ? -30 : 0;
        break;
      case 'getup':
        p.body = -0.5;
        break;
    }
    this.rig.update(dt, p, sharp);
  }
}
