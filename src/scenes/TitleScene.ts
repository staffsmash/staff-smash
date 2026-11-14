import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { STUDENT_HEROES } from '../data/students';
import { Controls } from '../input/Controls';
import { neutralPose } from '../entities/Rig';
import type { Rig } from '../entities/Rig';
import { createStaffRig, createStudentHeroRig } from '../entities/rigs';
import type { GameMode } from '../records';
import { fadeTo, makeButton } from '../ui/button';
import { HUFS_KEYS, HUFS_NAVY, hufsImage, loadHufsAssets } from '../hufs';

// 타이틀: 교직원 모드(출근하기)와 학생 모드(등교하기) 중 하나를 고른다.
// 키보드: Enter·1 = 교직원 모드, 2 = 학생 모드, B = 기록판.

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private started = false;
  private rigs: Rig[] = [];

  constructor() {
    super('title');
  }

  preload(): void {
    loadHufsAssets(this);
  }

  create(): void {
    this.started = false;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(200, 0, 0, 0);
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, HUFS_NAVY);
    this.add.rectangle(cx, 470, GAME_W, 140, 0x163a63);
    hufsImage(this, HUFS_KEYS.line, cx, 470, { h: 300, alpha: 0.07, tint: 0xffffff });

    this.add
      .text(cx, 84, 'STAFF SMASH', {
        fontFamily: FONT,
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2f6fd1',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    // 학교 약명 시그니처 (심벌 + HUFS, 어두운 바탕이라 흰색)
    hufsImage(this, HUFS_KEYS.line, cx - 112, 152, { h: 60, tint: 0xffffff });
    const type = hufsImage(this, HUFS_KEYS.type, cx - 9, 152, { h: 40, tint: 0xffffff });
    if (!type) {
      this.add.text(cx - 9, 152, 'HUFS', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    }
    this.add.rectangle(cx + 104, 152, 70, 28, 0xd0202f).setAngle(-6);
    this.add
      .text(cx + 104, 152, '비공식', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setAngle(-6);
    this.add
      .text(cx, 198, '오후 4시 52분, 마감 8분 전 · 교직원은 정시 퇴근을, 학생은 서류 제출 승인을 노린다', {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#c9d3e6',
      })
      .setOrigin(0.5);

    // 왼쪽: 교직원(김국제), 오른쪽: 학생(김러샤)이 서로 마주 본다
    const staff = createStaffRig(this);
    staff.root.setPosition(110, 450).setScale(1.7);
    const student = createStudentHeroRig(this, STUDENT_HEROES[0].look);
    student.root.setPosition(850, 450).setScale(1.7);
    student.root.scaleX = -1.7;
    this.rigs = [staff, student];

    const help = touch
      ? '왼쪽 화면 드래그: 이동   A: 처리·공격   B: 점프   줍기: 무기 줍기·던지기   SP: 필살기'
      : '이동 방향키·WASD   대시 같은 방향 두 번   처리·공격 J   점프 K   줍기·던지기 L   필살기 I';
    this.add.text(cx, 238, help, { fontFamily: FONT, fontSize: '14px', color: '#e6ebf3' }).setOrigin(0.5);

    // 모드 고르기: 버튼 아래에 한 줄 소개
    const modeX = { staff: cx - 135, student: cx + 135 };
    makeButton(this, modeX.staff, 300, 250, 56, touch ? '출근하기' : '출근하기 (Enter·1)', () => this.start('staff'), 0x2f8f4e);
    makeButton(this, modeX.student, 300, 250, 56, touch ? '등교하기' : '등교하기 (2)', () => this.start('student'), 0xb4532a);
    const caption = (x: number, title: string, sub: string) => {
      this.add.text(x, 342, title, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      this.add.text(x, 363, sub, { fontFamily: FONT, fontSize: '13px', color: '#c9d3e6' }).setOrigin(0.5);
    };
    caption(modeX.staff, '교직원 모드', '민원 처리하고 정시 퇴근');
    caption(modeX.student, '학생 모드', '반려된 서류 승인받기');
    makeButton(this, cx, 418, 220, 42, touch ? '기록판' : '기록판 (B)', () => this.go('board'), 0x2f6fd1);

    this.add
      .text(cx, GAME_H - 34, '비공식 게임입니다.', {
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
    const c = this.controls;
    if (c.consume('confirm') || c.consume('pick1')) this.start('staff');
    else if (c.consume('pick2')) this.start('student');
    else if (c.consume('board')) this.go('board');
  }

  private start(mode: GameMode): void {
    this.go('select', { mode });
  }

  private go(key: 'select' | 'board', data?: object): void {
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
    fadeTo(this, key, data);
  }
}
