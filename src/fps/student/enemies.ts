import * as THREE from 'three';
import { Enemy, type Ctx } from '../enemies';
import type { StudentKit } from './models';

// 학생 모드 잡몹: 모두 행정·학사 물건이다 (본편 2D 학생 모드와 같은 넷).
// - 반려 서류: 좌우로 흔들리며 날아와 부딪친다. 통과시키면 "반려 철회!"
// - 결석 도장: 플레이어 자리에 빨간 그림자 → "쾅! 결석!" 하고 떨어진 뒤 바닥을 쿵쿵 찍는다(빨간 파동). 통과시키면 "출석 인정!"
// - "[알림] 오늘 휴강입니다?" 휴강 공지 봇: 부르르 떤 뒤 곧장 돌진한다. 옆으로 피한다.
// - 대기번호표 행렬: 번호표 너덧 장이 줄줄이 이어져 걸어온다. 맨 앞이 플레이어 쪽으로, 나머지는 앞 장을 따라간다.
// 박반려 처장의 서류 탑도 여기 있다 (사람이 아니라 물건).
// main.ts가 쓰는 종류(kind)는 교직원 모드 잡몹과 짝을 맞췄다: 반려 서류 = mail, 결석 도장 = phone, 휴강 공지 봇 = bubble, 번호표·서류 탑 = bulk.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ---------- 반려 서류 ----------

export class RejectDoc extends Enemy {
  readonly kind = 'mail' as const;
  private wings: THREE.Mesh[];
  private speed: number;
  private phase = Math.random() * 6.28;
  private state: 'fly' | 'retreat' = 'fly';
  private vel = new THREE.Vector3();

  constructor(c: Ctx, kit: StudentKit, at: THREE.Vector3) {
    super();
    const m = kit.rejectDoc();
    this.obj.add(m.obj);
    this.wings = m.wings;
    this.baseScale = 1.2;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.speed = 3.0 + Math.random() * 0.8;
    this.radius = 0.6 * this.baseScale;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    const flap = Math.sin(this.t * 16) * 0.55;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 14 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.x += dt * 8;
      o.rotation.z += dt * 5;
      if (o.position.y < -1) this.gone = true;
      return;
    }
    const to = _a.subVectors(c.eye, o.position);
    const dist = to.length();
    to.divideScalar(Math.max(0.001, dist));
    if (this.state === 'retreat') {
      o.position.addScaledVector(to, -this.speed * 1.4 * dt);
      o.position.y += dt * 1.5;
      if (this.t > 1.1) this.state = 'fly';
    } else {
      const sway = Math.sin(this.t * 2.4 + this.phase) * 1.5;
      o.position.addScaledVector(to, this.speed * dt);
      o.position.x += -to.z * sway * dt;
      o.position.z += to.x * sway * dt;
      o.position.y += Math.sin(this.t * 3 + this.phase) * 0.4 * dt;
      if (dist < this.radius + 0.55) {
        c.hurt(1, o.position, 'mail');
        this.state = 'retreat';
        this.t = 0;
      }
    }
    o.position.y = Math.max(0.9, Math.min(9, o.position.y));
    o.lookAt(c.eye);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1.2);
  }

  die(dir: THREE.Vector3): void {
    this.vel.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2).addScaledVector(dir, 3);
  }
}

// ---------- 결석 도장 ----------

const WARN_T = 1.15;
const POUND_EVERY = 2.6;
const POUND_R = 2.6;

export class AbsenceStamp extends Enemy {
  readonly kind = 'phone' as const;
  private state: 'warn' | 'fall' | 'ground' = 'warn';
  private warn: THREE.Mesh;
  private top: THREE.Group;
  private vy = 0;
  private poundT = 1.3;
  /** 안 받으면 이만큼 찍고 돌아간다 */
  private poundsLeft = 4;
  private hop = 0;
  private ox: number;
  private oz: number;

  constructor(c: Ctx, kit: StudentKit, x: number, z: number) {
    super();
    this.ox = x;
    this.oz = z;
    const m = kit.absenceStamp();
    this.top = m.top;
    this.obj.add(m.obj);
    this.obj.position.set(x, 19, z);
    this.hp = this.maxHp = 2;
    this.radius = 0.85;
    this.warn = new THREE.Mesh(c.models.warnGeo, c.models.warnMat);
    this.warn.rotation.x = -Math.PI / 2;
    this.warn.position.set(x, 0.05, z);
    this.warn.scale.setScalar(0.3);
    c.scene.add(this.obj, this.warn);
    this.center.set(x, 19.5, z);
  }

  /** 아직 공중이면 바닥 그림자 자리 (시험 봇이 피할 때) */
  get landing(): THREE.Vector3 | null {
    return this.state === 'ground' ? null : _b.set(this.ox, 0, this.oz);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vy -= 18 * dt;
      o.position.y = Math.max(0, o.position.y + this.vy * dt);
      o.rotation.y += dt * 12;
      const s = Math.max(0.01, 1 - this.t * 1.4);
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    if (this.state === 'warn') {
      this.warn.scale.setScalar(0.3 + Math.min(1, this.t / WARN_T) * 0.7);
      o.position.y = 19 - this.t * 2.2;
      o.rotation.y += dt * 3;
      if (this.t >= WARN_T) {
        this.state = 'fall';
        this.vy = -6;
        c.sound('fall', o.position, 0.9);
      }
    } else if (this.state === 'fall') {
      this.vy -= 46 * dt;
      o.position.y += this.vy * dt;
      if (o.position.y <= 0) this.land(c);
    } else {
      this.onGround(dt, c);
    }
    this.center.set(o.position.x, o.position.y + 0.5, o.position.z);
  }

  private land(c: Ctx): void {
    const o = this.obj;
    o.position.y = 0;
    this.state = 'ground';
    this.poundT = 1.2;
    this.warn.visible = false;
    c.sound('boom', o.position, 0.6);
    c.quake(0.35, o.position);
    c.fx.ring(o.position.x, 0.06, o.position.z, 0.4, 2.0, 0.4, 0xd0202f);
    c.fx.text(_a.set(o.position.x, 1.7, o.position.z), '쾅! 결석!', '#ff6b6b');
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    o.rotation.y = Math.atan2(dx, dz);
    if (dx * dx + dz * dz < 1.45 * 1.45 && c.feet < 0.5) c.hurt(1, o.position, 'phone');
  }

  private onGround(dt: number, c: Ctx): void {
    const o = this.obj;
    this.poundT -= dt;
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz);
    // 콩콩 뛰며 천천히 다가온다
    this.hop += dt * 7;
    if (d > 1.4) {
      o.position.x += (dx / d) * 0.9 * dt;
      o.position.z += (dz / d) * 0.9 * dt;
    }
    o.rotation.y = Math.atan2(dx, dz);
    const wind = this.poundT < 0.55;
    // 찍기 직전: 높이 들었다가 쾅
    o.position.y = wind ? Math.sin((1 - this.poundT / 0.55) * Math.PI) * 0.9 : Math.abs(Math.sin(this.hop)) * 0.12;
    this.top.rotation.z = wind ? Math.sin(this.t * 60) * 0.08 : 0;
    if (this.poundT <= 0) {
      this.poundT = POUND_EVERY;
      o.position.y = 0;
      c.sound('boom', o.position, 0.5);
      c.fx.ring(o.position.x, 0.08, o.position.z, 0.4, POUND_R, 0.5, 0xd0202f);
      c.fx.text(_a.set(o.position.x, 1.5, o.position.z), '결석!', '#ff6b6b');
      if (d < POUND_R && c.feet < 0.5) c.hurt(1, o.position, 'phone');
      if (--this.poundsLeft <= 0) {
        // 끝내 안 받으면 돌아간다 (통과시킨 것으로 치지 않는다)
        this.dead = true;
        this.die();
      }
    }
  }

  die(): void {
    this.t = 0;
    this.vy = 5;
    this.warn.visible = false;
  }

  dispose(): void {
    this.warn.removeFromParent();
  }
}

// ---------- 휴강 공지 봇 ----------

type BotState = 'approach' | 'aim' | 'dash' | 'recover';

export class CancelBot extends Enemy {
  readonly kind = 'bubble' as const;
  private mat: THREE.MeshBasicMaterial;
  private state: BotState = 'approach';
  private stateT = 0;
  private cool = 1.8 + Math.random();
  private dir = new THREE.Vector3();
  private dashDist = 0;
  private hitDone = false;
  private hover = 1.7 + Math.random() * 0.5;
  private side = Math.random() < 0.5 ? -1 : 1;

  constructor(c: Ctx, kit: StudentKit, at: THREE.Vector3) {
    super();
    const m = kit.cancelBot();
    this.mat = m.mat;
    this.obj.add(m.obj);
    this.obj.position.copy(at);
    this.hp = this.maxHp = 1;
    this.radius = 1.05;
    this.center.copy(at);
    c.scene.add(this.obj);
  }

  /** 돌진 직전인지 (조준 보조·시험 봇이 먼저 노린다) */
  get winding(): boolean {
    return this.state === 'aim' || this.state === 'dash';
  }

  private set(s: BotState): void {
    this.state = s;
    this.stateT = 0;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    this.stateT += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      const s = Math.max(0.01, 1 - this.t * 5);
      o.scale.setScalar(s);
      if (s <= 0.02) this.gone = true;
      return;
    }
    const dx = c.eye.x - o.position.x;
    const dz = c.eye.z - o.position.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const targetY = this.hover + Math.sin(this.t * 2.4) * 0.15;
    switch (this.state) {
      case 'approach': {
        const want = d - 9;
        const sp = 3.4;
        o.position.x += ((dx / d) * Math.sign(want) * Math.min(1, Math.abs(want)) + (-dz / d) * this.side * 0.5) * sp * dt;
        o.position.z += ((dz / d) * Math.sign(want) * Math.min(1, Math.abs(want)) + (dx / d) * this.side * 0.5) * sp * dt;
        if (this.stateT > 2.5) {
          this.side = -this.side;
          this.stateT = 0;
        }
        this.cool -= dt;
        if (this.cool <= 0 && d < 15) {
          this.set('aim');
          c.sound('tick', o.position, 0.8);
        }
        break;
      }
      case 'aim': {
        const k = Math.min(1, this.stateT / 0.8);
        const flash = Math.sin(this.t * 40) > 0 ? 1 : 0.75;
        this.mat.color.setRGB(1, 1 - 0.5 * k * flash, 1 - 0.5 * k * flash);
        o.position.x += Math.sin(this.t * 80) * 0.02;
        if (this.stateT >= 0.8) {
          this.dir.set(dx, c.eye.y - o.position.y, dz).normalize();
          this.dashDist = 0;
          this.hitDone = false;
          this.set('dash');
          c.sound('dash', o.position, 1);
        }
        break;
      }
      case 'dash': {
        const v = 14 * dt;
        o.position.addScaledVector(this.dir, v);
        this.dashDist += v;
        if (!this.hitDone) {
          const hy = Math.abs(c.eye.y - o.position.y);
          if (Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z) < 1.3 && hy < 1.3) {
            this.hitDone = true;
            c.hurt(1, o.position, 'bubble');
          }
        }
        const a = c.area;
        const out = o.position.x < a.minX - 4 || o.position.x > a.maxX + 4 || o.position.z < a.minZ - 4 || o.position.z > a.maxZ + 4;
        if (this.dashDist > 19 || out) this.set('recover');
        break;
      }
      case 'recover':
        this.mat.color.setRGB(1, 1, 1);
        if (this.stateT > 0.6) {
          this.cool = 1.6 + Math.random() * 1.2;
          this.set('approach');
        }
        break;
    }
    if (this.state !== 'dash') o.position.y += (targetY - o.position.y) * Math.min(1, dt * 3);
    this.faceFlat(c.eye);
    this.center.copy(o.position);
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 1.5);
  }

  die(): void {
    this.t = 0;
  }

  dispose(): void {
    this.mat.dispose();
  }
}

// ---------- 대기번호표 ----------

const GAP = 1.35;

export class Ticket extends Enemy {
  readonly kind = 'bulk' as const;
  ahead: Ticket | null;
  private legs: THREE.Mesh[];
  private card: THREE.Mesh;
  private phase = Math.random() * 6;
  private bumpT = 0;
  private vel = new THREE.Vector3();

  constructor(c: Ctx, kit: StudentKit, at: THREE.Vector3, no: string, ahead: Ticket | null) {
    super();
    const m = kit.ticket(no);
    this.legs = m.legs;
    this.card = m.card;
    this.obj.add(m.obj);
    this.baseScale = 1.15;
    this.obj.scale.setScalar(this.baseScale);
    this.obj.position.set(at.x, 0, at.z);
    this.hp = this.maxHp = 1;
    this.radius = 0.62;
    this.ahead = ahead;
    this.center.set(at.x, 0.85, at.z);
    c.scene.add(this.obj);
  }

  private get leader(): Ticket | null {
    let a = this.ahead;
    while (a && (a.dead || a.gone)) a = a.ahead;
    return a;
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    const o = this.obj;
    this.popScale(dt);
    if (this.dead) {
      this.vel.y -= 14 * dt;
      o.position.addScaledVector(this.vel, dt);
      o.rotation.x -= dt * 6;
      if (o.position.y < -1.2) this.gone = true;
      return;
    }
    const front = this.leader;
    let tx: number;
    let tz: number;
    let speed = 2.1;
    if (!front) {
      tx = c.eye.x;
      tz = c.eye.z;
    } else {
      // 앞 장 바로 뒤 (앞 장에서 플레이어 반대쪽으로 한 칸)
      const fx = c.eye.x - front.obj.position.x;
      const fz = c.eye.z - front.obj.position.z;
      const fd = Math.hypot(fx, fz) || 1;
      tx = front.obj.position.x - (fx / fd) * GAP;
      tz = front.obj.position.z - (fz / fd) * GAP;
      speed *= 1.6;
    }
    const dx = tx - o.position.x;
    const dz = tz - o.position.z;
    const d = Math.hypot(dx, dz);
    if (this.bumpT > 0) {
      this.bumpT -= dt;
      o.position.x -= (dx / (d || 1)) * 2.2 * dt;
      o.position.z -= (dz / (d || 1)) * 2.2 * dt;
    } else if (d > 0.25) {
      const step = Math.min(d, speed * dt);
      o.position.x += (dx / d) * step;
      o.position.z += (dz / d) * step;
    }
    this.phase += dt * 10;
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * 0.6;
    this.legs[1].rotation.x = -s * 0.6;
    this.card.position.y = 0.73 + Math.abs(s) * 0.05;
    this.faceFlat(c.eye);
    this.center.set(o.position.x, 0.85 * this.baseScale, o.position.z);
    // 부딪히면 밀려난다 (점프로 넘으면 괜찮다)
    if (this.bumpT <= 0 && c.feet < 0.6 && Math.hypot(c.eye.x - o.position.x, c.eye.z - o.position.z) < 0.95) {
      c.hurt(1, this.center, 'bulk');
      this.bumpT = 0.7;
    }
  }

  knock(dir: THREE.Vector3): void {
    this.obj.position.addScaledVector(dir, 0.8);
  }

  die(dir: THREE.Vector3): void {
    this.vel.set((Math.random() - 0.5) * 1.5, 3.5, (Math.random() - 0.5) * 1.5).addScaledVector(dir, 2.5);
  }
}

// ---------- 박반려 처장의 서류 탑 ----------

export class DocTower extends Enemy {
  readonly kind = 'bulk' as const;
  private model: THREE.Group;
  private shakeT = 0;
  private riseT = 0;
  private fallV = 0;

  /** model: 미리 만든 탑 하나를 다시 쓴다 */
  constructor(c: Ctx, model: THREE.Group, x: number, z: number, hp: number) {
    super();
    this.model = model;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 0.01, 1);
    model.visible = true;
    this.obj.add(model);
    this.obj.position.set(x, 0, z);
    this.hp = this.maxHp = hp;
    this.radius = 1.25;
    this.center.set(x, 1.25, z);
    c.scene.add(this.obj);
  }

  update(dt: number, c: Ctx): void {
    this.t += dt;
    if (this.dead) {
      // 무너진다: 앞으로 기울며 가라앉는다
      this.fallV += dt * 3;
      this.model.rotation.x = Math.min(1.4, this.model.rotation.x + this.fallV * dt);
      this.model.position.y -= dt * 1.2;
      if (this.t > 1.1) this.gone = true;
      return;
    }
    if (this.riseT < 0.4) {
      this.riseT += dt;
      this.model.scale.y = Math.min(1, this.riseT / 0.4);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.model.rotation.z = Math.sin(this.t * 60) * 0.03;
    } else this.model.rotation.z = 0;
    this.faceFlat(c.eye);
  }

  knock(): void {
    this.shakeT = 0.18;
  }

  die(): void {
    this.t = 0;
    this.fallV = 0;
  }

  dispose(): void {
    this.model.removeFromParent();
    this.model.visible = false;
  }
}
