// 키보드와 터치 입력을 한곳에 모은다.
// 키보드는 e.code(물리 키)로 읽어 한글 입력 상태와 상관없이 동작하게 한다.

export type Action = 'attack' | 'jump' | 'special' | 'pause' | 'confirm' | 'restart' | 'debug';

const KEYMAP: Record<string, Action[]> = {
  KeyJ: ['attack', 'confirm'],
  KeyK: ['jump'],
  Space: ['jump', 'confirm'],
  KeyI: ['special'],
  Escape: ['pause'],
  KeyP: ['pause'],
  Enter: ['confirm', 'restart'],
  NumpadEnter: ['confirm', 'restart'],
  KeyR: ['restart'],
  Backquote: ['debug'],
  F2: ['debug'],
};

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const DIRS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN]);

/** 누른 입력을 이 시간(ms) 동안 기억한다. 콤보 연타가 히트스톱에 묻히지 않게 한다. */
const BUFFER_MS = 170;
/** 같은 방향을 이 시간(ms) 안에 두 번 누르면 대시 */
const DOUBLE_TAP_MS = 260;

export class Controls {
  private held = new Set<string>();
  private pressAt = new Map<Action, number>();
  private lastTapDir = 0;
  private lastTapAt = 0;
  private dashDir = 0;
  private tx = 0;
  private ty = 0;
  private tRun = false;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.code in KEYMAP || DIRS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    const now = performance.now();
    for (const a of KEYMAP[e.code] ?? []) this.pressAt.set(a, now);

    const dir = LEFT.includes(e.code) ? -1 : RIGHT.includes(e.code) ? 1 : 0;
    if (dir !== 0) {
      if (dir === this.lastTapDir && now - this.lastTapAt < DOUBLE_TAP_MS) this.dashDir = dir;
      else if (dir !== this.dashDir) this.dashDir = 0;
      this.lastTapDir = dir;
      this.lastTapAt = now;
    }
  };

  private onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
    if (this.dashDir !== 0 && this.kbX() !== this.dashDir) this.dashDir = 0;
  };

  private onBlur = (): void => {
    this.held.clear();
    this.dashDir = 0;
  };

  private any(codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  private kbX(): number {
    return (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
  }

  private kbY(): number {
    return (this.any(DOWN) ? 1 : 0) - (this.any(UP) ? 1 : 0);
  }

  get moveX(): number {
    const k = this.kbX();
    return k !== 0 ? k : this.tx;
  }

  get moveY(): number {
    const k = this.kbY();
    return k !== 0 ? k : this.ty;
  }

  get running(): boolean {
    const k = this.kbX();
    if (k !== 0) return k === this.dashDir;
    return this.tRun;
  }

  /** 최근에 눌린 입력이면 true를 돌려주고 지운다. */
  consume(a: Action): boolean {
    const t = this.pressAt.get(a);
    if (t === undefined) return false;
    this.pressAt.delete(a);
    return performance.now() - t <= BUFFER_MS;
  }

  pressTouch(a: Action): void {
    this.pressAt.set(a, performance.now());
  }

  setTouchMove(x: number, y: number, run: boolean): void {
    this.tx = x;
    this.ty = y;
    this.tRun = run;
  }
}
