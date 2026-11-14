import { clockText, START_CLOCK } from '../config';
import server from '../data/server.json';
import { gpaText, parseStudentGrades } from '../grade';
import { checkNickname, lastNickname } from '../records';
import { DIFFS, timeText, type DiffKey } from './settings';

// 1인칭 시험판 닉네임 기록판 (2026-11-14). 본편(2D) 기록판(src/records.ts)과는 따로 돈다.
// - 서버는 2D와 같은 Apps Script 웹앱(src/data/server.json)이고, 모드만 fps-staff / fps-student로 따로 쌓는다.
// - 예전 서버는 모르는 모드를 'staff'로 바꿔 저장한다(2D 기록판이 더러워진다). 그래서 먼저 GET ?mode=fps-… 로
//   물어보고, 답의 mode가 물어본 모드와 같을 때만 온라인으로 올린다. 그 전에는 절대 POST하지 않는다.
// - 온라인을 못 쓰면 이 기기(localStorage)에만 저장하고 이 기기 기록으로 순위를 보여 준다.
// - 순위: 깬 구역(다 깨면 맨 위) → 난이도(고급 > 중급 > 초보) → 완료 시각 → 걸린 시간 (apps-script/Code.gs와 같다).
// - 실명·학번은 받지 않는다. 닉네임이 비면 익명(순위에는 안 나오고 온라인 플레이 수에만 잡힌다).

export type FpsMode = 'fps-staff' | 'fps-student';

export interface FpsRecord {
  mode: FpsMode;
  /** 빈 문자열 = 익명 */
  nickname: string;
  /** 깬 구역 수 0~4 */
  stage: number;
  /** 네 구역을 모두 깼으면 true */
  cleared: boolean;
  /** 게임 속 시각(분). 16:52 = 1012 */
  clockMin: number;
  /** 걸린 시간(초) */
  elapsed: number;
  /** 학생: 구역별 학점을 이어 붙인 글자("A+A0B+A+"), 교직원: '' */
  grades: string;
  /** 주인공 이름 */
  hero: string;
  /** 학생: 외국어 주문 id, 교직원: '' */
  skill: string;
  version: string;
  diff: DiffKey | '';
  ts: number;
}

/** 결과 화면이 넘겨주는 이번 판 */
export interface FpsResult {
  mode: FpsMode;
  /** 깬 구역 수 0~4 */
  stage: number;
  cleared: boolean;
  /** 걸린 시간(초) */
  elapsed: number;
  grades?: string;
  hero: string;
  skill?: string;
  diff: DiffKey;
  /** 게임 속 시각(분). 없으면 16:52 + 걸린 시간 */
  clockMin?: number;
}

/** 왜 온라인이 아닌지: online = 새 서버, old = 예전 서버(1인칭 모드 모름), offline = 연결 실패, none = 주소 없음 */
type Why = 'online' | 'old' | 'offline' | 'none';

interface FpsBoard {
  entries: FpsRecord[];
  why: Why;
  plays?: number;
  players?: number;
  /** 강조할 내 기록 (entries 안의 같은 객체, 20위 밖이면 entries에 없다) */
  mine?: FpsRecord | null;
}

const VERSION = 'F1';
const MAX_STAGE = 4;
const TOP_N = 20;
const params = new URLSearchParams(location.search);
/** 시험용: ?debug&recordsUrl=http://localhost:포트 (debug가 있을 때만, 이 컴퓨터 주소만 받아들인다) */
const testUrl = params.has('debug') ? (params.get('recordsUrl') ?? '') : '';
const SERVER = (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(testUrl) ? testUrl : (server as { recordsUrl: string }).recordsUrl || '').trim();
const LOCAL_KEY = 'staffsmash.fps.records';
/** src/records.ts와 같은 키 (2D와 닉네임을 같이 쓴다) */
const NICK_KEY = 'staffsmash.nickname';
const TIMEOUT_MS = 8000;
const DIFF_RANK: Record<string, number> = { hard: 3, normal: 2, easy: 1 };
const MODES: FpsMode[] = ['fps-staff', 'fps-student'];
const TAB_LABEL: Record<FpsMode, string> = { 'fps-staff': '교직원', 'fps-student': '학생' };

/** GET으로 새 서버임을 확인한 모드 (이 모드만 POST한다) */
const confirmed = new Set<FpsMode>();
/** 이번 창에서 마지막으로 남긴 기록 (기록판에서 강조) */
let lastMine: FpsRecord | null = null;
let lastTab: FpsMode = 'fps-staff';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// ---------- 순위 ----------

const isDiff = (v: unknown): v is DiffKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(DIFFS, v);

/** 순위 비교 (서버 doGet과 같은 순서) */
export function compareFps(a: FpsRecord, b: FpsRecord): number {
  const sa = a.cleared ? MAX_STAGE + 1 : a.stage;
  const sb = b.cleared ? MAX_STAGE + 1 : b.stage;
  if (sa !== sb) return sb - sa;
  const da = DIFF_RANK[a.diff] ?? 0;
  const db = DIFF_RANK[b.diff] ?? 0;
  if (da !== db) return db - da;
  if (a.clockMin !== b.clockMin) return a.clockMin - b.clockMin;
  return a.elapsed - b.elapsed;
}

/** 서버·저장소에서 읽은 값을 모양에 맞춘다 */
function clean(raw: Partial<Record<keyof FpsRecord, unknown>>, mode: FpsMode): FpsRecord {
  const n = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' ? Number(v) : f);
  return {
    mode,
    nickname: String(raw.nickname ?? ''),
    stage: n(raw.stage, 0),
    cleared: raw.cleared === true,
    clockMin: n(raw.clockMin, 1440),
    elapsed: n(raw.elapsed, 7200),
    grades: String(raw.grades ?? ''),
    hero: String(raw.hero ?? ''),
    skill: String(raw.skill ?? ''),
    version: String(raw.version ?? ''),
    diff: isDiff(raw.diff) ? raw.diff : '',
    ts: n(raw.ts, 0),
  };
}

/** 서버가 돌려준 줄이 방금 내가 올린 기록인지 (서버는 자기 시각을 ts로 쓰므로 값으로 맞춘다) */
function sameRecord(a: FpsRecord, b: FpsRecord): boolean {
  return (
    a.nickname === b.nickname &&
    a.stage === b.stage &&
    a.cleared === b.cleared &&
    a.diff === b.diff &&
    Math.abs(a.clockMin - b.clockMin) < 0.01 &&
    Math.abs(a.elapsed - b.elapsed) < 0.5 &&
    Math.abs(a.ts - b.ts) < 30 * 60 * 1000
  );
}

// ---------- 이 기기 저장소 ----------

function loadLocal(): FpsRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(arr)
      ? arr
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .filter((x) => x.mode === 'fps-staff' || x.mode === 'fps-student')
          .map((x) => clean(x, x.mode as FpsMode))
      : [];
  } catch {
    return [];
  }
}

function saveLocal(r: FpsRecord): void {
  try {
    const all = loadLocal();
    all.push(r);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-200)));
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 창 등)는 넘어간다
  }
}

function rememberNickname(name: string): void {
  try {
    localStorage.setItem(NICK_KEY, name);
  } catch {
    // 무시
  }
}

/** 이 기기 기록으로 만든 순위 */
function localBoard(mode: FpsMode, why: Why): FpsBoard {
  const all = loadLocal().filter((e) => e.mode === mode && e.nickname);
  all.sort(compareFps);
  const entries = all.slice(0, TOP_N);
  const mine = lastMine && lastMine.mode === mode && lastMine.nickname ? (all.find((e) => e.ts === lastMine?.ts) ?? null) : null;
  return { entries, why, mine };
}

// ---------- 서버 ----------

function timeoutSignal(): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), TIMEOUT_MS);
  return c.signal;
}

/** GET ?mode=… — 답의 mode가 같아야 새 서버(온라인 가능)로 본다 */
async function fetchOnline(mode: FpsMode): Promise<FpsBoard> {
  if (!SERVER) return { entries: [], why: 'none' };
  try {
    const r = await fetch(`${SERVER}?mode=${encodeURIComponent(mode)}`, { signal: timeoutSignal(), cache: 'no-store' });
    const j = (await r.json()) as { ok?: boolean; mode?: string; entries?: unknown; plays?: number; players?: number };
    if (!j || j.ok !== true) return { entries: [], why: 'offline' };
    if (j.mode !== mode) {
      // 예전 서버: fps 모드를 모른다 → 올리지 않는다
      confirmed.delete(mode);
      return { entries: [], why: 'old' };
    }
    confirmed.add(mode);
    const list = Array.isArray(j.entries) ? (j.entries as Record<string, unknown>[]) : [];
    return { entries: list.map((x) => clean(x, mode)), why: 'online', plays: Number(j.plays) || 0, players: Number(j.players) || 0 };
  } catch {
    return { entries: [], why: 'offline' };
  }
}

/** 온라인 순위에 방금 남긴 내 기록을 맞춰 넣는다 (아직 시트에 안 보이면 끼워 넣는다) */
function withMine(b: FpsBoard, mode: FpsMode): FpsBoard {
  const me = lastMine;
  if (!me || me.mode !== mode || !me.nickname) return { ...b, mine: null };
  const entries = [...b.entries];
  let mine = entries.find((e) => sameRecord(e, me)) ?? null;
  if (!mine) {
    mine = me;
    entries.push(me);
    entries.sort(compareFps);
  }
  return { ...b, entries: entries.slice(0, TOP_N), mine };
}

/** 기록판 한 탭 불러오기 */
async function loadBoard(mode: FpsMode): Promise<FpsBoard> {
  const b = await fetchOnline(mode);
  return b.why === 'online' ? withMine(b, mode) : localBoard(mode, b.why);
}

/** 기록 남기기: 이 기기에는 늘 저장하고, 새 서버가 확인된 모드만 온라인으로 올린다 */
async function submit(rec: FpsRecord, pre: Promise<FpsBoard>): Promise<FpsBoard & { sent: boolean }> {
  lastMine = rec;
  saveLocal(rec);
  if (rec.nickname) rememberNickname(rec.nickname);
  const first = await pre;
  if (first.why !== 'online' || !confirmed.has(rec.mode)) return { ...localBoard(rec.mode, first.why), sent: false };
  try {
    // Apps Script는 리디렉션 뒤에 응답하므로 no-cors로 보내고 결과는 읽지 않는다 (2D와 같다)
    await fetch(SERVER, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(rec),
      signal: timeoutSignal(),
    });
  } catch {
    return { ...localBoard(rec.mode, 'offline'), sent: false };
  }
  const fresh = await fetchOnline(rec.mode);
  const base = fresh.why === 'online' ? fresh : { ...first, plays: (first.plays ?? 0) + 1 };
  return { ...withMine(base, rec.mode), sent: true };
}

// ---------- 기록판 창 ----------

let boardEl: HTMLElement | null = null;
let shown: FpsMode = 'fps-staff';
/** 창을 연 동안 받아 둔 탭 (탭을 오가도 다시 받지 않는다) */
const cache = new Map<FpsMode, FpsBoard>();
let loadSeq = 0;

function resultText(e: FpsRecord): string {
  if (e.cleared) return e.mode === 'fps-student' ? '졸업' : '퇴근 승인';
  // 깬 구역 수 + 1 = 멈춘 구역
  return `${Math.min(MAX_STAGE, Math.max(0, Math.floor(e.stage)) + 1)}구역`;
}

function noteText(b: FpsBoard): string {
  switch (b.why) {
    case 'online':
      return `<span class="on">지금까지 ${b.plays ?? 0}판 · 참여 ${b.players ?? 0}명</span>`;
    case 'old':
      return '온라인 1인칭 기록판은 서버 업데이트 후 열립니다 · 지금은 이 기기에만 저장';
    case 'offline':
      return '온라인 기록판에 연결하지 못했습니다 · 이 기기의 기록만 보여 줍니다';
    default:
      return '이 기기의 기록만 보여 줍니다';
  }
}

function rowHtml(e: FpsRecord, rank: string, mine: boolean, student: boolean): string {
  const cells = [
    `<td class="r">${rank}</td>`,
    `<td class="n">${esc(e.nickname)}</td>`,
    `<td class="res${e.cleared ? ' ok' : ''}"${e.cleared ? '' : ` title="${resultText(e)}에서 멈춤"`}>${resultText(e)}</td>`,
    student ? `<td>${gpaText(parseStudentGrades(e.grades))}</td>` : '',
    `<td>${e.diff ? DIFFS[e.diff].label : '-'}</td>`,
    `<td>${clockText(e.clockMin)}</td>`,
    `<td>${timeText(e.elapsed)}</td>`,
  ];
  return `<tr class="${mine ? 'me' : ''}">${cells.join('')}</tr>`;
}

function tableHtml(b: FpsBoard, mode: FpsMode): string {
  const student = mode === 'fps-student';
  const heads = ['순위', '닉네임', '결과', ...(student ? ['GPA'] : []), '난이도', '시각', '걸린 시간'];
  if (b.entries.length === 0) return '<p class="fb-empty">아직 기록이 없습니다. 첫 기록의 주인공이 되어 보세요!</p>';
  const rows = b.entries.map((e, i) => rowHtml(e, String(i + 1), e === b.mine, student));
  if (b.mine && !b.entries.includes(b.mine)) rows.push(rowHtml(b.mine, `${TOP_N}위 밖`, true, student));
  return `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function render(b: FpsBoard | null): void {
  if (!boardEl) return;
  boardEl.querySelectorAll<HTMLButtonElement>('[data-fbtab]').forEach((t) => {
    const on = t.dataset.fbtab === shown;
    t.classList.toggle('on', on);
    t.setAttribute('aria-selected', String(on));
  });
  const note = boardEl.querySelector('.fb-note') as HTMLElement;
  const body = boardEl.querySelector('.fb-body') as HTMLElement;
  if (!b) {
    note.textContent = '';
    body.innerHTML = '<p class="fb-empty">기록을 불러오는 중…</p>';
    return;
  }
  note.innerHTML = noteText(b);
  note.classList.toggle('warn', b.why !== 'online');
  body.innerHTML = tableHtml(b, shown);
  body.querySelector('tr.me')?.scrollIntoView({ block: 'nearest' });
}

function showTab(mode: FpsMode): void {
  shown = mode;
  lastTab = mode;
  const cached = cache.get(mode);
  if (cached) return render(cached);
  render(null);
  const seq = ++loadSeq;
  void loadBoard(mode).then((b) => {
    cache.set(mode, b);
    // 불러오는 사이에 창을 닫았거나 탭을 바꿨으면 그리지 않는다
    if (seq === loadSeq && boardEl && shown === mode) render(b);
  });
}

/** 창이 떠 있는 동안 게임 키(다시 하기 Enter·Space, 모드 고르기 1·2, 소리 M …)가 뒤에서 돌지 않게 먼저 받는다 */
function onKey(e: KeyboardEvent): void {
  if (!boardEl) return;
  e.stopPropagation();
  const onButton = e.target instanceof HTMLButtonElement && boardEl.contains(e.target);
  switch (e.code) {
    case 'Escape':
      e.preventDefault();
      closeBoard();
      break;
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      if (!onButton) {
        e.preventDefault();
        if (!e.repeat) closeBoard();
      }
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      showTab(MODES[(MODES.indexOf(shown) + 1) % MODES.length]);
      break;
    case 'Digit1':
    case 'Numpad1':
      showTab('fps-staff');
      break;
    case 'Digit2':
    case 'Numpad2':
      showTab('fps-student');
      break;
    case 'Tab': {
      // 초점이 창 뒤(다시 하기 단추 등)로 빠지지 않게 창 안에서만 돈다
      e.preventDefault();
      const f = [...boardEl.querySelectorAll<HTMLButtonElement>('button')];
      const i = f.indexOf(document.activeElement as HTMLButtonElement);
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      break;
    }
    default:
      break;
  }
}

const stopKey = (e: KeyboardEvent) => {
  if (boardEl) e.stopPropagation();
};

/** 기록판 창을 연다 (given = 방금 남긴 기록으로 받아 둔 순위) */
export function openBoard(tab: FpsMode = lastTab, given?: FpsBoard): void {
  closeBoard();
  cache.clear();
  if (given) cache.set(tab, given);
  const el = document.createElement('div');
  el.id = 'fboard';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'fbTitle');
  el.innerHTML = `
    <div class="fb-box">
      <div class="fb-head">
        <h2 id="fbTitle">1인칭 기록판</h2>
        <div class="fb-tabs" role="tablist">${MODES.map((m) => `<button type="button" role="tab" data-fbtab="${m}">${TAB_LABEL[m]}</button>`).join('')}</div>
        <button type="button" class="fb-x" aria-label="닫기">✕</button>
      </div>
      <p class="fb-note"></p>
      <div class="fb-body"></div>
      <button type="button" class="fb-close">닫기</button>
    </div>`;
  document.body.appendChild(el);
  boardEl = el;
  el.querySelectorAll<HTMLButtonElement>('[data-fbtab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.fbtab as FpsMode)));
  el.querySelector('.fb-x')?.addEventListener('click', closeBoard);
  el.querySelector('.fb-close')?.addEventListener('click', closeBoard);
  // 바깥 어두운 곳을 누르면 닫기
  el.addEventListener('click', (e) => {
    if (e.target === el) closeBoard();
  });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', stopKey, true);
  showTab(tab);
  // 창을 연 키 입력(Enter 등)이 다 끝난 뒤에 초점을 옮긴다 (같은 키가 "닫기"를 누르지 않게)
  setTimeout(() => {
    if (boardEl === el) (el.querySelector('.fb-close') as HTMLButtonElement).focus({ preventScroll: true });
  }, 0);
}

export function closeBoard(): void {
  if (!boardEl) return;
  loadSeq++;
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', stopKey, true);
  boardEl.remove();
  boardEl = null;
  // 닫은 뒤 Enter가 다시 기록판 단추를 누르지 않게 (결과 화면의 Enter = 다시 하기)
  (document.activeElement as HTMLElement | null)?.blur?.();
}

// ---------- 타이틀 · 결과 화면에 붙이는 부분 ----------

/** 단추에서 Enter·Space가 게임 키(타이틀 Enter = 출근하기, 결과 Enter = 다시 하기)로 새지 않게 */
function guardKeys(el: HTMLElement): void {
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
}

/** 타이틀 화면에 "기록판" 단추를 넣는다 (설정 단추 앞) */
export function addBoardButton(root: HTMLElement): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'boardBtn';
  b.className = 'ghost';
  b.textContent = '기록판';
  const anchor = root.querySelector('#setBtn');
  if (anchor) anchor.before(b);
  else (root.querySelector('.panel') ?? root).appendChild(b);
  guardKeys(b);
  b.addEventListener('click', () => openBoard());
}

/** 결과 화면(성공·실패 모두)에 닉네임 칸과 "기록 남기기" 단추를 넣는다 */
export function attachRecordForm(root: HTMLElement, r: FpsResult): void {
  const panel = (root.querySelector('.panel') as HTMLElement | null) ?? root;
  // 결과 화면이 뜨자마자 서버에 물어 둔다 (새 서버인지 + 순위)
  const pre = fetchOnline(r.mode);
  const box = document.createElement('div');
  box.className = 'frec';
  box.innerHTML = `
    <div class="frec-row">
      <input id="frecName" type="text" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="닉네임 (비우면 익명)" aria-label="기록판 닉네임">
      <button id="frecGo" type="button">기록 남기기</button>
    </div>
    <p class="frec-note">실명·학번은 쓰지 마세요 · 닉네임 2~8자, 비우면 익명(순위 없이 플레이 수만)</p>
    <p class="frec-msg" aria-live="polite"></p>`;
  const anchor = panel.querySelector('.foot') ?? panel.querySelector('#againBtn');
  if (anchor) anchor.before(box);
  else panel.appendChild(box);
  const input = box.querySelector('#frecName') as HTMLInputElement;
  const go = box.querySelector('#frecGo') as HTMLButtonElement;
  const msg = box.querySelector('.frec-msg') as HTMLElement;
  input.value = lastNickname();
  guardKeys(box);
  let busy = false;
  const send = async () => {
    if (busy) return;
    let nickname = '';
    if (input.value.trim()) {
      const chk = checkNickname(input.value);
      if (!chk.ok) {
        msg.classList.remove('ok');
        msg.textContent = chk.reason;
        input.focus();
        return;
      }
      nickname = chk.name;
    }
    busy = true;
    input.disabled = true;
    go.disabled = true;
    msg.classList.add('ok');
    msg.textContent = '기록을 남기는 중…';
    const stage = Math.max(0, Math.min(MAX_STAGE, Math.round(r.stage)));
    const rec: FpsRecord = {
      mode: r.mode,
      nickname,
      stage,
      cleared: r.cleared && stage === MAX_STAGE,
      clockMin: Math.round((r.clockMin ?? START_CLOCK + r.elapsed / 60) * 100) / 100,
      elapsed: Math.round(r.elapsed),
      grades: r.mode === 'fps-student' ? (r.grades ?? '').slice(0, 10) : '',
      hero: r.hero.slice(0, 20),
      skill: r.mode === 'fps-student' ? (r.skill ?? '').slice(0, 20) : '',
      version: VERSION,
      diff: r.diff,
      ts: Date.now(),
    };
    const b = await submit(rec, pre);
    const rank = b.mine ? b.entries.indexOf(b.mine) + 1 : 0;
    const where = rank > 0 ? `${rank}위` : `${TOP_N}위 밖`;
    let done: string;
    if (!nickname) done = b.sent ? '익명으로 남겼어요 · 순위 없이 플레이 수에만 잡혀요' : '익명 플레이는 순위에 나오지 않아요';
    else if (b.sent) done = `<b>${esc(nickname)}</b> 기록을 올렸어요 · 온라인 ${where}`;
    else done = `<b>${esc(nickname)}</b> 기록을 이 기기에 저장했어요 · 이 기기 ${where}`;
    box.innerHTML = `<p class="frec-done">${done}</p><button id="frecView" class="ghost" type="button">기록판 보기</button>`;
    box.querySelector('#frecView')?.addEventListener('click', () => openBoard(r.mode));
    openBoard(r.mode, b);
  };
  go.addEventListener('click', () => void send());
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // 한글 조합 중 Enter는 조합이 끝난 뒤에 보낸다 (Enter가 두 번 들어와도 busy가 막는다)
    if (e.isComposing) {
      input.addEventListener('compositionend', () => setTimeout(() => void send(), 0), { once: true });
      return;
    }
    // 같은 Enter의 keypress가 곧바로 열린 기록판의 "닫기" 단추를 누르지 않게 막는다
    e.preventDefault();
    void send();
  });
}

if (params.has('debug')) Object.assign(window as object, { __fpsBoard: { openBoard, closeBoard, server: SERVER, confirmed } });
