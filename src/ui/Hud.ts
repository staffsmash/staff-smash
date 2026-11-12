import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import type { Player } from '../entities/Player';

export interface HudInfo {
  zone: number;
  zones: number;
  combo: number;
  debug: boolean;
  fps: number;
  touch: boolean;
}

export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly livesT: Phaser.GameObjects.Text;
  private readonly zoneT: Phaser.GameObjects.Text;
  private readonly comboT: Phaser.GameObjects.Text;
  private readonly spT: Phaser.GameObjects.Text;
  private readonly fpsT: Phaser.GameObjects.Text;
  private lastCombo = 0;

  constructor(scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.Text>(t: T): T => {
      t.setScrollFactor(0).setDepth(2001);
      return t;
    };
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(2000);
    const small = { fontFamily: FONT, fontSize: '13px', color: '#ffffff' };
    fix(scene.add.text(22, 15, '주무관 · 교직원 모드', small));
    this.livesT = fix(scene.add.text(244, 15, '', small).setOrigin(1, 0));
    this.spT = fix(scene.add.text(206, 47, '', { ...small, fontSize: '12px', color: '#f5c542' }));
    this.zoneT = fix(
      scene.add
        .text(GAME_W / 2, 14, '', { ...small, fontSize: '15px', fontStyle: 'bold', stroke: '#111318', strokeThickness: 4 })
        .setOrigin(0.5, 0),
    );
    this.comboT = fix(
      scene.add
        .text(GAME_W - 70, 74, '', {
          fontFamily: FONT,
          fontSize: '26px',
          fontStyle: 'bold',
          color: '#ffe066',
          stroke: '#111318',
          strokeThickness: 5,
        })
        .setOrigin(1, 0.5),
    );
    this.fpsT = fix(scene.add.text(10, GAME_H - 22, '', { ...small, fontSize: '12px', color: '#00ffff' }));
  }

  update(p: Player, info: HudInfo): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0b0d12, 0.55);
    g.fillRoundedRect(12, 10, 244, 54, 6);

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
    this.spT.setText(spReady ? (info.touch ? 'SP 준비!' : 'SP 준비! (I)') : 'SP');

    this.livesT.setText(`목숨 ×${p.lives}`);
    this.zoneT.setText(`구역 ${Math.min(info.zone + 1, info.zones)} / ${info.zones}`);

    if (info.combo >= 2) {
      this.comboT.setText(`${info.combo} 연속 처리!`).setVisible(true);
      if (info.combo !== this.lastCombo) this.comboT.setScale(1.35);
      this.comboT.setScale(Math.max(1, this.comboT.scale - 0.04));
    } else {
      this.comboT.setVisible(false);
    }
    this.lastCombo = info.combo;

    this.fpsT.setVisible(info.debug).setText(`FPS ${info.fps.toFixed(0)} · 판정 표시 켜짐 (\` 키로 끄기)`);
  }
}
