import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import { heroById } from '../data/heroes';
import { Controls } from '../input/Controls';
import { neutralPose, type Pose, type Rig } from '../entities/Rig';
import { createPresidentPortrait, createPresidentRig, createStaffRig } from '../entities/rigs';
import { runClock, type RunState, lateMin } from '../run';
import { fadeTo } from '../ui/button';
import { drawEndingBackdrop } from './background';

// 교직원 모드 엔딩 (PRD 5절): 총학 집행부의 면담 요청에 프레지던트 캉이 내려와
// "퇴근 승인"과 "월급 인상" 도장을 찍어 준다. 그리고 꿈 엔딩 (사용자 2026-11-21, 약 8초):
// 화면이 하얗게 흐려지며 멀리서 알람이 커지고 → 어두운 방에 휴대폰 화면만 "오전 7:00 · 출근 알람" (다시 알림 / 끄기는 모양만)
// → "…꿈이었다." → "오늘도 출근합니다." → 결과. 1인칭 시험판(src/fps/dream.ts)과 같은 흐름이다.

export class EndingScene extends Phaser.Scene {
  private controls!: Controls;
  private run!: RunState;
  private hero!: Rig;
  private pres!: Rig;
  private presX = GAME_W + 80;
  private presTarget = GAME_W + 80;
  private presArm = 0;
  private heroPose: 'idle' | 'cheer' = 'idle';
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
    // 꿈 엔딩: 하얘짐(7.6초) → 어두운 방·휴대폰(9.2초) → 끄기(11.8초) → "…꿈이었다." → "오늘도 출근합니다." → 결과(15.4초)
    this.time.delayedCall(7600, () => this.whiteOut());
    this.time.delayedCall(9200, () => this.phoneRoom());
    this.time.delayedCall(15400, () => this.summary());
  }

  /** 꿈 엔딩 1: 화면이 하얗게 흐려지고 멀리서 알람이 점점 커진다 */
  private whiteOut(): void {
    // 소리: alarm (2D 소리 모듈이 들어오면 여기서 휴대폰 알람을 작게 → 크게 되풀이한다)
    const white = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 1).setDepth(1150).setAlpha(0);
    this.tweens.add({ targets: white, alpha: 1, duration: 1500, ease: 'Quad.In' });
    // WebGL이면 화면도 흐리게 (Canvas 렌더러는 하얘지기만 한다)
    if (this.renderer.type === Phaser.WEBGL) {
      const cam = this.cameras.main;
      const blur = cam.postFX.addBlur(1, 0, 0, 0);
      this.tweens.add({ targets: blur, strength: 3, duration: 1500 });
      this.time.delayedCall(1700, () => cam.postFX.remove(blur));
    }
  }

  /** 꿈 엔딩 2·3: 어두운 방, 휴대폰 화면만 — 알람을 끄면 "…꿈이었다." → "오늘도 출근합니다." */
  private phoneRoom(): void {
    const D = 1160;
    const room = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05070b, 1).setDepth(D).setAlpha(0);
    this.tweens.add({ targets: room, alpha: 1, duration: 500 });
    const cx = GAME_W / 2;
    const cy = 236;
    const phone = this.add.container(cx, cy).setDepth(D + 1).setAlpha(0);
    const g = this.add.graphics();
    // 화면 빛 + 몸통 + 화면 (한국외대 남색)
    g.fillStyle(0x78aaff, 0.08);
    g.fillRoundedRect(-142, -212, 284, 424, 48);
    g.fillStyle(0x111318, 1);
    g.fillRoundedRect(-120, -190, 240, 380, 34);
    g.lineStyle(3, 0x2a3140, 1);
    g.strokeRoundedRect(-120, -190, 240, 380, 34);
    g.fillStyle(0x14294f, 1);
    g.fillRoundedRect(-108, -178, 216, 356, 24);
    // 알람 종 (금색)
    const bell = this.add.graphics();
    bell.fillStyle(0xf5c542, 1);
    bell.fillCircle(0, -10, 17);
    bell.fillRect(-17, -10, 34, 18);
    bell.fillTriangle(-17, 4, -24, 14, -17, 14);
    bell.fillTriangle(17, 4, 24, 14, 17, 14);
    bell.fillRect(-24, 12, 48, 5);
    bell.fillCircle(0, 22, 5);
    bell.fillCircle(0, -28, 3);
    bell.setPosition(0, -66);
    const time = this.add.text(0, 0, '오전 7:00 · 출근 알람', { fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const btn = (x: number, text: string, fill: number | null, color: string) => {
      const b = this.add.container(x, 64);
      const bg = this.add.graphics();
      if (fill !== null) {
        bg.fillStyle(fill, 1);
        bg.fillRoundedRect(-44, -18, 88, 36, 18);
      } else {
        bg.lineStyle(2, 0xffffff, 0.55);
        bg.strokeRoundedRect(-44, -18, 88, 36, 18);
      }
      b.add([bg, this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color }).setOrigin(0.5)]);
      return b;
    };
    const snooze = btn(-50, '다시 알림', null, '#ffffff');
    const off = btn(50, '끄기', 0xf5c542, '#14294f');
    phone.add([g, bell, time, snooze, off]);
    this.tweens.add({ targets: phone, alpha: 1, duration: 500, delay: 200 });
    // 울리는 동안 휴대폰이 떨리고 종이 흔들린다
    const buzz = this.tweens.add({ targets: phone, x: cx + 3, angle: 0.8, duration: 70, yoyo: true, repeat: -1 });
    const ring = this.tweens.add({ targets: bell, angle: { from: -14, to: 14 }, duration: 250, yoyo: true, repeat: -1 });
    // 끄기 (모양만 눌린다)
    this.time.delayedCall(2600, () => {
      buzz.stop();
      ring.stop();
      phone.setPosition(cx, cy).setAngle(0);
      bell.setAngle(0);
      this.tweens.add({ targets: off, scale: 0.9, duration: 90, yoyo: true });
    });
    const say = (at: number, text: string, y: number, color: string) =>
      this.time.delayedCall(at, () => {
        const t = this.add
          .text(cx, y + 8, text, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color, stroke: '#000000', strokeThickness: 4 })
          .setOrigin(0.5)
          .setDepth(D + 2)
          .setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, y, duration: 600 });
      });
    say(2900, '…꿈이었다.', 466, '#ffffff');
    say(4400, '오늘도 출근합니다.', 504, '#f5c542');
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
      ['(꿈속 기록)', '15px', '#c9d3e6'],
      [onTime ? `퇴근 시각 ${clockText(Math.max(clock, OFF_HOURS))} · 정시 퇴근!` : `퇴근 시각 ${clockText(clock)} · ${over}분 초과근무`, '22px', onTime ? '#7CFC9A' : '#ff8a8a'],
      [`근무평정 ${grades}`, '18px', '#ffffff'],
      ['', '10px', '#ffffff'],
      ['Three Party Problem', '14px', '#c9d3e6'],
      ['배경은 서울캠퍼스 실제 건물을 블록으로 그렸습니다 · 로고: 한국외국어대학교 UI', '13px', '#c9d3e6'],
      ['', '10px', '#ffffff'],
      ['Enter 또는 화면을 눌러 이름 남기기', '18px', '#f5c542'],
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
    } else {
      hp.armF = 0.08 + s * 0.04;
    }
    this.hero.update(dt, hp, 16);

    if (this.t > 1.5 && this.controls.consume('confirm')) this.toRecord();
  }
}
