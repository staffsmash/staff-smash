import * as THREE from 'three';
import { box, frontBox, lamp, lambert, plane, tree, type Rect } from './blocks';
import { buildSocial } from './social';
import {
  chevronTex,
  emblemTex,
  facadeTex,
  friezeTex,
  lawnTex,
  pavingTex,
  skyTex,
  stripeTex,
  tealBannerTex,
  towerSignTex,
  type Logos,
} from './textures';

// 1인칭 시험판의 무대: 해 질 무렵 서울캠퍼스 본관 앞 (블록형) → 오른쪽 길 → 사회과학관 앞.
// 단위는 m. 첫 구역에서 플레이어는 +z 쪽에서 -z(본관) 쪽을 본다. 본관 정면 벽은 z = -22.
// 사회과학관은 동쪽(+x) 길 끝에 있고 정면이 서쪽(-x)을 본다 (social.ts).

const STONE = 0xe9e1cf;
const STONE_L = 0xf3ecdd;
const STONE_D = 0xd6ccb8;

export type Obstacle = Rect;

export interface World {
  obstacles: Rect[];
  /** 본관 앞 마당 */
  yard: Rect;
  /** 본관 앞에서 사회과학관 앞으로 가는 길 */
  path: Rect;
  /** 사회과학관 앞 광장 */
  plaza: Rect;
  /** 길을 막고 있다가 열리는 바리케이드 */
  barricade: THREE.Group;
  /** 길 바닥의 안내 화살표 */
  arrows: THREE.Group;
  arrowMat: THREE.MeshBasicMaterial;
  sun: THREE.DirectionalLight;
}

/** 계단식 박공 (복셀처럼 층층이 좁아진다) */
function pediment(parent: THREE.Object3D, cx: number, baseY: number, z: number, width: number, layers: number, depth: number): void {
  const step = width / (layers * 2 + 1);
  for (let k = 0; k < layers; k++) {
    box(parent, width - k * step * 2, 0.7, depth, cx, baseY + 0.35 + k * 0.7, z, lambert(k % 2 ? STONE : STONE_L));
  }
}

function column(parent: THREE.Object3D, x: number, z: number, base: number, h: number, w = 1.0): void {
  box(parent, w + 0.3, 0.3, w + 0.3, x, base + 0.15, z, lambert(STONE_D));
  box(parent, w, h, w, x, base + 0.3 + h / 2, z, lambert(STONE_L));
  box(parent, w + 0.5, 0.45, w + 0.5, x, base + 0.3 + h + 0.22, z, lambert(STONE_D));
}

/** 홍보 사진 속 잔디의 "HUFS" 꽃글씨. 눈높이에서 읽히도록 비탈진 화단에 심는다 */
function flowerLetters(root: THREE.Object3D, cx: number, z: number, y: number, lawn: THREE.Texture): void {
  // 앞쪽 가장자리를 축으로 뒤쪽을 들어 올린 비탈 (z = 화단 앞쪽 끝)
  const parent = new THREE.Group();
  parent.position.set(0, y, z);
  parent.rotation.x = 0.5;
  root.add(parent);
  const slope = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 3.8), new THREE.MeshLambertMaterial({ map: lawn }));
  slope.position.set(cx, -0.15, -1.75);
  slope.receiveShadow = true;
  parent.add(slope);
  z = 0;
  y = 0;
  const glyphs: Record<string, string[]> = {
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  };
  const cell = 0.45;
  const cells: [number, number, number][] = [];
  let lx = cx - (4 * 5 * cell + 3 * 0.9) / 2;
  for (const ch of 'HUFS') {
    glyphs[ch].forEach((row, ry) =>
      [...row].forEach((b, rx) => {
        if (b === '1') cells.push([lx + rx * cell + cell / 2, z - 3 + ry * cell, (rx + ry) % 2]);
      }),
    );
    lx += 5 * cell + 0.9;
  }
  const geo = new THREE.BoxGeometry(cell * 0.92, 0.3, cell * 0.92);
  for (const k of [0, 1]) {
    const list = cells.filter((c) => c[2] === k);
    const inst = new THREE.InstancedMesh(geo, lambert(k ? 0xf7c843 : 0xf29a1b), list.length);
    const m = new THREE.Matrix4();
    list.forEach(([px, pz], i) => {
      m.makeTranslation(px, y + 0.15, pz);
      inst.setMatrixAt(i, m);
    });
    parent.add(inst);
  }
}

export function buildWorld(scene: THREE.Scene, logos: Logos): World {
  const root = new THREE.Group();
  scene.add(root);

  // 하늘 (큰 구 안쪽에 그라데이션)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.position.x = 50;
  scene.add(sky);

  // 빛: 늦은 오후 햇빛. 그림자 범위는 플레이어를 따라 옮긴다 (main.ts)
  scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x8a7f6a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
  sun.position.set(-40, 60, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -60;
  sc.right = 60;
  sc.top = 60;
  sc.bottom = -60;
  sc.far = 200;
  scene.add(sun);
  scene.add(sun.target);
  scene.fog = new THREE.Fog(0xe9e2cf, 90, 260);

  // 바닥: 화강암 광장 (사회과학관 쪽까지 이어진다)
  const pave = pavingTex();
  pave.repeat.set(90, 45);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(360, 180), new THREE.MeshLambertMaterial({ map: pave }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = 50;
  ground.receiveShadow = true;
  root.add(ground);

  // 먼 산과 건물 (배경)
  for (let i = 0; i < 13; i++) {
    const w = 30 + (i % 3) * 8;
    box(root, w, 18 + (i % 4) * 6, 10, -120 + i * 30, 9, -110, lambert(0x5d7a52), false);
  }
  const sideFacade = facadeTex({ w: 512, h: 256, cols: 10, rows: 5, wall: '#d9d5cc', glass: '#5a7184', frame: '#b8b3aa' });
  frontBox(root, 30, 16, 14, -62, 8, -10, 0xd9d5cc, sideFacade).rotation.y = Math.PI / 2;

  // ---------- 본관 ----------
  // 가운데 몸체 (탑 아래)
  const centerFacade = facadeTex({ w: 1024, h: 512, cols: 9, rows: 4, wall: '#e9e1cf', glass: '#4f8c86', frame: '#d6ccb8', pilaster: '#ddd3bf' });
  frontBox(root, 30, 14, 12, 0, 7, -28, STONE, centerFacade);
  // 날개 (양쪽, 끝에 작은 박공 현관)
  const wingFacade = facadeTex({ w: 1024, h: 384, cols: 12, rows: 3, wall: '#e9e1cf', glass: '#4f8c86', frame: '#d6ccb8', pilaster: '#ddd3bf', top: 0.12 });
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), lambert(STONE_L), 60);
  const m4 = new THREE.Matrix4();
  for (const sx of [-1, 1]) {
    frontBox(root, 30, 11, 10, sx * 30, 5.5, -27, STONE, wingFacade);
    // 난간
    box(root, 30, 0.3, 10.2, sx * 30, 11.15, -27, lambert(STONE_D));
    for (let i = 0; i < 30; i++) {
      m4.makeTranslation(sx * 30 - 14.5 + i, 11.6, -22.2);
      rail.setMatrixAt((sx > 0 ? 30 : 0) + i, m4);
    }
    // 작은 박공 현관
    const px = sx * 38;
    box(root, 9, 8, 0.4, px, 4, -21.9, lambert(0x857d6f), false);
    for (let i = 0; i < 4; i++) column(root, px - 3.3 + i * 2.2, -20.6, 0, 7.6, 0.8);
    box(root, 10, 1, 3, px, 8.85, -21, lambert(STONE));
    pediment(root, px, 9.35, -21, 10, 4, 2.6);
  }
  root.add(rail);

  // 가운데 박공 현관: 계단 → 기둥 8개 → 엔타블러처(학교 영문명) → 계단식 박공(심벌)
  box(root, 30, 0.4, 7, 0, 0.2, -19.5, lambert(0xc2b9a7));
  box(root, 28.5, 0.8, 5.6, 0, 0.4, -20.2, lambert(0xcdc4b2));
  box(root, 27, 1.2, 4.2, 0, 0.6, -20.9, lambert(0xd8cfbe));
  box(root, 24, 8.4, 0.3, 0, 5.4, -21.8, lambert(0x6f6a60), false);
  for (const dx of [-6, 0, 6]) box(root, dx === 0 ? 2.6 : 2, dx === 0 ? 4.6 : 4, 0.2, dx, 1.2 + (dx === 0 ? 2.3 : 2), -21.6, lambert(0x3c4c4e), false);
  for (let i = 0; i < 8; i++) column(root, -10.5 + i * 3, -19.6, 1.2, 8.1);
  frontBox(root, 26, 1.4, 3.6, 0, 10.75, -20.4, STONE, friezeTex());
  pediment(root, 0, 11.45, -20.6, 27, 6, 3.2);
  plane(root, 2.6, 2.6, 0, 13.0, -18.95, emblemTex(logos), { transparent: true });

  // 탑 (13층 높이) + 꼭대기 표지 + 청록 현수막
  const towerFacade = facadeTex({ w: 512, h: 1536, cols: 5, rows: 13, wall: '#ebe3d1', glass: '#4f8c86', frame: '#d9cfbb', pilaster: '#d9cfbb', winW: 0.45, top: 0.02, bottom: 0.02 });
  frontBox(root, 11, 26, 9, 0, 27, -28, STONE, towerFacade);
  frontBox(root, 11.2, 2.4, 9.2, 0, 41.2, -28, 0xe4dbc8, towerSignTex(logos));
  box(root, 12.4, 0.8, 10.4, 0, 42.8, -28, lambert(0xd9d0bd));
  box(root, 11.6, 0.6, 9.6, 0, 43.5, -28, lambert(STONE_D));
  plane(root, 2.2, 15, 0, 29, -23.45, tealBannerTex(logos));

  // ---------- 앞마당 ----------
  // 잔디 화단 (왼쪽: HUFS 꽃글씨, 오른쪽: 은행나무)
  const lawn = lawnTex();
  lawn.repeat.set(4, 2);
  const lawnMat = new THREE.MeshLambertMaterial({ map: lawn });
  const obstacles: Rect[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * 16;
    box(root, 15, 0.4, 7.4, cx, 0.2, -10, lambert(0xa9a191));
    const top = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.42, 6.8), lawnMat);
    top.position.set(cx, 0.22, -10);
    top.receiveShadow = true;
    root.add(top);
    obstacles.push({ minX: cx - 7.6, maxX: cx + 7.6, minZ: -13.8, maxZ: -6.2 });
  }
  flowerLetters(root, -16, -7.0, 0.43, lawn);
  tree(root, 13, -10.5, 1.1);
  tree(root, 19.5, -9.5, 0.9);
  tree(root, -29, 4, 1.2);
  tree(root, 29, 7.5, 1.2);
  tree(root, -30, -6, 1.0);
  tree(root, 30, -6.5, 1.0);

  // 가로등 배너 (본관 쪽에서 오는 길 양옆)
  for (const [lx, lz] of [
    [-7, -5],
    [7, -5],
    [-7, 6],
    [7, 6],
  ] as [number, number][]) {
    lamp(root, lx, lz, logos);
    obstacles.push({ minX: lx - 0.3, maxX: lx + 0.3, minZ: lz - 0.3, maxZ: lz + 0.3 });
  }

  // ---------- 사회과학관 가는 길 (동쪽) ----------
  const lawn2 = lawnTex();
  lawn2.repeat.set(12, 1);
  const lawn2Mat = new THREE.MeshLambertMaterial({ map: lawn2 });
  for (const z of [-4.6, 6.6]) {
    box(root, 44, 0.3, 3.4, 50, 0.15, z, lambert(0xa9a191));
    const t = new THREE.Mesh(new THREE.BoxGeometry(43.6, 0.32, 3.0), lawn2Mat);
    t.position.set(50, 0.17, z);
    t.receiveShadow = true;
    root.add(t);
  }
  for (const lx of [38, 58]) {
    lamp(root, lx, -3.4, logos, -Math.PI / 2);
    lamp(root, lx, 5.4, logos, -Math.PI / 2);
  }

  // 길을 막는 바리케이드 (마당을 다 정리하면 땅으로 내려간다)
  const barricade = new THREE.Group();
  barricade.position.set(26.6, 0, 1);
  root.add(barricade);
  const stripe = stripeTex();
  stripe.repeat.set(5, 1);
  const stripeMat = new THREE.MeshLambertMaterial({ map: stripe });
  const plain = lambert(0xf5c542);
  for (const y of [0.55, 1.15]) box(barricade, 0.12, 0.36, 7.4, 0, y, 0, [stripeMat, stripeMat, plain, plain, plain, plain]);
  for (const z of [-3.2, 3.2]) {
    box(barricade, 0.5, 1.4, 0.12, 0, 0.7, z, lambert(0x3a3a44));
  }

  // 바닥 안내 화살표
  const arrows = new THREE.Group();
  arrows.visible = false;
  root.add(arrows);
  const arrowMat = new THREE.MeshBasicMaterial({ map: chevronTex(), transparent: true, depthWrite: false });
  const arrowGeo = new THREE.PlaneGeometry(2.2, 2.2);
  for (let x = 22; x <= 76; x += 6) {
    const a = new THREE.Mesh(arrowGeo, arrowMat);
    a.rotation.x = -Math.PI / 2;
    a.position.set(x, 0.04, 1);
    arrows.add(a);
  }

  obstacles.push(...buildSocial(root, logos));

  return {
    obstacles,
    yard: { minX: -26, maxX: 26, minZ: -15.5, maxZ: 16 },
    path: { minX: 20, maxX: 74, minZ: -1.8, maxZ: 3.8 },
    plaza: { minX: 70, maxX: 119, minZ: -18, maxZ: 18 },
    barricade,
    arrows,
    arrowMat,
    sun,
  };
}
