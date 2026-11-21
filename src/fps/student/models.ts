import * as THREE from 'three';
import { SPELLS } from '../../data/spells';
import { lambert } from '../blocks';
import { FONT } from '../../config';
import { canvasTex, docTex, labelTex } from '../textures';
import {
  absenceBottomTex,
  absenceFaceTex,
  cancelBotTex,
  markTex,
  paperDecalTex,
  passportTex,
  penLineTex,
  rejectDocTex,
  signTex,
  ticketTex,
} from './textures';

// 학생 모드 물건 모형: 서류 비행기(던지는 것), 잡몹 넷(반려 서류·결석 도장·휴강 공지 봇·대기번호표),
// 전필수 학과장의 수강편람 탑, 최도서관의 책수레, 한학고 학장의 성적표, 총장실 꾸밈. 모양과 재질은 처음에 한 번 만들어 함께 쓴다.

/** 수강편람 책등 (탑 옆면): 청록·남색·자주 표지가 번갈아 쌓이고 "수강편람" 글씨 */
function catalogTex(): THREE.CanvasTexture {
  const t = canvasTex(128, 256, (g) => {
    const covers = ['#13707a', '#1f3a6b', '#7a1f2b'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = covers[i % 3];
      g.fillRect(0, i * 32, 128, 32);
      g.fillStyle = '#f4f0e0';
      g.fillRect(0, i * 32 + 29, 128, 3);
      g.fillStyle = '#ffffff';
      g.font = `bold 15px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('수강편람', 64, i * 32 + 15);
    }
  });
  return t;
}

/** 성적표 한 장 (A+ 초록 / F 빨강) */
function gradeTex(grade: 'A+' | 'F'): THREE.CanvasTexture {
  return canvasTex(128, 160, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#002c52';
    g.fillRect(0, 0, 128, 26);
    g.fillStyle = '#ffffff';
    g.font = `bold 15px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('성적표', 64, 13);
    g.fillStyle = '#c9ced4';
    for (let i = 0; i < 4; i++) g.fillRect(14, 40 + i * 14, 50, 5);
    g.fillStyle = grade === 'F' ? '#d0202f' : '#1d7a3a';
    g.font = `bold ${grade === 'F' ? 72 : 56}px ${FONT}`;
    g.fillText(grade, 70, 114);
  });
}

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
  // 수강편람 탑
  private towerMat: THREE.MeshLambertMaterial;
  private towerTop = lambert(0xf4f0e0);
  // 성적표 (A+ · F)
  private gradeGeo = new THREE.BoxGeometry(0.62, 0.8, 0.03);
  private gradeMats: Record<'A+' | 'F', THREE.Material[]>;
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
  // 여권 (김국제)
  private passGeo = new THREE.BoxGeometry(0.34, 0.46, 0.05);
  private passMats: THREE.Material[];

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
    const tower = catalogTex();
    tower.wrapS = THREE.RepeatWrapping;
    this.towerMat = new THREE.MeshLambertMaterial({ map: tower });
    const ga = gradeTex('A+');
    const gf = gradeTex('F');
    const edge0 = lambert(0xe5e7eb);
    const fa = new THREE.MeshLambertMaterial({ map: ga });
    const ff = new THREE.MeshLambertMaterial({ map: gf });
    this.gradeMats = { 'A+': [edge0, edge0, edge0, edge0, fa, fa], F: [edge0, edge0, edge0, edge0, ff, ff] };
    this.textures.push(ga, gf);
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
    const pass = passportTex();
    const cover = new THREE.MeshLambertMaterial({ map: pass });
    const edge = lambert(0x16294d);
    this.passMats = [edge, edge, lambert(0xf3ecdd), edge, cover, cover];
    this.textures.push(pass);
  }

  /** 김국제가 던지는 여권 한 권 */
  passport(): THREE.Mesh {
    const m = new THREE.Mesh(this.passGeo, this.passMats);
    m.castShadow = true;
    return m;
  }

  /** 한학고 학장의 성적표 한 장 (바닥에 떠서 돈다 — obj.children[0]이 떠 있는 물건) */
  gradeSheet(grade: 'A+' | 'F'): THREE.Group {
    const obj = new THREE.Group();
    const item = new THREE.Group();
    const m = new THREE.Mesh(this.gradeGeo, this.gradeMats[grade]);
    m.castShadow = true;
    item.add(m);
    item.position.y = 0.6;
    obj.add(item);
    return obj;
  }

  /** 최도서관의 책수레 (바퀴 넷, 선반 둘에 꽂힌 책). 앞 = +z */
  bookCart(): THREE.Group {
    const g = new THREE.Group();
    const metal = lambert(0x6b7280);
    const dark = lambert(0x374151);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    };
    box(1.3, 0.06, 0.7, 0, 0.22, 0, metal);
    box(1.3, 0.06, 0.7, 0, 0.62, 0, metal);
    for (const x of [-0.62, 0.62]) for (const z of [-0.32, 0.32]) box(0.05, 0.6, 0.05, x, 0.48, z, dark);
    for (const x of [-0.55, 0.55]) for (const z of [-0.3, 0.3]) box(0.12, 0.12, 0.12, x, 0.07, z, lambert(0x1d1d22));
    const spines = [0x7a1f2b, 0x13707a, 0xd9b44a, 0x1f3a6b, 0xc8202f, 0x2f6b5a];
    for (let i = 0; i < 10; i++) box(0.1, 0.3, 0.5, -0.52 + i * 0.115, 0.4, 0, lambert(spines[i % spines.length]));
    for (let i = 0; i < 8; i++) box(0.1, 0.26, 0.5, -0.42 + i * 0.12, 0.78, 0, lambert(spines[(i + 2) % spines.length]));
    return g;
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

  /** 전필수 학과장의 수강편람 탑 (층층이 조금씩 어긋난 책 묶음 셋) */
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
