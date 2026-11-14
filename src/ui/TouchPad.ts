import Phaser from 'phaser';
import { FONT, GAME_W } from '../config';
import type { Action, Controls } from '../input/Controls';

// 모바일 가상 패드. 왼쪽 절반 아무 곳이나 누르면 그 자리에 조이스틱이 생긴다.
// 조이스틱을 끝까지 밀면 달리기(대시)가 된다.

interface Btn {
  action: Action;
  x: number;
  y: number;
  r: number;
  label: string;
  down: boolean;
  text: Phaser.GameObjects.Text;
}

const R = 62;
const HOME = { x: 130, y: 420 };

export class TouchPad {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly c: Controls;
  private stickId = -1;
  private base = { ...HOME };
  private knob = { ...HOME };
  private readonly btns: Btn[];
  private readonly owners = new Map<number, Btn>();

  constructor(scene: Phaser.Scene, c: Controls) {
    this.c = c;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(3000);
    const defs: Omit<Btn, 'down' | 'text'>[] = [
      { action: 'attack', x: 866, y: 442, r: 56, label: 'A' },
      { action: 'jump', x: 748, y: 488, r: 42, label: 'B' },
      { action: 'pickup', x: 762, y: 378, r: 34, label: '줍기' },
      { action: 'special', x: 886, y: 316, r: 38, label: 'SP' },
      { action: 'pause', x: 926, y: 34, r: 22, label: 'II' },
    ];
    this.btns = defs.map((d) => ({
      ...d,
      down: false,
      text: scene.add
        .text(d.x, d.y, d.label, {
          fontFamily: FONT,
          fontSize: d.r > 40 ? '26px' : '15px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
        .setScrollFactor(0)
        .setDepth(3001),
    }));
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  private onDown(p: Phaser.Input.Pointer): void {
    for (const b of this.btns) {
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= (b.r * 1.25) ** 2) {
        b.down = true;
        this.owners.set(p.id, b);
        this.c.pressTouch(b.action);
        return;
      }
    }
    if (p.x < GAME_W * 0.5 && this.stickId < 0) {
      this.stickId = p.id;
      this.base = { x: Phaser.Math.Clamp(p.x, 80, 400), y: Phaser.Math.Clamp(p.y, 170, 470) };
      this.updateStick(p.x, p.y);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) this.updateStick(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) {
      this.stickId = -1;
      this.base = { ...HOME };
      this.knob = { ...HOME };
      this.c.setTouchMove(0, 0, false);
    }
    const b = this.owners.get(p.id);
    if (b) {
      b.down = false;
      this.owners.delete(p.id);
    }
  }

  private updateStick(x: number, y: number): void {
    const dx = x - this.base.x;
    const dy = y - this.base.y;
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;
    this.knob = { x: this.base.x + dx * k, y: this.base.y + dy * k };
    const nx = (dx * k) / R;
    const ny = (dy * k) / R;
    // 키보드와 같은 8방향으로 맞춘다
    const qx = Math.abs(nx) > 0.38 ? Math.sign(nx) : 0;
    const qy = Math.abs(ny) > 0.38 ? Math.sign(ny) : 0;
    const run = d > R * 1.15 && Math.abs(dx) > Math.abs(dy);
    this.c.setTouchMove(qx, qy, run);
  }

  /** pickLabel: 줍기 버튼에 따로 쓸 이름 (경비원 앞 "인사", 대출기 앞 "대여") */
  draw(spReady: boolean, holding: boolean, pickLabel: string | null = null): void {
    const g = this.g;
    g.clear();
    g.lineStyle(3, 0xffffff, 0.35);
    g.strokeCircle(this.base.x, this.base.y, R);
    g.fillStyle(0xffffff, this.stickId >= 0 ? 0.5 : 0.25);
    g.fillCircle(this.knob.x, this.knob.y, 26);
    for (const b of this.btns) {
      let color = 0xffffff;
      let alpha = b.down ? 0.5 : 0.22;
      if (b.action === 'special') {
        color = spReady ? 0xf5c542 : 0x888888;
        alpha = spReady ? 0.7 : 0.18;
      }
      if (b.action === 'pickup') {
        b.text.setText(pickLabel ?? (holding ? '던지기' : '줍기'));
        if (pickLabel) color = 0x7cfc9a;
        else if (holding) color = 0x9fd3ff;
      }
      g.fillStyle(color, alpha);
      g.fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, 0xffffff, 0.45);
      g.strokeCircle(b.x, b.y, b.r);
    }
  }
}
