import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, GINKGO, lamp, lambert, MAPLE, plane, tree, type Rect } from './blocks';
import {
  apartmentTex,
  emblemTex,
  fenceNetTex,
  fieldBannerTex,
  fieldSignTex,
  goalNetTex,
  sloganBannerTex,
  turfTex,
  type Logos,
} from './textures';

// 세 번째 구역: 대운동장 (본편 2D의 stands·track·fieldCenter 그림을 블록으로).
// 사회과학관 앞 광장 남쪽(+z)으로 난 길을 따라가면 북쪽 콘크리트 스탠드 사이로 들어온다.
// 줄무늬 잔디(가운데 원에 남색 심벌), 붉은 트랙, 흰 골대와 그물, 남쪽 높은 초록 철망과 남색 현수막,
// 그 너머 아파트와 산. 해는 남서쪽 하늘로 진다.

/** 운동장 한가운데 */
export const FC = new THREE.Vector3(95, 0, 85);
/** 확성기 기둥이 서는 자리 (남쪽 현수막 앞) */
export const MAST = new THREE.Vector3(95, 0, 104.5);
/** 길이 운동장에 닿는 곳 (여기를 넘으면 대운동장 구역) */
export const FIELD_ENTER_Z = 57;

const PITCH_W = 60;
const PITCH_D = 36;
const TRACK_HL = PITCH_W / 2;
const TRACK_R0 = 19;
const TRACK_R1 = 24;
const FENCE_Z = 111;
const FENCE_X0 = 37;
const FENCE_X1 = 153;
const FENCE_H = 8;
const STAND_Z = 57.5;

export interface FieldInfo {
  obstacles: Rect[];
  /** 대운동장 (움직일 수 있는 곳) */
  field: Rect;
  /** 광장에서 운동장으로 가는 길 */
  path2: Rect;
}

/** 바닥에 겹쳐 까는 것들이 깜빡이지 않게 층마다 조금씩 앞으로 당긴다 */
function flatMat(color: number, layer: number, map?: THREE.Texture, transparent = false): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: map ? 0xffffff : color,
    ...(map ? { map } : {}),
    transparent,
    alphaTest: transparent ? 0.05 : 0,
    depthWrite: !transparent,
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer * 2,
  });
}

function flat(root: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  root.add(m);
  return m;
}

/** 경기장 트랙 모양(직선 + 양끝 반원) */
function stadium(path: THREE.Path, hl: number, r: number): THREE.Path {
  path.moveTo(-hl, -r);
  path.lineTo(hl, -r);
  path.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-hl, r);
  path.absarc(-hl, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return path;
}

function stadiumRing(hl: number, r0: number, r1: number): THREE.BufferGeometry {
  const s = stadium(new THREE.Shape(), hl, r1) as THREE.Shape;
  s.holes.push(stadium(new THREE.Path(), hl, r0));
  const g = new THREE.ShapeGeometry(s, 28);
  g.rotateX(-Math.PI / 2);
  return g;
}

function stadiumFill(hl: number, r: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(stadium(new THREE.Shape(), hl, r) as THREE.Shape, 28);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** 바닥에 눕힌 흰 줄 (x0,z0 → x1,z1) */
function lineGeo(x0: number, z0: number, x1: number, z1: number, w = 0.14): THREE.BufferGeometry {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len + w, w);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  return g;
}

/** 그물처럼 크기에 맞춰 무늬가 반복되는 판 (uv를 크기만큼 늘린다) */
function tiledPlane(w: number, h: number, tile: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}

export function buildField(root: THREE.Object3D, logos: Logos): FieldInfo {
  const obstacles: Rect[] = [];
  const cx = FC.x;
  const cz = FC.z;

  // ---------- 바닥 ----------
  // 운동장 남쪽 너머 땅 (기존 바닥이 끝나는 z = 90 뒤로)
  const far = new THREE.Mesh(new THREE.PlaneGeometry(520, 260), lambert(0x76825f));
  far.rotation.x = -Math.PI / 2;
  far.position.set(90, -0.03, 216);
  far.receiveShadow = true;
  root.add(far);
  // 운동장 둘레 콘크리트
  const apron = new THREE.PlaneGeometry(130, 74);
  apron.rotateX(-Math.PI / 2);
  flat(root, apron, flatMat(0xbdb9b1, 1), cx, 0.02, 81);
  // 붉은 트랙 + 흰 레인
  flat(root, stadiumRing(TRACK_HL, TRACK_R0, TRACK_R1), flatMat(0xb84d3a, 2), cx, 0.04, cz);
  const laneMat = flatMat(0xefe2dc, 3);
  for (const r of [TRACK_R0 + 0.05, 20.25, 21.5, 22.75, TRACK_R1 - 0.05]) flat(root, stadiumRing(TRACK_HL, r - 0.06, r + 0.06), laneMat, cx, 0.05, cz);
  // 트랙 안쪽 잔디 + 줄무늬 경기장
  flat(root, stadiumFill(TRACK_HL, TRACK_R0), flatMat(0x3d9548, 3), cx, 0.05, cz);
  const turf = turfTex();
  turf.repeat.set(PITCH_W / 12, 1);
  const pitch = new THREE.PlaneGeometry(PITCH_W, PITCH_D);
  pitch.rotateX(-Math.PI / 2);
  flat(root, pitch, flatMat(0, 4, turf), cx, 0.06, cz);

  // 흰 줄: 경기장 테두리, 가운데 줄, 페널티 구역, 골 구역, 가운데 원
  const hw = PITCH_W / 2;
  const hd = PITCH_D / 2;
  const lines: THREE.BufferGeometry[] = [
    lineGeo(-hw, -hd, hw, -hd),
    lineGeo(-hw, hd, hw, hd),
    lineGeo(-hw, -hd, -hw, hd),
    lineGeo(hw, -hd, hw, hd),
    lineGeo(0, -hd, 0, hd),
  ];
  for (const s of [-1, 1]) {
    const gx = s * hw;
    const px = gx - s * 10;
    const sx = gx - s * 3.6;
    lines.push(lineGeo(gx, -10, px, -10), lineGeo(gx, 10, px, 10), lineGeo(px, -10, px, 10));
    lines.push(lineGeo(gx, -5, sx, -5), lineGeo(gx, 5, sx, 5), lineGeo(sx, -5, sx, 5));
  }
  const circle = new THREE.RingGeometry(7.0, 7.14, 72);
  circle.rotateX(-Math.PI / 2);
  lines.push(circle);
  const spot = new THREE.CircleGeometry(0.22, 12);
  spot.rotateX(-Math.PI / 2);
  lines.push(spot);
  const lineAll = mergeGeometries(lines.map((g) => g.toNonIndexed()), false);
  if (lineAll) flat(root, lineAll, flatMat(0xf4f4f4, 5), cx, 0.075, cz);
  // 가운데 원 안의 남색 심벌 (본관 쪽에서 들어오는 사람이 바로 읽히게)
  const emb = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), flatMat(0, 6, emblemTex(logos), true));
  emb.rotation.set(-Math.PI / 2, 0, Math.PI);
  emb.position.set(cx, 0.09, cz);
  emb.receiveShadow = true;
  root.add(emb);

  // ---------- 골대 ----------
  const white = lambert(0xf7f7f7);
  const nets: THREE.BufferGeometry[] = [];
  const GW = 7.32;
  const GH = 2.44;
  const GD = 2.0;
  for (const s of [-1, 1]) {
    const gx = cx + s * hw;
    for (const z of [-GW / 2, GW / 2]) box(root, 0.14, GH, 0.14, gx, GH / 2, cz + z, white);
    box(root, 0.14, 0.14, GW + 0.14, gx, GH, cz, white);
    // 뒤쪽 받침대
    for (const z of [-GW / 2, GW / 2]) box(root, GD, 0.08, 0.08, gx + s * GD * 0.5, 0.04, cz + z, white, false);
    box(root, 0.08, 0.08, GW, gx + s * GD, 0.04, cz, white, false);
    // 그물: 뒤, 위, 양옆
    const back = tiledPlane(GW, GH, 0.3);
    back.rotateY(Math.PI / 2);
    back.translate(gx + s * GD, GH / 2, cz);
    const top = tiledPlane(GD, GW, 0.3);
    top.rotateX(-Math.PI / 2);
    top.translate(gx + s * GD * 0.5, GH, cz);
    nets.push(back, top);
    for (const z of [-GW / 2, GW / 2]) {
      const side = tiledPlane(GD, GH, 0.3);
      side.translate(gx + s * GD * 0.5, GH / 2, cz + z);
      nets.push(side);
    }
    obstacles.push({ minX: Math.min(gx, gx + s * GD) - 0.1, maxX: Math.max(gx, gx + s * GD) + 0.1, minZ: cz - GW / 2 - 0.15, maxZ: cz + GW / 2 + 0.15 });
  }
  const netGeo = mergeGeometries(nets, false);
  if (netGeo) {
    const netTex = goalNetTex();
    const netMesh = new THREE.Mesh(
      netGeo,
      new THREE.MeshLambertMaterial({ map: netTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    );
    root.add(netMesh);
  }

  // ---------- 높은 초록 철망 ----------
  const fence: THREE.BufferGeometry[] = [];
  const south = tiledPlane(FENCE_X1 - FENCE_X0, FENCE_H, 0.7);
  south.translate((FENCE_X0 + FENCE_X1) / 2, FENCE_H / 2, FENCE_Z);
  fence.push(south);
  for (const x of [FENCE_X0, FENCE_X1]) {
    const end = tiledPlane(FENCE_Z - 52, FENCE_H, 0.7);
    end.rotateY(Math.PI / 2);
    end.translate(x, FENCE_H / 2, (FENCE_Z + 52) / 2);
    fence.push(end);
  }
  const fenceGeo = mergeGeometries(fence, false);
  if (fenceGeo) {
    root.add(
      new THREE.Mesh(
        fenceGeo,
        new THREE.MeshLambertMaterial({ map: fenceNetTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      ),
    );
  }
  const post = lambert(0x2c4536);
  for (let x = FENCE_X0; x <= FENCE_X1 + 0.1; x += 8) box(root, 0.22, FENCE_H + 0.3, 0.22, x, (FENCE_H + 0.3) / 2, FENCE_Z, post);
  box(root, FENCE_X1 - FENCE_X0, 0.16, 0.16, (FENCE_X0 + FENCE_X1) / 2, FENCE_H + 0.2, FENCE_Z, post, false);
  box(root, FENCE_X1 - FENCE_X0, 0.12, 0.12, (FENCE_X0 + FENCE_X1) / 2, 2.2, FENCE_Z, post, false);
  for (const x of [FENCE_X0, FENCE_X1]) {
    for (let z = 52; z < FENCE_Z; z += 8) box(root, 0.22, FENCE_H + 0.3, 0.22, x, (FENCE_H + 0.3) / 2, z, post);
    box(root, 0.16, 0.16, FENCE_Z - 52, x, FENCE_H + 0.2, (FENCE_Z + 52) / 2, post, false);
  }
  // 남색 현수막 (운동장 쪽을 본다)
  plane(root, 26, 3.25, cx, 3.6, FENCE_Z - 0.12, fieldBannerTex(logos), { rotY: Math.PI });
  // 서쪽 끝 철망 현수막
  plane(root, 16, 2.5, FENCE_X0 + 0.12, 3.4, cz, sloganBannerTex(logos), { rotY: Math.PI / 2 });

  // ---------- 콘크리트 스탠드 (북쪽, 가운데 통로) ----------
  const tiers = 5;
  for (const [x0, x1] of [
    [45, 90],
    [100, 145],
  ] as [number, number][]) {
    for (let k = 0; k < tiers; k++) {
      const front = STAND_Z - k * 0.9;
      const back = 51.5;
      const h = 0.45 * (k + 1);
      box(root, x1 - x0, h, front - back, (x0 + x1) / 2, h / 2, (front + back) / 2, lambert(k % 2 ? 0xa9a59d : 0xc9c5bd));
    }
    // 뒤 벽 + 난간
    box(root, x1 - x0, 3.2, 0.4, (x0 + x1) / 2, 1.6, 51.3, lambert(0xa9a59d));
    box(root, x1 - x0, 0.1, 0.1, (x0 + x1) / 2, 3.25, 51.6, lambert(0x8f979e), false);
    // 통로 쪽 옆벽
    const ex = x0 === 45 ? x1 : x0;
    box(root, 0.4, 2.6, STAND_Z - 51.1, ex, 1.3, (STAND_Z + 51.1) / 2, lambert(0xb7b3ab));
  }

  // ---------- 조명탑 (남쪽 두 모서리) ----------
  for (const x of [FENCE_X0 + 3, FENCE_X1 - 3]) {
    box(root, 0.7, 24, 0.7, x, 12, FENCE_Z + 3, lambert(0x8f979e));
    box(root, 5.2, 3.2, 0.7, x, 24.6, FENCE_Z + 2.6, lambert(0x6d7278));
    box(root, 4.6, 2.6, 0.2, x, 24.6, FENCE_Z + 2.2, lambert(0xf3efe0), false);
  }

  // ---------- 너머: 아파트와 산 ----------
  const apt = new THREE.MeshLambertMaterial({ map: apartmentTex() });
  for (const [x, z, w, h] of [
    [-44, 178, 20, 30],
    [-14, 166, 18, 36],
    [16, 174, 22, 28],
    [40, 160, 16, 24],
    [104, 170, 20, 34],
    [128, 158, 18, 26],
    [154, 172, 22, 38],
    [182, 162, 18, 30],
    [208, 176, 20, 34],
    [236, 166, 18, 26],
  ] as [number, number, number, number][]) {
    box(root, w, h, 12, x, h / 2, z, apt, false);
  }
  for (let i = 0; i < 13; i++) {
    const x = -150 + i * 40;
    const h = 12 + ((i * 7) % 5) * 2.4 + (x > -10 && x < 140 ? 0 : 6);
    box(root, 46, h, 30, x, h / 2, 250 + (i % 3) * 8, lambert(i % 2 ? 0x5b6b58 : 0x627a63), false);
  }

  // ---------- 나무, 가로등, 길 표지 ----------
  for (const [x, z, s] of [
    [29, 70, 1.1],
    [27, 98, 1.0],
    [161, 66, 1.15],
    [163, 99, 1.0],
  ] as [number, number, number][]) {
    tree(root, x, z, s, MAPLE);
  }
  for (const [x, z, s] of [
    [86.5, 28, 0.95],
    [103.5, 30, 1.0],
    [86, 45, 1.0],
    [104, 46, 0.9],
  ] as [number, number, number][]) {
    tree(root, x, z, s, GINKGO);
  }
  lamp(root, 89.3, 37, logos);
  lamp(root, 100.7, 37, logos);
  box(root, 0.16, 3.2, 0.16, 100.6, 1.6, 18.7, lambert(0x555a60));
  plane(root, 2.6, 0.82, 100.6, 3.0, 18.6, fieldSignTex(), { rotY: Math.PI });

  // 기둥·골대 장애물
  obstacles.push({ minX: MAST.x - 0.9, maxX: MAST.x + 0.9, minZ: MAST.z - 0.9, maxZ: MAST.z + 0.9 });

  return {
    obstacles,
    field: { minX: 52, maxX: 138, minZ: STAND_Z + 0.9, maxZ: 106.5 },
    path2: { minX: 91, maxX: 99, minZ: 16, maxZ: STAND_Z + 2 },
  };
}
