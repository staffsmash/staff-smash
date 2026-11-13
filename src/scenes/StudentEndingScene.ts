import Phaser from 'phaser';
import { FONT, GAME_H, GAME_W, OFF_HOURS, clockText } from '../config';
import { studentHeroById, type StudentHeroLook } from '../data/students';
import { Controls } from '../input/Controls';
import { neutralPose, type Pose, type Rig } from '../entities/Rig';
import { createPresidentPortrait, createPresidentRig, createStudentHeroRig } from '../entities/rigs';
import { gpaText } from '../grade';
import { HUFS_KEYS, HUFS_NAVY, hufsImage } from '../hufs';
import { lateMin, onTime, runClock, type RunState } from '../run';
import { fadeTo } from '../ui/button';
import { drawPresidentOfficeBackdrop } from './background';

// 학생 모드 엔딩 (PRD 2절): 본관 앞에서 프레지던트 캉이 졸업장에 "승인" 도장을 쾅 찍어 준다.
// 주인공이 환호하는 순간 알람이 울리고 화면이 흔들린다 — 꿈이었다. 오늘은 수강신청 날이다.

/** 침실 장면의 깊이 (꿈 장면 위를 통째로 덮는다) */
const D_ROOM = 2000;
const D_SUMMARY = 2200;

export class StudentEndingScene extends Phaser.Scene {
  private controls!: Controls;
  private run!: RunState;
  private hero!: Rig;
  private pres!: Rig;
  private presX = GAME_W + 80;
  private presTarget = GAME_W + 80;
  private presArm = 0;
  private heroPose: 'idle' | 'cheer' | 'sleep' | 'shock' = 'idle';
  private t = 0;
  private leaving = false;
  /** 침실로 넘어간 뒤 */
  private awake = false;
  private bedHero: Rig | null = null;
  private ringT: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('studentEnding');
  }

  create(data: { run: RunState }): void {
    this.run = data.run;
    this.t = 0;
    this.leaving = false;
    this.awake = false;
    this.bedHero = null;
    this.ringT = null;
    this.presX = GAME_W + 80;
    this.presTarget = GAME_W + 80;
    this.presArm = 0;
    this.heroPose = 'idle';
    this.controls = new Controls();
    // 카메라(흔들림·기울기)는 장면을 다시 시작하면 새로 만들어지므로 따로 되돌리지 않는다
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());
    this.cameras.main.fadeIn(400, 0, 0, 0);
    const name = studentHeroById(this.run.hero).name;
    const look = studentHeroById(this.run.hero).look;

    // 해 질 녘 본관 앞 (프레지던트 캉이 본관에서 내려온다)
    drawPresidentOfficeBackdrop(this);

    this.hero = createStudentHeroRig(this, look);
    this.hero.root.setPosition(330, 440).setScale(1.3).setDepth(440);
    this.pres = createPresidentRig(this);
    this.pres.root.setPosition(this.presX, 440).setScale(-1.4, 1.4).setDepth(441);

    this.line(300, `${name}: "서류 제출했습니다, 졸업 승인해 주세요!"`);
    this.time.delayedCall(2000, () => {
      this.presTarget = 600;
      const portrait = createPresidentPortrait(this, 830, 200).setDepth(900).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: portrait, alpha: 1, duration: 300 });
      this.time.delayedCall(5400, () => this.tweens.add({ targets: portrait, alpha: 0, duration: 300 }));
    });
    this.line(2600, '프레지던트 캉: "졸업 서류, 이제 다 갖췄네요. 졸업 승인합니다."');
    this.time.delayedCall(4400, () => this.showDiploma(name));
    this.time.delayedCall(5700, () => this.stamp());
    this.time.delayedCall(6200, () => (this.heroPose = 'cheer'));
    this.line(6200, `${name}: "졸업이다!"`, '#7CFC9A', 24);
    this.time.delayedCall(8200, () => this.alarm());
    this.time.delayedCall(9900, () => this.wakeUp(look));
    this.time.delayedCall(15400, () => this.summary());
  }

  /** 화면 위쪽 대사 한 줄 (잠깐 떴다가 사라진다) */
  private line(at: number, text: string, color = '#ffffff', size = 20): void {
    this.time.delayedCall(at, () => {
      if (this.awake) return;
      const tt = this.add
        .text(GAME_W / 2, 64, text, {
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
  }

  /** 졸업장 (학교 심벌, 졸업장, 주인공 이름) */
  private diploma!: Phaser.GameObjects.Container;

  private showDiploma(name: string): void {
    const W = 340;
    const H = 214;
    const c = this.add.container(GAME_W / 2, 200).setDepth(1050);
    const paper = this.add.rectangle(0, 0, W, H, 0xfbf8f0).setStrokeStyle(5, 0xd9b44a);
    const inner = this.add.rectangle(0, 0, W - 18, H - 18).setStrokeStyle(1.5, 0xd9b44a);
    c.add([this.add.rectangle(5, 6, W, H, 0x000000, 0.25), paper, inner]);
    const add = (o: Phaser.GameObjects.GameObject | null) => {
      if (o) c.add(o);
    };
    // 이미지는 장면에 바로 놓이므로 컨테이너로 옮긴다
    add(hufsImage(this, HUFS_KEYS.emblem, 0, 0, { h: 140, alpha: 0.07 }));
    add(hufsImage(this, HUFS_KEYS.emblem, 0, -76, { h: 30 }));
    const ink = '#1d1d22';
    c.add(this.add.text(0, -46, '졸 업 장', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: ink }).setOrigin(0.5));
    c.add(this.add.text(0, -14, `성명  ${name}`, { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: ink }).setOrigin(0.5));
    c.add(
      this.add
        .text(0, 18, '위 사람은 반려된 졸업 서류를 끝까지 들고\n총장실까지 찾아왔으므로 이 증서를 수여함.', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#374151',
          align: 'center',
          lineSpacing: 3,
        })
        .setOrigin(0.5),
    );
    // 아래: 왼쪽 학교 국문 로고타입, 오른쪽 도장 자리
    add(hufsImage(this, HUFS_KEYS.wordmark, -150, 76, { w: 112, tint: HUFS_NAVY, originX: 0 }));
    c.add(this.add.text(150, 76, '총장  프레지던트 캉', { fontFamily: FONT, fontSize: '12px', fontStyle: 'bold', color: ink }).setOrigin(1, 0.5));
    c.setAlpha(0).setScale(0.6);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, ease: 'Back.Out' });
    this.diploma = c;
  }

  /** 졸업장 위에 큰 빨간 "승인" 도장 */
  private stamp(): void {
    this.presArm = 1;
    this.time.delayedCall(250, () => (this.presArm = 0));
    const color = 0xd0202f;
    // 총장 이름 위에 찍는다 (주인공 이름은 가리지 않는다)
    const s = this.add.container(98, 64);
    const g = this.add.graphics();
    g.lineStyle(6, color, 1);
    g.strokeRoundedRect(-70, -36, 140, 72, 12);
    g.lineStyle(2.5, color, 1);
    g.strokeRoundedRect(-60, -27, 120, 54, 8);
    s.add([g, this.add.text(0, 0, '승인', { fontFamily: FONT, fontSize: '42px', fontStyle: 'bold', color: '#d0202f' }).setOrigin(0.5)]);
    this.diploma.add(s);
    s.setRotation(-0.16).setScale(2.6).setAlpha(0);
    this.tweens.add({
      targets: s,
      scale: 1,
      alpha: 0.92,
      duration: 160,
      ease: 'Quad.In',
      onComplete: () => this.cameras.main.shake(180, 0.014),
    });
  }

  /** 알람이 울리고 꿈이 흔들린다 */
  private alarm(): void {
    const ring = this.add
      .text(GAME_W / 2, 360, '따르릉! 따르릉!', {
        fontFamily: FONT,
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#111318',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(1500);
    this.ringT = ring;
    this.tweens.add({ targets: ring, scale: 1.15, yoyo: true, repeat: -1, duration: 110 });
    this.time.addEvent({ delay: 220, repeat: 6, callback: () => this.ringWaves(GAME_W / 2, 360, 1400) });
    const cam = this.cameras.main;
    cam.shake(1600, 0.01);
    // 꿈이 일렁이듯 화면이 좌우로 기울고 살짝 커진다
    this.tweens.add({ targets: cam, rotation: 0.04, duration: 140, yoyo: true, repeat: 5, ease: 'Sine.InOut' });
    this.tweens.add({ targets: cam, zoom: 1.08, duration: 1600, ease: 'Sine.In' });
  }

  private ringWaves(x: number, y: number, depth: number): void {
    for (let i = 0; i < 2; i++) {
      const e = this.add.ellipse(x, y, 60, 26).setStrokeStyle(3, 0xffd34d, 1).setDepth(depth);
      this.tweens.add({
        targets: e,
        scaleX: 3.4,
        scaleY: 3.4,
        alpha: 0,
        delay: i * 90,
        duration: 360,
        onComplete: () => e.destroy(),
      });
    }
  }

  /** 침실로 바뀐다. 알람 시계가 울리고, 주인공이 벌떡 일어난다 */
  private wakeUp(look: StudentHeroLook): void {
    this.awake = true;
    this.ringT?.destroy();
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.resetFX();
    cam.setRotation(0).setZoom(1);
    cam.flash(500, 255, 255, 255);
    this.drawBedroom();

    // 침대에 누운 주인공 (머리가 베개 쪽)
    const r = createStudentHeroRig(this, look);
    r.root.setPosition(262, 386).setScale(1.3).setDepth(D_ROOM + 10);
    this.bedHero = r;
    this.heroPose = 'sleep';
    const p = neutralPose();
    p.body = -Math.PI / 2;
    r.update(1, p, 100);

    // 알람 시계가 계속 울린다
    const clock = this.alarmClock(612, 312);
    this.tweens.add({ targets: clock, angle: { from: -9, to: 9 }, yoyo: true, repeat: -1, duration: 60 });
    const ringEv = this.time.addEvent({ delay: 260, loop: true, callback: () => this.ringWaves(612, 300, D_ROOM + 40) });

    this.time.delayedCall(700, () => {
      this.heroPose = 'shock';
      this.tweens.add({ targets: r.root, x: 214, y: 432, duration: 260, ease: 'Quad.Out' });
      const mark = this.add
        .text(214, 268, '!?', { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#d0202f', stroke: '#ffffff', strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(D_ROOM + 50)
        .setScale(0.2);
      this.tweens.add({ targets: mark, scale: 1, duration: 200, delay: 200, ease: 'Back.Out' });
    });
    this.subtitle(1000, 468, '…꿈이었다.', '#ffffff', 26);
    this.time.delayedCall(2400, () => {
      // 알람을 끈다
      ringEv.remove();
      this.tweens.killTweensOf(clock);
      clock.setAngle(0);
    });
    this.subtitle(2600, 508, '오늘은 수강신청 날이다.', '#ffe066', 30);
  }

  /** 침실 아래쪽 자막 (사라지지 않는다) */
  private subtitle(at: number, y: number, text: string, color: string, size: number): void {
    this.time.delayedCall(at, () => {
      const t = this.add
        .text(GAME_W / 2, y, text, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color,
          stroke: '#111318',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(D_ROOM + 100)
        .setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 300 });
    });
  }

  /** 블록형 자취방: 벽·창문·학교 포스터·달력·침대·협탁 */
  private drawBedroom(): void {
    const g = this.add.graphics().setDepth(D_ROOM);
    // 벽과 바닥
    g.fillStyle(0xe8dcc8).fillRect(0, 0, GAME_W, 400);
    g.fillStyle(0xdccfb8);
    for (let x = 0; x < GAME_W; x += 48) g.fillRect(x, 0, 2, 400);
    g.fillStyle(0xbfa98a).fillRect(0, 396, GAME_W, 10);
    g.fillStyle(0xa87a50).fillRect(0, 406, GAME_W, GAME_H - 406);
    g.fillStyle(0x94683f);
    for (let y = 430; y < GAME_H; y += 26) g.fillRect(0, y, GAME_W, 2);
    for (let i = 0; i < 12; i++) g.fillRect(((i * 173) % GAME_W) + (i % 2) * 40, 406 + (i % 5) * 26, 2, 26);

    // 창문: 아침 햇살
    g.fillStyle(0x6b8fd6).fillRect(672, 52, 26, 196).fillRect(882, 52, 26, 196);
    g.fillStyle(0xffffff).fillRect(694, 60, 192, 174);
    g.fillStyle(0xbfe6ff).fillRect(702, 68, 176, 158);
    g.fillStyle(0xdff3ff).fillRect(702, 150, 176, 76);
    g.fillStyle(0xfff3b0).fillCircle(830, 112, 24);
    g.fillStyle(0xffffff).fillRect(786, 68, 6, 158).fillRect(702, 144, 176, 6);
    g.fillStyle(0x5a4632).fillRect(664, 46, 252, 8);

    // 학교 포스터 (남색 바탕 + 흰 심벌·HUFS)
    g.fillStyle(0x7a6a55).fillRect(374, 70, 4, 6);
    g.fillStyle(HUFS_NAVY).fillRect(330, 78, 92, 124);
    g.lineStyle(2, 0x1d1d22, 1).strokeRect(330, 78, 92, 124);
    hufsImage(this, HUFS_KEYS.line, 376, 124, { h: 58, tint: 0xffffff, depth: D_ROOM + 1 });
    const type = hufsImage(this, HUFS_KEYS.type, 376, 178, { h: 16, tint: 0xffffff, depth: D_ROOM + 1 });
    if (!type) {
      this.add.text(376, 178, 'HUFS', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(D_ROOM + 1);
    }

    // 달력: 오늘 날짜에 빨간 동그라미
    const calX = 470;
    const calY = 92;
    g.fillStyle(0xffffff).fillRect(calX, calY, 132, 128);
    g.lineStyle(2, 0x1d1d22, 1).strokeRect(calX, calY, 132, 128);
    g.fillStyle(0xd0202f).fillRect(calX, calY, 132, 28);
    g.fillStyle(0xd9d9d9);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) g.fillRect(calX + 10 + col * 23, calY + 38 + row * 21, 16, 12);
    }
    g.lineStyle(3, 0xd0202f, 1).strokeCircle(calX + 10 + 2 * 23 + 8, calY + 38 + 2 * 21 + 6, 13);
    this.add
      .text(calX + 66, calY + 14, '수강신청일', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(D_ROOM + 1);

    // 침대: 머리판·매트리스·베개 (이불은 주인공 위에 덮는다)
    g.fillStyle(0x7a4a2a).fillRect(54, 292, 30, 150);
    g.lineStyle(2, 0x1d1d22, 1).strokeRect(54, 292, 30, 150);
    g.fillStyle(0x8b5a2b).fillRect(60, 404, 470, 38);
    g.strokeRect(60, 404, 470, 38);
    g.fillStyle(0xf4f4f4).fillRect(80, 378, 446, 28);
    g.fillStyle(0xffffff).fillRect(88, 352, 92, 30);
    g.strokeRect(88, 352, 92, 30);
    const blanket = this.add.graphics().setDepth(D_ROOM + 20);
    blanket.fillStyle(0x4f7cc4).fillRect(182, 370, 346, 62);
    blanket.lineStyle(2, 0x1d1d22, 1).strokeRect(182, 370, 346, 62);
    blanket.fillStyle(0x7fa3dd).fillRect(184, 372, 342, 12);
    blanket.fillStyle(0x3f69ad);
    for (let x = 230; x < 520; x += 58) blanket.fillRect(x, 388, 22, 22);

    // 협탁
    g.fillStyle(0x8b5a2b).fillRect(560, 338, 104, 104);
    g.lineStyle(2, 0x1d1d22, 1).strokeRect(560, 338, 104, 104);
    g.lineBetween(560, 388, 664, 388);
    g.fillStyle(0xd9b44a).fillRect(606, 358, 12, 6).fillRect(606, 410, 12, 6);
  }

  /** 블록형 자명종 (빨간 몸통, 금색 종 두 개, 7시) */
  private alarmClock(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(D_ROOM + 30);
    const g = this.add.graphics();
    g.fillStyle(0x1d1d22).fillRect(-22, 20, 8, 8).fillRect(14, 20, 8, 8);
    g.fillStyle(0xd9b44a).fillRect(-30, -40, 22, 14).fillRect(8, -40, 22, 14);
    g.lineStyle(2, 0x1d1d22, 1).strokeRect(-30, -40, 22, 14).strokeRect(8, -40, 22, 14);
    g.fillStyle(0x1d1d22).fillRect(-2, -42, 4, 14);
    g.fillStyle(0xd0202f).fillRect(-30, -28, 60, 50);
    g.strokeRect(-30, -28, 60, 50);
    g.fillStyle(0xffffff).fillRect(-22, -20, 44, 34);
    g.strokeRect(-22, -20, 44, 34);
    // 시곗바늘: 7시 정각
    g.fillStyle(0x1d1d22).fillRect(-1.5, -16, 3, 15);
    g.fillStyle(0x1d1d22).fillRect(-1, -3, 3, 3);
    c.add(g);
    const hour = this.add.rectangle(0, -2, 3, 11, 0x1d1d22).setOrigin(0.5, 0).setRotation(Math.PI / 6);
    c.add(hour);
    return c;
  }

  private summary(): void {
    const clock = runClock(this.run);
    const left = Math.ceil(OFF_HOURS - clock);
    const arrive = onTime(clock)
      ? left > 0
        ? `도착 시각 ${clockText(clock)} · 본관 마감 ${left}분 전!`
        : `도착 시각 ${clockText(clock)} · 본관 마감 시각에 딱 맞췄다!`
      : `도착 시각 ${clockText(clock)} · 본관 마감 ${lateMin(clock)}분 지남`;
    const dim = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.88).setDepth(D_SUMMARY).setAlpha(0);
    this.tweens.add({ targets: dim, alpha: 1, duration: 400 });
    const grades = this.run.stages.map((s) => s.grade);
    const lines: [string, string, string][] = [
      ['학생 모드 완료', '34px', '#f5c542'],
      [arrive, '22px', onTime(clock) ? '#7CFC9A' : '#ff8a8a'],
      [`최종 GPA ${gpaText(grades)} / 4.5`, '22px', '#ffffff'],
      [`학점 ${grades.join(' · ') || '-'}`, '18px', '#ffffff'],
      ['', '10px', '#ffffff'],
      ['Staff Smash: HUFS (비공식 게임)', '14px', '#c9d3e6'],
      ['프레지던트 캉을 제외한 인물과 부서는 모두 가상입니다', '13px', '#c9d3e6'],
      ['배경은 서울캠퍼스 실제 건물을 블록으로 그렸습니다 · 로고: 한국외국어대학교 UI', '13px', '#c9d3e6'],
      ['', '10px', '#ffffff'],
      ['Enter 또는 화면을 눌러 기록 남기기', '18px', '#f5c542'],
    ];
    let y = 100;
    for (const [text, size, color] of lines) {
      const t = this.add
        .text(GAME_W / 2, y, text, { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color })
        .setOrigin(0.5)
        .setDepth(D_SUMMARY + 1)
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
    const dt = Math.min(deltaMs, 50) / 1000;
    this.t += dt;
    if (!this.awake) {
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
    }

    const hp: Pose = neutralPose();
    const s = Math.sin(this.t * 6);
    if (this.heroPose === 'cheer') {
      hp.armF = -2.9;
      hp.armB = -2.9;
      hp.bob = -Math.abs(s) * 10;
    } else if (this.heroPose === 'sleep') {
      hp.body = -Math.PI / 2;
      hp.armF = 0.2;
    } else if (this.heroPose === 'shock') {
      // 머리를 감싸 쥔다
      hp.armF = -2.7 + Math.sin(this.t * 30) * 0.08;
      hp.armB = -2.5;
    } else {
      hp.armF = 0.08 + s * 0.04;
    }
    if (this.bedHero) this.bedHero.update(dt, hp, this.heroPose === 'shock' ? 12 : 16);
    else this.hero.update(dt, hp, 16);

    if (this.t > 1.5 && this.controls.consume('confirm')) this.toRecord();
  }
}
