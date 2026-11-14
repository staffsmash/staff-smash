import * as THREE from 'three';
import { SPELLS } from '../../data/spells';
import { lambert } from '../blocks';
import { canvasTex, docTex, labelTex } from '../textures';
import {
  absenceBottomTex,
  absenceFaceTex,
  cancelBotTex,
  markTex,
  paperDecalTex,
  penLineTex,
  rejectDocTex,
  signTex,
  ticketTex,
  towerTex,
} from './textures';

// 학생 모드 물건 모형: 서류 비행기(던지는 것), 잡몹 넷(반려 서류·결석 도장·휴강 공지 봇·대기번호표),
// 박반려 처장의 서류 탑, 총장실 꾸밈. 모양과 재질은 처음에 한 번 만들어 함께 쓴다.

const hexStr = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class StudentKit {
  readonly textures: THREE.Texture[] = [];
  // 서류 비행기
  private planeGeo: THREE.BufferGeometry;
  private planeMat = new THREE.MeshLambertMaterial({ color: 0xfbf8f0, side: THREE.DoubleSide });
  private stripeGeo = new THREE.BoxGeometry(0.02, 0.012, 0.36);
  // 반려 서류
  private docGeo = new THREE.BoxGeometry(0.9, 1.12, 0.06);
  private docSide = lambert(0xe8dfc9);
  private docFace: THREE.MeshLambertMaterial;
  private flapGeo = new THREE.BoxGeometry(0.32, 0.03, 0.26);
  // 결석 도장
  private padGeo = new THREE.BoxGeometry(1.1, 0.16, 0.85);
  private stampBodyGeo = new THREE.BoxGeometry(1.0, 0.34, 0.78);
  private neckGeo = new THREE.BoxGeometry(0.34, 0.42, 0.34);
  private knobGeo = new THREE.BoxGeometry(0.56, 0.24, 0.5);
  private padMats: THREE.Material[];
  private bodyMats: THREE.Material[];
  // 휴강 공지 봇
  private botGeo = new THREE.PlaneGeometry(2.7, 1.35);
  private botTex: THREE.Texture;
  private antGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.36, 6);
  private ballGeo = new THREE.SphereGeometry(0.09, 10, 8);
  // 대기번호표
  private ticketGeo = new THREE.BoxGeometry(0.62, 0.86, 0.06);
  private ticketBack = lambert(0xf1f1f1);
  private ticketFaces = new Map<string, THREE.MeshLambertMaterial>();
  private legGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1);
  private armGeo = new THREE.BoxGeometry(0.08, 0.24, 0.08);
  // 서류 탑
  private towerMat: THREE.MeshLambertMaterial;
  private towerTop = lambert(0xfbf8f0);
  // 첨삭 선
  readonly penTex: THREE.Texture;
  readonly penLabel: THREE.SpriteMaterial;
  // 맞힌 자리 도장 · 바닥 자국 · 서류 그림
  readonly passMark: THREE.Texture;
  readonly persuadeMark: THREE.Texture;
  readonly reflectMark: THREE.Texture;
  readonly spellMarks = new Map<string, THREE.Texture>();
  readonly paperDecal: THREE.Texture;
  readonly rejectSheet: THREE.Texture;
  readonly approvalSheet: THREE.Texture;

  constructor() {
    // 서류 비행기: 앞(-z)이 뾰족한 날개 두 장 + 아래 용골
    const N = [0, 0, -0.34];
    const L = [-0.25, 0.03, 0.2];
    const R = [0.25, 0.03, 0.2];
    const C = [0, -0.01, 0.2];
    const K = [0, -0.09, 0.19];
    const pts = [...N, ...L, ...C, ...N, ...C, ...R, ...N, ...K, ...C];
    this.planeGeo = new THREE.BufferGeometry();
    this.planeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.planeGeo.computeVertexNormals();
    const face = rejectDocTex();
    this.docFace = new THREE.MeshLambertMaterial({ map: face });
    const bottom = absenceBottomTex();
    const front = absenceFaceTex();
    const red = lambert(0xc8202f);
    const wood = lambert(0x9a6a3a);
    this.padMats = [red, red, red, new THREE.MeshLambertMaterial({ map: bottom }), red, red];
    this.bodyMats = [wood, wood, wood, wood, new THREE.MeshLambertMaterial({ map: front }), wood];
    this.botTex = cancelBotTex();
    const tower = towerTex();
    tower.wrapS = THREE.RepeatWrapping;
    this.towerMat = new THREE.MeshLambertMaterial({ map: tower });
    this.penTex = penLineTex();
    const pl = labelTex('첨삭', '#ffffff', 'rgba(208,32,47,0.92)', '');
    this.penLabel = new THREE.SpriteMaterial({ map: pl, transparent: true, depthWrite: false });
    this.passMark = markTex('통과', '#d0202f');
    this.persuadeMark = markTex('설득', '#1d4ed8');
    this.reflectMark = markTex('반사', '#7c3aed');
    for (const s of SPELLS) this.spellMarks.set(s.id, markTex(s.stamp, hexStr(s.color)));
    this.paperDecal = paperDecalTex();
    this.rejectSheet = docTex('반려 서류', '#c8202f');
    this.approvalSheet = docTex('결재 서류', '#22304f');
    this.textures.push(face, bottom, front, this.botTex, tower, this.penTex, pl, this.passMark, this.persuadeMark, this.reflectMark, this.paperDecal);
    this.textures.push(...this.spellMarks.values(), this.rejectSheet, this.approvalSheet);
  }

  /** 던지는 서류 비행기 (앞 = -z) */
  plane(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.planeGeo, this.planeMat);
    m.scale.setScalar(1.25);
    const s = new THREE.Mesh(this.stripeGeo, lambert(0x002c52));
    s.position.set(0, 0.03, 0.02);
    g.add(m, s);
    return g;
  }

  /** 손에 든 접은 서류 (화면 오른쪽 아래) */
  heldPaper(): THREE.Group {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.planeGeo, this.planeMat);
    m.rotation.set(-0.6, 0, 0);
    m.scale.setScalar(0.85);
    m.position.set(0, 0.1, -0.16);
    g.add(m);
    return g;
  }

  rejectDoc(): { obj: THREE.Group; wings: THREE.Mesh[] } {
    const obj = new THREE.Group();
    const s = this.docSide;
    const body = new THREE.Mesh(this.docGeo, [s, s, s, s, this.docFace, s]);
    body.castShadow = true;
    obj.add(body);
    const wings: THREE.Mesh[] = [];
    for (const k of [-1, 1]) {
      const w = new THREE.Mesh(this.flapGeo, lambert(0xffffff));
      w.position.set(k * 0.58, 0.18, 0);
      obj.add(w);
      wings.push(w);
    }
    return { obj, wings };
  }

  /** 결석 도장: 빨간 인주 바닥(아래에 "결석"), 나무 몸통(앞에 화난 눈), 손잡이 */
  absenceStamp(): { obj: THREE.Group; top: THREE.Group } {
    const obj = new THREE.Group();
    const pad = new THREE.Mesh(this.padGeo, this.padMats);
    pad.position.y = 0.08;
    const body = new THREE.Mesh(this.stampBodyGeo, this.bodyMats);
    body.position.y = 0.33;
    const top = new THREE.Group();
    const neck = new THREE.Mesh(this.neckGeo, lambert(0x8b5a2b));
    neck.position.y = 0.71;
    const knob = new THREE.Mesh(this.knobGeo, lambert(0x7a4a22));
    knob.position.y = 1.02;
    top.add(neck, knob);
    for (const m of [pad, body, neck, knob]) m.castShadow = true;
    obj.add(pad, body, top);
    return { obj, top };
  }

  /** 휴강 공지 봇: 앞뒤 두 장 + 안테나. 부르르 떨 때 붉게 물들도록 재질은 하나씩 */
  cancelBot(): { obj: THREE.Group; mat: THREE.MeshBasicMaterial } {
    const obj = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: this.botTex, transparent: true, alphaTest: 0.1 });
    const front = new THREE.Mesh(this.botGeo, mat);
    const back = new THREE.Mesh(this.botGeo, mat);
    back.rotation.y = Math.PI;
    const ant = new THREE.Mesh(this.antGeo, lambert(0x6b7280));
    ant.position.set(0.75, 0.78, 0);
    const ball = new THREE.Mesh(this.ballGeo, lambert(0xd0202f));
    ball.position.set(0.75, 0.98, 0);
    obj.add(front, back, ant, ball);
    return { obj, mat };
  }

  private ticketFace(no: string): THREE.MeshLambertMaterial {
    let m = this.ticketFaces.get(no);
    if (!m) {
      const t = ticketTex(no);
      this.textures.push(t);
      m = new THREE.MeshLambertMaterial({ map: t });
      this.ticketFaces.set(no, m);
    }
    return m;
  }

  /** 대기번호표 (번호 그림은 번호마다 하나씩 만들어 둔다) */
  ticket(no: string): { obj: THREE.Group; legs: THREE.Mesh[]; card: THREE.Mesh } {
    const obj = new THREE.Group();
    const b = this.ticketBack;
    const card = new THREE.Mesh(this.ticketGeo, [b, b, b, b, this.ticketFace(no), b]);
    card.position.y = 0.73;
    card.castShadow = true;
    obj.add(card);
    const legs: THREE.Mesh[] = [];
    for (const k of [-1, 1]) {
      const leg = new THREE.Mesh(this.legGeo, lambert(0x3a3a44));
      leg.position.set(k * 0.14, 0.15, 0);
      obj.add(leg);
      legs.push(leg);
      const arm = new THREE.Mesh(this.armGeo, lambert(0xffffff));
      arm.position.set(k * 0.36, 0.7, 0);
      obj.add(arm);
    }
    return { obj, legs, card };
  }

  /** 미리 그려 둘 번호 (처음 나올 때 끊기지 않게) */
  warmTickets(nos: string[]): void {
    for (const n of nos) this.ticketFace(n);
  }

  /** 박반려 처장의 서류 탑 (층층이 조금씩 어긋난 종이 묶음 셋) */
  docTower(): THREE.Group {
    const g = new THREE.Group();
    const t = this.towerTop;
    const mats = [this.towerMat, this.towerMat, t, t, this.towerMat, this.towerMat];
    let y = 0;
    for (const [w, h, d, rot] of [
      [1.6, 0.9, 1.1, 0.04],
      [1.45, 0.85, 1.0, -0.07],
      [1.55, 0.8, 1.05, 0.05],
    ] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.y = y + h / 2;
      m.rotation.y = rot;
      m.castShadow = true;
      g.add(m);
      y += h;
    }
    return g;
  }

  /** 총장실 꾸밈 (본관 계단 앞): 붉은 융단, 책상과 "총장실" 표지, 깃대 둘 */
  presidentOffice(): THREE.Group {
    const g = new THREE.Group();
    const carpetTex = canvasTex(64, 256, (c) => {
      c.fillStyle = '#9b1c2a';
      c.fillRect(0, 0, 64, 256);
      c.fillStyle = '#e0bb62';
      c.fillRect(3, 0, 4, 256);
      c.fillRect(57, 0, 4, 256);
    });
    carpetTex.wrapT = THREE.RepeatWrapping;
    carpetTex.repeat.set(1, 6);
    this.textures.push(carpetTex);
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 22).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: carpetTex, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    );
    carpet.position.set(0, 0.02, -4.4);
    carpet.receiveShadow = true;
    g.add(carpet);
    // 책상 (왼쪽, 서버 랙과 마주 보게)
    const desk = new THREE.Group();
    desk.position.set(-6.4, 0, -17.2);
    const wood = lambert(0x6b4a2f);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.12, 1.2), lambert(0x4a3220));
    top.position.y = 0.92;
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.86, 1.1), wood);
    front.position.y = 0.43;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshLambertMaterial({ map: signTex('총장실') }));
    sign.position.set(0, 0.5, 0.56);
    this.textures.push((sign.material as THREE.MeshLambertMaterial).map as THREE.Texture);
    for (const m of [top, front]) m.castShadow = true;
    desk.add(top, front, sign);
    g.add(desk);
    // 깃대 둘 (남색 깃발)
    for (const x of [-10.5, 10.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), lambert(0xc9ced4));
      pole.position.set(x, 2.1, -17.4);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.95, 0.03), lambert(0x002c52));
      flag.position.set(x + 0.72 * Math.sign(-x), 3.55, -17.4);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.035), lambert(0xe0bb62));
      fringe.position.set(flag.position.x, 3.04, -17.4);
      for (const m of [pole, flag]) m.castShadow = true;
      g.add(pole, flag, fringe);
    }
    g.visible = false;
    return g;
  }
}
