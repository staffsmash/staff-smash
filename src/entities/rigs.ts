import Phaser from 'phaser';
import { FONT } from '../config';
import { Rig } from './Rig';
import type { WeaponId } from './weapons';

// 캐릭터·소품 외형 모음. 모두 코드로 그린 블록형 도형이다 (외부 에셋 없음).

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

/** 주무관 (교직원 모드 주인공). M2에서 행정직원 6명 외형으로 나눈다. */
export function createStaffRig(scene: Phaser.Scene): Rig {
  const shirt = 0x9cc3e6;
  const rig = new Rig(scene, {
    legW: 14,
    legH: 36,
    legGap: 14,
    legColor: 0x2d3b63,
    shoeColor: 0x1b1b1f,
    torsoW: 36,
    torsoH: 38,
    torsoColor: shirt,
    armW: 11,
    armH: 30,
    armColor: shirt,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: SKIN,
    outline: INK,
  });

  // 넥타이와 사원증 (torso 컨테이너 원점 = 허리, 몸통 위쪽 끝 = -38)
  rig.torso.add(rig.part(-2, -37, 6, 24, 0x24365e, 0.5, 0, false));
  rig.torso.add(rig.part(9, -37, 2, 18, 0x2f6fd1, 0.5, 0, false));
  rig.torso.add(rig.part(9, -20, 11, 14, 0xffffff, 0.5, 0));
  rig.torso.add(rig.part(9, -20, 11, 4, 0x2f6fd1, 0.5, 0, false));

  // 머리 (head 컨테이너 원점 = 목, 머리 위쪽 끝 = -31)
  const hair = 0x2a2420;
  rig.head.add(rig.part(0, -33, 34, 10, hair, 0.5, 0));
  rig.head.add(rig.part(-14, -25, 6, 12, hair, 0.5, 0, false));
  rig.head.add(rig.part(3, -18, 4, 6, INK, 0.5, 0, false));
  rig.head.add(rig.part(11, -18, 4, 6, INK, 0.5, 0, false));
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

export function createWeaponIcon(scene: Phaser.Scene, id: WeaponId): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  if (id === 'stapler') {
    c.add(box(scene, 0, 3, 34, 10, 0x2d2d33));
    c.add(box(scene, -2, -5, 30, 7, 0x8a93a0));
  } else {
    c.add(box(scene, 0, 0, 60, 16, 0xffffff));
    c.add(box(scene, -10, 0, 6, 16, 0x2f6fd1, 0.5, 0.5, false));
    c.add(box(scene, 18, 0, 8, 10, 0xd0202f, 0.5, 0.5, false));
  }
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

// ---------- 가상 상사 (방해 요소) ----------

export function createSupervisorRig(scene: Phaser.Scene, kind: 'bogo' | 'gumto'): Rig {
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

// ---------- 잡몹 ----------

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
