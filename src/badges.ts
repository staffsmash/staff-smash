import { HEROES } from './data/heroes';
import { STUDENT_HEROES } from './data/students';

// 도전 과제 배지 12개 (PRD 결정 60, 2026-11-27 사용자 "가" — 이름·조건 그대로).
// 2D와 1인칭에서 딴 배지가 한곳에 모인다 (같은 사이트라 이 기기 localStorage를 같이 쓴다).
// 따는 순간 화면 위에 "배지 획득 · ○○"이 잠깐 뜬다 (showToast, DOM). 모아 보기는 기록판 화면 안 "배지" 탭 (2D LeaderboardScene, 1인칭 board.ts).
//
// 부르는 곳
// - 판 안: noteCombo(연속 수) · noteSpecialKills(필살기 한 번에 처리한 수) · noteStageNoDamage() · noteVisitSuccess(교직원 id)
// - 판 끝(클리어·게임오버 모두): noteRunEnd({...})

export type BadgeId =
  | 'ontime'
  | 'nodamage'
  | 'gradeS'
  | 'scholar'
  | 'combo30'
  | 'bulk10'
  | 'visit1'
  | 'visitAll'
  | 'allStaff'
  | 'allStudents'
  | 'comeback'
  | 'hardClear';

export interface BadgeDef {
  id: BadgeId;
  name: string;
  /** 따는 조건 (배지 탭에 그대로 보여 준다) */
  desc: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'ontime', name: '정시 퇴근', desc: '교직원 모드에서 17:00 안에 퇴근' },
  { id: 'nodamage', name: '무사고 근무', desc: '한 스테이지(구역)를 피해 없이 끝내기' },
  { id: 'gradeS', name: '근무평정 S', desc: '교직원 모드에서 평정 S 받기' },
  { id: 'scholar', name: '장학금 대상자', desc: '학생 모드에서 모든 과목 A+로 졸업 (GPA 4.5)' },
  { id: 'combo30', name: '민원 처리 달인', desc: '연속 처리 30회' },
  { id: 'bulk10', name: '일괄 처리', desc: '필살기 한 번에 10명 이상 처리' },
  { id: 'visit1', name: '돌발 방문 해결', desc: '돌발 방문 결재판을 처음으로 다 채우기' },
  { id: 'visitAll', name: '손님맞이 완료', desc: '돌발 방문 6종 모두 성공 (교직원 6명 각각으로)' },
  { id: 'allStaff', name: '전 직원 퇴근', desc: '교직원 6명 모두로 퇴근 성공' },
  { id: 'allStudents', name: '다국어 졸업생', desc: '학생 6명 모두로 서류 제출 완료' },
  { id: 'comeback', name: '칠전팔기', desc: '이어하기를 쓰고 끝까지 클리어' },
  { id: 'hardClear', name: '고급 행정가', desc: '고급 난이도로 클리어 (어느 모드든)' },
];

const KEY = 'staffsmash.badges';

interface Store {
  /** 딴 배지 → 딴 시각(ms) */
  got: Partial<Record<BadgeId, number>>;
  /** 퇴근 성공한 교직원 id */
  staff: string[];
  /** 서류 제출 완료한 학생 id */
  student: string[];
  /** 돌발 방문을 성공한 교직원 id */
  visits: string[];
}

function load(): Store {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Store>;
    return {
      got: o.got && typeof o.got === 'object' ? o.got : {},
      staff: Array.isArray(o.staff) ? o.staff : [],
      student: Array.isArray(o.student) ? o.student : [],
      visits: Array.isArray(o.visits) ? o.visits : [],
    };
  } catch {
    return { got: {}, staff: [], student: [], visits: [] };
  }
}

function save(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장할 수 없는 브라우저: 이번 화면에서만 알림이 뜬다 */
  }
}

export function hasBadge(id: BadgeId): boolean {
  return load().got[id] !== undefined;
}

/** 배지 탭용: 12개 모두, 딴 시각(없으면 null) */
export function badgeList(): { def: BadgeDef; got: number | null }[] {
  const g = load().got;
  return BADGES.map((def) => ({ def, got: g[def.id] ?? null }));
}

/** 딴 배지 수 */
export function badgeCount(): number {
  const g = load().got;
  return BADGES.filter((b) => g[b.id] !== undefined).length;
}

/** 배지를 준다. 처음 딴 것이면 알림을 띄우고 true */
export function unlockBadge(id: BadgeId): boolean {
  const s = load();
  if (s.got[id] !== undefined) return false;
  s.got[id] = Date.now();
  save(s);
  const def = BADGES.find((b) => b.id === id);
  if (def) showToast(def.name);
  return true;
}

function addTo(list: 'staff' | 'student' | 'visits', id: string): string[] {
  const s = load();
  if (!s[list].includes(id)) {
    s[list].push(id);
    save(s);
  }
  return s[list];
}

const STAFF_IDS = HEROES.map((h) => h.id as string);
const STUDENT_IDS = STUDENT_HEROES.map((h) => h.id as string);

/** 연속 처리 수가 오를 때마다 불러도 된다 */
export function noteCombo(n: number): void {
  if (n >= 30) unlockBadge('combo30');
}

/** 필살기 한 번(발동~끝)에 처리한 잡몹 수 */
export function noteSpecialKills(n: number): void {
  if (n >= 10) unlockBadge('bulk10');
}

/** 스테이지(1인칭은 구역)를 받은 피해 0으로 끝냈을 때 */
export function noteStageNoDamage(): void {
  unlockBadge('nodamage');
}

/** 돌발 방문 결재판을 다 채웠을 때 (교직원 모드, 고른 교직원 id) */
export function noteVisitSuccess(staffHeroId: string): void {
  unlockBadge('visit1');
  const got = addTo('visits', staffHeroId);
  if (STAFF_IDS.every((id) => got.includes(id))) unlockBadge('visitAll');
}

export interface RunEnd {
  mode: 'staff' | 'student';
  heroId: string;
  /** 끝까지 깼는지 (교직원 퇴근 승인·학생 총장 승인) */
  cleared: boolean;
  /** 17:00 안에 끝냈는지 (run.ts onTime) */
  onTime: boolean;
  /** 깬 스테이지(구역)마다 받은 평정·학점 ('S'…'D', 'A+'…'F') */
  grades: string[];
  diff: 'easy' | 'normal' | 'hard';
  /** 이어하기를 썼는지 */
  continued: boolean;
}

/** 한 판이 끝났을 때 (클리어·게임오버 모두) 한 번 부른다 */
export function noteRunEnd(r: RunEnd): void {
  if (r.mode === 'staff') {
    if (r.grades.includes('S')) unlockBadge('gradeS');
    if (r.cleared) {
      if (r.onTime) unlockBadge('ontime');
      const got = addTo('staff', r.heroId);
      if (STAFF_IDS.every((id) => got.includes(id))) unlockBadge('allStaff');
    }
  } else if (r.cleared) {
    if (r.grades.length > 0 && r.grades.every((g) => g === 'A+')) unlockBadge('scholar');
    const got = addTo('student', r.heroId);
    if (STUDENT_IDS.every((id) => got.includes(id))) unlockBadge('allStudents');
  }
  if (r.cleared && r.continued) unlockBadge('comeback');
  if (r.cleared && r.diff === 'hard') unlockBadge('hardClear');
}

// ---------- 알림 (DOM) ----------

const CSS = `
#badgeToast { position: fixed; left: 50%; top: calc(58px + env(safe-area-inset-top)); z-index: 9999; pointer-events: none;
  transform: translate(-50%, -16px); opacity: 0; transition: opacity .25s, transform .25s;
  display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 10px; border: 2px solid #e0bb62; border-radius: 999px;
  background: rgba(0, 44, 82, .94); color: #fff; font: 700 15px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
  box-shadow: 0 6px 16px rgba(0,0,0,.35); white-space: nowrap; }
#badgeToast.on { opacity: 1; transform: translate(-50%, 0); }
#badgeToast i { display: inline-block; width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffe9a8, #e0bb62 60%, #b8913c);
  box-shadow: inset 0 0 0 2px #fff3c4; }
#badgeToast small { display: block; font-size: 11px; font-weight: 400; color: #e0bb62; }
`;

let toastEl: HTMLElement | null = null;
const queue: string[] = [];
let busy = false;

function ensureToast(): HTMLElement {
  if (!toastEl) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    toastEl = document.createElement('div');
    toastEl.id = 'badgeToast';
    toastEl.setAttribute('role', 'status');
  }
  // 2D는 전체 화면이 게임 상자(div)라 그 안에 붙여야 보인다
  const host = (document.fullscreenElement as HTMLElement | null) ?? document.body;
  if (toastEl.parentElement !== host) host.appendChild(toastEl);
  return toastEl;
}

function showToast(name: string): void {
  if (typeof document === 'undefined') return;
  queue.push(name);
  if (!busy) next();
}

function next(): void {
  const name = queue.shift();
  if (name === undefined) {
    busy = false;
    return;
  }
  busy = true;
  const el = ensureToast();
  el.innerHTML = `<i></i><span><small>배지 획득</small>${name.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)}</span>`;
  requestAnimationFrame(() => el.classList.add('on'));
  window.setTimeout(() => {
    el.classList.remove('on');
    window.setTimeout(next, 320);
  }, 2600);
}
