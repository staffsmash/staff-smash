import Phaser from 'phaser';
import { FLOOR_BOTTOM, FLOOR_TOP, FONT, GAME_H, GAME_W } from '../config';
import type { Player } from './Player';
import { createCoin } from './studentRigs';

// 학생 모드 창구 중간보스가 남기는 바닥·화면 기믹. 판정과 수명은 각자 갖고, StageScene이 매 프레임 부른다.
// - Puddle   김학생식당이 쏟은 국물: 밟으면 미끄러진다
// - PenLine  이진취의 빨간 첨삭 선: 깊이 방향으로 길을 막는다 (점프하면 넘는다)
// - Coin     최장학의 동전(미끼): 밟으면 잠깐 멈춘다. 잠시 뒤 최장학이 회수한다
// - Darkness 박국제학사의 소등: 화면이 어두워지고 플레이어 주변만 보인다

/** 김학생식당이 쏟은 국물 */
export class Puddle {
  readonly x: number;
  readonly y: number;
  removed = false;
  private t = 0;
  private readonly life: number;
  private readonly obj: Phaser.GameObjects.Container;
  static readonly RX = 76;
  static readonly RY = 22;

  constructor(scene: Phaser.Scene, x: number, y: number, life: number) {
    this.x = x;
    this.y = y;
    this.life = life;
    const c = scene.add.container(x, y).setDepth(-4);
    c.add(scene.add.ellipse(0, 0, Puddle.RX * 2, Puddle.RY * 2, 0xc9782e, 0.85));
    c.add(scene.add.ellipse(4, 2, Puddle.RX * 1.5, Puddle.RY * 1.3, 0xd99545, 0.9));
    c.add(scene.add.ellipse(-26, -7, 46, 8, 0xffe2b0, 0.65));
    for (const [bx, by, col] of [
      [-30, 4, 0x4caf50],
      [18, -4, 0xf4f4f4],
      [40, 6, 0x4caf50],
      [-6, 9, 0xf4f4f4],
    ] as const) {
      c.add(scene.add.rectangle(bx, by, 7, 4, col));
    }
    c.setScale(0.2);
    scene.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.Out' });
    this.obj = c;
  }

  contains(px: number, py: number): boolean {
    const dx = (px - this.x) / Puddle.RX;
    const dy = (py - this.y) / Puddle.RY;
    return dx * dx + dy * dy <= 1;
  }

  update(dt: number, player: Player): void {
    this.t += dt;
    if (this.t >= this.life) {
      this.obj.alpha = Math.max(0, 1 - (this.t - this.life) / 0.5);
      if (this.t >= this.life + 0.5) this.destroy();
      return;
    }
    if (player.z < 6 && this.contains(player.x, player.y)) player.slipT = 0.15;
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
  }
}

/** 이진취의 빨간 첨삭 선: 바닥을 앞뒤로 가로질러 길을 막는다. 점프하면 넘는다 */
export class PenLine {
  readonly x: number;
  removed = false;
  private t = 0;
  private full = false;
  private readonly life: number;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private static readonly GROW = 0.35;

  constructor(scene: Phaser.Scene, x: number, life: number) {
    this.x = x;
    this.life = life;
    this.g = scene.add.graphics().setDepth(-3);
    this.label = scene.add
      .text(x, FLOOR_TOP - 14, '첨삭', {
        fontFamily: FONT,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#d0202f',
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(FLOOR_TOP - 1)
      .setAlpha(0);
    this.draw(0);
  }

  /** 다 그려져서 길을 막는 중인지 */
  get solid(): boolean {
    return this.t >= PenLine.GROW && this.t < this.life;
  }

  private draw(k: number): void {
    const g = this.g;
    g.clear();
    const y0 = FLOOR_TOP - 6;
    const y1 = y0 + (FLOOR_BOTTOM + 12 - y0) * k;
    // 바닥에 비친 붉은 띠 + 구불구불한 펜 선 두 줄
    g.fillStyle(0xd0202f, 0.16).fillRect(this.x - 14, y0, 28, y1 - y0);
    for (const [off, w] of [
      [-3, 5],
      [4, 3],
    ] as const) {
      g.lineStyle(w, 0xd0202f, 0.95);
      g.beginPath();
      g.moveTo(this.x + off, y0);
      for (let y = y0; y <= y1; y += 12) g.lineTo(this.x + off + Math.sin(y / 9 + off) * 4, y);
      g.strokePath();
    }
    // 고친 자국 (X 표시)
    g.lineStyle(3, 0xd0202f, 0.9);
    for (let y = y0 + 40; y < y1 - 10; y += 70) {
      g.lineBetween(this.x + 14, y - 6, this.x + 26, y + 6);
      g.lineBetween(this.x + 26, y - 6, this.x + 14, y + 6);
    }
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.full) {
      const k = Math.min(1, this.t / PenLine.GROW);
      this.draw(k);
      this.label.setAlpha(k);
      this.full = k >= 1;
    }
    if (this.t >= this.life) {
      const a = Math.max(0, 1 - (this.t - this.life) / 0.4);
      this.g.setAlpha(a);
      this.label.setAlpha(a);
      if (this.t >= this.life + 0.4) this.destroy();
    } else if (this.life - this.t < 1) {
      // 곧 지워진다: 깜빡임
      this.g.setAlpha(Math.floor(this.t * 10) % 2 === 0 ? 0.45 : 1);
    }
  }

  /** 플레이어가 선을 넘지 못하게 한다. prevX = 이번 프레임에 움직이기 전 위치 */
  block(p: Player, prevX: number): boolean {
    if (!this.solid || p.z > 30) return false;
    const side = Math.sign(prevX - this.x) || 1;
    const minD = p.halfW + 8;
    if ((p.x - this.x) * side < minD) {
      p.x = this.x + side * minD;
      if (p.vx * side < 0) p.vx = 0;
      return true;
    }
    return false;
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.g.destroy();
    this.label.destroy();
  }
}

/** 최장학이 뿌리는 동전 (미끼) */
export class Coin {
  x: number;
  y: number;
  removed = false;
  /** 땅에 떨어져 밟을 수 있다 */
  landed = false;
  private collecting = false;
  private t = Math.random() * 6;
  private readonly scene: Phaser.Scene;
  private readonly obj: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, fromX: number, fromY: number, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.obj = createCoin(scene).setPosition(fromX, fromY - 80).setDepth(y);
    this.shadow = scene.add.ellipse(x, y, 20, 6, 0x000000, 0.25).setDepth(-5);
    const arc = { k: 0 };
    scene.tweens.add({
      targets: arc,
      k: 1,
      duration: 420 + Math.random() * 160,
      ease: 'Sine.Out',
      onUpdate: () => {
        const k = arc.k;
        this.obj.setPosition(fromX + (x - fromX) * k, fromY - 80 + (y - 12 - (fromY - 80)) * k - Math.sin(k * Math.PI) * 70);
      },
      onComplete: () => {
        this.landed = true;
      },
    });
  }

  /** 플레이어가 밟았는지 */
  touching(p: Player): boolean {
    return this.landed && !this.collecting && Math.abs(p.x - this.x) < 26 && Math.abs(p.y - this.y) < 16 && p.z < 10;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.landed && !this.collecting) {
      this.obj.setPosition(this.x, this.y - 12 - Math.abs(Math.sin(this.t * 4)) * 4).setScale(Math.abs(Math.cos(this.t * 3)) * 0.7 + 0.3, 1);
    }
  }

  /** 최장학이 회수한다: 주인에게 날아가 사라진다 */
  collectTo(x: number, y: number): void {
    if (this.collecting || this.removed) return;
    this.collecting = true;
    this.shadow.setVisible(false);
    this.scene.tweens.add({
      targets: this.obj,
      x,
      y,
      scale: 0.4,
      duration: 380 + Math.random() * 200,
      ease: 'Cubic.In',
      onComplete: () => this.destroy(),
    });
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.obj.destroy();
    this.shadow.destroy();
  }
}

/** 박국제학사의 소등: 화면을 덮는 어둠 + 플레이어 주변의 빛. 2배 크기 텍스처에 구멍을 한 번 뚫고 플레이어를 따라 옮긴다 */
export class Darkness {
  removed = false;
  private t = 0;
  private readonly life: number;
  private readonly rt: Phaser.GameObjects.RenderTexture;

  constructor(scene: Phaser.Scene, life: number) {
    this.life = life;
    const w = GAME_W * 2;
    const h = GAME_H * 2;
    this.rt = scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setScrollFactor(0).setDepth(1750).setAlpha(0);
    this.rt.fill(0x04060c, 0.93);
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 0.5).fillCircle(w / 2, h / 2, 170);
    g.fillStyle(0xffffff, 1).fillCircle(w / 2, h / 2, 128);
    this.rt.erase(g, 0, 0);
    g.destroy();
  }

  get remaining(): number {
    return Math.max(0, this.life - this.t);
  }

  /** sx, sy = 빛의 가운데 (화면 좌표) */
  update(dt: number, sx: number, sy: number): void {
    this.t += dt;
    const fadeIn = Math.min(1, this.t / 0.25);
    const fadeOut = Math.min(1, Math.max(0, (this.life - this.t) / 0.4));
    this.rt.setAlpha(Math.min(fadeIn, fadeOut));
    this.rt.setPosition(Math.round(sx - GAME_W), Math.round(sy - GAME_H));
    if (this.t >= this.life) this.destroy();
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.rt.destroy();
  }
}
