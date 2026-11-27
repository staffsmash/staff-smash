import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, clockText } from '../config';
import { badgeCount, badgeList, BADGES } from '../badges';
import { heroById } from '../data/heroes';
import { studentHeroById } from '../data/students';
import { DIFF2D, isDiff2d } from '../difficulty';
import { gpaText, parseStudentGrades } from '../grade';
import { Controls } from '../input/Controls';
import { fetchBoard, isMine, type Board, type GameMode, type RecordEntry } from '../records';
import { outcomeText, type RunState } from '../run';
import { fadeTo, makeButton, makeTabs } from '../ui/button';
import { addShareButton, runShareData } from '../ui/shareButton';

// 기록판: 모드별 상위 20개 (교직원 / 학생 탭) + 도전 과제 "배지" 탭 (PRD 결정 60 8절).
// 순위는 도달 스테이지 → 난이도(고급 > 중급 > 초보 > 예전 기록) → 완료 시각 → 걸린 시간 (서버와 같다, records.ts compareRecords).
// 학생 모드는 GPA를 학점 글자(grades)로 계산해 함께 보여 준다.
// 이름 남기기 화면에서 넘어왔으면(from: 'record') 아래에 "공유" 단추 — 남긴 닉네임이 그림에 들어간다.

type Tab = GameMode | 'badges';
const TABS: Tab[] = ['staff', 'student', 'badges'];

/** 탭별 칸 위치와 머리글. 학생 결과 문구("3스테이지에서 서류반려")가 길어서 칸을 조금 넓힌다 */
const COLUMNS: Record<GameMode, { x: number[]; heads: string[] }> = {
  staff: { x: [60, 106, 290, 440, 520, 620, 730], heads: ['순위', '닉네임', '결과', '난이도', '완료 시각', '평정', '주인공'] },
  student: { x: [60, 106, 250, 440, 520, 620, 710], heads: ['순위', '닉네임', '결과', '난이도', '완료 시각', 'GPA', '주인공'] },
};

/** 마지막으로 본 탭 (타이틀에서 다시 들어올 때) */
let lastTab: Tab = 'staff';

export interface BoardData {
  from?: string;
  mode?: GameMode;
  /** 이름 남기기 화면에서 넘어왔을 때: 공유 그림용 */
  run?: RunState;
  nickname?: string;
}

export class LeaderboardScene extends Phaser.Scene {
  private controls!: Controls;
  private leaving = false;
  private tab: Tab = 'staff';
  private setTab!: (i: number) => void;
  private tableC!: Phaser.GameObjects.Container;
  private boards = new Map<GameMode, Board>();
  private lastMoveX = 0;

  constructor() {
    super('board');
  }

  create(data?: BoardData): void {
    this.leaving = false;
    this.boards = new Map();
    this.lastMoveX = 0;
    this.tab = data?.mode ?? lastTab;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;
    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.text(cx, 28, '기록판', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.setTab = makeTabs(this, cx, 64, 140, 30, ['교직원 모드', '학생 모드', '배지'], (i) => this.show(TABS[i]));
    if (!touch) {
      this.add.text(cx + 226, 64, '← → 탭 바꾸기', { fontFamily: FONT, fontSize: '12px', color: '#8b95a8' }).setOrigin(0, 0.5);
    }
    this.tableC = this.add.container(0, 0);
    const back = touch ? '타이틀로' : '타이틀로 (Enter)';
    if (data?.from === 'record' && data.run) {
      // 이름을 남긴 뒤: 공유 + 타이틀로
      addShareButton(this, cx - 110, GAME_H - 34, 160, 44, runShareData(data.run, data.nickname ?? ''));
      makeButton(this, cx + 100, GAME_H - 34, 240, 44, back, () => this.back(), 0x6b7280);
    } else {
      makeButton(this, cx, GAME_H - 34, 240, 44, back, () => this.back(), 0x6b7280);
    }
    this.show(this.tab, true);
  }

  /** 탭을 바꾼다. 모드 탭은 그 모드의 기록을 불러온다 (한 번 불러온 탭은 다시 받지 않는다) */
  private show(tab: Tab, force = false): void {
    if (!force && tab === this.tab) return;
    this.tab = tab;
    lastTab = tab;
    this.setTab(TABS.indexOf(tab));
    this.tableC.removeAll(true);
    if (tab === 'badges') {
      this.drawBadges();
      return;
    }
    const mode = tab;
    const cached = this.boards.get(mode);
    if (cached) {
      this.drawBoard(cached);
      return;
    }
    const loading = this.add
      .text(GAME_W / 2, GAME_H / 2, '기록을 불러오는 중…', { fontFamily: FONT, fontSize: '18px', color: '#c9d3e6' })
      .setOrigin(0.5);
    this.tableC.add(loading);
    void fetchBoard(mode).then((b) => {
      if (!this.scene.isActive()) return;
      this.boards.set(mode, b);
      // 불러오는 사이에 탭을 바꿨으면 그리지 않는다
      if (this.tab !== mode) return;
      this.tableC.removeAll(true);
      this.drawBoard(b);
    });
  }

  private drawBoard(b: Board): void {
    const cx = GAME_W / 2;
    const sub = b.online
      ? `지금까지 ${b.plays ?? 0}판 · 참여 ${b.players ?? 0}명`
      : '온라인 기록판에 연결되지 않아 이 기기의 기록만 보여 줍니다';
    this.tableC.add(this.add.text(cx, 92, sub, { fontFamily: FONT, fontSize: '13px', color: b.online ? '#7CFC9A' : '#f5c542' }).setOrigin(0.5));
    this.drawTable(b.entries);
  }

  private drawTable(entries: RecordEntry[]): void {
    const mode = this.tab === 'student' ? 'student' : 'staff';
    const { x: cols, heads } = COLUMNS[mode];
    const top = 110;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.tableC.add(o);
      return o;
    };
    heads.forEach((h, i) => add(this.add.text(cols[i], top, h, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#c9d3e6' })));
    if (entries.length === 0) {
      add(
        this.add
          .text(GAME_W / 2, 260, '아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!', { fontFamily: FONT, fontSize: '17px', color: '#ffffff' })
          .setOrigin(0.5),
      );
      return;
    }
    const rowH = 17.5;
    entries.slice(0, 20).forEach((e, i) => {
      const y = top + 24 + i * rowH;
      const mine = isMine(e);
      if (mine) add(this.add.rectangle(GAME_W / 2, y + 8, 880, rowH, 0xf5c542, 0.25));
      const color = mine ? '#ffe066' : i < 3 ? '#ffffff' : '#dfe6f2';
      // 예전 2D 기록(난이도 없음)은 '-'
      const diff = isDiff2d(e.diff) ? DIFF2D[e.diff].label : '-';
      const cells =
        mode === 'student'
          ? [
              `${i + 1}`,
              e.nickname,
              outcomeText('student', e.cleared, e.stage, e.clockMin, false),
              diff,
              clockText(e.clockMin),
              gpaText(parseStudentGrades(e.grades)),
              studentHeroById(e.hero).name,
            ]
          : [
              `${i + 1}`,
              e.nickname,
              outcomeText('staff', e.cleared, e.stage, e.clockMin, false),
              diff,
              clockText(e.clockMin),
              e.grades || '-',
              heroById(e.hero).name,
            ];
      cells.forEach((c, k) =>
        add(this.add.text(cols[k], y, c, { fontFamily: FONT, fontSize: '13px', fontStyle: i < 3 ? 'bold' : 'normal', color })),
      );
    });
  }

  /** 배지 탭: 12칸 (딴 것은 금색·이름·조건, 못 딴 것은 흐리게). 위에 "배지 N / 12" */
  private drawBadges(): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.tableC.add(o);
      return o;
    };
    const cx = GAME_W / 2;
    add(
      this.add
        .text(cx, 98, `배지 ${badgeCount()} / ${BADGES.length}`, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#f5c542' })
        .setOrigin(0.5),
    );
    const cols = 4;
    const w = 214;
    const h = 108;
    const gap = 10;
    const x0 = cx - (cols * w + (cols - 1) * gap) / 2;
    const y0 = 120;
    badgeList().forEach(({ def, got }, i) => {
      const on = got !== null;
      const x = x0 + (i % cols) * (w + gap);
      const y = y0 + Math.floor(i / cols) * (h + gap);
      add(
        this.add
          .rectangle(x + w / 2, y + h / 2, w, h, on ? 0x3b3423 : 0x232a38)
          .setStrokeStyle(on ? 3 : 1, on ? 0xe0bb62 : 0x3c4558),
      );
      // 메달 (번호)
      const mx = x + 26;
      const my = y + 26;
      add(this.add.circle(mx, my, 17, on ? 0xe0bb62 : 0x343c4d).setStrokeStyle(2, on ? 0xfff3c4 : 0x46506a));
      add(
        this.add
          .text(mx, my, `${i + 1}`, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: on ? '#3b2a06' : '#7d8699' })
          .setOrigin(0.5),
      );
      add(
        this.add
          .text(x + 52, my, def.name, { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: on ? '#ffe9a8' : '#7d8699' })
          .setOrigin(0, 0.5),
      );
      add(
        this.add.text(x + 12, y + 52, def.desc, {
          fontFamily: FONT,
          fontSize: '14px',
          color: on ? '#f3ead2' : '#6b7488',
          wordWrap: { width: w - 24, useAdvancedWrap: true },
          lineSpacing: 2,
        }),
      );
    });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, 'title');
  }

  update(): void {
    const c = this.controls;
    // ← → (A D)로 탭 바꾸기, 1·2로 교직원·학생 모드
    const mx = c.moveX;
    const px = mx !== this.lastMoveX ? mx : 0;
    this.lastMoveX = mx;
    if (px !== 0) this.show(TABS[(TABS.indexOf(this.tab) + px + TABS.length) % TABS.length]);
    if (c.consume('pick1')) this.show('staff');
    else if (c.consume('pick2')) this.show('student');
    if (c.consume('confirm') || c.consume('pause') || c.consume('title')) this.back();
  }
}
