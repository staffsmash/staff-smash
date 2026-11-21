import * as THREE from 'three';
import { assignStudentNames, TYPE_LABEL } from '../data/names';
import { ALL_STUDENTS, studentByName } from '../data/students';
import { lambert, type Rect } from './blocks';
import type { Roam } from './bossmove';
import { PersonBoss } from './bosses';
import { DORM_DOOR, HUM_DOOR } from './campus';
import type { Ctx, Enemy } from './enemies';
import { studentLook } from './looks';
import { Person, peopleKit, type Look } from './people';
import { docTex } from './textures';

// 1인칭 교직원 모드의 중간보스(민원 학생)와 새 구역 보스 둘 (2026-11-15, 사용자 요청 "중간보스를 더 넣어").
// 모두 사람이라 다치거나 쓰러지지 않는다: 도장은 들고 있는 서류(결재판 자리)에 찍히고, 막대("처리"·"결재 진행")가
// 다 차면 2D 마무리 대사를 하고 걸어 나간다. 외형·대사·기믹은 본편 2D 엔티티에서 가져왔다.
// - 본관 앞 — 전화번호 잘못 입력한 학생 (2D StudentEnemy wrongNumber): 사라졌다가 다른 자리에 나타난다
// - 사회과학관 앞 — 공지를 안 읽는 학생 (2D NoticeBoss): 같은 질문을 줄지어 던지고, 막대가 ⅓ 찰 때마다 안내문이 붙어 "…읽는 중"
// - 인문과학관 앞 — 마감 1분 전에 오는 학생 (2D DeadlineBoss): 마감 시계 60초, 넘기면 연장(진행 되돌림 + 초과근무 2분),
//   돌진·서류 세 장·서류 뭉치
// - 국제학사 앞 — 단대학생회 간부 최민원 (2D MinwonLeader): 서명지를 흔들면 민원이 몰려온다. 들어 올린 서류를 맞히면
//   서명지를 떨어뜨리고, 먼저 주우면 더 부르지 못한다
// - 대운동장 — 총장실로 메일 쓰는 학생 (2D StudentEnemy presidentMail): 메일을 다 쓰면 "지시" 서류 셋이 떨어진다. 쓰는 중에 맞히면 멈춘다
// - 인문과학관 앞 보스 — 오검토 처장 (2D Supervisor gumto): 처리된 민원을 "재검토!"로 되살린다
// - 국제학사 앞 보스 — 최몰라 처장 (2D Supervisor molla): "몰라~" 하며 메일·전화를 떠넘긴다
// 학생 이름은 2D처럼 판마다 students.ts 일곱 명 가운데 무작위로 붙는다 (최민원은 고정).
// 11차(2026-11-21): 몸·머리·성별은 이름을 따른다 (looks.ts studentLook — 2D createNamedStudentRig와 같다).
// 유형마다 다른 것은 손에 든 물건뿐. 처음 나타날 때 나라말로 인사한다 (hello).

export type MidKind = 'wrongNumber' | 'noticeBoss' | 'deadline' | 'minwon' | 'presidentMail';

const SKIN = 0xf1c7a0;
const SLEEVE = 0xececec;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

function part(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(peopleKit().unit, lambert(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

// ---------- 민원 학생 외형 (이름이 students.ts에 없을 때만: 2D createStudentRig 과잠 차림) ----------

interface StuLook {
  jacket: number;
  hair: number;
  longHair?: boolean;
  earphones?: boolean;
}

/** 2D StudentEnemy·NoticeBoss·DeadlineBoss·MinwonLeader 색 그대로 */
const STU_LOOKS: Record<MidKind, StuLook> = {
  wrongNumber: { jacket: 0x23315a, hair: 0x2a2420 },
  noticeBoss: { jacket: 0x8a1f2c, hair: 0x1f1a17, earphones: true },
  deadline: { jacket: 0xb45309, hair: 0x3b2a20, longHair: true },
  minwon: { jacket: 0x1d4ed8, hair: 0x1f1a17 },
  presidentMail: { jacket: 0x0f5c63, hair: 0x2a2420, earphones: true },
};

/** 이름표 색 (2D: 보스였던 학생은 빨강·주황, 나머지는 흰색) */
const TAG_COLOR: Record<MidKind, string> = {
  wrongNumber: '#ffffff',
  noticeBoss: '#ff9f9f',
  deadline: '#ffb86b',
  minwon: '#ffffff',
  presidentMail: '#ffffff',
};

export interface MidPerson {
  person: Person;
  /** 이름 (최민원 등) */
  name: string;
  /** 이름표·막대 글자 */
  label: string;
  /** 손에 든 서명지 (최민원) */
  sheet: THREE.Group | null;
  /** 몸에 붙는 안내문 세 장 (공지 안 읽는 학생) */
  notices: THREE.Mesh[];
  /** 처음 나타날 때 하는 나라말 인사 (최민원은 없음) */
  hello: string;
}

function studentPerson(kind: MidKind, name: string): MidPerson {
  const L = STU_LOOKS[kind];
  const label = kind === 'minwon' ? '최민원 · 단대학생회 간부' : `${name} · ${TYPE_LABEL[kind]}`;
  const named = kind === 'minwon' ? undefined : studentByName(name);
  if (named) return namedStudentPerson(kind, name, label, studentLook(named.look, 1.42), named.hello);
  const look: Look = {
    top: L.jacket,
    pants: 0x3b5a8a,
    tie: L.jacket,
    skin: SKIN,
    hair: L.hair,
    brow: L.hair,
    hairStyle: L.longHair ? 'long' : 'full',
    jacket: false,
    noTie: true,
    earphones: L.earphones,
    shoes: 0xf2f2f2,
    left: 'none',
    scale: 1.42,
  };
  const p = new Person('meeting', label, TAG_COLOR[kind], look);
  // 과잠: 흰 소매, 흰 목깃, 밑단 줄, 가슴 패치, 가방끈
  for (const arm of [p.armL, p.armR]) (arm.children[0] as THREE.Mesh).material = lambert(SLEEVE);
  part(p.body, 0.5, 0.08, 0.44, 0, 1.6, 0, SLEEVE);
  part(p.body, 0.72, 0.07, 0.42, 0, 0.9, 0, SLEEVE);
  part(p.body, 0.16, 0.16, 0.02, -0.17, 1.42, 0.21, SLEEVE);
  part(p.body, 0.06, 0.66, 0.02, 0.22, 1.3, 0.212, 0x2b2b2b);
  return midProps(p, kind, name, label, '');
}

/** 이름이 있는 학생 (students.ts): 그 사람 외형 + 유형별 손에 든 물건 */
function namedStudentPerson(kind: MidKind, name: string, label: string, look: Look, hello: string): MidPerson {
  return midProps(new Person('meeting', label, TAG_COLOR[kind], look), kind, name, label, hello);
}

/** 유형별 손에 든 물건 (과제 뭉치·서명지·휴대폰)과 붙는 안내문 */
function midProps(p: Person, kind: MidKind, name: string, label: string, hello: string): MidPerson {
  // 결재판 대신 투명 파일에 끼운 서류
  (p.clip.children[0] as THREE.Mesh).material = lambert(0x9fc4e8);
  const y = -0.8;
  let sheet: THREE.Group | null = null;
  const notices: THREE.Mesh[] = [];
  if (kind === 'deadline') {
    // 과제 뭉치
    part(p.armL, 0.34, 0.42, 0.09, 0, y - 0.1, 0.14, 0xffffff);
    part(p.armL, 0.26, 0.04, 0.095, 0, y - 0.02, 0.14, 0xd0202f);
  } else if (kind === 'minwon') {
    // 간부 완장 + 단체 서명지
    part(p.armL, 0.22, 0.1, 0.26, 0, -0.22, 0, 0xffd34d);
    sheet = new THREE.Group();
    part(sheet, 0.34, 0.44, 0.02, 0, y - 0.12, 0.13, 0xffffff);
    for (let i = 0; i < 2; i++) part(sheet, 0.12, 0.035, 0.025, 0.05, y - 0.04 - i * 0.1, 0.135, 0xd0202f);
    for (let i = 0; i < 2; i++) part(sheet, 0.12, 0.035, 0.025, 0.05, y - 0.24 - i * 0.1, 0.135, 0x1d1d22);
    p.armL.add(sheet);
  } else {
    // 휴대폰
    part(p.armL, 0.12, 0.22, 0.04, 0, y - 0.04, 0.12, 0x1b1b1f);
    part(p.armL, 0.09, 0.16, 0.01, 0, y - 0.04, 0.142, 0x3d6f9e);
  }
  if (kind === 'noticeBoss') {
    // 붙는 안내문 (처음엔 숨김)
    for (const [x0, y0, r] of [
      [-0.14, 1.44, -0.2],
      [0.12, 1.26, 0.15],
      [-0.06, 1.08, -0.05],
    ] as [number, number, number][]) {
      const m = part(p.body, 0.26, 0.2, 0.01, x0, y0, 0.215, 0xffffff);
      m.rotation.z = r;
      m.visible = false;
      notices.push(m);
    }
  }
  p.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { person: p, name, label, sheet, notices, hello };
}

/** 이번 판의 중간보스 다섯 (이름은 판마다 무작위, 최민원은 고정) */
export function buildMidPeople(): Record<MidKind, MidPerson> {
  const names = assignStudentNames();
  return {
    wrongNumber: studentPerson('wrongNumber', names.wrongNumber),
    noticeBoss: studentPerson('noticeBoss', names.noticeBoss),
    deadline: studentPerson('deadline', names.deadline),
    minwon: studentPerson('minwon', '최민원'),
    presidentMail: studentPerson('presidentMail', names.presidentMail),
  };
}

// ---------- 대사 (2D 그대로 + 문구 검토 11-3·11-4 ★ 추가 대사) ----------

const LINES: Record<MidKind, string[]> = {
  wrongNumber: ['문자 못 받았는데요?', '전화 주셨어요? 몰랐어요!', '번호요? 맞게 쓴 것 같은데…', '카톡으로 보내 주시면 안 돼요?', '아, 끝자리 하나 틀렸네요.', '비행기 모드였어요!'],
  noticeBoss: [
    '그거 어디 나와 있어요?',
    '공지 어디에 있어요?',
    '그래서 언제까지예요?',
    '저만 몰랐던 거예요?',
    '단톡방엔 없던데요?',
    '에브리타임엔 다르게 써 있던데요?',
    '메일 제목이 공지인 줄 몰랐어요!',
    '첨부파일은 안 열어 봤는데요?',
    '공지 세 줄 요약해 주세요!',
  ],
  deadline: ['출력만 하면 돼요!', '서명은 나중에 할게요!', '파일명만 바꾸면 돼요!', '시계 좀 천천히 가게 해 주세요!'],
  minwon: ['학생 대표로 왔습니다!', '서명 300명 받았습니다!', '학생 의견 수렴 결과입니다!', '공식 답변 기한은 일주일입니다!'],
  presidentMail: ['총장님께 직접 여쭤볼게요!', '총장실에 메일 보냈어요!', '이거 총장님도 아세요?', '참조에 총장님 넣었어요!', '제목에 [긴급] 붙였어요!', '답장 1시간 안에 오겠죠?'],
};

/** 처리되면 하는 인사 (2D thanksText, 따로 없으면 "감사합니다!") */
const THANKS: Record<MidKind, string> = {
  wrongNumber: '감사합니다!',
  noticeBoss: '아… 공지에 다 있었네요. 감사합니다!',
  deadline: '제출됐다! 1초 남기고! 감사합니다!',
  minwon: '서명지는 다음 학기에 다시 올게요. 감사합니다!',
  presidentMail: '감사합니다!',
};

const L_VANISH = '여보세요? 잘 안 들려요…';
const L_APPEAR = '여보세요? 저 여기요!';
const L_SO = '그래서요?!';
const L_READING = '…읽는 중';
const L_D_THROW = '이거 받아 주세요! 마감 직전이에요!';
const L_D_DASH = '급해요 급해!';
const L_D_BOMB = '이것도 같이 내 주세요!';
const L_D_EXTEND = '마감 연장해 주세요!! 딱 30초만요!';
const L_M_RALLY = '여러분, 모여 주세요! 단체 민원입니다!';
const L_M_DROP = '앗, 서명지!';
const L_M_FOUND = '서명지 찾았다!';
const L_P_TYPING = '총장님께 메일 쓰는 중…';
const L_P_REPLY = '총장실 답장 왔어요! 지시 사항이요!';
const L_P_STOP = '앗, 메일 날아갔다…';
const L_GUMTO_IN = '어디 한번 볼까…';
const L_GUMTO_HM = '흠…';
const L_GUMTO_RE = '재검토!';
const L_MOLLA = '몰라~ 그건 주무관이 처리해.';
/** ★ 새로 지은 결재 대사 (다른 처장의 "보고 잘 받았어." 자리) */
const L_GUMTO_OK = '흠… 이번엔 통과.';
const L_MOLLA_OK = '몰라~ 결재해 줄게.';

/** 미리 그려 둘 대사 */
export const MID_LINES: string[] = [
  ...Object.values(LINES).flat(),
  ...ALL_STUDENTS.map((s) => s.hello),
  ...Object.values(THANKS),
  L_VANISH,
  L_APPEAR,
  L_SO,
  L_READING,
  L_D_THROW,
  L_D_DASH,
  L_D_BOMB,
  L_D_EXTEND,
  L_M_RALLY,
  L_M_DROP,
  L_M_FOUND,
  L_P_TYPING,
  L_P_REPLY,
  L_P_STOP,
  L_GUMTO_IN,
  L_GUMTO_HM,
  L_GUMTO_RE,
  L_MOLLA,
  L_GUMTO_OK,
  L_MOLLA_OK,
];

/** 떠오르는 글자 (글자+색마다 그림이 하나씩이라 Game.warmup이 미리 만든다) */
export const MID_TEXTS: [string, string][] = [
  ['안내문 1/3', '#ffe066'],
  ['안내문 2/3', '#ffe066'],
  ['안내문 3/3', '#ffe066'],
  ['서명지를 먼저 주우세요!', '#ffe066'],
  ['단체 서명지 접수 완료!', '#7CFC9A'],
  ['넘겨받은 민원', '#ffd27f'],
  ['재검토', '#ff6b6b'],
];

/** 2D 2스테이지·3스테이지 보스 등장 띠 ("보스 · " 앞머리만 뺐다) */
const MID_INFO: Record<MidKind, { hp: number; keep: number; every: number; sub: string; note: string }> = {
  wrongNumber: { hp: 30, keep: 9, every: 5.5, sub: TYPE_LABEL.wrongNumber, note: '사라졌다가 다른 자리에 나타나요 — 주위를 둘러보세요' },
  noticeBoss: { hp: 33, keep: 9.5, every: 5, sub: `${TYPE_LABEL.noticeBoss} — 안내문을 3번 붙이세요`, note: '' },
  deadline: { hp: 33, keep: 10, every: 3.4, sub: `${TYPE_LABEL.deadline} — 마감 시계가 0이 되기 전에 처리하세요`, note: '' },
  minwon: { hp: 30, keep: 10, every: 6.5, sub: '서명지를 흔들면 민원이 몰려옵니다 — 세게 쳐서 떨어뜨리고 먼저 주우세요', note: '' },
  presidentMail: { hp: 30, keep: 9.5, every: 6.5, sub: TYPE_LABEL.presidentMail, note: '메일을 쓰는 동안 맞히면 멈춰요' },
};

const DEADLINE_SEC = 60;
const EXTEND_SEC = 30;
const PENALTY_MIN = 2;

type MidSub = 'walk' | 'act' | 'lure' | 'stun' | 'hidden' | 'retrieve' | 'dash';

interface Order {
  doc: THREE.Mesh;
  warn: THREE.Mesh;
  t: number;
  at: number;
  x: number;
  z: number;
  on: boolean;
}

/** 사람(보스)이 장애물 안으로 들어가지 않게 밀어낸다 */
function pushOut(o: THREE.Vector3, rects: readonly Rect[], r: number): void {
  for (const q of rects) {
    if (o.x < q.minX - r || o.x > q.maxX + r || o.z < q.minZ - r || o.z > q.maxZ + r) continue;
    const opts: [number, number, number][] = [
      [o.x - (q.minX - r), q.minX - r, o.z],
      [q.maxX + r - o.x, q.maxX + r, o.z],
      [o.z - (q.minZ - r), o.x, q.minZ - r],
      [q.maxZ + r - o.z, o.x, q.maxZ + r],
    ];
    opts.sort((p, s) => p[0] - s[0]);
    o.x = opts[0][1];
    o.z = opts[0][2];
  }
}

// ---------- 중간보스: 민원 학생 ----------

export class StaffMid extends PersonBoss {
  readonly mid: MidKind;
  /** 등장 띠 (제목·아래 줄)와 처음 한 번 띄우는 요령 */
  readonly bannerTitle: string;
  readonly bannerSub: string;
  readonly note: string;
  /** HUD에 쓰는 짧은 이름 */
  readonly shortName: string;
  /** 마감을 넘겨 늘어난 초과근무(분). Game이 읽고 0으로 돌린다 */
  penalty = 0;
  private readonly mp: MidPerson;
  private readonly solids: readonly Rect[];
  private sub: MidSub = 'walk';
  private subT = 0;
  private spot: THREE.Vector3;
  private side = 1;
  private sideT = 0;
  private throwT = 2.6;
  private gimmickT = 2.5;
  private chatT = 6;
  private acted = 0;
  private lureT = 2.4;
  private cycle = 0;
  private hidden = false;
  private notices = 0;
  private deadline = DEADLINE_SEC;
  private hasSheet = true;
  private sheetGone = false;
  private sheetObj: THREE.Group | null = null;
  private dashDir = new THREE.Vector3();
  private dashHit = false;
  private interrupted = false;
  private orders: Order[] = [];
  private easy: boolean;

  /** at: 처음 서는 곳, spot: 걸어가 설 곳, exit: 처리된 뒤 걸어 나갈 곳. easy: 초보 (빈틈을 길게) */
  constructor(c: Ctx, mp: MidPerson, mid: MidKind, at: THREE.Vector3, spot: THREE.Vector3, exit: THREE.Vector3, solids: readonly Rect[], easy: boolean) {
    super(c, mp.person, at, exit, THANKS[mid], '', mp.label, MID_INFO[mid].hp);
    this.mid = mid;
    this.mp = mp;
    this.solids = solids;
    this.easy = easy;
    this.spot = spot.clone();
    this.shortName = mp.name;
    const info = MID_INFO[mid];
    // 2D 띠: 보스였던 학생은 "이름" / "유형 — 공략", 최민원은 2D 그대로, 나머지 학생은 "○○ 학생 방문" / 유형
    this.bannerTitle = mid === 'minwon' ? '최민원 · 단대학생회 간부' : mid === 'noticeBoss' || mid === 'deadline' ? mp.name : `${mp.name} 학생 방문`;
    this.bannerSub = info.sub;
    this.note = info.note;
    this.lureT = easy ? 3.2 : 2.4;
    this.gimmickT = mid === 'deadline' ? 2.2 : 3.2;
    // 전화번호 학생은 원래 사라졌다 나타나고, 마감 학생은 원래 돌진한다: 공통 움직임의 같은 기술은 끈다
    if (this.mover) {
      this.mover.vanish = mid !== 'wrongNumber';
      this.mover.rush = mid !== 'deadline';
    }
    for (const m of mp.notices) m.visible = false;
    if (mp.sheet) mp.sheet.visible = true;
    if (mid === 'presidentMail') {
      const tex = docTex('지시', '#d0202f');
      const face = new THREE.MeshLambertMaterial({ map: tex });
      const edge = lambert(0xf4f0e0);
      const geo = new THREE.BoxGeometry(1.1, 0.06, 1.5);
      for (let i = 0; i < 3; i++) {
        const doc = new THREE.Mesh(geo, [edge, edge, face, edge, edge, edge]);
        doc.castShadow = true;
        doc.visible = false;
        const warn = new THREE.Mesh(c.models.warnGeo, c.models.warnMat);
        warn.rotation.x = -Math.PI / 2;
        warn.visible = false;
        c.scene.add(doc, warn);
        this.orders.push({ doc, warn, t: 0, at: 0, x: 0, z: 0, on: false });
      }
    }
  }

  get targetable(): boolean {
    return super.targetable && !this.hidden;
  }

  /**
   * 공통 움직임: 서성일 때는 모두, 기믹·서류를 든 동안은 옆걸음만 (총장실 메일 학생은 메일을 쓰면서도),
   * 숨어 있을 때·돌진할 때·서명지를 주우러 갈 때는 그대로
   */
  roam(): Roam {
    const r = super.roam();
    if (r !== 'all' || this.sub === 'walk') return r;
    if (this.sub === 'lure' || this.sub === 'stun') return 'step';
    if (this.sub === 'act') return this.mid === 'wrongNumber' || (this.mid === 'deadline' && this.cycle % 3 === 2) ? 'none' : 'step';
    return 'none';
  }

  /** HUD에 덧붙이는 글 (2D bossExtra): 마감 시계·안내문 */
  get extra(): string {
    if (this.mid === 'deadline' && !this.dead) return `마감까지 0:${Math.max(0, Math.ceil(this.deadline)).toString().padStart(2, '0')}`;
    if (this.mid === 'noticeBoss') return `안내문 ${'■'.repeat(this.notices)}${'□'.repeat(Math.max(0, 3 - this.notices))}`;
    return '';
  }

  private go(s: MidSub): void {
    this.sub = s;
    this.subT = 0;
    this.acted = 0;
  }

  /** 기믹 뒤 서류를 들고 서 있는다 (빈틈) */
  private toLure(sec = this.lureT): void {
    this.reachTo = 0;
    this.openWindow();
    this.go('lure');
    this.subT = this.lureT - sec;
  }

  protected think(dt: number, c: Ctx): void {
    if (this.state === 'enter') {
      // 처음 나타나면 나라말 인사 → 이어서 원래 등장 대사 (최민원은 인사 없이 바로)
      const hello = this.mp.hello;
      if (this.stateT < dt * 1.5) {
        if (hello) this.say(hello, 1.6);
        else this.say(this.mid === 'minwon' ? L_M_RALLY : pick(LINES[this.mid]), 2.4);
      } else if (hello && this.stateT >= 1.6 && this.stateT - dt < 1.6) this.say(pick(LINES[this.mid]), 2.0);
      const there = this.walkTo(this.spot.x, this.spot.z, 2.8, dt, null, 0.4);
      this.faceTo(c.eye.x, c.eye.z, dt);
      if (there || this.stateT > 5) this.setState('idle');
      return;
    }
    this.subT += dt;
    // 마감 시계 (2D DeadlineBoss: 넘기면 연장 요청 → 진행이 30% 되돌아가고 초과근무 2분)
    if (this.mid === 'deadline') {
      this.deadline -= dt;
      if (this.deadline <= 0) {
        this.deadline = EXTEND_SEC;
        this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.3));
        this.say(L_D_EXTEND, 2);
        this.penalty += PENALTY_MIN;
        c.sound('squeal', this.person.chest, 0.8);
      }
    }
    switch (this.sub) {
      case 'walk':
        this.walk(dt, c);
        break;
      case 'act':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        this.act(c);
        break;
      case 'lure':
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.subT >= this.lureT) {
          this.raiseTo = 0;
          this.gimmickT = MID_INFO[this.mid].every * (this.easy ? 1.15 : 1) + Math.random() * 1.5;
          this.go('walk');
        }
        break;
      case 'stun':
        // 안내문이 붙었다: "…읽는 중" (서류를 든 채 멈춘다)
        this.faceTo(c.eye.x, c.eye.z, dt, 2);
        if (this.subT >= (this.easy ? 2.4 : 1.8)) {
          this.raiseTo = 0;
          this.go('walk');
        }
        break;
      case 'hidden':
        this.vanish(dt, c);
        break;
      case 'retrieve':
        this.retrieve(dt, c);
        break;
      case 'dash':
        this.dash(dt, c);
        break;
    }
    pushOut(this.obj.position, this.solids, 0.6);
  }

  private walk(dt: number, c: Ctx): void {
    const info = MID_INFO[this.mid];
    this.sideT -= dt;
    if (this.sideT <= 0) {
      this.side = -this.side;
      this.sideT = 3 + Math.random() * 2;
    }
    this.keepAway(c, dt, info.keep, 1.9, this.side);
    this.faceTo(c.eye.x, c.eye.z, dt);
    // 서류 부채꼴 (2D의 밀치기 자리. 마감 직전 학생은 기믹으로 던진다)
    if (this.mid !== 'deadline') {
      this.throwT -= dt;
      if (this.throwT <= 0) {
        this.throwT = 3.8 + Math.random();
        // 공지 안 읽는 학생은 가까이 오면 "그래서요?!" 세 장을 빠르게
        const near = Math.hypot(c.eye.x - this.obj.position.x, c.eye.z - this.obj.position.z) < 6.5;
        if (this.mid === 'noticeBoss' && near) {
          this.say(L_SO, 0.9);
          this.fan(c, 'paper', 3, 11, 0.12);
        } else {
          if (this.mid !== 'noticeBoss') this.say(pick(LINES[this.mid]), 1.4);
          this.fan(c, 'paper', 3, 8.5, 0.2);
        }
      }
    } else {
      this.chatT -= dt;
      if (this.chatT <= 0) {
        this.chatT = 6 + Math.random() * 3;
        this.say(pick(LINES.deadline), 1.4);
      }
    }
    // 최민원: 떨어뜨린 서명지를 먼저 주우러 간다
    if (this.mid === 'minwon' && !this.hasSheet && !this.sheetGone) {
      this.go('retrieve');
      return;
    }
    this.gimmickT -= dt;
    if (this.gimmickT <= 0) this.startGimmick(c);
  }

  private startGimmick(c: Ctx): void {
    this.cycle++;
    this.go('act');
    switch (this.mid) {
      case 'wrongNumber':
        this.say(L_VANISH, 1.0);
        break;
      case 'noticeBoss':
        this.reachTo = 1;
        this.say(pick(LINES.noticeBoss), 1.6);
        break;
      case 'deadline': {
        const k = this.cycle % 3;
        this.say(k === 1 ? L_D_THROW : k === 2 ? L_D_DASH : L_D_BOMB, k === 1 ? 1.4 : 1.0);
        this.reachTo = k === 2 ? 0 : 1;
        break;
      }
      case 'minwon':
        if (this.hasSheet) {
          this.say(L_M_RALLY, 1.4);
          this.reachTo = 1;
        } else {
          this.say(pick(LINES.minwon), 1.4);
        }
        break;
      case 'presidentMail':
        // 메일 쓰는 동안 서류를 들고 서 있다 (빈틈 — 맞히면 멈춘다)
        this.interrupted = false;
        this.say(L_P_TYPING, 1.8);
        this.reachTo = 0.7;
        this.openWindow();
        break;
    }
    void c;
  }

  private act(c: Ctx): void {
    const t = this.subT;
    switch (this.mid) {
      case 'wrongNumber': {
        // 사라진다 (0.4초) → 숨는다
        const k = Math.min(1, t / 0.4);
        this.obj.scale.setScalar(Math.max(0.05, 1 - k));
        if (k >= 1) {
          this.hidden = true;
          this.obj.visible = false;
          this.go('hidden');
        }
        break;
      }
      case 'noticeBoss':
        // 같은 질문 세 장을 줄지어 (2D: "?" 일렬)
        if (this.acted < 3 && t >= 0.3 + this.acted * 0.32) {
          this.acted++;
          this.fan(c, 'paper', 1, 9.5, 0);
        }
        if (t >= 1.4) this.toLure();
        break;
      case 'deadline': {
        const k = this.cycle % 3;
        if (k === 1) {
          if (!this.acted && t >= 0.35) {
            this.acted = 1;
            this.fan(c, 'paper', 3, 9.5, 0.2);
          }
          if (t >= 0.9) this.toLure();
        } else if (k === 2) {
          // 돌진 준비: 몸을 숙이고 겨눈다
          if (t >= 0.55) {
            this.dashDir.set(c.eye.x - this.obj.position.x, 0, c.eye.z - this.obj.position.z).normalize();
            this.dashHit = false;
            c.sound('dash', this.person.chest, 1);
            this.go('dash');
          }
        } else {
          // 서류 뭉치를 플레이어 옆에 던져 놓는다
          if (!this.acted && t >= 0.8) {
            this.acted = 1;
            const a = Math.random() < 0.5 ? -1 : 1;
            _a.set(c.eye.x - this.obj.position.x, 0, c.eye.z - this.obj.position.z).normalize();
            _b.set(c.eye.x - _a.z * a * 4.5, 1.4, c.eye.z + _a.x * a * 4.5);
            const ar = c.area;
            _b.x = Math.max(ar.minX + 1, Math.min(ar.maxX - 1, _b.x));
            _b.z = Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, _b.z));
            c.spawnAt('bomb', _b);
            c.fx.confetti(_b, 8, 2, 0xffffff, 1, 0.4);
          }
          if (t >= 1.1) this.toLure();
        }
        break;
      }
      case 'minwon':
        if (this.hasSheet) {
          this.waving = t < 1.1;
          if (!this.acted && t >= 1.2) {
            this.acted = 1;
            // 단체 민원: 메일 70% · 말풍선 30% 둘
            for (const s of [-1, 1]) {
              if (c.minions() >= 6) break;
              _a.set(s * 2.4, 2.2, 1.2).applyQuaternion(this.obj.quaternion).add(this.obj.position);
              c.spawnAt(Math.random() < 0.7 ? 'mail' : 'bubble', _a);
            }
            c.sound('volley', this.person.chest, 0.7);
          }
          if (t >= 1.5) this.toLure();
        } else {
          if (!this.acted && t >= 0.4) {
            this.acted = 1;
            this.fan(c, 'paper', 4, 9, 0.16);
          }
          if (t >= 0.9) this.toLure();
        }
        break;
      case 'presidentMail':
        if (this.interrupted) {
          this.toLure(this.lureT - 0.4);
          break;
        }
        if (t >= 1.8) {
          this.say(L_P_REPLY, 1.6);
          c.banner('총장실 지시 사항 하달!', '바닥의 빨간 표시를 피하세요');
          this.dropOrders(c);
          this.raiseTo = 0;
          this.reachTo = 0;
          this.gimmickT = MID_INFO.presidentMail.every * (this.easy ? 1.15 : 1) + Math.random() * 1.5;
          this.go('walk');
        }
        break;
    }
  }

  /** 전화번호 잘못 입력한 학생: 숨어 있다가 플레이어에게서 떨어진 곳에 다시 나타난다 */
  private vanish(_dt: number, c: Ctx): void {
    if (this.subT < 0.7) return;
    if (!this.acted) {
      this.acted = 1;
      const a = c.area;
      const o = this.obj.position;
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 7 + Math.random() * 7;
        o.set(Math.max(a.minX + 2, Math.min(a.maxX - 2, c.eye.x + Math.cos(ang) * d)), 0, Math.max(a.minZ + 2, Math.min(a.maxZ - 2, c.eye.z + Math.sin(ang) * d)));
        pushOut(o, this.solids, 0.6);
        if (Math.hypot(o.x - c.eye.x, o.z - c.eye.z) > 5.5) break;
      }
      this.faceNow(c.eye.x, c.eye.z);
      this.obj.visible = true;
      this.hidden = false;
      this.say(L_APPEAR, 1.4);
      c.sound('pop', this.person.chest, 0.7);
    }
    const k = Math.min(1, (this.subT - 0.7) / 0.3);
    this.obj.scale.setScalar(Math.max(0.05, k));
    if (k >= 1) this.toLure();
  }

  /** 마감 직전 학생: 돌진 (부딪히면 "마감 폭발!") */
  private dash(dt: number, c: Ctx): void {
    const o = this.obj.position;
    o.addScaledVector(this.dashDir, 11 * dt);
    this.walking = true;
    const a = c.area;
    const out = o.x < a.minX + 1 || o.x > a.maxX - 1 || o.z < a.minZ + 1 || o.z > a.maxZ - 1;
    o.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.x));
    o.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.z));
    if (!this.dashHit && c.feet < 1.2 && Math.hypot(c.eye.x - o.x, c.eye.z - o.z) < 1.4) {
      this.dashHit = true;
      // 부딪힘은 다른 보스 달려오기와 같은 4칸 (사용자 2026-11-20, 근접 배율 없이)
      c.hurt(4, this.person.chest, 'bomb', false);
    }
    if (this.subT >= 1.0 || out) this.toLure(this.easy ? 2.4 : 1.7);
  }

  /** 최민원: 떨어진 서명지를 주우러 간다 (플레이어가 먼저 주우면 더 부르지 못한다) */
  private retrieve(dt: number, c: Ctx): void {
    const s = this.sheetObj;
    if (!s || this.sheetGone) {
      this.go('walk');
      return;
    }
    const there = this.walkTo(s.position.x, s.position.z, 2.4, dt, c, 0.7);
    this.faceTo(s.position.x, s.position.z, dt, 6);
    if (there) {
      s.removeFromParent();
      this.sheetObj = null;
      this.hasSheet = true;
      if (this.mp.sheet) this.mp.sheet.visible = true;
      this.say(L_M_FOUND, 1.0);
      this.gimmickT = 2;
      this.go('walk');
    }
  }

  private dropSheet(c: Ctx): void {
    this.hasSheet = false;
    if (this.mp.sheet) this.mp.sheet.visible = false;
    const o = this.obj.position;
    _a.set(c.eye.x - o.x, 0, c.eye.z - o.z);
    const d = _a.length() || 1;
    _a.multiplyScalar(Math.min(3, d * 0.4) / d);
    const g = new THREE.Group();
    part(g, 0.7, 0.04, 0.9, 0, 0.03, 0, 0xffffff);
    for (let i = 0; i < 3; i++) part(g, 0.4, 0.045, 0.06, 0.05, 0.035, -0.25 + i * 0.18, i < 2 ? 0xd0202f : 0x1d1d22);
    const tag = c.models.label('단체 서명지', '#ffe066');
    tag.position.y = 1.0;
    g.add(tag);
    const ar = c.area;
    g.position.set(Math.max(ar.minX + 1, Math.min(ar.maxX - 1, o.x + _a.x)), 0.05, Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, o.z + _a.z)));
    c.scene.add(g);
    this.sheetObj = g;
    this.say(L_M_DROP, 1.0);
    c.fx.text(_b.copy(g.position).setY(2.2), '서명지를 먼저 주우세요!', '#ffe066', 0.6);
    c.sound('pop', g.position, 0.8);
  }

  /** 총장실 지시 사항: 플레이어 근처 세 군데에 빨간 그림자 → "지시" 서류가 떨어진다 */
  private dropOrders(c: Ctx): void {
    const ar = c.area;
    this.orders.forEach((q, i) => {
      const a = Math.random() * Math.PI * 2;
      const r = i === 0 ? Math.random() * 0.8 : 1.8 + Math.random() * 1.6;
      q.x = Math.max(ar.minX + 1, Math.min(ar.maxX - 1, c.eye.x + Math.cos(a) * r));
      q.z = Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, c.eye.z + Math.sin(a) * r));
      q.t = 0;
      q.at = 0.9 + i * 0.25;
      q.on = true;
      q.warn.visible = true;
      q.warn.position.set(q.x, 0.075, q.z);
      q.warn.scale.setScalar(0.4);
      q.doc.visible = false;
    });
  }

  private updateOrders(dt: number, c: Ctx): void {
    for (const q of this.orders) {
      if (!q.on) continue;
      q.t += dt;
      if (q.t < q.at) {
        q.warn.scale.setScalar(0.4 + (q.t / q.at) * 0.5);
        const f = Math.max(0, (q.t - (q.at - 0.35)) / 0.35);
        q.doc.visible = f > 0;
        q.doc.position.set(q.x, 12 * (1 - f) + 0.05, q.z);
        q.doc.rotation.set(0, q.t * 2, 0);
        continue;
      }
      if (q.warn.visible) {
        q.warn.visible = false;
        q.doc.position.y = 0.06;
        _a.set(q.x, 1, q.z);
        if (c.feet < 1 && Math.hypot(c.eye.x - q.x, c.eye.z - q.z) < 1.3) c.hurt(1, _a, 'mail');
        c.fx.confetti(_a.setY(0.3), 8, 2.4, 0xffffff, 1, 0.4);
        c.sound('hit', _a, 0.8);
      }
      if (q.t > q.at + 1.4) {
        q.on = false;
        q.doc.visible = false;
      }
    }
  }

  stamped(weak: boolean, c: Ctx): void {
    super.stamped(weak, c);
    if (this.dead) return;
    // 총장실 메일 학생: 쓰는 중에 맞으면 멈춘다
    if (this.mid === 'presidentMail' && this.sub === 'act' && !this.interrupted) {
      this.interrupted = true;
      this.say(L_P_STOP, 1.0);
    }
    // 최민원: 들어 올린 서류를 맞히면 서명지를 떨어뜨린다
    if (this.mid === 'minwon' && weak && this.hasSheet && !this.sheetGone) this.dropSheet(c);
  }

  update(dt: number, c: Ctx): void {
    super.update(dt, c);
    // 공지 안 읽는 학생: 막대가 ⅓ 찰 때마다 안내문이 붙고 "…읽는 중" (2D: 안내문 3번)
    if (this.mid === 'noticeBoss' && !this.dead) {
      const n = Math.min(2, Math.floor(this.progress * 3 + 1e-6));
      if (n > this.notices) {
        this.notices = n;
        this.showNotice(c);
        this.say(L_READING, 1.8);
        this.openWindow();
        this.reachTo = 0;
        this.go('stun');
      }
    }
    // 최민원: 바닥의 서명지 (플레이어가 밟으면 접수)
    const s = this.sheetObj;
    if (s) {
      s.rotation.y += dt * 1.2;
      if (!this.sheetGone && c.feet < 1 && Math.hypot(c.eye.x - s.position.x, c.eye.z - s.position.z) < 1.3) {
        this.sheetGone = true;
        c.fx.text(_a.copy(s.position).setY(2.0), '단체 서명지 접수 완료!', '#7CFC9A', 0.6);
        c.fx.confetti(_a.setY(0.6), 14, 3, 0x7cfc9a, 1.5, 0.6);
        c.sound('pickup', s.position, 1);
        s.removeFromParent();
        this.sheetObj = null;
      }
    }
    this.updateOrders(dt, c);
  }

  private showNotice(c: Ctx): void {
    const m = this.mp.notices[this.notices - 1];
    if (m) m.visible = true;
    c.fx.text(_a.copy(this.person.chest).setY(this.person.chest.y + 1.6), `안내문 ${this.notices}/3`, '#ffe066', 0.7);
    c.sound('weak', this.person.chest, 0.8);
  }

  die(): void {
    super.die();
    this.hidden = false;
    this.obj.visible = true;
    this.obj.scale.setScalar(1);
    if (this.mid === 'noticeBoss') {
      this.notices = 3;
      for (const m of this.mp.notices) m.visible = true;
    }
    for (const q of this.orders) {
      q.on = false;
      q.doc.visible = false;
      q.warn.visible = false;
    }
  }

  dispose(): void {
    super.dispose();
    this.sheetObj?.removeFromParent();
    this.sheetObj = null;
    for (const q of this.orders) {
      q.doc.removeFromParent();
      q.warn.removeFromParent();
    }
    this.orders = [];
  }
}

// ---------- 오검토 처장 · 최몰라 처장 (새 구역 보스) ----------

/** 2D createSupervisorRig 색: 오검토 = 갈색 정장·초록 넥타이·회색 머리·안경·도장, 최몰라 = 밤색 정장·회색 넥타이·회색 머리·찡그린 눈썹 */
export const GUMTO_LOOK: Look = { top: 0x6a5038, pants: 0x6a5038, tie: 0x2f6b3a, skin: SKIN, hair: 0xa8a8a8, brow: 0x6b6b6b, hairStyle: 'full', jacket: true, glasses: true, left: 'stamp', scale: 1.62 };
export const MOLLA_LOOK: Look = { top: 0x5c4a3a, pants: 0x5c4a3a, tie: 0x6b7280, skin: SKIN, hair: 0xb0b0b0, brow: 0x161616, hairStyle: 'full', jacket: true, left: 'none', scale: 1.62 };

/** 새 구역 보스 둘의 모형 (처음에 한 번 만들고 판마다 다시 쓴다) */
export function buildNewBossPeople(): { gumto: Person; molla: Person } {
  const molla = new Person('meeting', '최몰라 처장', '#c9d3e6', MOLLA_LOOK);
  // 왼손에 넘길 메일 봉투
  part(molla.armL, 0.34, 0.24, 0.04, 0, -0.86, 0.13, 0xf2ead8);
  part(molla.armL, 0.08, 0.08, 0.045, 0.1, -0.8, 0.13, 0xd0202f);
  return { gumto: new Person('meeting', '오검토 처장', '#c9d3e6', GUMTO_LOOK), molla };
}

type ReviveKind = 'mail' | 'bubble' | 'bomb';

/** 인문과학관 앞에서 처리된 민원 더미 (오검토 처장이 "재검토"로 되살린다. 되살린 것은 다시 쌓이지 않는다) */
export class ReviewPile {
  private items: { kind: ReviveKind; at: THREE.Vector3 }[] = [];
  private revived = new WeakSet<Enemy>();

  add(e: Enemy): void {
    if (this.revived.has(e)) return;
    const kind: ReviveKind | null = e.kind === 'mail' || e.kind === 'bulk' ? 'mail' : e.kind === 'bubble' ? 'bubble' : e.kind === 'bomb' ? 'bomb' : null;
    if (!kind) return;
    this.items.push({ kind, at: e.center.clone() });
    if (this.items.length > 14) this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  /** 가장 최근에 처리된 것부터 n개를 되살린다. 되살린 자리들을 돌려준다 */
  revive(c: Ctx, n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    const a = c.area;
    for (let i = 0; i < n && this.items.length; i++) {
      const it = this.items.pop() as { kind: ReviveKind; at: THREE.Vector3 };
      const p = it.at;
      p.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, p.x));
      p.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, p.z));
      p.y = it.kind === 'bomb' ? 1.4 : Math.max(1.8, p.y);
      this.revived.add(c.spawnAt(it.kind, p));
      out.push(p);
    }
    return out;
  }
}

abstract class NewBoss extends PersonBoss {
  abstract readonly hintText: string;
  protected readonly solids: readonly Rect[];
  protected side = 1;
  protected sideT = 0;
  protected lureT: number;

  constructor(c: Ctx, person: Person, at: THREE.Vector3, exit: THREE.Vector3, approve: string, name: string, hp: number, solids: readonly Rect[], easy: boolean) {
    super(c, person, at, exit, approve, '퇴근합니다…', name, hp);
    this.solids = solids;
    this.lureT = easy ? 3.0 : 2.4;
  }

  protected stroll(c: Ctx, dt: number, keep: number): void {
    this.sideT -= dt;
    if (this.sideT <= 0) {
      this.side = -this.side;
      this.sideT = 3.5 + Math.random() * 2;
    }
    this.keepAway(c, dt, keep, 1.8, this.side);
    pushOut(this.obj.position, this.solids, 0.7);
    this.faceTo(c.eye.x, c.eye.z, dt);
  }
}

/** 인문과학관 앞 보스 — 오검토 처장: 처리된 민원을 "재검토!"로 되살린다 (2D Supervisor gumto) */
export class Gumto extends NewBoss {
  readonly hintText = '처리한 민원을 재검토로 되살려요! 결재판을 들 때 노리세요';
  private readonly pile: ReviewPile;
  private volleyT = 3.5;
  private reviewT = 5;
  private lineT = 9;
  private revived = false;

  constructor(c: Ctx, person: Person, pile: ReviewPile, solids: readonly Rect[], easy: boolean) {
    // 인문과학관 현관에서 나온다
    super(c, person, HUM_DOOR, HUM_DOOR, L_GUMTO_OK, '오검토 처장', 72, solids, easy);
    this.pile = pile;
  }

  protected think(dt: number, c: Ctx): void {
    switch (this.state) {
      case 'enter':
        if (this.stateT < dt * 1.5) this.say(L_GUMTO_IN, 2.4);
        this.walkTo(170, HUM_DOOR.z, 2.4, dt, null, 0.3);
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT > 3.2) this.setState('idle');
        break;
      case 'idle':
        this.stroll(c, dt, 10);
        this.lineT -= dt;
        if (this.lineT <= 0) {
          this.lineT = 9 + Math.random() * 4;
          this.say(L_GUMTO_HM, 1.4);
        }
        this.volleyT -= dt;
        if (this.volleyT <= 0) {
          this.volleyT = this.phase2 ? 3.3 : 4.3;
          this.fan(c, 'paper', this.phase2 ? 6 : 4, 10, 0.14);
        }
        if (!this.phase2 && this.hp <= this.maxHp / 2) this.phase2 = true;
        this.reviewT -= dt;
        if (this.reviewT <= 0) {
          // 재검토: 도장 든 손을 들고 "재검토!" → 처리된 민원이 되살아난다
          this.setState('act');
          this.reachTo = 1;
          this.revived = false;
          this.say(this.pile.size ? L_GUMTO_RE : L_GUMTO_HM, 1.2);
        }
        break;
      case 'act':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (!this.revived && this.stateT >= 0.5) {
          this.revived = true;
          const n = c.minions() >= 6 ? 0 : this.phase2 ? 3 : 2;
          for (const p of this.pile.revive(c, n)) {
            c.fx.text(_a.copy(p).setY(p.y + 0.9), '재검토', '#ff6b6b', 0.7);
            c.fx.ring(p.x, 0.07, p.z, 0.3, 1.8, 0.4, 0xd0202f);
          }
          c.sound('process', this.person.chest, 0.8);
        }
        if (this.stateT >= 0.9) {
          this.reachTo = 0;
          this.openWindow();
          this.setState('lure');
        }
        break;
      case 'lure':
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT >= this.lureT) {
          this.raiseTo = 0;
          this.reviewT = this.phase2 ? 5.5 : 7;
          this.setState('idle');
        }
        break;
      default:
        break;
    }
  }
}

/** 국제학사 앞 보스 — 최몰라 처장: "몰라~" 하며 메일·전화를 떠넘긴다 (2D Supervisor molla) */
export class Molla extends NewBoss {
  readonly hintText = '메일과 전화를 떠넘겨요! 결재판을 들 때 노리세요';
  private passT = 3.5;
  private passes = 0;
  private passed = false;

  constructor(c: Ctx, person: Person, solids: readonly Rect[], easy: boolean) {
    // 국제학사(학생회관) 현관에서 나온다
    super(c, person, DORM_DOOR, DORM_DOOR, L_MOLLA_OK, '최몰라 처장', 78, solids, easy);
  }

  protected think(dt: number, c: Ctx): void {
    switch (this.state) {
      case 'enter':
        if (this.stateT < dt * 1.5) this.say(L_MOLLA, 2.6);
        this.walkTo(186, DORM_DOOR.z, 2.4, dt, null, 0.3);
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT > 3.2) this.setState('idle');
        break;
      case 'idle':
        this.stroll(c, dt, 11);
        if (!this.phase2 && this.hp <= this.maxHp / 2) this.phase2 = true;
        this.passT -= dt;
        if (this.passT <= 0) {
          this.setState('act');
          this.reachTo = 1;
          this.passed = false;
          this.passes++;
          if (this.passes % 2 === 1) this.say(L_MOLLA, 1.6);
        }
        break;
      case 'act':
        this.faceTo(c.eye.x, c.eye.z, dt, 8);
        if (!this.passed && this.stateT >= 0.45) {
          this.passed = true;
          // 넘겨받은 민원: 양옆에서 메일 둘, 세 번에 한 번은 전화, 2단계에서는 서류 뭉치도
          if (c.minions() < 7) {
            for (const s of [-1, 1]) {
              _a.set(s * 1.8, 2.3, 0.8).applyQuaternion(this.obj.quaternion).add(this.obj.position);
              c.spawnAt('mail', _a);
              c.fx.text(_b.copy(_a).setY(_a.y + 0.8), '넘겨받은 민원', '#ffd27f', 0.55);
            }
            if (this.passes % 3 === 0) c.spawnPhone();
            if (this.phase2 && this.passes % 2 === 0) c.spawnAt('bomb', _a.set(0, 1.4, 2).applyQuaternion(this.obj.quaternion).add(this.obj.position));
          }
          c.sound('volley', this.person.chest, 0.7);
        }
        if (this.stateT >= 0.9) {
          // 떠넘기고 결재판을 든 채 어깨를 으쓱 (빈틈)
          this.reachTo = 0;
          this.openWindow();
          this.setState('lure');
        }
        break;
      case 'lure':
        this.faceTo(c.eye.x, c.eye.z, dt);
        if (this.stateT >= this.lureT) {
          this.raiseTo = 0;
          this.passT = this.phase2 ? 3.6 : 4.8;
          this.setState('idle');
        }
        break;
      default:
        break;
    }
  }
}
