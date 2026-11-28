import Phaser from 'phaser';
import { FONT } from '../config';
import { HEROES, type StaffLook } from '../data/heroes';
import { studentByName, type StudentHeroLook } from '../data/students';
import { Rig } from './Rig';
import type { WeaponId } from './weapons';

// 캐릭터·소품 외형 모음. 모두 코드로 그린 블록형 도형이다 (프레지던트 캉 초상 배경의 학교 로고타입만 이미지).

export const INK = 0x1d1d22;
export const SKIN = 0xf1c7a0;

/** 리그 밖에서 쓰는 사각 조각 (아이콘·투사체용) */
export function box(
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

// ---------- 머리·목 (2026-11-21 11차: 남녀 외형 공통 부품) ----------
// 다른 리그(상사·보스 등)도 그대로 쓸 수 있게 내보낸다. 머리 컨테이너 원점 = 목, 머리 위쪽 끝 = -31, 얼굴은 +x 쪽.

/** 머리 모양: short = 짧은 머리(옆머리 조금), long = 긴 머리, bob = 단발, ponytail = 묶은 머리, crew = 짧은 스포츠머리, none = 머리를 그리지 않음(모자 등) */
export type HairStyle2D = 'short' | 'long' | 'bob' | 'ponytail' | 'crew' | 'none';
/** 안경: plain = 평범한 안경, horn = 뿔테(굵은 검은 테), silver = 은테(가는 밝은 테), sun = 선글라스 */
export type Glasses2D = 'plain' | 'horn' | 'silver' | 'sun';

export interface HeadLook2D {
  hair: number;
  style: HairStyle2D;
  /** 여성 얼굴: 속눈썹·붉은 입술·볼터치, 앞머리 */
  female?: boolean;
  /** 앞머리 (학생 주인공은 늘) */
  bangs?: boolean;
  glasses?: Glasses2D;
  /** 머리띠 색 (글자가 있으면 기본 흰색) */
  headbandColor?: number;
  /** 머리띠 글자 (나진취 "취업률 100%") */
  headband?: string;
  earphones?: boolean;
}

/** 리본·스카프 등 목에 두르는 것: tie = 넥타이, ribbon = 리본(블라우스), scarf = 스카프, none = 없음 */
export type Neck2D = 'tie' | 'ribbon' | 'scarf' | 'none';

const LIP = 0xc0485a;
const BLUSH = 0xf3a7a0;

/** 머리카락·얼굴·안경·머리띠를 그린다 (머리 상자는 Rig가 이미 그렸다) */
export function dressHead(rig: Rig, o: HeadLook2D): void {
  const H = rig.head;
  const hair = o.hair;
  // 뒷머리 (머리 상자 위에 겹쳐 뒤쪽 절반을 덮는다)
  if (o.style === 'long') H.add(rig.part(-12, -27, 11, 31, hair, 0.5, 0));
  else if (o.style === 'bob') H.add(rig.part(-10, -28, 15, 23, hair, 0.5, 0));
  else if (o.style === 'ponytail') {
    // 뒤통수에서 아래로 늘어진 꼬리 + 머리끈
    H.add(rig.part(-20, -27, 8, 20, hair, 0.5, 0));
    H.add(rig.part(-17, -28, 5, 5, 0x2f6fd1, 0.5, 0, false));
  }
  // 윗머리
  if (o.style === 'crew') {
    H.add(rig.part(0, -33, 33, 6, hair, 0.5, 0));
    H.add(rig.part(-14, -28, 5, 7, hair, 0.5, 0, false));
  } else if (o.style !== 'none') {
    H.add(rig.part(0, -33, 34, 10, hair, 0.5, 0));
    if (o.style === 'short') H.add(rig.part(-14, -25, 6, 12, hair, 0.5, 0, false));
    if (o.style === 'ponytail') H.add(rig.part(-13, -26, 6, 8, hair, 0.5, 0, false));
  }
  if (o.style !== 'none' && o.style !== 'crew' && (o.bangs || o.female)) H.add(rig.part(10, -26, 14, 4, hair, 0.5, 0, false));
  // 머리띠 (앞머리 위, 이마)
  if (o.headband) {
    // 글자 띠: 작은 화면(960×540)에서도 읽히게 머리보다 넓은 띠에 큰 글씨 (매듭 끝이 뒤로 삐친다)
    H.add(rig.part(-24, -26, 6, 9, o.headbandColor ?? 0xffffff, 0.5, 0));
    H.add(rig.part(3, -31, 50, 11, o.headbandColor ?? 0xffffff, 0.5, 0));
    H.add(rig.text(3, -25.5, o.headband, '#d0202f', 9, 47, FONT));
  } else if (o.headbandColor !== undefined) {
    H.add(rig.part(0, -28, 35, 6, o.headbandColor, 0.5, 0));
  }
  const g = o.glasses;
  // 안경테 (선글라스가 아니면 눈보다 먼저: 눈이 렌즈 너머로 보인다)
  if (g === 'plain') {
    H.add(rig.part(4, -21, 9, 8, 0xcfe8f5, 0.5, 0));
    H.add(rig.part(13, -21, 8, 8, 0xcfe8f5, 0.5, 0));
  } else if (g === 'horn') {
    H.add(rig.part(4, -22, 10, 10, INK, 0.5, 0, false));
    H.add(rig.part(13, -22, 9, 10, INK, 0.5, 0, false));
    H.add(rig.part(4, -20, 6, 6, 0xcfe8f5, 0.5, 0, false));
    H.add(rig.part(13, -20, 5, 6, 0xcfe8f5, 0.5, 0, false));
    H.add(rig.part(-4, -20, 8, 2, INK, 0.5, 0, false));
  } else if (g === 'silver') {
    for (const [x, w] of [
      [4, 9],
      [13, 8],
    ]) {
      H.add(rig.part(x, -21, w, 8, 0xe8f3f8, 0.5, 0, false).setStrokeStyle(1.5, 0x8d97a3));
    }
    H.add(rig.part(-4, -19, 8, 1.5, 0x8d97a3, 0.5, 0, false));
  }
  // 눈·입
  H.add(rig.part(4, -19, 4, 6, INK, 0.5, 0, false));
  H.add(rig.part(12, -19, 4, 6, INK, 0.5, 0, false));
  if (o.female) {
    // 속눈썹(눈 위 바깥쪽으로 삐친 선), 붉은 입술, 볼터치
    H.add(rig.part(5, -21, 6, 2, INK, 0.5, 0, false));
    H.add(rig.part(13, -21, 6, 2, INK, 0.5, 0, false));
    H.add(rig.part(10, -11, 5, 3, BLUSH, 0.5, 0, false));
    H.add(rig.part(8, -8, 8, 3, LIP, 0.5, 0, false));
  } else {
    H.add(rig.part(8, -8, 8, 2, 0x8a3b2b, 0.5, 0, false));
  }
  if (g === 'sun') {
    // 선글라스: 눈을 가리는 검은 렌즈 + 다리 + 반짝임
    H.add(rig.part(4, -22, 10, 8, 0x15171c, 0.5, 0, false));
    H.add(rig.part(13, -22, 9, 8, 0x15171c, 0.5, 0, false));
    H.add(rig.part(-4, -20, 8, 2, 0x15171c, 0.5, 0, false));
    H.add(rig.part(2, -21, 2, 2, 0x8d97a3, 0.5, 0, false));
    H.add(rig.part(11, -21, 2, 2, 0x8d97a3, 0.5, 0, false));
  }
  if (o.earphones) {
    H.add(rig.part(-16, -17, 6, 8, 0xffffff, 0.5, 0));
    H.add(rig.part(-16, -9, 2, 14, 0xffffff, 0.5, 0, false));
  }
}

/** 목에 두르는 것 (몸통 컨테이너 원점 = 허리, top = 몸통 위쪽 끝, 예: -38). 셔츠·블라우스 차림의 앞가슴 쪽 x = -2 */
export function addNeckwear(rig: Rig, kind: Neck2D, color: number, top: number): void {
  const T = rig.torso;
  if (kind === 'tie') {
    T.add(rig.part(-2, top + 1, 6, 24, color, 0.5, 0, false));
  } else if (kind === 'ribbon') {
    // 블라우스 깃 + 리본(양쪽 고리·매듭·늘어진 끈)
    T.add(rig.part(-8, top, 8, 4, 0xffffff, 0.5, 0, false));
    T.add(rig.part(4, top, 8, 4, 0xffffff, 0.5, 0, false));
    T.add(rig.part(-6, top + 2, 7, 6, color, 0.5, 0));
    T.add(rig.part(3, top + 2, 7, 6, color, 0.5, 0));
    T.add(rig.part(-3, top + 6, 2, 8, color, 0.5, 0, false));
    T.add(rig.part(0, top + 6, 2, 8, color, 0.5, 0, false));
    T.add(rig.part(-1.5, top + 2, 4, 6, tone(color, 0.75), 0.5, 0));
  } else if (kind === 'scarf') {
    // 목에 감은 스카프 + 앞으로 늘어진 끝
    T.add(rig.part(0, top - 1, 24, 6, color, 0.5, 0));
    T.add(rig.part(5, top + 4, 6, 12, color, 0.5, 0));
    T.add(rig.part(5, top + 15, 6, 2, tone(color, 0.75), 0.5, 0, false));
  }
}

/** 여성 치마 (몸통 아래로 넓게 퍼진다. 다리는 치마 밑에서 움직인다) */
export function addSkirt(rig: Rig, color: number): void {
  rig.torso.add(rig.part(0, -4, 42, 17, color, 0.5, 0));
  rig.torso.add(rig.part(0, 11, 42, 2, tone(color, 0.75), 0.5, 0, false));
}

/** 교직원 외형의 머리 모양 */
function staffHairStyle(look: StaffLook): HairStyle2D {
  if (look.crew) return 'crew';
  if (look.bob) return 'bob';
  if (look.ponytail) return 'ponytail';
  return look.longHair ? 'long' : 'short';
}

/** 안경 (예전 값 glasses: true = 평범한 안경) */
function glassesOf(look: { glasses?: boolean; glassesStyle?: 'horn' | 'silver' | 'sun' }): Glasses2D | undefined {
  return look.glassesStyle ?? (look.glasses ? 'plain' : undefined);
}

// ---------- 주인공 ----------

/** 교직원 주인공 (가상 행정직원 6명은 look만 다르다). 여성은 블라우스·리본·치마, 남성은 셔츠·넥타이 */
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

  // 치마 (여성: 허리에서 무릎 위까지. 다리는 치마 밑에서 움직인다)
  if (look.female && look.skirt !== false) addSkirt(rig, look.pants ?? 0x2d3b63);
  // 넥타이(리본)·앞치마와 사원증 (torso 컨테이너 원점 = 허리, 몸통 위쪽 끝 = -38)
  if (look.apron) {
    rig.torso.add(rig.part(0, -28, 30, 27, 0xfff3d6, 0.5, 0));
    rig.torso.add(rig.part(0, -37, 16, 3, look.tie, 0.5, 0, false));
  } else {
    addNeckwear(rig, look.female ? 'ribbon' : 'tie', look.tie, -38);
  }
  rig.torso.add(rig.part(9, -37, 2, 18, 0x2f6fd1, 0.5, 0, false));
  rig.torso.add(rig.part(9, -20, 11, 14, 0xffffff, 0.5, 0));
  rig.torso.add(rig.part(9, -20, 11, 4, 0x2f6fd1, 0.5, 0, false));

  // 규정집 (뒷손에 늘 들고 있다 — 앞손은 도장·무기 자리)
  if (look.prop === 'rulebook') {
    rig.armB.add(rig.part(1, 22, 17, 22, 0x1f5e45, 0.5, 0));
    rig.armB.add(rig.part(1, 28, 17, 3, 0xd9b44a, 0.5, 0, false));
  }

  dressHead(rig, {
    hair: look.hair,
    style: staffHairStyle(look),
    female: look.female,
    glasses: glassesOf(look),
    headband: look.headband,
  });
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

/** 밟으면 바로 먹는(쓰는) 물건: 음식, 일거리, 식권(체력 모두 회복), 보조배터리(필살기 게이지 +50),
 *  연차 쿠폰(학생: 공결 확인서 — 다음 한 번 막기), 셔틀버스 시간표(10초 빨리 걷기), 단톡방 공지 캡처(잡몹 2.5초 멈춤),
 *  인감 도장(학생: 출석 스티커 — 8초 동안 맨손 공격이 잡몹을 넘어뜨림) */
export type FoodKind =
  | 'donkatsu'
  | 'gimbap'
  | 'americano'
  | 'work'
  | 'mealticket'
  | 'battery'
  | 'shield'
  | 'shuttle'
  | 'capture'
  | 'seal';

/** 작은 글씨 (아이콘 안) */
function iconText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size = 11): Phaser.GameObjects.Text {
  return new Phaser.GameObjects.Text(scene, x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: 'bold',
    color,
  }).setOrigin(0.5);
}

/** 회복 아이템. 'work'(일거리)는 김밥처럼 생겼지만 서류 귀퉁이가 삐져나와 있다. student: 학생 모드 모양 (공결 확인서·출석 스티커) */
export function createFoodIcon(scene: Phaser.Scene, kind: FoodKind, student = false): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  if (kind === 'seal' && student) {
    // 출석 스티커: 흰 스티커 판, 큰 노란 동그라미 스티커에 "출석", 작은 초록·하늘색 스티커 둘
    c.add(box(scene, 0, 0, 44, 32, 0xffffff));
    const big = new Phaser.GameObjects.Arc(scene, -6, 0, 12, 0, 360, false, 0xffd34d);
    big.setStrokeStyle(2, INK);
    c.add(big);
    c.add(iconText(scene, -6, 0, '출석', '#7a3d00', 9));
    c.add(new Phaser.GameObjects.Arc(scene, 13, -7, 4.5, 0, 360, false, 0x5bd16b).setStrokeStyle(1.5, INK));
    c.add(new Phaser.GameObjects.Arc(scene, 13, 7, 4.5, 0, 360, false, 0x6fb7ff).setStrokeStyle(1.5, INK));
  } else if (kind === 'seal') {
    // 인감 도장: 왼쪽에 나무 손잡이 도장(빨간 인면), 오른쪽 종이에 빨간 네모 "인감" 자국
    c.add(box(scene, 7, 3, 32, 30, 0xfffaf0));
    const mark = new Phaser.GameObjects.Rectangle(scene, 8, 4, 21, 19);
    mark.setStrokeStyle(2, 0xd0202f);
    c.add(mark);
    c.add(iconText(scene, 8, 4, '인감', '#d0202f', 9));
    c.add(box(scene, -15, -4, 11, 22, 0x9b6b3d));
    c.add(box(scene, -15, -16, 15, 6, 0x6b4423));
    c.add(box(scene, -15, 10, 15, 7, 0xb3262d));
  } else if (kind === 'shield' && student) {
    // 공결 확인서: 흰 서류 한 장, 위쪽 남색 제목 띠, 글줄, 빨간 확인 도장
    c.add(box(scene, 0, 0, 32, 40, 0xffffff));
    c.add(box(scene, 0, -13, 32, 10, 0x1f3a6b, 0.5, 0.5, false));
    c.add(iconText(scene, 0, -13, '공결', '#ffffff', 9));
    for (let i = 0; i < 3; i++) c.add(box(scene, -4, -1 + i * 6, 18, 2, 0x9aa3ad, 0.5, 0.5, false));
    const seal = new Phaser.GameObjects.Arc(scene, 8, 11, 6, 0, 360, false);
    seal.isFilled = false;
    seal.setStrokeStyle(2, 0xd0202f);
    c.add(seal);
  } else if (kind === 'shield') {
    // 연차 쿠폰: 민트색 쿠폰, 점선 절취선, 오른쪽 초록 꼬리표
    c.add(box(scene, 0, 0, 46, 24, 0xd9f5e3));
    c.add(box(scene, 17, 0, 10, 22, 0x2f9e6a, 0.5, 0.5, false));
    for (let i = 0; i < 4; i++) c.add(box(scene, 9, -8 + i * 5.5, 2, 3, 0x9aa3ad, 0.5, 0.5, false));
    c.add(iconText(scene, -6, 0, '연차', '#1f7a55'));
  } else if (kind === 'shuttle') {
    // 셔틀버스 시간표: 흰 표지판, 위쪽 파란 띠에 노란 버스, 아래 시간 칸
    c.add(box(scene, 0, 0, 46, 34, 0xffffff));
    c.add(box(scene, 0, -10, 46, 14, 0x2f6fd1, 0.5, 0.5, false));
    c.add(box(scene, -11, -10, 18, 9, 0xf5c542, 0.5, 0.5, false));
    c.add(box(scene, -14, -11, 4, 3, INK, 0.5, 0.5, false));
    c.add(box(scene, -8, -11, 4, 3, INK, 0.5, 0.5, false));
    c.add(iconText(scene, 11, -10, '셔틀', '#ffffff', 9));
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) c.add(box(scene, -14 + j * 14, 4 + i * 7, 10, 3, 0x9aa3ad, 0.5, 0.5, false));
    }
  } else if (kind === 'capture') {
    // 단톡방 공지 캡처: 짙은 휴대폰, 하늘색 화면, 위쪽 노란 "공지" 띠, 말풍선 둘
    c.add(box(scene, 0, 0, 26, 42, 0x2b2f38));
    c.add(box(scene, 0, 1, 20, 32, 0xbcd7f0, 0.5, 0.5, false));
    c.add(box(scene, 0, -10, 20, 9, 0xf5c542, 0.5, 0.5, false));
    c.add(iconText(scene, 0, -10, '공지', '#111318', 8));
    c.add(box(scene, -3, 2, 12, 5, 0xffffff, 0.5, 0.5, false));
    c.add(box(scene, 3, 10, 12, 5, 0xfff3c4, 0.5, 0.5, false));
  } else if (kind === 'mealticket') {
    // 식권: 절취선이 있는 노란 종이표 + 파란 꼬리표
    c.add(box(scene, 0, 0, 46, 24, 0xfff3c4));
    c.add(box(scene, -18, 0, 8, 22, 0x2f6fd1, 0.5, 0.5, false));
    for (let i = 0; i < 4; i++) c.add(box(scene, -11, -8 + i * 5.5, 2, 3, 0x9aa3ad, 0.5, 0.5, false));
    c.add(
      new Phaser.GameObjects.Text(scene, 5, 0, '식권', {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#b3262d',
      }).setOrigin(0.5),
    );
  } else if (kind === 'battery') {
    // 보조배터리: 짙은 몸체, 초록 충전 칸 세 개, 위로 삐져나온 케이블
    const cable = new Phaser.GameObjects.Graphics(scene);
    cable.lineStyle(3, 0xe5e7eb, 1);
    cable.beginPath();
    cable.moveTo(0, -17);
    cable.lineTo(0, -23);
    cable.lineTo(9, -26);
    cable.lineTo(15, -20);
    cable.strokePath();
    c.add(cable);
    c.add(box(scene, 0, 2, 24, 34, 0x2b2f38));
    for (let i = 0; i < 3; i++) c.add(box(scene, 0, 11 - i * 8, 14, 5, 0x5bd16b, 0.5, 0.5, false));
    c.add(box(scene, 0, -16, 10, 4, 0x9aa3ad));
  } else if (kind === 'donkatsu') {
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
  /** 여성 얼굴 (속눈썹·입술, 앞머리) */
  female?: boolean;
  /** 단발 */
  bob?: boolean;
  /** 묶은 머리 */
  ponytail?: boolean;
  glassesStyle?: Glasses2D;
  /** 머리띠 색 (총학 집행부) */
  headband?: number;
}

/** 이름이 있는 학생(students.ts 7명)이면 그 사람 외형(createStudentHeroRig), 아니면 과잠 차림(fallback).
 *  교직원 모드 민원 학생·학생 보스는 11차부터 유형이 아니라 이름을 따른다 */
export function createNamedStudentRig(scene: Phaser.Scene, name: string, fallback: StudentLook): Rig {
  const s = studentByName(name);
  return s ? createStudentHeroRig(scene, s.look) : createStudentRig(scene, fallback);
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

  dressHead(rig, {
    hair: look.hair,
    style: look.bob ? 'bob' : look.ponytail ? 'ponytail' : look.longHair ? 'long' : 'short',
    female: look.female,
    glasses: look.glassesStyle,
    headbandColor: look.headband,
    earphones: look.earphones,
  });
  return rig;
}

export type ChonghakRole = 'decibel' | 'protest' | 'sitin';

/** 오시위: 양복 차림 (짙은 회색 정장, 흰 셔츠, 넥타이) + 빨간 머리띠 */
function createSuitStudentRig(scene: Phaser.Scene): Rig {
  const suit = 0x2e3440;
  const rig = new Rig(scene, {
    legW: 14,
    legH: 36,
    legGap: 14,
    legColor: suit,
    shoeColor: 0x141414,
    torsoW: 38,
    torsoH: 38,
    torsoColor: suit,
    armW: 12,
    armH: 30,
    armColor: suit,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: SKIN,
    outline: INK,
  });
  rig.torso.add(rig.part(-2, -38, 14, 20, 0xf4f4f4, 0.5, 0, false));
  rig.torso.add(rig.part(-2, -36, 5, 20, 0x8a1f2c, 0.5, 0, false));
  dressHead(rig, { hair: 0x1f1a17, style: 'short', headbandColor: 0xd0202f });
  return rig;
}

/** 총학 집행부 3명 (11차): 김데시벨 여·흰 머리띠·확성기 / 오시위 남·양복·대자보 / 박장수생 여·뿔테안경 (둘은 빨간 머리띠) */
export function createChonghakRig(scene: Phaser.Scene, role: ChonghakRole): Rig {
  const rig =
    role === 'protest'
      ? createSuitStudentRig(scene)
      : role === 'decibel'
        ? createStudentRig(scene, { jacket: 0x1f4e79, hair: 0x2a2420, female: true, ponytail: true, headband: 0xffffff })
        : createStudentRig(scene, { jacket: 0x2f5d3a, hair: 0x3b2a20, female: true, bob: true, glassesStyle: 'horn', headband: 0xd0202f });
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

// ---------- 학생 모드 주인공 ----------

/** 색을 밝게(f > 1)·어둡게(f < 1) */
export function tone(c: number, f: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** 학생 주인공 등에 멘 가방의 이름 (3타 "가방 휘두르기" 때 등에서 내려 손에 든다) */
export const BACKPACK_NAME = 'backpack';

/** 외대 야구잠바의 흰 소매 */
const VARSITY_SLEEVE = 0xf4f4f4;

/** 학생 7명 (students.ts): 후드티·열린 재킷·외대 야구잠바·체크 셔츠, 청바지, 운동화, 백팩.
 *  학생 모드 주인공(김러샤·이엘LT·박불어·정헝가리)과 교직원 모드 민원 학생이 같은 외형을 쓴다 */
export function createStudentHeroRig(scene: Phaser.Scene, look: StudentHeroLook): Rig {
  const shoes = look.shoes ?? 0xf4f4f4;
  const rig = new Rig(scene, {
    legW: 14,
    legH: 36,
    legGap: 14,
    legColor: look.pants ?? 0x34507a,
    shoeColor: shoes,
    torsoW: 38,
    torsoH: 38,
    torsoColor: look.jacket,
    armW: 12,
    armH: 30,
    armColor: look.varsity ? VARSITY_SLEEVE : look.jacket,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: SKIN,
    outline: INK,
  });
  const dark = tone(look.jacket, 0.78);
  if (look.check) {
    // 체크 셔츠: 몸통·소매에 진한 세로줄과 밝은 가로줄
    const line = tone(look.jacket, 0.62);
    const light = tone(look.jacket, 1.45);
    for (let x = -14; x <= 14; x += 7) rig.torso.add(rig.part(x, -37, 2, 36, line, 0.5, 0, false));
    for (let y = -33; y <= -6; y += 7) rig.torso.add(rig.part(0, y, 36, 1.5, light, 0.5, 0, false));
    for (const arm of [rig.armF, rig.armB]) {
      arm.add(rig.part(0, 1, 2, 24, line, 0.5, 0, false));
      for (let y = 5; y <= 22; y += 7) arm.add(rig.part(0, y, 10, 1.5, light, 0.5, 0, false));
    }
  }

  // 운동화: 흰 밑창 + 옆줄 (다리 컨테이너 원점 = 엉덩이, 신발 = 30~36)
  for (const leg of [rig.legF, rig.legB]) {
    leg.add(rig.part(2, 34, 18, 2, 0xffffff, 0.5, 0, false));
    leg.add(rig.part(3, 31, 8, 2, look.shoeStripe ?? 0x2f6fd1, 0.5, 0, false));
  }
  // 소매 끝
  for (const arm of [rig.armF, rig.armB]) arm.add(rig.part(0, 25, 12, 5, dark, 0.5, 0, false));

  // 가방: 몸통 뒤로 삐져나온 백팩 (몸통 그림보다 먼저 그려 뒤에 있는 것처럼 보이게 한다)
  const pack = new Phaser.GameObjects.Container(scene, 0, 0).setName(BACKPACK_NAME);
  pack.add(rig.part(-22, -37, 14, 32, look.bag, 0.5, 0));
  pack.add(rig.part(-27, -24, 6, 14, tone(look.bag, 0.8), 0.5, 0));
  pack.add(rig.part(-22, -40, 10, 4, tone(look.bag, 0.75), 0.5, 0));
  rig.torso.addAt(pack, 0);

  if (look.varsity) {
    // 외대 야구잠바: 남색 몸통, 흰 소매, 줄무늬 목깃·밑단, 똑딱단추, 가슴에 흰 "H"
    rig.torso.add(rig.part(2, -40, 20, 5, dark, 0.5, 0));
    rig.torso.add(rig.part(2, -38, 20, 1.5, VARSITY_SLEEVE, 0.5, 0, false));
    rig.torso.add(rig.part(0, -6, 38, 5, dark, 0.5, 0, false));
    rig.torso.add(rig.part(0, -4, 38, 1.5, VARSITY_SLEEVE, 0.5, 0, false));
    for (let y = -33; y <= -12; y += 7) rig.torso.add(rig.part(14, y, 3, 3, 0xd9d9d9, 0.5, 0, false));
    rig.torso.add(rig.part(1, -33, 3.5, 13, VARSITY_SLEEVE, 0.5, 0, false));
    rig.torso.add(rig.part(10, -33, 3.5, 13, VARSITY_SLEEVE, 0.5, 0, false));
    rig.torso.add(rig.part(5.5, -28, 9, 3, VARSITY_SLEEVE, 0.5, 0, false));
    for (const arm of [rig.armF, rig.armB]) arm.add(rig.part(0, 0, 12, 4, dark, 0.5, 0, false));
  } else if (look.hoodie) {
    // 후드티: 목 뒤 모자, 끈 두 줄, 앞주머니
    rig.torso.add(rig.part(-9, -43, 22, 9, dark, 0.5, 0));
    rig.torso.add(rig.part(6, -37, 2, 12, 0xf4f4f4, 0.5, 0, false));
    rig.torso.add(rig.part(12, -37, 2, 10, 0xf4f4f4, 0.5, 0, false));
    rig.torso.add(rig.part(6, -17, 24, 10, dark, 0.5, 0));
    rig.torso.add(rig.part(0, -5, 38, 4, dark, 0.5, 0, false));
  } else {
    // 열린 재킷 + 티셔츠, 깃
    rig.torso.add(rig.part(8, -38, 14, 34, look.tee ?? 0xf4f4f4, 0.5, 0, false));
    rig.torso.add(rig.part(2, -38, 4, 34, dark, 0.5, 0, false));
    rig.torso.add(rig.part(14, -38, 4, 34, dark, 0.5, 0, false));
    rig.torso.add(rig.part(-4, -40, 16, 6, dark, 0.5, 0));
  }
  // 가방끈 (어깨 앞으로)
  rig.torso.add(rig.part(-4, -38, 4, 26, tone(look.bag, 0.75), 0.5, 0, false));

  // 머리 (head 컨테이너 원점 = 목, 머리 위쪽 끝 = -31)
  dressHead(rig, {
    hair: look.hair,
    style: look.bob ? 'bob' : look.ponytail ? 'ponytail' : look.longHair ? 'long' : 'short',
    female: look.female,
    bangs: true,
    glasses: glassesOf(look),
    earphones: look.earphones,
  });
  return rig;
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
  // 셔츠와 넥타이 (몸통 위쪽 끝 = -40). gumto = 박학과장(여): 블라우스 + 초록 스카프
  rig.torso.add(rig.part(0, -39, 14, 22, 0xf4f4f4, 0.5, 0, false));
  if (kind === 'bogo') rig.torso.add(rig.part(0, -37, 6, 24, 0xb3262d, 0.5, 0, false));
  else addNeckwear(rig, 'scarf', 0x2f6b3a, -40);

  const gray = 0xa8a8a8;
  if (kind === 'bogo') {
    rig.head.add(rig.part(0, -34, 24, 4, gray, 0.5, 0, false));
    rig.head.add(rig.part(-15, -27, 6, 14, gray, 0.5, 0, false));
    rig.head.add(rig.part(15, -27, 4, 10, gray, 0.5, 0, false));
    rig.head.add(rig.part(8, -11, 14, 3, 0x555555, 0.5, 0, false));
    rig.head.add(rig.part(4, -19, 3, 4, INK, 0.5, 0, false));
    rig.head.add(rig.part(13, -19, 3, 4, INK, 0.5, 0, false));
  } else {
    // 박학과장(여): 긴 머리·안경 (눈·입은 dressHead가 그린다)
    dressHead(rig, { hair: 0x3b2a20, style: 'long', female: true, glasses: 'plain' });
  }

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
  // meeting = 회의회의부총장(여): 넥타이 대신 블라우스 리본
  if (look === 'meeting') addNeckwear(rig, 'ribbon', TIES[look], -40);
  else rig.torso.add(rig.part(0, -37, 6, 24, TIES[look], 0.5, 0, false));
  if (vice) rig.torso.add(rig.part(-13, -32, 6, 6, 0xd9b44a, 0.5, 0, false));
  const gray = 0xb0b0b0;
  if (look === 'bujae') {
    rig.head.add(rig.part(0, -35, 35, 10, 0x2a2420, 0.5, 0));
    rig.itemF.add(rig.part(0, 0, 10, 18, 0x1b1b1f, 0.5, 0)); // 휴대폰 (늘 통화 중)
  } else if (look === 'molla') {
    rig.head.add(rig.part(0, -35, 35, 8, gray, 0.5, 0));
    rig.head.add(rig.part(10, -31, 10, 3, INK, 0.5, 0, false)); // 찡그린 눈썹
  } else if (look === 'meeting') {
    // 단발·안경 (눈·입은 dressHead가 그린다)
    dressHead(rig, { hair: 0x5a5450, style: 'bob', female: true, glasses: 'plain' });
    rig.itemF.add(rig.part(0, 0, 18, 24, 0xffffff, 0.5, 0)); // 회의 자료
    return rig;
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

// ---------- 경비 선생님 (교직원 모드: 인사하면 무기를 준다) ----------

const GUARD_NAVY = 0x1f2a44;

/** 화난 마귀 얼굴 색 (결정 61: 빨간 얼굴·뿔 두 개·빛나는 노란 눈·송곳니 — 경비 선생님과 대출기 화면이 같다) */
export const DEMON_RED = 0xd0202f;
export const DEMON_EYE = 0xffe066;
export const DEMON_GLOW = 0xfff6c2;
export const DEMON_HORN = 0xf5e6c4;

/** 경비 선생님 (이름 없는 가상 인물): 남색 제복과 모자, 금색 모표·가슴 배지.
 *  11차: 구역마다 남녀가 번갈아 선다 (female = 단발·리본, StageScene이 정한다)
 *  demon = 결정 61 이스터 에그 "화난 경비 선생님": 빨간 얼굴, 모자를 뚫고 나온 뿔 두 개, 빛나는 노란 눈, 송곳니 */
export function createGuardRig(scene: Phaser.Scene, female = false, demon = false): Rig {
  const rig = new Rig(scene, {
    legW: 15,
    legH: 36,
    legGap: 14,
    legColor: 0x1a2236,
    shoeColor: 0x111111,
    torsoW: 38,
    torsoH: 40,
    torsoColor: GUARD_NAVY,
    armW: 12,
    armH: 31,
    armColor: GUARD_NAVY,
    handColor: SKIN,
    headW: 32,
    headH: 31,
    headColor: demon ? DEMON_RED : SKIN,
    outline: INK,
  });
  // 셔츠 깃·넥타이, 가슴 배지, 허리띠 (몸통 위쪽 끝 = -40)
  rig.torso.add(rig.part(0, -40, 14, 6, 0xdfe6f2, 0.5, 0, false));
  if (female) addNeckwear(rig, 'ribbon', 0x111827, -40);
  else rig.torso.add(rig.part(0, -36, 5, 18, 0x111827, 0.5, 0, false));
  rig.torso.add(rig.part(11, -32, 7, 8, 0xd9b44a, 0.5, 0, false));
  rig.torso.add(rig.part(0, -9, 38, 5, 0x111111, 0.5, 0, false));
  rig.torso.add(rig.part(3, -9, 6, 5, 0xc9ced4, 0.5, 0, false));
  // 어깨 견장
  for (const arm of [rig.armF, rig.armB]) arm.add(rig.part(0, 0, 12, 4, 0xd9b44a, 0.5, 0, false));
  // 머리카락: 남 = 모자 밑 짧은 옆머리, 여 = 모자 밑으로 내려온 단발
  if (female) rig.head.add(rig.part(-10, -27, 15, 22, 0x2a2420, 0.5, 0));
  else rig.head.add(rig.part(-14, -24, 6, 10, 0x2a2420, 0.5, 0, false));
  if (demon) addDemonFace(rig);
  else dressHead(rig, { hair: 0x2a2420, style: 'none', female });
  // 마귀 뿔은 모자보다 먼저 그려 모자 위로 솟아 보이게 한다 (뿌리는 모자에 가린다)
  if (demon) {
    for (const [x, rot] of [
      [-11, -0.38],
      [9, 0.38],
    ] as const) {
      const horn = rig.part(x, -36, 7, 17, DEMON_HORN, 0.5, 1);
      horn.rotation = rot;
      rig.head.add(horn);
    }
  }
  // 모자: 몸통 + 검은 띠 + 앞(+x)으로 나온 챙 + 금색 모표 (머리 위쪽 끝 = -31)
  rig.head.add(rig.part(-1, -41, 36, 14, GUARD_NAVY, 0.5, 0));
  rig.head.add(rig.part(-1, -31, 36, 4, 0x111827, 0.5, 0, false));
  rig.head.add(rig.part(16, -29, 16, 4, 0x111111, 0.5, 0));
  rig.head.add(rig.part(6, -39, 6, 6, 0xd9b44a, 0.5, 0, false));
  return rig;
}

/** 화난 마귀 얼굴 (머리 상자는 빨갛게 이미 그렸다): 빛나는 노란 눈, 안쪽으로 내려간 눈썹, 송곳니 두 개가 보이는 입 */
function addDemonFace(rig: Rig): void {
  const H = rig.head;
  // 눈: 연한 노란 빛 + 노란 눈 + 가운데 검은 동공(세로로 가늘게)
  for (const x of [4, 13]) {
    H.add(rig.part(x, -22, 9, 8, DEMON_GLOW, 0.5, 0, false));
    H.add(rig.part(x, -21, 7, 6, DEMON_EYE, 0.5, 0, false));
    H.add(rig.part(x, -21, 2, 6, INK, 0.5, 0, false));
  }
  // 화난 눈썹: 가운데(두 눈 사이) 쪽 끝이 내려간다
  const bl = rig.part(4, -24, 10, 3, INK, 0.5, 0.5, false);
  bl.rotation = 0.45;
  const br = rig.part(13, -24, 10, 3, INK, 0.5, 0.5, false);
  br.rotation = -0.45;
  H.add([bl, br]);
  // 입과 송곳니
  H.add(rig.part(9, -10, 13, 5, 0x3a0a0a, 0.5, 0, false));
  H.add(rig.part(5, -10, 3, 5, 0xffffff, 0.5, 0, false));
  H.add(rig.part(13, -10, 3, 5, 0xffffff, 0.5, 0, false));
}

/** 교직원 모드 상자 "조기출근 박스": 테이프 붙인 골판지 상자 + 흰 라벨 (원점 = 바닥 가운데) */
export function createEarlyBox(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  c.add(box(scene, 0, -22, 60, 44, 0xc8955a));
  c.add(box(scene, 0, -41, 60, 6, 0xb07a40, 0.5, 0.5, false));
  c.add(box(scene, 0, -36, 12, 16, 0xe2cf9a, 0.5, 0.5, false));
  c.add(box(scene, 0, -17, 48, 17, 0xffffff));
  c.add(
    new Phaser.GameObjects.Text(scene, 0, -17, '조기출근', {
      fontFamily: FONT,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#1d1d22',
    }).setOrigin(0.5),
  );
  return c;
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

/** 엑셀 선택 테두리 초록 */
const EXCEL_GREEN = 0x217346;

/** 결정 61 새 잡몹 A "#REF! 오류 셀" — 초록 선택 테두리가 둘린 흰 엑셀 칸에 빨간 "#REF!", 오른쪽 아래 채우기 핸들.
 *  처리되면 작은 것 둘로 갈라진다 (작은 것은 같은 그림을 줄여 쓴다 — RefCell.ts) */
export function createRefCellRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 7,
    legH: 14,
    legGap: 26,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 60,
    torsoH: 46,
    torsoColor: 0xffffff,
    armW: 6,
    armH: 12,
    armColor: 0xffffff,
    handColor: 0xffffff,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  // 칸 위 열 머리글 띠(연회색), 초록 선택 테두리, 채우기 핸들 (몸통 위쪽 끝 = -46)
  rig.torso.add(rig.part(0, -46, 60, 7, 0xe6e8eb, 0.5, 0, false));
  rig.torso.add(rig.part(0, -39, 54, 36, 0xffffff, 0.5, 0, false).setStrokeStyle(3, EXCEL_GREEN));
  rig.torso.add(rig.part(27, -3, 7, 7, EXCEL_GREEN, 0.5, 0.5, false).setStrokeStyle(1.5, 0xffffff));
  rig.torso.add(rig.text(0, -27, '#REF!', '#d0202f', 15, 46, FONT));
  // 화난 눈
  rig.torso.add(rig.part(-9, -12, 5, 6, INK, 0.5, 0.5, false));
  rig.torso.add(rig.part(9, -12, 5, 6, INK, 0.5, 0.5, false));
  const bl = rig.part(-9, -17, 9, 2.5, INK, 0.5, 0.5, false);
  bl.rotation = 0.35;
  const br = rig.part(9, -17, 9, 2.5, INK, 0.5, 0.5, false);
  br.rotation = -0.35;
  rig.torso.add([bl, br]);
  return rig;
}

/** 결정 61 새 잡몹 B "반송 택배 상자" — 테이프 붙인 갈색 골판지 상자에 빨간 "반송" 도장 스티커와 송장 */
export function createParcelRig(scene: Phaser.Scene): Rig {
  const rig = new Rig(scene, {
    legW: 9,
    legH: 13,
    legGap: 28,
    legColor: 0x3a3a44,
    shoeColor: 0x1b1b1f,
    torsoW: 62,
    torsoH: 48,
    torsoColor: 0xc8955a,
    armW: 7,
    armH: 13,
    armColor: 0xb07a40,
    handColor: 0xb07a40,
    headW: 0,
    headH: 0,
    headColor: 0,
    outline: INK,
  });
  // 윗면 덮개 선·가운데 테이프 (몸통 위쪽 끝 = -48)
  rig.torso.add(rig.part(0, -48, 62, 6, 0xb07a40, 0.5, 0, false));
  rig.torso.add(rig.part(0, -48, 12, 20, 0xe2cf9a, 0.5, 0, false));
  // 송장 (바코드 줄)
  rig.torso.add(rig.part(17, -33, 20, 14, 0xffffff, 0.5, 0, true));
  for (const x of [10, 13, 15, 18, 21, 24]) rig.torso.add(rig.part(x, -30, 1.5, 7, INK, 0.5, 0, false));
  // 빨간 "반송" 도장 스티커
  rig.torso.add(rig.part(-13, -31, 28, 17, DEMON_RED, 0.5, 0.5, false).setStrokeStyle(2, 0xffffff));
  rig.torso.add(rig.text(-13, -31, '반송', '#ffffff', 12, 24, FONT));
  // 화난 눈
  rig.torso.add(rig.part(-9, -12, 6, 6, INK, 0.5, 0.5, false));
  rig.torso.add(rig.part(9, -12, 6, 6, INK, 0.5, 0.5, false));
  const bl = rig.part(-9, -17, 10, 3, INK, 0.5, 0.5, false);
  bl.rotation = 0.4;
  const br = rig.part(9, -17, 10, 3, INK, 0.5, 0.5, false);
  br.rotation = -0.4;
  rig.torso.add([bl, br]);
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
