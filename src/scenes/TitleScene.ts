import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { Controls } from '../input/Controls';
import { neutralPose } from '../entities/Rig';
import type { Rig } from '../entities/Rig';
import { createMailRig, createStaffRig } from '../entities/rigs';

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
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.rectangle(cx, 470, GAME_W, 140, 0x2a3346);

    this.add
      .text(cx, 92, 'STAFF SMASH', {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2f6fd1',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 158, ': HUFS', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f5c542' })
      .setOrigin(0.5);
    this.add.rectangle(cx + 150, 158, 70, 28, 0xd0202f).setAngle(-6);
    this.add
      .text(cx + 150, 158, '비공식', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setAngle(-6);
    this.add
      .text(cx, 206, '교직원 모드 · M1 시험판 (1스테이지 본관 사무실)', {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#c9d3e6',
      })
      .setOrigin(0.5);

    const staff = createStaffRig(this);
    staff.root.setPosition(220, 450).setScale(1.7);
    const mail = createMailRig(this);
    mail.root.setPosition(740, 450).setScale(1.7);
    mail.root.scaleX = -1.7;
    this.rigs = [staff, mail];

    const help = touch
      ? '왼쪽 화면 드래그: 이동 (끝까지 밀면 달리기)\nA: 처리(공격)   B: 점프   줍기: 무기 줍기·던지기   SP: 필살기'
      : '이동: 방향키 / WASD   대시: 같은 방향 두 번\n처리(공격): J   점프: K   줍기·던지기: L   필살기: I   일시정지: Esc';
    this.add
      .text(cx, 298, help, { fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5);

    const prompt = this.add
      .text(cx, 380, touch ? '화면을 탭해서 출근하기' : 'Enter를 눌러 출근하기', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#f5c542',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, yoyo: true, repeat: -1, duration: 600 });

    this.add
      .text(cx, GAME_H - 22, '비공식 게임입니다. 등장 인물과 부서는 가상이며 실제와 관계없습니다.', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#8b95a8',
      })
      .setOrigin(0.5);

    this.input.once('pointerup', () => this.start(touch));
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
    if (this.controls.consume('confirm')) this.start(false);
  }

  private start(fromTouch: boolean): void {
    if (this.started) return;
    this.started = true;
    if (fromTouch) {
      try {
        if (!this.scale.isFullscreen) this.scale.startFullscreen();
        const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
        o.lock?.('landscape').catch(() => undefined);
      } catch {
        // 전체 화면을 지원하지 않는 브라우저(iPhone 등)는 그대로 진행한다
      }
    }
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('stage'));
  }
}
