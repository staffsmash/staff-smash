import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { HEROES } from '../data/heroes';
import { SKILLS } from '../data/skills';
import { Controls } from '../input/Controls';
import { neutralPose, type Rig } from '../entities/Rig';
import { createStaffRig } from '../entities/rigs';
import { newRun } from '../run';
import { fadeTo, makeButton } from '../ui/button';

// 출근 준비: 모드(교직원) · 주인공(가상 행정직원 6명) · 업무 스킬(4종) 고르기.
// 키보드: 방향키로 고르고 Enter. 주인공을 고르면 스킬 칸으로, 스킬을 고르면 출근. Esc로 한 단계 뒤로.

const CARD_W = 164;
const CARD_H = 158;
const COLS = [110, 290, 470];
const ROWS = [176, 346];
const SKILL_X = 760;
const SKILL_Y = [138, 218, 298, 378];

export class SelectScene extends Phaser.Scene {
  private controls!: Controls;
  private hero = 0;
  private skill = 0;
  private focus: 'hero' | 'skill' = 'hero';
  private lastMove = { x: 0, y: 0 };
  private rigs: Rig[] = [];
  private cards: Phaser.GameObjects.Rectangle[] = [];
  private skillBoxes: Phaser.GameObjects.Rectangle[] = [];
  private lineT!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('select');
  }

  create(): void {
    this.leaving = false;
    this.focus = 'hero';
    this.rigs = [];
    this.cards = [];
    this.skillBoxes = [];
    this.lastMove = { x: 0, y: 0 };
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(200, 0, 0, 0);

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.text(30, 22, '출근 준비', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' });
    // 모드 탭
    this.add.rectangle(270, 38, 130, 34, 0x2f6fd1).setStrokeStyle(2, 0xffffff);
    this.add.text(270, 38, '교직원 모드', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.add.rectangle(420, 38, 150, 34, 0x2a3346).setStrokeStyle(1, 0x5b6478);
    this.add.text(420, 38, '학생 모드 (준비 중)', { fontFamily: FONT, fontSize: '13px', color: '#7b8496' }).setOrigin(0.5);

    this.add.text(30, 74, '1. 주인공 (능력은 같고 외형·대사만 달라요)', { fontFamily: FONT, fontSize: '14px', color: '#c9d3e6' });
    HEROES.forEach((h, i) => {
      const cx = COLS[i % 3];
      const cy = ROWS[Math.floor(i / 3)];
      const card = this.add
        .rectangle(cx, cy, CARD_W, CARD_H, 0x2a3346)
        .setStrokeStyle(2, 0x5b6478)
        .setInteractive({ useHandCursor: true });
      card.on('pointerup', () => {
        this.hero = i;
        this.focus = 'skill';
        this.refresh();
      });
      this.cards.push(card);
      this.add.text(cx, cy - CARD_H / 2 + 10, h.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5, 0);
      const rig = createStaffRig(this, h.look);
      rig.root.setPosition(cx, cy + CARD_H / 2 - 12).setScale(0.95);
      this.rigs.push(rig);
    });

    this.add.text(SKILL_X - 160, 74, '2. 필살기 · 업무 스킬', { fontFamily: FONT, fontSize: '14px', color: '#c9d3e6' });
    SKILLS.forEach((s, i) => {
      const y = SKILL_Y[i];
      const box = this.add
        .rectangle(SKILL_X, y, 330, 70, 0x2a3346)
        .setStrokeStyle(2, 0x5b6478)
        .setInteractive({ useHandCursor: true });
      box.on('pointerup', () => {
        this.skill = i;
        this.focus = 'skill';
        this.refresh();
      });
      this.skillBoxes.push(box);
      this.add.text(SKILL_X - 150, y - 24, s.name, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#f5c542' });
      this.add.text(SKILL_X - 150, y + 2, s.desc, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#e6ebf3',
        wordWrap: { width: 300, useAdvancedWrap: true },
      });
    });

    this.lineT = this.add
      .text(290, 470, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', backgroundColor: '#2a3346', padding: { x: 10, y: 6 } })
      .setOrigin(0.5);
    makeButton(this, SKILL_X, 470, 330, 52, '출근하기 (Enter)', () => this.start(), 0x2f8f4e);
    this.add
      .text(GAME_W / 2, GAME_H - 14, '방향키로 고르고 Enter · Esc 뒤로 · 마우스·터치로 눌러도 됩니다', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8b95a8',
      })
      .setOrigin(0.5);
    this.refresh();
  }

  private refresh(): void {
    this.cards.forEach((c, i) => {
      const on = i === this.hero;
      c.setStrokeStyle(on ? 4 : 2, on ? (this.focus === 'hero' ? 0xf5c542 : 0xffffff) : 0x5b6478);
      c.setFillStyle(on ? 0x34405a : 0x2a3346);
    });
    this.skillBoxes.forEach((b, i) => {
      const on = i === this.skill;
      b.setStrokeStyle(on ? 4 : 2, on ? (this.focus === 'skill' ? 0xf5c542 : 0xffffff) : 0x5b6478);
      b.setFillStyle(on ? 0x34405a : 0x2a3346);
    });
    const h = HEROES[this.hero];
    this.lineT.setText(`${h.name}: "${h.line}"`);
  }

  private start(): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, 'stage', { run: newRun(HEROES[this.hero].id, SKILLS[this.skill].id), stage: 0 });
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    const s = Math.sin(this.time.now / 300);
    this.rigs.forEach((r, i) => {
      const p = neutralPose();
      if (i === this.hero) {
        p.armF = -0.6 + s * 0.3;
        p.bob = -Math.abs(s) * 3;
      } else {
        p.armF = 0.08 + s * 0.04;
        p.bob = s;
      }
      r.update(dt, p);
    });

    const c = this.controls;
    const mx = c.moveX;
    const my = c.moveY;
    const px = mx !== this.lastMove.x ? mx : 0;
    const py = my !== this.lastMove.y ? my : 0;
    this.lastMove = { x: mx, y: my };
    if (this.focus === 'hero') {
      if (px !== 0) this.hero = (this.hero + px + HEROES.length) % HEROES.length;
      if (py !== 0) this.hero = (this.hero + py * 3 + HEROES.length) % HEROES.length;
    } else if (py !== 0) {
      this.skill = (this.skill + py + SKILLS.length) % SKILLS.length;
    }
    if (px !== 0 || py !== 0) this.refresh();

    if (c.consume('confirm')) {
      if (this.focus === 'hero') {
        this.focus = 'skill';
        this.refresh();
      } else {
        this.start();
      }
    }
    if (c.consume('pause')) {
      if (this.focus === 'skill') {
        this.focus = 'hero';
        this.refresh();
      } else if (!this.leaving) {
        this.leaving = true;
        fadeTo(this, 'title');
      }
    }
  }
}
