import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { StaffLook } from '../data/heroes';
import type { StudentHeroLook } from '../data/students';
import type { Controls } from '../input/Controls';
import type { StageScene } from '../scenes/StageScene';
import { Fighter, type AttackDef, type HitInfo } from './Fighter';
import { neutralPose, type Pose, type Rig } from './Rig';
import {
  BACKPACK_NAME,
  createClipboard,
  createHeldBomb,
  createHeldBook,
  createHeldCard,
  createHeldNotice,
  createHeldStapler,
  createStaffRig,
  createStamp,
  createStudentHeroRig,
} from './rigs';
import {
  createHeldBag,
  createHeldClock,
  createHeldMajorBook,
  createHeldStudentId,
  createHeldTumbler,
  createHeldUmbrella,
} from './studentRigs';
import { WEAPONS, weaponName, type WeaponDef, type WeaponId } from './weapons';
import * as fx from '../fx';

/** 주인공 외형: 교직원(가상 행정직원) 또는 학생 */
export type PlayerLook = { student: false; look: StaffLook } | { student: true; look: StudentHeroLook };

/** 맨손 (교직원: 도장 → 도장 → 결재판 내려치기, 학생: 잽 → 잽 → 가방 휘두르기). 수치는 같다 */
export const COMBO: AttackDef[] = [
  { total: 0.24, active: [0.06, 0.12], chainAt: 0.11, reach: 66, zReach: 30, dmg: 1, kb: 70, knockdown: false },
  { total: 0.26, active: [0.07, 0.13], chainAt: 0.12, reach: 68, zReach: 30, dmg: 1, kb: 70, knockdown: false },
  { total: 0.48, active: [0.2, 0.28], chainAt: 99, reach: 84, zReach: 30, dmg: 2, kb: 0, knockdown: true },
];

export const JUMP_ATTACK: AttackDef = {
  total: 0,
  active: [0, 99],
  chainAt: 99,
  reach: 62,
  zReach: 95,
  dmg: 2,
  kb: 0,
  knockdown: true,
};

const WALK = 250;
const RUN = 430;
const DEPTH_SPEED = 165;
const JUMP_V = 640;
/** 메일에 맞으면 잠깐 느려진다 */
const SLOW_MUL = 0.55;
/** 졸업시켜 달라는 학생이 매달리면 느려진다 */
const CLING_MUL = 0.4;
/** 아메리카노: 공격 속도 */
const COFFEE_MUL = 1.35;
const SHAKE_OFF = 4;
/** 국물 위: 속도가 목표에 늦게 따라간다 (클수록 덜 미끄럽다) */
const SLIP_GRIP = 2.2;

export type PlayerState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'wattack'
  | 'throw'
  | 'jump'
  | 'hurt'
  | 'down'
  | 'getup'
  | 'special'
  | 'report'
  | 'meeting'
  | 'frozen'
  /** 경비원에게 인사(교직원) · 대출기 누르기(학생) */
  | 'greet'
  | 'ko';

export interface HeldWeapon {
  id: WeaponId;
  def: WeaponDef;
  dur: number;
  /** 사원증이 날아가 있는 중 */
  inFlight: boolean;
  /** 마감 서류 뭉치가 터지기까지 남은 시간 */
  fuse: number;
}

/** 플레이어에게 매달릴 수 있는 적 */
export interface Clinger {
  releaseCling(): void;
}

type PropId = 'stamp' | 'board' | 'stapler' | 'notice' | 'card' | 'book' | 'bomb' | 'bag';

export class Player extends Fighter {
  readonly halfW = 20;
  readonly height = 106;
  /** 학생 모드 주인공인지 */
  readonly student: boolean;
  state: PlayerState = 'idle';
  sp = 0;
  lives = 3;
  weapon: HeldWeapon | null = null;
  slowT = 0;
  coffeeT = 0;
  /** 국물 위에 서 있다 (김학생식당). 스테이지가 매 프레임 채운다 */
  slipT = 0;
  clingBy: Clinger | null = null;
  private clingPresses = 0;
  private reportT = 0;
  private meetingT = 0;
  private frozenT = 0;
  private readonly backpack: Phaser.GameObjects.Container | null;
  private combo = 0;
  private buffered = false;
  private running = false;
  private jumpAttacking = false;
  private walkPhase = 0;
  private threw = false;
  private hitSet = new Set<Fighter>();
  /** 휘두를 때마다 1씩 는다 (상자·경비원이 한 번 휘두르기에 한 번만 맞게 스테이지가 쓴다) */
  swing = 0;
  private readonly props: Record<PropId, Phaser.GameObjects.Container>;
  private readonly scene: StageScene;
  private speech: Phaser.GameObjects.Text | null = null;
  private speechT = 0;

  constructor(scene: StageScene, x: number, y: number, hero: PlayerLook) {
    const rig: Rig = hero.student ? createStudentHeroRig(scene, hero.look) : createStaffRig(scene, hero.look);
    super(scene, x, y, rig, 12, 46);
    this.scene = scene;
    this.student = hero.student;
    const empty = () => new Phaser.GameObjects.Container(scene, 0, 0);
    if (hero.student) {
      // 학생: 맨손 잽은 주먹만, 3타는 등의 가방을 내려 휘두른다
      this.props = {
        stamp: empty(),
        board: createHeldMajorBook(scene, rig),
        stapler: createHeldTumbler(scene, rig),
        notice: createHeldUmbrella(scene, rig),
        card: createHeldStudentId(scene, rig),
        book: createHeldBook(scene, rig),
        bomb: createHeldClock(scene, rig),
        bag: createHeldBag(scene, rig, hero.look.bag),
      };
      this.backpack = (rig.torso.getByName(BACKPACK_NAME) as Phaser.GameObjects.Container | null) ?? null;
    } else {
      this.props = {
        stamp: createStamp(scene, rig),
        board: createClipboard(scene, rig),
        stapler: createHeldStapler(scene, rig),
        notice: createHeldNotice(scene, rig),
        card: createHeldCard(scene, rig),
        book: createHeldBook(scene, rig),
        bomb: createHeldBomb(scene, rig),
        bag: empty(),
      };
      this.backpack = null;
    }
    for (const c of Object.values(this.props)) {
      rig.itemF.add(c);
      c.setVisible(false);
    }
    this.sync();
  }

  private set(s: PlayerState): void {
    if (this.state !== s) this.stateT = 0;
    this.state = s;
  }

  /** 모드에 맞는 무기 이름 */
  wname(def: WeaponDef): string {
    return weaponName(def, this.student);
  }

  get hittable(): boolean {
    if (this.invuln > 0) return false;
    return !['down', 'getup', 'special', 'ko', 'meeting'].includes(this.state);
  }

  /** 적 AI가 노릴 수 있는 상태인지 */
  get targetable(): boolean {
    return !['down', 'ko', 'getup', 'meeting'].includes(this.state);
  }

  private get speedMul(): number {
    let m = 1;
    if (this.slowT > 0) m *= SLOW_MUL;
    if (this.clingBy) m *= CLING_MUL;
    return m;
  }

  update(dt: number, c: Controls): void {
    this.stateT += dt;
    // 아메리카노: 공격 동작이 빨라진다
    if (this.coffeeT > 0 && (this.state === 'attack' || this.state === 'wattack')) this.stateT += dt * (COFFEE_MUL - 1);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.coffeeT > 0) this.coffeeT -= dt;
    if (this.slipT > 0) this.slipT -= dt;

    // 손에 든 마감 서류 뭉치
    if (this.weapon?.id === 'bomb') {
      this.weapon.fuse -= dt;
      if (this.weapon.fuse <= 0) {
        this.weapon = null;
        this.scene.explodeInHand(this);
      }
    }

    switch (this.state) {
      case 'idle':
      case 'walk':
        this.updateFree(c, dt);
        break;
      case 'attack':
        this.updateAttack(dt, c);
        break;
      case 'wattack':
        this.updateWeaponAttack(dt, c);
        break;
      case 'throw':
        this.vx = 0;
        this.vy = 0;
        if (!this.threw && this.stateT >= 0.08) {
          this.threw = true;
          this.scene.throwWeapon(this);
        }
        if (this.stateT >= 0.26) this.set('idle');
        break;
      case 'jump':
        if (!this.jumpAttacking && c.consume('attack')) {
          this.jumpAttacking = true;
          this.hitSet.clear();
          this.swing++;
        }
        if (this.jumpAttacking && this.z < 95) this.scene.resolvePlayerAttack(this, JUMP_ATTACK, this.hitSet);
        break;
      case 'hurt':
        this.vx *= Math.pow(0.002, dt);
        if (this.stateT > 0.28) this.set('idle');
        break;
      case 'down':
        if (this.grounded) {
          this.vx = 0;
          this.vy = 0;
          if (this.stateT > 1.0) {
            if (this.hp <= 0) this.scene.onPlayerKO();
            else this.set('getup');
          }
        }
        break;
      case 'getup':
        if (this.stateT > 0.4) {
          this.set('idle');
          this.invuln = Math.max(this.invuln, 1.0);
        }
        break;
      case 'report':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= this.reportT) this.set('idle');
        break;
      case 'frozen':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= this.frozenT) this.set('idle');
        break;
      case 'meeting':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= this.meetingT) {
          this.set('idle');
          this.invuln = 1.2;
          fx.floatText(this.scene, this.x, this.y - 128, '회의 끝! 복귀', '#ffe066', 20);
        }
        break;
      case 'greet':
        this.vx = 0;
        this.vy = 0;
        if (this.stateT >= 0.55) this.set('idle');
        break;
      case 'special':
      case 'ko':
        this.vx = 0;
        this.vy = 0;
        break;
    }

    const landed = this.integrate(dt);
    if (landed) {
      if (this.state === 'jump') {
        this.set('idle');
        this.jumpAttacking = false;
        this.vx = 0;
        this.vy = 0;
        fx.dust(this.scene, this.x, this.y);
      } else if (this.state === 'down') {
        fx.dust(this.scene, this.x, this.y);
        this.scene.cameras.main.shake(80, 0.004);
      }
    }
    this.clampToView();
    this.pose(dt);
    this.sync();
    this.rig.root.setVisible(this.state !== 'meeting');
    this.shadow.setVisible(this.state !== 'meeting');
    if (this.speech) {
      this.speechT -= dt;
      this.speech
        .setPosition(this.x, this.y - this.z - this.height - 14)
        .setVisible(this.speechT > 0 && this.state !== 'meeting');
    }
  }

  /** 머리 위 말풍선 */
  say(text: string, sec = 1.2): void {
    if (!this.speech) this.speech = fx.speechText(this.scene, text);
    else this.speech.setText(text);
    this.speechT = sec;
  }

  /** 경비원에게 꾸벅 인사하거나(교직원) 대출기 버튼을 누른다(학생). dir = 상대가 있는 쪽 */
  startGreet(dir: number, line: string | null): void {
    this.set('greet');
    this.stateT = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = dir >= 0 ? 1 : -1;
    if (line) this.say(line, 1.1);
  }

  private updateFree(c: Controls, dt: number): void {
    const mx = c.moveX;
    const my = c.moveY;
    const mul = this.speedMul;
    if (c.consume('special') && this.sp >= 100) {
      this.scene.startSpecial();
      return;
    }
    if (c.consume('pickup')) {
      // 사원증(학생증)은 던져도 손으로 돌아오므로, 발밑에 다른 물건이 있으면 내려놓고 바꿔 든다
      if (this.weapon?.def.boomerang && this.scene.swapCard(this)) return;
      // 발밑에 주울 것이 없고 경비원(대출기) 앞이면 인사(대여)한다
      if (this.scene.tryGreet(this)) return;
      if (this.weapon && !this.weapon.inFlight) {
        this.startThrow();
        return;
      }
      if (!this.weapon && this.scene.tryPickup(this)) return;
    }
    if (c.consume('jump') && !this.clingBy) {
      this.set('jump');
      this.jumpAttacking = false;
      this.vz = JUMP_V;
      this.vx = mx * (c.running ? RUN : WALK) * mul;
      this.vy = my * DEPTH_SPEED * 0.6 * mul;
      return;
    }
    if (c.consume('attack')) {
      this.countShake();
      // 맨손일 때 무기 위에서 공격 버튼을 누르면 줍는다 (모바일 A 버튼 자동 전환)
      if (!this.weapon && this.scene.tryPickup(this)) return;
      const w = this.weapon;
      if (w && (w.def.throwOnly || (w.def.boomerang && !w.inFlight))) this.startThrow();
      else if (w && !w.def.boomerang) this.startWeaponAttack();
      else this.startAttack(0);
      return;
    }
    this.running = c.running && mx !== 0;
    const tvx = mx * (this.running ? RUN : WALK) * mul;
    const tvy = my * DEPTH_SPEED * mul;
    if (this.slipT > 0) {
      // 국물 위: 미끄러져서 방향을 바꾸거나 멈추기가 어렵다
      const k = 1 - Math.exp(-SLIP_GRIP * dt);
      this.vx += (tvx - this.vx) * k;
      this.vy += (tvy - this.vy) * k;
    } else {
      this.vx = tvx;
      this.vy = tvy;
    }
    if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
    const sliding = Math.abs(this.vx) > 12 || Math.abs(this.vy) > 12;
    this.set(mx !== 0 || my !== 0 || sliding ? 'walk' : 'idle');
  }

  /** 매달린 학생 떨쳐내기: 공격 버튼을 연타한다 */
  private countShake(): void {
    if (!this.clingBy) return;
    this.clingPresses++;
    this.rig.flash(0.04);
    if (this.clingPresses >= SHAKE_OFF) this.releaseCling();
  }

  setCling(by: Clinger): void {
    this.clingBy = by;
    this.clingPresses = 0;
  }

  releaseCling(): void {
    const by = this.clingBy;
    this.clingBy = null;
    this.clingPresses = 0;
    by?.releaseCling();
  }

  private startAttack(i: number): void {
    this.state = 'attack';
    this.stateT = 0;
    this.combo = i;
    this.buffered = false;
    this.hitSet.clear();
    this.swing++;
    this.vx = i === 2 ? this.facing * 90 : 0;
    this.vy = 0;
  }

  private updateAttack(dt: number, c: Controls): void {
    const a = COMBO[this.combo];
    this.vx *= Math.pow(0.01, dt);
    this.vy = 0;
    if (this.stateT > 0.03 && c.consume('attack')) {
      this.buffered = true;
      this.countShake();
    }
    if (this.stateT >= a.active[0] && this.stateT <= a.active[1]) {
      this.scene.resolvePlayerAttack(this, a, this.hitSet);
    }
    if (this.buffered && this.combo < COMBO.length - 1 && this.stateT >= a.chainAt) {
      this.startAttack(this.combo + 1);
      return;
    }
    if (this.stateT >= a.total) this.set('idle');
  }

  // ---------- 무기 ----------

  equip(id: WeaponId, fuse = 0): void {
    const def = WEAPONS[id];
    this.weapon = { id, def, dur: def.durability, inFlight: false, fuse };
  }

  private startWeaponAttack(): void {
    if (!this.weapon) return;
    this.state = 'wattack';
    this.stateT = 0;
    this.buffered = false;
    this.hitSet.clear();
    this.swing++;
    this.vx = this.weapon.id === 'notice' ? this.facing * 60 : 0;
    this.vy = 0;
    this.weapon.dur--;
  }

  private updateWeaponAttack(dt: number, c: Controls): void {
    const w = this.weapon;
    if (!w) {
      this.set('idle');
      return;
    }
    const a = w.def.attack;
    this.vx *= Math.pow(0.01, dt);
    this.vy = 0;
    if (this.stateT > 0.03 && c.consume('attack')) {
      this.buffered = true;
      this.countShake();
    }
    if (this.stateT >= a.active[0] && this.stateT <= a.active[1]) {
      this.scene.resolvePlayerAttack(this, a, this.hitSet);
    }
    const chain = this.buffered && this.stateT >= a.chainAt;
    if (chain || this.stateT >= a.total) {
      if (w.def.durability > 0 && w.dur <= 0) {
        this.weapon = null;
        fx.floatText(this.scene, this.x, this.y - 124, `${this.wname(w.def)} 다 씀`, '#cfd6e3', 16);
        this.set('idle');
        return;
      }
      if (chain) this.startWeaponAttack();
      else this.set('idle');
    }
  }

  private startThrow(): void {
    this.set('throw');
    this.stateT = 0;
    this.threw = false;
    this.vx = 0;
    this.vy = 0;
  }

  /** 던질 무기를 손에서 뗀다. 사원증은 손에 남은 채 날아간 상태가 된다. */
  takeWeaponForThrow(): HeldWeapon | null {
    const w = this.weapon;
    if (!w) return null;
    if (w.def.boomerang) {
      if (w.inFlight) return null;
      w.inFlight = true;
      return w;
    }
    this.weapon = null;
    return w;
  }

  catchCard(): void {
    if (this.weapon?.id === 'idcard') this.weapon.inFlight = false;
  }

  // ---------- 회복·방해 효과 ----------

  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  applySlow(sec: number): void {
    if (this.slowT <= 0) {
      const text = this.student ? '반려 사유 읽는 중… (느려짐)' : '메일 확인 중… (느려짐)';
      fx.floatText(this.scene, this.x, this.y - 128, text, '#9fd3ff', 16);
    }
    this.slowT = Math.max(this.slowT, sec);
  }

  /** 잠깐 멈춘다 (최장학의 동전을 밟았을 때). 그동안 맞을 수 있다 */
  freeze(sec: number, text: string): boolean {
    if (!['idle', 'walk', 'attack', 'wattack'].includes(this.state)) return false;
    this.set('frozen');
    this.frozenT = sec;
    this.vx = 0;
    this.vy = 0;
    fx.floatText(this.scene, this.x, this.y - 128, text, '#9fd3ff', 18);
    return true;
  }

  /** "보고해!"를 밟거나 일거리를 주우면 잠깐 보고서를 쓴다 */
  startReport(sec: number, text = '보고서 작성 중…'): boolean {
    if (!['idle', 'walk', 'attack', 'wattack'].includes(this.state)) return false;
    this.set('report');
    this.reportT = sec;
    this.vx = 0;
    this.vy = 0;
    fx.floatText(this.scene, this.x, this.y - 128, text, '#ffd27f', 18);
    return true;
  }

  /** 회의소집 부총장에게 끌려간다 */
  startMeeting(sec: number): boolean {
    if (!this.targetable || this.state === 'special') return false;
    this.releaseCling();
    this.set('meeting');
    this.meetingT = sec;
    this.vx = 0;
    this.vy = 0;
    this.z = 0;
    this.vz = 0;
    return true;
  }

  takeHit(h: HitInfo): boolean {
    if (!h.force && !this.hittable) return false;
    // 결재판을 들고 정면을 보고 있으면 막는다
    const w = this.weapon;
    const front = this.facing === -Math.sign(h.dir);
    if (w?.def.guard && front && !h.force && ['idle', 'walk', 'wattack'].includes(this.state)) {
      w.dur--;
      fx.floatText(this.scene, this.x + this.facing * 20, this.y - 110, `${this.wname(w.def)}으로 막음!`, '#9fd3ff', 16);
      this.vx = h.dir * 60;
      if (w.dur <= 0) {
        this.weapon = null;
        fx.floatText(this.scene, this.x, this.y - 130, `${this.wname(w.def)} 다 씀`, '#cfd6e3', 16);
      }
      return false;
    }
    this.hp = Math.max(0, this.hp - h.dmg);
    this.rig.flash();
    this.jumpAttacking = false;
    this.facing = h.dir > 0 ? -1 : 1;
    if (this.hp <= 0 || h.knockdown || this.z > 0) {
      this.releaseCling();
      this.set('down');
      this.vz = 300;
      this.vx = h.dir * 220;
      this.vy = 0;
    } else {
      this.set('hurt');
      this.vx = h.dir * h.kb;
      this.vy = 0;
    }
    this.scene.onPlayerHit(h.dmg);
    return true;
  }

  /** 목숨을 하나 쓰고 다시 일어선다 */
  revive(): void {
    this.hp = this.maxHp;
    this.set('getup');
    this.invuln = 2.2;
  }

  enterSpecial(): void {
    this.releaseCling();
    this.set('special');
    this.vx = 0;
    this.vy = 0;
    this.sp = 0;
  }

  endSpecial(): void {
    if (this.state === 'special') this.set('idle');
  }

  private clampToView(): void {
    const left = this.scene.cameras.main.scrollX;
    this.x = Phaser.Math.Clamp(this.x, left + 24, left + GAME_W - 24);
  }

  /** 상태에 맞는 자세를 고른다 */
  pose(dt: number): void {
    const p: Pose = neutralPose();
    let sharp = 16;
    const t = this.scene.time.now / 1000;
    switch (this.state) {
      case 'idle':
        p.armF = 0.08 + Math.sin(t * 3) * 0.04;
        p.armB = -0.08 - Math.sin(t * 3) * 0.04;
        p.bob = Math.sin(t * 3) * 1.2;
        break;
      case 'walk': {
        this.walkPhase += dt * (this.running ? 17 : 11) * this.speedMul;
        const s = Math.sin(this.walkPhase);
        p.legF = s * 0.55;
        p.legB = -s * 0.55;
        p.armF = -s * 0.5;
        p.armB = s * 0.5;
        p.bob = -Math.abs(Math.cos(this.walkPhase)) * 2.5;
        if (this.running) p.body = 0.12;
        if (this.clingBy) p.body = 0.2;
        break;
      }
      case 'attack': {
        sharp = 40;
        const a = COMBO[this.combo];
        p.legF = -0.28;
        p.legB = 0.28;
        if (this.student) {
          this.studentAttackPose(p, a);
          break;
        }
        if (this.combo === 0) {
          p.armF = -1.45;
          p.armB = 0.4;
          p.body = 0.08;
        } else if (this.combo === 1) {
          p.armF = -1.8;
          p.armB = 0.5;
          p.body = 0.12;
        } else if (this.stateT < a.active[0]) {
          p.armF = -2.9;
          p.armB = -0.4;
          p.body = -0.12;
        } else {
          p.armF = -0.85;
          p.armB = 0.5;
          p.body = 0.22;
          p.legF = -0.45;
          p.legB = 0.38;
        }
        break;
      }
      case 'wattack': {
        sharp = 40;
        p.legF = -0.28;
        p.legB = 0.28;
        const a = this.weapon?.def.attack;
        const heavy = this.weapon?.id === 'notice' || this.weapon?.id === 'clipboard';
        if (heavy && a) {
          if (this.stateT < a.active[0]) {
            p.armF = -2.85;
            p.body = -0.12;
          } else {
            p.armF = -1.0;
            p.body = 0.22;
          }
        } else {
          p.armF = this.stateT < 0.05 ? -1.1 : -1.6;
          p.armB = 0.4;
          p.body = 0.1;
        }
        break;
      }
      case 'throw':
        sharp = 36;
        p.armF = this.stateT < 0.08 ? -2.8 : -1.3;
        p.body = this.stateT < 0.08 ? -0.15 : 0.2;
        p.legF = -0.3;
        p.legB = 0.3;
        break;
      case 'jump':
        sharp = 22;
        p.legF = -0.75;
        p.legB = 0.5;
        if (this.jumpAttacking) {
          p.armF = -1.05;
          p.armB = 0.6;
          p.body = 0.28;
        } else {
          p.armF = -2.5;
          p.armB = -2.2;
        }
        break;
      case 'hurt':
        sharp = 30;
        p.body = -0.3;
        p.armF = -0.7;
        p.armB = -0.5;
        break;
      case 'down':
      case 'ko':
        sharp = 14;
        p.body = this.grounded ? -Math.PI / 2 : -1.1;
        p.bob = this.grounded ? -18 : 0;
        p.armF = -2.6;
        p.armB = -2.9;
        p.legF = -0.2;
        p.legB = 0.2;
        break;
      case 'getup':
        sharp = 12;
        p.body = -0.4;
        p.legF = -0.6;
        p.legB = 0.6;
        break;
      case 'report':
        sharp = 24;
        p.armF = -1.25 + Math.sin(t * 28) * 0.12;
        p.armB = -0.9 - Math.sin(t * 28) * 0.12;
        p.body = 0.12;
        break;
      case 'special':
        sharp = 20;
        p.armF = -2.95;
        p.armB = -2.95;
        p.bob = -4;
        break;
      case 'greet':
        if (this.student) {
          // 대출기 버튼 누르기
          sharp = 24;
          p.armF = this.stateT < 0.25 ? -1.2 : -1.5;
          p.body = 0.06;
        } else {
          // 꾸벅 인사
          sharp = 12;
          p.body = this.stateT < 0.4 ? 0.45 : 0.05;
          p.armF = 0.1;
          p.armB = -0.1;
        }
        break;
      case 'frozen':
        // 깜짝 놀라 굳었다
        sharp = 30;
        p.armF = -2.5 + Math.sin(t * 40) * 0.05;
        p.armB = -2.3;
        p.body = -0.12;
        p.bob = Math.sin(t * 50) * 1.2;
        break;
    }

    const w = this.weapon;
    const id = w && !w.inFlight ? w.id : null;
    const holding = this.state !== 'down' && this.state !== 'ko' && this.state !== 'report';
    const st = this.student;
    const swingBag = st && this.state === 'attack' && this.combo === 2;
    const show: Record<PropId, boolean> = {
      stamp: (this.state === 'attack' && this.combo < 2) || (this.state === 'jump' && this.jumpAttacking && !id),
      board:
        (!st && ((this.state === 'attack' && this.combo === 2) || this.state === 'report')) ||
        (id === 'clipboard' && holding && !swingBag),
      stapler: id === 'stapler' && holding,
      notice: id === 'notice' && holding,
      card: id === 'idcard' && holding && this.state !== 'attack',
      book: id === 'rulebook' && holding,
      bomb: id === 'bomb' && holding,
      bag: swingBag,
    };
    for (const k of Object.keys(show) as PropId[]) this.props[k].setVisible(show[k]);
    this.backpack?.setVisible(!swingBag);
    this.rig.update(dt, p, sharp);
  }

  /** 학생 맨손: 잽(앞손) → 잽(뒷손) → 등의 가방을 내려 크게 휘두르기 */
  private studentAttackPose(p: Pose, a: AttackDef): void {
    if (this.combo === 0) {
      p.armF = -1.57;
      p.armB = 0.5;
      p.body = 0.1;
    } else if (this.combo === 1) {
      p.armF = 0.45;
      p.armB = -1.62;
      p.body = 0.16;
    } else if (this.stateT < a.active[0]) {
      p.armF = 1.0;
      p.armB = -0.5;
      p.body = -0.16;
    } else {
      p.armF = -1.8;
      p.armB = 0.6;
      p.body = 0.26;
      p.legF = -0.45;
      p.legB = 0.38;
    }
  }
}
