import * as THREE from 'three';
import { lambert } from './blocks';
import { HeadTag } from './speech';
import { clipPaperTex, faceTex, mailTex, stampMarkTex } from './textures';

// 1인칭 시험판 v4의 사람 보스 (로블록스풍 블록 사람). 외형은 본편 2D rigs.ts 값을 옮겼다.
// - 김총괄 (교직원): 대관(시설 대여)을 총괄하는 가상 교직원. 1인칭 전용 외형 — 하늘색 셔츠, 짙은 초록 조끼,
//   남색 넥타이, 짧은 검은 머리, 허리띠에 찬 열쇠 꾸러미, 왼손에 강의실 열쇠 고리 (2D 창구 직원 외형은 쓰지 않는다)
// - 김보고 처장: createSupervisorRig('bogo') — 남색 정장, 빨간 넥타이, 옆머리만 남은 회색 머리, 콧수염
// - 회의소집 부총장: createSupervisorRig('meeting') — 짙은 남색 정장, 자주 넥타이, 회색 머리, 안경, 금 배지
// - 프레지던트 캉: createPresidentRig — 남색 정장, 물방울 넥타이, 위로 넘긴 짙은 갈색 머리, 눈웃음, 옷깃 배지, 손목시계
// 사람 보스는 다치지 않는다: 맞으면 몸이 아니라 들고 있는 결재판에 도장 자국과 반짝임이 생긴다.
// 머리 위 이름표·말풍선은 speech.ts의 HeadTag (화면에서 늘 같은 크기, 자막도 같이).
// 모형은 처음에 한 번만 만들고(미리 그리기) 판마다 다시 쓴다.

export type Who = 'chonggwal' | 'bogo' | 'meeting' | 'president';

export interface Look {
  /** 웃옷 (정장 또는 셔츠) */
  top: number;
  pants: number;
  tie: number;
  skin: number;
  hair: number;
  hairStyle: 'long' | 'bald' | 'full' | 'swept';
  jacket: boolean;
  glasses?: boolean;
  mustache?: number;
  smile?: boolean;
  badge?: boolean;
  lanyard?: boolean;
  tieDots?: boolean;
  watch?: boolean;
  /** 셔츠 위 조끼 색 */
  vest?: number;
  /** 허리띠에 찬 열쇠 꾸러미 */
  beltKeys?: boolean;
  /** 왼손에 드는 것 ('none' = 따로 붙인다: 학생 모드 창구 직원) */
  left: 'keys' | 'report' | 'megaphone' | 'stamp' | 'none';
  scale: number;
}

const SKIN = 0xf1c7a0;

export const LOOKS: Record<Who, Look> = {
  chonggwal: { top: 0xcfe2f5, pants: 0x3a3f47, tie: 0x23395d, skin: SKIN, hair: 0x1b1712, hairStyle: 'full', jacket: false, vest: 0x2e5a46, beltKeys: true, left: 'keys', scale: 1.55 },
  bogo: { top: 0x2f3a56, pants: 0x2f3a56, tie: 0xb3262d, skin: SKIN, hair: 0xa8a8a8, hairStyle: 'bald', jacket: true, mustache: 0x555555, left: 'report', scale: 1.62 },
  meeting: { top: 0x1f2a44, pants: 0x1f2a44, tie: 0x8a1f2c, skin: SKIN, hair: 0xb0b0b0, hairStyle: 'full', jacket: true, glasses: true, badge: true, left: 'megaphone', scale: 1.8 },
  president: { top: 0x1c2740, pants: 0x1c2740, tie: 0x22396b, skin: 0xefc29c, hair: 0x2a211c, hairStyle: 'swept', jacket: true, smile: true, badge: true, tieDots: true, watch: true, left: 'stamp', scale: 1.8 },
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 모든 사람이 함께 쓰는 모양·재질 */
class Kit {
  readonly unit = new THREE.BoxGeometry(1, 1, 1);
  readonly paperMat = new THREE.MeshLambertMaterial({ map: clipPaperTex() });
  readonly markGeo = new THREE.PlaneGeometry(0.15, 0.15);
  readonly markMat = new THREE.MeshBasicMaterial({
    map: stampMarkTex(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  readonly glowMat = new THREE.SpriteMaterial({ color: 0xfff1a0, transparent: true, depthWrite: false, opacity: 0 });
  readonly stormGeo = new THREE.PlaneGeometry(0.5, 0.34);
  readonly stormMat = new THREE.MeshLambertMaterial({ map: mailTex(), side: THREE.DoubleSide });
  readonly textures: THREE.Texture[] = [];

  constructor() {
    this.textures.push(this.paperMat.map as THREE.Texture, this.markMat.map as THREE.Texture, this.stormMat.map as THREE.Texture);
  }
}

let kit: Kit | null = null;
export const peopleKit = () => (kit ??= new Kit());

export interface PoseIn {
  /** 걷는 중 (다리·팔 흔들기) */
  walking: boolean;
  /** 결재판 들어 올리기 0~1 (1 = 머리 위로 = 약점) */
  raise: number;
  /** 왼팔 앞으로 (던지기·확성기·도장) 0~1 */
  reach: number;
  /** 손 흔들기 (작별) */
  wave: boolean;
}

export class Person {
  readonly who: Who;
  readonly look: Look;
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  /** 오른손의 결재판 */
  readonly clip = new THREE.Group();
  /** 결재판 가운데 (월드, 매 프레임 갱신) */
  readonly clipCenter = new THREE.Vector3();
  /** 가슴 (월드) */
  readonly chest = new THREE.Vector3();
  /** 김보고 처장 주위를 도는 메일 폭풍 */
  storm: THREE.InstancedMesh | null = null;
  /** 머리 위 이름표 + 말풍선 (speech.ts) */
  readonly tag: HeadTag;
  readonly label: THREE.Sprite | null;
  readonly speech: THREE.Sprite;
  private marks: THREE.Mesh[] = [];
  private markN = 0;
  private glow: THREE.Sprite;
  private glowT = 0;
  private walkT = 0;
  private t = 0;
  private faceMat: THREE.MeshLambertMaterial;

  /** look: 학생 모드 인물(처장·부총장·창구 직원)은 외형을 따로 준다 */
  constructor(who: Who, labelText: string, labelColor: string, look: Look = LOOKS[who]) {
    this.who = who;
    const L = (this.look = look);
    const k = peopleKit();
    this.faceMat = new THREE.MeshLambertMaterial({
      map: faceTex({
        skin: hex(L.skin),
        brow: hex(who === 'chonggwal' ? L.hair : who === 'president' ? L.hair : 0x6b6b6b),
        glasses: L.glasses,
        mustache: L.mustache ? hex(L.mustache) : undefined,
        smile: L.smile,
      }),
    });
    k.textures.push(this.faceMat.map as THREE.Texture);
    this.root.add(this.body);
    this.root.scale.setScalar(L.scale);
    const top = lambert(L.top);
    const skin = lambert(L.skin);
    const hair = lambert(L.hair);
    const ink = lambert(0x161616);

    // 다리 (엉덩이 = 0.86)
    for (const [leg, x] of [
      [this.legL, -0.16],
      [this.legR, 0.16],
    ] as [THREE.Group, number][]) {
      leg.position.set(x, 0.86, 0);
      this.part(leg, 0.27, 0.78, 0.29, 0, -0.39, 0, lambert(L.pants));
      this.part(leg, 0.29, 0.12, 0.38, 0, -0.8, 0.04, ink);
      this.body.add(leg);
    }
    // 몸통 (0.86 ~ 1.62)
    this.part(this.body, 0.7, 0.78, 0.4, 0, 1.24, 0, top);
    if (L.jacket) {
      // 셔츠 V + 옷깃
      this.part(this.body, 0.22, 0.34, 0.02, 0, 1.45, 0.205, lambert(0xffffff));
      this.part(this.body, 0.08, 0.36, 0.03, -0.12, 1.44, 0.21, lambert(darken(L.top))).rotation.z = 0.35;
      this.part(this.body, 0.08, 0.36, 0.03, 0.12, 1.44, 0.21, lambert(darken(L.top))).rotation.z = -0.35;
    } else if (L.vest !== undefined) {
      // 조끼: 몸통을 감싸고 앞가슴만 셔츠가 보인다 (넥타이는 그 위)
      this.part(this.body, 0.74, 0.62, 0.44, 0, 1.18, 0, lambert(L.vest));
      this.part(this.body, 0.2, 0.3, 0.02, 0, 1.43, 0.215, top);
      this.part(this.body, 0.05, 0.05, 0.02, 0.08, 1.08, 0.225, lambert(0xd9d9d9));
      this.part(this.body, 0.05, 0.05, 0.02, 0.08, 0.96, 0.225, lambert(0xd9d9d9));
      // 허리띠
      this.part(this.body, 0.72, 0.07, 0.42, 0, 0.88, 0, lambert(0x1c1c1c));
    } else {
      // 셔츠 단추 줄
      this.part(this.body, 0.03, 0.6, 0.02, 0.09, 1.25, 0.205, lambert(darken(L.top)));
    }
    if (L.beltKeys) this.keyBunch(this.body, -0.28, 0.84, 0.23, 0.06);
    this.part(this.body, 0.09, 0.07, 0.03, 0, 1.58, 0.225, lambert(L.tie));
    this.part(this.body, 0.08, 0.4, 0.03, 0, 1.36, 0.225, lambert(L.tie));
    if (L.tieDots) for (const [dx, dy] of [[-0.015, 1.47], [0.015, 1.39], [-0.015, 1.31], [0.015, 1.23]]) this.part(this.body, 0.018, 0.018, 0.01, dx, dy, 0.24, lambert(0xcfe3ff));
    if (L.badge) this.part(this.body, 0.05, 0.05, 0.02, -0.2, 1.52, 0.215, lambert(0xd9b44a));
    if (L.lanyard) {
      this.part(this.body, 0.03, 0.34, 0.02, 0.17, 1.44, 0.21, lambert(0x2f6fd1));
      this.part(this.body, 0.14, 0.18, 0.02, 0.17, 1.2, 0.215, lambert(0xffffff));
      this.part(this.body, 0.14, 0.05, 0.025, 0.17, 1.27, 0.216, lambert(0x2f6fd1));
    }
    // 팔 (어깨 = 1.56, 아래로 매달림)
    for (const [arm, x] of [
      [this.armL, -0.45],
      [this.armR, 0.45],
    ] as [THREE.Group, number][]) {
      arm.position.set(x, 1.56, 0);
      this.part(arm, 0.2, 0.66, 0.24, 0, -0.31, 0, top);
      this.part(arm, 0.18, 0.16, 0.2, 0, -0.71, 0, skin);
      this.body.add(arm);
    }
    if (L.watch) this.part(this.armL, 0.21, 0.06, 0.25, 0, -0.6, 0, lambert(0xc9ced4));
    // 머리 (목 = 1.64)
    this.head.position.set(0, 1.64, 0);
    this.body.add(this.head);
    const headMesh = new THREE.Mesh(k.unit, [skin, skin, skin, skin, this.faceMat, skin]);
    headMesh.scale.set(0.52, 0.5, 0.48);
    headMesh.position.set(0, 0.27, 0);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.buildHair(hair);
    // 오른손 결재판
    this.buildClip();
    this.armR.add(this.clip);
    // 왼손 소품
    this.buildLeft();
    if (who === 'bogo') {
      const storm = new THREE.InstancedMesh(k.stormGeo, k.stormMat, 30);
      storm.frustumCulled = false;
      storm.visible = false;
      this.root.add(storm);
      this.storm = storm;
    }
    // 반짝임 (도장이 결재판에 맞았을 때)
    this.glow = new THREE.Sprite(k.glowMat.clone());
    this.glow.scale.setScalar(0.9);
    this.glow.visible = false;
    this.glow.renderOrder = 9;
    this.clip.add(this.glow);
    // 이름표·말풍선: 머리 위 기준점에 붙인다. 들어 올린 결재판 꼭대기(약 2.64) 높이라 약점을 거의 가리지 않는다
    this.tag = new HeadTag(labelText, labelColor, L.scale);
    this.tag.group.position.set(0, 2.62, 0);
    this.root.add(this.tag.group);
    this.label = this.tag.label;
    this.speech = this.tag.bubble;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  private part(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(peopleKit().unit, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private buildHair(hair: THREE.Material): void {
    const h = this.head;
    switch (this.look.hairStyle) {
      case 'long':
        this.part(h, 0.56, 0.14, 0.52, 0, 0.55, -0.01, hair);
        this.part(h, 0.56, 0.62, 0.12, 0, 0.26, -0.27, hair);
        this.part(h, 0.08, 0.5, 0.4, -0.29, 0.3, -0.04, hair);
        this.part(h, 0.08, 0.5, 0.4, 0.29, 0.3, -0.04, hair);
        this.part(h, 0.46, 0.08, 0.06, 0, 0.47, 0.24, hair);
        break;
      case 'bald':
        // 옆머리와 뒷머리만
        this.part(h, 0.07, 0.24, 0.4, -0.29, 0.34, -0.03, hair);
        this.part(h, 0.07, 0.24, 0.4, 0.29, 0.34, -0.03, hair);
        this.part(h, 0.56, 0.24, 0.07, 0, 0.32, -0.27, hair);
        break;
      case 'full':
        this.part(h, 0.56, 0.14, 0.52, 0, 0.55, -0.01, hair);
        this.part(h, 0.07, 0.2, 0.4, -0.29, 0.4, -0.03, hair);
        this.part(h, 0.07, 0.2, 0.4, 0.29, 0.4, -0.03, hair);
        this.part(h, 0.56, 0.3, 0.07, 0, 0.36, -0.27, hair);
        break;
      case 'swept':
        // 가르마에서 위로 넘긴 머리: 앞쪽이 볼록하다
        this.part(h, 0.56, 0.12, 0.52, 0, 0.56, -0.01, hair);
        this.part(h, 0.42, 0.1, 0.2, 0.04, 0.63, 0.13, hair);
        this.part(h, 0.07, 0.24, 0.4, -0.29, 0.4, -0.03, hair);
        this.part(h, 0.07, 0.24, 0.4, 0.29, 0.4, -0.03, hair);
        this.part(h, 0.56, 0.3, 0.07, 0, 0.36, -0.27, hair);
        this.part(h, 0.03, 0.03, 0.18, -0.12, 0.63, 0.1, lambert(0x4a3a30));
        break;
    }
  }

  /** 결재판: 갈색 판 + 결재 종이 + 집게. 종이에 도장 자국이 쌓인다 */
  private buildClip(): void {
    const k = peopleKit();
    const c = this.clip;
    c.position.set(0, -0.8, 0.12);
    this.part(c, 0.54, 0.7, 0.04, 0, 0, 0, lambert(0x9a6a3a));
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.59), k.paperMat);
    paper.position.set(0, -0.02, 0.022);
    c.add(paper);
    this.part(c, 0.2, 0.08, 0.06, 0, 0.34, 0.02, lambert(0x8a8f96));
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(k.markGeo, k.markMat);
      m.visible = false;
      m.position.z = 0.025;
      c.add(m);
      this.marks.push(m);
    }
  }

  private buildLeft(): void {
    const a = this.armL;
    const y = -0.8;
    switch (this.look.left) {
      case 'keys':
        // 강의실 열쇠 고리 (큰 고리 + 열쇠 넷 + 파란 번호표)
        this.keyBunch(a, 0, y - 0.08, 0.08, 0.1);
        this.part(a, 0.1, 0.13, 0.02, 0.1, y - 0.3, 0.09, lambert(0x2f6fd1));
        break;
      case 'report':
        this.part(a, 0.3, 0.4, 0.02, 0, y - 0.1, 0.14, lambert(0xffffff));
        break;
      case 'megaphone': {
        // 손잡이 + 흰 몸통 + 벌어진 나팔 (앞 = +z)
        this.part(a, 0.08, 0.2, 0.1, 0, y, 0.02, lambert(0x2b2b2b));
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12).rotateX(Math.PI / 2), lambert(0xf1ede2));
        body.position.set(0, y + 0.12, 0.08);
        a.add(body);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.1, 0.3, 14, 1, true).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf1ede2, side: THREE.DoubleSide }));
        bell.position.set(0, y + 0.12, 0.36);
        a.add(bell);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 20), lambert(0xc8202f));
        rim.position.set(0, y + 0.12, 0.51);
        a.add(rim);
        break;
      }
      case 'stamp':
        this.part(a, 0.1, 0.22, 0.1, 0, y - 0.02, 0.06, lambert(0x8b5a2b));
        this.part(a, 0.26, 0.1, 0.22, 0, y - 0.16, 0.06, lambert(0xc8202f));
        break;
    }
  }

  /** 열쇠 꾸러미: 놋쇠 고리 하나에 열쇠 넷이 부채처럼 매달린다 (r = 고리 반지름) */
  private keyBunch(parent: THREE.Object3D, x: number, y: number, z: number, r: number): void {
    const brass = lambert(0xd9b23a);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.22, 6, 14), brass);
    ring.position.set(x, y, z);
    parent.add(ring);
    const kc = [0xd9b23a, 0xc0c4ca, 0xd9b23a, 0xc0c4ca];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(x, y - r, z + 0.01);
      g.rotation.z = (i - 1.5) * 0.32;
      const m = lambert(kc[i]);
      this.part(g, r * 0.6, r * 0.45, 0.02, 0, -r * 0.3, 0, m);
      this.part(g, r * 0.22, r * 1.5, 0.02, 0, -r * 1.2, 0, m);
      this.part(g, r * 0.3, r * 0.22, 0.02, r * 0.22, -r * 1.7, 0, m);
      parent.add(g);
    }
  }

  /** 말풍선 띄우기 (+ 화면 위쪽 자막. 미리 그릴 때는 subtitle = false) */
  say(text: string, sec: number, subtitle = true): void {
    this.tag.say(text, sec, subtitle);
  }

  /** 도장이 결재판에 닿았다: 자국 하나 + 반짝 */
  stampMark(big: boolean): void {
    const m = this.marks[this.markN++ % this.marks.length];
    m.position.x = (Math.random() - 0.5) * 0.3;
    m.position.y = -0.08 + (Math.random() - 0.5) * 0.36;
    m.rotation.z = (Math.random() - 0.5) * 0.8;
    m.scale.setScalar(big ? 1.5 : 1);
    m.visible = true;
    this.glowT = big ? 0.35 : 0.2;
    this.glow.visible = true;
  }

  /** 새 판: 자국 지우기, 자세 처음으로 */
  reset(): void {
    for (const m of this.marks) m.visible = false;
    this.markN = 0;
    this.tag.hide();
    this.glow.visible = false;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    if (this.storm) this.storm.visible = false;
  }

  /** 자세와 시간 효과. 월드 좌표(결재판·가슴)도 여기서 갱신한다 */
  update(dt: number, p: PoseIn): void {
    this.t += dt;
    if (p.walking) this.walkT += dt * 7;
    const sw = p.walking ? Math.sin(this.walkT) : 0;
    this.legL.rotation.x = sw * 0.5;
    this.legR.rotation.x = -sw * 0.5;
    this.body.position.y = p.walking ? Math.abs(Math.cos(this.walkT)) * 0.04 : Math.sin(this.t * 1.6) * 0.01;
    // 오른팔: 걸을 때 흔들고, 결재판을 들면 머리 위로
    const hold = -0.45 + sw * 0.25;
    const ar = hold + (-2.55 - hold) * p.raise;
    this.armR.rotation.x += (ar - this.armR.rotation.x) * Math.min(1, dt * 12);
    // 결재판이 늘 플레이어 쪽을 향하게 팔과 반대로 돌린다 (들면 살짝 뒤로 젖힌다)
    this.clip.rotation.x = -this.armR.rotation.x - 0.12 - p.raise * 0.25;
    let al = 0.2 - sw * 0.35;
    if (p.reach > 0) al = al + (-1.45 - al) * p.reach;
    if (p.wave) al = -2.7 + Math.sin(this.t * 9) * 0.25;
    this.armL.rotation.x += (al - this.armL.rotation.x) * Math.min(1, dt * 12);
    this.armL.rotation.z = p.wave ? -0.35 : 0;
    this.head.rotation.x = p.raise > 0.5 ? -0.12 : 0;
    // 말풍선·반짝임
    this.tag.update(dt);
    if (this.glowT > 0) {
      this.glowT -= dt;
      const g = this.glow.material;
      g.opacity = Math.max(0, this.glowT * 3);
      this.glow.scale.setScalar(0.6 + (0.35 - this.glowT) * 2.4);
      if (this.glowT <= 0) this.glow.visible = false;
    }
    // getWorldPosition은 부모(보스 자리·방향)까지 행렬을 새로 계산한다
    this.clip.getWorldPosition(this.clipCenter);
    this.chest.set(0, 1.25, 0).applyMatrix4(this.root.matrixWorld);
  }

  /** 메일 폭풍 그리기 (김보고 처장). strength 0~1 */
  updateStorm(strength: number): void {
    const s = this.storm;
    if (!s) return;
    s.visible = strength > 0.01;
    if (!s.visible) return;
    const n = s.count;
    for (let i = 0; i < n; i++) {
      const ring = i % 3;
      const a = (i / n) * Math.PI * 2 + this.t * (1.3 + ring * 0.35) * (ring === 1 ? -1 : 1);
      const r = (1.25 + ring * 0.35) * (0.6 + strength * 0.4);
      _p.set(Math.cos(a) * r, 1.0 + Math.sin(this.t * 2 + i) * 0.5 + ring * 0.25, Math.sin(a) * r);
      _e.set(this.t * 3 + i, a, this.t * 2 + i * 0.5);
      _q.setFromEuler(_e);
      _s.setScalar(0.8 + (i % 4) * 0.1);
      _m.compose(_p, _q, _s);
      s.setMatrixAt(i, _m);
    }
    s.instanceMatrix.needsUpdate = true;
  }
}

const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

function darken(c: number): number {
  const f = 0.72;
  return (Math.round(((c >> 16) & 255) * f) << 16) | (Math.round(((c >> 8) & 255) * f) << 8) | Math.round((c & 255) * f);
}
