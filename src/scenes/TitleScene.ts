import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { Controls } from '../input/Controls';
import { neutralPose } from '../entities/Rig';
import type { Rig } from '../entities/Rig';
import { createMailRig, createStaffRig } from '../entities/rigs';
import { fadeTo, makeButton } from '../ui/button';

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private started = false;
  private rigs: Rig[] = [];

  constructor() {
    super('title');
  }

  create(): void {
    this.started = false;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(200, 0, 0, 0);
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.rectangle(cx, 470, GAME_W, 140, 0x2a3346);

    this.add
      .text(cx, 86, 'STAFF SMASH', {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2f6fd1',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add.text(cx, 152, ': HUFS', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f5c542' }).setOrigin(0.5);
    this.add.rectangle(cx + 150, 152, 70, 28, 0xd0202f).setAngle(-6);
    this.add
      .text(cx + 150, 152, '비공식', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setAngle(-6);
    this.add
      .text(cx, 198, '교직원 모드 · 오후 4시 52분, 퇴근 8분 전', { fontFamily: FONT, fontSize: '17px', color: '#c9d3e6' })
      .setOrigin(0.5);

    const staff = createStaffRig(this);
    staff.root.setPosition(170, 450).setScale(1.7);
    const mail = createMailRig(this);
    mail.root.setPosition(790, 450).setScale(1.7);
    mail.root.scaleX = -1.7;
    this.rigs = [staff, mail];

    const help = touch
      ? '왼쪽 화면 드래그: 이동   A: 처리   B: 점프   줍기: 무기 줍기·던지기   SP: 필살기'
      : '이동 방향키·WASD   대시 같은 방향 두 번   처리 J   점프 K   줍기·던지기 L   필살기 I';
    this.add.text(cx, 256, help, { fontFamily: FONT, fontSize: '14px', color: '#e6ebf3' }).setOrigin(0.5);

    makeButton(this, cx, 330, 260, 54, touch ? '출근하기' : '출근하기 (Enter)', () => this.go('select'), 0x2f8f4e);
    makeButton(this, cx, 396, 260, 46, touch ? '기록판' : '기록판 (B)', () => this.go('board'), 0x2f6fd1);

    this.add
      .text(cx, GAME_H - 34, '비공식 게임입니다. 프레지던트 캉을 제외한 인물과 부서는 모두 가상입니다.', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#8b95a8',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, GAME_H - 14, '게임이 끝나면 결과(스테이지·시각)가 익명으로 기록됩니다. 닉네임은 원할 때만 남깁니다.', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#6b7488',
      })
      .setOrigin(0.5);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const s = Math.sin(this.time.now / 300);
    for (const r of this.rigs) {
      const p = neutralPose();
      p.armF = 0.1 + s * 0.06;
      p.armB = -0.1 - s * 0.06;
      p.bob = s * 1.5;
      r.update(dt, p);
    }
    if (this.controls.consume('confirm')) this.go('select');
    else if (this.controls.consume('board')) this.go('board');
  }

  private go(key: 'select' | 'board'): void {
    if (this.started) return;
    this.started = true;
    if (key === 'select' && this.sys.game.device.input.touch) {
      try {
        if (!this.scale.isFullscreen) this.scale.startFullscreen();
        const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
        o.lock?.('landscape').catch(() => undefined);
      } catch {
        // 전체 화면을 지원하지 않는 브라우저(iPhone 등)는 그대로 진행한다
      }
    }
    fadeTo(this, key);
  }
}
