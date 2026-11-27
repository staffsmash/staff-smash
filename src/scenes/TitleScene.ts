import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { Controls } from '../input/Controls';
import type { GameMode } from '../records';
import { fadeTo, makeButton } from '../ui/button';
import { openSettings, type SettingsPanel } from '../ui/settingsPanel';
import { HUFS_KEYS, HUFS_NAVY, hufsImage, loadHufsAssets } from '../hufs';
import { goAppHome, titleLeft, titleShown } from '../pwa';

// 타이틀 (PRD 결정 60 3절 — app.html·1인칭 타이틀과 같은 모양):
//   로고 배지 / Three Party Problem / [출근하기] [등교하기] / 작은 줄 "기록판 · 설정 · 처음으로"
// 처음으로 = 두 게임 고르는 첫 화면(app.html). 브라우저에서도 간다.
// 키보드: Enter·1 = 교직원 모드(출근하기), 2 = 학생 모드(등교하기), B = 기록판. 설정 창은 Esc로 닫는다.

/** 로고 배지 (2026-11-25, public/logo/badge.png — assets/icons/make_icons.py가 굽는다) */
const LOGO_KEY = 'logo-badge';

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private started = false;
  private settings: SettingsPanel | null = null;

  constructor() {
    super('title');
  }

  preload(): void {
    loadHufsAssets(this);
    if (!this.textures.exists(LOGO_KEY)) this.load.image(LOGO_KEY, 'logo/badge.png');
  }

  create(): void {
    this.started = false;
    this.settings = null;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(200, 0, 0, 0);
    // 휴대폰 브라우저 설치 안내(src/pwa.ts)는 타이틀에서만
    titleShown();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, titleLeft);
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, HUFS_NAVY);
    this.add.rectangle(cx, 488, GAME_W, 104, 0x163a63);
    hufsImage(this, HUFS_KEYS.line, cx, 488, { h: 300, alpha: 0.07, tint: 0xffffff });

    // 로고 배지: 제목 위 (학교 약명 시그니처는 뺐다 — 사용자 2026-11-25)
    if (this.textures.exists(LOGO_KEY)) this.add.image(cx, 116, LOGO_KEY).setDisplaySize(176, 176);
    this.add
      .text(cx, 250, 'Three Party Problem', {
        fontFamily: FONT,
        fontSize: '54px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#2f6fd1',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    makeButton(this, cx - 140, 338, 256, 60, touch ? '출근하기' : '출근하기 (Enter·1)', () => this.start('staff'), 0x2f8f4e);
    makeButton(this, cx + 140, 338, 256, 60, touch ? '등교하기' : '등교하기 (2)', () => this.start('student'), 0xb4532a);

    // 작은 줄: 기록판 · 설정 · 처음으로
    this.linkRow(cx, 404, [
      { label: '기록판', onClick: () => this.go('board') },
      { label: '설정', onClick: () => this.openSettings() },
      { label: '처음으로', onClick: () => this.home() },
    ]);
  }

  /** 가운데 맞춘 작은 글자 링크 한 줄 ("기록판 · 설정 · 처음으로"). 손가락으로도 누르기 쉽게 누르는 곳은 글자보다 넓다 */
  private linkRow(cx: number, y: number, items: { label: string; onClick: () => void }[]): void {
    const style = { fontFamily: FONT, fontSize: '18px', color: '#c9d3e6' };
    const sep = ' · ';
    const texts = items.map((it) => this.add.text(0, y, it.label, { ...style, fontStyle: 'bold' }).setOrigin(0, 0.5));
    const dots = items.slice(1).map(() => this.add.text(0, y, sep, { ...style, color: '#6f86a8' }).setOrigin(0, 0.5));
    const sepW = dots[0]?.width ?? 0;
    const total = texts.reduce((w, t) => w + t.width, 0) + sepW * dots.length;
    let x = cx - total / 2;
    texts.forEach((t, i) => {
      t.setX(x);
      x += t.width;
      if (i < dots.length) {
        dots[i].setX(x);
        x += sepW;
      }
      const padX = 14;
      const padY = 14;
      t.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-padX, -padY, t.width + padX * 2, t.height + padY * 2),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      t.on('pointerover', () => t.setColor('#ffffff'));
      t.on('pointerout', () => t.setColor('#c9d3e6'));
      t.on('pointerup', () => items[i].onClick());
    });
  }

  private openSettings(): void {
    if (this.started || (this.settings && !this.settings.closed)) return;
    // 휴대폰 설치 안내 띠가 창 아래(닫기 단추)를 가리지 않게 창이 열린 동안 숨긴다
    titleLeft();
    this.settings = openSettings(this, () => {
      if (!this.started) titleShown();
    });
  }

  private home(): void {
    if (this.started) return;
    this.started = true;
    goAppHome();
  }

  update(): void {
    const c = this.controls;
    if (this.settings && !this.settings.closed) {
      // 설정 창이 열려 있는 동안은 Esc만 받는다 (Enter 등으로 게임이 시작되지 않게)
      if (c.consume('pause')) this.settings.close();
      c.consume('confirm');
      c.consume('pick1');
      c.consume('pick2');
      c.consume('board');
      return;
    }
    if (c.consume('confirm') || c.consume('pick1')) this.start('staff');
    else if (c.consume('pick2')) this.start('student');
    else if (c.consume('board')) this.go('board');
  }

  private start(mode: GameMode): void {
    this.go('select', { mode });
  }

  private go(key: 'select' | 'board', data?: object): void {
    if (this.started || (this.settings && !this.settings.closed)) return;
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
