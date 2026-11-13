import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import type { Player } from '../entities/Player';

export interface BossInfo {
  name: string;
  type: string;
  hp: number;
  maxHp: number;
  /** 체력바 오른쪽 위에 보일 글 (안내문 ■■□, 마감까지 0:42 등) */
  extra: string;
}

export interface HudInfo {
  stageTitle: string;
  /** 지금 구역 이름 (본관 민원 창구 등) */
  zoneLabel: string;
  zone: number;
  zones: number;
  combo: number;
  debug: boolean;
  fps: number;
  clockMin: number;
  /** 화면 위 가운데 노란 안내 (결재 대기 등) */
  notice: string;
  boss: BossInfo | null;
}

const HELP_KEY = 'staffsmash.help';
const BOSS_X = 180;
const BOSS_W = 420;

export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly livesT: Phaser.GameObjects.Text;
  private readonly spT: Phaser.GameObjects.Text;
  private readonly weaponT: Phaser.GameObjects.Text;
  private readonly clockT: Phaser.GameObjects.Text;
  private readonly zoneT: Phaser.GameObjects.Text;
  private readonly comboT: Phaser.GameObjects.Text;
  private readonly fpsT: Phaser.GameObjects.Text;
  private readonly bossT: Phaser.GameObjects.Text;
  private readonly noticeT: Phaser.GameObjects.Text;
  private readonly alertT: Phaser.GameObjects.Text;
  private readonly touch: boolean;
  private readonly helpObjs: Phaser.GameObjects.Text[] = [];
  private helpBg: Phaser.GameObjects.Rectangle | null = null;
  private helpHint: Phaser.GameObjects.Text | null = null;
  private helpVisible = true;
  private lastCombo = 0;

  constructor(scene: Phaser.Scene, touch: boolean, heroName = '주무관') {
    this.touch = touch;
    const fix = <T extends Phaser.GameObjects.Text>(t: T): T => {
      t.setScrollFactor(0).setDepth(2001);
      return t;
    };
    const small = { fontFamily: FONT, fontSize: '13px', color: '#ffffff' };
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(2000);
    fix(scene.add.text(22, 15, `${heroName} · 교직원 모드`, small));
    this.alertT = fix(
      scene.add
        .text(GAME_W / 2, 98, '', {
          ...small,
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#111318',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 0),
    );
    this.livesT = fix(scene.add.text(244, 15, '', small).setOrigin(1, 0));
    this.spT = fix(scene.add.text(206, 47, '', { ...small, fontSize: '12px', color: '#f5c542' }));
    this.weaponT = fix(scene.add.text(22, 62, '', { ...small, fontSize: '12px', color: '#9fd3ff' }));
    this.clockT = fix(
      scene.add
        .text(GAME_W / 2, 10, '', { ...small, fontSize: '17px', fontStyle: 'bold', stroke: '#111318', strokeThickness: 4 })
        .setOrigin(0.5, 0),
    );
    this.zoneT = fix(
      scene.add
        .text(GAME_W / 2, 34, '', { ...small, fontSize: '12px', color: '#dfe6f2', stroke: '#111318', strokeThickness: 4 })
        .setOrigin(0.5, 0),
    );
    this.comboT = fix(
      scene.add
        .text(GAME_W - 70, 84, '', {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#111318',
          strokeThickness: 5,
        })
        .setOrigin(1, 0.5),
    );
    this.bossT = fix(
      scene.add
        .text(BOSS_X, GAME_H - 34, '', { ...small, fontStyle: 'bold', stroke: '#111318', strokeThickness: 4 })
        .setOrigin(0, 1),
    );
    this.noticeT = fix(
      scene.add
        .text(BOSS_X + BOSS_W, GAME_H - 34, '', { ...small, color: '#ffe066', stroke: '#111318', strokeThickness: 4 })
        .setOrigin(1, 1),
    );
    this.fpsT = fix(scene.add.text(10, 92, '', { ...small, fontSize: '12px', color: '#00ffff' }));
    if (!touch) this.buildHelp(scene);
  }

  /** 오른쪽 아래 조작법 (PC). H로 숨기거나 다시 연다. */
  private buildHelp(scene: Phaser.Scene): void {
    try {
      this.helpVisible = localStorage.getItem(HELP_KEY) !== 'off';
    } catch {
      // 저장소를 쓸 수 없으면 기본값(보이기)
    }
    const lines = [
      '이동  방향키·WASD      대시  같은 방향 두 번',
      '처리  J      점프  K      줍기·던지기  L',
      '필살기  I      일시정지  Esc      숨기기  H',
    ];
    const w = 292;
    const h = 24 + lines.length * 17;
    const x0 = GAME_W - 12 - w;
    const y0 = GAME_H - 12 - h;
    this.helpBg = scene.add
      .rectangle(x0, y0, w, h, 0x0b0d12, 0.62)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, 0.25)
      .setScrollFactor(0)
      .setDepth(2001);
    const title = scene.add.text(x0 + 10, y0 + 5, '조작법', {
      fontFamily: FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f5c542',
    });
    this.helpObjs.push(title);
    lines.forEach((line, i) => {
      this.helpObjs.push(
        scene.add.text(x0 + 10, y0 + 22 + i * 17, line, { fontFamily: FONT, fontSize: '12px', color: '#e6ebf3' }),
      );
    });
    for (const t of this.helpObjs) t.setScrollFactor(0).setDepth(2002);
    this.helpHint = scene.add
      .text(GAME_W - 12, GAME_H - 10, 'H: 조작법 보기', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#c9d3e6',
        stroke: '#111318',
        strokeThickness: 3,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(2002);
    this.applyHelp();
  }

  toggleHelp(): void {
    if (this.touch) return;
    this.helpVisible = !this.helpVisible;
    try {
      localStorage.setItem(HELP_KEY, this.helpVisible ? 'on' : 'off');
    } catch {
      // 저장하지 못해도 이번 판에는 적용된다
    }
    this.applyHelp();
  }

  private applyHelp(): void {
    this.helpBg?.setVisible(this.helpVisible);
    for (const t of this.helpObjs) t.setVisible(this.helpVisible);
    this.helpHint?.setVisible(!this.helpVisible);
  }

  update(p: Player, info: HudInfo): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0b0d12, 0.55);
    g.fillRoundedRect(12, 10, 244, 72, 6);

    // 체력
    const hpRatio = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    g.fillStyle(0x3a1f24, 1);
    g.fillRect(22, 33, 222, 12);
    g.fillStyle(hpRatio > 0.5 ? 0x5bd16b : hpRatio > 0.25 ? 0xf5c542 : 0xe5484d, 1);
    g.fillRect(22, 33, 222 * hpRatio, 12);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeRect(22, 33, 222, 12);

    // 필살기 게이지
    const spReady = p.sp >= 100;
    g.fillStyle(0x2b2b3a, 1);
    g.fillRect(22, 50, 178, 8);
    const blink = spReady && Math.floor(performance.now() / 150) % 2 === 0;
    g.fillStyle(blink ? 0xffffff : 0xf5c542, 1);
    g.fillRect(22, 50, (178 * Math.min(p.sp, 100)) / 100, 8);
    this.spT.setText(spReady ? (this.touch ? 'SP 준비!' : 'SP 준비! (I)') : 'SP');

    // 무기
    const w = p.weapon;
    if (w && w.id === 'bomb') {
      this.weaponT.setText(`던지세요!  ${w.def.name} ${Math.max(0, w.fuse).toFixed(1)}초`).setColor('#ff8a8a');
    } else if (w && w.def.durability === 0) {
      this.weaponT.setText(`무기  ${w.def.name}${w.inFlight ? ' (날아가는 중)' : ' (무한)'}`).setColor('#9fd3ff');
    } else if (w) {
      this.weaponT.setText(`무기  ${w.def.name}`).setColor('#9fd3ff');
      const r = Math.max(0, w.dur) / w.def.durability;
      g.fillStyle(0x2b2b3a, 1);
      g.fillRect(150, 66, 94, 6);
      g.fillStyle(0x9fd3ff, 1);
      g.fillRect(150, 66, 94 * r, 6);
    } else {
      this.weaponT.setText(p.coffeeT > 0 ? '무기  맨손 · 아메리카노 효과 중' : '무기  맨손 (도장·결재판)').setColor('#9fd3ff');
    }
    this.alertT.setText(info.notice).setVisible(info.notice !== '');

    this.livesT.setText(`목숨 ×${p.lives}`);

    // 시계: 16:52에 시작, 17:00 퇴근
    const left = Math.ceil(OFF_HOURS - info.clockMin);
    if (left > 0) {
      this.clockT.setText(`${clockText(info.clockMin)}  ·  퇴근까지 ${left}분`).setColor('#ffffff');
    } else {
      const over = Math.floor(info.clockMin - OFF_HOURS);
      this.clockT.setText(`${clockText(info.clockMin)}  ·  초과근무 ${over}분`).setColor('#ff8a8a');
    }
    const stageNo = info.stageTitle.split(' · ')[0];
    this.zoneT.setText(`${stageNo}  ·  ${info.zoneLabel}  ·  ${Math.min(info.zone + 1, info.zones)}/${info.zones}`);

    if (info.combo >= 2) {
      this.comboT.setText(`${info.combo} 연속 처리!`).setVisible(true);
      if (info.combo !== this.lastCombo) this.comboT.setScale(1.35);
      this.comboT.setScale(Math.max(1, this.comboT.scale - 0.04));
    } else {
      this.comboT.setVisible(false);
    }
    this.lastCombo = info.combo;

    // 보스 체력바 (화면 아래)
    const b = info.boss;
    this.bossT.setVisible(!!b);
    this.noticeT.setVisible(!!b);
    if (b) {
      const y = GAME_H - 30;
      g.fillStyle(0x0b0d12, 0.7);
      g.fillRect(BOSS_X - 4, y - 4, BOSS_W + 8, 18);
      g.fillStyle(0x3a1f24, 1);
      g.fillRect(BOSS_X, y, BOSS_W, 10);
      g.fillStyle(0xe5484d, 1);
      g.fillRect(BOSS_X, y, (BOSS_W * Math.max(0, b.hp)) / b.maxHp, 10);
      this.bossT.setText(`${b.name} · ${b.type}`);
      this.noticeT.setText(b.extra);
    }

    this.fpsT.setVisible(info.debug).setText(`FPS ${info.fps.toFixed(0)} · 판정 표시 (\` 키로 끄기)`);
  }
}
