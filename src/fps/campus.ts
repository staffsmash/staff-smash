import * as THREE from 'three';
import { box, frontBox, GINKGO, lamp, lambert, plane, tree, type Rect } from './blocks';
import { canvasTex, drawTinted, FONT, glassDoorTex, NAVY, SERIF, type Logos } from './textures';

// 1인칭 시험판의 새 구역 두 곳 (2026-11-15): 인문과학관 앞, 국제학사(학생회관 및 기숙사, GlobeeDorm) 앞.
// 본편 2D 배경(src/scenes/background.ts의 humanitiesFront·dormFront) 그림을 블록으로 옮겼다. 사진은 레포에 넣지 않는다.
//
// 지도 (x = 동쪽, z = 남쪽. 본관 정면은 z = -22, 사회과학관 정면은 x = 128):
//   사회과학관 앞 광장 남동쪽 → PATH3(남쪽으로 내려가 사회과학관 남쪽 끝을 돌아 동쪽)
//   → 인문과학관 앞(HUM_AREA, 사회과학관 뒤. 건물 정면이 서쪽을 본다)
//   → PATH4(남쪽) → 국제학사 앞(DORM_AREA, 대운동장 동쪽. 건물 정면이 서쪽을 본다)
//   → PATH5(서쪽, 대운동장 동쪽 철망 문) → 대운동장.
// 교직원 모드는 이 차례로 걷고, 학생 모드는 거꾸로(대운동장 → 국제학사 앞 → 인문과학관 앞 → 사회과학관 앞) 걷는다.
// 옛 지름길(world.path2: 사회과학관 앞 → 대운동장 북쪽 스탠드 사이)도 그대로 있다.
// 학교 로고는 새 학교 UI(남색 심벌·흰 단색 심벌)만 쓴다. 2D 그림의 청록 판은 남색으로 바꿨다.

/**
 * 구역 단계 이름 (교직원·학생 모드가 같이 쓴다). 길(path*)은 걷는 방향과 상관없이 같은 이름이다.
 * path = 본관 앞 ↔ 사회과학관 앞, path2 = 사회과학관 앞 ↔ 대운동장(옛 지름길),
 * path3 = 사회과학관 앞 ↔ 인문과학관 앞, path4 = 인문과학관 앞 ↔ 국제학사 앞, path5 = 국제학사 앞 ↔ 대운동장.
 */
export type Stage =
  | 'yard'
  | 'yardBoss'
  | 'yardClear'
  | 'path'
  | 'plaza'
  | 'plazaClear'
  | 'path2'
  | 'path3'
  | 'hum'
  | 'humClear'
  | 'path4'
  | 'dorm'
  | 'dormClear'
  | 'path5'
  | 'field'
  | 'fieldClear'
  | 'toFinal'
  | 'final'
  | 'done';

// ---------- 인문과학관 앞 ----------

/** 인문과학관 앞 모래 마당 (움직일 수 있는 곳) */
export const HUM_AREA: Rect = { minX: 146, maxX: 181, minZ: -22, maxZ: 40 };
/** 인문과학관 정면 (x). 정면이 서쪽(-x)을 본다 */
export const HUM_FRONT_X = 186;
/** 인문과학관 가운데 (z) */
export const HUM_CZ = 8;
/** 인문과학관 현관 앞 (사람이 드나드는 곳) */
export const HUM_DOOR = new THREE.Vector3(183.5, 0, HUM_CZ);
/** 사회과학관 앞 → 인문과학관 앞 길: [남쪽으로 내려가는 칸, 사회과학관 남쪽 끝을 돌아 동쪽으로 가는 칸] */
export const PATH3: Rect[] = [
  { minX: 106.5, maxX: 112.5, minZ: 14, maxZ: 42 },
  { minX: 106.5, maxX: 150, minZ: 34.5, maxZ: 42 },
];
/** 교직원(동쪽으로 갈 때): PATH3에서 이 x를 넘으면 인문과학관 앞 */
export const HUM_ENTER_X = 147;
/** PATH3 길 안내 점 (모퉁이 → 인문과학관 앞 입구). 학생 모드는 거꾸로 쓴다 */
export const PATH3_GUIDE: readonly [number, number][] = [
  [109.5, 38],
  [152, 38],
];

// ---------- 국제학사 앞 ----------

/** 국제학사(학생회관 및 기숙사) 앞 (움직일 수 있는 곳) */
export const DORM_AREA: Rect = { minX: 157, maxX: 199, minZ: 56, maxZ: 104 };
/** 국제학사 가운데 탑 정면 (x). 정면이 서쪽(-x)을 본다 */
export const DORM_FRONT_X = 204;
/** 국제학사 가운데 (z) */
export const DORM_CZ = 80;
/** 국제학사 현관 앞 */
export const DORM_DOOR = new THREE.Vector3(201.5, 0, DORM_CZ);
/** 인문과학관 앞 → 국제학사 앞 길 (남쪽) */
export const PATH4: Rect[] = [{ minX: 161, maxX: 169, minZ: 38, maxZ: 60 }];
/** 교직원(남쪽으로 갈 때): PATH4에서 이 z를 넘으면 국제학사 앞 */
export const DORM_ENTER_Z = 58;

// ---------- 대운동장 동쪽 철망 문 ----------

/** 대운동장 동쪽 철망(x = 153)에 난 문의 z 범위 */
export const GATE_Z0 = 62;
export const GATE_Z1 = 70;
/** 국제학사 앞 → 대운동장 길 (서쪽, 철망 문을 지난다) */
export const PATH5: Rect[] = [{ minX: 134, maxX: 160, minZ: 62.5, maxZ: 69.5 }];
/** 교직원(서쪽으로 갈 때): PATH5에서 이 x보다 서쪽이면 대운동장 */
export const FIELD_GATE_X = 137;

/** 새 구역 둘에서 사람(보스)이 걸어 들어가면 안 되는 곳: 석등·기념탑·표지석·가로등 (buildWorld 뒤에 채워진다) */
export const CAMPUS_SOLIDS: Rect[] = [];

// ---------- 그림 ----------

/** 인문과학관 띠창: 하늘빛 유리 + 가는 세로 창살 (가로 반복) */
function ribbonTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 64, (g) => {
    g.fillStyle = '#7fb4c3';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, 0, 256, 18);
    g.fillStyle = '#dfe5e6';
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 4, 64);
    g.fillStyle = 'rgba(40,70,80,0.18)';
    g.fillRect(0, 54, 256, 10);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** 모래 마당 (밝은 모래 + 알갱이) */
function sandTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (g) => {
    g.fillStyle = '#dccca6';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      g.fillStyle = i % 2 ? 'rgba(170,150,105,0.45)' : 'rgba(240,230,205,0.6)';
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 화강암 표지석: 인문과학관 / Humanities Building (2D 그림 글자 그대로) */
function plaqueTex(): THREE.CanvasTexture {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = '#7d7a75';
    g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#93908a';
    g.fillRect(0, 0, 512, 14);
    g.fillStyle = '#5f5d59';
    g.fillRect(0, 146, 512, 14);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f0d9a0';
    g.font = `bold 62px ${FONT}`;
    g.fillText('인문과학관', 256, 66);
    g.fillStyle = '#e8dcc0';
    g.font = `34px ${SERIF}`;
    g.fillText('Humanities Building', 256, 118);
  });
}

/** 남색 간판: 흰 심벌 + 건물 이름 */
function navySignTex(logos: Logos, name: string, w = 1024): THREE.CanvasTexture {
  return canvasTex(w, 128, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, w, 128);
    drawTinted(g, logos.line, 90, 64, 86, '#ffffff');
    g.fillStyle = '#ffffff';
    let size = 70;
    g.font = `bold ${size}px ${FONT}`;
    while (size > 30 && g.measureText(name).width > w - 220) g.font = `bold ${--size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, (w + 150) / 2, 68);
  });
}

/** 국제학사 가운데 탑의 남색 세로 판: 흰 심벌 + 한국외대 (2D 그림의 청록 판을 남색으로) */
function dormPanelTex(logos: Logos): THREE.CanvasTexture {
  return canvasTex(128, 512, (g) => {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 128, 512);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 6);
    g.fillRect(0, 506, 128, 6);
    drawTinted(g, logos.line, 64, 80, 84, '#ffffff');
    g.font = `bold 52px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [...'한국외대'].forEach((ch, i) => g.fillText(ch, 64, 196 + i * 78));
  });
}

/** 국제학사 동 외벽: 크림색 벽에 창 격자, 해 질 녘이라 몇 칸은 불이 켜져 있다 */
function dormWingTex(cols: number, rows: number, seed: number): THREE.CanvasTexture {
  const w = 512;
  const h = Math.round((512 * rows) / cols) + 40;
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#ebe8e1';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d4cc';
    g.fillRect(0, 0, w, 18);
    let s = seed;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const cw = w / cols;
    const rh = (h - 40) / rows;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const x = i * cw + cw * 0.2;
        const y = 26 + r * rh + rh * 0.18;
        g.fillStyle = '#cfcac0';
        g.fillRect(x - 3, y - 3, cw * 0.6 + 6, rh * 0.58 + 6);
        g.fillStyle = rnd() < 0.3 ? '#ffd98a' : '#6e8fa0';
        g.fillRect(x, y, cw * 0.6, rh * 0.58);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, cw * 0.18, rh * 0.58);
      }
    }
  });
}

/** 국제학사 가운데 탑 앞면: 흰 벽, 위쪽 유리 띠, 양옆 창 두 줄씩 (가운데는 남색 판이 따로 붙는다) */
function dormTowerTex(): THREE.CanvasTexture {
  return canvasTex(512, 960, (g) => {
    g.fillStyle = '#f2f0ea';
    g.fillRect(0, 0, 512, 960);
    // 위쪽 유리 띠
    g.fillStyle = '#8db9c9';
    g.fillRect(56, 26, 400, 84);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(56, 26, 400, 20);
    // 양옆 창 (두 줄씩)
    let s = 29;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (const x of [40, 110, 356, 426]) {
      for (let y = 140; y < 700; y += 48) {
        g.fillStyle = rnd() < 0.3 ? '#ffd98a' : '#6e8fa0';
        g.fillRect(x, y, 46, 30);
      }
    }
  });
}

/** 국제학사 앞 붉은 벽돌 바닥 (2D dormFront 바닥 색) */
function dormBrickTex(): THREE.CanvasTexture {
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#c59a82';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = i % 2 ? 'rgba(140,96,78,0.25)' : 'rgba(255,255,255,0.16)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = '#b08670';
    g.lineWidth = 4;
    for (let r = 0; r < 8; r++) {
      const y = r * 32;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      for (let x = (r % 2) * 32; x < 256; x += 64) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 32);
        g.stroke();
      }
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 바닥에 까는 판 (아래 바닥과 깜빡이지 않게 앞으로 당긴다) */
function floorPlane(root: THREE.Object3D, w: number, d: number, x: number, z: number, tex: THREE.Texture, y = 0.03): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  root.add(m);
  return m;
}

/** 소나무: 붉은 줄기 위로 납작한 잎 덩어리가 층층이 (2D pine) */
function pine(parent: THREE.Object3D, x: number, z: number, s = 1): void {
  box(parent, 0.45 * s, 5 * s, 0.45 * s, x, 2.5 * s, z, lambert(0x8a5a3c));
  const pads: [number, number, number, number][] = [
    [-0.7, 3.6, 3.4, 0.3],
    [0.7, 4.6, 3.0, -0.4],
    [-0.4, 5.6, 2.8, 0.5],
    [0.1, 6.5, 1.9, 0],
  ];
  pads.forEach(([px, py, pw, pz], i) => {
    box(parent, pw * s, 0.7 * s, pw * 0.8 * s, x + px * s, py * s, z + pz * s, lambert(i % 2 ? 0x2f5a3a : 0x22412c));
    box(parent, pw * 0.5 * s, 0.2 * s, pw * 0.5 * s, x + px * s, (py + 0.42) * s, z + pz * s, lambert(0x45784f), false);
  });
}

/** 석등 (2D lantern): 받침 → 기둥 → 불 넣는 칸 → 지붕 */
function lantern(root: THREE.Object3D, x: number, z: number, solids: Rect[]): void {
  box(root, 1.3, 0.45, 1.3, x, 0.225, z, lambert(0x8f8d87));
  box(root, 0.45, 1.5, 0.45, x, 1.2, z, lambert(0x9c9a94));
  box(root, 1.0, 0.2, 1.0, x, 2.05, z, lambert(0xa7a59f));
  box(root, 1.05, 0.75, 1.05, x, 2.5, z, lambert(0xa09e98));
  for (const [dx, dz] of [
    [0.53, 0],
    [-0.53, 0],
    [0, 0.53],
    [0, -0.53],
  ]) {
    box(root, dx ? 0.02 : 0.42, 0.4, dz ? 0.02 : 0.42, x + dx, 2.5, z + dz, lambert(0x4b4a46), false);
  }
  box(root, 1.7, 0.32, 1.7, x, 3.04, z, lambert(0x8a8882));
  box(root, 0.55, 0.32, 0.55, x, 3.36, z, lambert(0x8a8882));
  solids.push({ minX: x - 0.75, maxX: x + 0.75, minZ: z - 0.75, maxZ: z + 0.75 });
}

/** 마당 가운데 흰 기념탑 (지구 모양) */
function globeMonument(root: THREE.Object3D, x: number, z: number, solids: Rect[]): void {
  box(root, 2.6, 1.0, 2.6, x, 0.5, z, lambert(0xa7c4cf));
  box(root, 0.7, 4.6, 0.7, x, 3.3, z, lambert(0xf6f6f4));
  box(root, 0.28, 4.6, 0.72, x + 0.25, 3.3, z, lambert(0xd9dcdc));
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), lambert(0xf6f6f4));
  sphere.position.set(x, 6.8, z);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  root.add(sphere);
  // 적도와 경선 (가는 고리)
  const lineMat = lambert(0xc3cbcf);
  const eq = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.035, 6, 40), lineMat);
  eq.rotation.x = Math.PI / 2;
  eq.position.copy(sphere.position);
  root.add(eq);
  for (const ry of [0, Math.PI / 2]) {
    const mer = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.035, 6, 40), lineMat);
    mer.rotation.y = ry;
    mer.position.copy(sphere.position);
    root.add(mer);
  }
  solids.push({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4 });
}

// ---------- 인문과학관 ----------

const HUM_W = 54;
const HUM_D = 12;
const HUM_FLOOR = 3.2;
const HUM_FLOORS = 7;

/**
 * 인문과학관 앞 (2D humanitiesFront): 7층 띠창 + 떠 있는 평지붕, 양 끝은 흰 계단실,
 * 모래 마당과 디딤돌, 석등 둘, 마당의 흰 기념탑(지구 모양), 표지석, 소나무.
 * 돌려주는 값: 플레이어가 지나갈 수 없는 곳.
 */
export function buildHumanities(root: THREE.Object3D, logos: Logos): Rect[] {
  const obstacles: Rect[] = [];

  // 건물은 앞이 +z인 지역 좌표로 쌓고, 통째로 돌려서 서쪽(-x)을 보게 둔다 (지역 +x = 남쪽)
  const b = new THREE.Group();
  b.position.set(HUM_FRONT_X, 0, HUM_CZ);
  b.rotation.y = -Math.PI / 2;
  root.add(b);

  const top = HUM_FLOORS * HUM_FLOOR;
  // 몸체 (띠창 뒤)
  box(b, HUM_W - 0.4, top, HUM_D, 0, top / 2, -HUM_D / 2 - 0.4, lambert(0xd9dddd));
  // 층마다: 안으로 들어간 유리 띠 + 밝은 띠
  const glass = ribbonTex();
  glass.repeat.set(HUM_W / 6, 1);
  const glassMat = new THREE.MeshLambertMaterial({ map: glass });
  const gs = lambert(0x9fb4ba);
  for (let k = 0; k < HUM_FLOORS; k++) {
    const y0 = k * HUM_FLOOR;
    box(b, HUM_W - 0.4, 2.3, 0.4, 0, y0 + 1.15, -0.5, [gs, gs, gs, gs, glassMat, gs], false);
    box(b, HUM_W, 0.9, 0.9, 0, y0 + 2.75, -0.25, lambert(0xeeefef));
  }
  // 양 끝 흰 계단실 (세로로 긴 틈창)
  for (const s of [-1, 1]) {
    const x = s * (HUM_W / 2 - 2.4);
    box(b, 5.2, top + 1.0, HUM_D + 1.0, x, (top + 1.0) / 2, -HUM_D / 2, lambert(0xf3f4f2));
    box(b, 1.1, top - 2.2, 0.1, x - s * 0.6, top / 2 + 0.6, 0.55, lambert(0xa9c7cf), false);
  }
  // 떠 있는 평지붕: 가는 기둥 위 짙은 판
  box(b, HUM_W, 0.4, HUM_D, 0, top + 0.2, -HUM_D / 2, lambert(0xd9dddd), false);
  for (let x = -HUM_W / 2 + 4; x <= HUM_W / 2 - 4 + 0.1; x += HUM_W / 6) {
    box(b, 0.25, 1.2, 0.25, x, top + 1.0, -0.4, lambert(0x8a8f93), false);
    box(b, 0.25, 1.2, 0.25, x, top + 1.0, -HUM_D + 1, lambert(0x8a8f93), false);
  }
  box(b, HUM_W + 2.6, 0.18, HUM_D + 3, 0, top + 1.62, -HUM_D / 2 + 0.6, lambert(0x44484b));
  box(b, HUM_W + 2.6, 0.5, HUM_D + 3, 0, top + 1.96, -HUM_D / 2 + 0.6, lambert(0x5a5f63));

  // 현관: 유리문 + 캐노피 + 남색 간판 + 계단
  frontBox(b, 8, 3.0, 0.3, 0, 1.5, 0.15, 0x41606a, glassDoorTex());
  box(b, 11, 0.3, 2.8, 0, 3.35, 1.25, lambert(0x6d7377));
  frontBox(b, 9, 1.1, 0.25, 0, 4.2, 0.65, 0x002c52, navySignTex(logos, '인문과학관'));
  box(b, 12, 0.16, 2.2, 0, 0.08, 1.4, lambert(0xc9cdcd), false);
  obstacles.push({ minX: HUM_FRONT_X - 0.6, maxX: HUM_FRONT_X + HUM_D + 1, minZ: HUM_CZ - HUM_W / 2 - 0.6, maxZ: HUM_CZ + HUM_W / 2 + 0.6 });

  // 모래 마당 (사회과학관 뒤 보도블록 위에 깐다)
  const sand = sandTex();
  sand.repeat.set(9, 16);
  floorPlane(root, 40, 70, 165, 9, sand);
  // 현관에서 서쪽으로 구불구불 놓인 디딤돌
  const stone = lambert(0x6e7276);
  const stoneTop = lambert(0x8b9094);
  for (let i = 0; i < 15; i++) {
    const x = HUM_FRONT_X - 3 - i * 2.3;
    const z = HUM_CZ + Math.sin(i * 0.8) * 1.6;
    const w = 1.1 + (i % 3) * 0.2;
    box(root, w, 0.1, 0.85, x, 0.08, z, stone, false);
    box(root, w * 0.9, 0.02, 0.7, x, 0.14, z, stoneTop, false);
  }
  // 석등 둘, 기념탑, 표지석 (정면이 서쪽)
  const solids: Rect[] = [];
  lantern(root, 174, -10, solids);
  lantern(root, 174, 26, solids);
  globeMonument(root, 159, -4, solids);
  box(root, 0.7, 1.2, 4.0, 177, 0.6, 18.5, lambert(0x7d7a75));
  plane(root, 3.8, 1.1, 176.63, 0.62, 18.5, plaqueTex(), { rotY: -Math.PI / 2 });
  solids.push({ minX: 176.4, maxX: 177.6, minZ: 16.3, maxZ: 20.7 });
  // 소나무, 가로등 (배너 앞면이 사회과학관 쪽(서쪽)을 본다)
  pine(root, 150, -18, 1.1);
  pine(root, 179, -19, 0.95);
  pine(root, 179, 37, 1.0);
  pine(root, 161, -20, 0.9);
  lamp(root, 147.5, -8, logos, -Math.PI / 2);
  lamp(root, 147.5, 18, logos, -Math.PI / 2);
  solids.push({ minX: 147.2, maxX: 147.8, minZ: -8.3, maxZ: -7.7 }, { minX: 147.2, maxX: 147.8, minZ: 17.7, maxZ: 18.3 });
  CAMPUS_SOLIDS.push(...solids);
  obstacles.push(...solids);
  return obstacles;
}

// ---------- 국제학사 ----------

/**
 * 국제학사 앞 (2D dormFront): 학생회관 및 기숙사. 낮은 북쪽 동 + 높은 가운데 탑(남색 세로 판·"학생회관 · 국제학사" 간판·
 * 유리 현관) + 더 높은 남쪽 동, 붉은 벽돌 바닥, 은행나무, 가로등.
 * 돌려주는 값: 플레이어가 지나갈 수 없는 곳.
 */
export function buildDorm(root: THREE.Object3D, logos: Logos): Rect[] {
  const obstacles: Rect[] = [];
  const b = new THREE.Group();
  b.position.set(DORM_FRONT_X, 0, DORM_CZ);
  b.rotation.y = -Math.PI / 2;
  root.add(b);

  const wall = 0xe6e2da;
  // 북쪽 동 (낮다, 6층) · 남쪽 동 (높다, 8층). 지역 -x = 북쪽
  const north = dormWingTex(8, 6, 7);
  const south = dormWingTex(9, 8, 13);
  frontBox(b, 18, 19.5, 12, -17.5, 9.75, -8, wall, north);
  box(b, 18.6, 0.6, 12.4, -17.5, 19.8, -8, lambert(0xd8d4cc));
  frontBox(b, 20, 25.5, 12, 18.5, 12.75, -7, wall, south);
  box(b, 20.6, 0.6, 12.4, 18.5, 25.8, -7, lambert(0xd8d4cc));
  // 남쪽 동 끝의 작은 남색 판 (흰 심벌)
  plane(b, 2.2, 7.5, 27, 15.5, -0.97, dormPanelTex(logos));

  // 가운데 탑 (가장 높다)
  frontBox(b, 16, 30, 14, 0, 15, -7, 0xf2f0ea, dormTowerTex());
  box(b, 17.2, 0.8, 15, 0, 30.4, -7, lambert(0xdcd8cf));
  // 가운데 남색 세로 판 (흰 심벌 + 한국외대)
  box(b, 4.6, 15.4, 0.3, 0, 19.7, 0.2, lambert(0xffffff), false);
  plane(b, 4.2, 15, 0, 19.7, 0.36, dormPanelTex(logos));
  // 유리 현관 + 캐노피 + 남색 간판 "학생회관 · 국제학사"
  frontBox(b, 11, 4.6, 0.3, 0, 2.3, 0.2, 0x3e5561, glassDoorTex());
  box(b, 13.5, 0.4, 3.0, 0, 4.85, 1.4, lambert(0x9aa2a6));
  frontBox(b, 11, 1.4, 0.25, 0, 5.85, 0.5, 0x002c52, navySignTex(logos, '학생회관 · 국제학사'));
  box(b, 13, 0.18, 2.4, 0, 0.09, 1.4, lambert(0xbdb6aa), false);
  obstacles.push({ minX: DORM_FRONT_X - 0.8, maxX: DORM_FRONT_X + 16, minZ: DORM_CZ - 27, maxZ: DORM_CZ + 30 });

  // 붉은 벽돌 바닥 (운동장 둘레 콘크리트가 끝나는 x = 160부터)
  const brick = dormBrickTex();
  brick.repeat.set(18, 17);
  floorPlane(root, 72, 68, 196, 82, brick, 0.025);
  // 은행나무, 가로등 (배너 앞면이 서쪽을 본다)
  for (const [x, z, s] of [
    [195, 59, 1.0],
    [196, 102, 1.05],
    [159.5, 104.5, 0.9],
  ] as [number, number, number][]) {
    tree(root, x, z, s, GINKGO);
  }
  lamp(root, 189, 63, logos, -Math.PI / 2);
  lamp(root, 189, 97, logos, -Math.PI / 2);
  const solids: Rect[] = [
    { minX: 188.7, maxX: 189.3, minZ: 62.7, maxZ: 63.3 },
    { minX: 188.7, maxX: 189.3, minZ: 96.7, maxZ: 97.3 },
  ];
  CAMPUS_SOLIDS.push(...solids);
  obstacles.push(...solids);
  return obstacles;
}
