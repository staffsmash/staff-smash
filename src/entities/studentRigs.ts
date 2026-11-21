import Phaser from 'phaser';
import { FONT } from '../config';
import { HUFS_NAVY } from '../hufs';
import { Rig } from './Rig';
import { INK, box, createWeaponIcon, tone } from './rigs';
import type { WeaponId } from './weapons';

// 학생 모드 외형 모음: 무기(텀블러·장우산·전공책·학생증·마감 시계), 잡몹(행정 그 자체),
// 가상 학과장·교수·학장, 수강편람 탑, 보스 탄막 소품. 모두 코드로 그린 블록형 도형이다.

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

// ---------- 학생 모드 보스: 학과장·교수·학장 (가상 인물) ----------

/** jeonpil = 전필수 스페인어과 학과장, bujae = 김부재중 교수, hanhakgo = 한학고 영어대학 학장 */
export type DeanKind = 'jeonpil' | 'bujae' | 'hanhakgo';

const DEAN_SUIT: Record<DeanKind, number> = { jeonpil: 0x3b3550, bujae: 0x4a4f5c, hanhakgo: 0x22304f };

/**
 * 전필수 학과장(여 · 단발 · 정장, 큰 "재수강" 도장), 김부재중 교수(회색 정장 · 금색 넥타이 · 큰 결재판 — 반사),
 * 한학고 학장(남 · 나비넥타이 · 성적표 묶음). 가상 인물이다.
 * 전필수 학과장은 지금 있는 외형(넥타이 대신 흰 블라우스 깃 + 단발)으로 그렸다. 블라우스·단발 공통 외형이 생기면 그쪽으로 바꾼다.
 */
export function createDeanRig(scene: Phaser.Scene, kind: DeanKind): Rig {
  const suit = DEAN_SUIT[kind];
  const rig = new Rig(scene, {
    legW: 15,
    legH: 37,
    legGap: 15,
    legColor: suit,
    shoeColor: 0x141414,
    torsoW: kind === 'jeonpil' ? 40 : 44,
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
  if (kind === 'jeonpil') {
    // 블라우스 깃 (넥타이 없음), 단발 (턱 높이에서 끊긴 짙은 머리), 금 브로치
    rig.torso.add(rig.part(0, -40, 16, 18, 0xf8f4ec, 0.5, 0, false));
    rig.torso.add(rig.part(-5, -40, 6, 8, 0xffffff, 0.5, 0, false));
    rig.torso.add(rig.part(5, -40, 6, 8, 0xffffff, 0.5, 0, false));
    rig.torso.add(rig.part(-12, -30, 5, 5, GOLD, 0.5, 0, false));
    const hair = 0x2a2420;
    rig.head.add(rig.part(0, -36, 37, 11, hair, 0.5, 0));
    rig.head.add(rig.part(-14, -28, 10, 24, hair, 0.5, 0));
    rig.head.add(rig.part(12, -29, 16, 5, hair, 0.5, 0, false));
    rig.head.add(rig.part(9, -8, 8, 2, 0xb3262d, 0.5, 0, false));
    // 큰 "재수강" 도장
    rig.itemF.add(rig.part(0, -2, 12, 16, 0x8b5a2b, 0.5, 0));
    rig.itemF.add(rig.part(0, 12, 34, 14, RED, 0.5, 0));
  } else if (kind === 'bujae') {
    // 셔츠·금색 넥타이, 짙은 머리, 큰 결재판 (정면으로 날아온 것을 되받아친다)
    rig.torso.add(rig.part(0, -40, 14, 22, 0xf4f4f4, 0.5, 0, false));
    rig.torso.add(rig.part(0, -38, 6, 25, 0xd9b44a, 0.5, 0, false));
    rig.head.add(rig.part(0, -36, 36, 10, 0x2a2420, 0.5, 0));
    rig.head.add(rig.part(-14, -28, 7, 12, 0x2a2420, 0.5, 0, false));
    rig.head.add(rig.part(9, -8, 8, 2, 0x8a3b2b, 0.5, 0, false));
    rig.itemF.add(rig.part(0, -8, 38, 50, 0x9a6a3a, 0.5, 0));
    rig.itemF.add(rig.part(0, -2, 28, 36, 0xffffff, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 6, 20, 2, 0x9aa3ad, 0.5, 0, false));
    rig.itemF.add(rig.part(0, 14, 20, 2, 0x9aa3ad, 0.5, 0, false));
    rig.itemF.add(rig.part(0, -12, 14, 7, 0x8a8f96, 0.5, 0));
  } else {
    // 셔츠·빨간 나비넥타이, 넘긴 회색 머리, 금 배지, 성적표 묶음
    rig.torso.add(rig.part(0, -40, 14, 22, 0xf4f4f4, 0.5, 0, false));
    rig.torso.add(rig.part(-5, -38, 9, 7, 0xb3262d, 0.5, 0, false));
    rig.torso.add(rig.part(5, -38, 9, 7, 0xb3262d, 0.5, 0, false));
    rig.torso.add(rig.part(0, -38, 4, 5, 0x7a1820, 0.5, 0, false));
    rig.torso.add(rig.part(-13, -32, 6, 6, GOLD, 0.5, 0, false));
    rig.head.add(rig.part(0, -36, 36, 10, 0x8f8f96, 0.5, 0));
    rig.head.add(rig.part(-14, -28, 7, 13, 0x8f8f96, 0.5, 0, false));
    rig.head.add(rig.part(9, -8, 10, 2, 0x8a3b2b, 0.5, 0, false));
    rig.itemF.add(rig.part(0, -4, 26, 34, 0xffffff, 0.5, 0));
    rig.itemF.add(rig.part(2, -1, 26, 34, PAPER, 0.5, 0));
    rig.itemF.add(rig.part(2, -10, 18, 4, HUFS_NAVY, 0.5, 0, false));
  }
  rig.head.add(rig.part(4, -19, 3, 4, INK, 0.5, 0, false));
  rig.head.add(rig.part(13, -19, 3, 4, INK, 0.5, 0, false));
  return rig;
}

/** 전필수 학과장이 쌓는 수강편람 탑 (두꺼운 책자를 조금씩 어긋나게 쌓았다) */
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
  const rnd = new Phaser.Math.RandomDataGenerator(['catalog-tower']);
  const covers = [0x13707a, 0x1f3a6b, 0x7a1f2b];
  for (let i = 0; i < 7; i++) {
    const y = -6 - (i + 1) * 17;
    const w = rnd.between(50, 60);
    const x = rnd.between(-5, 5);
    rig.torso.add(rig.part(x, y, w, 17, covers[i % 3], 0.5, 0));
    rig.torso.add(rig.part(x + w / 2 - 5, y + 3, 6, 11, 0xf4f0e0, 0.5, 0, false));
  }
  rig.torso.add(
    new Phaser.GameObjects.Text(scene, 0, -70, '수강\n편람', {
      fontFamily: FONT,
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      align: 'center',
      stroke: '#111318',
      strokeThickness: 3,
    }).setOrigin(0.5),
  );
  return rig;
}

// ---------- 창구 중간보스(가상 행정직원) 손에 든 물건 ----------

export type WindowProp = 'chart' | 'books' | 'redpen' | 'passports' | 'tickets' | 'whistle';

export function addWindowProp(rig: Rig, prop: WindowProp): void {
  const f = rig.itemF;
  switch (prop) {
    case 'chart':
      // 김전략: 내려가는 막대그래프 판
      f.add(rig.part(0, 0, 22, 26, 0xffffff, 0.5, 0));
      f.add(rig.part(-6, 10, 4, 12, 0x2f6fd1, 0.5, 0, false));
      f.add(rig.part(0, 14, 4, 8, 0xd97706, 0.5, 0, false));
      f.add(rig.part(6, 17, 4, 5, RED, 0.5, 0, false));
      break;
    case 'books':
      // 최도서관: 책 두 권
      f.add(rig.part(0, 0, 20, 26, 0x13707a, 0.5, 0));
      f.add(rig.part(3, 4, 20, 26, 0x7a1f2b, 0.5, 0));
      f.add(rig.part(12, 6, 3, 22, 0xf4f0e0, 0.5, 0, false));
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
    case 'whistle':
      // 권학생: 총학을 부르는 호루라기
      f.add(rig.part(0, -4, 3, 18, 0x2f6fd1, 0.5, 0, false));
      f.add(rig.part(0, 12, 14, 9, 0xc9ced4, 0.5, 0));
      f.add(rig.part(5, 14, 5, 4, 0x8a8f96, 0.5, 0, false));
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

/** 전필수 학과장("재수강")·프레지던트 캉이 내리찍는 거대 도장 (Hazard 낙하물) */
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

/** 김전략이 떨어뜨리는 빨간 순위 하락 화살표 (Hazard 낙하물) */
export function createRankArrow(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(RED).fillRect(-9, -46, 18, 26);
  g.fillTriangle(-22, -22, 22, -22, 0, 4);
  g.lineStyle(2, INK, 1).strokeRect(-9, -46, 18, 26);
  g.strokeTriangle(-22, -22, 22, -22, 0, 4);
  c.add(g);
  c.add(new Phaser.GameObjects.Text(scene, 0, -34, '순위', { fontFamily: FONT, fontSize: '9px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
  return c;
}

/** 최도서관이 밀어 보내는 책수레 (원점 = 바닥 가운데) */
export function createBookCart(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, -18, 64, 8, 0x6b7280));
  c.add(box(scene, 0, -38, 64, 6, 0x6b7280));
  c.add(box(scene, -30, -28, 4, 26, 0x4b5563));
  c.add(box(scene, 30, -28, 4, 26, 0x4b5563));
  const spines = [0x7a1f2b, 0x13707a, GOLD, 0x1f3a6b, RED, 0x2f6b5a, 0x7a1f2b];
  spines.forEach((col, i) => c.add(box(scene, -24 + i * 8, -30, 7, 16, col, 0.5, 0.5, false)));
  spines.slice(0, 5).forEach((col, i) => c.add(box(scene, -18 + i * 9, -48, 8, 14, col, 0.5, 0.5, false)));
  for (const x of [-24, 24]) {
    const w = new Phaser.GameObjects.Arc(scene, x, -6, 6, 0, 360, false, 0x1d1d22);
    w.setStrokeStyle(2, 0x9aa3ad);
    c.add(w);
  }
  return c;
}

/** 한학고 학장이 떨어뜨리는 성적표 (A+ = 회복, F = 잠깐 멈춤) */
export function createGradeSheet(scene: Phaser.Scene, grade: 'A+' | 'F'): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, 0, 30, 38, 0xffffff));
  c.add(box(scene, 0, -14, 30, 7, HUFS_NAVY, 0.5, 0.5, false));
  for (const y of [-4, 1, 6]) c.add(box(scene, -6, y, 12, 2, 0x9aa3ad, 0.5, 0.5, false));
  c.add(
    new Phaser.GameObjects.Text(scene, 7, 6, grade, {
      fontFamily: FONT,
      fontSize: grade === 'F' ? '18px' : '14px',
      fontStyle: 'bold',
      color: grade === 'F' ? '#d0202f' : '#1d7a3a',
    }).setOrigin(0.5),
  );
  return c;
}

/** 프레지던트 캉의 학위 수여: 부메랑처럼 날아갔다 돌아오는 학사모 */
export function createCapIcon(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = new Phaser.GameObjects.Graphics(scene);
  g.fillStyle(0x1d1d22).fillPoints(
    [new Phaser.Math.Vector2(-26, -4), new Phaser.Math.Vector2(0, -14), new Phaser.Math.Vector2(26, -4), new Phaser.Math.Vector2(0, 6)],
    true,
  );
  g.fillStyle(0x2b2b30).fillRect(-12, 0, 24, 10);
  g.lineStyle(2, GOLD, 1).lineBetween(0, -4, 18, 4);
  g.fillStyle(GOLD).fillRect(16, 4, 4, 10);
  c.add(g);
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
