import Phaser from 'phaser';
import { FONT, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import type { Player } from './Player';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createGuardRig } from './rigs';
import { createKiosk } from './studentRigs';
import { isWeaponId, type WeaponId } from './weapons';
import * as fx from '../fx';

// 무기를 건네주는 것 (맞지 않고 넘어지지 않으며, 적은 상관하지 않는다).
// - 교직원 모드 "경비원"(이름 없는 가상 인물): 앞에서 L(줍기 버튼)로 인사하면 무기를 준다.
//   공격이나 던진 무기로 건드리면 6초 동안 인사를 받아 주지 않는다. 보스 기믹 무기는 경비원이 던져 준다.
//   그 구역에 경비원이 없으면 화면 끝에서 잠깐 들어와 던져 주고 나간다 (courier).
// - 학생 모드 "도서 무인 대출기"(사람이 아닌 기계): 앞에서 L(줍기 버튼)로 대여하면 무기가 나온다 (전공책이 가장 자주).
// 주고받는 흐름(무기 장착·바닥에 떨어뜨리기)은 StageScene이 맡고, 여기서는 모양·말풍선·동작·대기 시간만 다룬다.

export type GiverKind = 'guard' | 'kiosk';

/** 선물 사이 대기 시간(초) */
export const GIFT_COOLDOWN = 8;
/** 무례하게 건드리면 인사를 받지 않는 시간(초) */
export const REFUSE_SEC = 6;

export const GIVER_TEXT = {
  guardName: '경비원',
  kioskName: '도서 무인 대출기',
  /** 플레이어(교직원)의 인사 */
  hello: '안녕하세요!',
  guardGive: '네, 수고 많으십니다! 이거 쓰세요.',
  guardCooldown: '방금 드렸잖아요~',
  guardRude: '어허, 인사부터 하셔야죠.',
  guardRefuse: '흠… 조금 있다가 오세요.',
  /** 보스 기믹 무기를 던져 줄 때 (떠오르는 글자) */
  guardToss: '경비원: 이거 쓰세요!',
  kioskGive: '도서 대여 완료!',
  kioskCooldown: '대출 처리 중…',
} as const;

const WALK = 230;

type GuardPose = 'idle' | 'bow' | 'toss' | 'flinch';
type CourierState = 'enter' | 'stay' | 'leave';

export class Giver {
  readonly kind: GiverKind;
  readonly name: string;
  readonly items: WeaponId[];
  /** 기믹 무기를 던져 주러 잠깐 들어온 경비원 (인사를 받지 않는다) */
  readonly courier: boolean;
  x: number;
  readonly y: number;
  readonly halfW: number;
  readonly height: number;
  facing = 1;
  removed = false;
  /** 다음 선물까지 남은 시간 */
  cooldown = 0;
  /** 인사를 받지 않는 남은 시간 (경비원을 건드렸다) */
  refuseT = 0;
  private readonly scene: StageScene;
  private readonly rig: Rig | null;
  private readonly body: Phaser.GameObjects.Container | null;
  private readonly screen: Phaser.GameObjects.Rectangle | null;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;
  private speech: Phaser.GameObjects.Text | null = null;
  private speechT = 0;
  private lastRudeSay = -99;
  private poseKind: GuardPose = 'idle';
  private poseT = 0;
  private walkPhase = 0;
  private blinkT = 0;
  private t = 0;
  /** 잠깐 뒤에 할 일 (일시정지 중에는 멈춘다) */
  private pending: { t: number; fn: () => void }[] = [];
  private courierState: CourierState = 'enter';
  private courierT = 0;
  private targetX = 0;
  private onArrive: (() => void) | null = null;

  constructor(scene: StageScene, kind: GiverKind, x: number, y: number, items: string[], courier = false) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.courier = courier;
    this.items = items.filter(isWeaponId);
    if (this.items.length === 0) this.items = [kind === 'kiosk' ? 'clipboard' : 'stapler'];
    if (kind === 'guard') {
      this.name = GIVER_TEXT.guardName;
      this.rig = createGuardRig(scene);
      this.body = null;
      this.screen = null;
      this.halfW = 20;
      this.height = 118;
    } else {
      this.name = GIVER_TEXT.kioskName;
      this.rig = null;
      this.body = createKiosk(scene);
      this.screen = (this.body.getByName('screen') as Phaser.GameObjects.Rectangle | null) ?? null;
      this.halfW = 34;
      this.height = 128;
    }
    this.shadow = scene.add.ellipse(x, y, kind === 'kiosk' ? 80 : 48, kind === 'kiosk' ? 16 : 13, 0x000000, 0.25).setDepth(-5);
    this.label = scene.add
      .text(x, y - this.height - 8, this.name, {
        fontFamily: FONT,
        fontSize: '12px',
        fontStyle: 'bold',
        color: kind === 'kiosk' ? '#9fd3ff' : '#c9d3e6',
        stroke: '#111318',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1);
    this.sync();
  }

  /** 화면 끝에서 들어와 targetX에서 onArrive를 부르고(무기를 던지고) 다시 나가는 경비원 */
  static courierIn(scene: StageScene, fromX: number, y: number, targetX: number, onArrive: () => void): Giver {
    const g = new Giver(scene, 'guard', fromX, y, [], true);
    g.targetX = targetX;
    g.onArrive = onArrive;
    g.facing = targetX >= fromX ? 1 : -1;
    return g;
  }

  /** 인사(대여)할 수 있을 만큼 가까운지 */
  near(p: Player): boolean {
    if (this.removed || this.courier) return false;
    return Math.abs(p.x - this.x) < (this.kind === 'kiosk' ? 82 : 72) && Math.abs(p.y - this.y) < 36 && p.z < 24;
  }

  /** 화면 안에 보이는지 */
  inView(): boolean {
    const left = this.scene.cameras.main.scrollX;
    return !this.removed && this.x > left + 20 && this.x < left + GAME_W - 20;
  }

  /** 무기가 나오는(경비원 손, 대출기 구멍) 자리 */
  get handPos(): { x: number; y: number; z: number } {
    if (this.kind === 'kiosk') return { x: this.x - 6, y: this.y + 2, z: 54 };
    return { x: this.x + this.facing * 22, y: this.y, z: 64 };
  }

  /** 건넬 무기 하나를 고른다 */
  pickItem(): WeaponId {
    return this.items[Math.floor(Math.random() * this.items.length)];
  }

  say(text: string, sec = 1.6): void {
    if (!this.speech) this.speech = fx.speechText(this.scene, text);
    else this.speech.setText(text);
    this.speechT = sec;
  }

  /** sec초 뒤에 fn을 한다 */
  later(sec: number, fn: () => void): void {
    this.pending.push({ t: sec, fn });
  }

  /** 플레이어 쪽으로 돌아선다 */
  face(x: number): void {
    if (this.kind === 'guard' && Math.abs(x - this.x) > 4) this.facing = x >= this.x ? 1 : -1;
  }

  /** 맞받아 인사 */
  bow(): void {
    this.setPose('bow');
  }

  /** 무기를 던져 주는 동작 */
  tossPose(toX: number): void {
    this.face(toX);
    this.setPose('toss');
  }

  /** 대출기 화면이 깜빡인다 */
  blink(): void {
    this.blinkT = 0.7;
  }

  /** 플레이어의 공격·던진 무기에 맞았다. 경비원만 반응한다 (다치지 않고 움찔할 뿐). 반응했으면 true */
  rudeHit(): boolean {
    if (this.kind !== 'guard' || this.removed) return false;
    this.refuseT = REFUSE_SEC;
    this.setPose('flinch');
    this.face(this.scene.player.x);
    if (this.t - this.lastRudeSay > 1.2) {
      this.lastRudeSay = this.t;
      this.say(GIVER_TEXT.guardRude, 2.0);
    }
    return true;
  }

  private setPose(k: GuardPose): void {
    this.poseKind = k;
    this.poseT = 0;
  }

  update(dt: number, player: Player): void {
    if (this.removed) return;
    this.t += dt;
    this.poseT += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.refuseT > 0) this.refuseT -= dt;
    if (this.pending.length > 0) {
      for (const p of this.pending) p.t -= dt;
      const due = this.pending.filter((p) => p.t <= 0);
      this.pending = this.pending.filter((p) => p.t > 0);
      for (const p of due) p.fn();
      if (this.removed) return;
    }
    let moving = false;
    if (this.courier) {
      moving = this.updateCourier(dt);
      if (this.removed) return;
    } else if (this.kind === 'guard' && this.poseKind === 'idle' && Math.abs(player.x - this.x) < 260) {
      this.face(player.x);
    }
    if (this.poseKind !== 'idle' && this.poseT > 0.7) this.setPose('idle');

    if (this.rig) this.poseRig(dt, moving);
    if (this.screen) {
      if (this.blinkT > 0) this.blinkT -= dt;
      const on = this.blinkT > 0 && Math.floor(this.blinkT * 12) % 2 === 0;
      this.screen.setFillStyle(on ? 0xffffff : 0x9fd3ff);
    }
    this.sync();
    if (this.speech) {
      this.speechT -= dt;
      this.speech.setPosition(this.x, this.y - this.height - 30).setVisible(this.speechT > 0);
    }
    // 말하는 동안은 이름표를 숨긴다 (바로 앞에서 인사하는 플레이어의 말풍선과 겹치지 않게)
    this.label.setVisible(this.speechT <= 0);
  }

  /** 기믹 무기를 던져 주러 들어왔다 나간다. 걷는 중이면 true */
  private updateCourier(dt: number): boolean {
    this.courierT += dt;
    if (this.courierState === 'enter') {
      const d = this.targetX - this.x;
      this.facing = d >= 0 ? 1 : -1;
      if (Math.abs(d) < 6) {
        this.courierState = 'stay';
        this.courierT = 0;
        this.onArrive?.();
        this.onArrive = null;
        return false;
      }
      this.x += Math.sign(d) * Math.min(Math.abs(d), WALK * dt);
      return true;
    }
    if (this.courierState === 'stay') {
      if (this.courierT >= 0.8) {
        this.courierState = 'leave';
        this.courierT = 0;
      }
      return false;
    }
    const left = this.scene.cameras.main.scrollX;
    const dir = this.x - left < GAME_W / 2 ? -1 : 1;
    this.facing = dir;
    this.x += dir * WALK * dt;
    if (this.x < left - 70 || this.x > left + GAME_W + 70) this.destroy();
    return true;
  }

  private poseRig(dt: number, moving: boolean): void {
    const rig = this.rig as Rig;
    const p: Pose = neutralPose();
    let sharp = 14;
    if (moving) {
      this.walkPhase += dt * 9;
      const s = Math.sin(this.walkPhase);
      p.legF = s * 0.45;
      p.legB = -s * 0.45;
      p.armF = -s * 0.35;
      p.armB = s * 0.35;
      p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2;
    } else {
      switch (this.poseKind) {
        case 'bow':
          sharp = 12;
          p.body = this.poseT < 0.5 ? 0.42 : 0;
          p.armF = 0.08;
          p.armB = -0.08;
          break;
        case 'toss':
          sharp = 30;
          p.armF = this.poseT < 0.15 ? -2.7 : -1.2;
          p.body = this.poseT < 0.15 ? -0.12 : 0.15;
          break;
        case 'flinch':
          sharp = 30;
          p.body = -0.22;
          p.armF = -1.9;
          p.armB = -0.6;
          break;
        default:
          // 뒷짐 지고 서 있다 (가끔 모자챙을 만진다)
          p.armB = 0.35;
          p.armF = Math.sin(this.t * 0.7) > 0.96 ? -2.4 : 0.25;
          p.bob = Math.sin(this.t * 2.2) * 0.8;
      }
    }
    rig.update(dt, p, sharp);
  }

  private sync(): void {
    if (this.rig) {
      this.rig.root.setPosition(Math.round(this.x), Math.round(this.y)).setScale(this.facing, 1).setDepth(this.y);
    }
    if (this.body) {
      const shake = this.blinkT > 0.5 ? Math.sin(this.t * 60) * 1.2 : 0;
      this.body.setPosition(Math.round(this.x + shake), Math.round(this.y)).setDepth(this.y);
    }
    this.shadow.setPosition(this.x, this.y);
    this.label.setPosition(this.x, this.y - this.height - 8).setDepth(this.y + 0.5);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.pending = [];
    this.rig?.destroy();
    this.body?.destroy();
    this.shadow.destroy();
    this.label.destroy();
    this.speech?.destroy();
  }
}
