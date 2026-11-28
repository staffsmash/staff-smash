import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import type { Action, Controls } from '../input/Controls';
import { btnScale, onBtnSize } from '../uiPrefs';

// 모바일 가상 패드. 왼쪽 절반 아무 곳이나 누르면 그 자리에 조이스틱이 생긴다.
// 조이스틱을 끝까지 밀면 달리기(대시)가 된다.
// 단추 크기(설정 "작게·보통·크게", src/uiPrefs.ts — 결정 60)는 화면 모서리를 기준점으로 단추 크기와 사이 간격을 같은 비율로 바꾼다
// (오른쪽 아래 묶음은 오른쪽 아래 모서리, 일시정지는 오른쪽 위 모서리, 조이스틱 자리는 왼쪽 아래 모서리). 일시정지 중에 바꿔도 바로 적용된다.

interface Corner {
  x: number;
  y: number;
}

const BR: Corner = { x: GAME_W, y: GAME_H };
const TR: Corner = { x: GAME_W, y: 0 };
const BL: Corner = { x: 0, y: GAME_H };

interface BtnDef {
  action: Action;
  /** 보통 크기(1배)일 때 자리·반지름 */
  x: number;
  y: number;
  r: number;
  label: string;
  /** 크기를 바꿀 때 기준이 되는 화면 모서리 */
  corner: Corner;
}

interface Btn {
  def: BtnDef;
  x: number;
  y: number;
  r: number;
  down: boolean;
  text: Phaser.GameObjects.Text;
}

const R = 62;
const KNOB_R = 26;
const HOME = { x: 130, y: 420 };

const DEFS: BtnDef[] = [
  { action: 'attack', x: 866, y: 442, r: 56, label: 'A', corner: BR },
  { action: 'jump', x: 748, y: 488, r: 42, label: 'B', corner: BR },
  { action: 'pickup', x: 762, y: 378, r: 34, label: '줍기', corner: BR },
  { action: 'special', x: 886, y: 316, r: 38, label: 'SP', corner: BR },
  { action: 'pause', x: 926, y: 34, r: 22, label: 'II', corner: TR },
];

/** 기준 모서리에서 k배로 늘리거나 줄인 자리 */
function scaled(c: Corner, x: number, y: number, k: number): { x: number; y: number } {
  return { x: c.x + (x - c.x) * k, y: c.y + (y - c.y) * k };
}

export class TouchPad {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly c: Controls;
  private stickId = -1;
  /** 단추 배율 (0.85 / 1 / 1.2) */
  private k = 1;
  private r = R;
  private home = { ...HOME };
  private base = { ...HOME };
  private knob = { ...HOME };
  private readonly btns: Btn[];
  private readonly owners = new Map<number, Btn>();

  constructor(scene: Phaser.Scene, c: Controls) {
    this.c = c;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(3000);
    this.btns = DEFS.map((d) => ({
      def: d,
      x: d.x,
      y: d.y,
      r: d.r,
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
    this.layout(btnScale());
    const offSize = onBtnSize((k) => this.layout(k));
    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offSize();
      scene.input.off('pointerdown', this.onDown, this);
      scene.input.off('pointermove', this.onMove, this);
      scene.input.off('pointerup', this.onUp, this);
      scene.input.off('pointerupoutside', this.onUp, this);
    });
  }

  /** 단추 크기 배율을 적용한다 (자리·반지름·글자·조이스틱) */
  private layout(k: number): void {
    this.k = k;
    for (const b of this.btns) {
      const d = b.def;
      const p = scaled(d.corner, d.x, d.y, k);
      b.x = p.x;
      b.y = p.y;
      b.r = d.r * k;
      b.text.setPosition(b.x, b.y).setFontSize(Math.round((d.r > 40 ? 26 : 15) * k));
    }
    this.r = R * k;
    this.home = scaled(BL, HOME.x, HOME.y, k);
    if (this.stickId < 0) {
      this.base = { ...this.home };
      this.knob = { ...this.home };
    }
  }

  private onDown(p: Phaser.Input.Pointer): void {
    for (const b of this.btns) {
      if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= (b.r * 1.25) ** 2) {
        b.down = true;
        this.owners.set(p.id, b);
        this.c.pressTouch(b.def.action);
        return;
      }
    }
    if (p.x < GAME_W * 0.5 && this.stickId < 0) {
      this.stickId = p.id;
      // 조이스틱이 화면 밖으로 나가지 않게 (보통 크기에서 왼쪽 80px·아래 70px 여유 = 반지름 + 18 / 반지름 + 8)
      this.base = {
        x: Phaser.Math.Clamp(p.x, this.r + 18, 400),
        y: Phaser.Math.Clamp(p.y, 170, GAME_H - this.r - 8),
      };
      this.updateStick(p.x, p.y);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) this.updateStick(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.stickId) {
      this.stickId = -1;
      this.base = { ...this.home };
      this.knob = { ...this.home };
      this.c.setTouchMove(0, 0, false);
    }
    const b = this.owners.get(p.id);
    if (b) {
      b.down = false;
      this.owners.delete(p.id);
    }
  }

  private updateStick(x: number, y: number): void {
    const r = this.r;
    const dx = x - this.base.x;
    const dy = y - this.base.y;
    const d = Math.hypot(dx, dy);
    const k = d > r ? r / d : 1;
    this.knob = { x: this.base.x + dx * k, y: this.base.y + dy * k };
    const nx = (dx * k) / r;
    const ny = (dy * k) / r;
    // 키보드와 같은 8방향으로 맞춘다
    const qx = Math.abs(nx) > 0.38 ? Math.sign(nx) : 0;
    const qy = Math.abs(ny) > 0.38 ? Math.sign(ny) : 0;
    const run = d > r * 1.15 && Math.abs(dx) > Math.abs(dy);
    this.c.setTouchMove(qx, qy, run);
  }

  /** pickLabel: 줍기 버튼에 따로 쓸 이름 (경비원 앞 "인사", 대출기 앞 "대여").
   *  spInfinite: 필살기 무한 (결정 61 이스터 에그) — SP 단추에 "∞" */
  draw(spReady: boolean, holding: boolean, pickLabel: string | null = null, spInfinite = false): void {
    const g = this.g;
    g.clear();
    g.lineStyle(3, 0xffffff, 0.35);
    g.strokeCircle(this.base.x, this.base.y, this.r);
    g.fillStyle(0xffffff, this.stickId >= 0 ? 0.5 : 0.25);
    g.fillCircle(this.knob.x, this.knob.y, KNOB_R * this.k);
    for (const b of this.btns) {
      let color = 0xffffff;
      let alpha = b.down ? 0.5 : 0.22;
      if (b.def.action === 'special') {
        color = spInfinite ? 0xc084fc : spReady ? 0xf5c542 : 0x888888;
        alpha = spReady ? 0.7 : 0.18;
        b.text.setText(spInfinite ? 'SP∞' : 'SP');
      }
      if (b.def.action === 'pickup') {
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

  /** 단추 하나의 지금 자리·반지름 (시험·다른 단추 배치용) */
  btnAt(action: Action): { x: number; y: number; r: number } | null {
    const b = this.btns.find((x) => x.def.action === action);
    return b ? { x: b.x, y: b.y, r: b.r } : null;
  }
}
