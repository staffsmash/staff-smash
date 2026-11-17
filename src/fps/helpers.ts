import * as THREE from 'three';
import { HEROES, heroById, type HeroId } from '../data/heroes';
import { STUDENT_HEROES, type StudentHeroDef } from '../data/students';
import { Person, type Look } from './people';
import type { PerkHost } from './props';
import { prepareSpeech } from './speech';

// 1인칭 시험판: 조력자 이벤트 (2026-11-14, 두 모드 공통. 2026-11-15 규칙 바꿈).
// 구역마다(총장전 포함) 맞아서 체력이 처음 30% 이하로 떨어지면 반드시 한 번 동료·친구 2~3명이 뛰어 들어온다.
// 한 방에 쓰러질 피해면 체력 1로 버티고 먼저 온다 (Game.hurt). 플레이어가 보는 쪽 앞에서 달려와 화면 안에 선다.
// - 교직원 모드: 주인공 6명 가운데 고른 사람을 뺀 다섯 명 가운데 (2026-11-17 교직원 고르기, staffpick.ts)
// - 학생 모드: 고른 주인공을 뺀 학생 주인공들
// 도착하면 살아 있는 잡몹을 모두 처리하고, 체력 +35%, 2초 무적, 보스(사람·창구 직원)는 결재 진행·설득 +10%
// (다 채우지는 않는다: 5%는 남긴다 — Game.rescueHit). 첫째가 대사 1, 둘째가 대사 2를 말하고 걸어 나간다.
// 조력자는 다치지 않는다 (적 목록에 없고, 도장·폭발·민원이 노리지 않는다).
// 대사는 사용자가 정한 그대로다.

const STAFF_IDS: HeroId[] = HEROES.map((h) => h.id);
const SKIN = 0xf1c7a0;

/** 부르는 말: 받침이 있으면 "아", 없으면 "야". 끝이 영문자면 한국어로 읽은 소리 (L·M·N·R = 받침) */
export function vocative(name: string): string {
  const code = name.charCodeAt(name.length - 1);
  if (code >= 0xac00 && code <= 0xd7a3) return `${name}${(code - 0xac00) % 28 ? '아' : '야'}`;
  return `${name}${/[LMNR]$/i.test(name) ? '아' : '야'}`;
}

/** 조력자 대사 두 줄 (사용자 확정 문구) */
export function rescueLines(student: boolean, name: string): [string, string] {
  if (student) {
    const v = vocative(name);
    return [`${v}! 내가 대신 서류내줄게`, `${v}, 도와줄게!`];
  }
  return ['서류 마감기간이니 제가 대신 해드릴게요!', `${name}님! 전화 대신 받아드려요!`];
}

function staffLook(id: HeroId): Look {
  const h = heroById(id).look;
  return {
    top: h.shirt,
    pants: h.pants ?? 0x2d3b63,
    tie: h.tie,
    skin: SKIN,
    hair: h.hair,
    brow: h.hair,
    hairStyle: h.longHair ? 'long' : 'full',
    jacket: false,
    glasses: h.glasses,
    lanyard: !h.apron,
    apron: h.apron,
    left: 'none',
    scale: 1.45,
  };
}

function studentLook(s: StudentHeroDef): Look {
  const l = s.look;
  return {
    top: l.jacket,
    pants: l.pants ?? 0x2d3240,
    tie: l.jacket,
    noTie: true,
    skin: SKIN,
    hair: l.hair,
    brow: l.hair,
    hairStyle: l.longHair ? 'long' : 'full',
    jacket: false,
    glasses: l.glasses,
    hoodie: l.hoodie,
    tee: l.hoodie ? undefined : (l.tee ?? 0xf4f4f4),
    bag: l.bag,
    earphones: l.earphones,
    shoes: l.shoes,
    left: 'none',
    scale: 1.35,
  };
}

type HState = 'in' | 'act' | 'talk' | 'out' | 'done';

interface Helper {
  person: Person;
  obj: THREE.Group;
  from: THREE.Vector3;
  spot: THREE.Vector3;
  state: HState;
  t: number;
  yaw: number;
}

const _a = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Rescue {
  /** 교직원 주인공 6명 (고른 사람은 start에서 뺀다) */
  private readonly staff = new Map<string, Person>();
  private readonly students = new Map<string, Person>();
  /** 띠 아래에 부르는 조력자 이름 */
  private readonly nameOf = new Map<Person, string>();
  private active: Helper[] = [];
  /** 이번 판에 조력자가 왔던 구역 */
  private used = new Set<string>();
  private t = 0;
  private hitAt = -1;
  private said2 = false;
  private lines: [string, string] = ['', ''];

  constructor(private readonly h: PerkHost) {
    for (const id of STAFF_IDS) {
      const p = new Person('meeting', heroById(id).name, '#7CFC9A', staffLook(id));
      this.staff.set(id, p);
      this.nameOf.set(p, heroById(id).name);
    }
    for (const s of STUDENT_HEROES) {
      const p = new Person('meeting', s.name, '#7CFC9A', studentLook(s));
      // 학생은 결재판을 들지 않는다
      p.clip.visible = false;
      this.students.set(s.id, p);
      this.nameOf.set(p, s.name);
    }
    // 대사 그림 (교직원 주인공 여섯·학생 주인공 넷 이름마다)
    const lines: string[] = [];
    for (const id of STAFF_IDS) lines.push(...rescueLines(false, heroById(id).name));
    for (const s of STUDENT_HEROES) lines.push(...rescueLines(true, s.name));
    prepareSpeech(lines);
  }

  get busy(): boolean {
    return this.active.length > 0;
  }

  /** 이 구역(key)에서 아직 안 왔으면 true (앞 구역 조력자가 아직 걸어 나가는 중이어도 된다 — start가 치운다) */
  canStart(key: string): boolean {
    return !this.used.has(key);
  }

  /** 조력자 출발 (Game.tryRescue가 부른다) */
  start(key: string): void {
    const h = this.h;
    const student = h.mode === 'student';
    // 앞 구역 조력자가 아직 남아 있으면 바로 치운다
    for (const x of this.active) this.remove(x);
    this.active = [];
    this.used.add(key);
    this.t = 0;
    this.hitAt = -1;
    this.said2 = false;
    this.lines = rescueLines(student, h.playerName());
    const pool = student
      ? STUDENT_HEROES.filter((s) => s.id !== h.heroId()).map((s) => this.students.get(s.id) as Person)
      : STAFF_IDS.filter((id) => id !== h.heroId()).map((id) => this.staff.get(id) as Person);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const n = Math.min(pool.length, Math.random() < 0.5 ? 2 : 3);
    const a = h.area;
    const cx = (x: number) => Math.max(a.minX + 1, Math.min(a.maxX - 1, x));
    const cz = (z: number) => Math.max(a.minZ + 1, Math.min(a.maxZ - 1, z));
    // 화면 안에 몸·말풍선이 다 보이게 앞 양옆(±24°, 7.5m)과 왼쪽 앞(43°, 7m)에 선다 (말풍선이 위쪽 HUD·자막과 덜 겹친다).
    // 보는 쪽 앞 14m(±11~19°, 처음부터 화면 안)에서 플레이어 쪽으로 뛰어 들어온다
    const spots: [number, number][] = [
      [0.42, 7.5],
      [-0.42, 7.5],
      [0.75, 7],
    ];
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const [ang, r] = spots[i];
      const th = h.yaw + ang;
      const out = h.yaw + ang * 0.45;
      const spot = new THREE.Vector3(cx(h.pos.x - Math.sin(th) * r), 0, cz(h.pos.z - Math.cos(th) * r));
      const from = new THREE.Vector3(cx(h.pos.x - Math.sin(out) * 14), 0, cz(h.pos.z - Math.cos(out) * 14));
      const person = pool[i];
      names.push(this.nameOf.get(person) ?? '');
      person.reset();
      const obj = new THREE.Group();
      obj.add(person.root);
      obj.position.copy(from);
      const yaw = Math.atan2(spot.x - from.x, spot.z - from.z);
      obj.rotation.y = yaw;
      h.scene.add(obj);
      this.active.push({ person, obj, from, spot, state: 'in', t: 0, yaw });
    }
    // 2D처럼 띠 아래에 온 사람 이름
    h.banner(student ? '친구들이 도우러 왔다!' : '동료 직원들이 도우러 왔다!', names.join(' · '));
    h.sound('open');
  }

  update(dt: number): void {
    if (!this.active.length) return;
    const h = this.h;
    this.t += dt;
    const arrived = this.active.every((x) => x.state !== 'in');
    if (this.hitAt < 0 && (arrived || this.t >= 1.1)) {
      // 도착: 한꺼번에 처리 + 첫째 대사
      this.hitAt = this.t;
      h.rescueHit();
      this.active[0].person.say(this.lines[0], 2.0);
    }
    // 둘째 대사는 첫째 말풍선이 내려간 뒤 (두 말풍선이 겹치지 않게)
    if (this.hitAt >= 0 && !this.said2 && this.t - this.hitAt >= 2.1) {
      this.said2 = true;
      if (this.active[1]) this.active[1].person.say(this.lines[1], 2.2);
    }
    const leave = this.hitAt >= 0 && this.t - this.hitAt >= 4.4;
    for (const x of this.active) {
      x.t += dt;
      let walking = false;
      let reach = 0;
      let wave = false;
      let want = x.yaw;
      const o = x.obj.position;
      if (leave && x.state !== 'out' && x.state !== 'done') {
        x.state = 'out';
        x.t = 0;
      }
      switch (x.state) {
        case 'in': {
          walking = this.step(o, x.spot, 8.5, dt);
          want = Math.atan2(x.spot.x - o.x, x.spot.z - o.z);
          if (!walking) {
            x.state = 'act';
            x.t = 0;
          }
          break;
        }
        case 'act':
          // 플레이어가 보는 쪽(민원 쪽)을 보고 한 번 던진다
          want = h.yaw + Math.PI;
          reach = x.t < 0.5 ? 1 : 0;
          if (x.t >= 0.7 && this.hitAt >= 0) {
            x.state = 'talk';
            x.t = 0;
          }
          break;
        case 'talk':
          want = Math.atan2(h.pos.x - o.x, h.pos.z - o.z);
          break;
        case 'out':
          wave = x.t < 1.0;
          if (x.t > 0.5) {
            walking = this.step(o, x.from, 6, dt);
            want = Math.atan2(x.from.x - o.x, x.from.z - o.z);
            if (!walking || x.t > 5) x.state = 'done';
          } else want = Math.atan2(h.pos.x - o.x, h.pos.z - o.z);
          break;
        default:
          break;
      }
      x.yaw += wrap(want - x.yaw) * Math.min(1, dt * 8);
      x.obj.rotation.y = x.yaw;
      x.person.update(dt, { walking, raise: 0, reach, wave });
    }
    for (const x of this.active) if (x.state === 'done') this.remove(x);
    this.active = this.active.filter((x) => x.state !== 'done');
  }

  /** to로 걷는다. 아직 가는 중이면 true */
  private step(o: THREE.Vector3, to: THREE.Vector3, speed: number, dt: number): boolean {
    const d = _a.set(to.x - o.x, 0, to.z - o.z).length();
    if (d < 0.25) return false;
    o.addScaledVector(_a.normalize(), Math.min(d, speed * dt));
    return true;
  }

  private remove(x: Helper): void {
    x.person.tag.hide();
    x.obj.remove(x.person.root);
    this.h.scene.remove(x.obj);
  }

  /** 판을 처음으로 */
  clear(): void {
    for (const x of this.active) this.remove(x);
    this.active = [];
    this.used.clear();
    this.hitAt = -1;
  }

  /** 미리 그리기: 조력자 열 명 */
  warm(group: THREE.Group): () => void {
    const ppl = [...this.staff.values(), ...this.students.values()];
    ppl.forEach((p, i) => {
      p.root.position.set(-7 + i * 2, -1.6, -5);
      p.say('…', 1, false);
      p.update(0.016, { walking: true, raise: 0, reach: 0.5, wave: false });
      group.add(p.root);
    });
    return () => {
      for (const p of ppl) {
        group.remove(p.root);
        p.reset();
        p.root.position.set(0, 0, 0);
      }
    };
  }
}
