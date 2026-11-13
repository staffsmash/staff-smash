import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, clockText } from '../config';
import { heroById } from '../data/heroes';
import { studentHeroById } from '../data/students';
import { gpaText, parseStudentGrades } from '../grade';
import { Controls } from '../input/Controls';
import { fetchBoard, isMine, type Board, type GameMode, type RecordEntry } from '../records';
import { outcomeText } from '../run';
import { fadeTo, makeButton, makeTabs } from '../ui/button';

// 기록판: 모드별 상위 20개 (교직원 / 학생 탭). 순위는 도달 스테이지 → 완료 시각 → 걸린 시간 (서버와 같다).
// 학생 모드는 GPA를 학점 글자(grades)로 계산해 함께 보여 준다.

const MODES: GameMode[] = ['staff', 'student'];

/** 탭별 칸 위치와 머리글. 학생 결과 문구("3스테이지에서 서류반려")가 길어서 칸을 조금 넓힌다 */
const COLUMNS: Record<GameMode, { x: number[]; heads: string[] }> = {
  staff: { x: [70, 120, 330, 470, 590, 720], heads: ['순위', '닉네임', '결과', '완료 시각', '평정', '주인공'] },
  student: { x: [70, 120, 270, 460, 580, 690], heads: ['순위', '닉네임', '결과', '완료 시각', 'GPA', '주인공'] },
};

/** 마지막으로 본 탭 (타이틀에서 다시 들어올 때) */
let lastTab: GameMode = 'staff';

export class LeaderboardScene extends Phaser.Scene {
  private controls!: Controls;
  private leaving = false;
  private mode: GameMode = 'staff';
  private setTab!: (i: number) => void;
  private tableC!: Phaser.GameObjects.Container;
  private boards = new Map<GameMode, Board>();
  private lastMoveX = 0;

  constructor() {
    super('board');
  }

  create(data?: { from?: string; mode?: GameMode }): void {
    this.leaving = false;
    this.boards = new Map();
    this.lastMoveX = 0;
    this.mode = data?.mode ?? lastTab;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    const cx = GAME_W / 2;
    const touch = this.sys.game.device.input.touch;
    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.text(cx, 28, '기록판', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.setTab = makeTabs(this, cx, 64, 150, 30, ['교직원 모드', '학생 모드'], (i) => this.show(MODES[i]));
    if (!touch) {
      this.add.text(cx + 170, 64, '← → 탭 바꾸기', { fontFamily: FONT, fontSize: '12px', color: '#8b95a8' }).setOrigin(0, 0.5);
    }
    this.tableC = this.add.container(0, 0);
    makeButton(this, cx, GAME_H - 34, 240, 44, '타이틀로 (Enter)', () => this.back(), 0x6b7280);
    this.show(this.mode, true);
  }

  /** 탭을 바꾸고 그 모드의 기록을 불러온다 (한 번 불러온 탭은 다시 받지 않는다) */
  private show(mode: GameMode, force = false): void {
    if (!force && mode === this.mode) return;
    this.mode = mode;
    lastTab = mode;
    this.setTab(MODES.indexOf(mode));
    this.tableC.removeAll(true);
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
      if (this.mode !== mode) return;
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
    const mode = this.mode;
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
      if (mine) add(this.add.rectangle(GAME_W / 2, y + 8, 860, rowH, 0xf5c542, 0.25));
      const color = mine ? '#ffe066' : i < 3 ? '#ffffff' : '#dfe6f2';
      const cells =
        mode === 'student'
          ? [
              `${i + 1}`,
              e.nickname,
              outcomeText('student', e.cleared, e.stage, e.clockMin, false),
              clockText(e.clockMin),
              gpaText(parseStudentGrades(e.grades)),
              studentHeroById(e.hero).name,
            ]
          : [
              `${i + 1}`,
              e.nickname,
              outcomeText('staff', e.cleared, e.stage, e.clockMin, false),
              clockText(e.clockMin),
              e.grades || '-',
              heroById(e.hero).name,
            ];
      cells.forEach((c, k) =>
        add(this.add.text(cols[k], y, c, { fontFamily: FONT, fontSize: '13px', fontStyle: i < 3 ? 'bold' : 'normal', color })),
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
    // ← → (A D) 또는 1·2로 탭 바꾸기
    const mx = c.moveX;
    const px = mx !== this.lastMoveX ? mx : 0;
    this.lastMoveX = mx;
    if (px !== 0) this.show(MODES[(MODES.indexOf(this.mode) + px + MODES.length) % MODES.length]);
    if (c.consume('pick1')) this.show('staff');
    else if (c.consume('pick2')) this.show('student');
    if (c.consume('confirm') || c.consume('pause') || c.consume('title')) this.back();
  }
}
