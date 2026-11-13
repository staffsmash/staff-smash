import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W } from '../config';
import { heroById } from '../data/heroes';
import { skillById } from '../data/skills';
import { spellById } from '../data/spells';
import { studentHeroById } from '../data/students';
import { Controls } from '../input/Controls';
import { gpaText } from '../grade';
import { VERSION, checkNickname, lastNickname, onlineConfigured, submitRecord, type RecordEntry } from '../records';
import { gradesText, outcomeText, runClock, type RunState } from '../run';
import { fadeTo, makeButton } from '../ui/button';
import { addSpellLine } from '../ui/spellText';

// 기록 남기기 (PRD 13절): 게임이 끝나면(클리어·게임오버 모두) 닉네임을 쓰고 기록판에 올린다.
// 건너뛰면 익명으로 1건만 남는다(순위에는 안 나온다). 실명·학번은 받지 않는다.

export class RecordScene extends Phaser.Scene {
  private controls!: Controls;
  private run!: RunState;
  private input0: HTMLInputElement | null = null;
  private errorT!: Phaser.GameObjects.Text;
  private sent = false;

  constructor() {
    super('record');
  }

  create(data: { run: RunState }): void {
    this.run = data.run;
    this.sent = false;
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls.destroy();
      this.removeInput();
    });
    this.cameras.main.fadeIn(250, 0, 0, 0);
    const cx = GAME_W / 2;
    const r = this.run;
    const clock = runClock(r);

    this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x1d2433);
    const student = r.mode === 'student';
    this.add
      .text(cx, 52, student ? '오늘의 학사 기록' : '오늘의 근무 기록', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);

    const result = outcomeText(r.mode, r.cleared, r.reached, clock, true);
    const stageGrades = r.stages.map((s) => `${s.stage}스테이지 ${s.grade}`).join(' · ') || '없음';
    const lines = student
      ? [
          '', // 첫 줄(주인공 · 외국어 주문)은 아래에서 따로 그린다
          result,
          `학점 ${stageGrades}${r.stages.length ? ` · GPA ${gpaText(r.stages.map((s) => s.grade))}` : ''}`,
          `받은 피해 ${r.damage} · 최대 연속 공격 ${r.maxCombo}회`,
        ]
      : [
          `${heroById(r.hero).name} · 필살기 ${skillById(r.skill).name}`,
          result,
          `근무평정 ${stageGrades}`,
          `받은 민원 피해 ${r.damage} · 최대 연속 처리 ${r.maxCombo}회`,
        ];
    lines.forEach((t, i) =>
      this.add
        .text(cx, 100 + i * 30, t, {
          fontFamily: FONT,
          fontSize: i === 1 ? '22px' : '16px',
          fontStyle: i === 1 ? 'bold' : 'normal',
          color: i === 1 ? (r.cleared ? '#7CFC9A' : '#ff8a8a') : '#e6ebf3',
        })
        .setOrigin(0.5),
    );
    if (student) {
      // "김러샤 · 필살기 아랍어 · يلا! (가자!)" — 아랍어 원문은 따로 오른쪽 → 왼쪽으로 그린다
      const spell = spellById(r.skill);
      const nameT = this.add.text(0, 100, `${studentHeroById(r.hero).name} · 필살기 `, { fontFamily: FONT, fontSize: '16px', color: '#e6ebf3' });
      const line = addSpellLine(this, 0, 100, spell, { size: 16, color: '#e6ebf3', bold: false });
      const x0 = cx - (nameT.width + line.width) / 2;
      nameT.setOrigin(0, 0.5).setX(x0);
      line.setX(x0 + nameT.width);
    }

    this.add
      .text(cx, 248, '기록판에 남길 닉네임 (2~8자)', { fontFamily: FONT, fontSize: '16px', color: '#c9d3e6' })
      .setOrigin(0.5);
    this.add
      .text(cx, 340, '실명·학번은 쓰지 마세요. 닉네임은 누구나 볼 수 있습니다.', { fontFamily: FONT, fontSize: '13px', color: '#f5c542' })
      .setOrigin(0.5);
    this.errorT = this.add.text(cx, 364, '', { fontFamily: FONT, fontSize: '14px', color: '#ff8a8a' }).setOrigin(0.5);
    if (!onlineConfigured()) {
      this.add
        .text(cx, 386, '온라인 기록판 연결 전입니다 — 지금은 이 기기에만 저장됩니다', { fontFamily: FONT, fontSize: '12px', color: '#8b95a8' })
        .setOrigin(0.5);
    }

    makeButton(this, cx - 120, 440, 220, 50, '기록 남기기 (Enter)', () => this.submit(false), 0x2f8f4e);
    makeButton(this, cx + 120, 440, 200, 50, '건너뛰기 (Esc)', () => this.submit(true), 0x6b7280);
    this.add
      .text(cx, GAME_H - 16, '건너뛰어도 플레이 수 집계를 위해 닉네임 없이 결과만 익명으로 남습니다', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8b95a8',
      })
      .setOrigin(0.5);

    this.makeInput();
  }

  /** 캔버스 위에 실제 입력창을 겹쳐 띄운다 (모바일 키보드가 뜨게) */
  private makeInput(): void {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 12;
    el.placeholder = '닉네임';
    el.value = lastNickname();
    el.autocomplete = 'off';
    el.setAttribute('aria-label', '닉네임');
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '5',
      textAlign: 'center',
      fontFamily: FONT,
      fontWeight: '700',
      border: '3px solid #f5c542',
      borderRadius: '8px',
      background: '#ffffff',
      color: '#111318',
      outline: 'none',
    } as Partial<CSSStyleDeclaration>);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit(false);
      if (e.key === 'Escape') this.submit(true);
    });
    document.body.appendChild(el);
    this.input0 = el;
    this.placeInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.placeInput, this);
    if (!this.sys.game.device.input.touch) setTimeout(() => el.focus(), 50);
  }

  private placeInput = (): void => {
    const el = this.input0;
    if (!el) return;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / GAME_W;
    const w = 300 * k;
    const h = 46 * k;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.fontSize = `${Math.max(14, 22 * k)}px`;
    el.style.left = `${rect.left + rect.width / 2 - w / 2}px`;
    el.style.top = `${rect.top + 270 * k}px`;
  };

  private removeInput(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.placeInput, this);
    this.input0?.remove();
    this.input0 = null;
  }

  private submit(skip: boolean): void {
    if (this.sent) return;
    let nickname = '';
    if (!skip) {
      const chk = checkNickname(this.input0?.value ?? '');
      if (!chk.ok) {
        this.errorT.setText(chk.reason);
        this.input0?.focus();
        return;
      }
      nickname = chk.name;
    }
    this.sent = true;
    const r = this.run;
    const entry: RecordEntry = {
      mode: r.mode,
      nickname,
      stage: r.reached,
      cleared: r.cleared,
      clockMin: Math.round(runClock(r) * 100) / 100,
      elapsed: Math.round(r.elapsed),
      grades: gradesText(r),
      hero: r.hero,
      skill: r.skill,
      version: VERSION,
      ts: Date.now(),
    };
    this.removeInput();
    this.errorT.setColor('#c9d3e6').setText('기록을 보내는 중…');
    void submitRecord(entry).then(() => fadeTo(this, 'board', { from: 'record', mode: r.mode }));
  }

  update(): void {
    if (this.sent) return;
    if (this.controls.consume('pause')) this.submit(true);
  }
}
