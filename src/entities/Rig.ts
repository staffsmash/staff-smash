import Phaser from 'phaser';

// 블록형 캐릭터 몸체. 머리·몸통·팔·다리 조각을 컨테이너로 엮고,
// 관절 회전값(Pose)만 바꿔서 걷기·공격·피격·다운 동작을 만든다.
// 로컬 좌표계: 발바닥 = (0, 0), 오른쪽(+x)을 바라보는 모습. 왼쪽을 볼 때는 root.scaleX = -1.

export interface RigSpec {
  legW: number;
  legH: number;
  legGap: number;
  legColor: number;
  shoeColor: number;
  torsoW: number;
  torsoH: number;
  torsoColor: number;
  armW: number;
  armH: number;
  armColor: number;
  handColor: number;
  headW: number;
  headH: number;
  headColor: number;
  outline: number;
}

/** 관절 각도(라디안). 팔 -π/2 = 앞으로 뻗기, -π = 머리 위로. body -π/2 = 뒤로 누움. */
export interface Pose {
  legF: number;
  legB: number;
  armF: number;
  armB: number;
  body: number;
  bob: number;
}

export const neutralPose = (): Pose => ({ legF: 0, legB: 0, armF: 0, armB: 0, body: 0, bob: 0 });

type Container = Phaser.GameObjects.Container;

function shade(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export class Rig {
  readonly root: Container;
  readonly body: Container;
  readonly legF: Container;
  readonly legB: Container;
  readonly armF: Container;
  readonly armB: Container;
  readonly torso: Container;
  readonly head: Container;
  /** 앞손에 쥐는 소품(도장, 결재판 등)을 붙이는 자리 */
  readonly itemF: Container;
  readonly spec: RigSpec;

  private readonly scene: Phaser.Scene;
  private shapes: { s: Phaser.GameObjects.Shape; color: number }[] = [];
  private cur: Pose = neutralPose();
  private flashT = 0;

  constructor(scene: Phaser.Scene, spec: RigSpec) {
    this.scene = scene;
    this.spec = spec;
    const s = spec;
    const hipY = -s.legH;
    const neckY = hipY - s.torsoH;
    const shoulderY = neckY + 3;
    const armX = s.torsoW / 2 + s.armW / 2 - 1;
    const handH = Math.round(s.armW * 0.9);

    this.root = scene.add.container(0, 0);
    this.body = new Phaser.GameObjects.Container(scene, 0, 0);
    this.root.add(this.body);

    this.armB = this.limb(-armX, shoulderY, s.armW, s.armH, shade(s.armColor, 0.82), shade(s.handColor, 0.85), handH);
    this.legB = this.leg(-s.legGap / 2, hipY, shade(s.legColor, 0.8));
    this.legF = this.leg(s.legGap / 2, hipY, s.legColor);

    this.torso = new Phaser.GameObjects.Container(scene, 0, hipY);
    this.torso.add(this.part(0, 0, s.torsoW, s.torsoH, s.torsoColor, 0.5, 1));

    this.head = new Phaser.GameObjects.Container(scene, 0, neckY + 1);
    if (s.headW > 0) this.head.add(this.part(0, 0, s.headW, s.headH, s.headColor, 0.5, 1));

    this.armF = this.limb(armX, shoulderY, s.armW, s.armH, s.armColor, s.handColor, handH);
    this.itemF = new Phaser.GameObjects.Container(scene, 0, s.armH + handH - 2);
    this.armF.add(this.itemF);

    this.body.add([this.armB, this.legB, this.legF, this.torso, this.head, this.armF]);
  }

  /** 테두리가 있는 사각 조각을 만든다. 피격 시 하얗게 깜빡이는 대상에 등록된다. */
  part(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    ox = 0.5,
    oy = 0,
    stroke = true,
  ): Phaser.GameObjects.Rectangle {
    const r = new Phaser.GameObjects.Rectangle(this.scene, x, y, w, h, color);
    r.setOrigin(ox, oy);
    if (stroke && this.spec.outline >= 0) r.setStrokeStyle(2, this.spec.outline);
    this.shapes.push({ s: r, color });
    return r;
  }

  private leg(x: number, y: number, color: number): Container {
    const s = this.spec;
    const c = new Phaser.GameObjects.Container(this.scene, x, y);
    c.add(this.part(0, 0, s.legW, s.legH - 5, color, 0.5, 0));
    c.add(this.part(2, s.legH - 6, s.legW + 4, 6, s.shoeColor, 0.5, 0));
    return c;
  }

  private limb(x: number, y: number, w: number, h: number, color: number, hand: number, handH: number): Container {
    const c = new Phaser.GameObjects.Container(this.scene, x, y);
    c.add(this.part(0, 0, w, h, color, 0.5, 0));
    c.add(this.part(0, h - 1, w, handH, hand, 0.5, 0));
    return c;
  }

  /** 피격 순간 하얗게 깜빡인다. */
  flash(sec = 0.07): void {
    this.flashT = sec;
    for (const { s } of this.shapes) s.setFillStyle(0xffffff);
  }

  /** 목표 자세로 부드럽게 옮긴다. sharp가 클수록 빠르게 따라간다. */
  update(dt: number, target: Pose, sharp = 16): void {
    const k = 1 - Math.exp(-sharp * dt);
    const c = this.cur;
    c.legF += (target.legF - c.legF) * k;
    c.legB += (target.legB - c.legB) * k;
    c.armF += (target.armF - c.armF) * k;
    c.armB += (target.armB - c.armB) * k;
    c.body += (target.body - c.body) * k;
    c.bob += (target.bob - c.bob) * k;

    this.legF.rotation = c.legF;
    this.legB.rotation = c.legB;
    this.armF.rotation = c.armF;
    this.armB.rotation = c.armB;
    this.body.rotation = c.body;
    this.body.y = c.bob;

    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) for (const { s, color } of this.shapes) s.setFillStyle(color);
    }
  }

  destroy(): void {
    this.root.destroy();
  }
}
