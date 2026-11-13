import * as THREE from 'three';
import {
  bombFaceTex,
  bombSideTex,
  bossTex,
  bubbleTex,
  bulkTex,
  drawTimer,
  flyerTex,
  glowMapTex,
  glowTex,
  grilleTex,
  labelTex,
  mailTex,
  paperTex,
  phoneFaceTex,
  soundWaveTex,
  warnTex,
} from './textures';

// 적·물건·도장의 블록 모형. 모양(geometry)과 재질은 종류마다 하나씩 만들어 함께 쓴다.

export type FoodKind = 'donkatsu' | 'gimbap' | 'americano';

export const FOOD_NAMES: Record<FoodKind, string> = {
  donkatsu: '학식 돈가스',
  gimbap: '삼각김밥',
  americano: '아메리카노',
};

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
  // 확성기가 뿌리는 대자보
  readonly flyerGeo = new THREE.PlaneGeometry(1.0, 1.38);
  readonly flyerMat = new THREE.MeshLambertMaterial({ map: flyerTex(), side: THREE.DoubleSide });
  // 음파 고리 (반지름 1, 높이 1, 바닥이 y = 0 인 열린 원통을 키워서 쓴다)
  readonly waveGeo = new THREE.CylinderGeometry(1, 1, 1, 80, 1, true).translate(0, 0.5, 0);
  private waveTex = soundWaveTex();
  // 확성기
  private megaWhite = lam(0xf1ede2);
  private megaRed = lam(0xc8202f);
  private megaDark = lam(0x3a3d46);
  private megaMetal = lam(0x9aa1a8);
  // 그림은 하나만 만들어 둔다 (타이틀 뒤 미리 그리기에서 올려 두면 운동장에서 끊기지 않는다)
  private grille = grilleTex();
  private glowMap = glowMapTex();
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

  /** 단체 회신 메일 폭풍: 큰 봉투 + 날개 + 주위를 도는 종이 */
  boss(): { obj: THREE.Group; body: THREE.Mesh; wings: THREE.Mesh[]; faceMat: THREE.MeshLambertMaterial; storm: THREE.InstancedMesh } {
    const obj = new THREE.Group();
    const faceMat = new THREE.MeshLambertMaterial({ map: bossTex(), emissive: 0x000000 });
    const s = lam(0xe8dfc9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.85, 0.5), [s, s, s, s, faceMat, faceMat]);
    body.castShadow = true;
    obj.add(body);
    const wings: THREE.Mesh[] = [];
    const wg = new THREE.BoxGeometry(2.4, 0.14, 1.6);
    for (const k of [-1, 1]) {
      const w = new THREE.Mesh(wg, this.wingMat);
      w.position.set(k * 3.9, 0.6, 0);
      obj.add(w);
      wings.push(w);
    }
    const storm = new THREE.InstancedMesh(this.sheetGeo, this.sheetMat, 36);
    storm.frustumCulled = false;
    obj.add(storm);
    return { obj, body, wings, faceMat, storm };
  }

  sheet(): THREE.Mesh {
    const m = new THREE.Mesh(this.sheetGeo, this.sheetMat);
    return m;
  }

  flyer(): THREE.Mesh {
    const m = new THREE.Mesh(this.flyerGeo, this.flyerMat);
    m.castShadow = true;
    return m;
  }

  /** 음파 고리 한 개 (투명도는 고리마다 따로) */
  wave(): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
    this.waveTex.repeat.set(40, 1);
    const mat = new THREE.MeshBasicMaterial({ map: this.waveTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.waveGeo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, mat };
  }

  /**
   * 요구안 방송 확성기: 앞(+z)이 나팔. 손잡이 관 + 빨간 뒷마개 + 넓은 나팔 + 빨간 테 + 스피커 망(화난 눈).
   * 기를 모으면 스피커 망 가운데가 빛난다(disc.emissiveIntensity). target은 약점 표시 고리.
   */
  megaphone(): { obj: THREE.Group; head: THREE.Group; disc: THREE.MeshLambertMaterial; target: THREE.Mesh; targetMat: THREE.MeshBasicMaterial } {
    // 모양과 재질은 처음 한 번만 만들고 판마다 함께 쓴다 (확성기는 한 번에 하나뿐)
    const s = (this.megaParts ??= {
      body: new THREE.CylinderGeometry(0.8, 0.9, 2.6, 22).rotateX(Math.PI / 2),
      cap: new THREE.CylinderGeometry(1.0, 1.0, 0.45, 22).rotateX(Math.PI / 2),
      band: new THREE.CylinderGeometry(0.87, 0.87, 0.36, 22).rotateX(Math.PI / 2),
      bell: new THREE.CylinderGeometry(2.5, 0.85, 2.9, 36, 1, true).rotateX(Math.PI / 2),
      rim: new THREE.TorusGeometry(2.5, 0.16, 8, 44),
      discGeo: new THREE.CircleGeometry(2.42, 44),
      grip: new THREE.BoxGeometry(0.55, 1.6, 0.75),
      trigger: new THREE.BoxGeometry(0.2, 0.45, 0.32),
      ring: new THREE.RingGeometry(1.2, 1.45, 44),
      bellMat: new THREE.MeshLambertMaterial({ color: 0xf1ede2, side: THREE.DoubleSide }),
      disc: new THREE.MeshLambertMaterial({ map: this.grille, emissive: 0xffc23a, emissiveMap: this.glowMap, emissiveIntensity: 0 }),
      targetMat: new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    });
    const obj = new THREE.Group();
    const head = new THREE.Group();
    obj.add(head);
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, z: number, y = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, y, z);
      m.castShadow = true;
      head.add(m);
      return m;
    };
    part(s.body, this.megaWhite, -1.5);
    part(s.cap, this.megaRed, -2.95);
    part(s.band, this.megaRed, -0.9);
    part(s.bell, s.bellMat, 1.25);
    part(s.rim, this.megaRed, 2.7);
    part(s.discGeo, s.disc, 2.6);
    // 손잡이와 방아쇠
    part(s.grip, this.megaDark, -1.75, -1.25).rotation.x = 0.28;
    part(s.trigger, this.megaRed, -1.2, -0.95);
    // 약점 표시 고리 (기를 모을 때만)
    const target = new THREE.Mesh(s.ring, s.targetMat);
    target.position.z = 2.75;
    target.visible = false;
    head.add(target);
    s.disc.emissiveIntensity = 0;
    return { obj, head, disc: s.disc, target, targetMat: s.targetMat };
  }

  private megaParts:
    | {
        body: THREE.BufferGeometry;
        cap: THREE.BufferGeometry;
        band: THREE.BufferGeometry;
        bell: THREE.BufferGeometry;
        rim: THREE.BufferGeometry;
        discGeo: THREE.BufferGeometry;
        grip: THREE.BufferGeometry;
        trigger: THREE.BufferGeometry;
        ring: THREE.BufferGeometry;
        bellMat: THREE.MeshLambertMaterial;
        disc: THREE.MeshLambertMaterial;
        targetMat: THREE.MeshBasicMaterial;
      }
    | undefined;

  /** 확성기를 받치는 기둥 (받침, 기둥, 양갈래 걸쇠, 작은 나팔 스피커 둘) */
  mast(): THREE.Group {
    const g = new THREE.Group();
    const add2 = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    add2(new THREE.BoxGeometry(2.2, 0.6, 2.2), lam(0xb7b3ab), 0, 0.3, 0);
    add2(new THREE.CylinderGeometry(0.3, 0.38, 8.0, 14), this.megaMetal, 0, 4.4, 0);
    add2(new THREE.BoxGeometry(2.5, 0.3, 0.4), this.megaMetal, 0, 8.25, 0);
    for (const s of [-1, 1]) add2(new THREE.BoxGeometry(0.28, 1.3, 0.5), this.megaMetal, s * 1.12, 8.9, 0);
    const hornMat = new THREE.MeshLambertMaterial({ color: 0xf1ede2, side: THREE.DoubleSide });
    const hornGeo = new THREE.CylinderGeometry(0.55, 0.16, 0.9, 14, 1, true);
    for (const s of [-1, 1]) add2(hornGeo, hornMat, s * 0.7, 6.0, 0).rotation.z = (-s * Math.PI) / 2;
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

  /** 바닥에 놓인 음식. 둥실 뜨는 부분(item)과 바닥 빛(glow)을 따로 준다 */
  food(kind: FoodKind): { obj: THREE.Group; item: THREE.Group } {
    let proto = this.foodProto.get(kind);
    if (!proto) {
      proto = this.buildFood(kind);
      this.foodProto.set(kind, proto);
    }
    // clone()은 모양과 재질을 그대로 함께 쓴다
    const obj = proto.clone();
    return { obj, item: obj.children[0] as THREE.Group };
  }

  private foodProto = new Map<FoodKind, THREE.Group>();

  private buildFood(kind: FoodKind): THREE.Group {
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
    } else {
      add(item, new THREE.CylinderGeometry(0.2, 0.15, 0.5, 12), lam(0xf4f4f4), 0, 0, 0);
      add(item, new THREE.CylinderGeometry(0.205, 0.185, 0.18, 12), lam(0x8a5a2b), 0, 0.02, 0);
      add(item, new THREE.CylinderGeometry(0.22, 0.22, 0.07, 12), lam(0x2b2b2b), 0, 0.28, 0);
    }
    const glow = new THREE.Mesh(this.glowGeo, this.glow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    obj.add(glow);
    const label = this.label(FOOD_NAMES[kind], '#ffe066');
    label.position.y = 1.25;
    obj.add(label);
    return obj;
  }
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
