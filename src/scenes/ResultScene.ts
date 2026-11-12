import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import { Controls } from '../input/Controls';
import { gradeStage, type StageStats } from '../grade';

// 스테이지 결과: 근무평정표 (S~D)와 현재 시각.

const GRADE_COLOR: Record<string, string> = { S: '#d0202f', A: '#d0202f', B: '#c2410c', C: '#475569', D: '#475569' };

export class ResultScene extends Phaser.Scene {
  private controls!: Controls;
  private leaving = false;

  constructor() {
    super('result');
  }

  create(stats: StageStats): void {
    this.leaving = false;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    const touch = this.sys.game.device.input.touch;
    const { rows, total, grade } = gradeStage(stats);
    const cx = GAME_W / 2;

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    // 결재 서류 모양 종이
    this.add.rectangle(cx + 4, 274, 640, 452, 0x000000, 0.3);
    this.add.rectangle(cx, 270, 640, 452, 0xfbf8f0).setStrokeStyle(2, 0x2b2b2b);
    const ink = '#1d1d22';
    this.add
      .text(cx, 74, '근 무 평 정 표', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: ink })
      .setOrigin(0.5);
    this.add
      .text(cx, 110, `${stats.stageTitle}  ·  주무관`, { fontFamily: FONT, fontSize: '15px', color: '#4b5563' })
      .setOrigin(0.5);

    // 표
    const x0 = cx - 280;
    const colX = [x0, x0 + 230, x0 + 380];
    const g = this.add.graphics();
    g.lineStyle(1.5, 0x2b2b2b, 1);
    const top = 136;
    const rowH = 38;
    for (let i = 0; i <= rows.length + 2; i++) g.lineBetween(x0 - 10, top + i * rowH, x0 + 470, top + i * rowH);
    for (const x of [x0 - 10, colX[1] - 10, colX[2] - 10, x0 + 470]) g.lineBetween(x, top, x, top + (rows.length + 2) * rowH);
    const cell = (x: number, row: number, text: string, bold = false) =>
      this.add
        .text(x, top + row * rowH + rowH / 2, text, {
          fontFamily: FONT,
          fontSize: '17px',
          fontStyle: bold ? 'bold' : 'normal',
          color: ink,
        })
        .setOrigin(0, 0.5);
    cell(colX[0], 0, '항목', true);
    cell(colX[1], 0, '기록', true);
    cell(colX[2], 0, '점수', true);
    rows.forEach((r, i) => {
      cell(colX[0], i + 1, r.label);
      cell(colX[1], i + 1, r.value);
      cell(colX[2], i + 1, `${r.points} / ${r.max}`);
    });
    cell(colX[0], rows.length + 1, '합계', true);
    cell(colX[2], rows.length + 1, `${total} / 100`, true);

    // 평정 도장
    const stamp = this.add.container(cx + 236, 220);
    const sg = this.add.graphics();
    const color = Phaser.Display.Color.HexStringToColor(GRADE_COLOR[grade]).color;
    sg.lineStyle(5, color, 1);
    sg.strokeCircle(0, 0, 56);
    sg.lineStyle(2, color, 1);
    sg.strokeCircle(0, 0, 46);
    stamp.add(sg);
    stamp.add(
      this.add.text(0, -2, grade, { fontFamily: FONT, fontSize: '58px', fontStyle: 'bold', color: GRADE_COLOR[grade] }).setOrigin(0.5),
    );
    stamp.add(this.add.text(0, 34, '평정', { fontFamily: FONT, fontSize: '13px', color: GRADE_COLOR[grade] }).setOrigin(0.5));
    stamp.setRotation(-0.18).setScale(2.4).setAlpha(0);
    this.tweens.add({
      targets: stamp,
      scale: 1,
      alpha: 0.92,
      delay: 500,
      duration: 180,
      ease: 'Quad.In',
      onComplete: () => this.cameras.main.shake(120, 0.008),
    });

    // 시각
    const left = Math.ceil(OFF_HOURS - stats.clockMin);
    const clockLine =
      left > 0
        ? `현재 시각 ${clockText(stats.clockMin)}  ·  퇴근까지 ${left}분`
        : `현재 시각 ${clockText(stats.clockMin)}  ·  ${Math.floor(stats.clockMin - OFF_HOURS)}분 초과근무`;
    this.add
      .text(cx, 340, clockLine, { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: left > 0 ? '#1d4ed8' : '#b91c1c' })
      .setOrigin(0.5);
    this.add
      .text(cx, 370, `남은 목숨 ${stats.lives}  ·  2·3스테이지는 다음 업데이트(M2)에서 이어집니다`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#4b5563',
      })
      .setOrigin(0.5);

    // 버튼
    this.button(cx - 120, 438, touch ? '다시 하기' : '다시 하기 (Enter)', () => this.go('stage'));
    this.button(cx + 120, 438, touch ? '타이틀로' : '타이틀로 (T)', () => this.go('title'));
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add
      .rectangle(x, y, 200, 46, 0x2f6fd1)
      .setStrokeStyle(2, 0x1d1d22)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3b82f6));
    bg.on('pointerout', () => bg.setFillStyle(0x2f6fd1));
    bg.on('pointerup', onClick);
  }

  private go(key: 'stage' | 'title'): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(key));
  }

  update(): void {
    if (this.controls.consume('confirm') || this.controls.consume('restart')) this.go('stage');
    else if (this.controls.consume('title')) this.go('title');
  }
}
