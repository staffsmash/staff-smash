import Phaser from 'phaser';
import { FONT } from '../config';
import { HUFS_NAVY } from '../hufs';
import { Rig } from './Rig';
import { INK, box, createWeaponIcon, tone } from './rigs';
import type { WeaponId } from './weapons';

// 학생 모드 외형 모음: 무기(텀블러·장우산·전공책·학생증·마감 시계), 잡몹(행정 그 자체),
// 가상 처장·부총장, 서류 탑, 보스 탄막 소품. 모두 코드로 그린 블록형 도형이다.

const PAPER = 0xf6f1e1;
const RED = 0xc8202f;
const GOLD = 0xd9b44a;

// ---------- 무기: 바닥·날아가는 모양 ----------

/** 학생 모드 무기 아이콘 (바닥에 놓인 것, 던져서 날아가는 것) */
export function createStudentWeaponIcon(scene: Phaser.Scene, id: WeaponId): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  switch (id) {
    case 'stapler': // 텀블러
      c.add(box(scene, 0, 3, 18, 30, 0xc9ced4));
      c.add(box(scene, 0, 5, 18, 7, 0x2f6fd1, 0.5, 0.5, false));
      c.add(box(scene, 0, -15, 20, 7, 0x2b2b30));
      c.add(box(scene, -5, 2, 3, 22, 0xffffff, 0.5, 0.5, false).setAlpha(0.6));
      break;
    case 'notice': // 장우산 (접은 것)
      c.add(box(scene, 2, 0, 58, 12, 0x1f3a6b));
      c.add(box(scene, 36, 0, 12, 4, 0x9aa3ad));
      c.add(box(scene, 8, 0, 4, 14, 0x15213f, 0.5, 0.5, false));
      c.add(box(scene, -32, 0, 10, 6, 0x6b4a2a));
      c.add(box(scene, -38, 5, 4, 12, 0x6b4a2a));
      break;
    case 'clipboard': // 두꺼운 전공책
      c.add(box(scene, 0, 0, 44, 26, 0xf4f0e0));
      c.add(box(scene, 0, -12, 46, 6, 0x7a1f2b));
      c.add(box(scene, 0, 12, 46, 6, 0x7a1f2b));
      c.add(box(scene, -21, 0, 6, 28, 0x5a1520));
      for (const y of [-5, 0, 5]) c.add(box(scene, 3, y, 36, 1, 0xc9c1ab, 0.5, 0.5, false));
      break;
    case 'idcard': // 학생증
      c.add(box(scene, 0, 0, 22, 30, 0xffffff));
      c.add(box(scene, 0, -10, 22, 8, HUFS_NAVY, 0.5, 0.5, false));
      c.add(box(scene, -4, 3, 9, 11, 0xf1c7a0, 0.5, 0.5, false));
      c.add(box(scene, 6, 2, 6, 2, 0x9aa3ad, 0.5, 0.5, false));
      c.add(box(scene, 6, 7, 6, 2, 0x9aa3ad, 0.5, 0.5, false));
      break;
    case 'bomb': // 마감 시계 (자명종)
      addAlarmClock(scene, c, 1);
      break;
    default:
      c.destroy();
      return createWeaponIcon(scene, id);
  }
  return c;
}

/** 모드에 맞는 무기 아이콘 */
export function weaponIcon(scene: Phaser.Scene, id: WeaponId, student: boolean): Phaser.GameObjects.Container {
  return student ? createStudentWeaponIcon(scene, id) : createWeaponIcon(scene, id);
}

function addAlarmClock(scene: Phaser.Scene, c: Phaser.GameObjects.Container, s: number): void {
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(GOLD).fillCircle(-9 * s, -12 * s, 6 * s).fillCircle(9 * s, -12 * s, 6 * s);
  g.fillStyle(0x1d1d22).fillRect(-12 * s, 12 * s, 4 * s, 6 * s).fillRect(8 * s, 12 * s, 4 * s, 6 * s);
  g.fillStyle(RED).fillCircle(0, 0, 15 * s);
  g.lineStyle(2, INK, 1).strokeCircle(0, 0, 15 * s);
  g.fillStyle(0xffffff).fillCircle(0, 0, 11 * s);
  g.lineStyle(2 * s, INK, 1).lineBetween(0, 0, 0, -8 * s).lineBetween(0, 0, 6 * s, 2 * s);
  c.add(g);
}

// ---------- 무기: 손에 든 모양 (손 기준 +y가 팔이 뻗은 쪽) ----------

export function createHeldTumbler(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -4, 16, 30, 0xc9ced4, 0.5, 0));
  c.add(rig.part(0, 6, 16, 7, 0x2f6fd1, 0.5, 0, false));
  c.add(rig.part(0, 24, 18, 6, 0x2b2b30, 0.5, 0));
  return c;
}

export function createHeldUmbrella(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -12, 6, 14, 0x6b4a2a, 0.5, 0));
  c.add(rig.part(-5, -14, 10, 4, 0x6b4a2a, 0.5, 0, false));
  c.add(rig.part(0, 2, 14, 54, 0x1f3a6b, 0.5, 0));
  c.add(rig.part(0, 24, 16, 4, 0x15213f, 0.5, 0, false));
  c.add(rig.part(0, 56, 4, 10, 0x9aa3ad, 0.5, 0));
  return c;
}

export function createHeldMajorBook(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -6, 32, 40, 0x7a1f2b, 0.5, 0));
  c.add(rig.part(4, -2, 26, 32, 0xf4f0e0, 0.5, 0, false));
  c.add(rig.part(-13, -6, 6, 40, 0x5a1520, 0.5, 0, false));
  c.add(rig.part(4, 6, 26, 4, GOLD, 0.5, 0, false));
  return c;
}

export function createHeldStudentId(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, 0, 14, 19, 0xffffff, 0.5, 0));
  c.add(rig.part(0, 0, 14, 5, HUFS_NAVY, 0.5, 0, false));
  c.add(rig.part(-2, 7, 5, 7, 0xf1c7a0, 0.5, 0, false));
  return c;
}

export function createHeldClock(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(-8, -4, 8, 6, GOLD, 0.5, 0));
  c.add(rig.part(8, -4, 8, 6, GOLD, 0.5, 0));
  c.add(rig.part(0, 0, 28, 26, RED, 0.5, 0));
  c.add(rig.part(0, 4, 20, 18, 0xffffff, 0.5, 0, false));
  c.add(rig.part(0, 6, 2, 8, INK, 0.5, 0, false));
  return c;
}

/** 3타 "가방 휘두르기": 끈을 잡고 휘두르는 백팩 */
export function createHeldBag(scene: Phaser.Scene, rig: Rig, color: number): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -2, 4, 14, tone(color, 0.75), 0.5, 0, false));
  c.add(rig.part(0, 10, 24, 30, color, 0.5, 0));
  c.add(rig.part(0, 26, 16, 10, tone(color, 0.8), 0.5, 0));
  c.add(rig.part(0, 10, 24, 4, tone(color, 0.7), 0.5, 0, false));
  return c;
}

// ---------- 잡몹: 행정 그 자체 ----------

const NO_LIMBS = { armW: 0, armH: 0, armColor: 0, handColor: 0, headW: 0, headH: 0, headColor: 0, outline: INK };

/** "반려 서류" — 빨간 반려 도장이 찍힌 서류 (도장 글자는 뒤집히지 않게 MailEnemy가 따로 그린다) */
export function createRejectDocRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 8,
    legH: 16,
    legGap: 22,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 46,
    torsoH: 52,
    torsoColor: PAPER,
    armW: 7,
    armH: 14,
    armColor: PAPER,
    handColor: PAPER,
  });
  // 접힌 귀퉁이, 글줄
  rig.torso.add(rig.part(16, -52, 14, 12, 0xe2dccb, 0.5, 0));
  for (let i = 0; i < 3; i++) rig.torso.add(rig.part(-6, -44 + i * 6, 26, 2, 0x9aa3ad, 0.5, 0, false));
  // 화난 눈
  rig.torso.add(rig.part(-9, -14, 6, 7, INK, 0.5, 0.5, false));
  rig.torso.add(rig.part(7, -14, 6, 7, INK, 0.5, 0.5, false));
  const bl = rig.part(-9, -21, 10, 3, INK, 0.5, 0.5, false);
  bl.rotation = 0.35;
  const br = rig.part(7, -21, 10, 3, INK, 0.5, 0.5, false);
  br.rotation = -0.35;
  rig.torso.add([bl, br]);
  return rig;
}

/** "결석 도장" — 나무 손잡이에 빨간 인주 바닥 */
export function createAbsenceStampRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 7,
    legH: 10,
    legGap: 26,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 46,
    torsoH: 24,
    torsoColor: 0x9a6a3a,
  });
  rig.torso.add(rig.part(0, -6, 52, 7, RED, 0.5, 0));
  rig.torso.add(rig.part(0, -40, 16, 18, 0x8b5a2b, 0.5, 0));
  rig.torso.add(rig.part(0, -50, 26, 12, 0x7a4a22, 0.5, 0));
  rig.torso.add(rig.part(-8, -18, 5, 6, INK, 0.5, 0, false));
  rig.torso.add(rig.part(8, -18, 5, 6, INK, 0.5, 0, false));
  rig.torso.add(rig.part(0, -11, 10, 2, INK, 0.5, 0, false));
  return rig;
}

/** "휴강 공지 봇" — 안테나 달린 알림 말풍선 (글자는 BubbleEnemy가 따로 그린다) */
export function createCancelBotRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 0,
    legH: 0,
    legGap: 0,
    legColor: 0,
    shoeColor: 0,
    torsoW: 108,
    torsoH: 42,
    torsoColor: 0xfff7e0,
  });
  const tail = rig.part(-36, 4, 14, 14, 0xfff7e0, 0.5, 0.5);
  tail.rotation = 0.8;
  rig.torso.addAt(tail, 0);
  rig.torso.add(rig.part(0, -42, 108, 6, 0xf59e0b, 0.5, 0, false));
  rig.torso.add(rig.part(30, -54, 3, 12, 0x6b7280, 0.5, 0, false));
  rig.torso.add(rig.part(30, -58, 8, 6, 0xd0202f, 0.5, 0));
  return rig;
}

/** "마감 시계" — 다리 달린 자명종 */
export function createAlarmClockRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 7,
    legH: 12,
    legGap: 22,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 42,
    torsoH: 38,
    torsoColor: RED,
    armW: 6,
    armH: 12,
    armColor: RED,
    handColor: RED,
  });
  rig.torso.add(rig.part(-13, -46, 14, 9, GOLD, 0.5, 0));
  rig.torso.add(rig.part(13, -46, 14, 9, GOLD, 0.5, 0));
  rig.torso.add(rig.part(0, -33, 30, 26, 0xffffff, 0.5, 0));
  rig.torso.add(rig.part(0, -31, 2, 11, INK, 0.5, 0, false));
  rig.torso.add(rig.part(5, -21, 9, 2, INK, 0.5, 0, false));
  rig.torso.add(rig.part(-7, -16, 4, 4, INK, 0.5, 0, false));
  rig.torso.add(rig.part(7, -16, 4, 4, INK, 0.5, 0, false));
  return rig;
}

/** "대기번호표" — 다리 달린 번호표 (번호는 QueueSlip이 따로 쓴다) */
export function createTicketRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 7,
    legH: 12,
    legGap: 14,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 34,
    torsoH: 44,
    torsoColor: 0xffffff,
    armW: 6,
    armH: 12,
    armColor: 0xffffff,
    handColor: 0xffffff,
  });
  for (let x = -14; x <= 14; x += 6) rig.torso.add(rig.part(x, -44, 3, 3, 0x9aa3ad, 0.5, 0, false));
  rig.torso.add(rig.part(0, -38, 30, 6, HUFS_NAVY, 0.5, 0, false));
  rig.torso.add(rig.part(-6, -12, 4, 5, INK, 0.5, 0, false));
  rig.torso.add(rig.part(6, -12, 4, 5, INK, 0.5, 0, false));
  return rig;
}

// ---------- 가상 처장·부총장 (학생 모드 보스) ----------

export type DeanKind = 'banryeo' | 'bansa';

/** 박반려 서류반려처장(큰 반려 도장), 반사반사 결재부총장(큰 결재판). 가상 인물이다. */
export function createDeanRig(scene: Phaser.Scene, kind: DeanKind): Rig {
  const suit = kind === 'banryeo' ? 0x4a4440 : 0x22304f;
  const rig = new Rig(scene, {
    legW: 15,
    legH: 37,
    legGap: 15,
    legColor: suit,
    shoeColor: 0x141414,
    torsoW: kind === 'bansa' ? 44 : 42,
    torsoH: 41,
    torsoColor: suit,
    armW: 13,
    armH: 31,
    armColor: suit,
    handColor: 0xf1c7a0,
    headW: 33,
    headH: 32,
    headColor: 0xf1c7a0,
    outline: INK,
  });
  rig.torso.add(rig.part(0, -40, 14, 22, 0xf4f4f4, 0.5, 0, false));
  rig.torso.add(rig.part(0, -38, 6, 25, kind === 'banryeo' ? 0xb3262d : 0x5b2a86, 0.5, 0, false));
  const gray = 0xb3b3b3;
  if (kind === 'banryeo') {
    // 벗어진 이마, 옆머리, 돋보기 안경, 굳게 다문 입
    rig.head.add(rig.part(-14, -28, 7, 16, gray, 0.5, 0, false));
    rig.head.add(rig.part(0, -35, 18, 4, gray, 0.5, 0, false));
    rig.head.add(rig.part(5, -21, 10, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(15, -21, 8, 8, 0xcfe8f5, 0.5, 0));
    rig.head.add(rig.part(10, -9, 12, 2, 0x5a2a20, 0.5, 0, false));
    // 큰 반려 도장
    rig.itemF.add(rig.part(0, -2, 12, 16, 0x8b5a2b, 0.5, 0));
    rig.itemF.add(rig.part(0, 12, 34, 14, RED, 0.5, 0));
  } else {
    // 넘긴 짙은 회색 머리, 금배지, 큰 결재판
    rig.head.add(rig.part(0, -36, 36, 10, 0x4b4b52, 0.5, 0));
    rig.head.add(rig.part(-14, -28, 7, 13, 0x4b4b52, 0.5, 0, false));
    rig.head.add(rig.part(9, -8, 10, 2, 0x8a3b2b, 0.5, 0, false));
    rig.torso.add(rig.part(-13, -32, 6, 6, GOLD, 0.5, 0, false));
    rig.itemF.add(rig.part(0, -8, 38, 50, 0x9a6a3a, 0.5, 0));
    rig.itemF.add(rig.part(0, -2, 28, 36, 0xffffff, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 6, 20, 2, 0x9aa3ad, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 14, 20, 2, 0x9aa3ad, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 24, 14, 6, RED, 0.5, 0, false));
    rig.itemF.add(rig.part(0, -12, 14, 7, 0x8a8f96, 0.5, 0));
  }
  rig.head.add(rig.part(4, -19, 3, 4, INK, 0.5, 0, false));
  rig.head.add(rig.part(13, -19, 3, 4, INK, 0.5, 0, false));
  return rig;
}

/** 박반려 처장이 쌓는 서류 탑 */
export function createDocTowerRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    ...NO_LIMBS,
    legW: 0,
    legH: 0,
    legGap: 0,
    legColor: 0,
    shoeColor: 0,
    torsoW: 58,
    torsoH: 6,
    torsoColor: 0x8a8f96,
  });
  const rnd = new Phaser.Math.RandomDataGenerator(['doc-tower']);
  for (let i = 0; i < 15; i++) {
    const y = -6 - (i + 1) * 8;
    const w = rnd.between(48, 60);
    rig.torso.add(rig.part(rnd.between(-5, 5), y, w, 8, i % 2 ? PAPER : 0xffffff, 0.5, 0));
    if (i % 4 === 1) rig.torso.add(rig.part(rnd.between(-14, 14), y + 1, 12, 6, RED, 0.5, 0, false));
  }
  return rig;
}

// ---------- 창구 중간보스(가상 행정직원) 손에 든 물건 ----------

export type WindowProp = 'flashlight' | 'ladle' | 'redpen' | 'passports' | 'tickets' | 'coins';

export function addWindowProp(rig: Rig, prop: WindowProp): void {
  const f = rig.itemF;
  switch (prop) {
    case 'flashlight':
      f.add(rig.part(0, -2, 10, 20, 0x2b2b30, 0.5, 0));
      f.add(rig.part(0, 16, 14, 7, 0xffe066, 0.5, 0));
      break;
    case 'ladle':
      f.add(rig.part(0, -6, 4, 40, 0xc9ced4, 0.5, 0));
      f.add(rig.part(0, 32, 20, 10, 0xc9ced4, 0.5, 0));
      f.add(rig.part(0, 34, 14, 4, 0xd08a3a, 0.5, 0, false));
      break;
    case 'redpen':
      f.add(rig.part(0, -4, 7, 28, 0xd0202f, 0.5, 0));
      f.add(rig.part(0, 24, 4, 7, INK, 0.5, 0));
      break;
    case 'passports':
      f.add(rig.part(0, 0, 18, 24, 0x1f3a6b, 0.5, 0));
      f.add(rig.part(4, 3, 18, 24, 0x7a1f2b, 0.5, 0));
      f.add(rig.part(4, 10, 6, 6, GOLD, 0.5, 0, false));
      break;
    case 'tickets':
      f.add(rig.part(0, -2, 22, 22, 0xe5e7eb, 0.5, 0));
      f.add(rig.part(0, 18, 12, 12, 0xffffff, 0.5, 0));
      f.add(rig.part(0, 4, 12, 4, HUFS_NAVY, 0.5, 0, false));
      break;
    case 'coins':
      f.add(rig.part(0, 0, 22, 22, GOLD, 0.5, 0));
      f.add(rig.part(0, -2, 12, 5, 0x8a5a1c, 0.5, 0, false));
      break;
  }
}

// ---------- 도서 무인 대출기·수강편람 (학생 모드: 무기·먹을 것을 얻는 곳) ----------

/** "도서 무인 대출기": 남색 기계, 위쪽 화면, 카드 리더, 책이 나오는 구멍, 유리창 안의 책등 (원점 = 바닥 가운데).
 *  화면은 getByName('screen')으로 찾아 대여할 때 깜빡인다. */
export function createKiosk(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, -42, 66, 84, HUFS_NAVY));
  // 유리창 안의 책등
  c.add(box(scene, 0, -24, 50, 26, 0xcfe3f2));
  const spines = [0x7a1f2b, 0x13707a, GOLD, 0x1f3a6b, RED, 0x2f6b5a];
  spines.forEach((col, i) => c.add(box(scene, -20 + i * 8, -22, 6, 20, col, 0.5, 0.5, false)));
  // 책이 나오는 구멍, 카드 리더
  c.add(box(scene, -6, -54, 40, 8, 0x111827));
  c.add(box(scene, 24, -70, 10, 8, 0x374151));
  c.add(box(scene, 24, -70, 6, 2, 0x5bd16b, 0.5, 0.5, false));
  // 위쪽 화면 몸체와 화면 (책 그림)
  c.add(box(scene, 0, -104, 72, 46, 0xe5e7eb));
  const screen = box(scene, 0, -106, 54, 32, 0x9fd3ff).setName('screen');
  c.add(screen);
  c.add(box(scene, -7, -106, 12, 16, 0xffffff, 0.5, 0.5, false));
  c.add(box(scene, 7, -106, 12, 16, 0xffffff, 0.5, 0.5, false));
  c.add(box(scene, 0, -106, 2, 16, 0x1f3a6b, 0.5, 0.5, false));
  return c;
}

/** 학생 모드 상자 "수강편람": 두꺼운 책자 세 권을 쌓은 더미 (원점 = 바닥 가운데) */
export function createCatalogStack(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const books: [number, number, number, number][] = [
    [0, -9, 64, 0x13707a],
    [-3, -27, 60, 0x1f3a6b],
    [2, -45, 62, 0x7a1f2b],
  ];
  for (const [x, y, w, col] of books) {
    c.add(box(scene, x, y, w, 18, col));
    c.add(box(scene, x + w / 2 - 5, y, 6, 12, 0xf4f0e0, 0.5, 0.5, false));
  }
  c.add(
    new Phaser.GameObjects.Text(scene, -2, -45, '수강편람', {
      fontFamily: FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5),
  );
  return c;
}

// ---------- 투사체·낙하물 ----------

/** 박반려·프레지던트 캉이 내리찍는 거대 도장 (Hazard 낙하물) */
export function createBigStamp(scene: Phaser.Scene, label: string, w = 96): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const h = Math.round(w * 0.3);
  c.add(box(scene, 0, -h - 22, w * 0.22, 30, 0x8b5a2b));
  c.add(box(scene, 0, -h - 40, w * 0.4, 14, 0x7a4a22));
  c.add(box(scene, 0, -h / 2, w, h, RED));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, -h / 2, label, {
      fontFamily: FONT,
      fontSize: `${Math.round(h * 0.62)}px`,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5),
  );
  return c;
}

/** 김국제가 부채꼴로 던지는 여권·서류 */
export function createPassportIcon(scene: Phaser.Scene, doc: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  if (doc) {
    c.add(box(scene, 0, 0, 22, 28, 0xffffff));
    c.add(box(scene, 0, -9, 22, 6, 0x2f6fd1, 0.5, 0.5, false));
    c.add(box(scene, 0, 3, 14, 2, 0x9aa3ad, 0.5, 0.5, false));
    c.add(box(scene, 0, 8, 14, 2, 0x9aa3ad, 0.5, 0.5, false));
  } else {
    c.add(box(scene, 0, 0, 20, 26, 0x1f3a6b));
    c.add(box(scene, 0, -2, 8, 8, GOLD, 0.5, 0.5, false));
    c.add(box(scene, 0, 8, 12, 2, GOLD, 0.5, 0.5, false));
  }
  return c;
}

const ERRORS = ['503', 'ERROR', '접속 대기', '404', '새로고침'];

/** 수강신청 서버 폭주: 떨어지는 오류 창 */
export function createErrorWindow(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 64, 42, 0xffffff));
  c.add(box(scene, 0, -16, 64, 10, 0x3b6db3, 0.5, 0.5, false));
  c.add(box(scene, 26, -16, 10, 8, 0xd0202f, 0.5, 0.5, false));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 4, ERRORS[Math.floor(Math.random() * ERRORS.length)], {
      fontFamily: FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#d0202f',
    }).setOrigin(0.5),
  );
  return c;
}

/** 수강신청 서버 폭주: 옆으로 날아오는 패킷 */
export function createPacket(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 34, 16, 0x22c55e));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, 0, '0101', {
      fontFamily: 'monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#0b3d1d',
    }).setOrigin(0.5),
  );
  return c;
}

/** 최장학이 뿌리는 동전 (미끼) */
export function createCoin(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(0xf5c542).fillCircle(0, 0, 10);
  g.lineStyle(2, 0x8a5a1c, 1).strokeCircle(0, 0, 10);
  g.lineStyle(1, 0xb7862b, 1).strokeCircle(0, 0, 6);
  c.add(g);
  return c;
}

/** 러시아어 주문 "ЗАЧЁТ!": 위에서 떨어지는 글자 */
export function createZachetDrop(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  [...'ЗАЧЁТ'].forEach((ch, i) => {
    const t = new Phaser.GameObjects.Text(scene, (i - 2) * 30, (i % 2) * -8, ch, {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '38px',
      fontStyle: 'bold',
      color: i % 2 ? '#ffffff' : '#ffd34d',
      stroke: '#5b21b6',
      strokeThickness: 6,
    }).setOrigin(0.5, 1);
    t.rotation = (i - 2) * 0.06;
    c.add(t);
  });
  return c;
}

/** 쓰러진 사람 머리 위를 도는 별 (다치지 않는다 — 어지러울 뿐) */
export function createDizzyStars(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  for (let i = 0; i < 3; i++) {
    c.add(
      new Phaser.GameObjects.Text(scene, 0, 0, '★', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#ffe066',
        stroke: '#111318',
        strokeThickness: 3,
      }).setOrigin(0.5),
    );
  }
  return c;
}

/** 별 위치를 돌린다 */
export function spinStars(stars: Phaser.GameObjects.Container, x: number, y: number, t: number, depth: number): void {
  stars.setPosition(x, y).setDepth(depth);
  stars.list.forEach((o, i) => {
    const a = t * 5 + (i * Math.PI * 2) / 3;
    (o as Phaser.GameObjects.Text).setPosition(Math.cos(a) * 22, Math.sin(a) * 6);
  });
}
