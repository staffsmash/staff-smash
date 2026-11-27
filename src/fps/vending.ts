import * as THREE from 'three';
import type { Rect } from './blocks';
import type { FoodKind, Models } from './models';
import { placesOf, type PerkHost, type Place } from './props';
import { canvasTex, FONT, NAVY } from './textures';

// 1인칭 교직원 모드: 식권 → 자판기 (2026-11-17).
// - 조기출근 박스(props.ts)를 깨면 늘 식권 1장이 나온다. 주우면 HUD에 "식권 N장"으로 쌓이고 바로 효과는 없다
//   (교직원 모드에서는 식권의 '체력 모두 회복'이 없다. 잡몹이 떨어뜨린 식권도 같다). 판 시작 때 0장, 구역을 넘어가도 남는다.
//   학생 모드(수강편람 → 식권·음식)와 2D는 그대로다.
// - 구역마다(상자가 있는 곳: 본관 앞·사회과학관 앞·인문과학관 앞·국제학사 앞·대운동장·해 질 녘 본관 앞) 자판기 1대.
//   남색 몸체, 앞면에 "자판기", 단추·투입구·꺼내는 곳. 걸어서 지나가지 못하고 도장도 막힌다. 상자처럼 길이 열리면 다음 구역 것도 보인다.
// - 가까이에서 바라보고 E(터치: 가까이 가면 나타나는 "넣기" 단추) → 식권 1장 → 자판기 앞에 무작위 아이템 하나 (무기는 없다).
//   체력이 낮을수록 음식(삼각김밥·학식 돈가스)이 잘 나오고, 가끔 체력을 모두 채우는 학식 치킨돈가스가 나온다.
//   식권이 없으면 "식권이 없습니다". E는 경비원 인사와 같은 키라서 경비원 앞에서는 경비원이 먼저다 (둘은 멀리 떨어져 있다).

/** Game에서 그대로 쓰는 것 (Game이 이 모양에 맞는다) */
export interface VendGame {
  readonly hp: number;
  readonly props: { readonly near: boolean };
  /** full: 체력 모두 회복 (자판기 치킨돈가스) */
  spawnPickup(kind: FoodKind, x: number, z: number, full?: boolean): void;
}

/** 자판기 자리와 앞면이 바라보는 곳 (교직원 모드) */
const SPOTS: Record<Place, { at: [number, number]; look: [number, number] }> = {
  // 본관 앞: 왼쪽 화단 앞 (시작할 때 왼쪽 앞에 보인다)
  yard: { at: [-12.5, -5.2], look: [-12.5, 6] },
  // 사회과학관 앞: 길에서 들어서면 오른쪽 앞, 가로등 옆
  plaza: { at: [88.5, 11], look: [79, 4] },
  // 인문과학관 앞: 서쪽 입구로 들어서면 왼쪽 앞 (국제학사 가는 남쪽 길은 비켜서)
  hum: { at: [158, 33.5], look: [149, 37] },
  // 국제학사 앞: 북쪽 입구로 들어서면 오른쪽 앞, 대운동장 가는 서쪽 길 바로 남쪽
  dorm: { at: [162, 72.5], look: [167, 61] },
  // 대운동장: 동쪽 철망 문으로 들어서면 오른쪽 앞, 북쪽 스탠드 앞
  field: { at: [119, 59.6], look: [119, 70] },
  // 해 질 녘 본관 앞: 본관 앞과 같은 자리
  final: { at: [-12.5, -5.2], look: [-12.5, 6] },
};

/** 몸체 절반 너비·절반 깊이·높이 */
const HW = 0.55;
const HD = 0.43;
const HH = 2.05;
const NEAR = 2.9;
const FULL_LABEL = '학식 치킨돈가스';
/** 음식이 아닌 것 (무기는 없다) */
const OTHERS: FoodKind[] = ['americano', 'battery', 'shield', 'shuttle', 'capture', 'seal'];

interface Machine {
  place: Place;
  obj: THREE.Group;
  x: number;
  z: number;
  /** 앞 방향 (단위 벡터) */
  fx: number;
  fz: number;
}

export class Vending {
  /** 가진 식권 */
  tickets = 0;
  /** 걸어서 지나갈 수 없는 것 (보이는 자판기) */
  readonly solids: Rect[] = [];
  /** 지금 E·넣기를 누를 수 있다 */
  near = false;
  /** 시험용: 마지막으로 뽑은 것 */
  last: { kind: FoodKind; full: boolean } | null = null;
  /** 이번 판에 식권을 주운 적이 있다 (HUD 줄) */
  private had = false;
  private hinted = false;
  private machines: Machine[] = [];
  private active: Machine | null = null;
  private cd = 0;
  private flashT = 0;
  private pending: { kind: FoodKind; full: boolean; m: Machine; t: number } | null = null;
  private readonly lamp: THREE.MeshBasicMaterial;
  private uiKey = '';
  private readonly hudEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly btnEl: HTMLButtonElement | null;

  constructor(
    private readonly h: PerkHost,
    private readonly g: VendGame,
    /** 최대 체력 (인물 장점으로 11칸일 수 있다 — src/perks.ts hpBonus) */
    private readonly maxHp: () => number,
  ) {
    ensureDom();
    const proto = buildMachine(h.models);
    this.lamp = proto.lamp;
    for (const place of Object.keys(SPOTS) as Place[]) {
      const s = SPOTS[place];
      const obj = proto.obj.clone();
      const yaw = Math.atan2(s.look[0] - s.at[0], s.look[1] - s.at[1]);
      obj.position.set(s.at[0], 0, s.at[1]);
      obj.rotation.y = yaw;
      obj.visible = false;
      h.scene.add(obj);
      this.machines.push({ place, obj, x: s.at[0], z: s.at[1], fx: Math.sin(yaw), fz: Math.cos(yaw) });
    }
    // 치킨돈가스 이름표는 미리 만든다
    h.models.label(FULL_LABEL, '#ffe066');
    this.hudEl = document.getElementById('tickets') as HTMLElement;
    this.hintEl = document.getElementById('vendHint') as HTMLElement;
    this.btnEl = document.getElementById('vendBtn') as HTMLButtonElement | null;
    if (this.btnEl) {
      this.btnEl.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.use();
        },
        { passive: false },
      );
      this.btnEl.addEventListener('click', () => this.use());
    }
  }

  // ---------- 식권 ----------

  /** 식권을 주웠다 (교직원 모드, Game.collect) */
  addTicket(): void {
    this.tickets++;
    this.had = true;
    const h = this.h;
    if (!this.hinted) {
      this.hinted = true;
      h.hint(
        'vend-ticket',
        h.touch ? '조기출근 박스에서 나온 식권을 자판기에 넣으면(넣기 버튼) 아이템이 나옵니다' : '조기출근 박스에서 나온 식권을 자판기에 넣으면(E) 아이템이 나옵니다',
        4.6,
      );
    } else {
      h.note(`식권 +1 · 모두 ${this.tickets}장`, 1.6);
    }
  }

  /** 뽑기: 체력이 낮을수록 음식, 가끔 치킨돈가스. 무기는 없다 (hpRatio: 시험용) */
  draw(hpRatio = this.g.hp / this.maxHp()): { kind: FoodKind; full: boolean } {
    const low = 1 - Math.max(0, Math.min(1, hpRatio));
    const r = Math.random();
    const big = 0.06 + 0.06 * low;
    if (r < big) return { kind: 'donkatsu', full: true };
    if (r < big + 0.2 + 0.55 * low) return { kind: Math.random() < 0.35 + 0.35 * low ? 'donkatsu' : 'gimbap', full: false };
    return { kind: OTHERS[Math.floor(Math.random() * OTHERS.length)], full: false };
  }

  /** E 키 / "넣기" 단추. 자판기 앞이 아니면 false (그러면 E는 경비원 인사) */
  use(): boolean {
    const m = this.active;
    if (!this.near || !m || !this.h.playing) return false;
    const h = this.h;
    if (this.cd > 0 || this.pending) return true;
    const at = new THREE.Vector3(m.x + m.fx * 0.6, 1.2, m.z + m.fz * 0.6);
    if (this.tickets <= 0) {
      h.note('식권이 없습니다', 1.4);
      h.sound('tick', at, 0.8);
      this.cd = 0.4;
      return true;
    }
    this.tickets--;
    this.cd = 0.7;
    this.flashT = 0.6;
    h.sound('calc', at, 0.9);
    const d = this.draw();
    this.last = d;
    // 덜컹: 잠깐 뒤 꺼내는 곳 앞에 나온다
    this.pending = { ...d, m, t: 0.45 };
    return true;
  }

  // ---------- 매 단계 ----------

  update(dt: number): void {
    const h = this.h;
    const staff = h.mode === 'staff';
    const [cur, next] = placesOf(h.mode, h.stage);
    let changed = false;
    for (const m of this.machines) {
      const on = staff && (m.place === cur || m.place === next);
      if (m.obj.visible !== on) {
        m.obj.visible = on;
        changed = true;
      }
    }
    if (changed) this.rebuildSolids();
    if (this.cd > 0) this.cd -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    this.lamp.color.setHex(this.flashT > 0 ? (Math.floor(this.flashT * 10) % 2 === 0 ? 0x7cfc9a : 0xffffff) : 0xfff3c4);
    const p = this.pending;
    if (p && (p.t -= dt) <= 0) {
      this.pending = null;
      const x = p.m.x + p.m.fx * 1.15;
      const z = p.m.z + p.m.fz * 1.15;
      this.g.spawnPickup(p.kind, x, z, p.full);
      const at = new THREE.Vector3(x, 0.6, z);
      h.sound('pop', at, 0.9);
      h.fx.confetti(at, 10, 2.4, 0xe0bb62, 1.6, 0.6);
    }
    // 가장 가까운 보이는 자판기를 가까이에서 바라보고 있으면 E (경비원 앞이면 경비원이 먼저)
    let best: Machine | null = null;
    let bd = Infinity;
    for (const m of this.machines) {
      if (!m.obj.visible) continue;
      const d = Math.hypot(m.x - h.pos.x, m.z - h.pos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    this.active = best;
    let near = false;
    if (best && staff && h.playing && h.stage !== 'done' && !this.g.props.near && bd <= NEAR) {
      const dx = best.x - h.pos.x;
      const dz = best.z - h.pos.z;
      const cos = bd > 0.01 ? (dx * -Math.sin(h.yaw) + dz * -Math.cos(h.yaw)) / bd : 1;
      near = cos >= 0.7 || (bd < 1.8 && cos >= 0.2);
    }
    this.near = near;
  }

  /** HUD "식권 N장", E 안내, 터치 넣기 단추 (매 프레임, 일시정지 중에도) */
  syncUi(play: boolean): void {
    const on = play && this.near;
    const line = this.h.mode === 'staff' && this.had ? `식권 ${this.tickets}장` : '';
    const key = `${on ? 1 : 0}|${line}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.hudEl.textContent = line;
    this.hintEl.classList.toggle('on', on);
    this.btnEl?.classList.toggle('on', on);
  }

  /** 도장(무기)이 자판기에 막혔나 */
  stampHit(p: THREE.Vector3): boolean {
    if (p.y > HH) return false;
    for (const m of this.machines) {
      if (!m.obj.visible) continue;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      // 자판기 기준 좌표 (앞 = f, 옆 = f를 90° 돌린 것)
      const lz = dx * m.fx + dz * m.fz;
      const lx = dx * m.fz - dz * m.fx;
      if (Math.abs(lx) < HW + 0.1 && Math.abs(lz) < HD + 0.1) {
        this.h.fx.confetti(p, 4, 2, 0xffffff, 1, 0.6);
        this.h.sound('hit', p, 0.4);
        return true;
      }
    }
    return false;
  }

  private rebuildSolids(): void {
    this.solids.length = 0;
    for (const m of this.machines) {
      if (!m.obj.visible) continue;
      const ax = Math.abs(m.fz) * HW + Math.abs(m.fx) * HD;
      const az = Math.abs(m.fx) * HW + Math.abs(m.fz) * HD;
      this.solids.push({ minX: m.x - ax, maxX: m.x + ax, minZ: m.z - az, maxZ: m.z + az });
    }
  }

  /** 판을 처음으로 (식권 0장) */
  clear(): void {
    this.tickets = 0;
    this.had = false;
    this.pending = null;
    this.cd = 0;
    this.flashT = 0;
    this.near = false;
    this.active = null;
    this.last = null;
    for (const m of this.machines) m.obj.visible = false;
    this.solids.length = 0;
  }

  /** 미리 그리기 */
  warm(group: THREE.Group): () => void {
    const m = this.machines[0];
    m.obj.visible = true;
    group.add(m.obj);
    const keep = m.obj.position.clone();
    m.obj.position.set(6, -1.6, -5);
    return () => {
      this.h.scene.add(m.obj);
      m.obj.position.copy(keep);
      m.obj.visible = false;
    };
  }
}

/** 자판기 치킨돈가스 모양: 돈가스를 크게, 이름표를 "학식 치킨돈가스"로 (Game.spawnPickup) */
export function dressFull(obj: THREE.Group, item: THREE.Group, models: Models): void {
  item.scale.setScalar(1.45);
  const old = obj.children.find((c) => (c as THREE.Sprite).isSprite);
  if (old) obj.remove(old);
  const label = models.label(FULL_LABEL, '#ffe066');
  label.position.y = 1.35;
  obj.add(label);
}

// ---------- 모형 ----------

/** 자판기: 남색 몸체, 앞면 "자판기"·진열창, 단추 여섯·식권 투입구·꺼내는 곳 (앞 = +z) */
function buildMachine(models: Models): { obj: THREE.Group; lamp: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const front = canvasTex(256, 476, (c) => {
    c.fillStyle = NAVY;
    c.fillRect(0, 0, 256, 476);
    // 머리판 "자판기"
    c.fillStyle = '#e0bb62';
    c.fillRect(0, 70, 256, 5);
    c.fillStyle = '#ffffff';
    c.font = `bold 50px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('자판기', 128, 38);
    // 진열창 (왼쪽): 선반 세 칸에 물건 그림
    c.fillStyle = '#dcecf7';
    c.fillRect(14, 90, 160, 236);
    c.fillStyle = '#9fb8cc';
    for (const y of [166, 244]) c.fillRect(14, y, 160, 5);
    const tri = (x: number, y: number) => {
      c.fillStyle = '#f6f1e1';
      c.beginPath();
      c.moveTo(x, y + 44);
      c.lineTo(x + 20, y + 6);
      c.lineTo(x + 40, y + 44);
      c.fill();
      c.fillStyle = '#1f2a24';
      c.fillRect(x + 8, y + 32, 24, 12);
    };
    const cup = (x: number, y: number) => {
      c.fillStyle = '#f4f4f4';
      c.fillRect(x + 8, y + 10, 24, 34);
      c.fillStyle = '#8a5a2b';
      c.fillRect(x + 8, y + 22, 24, 10);
      c.fillStyle = '#2b2b2b';
      c.fillRect(x + 6, y + 6, 28, 6);
    };
    const bat = (x: number, y: number) => {
      c.fillStyle = '#2b2f38';
      c.fillRect(x + 10, y + 6, 20, 38);
      c.fillStyle = '#5bd16b';
      for (let i = 0; i < 3; i++) c.fillRect(x + 14, y + 32 - i * 9, 12, 5);
    };
    const katsu = (x: number, y: number) => {
      c.fillStyle = '#ffffff';
      c.fillRect(x + 2, y + 34, 36, 8);
      c.fillStyle = '#b8742e';
      c.fillRect(x + 6, y + 22, 26, 13);
    };
    const coupon = (x: number, y: number) => {
      c.fillStyle = '#d9f5e3';
      c.fillRect(x + 4, y + 16, 32, 24);
      c.fillStyle = '#2f9e6a';
      c.fillRect(x + 28, y + 16, 8, 24);
    };
    const row = (y: number, items: ((x: number, y: number) => void)[]) => items.forEach((f, i) => f(20 + i * 50, y));
    row(114, [tri, tri, cup]);
    row(192, [katsu, bat, cup]);
    row(270, [coupon, tri, katsu]);
    // 단추 칸 (오른쪽, 단추는 블록)
    c.fillStyle = '#0b3a66';
    c.fillRect(184, 90, 60, 236);
    // 꺼내는 곳 둘레
    c.fillStyle = '#0b3a66';
    c.fillRect(20, 368, 216, 80);
  });
  const navy = new THREE.MeshLambertMaterial({ color: 0x002c52 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x15171c });
  const gold = new THREE.MeshLambertMaterial({ color: 0xe0bb62 });
  const face = new THREE.MeshLambertMaterial({ map: front });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const box = (w: number, hh: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const W = HW * 2;
  const D = HD * 2;
  box(W + 0.04, 0.08, D + 0.04, dark, 0, 0.04, 0);
  box(W, HH - 0.1, D, [navy, navy, navy, dark, face, navy], 0, 0.08 + (HH - 0.1) / 2, 0);
  box(W + 0.06, 0.06, D + 0.06, gold, 0, HH + 0.01, 0);
  // 앞면 기준 (0.08 + 높이 1.95 → 텍스처 476px). 텍스처 y(px) → 높이
  const Y = (px: number) => 0.08 + (HH - 0.1) * (1 - px / 476);
  const X = (px: number) => -HW + (px / 256) * W;
  const zf = HD;
  // 단추 여섯
  for (let i = 0; i < 6; i++) box(0.13, 0.07, 0.04, lamp, X(214), Y(110 + i * 26), zf + 0.02);
  // 식권 투입구: 금색 틀 + 검은 틈
  box(0.17, 0.2, 0.04, gold, X(214), Y(296), zf + 0.02);
  box(0.035, 0.15, 0.02, dark, X(214), Y(296), zf + 0.045);
  // 꺼내는 곳: 어두운 칸 + 반투명 덮개
  box(0.8, 0.28, 0.05, dark, X(128), Y(408), zf + 0.02);
  box(0.76, 0.12, 0.02, new THREE.MeshLambertMaterial({ color: 0x3b4250 }), X(128), Y(392), zf + 0.05);
  const label = models.label('자판기', '#ffe066');
  label.position.y = HH + 0.55;
  g.add(label);
  return { obj: g, lamp };
}

// ---------- 화면 조각 (fps.html은 그대로 두고 여기서 넣는다) ----------

const CSS = `
#tickets { margin-top: 3px; font-size: 12px; font-weight: 700; color: #f5c542; }
#tickets:empty { display: none; }
#vendHint { left: 50%; top: calc(50% + 22px); transform: translateX(-50%); padding: 3px 14px 4px; border-radius: 999px;
  background: rgba(17,19,24,.78); border: 2px solid #e0bb62; font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: none; opacity: 0; transition: opacity .15s; }
#vendHint b { display: inline-block; min-width: 18px; margin-right: 6px; padding: 0 4px; border-radius: 4px; background: #e0bb62; color: #111318; text-align: center; }
#vendHint.on { opacity: 1; }
body.touch #vendHint { display: none; }
#vendBtn { position: fixed; right: calc(150px * var(--bs) + var(--sa-r)); bottom: calc(112px * var(--bs) + var(--sa-b)); width: calc(66px * var(--bs)); height: calc(66px * var(--bs));
  border-radius: 50%; border: 3px solid #111318; background: #002c52; color: #fff; font: 700 calc(16px * var(--bs)) 'Malgun Gothic', sans-serif;
  display: none; box-shadow: 0 0 12px #e0bb62; touch-action: none; }
#vendBtn.on { display: block; }
@media (max-height: 500px) {
  #vendBtn { right: calc(136px * var(--bs) + var(--sa-r)); bottom: calc(96px * var(--bs) + var(--sa-b)); width: calc(60px * var(--bs)); height: calc(60px * var(--bs)); font-size: calc(15px * var(--bs)); }
}
`;

let injected = false;

/** HUD 식권 줄, E 안내, 터치 넣기 단추를 한 번 넣는다 */
function ensureDom(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const line = document.createElement('div');
  line.id = 'tickets';
  const perks = document.getElementById('perks');
  if (perks?.parentElement) perks.parentElement.insertBefore(line, perks.nextSibling);
  else document.getElementById('topleft')?.appendChild(line);
  const hint = document.createElement('div');
  hint.id = 'vendHint';
  hint.className = 'hud';
  hint.innerHTML = '<b>E</b>넣기';
  document.body.appendChild(hint);
  const touch = document.getElementById('touch');
  if (touch) {
    const btn = document.createElement('button');
    btn.id = 'vendBtn';
    btn.type = 'button';
    btn.textContent = '넣기';
    touch.appendChild(btn);
  }
}
