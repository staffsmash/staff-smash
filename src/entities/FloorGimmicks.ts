import Phaser from 'phaser';
import { FLOOR_BOTTOM, FLOOR_TOP, FONT } from '../config';
import type { Player } from './Player';

// 학생·교직원 모드 바닥 기믹. 판정과 수명은 각자 갖고, StageScene이 매 프레임 부른다.
// - PenLine  나진취의 빨간 첨삭 선: 깊이 방향으로 길을 막는다 (점프하면 넘는다)
// - Cobweb   최내놔 처장의 거미줄 (교직원 모드): 던져서 바닥에 4초 남는다. 밟으면 처장 곁으로 끌려간다 (피해 없음)
// - SignLine 프레지던트 캉의 MOU 서명선: 바닥에 길게 그어진다. 1초 예고 뒤 금빛으로 빛나며 닿으면 아프다
// (11차에 예전 창구 직원 기믹 — 소등·국물·동전 — 은 없앴다)

/** 나진취의 빨간 첨삭 선: 바닥을 앞뒤로 가로질러 길을 막는다. 점프하면 넘는다 */
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

/** 최내놔 처장의 거미줄: 그림자 예고 → 바닥에 떨어져 4초 남는다. 밟으면 caught (StageScene이 처장 곁으로 끌어당긴다) */
export class Cobweb {
  readonly x: number;
  readonly y: number;
  removed = false;
  private t = 0;
  private readonly flight = 0.7;
  private readonly life: number;
  private readonly fromX: number;
  private readonly fromY: number;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly web: Phaser.GameObjects.Graphics;
  private readonly ball: Phaser.GameObjects.Graphics;
  static readonly RX = 58;
  static readonly RY = 19;

  constructor(scene: Phaser.Scene, fromX: number, fromY: number, x: number, y: number, life = 4) {
    this.x = x;
    this.y = y;
    this.fromX = fromX;
    this.fromY = fromY;
    this.life = life;
    this.shadow = scene.add.ellipse(x, y, Cobweb.RX * 2, Cobweb.RY * 2, 0x000000, 0.28).setDepth(-4).setScale(0.3);
    this.web = scene.add.graphics().setDepth(-3).setVisible(false);
    const g = this.web;
    g.lineStyle(2, 0xf4f4f4, 0.9);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineBetween(x, y, x + Math.cos(a) * Cobweb.RX, y + Math.sin(a) * Cobweb.RY);
    }
    for (const k of [0.35, 0.65, 0.95]) {
      g.lineStyle(1.5, 0xe5e7eb, 0.85);
      g.strokeEllipse(x, y, Cobweb.RX * 2 * k, Cobweb.RY * 2 * k);
    }
    // 날아가는 동안: 뭉친 거미줄 공
    this.ball = scene.add.graphics();
    this.ball.lineStyle(2, 0xf4f4f4, 1).strokeCircle(0, 0, 10).lineBetween(-10, 0, 10, 0).lineBetween(0, -10, 0, 10);
    this.ball.setPosition(fromX, fromY);
  }

  /** 바닥에 떨어져 밟을 수 있다 */
  get landed(): boolean {
    return this.t >= this.flight && this.t < this.flight + this.life;
  }

  contains(px: number, py: number): boolean {
    const dx = (px - this.x) / Cobweb.RX;
    const dy = (py - this.y) / Cobweb.RY;
    return dx * dx + dy * dy <= 1;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.t < this.flight) {
      const k = this.t / this.flight;
      this.ball.setPosition(this.fromX + (this.x - this.fromX) * k, this.fromY + (this.y - this.fromY) * k - Math.sin(k * Math.PI) * 110);
      this.ball.rotation += dt * 9;
      this.ball.setDepth(this.y + 1);
      this.shadow.setScale(0.3 + 0.7 * k);
      return;
    }
    if (this.ball.visible) {
      this.ball.setVisible(false);
      this.web.setVisible(true);
      this.shadow.setAlpha(0.12);
    }
    const left = this.flight + this.life - this.t;
    if (left < 0.6) this.web.setAlpha(Math.max(0, left / 0.6));
    if (left <= 0) this.destroy();
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.shadow.destroy();
    this.web.destroy();
    this.ball.destroy();
  }
}

/** 프레지던트 캉의 MOU 서명선: (x1, y1) → (x2, y2) 바닥 선. warn초 예고(옅은 선) 뒤 glow초 동안 금빛으로 빛나며 닿으면 아프다 */
export class SignLine {
  removed = false;
  /** 이번 선에 이미 맞았다 */
  hit = false;
  private t = 0;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly pts: { x: number; y: number }[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly x1: number,
    private readonly y1: number,
    private readonly x2: number,
    private readonly y2: number,
    private readonly warn = 1.0,
    private readonly glow = 0.7,
  ) {
    this.g = scene.add.graphics().setDepth(-3);
    // 서명처럼 구불구불한 선 (점은 미리 정해 둔다)
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const wob = Math.sin(k * Math.PI * 7) * 6 + Math.sin(k * Math.PI * 3.2) * 4;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      this.pts.push({ x: x1 + (x2 - x1) * k + nx * wob, y: y1 + (y2 - y1) * k + ny * wob * 0.4 });
    }
    this.draw(false, 0);
  }

  /** 빛나는 중 (닿으면 아프다) */
  get hot(): boolean {
    return this.t >= this.warn && this.t < this.warn + this.glow;
  }

  private draw(hot: boolean, k: number): void {
    const g = this.g;
    g.clear();
    if (hot) {
      g.lineStyle(14, 0xf5c542, 0.35);
      g.strokePoints(this.pts);
      g.lineStyle(6, 0xffe066, 1);
      g.strokePoints(this.pts);
    } else {
      g.lineStyle(3, 0xf5c542, 0.25 + 0.45 * (Math.floor(k * 8) % 2));
      g.strokePoints(this.pts);
    }
  }

  /** 플레이어가 선에 닿았는지 (깊이 차이는 2.5배로 본다, 점프 중이면 아니다) */
  touches(p: Player): boolean {
    if (!this.hot || this.hit || p.z > 20) return false;
    const dx = this.x2 - this.x1;
    const dy = (this.y2 - this.y1) * 2.5;
    const px = p.x - this.x1;
    const py = (p.y - this.y1) * 2.5;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
    return Math.hypot(px - dx * k, py - dy * k) < 26;
  }

  update(dt: number): void {
    const was = this.hot;
    this.t += dt;
    if (this.t < this.warn) this.draw(false, this.t / this.warn);
    else if (this.hot && !was) this.draw(true, 1);
    else if (!this.hot) {
      this.g.setAlpha(Math.max(0, 1 - (this.t - this.warn - this.glow) / 0.3));
      if (this.t >= this.warn + this.glow + 0.3) this.destroy();
    }
  }

  destroy(): void {
    if (this.removed) return;
    this.removed = true;
    this.g.destroy();
  }
}
