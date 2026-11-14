import * as THREE from 'three';
import { ARM_IDS, type ArmId } from './arms';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Fx } from './fx';
import type { FoodKind, Models } from './models';
import { Person } from './people';
import { prepareSpeech, showSubtitle } from './speech';
import { canvasTex, FONT, NAVY } from './textures';

// 1인칭 시험판: 무기를 주는 사람·기계와 부수는 상자 (2026-11-14).
// - 교직원 모드: 구역마다 경비원(이름 없음, 남색 제복·근무모)이 서 있다. 가까이(3.5m)에서 바라보고 E(터치: 인사 버튼)
//   → "안녕하세요!" → 경비원 "네, 수고 많으십니다! 이거 쓰세요." → 무기 하나. 10초 안에 또 인사하면 "방금 드렸잖아요~".
//   도장으로 경비원을 맞히면 "어허, 인사부터 하셔야죠." 하고 6초 동안 등을 돌린다. 경비원은 다치지 않고 민원도 그를 노리지 않는다.
// - 학생 모드: 같은 자리에 "도서 무인 대출기"(기계). E(대여 버튼) → "도서 대여 완료!" → 무기 (전공책이 가장 잦다). 10초 동안 "대출 처리 중…".
// - 부수는 상자: 구역마다 2~3개. 교직원 "조기출근 박스"(종이 상자), 학생 "수강편람"(두꺼운 책자 더미).
//   2~3번 맞히면 부서지고 식권(25%)이나 음식이 나온다. 상자는 민원(잡몹)이 아니다: 차례 정리·조준 보조와 상관없다.
// 사람·기계·상자는 걸어서 통과하지 못한다 (solids → Game.move).

export type Place = 'yard' | 'plaza' | 'field' | 'final';

/** perks(props·helpers)가 쓰는 Game 쪽 기능 */
export interface PerkHost {
  readonly touch: boolean;
  readonly scene: THREE.Scene;
  readonly models: Models;
  readonly fx: Fx;
  readonly mode: 'staff' | 'student';
  readonly stage: string;
  /** 판이 돌아가는 중 (일시정지·결과 화면이 아님) */
  readonly playing: boolean;
  readonly pos: THREE.Vector3;
  readonly yaw: number;
  /** 지금 움직일 수 있는 구역 */
  readonly area: Rect;
  /** 지금 구역 번호 (조력자는 구역마다 한 번) */
  areaNo(): number;
  /** 주인공 이름 (교직원 김국제, 학생은 고른 주인공) */
  playerName(): string;
  /** 학생 모드에서 고른 주인공 id */
  heroId(): string;
  note(text: string, time?: number): void;
  hint(key: string, text: string, time?: number): void;
  banner(title: string, sub?: string): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
  spawnPickup(kind: FoodKind, x: number, z: number): void;
  /** 무기를 손에 든다 */
  equip(id: ArmId): void;
  /** 조력자 도착: 잡몹 처리·회복·무적·보스 진행 */
  rescueHit(): void;
}

interface Spot {
  /** 경비원·대출기 자리 */
  npc: [number, number];
  /** 평소에 바라보는 곳 (플레이어가 들어오는 쪽) */
  look: [number, number];
  /** 상자 후보 (이 가운데 2~3곳) */
  boxes: [number, number][];
}

/** 자리: 플레이어가 구역에 들어오는 곳 옆 (교전 방향에서 비켜서) */
const SPOTS: Record<'staff' | 'student', Record<Place, Spot>> = {
  staff: {
    yard: { npc: [-9, 14], look: [0, 6], boxes: [[-19, 3], [18, 9], [12, -2], [-12, 1]] },
    plaza: { npc: [76.5, -7], look: [74, 1], boxes: [[84, 10], [97, -12], [110, 11], [90, 15]] },
    field: { npc: [87, 61], look: [95, 62], boxes: [[75, 72], [116, 70], [108, 96], [80, 97]] },
    final: { npc: [-9, 14], look: [0, 6], boxes: [[-17, 3], [17, 3], [-14, 11]] },
  },
  student: {
    field: { npc: [87.5, 60.8], look: [95, 63], boxes: [[84, 70], [107, 68], [100, 92], [77, 90]] },
    plaza: { npc: [106, 15.5], look: [95, 13], boxes: [[86, -9], [100, -13], [112, 5], [82, 3]] },
    yard: { npc: [21.5, 10], look: [22, 1], boxes: [[12, -2], [-12, 3], [-18, 12], [5, 13]] },
    final: { npc: [-9, 14], look: [0, 6], boxes: [[-17, 3], [17, 3], [-14, 11]] },
  },
};

/** 지금 구역과 (길 위라면) 다음 구역 */
function placesOf(mode: 'staff' | 'student', stage: string): [Place, Place] {
  if (stage === 'final' || stage === 'done') return ['final', 'final'];
  if (mode === 'student') {
    // 학생: 대운동장 → 사회과학관 앞 → 본관 앞 → 총장실
    if (stage === 'path2') return ['field', 'plaza'];
    if (stage === 'path') return ['plaza', 'yard'];
    if (stage === 'plaza' || stage === 'plazaClear') return ['plaza', 'plaza'];
    if (stage === 'yard' || stage === 'yardBoss' || stage === 'yardClear') return ['yard', 'yard'];
    return ['field', 'field'];
  }
  if (stage === 'path') return ['yard', 'plaza'];
  if (stage === 'path2') return ['plaza', 'field'];
  if (stage === 'toFinal') return ['field', 'final'];
  if (stage === 'plaza' || stage === 'plazaClear') return ['plaza', 'plaza'];
  if (stage === 'field' || stage === 'fieldClear') return ['field', 'field'];
  return ['yard', 'yard'];
}

const GUARD_LINES = ['어허, 인사부터 하셔야죠.', '네, 수고 많으십니다! 이거 쓰세요.', '방금 드렸잖아요~', '…'];
const RUDE_SEC = 6;
const GIVE_CD = 10;
const NEAR = 3.5;

interface Crate {
  obj: THREE.Group;
  place: Place;
  x: number;
  z: number;
  hx: number;
  hz: number;
  h: number;
  hp: number;
  shake: number;
  alive: boolean;
}

const _c = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Props {
  /** 걸어서 지나갈 수 없는 것 (경비원·대출기·남은 상자) */
  readonly solids: Rect[] = [];
  private readonly guard: Person;
  private readonly guardObj = new THREE.Group();
  private readonly kiosk: THREE.Group;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly boxProto: THREE.Group;
  private readonly bookProto: THREE.Group;
  private crates: Crate[] = [];
  private spawned = new Set<Place>();
  private npcPlace: Place | null = null;
  private npcStudent = false;
  private npc = new THREE.Vector3();
  private restYaw = 0;
  private yawNow = 0;
  private t = 0;
  /** 다시 줄 수 있을 때까지 */
  private cd = 0;
  /** 경비원이 토라진 시간 */
  private rudeT = 0;
  private rudeSaid = -9;
  /** "안녕하세요!" 뒤 대답까지 */
  private replyT = -1;
  /** 대출기에서 곧 나올 무기 */
  private pending: ArmId | null = null;
  private pendingT = 0;
  private giveT = 0;
  private hopT = 0;
  private flashT = 0;
  private hintT = -1;
  /** 지금 E·인사 버튼을 누를 수 있다 */
  near = false;
  private uiKey = '';
  private readonly hintEl: HTMLElement;
  private readonly btnEl: HTMLButtonElement | null;

  constructor(private readonly h: PerkHost) {
    ensureDom();
    // 경비원: 남색 제복·근무모·금색 배지 (이름 없는 일반 경비원)
    this.guard = new Person('meeting', '경비원', '#c9d3e6', {
      top: 0x1d2b4a,
      pants: 0x1d2b4a,
      tie: 0x0f1626,
      skin: 0xf1c7a0,
      hair: 0x1b1712,
      brow: 0x1b1712,
      hairStyle: 'full',
      jacket: true,
      badge: true,
      cap: 0x1d2b4a,
      left: 'none',
      scale: 1.45,
    });
    this.guard.clip.visible = false;
    this.guardObj.add(this.guard.root);
    this.guardObj.visible = false;
    h.scene.add(this.guardObj);
    const k = buildKiosk(h.models);
    this.kiosk = k.obj;
    this.screenMat = k.screen;
    this.kiosk.visible = false;
    h.scene.add(this.kiosk);
    this.boxProto = buildBox();
    this.bookProto = buildBooks();
    prepareSpeech(GUARD_LINES);
    this.hintEl = document.getElementById('actHint') as HTMLElement;
    this.btnEl = document.getElementById('actBtn') as HTMLButtonElement | null;
    if (this.btnEl) {
      this.btnEl.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.interact();
        },
        { passive: false },
      );
      this.btnEl.addEventListener('click', () => this.interact());
    }
  }

  // ---------- 매 단계 ----------

  update(dt: number): void {
    const h = this.h;
    this.t += dt;
    const student = h.mode === 'student';
    const [cur, next] = placesOf(h.mode, h.stage);
    if (this.spawned.size === 0) this.hintT = 2.6;
    if (!this.spawned.has(cur)) this.spawnCrates(cur);
    if (!this.spawned.has(next)) this.spawnCrates(next);
    if (this.crates.some((c) => c.place !== cur && c.place !== next)) {
      for (const c of this.crates) if (c.place !== cur && c.place !== next) h.scene.remove(c.obj);
      this.crates = this.crates.filter((c) => c.place === cur || c.place === next);
      this.rebuildSolids();
    }
    // 경비원·대출기는 다음 구역으로 먼저 옮겨 간다 (길이 열리면)
    if (this.npcPlace !== next || this.npcStudent !== student) this.placeNpc(next, student);

    if (this.cd > 0) this.cd -= dt;
    if (this.rudeT > 0) this.rudeT -= dt;
    if (this.giveT > 0) this.giveT -= dt;
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) {
        const t = h.touch;
        h.hint(
          'perk-npc',
          student ? `도서 무인 대출기에서 대여하면${t ? '(대여 버튼)' : '(E)'} 무기가 나옵니다` : `경비원에게 인사하면${t ? '(인사 버튼)' : '(E)'} 무기를 줍니다`,
          4.2,
        );
      }
    }
    if (this.replyT > 0) {
      this.replyT -= dt;
      if (this.replyT <= 0) this.reply();
    }
    if (this.pending && (this.pendingT -= dt) <= 0) {
      const id = this.pending;
      this.pending = null;
      if (student) h.equip(id);
    }

    // 가까이에서 바라보고 있으면 E
    const dx = this.npc.x - h.pos.x;
    const dz = this.npc.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    const cos = d > 0.01 ? (dx * -Math.sin(h.yaw) + dz * -Math.cos(h.yaw)) / d : 1;
    this.near = h.playing && h.stage !== 'done' && d <= NEAR && (cos >= 0.77 || (d < 1.6 && cos >= 0.2));

    if (student) {
      // 화면: 대여하면 초록으로 깜빡이고, 처리 중에는 노랗게
      if (this.flashT > 0) this.flashT -= dt;
      this.screenMat.color.setHex(this.flashT > 0 ? (Math.floor(this.flashT * 10) % 2 === 0 ? 0x9dffb0 : 0xffffff) : this.cd > 0 ? 0xffd27a : 0xffffff);
    } else {
      // 경비원: 가까이 오면 플레이어를 본다. 토라지면 등을 돌린다
      let want = this.restYaw;
      if (this.rudeT > 0) want = Math.atan2(dx, dz);
      else if (d < 12) want = Math.atan2(-dx, -dz);
      this.yawNow += wrap(want - this.yawNow) * Math.min(1, dt * 5);
      this.guardObj.rotation.y = this.yawNow;
      if (this.hopT > 0) this.hopT = Math.max(0, this.hopT - dt);
      this.guardObj.position.y = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.3) * Math.PI) * 0.22 : 0;
      this.guard.update(dt, { walking: false, raise: 0, reach: this.giveT > 0 ? 1 : 0, wave: false });
    }

    // 상자 흔들림
    for (const c of this.crates) {
      if (!c.alive || c.shake <= 0) continue;
      c.shake = Math.max(0, c.shake - dt);
      c.obj.scale.setScalar(1 + c.shake * 0.6);
      c.obj.rotation.z = Math.sin(this.t * 60) * c.shake * 0.5;
    }
  }

  /** 버튼·E 안내 (매 프레임, 일시정지 중에도) */
  syncUi(play: boolean): void {
    const on = play && this.near;
    const student = this.h.mode === 'student';
    const key = `${on ? 1 : 0}${student ? 's' : 't'}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.hintEl.innerHTML = student ? '<b>E</b>대여' : '<b>E</b>인사';
    this.hintEl.classList.toggle('on', on);
    if (this.btnEl) {
      this.btnEl.textContent = student ? '대여' : '인사';
      this.btnEl.classList.toggle('on', on);
    }
  }

  // ---------- 인사·대여 ----------

  /** E 키 / 인사·대여 버튼 */
  interact(): void {
    if (!this.near || !this.h.playing) return;
    const h = this.h;
    if (h.mode === 'student') {
      // 화면 앞에서 떠오르는 글자 (머리판 글씨와 겹치지 않게 낮게)
      _c.set(this.npc.x + (h.pos.x - this.npc.x) * 0.25, 1.3, this.npc.z + (h.pos.z - this.npc.z) * 0.25);
      if (this.cd > 0) {
        h.note('대출 처리 중…', 1.2);
        h.sound('tick', _c, 0.6);
        return;
      }
      this.cd = GIVE_CD;
      this.flashT = 0.6;
      h.fx.text(_c, '도서 대여 완료!', '#7CFC9A', 0.5);
      h.fx.confetti(_c, 10, 2, 0x9fd3ff, 1.5, 0.6);
      h.note('도서 대여 완료!', 1.0);
      h.sound('pickup', _c, 0.6);
      // 전공책이 가장 잦다 (절반), 나머지는 고르게. 책은 잠깐 뒤에 나온다 (그때 무기 알림)
      const r = Math.random();
      this.pending = r < 0.5 ? 'clipboard' : r < 0.6667 ? 'stapler' : r < 0.8333 ? 'notice' : 'idcard';
      this.pendingT = 0.9;
      return;
    }
    // 교직원: 먼저 인사, 잠시 뒤 경비원 대답
    if (this.replyT > 0) return;
    showSubtitle(h.playerName(), '안녕하세요!', 0.9, '#9fd3ff');
    this.replyT = 0.75;
  }

  /** 경비원 대답 */
  private reply(): void {
    const h = this.h;
    if (h.mode !== 'staff' || !this.guardObj.visible) return;
    if (this.rudeT > 0) {
      this.guard.say('…', 1.2);
      return;
    }
    if (this.cd > 0) {
      this.guard.say('방금 드렸잖아요~', 1.8);
      return;
    }
    this.guard.say('네, 수고 많으십니다! 이거 쓰세요.', 2.4);
    this.cd = GIVE_CD;
    this.giveT = 0.8;
    h.equip(ARM_IDS[Math.floor(Math.random() * ARM_IDS.length)]);
  }

  /** 도장이 경비원을 맞혔다 */
  private rude(): void {
    const h = this.h;
    if (this.t - this.rudeSaid > 1.2) {
      this.guard.say('어허, 인사부터 하셔야죠.', 2.2);
      this.rudeSaid = this.t;
    }
    this.rudeT = RUDE_SEC;
    this.replyT = -1;
    this.hopT = 0.3;
    _c.set(this.npc.x, 2.2, this.npc.z);
    h.sound('hit', _c, 0.7);
  }

  // ---------- 도장 판정 ----------

  /**
   * 날아가는 도장(서류·무기)이 p에 왔을 때: 'stop' = 사람·기계에 막혔다, 'hit' = 상자를 맞혔다(꿰뚫는 무기는 계속 간다), 'none'.
   * seen: 이 도장이 이미 맞힌 것 (꿰뚫기·부메랑이 한 상자를 여러 번 치지 않게)
   */
  stampHit(p: THREE.Vector3, power: number, seen: Set<object>): 'none' | 'hit' | 'stop' {
    if (this.npcPlace) {
      if (this.guardObj.visible) {
        if (p.y > 0 && p.y < 3.3 && Math.hypot(p.x - this.npc.x, p.z - this.npc.z) < 0.62) {
          this.rude();
          return 'stop';
        }
      } else if (this.kiosk.visible && p.y < 2.0 && Math.hypot(p.x - this.npc.x, p.z - this.npc.z) < 0.62) {
        this.h.fx.confetti(p, 4, 2, 0xffffff, 1, 0.6);
        this.h.sound('hit', p, 0.4);
        return 'stop';
      }
    }
    for (const c of this.crates) {
      if (!c.alive || seen.has(c)) continue;
      if (Math.abs(p.x - c.x) < c.hx + 0.14 && Math.abs(p.z - c.z) < c.hz + 0.14 && p.y < c.h + 0.14) {
        seen.add(c);
        this.hitCrate(c, power);
        return 'hit';
      }
    }
    return 'none';
  }

  private hitCrate(c: Crate, power: number): void {
    const h = this.h;
    const student = h.mode === 'student';
    c.hp -= power;
    c.shake = 0.22;
    _c.set(c.x, c.h * 0.7, c.z);
    h.fx.confetti(_c, 5, 2.4, student ? 0xffffff : 0xc99f68, 1.2, 0.7);
    h.sound('hit', _c, 0.7);
    if (c.hp > 0) return;
    c.alive = false;
    h.scene.remove(c.obj);
    h.fx.confetti(_c, 22, 5, student ? 0xffffff : 0xc99f68, 3, 1.1);
    h.fx.confetti(_c, 10, 4, student ? 0x1d4ed8 : 0xffffff, 3, 0.9);
    h.sound('pop', _c);
    h.note(student ? '수강편람 사이에서 뭔가 떨어졌다!' : '조기출근 박스 개봉!', 1.8);
    const r = Math.random();
    const kind: FoodKind = r < 0.25 ? 'ticket' : r < 0.55 ? 'gimbap' : r < 0.8 ? 'donkatsu' : 'americano';
    h.spawnPickup(kind, c.x, c.z);
    this.rebuildSolids();
  }

  // ---------- 놓기 ----------

  private placeNpc(place: Place, student: boolean): void {
    this.npcPlace = place;
    this.npcStudent = student;
    const s = SPOTS[student ? 'student' : 'staff'][place];
    this.npc.set(s.npc[0], 0, s.npc[1]);
    this.restYaw = Math.atan2(s.look[0] - s.npc[0], s.look[1] - s.npc[1]);
    this.yawNow = this.restYaw;
    this.cd = 0;
    this.rudeT = 0;
    this.replyT = -1;
    this.guardObj.visible = !student;
    this.kiosk.visible = student;
    const o = student ? this.kiosk : this.guardObj;
    o.position.set(s.npc[0], 0, s.npc[1]);
    o.rotation.y = this.restYaw;
    if (!student) this.guard.reset();
    this.rebuildSolids();
  }

  private spawnCrates(place: Place): void {
    this.spawned.add(place);
    const student = this.h.mode === 'student';
    const spots = SPOTS[student ? 'student' : 'staff'][place].boxes.slice();
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const n = Math.min(spots.length, Math.random() < 0.5 ? 2 : 3);
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[i];
      const obj = (student ? this.bookProto : this.boxProto).clone();
      obj.position.set(x, 0, z);
      obj.rotation.y = (Math.random() - 0.5) * 0.6;
      this.h.scene.add(obj);
      this.crates.push({ obj, place, x, z, hx: student ? 0.46 : 0.5, hz: student ? 0.36 : 0.42, h: student ? 0.78 : 0.74, hp: Math.random() < 0.5 ? 2 : 3, shake: 0, alive: true });
    }
    this.rebuildSolids();
  }

  private rebuildSolids(): void {
    this.solids.length = 0;
    if (this.npcPlace) {
      const r = this.guardObj.visible ? 0.45 : 0.55;
      this.solids.push({ minX: this.npc.x - r, maxX: this.npc.x + r, minZ: this.npc.z - r, maxZ: this.npc.z + r });
    }
    for (const c of this.crates) if (c.alive) this.solids.push({ minX: c.x - c.hx, maxX: c.x + c.hx, minZ: c.z - c.hz, maxZ: c.z + c.hz });
  }

  /** 판을 처음으로 */
  clear(): void {
    for (const c of this.crates) this.h.scene.remove(c.obj);
    this.crates = [];
    this.spawned.clear();
    this.npcPlace = null;
    this.guardObj.visible = false;
    this.kiosk.visible = false;
    this.guard.reset();
    this.cd = 0;
    this.rudeT = 0;
    this.replyT = -1;
    this.hintT = -1;
    this.pending = null;
    this.flashT = 0;
    this.near = false;
    this.solids.length = 0;
  }

  // ---------- 미리 그리기 ----------

  warm(group: THREE.Group): () => void {
    const items: THREE.Object3D[] = [this.boxProto.clone(), this.bookProto.clone()];
    items.forEach((o, i) => {
      o.position.set(-1 + i * 2, -1.6, -3);
      o.scale.setScalar(0.4);
      group.add(o);
    });
    const kioskParent = this.kiosk.parent;
    this.kiosk.visible = true;
    this.kiosk.position.set(3, -1.6, -3);
    group.add(this.kiosk);
    this.guardObj.visible = true;
    this.guardObj.position.set(-3, -1.6, -3);
    group.add(this.guardObj);
    this.guard.say('…', 1, false);
    this.guard.update(0.016, { walking: false, raise: 0, reach: 0.5, wave: false });
    this.h.fx.text(_c.set(0, 1.6, 6), '도서 대여 완료!', '#7CFC9A');
    return () => {
      for (const o of items) group.remove(o);
      kioskParent?.add(this.kiosk);
      this.h.scene.add(this.guardObj);
      this.kiosk.visible = false;
      this.guardObj.visible = false;
      this.guard.reset();
    };
  }
}

// ---------- 모형 ----------

/** 도서 무인 대출기: 밝은 회색 몸통, 남색 머리판(글씨), 파란 화면, 스캐너, 책 나오는 칸 */
function buildKiosk(models: Models): { obj: THREE.Group; screen: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0xe6e9ee });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f38 });
  const navy = new THREE.MeshLambertMaterial({ color: 0x002c52 });
  const head = new THREE.MeshLambertMaterial({
    map: canvasTex(512, 128, (c) => {
      c.fillStyle = NAVY;
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#e0bb62';
      c.fillRect(0, 112, 512, 6);
      c.fillStyle = '#ffffff';
      c.font = `bold 62px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('도서 무인 대출기', 256, 60);
    }),
  });
  const screen = new THREE.MeshBasicMaterial({
    map: canvasTex(256, 180, (c) => {
      const gr = c.createLinearGradient(0, 0, 0, 180);
      gr.addColorStop(0, '#2f6fd1');
      gr.addColorStop(1, '#173f86');
      c.fillStyle = gr;
      c.fillRect(0, 0, 256, 180);
      // 책 그림 + 바코드
      c.fillStyle = '#fff6dc';
      c.fillRect(70, 36, 54, 70);
      c.fillRect(132, 36, 54, 70);
      c.fillStyle = '#d0202f';
      c.fillRect(124, 32, 8, 78);
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 22; i++) c.fillRect(64 + i * 6, 126, i % 3 === 0 ? 4 : 2, 30);
    }),
  });
  const box = (w: number, hh: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box(0.98, 0.08, 0.62, dark, 0, 0.04, 0);
  box(0.9, 1.46, 0.55, body, 0, 0.8, 0);
  box(0.96, 0.36, 0.6, [navy, navy, navy, navy, head, navy], 0, 1.71, 0);
  box(0.66, 0.48, 0.05, [dark, dark, dark, dark, screen, dark], 0, 1.22, 0.27).rotation.x = -0.18;
  box(0.52, 0.06, 0.3, dark, 0, 0.9, 0.36);
  box(0.36, 0.02, 0.2, new THREE.MeshBasicMaterial({ color: 0xff5a5a }), 0, 0.935, 0.37);
  box(0.42, 0.06, 0.03, dark, 0, 0.6, 0.28);
  const label = models.label('도서 무인 대출기', '#9fd3ff');
  label.position.y = 2.4;
  g.add(label);
  return { obj: g, screen };
}

/** 조기출근 박스: 테이프 붙인 종이 상자, 옆면마다 "조기출근" */
function buildBox(): THREE.Group {
  const side = canvasTex(256, 196, (c) => {
    c.fillStyle = '#c99f68';
    c.fillRect(0, 0, 256, 196);
    c.fillStyle = '#e3c48e';
    c.fillRect(104, 0, 48, 34);
    c.strokeStyle = '#a77d4b';
    c.lineWidth = 6;
    c.strokeRect(3, 3, 250, 190);
    c.fillStyle = '#2a1d10';
    c.font = `bold 58px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('조기출근', 128, 106);
    // 위 화살표 두 개 (상자 기호)
    c.fillRect(22, 150, 6, 26);
    c.fillRect(38, 150, 6, 26);
    c.beginPath();
    c.moveTo(14, 154);
    c.lineTo(25, 138);
    c.lineTo(36, 154);
    c.moveTo(30, 154);
    c.lineTo(41, 138);
    c.lineTo(52, 154);
    c.fill();
  });
  const top = canvasTex(128, 128, (c) => {
    c.fillStyle = '#c39561';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#e3c48e';
    c.fillRect(44, 0, 40, 128);
    c.fillStyle = '#9c7342';
    c.fillRect(0, 62, 128, 4);
  });
  const s = new THREE.MeshLambertMaterial({ map: side });
  const t = new THREE.MeshLambertMaterial({ map: top });
  const b = new THREE.MeshLambertMaterial({ color: 0x9c7342 });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.74, 0.84), [s, s, t, b, s, s]);
  m.position.y = 0.37;
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/** 수강편람: 두꺼운 책자 네 권을 엇갈려 쌓았다 (표지·책등에 "수강편람") */
function buildBooks(): THREE.Group {
  const cover = canvasTex(256, 192, (c) => {
    c.fillStyle = NAVY;
    c.fillRect(0, 0, 256, 192);
    c.fillStyle = '#e0bb62';
    c.fillRect(18, 30, 220, 5);
    c.fillRect(18, 156, 220, 5);
    c.fillStyle = '#ffffff';
    c.font = `bold 52px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('수강편람', 128, 96);
  });
  const spine = canvasTex(256, 56, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 56);
    c.fillStyle = NAVY;
    c.fillRect(0, 0, 256, 10);
    c.fillRect(0, 46, 256, 10);
    c.font = `bold 34px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('수강편람', 128, 29);
  });
  const pages = canvasTex(64, 32, (c) => {
    c.fillStyle = '#f4f0e0';
    c.fillRect(0, 0, 64, 32);
    c.fillStyle = '#d9d1b8';
    for (let y = 2; y < 32; y += 4) c.fillRect(0, y, 64, 1);
  });
  const cv = new THREE.MeshLambertMaterial({ map: cover });
  const sp = new THREE.MeshLambertMaterial({ map: spine });
  const pg = new THREE.MeshLambertMaterial({ map: pages });
  const nv = new THREE.MeshLambertMaterial({ color: 0x002c52 });
  const geo = new THREE.BoxGeometry(0.86, 0.19, 0.64);
  const g = new THREE.Group();
  const offs: [number, number, number][] = [
    [0, 0, 0],
    [0.04, 0.1, 0.02],
    [-0.05, -0.09, -0.03],
    [0.02, 0.15, 0.03],
  ];
  offs.forEach(([x, ry, z], i) => {
    const m = new THREE.Mesh(geo, [pg, pg, cv, nv, sp, pg]);
    m.position.set(x, 0.095 + i * 0.19, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  });
  return g;
}

// ---------- 화면 조각 (fps.html은 그대로 두고 여기서 넣는다) ----------

const CSS = `
#weapon { margin-top: 3px; font-size: 12px; font-weight: 700; color: #ffd27a; }
#weapon:empty { display: none; }
#actHint { left: 50%; top: calc(50% + 22px); transform: translateX(-50%); padding: 3px 14px 4px; border-radius: 999px;
  background: rgba(17,19,24,.78); border: 2px solid #7cfc9a; font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: none; opacity: 0; transition: opacity .15s; }
#actHint b { display: inline-block; min-width: 18px; margin-right: 6px; padding: 0 4px; border-radius: 4px; background: #7cfc9a; color: #111318; text-align: center; }
#actHint.on { opacity: 1; }
body.touch #actHint { display: none; }
#actBtn { position: fixed; right: calc(150px + env(safe-area-inset-right)); bottom: calc(112px + env(safe-area-inset-bottom)); width: 66px; height: 66px;
  border-radius: 50%; border: 3px solid #111318; background: #2f8f4e; color: #fff; font: 700 16px 'Malgun Gothic', sans-serif;
  display: none; box-shadow: 0 0 12px #7cfc9a; touch-action: none; }
#actBtn.on { display: block; }
@media (max-height: 500px) {
  #actBtn { right: calc(136px + env(safe-area-inset-right)); bottom: calc(96px + env(safe-area-inset-bottom)); width: 60px; height: 60px; font-size: 15px; }
}
`;

let injected = false;

/** 무기 HUD 줄, E 안내, 터치 인사·대여 버튼을 한 번 넣는다 */
function ensureDom(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const weapon = document.createElement('div');
  weapon.id = 'weapon';
  const buff = document.getElementById('buff');
  if (buff?.parentElement) buff.parentElement.insertBefore(weapon, buff.nextSibling);
  else document.getElementById('topleft')?.appendChild(weapon);
  const hint = document.createElement('div');
  hint.id = 'actHint';
  hint.className = 'hud';
  document.body.appendChild(hint);
  const touch = document.getElementById('touch');
  if (touch) {
    const btn = document.createElement('button');
    btn.id = 'actBtn';
    btn.type = 'button';
    btn.textContent = '인사';
    touch.appendChild(btn);
  }
}
