import { markTutorialSeen } from '../uiPrefs';

// 1인칭 첫 판 안내 (PRD 결정 60 · 4절): 이 기기에서 처음 하는 판(교직원·학생 구분 없이 한 번, uiPrefs tutorialSeen('fps')),
// 1구역 시작 직후 잡몹이 나오기 전에 화면 위 띠로 다섯 단계를 직접 해 본다.
// ① 이동 ② 둘러보기 ③ 도장(학생: 서류) ④ 점프 ⑤ 필살기(이 단계에서 게이지를 채워 준다).
// 해 보면 ✓를 잠깐 보여 주고 다음 단계. 연습하는 동안 게임 속 시계는 멈추고 적이 오지 않는다 (main.ts가 tut.on을 본다).
// 오른쪽 위 "건너뛰기"(PC는 Enter도). 끝까지 했거나 건너뛰면 markTutorialSeen('fps'). 설정의 "안내 다시 보기"가 resetTutorials().
// PC와 터치 화면은 키 이름을 다르게 보여 준다. 띠 모양(CSS)은 여기서 넣는다 (fps.html은 건드리지 않는다).

export interface TutHost {
  readonly touch: boolean;
  /** 학생 모드 (도장 대신 서류) */
  readonly student: boolean;
  readonly pos: { x: number; z: number };
  readonly yaw: number;
  readonly pitch: number;
  /** 던진 수 · 점프 수 · 필살기 쓴 수 (늘어나면 그 단계를 해 본 것) */
  readonly thrown: number;
  readonly jumps: number;
  readonly specials: number;
  /** 필살기 단계: 게이지를 가득 채운다 */
  fillSp(): void;
  /** 연습이 끝났거나 건너뛰었다: 판을 시작한다 */
  done(): void;
  sound(name: 'pickup' | 'clear' | 'tick'): void;
}

interface StepDef {
  title(student: boolean): string;
  pc(student: boolean): string;
  touch(student: boolean): string;
  sub?: string;
}

/** 다섯 단계 문구 (새 문구 — 보고서에 그대로 옮긴다) */
export const TUT_STEPS: StepDef[] = [
  { title: () => '이동해 보세요', pc: () => 'W A S D', touch: () => '왼쪽 스틱' },
  { title: () => '둘러보세요', pc: () => '마우스', touch: () => '오른쪽 화면 드래그' },
  { title: (s) => (s ? '서류를 던져 보세요' : '도장을 던져 보세요'), pc: () => '클릭', touch: (s) => (s ? '서류 단추' : '도장 단추') },
  { title: () => '점프해 보세요', pc: () => 'Space', touch: () => '점프 단추' },
  { title: () => '필살기를 써 보세요', pc: () => 'Q', touch: () => '필살기 단추', sub: '게이지를 채워 뒀어요' },
];

export const TUT_TEXT = {
  head: (i: number, n: number) => `첫 판 연습 ${i} / ${n}`,
  ok: '✓ 좋아요!',
  end: '연습 끝! 이제 시작합니다',
  skip: '건너뛰기',
  skipPc: '건너뛰기 · Enter',
};

/** 이동 거리(m) · 둘러본 각도(라디안)가 이만큼이면 해 본 것 */
const MOVE_NEED = 3;
const LOOK_NEED = 0.9;
/** ✓를 보여 주는 시간, 마지막 "연습 끝!"을 보여 주는 시간 (초) */
const OK_T = 0.8;
const END_T = 1.6;

const CSS = `
#tutBand { position: fixed; left: 50%; top: calc(62px + env(safe-area-inset-top)); z-index: 3; transform: translateX(-50%);
  display: none; box-sizing: border-box; min-width: 280px; max-width: calc(100vw - 32px); padding: 7px 20px 9px;
  border: 2px solid #e0bb62; border-radius: 12px; background: #0b2a4a; color: #fff; text-align: center; pointer-events: none;
  font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; box-shadow: 0 6px 16px #0008; }
#tutBand.on { display: block; }
#tutBand small { display: block; font-size: 12px; font-weight: 700; color: #e0bb62; }
#tutBand b { display: block; margin-top: 1px; font-size: 22px; font-weight: 800; white-space: nowrap; }
#tutBand .k { display: inline-block; margin-top: 5px; padding: 1px 12px; border-radius: 6px; background: #f4f4f4; color: #111318;
  font-size: 15px; font-weight: 800; }
#tutBand .s { display: block; margin-top: 3px; font-size: 12px; color: #c9d3e6; }
#tutBand.ok { border-color: #7cfc9a; }
#tutBand.ok b { color: #7cfc9a; }
#tutBand.pop { animation: tutPop .22s ease-out; }
@keyframes tutPop { from { transform: translateX(-50%) scale(1.12); } to { transform: translateX(-50%) scale(1); } }
#tutSkip { position: fixed; right: calc(12px + env(safe-area-inset-right)); top: calc(12px + env(safe-area-inset-top)); z-index: 3;
  display: none; height: 38px; padding: 0 14px; border-radius: 6px; border: 2px solid #ffffffa0; background: #0b0d12c0; color: #fff;
  font: 700 14px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; touch-action: manipulation; }
#tutSkip.on { display: block; }
body.touch #tutSkip { top: calc(58px + env(safe-area-inset-top)); }
@media (max-height: 500px) {
  #tutBand { top: calc(46px + env(safe-area-inset-top)); padding: 4px 16px 6px; }
  #tutBand b { font-size: 18px; }
  #tutBand .k { margin-top: 3px; font-size: 13px; }
}
`;

let injected = false;

export class FpsTutorial {
  /** 연습 중 (시계 멈춤·적 없음) */
  on = false;
  /** 지금 단계 (0부터) */
  step = 0;
  /** ✓를 보여 주는 중이면 남은 시간 */
  private okT = 0;
  /** "연습 끝!"을 보여 주는 남은 시간 (판은 이미 돈다) */
  private endT = 0;
  private acc = 0;
  private lastX = 0;
  private lastZ = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private base = 0;
  private shown = false;
  private readonly band: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;

  constructor(private readonly h: TutHost) {
    if (!injected) {
      injected = true;
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.band = document.createElement('div');
    this.band.id = 'tutBand';
    this.band.setAttribute('role', 'status');
    this.band.setAttribute('aria-live', 'polite');
    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'tutSkip';
    this.skipBtn.type = 'button';
    this.skipBtn.textContent = h.touch ? TUT_TEXT.skip : TUT_TEXT.skipPc;
    // 터치 화면: 화면(캔버스) 터치로 새지 않게 바로 받는다
    this.skipBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.skip();
      },
      { passive: false },
    );
    this.skipBtn.addEventListener('click', () => this.skip());
    document.body.append(this.band, this.skipBtn);
  }

  /** 첫 판 시작 (main.ts start): 첫 단계부터 */
  begin(): void {
    this.on = true;
    this.endT = 0;
    this.go(0);
  }

  /** 판을 버렸다 (처음 화면으로): 본 것으로 치지 않고 띠만 치운다 */
  cancel(): void {
    this.on = false;
    this.okT = 0;
    this.endT = 0;
    this.sync(false);
  }

  /** 건너뛰기 (단추·Enter) */
  skip(): void {
    if (!this.on) return;
    this.finish(false);
  }

  /** PC Enter = 건너뛰기. 썼으면 true */
  key(e: KeyboardEvent, playing: boolean): boolean {
    if (!this.on || !playing || e.code !== 'Enter' || e.repeat) return false;
    e.preventDefault();
    this.skip();
    return true;
  }

  private go(i: number): void {
    const h = this.h;
    this.step = i;
    this.okT = 0;
    this.acc = 0;
    this.lastX = h.pos.x;
    this.lastZ = h.pos.z;
    this.lastYaw = h.yaw;
    this.lastPitch = h.pitch;
    this.base = i === 2 ? h.thrown : i === 3 ? h.jumps : i === 4 ? h.specials : 0;
    if (i === 4) h.fillSp();
    const d = TUT_STEPS[i];
    const st = h.student;
    const key = h.touch ? d.touch(st) : d.pc(st);
    this.band.className = this.band.classList.contains('on') ? 'on' : '';
    this.band.innerHTML = `<small>${TUT_TEXT.head(i + 1, TUT_STEPS.length)}</small><b>${d.title(st)}</b><span class="k">${key}</span>${d.sub ? `<span class="s">${d.sub}</span>` : ''}`;
    this.pop();
  }

  private pop(): void {
    this.band.classList.remove('pop');
    void this.band.offsetWidth;
    this.band.classList.add('pop');
  }

  /** 이번 단계를 해 봤나 */
  private tried(): boolean {
    const h = this.h;
    switch (this.step) {
      case 0: {
        this.acc += Math.hypot(h.pos.x - this.lastX, h.pos.z - this.lastZ);
        this.lastX = h.pos.x;
        this.lastZ = h.pos.z;
        return this.acc >= MOVE_NEED;
      }
      case 1: {
        let dy = h.yaw - this.lastYaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.acc += Math.abs(dy) + Math.abs(h.pitch - this.lastPitch);
        this.lastYaw = h.yaw;
        this.lastPitch = h.pitch;
        return this.acc >= LOOK_NEED;
      }
      case 2:
        return h.thrown > this.base;
      case 3:
        return h.jumps > this.base;
      default:
        return h.specials > this.base;
    }
  }

  /** 매 단계 (판이 도는 동안, Game.step) */
  update(dt: number): void {
    if (this.endT > 0) {
      this.endT -= dt;
      if (this.endT <= 0) this.sync(false);
    }
    if (!this.on) return;
    if (this.okT > 0) {
      this.okT -= dt;
      if (this.okT <= 0) {
        if (this.step + 1 < TUT_STEPS.length) this.go(this.step + 1);
        else this.finish(true);
      }
      return;
    }
    if (!this.tried()) return;
    this.okT = OK_T;
    this.band.classList.add('ok');
    const b = this.band.querySelector('b');
    if (b) b.textContent = TUT_TEXT.ok;
    this.band.querySelector('.k')?.remove();
    this.band.querySelector('.s')?.remove();
    this.pop();
    this.h.sound('pickup');
  }

  /** 끝까지 했거나(all) 건너뛰었다 */
  private finish(all: boolean): void {
    this.on = false;
    this.okT = 0;
    markTutorialSeen('fps');
    if (all) {
      this.band.className = 'on ok';
      this.band.innerHTML = `<b>${TUT_TEXT.end}</b>`;
      this.pop();
      this.endT = END_T;
      this.h.sound('clear');
    } else {
      this.endT = 0;
      this.sync(false);
    }
    this.skipBtn.classList.remove('on');
    this.h.done();
  }

  /** 띠·건너뛰기 단추 보이기 (일시정지·결과 화면에서는 숨긴다 — main.ts updateHud가 매 프레임 부른다) */
  sync(playing: boolean): void {
    const show = playing && (this.on || this.endT > 0);
    if (show === this.shown) {
      if (show) this.skipBtn.classList.toggle('on', this.on);
      return;
    }
    this.shown = show;
    this.band.classList.toggle('on', show);
    this.skipBtn.classList.toggle('on', show && this.on);
  }
}
