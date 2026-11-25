import Phaser from 'phaser';
import { FONT } from '../config';
import type { HeroId } from '../data/heroes';
import type { StudentHeroLook } from '../data/students';
import { Rig } from './Rig';
import { INK, SKIN, addNeckwear, addSkirt, box, createStudentHeroRig, dressHead, tone } from './rigs';

// 돌발 방문 이벤트(교직원 모드 2D) 외형: 방문 상대 6명, 그들의 공격 소품, 보상(상자·장갑·그래프·현판), 응원단 동아리원.
// 모두 이름 없는 가상 인물이고 공용 외형 함수(dressHead·addNeckwear·addSkirt·createStudentHeroRig)로 만든다.
// 국기·국명·민족 특징을 나타내는 외형은 넣지 않는다.

type Container = Phaser.GameObjects.Container;

/** 대사님 예복 띠 색 [띠, 가장자리]. 실존 국기로 읽힐 만한 조합(빨강·하양·파랑·초록·노랑 같은 국기 기본색끼리)은 피했다 */
export const SASH_COLORS: [number, number][] = [
  [0x7b3fa0, 0xcfd3dc], // 보라 + 은회색
  [0x1f8a8a, 0xd6c4ef], // 청록 + 연보라
  [0xc2457a, 0xa8e6cf], // 자홍 + 민트
  [0xe07a5f, 0x3d405b], // 산호 + 먹청
  [0xb39ddb, 0xb87333], // 라일락 + 구리
  [0x7d7f3a, 0xf2b5c8], // 올리브 + 분홍
];

const SUIT = 0x1c2230;
const PAPER = 0xf6f1e1;

// ---------- 방문 상대 ----------

/** 외국 대사 (남녀 무작위는 부르는 쪽이 정한다): 짙은 정장 + 사선 예복 띠 + 가슴 훈장 하나 + 뒷손에 특강 원고 */
function createAmbassadorRig(scene: Phaser.Scene, female: boolean, sash: [number, number]): Rig {
  const rig = new Rig(scene, {
    legW: 15,
    legH: 36,
    legGap: 14,
    legColor: SUIT,
    shoeColor: 0x121212,
    torsoW: 40,
    torsoH: 40,
    torsoColor: SUIT,
    armW: 12,
    armH: 31,
    armColor: SUIT,
    handColor: SKIN,
    headW: 33,
    headH: 32,
    headColor: SKIN,
    outline: INK,
  });
  if (female) addSkirt(rig, SUIT);
  // 흰 셔츠 + 넥타이(여: 리본) — torso 원점 = 허리, 몸통 위쪽 끝 = -40
  rig.torso.add(rig.part(0, -39, 14, 22, 0xf4f4f4, 0.5, 0, false));
  addNeckwear(rig, female ? 'ribbon' : 'tie', 0x2b2f3a, -40);
  // 사선 예복 띠: 앞 어깨에서 뒤 허리로 (가장자리 색 위에 띠 색)
  const edge = rig.part(0, -21, 12, 50, sash[1], 0.5, 0.5);
  edge.rotation = 0.62;
  const core = rig.part(0, -21, 7, 50, sash[0], 0.5, 0.5, false);
  core.rotation = 0.62;
  rig.torso.add([edge, core]);
  // 가슴 훈장 하나: 짧은 띠 + 금빛 원
  rig.torso.add(rig.part(-9, -33, 6, 6, sash[0], 0.5, 0));
  const medal = new Phaser.GameObjects.Arc(scene, -9, -24, 4.5, 0, 360, false, 0xd9b44a);
  medal.setStrokeStyle(1.5, INK);
  rig.torso.add(medal);
  // 특강 원고 (뒷손)
  rig.armB.add(rig.part(1, 22, 15, 20, 0xffffff, 0.5, 0));
  for (let i = 0; i < 3; i++) rig.armB.add(rig.part(1, 27 + i * 4, 9, 1.5, 0x9aa3ad, 0.5, 0, false));
  dressHead(rig, { hair: female ? 0x2a2420 : 0x4a4a4a, style: female ? 'bob' : 'short', female });
  return rig;
}

/** 대사님 로켓 펀치 예고: 주먹 뒤(손목 쪽)에 붙는 불꽃. 손 기준 +y가 팔이 뻗은 쪽이다 */
export function createFistFlame(scene: Phaser.Scene, rig: Rig): Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  for (const s of [-1, 1]) {
    c.add(rig.part(s * 8, -24, 6, 16, 0xff7a1a, 0.5, 0, false));
    c.add(rig.part(s * 8, -20, 3, 9, 0xffe066, 0.5, 0, false));
  }
  c.add(rig.part(0, 2, 6, 6, 0xffffff, 0.5, 0.5, false));
  return c;
}

/** 팔에서 떨어져 날아가는 대사님의 주먹 (소매 + 주먹 + 뒤로 뿜는 불꽃). +x 쪽이 앞 */
export function createRocketFist(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, -26, 0, 16, 10, 0xff7a1a, 0.5, 0.5, false));
  c.add(box(scene, -24, 0, 9, 5, 0xffe066, 0.5, 0.5, false));
  c.add(box(scene, -8, 0, 20, 13, SUIT));
  c.add(box(scene, 8, 0, 14, 15, SKIN));
  c.add(box(scene, 11, -4, 6, 2, 0xd9a882, 0.5, 0.5, false));
  c.add(box(scene, 11, 1, 6, 2, 0xd9a882, 0.5, 0.5, false));
  return c;
}

/** 수강신청 매크로 학생: 회색 후드티·뿔테·이어폰, 앞손에 게이밍 마우스 */
function createMacroRig(scene: Phaser.Scene): Rig {
  const rig = createStudentHeroRig(scene, {
    jacket: 0x4b5563,
    hair: 0x1f1a17,
    bag: 0x1f2937,
    hoodie: true,
    glassesStyle: 'horn',
    earphones: true,
    shoes: 0x2b2b2b,
    shoeStripe: 0x22d3ee,
  });
  rig.itemF.add(rig.part(0, -2, 13, 18, 0x15171c, 0.5, 0));
  rig.itemF.add(rig.part(0, 0, 3, 5, 0x22d3ee, 0.5, 0, false));
  return rig;
}

/** 장기 미취업 학생: 체크 셔츠, 두 손에 자기소개서 더미 */
function createJoblessRig(scene: Phaser.Scene): Rig {
  const rig = createStudentHeroRig(scene, { jacket: 0x7c8aa0, hair: 0x2a2420, bag: 0x4b3b2a, check: true });
  for (const [arm, w] of [
    [rig.itemF, 24],
    [rig.armB, 20],
  ] as const) {
    const y = arm === rig.itemF ? -4 : 24;
    arm.add(rig.part(0, y, w, 30, PAPER, 0.5, 0));
    for (let i = 0; i < 4; i++) arm.add(rig.part(0, y + 5 + i * 6, w - 8, 1.5, 0x9aa3ad, 0.5, 0, false));
  }
  return rig;
}

/** 동아리 연합회장: 외대 야구잠바, 묶은 머리 */
function createClubRig(scene: Phaser.Scene): Rig {
  return createStudentHeroRig(scene, {
    jacket: 0x14532d,
    hair: 0x3b2a20,
    bag: 0x7a1f2b,
    varsity: true,
    female: true,
    ponytail: true,
  });
}

/** 대학평가 실사 위원: 회색 정장·은테 안경·희끗한 머리, 앞손에 점검표 */
function createEvaluatorRig(scene: Phaser.Scene): Rig {
  const suit = 0x4b5160;
  const rig = new Rig(scene, {
    legW: 15,
    legH: 36,
    legGap: 14,
    legColor: suit,
    shoeColor: 0x141414,
    torsoW: 40,
    torsoH: 40,
    torsoColor: suit,
    armW: 12,
    armH: 31,
    armColor: suit,
    handColor: SKIN,
    headW: 33,
    headH: 32,
    headColor: SKIN,
    outline: INK,
  });
  rig.torso.add(rig.part(0, -39, 14, 22, 0xf4f4f4, 0.5, 0, false));
  addNeckwear(rig, 'tie', 0x1f3a6b, -40);
  // 목걸이 출입증 "위원"
  rig.torso.add(rig.part(9, -37, 2, 16, 0xd0202f, 0.5, 0, false));
  rig.torso.add(rig.part(9, -22, 12, 12, 0xffffff, 0.5, 0));
  rig.torso.add(rig.part(9, -22, 12, 3, 0xd0202f, 0.5, 0, false));
  dressHead(rig, { hair: 0x9a9a9a, style: 'short', glasses: 'silver' });
  // 점검표 (결재판 모양)
  rig.itemF.add(rig.part(0, -4, 22, 28, 0x6b4a2a, 0.5, 0));
  rig.itemF.add(rig.part(0, 0, 16, 20, 0xffffff, 0.5, 0, false));
  for (let i = 0; i < 3; i++) rig.itemF.add(rig.part(2, 4 + i * 5, 9, 1.5, 0x9aa3ad, 0.5, 0, false));
  for (let i = 0; i < 3; i++) rig.itemF.add(rig.part(-5, 4 + i * 5, 3, 3, 0xd0202f, 0.5, 0, false));
  return rig;
}

/** 400일 장기 연체 대학원생: 후드티·안경·눈 밑 그늘, 앞손에 책 더미 */
function createGradRig(scene: Phaser.Scene): Rig {
  const rig = createStudentHeroRig(scene, { jacket: 0x4a5d4a, hair: 0x2a2420, bag: 0x3b3b3b, hoodie: true, glasses: true });
  // 눈 밑 그늘 (밤샘)
  rig.head.add(rig.part(4, -12, 6, 2, 0xb59a8a, 0.5, 0, false));
  rig.head.add(rig.part(12, -12, 6, 2, 0xb59a8a, 0.5, 0, false));
  const colors = [0x7a1f2b, 0x1f3a6b, 0x2f5d3a];
  colors.forEach((c, i) => {
    rig.itemF.add(rig.part(0, -6 + i * 9, 26 - i * 2, 9, c, 0.5, 0));
    rig.itemF.add(rig.part(-2, -4 + i * 9, 18 - i * 2, 2, PAPER, 0.5, 0, false));
  });
  return rig;
}

/** 방문 상대 외형. 대사님만 남녀·띠 색이 무작위다 */
export function createVisitorRig(scene: Phaser.Scene, hero: HeroId): Rig {
  switch (hero) {
    case 'kimgukje':
      return createAmbassadorRig(scene, Math.random() < 0.5, SASH_COLORS[Math.floor(Math.random() * SASH_COLORS.length)]);
    case 'ohakjongji':
      return createMacroRig(scene);
    case 'leejinchwi':
      return createJoblessRig(scene);
    case 'choijanghak':
      return createClubRig(scene);
    case 'parkhaksa':
      return createEvaluatorRig(scene);
    case 'kimsikdang':
      return createGradRig(scene);
  }
}

// ---------- 공격 소품 ----------

/** 마우스 커서 (흰 화살표). 끝이 (0, 0), 몸통은 오른쪽 아래로 */
export function createCursor(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  const pts = [
    new Phaser.Math.Vector2(0, 0),
    new Phaser.Math.Vector2(0, 19),
    new Phaser.Math.Vector2(5, 14),
    new Phaser.Math.Vector2(9, 22),
    new Phaser.Math.Vector2(12, 21),
    new Phaser.Math.Vector2(8, 13),
    new Phaser.Math.Vector2(14, 13),
  ];
  g.fillStyle(0xffffff, 1).fillPoints(pts, true);
  g.lineStyle(2, INK, 1).strokePoints(pts, true);
  c.add(g);
  return c;
}

/** 커서 끝이 가리키는 방향(라디안) — 몸통 가운데에서 끝으로 */
export const CURSOR_TIP_ANGLE = Math.atan2(-11, -5);

/** 자기소개서 한 장 */
export function createCoverLetter(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 16, 21, 0xffffff));
  c.add(box(scene, 0, -6, 10, 2, 0x2f6fd1, 0.5, 0.5, false));
  for (let i = 0; i < 3; i++) c.add(box(scene, 0, -1 + i * 4, 10, 1.5, 0x9aa3ad, 0.5, 0.5, false));
  return c;
}

/** 이삿짐 상자 */
export function createMovingBox(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 36, 32, 0xc8955a));
  c.add(box(scene, 0, 0, 36, 6, 0xe2cf9a, 0.5, 0.5, false));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 9, '이삿짐', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#5a3a18' }).setOrigin(0.5),
  );
  return c;
}

/** 통기타 케이스 (검은 몸통 + 목 + 손잡이) */
export function createGuitarCase(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 8, 30, 26, 0x1d1f24));
  c.add(box(scene, 0, -14, 14, 22, 0x1d1f24));
  c.add(box(scene, 0, 8, 22, 2, 0x5a5f6a, 0.5, 0.5, false));
  c.add(box(scene, 10, 0, 4, 8, 0x8a8f96, 0.5, 0.5, false));
  return c;
}

/** 연체된 책 한 권 */
export function createOverdueBook(scene: Phaser.Scene, color: number): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 28, 20, color));
  c.add(box(scene, 2, 0, 22, 14, PAPER, 0.5, 0.5, false));
  c.add(box(scene, -12, 0, 4, 20, tone(color, 0.7), 0.5, 0.5, false));
  return c;
}

export const BOOK_COLORS = [0x7a1f2b, 0x1f3a6b, 0x2f5d3a];

/** 실사 위원의 바닥 ✘ 표시 (바닥에 눕힌 모양) */
export function createFloorX(scene: Phaser.Scene, r: number): Container {
  const c = scene.add.container(0, 0);
  const ring = scene.add.ellipse(0, 0, r * 2, r * 0.9, 0xd0202f, 0.18).setStrokeStyle(2, 0xd0202f, 0.9);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.lineStyle(6, 0xd0202f, 1);
  g.lineBetween(-r * 0.55, -r * 0.24, r * 0.55, r * 0.24);
  g.lineBetween(-r * 0.55, r * 0.24, r * 0.55, -r * 0.24);
  c.add([ring, g]);
  return c;
}

// ---------- 보상 ----------

/** 보상 상자 (금색 포장 + 빨간 리본) */
export function createRewardBox(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 2, 36, 28, 0xf5c542));
  c.add(box(scene, 0, -12, 40, 8, 0xe8b220));
  c.add(box(scene, 0, 0, 7, 32, 0xd0202f, 0.5, 0.5, false));
  c.add(box(scene, 0, -12, 40, 4, 0xd0202f, 0.5, 0.5, false));
  const l = box(scene, -7, -19, 12, 8, 0xd0202f);
  l.rotation = -0.4;
  const r = box(scene, 7, -19, 12, 8, 0xd0202f);
  r.rotation = 0.4;
  c.add([l, r]);
  return c;
}

/** 로켓 펀치 장갑 아이콘 (바닥·날아가는 모양). +x 쪽이 주먹 */
export function createGloveIcon(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, -22, 0, 12, 10, 0xff7a1a, 0.5, 0.5, false));
  c.add(box(scene, -21, 0, 7, 5, 0xffe066, 0.5, 0.5, false));
  c.add(box(scene, -10, 0, 10, 20, 0xd0202f));
  c.add(box(scene, 6, 0, 22, 22, 0xc0c8d2));
  for (let i = 0; i < 3; i++) c.add(box(scene, 12, -6 + i * 6, 8, 2, 0x8a93a0, 0.5, 0.5, false));
  return c;
}

/** 취업률 상승 그래프 아이콘: 흰 판에 계단처럼 오르는 막대 + 빨간 화살표 */
export function createGraphIcon(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 42, 34, 0xffffff));
  c.add(box(scene, -16, 1, 2, 26, INK, 0.5, 0.5, false));
  c.add(box(scene, 0, 13, 34, 2, INK, 0.5, 0.5, false));
  [6, 11, 17, 23].forEach((h, i) => c.add(box(scene, -10 + i * 8, 12 - h / 2, 6, h, i === 3 ? 0x2f9e6a : 0x2f6fd1, 0.5, 0.5, false)));
  const arrow = new Phaser.GameObjects.Graphics(scene);
  arrow.lineStyle(3, 0xd0202f, 1).lineBetween(-12, 4, 14, -12);
  arrow.fillStyle(0xd0202f, 1).fillTriangle(16, -14, 7, -12, 13, -6);
  c.add(arrow);
  return c;
}

/** 손에 든 로켓 펀치 장갑 (손 기준 +y가 팔이 뻗은 쪽) */
export function createHeldGlove(scene: Phaser.Scene, rig: Rig): Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -12, 16, 8, 0xd0202f, 0.5, 0));
  c.add(rig.part(0, -5, 18, 18, 0xc0c8d2, 0.5, 0));
  c.add(rig.part(0, 6, 12, 2, 0x8a93a0, 0.5, 0, false));
  return c;
}

/** 손에 든 취업률 상승 그래프 */
export function createHeldGraph(scene: Phaser.Scene, rig: Rig): Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -4, 24, 28, 0xffffff, 0.5, 0));
  [5, 9, 13, 17].forEach((h, i) => c.add(rig.part(-7 + i * 5, 20 - h, 3, h, i === 3 ? 0x2f9e6a : 0x2f6fd1, 0.5, 0, false)));
  return c;
}

/** 실사 통과 현판 (나무 기둥 + 짙은 초록 판 + 금빛 글씨). 원점 = 기둥 밑 */
export function createPlaque(scene: Phaser.Scene): Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, -26, 6, 52, 0x8b5a2b, 0.5, 0.5));
  c.add(box(scene, 0, -62, 78, 30, 0x1f4d3a));
  c.add(box(scene, 0, -62, 70, 22, 0x1f4d3a).setStrokeStyle(2, 0xd9b44a));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, -62, '실사 통과', { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#f5d77a' }).setOrigin(0.5),
  );
  return c;
}

// ---------- 응원단 동아리원 ----------

/** 응원단 동아리원 두 명의 외형 (외대 야구잠바, 남녀 한 명씩) */
export const CHEER_LOOKS: StudentHeroLook[] = [
  { jacket: 0x1f3a6b, hair: 0x1f1a17, bag: 0x2b2b2b, varsity: true },
  { jacket: 0x7a1f2b, hair: 0x3b2a20, bag: 0x2b2b2b, varsity: true, female: true, ponytail: true },
];

/** 응원 술(폼폼) — 앞손·뒷손에 하나씩 */
export function addPompoms(scene: Phaser.Scene, rig: Rig, color: number): void {
  const pom = (c: Container, y: number) => {
    c.add(rig.part(0, y, 20, 16, color, 0.5, 0.5));
    c.add(rig.part(-5, y - 3, 6, 5, tone(color, 1.25), 0.5, 0.5, false));
    c.add(rig.part(5, y + 3, 6, 5, tone(color, 0.8), 0.5, 0.5, false));
  };
  pom(rig.itemF, 4);
  const back = new Phaser.GameObjects.Container(scene, 0, rig.spec.armH + 8);
  pom(back, 0);
  rig.armB.add(back);
}
