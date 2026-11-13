import Phaser from 'phaser';
import { FONT } from '../config';
import { HEROES, type StaffLook } from '../data/heroes';
import { Rig } from './Rig';
import type { WeaponId } from './weapons';

// 캐릭터·소품 외형 모음. 모두 코드로 그린 블록형 도형이다 (프레지던트 캉 초상 배경의 학교 로고타입만 이미지).

const INK = 0x1d1d22;
const SKIN = 0xf1c7a0;

/** 리그 밖에서 쓰는 사각 조각 (아이콘·투사체용) */
function box(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  ox = 0.5,
  oy = 0.5,
  stroke = true,
): Phaser.GameObjects.Rectangle {
  const r = new Phaser.GameObjects.Rectangle(scene, x, y, w, h, color).setOrigin(ox, oy);
  if (stroke) r.setStrokeStyle(2, INK);
  return r;
}

// ---------- 주인공 ----------

/** 교직원 주인공 (가상 행정직원 6명은 look만 다르다) */
export function createStaffRig(scene: Phaser.Scene, look: StaffLook = HEROES[0].look): Rig {
  const rig = new Rig(scene, {
    legW: 14,
    legH: 36,
    legGap: 14,
    legColor: look.pants ?? 0x2d3b63,
    shoeColor: 0x1b1b1f,
    torsoW: 36,
    torsoH: 38,
    torsoColor: look.shirt,
    armW: 11,
    armH: 30,
    armColor: look.shirt,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: SKIN,
    outline: INK,
  });

  // 넥타이·앞치마와 사원증 (torso 컨테이너 원점 = 허리, 몸통 위쪽 끝 = -38)
  if (look.apron) {
    rig.torso.add(rig.part(0, -28, 30, 27, 0xfff3d6, 0.5, 0));
    rig.torso.add(rig.part(0, -37, 16, 3, look.tie, 0.5, 0, false));
  } else {
    rig.torso.add(rig.part(-2, -37, 6, 24, look.tie, 0.5, 0, false));
  }
  rig.torso.add(rig.part(9, -37, 2, 18, 0x2f6fd1, 0.5, 0, false));
  rig.torso.add(rig.part(9, -20, 11, 14, 0xffffff, 0.5, 0));
  rig.torso.add(rig.part(9, -20, 11, 4, 0x2f6fd1, 0.5, 0, false));

  // 머리 (head 컨테이너 원점 = 목, 머리 위쪽 끝 = -31)
  if (look.longHair) rig.head.add(rig.part(-12, -27, 11, 30, look.hair, 0.5, 0));
  rig.head.add(rig.part(0, -33, 34, 10, look.hair, 0.5, 0));
  if (!look.longHair) rig.head.add(rig.part(-14, -25, 6, 12, look.hair, 0.5, 0, false));
  if (look.glasses) {
    rig.head.add(rig.part(4, -21, 9, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(13, -21, 8, 8, 0xcfe8f5, 0.5, 0));
  }
  rig.head.add(rig.part(4, -19, 4, 6, INK, 0.5, 0, false));
  rig.head.add(rig.part(12, -19, 4, 6, INK, 0.5, 0, false));
  rig.head.add(rig.part(8, -8, 8, 2, 0x8a3b2b, 0.5, 0, false));
  return rig;
}

/** 도장 (맨손 공격 1·2타). 손 기준 +y가 팔이 뻗은 쪽이다. */
export function createStamp(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, 0, 8, 9, 0x8b5a2b, 0.5, 0));
  c.add(rig.part(0, 9, 18, 7, 0xc8202f, 0.5, 0));
  return c;
}

/** 결재판 (맨손 공격 3타, 보고서 작성) */
export function createClipboard(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -4, 30, 38, 0x9a6a3a, 0.5, 0));
  c.add(rig.part(0, 2, 22, 26, 0xffffff, 0.5, 0, false));
  c.add(rig.part(0, 8, 16, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(0, 14, 16, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(0, -7, 12, 6, 0x8a8f96, 0.5, 0));
  return c;
}

export function createHeldStapler(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -2, 13, 30, 0x2d2d33, 0.5, 0));
  c.add(rig.part(0, 2, 7, 22, 0x8a93a0, 0.5, 0, false));
  return c;
}

export function createHeldNotice(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -6, 15, 62, 0xffffff, 0.5, 0));
  c.add(rig.part(0, 14, 15, 6, 0x2f6fd1, 0.5, 0, false));
  c.add(rig.part(0, 40, 9, 7, 0xd0202f, 0.5, 0, false));
  return c;
}

// ---------- 바닥 아이템·투사체 ----------

export function createHeldCard(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, 0, 14, 19, 0xffffff, 0.5, 0));
  c.add(rig.part(0, 0, 14, 5, 0x2f6fd1, 0.5, 0, false));
  return c;
}

export function createHeldBook(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -2, 24, 30, 0x1f5e45, 0.5, 0));
  c.add(rig.part(0, 8, 24, 4, 0xd9b44a, 0.5, 0, false));
  return c;
}

export function createHeldBomb(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -2, 30, 24, 0xf1e7c8, 0.5, 0));
  c.add(rig.part(0, 4, 22, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(0, 10, 22, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(10, -4, 10, 10, 0xd0202f, 0.5, 0));
  return c;
}

export function createWeaponIcon(scene: Phaser.Scene, id: WeaponId): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  switch (id) {
    case 'stapler':
      c.add(box(scene, 0, 3, 34, 10, 0x2d2d33));
      c.add(box(scene, -2, -5, 30, 7, 0x8a93a0));
      break;
    case 'notice':
      c.add(box(scene, 0, 0, 60, 16, 0xffffff));
      c.add(box(scene, -10, 0, 6, 16, 0x2f6fd1, 0.5, 0.5, false));
      c.add(box(scene, 18, 0, 8, 10, 0xd0202f, 0.5, 0.5, false));
      break;
    case 'clipboard':
      c.add(box(scene, 0, 0, 40, 30, 0x9a6a3a));
      c.add(box(scene, 0, 2, 30, 20, 0xffffff, 0.5, 0.5, false));
      c.add(box(scene, 0, -14, 14, 6, 0x8a8f96));
      break;
    case 'idcard':
      c.add(box(scene, 0, 0, 22, 30, 0xffffff));
      c.add(box(scene, 0, -10, 22, 8, 0x2f6fd1, 0.5, 0.5, false));
      c.add(box(scene, 0, 4, 10, 10, 0xf1c7a0, 0.5, 0.5, false));
      break;
    case 'rulebook':
      c.add(box(scene, 0, 0, 44, 30, 0x1f5e45));
      c.add(box(scene, 0, -4, 44, 5, 0xd9b44a, 0.5, 0.5, false));
      c.add(box(scene, 0, 8, 36, 6, 0xf4f0e0, 0.5, 0.5, false));
      break;
    case 'bomb':
      c.add(box(scene, 0, 0, 40, 26, 0xf1e7c8));
      c.add(box(scene, 0, -2, 30, 2, 0x9aa3ad, 0.5, 0.5, false));
      c.add(box(scene, 0, 4, 30, 2, 0x9aa3ad, 0.5, 0.5, false));
      c.add(box(scene, 14, -12, 12, 12, 0xd0202f));
      break;
  }
  return c;
}

export type FoodKind = 'donkatsu' | 'gimbap' | 'americano' | 'work';

/** 회복 아이템. 'work'(일거리)는 김밥처럼 생겼지만 서류 귀퉁이가 삐져나와 있다. */
export function createFoodIcon(scene: Phaser.Scene, kind: FoodKind): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  if (kind === 'donkatsu') {
    c.add(box(scene, 0, 4, 52, 12, 0xffffff));
    c.add(box(scene, 0, -2, 40, 14, 0xb8742e));
    c.add(box(scene, 10, -4, 12, 4, 0x7a3e12, 0.5, 0.5, false));
  } else if (kind === 'americano') {
    c.add(box(scene, 0, 0, 20, 28, 0xf4f4f4));
    c.add(box(scene, 0, -2, 20, 10, 0x8a5a2b, 0.5, 0.5, false));
    c.add(box(scene, 0, -16, 24, 5, 0x2b2b2b));
  } else {
    if (kind === 'work') {
      const paper = box(scene, 10, -10, 18, 22, 0xffffff);
      paper.rotation = 0.4;
      c.add(paper);
    }
    c.add(new Phaser.GameObjects.Triangle(scene, 0, 0, -18, 14, 18, 14, 0, -16, 0x2b2b2b).setStrokeStyle(2, INK));
    c.add(new Phaser.GameObjects.Triangle(scene, 0, 2, -12, 10, 12, 10, 0, -10, 0xf6f1e1));
  }
  return c;
}

/** 단대학생회 간부의 단체 서명지 */
export function createPetitionIcon(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 34, 42, 0xffffff));
  for (let i = 0; i < 4; i++) c.add(box(scene, -4, -12 + i * 8, 20, 2, 0x9aa3ad, 0.5, 0.5, false));
  for (let i = 0; i < 4; i++) c.add(box(scene, 10, -12 + i * 8, 6, 4, 0xd0202f, 0.5, 0.5, false));
  return c;
}

/** 총장실 메일 학생이 부르는 "지시 사항" 서류 / 규정집 낙하 */
export function createFallingDoc(scene: Phaser.Scene, label: string, color: number, w = 46, h = 34): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, w, h, color));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 0, label, {
      fontFamily: FONT,
      fontSize: `${Math.round(h * 0.42)}px`,
      fontStyle: 'bold',
      color: color === 0xffffff ? '#d0202f' : '#ffffff',
    }).setOrigin(0.5),
  );
  return c;
}

/** 김데시벨의 확성기 음파 */
export function createSonicWave(scene: Phaser.Scene, dir: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  for (let i = 0; i < 3; i++) {
    g.lineStyle(4 - i, 0xffd34d, 1 - i * 0.25);
    g.beginPath();
    g.arc(-dir * 10 * i, 0, 16 + i * 8, dir > 0 ? -1 : Math.PI - 1, dir > 0 ? 1 : Math.PI + 1);
    g.strokePath();
  }
  c.add(g);
  return c;
}

/** 오시위의 요구안 종이 */
export function createDemandPaper(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 22, 28, 0xffffff));
  c.add(box(scene, 0, -6, 14, 3, 0xd0202f, 0.5, 0.5, false));
  c.add(box(scene, 0, 2, 14, 2, 0x9aa3ad, 0.5, 0.5, false));
  return c;
}

/** 공지를 안 읽는 학생이 던지는 "?" 질문 */
export function createQuestionBubble(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(0, 0, 15);
  g.lineStyle(2, INK, 1);
  g.strokeCircle(0, 0, 15);
  const t = new Phaser.GameObjects.Text(scene, 0, 1, '?', {
    fontFamily: FONT,
    fontSize: '22px',
    fontStyle: 'bold',
    color: '#d0202f',
  }).setOrigin(0.5);
  c.add([g, t]);
  return c;
}

/** 김보고 처장이 던지는 "보고해!" 말풍선 */
export function createReportBubble(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const tail = box(scene, -26, 15, 10, 10, 0xffffff);
  tail.rotation = 0.8;
  c.add(tail);
  c.add(box(scene, 0, 0, 86, 30, 0xffffff));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 0, '보고해!', {
      fontFamily: FONT,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#d0202f',
    }).setOrigin(0.5),
  );
  return c;
}

// ---------- 학생 (모두 과잠 차림) ----------

export interface StudentLook {
  jacket: number;
  hair: number;
  longHair?: boolean;
  earphones?: boolean;
}

export function createStudentRig(scene: Phaser.Scene, look: StudentLook): Rig {
  const sleeve = 0xececec;
  const rig = new Rig(scene, {
    legW: 14,
    legH: 36,
    legGap: 14,
    legColor: 0x3b5a8a,
    shoeColor: 0xf2f2f2,
    torsoW: 38,
    torsoH: 38,
    torsoColor: look.jacket,
    armW: 12,
    armH: 30,
    armColor: sleeve,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: SKIN,
    outline: INK,
  });
  // 과잠: 흰 목깃, 밑단 줄, 가슴 패치, 가방끈
  rig.torso.add(rig.part(0, -38, 22, 5, sleeve, 0.5, 0, false));
  rig.torso.add(rig.part(0, -6, 38, 4, sleeve, 0.5, 0, false));
  rig.torso.add(rig.part(-8, -30, 9, 10, sleeve, 0.5, 0, false));
  rig.torso.add(rig.part(12, -37, 4, 31, 0x2b2b2b, 0.5, 0, false));

  rig.head.add(rig.part(0, -33, 34, 11, look.hair, 0.5, 0));
  if (look.longHair) rig.head.add(rig.part(-12, -26, 10, 28, look.hair, 0.5, 0));
  else rig.head.add(rig.part(-14, -25, 6, 12, look.hair, 0.5, 0, false));
  rig.head.add(rig.part(3, -18, 4, 6, INK, 0.5, 0, false));
  rig.head.add(rig.part(11, -18, 4, 6, INK, 0.5, 0, false));
  rig.head.add(rig.part(8, -8, 7, 2, 0x8a3b2b, 0.5, 0, false));
  if (look.earphones) {
    rig.head.add(rig.part(-16, -17, 6, 8, 0xffffff, 0.5, 0));
    rig.head.add(rig.part(-16, -9, 2, 14, 0xffffff, 0.5, 0, false));
  }
  return rig;
}

export type ChonghakRole = 'decibel' | 'protest' | 'sitin';

/** 총학 집행부 3명: 같은 빨간 머리띠, 역할별 소품 */
export function createChonghakRig(scene: Phaser.Scene, role: ChonghakRole): Rig {
  const jacket = role === 'decibel' ? 0x1f4e79 : role === 'protest' ? 0x5b2a86 : 0x2f5d3a;
  const rig = createStudentRig(scene, { jacket, hair: role === 'protest' ? 0x5b3a24 : 0x1f1a17, longHair: role === 'protest' });
  rig.head.add(rig.part(0, -27, 35, 5, 0xd0202f, 0.5, 0));
  if (role === 'decibel') {
    // 확성기: 손잡이 + 벌어진 나팔
    rig.itemF.add(rig.part(0, 0, 10, 12, 0x2b2b2b, 0.5, 0));
    rig.itemF.add(rig.part(0, 10, 16, 14, 0xf5f5f5, 0.5, 0));
    rig.itemF.add(rig.part(0, 22, 28, 8, 0xd0202f, 0.5, 0));
  } else if (role === 'protest') {
    // 대자보: 몸 앞을 가리는 큰 종이 (글씨 대신 빨간 줄)
    const board = new Phaser.GameObjects.Container(scene, 30, -20);
    board.add(rig.part(0, 0, 14, 72, 0xf6f1e1, 0.5, 0.5));
    board.add(rig.part(0, -22, 10, 4, 0xd0202f, 0.5, 0.5, false));
    board.add(rig.part(0, -10, 10, 4, 0xd0202f, 0.5, 0.5, false));
    board.add(rig.part(0, 2, 10, 4, 0x1d1d22, 0.5, 0.5, false));
    board.add(rig.part(0, 14, 10, 4, 0x1d1d22, 0.5, 0.5, false));
    rig.torso.add(board);
  }
  return rig;
}

// 프레지던트 캉: 총장실이 준 사진을 보고 블록형으로 옮긴 외형 (원본 사진은 레포에 넣지 않는다).
// 짙은 갈색 머리를 위로 넘긴 가르마, 짙은 눈썹, 눈웃음, 다문 미소, 안경 없음.
// 남색 정장, 흰 셔츠, 남색 물방울 넥타이, 옷깃 배지.
const PRES_SUIT = 0x1c2740;
const PRES_HAIR = 0x2a211c;
const PRES_SKIN = 0xefc29c;
const PRES_TIE = 0x22396b;

export function createPresidentRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 15,
    legH: 38,
    legGap: 15,
    legColor: PRES_SUIT,
    shoeColor: 0x111111,
    torsoW: 42,
    torsoH: 42,
    torsoColor: PRES_SUIT,
    armW: 13,
    armH: 32,
    armColor: PRES_SUIT,
    handColor: PRES_SKIN,
    headW: 34,
    headH: 33,
    headColor: PRES_SKIN,
    outline: INK,
  });
  // 셔츠·물방울 넥타이·옷깃 배지 (몸통 위쪽 끝 = -42)
  rig.torso.add(rig.part(0, -41, 14, 22, 0xffffff, 0.5, 0, false));
  rig.torso.add(rig.part(0, -40, 9, 5, PRES_TIE, 0.5, 0, false));
  rig.torso.add(rig.part(0, -36, 7, 24, PRES_TIE, 0.5, 0, false));
  for (const [dx, dy] of [[-1, -32], [2, -26], [-1, -20], [2, -15]]) {
    rig.torso.add(rig.part(dx, dy, 2, 2, 0xcfe3ff, 0.5, 0, false));
  }
  rig.torso.add(rig.part(12, -33, 4, 4, 0xd9b44a, 0.5, 0, false));
  // 은색 손목시계
  rig.armB.add(rig.part(0, 28, 13, 4, 0xc9ced4, 0.5, 0, false));
  // 머리: 위로 넘긴 앞머리 (얼굴은 +x 쪽)
  rig.head.add(rig.part(-1, -38, 36, 10, PRES_HAIR, 0.5, 0));
  rig.head.add(rig.part(8, -41, 20, 5, PRES_HAIR, 0.5, 0, false));
  rig.head.add(rig.part(-14, -29, 7, 12, PRES_HAIR, 0.5, 0, false));
  rig.head.add(rig.part(-3, -37, 3, 6, 0x4a3a30, 0.5, 0, false));
  // 짙은 눈썹, 눈웃음, 다문 미소
  rig.head.add(rig.part(4, -24, 7, 2, PRES_HAIR, 0.5, 0, false));
  rig.head.add(rig.part(14, -24, 6, 2, PRES_HAIR, 0.5, 0, false));
  rig.head.add(rig.part(4, -19, 5, 2, INK, 0.5, 0, false));
  rig.head.add(rig.part(14, -19, 4, 2, INK, 0.5, 0, false));
  rig.head.add(rig.part(16, -15, 3, 5, 0xdba982, 0.5, 0, false));
  rig.head.add(rig.part(10, -9, 10, 2, 0x8a3b2b, 0.5, 0, false));
  rig.head.add(rig.part(15, -10, 2, 2, 0x8a3b2b, 0.5, 0, false));
  rig.itemF.add(rig.part(0, 0, 12, 14, 0x8b5a2b, 0.5, 0));
  rig.itemF.add(rig.part(0, 14, 28, 12, 0xc8202f, 0.5, 0));
  return rig;
}

/** 엔딩용 큰 초상 (정면). 사진처럼 뒤 벽에 학교 로고타입, 아래는 흰 세로 판벽 */
export function createPresidentPortrait(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const flat = (bx: number, by: number, w: number, h: number, col: number) => c.add(box(scene, bx, by, w, h, col, 0.5, 0.5, false));
  c.add(box(scene, 0, 0, 190, 230, 0xfbf8f0).setStrokeStyle(6, 0xd9b44a));
  // 배경: 위는 흰 벽 + 흐린 로고타입, 아래는 세로 판벽
  flat(0, -46, 176, 130, 0xf6f4ee);
  flat(0, 64, 176, 92, 0xececea);
  for (let sx = -84; sx <= 84; sx += 10) flat(sx, 64, 2, 92, 0xd9d9d6);
  if (scene.textures.exists('hufs-wordmark')) {
    const wm = new Phaser.GameObjects.Image(scene, 0, -88, 'hufs-wordmark').setTint(0x5b4a3a).setAlpha(0.55);
    wm.setScale(150 / wm.width);
    c.add(wm);
  }
  // 정장 어깨와 옷깃
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(PRES_SUIT).fillRect(-86, 64, 172, 50);
  g.fillStyle(PRES_SUIT).fillRect(-74, 56, 148, 10);
  g.fillStyle(0xffffff).fillTriangle(-24, 54, 24, 54, 0, 104);
  g.fillStyle(0x243256).fillTriangle(-24, 54, -6, 104, -40, 76).fillTriangle(24, 54, 6, 104, 40, 76);
  g.lineStyle(2, 0x0f1626, 1).lineBetween(-24, 54, -6, 104).lineBetween(24, 54, 6, 104);
  g.fillStyle(PRES_TIE).fillRect(-8, 58, 16, 11).fillRect(-6, 69, 12, 38);
  g.fillStyle(0xcfe3ff);
  for (const [dx, dy] of [[-3, 74], [3, 80], [-3, 87], [3, 93], [-3, 100]]) g.fillRect(dx - 1, dy, 3, 3);
  g.fillStyle(0xd9b44a).fillRect(28, 70, 6, 6);
  c.add(g);
  // 목·얼굴 (턱은 계단식으로 둥글게)
  flat(0, 48, 40, 14, 0xdcae88);
  c.add(box(scene, 0, -12, 100, 104, PRES_SKIN));
  flat(0, 42, 80, 10, PRES_SKIN);
  flat(0, 49, 56, 6, PRES_SKIN);
  c.add(box(scene, -55, -10, 10, 24, PRES_SKIN));
  c.add(box(scene, 55, -10, 10, 24, PRES_SKIN));
  // 머리: 짙은 갈색, 가르마에서 위로 넘겨 앞쪽이 볼록
  c.add(box(scene, 0, -68, 110, 24, PRES_HAIR));
  c.add(box(scene, 10, -84, 82, 12, PRES_HAIR));
  flat(-30, -78, 4, 18, 0x4a3a30);
  flat(-51, -50, 10, 30, PRES_HAIR);
  flat(51, -50, 10, 30, PRES_HAIR);
  // 짙은 눈썹 (바깥쪽이 살짝 내려감)
  flat(-24, -28, 28, 7, PRES_HAIR);
  flat(-40, -24, 8, 6, PRES_HAIR);
  flat(24, -28, 28, 7, PRES_HAIR);
  flat(40, -24, 8, 6, PRES_HAIR);
  // 눈웃음: 위로 굽은 짧은 선
  flat(-24, -12, 18, 4, INK);
  flat(-24, -15, 8, 3, INK);
  flat(24, -12, 18, 4, INK);
  flat(24, -15, 8, 3, INK);
  // 코와 웃음 주름
  flat(0, 6, 12, 22, 0xe2b08a);
  flat(0, 16, 20, 6, 0xd9a47e);
  flat(-30, 22, 3, 14, 0xdba982);
  flat(30, 22, 3, 14, 0xdba982);
  // 다문 미소 (양 끝이 올라감)
  flat(0, 32, 34, 4, 0x8a3b2b);
  flat(-18, 29, 5, 4, 0x8a3b2b);
  flat(18, 29, 5, 4, 0x8a3b2b);
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 128, '프레지던트 캉', {
      fontFamily: FONT,
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#111318',
      strokeThickness: 5,
    }).setOrigin(0.5, 0),
  );
  return c;
}

// ---------- 가상 상사 (방해 요소) ----------

export type SupervisorLook = 'bogo' | 'gumto' | 'bujae' | 'molla' | 'meeting' | 'hoho';

export function createSupervisorRig(scene: Phaser.Scene, look: SupervisorLook): Rig {
  if (look !== 'bogo' && look !== 'gumto') return createOtherSupervisorRig(scene, look);
  const kind = look;
  const suit = kind === 'bogo' ? 0x2f3a56 : 0x6a5038;
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
  // 셔츠와 넥타이 (몸통 위쪽 끝 = -40)
  rig.torso.add(rig.part(0, -39, 14, 22, 0xf4f4f4, 0.5, 0, false));
  rig.torso.add(rig.part(0, -37, 6, 24, kind === 'bogo' ? 0xb3262d : 0x2f6b3a, 0.5, 0, false));

  const gray = 0xa8a8a8;
  if (kind === 'bogo') {
    rig.head.add(rig.part(0, -34, 24, 4, gray, 0.5, 0, false));
    rig.head.add(rig.part(-15, -27, 6, 14, gray, 0.5, 0, false));
    rig.head.add(rig.part(15, -27, 4, 10, gray, 0.5, 0, false));
    rig.head.add(rig.part(8, -11, 14, 3, 0x555555, 0.5, 0, false));
  } else {
    rig.head.add(rig.part(0, -35, 35, 10, gray, 0.5, 0));
    rig.head.add(rig.part(4, -21, 9, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(14, -21, 7, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(9, -8, 8, 2, 0x8a3b2b, 0.5, 0, false));
  }
  rig.head.add(rig.part(4, -19, 3, 4, INK, 0.5, 0, false));
  rig.head.add(rig.part(13, -19, 3, 4, INK, 0.5, 0, false));

  if (kind === 'bogo') {
    rig.itemF.add(rig.part(0, 0, 18, 22, 0xffffff, 0.5, 0));
  } else {
    rig.itemF.add(rig.part(0, 0, 10, 12, 0x8b5a2b, 0.5, 0));
    rig.itemF.add(rig.part(0, 12, 24, 10, 0xc8202f, 0.5, 0));
  }
  return rig;
}

/** 김부재중·최몰라 처장, 회의소집·허허실실 부총장 */
function createOtherSupervisorRig(scene: Phaser.Scene, look: 'bujae' | 'molla' | 'meeting' | 'hoho'): Rig {
  const SUITS = { bujae: 0x4a4f5c, molla: 0x5c4a3a, meeting: 0x1f2a44, hoho: 0x3d5a40 };
  const TIES = { bujae: 0xd9b44a, molla: 0x6b7280, meeting: 0x8a1f2c, hoho: 0xc2410c };
  const vice = look === 'meeting' || look === 'hoho';
  const suit = SUITS[look];
  const rig = new Rig(scene, {
    legW: 15,
    legH: 36,
    legGap: 14,
    legColor: suit,
    shoeColor: 0x141414,
    torsoW: vice ? 44 : 40,
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
  rig.torso.add(rig.part(0, -37, 6, 24, TIES[look], 0.5, 0, false));
  if (vice) rig.torso.add(rig.part(-13, -32, 6, 6, 0xd9b44a, 0.5, 0, false));
  const gray = 0xb0b0b0;
  if (look === 'bujae') {
    rig.head.add(rig.part(0, -35, 35, 10, 0x2a2420, 0.5, 0));
    rig.itemF.add(rig.part(0, 0, 10, 18, 0x1b1b1f, 0.5, 0)); // 휴대폰 (늘 통화 중)
  } else if (look === 'molla') {
    rig.head.add(rig.part(0, -35, 35, 8, gray, 0.5, 0));
    rig.head.add(rig.part(10, -31, 10, 3, INK, 0.5, 0, false)); // 찡그린 눈썹
  } else if (look === 'meeting') {
    rig.head.add(rig.part(0, -35, 35, 10, gray, 0.5, 0));
    rig.head.add(rig.part(4, -21, 9, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(14, -21, 7, 8, 0xcfe8f5, 0.5, 0));
    rig.itemF.add(rig.part(0, 0, 18, 24, 0xffffff, 0.5, 0)); // 회의 자료
  } else {
    rig.head.add(rig.part(0, -34, 26, 5, gray, 0.5, 0, false));
    rig.head.add(rig.part(-15, -27, 6, 14, gray, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 0, 16, 14, 0xf6f1e1, 0.5, 0)); // 간식 봉투
  }
  rig.head.add(rig.part(4, -19, 3, 4, INK, 0.5, 0, false));
  rig.head.add(rig.part(13, -19, 3, 4, INK, 0.5, 0, false));
  rig.head.add(rig.part(9, -8, look === 'hoho' ? 12 : 8, 2, 0x8a3b2b, 0.5, 0, false));
  return rig;
}

// ---------- 잡몹 ----------

/** "마감 1분 전 서류 뭉치" — 째깍거리다 터진다 */
export function createDocBombRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 7,
    legH: 12,
    legGap: 22,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 46,
    torsoH: 34,
    torsoColor: 0xf1e7c8,
    armW: 6,
    armH: 12,
    armColor: 0xf1e7c8,
    handColor: 0xf1e7c8,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  for (let i = 0; i < 3; i++) rig.torso.add(rig.part(-4, -26 + i * 8, 30, 2, 0x9aa3ad, 0.5, 0, false));
  rig.torso.add(rig.part(16, -40, 16, 16, 0xd0202f, 0.5, 0));
  rig.torso.add(rig.part(16, -36, 2, 7, 0xffffff, 0.5, 0, false));
  rig.torso.add(rig.part(-8, -12, 5, 6, INK, 0.5, 0, false));
  rig.torso.add(rig.part(6, -12, 5, 6, INK, 0.5, 0, false));
  return rig;
}

/** "단체 문의 줄"의 한 칸 — 다리 달린 문의 쪽지 */
export function createSlipRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 7,
    legH: 12,
    legGap: 14,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 34,
    torsoH: 40,
    torsoColor: 0xfff3b0,
    armW: 6,
    armH: 12,
    armColor: 0xfff3b0,
    handColor: 0xfff3b0,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  rig.torso.add(rig.part(0, -34, 26, 3, 0xd0202f, 0.5, 0, false));
  rig.torso.add(rig.part(-5, -20, 4, 6, INK, 0.5, 0, false));
  rig.torso.add(rig.part(6, -20, 4, 6, INK, 0.5, 0, false));
  rig.torso.add(rig.part(1, -9, 10, 2, INK, 0.5, 0, false));
  return rig;
}

/** "새벽 3시 메일" — 다리 달린 편지봉투 */
export function createMailRig(scene: Phaser.Scene): Rig {
  const paper = 0xf6f1e1;
  const rig = new Rig(scene, {
    legW: 8,
    legH: 16,
    legGap: 24,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 58,
    torsoH: 40,
    torsoColor: paper,
    armW: 7,
    armH: 14,
    armColor: paper,
    handColor: paper,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });

  const flap = new Phaser.GameObjects.Graphics(scene);
  flap.lineStyle(2, INK, 1);
  flap.beginPath();
  flap.moveTo(-28, -39);
  flap.lineTo(0, -19);
  flap.lineTo(28, -39);
  flap.strokePath();
  rig.torso.add(flap);

  rig.torso.add(rig.part(-5, -13, 6, 7, INK, 0.5, 0.5, false));
  rig.torso.add(rig.part(11, -13, 6, 7, INK, 0.5, 0.5, false));
  const browL = rig.part(-5, -20, 10, 3, INK, 0.5, 0.5, false);
  browL.rotation = 0.35;
  const browR = rig.part(11, -20, 10, 3, INK, 0.5, 0.5, false);
  browR.rotation = -0.35;
  rig.torso.add([browL, browR]);

  const mark = new Phaser.GameObjects.Arc(scene, 18, -30, 6, 0, 360, false);
  mark.isFilled = false;
  mark.setStrokeStyle(2, 0xc8202f);
  rig.torso.add(mark);
  return rig;
}

/** "울리는 전화기" — 다리 달린 유선 전화기 */
export function createPhoneRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 7,
    legH: 10,
    legGap: 26,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 46,
    torsoH: 26,
    torsoColor: 0xe9e4d4,
    armW: 0,
    armH: 0,
    armColor: 0,
    handColor: 0,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  rig.torso.add(rig.part(0, -35, 56, 11, 0xb3262d, 0.5, 0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      rig.torso.add(rig.part(-10 + j * 10, -21 + i * 6, 6, 4, 0x777777, 0.5, 0, false));
    }
  }
  rig.torso.add(rig.part(17, -20, 5, 5, 0xff4d4d, 0.5, 0, false));
  return rig;
}

/** "교수님이 된다고 했는데요" 말풍선. 글자는 뒤집히지 않게 바깥에서 따로 그린다. */
export function createBubbleRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 0,
    legH: 0,
    legGap: 0,
    legColor: 0,
    shoeColor: 0,
    torsoW: 108,
    torsoH: 42,
    torsoColor: 0xffffff,
    armW: 0,
    armH: 0,
    armColor: 0,
    handColor: 0,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  const tail = rig.part(-36, 4, 14, 14, 0xffffff, 0.5, 0.5);
  tail.rotation = 0.8;
  rig.torso.addAt(tail, 0);
  return rig;
}
