import Phaser from 'phaser';
import { DEPTH_RANGE, FLOOR_BOTTOM, FLOOR_TOP, FONT, GAME_W } from '../config';
import type { HeroId } from '../data/heroes';
import { MACRO_CAP, MACRO_SHOTS, VISIT_DMG, VISIT_SEC, VISIT_STAMPS, VISIT_WARN, type VisitDef } from '../data/visits';
import type { StageScene } from '../scenes/StageScene';
import { Enemy } from './Enemy';
import type { HitInfo } from './Fighter';
import { DEPTH_SPEED, WALK, type Player } from './Player';
import { neutralPose, type Pose } from './Rig';
import { INK } from './rigs';
import {
  BOOK_COLORS,
  CURSOR_TIP_ANGLE,
  createCoverLetter,
  createCursor,
  createFistFlame,
  createFloorX,
  createGuitarCase,
  createMovingBox,
  createOverdueBook,
  createRocketFist,
  createVisitorRig,
} from './visitRigs';
import * as fx from '../fx';
import { play } from '../sound';

// 교직원별 돌발 방문 상대 (교직원 모드 2D, 2026-11-25 사용자 결정 — data/visits.ts).
// - 화면 끝에서 빠르게 들어오며 등장 대사. 도착한 때부터 20초.
// - 사람이라 다치지 않는다: 맞으면 머리 위 결재판이 한 칸(필살기·보상 아이템은 HitInfo.stamps칸) 찬다. 10칸이면 성공.
// - 공격은 모두 약 0.8초 예고 뒤에 나가고 피할 수 있다. 한 번 맞으면 피해 2 + 넘어짐 (매크로 학생 커서만 한 발 1, 한 번 연사에 최대 2).
// - 성공: 성공 대사 → 떠나면서 보상 상자. 실패(20초): 실패 대사 → 떠난다 (보상 없음).
// 날아가는 공격물은 상대가 직접 갖고 다닌다(Shot) — 끝나면 함께 거둔다.

type Container = Phaser.GameObjects.Container;

/** 빠르게 등장하는 속도 (px/s) */
const ENTER_V = 520;
/** 도착한 뒤 첫 공격까지 (초) */
const FIRST_ATTACK = 2.2;
/** 성공·실패 대사를 하고 서 있는 시간 (초). 그 뒤 떠나며 (성공이면) 보상 상자를 떨어뜨린다 */
const DONE_SEC = 1.5;

/** 공격 주기(초)와 손을 드는 예고(초). 대사님 5초·매크로 학생 약 4.5초는 사용자 확정, 나머지는 비슷하게 맞췄다.
 *  실사 위원은 ✘ 표시가 곧 0.8초 예고다. 연체 대학원생은 던진 뒤 떨어질 자리의 그림자(0.85초)가 예고라 손 드는 시간은 짧다 */
const CYCLE: Record<HeroId, { every: number; wind: number }> = {
  kimgukje: { every: 5, wind: VISIT_WARN },
  ohakjongji: { every: 4.5, wind: VISIT_WARN },
  leejinchwi: { every: 4.2, wind: VISIT_WARN },
  choijanghak: { every: 3.8, wind: VISIT_WARN },
  parkhaksa: { every: 4, wind: VISIT_WARN },
  kimsikdang: { every: 4, wind: 0.45 },
};

/** 대사님 옆걸음: 플레이어 걸음(213·깊이 140)의 1.4배 */
const AMB_VX = WALK * 1.4;
const AMB_VY = DEPTH_SPEED * 1.4;
/** 로켓 펀치: 주먹이 나가는 데 0.6초, 돌아오는 데 0.6초 (그동안 대사님은 팔 없이 멈칫 — 약 1.2초) */
const FIST_OUT = 0.6;
const FIST_BACK = 0.6;
/** 나머지 상대의 걸음 (플레이어보다 느려서 따라잡을 수 있다) */
const SLOW_VX = 115;
const SLOW_VY = 85;
/** 플레이어에게서 두려는 거리 (px) */
const KEEP: Record<HeroId, number> = { kimgukje: 0, ohakjongji: 250, leejinchwi: 270, choijanghak: 290, parkhaksa: 170, kimsikdang: 240 };
/** 곧게 나가는 공격(장풍·굴리기)은 깊이를 맞출 때까지 이만큼 기다린다 (초) */
const ALIGN_WAIT = 1.4;
/** 자소서 장풍: 깊이 방향 반폭 (처음 → 퍼진 뒤), 속도 */
const WAVE_HALF0 = 30;
const WAVE_HALF1 = 56;
const WAVE_V = 330;
/** 이삿짐·통기타 굴리기 속도 */
const ROLL_V = 360;
/** 마우스 커서 속도, 부채꼴 반각 (라디안) */
const CURSOR_V = 330;
const FAN = 0.65;
/** ✘ 표시가 터지는 반지름 */
const MARK_R = 46;
/** 책: 날아가는 시간(떨어질 자리의 그림자 예고), 맞는 반경 */
const BOOK_T = 0.85;
const BOOK_R = 34;

/** 결재판 크기 */
const BOARD_H = 42;
const CELL = 11;

/** 방문 상대가 쏜 것 하나. update가 false면 끝났다 (부르는 쪽이 destroy) */
interface Shot {
  update(dt: number): boolean;
  destroy(): void;
}

/** 플레이어를 친다: 0 = 맞을 수 없는 상태(지나간다), 1 = 막혔다(결재판·연차 쿠폰·안전지대 — 공격은 사라진다), 2 = 맞았다 */
function strike(scene: StageScene, fromX: number, dmg: number, knockdown: boolean): 0 | 1 | 2 {
  const p = scene.player;
  if (!p.hittable) return 0;
  const dir = p.x >= fromX ? 1 : -1;
  if (!p.takeHit({ dmg, dir, kb: knockdown ? 200 : 90, knockdown })) return 1;
  fx.hitSpark(scene, p.x, p.y - p.z - 60);
  return 2;
}

/** 높이 z로 날아가는 것이 플레이어에 닿았는지 (점프하면 피한다) */
function touches(p: Player, x: number, y: number, z: number, halfW: number): boolean {
  return Math.abs(x - p.x) <= halfW + p.halfW && Math.abs(y - p.y) <= DEPTH_RANGE && z >= p.z - 10 && z <= p.z + 80;
}

function offView(scene: Phaser.Scene, x: number): boolean {
  const left = scene.cameras.main.scrollX;
  return x < left - 80 || x > left + GAME_W + 80;
}

// ---------- 공격물 ----------

/** 로켓 펀치: 팔에서 떨어진 주먹이 겨눈 자리로 일직선 → 팔로 돌아온다 (돌아올 때는 맞지 않는다) */
class FistShot implements Shot {
  private x: number;
  private y: number;
  private readonly z = 62;
  private readonly vx: number;
  private readonly vy: number;
  private t = 0;
  private back = false;
  private hitDone = false;
  private backV = 300;
  private readonly obj: Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(
    private readonly scene: StageScene,
    private readonly owner: Visitor,
    tx: number,
    ty: number,
  ) {
    const s = owner.shoulder();
    this.x = s.x;
    this.y = s.y;
    const dx = tx - s.x;
    const dy = ty - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Phaser.Math.Clamp(d + 60, 160, 420) / FIST_OUT;
    this.vx = (dx / d) * speed;
    this.vy = (dy / d) * speed;
    this.obj = createRocketFist(scene).setScale(Math.sign(this.vx) || owner.facing, 1);
    this.shadow = scene.add.ellipse(this.x, this.y, 30, 8, 0x000000, 0.22).setDepth(-5);
    this.sync();
  }

  update(dt: number): boolean {
    this.t += dt;
    const p = this.scene.player;
    if (!this.back) {
      this.x += this.vx * dt;
      this.y = Phaser.Math.Clamp(this.y + this.vy * dt, FLOOR_TOP, FLOOR_BOTTOM);
      // 맞혀도 끝까지 나갔다가 돌아온다 (팔 없이 멈칫하는 빈틈이 늘 약 1.2초)
      if (!this.hitDone && touches(p, this.x, this.y, this.z, 16) && strike(this.scene, this.x - this.vx * 0.05, VISIT_DMG, true) > 0) {
        this.hitDone = true;
      }
      if (this.t >= FIST_OUT) this.turn();
    } else {
      const s = this.owner.shoulder();
      const dx = s.x - this.x;
      const dy = s.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.backV * dt;
      if (d <= step + 2) return false;
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    this.sync();
    return true;
  }

  private turn(): void {
    if (this.back) return;
    this.back = true;
    const s = this.owner.shoulder();
    this.backV = Math.max(260, Math.hypot(s.x - this.x, s.y - this.y) / FIST_BACK);
  }

  private sync(): void {
    this.obj.setPosition(this.x, this.y - this.z).setDepth(this.y + 1);
    this.shadow.setPosition(this.x, this.y);
  }

  destroy(): void {
    this.obj.destroy();
    this.shadow.destroy();
  }
}

/** 마우스 커서 한 발 (한 발 1, 한 번 연사에 받는 피해는 burst로 최대 MACRO_CAP) */
class CursorShot implements Shot {
  private x: number;
  private y: number;
  private readonly z = 44;
  private ttl = 2.4;
  private readonly obj: Container;

  constructor(
    private readonly scene: StageScene,
    x: number,
    y: number,
    private readonly vx: number,
    private readonly vy: number,
    private readonly burst: { taken: number },
  ) {
    this.x = x;
    this.y = y;
    this.obj = createCursor(scene).setRotation(Math.atan2(vy, vx) - CURSOR_TIP_ANGLE);
    this.sync();
  }

  update(dt: number): boolean {
    this.ttl -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.ttl <= 0 || this.y < FLOOR_TOP - 20 || this.y > FLOOR_BOTTOM + 20 || offView(this.scene, this.x)) return false;
    const p = this.scene.player;
    if (this.burst.taken < MACRO_CAP && touches(p, this.x, this.y, this.z, 8)) {
      const r = strike(this.scene, this.x - Math.sign(this.vx) * 10, 1, false);
      if (r === 2) this.burst.taken++;
      if (r > 0) return false;
    }
    this.sync();
    return true;
  }

  private sync(): void {
    this.obj.setPosition(this.x, this.y - this.z).setDepth(this.y + 1);
  }

  destroy(): void {
    this.obj.destroy();
  }
}

/** 자소서 장풍: 종이가 깊이 방향으로 넓게 퍼지며 곧게 날아가는 파동 (위아래로 비켜서 피한다) */
class WaveShot implements Shot {
  private x: number;
  private t = 0;
  private half = WAVE_HALF0;
  private hitDone = false;
  private readonly band: Phaser.GameObjects.Ellipse;
  private readonly papers: { obj: Container; u: number; z: number; dx: number; spin: number }[] = [];

  constructor(
    private readonly scene: StageScene,
    x: number,
    private readonly y: number,
    private readonly dir: number,
  ) {
    this.x = x;
    this.band = scene.add.ellipse(x, y, 46, WAVE_HALF0 * 2, 0xfff3c4, 0.35).setStrokeStyle(2, 0xf5c542, 0.9).setDepth(-3);
    for (let i = 0; i < 9; i++) {
      this.papers.push({
        obj: createCoverLetter(scene),
        u: -1 + (2 * i) / 8,
        z: 14 + ((i * 37) % 70),
        dx: ((i * 13) % 20) - 10,
        spin: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3)),
      });
    }
    this.sync();
  }

  update(dt: number): boolean {
    this.t += dt;
    this.x += this.dir * WAVE_V * dt;
    this.half = WAVE_HALF0 + (WAVE_HALF1 - WAVE_HALF0) * Math.min(1, this.t / 1.1);
    if (offView(this.scene, this.x)) return false;
    const p = this.scene.player;
    if (!this.hitDone && Math.abs(this.x - p.x) <= 20 + p.halfW && Math.abs(p.y - this.y) <= this.half && p.z < 90) {
      if (strike(this.scene, this.x - this.dir * 20, VISIT_DMG, true) > 0) this.hitDone = true;
    }
    for (const q of this.papers) q.obj.rotation += q.spin * dt;
    this.sync();
    return true;
  }

  private sync(): void {
    this.band.setPosition(this.x, this.y).setScale(1, this.half / WAVE_HALF0);
    for (const q of this.papers) {
      const y = this.y + q.u * this.half;
      q.obj.setPosition(this.x + q.dx, y - q.z).setDepth(y + 1);
    }
  }

  destroy(): void {
    this.band.destroy();
    for (const q of this.papers) q.obj.destroy();
  }
}

/** 바닥을 볼링처럼 굴러가는 이삿짐 상자·통기타 케이스 (위아래로 비키거나 점프로 넘는다) */
class RollShot implements Shot {
  private x: number;
  private hitDone = false;
  private readonly obj: Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(
    private readonly scene: StageScene,
    x: number,
    private readonly y: number,
    private readonly dir: number,
    guitar: boolean,
  ) {
    this.x = x;
    this.obj = guitar ? createGuitarCase(scene) : createMovingBox(scene);
    this.shadow = scene.add.ellipse(x, y, 44, 10, 0x000000, 0.25).setDepth(-5);
    this.sync();
  }

  update(dt: number): boolean {
    this.x += this.dir * ROLL_V * dt;
    this.obj.rotation += this.dir * 8 * dt;
    if (offView(this.scene, this.x)) return false;
    const p = this.scene.player;
    if (!this.hitDone && Math.abs(this.x - p.x) <= 20 + p.halfW && Math.abs(p.y - this.y) <= DEPTH_RANGE + 4 && p.z < 26) {
      if (strike(this.scene, this.x - this.dir * 20, VISIT_DMG, true) > 0) this.hitDone = true;
    }
    this.sync();
    return true;
  }

  private sync(): void {
    this.obj.setPosition(this.x, this.y - 18).setDepth(this.y + 1);
    this.shadow.setPosition(this.x, this.y);
  }

  destroy(): void {
    this.obj.destroy();
    this.shadow.destroy();
  }
}

/** 실사 위원의 바닥 ✘ 표시: 0.8초 뒤 터진다 */
class MarkShot implements Shot {
  private t = 0;
  private readonly obj: Container;

  constructor(
    private readonly scene: StageScene,
    private readonly x: number,
    private readonly y: number,
  ) {
    this.obj = createFloorX(scene, MARK_R).setPosition(x, y).setDepth(-3);
  }

  update(dt: number): boolean {
    this.t += dt;
    // 터질 때가 가까울수록 빨리 깜빡인다
    const rate = 6 + (this.t / VISIT_WARN) * 14;
    this.obj.setAlpha(Math.floor(this.t * rate) % 2 === 0 ? 1 : 0.45).setScale(1 + (this.t / VISIT_WARN) * 0.12);
    if (this.t < VISIT_WARN) return true;
    this.explode();
    return false;
  }

  private explode(): void {
    const s = this.scene;
    const ring = s.add.ellipse(this.x, this.y - 10, MARK_R * 2, MARK_R * 1.1, 0xff6b3d, 0.75).setDepth(this.y + 2);
    s.tweens.add({ targets: ring, scaleX: 1.35, scaleY: 1.35, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
    fx.dust(s, this.x, this.y);
    s.cameras.main.shake(80, 0.004);
    play('boom', 0.5);
    const p = s.player;
    if (Math.abs(p.x - this.x) <= MARK_R && Math.abs(p.y - this.y) <= MARK_R * 0.45 && p.z < 40) strike(s, this.x, VISIT_DMG, true);
  }

  destroy(): void {
    this.obj.destroy();
  }
}

/** 연체된 책 한 권: 포물선으로 날아가 떨어진다. 떨어질 자리에 그림자 예고 */
class BookShot implements Shot {
  private t = 0;
  private lieT = -1;
  private readonly obj: Container;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(
    private readonly scene: StageScene,
    private readonly sx: number,
    private readonly sy: number,
    private readonly tx: number,
    private readonly ty: number,
    color: number,
  ) {
    this.obj = createOverdueBook(scene, color);
    this.shadow = scene.add
      .ellipse(tx, ty, BOOK_R * 2, BOOK_R * 0.8, 0x000000, 0.35)
      .setStrokeStyle(2, 0xd0202f, 0.8)
      .setDepth(-3)
      .setScale(0.35);
    this.update(0);
  }

  update(dt: number): boolean {
    this.t += dt;
    if (this.lieT >= 0) {
      this.lieT += dt;
      this.obj.setAlpha(Math.max(0, 1 - this.lieT / 0.5));
      return this.lieT < 0.5;
    }
    const k = Math.min(1, this.t / BOOK_T);
    const x = this.sx + (this.tx - this.sx) * k;
    const y = this.sy + (this.ty - this.sy) * k;
    const z = 70 * (1 - k) + 110 * Math.sin(Math.PI * k);
    this.obj.setPosition(x, y - z - 8).setDepth(y + 1).setRotation(this.obj.rotation + 9 * dt);
    this.shadow.setScale(0.35 + 0.65 * k);
    if (k >= 1) this.land();
    return true;
  }

  private land(): void {
    const s = this.scene;
    this.lieT = 0;
    this.obj.setRotation(0.15).setPosition(this.tx, this.ty - 8);
    this.shadow.setVisible(false);
    fx.dust(s, this.tx, this.ty);
    play('fall', 0.6);
    const p = s.player;
    if (Math.abs(p.x - this.tx) <= BOOK_R && Math.abs(p.y - this.ty) <= 16 && p.z < 30) strike(s, this.tx, VISIT_DMG, true);
  }

  destroy(): void {
    this.obj.destroy();
    this.shadow.destroy();
  }
}

// ---------- 방문 상대 ----------

export class Visitor extends Enemy {
  readonly kind = 'visit' as const;
  readonly usesToken = false;
  readonly halfW = 20;
  readonly height = 106;
  readonly def: VisitDef;
  /** 찍힌 도장 (결재판 칸) */
  stamps = 0;
  /** 남은 시간 (초, 도착한 때부터 센다) */
  timeLeft = VISIT_SEC;
  outcome: 'none' | 'win' | 'lose' = 'none';
  protected speechLift = BOARD_H + 8;
  private started = false;
  private atkT = FIRST_ATTACK;
  private alignT = 0;
  private walkPhase = 0;
  private wpX = 0;
  private wpY = 0;
  private wpT = 0;
  private wpSide = 1;
  private pauseT = 0;
  private laneOff = 0;
  private laneT = 0;
  private aimX = 0;
  private aimY = 0;
  private thrown = 0;
  private rolls = 0;
  private shots: Shot[] = [];
  private fist: FistShot | null = null;
  /** 예고 표시 (겨눈 선·커서 그림자·장풍/굴리기 길) — 쏠 때 지운다 */
  private tele: Phaser.GameObjects.GameObject[] = [];
  private readonly flame: Container | null = null;
  /** 동아리 연합회장이 굴리기 전에 든 짐 [이삿짐 상자, 통기타 케이스] */
  private readonly held: Container[] = [];
  private readonly board: Container;
  private readonly dots: Phaser.GameObjects.Arc[] = [];
  private readonly timeBar: Phaser.GameObjects.Rectangle;
  private readonly okMark: Container;

  constructor(scene: StageScene, def: VisitDef, x: number, y: number, enterTargetX: number) {
    super(scene, x, y, createVisitorRig(scene, def.hero), VISIT_STAMPS, 48, enterTargetX);
    this.def = def;
    this.resumeState = 'move';
    const rig = this.rig;
    if (def.hero === 'kimgukje') {
      this.flame = createFistFlame(scene, rig);
      this.flame.setVisible(false);
      rig.itemF.add(this.flame);
    } else if (def.hero === 'choijanghak') {
      for (const guitar of [false, true]) {
        const c = new Phaser.GameObjects.Container(scene, 0, 0);
        if (guitar) {
          c.add(rig.part(0, -2, 26, 24, 0x1d1f24, 0.5, 0));
          c.add(rig.part(0, -20, 12, 20, 0x1d1f24, 0.5, 0));
        } else {
          c.add(rig.part(0, -4, 32, 28, 0xc8955a, 0.5, 0));
          c.add(rig.part(0, 8, 32, 5, 0xe2cf9a, 0.5, 0, false));
        }
        c.setVisible(false);
        rig.itemF.add(c);
        this.held.push(c);
      }
    }
    // 머리 위 결재판: 제목 + 도장 칸 10개 + 남은 시간 막대
    const b = scene.add.container(x, y).setDepth(1650);
    const title = scene.add
      .text(0, -BOARD_H + 9, def.board, { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#1d1d22' })
      .setOrigin(0.5, 0);
    const cellsW = VISIT_STAMPS * CELL - 2;
    const w = Math.max(cellsW + 16, Math.ceil(title.width) + 18);
    b.add(scene.add.rectangle(0, -BOARD_H / 2, w, BOARD_H, 0x9a6a3a).setStrokeStyle(2, INK));
    b.add(scene.add.rectangle(0, -BOARD_H / 2 + 1, w - 8, BOARD_H - 9, 0xffffff));
    b.add(scene.add.rectangle(0, -BOARD_H + 1, 24, 7, 0x8a8f96).setStrokeStyle(1.5, INK));
    b.add(title);
    for (let i = 0; i < VISIT_STAMPS; i++) {
      const cx = -cellsW / 2 + i * CELL + 4.5;
      b.add(scene.add.rectangle(cx, -13, 9, 9, 0xffffff).setStrokeStyle(1, 0x9aa3ad));
      const dot = scene.add.circle(cx, -13, 4.2, 0xd0202f).setVisible(false);
      b.add(dot);
      this.dots.push(dot);
    }
    this.timeBar = scene.add.rectangle(-cellsW / 2, -6, cellsW, 2, 0xf5c542).setOrigin(0, 0.5);
    b.add(this.timeBar);
    // 성공하면 결재판 위에 찍히는 큰 도장
    this.okMark = scene.add.container(0, -BOARD_H / 2).setVisible(false);
    const ring = scene.add.circle(0, 0, 17).setStrokeStyle(3, 0xd0202f);
    ring.isFilled = false;
    this.okMark.add([ring, scene.add.text(0, 0, '결재', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#d0202f' }).setOrigin(0.5)]);
    this.okMark.setRotation(-0.3);
    b.add(this.okMark);
    this.board = b;
    this.say(def.lines.enter, 2.6);
    this.sync();
    this.syncBoard();
  }

  /** 도착해서 시간이 흐르고, 결재가 아직 끝나지 않았다 */
  get active(): boolean {
    return this.started && this.outcome === 'none';
  }

  get hittable(): boolean {
    return this.active && super.hittable;
  }

  /** 앞 어깨 (로켓 펀치가 떨어져 나가고 돌아오는 자리) */
  shoulder(): { x: number; y: number } {
    return { x: this.x + this.facing * 16, y: this.y };
  }

  update(dt: number, player: Player): void {
    super.update(dt, player);
    if (this.removed) return;
    this.shots = this.shots.filter((s) => {
      if (s.update(dt)) return true;
      s.destroy();
      if (s === this.fist) this.armBack();
      return false;
    });
    this.syncBoard();
  }

  protected move(dt: number): boolean {
    // 빠르게 등장 (도착 자리에서 딱 멈춘다)
    if (this.state === 'enter') {
      const dx = this.enterTargetX - this.x;
      this.vx = Math.sign(dx) * Math.min(ENTER_V, Math.abs(dx) / Math.max(dt, 1e-3));
    }
    return super.move(dt);
  }

  protected think(dt: number, player: Player): void {
    if (!this.started) {
      this.started = true;
      this.newWaypoint(player);
    }
    if (this.state === 'done') {
      this.vx = 0;
      this.vy = 0;
      if (this.stateT >= DONE_SEC) this.leave();
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.finish(false);
      return;
    }
    this.atkT -= dt;
    const cyc = CYCLE[this.def.hero];
    switch (this.state) {
      case 'move':
        this.moveAI(dt, player);
        if (this.atkT <= 0 && player.targetable) {
          if (this.aligned(player)) this.startAttack(player);
          else this.alignT += dt;
        }
        break;
      case 'wind':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= cyc.wind) this.fire(player);
        break;
      case 'fire':
        this.vx = 0;
        this.vy = 0;
        this.updateFire(player);
        break;
    }
  }

  // ---------- 움직임 ----------

  private moveAI(dt: number, p: Player): void {
    const left = this.scene.cameras.main.scrollX;
    this.facing = p.x >= this.x ? 1 : -1;
    if (this.def.hero === 'kimgukje') {
      // 플레이어 둘레를 빠르게 옆걸음 (위아래 줄·좌우로)
      this.wpT -= dt;
      if (this.pauseT > 0) {
        this.pauseT -= dt;
        this.vx = 0;
        this.vy = 0;
        return;
      }
      const dx = this.wpX - this.x;
      const dy = this.wpY - this.y;
      if (this.wpT <= 0 || (Math.abs(dx) < 8 && Math.abs(dy) < 6)) {
        this.pauseT = 0.2;
        this.newWaypoint(p);
        this.vx = 0;
        this.vy = 0;
        return;
      }
      this.vx = Math.abs(dx) > 6 ? Math.sign(dx) * Math.min(AMB_VX, Math.abs(dx) / dt) : 0;
      this.vy = Math.abs(dy) > 4 ? Math.sign(dy) * Math.min(AMB_VY, Math.abs(dy) / dt) : 0;
      return;
    }
    // 나머지: 자기 거리를 두고 선다 (플레이어보다 느려서 따라가면 붙을 수 있다)
    const straight = this.def.hero === 'leejinchwi' || this.def.hero === 'choijanghak';
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneOff = Phaser.Math.Between(-50, 50);
      this.laneT = Phaser.Math.FloatBetween(1.5, 2.5);
    }
    const side = this.x >= p.x ? 1 : -1;
    const wantX = Phaser.Math.Clamp(p.x + side * KEEP[this.def.hero], left + 60, left + GAME_W - 60);
    const wantY = Phaser.Math.Clamp(p.y + (straight ? 0 : this.laneOff), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
    const mx = wantX - this.x;
    const my = wantY - this.y;
    this.vx = Math.abs(mx) > 10 ? Math.sign(mx) * SLOW_VX : 0;
    this.vy = Math.abs(my) > 3 ? Math.sign(my) * Math.min(SLOW_VY, Math.abs(my) / dt) : 0;
  }

  /** 대사님이 옆걸음칠 다음 자리 (대개 반대편으로 돌아간다) */
  private newWaypoint(p: Player): void {
    const left = this.scene.cameras.main.scrollX;
    if (Math.random() < 0.6) this.wpSide = -this.wpSide;
    let x = p.x + this.wpSide * Phaser.Math.Between(130, 220);
    if (x < left + 60 || x > left + GAME_W - 60) {
      this.wpSide = -this.wpSide;
      x = p.x + this.wpSide * Phaser.Math.Between(130, 220);
    }
    this.wpX = Phaser.Math.Clamp(x, left + 60, left + GAME_W - 60);
    this.wpY = Phaser.Math.Clamp(p.y + Phaser.Math.Between(-80, 80), FLOOR_TOP + 8, FLOOR_BOTTOM - 8);
    this.wpT = Phaser.Math.FloatBetween(0.8, 1.3);
  }

  /** 곧게 나가는 공격은 깊이가 맞아야 쏜다 (오래 못 맞추면 그냥 쏜다) */
  private aligned(p: Player): boolean {
    if (this.def.hero !== 'leejinchwi' && this.def.hero !== 'choijanghak') return true;
    return Math.abs(p.y - this.y) < 24 || this.alignT >= ALIGN_WAIT;
  }

  // ---------- 공격 ----------

  private startAttack(p: Player): void {
    const s = this.scene;
    this.set('wind');
    this.vx = 0;
    this.vy = 0;
    this.atkT = CYCLE[this.def.hero].every;
    this.alignT = 0;
    this.facing = p.x >= this.x ? 1 : -1;
    this.say(this.def.lines.attack, 1.2);
    play('charge', 0.5);
    const f = this.facing;
    switch (this.def.hero) {
      case 'kimgukje': {
        // 겨눈 자리로 붉은 선 (예고)
        this.aimX = p.x;
        this.aimY = p.y;
        const sh = this.shoulder();
        const dx = this.aimX - sh.x;
        const dy = this.aimY - sh.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = Phaser.Math.Clamp(d + 60, 160, 420);
        const line = s.add
          .rectangle(sh.x + (dx / d) * (len / 2), sh.y + (dy / d) * (len / 2), len, 6, 0xd0202f, 0.4)
          .setRotation(Math.atan2(dy, dx))
          .setDepth(-3);
        s.tweens.add({ targets: line, alpha: 0.12, yoyo: true, repeat: -1, duration: 110 });
        this.tele.push(line);
        this.flame?.setVisible(true);
        break;
      }
      case 'ohakjongji':
        // 커서가 날아갈 부채꼴에 흐린 커서 그림자 (예고)
        for (let i = 0; i < MACRO_SHOTS; i++) {
          const a = -FAN + (2 * FAN * i) / (MACRO_SHOTS - 1);
          const gx = this.x + f * Math.cos(a) * 80;
          const gy = this.y + Math.sin(a) * 80 * 0.6;
          const g = createCursor(s)
            .setPosition(gx, gy - 44)
            .setDepth(gy + 1)
            .setAlpha(0.45)
            .setScale(0.8)
            .setRotation(Math.atan2(Math.sin(a) * 0.6, f * Math.cos(a)) - CURSOR_TIP_ANGLE);
          s.tweens.add({ targets: g, alpha: 0.15, yoyo: true, repeat: -1, duration: 120 });
          this.tele.push(g);
        }
        break;
      case 'leejinchwi':
        this.laneBand(WAVE_HALF0, WAVE_HALF1, 0xfff3c4, 0xf5c542);
        break;
      case 'choijanghak':
        this.held[this.rolls % 2].setVisible(true);
        this.laneBand(DEPTH_RANGE + 4, DEPTH_RANGE + 4, 0xc8955a, 0x8b5a2b);
        break;
      case 'parkhaksa':
        // 바닥 세 곳(하나는 플레이어 자리)에 ✘ — 0.8초 뒤 터진다
        this.markFloor(p);
        break;
      case 'kimsikdang':
        break;
    }
  }

  /** 곧게 나가는 공격이 지나갈 길 (깊이 방향 반폭 h0 → h1로 넓어지는 띠) */
  private laneBand(h0: number, h1: number, fill: number, line: number): void {
    const s = this.scene;
    const left = s.cameras.main.scrollX;
    const x0 = this.x + this.facing * 24;
    const x1 = this.facing > 0 ? left + GAME_W : left;
    const g = s.add.graphics().setDepth(-3);
    const pts = [
      new Phaser.Math.Vector2(x0, this.y - h0),
      new Phaser.Math.Vector2(x1, this.y - h1),
      new Phaser.Math.Vector2(x1, this.y + h1),
      new Phaser.Math.Vector2(x0, this.y + h0),
    ];
    g.fillStyle(fill, 0.22).fillPoints(pts, true);
    g.lineStyle(2, line, 0.7).strokePoints(pts, true);
    s.tweens.add({ targets: g, alpha: 0.35, yoyo: true, repeat: -1, duration: 120 });
    this.tele.push(g);
  }

  private markFloor(p: Player): void {
    const left = this.scene.cameras.main.scrollX;
    const spots = [
      { x: p.x, y: p.y },
      { x: p.x - Phaser.Math.Between(95, 170), y: p.y + Phaser.Math.Between(-55, 55) },
      { x: p.x + Phaser.Math.Between(95, 170), y: p.y + Phaser.Math.Between(-55, 55) },
    ];
    for (const sp of spots) {
      const x = Phaser.Math.Clamp(sp.x, left + 50, left + GAME_W - 50);
      const y = Phaser.Math.Clamp(sp.y, FLOOR_TOP + 6, FLOOR_BOTTOM - 6);
      this.shots.push(new MarkShot(this.scene, x, y));
    }
  }

  private fire(p: Player): void {
    const s = this.scene;
    this.clearTele();
    this.set('fire');
    const f = this.facing;
    switch (this.def.hero) {
      case 'kimgukje':
        // 주먹이 팔에서 떨어져 날아간다: 돌아올 때까지 팔 없이 멈칫
        this.flame?.setVisible(false);
        this.rig.armF.setVisible(false);
        this.fist = new FistShot(s, this, this.aimX, this.aimY);
        this.shots.push(this.fist);
        play('dash');
        break;
      case 'ohakjongji': {
        const burst = { taken: 0 };
        for (let i = 0; i < MACRO_SHOTS; i++) {
          const a = -FAN + (2 * FAN * i) / (MACRO_SHOTS - 1);
          this.shots.push(new CursorShot(s, this.x + f * 24, this.y, f * Math.cos(a) * CURSOR_V, Math.sin(a) * CURSOR_V * 0.6, burst));
        }
        play('volley');
        break;
      }
      case 'leejinchwi':
        this.shots.push(new WaveShot(s, this.x + f * 34, this.y, f));
        play('wave');
        break;
      case 'choijanghak':
        this.held[this.rolls % 2].setVisible(false);
        this.shots.push(new RollShot(s, this.x + f * 34, this.y, f, this.rolls % 2 === 1));
        this.rolls++;
        play('throw');
        break;
      case 'parkhaksa':
        break;
      case 'kimsikdang':
        this.thrown = 0;
        this.updateFire(p);
        break;
    }
  }

  private updateFire(p: Player): void {
    switch (this.def.hero) {
      case 'kimgukje':
        if (!this.fist) this.set('move');
        break;
      case 'kimsikdang':
        // 책 3권을 차례로 (첫 권은 플레이어 자리, 나머지는 양옆)
        while (this.thrown < 3 && this.stateT >= this.thrown * 0.14) {
          this.throwBook(p, this.thrown);
          this.thrown++;
        }
        if (this.stateT >= 0.6) this.set('move');
        break;
      default:
        if (this.stateT >= 0.45) this.set('move');
    }
  }

  private throwBook(p: Player, i: number): void {
    const left = this.scene.cameras.main.scrollX;
    const side = i === 1 ? -1 : 1;
    const tx = i === 0 ? p.x : p.x + side * Phaser.Math.Between(65, 120);
    const ty = i === 0 ? p.y : p.y + Phaser.Math.Between(-36, 36);
    this.shots.push(
      new BookShot(
        this.scene,
        this.x + this.facing * 20,
        this.y,
        Phaser.Math.Clamp(tx, left + 40, left + GAME_W - 40),
        Phaser.Math.Clamp(ty, FLOOR_TOP + 6, FLOOR_BOTTOM - 6),
        BOOK_COLORS[i % BOOK_COLORS.length],
      ),
    );
    play('throw', 0.6);
  }

  // ---------- 결재 ----------

  takeHit(h: HitInfo): boolean {
    if (!this.active || this.removed) return false;
    if (!h.force && !this.hittable) return false;
    this.rig.flash();
    this.addStamps(Math.max(1, Math.round(h.stamps ?? 1)));
    return true;
  }

  private addStamps(n: number): void {
    const before = this.stamps;
    this.stamps = Math.min(VISIT_STAMPS, this.stamps + n);
    for (let i = before; i < this.stamps; i++) {
      const d = this.dots[i].setVisible(true).setScale(1.9);
      this.scene.tweens.add({ targets: d, scale: 1, duration: 120, ease: 'Back.Out' });
    }
    if (this.stamps >= VISIT_STAMPS) this.finish(true);
  }

  private finish(win: boolean): void {
    if (this.outcome !== 'none') return;
    this.outcome = win ? 'win' : 'lose';
    this.dead = true;
    this.clearShots();
    this.clearTele();
    this.vx = 0;
    this.vy = 0;
    this.set('done');
    this.say(win ? this.def.lines.win : this.def.lines.lose, 2.6);
    if (win) {
      this.okMark.setVisible(true).setScale(2);
      this.scene.tweens.add({ targets: this.okMark, scale: 1, duration: 160, ease: 'Back.Out' });
    }
    this.scene.onVisitEnd(this, win);
  }

  /** 떠난다 (성공이면 이때 보상 상자를 떨어뜨린다) */
  private leave(): void {
    if (this.outcome === 'win') this.scene.dropVisitBox(this.x, this.y, this.def.reward);
    const left = this.scene.cameras.main.scrollX;
    this.leaveDir = this.x - left < GAME_W / 2 ? -1 : 1;
    this.set('leaving');
  }

  private armBack(): void {
    this.fist = null;
    this.rig.armF.setVisible(true);
    this.flame?.setVisible(false);
  }

  private clearShots(): void {
    for (const s of this.shots) s.destroy();
    this.shots = [];
    this.armBack();
    for (const h of this.held) h.setVisible(false);
  }

  private clearTele(): void {
    for (const o of this.tele) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.tele = [];
  }

  private syncBoard(): void {
    const top = this.y - this.z - this.height - 8;
    this.board.setPosition(Math.round(this.x), Math.round(top)).setVisible(this.rig.root.visible && this.state !== 'leaving');
    const k = Phaser.Math.Clamp(this.timeLeft / VISIT_SEC, 0, 1);
    this.timeBar.setScale(k, 1).setFillStyle(this.timeLeft <= 5 ? 0xe5484d : 0xf5c542);
  }

  // ---------- 자세 ----------

  protected pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    const h = this.def.hero;
    const t = this.stateT;
    const moving = Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1;
    if (moving) {
      this.walkPhase += dt * (h === 'kimgukje' ? 14 : 10);
      const s = Math.sin(this.walkPhase);
      p.legF = s * 0.5;
      p.legB = -s * 0.5;
      p.armF = -s * (h === 'kimgukje' ? 0.15 : 0.4);
      p.armB = s * 0.3;
      p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2.2;
    }
    if (this.state === 'wind') {
      sharp = 28;
      switch (h) {
        case 'kimgukje': // 주먹을 앞으로 겨눈다 (불꽃이 붙는다)
          p.armF = -1.57;
          p.armB = 0.25;
          p.body = -0.06;
          p.legF = -0.25;
          p.legB = 0.3;
          break;
        case 'ohakjongji': // 광클 (마우스 연타)
          p.armF = -1.3 + Math.sin(t * 45) * 0.14;
          p.armB = -0.9;
          p.body = 0.08;
          break;
        case 'leejinchwi': // 자소서 더미를 두 손으로 끌어당겨 모은다
          p.armF = 0.7;
          p.armB = 0.7;
          p.body = -0.18;
          p.legF = -0.3;
          p.legB = 0.35;
          break;
        case 'choijanghak': // 짐을 낮게 들고 웅크린다
          p.armF = -0.8;
          p.armB = -0.8;
          p.body = 0.38;
          p.legF = -0.6;
          p.legB = 0.5;
          break;
        case 'parkhaksa': // 점검표를 들고 바닥을 가리킨다
          p.armF = -1.1;
          p.body = 0.12;
          break;
        case 'kimsikdang': // 책 더미를 머리 위로
          p.armF = -2.6;
          p.armB = -2.4;
          break;
      }
    } else if (this.state === 'fire') {
      sharp = 36;
      switch (h) {
        case 'kimgukje':
          p.armB = 0.25;
          p.body = 0.05;
          break;
        case 'leejinchwi': // 두 손으로 민다 (장풍)
          p.armF = -1.57;
          p.armB = -1.57;
          p.body = 0.28;
          p.legF = -0.45;
          p.legB = 0.4;
          break;
        case 'choijanghak': // 볼링처럼 굴려 보낸다
          p.armF = -1.45;
          p.armB = -1.2;
          p.body = 0.42;
          p.legF = -0.7;
          p.legB = 0.6;
          break;
        case 'kimsikdang':
          p.armF = -1.6;
          p.armB = -1.0;
          p.body = 0.2;
          break;
        default:
          p.armF = -1.45;
          p.body = 0.1;
      }
    } else if (this.state === 'done') {
      // 성공: 꾸벅 인사 / 실패: 아쉬운 듯 살짝 숙인다
      sharp = 12;
      p.body = this.outcome === 'win' ? (t < 0.35 ? 0.05 : 0.42) : 0.16;
      p.armF = this.outcome === 'win' ? 0.1 : -0.35;
    }
    if (this.flame?.visible) this.flame.setScale(1 + Math.abs(Math.sin(t * 30)) * 0.3);
    this.rig.update(dt, p, sharp);
  }

  destroy(): void {
    this.clearShots();
    this.clearTele();
    this.board.destroy();
    super.destroy();
  }
}
