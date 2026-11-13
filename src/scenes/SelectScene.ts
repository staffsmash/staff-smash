import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { HEROES } from '../data/heroes';
import { SKILLS } from '../data/skills';
import { STUDENT_HEROES } from '../data/students';
import { SPELLS } from '../data/spells';
import { Controls } from '../input/Controls';
import { neutralPose, type Rig } from '../entities/Rig';
import { createStaffRig, createStudentHeroRig } from '../entities/rigs';
import type { GameMode } from '../records';
import { newRun } from '../run';
import { fadeTo, makeButton, makeTabs } from '../ui/button';
import { addSpellLine } from '../ui/spellText';

// 출근·등교 준비: 모드 · 주인공 · 필살기 고르기.
// - 교직원 모드: 가상 행정직원 6명 · 업무 스킬 4종
// - 학생 모드: 학생 주인공 4명 · 외국어 주문 4종 (효과는 업무 스킬과 같은 4종)
// 키보드: 방향키로 고르고 Enter. 주인공을 고르면 필살기 칸으로, 필살기를 고르면 시작. Esc로 한 단계 뒤로. 1·2로 모드 바꾸기.

const CARD_H = 158;
const ROWS = [176, 346];
const SKILL_X = 760;
const SKILL_Y = [138, 218, 298, 378];

/** 모드별 주인공 카드 배치: 교직원 3열 × 2줄, 학생 2열 × 2줄 */
const GRID: Record<GameMode, { cols: number[]; w: number }> = {
  staff: { cols: [110, 290, 470], w: 164 },
  student: { cols: [168, 412], w: 228 },
};

/** 게임오버 뒤 R(처음부터)처럼 모드 없이 들어오면 마지막으로 고른 모드를 쓴다 */
let lastMode: GameMode = 'staff';

export interface SelectData {
  mode?: GameMode;
}

export class SelectScene extends Phaser.Scene {
  private controls!: Controls;
  private mode: GameMode = 'staff';
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

  private get heroCount(): number {
    return this.mode === 'student' ? STUDENT_HEROES.length : HEROES.length;
  }

  create(data?: SelectData): void {
    const mode = data?.mode ?? lastMode;
    if (mode !== this.mode) {
      // 모드를 바꾸면 고른 칸을 처음으로 되돌린다
      this.hero = 0;
      this.skill = 0;
    }
    this.mode = mode;
    lastMode = mode;
    const student = mode === 'student';
    this.leaving = false;
    this.focus = 'hero';
    this.rigs = [];
    this.cards = [];
    this.skillBoxes = [];
    this.lastMove = { x: 0, y: 0 };
    this.hero = Math.min(this.hero, this.heroCount - 1);
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(200, 0, 0, 0);
    const touch = this.sys.game.device.input.touch;

    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.text(30, 22, student ? '등교 준비' : '출근 준비', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' });
    // 모드 탭 (눌러서 바꾸기)
    const setTab = makeTabs(
      this,
      345,
      38,
      140,
      34,
      touch ? ['교직원 모드', '학생 모드'] : ['교직원 모드 (1)', '학생 모드 (2)'],
      (i) => this.switchMode(i === 0 ? 'staff' : 'student'),
    );
    setTab(student ? 1 : 0);

    this.add.text(30, 74, '1. 주인공 (능력은 같고 외형·대사만 달라요)', { fontFamily: FONT, fontSize: '14px', color: '#c9d3e6' });
    const grid = GRID[mode];
    const nCols = grid.cols.length;
    const heroes = student
      ? STUDENT_HEROES.map((h) => ({ name: h.name, rig: () => createStudentHeroRig(this, h.look) }))
      : HEROES.map((h) => ({ name: h.name, rig: () => createStaffRig(this, h.look) }));
    heroes.forEach((h, i) => {
      const cx = grid.cols[i % nCols];
      const cy = ROWS[Math.floor(i / nCols)];
      const card = this.add
        .rectangle(cx, cy, grid.w, CARD_H, 0x2a3346)
        .setStrokeStyle(2, 0x5b6478)
        .setInteractive({ useHandCursor: true });
      card.on('pointerup', () => {
        this.hero = i;
        this.focus = 'skill';
        this.refresh();
      });
      this.cards.push(card);
      this.add.text(cx, cy - CARD_H / 2 + 10, h.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5, 0);
      const rig = h.rig();
      rig.root.setPosition(cx, cy + CARD_H / 2 - 12).setScale(0.95);
      this.rigs.push(rig);
    });

    this.add.text(SKILL_X - 160, 74, student ? '2. 필살기 · 외국어 주문' : '2. 필살기 · 업무 스킬', {
      fontFamily: FONT,
      fontSize: '14px',
      color: '#c9d3e6',
    });
    const boxW = student ? 340 : 330;
    for (let i = 0; i < 4; i++) {
      const y = SKILL_Y[i];
      const box = this.add
        .rectangle(SKILL_X, y, boxW, 70, 0x2a3346)
        .setStrokeStyle(2, 0x5b6478)
        .setInteractive({ useHandCursor: true });
      box.on('pointerup', () => {
        this.skill = i;
        this.focus = 'skill';
        this.refresh();
      });
      this.skillBoxes.push(box);
      const left = SKILL_X - boxW / 2 + 15;
      if (student) {
        const sp = SPELLS[i];
        // "영어 · DEADLINE EXTENDED! (마감 연장!)" — 아랍어 원문은 오른쪽 → 왼쪽으로 그린다
        addSpellLine(this, left, y - 14, sp, { size: 16, color: '#f5c542', meaningColor: '#ffe9a8', maxW: boxW - 26 });
        this.add.text(left, y + 6, sp.desc, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#e6ebf3',
          wordWrap: { width: boxW - 30, useAdvancedWrap: true },
        });
      } else {
        const s = SKILLS[i];
        this.add.text(SKILL_X - 150, y - 24, s.name, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#f5c542' });
        this.add.text(SKILL_X - 150, y + 2, s.desc, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#e6ebf3',
          wordWrap: { width: 300, useAdvancedWrap: true },
        });
      }
    }

    this.lineT = this.add
      .text(290, 470, '', { fontFamily: FONT, fontSize: '16px', color: '#ffffff', backgroundColor: '#2a3346', padding: { x: 10, y: 6 } })
      .setOrigin(0.5);
    makeButton(this, SKILL_X, 470, boxW, 52, student ? '등교하기 (Enter)' : '출근하기 (Enter)', () => this.start(), student ? 0xb4532a : 0x2f8f4e);
    this.add
      .text(GAME_W / 2, GAME_H - 14, '방향키로 고르고 Enter · Esc 뒤로 · 1·2 모드 바꾸기 · 마우스·터치로 눌러도 됩니다', {
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
    const h = this.mode === 'student' ? STUDENT_HEROES[this.hero] : HEROES[this.hero];
    this.lineT.setText(`${h.name}: "${h.line}"`);
  }

  private switchMode(mode: GameMode): void {
    if (this.leaving || mode === this.mode) return;
    this.scene.restart({ mode });
  }

  private start(): void {
    if (this.leaving) return;
    this.leaving = true;
    const run =
      this.mode === 'student'
        ? newRun('student', STUDENT_HEROES[this.hero].id, SPELLS[this.skill].id)
        : newRun('staff', HEROES[this.hero].id, SKILLS[this.skill].id);
    fadeTo(this, 'stage', { run, stage: 0 });
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
    if (c.consume('pick1')) this.switchMode('staff');
    else if (c.consume('pick2')) this.switchMode('student');

    const n = this.heroCount;
    const nCols = GRID[this.mode].cols.length;
    const mx = c.moveX;
    const my = c.moveY;
    const px = mx !== this.lastMove.x ? mx : 0;
    const py = my !== this.lastMove.y ? my : 0;
    this.lastMove = { x: mx, y: my };
    if (this.focus === 'hero') {
      if (px !== 0) this.hero = (this.hero + px + n) % n;
      if (py !== 0) this.hero = (this.hero + py * nCols + n) % n;
    } else if (py !== 0) {
      this.skill = (this.skill + py + 4) % 4;
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
