import Phaser from 'phaser';
import { FONT } from '../config';
import { createFoodIcon, createPetitionIcon, type FoodKind } from './rigs';
import { weaponIcon } from './studentRigs';
import { WEAPONS, isWeaponId, weaponName, type WeaponId } from './weapons';

// 바닥에 놓인 물건.
// - 무기: 위에 서서 L(또는 맨손 공격)로 줍는다.
// - 음식·식권·보조배터리·연차 쿠폰(공결 확인서)·셔틀버스 시간표·단톡방 공지 캡처·일거리·서명지: 밟으면 바로 줍는다. 일거리는 김밥처럼 생겼지만 서류 귀퉁이가 보인다.
// - 경비원이 던져 주거나 상자에서 튀어나온 물건은 날아가는 동안(toss) 줍지 못한다.

export type PickupKind = WeaponId | FoodKind | 'petition';

const LABELS: Record<string, string> = {
  donkatsu: '학식 돈가스',
  gimbap: '삼각김밥',
  americano: '아메리카노',
  work: '삼각김밥?',
  mealticket: '식권',
  battery: '보조배터리',
  shield: '연차 쿠폰',
  shuttle: '셔틀버스 시간표',
  capture: '단톡방 공지 캡처',
  petition: '단체 서명지',
};

/** 학생 모드에서 이름이 바뀌는 것 */
const STUDENT_LABELS: Record<string, string> = {
  shield: '공결 확인서',
};

/** 던져진 물건이 날아가는 중의 정보 */
interface Toss {
  sx: number;
  sy: number;
  sz: number;
  t: number;
  dur: number;
  arc: number;
}

export class Pickup {
  readonly kind: PickupKind;
  readonly x: number;
  readonly y: number;
  removed = false;
  private t = Math.random() * 6;
  private ttl: number;
  private toss: Toss | null = null;
  private readonly scene: Phaser.Scene;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;

  /** ttl: 0이면 사라지지 않는다. student: 학생 모드 이름·모양 (텀블러·장우산·전공책·학생증) */
  constructor(scene: Phaser.Scene, kind: PickupKind, x: number, y: number, ttl = 0, student = false) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.ttl = ttl;
    if (isWeaponId(kind)) this.obj = weaponIcon(scene, kind, student);
    else if (kind === 'petition') this.obj = createPetitionIcon(scene);
    else this.obj = createFoodIcon(scene, kind, student);
    this.shadow = scene.add.ellipse(x, y, 46, 10, 0x000000, 0.25).setDepth(-5);
    const name = isWeaponId(kind) ? weaponName(WEAPONS[kind], student) : ((student && STUDENT_LABELS[kind]) || LABELS[kind]);
    this.label = scene.add
      .text(x, y - 40, name, {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#111318',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
    this.update(0);
  }

  get isWeapon(): boolean {
    return isWeaponId(this.kind);
  }

  /** 바닥에 내려앉았는지 (날아가는 중에는 줍지 못한다) */
  get landed(): boolean {
    return this.toss === null;
  }

  /** (sx, sy) 높이 sz에서 던져져 제자리(x, y)로 포물선을 그리며 떨어진다 */
  tossFrom(sx: number, sy: number, sz = 50, dur = 0.55, arc = 70): this {
    this.toss = { sx, sy, sz, t: 0, dur: Math.max(0.15, dur), arc };
    this.update(0);
    return this;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.toss) {
      const s = this.toss;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      const x = s.sx + (this.x - s.sx) * k;
      const y = s.sy + (this.y - s.sy) * k;
      const z = s.sz * (1 - k) + s.arc * Math.sin(Math.PI * k);
      this.obj.setPosition(x, y - 14 - z).setDepth(y).setAngle(k * 360);
      this.shadow.setPosition(x, y).setScale(0.6 + 0.4 * k);
      this.label.setPosition(x, y - 40 - z).setAlpha(0);
      if (k >= 1) {
        this.toss = null;
        this.obj.setAngle(0);
        this.shadow.setPosition(this.x, this.y).setScale(1);
        this.label.setPosition(this.x, this.y - 40);
        const dust = this.scene.add.ellipse(this.x, this.y - 2, 30, 8, 0xd8d8d8, 0.7).setDepth(this.y + 1);
        this.scene.tweens.add({ targets: dust, scaleX: 1.8, alpha: 0, duration: 260, onComplete: () => dust.destroy() });
      }
      return;
    }
    if (this.ttl > 0) {
      this.ttl -= dt;
      if (this.ttl <= 0) {
        this.destroy();
        return;
      }
      const blink = this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0;
      this.obj.setAlpha(blink ? 0.3 : 1);
    }
    this.obj.setPosition(this.x, this.y - 14 - Math.sin(this.t * 4) * 3).setDepth(this.y);
    this.label.setDepth(this.y + 0.5).setAlpha(0.6 + Math.sin(this.t * 4) * 0.3);
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
    this.label.destroy();
  }
}
