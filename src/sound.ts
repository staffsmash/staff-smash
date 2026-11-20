// 두 게임(2D 본편 src/main.ts, 1인칭 src/fps/main.ts)이 같이 쓰는 소리 한 벌.
// - sfx: 효과음 (src/fps/audio.ts). 소리 끔은 예전 저장값(staffsmash.fps.muted)을 두 게임이 같이 쓴다.
// - music: 배경음악 (src/music.ts). 크기는 따로(staffsmash.music.volume, 기본 30%).
// - 브라우저(특히 iPhone Safari·홈 화면 앱)는 사용자 입력 안에서만 소리를 열어 준다 → 첫 탭·클릭·키에서 연다.
// - 탭을 가리면 소리를 멈추고, 돌아오면 다시 연다 (안 되면 다음 탭에서 열린다).

import { Sfx, type SfxName } from './fps/audio';
import { Music, type MusicWant, type TrackId } from './music';

export const sfx = new Sfx();
export const music = new Music(sfx);
export type { SfxName, TrackId };

let ready = false;

/** 입력·탭 전환을 한 번만 묶는다 (두 게임 모두 시작할 때 부른다) */
export function initAudio(): void {
  if (ready) return;
  ready = true;
  const unlock = () => sfx.unlock();
  // iPhone은 touchend·click에서만 풀리는 판이 있어 여러 입력에 다 건다
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    const ctx = sfx.context;
    if (!ctx) return;
    if (document.hidden) sfx.suspend();
    else if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  });
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window as object, { __music: music, __sfx: sfx });
  }
}

/** 효과음 한 번 (첫 입력 전이거나 소리 끔이면 조용히 넘어간다) */
export function play(name: SfxName, vol = 1): void {
  sfx.play(name, vol);
}

/** M·소리 단추: 효과음과 배경음악을 함께 끄고 켠다. 꺼졌으면 true */
export function toggleMute(): boolean {
  sfx.unlock();
  return sfx.toggleMute();
}

// ---------- 1인칭 (src/fps/main.ts) ----------

/** 1인칭 Game에서 읽는 것만 (main.ts의 Game 그대로 넘긴다) */
interface FpsView {
  phase: string;
  mode: 'staff' | 'student';
  fight: string;
  boss: { dead: boolean; gone: boolean; state: string } | null;
}

/** 1인칭: 판 중 보스·중간보스가 나와 있으면 보스 곡, 아니면 모드 곡. 타이틀·결과는 작게, 일시정지는 멈춘다 */
export function followFps(g: FpsView): void {
  initAudio();
  music.follow((): MusicWant => {
    const normal: TrackId = g.mode === 'student' ? 'student' : 'staff';
    if (g.phase !== 'play' && g.phase !== 'paused') return { track: normal, quiet: true, paused: false };
    const b = g.boss;
    const boss = (!!b && !b.dead && !b.gone && b.state !== 'sleep') || g.fight === 'between';
    return { track: boss ? 'boss' : normal, quiet: false, paused: g.phase === 'paused' };
  });
}

// ---------- 2D (src/main.ts, StageScene) ----------

interface SceneLike {
  sys: { settings: { key: string; data?: unknown } };
}
interface GameLike {
  scene: { getScenes(active: boolean): SceneLike[] };
}

let stageAt = -1;
let stageWant: MusicWant = { track: null, quiet: false, paused: false };
let stageBoss = false;
let lastMode: 'staff' | 'student' = 'staff';

/** StageScene.update가 매 프레임 알려 준다: 모드, 보스전 중인지, 일시정지인지 */
export function stageMusic(mode: 'staff' | 'student', boss: boolean, paused: boolean): void {
  const now = performance.now();
  // 보스가 막 나왔다 (한참 만에 다시 불렸으면 = 판을 새로 열었으면 처음부터 센다)
  if (now - stageAt > 3000) stageBoss = false;
  if (boss && !stageBoss) play('volley', 0.8);
  stageBoss = boss;
  stageAt = now;
  lastMode = mode;
  stageWant = { track: boss ? 'boss' : mode, quiet: false, paused };
}

function modeOf(data: unknown): 'staff' | 'student' | null {
  const d = data as { mode?: unknown; run?: { mode?: unknown } } | undefined;
  const m = d?.run?.mode ?? d?.mode;
  return m === 'staff' || m === 'student' ? m : null;
}

/** 2D: 판(stage)은 StageScene이 알려 준 대로, 그 밖의 화면은 모드 곡을 작게 (타이틀은 교직원 곡) */
export function follow2d(game: GameLike): void {
  initAudio();
  // 효과음 크기는 1인칭 설정 화면 값을 같이 쓴다 (없으면 기본 80%)
  try {
    const v = (JSON.parse(localStorage.getItem('staffsmash.fps.settings') ?? '{}') as { volume?: unknown }).volume;
    if (typeof v === 'number' && Number.isFinite(v)) sfx.setVolume(v);
  } catch {
    /* 저장값이 없거나 깨졌으면 기본값 */
  }
  // 2D 본편은 M으로 소리를 끄고 켠다 (닉네임 입력 중에는 글자로 받는다)
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    toggleMute();
  });
  music.follow((): MusicWant => {
    const scenes = game.scene.getScenes(true);
    const keys = scenes.map((s) => s.sys.settings.key);
    // 판이 열려 있으면 StageScene이 마지막으로 알려 준 대로 (화면이 버벅여 알림이 늦어도 곡을 바꾸지 않는다)
    if (keys.includes('stage') && stageAt >= 0) return stageWant;
    const s = scenes[0];
    const key = s?.sys.settings.key;
    if (!s || key === 'title') return { track: 'staff', quiet: true, paused: false };
    if (key === 'studentEnding') lastMode = 'student';
    else lastMode = modeOf(s.sys.settings.data) ?? lastMode;
    return { track: lastMode, quiet: true, paused: false };
  });
}
