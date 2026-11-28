import Phaser from 'phaser';
import { FONT, GAME_W } from '../config';
import type { StageScene } from '../scenes/StageScene';
import type { Player } from './Player';
import { neutralPose, type Pose, type Rig } from './Rig';
import { createGuardRig } from './rigs';
import { createKiosk } from './studentRigs';
import { isWeaponId, type WeaponId } from './weapons';
import * as fx from '../fx';
import { play } from '../sound';

// 무기를 건네주는 것 (맞지 않고 넘어지지 않으며, 적은 상관하지 않는다).
// - 교직원 모드 "경비 선생님"(이름 없는 가상 인물): 앞에서 L(줍기 버튼)로 인사하면 무기를 준다.
//   공격이나 던진 무기로 건드리면 6초 동안 인사를 받아 주지 않는다. 보스 기믹 무기는 경비 선생님이 던져 준다.
//   그 구역에 경비 선생님이 없으면 화면 끝에서 잠깐 들어와 던져 주고 나간다 (courier).
//   11차(2026-11-21): 남녀가 번갈아 선다 — 스테이지의 자리 순서대로 남·여 (StageScene), 들어왔다 나가는 사람도 번갈아.
// - 학생 모드 "도서 무인 대출기"(사람이 아닌 기계): 앞에서 L(줍기 버튼)로 대여하면 무기가 나온다 (전공책이 가장 자주).
// 주고받는 흐름(무기 장착·바닥에 떨어뜨리기)은 StageScene이 맡고, 여기서는 모양·말풍선·동작·대기 시간만 다룬다.
// 결정 61 (2026-11-28):
// - 인사(대여)를 받아 줄 때마다 차례가 바뀐다: 아이템 → 인사만 → 아이템 → … (첫 인사는 아이템, giftTurn).
//   아이템 차례는 대기 시간(GIFT_COOLDOWN 8초)을 그대로 지키고, 대기 중이면 "방금 드렸잖아요~"/"대출 처리 중…" (차례는 그대로).
// - 대출기도 맞는다: "삐— 비정상적인 이용입니다." + 6초 동안 대여를 받지 않는다 (경비 선생님 "어허, 인사부터 하셔야죠."와 같다).
// - 이스터 에그(인사 15번 → 필살기 무한, 20번 맞히면 화난 마귀)는 StageScene이 세고, 마귀는 AngryGiver.ts. 마귀인 동안 이 경비원은 숨는다.

export type GiverKind = 'guard' | 'kiosk';

/** 선물 사이 대기 시간(초) */
export const GIFT_COOLDOWN = 8;
/** 무례하게 건드리면 인사를 받지 않는 시간(초) */
export const REFUSE_SEC = 6;

export const GIVER_TEXT = {
  guardName: '경비 선생님',
  kioskName: '도서 무인 대출기',
  /** 플레이어(교직원)의 인사 */
  hello: '안녕하세요!',
  guardGive: '네, 수고 많으십니다! 이거 쓰세요.',
  guardCooldown: '방금 드렸잖아요~',
  guardRude: '어허, 인사부터 하셔야죠.',
  guardRefuse: '흠… 조금 있다가 오세요.',
  /** 보스 기믹 무기를 던져 줄 때 (떠오르는 글자) */
  guardToss: '경비 선생님: 이거 쓰세요!',
  kioskGive: '도서 대여 완료!',
  kioskCooldown: '대출 처리 중…',
  // ---------- 결정 61 ★ (사용자 검토 대기) ----------
  /** 인사만 차례 (아이템 → 인사만 → 아이템 …) */
  guardHello: '네, 반갑습니다! 오늘도 힘내세요.',
  kioskHello: '반갑습니다! 오늘도 열공하세요.',
  /** 대출기를 때리거나 던진 것을 맞혔을 때 (6초 동안 대여를 받지 않는다 — 그동안 대여하면 같은 말) */
  kioskRude: '삐— 비정상적인 이용입니다.',
  /** 이스터 에그 ①: 10번째 인사(힌트), 15번째 띠 */
  guardEgg10: '허허, 인사성이 참 밝으시네요!',
  kioskEgg10: '이용 실적 우수 회원이시네요!',
  guardEggTitle: '경비 선생님의 응원!',
  kioskEggTitle: '도서관 우수 회원 혜택!',
  eggSub: '이번 스테이지 동안 필살기 무한',
  /** 이스터 에그 ②: 20번 맞힌 뒤 마귀 이름표·외침, 처리된 뒤 사과, 그 스테이지 동안 인사(대여)하면 */
  guardAngryName: '화난 경비 선생님',
  kioskAngryName: '폭주한 도서 무인 대출기',
  guardAngry: '이제 못 참습니다!!',
  kioskAngry: '경고! 경고! 대출 정지!!',
  guardSorry: '…죄송합니다, 제가 잠깐 이성을 잃었네요.',
  kioskSorry: '시스템 재부팅 완료. 점검 중입니다.',
  guardNoMore: '오늘은 더 드릴 게 없어요.',
  kioskNoMore: '점검 중입니다.',
} as const;

const WALK = 230;
/** 들어왔다 나가는 경비 선생님은 올 때마다 남녀가 바뀐다 */
let courierFemale = false;

type GuardPose = 'idle' | 'bow' | 'toss' | 'flinch';
type CourierState = 'enter' | 'stay' | 'leave';

export class Giver {
  readonly kind: GiverKind;
  readonly name: string;
  readonly items: WeaponId[];
  /** 기믹 무기를 던져 주러 잠깐 들어온 경비 선생님 (인사를 받지 않는다) */
  readonly courier: boolean;
  /** 여성 외형 경비 선생님 (화난 마귀도 같은 외형으로 그린다) */
  readonly female: boolean;
  x: number;
  /** 깊이 (화난 마귀를 처리하면 마귀가 있던 자리로 옮긴다) */
  y: number;
  readonly halfW: number;
  readonly height: number;
  facing = 1;
  removed = false;
  /** 다음 선물까지 남은 시간 */
  cooldown = 0;
  /** 인사를 받지 않는 남은 시간 (경비 선생님·대출기를 건드렸다) */
  refuseT = 0;
  /** 다음 인사(대여)가 아이템 차례인지 (false = 인사만 받아 주는 차례, 결정 61) */
  giftTurn = true;
  /** 화난 마귀(AngryGiver)가 되어 있는 동안 숨는다 */
  hidden = false;
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

  /** female: 경비 선생님을 여성 외형으로 (대출기는 상관없다) */
  constructor(scene: StageScene, kind: GiverKind, x: number, y: number, items: string[], courier = false, female = false) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.courier = courier;
    this.female = female;
    this.items = items.filter(isWeaponId);
    if (this.items.length === 0) this.items = [kind === 'kiosk' ? 'clipboard' : 'stapler'];
    if (kind === 'guard') {
      this.name = GIVER_TEXT.guardName;
      this.rig = createGuardRig(scene, female);
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

  /** 화면 끝에서 들어와 targetX에서 onArrive를 부르고(무기를 던지고) 다시 나가는 경비 선생님 (남녀 번갈아) */
  static courierIn(scene: StageScene, fromX: number, y: number, targetX: number, onArrive: () => void): Giver {
    courierFemale = !courierFemale;
    const g = new Giver(scene, 'guard', fromX, y, [], true, courierFemale);
    g.targetX = targetX;
    g.onArrive = onArrive;
    g.facing = targetX >= fromX ? 1 : -1;
    return g;
  }

  /** 인사(대여)할 수 있을 만큼 가까운지 */
  near(p: Player): boolean {
    if (this.removed || this.courier || this.hidden) return false;
    return Math.abs(p.x - this.x) < (this.kind === 'kiosk' ? 82 : 72) && Math.abs(p.y - this.y) < 36 && p.z < 24;
  }

  /** 화면 안에 보이는지 (화난 마귀가 되어 숨어 있으면 false) */
  inView(): boolean {
    const left = this.scene.cameras.main.scrollX;
    return !this.removed && !this.hidden && this.x > left + 20 && this.x < left + GAME_W - 20;
  }

  /** 화난 마귀(AngryGiver)가 대신 움직이는 동안 숨는다 */
  hide(): void {
    this.hidden = true;
    this.pending = [];
    this.speechT = 0;
    this.setVisible(false);
  }

  /** 화난 마귀가 처리되어 (x, y)에서 원래 얼굴로 돌아온다. 숨어 있던 동안 멈춰 있던 거절·대기 시간은 비운다
   *  (사과한 뒤 인사하면 "오늘은 더 드릴 게 없어요."가 나오게) */
  reappear(x: number, y: number, facing: number): void {
    this.hidden = false;
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.refuseT = 0;
    this.cooldown = 0;
    this.blinkT = 0;
    this.setPose('idle');
    this.setVisible(true);
    this.sync();
  }

  private setVisible(v: boolean): void {
    this.rig?.root.setVisible(v);
    this.body?.setVisible(v);
    this.shadow.setVisible(v);
    this.label.setVisible(v);
    this.speech?.setVisible(false);
  }

  /** 무기가 나오는(경비 선생님 손, 대출기 구멍) 자리 */
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

  /** 맞받아 인사. give = 무기를 건넨다 (인사만 받아 주는 차례에는 소리 없이 고개만 숙인다) */
  bow(give = true): void {
    // 경비원이 무기를 건넨다 (인사를 받아 준 때만 부른다)
    if (give) play('open', 0.8);
    this.setPose('bow');
  }

  /** 무기를 던져 주는 동작 */
  tossPose(toX: number): void {
    this.face(toX);
    this.setPose('toss');
  }

  /** 대출기 화면이 깜빡인다. give = 무기가 나온다 (인사만 받아 주는 차례에는 소리 없이 깜빡이기만) */
  blink(give = true): void {
    // 대출기에서 무기가 나온다
    if (give) play('open', 0.8);
    this.blinkT = 0.7;
  }

  /** 플레이어의 공격·던진 무기에 맞았다 (다치지 않는다). 경비 선생님은 움찔하고, 대출기는 화면이 빨개지며 떤다.
   *  REFUSE_SEC 동안 인사(대여)를 받지 않는다. 반응했으면 true */
  rudeHit(): boolean {
    if (this.removed || this.hidden) return false;
    this.refuseT = REFUSE_SEC;
    this.setPose('flinch');
    this.face(this.scene.player.x);
    if (this.kind === 'kiosk') this.blinkT = 0.7;
    if (this.t - this.lastRudeSay > 1.2) {
      this.lastRudeSay = this.t;
      this.say(this.kind === 'kiosk' ? GIVER_TEXT.kioskRude : GIVER_TEXT.guardRude, 2.0);
    }
    return true;
  }

  private setPose(k: GuardPose): void {
    this.poseKind = k;
    this.poseT = 0;
  }

  update(dt: number, player: Player): void {
    if (this.removed || this.hidden) return;
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
      // 맞아서 대여를 받지 않는 동안은 화면이 빨갛다 (깜빡일 때는 빨강·흰색)
      const base = this.refuseT > 0 ? 0xff8a8a : 0x9fd3ff;
      this.screen.setFillStyle(on ? 0xffffff : base);
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
