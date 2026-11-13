import Phaser from 'phaser';
import { FONT } from '../config';
import type { SkyTime, StageDef, ZoneArtId, ZoneDef } from '../data/stages';
import { HUFS_GOLD, HUFS_KEYS, HUFS_NAVY, hufsImage, type HufsImageOpts, type HufsKey } from '../hufs';

// 스테이지 배경: 한국외대 서울캠퍼스 실제 건물을 블록 도형으로 그린다. 구역 하나 = 화면 한 장(960px).
// 참고 사진: 학교 캠퍼스맵(hufs.ac.kr HUFS MAP)과 홍보팀 캠퍼스 사진. 사진 자체는 쓰지 않는다.
// 스테이지 데이터(stageN.json, studentN.json)가 구역마다 그림(art)을 고르고, 스테이지 전체의 하늘·시간(sky)을 정한다.
//
// 교직원 모드
//  1스테이지  본관 민원 창구 → 본관 로비 → 본관 앞 → 사회과학관 앞 (낮)
//  2스테이지  교수학습개발원 앞 → 교수학습개발원 로비 → 인문과학관 앞 → 인문과학관 강의실 앞 (늦은 오후)
//  3스테이지  국제학사(학생회관 및 기숙사, GlobeeDorm) 앞 → 운동장 스탠드 → 운동장 트랙 → 대운동장 (해 질 녘)
// 학생 모드 (같은 장소를 거꾸로 올라간다)
//  1스테이지  대운동장 → 운동장 트랙 → 운동장 스탠드 → 국제학사 앞 (낮)
//  2스테이지  인문과학관 앞 → 인문과학관 강의실 앞 → 교수학습개발원 로비 → 교수학습개발원 앞 (늦은 오후)
//  3스테이지  사회과학관 앞 → 본관 앞 → 본관 로비 → 본관 총장실 (해 질 녘)
//
// HUD가 화면 왼쪽 위(12~256, 10~82)와 가운데 위(시계·구역, y 50까지)를 덮으므로
// 간판·로고는 그 밖에 둔다.

type G = Phaser.GameObjects.Graphics;
type Rnd = Phaser.Math.RandomDataGenerator;

const D_BACK = -100; // 하늘·건물·바닥
const D_LOGO = -99; // 건물에 붙은 로고·글씨
const D_FRONT = -98; // 건물 앞 나무·가로등
const D_FRONT_LOGO = -97; // 가로등 배너의 로고·글씨
const D_TINT = -96; // 시간대 빛 (배경 전체 위, 그림자·사람 아래)

interface Ctx {
  scene: Phaser.Scene;
  /** 하늘·건물·바닥 */
  g: G;
  /** 건물 앞에 서는 나무·가로등·배너 */
  fg: G;
  rnd: Rnd;
  time: SkyTime;
  /** 하늘 띠 색 (위 → 아래) */
  bands: number[];
}

const SKY_DAY = [0x8fc0e8, 0xa5cdee, 0xbcd9ef, 0xd5e5ef, 0xece6d6];
const SKY_LATE = [0x92bce0, 0xabcbe6, 0xc6d7e2, 0xe2dccf, 0xf2d9bb];
const SKY_DUSK = [0x6f97cc, 0x9fb1d6, 0xd9bfb3, 0xf0a978, 0xe98b5c];
const SKY_BANDS: Record<SkyTime, number[]> = { day: SKY_DAY, late: SKY_LATE, dusk: SKY_DUSK };

interface ZoneArt {
  draw: (c: Ctx, ox: number) => void;
  indoor: boolean;
  /** 실내 구역: 바깥과 맞닿는 경계 기둥 색 */
  edge?: number;
  /** 실외 구역: 원래 그린 시간. 해 질 녘이 아닌 그림을 해 질 녘에 쓰면 빛 색을 살짝 입힌다 */
  native?: SkyTime;
}

const ZONE_ART: Record<ZoneArtId, ZoneArt> = {
  bonCounter: { draw: (c, ox) => bonCounter(c, ox), indoor: true, edge: 0x8a7454 },
  bonLobby: { draw: (c, ox) => bonLobby(c, ox), indoor: true, edge: 0x8a7454 },
  bonFront: { draw: (c, ox) => bonFront(c, ox), indoor: false, native: 'day' },
  socialScience: { draw: (c, ox) => socialScience(c, ox), indoor: false, native: 'day' },
  learningFront: { draw: (c, ox) => learningFront(c, ox), indoor: false, native: 'late' },
  learningLobby: { draw: (c, ox) => learningLobby(c, ox), indoor: true, edge: 0x5f6468 },
  humanitiesFront: { draw: (c, ox) => humanitiesFront(c, ox), indoor: false, native: 'late' },
  humanitiesHall: { draw: (c, ox) => humanitiesHall(c, ox), indoor: true, edge: 0x5f6468 },
  dormFront: { draw: (c, ox) => dormFront(c, ox), indoor: false, native: 'dusk' },
  stands: { draw: (c, ox) => stands(c, ox), indoor: false, native: 'dusk' },
  track: { draw: (c, ox) => track(c, ox), indoor: false, native: 'dusk' },
  fieldExit: { draw: (c, ox) => fieldCenter(c, ox, true), indoor: false, native: 'dusk' },
  field: { draw: (c, ox) => fieldCenter(c, ox, false), indoor: false, native: 'dusk' },
  presidentOffice: { draw: (c, ox) => presidentOffice(c, ox), indoor: true, edge: 0x4f311c },
};

/** 해 질 녘 빛 (낮 그림을 해 질 녘에 쓸 때) */
const DUSK_TINT = { color: 0xff8a3d, alpha: 0.12 };

export function drawBackground(scene: Phaser.Scene, stage: StageDef): void {
  const bg = stage.background;
  const c = makeCtx(scene, bg.seed, bg.sky);
  for (const z of stage.zones) {
    const art = ZONE_ART[z.art];
    art.draw(c, z.left);
    if (!art.indoor && bg.sky === 'dusk' && art.native !== 'dusk') {
      scene.add.rectangle(z.left, 0, 960, 540, DUSK_TINT.color, DUSK_TINT.alpha).setOrigin(0, 0).setDepth(D_TINT);
    }
  }
  for (const x of bg.edges ?? autoEdges(stage.zones)) {
    const i = stage.zones.findIndex((z) => z.left === x);
    if (i <= 0) continue;
    const a = ZONE_ART[stage.zones[i - 1].art];
    const b = ZONE_ART[stage.zones[i].art];
    edge(c.g, x, (a.indoor ? a.edge : b.edge) ?? 0x8a7454);
  }
}

/** 실내와 실외가 바뀌는 구역 경계 */
function autoEdges(zones: ZoneDef[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < zones.length; i++) {
    if (ZONE_ART[zones[i - 1].art].indoor !== ZONE_ART[zones[i].art].indoor) out.push(zones[i].left);
  }
  return out;
}

/** 학생 모드 엔딩용: 해 질 녘 총장실 한 장 (x 0~960) */
export function drawPresidentOfficeBackdrop(scene: Phaser.Scene): void {
  presidentOffice(makeCtx(scene, 'president-office', 'dusk'), 0);
}

/** 교직원 모드 엔딩: 해 질 녘 본관 앞. 프레지던트 캉이 본관에서 내려온다. */
export function drawEndingBackdrop(scene: Phaser.Scene): void {
  const c = makeCtx(scene, 'ending', 'dusk');
  const g = c.g;
  sky(g, 0, 960, SKY_DUSK);
  g.fillStyle(0xfff0c0, 0.95).fillCircle(860, 236, 34);
  skyline(c, 0);
  mainBuilding(c, 480, { left: true, right: true });
  g.fillStyle(0xbdb5a6).fillRect(0, 292, 960, 10);
  floor(g, 0, 960, 0xd2c8bb, 0xbfb4a6, { step: 90, slant: 50 });
  hufsFlowerBed(c, 40, 252, 250);
  lampBanner(c, 250);
  lampBanner(c, 712);
}

function makeCtx(scene: Phaser.Scene, seed: string, time: SkyTime): Ctx {
  return {
    scene,
    g: scene.add.graphics().setDepth(D_BACK),
    fg: scene.add.graphics().setDepth(D_FRONT),
    rnd: new Phaser.Math.RandomDataGenerator(['staff-smash', seed]),
    time,
    bands: SKY_BANDS[time],
  };
}

// ---------- 공통 도구 ----------

interface TextOpts {
  bold?: boolean;
  depth?: number;
  serif?: boolean;
  originX?: number;
  lineSpacing?: number;
}

function text(c: Ctx, x: number, y: number, s: string, size: number, color: string, o: TextOpts = {}): void {
  c.scene.add
    .text(x, y, s, {
      fontFamily: o.serif ? 'Georgia, "Times New Roman", serif' : FONT,
      fontSize: `${size}px`,
      fontStyle: o.bold === false ? 'normal' : 'bold',
      color,
      align: 'center',
      lineSpacing: o.lineSpacing ?? 0,
    })
    .setOrigin(o.originX ?? 0.5, 0.5)
    .setDepth(o.depth ?? D_LOGO);
}

function logo(c: Ctx, key: HufsKey, x: number, y: number, o: HufsImageOpts): void {
  hufsImage(c.scene, key, x, y, { depth: D_LOGO, ...o });
}

function darker(col: number, amt: number): number {
  return Phaser.Display.Color.ValueToColor(col).darken(amt).color;
}

function lighter(col: number, amt: number): number {
  return Phaser.Display.Color.ValueToColor(col).lighten(amt).color;
}

function sky(g: G, ox: number, w: number, bands: number[]): void {
  const bh = 300 / bands.length;
  bands.forEach((col, i) => g.fillStyle(col).fillRect(ox, Math.floor(i * bh), w, Math.ceil(bh) + 1));
}

function cloud(c: Ctx, x: number, y: number, s = 1): void {
  const g = c.g;
  const dusk = c.time === 'dusk';
  g.fillStyle(dusk ? 0xffe2cc : 0xffffff, 0.92);
  g.fillRect(x, y, 96 * s, 16 * s);
  g.fillRect(x + 14 * s, y - 12 * s, 56 * s, 14 * s);
  g.fillRect(x + 32 * s, y - 22 * s, 26 * s, 12 * s);
  g.fillStyle(dusk ? 0xe8b9a6 : 0xdce6f0, 0.9).fillRect(x, y + 12 * s, 96 * s, 4 * s);
}

/** 해가 기운 뒤에만 켜지는 창 불빛. 무작위 수는 시간과 상관없이 똑같이 뽑아 나머지 그림이 바뀌지 않게 한다 */
function lit(c: Ctx, p: number): boolean {
  return c.rnd.frac() < p && c.time !== 'day';
}

interface FloorOpts {
  step?: number;
  slant?: number;
  rows?: number[];
}

/** 걸을 수 있는 바닥 (y 302~540). 가로줄 + 비스듬한 세로줄 */
function floor(g: G, ox: number, w: number, base: number, line: number, o: FloorOpts = {}): void {
  g.fillStyle(base).fillRect(ox, 302, w, 238);
  g.lineStyle(2, line, 1);
  for (const y of o.rows ?? [328, 364, 410, 466, 532]) g.lineBetween(ox, y, ox + w, y);
  const step = o.step ?? 120;
  const slant = o.slant ?? 70;
  if (step > 0) for (let x = ox + slant; x <= ox + w; x += step) g.lineBetween(x, 302, x - slant, 540);
}

/** 실내와 실외가 바뀌는 자리의 기둥 */
function edge(g: G, x: number, col: number): void {
  g.fillStyle(col).fillRect(x - 7, 0, 14, 302);
  g.fillStyle(darker(col, 12)).fillRect(x + 3, 0, 4, 302);
}

function windowsGrid(
  g: G,
  x: number,
  y: number,
  cols: number,
  rows: number,
  dx: number,
  dy: number,
  ww: number,
  wh: number,
  glass: number,
  frame?: number,
): void {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const wx = x + i * dx;
      const wy = y + r * dy;
      if (frame !== undefined) g.fillStyle(frame).fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      g.fillStyle(glass).fillRect(wx, wy, ww, wh);
      g.fillStyle(0xffffff, 0.22).fillRect(wx, wy, Math.max(2, Math.round(ww * 0.3)), wh);
    }
  }
}

/** 블록 나무 덩어리 */
function crown(g: G, x: number, top: number, w: number, h: number, col: number): void {
  const dk = darker(col, 14);
  g.fillStyle(dk).fillRect(x - w / 2, top + h * 0.38, w, h * 0.46);
  g.fillStyle(col).fillRect(x - w * 0.44, top + h * 0.12, w * 0.88, h * 0.6);
  g.fillStyle(col).fillRect(x - w * 0.3, top, w * 0.6, h * 0.3);
  g.fillStyle(lighter(col, 12)).fillRect(x - w * 0.3, top + h * 0.08, w * 0.3, h * 0.22);
  g.fillStyle(dk).fillRect(x - w * 0.36, top + h * 0.8, w * 0.72, h * 0.18);
}

function tree(g: G, x: number, base: number, col: number, s = 1): void {
  g.fillStyle(0x6b4a2f).fillRect(x - 6 * s, base - 72 * s, 12 * s, 72 * s);
  crown(g, x, base - 160 * s, 116 * s, 104 * s, col);
}

/** 소나무: 붉은 줄기 위로 납작한 잎 덩어리가 층층이 */
function pine(g: G, x: number, base: number, s = 1): void {
  const trunk = 0x8a5a3c;
  g.fillStyle(trunk).fillRect(x - 5 * s, base - 64 * s, 10 * s, 64 * s);
  g.fillStyle(trunk).fillRect(x - 1 * s, base - 108 * s, 8 * s, 48 * s);
  const pads: [number, number, number, number][] = [
    [-50, -80, 72, 20],
    [6, -98, 66, 20],
    [-36, -120, 62, 18],
    [-4, -140, 46, 16],
  ];
  for (const [px, py, pw, ph] of pads) {
    g.fillStyle(0x22412c).fillRect(x + px * s, base + (py + 6) * s, pw * s, (ph - 4) * s);
    g.fillStyle(0x2f5a3a).fillRect(x + px * s, base + py * s, pw * s, (ph - 6) * s);
    g.fillStyle(0x45784f).fillRect(x + (px + 6) * s, base + py * s, pw * 0.4 * s, 4 * s);
  }
}

function shrubs(g: G, x: number, y: number, w: number): void {
  for (let i = 0; i < w; i += 26) {
    g.fillStyle(i % 52 === 0 ? 0x3d6e3f : 0x4a7d47).fillRect(x + i, y + (i % 52 === 0 ? 0 : 4), 26, 22);
  }
  g.fillStyle(0x2e5631).fillRect(x, y + 18, w, 4);
}

/** 가로등에 걸린 남색 학교 배너 두 장 (홍보 사진 속 "COME TO HUFS / MEET THE WORLD") */
function lampBanner(c: Ctx, x: number): void {
  const g = c.fg;
  const navy = 0x15204a;
  g.fillStyle(0xe9ecee).fillRect(x - 4, 62, 8, 238);
  g.fillStyle(0xbfc5ca).fillRect(x - 4, 62, 3, 238);
  g.fillStyle(0x8f979e).fillRect(x - 16, 54, 32, 10);
  g.fillStyle(0xf6f1cf).fillRect(x - 12, 64, 24, 4);
  g.fillStyle(0xcfd4d8).fillRect(x - 58, 86, 116, 3);
  for (const bx of [x - 56, x + 6]) {
    g.fillStyle(navy).fillRect(bx, 89, 50, 122);
    g.fillStyle(darker(navy, 6)).fillRect(bx + 44, 89, 6, 122);
    g.fillStyle(HUFS_GOLD).fillRect(bx, 208, 50, 3);
    for (let k = 1; k < 50; k += 3) g.fillRect(bx + k, 211, 2, 9);
  }
  hufsImage(c.scene, HUFS_KEYS.line, x - 31, 124, { h: 36, tint: HUFS_GOLD, depth: D_FRONT_LOGO });
  hufsImage(c.scene, HUFS_KEYS.type, x - 31, 166, { w: 36, tint: HUFS_GOLD, depth: D_FRONT_LOGO });
  text(c, x + 31, 150, 'COME TO\nHUFS\nMEET THE\nWORLD', 8, '#e0bb62', { serif: true, depth: D_FRONT_LOGO, lineSpacing: 4 });
}

/** 화강암 건물 표지석 */
function plaque(c: Ctx, x: number, y: number, ko: string, en: string): void {
  const g = c.g;
  g.fillStyle(0x7d7a75).fillRect(x - 66, y - 18, 132, 36);
  g.fillStyle(0x93908a).fillRect(x - 66, y - 18, 132, 5);
  g.fillStyle(0x5f5d59).fillRect(x - 66, y + 14, 132, 4);
  text(c, x, y - 4, ko, 13, '#f0d9a0');
  text(c, x, y + 9, en, 8, '#e8dcc0', { bold: false, serif: true });
}

/** 홍보 사진 속 본관 앞 잔디의 "HUFS" 꽃글씨 화단 */
function hufsFlowerBed(c: Ctx, x: number, y: number, w: number): void {
  const g = c.g;
  g.fillStyle(0x76a04a).fillRect(x, y, w, 40);
  for (let i = 0; i < w / 6; i++) {
    g.fillStyle(0x5f8a3a).fillRect(x + c.rnd.between(0, w - 4), y + c.rnd.between(0, 36), 4, 3);
  }
  g.fillStyle(0xa9a191).fillRect(x - 4, y + 40, w + 8, 8);
  const glyphs: Record<string, string[]> = {
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  };
  const cell = 5;
  const gap = 9;
  const total = 4 * 5 * cell + 3 * gap;
  let lx = x + w / 2 - total / 2;
  for (const ch of 'HUFS') {
    glyphs[ch].forEach((row, ry) =>
      [...row].forEach((b, rx) => {
        if (b !== '1') return;
        g.fillStyle((rx + ry) % 2 ? 0xf7c843 : 0xf29a1b).fillRect(lx + rx * cell, y + 3 + ry * cell, cell, cell);
      }),
    );
    lx += 5 * cell + gap;
  }
}

/** 운동장 철망 울타리 */
function fence(g: G, ox: number, w: number, top: number, bottom: number): void {
  g.lineStyle(1, 0x2f4a3a, 0.35);
  for (let x = ox; x <= ox + w; x += 9) g.lineBetween(x, top, x, bottom);
  for (let y = top; y <= bottom; y += 9) g.lineBetween(ox, y, ox + w, y);
  g.fillStyle(0x2c4536);
  for (let x = ox + 20; x < ox + w; x += 160) g.fillRect(x, top - 6, 6, bottom - top + 6);
  g.fillRect(ox, top - 6, w, 3);
}

/** 먼 산과 아파트 (운동장·국제학사 쪽 원경) */
function skyline(c: Ctx, ox: number): void {
  const g = c.g;
  const hill = c.time === 'dusk' ? 0x5b6b58 : c.time === 'late' ? 0x627a63 : 0x6f8b74;
  g.fillStyle(hill).fillRect(ox, 214, 960, 88);
  for (let x = 0; x < 960; x += 40) {
    const h = 18 + Math.round(16 * Math.sin((ox + x) / 170) + 10 * Math.sin((ox + x) / 53));
    g.fillStyle(hill).fillRect(ox + x, 214 - h, 40, h);
  }
  for (let x = ox + c.rnd.between(0, 40); x < ox + 940; x += c.rnd.between(80, 130)) {
    const w = c.rnd.between(40, 62);
    const h = c.rnd.between(70, 140);
    g.fillStyle(0xd8cdc3).fillRect(x, 262 - h, w, h);
    g.fillStyle(0xbfb2a6).fillRect(x + w - 8, 262 - h, 8, h);
    for (let yy = 262 - h + 8; yy < 256; yy += 12) {
      g.fillStyle(lit(c, 0.25) ? 0xffd98a : 0x8c8077, 0.7).fillRect(x + 6, yy, w - 18, 3);
    }
  }
}

// ---------- 1스테이지: 본관 → 사회과학관 ----------

function marbleRoom(g: G, ox: number): void {
  g.fillStyle(0xeee6d4).fillRect(ox, 0, 960, 300);
  g.lineStyle(1, 0xe0d5bd, 0.8);
  for (let i = 0; i < 14; i++) {
    const x = ox + 30 + i * 68;
    g.lineBetween(x, 40, x + 24, 120);
    g.lineBetween(x + 10, 150, x - 8, 230);
  }
  g.fillStyle(0xe2d8c2).fillRect(ox, 0, 960, 26);
  g.fillStyle(0xd2c4a6).fillRect(ox, 26, 960, 6);
  g.fillStyle(0xdccfb4).fillRect(ox, 246, 960, 46);
  g.lineStyle(1, 0xc6b796, 1);
  g.lineBetween(ox, 246, ox + 960, 246);
  for (let x = ox; x <= ox + 960; x += 96) g.lineBetween(x, 246, x, 292);
  g.fillStyle(0x7d6548).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xe2dccf, 0xcbc3b2);
}

/** 벽에 붙은 납작한 기둥 */
function pilaster(g: G, x: number): void {
  g.fillStyle(0xf4eee2).fillRect(x, 44, 34, 206);
  g.fillStyle(0xd8cdb6).fillRect(x + 28, 44, 6, 206);
  g.lineStyle(1, 0xd8ccb2, 1);
  for (const fx of [9, 17, 25]) g.lineBetween(x + fx, 50, x + fx, 244);
  g.fillStyle(0xe6dcc6).fillRect(x - 6, 32, 46, 12);
  g.fillStyle(0xcbbd9f).fillRect(x - 6, 34, 7, 7).fillRect(x + 33, 34, 7, 7);
  g.fillStyle(0xe6dcc6).fillRect(x - 4, 240, 42, 10);
}

/** 로비의 굵은 원기둥 */
function column(g: G, x: number): void {
  g.fillStyle(0xf3ede0).fillRect(x, 42, 44, 238);
  g.fillStyle(0xfbf8f1).fillRect(x + 4, 42, 8, 238);
  g.fillStyle(0xd9cdb5).fillRect(x + 34, 42, 10, 238);
  g.lineStyle(1, 0xe0d6c2, 1);
  for (const fx of [16, 24, 30]) g.lineBetween(x + fx, 46, x + fx, 276);
  g.fillStyle(0xe4d9c2).fillRect(x - 8, 30, 60, 14);
  g.fillStyle(0xcdbf9f).fillRect(x - 10, 33, 9, 9).fillRect(x + 45, 33, 9, 9);
  g.fillStyle(0xe0d5bd).fillRect(x - 6, 276, 56, 16);
}

function bonCounter(c: Ctx, ox: number): void {
  const g = c.g;
  marbleRoom(g, ox);
  pilaster(g, ox + 34);
  pilaster(g, ox + 892);

  // 학교 표지: 컬러 심벌 + 국문 로고타입
  logo(c, HUFS_KEYS.emblem, ox + 318, 98, { h: 88 });
  logo(c, HUFS_KEYS.wordmark, ox + 560, 88, { w: 330, tint: HUFS_NAVY });
  g.fillStyle(0xb08d57).fillRect(ox + 395, 114, 330, 2);
  text(c, ox + 560, 130, '본관 민원 창구 · Main Building', 15, '#7a6440');

  // 대기 번호 전광판
  g.fillStyle(0x111318).fillRect(ox + 786, 30, 124, 40);
  g.lineStyle(2, 0x7d6548, 1).strokeRect(ox + 786, 30, 124, 40);
  text(c, ox + 848, 50, '대기 087', 18, '#ff4d4d');

  // 벽시계 4시 52분
  g.fillStyle(0xffffff).fillCircle(ox + 120, 108, 20);
  g.lineStyle(3, 0x5a4632, 1).strokeCircle(ox + 120, 108, 20);
  g.lineStyle(3, 0x333333, 1).lineBetween(ox + 120, 108, ox + 109, 98).lineBetween(ox + 120, 108, ox + 125, 118);
  text(c, ox + 120, 138, '16:52', 12, '#5a4632');

  // 창구 3개 (놋쇠 틀 유리)
  for (let i = 0; i < 3; i++) {
    const x = ox + 110 + i * 260;
    g.fillStyle(0xb08d57).fillRect(x - 5, 145, 230, 88);
    g.fillStyle(0xd6ebf3).fillRect(x, 150, 220, 78);
    g.fillStyle(0xffffff, 0.35).fillRect(x + 12, 150, 30, 78);
    g.fillStyle(0xb08d57).fillRect(x + 108, 150, 4, 78);
    g.fillStyle(0x9fb7c2).fillRect(x + 70, 210, 80, 18);
  }
  g.fillStyle(0x5a4330).fillRect(ox + 90, 228, 780, 12);
  g.fillStyle(0x7a5a40).fillRect(ox + 96, 240, 768, 52);
  for (let i = 0; i < 3; i++) {
    g.lineStyle(2, 0x5f4632, 1).strokeRect(ox + 110 + i * 260, 248, 220, 36);
    text(c, ox + 220 + i * 260, 266, `창구 ${i + 1}`, 14, '#f6efe0');
  }
}

function board(g: G, rnd: Rnd, x: number, y: number, w: number, h: number, n: number): void {
  g.fillStyle(0xc79a62).fillRect(x, y, w, h);
  g.lineStyle(4, 0x7a5b3e, 1).strokeRect(x, y, w, h);
  const cols = Math.max(1, Math.floor((w - 20) / 86));
  for (let i = 0; i < n; i++) {
    const cx = x + 14 + (i % cols) * 86 + rnd.between(-5, 5);
    const cy = y + 12 + Math.floor(i / cols) * 46;
    if (cy + 36 > y + h) break;
    g.fillStyle(0xffffff, 0.95).fillRect(cx, cy, 62, 36);
  }
}

/** 청록 세로 현수막 (흰 심벌 + HUFS) */
function tealBanner(c: Ctx, x: number, top: number, h: number, wall: number): void {
  const g = c.g;
  g.fillStyle(0xb08d57).fillRect(x - 30, top - 4, 60, 4);
  g.fillStyle(0x13707a).fillRect(x - 24, top, 48, h);
  g.fillStyle(0x0f5f68).fillRect(x + 18, top, 6, h);
  g.fillStyle(wall).fillTriangle(x - 24, top + h, x + 24, top + h, x, top + h - 14);
  logo(c, HUFS_KEYS.line, x - 2, top + 30, { h: 34, tint: 0xffffff });
  logo(c, HUFS_KEYS.type, x - 2, top + 66, { w: 36, tint: 0xffffff });
}

function bonLobby(c: Ctx, ox: number): void {
  const g = c.g;
  marbleRoom(g, ox);
  column(g, ox + 20);
  column(g, ox + 420);
  column(g, ox + 896);

  board(g, c.rnd, ox + 96, 92, 280, 140, 9);
  text(c, ox + 236, 250, '공지 게시판', 16, '#3b3326');
  tealBanner(c, ox + 520, 44, 150, 0xeee6d4);

  // 본관 정문 유리문 너머로 바깥 잔디와 은행나무
  const dx = ox + 596;
  const dw = 280;
  g.fillStyle(0x4a3c2b).fillRect(dx - 10, 92, dw + 20, 200);
  g.fillStyle(0xbcd9ef).fillRect(dx, 102, dw, 130);
  g.fillStyle(0x6b4a2f).fillRect(dx + 196, 160, 10, 72);
  crown(g, dx + 200, 112, 96, 80, 0xf0c02c);
  g.fillStyle(0x87b45d).fillRect(dx, 222, dw, 30);
  g.fillStyle(0xd9d3c8).fillRect(dx, 252, dw, 40);
  g.fillStyle(0xffffff, 0.18).fillRect(dx, 102, dw, 190);
  g.fillStyle(0x4a3c2b);
  for (const f of [0.25, 0.5, 0.75]) g.fillRect(dx + dw * f - 2, 102, 4, 190);
  g.fillRect(dx, 140, dw, 4);
  g.fillStyle(0xd9b45a).fillRect(dx + dw / 2 - 14, 200, 4, 36).fillRect(dx + dw / 2 + 10, 200, 4, 36);
  text(c, dx + dw / 2, 78, '본관 정문 · Main Building', 15, '#5a4632');

  // 바닥 가운데 상감 심벌
  g.fillStyle(0xcfc5b1).fillEllipse(ox + 470, 428, 214, 80);
  g.fillStyle(0xe9e3d6).fillEllipse(ox + 470, 428, 194, 70);
  logo(c, HUFS_KEYS.emblem, ox + 470, 428, { h: 176, squash: 0.36, alpha: 0.95 });
}

interface MainOpts {
  left?: boolean;
  right?: boolean;
}

/** 본관: 가운데 박공(기둥 8개) 위로 탑이 솟고, 양쪽 날개 끝에 작은 박공이 있다. cx = 박공 가운데 */
function mainBuilding(c: Ctx, cx: number, o: MainOpts): void {
  const g = c.g;
  const stone = 0xe9e1cf;
  const stoneL = 0xf3ecdd;
  const stoneD = 0xd6ccb8;
  const glass = 0x4f8c86;
  const shadow = 0x857d6f;

  // 날개
  if (o.left) wing(c, cx - 660, cx - 220, 'left');
  if (o.right) wing(c, cx + 220, cx + 660, 'right');

  // 탑 (꼭대기 표지: 심벌 + 한국외국어대학교). 실제처럼 가늘고 높게
  const tw = 140;
  const tx = cx - tw / 2;
  g.fillStyle(stoneD).fillRect(tx - 6, 4, tw + 12, 6);
  g.fillStyle(0xd9d0bd).fillRect(tx - 10, 10, tw + 20, 9);
  g.fillStyle(0xe4dbc8).fillRect(tx, 19, tw, 24);
  g.fillStyle(stone).fillRect(tx, 43, tw, 113);
  for (let i = 0; i < 5; i++) {
    const x = tx + 8 + i * 26;
    g.fillStyle(stoneD).fillRect(x + 18, 43, 5, 113);
    for (let r = 0; r < 7; r++) g.fillStyle(glass).fillRect(x + 3, 49 + r * 15, 12, 9);
  }
  g.fillStyle(0x16767a).fillRect(cx - 12, 50, 24, 90);
  logo(c, HUFS_KEYS.line, cx, 64, { h: 16, tint: 0xffffff });
  logo(c, HUFS_KEYS.line, tx + 15, 31, { h: 17, tint: HUFS_NAVY });
  logo(c, HUFS_KEYS.wordmark, tx + 80, 31, { w: 100, tint: HUFS_NAVY });

  // 탑 아래 4층 몸체
  g.fillStyle(stoneD).fillRect(cx - 230, 146, 460, 8);
  g.fillStyle(stone).fillRect(cx - 220, 154, 440, 138);
  for (const sx of [cx - 212, cx + 176]) windowsGrid(g, sx, 166, 2, 3, 20, 36, 12, 22, glass, stoneD);

  // 박공 현관
  const pl = cx - 164;
  const pr = cx + 164;
  g.fillStyle(shadow).fillRect(pl + 8, 210, pr - pl - 16, 72);
  g.fillStyle(0x3c4c4e).fillRect(cx - 22, 236, 44, 46);
  g.fillStyle(0x3c4c4e).fillRect(cx - 110, 242, 30, 40).fillRect(cx + 80, 242, 30, 40);
  g.fillStyle(stoneL).fillTriangle(pl - 6, 196, pr + 6, 196, cx, 148);
  g.fillStyle(stoneD).fillTriangle(pl + 18, 191, pr - 18, 191, cx, 158);
  g.fillStyle(0xe7dfcd).fillTriangle(pl + 24, 189, pr - 24, 189, cx, 162);
  logo(c, HUFS_KEYS.emblem, cx, 179, { h: 22 });
  g.fillStyle(stoneD).fillRect(pl - 8, 196, pr - pl + 16, 4);
  g.fillStyle(stone).fillRect(pl - 4, 200, pr - pl + 8, 12);
  text(c, cx, 206, 'HANKUK UNIVERSITY OF FOREIGN STUDIES', 8, '#7b6c52', { serif: true });
  for (let i = 0; i < 8; i++) {
    const x = pl + 6 + i * 42.8;
    g.fillStyle(stoneL).fillRect(x, 218, 16, 62);
    g.fillStyle(stoneD).fillRect(x + 11, 218, 5, 62);
    g.fillStyle(0xddd3bf).fillRect(x - 4, 212, 24, 7);
    g.fillStyle(0xcbbd9f).fillRect(x - 5, 213, 5, 5).fillRect(x + 16, 213, 5, 5);
    g.fillStyle(0xddd3bf).fillRect(x - 3, 277, 22, 5);
  }
  g.fillStyle(0xd8cfbe).fillRect(pl - 14, 282, pr - pl + 28, 6);
  g.fillStyle(0xcdc4b2).fillRect(pl - 26, 288, pr - pl + 52, 6);
  g.fillStyle(0xc2b9a7).fillRect(pl - 38, 294, pr - pl + 76, 8);
}

/** 본관 날개 (3층 + 난간, 바깥 끝에 작은 박공 현관) */
function wing(c: Ctx, x0: number, x1: number, side: 'left' | 'right'): void {
  const g = c.g;
  const stone = 0xe9e1cf;
  const stoneL = 0xf3ecdd;
  const stoneD = 0xd6ccb8;
  g.fillStyle(0xe4dbc8).fillRect(x0, 150, x1 - x0, 4);
  for (let x = x0 + 4; x < x1; x += 10) g.fillStyle(0xddd3bf).fillRect(x, 154, 5, 6);
  g.fillStyle(stoneD).fillRect(x0, 160, x1 - x0, 6);
  g.fillStyle(stone).fillRect(x0, 166, x1 - x0, 126);
  const pv0 = side === 'left' ? x0 + 10 : x1 - 180;
  const pv1 = pv0 + 170;
  for (let x = x0 + 14; x < x1 - 24; x += 36) {
    if (x + 18 > pv0 - 8 && x < pv1 + 8) continue;
    windowsGrid(g, x, 176, 1, 3, 0, 36, 18, 24, 0x4f8c86, stoneD);
    g.fillStyle(stoneD).fillRect(x + 26, 170, 4, 118);
  }
  const pcx = (pv0 + pv1) / 2;
  g.fillStyle(0x857d6f).fillRect(pv0 + 6, 186, pv1 - pv0 - 12, 94);
  g.fillStyle(stoneL).fillTriangle(pv0 - 6, 172, pv1 + 6, 172, pcx, 136);
  g.fillStyle(0xe7dfcd).fillTriangle(pv0 + 14, 168, pv1 - 14, 168, pcx, 148);
  g.fillStyle(stone).fillRect(pv0 - 4, 172, pv1 - pv0 + 8, 14);
  for (let i = 0; i < 4; i++) {
    const x = pv0 + 12 + i * 46;
    g.fillStyle(stoneL).fillRect(x, 186, 14, 94);
    g.fillStyle(stoneD).fillRect(x + 10, 186, 4, 94);
    g.fillStyle(0xddd3bf).fillRect(x - 3, 182, 20, 6);
  }
}

function bonFront(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  cloud(c, ox + 300, 70);
  cloud(c, ox + 830, 104, 0.8);
  mainBuilding(c, ox + 720, { left: true });
  g.fillStyle(0xbdb5a6).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xd9d3c8, 0xc5bfb2, { step: 90, slant: 50 });
  hufsFlowerBed(c, ox + 84, 252, 382);
  lampBanner(c, ox + 504);
  tree(c.fg, ox + 940, 300, 0xf0c02c, 0.9);
}

function socialScience(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  cloud(c, ox + 200, 46, 0.9);
  cloud(c, ox + 640, 34, 0.7);
  const x0 = ox + 30;
  const x1 = ox + 960;
  // 지붕 끝 브래킷 장식
  g.fillStyle(0xb7b2a9).fillRect(x0, 74, x1 - x0, 4);
  g.lineStyle(3, 0xa9a49b, 1);
  for (let x = x0 + 30; x < x1; x += 60) g.lineBetween(x, 92, x - 12, 78).lineBetween(x, 92, x + 12, 78);
  g.fillStyle(0x9b968e).fillRect(x0, 90, x1 - x0, 8);
  // 5개 층: 밝은 띠 + 안으로 들어간 창 띠
  for (let k = 0; k < 5; k++) {
    const y = 98 + k * 38;
    g.fillStyle(0xd9d5cc).fillRect(x0, y, x1 - x0, 11);
    g.fillStyle(0xb8b3aa).fillRect(x0, y + 11, x1 - x0, 2);
    g.fillStyle(0x8e959a).fillRect(x0, y + 13, x1 - x0, 25);
    for (let x = x0 + 8; x < x1 - 20; x += 28) {
      g.fillStyle(0x5a7184).fillRect(x, y + 16, 22, 19);
      g.fillStyle(0xffffff, 0.18).fillRect(x, y + 16, 7, 19);
    }
    for (let x = x0; x < x1; x += 112) g.fillStyle(0xcac5bb).fillRect(x, y + 13, 8, 25);
  }
  // 현관: 보라색 간판 + 캐노피 + 유리문
  const ex = ox + 410;
  g.fillStyle(0x3e5561).fillRect(ex, 250, 150, 42);
  g.fillStyle(0x9aa3a8);
  for (let i = 0; i <= 5; i++) g.fillRect(ex + i * 30 - 1, 250, 3, 42);
  g.fillStyle(0x6d7278).fillRect(ex - 14, 240, 178, 9);
  g.fillStyle(0x5a2a86).fillRect(ex + 2, 220, 146, 20);
  logo(c, HUFS_KEYS.line, ex + 18, 230, { h: 16, tint: 0xffffff });
  text(c, ex + 84, 230, '사회과학관', 12, '#ffffff');
  g.fillStyle(0xf2a7c6).fillRect(ox + 186, 256, 104, 22);
  text(c, ox + 238, 267, '학생 상담 주간', 10, '#7a1d48');

  g.fillStyle(0xa99486).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xcfa79a, 0xb98f82, { step: 70, slant: 40 });

  // 공지를 아무도 안 읽는 게시판 (보스 구역)
  const bx = ox + 650;
  const bw = 280;
  g.fillStyle(0x5e4430).fillRect(bx + 16, 250, 8, 48).fillRect(bx + bw - 24, 250, 8, 48);
  g.fillStyle(0xd0202f).fillRect(bx, 110, bw, 30);
  text(c, bx + bw / 2, 125, '공지 꼭 읽어 주세요!', 17, '#ffffff');
  g.fillStyle(0x7a5b3e).fillRect(bx, 140, bw, 116);
  board(g, c.rnd, bx + 8, 148, bw - 16, 100, 6);

  tree(c.fg, ox + 76, 300, 0xd9622b, 0.92);
  tree(c.fg, ox + 330, 300, 0xe39b2d, 0.85);
  lampBanner(c, ox + 590);
}

// ---------- 2스테이지: 교수학습개발원 → 인문과학관 ----------

function learningFront(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  cloud(c, ox + 360, 40, 0.8);
  // 뒷산
  g.fillStyle(0x6e8862).fillRect(ox, 214, 960, 88);
  for (let x = 0; x < 960; x += 48) g.fillStyle(0x6e8862).fillRect(ox + x, 214 - 10 - ((x * 7) % 30), 48, 40);

  // 건물: 흰 격자창 6층 + 떠 있는 평지붕
  const bx = ox + 150;
  const bw = 680;
  g.fillStyle(0x5f6468).fillRect(bx - 22, 72, bw + 44, 9);
  g.fillStyle(0x474b4f).fillRect(bx - 22, 81, bw + 44, 3);
  for (const px of [bx + 10, bx + bw / 2, bx + bw - 14]) g.fillStyle(0x8a8f93).fillRect(px, 84, 4, 12);
  g.fillStyle(0xf1f2ef).fillRect(bx, 96, bw, 196);
  g.fillStyle(0xe1e3e0).fillRect(bx, 96, bw, 6);
  const ex = bx + bw / 2;
  for (let r = 0; r < 6; r++) {
    for (let i = 0; i < 14; i++) {
      const x = bx + 14 + i * 47.6;
      const y = 108 + r * 30;
      if (r >= 4 && x > ex - 70 && x < ex + 50) continue;
      g.fillStyle(0xcfd5d6).fillRect(x - 2, y - 2, 34, 24);
      g.fillStyle(0x8db9c9).fillRect(x, y, 30, 20);
      g.fillStyle(0xffffff, 0.25).fillRect(x, y, 9, 20);
    }
  }
  // 현관
  g.fillStyle(0x4f6f7a).fillRect(ex - 44, 240, 88, 52);
  g.fillStyle(0xa9b4b8);
  for (let i = 0; i <= 4; i++) g.fillRect(ex - 44 + i * 22 - 1, 240, 3, 52);
  g.fillStyle(0x7c8286).fillRect(ex - 62, 234, 124, 6);
  g.fillStyle(HUFS_NAVY).fillRect(ex - 84, 212, 168, 20);
  logo(c, HUFS_KEYS.line, ex - 70, 222, { h: 14, tint: 0xffffff });
  text(c, ex + 8, 222, '교수학습개발원', 11, '#ffffff');
  shrubs(g, bx + 8, 270, 260);
  shrubs(g, ex + 70, 270, 252);
  g.fillStyle(0xd3d6d4).fillRect(ex - 70, 288, 140, 6);

  g.fillStyle(0xb9bcb9).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xd4d6d3, 0xc0c3c0, { step: 100, slant: 60 });
  pine(c.fg, ox + 860, 300, 1.25);
  lampBanner(c, ox + 82);
}

function modernRoom(g: G, ox: number, wall: number): void {
  g.fillStyle(wall).fillRect(ox, 0, 960, 300);
  g.fillStyle(0xe1e4e2).fillRect(ox, 0, 960, 24);
  for (let x = ox + 40; x < ox + 960; x += 120) g.fillStyle(0xffffff).fillRect(x, 10, 48, 4);
  g.fillStyle(0x8f9599).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xd8dcdf, 0xc4c8cb);
}

function learningLobby(c: Ctx, ox: number): void {
  const g = c.g;
  modernRoom(g, ox, 0xf3f4f1);
  g.fillStyle(0x13707a).fillRect(ox, 238, 960, 4);

  // 벽 간판
  logo(c, HUFS_KEYS.emblem, ox + 302, 92, { h: 60 });
  text(c, ox + 344, 80, '교수학습개발원', 26, '#002c52', { originX: 0 });
  text(c, ox + 346, 106, 'Institute of Teaching and Learning Development', 11, '#4b5563', { originX: 0, bold: false });
  g.fillStyle(0x13707a).fillRect(ox + 344, 120, 380, 3);

  // 유리 스터디룸 2칸
  for (let k = 0; k < 2; k++) {
    const x = ox + 40 + k * 190;
    const w = 180;
    g.fillStyle(0x7b8794).fillRect(x - 3, 137, w + 6, 155);
    g.fillStyle(0xd7edf3).fillRect(x, 140, w, 152);
    g.fillStyle(0xffffff).fillRect(x + 20, 164, 84, 40);
    g.lineStyle(2, 0x94a3b8, 1).strokeRect(x + 20, 164, 84, 40);
    g.fillStyle(0xb08c5e).fillRect(x + 28, 238, 124, 8);
    g.fillStyle(0x8a6a44).fillRect(x + 36, 246, 6, 34).fillRect(x + 138, 246, 6, 34);
    g.fillStyle(0x3d5a80).fillRect(x + 50, 222, 20, 16).fillRect(x + 110, 222, 20, 16);
    g.fillStyle(0xffffff, 0.35).fillRect(x + 120, 140, 18, 152);
    g.fillStyle(0x7b8794).fillRect(x + w - 50, 140, 3, 152);
    text(c, x + 62, 152, `스터디룸 ${k + 1}`, 11, '#334155');
  }

  // 라운지 테이블
  for (const tx of [ox + 480, ox + 604]) {
    g.fillStyle(0x9aa3ad).fillRect(tx - 3, 250, 6, 42);
    g.fillStyle(0xe9dcc0).fillRect(tx - 36, 244, 72, 8);
    g.fillStyle(0x6b7280).fillRect(tx - 14, 234, 24, 10);
    g.fillStyle(0x13707a).fillRect(tx - 56, 266, 18, 26).fillRect(tx + 38, 266, 18, 26);
  }

  // 안내 데스크 (결재 대기 구역)
  g.fillStyle(0xf8f8f6).fillRect(ox + 700, 204, 222, 14);
  g.fillStyle(0x13707a).fillRect(ox + 708, 218, 206, 74);
  g.fillStyle(0x2b2f38).fillRect(ox + 760, 180, 40, 26);
  text(c, ox + 811, 254, '안내', 18, '#ffffff');
}

/** 석등 */
function lantern(g: G, x: number, base: number, s: number): void {
  g.fillStyle(0x8f8d87).fillRect(x - 18 * s, base - 14 * s, 36 * s, 14 * s);
  g.fillStyle(0x9c9a94).fillRect(x - 6 * s, base - 60 * s, 12 * s, 46 * s);
  g.fillStyle(0xa7a59f).fillRect(x - 14 * s, base - 66 * s, 28 * s, 6 * s);
  g.fillStyle(0xa09e98).fillRect(x - 15 * s, base - 88 * s, 30 * s, 22 * s);
  g.fillStyle(0x4b4a46).fillRect(x - 6 * s, base - 82 * s, 12 * s, 12 * s);
  g.fillStyle(0x8a8882).fillRect(x - 24 * s, base - 98 * s, 48 * s, 10 * s);
  g.fillStyle(0x8a8882).fillRect(x - 8 * s, base - 108 * s, 16 * s, 10 * s);
}

function humanitiesFront(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  cloud(c, ox + 560, 40, 0.75);
  // 인문과학관: 7층 띠창 + 떠 있는 평지붕, 양 끝은 흰 계단실
  const bx = ox + 40;
  const bw = 920;
  g.fillStyle(0x5a5f63).fillRect(bx - 10, 64, bw + 10, 8);
  g.fillStyle(0x44484b).fillRect(bx - 10, 72, bw + 10, 3);
  for (let x = bx + 20; x < bx + bw; x += 150) g.fillStyle(0x8a8f93).fillRect(x, 75, 4, 10);
  g.fillStyle(0xd9dddd).fillRect(bx, 85, bw, 4);
  for (let k = 0; k < 7; k++) {
    const y = 89 + k * 25;
    g.fillStyle(0xeef0ef).fillRect(bx, y, bw, 7);
    g.fillStyle(k % 3 === 1 ? 0x8dc0cd : 0x7fb4c3).fillRect(bx, y + 7, bw, 18);
    g.fillStyle(0xdfe5e6);
    for (let x = bx; x < bx + bw; x += 24) g.fillRect(x, y + 7, 2, 18);
  }
  g.fillStyle(0xf3f4f2).fillRect(bx, 85, 56, 179);
  g.fillStyle(0xa9c7cf).fillRect(bx + 22, 95, 12, 160);
  g.fillStyle(0xf3f4f2).fillRect(ox + 904, 85, 56, 179);
  g.fillStyle(0x41606a).fillRect(ox + 440, 236, 80, 28);
  g.fillStyle(0x6d7377).fillRect(ox + 428, 232, 104, 5);
  g.fillStyle(0xc9cdcd).fillRect(bx, 264, bw, 4);

  // 모래 마당 + 디딤돌
  g.fillStyle(0xd9c9a1).fillRect(ox, 268, 960, 34);
  g.fillStyle(0xdccca6).fillRect(ox, 302, 960, 238);
  for (let i = 0; i < 220; i++) {
    g.fillStyle(i % 2 ? 0xc8b78e : 0xe8dcbc).fillRect(ox + c.rnd.between(0, 956), c.rnd.between(270, 536), 3, 2);
  }
  for (let i = 0; i < 12; i++) {
    const y = 272 + i * 22;
    const t = Math.max(0, (y - 272) / 268);
    const w = c.rnd.between(24, 36) * (0.6 + 0.6 * t);
    const x = ox + 480 + Math.sin(i * 0.8) * 26 + c.rnd.between(-5, 5);
    g.fillStyle(0x6e7276).fillRect(x - w / 2, y, w, 6 + 7 * t);
    g.fillStyle(0x8b9094).fillRect(x - w / 2, y, w, 2);
  }

  lantern(g, ox + 160, 298, 1.15);
  lantern(g, ox + 808, 298, 1.15);
  // 마당 가운데 흰 기념탑 (지구 모양)
  g.fillStyle(0xa7c4cf).fillRect(ox + 460, 270, 40, 28);
  g.fillStyle(0xf6f6f4).fillRect(ox + 472, 196, 16, 76);
  g.fillStyle(0xd9dcdc).fillRect(ox + 482, 196, 6, 76);
  g.fillStyle(0xf6f6f4).fillCircle(ox + 480, 184, 14);
  g.lineStyle(1, 0xc3cbcf, 1).strokeCircle(ox + 480, 184, 14);
  g.lineBetween(ox + 466, 184, ox + 494, 184).strokeEllipse(ox + 480, 184, 12, 28);
  plaque(c, ox + 600, 282, '인문과학관', 'Humanities Building');
  pine(c.fg, ox + 320, 300, 1.1);
  pine(c.fg, ox + 690, 300, 1.0);
  lampBanner(c, ox + 900);
}

function door(c: Ctx, x: number, sign: string): void {
  const g = c.g;
  g.fillStyle(0x8b6b4e).fillRect(x, 92, 130, 200);
  g.lineStyle(3, 0x5d4632, 1).strokeRect(x, 92, 130, 200);
  g.fillStyle(0xcfe6f3, 0.9).fillRect(x + 20, 150, 26, 60);
  g.fillStyle(0xd9c27a).fillCircle(x + 114, 196, 6);
  g.fillStyle(0xffffff).fillRect(x + 20, 112, 90, 28);
  text(c, x + 65, 126, sign, 14, '#3b3326');
}

function humanitiesHall(c: Ctx, ox: number): void {
  const g = c.g;
  modernRoom(g, ox, 0xeef0ec);
  g.fillStyle(0xbccbc8).fillRect(ox, 214, 960, 78);
  g.fillStyle(0x9fb3b0).fillRect(ox, 210, 960, 4);
  text(c, ox + 400, 66, '인문과학관 · 강의실', 16, '#475569');

  door(c, ox + 60, '강의실 101');
  door(c, ox + 250, '강의실 102');
  // 과제 제출함
  g.fillStyle(0xd0202f).fillRect(ox + 430, 200, 120, 92);
  g.fillStyle(0x111318).fillRect(ox + 450, 214, 80, 8);
  text(c, ox + 490, 250, '과제 제출함', 15, '#ffffff');
  // 학교 포스터
  g.fillStyle(HUFS_NAVY).fillRect(ox + 600, 70, 112, 150);
  g.lineStyle(2, HUFS_GOLD, 1).strokeRect(ox + 606, 76, 100, 138);
  logo(c, HUFS_KEYS.line, ox + 656, 112, { h: 50, tint: HUFS_GOLD });
  logo(c, HUFS_KEYS.type, ox + 656, 158, { w: 62, tint: HUFS_GOLD });
  text(c, ox + 656, 184, '2학기 학사 일정', 10, '#ffffff');
  text(c, ox + 656, 200, '과제 마감 엄수', 10, '#ffe066');
  // 마감 시계
  g.fillStyle(0xffffff).fillCircle(ox + 800, 120, 34);
  g.lineStyle(4, 0x333333, 1).strokeCircle(ox + 800, 120, 34);
  g.lineStyle(4, 0xd0202f, 1).lineBetween(ox + 800, 120, ox + 800, 92);
  g.lineStyle(4, 0x333333, 1).lineBetween(ox + 800, 120, ox + 818, 132);
  text(c, ox + 800, 170, '마감 1분 전', 15, '#d0202f');
}

// ---------- 3스테이지: 국제학사 → 운동장 (해 질 녘) ----------

/** 해가 기울면 창 일부에 불이 켜져 있다 (낮에는 꺼져 있다) */
function litWindows(c: Ctx, x: number, y: number, cols: number, rows: number, dx: number, dy: number, ww: number, wh: number): void {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      c.g.fillStyle(lit(c, 0.3) ? 0xffd98a : 0x6e8fa0).fillRect(x + i * dx, y + r * dy, ww, wh);
    }
  }
}

function dormFront(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  skyline(c, ox);
  // 왼쪽 동
  g.fillStyle(0xd8d4cc).fillRect(ox + 30, 122, 320, 6);
  g.fillStyle(0xe9e6df).fillRect(ox + 30, 128, 320, 164);
  litWindows(c, ox + 44, 138, 10, 7, 30, 21, 16, 12);
  // 가운데 탑: 학생회관 및 기숙사(국제학사)
  const tx = ox + 360;
  const tw = 200;
  g.fillStyle(0xdcd8cf).fillRect(tx - 8, 56, tw + 16, 10);
  g.fillStyle(0xf2f0ea).fillRect(tx, 66, tw, 226);
  g.fillStyle(0x5fa8ad).fillRect(tx + 20, 72, tw - 40, 26);
  for (const wx of [tx + 14, tx + 36, tx + 150, tx + 172]) {
    for (let y = 106; y < 214; y += 15) g.fillStyle(lit(c, 0.3) ? 0xffd98a : 0x6e8fa0).fillRect(wx, y, 14, 9);
  }
  g.fillStyle(0xffffff).fillRect(tx + 78, 102, 44, 94);
  g.fillStyle(0x13858b).fillRect(tx + 80, 104, 40, 90);
  logo(c, HUFS_KEYS.line, tx + 100, 122, { h: 26, tint: 0xffffff });
  text(c, tx + 100, 166, [...'한국외대'].join('\n'), 10, '#ffffff', { lineSpacing: -1 });
  g.fillStyle(0x3d8f96).fillRect(tx + 30, 228, 140, 64);
  g.fillStyle(0xa9d3d6);
  for (let i = 0; i <= 7; i++) g.fillRect(tx + 30 + i * 20 - 1, 228, 2, 64);
  g.fillStyle(0x9aa2a6).fillRect(tx + 14, 220, 172, 8);
  g.fillStyle(HUFS_NAVY).fillRect(tx + 30, 202, 140, 17);
  text(c, tx + 100, 210, '학생회관 · 국제학사', 10, '#ffffff');
  // 오른쪽 동 (더 높다)
  g.fillStyle(0xd8d4cc).fillRect(ox + 590, 84, 350, 6);
  g.fillStyle(0xeceae4).fillRect(ox + 590, 90, 350, 202);
  litWindows(c, ox + 604, 100, 10, 9, 30, 21, 16, 12);
  g.fillStyle(0x13858b).fillRect(ox + 900, 112, 26, 96);
  logo(c, HUFS_KEYS.line, ox + 913, 130, { h: 18, tint: 0xffffff });

  g.fillStyle(0xa97f68).fillRect(ox, 292, 960, 10);
  floor(g, ox, 960, 0xc59a82, 0xb08670, { step: 60, slant: 30 });
  tree(c.fg, ox + 22, 300, 0xf0c02c, 0.85);
  lampBanner(c, ox + 575);
}

function stands(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  skyline(c, ox);
  // 운동장 건너편: 잔디와 트랙
  g.fillStyle(0x3e8e47).fillRect(ox, 214, 960, 30);
  g.fillStyle(0xf4f4f4).fillRect(ox, 228, 960, 2);
  g.fillStyle(0xb4523d).fillRect(ox, 244, 960, 12);
  fence(g, ox, 960, 96, 256);
  // 울타리 현수막
  g.fillStyle(HUFS_NAVY).fillRect(ox + 300, 150, 400, 46);
  g.fillStyle(HUFS_GOLD).fillRect(ox + 300, 150, 400, 2).fillRect(ox + 300, 194, 400, 2);
  logo(c, HUFS_KEYS.line, ox + 330, 173, { h: 36, tint: HUFS_GOLD });
  logo(c, HUFS_KEYS.type, ox + 392, 173, { w: 64, tint: HUFS_GOLD });
  text(c, ox + 438, 173, '한국외국어대학교 대운동장', 15, '#ffffff', { originX: 0 });
  // 콘크리트 스탠드
  for (let k = 0; k < 4; k++) {
    const y = 256 + k * 11;
    g.fillStyle(0xc9c5bd).fillRect(ox, y, 960, 6);
    g.fillStyle(0xa9a59d).fillRect(ox, y + 6, 960, 5);
  }
  floor(g, ox, 960, 0xbdb9b1, 0xa9a59d, { step: 110, slant: 60 });
  tree(c.fg, ox + 110, 300, 0xe08a2c, 0.9);
  tree(c.fg, ox + 860, 300, 0xd65a2c, 0.85);
}

function track(c: Ctx, ox: number): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  skyline(c, ox);
  // 멀리 보이는 본관 (탑 + 박공 현관)
  const mx = ox + 765;
  g.fillStyle(0xd7ccba).fillRect(mx - 26, 92, 52, 5);
  g.fillStyle(0xe3d8c6).fillRect(mx - 22, 97, 44, 9);
  logo(c, HUFS_KEYS.line, mx - 12, 101, { h: 7, tint: HUFS_NAVY });
  g.fillStyle(0xe9e0cf).fillRect(mx - 22, 106, 44, 92);
  for (let y = 110; y < 192; y += 7) g.fillStyle(0x6f8f8a).fillRect(mx - 17, y, 34, 3);
  g.fillStyle(0x16767a).fillRect(mx - 4, 112, 8, 40);
  g.fillStyle(0xe9e0cf).fillRect(mx - 110, 176, 220, 40);
  g.fillStyle(0xf3ecdd).fillTriangle(mx - 52, 184, mx + 52, 184, mx, 166);
  g.fillStyle(0xd6ccb8);
  for (let i = 0; i < 8; i++) g.fillRect(mx - 46 + i * 13, 186, 4, 24);
  fence(g, ox, 960, 100, 214);
  g.fillStyle(HUFS_NAVY).fillRect(ox + 90, 150, 340, 40);
  logo(c, HUFS_KEYS.line, ox + 114, 170, { h: 30, tint: HUFS_GOLD });
  text(c, ox + 136, 170, 'COME TO HUFS · MEET THE WORLD', 14, '#e0bb62', { serif: true, originX: 0 });
  // 잔디 + 골대
  for (let x = 0; x < 960; x += 80) g.fillStyle((x / 80) % 2 ? 0x46a051 : 0x3f9248).fillRect(ox + x, 206, 80, 56);
  g.fillStyle(0xf4f4f4).fillRect(ox, 216, 960, 2);
  g.lineStyle(1, 0xffffff, 0.45);
  for (let x = ox + 644; x < ox + 760; x += 8) g.lineBetween(x, 218, x, 260);
  for (let y = 218; y < 260; y += 8) g.lineBetween(ox + 644, y, ox + 760, y);
  g.fillStyle(0xffffff).fillRect(ox + 640, 214, 4, 46).fillRect(ox + 760, 214, 4, 46).fillRect(ox + 640, 214, 124, 4);
  // 트랙 (바닥까지 이어진다)
  g.fillStyle(0xb84d3a).fillRect(ox, 262, 960, 40);
  g.fillStyle(0xefe2dc).fillRect(ox, 272, 960, 2).fillRect(ox, 286, 960, 2);
  floor(g, ox, 960, 0xc0533d, 0xefe2dc, { step: 0 });
}

function fieldCenter(c: Ctx, ox: number, exit: boolean): void {
  const g = c.g;
  sky(g, ox, 960, c.bands);
  if (c.time === 'dusk') g.fillStyle(0xfff0c0, 0.95).fillCircle(ox + 700, 226, 30);
  skyline(c, ox);
  fence(g, ox, 960, 100, 212);
  // 대형 현수막
  g.fillStyle(HUFS_NAVY).fillRect(ox + 230, 140, 470, 56);
  g.fillStyle(HUFS_GOLD).fillRect(ox + 230, 140, 470, 2).fillRect(ox + 230, 194, 470, 2);
  logo(c, HUFS_KEYS.line, ox + 264, 168, { h: 46, tint: 0xffffff });
  logo(c, HUFS_KEYS.type, ox + 340, 168, { w: 84, tint: 0xffffff });
  text(c, ox + 396, 159, 'Hankuk University of Foreign Studies', 12, '#ffffff', { serif: true, originX: 0 });
  text(c, ox + 396, 178, '한국외국어대학교', 13, '#ffffff', { originX: 0 });
  // 잔디 줄무늬 (먼 쪽 + 바닥)
  for (let x = 0; x < 960; x += 80) {
    const col = (x / 80) % 2 ? 0x47a552 : 0x3f9a4a;
    g.fillStyle(col).fillRect(ox + x, 212, 80, 328);
  }
  g.fillStyle(0xf4f4f4, 0.9).fillRect(ox + 478, 212, 4, 328);
  g.lineStyle(4, 0xf4f4f4, 0.9).strokeEllipse(ox + 480, 430, 340, 124);
  logo(c, HUFS_KEYS.emblem, ox + 480, 430, { h: 190, squash: 0.36, alpha: 0.9 });
  if (exit) {
    g.fillStyle(0x555a60).fillRect(ox + 867, 270, 6, 32);
    g.fillStyle(0x2f8f4e).fillRect(ox + 800, 236, 140, 34);
    text(c, ox + 870, 253, '퇴근 (정문) →', 15, '#ffffff');
  }
}

// ---------- 학생 모드 3스테이지 끝: 본관 총장실 ----------

const BOOK_COLORS = [0x7a1f2b, 0x1f3a6b, 0x2f5d3a, 0x6b4a2a, 0x3d3d55, 0x8a6d1f, 0x5b2a4a];

/** 본관 총장실 (가상의 방 — 실제 총장실을 본뜨지 않았다). 나무 판벽, 큰 책상, 남색 학교 깃발, 책장, 캠퍼스가 보이는 창, 문패 */
function presidentOffice(c: Ctx, ox: number): void {
  const g = c.g;
  const wood = 0x6b4428;
  const woodD = 0x4f311c;
  const woodL = 0x8a5a36;

  // 위쪽 벽: 크림색 벽지와 옅은 세로 줄무늬, 천장 몰딩
  g.fillStyle(0xefe6cf).fillRect(ox, 0, 960, 300);
  for (let x = ox + 6; x < ox + 960; x += 28) g.fillStyle(0xe7dcc1).fillRect(x, 20, 12, 140);
  g.fillStyle(woodD).fillRect(ox, 0, 960, 12);
  g.fillStyle(woodL).fillRect(ox, 12, 960, 6);
  // 징두리 판벽과 걸레받이
  g.fillStyle(wood).fillRect(ox, 160, 960, 124);
  g.fillStyle(woodL).fillRect(ox, 160, 960, 7);
  g.fillStyle(woodD).fillRect(ox, 167, 960, 3);
  for (let x = ox + 14; x < ox + 950; x += 116) {
    g.fillStyle(woodD).fillRect(x, 182, 100, 92);
    g.fillStyle(0x76492b).fillRect(x + 5, 187, 90, 82);
    g.fillStyle(woodL, 0.5).fillRect(x + 5, 187, 90, 4);
  }
  g.fillStyle(0x3a2414).fillRect(ox, 284, 960, 18);
  g.fillStyle(woodD).fillRect(ox, 0, 8, 302);

  // 바닥: 나무 마루 + 남색 카펫 (금색 테두리, 가운데 금색 심벌)
  floor(g, ox, 960, 0x9a6a40, 0x7d522f, { step: 64, slant: 0 });
  g.fillStyle(0x1b2a52).fillRect(ox + 140, 334, 680, 190);
  g.lineStyle(3, HUFS_GOLD, 0.9).strokeRect(ox + 152, 344, 656, 170);
  g.lineStyle(1, HUFS_GOLD, 0.6).strokeRect(ox + 160, 350, 640, 158);
  logo(c, HUFS_KEYS.line, ox + 480, 428, { h: 150, squash: 0.36, tint: HUFS_GOLD, alpha: 0.5 });

  // 출입문과 문패 (로비에서 들어온 왼쪽 문)
  const dx = ox + 26;
  g.fillStyle(woodD).fillRect(dx - 8, 92, 136, 200);
  g.fillStyle(0x7a4c2c).fillRect(dx, 100, 58, 192).fillRect(dx + 62, 100, 58, 192);
  for (const lx of [dx + 8, dx + 70]) {
    g.fillStyle(0x6a4126).fillRect(lx, 142, 42, 58).fillRect(lx, 210, 42, 66);
    g.fillStyle(0x86563a).fillRect(lx, 142, 42, 3).fillRect(lx, 210, 42, 3);
  }
  g.fillStyle(0xd9b44a).fillRect(dx + 50, 200, 4, 22).fillRect(dx + 66, 200, 4, 22);
  g.fillStyle(0xd9b44a).fillRect(dx + 16, 108, 88, 26);
  g.fillStyle(0xb08d3a).fillRect(dx + 16, 130, 88, 4);
  text(c, dx + 60, 120, '총장실', 15, '#3a2414');

  // 창: 해 질 녘 캠퍼스 (먼 산, 건물, 대운동장)
  const wx = ox + 206;
  const wy = 92; // HUD(왼쪽 위 12~256 × 10~82)에 걸리지 않게 조금 내린다
  const ww = 226;
  const wh = 156;
  const bh = Math.ceil((wh * 0.62) / SKY_DUSK.length);
  SKY_DUSK.forEach((col, i) => g.fillStyle(col).fillRect(wx, wy + i * bh, ww, bh + 1));
  g.fillStyle(0xfff0c0, 0.95).fillCircle(wx + 172, wy + 88, 12);
  g.fillStyle(0x5b6b58).fillRect(wx, wy + 92, ww, 30);
  for (let x = 0; x < ww; x += 18) g.fillStyle(0x5b6b58).fillRect(wx + x, wy + 84 + ((x * 7) % 10), 18, 10);
  for (const [bx, bw, bt] of [
    [8, 44, 70],
    [60, 30, 84],
    [124, 52, 64],
    [184, 34, 80],
  ]) {
    g.fillStyle(0xd8cdc3).fillRect(wx + bx, wy + bt, bw, 122 - bt);
    g.fillStyle(0xbfb2a6).fillRect(wx + bx + bw - 6, wy + bt, 6, 122 - bt);
    for (let yy = wy + bt + 6; yy < wy + 116; yy += 9) {
      g.fillStyle(c.rnd.frac() < 0.35 ? 0xffd98a : 0x8c8077, 0.8).fillRect(wx + bx + 4, yy, bw - 12, 3);
    }
  }
  g.fillStyle(0x3f9a4a).fillRect(wx, wy + 122, ww, 20);
  g.fillStyle(0xf4f4f4).fillRect(wx + ww / 2 - 1, wy + 122, 2, 20);
  g.fillStyle(0xb84d3a).fillRect(wx, wy + 142, ww, 14);
  crown(g, wx + 18, wy + 98, 34, 30, 0xd9622b);
  crown(g, wx + 206, wy + 100, 30, 26, 0xe39b2d);
  // 창틀·창살·창턱
  g.fillStyle(0xf3ecdd);
  g.fillRect(wx - 8, wy - 8, ww + 16, 8).fillRect(wx - 8, wy + wh, ww + 16, 8);
  g.fillRect(wx - 8, wy, 8, wh).fillRect(wx + ww, wy, 8, wh);
  g.fillRect(wx + ww / 2 - 3, wy, 6, wh).fillRect(wx, wy + 60, ww, 5);
  g.fillStyle(0xd9cfbb).fillRect(wx - 14, wy + wh + 8, ww + 28, 6);
  // 남색 커튼과 금색 끈
  g.fillStyle(woodD).fillRect(wx - 40, wy - 20, ww + 80, 10);
  for (const cx of [wx - 38, wx + ww + 6]) {
    g.fillStyle(0x1b2a52).fillRect(cx, wy - 10, 32, wh + 30);
    g.fillStyle(0x15213f).fillRect(cx + 8, wy - 10, 4, wh + 30).fillRect(cx + 20, wy - 10, 4, wh + 30);
    g.fillStyle(HUFS_GOLD).fillRect(cx - 2, wy + 96, 36, 5);
  }

  // 책장
  const bx = ox + 486;
  const by = 66;
  const bw = 140;
  g.fillStyle(woodD).fillRect(bx, by, bw, 218);
  for (let k = 0; k < 4; k++) {
    const sy = by + 10 + k * 52;
    g.fillStyle(0x2e1c10).fillRect(bx + 8, sy, bw - 16, 44);
    let x = bx + 10;
    while (x < bx + bw - 22) {
      const w = c.rnd.between(6, 11);
      const h = c.rnd.between(30, 42);
      g.fillStyle(c.rnd.pick(BOOK_COLORS)).fillRect(x, sy + 44 - h, w, h);
      g.fillStyle(0xd9b44a, 0.7).fillRect(x + 1, sy + 48 - h, w - 2, 2);
      x += w + 1;
      if (c.rnd.frac() < 0.12) x += 10;
    }
    g.fillStyle(woodL).fillRect(bx + 4, sy + 44, bw - 8, 6);
  }

  // 남색 학교 깃발 (흰 심벌 + HUFS)
  const px = ox + 930;
  g.fillStyle(0xd9b44a).fillCircle(px + 2, 74, 6);
  g.fillStyle(0xb9a46a).fillRect(px, 78, 5, 214);
  g.fillStyle(0x6b5a3a).fillRect(px - 14, 284, 33, 8);
  const fx0 = px - 124;
  g.fillStyle(HUFS_NAVY).fillRect(fx0, 84, 124, 82);
  for (let k = 0; k < 4; k++) g.fillStyle(0x001d38, 0.6).fillRect(fx0 + 14 + k * 30, 84, 8, 82);
  g.fillStyle(HUFS_GOLD).fillRect(fx0, 164, 124, 3);
  for (let k = 2; k < 124; k += 4) g.fillRect(fx0 + k, 167, 2, 6);
  logo(c, HUFS_KEYS.line, fx0 + 36, 122, { h: 46, tint: 0xffffff });
  logo(c, HUFS_KEYS.type, fx0 + 88, 122, { w: 52, tint: 0xffffff });

  // 높은 의자 (책상 뒤)
  g.fillStyle(0x3b1f1a).fillRect(ox + 690, 150, 84, 84);
  g.fillStyle(0x4d2a22).fillRect(ox + 696, 156, 72, 72);
  g.fillStyle(0x2a1512);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) g.fillRect(ox + 708 + k * 22, 168 + r * 20, 4, 4);

  // 큰 책상과 책상 위 물건 (서류함, 큰 도장, 노트북)
  g.fillStyle(0x5a3820).fillRect(ox + 556, 228, 344, 12);
  g.fillStyle(woodL).fillRect(ox + 556, 228, 344, 3);
  g.fillStyle(0x4a2e1a).fillRect(ox + 564, 240, 328, 58);
  g.fillStyle(HUFS_GOLD).fillRect(ox + 564, 240, 328, 3);
  for (const ppx of [ox + 580, ox + 790]) g.fillStyle(0x553521).fillRect(ppx, 252, 86, 38);
  logo(c, HUFS_KEYS.line, ox + 728, 270, { h: 28, tint: HUFS_GOLD });
  for (let k = 0; k < 4; k++) {
    g.fillStyle(k % 2 ? 0xf4f0e0 : 0xffffff).fillRect(ox + 590 + (k % 2) * 3, 222 - k * 4, 50, 4);
  }
  g.fillStyle(0x8b5a2b).fillRect(ox + 664, 204, 10, 16);
  g.fillStyle(0xc8202f).fillRect(ox + 657, 219, 24, 9);
  g.fillStyle(0x2b2b30).fillRect(ox + 824, 196, 48, 30);
  g.fillStyle(0x3b6db3).fillRect(ox + 828, 200, 40, 22);
  g.fillStyle(0xffffff).fillRect(ox + 836, 205, 22, 12);
  g.fillStyle(0xd0202f).fillRect(ox + 836, 205, 22, 3);
  g.fillStyle(0x1d1d22).fillRect(ox + 818, 225, 60, 4);
  g.fillStyle(0x6b7280).fillRect(ox + 772, 212, 10, 16);
  g.fillStyle(0x1d1d22).fillRect(ox + 774, 202, 2, 10).fillRect(ox + 778, 204, 2, 8);
}
