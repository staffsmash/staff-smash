import * as THREE from 'three';
import { bannerTex, type Logos } from './textures';

// 블록형 무대를 쌓는 도구. 같은 색 재질은 하나만 만들어 함께 쓴다.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const mats = new Map<number, THREE.MeshLambertMaterial>();

export function lambert(color: number): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}

export function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material | THREE.Material[],
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** 앞면(+z)에만 그림을 붙인 상자 */
export function frontBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  side: number,
  front: THREE.Texture,
): THREE.Mesh {
  const s = lambert(side);
  const f = new THREE.MeshLambertMaterial({ map: front });
  return box(parent, w, h, d, x, y, z, [s, s, s, s, f, s]);
}

export function plane(
  parent: THREE.Object3D,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  tex: THREE.Texture,
  opts: { transparent?: boolean; double?: boolean; rotY?: number; rotX?: number } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshLambertMaterial({
      map: tex,
      transparent: !!opts.transparent,
      alphaTest: opts.transparent ? 0.05 : 0,
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    }),
  );
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotX) m.rotation.x = opts.rotX;
  parent.add(m);
  return m;
}

export const GINKGO = [0xf0c02c, 0xf6d050, 0xe0a91e];
export const MAPLE = [0xd9622b, 0xe39b2d, 0xc4502a];

/** 블록 나무 (기본: 노란 은행나무) */
export function tree(parent: THREE.Object3D, x: number, z: number, s = 1, cols = GINKGO): void {
  box(parent, 0.5 * s, 3.2 * s, 0.5 * s, x, 1.6 * s, z, lambert(0x6b4a2f));
  const blocks: [number, number, number, number][] = [
    [0, 4.2, 0, 3.2],
    [0.9, 3.6, 0.6, 2.2],
    [-1.0, 3.7, -0.4, 2.2],
    [0.2, 5.4, -0.2, 2.0],
    [-0.4, 3.4, 1.0, 1.8],
  ];
  blocks.forEach(([bx, by, bz, size], i) => box(parent, size * s, size * s, size * s, x + bx * s, by * s, z + bz * s, lambert(cols[i % 3])));
}

const bannerCache = new Map<string, THREE.Texture>();

/** 가로등 + 학교 배너 두 장. rotY로 배너 방향을 돌린다 */
export function lamp(parent: THREE.Object3D, x: number, z: number, logos: Logos, rotY = 0): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  parent.add(g);
  box(g, 0.22, 7.5, 0.22, 0, 3.75, 0, lambert(0xe9ecee));
  box(g, 0.9, 0.3, 0.6, 0, 7.6, 0, lambert(0x8f979e));
  box(g, 3.2, 0.08, 0.08, 0, 6.5, 0, lambert(0xcfd4d8), false);
  const get = (k: 'emblem' | 'slogan') => {
    let t = bannerCache.get(k);
    if (!t) {
      t = bannerTex(logos, k);
      bannerCache.set(k, t);
    }
    return t;
  };
  plane(g, 1.4, 3.5, -0.82, 4.75, 0, get('emblem'), { double: true, transparent: true });
  plane(g, 1.4, 3.5, 0.82, 4.75, 0, get('slogan'), { double: true, transparent: true });
}
