import server from './data/server.json';

// 닉네임 기록판 (PRD 13절). 온라인 저장소는 staffsmash0 계정의 Apps Script 웹앱이다.
// 주소(src/data/server.json의 recordsUrl)가 비어 있거나 응답이 없으면 이 기기에만 저장한다.

export type GameMode = 'staff' | 'student';

export interface RecordEntry {
  mode: GameMode;
  /** 빈 문자열 = 익명 (순위에는 나오지 않고 플레이 수에만 잡힌다) */
  nickname: string;
  stage: number;
  cleared: boolean;
  clockMin: number;
  elapsed: number;
  grades: string;
  hero: string;
  skill: string;
  version: string;
  ts: number;
}

export const VERSION = 'M3';
const URL = (server as { recordsUrl: string }).recordsUrl.trim();
const LOCAL_KEY = 'staffsmash.records';
const NICK_KEY = 'staffsmash.nickname';
const TIMEOUT_MS = 7000;

let lastSubmitted: RecordEntry | null = null;

export const onlineConfigured = (): boolean => URL.length > 0;

const BAD = [
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', '개새', '새끼', '지랄', '미친놈', '미친년',
  '꺼져', '닥쳐', '보지', '자지', '섹스', 'fuck', 'shit', 'bitch', 'sex',
];

export function checkNickname(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  const len = [...name].length;
  if (len < 2 || len > 8) return { ok: false, reason: '닉네임은 2~8자로 써 주세요' };
  const flat = name.toLowerCase().replace(/\s/g, '');
  if (BAD.some((b) => flat.includes(b))) return { ok: false, reason: '쓸 수 없는 말이 들어 있어요' };
  return { ok: true, name };
}

/** 순위: 도달 스테이지(클리어가 가장 위) → 퇴근 시각 빠른 순 → 걸린 시간 짧은 순 */
export function compareRecords(a: RecordEntry, b: RecordEntry): number {
  const sa = a.cleared ? 4 : a.stage;
  const sb = b.cleared ? 4 : b.stage;
  if (sa !== sb) return sb - sa;
  if (a.clockMin !== b.clockMin) return a.clockMin - b.clockMin;
  return a.elapsed - b.elapsed;
}

export function isMine(e: RecordEntry): boolean {
  return !!lastSubmitted && lastSubmitted.ts === e.ts && lastSubmitted.nickname === e.nickname;
}

function loadLocal(): RecordEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as RecordEntry[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(e: RecordEntry): void {
  try {
    const all = loadLocal();
    all.push(e);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-200)));
  } catch {
    // 저장소를 쓸 수 없는 브라우저(사생활 보호 모드 등)는 넘어간다
  }
}

export function lastNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberNickname(name: string): void {
  try {
    localStorage.setItem(NICK_KEY, name);
  } catch {
    // 무시
  }
}

function timeoutSignal(): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), TIMEOUT_MS);
  return c.signal;
}

/** 기록을 남긴다. 온라인 전송에 성공하면 true */
export async function submitRecord(e: RecordEntry): Promise<boolean> {
  lastSubmitted = e;
  saveLocal(e);
  if (e.nickname) rememberNickname(e.nickname);
  if (!URL) return false;
  try {
    // Apps Script는 리디렉션 뒤 응답을 주므로 no-cors로 보내고 결과는 읽지 않는다
    await fetch(URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(e),
      signal: timeoutSignal(),
    });
    return true;
  } catch {
    return false;
  }
}

export interface Board {
  entries: RecordEntry[];
  online: boolean;
  plays?: number;
  players?: number;
}

export async function fetchBoard(mode: GameMode): Promise<Board> {
  if (URL) {
    try {
      const r = await fetch(`${URL}?mode=${mode}`, { signal: timeoutSignal() });
      const j = (await r.json()) as { ok: boolean; entries: RecordEntry[]; plays: number; players: number };
      if (j.ok) {
        // 방금 남긴 기록이 아직 시트에 반영되지 않았으면 끼워 넣는다
        const entries = [...j.entries];
        if (lastSubmitted && lastSubmitted.nickname && !entries.some((x) => x.ts === lastSubmitted?.ts)) {
          entries.push(lastSubmitted);
        }
        entries.sort(compareRecords);
        return { entries: entries.slice(0, 20), online: true, plays: j.plays, players: j.players };
      }
    } catch {
      // 아래 로컬 기록으로
    }
  }
  const local = loadLocal()
    .filter((e) => e.mode === mode && e.nickname)
    .sort(compareRecords)
    .slice(0, 20);
  return { entries: local, online: false };
}
