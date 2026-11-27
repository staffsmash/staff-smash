import * as THREE from 'three';
import { FPS_STUDENT_HEROES } from '../../data/students';
import type { SfxName } from '../audio';
import type { Rect } from '../blocks';
import { vocative } from '../helpers';
import { Person, type Look, type PoseIn } from '../people';
import { prepareSpeech } from '../speech';
import { canvasTex, FONT } from '../textures';

// 1인칭 학생 모드: 로테이션 소개팅 (사용자 2026-11-20).
// - 한 판에 한 번. 3~5번째 구역(stu.areaNo 2 인문과학관 앞 · 3 사회과학관 앞 · 4 본관 앞) 가운데 무작위 한 곳의
//   과제(행정) 차례 중에, 조력자·친구 구조 장면이 끝나 있고 멈춤이 아닐 때 나온다.
// - 입간판·작은 탁자(빈 의자) 옆에 "소개팅 짝"(남학생·여학생 무작위)이 서 있다. 가까이 가서 E(터치: 참가 버튼)로 참가.
//   30초 안에 안 오면 말없이 사라진다.
// - 이벤트가 나올 차례이거나 진행 중이면 과제 차례가 끝나지 않는다 (holds → main.ts studentHost().holdWave).
// - 참가하면 싸움이 멈춘다 (Game.tick이 step을 돌리지 않고 tickModal만 부른다). 화면 가운데 화살표 판.
//   기억력 3라운드: 화살표 3개 → 4개 → 5개. 줄 전체를 개수 × 0.6초 보여 주고 감춘 뒤 순서대로 누른다 (누르는 시간제한 없음, 난이도 무관).
//   한 판 통틀어 한 번은 봐준다 (같은 라운드를 새 화살표로 다시). 두 번째 틀리면 끝.
// - 입력: 방향키·WASD (판이 떠 있는 동안 이동으로 가지 않게 가로챈다), 터치는 판 아래 화살표 단추 넷.
// - 성공: 짝이 "○○야 마루기 갈래용?" 하고 체력을 모두 채워 준 뒤 손을 흔들며 떠난다. 실패: "줴줴이야~~", 불이익 없이 떠난다.
// - 사람(짝)은 다치지 않는다 (적 목록에 없다). 교직원 모드에서는 나오지 않는다.

type State = 'idle' | 'wait' | 'game' | 'talk' | 'out';
type Phase = 'intro' | 'show' | 'input' | 'ok' | 'retry' | 'end';
/** 0 ← · 1 ↑ · 2 → · 3 ↓ */
export type Dir = 0 | 1 | 2 | 3;

/** 소개팅이 나올 수 있는 학생 구역 (stu.areaNo) */
export const DATE_AREAS = [2, 3, 4];
/** 말을 걸지 않으면 사라지는 시간 (초) */
export const DATE_WAIT_T = 30;
/** 화살표 하나당 보여 주는 시간 (초): 줄 전체를 개수 × 이만큼 보여 준다 */
export const SHOW_PER = 0.6;
/** 라운드별 화살표 수 */
export const ROUND_LEN = [3, 4, 5];
/** 플레이어 앞 몇 m에 차리는지, E가 닿는 거리 */
const SPOT_D = 9;
const NEAR = 3.6;
/** 판 안 연출 시간 (초): 줄 보여 주기 전 · 라운드 통과 뒤 · 한 번 틀린 뒤 · 끝난 뒤 */
const INTRO_T = 0.8;
const OK_T = 0.9;
const RETRY_T = 1.4;
const END_T = 1.1;

/** 확정 문구 (사용자 2026-11-20, 글자 그대로) */
const T = {
  name: '소개팅 짝',
  title: '로테이션 소개팅이 열렸어요',
  sub: '가까이 가서 E — 참가하기',
  // ★ 터치 화면용 (E 대신 참가 버튼)
  subTouch: '가까이 가서 참가 버튼 — 참가하기',
  join: '참가하기',
  btn: '참가',
  signTop: '로테이션 소개팅',
  signBottom: '참가자 모집 중',
  guide: '화살표를 기억했다가 순서대로 누르세요',
  pass: '통했어요!',
  retry: '앗, 어색한 침묵… 한 번 더!',
  winNote: '짝이 됐어요! 체력 모두 회복',
  fail: '줴줴이야~~',
  failNote: '다음 기회에…',
} as const;
const tableTitle = (n: number) => `로테이션 소개팅 — ${n}번 테이블`;
/** 성공 대사: 고른 학생 주인공 이름 + 야/아 */
export const winLine = (hero: string) => `${vocative(hero)} 마루기 갈래용?`;

/** Game이 빌려주는 것 (main.ts datingHost) */
export interface DatingHost {
  readonly touch: boolean;
  readonly scene: THREE.Scene;
  readonly mode: 'staff' | 'student';
  readonly playing: boolean;
  readonly pos: THREE.Vector3;
  readonly yaw: number;
  /** 지금 구역 경계 (학생 모드는 학생 경로의 지금 구역) */
  readonly area: Rect;
  /** 서지 말아야 할 곳 (장애물·상자·자판기) */
  solids(): readonly Rect[];
  /** stu.areaNo */
  areaNo(): number;
  /** stu.inWave: 지금 과제(행정) 차례 중 */
  waveOk(): boolean;
  /** 지금 바로 차려도 되는지 (조력자·친구 구조 장면·구역 카드·멈춤이 없을 때) */
  free(): boolean;
  /** 고른 학생 주인공 이름 */
  heroName(): string;
  /** 체력을 모두 채운다 */
  healFull(): void;
  /** 눌린 키·발사를 지운다 (판을 열고 닫을 때) */
  resetInput(): void;
  banner(title: string, sub?: string): void;
  note(text: string, time?: number): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
}

const SKIN = 0xf1c7a0;
const LOOKS: Record<'boy' | 'girl', Look> = {
  // 남색 후드티
  boy: { top: 0x23395d, pants: 0x2d3240, tie: 0x23395d, noTie: true, skin: SKIN, hair: 0x1f1a16, brow: 0x1f1a16, hairStyle: 'full', jacket: false, hoodie: true, smile: true, shoes: 0xf4f4f4, left: 'none', scale: 1.35 },
  // 분홍 재킷 + 흰 티, 긴 머리
  girl: { top: 0xf2b8c6, pants: 0x4a5066, tie: 0xf2b8c6, noTie: true, skin: SKIN, hair: 0x3a2a20, brow: 0x3a2a20, hairStyle: 'long', jacket: false, tee: 0xfdfdfd, smile: true, shoes: 0xf4f4f4, left: 'none', scale: 1.35 },
};

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const UNIT = new THREE.BoxGeometry(1, 1, 1);

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 하트 (캔버스) */
function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.3);
  c.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.78, x, y + s);
  c.bezierCurveTo(x, y + s * 0.78, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  c.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  c.fill();
}

/** 글자가 넓으면 줄여서 한 줄로 */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight: number, maxW: number): void {
  let s = size;
  c.font = `${weight} ${s}px ${FONT}`;
  while (s > 12 && c.measureText(text).width > maxW) {
    s -= 2;
    c.font = `${weight} ${s}px ${FONT}`;
  }
  c.fillText(text, x, y);
}

/** 소개팅 자리: 둥근 탁자(분홍 보)·꽃병·빈 의자·입간판. 앞(+z) = 플레이어 쪽, 짝은 원점(탁자 뒤)에 선다 */
function buildBooth(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), lam(0xfdfdfd));
  top.position.set(0, 0.86, 0.95);
  top.castShadow = true;
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.36, 16), lam(0xf7a8c0));
  cloth.position.set(0, 0.67, 0.95);
  cloth.castShadow = true;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.84, 8), lam(0x555b66));
  leg.position.set(0, 0.42, 0.95);
  g.add(top, cloth, leg);
  // 꽃병
  box(g, 0.1, 0.16, 0.1, 0.18, 0.97, 0.9, lam(0x9fd3ff));
  box(g, 0.14, 0.12, 0.14, 0.18, 1.11, 0.9, lam(0xe5484d));
  // 빈 의자 (플레이어 자리, 등받이는 플레이어 쪽)
  const white = lam(0xfdfdfd);
  const steel = lam(0x555b66);
  box(g, 0.42, 0.06, 0.42, 0, 0.5, 1.75, white);
  box(g, 0.42, 0.5, 0.06, 0, 0.78, 1.95, white);
  for (const [x, z] of [[-0.17, 1.58], [0.17, 1.58], [-0.17, 1.92], [0.17, 1.92]]) box(g, 0.05, 0.48, 0.05, x, 0.24, z, steel);
  // 입간판 (A자 받침)
  const tex = canvasTex(320, 400, (c) => {
    c.fillStyle = '#ff7fa8';
    c.fillRect(0, 0, 320, 400);
    c.fillStyle = '#fff';
    c.fillRect(14, 14, 292, 372);
    c.fillStyle = '#e5386d';
    heart(c, 160, 52, 84);
    c.fillStyle = '#ff9fbf';
    heart(c, 70, 300, 30);
    heart(c, 250, 300, 30);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#e5386d';
    fitText(c, T.signTop, 160, 196, 40, 800, 280);
    c.fillStyle = '#23395d';
    fitText(c, T.signBottom, 160, 258, 30, 700, 270);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(1.75, 1.0, 0.85);
  sign.rotation.x = -0.12;
  sign.castShadow = true;
  g.add(sign);
  const frame = lam(0x8a5a2b);
  box(g, 0.05, 1.45, 0.05, 1.27, 0.7, 0.8, frame);
  box(g, 0.05, 1.45, 0.05, 2.23, 0.7, 0.8, frame);
  const back = box(g, 1.0, 1.2, 0.04, 1.75, 0.66, 0.6, frame);
  back.rotation.x = 0.2;
  return g;
}

/** 구역 안, 장애물 밖으로 (trapped.ts와 같은 방식) */
function placeIn(a: Rect, solids: readonly Rect[], x: number, z: number, margin: number): [number, number] {
  const M = 1.6;
  for (let it = 0; it < 3; it++) {
    x = Math.max(a.minX + margin, Math.min(a.maxX - margin, x));
    z = Math.max(a.minZ + margin, Math.min(a.maxZ - margin, z));
    for (const o of solids) {
      if (x <= o.minX - M || x >= o.maxX + M || z <= o.minZ - M || z >= o.maxZ + M) continue;
      const opts: [number, number, number][] = [
        [x - (o.minX - M), o.minX - M, z],
        [o.maxX + M - x, o.maxX + M, z],
        [z - (o.minZ - M), x, o.minZ - M],
        [o.maxZ + M - z, x, o.maxZ + M],
      ];
      opts.sort((p, q) => p[0] - q[0]);
      const ok = opts.find(([, nx, nz]) => nx >= a.minX && nx <= a.maxX && nz >= a.minZ && nz <= a.maxZ) ?? opts[0];
      x = ok[1];
      z = ok[2];
    }
  }
  return [x, z];
}

const ARROWS = ['←', '↑', '→', '↓'];
const KEY_DIR: Record<string, Dir> = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };

const _a = new THREE.Vector3();

export class Dating {
  state: State = 'idle';
  /** 이번 판에 소개팅이 나올 구역 (stu.areaNo) */
  eventArea = DATE_AREAS[0];
  /** 이번 판 소개팅이 나왔다 (한 판에 한 번) */
  done = false;
  /** 시험용: 결과 ('win' | 'fail' | 'ignored') */
  result = '';
  /** 시험용: 이번 짝 ('boy' | 'girl') */
  partner: 'boy' | 'girl' = 'boy';
  /** 지금 E·참가를 누를 수 있다 */
  near = false;
  /** 화살표 판이 떠 있다 (싸움이 멈춘다) */
  modal = false;
  /** 시험용: 화살표 판 상태 */
  readonly game = { round: 0, seq: [] as Dir[], pos: 0, phase: 'intro' as Phase, t: 0, retried: false, win: false };
  private readonly people: Record<'boy' | 'girl', Person>;
  private who: Person | null = null;
  private readonly obj = new THREE.Group();
  private readonly booth: THREE.Group;
  private readonly anchor = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private readonly pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
  private t = 0;
  private waitT = -1;
  private won = false;
  private uiKey = '';
  private badT = 0;
  private readonly el: DateDom;

  constructor(private readonly h: DatingHost) {
    const mk = (k: 'boy' | 'girl') => {
      const p = new Person('meeting', T.name, '#ffb4d0', LOOKS[k]);
      // 학생은 결재판을 들지 않는다
      p.clip.visible = false;
      return p;
    };
    this.people = { boy: mk('boy'), girl: mk('girl') };
    this.booth = buildBooth();
    this.obj.visible = false;
    this.booth.visible = false;
    h.scene.add(this.obj, this.booth);
    // 대사 그림 (1인칭 학생 주인공 여섯 이름마다)
    prepareSpeech([...FPS_STUDENT_HEROES.map((s) => winLine(s.name)), T.fail]);
    this.el = ensureDom((d) => this.press(d));
    const btn = this.el.btn;
    if (btn) {
      btn.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          this.use();
        },
        { passive: false },
      );
      btn.addEventListener('click', () => this.use());
    }
    this.plan();
  }

  /** 이번 판 소개팅 구역을 정한다 */
  private plan(): void {
    this.eventArea = DATE_AREAS[Math.floor(Math.random() * DATE_AREAS.length)];
  }

  /** 소개팅이 나올 차례이거나 진행 중이면 과제 차례를 붙잡는다 (main.ts studentHost().holdWave) */
  holds(): boolean {
    if (this.state !== 'idle') return true;
    const h = this.h;
    return h.mode === 'student' && !this.done && h.areaNo() === this.eventArea && h.waveOk();
  }

  /** 시험용 (?debug): 구역·차례와 상관없이 지금 바로 (학생 모드만) */
  call(): boolean {
    if (this.state !== 'idle' || this.h.mode !== 'student') return false;
    return this.begin();
  }

  // ---------- 매 단계 (판이 떠 있는 동안은 불리지 않는다) ----------

  update(dt: number): void {
    const h = this.h;
    this.near = false;
    if (this.state === 'idle') {
      if (!h.playing || h.mode !== 'student' || this.done || h.areaNo() !== this.eventArea || !h.waveOk()) {
        this.waitT = -1;
        return;
      }
      // 과제 차례가 시작되고 3~5초 뒤, 앞 장면(조력자·구조)이 없을 때 차린다
      if (this.waitT < 0) this.waitT = 3 + Math.random() * 2;
      this.waitT -= dt;
      if (this.waitT <= 0 && h.free()) this.begin();
      return;
    }
    const who = this.who;
    if (!who) return;
    this.t += dt;
    const pose = this.pose;
    pose.walking = false;
    pose.wave = false;
    pose.raise = 0;
    pose.reach = 0;
    const dPlayer = Math.hypot(h.pos.x - this.anchor.x, h.pos.z - this.anchor.z);
    switch (this.state) {
      case 'wait':
        // 플레이어를 보고, 가까이 오면 손을 흔든다
        this.face(h.pos.x, h.pos.z, dt);
        pose.wave = dPlayer < 9;
        this.near = h.playing && dPlayer < NEAR;
        if (this.t >= DATE_WAIT_T) this.leave();
        break;
      case 'talk':
        this.face(h.pos.x, h.pos.z, dt);
        pose.wave = this.won && this.t > 1.2;
        if (this.t >= 3) this.go('out');
        break;
      case 'out': {
        // 성공했으면 손을 흔들며 떠난다. 탁자·입간판은 땅으로 내려간다
        pose.walking = true;
        pose.wave = this.won;
        const o = this.obj.position;
        _a.set(this.exit.x - o.x, 0, this.exit.z - o.z);
        const d = _a.length();
        this.booth.position.y = -Math.min(2.4, this.t * 1.4);
        if (d < 0.3 || this.t > 6) {
          this.finish();
          return;
        }
        o.addScaledVector(_a.normalize(), Math.min(d, 3.4 * dt));
        this.face(this.exit.x, this.exit.z, dt);
        break;
      }
      default:
        break;
    }
    who.update(dt, pose);
  }

  // ---------- 시작 · 끝 ----------

  private begin(): boolean {
    const h = this.h;
    this.done = true;
    this.result = '';
    this.won = false;
    this.t = 0;
    this.waitT = -1;
    const solids = h.solids();
    const p = h.pos;
    // 자리: 플레이어 앞 9m (구역 끝·장애물을 피해 옆으로)
    let best = -1;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const ang = h.yaw + da;
      const [x, z] = placeIn(h.area, solids, p.x - Math.sin(ang) * SPOT_D, p.z - Math.cos(ang) * SPOT_D, 3);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > best + 0.5) {
        best = d;
        this.anchor.set(x, 0, z);
      }
    }
    // 나가는 곳: 플레이어 반대쪽으로 14m
    const ox = this.anchor.x - p.x;
    const oz = this.anchor.z - p.z;
    const ol = Math.hypot(ox, oz) || 1;
    const [ex, ez] = placeIn(h.area, solids, this.anchor.x + (ox / ol) * 14, this.anchor.z + (oz / ol) * 14, 0.6);
    this.exit.set(ex, 0, ez);
    this.partner = Math.random() < 0.5 ? 'boy' : 'girl';
    const who = (this.who = this.people[this.partner]);
    who.reset();
    who.root.position.set(0, 0, 0);
    this.obj.add(who.root);
    const yaw = Math.atan2(p.x - this.anchor.x, p.z - this.anchor.z);
    for (const g of [this.obj, this.booth]) {
      g.position.copy(this.anchor);
      g.rotation.y = yaw;
      g.visible = true;
    }
    this.state = 'wait';
    h.banner(T.title, h.touch ? T.subTouch : T.sub);
    h.sound('open', this.anchor, 0.8);
    return true;
  }

  /** E 키 / 참가 단추: 가까이 있으면 화살표 판을 연다. 썼으면 true */
  use(): boolean {
    if (this.state !== 'wait' || !this.near || this.modal || !this.h.playing) return false;
    this.openGame();
    return true;
  }

  /** 30초 동안 안 왔다: 말없이 떠난다 */
  private leave(): void {
    this.result = 'ignored';
    this.won = false;
    this.go('out');
  }

  /** 화살표 판이 끝났다 (판은 이미 닫혔다, 싸움이 다시 돈다) */
  private end(win: boolean): void {
    const h = this.h;
    const who = this.who as Person;
    this.result = win ? 'win' : 'fail';
    this.won = win;
    if (win) {
      who.say(winLine(h.heroName()), 3);
      h.healFull();
      h.note(T.winNote, 2.6);
      h.sound('clear', undefined, 0.8);
    } else {
      who.say(T.fail, 2.6);
      h.note(T.failNote, 2.2);
    }
    this.go('talk');
  }

  private finish(): void {
    if (this.who) {
      this.who.tag.hide();
      this.obj.remove(this.who.root);
    }
    this.who = null;
    this.obj.visible = false;
    this.booth.visible = false;
    this.booth.position.y = 0;
    this.state = 'idle';
  }

  private go(s: State): void {
    this.state = s;
    this.t = 0;
  }

  private face(x: number, z: number, dt: number): void {
    const o = this.obj;
    let d = Math.atan2(x - o.position.x, z - o.position.z) - o.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    o.rotation.y += d * Math.min(1, dt * 6);
  }

  /** 판을 처음으로 (재시작·타이틀) */
  clear(): void {
    this.closeGame();
    this.finish();
    this.done = false;
    this.result = '';
    this.waitT = -1;
    this.near = false;
    this.plan();
  }

  // ---------- 화살표 판 (기억력 3라운드) ----------

  private openGame(): void {
    this.state = 'game';
    this.modal = true;
    this.h.resetInput();
    const g = this.game;
    g.round = 0;
    g.retried = false;
    g.win = false;
    this.h.sound('tick', undefined, 0.8);
    this.startRound();
  }

  private closeGame(): void {
    if (!this.modal) return;
    this.modal = false;
    this.h.resetInput();
  }

  /** 라운드 시작 (틀려서 다시 할 때도 새 화살표로) */
  private startRound(): void {
    const g = this.game;
    const n = ROUND_LEN[g.round];
    g.seq = [];
    for (let i = 0; i < n; i++) g.seq.push(Math.floor(Math.random() * 4) as Dir);
    g.pos = 0;
    g.phase = 'intro';
    g.t = INTRO_T;
    this.el.title.textContent = tableTitle(g.round + 1);
    this.msg(T.guide, '');
    this.drawRow();
  }

  private msg(text: string, tone: '' | 'good' | 'bad'): void {
    const m = this.el.msg;
    m.textContent = text;
    m.className = `msg ${tone}`;
  }

  private drawRow(): void {
    const g = this.game;
    let html = '';
    for (let i = 0; i < g.seq.length; i++) {
      let cls = '';
      let show = true;
      switch (g.phase) {
        case 'intro':
          show = false;
          break;
        case 'show':
          cls = 'show';
          break;
        case 'input':
          show = i < g.pos;
          cls = show ? 'hit' : '';
          break;
        case 'ok':
          cls = 'hit';
          break;
        default:
          // 틀렸을 때: 맞힌 데까지 초록, 틀린 자리는 빨강(정답), 나머지는 정답을 보여 준다
          cls = g.win || i < g.pos ? 'hit' : i === g.pos ? 'miss' : 'show';
          break;
      }
      html += `<i class="${cls}">${show ? ARROWS[g.seq[i]] : '?'}</i>`;
    }
    this.el.row.innerHTML = html;
  }

  /** 판 시간 (싸움이 멈춘 동안 Game.tick이 부른다) */
  tickModal(dt: number): void {
    if (!this.modal) return;
    if (this.badT > 0) {
      this.badT -= dt;
      if (this.badT <= 0) this.el.row.classList.remove('bad');
    }
    const g = this.game;
    if (g.phase === 'input') return;
    g.t -= dt;
    if (g.t > 0) return;
    switch (g.phase) {
      case 'intro':
        g.phase = 'show';
        g.t = g.seq.length * SHOW_PER;
        break;
      case 'show':
        g.phase = 'input';
        break;
      case 'ok':
        g.round++;
        this.startRound();
        return;
      case 'retry':
        // 같은 라운드를 새 화살표로
        this.startRound();
        return;
      case 'end':
        this.closeGame();
        this.end(g.win);
        return;
      default:
        break;
    }
    this.drawRow();
  }

  /** 화살표 하나를 눌렀다 (0 ← 1 ↑ 2 → 3 ↓). 시험용으로도 부른다 */
  press(d: Dir): void {
    const g = this.game;
    if (!this.modal || g.phase !== 'input' || !this.h.playing) return;
    const h = this.h;
    if (g.seq[g.pos] === d) {
      g.pos++;
      h.sound('tick', undefined, 0.8);
      if (g.pos >= g.seq.length) {
        h.sound('process', undefined, 0.9);
        this.msg(T.pass, 'good');
        if (g.round >= ROUND_LEN.length - 1) {
          g.win = true;
          g.phase = 'end';
          g.t = END_T;
        } else {
          g.phase = 'ok';
          g.t = OK_T;
        }
      }
      this.drawRow();
      return;
    }
    h.sound('fall', undefined, 0.8);
    if (!g.retried) {
      // 한 판에 한 번은 봐준다
      g.retried = true;
      g.phase = 'retry';
      g.t = RETRY_T;
      this.msg(T.retry, 'bad');
    } else {
      g.win = false;
      g.phase = 'end';
      g.t = END_T;
      this.msg(T.failNote, 'bad');
    }
    this.drawRow();
    this.el.row.classList.add('bad');
    this.badT = 0.4;
  }

  /** 판이 떠 있으면 방향키·WASD를 가져가고, Esc·P·M 말고는 게임 키로 보내지 않는다. 처리했으면 true */
  key(e: KeyboardEvent): boolean {
    if (!this.modal || !this.h.playing) return false;
    const d = KEY_DIR[e.code];
    if (d === undefined) return e.code !== 'Escape' && e.code !== 'KeyP' && e.code !== 'KeyM';
    e.preventDefault();
    if (!e.repeat) this.press(d);
    return true;
  }

  // ---------- 화면 ----------

  /** E 안내, 터치 참가 단추, 화살표 판 (매 프레임, 일시정지 중에도) */
  syncUi(play: boolean): void {
    const g = this.game;
    // 일시정지되면 판을 감춘다. 보여 주던 중이었으면 이어서 할 때 처음부터 다시 보여 준다
    if (this.modal && !play && g.phase === 'show') {
      g.phase = 'intro';
      g.t = INTRO_T;
      this.drawRow();
    }
    const on = play && this.near && !this.modal && this.state === 'wait';
    const panel = play && this.modal;
    const key = `${on ? 1 : 0}|${panel ? 1 : 0}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    const el = this.el;
    el.hint.classList.toggle('on', on);
    el.btn?.classList.toggle('on', on);
    el.panel.classList.toggle('on', panel);
  }

  /** 미리 그리기: 짝 둘과 탁자·입간판 */
  warm(group: THREE.Group): () => void {
    const tmp = new THREE.Group();
    tmp.position.set(-6, -1.6, -6);
    const ppl = Object.values(this.people);
    ppl.forEach((p, i) => {
      p.root.position.set(i * 1.2, 0, 0);
      p.say('…', 1, false);
      p.update(0.016, { walking: true, raise: 0, reach: 0, wave: true });
      tmp.add(p.root);
    });
    this.booth.visible = true;
    this.booth.position.set(3, 0, 0);
    tmp.add(this.booth);
    group.add(tmp);
    return () => {
      group.remove(tmp);
      for (const p of ppl) {
        tmp.remove(p.root);
        p.reset();
        p.root.position.set(0, 0, 0);
      }
      this.booth.visible = false;
      this.booth.position.set(0, 0, 0);
      this.h.scene.add(this.booth);
    };
  }
}

// ---------- 화면 조각 (fps.html은 그대로 두고 여기서 넣는다) ----------

/** E 안내 · 터치 참가 단추 · 화살표 판 */
interface DateDom {
  hint: HTMLElement;
  btn: HTMLElement | null;
  panel: HTMLElement;
  title: HTMLElement;
  msg: HTMLElement;
  row: HTMLElement;
}

// 판은 일시정지 화면(#overlay, z-index 5) 아래 (z-index 4)
const CSS = `
#dateHint { left: 50%; top: calc(50% + 22px); transform: translateX(-50%); padding: 3px 14px 4px; border-radius: 999px;
  background: rgba(17,19,24,.78); border: 2px solid #ff9fbf; font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: none; opacity: 0; transition: opacity .15s; }
#dateHint b { display: inline-block; min-width: 18px; margin-right: 6px; padding: 0 4px; border-radius: 4px; background: #ff9fbf; color: #111318; text-align: center; }
#dateHint.on { opacity: 1; }
body.touch #dateHint { display: none; }
#dateBtn { position: fixed; right: calc(150px * var(--bs) + var(--sa-r)); bottom: calc(112px * var(--bs) + var(--sa-b)); width: calc(66px * var(--bs)); height: calc(66px * var(--bs));
  border-radius: 50%; border: 3px solid #111318; background: #e5386d; color: #fff; font: 700 calc(16px * var(--bs)) 'Malgun Gothic', sans-serif;
  display: none; box-shadow: 0 0 12px #ff9fbf; touch-action: none; }
#dateBtn.on { display: block; }
#datePanel { position: fixed; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 4; display: none; box-sizing: border-box;
  width: min(440px, 92vw); padding: 14px 18px 16px; border-radius: 16px; background: rgba(255, 246, 250, .97); border: 3px solid #e5386d;
  color: #23395d; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; text-align: center; text-shadow: none;
  box-shadow: 0 10px 40px rgba(0,0,0,.45); user-select: none; -webkit-user-select: none; }
#datePanel.on { display: block; }
#datePanel h3 { margin: 0 0 4px; font-size: 20px; font-weight: 800; color: #e5386d; }
#datePanel .msg { min-height: 22px; font-size: 15px; font-weight: 700; color: #23395d; }
#datePanel .msg.good { color: #1f7a4d; }
#datePanel .msg.bad { color: #d0202f; }
#datePanel .row { display: flex; justify-content: center; gap: 8px; margin: 12px 0 2px; }
#datePanel .row i { width: 50px; height: 50px; box-sizing: border-box; border-radius: 10px; background: #fff; border: 2px solid #f7a8c0;
  font: 800 30px/46px 'Malgun Gothic', sans-serif; font-style: normal; color: #c9ced8; }
#datePanel .row i.show { color: #e5386d; border-color: #e5386d; }
#datePanel .row i.hit { color: #fff; background: #1f7a4d; border-color: #1f7a4d; }
#datePanel .row i.miss { color: #fff; background: #e5484d; border-color: #e5484d; }
#datePanel .row.bad { animation: dateShake .35s; }
@keyframes dateShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
#datePanel .pad { display: none; margin-top: 10px; grid-template-columns: repeat(3, 58px); grid-template-rows: repeat(2, 58px); gap: 6px; justify-content: center; }
body.touch #datePanel .pad { display: grid; }
#datePanel .pad button { border-radius: 10px; border: 2px solid #23395d; background: #fff; font: 800 26px 'Malgun Gothic', sans-serif; color: #23395d;
  touch-action: none; padding: 0; }
#datePanel .pad button:active { background: #ffe1ec; }
@media (max-height: 500px) {
  #datePanel { top: 50%; padding: 10px 14px 12px; }
  #datePanel h3 { font-size: 17px; }
  #datePanel .row { margin: 8px 0 2px; }
  #datePanel .row i { width: 42px; height: 42px; font-size: 25px; line-height: 38px; }
  #datePanel .pad { margin-top: 6px; grid-template-columns: repeat(3, 50px); grid-template-rows: repeat(2, 50px); }
  #dateBtn { right: calc(136px * var(--bs) + var(--sa-r)); bottom: calc(96px * var(--bs) + var(--sa-b)); width: calc(60px * var(--bs)); height: calc(60px * var(--bs)); font-size: calc(15px * var(--bs)); }
}
`;

let dom: DateDom | null = null;

/** E 안내, 터치 참가 단추, 화살표 판을 한 번 넣는다 */
function ensureDom(press: (d: Dir) => void): DateDom {
  if (dom) return dom;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const hint = document.createElement('div');
  hint.id = 'dateHint';
  hint.className = 'hud';
  hint.innerHTML = `<b>E</b>${T.join}`;
  document.body.appendChild(hint);
  let btn: HTMLElement | null = null;
  const touch = document.getElementById('touch');
  if (touch) {
    btn = document.createElement('button');
    btn.id = 'dateBtn';
    (btn as HTMLButtonElement).type = 'button';
    btn.textContent = T.btn;
    touch.appendChild(btn);
  }
  const panel = document.createElement('div');
  panel.id = 'datePanel';
  panel.innerHTML = '<h3></h3><div class="msg"></div><div class="row"></div><div class="pad"></div>';
  const pad = panel.querySelector('.pad') as HTMLElement;
  // 3×2: (빈칸 ↑ 빈칸) (← ↓ →)
  for (const d of [-1, 1, -1, 0, 3, 2]) {
    if (d < 0) {
      pad.appendChild(document.createElement('span'));
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = ARROWS[d];
    b.dataset.dir = String(d);
    let touched = false;
    b.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        touched = true;
        press(d as Dir);
      },
      { passive: false },
    );
    b.addEventListener('click', () => {
      if (!touched) press(d as Dir);
      touched = false;
    });
    pad.appendChild(b);
  }
  document.body.appendChild(panel);
  dom = {
    hint,
    btn,
    panel,
    title: panel.querySelector('h3') as HTMLElement,
    msg: panel.querySelector('.msg') as HTMLElement,
    row: panel.querySelector('.row') as HTMLElement,
  };
  return dom;
}
