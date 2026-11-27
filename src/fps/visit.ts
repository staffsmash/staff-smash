import * as THREE from 'three';
import { noteVisitSuccess } from '../badges';
import type { HeroId } from '../data/heroes';
import { perkMul } from '../perks';
import type { SfxName } from './audio';
import type { Rect } from './blocks';
import { BODY_DMG, PersonBoss } from './bosses';
import type { Ctx, Enemy, HurtKind } from './enemies';
import type { Fx } from './fx';
import { SKIN } from './looks';
import { Person, type Look, type PoseIn } from './people';
import { placeIn, segDist } from './sidejob';
import { prepareSpeech } from './speech';
import { canvasTex, FONT, labelTex } from './textures';

// 1인칭 교직원 모드: 교직원별 돌발 방문 이벤트 (사용자 2026-11-25, PRD 결정 59). 코드 안 이름은 visit.
// - 고른 교직원(heroes.ts 6명)마다 전용 상대가 한 명 있다 (모두 이름 없는 가상 인물):
//   김국제 → 외국 대사("대사님") · 김학종지 → 수강신청 매크로 학생 · 나진취 → 장기 미취업 학생 ·
//   권학생 → 동아리 연합회장 · 김전략 → 대학평가 실사 위원 · 최도서관 → 400일 장기 연체 대학원생
// - 한 판에 한 번 반드시. areaOf 1~4 가운데 무작위 한 구역의 민원 차례 중에 나온다 (그 판 돕기 이벤트 sidejob.ts 구역은 피한다).
//   예산팀 직원·조력자·구조 장면·돕기 이벤트·구역 카드가 끝난 뒤에 (VisitHost.free).
//   나올 차례이거나 진행 중이면 민원 차례가 끝나지 않는다 (Game.stepWave가 holds를 본다) → 중간보스는 이벤트 뒤.
//   보스전·총장전에는 민원 차례가 없으니 나오지 않는다. 학생 모드에는 나오지 않는다.
// - 흐름: 화면 띠 → 상대가 달려 들어오며 등장 대사 → 머리 위 작은 결재판(10칸)에 도장을 맞힐 때마다 한 칸, 10발이면 성공.
//   필살기·아이템은 사람 보스와 같은 규칙 (상대는 적 목록에 든 PersonBoss — Game.itemHit·noticeHit·damage가 그대로 쓴다).
//   제한 20초. 성공: 성공 대사 → 떠나면서 보상 상자. 실패: 실패 대사 → 떠난다 (불이익·보상 없음).
//   이벤트 중에도 잡몹은 조금씩 온다 (TRICKLE, sidejob.ts와 같은 값).
// - 공격은 모두 0.8초 예고 뒤에 나가고 피할 수 있다. 맞으면 피해 2 (Game.hurt(2, at, kind, false) — 근접 배율 없음, 난이도 배율은 hurt가 곱한다).
// - 상대는 사람이라 다치지 않는다: 도장은 머리 위 결재판만 채운다.
// - 보상 6종은 F 칸(sidejob.ts useItem — 이벤트 보상이 먼저)에 들어가 쓸 때까지 들고 간다. 쓰러지거나 다시 하면 사라진다 (clear).

export type RewardId = 'glove' | 'clicker' | 'graph' | 'cheer' | 'plaque' | 'quiet';
type AttackId = 'punch' | 'cursor' | 'resume' | 'luggage' | 'inspect' | 'book';
type State = 'idle' | 'enter' | 'fight' | 'talk' | 'out';
type Phase = 'move' | 'wind' | 'act';

/** 나올 수 있는 구역 (areaOf: 사회과학관 앞·인문과학관 앞·국제학사 앞·대운동장) */
export const VISIT_AREAS = [1, 2, 3, 4];
/** 제한 시간 (초) */
export const VISIT_T = 20;
/** 결재판 칸 수 = 도장 몇 발 */
export const VISIT_NEED = 10;
/** 공격 한 번 피해 (난이도 배율은 Game.hurt가 곱한다) */
export const VISIT_DMG = 2;
/** 공격 예고 (적 시간 초) */
export const WARN_T = 0.8;
const SCALE = 1.45;
/** 플레이어 걷는 빠르기 (main.ts WALK) */
const PLAYER_WALK = 5;
/** 플레이어 앞 몇 m에 서는지, 거기까지 몇 m를 달려 들어오는지 */
const SPOT_D = 8;
const ENTER_D = 9;
const ENTER_V = 9;
const OUT_V = 4.5;
/** 옆걸음 (대사님 말고) */
const STRAFE_V = 2.8;
/** 대사님: 플레이어 둘레 반지름, 옆걸음 빠르기 (플레이어 걸음의 1.4배) */
const ORBIT_R = 8;
const ORBIT_V = PLAYER_WALK * 1.4;
/** 도착하고 첫 공격까지 (적 시간 초) */
const FIRST_ATK = 1.6;
/** 이벤트 중 잡몹이 TRICKLE_MAX 개 아래면 TRICKLE_T 초마다 하나씩 (sidejob.ts와 같은 값) */
const TRICKLE_T = 3.5;
const TRICKLE_MAX = 3;

// 공격 세부
/** 로켓 펀치: 주먹이 나가는 시간·돌아오는 시간 (합 1.2초 — 그동안 대사님은 팔 없이 멈칫), 맞는 거리 */
const PUNCH_OUT = 0.6;
const PUNCH_R = 0.8;
/** 마우스 커서: 발 수, 빠르기, 한 발 사이 (초), 플레이어 자리에서 커서 사이 (m), 맞는 거리, 한 번 연사로 받는 피해 최대.
 *  가만히 서 있으면 가운데 두 발에 맞는다 (맞은 발은 0.15초 모아 한 번에 — Game.hurt의 무적 시간 때문에) */
const CURSOR_N = 8;
const CURSOR_V = 15;
const CURSOR_GAP = 0.05;
const CURSOR_SPACE = 0.8;
const CURSOR_R = 0.55;
const CURSOR_MAX = 2;
const CURSOR_SUM_T = 0.15;
/** 자소서 장풍: 빠르기, 처음 폭 → 12m 뒤 폭 (m), 가는 거리 */
const RESUME_V = 11;
const RESUME_W0 = 1.8;
const RESUME_W1 = 4.2;
const RESUME_RANGE = 28;
const RESUME_PAPERS = 14;
/** 이삿짐 굴리기: 빠르기, 가는 거리, 둘째 것이 비껴가는 각 (라디안) */
const ROLL_V = 9.5;
const ROLL_RANGE = 30;
const ROLL_SIDE = 0.38;
/** 이삿짐 상자 한 변, 통기타 케이스 굵기 (m) — 발이 이보다 높이 떠 있으면 넘는다 */
const BOX_H = 0.52;
const CASE_H = 0.42;
/** 실사 ✘ 표시: 터지는 반지름, 플레이어 자리 말고 두 곳이 떨어진 거리 [최소, 최대] */
const MARK_R = 1.5;
const MARK_MIN = 2.6;
const MARK_MAX = 5;
/** 책 던지기: 날아가는 시간, 옆 두 권이 떨어지는 거리, 맞는 반지름, 포물선 높이 */
const BOOK_FLIGHT = 0.8;
const BOOK_SIDE = 2.2;
const BOOK_R = 1.0;
const BOOK_ARC = 3;
/** 그림자 배율 (models.warnGeo는 2.6m 판): 다 자라면 맞는 반지름과 같다 */
const BOOK_SHADOW = (BOOK_R * 2) / 2.6;

// 보상
/** 로켓 펀치 장갑: 횟수, 사람 보스에게 도장 몇 발, 빠르기, 가는 거리 */
export const GLOVE_USES = 3;
export const GLOVE_STAMPS = 4;
const GLOVE_V = 30;
const GLOVE_RANGE = 40;
/** 매크로 클리커: 시간, 연사 배율 */
export const CLICK_T = 6;
export const CLICK_MUL = 3;
/** 취업률 상승 그래프: 날아가는 거리, 사람 보스에게 갈 때·올 때 도장 몇 발, 빠르기 */
export const GRAPH_RANGE = 18;
export const GRAPH_STAMPS = 4;
const GRAPH_V = 20;
/** 응원단 호출권: 시간, 한 사람이 던지는 사이 (초), 노리는 거리 (m), 응원 술 빠르기 */
export const CHEER_T = 10;
const CHEER_CD = 0.6;
const CHEER_RANGE = 26;
/** 동아리원이 서는 곳: 플레이어 양옆 CHEER_SIDE m, 앞 CHEER_FWD m (조금 뒤 — 시야를 가리지 않는다. 달려 들어올 때·응원 술은 보인다) */
const CHEER_SIDE = 2.6;
const CHEER_FWD = -0.4;
const POM_V = 26;
/** 실사 통과 현판: 안전지대 반지름, 시간 */
export const PLAQUE_R = 5;
export const PLAQUE_T = 12;
/** 쉿! 정숙 표지판: 시간, 잡몹 빠르기 배율 */
export const QUIET_T = 10;
export const QUIET_MUL = 0.5;
/** 보상 상자를 줍는 거리 */
const PICK_D = 1.4;

interface VisitDef {
  /** 띠·이름표·자막 이름 */
  who: string;
  /** 결재판 이름 */
  board: string;
  enter: string;
  attack: string;
  win: string;
  fail: string;
  kind: AttackId;
  /** 공격 사이 (적 시간 초) */
  every: number;
  /** 옆걸음할 때 플레이어와 두는 거리 (대사님은 ORBIT_R) */
  keep: number;
  reward: RewardId;
  color: string;
}

/** 사용자 확정 문구 (2026-11-25 — 글자 그대로) */
const DEFS: Record<HeroId, VisitDef> = {
  kimgukje: {
    who: '대사님',
    board: '특강 일정 확정',
    enter: '대사 방문 특강!',
    attack: '로켓 펀치!',
    win: '특강 일정 확정! 감사합니다',
    fail: '다음 학기에 다시 오겠습니다',
    kind: 'punch',
    every: 5,
    keep: ORBIT_R,
    reward: 'glove',
    color: '#ffd27a',
  },
  ohakjongji: {
    who: '매크로 학생',
    board: '정원 외 증원 처리',
    enter: '올클 가즈아!',
    attack: '광클!',
    win: '증원 감사합니다!',
    fail: '정정 기간에 또 올게요',
    kind: 'cursor',
    every: 4.5,
    keep: 9,
    reward: 'clicker',
    color: '#9fd3ff',
  },
  leejinchwi: {
    who: '장기 미취업 학생',
    board: '캠퍼스 리크루팅 참가 확정',
    enter: '선생님 취업 좀 시켜주세요!!',
    attack: '자소서 장풍!',
    win: '캠퍼스 리크루팅 꼭 갈게요!',
    fail: '자소서 고쳐서 또 올게요…',
    kind: 'resume',
    every: 5,
    keep: 8.5,
    reward: 'graph',
    color: '#c8f08a',
  },
  choijanghak: {
    who: '동아리 연합회장',
    board: '동아리방 재배정 승인',
    enter: '동아리방 다시 배정해 주세요!',
    attack: '짐 나갑니다~!',
    win: '새 동아리방 감사합니다!',
    fail: '다음 학기엔 꼭이요!',
    kind: 'luggage',
    every: 4.5,
    keep: 10,
    reward: 'cheer',
    color: '#ffb3d1',
  },
  parkhaksa: {
    who: '실사 위원',
    board: '실사 통과',
    enter: '현장 실사 나왔습니다!',
    attack: '지적 사항!',
    win: '지표 우수! 다음 평가 때 뵙죠',
    fail: '보완 자료 제출 바랍니다',
    kind: 'inspect',
    every: 4.5,
    keep: 8,
    reward: 'plaque',
    color: '#d8c4ff',
  },
  kimsikdang: {
    who: '연체 대학원생',
    board: '연체료 납부 완료',
    enter: '반납이요! 연체료는 깎아 주세요!',
    attack: '책 받으세요~!',
    win: '연체료 납부했습니다…',
    fail: '논문 끝나면 낼게요!',
    kind: 'book',
    every: 4.5,
    keep: 9,
    reward: 'quiet',
    color: '#f5c542',
  },
};

/** 보상 이름 (사용자 확정), 터치 단추 글, 횟수 */
const REWARD: Record<RewardId, { name: string; btn: string; uses: number }> = {
  glove: { name: '로켓 펀치 장갑', btn: '장갑', uses: GLOVE_USES },
  clicker: { name: '매크로 클리커', btn: '클리커', uses: 1 },
  graph: { name: '취업률 상승 그래프', btn: '그래프', uses: 1 },
  cheer: { name: '응원단 호출권', btn: '응원단', uses: 1 },
  plaque: { name: '실사 통과 현판', btn: '현판', uses: 1 },
  quiet: { name: '쉿! 정숙 표지판', btn: '표지판', uses: 1 },
};

/** 시험용 (?debug): 교직원 id 목록 */
export const VISIT_HEROES = Object.keys(DEFS) as HeroId[];

// ---------- 외형 (people.ts Look — 공용 블록 사람) ----------

const AMB_SUIT = 0x1f2533;

/** 대사님: 짙은 정장 + 왼손에 특강 원고 (사선 띠·훈장은 따로 붙인다). 남녀 무작위 */
function ambassadorLook(female: boolean): Look {
  return female
    ? { top: AMB_SUIT, pants: AMB_SUIT, tie: AMB_SUIT, noTie: true, skin: SKIN, hair: 0x3b2a20, brow: 0x3b2a20, hairStyle: 'bob', jacket: true, female: true, skirt: true, smile: true, left: 'report', scale: SCALE }
    : { top: AMB_SUIT, pants: AMB_SUIT, tie: 0x3c3f4a, skin: SKIN, hair: 0x2a2420, brow: 0x2a2420, hairStyle: 'full', jacket: true, smile: true, left: 'report', scale: SCALE };
}

const LOOKS: Record<Exclude<HeroId, 'kimgukje'>, Look> = {
  // 수강신청 매크로 학생 (남): 회색 후드티·은테안경·이어폰·백팩, 왼손에 마우스
  ohakjongji: { top: 0x6b7280, pants: 0x2d3240, tie: 0x6b7280, noTie: true, skin: SKIN, hair: 0x1f1a17, brow: 0x1f1a17, hairStyle: 'full', jacket: false, hoodie: true, glassesStyle: 'silver', earphones: true, bag: 0x334155, shoes: 0xf4f4f4, left: 'none', scale: SCALE },
  // 장기 미취업 학생 (여): 검은 면접 정장·묶은 머리, 왼손에 자기소개서 더미
  leejinchwi: { top: 0x1b1d22, pants: 0x1b1d22, tie: 0x1b1d22, noTie: true, skin: SKIN, hair: 0x1b1712, brow: 0x1b1712, hairStyle: 'ponytail', jacket: true, female: true, skirt: true, left: 'none', scale: SCALE },
  // 동아리 연합회장 (남): 외대 야구잠바·스포츠머리
  choijanghak: { top: 0x24365e, pants: 0x3a4150, tie: 0x24365e, noTie: true, skin: SKIN, hair: 0x1b1712, brow: 0x1b1712, hairStyle: 'crew', jacket: false, varsity: true, shoes: 0xf4f4f4, smile: true, left: 'none', scale: SCALE },
  // 대학평가 실사 위원 (남): 회색 정장·은테안경·출입증, 왼손에 점검표
  parkhaksa: { top: 0x4a4f5a, pants: 0x4a4f5a, tie: 0x7a1f2b, skin: SKIN, hair: 0xa8a8a8, brow: 0x6b6b6b, hairStyle: 'bald', jacket: true, glassesStyle: 'silver', lanyard: true, left: 'report', scale: SCALE },
  // 400일 장기 연체 대학원생 (남): 체크 셔츠·뿔테안경·백팩, 왼손에 책 더미
  kimsikdang: { top: 0x5f7a4a, pants: 0x3b4252, tie: 0x5f7a4a, noTie: true, skin: SKIN, hair: 0x2a2420, brow: 0x2a2420, hairStyle: 'full', jacket: false, check: true, tee: 0xe9e4d8, glassesStyle: 'horn', bag: 0x6b4f35, left: 'none', scale: SCALE },
};

/** 응원단 동아리원 둘 (외대 야구잠바, 남녀) */
const CHEER_LOOKS: Look[] = [
  { top: 0x24365e, pants: 0x2d3240, tie: 0x24365e, noTie: true, skin: SKIN, hair: 0x1b1712, brow: 0x1b1712, hairStyle: 'crew', jacket: false, varsity: true, shoes: 0xf4f4f4, smile: true, left: 'none', scale: 1.35 },
  { top: 0x24365e, pants: 0x2d3240, tie: 0x24365e, noTie: true, skin: SKIN, hair: 0x2a2420, brow: 0x2a2420, hairStyle: 'ponytail', jacket: false, varsity: true, female: true, shoes: 0xf4f4f4, smile: true, left: 'none', scale: 1.35 },
];

/** 대사님 사선 예복 띠 색 [띠, 가운데 줄] — 가상 나라. 흔한 국기 색 조합(빨강·하양·파랑·노랑·초록 짝)은 피했다 */
const SASH_COLORS: [number, number][] = [
  [0x1f8a8a, 0xe0b84a],
  [0x6a3fa0, 0xd8d8e0],
  [0xc26a1f, 0x2a6f6f],
  [0x3f9f6f, 0xb07ad0],
  [0x8a2f5a, 0x7fc8d8],
  [0x2f5aa8, 0xf0a0b8],
];

// ---------- 모형 ----------

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const basic = (c: number) => new THREE.MeshBasicMaterial({ color: c });
const UNIT = new THREE.BoxGeometry(1, 1, 1);

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** 로켓 불꽃 (앞 = +z, 불꽃은 -z로 뻗는다) */
function buildFlame(): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 8), basic(0xff8a2a));
  outer.rotation.x = -Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), basic(0xffe066));
  inner.rotation.x = -Math.PI / 2;
  inner.position.z = 0.04;
  g.add(outer, inner);
  return g;
}

/** 대사님의 날아가는 주먹 (앞 = +z): 주먹 + 정장 소맷부리 + 불꽃 */
function buildFist(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.24, 0.22, 0.26, 0, 0, 0.04, lam(SKIN));
  box(g, 0.26, 0.06, 0.08, 0, 0.06, 0.16, lam(0xe6b48c));
  box(g, 0.27, 0.27, 0.14, 0, 0, -0.15, lam(AMB_SUIT));
  box(g, 0.28, 0.06, 0.15, 0, 0, -0.07, lam(0xffffff));
  const f = buildFlame();
  f.position.z = -0.42;
  f.name = 'flame';
  g.add(f);
  g.visible = false;
  return g;
}

/** 로켓 펀치 장갑 (보상, 앞 = +z): 빨간 장갑 + 흰 소맷부리 + 불꽃 */
function buildGlove(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.36, 0.32, 0.42, 0, 0, 0.04, lam(0xd0202f));
  box(g, 0.11, 0.15, 0.2, 0.2, -0.02, 0.08, lam(0xb81a28));
  box(g, 0.38, 0.34, 0.12, 0, 0, -0.22, lam(0xffffff));
  const f = buildFlame();
  f.position.z = -0.5;
  f.scale.setScalar(1.3);
  f.name = 'flame';
  g.add(f);
  return g;
}

/** 취업률 상승 그래프 (보상): 흰 판에 계단처럼 오르는 막대 넷 + 빨간 화살표 (앞뒤 모두) */
function buildGraph(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.95, 0.75, 0.04, 0, 0, 0, lam(0xffffff));
  box(g, 0.97, 0.05, 0.06, 0, -0.36, 0, lam(0x2b2f3a));
  box(g, 0.05, 0.75, 0.06, -0.46, 0, 0, lam(0x2b2f3a));
  const cols = [0x4d7fd6, 0x3fa0c8, 0x3fb28a, 0x5bbf63];
  const hs = [0.14, 0.27, 0.4, 0.55];
  for (const z of [0.035, -0.035]) {
    for (let i = 0; i < 4; i++) box(g, 0.15, hs[i], 0.02, -0.3 + i * 0.2, -0.33 + hs[i] / 2, z, lam(cols[i]));
    const arrow = box(g, 0.72, 0.05, 0.02, 0.0, 0.0, z * 1.4, lam(0xd0202f));
    arrow.rotation.z = 0.55;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 6), lam(0xd0202f));
    head.position.set(0.31, 0.21, z * 1.4);
    head.rotation.z = 0.55 - Math.PI / 2;
    g.add(head);
  }
  return g;
}

/** 응원 술 (동아리원 손·던지는 것) */
function buildPom(color = 0xffd84a): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), lam(color));
  m.castShadow = true;
  return m;
}

/** 보상 상자: 노란 상자 + 빨간 끈·리본 */
function buildGift(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.56, 0.46, 0.56, 0, 0.23, 0, lam(0xf5c542));
  box(g, 0.6, 0.08, 0.6, 0, 0.46, 0, lam(0xe0a92a));
  box(g, 0.1, 0.5, 0.58, 0, 0.24, 0, lam(0xd0202f));
  box(g, 0.58, 0.5, 0.1, 0, 0.24, 0, lam(0xd0202f));
  const b1 = box(g, 0.2, 0.12, 0.08, -0.1, 0.55, 0, lam(0xd0202f));
  b1.rotation.z = 0.5;
  const b2 = box(g, 0.2, 0.12, 0.08, 0.1, 0.55, 0, lam(0xd0202f));
  b2.rotation.z = -0.5;
  return g;
}

/** 이삿짐 상자 (굴러가는 것 — spin을 x축으로 돌린다) */
function buildMoveBox(): { obj: THREE.Group; spin: THREE.Group } {
  const obj = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = BOX_H / 2;
  box(spin, BOX_H, BOX_H, BOX_H, 0, 0, 0, lam(0xc79a5b));
  box(spin, BOX_H + 0.02, 0.09, BOX_H + 0.02, 0, 0.0, 0, lam(0xd9c27a));
  box(spin, 0.18, 0.12, 0.02, 0.1, 0.12, BOX_H / 2 + 0.005, lam(0x2b2f3a));
  obj.add(spin);
  obj.visible = false;
  return { obj, spin };
}

/** 통기타 케이스 (진행 방향에 가로로 누워 통나무처럼 구른다) */
function buildCase(): { obj: THREE.Group; spin: THREE.Group } {
  const obj = new THREE.Group();
  const spin = new THREE.Group();
  spin.position.y = 0.22;
  const black = lam(0x1c1c1c);
  box(spin, 0.62, 0.3, 0.3, -0.22, 0, 0, black);
  box(spin, 0.5, 0.42, 0.42, 0.34, 0, 0, black);
  box(spin, 0.12, 0.05, 0.08, 0.05, 0.17, 0, lam(0x8a8f96));
  box(spin, 0.03, 0.31, 0.31, -0.55, 0, 0, lam(0xd9b44a));
  obj.add(spin);
  obj.visible = false;
  return { obj, spin };
}

/** 책 한 권 (하드커버) */
function buildBook(color: number): THREE.Group {
  const g = new THREE.Group();
  box(g, 0.4, 0.1, 0.52, 0, 0, 0, lam(color));
  box(g, 0.36, 0.08, 0.5, 0.025, 0, 0, lam(0xf4f0e0));
  return g;
}

const BOOK_COLORS = [0x8b2e3c, 0x2e5a8b, 0x2f7a4d];

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** 마우스 커서 그림 */
function cursorTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    g.beginPath();
    g.moveTo(14, 4);
    g.lineTo(14, 50);
    g.lineTo(25, 39);
    g.lineTo(33, 58);
    g.lineTo(42, 54);
    g.lineTo(34, 36);
    g.lineTo(50, 36);
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = '#111318';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fill();
  });
}

/** 바닥 ✘ 표시 (빨간 원 = 터지는 범위) */
function markTex(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(229,40,52,0.85)';
    g.beginPath();
    g.arc(128, 128, 118, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(229,40,52,0.18)';
    g.fill();
    g.lineCap = 'round';
    for (const [w, c] of [
      [46, '#5a0d14'],
      [32, '#ff3b47'],
    ] as [number, string][]) {
      g.lineWidth = w;
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(192, 192);
      g.moveTo(192, 64);
      g.lineTo(64, 192);
      g.stroke();
    }
  });
}

/** 자기소개서 한 장 (장풍 종이) */
function resumeTex(): THREE.CanvasTexture {
  return canvasTex(96, 128, (g) => {
    g.fillStyle = '#fbf8ef';
    g.fillRect(0, 0, 96, 128);
    g.strokeStyle = '#8b92a0';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 94, 126);
    g.fillStyle = '#1d1d22';
    g.font = `bold 15px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('자기소개서', 48, 22);
    // 사진 칸 + 글 줄
    g.strokeRect(10, 32, 22, 28);
    g.fillStyle = '#9aa0aa';
    for (let y = 36; y < 60; y += 7) g.fillRect(38, y, 48, 3);
    for (let y = 70; y < 120; y += 8) g.fillRect(10, y, 76 - ((y * 7) % 20), 3);
  });
}

/** 둥근 반짝임 (로켓 펀치 예고) */
function glowTex(): THREE.CanvasTexture {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,230,1)');
    gr.addColorStop(0.35, 'rgba(255,214,90,0.85)');
    gr.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}

/** 판에 쓴 글 (현판·표지판) */
function plateTex(lines: string[], fg: string, bg: string, border: string): THREE.CanvasTexture {
  return canvasTex(320, 180, (g) => {
    g.fillStyle = border;
    g.fillRect(0, 0, 320, 180);
    g.fillStyle = bg;
    rr(g, 12, 12, 296, 156, 14);
    g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((l, i) => {
      g.font = `bold ${i === 0 ? 64 : 40}px ${FONT}`;
      g.fillText(l, 160, 90 + (i - (n - 1) / 2) * 62);
    });
  });
}

// ---------- 머리 위 결재판 (HeadTag.setExtra — 화면에서 늘 같은 크기) ----------

const BOARD_H = 210;
const BOARD_FONT = `bold 46px ${FONT}`;

class Board {
  readonly mat: THREE.SpriteMaterial;
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly w: number;
  private shown = -1;

  constructor(private readonly title: string) {
    const probe = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    probe.font = BOARD_FONT;
    this.w = Math.max(560, Math.ceil(probe.measureText(title).width) + 90);
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = BOARD_H;
    this.g = c.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.userData = { aspect: this.w / BOARD_H };
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, sizeAttenuation: false });
    this.draw(0, false);
  }

  get texture(): THREE.Texture {
    return this.tex;
  }

  /** n칸 찬 결재판 (done: 다 차서 "승인" 도장) */
  draw(n: number, done: boolean): void {
    const key = done ? 99 : n;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.g;
    const W = this.w;
    g.clearRect(0, 0, W, BOARD_H);
    // 갈색 판 + 흰 종이 + 집게
    rr(g, 6, 18, W - 12, BOARD_H - 24, 18);
    g.fillStyle = '#9a6a3a';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#4f3219';
    g.stroke();
    rr(g, 22, 34, W - 44, BOARD_H - 56, 8);
    g.fillStyle = '#fbf8ef';
    g.fill();
    rr(g, W / 2 - 56, 4, 112, 34, 9);
    g.fillStyle = '#8a8f96';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#3d4148';
    g.stroke();
    g.font = BOARD_FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1d1d22';
    g.fillText(this.title, W / 2, 78);
    // 칸 10개 (도장을 맞힌 만큼 빨간 "결")
    const cw = 42;
    const gap = 7;
    const x0 = (W - (VISIT_NEED * cw + (VISIT_NEED - 1) * gap)) / 2;
    const y0 = 112;
    for (let i = 0; i < VISIT_NEED; i++) {
      const x = x0 + i * (cw + gap);
      g.lineWidth = 3;
      g.strokeStyle = '#8b92a0';
      g.fillStyle = '#ffffff';
      g.fillRect(x, y0, cw, cw);
      g.strokeRect(x, y0, cw, cw);
      if (i < n || done) {
        g.fillStyle = '#d0202f';
        g.beginPath();
        g.arc(x + cw / 2, y0 + cw / 2, 18, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = `bold 22px ${FONT}`;
        g.fillText('결', x + cw / 2, y0 + cw / 2 + 1);
      }
    }
    if (done) {
      g.save();
      g.translate(W / 2, BOARD_H / 2 + 14);
      g.rotate(-0.22);
      g.lineWidth = 9;
      g.strokeStyle = 'rgba(208,32,47,0.92)';
      rr(g, -110, -48, 220, 96, 16);
      g.stroke();
      g.fillStyle = 'rgba(208,32,47,0.92)';
      g.font = `bold 66px ${FONT}`;
      g.fillText('승인', 0, 4);
      g.restore();
    }
    this.tex.needsUpdate = true;
  }
}

// ---------- 상대 (적 목록에 드는 사람) ----------

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _prev = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * 돌발 방문 상대: PersonBoss라서 도장(결재판)·전체 공지·필살기·빗자루·폭탄이 맞는다. 칸 수는 2D와 같게(2026-11-25):
 * 필살기 한 번 4칸, 그 밖의 한 번 1칸 (Game.damage).
 * 결재 양 = 도장 몸통 VISIT_NEED발 (난이도와 상관없이 10발). 움직임·공격은 Visit.drive가 정한다.
 * Game.onProcessed는 이것을 보스 결재로 치지 않는다 (구역이 넘어가지 않는다).
 */
export class VisitPerson extends PersonBoss {
  /** 이번 단계 자세 (Visit.drive가 정한다) */
  readonly pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
  /** 마지막으로 필살기가 닿은 때 (this.t) — Game.damage가 한 번 쓴 필살기를 한 번만 치게 한다 */
  specialAt = -99;

  constructor(
    c: Ctx,
    person: Person,
    at: THREE.Vector3,
    name: string,
    private readonly ctl: Visit,
  ) {
    super(c, person, at, at, '', '', name, VISIT_NEED * BODY_DMG);
    this.mover = null;
  }

  get targetable(): boolean {
    return !this.dead && !this.gone;
  }

  /** 결재판에 찬 칸 (0~10) */
  get filled(): number {
    return Math.max(0, Math.min(VISIT_NEED, Math.round((this.maxHp - this.hp) / BODY_DMG)));
  }

  protected think(): void {}

  update(dt: number, _c: Ctx): void {
    this.t += dt;
    this.ctl.drive(this, dt);
    this.person.update(dt, this.pose);
    this.ctl.afterPose(this);
    this.center.copy(this.person.chest);
    this.ctl.boardAt(this.weakPoint);
  }

  /** 도장이 맞았다: 결재판 자리에 반짝 (칸은 Visit.update가 hp로 다시 그린다) */
  stamped(_weak: boolean, c: Ctx): void {
    this.ctl.boardAt(_v);
    c.fx.confetti(_v, 5, 2.2, 0xf5c542, 1, 0.45);
    this.ctl.onStamp();
  }

  /** 결재판이 다 찼다 (Game.damage) */
  die(): void {
    this.ctl.onWin(this);
  }

  /** 몸 전체로 넉넉하게 맞는다 (결재판을 들지 않으니 약점은 없다) */
  hitTest(_p0: THREE.Vector3, p: THREE.Vector3): 0 | 1 | 2 {
    if (!this.targetable) return 0;
    const s = this.person.look.scale;
    const o = this.obj.position;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const yaw = this.obj.rotation.y;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const lx = (dx * cy - dz * sy) / s;
    const lz = (dx * sy + dz * cy) / s;
    const ly = (p.y - o.y) / s;
    return Math.abs(lx) < 0.66 && ly > 0 && ly < 2.3 && Math.abs(lz) < 0.52 ? 1 : 0;
  }

  dispose(): void {
    super.dispose();
    this.ctl.onGone(this);
  }
}

// ---------- Game이 빌려주는 것 (main.ts visitHost) ----------

export interface VisitHost {
  readonly touch: boolean;
  /** 상대(PersonBoss)를 세우고 공격이 맞을 때 쓰는 Game (eye·feet·hurt·models) */
  readonly ctx: Ctx;
  readonly scene: THREE.Scene;
  readonly fx: Fx;
  readonly mode: 'staff' | 'student';
  /** 판이 돌아가는 중 (일시정지·결과 화면이 아님) */
  readonly playing: boolean;
  /** 잠깐 멈춤·Boo에게 들려 나는 중 (보상을 못 쓴다) */
  readonly frozen: boolean;
  readonly pos: THREE.Vector3;
  /** 눈높이 (점프 포함) */
  readonly eyeY: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly area: Rect;
  /** 서지 말아야 할 곳 (장애물·상자·자판기) */
  solids(): readonly Rect[];
  areaNo(): number;
  /** 고른 교직원 */
  heroId(): HeroId;
  /** 이번 판 돕기 이벤트 구역 (sidejob.ts — 같은 구역은 피한다) */
  sideArea(): number;
  /** 지금 교직원 민원 차례 중 */
  waveOk(): boolean;
  /** 지금 바로 시작해도 되는지 (예산팀 직원·조력자·구조 장면·돕기 이벤트·멈춤·카드가 없을 때) */
  free(): boolean;
  enemies(): readonly Enemy[];
  /** 적 목록에 넣는다 (상대) */
  addEnemy(e: Enemy): void;
  isBoss(e: Enemy): boolean;
  /** 잡몹은 처리, 사람 보스는 도장 몸통 stamps발만큼 결재 진행 */
  itemHit(e: Enemy, stamps: number): void;
  minions(): number;
  /** 이벤트 중 민원 하나 더 (메일·전화기) */
  spawnMob(): void;
  banner(title: string, sub?: string): void;
  note(text: string, time?: number): void;
  sound(name: SfxName, at?: THREE.Vector3, vol?: number): void;
}

// ---------- 날아가는 것 ----------

interface Fist {
  obj: THREE.Group;
  on: boolean;
  t: number;
  hit: boolean;
  back: boolean;
  dir: THREE.Vector3;
  speed: number;
  turn: THREE.Vector3;
}

interface Cursor {
  obj: THREE.Sprite;
  vel: THREE.Vector3;
  on: boolean;
  life: number;
}

interface Wave {
  obj: THREE.Group;
  papers: THREE.Mesh[];
  ys: number[];
  on: boolean;
  dist: number;
  hit: boolean;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
}

interface Roller {
  obj: THREE.Group;
  spin: THREE.Group;
  kind: 'box' | 'case';
  on: boolean;
  dist: number;
  hit: boolean;
  dir: THREE.Vector3;
}

interface Book {
  obj: THREE.Group;
  shadow: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 0 = 쉼, 1 = 예고(그림자만), 2 = 날아감, 3 = 바닥 */
  mode: 0 | 1 | 2 | 3;
  t: number;
}

/** 던진 보상 (장갑·그래프) */
interface Shot {
  kind: 'glove' | 'graph';
  obj: THREE.Group;
  vel: THREE.Vector3;
  on: boolean;
  dist: number;
  t: number;
  back: boolean;
  hits: Set<Enemy>;
  /** 던지기 장점 배율 (위력·거리, 던질 때 정한다) */
  k: number;
}

interface Cheerer {
  person: Person;
  obj: THREE.Group;
  side: number;
  cd: number;
  state: 'off' | 'in' | 'on' | 'out';
  t: number;
  reach: number;
  exit: THREE.Vector3;
}

interface Pom {
  obj: THREE.Mesh;
  on: boolean;
  target: Enemy | null;
  t: number;
}

// ---------- 이벤트 ----------

export class Visit {
  state: State = 'idle';
  /** 공격 차례: 움직임 → 예고 → 공격 */
  phase: Phase = 'move';
  /** 이번 판에 나올 구역 (areaOf, 판마다 새로 정한다) */
  eventArea = 1;
  /** 이번 판 이벤트가 나왔다 (한 판에 한 번) */
  done = false;
  /** 시험용: 결과 ('' | 'win' | 'fail') */
  result = '';
  /** 지금(마지막) 상대의 교직원 id */
  hero: HeroId = 'kimgukje';
  /** 지금 상대 (없으면 null) */
  vp: VisitPerson | null = null;
  /** 도착한 뒤 지난 시간 (제한 20초) · 상태 시간 */
  t = 0;
  /** 들고 있는 보상과 남은 횟수 */
  item: RewardId | null = null;
  itemN = 0;
  /** 보상 효과 남은 시간 */
  clickT = 0;
  cheerT = 0;
  plaqueT = 0;
  quietT = 0;
  /** 시험용: 공격 수·맞힌 수 (이번 상대), 마지막 보상 던지기 결과, 응원단이 처리한 잡몹 수 */
  readonly stats = { attacks: 0, hits: 0 };
  lastShot = { kind: '', minions: 0, bosses: 0 };
  cheerKills = 0;
  /** 시험용으로도 읽는다: 보상 상자 */
  readonly box = { on: false, landed: false, pos: new THREE.Vector3(), area: -1, reward: 'glove' as RewardId };
  /** 실사 통과 현판 자리 */
  readonly plaquePos = new THREE.Vector3();

  private readonly ambM: Person;
  private readonly ambF: Person;
  private readonly persons: Record<Exclude<HeroId, 'kimgukje'>, Person>;
  private readonly boards = new Map<HeroId, Board>();
  private readonly flames = new Map<Person, THREE.Group>();
  private readonly sashMat = lam(0x1f8a8a);
  private readonly stripeMat = lam(0xe0b84a);
  private readonly fist: Fist;
  private readonly cursors: Cursor[] = [];
  private readonly preview: THREE.Sprite[] = [];
  private readonly wave: Wave;
  private readonly rollers: Roller[] = [];
  private readonly marks: THREE.Mesh[] = [];
  private readonly books: Book[] = [];
  private readonly gift = buildGift();
  private readonly giftLabel: THREE.Sprite;
  private readonly giftMats = new Map<RewardId, THREE.SpriteMaterial>();
  private readonly giftFrom = new THREE.Vector3();
  private giftT = 0;
  private readonly shots: Shot[] = [];
  private readonly cheer: Cheerer[] = [];
  private readonly poms: Pom[] = [];
  private readonly plaque = new THREE.Group();
  private readonly plaqueRing: THREE.Mesh;
  private readonly plaqueRingMat: THREE.MeshBasicMaterial;
  private readonly sign = new THREE.Group();
  private readonly textures: THREE.Texture[] = [];
  private readonly spot = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private won = false;
  private waitT = -1;
  private atkT = 0;
  private aT = 0;
  private side = 1;
  private sideT = 0;
  private stuck = 0;
  private trickleT = 0;
  private saidAtk = false;
  private cursorFired = 0;
  private readonly cursorDir = new THREE.Vector3();
  private readonly cursorFrom = new THREE.Vector3();
  private volleyHits = 0;
  private cursorSpread = 0.1;
  private cursorPend = 0;
  private cursorPendT = 0;
  private readonly cursorAt = new THREE.Vector3();
  private attackHit = false;
  private guardT = 0;
  private useCd = 0;
  private sashPick = 0;

  constructor(private readonly h: VisitHost) {
    const mk = (look: Look, name: string, color: string) => {
      const p = new Person('meeting', name, color, look);
      // 손 결재판은 들지 않는다 (결재판은 머리 위)
      p.clip.visible = false;
      p.tag.group.position.y = 2.32;
      return p;
    };
    const d = DEFS;
    this.ambM = mk(ambassadorLook(false), d.kimgukje.who, d.kimgukje.color);
    this.ambF = mk(ambassadorLook(true), d.kimgukje.who, d.kimgukje.color);
    this.persons = {
      ohakjongji: mk(LOOKS.ohakjongji, d.ohakjongji.who, d.ohakjongji.color),
      leejinchwi: mk(LOOKS.leejinchwi, d.leejinchwi.who, d.leejinchwi.color),
      choijanghak: mk(LOOKS.choijanghak, d.choijanghak.who, d.choijanghak.color),
      parkhaksa: mk(LOOKS.parkhaksa, d.parkhaksa.who, d.parkhaksa.color),
      kimsikdang: mk(LOOKS.kimsikdang, d.kimsikdang.who, d.kimsikdang.color),
    };
    // 머리 위 결재판 (교직원마다 제목)
    for (const id of VISIT_HEROES) {
      const b = new Board(DEFS[id].board);
      this.boards.set(id, b);
      this.textures.push(b.texture);
    }
    for (const p of [this.ambM, this.ambF]) {
      p.tag.setExtra(new THREE.Sprite((this.boards.get('kimgukje') as Board).mat), 1.5);
      this.dressAmbassador(p);
    }
    for (const id of Object.keys(this.persons) as Exclude<HeroId, 'kimgukje'>[]) {
      this.persons[id].tag.setExtra(new THREE.Sprite((this.boards.get(id) as Board).mat), 1.5);
    }
    this.dressProps();
    // 날아가는 것들
    this.fist = { obj: buildFist(), on: false, t: 0, hit: false, back: false, dir: new THREE.Vector3(), speed: 0, turn: new THREE.Vector3() };
    h.scene.add(this.fist.obj);
    const cTex = cursorTex();
    this.textures.push(cTex);
    const cMat = new THREE.SpriteMaterial({ map: cTex, depthWrite: false });
    for (let i = 0; i < CURSOR_N * 2; i++) {
      const s = new THREE.Sprite(cMat);
      s.scale.setScalar(0.5);
      s.visible = false;
      h.scene.add(s);
      this.cursors.push({ obj: s, vel: new THREE.Vector3(), on: false, life: 0 });
    }
    for (let i = 0; i < CURSOR_N; i++) {
      const s = new THREE.Sprite(cMat);
      s.scale.setScalar(0.34);
      s.visible = false;
      h.scene.add(s);
      this.preview.push(s);
    }
    const rTex = resumeTex();
    this.textures.push(rTex);
    const paperMat = new THREE.MeshLambertMaterial({ map: rTex, side: THREE.DoubleSide });
    const paperGeo = new THREE.PlaneGeometry(0.42, 0.56);
    const wg = new THREE.Group();
    const papers: THREE.Mesh[] = [];
    const ys: number[] = [];
    for (let i = 0; i < RESUME_PAPERS; i++) {
      const m = new THREE.Mesh(paperGeo, paperMat);
      m.castShadow = true;
      wg.add(m);
      papers.push(m);
      ys.push(0.35 + ((i * 7) % RESUME_PAPERS) / RESUME_PAPERS * 1.75);
    }
    wg.visible = false;
    h.scene.add(wg);
    this.wave = { obj: wg, papers, ys, on: false, dist: 0, hit: false, origin: new THREE.Vector3(), dir: new THREE.Vector3() };
    const mb = buildMoveBox();
    const mc = buildCase();
    for (const [r, kind] of [
      [mb, 'box'],
      [mc, 'case'],
    ] as [{ obj: THREE.Group; spin: THREE.Group }, 'box' | 'case'][]) {
      h.scene.add(r.obj);
      this.rollers.push({ obj: r.obj, spin: r.spin, kind, on: false, dist: 0, hit: false, dir: new THREE.Vector3() });
    }
    const mTex = markTex();
    this.textures.push(mTex);
    const mMat = new THREE.MeshBasicMaterial({ map: mTex, transparent: true, depthWrite: false });
    const mGeo = new THREE.PlaneGeometry(MARK_R * 2, MARK_R * 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(mGeo, mMat);
      m.visible = false;
      m.renderOrder = 2;
      h.scene.add(m);
      this.marks.push(m);
    }
    const models = h.ctx.models;
    for (let i = 0; i < 3; i++) {
      const obj = buildBook(BOOK_COLORS[i]);
      obj.visible = false;
      const shadow = new THREE.Mesh(models.warnGeo, models.warnMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.visible = false;
      h.scene.add(obj, shadow);
      this.books.push({ obj, shadow, from: new THREE.Vector3(), to: new THREE.Vector3(), mode: 0, t: 0 });
    }
    // 보상 상자와 그 위 이름
    for (const id of Object.keys(REWARD) as RewardId[]) {
      const tex = labelTex(REWARD[id].name, '#ffe066');
      this.textures.push(tex);
      this.giftMats.set(id, new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    }
    this.giftLabel = new THREE.Sprite(this.giftMats.get('glove'));
    this.giftLabel.position.y = 1.25;
    this.giftLabel.renderOrder = 9;
    this.gift.add(this.giftLabel);
    this.gift.visible = false;
    h.scene.add(this.gift);
    // 응원단 동아리원 둘 (양손에 응원 술)
    CHEER_LOOKS.forEach((look, i) => {
      const p = new Person('meeting', '응원단', '#7CFC9A', look);
      p.clip.visible = false;
      for (const arm of [p.armL, p.armR]) {
        const pom = buildPom(i ? 0x9fd3ff : 0xffd84a);
        pom.position.set(0, -0.82, 0.04);
        arm.add(pom);
      }
      const obj = new THREE.Group();
      obj.add(p.root);
      obj.visible = false;
      h.scene.add(obj);
      this.cheer.push({ person: p, obj, side: i ? 1 : -1, cd: 0, state: 'off', t: 0, reach: 0, exit: new THREE.Vector3() });
    });
    for (let i = 0; i < 6; i++) {
      const m = buildPom();
      m.visible = false;
      h.scene.add(m);
      this.poms.push({ obj: m, on: false, target: null, t: 0 });
    }
    // 실사 통과 현판 + 안전지대 고리
    box(this.plaque, 0.6, 0.12, 0.42, 0, 0.06, 0, lam(0x6b4a2b));
    box(this.plaque, 0.12, 1.2, 0.12, 0, 0.66, 0, lam(0x8a6038));
    const pTex = plateTex(['실사 통과', '대학평가'], '#ffe7a3', '#0f2c4f', '#d9b44a');
    this.textures.push(pTex);
    const gold = lam(0xd9b44a);
    const plate = new THREE.Mesh(UNIT, [gold, gold, gold, gold, new THREE.MeshLambertMaterial({ map: pTex }), new THREE.MeshLambertMaterial({ map: pTex })]);
    plate.scale.set(1.1, 0.62, 0.07);
    plate.position.y = 1.5;
    plate.castShadow = true;
    this.plaque.add(plate);
    this.plaqueRingMat = new THREE.MeshBasicMaterial({ color: 0x7cfc9a, transparent: true, opacity: 0.75, depthWrite: false });
    this.plaqueRing = new THREE.Mesh(new THREE.RingGeometry(PLAQUE_R - 0.16, PLAQUE_R, 64).rotateX(-Math.PI / 2), this.plaqueRingMat);
    this.plaqueRing.position.y = 0.06;
    this.plaque.add(this.plaqueRing);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(PLAQUE_R - 0.16, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7cfc9a, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    disc.position.y = 0.05;
    this.plaque.add(disc);
    this.plaque.visible = false;
    h.scene.add(this.plaque);
    // 쉿! 정숙 표지판
    box(this.sign, 0.08, 1.3, 0.08, 0, 0.65, 0, lam(0x9aa0aa));
    const sTex = plateTex(['쉿!', '정숙'], '#ffffff', '#2f6fd1', '#ffffff');
    this.textures.push(sTex);
    const white = lam(0xffffff);
    const sp = new THREE.Mesh(UNIT, [white, white, white, white, new THREE.MeshLambertMaterial({ map: sTex }), new THREE.MeshLambertMaterial({ map: sTex })]);
    sp.scale.set(0.95, 0.55, 0.05);
    sp.position.y = 1.45;
    sp.castShadow = true;
    this.sign.add(sp);
    this.sign.visible = false;
    h.scene.add(this.sign);
    // 대사 그림
    const lines: string[] = [];
    for (const id of VISIT_HEROES) {
      const df = DEFS[id];
      lines.push(df.enter, df.attack, df.win, df.fail);
    }
    prepareSpeech(lines);
    this.plan();
  }

  /** 대사님: 사선 예복 띠(색은 판마다) + 가슴 훈장 + 로켓 펀치 예고 불꽃 (오른손) */
  private dressAmbassador(p: Person): void {
    const L = Math.hypot(0.58, 0.62);
    const ang = -Math.atan2(0.58, 0.62);
    for (const z of [0.222, -0.222]) {
      const sash = box(p.body, 0.13, L, 0.02, -0.01, 1.25, z, this.sashMat);
      sash.rotation.z = ang;
      const stripe = box(p.body, 0.035, L, 0.022, -0.01, 1.25, z + Math.sign(z) * 0.004, this.stripeMat);
      stripe.rotation.z = ang;
    }
    // 오른 어깨 위 + 왼 허리 매듭
    box(p.body, 0.14, 0.04, 0.44, 0.28, 1.62, 0, this.sashMat);
    const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10).rotateX(Math.PI / 2), this.stripeMat);
    knot.position.set(-0.3, 0.95, 0.238);
    p.body.add(knot);
    // 훈장 하나 (왼가슴): 짧은 띠 + 금색 원
    box(p.body, 0.07, 0.06, 0.02, -0.17, 1.47, 0.226, lam(0x2f4f8a));
    const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12).rotateX(Math.PI / 2), lam(0xd9b44a));
    medal.position.set(-0.17, 1.38, 0.232);
    p.body.add(medal);
    // 예고 불꽃: 손목에서 팔 쪽으로 (팔 아래 = 손)
    const flame = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), basic(0xff8a2a));
    cone.position.y = -0.46;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), basic(0xffe066));
    inner.position.y = -0.5;
    const gTex = glowTex();
    this.textures.push(gTex);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = -0.74;
    glow.scale.setScalar(0.7);
    flame.add(cone, inner, glow);
    flame.visible = false;
    p.armR.add(flame);
    this.flames.set(p, flame);
  }

  /** 손에 든 것: 마우스 (매크로 학생), 자기소개서 더미 (장기 미취업 학생), 책 더미 (연체 대학원생) */
  private dressProps(): void {
    const ps = this.persons;
    const mouse = new THREE.Group();
    box(mouse, 0.11, 0.07, 0.17, 0, 0, 0, lam(0xeeeeee));
    box(mouse, 0.02, 0.03, 0.04, 0, 0.045, 0.04, lam(0x2b2f3a));
    box(mouse, 0.015, 0.015, 0.22, 0, 0.0, -0.18, lam(0x2b2f3a));
    mouse.position.set(0, -0.84, 0.1);
    ps.ohakjongji.armL.add(mouse);
    const pile = new THREE.Group();
    box(pile, 0.32, 0.42, 0.16, 0, 0, 0, lam(0xf4f0e0));
    box(pile, 0.3, 0.4, 0.02, 0.01, 0.01, 0.09, lam(0xffffff));
    box(pile, 0.2, 0.03, 0.01, 0, 0.12, 0.101, lam(0x8b92a0));
    box(pile, 0.22, 0.03, 0.01, 0, 0.04, 0.101, lam(0x8b92a0));
    pile.position.set(0.05, -0.86, 0.16);
    pile.name = 'pile';
    ps.leejinchwi.armL.add(pile);
    const stack = new THREE.Group();
    BOOK_COLORS.forEach((c, i) => {
      const b = buildBook(c);
      b.position.y = i * 0.1;
      b.rotation.y = (i - 1) * 0.15;
      stack.add(b);
    });
    stack.position.set(0, -0.92, 0.16);
    stack.rotation.x = Math.PI / 2;
    stack.name = 'pile';
    ps.kimsikdang.armL.add(stack);
  }

  /** 이번 판 구역을 정한다 (돕기 이벤트 구역은 피한다) */
  private plan(): void {
    const side = this.h.sideArea();
    const opts = VISIT_AREAS.filter((a) => a !== side);
    this.eventArea = opts[Math.floor(Math.random() * opts.length)];
  }

  private get def(): VisitDef {
    return DEFS[this.hero];
  }

  /** 지금 상대의 블록 사람 */
  private get person(): Person | null {
    return this.vp ? this.vp.person : null;
  }

  // ---------- Game이 보는 것 ----------

  /** 나올 차례이거나 진행 중이면 민원 차례를 붙잡는다 (Game.stepWave) */
  holds(): boolean {
    const h = this.h;
    if (h.mode !== 'staff') return false;
    if (this.state === 'enter' || this.state === 'fight' || this.state === 'talk') return true;
    return this.state === 'idle' && !this.done && h.areaNo() === this.eventArea && h.waveOk();
  }

  /** HUD 민원 줄 앞에 붙이는 글, 없으면 null */
  status(): string | null {
    const vp = this.vp;
    if (!vp || (this.state !== 'enter' && this.state !== 'fight')) return null;
    const left = this.state === 'enter' ? VISIT_T : Math.max(0, Math.ceil(VISIT_T - this.t));
    return `돌발 방문 · ${this.def.board} ${vp.filled}/${VISIT_NEED} · ${left}초`;
  }

  /** 보상 효과 줄 (HUD perks) */
  perks(): string[] {
    const out: string[] = [];
    if (this.clickT > 0) out.push(`매크로 클리커 · 연사 ${CLICK_MUL}배 ${Math.ceil(this.clickT)}초`);
    if (this.cheerT > 0) out.push(`응원단 · ${Math.ceil(this.cheerT)}초`);
    if (this.plaqueT > 0) out.push(`실사 통과 현판 · 안전지대 ${Math.ceil(this.plaqueT)}초`);
    if (this.quietT > 0) out.push(`쉿! 정숙 표지판 · 잡몹 느리게 ${Math.ceil(this.quietT)}초`);
    return out;
  }

  /** 매크로 클리커: 도장 연사 배율 (Game.fire가 쿨타임을 나눈다) */
  get fireRate(): number {
    return this.clickT > 0 ? CLICK_MUL : 1;
  }

  /** 쉿! 정숙 표지판: 잡몹 이동·발사 빠르기 배율 (Game.step·updateSheets) */
  get mobRate(): number {
    return this.quietT > 0 ? QUIET_MUL : 1;
  }

  /** 실사 통과 현판: 이 자리가 안전지대면 true (Game.hurt가 피해를 막는다) */
  guard(pos: THREE.Vector3): boolean {
    if (this.plaqueT <= 0) return false;
    if (Math.hypot(pos.x - this.plaquePos.x, pos.z - this.plaquePos.z) > PLAQUE_R) return false;
    if (this.guardT <= 0) {
      this.guardT = 0.5;
      this.h.fx.ring(pos.x, 0.1, pos.z, 0.4, 1.8, 0.35, 0x7cfc9a);
    }
    return true;
  }

  /** 결재판 자리 (월드) */
  boardAt(out: THREE.Vector3): THREE.Vector3 {
    const p = this.person;
    if (!p) return out.set(0, 0, 0);
    return out.set(0, 2.5, 0).applyMatrix4(p.root.matrixWorld);
  }

  /** 시험용 (?debug): 구역·차례와 상관없이 지금 구역에서 바로 (이번 판 한 번은 그대로 남는다). hero를 비우면 고른 교직원 */
  call(hero?: HeroId): boolean {
    const h = this.h;
    const id = hero ?? h.heroId();
    if (this.state !== 'idle' || h.mode !== 'staff' || !h.playing || !(id in DEFS)) return false;
    return this.begin(id);
  }

  // ---------- 매 단계 (Game.step) ----------

  update(dt: number): void {
    const h = this.h;
    if (this.useCd > 0) this.useCd -= dt;
    if (this.guardT > 0) this.guardT -= dt;
    this.stepRewards(dt);
    this.stepGift(dt);
    if (this.state === 'idle') {
      if (h.mode !== 'staff' || !h.playing || this.done || h.areaNo() !== this.eventArea || !h.waveOk()) {
        this.waitT = -1;
        return;
      }
      if (this.waitT < 0) this.waitT = 3 + Math.random() * 2;
      this.waitT -= dt;
      if (this.waitT <= 0 && h.free()) {
        this.done = true;
        this.begin(h.heroId());
      }
      return;
    }
    const vp = this.vp;
    if (!vp) {
      this.state = 'idle';
      return;
    }
    this.t += dt;
    (this.boards.get(this.hero) as Board).draw(vp.filled, this.won);
    switch (this.state) {
      case 'enter':
        // 막혀서 못 오면 그 자리에서 시작
        if (this.t > 3) this.arrive();
        break;
      case 'fight':
        this.trickle(dt);
        if (this.t >= VISIT_T) this.fail();
        break;
      case 'talk':
        if (this.t >= (this.won ? 1.8 : 2.2)) {
          if (this.won) this.dropGift();
          this.leave();
        }
        break;
      default:
        break;
    }
  }

  /** 이벤트 중에도 민원은 온다: 잡몹이 적으면 가끔 하나씩 */
  private trickle(dt: number): void {
    this.trickleT -= dt;
    if (this.trickleT > 0) return;
    this.trickleT = TRICKLE_T;
    if (this.h.minions() < TRICKLE_MAX) this.h.spawnMob();
  }

  // ---------- 시작·끝 ----------

  private begin(hero: HeroId): boolean {
    const h = this.h;
    this.hero = hero;
    const def = this.def;
    let person: Person;
    if (hero === 'kimgukje') {
      person = Math.random() < 0.5 ? this.ambF : this.ambM;
      // 띠 색: 지난번과 다른 조합
      this.sashPick = (this.sashPick + 1 + Math.floor(Math.random() * (SASH_COLORS.length - 1))) % SASH_COLORS.length;
      const [a, b] = SASH_COLORS[this.sashPick];
      this.sashMat.color.setHex(a);
      this.stripeMat.color.setHex(b);
    } else person = this.persons[hero];
    this.restorePerson(person);
    (this.boards.get(hero) as Board).draw(0, false);
    // 자리: 플레이어 앞 8m (구역 끝·장애물을 피해 옆으로)
    const solids = h.solids();
    const p = h.pos;
    let bestErr = Infinity;
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const ang = h.yaw + da;
      const [x, z] = placeIn(h.area, solids, p.x - Math.sin(ang) * SPOT_D, p.z - Math.cos(ang) * SPOT_D, 2.5);
      const err = Math.abs(Math.hypot(x - p.x, z - p.z) - SPOT_D);
      if (err < bestErr - 0.3) {
        bestErr = err;
        this.spot.set(x, 0, z);
      }
    }
    // 더 먼 쪽에서 달려 들어온다
    const ox = this.spot.x - p.x;
    const oz = this.spot.z - p.z;
    const ol = Math.hypot(ox, oz) || 1;
    const sideK = Math.random() < 0.5 ? -0.45 : 0.45;
    const [fx, fz] = placeIn(h.area, solids, this.spot.x + ((ox - oz * sideK) / ol) * ENTER_D, this.spot.z + ((oz + ox * sideK) / ol) * ENTER_D, 1);
    const vp = new VisitPerson(h.ctx, person, _v.set(fx, 0, fz), def.who, this);
    vp.obj.rotation.y = Math.atan2(this.spot.x - fx, this.spot.z - fz);
    h.addEnemy(vp);
    this.vp = vp;
    this.state = 'enter';
    this.phase = 'move';
    this.t = 0;
    this.aT = 0;
    this.atkT = FIRST_ATK;
    this.result = '';
    this.won = false;
    this.saidAtk = false;
    this.trickleT = 2;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.sideT = 1.5 + Math.random() * 1.5;
    this.stuck = 0;
    this.stats.attacks = 0;
    this.stats.hits = 0;
    this.clearShots();
    person.say(def.enter, 2.6);
    h.banner(`돌발 방문! ${def.who}`, '도장으로 결재판을 채우세요 (20초)');
    h.sound('open', undefined, 0.9);
    h.sound('dash', vp.obj.position, 0.8);
    return true;
  }

  /** 자리에 닿았다: 20초 시작 */
  private arrive(): void {
    this.state = 'fight';
    this.phase = 'move';
    this.t = 0;
    this.atkT = FIRST_ATK;
  }

  /** 결재판이 다 찼다 (VisitPerson.die ← Game.damage) */
  onWin(vp: VisitPerson): void {
    if (vp !== this.vp || (this.state !== 'enter' && this.state !== 'fight')) return;
    const h = this.h;
    this.result = 'win';
    this.won = true;
    // 배지: 돌발 방문 해결 · 손님맞이 완료 (고른 교직원 id, src/badges.ts)
    noteVisitSuccess(h.heroId());
    this.clearShots();
    (this.boards.get(this.hero) as Board).draw(VISIT_NEED, true);
    vp.person.say(this.def.win, 3);
    this.boardAt(_v);
    h.fx.text(_w.copy(_v).setY(_v.y + 0.7), '결재 완료!', '#7CFC9A', 0.8);
    h.fx.confetti(_v, 24, 4, 0xf5c542, 2, 0.7);
    h.sound('clear', undefined, 0.8);
    this.go('talk');
  }

  /** 20초가 지났다: 실패 대사 뒤 떠난다 (불이익·보상 없음) */
  private fail(): void {
    const vp = this.vp;
    if (!vp) return;
    this.result = 'fail';
    this.won = false;
    vp.dead = true;
    this.clearShots();
    vp.person.say(this.def.fail, 2.8);
    this.go('talk');
  }

  private leave(): void {
    const h = this.h;
    const vp = this.vp;
    if (!vp) return;
    vp.dead = true;
    const o = vp.obj.position;
    const ox = o.x - h.pos.x;
    const oz = o.z - h.pos.z;
    const ol = Math.hypot(ox, oz) || 1;
    const [ex, ez] = placeIn(h.area, h.solids(), o.x + (ox / ol) * 16, o.z + (oz / ol) * 16, 0.6);
    this.exit.set(ex, 0, ez);
    this.go('out');
  }

  private go(s: State): void {
    this.state = s;
    this.t = 0;
  }

  /** 상대가 장면에서 빠졌다 (걸어 나감·판 정리 — VisitPerson.dispose) */
  onGone(vp: VisitPerson): void {
    if (vp !== this.vp) return;
    this.clearShots();
    this.restorePerson(vp.person);
    vp.person.tag.hide();
    this.vp = null;
    this.state = 'idle';
  }

  private restorePerson(p: Person): void {
    p.armR.visible = true;
    p.body.rotation.x = 0;
    const f = this.flames.get(p);
    if (f) f.visible = false;
  }

  /** 도장 한 발 (결재판 칸은 update가 다시 그린다) */
  onStamp(): void {}

  // ---------- 상대 움직임·공격 (VisitPerson.update — 적 시간 dt) ----------

  drive(vp: VisitPerson, dt: number): void {
    const pose = vp.pose;
    pose.walking = false;
    pose.raise = 0;
    pose.reach = 0;
    pose.wave = false;
    if (vp !== this.vp) return;
    const c = this.h.ctx;
    const o = vp.obj.position;
    switch (this.state) {
      case 'enter': {
        const moved = this.moveTo(o, this.spot.x, this.spot.z, ENTER_V, dt, 0.3);
        pose.walking = moved > 0;
        if (moved > 0) this.face(vp, this.spot.x, this.spot.z, dt, 10);
        else this.face(vp, c.eye.x, c.eye.z, dt, 10);
        if (Math.hypot(this.spot.x - o.x, this.spot.z - o.z) < 0.35) this.arrive();
        break;
      }
      case 'fight':
        this.fightStep(vp, dt);
        break;
      case 'talk':
        this.face(vp, c.eye.x, c.eye.z, dt, 6);
        pose.wave = this.won && this.t > 0.6;
        break;
      case 'out': {
        if (this.t < 0.4) {
          pose.wave = true;
          break;
        }
        const moved = this.moveTo(o, this.exit.x, this.exit.z, OUT_V, dt, 0.3, false);
        pose.walking = true;
        this.face(vp, this.exit.x, this.exit.z, dt, 8);
        if (moved <= 0 || this.t > 6) {
          vp.obj.visible = false;
          vp.gone = true;
        }
        break;
      }
      default:
        break;
    }
    this.stepShots(vp, dt);
  }

  private fightStep(vp: VisitPerson, dt: number): void {
    const c = this.h.ctx;
    const kind = this.def.kind;
    // 공격 사이는 예고 시작부터 잰다 (대사님 5초마다)
    this.atkT -= dt;
    if (this.phase === 'move') {
      this.roam(vp, dt, 1);
      this.face(vp, c.eye.x, c.eye.z, dt, 8);
      if (this.atkT <= 0) this.wind(vp);
      return;
    }
    this.aT += dt;
    this.face(vp, c.eye.x, c.eye.z, dt, 10);
    if (this.phase === 'wind') {
      // 대사님은 조준하는 동안 느리게 옆걸음
      if (kind === 'punch') this.roam(vp, dt, 0.35);
      this.windStep(vp);
      if (this.aT >= WARN_T) this.fire(vp);
      return;
    }
    this.actStep();
  }

  /** 움직임: 대사님은 플레이어 둘레를 빠르게 옆걸음, 나머지는 거리를 두고 좌우로 옆걸음 */
  private roam(vp: VisitPerson, dt: number, mul: number): void {
    const h = this.h;
    const o = vp.obj.position;
    const p = h.pos;
    this.sideT -= dt;
    if (this.sideT <= 0) {
      this.side = -this.side;
      this.sideT = this.def.kind === 'punch' ? 2 + Math.random() * 2 : 1.6 + Math.random() * 1.4;
    }
    let moved: number;
    let want: number;
    if (this.def.kind === 'punch') {
      const v = ORBIT_V * mul;
      const ang = Math.atan2(o.x - p.x, o.z - p.z) + this.side * (v / ORBIT_R) * dt;
      const tx = p.x + Math.sin(ang) * ORBIT_R;
      const tz = p.z + Math.cos(ang) * ORBIT_R;
      want = v * dt;
      moved = this.moveTo(o, tx, tz, v * 1.4, dt, 0.05);
    } else {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d;
      const uz = dz / d;
      const keep = this.def.keep;
      const tx = p.x + ux * keep - uz * this.side * 3;
      const tz = p.z + uz * keep + ux * this.side * 3;
      want = STRAFE_V * mul * dt * 0.5;
      moved = this.moveTo(o, tx, tz, STRAFE_V * mul, dt, 0.8);
    }
    vp.pose.walking = moved > 0.002;
    // 벽·장애물에 막히면 반대로
    if (want > 0 && moved < want * 0.3 && moved >= 0) {
      this.stuck += dt;
      if (this.stuck > 0.35) {
        this.side = -this.side;
        this.stuck = 0;
      }
    } else this.stuck = 0;
  }

  /** (x, z)로 걷는다 (구역 안, 장애물 밖). 움직인 거리 (도착했으면 0) */
  private moveTo(o: THREE.Vector3, x: number, z: number, speed: number, dt: number, near: number, clamp = true): number {
    const dx = x - o.x;
    const dz = z - o.z;
    const d = Math.hypot(dx, dz);
    if (d <= near) return 0;
    const step = Math.min(d, speed * dt);
    const px = o.x;
    const pz = o.z;
    o.x += (dx / d) * step;
    o.z += (dz / d) * step;
    if (clamp) {
      const a = this.h.area;
      o.x = Math.max(a.minX + 1, Math.min(a.maxX - 1, o.x));
      o.z = Math.max(a.minZ + 1, Math.min(a.maxZ - 1, o.z));
      const M = 0.7;
      for (const r of this.h.solids()) {
        if (o.x <= r.minX - M || o.x >= r.maxX + M || o.z <= r.minZ - M || o.z >= r.maxZ + M) continue;
        const opts: [number, number, number][] = [
          [o.x - (r.minX - M), r.minX - M, o.z],
          [r.maxX + M - o.x, r.maxX + M, o.z],
          [o.z - (r.minZ - M), o.x, r.minZ - M],
          [r.maxZ + M - o.z, o.x, r.maxZ + M],
        ];
        opts.sort((p, q) => p[0] - q[0]);
        o.x = opts[0][1];
        o.z = opts[0][2];
      }
    }
    return Math.hypot(o.x - px, o.z - pz);
  }

  private face(vp: VisitPerson, x: number, z: number, dt: number, rate: number): void {
    const o = vp.obj;
    const want = Math.atan2(x - o.position.x, z - o.position.z);
    o.rotation.y += wrap(want - o.rotation.y) * Math.min(1, dt * rate);
  }

  /** 예고 시작: 공격 대사 + 소리, 공격마다 예고 표시 */
  private wind(vp: VisitPerson): void {
    const h = this.h;
    const def = this.def;
    this.phase = 'wind';
    this.aT = 0;
    this.atkT = def.every + (def.kind === 'punch' ? 0 : Math.random() * 0.6 - 0.3);
    this.attackHit = false;
    // 공격 대사: 처음 한 번만 자막도 (그다음은 말풍선만)
    vp.person.say(def.attack, 1.4, !this.saidAtk);
    this.saidAtk = true;
    h.sound('charge', vp.obj.position, 0.8);
    const o = vp.obj.position;
    switch (def.kind) {
      case 'luggage': {
        // 상자·기타 케이스가 발 앞에 놓인다
        const fx = Math.sin(vp.obj.rotation.y);
        const fz = Math.cos(vp.obj.rotation.y);
        this.rollers.forEach((r, i) => {
          const s = i ? 0.7 : -0.7;
          r.obj.position.set(o.x + fx * 1.1 + fz * s, 0, o.z + fz * 1.1 - fx * s);
          r.obj.rotation.y = vp.obj.rotation.y;
          r.spin.rotation.x = 0;
          r.obj.visible = true;
          r.on = false;
        });
        break;
      }
      case 'inspect': {
        // 바닥 세 곳: 플레이어 자리 + 둘레 두 곳
        const p = h.pos;
        const a0 = Math.random() * Math.PI * 2;
        const pts: [number, number][] = [[p.x, p.z]];
        for (let i = 0; i < 2; i++) {
          const a = a0 + i * (Math.PI * (0.7 + Math.random() * 0.6));
          const r = MARK_MIN + Math.random() * (MARK_MAX - MARK_MIN);
          const ar = h.area;
          pts.push([Math.max(ar.minX + 1, Math.min(ar.maxX - 1, p.x + Math.cos(a) * r)), Math.max(ar.minZ + 1, Math.min(ar.maxZ - 1, p.z + Math.sin(a) * r))]);
        }
        this.marks.forEach((m, i) => {
          m.position.set(pts[i][0], 0.05 + i * 0.004, pts[i][1]);
          m.scale.setScalar(0.6);
          m.visible = true;
        });
        // 발밑 ✘는 1인칭 화면 아래라 잘 안 보인다: 글로도 알린다
        h.note('발밑에 빨간 ✘ — 곧 터져요! 비키세요', 1.0);
        break;
      }
      case 'book': {
        // 떨어질 자리 셋: 플레이어 자리 + 양옆 (그림자 예고)
        const p = h.pos;
        const dx = p.x - o.x;
        const dz = p.z - o.z;
        const d = Math.hypot(dx, dz) || 1;
        const ar = h.area;
        this.books.forEach((b, i) => {
          const s = (i - 1) * BOOK_SIDE;
          b.to.set(Math.max(ar.minX + 0.5, Math.min(ar.maxX - 0.5, p.x - (dz / d) * s)), 0.06, Math.max(ar.minZ + 0.5, Math.min(ar.maxZ - 0.5, p.z + (dx / d) * s)));
          b.shadow.position.set(b.to.x, 0.04 + i * 0.003, b.to.z);
          b.shadow.scale.setScalar(BOOK_SHADOW * 0.6);
          b.shadow.visible = true;
          b.mode = 1;
          b.t = 0;
          b.obj.visible = false;
        });
        h.note('책이 날아와요 — 발밑 그림자에서 비키세요', 1.2);
        break;
      }
      default:
        break;
    }
  }

  /** 예고 동안 (표시 깜빡임) */
  private windStep(vp: VisitPerson): void {
    const k = this.aT;
    switch (this.def.kind) {
      case 'cursor': {
        // 부채꼴로 늘어선 커서가 깜빡인다
        const o = vp.obj.position;
        const yaw = vp.obj.rotation.y;
        const on = Math.floor(k * 12) % 2 === 0;
        this.preview.forEach((s, i) => {
          const a = yaw + (i - (CURSOR_N - 1) / 2) * 0.22;
          s.position.set(o.x + Math.sin(a) * 1.3, 2.2 + Math.abs(i - 3.5) * -0.05, o.z + Math.cos(a) * 1.3);
          s.visible = on;
        });
        break;
      }
      case 'luggage':
        for (const r of this.rollers) r.spin.rotation.x = Math.sin(k * 30) * 0.08;
        break;
      case 'inspect':
        for (const m of this.marks) m.scale.setScalar(0.6 + Math.min(1, k / 0.25) * 0.4 + Math.abs(Math.sin(k * 14)) * 0.05);
        break;
      case 'book':
        for (const b of this.books) b.shadow.scale.setScalar(BOOK_SHADOW * (0.6 + Math.abs(Math.sin(k * 10)) * 0.1));
        break;
      default:
        break;
    }
  }

  /** 0.8초 예고 끝: 공격 */
  private fire(vp: VisitPerson): void {
    const h = this.h;
    const c = h.ctx;
    const o = vp.obj.position;
    this.phase = 'act';
    this.aT = 0;
    this.stats.attacks++;
    switch (this.def.kind) {
      case 'punch': {
        // 주먹이 팔에서 떨어져 플레이어 쪽으로 일직선 (돌아올 때는 맞지 않는다)
        const f = this.fist;
        // 예고 자세(afterPose가 덧댄 팔)를 반영한 손 자리
        vp.person.armR.updateWorldMatrix(true, false);
        vp.person.armR.localToWorld(f.obj.position.set(0, -0.71, 0));
        f.dir.subVectors(c.eye, f.obj.position);
        const d = f.dir.length();
        f.dir.divideScalar(Math.max(0.001, d));
        f.speed = (d + 2) / PUNCH_OUT;
        f.on = true;
        f.t = 0;
        f.hit = false;
        f.back = false;
        f.obj.visible = true;
        f.obj.quaternion.setFromUnitVectors(FWD, f.dir);
        h.sound('dash', f.obj.position, 1);
        break;
      }
      case 'cursor':
        for (const s of this.preview) s.visible = false;
        this.cursorFired = 0;
        this.volleyHits = 0;
        this.cursorPend = 0;
        this.cursorFrom.set(0, 1.45, 0.5).applyMatrix4(vp.person.root.matrixWorld);
        this.cursorDir.subVectors(c.eye, this.cursorFrom).normalize();
        // 플레이어 자리에서 커서 사이가 CURSOR_SPACE가 되게
        this.cursorSpread = Math.max(0.05, Math.min(0.16, CURSOR_SPACE / Math.max(1, Math.hypot(c.eye.x - this.cursorFrom.x, c.eye.z - this.cursorFrom.z))));
        break;
      case 'resume': {
        const w = this.wave;
        const dx = h.pos.x - o.x;
        const dz = h.pos.z - o.z;
        const d = Math.hypot(dx, dz) || 1;
        w.dir.set(dx / d, 0, dz / d);
        w.origin.set(o.x + w.dir.x * 1.2, 0, o.z + w.dir.z * 1.2);
        w.dist = 0;
        w.hit = false;
        w.on = true;
        w.obj.visible = true;
        w.obj.rotation.y = Math.atan2(w.dir.x, w.dir.z);
        this.layWave();
        h.sound('volley', o, 1);
        h.fx.confetti(_v.copy(w.origin).setY(1.3), 14, 3, 0xffffff, 1, 0.6);
        break;
      }
      case 'luggage': {
        const dx = h.pos.x - o.x;
        const dz = h.pos.z - o.z;
        const base = Math.atan2(dx, dz);
        const off = (Math.random() < 0.5 ? -1 : 1) * ROLL_SIDE;
        this.rollers.forEach((r, i) => {
          // 하나는 플레이어 쪽으로, 하나는 비껴서
          const a = base + (i ? off : 0);
          r.dir.set(Math.sin(a), 0, Math.cos(a));
          r.obj.rotation.y = a;
          r.on = true;
          r.dist = 0;
          r.hit = false;
          r.obj.visible = true;
        });
        h.sound('throw', o, 1);
        break;
      }
      case 'inspect': {
        // ✘ 세 곳이 터진다
        let hit: THREE.Mesh | null = null;
        for (const m of this.marks) {
          m.visible = false;
          const at = _v.set(m.position.x, 0.5, m.position.z);
          h.fx.blast(at, MARK_R, 0xff4d4d);
          h.fx.ring(at.x, 0.06, at.z, 0.4, MARK_R, 0.4, 0xff4d4d);
          h.fx.confetti(at, 10, 4, 0xff4d4d, 2, 0.6);
          if (!hit && Math.hypot(h.pos.x - m.position.x, h.pos.z - m.position.z) < MARK_R) hit = m;
        }
        h.sound('boom', undefined, 0.8);
        if (hit) this.hurt(VISIT_DMG, _v.set(hit.position.x, 0.5, hit.position.z), 'inspect');
        break;
      }
      case 'book': {
        vp.person.armL.updateWorldMatrix(true, false);
        vp.person.armL.localToWorld(_v.set(0, -0.95, 0.1));
        this.books.forEach((b, i) => {
          b.from.copy(_v).add(_w.set((i - 1) * 0.3, 0.2, 0));
          b.obj.position.copy(b.from);
          b.obj.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          b.obj.visible = true;
          b.mode = 2;
          b.t = 0;
        });
        h.sound('throw', o, 1);
        break;
      }
      default:
        break;
    }
  }

  /** 공격 중 (대사님은 주먹이 돌아올 때까지 멈칫) */
  private actStep(): void {
    switch (this.def.kind) {
      case 'punch':
        if (!this.fist.on) this.phase = 'move';
        break;
      case 'cursor':
        // 부채꼴로 한 발씩 (왼쪽 → 오른쪽)
        while (this.cursorFired < CURSOR_N && this.aT >= this.cursorFired * CURSOR_GAP) this.shootCursor(this.cursorFired++);
        if (this.cursorFired >= CURSOR_N && this.aT > 0.6) this.phase = 'move';
        break;
      default:
        if (this.aT >= 0.45) this.phase = 'move';
        break;
    }
  }

  private shootCursor(i: number): void {
    const s = this.cursors.find((x) => !x.on);
    if (!s) return;
    const a = (i - (CURSOR_N - 1) / 2) * this.cursorSpread;
    const d = this.cursorDir;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // 수평으로 돌린다 (위아래 기울기는 그대로)
    s.vel.set(d.x * ca + d.z * sa, d.y, -d.x * sa + d.z * ca).normalize().multiplyScalar(CURSOR_V);
    s.obj.position.copy(this.cursorFrom);
    s.obj.visible = true;
    s.on = true;
    s.life = 2.2;
    this.h.sound('tick', this.cursorFrom, 0.5);
  }

  /** 자소서 장풍: 종이를 폭에 맞춰 늘어놓는다 */
  private layWave(): void {
    const w = this.wave;
    const W = RESUME_W0 + (RESUME_W1 - RESUME_W0) * Math.min(1, w.dist / 12);
    const n = w.papers.length;
    w.obj.position.set(w.origin.x + w.dir.x * w.dist, 0, w.origin.z + w.dir.z * w.dist);
    for (let i = 0; i < n; i++) {
      const m = w.papers[i];
      m.position.set((i / (n - 1) - 0.5) * W, w.ys[i], Math.sin(i * 1.7 + w.dist) * 0.25);
      m.rotation.set(Math.sin(w.dist * 2 + i) * 0.6, i * 0.9 + w.dist * 1.5, Math.cos(w.dist * 3 + i) * 0.5);
    }
  }

  /** 상대가 던진 것들 (적 시간) */
  private stepShots(vp: VisitPerson, dt: number): void {
    const h = this.h;
    const c = h.ctx;
    // 로켓 펀치
    const f = this.fist;
    if (f.on) {
      f.t += dt;
      const fl = f.obj.getObjectByName('flame');
      if (fl) fl.scale.setScalar(0.85 + Math.random() * 0.35);
      if (f.t < PUNCH_OUT) {
        f.obj.position.addScaledVector(f.dir, f.speed * dt);
        if (!f.hit && f.obj.position.distanceTo(c.eye) < PUNCH_R) {
          f.hit = true;
          this.hurt(VISIT_DMG, f.obj.position, 'punch');
          h.fx.confetti(f.obj.position, 8, 3, 0xff8a2a, 1, 0.6);
        }
      } else {
        if (!f.back) {
          f.back = true;
          f.turn.copy(f.obj.position);
        }
        const k = Math.min(1, (f.t - PUNCH_OUT) / PUNCH_OUT);
        vp.person.armR.localToWorld(_v.set(0, -0.71, 0));
        f.obj.position.lerpVectors(f.turn, _v, k * k * (3 - 2 * k));
        _w.subVectors(f.turn, _v);
        if (_w.lengthSq() > 1e-6) f.obj.quaternion.setFromUnitVectors(FWD, _w.normalize());
        if (k >= 1) {
          f.on = false;
          f.obj.visible = false;
        }
      }
    }
    // 마우스 커서
    for (const s of this.cursors) {
      if (!s.on) continue;
      s.life -= dt;
      s.obj.position.addScaledVector(s.vel, dt);
      if (s.obj.position.distanceTo(c.eye) < CURSOR_R) {
        s.on = false;
        s.obj.visible = false;
        if (this.volleyHits < CURSOR_MAX) {
          // 한 발 1 (한 번 연사로 최대 2): 잠깐 모았다가 한 번에
          if (this.cursorPend === 0) {
            this.cursorPendT = CURSOR_SUM_T;
            this.cursorAt.copy(s.obj.position);
          }
          this.volleyHits++;
          this.cursorPend++;
        }
        continue;
      }
      if (s.life <= 0 || s.obj.position.y < 0) {
        s.on = false;
        s.obj.visible = false;
      }
    }
    if (this.cursorPend > 0) {
      this.cursorPendT -= dt;
      if (this.cursorPendT <= 0) {
        this.hurt(this.cursorPend, this.cursorAt, 'cursor');
        this.cursorPend = 0;
      }
    }
    // 자소서 장풍
    const w = this.wave;
    if (w.on) {
      w.dist += RESUME_V * dt;
      this.layWave();
      const W = RESUME_W0 + (RESUME_W1 - RESUME_W0) * Math.min(1, w.dist / 12);
      const rx = h.pos.x - w.origin.x;
      const rz = h.pos.z - w.origin.z;
      const along = rx * w.dir.x + rz * w.dir.z;
      const lat = rx * w.dir.z - rz * w.dir.x;
      if (!w.hit && Math.abs(along - w.dist) < 0.55 && Math.abs(lat) < W / 2 + 0.4) {
        w.hit = true;
        this.hurt(VISIT_DMG, _v.set(w.obj.position.x, 1.2, w.obj.position.z), 'resume');
      }
      if (w.dist > RESUME_RANGE) {
        w.on = false;
        w.obj.visible = false;
      }
    }
    // 이삿짐 상자·통기타 케이스
    const a = h.area;
    for (const r of this.rollers) {
      if (!r.on) continue;
      const step = ROLL_V * dt;
      r.dist += step;
      r.obj.position.addScaledVector(r.dir, step);
      r.spin.rotation.x += step / (r.kind === 'box' ? BOX_H * 0.58 : CASE_H / 2);
      const p = r.obj.position;
      const rx = h.pos.x - p.x;
      const rz = h.pos.z - p.z;
      const along = rx * r.dir.x + rz * r.dir.z;
      const lat = rx * r.dir.z - rz * r.dir.x;
      const hit = r.kind === 'box' ? Math.hypot(rx, rz) < BOX_H * 0.6 + 0.42 : Math.abs(along) < CASE_H / 2 + 0.42 && Math.abs(lat) < 0.6 + 0.42;
      // 점프로 넘는다 (발이 짐 높이보다 높으면 무사)
      if (!r.hit && hit && c.feet < (r.kind === 'box' ? BOX_H : CASE_H)) {
        r.hit = true;
        this.hurt(VISIT_DMG, _v.set(p.x, 0.5, p.z), 'luggage');
      }
      if (r.dist > ROLL_RANGE || p.x < a.minX - 1 || p.x > a.maxX + 1 || p.z < a.minZ - 1 || p.z > a.maxZ + 1) {
        r.on = false;
        r.obj.visible = false;
        h.fx.confetti(_v.set(p.x, 0.4, p.z), 6, 2, 0xc79a5b, 1, 0.6);
      }
    }
    // 책 던지기
    let landed = false;
    for (const b of this.books) {
      if (b.mode === 2) {
        b.t += dt;
        const k = Math.min(1, b.t / BOOK_FLIGHT);
        b.obj.position.lerpVectors(b.from, b.to, k);
        b.obj.position.y += 4 * BOOK_ARC * k * (1 - k);
        b.obj.rotation.x += dt * 9;
        b.obj.rotation.z += dt * 5;
        b.shadow.scale.setScalar(BOOK_SHADOW * (0.6 + 0.4 * k));
        if (k >= 1) {
          b.mode = 3;
          b.t = 0;
          b.obj.position.y = 0.06;
          b.obj.rotation.set(0, Math.random() * 6, 0);
          b.shadow.visible = false;
          landed = true;
          h.fx.confetti(_v.set(b.to.x, 0.3, b.to.z), 6, 2, 0xf4f0e0, 1, 0.5);
          if (!this.attackHit && Math.hypot(h.pos.x - b.to.x, h.pos.z - b.to.z) < BOOK_R && c.feet < 1.0) {
            this.attackHit = true;
            this.hurt(VISIT_DMG, _v.set(b.to.x, 0.5, b.to.z), 'book');
          }
        }
      } else if (b.mode === 3) {
        b.t += dt;
        if (b.t > 0.7) {
          b.mode = 0;
          b.obj.visible = false;
        }
      }
    }
    if (landed) h.sound('hit', undefined, 0.6);
  }

  /** 공격이 맞았다 (근접 배율 없음, 난이도 배율은 Game.hurt) */
  private hurt(dmg: number, at: THREE.Vector3, kind: HurtKind): void {
    this.stats.hits++;
    this.h.ctx.hurt(dmg, at, kind, false);
  }

  /** 자세 뒤에 팔을 덧댄다 (Person.update 다음) */
  afterPose(vp: VisitPerson): void {
    const p = vp.person;
    const kind = this.def.kind;
    const fighting = vp === this.vp && this.state === 'fight';
    const winding = fighting && this.phase === 'wind';
    const acting = fighting && this.phase === 'act';
    const k = this.aT;
    p.body.rotation.x = 0;
    p.armR.visible = !(kind === 'punch' && this.fist.on);
    const flame = this.flames.get(p);
    if (flame) flame.visible = kind === 'punch' && winding;
    if (!fighting) return;
    switch (kind) {
      case 'punch':
        if (winding) {
          // 오른팔을 플레이어 쪽으로 뻗고 주먹 뒤에 불꽃이 붙으며 반짝
          p.armR.rotation.x = -1.5;
          if (flame) flame.scale.setScalar(0.75 + Math.abs(Math.sin(k * 26)) * 0.45 + k * 0.3);
        }
        break;
      case 'cursor':
        if (winding || (acting && k < 0.45)) p.armL.rotation.x = -1.6 + Math.sin(k * 60) * 0.12;
        break;
      case 'resume':
        if (winding || (acting && k < 0.3)) {
          // 자기소개서 더미를 두 손으로 앞으로 민다
          const push = acting ? -1.55 : -1.15 + Math.sin(k * 40) * 0.06;
          p.armR.rotation.x = push;
          p.armL.rotation.x = push;
        }
        break;
      case 'luggage':
        if (winding || (acting && k < 0.3)) {
          p.body.rotation.x = 0.22;
          p.armR.rotation.x = -0.9;
          p.armL.rotation.x = -0.9;
        }
        break;
      case 'inspect':
        if (winding) p.armR.rotation.x = -1.55;
        break;
      case 'book':
        if (winding) {
          // 책 더미를 머리 위로
          p.armR.rotation.x = -2.7;
          p.armL.rotation.x = -2.7;
        } else if (acting && k < 0.3) {
          p.armR.rotation.x = -1.6;
          p.armL.rotation.x = -1.6;
        }
        break;
      default:
        break;
    }
  }

  /** 공격 표시·날아가는 것을 모두 거둔다 (성공·실패·판 정리) */
  private clearShots(): void {
    const f = this.fist;
    f.on = false;
    f.obj.visible = false;
    for (const s of this.cursors) {
      s.on = false;
      s.obj.visible = false;
    }
    for (const s of this.preview) s.visible = false;
    this.cursorPend = 0;
    this.wave.on = false;
    this.wave.obj.visible = false;
    for (const r of this.rollers) {
      r.on = false;
      r.obj.visible = false;
    }
    for (const m of this.marks) m.visible = false;
    for (const b of this.books) {
      b.mode = 0;
      b.obj.visible = false;
      b.shadow.visible = false;
    }
    this.phase = 'move';
  }

  // ---------- 보상 상자 ----------

  /** 떠나면서 보상 상자를 떨어뜨린다 (플레이어 쪽으로 조금) */
  private dropGift(): void {
    const h = this.h;
    const vp = this.vp;
    if (!vp) return;
    const o = vp.obj.position;
    const dx = h.pos.x - o.x;
    const dz = h.pos.z - o.z;
    const d = Math.hypot(dx, dz) || 1;
    const [x, z] = placeIn(h.area, h.solids(), o.x + (dx / d) * Math.min(2.2, d * 0.4), o.z + (dz / d) * Math.min(2.2, d * 0.4), 1.2);
    const b = this.box;
    b.on = true;
    b.landed = false;
    b.pos.set(x, 0.02, z);
    b.area = h.areaNo();
    b.reward = this.def.reward;
    this.giftFrom.copy(vp.person.chest);
    this.giftT = 0;
    this.giftLabel.material = this.giftMats.get(b.reward) as THREE.SpriteMaterial;
    const lm = this.giftLabel.material;
    const aspect = ((lm.map?.userData as { aspect?: number } | undefined)?.aspect ?? 3) * 0.42;
    this.giftLabel.scale.set(aspect, 0.42, 1);
    this.gift.position.copy(this.giftFrom);
    this.gift.visible = true;
    h.sound('pop', this.giftFrom, 0.8);
  }

  private stepGift(dt: number): void {
    const b = this.box;
    if (!b.on) return;
    const h = this.h;
    const g = this.gift;
    this.giftT += dt;
    if (!b.landed) {
      const k = Math.min(1, this.giftT / 0.55);
      g.position.lerpVectors(this.giftFrom, b.pos, k);
      g.position.y += 4 * 1.2 * k * (1 - k);
      g.rotation.y += dt * 8;
      if (k >= 1) {
        b.landed = true;
        g.position.copy(b.pos);
        h.fx.confetti(_v.set(b.pos.x, 0.5, b.pos.z), 10, 2.5, 0xf5c542, 1.5, 0.6);
      }
      return;
    }
    g.position.y = 0.02 + Math.abs(Math.sin(this.giftT * 3)) * 0.12;
    g.rotation.y += dt * 1.6;
    const near = h.mode === 'staff' && h.playing && Math.hypot(h.pos.x - b.pos.x, h.pos.z - b.pos.z) < PICK_D && h.ctx.feet < 1;
    // 줍지 않고 다음 구역으로 넘어가면 챙겨 준다 (돌아올 수 없는 구역이 된다)
    if (near || h.areaNo() !== b.area) this.collect();
  }

  /** 상자를 집었다: 보상을 F 칸에 넣는다 */
  private collect(): void {
    const h = this.h;
    const b = this.box;
    b.on = false;
    this.gift.visible = false;
    this.item = b.reward;
    this.itemN = REWARD[b.reward].uses;
    const r = REWARD[b.reward];
    h.banner(`${r.name} 획득!`, h.touch ? '아이템 버튼으로 쓰기' : 'F로 쓰기');
    h.sound('pickup');
    h.fx.confetti(_v.set(b.pos.x, 0.8, b.pos.z), 14, 3, 0xf5c542, 2, 0.7);
  }

  // ---------- 보상 쓰기 (F — sidejob.ts useItem이 먼저 부른다) ----------

  /** HUD 아이템 줄·터치 단추 글 (sidejob.ts syncUi) */
  itemUi(): { line: string; btn: string } | null {
    if (!this.item || this.itemN <= 0) return null;
    const r = REWARD[this.item];
    return this.item === 'glove' ? { line: `${r.name} ${this.itemN}`, btn: `${r.btn}<br>${this.itemN}` } : { line: r.name, btn: r.btn };
  }

  /** F: 들고 있는 보상을 쓴다. 썼으면 true */
  useItem(): boolean {
    const h = this.h;
    if (!this.item || this.itemN <= 0 || h.mode !== 'staff' || !h.playing || h.frozen || this.useCd > 0) return false;
    const it = this.item;
    switch (it) {
      case 'glove':
        this.throwShot('glove');
        break;
      case 'graph':
        this.throwShot('graph');
        break;
      case 'clicker':
        this.clickT = CLICK_T * this.buffMul;
        h.note(`매크로 클리커! ${Math.round(this.clickT)}초 동안 도장 연사 ${CLICK_MUL}배`, 2);
        h.sound('tick');
        break;
      case 'cheer':
        this.startCheer();
        break;
      case 'plaque':
        this.placePlaque();
        break;
      case 'quiet':
        this.placeSign();
        break;
    }
    this.useCd = 0.3;
    if (--this.itemN <= 0) this.item = null;
    return true;
  }

  /** 아이템 시간 장점 (최도서관 +30%, src/perks.ts): 보상 효과 시간에 곱한다 */
  private get buffMul(): number {
    return perkMul(this.h.heroId(), 'buff');
  }

  /** 시험용 (?debug): 보상을 바로 손에 (상자를 거치지 않는다) */
  give(r: RewardId): void {
    this.item = r;
    this.itemN = REWARD[r].uses;
  }

  private aimDir(out: THREE.Vector3): THREE.Vector3 {
    const h = this.h;
    const cp = Math.cos(h.pitch);
    return out.set(-Math.sin(h.yaw) * cp, Math.sin(h.pitch), -Math.cos(h.yaw) * cp);
  }

  /** 로켓 펀치 장갑·취업률 상승 그래프 던지기 */
  private throwShot(kind: 'glove' | 'graph'): void {
    const h = this.h;
    let s = this.shots.find((x) => !x.on && x.kind === kind);
    if (!s) {
      s = { kind, obj: kind === 'glove' ? buildGlove() : buildGraph(), vel: new THREE.Vector3(), on: false, dist: 0, t: 0, back: false, hits: new Set(), k: 1 };
      h.scene.add(s.obj);
      this.shots.push(s);
    }
    const dir = this.aimDir(_v);
    s.obj.position.set(h.pos.x, h.eyeY - (kind === 'glove' ? 0.2 : 0.3), h.pos.z).addScaledVector(dir, 0.9);
    s.vel.copy(dir).multiplyScalar(kind === 'glove' ? GLOVE_V : GRAPH_V);
    s.on = true;
    s.dist = 0;
    s.t = 0;
    s.back = false;
    s.hits.clear();
    // 던지기 장점 (나진취 +20%): 결재 진행과 날아가는 거리
    s.k = perkMul(h.heroId(), 'throw');
    s.obj.visible = true;
    if (kind === 'glove') s.obj.quaternion.setFromUnitVectors(FWD, dir);
    else s.obj.rotation.set(0, h.yaw, 0);
    this.lastShot = { kind, minions: 0, bosses: 0 };
    h.sound('throw', undefined, 1);
    if (kind === 'glove') h.sound('dash', undefined, 0.7);
  }

  private stepRewards(dt: number): void {
    const h = this.h;
    if (this.clickT > 0) this.clickT -= dt;
    // 던진 장갑·그래프
    for (const s of this.shots) {
      if (!s.on) continue;
      const p = s.obj.position;
      _prev.copy(p);
      s.t += dt;
      if (s.kind === 'glove') {
        p.addScaledVector(s.vel, dt);
        s.dist += GLOVE_V * dt;
        const fl = s.obj.getObjectByName('flame');
        if (fl) fl.scale.setScalar(1.1 + Math.random() * 0.5);
        this.shotHits(s, GLOVE_STAMPS * s.k, 0.5);
        if (s.dist > GLOVE_RANGE * s.k || p.y < 0.05) {
          s.on = false;
          s.obj.visible = false;
          h.fx.confetti(p, 8, 3, 0xff8a2a, 1.5, 0.6);
        }
        continue;
      }
      // 그래프: 보는 쪽으로 GRAPH_RANGE 날아갔다가 돌아온다 (돌아설 때 맞힌 목록을 비운다)
      s.obj.rotation.y += dt * 13;
      if (!s.back) {
        p.addScaledVector(s.vel, dt);
        s.dist += GRAPH_V * dt;
        if (s.dist >= GRAPH_RANGE * s.k) {
          s.back = true;
          s.hits.clear();
        }
      } else {
        _w.set(h.pos.x, h.eyeY - 0.3, h.pos.z).sub(p);
        const d = _w.length();
        if (d < 1.0 || s.t > 5) {
          s.on = false;
          s.obj.visible = false;
          continue;
        }
        p.addScaledVector(_w.divideScalar(d), Math.min(d, GRAPH_V * 1.15 * dt));
      }
      if (p.y < 0.5) p.y = 0.5;
      this.shotHits(s, GRAPH_STAMPS * s.k, 0.85);
    }
    this.stepCheer(dt);
    // 실사 통과 현판
    if (this.plaqueT > 0) {
      this.plaqueT -= dt;
      this.plaqueRingMat.opacity = 0.55 + Math.abs(Math.sin(this.plaqueT * 3)) * 0.35;
      if (this.plaqueT <= 0) {
        this.plaque.visible = false;
        h.fx.confetti(_v.set(this.plaquePos.x, 1, this.plaquePos.z), 10, 2, 0xd9b44a, 1.5, 0.6);
      }
    }
    // 쉿! 정숙 표지판
    if (this.quietT > 0) {
      this.quietT -= dt;
      this.sign.rotation.z = Math.sin(this.quietT * 4) * 0.05;
      if (this.quietT <= 0) this.sign.visible = false;
    }
  }

  /** 지나간 선분에 닿은 것: 잡몹은 처리 (제한 없이 관통), 사람 보스는 도장 stamps발 (한 번씩) */
  private shotHits(s: Shot, stamps: number, reach: number): void {
    const h = this.h;
    const p = s.obj.position;
    for (const e of h.enemies()) {
      if (!e.targetable || s.hits.has(e)) continue;
      if (segDist(_prev, p, e.center) > e.radius + reach) continue;
      s.hits.add(e);
      const boss = h.isBoss(e);
      h.itemHit(e, boss ? stamps : 1);
      h.fx.confetti(e.center, 8, 3, s.kind === 'glove' ? 0xd0202f : 0x5bbf63, 2, 0.6);
      if (boss) this.lastShot.bosses++;
      else this.lastShot.minions++;
    }
  }

  // ---------- 응원단 호출권 ----------

  private startCheer(): void {
    const h = this.h;
    this.cheerT = CHEER_T * this.buffMul;
    // 보는 쪽 앞 양옆(화면 안)에서 달려 들어온다
    const fwd = _v.set(-Math.sin(h.yaw), 0, -Math.cos(h.yaw));
    const right = _w.set(Math.cos(h.yaw), 0, -Math.sin(h.yaw));
    for (const m of this.cheer) {
      m.person.reset();
      m.person.clip.visible = false;
      m.obj.position.set(h.pos.x + fwd.x * 7 + right.x * m.side * 4.5, 0, h.pos.z + fwd.z * 7 + right.z * m.side * 4.5);
      const a = h.area;
      m.obj.position.x = Math.max(a.minX + 0.5, Math.min(a.maxX - 0.5, m.obj.position.x));
      m.obj.position.z = Math.max(a.minZ + 0.5, Math.min(a.maxZ - 0.5, m.obj.position.z));
      m.obj.visible = true;
      m.state = 'in';
      m.t = 0;
      m.cd = 0.25;
      m.reach = 0;
    }
    h.banner('응원단 출동!', `${Math.round(this.cheerT)}초 동안 동아리원 2명이 잡몹을 처리해요`);
    h.sound('open');
  }

  private stepCheer(dt: number): void {
    const h = this.h;
    if (this.cheerT > 0) this.cheerT -= dt;
    for (const m of this.cheer) {
      if (m.state === 'off') continue;
      m.t += dt;
      const o = m.obj.position;
      const pose: PoseIn = { walking: false, raise: 0, reach: 0, wave: false };
      if (this.cheerT <= 0 && (m.state === 'in' || m.state === 'on')) {
        m.state = 'out';
        m.t = 0;
        m.exit.set(o.x + Math.sin(h.yaw) * 12 + m.side * 3, 0, o.z + Math.cos(h.yaw) * 12);
      }
      let want = m.obj.rotation.y;
      if (m.state === 'in' || m.state === 'on') {
        // 플레이어 곁 (양옆, 시야 밖)
        const tx = h.pos.x + Math.cos(h.yaw) * m.side * CHEER_SIDE - Math.sin(h.yaw) * CHEER_FWD;
        const tz = h.pos.z - Math.sin(h.yaw) * m.side * CHEER_SIDE - Math.cos(h.yaw) * CHEER_FWD;
        const dx = tx - o.x;
        const dz = tz - o.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const step = Math.min(d, (d > 4 ? 9 : 6) * dt);
          o.x += (dx / d) * step;
          o.z += (dz / d) * step;
          pose.walking = d > 0.6;
          if (d > 1.5) want = Math.atan2(dx, dz);
          else want = h.yaw + Math.PI;
        } else want = h.yaw + Math.PI;
        // 가까이 오면 (곁에 닿기 전이라도) 던지기 시작
        if (m.state === 'in' && d < 5) m.state = 'on';
        if (m.state === 'on') {
          m.cd -= dt;
          if (m.cd <= 0) {
            const tgt = this.cheerTarget(o);
            if (tgt) {
              this.throwPom(m, tgt);
              want = Math.atan2(tgt.center.x - o.x, tgt.center.z - o.z);
              m.cd = CHEER_CD;
            } else m.cd = 0.15;
          }
        }
      } else if (m.state === 'out') {
        pose.wave = m.t < 0.8;
        if (m.t > 0.5) {
          const dx = m.exit.x - o.x;
          const dz = m.exit.z - o.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            o.x += (dx / d) * Math.min(d, 7 * dt);
            o.z += (dz / d) * Math.min(d, 7 * dt);
            pose.walking = true;
            want = Math.atan2(dx, dz);
          }
          if (d <= 0.3 || m.t > 2.6) {
            m.state = 'off';
            m.obj.visible = false;
            m.person.tag.hide();
            continue;
          }
        } else want = Math.atan2(h.pos.x - o.x, h.pos.z - o.z);
      }
      if (m.reach > 0) m.reach = Math.max(0, m.reach - dt * 3);
      pose.reach = m.reach;
      m.obj.rotation.y += wrap(want - m.obj.rotation.y) * Math.min(1, dt * 10);
      m.person.update(dt, pose);
    }
    // 응원 술
    for (const pm of this.poms) {
      if (!pm.on) continue;
      pm.t += dt;
      const e = pm.target;
      if (!e || !e.targetable || pm.t > 1.5) {
        pm.on = false;
        pm.obj.visible = false;
        continue;
      }
      const p = pm.obj.position;
      _w.subVectors(e.center, p);
      const d = _w.length();
      if (d < e.radius + 0.35) {
        pm.on = false;
        pm.obj.visible = false;
        h.itemHit(e, 1);
        this.cheerKills++;
        h.fx.confetti(e.center, 12, 3, 0xffd84a, 2, 0.7);
        continue;
      }
      p.addScaledVector(_w.divideScalar(d), Math.min(d, POM_V * dt));
      pm.obj.rotation.x += dt * 10;
    }
  }

  /** 응원단이 노릴 잡몹: 가장 가까운 것 (사람·이미 노린 것 빼고) */
  private cheerTarget(from: THREE.Vector3): Enemy | null {
    const h = this.h;
    let best: Enemy | null = null;
    let bd = CHEER_RANGE;
    for (const e of h.enemies()) {
      if (!e.targetable || h.isBoss(e) || e.pinned) continue;
      if (this.poms.some((p) => p.on && p.target === e)) continue;
      const d = Math.hypot(e.center.x - from.x, e.center.z - from.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private throwPom(m: Cheerer, e: Enemy): void {
    const pm = this.poms.find((p) => !p.on);
    if (!pm) return;
    pm.on = true;
    pm.target = e;
    pm.t = 0;
    pm.obj.position.set(m.obj.position.x, 1.6, m.obj.position.z);
    pm.obj.visible = true;
    m.reach = 1;
    this.h.sound('throw', pm.obj.position, 0.5);
  }

  // ---------- 실사 통과 현판·쉿! 정숙 표지판 ----------

  private placePlaque(): void {
    const h = this.h;
    const fx = -Math.sin(h.yaw);
    const fz = -Math.cos(h.yaw);
    this.plaquePos.set(h.pos.x + fx * 1.3, 0, h.pos.z + fz * 1.3);
    this.plaque.position.copy(this.plaquePos);
    this.plaque.rotation.y = h.yaw;
    this.plaque.visible = true;
    this.plaqueT = PLAQUE_T * this.buffMul;
    h.fx.ring(this.plaquePos.x, 0.08, this.plaquePos.z, 0.6, PLAQUE_R, 0.6, 0x7cfc9a);
    h.fx.confetti(_v.set(this.plaquePos.x, 1.4, this.plaquePos.z), 16, 3, 0xd9b44a, 2, 0.7);
    h.note(`실사 통과 현판! ${Math.round(this.plaqueT)}초 동안 둘레 ${PLAQUE_R}m 안전지대`, 2.2);
    h.sound('open');
  }

  private placeSign(): void {
    const h = this.h;
    const fx = -Math.sin(h.yaw);
    const fz = -Math.cos(h.yaw);
    this.sign.position.set(h.pos.x + fx * 2.2, 0, h.pos.z + fz * 2.2);
    this.sign.rotation.set(0, h.yaw, 0);
    this.sign.visible = true;
    this.quietT = QUIET_T * this.buffMul;
    h.fx.ring(h.pos.x, 0.08, h.pos.z, 1, 30, 0.8, 0x9fd3ff);
    h.note(`쉿! 정숙 표지판! ${Math.round(this.quietT)}초 동안 잡몹이 느려져요`, 2.2);
    h.sound('tick');
  }

  // ---------- 판 정리·미리 그리기 ----------

  /**
   * 이어하기 (PRD 결정 60, main.ts continueRun): 구역을 처음부터 다시 한다.
   * 상대가 와서 결재판을 채우는 중(안 끝남)이었으면 치우고 그 구역에서 다시 나오게 하고, 이미 끝났으면(대사·걸어 나가는 중)
   * 결과는 그대로 두고 상대만 치운다. 켜져 있던 보상 효과(클리커·응원단·현판·표지판)와 날아가던 것도 거둔다.
   * 들고 있는 보상(item)은 main.ts가 그 구역 시작 때로 되돌린다. 땅에 떨어진 보상 상자는 그대로 둔다
   */
  retry(): void {
    const vp = this.vp;
    if (vp) {
      if (this.state === 'enter' || this.state === 'fight') {
        this.done = false;
        this.result = '';
      }
      vp.gone = true;
      vp.obj.visible = false;
      this.restorePerson(vp.person);
      vp.person.tag.hide();
    }
    this.vp = null;
    this.state = 'idle';
    this.phase = 'move';
    this.won = false;
    this.waitT = -1;
    this.clearShots();
    for (const s of this.shots) {
      s.on = false;
      s.obj.visible = false;
    }
    for (const m of this.cheer) {
      m.state = 'off';
      m.obj.visible = false;
      m.person.tag.hide();
    }
    for (const p of this.poms) {
      p.on = false;
      p.obj.visible = false;
    }
    this.plaque.visible = false;
    this.sign.visible = false;
    this.clickT = this.cheerT = this.plaqueT = this.quietT = 0;
  }

  /** 판을 처음으로 (쓰러짐·다시 하기·처음 화면): 보상도 사라진다 */
  clear(): void {
    const vp = this.vp;
    if (vp) {
      vp.gone = true;
      vp.obj.visible = false;
      this.restorePerson(vp.person);
      vp.person.tag.hide();
    }
    this.vp = null;
    this.state = 'idle';
    this.phase = 'move';
    this.clearShots();
    this.box.on = false;
    this.gift.visible = false;
    for (const s of this.shots) {
      s.on = false;
      s.obj.visible = false;
    }
    for (const m of this.cheer) {
      m.state = 'off';
      m.obj.visible = false;
      m.person.tag.hide();
    }
    for (const p of this.poms) {
      p.on = false;
      p.obj.visible = false;
    }
    this.plaque.visible = false;
    this.sign.visible = false;
    this.item = null;
    this.itemN = 0;
    this.clickT = this.cheerT = this.plaqueT = this.quietT = 0;
    this.done = false;
    this.result = '';
    this.won = false;
    this.waitT = -1;
    this.useCd = 0;
    this.cheerKills = 0;
    this.lastShot = { kind: '', minions: 0, bosses: 0 };
    this.plan();
  }

  /** 미리 그리기 (상대 일곱·응원단·날아가는 것·보상 모형) */
  warm(group: THREE.Group): () => void {
    const tmp = new THREE.Group();
    tmp.position.set(-7, -1.6, -8);
    const ppl = [this.ambM, this.ambF, ...Object.values(this.persons), ...this.cheer.map((m) => m.person)];
    const pose: PoseIn = { walking: true, raise: 0, reach: 0.5, wave: false };
    ppl.forEach((p, i) => {
      p.root.removeFromParent();
      p.root.position.set(i * 1.3, 0, 0);
      tmp.add(p.root);
      p.say('…', 1, false);
      p.update(0.016, pose);
    });
    for (const f of this.flames.values()) f.visible = true;
    const things: THREE.Object3D[] = [buildGlove(), buildGraph(), buildMoveBox().obj, buildCase().obj, buildBook(BOOK_COLORS[0]), buildPom()];
    things.forEach((o, i) => {
      o.visible = true;
      o.position.set(i * 0.8, 1, 2);
      o.scale.setScalar(0.4);
      tmp.add(o);
    });
    const shown: THREE.Object3D[] = [this.fist.obj, this.cursors[0].obj, this.wave.obj, this.marks[0], this.gift, this.plaque, this.sign, this.books[0].shadow];
    const saved = shown.map((o) => o.position.clone());
    shown.forEach((o, i) => {
      o.visible = true;
      o.position.set(-6 + i * 1.6, 0.5, 4);
    });
    group.add(tmp);
    return () => {
      group.remove(tmp);
      for (const p of ppl) {
        tmp.remove(p.root);
        p.reset();
        p.root.position.set(0, 0, 0);
      }
      for (const m of this.cheer) m.obj.add(m.person.root);
      for (const f of this.flames.values()) f.visible = false;
      shown.forEach((o, i) => {
        o.visible = false;
        o.position.copy(saved[i]);
      });
    };
  }

  /** 미리 올려 둘 그림 (renderer.initTexture) */
  get warmTextures(): readonly THREE.Texture[] {
    return this.textures;
  }
}
