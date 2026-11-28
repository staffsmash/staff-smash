import * as THREE from 'three';
import { ARM_IDS, type ArmId } from './arms';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import type { Fx } from './fx';
import type { FoodKind, Models } from './models';
import { guardLook } from './looks';
import { Person } from './people';
import { prepareSpeech, prepareTag, showSubtitle } from './speech';
import { canvasTex, FONT, NAVY } from './textures';

// 1인칭 시험판: 무기를 주는 사람·기계와 부수는 상자 (2026-11-14).
// - 교직원 모드: 구역마다 경비 선생님(이름 없음, 남색 제복·근무모)이 서 있다. 가까이(3.5m)에서 바라보고 E(터치: 인사 버튼)
//   → "안녕하세요!" → 경비 선생님 "네, 수고 많으십니다! 이거 쓰세요." → 무기 하나. 10초 안에 또 인사하면 "방금 드렸잖아요~".
//   도장으로 경비 선생님을 맞히면 "어허, 인사부터 하셔야죠." 하고 6초 동안 등을 돌린다. 다치지 않고 민원도 노리지 않는다.
//   11차(2026-11-21): 구역마다 남녀가 번갈아 선다 (본관 앞 남 · 사회과학관 앞 여 · 인문과학관 앞 남 · 국제학사 앞 여 · 대운동장 남 · 해 질 녘 본관 앞 여).
// - 학생 모드: 같은 자리에 "도서 무인 대출기"(기계). E(대여 버튼) → "도서 대여 완료!" → 무기 (전공책이 가장 잦다). 10초 동안 "대출 처리 중…".
// - 부수는 상자: 구역마다 2~3개. 교직원 "조기출근 박스"(종이 상자), 학생 "수강편람"(두꺼운 책자 더미).
//   2~3번 맞히면 부서지고 식권(25%)이나 음식이 나온다 (2026-11-17: 교직원은 늘 식권 1장 → 자판기, vending.ts). 상자는 민원(잡몹)이 아니다: 차례 정리·조준 보조와 상관없다.
// 사람·기계·상자는 걸어서 통과하지 못한다 (solids → Game.move).
//
// 결정 61 (2026-11-28) ★ — "구역"은 경비 선생님(대출기)이 서 있는 자리 하나다 (길이 열리면 다음 구역으로 먼저 옮겨 가고, 그때 아래 숫자는 0부터).
// - 아이템과 인사를 번갈아: 받아 줄 때마다 아이템 → 인사만 → 아이템 …(구역마다 아이템부터). 아이템 차례는 10초 대기를 지키고,
//   대기 중이면 지금처럼 "방금 드렸잖아요~"/"대출 처리 중…" (차례는 그대로). 인사만 차례 대사 "네, 반갑습니다! 오늘도 힘내세요." /
//   대출기 "반갑습니다! 오늘도 열공하세요."
// - 인사 15번 → 그 구역 동안 필살기 무한 (infinite → Game.keepSpFull, 게이지·터치 단추에 "∞"). 아이템·인사만·"방금 드렸잖아요" 모두 센다.
//   토라져서 거절한 인사는 세지 않는다. 10번째에 힌트 한마디. 이어하기(같은 구역 처음부터)도 0부터.
// - 도장(무기)으로 20번 맞히면 화난 마귀: 빨간 얼굴·뿔 두 개·빛나는 노란 눈·송곳니, 이름표 "화난 경비 선생님"
//   (대출기는 화면에 같은 마귀 얼굴·"폭주한 도서 무인 대출기", 바닥을 미끄러지듯). 1~19번은 무례 반응 (대출기도 "삐— 비정상적인 이용입니다." + 6초).
//   마귀는 보통 사람 걸음으로 쫓아오고 가까우면 0.5초 예고(팔 들기·화면 번쩍) 뒤 때린다 — 맞으면 3칸 (Game.devilHurt: 난이도·장점 배율 없음,
//   무적·연차 쿠폰은 평소대로). 도장 10발이면 원래 얼굴로 돌아와 제자리로 가고, 그 구역에서는 더 주지 않는다 (인사 15번도 꺼진다).
//   마귀는 Game.enemies에 넣지 않는다: 구역 정리·차례 끝 판정을 막지 않고, 처리 수·평정·연속·필살기 충전·배지에도 들어가지 않는다.
// - 시험 지름길 (?debug): __fps.props.eggGreet(n) · eggHit(n) — n번 센 것으로 (15·20 이상이면 바로).

export type Place = 'yard' | 'plaza' | 'hum' | 'dorm' | 'field' | 'final';

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
  /** 고른 주인공 이름 (교직원·학생 모두) */
  playerName(): string;
  /** 고른 주인공 id (교직원 heroes.ts, 학생 students.ts) */
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
  /** 화난 마귀에게 맞았다: 3칸 (난이도·장점 배율 없이, 무적·연차 쿠폰은 평소대로 — 결정 61) */
  devilHurt(from: THREE.Vector3): void;
}

interface Spot {
  /** 경비 선생님·대출기 자리 */
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
    // 인문과학관 앞: 남서쪽 입구(PATH3) 옆, 국제학사 앞: 북쪽 입구(PATH4) 옆, 대운동장: 동쪽 철망 문(PATH5) 안쪽
    hum: { npc: [151, 27], look: [149, 37], boxes: [[156, 8], [168, 21], [167, -15], [154, -12]] },
    dorm: { npc: [159.5, 62], look: [165, 59], boxes: [[178, 74], [188, 88], [168, 95], [184, 70]] },
    field: { npc: [130, 60.6], look: [136, 66], boxes: [[75, 72], [116, 78], [108, 96], [80, 97]] },
    final: { npc: [-9, 14], look: [0, 6], boxes: [[-17, 3], [17, 3], [-14, 11]] },
  },
  student: {
    field: { npc: [87.5, 60.8], look: [95, 63], boxes: [[84, 70], [107, 68], [100, 92], [77, 90]] },
    // 학생 모드(거꾸로): 국제학사 앞은 서쪽 철망 문(PATH5) 옆, 인문과학관 앞은 남쪽 입구(PATH4) 옆
    dorm: { npc: [160.5, 74], look: [158, 66], boxes: [[172, 84], [186, 96], [178, 64], [190, 76]] },
    hum: { npc: [171.5, 36], look: [165, 39], boxes: [[156, 6], [168, -14], [152, 20], [170, 16]] },
    plaza: { npc: [106, 15.5], look: [95, 13], boxes: [[86, -9], [100, -13], [112, 5], [82, 3]] },
    yard: { npc: [21.5, 10], look: [22, 1], boxes: [[12, -2], [-12, 3], [-18, 12], [5, 13]] },
    final: { npc: [-9, 14], look: [0, 6], boxes: [[-17, 3], [17, 3], [-14, 11]] },
  },
};

/** 지금 구역과 (길 위라면) 다음 구역 (자판기 vending.ts도 쓴다) */
export function placesOf(mode: 'staff' | 'student', stage: string): [Place, Place] {
  if (stage === 'final' || stage === 'done') return ['final', 'final'];
  if (mode === 'student') {
    // 학생: 대운동장 → (국제학사 앞 → 인문과학관 앞 →) 사회과학관 앞 → 본관 앞 → 총장실
    if (stage === 'path5') return ['field', 'dorm'];
    if (stage === 'dorm' || stage === 'dormClear') return ['dorm', 'dorm'];
    if (stage === 'path4') return ['dorm', 'hum'];
    if (stage === 'hum' || stage === 'humClear') return ['hum', 'hum'];
    if (stage === 'path3') return ['hum', 'plaza'];
    if (stage === 'path2') return ['field', 'plaza'];
    if (stage === 'path') return ['plaza', 'yard'];
    if (stage === 'plaza' || stage === 'plazaClear') return ['plaza', 'plaza'];
    if (stage === 'yard' || stage === 'yardBoss' || stage === 'yardClear') return ['yard', 'yard'];
    return ['field', 'field'];
  }
  // 교직원: 본관 앞 → 사회과학관 앞 → 인문과학관 앞 → 국제학사 앞 → 대운동장 → 해 질 녘 본관 앞
  if (stage === 'path') return ['yard', 'plaza'];
  if (stage === 'path2') return ['plaza', 'field'];
  if (stage === 'path3') return ['plaza', 'hum'];
  if (stage === 'path4') return ['hum', 'dorm'];
  if (stage === 'path5') return ['dorm', 'field'];
  if (stage === 'toFinal') return ['field', 'final'];
  if (stage === 'plaza' || stage === 'plazaClear') return ['plaza', 'plaza'];
  if (stage === 'hum' || stage === 'humClear') return ['hum', 'hum'];
  if (stage === 'dorm' || stage === 'dormClear') return ['dorm', 'dorm'];
  if (stage === 'field' || stage === 'fieldClear') return ['field', 'field'];
  return ['yard', 'yard'];
}

/** 대사 (결정 61 ★: 인사만 · 10번째 힌트 · 마귀 외침 · 처리된 뒤 · 다 준 뒤) */
const L = {
  rude: '어허, 인사부터 하셔야죠.',
  give: '네, 수고 많으십니다! 이거 쓰세요.',
  again: '방금 드렸잖아요~',
  hello: '네, 반갑습니다! 오늘도 힘내세요.',
  ten: '허허, 인사성이 참 밝으시네요!',
  rage: '이제 못 참습니다!!',
  sorry: '…죄송합니다, 제가 잠깐 이성을 잃었네요.',
  none: '오늘은 더 드릴 게 없어요.',
  // 도서 무인 대출기
  kHello: '반갑습니다! 오늘도 열공하세요.',
  kTen: '이용 실적 우수 회원이시네요!',
  kRude: '삐— 비정상적인 이용입니다.',
  kRage: '경고! 경고! 대출 정지!!',
  kSorry: '시스템 재부팅 완료. 점검 중입니다.',
  kNone: '점검 중입니다.',
};
const GUARD_LINES = [L.rude, L.give, L.again, '…', L.hello, L.ten, L.rage, L.sorry, L.none];
/** 경비 선생님 이름표 (11차: "경비원" → "경비 선생님", 미화·조리사 선생님처럼 띄어 쓴다) */
const GUARD_NAME = '경비 선생님';
const GUARD_COLOR = '#c9d3e6';
/** 마귀 이름표 ★ */
const DEVIL_NAME = '화난 경비 선생님';
const KIOSK_DEVIL_NAME = '폭주한 도서 무인 대출기';
const DEVIL_COLOR = '#ff6b6b';
/** 인사 15번 띠 ★ */
const INF_BANNER: Record<'staff' | 'student', [string, string]> = {
  staff: ['경비 선생님의 응원!', '이번 스테이지 동안 필살기 무한'],
  student: ['도서관 우수 회원 혜택!', '이번 스테이지 동안 필살기 무한'],
};
/** 이스터 에그 숫자: 10번째 인사 힌트, 15번째 필살기 무한, 20번째 맞힘 마귀 */
const GREET_HINT = 10;
const GREET_INF = 15;
const STRIKE_DEVIL = 20;
/** 마귀: 체력(도장 수), 걷는 빠르기 (m/s — 보스가 걸어 나가는 빠르기와 같다), 변하는 시간, 예고 거리·시간, 때리는 거리, 때린 뒤 쉬는 시간 */
const DEVIL_HP = 10;
const DEVIL_WALK = 2.6;
const RAGE_T = 1.1;
const WIND_R = 1.9;
const WIND_T = 0.5;
const STRIKE_R = 2.3;
const RECOVER_T = 0.9;
/** 마귀가 플레이어 앞에서 멈추는 거리 */
const DEVIL_STOP = 1.4;
/** 경비 선생님이 남(짝수)·여(홀수)로 번갈아 서는 구역 순서 (교직원 모드 진행 순서) */
const PLACE_ORDER: Place[] = ['yard', 'plaza', 'hum', 'dorm', 'field', 'final'];
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

/** 화난 마귀: off = 평소, rage = 변하는 중, chase = 쫓아옴, wind = 때리기 예고, recover = 때린 뒤, back = 처리된 뒤 제자리로 */
type DevilState = 'off' | 'rage' | 'chase' | 'wind' | 'recover' | 'back';

/** 경비 선생님 한 사람의 마귀 모양 (머리 재질, 뿔·눈) */
interface DevilHead {
  orig: THREE.Material | THREE.Material[];
  mats: THREE.Material[];
  extra: THREE.Group;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Props {
  /** 걸어서 지나갈 수 없는 것 (경비 선생님·대출기·남은 상자) */
  readonly solids: Rect[] = [];
  /** 경비 선생님 남·여 (구역마다 번갈아 guardObj에 넣는다) */
  private readonly guards: [Person, Person];
  /** 지금 서 있는 경비 선생님 */
  private guard: Person;
  private readonly guardObj = new THREE.Group();
  private readonly kiosk: THREE.Group;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly screenTex: THREE.Texture | null;
  private readonly kioskLabel: THREE.Sprite;
  /** 폭주한 대출기: 이름표·뿔 (평소에는 숨긴다), 화면 마귀 얼굴 */
  private readonly kioskDevil: THREE.Group;
  private readonly devilScreen: THREE.CanvasTexture;
  private readonly devilHeads = new Map<Person, DevilHead>();
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
  /** 경비 선생님이 토라진 시간 */
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
  // ---------- 이스터 에그 (결정 61 · 4~6절): 모두 이 구역(npcPlace)에서만, 옮겨 가면 0부터 ----------
  /** 받아 준 인사 (아이템·인사만·"방금 드렸잖아요" 모두. 토라져 거절한 인사·다 준 뒤는 빼고) */
  private greets = 0;
  /** 도장·무기로 맞힌 수 (필살기는 세지 않는다) */
  private struck = 0;
  /** 다음 인사가 아이템 차례 (아이템 → 인사만 → 아이템 …) */
  private itemTurn = true;
  /** 인사 15번: 이 구역 동안 필살기 무한 (Game.keepSpFull) */
  infinite = false;
  private devil: DevilState = 'off';
  private devilT = 0;
  private devilHp = 0;
  /** 마귀를 처리했다: 이 구역에서는 더 주지 않는다 (인사 15번도 꺼진다) */
  private spent = false;
  /** 마귀가 원래 서 있던 자리 */
  private home = new THREE.Vector3();
  /** 조금 뒤에 하는 말 (10번째 인사 힌트) */
  private followT = -1;
  private followLine = '';
  private uiKey = '';
  private readonly hintEl: HTMLElement;
  private readonly btnEl: HTMLButtonElement | null;

  constructor(private readonly h: PerkHost) {
    ensureDom();
    // 경비 선생님: 남색 제복·근무모·금색 배지 (이름 없는 가상 인물, 남·여 둘)
    this.guards = [new Person('meeting', GUARD_NAME, '#c9d3e6', guardLook(false)), new Person('meeting', GUARD_NAME, '#c9d3e6', guardLook(true))];
    for (const g of this.guards) g.clip.visible = false;
    this.guard = this.guards[0];
    this.guardObj.add(this.guard.root);
    this.guardObj.visible = false;
    h.scene.add(this.guardObj);
    const k = buildKiosk(h.models);
    this.kiosk = k.obj;
    this.screenMat = k.screen;
    this.screenTex = k.screen.map;
    this.kioskLabel = k.label;
    // 폭주한 도서 무인 대출기: 빨간 이름표와 머리판 위 뿔 두 개, 화면에는 마귀 얼굴
    this.kioskDevil = new THREE.Group();
    const dl = h.models.label(KIOSK_DEVIL_NAME, DEVIL_COLOR);
    dl.position.y = 2.4;
    this.kioskDevil.add(dl);
    for (const s of [-1, 1]) {
      const horn = hornMesh(0.09, 0.3);
      horn.position.set(s * 0.32, 1.96, 0);
      horn.rotation.z = -s * 0.35;
      this.kioskDevil.add(horn);
    }
    this.kioskDevil.visible = false;
    this.kiosk.add(this.kioskDevil);
    this.devilScreen = devilScreenTex();
    this.kiosk.visible = false;
    h.scene.add(this.kiosk);
    this.boxProto = buildBox();
    this.bookProto = buildBooks();
    prepareSpeech(GUARD_LINES);
    prepareTag(DEVIL_NAME, DEVIL_COLOR);
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
    // 경비 선생님·대출기는 다음 구역으로 먼저 옮겨 간다 (길이 열리면)
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
          student ? `도서 무인 대출기에서 대여하면${t ? '(대여 버튼)' : '(E)'} 무기가 나옵니다` : `경비 선생님께 인사하면${t ? '(인사 버튼)' : '(E)'} 무기를 줍니다`,
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
    // 10번째 인사 힌트 (대답 조금 뒤)
    if (this.followT > 0 && (this.followT -= dt) <= 0) this.follow(student);

    // 화난 마귀: 쫓아오고 때린다 (자리·막는 칸이 같이 움직인다)
    if (this.devil !== 'off') this.stepDevil(dt, student);

    // 가까이에서 바라보고 있으면 E (마귀일 때는 인사를 받지 않는다)
    const dx = this.npc.x - h.pos.x;
    const dz = this.npc.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    const cos = d > 0.01 ? (dx * -Math.sin(h.yaw) + dz * -Math.cos(h.yaw)) / d : 1;
    this.near = h.playing && h.stage !== 'done' && this.devil === 'off' && d <= NEAR && (cos >= 0.77 || (d < 1.6 && cos >= 0.2));

    if (student) {
      // 화면: 대여하면 초록으로 깜빡이고, 처리 중에는 노랗게. 무례하면 붉게, 마귀가 때리기 전에는 번쩍번쩍, 다 준 뒤(점검 중)는 회색
      if (this.flashT > 0) this.flashT -= dt;
      const blink = Math.floor(this.t * 12) % 2 === 0;
      let col = this.flashT > 0 ? (Math.floor(this.flashT * 10) % 2 === 0 ? 0x9dffb0 : 0xffffff) : this.cd > 0 ? 0xffd27a : 0xffffff;
      if (this.devil === 'wind') col = blink ? 0xffffff : 0xff4040;
      else if (this.devil === 'rage') col = blink ? 0xffb0b0 : 0xffffff;
      else if (this.devil !== 'off') col = 0xffffff;
      else if (this.rudeT > 0) col = 0xff9a9a;
      else if (this.spent) col = 0x9aa0a8;
      this.screenMat.color.setHex(col);
    } else {
      // 경비 선생님: 가까이 오면 플레이어를 본다. 토라지면 등을 돌린다. 마귀는 늘 플레이어를, 돌아갈 때는 제자리를 본다
      let want = this.restYaw;
      if (this.devil === 'back') want = Math.atan2(this.home.x - this.npc.x, this.home.z - this.npc.z);
      else if (this.devil !== 'off') want = Math.atan2(-dx, -dz);
      else if (this.rudeT > 0) want = Math.atan2(dx, dz);
      else if (d < 12) want = Math.atan2(-dx, -dz);
      this.yawNow += wrap(want - this.yawNow) * Math.min(1, dt * (this.devil === 'off' ? 5 : 9));
      this.guardObj.rotation.y = this.yawNow;
      if (this.hopT > 0) this.hopT = Math.max(0, this.hopT - dt);
      this.guardObj.position.y = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.3) * Math.PI) * 0.22 : 0;
      // 마귀: 변할 때 부르르, 때리기 전에 두 팔을 번쩍 든다
      if (this.devil === 'rage') this.guardObj.position.x = this.npc.x + Math.sin(this.t * 70) * 0.05;
      const walking = this.devil === 'chase' || this.devil === 'back';
      const up = this.devil === 'wind' ? Math.min(1, this.devilT / 0.25) : this.devil === 'rage' ? 0.6 : 0;
      this.guard.update(dt, { walking, raise: up, reach: up > 0 ? up : this.giveT > 0 ? 1 : 0, wave: false });
      const dh = this.devilHeads.get(this.guard);
      if (dh && dh.extra.visible) {
        // 빛나는 눈: 때리기 전에는 더 밝게 깜빡인다
        const glow = dh.extra.userData.glow as THREE.Sprite[];
        const k = this.devil === 'wind' ? 1.4 + Math.sin(this.t * 40) * 0.4 : 1 + Math.sin(this.t * 6) * 0.12;
        for (const g of glow) g.scale.setScalar(0.2 * k);
      }
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
      this.kioskTextAt();
      if (this.rudeT > 0) {
        // 무례해서 거절 (세지 않는다)
        this.kioskSay(L.kRude, '#ff9a9a', 1.4);
        h.sound('tick', _c, 0.6);
        return;
      }
      if (this.spent) {
        // 마귀를 처리한 구역: 더 주지 않는다 (세지 않는다)
        this.kioskSay(L.kNone, '#cfd4d8', 1.4);
        return;
      }
      const n = ++this.greets;
      if (!this.itemTurn) {
        // 인사만 차례
        this.itemTurn = true;
        this.flashT = 0.4;
        this.kioskSay(L.kHello, '#9fd3ff', 1.6);
        h.sound('pickup', _c, 0.4);
      } else if (this.cd > 0) {
        h.note('대출 처리 중…', 1.2);
        h.sound('tick', _c, 0.6);
      } else {
        this.itemTurn = false;
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
      }
      this.counted(n);
      return;
    }
    // 교직원: 먼저 인사, 잠시 뒤 경비 선생님 대답
    if (this.replyT > 0) return;
    showSubtitle(h.playerName(), '안녕하세요!', 0.9, '#9fd3ff');
    this.replyT = 0.75;
  }

  /** 경비 선생님 대답: 아이템 → 인사만 → 아이템 … (아이템 차례는 10초 대기를 지킨다) */
  private reply(): void {
    const h = this.h;
    if (h.mode !== 'staff' || !this.guardObj.visible || this.devil !== 'off') return;
    if (this.rudeT > 0) {
      // 토라져서 거절 (세지 않는다)
      this.guard.say('…', 1.2);
      return;
    }
    if (this.spent) {
      // 마귀를 처리한 구역: 더 주지 않는다 (세지 않는다)
      this.guard.say(L.none, 2);
      return;
    }
    const n = ++this.greets;
    if (!this.itemTurn) {
      this.itemTurn = true;
      this.guard.say(L.hello, 2.2);
      this.hopT = 0.3;
    } else if (this.cd > 0) {
      this.guard.say(L.again, 1.8);
    } else {
      this.itemTurn = false;
      this.guard.say(L.give, 2.4);
      this.cd = GIVE_CD;
      this.giveT = 0.8;
      h.equip(ARM_IDS[Math.floor(Math.random() * ARM_IDS.length)]);
    }
    this.counted(n);
  }

  /** 받아 준 인사 n번째: 10번째 힌트 (대답 조금 뒤), 15번째 필살기 무한 */
  private counted(n: number): void {
    if (n === GREET_HINT) {
      this.followT = this.h.mode === 'student' ? 1.2 : 1.9;
      this.followLine = this.h.mode === 'student' ? L.kTen : L.ten;
    }
    if (n >= GREET_INF) this.turnInfinite();
  }

  /** 인사 15번 이스터 에그: 띠 + 이 구역 동안 필살기 무한 (마귀가 되었거나 처리한 구역에서는 꺼진다) */
  private turnInfinite(): void {
    if (this.infinite || this.spent || this.devil !== 'off') return;
    this.infinite = true;
    const [title, sub] = INF_BANNER[this.h.mode];
    this.h.banner(title, sub);
    this.h.sound('special', undefined, 0.6);
    _c.set(this.npc.x, 2.4, this.npc.z);
    this.h.fx.confetti(_c, 26, 4, 0xf5c542, 2, 1);
  }

  /** 10번째 인사 힌트 */
  private follow(student: boolean): void {
    if (this.devil !== 'off' || this.spent) return;
    if (student) {
      this.kioskTextAt();
      this.kioskSay(this.followLine, '#ffe066', 2);
    } else if (this.guardObj.visible) this.guard.say(this.followLine, 2.4);
  }

  /** 대출기 앞 떠오르는 글자 자리 (_c) */
  private kioskTextAt(): void {
    const h = this.h;
    _c.set(this.npc.x + (h.pos.x - this.npc.x) * 0.25, 1.3, this.npc.z + (h.pos.z - this.npc.z) * 0.25);
  }

  /** 대출기 한마디: 화면 앞 글자(자리는 _c) + 아래 알림 */
  private kioskSay(text: string, color: string, sec: number): void {
    this.h.fx.text(_c, text, color, 0.42);
    this.h.note(text, sec);
  }

  /** 도장이 경비 선생님(대출기)을 맞혔다: 무례 반응 (6초 동안 안 받아 준다). 20번째면 화난 마귀 */
  private rude(): void {
    const h = this.h;
    const student = h.mode === 'student';
    this.struck++;
    if (this.struck >= STRIKE_DEVIL && !this.spent) {
      this.enrage();
      return;
    }
    if (this.t - this.rudeSaid > 1.2) {
      if (student) {
        this.kioskTextAt();
        this.kioskSay(L.kRude, '#ff9a9a', 1.6);
      } else this.guard.say(L.rude, 2.2);
      this.rudeSaid = this.t;
    }
    this.rudeT = RUDE_SEC;
    this.replyT = -1;
    this.hopT = 0.3;
    _c.set(this.npc.x, student ? 1.4 : 2.2, this.npc.z);
    h.sound('hit', _c, 0.7);
  }

  // ---------- 화난 마귀 (도장 20번) ----------

  /** 마귀로 변한다: 얼굴·이름표를 바꾸고 외친다. 필살기 무한은 꺼진다 */
  private enrage(): void {
    const h = this.h;
    const student = h.mode === 'student';
    this.devil = 'rage';
    this.devilT = 0;
    this.devilHp = DEVIL_HP;
    this.infinite = false;
    this.rudeT = 0;
    this.replyT = -1;
    this.followT = -1;
    this.pending = null;
    this.setDevilLook(true);
    _c.set(this.npc.x, student ? 1.6 : 2.4, this.npc.z);
    if (student) {
      showSubtitle(KIOSK_DEVIL_NAME, L.kRage, 2.4, DEVIL_COLOR);
      h.fx.text(_c, L.kRage, DEVIL_COLOR, 0.6);
    } else this.guard.say(L.rage, 2.4);
    h.fx.confetti(_c, 30, 5, 0xe5484d, 2.4, 1);
    h.sound('boom', _c, 0.7);
    this.hopT = 0.3;
  }

  /** 마귀 한 단계: 보통 사람 걸음으로 쫓아오고, 가까우면 0.5초 예고 뒤 때린다 (3칸). npc가 마귀의 실제 자리다 */
  private stepDevil(dt: number, student: boolean): void {
    const h = this.h;
    this.devilT += dt;
    const p = this.npc;
    const dx = h.pos.x - p.x;
    const dz = h.pos.z - p.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let moving = false;
    switch (this.devil) {
      case 'rage':
        if (this.devilT >= RAGE_T) this.setDevil('chase');
        break;
      case 'chase':
        if (dist > DEVIL_STOP) {
          const step = Math.min(dist - DEVIL_STOP, DEVIL_WALK * dt);
          p.x += (dx / dist) * step;
          p.z += (dz / dist) * step;
          moving = true;
        }
        if (dist <= WIND_R && h.playing) {
          this.setDevil('wind');
          _c.set(p.x, 1.6, p.z);
          h.sound('tick', _c, 1);
        }
        break;
      case 'wind':
        if (this.devilT >= WIND_T) {
          // 때린다: 아직 가까이 있으면 3칸
          _c.set(p.x, 1.2, p.z);
          h.fx.ring(p.x, 0.08, p.z, 0.4, STRIKE_R, 0.35, 0xe5484d);
          h.sound('hit', _c, 1);
          if (dist <= STRIKE_R && h.playing) h.devilHurt(_c);
          this.setDevil('recover');
        }
        break;
      case 'recover':
        if (this.devilT >= RECOVER_T) this.setDevil('chase');
        break;
      case 'back': {
        const bx = this.home.x - p.x;
        const bz = this.home.z - p.z;
        const bd = Math.hypot(bx, bz);
        if (bd < 0.15) {
          // 제자리에 돌아왔다: 다시 인사를 받는다 (아이템은 더 없다)
          p.copy(this.home);
          this.devil = 'off';
          if (student) this.kiosk.rotation.set(0, this.restYaw, 0);
        } else {
          const step = Math.min(bd, DEVIL_WALK * dt);
          p.x += (bx / bd) * step;
          p.z += (bz / bd) * step;
          moving = true;
        }
        break;
      }
    }
    if (student) {
      // 대출기: 바닥을 미끄러지듯 (움직이는 쪽으로 살짝 기울고, 때리기 전에는 뒤로 젖히고, 변할 때는 부르르)
      if (this.devil !== 'off') {
        const face = this.devil === 'back' ? Math.atan2(this.home.x - p.x, this.home.z - p.z) : Math.atan2(dx, dz);
        this.kiosk.rotation.y += wrap(face - this.kiosk.rotation.y) * Math.min(1, dt * 8);
      }
      const lean = moving ? 0.08 : this.devil === 'wind' ? -0.14 * Math.min(1, this.devilT / 0.25) : 0;
      this.kiosk.rotation.x += (lean - this.kiosk.rotation.x) * Math.min(1, dt * 8);
      const jit = this.devil === 'rage' ? Math.sin(this.t * 70) * 0.05 : 0;
      this.kiosk.position.set(p.x + jit, moving ? 0.05 + Math.sin(this.t * 5) * 0.02 : 0, p.z);
    } else {
      this.guardObj.position.x = p.x;
      this.guardObj.position.z = p.z;
    }
    this.rebuildSolids();
  }

  private setDevil(s: DevilState): void {
    this.devil = s;
    this.devilT = 0;
  }

  /** 마귀가 도장(무기)에 맞았다. 다 맞으면 원래 얼굴로 돌아와 제자리로 */
  private devilHit(power: number, at: THREE.Vector3): void {
    const h = this.h;
    this.devilHp -= power;
    this.hopT = 0.2;
    h.fx.confetti(at, 6, 2.6, 0xe5484d, 1.2, 0.6);
    h.sound('hit', at, 0.8);
    if (this.devil === 'chase' || this.devil === 'recover') {
      // 조금 밀려난다
      const dx = this.npc.x - h.pos.x;
      const dz = this.npc.z - h.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.npc.x += (dx / d) * 0.25;
      this.npc.z += (dz / d) * 0.25;
    }
    if (this.devilHp > 0) return;
    // 처리 (민원 처리 수·평정·연속·필살기·배지에는 넣지 않는다 — Game.damage를 거치지 않는다)
    const student = h.mode === 'student';
    this.setDevilLook(false);
    this.spent = true;
    this.infinite = false;
    this.rudeT = 0;
    this.setDevil('back');
    _c.set(this.npc.x, student ? 1.6 : 2.4, this.npc.z);
    h.fx.confetti(_c, 30, 5, 0xffffff, 2.4, 1);
    h.sound('pop', _c);
    if (student) {
      showSubtitle('도서 무인 대출기', L.kSorry, 3, '#9fd3ff');
      h.fx.text(_c, L.kSorry, '#9fd3ff', 0.5);
    } else this.guard.say(L.sorry, 3.2);
  }

  /** 마귀 얼굴·이름표 (on) ↔ 원래대로 */
  private setDevilLook(on: boolean): void {
    const kiosk = on ? this.h.mode === 'student' : true;
    if (kiosk) {
      this.screenMat.map = on ? this.devilScreen : this.screenTex;
      this.screenMat.needsUpdate = true;
      this.kioskDevil.visible = on;
      this.kioskLabel.visible = !on;
      if (!on) this.kiosk.rotation.x = 0;
    }
    const want = on && this.h.mode === 'staff' ? this.guard : null;
    for (const g of this.guards) {
      const dh = g === want ? this.devilHead(g) : this.devilHeads.get(g);
      if (!dh) continue;
      const show = g === want;
      g.headMesh.material = show ? dh.mats : dh.orig;
      dh.extra.visible = show;
      g.tag.rename(show ? DEVIL_NAME : GUARD_NAME, show ? DEVIL_COLOR : GUARD_COLOR);
    }
  }

  /** 경비 선생님 한 사람의 마귀 머리 (처음 쓸 때 만든다): 빨간 얼굴(송곳니), 뿔 두 개, 빛나는 노란 눈 */
  private devilHead(g: Person): DevilHead {
    let dh = this.devilHeads.get(g);
    if (dh) return dh;
    const red = new THREE.MeshLambertMaterial({ color: 0xc8282a });
    const face = new THREE.MeshLambertMaterial({ map: devilFaceTex() });
    const extra = new THREE.Group();
    // 뿔: 근무모를 뚫고 위로 (머리 상자 0.52 × 0.5 × 0.48, 가운데 y 0.27, 모자 꼭대기 0.69)
    for (const s of [-1, 1]) {
      const horn = hornMesh(0.09, 0.38);
      horn.position.set(s * 0.21, 0.84, 0.02);
      horn.rotation.z = -s * 0.4;
      extra.add(horn);
    }
    // 빛나는 눈: 얼굴 앞의 노란 눈 (빛을 받지 않는 재질) + 둘레 빛
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff36b });
    const glowMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe14d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow: THREE.Sprite[] = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.02), eyeMat);
      eye.position.set(s * 0.12, 0.29, 0.245);
      eye.rotation.z = s * 0.25;
      const sp = new THREE.Sprite(glowMat);
      sp.position.set(s * 0.12, 0.29, 0.27);
      sp.scale.setScalar(0.2);
      glow.push(sp);
      extra.add(eye, sp);
    }
    extra.userData.glow = glow;
    extra.visible = false;
    g.head.add(extra);
    dh = { orig: g.headMesh.material, mats: [red, red, red, red, face, red], extra };
    this.devilHeads.set(g, dh);
    return dh;
  }

  /** 이 구역의 이스터 에그를 처음으로 (구역을 옮길 때·이어하기·새 판): 원래 얼굴, 숫자 0, 아이템 차례부터 */
  private resetEgg(): void {
    this.setDevilLook(false);
    this.devil = 'off';
    this.devilT = 0;
    this.devilHp = 0;
    this.greets = 0;
    this.struck = 0;
    this.itemTurn = true;
    this.infinite = false;
    this.spent = false;
    this.followT = -1;
  }

  /** 이어하기 (같은 구역 처음부터, Game.clearArena): 숫자·마귀를 처음으로, 경비 선생님·대출기는 제자리로 */
  retry(): void {
    this.pending = null;
    if (this.npcPlace) this.placeNpc(this.npcPlace, this.npcStudent);
    else this.resetEgg();
  }

  /** 시험용 (?debug): 받아 준 인사를 n번 센 것으로 (15 이상이면 바로 필살기 무한) */
  eggGreet(n: number): number {
    this.greets = Math.max(0, Math.floor(n));
    if (this.greets >= GREET_INF) this.turnInfinite();
    return this.greets;
  }

  /** 시험용 (?debug): 맞힌 수를 n번 센 것으로 (20 이상이면 바로 마귀) */
  eggHit(n: number): number {
    this.struck = Math.max(0, Math.floor(n));
    if (this.struck >= STRIKE_DEVIL && this.devil === 'off' && !this.spent && this.npcPlace) {
      this.struck = STRIKE_DEVIL;
      this.enrage();
    }
    return this.struck;
  }

  /** 시험용: 이스터 에그 상태 */
  get egg(): { greets: number; struck: number; itemTurn: boolean; infinite: boolean; devil: DevilState; devilHp: number; spent: boolean; place: Place | null; at: [number, number] } {
    return {
      greets: this.greets,
      struck: this.struck,
      itemTurn: this.itemTurn,
      infinite: this.infinite,
      devil: this.devil,
      devilHp: this.devilHp,
      spent: this.spent,
      place: this.npcPlace,
      at: [this.npc.x, this.npc.z],
    };
  }

  // ---------- 도장 판정 ----------

  /**
   * 날아가는 도장(서류·무기)이 p에 왔을 때: 'stop' = 사람·기계에 막혔다, 'hit' = 상자를 맞혔다(꿰뚫는 무기는 계속 간다), 'none'.
   * seen: 이 도장이 이미 맞힌 것 (꿰뚫기·부메랑이 한 상자를 여러 번 치지 않게)
   */
  stampHit(p: THREE.Vector3, power: number, seen: Set<object>): 'none' | 'hit' | 'stop' | 'devil' {
    if (this.npcPlace) {
      const near = Math.hypot(p.x - this.npc.x, p.z - this.npc.z) < 0.62;
      const onGuard = this.guardObj.visible && p.y > 0 && p.y < 3.3 && near;
      const onKiosk = !this.guardObj.visible && this.kiosk.visible && p.y < 2.0 && near;
      if (onGuard || onKiosk) {
        // 던진 것 하나는 한 번만 센다 (막혀서 멈춘다). 마귀면 체력이 깎이고 (제자리로 가는 중에는 막히기만), 아니면 무례 반응.
        // 'devil': 마귀를 맞혔다 — Game은 이 던지기를 명중률(평정)에 넣지 않는다
        if (this.devil === 'rage' || this.devil === 'chase' || this.devil === 'wind' || this.devil === 'recover') {
          this.devilHit(power, p);
          return 'devil';
        }
        if (this.devil === 'off') {
          if (onKiosk) this.h.fx.confetti(p, 4, 2, 0xffffff, 1, 0.6);
          this.rude();
        }
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
    // 교직원: 조기출근 박스는 늘 식권 1장 (자판기에 넣는다, vending.ts)
    const kind: FoodKind = !student || r < 0.25 ? 'ticket' : r < 0.55 ? 'gimbap' : r < 0.8 ? 'donkatsu' : 'americano';
    h.spawnPickup(kind, c.x, c.z);
    this.rebuildSolids();
  }

  // ---------- 놓기 ----------

  private placeNpc(place: Place, student: boolean): void {
    // 새 구역 (또는 이어하기): 이스터 에그 숫자는 0부터, 마귀는 원래 얼굴로
    this.resetEgg();
    this.npcPlace = place;
    this.npcStudent = student;
    const s = SPOTS[student ? 'student' : 'staff'][place];
    this.npc.set(s.npc[0], 0, s.npc[1]);
    this.home.copy(this.npc);
    this.restYaw = Math.atan2(s.look[0] - s.npc[0], s.look[1] - s.npc[1]);
    this.yawNow = this.restYaw;
    this.cd = 0;
    this.rudeT = 0;
    this.replyT = -1;
    this.guardObj.visible = !student;
    this.kiosk.visible = student;
    const o = student ? this.kiosk : this.guardObj;
    o.position.set(s.npc[0], 0, s.npc[1]);
    o.rotation.set(0, this.restYaw, 0);
    if (!student) {
      // 구역 순서대로 남·여가 번갈아 선다
      const g = this.guards[PLACE_ORDER.indexOf(place) % 2];
      if (g !== this.guard) {
        this.guard.tag.hide();
        this.guardObj.remove(this.guard.root);
        this.guard = g;
        this.guardObj.add(g.root);
      }
      this.guard.reset();
    }
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
    this.resetEgg();
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
    // 지금 안 서 있는 쪽도 같이 미리 그린다
    const other = this.guards[0] === this.guard ? this.guards[1] : this.guards[0];
    other.root.position.set(-1.5, 0, 0);
    this.guardObj.add(other.root);
    for (const g of this.guards) {
      g.say('…', 1, false);
      g.update(0.016, { walking: false, raise: 0, reach: 0.5, wave: false });
    }
    // 마귀 모양도 한 번 그려 둔다 (안 서 있는 쪽 경비 선생님과 대출기에. 처음 변할 때 끊기지 않게)
    const odh = this.devilHead(other);
    other.headMesh.material = odh.mats;
    odh.extra.visible = true;
    this.devilHead(this.guard);
    this.kioskDevil.visible = true;
    const warmScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ map: this.devilScreen }));
    warmScreen.position.set(4, -1, -3);
    group.add(warmScreen);
    const p = _c.set(0, 1.6, 6);
    for (const [t, col] of [
      ['도서 대여 완료!', '#7CFC9A'],
      [L.kHello, '#9fd3ff'],
      [L.kTen, '#ffe066'],
      [L.kRude, '#ff9a9a'],
      [L.kNone, '#cfd4d8'],
      [L.kRage, DEVIL_COLOR],
      [L.kSorry, '#9fd3ff'],
    ]) {
      this.h.fx.text(p, t, col, 0.42);
    }
    return () => {
      for (const o of items) group.remove(o);
      group.remove(warmScreen);
      warmScreen.geometry.dispose();
      (warmScreen.material as THREE.Material).dispose();
      kioskParent?.add(this.kiosk);
      this.h.scene.add(this.guardObj);
      this.kiosk.visible = false;
      this.kioskDevil.visible = false;
      this.guardObj.visible = false;
      this.guardObj.remove(other.root);
      other.root.position.set(0, 0, 0);
      other.headMesh.material = odh.orig;
      odh.extra.visible = false;
      for (const g of this.guards) g.reset();
    };
  }
}

// ---------- 모형 ----------

/** 도서 무인 대출기: 밝은 회색 몸통, 남색 머리판(글씨), 파란 화면, 스캐너, 책 나오는 칸 */
function buildKiosk(models: Models): { obj: THREE.Group; screen: THREE.MeshBasicMaterial; label: THREE.Sprite } {
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
  return { obj: g, screen, label };
}

// ---------- 화난 마귀 (결정 61 · 6절) ----------

const hornMat = new THREE.MeshLambertMaterial({ color: 0xf1e6c8 });
let hornGeo: THREE.ConeGeometry | null = null;

/** 뿔 하나 (상아색 원뿔, 밑동이 원점 아래 h/2) */
function hornMesh(r: number, h: number): THREE.Mesh {
  hornGeo ??= new THREE.ConeGeometry(1, 1, 10);
  const m = new THREE.Mesh(hornGeo, hornMat);
  m.scale.set(r, h, r);
  m.castShadow = true;
  return m;
}

/** 빨간 마귀 얼굴 그리기 (w × h): 치켜 올라간 검은 눈썹, 빛나는 노란 눈, 송곳니 둘이 난 입. 경비 선생님 얼굴·대출기 화면이 함께 쓴다 */
function drawDevilFace(g: CanvasRenderingContext2D, w: number, h: number, bg: string): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 128;
  const cx = w / 2;
  const cy = h / 2;
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  // 눈썹: 가운데로 내려온 V자
  g.fillStyle = '#1a0606';
  for (const k of [-1, 1]) {
    g.beginPath();
    g.moveTo(k * 6, -14);
    g.lineTo(k * 44, -34);
    g.lineTo(k * 46, -24);
    g.lineTo(k * 8, -5);
    g.closePath();
    g.fill();
  }
  // 빛나는 노란 눈 (둘레 빛 + 세로 동공)
  for (const k of [-1, 1]) {
    const ex = k * 26;
    const glow = g.createRadialGradient(ex, 0, 2, ex, 0, 22);
    glow.addColorStop(0, 'rgba(255,248,170,1)');
    glow.addColorStop(0.45, 'rgba(255,214,60,0.85)');
    glow.addColorStop(1, 'rgba(255,214,60,0)');
    g.fillStyle = glow;
    g.fillRect(ex - 24, -24, 48, 48);
    // 화난 눈: 윗변이 가운데 쪽으로 내려간다 (바깥 위 → 안쪽 위 → 안쪽 아래 → 바깥 아래)
    g.fillStyle = '#fff36b';
    g.beginPath();
    g.moveTo(ex + k * 15, -10);
    g.lineTo(ex - k * 13, -2);
    g.lineTo(ex - k * 11, 8);
    g.lineTo(ex + k * 14, 6);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a1500';
    g.fillRect(ex - 2, -5, 4, 12);
  }
  // 입: 어두운 반달 + 위에서 내려온 흰 송곳니 둘
  g.fillStyle = '#3a0505';
  g.beginPath();
  g.moveTo(-30, 26);
  g.quadraticCurveTo(0, 50, 30, 26);
  g.lineTo(-30, 26);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  for (const k of [-1, 1]) {
    g.beginPath();
    g.moveTo(k * 20, 25);
    g.lineTo(k * 9, 25);
    g.lineTo(k * 14, 42);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** 경비 선생님 마귀 얼굴 (머리 상자 앞면 128 × 128) */
function devilFaceTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => drawDevilFace(g, 128, 128, '#c8282a'));
}

/** 폭주한 대출기 화면 (256 × 180): 같은 마귀 얼굴 + 화면 위쪽 작은 뿔 둘 */
function devilScreenTex(): THREE.CanvasTexture {
  return canvasTex(256, 180, (g) => {
    drawDevilFace(g, 256, 180, '#b81d22');
    g.fillStyle = '#f1e6c8';
    for (const k of [-1, 1]) {
      g.beginPath();
      g.moveTo(128 + k * 50, 26);
      g.lineTo(128 + k * 84, 26);
      g.lineTo(128 + k * 92, 0);
      g.closePath();
      g.fill();
    }
  });
}

/** 둥근 빛 (가운데 흰빛 → 바깥 투명) */
function glowTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
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
#sp.inf { border-color: #fff1a0; box-shadow: 0 0 10px #f5c542, 0 0 3px #ffffff; }
#weapon { margin-top: 3px; font-size: 12px; font-weight: 700; color: #ffd27a; }
#weapon:empty { display: none; }
#actHint { left: 50%; top: calc(50% + 22px); transform: translateX(-50%); padding: 3px 14px 4px; border-radius: 999px;
  background: rgba(17,19,24,.78); border: 2px solid #7cfc9a; font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap;
  text-shadow: none; opacity: 0; transition: opacity .15s; }
#actHint b { display: inline-block; min-width: 18px; margin-right: 6px; padding: 0 4px; border-radius: 4px; background: #7cfc9a; color: #111318; text-align: center; }
#actHint.on { opacity: 1; }
body.touch #actHint { display: none; }
#actBtn { position: fixed; right: calc(150px * var(--bs) + var(--sa-r)); bottom: calc(112px * var(--bs) + var(--sa-b)); width: calc(66px * var(--bs)); height: calc(66px * var(--bs));
  border-radius: 50%; border: 3px solid #111318; background: #2f8f4e; color: #fff; font: 700 calc(16px * var(--bs)) 'Malgun Gothic', sans-serif;
  display: none; box-shadow: 0 0 12px #7cfc9a; touch-action: none; }
#actBtn.on { display: block; }
@media (max-height: 500px) {
  #actBtn { right: calc(136px * var(--bs) + var(--sa-r)); bottom: calc(96px * var(--bs) + var(--sa-b)); width: calc(60px * var(--bs)); height: calc(60px * var(--bs)); font-size: calc(15px * var(--bs)); }
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
