import Phaser from 'phaser';
import { FONT } from '../config';
import { createFoodIcon, createPetitionIcon, type FoodKind } from './rigs';
import { weaponIcon } from './studentRigs';
import { WEAPONS, isWeaponId, weaponName, type WeaponId } from './weapons';

// 바닥에 놓인 물건.
// - 무기: 위에 서서 L(또는 맨손 공격)로 줍는다.
// - 음식·일거리·서명지: 밟으면 바로 줍는다. 일거리는 김밥처럼 생겼지만 서류 귀퉁이가 보인다.

export type PickupKind = WeaponId | FoodKind | 'petition';

const LABELS: Record<string, string> = {
  donkatsu: '학식 돈가스',
  gimbap: '삼각김밥',
  americano: '아메리카노',
  work: '삼각김밥?',
  petition: '단체 서명지',
};

export class Pickup {
  readonly kind: PickupKind;
  readonly x: number;
  readonly y: number;
  removed = false;
  private t = Math.random() * 6;
  private ttl: number;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly label: Phaser.GameObjects.Text;

  /** ttl: 0이면 사라지지 않는다. student: 학생 모드 이름·모양 (텀블러·장우산·전공책·학생증) */
  constructor(scene: Phaser.Scene, kind: PickupKind, x: number, y: number, ttl = 0, student = false) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.ttl = ttl;
    if (isWeaponId(kind)) this.obj = weaponIcon(scene, kind, student);
    else if (kind === 'petition') this.obj = createPetitionIcon(scene);
    else this.obj = createFoodIcon(scene, kind);
    this.shadow = scene.add.ellipse(x, y, 46, 10, 0x000000, 0.25).setDepth(-5);
    const name = isWeaponId(kind) ? weaponName(WEAPONS[kind], student) : LABELS[kind];
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

  update(dt: number): void {
    this.t += dt;
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
