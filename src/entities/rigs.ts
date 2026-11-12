import Phaser from 'phaser';
import { Rig } from './Rig';

const INK = 0x1d1d22;

/** 주무관 (교직원 모드 주인공). M2에서 행정직원 6명 외형으로 나눈다. */
export function createStaffRig(scene: Phaser.Scene): Rig {
  const skin = 0xf1c7a0;
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
    handColor: skin,
    headW: 32,
    headH: 31,
    headColor: skin,
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

/** 도장 소품 (공격 1·2타) */
export function createStamp(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, 0, 8, 9, 0x8b5a2b, 0.5, 0));
  c.add(rig.part(0, 9, 18, 7, 0xc8202f, 0.5, 0));
  return c;
}

/** 결재판 소품 (공격 3타) */
export function createClipboard(scene: Phaser.Scene, rig: Rig): Phaser.GameObjects.Container {
  const c = new Phaser.GameObjects.Container(scene, 0, 0);
  c.add(rig.part(0, -4, 30, 38, 0x9a6a3a, 0.5, 0));
  c.add(rig.part(0, 2, 22, 26, 0xffffff, 0.5, 0, false));
  c.add(rig.part(0, 8, 16, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(0, 14, 16, 2, 0x9aa3ad, 0.5, 0, false));
  c.add(rig.part(0, -7, 12, 6, 0x8a8f96, 0.5, 0));
  return c;
}

/** 잡몹 "새벽 3시 메일" — 다리 달린 편지봉투 */
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

  // 봉투 덮개 V자 (torso 원점 = 허리, 위쪽 끝 = -40)
  const flap = new Phaser.GameObjects.Graphics(scene);
  flap.lineStyle(2, INK, 1);
  flap.beginPath();
  flap.moveTo(-28, -39);
  flap.lineTo(0, -19);
  flap.lineTo(28, -39);
  flap.strokePath();
  rig.torso.add(flap);

  // 화난 눈
  rig.torso.add(rig.part(-5, -13, 6, 7, INK, 0.5, 0.5, false));
  rig.torso.add(rig.part(11, -13, 6, 7, INK, 0.5, 0.5, false));
  const browL = rig.part(-5, -20, 10, 3, INK, 0.5, 0.5, false);
  browL.rotation = 0.35;
  const browR = rig.part(11, -20, 10, 3, INK, 0.5, 0.5, false);
  browR.rotation = -0.35;
  rig.torso.add([browL, browR]);

  // 빨간 소인
  const mark = new Phaser.GameObjects.Arc(scene, 18, -30, 6, 0, 360, false);
  mark.isFilled = false;
  mark.setStrokeStyle(2, 0xc8202f);
  rig.torso.add(mark);
  return rig;
}
