import * as THREE from 'three';
import type { SheetKind } from './enemies';
import {
  bombFaceTex,
  bombSideTex,
  bubbleTex,
  bulkTex,
  canvasTex,
  docTex,
  drawTimer,
  FONT,
  glowTex,
  labelTex,
  mailTex,
  paperTex,
  phoneFaceTex,
  serverTex,
  warnTex,
} from './textures';

// 적·물건·도장의 블록 모형. 모양(geometry)과 재질은 종류마다 하나씩 만들어 함께 쓴다.

/** 줍는 물건: 음식 셋 + 식권(체력 모두 회복) + 보조배터리(필살기 게이지 +50)
 *  + 연차 쿠폰(학생: 공결 확인서 — 다음 한 번 막기) + 셔틀버스 시간표(10초 빨리 걷기) + 단톡방 공지 캡처(잡몹 2.5초 멈춤) */
export type FoodKind = 'donkatsu' | 'gimbap' | 'americano' | 'ticket' | 'battery' | 'shield' | 'shuttle' | 'capture';

export const FOOD_NAMES: Record<FoodKind, string> = {
  donkatsu: '학식 돈가스',
  gimbap: '삼각김밥',
  americano: '아메리카노',
  ticket: '식권',
  battery: '보조배터리',
  shield: '연차 쿠폰',
  shuttle: '셔틀버스 시간표',
  capture: '단톡방 공지 캡처',
};

/** 학생 모드에서 이름이 바뀌는 것 */
export const STUDENT_FOOD_NAMES: Partial<Record<FoodKind, string>> = {
  shield: '공결 확인서',
};

/** 모드에 맞는 물건 이름 */
export function foodName(kind: FoodKind, student: boolean): string {
  return (student && STUDENT_FOOD_NAMES[kind]) || FOOD_NAMES[kind];
}

/** 연차 쿠폰 앞뒤 그림 (민트색 쿠폰, 초록 꼬리표, 절취선) */
function leaveCouponTex(): THREE.CanvasTexture {
  return canvasTex(256, 148, (g) => {
    g.fillStyle = '#d9f5e3';
    g.fillRect(0, 0, 256, 148);
    g.fillStyle = '#2f9e6a';
    g.fillRect(200, 0, 56, 148);
    g.strokeStyle = '#8fb9a2';
    g.lineWidth = 4;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(196, 8);
    g.lineTo(196, 140);
    g.stroke();
    g.setLineDash([]);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1f7a55';
    g.font = `bold 60px ${FONT}`;
    g.fillText('연차', 98, 58);
    g.font = `bold 34px ${FONT}`;
    g.fillText('쿠폰 1일', 98, 112);
    g.fillStyle = '#ffffff';
    g.font = `bold 44px ${FONT}`;
    g.fillText('1', 228, 76);
  });
}

/** 공결 확인서 앞뒤 그림 (흰 서류, 남색 제목 띠, 글줄, 빨간 확인 도장) */
function absenceOkTex(): THREE.CanvasTexture {
  return canvasTex(176, 236, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 176, 236);
    g.fillStyle = '#1f3a6b';
    g.fillRect(0, 0, 176, 52);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `bold 30px ${FONT}`;
    g.fillText('공결 확인서', 88, 28);
    g.fillStyle = '#9aa3ad';
    for (let i = 0; i < 4; i++) g.fillRect(18, 74 + i * 26, i === 3 ? 80 : 140, 8);
    g.strokeStyle = '#d0202f';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 190, 28, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#d0202f';
    g.font = `bold 24px ${FONT}`;
    g.fillText('확인', 128, 191);
  });
}

/** 셔틀버스 시간표 앞뒤 그림 (파란 머리 띠, 시간 칸) */
function shuttleTex(): THREE.CanvasTexture {
  return canvasTex(224, 176, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 224, 176);
    g.fillStyle = '#2f6fd1';
    g.fillRect(0, 0, 224, 46);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    g.font = `bold 28px ${FONT}`;
    g.fillText('셔틀버스', 112, 25);
    g.fillStyle = '#1d1d22';
    g.font = `bold 24px ${FONT}`;
    const times = ['16:55', '17:00', '17:05', '17:10', '17:15', '17:20'];
    times.forEach((t, i) => g.fillText(t, 60 + (i % 2) * 104, 76 + Math.floor(i / 2) * 36));
    g.fillStyle = '#d0202f';
    g.fillRect(14, 62, 92, 4);
  });
}

/** 단톡방 공지 캡처 화면 (노란 공지 띠, 말풍선, 네 귀퉁이 캡처 표시) */
function captureTex(): THREE.CanvasTexture {
  return canvasTex(128, 224, (g) => {
    g.fillStyle = '#bcd7f0';
    g.fillRect(0, 0, 128, 224);
    g.fillStyle = '#f5c542';
    g.fillRect(0, 10, 128, 44);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#111318';
    g.font = `bold 28px ${FONT}`;
    g.fillText('공지', 64, 33);
    g.fillStyle = '#ffffff';
    g.fillRect(10, 76, 84, 30);
    g.fillRect(10, 156, 70, 30);
    g.fillStyle = '#fff3c4';
    g.fillRect(40, 116, 78, 30);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    const corners: [number, number, number, number][] = [
      [6, 64, 1, 1],
      [122, 64, -1, 1],
      [6, 216, 1, -1],
      [122, 216, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      g.beginPath();
      g.moveTo(x + dx * 18, y);
      g.lineTo(x, y);
      g.lineTo(x, y + dy * 18);
      g.stroke();
    }
  });
}

/** 식권 앞뒤 그림 (크림색 종이, 빨간 띠, 절취선) */
function mealTicketTex(): THREE.CanvasTexture {
  return canvasTex(256, 148, (g) => {
    g.fillStyle = '#fff6dc';
    g.fillRect(0, 0, 256, 148);
    g.fillStyle = '#d0202f';
    g.fillRect(0, 0, 256, 26);
    g.fillRect(0, 122, 256, 26);
    g.strokeStyle = '#b8a77e';
    g.lineWidth = 4;
    g.setLineDash([10, 8]);
    g.beginPath();
    g.moveTo(196, 30);
    g.lineTo(196, 118);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#7a1320';
    g.font = `bold 66px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('식권', 100, 76);
    g.fillStyle = '#f5c542';
    g.beginPath();
    g.arc(226, 74, 16, 0, Math.PI * 2);
    g.fill();
  });
}

const lam = (color: number) => new THREE.MeshLambertMaterial({ color });

export class Models {
  // 도장
  readonly stampGeoH = new THREE.BoxGeometry(0.1, 0.24, 0.1);
  readonly stampGeoS = new THREE.BoxGeometry(0.3, 0.1, 0.3);
  readonly woodMat = lam(0x8b5a2b);
  readonly redMat = lam(0xc8202f);
  // 메일
  private mailGeo = new THREE.BoxGeometry(0.9, 0.62, 0.1);
  private wingGeo = new THREE.BoxGeometry(0.34, 0.03, 0.26);
  private paperSide = lam(0xe8dfc9);
  private mailFace = new THREE.MeshLambertMaterial({ map: mailTex() });
  private bulkFace = new THREE.MeshLambertMaterial({ map: bulkTex() });
  private wingMat = lam(0xffffff);
  // 전화기
  private phoneBody = new THREE.BoxGeometry(1.0, 0.46, 0.7);
  private phoneFace = new THREE.MeshLambertMaterial({ map: phoneFaceTex() });
  private phoneCream = lam(0xe9e4d4);
  private handGeo = new THREE.BoxGeometry(1.1, 0.16, 0.26);
  private capGeo = new THREE.BoxGeometry(0.26, 0.2, 0.36);
  private handMat = lam(0xb3262d);
  private legGeo = new THREE.BoxGeometry(0.12, 0.2, 0.12);
  private legMat = lam(0x3a3a44);
  readonly warnGeo = new THREE.PlaneGeometry(2.6, 2.6);
  readonly warnMat = new THREE.MeshBasicMaterial({ map: warnTex(), transparent: true, depthWrite: false });
  // 말풍선
  private bubbleGeo = new THREE.PlaneGeometry(2.7, 1.35);
  private bubbleTex = bubbleTex();
  // 서류 뭉치
  private bombGeo = new THREE.BoxGeometry(1.0, 0.75, 0.8);
  private bombFront = new THREE.MeshLambertMaterial({ map: bombFaceTex() });
  private bombSide = new THREE.MeshLambertMaterial({ map: bombSideTex() });
  private bombTop = lam(0xf6f0dc);
  private timerGeo = new THREE.BoxGeometry(0.62, 0.3, 0.1);
  private clipGeo = new THREE.BoxGeometry(0.34, 0.12, 0.5);
  private clipMat = lam(0x1d1d22);
  private timerRed = lam(0xd0202f);
  // 보스 탄막 종이
  readonly sheetGeo = new THREE.PlaneGeometry(0.62, 0.78);
  readonly sheetMat = new THREE.MeshLambertMaterial({ map: paperTex(), side: THREE.DoubleSide });
  // 보스가 날리는 서류 (김총괄의 대관 신청서, 부총장의 회의 자료)와 수강신청 패킷
  // 얇은 상자 앞뒤에 같은 그림: 뒤에서 봐도 글씨가 뒤집히지 않는다
  readonly docGeo = new THREE.BoxGeometry(1.0, 1.38, 0.02);
  private docEdge = lam(0xf1ece0);
  private rentalMat = new THREE.MeshLambertMaterial({ map: docTex('대관 신청서', '#1f7a55') });
  private meetingMat = new THREE.MeshLambertMaterial({ map: docTex('회의 자료', '#6d28d9') });
  private staffDocs = [this.rentalMat.map, this.meetingMat.map];
  private packetGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
  private packetMat = new THREE.MeshBasicMaterial({ color: 0x5ee0ff });
  // 줍는 물건
  private glow = new THREE.MeshBasicMaterial({ map: glowTex('255,224,102'), transparent: true, depthWrite: false });
  private glowGeo = new THREE.PlaneGeometry(1.6, 1.6);
  private labels = new Map<string, THREE.SpriteMaterial>();

  stamp(): THREE.Group {
    const obj = new THREE.Group();
    const h = new THREE.Mesh(this.stampGeoH, this.woodMat);
    h.position.y = 0.12;
    const s = new THREE.Mesh(this.stampGeoS, this.redMat);
    obj.add(h, s);
    return obj;
  }

  mail(big: boolean): { obj: THREE.Group; wings: THREE.Mesh[] } {
    const obj = new THREE.Group();
    const face = big ? this.bulkFace : this.mailFace;
    const s = this.paperSide;
    const body = new THREE.Mesh(this.mailGeo, [s, s, s, s, face, face]);
    body.castShadow = true;
    obj.add(body);
    const wings: THREE.Mesh[] = [];
    for (const k of [-1, 1]) {
      const w = new THREE.Mesh(this.wingGeo, this.wingMat);
      w.position.set(k * 0.55, 0.05, 0);
      obj.add(w);
      wings.push(w);
    }
    return { obj, wings };
  }

  /** 다리 달린 유선 전화기. 앞(+z)에 번호 단추와 화난 눈 */
  phone(): { obj: THREE.Group; handset: THREE.Group } {
    const obj = new THREE.Group();
    const c = this.phoneCream;
    const body = new THREE.Mesh(this.phoneBody, [c, c, c, c, this.phoneFace, c]);
    body.position.y = 0.43;
    body.castShadow = true;
    obj.add(body);
    const handset = new THREE.Group();
    handset.position.set(0, 0.74, 0);
    const bar = new THREE.Mesh(this.handGeo, this.handMat);
    handset.add(bar);
    for (const k of [-1, 1]) {
      const cap = new THREE.Mesh(this.capGeo, this.handMat);
      cap.position.set(k * 0.5, -0.05, 0);
      handset.add(cap);
    }
    obj.add(handset);
    for (const k of [-1, 1]) {
      const leg = new THREE.Mesh(this.legGeo, this.legMat);
      leg.position.set(k * 0.3, 0.1, 0);
      obj.add(leg);
    }
    return { obj, handset };
  }

  /** 말풍선: 앞뒤 두 장. 부르르 떨 때 붉게 물들도록 재질은 하나씩 */
  bubble(): { obj: THREE.Group; mat: THREE.MeshBasicMaterial } {
    const obj = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: this.bubbleTex, transparent: true, alphaTest: 0.1 });
    const front = new THREE.Mesh(this.bubbleGeo, mat);
    const back = new THREE.Mesh(this.bubbleGeo, mat);
    back.rotation.y = Math.PI;
    obj.add(front, back);
    return { obj, mat };
  }

  /** 서류 뭉치 + 위에 붙은 마감 시계 (시계 그림은 하나씩) */
  bomb(): { obj: THREE.Group; timer: THREE.Mesh; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
    const obj = new THREE.Group();
    const sd = this.bombSide;
    const body = new THREE.Mesh(this.bombGeo, [sd, sd, this.bombTop, sd, this.bombFront, sd]);
    body.castShadow = true;
    obj.add(body);
    const clip = new THREE.Mesh(this.clipGeo, this.clipMat);
    clip.position.set(-0.25, 0.42, 0);
    obj.add(clip);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    drawTimer(canvas, 9, false);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tm = new THREE.MeshBasicMaterial({ map: tex });
    const red = this.timerRed;
    const timer = new THREE.Mesh(this.timerGeo, [red, red, red, red, tm, red]);
    timer.position.set(0.12, 0.56, 0.2);
    obj.add(timer);
    return { obj, timer, canvas, tex };
  }

  /** 날아오는 종이·패킷 하나 */
  sheet(kind: SheetKind = 'paper'): THREE.Mesh {
    if (kind === 'paper') return new THREE.Mesh(this.sheetGeo, this.sheetMat);
    if (kind === 'packet') return new THREE.Mesh(this.packetGeo, this.packetMat);
    const f = kind === 'rental' ? this.rentalMat : this.meetingMat;
    const e = this.docEdge;
    const m = new THREE.Mesh(this.docGeo, [e, e, e, e, f, f]);
    m.castShadow = true;
    return m;
  }

  /**
   * 보스 서류 그림을 바꾼다. 학생 모드에는 교직원 모드 보스가 없으므로 같은 모양을
   * 'rental' = 반려 서류(박반려 처장), 'meeting' = 결재 서류(반사반사 부총장)로 쓴다. 비우면 원래대로.
   */
  setDocSkin(rental?: THREE.Texture, meeting?: THREE.Texture): void {
    this.rentalMat.map = rental ?? this.staffDocs[0];
    this.meetingMat.map = meeting ?? this.staffDocs[1];
  }

  /** 수강신청 서버 랙 (총장 2단계) */
  serverRack(): THREE.Group {
    const g = new THREE.Group();
    const side = lam(0x2b2e36);
    const front = new THREE.MeshLambertMaterial({ map: serverTex() });
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 0.9), [side, side, side, side, front, side]);
    rack.position.y = 1.2;
    rack.castShadow = true;
    g.add(rack);
    return g;
  }

  label(text: string, color = '#ffffff'): THREE.Sprite {
    const key = `${text}|${color}`;
    let mat = this.labels.get(key);
    if (!mat) {
      const tex = labelTex(text, color);
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this.labels.set(key, mat);
    }
    const sp = new THREE.Sprite(mat);
    const aspect = (mat.map?.userData as { aspect?: number } | undefined)?.aspect ?? 3;
    sp.scale.set(0.34 * aspect, 0.34, 1);
    return sp;
  }

  /** 바닥에 놓인 음식. 둥실 뜨는 부분(item)과 바닥 빛(glow)을 따로 준다. student: 학생 모드 모양 (공결 확인서) */
  food(kind: FoodKind, student = false): { obj: THREE.Group; item: THREE.Group } {
    const st = student && kind in STUDENT_FOOD_NAMES;
    const key = st ? `${kind}:student` : kind;
    let proto = this.foodProto.get(key);
    if (!proto) {
      proto = this.buildFood(kind, st);
      this.foodProto.set(key, proto);
    }
    // clone()은 모양과 재질을 그대로 함께 쓴다
    const obj = proto.clone();
    return { obj, item: obj.children[0] as THREE.Group };
  }

  private foodProto = new Map<string, THREE.Group>();

  private buildFood(kind: FoodKind, student: boolean): THREE.Group {
    const obj = new THREE.Group();
    const item = new THREE.Group();
    obj.add(item);
    if (kind === 'donkatsu') {
      add(item, new THREE.BoxGeometry(0.95, 0.06, 0.62), lam(0xffffff), 0, 0, 0);
      add(item, new THREE.BoxGeometry(0.66, 0.14, 0.4), lam(0xb8742e), -0.06, 0.1, 0);
      for (let i = 0; i < 3; i++) add(item, new THREE.BoxGeometry(0.06, 0.02, 0.38), lam(0x5a2a10), -0.26 + i * 0.2, 0.18, 0);
      add(item, new THREE.BoxGeometry(0.22, 0.12, 0.3), lam(0xb9e07a), 0.34, 0.08, 0.05);
    } else if (kind === 'gimbap') {
      const rice = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 3), lam(0xf6f1e1));
      rice.rotation.x = -Math.PI / 2;
      rice.castShadow = true;
      item.add(rice);
      add(item, new THREE.BoxGeometry(0.36, 0.26, 0.26), lam(0x1f2a24), 0, -0.12, 0);
      add(item, new THREE.BoxGeometry(0.12, 0.08, 0.27), lam(0xd0202f), 0, 0.08, 0);
    } else if (kind === 'americano') {
      add(item, new THREE.CylinderGeometry(0.2, 0.15, 0.5, 12), lam(0xf4f4f4), 0, 0, 0);
      add(item, new THREE.CylinderGeometry(0.205, 0.185, 0.18, 12), lam(0x8a5a2b), 0, 0.02, 0);
      add(item, new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), lam(0x2b2b2b), 0, 0.28, 0);
    } else if (kind === 'ticket') {
      // 식권: 세워 든 종이 한 장 (앞뒤 같은 그림)
      const face = new THREE.MeshLambertMaterial({ map: mealTicketTex() });
      const edge = lam(0xefe4c4);
      add(item, new THREE.BoxGeometry(0.72, 0.42, 0.03), [edge, edge, edge, edge, face, face], 0, 0, 0);
    } else if (kind === 'shield' && student) {
      // 공결 확인서: 세워 든 서류 한 장 (앞뒤 같은 그림)
      const face = new THREE.MeshLambertMaterial({ map: absenceOkTex() });
      const edge = lam(0xeef0f3);
      add(item, new THREE.BoxGeometry(0.44, 0.6, 0.03), [edge, edge, edge, edge, face, face], 0, 0, 0);
    } else if (kind === 'shield') {
      // 연차 쿠폰: 세워 든 민트색 쿠폰 한 장 (앞뒤 같은 그림)
      const face = new THREE.MeshLambertMaterial({ map: leaveCouponTex() });
      const edge = lam(0xc4e8d2);
      add(item, new THREE.BoxGeometry(0.72, 0.42, 0.03), [edge, edge, edge, edge, face, face], 0, 0, 0);
    } else if (kind === 'shuttle') {
      // 셔틀버스 시간표: 시간표 판 + 위에 올라탄 노란 버스
      const face = new THREE.MeshLambertMaterial({ map: shuttleTex() });
      const edge = lam(0xdfe6f2);
      add(item, new THREE.BoxGeometry(0.62, 0.48, 0.04), [edge, edge, edge, edge, face, face], 0, -0.06, 0);
      add(item, new THREE.BoxGeometry(0.46, 0.2, 0.18), lam(0xf5c542), 0, 0.3, 0);
      const win = lam(0x1d1d22);
      const pane = new THREE.BoxGeometry(0.09, 0.07, 0.01);
      for (const z of [0.092, -0.092]) for (let i = 0; i < 3; i++) add(item, pane, win, -0.13 + i * 0.13, 0.33, z);
      const wheel = lam(0x2b2b2b);
      for (const x of [-0.14, 0.14]) add(item, new THREE.BoxGeometry(0.08, 0.08, 0.2), wheel, x, 0.2, 0);
    } else if (kind === 'capture') {
      // 단톡방 공지 캡처: 짙은 휴대폰 (앞뒤 모두 캡처 화면)
      const face = new THREE.MeshBasicMaterial({ map: captureTex() });
      add(item, new THREE.BoxGeometry(0.34, 0.6, 0.05), lam(0x2b2f38), 0, 0, 0);
      const screen = new THREE.PlaneGeometry(0.28, 0.49);
      for (const z of [0.027, -0.027]) {
        const m = add(item, screen, face, 0, 0.01, z);
        if (z < 0) m.rotation.y = Math.PI;
      }
    } else {
      // 보조배터리: 짙은 몸통 + 초록 충전 칸 넷(앞뒤) + 위쪽 단자와 흰 선
      add(item, new THREE.BoxGeometry(0.3, 0.48, 0.13), lam(0x2b2f38), 0, 0, 0);
      const led = new THREE.MeshBasicMaterial({ color: 0x5bd16b });
      const bar = new THREE.BoxGeometry(0.17, 0.055, 0.01);
      for (const z of [0.07, -0.07]) for (let i = 0; i < 4; i++) add(item, bar, led, 0, -0.14 + i * 0.085, z);
      add(item, new THREE.BoxGeometry(0.1, 0.035, 0.07), lam(0x9aa3ad), 0, 0.255, 0);
      add(item, new THREE.BoxGeometry(0.04, 0.16, 0.04), lam(0xf4f4f4), 0.06, 0.32, 0);
    }
    const glow = new THREE.Mesh(this.glowGeo, this.glow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    obj.add(glow);
    const label = this.label(foodName(kind, student), '#ffe066');
    label.position.y = 1.25;
    obj.add(label);
    return obj;
  }
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
