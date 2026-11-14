import * as THREE from 'three';
import { canvasTex, FONT } from './textures';

// 사람 보스 머리 위 이름표·말풍선과 화면 위쪽 자막 한 줄 (교직원·학생 모드 공용, 2026-11-13).
// - 이름표와 말풍선은 거리와 상관없이 화면에서 늘 같은 크기로 보인다 (sizeAttenuation 끔).
//   머리 위 기준점에 이름표 아래끝을 붙이고 말풍선은 이름표 바로 위에 붙여서, 멀어져도 서로 겹치지 않는다.
//   화면이 낮으면(휴대폰 가로, 높이 500px 이하) 말하는 동안 이름표 자리에 말풍선만 띄운다 (위쪽 HUD와 덜 겹치게).
// - 말할 때마다 보스 막대 아래에 자막 "이름: 대사"도 띄운다 (fps.html의 #subtitle).
//   보스가 멀거나 화면 밖에 있어도 대사를 읽을 수 있다.
//
// 쓰는 법
//   const tag = new HeadTag('김총괄 (교직원)', '#a7f3c0', 1.55); // 이름, 이름 색, 부모(사람 모형) 배율
//   tag.group.position.y = 2.62;  // 머리 위 (부모 좌표). 들어 올린 결재판 꼭대기 높이
//   person.add(tag.group);
//   tag.say('제가 왜 협조하죠?', 2.2);  // 말풍선 + 자막 (자막을 끄려면 세 번째 인자 false)
//   tag.update(dt);  // 매 프레임 (말풍선 시간·크기)
//   Game 쪽: resize 때 speechView(innerHeight, camera.fov), 매 프레임 updateSubtitle(dt),
//   타이틀·일시정지 화면을 띄울 때 clearSubtitle(). 대사 그림은 prepareSpeech(대사들)로 미리 만든다.
// 블록 사람(people.ts의 Person)은 이미 HeadTag를 쓰므로 person.say(대사, 초)만 부르면 된다.

/** 지금 화면 높이 (CSS px) */
let viewH = 720;
/** 2·tan(시야각/2) */
let tan2 = 2 * Math.tan((70 * Math.PI) / 360);
/** 말풍선 높이 (CSS px, 꼬리 포함). 글자는 이 높이의 약 0.54 */
let bubblePx = 50;
/** 이름표 높이 (CSS px). 글자는 이 높이의 약 0.6 */
let tagPx = 28;
/** 이름표와 말풍선 사이 (CSS px) */
const GAP_PX = 4;
/** 말풍선을 이름표 위에 쌓는다 (false면 말하는 동안 이름표를 숨기고 그 자리에) */
let stack = true;

/**
 * 화면 크기가 바뀌면 부른다. 말풍선은 화면 높이의 7% (34~64px):
 * 1280×720 → 50px (글자 약 27px), 844×390 → 34px (글자 약 18px).
 */
export function speechView(heightPx: number, fovDeg: number): void {
  viewH = Math.max(1, heightPx);
  tan2 = 2 * Math.tan((fovDeg * Math.PI) / 360);
  bubblePx = Math.round(Math.max(34, Math.min(64, viewH * 0.07)));
  tagPx = Math.round(Math.max(24, bubblePx * 0.56));
  stack = viewH > 500;
}

// ---------- 그림 ----------

const BUBBLE_FONT = 84;
const BUBBLE_BODY = 132;
const BUBBLE_TAIL = 26;
const TAG_FONT = 58;
const TAG_H = 96;

let probe: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  probe ??= document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  probe.font = font;
  return Math.ceil(probe.measureText(text).width);
}

/** 말풍선 몸통 + 아래 꼬리를 한 길로 */
function bubblePath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, tw: number, th: number): void {
  const cx = x + w / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(cx + tw, y + h);
  g.lineTo(cx, y + h + th);
  g.lineTo(cx - tw, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** 흰 바탕·굵은 검은 테두리·검은 굵은 글씨 (하늘·건물 어디서나 잘 보이게) */
function bubbleTex(text: string): THREE.CanvasTexture {
  const font = `bold ${BUBBLE_FONT}px ${FONT}`;
  const w = Math.max(BUBBLE_BODY + 40, measure(text, font) + 76);
  const h = BUBBLE_BODY + BUBBLE_TAIL;
  const t = canvasTex(w, h, (g) => {
    const b = 6;
    g.lineJoin = 'round';
    bubblePath(g, b, b, w - b * 2, BUBBLE_BODY - b * 2, 34, 20, BUBBLE_TAIL - 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#111318';
    g.stroke();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#111318';
    g.fillText(text, w / 2, BUBBLE_BODY / 2 + 4);
  });
  t.userData = { aspect: w / h };
  return t;
}

/** 이름표: 짙은 바탕에 색 글씨, 같은 색 테두리 */
function tagTex(text: string, color: string): THREE.CanvasTexture {
  const font = `bold ${TAG_FONT}px ${FONT}`;
  const w = measure(text, font) + 52;
  const t = canvasTex(w, TAG_H, (g) => {
    bubblePath(g, 4, 4, w - 8, TAG_H - 8, 22, 0, 0);
    g.fillStyle = 'rgba(10,12,18,0.86)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = color;
    g.globalAlpha = 0.85;
    g.stroke();
    g.globalAlpha = 1;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, w / 2, TAG_H / 2 + 3);
  });
  t.userData = { aspect: w / TAG_H };
  return t;
}

const bubbles = new Map<string, THREE.SpriteMaterial>();
const textures: THREE.Texture[] = [];

/** 대사 하나의 말풍선 재질 (대사마다 한 번만 그린다) */
function bubbleMat(text: string): THREE.SpriteMaterial {
  let m = bubbles.get(text);
  if (!m) {
    const tex = bubbleTex(text);
    m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    bubbles.set(text, m);
    textures.push(tex);
  }
  return m;
}

/** 대사 그림을 미리 만든다 (처음 말할 때 끊기지 않게) */
export function prepareSpeech(lines: readonly string[]): void {
  for (const l of lines) bubbleMat(l);
}

/** 미리 올려 둘 그림 (renderer.initTexture) */
export function speechTextures(): readonly THREE.Texture[] {
  return textures;
}

const aspectOf = (m: THREE.SpriteMaterial) => (m.map?.userData as { aspect?: number } | undefined)?.aspect ?? 3;

// ---------- 머리 위 이름표 + 말풍선 ----------

export class HeadTag {
  /** 머리 위 기준점. 사람 모형에 붙이고 y를 머리 위로 */
  readonly group = new THREE.Group();
  readonly label: THREE.Sprite | null = null;
  readonly bubble: THREE.Sprite;
  readonly name: string;
  readonly color: string;
  private parentScale: number;
  private t = 0;

  /**
   * @param name 이름표 글자이자 자막 이름 ('' 이면 이름표 없음)
   * @param color 이름표 글자색 (자막 이름에도 쓴다)
   * @param parentScale group을 붙일 부모의 월드 배율 (블록 사람은 look.scale)
   */
  constructor(name: string, color = '#ffffff', parentScale = 1) {
    this.name = name;
    this.color = color;
    this.parentScale = parentScale;
    if (name) {
      const tex = tagTex(name, color);
      textures.push(tex);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
      label.center.set(0.5, 0);
      label.renderOrder = 8;
      label.frustumCulled = false;
      this.group.add(label);
      this.label = label;
    }
    this.bubble = new THREE.Sprite(bubbleMat(' '));
    this.bubble.renderOrder = 12;
    this.bubble.frustumCulled = false;
    this.bubble.visible = false;
    this.group.add(this.bubble);
    this.fit();
  }

  /** 말풍선 띄우기 (+ 화면 위쪽 자막) */
  say(text: string, sec: number, subtitle = true): void {
    this.bubble.material = bubbleMat(text);
    this.bubble.visible = true;
    this.t = sec;
    this.fit();
    if (subtitle) showSubtitle(this.name, text, sec, this.color, this);
  }

  /** 말풍선을 내린다 (이 사람의 자막도) */
  hide(): void {
    this.bubble.visible = false;
    this.t = 0;
    clearSubtitle(this);
  }

  update(dt: number): void {
    if (this.t > 0) {
      this.t -= dt;
      if (this.t <= 0) this.bubble.visible = false;
    }
    this.fit();
  }

  /** 화면 px 크기를 월드 배율로 (sizeAttenuation을 끈 스프라이트는 배율 = 화면 높이 비율 × 2tan(fov/2)) */
  private fit(): void {
    const k = tan2 / viewH / this.parentScale;
    if (this.label) {
      const a = aspectOf(this.label.material);
      this.label.scale.set(tagPx * k * a, tagPx * k, 1);
    }
    const talking = this.bubble.visible;
    if (this.label) this.label.visible = stack || !talking;
    if (talking) {
      const a = aspectOf(this.bubble.material);
      this.bubble.scale.set(bubblePx * k * a, bubblePx * k, 1);
      this.bubble.center.set(0.5, this.label && stack ? -(tagPx + GAP_PX) / bubblePx : 0);
    }
  }
}

// ---------- 화면 위쪽 자막 ----------

let subEl: HTMLElement | null = null;
let subT = 0;
let subOwner: unknown = null;

/** 보스 막대 아래 자막 한 줄 "이름: 대사". 적어도 2초는 둔다 */
export function showSubtitle(name: string, text: string, sec: number, color = '#ffe066', owner: unknown = null): void {
  subEl ??= document.getElementById('subtitle');
  const el = subEl;
  if (!el) return;
  el.replaceChildren();
  if (name) {
    const b = document.createElement('b');
    b.textContent = `${name}:`;
    b.style.color = color;
    el.append(b, ' ');
  }
  el.append(text);
  el.classList.add('on');
  subT = Math.max(2, sec + 0.4);
  subOwner = owner;
}

/** 자막을 내린다. owner를 주면 그 사람이 띄운 자막일 때만 */
export function clearSubtitle(owner?: unknown): void {
  if (owner !== undefined && owner !== subOwner) return;
  subT = 0;
  subOwner = null;
  subEl?.classList.remove('on');
}

/** 매 프레임 (게임 시간) */
export function updateSubtitle(dt: number): void {
  if (subT <= 0) return;
  subT -= dt;
  if (subT <= 0) clearSubtitle();
}
