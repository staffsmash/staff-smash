import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import { heroById } from '../data/heroes';
import { Controls } from '../input/Controls';
import { fetchBoard, isMine, type RecordEntry } from '../records';
import { fadeTo, makeButton } from '../ui/button';

// 기록판: 교직원 모드 상위 20개. 순위는 도달 스테이지 → 퇴근 시각 → 걸린 시간.

export class LeaderboardScene extends Phaser.Scene {
  private controls!: Controls;
  private leaving = false;

  constructor() {
    super('board');
  }

  create(): void {
    this.leaving = false;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(250, 0, 0, 0);
    const cx = GAME_W / 2;
    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    this.add.text(cx, 34, '기록판 · 교직원 모드', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(cx, 64, '학생 모드 기록판은 학생 모드가 나오면 열립니다', { fontFamily: FONT, fontSize: '12px', color: '#8b95a8' }).setOrigin(0.5);
    const loading = this.add.text(cx, GAME_H / 2, '기록을 불러오는 중…', { fontFamily: FONT, fontSize: '18px', color: '#c9d3e6' }).setOrigin(0.5);
    makeButton(this, cx, GAME_H - 34, 240, 44, '타이틀로 (Enter)', () => this.back(), 0x6b7280);

    void fetchBoard('staff').then((b) => {
      if (!this.scene.isActive()) return;
      loading.destroy();
      const sub = b.online
        ? `지금까지 ${b.plays ?? 0}판 · 참여 ${b.players ?? 0}명`
        : '온라인 기록판에 연결되지 않아 이 기기의 기록만 보여 줍니다';
      this.add.text(cx, 88, sub, { fontFamily: FONT, fontSize: '13px', color: b.online ? '#7CFC9A' : '#f5c542' }).setOrigin(0.5);
      this.drawTable(b.entries);
    });
  }

  private drawTable(entries: RecordEntry[]): void {
    const cols = [70, 120, 330, 470, 590, 720];
    const heads = ['순위', '닉네임', '결과', '완료 시각', '평정', '주인공'];
    const top = 116;
    heads.forEach((h, i) => this.add.text(cols[i], top, h, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#c9d3e6' }));
    if (entries.length === 0) {
      this.add
        .text(GAME_W / 2, 260, '아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!', { fontFamily: FONT, fontSize: '17px', color: '#ffffff' })
        .setOrigin(0.5);
      return;
    }
    // 2열로 나눠 20개까지
    const rowH = 17.5;
    entries.slice(0, 20).forEach((e, i) => {
      const y = top + 24 + i * rowH;
      const mine = isMine(e);
      if (mine) this.add.rectangle(GAME_W / 2, y + 8, 860, rowH, 0xf5c542, 0.25);
      const color = mine ? '#ffe066' : i < 3 ? '#ffffff' : '#dfe6f2';
      const cells = [
        `${i + 1}`,
        e.nickname,
        e.cleared
          ? e.clockMin <= OFF_HOURS + 0.001
            ? '정시 퇴근'
            : `퇴근 · ${Math.ceil(e.clockMin - OFF_HOURS)}분 초과`
          : `${e.stage}스테이지에서 야근`,
        clockText(e.clockMin),
        e.grades || '-',
        heroById(e.hero).name,
      ];
      cells.forEach((c, k) =>
        this.add.text(cols[k], y, c, { fontFamily: FONT, fontSize: '13px', fontStyle: i < 3 ? 'bold' : 'normal', color }),
      );
    });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, 'title');
  }

  update(): void {
    if (this.controls.consume('confirm') || this.controls.consume('pause') || this.controls.consume('title')) this.back();
  }
}
