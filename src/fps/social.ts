import * as THREE from 'three';
import { box, frontBox, lamp, lambert, MAPLE, plane, tree, type Rect } from './blocks';
import {
  brickTex,
  counselTex,
  facadeTex,
  glassBandTex,
  glassDoorTex,
  noticeBoardTex,
  socialSignTex,
  type Logos,
} from './textures';

// 두 번째 구역: 사회과학관 앞 (본편 2D 그림과 같은 모양을 블록으로).
// 가로로 긴 5층 건물. 층마다 밝은 띠와 안으로 들어간 유리창 띠가 번갈아 있고,
// 지붕 끝에 V자 브래킷, 가운데 유리 현관 위에 보라색 간판(흰 심벌)이 있다.
// 건물 정면은 x = FRONT_X 에서 -x 쪽(본관에서 걸어오는 플레이어 쪽)을 본다.

export const FRONT_X = 128;
const WIDTH = 64;
const FLOOR_H = 3.6;
const FLOORS = 5;

const LIGHT = 0xd9d5cc;
const SHADOW = 0xb8b3aa;
const GLASS_SIDE = 0x8e959a;

export function buildSocial(root: THREE.Object3D, logos: Logos): Rect[] {
  const obstacles: Rect[] = [];

  // 바닥: 붉은 보도블록
  const brick = brickTex();
  brick.repeat.set(28, 22);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(112, 90), new THREE.MeshLambertMaterial({ map: brick }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(124, 0.015, 0);
  floor.receiveShadow = true;
  root.add(floor);

  // 건물은 앞이 +z인 지역 좌표로 쌓고, 통째로 돌려서 -x 쪽을 보게 둔다
  const b = new THREE.Group();
  b.position.set(FRONT_X, 0, 0);
  b.rotation.y = -Math.PI / 2;
  root.add(b);

  const top = FLOORS * FLOOR_H;
  // 몸체 (유리 띠 뒤)
  box(b, WIDTH, top + 0.8, 13.4, 0, (top + 0.8) / 2, -7.5, lambert(LIGHT));
  // 층: 아래 유리창 띠(안으로 들어감) + 위 밝은 띠(튀어나옴)
  const glass = glassBandTex();
  glass.repeat.set(WIDTH / 10.6, 1);
  const glassMat = new THREE.MeshLambertMaterial({ map: glass });
  const gs = lambert(GLASS_SIDE);
  for (let k = 0; k < FLOORS; k++) {
    const y0 = k * FLOOR_H;
    box(b, WIDTH, 2.6, 0.4, 0, y0 + 1.3, -0.6, [gs, gs, gs, gs, glassMat, gs], false);
    box(b, WIDTH + 0.4, 1.0, 1.0, 0, y0 + 3.1, -0.2, lambert(LIGHT));
    box(b, WIDTH + 0.3, 0.12, 0.8, 0, y0 + 2.55, -0.3, lambert(SHADOW), false);
  }
  // 양 끝 벽
  for (const s of [-1, 1]) box(b, 1.2, top + 1.4, 14.6, s * (WIDTH / 2 + 0.5), (top + 1.4) / 2, -7, lambert(0xcfcac0));

  // 지붕 끝: 띠 + V자 브래킷 + 얇은 처마
  box(b, WIDTH + 1, 0.8, 1.4, 0, top + 0.4, -0.1, lambert(0x9b968e));
  box(b, WIDTH + 1.6, 0.35, 15.2, 0, top + 2.15, -6.8, lambert(0xb7b2a9));
  box(b, WIDTH - 1, 1.2, 12.5, 0, top + 1.4, -7.4, lambert(0xc9c4ba), false);
  const bracketGeo = new THREE.BoxGeometry(0.22, 1.55, 0.25);
  const nV = 11;
  const brackets = new THREE.InstancedMesh(bracketGeo, lambert(0xa9a49b), nV * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < nV; i++) {
    const x = -WIDTH / 2 + 3 + i * ((WIDTH - 6) / (nV - 1));
    for (const s of [-1, 1]) {
      e.set(0, 0, s * 0.6);
      q.setFromEuler(e);
      p.set(x + s * 0.42, top + 1.35, 0.35);
      m4.compose(p, q, one);
      brackets.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4);
    }
  }
  brackets.castShadow = true;
  b.add(brackets);

  // 현관: 유리문 + 캐노피 + 보라색 간판 + 계단
  frontBox(b, 12, 3.6, 0.3, 0, 1.8, 0.1, 0x3e5561, glassDoorTex());
  box(b, 15, 0.45, 3.0, 0, 3.85, 1.4, lambert(0x6d7278));
  frontBox(b, 13, 1.5, 0.3, 0, 4.95, 0.45, 0x5a2a86, socialSignTex(logos));
  box(b, 14, 0.18, 2.2, 0, 0.09, 1.3, lambert(0xbdb6aa), false);
  // 분홍 현수막 (현관 왼쪽)
  plane(b, 7, 1.55, -17, 1.6, 0.05, counselTex());

  // 공지 게시판 (현관 오른쪽 앞)
  const board = new THREE.Group();
  board.position.set(FRONT_X - 14, 0, 11);
  board.rotation.y = -Math.PI / 2;
  root.add(board);
  for (const s of [-1, 1]) box(board, 0.3, 6.3, 0.3, s * 3.9, 3.15, -0.25, lambert(0x5e4430));
  frontBox(board, 9, 4.92, 0.2, 0, 3.75, 0, 0x7a5b3e, noticeBoardTex());
  obstacles.push({ minX: FRONT_X - 14.6, maxX: FRONT_X - 13.4, minZ: 6.3, maxZ: 15.7 });

  // 가로등과 단풍
  // 배너 앞면이 걸어오는 쪽(-x)을 보게 돌린다
  lamp(root, 88, -13, logos, -Math.PI / 2);
  lamp(root, 88, 13, logos, -Math.PI / 2);
  obstacles.push({ minX: 87.7, maxX: 88.3, minZ: -13.3, maxZ: -12.7 }, { minX: 87.7, maxX: 88.3, minZ: 12.7, maxZ: 13.3 });
  for (const [x, z, s] of [
    [78, -21, 1.1],
    [100, -22, 1.2],
    [116, -21, 1.0],
    [80, 21.5, 1.15],
    [104, 22, 1.0],
    [121, 20, 1.1],
  ] as [number, number, number][]) {
    tree(root, x, z, s, MAPLE);
  }

  // 화단 (건물 앞 양쪽)
  for (const s of [-1, 1]) {
    box(root, 4, 0.5, 18, FRONT_X - 3, 0.25, s * 21, lambert(0xa9a191));
    box(root, 3.6, 0.55, 17.6, FRONT_X - 3, 0.28, s * 21, lambert(0x6e9a45), false);
  }

  // 뒤쪽 배경: 북쪽 건물, 동쪽 산
  const far = new THREE.Group();
  root.add(far);
  const farFacade = facadeTex({ w: 512, h: 256, cols: 11, rows: 4, wall: '#d9d5cc', glass: '#5a7184', frame: '#b8b3aa' });
  frontBox(far, 34, 16, 14, 96, 8, -52, 0xd9d5cc, farFacade).castShadow = false;
  for (let i = 0; i < 7; i++) {
    box(far, 26, 20 + (i % 3) * 7, 24, 215, 10, -90 + i * 30, lambert(i % 2 ? 0x5d7a52 : 0x6e8862), false);
  }
  return obstacles;
}
