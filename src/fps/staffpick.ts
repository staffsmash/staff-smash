import * as THREE from 'three';
import { HEROES, heroById, type HeroDef, type StaffLook } from '../data/heroes';
import { SKILLS, skillById, type SkillDef } from '../data/skills';
import { drawPortraitHead } from './looktex';
import { bestLine, DIFF_KEYS, DIFFS, type DiffKey } from './settings';

// 1인칭 교직원 모드 고르기 (2026-11-17): 주인공 6명(heroes.ts 순서) · 필살기 4종(skills.ts) · 난이도.
// 학생 모드 선택 화면(student/mode.ts showSelect)과 같은 모양으로 그리고, 고른 것은 이 브라우저(localStorage)에만 기억한다.
// 고른 주인공은 화면 오른쪽 아래 팔(소매 색·소맷부리, 김학생식당은 앞치마 토시)과 HUD 이름에 입힌다 (dress).
// 시작 화면(main.ts showTitle)의 모양(CSS)도 여기서 넣는다.

const PICK_KEY = 'staffsmash.fps.staffPick';

/** 교직원 선택 화면이 빌려 쓰는 Game 안쪽 기능 */
export interface PickHost {
  readonly touch: boolean;
  /** 타이틀·선택 화면 중 (Game.phase === 'title') */
  readonly title: boolean;
  /** 고른 난이도 (설정) */
  readonly diff: DiffKey;
  /** 화면 오른쪽 아래 팔의 소매 */
  readonly sleeve: THREE.Mesh;
  overlay(html: string): HTMLElement;
  showTitle(): void;
  /** 학생 모드 선택 화면 */
  showStudent(): void;
  showSettings(): void;
  /** 난이도 단추를 묶는다 (바꾸면 Game이 최고 기록 줄도 고친다) */
  bindDiff(root: HTMLElement): void;
  /** 교직원 모드로 시작 */
  begin(): void;
}

const CSS = `
.panel.title { max-width: 520px; }
.panel.title h1 { margin: 10px 0 4px; font-size: 42px; letter-spacing: 3px; }
.panel.title .modes { display: flex; flex-direction: column; align-items: stretch; gap: 12px; max-width: 320px; margin: 20px auto 0; }
.panel.title .modes button { margin: 0; min-width: 0; padding: 18px 20px; font-size: 24px; border-radius: 8px; }
.panel.title .tlinks { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; margin: 18px 0 0; }
.panel.title .tlinks button, .panel.title .tlinks a { position: relative; margin: 0 6px; padding: 6px 10px; border: 0; border-radius: 4px; background: none;
  color: #dfe6f2; font: 700 14px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; text-decoration: none; cursor: pointer; }
.panel.title .tlinks button:hover, .panel.title .tlinks a:hover { background: rgba(255,255,255,.12); }
.panel.title .tlinks > * + *::before { content: '·'; position: absolute; left: -9px; color: #8b95a8; pointer-events: none; }
.panel.title .foot { margin: 6px 0 0; color: #8b95a8; font-size: 12px; }
.panel.sel .tabs button.on.staff { background: #2f8f4e; }
.panel.sel .heroes.six { grid-template-columns: repeat(3, 1fr); }
.panel.sel .skills button b { display: block; margin-bottom: 1px; font-size: 14px; color: #fff; }
@media (max-height: 500px) {
  /* 휴대폰 가로: 교직원 여섯 명을 한 줄로, 키 안내 줄은 뺀다 (출근하기 단추가 화면 안에) */
  .panel.title h1 { font-size: 28px; margin: 4px 0 0; }
  .panel.title .modes { flex-direction: row; justify-content: center; max-width: none; margin-top: 10px; }
  .panel.title .modes button { min-width: 170px; padding: 12px 18px; font-size: 20px; }
  .panel.title .tlinks { margin-top: 8px; }
  .panel.sel .heroes.six { grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .panel.sel .heroes.six button { gap: 4px; padding: 3px 4px; font-size: 10px; }
  .panel.sel .heroes.six button img { width: 26px; height: 30px; }
  .panel.sel .heroes.six button b { font-size: 12px; }
  .panel.sel .skills button b { font-size: 12px; }
  .panel.sel .ctl { display: none; }
}
@media (max-width: 560px) {
  .panel.title, .panel.sel { padding-left: 12px; padding-right: 12px; }
  .panel.title h1 { font-size: 34px; letter-spacing: 2px; }
  .panel.sel .heroes, .panel.sel .heroes.six, .panel.sel .spells { grid-template-columns: repeat(2, 1fr); }
  .panel.sel .heroes button { font-size: 11px; }
  .panel.sel .tabs button { padding: 6px 10px; }
  .panel.sel .ctl { display: none; }
}
`;

let injected = false;

function ensureCss(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** 색을 조금 어둡게 (소맷부리·옷깃) */
function darken(c: number, k = 0.82): number {
  return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
}

/** 선택 화면 초상 (학생 모드 heroPortrait와 같은 크기·그림체): 셔츠·넥타이(앞치마)·사원증 줄·머리·안경.
 *  11차: 여성은 블라우스 깃·리본, 머리 모양·안경 모양·머리띠 글자·규정집 (looktex.ts drawPortraitHead) */
export function staffPortrait(look: StaffLook): string {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 112;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const ink = '#1d1d22';
  // 몸통 (셔츠)
  g.fillStyle = hex(look.shirt);
  g.fillRect(16, 70, 64, 42);
  // 옷깃 (여성 블라우스는 흰 둥근 깃)
  g.fillStyle = look.female ? '#ffffff' : hex(darken(look.shirt));
  g.fillRect(34, 70, 10, 6);
  g.fillRect(52, 70, 10, 6);
  if (look.apron) {
    // 앞치마 (위끝에 넥타이 색 띠)
    g.fillStyle = '#fff3d6';
    g.fillRect(28, 80, 40, 32);
    g.fillStyle = hex(look.tie);
    g.fillRect(28, 80, 40, 5);
    g.fillRect(31, 70, 4, 10);
    g.fillRect(61, 70, 4, 10);
  } else {
    g.fillStyle = hex(look.tie);
    if (look.female) {
      // 리본: 양쪽 고리 + 매듭 + 늘어진 끈 (긴 머리 끝(y 80)보다 아래)
      g.fillRect(35, 81, 11, 8);
      g.fillRect(50, 81, 11, 8);
      g.fillRect(42, 87, 3, 10);
      g.fillRect(51, 87, 3, 10);
      g.fillStyle = hex(darken(look.tie, 0.7));
      g.fillRect(45, 82, 6, 6);
    } else {
      // 넥타이
      g.fillRect(44, 72, 8, 6);
      g.fillRect(45, 78, 6, 28);
    }
    // 사원증 줄과 카드
    g.fillStyle = '#2f6fd1';
    g.fillRect(60, 70, 3, 20);
    g.fillStyle = '#ffffff';
    g.fillRect(56, 90, 12, 14);
    g.fillStyle = '#2f6fd1';
    g.fillRect(56, 90, 12, 4);
  }
  // 규정집 (아래 왼쪽, 초록 표지·금색 띠)
  if (look.prop === 'rulebook') {
    g.fillStyle = '#1f5e45';
    g.fillRect(6, 82, 26, 30);
    g.fillStyle = '#d9b44a';
    g.fillRect(6, 90, 26, 4);
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.strokeRect(6, 82, 26, 30);
  }
  // 머리
  drawPortraitHead(g, {
    hair: hex(look.hair),
    style: look.crew ? 'crew' : look.bob ? 'bob' : look.ponytail ? 'ponytail' : look.longHair ? 'long' : 'short',
    female: look.female,
    glasses: look.glasses,
    glassesStyle: look.glassesStyle,
    headband: look.headband,
  });
  return c.toDataURL();
}

export class StaffPick {
  private heroDef: HeroDef = HEROES[0];
  private skillDef: SkillDef = SKILLS[0];
  private portraits = new Map<string, string>();
  /** 소매에 덧대는 것: 소맷부리(모두) · 토시(김학생식당) */
  private extras: THREE.Group | null = null;
  private cuffMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private cover: THREE.Group | null = null;

  constructor(private readonly h: PickHost) {
    ensureCss();
    try {
      const p = JSON.parse(localStorage.getItem(PICK_KEY) ?? '{}') as { hero?: string; skill?: string };
      if (p.hero) this.heroDef = heroById(p.hero);
      if (p.skill) this.skillDef = skillById(p.skill);
    } catch {
      /* 처음 고르는 값 (김국제 · 전체 공지 발송 — 2D와 같다) */
    }
  }

  /** 고른 주인공 */
  get hero(): HeroDef {
    return this.heroDef;
  }

  /** 고른 필살기 */
  get skill(): SkillDef {
    return this.skillDef;
  }

  private portrait(h: HeroDef): string {
    let s = this.portraits.get(h.id);
    if (!s) {
      s = staffPortrait(h.look);
      this.portraits.set(h.id, s);
    }
    return s;
  }

  // ---------- 선택 화면 ----------

  show(): void {
    const t = this.h.touch;
    const d = this.h.diff;
    const heroes = HEROES.map((h) => {
      const on = h.id === this.heroDef.id;
      return `<button type="button" data-hero="${h.id}" class="${on ? 'on' : ''}" aria-pressed="${on}"><img src="${this.portrait(h)}" alt=""><span><b>${esc(h.name)}</b>${esc(h.line)}</span></button>`;
    }).join('');
    const skills = SKILLS.map((s) => {
      const on = s.id === this.skillDef.id;
      return `<button type="button" data-skill="${s.id}" class="${on ? 'on' : ''}" aria-pressed="${on}"><b>${esc(s.name)}</b>${esc(s.desc)}</button>`;
    }).join('');
    const seg = DIFF_KEYS.map((k) => `<button type="button" data-diff="${k}" class="${d === k ? 'on' : ''}" aria-pressed="${d === k}">${DIFFS[k].label}</button>`).join('');
    const o = this.h.overlay(`
      <div class="panel sel" id="staffSel">
        <div class="tabs" role="tablist"><button type="button" class="on staff">${t ? '교직원 모드' : '교직원 모드 (1)'}</button><button type="button" id="staffTabStu">${t ? '학생 모드' : '학생 모드 (2)'}</button></div>
        <h1>출근 준비</h1>
        <p class="lbl">1. 주인공 (능력은 같고 외형·대사만 달라요)</p>
        <div class="heroes six">${heroes}</div>
        <p class="lbl">2. 필살기 · 업무 스킬</p>
        <div class="spells skills">${skills}</div>
        <div class="srow center"><span class="slabel">난이도</span><div class="seg" role="group" aria-label="난이도">${seg}</div></div>
        <p class="best">최고 기록 ${bestLine(d)}</p>
        <button id="staffGo" type="button">${t ? '출근하기' : '출근하기 (Enter)'}</button>
        <button id="staffSet" class="ghost" type="button">설정</button>
        ${t ? '' : '<p class="ctl">방향키로 고르고 Enter · Esc 뒤로 · 1·2 모드 바꾸기 · 마우스·터치로 눌러도 됩니다</p>'}
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((b) => b.addEventListener('click', () => this.pick(heroById(b.dataset.hero ?? ''), this.skillDef)));
    o.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((b) => b.addEventListener('click', () => this.pick(this.heroDef, skillById(b.dataset.skill ?? ''))));
    this.h.bindDiff(o);
    o.querySelector('#staffGo')?.addEventListener('click', () => this.h.begin());
    o.querySelector('#staffSet')?.addEventListener('click', () => this.h.showSettings());
    o.querySelector('#staffTabStu')?.addEventListener('click', () => this.h.showStudent());
  }

  private pick(hero: HeroDef, skill: SkillDef): void {
    this.heroDef = hero;
    this.skillDef = skill;
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify({ hero: hero.id, skill: skill.id }));
    } catch {
      /* 이번 판에는 적용된다 */
    }
    this.show();
  }

  /** 교직원 선택 화면의 키. 처리했으면 true (타이틀·학생 선택 화면 키는 student/mode.ts key) */
  key(e: KeyboardEvent): boolean {
    if (!this.h.title || e.repeat || !document.getElementById('staffSel')) return false;
    const hi = HEROES.indexOf(this.heroDef);
    const si = SKILLS.indexOf(this.skillDef);
    const nh = HEROES.length;
    const ns = SKILLS.length;
    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        // 눌려 있던 단추가 Enter로 다시 눌리지 않게
        e.preventDefault();
        this.h.begin();
        return true;
      case 'Escape':
        this.h.showTitle();
        return true;
      case 'Digit2':
      case 'Numpad2':
        this.h.showStudent();
        return true;
      case 'ArrowLeft':
      case 'ArrowRight':
        this.pick(HEROES[(hi + (e.code === 'ArrowLeft' ? nh - 1 : 1)) % nh], this.skillDef);
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
        this.pick(this.heroDef, SKILLS[(si + (e.code === 'ArrowUp' ? ns - 1 : 1)) % ns]);
        return true;
      default:
        return false;
    }
  }

  // ---------- 고른 주인공 모양 ----------

  /**
   * 판을 시작할 때 (Game.start). 교직원: 소매 색·소맷부리(김학생식당은 앞치마 토시)·HUD 이름.
   * 학생: 덧댄 것만 감춘다 (소매 색과 이름은 학생 모드가 입힌다)
   */
  dress(staff: boolean): void {
    const sleeve = this.h.sleeve;
    if (!this.extras) this.extras = this.buildExtras(sleeve);
    this.extras.visible = staff;
    if (!staff) return;
    const L = this.heroDef.look;
    (sleeve.material as THREE.MeshLambertMaterial).color.setHex(L.shirt);
    this.cuffMat.color.setHex(darken(L.shirt, 0.86));
    if (this.cover) this.cover.visible = !!L.apron;
    const name = document.querySelector('#topleft .name');
    if (name) name.textContent = `${this.heroDef.name} · 교직원 모드`;
  }

  /** 소매(0.16 × 0.16 × 0.6, 손 쪽 끝 = z -0.3)에 붙는 것 */
  private buildExtras(sleeve: THREE.Mesh): THREE.Group {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const g = new THREE.Group();
    // 소맷부리: 셔츠보다 조금 진한 띠와 단추
    const cuff = new THREE.Mesh(box, this.cuffMat);
    cuff.scale.set(0.172, 0.172, 0.07);
    cuff.position.set(0, 0, -0.262);
    const btn = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }));
    btn.scale.set(0.03, 0.03, 0.02);
    btn.position.set(-0.088, 0.03, -0.262);
    g.add(cuff, btn);
    // 김학생식당: 앞치마 천 토시 (양 끝에 앞치마 띠 색 고무줄)
    const cover = new THREE.Group();
    const cloth = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xfff3d6 }));
    cloth.scale.set(0.19, 0.19, 0.34);
    cloth.position.set(0, 0, -0.13);
    const tie = heroById('kimsikdang').look.tie;
    const bandMat = new THREE.MeshLambertMaterial({ color: tie });
    for (const z of [-0.29, 0.03]) {
      const band = new THREE.Mesh(box, bandMat);
      band.scale.set(0.198, 0.198, 0.035);
      band.position.set(0, 0, z);
      cover.add(band);
    }
    cover.add(cloth);
    cover.visible = false;
    this.cover = cover;
    g.add(cover);
    sleeve.add(g);
    return g;
  }
}
