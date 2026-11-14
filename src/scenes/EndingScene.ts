import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import { heroById } from '../data/heroes';
import { Controls } from '../input/Controls';
import { neutralPose, type Pose, type Rig } from '../entities/Rig';
import { createPresidentPortrait, createPresidentRig, createStaffRig } from '../entities/rigs';
import { runClock, type RunState, lateMin } from '../run';
import { fadeTo } from '../ui/button';
import * as fx from '../fx';
import { drawEndingBackdrop } from './background';

// 교직원 모드 엔딩 (PRD 5절): 총학 집행부의 면담 요청에 프레지던트 캉이 내려와
// "퇴근 승인"과 "월급 인상" 도장을 찍어 준다. 그리고 전화가 울린다. 내일 아침 9시 회의다.

export class EndingScene extends Phaser.Scene {
  private controls!: Controls;
  private run!: RunState;
  private hero!: Rig;
  private pres!: Rig;
  private presX = GAME_W + 80;
  private presTarget = GAME_W + 80;
  private presArm = 0;
  private heroPose: 'idle' | 'phone' | 'cheer' = 'idle';
  private t = 0;
  private leaving = false;
  /** 학생 모드라서 studentEnding으로 넘긴 경우 */
  private redirected = false;

  constructor() {
    super('ending');
  }

  create(data: { run: RunState }): void {
    // 학생 모드 엔딩은 따로 있다 (StudentEndingScene). 스테이지는 두 모드 모두 'ending'으로 넘어온다.
    this.redirected = data.run?.mode === 'student';
    if (this.redirected) {
      this.scene.start('studentEnding', data);
      return;
    }
    this.run = data.run;
    this.t = 0;
    this.leaving = false;
    this.presX = GAME_W + 80;
    this.presTarget = GAME_W + 80;
    this.presArm = 0;
    this.heroPose = 'idle';
    this.controls = new Controls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // 해 질 녘 본관 앞 (프레지던트 캉이 본관에서 내려온다)
    drawEndingBackdrop(this);

    this.hero = createStaffRig(this, heroById(this.run.hero).look);
    this.hero.root.setPosition(330, 440).setScale(1.3).setDepth(440);
    this.pres = createPresidentRig(this);
    this.pres.root.setPosition(this.presX, 440).setScale(-1.4, 1.4).setDepth(441);

    const line = (at: number, text: string, color = '#ffffff', size = 20) =>
      this.time.delayedCall(at, () => {
        const tt = this.add
          .text(GAME_W / 2, 120, text, {
            fontFamily: FONT,
            fontSize: `${size}px`,
            fontStyle: 'bold',
            color,
            stroke: '#111318',
            strokeThickness: 5,
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(1000)
          .setAlpha(0);
        this.tweens.add({ targets: tt, alpha: 1, duration: 200 });
        this.tweens.add({ targets: tt, alpha: 0, delay: 1700, duration: 250, onComplete: () => tt.destroy() });
      });

    line(300, '총학 집행부: "총장 면담을 요청합니다!"');
    this.time.delayedCall(2000, () => {
      this.presTarget = 600;
      const portrait = createPresidentPortrait(this, 830, 200).setDepth(900).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: portrait, alpha: 1, duration: 300 });
      this.time.delayedCall(4200, () => this.tweens.add({ targets: portrait, alpha: 0, duration: 300 }));
    });
    line(2600, '프레지던트 캉: "오늘 민원 처리, 수고 많았어요."');
    this.time.delayedCall(4600, () => this.stamp('퇴근 승인', 0xd0202f, -0.12, 300));
    this.time.delayedCall(5900, () => this.stamp('월급 인상', 0x1d4ed8, 0.1, 660));
    this.time.delayedCall(6200, () => (this.heroPose = 'cheer'));
    this.time.delayedCall(8000, () => {
      this.heroPose = 'phone';
      fx.ringWave(this, 330, 440);
    });
    line(8000, '따르릉!', '#ffe066', 30);
    line(9800, '…네? 내일 아침 9시 회의요?', '#ffffff', 22);
    this.time.delayedCall(11800, () => this.summary());
  }

  /** 큰 도장. x: 화면 가로 위치 (두 도장을 나란히 찍는다) */
  private stamp(text: string, color: number, rot: number, x: number): void {
    this.presArm = 1;
    this.time.delayedCall(250, () => (this.presArm = 0));
    const c = this.add.container(x, 215).setDepth(1100);
    const g = this.add.graphics();
    g.lineStyle(7, color, 1);
    g.strokeRoundedRect(-170, -48, 340, 96, 14);
    g.lineStyle(3, color, 1);
    g.strokeRoundedRect(-156, -36, 312, 72, 10);
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    c.add([g, this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '50px', fontStyle: 'bold', color: hex }).setOrigin(0.5)]);
    c.setRotation(rot).setScale(2.6).setAlpha(0);
    this.tweens.add({
      targets: c,
      scale: 1,
      alpha: 0.95,
      duration: 160,
      ease: 'Quad.In',
      onComplete: () => this.cameras.main.shake(160, 0.012),
    });
  }

  private summary(): void {
    const clock = runClock(this.run);
    const onTime = clock <= OFF_HOURS + 0.001;
    const over = lateMin(clock);
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.88).setDepth(1200).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 400 });
    const grades = this.run.stages.map((s) => s.grade).join(' · ');
    const lines = [
      ['교직원 모드 완료', '34px', '#f5c542'],
      [onTime ? `퇴근 시각 ${clockText(Math.max(clock, OFF_HOURS))} · 정시 퇴근!` : `퇴근 시각 ${clockText(clock)} · ${over}분 초과근무`, '22px', onTime ? '#7CFC9A' : '#ff8a8a'],
      [`근무평정 ${grades}`, '18px', '#ffffff'],
      ['', '10px', '#ffffff'],
      ['Staff Smash: HUFS (비공식 게임)', '14px', '#c9d3e6'],
      ['배경은 서울캠퍼스 실제 건물을 블록으로 그렸습니다 · 로고: 한국외국어대학교 UI', '13px', '#c9d3e6'],
      ['', '10px', '#ffffff'],
      ['Enter 또는 화면을 눌러 기록 남기기', '18px', '#f5c542'],
    ];
    let y = 120;
    for (const [text, size, color] of lines) {
      const t = this.add
        .text(GAME_W / 2, y, text, { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color })
        .setOrigin(0.5)
        .setDepth(1201)
        .setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 300, duration: 400 });
      y += parseInt(size, 10) + 18;
    }
    this.input.once('pointerup', () => this.toRecord());
  }

  private toRecord(): void {
    if (this.leaving) return;
    this.leaving = true;
    fadeTo(this, 'record', { run: this.run });
  }

  update(_t: number, deltaMs: number): void {
    if (this.redirected) return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    // 프레지던트 캉 걷기
    const d = this.presTarget - this.presX;
    const moving = Math.abs(d) > 4;
    if (moving) this.presX += Math.sign(d) * Math.min(Math.abs(d), 170 * dt);
    this.pres.root.x = this.presX;
    const pp: Pose = neutralPose();
    if (moving) {
      const s = Math.sin(this.t * 9);
      pp.legF = s * 0.45;
      pp.legB = -s * 0.45;
      pp.armB = s * 0.35;
    }
    pp.armF = this.presArm ? -2.6 : moving ? -Math.sin(this.t * 9) * 0.35 : 0.05;
    this.pres.update(dt, pp, 24);

    const hp: Pose = neutralPose();
    const s = Math.sin(this.t * 6);
    if (this.heroPose === 'cheer') {
      hp.armF = -2.9;
      hp.armB = -2.9;
      hp.bob = -Math.abs(s) * 10;
    } else if (this.heroPose === 'phone') {
      hp.armF = -2.6;
      hp.body = -0.05;
    } else {
      hp.armF = 0.08 + s * 0.04;
    }
    this.hero.update(dt, hp, 16);

    if (this.t > 1.5 && this.controls.consume('confirm')) this.toRecord();
  }
}
